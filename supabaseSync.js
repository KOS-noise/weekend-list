const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function emptyTasks() {
  return Object.fromEntries(DAY_KEYS.map((key) => [key, []]));
}

function cleanEnv(value) {
  return String(value || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

function normalizeSupabaseUrl(raw) {
  let url = cleanEnv(raw);
  if (!url) return '';

  // 프로젝트 ref만 넣은 경우 → https://xxxx.supabase.co
  if (!/^https?:\/\//i.test(url) && !url.includes('.')) {
    url = `https://${url}.supabase.co`;
  } else if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  return url.replace(/\/+$/, '');
}

function getConfig() {
  const url = normalizeSupabaseUrl(process.env.SUPABASE_URL);
  const key = cleanEnv(process.env.SUPABASE_ANON_KEY);
  const syncCode = cleanEnv(process.env.SYNC_CODE);
  return { url, key, syncCode };
}

function createSupabase() {
  const { url, key, syncCode } = getConfig();
  if (!url || !key || !syncCode) {
    return { client: null, syncCode: null, error: 'MISSING_ENV' };
  }
  if (!/^https?:\/\//i.test(url)) {
    return {
      client: null,
      syncCode: null,
      error: 'INVALID_URL (.env의 SUPABASE_URL은 https://프로젝트ID.supabase.co 형식이어야 합니다)',
    };
  }

  try {
    return {
      client: createClient(url, key),
      syncCode,
      error: null,
    };
  } catch (err) {
    return {
      client: null,
      syncCode: null,
      error: err.message || 'SUPABASE_CLIENT_ERROR',
    };
  }
}

function normalizeWeekPayload(note, taskRows) {
  const tasks = emptyTasks();
  (taskRows || []).forEach((row) => {
    if (!DAY_KEYS.includes(row.day)) return;
    tasks[row.day].push({
      id: row.id,
      content: row.content || '',
      is_done: Boolean(row.is_done),
      sort_order: row.sort_order ?? tasks[row.day].length,
    });
  });
  DAY_KEYS.forEach((day) => {
    tasks[day].sort((a, b) => a.sort_order - b.sort_order);
  });
  return { note: note || '', tasks };
}

async function loadWeek(weekKey) {
  const { client, syncCode, error } = createSupabase();
  if (error) {
    return { ok: false, error, data: { note: '', tasks: emptyTasks() } };
  }

  try {
    const { data: week, error: weekError } = await client
      .from('planner_weeks')
      .select('id, note')
      .eq('sync_code', syncCode)
      .eq('week_key', weekKey)
      .maybeSingle();

    if (weekError) {
      return { ok: false, error: weekError.message, data: { note: '', tasks: emptyTasks() } };
    }

    if (!week) {
      return { ok: true, data: { note: '', tasks: emptyTasks() } };
    }

    const { data: taskRows, error: taskError } = await client
      .from('planner_tasks')
      .select('id, day, content, is_done, sort_order')
      .eq('week_id', week.id)
      .order('sort_order', { ascending: true });

    if (taskError) {
      return {
        ok: false,
        error: taskError.message,
        data: { note: week.note || '', tasks: emptyTasks() },
      };
    }

    return { ok: true, data: normalizeWeekPayload(week.note, taskRows) };
  } catch (err) {
    return {
      ok: false,
      error: err.message || 'LOAD_FAILED',
      data: { note: '', tasks: emptyTasks() },
    };
  }
}

async function saveWeek(weekKey, payload) {
  const { client, syncCode, error } = createSupabase();
  if (error) {
    return { ok: false, error };
  }

  try {
    const note = payload?.note || '';
    const tasksByDay = payload?.tasks || emptyTasks();
    const now = new Date().toISOString();

    const { data: week, error: upsertError } = await client
      .from('planner_weeks')
      .upsert(
        {
          sync_code: syncCode,
          week_key: weekKey,
          note,
          updated_at: now,
        },
        { onConflict: 'sync_code,week_key' }
      )
      .select('id')
      .single();

    if (upsertError) {
      return { ok: false, error: upsertError.message };
    }

    const { error: deleteError } = await client
      .from('planner_tasks')
      .delete()
      .eq('week_id', week.id);

    if (deleteError) {
      return { ok: false, error: deleteError.message };
    }

    const rows = [];
    DAY_KEYS.forEach((day) => {
      const list = Array.isArray(tasksByDay[day]) ? tasksByDay[day] : [];
      list.forEach((task, index) => {
        const content = (task.content || '').trim();
        if (!content) return;
        rows.push({
          week_id: week.id,
          day,
          content,
          is_done: Boolean(task.is_done),
          sort_order: index,
          updated_at: now,
        });
      });
    });

    if (rows.length > 0) {
      const { error: insertError } = await client.from('planner_tasks').insert(rows);
      if (insertError) {
        return { ok: false, error: insertError.message };
      }
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'SAVE_FAILED' };
  }
}

module.exports = {
  DAY_KEYS,
  emptyTasks,
  loadWeek,
  saveWeek,
  getConfig,
};

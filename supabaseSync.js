const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function emptyTasks() {
  return Object.fromEntries(DAY_KEYS.map((key) => [key, []]));
}

function getConfig() {
  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_ANON_KEY || '').trim();
  const syncCode = (process.env.SYNC_CODE || '').trim();
  return { url, key, syncCode };
}

function createSupabase() {
  const { url, key, syncCode } = getConfig();
  if (!url || !key || !syncCode) {
    return { client: null, syncCode: null, error: 'MISSING_ENV' };
  }
  return {
    client: createClient(url, key),
    syncCode,
    error: null,
  };
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
    return { ok: false, error: taskError.message, data: { note: week.note || '', tasks: emptyTasks() } };
  }

  return { ok: true, data: normalizeWeekPayload(week.note, taskRows) };
}

async function saveWeek(weekKey, payload) {
  const { client, syncCode, error } = createSupabase();
  if (error) {
    return { ok: false, error };
  }

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
}

module.exports = {
  DAY_KEYS,
  emptyTasks,
  loadWeek,
  saveWeek,
  getConfig,
};

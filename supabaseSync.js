const path = require('path');
const { randomUUID } = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

// Electron(Node 20)에는 네이티브 WebSocket이 없어 polyfill 필요
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = ws;
}

// Electron/main에서 먼저 로드해도 안전하도록 여기서도 로드
require('dotenv').config({ path: path.join(__dirname, '.env') });

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

let saveQueue = Promise.resolve();

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
    return {
      client: null,
      syncCode: null,
      error: `MISSING_ENV (url:${Boolean(url)} key:${Boolean(key)} sync:${Boolean(syncCode)})`,
    };
  }
  if (!/^https?:\/\//i.test(url)) {
    return {
      client: null,
      syncCode: null,
      error: 'INVALID_URL',
    };
  }

  try {
    return {
      client: createClient(url, key, {
        realtime: {
          transport: ws,
        },
      }),
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

async function ensureWeekId(client, syncCode, weekKey, note, now) {
  const { data: existing, error: findError } = await client
    .from('planner_weeks')
    .select('id')
    .eq('sync_code', syncCode)
    .eq('week_key', weekKey)
    .maybeSingle();

  if (findError) {
    throw new Error(findError.message);
  }

  if (existing?.id) {
    const { error: updateError } = await client
      .from('planner_weeks')
      .update({ note, updated_at: now })
      .eq('id', existing.id);
    if (updateError) {
      throw new Error(updateError.message);
    }
    return existing.id;
  }

  const newId = randomUUID();
  const { data: inserted, error: insertWeekError } = await client
    .from('planner_weeks')
    .insert({
      id: newId,
      sync_code: syncCode,
      week_key: weekKey,
      note,
      updated_at: now,
    })
    .select('id')
    .single();

  if (insertWeekError) {
    throw new Error(insertWeekError.message);
  }
  return inserted.id;
}

function countContentfulTasks(tasksByDay) {
  if (!tasksByDay || typeof tasksByDay !== 'object') return 0;
  let count = 0;
  DAY_KEYS.forEach((day) => {
    const list = Array.isArray(tasksByDay[day]) ? tasksByDay[day] : [];
    list.forEach((task) => {
      if (String(task?.content || '').trim()) count += 1;
    });
  });
  return count;
}

function buildTaskRows(weekId, tasksByDay, now) {
  const rows = [];
  DAY_KEYS.forEach((day) => {
    const list = Array.isArray(tasksByDay[day]) ? tasksByDay[day] : [];
    list.forEach((task, index) => {
      const content = String(task?.content || '').trim();
      if (!content) return;
      rows.push({
        id: randomUUID(),
        week_id: weekId,
        day,
        content,
        is_done: Boolean(task.is_done),
        sort_order: Number.isFinite(task.sort_order) ? task.sort_order : index,
        created_at: now,
        updated_at: now,
      });
    });
  });
  return rows;
}

async function saveWeekUnlocked(weekKey, payload) {
  const { client, syncCode, error } = createSupabase();
  if (error) {
    return { ok: false, error };
  }

  try {
    const note = payload?.note || '';
    const tasksByDay = payload?.tasks || emptyTasks();
    const now = new Date().toISOString();
    const weekId = await ensureWeekId(client, syncCode, weekKey, note, now);
    const rows = buildTaskRows(weekId, tasksByDay, now);

    // 내용 있는 할 일이 0개면 note만 갱신하고 기존 tasks는 절대 지우지 않는다.
    // (빈 화면 자동저장이 클라우드 일정을 통째로 날리던 버그 방지)
    if (rows.length === 0) {
      return { ok: true, preservedTasks: true };
    }

    // 기존 할 일 id를 기억해 두고, 새 행 insert 성공 후에만 삭제
    const { data: oldTasks, error: oldError } = await client
      .from('planner_tasks')
      .select('id')
      .eq('week_id', weekId);

    if (oldError) {
      return { ok: false, error: oldError.message };
    }

    const { error: insertError } = await client.from('planner_tasks').insert(rows);
    if (insertError) {
      return { ok: false, error: insertError.message };
    }

    const oldIds = (oldTasks || []).map((t) => t.id).filter(Boolean);
    if (oldIds.length > 0) {
      const { error: deleteError } = await client
        .from('planner_tasks')
        .delete()
        .in('id', oldIds);
      if (deleteError) {
        return { ok: false, error: deleteError.message };
      }
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || 'SAVE_FAILED' };
  }
}

function saveWeek(weekKey, payload) {
  const run = saveQueue.then(() => saveWeekUnlocked(weekKey, payload));
  // 이전 실패가 다음 저장을 막지 않도록
  saveQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

module.exports = {
  DAY_KEYS,
  emptyTasks,
  countContentfulTasks,
  loadWeek,
  saveWeek,
  getConfig,
};

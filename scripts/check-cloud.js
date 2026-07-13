const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function clean(v) {
  return String(v || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

function normalizeUrl(raw) {
  let url = clean(raw);
  if (!url) return '';
  if (!/^https?:\/\//i.test(url) && !url.includes('.')) {
    url = `https://${url}.supabase.co`;
  } else if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, '');
}

(async () => {
  const url = normalizeUrl(process.env.SUPABASE_URL);
  const key = clean(process.env.SUPABASE_ANON_KEY);
  const sync = clean(process.env.SYNC_CODE);
  const sb = createClient(url, key);

  const { data: weeks, error } = await sb
    .from('planner_weeks')
    .select('id, week_key, note, updated_at')
    .eq('sync_code', sync)
    .order('week_key');

  if (error) {
    console.log('ERROR', error.message);
    process.exit(1);
  }

  console.log('WEEKS_COUNT', weeks.length);
  for (const w of weeks) {
    const { data: tasks } = await sb
      .from('planner_tasks')
      .select('day, content, is_done, sort_order')
      .eq('week_id', w.id)
      .order('day')
      .order('sort_order');
    console.log('---');
    console.log(`WEEK ${w.week_key} | tasks ${(tasks || []).length}`);
    for (const t of tasks || []) {
      console.log(` [${t.day}] ${t.is_done ? '[x]' : '[ ]'} ${t.content}`);
    }
  }
})().catch((e) => {
  console.log('FAIL', e.message);
  process.exit(1);
});

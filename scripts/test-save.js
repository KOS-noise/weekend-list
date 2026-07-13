const path = require('path');
const { saveWeek, loadWeek, getConfig } = require('../supabaseSync');

(async () => {
  const cfg = getConfig();
  console.log('configured', Boolean(cfg.url && cfg.key && cfg.syncCode));
  console.log('urlHost', cfg.url ? new URL(cfg.url).host : 'none');

  const weekKey = '2026-07-13';
  const loaded = await loadWeek(weekKey);
  console.log('load_ok', loaded.ok, loaded.error || '');
  const tasks = loaded.data?.tasks || {};
  let count = 0;
  Object.values(tasks).forEach((arr) => {
    count += (arr || []).filter((t) => (t.content || '').trim()).length;
  });
  console.log('loaded_tasks', count);

  // mutate one note slightly then save
  const payload = {
    note: (loaded.data?.note || '') + '',
    tasks,
  };
  // ensure at least one tiny change path: rewrite mon tasks as-is
  const result = await saveWeek(weekKey, payload);
  console.log('save_ok', result.ok);
  console.log('save_error', result.error || '');
})().catch((e) => {
  console.log('FAIL', e.stack || e.message);
  process.exit(1);
});

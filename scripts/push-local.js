const path = require('path');
const fs = require('fs');
const { saveWeek } = require('../supabaseSync');

const localPath = path.join(process.env.APPDATA || '', 'weekend-list', 'planner-data.json');

(async () => {
  if (!fs.existsSync(localPath)) {
    console.log('NO_LOCAL_CACHE');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(localPath, 'utf8'));
  const weeks = raw.weeks || {};
  const keys = Object.keys(weeks);
  console.log('PUSHING_WEEKS', keys.length);

  for (const weekKey of keys) {
    const result = await saveWeek(weekKey, weeks[weekKey]);
    console.log(weekKey, result.ok ? 'OK' : `FAIL ${result.error}`);
  }
})().catch((e) => {
  console.log('FAIL', e.message);
  process.exit(1);
});

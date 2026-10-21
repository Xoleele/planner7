// node tests/uso-app.cjs — registro de uso de Planner7 con reloj simulado, sin red.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tools = read('app-6-herramientas.js'), core = read('app-1-core.js');
let now = new Date('2026-10-21T10:00:00').getTime();
class Clock extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
const store = new Map();
let cloud = { preferences: { notes: { x: 1 } } }, cloudFails = false, upserts = 0;
const ctx = vm.createContext({
  Date: Clock, Math, JSON, Number, Object, Array, String, console,
  currentUser: { id: 'u1' }, statsDayCutoffTime: '04:00', document: { hidden: false },
  navigator: { onLine: true }, setTimeout: () => 1, clearTimeout: () => {},
  localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) },
  formatDate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  sb: { from: () => {
    const q = { select: () => q, eq: () => q,
      maybeSingle: async () => cloudFails ? { data: null, error: { message: 'offline' } } : { data: JSON.parse(JSON.stringify(cloud)), error: null },
      upsert: async row => { upserts++; cloud = { preferences: row.preferences }; return { error: null }; } };
    return q;
  } }
});
const start = tools.indexOf('const APP_USAGE_GAP_MS');
vm.runInContext(tools.slice(start, tools.indexOf('function setupAppUsageTracking')).replace(/^const /gm, 'var ').replace(/^let /gm, 'var '), ctx);
for (const name of ['parseStatsDayCutoff', 'getStatsTodayStr']) {
  const i = core.indexOf('function ' + name + '(');
  vm.runInContext(core.slice(i, core.indexOf('\n}', i) + 2), ctx);
}
const act = () => ctx.recordAppUsageAction();
const wait = s => { now += s * 1000; };
const minutes = day => ctx.appUsageMinutesForDay(day);

// Antes del inicio del registro: sin dato.
assert.equal(minutes('2026-10-21'), null);
// Clics cada 10 s durante 5 minutos → 5 min.
act(); for (let i = 0; i < 30; i++) { wait(10); act(); }
assert.equal(minutes('2026-10-21'), 5);
assert.equal(minutes('2026-10-20'), null); // antes del inicio
// Clics aislados cada 1 minuto → no suman.
wait(60); act(); wait(60); act(); wait(60); act();
assert.equal(minutes('2026-10-21'), 5);
// Cada 29 s también es racha: 10 acciones = 4 min 21 s → 4 min más.
wait(60); act(); for (let i = 0; i < 9; i++) { wait(29); act(); }
assert.equal(minutes('2026-10-21'), 9);
// Mirar sin hacer nada (40 s) corta la racha: no se suma.
wait(40); act();
assert.equal(minutes('2026-10-21'), 9);

// Hora límite 04:00: una racha de 03:50 a 04:10 se reparte entre dos días.
now = new Date('2026-10-22T03:50:00').getTime();
act(); for (let i = 0; i < 60; i++) { wait(20); act(); }
assert.equal(minutes('2026-10-21'), 19); // 9 + 10
assert.equal(minutes('2026-10-22'), 10);
ctx.saveAppUsageLocal();

(async () => {
  // Sincronización: otro dispositivo tiene 10:02–10:07 del 21 (se superpone con
  // 10:00–10:05 de este) y 15:00–15:10. Lo simultáneo se cuenta una vez.
  const t = s => new Date('2026-10-21T' + s).getTime();
  cloud.preferences.appUsage = { since: t('09:00:00'), intervals: [[t('10:02:00'), t('10:07:00')], [t('15:00:00'), t('15:10:00')]], totals: {} };
  await ctx.syncAppUsage();
  assert.equal(minutes('2026-10-21'), 19 + 2 + 10);
  assert.equal(cloud.preferences.notes.x, 1); // el resto de las preferencias se conserva
  assert.equal(upserts, 1);
  assert.equal(minutes('2026-10-20'), null); // el registro empezó el 21
  // Sin cambios no vuelve a escribir.
  await ctx.syncAppUsage();
  assert.equal(upserts, 1);
  // Si la nube no responde, no se escribe nada.
  cloudFails = true; wait(5); act(); wait(5); act();
  await ctx.syncAppUsage();
  assert.equal(upserts, 1);
  cloudFails = false;

  // Días antiguos pasan a totales sin cambiar el resultado.
  now = new Date('2026-11-05T12:00:00').getTime();
  const before = minutes('2026-10-21');
  await ctx.syncAppUsage();
  const saved = JSON.parse(store.get('app_usage_u1'));
  assert.ok(saved.totals['2026-10-21'] > 0);
  assert.ok(saved.intervals.every(([, end]) => end >= now - 7 * 86400000));
  assert.equal(minutes('2026-10-21'), before);
  console.log('Uso de Planner7 verificado: rachas, clics aislados, hora límite, dos dispositivos, nube caída y compactación.');
})().catch(e => { console.error(e); process.exit(1); });

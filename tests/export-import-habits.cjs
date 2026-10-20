// node tests/export-import-habits.cjs — Supabase y localStorage simulados, datos ficticios.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'app-4-estadisticas.js'), 'utf8');
const start = source.indexOf('const PLANNER7_DATA_FORMAT');
const end = source.indexOf('// Exportación antigua en CSV');
assert.ok(start >= 0 && end > start, 'bloque de exportar/importar');

const habits = { version: 2, hideEmptyDays: false, blocks: [
  { id: 'b1', startDate: '2026-10-01', endDate: null, habits: [{ id: 'h1' }, { id: 'h2' }], records: { '2026-10-02:h1': 1 } }
] };

// Supabase mínimo: tablas en memoria y consultas encadenables.
function fakeSb(db, { raceOnce = false } = {}) {
  let raced = false;
  return { from(table) {
    const q = { filters: [], op: 'select', payload: null, wantRows: false };
    const rows = () => (db[table] ||= []);
    const match = r => q.filters.every(([k, v]) => r[k] === v);
    const run = () => {
      if (q.op === 'select') return { data: rows().filter(match), error: null };
      if (q.op === 'insert') {
        if (rows().some(r => r.user_id === q.payload.user_id)) return { data: null, error: { code: '23505' } };
        rows().push({ ...q.payload }); return { data: null, error: null };
      }
      if (q.op === 'update') {
        if (raceOnce && !raced) { raced = true; rows().forEach(r => r.revision++); }
        const hit = rows().filter(match); hit.forEach(r => Object.assign(r, q.payload));
        return { data: hit.map(r => ({ revision: r.revision })), error: null };
      }
      if (q.op === 'upsert') { const i = rows().findIndex(r => r.user_id === q.payload.user_id);
        i >= 0 ? rows()[i] = q.payload : rows().push(q.payload); return { error: null }; }
      if (q.op === 'delete') { db[table] = rows().filter(r => !match(r)); return { error: null }; }
    };
    Object.assign(q, {
      select() { if (q.op !== 'select') q.wantRows = true; return q; },
      insert(p) { q.op = 'insert'; q.payload = p; return q; },
      update(p) { q.op = 'update'; q.payload = p; return q; },
      upsert(p) { q.op = 'upsert'; q.payload = p; return q; },
      delete() { q.op = 'delete'; return q; },
      eq(k, v) { q.filters.push([k, v]); return q; },
      maybeSingle() { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); },
      then(ok, ko) { return Promise.resolve(run()).then(ok, ko); }
    });
    return q;
  } };
}
function context(db, opts) {
  const store = new Map();
  const ctx = vm.createContext({
    currentUser: { id: 'u1', email: 'demo@example.com' }, sb: fakeSb(db, opts), tasks: [{ id: 't1' }], tags: [{ id: 'g', name: 'G' }],
    localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) },
    console, Date, JSON, Set, Number, Object, Array, Error, Promise
  });
  vm.runInContext(source.slice(start, end), ctx);
  return { ctx, store };
}

(async () => {
  // Validación: v1 sin hábitos, v2 con hábitos, hábitos inválidos.
  const { ctx } = context({});
  const base = { format: 'planner7-datos', tasks: [{ id: 't' }], tags: [{ id: 'g', name: 'G' }] };
  assert.equal(ctx.validateImportedUserData({ ...base, version: 1 }).habits, null);
  assert.deepEqual(ctx.validateImportedUserData({ ...base, version: 2, habits }).habits, habits);
  assert.equal(typeof ctx.validateImportedUserData({ ...base, version: 2, habits: { version: 2, blocks: [] } }), 'string');
  assert.equal(typeof ctx.validateImportedUserData({ ...base, version: 3 }), 'string');
  assert.equal(ctx.countHabits(habits), 2);

  // Exportación: nube por defecto; caché local si tiene cambios pendientes.
  const db = { habit_data: [{ user_id: 'u1', data: habits, revision: 4 }] };
  const a = context(db);
  assert.deepEqual(await a.ctx.getHabitDataForExport(), habits);
  const local = { ...habits, hideEmptyDays: true };
  a.store.set('planner7.habitos.v1:u1', JSON.stringify({ user_id: 'u1', data: local, revision: 4, pending: true }));
  assert.equal((await a.ctx.getHabitDataForExport()).hideEmptyDays, true);
  assert.equal(await context({}).ctx.getHabitDataForExport(), null);

  // Reemplazo: crea la fila, sube la revisión y reintenta si otro dispositivo guardó en medio.
  const empty = { habit_data: [] };
  assert.equal(await context(empty).ctx.replaceHabitDataInCloud('u1', habits), 1);
  assert.equal(empty.habit_data[0].revision, 1);
  assert.equal(await context(db).ctx.replaceHabitDataInCloud('u1', local), 5);
  assert.equal(db.habit_data[0].data.hideEmptyDays, true);
  const race = { habit_data: [{ user_id: 'u1', data: habits, revision: 7 }] };
  assert.equal(await context(race, { raceOnce: true }).ctx.replaceHabitDataInCloud('u1', local), 9);
  console.log('export-import-habits: OK');
})().catch(e => { console.error(e); process.exit(1); });

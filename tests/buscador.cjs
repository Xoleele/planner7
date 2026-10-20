// node tests/buscador.cjs — funciones reales del Buscador, datos ficticios, sin red.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function install(ctx, source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert(start >= 0, name);
  vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), ctx);
}
const TODAY = '2026-10-20'; // martes
const tasks = [
  { id: 'pasada', title: 'Reunión con Juan', date: '2026-10-05', startTime: '09:00', endTime: '10:00', tagId: 'work', completed: true },
  { id: 'futura', title: 'Juan – reunión de cierre', date: '2026-12-15', startTime: '11:00', endTime: '12:00', tagId: 'work' },
  { id: 'cancelada', title: 'Reunión cancelada', date: '2026-10-21', tagId: 'work', duration: 30 },
  { id: 'dentista', title: 'Dentista', date: '2026-10-27', startTime: '16:00', endTime: '17:00', tagId: 'health' },
  { id: 'gym', title: 'Gimnasio', date: '2026-10-01', startTime: '07:00', endTime: '08:00', tagId: 'health',
    recurrence: { enabled: true, days: [1] }, completedOccurrences: ['2026-10-05', '2026-10-12'] },
  { id: 'archivada', title: 'Idea: correr un maratón', date: '', tagId: 'health' },
  { id: 'sol', title: 'Solsticio', date: '2026-10-19', tagId: 'work', completed: true },
  { id: 'girasol', title: 'Girasol', date: '2026-10-19', tagId: 'work', completed: true }
];
const store = new Map();
const ctx = vm.createContext({
  tasks, tags: [{ id: 'work', name: 'Trabajo' }, { id: 'health', name: 'Salud' }],
  notes: { '2026-10-05': '# Reunión\nJuan pidió el presupuesto', '2027-01-03': 'Planificar año' },
  statsDayCutoffTime: '00:00', currentUser: { id: 'u1' },
  localStorage: { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) },
  Date, Math, JSON, Set, Map, Number, Object, Array, String,
  getStatsTodayStr: () => TODAY,
  formatDate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  checkTaskOccurrence: (task, date) => task.recurrence?.enabled
    ? task.recurrence.days.includes(date.getDay()) : task.date === ctx.formatDate(date)
});
const core = read('app-1-core.js'), calendar = read('app-2-calendario.js');
const stats = read('app-4-estadisticas.js'), search = read('app-6-herramientas.js');
install(ctx, core, 'parseStatsDayCutoff');
for (const name of ['getTaskTimeRange', 'getTaskDurationMinutes']) install(ctx, calendar, name);
vm.runInContext("var PLANNER7_HABIT_CACHE_PREFIX = 'planner7.habitos.v1:'; var BUSCADOR_FUTURE_DAYS = 30; var buscadorHabitCloud = null;", ctx);
for (const name of ['getRelativeDateString', 'getStatsDayOccurrences', 'isValidHabitDay', 'isValidHabitHistory']) install(ctx, stats, name);
for (const name of ['normalizeForSearch', 'dateInRange', 'countDaysInRange', 'buscadorMatchesQuery', 'buscadorTaskTexts',
  'buscadorPlainNote', 'buscadorNoteSnippet', 'readBuscadorHabitCache', 'getBuscadorHabitData', 'collectBuscadorNotes',
  'computeBuscadorStats', 'parseBuscadorQuery']) install(ctx, search, name);
// getBuscadorDateRange lee el DOM solo en 'custom'.
install(ctx, search, 'getBuscadorDateRange');

const q = text => JSON.parse(JSON.stringify(ctx.parseBuscadorQuery(text)));
assert.deepEqual(q('reunión  JUAN'), { groups: [['reunion', 'juan']], excludes: [], highlight: ['reunion', 'juan'] });
assert.deepEqual(q('gym | correr -lluvia'), { groups: [['gym'], ['correr']], excludes: ['lluvia'], highlight: ['gym', 'correr'] });
assert.deepEqual(q('"hola mundo" -"no esto"').groups, [['hola mundo']]);
assert.deepEqual(q('"hola mundo" -"no esto"').excludes, ['no esto']);
assert.deepEqual(q(' sol').groups, [[' sol']]);          // truco de espacios conservado
assert.deepEqual(q('e-mail').groups, [['e-mail']]);
assert.deepEqual(q('').groups, []);

const ids = res => Array.from(res.items.filter(i => i.task), i => i.task.id);
const run = (kw, period = 'all', opts = {}) => ctx.computeBuscadorStats(kw, period,
  opts.fields || { title: true, tag: true, desc: false }, opts.status || 'all', opts.archived ?? true,
  opts.include || { dayNotes: true, habitNotes: true });

// 1. Futuro: "Desde siempre" incluye lo que viene; "Próximos 30 días" solo lo que viene.
assert.deepEqual(ids(run('reunión juan')), ['pasada', 'futura']);   // cualquier orden
assert.deepEqual(ids(run('dentista', 'upcoming')), ['dentista']);
assert.deepEqual(ids(run('reunion', 'upcoming')), ['cancelada']);
assert.deepEqual(ids(run('reunion -cancelada')), ['pasada', 'futura']);
assert.deepEqual(ids(run('dentista | maratón')), ['dentista', 'archivada']); // archivada al final
// Repeticiones futuras de una recurrente: hasta 30 días desde hoy.
const gym = Array.from(run('gimnasio').items.filter(i => i.task), i => i.date);
assert.equal(gym[0], '2026-10-05');
assert.equal(gym.at(-1), '2026-11-16');
assert.ok(!gym.includes('2026-11-23'));
// "Esta semana" llega hasta el domingo; el % usa solo los días transcurridos.
const week = run('', 'week', { archived: false, include: {} });
assert.deepEqual(ids(week).sort(), ['cancelada', 'girasol', 'gym', 'sol']);
assert.equal(week.totalDays, 2);  // lunes 19 y martes 20
assert.equal(week.days, 1);       // el 21 (futuro) no cuenta en el %
// Estado.
assert.deepEqual(ids(run('gimnasio', 'last30', { status: 'completed' })), ['gym', 'gym']);
// Espacio inicial: palabras que empiezan por "sol".
assert.deepEqual(ids(run(' sol', 'all', { include: {} })), ['sol']);

// 5. Notas del día (incluso futuras) y de hábitos (también por el nombre del hábito).
const found = run('juan');
const day = found.items.find(i => i.note?.kind === 'day');
assert.equal(day.date, '2026-10-05');
assert.equal(day.note.text, 'Reunión · Juan pidió el presupuesto');
assert.equal(found.notes, 1);
assert.equal(found.repetitions, 2); // las notas no cuentan como repeticiones
assert.equal(run('planificar').items[0].date, '2027-01-03');
store.set('planner7.habitos.v1:u1', JSON.stringify({ user_id: 'u1', revision: 3, pending: false, data: { version: 2, blocks: [{
  id: 'b1', startDate: '2026-10-01', endDate: null, habits: [{ id: 'h1', name: 'Leer' }], records: {},
  notes: { '2026-10-06:h1': 'Terminé el libro de Juan', '2026-10-07:h1': 'Poco', '2026-10-08:hX': 'Hábito borrado' } }] } }));
const habitNotes = run('juan').items.filter(i => i.note?.kind === 'habit');
assert.equal(habitNotes.length, 1);
assert.equal(habitNotes[0].note.habitName, 'Leer');
assert.equal(run('leer', 'all', { include: { habitNotes: true } }).notes, 2); // nombre del hábito
assert.equal(run('juan', 'all', { include: {} }).notes, 0);
// La nube manda si tiene una revisión más nueva.
ctx.buscadorHabitCloud = { userId: 'u1', revision: 4, data: { version: 2, blocks: [{ id: 'b1', startDate: '2026-10-01', endDate: null,
  habits: [{ id: 'h1', name: 'Leer' }], records: {}, notes: {} }] } };
vm.runInContext('buscadorHabitCloud = this.buscadorHabitCloud', ctx);
assert.equal(run('juan').items.filter(i => i.note?.kind === 'habit').length, 0);
// Orden: en el día, tareas antes que notas.
const oct5 = Array.from(found.items.filter(i => i.date === '2026-10-05'), i => i.task ? i.task.id : i.note.kind);
assert.deepEqual(oct5, ['pasada', 'day']);
// Fragmento de una nota larga alrededor de la coincidencia.
const long = 'x'.repeat(300) + ' palabra ' + 'y'.repeat(300);
assert.match(ctx.buscadorNoteSnippet(long, ['palabra']), /^…x+ palabra y+…$/);
console.log('Buscador verificado: varias palabras, exclusión, "o", futuro, semana, estado, notas y notas de hábitos.');

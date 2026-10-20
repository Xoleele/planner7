// node tests/archivados-antiguedad.cjs — funciones reales, reloj fijo, sin red.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'app-6-herramientas.js'), 'utf8');
function install(ctx, name) {
  const start = source.indexOf('function ' + name + '(');
  assert(start >= 0, name);
  vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), ctx);
}
let now = '2026-10-20T10:00:00';
class Clock extends Date { constructor(...a) { super(...(a.length ? a : [now])); } }
const ctx = vm.createContext({
  Date: Clock, Math, Number, String, Map,
  formatDate: d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  getVisibleArchiveListId: () => null
});
vm.runInContext('var archiveStateById = null; var tasks = [];', ctx);
for (const name of ['resetArchiveAssignmentBaseline', 'syncArchiveListAssignments', 'taskIdCreationDate', 'archivedAgeText']) install(ctx, name);
const ms = date => new Date(date + 'T09:00:00').getTime();
const set = list => vm.runInContext('tasks = this.__t', Object.assign(ctx, { __t: list }));
const byId = id => vm.runInContext('tasks', ctx).find(t => t.id === id);
const sync = () => vm.runInContext('syncArchiveListAssignments()', ctx);

// Al cargar: las archivadas antiguas toman la fecha de creación de su id; las con fecha no guardan nada.
set([
  { id: `task-${ms('2026-07-10')}-1`, title: 'Antigua', date: '' },
  { id: `task-${ms('2026-09-01')}-2`, title: 'Con fecha', date: '2026-10-21' },
  { id: 'otra-sin-fecha', title: 'Id raro', date: '' }
]);
sync();
assert.equal(byId(`task-${ms('2026-07-10')}-1`).archivedAt, '2026-07-10');
assert.equal(byId(`task-${ms('2026-09-01')}-2`).archivedAt, undefined);
assert.equal(byId('otra-sin-fecha').archivedAt, '2026-10-20');
assert.equal(ctx.archivedAgeText(byId(`task-${ms('2026-07-10')}-1`)), 'Archivado hace 102 días');

// Un día después: tarea nueva archivada y tarea con fecha que se archiva → hoy.
now = '2026-10-21T08:00:00';
const list = vm.runInContext('tasks', ctx);
list.push({ id: `task-${ms('2026-10-21')}-3`, title: 'Nueva', date: '' });
byId(`task-${ms('2026-09-01')}-2`).date = '';
sync();
assert.equal(byId(`task-${ms('2026-10-21')}-3`).archivedAt, '2026-10-21');
assert.equal(byId(`task-${ms('2026-09-01')}-2`).archivedAt, '2026-10-21');
assert.equal(ctx.archivedAgeText(byId(`task-${ms('2026-10-21')}-3`)), 'Archivado hoy');

// Editarla no cambia el conteo.
now = '2026-10-22T08:00:00';
Object.assign(byId(`task-${ms('2026-07-10')}-1`), { title: 'Antigua editada', description: 'x' });
sync();
assert.equal(byId(`task-${ms('2026-07-10')}-1`).archivedAt, '2026-07-10');
assert.equal(ctx.archivedAgeText(byId(`task-${ms('2026-09-01')}-2`)), 'Archivado hace 1 día');

// Copia (id nuevo) de una archivada antigua → empieza hoy.
list.push({ ...byId(`task-${ms('2026-07-10')}-1`), id: `task-${ms('2026-10-22')}-4` });
sync();
assert.equal(byId(`task-${ms('2026-10-22')}-4`).archivedAt, '2026-10-22');

// Asignar fecha la saca de Archivados (se borra el dato); volver a archivar reinicia.
const antigua = byId(`task-${ms('2026-07-10')}-1`);
const snapshot = JSON.parse(JSON.stringify(vm.runInContext('tasks', ctx)));
antigua.date = '2026-10-23';
sync();
assert.equal(antigua.archivedAt, undefined);
now = '2026-10-25T08:00:00';
antigua.date = '';
sync();
assert.equal(antigua.archivedAt, '2026-10-25');

// Deshacer (vuelve el arreglo anterior con su fecha) conserva el conteo original.
set(snapshot);
sync();
assert.equal(byId(`task-${ms('2026-07-10')}-1`).archivedAt, '2026-07-10');
assert.equal(ctx.archivedAgeText(byId(`task-${ms('2026-07-10')}-1`)), 'Archivado hace 107 días');
console.log('Antigüedad en Archivados verificada: carga, nuevas, editar, copiar, fecha y deshacer.');

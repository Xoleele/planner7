// node tests/recortar.cjs — "Recortar" al soltar una tarea sobre otra en el horario.
// Funciones reales del arrastre, datos ficticios, sin red.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const cal = read('app-2-calendario.js'), tareas = read('app-3-tareas.js');
function install(ctx, source, name) {
  let start = source.indexOf('function ' + name + '(');
  assert(start >= 0, name);
  if (source.slice(start - 6, start) === 'async ') start -= 6;
  vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), ctx);
}
function setup(list, choice = 'trim') {
  const ctx = vm.createContext({
    structuredClone, Math, Date, String, Set, Number, JSON, Promise,
    tags: [{ id: 'g', visible: true }],
    CR_MIN_BLOCK_MIN: 10, TOLERANCIA_ADYACENCIA_MIN: 3,
    suppressNextCronogramaClick: false, setTimeout: () => {},
    renderCronograma() {}, pushToUndoStack() { ctx.undos = (ctx.undos || 0) + 1; }, saveTasksToStorage() { ctx.saved = true; },
    askCronogramaOverlap: async (byEnd, opts) => { ctx.asked = { byEnd, opts }; return choice; },
    findAdjacentAffectedTasks: () => [], openAdjacentTasksModal() {},
    checkTaskOccurrence: (task, date) => {
      const ds = ctx.formatDate(date);
      if (!task.recurrence?.enabled) return task.date === ds;
      return ds >= task.date && !(task.recurrence.exceptions || []).includes(ds);
    }
  });
  vm.runInContext('var tasks = this.__t;', Object.assign(ctx, { __t: list }));
  for (const name of ['formatDate', 'addDays', 'getTaskTimeRange', 'getVisibleTaskRangesForDate', 'snapStartAfterTaskBelow',
    'findTaskBelowStart', 'findTaskBelowEnd', 'snapStartBeforeTaskBelow', 'dateStrToDayIndex', 'hhmmToMinutes',
    'getTaskAbsoluteRange', 'absoluteMinutesToDateTime']) install(ctx, cal, name);
  for (const name of ['commitCronogramaDragResult', 'trimSegmentsUnder', 'findTasksToTrimUnderDrop', 'trimTasksUnderDropped']) install(ctx, tareas, name);
  return ctx;
}
const drop = async (ctx, id, date, startMin, durationMin) => {
  ctx.asked = null;
  const task = vm.runInContext('tasks', ctx).find(t => t.id === id);
  await ctx.commitCronogramaDragResult({ moved: true, task, sourceDate: task.date, targetColEl: { dataset: { date } }, newStartMin: startMin, durationMin });
};
const view = ctx => Array.from(vm.runInContext('tasks', ctx), t => [t.title, t.date, t.startTime, t.endTime, t.duration, t.description ?? '', !!t.alarm])
  .sort((a, b) => (a[1] + a[2]).localeCompare(b[1] + b[2]));
const B = (extra = {}) => ({ id: 'b', title: 'Trabajo', description: 'Notas', tagId: 'g', date: '2026-10-21', startTime: '09:00', endTime: '12:00', duration: 180, alarm: true, ...extra });
const D = (extra = {}) => ({ id: 'd', title: 'Llamada', tagId: 'g', date: '2026-10-20', startTime: '15:00', endTime: '16:00', duration: 60, ...extra });

(async () => {
  // Al medio: se divide en dos; solo el primer tramo conserva descripción y alarma.
  let ctx = setup([B(), D()]);
  await drop(ctx, 'd', '2026-10-21', 600, 60);
  assert.equal(ctx.asked.opts.canTrim, true);
  assert.deepEqual(view(ctx), [
    ['Trabajo', '2026-10-21', '09:00', '10:00', 60, 'Notas', true],
    ['Llamada', '2026-10-21', '10:00', '11:00', 60, '', false],
    ['Trabajo', '2026-10-21', '11:00', '12:00', 60, '', false]
  ]);
  assert.equal(ctx.undos, 1);
  assert.ok(ctx.saved);

  // Por la hora de fin: la de abajo pierde su comienzo y conserva la descripción.
  ctx = setup([B(), D({ duration: 90, endTime: '16:30' })]);
  await drop(ctx, 'd', '2026-10-21', 480, 90);
  assert.equal(ctx.asked.byEnd, true);
  assert.deepEqual(view(ctx)[1], ['Trabajo', '2026-10-21', '09:30', '12:00', 150, 'Notas', true]);

  // Soltada en el MISMO lugar sobre otra: Recortar también funciona.
  ctx = setup([B(), D({ date: '2026-10-21', startTime: '10:00', endTime: '11:00' })]);
  await drop(ctx, 'd', '2026-10-21', 600, 60);
  assert.equal(ctx.asked.opts.canTrim, true);
  assert.equal(view(ctx).length, 3);
  assert.deepEqual(view(ctx)[2], ['Trabajo', '2026-10-21', '11:00', '12:00', 60, '', false]);
  assert.equal(ctx.undos, 1);

  // Dos tareas debajo (inicio en una, fin en otra): se recortan ambas.
  ctx = setup([B({ endTime: '11:00', duration: 120 }),
    { id: 'c', title: 'Estudio', description: 'Cap. 3', tagId: 'g', date: '2026-10-21', startTime: '11:00', endTime: '13:00', duration: 120 }, D()]);
  await drop(ctx, 'd', '2026-10-21', 630, 60);
  assert.equal(ctx.asked.opts.multi, true);
  assert.equal(ctx.asked.opts.canTrim, true);
  assert.deepEqual(view(ctx), [
    ['Trabajo', '2026-10-21', '09:00', '10:30', 90, 'Notas', true],
    ['Llamada', '2026-10-21', '10:30', '11:30', 60, '', false],
    ['Estudio', '2026-10-21', '11:30', '13:00', 90, 'Cap. 3', false]
  ]);

  // Nunca se elimina por completo: la tarea tapada entera no se toca; las demás sí.
  ctx = setup([{ id: 'c', title: 'Corta', tagId: 'g', date: '2026-10-21', startTime: '10:15', endTime: '10:45', duration: 30 },
    B(), D({ duration: 120, endTime: '17:00' })]);
  await drop(ctx, 'd', '2026-10-21', 600, 120);
  const corta = vm.runInContext('tasks', ctx).find(t => t.id === 'c');
  assert.deepEqual([corta.startTime, corta.endTime], ['10:15', '10:45']);
  assert.deepEqual(view(ctx).find(v => v[0] === 'Trabajo'), ['Trabajo', '2026-10-21', '09:00', '10:00', 60, 'Notas', true]);

  // Si la única tarea de abajo quedaría vacía, Recortar no se ofrece.
  ctx = setup([{ id: 'c', title: 'Corta', tagId: 'g', date: '2026-10-21', startTime: '10:00', endTime: '10:30', duration: 30 }, D()]);
  await drop(ctx, 'd', '2026-10-21', 600, 60);
  assert.equal(ctx.asked.opts.canTrim, false);

  // Inicio adentro y fin afuera: solo queda el tramo anterior.
  ctx = setup([B(), D({ duration: 120, endTime: '17:00' })]);
  await drop(ctx, 'd', '2026-10-21', 660, 120);
  assert.deepEqual(view(ctx)[0], ['Trabajo', '2026-10-21', '09:00', '11:00', 120, 'Notas', true]);
  assert.equal(view(ctx).length, 2);

  // Cruza medianoche: el segundo tramo queda en el día siguiente.
  ctx = setup([B({ date: '2026-10-20', startTime: '22:00', endTime: '02:00', duration: 240 }), D()]);
  await drop(ctx, 'd', '2026-10-20', 1380, 60);
  assert.deepEqual(view(ctx), [
    ['Llamada', '2026-10-20', '23:00', '00:00', 60, '', false],
    ['Trabajo', '2026-10-20', '22:00', '23:00', 60, 'Notas', true],
    ['Trabajo', '2026-10-21', '00:00', '02:00', 120, '', false]
  ].sort((a, b) => (a[1] + a[2]).localeCompare(b[1] + b[2])));

  // Recurrente: solo esa ocurrencia; la serie queda igual con una excepción.
  ctx = setup([B({ date: '2026-10-01', recurrence: { enabled: true, exceptions: [] }, completedOccurrences: ['2026-10-21'] }), D()]);
  await drop(ctx, 'd', '2026-10-21', 600, 60);
  const all = vm.runInContext('tasks', ctx);
  const serie = all.find(t => t.id === 'b');
  assert.deepEqual(Array.from(serie.recurrence.exceptions), ['2026-10-21']);
  assert.equal(serie.startTime, '09:00'); assert.equal(serie.endTime, '12:00');
  const sueltas = all.filter(t => t.title === 'Trabajo' && t.id !== 'b').map(t => [t.date, t.startTime, t.endTime, t.description, t.recurrence, !!t.completed]);
  assert.deepEqual(sueltas.sort(), [['2026-10-21', '09:00', '10:00', 'Notas', null, true], ['2026-10-21', '11:00', '12:00', '', null, true]]);

  // Con otra opción no se recorta nada.
  ctx = setup([B(), D()], 'keep');
  await drop(ctx, 'd', '2026-10-21', 600, 60);
  assert.deepEqual(view(ctx)[0], ['Trabajo', '2026-10-21', '09:00', '12:00', 180, 'Notas', true]);
  console.log('Recortar verificado: al medio, mismo lugar, dos tareas, sin eliminar, por el fin, medianoche, recurrente y otras opciones.');
})().catch(e => { console.error(e); process.exit(1); });

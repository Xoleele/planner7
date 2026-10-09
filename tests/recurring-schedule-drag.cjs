// Ejecutar con node tests/recurring-schedule-drag.cjs (sin acceso a Supabase).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'app-3-tareas.js'), 'utf8');
const start = source.indexOf('async function commitCronogramaDragResult(');
const end = source.indexOf('\n}', start) + 2;
const commitSource = source.slice(start, end);

function setup(scope = 'all', { adjacent = false, recurring = true } = {}) {
  const task = {
    id: 'series', title: 'Trabajo', date: '2026-10-01',
    startTime: '09:00', endTime: '10:00', duration: 60,
    recurrence: recurring ? { enabled: true, unit: 'weekly', days: [4], exceptions: [] } : null,
    completedOccurrences: ['2026-10-08'], positionOverrides: { '2026-10-08': 20 }
  };
  const calls = { asks: 0, saves: 0, undos: 0, render: 0 };
  const neighbor = { id: 'neighbor' };
  const ctx = {
    tasks: [task, neighbor], pendingAdjacent: null, suppressNextCronogramaClick: false,
    structuredClone, setTimeout: () => {},
    getTaskTimeRange: t => {
      const minutes = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
      const startMin = minutes(t.startTime), rawEndMin = minutes(t.endTime);
      return { startMin, rawEndMin, endMin: rawEndMin, crossesMidnight: rawEndMin <= startMin };
    },
    snapStartAfterTaskBelow: (_, min) => min,
    getTaskAbsoluteRange: t => ({ date: t.date, start: t.startTime, end: t.endTime }),
    getAppDayIndex: d => d.getDay() || 7,
    askCronogramaRecurringScope: async () => { calls.asks++; return scope; },
    pushToUndoStack: () => { calls.undos++; calls.snapshot = structuredClone(ctx.tasks); },
    saveTasksToStorage: () => { calls.saves++; },
    renderCronograma: () => { calls.render++; },
    findAdjacentAffectedTasks: (t, old) => {
      calls.adjacency = { t, old };
      return adjacent ? [{ task: neighbor }, { task }] : [];
    },
    openAdjacentTasksModal: () => {},
    TOLERANCIA_ADYACENCIA_MIN: 1
  };
  vm.createContext(ctx);
  vm.runInContext(commitSource, ctx);
  const drag = {
    moved: true, task, sourceDate: '2026-10-08',
    targetColEl: { dataset: { date: '2026-10-08' } },
    newStartMin: 630, durationMin: 60
  };
  return { ctx, calls, task, drag };
}

(async () => {
  // El mismo diálogo debe resolver las dos opciones y cancelar por defecto.
  {
    const hidden = new Set(['hidden']);
    const modal = { classList: { add: name => hidden.add(name), remove: name => hidden.delete(name) } };
    const ctx = vm.createContext({ document: { getElementById: () => modal } });
    vm.runInContext('let pendingCronogramaScopeResolve = null; let pendingEditFormData = null; let pendingEditTaskId = null; let pendingEditOccurrenceDate = null;', ctx);
    for (const name of ['openEditRecurringModal', 'askCronogramaRecurringScope', 'closeEditRecurringModal']) {
      const a = source.indexOf('function ' + name + '(');
      vm.runInContext(source.slice(a, source.indexOf('\n}', a) + 2), ctx);
    }
    for (const scope of ['only-this', 'all', undefined]) {
      const choice = ctx.askCronogramaRecurringScope();
      assert.equal(hidden.has('hidden'), false);
      ctx.closeEditRecurringModal(scope);
      assert.equal(await choice, scope || 'cancel');
      assert.equal(hidden.has('hidden'), true);
    }
  }
  // Antes de elegir el alcance no debe mutarse ni persistirse la serie.
  {
    const { ctx, calls, task, drag } = setup();
    let resolve;
    ctx.askCronogramaRecurringScope = () => new Promise(r => { resolve = r; });
    const pending = ctx.commitCronogramaDragResult(drag);
    assert.equal(task.startTime, '09:00');
    assert.equal(calls.undos, 0);
    assert.equal(calls.saves, 0);
    resolve('cancel'); await pending;
    assert.equal(ctx.tasks.length, 2);
    assert.equal(calls.saves, 0);
  }
  // Solo esta ocurrencia: excluir el día correcto y conservar la serie y el completado.
  {
    const { ctx, calls, task, drag } = setup('only-this');
    await ctx.commitCronogramaDragResult(drag);
    const standalone = ctx.tasks[2];
    assert.equal(calls.asks, 1);
    assert.equal(calls.undos, 1);
    assert.equal(calls.snapshot[0].recurrence.exceptions.length, 0);
    assert.equal(calls.saves, 1);
    assert.equal(task.startTime, '09:00');
    assert.deepEqual(task.recurrence.exceptions, ['2026-10-08']);
    assert.equal(standalone.date, '2026-10-08');
    assert.equal(standalone.startTime, '10:30');
    assert.equal(standalone.endTime, '11:30');
    assert.equal(standalone.recurrence, null);
    assert.equal(standalone.completed, true);
    assert.equal(standalone.completedOccurrences, undefined);
    assert.equal(standalone.positionOverrides, undefined);
  }
  // Toda la serie: editar el horario sin desplazar su fecha inicial a la ocurrencia.
  {
    const { ctx, task, drag } = setup();
    await ctx.commitCronogramaDragResult(drag);
    assert.equal(task.date, '2026-10-01');
    assert.equal(task.startTime, '10:30');
    assert.equal(ctx.tasks.length, 2);
  }
  // Cambiar de día toda la serie actualiza el día semanal correspondiente.
  {
    const { ctx, task, drag } = setup();
    drag.targetColEl.dataset.date = '2026-10-09';
    await ctx.commitCronogramaDragResult(drag);
    assert.equal(task.date, '2026-10-01');
    assert.equal(task.recurrence.days.join(','), '5');
  }
  // Un cambio de duración también pide alcance aunque el inicio no cambie.
  {
    const { ctx, calls, task, drag } = setup();
    drag.newStartMin = 540; drag.durationMin = 90;
    await ctx.commitCronogramaDragResult(drag);
    assert.equal(calls.asks, 1);
    assert.equal(task.duration, 90);
    assert.equal(task.endTime, '10:30');
  }
  // Sin cambios, tareas simples y copias no deben preguntar.
  {
    const { ctx, calls, drag } = setup();
    drag.newStartMin = 540;
    await ctx.commitCronogramaDragResult(drag);
    assert.equal(calls.asks, 0); assert.equal(calls.undos, 0);
  }
  {
    const { ctx, calls, drag } = setup('all', { recurring: false });
    await ctx.commitCronogramaDragResult(drag);
    assert.equal(calls.asks, 0); assert.equal(calls.saves, 1);
  }
  {
    const { ctx, calls, task, drag } = setup();
    drag.copy = true;
    await ctx.commitCronogramaDragResult(drag);
    assert.equal(calls.asks, 0); assert.equal(task.startTime, '09:00');
    assert.equal(ctx.tasks[2].recurrence, null);
  }
  // Cancelar el aviso de adyacentes revierte también la separación o las reglas.
  for (const scope of ['only-this', 'all']) {
    const { ctx, calls, task, drag } = setup(scope, { adjacent: true });
    drag.targetColEl.dataset.date = '2026-10-09';
    await ctx.commitCronogramaDragResult(drag);
    assert.equal(calls.saves, 0);
    assert.equal(ctx.pendingAdjacent.affectations.length, 1);
    assert.equal(calls.adjacency.old.date, '2026-10-08');
    ctx.pendingAdjacent.restore();
    assert.equal(ctx.tasks.length, 2);
    assert.equal(task.startTime, '09:00');
    assert.equal(task.date, '2026-10-01');
    assert.deepEqual(task.recurrence.days, [4]);
    assert.deepEqual(task.recurrence.exceptions, []);
  }
  console.log('Arrastre recurrente verificado: alcance, cancelación, duración, fechas, completado y adyacentes.');
})().catch(error => { console.error(error); process.exitCode = 1; });

// node tests/recurring-following.cjs — sin red ni acceso a Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const calendar = fs.readFileSync(path.join(__dirname, '..', 'app-2-calendario.js'), 'utf8');
const editor = fs.readFileSync(path.join(__dirname, '..', 'app-3-tareas.js'), 'utf8');
function install(ctx, source, name) {
  let start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  if (source.slice(start - 6, start) === 'async ') start -= 6;
  vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), ctx);
}
function setup(overrides = {}) {
  const task = { id: 'original', title: 'Antes', date: '2026-10-05', startTime: '09:00', endTime: '10:00', duration: 60,
    recurrence: { enabled: true, unit: 'weekly', interval: 1, days: [1, 3, 5], endType: 'never', exceptions: [] },
    completedOccurrences: ['2026-10-05', '2026-10-12'], positionOverrides: { '2026-10-05': 10, '2026-10-12': 30 }, ...overrides };
  const calls = { saved: 0, snapshots: [] };
  const ctx = vm.createContext({ tasks: [task], structuredClone, Date, console,
    formatDate: d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    getMondayOf: d => { const result = new Date(d); result.setDate(result.getDate() - ((result.getDay()+6)%7)); return result; },
    saveTasksToStorage: () => calls.saved++, renderWeeklyCalendar: () => {}, renderCronograma: () => {},
    pushToUndoStack: () => calls.snapshots.push(structuredClone(ctx.tasks)),
    adjustPositionForModifiedTime: () => {}, pendingCompleteState: null,
    applyPendingCompleteState: (t, date, completed) => { if (completed) (t.completedOccurrences ||= []).push(date); },
    getDragAfterElement: () => null, sortDayTasks: () => {}, setEffectivePosition: () => {},
    resolveTimedReorderOnDrop: () => true,
    getTaskTimeRange: t => { const min = time => Number(time.slice(0,2))*60+Number(time.slice(3));
      const startMin = min(t.startTime), rawEndMin = min(t.endTime);
      return { startMin, rawEndMin, endMin: rawEndMin, crossesMidnight: rawEndMin <= startMin }; },
    snapStartAfterTaskBelow: (_, min) => min, getTaskAbsoluteRange: t => ({date:t.date}),
    askCronogramaRecurringScope: async () => 'following', findAdjacentAffectedTasks: () => [],
    openAdjacentTasksModal: () => {}, TOLERANCIA_ADYACENCIA_MIN: 1, pendingAdjacent: null,
    suppressNextCronogramaClick: false, setTimeout: () => {} });
  for (const name of ['getAppDayIndex', 'hasEarlierRecurringOccurrence', 'prepareRecurringSplit',
    'matchesRecurrenceRulePattern', 'checkTaskOccurrence', 'countOccurrencesInRange', 'executeMoveTask']) install(ctx, calendar, name);
  for (const name of ['applyTaskChanges', 'commitCronogramaDragResult']) install(ctx, editor, name);
  const occurs = (t, date) => ctx.checkTaskOccurrence(t, new Date(date+'T00:00:00'));
  return { ctx, task, calls, occurs };
}

(async () => {
  // La opción depende de apariciones reales anteriores, no solo de la fecha base.
  {
    const {ctx, task} = setup();
    assert.equal(ctx.hasEarlierRecurringOccurrence(task, '2026-10-05'), false);
    assert.equal(ctx.hasEarlierRecurringOccurrence(task, '2026-10-07'), true);
    task.recurrence.exceptions = ['2026-10-05'];
    assert.equal(ctx.hasEarlierRecurringOccurrence(task, '2026-10-07'), false);
    task.date = '2026-10-04'; task.recurrence.days = [1];
    assert.equal(ctx.hasEarlierRecurringOccurrence(task, '2026-10-05'), false);
  }
  // Editar título y hora preserva el tramo anterior y distribuye su estado.
  {
    const {ctx, task, calls, occurs} = setup();
    ctx.applyTaskChanges('following', { ...structuredClone(task), title:'Después', startTime:'11:00', endTime:'12:00' }, task.id, '2026-10-12');
    const future = ctx.tasks[1];
    assert.equal(task.title, 'Antes'); assert.equal(task.startTime, '09:00');
    assert.equal(occurs(task, '2026-10-09'), true); assert.equal(occurs(task,'2026-10-12'),false);
    assert.equal(future.title,'Después'); assert.equal(future.date,'2026-10-12');
    assert.equal(occurs(future,'2026-10-09'),false); assert.equal(occurs(future,'2026-10-12'),true);
    assert.equal(task.completedOccurrences.join(','),'2026-10-05');
    assert.equal(future.completedOccurrences.join(','),'2026-10-12');
    assert.equal(Object.keys(future.positionOverrides).join(','),'2026-10-12');
    assert.equal(calls.snapshots[0].length,1); assert.equal(calls.saved,1);
  }
  // Semanas alternas: cortar dentro de una semana no cambia el ciclo original.
  {
    const {ctx, task, occurs} = setup({recurrence:{enabled:true,unit:'weekly',interval:2,days:[1,3,5],endType:'count',endCount:9,exceptions:['2026-10-07','2026-10-23']}});
    const split = ctx.prepareRecurringSplit(task,'2026-10-09');
    assert.equal(split.future.recurrence.endCount,7);
    assert.equal(occurs(split.future,'2026-10-12'),false);
    assert.equal(occurs(split.future,'2026-10-19'),true);
    assert.equal(occurs(split.future,'2026-10-23'),false);
    assert.equal(split.past.recurrence.exceptions.join(','),'2026-10-07');
    assert.equal(split.future.recurrence.exceptions.join(','),'2026-10-23');
    assert.equal(occurs(split.future,'2026-11-02'),true);
    assert.equal(occurs(split.future,'2026-11-04'),true);
    assert.equal(occurs(split.future,'2026-11-06'),true);
    assert.equal(occurs(split.future,'2026-11-16'),false);
    // La edición del formulario conserva el número de repeticiones restantes.
    ctx.applyTaskChanges('following', {...structuredClone(task),title:'Nuevo'},task.id,'2026-10-09');
    assert.equal(ctx.tasks[1].recurrence.endCount,7);
  }
  // Mensual/anual conservan el ciclo y la fecha final cuando solo cambia la hora.
  for (const [unit, date, cut, next, skipped] of [
    ['monthly','2026-01-31','2026-03-31','2026-05-31','2026-04-30'],
    ['yearly','2020-02-29','2024-02-29','2028-02-29','2025-02-28']]) {
    const {ctx,task,occurs} = setup({date,recurrence:{enabled:true,unit,interval:unit==='monthly'?2:1,endType:'date',endDate:'2030-12-31',exceptions:[]}});
    const {future,past} = ctx.prepareRecurringSplit(task,cut);
    assert.equal(occurs(past,cut),false); assert.equal(occurs(future,cut),true);
    assert.equal(occurs(future,next),true); assert.equal(occurs(future,skipped),false);
    assert.equal(future.recurrence.endDate,'2030-12-31');
  }
  // Dividir de nuevo y desactivar la repetición conserva los tramos anteriores.
  {
    const {ctx,task,occurs} = setup({recurrence:{enabled:true,unit:'weekly',interval:2,days:[1,3,5],endType:'never',exceptions:[]}});
    ctx.applyTaskChanges('following',{...structuredClone(task),title:'Segundo'},task.id,'2026-10-09');
    const second = ctx.tasks[1];
    ctx.applyTaskChanges('following',{...structuredClone(second),title:'Tercero'},second.id,'2026-10-21');
    const third = ctx.tasks[2];
    assert.equal(occurs(second,'2026-10-19'),true); assert.equal(occurs(second,'2026-10-21'),false);
    assert.equal(occurs(third,'2026-10-21'),true); assert.equal(occurs(third,'2026-10-26'),false);
    ctx.applyTaskChanges('following',{...structuredClone(third),title:'Última',recurrence:null},third.id,'2026-11-02');
    assert.equal(occurs(third,'2026-10-23'),true); assert.equal(occurs(third,'2026-11-02'),false);
    assert.equal(occurs(ctx.tasks[3],'2026-11-02'),true); assert.equal(occurs(ctx.tasks[3],'2026-11-04'),false);
  }
  // Arrastrar en lista sustituye el día solo desde la aparición seleccionada.
  for (const valid of [true,false]) {
    const {ctx,task,calls,occurs} = setup(); const original = structuredClone(task);
    ctx.resolveTimedReorderOnDrop = () => valid;
    ctx.executeMoveTask('following',{taskId:task.id,sourceDateStr:'2026-10-14',targetDateStr:'2026-10-15',targetColumnContainer:{},clientY:0});
    if (!valid) { assert.deepEqual(task,original); assert.equal(ctx.tasks.length,1); assert.equal(calls.saved,0); continue; }
    const future = ctx.tasks[1];
    assert.equal(occurs(task,'2026-10-07'),true); assert.equal(occurs(task,'2026-10-14'),false);
    assert.equal(future.recurrence.days.join(','),'1,4,5');
    assert.equal(occurs(future,'2026-10-15'),true); assert.equal(occurs(future,'2026-10-21'),false);
    assert.deepEqual(calls.snapshots[0][0],original);
  }
  // Cronograma: cambio de día/hora, deshacer y cancelación de adyacentes.
  for (const adjacent of [true,false]) {
    const {ctx,task,calls,occurs} = setup(); const original = structuredClone(task);
    if (adjacent) ctx.findAdjacentAffectedTasks = () => [{task:{id:'neighbor'}}];
    const drag = {task,sourceDate:'2026-10-14',moved:true,targetColEl:{dataset:{date:'2026-10-15'}},newStartMin:660,durationMin:60};
    await ctx.commitCronogramaDragResult(drag);
    assert.equal(task.startTime,'09:00'); assert.equal(ctx.tasks[1].startTime,'11:00');
    assert.equal(occurs(task,'2026-10-07'),true); assert.equal(occurs(task,'2026-10-14'),false);
    assert.equal(ctx.tasks[1].recurrence.days.join(','),'1,4,5');
    assert.deepEqual(calls.snapshots[0][0],original);
    if (adjacent) { assert.equal(calls.saved,0); ctx.pendingAdjacent.restore(); assert.equal(ctx.tasks.length,1); assert.deepEqual(task,original); }
    else assert.equal(calls.saved,1);
  }
  // Visibilidad de la opción al abrir desde distintos contextos.
  {
    const {ctx,task} = setup(); let hidden;
    ctx.pendingEditTaskId = task.id; ctx.pendingEditOccurrenceDate = '2026-10-05';
    ctx.document = {getElementById:id => id==='edit-following-btn'
      ? {classList:{toggle:(_,value)=>{hidden=value;}}} : {classList:{remove:()=>{}}}};
    install(ctx,editor,'openEditRecurringModal');
    ctx.openEditRecurringModal(); assert.equal(hidden,true);
    ctx.openEditRecurringModal(task,'2026-10-12'); assert.equal(hidden,false);
  }
  console.log('Esta y las siguientes: edición, lista, cronograma, ciclos, límites, historial, visibilidad y cancelación verificados.');
})().catch(error => { console.error(error); process.exitCode=1; });

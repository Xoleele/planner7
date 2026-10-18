// Funciones reales, datos ficticios y reloj fijo; sin acceso a la red.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function install(ctx, source, name) {
  let start = source.indexOf('function ' + name + '(');
  assert(start >= 0, name);
  if (source.slice(start - 6, start) === 'async ') start -= 6;
  vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), ctx);
}
function setup({startTime = '09:00', endTime = '10:00', now = '10:30:30', scope = 'all', recurrence} = {}) {
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : ['2026-10-12T' + now])); }
  }
  const task = {id:'a', title:'Trabajo', description:'Notas', tagId:'default', date:'2026-10-05',
    startTime, endTime, duration:60, completed:true, position:10, recurrence};
  const calls = {saves:0, undos:[], renders:0, alarms:0, asks:0};
  const ctx = vm.createContext({tasks:[task], tags:[{id:'default'}], Date:Clock, structuredClone,
    CR_MIN_BLOCK_MIN:5, line:true, mobile:false,
    document:{getElementById:() => ctx.line ? {closest:() => ({dataset:{date:'2026-10-12'}})} : null},
    isMobile:() => ctx.mobile, isTaskHiddenByActivityIsolation:t => !!t?.hidden,
    formatDate:d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    addDays:(d,n) => {const result=new Clock(d); result.setDate(result.getDate()+n); return result;},
    getMondayOf:d => {const result=new Clock(d); result.setDate(result.getDate()-((result.getDay()+6)%7)); return result;},
    getEffectivePosition:(t,date) => t.positionOverrides?.[date] ?? t.position,
    pushToUndoStack:() => calls.undos.push(structuredClone(ctx.tasks)),
    saveTasksToStorage:() => calls.saves++, renderWeeklyCalendar:() => calls.renders++, refreshAlarms:() => calls.alarms++,
    askCronogramaRecurringScope:async () => {calls.asks++; return scope;}
  });
  const calendar = read('app-2-calendario.js');
  for (const name of ['getTaskTimeRange','getVisibleTaskRangesForDate','checkTaskOccurrence','matchesRecurrenceRulePattern',
    'getAppDayIndex','countOccurrencesInRange','hasEarlierRecurringOccurrence','prepareRecurringSplit']) install(ctx, calendar, name);
  for (const name of ['getCronogramaStretchTiming','stretchCronogramaTask']) install(ctx, read('app-3-tareas.js'), name);
  const neighbor = (id,startTime,endTime,extra={}) => ctx.tasks.push({id,date:'2026-10-12',startTime,endTime,tagId:'default',...extra});
  return {ctx,task,calls,neighbor};
}
const series = {enabled:true,unit:'weekly',interval:1,days:[1],exceptions:[]};
(async () => {
  // Primero ahora; el siguiente clic lo salta y llega a la tarea más cercana.
  {
    const {ctx,task,calls,neighbor} = setup();
    neighbor('far','12:00','13:00'); neighbor('next','11:00','11:30');
    await ctx.stretchCronogramaTask(task,'2026-10-12',1);
    assert.equal(task.endTime,'10:31'); assert.equal(task.duration,91);
    await ctx.stretchCronogramaTask(task,'2026-10-12',1);
    assert.equal(task.endTime,'11:00'); assert.equal(task.duration,120);
    assert.equal(await ctx.stretchCronogramaTask(task,'2026-10-12',1),false);
    assert.equal(calls.saves,2); assert.equal(calls.undos.length,2); assert.equal(calls.alarms,2);
    assert.equal(task.startTime,'09:00'); assert.equal(task.description,'Notas'); assert.equal(task.completed,true);
    assert.equal(calls.undos[0][0].endTime,'10:00');
  }
  {
    const {ctx,task,neighbor} = setup({startTime:'11:00',endTime:'12:00'});
    neighbor('prev','08:00','09:00'); neighbor('far','06:00','07:00');
    await ctx.stretchCronogramaTask(task,'2026-10-12',-1);
    assert.equal(task.startTime,'10:31'); assert.equal(task.endTime,'12:00');
    await ctx.stretchCronogramaTask(task,'2026-10-12',-1);
    assert.equal(task.startTime,'09:00'); assert.equal(task.duration,180);
    assert.equal(await ctx.stretchCronogramaTask(task,'2026-10-12',-1),false);
  }
  // Sin límites, con contacto o solapamiento: nunca atraviesa otra tarea.
  for (const direction of [-1,1]) {
    const {ctx,task,calls,neighbor} = setup(); ctx.line=false;
    assert.equal(await ctx.stretchCronogramaTask(task,'2026-10-12',direction),false);
    neighbor('touch',direction<0?'08:00':'10:00',direction<0?'09:00':'11:00');
    neighbor('far',direction<0?'06:00':'12:00',direction<0?'07:00':'13:00');
    assert.equal(await ctx.stretchCronogramaTask(task,'2026-10-12',direction),false);
    ctx.tasks[1].startTime='08:30'; ctx.tasks[1].endTime='10:30';
    assert.equal(await ctx.stretchCronogramaTask(task,'2026-10-12',direction),false);
    assert.equal(calls.saves,0); assert.equal(calls.undos.length,0);
  }
  // El margen inclusivo de un minuto solo afecta a la línea, no a las tareas.
  for (const [edge,direction] of [['10:29',1],['10:30',1],['10:31',-1]]) {
    const {ctx,task,neighbor} = setup({startTime:direction<0?edge:'09:00',endTime:direction>0?edge:'12:00',now:'10:30:00'});
    neighbor('next','11:00','11:30'); neighbor('prev','08:00','09:00');
    await ctx.stretchCronogramaTask(task,'2026-10-12',direction);
    assert.equal(direction<0?task.startTime:task.endTime,direction<0?'09:00':'11:00');
  }
  {
    const {ctx,task,neighbor} = setup(); ctx.line=false;
    neighbor('tiny','10:10','10:12'); neighbor('hidden','10:15','10:45',{hidden:true});
    ctx.tags.push({id:'off',visible:false}); neighbor('off','10:20','10:40',{tagId:'off'});
    neighbor('next','10:01','11:00');
    await ctx.stretchCronogramaTask(task,'2026-10-12',1);
    assert.equal(task.endTime,'10:01'); assert.equal(task.duration,61);
  }
  // La cola de ayer y el borde final de una tarea nocturna usan el día correcto.
  {
    const {ctx,task,neighbor} = setup({startTime:'02:00',endTime:'03:00'}); ctx.line=false;
    neighbor('tail','23:00','01:00',{date:'2026-10-11'});
    await ctx.stretchCronogramaTask(task,'2026-10-12',-1);
    assert.equal(task.startTime,'01:00'); assert.equal(task.duration,120);
  }
  {
    const {ctx,task,neighbor} = setup({startTime:'23:00',endTime:'01:00'}); ctx.line=false;
    neighbor('next','02:00','03:00',{date:'2026-10-13'});
    await ctx.stretchCronogramaTask(task,'2026-10-12',1);
    assert.equal(task.endTime,'02:00'); assert.equal(task.duration,180);
  }
  // La línea móvil solo limita la tarjeta de hoy.
  {
    const {ctx,task,calls} = setup(); ctx.mobile=true;
    assert.equal(await ctx.stretchCronogramaTask(task,'2026-10-13',1),false);
    assert.equal(calls.saves,0);
  }
  for (const scope of ['all','only-this','following','cancel']) {
    const {ctx,task,calls,neighbor} = setup({recurrence:structuredClone(series),scope});
    task.completedOccurrences=['2026-10-12']; task.positionOverrides={'2026-10-12':40};
    neighbor('next','11:00','12:00'); ctx.line=false;
    const before=structuredClone(ctx.tasks);
    const target=await ctx.stretchCronogramaTask(task,'2026-10-12',1);
    assert.equal(calls.asks,1);
    if (scope==='cancel') {assert.equal(target,false); assert.deepEqual(ctx.tasks,before); assert.equal(calls.saves,0); continue;}
    assert.equal(target.endTime,'11:00'); assert.equal(target.duration,120);
    assert.deepEqual(calls.undos[0],before);
    if (scope==='all') assert.equal(target,task);
    else {
      assert.equal(task.endTime,'10:00'); assert.equal(target.date,'2026-10-12');
      if (scope==='only-this') {
        assert.equal(task.recurrence.exceptions[0],'2026-10-12'); assert.equal(target.recurrence,null);
        assert.equal(target.completed,true); assert.equal(target.position,40);
      } else {assert.equal(task.recurrence.endDate,'2026-10-11'); assert.equal(target.recurrence.enabled,true);}
    }
  }
  // Revalidar si el usuario borra la tarea o cambia el hueco con el diálogo abierto.
  {
    const {ctx,task,calls,neighbor}=setup({recurrence:structuredClone(series)}); ctx.line=false;
    neighbor('next','11:00','12:00');
    ctx.askCronogramaRecurringScope=async()=>{ctx.tasks=[];return 'all';};
    assert.equal(await ctx.stretchCronogramaTask(task,'2026-10-12',1),false);
    assert.equal(calls.saves,0);
  }
  console.log('Ampliar tareas: ambos bordes, ahora ±1 min, límites, ocultas, medianoche, recurrentes y deshacer verificados.');
})().catch(error=>{console.error(error);process.exitCode=1;});

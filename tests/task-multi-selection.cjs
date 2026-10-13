// node tests/task-multi-selection.cjs — datos locales, sin acceso a Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'app-9-seleccion.js'), 'utf8');
function setup() {
  const tasks = [
    {id:'a',title:'A',date:'2026-10-12',startTime:'09:00',endTime:'10:00',duration:60,position:0},
    {id:'b',title:'B',date:'2026-10-13',startTime:'11:00',endTime:'12:30',duration:90,position:10},
    {id:'r',title:'Serie',date:'2026-10-05',startTime:'14:00',endTime:'15:00',duration:60,
      recurrence:{enabled:true,unit:'weekly',days:[1,3,5],exceptions:[]},completedOccurrences:['2026-10-12'],positionOverrides:{'2026-10-12':20}},
    {id:'archived',title:'Archivada',date:'',duration:30,position:20}
  ];
  const calls={undos:[],saved:0};
  const ctx=vm.createContext({tasks,structuredClone,Date,window:{addEventListener:()=>{}},
    document:{querySelectorAll:()=>[],getElementById:()=>null,body:{classList:{toggle:()=>{},remove:()=>{}}}},
    formatDate:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    getTaskTimeRange:t=>{if (!t.startTime || !t.endTime) return null;const min=s=>Number(s.slice(0,2))*60+Number(s.slice(3));const startMin=min(t.startTime),rawEndMin=min(t.endTime);return {startMin,rawEndMin,crossesMidnight:rawEndMin<=startMin};},
    pushToUndoStack:()=>calls.undos.push(structuredClone(ctx.tasks)),saveTasksToStorage:()=>calls.saved++,
    renderWeeklyCalendar:()=>{},renderBriefcaseTasks:()=>{},getDragAfterElement:()=>null,
    getEffectivePosition:(task,date)=>task.positionOverrides?.[date]??task.position??0,
    checkTaskOccurrence:(t,d)=>{const date=ctx.formatDate(d);return t.recurrence?.enabled ? date>=t.date && t.recurrence.days.includes(d.getDay()||7) && !t.recurrence.exceptions.includes(date) : t.date===date;},
    sortDayTasks:list=>list.sort((a,b)=>(a.position||0)-(b.position||0)),setEffectivePosition:(task,date,pos)=>{if(task.recurrence?.enabled){(task.positionOverrides||={})[date]=pos;}else task.position=pos;},
    resolveTimedReorderOnDrop:()=>true,compareArchivedTasks:(a,b)=>(a.position||0)-(b.position||0),
    renderCronograma:()=>{},getTaskDurationMinutes:t=>t.duration});
  vm.runInContext(source,ctx);
  return {ctx,calls};
}
const entries=[{id:'a',date:'2026-10-12'},{id:'b',date:'2026-10-13'}];
{
  const {ctx,calls}=setup();const before=structuredClone(ctx.tasks);
  const plan=ctx.planTaskSelectionChange(entries,entries[0],'2026-10-14');
  assert.deepEqual(ctx.tasks,before);assert.equal(calls.undos.length,0);
  assert.equal(plan.tasks[0].date,'2026-10-14');assert.equal(plan.tasks[1].date,'2026-10-15');
  assert.equal(plan.tasks[0].startTime,'09:00');assert.equal(plan.tasks[1].startTime,'11:00');
  ctx.commitTaskSelectionPlan(plan);assert.equal(calls.undos.length,1);assert.equal(calls.saved,1);
  assert.deepEqual(calls.undos[0],before);
}
{
  const {ctx}=setup();const plan=ctx.planTaskSelectionChange(entries,entries[0],'2026-10-14',{timeDelta:60});
  assert.equal(plan.tasks[0].startTime,'10:00');assert.equal(plan.tasks[1].startTime,'12:00');
  assert.equal(plan.tasks[1].endTime,'13:30');assert.equal(plan.tasks[1].duration,90);
}
{
  const {ctx}=setup();const plan=ctx.planTaskSelectionChange(entries,entries[0],'2026-10-12',{timeDelta:-600});
  assert.equal(plan.tasks[0].date,'2026-10-11');assert.equal(plan.tasks[0].startTime,'23:00');assert.equal(plan.tasks[0].endTime,'00:00');
  assert.equal(plan.tasks[1].date,'2026-10-13');assert.equal(plan.tasks[1].startTime,'01:00');
  assert.equal(ctx.taskSelectionDayDelta('2026-09-05','2026-09-07'),2);
  assert.equal(ctx.taskSelectionShiftDate('2026-09-05',2),'2026-09-07');
}
for(const copy of [false,true]) {
  const {ctx}=setup();const selected=[{id:'r',date:'2026-10-12'},{id:'r',date:'2026-10-14'}];
  const plan=ctx.planTaskSelectionChange(selected,selected[0],'2026-10-13',{copy});
  const series=plan.tasks.find(t=>t.id==='r');const copies=plan.selection.map(entry=>plan.tasks.find(t=>t.id===entry.id));
  assert.equal(series.recurrence.exceptions.join(','),copy?'':'2026-10-12,2026-10-14');
  assert.equal(copies[0].date,'2026-10-13');assert.equal(copies[1].date,'2026-10-15');
  assert.equal(copies[0].recurrence,null);assert.equal(copies[0].completed,true);assert.equal(copies[1].completed,false);
  assert.equal(copies[0].positionOverrides,undefined);assert.equal(copies[0].completedOccurrences,undefined);
  assert.notEqual(copies[0].id,copies[1].id);assert.equal(ctx.tasks[2].recurrence.exceptions.length,0);
}
{
  const {ctx}=setup();const selected=[{id:'r',date:'2026-10-12'},{id:'r',date:'2026-10-14'}];
  const plan=ctx.planTaskSelectionChange(selected,selected[0],'2026-10-12');
  assert.equal(plan.tasks.length,4);assert.equal(plan.tasks[2].date,'2026-10-05');
  assert.equal(plan.tasks[2].recurrence.exceptions.length,0);
  assert.equal(plan.selection.map(entry=>entry.date).join(','),'2026-10-12,2026-10-14');
}
{
  const {ctx}=setup();const plan=ctx.planTaskSelectionChange(entries,entries[0],'2026-10-15',{copy:true});
  assert.equal(plan.tasks.length,6);assert.equal(plan.tasks[0].date,'2026-10-12');assert.equal(plan.tasks[1].date,'2026-10-13');
  assert.equal(plan.tasks[4].date,'2026-10-15');assert.equal(plan.tasks[5].date,'2026-10-16');
}
{
  const {ctx}=setup();const selected=[...entries,{id:'r',date:'2026-10-12'}];
  const plan=ctx.planTaskSelectionChange(selected,selected[0],'',{remove:true});
  assert.equal(plan.tasks.some(t=>t.id==='a'||t.id==='b'),false);assert.equal(plan.selection.length,0);
  assert.equal(plan.tasks.find(t=>t.id==='r').recurrence.exceptions.join(','),'2026-10-12');
  assert.equal(plan.tasks.find(t=>t.id==='r').recurrence.days.join(','),'1,3,5');
}
{
  const {ctx}=setup();const selected=[entries[0],{id:'r',date:'2026-10-12'}];
  const plan=ctx.planTaskSelectionChange(selected,selected[0],'',{archive:true});
  plan.selection.forEach(entry=>{const task=plan.tasks.find(t=>t.id===entry.id);assert.equal(task.date,'');assert.equal(task.startTime,null);assert.equal(task.endTime,null);assert.equal(task.duration,60);});
}
{
  const {ctx}=setup();ctx.toggleTaskSelection('a','2026-10-12');ctx.toggleTaskSelection('r','2026-10-12');ctx.toggleTaskSelection('r','2026-10-14');
  assert.equal(ctx.getTaskSelectionDragEntries('a','2026-10-12').length,3);
  assert.equal(ctx.getTaskSelectionDragEntries('b','2026-10-13').length,0);
  ctx.toggleTaskSelection('r','2026-10-12');assert.equal(ctx.getTaskSelectionDragEntries('r','2026-10-14').length,2);
  ctx.clearTaskSelection();assert.equal(ctx.getTaskSelectionDragEntries('a','2026-10-12').length,0);
}
{
  const {ctx,calls}=setup();ctx.resolveTimedReorderOnDrop=()=>false;
  ctx.moveTaskSelectionToDate(entries,entries[0],'2026-10-14',{},0,false);
  assert.equal(calls.undos.length,0);assert.equal(calls.saved,0);assert.equal(ctx.tasks[0].date,'2026-10-12');
}
{
  const {ctx}=setup();ctx.tasks[1].date='2026-10-12';
  ctx.tasks = ctx.tasks.filter(task => task.id !== 'r');
  ctx.tasks.push({id:'c',title:'C',date:'2026-10-12',position:20});
  const selected=[{id:'a',date:'2026-10-12'},{id:'b',date:'2026-10-12'}];
  const mockCard=(id,top)=>({dataset:{id,occurrenceDate:'2026-10-12'},getBoundingClientRect:()=>({top,height:60})});
  const container={querySelectorAll:()=>[mockCard('b',220),mockCard('c',350)]};
  ctx.moveTaskSelectionToDate(selected,selected[0],'2026-10-12',container,200,false);
  assert.equal(ctx.tasks.find(t=>t.id==='a').position,0);assert.equal(ctx.tasks.find(t=>t.id==='b').position,10);
  assert.equal(ctx.tasks.find(t=>t.id==='c').position,20);
}
// La vista previa y el guardado deben coincidir, incluyendo fechas y recortes de medianoche.
for (const timeDelta of [-600, 0, 60, 1000]) {
  const {ctx}=setup();
  const selected=[...entries,{id:'r',date:'2026-10-14'},{id:'archived',date:''}];
  const preview=ctx.projectTaskSelectionSchedule(selected,entries[0],'2026-10-13',timeDelta,0);
  const plan=ctx.planTaskSelectionChange(selected,entries[0],'2026-10-13',{timeDelta});
  preview.forEach((item,index)=>{
    const result=plan.tasks.find(task=>task.id===plan.selection[index].id);
    assert.equal(item.task.date,plan.selection[index].date);
    assert.equal(item.task.startTime,result.startTime);assert.equal(item.task.endTime,result.endTime);
    assert.equal(item.duration,result.duration);
  });
  assert.equal(ctx.tasks[0].date,'2026-10-12');
}
console.log('Selección múltiple: movimiento, copia, eliminación, recurrencia, horarios, vista previa, archivos, cancelación y deshacer verificados.');

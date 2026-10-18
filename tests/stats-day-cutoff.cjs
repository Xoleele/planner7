// Agrupación estadística real con fechas y tareas ficticias, sin acceso a la red.
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
const tasks = [
  {id:'evening', date:'2026-10-12', startTime:'22:00', endTime:'02:00', tagId:'work', completed:true},
  {id:'early', date:'2026-10-13', startTime:'01:00', endTime:'03:00', tagId:'work', completed:false},
  {id:'boundary', date:'2026-10-13', startTime:'04:00', endTime:'05:00', tagId:'work', completed:true},
  {id:'no-time', date:'2026-10-13', duration:30, tagId:'work', completed:true},
  {id:'no-duration', date:'2026-10-13', startTime:'02:00', tagId:'work', completed:true},
  {id:'series', date:'2026-10-12', startTime:'03:00', endTime:'05:00', tagId:'habit',
    recurrence:{enabled:true}, completedOccurrences:['2026-10-13']}
];
const ctx = vm.createContext({tasks, tags:[{id:'work',visible:true},{id:'habit',visible:true}],
  statsDayCutoffTime:'00:00', generalStatsHabitTag:'work',
  Date, Math,
  formatDate:d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
  checkTaskOccurrence:(task,date)=> task.recurrence?.enabled
    ? ['2026-10-12','2026-10-13'].includes(ctx.formatDate(date))
    : task.date===ctx.formatDate(date),
  habitSelectionHasTag:id=>id===ctx.generalStatsHabitTag
});
const core=read('app-1-core.js'),calendar=read('app-2-calendario.js'),stats=read('app-4-estadisticas.js');
for(const name of ['parseStatsDayCutoff','getStatsTodayStr','getDurationForDay']) install(ctx,core,name);
for(const name of ['getTaskTimeRange','getTaskDurationMinutes']) install(ctx,calendar,name);
for(const name of ['getRelativeDateString','getStatsDayOccurrences','habitDoneOnDate','heatmapDayMinutes']) install(ctx,stats,name);
const occurrences=date=>Array.from(ctx.getStatsDayOccurrences(date));
const sum=(date,id)=>occurrences(date).filter(o=>o.task.id===id).reduce((n,o)=>n+o.mins,0);

assert.equal(ctx.parseStatsDayCutoff('00:00'),0);
assert.equal(ctx.parseStatsDayCutoff('04:30'),270);
assert.equal(ctx.parseStatsDayCutoff('24:00'),null);
assert.equal(ctx.getStatsTodayStr(new Date('2026-10-13T01:59:00')), '2026-10-13');
assert.equal(sum('2026-10-12','evening'),240); // el valor previo por defecto
assert.equal(sum('2026-10-13','evening'),0);
assert.equal(ctx.getDurationForDay('2026-10-13',true),210); // 60+30+120, sin cambio por defecto

ctx.statsDayCutoffTime='04:00';
assert.equal(ctx.getStatsTodayStr(new Date('2026-10-13T03:59:00')),'2026-10-12');
assert.equal(ctx.getStatsTodayStr(new Date('2026-10-13T04:00:00')),'2026-10-13');
assert.equal(sum('2026-10-12','evening'),240);
assert.equal(sum('2026-10-12','early'),120);
assert.equal(sum('2026-10-13','early'),0);
assert.equal(sum('2026-10-12','boundary'),0);
assert.equal(sum('2026-10-13','boundary'),60);
assert.equal(sum('2026-10-12','series'),120); // tramo del 12 y tramo temprano del 13
assert.equal(sum('2026-10-13','series'),60); // el 13 recibe su propio tramo posterior
assert.equal(ctx.getDurationForDay('2026-10-12',false),180); // temprano + serie pendiente del 12
assert.equal(ctx.getStatsDayOccurrences('2026-10-12',true).find(o=>o.task.id==='no-duration').occurrenceDate,'2026-10-13');
assert.equal(ctx.habitDoneOnDate('2026-10-12'),true); // work completado del 12
const heat=Array.from(ctx.heatmapDayMinutes('2026-10-12'));
assert.equal(heat[22],60);assert.equal(heat[23],60);
assert.equal(heat[1],120); // evening + early, ambos en el día estadístico 12
assert.equal(heat[4],0);   // 04:00 ya pertenece al 13

let details;
Object.assign(ctx, {getHabitSelectionInfo:()=>({label:'Trabajo'}),
  openStatsDetailPanel:(title,sections)=>{details={title,sections};},
  taskResultsDateLabel:date=>date});
for(const name of ['openStatsChartDetail','openStatsCellDetail']) install(ctx,stats,name);
ctx.openStatsCellDetail('2026-10-12',1);
assert.deepEqual(Array.from(details.sections[0].occurrences, o=>o.dateStr).sort(),['2026-10-12','2026-10-13']);
ctx.openStatsChartDetail({name:'Trabajo',occurrences:occurrences('2026-10-12')},'2026-10-12');
assert.equal(details.sections[0].occurrences.find(o=>o.task.id==='early').dateStr,'2026-10-13');

const dateBefore=tasks.map(t=>[t.date,t.startTime,t.endTime,t.duration]);
const search=read('app-6-herramientas.js');
Object.assign(ctx, {getBuscadorDateRange:()=>({from:'2026-10-12',to:'2026-10-12'}),
  countDaysInRange:()=>1, normalizeForSearch:text=>(text||'').toLowerCase(),
  buscadorTextMatches:(text,kw)=>(text||'').toLowerCase().includes(kw)});
install(ctx,search,'computeBuscadorStats');
const found=ctx.computeBuscadorStats('', 'custom', {title:true}, 'all');
assert.equal(found.totalMinutes,480);
assert.equal(found.days,1);
assert.equal(found.repetitions,5); // serie del 12 y del 13, ambas tocan el día estadístico
assert.equal(found.items.find(item=>item.task.id==='early').date,'2026-10-13');
ctx.statsDayCutoffTime='06:00';
assert.equal(sum('2026-10-12','boundary'),60);
assert.deepEqual(tasks.map(t=>[t.date,t.startTime,t.endTime,t.duration]),dateBefore);
console.log('Hora límite verificada: medianoche, corte personalizado, duración repartida, recurrencias y tareas sin horario.');

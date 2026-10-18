// Datos ficticios; sin red ni acceso a Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function install(ctx, source, name) {
  let start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  if (source.slice(start - 6, start) === 'async ') start -= 6;
  vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), ctx);
}
function setup(overrides = {}, scope = 'all') {
  const task = { id: 'a', title: 'Trabajo', description: 'Conservar notas', tagId: 'default',
    date: '2026-10-05', startTime: '09:00', endTime: '10:00', duration: 60,
    completed: true, position: 10, ...overrides };
  const calls = { snapshots: [], saved: 0, rendered: 0, alarms: 0, asks: 0 };
  const ctx = vm.createContext({ tasks: [task], structuredClone, Date,
    formatDate: d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,
    getMondayOf: d => { const result = new Date(d); result.setDate(result.getDate()-((result.getDay()+6)%7)); return result; },
    getEffectivePosition: (task, date) => task.positionOverrides?.[date] ?? task.position,
    pushToUndoStack: () => calls.snapshots.push(structuredClone(ctx.tasks)),
    saveTasksToStorage: () => calls.saved++, renderWeeklyCalendar: () => calls.rendered++,
    refreshAlarms: () => calls.alarms++,
    askCronogramaRecurringScope: async () => { calls.asks++; return scope; }
  });
  const calendar = read('app-2-calendario.js');
  for (const name of ['getAppDayIndex', 'hasEarlierRecurringOccurrence', 'prepareRecurringSplit',
    'matchesRecurrenceRulePattern', 'checkTaskOccurrence', 'countOccurrencesInRange']) install(ctx, calendar, name);
  install(ctx, read('app-3-tareas.js'), 'clearTaskTiming');
  return { ctx, task, calls };
}
const series = {
  recurrence: { enabled: true, unit: 'weekly', interval: 1, days: [1], exceptions: [] },
  completedOccurrences: ['2026-10-05', '2026-10-12'], positionOverrides: { '2026-10-12': 40 }
};
const cleared = task => [task.startTime, task.endTime, task.duration].every(value => value === null);
(async () => {
  for (const timing of [{}, {startTime:null}, {endTime:null}, {startTime:null,endTime:null},
    {startTime:null,endTime:'10:00',duration:null}, {startTime:'09:00',endTime:null,duration:null}, {date:''}]) {
    const {ctx,task,calls} = setup(timing);
    const before = structuredClone(task);
    assert.equal(await ctx.clearTaskTiming(task, task.date), task);
    assert(cleared(task));
    for (const key of ['title','description','date','tagId','completed','position']) assert.equal(task[key],before[key]);
    assert.equal(calls.saved,1); assert.equal(calls.rendered,1); assert.equal(calls.alarms,1);
    assert.deepEqual(calls.snapshots[0],[before]);
    ctx.tasks = structuredClone(calls.snapshots[0]); // mismo estado que restaura Deshacer
    assert.deepEqual(ctx.tasks[0],before);
  }
  {
    const {ctx,task,calls} = setup({startTime:null,endTime:null,duration:null});
    assert.equal(await ctx.clearTaskTiming(task),false);
    assert.equal(calls.saved,0); assert.equal(calls.snapshots.length,0);
    ctx.tasks = [];
    assert.equal(await ctx.clearTaskTiming(task),false);
  }
  for (const scope of ['all','only-this','following']) {
    const {ctx,task,calls} = setup(structuredClone(series),scope);
    const before = structuredClone(task);
    assert.ok(await ctx.clearTaskTiming(task,'2026-10-12'));
    assert.equal(calls.asks,1); assert.equal(calls.saved,1); assert.equal(calls.snapshots.length,1);
    assert.deepEqual(calls.snapshots[0],[before]);
    if (scope === 'all') {
      assert(cleared(task)); assert.deepEqual(task.recurrence,before.recurrence);
      assert.deepEqual(task.completedOccurrences,before.completedOccurrences);
    } else {
      assert.equal(task.startTime,'09:00'); assert(cleared(ctx.tasks[1]));
      assert.equal(ctx.tasks[1].date,'2026-10-12');
      if (scope === 'only-this') {
        assert.equal(task.recurrence.exceptions.join(','),'2026-10-12');
        assert.equal(ctx.tasks[1].recurrence,null); assert.equal(ctx.tasks[1].completed,true);
        assert.equal(ctx.tasks[1].position,40);
      } else {
        assert.equal(task.recurrence.endDate,'2026-10-11');
        assert.equal(ctx.tasks[1].completedOccurrences.join(','),'2026-10-12');
        assert.equal(ctx.tasks[1].recurrence.enabled,true);
      }
    }
  }
  {
    const {ctx,task,calls} = setup(structuredClone(series));
    const before = structuredClone(task);
    let resolve;
    ctx.askCronogramaRecurringScope = () => new Promise(done => { resolve=done; });
    const pending = ctx.clearTaskTiming(task,'2026-10-12');
    assert.deepEqual(task,before); assert.equal(calls.snapshots.length,0);
    resolve('cancel'); assert.equal(await pending,false);
    assert.deepEqual(task,before); assert.equal(calls.saved,0);
    ctx.askCronogramaRecurringScope = async () => { ctx.tasks=[]; return 'all'; };
    assert.equal(await ctx.clearTaskTiming(task,'2026-10-12'),false);
    assert.equal(calls.saved,0);
  }
  console.log('Alt+clic: campos parciales, archivadas, datos conservados, deshacer y los tres alcances recurrentes verificados.');
})().catch(error => { console.error(error); process.exitCode=1; });

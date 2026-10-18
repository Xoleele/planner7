// NODE_PATH con Playwright; interfaz aislada con datos ficticios.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
function extract(source, name) {
  let start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name);
  if (source.slice(start-6,start) === 'async ') start -= 6;
  return source.slice(start, source.indexOf('\n}', start)+2);
}
(async () => {
  const browser = await chromium.launch({channel:'msedge',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1100,height:800}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>route.abort());
    await page.setContent(`<style>${read('style.css')}</style><style>
      body{display:block!important;padding:24px;overflow:auto!important;}
      #list{display:flex;gap:20px}.task-card{width:250px}
      #cronograma-grid{position:relative;display:block!important;height:200px;margin-top:40px}
      .cr-task-block{width:250px;position:absolute}
    </style><div id="list"></div><div id="cronograma-grid"></div>`);
    await page.evaluate(()=>{
      window.tasks=[{id:'a',title:'Alt lista',date:'2026-10-12',startTime:'09:00',endTime:'10:00',duration:60,tagId:'default'},
        {id:'b',title:'Alt horario',date:'2026-10-12',startTime:'11:00',endTime:'12:30',duration:90,tagId:'default',completed:true},
        {id:'c',title:'Archivada',date:'',duration:30,tagId:'default'}];
      window.tags=[{id:'default',color:{bg:'#247caf',text:'#fff',border:'#247caf'}}];
      window.isMobile=()=>false;window.isTaskHiddenByActivityIsolation=()=>false;
      window.handleDragEnd=window.handleTouchStart=window.startCronogramaTouch=window.attachCheckboxLongPressTimer=()=>{};
      window.preventClick=false;window.taskPlacement=null;window.suppressNextCronogramaClick=false;window.crDrag=null;
      window.CR_MIN_BLOCK_MIN=5;window.opened=0;window.openTaskModal=()=>opened++;
      window.snapshots=[];window.saved=0;window.pushToUndoStack=()=>snapshots.push(structuredClone(tasks));
      window.saveTasksToStorage=()=>saved++;window.refreshAlarms=()=>{};
      window.minutesToReadable=m=>`${m} min`;
      window.renderWeeklyCalendar=()=>{
        const list=document.getElementById('list');list.innerHTML='';
        tasks.forEach(task=>list.appendChild(createTaskCard(task,task.date)));
        const grid=document.getElementById('cronograma-grid');grid.innerHTML='';
        const task=tasks[1];
        if(task.startTime && task.endTime) grid.appendChild(buildCronogramaBlock(0,90,task.title,'',true,tags[0],task,task.date,false));
      };
    });
    const calendar=read('app-2-calendario.js'),editor=read('app-3-tareas.js');
    for(const name of ['getTaskTimeRange','getTaskDurationMinutes','buildCronogramaBlock'])
      await page.addScriptTag({content:extract(calendar,name)});
    for(const name of ['clearTaskTiming','createTaskCard','formatTaskTimeText','formatTaskDuration','startCronogramaDrag','handleDragStart'])
      await page.addScriptTag({content:extract(editor,name)});
    await page.addScriptTag({content:read('app-9-seleccion.js')});
    await page.evaluate(()=>{setupTaskMultiSelection();renderWeeklyCalendar();});
    const card=id=>page.locator(`#list .task-card[data-id="${id}"]`);
    await card('a').click({modifiers:['Alt','Control']});
    assert.deepEqual(await page.evaluate(()=>[tasks[0].startTime,tasks[0].endTime,tasks[0].duration]),[null,null,null]);
    assert.equal(await page.evaluate(()=>opened),0);assert.equal(await page.evaluate(()=>saved),1);
    assert.equal(await page.locator('.task-multi-selected').count(),0);
    assert.equal(await card('a').locator('.task-card-time').count(),0);
    await card('a').click({modifiers:['Alt']});assert.equal(await page.evaluate(()=>saved),1);
    const block=page.locator('.cr-task-block[data-task-id="b"]');
    await block.click({modifiers:['Alt']});
    assert.equal(await block.count(),0);
    assert.deepEqual(await page.evaluate(()=>[tasks[1].startTime,tasks[1].endTime,tasks[1].duration]),[null,null,null]);
    assert.equal(await page.evaluate(()=>tasks[1].completed),true);
    assert.equal(await page.evaluate(()=>!!crDrag),false);assert.equal(await page.evaluate(()=>opened),0);
    assert.equal(await page.evaluate(()=>snapshots.length),2);
    await page.evaluate(()=>{tasks=structuredClone(snapshots.pop());renderWeeklyCalendar();});
    assert.equal(await block.count(),1);
    await card('c').click({modifiers:['Alt']});
    assert.deepEqual(await page.evaluate(()=>[tasks[2].date,tasks[2].duration]),['',null]);
    await card('a').click();assert.equal(await page.evaluate(()=>opened),1);
    assert.deepEqual(errors,[]);
    console.log('Alt+clic verificado en navegador: lista, horario, archivadas, sin editor ni arrastre, y deshacer.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

// NODE_PATH con Playwright; navegador aislado con funciones reales y datos ficticios.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const read = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function extract(source,name) {
  let start=source.indexOf('function '+name+'(');
  assert(start>=0,name);
  if(source.slice(start-6,start)==='async ') start-=6;
  return source.slice(start,source.indexOf('\n}',start)+2);
}
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1100,height:850},timezoneId:'America/Santiago'});
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>route.abort());
    await page.clock.install({time:new Date('2026-10-12T10:30:30-03:00')});
    await page.clock.pauseAt(new Date('2026-10-12T10:30:30-03:00'));
    await page.setContent(`<style>${read('style.css')}</style><style>
      body{display:block!important;padding:30px;overflow:auto!important}
      .cronograma-scroll{height:650px;width:750px;overflow:auto;margin-top:30px}
      #cronograma-grid{display:flex!important;width:730px;height:1440px;position:relative}
      .cr-day-col{position:relative;flex:none;width:365px;height:1440px}
      #cr-now-line{left:0}
    </style><div class="cronograma-scroll"><div id="cronograma-grid"></div></div>`);
    await page.evaluate(()=>{
      window.tasks=[
        {id:'a',title:'Preparar propuesta',date:'2026-10-12',startTime:'09:00',endTime:'10:00',duration:60,tagId:'default'},
        {id:'prev',title:'Anterior',date:'2026-10-12',startTime:'07:00',endTime:'08:00',duration:60,tagId:'default'},
        {id:'next',title:'Siguiente',date:'2026-10-12',startTime:'12:00',endTime:'13:00',duration:60,tagId:'default'}
      ];
      window.tags=[{id:'default',color:{bg:'#247caf',text:'#fff',border:'#247caf'}}];
      window.isMobile=()=>false; window.isTaskHiddenByActivityIsolation=()=>false;
      window.taskPlacement=null;window.crDrag=null;window.suppressNextCronogramaClick=false;window.CR_MIN_BLOCK_MIN=5;
      window.startCronogramaTouch=()=>{};window.opened=0;window.openTaskModal=()=>opened++;
      window.toggleTaskCompletion=task=>{task.completed=!task.completed;};
      window.formatDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      window.addDays=(d,n)=>{const result=new Date(d);result.setDate(result.getDate()+n);return result;};
      window.checkTaskOccurrence=(t,d)=>t.date===formatDate(d);
      window.snapshots=[];window.saved=0;window.pushToUndoStack=()=>snapshots.push(structuredClone(tasks));
      window.saveTasksToStorage=()=>saved++;window.refreshAlarms=()=>{};
      window.renderWeeklyCalendar=()=>{
        const grid=document.getElementById('cronograma-grid');grid.innerHTML='';
        for(const date of ['2026-10-12','2026-10-13']) {
          const col=document.createElement('div');col.className='cr-day-col';col.dataset.date=date;
          for(const task of tasks.filter(t=>t.date===date)) {
            const range=getTaskTimeRange(task);
            const block=buildCronogramaBlock(range.startMin,range.endMin,task.title,'',!!task.completed,tags[0],task,date,false);
            if(block) col.appendChild(block);
          }
          grid.appendChild(col);
        }
        const line=document.createElement('div');line.id='cr-now-line';line.className='cr-now-line';line.style.top='630.5px';grid.appendChild(line);
      };
    });
    const calendar=read('app-2-calendario.js'),editor=read('app-3-tareas.js');
    for(const name of ['getTaskTimeRange','getVisibleTaskRangesForDate','buildCronogramaBlock']) await page.addScriptTag({content:extract(calendar,name)});
    for(const name of ['formatTaskTimeText','formatTaskDuration','startCronogramaDrag','getCronogramaStretchTiming','stretchCronogramaTask','setupCronogramaStretchHint'])
      await page.addScriptTag({content:extract(editor,name)});
    await page.addScriptTag({content:read('app-9-seleccion.js')});
    await page.evaluate(()=>{setupTaskMultiSelection();renderWeeklyCalendar();setupCronogramaStretchHint();document.querySelector('.cronograma-scroll').scrollTop=360;});
    const block=page.locator('[data-task-id="a"]');
    const hint=page.locator('#cr-stretch-hint');
    // Pulsar Alt sin mover el mouse también muestra el indicador correcto.
    await block.hover({position:{x:70,y:12}});await page.keyboard.down('Alt');
    assert.equal(await hint.isVisible(),true);
    assert.equal(await hint.getAttribute('data-direction'),'backward');
    let rect=await block.boundingBox(),arrow=await hint.boundingBox();assert(arrow.y+arrow.height<rect.y);
    await block.hover({position:{x:70,y:48}});
    assert.equal(await hint.getAttribute('data-direction'),'forward');
    rect=await block.boundingBox();arrow=await hint.boundingBox();assert(arrow.y>rect.y+rect.height);
    assert.equal(await block.evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
    assert.equal(await block.evaluate(el=>getComputedStyle(el).transform),'none');
    await block.click({position:{x:70,y:48}});
    assert.deepEqual(await page.evaluate(()=>[tasks[0].startTime,tasks[0].endTime,tasks[0].duration]),['09:00','10:31',91]);
    // Mantener Alt y repetir en la mitad inferior: saltar ahora.
    await block.click({position:{x:70,y:80}});
    assert.deepEqual(await page.evaluate(()=>[tasks[0].endTime,tasks[0].duration]),['12:00',180]);
    await block.hover({position:{x:70,y:160}});assert.equal(await hint.getAttribute('data-direction'),'forward');
    await block.click({position:{x:70,y:160}});assert.equal(await page.evaluate(()=>saved),2);
    await block.click({position:{x:70,y:12}});
    assert.deepEqual(await page.evaluate(()=>[tasks[0].startTime,tasks[0].endTime,tasks[0].duration]),['08:00','12:00',240]);
    assert.equal(await page.evaluate(()=>opened),0);assert.equal(await page.evaluate(()=>crDrag),null);
    assert.equal(await page.locator('.task-multi-selected').count(),0);
    await page.keyboard.up('Alt');assert.equal(await hint.isVisible(),false);
    // Deshacer restaura horario y duración de un solo paso.
    await page.evaluate(()=>{tasks=structuredClone(snapshots.pop());renderWeeklyCalendar();});
    assert.deepEqual(await page.evaluate(()=>[tasks[0].startTime,tasks[0].endTime,tasks[0].duration]),['09:00','12:00',180]);
    await page.keyboard.down('Alt');await block.hover({position:{x:70,y:12}});assert.equal(await hint.isVisible(),true);
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await hint.isVisible(),false);
    await page.keyboard.up('Alt');
    // El checkbox sigue completando; un clic normal sigue abriendo el editor.
    await block.locator('.task-check-btn').click({modifiers:['Alt']});
    assert.equal(await page.evaluate(()=>tasks[0].completed),true);assert.equal(await page.evaluate(()=>saved),3);
    await block.dispatchEvent('click');assert.equal(await page.evaluate(()=>opened),1);
    assert.deepEqual(errors,[]);
    console.log('Horario en navegador: flecha, ambas mitades, repetición con Alt, sin animación, checkbox, sin arrastre y deshacer.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

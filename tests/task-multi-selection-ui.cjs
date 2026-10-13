// NODE_PATH con Playwright. Interfaz aislada: usa las funciones reales y datos ficticios.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function extract(source, name) {
  let start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0,name);
  if (source.slice(start-6,start)==='async ') start-=6;
  return source.slice(start, source.indexOf('\n}',start)+2);
}
(async () => {
  const browser = await chromium.launch({channel:'msedge',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1100,height:800}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>route.abort());
    await page.setContent(`<style>${read('style.css')}</style><style>
      body {display:block!important;padding:24px;background:#f6f7f9;overflow:auto!important;}
      #list {display:flex;gap:16px;margin:20px 0;} .tasks-container{width:260px;min-height:80px;}
      #cronograma-grid{display:flex!important;width:680px;height:1440px;} .cr-day-col{position:relative;width:340px;flex:none;height:1440px;}
      .cronograma-scroll{height:470px;overflow:auto;width:700px;background:white;}
      #trash-btn {position:fixed;top:20px;right:20px;z-index:1000;} h1{font-size:22px;margin-bottom:8px;}
    </style><h1>Selección de tareas</h1><p>Ctrl + clic para seleccionar · Esc para deseleccionar</p>
    <button id="trash-btn">Eliminar</button><div id="list"></div>
    <div class="cronograma-scroll"><div id="cronograma-grid"><div class="cr-day-col" data-date="2026-10-12"></div><div class="cr-day-col" data-date="2026-10-13"></div></div></div>`);
    await page.evaluate(() => {
      window.tasks=[{id:'a',title:'Preparar presentación',date:'2026-10-12',startTime:'09:00',endTime:'10:00',duration:60,position:0,tagId:'azul'},
        {id:'b',title:'Revisar proyecto',description:'Revisión de cambios pendientes',date:'2026-10-12',startTime:'11:00',endTime:'12:30',duration:90,position:10,tagId:'verde',completed:true}];
      window.tags=[{id:'azul',color:{bg:'#247caf',text:'#fff',border:'#247caf'}},{id:'verde',color:{bg:'#487745',text:'#fff',border:'#487745'}}];
      window.opened=0;window.openTaskModal=()=>opened++;
      window.isMobile=()=>false;window.isTaskHiddenByActivityIsolation=()=>false;
      window.handleTouchStart=()=>{};window.startCronogramaTouch=()=>{};window.attachCheckboxLongPressTimer=()=>{};
      window.preventClick=false;window.taskPlacement=null;window.suppressNextCronogramaClick=false;
      window.CR_MIN_BLOCK_MIN=5;window.CR_SNAP_MIN=10;window.crDrag=null;window.crHorizAnimating=false;
      window.crEdgeScroll={};window.cronogramaActive=false;window.draggedTaskId=null;window.draggedTaskSourceDate=null;
      window.stopCronogramaEdgeScroll=window.clearCronogramaHorizontalEdge=window.updateCronogramaHorizontalEdge=window.updateCronogramaEdgeScroll=()=>{};
      window.stopCronogramaDragFollower=()=>{};
      window.formatDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      window.addDays=(date,days)=>{const result=new Date(date);result.setDate(result.getDate()+days);return result;};
      window.getTaskDurationMinutes=t=>t.duration;window.minutesToReadable=m=>`${m} min`;
      window.formatTaskTimeText=t=>`${t.startTime} - ${t.endTime}`;window.formatTaskDuration=()=>'';
      window.testUndoSnapshots=[];window.saved=0;window.pushToUndoStack=()=>testUndoSnapshots.push(structuredClone(tasks));window.saveTasksToStorage=()=>saved++;
      window.renderBriefcaseTasks=()=>{};window.refreshAlarms=()=>{};
      window.checkTaskOccurrence=(task,date)=>task.date===formatDate(date);
      window.sortDayTasks=list=>list.sort((a,b)=>(a.position||0)-(b.position||0));window.setEffectivePosition=(task,date,position)=>task.position=position;
      window.getEffectivePosition=task=>task.position||0;window.resolveTimedReorderOnDrop=()=>true;
      window.getDragAfterElement=()=>null;
      window.renderWeeklyCalendar=()=>{
        const list=document.getElementById('list');list.innerHTML='';
        for(const task of tasks){const container=document.createElement('div');container.className='tasks-container';container.appendChild(createTaskCard(task,task.date));list.appendChild(container);}
        renderCronograma();refreshTaskSelection();
      };
      window.renderCronograma=()=>{
        document.querySelectorAll('.cr-day-col').forEach(col=>{col.innerHTML='';renderCronogramaDayBlocks(col,new Date(col.dataset.date+'T00:00:00'));});
      };
    });
    const calendar=read('app-2-calendario.js'),editor=read('app-3-tareas.js');
    for(const name of ['getTaskTimeRange','buildCronogramaBlock','renderCronogramaDayBlocks','updateCronogramaOverlapOffsets','moveTaskToDate',
      'cronogramaClickToMinutes','cronogramaDropStartMin','showCronogramaDropPreview','hideCronogramaDropPreview']) await page.addScriptTag({content:extract(calendar,name)});
    for(const name of ['createTaskCard','handleDragStart','handleDragEnd','startCronogramaDrag','syncCronogramaCopyGhost','onCronogramaDragKey',
      'cancelCronogramaDrag','onCronogramaDragMove','enterCronogramaFloat','exitCronogramaFloat','applyCronogramaDragMove','onCronogramaDragEnd',
      'clearCronogramaDragOver','clearCronogramaHeaderTargets','commitCronogramaDragResult']) await page.addScriptTag({content:extract(editor,name)});
    for(const name of ['openConfirmModal','closeConfirmModal']) await page.addScriptTag({content:extract(editor,name)});
    const modalMarkup=read('index.html').split('<div id="confirm-modal"')[1].split('<div id="edit-recurring-modal"')[0];
    await page.evaluate(markup=>document.body.insertAdjacentHTML('beforeend','<div id="confirm-modal"'+markup),modalMarkup);
    await page.evaluate(()=>document.querySelectorAll('#confirm-modal .close-confirm-modal-btn, #confirm-modal .close-modal-btn').forEach(button=>button.addEventListener('click',()=>closeConfirmModal())));
    await page.addScriptTag({content:read('app-9-seleccion.js')});
    await page.evaluate(()=>{setupTaskMultiSelection();renderWeeklyCalendar();document.querySelector('.cronograma-scroll').scrollTop=480;});
    const card=id=>page.locator(`#list .task-card[data-id="${id}"]`);
    await card('a').click({modifiers:['Control']});await card('b').click({modifiers:['Control']});
    assert.equal(await page.evaluate(()=>opened),0);
    assert.equal(await page.locator('#list .task-multi-selected').count(),2);
    assert.equal(await page.locator('#task-selection-toolbar').count(),0);
    assert.equal(await page.locator('.cr-task-block[data-task-id="b"]').evaluate(el=>getComputedStyle(el).backgroundImage),'none');
    const appearance=await card('a').evaluate(element=>({fill:getComputedStyle(element).animationName,stroke:getComputedStyle(element.querySelector('.task-selection-border rect')).stroke,
      animation:getComputedStyle(element.querySelector('.task-selection-border rect')).animationName,text:getComputedStyle(element.querySelector('.task-card-title')).color}));
    assert.equal(appearance.fill,'taskSelectionFillPulse');assert.equal(appearance.stroke,'rgb(0, 0, 0)');assert.equal(appearance.animation,'taskSelectionMarch');assert.equal(appearance.text,'rgb(255, 255, 255)');
    if(process.env.PLANNER_SELECTION_SCREENSHOT) await page.screenshot({path:process.env.PLANNER_SELECTION_SCREENSHOT});
    await page.keyboard.press('Escape');assert.equal(await page.locator('.task-multi-selected').count(),0);
    assert.notEqual(await page.locator('.cr-task-block[data-task-id="b"]').evaluate(el=>getComputedStyle(el).backgroundImage),'none');
    await card('a').click();assert.equal(await page.evaluate(()=>opened),1);
    // El clic con Ctrl en el horario también selecciona, incluso con pointer capture.
    await page.evaluate(()=>document.getElementById('list').style.display='none');
    const block=id=>page.locator(`.cr-task-block[data-task-id="${id}"]`);
    await block('a').click({modifiers:['Control']});await block('b').click({modifiers:['Control']});
    assert.equal(await page.locator('.cr-task-block.task-multi-selected').count(),2);
    assert.equal(await page.evaluate(()=>opened),1);
    // Escape durante el arrastre revierte la vista y borra la selección.
    let canceledBox=await block('a').boundingBox();
    await page.mouse.move(canceledBox.x+45,canceledBox.y+20);await page.mouse.down();
    await page.mouse.move(canceledBox.x+45,canceledBox.y+50,{steps:4});await page.keyboard.press('Escape');await page.mouse.up();
    assert.equal(await page.evaluate(()=>!!crDrag),false);assert.equal(await page.evaluate(()=>testUndoSnapshots.length),0);
    assert.equal(await page.locator('.task-multi-selected').count(),0);
    await block('a').click({modifiers:['Control']});await block('b').click({modifiers:['Control']});
    // Arrastre real por pointer events: ambas tareas avanzan una hora.
    let box=await block('a').boundingBox();
    await page.mouse.move(box.x+45,box.y+20);await page.mouse.down();
    assert.equal(await page.evaluate(()=>!!crDrag),true,'El bloque debe iniciar el gesto');
    await page.mouse.move(box.x+45,box.y+80,{steps:8});
    assert.deepEqual(await page.locator('.task-selection-time-preview[data-preview-role="destination"]').evaluateAll(elements=>elements.map(el=>({id:el.dataset.taskId,date:el.parentElement.dataset.date,top:el.style.top}))),
      [{id:'a',date:'2026-10-12',top:'600px'},{id:'b',date:'2026-10-12',top:'720px'}]);
    assert.deepEqual(await page.evaluate(()=>tasks.map(t=>t.startTime)),['09:00','11:00']);
    assert.equal(await page.locator('.cr-task-block.task-selection-time-origin').count(),2);
    assert.ok(await page.locator('.cr-task-block.task-selection-time-origin').evaluateAll(blocks=>blocks.every(block=>getComputedStyle(block).opacity==='0')));
    const dragState=await page.evaluate(()=>({moved:crDrag?.moved,start:crDrag?.newStartMin,count:crDrag?.selectionEntries.length,trash:crDrag?.overTrash,archive:crDrag?.overBriefcase}));
    await page.mouse.up();
    const committed=await page.evaluate(()=>({saved,historyLength:testUndoSnapshots.length,dragActive:!!crDrag,selection:[...selectedTaskOccurrences.values()],data:tasks.map(t=>({id:t.id,date:t.date,time:t.startTime}))}));
    assert.deepEqual(errors,[]);
    assert.deepEqual(await page.evaluate(()=>tasks.map(t=>t.startTime)),['10:00','12:00'],JSON.stringify({dragState,committed}));
    assert.equal(await page.evaluate(()=>testUndoSnapshots.length),1);
    // Ctrl + arrastre real crea dos copias y deja intactos los originales.
    box=await block('a').boundingBox();
    await page.keyboard.down('Control');await page.mouse.move(box.x+45,box.y+20);await page.mouse.down();
    await page.mouse.move(box.x+385,box.y+20,{steps:10});
    assert.equal(await page.locator('.task-selection-time-preview[data-preview-role="source"]').count(),2);
    assert.equal(await page.locator('.task-selection-time-preview[data-preview-role="destination"]').count(),2);
    await page.mouse.up();await page.keyboard.up('Control');
    assert.equal(await page.evaluate(()=>tasks.length),4);
    assert.deepEqual(await page.evaluate(()=>tasks.slice(0,2).map(t=>t.date)),['2026-10-12','2026-10-12']);
    assert.deepEqual(await page.evaluate(()=>tasks.slice(2).map(t=>t.date)),['2026-10-13','2026-10-13']);
    assert.equal(await page.evaluate(()=>testUndoSnapshots.length),2);
    // Supr abre la confirmación; cancelar conserva todo y eliminar guarda una sola vez.
    await page.keyboard.press('Delete');assert.equal(await page.locator('.task-selection-confirm').count(),1);
    await page.locator('.task-selection-confirm [data-cancel]').click();assert.equal(await page.evaluate(()=>tasks.length),4);
    await page.keyboard.press('Delete');await page.locator('.task-selection-confirm [data-delete]').click();
    assert.equal(await page.evaluate(()=>tasks.length),2);assert.equal(await page.evaluate(()=>testUndoSnapshots.length),3);
    // Arrastre HTML5 usa el grupo desde las tarjetas y respeta el modo copia.
    await page.evaluate(()=>{document.getElementById('list').style.display='flex';toggleTaskSelection('a','2026-10-12');toggleTaskSelection('b','2026-10-12');});
    await page.evaluate(async()=>{
      const element=document.querySelector('#list .task-card[data-id="a"]');const transfer=new DataTransfer();
      element.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer,ctrlKey:true,clientX:50,clientY:150}));
      await moveTaskToDate('a','2026-10-12','2026-10-13',document.querySelector('.tasks-container'),200,true);
      element.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer}));
    });
    assert.equal(await page.evaluate(()=>tasks.length),4);assert.equal(await page.evaluate(()=>testUndoSnapshots.length),4);
    await page.keyboard.press('Escape');assert.equal(await page.locator('.task-multi-selected').count(),0);
    // Medianoche: los dos tramos aparecen ANTES de soltar, y el original se oculta.
    await page.evaluate(()=>{
      tasks=tasks.slice(0,2);Object.assign(tasks[0],{startTime:'22:00',endTime:'23:00',duration:60,date:'2026-10-12'});
      Object.assign(tasks[1],{startTime:'23:30',endTime:'00:30',duration:60,date:'2026-10-12'});
      document.getElementById('list').style.display='none';renderWeeklyCalendar();
      toggleTaskSelection('a','2026-10-12');toggleTaskSelection('b','2026-10-12');
      document.querySelector('.cronograma-scroll').scrollTop=1220;
    });
    const previewSegments=()=>page.locator('.task-selection-time-preview[data-preview-role="destination"][data-task-id="b"]').evaluateAll(elements=>elements.map(el=>({date:el.parentElement.dataset.date,top:el.dataset.topMin,end:el.dataset.bottomMin,tail:el.classList.contains('cr-tail')})).sort((a,b)=>a.date.localeCompare(b.date)));
    box=await block('a').boundingBox();
    await page.mouse.move(box.x+45,box.y+20);await page.mouse.down();await page.mouse.move(box.x+45,box.y+40,{steps:4});
    assert.deepEqual(await previewSegments(),[{date:'2026-10-12',top:'1430',end:'1440',tail:false},{date:'2026-10-13',top:'0',end:'50',tail:true}]);
    assert.equal(await page.locator('.task-selection-time-preview.completed').first().evaluate(el=>getComputedStyle(el).backgroundImage),'none');
    assert.equal(await page.evaluate(()=>tasks[1].startTime),'23:30');
    if(process.env.PLANNER_SELECTION_SCREENSHOT) await page.screenshot({path:process.env.PLANNER_SELECTION_SCREENSHOT});
    // Avanzar una hora hace pasar la tarea entera al día siguiente.
    await page.mouse.move(box.x+45,box.y+80,{steps:5});
    assert.deepEqual(await previewSegments(),[{date:'2026-10-13',top:'30',end:'90',tail:false}]);
    await page.mouse.up();
    assert.equal(await page.evaluate(()=>tasks[1].date),'2026-10-13');assert.equal(await page.evaluate(()=>tasks[1].startTime),'00:30');
    // Retroceder: tramo final en el día anterior y cola en el día de origen.
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{
      Object.assign(tasks[0],{date:'2026-10-12',startTime:'02:00',endTime:'03:00'});
      Object.assign(tasks[1],{date:'2026-10-12',startTime:'00:20',endTime:'01:20'});
      const grid=document.getElementById('cronograma-grid');const previous=document.createElement('div');
      previous.className='cr-day-col';previous.dataset.date='2026-10-11';grid.prepend(previous);
      grid.style.width='1020px';document.querySelector('.cronograma-scroll').style.width='1035px';
      renderWeeklyCalendar();toggleTaskSelection('a','2026-10-12');toggleTaskSelection('b','2026-10-12');
      document.querySelector('.cronograma-scroll').scrollTop=0;
    });
    box=await block('a').boundingBox();
    await page.mouse.move(box.x+45,box.y+20);await page.mouse.down();await page.mouse.move(box.x+45,box.y-20,{steps:5});
    assert.deepEqual(await previewSegments(),[{date:'2026-10-11',top:'1420',end:'1440',tail:false},{date:'2026-10-12',top:'0',end:'40',tail:true}]);
    await page.keyboard.press('Escape');await page.mouse.up();
    assert.equal(await page.locator('.task-selection-time-preview').count(),0);
    assert.equal(await page.locator('.task-selection-time-origin').count(),0);
    assert.equal(await page.evaluate(()=>tasks[1].date),'2026-10-12');
    // La vista previa HTML5 también usa todos los tramos del grupo.
    await page.evaluate(()=>{
      toggleTaskSelection('a','2026-10-12');toggleTaskSelection('b','2026-10-12');
      taskMultiDragEntries=getTaskSelectionDragEntries('a','2026-10-12');draggedTaskSourceDate='2026-10-12';
      const col=document.querySelector('.cr-day-col[data-date="2026-10-12"]');
      showCronogramaDropPreview('a',col,col.getBoundingClientRect().top+80,false);
    });
    assert.deepEqual(await previewSegments(),[{date:'2026-10-11',top:'1420',end:'1440',tail:false},{date:'2026-10-12',top:'0',end:'40',tail:true}]);
    await page.evaluate(()=>hideCronogramaDropPreview());
    assert.equal(await page.locator('.task-selection-time-preview').count(),0);
    // Las series permanecen inmóviles, incluso cuando se agarra su propio bloque.
    for (const anchorId of ['a','b']) for (const copy of [false,true]) {
      await page.evaluate(()=>{
        taskMultiDragEntries=null;clearTaskSelection();tasks=tasks.slice(0,2);
        Object.assign(tasks[0],{date:'2026-10-12',startTime:'09:00',endTime:'10:00'});
        Object.assign(tasks[1],{date:'2026-10-12',startTime:'11:00',endTime:'12:00',recurrence:{enabled:true,unit:'daily',exceptions:[]}});
        renderWeeklyCalendar();toggleTaskSelection('a','2026-10-12');toggleTaskSelection('b','2026-10-12');
        document.querySelector('.cronograma-scroll').scrollTop=480;
      });
      const before=await page.evaluate(()=>JSON.stringify(tasks[1]));
      box=await block(anchorId).boundingBox();
      if(copy) await page.keyboard.down('Control');
      await page.mouse.move(box.x+45,box.y+20);await page.mouse.down();await page.mouse.move(box.x+45,box.y+80,{steps:6});
      assert.equal(await page.locator('[data-task-id="b"][data-preview-role="destination"]').count(),0);
      assert.equal(await page.locator('[data-task-id="b"][data-preview-role="source"]').count(),0);
      const stationary=page.locator('[data-task-id="b"][data-preview-role="stationary"]');
      assert.equal(await stationary.count(),1);
      assert.equal(await stationary.evaluate(el=>el.style.top),'660px');
      assert.equal(await stationary.evaluate(el=>el.parentElement.dataset.date),'2026-10-12');
      assert.equal(await page.locator('[data-task-id="a"][data-preview-role="destination"]').evaluate(el=>el.style.top),'600px');
      await page.mouse.up();if(copy) await page.keyboard.up('Control');
      assert.equal(await page.evaluate(()=>JSON.stringify(tasks[1])),before);
      assert.equal(await page.evaluate(()=>tasks.length),copy?3:2);
      assert.equal(await page.evaluate(copy=>tasks[copy?2:0].startTime,copy),'10:00');
    }
    // Decisiones individuales, cancelación atómica y serie completa una sola vez.
    for (const mode of ['cancel','only-this','all']) {
      await page.evaluate(()=>{
        clearTaskSelection();tasks=tasks.slice(0,2);tasks[1].recurrence.exceptions=[];
        renderWeeklyCalendar();toggleTaskSelection('a',tasks[0].date);toggleTaskSelection('b','2026-10-12');
        // Añadir otra aparición sin depender del render simplificado de esta fixture.
        selectedTaskOccurrences.set(taskOccurrenceKey('b','2026-10-13'),{id:'b',date:'2026-10-13'});
      });
      const before=await page.evaluate(()=>({data:JSON.stringify(tasks),undos:testUndoSnapshots.length}));
      await page.keyboard.press('Delete');
      assert.equal(await page.locator('#confirm-modal').evaluate(el=>el.classList.contains('hidden')),false);
      if(mode==='all') await page.locator('#delete-all-occurrences-btn').click();
      else {
        await page.locator('#delete-only-this-btn').click();
        assert.match(await page.locator('#confirm-modal h2').textContent(),/2026-10-13/);
        assert.equal(await page.evaluate(()=>JSON.stringify(tasks)),before.data);
        if(mode==='cancel') await page.locator('#confirm-modal .close-confirm-modal-btn').click();
        else await page.locator('#delete-only-this-btn').click();
      }
      assert.equal(await page.locator('#confirm-modal').evaluate(el=>el.classList.contains('hidden')),true);
      if(mode==='cancel') {
        assert.equal(await page.evaluate(()=>JSON.stringify(tasks)),before.data);
        assert.equal(await page.evaluate(()=>testUndoSnapshots.length),before.undos);
      } else {
        assert.equal(await page.evaluate(()=>testUndoSnapshots.length),before.undos+1);
        if(mode==='all') assert.equal(await page.evaluate(()=>tasks.length),0);
        else {
          assert.deepEqual(await page.evaluate(()=>tasks[0].recurrence.exceptions),['2026-10-12','2026-10-13']);
          // Restaurar la fixture para probar después la eliminación completa.
          await page.evaluate(()=>tasks=structuredClone(testUndoSnapshots.at(-1)));
        }
      }
    }
    assert.deepEqual(errors,[]);
    console.log('Interfaz verificada: sin barra, movimiento simultáneo, medianoche en ambos sentidos, copia, HTML5, completadas, Escape y Supr.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

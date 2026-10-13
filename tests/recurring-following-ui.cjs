// NODE_PATH con Playwright disponible; navegador aislado sin conexión a Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function extract(source, name) {
  const start = source.indexOf('function ' + name + '(');
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'planner7.test') return route.abort();
      const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      if (file.includes('..')) return route.abort();
      if (file === 'index.html') return route.fulfill({contentType:'text/html',body:read(file).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')});
      return route.fulfill({path:path.join(root,file)});
    });
    await page.goto('http://planner7.test/');
    await page.evaluate(() => {
      document.getElementById('splash-screen')?.remove();
      window.tasks = [{id:'serie',date:'2026-10-05',recurrence:{enabled:true,unit:'weekly',days:[1],interval:1}}];
      window.pendingEditTaskId = 'serie'; window.pendingEditOccurrenceDate = '2026-10-05';
      window.pendingEditFormData = {title:'Cambio'}; window.pendingMoveTask = null; window.pendingCronogramaScopeResolve = null;
      window.calls = []; window.applyTaskChanges = (...args) => calls.push(['edit',...args]);
      window.executeMoveTask = (...args) => calls.push(['move',...args]);
      window.closeTaskModal = () => {};
      window.formatDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      window.getMondayOf = d => { const result = new Date(d); result.setDate(result.getDate()-((result.getDay()+6)%7)); return result; };
    });
    const calendar = read('app-2-calendario.js'), editor = read('app-3-tareas.js'), listeners = read('app-6-herramientas.js');
    for (const name of ['getAppDayIndex','hasEarlierRecurringOccurrence','matchesRecurrenceRulePattern','checkTaskOccurrence','countOccurrencesInRange'])
      await page.addScriptTag({content:extract(calendar,name)});
    for (const name of ['openEditRecurringModal','askCronogramaRecurringScope','closeEditRecurringModal'])
      await page.addScriptTag({content:extract(editor,name)});
    const start = listeners.indexOf("  // Edit Recurring Modal - botones de alcance");
    const end = listeners.indexOf('  // Confirm Modal - Delete ONLY this occurrence',start);
    await page.addScriptTag({content:listeners.slice(start,end)});
    await page.evaluate(() => openEditRecurringModal());
    assert.equal(await page.locator('#edit-following-btn').isVisible(),false);
    await page.locator('#edit-all-occurrences-btn').click();
    assert.equal(await page.evaluate(() => calls[0][1]),'all');
    for (const width of [1280,390]) {
      await page.setViewportSize({width,height:800});
      await page.evaluate(() => {
        pendingEditTaskId='serie'; pendingEditOccurrenceDate='2026-10-12'; pendingEditFormData={title:'Cambio'};
        openEditRecurringModal();
      });
      assert.equal(await page.locator('#edit-following-btn').isVisible(),true);
      await page.locator('#edit-following-btn').click();
      assert.equal(await page.evaluate(() => calls.at(-1)[1]),'following');
      assert.equal(await page.locator('#edit-recurring-modal').isVisible(),false);
    }
    await page.evaluate(() => {pendingMoveTask={taskId:'serie'};openEditRecurringModal(tasks[0],'2026-10-12');});
    await page.locator('#edit-following-btn').click();
    assert.deepEqual(await page.evaluate(() => calls.at(-1).slice(0,2)),['move','following']);
    await page.evaluate(() => {window.scopeResult=null;askCronogramaRecurringScope(tasks[0],'2026-10-12').then(scope=>scopeResult=scope);});
    await page.locator('#edit-following-btn').click();
    assert.equal(await page.evaluate(() => scopeResult),'following');
    await page.evaluate(() => {askCronogramaRecurringScope(tasks[0],'2026-10-12').then(scope=>scopeResult=scope);});
    await page.locator('#edit-recurring-modal .modal-footer button').click();
    assert.equal(await page.evaluate(() => scopeResult),'cancel');
    assert.deepEqual(errors,[]);
    console.log('Interfaz verificada en escritorio y móvil: visibilidad, editor, lista, cronograma y cancelación.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});

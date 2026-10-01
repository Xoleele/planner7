// Ejecutar con Node y Playwright disponible en NODE_PATH.
// Prueba en navegador aislado, con datos ficticios y sin acceso a Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(a >= 0 && b > a, `Bloque ausente: ${start}`);
  return source.slice(a, b);
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'planner7.test') return route.abort();
      const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      if (file.includes('..')) return route.abort();
      if (file === 'index.html') return route.fulfill({ contentType: 'text/html', body: read(file).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '') });
      return route.fulfill({ path: path.join(root, file) });
    });
    await page.goto('http://planner7.test/');
    await page.evaluate(() => {
      document.getElementById('splash-screen')?.remove();
      document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
      window.tasks = [
        { id: 'a', title: 'Trabajo A', tagId: 'default', startTime: '08:00', date: '2026-09-29' },
        { id: 'b', title: 'Trabajo B', tagId: 'default', startTime: '12:00', date: '2026-09-29' },
        { id: 'c', title: 'Trabajo C', tagId: 'default', startTime: '09:00', date: '2026-09-30', recurrence: { enabled: true }, completedOccurrences: ['2026-09-30'] },
        { id: 'd', title: 'Trabajo archivado', tagId: 'default', date: '' }
      ];
      window.tags = [{ id: 'default', color: { bg: '#247caf', text: '#fff', border: '#247caf' } }];
      window.isTaskHiddenByActivityIsolation = () => false;
      window.getTaskDurationMinutes = () => 60;
      window.minutesToReadable = () => '1h';
      window.formatTaskTimeText = task => task.startTime || '';
      window.handleDragStart = window.handleDragEnd = window.handleTouchStart = window.attachCheckboxLongPressTimer = () => {};
      window.normalizeForSearch = s => s.toLowerCase();
      window.timerStartTime = null;
      window.openTaskModal = (id, date) => {
        window.openedTask = { id, date };
        document.getElementById('task-modal').classList.remove('hidden');
      };
      window.buscadorLastItems = tasks.map(task => ({ task, date: task.date }));
      window.buscadorLastQuery = { keyword: 'Trabajo', fields: { title: true } };
      window.runBuscadorCalculation = () => {
        window.refreshCount = (window.refreshCount || 0) + 1;
        window.buscadorLastItems = tasks.map(task => ({ task, date: task.date }));
      };
    });
    const tasksSource = read('app-3-tareas.js');
    const search = read('app-6-herramientas.js');
    const stats = read('app-4-estadisticas.js');
    await page.addScriptTag({ content: between(tasksSource, 'function createTaskCard(', '// Añade a un checkbox') });
    await page.addScriptTag({ content: read('app-7-resultados.js') });
    await page.addScriptTag({ content: between(search, 'function highlightBuscadorMatches(', '// Estado inicial del Buscador') });
    await page.addScriptTag({ content: between(search, 'function showBuscadorResultsView(', '// Texto plano de los resultados') });
    await page.addScriptTag({ content: between(stats, 'function openStatsDetailPanel(', '// Hábitos / Mapa de calor: clic') });
    await page.addScriptTag({ content: between(search, 'function closeOrGoBackInModal(', '// Devuelve la hora actual') });
    // Enlazar los mismos cierres reales que usa setupEventListeners.
    await page.addScriptTag({ content: between(search, '  // Close modals clicking X', '  // Task Modal Form Cancel') });
    const visible = id => page.locator(id).evaluate(el => !el.classList.contains('hidden'));
    const ids = () => page.locator('#task-results-list .task-card').evaluateAll(cards => cards.map(c => c.dataset.id));

    await page.evaluate(() => {
      document.getElementById('buscador-modal').classList.remove('hidden');
      showBuscadorResultsView();
    });
    assert(await visible('#task-results-modal'));
    assert(!await visible('#buscador-modal'));
    assert.deepEqual(await ids(), ['a', 'b', 'c', 'd']);
    assert.equal(await page.locator('#task-results-list mark').count(), 4);
    await page.locator('#task-results-sort-btn').click();
    assert.deepEqual(await ids(), ['c', 'b', 'a', 'd']);
    assert.equal(await page.locator('#task-results-sort-btn').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await page.evaluate(() => orderedTaskResultItems(buscadorLastItems).map(x => x.task.id)), ['c', 'b', 'a', 'd']);
    await page.locator('#task-results-export-btn').click();
    assert(await visible('#buscador-export-modal'));
    assert(await page.locator('#buscador-export-modal .modal-header').evaluate(el => {
      const r = el.getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2).closest('#buscador-export-modal') !== null;
    }));
    await page.locator('#buscador-export-modal .close-modal-btn').click();
    await page.locator('#task-results-list [data-id="c"]').click();
    assert.deepEqual(await page.evaluate(() => openedTask), { id: 'c', date: '2026-09-30' });
    assert(await visible('#task-modal'));
    assert(!await visible('#task-results-modal'));
    // Confirmación posterior al editor: no debe regresar antes de cerrarla.
    await page.evaluate(() => {
      document.getElementById('edit-recurring-modal').classList.remove('hidden');
      document.getElementById('task-modal').classList.add('hidden');
    });
    await page.waitForTimeout(40);
    assert(!await visible('#task-results-modal'));
    await page.evaluate(() => {
      tasks = tasks.map(task => task.id === 'c' ? { ...task, title: 'Trabajo editado' } : task);
      document.getElementById('edit-recurring-modal').classList.add('hidden');
    });
    await page.waitForFunction(() => !document.getElementById('task-results-modal').classList.contains('hidden'));
    assert.equal(await page.evaluate(() => refreshCount), 1);
    assert.match(await page.locator('#task-results-list [data-id="c"]').innerText(), /editado/);
    await page.locator('#task-results-back-btn').click();
    assert(await visible('#buscador-modal'));

    await page.evaluate(() => {
      document.getElementById('buscador-modal').classList.add('hidden');
      document.getElementById('general-stats-modal').classList.remove('hidden');
      openStatsChartDetail({ name: 'Trabajo', occurrences: tasks.slice(0, 3).map(task => ({ task, dateStr: task.date })) });
    });
    assert(await visible('#task-results-modal'));
    assert(!await visible('#general-stats-modal'));
    assert(!await visible('#task-results-export-btn'));
    assert.deepEqual(await ids(), ['c', 'b', 'a']);
    await page.locator('#task-results-sort-btn img').click();
    assert.deepEqual(await ids(), ['a', 'b', 'c']);
    await page.locator('#task-results-list [data-id="a"]').click();
    await page.evaluate(() => document.getElementById('task-modal').classList.add('hidden'));
    await page.waitForFunction(() => !document.getElementById('task-results-modal').classList.contains('hidden'));
    await page.evaluate(() => closeOrGoBackInModal(document.getElementById('task-results-modal')));
    assert(await visible('#general-stats-modal'));
    assert(!await visible('#task-results-modal'));

    // Móvil, lista extensa, scroll conservado y botón centrado.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.documentElement.classList.add('mobile-mode');
      openStatsDetailPanel('Trabajo', [{ heading: 'Un día', occurrences: Array.from({ length: 25 }, () => ({ task: tasks[0], dateStr: tasks[0].date })) }]);
      document.getElementById('task-results-body').scrollTop = 300;
    });
    const scroll = await page.locator('#task-results-body').evaluate(el => el.scrollTop);
    assert(scroll > 0);
    await page.evaluate(() => openTaskFromResults('a', '2026-09-29'));
    await page.evaluate(() => document.getElementById('task-modal').classList.add('hidden'));
    await page.waitForFunction(() => !document.getElementById('task-results-modal').classList.contains('hidden'));
    assert.equal(await page.locator('#task-results-body').evaluate(el => el.scrollTop), scroll);
    const button = await page.locator('#task-results-back-btn').boundingBox();
    assert(Math.abs(button.x + button.width / 2 - 195) < 2);
    await page.locator('#task-results-modal .close-modal-btn').click();
    assert(await visible('#general-stats-modal'));
    await page.evaluate(() => openStatsDetailPanel('Vacío', [{ heading: 'Sin tareas', occurrences: [] }], 'No hubo tareas este día.'));
    assert.equal(await page.locator('.task-results-empty').innerText(), 'No hubo tareas este día.');
    await page.mouse.click(2, 2);
    assert(!await visible('#task-results-modal'));
    assert(await visible('#general-stats-modal'));
    assert.deepEqual(errors, []);
    console.log('OK: panel común, orden, archivadas, resaltado, exportación, editor, confirmaciones, regreso, scroll y móvil.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

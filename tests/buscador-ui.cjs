// Interfaz real del Buscador con Playwright: datos ficticios y sin acceso a Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const between = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); assert(i >= 0 && j > i, a); return src.slice(i, j); };
const fn = (src, name) => { const i = src.indexOf('function ' + name + '('); assert(i >= 0, name); return src.slice(i, src.indexOf('\n}', i) + 2); };
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== 'planner7.test') return route.abort();
    const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
    if (file === 'index.html') return route.fulfill({ contentType: 'text/html', body: read(file).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '') });
    if (!fs.existsSync(path.join(root, file))) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ path: path.join(root, file) });
  });
  await page.goto('http://planner7.test/');
  await page.evaluate(() => {
    document.getElementById('splash-screen')?.remove();
    document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
    window.currentUser = { id: 'u1' };
    window.statsDayCutoffTime = '00:00';
    window.tasks = [
      { id: 'a', title: 'Reunión con Juan', tagId: 'default', date: '2026-10-05', startTime: '09:00', endTime: '10:00', completed: true },
      { id: 'b', title: 'Juan – reunión futura', tagId: 'default', date: '2026-12-01', startTime: '10:00', endTime: '11:00' },
      { id: 'c', title: 'Archivada sobre Juan', tagId: 'default', date: '' }
    ];
    window.tags = [{ id: 'default', name: 'General', color: { bg: '#247caf', text: '#fff', border: '#247caf' } }];
    window.notes = { '2026-10-06': 'Llamar a Juan por el contrato' };
    localStorage.setItem('planner7.habitos.v1:u1', JSON.stringify({ user_id: 'u1', revision: 1, pending: false, data: { version: 2, blocks: [{
      id: 'b1', startDate: '2026-10-01', endDate: null, habits: [{ id: 'h1', name: 'Leer' }], records: {}, notes: { '2026-10-07:h1': 'Libro que recomendó Juan' } }] } }));
    window.sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) };
    window.getStatsTodayStr = () => '2026-10-20';
    window.formatDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    window.checkTaskOccurrence = (t, d) => t.date === formatDate(d);
    window.minutesToReadable = m => m + 'min';
    window.isTaskHiddenByActivityIsolation = () => false;
    window.formatTaskTimeText = t => t.startTime || '';
    window.handleDragStart = window.handleDragEnd = window.handleTouchStart = window.attachCheckboxLongPressTimer = () => {};
    window.getEffectivePosition = t => t.position || 0;
    window.timerStartTime = null;
    window.openTaskModal = () => document.getElementById('task-modal').classList.remove('hidden');
    window.openNotesModal = (d) => { window.openedNote = d; document.getElementById('notes-modal').classList.remove('hidden'); };
    const host = document.createElement('div'); host.id = 'habitos-tool'; host.hidden = true; document.body.append(host);
    host.addEventListener('planner7:open-habit-note', e => { window.habitNote = e.detail; host.hidden = false; e.detail.done(true); });
  });
  const core = read('app-1-core.js'), cal = read('app-2-calendario.js'), tareas = read('app-3-tareas.js');
  const stats = read('app-4-estadisticas.js'), et = read('app-5-etiquetas.js'), search = read('app-6-herramientas.js');
  const scripts = [
    fn(core, 'parseStatsDayCutoff'), fn(cal, 'getTaskTimeRange'), fn(cal, 'getTaskDurationMinutes'),
    between(stats, 'const PLANNER7_DATA_FORMAT', 'async function getHabitDataForExport'),
    fn(stats, 'getRelativeDateString'), fn(stats, 'getStatsDayOccurrences'),
    between(tareas, 'function createTaskCard(', '// Añade a un checkbox'),
    read('app-7-resultados.js'),
    between(search, '// ─── Buscador ────────────────────────────────────────────────────────────────\n// Normaliza', '// Texto plano de los resultados'),
    fn(et, 'openBuscadorModal'), fn(search, 'buildBuscadorExportText'),
    'document.addEventListener("DOMContentLoaded",()=>{});(function(){' + between(search, '  const buscadorCancelBtn', '  // Exportar resultados (.txt)') + '})();'
  ];
  for (const content of scripts) await page.addScriptTag({ content });
  const txt = id => page.locator('#' + id).innerText();
  const vis = sel => page.locator(sel).evaluate(el => !el.classList.contains('hidden') && !el.hidden);

  // Abre con "Desde siempre" + "Mostrar todo" y resultados ya calculados.
  await page.evaluate(() => openBuscadorModal());
  assert.equal(await page.inputValue('#buscador-period'), 'all');
  assert.equal(await page.inputValue('#buscador-status'), 'all');
  assert.equal(await txt('buscador-repetitions'), '3');
  assert.equal(await txt('buscador-notes-count'), '2');
  // Al escribir no cambia por cada tecla; sí al dejar de escribir.
  await page.locator('#buscador-keyword').pressSequentially('futura', { delay: 60 });
  assert.equal(await txt('buscador-repetitions'), '3');
  await page.waitForTimeout(700);
  assert.equal(await txt('buscador-repetitions'), '1');
  // Varias palabras en cualquier orden + notas.
  await page.fill('#buscador-keyword', 'juan reunion');
  await page.waitForTimeout(700);
  assert.equal(await txt('buscador-repetitions'), '2');
  await page.fill('#buscador-keyword', 'juan');
  await page.waitForTimeout(700);
  assert.equal(await txt('buscador-repetitions'), '3');
  assert.equal(await txt('buscador-notes-count'), '2');
  // Un filtro actualiza de inmediato y se recuerda.
  await page.selectOption('#buscador-status', 'completed');
  assert.equal(await txt('buscador-repetitions'), '1');
  await page.uncheck('#buscador-include-notes');
  assert(!(await vis('#buscador-notes-row')));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('buscador_filtros_u1')));
  assert.equal(saved.status, 'completed'); assert.equal(saved.notes, false);
  await page.evaluate(() => { document.getElementById('buscador-modal').classList.add('hidden'); openBuscadorModal(); });
  assert.equal(await page.inputValue('#buscador-status'), 'completed');
  assert.equal(await page.isChecked('#buscador-include-notes'), false);
  assert.equal(await page.inputValue('#buscador-keyword'), '');
  await page.selectOption('#buscador-status', 'all');
  await page.check('#buscador-include-notes');
  // Enter: actualiza ya y abre los resultados con tarjetas de notas.
  await page.fill('#buscador-keyword', 'juan');
  await page.press('#buscador-keyword', 'Enter');
  assert(await vis('#task-results-modal'));
  assert.equal(await page.locator('#task-results-title').innerText(), 'Resultados (5)');
  assert.equal(await page.locator('.buscador-note-card').count(), 2);
  assert.equal(await page.locator('.buscador-note-card mark').count(), 2);
  // Nota del día: abre su ventana y vuelve a los resultados al cerrarla.
  await page.locator('.buscador-note-card[data-kind="day"]').click();
  assert.equal(await page.evaluate(() => window.openedNote), '2026-10-06');
  assert(!(await vis('#task-results-modal')));
  await page.evaluate(() => document.getElementById('notes-modal').classList.add('hidden'));
  await page.waitForFunction(() => !document.getElementById('task-results-modal').classList.contains('hidden'));
  // Nota de hábito: abre Hábitos; vuelve solo al cerrar Hábitos.
  await page.locator('.buscador-note-card[data-kind="habit"]').click();
  const detail = await page.evaluate(() => ({ b: habitNote.blockId, h: habitNote.habitId, d: habitNote.date }));
  assert.deepEqual(detail, { b: 'b1', h: 'h1', d: '2026-10-07' });
  await page.waitForTimeout(100);
  assert(!(await vis('#task-results-modal')));
  await page.evaluate(() => { document.getElementById('habitos-tool').hidden = true; });
  await page.waitForFunction(() => !document.getElementById('task-results-modal').classList.contains('hidden'));
  // Exportar incluye las notas.
  await page.evaluate(() => {
    ['bexp-opt-date'].forEach(id => { const el = document.getElementById(id); if (el) el.checked = true; });
  });
  const exported = await page.evaluate(() => (window.formatSingleDate = d => d.toDateString(), buildBuscadorExportText)({ includeDate: true }));
  assert.match(exported, /- Nota del día: Llamar a Juan/);
  assert.match(exported, /- Nota de hábito \(Leer\): Libro que recomendó Juan/);
  assert.deepEqual(errors, []);
  console.log('Buscador UI: OK');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });

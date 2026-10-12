// Node + Playwright en NODE_PATH. Interfaz real, cuentas ficticias, sin red externa.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(base, name), 'utf8');
const iconTags = JSON.parse(read('app-8-habitos.js').match(/const HABIT_ICON_TAGS = Object.freeze\(([\s\S]*?)\);/)[1]);
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error(error); });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'planner7.test') return route.abort();
      const file = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1));
      if (file.includes('..')) return route.abort();
      return file === 'index.html' ? route.fulfill({ contentType: 'text/html', body: read(file).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '') }) : route.fulfill({ path: path.join(base, file) });
    });
    async function boot(user = 'alice') {
      // HTTP con hostname no local: reproduce el acceso por IP sin randomUUID.
      await page.goto('http://planner7.test/');
      await page.evaluate(user => {
        document.getElementById('splash-screen')?.remove();
        document.body.classList.remove('not-logged-in');
        document.querySelectorAll('.modal-backdrop').forEach(el => el.classList.add('hidden'));
        window.currentUser = { id: user };
        window.fakeCloud = JSON.parse(localStorage.getItem('test-cloud') || '{}');
        window.offline = false;
        window.ops = [];
        window.showAuthScreen = () => { window.authShown = true; };
        window.showHistoryNotification = text => { window.notice = text; };
        window.plannerKeys = 0;
        window.addEventListener('keydown', () => window.plannerKeys++);
        window.sb = {
          auth: { onAuthStateChange(callback) { window.authCallback = callback; } },
          from(table) {
            if (table !== 'habit_data') throw new Error('El módulo accedió a otra tabla');
            const query = {
              op: 'select', filters: {},
              select() { return this; },
              eq(key, value) { this.filters[key] = value; return this; },
              insert(value) { this.op = 'insert'; this.value = value; return this; },
              update(value) { this.op = 'update'; this.value = value; return this; },
              async maybeSingle() {
                const id = this.value?.user_id || this.filters.user_id;
                window.ops.push({ table, op: this.op, id });
                if (window.offline) return { error: { message: 'Sin conexión' } };
                const row = window.fakeCloud[id];
                if (this.op === 'select') return { data: row ? structuredClone(row) : null };
                if (this.op === 'insert' && row) return { error: { code: '23505' } };
                if (this.op === 'update' && (!row || row.revision !== this.filters.revision)) return { data: null };
                const next = structuredClone(this.value);
                window.fakeCloud[id] = next;
                localStorage.setItem('test-cloud', JSON.stringify(window.fakeCloud));
                return { data: { revision: next.revision } };
              }
            };
            return query;
          }
        };
      }, user);
      const calendar = read('app-2-calendario.js');
      await page.addScriptTag({ content: calendar.slice(calendar.indexOf('function setSaveStatus('), calendar.indexOf('// Muestra un mensaje breve centrado')) });
      await page.addScriptTag({ content: read('app-8-habitos.js') });
    }
    const tool = page.locator('#habitos-tool'); // Playwright atraviesa Shadow DOM.
    const shadow = selector => tool.locator(selector);
    const open = async () => { await page.locator('#habitos-btn').click(); await tool.waitFor({ state: 'visible' }); };
    const saved = async () => { await page.waitForFunction(() => document.getElementById('habitos-tool').shadowRoot.getElementById('cloud-status').textContent === 'Guardado en tu cuenta'); };
    const cache = user => page.evaluate(user => JSON.parse(localStorage.getItem('planner7.habitos.v1:' + user)), user);

    await boot();
    assert.equal(await page.evaluate(() => typeof crypto.randomUUID), 'undefined');
    await page.evaluate(() => localStorage.setItem('habit-tracker.history.v2', '{"private":"prototipo"}'));
    const bodyFont = await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily);
    await open();
    assert.equal(await shadow('#habit-record-heading').textContent(), 'Registro');
    assert(await shadow('#habit-record-heading').isVisible());
    assert.match(await shadow('#selected-record-label').textContent(), /^Actual \(.+ — .+\)$/);
    assert(!(await shadow('.cloud-sync').isVisible()), 'El estado normal no sustituye el título Registro');
    assert.equal(await shadow('.habit-heading').count(), 5);
    assert.equal(await shadow('.habit-heading:not(.empty)').count(), 0);
    assert.equal(await shadow('.habit-cell').count(), 0);
    assert.equal(await shadow('.habit-row').count(), 1, 'Sin datos solo se muestra hoy');
    assert.equal(await shadow('.test-controls').count(), 0);
    assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily), bodyFont);
    assert.equal(await shadow('.tracker-body').evaluate(el => getComputedStyle(el).display), 'flex');
    assert.equal(await shadow('.tracker-body').evaluate(el => parseInt(getComputedStyle(el).paddingLeft, 10)), 24);
    assert(await page.locator('.app-container').evaluate(el => el.inert));
    assert.equal((await page.evaluate(() => ops)).filter(op => op.op !== 'select').length, 0, 'Abrir no crea datos');

    await shadow('.habit-heading.empty').first().click();
    await shadow('#habit-name').fill('Leer cada día');
    await shadow('#choose-habit-icon').click();
    const iconCount = await shadow('#icon-picker button').count();
    const iconSizes = await shadow('#icon-picker svg').evaluateAll(icons => icons.map(svg => ({ height: svg.getBoundingClientRect().height, width: svg.getBoundingClientRect().width })));
    assert(iconSizes.every(size => Math.abs(size.height - 24.64) < .1), 'Todos los iconos del selector son un 12% menores');
    assert(Math.abs((await shadow('#selected-habit-icon').boundingBox()).height - 21.12) < .1, 'La vista previa también se reduce un 12%');
    assert(new Set(iconSizes.map(size => Math.round(size.width))).size > 1, 'El ancho conserva la proporción de cada dibujo');
    const strokeSizes = await shadow('#icon-picker svg').evaluateAll(icons => icons.flatMap(svg => [...svg.querySelectorAll('path,circle,ellipse,line,polyline,polygon,rect')].filter(shape => getComputedStyle(shape).stroke !== 'none').map(shape => ({ width: getComputedStyle(shape).strokeWidth, effect: getComputedStyle(shape).vectorEffect }))));
    assert(strokeSizes.length > 0);
    assert(strokeSizes.every(stroke => stroke.width === '2.25px' && stroke.effect === 'non-scaling-stroke'), 'Grosor uniforme de 2,25 píxeles independiente de la escala');
    if (process.env.HABITOS_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.HABITOS_SCREENSHOTS, 'habitos-iconos.png') });
    assert.equal(await shadow('#icon-picker').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 5);
    const iconFiles = await shadow('#icon-picker button').evaluateAll(buttons => buttons.map(button => button.dataset.icon));
    for (const removed of ['lucide/sun-medium.svg', 'lucide/music-4.svg', 'lucide/square-pen.svg', 'lucide/clock-4.svg', 'target.svg', 'droplets.svg', 'lucide/shield-plus.svg']) {
      assert(!iconFiles.includes(removed), `Variante redundante fuera del selector: ${removed}`);
    }
    for (const retained of ['sun.svg', 'music.svg', 'edit.svg', 'clock.svg', 'target-arrow.svg', 'lucide/droplet.svg', 'lucide/shield-check.svg']) {
      assert(iconFiles.includes(retained), `Se conserva una opción de cada par: ${retained}`);
    }
    for (const icon of iconFiles) {
      const tags = iconTags[icon.split('/').pop().replace(/\.svg$/, '')];
      assert.equal(tags?.length, 5, `Cinco etiquetas para ${icon}`);
      assert.equal(new Set(tags).size, 5, `Etiquetas distintas para ${icon}`);
    }
    assert.equal(await shadow('#habit-icon-search').evaluate(el => el.getRootNode().activeElement.id), 'habit-icon-search');
    await shadow('#habit-icon-search').fill('  HIDRATACION  ');
    assert.equal(await shadow('#icon-picker button').count(), 1);
    assert.equal(await shadow('#icon-picker button').getAttribute('data-icon'), 'lucide/droplet.svg');
    assert.equal(await shadow('#icon-picker button').getAttribute('title'), 'droplet');
    assert(!(await shadow('#icon-dialog').textContent()).includes('hidratación'), 'Etiquetas invisibles');
    await shadow('#habit-icon-search').fill('gaming');
    assert.equal(await shadow('#icon-picker button').getAttribute('data-icon'), 'lucide/gamepad-2.svg');
    await shadow('#habit-icon-search').fill('letra z');
    assert.equal(await shadow('#icon-picker button').count(), 1);
    assert.equal(await shadow('#icon-picker button').getAttribute('data-icon'), 'letter-z.svg');
    await shadow('#habit-icon-search').fill('nueve');
    assert.equal(await shadow('#icon-picker button').getAttribute('data-icon'), 'number-9.svg');
    await shadow('#habit-icon-search').fill('sin-coincidencia-xyz');
    assert.equal(await shadow('#icon-picker button').count(), 0);
    assert(await shadow('#icon-search-empty').isVisible());
    await shadow('#habit-icon-search').fill('');
    assert.equal(await shadow('#icon-picker button').count(), iconCount);
    assert(!(await shadow('#icon-search-empty').isVisible()));
    await shadow('#habit-icon-search').fill('lectura');
    assert(await shadow('#icon-picker button[title="Libro"]').isVisible());
    await shadow('#icon-picker button[title="Libro"]').click();
    assert.equal(await shadow('#habit-icon-value').evaluate(el => el.value), 'book-open.svg');
    await shadow('#choose-habit-icon').click();
    assert.equal(await shadow('#habit-icon-search').evaluate(el => el.value), '');
    assert.equal(await shadow('#icon-picker button').count(), iconCount);
    assert.equal(await shadow('#icon-picker button[title="Libro"]').getAttribute('aria-pressed'), 'true');
    await shadow('#close-icon-dialog').click();
    const selectorBeforeSave = await shadow('#record-selector-toggle').boundingBox();
    await shadow('#save-habit').click();
    assert(!(await shadow('.cloud-sync').isVisible()), 'Guardar no muestra mensajes dentro de la cuadrícula');
    assert(!(await shadow('#change-dialog').evaluate(el => el.open)), 'El primer hábito no pregunta por otro registro');
    await saved();
    assert.equal(await page.locator('#save-status').textContent(), 'Guardado ✓');
    assert(await page.locator('#save-status').evaluate(el => el.classList.contains('saved') && el.classList.contains('visible')));
    assert.equal(await page.locator('#save-status').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
    assert.deepEqual(await shadow('#record-selector-toggle').boundingBox(), selectorBeforeSave, 'Los controles mantienen su posición al guardar');
    assert((await cache('alice')).data.blocks[0].habits.some(h => h?.name === 'Leer cada día'));
    assert.match((await cache('alice')).data.blocks[0].id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.match((await cache('alice')).data.blocks[0].habits.find(h => h?.name === 'Leer cada día').id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    await page.keyboard.press('Control+z');
    assert.equal(await shadow('.habit-heading:not(.empty)').count(), 0, 'Deshacer creación');
    await page.keyboard.press('Control+y');
    assert.equal(await shadow('.habit-heading[title="Leer cada día"]').count(), 1, 'Rehacer creación');
    await saved();
    await shadow('.habit-cell').first().click();
    const readingBeforeDelete = (await cache('alice')).data;
    await saved();
    await shadow('.habit-heading[title="Leer cada día"]').click();
    await shadow('#delete-habit').click();
    if (await shadow('#change-dialog').evaluate(el => el.open)) await shadow('#modify-record').click();
    await saved();
    const deletedData = (await cache('alice')).data;
    assert.equal(deletedData.blocks[0].habits.filter(Boolean).length, 0);
    assert.deepEqual(deletedData.blocks[0].records, {});
    assert(!('retiredHabits' in deletedData.blocks[0]));
    assert.equal(await shadow('.retired-record').count(), 0);
    await page.keyboard.press('Control+z');
    assert.deepEqual((await cache('alice')).data, readingBeforeDelete, 'Deshacer recupera hábito y marcas');
    await page.keyboard.press('Control+y');
    assert.equal(await shadow('.habit-cell').count(), 0, 'Rehacer borrado');
    await page.keyboard.press('Control+z');
    await saved();
    await shadow('.habit-cell').first().click();
    const branched = (await cache('alice')).data;
    await page.keyboard.press('Control+y');
    assert.deepEqual((await cache('alice')).data, branched, 'Una nueva edición descarta rehacer');
    await page.keyboard.press('Control+z');
    // Renombrar y cambiar icono se deshace como una sola edición.
    await shadow('.habit-heading[title="Leer cada día"]').click();
    await shadow('#habit-name').fill('Leer novelas');
    await shadow('#choose-habit-icon').click();
    await shadow('#habit-icon-search').fill('hidratacion');
    await shadow('#icon-picker button').click();
    await shadow('#save-habit').click();
    if (await shadow('#change-dialog').evaluate(el => el.open)) await shadow('#modify-record').click();
    await page.keyboard.press('Control+z');
    assert.equal(await shadow('.habit-heading[title="Leer cada día"] svg').getAttribute('data-icon'), 'book-open.svg');
    await page.keyboard.press('Control+y');
    assert.equal(await shadow('.habit-heading[title="Leer novelas"] svg').getAttribute('data-icon'), 'lucide/droplet.svg');
    await page.keyboard.press('Control+z');
    await shadow('.habit-heading[title="Leer cada día"]').click();
    const beforeDraft = (await cache('alice')).data;
    await shadow('#habit-name').press('End');
    await shadow('#habit-name').pressSequentially(' borrador');
    await page.keyboard.press('Control+z');
    assert(await shadow('#habit-editor').evaluate(el => el.open), 'Deshacer texto mantiene el editor');
    assert.deepEqual((await cache('alice')).data, beforeDraft, 'Deshacer nativo no cambia hábitos guardados');
    assert.equal(await shadow('#habit-name').inputValue(), 'Leer cada día');
    await shadow('#cancel-editor').click();
    // Preferencia de vista y marcas participan en el mismo historial.
    await shadow('#hide-empty-days').check();
    await page.keyboard.press('Control+z');
    assert(!(await shadow('#hide-empty-days').isChecked()));
    await page.keyboard.press('Control+y');
    assert(await shadow('#hide-empty-days').isChecked());
    await page.keyboard.press('Control+z');
    await shadow('.habit-row time').first().click({ modifiers: ['Control'] });
    assert.deepEqual((await cache('alice')).data.blocks[0].records, {});
    await page.keyboard.press('Control+z');
    assert.deepEqual((await cache('alice')).data.blocks[0].records, readingBeforeDelete.blocks[0].records);
    // Un registro real iniciado ayer conserva su período y ofrece actualizarlo.
    await saved();
    await shadow('#close-tracker').click();
    await page.evaluate(() => {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate()-1);
      fakeCloud.alice.data.blocks[0].startDate = yesterday.getFullYear() + '-' + String(yesterday.getMonth()+1).padStart(2,'0') + '-' + String(yesterday.getDate()).padStart(2,'0');
      fakeCloud.alice.revision++;
      localStorage.setItem('test-cloud', JSON.stringify(fakeCloud));
    });
    await open();
    assert.equal(await shadow('.habit-row').count(), 2, 'Un registro con historial conserva sus días');
    await shadow('.habit-heading[title="Leer cada día"]').click();
    await shadow('#habit-name').fill('Leer diariamente');
    await shadow('#save-habit').click();
    assert(await shadow('#change-dialog').evaluate(el => el.open));
    assert.equal(await shadow('#modify-record').textContent(), 'Actualizar registro actual');
    assert(await shadow('#modify-record').evaluate(el => el.classList.contains('primary')));
    assert(!(await shadow('#new-record').evaluate(el => el.classList.contains('primary'))));
    assert.equal(await shadow('.change-options button').first().getAttribute('id'), 'modify-record');
    await shadow('#modify-record').click();
    await page.keyboard.press('Control+z');
    await saved();
    // Crear y borrar un registro; deshacer restaura períodos e historial completos.
    await shadow('#record-selector-toggle').click();
    await shadow('#create-record').click();
    const twoRecords = (await cache('alice')).data;
    assert.equal(twoRecords.blocks.length, 2);
    await page.keyboard.press('Control+z');
    assert.equal((await cache('alice')).data.blocks.length, 1);
    await page.keyboard.press('Control+y');
    assert.deepEqual((await cache('alice')).data, twoRecords);
    await shadow('#record-selector-toggle').click();
    assert.match(await shadow('.record-option-select').nth(0).textContent(), /^N°1 \(.+ — .+\)$/);
    assert.match(await shadow('.record-option-select').nth(1).textContent(), /^Actual \(.+ — .+\)$/);
    await shadow('.delete-record').first().click();
    await shadow('#confirm-delete-record').click();
    assert.equal((await cache('alice')).data.blocks.length, 1);
    await page.keyboard.press('Control+z');
    assert.deepEqual((await cache('alice')).data, twoRecords);
    await page.keyboard.press('Control+z'); // Volver a un registro para las pruebas de nube.
    await saved();
    await shadow('#close-tracker').click();
    // Hábitos de prueba creados explícitamente en una cuenta ya existente.
    await page.evaluate(() => {
      const block = fakeCloud.alice.data.blocks[0];
      block.habits = [
        { id: 'sun', name: 'Sol usuario', icon: 'sun.svg' },
        { id: 'exercise', name: 'Ejercicio usuario', icon: 'dumbbell.svg' },
        { id: 'food', name: 'Comida usuario', icon: 'cooking.svg' },
        ...block.habits.filter(Boolean)
      ];
      fakeCloud.alice.revision++;
      localStorage.setItem('test-cloud', JSON.stringify(fakeCloud));
    });
    await open();
    const originalOrder = (await cache('alice')).data.blocks[0].habits;
    const from = await shadow('.habit-heading[data-habit="sun"]').boundingBox();
    const to = await shadow('.habit-heading[data-habit="food"]').boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500); // Activación real del arrastre por pulsación larga.
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 });
    await page.mouse.up();
    const reordered = (await cache('alice')).data.blocks[0].habits;
    assert.notDeepEqual(reordered, originalOrder);
    await page.keyboard.press('Control+z');
    assert.deepEqual((await cache('alice')).data.blocks[0].habits, originalOrder);
    await page.keyboard.press('Control+y');
    assert.deepEqual((await cache('alice')).data.blocks[0].habits, reordered);
    await page.keyboard.press('Control+z');
    const cell = shadow('.habit-cell[data-habit="sun"]').first();
    await cell.click();
    assert.equal(await cell.getAttribute('data-state'), 'completed');
    await saved();
    await cell.click();
    assert.equal(await cell.getAttribute('data-state'), 'failed');
    await cell.click();
    assert.equal(await cell.getAttribute('data-state'), 'pending');
    await cell.click();
    await saved();
    await shadow('#close-tracker').click();
    await open();
    await page.keyboard.press('Control+z');
    assert.equal(await cell.getAttribute('data-state'), 'pending', 'Historial disponible tras cerrar y abrir el panel');
    await page.keyboard.press('Control+y');
    assert.equal(await cell.getAttribute('data-state'), 'completed');
    await saved();
    if (process.env.HABITOS_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.HABITOS_SCREENSHOTS, 'habitos-desktop.png') });
    await shadow('#show-stats').click();
    assert(await shadow('#stats-dialog').evaluate(el => el.open));
    await shadow('#stats-chart-type').selectOption('squares');
    assert(await shadow('#stats-habit-chart .stats-day').count() > 0);
    await shadow('#stats-show').selectOption('custom');
    assert(await shadow('#stats-range-dialog').evaluate(el => el.open));
    await page.keyboard.press('Escape');
    assert(await tool.isVisible(), 'Escape en subventana no cierra herramienta');
    await page.keyboard.press('Escape');
    assert(await tool.isVisible());
    await shadow('#close-tracker').click();
    assert(!(await page.locator('.app-container').evaluate(el => el.inert)));
    assert.equal(await page.evaluate(() => document.activeElement.id), 'habitos-btn');

    await boot();
    await open();
    assert.equal(await shadow('.habit-heading[title="Leer cada día"]').count(), 1);
    assert.equal(await shadow('.habit-cell[data-habit="sun"]').first().getAttribute('data-state'), 'completed');
    await page.evaluate(() => { window.offline = true; });
    const selectorBeforeOffline = await shadow('#record-selector-toggle').boundingBox();
    await shadow('.habit-cell[data-habit="exercise"]').first().click();
    await page.waitForFunction(() => document.getElementById('habitos-tool').shadowRoot.getElementById('cloud-status').textContent.includes('no se pudo sincronizar'));
    assert((await cache('alice')).pending);
    assert.deepEqual(await shadow('#record-selector-toggle').boundingBox(), selectorBeforeOffline, 'Los errores tampoco desplazan los controles');
    await shadow('#close-tracker').click();
    await open();
    assert.equal(await shadow('.habit-cell[data-habit="exercise"]').first().getAttribute('data-state'), 'completed');
    await page.evaluate(() => { window.offline = false; });
    await shadow('#cloud-retry').click();
    await saved();
    assert(!(await cache('alice')).pending);

    // Otro dispositivo avanza revisión: nunca sobrescribir sin elección explícita.
    await page.evaluate(() => { window.fakeCloud.alice.revision++; window.fakeCloud.alice.data.blocks[0].habits[0].name = 'Sol desde otra sesión'; });
    await shadow('.habit-cell[data-habit="sun"]').first().click();
    await shadow('#cloud-remote').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => fakeCloud.alice.data.blocks[0].habits[0].name), 'Sol desde otra sesión');
    await page.evaluate(() => { window.offline = true; });
    await shadow('#cloud-remote').click();
    assert(await shadow('#cloud-remote').isVisible(), 'Un error al resolver permite reintentar elección');
    await page.evaluate(() => { window.offline = false; });
    await shadow('#cloud-remote').click();
    await saved();
    assert.equal(await shadow('.habit-heading[title="Sol desde otra sesión"]').count(), 1);
    assert(await page.evaluate(() => Boolean(localStorage.getItem('planner7.habitos.v1:alice.recovery'))));
    await page.evaluate(() => { window.fakeCloud.alice.revision++; });
    await shadow('.habit-cell[data-habit="sun"]').first().click();
    await shadow('#cloud-local').waitFor({ state: 'visible' });
    await shadow('#cloud-local').click();
    await saved();
    assert.equal(await shadow('.habit-cell[data-habit="sun"]').first().getAttribute('data-state'), 'failed');

    // Copia limpia disponible sin conexión, y botón de recarga funcional.
    await shadow('#close-tracker').click();
    await page.evaluate(() => { window.offline = true; });
    await open();
    assert((await shadow('#cloud-status').textContent()).includes('mostrando la copia'));
    await page.evaluate(() => { window.offline = false; });
    await shadow('#cloud-retry').click();
    await saved();

    // Sin espacio local, la marca y el historial vuelven al último estado durable.
    const beforeQuota = await cache('alice');
    await page.evaluate(() => {
      window.originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key.startsWith('planner7.habitos.v1:')) throw new DOMException('Sin espacio', 'QuotaExceededError');
        return window.originalSetItem.call(this, key, value);
      };
    });
    await shadow('.habit-cell[data-habit="sun"]').first().click();
    assert.equal(await shadow('.habit-cell[data-habit="sun"]').first().getAttribute('data-state'), 'failed');
    assert((await shadow('#cloud-status').textContent()).includes('se revirtió'));
    assert.deepEqual(await cache('alice'), beforeQuota);
    await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });

    // Cambio de cuenta desmonta ventanas y no adopta datos de otra persona.
    await page.evaluate(() => { window.currentUser = { id: 'bob' }; window.authCallback('SIGNED_IN', { user: window.currentUser }); });
    assert(await tool.isHidden());
    await open();
    assert.equal(await shadow('.habit-heading[title="Leer cada día"]').count(), 0);
    assert.equal(await shadow('.habit-heading:not(.empty)').count(), 0);
    await page.keyboard.press('Control+z');
    assert.equal(await shadow('.habit-heading:not(.empty)').count(), 0, 'Historial aislado por cuenta');
    await shadow('.habit-heading.empty').first().click();
    await shadow('#habit-name').fill('Comida Bob');
    await shadow('#save-habit').click();
    if (await shadow('#change-dialog').evaluate(el => el.open)) await shadow('#modify-record').click();
    await shadow('.habit-cell').first().click();
    await saved();
    assert.equal((await cache('bob')).user_id, 'bob');
    assert.equal((await cache('alice')).data.blocks[0].habits[0].name, 'Sol desde otra sesión');
    assert.equal(await page.evaluate(() => localStorage.getItem('habit-tracker.history.v2')), '{"private":"prototipo"}');
    assert.equal(await page.evaluate(() => plannerKeys), 0, 'Teclas de hábitos aisladas de Planner');
    await page.setViewportSize({ width: 380, height: 780 });
    assert(Math.abs((await shadow('.habit-heading:not(.empty) svg').first().boundingBox()).height - 21.12) < .1, 'La reducción también se aplica a los registros en móvil');
    assert(await shadow('.tracker').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
    if (process.env.HABITOS_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.HABITOS_SCREENSHOTS, 'habitos-mobile.png') });
    await shadow('#close-tracker').click();

    // Compatibilidad con datos antiguos: sin sección retirada ni marcas huérfanas.
    await page.evaluate(() => {
      const habit = { id: 'shared', name: 'Rutina activa', icon: 'sun.svg' };
      const today = new Date();
      const key = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
      fakeCloud.legacy = { revision: 1, data: { version: 2, blocks: [
        { id:'current-legacy', startDate:'2026-10-11', endDate:null, habits:[habit,...Array(6).fill(null)],
          retiredHabits:[{id:'removed',name:'Ya eliminado',icon:'book-open.svg'}], records:{[key+':shared']:'completed',[key+':removed']:'completed'} },
        { id:'older-legacy',startDate:'2026-10-10',endDate:'2026-10-10',habits:[habit,...Array(6).fill(null)],retiredHabits:[],records:{'2026-10-10:shared':'failed'} }
      ] } };
      currentUser = { id: 'legacy' }; authCallback('SIGNED_IN', { user: currentUser });
    });
    await open();
    assert.equal(await shadow('.retired-record').count(), 0);
    const legacyData = (await cache('legacy')).data;
    assert(legacyData.blocks.every(block => !('retiredHabits' in block)));
    assert(!Object.keys(legacyData.blocks[0].records).some(key => key.endsWith(':removed')));
    const olderData = legacyData.blocks[1];
    await shadow('.habit-heading[data-habit="shared"]').click();
    await shadow('#delete-habit').click();
    if (await shadow('#change-dialog').evaluate(el => el.open)) await shadow('#modify-record').click();
    await saved();
    assert.deepEqual((await cache('legacy')).data.blocks[0].records, {});
    assert.deepEqual((await cache('legacy')).data.blocks[1], olderData, 'Borrar de un registro no cambia otros registros');
    await page.keyboard.press('Control+z');
    assert.deepEqual((await cache('legacy')).data, legacyData);
    await page.keyboard.press('Control+y');
    assert.deepEqual((await cache('legacy')).data.blocks[0].records, {});
    await saved();
    await shadow('#close-tracker').click();

    // Una cuenta sin copia no genera un historial vacío cuando falla la carga.
    await page.evaluate(() => { window.currentUser = { id: 'charlie' }; window.authCallback('SIGNED_IN', { user: window.currentUser }); window.offline = true; });
    await page.locator('#habitos-btn').click();
    await page.waitForFunction(() => Boolean(window.notice));
    assert(await tool.isHidden());
    assert.equal(await cache('charlie'), null);
    assert(!(await page.evaluate(() => ops)).some(op => op.id === 'charlie' && op.op !== 'select'));
    await page.evaluate(() => { window.currentUser = null; window.authCallback('SIGNED_OUT', null); });
    await page.locator('#habitos-btn').click();
    assert(await page.evaluate(() => window.authShown));
    assert.deepEqual(errors, []);
    console.log('OK: inicio vacío, iconos, borrado, deshacer/rehacer, registros, nube, cuentas y móvil');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });



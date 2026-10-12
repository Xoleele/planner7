// Node + Playwright en NODE_PATH. Interfaz real, cuentas ficticias, sin red externa.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(base, name), 'utf8');
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
    assert.equal(await shadow('.habit-heading').count(), 7);
    assert.equal(await shadow('.test-controls').count(), 0);
    assert.equal(await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily), bodyFont);
    assert.equal(await shadow('.tracker-body').evaluate(el => getComputedStyle(el).display), 'flex');
    assert.equal(await shadow('.tracker-body').evaluate(el => parseInt(getComputedStyle(el).paddingLeft, 10)), 24);
    assert(await page.locator('.app-container').evaluate(el => el.inert));
    assert.equal((await page.evaluate(() => ops)).filter(op => op.op !== 'select').length, 0, 'Abrir no crea datos');

    await shadow('.habit-heading.empty').click();
    await shadow('#habit-name').fill('Leer cada día');
    await shadow('#choose-habit-icon').click();
    await shadow('#icon-picker button[title="Libro"]').click();
    await shadow('#save-habit').click();
    if (await shadow('#change-dialog').evaluate(el => el.open)) await shadow('#modify-record').click();
    await saved();
    assert((await cache('alice')).data.blocks[0].habits.some(h => h?.name === 'Leer cada día'));
    assert.match((await cache('alice')).data.blocks[0].id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.match((await cache('alice')).data.blocks[0].habits.find(h => h?.name === 'Leer cada día').id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
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
    await shadow('.habit-cell[data-habit="exercise"]').first().click();
    await page.waitForFunction(() => document.getElementById('habitos-tool').shadowRoot.getElementById('cloud-status').textContent.includes('no se pudo sincronizar'));
    assert((await cache('alice')).pending);
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
    assert.equal(await shadow('.habit-cell[data-habit="sun"]').first().getAttribute('data-state'), 'pending');
    await shadow('.habit-cell[data-habit="food"]').first().click();
    await saved();
    assert.equal((await cache('bob')).user_id, 'bob');
    assert.equal((await cache('alice')).data.blocks[0].habits[0].name, 'Sol desde otra sesión');
    assert.equal(await page.evaluate(() => localStorage.getItem('habit-tracker.history.v2')), '{"private":"prototipo"}');
    assert.equal(await page.evaluate(() => plannerKeys), 0, 'Teclas de hábitos aisladas de Planner');
    await page.setViewportSize({ width: 380, height: 780 });
    assert(await shadow('.tracker').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
    if (process.env.HABITOS_SCREENSHOTS) await page.screenshot({ path: path.join(process.env.HABITOS_SCREENSHOTS, 'habitos-mobile.png') });
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
    console.log('OK: hábitos, nube, copia local, conflictos, cuentas, teclado y móvil');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });



// Escape en todos los paneles reales del HTML, con cierres de negocio aislados.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const base = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(base, name), 'utf8');
(async () => {
  const browser = await chromium.launch({ channel:'msedge', headless:true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.abort());
    await page.setContent(read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link\b[^>]*>/g, ''));
    await page.addStyleTag({ content:read('style.css') });
    await page.evaluate(() => {
      document.getElementById('splash-screen')?.remove();
      document.querySelectorAll('.modal-backdrop').forEach(modal => modal.classList.add('hidden'));
      window.currentUser = { id:'test' };
      window.selectedTaskId = null;
      window.timerStartTime = null;
      window.undo = window.redo = () => false;
      const closers = {
        closeConfirmModal:'confirm-modal', closeTaskModal:'task-modal', closeEditRecurringModal:'edit-recurring-modal',
        closeAdjacentTasksModal:'adjacent-tasks-modal', closeDeleteTaskConfirmModal:'delete-task-confirm-modal',
        closeTagsModal:'tags-modal', closeTagEditModal:'tag-edit-modal', closeNewTagPromptModal:'new-tag-prompt-modal',
        closeDeleteTagModal:'delete-tag-modal', closeSettingsModal:'settings-modal', closeArchiveListsModal:'archive-lists-modal',
        closeArchiveDeleteModal:'archive-delete-modal', closeCopyTextModal:'copy-text-modal',
        closeGeneralStatsCustomRangeModal:'general-stats-custom-range-modal', closeNotesModal:'notes-modal',
        closeNoteTemplateModal:'note-template-modal', cancelDailyNotesClose:'notes-unsaved-modal',
        closeChangePasswordModal:'change-password-modal', closeDeleteAccountModal:'delete-account-modal',
        closeTaskResultsPanel:'task-results-modal'
      };
      for (const [name,id] of Object.entries(closers)) window[name] = () => document.getElementById(id).classList.add('hidden');
      window.closeStatsTaskEditView = () => document.getElementById('daily-stats-edit-content').classList.add('hidden');
      window.cancelDailyStatsSettings = () => document.getElementById('daily-stats-settings-content').classList.add('hidden');
      window.toggleBriefcaseDrawer = () => document.getElementById('briefcase-drawer').classList.add('closed');
      document.querySelectorAll('.close-modal-btn[data-modal]').forEach(button => button.onclick = () => document.getElementById(button.dataset.modal).classList.add('hidden'));
    });
    const source = read('app-6-herramientas.js');
    await page.addScriptTag({ content:source.slice(source.indexOf('function handleGlobalEscape()'), source.indexOf('// Devuelve la hora actual')) });
    const listenerStart = source.indexOf("  window.addEventListener('keydown', (e) => {");
    await page.addScriptTag({ content:source.slice(listenerStart, source.indexOf('  // El botón de etiquetas', listenerStart)) });
    const panels = await page.locator('.modal-backdrop').evaluateAll(modals => modals.map(modal => modal.id));
    for (const id of panels) {
      await page.evaluate(id => document.getElementById(id).classList.remove('hidden'), id);
      await page.keyboard.press('Escape');
      assert(await page.locator('#' + id).evaluate(modal => modal.classList.contains('hidden')), `Escape cierra ${id}`);
    }
    // Un subpanel se cierra sin ocultar el padre ni repetir al mantener Escape.
    await page.evaluate(() => {
      document.getElementById('settings-modal').classList.remove('hidden');
      const subpanel = document.getElementById('change-password-modal');
      subpanel.style.zIndex = '99999';
      subpanel.classList.remove('hidden');
    });
    await page.keyboard.press('Escape');
    assert(await page.locator('#settings-modal').isVisible());
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key:'Escape', repeat:true, cancelable:true })));
    assert(await page.locator('#settings-modal').isVisible());
    await page.keyboard.press('Escape');
    assert(await page.locator('#settings-modal').isHidden());
    // Cerrar un dialog nativo ejecuta cancel antes de close y conserva el padre.
    await page.evaluate(() => {
      document.getElementById('settings-modal').classList.remove('hidden');
      const dialog = document.createElement('dialog');
      dialog.id = 'escape-native-dialog';
      dialog.innerHTML = '<input aria-label="Prueba">';
      dialog.addEventListener('cancel', () => window.nativeCancelled = true);
      document.body.append(dialog);
      dialog.showModal();
    });
    await page.keyboard.press('Escape');
    assert(await page.evaluate(() => nativeCancelled));
    assert(!(await page.locator('#escape-native-dialog').evaluate(dialog => dialog.open)));
    assert(await page.locator('#settings-modal').isVisible());
    assert.deepEqual(errors, []);
    console.log(`OK: Escape cierra ${panels.length} paneles, respeta subpaneles y cancela diálogos.`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

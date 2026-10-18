// Interfaz aislada con Playwright; datos ficticios y sin acceso a Supabase.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const read = file => fs.readFileSync(path.join(__dirname,'..',file),'utf8');
function extract(source,name) {
  const start=source.indexOf('function '+name+'(');
  assert(start>=0,name);
  return source.slice(start,source.indexOf('\n}',start)+2);
}
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',route=>route.abort());
    await page.setContent(`<div id="settings-modal" class="hidden">
      <input id="setting-auto-end-time" type="checkbox">
      <input id="setting-show-desc" type="checkbox">
      <select id="setting-default-duration"><option value="60">1 h</option></select>
      <select id="setting-completed-fade"><option value="both">Siempre</option></select>
      <label for="setting-stats-day-cutoff">Hora límite del día</label>
      <input id="setting-stats-day-cutoff" type="time" data-force24 required>
      <span class="time-24-overlay" data-for="setting-stats-day-cutoff"></span>
      <div id="info-stats-day-cutoff" class="settings-info hidden"></div>
      <button class="settings-info-btn" data-info="info-stats-day-cutoff">Info</button>
      <button id="settings-cancel-btn">Cancelar</button><button id="settings-save-btn">Guardar</button>
    </div>`);
    await page.evaluate(()=>{
      window.autoSetEndTimeOnComplete=false;window.defaultTaskDurationMin=60;
      window.DEFAULT_TASK_DURATION_OPTIONS=[60];window.showTaskDescriptions=true;
      window.completedTaskFadeMode='both';window.COMPLETED_TASK_FADE_OPTIONS=['both'];
      window.statsDayCutoffTime='00:00';window.habitReminderTime='';window.isMobile=()=>false;
      window.setupCheckboxButton=()=>{};window.applyTaskDescriptionVisibility=()=>{};
      window.applyCompletedTaskFade=()=>{};window.renderCount=0;
      window.refreshStatsForDayCutoff=()=>renderCount++;
      window.saved=[];window.saveSettingPreferences=changes=>saved.push(structuredClone(changes));
    });
    const core=read('app-1-core.js'),calendar=read('app-2-calendario.js');
    for(const name of ['parseStatsDayCutoff','applyUserSettingsFromPrefs','openSettingsModal','closeSettingsModal','saveSettingsModal'])
      await page.addScriptTag({content:extract(core,name)});
    for(const name of ['updateTime24Overlay','initForce24Time'])
      await page.addScriptTag({content:extract(calendar,name)});
    await page.evaluate(()=>initForce24Time());
    await page.evaluate(()=>openSettingsModal());
    const input=page.locator('#setting-stats-day-cutoff');
    assert.equal(await input.inputValue(),'00:00');
    assert.equal(await page.locator('.time-24-overlay').textContent(),'00:00');
    await input.fill('04:00');
    await page.locator('#settings-cancel-btn').click();
    await page.evaluate(()=>openSettingsModal());
    assert.equal(await input.inputValue(),'00:00');
    await input.fill('04:00');
    await page.locator('#settings-save-btn').click();
    assert.deepEqual(await page.evaluate(()=>[statsDayCutoffTime, saved.at(-1).statsDayCutoffTime, renderCount]),['04:00','04:00',1]);
    await page.evaluate(()=>{statsDayCutoffTime='00:00';applyUserSettingsFromPrefs(saved.at(-1));});
    assert.equal(await page.evaluate(()=>statsDayCutoffTime),'04:00');
    await page.evaluate(()=>openSettingsModal());
    assert.equal(await input.inputValue(),'04:00');
    // La tabla diaria y el gráfico reciben la nueva agrupación, sin alterar tareas.
    await page.evaluate(()=>{
      document.body.insertAdjacentHTML('beforeend',`<div id="daily-stats-panel-curr">
        <div class="modal-body"><div><div class="daily-stats-chart-placeholder"></div></div>
        <div><div class="activity-list"></div></div></div></div>`);
      window.tasks=[
        {id:'a',date:'2026-10-12',startTime:'22:00',endTime:'02:00',tagId:'work',completed:true},
        {id:'b',date:'2026-10-13',startTime:'01:00',endTime:'03:00',tagId:'work',completed:true},
        {id:'c',date:'2026-10-13',startTime:'04:00',endTime:'05:00',tagId:'work',completed:true}
      ];
      window.tags=[{id:'work',name:'Trabajo',color:{bg:'#336699',border:'#336699'}}];
      window.formatDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      window.checkTaskOccurrence=(t,d)=>t.date===formatDate(d);
      window.statsStatusFilter='all';window.statsGroupBy='activity';window.statsGroupsEnabled=false;
      window.statsCustomColors={};window.STATS_GLOBAL_PREFIX='*_';window.statsColorMode='tag';
      window.statsMergeModeActive=false;window.DEFAULT_COLORS=[];window.lineStatsActiveTags=[];
      window.generalStatsHiddenTags=new Set();window.getExcludedSetForDate=()=>new Set();
      window.isMobile=()=>false;window.refreshStatsGroupsButtons=()=>{};
      window.minutesToReadable=n=>`${n} min`;
      window.renderPieChartSVG=groups=>`<div id="chart-value">${groups.map(g=>g.minutes).join(',')}</div>`;
    });
    for(const name of ['getTaskTimeRange','getTaskDurationMinutes'])
      await page.addScriptTag({content:extract(calendar,name)});
    const stats=read('app-4-estadisticas.js');
    for(const name of ['getRelativeDateString','getDatesInRange','getStatsDayOccurrences','renderDailyStatsPanel'])
      await page.addScriptTag({content:extract(stats,name)});
    await page.evaluate(()=>renderDailyStatsPanel(document.getElementById('daily-stats-panel-curr'),'2026-10-12'));
    assert.equal(await page.locator('#chart-value').textContent(),'360');
    assert.equal(await page.locator('.daily-stats-total-duration').textContent(),'360 min');
    await page.evaluate(()=>renderDailyStatsPanel(document.getElementById('daily-stats-panel-curr'),'2026-10-13'));
    assert.equal(await page.locator('#chart-value').textContent(),'60');
    assert.equal(await page.evaluate(()=>tasks[1].date),'2026-10-13');
    assert.deepEqual(errors,[]);
    console.log('Configuración verificada: valor 00:00, cancelación, formato 24 h, guardado y reapertura.');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});

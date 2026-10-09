// Ejecutar con node tests/stats-shift-isolation.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'app-4-estadisticas.js'), 'utf8');
function extract(name) {
  const start = source.indexOf('function ' + name + '(');
  return source.slice(start, source.indexOf('\n}', start) + 2);
}
const names = ['Trabajo', 'Lectura', 'Ejercicio', 'Estudio', 'Descanso'];
const groups = names.map(name => ({ name }));
const saves = [];
const ctx = vm.createContext({
  generalStatsChartType: 'circular', statsHiddenGroups: new Set(), generalStatsHiddenTags: new Set(),
  lineStatsActiveTags: [], lineStatsNeedsAutoSelect: true,
  saveStatsHiddenGroups: () => saves.push('daily'),
  saveGeneralStatsTagPrefs: () => saves.push('general'),
  rememberGeneralStatsLineTags: () => saves.push('line')
});
vm.runInContext(extract('toggleStatsActivityIsolation'), ctx);
function selected(hidden) { return names.filter(name => !hidden.has(name)).join(','); }

// Circular diario, circular general y barras: transiciones y guardado correctos.
for (const [type, prefix, hidden, saved] of [
  ['circular', 'daily-stats', ctx.statsHiddenGroups, 'daily'],
  ['circular', 'general-stats', ctx.generalStatsHiddenTags, 'general'],
  ['barras-apiladas', 'general-stats', ctx.generalStatsHiddenTags, 'general']
]) {
  ctx.generalStatsChartType = type;
  hidden.clear(); hidden.add('Actividad de otro período');
  const click = name => ctx.toggleStatsActivityIsolation(name, groups, hidden, prefix);
  click('Lectura'); assert.equal(selected(hidden), 'Lectura');
  assert.equal(saves.at(-1), saved);
  click('Ejercicio'); assert.equal(selected(hidden), 'Ejercicio');
  click('Ejercicio'); assert.equal(selected(hidden), names.join(','));
  names.forEach(name => hidden.add(name));
  click('Descanso'); assert.equal(selected(hidden), names.join(','));
  assert(hidden.has('Actividad de otro período'));
}

// Lineal: activar todas incluye más de tres, y cuenta solo las del listado actual.
ctx.generalStatsChartType = 'lineal';
ctx.lineStatsActiveTags = [...names];
const lineClick = name => ctx.toggleStatsActivityIsolation(name, groups, ctx.generalStatsHiddenTags, 'general-stats');
lineClick('Estudio'); assert.equal(ctx.lineStatsActiveTags.join(','), 'Estudio');
lineClick('Lectura'); assert.equal(ctx.lineStatsActiveTags.join(','), 'Lectura');
lineClick('Lectura'); assert.equal(ctx.lineStatsActiveTags.join(','), names.join(','));
ctx.lineStatsActiveTags = [];
lineClick('Trabajo'); assert.equal(ctx.lineStatsActiveTags.join(','), names.join(','));
ctx.lineStatsActiveTags = ['Actividad de otro período'];
lineClick('Descanso'); assert.equal(ctx.lineStatsActiveTags.join(','), names.join(','));
assert.equal(ctx.lineStatsNeedsAutoSelect, false);
assert.equal(saves.at(-1), 'line');

// Comprobar el manejador real: Shift consume el clic antes de editar o usar +.
const a = source.indexOf('  const handleShiftActivityClick = (e, group) => {');
const b = source.indexOf('\n  };', a) + '\n  };'.length;
let renders = 0, hiddenTooltip = 0, prevented = 0, stopped = 0;
Object.assign(ctx, {
  groupedList: groups, excludedSet: ctx.generalStatsHiddenTags, prefix: 'general-stats',
  panelEl: {}, dateParam: '2026-10-09',
  document: { getElementById: () => ({ classList: { remove: () => hiddenTooltip++ } }) },
  renderDailyStatsPanel: () => renders++
});
vm.runInContext(source.slice(a, b) + '\nthis.handleShiftActivityClick = handleShiftActivityClick;', ctx);
const event = { shiftKey: false, preventDefault: () => prevented++, stopImmediatePropagation: () => stopped++ };
assert.equal(ctx.handleShiftActivityClick(event, groups[0]), false);
assert.equal(renders, 0); assert.equal(stopped, 0);
event.shiftKey = true;
assert.equal(ctx.handleShiftActivityClick(event, groups[0]), true);
assert.equal(renders, 1); assert.equal(prevented, 1); assert.equal(stopped, 1); assert.equal(hiddenTooltip, 1);
assert.equal(ctx.lineStatsActiveTags.join(','), 'Trabajo');
console.log('Verificado: aislar, cambiar aislamiento, activar todas, cero activas y clic con Shift en los tres gráficos.');

// ─── Estadísticas Diarias ────────────────────────────────────────────────────
let currentDailyStatsDate = null;
let excludedStatsActivitiesMap = new Map();

// ─── Estadísticas diarias: ajustes GLOBALES (todos los días) ──────────────────
// La visibilidad de actividades/tareas y las fusiones hechas en las estadísticas
// diarias se aplican a TODOS los días (no solo al día donde se hicieron) y se
// guardan en la cuenta (preferences), así se conservan al borrar la caché o al
// cambiar de dispositivo.
//  · statsHiddenGroups: nombres de grupos ocultos (preferences.statsHiddenGroups).
//  · Fusiones: claves "*_<grupo>" en statsMergedTasks / statsMergedActivities
//    (antes eran "<fecha>_<grupo>"; se convierten a globales automáticamente).
const STATS_GLOBAL_PREFIX = '*_';
let statsHiddenGroups = new Set();

// Convierte las fusiones antiguas por día ("YYYY-MM-DD_x") a globales ("*_x").
// Devuelve true si cambió algo.
function normalizeStatsMergesToGlobal() {
  let changed = false;
  [statsMergedTasks, statsMergedActivities].forEach(map => {
    Object.keys(map).forEach(key => {
      const m = key.match(/^\d{4}-\d{2}-\d{2}_(.*)$/);
      if (!m) return;
      const gKey = STATS_GLOBAL_PREFIX + m[1];
      if (!(gKey in map)) map[gKey] = map[key];
      delete map[key];
      changed = true;
    });
  });
  return changed;
}

// Resuelve (recursivamente) el destino de una fusión global.
function resolveStatsMerge(map, key) {
  let k = key;
  for (let i = 0; i < 10 && map[STATS_GLOBAL_PREFIX + k] !== undefined; i++) {
    const next = map[STATS_GLOBAL_PREFIX + k];
    if (next === k) break;
    k = next;
  }
  return k;
}

// ─── Estadísticas generales (menú de usuario): ajustes de ETIQUETAS guardados ──
// Se guardan en la cuenta solo las elecciones relacionadas con etiquetas:
//  · generalStatsHiddenTags: etiquetas ocultas en la lista (todas las vistas/periodos).
//  · generalStatsLineTags:   etiquetas elegidas en el gráfico Lineal (máx. 3).
//  · generalStatsHabitTag:   etiqueta elegida en Hábitos / Mapa de calor.
// (Las fusiones de actividades ya son globales y se guardan aparte.)
let generalStatsHiddenTags = new Set();
let generalStatsSavedLineTags = null;  // null = sin elección guardada
let generalStatsSavedHabitTag = null;  // null = sin elección guardada

function saveGeneralStatsTagPrefs() {
  if (typeof saveSettingPreferences !== 'function') return;
  const changes = {
    generalStatsHiddenTags: [...generalStatsHiddenTags]
  };
  if (generalStatsSavedLineTags) changes.generalStatsLineTags = [...generalStatsSavedLineTags];
  if (generalStatsSavedHabitTag) changes.generalStatsHabitTag = generalStatsSavedHabitTag;
  saveSettingPreferences(changes);
}

// El usuario cambió las etiquetas del gráfico Lineal.
function rememberGeneralStatsLineTags() {
  generalStatsSavedLineTags = [...lineStatsActiveTags];
  saveGeneralStatsTagPrefs();
}

// El usuario eligió la etiqueta de Hábitos / Mapa de calor.
function rememberGeneralStatsHabitTag(tagId) {
  if (!tagId) return;
  generalStatsSavedHabitTag = tagId;
  saveGeneralStatsTagPrefs();
}

function saveStatsHiddenGroups() {
  if (typeof saveSettingPreferences === 'function') {
    saveSettingPreferences({ statsHiddenGroups: [...statsHiddenGroups] });
  }
}
let activeStatsPrefix = 'daily-stats';
let generalStatsDateRange = null;

function getStatsEl(baseId) {
  let id = baseId;
  if (baseId.startsWith('stats-edit-')) {
    id = activeStatsPrefix + '-edit-' + baseId.substring(11);
  } else if (baseId.startsWith('daily-stats-')) {
    id = activeStatsPrefix + '-' + baseId.substring(12);
  }
  return document.getElementById(id);
}

function getStatsModalHTML(prefix) {
  return `
    <!-- VISTA PRINCIPAL DE ACTIVIDAD -->
    <div id="${prefix}-main-content" class="modal-content daily-stats-w" style="overflow: hidden;">
      <div class="modal-header">
        <h2 id="${prefix}-title">Actividad 00/00/0000</h2>
        <div class="modal-header-actions">
          <button id="${prefix}-settings-btn" title="Ajustes" class="close-modal-btn" type="button">
            <img src="icons/settings.svg" alt="Ajustes" width="16" height="16">
          </button>
          <button id="${prefix}-merge-btn" title="Agrupar actividades" class="close-modal-btn" type="button">
            <img src="icons/merge.svg" alt="Agrupar actividades" width="20" height="20">
          </button>
          <button class="close-modal-btn" data-modal="${prefix}-modal">
            <img src="icons/close.svg" alt="Cerrar" width="20" height="20">
          </button>
        </div>
      </div>
      
      ${prefix === 'general-stats' ? `
      <div class="general-stats-filters" style="display: flex; gap: 12px; padding: 12px 24px 0 24px;">
        <div class="form-group flex-1" style="margin-bottom: 0; display: flex; flex-direction: column; gap: 4px;">
          <label for="general-stats-chart-type-select" style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; text-align: left;">Tipo de Gráfico</label>
          <select id="general-stats-chart-type-select" style="width: 100%; padding: 6px 10px; font-size: 13px; height: 36px; border: 1px solid var(--border-light); border-radius: var(--radius-md); background: var(--bg-card); color: var(--text-main);">
            <option value="circular" selected>Circular</option>
            <option value="barras-apiladas">Barras apiladas</option>
            <option value="lineal">Lineal</option>
            <option value="habitos">Hábitos</option>
            <option value="heatmap">Mapa de calor</option>
          </select>
        </div>
        <div class="form-group flex-1" id="general-stats-period-group" style="margin-bottom: 0; display: flex; flex-direction: column; gap: 4px;">
          <label for="general-stats-period-select" style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; text-align: left;">Periodo</label>
          <select id="general-stats-period-select" style="width: 100%; padding: 6px 10px; font-size: 13px; height: 36px; border: 1px solid var(--border-light); border-radius: var(--radius-md); background: var(--bg-card); color: var(--text-main);">
            <option value="hoy" selected>Hoy</option>
            <option value="7dias">Últimos 7 días</option>
            <option value="30dias">Últimos 30 días</option>
            <option value="personalizado">Personalizado</option>
          </select>
        </div>
      </div>
      <!-- Selector de etiqueta para el modo Hábitos (oculto en otros modos). -->
      <div id="general-stats-habit-tag-row" class="general-stats-filters" style="display: none; padding: 8px 24px 0 24px; align-items: flex-end; gap: 12px;">
        <div class="form-group" style="flex: 3; min-width: 0; margin-bottom: 0; display: flex; flex-direction: column; gap: 4px;">
          <label for="habit-tag-select-input" style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; text-align: left;">Actividad</label>
          <div class="custom-select-wrapper">
            <input type="hidden" id="habit-select-tag" value="default">
            <div class="custom-select-trigger" id="habit-tag-select-trigger">
              <span class="custom-select-color-circle" id="habit-tag-select-circle" style="background-color: #50a9ed;"></span>
              <input type="text" class="custom-select-trigger-input" id="habit-tag-select-input" placeholder="Buscar actividad…" autocomplete="off">
              <button type="button" class="time-clear-btn" id="habit-tag-clear" title="Borrar" aria-label="Borrar texto">
                <img src="icons/close.svg" alt="Quitar" width="14" height="14">
              </button>
            </div>
            <div class="custom-options-container hidden" id="habit-tag-options-container"></div>
          </div>
        </div>
        <div class="form-group" style="flex: 2; min-width: 0; margin-bottom: 0; display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; text-align: left;">Constancia</label>
          <div id="habit-streak-count" style="height: 38px; display: flex; align-items: center; justify-content: center; gap: 8px; white-space: nowrap; font-size: 15px; font-weight: 700; color: var(--text-main); border: 1px solid var(--border-light); border-radius: var(--radius-md); background: var(--bg-card);">0/0</div>
        </div>
      </div>
      ` : ''}
      
      <div class="daily-stats-viewport" style="overflow: hidden; width: 100%; position: relative;">
        <div class="daily-stats-slider" id="${prefix}-slider" style="display: flex; width: 300%; transition: transform 0.25s ease; transform: translateX(-33.3333%);">
          <!-- Panel Izquierdo (Día Anterior) -->
          <div class="daily-stats-panel" id="${prefix}-panel-prev" style="width: 33.3333%; flex-shrink: 0; box-sizing: border-box;">
            <div class="modal-body">
              <div class="pie-chart-container">
                <div class="daily-stats-chart-placeholder" style="width: 100%; height: 100%;"></div>
              </div>
              <div class="daily-stats-legend">
                <div class="activity-list"></div>
              </div>
            </div>
          </div>
          
          <!-- Panel Central (Día Actual) -->
          <div class="daily-stats-panel" id="${prefix}-panel-curr" style="width: 33.3333%; flex-shrink: 0; box-sizing: border-box;">
            <div class="modal-body">
              <div class="pie-chart-container">
                <div class="daily-stats-chart-placeholder" style="width: 100%; height: 100%;"></div>
              </div>
              <div class="daily-stats-legend">
                <div class="activity-list"></div>
              </div>
            </div>
          </div>
          
          <!-- Panel Derecho (Día Siguiente) -->
          <div class="daily-stats-panel" id="${prefix}-panel-next" style="width: 33.3333%; flex-shrink: 0; box-sizing: border-box;">
            <div class="modal-body">
              <div class="pie-chart-container">
                <div class="daily-stats-chart-placeholder" style="width: 100%; height: 100%;"></div>
              </div>
              <div class="daily-stats-legend">
                <div class="activity-list"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="modal-footer" style="display: flex; justify-content: center; background-color: transparent; border-top: none; padding-top: 8px;">
        <button type="button" class="btn btn-secondary close-modal-btn" data-modal="${prefix}-modal" style="min-width: 120px;">Cerrar</button>
      </div>
    </div>

    <!-- VISTA DE EDICIÓN DE TAREA -->
    <div id="${prefix}-edit-content" class="modal-content daily-stats-w hidden" style="overflow: hidden;">
      <div class="modal-header">
        <h2>Editar tarea</h2>
        <button class="close-modal-btn" id="${prefix}-edit-close-btn" type="button">
          <img src="icons/close.svg" alt="Cerrar" width="20" height="20">
        </button>
      </div>
      <div class="modal-body" style="padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; text-align: left; box-sizing: border-box; width: 100%; align-items: stretch; overflow-y: auto; flex: 1; min-height: 0;">
        <div class="form-group">
          <label for="${prefix}-edit-task-title" class="sr-only">Título</label>
          <input type="text" id="${prefix}-edit-task-title" placeholder="Título de la tarea" required autocomplete="off">
        </div>
        
        <div class="form-group">
          <label style="font-size: 13px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px; display: block;">Color de actividad</label>
          <div class="color-palette-grid" id="${prefix}-edit-color-palette">
            <!-- Círculos de color se generarán por JS -->
          </div>
          
          <!-- Selector de color personalizado (HSL) -->
          <div id="${prefix}-edit-hsl-picker" class="hsl-picker hidden">
            <div class="hsl-preview-row">
              <span id="${prefix}-edit-hsl-preview" class="hsl-preview"></span>
              <span id="${prefix}-edit-hsl-value" class="hsl-value"></span>
            </div>
            <div class="hsl-slider-row">
              <label for="${prefix}-edit-hsl-h">Tono</label>
              <input type="range" id="${prefix}-edit-hsl-h" min="0" max="360" value="210">
            </div>
            <div class="hsl-slider-row">
              <label for="${prefix}-edit-hsl-s">Saturación</label>
              <input type="range" id="${prefix}-edit-hsl-s" min="0" max="100" value="70">
            </div>
            <div class="hsl-slider-row">
              <label for="${prefix}-edit-hsl-l">Luminosidad</label>
              <input type="range" id="${prefix}-edit-hsl-l" min="0" max="100" value="55">
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer" style="display: flex; justify-content: space-between; align-items: center; gap: 12px; border-top: 1px solid var(--border-light); padding: 16px 24px; width: 100%; box-sizing: border-box;">
        <button type="button" class="btn btn-secondary" id="${prefix}-edit-cancel-btn" style="min-width: 100px;">Cancelar</button>
        <div style="display: flex; gap: 12px;">
          <button type="button" class="btn btn-secondary" id="${prefix}-edit-reset-btn" style="color: #000000; min-width: 100px;">Restablecer</button>
          <button type="button" class="btn btn-primary" id="${prefix}-edit-save-btn" style="min-width: 100px;">Aceptar</button>
        </div>
      </div>
    </div>

    <!-- VISTA DE AJUSTES (filtros y colores del panel de actividad) -->
    <div id="${prefix}-settings-content" class="modal-content daily-stats-w hidden" style="overflow: hidden;">
      <div class="modal-header">
        <h2>Ajustes</h2>
        <button class="close-modal-btn" id="${prefix}-settings-close-btn" type="button">
          <img src="icons/close.svg" alt="Cerrar" width="20" height="20">
        </button>
      </div>
      <div class="modal-body" style="padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; text-align: left; box-sizing: border-box; width: 100%;">
        <div class="form-group" style="margin-bottom: 0; width: 100%;">
          <label for="${prefix}-groupby-select">Filtrar por</label>
          <select id="${prefix}-groupby-select" class="${prefix}-groupby-select" style="width: 100%; padding: 8px 10px; box-sizing: border-box;" ${prefix === 'general-stats' ? 'disabled' : ''}>
            <option value="title" ${prefix === 'daily-stats' ? 'selected' : ''}>Por título de tarea</option>
             <option value="activity" ${prefix === 'general-stats' ? 'selected' : ''}>Por actividad</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 0; width: 100%;">
          <label for="${prefix}-status-select">Estado</label>
          <select id="${prefix}-status-select" class="${prefix}-status-select" style="width: 100%; padding: 8px 10px; box-sizing: border-box;">
            <option value="completed">Tareas completadas</option>
            <option value="uncompleted">Tareas no completadas</option>
            <option value="all" selected>Todas las tareas</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 0; width: 100%;">
          <label for="${prefix}-color-select">Colores</label>
          <select id="${prefix}-color-select" class="${prefix}-color-select" style="width: 100%; padding: 8px 10px; box-sizing: border-box;">
            <option value="auto" selected>Automático</option>
            <option value="tag">Por actividad</option>
          </select>
        </div>
      </div>
      <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 12px; background-color: transparent; border-top: none; padding: 14px 24px;">
        <button type="button" class="btn btn-secondary" id="${prefix}-settings-cancel-btn" style="min-width: 100px;">Cancelar</button>
        <button type="button" class="btn btn-primary" id="${prefix}-settings-done-btn" style="min-width: 100px;">Aplicar</button>
      </div>
    </div>
  `;
}

function getExcludedSetForDate(dateStr) {
  // Estadísticas diarias (clave = una fecha): ocultos GLOBALES, iguales en todos los días.
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return statsHiddenGroups;
  if (!excludedStatsActivitiesMap.has(dateStr)) {
    excludedStatsActivitiesMap.set(dateStr, new Set());
  }
  return excludedStatsActivitiesMap.get(dateStr);
}

function formatToDDMMYYYY(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function getRelativeDateString(dateStr, offsetDays) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + offsetDays);
  return formatDate(d);
}

function renderPieChartSVG(includedGroups) {
  if (includedGroups.length === 0) {
    return `
      <svg viewBox="-1.05 -1.05 2.1 2.1" style="width: 100%; height: 100%;">
        <circle cx="0" cy="0" r="0.95" fill="none" stroke="var(--border-light, #e5e5ea)" stroke-width="0.1" />
      </svg>
    `;
  }
  
  const totalMins = includedGroups.reduce((sum, g) => sum + g.minutes, 0);
  if (totalMins === 0) {
    return `
      <svg viewBox="-1.05 -1.05 2.1 2.1" style="width: 100%; height: 100%;">
        <circle cx="0" cy="0" r="0.95" fill="none" stroke="var(--border-light, #e5e5ea)" stroke-width="0.1" />
      </svg>
    `;
  }
  
  if (includedGroups.length === 1) {
    const percentVal = 100;
    const only = includedGroups[0];
    const tip = `${only.displayName || only.name} · ${minutesToReadable(only.minutes)}`;
    const textEl = percentVal >= 5 ? `<text x="0" y="0" fill="#ffffff" font-size="0.11" font-weight="700" text-anchor="middle" dominant-baseline="central" style="font-family: inherit; pointer-events: none;">100%</text>` : '';
    return `
      <svg viewBox="-1.05 -1.05 2.1 2.1" style="width: 100%; height: 100%; filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.06));">
        <circle class="chart-slice" data-tooltip="${escapeHtmlAdj(tip)}" cx="0" cy="0" r="0.95" fill="${only.color.bg}" stroke="none" />
        ${textEl}
      </svg>
    `;
  }
  
  let cumulativeAngle = -Math.PI / 2; // Inicia a las 12 en punto (arriba)
  const paths = [];
  const labels = [];
  
  includedGroups.forEach(group => {
    const percent = group.minutes / totalMins;
    if (percent <= 0) return;

    const percentVal = Math.round(percent * 100);
    const startAngle = cumulativeAngle;
    cumulativeAngle += percent * 2 * Math.PI;
    const endAngle = cumulativeAngle;

    const tip = `${group.displayName || group.name} · ${minutesToReadable(group.minutes)}`;

    if (percent >= 0.999) {
      paths.push(`<circle class="chart-slice" data-tooltip="${escapeHtmlAdj(tip)}" cx="0" cy="0" r="0.95" fill="${group.color.bg}" stroke="none" />`);
      if (percentVal >= 5) {
        labels.push(`<text x="0" y="0" fill="#ffffff" font-size="0.11" font-weight="700" text-anchor="middle" dominant-baseline="central" style="font-family: inherit; pointer-events: none;">${percentVal}%</text>`);
      }
      return;
    }
    
    const startX = Math.cos(startAngle);
    const startY = Math.sin(startAngle);
    const endX = Math.cos(endAngle);
    const endY = Math.sin(endAngle);
    
    const largeArcFlag = percent > 0.5 ? 1 : 0;
    
    const pathData = [
      `M 0 0`,
      `L ${startX} ${startY}`,
      `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`,
      `Z`
    ].join(' ');
    
    paths.push(`<path class="chart-slice" data-tooltip="${escapeHtmlAdj(tip)}" d="${pathData}" fill="${group.color.bg}" stroke="var(--bg-card, #ffffff)" stroke-width="0.02" stroke-linejoin="round" />`);

    if (percentVal >= 5) {
      const middleAngle = (startAngle + endAngle) / 2;
      const labelR = 0.68; // Posiciona la etiqueta a un 68% del radio (más hacia el exterior)
      const labelX = labelR * Math.cos(middleAngle);
      const labelY = labelR * Math.sin(middleAngle);
      labels.push(`<text x="${labelX.toFixed(3)}" y="${labelY.toFixed(3)}" fill="#ffffff" font-size="0.11" font-weight="700" text-anchor="middle" dominant-baseline="central" style="font-family: inherit; pointer-events: none;">${percentVal}%</text>`);
    }
  });
  
  return `
    <svg viewBox="-1.05 -1.05 2.1 2.1" style="width: 100%; height: 100%; filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.06));">
      ${paths.join('')}
      ${labels.join('')}
    </svg>
  `;
}

function renderStackedBarChartSVG(occurrences, dates, groupedList, excludedSet) {
  const y_bottom = 80;
  const y_top = 8;
  const plotHeight = y_bottom - y_top;
  const x_left = 12;
  const x_right = 188;
  const plotWidth = x_right - x_left;
  
  const periodSelect = document.getElementById('general-stats-period-select');
  const periodVal = periodSelect ? periodSelect.value : 'semanal';
  
  let unit = 'dias';
  let qty = dates.length;
  if (periodVal === 'personalizado' && generalStatsDateRange) {
    unit = generalStatsDateRange.unit || 'dias';
    qty = generalStatsDateRange.qty || dates.length;
  } else if (periodVal === 'semanal' || periodVal === '7dias') {
    unit = 'dias';
    qty = 7;
  }

  const daysPerBar = (unit === 'semanas' ? 7 : unit === 'meses' ? 30 : 1);
  const N = qty;
  
  const barTotals = Array(N).fill(0);
  const barBreakdown = Array(N).fill(null).map(() => ({}));
  let maxBarMinutes = 0;
  
  groupedList.forEach(group => {
    if (excludedSet.has(group.name)) return;
    group.occurrences.forEach(occ => {
      const dStr = occ.dateStr;
      const dateIdx = dates.indexOf(dStr);
      if (dateIdx !== -1) {
        const barIdx = Math.floor(dateIdx / daysPerBar);
        if (barIdx >= 0 && barIdx < N) {
          barBreakdown[barIdx][group.name] = (barBreakdown[barIdx][group.name] || 0) + occ.mins;
          barTotals[barIdx] += occ.mins;
        }
      }
    });
  });
  
  barTotals.forEach(total => {
    if (total > maxBarMinutes) {
      maxBarMinutes = total;
    }
  });

  const gap = N > 8 ? 4 : 6;
  const barWidth = (plotWidth - (N - 1) * gap) / N;

  const svgParts = [];
  svgParts.push(`<svg viewBox="0 0 200 100" style="width: 100%; height: 100%;">`);
  
  const gridLinesY = [y_top + plotHeight * 0.25, y_top + plotHeight * 0.5, y_top + plotHeight * 0.75];
  gridLinesY.forEach(yVal => {
    svgParts.push(`<line x1="${x_left}" y1="${yVal}" x2="${x_right}" y2="${yVal}" stroke="var(--border-light, #f2f2f7)" stroke-dasharray="1.5,1.5" stroke-width="0.3" />`);
  });

  svgParts.push(`<line x1="${x_left - 2}" y1="${y_bottom}" x2="${x_right + 2}" y2="${y_bottom}" stroke="var(--border-light, #e5e5ea)" stroke-width="0.5" />`);

  const fontSize = N > 9 ? 5.5 : 6.5;
  const weeklyLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

  for (let idx = 0; idx < N; idx++) {
    const x = x_left + idx * (barWidth + gap);
    const x_center = x + barWidth / 2;
    
    let labelText = '';
    if (periodVal === 'semanal') {
      labelText = weeklyLabels[idx] || '';
    } else if (unit === 'semanas' || unit === 'meses') {
      // Solo el número (1, 2, 3…): "Sem 1"/"Mes 1" quedaban apretados con 12 barras.
      labelText = String(idx + 1);
    } else {
      const targetDateStr = dates[idx * daysPerBar];
      if (targetDateStr) {
        const dateObj = new Date(targetDateStr + 'T12:00:00');
        labelText = dateObj.getDate();
      }
    }
    svgParts.push(`<text x="${x_center}" y="${y_bottom + 10}" fill="var(--text-muted, #8e8e93)" font-size="${fontSize}" font-weight="600" text-anchor="middle">${labelText}</text>`);

    if (maxBarMinutes > 0 && barTotals[idx] > 0) {
      let currentY = y_bottom;
      
      svgParts.push(`<rect x="${x}" y="${y_top}" width="${barWidth}" height="${plotHeight}" fill="var(--border-light, #f2f2f7)" opacity="0.15" rx="0.5" />`);

      groupedList.forEach(group => {
        if (excludedSet.has(group.name)) return;
        const mins = barBreakdown[idx][group.name] || 0;
        if (mins > 0) {
          const segHeight = (mins / maxBarMinutes) * plotHeight;
          const y = currentY - segHeight;

          // 1ª línea: la actividad del segmento; 2ª: total de la barra (suma de
          // todas las actividades visibles en ese día/semana/mes).
          const segTip = `${group.displayName || group.name} · ${minutesToReadable(mins)}\nTotal: ${minutesToReadable(barTotals[idx])}`;
          svgParts.push(`<rect class="chart-slice" data-tooltip="${escapeHtmlAdj(segTip)}" x="${x}" y="${y}" width="${barWidth}" height="${segHeight}" fill="${group.color.bg}" stroke="var(--bg-card, #ffffff)" stroke-width="0.25" rx="0.3" />`);

          currentY = y;
        }
      });
    } else {
      svgParts.push(`<rect x="${x}" y="${y_bottom - 1.5}" width="${barWidth}" height="1.5" fill="var(--border-light, #e5e5ea)" rx="0.3" />`);
    }
  }

  svgParts.push(`</svg>`);
  return svgParts.join('\n');
}

function getOrCreateChartTooltip() {
  let el = document.getElementById('stats-chart-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'stats-chart-tooltip';
    el.className = 'stats-chart-tooltip';
    document.body.appendChild(el);
  }
  return el;
}

function renderLineChartSVG(occurrences, dates, groupedList, activeTags) {
  const y_bottom = 80;
  const y_top = 10;
  const plotHeight = y_bottom - y_top;
  const x_left = 15;
  const x_right = 190;
  const plotWidth = x_right - x_left;
  const N = dates.length;
  const denom = N > 1 ? N - 1 : 1;

  const tagDailyHours = {};
  let maxDailyHours = 0;

  activeTags.forEach(tagName => {
    tagDailyHours[tagName] = Array(N).fill(0);
  });

  dates.forEach((dStr, dateIdx) => {
    groupedList.forEach(group => {
      if (!activeTags.includes(group.name)) return;
      group.occurrences.forEach(occ => {
        if (occ.dateStr === dStr) {
          tagDailyHours[group.name][dateIdx] += occ.mins / 60;
        }
      });
    });
  });

  activeTags.forEach(tagName => {
    tagDailyHours[tagName].forEach(hours => {
      if (hours > maxDailyHours) {
        maxDailyHours = hours;
      }
    });
  });

  const yMax = maxDailyHours > 0 ? maxDailyHours * 1.1 : 1;

  const svgParts = [];
  svgParts.push(`<svg viewBox="0 0 200 100" style="width: 100%; height: 100%;">`);

  const gridLinesY = [y_top + plotHeight * 0.25, y_top + plotHeight * 0.5, y_top + plotHeight * 0.75];
  gridLinesY.forEach((yVal, idx) => {
    svgParts.push(`<line x1="${x_left}" y1="${yVal}" x2="${x_right}" y2="${yVal}" stroke="var(--border-light, #f2f2f7)" stroke-dasharray="1.5,1.5" stroke-width="0.35" />`);
    const hoursVal = yMax * (0.75 - idx * 0.25);
    svgParts.push(`<text x="${x_left - 3}" y="${yVal}" fill="var(--text-muted, #8e8e93)" font-size="5" font-weight="600" text-anchor="end" dominant-baseline="central">${hoursVal.toFixed(1)}h</text>`);
  });

  const step = Math.ceil(N / 10);
  dates.forEach((dStr, idx) => {
    if (idx % step === 0) {
      const x = x_left + (idx / denom) * plotWidth;
      const dateObj = new Date(dStr + 'T12:00:00');
      const dayNum = dateObj.getDate();
      svgParts.push(`<text x="${x}" y="${y_bottom + 10}" fill="var(--text-muted, #8e8e93)" font-size="5.5" font-weight="600" text-anchor="middle">${dayNum}</text>`);
    }
  });

  activeTags.forEach(tagName => {
    const group = groupedList.find(g => g.name === tagName);
    if (!group) return;
    const color = group.color.bg;

    const points = [];
    dates.forEach((dStr, idx) => {
      const x = x_left + (idx / denom) * plotWidth;
      const hours = tagDailyHours[tagName][idx];
      const y = y_bottom - (hours / yMax) * plotHeight;
      points.push({ x, y, hours });
    });

    // Construir el path por segmentos: no dibujar el tramo entre dos puntos si
    // ambos valen 0 (evita la línea horizontal pegada al eje x).
    let pathD = '';
    points.forEach((p, idx) => {
      if (idx === 0) {
        pathD += `M ${p.x} ${p.y}`;
        return;
      }
      const prev = points[idx - 1];
      if (prev.hours === 0 && p.hours === 0) {
        // Tramo plano en cero: levantar el lápiz y reiniciar en el punto actual.
        pathD += ` M ${p.x} ${p.y}`;
      } else {
        pathD += ` L ${p.x} ${p.y}`;
      }
    });
    svgParts.push(`<path d="${pathD}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`);

    points.forEach((p, idx) => {
      // Punto visual muy sutil para que la línea parezca continua
      svgParts.push(`<circle cx="${p.x}" cy="${p.y}" r="0.8" fill="${color}" />`);
      // Fecha del eje x (ej. "23 jun") + etiqueta y horas del eje y, sintetizado
      const dObj = new Date(dates[idx] + 'T12:00:00');
      const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
      const dLabel = `${dObj.getDate()} ${meses[dObj.getMonth()]}`;
      // Formato horas/minutos: 2.5 -> "2h30min", 3 -> "3h", 0.5 -> "30min"
      const totalMin = Math.round(p.hours * 60);
      const hh = Math.floor(totalMin / 60);
      const mm = totalMin % 60;
      let durLabel;
      if (hh > 0 && mm > 0) durLabel = `${hh}h${mm}min`;
      else if (hh > 0) durLabel = `${hh}h`;
      else durLabel = `${mm}min`;
      const tipText = `${dLabel}: ${durLabel}`;
      // Área de hover invisible más grande con clase y atributo data-tooltip.
      // El <title> vacío evita el tooltip nativo heredado ("Planner7").
      svgParts.push(`<circle class="chart-hover-circle" cx="${p.x}" cy="${p.y}" r="6" fill="transparent" style="cursor: pointer;" data-tooltip="${tipText}"><title></title></circle>`);
    });
  });

  // Ejes al final para que queden visualmente por encima de las líneas de datos.
  const xTip = x_right + 5; // extremo derecho del eje X
  const yTip = y_top - 5;   // extremo superior del eje Y
  svgParts.push(`<line x1="${x_left}" y1="${y_bottom}" x2="${xTip}" y2="${y_bottom}" stroke="#111111" stroke-width="0.8" />`);
  svgParts.push(`<line x1="${x_left}" y1="${yTip}" x2="${x_left}" y2="${y_bottom}" stroke="#111111" stroke-width="0.8" />`);
  // Flechitas de punta abierta (V) en los extremos de los ejes.
  const a = 2.4; // tamaño de la flecha
  svgParts.push(`<path d="M${xTip - a},${y_bottom - a} L${xTip},${y_bottom} L${xTip - a},${y_bottom + a}" fill="none" stroke="#111111" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" />`);
  svgParts.push(`<path d="M${x_left - a},${yTip + a} L${x_left},${yTip} L${x_left + a},${yTip + a}" fill="none" stroke="#111111" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round" />`);

  svgParts.push(`</svg>`);
  return svgParts.join('\n');
}

// ¿Hubo al menos una tarea de la etiqueta seleccionada completada ese día?
function habitDoneOnDate(dStr) {
  const dateObj = new Date(dStr + 'T12:00:00');
  return tasks.some(task => {
    if ((task.tagId || 'default') !== generalStatsHabitTag) return false;
    if (!checkTaskOccurrence(task, dateObj)) return false;
    return (task.recurrence && task.recurrence.enabled)
      ? !!(task.completedOccurrences && task.completedOccurrences.includes(dStr))
      : !!task.completed;
  });
}

// Actualiza el contador de Constancia: "días completados / días de la muestra".
function updateHabitStreakCount(dates) {
  const el = document.getElementById('habit-streak-count');
  if (!el) return;
  // Constancia = días completados / días de la muestra (el periodo elegido,
  // p. ej. 3/30 en "Últimos 30 días"). Los días futuros no cuentan.
  const todayStr = formatDate(new Date());
  let done = 0;
  let total = 0;
  dates.forEach(dStr => {
    if (dStr > todayStr) return;
    total++;
    if (habitDoneOnDate(dStr)) done++;
  });
  // "completados/total" + porcentaje de constancia (gris, a la derecha).
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  el.innerHTML = `<span>${done}/${total}</span><span style="color: var(--text-muted); font-weight: 600;">${pct}%</span>`;
}

// Habit tracker estilo GitHub: un cuadrito por día. Se pinta del color de la
// etiqueta seleccionada si ese día hubo ≥1 tarea de esa etiqueta completada;
// si no, queda en gris claro.
function renderHabitTrackerHTML(dates) {
  const tag = tags.find(t => t.id === generalStatsHabitTag) || tags.find(t => t.id === 'default');
  const fillColor = tag && tag.color ? tag.color.bg : '#50a9ed';
  const EMPTY = '#e9e9ec';
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

  // Orden: el día más reciente en la esquina superior izquierda; se rellena de
  // izquierda a derecha y luego hacia abajo (flujo por filas). `dates` viene en
  // orden ascendente, así que lo invertimos.
  const COLS = 10;
  const ordered = dates.slice().reverse();
  const cells = ordered.map(dStr => {
    const done = habitDoneOnDate(dStr);
    const dObj = new Date(dStr + 'T12:00:00');
    const dLabel = `${dObj.getDate()} ${meses[dObj.getMonth()]}`;
    const tip = `${dLabel}: ${done ? 'completado' : 'sin completar'}`;
    const bg = done ? fillColor : EMPTY;
    return `<div class="habit-cell" data-tooltip="${tip}" style="background:${bg};"></div>`;
  }).join('');

  return `
    <div class="habit-grid" style="display:grid; grid-template-columns: repeat(${COLS}, 1fr); grid-auto-flow: row; gap: 3px; padding: 6px 0; width: 100%;">
      ${cells}
    </div>`;
}

// Devuelve el tono (H) y saturación (S) de un color (hex o hsl) para construir
// una escala de 4 luminosidades del mismo color.
function getHueSatFromColor(color) {
  if (typeof color === 'string' && color.startsWith('#') && color.length >= 7) {
    const [h, s] = hexToHsl(color);
    return [h, s];
  }
  const m = typeof color === 'string' && color.match(/hsl\(\s*(\d+)[,\s]+(\d+)%/i);
  if (m) return [parseInt(m[1], 10), parseInt(m[2], 10)];
  return [210, 70]; // azul por defecto
}

// Mapa de calor: 24 columnas (horas 0–23) × 12 filas (últimos 12 días, el más
// reciente abajo). El valor de cada celda son los minutos de la etiqueta
// seleccionada que caen en esa hora de ese día (solo tareas con hora inicio/fin).
// La intensidad usa 4 luminosidades del color de la etiqueta; el rango se divide
// entre el mínimo y el máximo del periodo.
// Escala fija: 0 min = tono más claro, 60 min (o más) = tono más oscuro.
const HEATMAP_LUM = [92, 82, 72, 60, 48, 38, 28];
function heatmapTier(minutes) {
  // 60 min repartidos en 7 tonos; valores >60 caen en el más oscuro.
  const frac = Math.max(0, Math.min(1, minutes / 60));
  const idx = minutes <= 0 ? 0 : Math.ceil(frac * 7) - 1;
  return Math.max(0, Math.min(6, idx));
}

// Minutos por hora (array de 24) de la etiqueta seleccionada en un día dado.
function heatmapDayMinutes(dStr) {
  const dateObj = new Date(dStr + 'T12:00:00');
  const hours = new Array(24).fill(0);
  tasks.forEach(task => {
    if ((task.tagId || 'default') !== generalStatsHabitTag) return;
    if (!checkTaskOccurrence(task, dateObj)) return;
    const r = getTaskTimeRange(task); // requiere startTime + endTime
    if (!r) return;
    const end = r.crossesMidnight ? 24 * 60 : r.rawEndMin;
    for (let m = r.startMin; m < end; m++) {
      const hour = Math.floor(m / 60);
      if (hour >= 0 && hour < 24) hours[hour] += 1;
    }
  });
  return hours;
}

// Genera el HTML de UNA fila de día (etiqueta + 24 celdas) para el mapa de calor.
function renderHeatmapRow(dStr, hue, sat) {
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  const dObj = new Date(dStr + 'T12:00:00');
  const dLabel = `${dObj.getDate()} ${meses[dObj.getMonth()]}`;
  const mins = heatmapDayMinutes(dStr);
  let row = `<div class="heatmap-dlabel">${dObj.getDate()}/${dObj.getMonth() + 1}</div>`;
  for (let h = 0; h < 24; h++) {
    const v = mins[h];
    const bg = `hsl(${hue}, ${sat}%, ${HEATMAP_LUM[heatmapTier(v)]}%)`;
    const tip = `${dLabel} ${String(h).padStart(2,'0')}:00 · ${v} min`;
    row += `<div class="heatmap-cell" data-tooltip="${tip}" style="background:${bg};"></div>`;
  }
  return row;
}

// Devuelve el id de la etiqueta con más días completados (≥1 tarea de esa
// etiqueta completada ese día) en el rango [fromStr, toStr], o null si ninguna.
function topTagByCompletedDaysInRange(fromStr, toStr) {
  const dates = getDatesInRange(fromStr, toStr);
  const todayStr = formatDate(new Date());
  const counts = {}; // tagId -> días con al menos un completado
  dates.forEach(dStr => {
    if (dStr > todayStr) return;
    const dateObj = new Date(dStr + 'T12:00:00');
    const tagsDone = new Set();
    tasks.forEach(task => {
      const done = (task.recurrence && task.recurrence.enabled)
        ? !!(task.completedOccurrences && task.completedOccurrences.includes(dStr))
        : !!task.completed;
      if (!done) return;
      if (!checkTaskOccurrence(task, dateObj)) return;
      tagsDone.add(task.tagId || 'default');
    });
    tagsDone.forEach(id => { counts[id] = (counts[id] || 0) + 1; });
  });
  let best = null, bestN = 0;
  Object.keys(counts).forEach(id => {
    if (counts[id] > bestN) { bestN = counts[id]; best = id; }
  });
  return best;
}

// Devuelve el id de la etiqueta con mayor duración acumulada (tareas con
// horario) en el rango [fromStr, toStr], o null si no hay ninguna.
function topTagByDurationInRange(fromStr, toStr) {
  const dates = getDatesInRange(fromStr, toStr);
  const totals = {}; // tagId -> minutos
  dates.forEach(dStr => {
    const dateObj = new Date(dStr + 'T12:00:00');
    tasks.forEach(task => {
      if (!checkTaskOccurrence(task, dateObj)) return;
      const mins = getTaskDurationMinutes(task);
      if (mins === null || mins <= 0) return;
      const tagId = task.tagId || 'default';
      totals[tagId] = (totals[tagId] || 0) + mins;
    });
  });
  let best = null, bestMin = -1;
  Object.keys(totals).forEach(id => {
    if (totals[id] > bestMin) { bestMin = totals[id]; best = id; }
  });
  return best;
}

// Fecha (YYYY-MM-DD) de la tarea más antigua con la etiqueta seleccionada, o null.
function heatmapOldestDate() {
  let oldest = null;
  tasks.forEach(task => {
    if ((task.tagId || 'default') !== generalStatsHabitTag) return;
    if (!getTaskTimeRange(task)) return; // solo tareas con horario cuentan
    const d = task.date || (task.completedOccurrences && task.completedOccurrences[0]);
    if (d && (!oldest || d < oldest)) oldest = d;
  });
  return oldest;
}

// Mapa de calor con scroll infinito vertical: el día más reciente arriba; al
// desplazarse hacia abajo se cargan días anteriores hasta la tarea más antigua
// de la etiqueta. La escala de color es fija (0–60 min). El parámetro `dates`
// (rango del periodo) solo se usa para fijar el día más reciente.
function renderHeatmapHTML(dates) {
  const tag = tags.find(t => t.id === generalStatsHabitTag) || tags.find(t => t.id === 'default');
  const [hue, sat] = getHueSatFromColor(tag && tag.color ? tag.color.bg : '#50a9ed');

  // Día más reciente = último del rango (o hoy si no hay rango).
  const newest = (dates && dates.length) ? dates[dates.length - 1] : formatDate(new Date());

  // Cargar los primeros 12 días (más reciente arriba, hacia atrás).
  const INITIAL = 12;
  let html = '<div class="heatmap-corner"></div>';
  for (let h = 0; h < 24; h++) {
    html += `<div class="heatmap-hlabel">${h}</div>`;
  }
  let cursor = new Date(newest + 'T12:00:00');
  for (let i = 0; i < INITIAL; i++) {
    html += renderHeatmapRow(formatDate(cursor), hue, sat);
    cursor.setDate(cursor.getDate() - 1);
  }
  // `data-oldest-loaded` guarda el día más antiguo ya pintado para seguir desde ahí.
  const oldestLoaded = formatDate(cursor); // primer día aún NO cargado (siguiente a pintar)

  return `
    <div class="heatmap-scroll" data-hue="${hue}" data-sat="${sat}" data-next="${oldestLoaded}"
         style="overflow: auto; max-width: 100%; max-height: 320px; padding-bottom: 4px;">
      <div class="heatmap-grid" style="display:grid; grid-template-columns: auto repeat(24, 22px); gap: 3px; padding: 6px 0; width: max-content; align-items: center;">
        ${html}
      </div>
    </div>`;
}

// Engancha el tooltip de cada celda del heatmap (solo las que aún no lo tienen).
function bindHeatmapCellTooltips(scrollEl) {
  if (!scrollEl) return;
  scrollEl.querySelectorAll('.heatmap-cell').forEach(cell => {
    if (cell._tipWired) return;
    cell._tipWired = true;
    cell.addEventListener('mouseenter', () => {
      const text = cell.getAttribute('data-tooltip');
      if (!text) return;
      const tooltip = getOrCreateChartTooltip();
      tooltip.textContent = text;
      tooltip.classList.add('visible');
      const rect = cell.getBoundingClientRect();
      tooltip.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
      tooltip.style.top = `${rect.top + window.scrollY - 25}px`;
      tooltip.style.transform = 'translateX(-50%)';
    });
    cell.addEventListener('mouseleave', () => {
      getOrCreateChartTooltip().classList.remove('visible');
    });
  });
}

// Añade más filas de días anteriores cuando el usuario se acerca al fondo del
// scroll, hasta llegar a la tarea más antigua de la etiqueta seleccionada.
function setupHeatmapInfiniteScroll(scrollEl) {
  if (!scrollEl || scrollEl._infiniteWired) return;
  scrollEl._infiniteWired = true;
  const grid = scrollEl.querySelector('.heatmap-grid');
  const hue = parseInt(scrollEl.dataset.hue, 10);
  const sat = parseInt(scrollEl.dataset.sat, 10);

  scrollEl.addEventListener('scroll', () => {
    const nearBottom = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 40;
    if (!nearBottom) return;
    const oldest = heatmapOldestDate();
    let next = scrollEl.dataset.next;
    if (oldest && next < oldest) return; // ya llegamos al límite

    // Cargar un bloque de días más antiguos.
    const BLOCK = 12;
    let cursor = new Date(next + 'T12:00:00');
    let added = 0;
    for (let i = 0; i < BLOCK; i++) {
      const dStr = formatDate(cursor);
      grid.insertAdjacentHTML('beforeend', renderHeatmapRow(dStr, hue, sat));
      added++;
      cursor.setDate(cursor.getDate() - 1);
      if (oldest && dStr <= oldest) break; // no pasar de la tarea más antigua
    }
    scrollEl.dataset.next = formatDate(cursor);
    if (added > 0) bindHeatmapCellTooltips(scrollEl);
  });
}

function getDatesInRange(fromStr, toStr) {
  const dates = [];
  const start = new Date(fromStr + 'T12:00:00');
  const end = new Date(toStr + 'T12:00:00');
  let current = new Date(start);
  while (current <= end) {
    dates.push(formatDate(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function renderDailyStatsPanel(panelEl, dateParam) {
  const chartPlaceholder = panelEl.querySelector('.daily-stats-chart-placeholder');
  const activityListEl = panelEl.querySelector('.activity-list');
  if (!chartPlaceholder || !activityListEl) return;

  let dates = [];
  if (typeof dateParam === 'string') {
    dates = [dateParam];
  } else if (dateParam && dateParam.from && dateParam.to) {
    dates = getDatesInRange(dateParam.from, dateParam.to);
  }

  const occurrences = [];
  dates.forEach(dStr => {
    const dateObj = new Date(dStr + 'T12:00:00');
    const dayTasks = tasks.filter(task => {
      if (!checkTaskOccurrence(task, dateObj)) return false;
      const tag = tags.find(t => t.id === task.tagId) || tags.find(t => t.id === 'default');
      return tag ? tag.visible !== false : true;
    });
    
    dayTasks.forEach(task => {
      const mins = getTaskDurationMinutes(task);
      if (mins === null || mins <= 0) return;
      
      const isCompleted = (task.recurrence && task.recurrence.enabled)
        ? !!(task.completedOccurrences && task.completedOccurrences.includes(dStr))
        : !!task.completed;
        
      if (statsStatusFilter === 'completed' && !isCompleted) return;
      if (statsStatusFilter === 'uncompleted' && isCompleted) return;
      
      occurrences.push({
        task,
        dateStr: dStr,
        mins
      });
    });
  });

  // Agrupar y sumar duraciones. Hay dos modos:
  //   'title'    → agrupa por título de tarea (resolviendo combinaciones/fusión).
  //   'activity' → agrupa por actividad (etiqueta/tag).
  const grouped = {};
  const prefix = panelEl.id.startsWith('general-stats-') ? 'general-stats' : 'daily-stats';
  const effectiveGroupBy = prefix === 'general-stats' ? 'activity' : statsGroupBy;
  if (effectiveGroupBy === 'activity') {
    occurrences.forEach(occ => {
      const task = occ.task;
      const dStr = occ.dateStr;
      const mins = occ.mins;
      let tagId = task.tagId || 'default';
      if (!tags.some(t => t.id === tagId)) tagId = 'default';

      // Grupos de actividades (panel "Agrupar actividades"): las actividades de
      // un grupo se suman en una sola fila con el nombre y color del grupo.
      const grp = getStatsGroupOfTag(tagId);
      let name;
      let groupColor = null;
      if (grp) {
        tagId = STATS_GROUP_KEY_PREFIX + grp.id;
        name = grp.name || 'Grupo';
        groupColor = grp.color || null;
      } else {
        const tag = tags.find(t => t.id === tagId) || tags.find(t => t.id === 'default');
        name = tag ? tag.name : 'Por defecto';
      }
      if (!grouped[tagId]) {
        grouped[tagId] = {
          name,
          displayName: name,
          minutes: 0,
          tagId: tagId,
          groupColor,
          tasks: [],
          occurrences: []
        };
      }
      grouped[tagId].minutes += mins;
      grouped[tagId].tasks.push(task);
      grouped[tagId].occurrences.push(occ);
    });
  } else {
    occurrences.forEach(occ => {
      const task = occ.task;
      const dStr = occ.dateStr;
      const mins = occ.mins;
      const originalName = task.title || '(Sin título)';

      // Resolver nombre combinado recursivamente
      const name = resolveStatsMerge(statsMergedTasks, originalName);

      if (!grouped[name]) {
        // Buscar el tagId de la tarea destino para mantener su color original
        const targetTask = occurrences.find(o => o.dateStr === dStr && (o.task.title || '(Sin título)') === name)?.task ||
                           tasks.find(t => (t.title || '(Sin título)') === name);
        const tagId = targetTask ? targetTask.tagId : task.tagId;

        grouped[name] = {
          name,
          displayName: statsCustomNames[`${dStr}_${name}`] || name,
          minutes: 0,
          tagId: tagId,
          tasks: [],
          occurrences: []
        };
      }
      grouped[name].minutes += mins;
      grouped[name].tasks.push(task);
      grouped[name].occurrences.push(occ);

      if (statsCustomNames[`${dStr}_${name}`]) {
        grouped[name].displayName = statsCustomNames[`${dStr}_${name}`];
      }
    });
  }
  
  const groupedList = Object.values(grouped);
  
  // Ordenar de mayor a menor duración (minutos)
  groupedList.sort((a, b) => b.minutes - a.minutes);
  
  // Asignar colores a los grupos
  const usedColors = new Set();
  groupedList.forEach((group, index) => {
    // Si tiene un color personalizado asignado en estadísticas para alguno de los días, usarlo
    let customColor = null;
    if (typeof dateParam === 'string') {
      const customColorKey = `${dateParam}_${group.name}`;
      if (statsCustomColors[customColorKey]) {
        customColor = statsCustomColors[customColorKey];
      }
    }
    // Grupo de actividades: siempre con el color definido en el grupo.
    if (group.groupColor) {
      group.color = { bg: group.groupColor.bg, border: group.groupColor.border || group.groupColor.bg };
      usedColors.add(group.color.bg.toLowerCase());
      return;
    }
    // Color fijado por una fusión (global, para todos los días).
    if (!customColor && statsCustomColors[STATS_GLOBAL_PREFIX + group.name]) {
      customColor = statsCustomColors[STATS_GLOBAL_PREFIX + group.name];
    }
    if (customColor) {
      // ya resuelto
    } else if (typeof dateParam === 'string') {
      // sin color personalizado para este día
    } else {
      for (let occ of group.occurrences) {
        const customColorKey = `${occ.dateStr}_${group.name}`;
        if (statsCustomColors[customColorKey]) {
          customColor = statsCustomColors[customColorKey];
          break;
        }
      }
    }

    if (customColor) {
      group.color = customColor;
      usedColors.add(group.color.bg.toLowerCase());
      return;
    }

    // Modo "Por etiqueta": usar SIEMPRE el color definido por el usuario para la
    // etiqueta de la tarea (incluida la etiqueta "Por defecto"), sin rotación ni
    // colores aleatorios. Si varias etiquetas comparten color, se repite.
    if (statsColorMode === 'tag') {
      const tagC = tags.find(t => t.id === group.tagId) || tags.find(t => t.id === 'default');
      if (tagC && tagC.color) {
        group.color = { bg: tagC.color.bg, border: tagC.color.border || tagC.color.bg };
        usedColors.add(group.color.bg.toLowerCase());
        return;
      }
    }

    const tag = tags.find(t => t.id === group.tagId) || tags.find(t => t.id === 'default');
    let bg = tag && tag.color ? tag.color.bg : null;
    let border = tag && tag.color ? tag.color.border : bg;

    if (!bg || group.tagId === 'default' || usedColors.has(bg.toLowerCase())) {
      let found = false;
      for (let i = 0; i < DEFAULT_COLORS.length; i++) {
        const candidate = DEFAULT_COLORS[i];
        if (!usedColors.has(candidate.bg.toLowerCase())) {
          bg = candidate.bg;
          border = candidate.border;
          found = true;
          break;
        }
      }
      
      if (!found) {
        const hue = Math.floor((index * 137.5) % 360);
        bg = `hsl(${hue}, 70%, 60%)`;
        border = `hsl(${hue}, 70%, 50%)`;
      }
    }
    
    usedColors.add(bg.toLowerCase());
    group.color = { bg, border };
  });
  
  const rangeKey = typeof dateParam === 'string' ? dateParam : `range_${dateParam.from}_${dateParam.to}`;
  // Estadísticas generales: etiquetas ocultas globales (guardadas en la cuenta).
  const excludedSet = prefix === 'general-stats' ? generalStatsHiddenTags : getExcludedSetForDate(rangeKey);
  const includedGroups = groupedList.filter(g => !excludedSet.has(g.name));
  const totalIncludedMins = includedGroups.reduce((sum, g) => sum + g.minutes, 0);
  
  // Initialize lineStatsActiveTags if empty in lineal mode
  if (prefix === 'general-stats' && generalStatsChartType === 'lineal' && lineStatsNeedsAutoSelect && lineStatsActiveTags.length === 0) {
    if (groupedList.length > 0) {
      lineStatsActiveTags = [groupedList[0].name];
    }
  }
  // Tras el primer render en modo lineal, respetar la selección del usuario
  // (incluido el estado de cero etiquetas).
  if (prefix === 'general-stats' && generalStatsChartType === 'lineal') {
    lineStatsNeedsAutoSelect = false;
  }

  // Renderizar gráfico
  const chartContainer = chartPlaceholder.parentElement;
  if (chartContainer) {
    if (prefix === 'general-stats' && (generalStatsChartType === 'habitos' || generalStatsChartType === 'heatmap')) {
      chartContainer.style.width = '100%';
      chartContainer.style.maxWidth = '340px';
      chartContainer.style.height = 'auto';
    } else if (prefix === 'general-stats' && (generalStatsChartType === 'barras-apiladas' || generalStatsChartType === 'lineal')) {
      chartContainer.style.width = '100%';
      chartContainer.style.maxWidth = '340px';
      chartContainer.style.height = '175px';
    } else {
      chartContainer.style.width = '175px';
      chartContainer.style.height = '175px';
      chartContainer.style.maxWidth = '';
    }
  }

  if (prefix === 'general-stats' && generalStatsChartType === 'heatmap') {
    chartPlaceholder.innerHTML = renderHeatmapHTML(dates);
    const scrollEl = chartPlaceholder.querySelector('.heatmap-scroll');
    bindHeatmapCellTooltips(scrollEl);
    setupHeatmapInfiniteScroll(scrollEl);
  } else if (prefix === 'general-stats' && generalStatsChartType === 'habitos') {
    chartPlaceholder.innerHTML = renderHabitTrackerHTML(dates);
    // El contador de constancia es único (en la cabecera): solo lo actualiza el
    // panel central, no los paneles laterales (prev/next) del slider.
    if (panelEl.id && panelEl.id.endsWith('-panel-curr')) {
      updateHabitStreakCount(dates);
    }
    // Tooltip por cuadrito (fecha + estado).
    const cells = chartPlaceholder.querySelectorAll('.habit-cell');
    cells.forEach(cell => {
      cell.addEventListener('mouseenter', () => {
        const text = cell.getAttribute('data-tooltip');
        if (!text) return;
        const tooltip = getOrCreateChartTooltip();
        tooltip.textContent = text;
        tooltip.classList.add('visible');
        const rect = cell.getBoundingClientRect();
        tooltip.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
        tooltip.style.top = `${rect.top + window.scrollY - 25}px`;
        tooltip.style.transform = 'translateX(-50%)';
      });
      cell.addEventListener('mouseleave', () => {
        getOrCreateChartTooltip().classList.remove('visible');
      });
    });
  } else if (prefix === 'general-stats' && generalStatsChartType === 'barras-apiladas') {
    chartPlaceholder.innerHTML = renderStackedBarChartSVG(occurrences, dates, groupedList, excludedSet);
  } else if (prefix === 'general-stats' && generalStatsChartType === 'lineal') {
    chartPlaceholder.innerHTML = renderLineChartSVG(occurrences, dates, groupedList, lineStatsActiveTags);
    
    // Enlazar eventos de hover para el tooltip instantáneo
    const hoverCircles = chartPlaceholder.querySelectorAll('.chart-hover-circle');
    hoverCircles.forEach(circle => {
      circle.addEventListener('mouseenter', () => {
        const text = circle.getAttribute('data-tooltip');
        const tooltip = getOrCreateChartTooltip();
        tooltip.textContent = text;
        tooltip.classList.add('visible');
        
        const rect = circle.getBoundingClientRect();
        tooltip.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
        tooltip.style.top = `${rect.top + window.scrollY - 25}px`;
        tooltip.style.transform = 'translateX(-50%)';
      });
      circle.addEventListener('mouseleave', () => {
        const tooltip = getOrCreateChartTooltip();
        tooltip.classList.remove('visible');
      });
    });
  } else {
    chartPlaceholder.innerHTML = renderPieChartSVG(includedGroups);
  }

  // Tooltip al pasar el cursor sobre una porción del gráfico circular o un
  // segmento del gráfico de barras (ambos llevan la clase .chart-slice y un
  // atributo data-tooltip con nombre · duración · porcentaje). El tooltip sigue
  // al cursor mientras está dentro de la porción.
  const chartSlices = chartPlaceholder.querySelectorAll('.chart-slice');
  chartSlices.forEach(slice => {
    slice.style.cursor = 'pointer';
    const moveTip = (e) => {
      const text = slice.getAttribute('data-tooltip');
      if (!text) return;
      const tooltip = getOrCreateChartTooltip();
      tooltip.textContent = text;
      tooltip.classList.add('visible');
      tooltip.style.left = `${e.clientX + window.scrollX}px`;
      if (text.includes('\n')) {
        // Varias líneas: anclar el borde inferior sobre el cursor.
        tooltip.style.top = `${e.clientY + window.scrollY - 10}px`;
        tooltip.style.transform = 'translate(-50%, -100%)';
      } else {
        tooltip.style.top = `${e.clientY + window.scrollY - 28}px`;
        tooltip.style.transform = 'translateX(-50%)';
      }
    };
    slice.addEventListener('mouseenter', moveTip);
    slice.addEventListener('mousemove', moveTip);
    slice.addEventListener('mouseleave', () => {
      getOrCreateChartTooltip().classList.remove('visible');
    });
  });

  // Los modos hábitos y heatmap no usan la tabla de actividades ni los totales.
  if (prefix === 'general-stats' && (generalStatsChartType === 'habitos' || generalStatsChartType === 'heatmap')) {
    activityListEl.innerHTML = '';
    const tw = panelEl.querySelector('.daily-stats-totals-wrapper');
    if (tw) tw.style.display = 'none';
    return;
  }

  let totalsWrapper = panelEl.querySelector('.daily-stats-totals-wrapper');
  if (!totalsWrapper) {
    totalsWrapper = document.createElement('div');
    totalsWrapper.className = 'daily-stats-totals-wrapper';
    activityListEl.parentNode.appendChild(totalsWrapper);
  }
  totalsWrapper.innerHTML = '';

  // Botón de combinar: disponible en un día, y también en rangos cuando se ve el
  // gráfico de barras o el lineal (las fusiones de actividades son globales).
  const isBarChartRange = prefix === 'general-stats'
    && (generalStatsChartType === 'barras-apiladas' || generalStatsChartType === 'lineal');
  // "Agrupar actividades" es un panel aparte: disponible siempre.
  const mergeAllowed = true;
  const mergeBtn = document.getElementById(prefix + '-merge-btn');
  if (mergeBtn) {
    mergeBtn.style.display = mergeAllowed ? '' : 'none';
    if (!mergeAllowed && statsMergeModeActive && activeStatsPrefix === prefix) {
      statsMergeModeActive = false;
      statsMergeFirstSelected = '';
      statsMergeFirstColor = null;
      statsMergeFirstName = '';
      mergeBtn.classList.remove('active');
    }
  }

  // Renderizar tabla
  activityListEl.innerHTML = '';
  if (groupedList.length === 0) {
    activityListEl.innerHTML = `<div class="daily-stats-empty">No hay actividades con duración para este día.</div>`;
    totalsWrapper.style.display = 'none';
  } else {
    totalsWrapper.style.display = 'block';
    const table = document.createElement('table');
    table.className = 'daily-stats-table';
    
    const tbody = document.createElement('tbody');

    // Determina si un grupo está desmarcado (oculto en el gráfico), usando la
    // misma regla que el render de cada fila (incluido el modo lineal).
    const isGroupExcluded = (group) => {
      if (prefix === 'general-stats' && generalStatsChartType === 'lineal') {
        return !lineStatsActiveTags.includes(group.name);
      }
      return excludedSet.has(group.name);
    };

    // Reordenar la lista para que los ítems desmarcados bajen al fondo: arriba
    // siempre quedan los que se están visualizando. Dentro de cada bloque se
    // conserva el orden previo (por mayor duración). Orden estable.
    const orderedList = [
      ...groupedList.filter(g => !isGroupExcluded(g)),
      ...groupedList.filter(g => isGroupExcluded(g))
    ];

    orderedList.forEach(group => {
      let isExcluded = isGroupExcluded(group);
      const mins = group.minutes;
      const percent = totalIncludedMins > 0 && !isExcluded ? (mins / totalIncludedMins * 100) : 0;
      const percentStr = isExcluded ? '-' : `${percent.toFixed(0)}%`;
      const durationStr = minutesToReadable(mins);
      
      const tr = document.createElement('tr');
      tr.className = 'daily-stats-row';
      if (statsMergeModeActive && statsMergeFirstSelected === group.name) {
        tr.classList.add('merge-selected');
      }
      
      // 1. Celda de Actividad (Muestra de color cuadrada + nombre)
      const tdName = document.createElement('td');
      tdName.style.overflow = 'hidden';
      
      const wrapper = document.createElement('div');
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.gap = '6px';
      wrapper.style.minWidth = '0';
      wrapper.style.overflow = 'hidden';
      
      const colorBox = document.createElement('div');
      colorBox.className = 'activity-color-box';
      colorBox.style.backgroundColor = group.color.bg;
      colorBox.style.borderColor = group.color.border;
      
      const nameSpan = document.createElement('span');
      nameSpan.className = 'activity-name';
      nameSpan.textContent = group.displayName || group.name;
      
      wrapper.appendChild(colorBox);
      wrapper.appendChild(nameSpan);
      tdName.appendChild(wrapper);
      tr.appendChild(tdName);
      
      // 2. Celda de Duración
      const tdDuration = document.createElement('td');
      tdDuration.style.textAlign = 'right';
      tdDuration.style.color = 'var(--text-main)';
      tdDuration.style.width = '62px';
      tdDuration.textContent = durationStr;
      tr.appendChild(tdDuration);
      
      // 3. Celda de Porcentaje
      const tdPercent = document.createElement('td');
      tdPercent.style.textAlign = 'right';
      tdPercent.style.width = '42px';
      tdPercent.textContent = percentStr;
      tr.appendChild(tdPercent);
      
      // Delegar click si no es un rango
      const isRange = dates.length > 1;
      if (!isRange) {
        const handleEditClick = (e) => {
          if (statsMergeModeActive) {
            handleStatsMergeClick(group, tr);
          } else {
            openStatsTaskEditView(group);
          }
        };
        tdName.addEventListener('click', handleEditClick);
        tdPercent.addEventListener('click', handleEditClick);
        tdDuration.addEventListener('click', handleEditClick);
        tdName.style.cursor = 'pointer';
        tdPercent.style.cursor = 'pointer';
        tdDuration.style.cursor = 'pointer';
      } else if (isBarChartRange) {
        // Gráfico de barras / lineal (rango): el clic en la fila solo sirve para
        // combinar actividades (el botón + sigue eligiendo las líneas).
        const handleMergeClick = () => {
          if (statsMergeModeActive) handleStatsMergeClick(group, tr);
        };
        [tdName, tdPercent, tdDuration].forEach(td => {
          td.addEventListener('click', handleMergeClick);
          td.style.cursor = statsMergeModeActive ? 'pointer' : 'default';
        });
      } else {
        tdName.style.cursor = 'default';
        tdPercent.style.cursor = 'default';
        tdDuration.style.cursor = 'default';
      }
      
      // 4. Botón de acción con icono '+' para excluir/incluir o seleccionar
      const tdAction = document.createElement('td');
      tdAction.style.textAlign = 'center';
      tdAction.style.width = '30px';
      
      const btn = document.createElement('button');
      btn.className = 'daily-stats-btn-exclude' + (isExcluded ? ' excluded' : '');
      
      let tooltipTitle = isExcluded ? 'Incluir en el total' : 'Excluir del total';
      if (prefix === 'general-stats' && generalStatsChartType === 'lineal') {
        tooltipTitle = isExcluded ? 'Mostrar en el gráfico' : 'Ocultar del gráfico';
      }
      btn.title = tooltipTitle;

      btn.innerHTML = `
        <svg width="12.5" height="12.5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="2" y="2" width="20" height="20" rx="5" fill="${isExcluded ? '#9a9a9a' : '#111111'}" />
          <line x1="12" y1="7" x2="12" y2="17" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" />
          <line x1="7" y1="12" x2="17" y2="12" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" />
        </svg>
      `;
      
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (prefix === 'general-stats' && generalStatsChartType === 'lineal') {
          if (lineStatsActiveTags.includes(group.name)) {
            lineStatsActiveTags = lineStatsActiveTags.filter(t => t !== group.name);
            rememberGeneralStatsLineTags();
            renderDailyStatsPanel(panelEl, dateParam);
          } else {
            if (lineStatsActiveTags.length >= 3) {
              showCenterToast('Puedes seleccionar un máximo de 3 actividades.');
            } else {
              lineStatsActiveTags.push(group.name);
              rememberGeneralStatsLineTags();
              renderDailyStatsPanel(panelEl, dateParam);
            }
          }
        } else {
          if (isExcluded) {
            excludedSet.delete(group.name);
          } else {
            excludedSet.add(group.name);
          }
          // Diarias: la visibilidad es global y se guarda en la cuenta.
          if (excludedSet === statsHiddenGroups) saveStatsHiddenGroups();
          // Generales: etiquetas ocultas globales, guardadas en la cuenta.
          if (excludedSet === generalStatsHiddenTags) saveGeneralStatsTagPrefs();
          renderDailyStatsPanel(panelEl, dateParam);
        }
      });
      
      tdAction.appendChild(btn);
      tr.appendChild(tdAction);
      
      tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    activityListEl.appendChild(table);
    
    // 5. Fila de Totales en su propia tabla estática
    const trTotal = document.createElement('tr');
    trTotal.className = 'daily-stats-total-row';
    trTotal.style.fontWeight = '700';
    
    const tdTotalName = document.createElement('td');
    tdTotalName.textContent = '';
    trTotal.appendChild(tdTotalName);
    
    const tdTotalDuration = document.createElement('td');
    tdTotalDuration.style.textAlign = 'right';
    tdTotalDuration.style.width = '62px';
    tdTotalDuration.textContent = minutesToReadable(totalIncludedMins);
    trTotal.appendChild(tdTotalDuration);
    
    const tdTotalPercent = document.createElement('td');
    tdTotalPercent.style.textAlign = 'right';
    tdTotalPercent.style.width = '42px';
    tdTotalPercent.textContent = '100%';
    trTotal.appendChild(tdTotalPercent);
    
    const tdTotalAction = document.createElement('td');
    tdTotalAction.style.width = '30px';
    trTotal.appendChild(tdTotalAction);
    
    const totalTable = document.createElement('table');
    totalTable.className = 'daily-stats-table';
    totalTable.style.marginTop = '0';
    
    const totalTbody = document.createElement('tbody');
    totalTbody.appendChild(trTotal);
    totalTable.appendChild(totalTbody);
    
    totalsWrapper.appendChild(totalTable);
  }
}

function handleStatsStatusFilterChange(newFilter) {
  statsStatusFilter = newFilter;

  const selects = document.querySelectorAll('.daily-stats-status-select');
  selects.forEach(sel => {
    sel.value = newFilter;
  });

  rerenderDailyStatsPanels();
  saveStatsSettings();
}

function handleStatsGroupByChange(newMode) {
  statsGroupBy = newMode;

  const selects = document.querySelectorAll('.daily-stats-groupby-select');
  selects.forEach(sel => {
    sel.value = newMode;
  });

  rerenderDailyStatsPanels();
  saveStatsSettings();
}

function handleStatsColorModeChange(newMode) {
  statsColorMode = newMode;

  const selects = document.querySelectorAll('.daily-stats-color-select');
  selects.forEach(sel => {
    sel.value = newMode;
  });

  rerenderDailyStatsPanels();
  saveStatsSettings();
}

// Persiste los ajustes globales de estadísticas (agrupación, estado, color) en
// el caché local y en Supabase. Estos ajustes aplican a TODOS los días.
function saveStatsSettings() {
  if (!currentUser) return;
  const prefsCacheKey = 'prefs_cache_' + currentUser.id;
  let prefs = {};
  try {
    const cached = localStorage.getItem(prefsCacheKey);
    if (cached) prefs = JSON.parse(cached);
  } catch (e) {}

  prefs.statsGroupBy = statsGroupBy;
  prefs.statsStatusFilter = statsStatusFilter;
  prefs.statsColorMode = statsColorMode;
  prefs.generalStatsChartType = generalStatsChartType;

  try {
    localStorage.setItem(prefsCacheKey, JSON.stringify(prefs));
  } catch (e) {}

  savePreferences(prefs);
}

// Abre la vista de Ajustes del panel de actividad (oculta la vista principal).
function openDailyStatsSettings() {
  const main = getStatsEl('daily-stats-main-content');
  const settings = getStatsEl('daily-stats-settings-content');
  if (!main || !settings) return;
  // Sincronizar los selects con el estado actual.
  const g = getStatsEl('daily-stats-groupby-select');
  const s = getStatsEl('daily-stats-status-select');
  const c = getStatsEl('daily-stats-color-select');
  if (g) g.value = activeStatsPrefix === 'general-stats' ? 'activity' : statsGroupBy;
  if (s) s.value = statsStatusFilter;
  if (c) c.value = statsColorMode;
  // Guardar el estado actual para poder restaurarlo si el usuario cancela.
  statsSettingsSnapshot = {
    groupBy: statsGroupBy,
    status: statsStatusFilter,
    color: statsColorMode,
  };
  main.classList.add('hidden');
  settings.classList.remove('hidden');
}

// Cancela los Ajustes: revierte a los valores que había al abrir y vuelve.
function cancelDailyStatsSettings() {
  if (statsSettingsSnapshot) {
    handleStatsGroupByChange(statsSettingsSnapshot.groupBy);
    handleStatsStatusFilterChange(statsSettingsSnapshot.status);
    handleStatsColorModeChange(statsSettingsSnapshot.color);
  }
  closeDailyStatsSettings();
}

// Cierra la vista de Ajustes y vuelve a la vista principal del panel.
function closeDailyStatsSettings() {
  const main = getStatsEl('daily-stats-main-content');
  const settings = getStatsEl('daily-stats-settings-content');
  if (settings) settings.classList.add('hidden');
  if (main) main.classList.remove('hidden');
}

function rerenderDailyStatsPanels() {
  if (activeStatsPrefix === 'general-stats' && generalStatsDateRange) {
    renderGeneralStatsForRange();
    return;
  }

  const panelPrev = getStatsEl('daily-stats-panel-prev');
  const panelCurr = getStatsEl('daily-stats-panel-curr');
  const panelNext = getStatsEl('daily-stats-panel-next');

  if (panelPrev) renderDailyStatsPanel(panelPrev, getRelativeDateString(currentDailyStatsDate, -1));
  if (panelCurr) renderDailyStatsPanel(panelCurr, currentDailyStatsDate);
  if (panelNext) renderDailyStatsPanel(panelNext, getRelativeDateString(currentDailyStatsDate, 1));
}

function estadisticasDiarias(dateStr, resetFilter = false) {
  currentDailyStatsDate = dateStr;

  // Los ajustes de estadísticas (estado, agrupación, color) son globales y
  // persistentes (se guardan en Supabase), por lo que se conservan al abrir el
  // modal, al cerrarlo y entre sesiones. Ya no se restablecen por defecto.
  // (Se mantiene el parámetro resetFilter por compatibilidad, sin efecto.)
  const selects = document.querySelectorAll('.' + activeStatsPrefix + '-status-select');
  selects.forEach(sel => {
    sel.value = statsStatusFilter;
  });
  const groupBySelects = document.querySelectorAll('.' + activeStatsPrefix + '-groupby-select');
  groupBySelects.forEach(sel => {
    sel.value = activeStatsPrefix === 'general-stats' ? 'activity' : statsGroupBy;
  });
  const colorSelects = document.querySelectorAll('.' + activeStatsPrefix + '-color-select');
  colorSelects.forEach(sel => {
    sel.value = statsColorMode;
  });

  const formattedDate = formatToDDMMYYYY(dateStr);
  const titleEl = getStatsEl('daily-stats-title');
  if (titleEl) {
    titleEl.textContent = `Actividad ${formattedDate}`;
  }
  
  const prevDateStr = getRelativeDateString(dateStr, -1);
  const nextDateStr = getRelativeDateString(dateStr, 1);
  
  const panelPrev = getStatsEl('daily-stats-panel-prev');
  const panelCurr = getStatsEl('daily-stats-panel-curr');
  const panelNext = getStatsEl('daily-stats-panel-next');
  
  if (panelPrev) renderDailyStatsPanel(panelPrev, prevDateStr);
  if (panelCurr) renderDailyStatsPanel(panelCurr, dateStr);
  if (panelNext) renderDailyStatsPanel(panelNext, nextDateStr);
  
  const slider = getStatsEl('daily-stats-slider');
  if (slider) {
    slider.style.transition = 'none';
    slider.style.transform = 'translateX(-33.3333%)';
  }
  
  const modal = getStatsEl('daily-stats-modal');
  if (modal) {
    modal.classList.remove('hidden');
    // Asegurar que comience en la vista principal y con la fusión desactivada
    const mainContent = getStatsEl('daily-stats-main-content');
    const editContent = getStatsEl('daily-stats-edit-content');
    const settingsContent = getStatsEl('daily-stats-settings-content');
    if (mainContent) mainContent.classList.remove('hidden');
    if (editContent) editContent.classList.add('hidden');
    if (settingsContent) settingsContent.classList.add('hidden');
    
    statsMergeModeActive = false;
    statsMergeFirstSelected = '';
    statsMergeFirstColor = null;
    statsMergeFirstName = '';
    const mergeBtn = getStatsEl('daily-stats-merge-btn');
    if (mergeBtn) mergeBtn.classList.remove('active');
  }
}

// "Últimos N días": terminan AYER (el día actual no se considera). Si se pasa
// una fecha de referencia pasada, el periodo termina en esa fecha.
function lastNDaysRange(n, refDateStr) {
  const yesterday = new Date();
  yesterday.setHours(12, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);
  let end = refDateStr ? new Date(refDateStr + 'T12:00:00') : new Date(yesterday);
  if (end > yesterday) end = new Date(yesterday);
  const from = new Date(end);
  from.setDate(from.getDate() - (n - 1));
  return { from: formatDate(from), to: formatDate(end) };
}

// Pone como actividad de Hábitos / Mapa de calor la elegida por el usuario
// (guardada en la cuenta). Si no hay elección guardada, la más frecuente del rango.
function applySavedHabitTag() {
  if (generalStatsSavedHabitTag && tags.some(t => t.id === generalStatsSavedHabitTag)) {
    generalStatsHabitTag = generalStatsSavedHabitTag;
  } else if (generalStatsDateRange) {
    const topTag = generalStatsChartType === 'heatmap'
      ? topTagByDurationInRange(generalStatsDateRange.from, generalStatsDateRange.to)
      : topTagByCompletedDaysInRange(generalStatsDateRange.from, generalStatsDateRange.to);
    if (topTag) generalStatsHabitTag = topTag;
  }
  if (typeof setHabitSelectTagValue === 'function') setHabitSelectTagValue(generalStatsHabitTag);
}

function updatePeriodSelectOptions() {
  const periodSelect = document.getElementById('general-stats-period-select');
  if (!periodSelect) return;

  const currentVal = periodSelect.value;
  
  if (generalStatsChartType === 'barras-apiladas') {
    periodSelect.innerHTML = `
      <option value="7dias">Últimos 7 días</option>
      <option value="semanal">Semanal</option>
      <option value="personalizado">Personalizado</option>
    `;
    if (currentVal === 'semanal' || currentVal === 'personalizado') {
      periodSelect.value = currentVal;
    } else {
      periodSelect.value = '7dias';
    }
  } else if (generalStatsChartType === 'lineal') {
    periodSelect.innerHTML = `
      <option value="10dias">Últimos 10 días</option>
      <option value="30dias">Últimos 30 días</option>
    `;
    if (currentVal === '10dias' || currentVal === '30dias') {
      periodSelect.value = currentVal;
    } else {
      periodSelect.value = '10dias';
    }
  } else if (generalStatsChartType === 'habitos') {
    periodSelect.innerHTML = `
      <option value="30dias">Últimos 30 días</option>
      <option value="50dias">Últimos 50 días</option>
      <option value="100dias">Últimos 100 días</option>
    `;
    periodSelect.value = ['30dias', '50dias', '100dias'].includes(currentVal) ? currentVal : '100dias';
  } else if (generalStatsChartType === 'heatmap') {
    periodSelect.innerHTML = `
      <option value="12dias">Últimos 12 días</option>
    `;
    periodSelect.value = '12dias';
  } else {
    periodSelect.innerHTML = `
      <option value="hoy">Hoy</option>
      <option value="7dias">Últimos 7 días</option>
      <option value="30dias">Últimos 30 días</option>
      <option value="personalizado">Personalizado</option>
    `;
    if (currentVal === 'hoy' || currentVal === '7dias' || currentVal === '30dias' || currentVal === 'personalizado') {
      periodSelect.value = currentVal;
    } else {
      periodSelect.value = 'hoy';
    }
  }
}

function estadisticasGenerales(dateStr, resetFilter = false) {
  activeStatsPrefix = 'general-stats';
  
  const chartTypeSelect = document.getElementById('general-stats-chart-type-select');
  if (chartTypeSelect) {
    chartTypeSelect.value = generalStatsChartType;
  }
  
  updatePeriodSelectOptions();
  
  const periodSelect = document.getElementById('general-stats-period-select');
  if (periodSelect) {
    if (generalStatsChartType === 'barras-apiladas') {
      // Por defecto: últimos 7 días (sin contar hoy).
      periodSelect.value = '7dias';
      generalStatsDateRange = lastNDaysRange(7, dateStr);
    } else if (generalStatsChartType === 'lineal') {
      periodSelect.value = '10dias';
      
      generalStatsDateRange = lastNDaysRange(10, dateStr);
      
      // Etiquetas del gráfico lineal: las guardadas por el usuario (si siguen
      // existiendo); si no, se deja que renderDailyStatsPanel elija la principal.
      const savedLine = (generalStatsSavedLineTags || []).filter(n => tags.some(t => t.name === n));
      if (generalStatsSavedLineTags && savedLine.length > 0) {
        lineStatsActiveTags = savedLine.slice(0, 3);
        lineStatsNeedsAutoSelect = false;
      } else {
        lineStatsActiveTags = [];
        lineStatsNeedsAutoSelect = true;
      }
    } else if (generalStatsChartType === 'habitos') {
      // Periodo: el que esté elegido (30 / 50 / 100 días); por defecto 100.
      const habitDays = { '30dias': 30, '50dias': 50, '100dias': 100 }[periodSelect.value] || 100;
      periodSelect.value = habitDays + 'dias';

      generalStatsDateRange = lastNDaysRange(habitDays, dateStr);

      // Etiqueta: la guardada por el usuario; si no hay, la que más se repite
      // (más días completados) en el rango.
      if (generalStatsSavedHabitTag && tags.some(t => t.id === generalStatsSavedHabitTag)) {
        generalStatsHabitTag = generalStatsSavedHabitTag;
      } else {
        const topTag = topTagByCompletedDaysInRange(generalStatsDateRange.from, generalStatsDateRange.to);
        if (topTag) generalStatsHabitTag = topTag;
      }
    } else if (generalStatsChartType === 'heatmap') {
      periodSelect.value = '12dias';

      generalStatsDateRange = lastNDaysRange(12, dateStr);

      // Etiqueta: la guardada por el usuario; si no hay, la de mayor duración
      // acumulada en estos 12 días.
      if (generalStatsSavedHabitTag && tags.some(t => t.id === generalStatsSavedHabitTag)) {
        generalStatsHabitTag = generalStatsSavedHabitTag;
      } else {
        const topTag = topTagByDurationInRange(generalStatsDateRange.from, generalStatsDateRange.to);
        if (topTag) generalStatsHabitTag = topTag;
      }
    } else {
      periodSelect.value = 'hoy';
      generalStatsDateRange = null;
    }
  } else {
    generalStatsDateRange = null;
  }
  
  estadisticasDiarias(dateStr, resetFilter);

  if (generalStatsDateRange) {
    renderGeneralStatsForRange();
  }
}

function handleGeneralStatsChartTypeChange() {
  updatePeriodSelectOptions();
  handleGeneralStatsPeriodChange();
}

function handleGeneralStatsPeriodChange() {
  const periodSelect = document.getElementById('general-stats-period-select');
  if (!periodSelect) return;
  
  const val = periodSelect.value;
  if (val === 'hoy') {
    generalStatsDateRange = null;
    estadisticasGenerales(formatDate(new Date()));
  } else if (val === 'semanal') {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const curr = currentDailyStatsDate ? new Date(currentDailyStatsDate + 'T12:00:00') : today;
    const day = curr.getDay();
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(curr.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    generalStatsDateRange = {
      from: formatDate(monday),
      to: formatDate(sunday)
    };
    renderGeneralStatsForRange();
  } else if (val === '10dias') {
    generalStatsDateRange = lastNDaysRange(10);
    renderGeneralStatsForRange();
  } else if (val === '7dias') {
    generalStatsDateRange = lastNDaysRange(7);
    renderGeneralStatsForRange();
  } else if (val === '12dias' || val === '30dias' || val === '50dias' || val === '100dias') {
    const days = val === '12dias' ? 12 : (val === '50dias' ? 50 : (val === '100dias' ? 100 : 30));
    generalStatsDateRange = lastNDaysRange(days);
    // Hábitos / Mapa de calor: usar la actividad guardada (en la cuenta) también
    // al cambiar a estos gráficos desde otro, no solo al abrir las estadísticas.
    if (generalStatsChartType === 'habitos' || generalStatsChartType === 'heatmap') {
      applySavedHabitTag();
    }
    renderGeneralStatsForRange();
  } else if (val === 'personalizado') {
    openGeneralStatsCustomRangeModal();
  }
}

let previousPeriodValue = 'hoy';
let customRangeQueue = ['start', 'duration']; // cola de edición para sincronización

function openGeneralStatsCustomRangeModal() {
  const mainModal = document.getElementById('general-stats-modal');
  if (mainModal) mainModal.classList.add('hidden');
  
  const modal = document.getElementById('general-stats-custom-range-modal');
  if (!modal) return;
  
  const durationRow = document.getElementById('general-stats-custom-range-duration-row');
  const barrasRow = document.getElementById('general-stats-custom-range-barras-row');
  
  const fromInput = document.getElementById('general-stats-custom-range-start');
  const toInput = document.getElementById('general-stats-custom-range-end');
  const durationInput = document.getElementById('general-stats-custom-range-duration');
  
  const unitSelect = document.getElementById('general-stats-custom-range-unit');
  const qtySelect = document.getElementById('general-stats-custom-range-qty');
  
  if (generalStatsChartType === 'barras-apiladas') {
    if (durationRow) durationRow.classList.add('hidden');
    if (barrasRow) barrasRow.classList.remove('hidden');
  } else {
    if (durationRow) durationRow.classList.remove('hidden');
    if (barrasRow) barrasRow.classList.add('hidden');
  }

  if (fromInput && toInput) {
    if (generalStatsDateRange) {
      fromInput.value = generalStatsDateRange.from;
      toInput.value = generalStatsDateRange.to;
      let days = countDaysInRange(generalStatsDateRange.from, generalStatsDateRange.to);
      if (days !== null) {
        if (generalStatsChartType === 'barras-apiladas') {
          let unit = generalStatsDateRange.unit || 'dias';
          let qty = generalStatsDateRange.qty || 7;
          if (!generalStatsDateRange.unit) {
            if (days % 30 === 0 && days >= 120 && days <= 360) {
              unit = 'meses';
              qty = days / 30;
            } else if (days % 7 === 0 && days >= 28 && days <= 84) {
              unit = 'semanas';
              qty = days / 7;
            } else {
              unit = 'dias';
              qty = Math.max(4, Math.min(12, days));
            }
          }
          if (unitSelect) unitSelect.value = unit;
          if (qtySelect) qtySelect.value = qty;
          
          const factor = (unit === 'semanas' ? 7 : unit === 'meses' ? 30 : 1);
          days = qty * factor;
          
          const startDate = new Date(generalStatsDateRange.from + 'T12:00:00');
          startDate.setDate(startDate.getDate() + days - 1);
          toInput.value = formatDate(startDate);
        } else {
          if (durationInput) durationInput.value = days;
        }
      }
    } else {
      const todayStr = formatDate(new Date());
      fromInput.value = todayStr;
      if (generalStatsChartType === 'barras-apiladas') {
        if (unitSelect) unitSelect.value = 'dias';
        if (qtySelect) qtySelect.value = '7';
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 6);
        toInput.value = formatDate(endDate);
      } else {
        toInput.value = todayStr;
        if (durationInput) durationInput.value = 1;
      }
    }
  }
  
  customRangeQueue = ['start', 'duration']; // reiniciar cola de seguimiento
  modal.classList.remove('hidden');
}

function closeGeneralStatsCustomRangeModal(applied = false) {
  const modal = document.getElementById('general-stats-custom-range-modal');
  if (modal) modal.classList.add('hidden');
  
  const mainModal = document.getElementById('general-stats-modal');
  if (mainModal) mainModal.classList.remove('hidden');
  
  if (!applied) {
    const periodSelect = document.getElementById('general-stats-period-select');
    if (periodSelect) {
      periodSelect.value = previousPeriodValue;
    }
  }
}

function recordCustomRangeChange(field) {
  customRangeQueue = customRangeQueue.filter(f => f !== field);
  customRangeQueue.push(field);
  
  // Ya no hay campo "Día de término" visible: el término siempre se calcula a
  // partir del inicio y la cantidad de días.
  const adjustedField = 'end';
  
  const startInput = document.getElementById('general-stats-custom-range-start');
  const endInput = document.getElementById('general-stats-custom-range-end');
  const durationInput = document.getElementById('general-stats-custom-range-duration');
  
  const unitSelect = document.getElementById('general-stats-custom-range-unit');
  const qtySelect = document.getElementById('general-stats-custom-range-qty');
  
  if (!startInput || !endInput) return;
  
  let startVal = startInput.value;
  let endVal = endInput.value;
  
  let durationVal = 1;
  if (generalStatsChartType === 'barras-apiladas') {
    const unit = unitSelect ? unitSelect.value : 'dias';
    const qty = qtySelect ? parseInt(qtySelect.value, 10) : 7;
    durationVal = qty * (unit === 'semanas' ? 7 : unit === 'meses' ? 30 : 1);
  } else {
    durationVal = durationInput ? (parseInt(durationInput.value, 10) || 1) : 1;
    if (durationVal < 1) durationVal = 1;
    if (durationInput) durationInput.value = durationVal;
  }
  
  if (adjustedField === 'start') {
    if (endVal) {
      const endDate = new Date(endVal + 'T12:00:00');
      endDate.setDate(endDate.getDate() - durationVal + 1);
      startInput.value = formatDate(endDate);
    }
  } else if (adjustedField === 'end') {
    if (startVal) {
      const startDate = new Date(startVal + 'T12:00:00');
      startDate.setDate(startDate.getDate() + durationVal - 1);
      endInput.value = formatDate(startDate);
    }
  } else if (adjustedField === 'duration') {
    if (startVal && endVal) {
      const days = countDaysInRange(startVal, endVal);
      if (days !== null) {
        if (generalStatsChartType === 'barras-apiladas') {
          let unit = 'dias';
          let qty = 7;
          if (days % 30 === 0 && days >= 120 && days <= 360) {
            unit = 'meses';
            qty = days / 30;
          } else if (days % 7 === 0 && days >= 28 && days <= 84) {
            unit = 'semanas';
            qty = days / 7;
          } else {
            unit = 'dias';
            qty = Math.max(4, Math.min(12, days));
          }
          if (unitSelect) unitSelect.value = unit;
          if (qtySelect) qtySelect.value = qty;
          
          const factor = (unit === 'semanas' ? 7 : unit === 'meses' ? 30 : 1);
          const finalDays = qty * factor;
          if (finalDays !== days) {
            const startDate = new Date(startVal + 'T12:00:00');
            startDate.setDate(startDate.getDate() + finalDays - 1);
            endInput.value = formatDate(startDate);
          }
        } else {
          if (durationInput) durationInput.value = Math.max(1, days);
        }
      } else {
        endInput.value = startVal;
        if (generalStatsChartType === 'barras-apiladas') {
          if (unitSelect) unitSelect.value = 'dias';
          if (qtySelect) qtySelect.value = '7';
        } else {
          if (durationInput) durationInput.value = 1;
        }
      }
    }
  }
}

function shiftCustomRange(direction) {
  const startInput = document.getElementById('general-stats-custom-range-start');
  const endInput = document.getElementById('general-stats-custom-range-end');
  const durationInput = document.getElementById('general-stats-custom-range-duration');
  
  const unitSelect = document.getElementById('general-stats-custom-range-unit');
  const qtySelect = document.getElementById('general-stats-custom-range-qty');
  
  if (!startInput || !endInput) return;
  
  let startVal = startInput.value;
  if (!startVal) return;
  
  let durationVal = 1;
  if (generalStatsChartType === 'barras-apiladas') {
    const unit = unitSelect ? unitSelect.value : 'dias';
    const qty = qtySelect ? parseInt(qtySelect.value, 10) : 7;
    durationVal = qty * (unit === 'semanas' ? 7 : unit === 'meses' ? 30 : 1);
  } else {
    durationVal = durationInput ? (parseInt(durationInput.value, 10) || 1) : 1;
  }
  
  const startDate = new Date(startVal + 'T12:00:00');
  const offset = direction === 'next' ? durationVal : -durationVal;
  
  startDate.setDate(startDate.getDate() + offset);
  startInput.value = formatDate(startDate);
  
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + durationVal - 1);
  endInput.value = formatDate(endDate);
}

function handleGeneralStatsCustomRangeAccept() {
  const startInput = document.getElementById('general-stats-custom-range-start');
  const endInput = document.getElementById('general-stats-custom-range-end');
  if (!startInput || !endInput) return;
  
  const fromVal = startInput.value;
  const toVal = endInput.value;
  
  if (!fromVal || !toVal) {
    alert('Por favor selecciona las fechas de inicio y término.');
    return;
  }
  
  if (fromVal > toVal) {
    alert('La fecha de inicio no puede ser posterior a la fecha de término.');
    return;
  }
  
  let unit = 'dias';
  let qty = 7;
  if (generalStatsChartType === 'barras-apiladas') {
    const unitSelect = document.getElementById('general-stats-custom-range-unit');
    const qtySelect = document.getElementById('general-stats-custom-range-qty');
    unit = unitSelect ? unitSelect.value : 'dias';
    qty = qtySelect ? parseInt(qtySelect.value, 10) : 7;
    
    const days = countDaysInRange(fromVal, toVal);
    const expectedDays = qty * (unit === 'semanas' ? 7 : unit === 'meses' ? 30 : 1);
    if (days !== expectedDays) {
      alert('La duración de las fechas seleccionadas no coincide con la cantidad configurada.');
      return;
    }
  }
  
  generalStatsDateRange = {
    from: fromVal,
    to: toVal,
    unit: unit,
    qty: qty
  };
  
  previousPeriodValue = 'personalizado';
  closeGeneralStatsCustomRangeModal(true);
  
  const periodSelect = document.getElementById('general-stats-period-select');
  if (periodSelect) {
    periodSelect.value = 'personalizado';
  }
  
  renderGeneralStatsForRange();
}

function renderGeneralStatsForRange() {
  if (!generalStatsDateRange) return;
  
  const titleEl = document.getElementById('general-stats-title');
  if (titleEl) {
    const fromFormatted = formatToDDMMYYYY(generalStatsDateRange.from);
    const toFormatted = formatToDDMMYYYY(generalStatsDateRange.to);
    titleEl.textContent = `Actividad ${fromFormatted} - ${toFormatted}`;
  }
  
  const panelCurr = document.getElementById('general-stats-panel-curr');
  if (panelCurr) {
    renderDailyStatsPanel(panelCurr, generalStatsDateRange);
  }
  
  const panelPrev = document.getElementById('general-stats-panel-prev');
  const panelNext = document.getElementById('general-stats-panel-next');
  
  const days = countDaysInRange(generalStatsDateRange.from, generalStatsDateRange.to);
  if (days !== null) {
    if (panelPrev) {
      const prevFrom = new Date(generalStatsDateRange.from + 'T12:00:00');
      prevFrom.setDate(prevFrom.getDate() - days);
      const prevTo = new Date(generalStatsDateRange.to + 'T12:00:00');
      prevTo.setDate(prevTo.getDate() - days);
      renderDailyStatsPanel(panelPrev, { from: formatDate(prevFrom), to: formatDate(prevTo) });
    }
    if (panelNext) {
      const nextFrom = new Date(generalStatsDateRange.from + 'T12:00:00');
      nextFrom.setDate(nextFrom.getDate() + days);
      const nextTo = new Date(generalStatsDateRange.to + 'T12:00:00');
      nextTo.setDate(nextTo.getDate() + days);
      renderDailyStatsPanel(panelNext, { from: formatDate(nextFrom), to: formatDate(nextTo) });
    }
  } else {
    if (panelPrev) {
      const chart = panelPrev.querySelector('.daily-stats-chart-placeholder');
      const list = panelPrev.querySelector('.activity-list');
      if (chart) chart.innerHTML = '';
      if (list) list.innerHTML = '';
    }
    if (panelNext) {
      const chart = panelNext.querySelector('.daily-stats-chart-placeholder');
      const list = panelNext.querySelector('.activity-list');
      if (chart) chart.innerHTML = '';
      if (list) list.innerHTML = '';
    }
  }
  
  const slider = document.getElementById('general-stats-slider');
  if (slider) {
    slider.style.transition = 'none';
    slider.style.transform = 'translateX(-33.3333%)';
  }
}

function shiftGeneralStatsRange(direction) {
  // direction is -1 for previous period, 1 for next period
  const periodSelect = document.getElementById('general-stats-period-select');
  if (!periodSelect) return;
  
  const val = periodSelect.value;
  if (val === 'hoy' || !generalStatsDateRange) {
    const currentDate = new Date(currentDailyStatsDate + 'T12:00:00');
    currentDate.setDate(currentDate.getDate() + direction);
    estadisticasDiarias(formatDate(currentDate));
    return;
  }
  
  const days = countDaysInRange(generalStatsDateRange.from, generalStatsDateRange.to);
  if (days === null) return;
  
  const fromDate = new Date(generalStatsDateRange.from + 'T12:00:00');
  const toDate = new Date(generalStatsDateRange.to + 'T12:00:00');
  
  fromDate.setDate(fromDate.getDate() + direction * days);
  toDate.setDate(toDate.getDate() + direction * days);
  
  generalStatsDateRange = {
    from: formatDate(fromDate),
    to: formatDate(toDate),
    unit: generalStatsDateRange.unit,
    qty: generalStatsDateRange.qty
  };
  
  renderGeneralStatsForRange();
}

function initStatsModals() {
  const dailyContainer = document.getElementById('daily-stats-modal');
  if (dailyContainer) {
    dailyContainer.innerHTML = getStatsModalHTML('daily-stats');
  }
  const generalContainer = document.getElementById('general-stats-modal');
  if (generalContainer) {
    generalContainer.innerHTML = getStatsModalHTML('general-stats');
  }

  initStatsEvents('daily-stats');
  initStatsEvents('general-stats');
}

function initStatsEvents(prefix) {
  const getEl = (baseId) => {
    let id = baseId;
    if (baseId.startsWith('stats-edit-')) {
      id = prefix + '-edit-' + baseId.substring(11);
    } else if (baseId.startsWith('daily-stats-')) {
      id = prefix + '-' + baseId.substring(12);
    }
    return document.getElementById(id);
  };

  const statsEditCancelBtn = getEl('stats-edit-cancel-btn');
  if (statsEditCancelBtn) statsEditCancelBtn.addEventListener('click', closeStatsTaskEditView);

  const statsEditSaveBtn = getEl('stats-edit-save-btn');
  if (statsEditSaveBtn) statsEditSaveBtn.addEventListener('click', saveStatsTaskEdit);

  const statsEditResetBtn = getEl('stats-edit-reset-btn');
  if (statsEditResetBtn) statsEditResetBtn.addEventListener('click', resetStatsTaskEdit);

  const statsEditCloseBtn = getEl('stats-edit-close-btn');
  if (statsEditCloseBtn) statsEditCloseBtn.addEventListener('click', closeStatsTaskEditView);

  const statsMergeBtn = getEl('daily-stats-merge-btn');
  if (statsMergeBtn) statsMergeBtn.addEventListener('click', openStatsGroupsModal);

  ['stats-edit-hsl-h', 'stats-edit-hsl-s', 'stats-edit-hsl-l'].forEach(id => {
    const el = getEl(id);
    if (el) el.addEventListener('input', updateStatsHslPreview);
  });

  const statusSelect = getEl('daily-stats-status-select');
  if (statusSelect) {
    statusSelect.addEventListener('change', (e) => handleStatsStatusFilterChange(e.target.value));
  }
  const groupbySelect = getEl('daily-stats-groupby-select');
  if (groupbySelect) {
    groupbySelect.addEventListener('change', (e) => handleStatsGroupByChange(e.target.value));
  }
  const colorSelect = getEl('daily-stats-color-select');
  if (colorSelect) {
    colorSelect.addEventListener('change', (e) => handleStatsColorModeChange(e.target.value));
  }

  const statsSettingsBtn = getEl('daily-stats-settings-btn');
  if (statsSettingsBtn) statsSettingsBtn.addEventListener('click', openDailyStatsSettings);
  const statsSettingsClose = getEl('daily-stats-settings-close-btn');
  if (statsSettingsClose) statsSettingsClose.addEventListener('click', cancelDailyStatsSettings);
  const statsSettingsCancel = getEl('daily-stats-settings-cancel-btn');
  if (statsSettingsCancel) statsSettingsCancel.addEventListener('click', cancelDailyStatsSettings);
  const statsSettingsDone = getEl('daily-stats-settings-done-btn');
  if (statsSettingsDone) statsSettingsDone.addEventListener('click', closeDailyStatsSettings);

  // Close close-modal-btn for this prefix modal
  const modalCloseBtns = document.getElementById(prefix + '-modal').querySelectorAll('.close-modal-btn[data-modal]');
  modalCloseBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById(prefix + '-modal').classList.add('hidden');
    });
  });

  if (prefix === 'general-stats') {
    const chartTypeSelect = document.getElementById('general-stats-chart-type-select');
    if (chartTypeSelect) {
      chartTypeSelect.addEventListener('change', (e) => {
        generalStatsChartType = e.target.value;
        saveStatsSettings();
        updateHabitTagRowVisibility();
        handleGeneralStatsChartTypeChange();
      });
    }

    // El selector de etiqueta del modo Hábitos se puebla y engancha de forma
    // perezosa en updateHabitTagRowVisibility() al entrar en ese modo.
    updateHabitTagRowVisibility();

    const periodSelect = document.getElementById('general-stats-period-select');
    if (periodSelect) {
      periodSelect.addEventListener('focus', () => {
        previousPeriodValue = periodSelect.value;
      });
      periodSelect.addEventListener('change', handleGeneralStatsPeriodChange);
      
      let selectOpen = false;
      periodSelect.addEventListener('click', () => {
        if (periodSelect.value === 'personalizado') {
          if (selectOpen) {
            selectOpen = false;
            openGeneralStatsCustomRangeModal();
          } else {
            selectOpen = true;
          }
        } else {
          selectOpen = false;
        }
      });
      periodSelect.addEventListener('blur', () => {
        selectOpen = false;
      });
      periodSelect.addEventListener('change', () => {
        selectOpen = false;
      });
    }
    
    // Inputs del modal personalizado
    const startInput = document.getElementById('general-stats-custom-range-start');
    if (startInput) {
      startInput.addEventListener('change', () => recordCustomRangeChange('start'));
    }
    const endInput = document.getElementById('general-stats-custom-range-end');
    if (endInput) {
      endInput.addEventListener('change', () => recordCustomRangeChange('end'));
    }
    const durationInput = document.getElementById('general-stats-custom-range-duration');
    if (durationInput) {
      durationInput.addEventListener('input', () => {
        let val = parseInt(durationInput.value, 10);
        let minVal = (generalStatsChartType === 'barras-apiladas') ? 2 : 1;
        let maxVal = (generalStatsChartType === 'barras-apiladas') ? 12 : Infinity;
        if (isNaN(val) || val < minVal) val = minVal;
        if (val > maxVal) val = maxVal;
        durationInput.value = val;
        recordCustomRangeChange('duration');
      });
    }
    const unitSelect = document.getElementById('general-stats-custom-range-unit');
    if (unitSelect) {
      unitSelect.addEventListener('change', () => recordCustomRangeChange('duration'));
    }
    const qtySelect = document.getElementById('general-stats-custom-range-qty');
    if (qtySelect) {
      qtySelect.addEventListener('change', () => recordCustomRangeChange('duration'));
    }
    
    // Botones del modal personalizado
    const prevBtn = document.getElementById('general-stats-custom-range-prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => shiftCustomRange('prev'));
    }
    const nextBtn = document.getElementById('general-stats-custom-range-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => shiftCustomRange('next'));
    }
    
    const cancelBtn = document.getElementById('general-stats-custom-range-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => closeGeneralStatsCustomRangeModal(false));
    }
    const acceptBtn = document.getElementById('general-stats-custom-range-accept-btn');
    if (acceptBtn) {
      acceptBtn.addEventListener('click', handleGeneralStatsCustomRangeAccept);
    }
    
    const closeBtn = document.querySelector('#general-stats-custom-range-modal .close-modal-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeGeneralStatsCustomRangeModal(false);
      });
    }
  }
}

// ─── Funciones de Edición de Tarea desde Estadísticas ────────────────────────
function buildStatsEditColorPalette() {
  const container = getStatsEl('stats-edit-color-palette');
  if (!container) return;
  container.innerHTML = '';

  DEFAULT_COLORS.forEach((color, idx) => {
    const circle = document.createElement('div');
    circle.className = 'color-circle';
    circle.style.backgroundColor = color.bg;
    circle.style.borderColor = color.border;
    circle.dataset.index = idx;

    if (idx === editingTaskColorIndex && !editingTaskCustomColor) {
      circle.classList.add('selected');
    }

    circle.addEventListener('click', () => {
      container.querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));
      circle.classList.add('selected');
      editingTaskColorIndex = idx;
      editingTaskCustomColor = null;
      hideStatsHslPicker();
    });

    container.appendChild(circle);
  });

  // Botón '+' (círculo negro) para definir un color personalizado HSL
  const addBtn = document.createElement('div');
  addBtn.className = 'color-circle color-circle-add';
  addBtn.title = 'Color personalizado';
  addBtn.innerHTML = '<span class="color-add-plus">+</span>';
  if (editingTaskCustomColor) addBtn.classList.add('selected');
  addBtn.addEventListener('click', () => {
    container.querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));
    addBtn.classList.add('selected');
    editingTaskColorIndex = -1;
    showStatsHslPicker();
  });
  container.appendChild(addBtn);
}

function updateStatsHslPreview() {
  const hEl = getStatsEl('stats-edit-hsl-h');
  const sEl = getStatsEl('stats-edit-hsl-s');
  const lEl = getStatsEl('stats-edit-hsl-l');
  if (!hEl || !sEl || !lEl) return;
  const h = +hEl.value;
  const s = +sEl.value;
  const l = +lEl.value;
  const hex = hslToHex(h, s, l);
  editingTaskCustomColor = { bg: hex, text: '#ffffff', border: hex };
  const prev = getStatsEl('stats-edit-hsl-preview');
  const val = getStatsEl('stats-edit-hsl-value');
  if (prev) prev.style.backgroundColor = hex;
  if (val) val.textContent = `${hex.toUpperCase()}  (H ${h}, S ${s}, L ${l})`;
}

function showStatsHslPicker() {
  const picker = getStatsEl('stats-edit-hsl-picker');
  if (picker) picker.classList.remove('hidden');
  updateStatsHslPreview();
}

function hideStatsHslPicker() {
  const picker = getStatsEl('stats-edit-hsl-picker');
  if (picker) picker.classList.add('hidden');
}

function openStatsTaskEditView(group) {
  const mainContent = getStatsEl('daily-stats-main-content');
  const editContent = getStatsEl('daily-stats-edit-content');
  if (!mainContent || !editContent) return;

  mainContent.classList.add('hidden');
  editContent.classList.remove('hidden');

  editingTaskOriginalName = group.name;
  const titleInput = getStatsEl('stats-edit-task-title');
  if (titleInput) {
    titleInput.value = group.displayName || group.name;
    setTimeout(() => titleInput.focus(), 50);
  }

  // Cargar color
  const colorIdx = DEFAULT_COLORS.findIndex(c => c.bg.toLowerCase() === group.color.bg.toLowerCase());
  if (colorIdx !== -1) {
    editingTaskColorIndex = colorIdx;
    editingTaskCustomColor = null;
    hideStatsHslPicker();
  } else {
    editingTaskColorIndex = -1;
    editingTaskCustomColor = { bg: group.color.bg, text: '#ffffff', border: group.color.border || group.color.bg };
    
    const [h, s, l] = hexToHsl(group.color.bg);
    const hEl = getStatsEl('stats-edit-hsl-h');
    const sEl = getStatsEl('stats-edit-hsl-s');
    const lEl = getStatsEl('stats-edit-hsl-l');
    if (hEl) hEl.value = h;
    if (sEl) sEl.value = s;
    if (lEl) lEl.value = l;
    
    showStatsHslPicker();
  }

  buildStatsEditColorPalette();
}

function closeStatsTaskEditView() {
  const mainContent = getStatsEl('daily-stats-main-content');
  const editContent = getStatsEl('daily-stats-edit-content');
  if (!mainContent || !editContent) return;

  editContent.classList.add('hidden');
  mainContent.classList.remove('hidden');

  if (currentDailyStatsDate) {
    estadisticasDiarias(currentDailyStatsDate);
  }
}

async function saveStatsTaskEdit() {
  const titleInput = getStatsEl('stats-edit-task-title');
  if (!titleInput) return;
  const newTitle = titleInput.value.trim();
  if (!newTitle) return;

  // 1. Obtener color seleccionado
  let selectedColor = null;
  if (editingTaskColorIndex !== -1) {
    selectedColor = DEFAULT_COLORS[editingTaskColorIndex];
  } else {
    selectedColor = editingTaskCustomColor;
  }

  // 2. Guardar o limpiar el alias de nombre para la fecha actual
  if (currentDailyStatsDate) {
    if (newTitle === editingTaskOriginalName) {
      delete statsCustomNames[`${currentDailyStatsDate}_${editingTaskOriginalName}`];
    } else {
      statsCustomNames[`${currentDailyStatsDate}_${editingTaskOriginalName}`] = newTitle;
    }
  }

  // 3. Guardar el color personalizado en estadísticas para el día actual solamente
  if (selectedColor && currentDailyStatsDate) {
    const currentColorKey = `${currentDailyStatsDate}_${editingTaskOriginalName}`;
    statsCustomColors[currentColorKey] = {
      bg: selectedColor.bg,
      border: selectedColor.border || selectedColor.bg
    };
  }

  // 4. Persistir preferencias
  if (currentUser) {
    const prefsCacheKey = 'prefs_cache_' + currentUser.id;
    let prefs = {};
    try {
      const cached = localStorage.getItem(prefsCacheKey);
      if (cached) prefs = JSON.parse(cached);
    } catch(e) {}
    
    prefs.statsCustomColors = statsCustomColors;
    prefs.statsCustomNames = statsCustomNames;
    
    try {
      localStorage.setItem(prefsCacheKey, JSON.stringify(prefs));
    } catch(e) {}
    
    await savePreferences(prefs);
  }

  // 5. Volver a la vista de estadísticas
  closeStatsTaskEditView();
}

async function resetStatsTaskEdit() {
  if (currentDailyStatsDate && editingTaskOriginalName) {
    const key = `${currentDailyStatsDate}_${editingTaskOriginalName}`;
    delete statsCustomColors[key];
    delete statsCustomNames[key];

    // Persistir preferencias
    if (currentUser) {
      const prefsCacheKey = 'prefs_cache_' + currentUser.id;
      let prefs = {};
      try {
        const cached = localStorage.getItem(prefsCacheKey);
        if (cached) prefs = JSON.parse(cached);
      } catch(e) {}
      
      prefs.statsCustomColors = statsCustomColors;
      prefs.statsCustomNames = statsCustomNames;
      
      try {
        localStorage.setItem(prefsCacheKey, JSON.stringify(prefs));
      } catch(e) {}
      
      await savePreferences(prefs);
    }
  }

  // Volver a la vista de estadísticas
  closeStatsTaskEditView();
}

// ─── Funciones de Fusión de Tareas en Estadísticas ──────────────────────────
function saveStatsMergePreferences() {
  // Guardar en la cuenta partiendo de las preferencias de la nube (no pisa el
  // resto aunque la caché local esté vacía).
  if (currentUser && typeof saveSettingPreferences === 'function') {
    saveSettingPreferences({
      statsMergedTasks,
      statsMergedActivities,
      statsCustomColors
    });
  }
}

function toggleStatsMergeMode() {
  const mergeBtn = getStatsEl('daily-stats-merge-btn');
  if (!mergeBtn) return;
  
  if (statsMergeModeActive) {
    // Desactivar y RESTABLECER combinaciones para el día actual
    statsMergeModeActive = false;
    statsMergeFirstSelected = '';
    statsMergeFirstColor = null;
    statsMergeFirstName = '';
    mergeBtn.classList.remove('active');
    
    if (currentDailyStatsDate || (activeStatsPrefix === 'general-stats' && generalStatsDateRange)) {
      // Las fusiones son globales: se deshacen todas (en todos los días), junto
      // con cualquier resto antiguo guardado por día y los colores de fusión.
      const isMergeKey = (key) => key.startsWith(STATS_GLOBAL_PREFIX) || /^\d{4}-\d{2}-\d{2}_/.test(key);
      Object.keys(statsMergedTasks).forEach(key => {
        if (isMergeKey(key)) delete statsMergedTasks[key];
      });
      Object.keys(statsMergedActivities).forEach(key => {
        if (isMergeKey(key)) delete statsMergedActivities[key];
      });
      Object.keys(statsCustomColors).forEach(key => {
        if (key.startsWith(STATS_GLOBAL_PREFIX)) delete statsCustomColors[key];
      });

      saveStatsMergePreferences();
      rerenderStatsAfterMerge();
    }
  } else {
    // Activar modo combinación
    statsMergeModeActive = true;
    statsMergeFirstSelected = '';
    statsMergeFirstColor = null;
    statsMergeFirstName = '';
    mergeBtn.classList.add('active');
    
    // Quitar cualquier resaltado previo de fila (y mostrar las filas clicables).
    getStatsEl('daily-stats-modal').querySelectorAll('.daily-stats-row').forEach(row => {
      row.classList.remove('merge-selected');
      row.querySelectorAll('td').forEach(td => { if (td.style.cursor === 'default') td.style.cursor = 'pointer'; });
    });
  }
}

function handleStatsMergeClick(group, tr) {
  // En modo "Por actividad" la identidad del grupo es su tagId; en modo "Por
  // título" es el nombre/título. Así la fusión funciona en ambos modos.
  // Las estadísticas generales siempre agrupan por actividad.
  const byActivity = activeStatsPrefix === 'general-stats' || statsGroupBy === 'activity';
  const groupKey = byActivity ? group.tagId : group.name;

  if (!statsMergeFirstSelected) {
    statsMergeFirstSelected = groupKey;
    // Guardar el color resuelto de la primera tarea seleccionada para que la
    // fusión conserve exactamente ese color, incluso si es un color por defecto.
    statsMergeFirstColor = group.color ? { bg: group.color.bg, border: group.color.border } : null;
    // Nombre del primer grupo (para fijar el color personalizado por nombre).
    statsMergeFirstName = group.name;
    tr.classList.add('merge-selected');
  } else {
    // Si hace click en la misma fila, deseleccionar
    if (statsMergeFirstSelected === groupKey) {
      statsMergeFirstSelected = '';
      statsMergeFirstColor = null;
      statsMergeFirstName = '';
      tr.classList.remove('merge-selected');
      return;
    }

    // Fusionar el grupo actual en el primero seleccionado, sumando duraciones y
    // manteniendo el nombre y el color del primero. Cada modo usa su propio mapa.
    // Fusión GLOBAL: se aplica a todos los días.
    if (byActivity) {
      statsMergedActivities[STATS_GLOBAL_PREFIX + groupKey] = statsMergeFirstSelected;
    } else {
      statsMergedTasks[STATS_GLOBAL_PREFIX + groupKey] = statsMergeFirstSelected;
    }

    // Gráfico lineal: si la actividad absorbida estaba seleccionada como línea,
    // su lugar lo ocupa la actividad destino (sin pasar el máximo de 3).
    if (activeStatsPrefix === 'general-stats' && generalStatsChartType === 'lineal'
        && lineStatsActiveTags.includes(group.name)) {
      lineStatsActiveTags = lineStatsActiveTags.filter(n => n !== group.name);
      if (!lineStatsActiveTags.includes(statsMergeFirstName)) lineStatsActiveTags.push(statsMergeFirstName);
      rememberGeneralStatsLineTags();
    }

    // Fijar el color del primer grupo seleccionado como color personalizado del
    // grupo fusionado (keyed por NOMBRE, que es como lo lee el render), para que
    // no se reasigne un color aleatorio/distinto al recalcular.
    const firstColorKey = STATS_GLOBAL_PREFIX + statsMergeFirstName;
    if (statsMergeFirstColor && !statsCustomColors[firstColorKey]) {
      statsCustomColors[firstColorKey] = {
        bg: statsMergeFirstColor.bg,
        text: '#ffffff',
        border: statsMergeFirstColor.border || statsMergeFirstColor.bg
      };
    }

    // Desactivar modo de fusión
    statsMergeModeActive = false;
    statsMergeFirstSelected = '';
    statsMergeFirstColor = null;
    statsMergeFirstName = '';

    const mergeBtn = getStatsEl('daily-stats-merge-btn');
    if (mergeBtn) mergeBtn.classList.remove('active');

    // Guardar
    saveStatsMergePreferences();
    
    // Re-renderizar
    rerenderStatsAfterMerge();
  }
}

// Vuelve a dibujar las estadísticas activas tras combinar/deshacer: el rango de
// las estadísticas generales (p. ej. gráfico de barras) o el día actual.
function rerenderStatsAfterMerge() {
  if (activeStatsPrefix === 'general-stats' && generalStatsDateRange) {
    renderGeneralStatsForRange();
  } else if (currentDailyStatsDate) {
    estadisticasDiarias(currentDailyStatsDate);
  }
}

function openCopyTextModal(dateStr) {
  copyTextModalDate = dateStr;
  const modal = document.getElementById('copy-text-modal');
  if (!modal) return;
  applyCopyOptionsToModal();
  updateCopyOptionsState();
  modal.classList.remove('hidden');
}

function closeCopyTextModal() {
  const modal = document.getElementById('copy-text-modal');
  if (modal) modal.classList.add('hidden');
  copyTextModalDate = null;
}

// Mantiene coherentes las casillas: la opción "Separar" sólo tiene sentido si
// se copian ambos grupos; si uno de los dos está desmarcado, se deshabilita.
// Además, garantiza que siempre haya al menos una casilla marcada entre
// "Copiar completadas" y "Copiar no completadas".
function updateCopyOptionsState(e) {
  const completed = document.getElementById('copy-opt-completed');
  const pending = document.getElementById('copy-opt-pending');
  const separate = document.getElementById('copy-opt-separate');
  if (!completed || !pending || !separate) return;

  // Impedir que ambas queden desmarcadas: si el usuario acaba de desmarcar una
  // y la otra ya estaba desmarcada, revertir el cambio.
  if (e && e.target && (e.target === completed || e.target === pending)) {
    if (!completed.checked && !pending.checked) {
      e.target.checked = true;
    }
  }

  // "Separar" está SIEMPRE activa (la casilla está oculta); la mantenemos marcada.
  separate.checked = true;
}

// Devuelve las tareas del día separadas en pendientes y completadas, en el
// MISMO orden en que se muestran en la lista (posición efectiva por día).
function getOrderedDayTasks(dateStr) {
  const colDate = new Date(dateStr + 'T00:00:00');
  const dayTasks = tasks.filter(task => {
    if (!checkTaskOccurrence(task, colDate)) return false;
    const tag = tags.find(t => t.id === task.tagId) || tags.find(t => t.id === 'default');
    return tag ? tag.visible !== false : true;
  });
  sortDayTasks(dayTasks, dateStr);

  const isCompleted = (t) => (t.recurrence && t.recurrence.enabled)
    ? !!(t.completedOccurrences && t.completedOccurrences.includes(dateStr))
    : !!t.completed;

  const pending = dayTasks.filter(t => !isCompleted(t));
  const completed = dayTasks.filter(t => isCompleted(t));
  return { pending, completed, all: dayTasks, isCompleted };
}

// Construye el texto plano según las opciones marcadas en el modal.
function buildCopyText(dateStr, opts) {
  const { pending, completed, all, isCompleted } = getOrderedDayTasks(dateStr);

  const lineFor = (task) => {
    let line = task.title || '';
    // Hora de la tarea (si la opción "fecha y hora" está activa y hay hora).
    // Duración de la tarea en formato "2h30min" / "2h" / "45min".
    if (opts.includeTime) {
      const mins = getTaskDurationMinutes(task);
      if (mins) {
        const h = Math.floor(mins / 60), m = mins % 60;
        const durStr = h && m ? `${h}h${m}min` : (h ? `${h}h` : `${m}min`);
        line = `${durStr}. ${line}`;
      }
    }
    if (opts.includeDesc && task.description && task.description.trim() !== '') {
      line += `. ${task.description.trim()}`;
    }
    return `- ${line}`;
  };

  const blocks = [];

  if (opts.includeDate) {
    blocks.push(formatSingleDate(new Date(dateStr + 'T00:00:00')));
  }

  // Grupos separados (siempre). El encabezado de un grupo SOLO se muestra si ese
  // grupo tiene tareas: si no hay completadas, no aparece "Completadas:", e igual
  // para "No completadas:".
  if (opts.includePending && pending.length > 0) {
    const section = ['No completadas:', ...pending.map(lineFor)];
    blocks.push(section.join('\n'));
  }
  if (opts.includeCompleted && completed.length > 0) {
    const section = ['Completadas:', ...completed.map(lineFor)];
    blocks.push(section.join('\n'));
  }

  // Nota del día al final, si está activada y existe.
  if (opts.includeNote) {
    const note = (notes[dateStr] || '').trim();
    if (note) {
      blocks.push(`Nota:\n${note}`);
    }
  }

  return blocks.join('\n\n').trim();
}

async function handleCopyTextConfirm() {
  if (!copyTextModalDate) return;
  const opts = {
    includeCompleted: document.getElementById('copy-opt-completed').checked,
    includePending: document.getElementById('copy-opt-pending').checked,
    separate: document.getElementById('copy-opt-separate').checked,
    includeDate: document.getElementById('copy-opt-date').checked,
    includeTime: document.getElementById('copy-opt-time').checked,
    includeDesc: document.getElementById('copy-opt-desc').checked,
    includeNote: document.getElementById('copy-opt-note').checked,
  };

  // Recordar la configuración elegida para la próxima vez.
  copyTextOptions = { ...opts };
  saveCopyOptionsToStorage();

  const text = buildCopyText(copyTextModalDate, opts);

  // "Exportar día": descarga un archivo de texto (.txt) con lo elegido.
  const dateStr = copyTextModalDate;
  closeCopyTextModal();
  try {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `planner7_dia_${dateStr}.txt`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showHistoryNotification('Día exportado', 'redo');
  } catch (e) {
    console.error('Exportar día:', e);
    showHistoryNotification('No se pudo exportar el día', 'undo');
  }
}

// Persiste la configuración de copiado en las preferencias del usuario
// (caché local + Supabase), igual que las notas.
async function saveCopyOptionsToStorage() {
  if (!currentUser) return;
  const prefsCacheKey = 'prefs_cache_' + currentUser.id;

  let prefs = {};
  try {
    const cachedPrefs = localStorage.getItem(prefsCacheKey);
    if (cachedPrefs) prefs = JSON.parse(cachedPrefs);
  } catch (e) {}

  prefs.copyOptions = copyTextOptions;

  try {
    localStorage.setItem(prefsCacheKey, JSON.stringify(prefs));
  } catch (e) {}

  await savePreferences(prefs);
}

// Copia texto al portapapeles con respaldo para navegadores sin Clipboard API.
async function copyTextToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    console.warn('Clipboard API falló, usando respaldo:', e);
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    console.error('No se pudo copiar al portapapeles:', e);
    return false;
  }
}

// --- Change Password Modal ---

function openChangePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  if (!modal) return;

  const form = document.getElementById('change-password-form');
  if (form) form.reset();

  const statusEl = document.getElementById('change-password-status');
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.className = 'hidden';
  }

  modal.classList.remove('hidden');

  const currentPassInput = document.getElementById('password-current');
  if (currentPassInput) currentPassInput.focus();
}

function closeChangePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  if (modal) modal.classList.add('hidden');
}

// --- Delete Account Modal ---

function openDeleteAccountModal() {
  const modal = document.getElementById('delete-account-modal');
  if (!modal) return;

  const statusEl = document.getElementById('delete-account-status');
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.className = 'hidden';
  }

  modal.classList.remove('hidden');
}

function closeDeleteAccountModal() {
  const modal = document.getElementById('delete-account-modal');
  if (modal) modal.classList.add('hidden');
}

// --- Export User Data to CSV ---

function escapeCSV(val) {
  if (val === undefined || val === null) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// ─── Exportar / Importar datos (JSON completo) ───────────────────────────────
// "Exportar datos" descarga un archivo .json con TODO lo necesario para
// recuperar la cuenta tal cual: tareas (con repeticiones, alarmas, orden…),
// actividades (colores, palabras clave, visibilidad, orden) y preferencias
// (notas, plantilla, configuración, ajustes de estadísticas…).
// "Importar datos" carga ese archivo y REEMPLAZA los datos actuales de la cuenta.
const PLANNER7_DATA_FORMAT = 'planner7-datos';
const PLANNER7_DATA_VERSION = 1;

async function exportUserData() {
  if (!currentUser) return;
  // Preferencias: las de la nube (las más completas); si no hay conexión, el caché.
  let prefs = null;
  try {
    const { data, error } = await sb.from('user_data').select('preferences').eq('user_id', currentUser.id).maybeSingle();
    if (!error) prefs = data?.preferences ?? {};
  } catch (e) {}
  if (!prefs) {
    try {
      const cached = localStorage.getItem('prefs_cache_' + currentUser.id);
      prefs = cached ? JSON.parse(cached) : {};
    } catch (e) { prefs = {}; }
  }
  prefs = { ...prefs };
  delete prefs.activeTimer; // el cronómetro en curso no se exporta

  const payload = {
    format: PLANNER7_DATA_FORMAT,
    version: PLANNER7_DATA_VERSION,
    exportedAt: new Date().toISOString(),
    account: currentUser.email || '',
    tasks: tasks,
    tags: tags,
    preferences: prefs
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `planner7_datos_${formatDate(new Date())}.json`;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Abre el selector de archivo para importar.
function openImportUserDataPicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.style.display = 'none';
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    input.remove();
    if (file) await importUserDataFromFile(file);
  });
  document.body.appendChild(input);
  input.click();
}

// Valida el contenido del archivo. Devuelve { tasks, tags, preferences } o un
// string con el motivo del error.
function validateImportedUserData(data) {
  if (!data || typeof data !== 'object') return 'El archivo no tiene un formato válido.';
  if (data.format !== PLANNER7_DATA_FORMAT) return 'Este archivo no es un archivo de datos de Planner7.';
  if (typeof data.version !== 'number' || data.version > PLANNER7_DATA_VERSION) {
    return 'Este archivo es de una versión más nueva de Planner7.';
  }
  if (!Array.isArray(data.tasks) || data.tasks.some(t => !t || typeof t !== 'object' || !t.id)) {
    return 'Las tareas del archivo no son válidas.';
  }
  if (!Array.isArray(data.tags) || data.tags.length === 0 || data.tags.some(t => !t || !t.id || typeof t.name !== 'string')) {
    return 'Las actividades del archivo no son válidas.';
  }
  const prefs = (data.preferences && typeof data.preferences === 'object' && !Array.isArray(data.preferences)) ? data.preferences : {};
  return { tasks: data.tasks, tags: data.tags, preferences: prefs };
}

async function importUserDataFromFile(file) {
  if (!currentUser) return;
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch (e) {
    alert('No se pudo leer el archivo: no es un JSON válido.');
    return;
  }
  const result = validateImportedUserData(parsed);
  if (typeof result === 'string') { alert(result); return; }

  const when = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString('es-CL') : 'fecha desconocida';
  const ok = confirm(
    '⚠️ ADVERTENCIA: se BORRARÁN todos los datos actuales de tu cuenta\n' +
    '(tareas, actividades, notas y preferencias) y se reemplazarán por los del archivo.\n' +
    'Esta acción NO se puede deshacer.\n\n' +
    `Archivo exportado el ${when}` +
    `${parsed.account ? ' (cuenta ' + parsed.account + ')' : ''}:\n` +
    `• ${result.tasks.length} tareas\n• ${result.tags.length} actividades\n\n` +
    'Si quieres conservar lo que tienes ahora, cancela y usa primero Herramientas → Exportar datos.\n\n' +
    '¿Borrar tus datos actuales e importar este archivo?'
  );
  if (!ok) return;

  const prefs = { ...result.preferences };
  delete prefs.activeTimer;
  const uid = currentUser.id;

  try {
    setSaveStatus('saving');
    // 1. Tareas: subir las importadas y borrar de la nube las que no estén.
    if (result.tasks.length > 0) {
      await saveTasks(result.tasks); // lanza error si falla
    } else {
      const { error } = await sb.from('tasks').delete().eq('user_id', uid);
      if (error) throw error;
    }
    // 2. Actividades y preferencias.
    const { error: udError } = await sb.from('user_data')
      .upsert({ user_id: uid, tags: result.tags, preferences: prefs }, { onConflict: 'user_id' });
    if (udError) throw udError;
  } catch (e) {
    console.error('importUserData:', e);
    setSaveStatus('offline');
    alert('No se pudieron importar los datos (revisa tu conexión). Tus datos actuales pueden haber quedado a medias: vuelve a intentar la importación.');
    return;
  }

  // 3. Cachés locales = lo importado (si no, al recargar se mezclarían con lo viejo).
  try {
    localStorage.setItem('tasks_cache_' + uid, JSON.stringify(result.tasks));
    localStorage.setItem('tasks_pending_sync_' + uid, 'false');
    localStorage.setItem('prefs_cache_' + uid, JSON.stringify(prefs));
  } catch (e) {}
  if (typeof resetSyncSnapshot === 'function') resetSyncSnapshot(result.tasks);

  alert('Datos importados correctamente. La app se recargará.');
  location.reload();
}

// Exportación antigua en CSV (para ver en Excel). Ya no está en el menú.
function exportUserDataToCSV() {
  const csvRows = [];
  
  // Header row
  csvRows.push(['Tipo', 'Fecha', 'Título / Nombre', 'Descripción / Detalles', 'Hora Inicio', 'Hora Fin', 'Estado / Color'].map(escapeCSV).join(','));
  
  // Add Tags
  tags.forEach(tag => {
    csvRows.push([
      'Actividad',
      '',
      tag.name,
      '',
      '',
      '',
      tag.color ? tag.color.bg : ''
    ].map(escapeCSV).join(','));
  });
  
  // Add Notes
  if (notes) {
    Object.entries(notes).forEach(([date, text]) => {
      if (text && text.trim()) {
        csvRows.push([
          'Nota',
          date,
          '',
          text,
          '',
          '',
          ''
        ].map(escapeCSV).join(','));
      }
    });
  }

  // Add Tasks
  tasks.forEach(task => {
    const isArchived = !task.date;
    const dateStr = isArchived ? 'Archivada (Maletín)' : task.date;
    
    // Resolve Tag name
    const tag = tags.find(t => t.id === task.tagId) || tags.find(t => t.id === 'default');
    const tagName = tag ? tag.name : 'Por defecto';
    
    // Resolve status
    let status = task.completed ? 'Completada' : 'Pendiente';
    if (isArchived) {
      status = 'Archivada (' + status + ')';
    }
    
    const statusAndTag = `${status} (${tagName})`;

    csvRows.push([
      'Tarea',
      dateStr,
      task.title,
      task.description || '',
      task.startTime || '',
      task.endTime || '',
      statusAndTag
    ].map(escapeCSV).join(','));
  });

  const csvContent = "\uFEFF" + csvRows.join('\n'); // Add BOM for Excel UTF-8 compatibility
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `planner7_datos_usuario_${new Date().toISOString().slice(0,10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --- Tag Modals & Management ---

function openTagsModal() {
  const modal = document.getElementById('tags-modal');
  // Buscador: se vacía al abrir el panel y filtra la lista mientras se escribe.
  const search = document.getElementById('tags-search-input');
  const clearBtn = document.getElementById('tags-search-clear');
  if (search) {
    search.value = '';
    if (clearBtn) clearBtn.classList.add('hidden');
    if (search.dataset.bound !== 'true') {
      search.dataset.bound = 'true';
      search.addEventListener('input', () => {
        if (clearBtn) clearBtn.classList.toggle('hidden', !search.value);
        renderTagsList();
      });
      if (clearBtn) clearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        search.value = '';
        clearBtn.classList.add('hidden');
        renderTagsList();
        search.focus();
      });
    }
  }
  renderTagsList();
  // Visibilidad al abrir: al cerrar el panel, si cambió, todo el lote de cambios
  // se registra como UN solo paso de Ctrl+Z.
  tagsModalVisSnapshot = captureTagVisibility();
  watchTagsModalClose(modal);
  modal.classList.remove('hidden');
}

let tagsModalVisSnapshot = null;

// Detecta el cierre del panel (X, clic fuera, Escape, pasar a editar…) sin
// depender de cada forma de cerrarlo.
function watchTagsModalClose(modal) {
  if (!modal || modal.dataset.visWatch === 'true') return;
  modal.dataset.visWatch = 'true';
  new MutationObserver(() => {
    if (modal.classList.contains('hidden')) commitTagsModalVisibilityUndo();
  }).observe(modal, { attributes: true, attributeFilter: ['class'] });
}

function commitTagsModalVisibilityUndo() {
  const before = tagsModalVisSnapshot;
  tagsModalVisSnapshot = null;
  if (!before) return;
  const changed = Object.keys(before).some(id => {
    const t = tags.find(x => x.id === id);
    return t && (t.visible !== false) !== before[id];
  });
  if (changed) pushUndoEntry({ tagVis: before });
}

// Abre la ventana aparte de crear/editar actividad y cierra el gestor de actividades.
function openTagEditModal() {
  const tagsModal = document.getElementById('tags-modal');
  if (tagsModal) tagsModal.classList.add('hidden');
  const editModal = document.getElementById('tag-edit-modal');
  if (editModal) editModal.classList.remove('hidden');
  const nameInput = document.getElementById('tag-input-name');
  if (nameInput) setTimeout(() => nameInput.focus(), 50);
}

// Cierra la ventana de crear/editar actividad y vuelve al gestor de actividades.
function closeTagEditModal(reopenList = true) {
  const editModal = document.getElementById('tag-edit-modal');
  if (editModal) editModal.classList.add('hidden');
  resetTagForm();
  if (reopenList) openTagsModal();
}

function closeTagsModal() {
  document.getElementById('tags-modal').classList.add('hidden');
}

// Devuelve las etiquetas en el orden a MOSTRAR según el modo actual:
//  - personalizado (por defecto): el orden real guardado por el usuario.
//  - alfabético: una COPIA ordenada por nombre (no altera el orden guardado).
// En ambos casos 'default' (Por defecto) queda primera.
function getOrderedTagsForDisplay() {
  if (!tagsSortAlphabetical) return tags;
  return [...tags].sort((a, b) => {
    if (a.id === 'default') return -1;
    if (b.id === 'default') return 1;
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });
}

function renderTagsList() {
  const container = document.getElementById('tags-list');
  container.innerHTML = '';

  // Filtro del buscador: coincide con el nombre o con alguna palabra clave
  // (sin distinguir mayúsculas ni tildes).
  const searchEl = document.getElementById('tags-search-input');
  const query = normalizeForKeyword(searchEl ? searchEl.value : '');
  const isFiltering = !!query;
  const displayTags = getOrderedTagsForDisplay().filter(tag => {
    if (!isFiltering) return true;
    if (normalizeForKeyword(tag.name).includes(query)) return true;
    const kws = Array.isArray(tag.keywords) ? tag.keywords : [];
    return kws.some(k => normalizeForKeyword(k).includes(query));
  });

  if (isFiltering && displayTags.length === 0) {
    container.innerHTML = '<div class="tags-search-empty">No hay actividades que coincidan.</div>';
    return;
  }

  displayTags.forEach(tag => {
    const item = document.createElement('div');
    // Cada actividad se muestra como una "tarjetita" de su color.
    item.className = 'tag-item tag-item-card';
    item.dataset.tagId = tag.id;
    item.style.setProperty('--tag-card-bg', (tag.color && tag.color.bg) || '#c7c7cc');

    // Handle de arrastre para reordenar (raton + tactil).
    // La etiqueta 'default' (Por defecto) queda fija arriba: sin handle, no se arrastra.
    // En modo alfabético no se permite arrastrar (la vista no es el orden real) ni se reserva espacio.
    // Mientras se busca tampoco se arrastra: la lista filtrada no es el orden completo.
    if (!tagsSortAlphabetical && !isFiltering) {
      if (tag.id !== 'default') {
        item.classList.add('tag-item-draggable');
        const grip = document.createElement('button');
        grip.className = 'tag-drag-handle';
        grip.title = 'Arrastrar para reordenar';
        grip.setAttribute('aria-label', 'Reordenar actividad');
        grip.innerHTML = `<img src="icons/grip.svg" alt="" width="14" height="14">`;
        grip.addEventListener('click', (e) => e.stopPropagation());
        item.appendChild(grip);
      } else {
        // En orden personalizado, la fila 'Por defecto' no se arrastra pero mantiene un espaciador
        // invisible para mantener alineado el contenido con las demas filas que si tienen handle.
        const spacer = document.createElement('span');
        spacer.className = 'tag-drag-handle tag-drag-handle-fixed';
        item.appendChild(spacer);
      }
    }

    const left = document.createElement('div');
    left.className = 'tag-preview-group';

    const pill = document.createElement('div');
    pill.className = 'tag-color-pill';
    pill.style.backgroundColor = tag.color.bg;
    pill.style.borderColor = tag.color.border;

    const name = document.createElement('span');
    name.className = 'tag-name-label';
    name.textContent = tag.name;

    left.appendChild(pill);
    left.appendChild(name);
    
    const isVisible = tag.visible !== false;
    if (!isVisible) {
      item.classList.add('tag-item-off');
      pill.style.opacity = '0.4';
      name.style.opacity = '0.4';
      name.style.textDecoration = 'line-through';
    }

    item.appendChild(left);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'tag-actions';

    // Visibility Toggle Button (Lightbulb)
    const visBtn = document.createElement('button');
    visBtn.className = 'tag-action-btn visibility-btn';
    visBtn.title = isVisible ? 'Desactivar visualización' : 'Activar visualización';
    if (isVisible) {
      visBtn.innerHTML = `<img src="icons/lightbulb-on.svg" alt="Activa" width="14" height="14">`;
    } else {
      visBtn.innerHTML = `<img src="icons/lightbulb-off.svg" alt="Inactiva" width="14" height="14" style="opacity: 0.45;">`;
    }
    visBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      tag.visible = !isVisible;
      saveTagsToStorage();
      renderTagsList();
      renderWeeklyCalendar();
    });
    actions.appendChild(visBtn);

    // Edit Button
    const editBtn = document.createElement('button');
    editBtn.className = 'tag-action-btn';
    editBtn.title = 'Editar actividad';
    editBtn.innerHTML = `<img src="icons/edit.svg" alt="Editar" width="14" height="14">`;
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startEditTag(tag);
    });
    actions.appendChild(editBtn);

    // Delete Button (only if not 'default')
    if (tag.id !== 'default') {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'tag-action-btn delete';
      deleteBtn.title = 'Eliminar actividad';
      deleteBtn.innerHTML = `<img src="icons/trash.svg" alt="Eliminar" width="14" height="14">`;
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTag(tag.id);
      });
      actions.appendChild(deleteBtn);
    }

    item.appendChild(actions);

    // Al hacer clic en cualquier parte de la fila de etiqueta (que no sean botones de acción), abrir editor
    item.addEventListener('click', (e) => {
      if (e.target.closest('.tag-action-btn')) {
        return;
      }
      startEditTag(tag);
    });

    container.appendChild(item);
  });

  // El arrastre para reordenar solo aplica en el orden personalizado.
  if (!tagsSortAlphabetical) {
    setupTagDragAndDrop(container);
  }
}



// ─── Agrupar actividades (solo estadísticas) ─────────────────────────────────
// Reemplaza a "Fusionar". Cada grupo reúne varias actividades que, en las
// estadísticas (diarias por actividad y generales), se muestran como una sola
// fila con el nombre y el color del grupo. Fuera de las estadísticas no cambia
// nada. Se guarda en la cuenta: preferences.statsActivityGroups =
//   [{ id, name, color: {bg,text,border} | null, tagIds: [...] }]
// Al agregar la PRIMERA actividad a un grupo sin color, el grupo toma el color
// de esa actividad (luego se puede cambiar con el lápiz).
const STATS_GROUP_KEY_PREFIX = 'grp:';
let statsActivityGroups = [];

function getStatsGroupOfTag(tagId) {
  for (const g of statsActivityGroups) {
    if (Array.isArray(g.tagIds) && g.tagIds.includes(tagId)) return g;
  }
  return null;
}

// Carga desde las preferencias. La primera vez (sin grupos guardados) convierte
// las fusiones antiguas de actividades en grupos, para no perder lo que ya se
// veía en las estadísticas.
function setStatsActivityGroupsFromPrefs(prefs) {
  if (Array.isArray(prefs.statsActivityGroups)) {
    statsActivityGroups = prefs.statsActivityGroups.map(g => ({
      id: String(g.id),
      name: g.name || 'Grupo',
      color: g.color || null,
      tagIds: Array.isArray(g.tagIds) ? [...g.tagIds] : []
    }));
    return;
  }
  const merges = (typeof statsMergedActivities === 'object' && statsMergedActivities) || {};
  const keys = Object.keys(merges).filter(k => k.startsWith(STATS_GLOBAL_PREFIX));
  if (!keys.length) { statsActivityGroups = []; return; }
  const byDest = {};
  keys.forEach(k => {
    const src = k.slice(STATS_GLOBAL_PREFIX.length);
    const dst = resolveStatsMerge(merges, src);
    if (src === dst) return;
    (byDest[dst] = byDest[dst] || new Set([dst])).add(src);
  });
  statsActivityGroups = Object.entries(byDest).map(([dst, set], i) => {
    const tag = tags.find(t => t.id === dst);
    const name = tag ? tag.name : `Grupo ${i + 1}`;
    const custom = statsCustomColors[STATS_GLOBAL_PREFIX + name];
    const color = custom || (tag && tag.color ? { ...tag.color } : null);
    return { id: 'g' + Date.now().toString(36) + i, name, color, tagIds: [...set] };
  });
  saveStatsActivityGroups();
}

function saveStatsActivityGroups() {
  if (currentUser && typeof saveSettingPreferences === 'function') {
    saveSettingPreferences({ statsActivityGroups });
  }
}

// Tras cualquier cambio: guardar, redibujar el panel y las estadísticas.
function commitStatsGroupsChange() {
  saveStatsActivityGroups();
  renderStatsGroupsModal();
  if (typeof rerenderStatsAfterMerge === 'function') rerenderStatsAfterMerge();
}

function openStatsGroupsModal() {
  // Apagar el modo antiguo de fusión, por si quedó activo.
  statsMergeModeActive = false;
  statsMergeFirstSelected = '';
  const oldBtn = getStatsEl('daily-stats-merge-btn');
  if (oldBtn) oldBtn.classList.remove('active');
  renderStatsGroupsModal();
  document.getElementById('stats-groups-modal')?.classList.remove('hidden');
}

function closeStatsGroupsModal() {
  document.getElementById('stats-groups-modal')?.classList.add('hidden');
}

function renderStatsGroupsModal() {
  const body = document.getElementById('stats-groups-body');
  if (!body) return;
  const scroll = body.scrollTop;
  body.innerHTML = '';
  // Limpiar actividades que ya no existen.
  statsActivityGroups.forEach(g => { g.tagIds = g.tagIds.filter(id => tags.some(t => t.id === id)); });

  const ordered = typeof getOrderedTagsForDisplay === 'function' ? getOrderedTagsForDisplay() : tags;
  const ungrouped = ordered.filter(t => !getStatsGroupOfTag(t.id));
  body.appendChild(buildStatsGroupSection(null, ungrouped));
  statsActivityGroups.forEach(g => {
    const list = ordered.filter(t => g.tagIds.includes(t.id));
    body.appendChild(buildStatsGroupSection(g, list));
  });
  body.scrollTop = scroll;
}

function buildStatsGroupSection(group, tagList) {
  const section = document.createElement('div');
  section.className = 'sg-section';
  section.dataset.groupId = group ? group.id : '';

  const head = document.createElement('div');
  head.className = 'sg-section-head';
  if (group) {
    const sw = document.createElement('span');
    sw.className = 'sg-swatch';
    sw.style.backgroundColor = group.color ? group.color.bg : 'transparent';
    if (!group.color) sw.classList.add('sg-swatch-empty');
    head.appendChild(sw);
  }
  const title = document.createElement('span');
  title.className = 'sg-section-title';
  title.textContent = group ? (group.name || 'Grupo') : 'Actividades sin grupo';
  head.appendChild(title);
  if (group) {
    const actions = document.createElement('div');
    actions.className = 'sg-section-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'tag-action-btn';
    edit.title = 'Cambiar nombre y color';
    edit.innerHTML = '<img src="icons/edit.svg" alt="Editar" width="14" height="14">';
    edit.addEventListener('click', () => openStatsGroupEdit(group.id));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'tag-action-btn delete';
    del.title = 'Eliminar grupo';
    del.innerHTML = '<img src="icons/trash.svg" alt="Eliminar" width="14" height="14">';
    del.addEventListener('click', () => deleteStatsGroup(group.id));
    actions.append(edit, del);
    head.appendChild(actions);
  }
  section.appendChild(head);

  const list = document.createElement('div');
  list.className = 'sg-list';
  if (!tagList.length) {
    const empty = document.createElement('div');
    empty.className = 'sg-empty';
    empty.textContent = group ? 'Arrastra actividades aquí' : 'Todas las actividades están agrupadas';
    list.appendChild(empty);
  }
  tagList.forEach(tag => {
    const item = document.createElement('div');
    item.className = 'sg-item';
    item.dataset.tagId = tag.id;
    // Dentro de un grupo, la actividad se ve con el color del grupo.
    const c = (group && group.color) ? group.color : tag.color;
    item.style.backgroundColor = c ? c.bg : '#c7c7cc';
    const grip = document.createElement('img');
    grip.src = 'icons/grip.svg';
    grip.alt = '';
    grip.width = 14; grip.height = 14;
    grip.className = 'sg-grip';
    const name = document.createElement('span');
    name.className = 'sg-item-name';
    name.textContent = tag.name;
    item.append(grip, name);
    setupStatsGroupItemDrag(item, tag.id);
    list.appendChild(item);
  });
  section.appendChild(list);
  return section;
}

// Mueve una actividad a un grupo (groupId) o a "sin grupo" (null).
function moveTagToStatsGroup(tagId, groupId) {
  const current = getStatsGroupOfTag(tagId);
  if ((current ? current.id : null) === (groupId || null)) return;
  if (current) current.tagIds = current.tagIds.filter(id => id !== tagId);
  if (groupId) {
    const g = statsActivityGroups.find(x => x.id === groupId);
    if (!g) return;
    // Primera actividad de un grupo sin color: el grupo toma su color.
    if (!g.color && !g.tagIds.length) {
      const tag = tags.find(t => t.id === tagId);
      if (tag && tag.color) g.color = { bg: tag.color.bg, text: '#ffffff', border: tag.color.border || tag.color.bg };
    }
    g.tagIds.push(tagId);
  }
  commitStatsGroupsChange();
}

function deleteStatsGroup(groupId) {
  const g = statsActivityGroups.find(x => x.id === groupId);
  if (!g) return;
  if (g.tagIds.length && !confirm(`¿Eliminar el grupo «${g.name}»? Sus actividades quedarán sin grupo.`)) return;
  statsActivityGroups = statsActivityGroups.filter(x => x.id !== groupId);
  commitStatsGroupsChange();
}

// Arrastrar una actividad entre secciones. Ratón: se arrastra al moverlo unos
// píxeles. Táctil: mantener presionado (250 ms) y luego arrastrar, así el
// desplazamiento normal de la lista sigue funcionando.
function setupStatsGroupItemDrag(item, tagId) {
  let ghost = null, offsetY = 0, offsetX = 0, dragging = false, startX = 0, startY = 0;
  let touchTimer = null, scrollTimer = null, lastY = 0, lastX = 0;
  const body = () => document.getElementById('stats-groups-body');

  const sectionAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest('#stats-groups-body .sg-section') : null;
  };
  const clearTargets = () => document.querySelectorAll('.sg-section.sg-drop-target')
    .forEach(s => s.classList.remove('sg-drop-target'));

  const start = (x, y) => {
    dragging = true;
    const r = item.getBoundingClientRect();
    offsetX = x - r.left; offsetY = y - r.top;
    ghost = item.cloneNode(true);
    ghost.classList.add('sg-ghost');
    Object.assign(ghost.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', pointerEvents: 'none', zIndex: '10000', margin: '0' });
    document.body.appendChild(ghost);
    item.classList.add('sg-dragging');
    document.body.classList.add('sg-drag-active');
  };
  const move = (x, y) => {
    lastX = x; lastY = y;
    ghost.style.left = (x - offsetX) + 'px';
    ghost.style.top = (y - offsetY) + 'px';
    clearTargets();
    const sec = sectionAt(x, y);
    if (sec) sec.classList.add('sg-drop-target');
    // Auto-desplazamiento cerca de los bordes del panel.
    const b = body();
    if (!b) return;
    const rect = b.getBoundingClientRect();
    const EDGE = 40;
    let speed = 0;
    if (y < rect.top + EDGE) speed = -9 * Math.min(1, (rect.top + EDGE - y) / EDGE);
    else if (y > rect.bottom - EDGE) speed = 9 * Math.min(1, (y - (rect.bottom - EDGE)) / EDGE);
    if (!speed) { if (scrollTimer) { clearInterval(scrollTimer); scrollTimer = null; } return; }
    if (!scrollTimer) scrollTimer = setInterval(() => {
      b.scrollTop += speed;
      clearTargets();
      const s2 = sectionAt(lastX, lastY);
      if (s2) s2.classList.add('sg-drop-target');
    }, 16);
  };
  const end = (drop) => {
    if (scrollTimer) { clearInterval(scrollTimer); scrollTimer = null; }
    if (!dragging) return;
    dragging = false;
    const sec = drop ? sectionAt(lastX, lastY) : null;
    if (ghost) { ghost.remove(); ghost = null; }
    item.classList.remove('sg-dragging');
    document.body.classList.remove('sg-drag-active');
    clearTargets();
    if (sec) moveTagToStatsGroup(tagId, sec.dataset.groupId || null);
  };

  // Ratón
  item.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    startX = e.clientX; startY = e.clientY;
    const onMove = (ev) => {
      if (!dragging) {
        if (Math.abs(ev.clientX - startX) + Math.abs(ev.clientY - startY) < 4) return;
        start(startX, startY);
      }
      move(ev.clientX, ev.clientY);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      end(true);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  // Táctil
  item.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    touchTimer = setTimeout(() => {
      touchTimer = null;
      if (navigator.vibrate) navigator.vibrate(30);
      start(startX, startY);
      move(startX, startY);
    }, 250);
  }, { passive: true });
  item.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (!dragging) {
      if (touchTimer && Math.abs(t.clientX - startX) + Math.abs(t.clientY - startY) > 8) {
        clearTimeout(touchTimer); touchTimer = null;
      }
      return;
    }
    e.preventDefault();
    move(t.clientX, t.clientY);
  }, { passive: false });
  const touchEnd = (ev) => {
    if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    end(ev.type === 'touchend');
  };
  item.addEventListener('touchend', touchEnd);
  item.addEventListener('touchcancel', touchEnd);
  item.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ── Panel de nombre y color de un grupo ──
let statsGroupEditId = null;       // null = grupo nuevo
let statsGroupEditColor = null;    // {bg,text,border} o null (sin elegir)
let statsGroupEditCustom = false;  // true si el color viene del selector HSL

function openStatsGroupEdit(groupId) {
  const g = groupId ? statsActivityGroups.find(x => x.id === groupId) : null;
  statsGroupEditId = g ? g.id : null;
  statsGroupEditColor = g && g.color ? { ...g.color } : null;
  statsGroupEditCustom = !!(statsGroupEditColor && !DEFAULT_COLORS.some(c => c.bg.toLowerCase() === statsGroupEditColor.bg.toLowerCase()));
  document.getElementById('stats-group-edit-title').textContent = g ? 'Editar grupo' : 'Nuevo grupo';
  const input = document.getElementById('stats-group-name');
  input.value = g ? g.name : `Grupo ${statsActivityGroups.length + 1}`;
  document.getElementById('stats-group-hsl-picker').classList.toggle('hidden', !statsGroupEditCustom);
  if (statsGroupEditCustom) {
    const [h, sat, l] = hexToHsl(statsGroupEditColor.bg);
    document.getElementById('stats-group-hsl-h').value = h;
    document.getElementById('stats-group-hsl-s').value = sat;
    document.getElementById('stats-group-hsl-l').value = l;
    // Solo mostrar la vista previa (sin recalcular el color, para no alterarlo).
    const prev = document.getElementById('stats-group-hsl-preview');
    const val = document.getElementById('stats-group-hsl-value');
    if (prev) prev.style.backgroundColor = statsGroupEditColor.bg;
    if (val) val.textContent = `${statsGroupEditColor.bg.toUpperCase()}  (H ${h}, S ${sat}, L ${l})`;
  }
  buildStatsGroupColorGrid();
  updateStatsGroupColorHint();
  document.getElementById('stats-group-edit-modal').classList.remove('hidden');
  setTimeout(() => { input.focus(); input.select(); }, 30);
}

function updateStatsGroupColorHint() {
  const hint = document.getElementById('stats-group-color-hint');
  if (hint) hint.textContent = statsGroupEditColor ? '' :
    'Si no eliges un color, el grupo tomará el de la primera actividad que agregues.';
}

function buildStatsGroupColorGrid() {
  const grid = document.getElementById('stats-group-color-grid');
  if (!grid) return;
  grid.innerHTML = '';
  DEFAULT_COLORS.forEach(color => {
    const c = document.createElement('div');
    c.className = 'color-circle';
    c.style.backgroundColor = color.bg;
    c.style.borderColor = color.border;
    if (!statsGroupEditCustom && statsGroupEditColor && statsGroupEditColor.bg.toLowerCase() === color.bg.toLowerCase()) c.classList.add('selected');
    c.addEventListener('click', () => {
      statsGroupEditColor = { ...color };
      statsGroupEditCustom = false;
      document.getElementById('stats-group-hsl-picker').classList.add('hidden');
      buildStatsGroupColorGrid();
      updateStatsGroupColorHint();
    });
    grid.appendChild(c);
  });
  const add = document.createElement('div');
  add.className = 'color-circle color-circle-add';
  add.title = 'Color personalizado';
  add.innerHTML = '<span class="color-add-plus">+</span>';
  if (statsGroupEditCustom) add.classList.add('selected');
  add.addEventListener('click', () => {
    if (!statsGroupEditCustom && statsGroupEditColor) {
      const [h, sat, l] = hexToHsl(statsGroupEditColor.bg);
      document.getElementById('stats-group-hsl-h').value = h;
      document.getElementById('stats-group-hsl-s').value = sat;
      document.getElementById('stats-group-hsl-l').value = l;
    }
    statsGroupEditCustom = true;
    document.getElementById('stats-group-hsl-picker').classList.remove('hidden');
    updateStatsGroupHslPreview();
    buildStatsGroupColorGrid();
  });
  grid.appendChild(add);
}

function updateStatsGroupHslPreview() {
  const h = +document.getElementById('stats-group-hsl-h').value;
  const sat = +document.getElementById('stats-group-hsl-s').value;
  const l = +document.getElementById('stats-group-hsl-l').value;
  const hex = hslToHex(h, sat, l);
  statsGroupEditColor = { bg: hex, text: '#ffffff', border: hex };
  const prev = document.getElementById('stats-group-hsl-preview');
  const val = document.getElementById('stats-group-hsl-value');
  if (prev) prev.style.backgroundColor = hex;
  if (val) val.textContent = `${hex.toUpperCase()}  (H ${h}, S ${sat}, L ${l})`;
  updateStatsGroupColorHint();
}

function closeStatsGroupEdit() {
  document.getElementById('stats-group-edit-modal')?.classList.add('hidden');
  statsGroupEditId = null;
}

function saveStatsGroupEdit() {
  const name = (document.getElementById('stats-group-name').value || '').trim() || `Grupo ${statsActivityGroups.length + 1}`;
  if (statsGroupEditId) {
    const g = statsActivityGroups.find(x => x.id === statsGroupEditId);
    if (g) { g.name = name; if (statsGroupEditColor) g.color = { ...statsGroupEditColor }; }
  } else {
    statsActivityGroups.push({
      id: 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      name,
      color: statsGroupEditColor ? { ...statsGroupEditColor } : null,
      tagIds: []
    });
  }
  closeStatsGroupEdit();
  commitStatsGroupsChange();
  // Grupo nuevo: bajar hasta él para poder arrastrarle actividades.
  const body = document.getElementById('stats-groups-body');
  if (body && !statsGroupEditId) body.scrollTop = body.scrollHeight;
}

function setupStatsGroupsModal() {
  document.getElementById('stats-groups-back-btn')?.addEventListener('click', closeStatsGroupsModal);
  document.getElementById('stats-groups-new-btn')?.addEventListener('click', () => openStatsGroupEdit(null));
  document.getElementById('stats-group-edit-cancel-btn')?.addEventListener('click', closeStatsGroupEdit);
  document.getElementById('stats-group-edit-save-btn')?.addEventListener('click', saveStatsGroupEdit);
  document.getElementById('stats-group-name')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); saveStatsGroupEdit(); }
  });
  ['stats-group-hsl-h', 'stats-group-hsl-s', 'stats-group-hsl-l'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateStatsGroupHslPreview);
  });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupStatsGroupsModal);
else setupStatsGroupsModal();

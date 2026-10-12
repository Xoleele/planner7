/** Habit Tracker integrado. Su historial pertenece exclusivamente a habit_data. */
(() => {
  'use strict';
  const CACHE_PREFIX = 'planner7.habitos.v1:';
  const TABLE = 'habit_data';
  function habitId() {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    // getRandomValues también funciona al servir la app por HTTP en la red local.
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  const host = document.createElement('div');
  host.id = 'habitos-tool';
  host.hidden = true;
  document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  const button = document.getElementById('habitos-btn');
  let owner = null;
  let epoch = 0;
  let state = null;
  let ui = null;
  let timer = null;
  let saving = false;
  let conflict = false;
  let loading = false;
  let undoStack = [];
  let redoStack = [];
  let previousOverflow = '';
  let previousInert = false;
  const app = document.querySelector('.app-container');

  // Interfaz e iconos del prototipo Habit Tracker, aislados con Shadow DOM.
const HABIT_HTML = "\n  \n  <section class=\"modal-backdrop\" id=\"tracker-backdrop\">\n    <div class=\"tracker-shell\">\n      \n    <div class=\"modal-content tracker\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"tracker-title\">\n      <header class=\"modal-header\">\n        <h1 id=\"tracker-title\">Hábitos</h1>\n        <div class=\"modal-header-actions\">\n          <button class=\"icon-button\" id=\"show-stats\" aria-label=\"Ver estadísticas\" title=\"Estadísticas\"><img src=\"icons/bar-chart.svg\" alt=\"\" width=\"20\" height=\"20\" aria-hidden=\"true\"></button>\n          <button class=\"icon-button\" id=\"close-tracker\" aria-label=\"Cerrar Habit Tracker\" title=\"Cerrar\"><img src=\"icons/close.svg\" alt=\"\" width=\"20\" height=\"20\" aria-hidden=\"true\"></button>\n        </div>\n      </header>\n      <div class=\"tracker-body\"><div class=\"record-section-title\" id=\"habit-record-heading\">Registro</div>\n        <div class=\"record-selector\" id=\"record-selector\">\n          <button class=\"record-selector-toggle\" id=\"record-selector-toggle\" type=\"button\" aria-expanded=\"false\" aria-controls=\"record-selector-menu\" aria-label=\"Seleccionar registro\">\n            <span id=\"selected-record-label\">Registro actual</span><span class=\"record-chevron\" aria-hidden=\"true\"></span>\n          </button>\n          <div class=\"record-selector-menu\" id=\"record-selector-menu\" hidden>\n            <div id=\"record-options\"></div>\n            <button class=\"create-record\" id=\"create-record\" type=\"button\"><svg aria-hidden=\"true\" focusable=\"false\" data-icon=\"plus.svg\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M12 5v14M5 12h14\"/></svg>Crear nuevo registro</button>\n          </div>\n        </div>\n        <div class=\"cloud-sync\" hidden><span id=\"cloud-status\" role=\"status\" aria-live=\"polite\"></span><button id=\"cloud-retry\" type=\"button\" hidden>Reintentar</button><button id=\"cloud-remote\" type=\"button\" hidden>Usar nube</button><button id=\"cloud-local\" type=\"button\" hidden>Guardar mis cambios</button></div>\n        <label class=\"empty-days-filter\"><input id=\"hide-empty-days\" type=\"checkbox\">Ocultar días sin marcar</label>\n        <hr class=\"habit-record-divider\">\n        <div class=\"history\">\n          <div class=\"history-viewport\" id=\"history-viewport\" tabindex=\"0\" aria-label=\"Registro de hábitos, del día más reciente al más antiguo\">\n            <div class=\"habit-grid\" id=\"habit-grid\"></div>\n          </div>\n          <div class=\"scroll-rail\" aria-hidden=\"true\">\n            <button class=\"scroll-arrow up\" id=\"scroll-up\" tabindex=\"-1\" aria-label=\"Subir fechas\"></button>\n            <div class=\"scroll-track\" id=\"scroll-track\"><div class=\"scroll-thumb\" id=\"scroll-thumb\"></div></div>\n            <button class=\"scroll-arrow down\" id=\"scroll-down\" tabindex=\"-1\" aria-label=\"Bajar fechas\"></button>\n          </div>\n        </div>\n      </div>\n    </div>\n    </div>\n  </section>\n  <dialog class=\"stats-dialog\" id=\"stats-dialog\" aria-labelledby=\"stats-title\">\n    <header class=\"stats-header\">\n      <h2 id=\"stats-title\">Estadísticas</h2>\n      <button class=\"icon-button\" id=\"close-stats\" aria-label=\"Cerrar estadísticas\"><svg aria-hidden=\"true\" focusable=\"false\" data-icon=\"close.svg\" xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n  <line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/>\n  <line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/>\n</svg></button>\n    </header>\n    <div class=\"stats-filters\">\n      <label class=\"stats-filter\" for=\"stats-chart-type\">Gráfico\n        <select id=\"stats-chart-type\"><option value=\"line\">Lineal</option><option value=\"squares\">Cuadritos</option></select>\n      </label>\n      <label class=\"stats-filter\" for=\"stats-habit\">Hábito\n        <select id=\"stats-habit\"></select>\n      </label>\n      <label class=\"stats-filter\" for=\"stats-show\">MOSTRAR\n        <select id=\"stats-show\"></select>\n      </label>\n    </div>\n    <section class=\"stats-chart-section\" id=\"stats-line-section\" aria-labelledby=\"line-chart-title\">\n      <div class=\"stats-chart-header\">\n        <h3 id=\"line-chart-title\">Lineal</h3>\n      </div>\n      \n      <div id=\"stats-line-chart\"></div>\n    </section>\n    <section class=\"stats-chart-section\" id=\"stats-squares-section\" aria-labelledby=\"habit-chart-title\" hidden>\n      <h3 id=\"habit-chart-title\">Habit Tracker</h3>\n      <p class=\"stats-chart-summary\" id=\"stats-habit-summary\"></p>\n      <label class=\"empty-days-filter\"><input id=\"stats-hide-empty-days\" type=\"checkbox\">Ocultar días sin marcar</label>\n      <div class=\"stats-habit-grid\" id=\"stats-habit-chart\"></div>\n      <p class=\"stats-chart-description\" id=\"stats-empty-message\" hidden>No hay días marcados en este período.</p>\n    </section>\n    <div class=\"stats-chart-tooltip\" id=\"stats-day-tooltip\" role=\"tooltip\" hidden></div>\n  </dialog>\n  <dialog class=\"stats-dialog\" id=\"stats-range-dialog\" aria-labelledby=\"stats-range-title\">\n    <form id=\"stats-range-form\">\n      <header class=\"stats-header\">\n        <h2 id=\"stats-range-title\">Período personalizado</h2>\n        <button class=\"icon-button\" id=\"close-stats-range\" type=\"button\" aria-label=\"Cancelar período personalizado\"><svg aria-hidden=\"true\" focusable=\"false\" data-icon=\"close.svg\" xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n  <line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/>\n  <line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/>\n</svg></button>\n      </header>\n      <fieldset class=\"stats-range-fields\" id=\"stats-range-fields\">\n        <label class=\"stats-filter\" for=\"stats-end-date\">Día de término<input id=\"stats-end-date\" type=\"date\" required></label>\n        <div class=\"stats-range-row\">\n          <label class=\"stats-filter\" for=\"stats-unit\">Unidad<select id=\"stats-unit\"><option value=\"days\">Días</option><option value=\"weeks\">Semanas</option><option value=\"months\">Meses</option></select></label>\n          <label class=\"stats-filter\" for=\"stats-quantity\">Cantidad<input id=\"stats-quantity\" type=\"number\" min=\"1\" max=\"366\" step=\"1\" value=\"30\" required></label>\n        </div>\n      </fieldset>\n      <label class=\"empty-days-filter stats-record-mode\"><input id=\"stats-use-record\" type=\"checkbox\">Usar un registro completo</label>\n      <label class=\"stats-filter stats-range-record\" for=\"stats-record\">Registro<select id=\"stats-record\" disabled></select></label>\n      <p class=\"stats-chart-description\" id=\"stats-range-preview\" aria-live=\"polite\"></p>\n      <footer class=\"editor-actions\"><div class=\"editor-save-actions\"><button class=\"form-button\" id=\"cancel-stats-range\" type=\"button\">Cancelar</button><button class=\"form-button primary\" type=\"submit\">Aplicar</button></div></footer>\n    </form>\n  </dialog>\n  <dialog class=\"stats-dialog habit-editor\" id=\"habit-editor\" aria-labelledby=\"habit-editor-title\">\n    <form id=\"habit-form\">\n      <header class=\"stats-header\">\n        <h2 id=\"habit-editor-title\">Editar hábito</h2>\n        <div class=\"modal-header-actions\">\n          <button class=\"icon-button delete-habit\" id=\"delete-habit\" type=\"button\" title=\"Eliminar hábito\" aria-label=\"Eliminar hábito\"><svg aria-hidden=\"true\" focusable=\"false\" data-icon=\"trash.svg\" xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n  <polyline points=\"3 6 5 6 21 6\"/>\n  <path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\"/>\n  <line x1=\"10\" y1=\"11\" x2=\"10\" y2=\"17\"/>\n  <line x1=\"14\" y1=\"11\" x2=\"14\" y2=\"17\"/>\n</svg></button>\n          <button class=\"icon-button\" id=\"close-editor\" type=\"button\" aria-label=\"Cerrar editor\"><svg aria-hidden=\"true\" focusable=\"false\" data-icon=\"close.svg\" xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n  <line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/>\n  <line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/>\n</svg></button>\n        </div>\n      </header>\n      <label class=\"field-label\" for=\"habit-name\">Nombre</label>\n      <div class=\"habit-name-row\">\n        <input class=\"habit-input\" id=\"habit-name\" name=\"name\" maxlength=\"60\" required autocomplete=\"off\" placeholder=\"Nombre del hábito\">\n        <button class=\"choose-habit-icon\" id=\"choose-habit-icon\" type=\"button\" aria-label=\"Cambiar icono\" title=\"Cambiar icono\"><svg aria-hidden=\"true\" focusable=\"false\" data-icon=\"sun.svg\" id=\"selected-habit-icon\" xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"4\" fill=\"currentColor\"/><path d=\"M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4\"/></svg></button>\n      </div>\n      <input id=\"habit-icon-value\" name=\"icon\" type=\"hidden\" value=\"sun.svg\">\n      <footer class=\"editor-actions\">\n        <div class=\"editor-save-actions\">\n          <button class=\"form-button\" id=\"cancel-editor\" type=\"button\">Cancelar</button>\n          <button class=\"form-button primary\" type=\"submit\" id=\"save-habit\">Guardar</button>\n        </div>\n      </footer>\n    </form>\n  </dialog>\n  <dialog class=\"stats-dialog\" id=\"icon-dialog\" aria-labelledby=\"icon-dialog-title\">\n    <header class=\"stats-header\">\n      <h2 id=\"icon-dialog-title\">Elegir icono</h2>\n      <button class=\"icon-button\" id=\"close-icon-dialog\" type=\"button\" aria-label=\"Cerrar selector de iconos\"><svg aria-hidden=\"true\" focusable=\"false\" data-icon=\"close.svg\" xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n  <line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/>\n  <line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/>\n</svg></button>\n    </header>\n    <label class=\"sr-only\" for=\"habit-icon-search\">Buscar iconos</label>\n    <input class=\"icon-search\" id=\"habit-icon-search\" type=\"search\" placeholder=\"Buscar iconos…\" autocomplete=\"off\" aria-controls=\"icon-picker\">\n    <p class=\"icon-search-empty\" id=\"icon-search-empty\" role=\"status\" hidden>No se encontraron iconos.</p>\n    <div class=\"icon-picker\" id=\"icon-picker\"></div>\n  </dialog>\n  <dialog class=\"stats-dialog\" id=\"change-dialog\" aria-labelledby=\"change-title\">\n    <header class=\"stats-header\">\n      <h2 id=\"change-title\">¿Cómo aplicar este cambio?</h2>\n      <button class=\"icon-button\" id=\"close-change\" type=\"button\" aria-label=\"Cancelar cambio\"><svg aria-hidden=\"true\" focusable=\"false\" data-icon=\"close.svg\" xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n  <line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/>\n  <line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/>\n</svg></button>\n    </header>\n    <div class=\"change-options\">\n      <button class=\"change-option primary\" id=\"modify-record\"><strong>Actualizar registro actual</strong></button>\n      <button class=\"change-option\" id=\"new-record\"><strong>Crear un nuevo registro</strong></button>\n    </div>\n    <footer class=\"editor-actions\"><button class=\"form-button\" id=\"cancel-change\">Cancelar</button></footer>\n  </dialog>\n  <dialog class=\"stats-dialog\" id=\"delete-record-dialog\" aria-labelledby=\"delete-record-title\" aria-describedby=\"delete-record-description\">\n    <header class=\"stats-header\">\n      <h2 id=\"delete-record-title\">Eliminar registro</h2>\n      <button class=\"icon-button\" id=\"close-delete-record\" type=\"button\" aria-label=\"Cancelar eliminación\"><svg aria-hidden=\"true\" focusable=\"false\" data-icon=\"close.svg\" xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n  <line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/>\n  <line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/>\n</svg></button>\n    </header>\n    <p class=\"change-description\" id=\"delete-record-description\"></p>\n    <footer class=\"editor-actions\">\n      <div class=\"editor-save-actions\">\n        <button class=\"form-button\" id=\"cancel-delete-record\">Cancelar</button>\n        <button class=\"form-button danger\" id=\"confirm-delete-record\">Eliminar registro</button>\n      </div>\n    </footer>\n  </dialog>\n  <dialog class=\"stats-dialog\" id=\"record-notice-dialog\" aria-labelledby=\"record-notice-title\" aria-describedby=\"record-notice-description\">\n    <header class=\"stats-header\"><h2 id=\"record-notice-title\">No se puede crear otro registro</h2></header>\n    <p class=\"change-description\" id=\"record-notice-description\">El registro actual solo contiene el día de hoy. Podrás crear otro a partir de mañana. Mientras tanto, puedes modificar este registro.</p>\n    <footer class=\"editor-actions\"><button class=\"form-button primary\" id=\"close-record-notice\" type=\"button\">Entendido</button></footer>\n  </dialog>\n  <div class=\"sr-only\" id=\"announcement\" role=\"status\" aria-live=\"polite\"></div>\n";
const HABIT_CSS = "/* Tokens y convenciones visuales de Planner7, aislados para este prototipo. */\n:host {\n  --font-primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;\n  --bg-app: #ffffff;\n  --bg-card: #ffffff;\n  --text-main: #111111;\n  --text-muted: #86868b;\n  --border-light: #e5e5ea;\n  --border-focus: #111111;\n  --bg-hover: #f2f2f7;\n  --overlay-bg: rgba(102, 102, 102, .55);\n  --radius-sm: 6px;\n  --radius-md: 10px;\n  --radius-lg: 16px;\n  --shadow-sm: 0 1px 3px rgba(0, 0, 0, .02), 0 1px 2px rgba(0, 0, 0, .04);\n  --shadow-lg: 0 12px 30px rgba(0, 0, 0, .06), 0 4px 12px rgba(0, 0, 0, .03);\n  --transition-fast: .15s cubic-bezier(.4, 0, .2, 1);\n  --date-width: 55.23px;\n  --grid-gap: clamp(3px, 1.6cqw, 10px);\n  --rail-width: 12px;\n  --rail-gap: 16px;\n}\n* { box-sizing: border-box; }\n.habit-body {\n  margin: 0;\n  min-height: 100dvh;\n  font-family: var(--font-primary);\n  color: var(--text-main);\n  background: var(--bg-app);\n  -webkit-font-smoothing: antialiased;\n  -moz-osx-font-smoothing: grayscale;\n}\nbutton { font: inherit; -webkit-tap-highlight-color: transparent; }\nbutton:focus-visible, [tabindex]:focus-visible {\n  outline: 2px solid var(--text-main);\n  outline-offset: 4px;\n}\n[hidden] { display: none !important; }\n.modal-backdrop {\n  position: fixed;\n  inset: 0;\n  display: grid;\n  place-items: center;\n  padding: 32px 20px;\n  background: var(--overlay-bg);\n  backdrop-filter: blur(12px);\n  -webkit-backdrop-filter: blur(12px);\n}\n.modal-content {\n  background: var(--bg-card);\n  border: 1px solid rgba(0, 0, 0, .08);\n  box-shadow: var(--shadow-lg);\n  display: flex;\n  flex-direction: column;\n  overflow: hidden;\n}\n.tracker {\n  width: min(480px, 100%);\n  height: min(900px, 90dvh);\n  border-radius: var(--radius-lg);\n}\n.tracker-shell { display: flex; align-items: flex-start; gap: 16px; width: min(638px, 100%); }\n.tracker-shell .tracker { min-width: 0; flex: 1; }\n.test-controls { display: flex; flex-direction: column; gap: 8px; flex: 0 0 142px; padding-top: 12px; }\n.test-controls-title { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; font-weight: 700; }\n.test-button { padding: 10px 12px; min-height: 38px; border: 1px solid var(--border-light); border-radius: var(--radius-md); background: white; color: var(--text-main); font-size: 12px; text-align: left; cursor: pointer; }\n.test-button:hover { background: var(--bg-hover); }\n.test-button:disabled { opacity: .45; cursor: default; }\n.test-button[aria-pressed=\"true\"] { background: var(--text-main); color: white; }\n.test-date { font-size: 11px; line-height: 1.5; }\n@media (max-width: 760px) {\n  .tracker-shell { flex-direction: column; gap: 12px; width: min(480px, 100%); }\n  .test-controls { flex: none; width: 100%; flex-direction: row; flex-wrap: wrap; align-items: center; padding-top: 0; gap: 6px; }\n  .test-controls-title { display: none; }\n  .test-button { flex: 1; text-align: center; padding: 8px 6px; }\n  .test-date { flex-basis: 100%; }\n  .tracker-shell .tracker { flex: none; width: 100%; height: min(900px, calc(100dvh - 144px)); }\n}\n.modal-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  flex: 0 0 auto;\n  gap: 12px;\n  padding: 20px 24px;\n  border-bottom: 1px solid var(--border-light);\n}\nh1 {\n  margin: 0;\n  font-size: 18px;\n  line-height: 1.2;\n  font-weight: 700;\n  letter-spacing: -.02em;\n}\n.modal-header-actions { display: flex; align-items: center; gap: 8px; }\n.icon-button {\n  background: none;\n  border: 0;\n  cursor: pointer;\n  display: grid;\n  place-items: center;\n  flex: 0 0 auto;\n  width: 28px;\n  height: 28px;\n  padding: 4px;\n  border-radius: 50%;\n  transition: background-color var(--transition-fast);\n}\n.icon-button:hover { background: #f2f2f7; }\n.icon-button svg { width: 17.6px; height: 17.6px; }\n.icon-button svg, .habit-heading svg, .choose-habit-icon svg, .icon-option svg, .create-record svg { stroke-width: 1.75; }\n.habit-heading svg text, .choose-habit-icon svg text, .icon-option svg text { font-weight: 500; }\n.tracker-body {\n  display: flex;\n  flex-direction: column;\n  flex: 1;\n  min-height: 0;\n  padding: 20px 24px 24px;\n}\n.habit-headings, .habit-row {\n  display: grid;\n  grid-template-columns: var(--date-width) repeat(var(--habit-columns, 5), minmax(0, 1fr));\n  gap: var(--grid-gap);\n  align-items: center;\n}\n.record-selector { position: relative; align-self: flex-start; max-width: 100%; margin-bottom: 18px; }\n.record-selector-toggle { display: flex; align-items: center; gap: 14px; min-height: 38px; max-width: 100%; padding: 9px 12px; border: 1px solid var(--border-light); border-radius: var(--radius-md); background: white; color: var(--text-main); cursor: pointer; font-size: 13px; text-align: left; }\n.record-selector-toggle:hover { background: var(--bg-hover); }\n.record-chevron { width: 7px; height: 7px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(45deg); flex: 0 0 auto; margin: 0 2px 4px; }\n.record-selector-toggle[aria-expanded=\"true\"] .record-chevron { transform: rotate(225deg); margin-bottom: 0; }\n.record-selector-menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 10; width: 340px; max-width: calc(100vw - 74px); padding: 6px; background: white; border: 1px solid var(--border-light); border-radius: var(--radius-md); box-shadow: var(--shadow-lg); }\n#record-options { max-height: min(320px, 40dvh); overflow-y: auto; }\n.record-option { display: flex; align-items: center; gap: 4px; border-radius: var(--radius-sm); padding-right: 6px; }\n.record-option.selected { background: var(--bg-hover); }\n.record-option-select { flex: 1; min-width: 0; padding: 12px 8px; border: 0; background: none; color: var(--text-main); font-size: 13px; cursor: pointer; text-align: left; border-radius: var(--radius-sm); }\n.record-option-select:hover { background: var(--bg-hover); }\n.create-record { display: flex; align-items: center; gap: 8px; width: 100%; padding: 12px 8px; border: 0; border-top: 1px solid var(--border-light); background: white; font-size: 13px; color: var(--text-main); cursor: pointer; text-align: left; }\n.create-record:hover { background: var(--bg-hover); }\n.create-record svg { width: 14.08px; height: 14.08px; }\n.habit-headings {\n  flex: 0 0 auto;\n  padding-bottom: 18px;\n  height: 49.93px;\n}\n.habit-heading {\n  display: grid; place-items: center; height: 36px;\n  width: 100%; padding: 0; border: 0; border-radius: var(--radius-md);\n  background: none; cursor: pointer;\n}\n.habit-heading:hover { background: #f2f2f7; }\n.habit-heading.empty { opacity: .45; }\n.habit-heading.empty:hover { opacity: 1; }\n.habit-heading svg { width: 24.64px; height: 24.64px;  }\n.history { display: flex; gap: var(--rail-gap); flex: 1; min-height: 0; }\n.empty-days-filter { display: flex; align-items: center; gap: 8px; margin-bottom: 16px; color: var(--text-muted); font-size: 12px; cursor: pointer; }\n.empty-days-filter input { margin: 0; width: 16px; height: 16px; accent-color: var(--text-main); }\n.empty-record-message { margin: 8px 0; color: var(--text-muted); font-size: 13px; line-height: 1.5; }\n.history-viewport {\n  container-type: inline-size;\n  flex: 1;\n  min-width: 0;\n  overflow-y: auto;\n  overflow-x: hidden;\n  scrollbar-width: none;\n  overscroll-behavior: contain;\n  scroll-padding-top: 64px;\n}\n.history-viewport::-webkit-scrollbar { display: none; }\n.habit-grid { display: grid; gap: var(--grid-gap); }\n.record-block { display: grid; gap: var(--grid-gap); }\n.record-block + .record-block { border-top: 1px solid var(--border-light); margin-top: 16px; padding-top: 18px; }\n.record-label { margin: 0; color: var(--text-muted); font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; line-height: 1.5; }\n.record-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }\n.delete-record { --habit-icon-height:13.8px; width:26px; height:26px; padding:5px; }\n.delete-record img { width:13.8px; height:13.8px; opacity: .55; }\n.delete-record:hover, .delete-record:focus-visible { background:rgba(255,59,48,.08); }\n.delete-record:hover img, .delete-record:focus-visible img { opacity:1; filter:invert(32%) sepia(94%) saturate(3655%) hue-rotate(348deg) brightness(106%) contrast(105%); }\n.form-button.danger { background: #ff3b30; border-color: #ff3b30; color: white; }\n.form-button.danger:hover { background: #e33229; }\n.record-block .habit-headings { position: sticky; top: 0; z-index: 2; align-self: start; background: var(--bg-card); padding-bottom: 7.93px; border-bottom:0; }\n.retired-record .habit-headings { z-index: 3; }\n.habit-heading.archived { cursor: default; }\n.habit-heading.archived:hover { background: none; }\n.retired-record { border-top: 1px dashed var(--border-light); padding-top: 16px; margin-top: 12px; display: grid; gap: var(--grid-gap); }\n.change-description { color: var(--text-muted); font-size: 14px; line-height: 1.5; margin: 18px 0; }\n.change-options { display: grid; gap: 10px; margin-top: 18px; }\n.change-option { text-align: left; cursor: pointer; padding: 16px; border: 1px solid var(--border-light); border-radius: var(--radius-md); background: white; color: var(--text-main); }\n.change-option:hover { background: #f2f2f7; border-color: var(--text-main); }\n.change-option.primary { background: var(--text-main); border-color: var(--text-main); color: white; }\n.change-option.primary:hover { background: #333; }\n.change-option strong { display: block; font-size: 14px; }\n.habit-row time {\n  font-size: 14px;\n  line-height: 1;\n  font-weight: 600;\n  color: var(--text-muted);\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n.habit-cell {\n  position: relative;\n  display: grid;\n  place-items: center;\n  width: 100%;\n  aspect-ratio: 1;\n  border: 0;\n  border-radius: var(--radius-md);\n  padding: 0;\n  background: #e9e9ec;\n  cursor: pointer;\n  transition: background-color var(--transition-fast), box-shadow var(--transition-fast);\n}\n.habit-cell:hover { box-shadow: inset 0 0 0 2px rgba(0, 0, 0, .85); }\n.habit-cell[data-state=\"completed\"] { background: #34c759; }\n.habit-cell[data-state=\"failed\"] { background: #ff3b30; }\n.habit-cell:focus-visible { outline-offset: -4px; }\n.habit-heading[data-habit], .habit-cell {\n  position: relative;\n  touch-action: pan-y;\n  user-select: none;\n  -webkit-user-select: none;\n  -webkit-touch-callout: none;\n}\n.habit-heading svg, .habit-cell svg { pointer-events: none; }\n.habit-column-shifting {\n  transform: translateX(var(--habit-drag-x, 0px));\n  transition: transform var(--transition-fast);\n}\n.habit-column-dragging {\n  transform: translateX(var(--habit-drag-x, 0px));\n  z-index: 3;\n  box-shadow: 0 4px 12px rgba(0, 0, 0, .16);\n  cursor: grabbing;\n}\n.reordering-habits, .reordering-habits * { cursor: grabbing !important; }\n.habit-empty { width: 100%; aspect-ratio: 1; }\n.scroll-rail { display: flex; flex-direction: column; flex: 0 0 var(--rail-width); gap: 10px; }\n.scroll-arrow {\n  display: grid;\n  place-items: center;\n  width: 100%;\n  height: 14px;\n  flex: 0 0 14px;\n  padding: 0;\n  border: 0;\n  background: none;\n  cursor: pointer;\n}\n.scroll-arrow::after { content: ''; width: 6px; height: 6px; border-top: 1.5px solid var(--text-muted); border-left: 1.5px solid var(--text-muted); }\n.scroll-arrow.up::after { transform: rotate(45deg); }\n.scroll-arrow.down::after { transform: rotate(225deg); }\n.scroll-arrow:disabled { opacity: .5; cursor: default; }\n.scroll-track { position: relative; flex: 1; min-height: 0; cursor: pointer; }\n.scroll-thumb {\n  position: absolute;\n  top: 0;\n  left: 3px;\n  width: 6px;\n  min-height: 32px;\n  background: #c7c7cc;\n  border-radius: 999px;\n  cursor: grab;\n  touch-action: none;\n}\n.scroll-thumb:active { cursor: grabbing; }\n.scroll-thumb:hover { background: #8e8e93; }\n.launcher { min-height: 100dvh; display: grid; place-items: center; }\n.open-tracker {\n  border: 1px solid var(--border-light);\n  background: white;\n  color: var(--text-main);\n  border-radius: var(--radius-lg);\n  padding: 18px 24px;\n  box-shadow: var(--shadow-lg);\n  cursor: pointer;\n}\n.stats-dialog {\n  width: min(420px, calc(100vw - 32px));\n  max-height: calc(100dvh - 48px);\n  overflow: auto;\n  padding: 24px;\n  border: 1px solid rgba(0, 0, 0, .08);\n  border-radius: var(--radius-lg);\n  box-shadow: var(--shadow-lg);\n  color: var(--text-main);\n}\n.stats-dialog::backdrop { background: var(--overlay-bg); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }\n.stats-dialog { background: var(--bg-card); scrollbar-width: thin; scrollbar-color: #c7c7cc transparent; }\n.stats-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: -24px -24px 0; padding: 20px 24px; border-bottom: 1px solid var(--border-light); }\n.stats-header h2 { font-size: 18px; font-weight: 700; letter-spacing: -.02em; margin: 0; }\n#stats-dialog { width: min(760px, calc(100vw - 32px)); }\n.stats-filter { display: flex; align-items: center; gap: 12px; font-size: 13px; color: var(--text-muted); min-width: 0; }\n.stats-filter select { max-width: 100%; width: 100%; min-width: 0; padding: 6px 10px; height: 38px; border: 1px solid var(--border-light); border-radius: var(--radius-md); background: var(--bg-card); color: var(--text-main); font: 400 13px var(--font-primary); text-transform: none; letter-spacing: normal; }\n.stats-filters { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1.5fr); gap: 12px; align-items: end; margin-top: 20px; }\n.stats-range-fields { border: 0; padding: 0; margin: 20px 0 0; display: grid; gap: 12px; min-width: 0; }\n.stats-range-fields:disabled { opacity: .45; }\n.stats-range-fields .stats-filter, .stats-range-record { flex-direction: column; align-items: flex-start; gap: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; }\n.stats-range-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }\n.stats-record-mode { margin-top: 24px; color: var(--text-main); }\n.stats-range-record select:disabled { opacity: .45; }\n.stats-filters .stats-filter { flex-direction: column; align-items: flex-start; gap: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }\n.stats-filter input { width: 100%; min-width: 0; height: 38px; padding: 6px 10px; border: 1px solid var(--border-light); border-radius: var(--radius-md); background: var(--bg-card); color: var(--text-main); font: 400 13px var(--font-primary); }\n.stats-filter input[type=\"date\"] { padding: 6px 12px; }\n.stats-filter select:focus, .stats-filter input:focus { outline: none; border-color: var(--border-focus); box-shadow: 0 0 0 2px rgba(0, 0, 0, .05); }\n.stats-compliance-percent { color: var(--text-muted); font-weight: 600; }\n.stats-chart-section { margin-top: 28px; container-type: inline-size; }\n.stats-chart-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }\n.stats-chart-section h3 { font-size: 15px; margin: 0; font-weight: 600; }\n.stats-chart-description { font-size: 12px; line-height: 1.5; color: var(--text-muted); margin: 10px 0; }\n.stats-chart-summary { font-size: 13px; margin: 16px 0; }\n#stats-line-chart svg { display: block; width: 100%; height: auto; }\n.stats-habit-grid { display: grid; grid-template-columns: repeat(15, minmax(0, 1fr)); gap: clamp(1px, .5cqw, 4px); padding: 6px 0; }\n.stats-day { aspect-ratio: 1; border-radius: 3px; background: #e9e9ec; }\n.stats-day[data-state=\"completed\"] { background: #34c759; }\n.stats-day[data-state=\"failed\"] { background: #ff3b30; }\n.stats-day:hover, .stats-day:focus-visible { box-shadow: inset 0 0 0 2px rgba(0, 0, 0, .85); outline: none; }\n.stats-chart-tooltip { position: fixed; pointer-events: none; background: rgba(0, 0, 0, .85); color: #fff; padding: 4px 8px; font-size: 11px; font-weight: 600; border-radius: 4px; z-index: 10; white-space: nowrap; line-height: 1.4; }\n@media (max-width: 560px) {\n  .stats-dialog { padding: 20px; }\n  .stats-header { margin: -20px -20px 0; padding: 18px 20px; }\n  .stats-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n  .stats-filters > .stats-filter:last-child { grid-column: 1 / -1; }\n  #stats-line-chart text { font-size: 6px; }\n  .stats-habit-grid { grid-template-columns: repeat(10, minmax(0, 1fr)); }\n}\n.field-label { display: block; font-size: 11.5px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; margin: 24px 0 6px; }\n.habit-input {\n  width: 100%; height: 38px; padding: 8px 0; border: none; border-bottom: 1.5px solid var(--border-light);\n  border-radius: 0; background: var(--bg-card); font: inherit; font-size: 18px; font-weight: 600; color: var(--text-main);\n}\n.habit-input:focus { outline: none; border-color: var(--text-main); }\n.habit-input:focus-visible { outline: none; border-bottom-color: var(--border-focus); }\n.habit-name-row { display: flex; align-items: center; gap: 12px; }\n.habit-name-row .habit-input { min-width: 0; flex: 1; }\n.choose-habit-icon { display: grid; place-items: center; flex: 0 0 38px; height: 38px; border: 1px solid var(--border-light); border-radius: var(--radius-md); background: white; cursor: pointer; }\n.choose-habit-icon:hover { background: #f2f2f7; }\n.choose-habit-icon svg { width: 21.12px; height: 21.12px; }\n.icon-picker { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-top: 24px; }\n.icon-option { display: grid; place-items: center; aspect-ratio: 1; padding: 0; background: white; border: 1px solid var(--border-light); border-radius: var(--radius-md); cursor: pointer; }\n.icon-option svg { width: 24.64px; height: 24.64px; }\n.icon-option:hover { background: #f2f2f7; }\n.icon-option[aria-pressed=\"true\"] { background: #f2f2f7; border-color: var(--text-main); }\n.editor-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 24px -24px -24px; padding: 16px 24px; border-top: 1px solid var(--border-light); }\n.delete-habit svg { color: #ff3b30; }\n.editor-save-actions { display: flex; gap: 8px; margin-left: auto; }\n.form-button { border: 1px solid var(--border-light); background: white; padding: 10px 18px; border-radius: var(--radius-md); cursor: pointer; font-size: 13px; font-weight: 600; transition: background-color var(--transition-fast), border-color var(--transition-fast); }\n.form-button:hover { background: #f2f2f7; }\n.form-button.primary { background: var(--text-main); border-color: var(--text-main); color: white; }\n.form-button.primary:hover { background: #333; }\n.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }\n@media (max-width: 560px) {\n  :host { --date-width: 53.5px; --rail-width: 14px; --rail-gap: 8px; }\n  .modal-backdrop { padding: 16px; }\n  .tracker-shell { width: 100%; }\n  .tracker { height: calc(100dvh - 32px); border-radius: var(--radius-lg); }\n  .modal-header { padding: 18px 20px; }\n  .modal-header-actions { gap: 4px; }\n  .tracker-body { padding: 16px 16px 20px; }\n  .habit-headings { height: 44.555px; padding-bottom: 8.555px; }\n  .habit-heading svg { width: min(21.12px, 79.2%); height: 21.12px; }\n  .habit-row time { font-size: 12px; }\n  .habit-cell { border-radius: var(--radius-md); }\n  .scroll-thumb { left: 4px; width: 6px; }\n  .editor-actions { margin: 24px -20px -20px; padding: 16px 20px; }\n}\n@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; scroll-behavior: auto !important; } }\n\n.habit-body { background:transparent; }\n:host { position:fixed; inset:0; z-index:2500; font-family:var(--font-primary); color:var(--text-main); }\n:host([hidden]) { display:none !important; }\n.tracker-shell { width:min(480px,100%); }\n.tracker-shell .tracker { height:min(900px,90dvh); }\n.cloud-sync { display:flex; gap:8px; align-items:center; flex-wrap:wrap; color:var(--text-muted); font-size:11px; line-height:1.5; margin-bottom:12px; }\n.cloud-sync button { background:white; border:1px solid var(--border-light); border-radius:6px; padding:5px 8px; cursor:pointer; }\n.cloud-sync [data-mode=\"conflict\"],.cloud-sync [data-mode=\"error\"] { color:#9d4b20; }\n@media(max-width:600px) { .modal-backdrop { padding:16px 12px; } .tracker-shell .tracker { height:calc(100dvh - 32px); } }\n\n.icon-search { display:block; width:100%; margin-top:20px; padding:11px 12px; border:1px solid var(--border-light); border-radius:var(--radius-md); background:var(--bg-card); color:var(--text-main); font:inherit; font-size:16px; }\n.icon-search:focus-visible { outline:2px solid var(--border-focus); outline-offset:2px; }\n.icon-picker { margin-top:16px; }\n.icon-search-empty { margin:20px 0 0; color:var(--text-muted); font-size:13px; }\n\n/* Mismo título secundario que los paneles de atajos y configuración. */\n.record-section-title { font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:4px; }\n\n.cloud-sync { position:fixed; bottom:64px; right:18px; z-index:10; max-width:min(420px,calc(100vw - 36px)); margin:0; padding:12px 14px; background:var(--bg-card); border:1px solid var(--border-light); border-radius:var(--radius-md); box-shadow:var(--shadow-card); }\n\n/* Altura visible uniforme, ancho proporcional al dibujo. */\n.habit-heading { --habit-icon-height:24.64px; }\n.choose-habit-icon { --habit-icon-height:21.12px; }\n.icon-option { --habit-icon-height:24.64px; }\n@media (max-width:560px) { .habit-heading { --habit-icon-height:21.12px; } }\n\n.habit-record-divider { border:0; border-top:1px solid var(--border-light); margin:0 -24px 16px; flex-shrink:0; }\n@media (max-width:560px) { .habit-record-divider { margin-inline:-16px; } }\n\n/* Controles del encabezado con el estilo del panel de Actividades. */\n.tracker .modal-header-actions { gap:8px; }\n.tracker .modal-header-actions .icon-button { background:none; border:none; color:var(--text-muted); display:flex; align-items:center; justify-content:center; width:28px; height:28px; padding:0; border-radius:50%; }\n.tracker .modal-header-actions .icon-button:hover { background-color:#f2f2f7; color:var(--text-main); }\n.tracker .modal-header-actions .icon-button img { width:20px; height:20px; }\n\n.record-selector { width:100%; align-self:stretch; }\n.record-selector-toggle { width:100%; justify-content:space-between; }\n.record-selector-menu { width:100%; max-width:100%; }\n#selected-record-label { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }\n";

  function validDay(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + 'T12:00:00');
    return !Number.isNaN(date.getTime()) && date.getFullYear() === Number(value.slice(0,4)) &&
      date.getMonth() + 1 === Number(value.slice(5,7)) && date.getDate() === Number(value.slice(8,10));
  }
  function validData(data) {
    return data?.version === 2 && Array.isArray(data.blocks) && data.blocks.length > 0 &&
      data.blocks.every(block => typeof block.id === 'string' &&
        validDay(block.startDate) &&
        (block.endDate === null || validDay(block.endDate)) &&
        Array.isArray(block.habits) && block.records && typeof block.records === 'object' &&
        !Array.isArray(block.records));
  }
  const clone = value => JSON.parse(JSON.stringify(value));
  function cleanHabitData(data) {
    if (!data) return data;
    return { ...data, blocks: data.blocks.map(block => {
      const { retiredHabits, ...activeBlock } = block;
      const ids = new Set(block.habits.filter(Boolean).map(habit => habit.id));
      return { ...activeBlock, records: Object.fromEntries(Object.entries(block.records)
        .filter(([key]) => ids.has(key.slice(11)))) };
    }) };
  }
  function cacheKey(id) { return CACHE_PREFIX + id; }
  function readCache(id) {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey(id)));
      return cached?.user_id === id && validData(cached.data) &&
        (cached.revision === null || Number.isSafeInteger(cached.revision)) ? { ...cached, data: cleanHabitData(cached.data) } : null;
    } catch { return null; }
  }
  function active(id, token) { return owner === id && currentUser?.id === id && epoch === token; }
  function status(message, mode = '') {
    const line = root.getElementById('cloud-status');
    if (!line) return;
    line.textContent = message;
    line.dataset.mode = mode;
    line.closest('.cloud-sync').hidden = mode !== 'error' && mode !== 'conflict';
    root.getElementById('cloud-retry').hidden = mode !== 'error';
    root.getElementById('cloud-remote').hidden = mode !== 'conflict';
    root.getElementById('cloud-local').hidden = mode !== 'conflict';
  }
  function setConflict() {
    conflict = true;
    setSaveStatus('');
    status('Hay cambios en otro dispositivo. Elige qué versión conservar.', 'conflict');
  }
  function showPending(transient = false) {
    status(navigator.onLine ? 'Guardado en este dispositivo · pendiente de sincronizar' :
      'Sin conexión · guardado en este dispositivo', transient && navigator.onLine ? '' : 'error');
  }
  function saveCache(next) {
    // Si el almacenamiento falla, la edición se rechaza en vez de afirmar que se guardó.
    localStorage.setItem(cacheKey(owner), JSON.stringify(next));
    state = next;
  }
  function historyEntry() {
    const selected = ui?.selectedBlockId();
    return { data: clone(state.data), selected: state.data.blocks.some(block => block.id === selected) ? selected : state.data.blocks[0].id };
  }
  function stage(data, remember = true) {
    if (!owner || currentUser?.id !== owner) throw new Error('La sesión cambió.');
    const nextData = cleanHabitData(clone(data));
    if (JSON.stringify(nextData) === JSON.stringify(state.data)) return;
    const previous = remember ? historyEntry() : null;
    const next = { ...state, user_id: owner, data: nextData, pending: true };
    try { saveCache(next); } catch (error) { status('No se pudo guardar en este dispositivo. La edición se revirtió.', 'error'); throw error; }
    if (remember) { undoStack.push(previous); redoStack = []; }
    setSaveStatus('saving');
    if (conflict) setConflict();
    else {
      showPending(true);
      clearTimeout(timer);
      timer = setTimeout(flush, 350);
    }
  }
  async function fetchCloud(id) {
    const { data, error } = await sb.from(TABLE).select('data,revision').eq('user_id', id).maybeSingle();
    if (error) throw error;
    if (data && (!validData(data.data) || !Number.isSafeInteger(data.revision))) {
      throw new Error('El historial guardado necesita revisión; no se sobrescribirá.');
    }
    return data ? { ...data, data: cleanHabitData(data.data) } : null;
  }
  async function flush() {
    if (saving || loading || conflict || !state?.pending || !owner || currentUser?.id !== owner) return;
    const id = owner, token = epoch;
    const snapshot = clone(state.data), revision = state.revision;
    saving = true;
    status('Sincronizando…');
    try {
      // Comparación atómica de revisión: un dispositivo nunca sobrescribe cambios ajenos
      // sin que el usuario lo elija explícitamente en el aviso de conflicto.
      const result = revision === null
        ? await sb.from(TABLE).insert({ user_id: id, data: snapshot, revision: 1 }).select('revision').maybeSingle()
        : await sb.from(TABLE).update({ data: snapshot, revision: revision + 1 })
          .eq('user_id', id).eq('revision', revision).select('revision').maybeSingle();
      if (!active(id, token)) return;
      if (result.error?.code === '23505' || (!result.error && !result.data)) { setConflict(); return; }
      if (result.error) throw result.error;
      const pending = JSON.stringify(state.data) !== JSON.stringify(snapshot);
      saveCache({ ...state, revision: result.data.revision, pending });
      status(pending ? 'Sincronizando cambios…' : 'Guardado en tu cuenta');
      if (!pending) setSaveStatus('saved');
    } catch (error) {
      if (!active(id, token)) return;
      console.warn('Sincronización de hábitos:', error.message);
      status('Guardado en este dispositivo · no se pudo sincronizar', 'error');
      setSaveStatus('offline');
    } finally {
      if (active(id, token)) {
        saving = false;
        // Solo seguir cuando hubo éxito y existen ediciones realizadas durante ese envío.
        if (state?.pending && !conflict && state.revision !== revision) timer = setTimeout(flush, 0);
      }
    }
  }
  function makeStorage() {
    return {
      getItem(key) {
        if (key === 'habit-tracker.history.v2') return state?.data ? JSON.stringify(state.data) : null;
        if (key === 'habit-tracker.history.v2.hide-empty-days') return JSON.stringify(state?.data?.hideEmptyDays === true);
        return null; // No adoptar datos anónimos del prototipo bajo otra cuenta.
      },
      setItem(key, value) {
        if (key === 'habit-tracker.history.v2') stage({ ...JSON.parse(value), hideEmptyDays: ui?.hideEmptyDays() ?? state?.data?.hideEmptyDays ?? false });
        if (key === 'habit-tracker.history.v2.hide-empty-days') stage({ ...ui.snapshot(), hideEmptyDays: JSON.parse(value) === true });
      }
    };
  }
  function render(selected = ui?.selectedBlockId()) {
    ui?.destroy();
    root.innerHTML = `<style>${HABIT_CSS}</style><div class="habit-body">${HABIT_HTML}</div>`;
    root.getElementById('cloud-retry').addEventListener('click', () => state?.pending ? flush() : (close(), open()));
    root.getElementById('cloud-remote').addEventListener('click', () => resolveConflict(false));
    root.getElementById('cloud-local').addEventListener('click', () => resolveConflict(true));
    ui = createHabitUI(root, makeStorage(), close, selected);
    if (!state.data) state.data = { ...ui.snapshot(), hideEmptyDays: ui.hideEmptyDays() };
    root.addEventListener('keydown', stopPlannerKeys);
  }
  function stopPlannerKeys(event) {
    event.stopPropagation();
    const target = event.composedPath()[0];
    const typing = target.closest?.('input,textarea,select,[contenteditable="true"]');
    if (event.key.toLowerCase() === 'h' && !event.ctrlKey && !event.metaKey && !event.altKey &&
        !event.isComposing && !event.repeat && !typing && !root.querySelector('dialog[open]')) {
      event.preventDefault();
      close();
      return;
    }
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
    const key = event.key.toLowerCase();
    if (key !== 'z' && key !== 'y') return;
    // Mantener el deshacer nativo mientras se escribe un nombre o una búsqueda.
    if (target.closest?.('textarea,[contenteditable="true"]') ||
      (target.tagName === 'INPUT' && !['checkbox','radio','button','submit','reset'].includes(target.type))) return;
    event.preventDefault();
    if (loading || host.hidden) return;
    const redo = key === 'y' || event.shiftKey;
    const source = redo ? redoStack : undoStack;
    const destination = redo ? undoStack : redoStack;
    if (!source.length) return;
    const snapshot = source.at(-1), current = historyEntry();
    try { stage(snapshot.data, false); } catch { return; }
    source.pop(); destination.push(current);
    render(snapshot.selected);
    ui.focus();
    root.getElementById('announcement').textContent = redo ? 'Cambio rehecho.' : 'Cambio deshecho.';
    if (conflict) setConflict(); else showPending(true);
  }
  async function resolveConflict(keepLocal) {
    if (loading || saving) return;
    const id = owner, token = epoch;
    loading = true;
    try {
      const cloud = await fetchCloud(id);
      if (!active(id, token)) return;
      if (!keepLocal && !cloud) throw new Error('No hay un historial en la nube para recuperar.');
      // Conservar la versión desplazada para no perder ninguna al resolver el conflicto.
      localStorage.setItem(cacheKey(id) + '.recovery', JSON.stringify({ local: state, cloud }));
      saveCache(keepLocal ? { ...state, revision: cloud?.revision ?? null, pending: true } :
        { user_id: id, data: cloud.data, revision: cloud.revision, pending: false });
      conflict = false;
      if (!keepLocal) { undoStack = []; redoStack = []; render(); }
      status(keepLocal ? 'Pendiente de sincronizar' : 'Guardado en tu cuenta');
    } catch (error) {
      if (active(id, token)) { status('No se pudo resolver. Tus cambios siguen guardados aquí. Reintenta tu elección.', 'conflict'); conflict = true; }
    } finally {
      if (active(id, token)) { loading = false; if (keepLocal && !conflict) flush(); }
    }
  }
  function close() {
    if (host.hidden) return;
    ui?.closeDialogs();
    host.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (app) app.inert = previousInert;
    document.body.style.overflow = previousOverflow;
    if (currentUser) document.querySelector('.user-avatar')?.focus();
  }
  function reset() {
    close();
    epoch++;
    clearTimeout(timer);
    ui?.destroy();
    ui = null;
    root.replaceChildren();
    owner = null;
    state = null;
    undoStack = []; redoStack = [];
    conflict = saving = loading = false;
  }
  async function open() {
    if (!currentUser) { showAuthScreen(); return; }
    if (loading || !host.hidden) return;
    if (owner && owner !== currentUser.id) reset();
    owner = currentUser.id;
    const id = owner, token = epoch;
    loading = true;
    button.disabled = true;
    const previousData = state?.data;
    state = readCache(id);
    let cloudError = false;
    try {
      const cloud = await fetchCloud(id);
      if (!active(id, token)) return;
      if (state?.pending) {
        if ((cloud?.revision ?? null) !== state.revision) conflict = true;
      } else {
        conflict = false;
        state = cloud ? { user_id: id, data: cloud.data, revision: cloud.revision, pending: false } :
          { user_id: id, data: null, revision: null, pending: false };
        if (cloud) { try { saveCache(state); } catch { /* Se podrá visualizar; una edición avisará si falta espacio. */ } }
      }
    } catch (error) {
      if (!active(id, token)) return;
      cloudError = true;
      if (!state) {
        showHistoryNotification('No se pudieron cargar tus hábitos. Reintenta cuando haya conexión.', 'undo');
        return;
      }
    } finally {
      if (active(id, token)) { loading = false; button.disabled = false; }
    }
    if (!active(id, token)) return;
    if (previousData && JSON.stringify(previousData) !== JSON.stringify(state.data)) {
      undoStack = []; redoStack = [];
    }
    render();
    previousOverflow = document.body.style.overflow;
    previousInert = app?.inert || false;
    host.hidden = false;
    document.body.style.overflow = 'hidden';
    if (app) app.inert = true;
    button.setAttribute('aria-expanded', 'true');
    ui.focus();
    if (conflict) setConflict();
    else if (state.pending) showPending();
    else if (cloudError) status('Sin conexión · mostrando la copia de este dispositivo', 'error');
    else status(state.revision !== null ? 'Guardado en tu cuenta' : '');
    if (state.pending && !cloudError) flush();
  }
  button.addEventListener('click', open);
  host.addEventListener('planner7:escape', event => {
    if (!host.hidden && ui) { event.preventDefault(); ui.handleEscape(); }
  });
  window.addEventListener('online', flush);
  sb.auth.onAuthStateChange((_event, session) => {
    // Sin llamadas a Supabase dentro del callback de auth (evita bloquear su mutex).
    if (owner && session?.user?.id !== owner) { reset(); button.disabled = false; }
  });

function createHabitUI(root, localStorage, onClose, preferredBlockId) {
const controller = new AbortController();
const nativeDocument = window.document;
const document = {
  getElementById: id => root.getElementById(id),
  querySelector: selector => root.querySelector(selector),
  querySelectorAll: selector => root.querySelectorAll(selector),
  createElement: name => nativeDocument.createElement(name),
  body: root.querySelector('.habit-body'),
  addEventListener(type, callback, options = {}) {
    root.addEventListener(type, callback, typeof options === 'boolean' ? {capture:options,signal:controller.signal} : {...options,signal:controller.signal});
  }
};
const realWindow = window;
const trackerWindow = {
  get innerWidth() { return realWindow.innerWidth; },
  get innerHeight() { return realWindow.innerHeight; },
  addEventListener(type,callback,options={}) { realWindow.addEventListener(type,callback,{...options,signal:controller.signal}); }
};
// SVG locales para renderizar iconos en línea, sin imágenes ni solicitudes externas.
// Generado con node scripts/build-icons.cjs.
// Letras y números: contornos de Quicksand Medium (500). Licencia: icons/Quicksand-OFL.txt.
const HABIT_ICON_SVGS = Object.freeze({
  "apple.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 6.528V3a1 1 0 0 1 1-1h0\" />\n  <path d=\"M18.237 21A15 15 0 0 0 22 11a6 6 0 0 0-10-4.472A6 6 0 0 0 2 11a15.1 15.1 0 0 0 3.763 10 3 3 0 0 0 3.648.648 5.5 5.5 0 0 1 5.178 0A3 3 0 0 0 18.237 21\" />\n</svg>",
  "baguette.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"icon icon-tabler icons-tabler-outline icon-tabler-baguette\"><path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /><path d=\"M5.628 11.283l5.644 -5.637c2.665 -2.663 5.924 -3.747 8.663 -1.205l.188 .181a2.987 2.987 0 0 1 0 4.228l-11.287 11.274a3 3 0 0 1 -4.089 .135l-.143 -.135c-2.728 -2.724 -1.704 -6.117 1.024 -8.841\" /><path d=\"M9.5 7.5l1.5 3.5\" /><path d=\"M6.5 10.5l1.5 3.5\" /><path d=\"M12.5 4.5l1.5 3.5\" /></svg>",
  "ball-basketball.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"icon icon-tabler icons-tabler-outline icon-tabler-ball-basketball\"><path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /><path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\" /><path d=\"M5.65 5.65l12.7 12.7\" /><path d=\"M5.65 18.35l12.7 -12.7\" /><path d=\"M12 3a9 9 0 0 0 9 9\" /><path d=\"M3 12a9 9 0 0 1 9 9\" /></svg>",
  "bar-chart.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n  <path d=\"M3 3v18h18\"/>\n  <path d=\"m7 14 4-4 3 3 5-6\"/>\n</svg>",
  "bed.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2.5\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M2 4v16\" />\n  <path d=\"M2 8h18a2 2 0 0 1 2 2v10\" />\n  <path d=\"M2 17h20\" />\n  <path d=\"M6 8v9\" />\n</svg>",
  "bike.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <circle cx=\"18.5\" cy=\"17.5\" r=\"3.5\" />\n  <circle cx=\"5.5\" cy=\"17.5\" r=\"3.5\" />\n  <circle cx=\"15\" cy=\"5\" r=\"1\" />\n  <path d=\"M12 17.5V14l-3-3 4-3 2 3h2\" />\n</svg>",
  "book-open.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 5v16\" />\n  <path d=\"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z\" />\n</svg>",
  "brain.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 18V5\" />\n  <path d=\"M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4\" />\n  <path d=\"M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5\" />\n  <path d=\"M17.997 5.125a4 4 0 0 1 2.526 5.77\" />\n  <path d=\"M18 18a4 4 0 0 0 2-7.464\" />\n  <path d=\"M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517\" />\n  <path d=\"M6 18a4 4 0 0 1-2-7.464\" />\n  <path d=\"M6.003 5.125a4 4 0 0 0-2.526 5.77\" />\n</svg>",
  "cannabis.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"icon icon-tabler icons-tabler-outline icon-tabler-cannabis\"><path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /><path d=\"M7 20s0 -2 1 -3.5c-1.5 0 -2 -.5 -4 -1.5c0 0 1.839 -1.38 5 -1c-1.789 -.97 -3.279 -2.03 -5 -6c0 0 3.98 -.3 6.5 3.5c-2.284 -4.9 1.5 -9.5 1.5 -9.5c2.734 5.47 2.389 7.5 1.5 9.5c2.531 -3.77 6.5 -3.5 6.5 -3.5c-1.721 3.97 -3.211 5.03 -5 6c3.161 -.38 5 1 5 1c-2 1 -2.5 1.5 -4 1.5c1 1.5 1 3.5 1 3.5c-2 0 -4.438 -2.22 -5 -3c-.563 .78 -3 3 -5 3\" /><path d=\"M12 22v-5\" /></svg>",
  "check.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m5 12 4 4L19 6\"/></svg>",
  "clock.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n  <circle cx=\"12\" cy=\"12\" r=\"10\"/>\n  <polyline points=\"12 6 12 12 16 14\"/>\n</svg>",
  "close.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n  <line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"/>\n  <line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"/>\n</svg>",
  "coffee.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M10 2v2\" />\n  <path d=\"M14 2v2\" />\n  <path d=\"M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1\" />\n  <path d=\"M6 2v2\" />\n</svg>",
  "cooking.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M3 13h14l-2 7H5l-2-7Zm14 2h5M7 2c3 3-3 4 0 7m5-7c3 3-3 4 0 7m5-7c3 3-3 4 0 7\"/><path d=\"m5 15 1 3m4-3v3\"/></svg>",
  "cross-symbol.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"icon icon-tabler icons-tabler-outline icon-tabler-cross\"><path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /><path d=\"M10 21h4v-9h5v-4h-5v-5h-4v5h-5v4h5l0 9\" /></svg>",
  "cross.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#ffffff\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m6 6 12 12M18 6 6 18\"/></svg>",
  "cut.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"icon icon-tabler icons-tabler-outline icon-tabler-cut\"><path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /><path d=\"M4 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0\" /><path d=\"M14 17a3 3 0 1 0 6 0a3 3 0 1 0 -6 0\" /><path d=\"M9.15 14.85l8.85 -10.85\" /><path d=\"M6 4l8.85 10.85\" /></svg>",
  "droplets.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2.5\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z\" />\n  <path d=\"M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97\" />\n</svg>",
  "dumbbell.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"icon icon-tabler icons-tabler-outline icon-tabler-barbell\"><g transform=\"rotate(45 12 12)\">\n  <path d=\"M2 12h1\" />\n  <path d=\"M6 8h-2a1 1 0 0 0 -1 1v6a1 1 0 0 0 1 1h2\" />\n  <path d=\"M6 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1\" />\n  <path d=\"M9 12h6\" />\n  <path d=\"M15 7v10a1 1 0 0 0 1 1h1a1 1 0 0 0 1 -1v-10a1 1 0 0 0 -1 -1h-1a1 1 0 0 0 -1 1\" />\n  <path d=\"M18 8h2a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-2\" />\n  <path d=\"M22 12h-1\" />\n</g></svg>",
  "edit.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n  <path d=\"M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\"/>\n  <path d=\"M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z\"/>\n</svg>",
  "flower-2.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1\" />\n  <circle cx=\"12\" cy=\"8\" r=\"2\" />\n  <path d=\"M12 10v12\" />\n  <path d=\"M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z\" />\n  <path d=\"M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z\" />\n</svg>",
  "footprints.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2.5\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z\" />\n  <path d=\"M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z\" />\n  <path d=\"M16 17h4\" />\n  <path d=\"M4 13h4\" />\n</svg>",
  "headphones.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3\" />\n</svg>",
  "heart.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\" />\n</svg>",
  "instagram.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"feather feather-instagram\"><rect x=\"2\" y=\"2\" width=\"20\" height=\"20\" rx=\"5\" ry=\"5\"></rect><path d=\"M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z\"></path><line x1=\"17.5\" y1=\"6.5\" x2=\"17.51\" y2=\"6.5\"></line></svg>",
  "leaf.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20\" />\n  <path d=\"M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13\" />\n</svg>",
  "letter-a.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"22.416666666666668 -703.1290322580645 599.0833333333334 705.6290322580645\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M329.5 -596.0 95 -24Q90.5 -11.5 80.75 -4.5Q71.0 2.5 59.5 2.5Q41.0 2.5 32.0 -7.5Q23.0 -17.5 22.5 -32.0Q22.0 -38.5 24.5 -46.5L283.5 -676.5Q289.0 -690.5 299.5 -697.25Q310 -704 323 -703Q336 -703 346.25 -696.0Q356.5 -689.0 361.0 -676.5L618.5 -52.5Q621.5 -44.5 621.5 -36.5Q621.5 -18.5 609.75 -8.0Q598.0 2.5 583.0 2.5Q570.5 2.5 560.5 -4.75Q550.5 -12.0 545.5 -24.5L307.5 -597.0ZM144.5 -187.0 179.0 -264.5H476.0L490.5 -187.0Z\"/></svg>",
  "letter-b.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"87.5 -700.0 520.0 700.0\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M388.5 -700.0Q476.5 -700.0 524.0 -654.5Q571.5 -609.0 571.5 -526.0Q571.5 -482.0 551.75 -445.0Q532 -408 493.5 -385.75Q455.0 -363.5 398.5 -361.5L397 -390Q432 -390 469.0 -380.0Q506 -370 537.25 -347.75Q568.5 -325.5 588.0 -289.5Q607.5 -253.5 607.5 -201.0Q607.5 -144.0 588.75 -105.25Q570.0 -66.5 538.5 -43.25Q507 -20 468.5 -10.0Q430 0 390.5 0.0H128Q111 0 99.25 -11.75Q87.5 -23.5 87.5 -40.5V-659.5Q87.5 -676.5 99.25 -688.25Q111 -700 128 -700ZM377 -621H161.5L173.5 -638.5V-389.5L162.5 -402.5H378.5Q422.5 -403.0 454.0 -431.5Q485.5 -460.0 485.5 -515.5Q485.5 -566.0 456.75 -593.5Q428 -621 377 -621ZM384.5 -323.0H167L173.5 -330.0V-68.5L166.0 -77.5H388.0Q446.5 -77.5 484.0 -107.5Q521.5 -137.5 521.5 -201.0Q521.5 -249.5 501.5 -276.0Q481.5 -302.5 450.0 -312.75Q418.5 -323.0 384.5 -323.0Z\"/></svg>",
  "letter-c.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"45 -707.5 567.4206349206349 717.5\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M591.5 -654.0Q608.5 -644.5 611.25 -626.75Q614 -609 602.0 -593.5Q593 -581 579.0 -579.75Q565.0 -578.5 551.0 -585.5Q518.0 -605.5 480.0 -617.0Q442.0 -628.5 399.5 -628.5Q340.5 -628.5 291.5 -608.25Q242.5 -588.0 206.5 -550.75Q170.5 -513.5 150.75 -462.5Q131.0 -411.5 131 -350Q131 -284 151.75 -232.0Q172.5 -180.0 209.0 -143.5Q245.5 -107.0 294.25 -88.0Q343 -69 399.5 -69.0Q441 -69 479.0 -80.0Q517 -91 550.5 -111.5Q564.5 -119.0 578.75 -117.0Q593 -115 602.5 -102.5Q615.0 -86.5 611.75 -69.25Q608.5 -52.0 592.5 -43.5Q567.5 -28.5 535.5 -16.25Q503.5 -4.0 469.0 3.0Q434.5 10.0 399.5 10.0Q327.5 10.0 263.75 -15.0Q200 -40 150.75 -86.75Q101.5 -133.5 73.25 -200.0Q45.0 -266.5 45 -350Q45.0 -427.5 72.0 -492.75Q99 -558 147.25 -606.0Q195.5 -654.0 260.0 -680.75Q324.5 -707.5 399.5 -707.5Q452.0 -707.5 501.25 -693.5Q550.5 -679.5 591.5 -654.0Z\"/></svg>",
  "letter-d.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"87.5 -700.0 585.0 700.0\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M377.5 -700.0Q451 -700 506.5 -672.25Q562.0 -644.5 599.0 -595.5Q636.0 -546.5 654.25 -483.25Q672.5 -420.0 672.5 -350.0Q672.5 -253.5 639.75 -174.0Q607.0 -94.5 541.75 -47.25Q476.5 0.0 377.5 0.0H128Q111 0 99.25 -11.75Q87.5 -23.5 87.5 -40.5V-659.5Q87.5 -676.5 99.25 -688.25Q111 -700 128 -700ZM367.5 -77.5Q445.0 -77.5 493.25 -114.5Q541.5 -151.5 564.0 -213.5Q586.5 -275.5 586.5 -350.0Q586.5 -404.0 574.0 -453.25Q561.5 -502.5 535.0 -540.5Q508.5 -578.5 467.0 -600.5Q425.5 -622.5 367.5 -622.5H163.0L171 -631V-67.5L165.0 -77.5Z\"/></svg>",
  "letter-e.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"87.5 -700 437.0 700\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M128 -700H484Q501 -700 512.75 -688.75Q524.5 -677.5 524.5 -660.5Q524.5 -643.5 512.75 -633.0Q501.0 -622.5 484.0 -622.5H161.5L171.0 -639.5V-387L161 -398H439Q456 -398 467.75 -386.75Q479.5 -375.5 479.5 -358.5Q479.5 -341.5 467.75 -331.0Q456.0 -320.5 439.0 -320.5H163.5L171 -330V-70.5L165.0 -77.5H484.0Q501.0 -77.5 512.75 -65.75Q524.5 -54.0 524.5 -38.5Q524.5 -21.5 512.75 -10.75Q501 0 484 0H128Q111 0 99.25 -11.75Q87.5 -23.5 87.5 -40.5V-659.5Q87.5 -676.5 99.25 -688.25Q111 -700 128 -700Z\"/></svg>",
  "letter-f.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"87.5 -700 432.0 700\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M129 0Q110.5 0.0 99.0 -11.75Q87.5 -23.5 87.5 -40.5V-659.5Q87.5 -676.5 99.25 -688.25Q111 -700 128 -700H479Q496 -700 507.75 -688.75Q519.5 -677.5 519.5 -660.5Q519.5 -645.0 507.75 -633.75Q496.0 -622.5 479.0 -622.5H164.0L170.0 -630.5V-386L164.5 -396.5H434.0Q451.0 -396.5 462.75 -385.25Q474.5 -374.0 474.5 -357.0Q474.5 -341.5 462.75 -330.25Q451 -319 434 -319H162.5L170.0 -327.5V-40.5Q170.0 -23.5 158.0 -11.75Q146 0 129 0Z\"/></svg>",
  "letter-g.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"45 -710 595 720\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M407 10Q330 10 264.25 -17.25Q198.5 -44.5 149.25 -93.5Q100.0 -142.5 72.5 -208.0Q45.0 -273.5 45 -350Q45.0 -426.5 72.5 -492.0Q100.0 -557.5 149.25 -606.5Q198.5 -655.5 264.25 -682.75Q330 -710 407 -710Q458 -710 505.5 -698.25Q553.0 -686.5 591.5 -663.0Q601.5 -657.5 606.25 -648.5Q611.0 -639.5 611 -630Q611 -613 599.5 -601.0Q588 -589 573 -589Q567 -589 561.25 -590.75Q555.5 -592.5 550 -595Q519 -611 483.0 -620.5Q447 -630 407 -630Q328 -630 265.5 -593.0Q203 -556 167.0 -492.75Q131.0 -429.5 131 -350Q131 -271 167.0 -207.25Q203.0 -143.5 265.5 -106.75Q328 -70 407 -70Q447 -70 489.25 -80.75Q531.5 -91.5 561.5 -109.0L555 -85V-295.5L570.5 -281.5H418.0Q401.0 -281.5 389.25 -293.0Q377.5 -304.5 377.5 -321.5Q377.5 -339.0 389.25 -350.25Q401.0 -361.5 418.0 -361.5H600.0Q617.5 -361.5 628.75 -349.75Q640 -338 640 -321V-89.5Q640.0 -77.5 634.25 -68.5Q628.5 -59.5 620.0 -53.5Q575.0 -24.5 520.5 -7.25Q466 10 407 10Z\"/></svg>",
  "letter-h.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"87.5 -700 544.5 700\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M130 -700Q146.5 -700.0 158.75 -688.25Q171.0 -676.5 171 -659V-41Q170.5 -23.5 158.0 -11.75Q145.5 0.0 129 0Q110 0 98.75 -11.75Q87.5 -23.5 87.5 -41.0V-659.0Q87.5 -676.5 99.5 -688.25Q111.5 -700.0 130 -700ZM590.5 -700.0Q609 -700 620.5 -688.25Q632.0 -676.5 632 -659V-41Q631.5 -23.5 619.75 -11.75Q608 0 589.5 0.0Q572.5 0.0 560.5 -11.75Q548.5 -23.5 548.5 -41.0V-659.0Q548.5 -676.5 561.0 -688.25Q573.5 -700.0 590.5 -700.0ZM126.0 -394.5H591.5L590.5 -317.0H123Z\"/></svg>",
  "letter-i.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"87.5 -700 83.5 700\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M171 -41Q170.5 -23.5 158.0 -11.75Q145.5 0.0 129 0Q110 0 98.75 -11.75Q87.5 -23.5 87.5 -41.0V-659.0Q87.5 -676.5 99.5 -688.25Q111.5 -700.0 130 -700Q146.5 -700.0 158.75 -688.25Q171.0 -676.5 171 -659Z\"/></svg>",
  "letter-j.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"57.5 -700.0 420.0 710.0\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M252.5 10.0Q191.5 10.0 142.0 -21.0Q92.5 -52.0 64.5 -104.0Q57.5 -116.0 57.5 -126.5Q57.5 -143.5 70.5 -154.25Q83.5 -165.0 96.5 -165.0Q108 -165 117.25 -158.75Q126.5 -152.5 134.0 -143.5Q153.5 -109.5 183.75 -89.75Q214 -70 252.5 -70.0Q293.5 -70.0 325.25 -88.0Q357 -106 375.5 -137.5Q394 -169 394 -209V-659.5Q394.0 -676.5 406.5 -688.25Q419 -700 436.5 -700.0Q455 -700 466.25 -688.25Q477.5 -676.5 477.5 -659.5V-209.0Q477.5 -147.5 448.25 -97.75Q419 -48 368.25 -19.0Q317.5 10.0 252.5 10.0Z\"/></svg>",
  "letter-k.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"87.5 -700.5 539.5 703.0\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M581.5 2.5Q563.5 2.5 552.0 -12.5L285.5 -351.5L347 -414L617.5 -67.0Q627 -54 627.0 -39.5Q627.0 -19.5 612.25 -8.5Q597.5 2.5 581.5 2.5ZM578.5 -700.5Q594.5 -700.5 605.25 -687.75Q616 -675 616 -661Q616.0 -646.5 604.0 -634.5L161.5 -217.0L154.5 -310.0L547 -686Q561.5 -700.5 578.5 -700.5ZM129 0Q110 0 98.75 -11.75Q87.5 -23.5 87.5 -41.0V-659.0Q87.5 -676.5 99.5 -688.25Q111.5 -700.0 130 -700Q148.5 -700.0 159.75 -688.25Q171.0 -676.5 171 -659V-41Q170.5 -23.5 159.0 -11.75Q147.5 0.0 129 0Z\"/></svg>",
  "letter-l.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"87.5 -700 427.0 700\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M474.0 -78.5Q491.0 -78.5 502.75 -67.25Q514.5 -56.0 514.5 -39.0Q514.5 -22.0 502.75 -11.0Q491 0 474 0H128Q110.5 0.0 99.0 -11.75Q87.5 -23.5 87.5 -40.5V-659.5Q87.5 -676.5 99.5 -688.25Q111.5 -700.0 130 -700Q146.5 -700.0 158.75 -688.25Q171.0 -676.5 171.0 -659.5V-61L151.0 -78.5Z\"/></svg>",
  "letter-m.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"87.5 -700.55 649.0 700.55\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M128.5 -700.5Q138.0 -700.5 148.25 -695.75Q158.5 -691.0 164.5 -682.5L429.5 -282.0L394.5 -283.0L662.5 -682.5Q676.0 -701.5 696.5 -700.5Q712.5 -700.0 724.5 -688.75Q736.5 -677.5 736.5 -660.0V-40.5Q736.5 -23.5 724.75 -11.75Q713 0 695 0Q676.5 0.0 664.75 -11.75Q653.0 -23.5 653.0 -40.5V-583.5L678 -579L441.5 -220.0Q436.0 -212.5 427.5 -207.5Q419.0 -202.5 409.5 -203.0Q400.5 -202.5 391.5 -207.5Q382.5 -212.5 377 -220L144.0 -578.5L165 -605V-40.5Q165.0 -23.5 154.0 -11.75Q143 0 126 0Q109 0 98.25 -11.75Q87.5 -23.5 87.5 -40.5V-660.0Q87.5 -676.0 99.25 -688.25Q111.0 -700.5 128.5 -700.5Z\"/></svg>",
  "letter-n.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"87.5 -700 555.0 700.0\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M606 -700Q622.5 -700.0 632.5 -689.25Q642.5 -678.5 642.5 -662.5V-41.5Q642.5 -23.0 630.5 -11.5Q618.5 0.0 601.5 0.0Q593 0 584.0 -3.25Q575.0 -6.5 570.0 -12.5L141.5 -579.0L161.5 -590.5V-36.5Q161.5 -21.0 151.0 -10.5Q140.5 0.0 124 0Q107.5 0.0 97.5 -10.5Q87.5 -21.0 87.5 -36.5V-659.5Q87.5 -678.0 99.25 -689.0Q111 -700 127 -700Q136 -700 145.5 -696.5Q155 -693 160.0 -685.5L581.5 -127.5L569.0 -111.5V-662.5Q569.0 -678.5 579.5 -689.25Q590 -700 606 -700Z\"/></svg>",
  "letter-o.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"45 -710.0 673.5 720.0\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M718.5 -350.0Q718.5 -272.5 693.75 -207.0Q669.0 -141.5 623.75 -92.75Q578.5 -44.0 516.75 -17.0Q455 10 381.5 10.0Q308 10 246.5 -17.0Q185 -44 139.75 -92.75Q94.5 -141.5 69.75 -207.0Q45.0 -272.5 45 -350Q45.0 -427.5 69.75 -493.0Q94.5 -558.5 139.75 -607.25Q185 -656 246.5 -683.0Q308 -710 381.5 -710.0Q455 -710 516.75 -683.0Q578.5 -656.0 623.75 -607.25Q669.0 -558.5 693.75 -493.0Q718.5 -427.5 718.5 -350.0ZM632.5 -350.0Q632.5 -431.5 600.25 -494.75Q568 -558 511.75 -594.0Q455.5 -630.0 381.5 -630.0Q308 -630 251.5 -594.0Q195 -558 163.0 -495.0Q131 -432 131 -350Q131.0 -268.5 163.0 -205.25Q195 -142 251.5 -106.0Q308 -70 381.5 -70.0Q455.5 -70.0 511.75 -106.0Q568 -142 600.25 -205.25Q632.5 -268.5 632.5 -350.0Z\"/></svg>",
  "letter-p.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"87.5 -700 468.5 700.0\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M362 -700Q416.5 -700.0 460.5 -673.0Q504.5 -646.0 530.25 -599.0Q556 -552 556 -492Q556 -433 530.25 -385.0Q504.5 -337.0 460.5 -308.75Q416.5 -280.5 362.0 -280.5H159.0L166 -293V-40.5Q166.0 -23.5 154.75 -11.75Q143.5 0.0 126.5 0.0Q109 0 98.25 -11.75Q87.5 -23.5 87.5 -40.5V-659.5Q87.5 -676.5 99.25 -688.25Q111 -700 128 -700ZM362.0 -357.5Q394.5 -357.5 419.75 -375.75Q445 -394 460.0 -424.75Q475.0 -455.5 475 -492Q475.0 -529.5 460.0 -558.75Q445 -588 419.75 -605.25Q394.5 -622.5 362.0 -622.5H158.5L166 -634V-348L158.5 -357.5Z\"/></svg>",
  "letter-q.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"45 -710.0 743.5 892.5\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M751.5 46.5Q766.0 46.5 777.25 57.5Q788.5 68.5 788.5 84.0Q788.5 103.0 770.0 120.5Q751.5 138.0 722.0 152.25Q692.5 166.5 660.0 174.5Q627.5 182.5 599.5 182.5Q539.0 182.5 500.25 170.0Q461.5 157.5 433.25 141.5Q405.0 125.5 377.5 113.0Q350.0 100.5 311.5 100.5Q293.0 100.5 280.0 106.5Q267.0 112.5 255.0 118.5Q243.0 124.5 226.5 124.5Q210.0 124.5 198.5 112.0Q187.0 99.5 187 84Q187.0 58.5 210.0 49.5L394 -17L485 -8L314.5 52.0L342.5 31.5Q382.0 31.5 412.75 43.25Q443.5 55.0 471.75 70.25Q500.0 85.5 531.25 97.25Q562.5 109.0 603 109Q638 109 661.25 98.5Q684.5 88.0 699.5 78.0Q715.0 67.5 726.5 57.0Q738.0 46.5 751.5 46.5ZM718.5 -350.0Q718.5 -272.5 693.75 -207.0Q669.0 -141.5 623.75 -92.75Q578.5 -44.0 516.75 -17.0Q455 10 381.5 10.0Q308 10 246.5 -17.0Q185 -44 139.75 -92.75Q94.5 -141.5 69.75 -207.0Q45.0 -272.5 45 -350Q45.0 -427.5 69.75 -493.0Q94.5 -558.5 139.75 -607.25Q185 -656 246.5 -683.0Q308 -710 381.5 -710.0Q455 -710 516.75 -683.0Q578.5 -656.0 623.75 -607.25Q669.0 -558.5 693.75 -493.0Q718.5 -427.5 718.5 -350.0ZM632.5 -350.0Q632.5 -431.5 600.25 -494.75Q568 -558 511.75 -594.0Q455.5 -630.0 381.5 -630.0Q308 -630 251.5 -594.0Q195 -558 163.0 -495.0Q131 -432 131 -350Q131.0 -268.5 163.0 -205.25Q195 -142 251.5 -106.0Q308 -70 381.5 -70.0Q455.5 -70.0 511.75 -106.0Q568 -142 600.25 -205.25Q632.5 -268.5 632.5 -350.0Z\"/></svg>",
  "letter-r.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"87.5 -700 543.0636363636364 700\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M134 0Q115 0 101.25 -11.75Q87.5 -23.5 87.5 -40.5V-659.5Q87.5 -676.5 99.25 -688.25Q111 -700 128 -700H404Q459.5 -700.0 504.5 -674.5Q549.5 -649.0 576.0 -604.25Q602.5 -559.5 602.5 -502.0Q602.5 -460.0 586.5 -423.5Q570.5 -387.0 542.5 -360.25Q514.5 -333.5 479 -320L456.5 -335.5Q490.5 -328.0 517.75 -307.5Q545 -287 561.75 -255.5Q578.5 -224.0 579.5 -182.0Q581.5 -145.0 584.5 -122.75Q587.5 -100.5 593.5 -88.0Q599.5 -75.5 611.0 -68.5Q625 -60 629.25 -44.75Q633.5 -29.5 624 -16Q617.5 -6.5 606.75 -3.0Q596.0 0.5 585.0 -0.75Q574 -2 565.5 -6.5Q550.0 -15.5 534.75 -33.25Q519.5 -51.0 509.75 -84.0Q500 -117 500.0 -173.5Q500.0 -205.5 489.75 -226.75Q479.5 -248.0 462.75 -260.75Q446.0 -273.5 424.75 -278.75Q403.5 -284.0 381.5 -284.0H159L171.0 -301.5V-40.5Q171.0 -23.5 161.0 -11.75Q151 0 134 0ZM159.0 -355.5H404.0Q433.0 -357.5 458.5 -375.75Q484 -394 500.25 -426.25Q516.5 -458.5 516.5 -500.0Q516.5 -552.5 483.0 -587.5Q449.5 -622.5 399.0 -622.5H162.5L171 -642V-338Z\"/></svg>",
  "letter-s.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"37.5 -710.0 490.5 720.010989010989\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M291.5 10.0Q217.5 10.5 161.5 -11.75Q105.5 -34.0 54 -82Q46.5 -88.5 42.0 -97.25Q37.5 -106.0 37.5 -116.0Q37.5 -131.5 49.25 -144.0Q61.0 -156.5 77.5 -156.5Q91.5 -156.5 103 -146Q142.0 -107.5 187.5 -87.5Q233.0 -67.5 289.5 -67.5Q333.5 -67.5 369.0 -81.5Q404.5 -95.5 425.5 -120.5Q446.5 -145.5 446.5 -178.5Q446 -219 423.5 -245.0Q401 -271 361.25 -288.25Q321.5 -305.5 269.5 -318.0Q224 -329 185.5 -344.75Q147.0 -360.5 118.75 -384.0Q90.5 -407.5 75.0 -441.0Q59.5 -474.5 59.5 -520.0Q59.5 -577.0 89.5 -619.75Q119.5 -662.5 172.75 -686.25Q226 -710 294.5 -710.0Q355.5 -710.0 410.25 -690.0Q465 -670 498.0 -634.5Q517.5 -616.0 517.5 -597.5Q517.5 -583.0 505.25 -570.5Q493 -558 477 -558Q465.5 -558.0 457.0 -565.5Q440.0 -584.5 413.75 -599.5Q387.5 -614.5 356.5 -623.5Q325.5 -632.5 294.5 -632.5Q248.5 -632.5 213.75 -619.0Q179.0 -605.5 159.5 -581.25Q140 -557 140 -523Q140 -485 162.0 -460.5Q184 -436 221.0 -420.5Q258 -405 302.5 -392.5Q351.5 -380.5 393.0 -365.25Q434.5 -350.0 464.75 -326.75Q495.0 -303.5 511.5 -268.25Q528 -233 528 -181Q528.0 -125.5 496.75 -82.5Q465.5 -39.5 412.25 -15.0Q359.0 9.5 291.5 10.0Z\"/></svg>",
  "letter-t.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"32.5 -700 546.0 700\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M305 0Q286.5 0.0 274.75 -11.75Q263.0 -23.5 263.0 -40.5V-658.5H348.0V-40.5Q348.0 -23.5 335.75 -11.75Q323.5 0.0 305 0ZM73.0 -623.5Q56.0 -623.5 44.25 -634.25Q32.5 -645.0 32.5 -662.0Q32.5 -679.0 44.25 -689.5Q56 -700 73 -700H538Q555 -700 566.75 -689.25Q578.5 -678.5 578.5 -661.5Q578.5 -644.0 566.75 -633.75Q555.0 -623.5 538.0 -623.5Z\"/></svg>",
  "letter-u.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"87.5 -700.5 535.0 708.0\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M583.5 -700.5Q601.0 -700.5 611.75 -688.75Q622.5 -677.0 622.5 -660.0V-263.0Q622.5 -186.0 587.25 -124.75Q552.0 -63.5 492.0 -28.0Q432.0 7.5 355.5 7.5Q279.0 7.5 218.5 -28.0Q158.0 -63.5 122.75 -124.75Q87.5 -186.0 87.5 -263.0V-660.0Q87.5 -677.0 99.25 -688.75Q111.0 -700.5 130.0 -700.5Q146.0 -700.5 158.25 -688.75Q170.5 -677.0 170.5 -660.0V-263.0Q170.5 -208.0 195.75 -165.0Q221 -122 263.5 -97.25Q306.0 -72.5 355.5 -72.5Q407.0 -72.5 450.0 -97.25Q493 -122 519.25 -165.0Q545.5 -208.0 545.5 -263.0V-660.0Q545.5 -677.0 555.75 -688.75Q566.0 -700.5 583.5 -700.5Z\"/></svg>",
  "letter-v.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"33 -701.5 603.5 701.5\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M595.5 -701.0Q613 -701 624.75 -690.25Q636.5 -679.5 636.5 -663.0Q636.5 -654.5 632.5 -644.5L372 -26Q366 -13 355.25 -6.5Q344.5 0.0 333 0Q322.0 -0.5 311.75 -7.0Q301.5 -13.5 296.5 -25.5L37.0 -643.5Q35.0 -647.5 34.0 -652.25Q33 -657 33 -662Q33.0 -680.5 46.5 -691.0Q60.0 -701.5 73.0 -701.5Q99.5 -701.5 111.5 -674.0L351.0 -103.5H327.5L558.5 -675.5Q570.5 -701.0 595.5 -701.0Z\"/></svg>",
  "letter-w.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"25.5 -702.5 907.5 702.5\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M890.0 -702.5Q906.0 -702.5 919.5 -691.5Q933.0 -680.5 933.0 -660.5Q933 -654 930.5 -645.5L717.5 -25.5Q713.5 -13.5 703.0 -7.0Q692.5 -0.5 681.5 0.0Q669.5 0.0 658.5 -6.25Q647.5 -12.5 642.0 -25.5L474.5 -429.5L483.0 -426.5L316.5 -25.5Q310.5 -12.5 299.5 -6.25Q288.5 0.0 276.5 0.0Q266.0 -0.5 255.5 -7.0Q245.0 -13.5 241.0 -25.5L28.0 -645.5Q25.5 -654.0 25.5 -660.0Q25.5 -680.0 40.0 -691.25Q54.5 -702.5 69.5 -702.5Q82.0 -702.5 93.0 -695.75Q104 -689 108.0 -676.5L295 -125H280.5L443.5 -528.0Q448.5 -540.0 458.5 -547.0Q468.5 -554.0 481.5 -553.5Q494 -554 504.25 -547.0Q514.5 -540.0 519 -528L677 -131L664.5 -125.5L850.5 -676.5Q854.5 -689.0 865.5 -695.75Q876.5 -702.5 890.0 -702.5Z\"/></svg>",
  "letter-x.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"38 -703 546.5 707.0\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M546.5 -702.5Q562.0 -702.5 573.25 -691.5Q584.5 -680.5 584.5 -666.5Q584.5 -653.5 575.5 -641.5L355.5 -344.5L310.5 -408.0L514.5 -684.0Q528.0 -702.5 546.5 -702.5ZM79 -703Q99.5 -703.0 112 -686L575.5 -60.5Q584 -49 584 -36Q584.0 -17.5 570.75 -6.75Q557.5 4.0 543.5 4.0Q523.5 4.0 511 -13L47.0 -638.5Q38.5 -649.0 38.5 -662.5Q38.5 -680.0 51.25 -691.5Q64 -703 79 -703ZM74.5 4.0Q58.5 4.0 48.25 -7.25Q38.0 -18.5 38 -31Q38.0 -44.5 48 -58L269.0 -358.5L312 -293L107 -14Q94.5 4.0 74.5 4.0Z\"/></svg>",
  "letter-y.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"18.5 -703.5 535.5 703.5\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M514.0 -703.5Q530.5 -703.5 542.25 -691.25Q554 -679 554 -663Q554.0 -656.5 552.25 -650.25Q550.5 -644.0 546.5 -638.0L314.5 -314.5L328.0 -363.5V-40.5Q328.0 -23.5 316.25 -11.75Q304.5 0.0 288.5 0.0Q271 0 259.5 -11.75Q248.0 -23.5 248.0 -40.5V-356L254.5 -329.5L29.5 -633.5Q23.5 -641.5 21.0 -649.0Q18.5 -656.5 18.5 -663.5Q18.5 -681.0 32.5 -692.25Q46.5 -703.5 61.0 -703.5Q80.5 -703.5 94 -685L301 -401L282 -404L480.5 -684.0Q494.0 -703.5 514.0 -703.5Z\"/></svg>",
  "letter-z.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"47.5 -700 555.5 700\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M559 -700Q576.5 -700.0 589.75 -688.75Q603.0 -677.5 603.0 -660.5Q603.0 -647.5 594.0 -635.5L163.5 -69.5L158.0 -76.5H555.0Q572.0 -76.5 583.75 -65.75Q595.5 -55.0 595.5 -38.5Q595.5 -22.0 583.75 -11.0Q572 0 555 0H89.5Q71.5 0.0 59.5 -12.75Q47.5 -25.5 47.5 -40.0Q47.5 -53.0 56.5 -65.0L486.0 -628.5L493.5 -623.5H119.5Q102.5 -623.5 90.75 -634.5Q79.0 -645.5 79 -662Q79 -679 90.75 -689.5Q102.5 -700.0 119.5 -700.0Z\"/></svg>",
  "medal.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2.5\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15\" />\n  <path d=\"M11 12 5.12 2.2\" />\n  <path d=\"m13 12 5.88-9.8\" />\n  <path d=\"M8 7h8\" />\n  <circle cx=\"12\" cy=\"17\" r=\"5\" />\n  <path d=\"M12 18v-2h-.5\" />\n</svg>",
  "moon.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401\" />\n</svg>",
  "music.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M9 18V5l12-2v13\" />\n  <circle cx=\"6\" cy=\"18\" r=\"3\" />\n  <circle cx=\"18\" cy=\"16\" r=\"3\" />\n</svg>",
  "number-1.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"22.5 -700.1111111111111 251.0 700.1111111111111\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M230 0Q211.5 0.0 199.5 -11.75Q187.5 -23.5 187.5 -40.5V-609.5L199.5 -595.5L86.5 -518.0Q76.5 -510.5 63.5 -510.5Q47.0 -510.5 34.75 -523.25Q22.5 -536.0 22.5 -552.0Q22.5 -573.5 43.5 -586.5L203 -692Q210.5 -697.0 218.75 -698.75Q227.0 -700.5 234.5 -700.0Q252.5 -699.5 263.0 -688.0Q273.5 -676.5 273.5 -659.5V-40.5Q273.5 -23.5 261.25 -11.75Q249 0 230 0Z\"/></svg>",
  "number-2.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"57.5 -710.0 449.0 710.0\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M468.5 -75.0Q484.5 -75.0 495.5 -64.0Q506.5 -53.0 506.5 -37.0Q506.5 -21.0 495.5 -10.5Q484.5 0.0 468.5 0.0H105.5Q88 0 76.5 -10.25Q65.0 -20.5 65 -39Q65.0 -54.5 76.5 -67.5L303 -315Q352.5 -368.5 378.0 -416.25Q403.5 -464.0 403.5 -501.0Q403.5 -561.5 367.0 -598.25Q330.5 -635.0 269.5 -635.0Q242.5 -635.0 215.5 -623.5Q188.5 -612.0 166.5 -592.5Q144.5 -573.0 130.5 -548.5Q122.5 -536.0 114.25 -532.25Q106.0 -528.5 97.0 -528.5Q82.0 -528.5 69.75 -539.0Q57.5 -549.5 57.5 -564.0Q57.5 -574.5 63.75 -584.25Q70 -594 80 -606Q100.5 -635.0 132.25 -658.5Q164 -682 201.25 -696.0Q238.5 -710.0 274.5 -710.0Q339 -710 386.5 -684.75Q434.0 -659.5 460.0 -613.75Q486 -568 486.0 -505.5Q486.0 -452.5 453.75 -388.75Q421.5 -325.0 360.0 -258.5L185.0 -64.5L175 -75Z\"/></svg>",
  "number-3.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"45 -695 431.5 705\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M96.5 -115.5Q103.0 -115.5 110.25 -113.25Q117.5 -111.0 127 -103Q146.5 -84.5 173.75 -73.5Q201.0 -62.5 236.0 -62.5Q279.0 -62.5 315.0 -82.25Q351 -102 373.25 -137.75Q395.5 -173.5 395.5 -221.0Q395.5 -272.0 373.25 -304.25Q351.0 -336.5 316.25 -352.25Q281.5 -368.0 244 -368Q229.5 -368.0 217.75 -365.75Q206.0 -363.5 195.5 -360.75Q185 -358 175.5 -358.0Q159.5 -358.0 150.5 -369.0Q141.5 -380.0 141.5 -396.0Q141.5 -405.0 145.25 -412.5Q149 -420 156.5 -429.0L350.5 -638.5L367 -620H83Q67 -620 56.0 -631.0Q45 -642 45 -658Q45 -674 56.0 -684.5Q67 -695 83 -695H409Q431 -695 440.75 -682.25Q450.5 -669.5 450.5 -654.5Q450.5 -646.0 446.25 -638.0Q442 -630 435 -623L241 -412L217.5 -432.0Q223 -436 241.0 -439.5Q259 -443 270.5 -443.0Q326.5 -443.0 373.5 -415.75Q420.5 -388.5 448.5 -339.75Q476.5 -291.0 476.5 -225.5Q476.5 -154.0 443.5 -101.0Q410.5 -48.0 353.25 -19.0Q296 10 224 10Q184 10 145.5 -2.25Q107.0 -14.5 78.5 -38.5Q66 -46 61.5 -55.0Q57 -64 57.0 -72.5Q57 -88 68.25 -101.75Q79.5 -115.5 96.5 -115.5Z\"/></svg>",
  "number-4.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"12.5 -700.0 507.0 700.0\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M374.5 0.0Q357.5 0.0 346.25 -11.75Q335.0 -23.5 335.0 -40.5V-588L351.0 -581.5L111.5 -269.5L107.5 -281.5H481.5Q497.5 -281.5 508.5 -270.75Q519.5 -260.0 519.5 -244.0Q519.5 -228.5 508.5 -218.0Q497.5 -207.5 481.5 -207.5H52.5Q37.5 -207.5 25.0 -219.5Q12.5 -231.5 12.5 -247.5Q12.5 -262.5 22.5 -274.0L342 -684Q348.5 -692.5 357.75 -696.25Q367 -700 375.5 -700.0Q393 -700 404.0 -688.25Q415.0 -676.5 415.0 -659.5V-40.5Q415.0 -23.5 403.25 -11.75Q391.5 0.0 374.5 0.0Z\"/></svg>",
  "number-5.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"65.0 -694.5 433.0 699.0\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M236.5 4.5Q196.5 4.5 155.0 -8.25Q113.5 -21.0 83 -46Q74.5 -53.0 69.75 -63.75Q65.0 -74.5 65.0 -84.5Q65.0 -96.5 75.25 -108.0Q85.5 -119.5 103.0 -119.5Q116.0 -119.5 132.5 -107.0Q155 -90 181.75 -80.0Q208.5 -70.0 236 -70Q291.5 -70.0 332.5 -91.0Q373.5 -112.0 395.75 -150.0Q418 -188 418.0 -238.5Q418 -285 397.5 -319.25Q377.0 -353.5 340.5 -372.75Q304 -392 256.5 -392.0Q222 -392 194.5 -381.25Q167.0 -370.5 146.5 -359.5Q126.0 -348.5 111.0 -348.5Q92.0 -348.5 81.75 -357.25Q71.5 -366.0 68.5 -378.75Q65.5 -391.5 67 -403L106 -662Q108.5 -675.0 119.5 -684.75Q130.5 -694.5 147.0 -694.5H444.0Q460.0 -694.5 471.0 -683.5Q482.0 -672.5 482 -656Q482 -640 471.0 -629.25Q460.0 -618.5 444.0 -618.5H166.5L176.5 -627.5L140.0 -401.5L123.5 -423.0Q134.5 -433.0 157.25 -442.75Q180.0 -452.5 209.25 -459.5Q238.5 -466.5 269.5 -466.5Q335.0 -466.5 386.5 -437.25Q438 -408 468.0 -357.0Q498 -306 498 -240Q498.0 -166.5 465.75 -111.5Q433.5 -56.5 375.0 -26.0Q316.5 4.5 236.5 4.5Z\"/></svg>",
  "number-6.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"55.0 -715 455.5 725.0\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M286.5 10.0Q229.5 10.0 186.0 -11.5Q142.5 -33.0 113.5 -69.75Q84.5 -106.5 69.75 -152.75Q55 -199 55.0 -247.5Q55 -291 65.75 -344.0Q76.5 -397.0 99.25 -452.5Q122 -508 157.75 -558.75Q193.5 -609.5 243.5 -650.0Q293.5 -690.5 359.0 -712.5Q368 -715 375 -715Q391 -715 403.5 -706.25Q416.0 -697.5 416.0 -675.5Q416.0 -661.5 407.0 -651.0Q398.0 -640.5 382.5 -635.5Q343.0 -620.5 304.5 -592.0Q266.0 -563.5 233.25 -525.25Q200.5 -487.0 177.25 -442.25Q154.0 -397.5 144.5 -350.0L121.0 -341.5Q137.5 -369.0 163.5 -392.75Q189.5 -416.5 224.0 -431.5Q258.5 -446.5 300.0 -446.5Q343.5 -446.5 381.5 -427.75Q419.5 -409.0 448.5 -377.0Q477.5 -345.0 494.0 -303.5Q510.5 -262.0 510.5 -216.5Q510.5 -156.0 481.0 -104.25Q451.5 -52.5 401.0 -21.25Q350.5 10.0 286.5 10.0ZM285.5 -65.0Q327 -65 359.5 -84.5Q392 -104 410.75 -138.25Q429.5 -172.5 429.5 -216.5Q429.5 -258.0 412.75 -293.0Q396 -328 364.5 -349.5Q333 -371 288.5 -371.0Q242 -371 208.0 -349.75Q174.0 -328.5 155.25 -293.0Q136.5 -257.5 136.5 -214.5Q136.5 -175.0 154.75 -140.75Q173.0 -106.5 206.5 -85.75Q240 -65 285.5 -65.0Z\"/></svg>",
  "number-7.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"57.5 -694.5 440.0 698.0\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M185.0 3.5Q169.0 3.5 156.25 -7.25Q143.5 -18.0 143.5 -34.5Q143.5 -43.5 147.5 -53.0L406.0 -637.5L417.5 -619.5H95.5Q79.5 -619.5 68.5 -630.25Q57.5 -641.0 57.5 -657.5Q57.5 -673.5 68.5 -684.0Q79.5 -694.5 95.5 -694.5H456.5Q475.0 -694.5 486.25 -683.75Q497.5 -673.0 497.5 -656.0Q497.5 -646.5 493.5 -637.5L222.5 -22.0Q218 -10 207.5 -3.25Q197.0 3.5 185.0 3.5Z\"/></svg>",
  "number-8.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"50 -700 442.5 705\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M371 -353 368.5 -366.5Q404 -352 432.0 -326.0Q460 -300 476.25 -266.5Q492.5 -233.0 492.5 -194.0Q492.5 -139.5 463.0 -94.25Q433.5 -49.0 383.25 -22.0Q333 5 271 5Q209 5 159.0 -22.0Q109 -49 79.5 -94.25Q50.0 -139.5 50 -194Q50 -239 68.25 -273.0Q86.5 -307.0 115.25 -330.75Q144.0 -354.5 174.5 -368.5L169.5 -352.5Q143.5 -364.0 120.0 -385.25Q96.5 -406.5 81.5 -437.25Q66.5 -468.0 66.5 -506.5Q66.5 -561.0 93.75 -604.75Q121.0 -648.5 167.75 -674.25Q214.5 -700.0 271 -700Q328 -700 374.0 -674.25Q420.0 -648.5 447.25 -604.75Q474.5 -561.0 474.5 -506.5Q474.5 -466.0 458.75 -435.5Q443 -405 419.25 -384.5Q395.5 -364.0 371 -353ZM147.5 -505.5Q147.5 -470.0 164.25 -443.0Q181 -416 209.25 -400.5Q237.5 -385.0 271 -385Q304.5 -385.0 332.25 -400.5Q360 -416 376.75 -443.0Q393.5 -470.0 393.5 -505.5Q393.5 -558.0 359.0 -591.5Q324.5 -625.0 271 -625Q216.5 -625.0 182.0 -591.5Q147.5 -558.0 147.5 -505.5ZM271 -70Q332.5 -70.0 372.0 -105.75Q411.5 -141.5 411.5 -195.0Q411.5 -231.5 392.5 -260.25Q373.5 -289.0 341.5 -305.5Q309.5 -322.0 271 -322Q233 -322 201.0 -305.5Q169 -289 150.0 -260.25Q131.0 -231.5 131 -195Q131.0 -141.5 170.25 -105.75Q209.5 -70.0 271 -70Z\"/></svg>",
  "number-9.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"55 -711.5 455.5 722.5\" fill=\"currentColor\" stroke=\"none\" data-font=\"Quicksand\" data-weight=\"500\"><path d=\"M279.0 -711.5Q336.0 -711.5 379.5 -690.0Q423.0 -668.5 452.0 -631.75Q481 -595 495.75 -549.0Q510.5 -503.0 510.5 -454.0Q510.5 -410.5 499.75 -357.75Q489 -305 466.25 -250.0Q443.5 -195.0 407.75 -144.5Q372 -94 322.0 -53.75Q272.0 -13.5 206.5 8.5Q197.5 11.0 190.5 11.0Q174.5 11.0 162.0 1.0Q149.5 -9.0 149.5 -28.5Q149.5 -43.0 158.5 -53.25Q167.5 -63.5 183.0 -68.5Q236.5 -89.0 286.25 -131.5Q336 -174 372.5 -231.25Q409.0 -288.5 421.0 -351.5L444.5 -360.0Q428.5 -333.0 402.5 -309.25Q376.5 -285.5 342.25 -270.75Q308 -256 265.5 -256.0Q201 -256 153.75 -286.75Q106.5 -317.5 80.75 -369.5Q55.0 -421.5 55 -485Q55.0 -545.5 84.5 -597.0Q114.0 -648.5 164.75 -680.0Q215.5 -711.5 279.0 -711.5ZM280.0 -636.5Q238.5 -636.5 206.0 -617.0Q173.5 -597.5 154.75 -563.25Q136 -529 136 -485Q136 -443 152.25 -408.0Q168.5 -373.0 200.25 -352.25Q232.0 -331.5 277.0 -331.5Q323.5 -331.5 357.5 -352.5Q391.5 -373.5 410.25 -409.0Q429.0 -444.5 429 -487Q429.0 -527.5 410.75 -561.25Q392.5 -595.0 359.25 -615.75Q326.0 -636.5 280.0 -636.5Z\"/></svg>",
  "paintbrush.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m14.622 17.897-10.68-2.913\" />\n  <path d=\"M18.376 2.622a1 1 0 1 1 3.002 3.002L17.36 9.643a.5.5 0 0 0 0 .707l.944.944a2.41 2.41 0 0 1 0 3.408l-.944.944a.5.5 0 0 1-.707 0L8.354 7.348a.5.5 0 0 1 0-.707l.944-.944a2.41 2.41 0 0 1 3.408 0l.944.944a.5.5 0 0 0 .707 0z\" />\n  <path d=\"M9 8c-1.804 2.71-3.97 3.46-6.583 3.948a.507.507 0 0 0-.302.819l7.32 8.883a1 1 0 0 0 1.185.204C12.735 20.405 16 16.792 16 15\" />\n</svg>",
  "person-standing.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2.5\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <circle cx=\"12\" cy=\"5\" r=\"1\" />\n  <path d=\"m9 20 3-6 3 6\" />\n  <path d=\"m6 8 6 2 6-2\" />\n  <path d=\"M12 10v4\" />\n</svg>",
  "pill.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z\" />\n  <path d=\"m8.5 8.5 7 7\" />\n</svg>",
  "play-football.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"icon icon-tabler icons-tabler-outline icon-tabler-play-football\"><path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /><path d=\"M3 17l5 1l.75 -1.5\" /><path d=\"M14 21v-4l-4 -3l1 -6\" /><path d=\"M6 12v-3l5 -1l3 3l3 1\" /><path d=\"M18.007 19.5a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0 -3 0\" /><path d=\"M10.007 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" /></svg>",
  "plus.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\"><path d=\"M12 5v14M5 12h14\"/></svg>",
  "save.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"feather feather-save\"><path d=\"M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z\"></path><polyline points=\"17 21 17 13 7 13 7 21\"></polyline><polyline points=\"7 3 7 8 15 8\"></polyline></svg>",
  "settings.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"icon icon-tabler icons-tabler-outline icon-tabler-settings\"><path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /><path d=\"M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065\" /><path d=\"M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0\" /></svg>",
  "smartphone.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <rect width=\"14\" height=\"20\" x=\"5\" y=\"2\" rx=\"2\" ry=\"2\" />\n  <path d=\"M12 18h.01\" />\n</svg>",
  "smile.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2.5\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <circle cx=\"12\" cy=\"12\" r=\"10\" />\n  <path d=\"M8 14s1.5 2 4 2 4-2 4-2\" />\n  <line x1=\"9\" x2=\"9.01\" y1=\"9\" y2=\"9\" />\n  <line x1=\"15\" x2=\"15.01\" y1=\"9\" y2=\"9\" />\n</svg>",
  "sun.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <circle cx=\"12\" cy=\"12\" r=\"4\" />\n  <path d=\"M12 2v2\" />\n  <path d=\"M12 20v2\" />\n  <path d=\"m4.93 4.93 1.41 1.41\" />\n  <path d=\"m17.66 17.66 1.41 1.41\" />\n  <path d=\"M2 12h2\" />\n  <path d=\"M20 12h2\" />\n  <path d=\"m6.34 17.66-1.41 1.41\" />\n  <path d=\"m19.07 4.93-1.41 1.41\" />\n</svg>",
  "swimming.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"icon icon-tabler icons-tabler-outline icon-tabler-swimming\"><path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /><path d=\"M15 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /><path d=\"M6 11l4 -2l3.5 3l-1.5 2\" /><path d=\"M3 16.75a2.4 2.4 0 0 0 1 .25a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 2 -1a2.4 2.4 0 0 1 2 -1a2.4 2.4 0 0 1 2 1a2.4 2.4 0 0 0 2 1a2.4 2.4 0 0 0 1 -.25\" /></svg>",
  "target-arrow.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"icon icon-tabler icons-tabler-outline icon-tabler-target-arrow\"><path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /><path d=\"M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /><path d=\"M12 7a5 5 0 1 0 5 5\" /><path d=\"M13 3.055a9 9 0 1 0 7.941 7.945\" /><path d=\"M15 6v3h3l3 -3h-3v-3l-3 3\" /><path d=\"M15 9l-3 3\" /></svg>",
  "target.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M20.2 9a9 9 0 1 1-5.2-5.2M16.7 10a5 5 0 1 1-2.7-2.7M12 12l9-9m-4 0h4v4\"/></svg>",
  "thumbs-up.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"feather feather-thumbs-up\"><path d=\"M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3\"></path></svg>",
  "trash.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M10 11v6\" />\n  <path d=\"M14 11v6\" />\n  <path d=\"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6\" />\n  <path d=\"M3 6h18\" />\n  <path d=\"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2\" />\n</svg>",
  "walk.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"icon icon-tabler icons-tabler-outline icon-tabler-walk\"><path stroke=\"none\" d=\"M0 0h24v24H0z\" fill=\"none\" /><path d=\"M12 4a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" /><path d=\"M7 21l3 -4\" /><path d=\"M16 21l-2 -4l-3 -3l1 -6\" /><path d=\"M6 12l2 -3l4 -1l3 3l3 1\" /></svg>",
  "wifi.svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"feather feather-wifi\"><path d=\"M5 12.55a11 11 0 0 1 14.08 0\"></path><path d=\"M1.42 9a16 16 0 0 1 21.16 0\"></path><path d=\"M8.53 16.11a6 6 0 0 1 6.95 0\"></path><line x1=\"12\" y1=\"20\" x2=\"12.01\" y2=\"20\"></line></svg>",
  "lucide/alarm-clock.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <circle cx=\"12\" cy=\"13\" r=\"8\" />\n  <path d=\"M12 9v4l2 2\" />\n  <path d=\"M5 3 2 6\" />\n  <path d=\"m22 6-3-3\" />\n  <path d=\"M6.38 18.7 4 21\" />\n  <path d=\"M17.64 18.67 20 21\" />\n</svg>",
  "lucide/eye.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0\" />\n  <circle cx=\"12\" cy=\"12\" r=\"3\" />\n</svg>",
  "lucide/map-pin.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0\" />\n  <circle cx=\"12\" cy=\"10\" r=\"3\" />\n</svg>",
  "lucide/star.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z\" />\n</svg>",
  "lucide/pencil.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z\" />\n  <path d=\"m15 5 4 4\" />\n</svg>",
  "lucide/file-text.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z\" />\n  <path d=\"M14 2v5a1 1 0 0 0 1 1h5\" />\n  <path d=\"M10 9H8\" />\n  <path d=\"M16 13H8\" />\n  <path d=\"M16 17H8\" />\n</svg>",
  "lucide/square-pen.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7\" />\n  <path d=\"M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z\" />\n</svg>",
  "lucide/shopping-cart.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18\" />\n  <path d=\"M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25\" />\n  <circle cx=\"18\" cy=\"20\" r=\"2\" />\n  <circle cx=\"8\" cy=\"20\" r=\"2\" />\n</svg>",
  "lucide/bell.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M10.268 21a2 2 0 0 0 3.464 0\" />\n  <path d=\"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326\" />\n</svg>",
  "lucide/users-round.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M18 21a8 8 0 0 0-16 0\" />\n  <circle cx=\"10\" cy=\"8\" r=\"5\" />\n  <path d=\"M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3\" />\n</svg>",
  "lucide/message-circle.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719\" />\n</svg>",
  "lucide/camera.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z\" />\n  <circle cx=\"12\" cy=\"13\" r=\"3\" />\n</svg>",
  "lucide/briefcase-business.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 12h.01\" />\n  <path d=\"M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2\" />\n  <path d=\"M22 13a18.15 18.15 0 0 1-20 0\" />\n  <rect width=\"20\" height=\"14\" x=\"2\" y=\"6\" rx=\"2\" />\n</svg>",
  "lucide/circle-dollar-sign.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <circle cx=\"12\" cy=\"12\" r=\"10\" />\n  <path d=\"M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8\" />\n  <path d=\"M12 18V6\" />\n</svg>",
  "lucide/flame.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4\" />\n</svg>",
  "lucide/package.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z\" />\n  <path d=\"M12 22V12\" />\n  <polyline points=\"3.29 7 12 12 20.71 7\" />\n  <path d=\"m7.5 4.27 9 5.15\" />\n</svg>",
  "lucide/message-square.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z\" />\n</svg>",
  "lucide/wrench.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z\" />\n</svg>",
  "lucide/ban.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <circle cx=\"12\" cy=\"12\" r=\"10\" />\n  <path d=\"M4.929 4.929 19.07 19.071\" />\n</svg>",
  "lucide/clipboard-list.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <rect width=\"8\" height=\"4\" x=\"8\" y=\"2\" rx=\"1\" ry=\"1\" />\n  <path d=\"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2\" />\n  <path d=\"M12 11h4\" />\n  <path d=\"M12 16h4\" />\n  <path d=\"M8 11h.01\" />\n  <path d=\"M8 16h.01\" />\n</svg>",
  "lucide/dollar-sign.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <line x1=\"12\" x2=\"12\" y1=\"2\" y2=\"22\" />\n  <path d=\"M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6\" />\n</svg>",
  "lucide/messages-square.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z\" />\n  <path d=\"M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1\" />\n</svg>",
  "lucide/trophy.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2\" />\n  <path d=\"M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2\" />\n  <path d=\"M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3\" />\n  <path d=\"M4 22h16\" />\n  <path d=\"M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z\" />\n  <path d=\"M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3\" />\n</svg>",
  "lucide/notebook-pen.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4\" />\n  <path d=\"M2 6h4\" />\n  <path d=\"M2 10h4\" />\n  <path d=\"M2 14h4\" />\n  <path d=\"M2 18h4\" />\n  <path d=\"M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z\" />\n</svg>",
  "lucide/lock-keyhole.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <circle cx=\"12\" cy=\"16\" r=\"1\" />\n  <rect x=\"3\" y=\"10\" width=\"18\" height=\"12\" rx=\"2\" />\n  <path d=\"M7 10V7a5 5 0 0 1 10 0v3\" />\n</svg>",
  "lucide/video.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5\" />\n  <rect x=\"2\" y=\"6\" width=\"14\" height=\"12\" rx=\"2\" />\n</svg>",
  "lucide/paperclip.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551\" />\n</svg>",
  "lucide/calendar-clock.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M16 14v2.2l1.6 1\" />\n  <path d=\"M16 2v3\" />\n  <path d=\"M21 7.338V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h2.338\" />\n  <path d=\"M3 9h5.859\" />\n  <path d=\"M8 2v3\" />\n  <circle cx=\"16\" cy=\"16\" r=\"6\" />\n</svg>",
  "lucide/mic.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 19v3\" />\n  <path d=\"M19 10v2a7 7 0 0 1-14 0v-2\" />\n  <rect x=\"9\" y=\"2\" width=\"6\" height=\"13\" rx=\"3\" />\n</svg>",
  "lucide/gift.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 7v14\" />\n  <path d=\"M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8\" />\n  <path d=\"M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5\" />\n  <rect x=\"3\" y=\"7\" width=\"18\" height=\"4\" rx=\"1\" />\n</svg>",
  "lucide/pin.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 17v5\" />\n  <path d=\"M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z\" />\n</svg>",
  "lucide/rotate-cw.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8\" />\n  <path d=\"M21 3v5h-5\" />\n</svg>",
  "lucide/palette.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z\" />\n  <circle cx=\"13.5\" cy=\"6.5\" r=\".5\" fill=\"currentColor\" />\n  <circle cx=\"17.5\" cy=\"10.5\" r=\".5\" fill=\"currentColor\" />\n  <circle cx=\"6.5\" cy=\"12.5\" r=\".5\" fill=\"currentColor\" />\n  <circle cx=\"8.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />\n</svg>",
  "lucide/key-round.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z\" />\n  <circle cx=\"16.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />\n</svg>",
  "lucide/book-open-text.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 5v16\" />\n  <path d=\"M16 13h2\" />\n  <path d=\"M16 9h2\" />\n  <path d=\"M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z\" />\n  <path d=\"M6 13h2\" />\n  <path d=\"M6 9h2\" />\n</svg>",
  "lucide/timer.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <line x1=\"10\" x2=\"14\" y1=\"2\" y2=\"2\" />\n  <line x1=\"12\" x2=\"15\" y1=\"14\" y2=\"11\" />\n  <circle cx=\"12\" cy=\"14\" r=\"8\" />\n</svg>",
  "lucide/car.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2\" />\n  <circle cx=\"7\" cy=\"17\" r=\"2\" />\n  <path d=\"M9 17h6\" />\n  <circle cx=\"17\" cy=\"17\" r=\"2\" />\n</svg>",
  "lucide/hourglass.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M5 22h14\" />\n  <path d=\"M5 2h14\" />\n  <path d=\"M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22\" />\n  <path d=\"M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2\" />\n</svg>",
  "lucide/chart-line.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M3 3v16a2 2 0 0 0 2 2h16\" />\n  <path d=\"m19 9-5 5-4-4-3 3\" />\n</svg>",
  "lucide/earth.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M21.54 15H17a2 2 0 0 0-2 2v4.54\" />\n  <path d=\"M7 3.34V5a3 3 0 0 0 3 3a2 2 0 0 1 2 2c0 1.1.9 2 2 2a2 2 0 0 0 2-2c0-1.1.9-2 2-2h3.17\" />\n  <path d=\"M11 21.95V18a2 2 0 0 0-2-2a2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H2.05\" />\n  <circle cx=\"12\" cy=\"12\" r=\"10\" />\n</svg>",
  "lucide/list-checks.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M13 5h8\" />\n  <path d=\"M13 12h8\" />\n  <path d=\"M13 19h8\" />\n  <path d=\"m3 17 2 2 4-4\" />\n  <path d=\"m3 7 2 2 4-4\" />\n</svg>",
  "lucide/square-check.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <rect width=\"18\" height=\"18\" x=\"3\" y=\"3\" rx=\"2\" />\n  <path d=\"m16 9-5.5 5.5L8 12\" />\n</svg>",
  "lucide/calendar-check.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M8 2v3\" />\n  <path d=\"M16 2v3\" />\n  <rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\" />\n  <path d=\"M3 9h18\" />\n  <path d=\"m9 15 2 2 4-4\" />\n</svg>",
  "lucide/folder-open.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2\" />\n</svg>",
  "lucide/calculator.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <rect width=\"16\" height=\"20\" x=\"4\" y=\"2\" rx=\"2\" />\n  <line x1=\"8\" x2=\"16\" y1=\"6\" y2=\"6\" />\n  <line x1=\"16\" x2=\"16\" y1=\"14\" y2=\"18\" />\n  <path d=\"M16 10h.01\" />\n  <path d=\"M12 10h.01\" />\n  <path d=\"M8 10h.01\" />\n  <path d=\"M12 14h.01\" />\n  <path d=\"M8 14h.01\" />\n  <path d=\"M12 18h.01\" />\n  <path d=\"M8 18h.01\" />\n</svg>",
  "lucide/bell-ring.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M10.268 21a2 2 0 0 0 3.464 0\" />\n  <path d=\"M22 8c0-2.3-.8-4.3-2-6\" />\n  <path d=\"M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326\" />\n  <path d=\"M4 2C2.8 3.7 2 5.7 2 8\" />\n</svg>",
  "lucide/sprout.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3\" />\n  <path d=\"M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4\" />\n  <path d=\"M5 21h14\" />\n</svg>",
  "lucide/utensils.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2\" />\n  <path d=\"M7 2v20\" />\n  <path d=\"M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7\" />\n</svg>",
  "lucide/volume-2.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z\" />\n  <path d=\"M16 9a5 5 0 0 1 0 6\" />\n  <path d=\"M19.364 18.364a9 9 0 0 0 0-12.728\" />\n</svg>",
  "lucide/party-popper.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M5.8 11.3 2 22l10.7-3.79\" />\n  <path d=\"M4 3h.01\" />\n  <path d=\"M22 8h.01\" />\n  <path d=\"M15 2h.01\" />\n  <path d=\"M22 20h.01\" />\n  <path d=\"m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10\" />\n  <path d=\"m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17\" />\n  <path d=\"m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7\" />\n  <path d=\"M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z\" />\n</svg>",
  "lucide/monitor.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <rect width=\"20\" height=\"14\" x=\"2\" y=\"3\" rx=\"2\" />\n  <line x1=\"8\" x2=\"16\" y1=\"21\" y2=\"21\" />\n  <line x1=\"12\" x2=\"12\" y1=\"17\" y2=\"21\" />\n</svg>",
  "lucide/repeat.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m17 2 4 4-4 4\" />\n  <path d=\"M3 11v-1a4 4 0 0 1 4-4h14\" />\n  <path d=\"m7 22-4-4 4-4\" />\n  <path d=\"M21 13v1a4 4 0 0 1-4 4H3\" />\n</svg>",
  "lucide/heart-pulse.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5\" />\n  <path d=\"M3.22 13H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27\" />\n</svg>",
  "lucide/paw-print.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <circle cx=\"11\" cy=\"4\" r=\"2\" />\n  <circle cx=\"18\" cy=\"8\" r=\"2\" />\n  <circle cx=\"20\" cy=\"16\" r=\"2\" />\n  <path d=\"M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z\" />\n</svg>",
  "lucide/hammer.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9\" />\n  <path d=\"m18 15 4-4\" />\n  <path d=\"m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5\" />\n</svg>",
  "lucide/shirt.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z\" />\n</svg>",
  "lucide/clapperboard.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m12.296 3.464 3.02 3.956\" />\n  <path d=\"M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z\" />\n  <path d=\"M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\" />\n  <path d=\"m6.18 5.276 3.1 3.899\" />\n</svg>",
  "lucide/puzzle.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z\" />\n</svg>",
  "lucide/clock-4.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <circle cx=\"12\" cy=\"12\" r=\"10\" />\n  <path d=\"M12 6v6l4 2\" />\n</svg>",
  "lucide/gamepad-2.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <line x1=\"6\" x2=\"10\" y1=\"11\" y2=\"11\" />\n  <line x1=\"8\" x2=\"8\" y1=\"9\" y2=\"13\" />\n  <line x1=\"15\" x2=\"15.01\" y1=\"12\" y2=\"12\" />\n  <line x1=\"18\" x2=\"18.01\" y1=\"10\" y2=\"10\" />\n  <path d=\"M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z\" />\n</svg>",
  "lucide/laptop.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z\" />\n  <path d=\"M20.054 15.987H3.946\" />\n</svg>",
  "lucide/handbag.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M2.048 18.566A2 2 0 0 0 4 21h16a2 2 0 0 0 1.952-2.434l-2-9A2 2 0 0 0 18 8H6a2 2 0 0 0-1.952 1.566z\" />\n  <path d=\"M8 11V6a4 4 0 0 1 8 0v5\" />\n</svg>",
  "lucide/hamburger.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 16H4a2 2 0 1 1 0-4h16a2 2 0 1 1 0 4h-4.25\" />\n  <path d=\"M5 12a2 2 0 0 1-2-2 9 7 0 0 1 18 0 2 2 0 0 1-2 2\" />\n  <path d=\"M5 16a2 2 0 0 0-2 2 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 2 2 0 0 0-2-2q0 0 0 0\" />\n  <path d=\"m6.67 12 6.13 4.6a2 2 0 0 0 2.8-.4l3.15-4.2\" />\n</svg>",
  "lucide/droplet.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z\" />\n</svg>",
  "lucide/baby.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5\" />\n  <path d=\"M15 12h.01\" />\n  <path d=\"M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1\" />\n  <path d=\"M9 12h.01\" />\n</svg>",
  "lucide/biceps-flexed.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12.409 13.017A5 5 0 0 1 22 15c0 3.866-4 7-9 7-4.077 0-8.153-.82-10.371-2.462-.426-.316-.631-.832-.62-1.362C2.118 12.723 2.627 2 10 2a3 3 0 0 1 3 3 2 2 0 0 1-2 2c-1.105 0-1.64-.444-2-1\" />\n  <path d=\"M15 14a5 5 0 0 0-7.584 2\" />\n  <path d=\"M9.964 6.825C8.019 7.977 9.5 13 8 15\" />\n</svg>",
  "lucide/ruler.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z\" />\n  <path d=\"m14.5 12.5 2-2\" />\n  <path d=\"m11.5 9.5 2-2\" />\n  <path d=\"m8.5 6.5 2-2\" />\n  <path d=\"m17.5 15.5 2-2\" />\n</svg>",
  "lucide/shield-plus.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" />\n  <path d=\"M9 12h6\" />\n  <path d=\"M12 9v6\" />\n</svg>",
  "lucide/binoculars.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M10 10h4\" />\n  <path d=\"M19 7V4a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3\" />\n  <path d=\"M20 21a2 2 0 0 0 2-2v-3.851c0-1.39-2-2.962-2-4.829V8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v11a2 2 0 0 0 2 2z\" />\n  <path d=\"M 22 16 L 2 16\" />\n  <path d=\"M4 21a2 2 0 0 1-2-2v-3.851c0-1.39 2-2.962 2-4.829V8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2z\" />\n  <path d=\"M9 7V4a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v3\" />\n</svg>",
  "lucide/shuffle.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m18 14 4 4-4 4\" />\n  <path d=\"m18 2 4 4-4 4\" />\n  <path d=\"M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22\" />\n  <path d=\"M2 6h1.972a4 4 0 0 1 3.6 2.2\" />\n  <path d=\"M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45\" />\n</svg>",
  "lucide/cat.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z\" />\n  <path d=\"M8 14v.5\" />\n  <path d=\"M16 14v.5\" />\n  <path d=\"M11.25 16.25h1.5L12 17l-.75-.75Z\" />\n</svg>",
  "lucide/dog.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M11.25 16.25h1.5L12 17z\" />\n  <path d=\"M16 14v.5\" />\n  <path d=\"M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309\" />\n  <path d=\"M8 14v.5\" />\n  <path d=\"M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5\" />\n</svg>",
  "lucide/cooking-pot.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M2 12h20\" />\n  <path d=\"M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8\" />\n  <path d=\"m4 8 16-4\" />\n  <path d=\"m8.86 6.78-.45-1.81a2 2 0 0 1 1.45-2.43l1.94-.48a2 2 0 0 1 2.43 1.46l.45 1.8\" />\n</svg>",
  "lucide/bed-double.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8\" />\n  <path d=\"M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4\" />\n  <path d=\"M12 4v6\" />\n  <path d=\"M2 18h20\" />\n</svg>",
  "lucide/anchor.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 6v16\" />\n  <path d=\"m19 13 2-1a9 9 0 0 1-18 0l2 1\" />\n  <path d=\"M9 11h6\" />\n  <circle cx=\"12\" cy=\"4\" r=\"2\" />\n</svg>",
  "lucide/bird.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M16 7h.01\" />\n  <path d=\"M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20\" />\n  <path d=\"m20 7 2 .5-2 .5\" />\n  <path d=\"M10 18v3\" />\n  <path d=\"M14 17.75V21\" />\n  <path d=\"M7 18a6 6 0 0 0 3.84-10.61\" />\n</svg>",
  "lucide/recycle.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M7 19H4.815a1.83 1.83 0 0 1-1.57-.881 1.785 1.785 0 0 1-.004-1.784L7.196 9.5\" />\n  <path d=\"M11 19h8.203a1.83 1.83 0 0 0 1.556-.89 1.784 1.784 0 0 0 0-1.775l-1.226-2.12\" />\n  <path d=\"m14 16-3 3 3 3\" />\n  <path d=\"M8.293 13.596 7.196 9.5 3.1 10.598\" />\n  <path d=\"m9.344 5.811 1.093-1.892A1.83 1.83 0 0 1 11.985 3a1.784 1.784 0 0 1 1.546.888l3.943 6.843\" />\n  <path d=\"m13.378 9.633 4.096 1.098 1.097-4.096\" />\n</svg>",
  "lucide/flag-triangle-right.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M6 22V2.8a.8.8 0 0 1 1.17-.71l11.38 5.69a.8.8 0 0 1 0 1.44L6 15.5\" />\n</svg>",
  "lucide/venus.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 15v7\" />\n  <path d=\"M9 19h6\" />\n  <circle cx=\"12\" cy=\"9\" r=\"6\" />\n</svg>",
  "lucide/mars.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M16 3h5v5\" />\n  <path d=\"m21 3-6.75 6.75\" />\n  <circle cx=\"10\" cy=\"14\" r=\"6\" />\n</svg>",
  "lucide/chevrons-left-right.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m9 7-5 5 5 5\" />\n  <path d=\"m15 7 5 5-5 5\" />\n</svg>",
  "lucide/syringe.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m18 2 4 4\" />\n  <path d=\"m17 7 3-3\" />\n  <path d=\"M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5\" />\n  <path d=\"m9 11 4 4\" />\n  <path d=\"m5 19-3 3\" />\n  <path d=\"m14 4 6 6\" />\n</svg>",
  "lucide/banana.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M4 13c3.5-2 8-2 10 2a5.5 5.5 0 0 1 8 5\" />\n  <path d=\"M5.15 17.89c5.52-1.52 8.65-6.89 7-12C11.55 4 11.5 2 13 2c3.22 0 5 5.5 5 8 0 6.5-4.2 12-10.49 12C5.11 22 2 22 2 20c0-1.5 1.14-1.55 3.15-2.11Z\" />\n</svg>",
  "lucide/glasses.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <circle cx=\"6\" cy=\"15\" r=\"4\" />\n  <circle cx=\"18\" cy=\"15\" r=\"4\" />\n  <path d=\"M14 15a2 2 0 0 0-2-2 2 2 0 0 0-2 2\" />\n  <path d=\"M2.5 13 5 7c.7-1.3 1.4-2 3-2\" />\n  <path d=\"M21.5 13 19 7c-.7-1.3-1.5-2-3-2\" />\n</svg>",
  "lucide/fish.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z\" />\n  <path d=\"M18 12v.5\" />\n  <path d=\"M16 17.93a9.77 9.77 0 0 1 0-11.86\" />\n  <path d=\"M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33\" />\n  <path d=\"M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4\" />\n  <path d=\"m16.01 17.93-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98\" />\n</svg>",
  "lucide/soup.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M11.248 3c.273.1.808.53.747 1.36-.05.83-.938 1.2-.989 2.02-.06.78.333 1.24.727 1.62\" />\n  <path d=\"M16.252 3c.268.1.794.53.745 1.36-.06.83-.923 1.2-.993 2.02-.05.78.338 1.24.725 1.62\" />\n  <path d=\"M19.5 12 22 6\" />\n  <path d=\"M4 12a1 1 0 00-.99 1.133A9 9 0 0012 21a9 9 0 008.99-7.867A1 1 0 0020 12z\" />\n  <path d=\"M6.252 3c.268.1.794.53.745 1.36-.06.83-.923 1.2-.993 2.02-.05.78.338 1.24.735 1.62\" />\n  <path d=\"M7 21h10\" />\n</svg>",
  "lucide/sun-medium.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <circle cx=\"12\" cy=\"12\" r=\"4\" />\n  <path d=\"M12 3v1\" />\n  <path d=\"M12 20v1\" />\n  <path d=\"M3 12h1\" />\n  <path d=\"M20 12h1\" />\n  <path d=\"m18.364 5.636-.707.707\" />\n  <path d=\"m6.343 17.657-.707.707\" />\n  <path d=\"m5.636 5.636.707.707\" />\n  <path d=\"m17.657 17.657.707.707\" />\n</svg>",
  "lucide/bath.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M10 4 8 6\" />\n  <path d=\"M17 19v2\" />\n  <path d=\"M2 12h20\" />\n  <path d=\"M7 19v2\" />\n  <path d=\"M9 5 7.621 3.621A2.121 2.121 0 0 0 4 5v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5\" />\n</svg>",
  "lucide/wine.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M8 22h8\" />\n  <path d=\"M7 10h10\" />\n  <path d=\"M12 15v7\" />\n  <path d=\"M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z\" />\n</svg>",
  "lucide/pizza.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m12 14-1 1\" />\n  <path d=\"m13.75 18.25-1.25 1.42\" />\n  <path d=\"M17.775 5.654a15.68 15.68 0 0 0-12.121 12.12\" />\n  <path d=\"M18.8 9.3a1 1 0 0 0 2.1 7.7\" />\n  <path d=\"M21.964 20.732a1 1 0 0 1-1.232 1.232l-18-5a1 1 0 0 1-.695-1.232A19.68 19.68 0 0 1 15.732 2.037a1 1 0 0 1 1.232.695z\" />\n</svg>",
  "lucide/bone.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z\" />\n</svg>",
  "lucide/toilet.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M7 12h13a1 1 0 0 1 1 1 5 5 0 0 1-5 5h-.598a.5.5 0 0 0-.424.765l1.544 2.47a.5.5 0 0 1-.424.765H5.402a.5.5 0 0 1-.424-.765L7 18\" />\n  <path d=\"M8 18a5 5 0 0 1-5-5V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8\" />\n</svg>",
  "lucide/beer.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M17 11h1a3 3 0 0 1 0 6h-1\" />\n  <path d=\"M9 12v6\" />\n  <path d=\"M13 12v6\" />\n  <path d=\"M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z\" />\n  <path d=\"M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8\" />\n</svg>",
  "lucide/chess-knight.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M5 20a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z\" />\n  <path d=\"M16.5 18c1-2 2.5-5 2.5-9a7 7 0 0 0-7-7H6.635a1 1 0 0 0-.768 1.64L7 5l-2.32 5.802a2 2 0 0 0 .95 2.526l2.87 1.456\" />\n  <path d=\"m15 5 1.425-1.425\" />\n  <path d=\"m17 8 1.53-1.53\" />\n  <path d=\"M9.713 12.185 7 18\" />\n</svg>",
  "lucide/carrot.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M15 16a1 1 0 0 0-7-7q-4 4-5.987 12.385a.5.5 0 0 0 .602.602Q11 20 15 16l-3-3\" />\n  <path d=\"M15 9q4 4 7 0-3-4-7 0 4-4 0-7-4 3 0 7\" />\n  <path d=\"m8 15-2.58-2.58\" />\n</svg>",
  "lucide/music-4.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M9 18V5l12-2v13\" />\n  <path d=\"m9 9 12-2\" />\n  <circle cx=\"6\" cy=\"18\" r=\"3\" />\n  <circle cx=\"18\" cy=\"16\" r=\"3\" />\n</svg>",
  "lucide/guitar.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m11.9 12.1 4.514-4.514\" />\n  <path d=\"M20.1 2.3a1 1 0 0 0-1.4 0l-1.114 1.114A2 2 0 0 0 17 4.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 17.828 7h1.344a2 2 0 0 0 1.414-.586L21.7 5.3a1 1 0 0 0 0-1.4z\" />\n  <path d=\"m6 16 2 2\" />\n  <path d=\"M8.23 9.85A3 3 0 0 1 11 8a5 5 0 0 1 5 5 3 3 0 0 1-1.85 2.77l-.92.38A2 2 0 0 0 12 18a4 4 0 0 1-4 4 6 6 0 0 1-6-6 4 4 0 0 1 4-4 2 2 0 0 0 1.85-1.23z\" />\n</svg>",
  "lucide/volume-1.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z\" />\n  <path d=\"M16 9a5 5 0 0 1 0 6\" />\n</svg>",
  "lucide/fire-extinguisher.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M15 6.5V3a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v3.5\" />\n  <path d=\"M9 18h8\" />\n  <path d=\"M18 3h-3\" />\n  <path d=\"M11 3a6 6 0 0 0-6 6v11\" />\n  <path d=\"M5 13h4\" />\n  <path d=\"M17 10a4 4 0 0 0-8 0v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2Z\" />\n</svg>",
  "lucide/drum.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m2 2 8 8\" />\n  <path d=\"m22 2-8 8\" />\n  <ellipse cx=\"12\" cy=\"9\" rx=\"10\" ry=\"5\" />\n  <path d=\"M7 13.4v7.9\" />\n  <path d=\"M12 14v8\" />\n  <path d=\"M17 13.4v7.9\" />\n  <path d=\"M2 9v8a10 5 0 0 0 20 0V9\" />\n</svg>",
  "lucide/sailboat.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M10 2v15\" />\n  <path d=\"M7 22a4 4 0 0 1-4-4 1 1 0 0 1 1-1h16a1 1 0 0 1 1 1 4 4 0 0 1-4 4z\" />\n  <path d=\"M9.159 2.46a1 1 0 0 1 1.521-.193l9.977 8.98A1 1 0 0 1 20 13H4a1 1 0 0 1-.824-1.567z\" />\n</svg>",
  "lucide/candy.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M10 7v10.9\" />\n  <path d=\"M14 6.1V17\" />\n  <path d=\"M16 7V3a1 1 0 0 1 1.707-.707 2.5 2.5 0 0 0 2.152.717 1 1 0 0 1 1.131 1.131 2.5 2.5 0 0 0 .717 2.152A1 1 0 0 1 21 8h-4\" />\n  <path d=\"M16.536 7.465a5 5 0 0 0-7.072 0l-2 2a5 5 0 0 0 0 7.07 5 5 0 0 0 7.072 0l2-2a5 5 0 0 0 0-7.07\" />\n  <path d=\"M8 17v4a1 1 0 0 1-1.707.707 2.5 2.5 0 0 0-2.152-.717 1 1 0 0 1-1.131-1.131 2.5 2.5 0 0 0-.717-2.152A1 1 0 0 1 3 16h4\" />\n</svg>",
  "lucide/lamp-desk.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M10.293 2.293a1 1 0 0 1 1.414 0l2.5 2.5 5.994 1.227a1 1 0 0 1 .506 1.687l-7 7a1 1 0 0 1-1.687-.506l-1.227-5.994-2.5-2.5a1 1 0 0 1 0-1.414z\" />\n  <path d=\"m14.207 4.793-3.414 3.414\" />\n  <path d=\"M3 20a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z\" />\n  <path d=\"m9.086 6.5-4.793 4.793a1 1 0 0 0-.18 1.17L7 18\" />\n</svg>",
  "lucide/flask-round.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M10 2v6.292a7 7 0 1 0 4 0V2\" />\n  <path d=\"M5 15h14\" />\n  <path d=\"M8.5 2h7\" />\n</svg>",
  "lucide/ham.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M13.144 21.144A7.274 10.445 45 1 0 2.856 10.856\" />\n  <path d=\"M13.144 21.144A7.274 4.365 45 0 0 2.856 10.856a7.274 4.365 45 0 0 10.288 10.288\" />\n  <path d=\"M16.565 10.435 18.6 8.4a2.501 2.501 0 1 0 1.65-4.65 2.5 2.5 0 1 0-4.66 1.66l-2.024 2.025\" />\n  <path d=\"m8.5 16.5-1-1\" />\n</svg>",
  "lucide/lamp.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 12v6\" />\n  <path d=\"M4.077 10.615A1 1 0 0 0 5 12h14a1 1 0 0 0 .923-1.385l-3.077-7.384A2 2 0 0 0 15 2H9a2 2 0 0 0-1.846 1.23Z\" />\n  <path d=\"M8 20a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z\" />\n</svg>",
  "lucide/playing-cards-fan.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12.65 7.65a2 2 0 012.629-1.046l5.51 2.374a2 2 0 011.046 2.628l-3.957 9.184a2 2 0 01-2.628 1.046l-5.51-2.374a2 2 0 01-1.046-2.628z\" />\n  <path d=\"M18 7.777V4a2 2 0 00-2-2h-6a2 2 0 00-2 2v10a2 2 0 001.137 1.805\" />\n  <path d=\"m8 4.389-4.364.809a2 2 0 00-1.602 2.33l1.822 9.833a2 2 0 002.331 1.602l2.542-.47\" />\n</svg>",
  "lucide/broom.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M13.5 10.5 22 2\" />\n  <path d=\"M14.734 13.841a2 2 0 00-.314-2.42L12.58 9.58a2 2 0 00-2.421-.314l-7.657 4.461A1 1 0 002.3 15.3l6.403 6.403a1 1 0 001.571-.204z\" />\n  <path d=\"m5 18 2-2\" />\n  <path d=\"m7.699 10.7 5.602 5.601\" />\n</svg>",
  "lucide/stretch-vertical.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <rect width=\"6\" height=\"20\" x=\"4\" y=\"2\" rx=\"2\" />\n  <rect width=\"6\" height=\"20\" x=\"14\" y=\"2\" rx=\"2\" />\n</svg>",
  "lucide/lollipop.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <circle cx=\"11\" cy=\"11\" r=\"8\" />\n  <path d=\"m21 21-4.3-4.3\" />\n  <path d=\"M11 11a2 2 0 0 0 4 0 4 4 0 0 0-8 0 6 6 0 0 0 12 0\" />\n</svg>",
  "lucide/search.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m21 21-4.34-4.34\" />\n  <circle cx=\"11\" cy=\"11\" r=\"8\" />\n</svg>",
  "lucide/house.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8\" />\n  <path d=\"M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\" />\n</svg>",
  "lucide/mail.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7\" />\n  <rect x=\"2\" y=\"4\" width=\"20\" height=\"16\" rx=\"2\" />\n</svg>",
  "lucide/triangle-alert.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3\" />\n  <path d=\"M12 9v4\" />\n  <path d=\"M12 17h.01\" />\n</svg>",
  "lucide/shield-check.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\" />\n  <path d=\"m9 12 2 2 4-4\" />\n</svg>",
  "lucide/globe.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <circle cx=\"12\" cy=\"12\" r=\"10\" />\n  <path d=\"M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20\" />\n  <path d=\"M2 12h20\" />\n</svg>",
  "lucide/send.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z\" />\n  <path d=\"m21.854 2.147-10.94 10.939\" />\n</svg>",
  "lucide/user-round.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <circle cx=\"12\" cy=\"8\" r=\"5\" />\n  <path d=\"M20 21a8 8 0 0 0-16 0\" />\n</svg>",
  "lucide/zap.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z\" />\n</svg>",
  "lucide/bot.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 8V4H8\" />\n  <rect width=\"16\" height=\"12\" x=\"4\" y=\"8\" rx=\"2\" />\n  <path d=\"M2 14h2\" />\n  <path d=\"M20 14h2\" />\n  <path d=\"M15 13v2\" />\n  <path d=\"M9 13v2\" />\n</svg>",
  "lucide/refresh-cw.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8\" />\n  <path d=\"M21 3v5h-5\" />\n  <path d=\"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16\" />\n  <path d=\"M8 16H3v5\" />\n</svg>",
  "lucide/rocket.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5\" />\n  <path d=\"M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09\" />\n  <path d=\"M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z\" />\n  <path d=\"M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05\" />\n</svg>",
  "lucide/chart-no-axes-combined.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12 16v5\" />\n  <path d=\"M16 14.639V21\" />\n  <path d=\"M20 10.656V21\" />\n  <path d=\"m22 3-8.646 8.646a.5.5 0 0 1-.708 0L9.354 8.354a.5.5 0 0 0-.707 0L2 15\" />\n  <path d=\"M4 18.463V21\" />\n  <path d=\"M8 14.656V21\" />\n</svg>",
  "lucide/flag.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528\" />\n</svg>",
  "lucide/megaphone.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z\" />\n  <path d=\"M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14\" />\n  <path d=\"M8 6v8\" />\n</svg>",
  "lucide/tag.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z\" />\n  <circle cx=\"7.5\" cy=\"7.5\" r=\".5\" fill=\"currentColor\" />\n</svg>",
  "lucide/gem.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M10.5 3 8 9l4 13 4-13-2.5-6\" />\n  <path d=\"M17 3a2 2 0 0 1 1.6.8l3 4a2 2 0 0 1 .013 2.382l-7.99 10.986a2 2 0 0 1-3.247 0l-7.99-10.986A2 2 0 0 1 2.4 7.8l2.998-3.997A2 2 0 0 1 7 3z\" />\n  <path d=\"M2 9h20\" />\n</svg>",
  "lucide/book-text.svg": "<svg\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20\" />\n  <path d=\"M8 11h8\" />\n  <path d=\"M8 7h6\" />\n</svg>"
});
const HABIT_ICON_BOUNDS = Object.freeze({"apple.svg":[1.125,1.125,21.7502,21.7507],"baguette.svg":[2.1245,2.1248,19.7502,19.7485],"ball-basketball.svg":[2.125,2.1219,19.75,19.7562],"bar-chart.svg":[2.125,2.125,19.75,19.75],"bed.svg":[1.125,3.125,21.75,17.75],"bike.svg":[1.125,3.125,21.75,18.75],"book-open.svg":[1.125,2.125,21.75,19.75],"brain.svg":[1.1252,1.1249,21.7496,21.7459],"cannabis.svg":[3.125,1.125,17.75,21.75],"check.svg":[4.125,5.125,15.75,11.75],"clock.svg":[1.125,1.125,21.75,21.75],"close.svg":[5.125,5.125,13.75,13.75],"coffee.svg":[2.125,1.125,20.75,20.75],"cooking.svg":[2.125,1.125,20.75,19.75],"cross-symbol.svg":[4.125,2.125,15.75,19.75],"cross.svg":[5.125,5.125,13.75,13.75],"cut.svg":[3.125,3.125,17.75,17.75],"droplets.svg":[2.125,2.145,19.7501,20.7589],"dumbbell.svg":[-0.18870848417282104,-0.18870848417282104,24.377418518066406,24.377418518066406],"edit.svg":[1.125,1.0028,21.8722,21.8722],"flower-2.svg":[4.125,1.125,15.75,21.75],"footprints.svg":[2.1244,1.125,19.7513,21.75],"headphones.svg":[2.125,2.1281,19.75,19.7469],"heart.svg":[1.125,3.1088,21.7501,18.7658],"instagram.svg":[1.125,1.125,21.75,21.75],"leaf.svg":[1.125,1.1252,20.75,20.7498],"letter-a.svg":[22.416666666666668,-703.1290322580645,599.0833333333334,705.6290322580645],"letter-b.svg":[87.5,-700,520,700],"letter-c.svg":[45,-707.5,567.4206349206349,717.5],"letter-d.svg":[87.5,-700,585,700],"letter-e.svg":[87.5,-700,437,700],"letter-f.svg":[87.5,-700,432,700],"letter-g.svg":[45,-710,595,720],"letter-h.svg":[87.5,-700,544.5,700],"letter-i.svg":[87.5,-700,83.5,700],"letter-j.svg":[57.5,-700,420,710],"letter-k.svg":[87.5,-700.5,539.5,703],"letter-l.svg":[87.5,-700,427,700],"letter-m.svg":[87.5,-700.55,649,700.55],"letter-n.svg":[87.5,-700,555,700],"letter-o.svg":[45,-710,673.5,720],"letter-p.svg":[87.5,-700,468.5,700],"letter-q.svg":[45,-710,743.5,892.5],"letter-r.svg":[87.5,-700,543.0636363636364,700],"letter-s.svg":[37.5,-710,490.5,720.010989010989],"letter-t.svg":[32.5,-700,546,700],"letter-u.svg":[87.5,-700.5,535,708],"letter-v.svg":[33,-701.5,603.5,701.5],"letter-w.svg":[25.5,-702.5,907.5,702.5],"letter-x.svg":[38,-703,546.5,707],"letter-y.svg":[18.5,-703.5,535.5,703.5],"letter-z.svg":[47.5,-700,555.5,700],"medal.svg":[1.5162,1.125,20.9634,21.75],"moon.svg":[2.1231,2.1383,19.7376,19.7376],"music.svg":[2.125,2.125,19.75,19.75],"number-1.svg":[22.5,-700.1111111111111,251,700.1111111111111],"number-2.svg":[57.5,-710,449,710],"number-3.svg":[45,-695,431.5,705],"number-4.svg":[12.5,-700,507,700],"number-5.svg":[65,-694.5,433,699],"number-6.svg":[55,-715,455.5,725],"number-7.svg":[57.5,-694.5,440,698],"number-8.svg":[50,-700,442.5,705],"number-9.svg":[55,-711.5,455.5,722.5],"paintbrush.svg":[1.1261,1.1242,21.7497,21.7153],"person-standing.svg":[5.125,3.125,13.75,17.75],"pill.svg":[1.1396,1.1396,21.7208,21.7208],"play-football.svg":[2.125,2.125,19.757,19.75],"plus.svg":[4.125,4.125,15.75,15.75],"save.svg":[2.125,2.125,19.75,19.75],"settings.svg":[2.125,2.125,19.75,19.75],"smartphone.svg":[4.125,1.125,15.75,21.75],"smile.svg":[1.125,1.125,21.75,21.75],"sun.svg":[1.125,1.125,21.75,21.75],"swimming.svg":[2.125,7.125,19.75,10.7505],"target-arrow.svg":[2.1216,2.1239,19.7534,19.75],"target.svg":[1.9164,2.125,19.9586,19.9586],"thumbs-up.svg":[1.125,1.125,21.4326,21.7501],"trash.svg":[2.125,1.125,19.75,21.75],"walk.svg":[5.125,2.125,13.75,19.75],"wifi.svg":[0.545,4.1277,22.91,16.7473],"lucide/alarm-clock.svg":[1.125,2.125,21.75,19.75],"lucide/eye.svg":[1.1245,4.1256,21.751,15.7488],"lucide/map-pin.svg":[3.125,1.125,17.75,21.7498],"lucide/star.svg":[1.1232,1.1251,21.7518,20.8221],"lucide/pencil.svg":[1.1251,1.1246,21.7498,21.7495],"lucide/file-text.svg":[3.125,1.125,17.75,21.75],"lucide/square-pen.svg":[2.125,1.1294,20.7456,20.7456],"lucide/shopping-cart.svg":[1.175,1.1467,21.7,21.7283],"lucide/bell.svg":[2.1257,1.125,19.7496,21.7499],"lucide/users-round.svg":[1.125,2.125,21.75,19.75],"lucide/message-circle.svg":[1.1253,1.1253,21.75,21.7501],"lucide/camera.svg":[1.125,3.125,21.75,17.75],"lucide/briefcase-business.svg":[1.125,1.125,21.75,19.75],"lucide/circle-dollar-sign.svg":[1.125,1.125,21.75,21.75],"lucide/flame.svg":[4.125,2.125,15.75,20.75],"lucide/package.svg":[2.125,1.1271,19.75,21.7479],"lucide/message-square.svg":[1.125,2.125,21.75,20.7459],"lucide/wrench.svg":[1.1245,1.1213,21.7542,21.7547],"lucide/ban.svg":[1.125,1.125,21.75,21.75],"lucide/clipboard-list.svg":[3.125,1.125,17.75,21.75],"lucide/dollar-sign.svg":[5.125,1.125,13.75,21.75],"lucide/messages-square.svg":[1.125,1.125,21.75,21.7459],"lucide/trophy.svg":[1.125,1.125,21.75,21.75],"lucide/notebook-pen.svg":[1.125,1.1249,21.7501,21.7501],"lucide/lock-keyhole.svg":[2.125,1.125,19.75,21.75],"lucide/video.svg":[1.125,5.125,21.75,13.75],"lucide/paperclip.svg":[2.126,1.1254,20.406,21.7496],"lucide/calendar-clock.svg":[2.125,1.125,20.75,21.75],"lucide/mic.svg":[4.125,1.125,15.75,21.75],"lucide/gift.svg":[2.125,1.1246,19.75,20.7504],"lucide/pin.svg":[4.125,1.125,15.75,21.75],"lucide/rotate-cw.svg":[2.125,2.125,19.75,19.75],"lucide/palette.svg":[1.125,1.125,21.75,21.75],"lucide/key-round.svg":[1.125,1.0868,21.7882,21.7882],"lucide/book-open-text.svg":[1.125,2.125,21.75,19.75],"lucide/timer.svg":[3.125,1.125,17.75,21.75],"lucide/car.svg":[1.125,6.125,21.75,13.75],"lucide/hourglass.svg":[4.125,1.125,15.75,21.75],"lucide/chart-line.svg":[2.125,2.125,19.75,19.75],"lucide/earth.svg":[1.125,1.125,21.75,21.75],"lucide/list-checks.svg":[2.125,4.125,19.75,15.75],"lucide/square-check.svg":[2.125,2.125,19.75,19.75],"lucide/calendar-check.svg":[2.125,1.125,19.75,20.75],"lucide/folder-open.svg":[1.125,2.1249,21.7535,18.7501],"lucide/calculator.svg":[3.125,1.125,17.75,21.75],"lucide/bell-ring.svg":[1.125,1.125,21.75,21.7499],"lucide/sprout.svg":[3.125,2.125,17.75,19.75],"lucide/utensils.svg":[2.125,1.125,19.75,21.75],"lucide/volume-2.svg":[1.125,3.123,21.7501,17.756],"lucide/party-popper.svg":[1.125,1.125,21.76,21.75],"lucide/monitor.svg":[1.125,2.125,21.75,19.75],"lucide/repeat.svg":[2.125,1.125,19.75,21.75],"lucide/heart-pulse.svg":[1.125,3.1088,21.7501,18.7658],"lucide/paw-print.svg":[1.1311,1.125,21.7439,21.7489],"lucide/hammer.svg":[1.1298,2.125,21.7452,20.7447],"lucide/shirt.svg":[1.3772,1.125,21.2457,21.75],"lucide/clapperboard.svg":[1.1475,1.1475,20.7275,20.7275],"lucide/puzzle.svg":[1.1242,1.1249,21.7517,21.7502],"lucide/clock-4.svg":[1.125,1.125,21.75,21.75],"lucide/gamepad-2.svg":[1.125,4.125,21.75,15.75],"lucide/laptop.svg":[1.738,4.125,20.524,16.75],"lucide/handbag.svg":[1.1253,1.125,21.7493,20.75],"lucide/hamburger.svg":[1.125,2.1274,21.75,19.7476],"lucide/droplet.svg":[4.125,2.125,15.75,20.75],"lucide/baby.svg":[1.1968,2.125,21.6064,19.6632],"lucide/biceps-flexed.svg":[1.1336,1.125,21.7414,21.75],"lucide/ruler.svg":[1.1232,1.1232,21.7576,21.7577],"lucide/shield-plus.svg":[3.125,1.1246,17.75,21.7533],"lucide/binoculars.svg":[1.125,2.125,21.75,19.75],"lucide/shuffle.svg":[1.125,1.125,21.75,21.75],"lucide/cat.svg":[2.1147,1.9416,19.7603,19.9334],"lucide/dog.svg":[1.6182,2.0713,21.0306,19.8037],"lucide/cooking-pot.svg":[1.125,1.1245,21.75,21.7505],"lucide/bed-double.svg":[1.125,3.125,21.75,17.75],"lucide/anchor.svg":[2.125,1.125,19.75,21.75],"lucide/bird.svg":[1.125,2.1144,21.75,19.7606],"lucide/recycle.svg":[2.1291,2.125,19.7413,20.75],"lucide/flag-triangle-right.svg":[5.125,1.1243,14.7513,21.7507],"lucide/venus.svg":[5.125,2.125,13.75,20.75],"lucide/mars.svg":[3.125,2.125,18.75,18.75],"lucide/chevrons-left-right.svg":[3.125,6.125,17.75,11.75],"lucide/syringe.svg":[1.125,1.125,21.75,21.75],"lucide/banana.svg":[1.125,1.125,21.7509,21.75],"lucide/glasses.svg":[1.125,4.125,21.75,15.75],"lucide/fish.svg":[1.124,2.125,21.751,19.75],"lucide/soup.svg":[2.1261,2.125,20.7489,19.7502],"lucide/sun-medium.svg":[2.125,2.125,19.75,19.75],"lucide/bath.svg":[1.125,2.1213,21.75,19.7537],"lucide/wine.svg":[6.125,1.125,11.75,21.75],"lucide/pizza.svg":[1.1252,1.1252,21.7506,21.7506],"lucide/bone.svg":[1.125,1.125,21.75,21.75],"lucide/toilet.svg":[2.125,1.125,19.75,21.75],"lucide/beer.svg":[2.125,1.125,19.75,21.75],"lucide/chess-knight.svg":[3.6617,1.125,16.2133,21.75],"lucide/carrot.svg":[1.1245,1.125,21.7505,21.7505],"lucide/music-4.svg":[2.125,2.125,19.75,19.75],"lucide/guitar.svg":[1.125,1.1391,21.7359,21.7359],"lucide/volume-1.svg":[1.125,3.123,16.75,17.756],"lucide/fire-extinguisher.svg":[4.125,1.125,14.75,21.75],"lucide/drum.svg":[1.125,1.125,21.75,21.75],"lucide/sailboat.svg":[2.1247,1.125,19.7503,21.75],"lucide/candy.svg":[1.1252,1.1252,21.7496,21.7496],"lucide/lamp-desk.svg":[2.125,1.1252,19.7502,21.7498],"lucide/flask-round.svg":[4.125,1.125,15.75,21.7502],"lucide/ham.svg":[1.127,0.8625,22.0612,22.0105],"lucide/lamp.svg":[3.1249,1.125,17.7502,21.75],"lucide/playing-cards-fan.svg":[1.1257,1.125,21.7474,21.7491],"lucide/broom.svg":[1.1303,1.125,21.7447,21.7457],"lucide/stretch-vertical.svg":[3.125,1.125,17.75,21.75],"lucide/lollipop.svg":[2.125,2.125,19.75,19.75],"lucide/search.svg":[2.125,2.125,19.75,19.75],"lucide/house.svg":[2.125,1.1245,19.75,20.7505],"lucide/mail.svg":[1.125,3.125,21.75,17.75],"lucide/triangle-alert.svg":[1.107,2.1111,21.7659,19.764],"lucide/shield-check.svg":[3.125,1.1246,17.75,21.7533],"lucide/globe.svg":[1.125,1.125,21.75,21.75],"lucide/send.svg":[1.1252,1.1225,21.7523,21.7523],"lucide/user-round.svg":[3.125,2.125,17.75,19.75],"lucide/zap.svg":[3.1253,1.1258,17.7494,21.7484],"lucide/bot.svg":[1.125,3.125,21.75,17.75],"lucide/refresh-cw.svg":[2.125,2.125,19.75,19.75],"lucide/rocket.svg":[1.625,1.1248,21.25,21.2502],"lucide/chart-no-axes-combined.svg":[1.125,2.125,21.75,19.75],"lucide/flag.svg":[3.125,1.125,17.75,21.75],"lucide/megaphone.svg":[2.125,2.125,19.75,20.7492],"lucide/tag.svg":[1.125,1.125,21.7451,21.7451],"lucide/gem.svg":[1.1247,2.125,21.7503,20.75],"lucide/book-text.svg":[3.125,1.125,17.75,21.75]});
const LUCIDE_ICON_OPTIONS = Object.freeze([
  {
    "icon": "lucide/alarm-clock.svg",
    "name": "alarm clock"
  },
  {
    "icon": "lucide/eye.svg",
    "name": "eye"
  },
  {
    "icon": "lucide/map-pin.svg",
    "name": "map pin"
  },
  {
    "icon": "lucide/star.svg",
    "name": "star"
  },
  {
    "icon": "lucide/pencil.svg",
    "name": "pencil"
  },
  {
    "icon": "lucide/file-text.svg",
    "name": "file text"
  },
  {
    "icon": "lucide/square-pen.svg",
    "name": "square pen"
  },
  {
    "icon": "trash.svg",
    "name": "trash"
  },
  {
    "icon": "heart.svg",
    "name": "heart"
  },
  {
    "icon": "lucide/shopping-cart.svg",
    "name": "shopping cart"
  },
  {
    "icon": "lucide/bell.svg",
    "name": "bell"
  },
  {
    "icon": "lucide/users-round.svg",
    "name": "users round"
  },
  {
    "icon": "lucide/message-circle.svg",
    "name": "message circle"
  },
  {
    "icon": "brain.svg",
    "name": "brain"
  },
  {
    "icon": "lucide/camera.svg",
    "name": "camera"
  },
  {
    "icon": "sun.svg",
    "name": "sun"
  },
  {
    "icon": "lucide/briefcase-business.svg",
    "name": "briefcase business"
  },
  {
    "icon": "lucide/circle-dollar-sign.svg",
    "name": "circle dollar sign"
  },
  {
    "icon": "lucide/flame.svg",
    "name": "flame"
  },
  {
    "icon": "lucide/package.svg",
    "name": "package"
  },
  {
    "icon": "moon.svg",
    "name": "moon"
  },
  {
    "icon": "lucide/message-square.svg",
    "name": "message square"
  },
  {
    "icon": "lucide/wrench.svg",
    "name": "wrench"
  },
  {
    "icon": "lucide/ban.svg",
    "name": "ban"
  },
  {
    "icon": "lucide/clipboard-list.svg",
    "name": "clipboard list"
  },
  {
    "icon": "lucide/dollar-sign.svg",
    "name": "dollar sign"
  },
  {
    "icon": "lucide/messages-square.svg",
    "name": "messages square"
  },
  {
    "icon": "lucide/trophy.svg",
    "name": "trophy"
  },
  {
    "icon": "lucide/notebook-pen.svg",
    "name": "notebook pen"
  },
  {
    "icon": "lucide/lock-keyhole.svg",
    "name": "lock keyhole"
  },
  {
    "icon": "smartphone.svg",
    "name": "smartphone"
  },
  {
    "icon": "lucide/video.svg",
    "name": "video"
  },
  {
    "icon": "lucide/paperclip.svg",
    "name": "paperclip"
  },
  {
    "icon": "lucide/calendar-clock.svg",
    "name": "calendar clock"
  },
  {
    "icon": "lucide/mic.svg",
    "name": "mic"
  },
  {
    "icon": "lucide/gift.svg",
    "name": "gift"
  },
  {
    "icon": "lucide/pin.svg",
    "name": "pin"
  },
  {
    "icon": "lucide/rotate-cw.svg",
    "name": "rotate cw"
  },
  {
    "icon": "lucide/palette.svg",
    "name": "palette"
  },
  {
    "icon": "lucide/key-round.svg",
    "name": "key round"
  },
  {
    "icon": "lucide/book-open-text.svg",
    "name": "book open text"
  },
  {
    "icon": "lucide/timer.svg",
    "name": "timer"
  },
  {
    "icon": "lucide/car.svg",
    "name": "car"
  },
  {
    "icon": "leaf.svg",
    "name": "leaf"
  },
  {
    "icon": "lucide/hourglass.svg",
    "name": "hourglass"
  },
  {
    "icon": "lucide/chart-line.svg",
    "name": "chart line"
  },
  {
    "icon": "lucide/earth.svg",
    "name": "earth"
  },
  {
    "icon": "lucide/list-checks.svg",
    "name": "list checks"
  },
  {
    "icon": "lucide/square-check.svg",
    "name": "square check"
  },
  {
    "icon": "lucide/calendar-check.svg",
    "name": "calendar check"
  },
  {
    "icon": "lucide/folder-open.svg",
    "name": "folder open"
  },
  {
    "icon": "lucide/calculator.svg",
    "name": "calculator"
  },
  {
    "icon": "lucide/bell-ring.svg",
    "name": "bell ring"
  },
  {
    "icon": "lucide/sprout.svg",
    "name": "sprout"
  },
  {
    "icon": "lucide/utensils.svg",
    "name": "utensils"
  },
  {
    "icon": "lucide/volume-2.svg",
    "name": "volume 2"
  },
  {
    "icon": "lucide/party-popper.svg",
    "name": "party popper"
  },
  {
    "icon": "lucide/monitor.svg",
    "name": "monitor"
  },
  {
    "icon": "lucide/repeat.svg",
    "name": "repeat"
  },
  {
    "icon": "apple.svg",
    "name": "apple"
  },
  {
    "icon": "coffee.svg",
    "name": "coffee"
  },
  {
    "icon": "lucide/heart-pulse.svg",
    "name": "heart pulse"
  },
  {
    "icon": "dumbbell.svg",
    "name": "dumbbell"
  },
  {
    "icon": "lucide/paw-print.svg",
    "name": "paw print"
  },
  {
    "icon": "lucide/hammer.svg",
    "name": "hammer"
  },
  {
    "icon": "lucide/shirt.svg",
    "name": "shirt"
  },
  {
    "icon": "lucide/clapperboard.svg",
    "name": "clapperboard"
  },
  {
    "icon": "lucide/puzzle.svg",
    "name": "puzzle"
  },
  {
    "icon": "lucide/clock-4.svg",
    "name": "clock 4"
  },
  {
    "icon": "lucide/gamepad-2.svg",
    "name": "gamepad 2"
  },
  {
    "icon": "music.svg",
    "name": "music"
  },
  {
    "icon": "lucide/laptop.svg",
    "name": "laptop"
  },
  {
    "icon": "lucide/handbag.svg",
    "name": "handbag"
  },
  {
    "icon": "lucide/hamburger.svg",
    "name": "hamburger"
  },
  {
    "icon": "lucide/droplet.svg",
    "name": "droplet"
  },
  {
    "icon": "lucide/baby.svg",
    "name": "baby"
  },
  {
    "icon": "lucide/biceps-flexed.svg",
    "name": "biceps flexed"
  },
  {
    "icon": "lucide/ruler.svg",
    "name": "ruler"
  },
  {
    "icon": "lucide/shield-plus.svg",
    "name": "shield plus"
  },
  {
    "icon": "lucide/binoculars.svg",
    "name": "binoculars"
  },
  {
    "icon": "bike.svg",
    "name": "bike"
  },
  {
    "icon": "headphones.svg",
    "name": "headphones"
  },
  {
    "icon": "lucide/shuffle.svg",
    "name": "shuffle"
  },
  {
    "icon": "pill.svg",
    "name": "pill"
  },
  {
    "icon": "lucide/cat.svg",
    "name": "cat"
  },
  {
    "icon": "lucide/dog.svg",
    "name": "dog"
  },
  {
    "icon": "lucide/cooking-pot.svg",
    "name": "cooking pot"
  },
  {
    "icon": "lucide/bed-double.svg",
    "name": "bed double"
  },
  {
    "icon": "lucide/anchor.svg",
    "name": "anchor"
  },
  {
    "icon": "paintbrush.svg",
    "name": "paintbrush"
  },
  {
    "icon": "lucide/bird.svg",
    "name": "bird"
  },
  {
    "icon": "lucide/recycle.svg",
    "name": "recycle"
  },
  {
    "icon": "lucide/flag-triangle-right.svg",
    "name": "flag triangle right"
  },
  {
    "icon": "lucide/venus.svg",
    "name": "venus"
  },
  {
    "icon": "lucide/mars.svg",
    "name": "mars"
  },
  {
    "icon": "lucide/chevrons-left-right.svg",
    "name": "chevrons left right"
  },
  {
    "icon": "lucide/syringe.svg",
    "name": "syringe"
  },
  {
    "icon": "lucide/banana.svg",
    "name": "banana"
  },
  {
    "icon": "lucide/glasses.svg",
    "name": "glasses"
  },
  {
    "icon": "lucide/fish.svg",
    "name": "fish"
  },
  {
    "icon": "lucide/soup.svg",
    "name": "soup"
  },
  {
    "icon": "lucide/sun-medium.svg",
    "name": "sun medium"
  },
  {
    "icon": "flower-2.svg",
    "name": "flower 2"
  },
  {
    "icon": "lucide/bath.svg",
    "name": "bath"
  },
  {
    "icon": "lucide/wine.svg",
    "name": "wine"
  },
  {
    "icon": "lucide/pizza.svg",
    "name": "pizza"
  },
  {
    "icon": "lucide/bone.svg",
    "name": "bone"
  },
  {
    "icon": "lucide/toilet.svg",
    "name": "toilet"
  },
  {
    "icon": "lucide/beer.svg",
    "name": "beer"
  },
  {
    "icon": "lucide/chess-knight.svg",
    "name": "chess knight"
  },
  {
    "icon": "lucide/carrot.svg",
    "name": "carrot"
  },
  {
    "icon": "lucide/music-4.svg",
    "name": "music 4"
  },
  {
    "icon": "lucide/guitar.svg",
    "name": "guitar"
  },
  {
    "icon": "lucide/volume-1.svg",
    "name": "volume 1"
  },
  {
    "icon": "lucide/fire-extinguisher.svg",
    "name": "fire extinguisher"
  },
  {
    "icon": "lucide/drum.svg",
    "name": "drum"
  },
  {
    "icon": "lucide/sailboat.svg",
    "name": "sailboat"
  },
  {
    "icon": "lucide/candy.svg",
    "name": "candy"
  },
  {
    "icon": "lucide/lamp-desk.svg",
    "name": "lamp desk"
  },
  {
    "icon": "lucide/flask-round.svg",
    "name": "flask round"
  },
  {
    "icon": "lucide/ham.svg",
    "name": "ham"
  },
  {
    "icon": "lucide/lamp.svg",
    "name": "lamp"
  },
  {
    "icon": "lucide/playing-cards-fan.svg",
    "name": "playing cards fan"
  },
  {
    "icon": "lucide/broom.svg",
    "name": "broom"
  },
  {
    "icon": "lucide/stretch-vertical.svg",
    "name": "stretch vertical"
  },
  {
    "icon": "lucide/lollipop.svg",
    "name": "lollipop"
  },
  {
    "icon": "lucide/search.svg",
    "name": "search"
  },
  {
    "icon": "lucide/house.svg",
    "name": "house"
  },
  {
    "icon": "lucide/mail.svg",
    "name": "mail"
  },
  {
    "icon": "lucide/triangle-alert.svg",
    "name": "triangle alert"
  },
  {
    "icon": "lucide/shield-check.svg",
    "name": "shield check"
  },
  {
    "icon": "lucide/globe.svg",
    "name": "globe"
  },
  {
    "icon": "lucide/send.svg",
    "name": "send"
  },
  {
    "icon": "lucide/user-round.svg",
    "name": "user round"
  },
  {
    "icon": "lucide/zap.svg",
    "name": "zap"
  },
  {
    "icon": "lucide/bot.svg",
    "name": "bot"
  },
  {
    "icon": "lucide/refresh-cw.svg",
    "name": "refresh cw"
  },
  {
    "icon": "lucide/rocket.svg",
    "name": "rocket"
  },
  {
    "icon": "lucide/chart-no-axes-combined.svg",
    "name": "chart no axes combined"
  },
  {
    "icon": "lucide/flag.svg",
    "name": "flag"
  },
  {
    "icon": "lucide/megaphone.svg",
    "name": "megaphone"
  },
  {
    "icon": "lucide/tag.svg",
    "name": "tag"
  },
  {
    "icon": "lucide/gem.svg",
    "name": "gem"
  },
  {
    "icon": "book-open.svg",
    "name": "book open"
  },
  {
    "icon": "lucide/book-text.svg",
    "name": "book text"
  }
]);

'use strict';

const defaultHabits = [
  { id: 'sun', name: 'Luz natural', icon: 'sun.svg' },
  { id: 'exercise', name: 'Ejercicio', icon: 'dumbbell.svg' },
  { id: 'time', name: 'Rutina', icon: 'clock.svg' },
  { id: 'food', name: 'Alimentación', icon: 'cooking.svg' },
  { id: 'journal', name: 'Escribir', icon: 'edit.svg' },
  { id: 'goal', name: 'Objetivo personal', icon: 'target.svg' }
];
const STORAGE_KEY = 'planner7.habit-tracker.experiment.v1';
const HABITS_KEY = 'planner7.habit-tracker.habits.v1';
const DEMO_MODE = false;
const HISTORY_KEY = DEMO_MODE ? 'habit-tracker.demo-history.v2' : 'habit-tracker.history.v2';
const SLOT_COUNT = 7;
const existingIconOptions = [
  ...defaultHabits.map(habit => ({ icon: habit.icon, name: habit.name })),
  { icon: 'book-open.svg', name: 'Libro' },
  { icon: 'droplets.svg', name: 'Agua' },
  { icon: 'moon.svg', name: 'Luna' },
  { icon: 'heart.svg', name: 'Corazón' },
  { icon: 'footprints.svg', name: 'Pasos' },
  { icon: 'bike.svg', name: 'Bicicleta' },
  { icon: 'leaf.svg', name: 'Hoja' },
  { icon: 'brain.svg', name: 'Cerebro' },
  { icon: 'music.svg', name: 'Música' },
  { icon: 'coffee.svg', name: 'Café' },
  { icon: 'apple.svg', name: 'Manzana' },
  { icon: 'bed.svg', name: 'Descanso' },
  { icon: 'medal.svg', name: 'Medalla' },
  { icon: 'flower-2.svg', name: 'Flor' },
  { icon: 'person-standing.svg', name: 'Persona' },
  { icon: 'headphones.svg', name: 'Audífonos' },
  { icon: 'smile.svg', name: 'Sonrisa' },
  { icon: 'pill.svg', name: 'Medicamento' },
  { icon: 'smartphone.svg', name: 'Teléfono' },
  { icon: 'paintbrush.svg', name: 'Pincel' },
  { icon: 'instagram.svg', name: 'Instagram' },
  { icon: 'settings.svg', name: 'Ajustes' },
  { icon: 'cannabis.svg', name: 'Cannabis' },
  { icon: 'cross-symbol.svg', name: 'Cruz' },
  { icon: 'swimming.svg', name: 'Natación' },
  { icon: 'ball-basketball.svg', name: 'Baloncesto' },
  { icon: 'baguette.svg', name: 'Pan' },
  { icon: 'play-football.svg', name: 'Fútbol' },
  { icon: 'cut.svg', name: 'Tijeras' },
  { icon: 'walk.svg', name: 'Caminar' },
  { icon: 'target-arrow.svg', name: 'Objetivo con flecha' },
  { icon: 'wifi.svg', name: 'Wifi' },
  { icon: 'thumbs-up.svg', name: 'Pulgar arriba' },
  { icon: 'save.svg', name: 'Guardar' },
  ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ', letter => ({ icon: 'letter-' + letter.toLowerCase() + '.svg', name: 'Letra ' + letter })),
  ...Array.from({ length: 9 }, (_, index) => ({ icon: 'number-' + (index + 1) + '.svg', name: 'Número ' + (index + 1) }))
];
// Metadatos de búsqueda: cinco etiquetas por icono; no se añaden al DOM.
const HABIT_ICON_TAGS = Object.freeze({
  "alarm-clock": [
    "alarma",
    "despertar",
    "mañana",
    "puntualidad",
    "recordatorio"
  ],
  "eye": [
    "ojo",
    "visión",
    "mirar",
    "observar",
    "vista"
  ],
  "map-pin": [
    "ubicación",
    "mapa",
    "lugar",
    "destino",
    "localización"
  ],
  "star": [
    "estrella",
    "favorito",
    "logro",
    "destacar",
    "prioridad"
  ],
  "pencil": [
    "lápiz",
    "escribir",
    "dibujar",
    "apuntes",
    "estudiar"
  ],
  "file-text": [
    "documento",
    "texto",
    "archivo",
    "informe",
    "lectura"
  ],
  "square-pen": [
    "editar",
    "redactar",
    "escribir",
    "notas",
    "corregir"
  ],
  "trash": [
    "basura",
    "limpiar",
    "eliminar",
    "desechar",
    "orden"
  ],
  "heart": [
    "corazón",
    "amor",
    "salud",
    "afecto",
    "bienestar"
  ],
  "shopping-cart": [
    "compras",
    "carrito",
    "supermercado",
    "mercado",
    "abastecer"
  ],
  "bell": [
    "campana",
    "aviso",
    "notificación",
    "recordatorio",
    "alerta"
  ],
  "users-round": [
    "personas",
    "grupo",
    "equipo",
    "amistad",
    "comunidad"
  ],
  "message-circle": [
    "conversación",
    "chat",
    "hablar",
    "mensaje",
    "comunicación"
  ],
  "brain": [
    "cerebro",
    "mente",
    "pensar",
    "memoria",
    "concentración"
  ],
  "camera": [
    "cámara",
    "fotografía",
    "foto",
    "retratar",
    "recuerdos"
  ],
  "sun": [
    "sol",
    "luz natural",
    "mañana",
    "exterior",
    "vitamina d"
  ],
  "briefcase-business": [
    "trabajo",
    "oficina",
    "negocio",
    "empleo",
    "profesión"
  ],
  "circle-dollar-sign": [
    "dinero",
    "ahorro",
    "finanzas",
    "presupuesto",
    "pago"
  ],
  "flame": [
    "fuego",
    "energía",
    "motivación",
    "calor",
    "intensidad"
  ],
  "package": [
    "paquete",
    "entrega",
    "envío",
    "pedido",
    "caja"
  ],
  "moon": [
    "luna",
    "noche",
    "dormir",
    "descanso",
    "sueño"
  ],
  "message-square": [
    "mensaje",
    "chat",
    "comunicar",
    "escribir",
    "conversación"
  ],
  "wrench": [
    "llave inglesa",
    "reparar",
    "mantenimiento",
    "herramienta",
    "arreglar"
  ],
  "ban": [
    "prohibir",
    "evitar",
    "detener",
    "restricción",
    "dejar"
  ],
  "clipboard-list": [
    "lista",
    "pendientes",
    "planificar",
    "organizar",
    "anotar"
  ],
  "dollar-sign": [
    "dólar",
    "dinero",
    "gastos",
    "ingresos",
    "finanzas"
  ],
  "messages-square": [
    "mensajes",
    "diálogo",
    "conversaciones",
    "contactar",
    "comunicación"
  ],
  "trophy": [
    "trofeo",
    "premio",
    "logro",
    "victoria",
    "competencia"
  ],
  "notebook-pen": [
    "cuaderno",
    "diario",
    "apuntes",
    "escribir",
    "reflexión"
  ],
  "lock-keyhole": [
    "candado",
    "seguridad",
    "privacidad",
    "proteger",
    "cerrar"
  ],
  "smartphone": [
    "teléfono",
    "celular",
    "pantalla",
    "desconectar",
    "móvil"
  ],
  "video": [
    "video",
    "grabar",
    "filmar",
    "película",
    "contenido"
  ],
  "paperclip": [
    "clip",
    "adjuntar",
    "papeles",
    "documentos",
    "unir"
  ],
  "calendar-clock": [
    "calendario",
    "agenda",
    "horario",
    "cita",
    "planificar"
  ],
  "mic": [
    "micrófono",
    "cantar",
    "voz",
    "podcast",
    "grabar"
  ],
  "gift": [
    "regalo",
    "obsequio",
    "sorpresa",
    "celebrar",
    "cumpleaños"
  ],
  "pin": [
    "chincheta",
    "fijar",
    "recordatorio",
    "marcar",
    "prioridad"
  ],
  "rotate-cw": [
    "girar",
    "rotar",
    "reiniciar",
    "volver",
    "renovar"
  ],
  "palette": [
    "paleta",
    "arte",
    "pintar",
    "colores",
    "creatividad"
  ],
  "key-round": [
    "llave",
    "acceso",
    "abrir",
    "seguridad",
    "entrada"
  ],
  "book-open-text": [
    "leer",
    "lectura",
    "libro",
    "estudio",
    "aprender"
  ],
  "timer": [
    "cronómetro",
    "tiempo",
    "medir",
    "entrenar",
    "pomodoro"
  ],
  "car": [
    "auto",
    "coche",
    "conducir",
    "transporte",
    "viajar"
  ],
  "leaf": [
    "hoja",
    "naturaleza",
    "ecología",
    "plantas",
    "verde"
  ],
  "hourglass": [
    "reloj de arena",
    "espera",
    "tiempo",
    "paciencia",
    "pausa"
  ],
  "chart-line": [
    "gráfico",
    "progreso",
    "estadísticas",
    "seguimiento",
    "resultados"
  ],
  "earth": [
    "tierra",
    "planeta",
    "mundo",
    "ambiente",
    "geografía"
  ],
  "list-checks": [
    "tareas",
    "lista",
    "completar",
    "organizar",
    "pendientes"
  ],
  "square-check": [
    "completado",
    "cumplir",
    "check",
    "marcar",
    "terminar"
  ],
  "calendar-check": [
    "calendario",
    "asistencia",
    "cumplimiento",
    "agenda",
    "planificación"
  ],
  "folder-open": [
    "carpeta",
    "archivos",
    "documentos",
    "organizar",
    "clasificar"
  ],
  "calculator": [
    "calculadora",
    "matemáticas",
    "calcular",
    "cuentas",
    "números"
  ],
  "bell-ring": [
    "alarma",
    "campana",
    "aviso",
    "recordatorio",
    "notificación"
  ],
  "sprout": [
    "brote",
    "crecer",
    "plantar",
    "semilla",
    "jardinería"
  ],
  "utensils": [
    "comer",
    "cubiertos",
    "alimentación",
    "comida",
    "restaurante"
  ],
  "volume-2": [
    "volumen",
    "sonido",
    "escuchar",
    "audio",
    "altavoz"
  ],
  "party-popper": [
    "fiesta",
    "celebrar",
    "felicidad",
    "evento",
    "diversión"
  ],
  "monitor": [
    "monitor",
    "pantalla",
    "computador",
    "escritorio",
    "trabajo"
  ],
  "repeat": [
    "repetir",
    "rutina",
    "constancia",
    "ciclo",
    "hábito"
  ],
  "apple": [
    "manzana",
    "fruta",
    "alimentación",
    "nutrición",
    "saludable"
  ],
  "coffee": [
    "café",
    "bebida",
    "desayuno",
    "cafeína",
    "pausa"
  ],
  "heart-pulse": [
    "corazón",
    "pulso",
    "salud",
    "cardio",
    "bienestar"
  ],
  "dumbbell": [
    "ejercicio",
    "pesas",
    "gimnasio",
    "fuerza",
    "entrenamiento"
  ],
  "paw-print": [
    "huella",
    "mascota",
    "animales",
    "cuidado",
    "veterinario"
  ],
  "hammer": [
    "martillo",
    "construir",
    "reparar",
    "herramienta",
    "bricolaje"
  ],
  "shirt": [
    "ropa",
    "camiseta",
    "vestirse",
    "lavandería",
    "vestuario"
  ],
  "clapperboard": [
    "cine",
    "película",
    "video",
    "filmar",
    "audiovisual"
  ],
  "puzzle": [
    "rompecabezas",
    "juego",
    "resolver",
    "lógica",
    "pensar"
  ],
  "clock-4": [
    "reloj",
    "hora",
    "rutina",
    "horario",
    "puntualidad"
  ],
  "gamepad-2": [
    "videojuegos",
    "jugar",
    "gaming",
    "consola",
    "entretenimiento"
  ],
  "music": [
    "música",
    "escuchar",
    "canción",
    "melodía",
    "ritmo"
  ],
  "laptop": [
    "portátil",
    "computador",
    "trabajar",
    "estudiar",
    "tecnología"
  ],
  "handbag": [
    "bolso",
    "cartera",
    "compras",
    "accesorios",
    "salir"
  ],
  "hamburger": [
    "hamburguesa",
    "comida",
    "alimentación",
    "comer",
    "restaurante"
  ],
  "droplet": [
    "agua",
    "gota",
    "hidratación",
    "beber",
    "líquido"
  ],
  "baby": [
    "bebé",
    "crianza",
    "infancia",
    "familia",
    "cuidar"
  ],
  "biceps-flexed": [
    "bíceps",
    "fuerza",
    "músculo",
    "entrenar",
    "ejercicio"
  ],
  "ruler": [
    "regla",
    "medir",
    "diseño",
    "dibujo",
    "precisión"
  ],
  "shield-plus": [
    "salud",
    "protección",
    "prevención",
    "seguro",
    "cuidado"
  ],
  "binoculars": [
    "binoculares",
    "explorar",
    "observar",
    "excursión",
    "naturaleza"
  ],
  "bike": [
    "bicicleta",
    "ciclismo",
    "pedalear",
    "ejercicio",
    "transporte"
  ],
  "headphones": [
    "audífonos",
    "auriculares",
    "escuchar",
    "música",
    "audio"
  ],
  "shuffle": [
    "aleatorio",
    "mezclar",
    "variar",
    "cambiar",
    "música"
  ],
  "pill": [
    "medicamento",
    "pastilla",
    "vitamina",
    "tratamiento",
    "salud"
  ],
  "cat": [
    "gato",
    "mascota",
    "felino",
    "cuidar",
    "animales"
  ],
  "dog": [
    "perro",
    "mascota",
    "pasear",
    "cuidar",
    "animales"
  ],
  "cooking-pot": [
    "olla",
    "cocinar",
    "comida",
    "receta",
    "alimentación"
  ],
  "bed-double": [
    "cama",
    "dormir",
    "descansar",
    "sueño",
    "dormitorio"
  ],
  "anchor": [
    "ancla",
    "barco",
    "estabilidad",
    "mar",
    "navegar"
  ],
  "paintbrush": [
    "pincel",
    "pintar",
    "arte",
    "creatividad",
    "dibujo"
  ],
  "bird": [
    "ave",
    "pájaro",
    "naturaleza",
    "animales",
    "observar"
  ],
  "recycle": [
    "reciclar",
    "ecología",
    "residuos",
    "reutilizar",
    "ambiente"
  ],
  "flag-triangle-right": [
    "bandera",
    "meta",
    "objetivo",
    "destino",
    "logro"
  ],
  "venus": [
    "mujer",
    "femenino",
    "venus",
    "género",
    "feminidad"
  ],
  "mars": [
    "hombre",
    "masculino",
    "marte",
    "género",
    "masculinidad"
  ],
  "chevrons-left-right": [
    "código",
    "programar",
    "desarrollo",
    "informática",
    "software"
  ],
  "syringe": [
    "jeringa",
    "vacuna",
    "inyección",
    "medicina",
    "salud"
  ],
  "banana": [
    "plátano",
    "banana",
    "fruta",
    "nutrición",
    "alimentación"
  ],
  "glasses": [
    "lentes",
    "gafas",
    "visión",
    "leer",
    "vista"
  ],
  "fish": [
    "pescado",
    "pez",
    "proteína",
    "alimentación",
    "mar"
  ],
  "soup": [
    "sopa",
    "comida",
    "cocinar",
    "alimentación",
    "caliente"
  ],
  "sun-medium": [
    "sol",
    "luz",
    "día",
    "aire libre",
    "energía"
  ],
  "flower-2": [
    "flor",
    "jardín",
    "naturaleza",
    "plantas",
    "cuidar"
  ],
  "bath": [
    "bañera",
    "baño",
    "relajación",
    "higiene",
    "descansar"
  ],
  "wine": [
    "vino",
    "copa",
    "bebida",
    "alcohol",
    "celebrar"
  ],
  "pizza": [
    "pizza",
    "comida",
    "comer",
    "alimentación",
    "restaurante"
  ],
  "bone": [
    "hueso",
    "mascota",
    "perro",
    "esqueleto",
    "salud"
  ],
  "toilet": [
    "inodoro",
    "baño",
    "higiene",
    "limpieza",
    "aseo"
  ],
  "beer": [
    "cerveza",
    "bebida",
    "alcohol",
    "reunión",
    "moderación"
  ],
  "chess-knight": [
    "ajedrez",
    "caballo",
    "estrategia",
    "jugar",
    "lógica"
  ],
  "carrot": [
    "zanahoria",
    "verdura",
    "vegetal",
    "nutrición",
    "alimentación"
  ],
  "music-4": [
    "música",
    "canción",
    "melodía",
    "componer",
    "ritmo"
  ],
  "guitar": [
    "guitarra",
    "instrumento",
    "música",
    "practicar",
    "tocar"
  ],
  "volume-1": [
    "sonido",
    "volumen",
    "audio",
    "escuchar",
    "silencio"
  ],
  "fire-extinguisher": [
    "extintor",
    "incendio",
    "seguridad",
    "prevención",
    "emergencia"
  ],
  "drum": [
    "batería",
    "tambor",
    "percusión",
    "música",
    "ritmo"
  ],
  "sailboat": [
    "velero",
    "barco",
    "navegar",
    "mar",
    "viajar"
  ],
  "candy": [
    "caramelo",
    "dulce",
    "azúcar",
    "golosina",
    "alimentación"
  ],
  "lamp-desk": [
    "lámpara",
    "escritorio",
    "estudiar",
    "leer",
    "iluminación"
  ],
  "flask-round": [
    "matraz",
    "ciencia",
    "experimento",
    "química",
    "laboratorio"
  ],
  "ham": [
    "jamón",
    "proteína",
    "comida",
    "alimentación",
    "cocinar"
  ],
  "lamp": [
    "lámpara",
    "luz",
    "iluminar",
    "hogar",
    "lectura"
  ],
  "playing-cards-fan": [
    "cartas",
    "naipes",
    "jugar",
    "juego de mesa",
    "entretenimiento"
  ],
  "broom": [
    "escoba",
    "barrer",
    "limpiar",
    "aseo",
    "hogar"
  ],
  "stretch-vertical": [
    "estirar",
    "flexibilidad",
    "movilidad",
    "ejercicio",
    "elongación"
  ],
  "lollipop": [
    "paleta",
    "chupete",
    "dulce",
    "azúcar",
    "golosina"
  ],
  "search": [
    "buscar",
    "lupa",
    "investigar",
    "explorar",
    "encontrar"
  ],
  "house": [
    "casa",
    "hogar",
    "familia",
    "orden",
    "cuidar"
  ],
  "mail": [
    "correo",
    "email",
    "mensaje",
    "comunicación",
    "bandeja"
  ],
  "triangle-alert": [
    "alerta",
    "advertencia",
    "precaución",
    "riesgo",
    "atención"
  ],
  "shield-check": [
    "seguridad",
    "protección",
    "verificar",
    "confianza",
    "prevención"
  ],
  "globe": [
    "globo",
    "mundo",
    "viajar",
    "geografía",
    "idiomas"
  ],
  "send": [
    "enviar",
    "mensaje",
    "comunicar",
    "contactar",
    "compartir"
  ],
  "user-round": [
    "persona",
    "usuario",
    "perfil",
    "autocuidado",
    "identidad"
  ],
  "zap": [
    "rayo",
    "energía",
    "electricidad",
    "velocidad",
    "activación"
  ],
  "bot": [
    "robot",
    "automatizar",
    "tecnología",
    "inteligencia artificial",
    "asistente"
  ],
  "refresh-cw": [
    "actualizar",
    "renovar",
    "reiniciar",
    "repetir",
    "sincronizar"
  ],
  "rocket": [
    "cohete",
    "lanzar",
    "avance",
    "despegar",
    "proyecto"
  ],
  "chart-no-axes-combined": [
    "gráfico",
    "crecimiento",
    "progreso",
    "estadísticas",
    "rendimiento"
  ],
  "flag": [
    "bandera",
    "meta",
    "objetivo",
    "marcar",
    "logro"
  ],
  "megaphone": [
    "megáfono",
    "anunciar",
    "difundir",
    "comunicar",
    "voz"
  ],
  "tag": [
    "etiqueta",
    "categoría",
    "clasificar",
    "organizar",
    "identificar"
  ],
  "gem": [
    "gema",
    "diamante",
    "valor",
    "joya",
    "tesoro"
  ],
  "book-open": [
    "libro",
    "leer",
    "lectura",
    "estudiar",
    "aprender"
  ],
  "book-text": [
    "libro",
    "texto",
    "lectura",
    "estudio",
    "conocimiento"
  ],
  "clock": [
    "reloj",
    "hora",
    "rutina",
    "puntualidad",
    "horario"
  ],
  "cooking": [
    "cocinar",
    "cocina",
    "receta",
    "alimentación",
    "comida"
  ],
  "edit": [
    "escribir",
    "diario",
    "redactar",
    "notas",
    "editar"
  ],
  "target": [
    "objetivo",
    "meta",
    "diana",
    "concentración",
    "logro"
  ],
  "droplets": [
    "agua",
    "hidratación",
    "beber",
    "líquido",
    "salud"
  ],
  "footprints": [
    "pasos",
    "caminar",
    "pasear",
    "actividad",
    "senderismo"
  ],
  "bed": [
    "dormir",
    "cama",
    "sueño",
    "descansar",
    "reposo"
  ],
  "medal": [
    "medalla",
    "premio",
    "logro",
    "victoria",
    "recompensa"
  ],
  "person-standing": [
    "persona",
    "postura",
    "cuerpo",
    "estar de pie",
    "movilidad"
  ],
  "smile": [
    "sonrisa",
    "felicidad",
    "alegría",
    "ánimo",
    "bienestar"
  ],
  "instagram": [
    "instagram",
    "redes sociales",
    "fotografía",
    "publicar",
    "contenido"
  ],
  "settings": [
    "ajustes",
    "configuración",
    "opciones",
    "preferencias",
    "organizar"
  ],
  "cannabis": [
    "cannabis",
    "marihuana",
    "planta",
    "consumo",
    "moderación"
  ],
  "cross-symbol": [
    "cruz",
    "fe",
    "religión",
    "oración",
    "espiritualidad"
  ],
  "swimming": [
    "natación",
    "nadar",
    "piscina",
    "agua",
    "deporte"
  ],
  "ball-basketball": [
    "baloncesto",
    "básquetbol",
    "basketball",
    "pelota",
    "deporte"
  ],
  "baguette": [
    "pan",
    "baguette",
    "panadería",
    "desayuno",
    "alimentación"
  ],
  "play-football": [
    "fútbol",
    "pelota",
    "soccer",
    "deporte",
    "jugar"
  ],
  "cut": [
    "tijeras",
    "cortar",
    "manualidades",
    "recortar",
    "crear"
  ],
  "walk": [
    "caminar",
    "pasear",
    "andar",
    "pasos",
    "actividad"
  ],
  "target-arrow": [
    "objetivo",
    "meta",
    "diana",
    "flecha",
    "logro"
  ],
  "wifi": [
    "wifi",
    "internet",
    "conexión",
    "red",
    "conectividad"
  ],
  "thumbs-up": [
    "aprobar",
    "bien",
    "pulgar arriba",
    "positivo",
    "motivación"
  ],
  "save": [
    "guardar",
    "respaldo",
    "archivo",
    "conservar",
    "persistir"
  ],
  "letter-a": [
    "a",
    "letra a",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-b": [
    "b",
    "letra b",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-c": [
    "c",
    "letra c",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-d": [
    "d",
    "letra d",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-e": [
    "e",
    "letra e",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-f": [
    "f",
    "letra f",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-g": [
    "g",
    "letra g",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-h": [
    "h",
    "letra h",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-i": [
    "i",
    "letra i",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-j": [
    "j",
    "letra j",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-k": [
    "k",
    "letra k",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-l": [
    "l",
    "letra l",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-m": [
    "m",
    "letra m",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-n": [
    "n",
    "letra n",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-o": [
    "o",
    "letra o",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-p": [
    "p",
    "letra p",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-q": [
    "q",
    "letra q",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-r": [
    "r",
    "letra r",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-s": [
    "s",
    "letra s",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-t": [
    "t",
    "letra t",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-u": [
    "u",
    "letra u",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-v": [
    "v",
    "letra v",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-w": [
    "w",
    "letra w",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-x": [
    "x",
    "letra x",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-y": [
    "y",
    "letra y",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "letter-z": [
    "z",
    "letra z",
    "alfabeto",
    "inicial",
    "abecedario"
  ],
  "number-1": [
    "1",
    "uno",
    "número",
    "cantidad",
    "conteo"
  ],
  "number-2": [
    "2",
    "dos",
    "número",
    "cantidad",
    "conteo"
  ],
  "number-3": [
    "3",
    "tres",
    "número",
    "cantidad",
    "conteo"
  ],
  "number-4": [
    "4",
    "cuatro",
    "número",
    "cantidad",
    "conteo"
  ],
  "number-5": [
    "5",
    "cinco",
    "número",
    "cantidad",
    "conteo"
  ],
  "number-6": [
    "6",
    "seis",
    "número",
    "cantidad",
    "conteo"
  ],
  "number-7": [
    "7",
    "siete",
    "número",
    "cantidad",
    "conteo"
  ],
  "number-8": [
    "8",
    "ocho",
    "número",
    "cantidad",
    "conteo"
  ],
  "number-9": [
    "9",
    "nueve",
    "número",
    "cantidad",
    "conteo"
  ]
});
const HABIT_ICON_NAMES = Object.freeze({"alarm-clock":"Alarma","eye":"Ojo","map-pin":"Ubicación","star":"Estrella","pencil":"Lápiz","file-text":"Documento","square-pen":"Escribir","trash":"Papelera","heart":"Corazón","shopping-cart":"Carrito de compras","bell":"Campana","users-round":"Personas","message-circle":"Mensaje","brain":"Cerebro","camera":"Cámara","sun":"Sol","briefcase-business":"Maletín","circle-dollar-sign":"Moneda","flame":"Fuego","package":"Paquete","moon":"Luna","message-square":"Mensaje","wrench":"Llave inglesa","ban":"Prohibido","clipboard-list":"Lista","dollar-sign":"Dinero","messages-square":"Mensaje","trophy":"Trofeo","notebook-pen":"Cuaderno","lock-keyhole":"Candado","smartphone":"Teléfono","video":"Vídeo","paperclip":"Clip","calendar-clock":"Calendario","mic":"Micrófono","gift":"Regalo","pin":"Chincheta","rotate-cw":"Girar","palette":"Paleta de pintura","key-round":"Llave","book-open-text":"Libro","timer":"Temporizador","car":"Auto","leaf":"Hoja","hourglass":"Reloj de arena","chart-line":"Gráfico","earth":"Mundo","list-checks":"Lista de verificación","square-check":"Casilla marcada","calendar-check":"Calendario","folder-open":"Carpeta","calculator":"Calculadora","bell-ring":"Campana","sprout":"Brote","utensils":"Cubiertos","volume-2":"Volumen","party-popper":"Celebración","monitor":"Pantalla","repeat":"Repetir","apple":"Manzana","coffee":"Café","heart-pulse":"Corazón","dumbbell":"Pesas","paw-print":"Huella de animal","hammer":"Martillo","shirt":"Camiseta","clapperboard":"Claqueta","puzzle":"Rompecabezas","clock-4":"Reloj","gamepad-2":"Control de videojuegos","music":"Música","laptop":"Computador portátil","handbag":"Bolso","hamburger":"Hamburguesa","droplet":"Agua","baby":"Bebé","biceps-flexed":"Bíceps","ruler":"Regla","shield-plus":"Escudo","binoculars":"Binoculares","bike":"Bicicleta","headphones":"Audífonos","shuffle":"Mezclar","pill":"Medicamento","cat":"Gato","dog":"Perro","cooking-pot":"Olla","bed-double":"Cama","anchor":"Ancla","paintbrush":"Pincel","bird":"Pájaro","recycle":"Reciclar","flag-triangle-right":"Bandera","venus":"Femenino","mars":"Masculino","chevrons-left-right":"Flechas","syringe":"Jeringa","banana":"Plátano","glasses":"Anteojos","fish":"Pez","soup":"Sopa","sun-medium":"Sol","flower-2":"Flor","bath":"Bañera","wine":"Vino","pizza":"Pizza","bone":"Hueso","toilet":"Inodoro","beer":"Cerveza","chess-knight":"Ajedrez","carrot":"Zanahoria","music-4":"Música","guitar":"Guitarra","volume-1":"Volumen","fire-extinguisher":"Extintor","drum":"Tambor","sailboat":"Velero","candy":"Caramelo","lamp-desk":"Lámpara","flask-round":"Matraz","ham":"Jamón","lamp":"Lámpara","playing-cards-fan":"Naipes","broom":"Escoba","stretch-vertical":"Estiramiento","lollipop":"Piruleta","search":"Buscar","house":"Casa","mail":"Correo","triangle-alert":"Advertencia","shield-check":"Escudo","globe":"Mundo","send":"Enviar","user-round":"Persona","zap":"Rayo","bot":"Robot","refresh-cw":"Actualizar","rocket":"Cohete","chart-no-axes-combined":"Gráfico","flag":"Bandera","megaphone":"Megáfono","tag":"Etiqueta","gem":"Gema","book-open":"Libro","book-text":"Libro","clock":"Reloj","cooking":"Cocinar","edit":"Escribir","target":"Meta","droplets":"Agua","footprints":"Pasos","bed":"Cama","medal":"Medalla","person-standing":"Persona","smile":"Sonrisa","instagram":"Instagram","settings":"Ajustes","cannabis":"Cannabis","cross-symbol":"Cruz","swimming":"Nadar","ball-basketball":"Baloncesto","baguette":"Pan","play-football":"Fútbol","cut":"Tijeras","walk":"Caminar","target-arrow":"Meta","wifi":"Wifi","thumbs-up":"Pulgar arriba","save":"Guardar","letter-a":"Letra A","letter-b":"Letra B","letter-c":"Letra C","letter-d":"Letra D","letter-e":"Letra E","letter-f":"Letra F","letter-g":"Letra G","letter-h":"Letra H","letter-i":"Letra I","letter-j":"Letra J","letter-k":"Letra K","letter-l":"Letra L","letter-m":"Letra M","letter-n":"Letra N","letter-o":"Letra O","letter-p":"Letra P","letter-q":"Letra Q","letter-r":"Letra R","letter-s":"Letra S","letter-t":"Letra T","letter-u":"Letra U","letter-v":"Letra V","letter-w":"Letra W","letter-x":"Letra X","letter-y":"Letra Y","letter-z":"Letra Z","number-1":"Número 1","number-2":"Número 2","number-3":"Número 3","number-4":"Número 4","number-5":"Número 5","number-6":"Número 6","number-7":"Número 7","number-8":"Número 8","number-9":"Número 9"});
// Orden por afinidad temática dentro de una sola cuadrícula.
const iconThemeOrder = [
  'utensils cooking cooking-pot soup hamburger pizza ham fish apple banana carrot baguette coffee wine beer candy lollipop',
  'dumbbell biceps-flexed stretch-vertical walk footprints bike swimming ball-basketball play-football trophy medal',
  'heart heart-pulse brain eye pill syringe shield-plus glasses bed bed-double bath toilet',
  'sun sun-medium moon flame zap droplet droplets leaf sprout flower-2 cannabis earth globe recycle',
  'paw-print cat dog bird bone',
  'house lamp lamp-desk broom trash',
  'paintbrush palette cut ruler flask-round',
  'music music-4 guitar drum headphones volume-1 volume-2 mic camera video clapperboard',
  'gamepad-2 puzzle chess-knight playing-cards-fan party-popper gift',
  'smartphone monitor laptop wifi bot',
  'book-open book-open-text book-text notebook-pen edit pencil square-pen file-text paperclip folder-open clipboard-list list-checks square-check save',
  'briefcase-business chart-line chart-no-axes-combined calculator dollar-sign circle-dollar-sign shopping-cart handbag package tag gem',
  'instagram mail send message-circle message-square messages-square megaphone',
  'person-standing user-round users-round baby venus mars smile thumbs-up shirt',
  'clock clock-4 alarm-clock timer hourglass calendar-clock calendar-check bell bell-ring',
  'target target-arrow star flag flag-triangle-right cross-symbol',
  'map-pin pin car sailboat anchor binoculars rocket',
  'settings wrench hammer fire-extinguisher lock-keyhole key-round shield-check ban triangle-alert',
  'search rotate-cw refresh-cw repeat shuffle chevrons-left-right',
  ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ', letter => 'letter-' + letter.toLowerCase()),
  ...Array.from({ length: 9 }, (_, index) => 'number-' + (index + 1))
].flatMap(group => group.split(' '));
const iconThemePositions = new Map(iconThemeOrder.map((name, index) => [name, index]));
function iconThemePosition(option) {
  const name = option.icon.split('/').pop().replace(/\.svg$/, '');
  return iconThemePositions.get(name) ?? iconThemeOrder.length;
}
// Se conservan los SVG para mostrar hábitos guardados que ya usan estas variantes.
const redundantHabitIcons = new Set([
  'lucide/sun-medium.svg', 'lucide/music-4.svg', 'lucide/square-pen.svg',
  'lucide/clock-4.svg', 'target.svg', 'droplets.svg', 'lucide/shield-plus.svg',
  'wifi.svg', 'lucide/list-checks.svg'
]);
const iconOptions = [
  ...existingIconOptions,
  ...LUCIDE_ICON_OPTIONS.filter(option => !existingIconOptions.some(existing => existing.icon === option.icon))
].filter(option => !redundantHabitIcons.has(option.icon))
  .map(option => ({ ...option, name: HABIT_ICON_NAMES[option.icon.split("/").pop().replace(/\.svg$/, "")] }))
  .sort((left, right) => iconThemePosition(left) - iconThemePosition(right));

// Numerar todas las variantes únicamente cuando comparten el mismo nombre.
const iconNameCounts = new Map();
const iconNameNumbers = new Map();
iconOptions.forEach(option => iconNameCounts.set(option.name, (iconNameCounts.get(option.name) || 0) + 1));
iconOptions.forEach(option => {
  const name = option.name;
  if (iconNameCounts.get(name) > 1) {
    const number = (iconNameNumbers.get(name) || 0) + 1;
    iconNameNumbers.set(name, number);
    option.name = name + ' ' + number;
  }
});
function normalizeIconSearch(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
const searchableIcons = iconOptions.map(option => ({
  ...option,
  // Las etiquetas viven únicamente en memoria; title y aria-label conservan el nombre.
  search: normalizeIconSearch([option.name, option.icon.split('/').pop().replace(/\.svg$/, '').replace(/-/g, ' '),
    ...HABIT_ICON_TAGS[option.icon.split('/').pop().replace(/\.svg$/, '')]].join(' '))
}));
const viewport = document.getElementById('history-viewport');
const grid = document.getElementById('habit-grid');
const track = document.getElementById('scroll-track');
const thumb = document.getElementById('scroll-thumb');
const stats = document.getElementById('stats-dialog');
const backdrop = document.getElementById('tracker-backdrop');

const announcement = document.getElementById('announcement');
const editor = document.getElementById('habit-editor');
const habitForm = document.getElementById('habit-form');
const nameInput = document.getElementById('habit-name');
const changeDialog = document.getElementById('change-dialog');
const iconDialog = document.getElementById('icon-dialog');
const iconValue = document.getElementById('habit-icon-value');
const deleteRecordDialog = document.getElementById('delete-record-dialog');
let deletingBlockId = null;
let editingIndex = null;
let editingBlockId = null;
let pendingChange = null;
let testDayOffset = 0;
function effectiveToday() {
  const date = new Date();
  date.setDate(date.getDate() + testDayOffset);
  date.setHours(12, 0, 0, 0);
  return date;
}
let today = effectiveToday();
today.setHours(12, 0, 0, 0);
const dates = [];
function dateKey(date) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function dateLabel(date) {
  return String(date.getDate()).padStart(2, '0') + '/' + String(date.getMonth() + 1).padStart(2, '0');
}
function parseDay(key) { return new Date(key + 'T12:00:00'); }
function dayBefore(key) {
  const date = parseDay(key);
  date.setDate(date.getDate() - 1);
  return dateKey(date);
}
function validDay(key) { return typeof key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(key) && dateKey(parseDay(key)) === key; }
function rangeDates(start, end) {
  const result = [];
  const day = parseDay(end);
  while (dateKey(day) >= start) {
    result.push(dateKey(day));
    day.setDate(day.getDate() - 1);
  }
  return result;
}
function recordKey(date, habit) { return date + ':' + habit; }
function recordState(key, source = records) {
  if (source[key] === true || source[key] === 'completed') return 'completed';
  return source[key] === 'failed' ? 'failed' : 'pending';
}
const stateLabels = { pending: 'sin registrar', completed: 'completado', failed: 'no realizado' };
const compactHabitIcons = new Set(['swimming.svg', 'lucide/video.svg', 'lucide/glasses.svg', 'lucide/car.svg']);
function icon(habit) {
  const template = document.createElement('template');
  template.innerHTML = HABIT_ICON_SVGS[habit.icon] || HABIT_ICON_SVGS['sun.svg'];
  const svg = template.content.firstElementChild;
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.dataset.icon = habit.icon;
  const bounds = HABIT_ICON_BOUNDS[habit.icon];
  if (bounds && (redundantHabitIcons.has(habit.icon) || iconOptions.some(option => option.icon === habit.icon))) {
    // Usar el mismo margen relativo: la altura visible no depende del margen
    // original del SVG ni de si el dibujo es una letra, un número o un símbolo.
    const isFontGlyph = svg.dataset.font === 'Quicksand';
    const inset = isFontGlyph ? 0 : 0.875;
    const contentWidth = bounds[2] - inset * 2;
    const contentHeight = bounds[3] - inset * 2;
    const padding = isFontGlyph ? 0 : contentHeight * 0.05;
    const viewBox = [bounds[0] + inset - padding, bounds[1] + inset - padding,
      contentWidth + padding * 2, contentHeight + padding * 2];
    svg.setAttribute('viewBox', viewBox.join(' '));
    svg.style.overflow = 'visible';
    const sizeScale = compactHabitIcons.has(habit.icon) ? 0.8 : 1;
    svg.style.height = 'calc(var(--habit-icon-height, 24.64px) * ' + sizeScale + ')';
    svg.style.width = 'calc(var(--habit-icon-height, 24.64px) * ' + (viewBox[2] / viewBox[3] * sizeScale) + ')';
    // El grosor queda en píxeles de pantalla, independiente del viewBox y la escala.
    // Los contornos de la fuente ya incluyen su peso; añadir un trazo lo duplicaría.
    if (!isFontGlyph) svg.querySelectorAll('path,circle,ellipse,line,polyline,polygon,rect').forEach(shape => {
      shape.setAttribute('vector-effect', 'non-scaling-stroke');
      shape.style.strokeWidth = '2.25px';
    });
  }
  return svg;
}
function readSaved(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function normalizedHabits(items) {
  const ids = new Set();
  const result = (Array.isArray(items) ? items : []).filter(habit => {
    if (!habit || typeof habit.id !== 'string' || typeof habit.name !== 'string' || !habit.name.trim() || !Object.hasOwn(HABIT_ICON_SVGS, habit.icon) || ids.has(habit.id)) return false;
    ids.add(habit.id);
    return true;
  }).slice(0, SLOT_COUNT).map(habit => ({ ...habit }));
  while (result.length < SLOT_COUNT) result.push(null);
  return result;
}
function initialHistoryStart() {
  return dateKey(today);
}
function loadBlocks() {
  if (DEMO_MODE) return createDemoBlocks();
  const saved = readSaved(HISTORY_KEY);
  if (saved?.version === 2 && Array.isArray(saved.blocks) && saved.blocks.length && saved.blocks.every(block =>
    typeof block.id === 'string' && validDay(block.startDate) && (block.endDate === null || validDay(block.endDate)) && Array.isArray(block.habits) && block.records && typeof block.records === 'object' && !Array.isArray(block.records))) {
    const loaded = saved.blocks.map(block => ({ ...block, habits: normalizedHabits(block.habits) }));
    const initial = loaded[0];
    const starterHabits = initial.habits.filter(Boolean);
    const hasOnlyStarterHabits = !starterHabits.length || (starterHabits.length === defaultHabits.length && starterHabits.every((habit, index) =>
      ['id', 'name', 'icon'].every(field => habit[field] === defaultHabits[index][field])));
    // Reducir el historial inicial de versiones anteriores únicamente si está vacío.
    if (loaded.length === 1 && initial.endDate === null && !Object.keys(initial.records).length && hasOnlyStarterHabits && initial.startDate < initialHistoryStart()) {
      initial.startDate = initialHistoryStart();
    }
    // Corregir también los límites inclusivos de versiones anteriores.
    for (let index = loaded.length - 1; index > 0; index--) {
      const previous = loaded[index];
      const next = loaded[index - 1];
      if (previous.endDate && previous.endDate >= next.startDate) closePreviousBlock(previous, next);
    }
    return loaded;
  }
  // Migrar los datos previos sin borrar sus claves originales.
  const legacy = readSaved(STORAGE_KEY);
  const migratedRecords = legacy && typeof legacy === 'object' && !Array.isArray(legacy) ? legacy : {};
  const start = new Date(today);
  const legacyHabits = readSaved(HABITS_KEY);
  const hasLegacyData = Object.keys(migratedRecords).length > 0 || (Array.isArray(legacyHabits) && legacyHabits.some(Boolean));
  if (hasLegacyData) start.setDate(start.getDate() - 30);
  const existingDates = Object.keys(migratedRecords).map(key => key.slice(0, 10)).filter(validDay).sort();
  const startDate = existingDates[0] && existingDates[0] < dateKey(start) ? existingDates[0] : dateKey(start);
  return [{ id: habitId(), startDate, endDate: null,
    habits: normalizedHabits(legacyHabits), records: migratedRecords }];
}
let blocks = loadBlocks();
function renderTestControls() {}
let selectedBlockId = blocks.some(block => block.id === preferredBlockId) ? preferredBlockId : blocks[0].id;
const recordSelector = document.getElementById('record-selector');
const recordToggle = document.getElementById('record-selector-toggle');
const recordMenu = document.getElementById('record-selector-menu');
const hideEmptyDays = document.getElementById('hide-empty-days');
const VIEW_KEY = HISTORY_KEY + '.hide-empty-days';
hideEmptyDays.checked = !DEMO_MODE && readSaved(VIEW_KEY) === true;
hideEmptyDays.addEventListener('change', () => {
  try { if (!DEMO_MODE) localStorage.setItem(VIEW_KEY, JSON.stringify(hideEmptyDays.checked)); }
  catch { hideEmptyDays.checked = readSaved(VIEW_KEY) === true; }
  renderHabits();
});
const recordNotice = document.getElementById('record-notice-dialog');
document.getElementById('close-record-notice').addEventListener('click', () => recordNotice.close());
function closeRecordSelector() {
  recordMenu.hidden = true;
  recordToggle.setAttribute('aria-expanded', 'false');
}
function renderRecordSelector() {
  if (!blocks.some(block => block.id === selectedBlockId)) selectedBlockId = blocks[0].id;
  const selected = blocks.find(block => block.id === selectedBlockId);
  document.getElementById('selected-record-label').textContent = blockLabel(selected, selected === blocks[0]);
  const options = document.getElementById('record-options');
  options.replaceChildren();
  [...blocks].reverse().forEach(block => {
    const row = document.createElement('div');
    row.className = 'record-option' + (block.id === selectedBlockId ? ' selected' : '');
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'record-option-select';
    select.dataset.block = block.id;
    select.textContent = blockLabel(block, block === blocks[0]);
    if (block.id === selectedBlockId) select.setAttribute('aria-current', 'true');
    select.addEventListener('click', () => {
      selectedBlockId = block.id;
      closeRecordSelector();
      viewport.scrollTop = 0;
      renderHabits();
      recordToggle.focus();
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'icon-button delete-record';
    remove.dataset.block = block.id;
    remove.title = 'Eliminar registro';
    remove.setAttribute('aria-label', 'Eliminar registro: ' + select.textContent);
    const trashIcon = document.createElement('img');
    trashIcon.src = 'icons/trash.svg';
    trashIcon.alt = '';
    trashIcon.width = 12;
    trashIcon.height = 12;
    trashIcon.setAttribute('aria-hidden', 'true');
    remove.append(trashIcon);
    remove.addEventListener('click', () => { closeRecordSelector(); requestDeleteRecord(block.id); });
    row.append(select, remove);
    options.append(row);
  });
}
recordToggle.addEventListener('click', () => {
  const open = recordMenu.hidden;
  recordMenu.hidden = !open;
  recordToggle.setAttribute('aria-expanded', String(open));
});
recordSelector.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !recordMenu.hidden) {
    event.preventDefault();
    event.stopPropagation();
    closeRecordSelector();
    recordToggle.focus();
  }
  if (event.key === 'ArrowDown' && event.target === recordToggle) {
    event.preventDefault();
    recordMenu.hidden = false;
    recordToggle.setAttribute('aria-expanded', 'true');
    recordMenu.querySelector('.record-option-select[aria-current], .record-option-select')?.focus();
  }
});
document.addEventListener('click', event => { if (!recordSelector.contains(event.target)) closeRecordSelector(); });
recordSelector.addEventListener('focusout', event => { if (!recordSelector.contains(event.relatedTarget)) closeRecordSelector(); });
document.getElementById('create-record').addEventListener('click', () => {
  closeRecordSelector();
  pendingChange = { habits: blocks[0].habits.map(habit => habit ? { ...habit } : null), blockId: blocks[0].id };
  applyHabitChange(true);
  recordToggle.focus();
});
let habits = blocks[0].habits;
let records = blocks[0].records;
let durableBlocks = JSON.stringify(blocks);
function saveHabitConfiguration() {
  if (DEMO_MODE) return true;
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify({ version: 2, blocks }));
    durableBlocks = JSON.stringify(blocks);
    return true;
  } catch {
    blocks = JSON.parse(durableBlocks);
    habits = blocks[0].habits; records = blocks[0].records;
    if (!blocks.some(block => block.id === selectedBlockId)) selectedBlockId = blocks[0].id;
    renderHabits();
    announcement.textContent = 'No se pudo guardar en este navegador. La edición se revirtió.';
    return false;
  }
}
function blockDates(block) {
  if (blocks.length === 1 && block === blocks[0] && !block.habits.some(Boolean) && !Object.keys(block.records).length) return [dateKey(today)];
  return rangeDates(block.startDate, block.endDate || dateKey(today));
}
function hasDayMarks(block, date) {
  return block.habits.filter(Boolean).some(habit => recordState(recordKey(date, habit.id), block.records) !== 'pending');
}
function closePreviousBlock(previous, next) {
  previous.endDate = dayBefore(next.startDate);
  // Trasladar las marcas del día que cambia de bloque sin borrar su respaldo.
  Object.entries(previous.records).forEach(([key, value]) => {
    if (!validDay(key.slice(0, 10)) || key.slice(0, 10) < next.startDate) return;
    if (next.habits.some(habit => habit?.id === key.slice(11)) && !Object.hasOwn(next.records, key)) next.records[key] = value;
  });
}
function blockLabel(block, current) {
  const start = parseDay(block.startDate).toLocaleDateString('es-CL');
  const name = current ? 'Actual' : 'N°' + (blocks.length - blocks.indexOf(block));
  return name + ' (' + start + ' — ' + (current ? today.toLocaleDateString('es-CL') : parseDay(block.endDate).toLocaleDateString('es-CL')) + ')';
}
function visibleHabits(items) {
  const count = Math.min(SLOT_COUNT, Math.max(5, items.filter(Boolean).length + 1));
  return items.slice(0, count);
}
function buildHeadings(items, block, editable) {
  items = visibleHabits(items);
  const headings = document.createElement('div');
  headings.className = 'habit-headings';
  headings.style.setProperty('--habit-columns', items.length);
  headings.setAttribute('aria-label', editable ? 'Hábitos actuales' : 'Hábitos de este registro');
  if (editable && block.id === blocks[0].id) headings.id = 'habit-headings';
  const spacer = document.createElement('span');
  spacer.setAttribute('aria-hidden', 'true');
  headings.append(spacer);
  items.forEach((habit, index) => {
    const heading = document.createElement(editable ? 'button' : 'div');
    if (editable) heading.type = 'button';
    heading.className = 'habit-heading' + (habit ? '' : ' empty') + (editable ? '' : ' archived');
    heading.title = habit ? habit.name : editable ? 'Crear hábito' : '';
    heading.setAttribute('aria-label', habit ? (editable ? 'Editar ' : '') + habit.name : editable ? 'Crear hábito' : 'Sin hábito');
    heading.dataset.block = block.id;
    if (habit) heading.dataset.habit = habit.id;
    if (habit || editable) heading.append(icon(habit || { icon: 'plus.svg' }));
    if (editable) heading.addEventListener('click', () => openHabitEditor(index, block.id));
    headings.append(heading);
  });
  return headings;
}
function clearDay(block, key) {
  const previous = block.records;
  block.records = Object.fromEntries(Object.entries(previous).filter(([id]) => !id.startsWith(key + ':')));
  if (!saveHabitConfiguration()) { block.records = previous; return; }
  records = blocks[0].records;
  renderHabits();
  viewport.focus({ preventScroll: true });
  announcement.textContent = 'Se vaciaron todas las casillas del ' + parseDay(key).toLocaleDateString('es-CL') + '.';
}
function buildRows(container, items, keys, block) {
  items = visibleHabits(items);
  keys.forEach((key, day) => {
    const row = document.createElement('div');
    row.className = 'habit-row';
    row.style.setProperty('--habit-columns', items.length);
    const date = parseDay(key);
    const label = document.createElement('time');
    label.dateTime = key;
    label.textContent = dateLabel(date);
    label.title = date.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
    label.setAttribute('role', 'button');
    label.tabIndex = 0;
    label.setAttribute('aria-label', label.title + '. Ctrl + clic para vaciar todas las casillas del día.');
    label.setAttribute('aria-keyshortcuts', 'Control+Enter Control+Space');
    label.addEventListener('click', event => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      clearDay(block, key);
    });
    label.addEventListener('keydown', event => {
      if (!event.ctrlKey || !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      clearDay(block, key);
    });
    row.append(label);
    items.forEach((habit, index) => {
      if (!habit) {
        const empty = document.createElement('div');
        empty.className = 'habit-empty';
        empty.setAttribute('aria-hidden', 'true');
        row.append(empty);
        return;
      }
      const button = document.createElement('button');
      const id = recordKey(key, habit.id);
      button.type = 'button';
      button.className = 'habit-cell';
      button.dataset.date = key;
      button.dataset.habit = habit.id;
      button.dataset.block = block.id;
      const updateState = state => {
        button.dataset.state = state;
        button.setAttribute('aria-label', habit.name + ', ' + label.title + ': ' + stateLabels[state]);
        button.setAttribute('aria-pressed', String(state !== 'pending'));
      };
      updateState(recordState(id, block.records));
      button.addEventListener('click', () => {
        const next = { pending: 'completed', completed: 'failed', failed: 'pending' }[button.dataset.state];
        if (next === 'pending') delete block.records[id];
        else block.records[id] = next;
        updateState(next);
        if (saveHabitConfiguration()) announcement.textContent = habit.name + ': ' + stateLabels[next] + '.';
        if (hideEmptyDays.checked && key !== dateKey(today) && !hasDayMarks(block, key)) {
          renderHabits();
          viewport.focus({ preventScroll: true });
        }
      });
      button.addEventListener('keydown', event => {
        const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -items.length, ArrowDown: items.length };
        if (!(event.key in steps)) return;
        event.preventDefault();
        const cells = container.querySelectorAll('.habit-cell, .habit-empty');
        let next = day * items.length + index + steps[event.key];
        while (cells[next]?.classList.contains('habit-empty')) next += steps[event.key];
        cells[next]?.focus();
      });
      row.append(button);
    });
    container.append(row);
  });
}
function renderHabits() {
  renderTestControls();
  renderRecordSelector();
  const scrollTop = viewport.scrollTop;
  grid.replaceChildren();
  dates.length = 0;
  blocks.forEach((block, index) => {
    if (block.id !== selectedBlockId) return;
    const section = document.createElement('section');
    section.className = 'record-block' + (index === 0 ? ' current-record' : '');
    section.dataset.block = block.id;
    section.append(buildHeadings(block.habits, block, true));
    const rows = document.createElement('div');
    rows.className = 'habit-grid record-rows';
    const keys = blockDates(block).filter(key => !hideEmptyDays.checked || key === dateKey(today) || hasDayMarks(block, key));
    if (index === 0) dates.push(...keys);
    buildRows(rows, block.habits, keys, block);
    section.append(rows);
    if (!keys.length) {
      const message = document.createElement('p');
      message.className = 'empty-record-message';
      message.textContent = 'Este registro no tiene días marcados. Desactiva «Ocultar días sin marcar» para ver sus fechas.';
      section.append(message);
    }
    grid.append(section);
  });
  viewport.scrollTop = scrollTop;
  syncScrollbar();
}
function requestDeleteRecord(blockId) {
  const block = blocks.find(item => item.id === blockId);
  if (!block) return;
  deletingBlockId = blockId;
  const current = block === blocks[0];
  const index = blocks.indexOf(block);
  const older = blocks[index + 1];
  document.getElementById('delete-record-description').textContent =
    'Se eliminará este registro completo (' + blockLabel(block, current) + '), incluidos sus hábitos y casillas. Los demás registros se conservarán.' +
    (current ? (blocks.length > 1 ? ' El registro anterior pasará a ser el actual y continuará hasta hoy.' : ' Se abrirá un registro vacío con el día actual.')
      : older ? ' El registro anterior se extenderá hasta el día previo al siguiente registro. Los días incorporados quedarán sin marcar.'
      : ' Su período quedará fuera del historial.');
  deleteRecordDialog.showModal();
}
function cancelDeleteRecord() { deletingBlockId = null; deleteRecordDialog.close(); }
deleteRecordDialog.addEventListener('cancel', () => { deletingBlockId = null; });
document.getElementById('close-delete-record').addEventListener('click', cancelDeleteRecord);
document.getElementById('cancel-delete-record').addEventListener('click', cancelDeleteRecord);
document.getElementById('confirm-delete-record').addEventListener('click', () => {
  const index = blocks.findIndex(block => block.id === deletingBlockId);
  if (index < 0) { cancelDeleteRecord(); return; }
  refreshToday();
  const previous = blocks;
  blocks = blocks.filter(block => block.id !== deletingBlockId);
  if (!blocks.length) {
    blocks.unshift({ id: habitId(), startDate: initialHistoryStart(), endDate: null,
      habits: Array(SLOT_COUNT).fill(null), records: {} });
  } else if (index === 0) {
    const promoted = blocks[0];
    // Los respaldos fuera del período cerrado no deben reaparecer al reabrirlo.
    blocks[0] = { ...promoted, endDate: null, records: Object.fromEntries(Object.entries(promoted.records).filter(([key]) => key.slice(0, 10) <= promoted.endDate)) };
  } else if (index < blocks.length) {
    const older = blocks[index];
    const newer = blocks[index - 1];
    // Incorporar solo las fechas; descartar respaldos fuera del período original.
    blocks[index] = { ...older, endDate: dayBefore(newer.startDate), records: Object.fromEntries(Object.entries(older.records).filter(([key]) => key.slice(0, 10) <= older.endDate)) };
  }
  if (!saveHabitConfiguration()) { blocks = previous; return; }
  habits = blocks[0].habits;
  records = blocks[0].records;
  if (index === 0) { selectedBlockId = blocks[0].id; viewport.scrollTop = 0; }
  cancelDeleteRecord();
  renderHabits();
  recordToggle.focus({ preventScroll: true });
  announcement.textContent = index > 0 && index < blocks.length
    ? 'Registro eliminado. El registro anterior incorpora su período con los días sin marcar.'
    : 'Registro eliminado. Los demás registros se conservan.';
});

function requestHabitChange(nextHabits, { focusId = null, block = blocks[0], ask = true } = {}) {
  refreshToday();
  if (JSON.stringify(nextHabits) === JSON.stringify(block.habits)) {
    editor.close();
    return;
  }
  if (blocks.length === 1 && block === blocks[0] && !block.habits.some(Boolean) && !Object.keys(block.records).length) {
    block.startDate = dateKey(today);
  }
  pendingChange = { habits: nextHabits, focusId, blockId: block.id };
  const keys = blockDates(block);
  if (!ask || block.id !== blocks[0].id || keys.length === 1) {
    applyHabitChange(false);
    return;
  }
  changeDialog.showModal();
}
function applyHabitChange(createNew) {
  if (!pendingChange) return;
  refreshToday();
  const change = pendingChange;
  const target = blocks.find(block => block.id === change.blockId);
  if (!target) { cancelHabitChange(); return; }
  createNew = createNew && target === blocks[0];
  if (createNew && target.startDate >= dateKey(today)) {
    pendingChange = null;
    changeDialog.close();
    recordNotice.showModal();
    return;
  }
  if (createNew) {
    const next = { id: habitId(), startDate: dateKey(today), endDate: null,
      habits: change.habits, records: {} };
    closePreviousBlock(blocks[0], next);
    blocks.unshift(next);
    selectedBlockId = next.id;
  } else {
    target.habits = change.habits;
    const ids = new Set(target.habits.filter(Boolean).map(habit => habit.id));
    target.records = Object.fromEntries(Object.entries(target.records).filter(([key]) => ids.has(key.slice(11))));
  }
  habits = blocks[0].habits;
  records = blocks[0].records;
  const saved = saveHabitConfiguration();
  pendingChange = null;
  changeDialog.close();
  if (editor.open) editor.close();
  renderHabits();
  if (createNew) viewport.scrollTop = 0;
  const editedBlock = createNew ? blocks[0] : target;
  const index = change.focusId ? editedBlock.habits.findIndex(habit => habit?.id === change.focusId) : editedBlock.habits.findIndex(habit => !habit);
  const section = [...grid.querySelectorAll('.record-block')].find(el => el.dataset.block === editedBlock.id);
  section?.querySelectorAll(':scope > .habit-headings .habit-heading')[Math.max(0, index)]?.focus({ preventScroll: true });
  if (saved) announcement.textContent = createNew ? 'Nuevo registro creado. Los registros anteriores están disponibles en el selector.' : 'Registro actualizado. Las casillas guardadas se conservan.';
}
function cancelHabitChange() { pendingChange = null; changeDialog.close(); }
changeDialog.addEventListener('cancel', () => { pendingChange = null; });
document.getElementById('modify-record').addEventListener('click', () => applyHabitChange(false));
document.getElementById('new-record').addEventListener('click', () => applyHabitChange(true));
document.getElementById('close-change').addEventListener('click', cancelHabitChange);
document.getElementById('cancel-change').addEventListener('click', cancelHabitChange);
function refreshToday() {
  const now = effectiveToday();
  if (dateKey(now) !== dateKey(today)) {
    today = now;
    renderHabits();
  }
}
const refreshTimer = setInterval(refreshToday, 60000);
trackerWindow.addEventListener('focus', refreshToday);

function openHabitEditor(index, blockId = blocks[0].id) {
  editingIndex = index;
  editingBlockId = blockId;
  const block = blocks.find(item => item.id === blockId);
  if (!block) return;
  const habit = block.habits[index];
  document.getElementById('habit-editor-title').textContent = habit ? 'Editar hábito' : 'Crear hábito';
  document.getElementById('save-habit').textContent = habit ? 'Guardar' : 'Crear';
  document.getElementById('delete-habit').hidden = !habit;
  nameInput.value = habit?.name || '';
  nameInput.setCustomValidity('');
  selectHabitIcon(habit?.icon || defaultHabits[0].icon);
  editor.showModal();
  nameInput.focus();
}

function selectHabitIcon(value) {
  iconValue.value = value;
  const selected = icon({ icon: value });
  selected.id = 'selected-habit-icon';
  document.getElementById('selected-habit-icon').replaceWith(selected);
  const option = iconOptions.find(item => item.icon === value);
  document.getElementById('choose-habit-icon').setAttribute('aria-label', 'Cambiar icono: ' + (option?.name || 'hábito'));
}
const iconSearch = document.getElementById('habit-icon-search');
function renderIconPicker() {
  const picker = document.getElementById('icon-picker');
  const query = normalizeIconSearch(iconSearch.value);
  const matches = searchableIcons.filter(option => option.search.includes(query));
  picker.replaceChildren();
  matches.forEach(option => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-option';
    button.dataset.icon = option.icon;
    button.title = option.name;
    button.setAttribute('aria-label', option.name);
    button.setAttribute('aria-pressed', String(iconValue.value === option.icon));
    button.append(icon(option));
    button.addEventListener('click', () => {
      selectHabitIcon(option.icon);
      iconDialog.close();
    });
    picker.append(button);
  });
  document.getElementById('icon-search-empty').hidden = matches.length > 0;
}
iconSearch.addEventListener('input', renderIconPicker);
document.getElementById('choose-habit-icon').addEventListener('click', () => {
  iconSearch.value = '';
  renderIconPicker();
  iconDialog.showModal();
  iconSearch.focus();
});
document.getElementById('close-icon-dialog').addEventListener('click', () => iconDialog.close());

nameInput.addEventListener('input', () => nameInput.setCustomValidity(''));
habitForm.addEventListener('submit', event => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.setCustomValidity('Escribe un nombre para el hábito.');
    nameInput.reportValidity();
    return;
  }
  const selectedIcon = new FormData(habitForm).get('icon');
  const block = blocks.find(item => item.id === editingBlockId);
  if (!block) return;
  const existing = block.habits[editingIndex];
  const duplicate = block.habits.filter(Boolean).some(habit =>
    habit.id !== existing?.id && statisticsHabitName(habit.name) === statisticsHabitName(name));
  if (duplicate) {
    nameInput.setCustomValidity('Ya existe un hábito con este nombre en este registro. Elige otro nombre.');
    nameInput.reportValidity();
    return;
  }
  const habit = { id: existing?.id || habitId(), name, icon: selectedIcon };
  const next = block.habits.map(item => item ? { ...item } : null);
  next[editingIndex] = habit;
  requestHabitChange([...next.filter(Boolean), ...next.filter(item => !item)], { focusId: habit.id, block });
});
document.getElementById('delete-habit').addEventListener('click', () => {
  const block = blocks.find(item => item.id === editingBlockId);
  if (!block) return;
  const habit = block.habits[editingIndex];
  if (!habit) return;
  const next = block.habits.map(item => item ? { ...item } : null);
  next.splice(editingIndex, 1);
  next.push(null);
  requestHabitChange(next, { block });
});
document.getElementById('close-editor').addEventListener('click', () => editor.close());
document.getElementById('cancel-editor').addEventListener('click', () => editor.close());

const trackerBody = document.querySelector('.tracker-body');
let columnDrag = null;
let suppressColumnClick = false;
let suppressClickTimer;

// Conservar el clic corto y el scroll táctil; activar el arrastre tras 450 ms.
trackerBody.addEventListener('pointerdown', event => {
  if (!columnDrag && event.isPrimary) {
    suppressColumnClick = false;
    clearTimeout(suppressClickTimer);
  }
  const source = event.target.closest('.habit-heading, .habit-cell');
  if (!source || event.button !== 0 || !event.isPrimary || columnDrag) return;
  const section = source.closest('.record-block');
  const block = blocks.find(item => item.id === section?.dataset.block);
  if (!block) return;
  const habitId = source.dataset.habit;
  const from = habitId ? block.habits.findIndex(habit => habit?.id === habitId) : -1;
  columnDrag = { source, habitId, block, section, from, to: from, pointerId: event.pointerId,
    startX: event.clientX, startY: event.clientY, active: false };
  if (from < 0) return;
  columnDrag.timer = setTimeout(() => {
    const state = columnDrag;
    if (!state) return;
    state.active = true;
    state.columns = state.block.habits.filter(Boolean).map(habit => {
      const elements = [...state.section.querySelectorAll(':scope > .habit-headings [data-habit], :scope > .record-rows [data-habit]')].filter(el => el.dataset.habit === habit.id);
      return { id: habit.id, elements, left: elements[0].getBoundingClientRect().left };
    });
    state.source.setPointerCapture(state.pointerId);
    document.body.classList.add('reordering-habits');
    state.columns[state.from].elements.forEach(el => el.classList.add('habit-column-dragging'));
    announcement.textContent = `Arrastrando ${state.block.habits[state.from].name}.`;
  }, 450);
});

document.addEventListener('pointermove', event => {
  const state = columnDrag;
  if (!state || event.pointerId !== state.pointerId) return;
  if (!state.active) {
    if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > 8) finishColumnDrag(false);
    return;
  }
  event.preventDefault();
  const origin = state.columns[state.from].left;
  const dx = Math.max(state.columns[0].left - origin,
    Math.min(state.columns.at(-1).left - origin, event.clientX - state.startX));
  const destination = origin + dx;
  state.to = state.columns.reduce((best, column, index) =>
    Math.abs(column.left - destination) < Math.abs(state.columns[best].left - destination) ? index : best, 0);
  const order = state.columns.map(column => column.id);
  order.splice(state.to, 0, order.splice(state.from, 1)[0]);
  state.columns.forEach((column, index) => {
    const shift = index === state.from ? dx : state.columns[order.indexOf(column.id)].left - column.left;
    column.elements.forEach(el => {
      el.style.setProperty('--habit-drag-x', `${shift}px`);
      if (index !== state.from) el.classList.add('habit-column-shifting');
    });
  });
}, { passive: false });

function blockColumnClick() {
  suppressColumnClick = true;
  clearTimeout(suppressClickTimer);
  suppressClickTimer = setTimeout(() => { suppressColumnClick = false; }, 350);
}

function finishColumnDrag(commit) {
  const state = columnDrag;
  if (!state) return;
  columnDrag = null;
  clearTimeout(state.timer);
  if (!state.active) return;
  blockColumnClick();
  if (state.source.hasPointerCapture(state.pointerId)) state.source.releasePointerCapture(state.pointerId);
  document.body.classList.remove('reordering-habits');
  state.columns.forEach(column => column.elements.forEach(el => {
    el.classList.remove('habit-column-dragging', 'habit-column-shifting');
    el.style.removeProperty('--habit-drag-x');
  }));
  if (commit && state.to !== state.from) {
    const next = state.block.habits.map(habit => habit ? { ...habit } : null);
    const moved = next.splice(state.from, 1)[0];
    next.splice(state.to, 0, moved);
    requestHabitChange(next, { focusId: moved.id, block: state.block, ask: false });
  }
}
document.addEventListener('pointerup', event => {
  if (event.pointerId !== columnDrag?.pointerId) return;
  const tap = event.pointerType === 'touch' && !columnDrag.active ? columnDrag.source : null;
  finishColumnDrag(true);
  if (tap) {
    // Activar el tap directamente y descartar su clic nativo duplicado.
    blockColumnClick();
    tap.click();
  }
});
document.addEventListener('pointercancel', event => {
  if (event.pointerId === columnDrag?.pointerId) finishColumnDrag(false);
});
trackerBody.addEventListener('lostpointercapture', event => {
  if (event.pointerId === columnDrag?.pointerId) finishColumnDrag(false);
});
trackerBody.addEventListener('click', event => {
  if (!suppressColumnClick || event.detail === 0) return;
  suppressColumnClick = false;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
trackerBody.addEventListener('contextmenu', event => {
  if (event.target.closest('[data-habit]')) event.preventDefault();
});
trackerBody.addEventListener('dragstart', event => event.preventDefault());
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && columnDrag?.active) {
    event.preventDefault();
    event.stopImmediatePropagation();
    finishColumnDrag(false);
  }
}, true);
trackerWindow.addEventListener('blur', () => finishColumnDrag(false));

function syncScrollbar() {
  const maxScroll = viewport.scrollHeight - viewport.clientHeight;
  const height = Math.min(track.clientHeight, Math.max(32, track.clientHeight * viewport.clientHeight / viewport.scrollHeight));
  thumb.style.height = `${height}px`;
  thumb.style.top = `${maxScroll > 0 ? (track.clientHeight - height) * viewport.scrollTop / maxScroll : 0}px`;
  document.getElementById('scroll-up').disabled = viewport.scrollTop <= 0;
  document.getElementById('scroll-down').disabled = viewport.scrollTop >= maxScroll - 1;
}
viewport.addEventListener('scroll', syncScrollbar, { passive: true });
const resizeObserver = new ResizeObserver(syncScrollbar);
resizeObserver.observe(viewport);
document.getElementById('scroll-up').addEventListener('click', () => viewport.scrollBy({ top: -160, behavior: 'smooth' }));
document.getElementById('scroll-down').addEventListener('click', () => viewport.scrollBy({ top: 160, behavior: 'smooth' }));
track.addEventListener('pointerdown', event => {
  if (event.target === thumb) return;
  viewport.scrollBy({ top: event.clientY < thumb.getBoundingClientRect().top ? -viewport.clientHeight : viewport.clientHeight, behavior: 'smooth' });
});
let drag = null;
thumb.addEventListener('pointerdown', event => {
  drag = { y: event.clientY, scroll: viewport.scrollTop };
  thumb.setPointerCapture(event.pointerId);
  event.preventDefault();
});
thumb.addEventListener('pointermove', event => {
  if (!drag) return;
  const travel = track.clientHeight - thumb.clientHeight;
  if (travel > 0) viewport.scrollTop = drag.scroll + (event.clientY - drag.y) * (viewport.scrollHeight - viewport.clientHeight) / travel;
});
thumb.addEventListener('lostpointercapture', () => { drag = null; });

function closeTracker() { closeDialogs(); onClose(); }
document.getElementById('close-tracker').addEventListener('click', closeTracker);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !event.isComposing && !event.defaultPrevented) {
    event.preventDefault();
    if (!event.repeat) handleEscape();
  }
});
// Only visible dates belong to a block. Older blocks keep backup marks outside
// their interval, which must never contribute twice to statistics.
function statisticsHabitName(name) {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es');
}

const statsRangeDialog = document.getElementById('stats-range-dialog');
const statsPeriodSettings = {
  line: { preset: 'weeks8', custom: null },
  squares: { preset: 'days30', custom: null }
};
function activeStatsSetting() { return statsPeriodSettings[document.getElementById('stats-chart-type').value]; }
function rangeFromQuantity(end, unit, quantity) {
  const from = parseDay(end);
  from.setDate(from.getDate() - quantity * ({ days: 1, weeks: 7, months: 30 }[unit]) + 1);
  return { from: dateKey(from), end, unit };
}
function resolvedStatsRange() {
  const setting = activeStatsSetting();
  if (setting.preset === 'custom' && setting.custom) {
    const custom = setting.custom;
    if (custom.mode === 'record') {
      const block = blocks.find(block => block.id === custom.blockId);
      if (block) {
        const end = block.endDate || dateKey(today);
        const count = blockDates(block).length;
        return { from: block.startDate, end, unit: count <= 31 ? 'days' : count <= 180 ? 'weeks' : 'months', block };
      }
      setting.preset = document.getElementById('stats-chart-type').value === 'line' ? 'weeks8' : 'days30';
      setting.custom = null;
    } else return rangeFromQuantity(custom.end, custom.unit, custom.quantity);
  }
  const preset = setting.preset;
  const unit = preset.startsWith('weeks') ? 'weeks' : preset.startsWith('months') ? 'months' : 'days';
  return rangeFromQuantity(dateKey(today), unit, Number(preset.replace(/\D/g, '')));
}
function syncStatsPeriodSelector() {
  const select = document.getElementById('stats-show');
  select.replaceChildren();
  const options = document.getElementById('stats-chart-type').value === 'line'
    ? [['weeks8', 'Últimas 8 semanas'], ['months8', 'Últimos 8 meses']]
    : [['days30', 'Últimos 30 días'], ['days50', 'Últimos 50 días'], ['days100', 'Últimos 100 días']];
  [...options, ['custom', 'Personalizado']].forEach(([value, label]) => select.add(new Option(label, value)));
  select.value = activeStatsSetting().preset;
}
function populateStatisticsHabits(sourceBlocks = blocks) {
  const select = document.getElementById('stats-habit');
  const previous = select.value;
  select.replaceChildren();
  const catalog = new Map();
  sourceBlocks.forEach(block => block.habits.filter(Boolean).forEach(habit => {
    const name = statisticsHabitName(habit.name);
    if (!catalog.has(name)) catalog.set(name, habit);
  }));
  catalog.forEach((habit, name) => select.add(new Option(habit.name, name)));
  select.disabled = !catalog.size;
  if (catalog.has(previous)) select.value = previous;
}
function updateStatsRangeDraft() {
  const recordMode = document.getElementById('stats-use-record').checked;
  document.getElementById('stats-range-fields').disabled = recordMode;
  document.getElementById('stats-record').disabled = !recordMode;
  const quantity = document.getElementById('stats-quantity');
  const unit = document.getElementById('stats-unit').value;
  quantity.max = { days: 366, weeks: 52, months: 24 }[unit];
  const end = document.getElementById('stats-end-date').value;
  const block = blocks.find(block => block.id === document.getElementById('stats-record').value);
  let description = '';
  if (recordMode && block) description = blockLabel(block, block === blocks[0]);
  else if (validDay(end) && quantity.checkValidity() && quantity.value) {
    const range = rangeFromQuantity(end, unit, Number(quantity.value));
    description = parseDay(range.from).toLocaleDateString('es-CL') + ' — ' + parseDay(range.end).toLocaleDateString('es-CL');
    if (unit === 'months') description += ' · Meses de 30 días';
  }
  document.getElementById('stats-range-preview').textContent = description;
}
function openStatsRange() {
  const setting = activeStatsSetting();
  const range = resolvedStatsRange();
  const custom = setting.custom;
  document.getElementById('stats-end-date').value = custom?.mode === 'range' ? custom.end : range.end;
  document.getElementById('stats-unit').value = custom?.mode === 'range' ? custom.unit : range.unit;
  document.getElementById('stats-quantity').value = custom?.mode === 'range' ? custom.quantity : setting.preset === 'custom' ? 1 : Number(setting.preset.replace(/\D/g, ''));
  const records = document.getElementById('stats-record');
  records.replaceChildren();
  blocks.forEach((block, index) => {
    const option = new Option(blockLabel(block, index === 0), block.id);
    option.disabled = (block.endDate || dateKey(today)) < block.startDate;
    records.add(option);
  });
  records.value = custom?.mode === 'record' && blocks.some(block => block.id === custom.blockId) ? custom.blockId : selectedBlockId;
  document.getElementById('stats-use-record').checked = custom?.mode === 'record';
  updateStatsRangeDraft();
  statsRangeDialog.showModal();
}
function cancelStatsRange() { statsRangeDialog.close(); syncStatsPeriodSelector(); }
document.getElementById('close-stats-range').addEventListener('click', cancelStatsRange);
document.getElementById('cancel-stats-range').addEventListener('click', cancelStatsRange);
statsRangeDialog.addEventListener('cancel', syncStatsPeriodSelector);
['stats-end-date', 'stats-unit', 'stats-quantity', 'stats-use-record', 'stats-record'].forEach(id => document.getElementById(id).addEventListener('change', updateStatsRangeDraft));
document.getElementById('stats-range-form').addEventListener('submit', event => {
  event.preventDefault();
  const setting = activeStatsSetting();
  if (document.getElementById('stats-use-record').checked) {
    const blockId = document.getElementById('stats-record').value;
    const block = blocks.find(block => block.id === blockId);
    if (!block || (block.endDate || dateKey(today)) < block.startDate) return;
    setting.custom = { mode: 'record', blockId };
  } else {
    const end = document.getElementById('stats-end-date').value;
    if (!validDay(end)) return;
    setting.custom = { mode: 'range', end, unit: document.getElementById('stats-unit').value, quantity: Number(document.getElementById('stats-quantity').value) };
  }
  setting.preset = 'custom';
  statsRangeDialog.close();
  const range = resolvedStatsRange();
  populateStatisticsHabits(range.block ? [range.block] : blocks);
  renderStatisticsCharts();
});
document.getElementById('stats-show').addEventListener('change', event => {
  if (event.target.value === 'custom') { openStatsRange(); return; }
  activeStatsSetting().preset = event.target.value;
  populateStatisticsHabits();
  renderStatisticsCharts();
});
document.getElementById('stats-chart-type').addEventListener('change', () => {
  const range = resolvedStatsRange();
  populateStatisticsHabits(range.block ? [range.block] : blocks);
  renderStatisticsCharts();
});
function statisticsDays(habitName, sourceBlocks = blocks) {
  if (!habitName) return [];
  const days = new Map();
  sourceBlocks.forEach(block => {
    blockDates(block).forEach(date => {
      if (!days.has(date)) days.set(date, new Map());
      const entries = days.get(date);
      const available = block.habits.filter(Boolean);
      available.forEach(habit => {
        const name = statisticsHabitName(habit.name);
        if (name !== habitName) return;
        const state = recordState(recordKey(date, habit.id), block.records);
        if (state === 'pending') return;
        // One habit per day, even when matching names have different IDs.
        if (!entries.has(name) || state === 'completed') entries.set(name, state);
      });
    });
  });
  if (!days.size) return [];
  const first = [...days.keys()].sort()[0];
  return rangeDates(first, dateKey(today)).reverse().map(date => {
    const entries = days.get(date) || new Map();
    return { date, total: entries.size, completed: [...entries.values()].filter(state => state === 'completed').length };
  });
}

const statsDayTooltip = document.getElementById('stats-day-tooltip');
function hideStatsDayTooltip() { statsDayTooltip.hidden = true; }
function showStatsDayTooltip(cell) {
  statsDayTooltip.textContent = cell.dataset.tooltip;
  statsDayTooltip.hidden = false;
  const rect = cell.getBoundingClientRect();
  const tooltipRect = statsDayTooltip.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - tooltipRect.width / 2, trackerWindow.innerWidth - tooltipRect.width - 8));
  const top = rect.top - tooltipRect.height - 6;
  statsDayTooltip.style.left = left + 'px';
  statsDayTooltip.style.top = (top >= 8 ? top : rect.bottom + 6) + 'px';
}
stats.addEventListener('scroll', hideStatsDayTooltip, true);
stats.addEventListener('close', hideStatsDayTooltip);
stats.addEventListener('cancel', hideStatsDayTooltip);
trackerWindow.addEventListener('resize', hideStatsDayTooltip);

function renderStatisticsCharts() {
  hideStatsDayTooltip();
  const selected = document.getElementById('stats-habit').value;
  const range = resolvedStatsRange();
  syncStatsPeriodSelector();
  const end = parseDay(range.end);
  const from = parseDay(range.from);
  const history = new Map(statisticsDays(selected, range.block ? [range.block] : blocks).map(day => [day.date, day]));
  const days = selected ? rangeDates(dateKey(from), dateKey(end)).reverse().map(date => history.get(date) || { date, total: 0, completed: 0 }) : [];
  const squares = document.getElementById('stats-chart-type').value === 'squares';
  document.getElementById('stats-line-section').hidden = squares;
  document.getElementById('stats-squares-section').hidden = !squares;
  const unit = range.unit;
  const bucketDays = { days: 1, weeks: 7, months: 30 }[unit];
  const groups = new Map();
  days.forEach((day, index) => {
    const start = new Date(from);
    start.setDate(start.getDate() + Math.floor(index / bucketDays) * bucketDays);
    const key = dateKey(start);
    if (!groups.has(key)) groups.set(key, { start: key, total: 0, completed: 0 });
    const group = groups.get(key);
    group.total += day.total;
    group.completed += day.completed;
  });
  const buckets = [...groups.values()];
  const chart = document.getElementById('stats-line-chart');
  const shortDate = key => parseDay(key).toLocaleDateString('es', { day: 'numeric', month: 'short' });
  const svg = ['<svg viewBox="0 0 200 120" role="img" aria-label="Porcentaje de hábitos completados por ' + ({ days: 'día', weeks: 'semana', months: 'mes' }[unit]) + '">'];
  [0, 25, 50, 75, 100].forEach(value => {
    const y = 100 - value * .9;
    svg.push(`<line x1="20" y1="${y}" x2="190" y2="${y}" stroke="var(--border-light)" stroke-dasharray="1.5,1.5" stroke-width=".35"/><text x="17" y="${y}" text-anchor="end" dominant-baseline="central" fill="var(--text-muted)" font-size="4.5">${value}%</text>`);
  });
  let path = '';
  const points = buckets.map((bucket, index) => {
    const value = bucket.total ? bucket.completed / bucket.total * 100 : null;
    const x = buckets.length === 1 ? 105 : 20 + index / (buckets.length - 1) * 170;
    const y = 100 - (value || 0) * .9;
    if (value === null) path += ' ';
    else path += `${index === 0 || !buckets[index - 1].total ? 'M' : 'L'}${x},${y} `;
    return { bucket, value, x, y };
  });
  svg.push(`<path d="${path}" fill="none" stroke="#50a9ed" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`);
  points.forEach(({ bucket, value, x, y }, index) => {
    if (value !== null) {
      svg.push(`<circle cx="${x}" cy="${y}" r=".8" fill="#50a9ed"/><circle cx="${x}" cy="${y}" r="4" fill="transparent"><title>${shortDate(bucket.start)}: ${Math.round(value)}% (${bucket.completed}/${bucket.total})</title></circle>`);
    }
    if (index % Math.max(1, Math.ceil(buckets.length / 6)) === 0 || index === buckets.length - 1) {
      const label = shortDate(bucket.start);
      svg.push(`<text x="${x}" y="111" text-anchor="${index === 0 ? 'start' : index === buckets.length - 1 ? 'end' : 'middle'}" fill="var(--text-muted)" font-size="4.5" font-weight="600">${label}</text>`);
    }
  });
  svg.push('<path d="M20,5 V100 H195 M17.6,7.4 L20,5 L22.4,7.4 M192.6,97.6 L195,100 L192.6,102.4" fill="none" stroke="#111" stroke-width=".8" stroke-linecap="round" stroke-linejoin="round"/></svg>');
  chart.innerHTML = days.some(day => day.total) ? svg.join('') : '';

  const grid = document.getElementById('stats-habit-chart');
  grid.replaceChildren();
  const visibleDays = days.filter(day => !document.getElementById('stats-hide-empty-days').checked || day.total);
  document.getElementById('stats-empty-message').hidden = visibleDays.length > 0;
  visibleDays.slice().reverse().forEach(day => {
    const cell = document.createElement('div');
    cell.className = 'stats-day';
    cell.dataset.date = day.date;
    cell.dataset.state = !day.total ? 'empty' : day.completed ? 'completed' : 'failed';
    const date = parseDay(day.date);
    const state = !day.total ? 'sin registrar' : day.completed ? 'completado' : 'no realizado';
    cell.dataset.tooltip = `${date.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}: ${state}`;
    cell.setAttribute('aria-label', `${date.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}: ${state}`);
    cell.addEventListener('mouseenter', () => showStatsDayTooltip(cell));
    cell.addEventListener('mouseleave', hideStatsDayTooltip);
    cell.addEventListener('focus', () => showStatsDayTooltip(cell));
    cell.addEventListener('blur', hideStatsDayTooltip);
    cell.tabIndex = 0;
    grid.append(cell);
  });
  const completedDays = days.filter(day => day.completed).length;
  const recordedDays = days.filter(day => day.total).length;
  let best = 0;
  let streak = 0;
  days.forEach(day => { streak = day.completed ? streak + 1 : 0; best = Math.max(best, streak); });
  const summary = document.getElementById('stats-habit-summary');
  summary.replaceChildren();
  const proportion = document.createElement('strong');
  proportion.textContent = `${completedDays}/${recordedDays}`;
  const percentage = document.createElement('span');
  percentage.className = 'stats-compliance-percent';
  percentage.textContent = recordedDays ? `${Math.round(completedDays / recordedDays * 100)}%` : 'Sin días marcados';
  summary.append('Constancia: ', proportion, ' ', percentage);
  if (selected) summary.append(` · Mejor racha: ${best} ${best === 1 ? 'día' : 'días'}`);
  else summary.textContent = 'No hay hábitos para consultar.';
}

['stats-habit', 'stats-hide-empty-days'].forEach(id => document.getElementById(id).addEventListener('change', renderStatisticsCharts));

document.getElementById('show-stats').addEventListener('click', () => {
  const range = resolvedStatsRange();
  populateStatisticsHabits(range.block ? [range.block] : blocks);
  renderStatisticsCharts();
  stats.showModal();
});
document.getElementById('close-stats').addEventListener('click', () => stats.close());
renderHabits();
function closeDialogs() {
  closeRecordSelector(); finishColumnDrag(false);
  root.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  hideStatsDayTooltip();
}
function handleEscape() {
  if (columnDrag?.active) { finishColumnDrag(false); return; }
  const dialogs = [...root.querySelectorAll('dialog[open]')];
  const dialog = root.activeElement?.closest('dialog[open]') || dialogs.at(-1);
  if (dialog) {
    // Ejecutar los mismos callbacks de cancelación que Escape nativo.
    if (dialog.dispatchEvent(new Event('cancel', { cancelable:true }))) dialog.close();
    return;
  }
  if (!recordMenu.hidden) { closeRecordSelector(); recordToggle.focus(); return; }
  closeTracker();
}
// Evitar que Tab abandone el panel principal; los dialog nativos gestionan su foco.
root.addEventListener('keydown', event => {
  if(event.key !== 'Tab' || root.querySelector('dialog[open]')) return;
  const elements = [...backdrop.querySelectorAll('button,input,select,[tabindex="0"]')].filter(el=>!el.disabled && !el.hidden && el.getClientRects().length);
  const first=elements[0], last=elements.at(-1);
  if(event.shiftKey && root.activeElement===first) { event.preventDefault(); last?.focus(); }
  else if(!event.shiftKey && root.activeElement===last) { event.preventDefault(); first?.focus(); }
}, {signal:controller.signal});
return {
  snapshot: () => ({version:2,blocks:JSON.parse(JSON.stringify(blocks))}),
  hideEmptyDays: () => hideEmptyDays.checked,
  selectedBlockId: () => selectedBlockId,
  focus: () => { refreshToday(); syncScrollbar(); document.getElementById('close-tracker').focus(); },
  closeDialogs,
  handleEscape,
  destroy: () => { closeDialogs(); controller.abort(); clearInterval(refreshTimer); resizeObserver.disconnect(); }
};
}
})();

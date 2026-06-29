// ─── Auth listener bootstrap ─────────────────────────────────────────────────
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    document.body.classList.remove('not-logged-in');
    hideAuthScreen();
    await startApp();
    setupUserMenu();
    if (!welcomeShownThisSession && localStorage.getItem('welcome_dismissed_v2') !== 'true') {
      welcomeShownThisSession = true;
      setTimeout(() => showWelcomeModal(), 600);
    }
  } else {
    // Inicializar el calendario vacío con fechas correctas de fondo
    initializeEmptyCalendar();

    // Programar el modal de inicio de sesión tras el splash (1.5s splash + 0.7s de espera)
    setTimeout(() => {
      showAuthScreen();
    }, 2200);
  }
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      showAuthScreen();
      showResetPasswordForm();
      return;
    }
    if (event === 'SIGNED_IN' && session?.user) {
      // Supabase re-emite SIGNED_IN (revalidacion de token) cada vez que la
      // pestaña/app vuelve a primer plano. Si ya estamos dentro con el mismo
      // usuario, NO reinicializamos la app: hacerlo reconstruia el feed y
      // saltaba la vista al dia de hoy (perdiendo el dia que estabas viendo
      // en movil). Solo arrancamos si es un inicio de sesion nuevo.
      if (currentUser && currentUser.id === session.user.id) {
        return;
      }
      currentUser = session.user;
      document.body.classList.remove('not-logged-in');
      hideAuthScreen();
      await startApp();
      setupUserMenu();
      if (!welcomeShownThisSession && localStorage.getItem('welcome_dismissed_v2') !== 'true') {
        welcomeShownThisSession = true;
        setTimeout(() => showWelcomeModal(), 600);
      }
    } else if (event === 'SIGNED_OUT') {
      const wasIntentional = intentionalLogout;
      intentionalLogout = false;
      currentUser = null;
      document.body.classList.add('not-logged-in');
      resetApp(wasIntentional);
      showAuthScreen();
      const avatars = document.querySelectorAll('.user-avatar');
      avatars.forEach(avatar => {
        const span = avatar.querySelector('span');
        if (span) span.textContent = 'U';
        avatar.title = 'Perfil de usuario';
        avatar.classList.remove('active');
        delete avatar.dataset.menuBound;
      });
    }
  });
}

// --- Initial Data Structures & Default Tags ---
const DEFAULT_COLORS = [
  { bg: '#f49734', text: '#ffffff', border: '#f49734' },
  { bg: '#f9cf39', text: '#ffffff', border: '#f9cf39' },
  { bg: '#9cdb43', text: '#ffffff', border: '#9cdb43' },
  { bg: '#30c55f', text: '#ffffff', border: '#30c55f' },
  { bg: '#3ee7ea', text: '#ffffff', border: '#3ee7ea' },
  { bg: '#2695ab', text: '#ffffff', border: '#2695ab' },
  { bg: '#50a9ed', text: '#ffffff', border: '#50a9ed' },
  { bg: '#6234d5', text: '#ffffff', border: '#6234d5' },
  { bg: '#a978f7', text: '#ffffff', border: '#a978f7' },
  { bg: '#f26ee9', text: '#ffffff', border: '#f26ee9' },
  { bg: '#f45781', text: '#ffffff', border: '#f45781' },
  { bg: '#ca3f3f', text: '#ffffff', border: '#ca3f3f' },
  { bg: '#9e9e9e', text: '#ffffff', border: '#9e9e9e' }
];

const INITIAL_TAGS = [
  { id: 'default', name: 'Por defecto', color: DEFAULT_COLORS[6], colorIndex: 6 } // Blue (#50a9ed)
];

// Map old background colors to new DEFAULT_COLORS indices for automatic migration
const OLD_BG_TO_INDEX = {
  // Original default colors
  'hsl(350, 80%, 91%)': 9,   // Rose -> Magenta/Pink
  'hsl(10, 85%, 91%)': 10,   // Carmine -> Red/Coral
  'hsl(15, 85%, 91%)': 10,   // Coral -> Red/Coral
  'hsl(25, 85%, 90%)': 0,    // Apricot -> Orange
  'hsl(48, 85%, 88%)': 1,    // Yellow/Lemon -> Yellow
  'hsl(75, 70%, 89%)': 2,    // Lime -> Lime
  'hsl(100, 50%, 90%)': 2,   // Olive -> Lime
  'hsl(140, 60%, 90%)': 3,   // Mint Green -> Green
  'hsl(175, 55%, 90%)': 4,   // Sage/Teal -> Cyan/Teal
  'hsl(185, 65%, 89%)': 5,   // Cyan -> Blue/Teal
  'hsl(200, 75%, 90%)': 6,   // Sky Blue -> Blue
  'hsl(220, 75%, 91%)': 6,   // Indigo -> Blue
  'hsl(235, 75%, 91%)': 7,   // Royal Blue -> Indigo
  'hsl(265, 65%, 91%)': 8,   // Lavender -> Purple
  'hsl(285, 60%, 91%)': 8,   // Violet/Plum -> Purple
  'hsl(310, 65%, 91%)': 9,   // Orchid -> Magenta/Pink
  'hsl(330, 75%, 91%)': 9,   // Strong Pink -> Magenta/Pink
  'hsl(210, 40%, 90%)': 12,  // Slate -> Gris
  'hsl(60, 65%, 88%)': 1,    // Khaki -> Yellow
  'hsl(30, 65%, 90%)': 0,    // Terracota -> Orange
  'hsl(0, 0%, 89%)': 13,     // Charcoal -> Light Gris

  // Previous migration mapped backgrounds
  'hsl(350, 65%, 94%)': 9,
  'hsl(15, 60%, 94%)': 10,
  'hsl(25, 70%, 93%)': 0,
  'hsl(48, 65%, 92%)': 1,
  'hsl(100, 35%, 93%)': 2,
  'hsl(140, 45%, 93%)': 3,
  'hsl(175, 45%, 92%)': 4,
  'hsl(185, 50%, 93%)': 5,
  'hsl(200, 65%, 93%)': 6,
  'hsl(220, 60%, 94%)': 6,
  'hsl(265, 50%, 94%)': 8,
  'hsl(310, 45%, 94%)': 9,
  'hsl(210, 25%, 94%)': 12,
  'hsl(0, 0%, 93%)': 13,

  // Hex colors from the first 14-color palette revision
  '#ff9729': 0,
  '#ffd333': 1,
  '#a9ef48': 2,
  '#30c54e': 3,
  '#43d6d3': 4,
  '#189eb9': 5,
  '#24a7ff': 6,
  '#6224c6': 7,
  '#a770ff': 8,
  '#f967ef': 9,
  '#fe4d6b': 10,
  '#c53434': 11,
  '#9e9e9e': 12,
  '#cccccc': 13
};

function parseToRgb(colorStr) {
  if (!colorStr) return [0, 0, 0];
  colorStr = colorStr.trim().toLowerCase();
  
  if (colorStr.startsWith('#')) {
    let hex = colorStr.substring(1);
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    return [r, g, b];
  }
  
  if (colorStr.startsWith('hsl')) {
    const matches = colorStr.match(/hsla?\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%/i);
    if (matches) {
      const h = parseInt(matches[1]) / 360;
      const s = parseInt(matches[2]) / 100;
      const l = parseInt(matches[3]) / 100;
      
      let r, g, b;
      if (s === 0) {
        r = g = b = l;
      } else {
        const hue2rgb = (p, q, t) => {
          if (t < 0) t += 1;
          if (t > 1) t -= 1;
          if (t < 1/6) return p + (q - p) * 6 * t;
          if (t < 1/2) return q;
          if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
          return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
      }
      return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }
  }
  
  return [0, 0, 0];
}

function findClosestColorIndex(colorStr) {
  if (!colorStr) return 0;
  
  const normalized = colorStr.replace(/\s+/g, '').toLowerCase();
  
  // 1. Exact match in OLD_BG_TO_INDEX
  for (const oldBg in OLD_BG_TO_INDEX) {
    if (oldBg.replace(/\s+/g, '').toLowerCase() === normalized) {
      return OLD_BG_TO_INDEX[oldBg];
    }
  }
  
  // 2. Exact match in current DEFAULT_COLORS
  const exactIndex = DEFAULT_COLORS.findIndex(c => c.bg.toLowerCase() === normalized);
  if (exactIndex !== -1) return exactIndex;
  
  // 3. Euclidean distance in RGB space
  const targetRgb = parseToRgb(colorStr);
  let minDistance = Infinity;
  let closestIndex = 0;
  
  DEFAULT_COLORS.forEach((color, idx) => {
    const currentRgb = parseToRgb(color.bg);
    const dist = Math.sqrt(
      Math.pow(targetRgb[0] - currentRgb[0], 2) +
      Math.pow(targetRgb[1] - currentRgb[1], 2) +
      Math.pow(targetRgb[2] - currentRgb[2], 2)
    );
    if (dist < minDistance) {
      minDistance = dist;
      closestIndex = idx;
    }
  });
  
  return closestIndex;
}

function migrateTagColors() {
  let updated = false;
  tags.forEach(tag => {
    // Respetar colores personalizados (HSL): colorIndex === -1 indica que el
    // color NO viene de la paleta. No tocarlo, o se perderia al recargar.
    if (tag.colorIndex === -1) {
      return;
    }
    // If the tag has a valid colorIndex, align it automatically with the current palette
    if (tag.colorIndex !== undefined && tag.colorIndex >= 0 && tag.colorIndex < DEFAULT_COLORS.length) {
      const correctColor = DEFAULT_COLORS[tag.colorIndex];
      if (!tag.color || tag.color.bg !== correctColor.bg) {
        tag.color = correctColor;
        updated = true;
      }
    } else {
      // Find the closest color index in the new palette
      const closestIndex = findClosestColorIndex(tag.color ? tag.color.bg : null);
      tag.colorIndex = closestIndex;
      tag.color = DEFAULT_COLORS[closestIndex];
      updated = true;
    }
  });
  if (updated) {
    saveTagsToStorage();
  }
}

// --- App State ---
let tasks = [];
let tags = [];
let notes = {};
// Plantilla de notas: una nota global del usuario, sin día asignado.
let noteTemplate = '';
let objetivos = [];
let editingObjetivoId = null;
let currentWeekStart = new Date(); // Monday of the currently viewed week
let selectedTaskId = null;
let selectedDayDate = null; // Used for pre-filling date on new task
let prefilledTimes = null; // {start:'HH:MM', end:'HH:MM'} para nueva tarea desde hueco del horario
let activeRecurrenceDays = new Set(); // Stores 1-7 representing days for recurrence
let selectedColorIndex = 0; // Index of selected color in the palette
let customColor = null; // color HSL personalizado: { bg, text, border } o null
let newTagPromptCallback = null;
let newTagPromptName = "";
let newTagPromptColorIndex = 0;
let newTagPromptCustomColor = null;
// Estado del selector de color del editor de objetivos (solo primer grado)
let objetivoColorIndex = 0;       // índice de la paleta seleccionado
let objetivoCustomColor = null;   // color HSL personalizado: { bg, text, border } o null
let undoStack = []; // Pila para CTRL+Z
let redoStack = []; // Pila para CTRL+Y
let selectedOccurrenceDate = null; // Fecha específica de la ocurrencia seleccionada
let desktopGridHTML = null; // Caches the original desktop layout of .planner-grid
let completedTasksExpanded = false;
let statsCustomColors = {};
let statsCustomNames = {};
let statsMergedTasks = {};
// Fusión de ACTIVIDADES (modo "Por actividad") por día: clave `${fecha}_${tagId}`
// → tagId destino. Independiente de la fusión por título (statsMergedTasks).
let statsMergedActivities = {};
let statsMergeModeActive = false;
let statsStatusFilter = 'all';
// Modo de agrupación del panel de actividad: 'title' (por título de tarea, por
// defecto) o 'activity' (por actividad/etiqueta).
let statsGroupBy = 'title';
// Modo de color del panel de actividad: 'auto' (asignación automática, por
// defecto) o 'tag' (usa el color definido por el usuario para cada etiqueta).
let statsColorMode = 'auto';
let generalStatsChartType = 'circular';
let lineStatsActiveTags = [];
// Indica que se debe auto-seleccionar la etiqueta principal al entrar al modo
// lineal. Una vez que el usuario interactúa, puede dejar 0 etiquetas.
let lineStatsNeedsAutoSelect = true;
// Etiqueta seleccionada para el modo "Hábitos" (una a la vez).
let generalStatsHabitTag = 'default';
// Estado guardado al abrir Ajustes de estadísticas, para restaurar si se cancela.
let statsSettingsSnapshot = null;
let statsMergeFirstSelected = '';
let statsMergeFirstColor = null;
let statsMergeFirstName = '';
let editingTaskOriginalName = '';
// Orden de la lista de actividades en el gestor: false = orden personalizado del
// usuario (por defecto), true = orden alfabético. Es solo una vista; no altera el
// orden guardado por el usuario.
let tagsSortAlphabetical = false;
let editingTaskColorIndex = 0; // -1 for custom HSL
let editingTaskCustomColor = null; // { bg, text, border }
try {
  completedTasksExpanded = window.localStorage.getItem('completedTasksExpanded') === 'true';
} catch (e) {
  completedTasksExpanded = false;
}

// --- Touch Drag and Drop State ---
let touchDraggedTaskId = null;
let touchDraggedSourceDate = null;
let touchGhost = null;
let touchOffsetLeft = 0;
let touchOffsetTop = 0;
let lastTargetColumn = null;
let touchStartClientX = 0;
let touchStartClientY = 0;
let autoScrollInterval = null;
let verticalAutoScrollInterval = null;
let verticalAutoScrollTarget = null;
let verticalAutoScrollSpeed = 0;
let touchTimeout = null;
let lastTouchX = null;
let lastTouchY = null;
let isTouchDragging = false;
let preventClick = false;
let isOverBriefcaseTarget = false; // Tracks if task is hovered over briefcase icon during touch drag
let isOverTrashTarget = false; // Tracks if task is hovered over trash icon during touch drag
let isOverBriefcaseContainer = false; // Tracks if briefcase task is being reordered within the panel
let isOverCompletedSection = false; // Tracks if a completed task is being reordered within its section
let touchEdgeSlideTimeout = null;  // Timer para activar el slide horizontal al borde (móvil touch)
let touchEdgeSlideCooldown = false; // Evita disparar múltiples slides seguidos
let touchEdgeSlideDir = 0;         // -1 = izquierda (día anterior), 1 = derecha (día siguiente)




// --- Mobile State & View Toggle ---
function isMobile() {
  return document.documentElement.classList.contains('mobile-mode');
}

// Responsive: actualizar modo móvil/escritorio al redimensionar
window.addEventListener('resize', () => {
  const shouldBeMobile = window.innerWidth <= 768;
  const isMobileNow = document.documentElement.classList.contains('mobile-mode');
  if (shouldBeMobile && !isMobileNow) {
    document.documentElement.classList.add('mobile-mode');
    // Inicializar feed móvil si aún no está listo
    if (!mobileScrollInit) {
      initMobileFeed();
    } else {
      // Ya estábamos en móvil: conservar el día que el usuario está viendo en
      // vez de saltar a "hoy" (evita que volver desde otra app/pestaña
      // reinicie la vista al día actual).
      const keepDate = getMobileVisibleDate() || new Date();
      buildMobileFeed(currentWeekStart);
      requestAnimationFrame(() => requestAnimationFrame(() => scrollMobileFeedToDate(keepDate)));
    }
  } else if (!shouldBeMobile && isMobileNow) {
    document.documentElement.classList.remove('mobile-mode');
    mobileScrollInit = false;
    renderWeeklyCalendar();
  }
});

// Shared task movement helper function
// Pendiente de confirmación cuando se arrastra una tarea recurrente
let pendingMoveTask = null;

function executeMoveTask(scope, { taskId, sourceDateStr, targetDateStr, targetColumnContainer, clientY }) {
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return;
  const task = tasks[taskIndex];
  if (scope === 'only-this') {
    const standalone = { ...task, id: 'task-' + Date.now() + '-' + Math.floor(Math.random() * 1000), date: targetDateStr, recurrence: null };
    delete standalone.completedOccurrences;
    const afterEl = getDragAfterElement(targetColumnContainer, clientY);
    const checkDate = new Date(targetDateStr + 'T00:00:00');
    const dayTasks = tasks.filter(t => checkTaskOccurrence(t, checkDate));
    sortDayTasks(dayTasks, targetDateStr);
    let insertIndex = dayTasks.length;
    if (afterEl) { const idx = dayTasks.findIndex(t => t.id === afterEl.dataset.id); if (idx !== -1) insertIndex = idx; }
    dayTasks.splice(insertIndex, 0, standalone);

    if (!resolveTimedReorderOnDrop(dayTasks, standalone, targetDateStr, sourceDateStr)) {
      renderWeeklyCalendar();
      return;
    }

    pushToUndoStack();

    if (!task.recurrence.exceptions) task.recurrence.exceptions = [];
    if (!task.recurrence.exceptions.includes(sourceDateStr)) task.recurrence.exceptions.push(sourceDateStr);

    dayTasks.forEach((t, i) => setEffectivePosition(t, targetDateStr, i * 10));
    tasks.push(standalone);
  } else {
    // Guardar estado original para posible reversión
    const originalDate = task.date;
    const originalRecurrenceDays = task.recurrence && task.recurrence.days ? [...task.recurrence.days] : null;

    const newBaseDate = new Date(targetDateStr + 'T00:00:00');
    if (task.recurrence.unit === 'weekly' && sourceDateStr) {
      const sourceDate = new Date(sourceDateStr + 'T00:00:00');
      const prevDOW = getAppDayIndex(sourceDate), newDOW = getAppDayIndex(newBaseDate);
      if (task.recurrence.days && task.recurrence.days.includes(prevDOW)) {
        task.recurrence.days = [...new Set(task.recurrence.days.map(d => d === prevDOW ? newDOW : d))].sort((a,b)=>a-b);
      }
      if (newBaseDate < new Date(task.date + 'T00:00:00')) task.date = targetDateStr;
    } else {
      const prevBase = new Date(task.date + 'T00:00:00');
      task.date = targetDateStr;
      if (task.recurrence.unit === 'weekly') {
        const shift = getAppDayIndex(newBaseDate) - getAppDayIndex(prevBase);
        if (shift !== 0 && task.recurrence.days) {
          task.recurrence.days = task.recurrence.days.map(d => { let nd = d+shift; if(nd>7)nd-=7; if(nd<1)nd+=7; return nd; });
          task.recurrence.days.sort((a,b)=>a-b);
        }
      }
    }
    const afterEl = getDragAfterElement(targetColumnContainer, clientY);
    const checkDate = new Date(targetDateStr + 'T00:00:00');
    const dayTasks = tasks.filter(t => checkTaskOccurrence(t, checkDate) && t.id !== task.id);
    sortDayTasks(dayTasks, targetDateStr);
    let insertIndex = dayTasks.length;
    if (afterEl) { const idx = dayTasks.findIndex(t => t.id === afterEl.dataset.id); if (idx !== -1) insertIndex = idx; }
    dayTasks.splice(insertIndex, 0, task);

    if (!resolveTimedReorderOnDrop(dayTasks, task, targetDateStr, sourceDateStr)) {
      // Revertir cambios en la tarea original
      task.date = originalDate;
      if (task.recurrence && originalRecurrenceDays) {
        task.recurrence.days = originalRecurrenceDays;
      }
      renderWeeklyCalendar();
      return;
    }

    pushToUndoStack();
    dayTasks.forEach((t, i) => setEffectivePosition(t, targetDateStr, i * 10));
  }
  saveTasksToStorage();
  renderWeeklyCalendar();
}

async function moveTaskToDate(taskId, sourceDateStr, targetDateStr, targetColumnContainer, clientY, isCopy = false) {
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return;

  const originalTask = tasks[taskIndex];

  // El modal "¿editar toda la serie o solo esta ocurrencia?" solo tiene sentido
  // cuando la tarea recurrente cambia de DIA. Si es un reordenamiento dentro del
  // mismo dia (sourceDateStr === targetDateStr) no se altera ninguna regla de
  // recurrencia: solo cambia el orden vertical via positionOverrides, asi que
  // dejamos pasar al flujo de reposicionamiento de abajo.
  if (!isCopy
      && originalTask.recurrence && originalTask.recurrence.enabled
      && sourceDateStr !== targetDateStr) {
    pendingMoveTask = { taskId, sourceDateStr, targetDateStr, targetColumnContainer, clientY };
    const modal = document.getElementById('edit-recurring-modal');
    if (modal) modal.classList.remove('hidden');
    return;
  }

  if (isCopy) {
    // FLUJO DE COPIADO (CTRL presionado)
    // 1. Crear un clon del objeto original
    const clonedTask = {
      ...originalTask,
      id: 'task-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      date: targetDateStr
    };

    // Si es una tarea recurrente, copiar solo esta ocurrencia -> convertir en tarea simple sin recurrencia
    if (clonedTask.recurrence && clonedTask.recurrence.enabled) {
      clonedTask.recurrence = null;
    }

    // Posicionar el clon donde se soltó (siempre respetando el cursor).
    {
      const afterElement = getDragAfterElement(targetColumnContainer, clientY);
      const checkDate = new Date(targetDateStr + 'T00:00:00');
      const dayTasks = tasks.filter(t => checkTaskOccurrence(t, checkDate));

      sortDayTasks(dayTasks, targetDateStr);

      let insertIndex = dayTasks.length;
      if (afterElement) {
        const afterTaskId = afterElement.dataset.id;
        insertIndex = dayTasks.findIndex(t => t.id === afterTaskId);
        if (insertIndex === -1) insertIndex = dayTasks.length;
      }

      dayTasks.splice(insertIndex, 0, clonedTask);

      // Validar / auto-ordenar orden propuesto
      if (!resolveTimedReorderOnDrop(dayTasks, clonedTask, targetDateStr, sourceDateStr)) {
        renderWeeklyCalendar();
        return;
      }

      pushToUndoStack();

      dayTasks.forEach((t, idx) => {
        setEffectivePosition(t, targetDateStr, idx * 10);
      });
    }

    tasks.push(clonedTask);
  } else {
    // FLUJO DE MOVIMIENTO (Comportamiento Original)
    const task = originalTask;
    const originalDate = task.date;
    const originalRecurrenceDays = task.recurrence && task.recurrence.days ? [...task.recurrence.days] : null;

    // If task is simple, just update the date
    if (!task.recurrence || !task.recurrence.enabled) {
      task.date = targetDateStr;
    } else {
      const newBaseDate = new Date(targetDateStr + 'T00:00:00');

      if (task.recurrence.unit === 'weekly' && sourceDateStr) {
        const sourceDate = new Date(sourceDateStr + 'T00:00:00');
        const prevDayOfWeek = getAppDayIndex(sourceDate);
        const newDayOfWeek = getAppDayIndex(newBaseDate);

        if (task.recurrence.days && task.recurrence.days.includes(prevDayOfWeek)) {
          task.recurrence.days = task.recurrence.days.map(d => d === prevDayOfWeek ? newDayOfWeek : d);
          task.recurrence.days = [...new Set(task.recurrence.days)].sort((a, b) => a - b);
        }

        const currentBaseDate = new Date(task.date + 'T00:00:00');
        if (newBaseDate < currentBaseDate) {
          task.date = targetDateStr;
        }
      } else {
        const prevBaseDate = new Date(task.date + 'T00:00:00');
        task.date = targetDateStr;

        if (task.recurrence.unit === 'weekly') {
          const prevDayOfWeek = getAppDayIndex(prevBaseDate);
          const newDayOfWeek = getAppDayIndex(newBaseDate);
          const shift = newDayOfWeek - prevDayOfWeek;

          if (shift !== 0 && task.recurrence.days) {
            task.recurrence.days = task.recurrence.days.map(d => {
              let nd = d + shift;
              if (nd > 7) nd -= 7;
              if (nd < 1) nd += 7;
              return nd;
            });
            task.recurrence.days.sort((a,b) => a - b);
          }
        }
      }
    }

    // Posicionar la tarea en el lugar donde se soltó. Todas las tareas se
    // reordenan manualmente (las horas ya no controlan el orden), así que
    // siempre respetamos la posición del cursor.
    {
      const afterElement = getDragAfterElement(targetColumnContainer, clientY);
      const checkDate = new Date(targetDateStr + 'T00:00:00');
      const dayTasks = tasks.filter(t => checkTaskOccurrence(t, checkDate) && t.id !== task.id);

      sortDayTasks(dayTasks, targetDateStr);

      let insertIndex = dayTasks.length;
      if (afterElement) {
        const afterTaskId = afterElement.dataset.id;
        insertIndex = dayTasks.findIndex(t => t.id === afterTaskId);
        if (insertIndex === -1) insertIndex = dayTasks.length;
      }

      dayTasks.splice(insertIndex, 0, task);

      // Validar / auto-ordenar orden propuesto
      if (!resolveTimedReorderOnDrop(dayTasks, task, targetDateStr, sourceDateStr)) {
        // Revertir cambios en la tarea
        task.date = originalDate;
        if (task.recurrence && originalRecurrenceDays) {
          task.recurrence.days = originalRecurrenceDays;
        }
        renderWeeklyCalendar();
        return;
      }

      pushToUndoStack();

      // Asignar posicion SOLO para este dia. En recurrentes va a positionOverrides,
      // asi los demas dias conservan su orden.
      dayTasks.forEach((t, idx) => {
        setEffectivePosition(t, targetDateStr, idx * 10);
      });
    }
  }

  saveTasksToStorage();
  renderWeeklyCalendar();
}

let isTransitioning = false;
let activeTransitionEndHandler = null;
let activeSlider = null;
let activeTransitionTimeout = null;
let edgeScrollTimeout = null;
let canEdgeScroll = true;

function finishActiveTransition() {
  if (activeTransitionTimeout) {
    clearTimeout(activeTransitionTimeout);
    activeTransitionTimeout = null;
  }
  if (activeTransitionEndHandler && activeSlider) {
    activeSlider.removeEventListener('transitionend', activeTransitionEndHandler);
    const handler = activeTransitionEndHandler;
    activeTransitionEndHandler = null;
    activeSlider = null;
    handler();
  }
}

function navigateToWeek(direction) {
  if (isTransitioning) {
    finishActiveTransition();
  }
  isTransitioning = true;

  const plannerGrid = document.querySelector('.planner-grid');
  if (!plannerGrid) {
    isTransitioning = false;
    return;
  }

  const currentWrapper = plannerGrid.querySelector('.planner-week-wrapper');
  if (!currentWrapper) {
    // Fallback if structure is missing wrapper
    currentWeekStart = addDays(currentWeekStart, direction * 7);
    renderWeeklyCalendar();
    isTransitioning = false;
    return;
  }

  // Calculate new week start
  currentWeekStart = addDays(currentWeekStart, direction * 7);

  // Clone wrapper and clear tasks first
  const newWrapper = currentWrapper.cloneNode(true);
  newWrapper.querySelectorAll('.tasks-container').forEach(c => c.innerHTML = '');

  // Render the new week in the cloned wrapper
  renderWeeklyCalendar(newWrapper);
  setupDesktopColumns(newWrapper);

  // Setup slider
  const slider = document.createElement('div');
  slider.className = 'planner-slider';
  activeSlider = slider;

  if (direction === 1) {
    slider.appendChild(currentWrapper);
    slider.appendChild(newWrapper);
    plannerGrid.innerHTML = '';
    plannerGrid.appendChild(slider);
    
    // Force reflow
    slider.offsetHeight;
    slider.style.transform = 'translateX(-50%)';
  } else {
    slider.appendChild(newWrapper);
    slider.appendChild(currentWrapper);
    plannerGrid.innerHTML = '';
    plannerGrid.appendChild(slider);
    slider.style.transform = 'translateX(-50%)';
    
    // Force reflow
    slider.offsetHeight;
    slider.style.transform = 'translateX(0)';
  }

  const transitionEndHandler = () => {
    slider.removeEventListener('transitionend', transitionEndHandler);
    if (activeTransitionTimeout) {
      clearTimeout(activeTransitionTimeout);
      activeTransitionTimeout = null;
    }
    activeTransitionEndHandler = null;
    activeSlider = null;
    
    // If a task is currently being dragged, we must keep its card in the DOM
    // so the browser does not cancel the native drag-and-drop session.
    let draggedElement = null;
    if (draggedTaskId) {
      draggedElement = document.querySelector(`.task-card.dragging`);
      if (draggedElement) {
        // Position it off-screen and attach it to document.body so it remains in the DOM
        draggedElement.style.position = 'fixed';
        draggedElement.style.top = '-9999px';
        draggedElement.style.left = '-9999px';
        document.body.appendChild(draggedElement);
      }
    }

    plannerGrid.innerHTML = '';
    plannerGrid.appendChild(newWrapper);
    
    isTransitioning = false;
  };

  activeTransitionEndHandler = transitionEndHandler;
  slider.addEventListener('transitionend', transitionEndHandler);
  
  // Fallback timeout in case transitionend does not fire
  activeTransitionTimeout = setTimeout(() => {
    if (isTransitioning && activeTransitionEndHandler === transitionEndHandler) {
      transitionEndHandler();
    }
  }, 500);
}

function triggerEdgeWeekChange(direction) {
  if (!canEdgeScroll || isTransitioning) return;
  if (edgeScrollTimeout) return; // Already scheduled

  edgeScrollTimeout = setTimeout(() => {
    if (!draggedTaskId) {
      clearEdgeScrollTimeout();
      return;
    }

    navigateToWeek(direction);

    canEdgeScroll = false;
    clearEdgeScrollTimeout();

    // 1.5 seconds cooldown
    setTimeout(() => {
      canEdgeScroll = true;
    }, 1500);
  }, 300);
}

function clearEdgeScrollTimeout() {
  if (edgeScrollTimeout) {
    clearTimeout(edgeScrollTimeout);
    edgeScrollTimeout = null;
  }
}

function setupDesktopColumns(targetWrapper = document) {
  if (isMobile()) return;

  // Clic en espacio vacío de columna → nueva tarea
  targetWrapper.querySelectorAll('.day-column').forEach(col => {
    col.addEventListener('click', (e) => {
      const target = e.target;
      const isEmptySpace = target === col || target.classList.contains('tasks-container');
      if (!isEmptySpace) return;
      const dayIndex = parseInt(col.dataset.day);
      const colDate = addDays(currentWeekStart, dayIndex - 1);
      selectedDayDate = formatDate(colDate);
      openTaskModal();
    });
  });

  // "+ Agregar tarea" buttons in columns
  targetWrapper.querySelectorAll('.add-task-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const colIndex = parseInt(btn.dataset.dayIndex);
      const colDate = addDays(currentWeekStart, colIndex - 1);
      selectedDayDate = formatDate(colDate);
      openTaskModal();
    });
  });

  // Click derecho en una columna → menú contextual "Aislar día" / "Restablecer días"
  targetWrapper.querySelectorAll('.day-column').forEach(col => {
    col.addEventListener('contextmenu', (e) => {
      if (isMobile()) return;
      e.preventDefault();
      const dayIndex = parseInt(col.dataset.day);
      openDayContextMenu(e.clientX, e.clientY, dayIndex);
    });
  });

  setupDragAndDrop(targetWrapper);
}

// ─── Aislar día (escritorio) ─────────────────────────────────────────────────
// isolatedDay guarda el data-day (1..7) de la columna aislada, o null si no hay.
let isolatedDay = null;

// Aplica el estado de aislamiento actual a las columnas de todos los wrappers
// visibles (se llama al aislar/restablecer y tras cada render de semana).
function applyDayIsolation() {
  // Planner (escritorio): columnas .day-column con data-day.
  document.querySelectorAll('.planner-week-wrapper').forEach(wrapper => {
    const cols = wrapper.querySelectorAll('.day-column');
    if (isolatedDay === null) {
      wrapper.classList.remove('day-isolated');
      cols.forEach(c => c.classList.remove('isolated-day'));
    } else {
      wrapper.classList.add('day-isolated');
      cols.forEach(c => {
        if (parseInt(c.dataset.day) === isolatedDay) c.classList.add('isolated-day');
        else c.classList.remove('isolated-day');
      });
    }
  });

  // Horario (cronograma): columnas .cr-day-col con data-col (mismo orden de día).
  const crGrid = document.getElementById('cronograma-grid');
  if (crGrid) {
    const crCols = crGrid.querySelectorAll('.cr-day-col');
    if (isolatedDay === null) {
      crGrid.classList.remove('day-isolated');
      crCols.forEach(c => c.classList.remove('isolated-day'));
    } else {
      crGrid.classList.add('day-isolated');
      crCols.forEach(c => {
        if (parseInt(c.dataset.col) === isolatedDay) c.classList.add('isolated-day');
        else c.classList.remove('isolated-day');
      });
    }
  }
}

function isolateDay(dayIndex) {
  isolatedDay = dayIndex;
  applyDayIsolation();
}

function resetIsolation() {
  isolatedDay = null;
  applyDayIsolation();
}

// ─── Menú contextual de columna ──────────────────────────────────────────────
function closeDayContextMenu() {
  const existing = document.getElementById('day-context-menu');
  if (existing) existing.remove();
  document.removeEventListener('click', closeDayContextMenu);
  document.removeEventListener('contextmenu', onOutsideContextMenu, true);
  window.removeEventListener('blur', closeDayContextMenu);
  window.removeEventListener('resize', closeDayContextMenu);
}

// Cerrar el menú si se hace click derecho fuera de una columna.
function onOutsideContextMenu(e) {
  if (!e.target.closest('.day-column')) closeDayContextMenu();
}

function openDayContextMenu(x, y, dayIndex) {
  closeDayContextMenu(); // cerrar cualquier menú previo

  const menu = document.createElement('div');
  menu.id = 'day-context-menu';
  menu.className = 'context-menu';

  const item = document.createElement('button');
  item.className = 'context-menu-item';

  if (isolatedDay === null) {
    // No hay día aislado: ofrecer aislar el día sobre el que se hizo click.
    item.textContent = 'Aislar día';
    item.addEventListener('click', () => {
      isolateDay(dayIndex);
      closeDayContextMenu();
    });
  } else {
    // Ya hay un día aislado: la única opción es restablecer.
    item.textContent = 'Restablecer días';
    item.addEventListener('click', () => {
      resetIsolation();
      closeDayContextMenu();
    });
  }

  menu.appendChild(item);
  document.body.appendChild(menu);

  // Posicionar el menú evitando que se salga de la pantalla.
  const rect = menu.getBoundingClientRect();
  let left = x, top = y;
  if (left + rect.width > window.innerWidth)  left = window.innerWidth  - rect.width  - 8;
  if (top + rect.height > window.innerHeight) top = window.innerHeight - rect.height - 8;
  menu.style.left = Math.max(8, left) + 'px';
  menu.style.top  = Math.max(8, top)  + 'px';

  // Cerrar al hacer click en cualquier sitio, perder foco o redimensionar.
  setTimeout(() => {
    document.addEventListener('click', closeDayContextMenu);
    document.addEventListener('contextmenu', onOutsideContextMenu, true);
    window.addEventListener('blur', closeDayContextMenu);
    window.addEventListener('resize', closeDayContextMenu);
  }, 0);
}

// Funciones de compatibilidad obsoletas
function getMobileDayDate() { return addDays(currentWeekStart, 0); }
function setMobileDayIndex(idx) {}
function updateMobileActiveColumn() {}
function updateSwipeDots() {}
function setupMobileSwipe() {}
function injectSwipeHint() {}

// --- Initialization & Supabase Storage ---

/**
 * Called by initAuth once the user is confirmed logged in.
 * Loads all user data from Supabase and boots the app UI.
 */
async function startApp(user) {
  // Capture desktop grid HTML if not already captured
  if (!desktopGridHTML) {
    const grid = document.querySelector('.planner-grid');
    if (grid) {
      desktopGridHTML = grid.innerHTML;
    }
  }

  // Load preferences (title, notes, etc.)
  const prefsCacheKey = 'prefs_cache_' + currentUser.id;
  try {
    const cachedPrefs = localStorage.getItem(prefsCacheKey);
    if (cachedPrefs) {
      const parsedPrefs = JSON.parse(cachedPrefs);
      notes = parsedPrefs.notes || {};
      noteTemplate = parsedPrefs.noteTemplate || '';
      objetivos = parsedPrefs.objetivos || [];
      statsCustomColors = parsedPrefs.statsCustomColors || {};
      statsCustomNames = parsedPrefs.statsCustomNames || {};
      statsMergedTasks = parsedPrefs.statsMergedTasks || {};
      statsMergedActivities = parsedPrefs.statsMergedActivities || {};
      if (parsedPrefs.statsGroupBy) statsGroupBy = parsedPrefs.statsGroupBy;
      if (parsedPrefs.statsStatusFilter) statsStatusFilter = parsedPrefs.statsStatusFilter;
      if (parsedPrefs.statsColorMode) statsColorMode = parsedPrefs.statsColorMode;
      if (parsedPrefs.generalStatsChartType) generalStatsChartType = parsedPrefs.generalStatsChartType;
      if (parsedPrefs.copyOptions) copyTextOptions = { ...copyTextOptions, ...parsedPrefs.copyOptions };
    }
  } catch (e) {
    console.warn('No se pudo leer el caché local de preferencias:', e);
  }

  const prefs = await loadPreferences();
  let activeTimerState = null;
  if (prefs) {
    notes = prefs.notes || {};
    noteTemplate = prefs.noteTemplate || '';
    objetivos = prefs.objetivos || [];
    statsCustomColors = prefs.statsCustomColors || {};
    statsCustomNames = prefs.statsCustomNames || {};
    statsMergedTasks = prefs.statsMergedTasks || {};
    statsMergedActivities = prefs.statsMergedActivities || {};
    if (prefs.statsGroupBy) statsGroupBy = prefs.statsGroupBy;
    if (prefs.statsStatusFilter) statsStatusFilter = prefs.statsStatusFilter;
    if (prefs.statsColorMode) statsColorMode = prefs.statsColorMode;
    if (prefs.generalStatsChartType) generalStatsChartType = prefs.generalStatsChartType;
    if (prefs.copyOptions) copyTextOptions = { ...copyTextOptions, ...prefs.copyOptions };
    activeTimerState = prefs.activeTimer || null;
    try {
      localStorage.setItem(prefsCacheKey, JSON.stringify(prefs));
    } catch (e) {}
  }
  // Fallback al caché local si Supabase no devolvió un cronómetro activo
  // (p. ej. sin conexión al arrancar).
  if (!activeTimerState) {
    try {
      const rawCached = localStorage.getItem(prefsCacheKey);
      if (rawCached) {
        const parsed = JSON.parse(rawCached);
        if (parsed && parsed.activeTimer) activeTimerState = parsed.activeTimer;
      }
    } catch (e) {}
  }
  const titleEl = document.getElementById('app-title');
  if (titleEl) {
    titleEl.textContent = 'Planner7';
  }

  // Load tags
  const storedTags = await loadTags();
  if (storedTags && storedTags.length > 0) {
    tags = storedTags;
    migrateTagColors();
  } else {
    tags = [...INITIAL_TAGS];
    await saveTagsToStorage();
  }

  // Set initial week to current date
  currentWeekStart = getMondayOf(new Date());

  if (!eventListenersInitialized) {
    setupEventListeners();
    buildColorPalette();
    eventListenersInitialized = true;
  }
  buildTagSelectorOptions();

  // Cargar caché local primero para mostrar datos de inmediato
  const cacheKey = 'tasks_cache_' + currentUser.id;
  const pendingSyncKey = 'tasks_pending_sync_' + currentUser.id;
  let hasPendingSync = false;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      tasks = JSON.parse(cached);
      ensurePositions();
      renderWeeklyCalendar();
      initMobileFeed();
    }
    hasPendingSync = localStorage.getItem(pendingSyncKey) === 'true';
  } catch (e) {
    console.warn('No se pudo leer el caché local:', e);
  }

  // Cargar el snapshot del último estado sincronizado (para el diff incremental).
  loadSyncSnapshot();

  // Solo subimos el cache local si REALMENTE hay tareas locales sin sincronizar.
  // Un cache vacio con pending_sync=true significa que el localStorage se perdio,
  // NO que el usuario borro todo: en ese caso cargamos desde la nube.
  if (hasPendingSync && tasks.length > 0) {
    console.log('Sincronizando tareas locales pendientes con Supabase...');
    try {
      const cloudTasks = await loadTasks();
      tasks = mergeTaskLists(cloudTasks, tasks);
      // El snapshot parte de lo que hay en la nube; saveTasks subirá el resto.
      resetSyncSnapshot(cloudTasks);
      await saveTasks(tasks);
      // Tras subir todo, la nube refleja tasks[]: ese es el nuevo snapshot.
      resetSyncSnapshot(tasks);
      localStorage.setItem(cacheKey, JSON.stringify(tasks));
      localStorage.setItem(pendingSyncKey, 'false');
    } catch (e) {
      console.warn('No se pudo sincronizar las tareas locales al iniciar:', e);
    }
  } else {
    const storedTasks = await loadTasks();
    if (storedTasks.length > 0) {
      tasks = storedTasks;
      // Lo recién cargado de la nube ya está sincronizado: inicializa el snapshot.
      resetSyncSnapshot(tasks);
      try {
        localStorage.setItem(cacheKey, JSON.stringify(tasks));
        localStorage.setItem(pendingSyncKey, 'false');
      } catch (e) {}
    }
  }
  // Si Supabase devuelve vacío pero el caché local tiene datos, los conservamos
  // (no pisamos tasks[] con un array vacío)

  // Migrar la hora EMBEBIDA en la descripción a campos startTime/endTime.
  // (La antigua migración inversa migrateTimesToDescription quedó obsoleta con el
  // modelo de campos y ya NO se ejecuta, para no reintroducir la hora en el texto.)
  migrateTimesFromDescription();

  // Ensure all tasks have position indices for sorting
  ensurePositions();
  renderWeeklyCalendar();
  initMobileFeed();
  initAlarms();
  initForce24Time();
  initTitleAutocomplete();

  // Reanudar el cronómetro si quedó uno activo de una sesión anterior. Si superó
  // las 12h estando cerrada la app, se crea la tarea de 12h automáticamente.
  if (activeTimerState) {
    resumeTimerFromState(activeTimerState);
  }
}

// ─── Migracion: copiar la hora de cada tarea al inicio de su descripcion ──────
// Se ejecuta una vez por tarea (marcada con _timeMigrated) y limpia los campos
// de hora, ya que la funcion de horas fue eliminada de la app.
function migrateTimesToDescription() {
  let changed = false;
  tasks.forEach(task => {
    const hasTime = task.startTime || task.endTime;
    if (hasTime && !task._timeMigrated) {
      let prefix = '';
      if (task.startTime && task.endTime) {
        prefix = `${task.startTime} - ${task.endTime}. `;
      } else if (task.startTime) {
        prefix = `${task.startTime}. `;
      } else if (task.endTime) {
        prefix = `${task.endTime}. `;
      }
      task.description = prefix + (task.description || '');
      changed = true;
    }
    // Limpiar los campos de hora y marcar como migrada
    if (task.startTime !== undefined) delete task.startTime;
    if (task.endTime !== undefined) delete task.endTime;
    if (task.duration !== undefined) delete task.duration;
    task._timeMigrated = true;
  });
  if (changed) {
    saveTasksToStorage();
  }
}

// ─── Migración: de la hora EMBEBIDA en la descripción a campos startTime/endTime
// Detecta al inicio de la descripción un rango "HH:MM - HH:MM" o una hora suelta
// "HH:MM", copia esos valores a task.startTime / task.endTime, GUARDA el texto
// original en task._descBackup (red de seguridad) y LIMPIA ese prefijo de la
// descripción (corte limpio). Marca _timeFieldsMigrated; corre una vez por tarea.
function migrateTimesFromDescription() {
  let changed = false;
  tasks.forEach(task => {
    if (task._timeFieldsMigrated) return;

    const desc = (task.description || '');
    const s = desc.trimStart();

    // Rango "HH:MM - HH:MM" al inicio (opcionalmente seguido de ". " o espacios).
    let m = s.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*\.?\s*/);
    if (m) {
      const sh = parseInt(m[1], 10), sm = parseInt(m[2], 10);
      const eh = parseInt(m[3], 10), em = parseInt(m[4], 10);
      if (sh <= 23 && sm <= 59 && eh <= 23 && em <= 59) {
        if (task._descBackup === undefined) task._descBackup = desc;
        task.startTime = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
        task.endTime = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
        task.description = s.slice(m[0].length); // quitar el prefijo de hora
        changed = true;
      }
    } else {
      // Hora de inicio suelta "HH:MM" al inicio (sin fin).
      m = s.match(/^(\d{1,2}):(\d{2})\s*\.?\s*/);
      if (m) {
        const sh = parseInt(m[1], 10), sm = parseInt(m[2], 10);
        if (sh <= 23 && sm <= 59) {
          if (task._descBackup === undefined) task._descBackup = desc;
          task.startTime = `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`;
          // sin endTime
          task.description = s.slice(m[0].length);
          changed = true;
        }
      }
    }

    task._timeFieldsMigrated = true;
  });
  if (changed) saveTasksToStorage();
}

/**
 * Called by initAuth when the user logs out. Reset all state.
 */
function resetApp(clearCache = false) {
  // Solo limpiar caché si es un logout explícito del usuario
  if (clearCache && currentUser) {
    try {
      localStorage.removeItem('tasks_cache_' + currentUser.id);
      localStorage.removeItem('prefs_cache_' + currentUser.id);
      localStorage.removeItem('tasks_synced_snapshot_' + currentUser.id);
    } catch (e) {}
  }
  // Limpiar el snapshot en memoria para no mezclar estados entre cuentas.
  lastSyncedById = new Map();
  tasks = [];
  tags = [];
  notes = {};
  objetivos = [];
  undoStack = [];
  redoStack = [];
  selectedTaskId = null;
  selectedDayDate = null;
  selectedOccurrenceDate = null;

  // Reset title
  const titleEl = document.getElementById('app-title');
  if (titleEl) titleEl.textContent = 'Planner7';

  // Clear calendar
  document.querySelectorAll('.tasks-container').forEach(c => { c.innerHTML = ''; });

  // Clear briefcase
  const bContainer = document.getElementById('briefcase-tasks-container');
  if (bContainer) bContainer.innerHTML = '';

  const drawer = document.getElementById('briefcase-drawer');
  if (drawer) drawer.classList.add('closed');

  const btn = document.getElementById('briefcase-btn');
  if (btn) btn.classList.remove('active-briefcase');
}

function initApp() {
  initStatsModals();
  initAuth();
}

// --- Briefcase Drawer Toggle ---
function toggleBriefcaseDrawer() {
  const drawer = document.getElementById('briefcase-drawer');
  const btn = document.getElementById('briefcase-btn');
  const mobileBackdrop = document.getElementById('briefcase-mobile-backdrop');
  if (!drawer) return;

  const isOpen = !drawer.classList.contains('closed');
  if (isOpen) {
    drawer.classList.add('closed');
    if (btn) btn.classList.remove('active-briefcase');
    if (mobileBackdrop) mobileBackdrop.classList.add('hidden');
  } else {
    drawer.classList.remove('closed');
    if (btn) btn.classList.add('active-briefcase');
    if (mobileBackdrop && isMobile()) mobileBackdrop.classList.remove('hidden');
    renderBriefcaseTasks();
  }
}

function setSaveStatus(state) {
  let el = document.getElementById('save-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'save-status';
    document.body.appendChild(el);
  }
  el.classList.remove('saving', 'saved', 'offline', 'visible');
  if (state === 'saving') {
    el.textContent = 'Guardando\u2026';
    el.classList.add('saving', 'visible');
  } else if (state === 'saved') {
    el.textContent = 'Guardado \u2713';
    el.classList.add('saved', 'visible');
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.remove('visible'), 1500);
  } else if (state === 'offline') {
    el.textContent = 'Sin conexion \u00b7 cambios guardados localmente';
    el.classList.add('offline', 'visible');
  }
}

// Muestra un mensaje breve centrado en la parte inferior, con el mismo estilo
// que el indicador "Guardado".
function showCenterToast(message) {
  let el = document.getElementById('center-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'center-toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove('visible'), 1500);
}

async function saveTasksToStorage() {
  if (!currentUser) return;
  const pendingSyncKey = 'tasks_pending_sync_' + currentUser.id;
  const cacheKey = 'tasks_cache_' + currentUser.id;

  try {
    localStorage.setItem(cacheKey, JSON.stringify(tasks));
    localStorage.setItem(pendingSyncKey, 'true');
  } catch (e) {
    console.warn('No se pudo guardar en cache local:', e);
  }

  setSaveStatus('saving');
  const snapshotIds = tasks.map(t => t.id).join(',');
  const ok = await syncTasksWithRetry(tasks, 3);

  if (ok) {
    if (currentUser && tasks.map(t => t.id).join(',') === snapshotIds) {
      try { localStorage.setItem(pendingSyncKey, 'false'); } catch (e) {}
    }
    setSaveStatus('saved');
  } else {
    console.warn('Sync con Supabase fallo; cambios guardados localmente. Se reintentara.');
    setSaveStatus('offline');
  }
}

async function syncTasksWithRetry(taskList, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Sincronización incremental: solo viaja lo que cambió respecto al snapshot.
      await saveTasksIncremental(taskList);
      return true;
    } catch (err) {
      console.warn(`saveTasks intento ${attempt}/${maxAttempts} fallo:`, err);
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, 400 * attempt));
      }
    }
  }
  return false;
}

async function flushPendingSync() {
  if (!currentUser) return;
  const pendingSyncKey = 'tasks_pending_sync_' + currentUser.id;
  if (localStorage.getItem(pendingSyncKey) !== 'true') return;
  if (!tasks || tasks.length === 0) return;
  setSaveStatus('saving');
  const ok = await syncTasksWithRetry(tasks, 3);
  if (ok) {
    try { localStorage.setItem(pendingSyncKey, 'false'); } catch (e) {}
    setSaveStatus('saved');
  } else {
    setSaveStatus('offline');
  }
}

function mergeTaskLists(cloudTasks, localTasks) {
  const byId = new Map();
  (cloudTasks || []).forEach(t => { if (t && t.id) byId.set(t.id, t); });
  (localTasks || []).forEach(t => { if (t && t.id) byId.set(t.id, t); });
  return Array.from(byId.values());
}

function saveTagsToStorage() {
  saveTags(tags);
}

// --- Undo/Redo System (CTRL+Z / CTRL+Y) ---
function pushToUndoStack() {
  // Guardamos una copia profunda del estado de las tareas
  undoStack.push(JSON.stringify(tasks));
  if (undoStack.length > 50) {
    undoStack.shift(); // Limitar a 50 estados
  }
  // Al realizar una nueva acción, se limpia la pila de rehacer
  redoStack = [];
}

async function undo() {
  if (undoStack.length === 0) return false;

  // Guardar el estado actual en la pila de rehacer antes de aplicar el cambio
  redoStack.push(JSON.stringify(tasks));
  if (redoStack.length > 50) {
    redoStack.shift();
  }

  const previousState = JSON.parse(undoStack.pop());
  tasks = previousState;
  saveTasksToStorage();
  renderWeeklyCalendar();
  return true;
}

async function redo() {
  if (redoStack.length === 0) return false;

  // Guardar el estado actual en la pila de deshacer antes de rehacer
  undoStack.push(JSON.stringify(tasks));
  if (undoStack.length > 50) {
    undoStack.shift();
  }

  const nextState = JSON.parse(redoStack.pop());
  tasks = nextState;
  saveTasksToStorage();
  renderWeeklyCalendar();
  return true;
}

function showHistoryNotification(text, type = 'undo') {
  const existing = document.getElementById('undo-notification');
  if (existing) {
    existing.remove();
  }

  const notification = document.createElement('div');
  notification.id = 'undo-notification'; // Mismo ID para heredar estilos CSS
  notification.dataset.type = type;

  const iconSvg = type === 'undo'
    ? `<img src="icons/undo.svg" alt="" width="14" height="14" style="margin-right: 4px;">`
    : `<img src="icons/redo.svg" alt="" width="14" height="14" style="margin-right: 4px;">`;

  notification.innerHTML = `
    ${iconSvg}
    <span>${text}</span>
  `;

  document.body.appendChild(notification);

  // Forzar reflow para la animación
  notification.offsetHeight;

  notification.classList.add('show');

  // Ocultar y remover
  setTimeout(() => {
    notification.classList.remove('show');
    notification.classList.add('hide');
    setTimeout(() => {
      notification.remove();
    }, 250);
  }, 2500);
}

// --- Date Helper Functions ---
function getMondayOf(date) {
  const d = new Date(date);
  const day = d.getDay();
  // Adjust so Monday is first day
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ─── Posicion por dia para tareas recurrentes ────────────────────────────────
// Una tarea recurrente es un solo objeto pero aparece en varios dias. Para que
// reordenarla en un dia no afecte a los demas, guardamos posiciones por fecha en
// task.positionOverrides = { "YYYY-MM-DD": number }. Las tareas simples siguen
// usando task.position.
function getEffectivePosition(task, dateStr) {
  // IMPORTANTE: positionOverrides SOLO aplica a tareas recurrentes. Una tarea
  // simple que en el pasado fue recurrente puede conservar overrides huerfanos;
  // si los leyeramos, su posicion quedaria "congelada" en un valor viejo y no
  // se podria reordenar (se movia un solo lugar). Por eso solo consultamos los
  // overrides cuando la tarea es realmente recurrente.
  const isRecurring = task.recurrence && task.recurrence.enabled;
  if (isRecurring && task.positionOverrides && task.positionOverrides[dateStr] !== undefined) {
    return task.positionOverrides[dateStr];
  }
  return task.position || 0;
}

// Asigna la posicion para un dia concreto, en el lugar correcto segun el tipo.
function setEffectivePosition(task, dateStr, value) {
  const isRecurring = task.recurrence && task.recurrence.enabled;
  if (isRecurring) {
    if (!task.positionOverrides) task.positionOverrides = {};
    task.positionOverrides[dateStr] = value;
  } else {
    // Tarea simple: usa position global y, por higiene, descarta cualquier
    // override huerfano que hubiera quedado de cuando fue recurrente.
    task.position = value;
    if (task.positionOverrides) delete task.positionOverrides;
  }
}

// --- CONFIGURACIÓN DE ORDENACIÓN DE TAREAS ---
// Si es true, las tareas con hora de inicio se ordenan automáticamente de forma
// cronológica en el Planner, y no se permite reordenarlas violando dicho orden.
let AUTO_SORT_TIMED_TASKS = true;

function sortDayTasks(dayTasks, dateStr) {
  // Primero ordenar por posición para tener el orden base (que separa pendientes y completadas)
  dayTasks.sort((a, b) => getEffectivePosition(a, dateStr) - getEffectivePosition(b, dateStr));

  if (!AUTO_SORT_TIMED_TASKS) return;

  const isCompleted = (t) => (t.recurrence && t.recurrence.enabled)
    ? !!(t.completedOccurrences && t.completedOccurrences.includes(dateStr))
    : !!t.completed;

  // Separar pendientes y completadas
  const pending = dayTasks.filter(t => !isCompleted(t));
  const completed = dayTasks.filter(t => isCompleted(t));

  // Ordenar cronológicamente las tareas con hora en cada grupo sin mover las tareas sin hora de sus posiciones relativas
  autoSortTimedTasksInGroup(pending);
  autoSortTimedTasksInGroup(completed);

  // Re-ensamblar la lista de tareas del día
  dayTasks.length = 0;
  dayTasks.push(...pending, ...completed);
}

function autoSortTimedTasksInGroup(group) {
  const timedIndices = [];
  const timedTasks = [];

  group.forEach((task, idx) => {
    if (task.startTime) {
      timedIndices.push(idx);
      timedTasks.push(task);
    }
  });

  if (timedTasks.length <= 1) return;

  // Ordenar las tareas con hora cronológicamente
  timedTasks.sort((a, b) => a.startTime.localeCompare(b.startTime));

  // Colocar las tareas ordenadas en los índices originales
  timedIndices.forEach((origIdx, i) => {
    group[origIdx] = timedTasks[i];
  });
}

function validateProposedOrder(proposedDayTasks, dateStr) {
  if (!AUTO_SORT_TIMED_TASKS) return true;

  const isCompleted = (t) => (t.recurrence && t.recurrence.enabled)
    ? !!(t.completedOccurrences && t.completedOccurrences.includes(dateStr))
    : !!t.completed;

  // Separar pendientes y completadas de la lista propuesta
  const pending = proposedDayTasks.filter(t => !isCompleted(t));
  const completed = proposedDayTasks.filter(t => isCompleted(t));

  // Verificar que el orden cronológico se respete en ambos grupos
  return isChronologicalOrderValid(pending) && isChronologicalOrderValid(completed);
}

function isChronologicalOrderValid(taskList) {
  let lastTime = "";
  for (const t of taskList) {
    if (t.startTime) {
      if (lastTime && t.startTime.localeCompare(lastTime) < 0) {
        return false;
      }
      lastTime = t.startTime;
    }
  }
  return true;
}

// Resuelve el orden al SOLTAR una tarea en un día durante un movimiento ENTRE
// DÍAS. Si la tarea movida tiene hora de inicio, en lugar de rechazar el drop
// cuando rompe el orden cronológico, reordena automáticamente las tareas CON
// hora entre sí (dejando las tareas SIN hora en la posición manual donde el
// usuario las dejó) y acepta siempre el drop. Para movimientos dentro del mismo
// día, o cuando la tarea movida no tiene hora, conserva el comportamiento
// original de validación estricta.
//
// `dayTasks` se modifica IN-PLACE con el orden final cuando se reordena.
// Devuelve true si el drop se acepta, false si debe rechazarse.
function resolveTimedReorderOnDrop(dayTasks, movedTask, targetDateStr, sourceDateStr) {
  const isCrossDay = sourceDateStr && sourceDateStr !== targetDateStr;

  // Solo auto-ordenamos al mover entre días una tarea que tiene hora de inicio.
  // En cualquier otro caso, mantenemos la validación estricta de siempre.
  if (!AUTO_SORT_TIMED_TASKS || !isCrossDay || !movedTask || !movedTask.startTime) {
    return validateProposedOrder(dayTasks, targetDateStr);
  }

  const isCompleted = (t) => (t.recurrence && t.recurrence.enabled)
    ? !!(t.completedOccurrences && t.completedOccurrences.includes(targetDateStr))
    : !!t.completed;

  // Separar pendientes y completadas (las completadas siempre quedan al final),
  // y dentro de cada grupo reordenar solo las tareas con hora, sin tocar la
  // posición relativa de las que no tienen hora.
  const pending = dayTasks.filter(t => !isCompleted(t));
  const completed = dayTasks.filter(t => isCompleted(t));
  autoSortTimedTasksInGroup(pending);
  autoSortTimedTasksInGroup(completed);

  dayTasks.length = 0;
  dayTasks.push(...pending, ...completed);
  return true;
}

// Ensure all tasks have a defined position for sorting, grouping by date
async function ensurePositions() {
  // Limpieza: una tarea simple no debe conservar positionOverrides (quedan
  // huerfanos cuando una tarea recurrente se convierte en simple) porque
  // congelarian su posicion e impedirian reordenarla dentro de un dia.
  tasks.forEach(t => {
    const isRecurring = t.recurrence && t.recurrence.enabled;
    if (!isRecurring && t.positionOverrides) delete t.positionOverrides;
  });

  const tasksByDate = {};
  tasks.forEach(task => {
    const d = task.date;
    if (!tasksByDate[d]) {
      tasksByDate[d] = [];
    }
    tasksByDate[d].push(task);
  });

  let updated = false;
  for (const date in tasksByDate) {
    const dayTasks = tasksByDate[date];
    const needsNormalize = dayTasks.some(t => t.position === undefined);
    if (needsNormalize) {
      dayTasks.sort((a, b) => {
        // If both have positions, use them to preserve existing custom order
        if (a.position !== undefined && b.position !== undefined) {
          return a.position - b.position;
        }
        // Fallback: sort timed tasks chronologically
        if (a.startTime && b.startTime) {
          return a.startTime.localeCompare(b.startTime);
        }
        // Untimed tasks default to the top if they don't have positions defined
        if (!a.startTime && b.startTime) return -1;
        if (a.startTime && !b.startTime) return 1;
        
        return a.id.localeCompare(b.id);
      });

      dayTasks.forEach((t, index) => {
        t.position = index * 10;
      });
      updated = true;
    }
  }
  if (updated) {
    await saveTasksToStorage();
  }
}

// Adjust position of a task whose time or date has been modified to ensure correct chronological sorting relative to other timed tasks
function adjustPositionForModifiedTime(modifiedTask) {
  const dateStr = modifiedTask.date;
  const dayTasks = tasks.filter(t => t.date === modifiedTask.date && t.id !== modifiedTask.id);

  dayTasks.sort((a, b) => (a.position || 0) - (b.position || 0));

  if (!modifiedTask.startTime) {
    // Put at the very beginning of the day's tasks to make it appear first
    dayTasks.unshift(modifiedTask);
    dayTasks.forEach((t, idx) => {
      t.position = idx * 10;
    });
    return;
  }

  // Una tarea con hora de inicio se coloca LO MÁS ARRIBA POSIBLE, con una única
  // restricción: no puede quedar por encima de una tarea NO completada que tenga
  // una hora de inicio MENOR (más temprana). Las tareas completadas y las de
  // hora mayor o igual no la frenan. En empate de hora, la nueva queda encima.
  const isCompletedOnDate = (t) => (t.recurrence && t.recurrence.enabled)
    ? !!(t.completedOccurrences && t.completedOccurrences.includes(dateStr))
    : !!t.completed;

  let insertAfterTask = null;
  for (const t of dayTasks) {
    if (!t.startTime) continue;
    if (isCompletedOnDate(t)) continue;
    if (t.startTime.localeCompare(modifiedTask.startTime) < 0) {
      insertAfterTask = t; // la última (más abajo) con hora menor manda
    }
  }

  const newList = [];
  let inserted = false;

  // Si no hay ninguna tarea pendiente con hora menor, va al principio del día.
  if (!insertAfterTask) {
    newList.push(modifiedTask);
    inserted = true;
  }

  for (const current of dayTasks) {
    newList.push(current);
    if (insertAfterTask && current.id === insertAfterTask.id && !inserted) {
      newList.push(modifiedTask);
      inserted = true;
    }
  }

  if (!inserted) {
    newList.push(modifiedTask);
  }

  newList.forEach((t, idx) => {
    t.position = idx * 10;
  });
}

function formatWeekRange(monday) {
  const sunday = addDays(monday, 6);
  
  const options = { month: 'long', year: 'numeric' };
  
  const startDay = monday.getDate();
  const startMonth = monday.toLocaleDateString('es-ES', { month: 'short' });
  const endDay = sunday.getDate();
  const endMonth = sunday.toLocaleDateString('es-ES', { month: 'short' });
  const year = sunday.getFullYear();

  // Clean strings
  const cleanStartMonth = startMonth.replace('.', '');
  const cleanEndMonth = endMonth.replace('.', '');

  if (monday.getMonth() === sunday.getMonth()) {
    return `${startDay} – ${endDay} de ${capitalize(monday.toLocaleDateString('es-ES', { month: 'long' }))}, ${year}`;
  } else {
    return `${startDay} de ${capitalize(cleanStartMonth)} – ${endDay} de ${capitalize(cleanEndMonth)}, ${year}`;
  }
}

function formatSingleDate(date) {
  const dayName = date.toLocaleDateString('es-ES', { weekday: 'long' });
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  // Año a 2 dígitos (p. ej. 2026 → 26).
  const year = String(date.getFullYear() % 100).padStart(2, '0');
  return `${capitalize(dayName)} ${day}/${month}/${year}`;
}

// Solo la fecha en números (DD/MM/AA), sin el nombre del día. La usa el
// Navegador en móvil para mostrar únicamente la fecha.
function formatSingleDateNumeric(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  // Año a 2 dígitos (p. ej. 2026 → 26).
  const year = String(date.getFullYear() % 100).padStart(2, '0');
  return `${day}/${month}/${year}`;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getAppDayIndex(date) {
  const day = date.getDay(); // 0 = Sunday, 1 = Monday
  return day === 0 ? 7 : day;
}

// --- Calculation of Occurrences for Recurrences ---
// Pure pattern matcher that checks if a checkDate matches the task recurrence rules (ignoring exceptions and end limits)
function matchesRecurrenceRulePattern(task, checkDate) {
  if (!task.recurrence || !task.recurrence.enabled) {
    return false;
  }

  const baseDate = new Date(task.date + 'T00:00:00');
  if (checkDate < baseDate) {
    return false;
  }

  const unit = task.recurrence.unit || 'weekly';
  const interval = task.recurrence.interval || task.recurrence.weeksInterval || 1;

  if (unit === 'weekly') {
    const appDay = getAppDayIndex(checkDate);
    if (!task.recurrence.days || !task.recurrence.days.includes(appDay)) {
      return false;
    }
    const baseMonday = getMondayOf(baseDate);
    const checkMonday = getMondayOf(checkDate);
    const msDiff = checkMonday.getTime() - baseMonday.getTime();
    const weeksDiff = Math.round(msDiff / (7 * 24 * 60 * 60 * 1000));
    return weeksDiff >= 0 && weeksDiff % interval === 0;
  }

  if (unit === 'monthly') {
    if (checkDate.getDate() !== baseDate.getDate()) {
      return false;
    }
    const monthsDiff = (checkDate.getFullYear() - baseDate.getFullYear()) * 12 + (checkDate.getMonth() - baseDate.getMonth());
    return monthsDiff >= 0 && monthsDiff % interval === 0;
  }

  if (unit === 'yearly') {
    if (checkDate.getDate() !== baseDate.getDate() || checkDate.getMonth() !== baseDate.getMonth()) {
      return false;
    }
    const yearsDiff = checkDate.getFullYear() - baseDate.getFullYear();
    return yearsDiff >= 0 && yearsDiff % interval === 0;
  }

  return false;
}

// Checks if a task occurs on a given target date
function checkTaskOccurrence(task, targetDate) {
  const targetDateStr = formatDate(targetDate);

  // Case 1: Standard Non-Recurring Task
  if (!task.recurrence || !task.recurrence.enabled) {
    return task.date === targetDateStr;
  }

  // Case 2: Recurring Task
  if (task.recurrence.exceptions && task.recurrence.exceptions.includes(targetDateStr)) {
    return false;
  }

  const checkDate = new Date(targetDateStr + 'T00:00:00');

  // Check pattern match
  if (!matchesRecurrenceRulePattern(task, checkDate)) {
    return false;
  }

  // Check end conditions
  if (task.recurrence.endType === 'date') {
    if (task.recurrence.endDate) {
      const endDate = new Date(task.recurrence.endDate + 'T23:59:59');
      if (checkDate > endDate) {
        return false;
      }
    }
  } else if (task.recurrence.endType === 'count') {
    const baseDate = new Date(task.date + 'T00:00:00');
    // Count occurrences from baseDate up to checkDate
    const occurrencesCount = countOccurrencesInRange(task, baseDate, checkDate);
    if (occurrencesCount > task.recurrence.endCount) {
      return false;
    }
  }

  return true;
}

// Helper to count how many times a recurring task occurred between startDate and endDate
function countOccurrencesInRange(task, startDate, endDate) {
  let count = 0;
  const current = new Date(startDate);
  
  // Set to 0 hours to prevent infinite loop or wrong comparisons
  current.setHours(0,0,0,0);
  const limitDate = new Date(endDate);
  limitDate.setHours(0,0,0,0);

  // Let's iterate day by day
  while (current <= limitDate) {
    if (matchesRecurrenceRulePattern(task, current)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

// --- Dynamic Render Engine ---
function renderTasksToContainer(dayTasks, tasksContainer, dateStr) {
  tasksContainer.innerHTML = '';
  
  const pendingTasks = [];
  const completedTasks = [];
  
  dayTasks.forEach(task => {
    const isCompleted = task.recurrence && task.recurrence.enabled
      ? !!(task.completedOccurrences && task.completedOccurrences.includes(dateStr))
      : !!task.completed;
    if (isCompleted) {
      completedTasks.push(task);
    } else {
      pendingTasks.push(task);
    }
  });

  // Render pending tasks first
  pendingTasks.forEach(task => {
    const taskCard = createTaskCard(task, dateStr);
    tasksContainer.appendChild(taskCard);
  });

  // Render completed tasks inside a collapsible section at the bottom
  if (completedTasks.length > 0) {
    const completedWrapper = buildCompletedWrapper(dateStr, completedTasks.length, pendingTasks.length > 0);
    const completedContainer = completedWrapper.querySelector('.completed-tasks-container');

    completedTasks.forEach(task => {
      const taskCard = createTaskCard(task, dateStr);
      completedContainer.appendChild(taskCard);
    });

    tasksContainer.appendChild(completedWrapper);
  }
}

// Construye el wrapper colapsable de "Completadas" (cabecera + contenedor) con
// su listener de toggle, SIN tarjetas dentro. Se usa tanto en el render normal
// como al mover una tarjeta in-place (móvil) para no reconstruir el día entero.
function buildCompletedWrapper(dateStr, completedCount, hasPending) {
    const completedWrapper = document.createElement('div');
    completedWrapper.className = 'completed-tasks-wrapper' + (hasPending ? ' has-pending' : '');

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'completed-tasks-toggle';

    const isExpanded = completedTasksExpanded;
    if (isExpanded) {
      completedWrapper.classList.add('expanded');
    }

    toggleBtn.innerHTML = `
      <img src="icons/chevron-down.svg" alt="" width="12" height="12" class="completed-toggle-arrow ${isExpanded ? 'rotated' : ''}">
      <span class="completed-toggle-text">Completadas (${completedCount})</span>
    `;

    const completedContainer = document.createElement('div');
    completedContainer.className = 'completed-tasks-container';
    if (!isExpanded) {
      completedContainer.style.display = 'none';
    }

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      completedTasksExpanded = !completedTasksExpanded;
      try {
        window.localStorage.setItem('completedTasksExpanded', completedTasksExpanded ? 'true' : 'false');
      } catch (err) {
        console.error('Error saving completedTasksExpanded to localStorage:', err);
      }
      if (isMobile()) {
        // Animar apertura/cierre en mobile sin re-render
        const arrow = toggleBtn.querySelector('.completed-toggle-arrow');

        // Capturar posiciones de los días debajo de este en el feed
        const grid = document.querySelector('.planner-grid');
        const thisDayCol = completedWrapper.closest('.mobile-feed-day');
        const allDayCols = grid ? [...grid.querySelectorAll('.mobile-feed-day')] : [];
        const dayColIndex = allDayCols.indexOf(thisDayCol);
        const belowDayCols = allDayCols.slice(dayColIndex + 1);
        const belowSnap = belowDayCols.map(el => ({ el, top: el.getBoundingClientRect().top }));

        if (completedTasksExpanded) {
          // Abrir
          completedContainer.style.display = 'flex';
          completedContainer.style.overflow = 'hidden';
          const fullHeight = completedContainer.scrollHeight;
          completedContainer.style.height = '0px';
          completedContainer.style.opacity = '0';
          completedContainer.style.transition = 'none';
          if (arrow) arrow.classList.add('rotated');
          requestAnimationFrame(() => {
            completedContainer.style.transition = 'height 0.2s ease, opacity 0.2s ease';
            completedContainer.style.height = fullHeight + 'px';
            completedContainer.style.opacity = '1';
            // FLIP días de abajo
            belowSnap.forEach(({ el, top }) => {
              el.style.transition = 'none';
              el.style.transform = `translateY(${top - el.getBoundingClientRect().top}px)`;
              requestAnimationFrame(() => {
                el.style.transition = 'transform 0.2s ease';
                el.style.transform = 'translateY(0)';
                el.addEventListener('transitionend', () => {
                  el.style.transition = '';
                  el.style.transform = '';
                }, { once: true });
              });
            });
            completedContainer.addEventListener('transitionend', () => {
              completedContainer.style.height = '';
              completedContainer.style.overflow = '';
              completedContainer.style.transition = '';
              completedContainer.style.opacity = '';
            }, { once: true });
          });
        } else {
          // Cerrar
          completedContainer.style.overflow = 'hidden';
          completedContainer.style.height = completedContainer.scrollHeight + 'px';
          completedContainer.style.transition = 'none';
          if (arrow) arrow.classList.remove('rotated');
          requestAnimationFrame(() => {
            completedContainer.style.transition = 'height 0.2s ease, opacity 0.2s ease';
            completedContainer.style.height = '0px';
            completedContainer.style.opacity = '0';
            // FLIP días de abajo
            belowSnap.forEach(({ el, top }) => {
              el.style.transition = 'none';
              el.style.transform = `translateY(${top - el.getBoundingClientRect().top}px)`;
              requestAnimationFrame(() => {
                el.style.transition = 'transform 0.2s ease';
                el.style.transform = 'translateY(0)';
                el.addEventListener('transitionend', () => {
                  el.style.transition = '';
                  el.style.transform = '';
                }, { once: true });
              });
            });
            completedContainer.addEventListener('transitionend', () => {
              completedContainer.style.display = 'none';
              completedContainer.style.height = '';
              completedContainer.style.overflow = '';
              completedContainer.style.transition = '';
              completedContainer.style.opacity = '';
            }, { once: true });
          });
        }

        // Aplicar el mismo estado (abierto/cerrado) al resto de dias YA
        // renderizados en el feed, de forma instantanea (sin animacion, para
        // no recalcular layout en todo el feed). Asi el toggle de "Completadas"
        // es global: afecta a todos los dias, no solo al que se toco.
        document.querySelectorAll('.completed-tasks-container').forEach(ctr => {
          if (ctr === completedContainer) return; // este ya se animo arriba
          const btn = ctr.closest('.completed-tasks-wrapper').querySelector('.completed-tasks-toggle');
          const arr = btn ? btn.querySelector('.completed-toggle-arrow') : null;
          if (completedTasksExpanded) {
            ctr.style.display = 'flex';
            ctr.style.height = '';
            ctr.style.overflow = '';
            ctr.style.opacity = '';
            if (arr) arr.classList.add('rotated');
          } else {
            ctr.style.display = 'none';
            ctr.style.height = '';
            ctr.style.overflow = '';
            ctr.style.opacity = '';
            if (arr) arr.classList.remove('rotated');
          }
        });
      } else {
        // Animar apertura/cierre en todos los días sin re-render
        function animateCompletedContainer(ctr, open) {
          const btn = ctr.closest('.completed-tasks-wrapper').querySelector('.completed-tasks-toggle');
          const arr = btn ? btn.querySelector('.completed-toggle-arrow') : null;
          if (open) {
            ctr.style.display = 'flex';
            ctr.style.overflow = 'hidden';
            const fullHeight = ctr.scrollHeight;
            ctr.style.height = '0px';
            ctr.style.opacity = '0';
            ctr.style.transition = 'none';
            if (arr) arr.classList.add('rotated');
            requestAnimationFrame(() => {
              ctr.style.transition = 'height 0.2s ease, opacity 0.2s ease';
              ctr.style.height = fullHeight + 'px';
              ctr.style.opacity = '1';
              ctr.addEventListener('transitionend', () => {
                ctr.style.height = '';
                ctr.style.overflow = '';
                ctr.style.transition = '';
                ctr.style.opacity = '';
              }, { once: true });
            });
          } else {
            ctr.style.overflow = 'hidden';
            ctr.style.height = ctr.scrollHeight + 'px';
            ctr.style.transition = 'none';
            if (arr) arr.classList.remove('rotated');
            requestAnimationFrame(() => {
              ctr.style.transition = 'height 0.2s ease, opacity 0.2s ease';
              ctr.style.height = '0px';
              ctr.style.opacity = '0';
              ctr.addEventListener('transitionend', () => {
                ctr.style.display = 'none';
                ctr.style.height = '';
                ctr.style.overflow = '';
                ctr.style.transition = '';
                ctr.style.opacity = '';
              }, { once: true });
            });
          }
        }

        // Animar todos los completed-tasks-container del calendario
        document.querySelectorAll('.completed-tasks-container').forEach(ctr => {
          animateCompletedContainer(ctr, completedTasksExpanded);
        });
      }
    });
    
    completedWrapper.appendChild(toggleBtn);
    completedWrapper.appendChild(completedContainer);
    return completedWrapper;
}

// Mueve UNA tarjeta entre la sección de pendientes y el wrapper de "Completadas"
// directamente en el DOM ya renderizado, sin vaciar ni reconstruir el día. Esto
// elimina el parpadeo blanco en móvil al marcar/desmarcar una tarea.
//   container    → .tasks-container del día
//   card         → la tarjeta a mover (ya con su clase .completed actualizada)
//   nowCompleted → true si pasó a completada, false si pasó a pendiente
function moveTaskCardInPlace(container, card, dateStr, nowCompleted) {
  if (!container || !card) return;
  let wrapper = container.querySelector('.completed-tasks-wrapper');

  if (nowCompleted) {
    // Asegurar que existe el wrapper de completadas; crearlo si no.
    if (!wrapper) {
      const hasPending = !!container.querySelector(':scope > .task-card');
      wrapper = buildCompletedWrapper(dateStr, 0, hasPending);
      container.appendChild(wrapper);
    }
    const ctr = wrapper.querySelector('.completed-tasks-container');
    // Mover al inicio de las completadas (más recientemente completada arriba).
    ctr.insertBefore(card, ctr.firstChild);
  } else {
    // Devolver la tarjeta a la zona de pendientes, antes del wrapper.
    container.insertBefore(card, wrapper || null);
    // Si ya no quedan completadas, eliminar el wrapper.
    if (wrapper) {
      const ctr = wrapper.querySelector('.completed-tasks-container');
      if (!ctr.querySelector('.task-card')) {
        wrapper.remove();
        wrapper = null;
      }
    }
  }

  // Actualizar contador y flag has-pending del wrapper restante.
  if (wrapper) {
    const ctr = wrapper.querySelector('.completed-tasks-container');
    const count = ctr.querySelectorAll('.task-card').length;
    const textEl = wrapper.querySelector('.completed-toggle-text');
    if (textEl) textEl.textContent = `Completadas (${count})`;
    const hasPending = !!container.querySelector(':scope > .task-card');
    wrapper.classList.toggle('has-pending', hasPending);
  }
}

function renderWeeklyCalendar(targetWrapper = document) {
  // En móvil, el feed continuo se gestiona por separado
  if (isMobile()) {
    if (mobileScrollInit) {
      updateMobileFeedTasks();
    }
    // Actualizar label de semana (planner móvil: con nombre del día).
    const visibleDate = getMobileVisibleDate() || new Date();
    document.querySelectorAll('.week-range-label').forEach(el => {
      el.textContent = formatSingleDate(visibleDate);
    });
    // Si el horario está activo, mantenerlo sincronizado también en móvil. Sin
    // esto, cuando las tareas llegan de la nube DESPUÉS del primer render del
    // cronograma (carga asíncrona), el horario móvil se quedaba vacío porque
    // este return cortaba antes de re-renderizarlo.
    if (cronogramaActive) renderCronograma();
    return;
  }

  const monday = currentWeekStart;

  // Update week range label
  document.querySelectorAll('.week-range-label').forEach(el => {
    el.textContent = formatWeekRange(monday);
  });

  const today = new Date();
  const todayStr = formatDate(today);

  // Loop columns (Monday = 1, ..., Sunday = 7)
  for (let i = 1; i <= 7; i++) {
    const colDate = addDays(monday, i - 1);
    const colDateStr = formatDate(colDate);
    
    // Find column elements
    const colElement = targetWrapper.querySelector(`.day-column[data-day="${i}"]`);
    if (!colElement) continue;
    const numElement = colElement.querySelector('.day-number');
    const tasksContainer = colElement.querySelector('.tasks-container');

    // Update numbers
    numElement.textContent = colDate.getDate();

    // Toggle today highlight class
    if (colDateStr === todayStr) {
      colElement.classList.add('today');
    } else {
      colElement.classList.remove('today');
    }

    // Highlight dialogue button if notes exist for this day
    const dialogueBtn = colElement.querySelector('.dialogue-day-btn');
    if (dialogueBtn) {
      const dialogueImg = dialogueBtn.querySelector('img');
      if (notes[colDateStr]) {
        dialogueBtn.classList.add('has-notes');
        if (dialogueImg) dialogueImg.src = 'icons/message-square-text.svg';
      } else {
        dialogueBtn.classList.remove('has-notes');
        if (dialogueImg) dialogueImg.src = 'icons/message-square.svg';
      }
    }

    const durationBtn = colElement.querySelector('.duration-day-btn');
    if (durationBtn) {
      const pendingMins = getDurationForDay(colDateStr, false);
      const completedMins = getDurationForDay(colDateStr, true);
      if (pendingMins > 0 || completedMins > 0) {
        durationBtn.classList.add('has-duration');
      } else {
        durationBtn.classList.remove('has-duration');
      }
      durationBtn.dataset.tooltip = buildDurationTooltip(colDateStr);
    }

    // Actualizar botón de duración total del día

    // Set dataset date attribute for drag-drop and adding tasks
    colElement.dataset.date = colDateStr;

    // Mostrar/ocultar botones de copiar y limpiar segun haya tareas en el dia
    updateDayHeaderButtonsVisibility(colElement, colDateStr);

    // Clear previous tasks
    tasksContainer.innerHTML = '';

    // Fetch tasks for this day (both single and recurring) and check tag visibility
    const dayTasks = tasks.filter(task => {
      const isOccurring = checkTaskOccurrence(task, colDate);
      if (!isOccurring) return false;
      const tag = tags.find(t => t.id === task.tagId) || tags.find(t => t.id === 'default');
      return tag ? tag.visible !== false : true;
    });

    // Sort tasks by position (which handles both chronological and manual ordering)
    sortDayTasks(dayTasks, colDateStr);

    // Render tasks
    renderTasksToContainer(dayTasks, tasksContainer, colDateStr);
  }
  renderBriefcaseTasks();
  // Reaplicar el aislamiento de día (persiste al cambiar de semana).
  applyDayIsolation();
  // Si el cronograma está activo, mantenerlo sincronizado con la semana
  // visible (al navegar entre semanas, cambiar de fecha, etc.).
  if (cronogramaActive) renderCronograma();
}

// ─────────────────────────────────────────────────────────────────────────
// CRONOGRAMA (vista tipo Google Calendar) — Solo lectura
// Escritorio: muestra los 7 días de la semana visible, con la misma cabecera
// del planner, una columna de horas a la izquierda y las tareas con horario
// (rango "HH:MM - HH:MM" al inicio de la descripción) dibujadas como bloques.
// Móvil: muestra solo el día de hoy en una única columna.
// No es interactiva: cabeceras y bloques son de solo lectura.
// ─────────────────────────────────────────────────────────────────────────

let cronogramaActive = false;
// Día visible en el horario (cronograma) en MÓVIL. En móvil el horario muestra
// un día centrado en un carrusel deslizable; esta variable es ese día. null = hoy.
let cronogramaMobileDate = null;
// Nº de días precargados a cada lado del día central en el carrusel móvil.
const CR_MOBILE_PRELOAD = 10;
// Estado del listener de scroll del carrusel móvil del horario.
let crTrackScrollTimer = null;
let crTrackListenerBound = false;
// Restaurar la última vista elegida por el usuario (planner/cronograma). La
// clave 'viewMode' guarda 'cronograma' o 'planner'. Solo se aplica realmente a
// la UI en restoreSavedViewMode(), tras montar el DOM.
let savedViewModeIsCronograma = false;
try {
  savedViewModeIsCronograma = window.localStorage.getItem('viewMode') === 'cronograma';
} catch (e) {
  savedViewModeIsCronograma = false;
}

const CRONOGRAMA_DAY_NAMES = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO', 'DOMINGO'];

// Extrae un rango de horas "HH:MM - HH:MM" desde el INICIO de la descripción
// (el mismo patrón que activa las "duraciones"). Devuelve { startMin, endMin }
// en minutos desde medianoche, o null si la descripción no empieza con un rango
// válido. Para rangos que cruzan medianoche (fin <= inicio) se recorta el fin a
// las 24:00 (1440) para que el bloque no desborde la línea de tiempo del día.
function parseTimeRangeFromDescription(description) {
  if (!description || typeof description !== 'string') return null;
  const s = description.trimStart();
  const m = s.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const sh = parseInt(m[1], 10), sm = parseInt(m[2], 10);
  const eh = parseInt(m[3], 10), em = parseInt(m[4], 10);
  if (sh > 23 || sm > 59 || eh > 23 || em > 59) return null;
  const startMin = sh * 60 + sm;
  const rawEndMin = eh * 60 + em;
  // Cruce de medianoche: el fin es menor o igual que el inicio.
  const crossesMidnight = rawEndMin <= startMin;
  // endMin recortado al fin del día para dibujar el tramo del día actual.
  const endMin = crossesMidnight ? 24 * 60 : rawEndMin;
  return {
    startMin,
    endMin,
    rawEndMin,        // fin real sin recortar (minutos del día siguiente si cruza)
    crossesMidnight,  // true si la tarea termina después de medianoche
    startStr: `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`,
    endStr: `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
  };
}

// ─── Rango horario de una tarea desde sus CAMPOS startTime/endTime ────────────
// Fuente única de verdad para horario/arrastre. Devuelve la misma estructura que
// parseTimeRangeFromDescription, o null si la tarea no tiene inicio Y fin (un
// bloque del horario necesita ambos para tener altura).
function getTaskTimeRange(task) {
  if (!task || !task.startTime || !task.endTime) return null;
  const ms = String(task.startTime).match(/^(\d{1,2}):(\d{2})$/);
  const me = String(task.endTime).match(/^(\d{1,2}):(\d{2})$/);
  if (!ms || !me) return null;
  const sh = parseInt(ms[1], 10), sm = parseInt(ms[2], 10);
  const eh = parseInt(me[1], 10), em = parseInt(me[2], 10);
  if (sh > 23 || sm > 59 || eh > 23 || em > 59) return null;
  const startMin = sh * 60 + sm;
  const rawEndMin = eh * 60 + em;
  const crossesMidnight = rawEndMin <= startMin;
  const endMin = crossesMidnight ? 24 * 60 : rawEndMin;
  return {
    startMin, endMin, rawEndMin, crossesMidnight,
    startStr: `${String(sh).padStart(2, '0')}:${String(sm).padStart(2, '0')}`,
    endStr: `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`
  };
}

// ─────────────────────────────────────────────────────────────────────────
// DETECCIÓN DE TAREAS ADYACENTES (encadenado de horarios)
// ─────────────────────────────────────────────────────────────────────────
// Cuando el usuario modifica la hora de inicio o de fin de una tarea que está
// "pegada" (dentro de un margen de tolerancia) a otra, ofrecemos ajustar la
// vecina para que sigan encajando. Toda la comparación se hace en MINUTOS
// ABSOLUTOS desde una época común (díaIndex*1440 + minutoDelDía), de modo que
// un fin a las 01:00 del día siguiente y un inicio a las 01:00 de ese mismo día
// se reconozcan como coincidentes aunque pertenezcan a fechas distintas.

// Parámetros internos OCULTOS al usuario (fáciles de cambiar aquí).
const TOLERANCIA_ADYACENCIA_MIN = 3;   // margen para considerar dos bordes "pegados"
const MIN_DURACION_AJUSTE_MIN   = 20;  // la vecina no se ajusta si quedaría < esto

// Convierte "YYYY-MM-DD" a un índice de día entero (días desde época). Devuelve
// null si la fecha no es válida (p.ej. tareas del maletín sin fecha).
function dateStrToDayIndex(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return Math.round(d.getTime() / 86400000);
}

// "HH:MM" -> minutos del día (0..1439), o null si inválido.
function hhmmToMinutes(hhmm) {
  if (!hhmm) return null;
  const m = String(hhmm).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

// Minutos absolutos del INICIO y FIN de una tarea con horario definido, en la
// recta temporal común. Si la tarea cruza medianoche, el fin cae en el día
// siguiente (+1440). Devuelve null si la tarea no tiene inicio+fin+fecha válidos.
function getTaskAbsoluteRange(task) {
  if (!task) return null;
  const dayIdx = dateStrToDayIndex(task.date);
  if (dayIdx === null) return null;
  const sMin = hhmmToMinutes(task.startTime);
  const eMin = hhmmToMinutes(task.endTime);
  if (sMin === null || eMin === null) return null;
  const base = dayIdx * 1440;
  const startAbs = base + sMin;
  // Cruce de medianoche: fin <= inicio significa que termina al día siguiente.
  const endAbs = (eMin <= sMin) ? base + eMin + 1440 : base + eMin;
  return { startAbs, endAbs };
}

// A partir de minutos absolutos, reconstruye { date:"YYYY-MM-DD", time:"HH:MM" }.
function absoluteMinutesToDateTime(absMin) {
  const dayIdx = Math.floor(absMin / 1440);
  const minOfDay = ((absMin % 1440) + 1440) % 1440;
  const d = new Date(dayIdx * 86400000);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(Math.floor(minOfDay / 60)).padStart(2, '0');
  const mi = String(minOfDay % 60).padStart(2, '0');
  return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` };
}

// Núcleo de la detección.
//   modifiedTask  : la tarea YA con sus nuevos startTime/endTime/date aplicados.
//   oldRange      : { startAbs, endAbs } de la tarea ANTES del cambio (para saber
//                   qué borde se movió y dónde estaba pegada la vecina).
// Devuelve un array de "afectaciones" VIABLES, cada una:
//   { task, edge:'start'|'end', newDate, newTime }
// donde edge es el borde de la VECINA que se ajustaría.
function findAdjacentAffectedTasks(modifiedTask, oldRange) {
  const result = [];
  if (!modifiedTask || !oldRange) return result;
  const newRange = getTaskAbsoluteRange(modifiedTask);
  if (!newRange) return result;

  const startMoved = newRange.startAbs !== oldRange.startAbs;
  const endMoved   = newRange.endAbs   !== oldRange.endAbs;
  if (!startMoved && !endMoved) return result;

  const tol = TOLERANCIA_ADYACENCIA_MIN;

  for (const other of tasks) {
    if (!other || other.id === modifiedTask.id) continue;
    const oRange = getTaskAbsoluteRange(other);
    if (!oRange) continue;

    // (1) Moví el FIN de la tarea -> busco vecinas cuyo INICIO estaba pegado al
    //     fin ANTERIOR; las re-anclo a mi nuevo fin (ajustando su INICIO).
    if (endMoved && Math.abs(oRange.startAbs - oldRange.endAbs) <= tol) {
      const newNeighborStartAbs = newRange.endAbs;
      const neighborDurAfter = oRange.endAbs - newNeighborStartAbs;
      // Filtro de viabilidad: la vecina debe conservar >= mínimo de duración.
      if (neighborDurAfter >= MIN_DURACION_AJUSTE_MIN) {
        const dt = absoluteMinutesToDateTime(newNeighborStartAbs);
        result.push({ task: other, edge: 'start', newDate: dt.date, newTime: dt.time });
      }
      continue; // una vecina se ajusta por un solo borde
    }

    // (2) Moví el INICIO de la tarea -> busco vecinas cuyo FIN estaba pegado al
    //     inicio ANTERIOR; las re-anclo a mi nuevo inicio (ajustando su FIN).
    if (startMoved && Math.abs(oRange.endAbs - oldRange.startAbs) <= tol) {
      const newNeighborEndAbs = newRange.startAbs;
      const neighborDurAfter = newNeighborEndAbs - oRange.startAbs;
      if (neighborDurAfter >= MIN_DURACION_AJUSTE_MIN) {
        const dt = absoluteMinutesToDateTime(newNeighborEndAbs);
        result.push({ task: other, edge: 'end', newDate: dt.date, newTime: dt.time });
      }
      continue;
    }
  }

  return result;
}

// Aplica las afectaciones calculadas (mueve el borde correspondiente de cada
// vecina). No guarda ni renderiza: eso lo hace el llamador.
function applyAdjacentAffectations(affectations) {
  if (!affectations || !affectations.length) return;
  for (const aff of affectations) {
    const t = aff.task;
    if (!t) continue;
    if (aff.edge === 'start') {
      t.startTime = aff.newTime;
      if (aff.newDate) t.date = aff.newDate;
    } else if (aff.edge === 'end') {
      t.endTime = aff.newTime;
      // El fin puede caer en el día siguiente; eso se modela por la relación
      // fin<=inicio (cruce de medianoche), no cambiando t.date.
    }
    // Recalcular duración almacenada (coherencia con el resto de la app).
    const sMin = hhmmToMinutes(t.startTime);
    const eMin = hhmmToMinutes(t.endTime);
    if (sMin !== null && eMin !== null) {
      let diff = eMin - sMin;
      if (diff < 0) diff += 1440;
      t.duration = diff;
    }
  }
}

// Duración (minutos) de una tarea para estadísticas/sumas.
// Prioridad: (1) si la tarea tiene hora de inicio + fin definidas, se usa esa
// duración; (2) en caso contrario, se usa la duración escrita al inicio de la
// descripción ("1h", "20 min", "1 hora 20 minutos", …). null si no hay ninguna.
function getTaskDurationMinutes(task) {
  const r = getTaskTimeRange(task);
  if (r) {
    return (r.crossesMidnight ? r.rawEndMin + 1440 : r.rawEndMin) - r.startMin;
  }
  const parsed = parseDurationFromDescription(task && task.description);
  return parsed ? parsed.minutes : null;
}

// ─── Alarma: detectar la hora de inicio al comienzo de la descripcion ─────────
// Acepta una hora suelta ("08:00 ...") o un rango ("08:00 - 13:40 ...").
// Devuelve "HH:MM" o null si no hay hora de inicio valida.
function parseStartTimeFromDescription(description) {
  if (!description || typeof description !== 'string') return null;
  const s = description.trimStart();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
}

// Sincroniza el estado del checkbox de alarma con la descripcion actual:
// solo se puede activar si hay una hora de inicio. Si no la hay, se desactiva
// y se deshabilita (atenuado).
function syncAlarmCheckboxState() {
  const checkbox = document.getElementById('task-alarm-checkbox');
  if (!checkbox) return;
  // La alarma requiere una HORA DE INICIO (campo del editor).
  const startEl = document.getElementById('task-input-start');
  const hasStart = !!(startEl && startEl.value);
  checkbox.disabled = !hasStart;
  if (!hasStart) checkbox.checked = false;

  // Reflejar el estado en el icono de campana: deshabilitado si no hay hora,
  // resaltado ("active") si la alarma está activada.
  const bell = document.getElementById('task-alarm-bell');
  if (bell) {
    const on = hasStart && checkbox.checked;
    bell.disabled = !hasStart;
    bell.classList.toggle('active', on);
    // Campana rellena (negra) cuando está activa; de contorno cuando no.
    const bellImg = bell.querySelector('img');
    if (bellImg) bellImg.src = on ? 'icons/bell-filled.svg' : 'icons/bell.svg';
    bell.title = !hasStart
      ? 'Define una hora de inicio para activar la alarma'
      : (checkbox.checked ? 'Alarma activada (clic para desactivar)' : 'Activar alarma');
  }
}

// ─── Formato de hora 24h forzado (independiente del dispositivo) ──────────────
// El input nativo type=time muestra a.m./p.m. según la región del sistema y no
// se puede forzar a 24h de forma fiable en todos los navegadores. Aquí ocultamos
// el texto nativo (vía CSS) y sincronizamos un overlay con el valor "HH:MM", que
// ya está en formato 24h. Cualquier asignación a .value (manual o por código)
// actualiza el overlay porque interceptamos el setter de la propiedad value.
function updateTime24Overlay(input) {
  if (!input) return;
  const overlay = document.querySelector('.time-24-overlay[data-for="' + input.id + '"]');
  if (overlay) overlay.textContent = input.value || '';
}

// El .value de un input type=date es siempre "YYYY-MM-DD" (estándar, no depende
// de la región). Lo convertimos a "DD/MM/AA" para el overlay.
function updateDateOverlay(input) {
  if (!input) return;
  const overlay = document.querySelector('.date-ddmmyy-overlay[data-for="' + input.id + '"]');
  if (!overlay) return;
  const v = input.value || '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  overlay.textContent = m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '';
}

function initForce24Time() {
  const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  // Hora (HH:MM)
  document.querySelectorAll('input[type="time"][data-force24]').forEach(input => {
    // Interceptar asignaciones programáticas de .value para refrescar el overlay.
    try {
      Object.defineProperty(input, 'value', {
        configurable: true,
        get() { return proto.get.call(this); },
        set(v) { proto.set.call(this, v); updateTime24Overlay(this); }
      });
    } catch (e) { /* si falla, los listeners de abajo cubren la interacción manual */ }
    input.addEventListener('input', () => updateTime24Overlay(input));
    input.addEventListener('change', () => updateTime24Overlay(input));
    updateTime24Overlay(input); // estado inicial
  });
  // Fecha (DD/MM/AA)
  document.querySelectorAll('input[type="date"][data-force-ddmmyy]').forEach(input => {
    try {
      Object.defineProperty(input, 'value', {
        configurable: true,
        get() { return proto.get.call(this); },
        set(v) { proto.set.call(this, v); updateDateOverlay(this); }
      });
    } catch (e) { /* los listeners cubren la interacción manual */ }
    input.addEventListener('input', () => updateDateOverlay(input));
    input.addEventListener('change', () => updateDateOverlay(input));
    updateDateOverlay(input); // estado inicial
  });

  // Permitir escribir y abrir el selector simultáneamente al cliquear el wrapper
  document.querySelectorAll('.date-input-wrapper').forEach(wrapper => {
    wrapper.addEventListener('click', (e) => {
      if (e.target.closest('.date-calendar-icon, .time-clear-btn, .time-bell-btn')) return;
      const input = wrapper.querySelector('input[type="date"]');
      if (input && !input.disabled) {
        input.focus();
        if (typeof input.showPicker === 'function') {
          try { input.showPicker(); } catch (_) {}
        }
      }
    });
  });
}

// ─── Sistema de alarmas ───────────────────────────────────────────────────────
// Una tarea con alarm:true y una hora de inicio en su descripción dispara:
//  · una notificación del navegador a la hora de inicio (con la app abierta), y
//  · un modal "Alarma" con botón "Aceptar" al abrir la app, para alarmas cuya
//    hora ya pasó hoy y aún no se reconocieron.
const ACK_ALARMS_KEY = 'planner7-acknowledged-alarms';
let alarmTimers = [];          // setTimeout pendientes de hoy
let pendingAlarmQueue = [];    // alarmas vencidas a mostrar en cola

function getAcknowledgedAlarms() {
  try { return JSON.parse(localStorage.getItem(ACK_ALARMS_KEY)) || {}; }
  catch (e) { return {}; }
}
function markAlarmAcknowledged(key) {
  const acks = getAcknowledgedAlarms();
  acks[key] = Date.now();
  // Limpieza: conservar solo claves de los últimos 3 días.
  const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
  for (const k of Object.keys(acks)) {
    if (acks[k] < cutoff) delete acks[k];
  }
  try { localStorage.setItem(ACK_ALARMS_KEY, JSON.stringify(acks)); } catch (e) {}
}
function isAlarmAcknowledged(key) {
  return Object.prototype.hasOwnProperty.call(getAcknowledgedAlarms(), key);
}

// Devuelve las ocurrencias de hoy con alarma activa: { task, key, startMin, title }
function getTodaysAlarmOccurrences() {
  const today = new Date();
  const todayStr = formatDate(today);
  const result = [];
  tasks.forEach(task => {
    if (!task.alarm) return;
    const startStr = (task.startTime && /^\d{1,2}:\d{2}$/.test(task.startTime)) ? task.startTime : null;
    if (!startStr) return;
    // ¿La tarea ocurre hoy? (cubre tareas simples y recurrentes)
    if (!checkTaskOccurrence(task, today)) return;
    const [h, mi] = startStr.split(':').map(Number);
    result.push({
      task,
      key: `${task.id}|${todayStr}`,
      startMin: h * 60 + mi,
      startStr,
      title: task.title
    });
  });
  return result;
}

function initAlarms() {
  // Pedir permiso de notificaciones (no bloquea el resto).
  if ('Notification' in window && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch (e) {}
  }
  refreshAlarms();
}

// Recalcula alarmas vencidas (modal) y programa las futuras de hoy (timers).
function refreshAlarms() {
  alarmTimers.forEach(clearTimeout);
  alarmTimers = [];

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const occurrences = getTodaysAlarmOccurrences();

  occurrences.forEach(occ => {
    if (isAlarmAcknowledged(occ.key)) return;
    if (occ.startMin <= nowMin) {
      // Ya venció hoy y no se ha reconocido: a la cola del modal.
      if (!pendingAlarmQueue.some(a => a.key === occ.key)) {
        pendingAlarmQueue.push(occ);
      }
    } else {
      // Aún por venir hoy: programar timer.
      const msUntil = ((occ.startMin - nowMin) * 60 - now.getSeconds()) * 1000;
      const timer = setTimeout(() => fireAlarm(occ), Math.max(0, msUntil));
      alarmTimers.push(timer);
    }
  });

  showNextAlarmModal();
}

// Dispara una alarma en el momento (notificación + cola del modal).
function fireAlarm(occ) {
  if (isAlarmAcknowledged(occ.key)) return;
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('Alarma', { body: `${occ.startStr} · ${occ.title}` });
    } catch (e) {}
  }
  if (!pendingAlarmQueue.some(a => a.key === occ.key)) {
    pendingAlarmQueue.push(occ);
  }
  showNextAlarmModal();
}

// Muestra el modal para la siguiente alarma pendiente de la cola.
function showNextAlarmModal() {
  const modal = document.getElementById('alarm-modal');
  if (!modal) return;
  // Si ya hay un modal de alarma visible, esperar a que se acepte.
  if (!modal.classList.contains('hidden')) return;
  // Saltar las ya reconocidas que quedaron en la cola.
  while (pendingAlarmQueue.length && isAlarmAcknowledged(pendingAlarmQueue[0].key)) {
    pendingAlarmQueue.shift();
  }
  if (!pendingAlarmQueue.length) return;

  const occ = pendingAlarmQueue[0];
  const textEl = document.getElementById('alarm-modal-text');
  if (textEl) textEl.textContent = `${occ.startStr} · ${occ.title}`;
  modal.classList.remove('hidden');
}

function acceptAlarmModal() {
  const modal = document.getElementById('alarm-modal');
  if (!modal) return;
  const occ = pendingAlarmQueue.shift();
  if (occ) markAlarmAcknowledged(occ.key);
  modal.classList.add('hidden');
  // Mostrar la siguiente de la cola, si la hay.
  setTimeout(showNextAlarmModal, 150);
}

// Devuelve true si hay alguna ventana/overlay abierto en la app: cualquier modal
// visible, el menú de usuario, el datepicker o el panel de archivados abierto.
function isAnyOverlayOpen() {
  // Modales (.modal-backdrop sin la clase hidden y visibles)
  const modalOpen = Array.from(document.querySelectorAll('.modal-backdrop')).some(m =>
    !m.classList.contains('hidden') && m.style.display !== 'none'
  );
  if (modalOpen) return true;
  // Menú de usuario (se añade al DOM solo mientras está abierto)
  if (document.getElementById('user-dropdown')) return true;
  // Datepicker desplegables
  const datepickers = document.querySelectorAll('.custom-calendar-dropdown');
  const isAnyDatePickerOpen = Array.from(datepickers).some(d => !d.classList.contains('hidden'));
  if (isAnyDatePickerOpen) return true;
  // Panel de archivados (drawer abierto = sin la clase closed)
  // En móvil, se comporta como un modal/overlay (bloquea la pantalla).
  // En escritorio, es un panel lateral integrado, así que no debe bloquear el atajo.
  const drawer = document.getElementById('briefcase-drawer');
  if (drawer && !drawer.classList.contains('closed') && isMobile()) return true;
  return false;
}

function showModeToast(message) {
  const existingToast = document.getElementById('mode-toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.id = 'mode-toast';
  toast.className = 'mode-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  // Forzar reflujo
  toast.offsetHeight;

  toast.classList.add('show');

  // El mensaje debe durar 1.5s en total.
  // A los 1.2s se remueve la clase 'show' para iniciar el desvanecimiento de 0.3s.
  setTimeout(() => {
    toast.classList.remove('show');
  }, 1200);

  // A los 1.5s se remueve completamente el elemento del DOM.
  setTimeout(() => {
    toast.remove();
  }, 1500);
}

function toggleCronograma() {
  // Capturar el día visible ANTES de cambiar de estado u ocultar nada (si se lee
  // después, el grid ya está display:none y getBoundingClientRect devuelve 0,
  // por lo que se obtenía un día equivocado).
  let mobileKeepDate = null;
  if (isMobile()) {
    mobileKeepDate = cronogramaActive
      ? (cronogramaMobileDate || new Date())   // venimos del horario
      : (getMobileVisibleDate() || new Date()); // venimos del planner
  }

  cronogramaActive = !cronogramaActive;
  document.body.classList.toggle('cronograma-active', cronogramaActive);
  showModeToast(cronogramaActive ? 'Modo Línea de tiempo' : 'Modo Lista de tareas');

  // Recordar la vista elegida para la próxima vez que se abra la app.
  try {
    window.localStorage.setItem('viewMode', cronogramaActive ? 'cronograma' : 'planner');
  } catch (e) {}

  const cronograma = document.getElementById('cronograma');
  const plannerGrid = document.querySelector('.planner-grid');

  if (cronogramaActive) {
    if (cronograma) cronograma.classList.remove('hidden');
    if (plannerGrid) plannerGrid.style.display = 'none';

    if (isMobile()) {
      const visibleDate = mobileKeepDate || new Date();
      cronogramaMobileDate = visibleDate;
      renderCronograma();
      document.querySelectorAll('.week-range-label').forEach(el => {
        el.textContent = formatSingleDate(visibleDate);
      });
    } else {
      cronogramaMobileDate = null;
      renderCronograma();
    }
    // Colocar el scroll para que la línea de hora quede bajo las cabeceras.
    requestAnimationFrame(scrollHorarioToNowLine);
  } else {
    if (cronograma) cronograma.classList.add('hidden');
    if (plannerGrid) plannerGrid.style.display = '';
    stopNowLineClock(); // detener el reloj de la línea de hora al salir del horario

    // En móvil, al volver al planner, colocar el feed en el día que se estaba
    // viendo en el horario (en lugar de forzar siempre hoy).
    if (isMobile()) {
      const targetDate = mobileKeepDate || cronogramaMobileDate || new Date();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => jumpMobileFeedToDate(targetDate));
      });
    }
  }

  updateViewToggleMenuLabel();
}

// Actualiza el tooltip y el icono del botón de alternar vista (en el Navegador)
// según el modo activo.
function updateViewToggleMenuLabel() {
  const btn = document.getElementById('nav-view-toggle-btn');
  if (btn) {
    btn.title = cronogramaActive ? 'Vista Lista de tareas' : 'Vista Línea de tiempo';
    const img = btn.querySelector('img');
    if (img) {
      if (cronogramaActive) {
        img.src = 'icons/clock.svg';
        img.alt = 'Modo línea de tiempo';
        img.setAttribute('width', '17');
        img.setAttribute('height', '17');
      } else {
        img.src = 'icons/to do.svg';
        img.alt = 'Modo lista de tareas';
        img.setAttribute('width', '21');
        img.setAttribute('height', '21');
      }
    }
  }
}

// Aplica al iniciar la vista guardada en localStorage. Si el usuario dejó la
// app en el cronograma, la reactiva (sin volver a alternar manualmente).
function restoreSavedViewMode() {
  if (!savedViewModeIsCronograma || cronogramaActive) return;
  cronogramaActive = true;
  document.body.classList.add('cronograma-active');
  cronogramaMobileDate = null; // el horario móvil arranca en HOY
  const cronograma = document.getElementById('cronograma');
  const plannerGrid = document.querySelector('.planner-grid');
  if (cronograma) cronograma.classList.remove('hidden');
  if (plannerGrid) plannerGrid.style.display = 'none';
  updateViewToggleMenuLabel();
  renderCronograma();
  if (isMobile()) {
    const label = document.getElementById('week-range-label');
    if (label) label.textContent = formatSingleDate(new Date());
  }
  requestAnimationFrame(scrollHorarioToNowLine);
}

// Construye una cabecera de día reutilizando la estructura .day-header del
// planner (nombre, número, y los mismos botones, aquí solo decorativos).
function buildCronogramaHeader(date, dayNameUpper, isToday) {
  const dateStr = formatDate(date);
  const header = document.createElement('div');
  header.className = 'day-header' + (isToday ? ' today' : '');
  // Los handlers delegados (limpiar, notas, copiar, duración) resuelven el día
  // leyendo dataset.date del .day-column o, en el cronograma, de la cabecera.
  header.dataset.date = dateStr;

  const name = document.createElement('span');
  name.className = 'day-name';
  name.textContent = dayNameUpper;
  header.appendChild(name);

  const num = document.createElement('span');
  num.className = 'day-number';
  num.textContent = date.getDate();
  header.appendChild(num);

  // Botón de notas/diálogo (igual que el planner: refleja si hay notas).
  const dialogueBtn = document.createElement('button');
  const hasNotes = !!notes[dateStr];
  dialogueBtn.className = 'dialogue-day-btn' + (hasNotes ? ' has-notes' : '');
  dialogueBtn.title = 'Diálogo';
  dialogueBtn.innerHTML = `<img src="${hasNotes ? 'icons/message-square-text.svg' : 'icons/message-square.svg'}" alt="Diálogo">`;
  header.appendChild(dialogueBtn);

  // Botón de estadísticas (círculo tipo gráfico de pizza). Misma presencia que
  // en el planner. Su función futura se definirá; por ahora es solo el botón.
  const statsBtn = document.createElement('button');
  statsBtn.className = 'stats-day-btn';
  statsBtn.title = 'Actividad';
  statsBtn.innerHTML = '<img src="icons/pie-chart.svg" alt="Actividad" width="14" height="14">';
  header.appendChild(statsBtn);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-day-btn';
  copyBtn.title = 'Copiar tareas como texto';
  copyBtn.innerHTML = '<img src="icons/copy.svg" alt="Copiar tareas" width="16" height="16">';
  header.appendChild(copyBtn);

  const clearBtn = document.createElement('button');
  clearBtn.className = 'clear-day-btn';
  clearBtn.title = 'Eliminar todas las tareas de este día';
  clearBtn.innerHTML = '<img src="icons/trash.svg" alt="Limpiar día" width="16" height="16">';
  header.appendChild(clearBtn);

  return header;
}

// Crea el elemento de un bloque de tarea para el cronograma.
//   topMin/bottomMin: posición vertical en minutos dentro de la columna (0..1440).
//   titleText: texto del título (puede llevar la marca de continuación "↪ ").
//   descText:  descripción completa de la tarea (incluye la hora al comienzo).
//   isCompleted: aplica el estilo de completada.
//   tag: etiqueta para los colores.
//
// El contenido visible depende de la DURACIÓN del tramo (= altura del bloque):
//   < 45 min      → solo el rectángulo, sin texto.
//   45 – 59 min   → solo el título.
//   ≥ 60 min      → título + descripción (recortada con "…" según la altura).
function buildCronogramaBlock(topMin, bottomMin, titleText, descText, isCompleted, tag, task, occurrenceDate, isTail) {
  // Reglas de contenido por duración (horario, escritorio y móvil por igual):
  //   < 15 min            → el bloque NO se muestra en absoluto (return null).
  //   15–25 min           → solo el color, con los extremos izq/der redondeados (píldora).
  //   15–39 min           → solo el color (sin texto y sin checkbox).
  //   40–59 min           → título + checkbox, centrados verticalmente.
  //   60–74 min           → título + hora (sin descripción).
  //   >= 75 min           → título + hora + descripción (los 3 juntos).
  const durationMin = bottomMin - topMin;
  if (durationMin < 15) return null;

  const block = document.createElement('div');
  block.className = 'cr-task-block' + (isTail ? ' cr-tail' : '');
  if (isCompleted) block.classList.add('completed');
  if (tag && tag.color) {
    block.style.setProperty('--tag-bg', tag.color.bg);
    block.style.setProperty('--tag-text', tag.color.text);
    block.style.setProperty('--tag-border', tag.color.border);
  }
  // Posición y tamaño (1px = 1 minuto).
  const heightPx = Math.max(bottomMin - topMin, 16);
  block.style.top = topMin + 'px';
  block.style.height = heightPx + 'px';
  // Guardar el rango REAL (minutos) para distinguir clics dentro de la tarea de
  // clics en el píxel sobrante cuando la altura visual se infla al mínimo (16px).
  block.dataset.topMin = String(topMin);
  block.dataset.bottomMin = String(bottomMin);

  // Click en el bloque: abrir la tarea para editar (salvo click en el checkbox).
  // Un clic sobre un bloque VISIBLE siempre abre su tarea; los clics en espacio
  // sin bloque los gestiona el grid (crear tarea), aunque haya tareas solapadas.
  if (task) {
    block.addEventListener('click', (e) => {
      if (e.target.closest('.task-check-btn')) return;
      if (suppressNextCronogramaClick) { e.stopPropagation(); return; }
      e.stopPropagation();
      openTaskModal(task.id, occurrenceDate || null);
    });

    // Arrastrar para mover de hora/día (snap 30 min, mantiene duración).
    // Los bloques "cola" (continuación tras medianoche) NO son arrastrables:
    // la tarea solo se mueve desde su bloque principal.
    if (!isTail) {
      // Escritorio: ratón con pointer events (arrastre inmediato).
      block.addEventListener('pointerdown', (e) => {
        // En móvil el arrastre se gestiona con touch + long-press (más abajo),
        // así que ignoramos los pointerdown táctiles para no duplicar el gesto.
        if (e.pointerType === 'touch') return;
        startCronogramaDrag(block, task, e);
      });
      // Móvil: long-press para iniciar el arrastre (deja intacto el scroll del
      // horario y el toque normal para abrir la tarea).
      block.addEventListener('touchstart', (e) => {
        startCronogramaTouch(block, task, e);
      }, { passive: false });

      // Evitar que mantener presionado el bloque abra el menú contextual del
      // navegador (Atrás, Recargar, Inspeccionar, "Abrir en pestaña nueva"…),
      // que en móvil interfiere con el long-press para arrastrar. Mismo bloqueo
      // que aplican las tarjetas del planner.
      block.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // Checkbox para marcar como completada (mismo SVG que el planner).
    // Solo se muestra a partir de 40 min (por debajo, el bloque va sin checkbox).
    if (durationMin >= 40) {
      const checkBtn = document.createElement('button');
      checkBtn.className = 'task-check-btn';
      checkBtn.title = isCompleted ? 'Marcar como pendiente' : 'Marcar como completada';
      checkBtn.innerHTML = isCompleted
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="task-check-icon checked"><rect x="2" y="2" width="20" height="20" rx="4" ry="4" fill="currentColor" stroke="none"/><polyline points="7 12 10 15 17 8" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>'
        : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="task-check-icon"><rect x="2" y="2" width="20" height="20" rx="4" ry="4"/></svg>';
      checkBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleTaskCompletion(task, occurrenceDate || task.date);
      });
      // Mantener presionado el checkbox 1.5s inicia el cronómetro de la tarea.
      attachCheckboxLongPressTimer(checkBtn, task, occurrenceDate || task.date);
      block.appendChild(checkBtn);
    }
  }

  // Por debajo de 40 min: solo color (sin texto). (El <15 ya salió antes.)
  if (durationMin < 40) {
    // Tareas cortas (15–25 min): extremos izquierdo y derecho totalmente
    // redondeados (forma de píldora) para distinguirlas visualmente.
    if (durationMin <= 25) {
      block.classList.add('cr-block-pill');
    }
    return block;
  }

  // Rango "compacto" (40..59 min): título + checkbox centrados verticalmente.
  // El centrado real se aplica por CSS (.cr-block-compact), escritorio y móvil.
  if (durationMin <= 59) {
    block.classList.add('cr-block-compact');
  }

  // Título (a partir de 40 min).
  const titleEl = document.createElement('div');
  titleEl.className = 'cr-task-title';
  titleEl.textContent = titleText;
  block.appendChild(titleEl);

  // Hora (arriba) y descripción (debajo) en bloques SEPARADOS, igual que las
  // tarjetas del planner: la hora lleva un icono de reloj a la izquierda y la
  // duración entre paréntesis a la derecha ("🕐 14:00-15:00 (1h)"). La hora
  // (.cr-task-time) y la duración (.cr-task-time-dur) se actualizan en vivo
  // durante el arrastre.
  const crHasDesc = descText && descText.trim() !== '';
  const crHasTime = task && task.startTime;
  if (durationMin > 59 && (crHasTime || crHasDesc)) {
    if (crHasTime) {
      const timeBlock = document.createElement('div');
      timeBlock.className = 'cr-task-time-row';

      const clockIcon = document.createElement('span');
      clockIcon.className = 'cr-task-time-clock';
      clockIcon.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>';
      timeBlock.appendChild(clockIcon);

      const timeEl = document.createElement('span');
      timeEl.className = 'cr-task-time';
      timeEl.textContent = formatTaskTimeText(task);
      timeBlock.appendChild(timeEl);

      const dur = formatTaskDuration(task.startTime, task.endTime);
      if (dur) {
        const durEl = document.createElement('span');
        durEl.className = 'cr-task-time-dur';
        durEl.textContent = ` (${dur})`;
        timeBlock.appendChild(durEl);
      }

      block.appendChild(timeBlock);
    }

    if (crHasDesc && durationMin >= 75) {
      const descEl = document.createElement('div');
      descEl.className = 'cr-task-desc';
      descEl.textContent = descText;

      // Calcular cuántas líneas caben en la altura disponible.
      const DESC_LINE_PX = 16;
      const available = heightPx - 24 /*padding*/ - 18 /*título*/ - 16 /*hora*/ - 6 /*gap*/;
      const lines = Math.max(1, Math.floor(available / DESC_LINE_PX));
      descEl.style.webkitLineClamp = String(lines);

      block.appendChild(descEl);
    }
  }

  return block;
}

// Dibuja los bloques de tareas con horario para un día concreto dentro de su
// columna. Incluye:
//   (a) el tramo del propio día (recortado a las 24:00 si cruza medianoche), y
//   (b) la "cola" de las tareas del DÍA ANTERIOR que terminaron después de
//       medianoche (de 00:00 hasta su hora real de fin), marcada con "↪".
// La regla de contenido (sin texto / título / título+descripción) se aplica
// sobre CADA bloque visible según su propia altura.
// Devuelve el número de bloques dibujados.
function renderCronogramaDayBlocks(colEl, date) {
  const dateStr = formatDate(date);
  let count = 0;

  const isTaskCompleted = (task, dStr) => task.recurrence && task.recurrence.enabled
    ? !!(task.completedOccurrences && task.completedOccurrences.includes(dStr))
    : !!task.completed;

  // (a) Tareas del propio día.
  tasks.forEach(task => {
    if (!checkTaskOccurrence(task, date)) return;
    const tag = tags.find(t => t.id === task.tagId) || tags.find(t => t.id === 'default');
    const tagVisible = tag ? tag.visible !== false : true;
    if (!tagVisible) return;
    const range = getTaskTimeRange(task);
    if (!range) return;

    const { startMin, endMin } = range;
    const title = task.title || '(Sin título)';

    const block = buildCronogramaBlock(
      startMin, endMin, title, task.description,
      isTaskCompleted(task, dateStr), tag, task, dateStr
    );
    if (!block) return; // tareas < 25 min no se dibujan
    colEl.appendChild(block);
    count++;
  });

  // (b) Cola de las tareas del día ANTERIOR que cruzaron medianoche.
  const prevDate = addDays(date, -1);
  const prevDateStr = formatDate(prevDate);
  tasks.forEach(task => {
    if (!checkTaskOccurrence(task, prevDate)) return;
    const tag = tags.find(t => t.id === task.tagId) || tags.find(t => t.id === 'default');
    const tagVisible = tag ? tag.visible !== false : true;
    if (!tagVisible) return;
    const range = getTaskTimeRange(task);
    if (!range || !range.crossesMidnight) return;

    // rawEndMin ya es el minuto del día siguiente (p. ej. 01:00 => 60).
    // La cola va de 00:00 a rawEndMin en la columna de hoy.
    const tailEnd = range.rawEndMin;
    if (tailEnd <= 0) return;
    const title = '↪ ' + (task.title || '(Sin título)');

    const block = buildCronogramaBlock(
      0, tailEnd, title, task.description,
      isTaskCompleted(task, prevDateStr), tag, task, prevDateStr, true
    );
    if (!block) return; // colas < 25 min no se dibujan
    colEl.appendChild(block);
    count++;
  });

  return count;
}

// Maneja el clic en un espacio vacío de una columna del horario para crear una
// tarea nueva. `colEl` es la .cr-day-col; `clickMin` es el minuto del día (0..1440)
// donde se hizo clic. Si el hueco disponible entre las 2 tareas visibles que
// rodean el punto de clic es menor a 2 h, se predefinen las horas: inicio =
// fin de la tarea anterior + 1 min, fin = inicio de la tarea siguiente − 1 min.
function handleCronogramaEmptyClick(colEl, clickMin) {
  const dateStr = colEl.dataset.date;
  if (!dateStr) return;
  const date = new Date(dateStr + 'T00:00:00');

  // Reunir los rangos [startMin, endMin) de todas las tareas VISIBLES del día
  // (mismas reglas de visibilidad que renderCronogramaDayBlocks), incluyendo la
  // cola de tareas del día anterior que cruzaron medianoche.
  const ranges = [];
  const addRange = (s, e) => { if (e > s) ranges.push({ start: s, end: e }); };

  tasks.forEach(task => {
    if (!checkTaskOccurrence(task, date)) return;
    const tag = tags.find(t => t.id === task.tagId) || tags.find(t => t.id === 'default');
    if (tag && tag.visible === false) return;
    const range = getTaskTimeRange(task);
    if (!range) return;
    // Solo cuentan las tareas que SÍ se dibujan como bloque (≥ 25 min). Las más
    // cortas no aparecen en el horario, así que su franja es espacio vacío
    // clicable; si las incluyéramos, crearían "zonas muertas" invisibles.
    if ((range.endMin - range.startMin) < 25) return;
    addRange(range.startMin, range.endMin);
  });

  const prevDate = addDays(date, -1);
  tasks.forEach(task => {
    if (!checkTaskOccurrence(task, prevDate)) return;
    const tag = tags.find(t => t.id === task.tagId) || tags.find(t => t.id === 'default');
    if (tag && tag.visible === false) return;
    const range = getTaskTimeRange(task);
    if (!range || !range.crossesMidnight) return;
    if (range.rawEndMin < 25) return; // cola < 25 min: no se dibuja
    addRange(0, range.rawEndMin); // cola: 00:00 → rawEndMin
  });

  // NOTA: no abortamos si el punto cae dentro del rango de una tarea. La decisión
  // de "hay tarea aquí" la toma el handler del grid según el bloque DIBUJADO bajo
  // el cursor; aquí siempre creamos. Esto permite crear tareas en huecos visuales
  // sobre tareas solapadas/ocultas. Los rangos se usan solo para calcular vecinos.

  // Vecinos: tarea anterior (mayor end ≤ clickMin) y siguiente (menor start ≥ clickMin).
  let prevEnd = null, nextStart = null;
  ranges.forEach(r => {
    if (r.end <= clickMin) prevEnd = prevEnd === null ? r.end : Math.max(prevEnd, r.end);
    if (r.start >= clickMin) nextStart = nextStart === null ? r.start : Math.min(nextStart, r.start);
  });

  selectedDayDate = dateStr;

  // Separación (minutos) que se deja entre la tarea nueva y sus vecinas al
  // pegarla. Actualmente 0 (la nueva empieza/termina justo en el borde de la
  // vecina). Si en el futuro se quiere un colchón de 1 min, poner GAP_MIN = 1.
  const GAP_MIN = 0;

  // ── HORA DE INICIO ─────────────────────────────────────────────────────────
  // Si hay una tarea anterior cuyo FIN está a menos de 1 h del punto del clic,
  // la nueva tarea arranca pegada a ella: fin anterior + GAP_MIN.
  // En caso contrario, se redondea el punto del clic al cuarto de hora hacia
  // abajo (15:58 → 15:45, 15:11 → 15:00).
  let startMin;
  if (prevEnd !== null && (clickMin - prevEnd) < 60) {
    startMin = prevEnd + GAP_MIN;
  } else {
    startMin = Math.floor(clickMin / 15) * 15;
  }

  // ── HORA DE FIN ────────────────────────────────────────────────────────────
  // Si existe una tarea siguiente y el hueco (inicio → inicio de la siguiente)
  // es menor o igual a 2 h, la nueva termina justo antes: inicio siguiente − GAP_MIN.
  // Si no, duración por defecto de 1 h.
  let endMin;
  if (nextStart !== null && (nextStart - startMin) <= 120) {
    endMin = nextStart - GAP_MIN;
  } else {
    endMin = startMin + 60;
  }

  // Salvaguarda: el fin nunca antes que el inicio (huecos diminutos).
  if (endMin <= startMin) endMin = startMin + 1;

  prefilledTimes = { start: minutesToHHMM(startMin), end: minutesToHHMM(endMin) };

  openTaskModal();
}

// Convierte minutos del día (0..1439) a "HH:MM".
function minutesToHHMM(min) {
  const m = Math.max(0, Math.min(1439, Math.round(min)));
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

// Engancha UNA sola vez en el grid del horario un listener delegado para crear
// tareas al pinchar en espacios vacíos. Es más robusto que un listener por
// columna: el evento `click` exige que mousedown y mouseup caigan en el MISMO
// elemento; con líneas de hora, etiquetas y sub-píxeles de movimiento eso fallaba
// de forma intermitente. Aquí localizamos la columna por coordenadas, así que el
// clic funciona caiga donde caiga dentro del área de días.
let cronogramaClickDelegationBound = false;
function setupCronogramaClickDelegation() {
  const grid = document.getElementById('cronograma-grid');
  if (!grid || cronogramaClickDelegationBound) return;
  cronogramaClickDelegationBound = true;

  // Usamos `pointerdown` (no `click`): el evento `click` NO se dispara si el
  // mousedown y el mouseup caen en elementos distintos (p. ej. un sub-píxel de
  // movimiento entre press y release sobre un borde o una capa vecina), lo que
  // dejaba "áreas muertas". `pointerdown` se dispara siempre en el punto presionado.
  grid.addEventListener('pointerdown', (e) => {
    // Solo botón principal (izquierdo) del ratón / toque primario.
    if (e.button !== undefined && e.button !== 0) return;
    // Final de un arrastre: ignorar el evento sintético que le sigue.
    if (suppressNextCronogramaClick) return;
    // Nunca interferir con el checkbox de completar.
    if (e.target.closest('.task-check-btn')) return;

    // DECISIÓN POR LO QUE ESTÁ DIBUJADO, NO POR RANGOS DE TIEMPO.
    // Si bajo el cursor hay un bloque de tarea VISIBLE, ese bloque gestiona el
    // clic (abrir/arrastrar). Si NO hay bloque visible (solo la columna), creamos
    // una tarea — aunque por debajo exista una tarea solapada/oculta cuyo horario
    // cubra ese minuto. Así, pinchar donde se ve vacío siempre abre el creador,
    // y desaparecen las "zonas muertas" que producían las tareas solapadas.
    if (e.target.closest('.cr-task-block')) return;

    // Localizar la columna-día bajo el cursor. Las capas decorativas
    // (líneas/etiquetas de hora, línea de "ahora") tienen pointer-events:none,
    // así que e.target ya es la columna; si no, la buscamos por coordenadas.
    let col = e.target.closest('.cr-day-col');
    if (!col) {
      col = document.elementsFromPoint(e.clientX, e.clientY)
        .find(el => el.classList && el.classList.contains('cr-day-col')) || null;
    }
    if (!col) return; // clic en la columna de horas o fuera de los días

    // TÁCTIL: NO abrir en el pointerdown. Al abrir el modal en mitad del gesto,
    // el touchend posterior generaba un "click fantasma" dentro del panel recién
    // abierto. En su lugar, esperamos al pointerup y solo abrimos si el dedo no
    // se movió (un toque, no un scroll del horario).
    if (e.pointerType === 'touch') {
      crEmptyTapPending = {
        x: e.clientX, y: e.clientY,
        date: col.dataset.date,
        min: cronogramaClickToMinutes(col, e.clientY)
      };
      return;
    }

    // RATÓN: abrir de inmediato en el pointerdown (evita áreas muertas en escritorio).
    handleCronogramaEmptyClick(col, cronogramaClickToMinutes(col, e.clientY));
  });

  // Resolución del toque táctil: si el dedo apenas se movió desde el pointerdown
  // (fue un toque, no un scroll/arrastre), abrir el creador AL SOLTAR. Abrirlo
  // aquí (y no en pointerdown) evita el click fantasma dentro del panel.
  grid.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return;
    const pend = crEmptyTapPending;
    crEmptyTapPending = null;
    if (!pend) return;
    if (suppressNextCronogramaClick) return;
    const dx = Math.abs(e.clientX - pend.x);
    const dy = Math.abs(e.clientY - pend.y);
    if (dx > 10 || dy > 10) return; // hubo desplazamiento → fue scroll, no un toque
    const col = document.querySelector(`.cr-day-col[data-date="${pend.date}"]`);
    if (!col) return;
    // Tragar el click sintético que el navegador dispara tras el touchend: cae
    // sobre el panel recién abierto (p. ej. el selector de etiqueta) y abría
    // controles sin querer. Lo capturamos a nivel de documento y lo anulamos.
    swallowNextGhostClick();
    handleCronogramaEmptyClick(col, pend.min);
  });

  // Si el toque se cancela (scroll, gesto del sistema), descartar el pendiente.
  grid.addEventListener('pointercancel', () => { crEmptyTapPending = null; });
}

// Anula el PRÓXIMO click que dispare el navegador (el "click fantasma" sintético
// que sigue a un touchend). Se engancha en fase de CAPTURA a nivel de documento,
// así intercepta el click antes de que llegue a cualquier control del panel
// recién abierto. Se autodesengancha tras consumir un click o a los 700 ms.
function swallowNextGhostClick() {
  const handler = (ev) => {
    ev.stopPropagation();
    ev.preventDefault();
    cleanup();
  };
  const cleanup = () => {
    document.removeEventListener('click', handler, true);
    clearTimeout(timer);
  };
  const timer = setTimeout(cleanup, 700);
  document.addEventListener('click', handler, true);
}

// Toque táctil pendiente en un espacio vacío del horario (entre pointerdown y
// pointerup), para abrir el creador al soltar y evitar el click fantasma.
let crEmptyTapPending = null;

// Convierte la coordenada Y del puntero (px de viewport) al MINUTO lógico dentro
// de la columna (0..1440). Los bloques se posicionan con `top` en px LÓGICOS
// (1px = 1min), pero getBoundingClientRect() devuelve px VISUALES, que difieren
// de los lógicos cuando el navegador tiene zoom ≠ 100% (p. ej. 125%/150%). Sin
// esta corrección, pinchar a las 7:15 creaba la tarea a una hora desfasada.
// Escalamos por la razón altura-lógica / altura-visual de la propia columna.
function cronogramaClickToMinutes(col, clientY) {
  const rect = col.getBoundingClientRect();
  const visualOffset = clientY - rect.top;          // px visuales desde el tope
  const logicalHeight = col.offsetHeight || rect.height; // px lógicos (= minutos)
  const scale = rect.height ? (logicalHeight / rect.height) : 1;
  return visualOffset * scale;
}

// Suelta una tarea (arrastrada con HTML5 desde el maletín o el planner) sobre una
// columna del horario. La hora de inicio se ajusta al múltiplo de 30 min más
// cercano (00:00, 00:30, …). La duración es la que ya tenga la tarea (si tiene
// inicio+fin definidos) o, por defecto, 1 hora. `isCopy` crea un clon en lugar
// de mover. Funciona tanto para tareas del maletín (sin fecha) como del planner.
function dropTaskOnCronograma(taskId, colEl, clientY, isCopy) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const dateStr = colEl.dataset.date;
  if (!dateStr) return;

  // Minuto del día ajustado al intervalo de 15 min más cercano.
  const rawMin = cronogramaClickToMinutes(colEl, clientY);
  let startMin = Math.round(rawMin / 15) * 15;
  startMin = Math.max(0, Math.min(1440 - 15, startMin));

  // Duración: la que ya tenga la tarea (por horas inicio+fin, o por la duración
  // escrita en su descripción), o 1 h por defecto si no tiene ninguna.
  let durationMin = getTaskDurationMinutes(task);
  if (!durationMin || durationMin <= 0) durationMin = 60;

  const toHHMM = (min) => {
    const m = ((min % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  const startTime = toHHMM(startMin);
  const endTime = toHHMM(startMin + durationMin);

  pushToUndoStack();

  if (isCopy) {
    // COPIAR: clon independiente colocado en el horario.
    const clon = {
      ...task,
      id: 'task-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      date: dateStr,
      startTime,
      endTime
    };
    if (clon.recurrence && clon.recurrence.enabled) clon.recurrence = null;
    tasks.push(clon);
  } else {
    // MOVER: la tarea del maletín pasa al día/hora soltados.
    task.date = dateStr;
    task.startTime = startTime;
    task.endTime = endTime;
  }

  // Limpiar el estado del arrastre HTML5 y ocultar la marca global.
  draggedTaskId = null;
  draggedTaskSourceDate = null;
  document.body.classList.remove('dragging-active');

  renderCronograma();
  renderWeeklyCalendar();
  renderBriefcaseTasks();
  saveTasksToStorage();
}

function renderCronograma() {
  // Si hay un arrastre en curso, NO reconstruir: borraría el bloque que el
  // usuario tiene agarrado y provocaría saltos. Se re-renderiza al soltar.
  if (crDrag) return;
  const headersEl = document.getElementById('cronograma-headers');
  const grid = document.getElementById('cronograma-grid');
  if (!headersEl || !grid) return;

  headersEl.innerHTML = '';
  grid.innerHTML = '';

  const HOUR_HEIGHT = 60; // px por hora (= 1px por minuto). Coincide con el CSS.
  const today = new Date();
  const todayStr = formatDate(today);

  // En móvil mostramos un día centrado con carrusel deslizable (días vecinos
  // precargados que se revelan al deslizar); en escritorio, los 7 días de la
  // semana visible. El día móvil central lo controla cronogramaMobileDate.
  const mobile = isMobile();

  // 1) Esquina vacía sobre la columna de horas + cabecera(s) de día.
  const corner = document.createElement('div');
  corner.className = 'cr-corner';
  headersEl.appendChild(corner);

  // 2) Etiquetas de hora (00:00 .. 23:00) y líneas horizontales por hora.
  //    Quedan FIJAS como fondo (no se deslizan con el carrusel).
  for (let h = 0; h < 24; h++) {
    const label = document.createElement('span');
    label.className = 'cr-hour-label' + (h === 0 ? ' cr-hour-label-first' : '');
    label.style.top = (h * HOUR_HEIGHT) + 'px';
    label.textContent = String(h).padStart(2, '0') + ':00';
    grid.appendChild(label);

    const line = document.createElement('div');
    line.className = 'cr-hour-line';
    line.style.top = (h * HOUR_HEIGHT) + 'px';
    grid.appendChild(line);
  }
  const lastLine = document.createElement('div');
  lastLine.className = 'cr-hour-line cr-hour-line-last';
  lastLine.style.top = (24 * HOUR_HEIGHT) + 'px';
  grid.appendChild(lastLine);

  const endLabel = document.createElement('span');
  endLabel.className = 'cr-hour-label cr-hour-label-last';
  endLabel.style.top = (24 * HOUR_HEIGHT) + 'px';
  endLabel.textContent = '00:00';
  grid.appendChild(endLabel);

  if (mobile) {
    // ── MÓVIL: carrusel de TARJETAS-DÍA completas con snap nativo ───────────
    // Cada día es una tarjeta autónoma que incluye su PROPIO header, su columna
    // de horas, sus líneas y sus tareas; el carrusel ocupa TODO el ancho. Así,
    // al deslizar, se mueve todo el cuerpo del día como una unidad (idéntico al
    // planner). Solo quedan fijos el header de la app y la barra de navegación.
    const centerDate = cronogramaMobileDate ? new Date(cronogramaMobileDate) : new Date(today);

    // En móvil NO usamos cabecera global ni columna de horas de fondo: cada
    // tarjeta-día las lleva embebidas. Vaciamos el encabezado global (que en
    // móvil queda oculto por CSS) y limpiamos las horas/líneas globales que el
    // bloque común añadió al grid (solo aplican al escritorio).
    headersEl.innerHTML = '';
    grid.querySelectorAll('.cr-hour-label, .cr-hour-line').forEach(el => el.remove());

    // Pista deslizable que contiene los días precargados (ancho completo).
    const track = document.createElement('div');
    track.className = 'cr-mobile-track';
    track.id = 'cr-mobile-track';
    grid.appendChild(track);

    for (let i = -CR_MOBILE_PRELOAD; i <= CR_MOBILE_PRELOAD; i++) {
      track.appendChild(buildCronogramaMobileDayCol(addDays(centerDate, i), todayStr));
    }

    applyDayIsolation();

    // El track es nuevo en cada render: permitir re-enganchar su listener.
    crTrackListenerBound = false;

    // Posicionar el carrusel en el día central y enganchar el listener de snap.
    // Usamos doble requestAnimationFrame para asegurar que el navegador haya
    // calculado los layouts y offsetLeft de las columnas antes de scrollear.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollCronogramaTrackToDate(formatDate(centerDate), false);
        setupCronogramaTrackScroll();
        // Sincronizar el scroll vertical entre tarjetas y restaurar la posición
        // vertical compartida (para que al re-renderizar no salte a 00:00).
        setupCrMobileVScrollSync();
        applyCrMobileVScroll();
      });
    });

    // Línea de hora actual: se coloca dentro de la tarjeta de HOY (si está).
    updateNowLineForMobile(todayStr);
  } else {
    // ── ESCRITORIO: 7 columnas-día en el grid (sin carrusel) ────────────────
    const dayDates = [];
    for (let i = 0; i < 7; i++) dayDates.push(addDays(currentWeekStart, i));

    dayDates.forEach((date, idx) => {
      const hdr = buildCronogramaHeader(date, CRONOGRAMA_DAY_NAMES[idx], formatDate(date) === todayStr);
      headersEl.appendChild(hdr);
      // Visibilidad de iconos según el estado del día (basurero con tareas,
      // estadísticas con duración). Igual que el planner y el horario móvil.
      updateDayHeaderButtonsVisibility(hdr, formatDate(date));
    });

    dayDates.forEach((date, idx) => {
      const colEl = document.createElement('div');
      colEl.className = 'cr-day-col' + (formatDate(date) === todayStr ? ' today' : '');
      colEl.dataset.col = String(idx + 1);
      colEl.dataset.date = formatDate(date);
      renderCronogramaDayBlocks(colEl, date);
      // El clic en espacio vacío se gestiona por DELEGACIÓN en el grid
      // (setupCronogramaClickDelegation), más robusto que un listener por columna.
      colEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openDayContextMenu(e.clientX, e.clientY, idx + 1);
      });
      // Arrastre HTML5 desde el maletín (o desde el planner) → soltar en el horario.
      colEl.addEventListener('dragover', (e) => {
        if (!draggedTaskId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = (e.ctrlKey || e.metaKey) ? 'copy' : 'move';
        colEl.classList.add('cr-drag-over');
      });
      colEl.addEventListener('dragleave', (e) => {
        if (colEl.contains(e.relatedTarget)) return;
        colEl.classList.remove('cr-drag-over');
      });
      colEl.addEventListener('drop', (e) => {
        e.preventDefault();
        colEl.classList.remove('cr-drag-over');
        const id = (e.dataTransfer && e.dataTransfer.getData('text/plain')) || draggedTaskId;
        if (!id) return;
        dropTaskOnCronograma(id, colEl, e.clientY, e.ctrlKey || e.metaKey);
      });
      grid.appendChild(colEl);
    });

    applyDayIsolation();

    const todayVisible = dayDates.some(d => formatDate(d) === todayStr);
    if (todayVisible) {
      const nowLine = document.createElement('div');
      nowLine.className = 'cr-now-line';
      nowLine.id = 'cr-now-line';
      grid.appendChild(nowLine);
      updateNowLinePosition();
      startNowLineClock();
    } else {
      stopNowLineClock();
    }
  }
}

// Construye una TARJETA-DÍA completa para el carrusel móvil del horario.
// Estructura (el header queda FIJO; el cuerpo scrollea verticalmente):
//   .cr-mobile-day                       ← tarjeta a ancho completo (snap)
//     .day-header                        ← encabezado FIJO (con sus iconos)
//     .cr-mobile-day-body                ← cuerpo desplazable verticalmente
//       .cr-mobile-day-canvas            ← lienzo de 24h (1px=1min)
//         .cr-mobile-hours               ← columna de horas + líneas (propias)
//         .cr-day-col (.cr-mobile-grid)  ← zona de tareas (bloques absolutos)
// La zona de tareas conserva la clase .cr-day-col para que el arrastre, la
// delegación de clics y el posicionamiento de bloques (1px=1min) funcionen igual.
function buildCronogramaMobileDayCol(date, todayStr) {
  const isToday = formatDate(date) === todayStr;

  const card = document.createElement('div');
  card.className = 'cr-mobile-day' + (isToday ? ' today' : '');
  card.dataset.date = formatDate(date);

  // 1) Header del día FIJO (mismo componente → mismos iconos). Fuera del cuerpo
  //    desplazable, así no se mueve con el scroll vertical de las horas.
  const dayNameUpper = CRONOGRAMA_DAY_NAMES[getAppDayIndex(date) - 1];
  card.appendChild(buildCronogramaHeader(date, dayNameUpper, isToday));

  // 2) Cuerpo desplazable verticalmente.
  const body = document.createElement('div');
  body.className = 'cr-mobile-day-body';

  // 2.0) Lienzo interno con la altura real de 24h (sobre él van horas y tareas).
  const canvas = document.createElement('div');
  canvas.className = 'cr-mobile-day-canvas';

  // 2a) Columna de horas propia de este día (etiquetas + líneas de fondo).
  canvas.appendChild(buildCronogramaMobileHours());

  // 2b) Zona de tareas. Conserva .cr-day-col para reusar toda la lógica.
  const colEl = document.createElement('div');
  colEl.className = 'cr-day-col cr-mobile-grid' + (isToday ? ' today' : '');
  colEl.dataset.date = formatDate(date);
  renderCronogramaDayBlocks(colEl, date);
  canvas.appendChild(colEl);

  body.appendChild(canvas);
  card.appendChild(body);

  // Visibilidad de los iconos del header según el estado del día (basurero solo
  // con tareas, estadísticas solo con duración). Igual que el planner.
  updateDayHeaderButtonsVisibility(card, formatDate(date));

  return card;
}

// Genera la columna de horas (etiquetas 00:00..00:00 + líneas horizontales) que
// va embebida en cada tarjeta-día del horario móvil. 1px = 1min, HOUR_HEIGHT=60.
function buildCronogramaMobileHours() {
  const HOUR_HEIGHT = 60;
  const hours = document.createElement('div');
  hours.className = 'cr-mobile-hours';
  for (let h = 0; h < 24; h++) {
    const label = document.createElement('span');
    label.className = 'cr-hour-label' + (h === 0 ? ' cr-hour-label-first' : '');
    label.style.top = (h * HOUR_HEIGHT) + 'px';
    label.textContent = String(h).padStart(2, '0') + ':00';
    hours.appendChild(label);

    const line = document.createElement('div');
    line.className = 'cr-hour-line';
    line.style.top = (h * HOUR_HEIGHT) + 'px';
    hours.appendChild(line);
  }
  const lastLine = document.createElement('div');
  lastLine.className = 'cr-hour-line cr-hour-line-last';
  lastLine.style.top = (24 * HOUR_HEIGHT) + 'px';
  hours.appendChild(lastLine);

  const endLabel = document.createElement('span');
  endLabel.className = 'cr-hour-label cr-hour-label-last';
  endLabel.style.top = (24 * HOUR_HEIGHT) + 'px';
  endLabel.textContent = '00:00';
  hours.appendChild(endLabel);

  return hours;
}

// Coloca la línea de hora actual en el horario móvil. Ahora se monta DENTRO de
// la tarjeta de HOY (en su zona de tareas), de modo que se desliza junto con el
// día como todo lo demás. Si la tarjeta de hoy no está precargada, no se monta.
function updateNowLineForMobile(todayStr) {
  const ts = todayStr || formatDate(new Date());
  const track = document.getElementById('cr-mobile-track');
  // Quitar cualquier línea previa.
  const prev = document.getElementById('cr-now-line');
  if (prev) prev.remove();
  if (!track) { stopNowLineClock(); return; }

  // Buscar la zona de tareas de la tarjeta de HOY.
  const todayCard = track.querySelector(`.cr-mobile-day[data-date="${ts}"]`);
  const host = todayCard ? todayCard.querySelector('.cr-mobile-grid') : null;
  if (!host) { stopNowLineClock(); return; }

  const nowLine = document.createElement('div');
  nowLine.className = 'cr-now-line cr-now-line-mobile';
  nowLine.id = 'cr-now-line';
  host.appendChild(nowLine);
  updateNowLinePosition();
  startNowLineClock();
}

// La línea de "ahora" vive dentro de la tarjeta de hoy, así que ya solo se ve
// cuando hoy está en pantalla. Se conserva como no-op por compatibilidad con las
// llamadas existentes (al deslizar/cambiar de día).
function syncNowLineVisibilityMobile() {}

// Desplaza el carrusel para centrar (alinear al inicio) la columna del día dado.
function scrollCronogramaTrackToDate(dateStr, smooth) {
  const track = document.getElementById('cr-mobile-track');
  if (!track) return;
  const col = track.querySelector(`.cr-mobile-day[data-date="${dateStr}"]`);
  if (!col) return;
  track.scrollTo({ left: col.offsetLeft, behavior: smooth ? 'smooth' : 'auto' });
}

// Cambia el día central del horario móvil deslizando el carrusel a esa columna.
// Si la columna no está precargada, re-renderiza centrando en ella.
function shiftCronogramaMobileDay(delta) {
  const base = cronogramaMobileDate ? new Date(cronogramaMobileDate) : new Date();
  goToCronogramaMobileDate(addDays(base, delta));
}

// Navega a una fecha concreta en el carrusel móvil (scroll suave si ya está
// precargada; si no, re-renderiza centrada en ella).
function goToCronogramaMobileDate(date) {
  const dateStr = formatDate(date);
  const track = document.getElementById('cr-mobile-track');
  const col = track && track.querySelector(`.cr-mobile-day[data-date="${dateStr}"]`);
  if (col) {
    track.scrollTo({ left: col.offsetLeft, behavior: 'smooth' });
    // El listener de scroll actualizará cabecera, estado y etiqueta al asentarse.
  } else {
    cronogramaMobileDate = new Date(date);
    currentWeekStart = getMondayOf(cronogramaMobileDate);
    renderCronograma();
    updateCronogramaMobileLabel(cronogramaMobileDate);
  }
}

// Actualiza la etiqueta de fecha de la barra superior (móvil).
function updateCronogramaMobileLabel(date) {
  const label = document.getElementById('week-range-label');
  if (label) label.textContent = formatSingleDate(date);
}

// ─── Carrusel del horario MÓVIL: scroll nativo con snap ──────────────────────
// El día central se determina por la posición de scroll del carrusel. Al
// asentarse, se actualiza la cabecera, el estado y la etiqueta, y se expande el
// carrusel si el usuario se acerca a un borde (carrusel "infinito").
function setupCronogramaTrackScroll() {
  const track = document.getElementById('cr-mobile-track');
  if (!track || crTrackListenerBound) return;
  // El listener se engancha una vez al track actual; al re-renderizar se crea un
  // track nuevo, así que reseteamos la bandera en renderCronograma (id estable).
  crTrackListenerBound = true;

  track.addEventListener('scroll', (e) => {
    // Este listener burbujea tanto el scroll HORIZONTAL del track como el
    // VERTICAL de los cuerpos de tarjeta. Solo nos interesa el horizontal (cambio
    // de día); el vertical lo gestiona setupCrMobileVScrollSync.
    if (e.target !== track) return;
    if (crTrackScrollTimer) clearTimeout(crTrackScrollTimer);
    // Mantener todas las tarjetas a la misma altura (hora) al deslizar de día.
    applyCrMobileVScroll();
    // Mover la etiqueta de la barra superior en vivo mientras se desliza.
    const centered = getCenteredCronogramaCol(track);
    if (centered && centered.dataset.date) {
      const d = new Date(centered.dataset.date + 'T00:00:00');
      cronogramaMobileDate = d;
      updateCronogramaMobileLabel(d);
      // La línea de "ahora" solo se ve cuando el día centrado es hoy.
      syncNowLineVisibilityMobile();
    }
    // Al detenerse el scroll, expandir bordes si hace falta.
    crTrackScrollTimer = setTimeout(() => {
      currentWeekStart = getMondayOf(cronogramaMobileDate || new Date());
      expandCronogramaTrackIfNeeded(track);
      // Reaplicar la posición vertical a las tarjetas recién añadidas.
      applyCrMobileVScroll();
    }, 120);
  }, { passive: true });
}

// Devuelve la columna-día cuyo borde izquierdo está más cerca del scroll actual.
function getCenteredCronogramaCol(track) {
  const cols = track.querySelectorAll('.cr-mobile-day');
  let best = null, bestDist = Infinity;
  cols.forEach(col => {
    const dist = Math.abs(col.offsetLeft - track.scrollLeft);
    if (dist < bestDist) { bestDist = dist; best = col; }
  });
  return best;
}

// Añade más días a los lados cuando el usuario se acerca a un borde del carrusel,
// preservando la posición de scroll (efecto "infinito").
function expandCronogramaTrackIfNeeded(track) {
  const cols = [...track.querySelectorAll('.cr-mobile-day')];
  if (cols.length === 0) return;
  const todayStr = formatDate(new Date());

  // Cerca del borde izquierdo → añadir días antes.
  if (track.scrollLeft < track.clientWidth * 1.5) {
    const first = cols[0];
    const firstDate = new Date(first.dataset.date + 'T00:00:00');
    const frag = document.createDocumentFragment();
    for (let i = CR_MOBILE_PRELOAD; i >= 1; i--) {
      frag.appendChild(buildCronogramaMobileDayCol(addDays(firstDate, -i), todayStr));
    }
    const prevLeft = first.offsetLeft;
    track.insertBefore(frag, first);
    // Mantener la posición visual tras insertar al inicio.
    track.scrollLeft += (first.offsetLeft - prevLeft);
    applyDayIsolation();
  }

  // Cerca del borde derecho → añadir días después.
  if (track.scrollLeft + track.clientWidth > track.scrollWidth - track.clientWidth * 1.5) {
    const last = cols[cols.length - 1];
    const lastDate = new Date(last.dataset.date + 'T00:00:00');
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= CR_MOBILE_PRELOAD; i++) {
      frag.appendChild(buildCronogramaMobileDayCol(addDays(lastDate, i), todayStr));
    }
    track.appendChild(frag);
    applyDayIsolation();
  }
}

// Coloca la línea de hora actual según la hora del día (1px = 1min).
function updateNowLinePosition() {
  const nowLine = document.getElementById('cr-now-line');
  if (!nowLine) return;
  const now = new Date();
  const minutesIntoDay = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  nowLine.style.top = minutesIntoDay + 'px';
}

// Posiciona el scroll del horario para que la línea de hora actual quede justo
// alineada con el borde inferior de las cabeceras (cabeceras sticky en top:0).
// Como la rejilla empieza debajo de las cabeceras y la línea está a
// `minutosDelDia` px dentro de la rejilla, scrollTop = minutosDelDia deja la
// línea pegada bajo las cabeceras.
function scrollHorarioToNowLine() {
  const now = new Date();
  const minutesIntoDay = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  // MÓVIL: el scroll vertical vive dentro del cuerpo de cada tarjeta-día. Fijamos
  // la posición compartida y la aplicamos a todas las tarjetas (sincronizadas).
  if (isMobile()) {
    const body = document.querySelector('.cr-mobile-day-body');
    if (body) {
      const maxScroll = body.scrollHeight - body.clientHeight;
      crMobileVScroll = Math.min(Math.max(0, minutesIntoDay), maxScroll);
      applyCrMobileVScroll();
    }
    return;
  }

  // ESCRITORIO: scroll vertical en el contenedor común.
  const scroll = document.querySelector('.cronograma-scroll');
  const nowLine = document.getElementById('cr-now-line');
  if (!scroll || !nowLine) return;
  const maxScroll = scroll.scrollHeight - scroll.clientHeight;
  scroll.scrollTop = Math.min(Math.max(0, minutesIntoDay), maxScroll);
}

// Posición vertical compartida del horario móvil (en px desde 00:00). Mantiene
// todas las tarjetas-día mostrando la misma hora al deslizar entre días.
let crMobileVScroll = 0;
let crMobileVScrollSyncing = false;

// Aplica la posición vertical compartida a todos los cuerpos de tarjeta.
function applyCrMobileVScroll() {
  const bodies = document.querySelectorAll('.cr-mobile-day-body');
  crMobileVScrollSyncing = true;
  bodies.forEach(b => { if (b.scrollTop !== crMobileVScroll) b.scrollTop = crMobileVScroll; });
  // Liberar el guard tras el frame para no perder scrolls reales del usuario.
  requestAnimationFrame(() => { crMobileVScrollSyncing = false; });
}

// Engancha la sincronización del scroll vertical entre tarjetas: cuando el
// usuario scrollea una, las demás siguen y se recuerda la posición.
function setupCrMobileVScrollSync() {
  const track = document.getElementById('cr-mobile-track');
  if (!track) return;
  track.addEventListener('scroll', (e) => {
    const body = e.target.closest ? e.target.closest('.cr-mobile-day-body') : null;
    if (!body || crMobileVScrollSyncing) return;
    crMobileVScroll = body.scrollTop;
    const bodies = track.querySelectorAll('.cr-mobile-day-body');
    crMobileVScrollSyncing = true;
    bodies.forEach(b => { if (b !== body && b.scrollTop !== crMobileVScroll) b.scrollTop = crMobileVScroll; });
    requestAnimationFrame(() => { crMobileVScrollSyncing = false; });
  }, { capture: true, passive: true });
}

// Mantiene la línea avanzando: la reubica cada 30s mientras esté en pantalla.
let nowLineTimer = null;
function startNowLineClock() {
  stopNowLineClock();
  nowLineTimer = setInterval(updateNowLinePosition, 30000);
}
function stopNowLineClock() {
  if (nowLineTimer) { clearInterval(nowLineTimer); nowLineTimer = null; }
}

// ─────────────────────────────────────────────────────────────────────────
// ARRASTRAR BLOQUES EN EL CRONOGRAMA
// Permite mover una tarea a otra hora (arriba/abajo, con snap de 30 min,
// manteniendo su duración) y/o a otro día (otra columna). El arrastre es en
// vivo: el bloque sigue al cursor. Al soltar se reescribe el rango horario al
// inicio de la descripción y, si cambió de columna, se actualiza task.date.
// ─────────────────────────────────────────────────────────────────────────

const CR_HOUR_HEIGHT = 60;   // px por hora (= 1px por minuto)
const CR_SNAP_MIN = 15;      // granularidad del arrastre vertical

// Reescribe el rango "HH:MM - HH:MM" al inicio de la descripción por uno nuevo,
// preservando el resto del texto exactamente como estaba. Si por algún motivo
// no había rango (no debería ocurrir aquí), antepone el nuevo rango.
function rewriteTimeRangeInDescription(description, newStartMin, newEndMin) {
  const fmt = (mins) => {
    const m = ((mins % 1440) + 1440) % 1440; // normalizar a 0..1439
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  const newRange = `${fmt(newStartMin)} - ${fmt(newEndMin)}`;
  const desc = description || '';
  const re = /^(\s*)(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})/;
  if (re.test(desc)) {
    return desc.replace(re, (full, lead) => lead + newRange);
  }
  return newRange + (desc ? ' ' + desc : '');
}

// Estado del arrastre en curso.
let crDrag = null;

// Inicia el arrastre de un bloque del cronograma.
//   block: el elemento .cr-task-block
//   task:  la tarea
//   e:     el evento pointerdown
function startCronogramaDrag(block, task, e) {
  // Solo botón principal y no sobre el checkbox.
  if (e.button !== 0) return;
  if (e.target.closest('.task-check-btn')) return;

  const grid = document.getElementById('cronograma-grid');
  if (!grid) return;

  const range = getTaskTimeRange(task);
  if (!range) return;
  const durationMin = (range.crossesMidnight ? range.rawEndMin + 1440 : range.rawEndMin) - range.startMin;

  const cols = [...grid.querySelectorAll('.cr-day-col')];

  // Desfase del puntero dentro del bloque y ancho actual: se usan para que, al
  // "flotar" el bloque (position:fixed) y poder llevarlo sobre el header hasta la
  // papelera, siga al cursor sin saltos y conserve su tamaño.
  const blockRect = block.getBoundingClientRect();
  const grabOffsetX = e.clientX - blockRect.left;
  const grabOffsetY = e.clientY - blockRect.top;

  crDrag = {
    block,
    task,
    durationMin,
    grid,
    cols,
    // Y del puntero al agarrar y top original del bloque (en minutos/px). El
    // movimiento se calcula como un DELTA puro desde aquí, evitando saltos.
    grabClientY: e.clientY,
    grabOffsetX,
    grabOffsetY,
    blockWidth: blockRect.width,
    floating: false,             // ¿el bloque está flotando sobre el header?
    startColEl: block.parentElement,
    targetColEl: block.parentElement,
    originalStartMin: range.startMin,
    newStartMin: range.startMin,
    sourceDate: task.date,        // día de origen (para copiar/mover)
    copy: !!(e.ctrlKey || e.metaKey), // Ctrl/Cmd → copiar en vez de mover
    overTrash: false,             // ¿el puntero está sobre la papelera?
    overBriefcase: false,         // ¿el puntero está sobre el archivado (maletín)?
    originColEl: block.parentElement, // columna original (para el fantasma de copia)
    originTopPx: range.startMin,  // posición vertical original (px = min)
    ghost: null,                  // clon estático que se ve al copiar (Ctrl)
    moved: false,
    pointerId: e.pointerId
  };

  block.classList.add('cr-dragging');
  block.style.pointerEvents = 'none'; // que no intercepte el hit-test de columnas
  try { block.setPointerCapture(e.pointerId); } catch (_) {}

  // Si ya se arranca con Ctrl, mostrar el fantasma del original desde el inicio.
  syncCronogramaCopyGhost();

  // Mostrar la papelera (mismo botón #trash-btn que el planner): aparece al poner
  // body.dragging-active y se oculta al soltar/cancelar.
  document.body.classList.add('dragging-active');

  window.addEventListener('pointermove', onCronogramaDragMove);
  window.addEventListener('pointerup', onCronogramaDragEnd);
  window.addEventListener('keydown', onCronogramaDragKey);
  window.addEventListener('keyup', onCronogramaDragKey);
  e.preventDefault();
}

// Muestra u oculta el "fantasma" del original mientras se copia (Ctrl/Cmd).
// Al copiar, el bloque que se arrastra es la COPIA; el original debe seguir
// viéndose fijo en su sitio. Cuando no se copia (mover), no hay fantasma.
function syncCronogramaCopyGhost() {
  if (!crDrag) return;

  // Modo copia activo y aún no hay fantasma → crearlo en la posición original.
  if (crDrag.copy && !crDrag.ghost && crDrag.originColEl) {
    const ghost = crDrag.block.cloneNode(true);
    ghost.classList.remove('cr-dragging', 'cr-floating');
    ghost.classList.add('cr-copy-ghost');
    ghost.style.pointerEvents = 'none';
    // El clon debe quedar en posicionamiento normal (absoluto en su columna),
    // aunque el bloque arrastrado esté flotando (fixed) en ese momento.
    ghost.style.position = '';
    ghost.style.left = '';
    ghost.style.right = '';
    ghost.style.width = '';
    ghost.style.zIndex = '';
    ghost.style.top = crDrag.originTopPx + 'px';
    const h = Math.min(crDrag.originTopPx + crDrag.durationMin, 1440) - crDrag.originTopPx;
    ghost.style.height = Math.max(h, 16) + 'px';
    // Restaurar el rango horario original en el texto del fantasma (el bloque
    // arrastrado puede mostrar el rango nuevo en vivo).
    const tEl = ghost.querySelector('.cr-task-time');
    if (tEl) {
      const r = getTaskTimeRange(crDrag.task);
      if (r) tEl.textContent = `${r.startStr} - ${r.endStr}`;
    }
    crDrag.originColEl.appendChild(ghost);
    crDrag.ghost = ghost;
  }

  // Modo mover y hay fantasma → quitarlo.
  if (!crDrag.copy && crDrag.ghost) {
    crDrag.ghost.remove();
    crDrag.ghost = null;
  }
}

// Quita el fantasma de copia si existe (al soltar/cancelar).
function removeCronogramaCopyGhost() {
  if (crDrag && crDrag.ghost) {
    crDrag.ghost.remove();
    crDrag.ghost = null;
  }
}

// Escape mientras se arrastra: cancelar la operación (sin guardar ni mover).
// Ctrl/Cmd (pulsar o soltar) alterna el modo copia y su fantasma sin necesidad
// de mover el ratón.
function onCronogramaDragKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    cancelCronogramaDrag();
    return;
  }
  if (crDrag && (e.key === 'Control' || e.key === 'Meta')) {
    crDrag.copy = !!(e.ctrlKey || e.metaKey);
    syncCronogramaCopyGhost();
  }
}

// Cancela el arrastre en curso: quita los listeners, descarta el estado y
// re-renderiza para devolver el bloque a su posición original (los datos no se
// tocaron, así que el render restaura todo).
function cancelCronogramaDrag() {
  if (!crDrag) return;
  const drag = crDrag;
  crDrag = null;

  window.removeEventListener('pointermove', onCronogramaDragMove);
  window.removeEventListener('pointerup', onCronogramaDragEnd);
  window.removeEventListener('keydown', onCronogramaDragKey);
  window.removeEventListener('keyup', onCronogramaDragKey);
  stopCronogramaEdgeScroll();
  clearCronogramaHorizontalEdge();

  if (drag.ghost) drag.ghost.remove();
  if (drag.floating && drag.block.parentElement === document.body) {
    drag.block.remove();
  }
  drag.block.classList.remove('cr-dragging', 'cr-floating');
  drag.block.style.pointerEvents = '';
  try { drag.block.releasePointerCapture(drag.pointerId); } catch (_) {}
  clearCronogramaDragOver();

  // Ocultar/limpiar los destinos del header (arrastre cancelado).
  document.body.classList.remove('dragging-active');
  clearCronogramaHeaderTargets();

  // Evitar que un click/pointerup posterior abra el modal de edición.
  suppressNextCronogramaClick = true;
  setTimeout(() => { suppressNextCronogramaClick = false; }, 0);

  renderCronograma(); // restaura posiciones originales desde los datos
}

function onCronogramaDragMove(e) {
  if (!crDrag) return;
  // Actualizar el modo copia en vivo según Ctrl/Cmd (el usuario puede pulsarlo o
  // soltarlo a mitad del arrastre).
  crDrag.copy = !!(e.ctrlKey || e.metaKey);
  syncCronogramaCopyGhost();
  // Recordar siempre la última posición del puntero (la usan el auto-scroll y el
  // re-vinculado tras cambiar de semana/día).
  crEdgeScroll.lastX = e.clientX;
  crEdgeScroll.lastY = e.clientY;
  applyCronogramaDragMove(e.clientX, e.clientY);
  // Auto-scroll de borde también con ratón: si el cursor se acerca al borde
  // superior/inferior del horario, desplazar la vista automáticamente (mismo
  // mecanismo que el arrastre táctil). Pero si el bloque está FLOTANDO sobre el
  // header/papelera (fuera del horario), no scrollear.
  if (crDrag.floating) {
    stopCronogramaEdgeScroll();
  } else {
    crEdgeScroll.lastX = e.clientX;
    crEdgeScroll.lastY = e.clientY;
    updateCronogramaEdgeScroll(e.clientY);
  }
}

// Hace que el bloque arrastrado "flote" (position:fixed sobre el body) para que
// pueda salir del recorte del scroll del horario y llegar hasta la papelera del
// header. Se mueve al body para que ningún ancestro con overflow lo recorte.
function enterCronogramaFloat() {
  if (!crDrag || crDrag.floating) return;
  crDrag.floating = true;
  const b = crDrag.block;
  b.classList.add('cr-floating');
  b.style.position = 'fixed';
  b.style.width = crDrag.blockWidth + 'px';
  b.style.right = 'auto';
  b.style.zIndex = '100002'; // por encima del header y la papelera
  document.body.appendChild(b);
}

// Devuelve el bloque flotante al horario: lo re-inserta en la columna destino y
// restaura el posicionamiento absoluto normal (top en minutos lo fija el flujo
// normal de applyCronogramaDragMove justo después).
function exitCronogramaFloat() {
  if (!crDrag || !crDrag.floating) return;
  crDrag.floating = false;
  const b = crDrag.block;
  b.classList.remove('cr-floating');
  b.style.position = '';
  b.style.left = '';
  b.style.right = '';
  b.style.width = '';
  b.style.zIndex = '';
  // Reinsertar en la columna destino actual (o la de origen) para que el
  // posicionamiento por `top` (relativo a la columna) vuelva a ser válido.
  const col = crDrag.targetColEl || crDrag.startColEl;
  if (col && b.parentElement !== col) col.appendChild(b);
}

// Lógica compartida de movimiento (ratón y táctil): coloca el bloque bajo el
// puntero/dedo, elige columna destino por X y aplica el snap de 30 min por
// DELTA desde el punto donde se agarró. Recibe coordenadas de cliente.
function applyCronogramaDragMove(clientX, clientY) {
  if (!crDrag) return;
  crDrag.moved = true;

  // Durante la animación de cambio de semana/día el bloque va FLOTANDO pegado al
  // puntero; no recolocamos por columna/hora hasta que termine la transición.
  if (crHorizAnimating) {
    enterCronogramaFloat();
    crDrag.block.style.left = (clientX - crDrag.grabOffsetX) + 'px';
    crDrag.block.style.top = (clientY - crDrag.grabOffsetY) + 'px';
    return;
  }

  // 0) ¿El puntero está sobre la papelera? (mismo botón #trash-btn del planner).
  // Si es así, resaltarla y no recolocar el bloque por columna/hora: al soltar
  // ahí se eliminará la tarea.
  const trashBtn = document.getElementById('trash-btn');
  let overTrash = false;
  if (trashBtn) {
    const tr = trashBtn.getBoundingClientRect();
    overTrash = clientX >= tr.left && clientX <= tr.right
      && clientY >= tr.top && clientY <= tr.bottom;
    trashBtn.classList.toggle('drag-over', overTrash);
  }
  crDrag.overTrash = overTrash;

  // 0a) ¿El puntero está sobre el archivado? Cuenta tanto el ICONO (#briefcase-btn)
  // como el PANEL de archivados abierto (#briefcase-drawer). Al soltar en
  // cualquiera de los dos, se archiva la tarea.
  const briefcaseBtn = document.getElementById('briefcase-btn');
  const briefcaseDrawer = document.getElementById('briefcase-drawer');
  const inRect = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  };
  const overBtn = inRect(briefcaseBtn);
  const drawerOpen = briefcaseDrawer && !briefcaseDrawer.classList.contains('closed');
  const overDrawer = drawerOpen && inRect(briefcaseDrawer);
  const overBriefcase = overBtn || overDrawer;
  if (briefcaseBtn) briefcaseBtn.classList.toggle('drag-over', overBtn);
  if (briefcaseDrawer) briefcaseDrawer.classList.toggle('drag-over', overDrawer);
  crDrag.overBriefcase = overBriefcase;

  // 0b) ¿El puntero está por ENCIMA del área de scroll del horario (zona del
  // header) o sobre la papelera/archivado? En ese caso el bloque "flota"
  // (position:fixed) siguiendo al cursor, para que pueda salir del recorte del
  // scroll y llegar visualmente hasta los iconos del header. Si vuelve dentro
  // del horario, se recoloca de forma normal en su columna.
  const scrollEl = document.querySelector('.cronograma-scroll');
  const scrollTop = scrollEl ? scrollEl.getBoundingClientRect().top : 0;
  const shouldFloat = overTrash || overBriefcase || clientY < scrollTop;

  if (shouldFloat) {
    enterCronogramaFloat();
    crDrag.block.style.left = (clientX - crDrag.grabOffsetX) + 'px';
    crDrag.block.style.top = (clientY - crDrag.grabOffsetY) + 'px';
    if (crDrag.targetColEl) crDrag.targetColEl.classList.remove('cr-drag-over');
    return; // flotando: no recolocar por columna/hora
  }
  // Si venía flotando y vuelve al horario, restaurar el posicionamiento normal.
  if (crDrag.floating) exitCronogramaFloat();

  // 0c) Borde lateral → cambiar de semana (escritorio) o deslizar al día vecino
  // cruzando semanas (móvil), para poder soltar en días no visibles.
  updateCronogramaHorizontalEdge(clientX, clientY);

  // 1) Columna destino: la .cr-day-col bajo el cursor (por X).
  let targetCol = crDrag.targetColEl;
  for (const col of crDrag.cols) {
    const r = col.getBoundingClientRect();
    if (clientX >= r.left && clientX < r.right) { targetCol = col; break; }
  }
  if (targetCol !== crDrag.targetColEl) {
    // Quitar el resaltado de la columna anterior y marcar la nueva, para que en
    // móvil quede claro en qué día va a caer la tarea (medida #12 del planner).
    if (crDrag.targetColEl) crDrag.targetColEl.classList.remove('cr-drag-over');
    targetCol.appendChild(crDrag.block);
    crDrag.targetColEl = targetCol;
    targetCol.classList.add('cr-drag-over');
  } else if (!targetCol.classList.contains('cr-drag-over')) {
    targetCol.classList.add('cr-drag-over');
  }

  // 2) Posición vertical por DELTA del puntero desde el punto donde se agarró.
  // Esto mantiene el bloque exactamente bajo el cursor (sin saltos al empezar).
  const deltaPx = clientY - crDrag.grabClientY; // 1px = 1min
  const orig = crDrag.originalStartMin;
  // Snap en pasos de 30 min RELATIVOS al inicio original de la tarea: si empieza
  // a las 9:14, los valores posibles son 8:44, 9:14, 9:44, ... (conserva los
  // minutos originales en lugar de cuadrar a :00/:30).
  const steps = Math.round(deltaPx / CR_SNAP_MIN);
  let startMin = orig + steps * CR_SNAP_MIN;
  // Mantener el inicio dentro del día (sin perder los minutos originales):
  // bajar a la franja válida más cercana por arriba/abajo si se sale.
  while (startMin < 0) startMin += CR_SNAP_MIN;
  while (startMin > 1440 - CR_SNAP_MIN) startMin -= CR_SNAP_MIN;
  crDrag.newStartMin = startMin;

  // Mover visualmente el bloque (alto fijo = duración, recortado a fin de día).
  crDrag.block.style.top = startMin + 'px';
  const visibleEnd = Math.min(startMin + crDrag.durationMin, 1440);
  crDrag.block.style.height = Math.max(visibleEnd - startMin, 16) + 'px';

  // Actualizar EN VIVO el rango horario mostrado en el bloque (elemento dedicado
  // .cr-task-time), p. ej. "13:00 - 15:00" → "13:30 - 15:30", SIN guardar. El
  // guardado ocurre solo al soltar.
  const timeEl = crDrag.block.querySelector('.cr-task-time');
  if (timeEl) {
    const toHHMM = (min) => {
      const m = ((min % 1440) + 1440) % 1440;
      return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    };
    const newStart = toHHMM(startMin);
    const newEnd = toHHMM(startMin + crDrag.durationMin);
    timeEl.textContent = `${newStart} - ${newEnd}`;

    // Actualizar también la duración en vivo (paréntesis a la derecha).
    const durEl = crDrag.block.querySelector('.cr-task-time-dur');
    if (durEl) {
      const dur = formatTaskDuration(newStart, newEnd);
      durEl.textContent = dur ? ` (${dur})` : '';
    }
  }
}

function onCronogramaDragEnd(e) {
  if (!crDrag) return;
  // Si se suelta en mitad de una animación de cambio de semana/día, aterrizar
  // primero el bloque en la columna/hora correctas antes de confirmar.
  if (crHorizAnimating) {
    crHorizAnimating = false;
    crRebindAfterHorizontalChange();
  }
  const drag = crDrag;
  crDrag = null;

  window.removeEventListener('pointermove', onCronogramaDragMove);
  window.removeEventListener('pointerup', onCronogramaDragEnd);
  window.removeEventListener('keydown', onCronogramaDragKey);
  window.removeEventListener('keyup', onCronogramaDragKey);
  stopCronogramaEdgeScroll();
  clearCronogramaHorizontalEdge();

  if (drag.ghost) drag.ghost.remove();
  // Si el bloque quedó flotando (sobre el body), quitarlo: renderCronograma lo
  // redibujará en su sitio desde los datos. Evita un bloque huérfano en el body.
  if (drag.floating && drag.block.parentElement === document.body) {
    drag.block.remove();
  }
  drag.block.classList.remove('cr-dragging', 'cr-floating');
  drag.block.style.pointerEvents = '';
  try { drag.block.releasePointerCapture(drag.pointerId); } catch (_) {}
  clearCronogramaDragOver();

  // Ocultar/limpiar los destinos del header (papelera y archivado).
  document.body.classList.remove('dragging-active');
  clearCronogramaHeaderTargets();

  commitCronogramaDragResult(drag);
}

// Quita el resaltado .cr-drag-over de todas las columnas del horario. Se llama
// al soltar o cancelar el arrastre para no dejar columnas marcadas.
function clearCronogramaDragOver() {
  document.querySelectorAll('.cr-day-col.cr-drag-over')
    .forEach(c => c.classList.remove('cr-drag-over'));
}

// Quita el resaltado de los destinos del header (papelera y archivado) al soltar
// o cancelar un arrastre del horario.
function clearCronogramaHeaderTargets() {
  const t = document.getElementById('trash-btn');
  if (t) t.classList.remove('drag-over');
  const b = document.getElementById('briefcase-btn');
  if (b) b.classList.remove('drag-over');
  const d = document.getElementById('briefcase-drawer');
  if (d) d.classList.remove('drag-over');
}

// Persiste el resultado de un arrastre (compartido por ratón y táctil). Espera
// que la limpieza específica del input (listeners, captura) ya se haya hecho y
// que crDrag ya esté en null. Si no hubo movimiento real, trata el gesto como
// un click y no toca los datos.
function commitCronogramaDragResult(drag) {
  if (!drag.moved) return; // fue un click, no un arrastre

  // Evitar que el click posterior abra el modal de edición.
  suppressNextCronogramaClick = true;
  setTimeout(() => { suppressNextCronogramaClick = false; }, 0);

  const toHHMM = (min) => {
    const m = ((min % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };

  // ── SOLTAR EN LA PAPELERA → ELIMINAR ───────────────────────────────────────
  // Igual que el planner: si se soltó sobre #trash-btn, se elimina la tarea
  // (deleteTask gestiona la confirmación para recurrentes). Re-render del horario.
  if (drag.overTrash) {
    deleteTask(drag.task.id, drag.sourceDate || drag.task.date);
    renderCronograma();
    return;
  }

  // ── SOLTAR EN EL ARCHIVADO (MALETÍN) → ARCHIVAR ────────────────────────────
  // Igual que el planner: si se soltó sobre #briefcase-btn, la tarea pasa al
  // maletín (moveTaskToBriefcase gestiona recurrentes/simples). Re-render.
  if (drag.overBriefcase) {
    moveTaskToBriefcase(drag.task.id, null, drag.sourceDate || drag.task.date);
    renderCronograma();
    return;
  }

  const newStartMin = drag.newStartMin;
  const newEndMin = newStartMin + drag.durationMin; // puede superar 1440 (cruza medianoche)
  const newDateStr = drag.targetColEl ? drag.targetColEl.dataset.date : null;

  // ── CTRL/CMD → COPIAR (crear un clon independiente) ────────────────────────
  if (drag.copy) {
    pushToUndoStack();
    const clon = {
      ...drag.task,
      id: 'task-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      date: newDateStr || drag.task.date,
      startTime: toHHMM(newStartMin),
      endTime: toHHMM(newEndMin)
    };
    // Una copia de una ocurrencia recurrente se vuelve una tarea simple (mismo
    // criterio que la copia con Ctrl del planner).
    if (clon.recurrence && clon.recurrence.enabled) clon.recurrence = null;
    tasks.push(clon);
    renderCronograma();
    saveTasksToStorage();
    return;
  }

  const oldStart = (getTaskTimeRange(drag.task) || {}).startMin;
  const sameTime = oldStart === newStartMin;
  const sameDay = !newDateStr || newDateStr === drag.task.date;
  if (sameTime && sameDay) {
    renderCronograma(); // restaurar posición exacta por si el snap no cambió nada
    return;
  }

  pushToUndoStack();

  // Guardar el horario ORIGINAL (para detección de adyacencia y para revertir si
  // el usuario cancela el aviso) ANTES de mutar la tarea.
  const dragOldRange = getTaskAbsoluteRange(drag.task);
  const dragRevert = {
    startTime: drag.task.startTime,
    endTime: drag.task.endTime,
    date: drag.task.date,
    duration: drag.task.duration
  };

  // Actualizar la hora en los CAMPOS (manteniendo la duración). El fin se envuelve
  // a 24h si la tarea cruza medianoche.
  drag.task.startTime = toHHMM(newStartMin);
  drag.task.endTime = toHHMM(newEndMin);

  // Cambiar el día si se soltó en otra columna.
  if (newDateStr && newDateStr !== drag.task.date) {
    drag.task.date = newDateStr;
  }

  // ── Aviso de tareas adyacentes tras el arrastre ───────────────────────────
  // Si la tarea (con horario inicio+fin) quedó pegada a alguna vecina, NO se
  // guarda todavía: se muestra el panel y el guardado se difiere hasta que el
  // usuario decida (Conservar / Modificar). "Cancelar" revierte el arrastre.
  let adjacentPending = false;
  if (drag.task.startTime && drag.task.endTime && dragOldRange) {
    const affectations = findAdjacentAffectedTasks(drag.task, dragOldRange);
    if (affectations.length > 0) {
      adjacentPending = true;
      pendingAdjacent = {
        mode: 'drag',
        task: drag.task,
        revert: dragRevert,
        affectations
      };
    }
  }

  // Re-render INMEDIATO (síncrono) para que la vista refleje el cambio al
  // instante. Si hay un aviso pendiente NO guardamos aún (el guardado lo hace
  // el botón del panel); si no, guardamos en segundo plano como siempre.
  renderCronograma();
  if (!adjacentPending) {
    saveTasksToStorage();
  } else {
    openAdjacentTasksModal(pendingAdjacent.affectations);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ARRASTRE TÁCTIL (MÓVIL) EN EL CRONOGRAMA
// Mismo resultado que en escritorio (mover de hora con snap de 30 min y/o de
// día), pero el gesto se inicia con un LONG-PRESS para no interferir con el
// scroll vertical del horario ni con el toque normal (que abre la tarea).
//   - touchstart: arma un temporizador; si el dedo se mueve antes de que salte,
//     se cancela y el navegador hace scroll con normalidad.
//   - al saltar el temporizador: se entra en modo arrastre (se crea crDrag) y a
//     partir de ahí los touchmove mueven el bloque (preventDefault corta el
//     scroll) reusando la misma lógica que el ratón.
//   - touchend: si hubo arrastre, se persiste; si fue un toque, se abre la tarea.
// ─────────────────────────────────────────────────────────────────────────

const CR_TOUCH_LONGPRESS_MS = 400; // tiempo de pulsación para iniciar el arrastre
const CR_TOUCH_MOVE_TOLERANCE = 10; // px de margen antes de cancelar el long-press

let crTouch = null; // estado del long-press táctil (antes de entrar en arrastre)

function startCronogramaTouch(block, task, e) {
  // Un solo dedo; sobre el checkbox no se arrastra.
  if (e.touches.length !== 1) return;
  if (e.target.closest('.task-check-btn')) return;
  // Si ya hay un arrastre en curso, ignorar.
  if (crDrag || crTouch) return;

  const grid = document.getElementById('cronograma-grid');
  if (!grid) return;
  const range = getTaskTimeRange(task);
  if (!range) return;

  const touch = e.touches[0];
  crTouch = {
    block,
    task,
    grid,
    startX: touch.clientX,
    startY: touch.clientY,
    range,
    timer: setTimeout(() => beginCronogramaTouchDrag(), CR_TOUCH_LONGPRESS_MS)
  };

  window.addEventListener('touchmove', onCronogramaTouchMove, { passive: false });
  window.addEventListener('touchend', onCronogramaTouchEnd);
  window.addEventListener('touchcancel', onCronogramaTouchEnd);
}

// Al cumplirse el long-press: pasar de "esperando" a "arrastrando" creando el
// estado crDrag (idéntico al de escritorio) a partir del touch guardado.
function beginCronogramaTouchDrag() {
  if (!crTouch) return;
  const { block, task, grid, range, startY } = crTouch;

  const durationMin = (range.crossesMidnight ? range.rawEndMin + 1440 : range.rawEndMin) - range.startMin;
  const cols = [...grid.querySelectorAll('.cr-day-col')];

  // Desfase del dedo dentro del bloque y ancho, para poder "flotar" el bloque y
  // llevarlo sobre el header (papelera/archivado) sin saltos ni recorte.
  const blockRect = block.getBoundingClientRect();
  const startX = crTouch.startX;

  crDrag = {
    block,
    task,
    durationMin,
    grid,
    cols,
    grabClientY: startY,
    grabOffsetX: startX - blockRect.left,
    grabOffsetY: startY - blockRect.top,
    blockWidth: blockRect.width,
    floating: false,
    startColEl: block.parentElement,
    targetColEl: block.parentElement,
    originalStartMin: range.startMin,
    newStartMin: range.startMin,
    originColEl: block.parentElement,
    originTopPx: range.startMin,
    ghost: null,
    sourceDate: task.date,
    copy: false,        // copiar con Ctrl es solo de escritorio
    overTrash: false,
    overBriefcase: false,
    moved: false,
    pointerId: null
  };

  block.classList.add('cr-dragging');
  block.style.pointerEvents = 'none';

  // Marca a nivel de documento mientras dura el arrastre. El CSS la usa para
  // cortar el scroll/zoom del navegador (touch-action:none) y la selección de
  // texto (user-select:none) SOLO mientras se arrastra, igual que el planner
  // hace con body.dragging-active. En reposo el horario sigue scrolleando.
  document.body.classList.add('cr-dragging-active');
  // También dragging-active para que aparezca la papelera (#trash-btn), igual que
  // en escritorio. El archivado (#briefcase-btn) ya está siempre visible.
  document.body.classList.add('dragging-active');

  // Feedback háptico (igual que el arrastre táctil del planner).
  if (navigator.vibrate) navigator.vibrate(50);
}

function onCronogramaTouchMove(e) {
  // Caso A: ya estamos arrastrando → mover el bloque y cortar el scroll.
  if (crDrag) {
    if (e.cancelable) e.preventDefault();
    const t = e.touches[0];
    crEdgeScroll.lastX = t.clientX;
    crEdgeScroll.lastY = t.clientY;
    applyCronogramaDragMove(t.clientX, t.clientY);
    // Auto-scroll de borde, salvo si el bloque flota sobre el header
    // (papelera/archivado): ahí no se scrollea.
    if (crDrag.floating) {
      stopCronogramaEdgeScroll();
    } else {
      crEdgeScroll.lastX = t.clientX;
      crEdgeScroll.lastY = t.clientY;
      updateCronogramaEdgeScroll(t.clientY);
    }
    return;
  }
  // Caso B: aún esperando el long-press → si el dedo se mueve, era un scroll:
  // cancelar el temporizador y soltar los listeners (deja scrollear al navegador).
  if (!crTouch) return;
  const t = e.touches[0];
  const dx = Math.abs(t.clientX - crTouch.startX);
  const dy = Math.abs(t.clientY - crTouch.startY);
  if (dx > CR_TOUCH_MOVE_TOLERANCE || dy > CR_TOUCH_MOVE_TOLERANCE) {
    cancelCronogramaTouch();
  }
}

// ── Auto-scroll de borde durante el arrastre táctil del horario ────────────
// En el teléfono el dedo choca con el borde de la pantalla antes de poder mover
// una tarea muchas horas arriba/abajo. Cuando el dedo entra en la franja de
// borde de .cronograma-scroll, desplazamos la vista con un bucle rAF. Al
// desplazar el contenedor, el contenido se mueve bajo el dedo: compensamos
// grabClientY por el mismo delta para que el bloque siga apuntando a la hora
// correcta, y reaplicamos el movimiento con la última posición del dedo.
const CR_EDGE_ZONE = 70;       // px desde el borde donde empieza el auto-scroll
const CR_EDGE_MAX_SPEED = 14;  // px por frame en el borde mismo

let crEdgeScroll = { rafId: null, dir: 0, speed: 0, lastX: 0, lastY: 0, container: null };

// ── Arrastre horizontal a días/semanas no visibles (mismo concepto que el
// planner). Al acercar el puntero/dedo al borde lateral durante el arrastre del
// horario, se cambia de semana (escritorio) o se desliza al día vecino cruzando
// semanas (móvil). Indicador visual + háptico reutilizados del planner.
const CR_HORIZ_EDGE_ZONE = 80;     // px desde el borde lateral que activa el cambio
const CR_HORIZ_DELAY = 300;        // ms en la zona antes de disparar
const CR_HORIZ_COOLDOWN = 600;     // ms entre cambios sucesivos
let crHorizEdgeTimeout = null;
let crHorizEdgeDir = 0;
let crHorizEdgeCooldown = false;
let crHorizAnimating = false;  // ¿hay una animación de cambio de semana/día en curso?

// Decide si hay que auto-scrollear según la cercanía del dedo a los bordes.
function updateCronogramaEdgeScroll(clientY) {
  const container = document.querySelector('.cronograma-scroll');
  if (!container) { stopCronogramaEdgeScroll(); return; }
  const r = container.getBoundingClientRect();

  let dir = 0, speed = 0;
  if (clientY < r.top + CR_EDGE_ZONE) {
    dir = -1;
    const intensity = (r.top + CR_EDGE_ZONE - clientY) / CR_EDGE_ZONE;
    speed = Math.ceil(Math.min(1, intensity) * CR_EDGE_MAX_SPEED);
  } else if (clientY > r.bottom - CR_EDGE_ZONE) {
    dir = 1;
    const intensity = (clientY - (r.bottom - CR_EDGE_ZONE)) / CR_EDGE_ZONE;
    speed = Math.ceil(Math.min(1, intensity) * CR_EDGE_MAX_SPEED);
  }

  crEdgeScroll.container = container;
  crEdgeScroll.dir = dir;
  crEdgeScroll.speed = speed;

  if (dir === 0) { stopCronogramaEdgeScroll(); return; }
  if (crEdgeScroll.rafId == null) {
    crEdgeScroll.rafId = requestAnimationFrame(cronogramaEdgeScrollStep);
  }
}

// Un paso del bucle: desplaza la vista, compensa grabClientY y reaplica la
// posición del bloque para que siga la hora correcta sin saltos.
function cronogramaEdgeScrollStep() {
  crEdgeScroll.rafId = null;
  if (!crDrag || crEdgeScroll.dir === 0) return;

  const container = crEdgeScroll.container;
  if (!container) return;

  const before = container.scrollTop;
  const maxScroll = container.scrollHeight - container.clientHeight;
  const next = Math.min(Math.max(0, before + crEdgeScroll.dir * crEdgeScroll.speed), maxScroll);
  const applied = next - before;

  if (applied !== 0) {
    container.scrollTop = next;
    // El contenido se desplazó "applied" px bajo el dedo. Para que el delta
    // (clientY - grabClientY) refleje el movimiento real respecto al contenido,
    // movemos el origen en sentido contrario.
    crDrag.grabClientY -= applied;
    applyCronogramaDragMove(crEdgeScroll.lastX, crEdgeScroll.lastY);
  }

  // Continuar mientras siga habiendo dirección y margen para desplazar.
  if (crEdgeScroll.dir !== 0 && applied !== 0) {
    crEdgeScroll.rafId = requestAnimationFrame(cronogramaEdgeScrollStep);
  }
}

function stopCronogramaEdgeScroll() {
  if (crEdgeScroll.rafId != null) cancelAnimationFrame(crEdgeScroll.rafId);
  crEdgeScroll.rafId = null;
  crEdgeScroll.dir = 0;
  crEdgeScroll.speed = 0;
}

// ── Borde lateral durante el arrastre del horario ────────────────────────────
// Detecta si el puntero/dedo está en la franja lateral de la ventana y, tras un
// breve retardo, dispara el cambio de día/semana. Mantiene el mismo indicador
// visual y háptico del planner.
function updateCronogramaHorizontalEdge(clientX, clientY) {
  if (!crDrag) { clearCronogramaHorizontalEdge(); return; }

  const w = window.innerWidth;
  const dir = clientX < CR_HORIZ_EDGE_ZONE ? -1
            : clientX > w - CR_HORIZ_EDGE_ZONE ? 1
            : 0;

  if (dir === 0 || crHorizEdgeCooldown) {
    clearCronogramaHorizontalEdge();
    return;
  }

  // En zona de borde: mostrar indicador y armar el timer si cambió la dirección.
  showEdgeIndicator(dir);
  if (crHorizEdgeDir !== dir) {
    if (crHorizEdgeTimeout) clearTimeout(crHorizEdgeTimeout);
    crHorizEdgeDir = dir;
    crHorizEdgeTimeout = setTimeout(() => {
      triggerCronogramaHorizontalChange(dir);
    }, CR_HORIZ_DELAY);
  }
}

function clearCronogramaHorizontalEdge() {
  if (crHorizEdgeTimeout) {
    clearTimeout(crHorizEdgeTimeout);
    crHorizEdgeTimeout = null;
  }
  crHorizEdgeDir = 0;
  crHorizAnimating = false;
  hideEdgeIndicator();
}

// Dispara el cambio horizontal: en móvil avanza un día (cruzando semanas); en
// escritorio cambia de semana completa. Tras ello, re-vincula el arrastre al
// nuevo DOM para poder continuar sin soltar.
function triggerCronogramaHorizontalChange(dir) {
  if (crHorizEdgeTimeout) { clearTimeout(crHorizEdgeTimeout); crHorizEdgeTimeout = null; }
  crHorizEdgeDir = 0;
  hideEdgeIndicator();
  if (!crDrag || crHorizAnimating) return;

  crHorizEdgeCooldown = true;
  setTimeout(() => { crHorizEdgeCooldown = false; }, CR_HORIZ_COOLDOWN);

  if (navigator.vibrate) navigator.vibrate(30);

  if (isMobile()) {
    crSlideMobileDay(dir);
  } else {
    crChangeWeekDuringDrag(dir);
  }
}

// Mantiene el bloque arrastrado FLOTANDO (position:fixed sobre el body) y pegado
// a la última posición del puntero/dedo, para que NO desaparezca durante el
// deslizamiento/recarga del horario.
function crPinFloatingBlock() {
  if (!crDrag) return;
  enterCronogramaFloat();
  const b = crDrag.block;
  b.style.left = (crEdgeScroll.lastX - crDrag.grabOffsetX) + 'px';
  b.style.top = (crEdgeScroll.lastY - crDrag.grabOffsetY) + 'px';
}

// MÓVIL: el carrusel del horario precarga ±CR_MOBILE_PRELOAD días alrededor del
// centro, así que los días vecinos (incluso de otra semana) ya están en el DOM.
// Avanzamos el día central un paso y deslizamos el carrusel hasta esa columna.
// El bloque arrastrado se mantiene flotando (visible) durante todo el slide.
function crSlideMobileDay(dir) {
  if (!crDrag) return;
  const base = cronogramaMobileDate ? new Date(cronogramaMobileDate) : new Date();
  const targetDate = addDays(base, dir);
  const targetStr = formatDate(targetDate);

  cronogramaMobileDate = new Date(targetDate);
  currentWeekStart = getMondayOf(cronogramaMobileDate);
  if (typeof updateCronogramaMobileLabel === 'function') updateCronogramaMobileLabel(cronogramaMobileDate);

  // Fijar el bloque flotando para que no se mueva ni desaparezca con el scroll.
  crPinFloatingBlock();

  // Si el día destino ya está precargado en el track, basta con deslizar.
  const track = document.getElementById('cr-mobile-track');
  const existing = track ? track.querySelector(`.cr-mobile-day[data-date="${targetStr}"]`) : null;
  if (existing && track) {
    crHorizAnimating = true;
    track.scrollTo({ left: existing.offsetLeft, behavior: 'smooth' });
    syncNowLineVisibilityMobile(formatDate(new Date()));
    // Tras el desplazamiento, salir del flotado recolocando el bloque en la
    // columna que quede bajo el dedo.
    setTimeout(() => {
      crHorizAnimating = false;
      crRebindAfterHorizontalChange();
    }, 360);
    return;
  }

  // Fuera del rango precargado: reconstruir el horario centrado en el nuevo día.
  crRerenderDuringDrag(() => {
    scrollCronogramaTrackToDate(targetStr, false);
  });
}

// ESCRITORIO: deslizamiento lateral IGUAL que el planner. Mantenemos AMBAS
// semanas presentes a la vez (la nueva "oculta" al lado) dentro de un slider, y
// lo desplazamos para revelarla — sin ningún parpadeo en blanco. El bloque
// arrastrado va flotando para no desaparecer.
function crChangeWeekDuringDrag(dir) {
  if (!crDrag) return;
  crPinFloatingBlock(); // mantener el bloque visible durante la animación
  crAnimateWeekSlide(dir, {
    rerender: () => {
      currentWeekStart = addDays(currentWeekStart, dir * 7);
      crRerenderDuringDrag(null);
    },
    fallback: () => {
      currentWeekStart = addDays(currentWeekStart, dir * 7);
      crRerenderDuringDrag(null);
    },
    onSettle: () => crRebindAfterHorizontalChange()
  });
}

// Cambia de semana en el HORARIO (escritorio) con la misma animación de
// deslizamiento, SIN depender de un arrastre. Lo usan las flechas del teclado.
function crSlideWeek(dir) {
  if (crHorizAnimating) return;
  // Actualiza el navegador de tiempo (cabecera) con el nuevo rango de días, igual
  // que el modo lista de tareas. En escritorio el horario muestra la semana
  // completa, así que se usa el rango (lunes–domingo).
  const updateCrWeekLabel = () => {
    if (isMobile()) return; // en móvil el label lo gestiona el flujo táctil
    const label = document.getElementById('week-range-label');
    if (label) label.textContent = formatWeekRange(currentWeekStart);
  };
  crAnimateWeekSlide(dir, {
    rerender: () => {
      currentWeekStart = addDays(currentWeekStart, dir * 7);
      renderCronograma();
      updateCrWeekLabel();
    },
    fallback: () => {
      currentWeekStart = addDays(currentWeekStart, dir * 7);
      renderCronograma();
      updateCrWeekLabel();
    },
    onSettle: null
  });
}

// Núcleo de la animación de deslizamiento de semana del horario (reveal estilo
// planner). `opts.rerender` cambia la semana y reconstruye el grid real;
// `opts.fallback` se usa si no hay contenedores; `opts.onSettle` corre al final.
function crAnimateWeekSlide(dir, opts) {
  opts = opts || {};
  const scrollEl = document.querySelector('.cronograma-scroll');
  const headersHost = document.getElementById('cronograma-headers');
  const oldGrid = document.getElementById('cronograma-grid');

  // Sin contenedores → cambio instantáneo (fallback).
  if (!scrollEl || !oldGrid || !headersHost) {
    if (typeof opts.fallback === 'function') opts.fallback();
    if (typeof opts.onSettle === 'function') opts.onSettle();
    return;
  }

  crHorizAnimating = true;

  // 1) CLON SALIENTE = foto del estado actual (semana actual) antes del render.
  const outGrid = oldGrid.cloneNode(true);
  const outHeader = headersHost.cloneNode(true);
  outGrid.removeAttribute('id');
  outHeader.removeAttribute('id');
  outGrid.querySelectorAll('.cr-dragging, .cr-floating').forEach(el => el.remove());

  // 2) Cambiar de semana y reconstruir el grid/headers REALES (semana nueva).
  if (typeof opts.rerender === 'function') opts.rerender();
  const realGrid = document.getElementById('cronograma-grid');
  const realHeader = document.getElementById('cronograma-headers');
  if (!realGrid || !realHeader) {
    crHorizAnimating = false;
    if (typeof opts.onSettle === 'function') opts.onSettle();
    return;
  }

  // 3) CLON ENTRANTE = foto de la semana nueva ya renderizada.
  const inGrid = realGrid.cloneNode(true);
  const inHeader = realHeader.cloneNode(true);
  inGrid.removeAttribute('id');
  inHeader.removeAttribute('id');
  inGrid.querySelectorAll('.cr-dragging, .cr-floating').forEach(el => el.remove());

  // Ocultar los nodos reales durante la animación (mostramos los clones).
  realGrid.style.visibility = 'hidden';
  realHeader.style.visibility = 'hidden';

  // 4) Slider de 200% con ambas páginas (grid y headers), igual que el planner.
  const wrap = (el) => {
    const page = document.createElement('div');
    page.className = 'cr-week-page';
    page.appendChild(el);
    return page;
  };
  const gridSlider = document.createElement('div');
  gridSlider.className = 'cr-week-slider';
  const headerSlider = document.createElement('div');
  headerSlider.className = 'cr-week-slider cr-week-slider-headers';

  if (dir === 1) {
    gridSlider.appendChild(wrap(outGrid));
    gridSlider.appendChild(wrap(inGrid));
    headerSlider.appendChild(wrap(outHeader));
    headerSlider.appendChild(wrap(inHeader));
  } else {
    gridSlider.appendChild(wrap(inGrid));
    gridSlider.appendChild(wrap(outGrid));
    headerSlider.appendChild(wrap(inHeader));
    headerSlider.appendChild(wrap(outHeader));
  }

  scrollEl.appendChild(gridSlider);
  realHeader.parentElement.insertBefore(headerSlider, realHeader);

  // Posición inicial → final (revela la semana nueva que estaba "oculta").
  const startX = dir === 1 ? 0 : -50;
  const endX = dir === 1 ? -50 : 0;
  gridSlider.style.transform = `translateX(${startX}%)`;
  headerSlider.style.transform = `translateX(${startX}%)`;
  void gridSlider.offsetHeight; // reflow
  requestAnimationFrame(() => {
    gridSlider.style.transition = 'transform 0.45s cubic-bezier(0.25, 1, 0.5, 1)';
    headerSlider.style.transition = 'transform 0.45s cubic-bezier(0.25, 1, 0.5, 1)';
    gridSlider.style.transform = `translateX(${endX}%)`;
    headerSlider.style.transform = `translateX(${endX}%)`;
  });

  // 5) Al terminar: quitar los sliders (clones) y mostrar los nodos reales.
  setTimeout(() => {
    if (gridSlider.parentElement) gridSlider.parentElement.removeChild(gridSlider);
    if (headerSlider.parentElement) headerSlider.parentElement.removeChild(headerSlider);
    realGrid.style.visibility = '';
    realHeader.style.visibility = '';
    crHorizAnimating = false;
    if (typeof opts.onSettle === 'function') opts.onSettle();
  }, 470);
}

// Reconstruye el horario SIN cancelar el arrastre: el bloque ya está flotando, lo
// quitamos del DOM antes de renderizar y fuerza el render (que normalmente se
// bloquea si hay crDrag). NO recoloca el bloque: eso lo hace luego
// crRebindAfterHorizontalChange (cuando termina la animación).
function crRerenderDuringDrag(afterRenderFn) {
  if (!crDrag) return;
  const drag = crDrag;
  const block = drag.block;

  // El bloque está flotando en el body; lo sacamos para que el render no lo
  // toque (lo reinsertaremos al re-vincular).
  if (block && block.parentElement) block.parentElement.removeChild(block);

  // Forzar el render aunque haya un arrastre activo: anulamos crDrag
  // temporalmente para saltar el guard de renderCronograma y lo restauramos.
  const saved = crDrag;
  crDrag = null;
  renderCronograma();
  crDrag = saved;

  if (typeof afterRenderFn === 'function') afterRenderFn();

  // Re-vincular las columnas del nuevo DOM (el bloque sigue flotando aparte).
  const grid = document.getElementById('cronograma-grid');
  if (grid) drag.grid = grid;
  drag.cols = grid ? [...grid.querySelectorAll('.cr-day-col')] : [];

  // Reinsertar el bloque (flotando) en el body para que siga visible mientras
  // dura la animación; crRebindAfterHorizontalChange lo aterriza luego.
  if (block && !block.parentElement) document.body.appendChild(block);
}

// Cuando termina el deslizamiento: aterriza el bloque flotante en la columna que
// quede bajo el puntero/dedo y reaplica el movimiento (mismo agarre/hora).
function crRebindAfterHorizontalChange() {
  if (!crDrag) return;
  const drag = crDrag;
  const grid = document.getElementById('cronograma-grid');
  if (grid) drag.grid = grid;
  drag.cols = grid ? [...grid.querySelectorAll('.cr-day-col')] : [];

  // Columna bajo el puntero por X; si no hay, la primera.
  const cx = crEdgeScroll.lastX;
  let targetCol = null;
  for (const col of drag.cols) {
    const r = col.getBoundingClientRect();
    if (cx >= r.left && cx < r.right) { targetCol = col; break; }
  }
  if (!targetCol) targetCol = drag.cols[0] || null;

  drag.targetColEl = targetCol;
  drag.startColEl = targetCol;
  drag.originColEl = targetCol;

  // Salir del flotado reinsertando el bloque en la columna destino.
  if (drag.floating) exitCronogramaFloat();
  if (targetCol && drag.block && drag.block.parentElement !== targetCol) {
    targetCol.appendChild(drag.block);
  }
  if (targetCol) targetCol.classList.add('cr-drag-over');

  // Reaplicar el movimiento para colocar el bloque bajo el puntero respetando el
  // mismo agarre (grip) y la hora por delta.
  if (crEdgeScroll.lastX || crEdgeScroll.lastY) {
    applyCronogramaDragMove(crEdgeScroll.lastX, crEdgeScroll.lastY);
  }
}

function onCronogramaTouchEnd() {
  const wasDragging = !!crDrag;

  // Si se suelta en mitad de una animación de cambio de día/semana, aterrizar el
  // bloque en la columna/hora correctas antes de confirmar.
  if (wasDragging && crHorizAnimating) {
    crHorizAnimating = false;
    crRebindAfterHorizontalChange();
  }

  const drag = crDrag;

  // Quitar listeners y limpiar el estado de long-press si seguía pendiente.
  cancelCronogramaTouch();

  // Quitar la marca de documento del arrastre (restaura scroll y selección).
  document.body.classList.remove('cr-dragging-active');
  document.body.classList.remove('dragging-active');
  clearCronogramaHeaderTargets();
  stopCronogramaEdgeScroll();
  clearCronogramaHorizontalEdge();
  clearCronogramaDragOver();

  if (wasDragging && drag) {
    crDrag = null;
    // Si el bloque quedó flotando (sobre el body), quitarlo: renderCronograma lo
    // redibujará desde los datos.
    if (drag.floating && drag.block.parentElement === document.body) {
      drag.block.remove();
    }
    drag.block.classList.remove('cr-dragging', 'cr-floating');
    drag.block.style.pointerEvents = '';
    commitCronogramaDragResult(drag);
  }
}

// Limpia el estado de long-press y los listeners táctiles. No toca crDrag (de
// eso se encarga onCronogramaTouchEnd), solo cancela el temporizador pendiente.
function cancelCronogramaTouch() {
  if (crTouch && crTouch.timer) clearTimeout(crTouch.timer);
  crTouch = null;
  window.removeEventListener('touchmove', onCronogramaTouchMove);
  window.removeEventListener('touchend', onCronogramaTouchEnd);
  window.removeEventListener('touchcancel', onCronogramaTouchEnd);
}

// Bandera para evitar que el click que sigue a un arrastre abra el modal.
let suppressNextCronogramaClick = false;

// Devuelve true si el día (YYYY-MM-DD) tiene al menos una tarea (completada o
// no, sin importar la etiqueta). Usado para mostrar/ocultar los botones de
// copiar y limpiar en la cabecera de cada día.
function dayHasAnyTask(dateStr) {
  const dateObj = new Date(dateStr + 'T12:00:00');
  return tasks.some(task => checkTaskOccurrence(task, dateObj));
}

// Muestra u oculta los botones de la cabecera de un día según su estado:
//   • copiar y basurero (limpiar): visibles solo si el día tiene alguna tarea.
//   • estadísticas: visible solo si el día tiene tareas CON duración establecida.
// Aplica igual en planner y horario, escritorio y móvil.
function updateDayHeaderButtonsVisibility(colElement, dateStr) {
  const hasTasks = dayHasAnyTask(dateStr);
  // ¿Hay al menos un minuto de duración (pendiente o completada) ese día?
  const hasDuration = (getDurationForDay(dateStr, false) + getDurationForDay(dateStr, true)) > 0;

  const copyBtn = colElement.querySelector('.copy-day-btn');
  const clearBtn = colElement.querySelector('.clear-day-btn');
  const statsBtn = colElement.querySelector('.stats-day-btn');
  if (copyBtn) copyBtn.classList.toggle('day-btn-hidden', !hasTasks);
  if (clearBtn) clearBtn.classList.toggle('day-btn-hidden', !hasTasks);
  if (statsBtn) statsBtn.classList.toggle('day-btn-hidden', !hasDuration);
}

// Calcula la duración entre una hora de inicio y de fin ("HH:MM") y la devuelve
// abreviada: "1h20m", "20m", "1h", "2h". Si cruza medianoche, suma 24h. Devuelve
// cadena vacía si falta alguna de las dos horas o el rango es nulo.
function formatTaskDuration(startTime, endTime) {
  if (!startTime || !endTime) return '';
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return '';
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // cruza medianoche
  if (mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// Texto de la hora de una tarea para mostrar en tarjetas/bloques. Reglas:
//   • solo inicio:   "00:00"
//   • solo fin:      "- 00:00"
//   • inicio y fin:  "00:00 - 01:00"   (con espacios alrededor del guion)
// Devuelve cadena vacía si la tarea no tiene ninguna hora.
function formatTaskTimeText(task) {
  if (!task) return '';
  const start = task.startTime || '';
  const end = task.endTime || '';
  if (start && end) return `${start} - ${end}`;
  if (start) return start;
  if (end) return `- ${end}`;
  return '';
}

function createTaskCard(task, occurrenceDate) {
  const card = document.createElement('div');
  card.className = 'task-card';
  card.draggable = true;
  card.dataset.id = task.id;
  card.dataset.occurrenceDate = occurrenceDate;

  // Check if completed
  const isCompleted = task.recurrence && task.recurrence.enabled
    ? !!(task.completedOccurrences && task.completedOccurrences.includes(occurrenceDate))
    : !!task.completed;

  if (isCompleted) {
    card.classList.add('completed');
  }

  // Resolve Tag styles
  const tag = tags.find(t => t.id === task.tagId) || tags.find(t => t.id === 'default');
  card.style.setProperty('--tag-bg', tag.color.bg);
  card.style.setProperty('--tag-text', tag.color.text);
  card.style.setProperty('--tag-border', tag.color.border);

  // Title
  const title = document.createElement('div');
  title.className = 'task-card-title';
  title.textContent = task.title;
  card.appendChild(title);

  // Hora (arriba) y descripción (debajo) en bloques SEPARADOS.
  // La hora lleva un icono de reloj a la izquierda y, si hay inicio + fin, la
  // duración calculada entre paréntesis a la derecha: "🕐 14:00 - 15:00 (1h)".
  // Se muestra el bloque de hora si hay inicio O fin (el fin puede ir solo).
  const hasDescText = task.description && task.description.trim() !== '';

  if (task.startTime || task.endTime) {
    const timeBlock = document.createElement('div');
    timeBlock.className = 'task-card-time';

    // Icono de reloj blanco a la izquierda de la hora.
    const clockIcon = document.createElement('span');
    clockIcon.className = 'task-card-time-clock';
    clockIcon.innerHTML = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/></svg>';
    timeBlock.appendChild(clockIcon);

    const timeText = document.createElement('span');
    timeText.className = 'task-card-time-text';
    timeText.textContent = formatTaskTimeText(task);
    timeBlock.appendChild(timeText);

    // Duración entre paréntesis (solo si hay inicio + fin).
    const dur = formatTaskDuration(task.startTime, task.endTime);
    if (dur) {
      const durEl = document.createElement('span');
      durEl.className = 'task-card-time-dur';
      durEl.textContent = ` (${dur})`;
      timeBlock.appendChild(durEl);
    }

    card.appendChild(timeBlock);
  }

  if (hasDescText) {
    const descBlock = document.createElement('div');
    descBlock.className = 'task-card-desc';
    descBlock.textContent = task.description;
    card.appendChild(descBlock);
  }

  // Meta row (Time badges and recurrence indicator)
  const meta = document.createElement('div');
  meta.className = 'task-card-meta';

  // (Funcion de hora eliminada: ya no se muestra badge de hora)



  if (meta.children.length > 0) {
    card.appendChild(meta);
  }

  // Event Listeners for Editing
  card.addEventListener('click', (e) => {
    if (preventClick) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    openTaskModal(task.id, occurrenceDate);
  });

  // Drag Events
  card.addEventListener('dragstart', handleDragStart);
  card.addEventListener('dragend', handleDragEnd);

  // Touch Drag Events (Mobile)
  card.addEventListener('touchstart', handleTouchStart, { passive: true });

  // Evitar que mantener presionada la tarjeta abra el menu contextual del
  // navegador (Atras, Recargar, Inspeccionar...), que interfiere con el
  // gesto de arrastrar en movil.
  card.addEventListener('contextmenu', (e) => e.preventDefault());

  // Checkbox Button
  const checkBtn = document.createElement('button');
  checkBtn.className = 'task-check-btn';
  checkBtn.title = isCompleted ? 'Marcar como pendiente' : 'Marcar como completada';
  
  if (isCompleted) {
    checkBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="task-check-icon checked">
        <rect x="2" y="2" width="20" height="20" rx="4" ry="4" fill="currentColor" stroke="none"/>
        <polyline points="7 12 10 15 17 8" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      </svg>
    `;
  } else {
    checkBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="task-check-icon">
        <rect x="2" y="2" width="20" height="20" rx="4" ry="4"/>
      </svg>
    `;
  }

  checkBtn.addEventListener('click', async (e) => {
    e.stopPropagation();

    // Disable interactions during transition to prevent double clicks
    card.style.pointerEvents = 'none';

    const isCurrentlyCompleted = card.classList.contains('completed');

    // Si al completar hay conflicto de hora de fin (la tarea ya tiene una y la
    // función auto está activa), mostramos el diálogo AL INSTANTE —antes de la
    // animación— para que no aparezca con retraso. La decisión se pasa luego a
    // toggleTaskCompletion para que no lo vuelva a abrir.
    let endTimeChoice = null;
    if (!isCurrentlyCompleted && AUTO_SET_END_TIME_ON_COMPLETE && task.endTime && ASK_END_TIME_CONFLICT) {
      endTimeChoice = await askEndTimeConflict(task.endTime, currentTimeHHMM());
      if (endTimeChoice === 'cancel') {
        card.style.pointerEvents = '';
        return; // No se completa: no se toca la tarjeta ni se anima.
      }
    }

    if (!isCurrentlyCompleted) {
      card.classList.add('completed');
      checkBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="task-check-icon checked">
          <rect x="2" y="2" width="20" height="20" rx="4" ry="4" fill="currentColor" stroke="none"/>
          <polyline points="7 12 10 15 17 8" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      `;
      checkBtn.title = 'Marcar como pendiente';
    } else {
      card.classList.remove('completed');
      checkBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="task-check-icon">
          <rect x="2" y="2" width="20" height="20" rx="4" ry="4"/>
        </svg>
      `;
      checkBtn.title = 'Marcar como completada';
    }
    
    setTimeout(() => {
      const container = card.closest('.tasks-container');

      // Helper: anima un elemento desde un offset hasta su posición natural
      function flipAnimate(el, deltaY, extraProps = {}) {
        el.style.transition = 'none';
        el.style.transform = `translateY(${deltaY}px)`;
        Object.assign(el.style, extraProps.from || {});
        el.offsetHeight; // Forzar reflow para aplicar la transformación inicial de inmediato
        requestAnimationFrame(() => {
          el.style.transition = 'transform 0.18s ease' + (extraProps.transition ? ', ' + extraProps.transition : '');
          el.style.transform = 'translateY(0)';
          Object.assign(el.style, extraProps.to || {});
          el.addEventListener('transitionend', () => {
            el.style.transition = '';
            el.style.transform = '';
            if (extraProps.cleanup) extraProps.cleanup(el);
          }, { once: true });
        });
      }

      // Capturar días debajo en el feed mobile (antes del re-render)
      const mobileBelowDays = (() => {
        if (!isMobile()) return [];
        const grid = document.querySelector('.planner-grid');
        const thisDayCol = card.closest('.mobile-feed-day');
        if (!grid || !thisDayCol) return [];
        const allDayCols = [...grid.querySelectorAll('.mobile-feed-day')];
        const idx = allDayCols.indexOf(thisDayCol);
        return allDayCols.slice(idx + 1).map(el => ({
          el,
          date: el.dataset.date,
          top: el.getBoundingClientRect().top
        }));
      })();

      function animateMobileBelowDays() {
        mobileBelowDays.forEach(({ date, top }) => {
          const grid = document.querySelector('.planner-grid');
          if (!grid) return;
          const newEl = grid.querySelector(`.mobile-feed-day[data-date="${date}"]`);
          if (!newEl) return;
          const delta = top - newEl.getBoundingClientRect().top;
          if (Math.abs(delta) < 2) return;
          flipAnimate(newEl, delta);
        });
      }

      if (!isCurrentlyCompleted) {
        // FLIP marcar como completada: elementos debajo suben
        if (container) {
          const allChildren = [...container.children];
          const cardIndex = allChildren.indexOf(card);
          const below = allChildren.slice(cardIndex + 1);
          // Guardar solo el identificador y la posición (no la referencia al elemento,
          // porque en mobile el innerHTML se destruye y recrea)
          const belowSnap = below.map(el => ({
            key: el.dataset && el.dataset.id ? el.dataset.id : (el.classList.contains('completed-tasks-wrapper') ? '__completed__' : null),
            top: el.getBoundingClientRect().top
          })).filter(s => s.key !== null);

          toggleTaskCompletion(task, occurrenceDate, endTimeChoice, { card, container });

          requestAnimationFrame(() => {
            belowSnap.forEach(({ key, top }) => {
              const newEl = key === '__completed__'
                ? container.querySelector('.completed-tasks-wrapper')
                : container.querySelector(`.task-card[data-id="${key}"]`);
              if (!newEl) return;
              const delta = top - newEl.getBoundingClientRect().top;
              if (Math.abs(delta) < 2) return;
              flipAnimate(newEl, delta);
            });

            // Si el wrapper de completadas es nuevo, lo animamos deslizándose e incrementando opacidad
            const newWrapper = container.querySelector('.completed-tasks-wrapper');
            if (newWrapper && !belowSnap.some(s => s.key === '__completed__')) {
              const cardHeight = card.getBoundingClientRect().height;
              flipAnimate(newWrapper, cardHeight + 8, {
                from: { opacity: '0' },
                to: { opacity: '1' },
                transition: 'opacity 0.18s ease',
                cleanup: (el) => { el.style.opacity = ''; }
              });
            }

            animateMobileBelowDays();
          });
        } else {
          toggleTaskCompletion(task, occurrenceDate, endTimeChoice);
        }
      } else {
        // FLIP inverso desmarcar: wrapper baja, tarea aparece desde arriba
        if (container) {
          const completedWrapper = container.querySelector('.completed-tasks-wrapper');
          const wrapperTopBefore = completedWrapper ? completedWrapper.getBoundingClientRect().top : null;

          toggleTaskCompletion(task, occurrenceDate, endTimeChoice, { card, container });

          requestAnimationFrame(() => {
            // Animar completed-tasks-wrapper bajando
            const newWrapper = container.querySelector('.completed-tasks-wrapper');
            if (newWrapper && wrapperTopBefore !== null) {
              const delta = wrapperTopBefore - newWrapper.getBoundingClientRect().top;
              if (Math.abs(delta) >= 2) flipAnimate(newWrapper, delta);
            }
            // Animar tarea desmarcada apareciendo desde arriba
            const newCard = container.querySelector(`.task-card[data-id="${task.id}"]`);
            if (newCard) {
              const cardHeight = newCard.getBoundingClientRect().height;
              flipAnimate(newCard, -(cardHeight + 8), {
                from: { opacity: '0' },
                to: { opacity: '1' },
                transition: 'opacity 0.18s ease',
                cleanup: (el) => { el.style.opacity = ''; }
              });
            }
            animateMobileBelowDays();
          });
        } else {
          toggleTaskCompletion(task, occurrenceDate, endTimeChoice);
        }
      }
    }, 350);
  });

  // Mantener presionado el checkbox 1.5s inicia el cronómetro para esta tarea
  // (con confirmación). Un toque/clic normal sigue marcando completada.
  attachCheckboxLongPressTimer(checkBtn, task, occurrenceDate);

  card.appendChild(checkBtn);

  return card;
}

// Añade a un checkbox de tarea el gesto de "mantener presionado 1.5s" para
// iniciar el cronómetro de esa tarea (tras confirmación). Funciona con ratón y
// táctil. Si se dispara el long-press, se anula el click de completar que vendría
// después. Reutilizable por las tarjetas del planner y los bloques del horario.
const CHECKBOX_TIMER_LONGPRESS_MS = 1500;
function attachCheckboxLongPressTimer(checkBtn, task, occurrenceDate) {
  let pressTimer = null;
  let longPressed = false;

  const start = () => {
    longPressed = false;
    pressTimer = setTimeout(async () => {
      longPressed = true;
      pressTimer = null;
      if (navigator.vibrate) navigator.vibrate(40);
      const ok = await askStartTimerForTask(task);
      if (ok) startTimerForTask(task);
    }, CHECKBOX_TIMER_LONGPRESS_MS);
  };
  const cancel = () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  };

  // Ratón (escritorio)
  checkBtn.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return; // el táctil se maneja abajo
    if (e.button !== 0) return;
    start();
  });
  checkBtn.addEventListener('pointerup', cancel);
  checkBtn.addEventListener('pointerleave', cancel);

  // Táctil (móvil)
  checkBtn.addEventListener('touchstart', () => start(), { passive: true });
  checkBtn.addEventListener('touchend', cancel);
  checkBtn.addEventListener('touchcancel', cancel);
  checkBtn.addEventListener('touchmove', cancel);

  // Si hubo long-press, evitar que el click posterior marque la tarea.
  checkBtn.addEventListener('click', (e) => {
    if (longPressed) {
      e.stopPropagation();
      e.preventDefault();
      longPressed = false;
    }
  }, true); // captura: corre antes que el listener de completar
}

// Diálogo de confirmación antes de cronometrar una tarea desde su tarjeta.
function askStartTimerForTask(task) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'endtime-conflict-overlay';
    const box = document.createElement('div');
    box.className = 'endtime-conflict-box';

    const h = document.createElement('h3');
    h.className = 'endtime-conflict-title';
    h.textContent = 'Cronometrar tarea';

    const p = document.createElement('p');
    p.className = 'endtime-conflict-desc';
    p.textContent = `Se iniciará el cronómetro para "${task.title || 'Tarea sin título'}" usando la hora actual como inicio. ¿Continuar?`;

    const actions = document.createElement('div');
    actions.className = 'endtime-conflict-actions';

    const finish = (value) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') finish(false); };
    document.addEventListener('keydown', onKey);

    const btnCancel = document.createElement('button');
    btnCancel.className = 'btn btn-secondary';
    btnCancel.textContent = 'Cancelar';
    btnCancel.addEventListener('click', () => finish(false));

    const btnOk = document.createElement('button');
    btnOk.className = 'btn btn-primary';
    btnOk.textContent = 'Iniciar';
    btnOk.addEventListener('click', () => finish(true));

    actions.append(btnCancel, btnOk);
    box.append(h, p, actions);
    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(false); });
    document.body.appendChild(overlay);
  });
}

// Inicia el cronómetro precargando el título y la etiqueta de la tarea, con la
// hora actual como inicio (independientemente de la hora que tenga la tarea).
function startTimerForTask(task) {
  const titleInput = document.getElementById('timer-input-title');
  const descInput = document.getElementById('timer-input-description');
  const startInput = document.getElementById('timer-input-start');
  if (titleInput) titleInput.value = task.title || '';
  if (descInput) descInput.value = '';
  if (startInput) startInput.value = ''; // openTimerModal la rellena con la hora real
  setTimerSelectTagValue(task.tagId || 'default');

  timerSeconds = 0;
  timerStartEdited = false;
  const timerDisplayEl = document.getElementById('timer-display');
  if (timerDisplayEl) timerDisplayEl.textContent = '00:00:00';

  timerStartTime = new Date(); // hora actual como inicio

  setTimerButtonActive(true);
  openTimerModal();
  saveActiveTimerState();
}

// --- Drag and Drop Handlers ---
let draggedTaskId = null;
let draggedTaskSourceDate = null;

function handleDragStart(e) {
  draggedTaskId = this.dataset.id;
  draggedTaskSourceDate = this.dataset.occurrenceDate;
  this.classList.add('dragging');
  e.dataTransfer.setData('text/plain', draggedTaskId);
  e.dataTransfer.effectAllowed = 'copyMove';
  document.body.classList.add('dragging-active');
}

function handleDragEnd() {
  this.classList.remove('dragging');
  
  // Reset style modifications if it was placed in body
  this.style.position = '';
  this.style.top = '';
  this.style.left = '';
  if (this.parentNode === document.body) {
    this.remove();
  }

  draggedTaskId = null;
  draggedTaskSourceDate = null;
  document.body.classList.remove('dragging-active');

  // Clear all drag-over and indicator classes just in case
  document.querySelectorAll('.day-column').forEach(col => {
    col.classList.remove('drag-over');
  });
  document.querySelectorAll('.task-card').forEach(card => {
    card.classList.remove('drag-after-indicator', 'drag-before-indicator');
  });
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.task-card:not(.completed):not(.dragging):not(.touch-dragging)')];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// ¿La coordenada vertical y cae dentro del rectangulo visible del elemento?
function elementContainsPointY(el, y) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.height === 0) return false;
  return y >= rect.top && y <= rect.bottom;
}

// Igual que getDragAfterElement pero operando SOLO sobre las tarjetas
// completadas (las que viven dentro de .completed-tasks-container). Permite
// reordenar las completadas entre si sin tocar las pendientes.
function getDragAfterElementCompleted(container, y) {
  const draggableElements = [...container.querySelectorAll('.task-card.completed:not(.dragging):not(.touch-dragging)')];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Reordena una tarea completada dentro de la seccion de completadas de un dia.
// No mueve la tarea a otro dia ni cambia su estado: solo recalcula el orden
// relativo ENTRE las completadas, dejandolas siempre despues de las pendientes.
function reorderCompletedTask(taskId, targetDateStr, afterTaskId) {
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return;

  const movedTask = tasks[taskIndex];
  const checkDate = new Date(targetDateStr + 'T00:00:00');

  // Separar pendientes y completadas del dia, respetando el orden actual.
  const dayTasks = tasks.filter(t => checkTaskOccurrence(t, checkDate));
  sortDayTasks(dayTasks, targetDateStr);

  const isCompleted = (t) => (t.recurrence && t.recurrence.enabled)
    ? !!(t.completedOccurrences && t.completedOccurrences.includes(targetDateStr))
    : !!t.completed;

  const pending = dayTasks.filter(t => !isCompleted(t));
  const completed = dayTasks.filter(t => isCompleted(t) && t.id !== taskId);

  // Insertar la tarea movida en la posicion indicada dentro de las completadas.
  let insertIndex = completed.length;
  if (afterTaskId) {
    const idx = completed.findIndex(t => t.id === afterTaskId);
    if (idx !== -1) insertIndex = idx;
  }
  completed.splice(insertIndex, 0, movedTask);

  // Validar si el nuevo orden propuesto respeta el orden cronológico
  if (!validateProposedOrder([...pending, ...completed], targetDateStr)) {
    renderWeeklyCalendar();
    return;
  }

  pushToUndoStack();

  // Reasignar posiciones: primero las pendientes (conservando su orden) y
  // luego las completadas. Asi las completadas siempre quedan al final pero
  // con el nuevo orden relativo entre ellas.
  const ordered = [...pending, ...completed];
  ordered.forEach((t, idx) => {
    setEffectivePosition(t, targetDateStr, idx * 10);
  });

  saveTasksToStorage();
  renderWeeklyCalendar();
}

function setupDragAndDrop(targetWrapper = document) {
  const columns = targetWrapper.querySelectorAll('.day-column');

  columns.forEach(column => {
    const container = column.querySelector('.tasks-container');

    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
      column.classList.add('drag-over');

      const draggedTask = tasks.find(t => t.id === draggedTaskId);
      if (!draggedTask) return;

      // Detectar si el cursor esta sobre la seccion de completadas (expandida).
      // En ese caso, mostramos el indicador ENTRE las completadas para permitir
      // reordenarlas igual que las pendientes.
      const completedContainer = column.querySelector('.completed-tasks-container');
      const draggedIsCompletedHere = (draggedTask.recurrence && draggedTask.recurrence.enabled)
        ? !!(draggedTask.completedOccurrences && draggedTask.completedOccurrences.includes(draggedTaskSourceDate))
        : !!draggedTask.completed;
      const overCompleted = completedContainer
        && completedContainer.offsetParent !== null
        && draggedIsCompletedHere
        && draggedTaskSourceDate === column.dataset.date
        && !e.ctrlKey
        && elementContainsPointY(completedContainer, e.clientY);

      let afterElement, targetEl, targetClass;
      if (overCompleted) {
        afterElement = getDragAfterElementCompleted(completedContainer, e.clientY);
        if (afterElement) {
          targetEl = afterElement;
          targetClass = 'drag-before-indicator';
        } else {
          const cards = completedContainer.querySelectorAll('.task-card.completed:not(.dragging):not(.touch-dragging)');
          targetEl = cards.length > 0 ? cards[cards.length - 1] : null;
          targetClass = 'drag-after-indicator';
        }
        if (column._lastIndicatorEl === targetEl && column._lastIndicatorClass === targetClass) {
          return;
        }
        if (column._lastIndicatorEl) {
          column._lastIndicatorEl.classList.remove('drag-after-indicator', 'drag-before-indicator');
        }
        if (targetEl) targetEl.classList.add(targetClass);
        column._lastIndicatorEl = targetEl;
        column._lastIndicatorClass = targetClass;
        return;
      }

      // Determinar donde caeria la tarjeta segun la posicion del cursor.
      afterElement = getDragAfterElement(container, e.clientY);
      if (afterElement) {
        targetEl = afterElement;
        targetClass = 'drag-before-indicator';
      } else {
        const cards = container.querySelectorAll('.task-card:not(.completed):not(.dragging):not(.touch-dragging)');
        targetEl = cards.length > 0 ? cards[cards.length - 1] : null;
        targetClass = 'drag-after-indicator';
      }

      // Solo repintar si el destino CAMBIO (evita el parpadeo y el trabajo
      // redundante de borrar/poner clases en cada pixel del arrastre).
      if (column._lastIndicatorEl === targetEl && column._lastIndicatorClass === targetClass) {
        return;
      }
      // Limpiar indicador anterior
      if (column._lastIndicatorEl) {
        column._lastIndicatorEl.classList.remove('drag-after-indicator', 'drag-before-indicator');
      }
      if (targetEl) {
        targetEl.classList.add(targetClass);
      }
      column._lastIndicatorEl = targetEl;
      column._lastIndicatorClass = targetClass;
    });

    column.addEventListener('dragleave', (e) => {
      // Ignorar dragleave hacia un hijo dentro de la misma columna
      // (evita limpiar el indicador al pasar entre tarjetas).
      if (column.contains(e.relatedTarget)) return;
      column.classList.remove('drag-over');
      container.querySelectorAll('.task-card').forEach(card => {
        card.classList.remove('drag-after-indicator', 'drag-before-indicator');
      });
      column._lastIndicatorEl = null;
      column._lastIndicatorClass = null;
    });

    column.addEventListener('drop', (e) => {
      e.preventDefault();
      column.classList.remove('drag-over');
      
      // Clean indicators
      container.querySelectorAll('.task-card').forEach(card => {
        card.classList.remove('drag-after-indicator', 'drag-before-indicator');
      });
      column._lastIndicatorEl = null;
      column._lastIndicatorClass = null;

      const id = e.dataTransfer.getData('text/plain');
      const targetDateStr = column.dataset.date;

      if (!id || !targetDateStr) return;

      // Si se suelta sobre la seccion de completadas y la tarea arrastrada es
      // una completada del MISMO dia, reordenar entre completadas en vez de
      // mover (no se permite copiar/mover de dia dentro de esta seccion).
      const completedContainer = column.querySelector('.completed-tasks-container');
      const draggedTask = tasks.find(t => t.id === id);
      const draggedIsCompletedHere = draggedTask && ((draggedTask.recurrence && draggedTask.recurrence.enabled)
        ? !!(draggedTask.completedOccurrences && draggedTask.completedOccurrences.includes(draggedTaskSourceDate))
        : !!draggedTask.completed);

      if (!e.ctrlKey
          && draggedIsCompletedHere
          && draggedTaskSourceDate === targetDateStr
          && completedContainer
          && completedContainer.offsetParent !== null
          && elementContainsPointY(completedContainer, e.clientY)) {
        const afterEl = getDragAfterElementCompleted(completedContainer, e.clientY);
        reorderCompletedTask(id, targetDateStr, afterEl ? afterEl.dataset.id : null);
        return;
      }

      moveTaskToDate(id, draggedTaskSourceDate, targetDateStr, container, e.clientY, e.ctrlKey);
    });
  });
}

// --- Touch Drag and Drop Handlers (Mobile) ---

function handleTouchStart(e) {
  if (!isMobile()) return;
  if (e.touches.length !== 1) return;

  const card = this;
  // If touch is on checkbox, edit button or similar interactive child, don't drag
  if (e.target.closest('.task-check-btn') || e.target.closest('.task-check-icon')) {
    return;
  }

  const touch = e.touches[0];
  touchStartClientX = touch.clientX;
  touchStartClientY = touch.clientY;
  touchDraggedTaskId = card.dataset.id;
  touchDraggedSourceDate = card.dataset.occurrenceDate;
  isTouchDragging = false;
  lastTouchX = touch.clientX;
  lastTouchY = touch.clientY;

  // Clear any existing timer
  if (touchTimeout) clearTimeout(touchTimeout);

  touchTimeout = setTimeout(() => {
    // 0.3 seconds (300ms) long press reached!
    isTouchDragging = true;
    startTouchDrag(card, touch);
  }, 300);

  // Add temporary global move/end listeners
  window.addEventListener('touchmove', handleTouchMove, { passive: false });
  window.addEventListener('touchend', handleTouchEnd);
  window.addEventListener('touchcancel', handleTouchCancel);
}

function startTouchDrag(card, touch) {
  // IMPORTANTE: medir el tamaño real de la tarjeta ANTES de aplicar cualquier
  // clase o transformación. Si se mide después, un transform: scale() activo
  // (por :active u otras transiciones táctiles) congelaría un tamaño reducido
  // en el clon y se vería "pequeñito".
  const rect = card.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;

  touchOffsetLeft = touch.clientX - rect.left;
  touchOffsetTop = touch.clientY - rect.top;

  card.classList.add('touch-dragging');
  document.body.classList.add('dragging-active');

  // Haptic feedback if supported
  if (navigator.vibrate) {
    navigator.vibrate(50);
  }

  // Create ghost con el tamaño real medido arriba
  touchGhost = card.cloneNode(true);
  touchGhost.id = 'drag-ghost';
  touchGhost.style.position = 'fixed';
  touchGhost.style.boxSizing = 'border-box';
  touchGhost.style.margin = '0';
  touchGhost.style.width = `${width}px`;
  touchGhost.style.height = `${height}px`;
  touchGhost.style.left = `${rect.left}px`;
  touchGhost.style.top = `${rect.top}px`;
  touchGhost.style.zIndex = '9999';
  touchGhost.style.pointerEvents = 'none';
  touchGhost.style.opacity = '0.9';
  touchGhost.style.transform = 'scale(1.05)';
  touchGhost.style.transformOrigin = 'center center';
  touchGhost.style.transition = 'none';
  touchGhost.style.boxShadow = '0 10px 25px rgba(0,0,0,0.15), 0 4px 10px rgba(0,0,0,0.08)';

  document.body.appendChild(touchGhost);
}

function handleTouchMove(e) {
  if (e.touches.length !== 1) return;
  const touch = e.touches[0];
  lastTouchX = touch.clientX;
  lastTouchY = touch.clientY;

  if (!isTouchDragging) {
    // Check if we moved too far to cancel the long-press
    const dx = touch.clientX - touchStartClientX;
    const dy = touch.clientY - touchStartClientY;
    if (Math.sqrt(dx * dx + dy * dy) > 10) {
      clearTouchTimeout();
      cleanupGlobalTouchListeners();
    }
    return;
  }

  // If dragging, prevent browser scrolling
  e.preventDefault();

  // Position ghost
  if (touchGhost) {
    touchGhost.style.left = `${touch.clientX - touchOffsetLeft}px`;
    touchGhost.style.top = `${touch.clientY - touchOffsetTop}px`;
  }

  // En móvil: si arrastra desde el maletín y sale del panel, cerrarlo automáticamente
  if (isMobile() && touchDraggedSourceDate === '') {
    const drawer = document.getElementById('briefcase-drawer');
    if (drawer && !drawer.classList.contains('closed')) {
      const drawerRect = drawer.getBoundingClientRect();
      const outsideDrawer = touch.clientX < drawerRect.left || touch.clientX > drawerRect.right ||
                            touch.clientY < drawerRect.top  || touch.clientY > drawerRect.bottom;
      if (outsideDrawer) {
        drawer.classList.add('closed');
        const btn = document.getElementById('briefcase-btn');
        if (btn) btn.classList.remove('active-briefcase');
        const mobileBackdrop = document.getElementById('briefcase-mobile-backdrop');
        if (mobileBackdrop) mobileBackdrop.classList.add('hidden');
      }
    }
  }

  // Update target column and reordering indicators
  updateDragTarget(touch.clientX, touch.clientY);

  // Edge-slide horizontal en móvil: detectar zona de borde izquierdo/derecho
  if (isMobile()) {
    const grid = document.querySelector('.planner-grid');
    if (grid) {
      const gridRect = grid.getBoundingClientRect();
      const EDGE_ZONE = 56; // px desde el borde que activa el slide
      const inLeftEdge  = touch.clientX >= gridRect.left  && touch.clientX < gridRect.left  + EDGE_ZONE;
      const inRightEdge = touch.clientX > gridRect.right  - EDGE_ZONE && touch.clientX <= gridRect.right;
      const newDir = inLeftEdge ? -1 : inRightEdge ? 1 : 0;

      if (newDir !== 0 && !touchEdgeSlideCooldown) {
        // Mostrar indicador visual
        showEdgeIndicator(newDir);
        if (touchEdgeSlideDir !== newDir) {
          // Cambió de dirección o entró a zona — reiniciar timer
          clearEdgeScrollTimer();
          touchEdgeSlideDir = newDir;
          touchEdgeSlideTimeout = setTimeout(() => {
            triggerEdgeDaySlide(newDir);
          }, 300); // 300 ms para activar
        }
      } else {
        // Fuera de zona de borde — cancelar
        clearEdgeScrollTimer();
        hideEdgeIndicator();
      }
    }

    // Auto-scroll VERTICAL: si el dedo se acerca al borde superior/inferior del
    // listado de tareas del dia, scrollear ese listado para poder ver y soltar
    // tareas que estan fuera de la pantalla.
    updateVerticalAutoScroll(touch.clientX, touch.clientY);
  }
}

// Mientras se arrastra en movil, si el dedo entra en la franja superior o
// inferior del .tasks-container que esta bajo el, lo scrolleamos de forma
// continua. La velocidad aumenta cuanto mas cerca del borde este el dedo.
function updateVerticalAutoScroll(clientX, clientY) {
  let container = null;
  if (touchGhost) touchGhost.style.display = 'none';
  const elAtPoint = document.elementFromPoint(clientX, clientY);
  if (touchGhost) touchGhost.style.display = '';
  if (elAtPoint) {
    const dayCol = elAtPoint.closest('.day-column');
    if (dayCol) container = dayCol.querySelector('.tasks-container');
  }

  if (!container) {
    stopVerticalAutoScroll();
    return;
  }

  const rect = container.getBoundingClientRect();
  const EDGE = 64;
  const MAX_SPEED = 14;

  let speed = 0;
  if (clientY < rect.top + EDGE) {
    const intensity = Math.min(1, (rect.top + EDGE - clientY) / EDGE);
    speed = -MAX_SPEED * intensity;
  } else if (clientY > rect.bottom - EDGE) {
    const intensity = Math.min(1, (clientY - (rect.bottom - EDGE)) / EDGE);
    speed = MAX_SPEED * intensity;
  }

  if (speed === 0) {
    stopVerticalAutoScroll();
    return;
  }

  verticalAutoScrollTarget = container;
  verticalAutoScrollSpeed = speed;
  if (!verticalAutoScrollInterval) {
    verticalAutoScrollInterval = setInterval(() => {
      if (!verticalAutoScrollTarget) return;
      verticalAutoScrollTarget.scrollTop += verticalAutoScrollSpeed;
      if (lastTouchX != null && lastTouchY != null) {
        updateDragTarget(lastTouchX, lastTouchY);
      }
    }, 16);
  }
}

function stopVerticalAutoScroll() {
  if (verticalAutoScrollInterval) {
    clearInterval(verticalAutoScrollInterval);
    verticalAutoScrollInterval = null;
  }
  verticalAutoScrollTarget = null;
  verticalAutoScrollSpeed = 0;
}

function updateDragTarget(clientX, clientY) {
  // Hide ghost temporarily to get actual element under the touch
  let ghostDisplay = '';
  if (touchGhost) {
    ghostDisplay = touchGhost.style.display;
    touchGhost.style.display = 'none';
  }

  const element = document.elementFromPoint(clientX, clientY);

  if (touchGhost) {
    touchGhost.style.display = ghostDisplay;
  }

  const column = element ? element.closest('.day-column') : null;
  const overBriefcase = element ? element.closest('#briefcase-btn') : null;
  const overTrash = element ? element.closest('#trash-btn') : null;
  const overBriefcaseContainer = element ? element.closest('#briefcase-tasks-container') : null;

  // Clear hover effects
  document.querySelectorAll('.day-column').forEach(col => col.classList.remove('drag-over'));
  document.querySelectorAll('.task-card').forEach(c => {
    c.classList.remove('drag-after-indicator', 'drag-before-indicator');
  });
  const briefcaseBtn = document.getElementById('briefcase-btn');
  if (briefcaseBtn) {
    briefcaseBtn.classList.remove('drag-over');
  }
  const trashBtn = document.getElementById('trash-btn');
  if (trashBtn) {
    trashBtn.classList.remove('drag-over');
  }
  if (overBriefcase) {
    overBriefcase.classList.add('drag-over');
    isOverBriefcaseTarget = true;
    isOverTrashTarget = false;
    lastTargetColumn = null;
    isOverCompletedSection = false;
  } else if (overTrash) {
    overTrash.classList.add('drag-over');
    isOverTrashTarget = true;
    isOverBriefcaseTarget = false;
    lastTargetColumn = null;
    isOverCompletedSection = false;
  } else if (overBriefcaseContainer && touchDraggedSourceDate === '') {
    // Reordering within the briefcase panel
    isOverBriefcaseTarget = false;
    isOverTrashTarget = false;
    lastTargetColumn = null;
    isOverBriefcaseContainer = true;
    isOverCompletedSection = false;

    const afterElement = getDragAfterElement(overBriefcaseContainer, clientY);
    if (afterElement) {
      afterElement.classList.add('drag-before-indicator');
    } else {
      const cards = overBriefcaseContainer.querySelectorAll('.task-card:not(.touch-dragging)');
      if (cards.length > 0) {
        cards[cards.length - 1].classList.add('drag-after-indicator');
      }
    }
  } else {
    isOverBriefcaseTarget = false;
    isOverTrashTarget = false;
    isOverBriefcaseContainer = false;
    if (column) {
      column.classList.add('drag-over');
      lastTargetColumn = column;
      isOverCompletedSection = false;

      const container = column.querySelector('.tasks-container');
      const draggedTask = tasks.find(t => t.id === touchDraggedTaskId);

      // Si la tarea arrastrada es una completada del MISMO dia y el dedo esta
      // sobre la seccion de completadas (expandida), mostrar el indicador entre
      // las completadas para reordenarlas, igual que en escritorio.
      const completedContainer = column.querySelector('.completed-tasks-container');
      const draggedIsCompletedHere = draggedTask && ((draggedTask.recurrence && draggedTask.recurrence.enabled)
        ? !!(draggedTask.completedOccurrences && draggedTask.completedOccurrences.includes(touchDraggedSourceDate))
        : !!draggedTask.completed);
      if (completedContainer
          && completedContainer.offsetParent !== null
          && draggedIsCompletedHere
          && touchDraggedSourceDate === column.dataset.date
          && elementContainsPointY(completedContainer, clientY)) {
        isOverCompletedSection = true;
        const afterElement = getDragAfterElementCompleted(completedContainer, clientY);
        if (afterElement) {
          afterElement.classList.add('drag-before-indicator');
        } else {
          const cards = completedContainer.querySelectorAll('.task-card.completed:not(.touch-dragging)');
          if (cards.length > 0) {
            cards[cards.length - 1].classList.add('drag-after-indicator');
          }
        }
      } else if (container && draggedTask) {
        // Mostrar el indicador de inserción para cualquier tarea pendiente.
        // (Antes se excluían las tareas con startTime, pero las horas ahora
        // viven en la descripción y todas deben poder reordenarse a mano.)
        const afterElement = getDragAfterElement(container, clientY);
        if (afterElement) {
          afterElement.classList.add('drag-before-indicator');
        } else {
          const cards = container.querySelectorAll('.task-card:not(.completed):not(.touch-dragging)');
          if (cards.length > 0) {
            cards[cards.length - 1].classList.add('drag-after-indicator');
          }
        }
      }
    } else {
      lastTargetColumn = null;
      isOverCompletedSection = false;
    }
  }
}

function handleTouchEnd(e) {
  clearTouchTimeout();
  stopAutoScroll();

  if (isTouchDragging) {
    e.preventDefault();
    preventClick = true;
    setTimeout(() => { preventClick = false; }, 100);

    // Perform drop
    if (isOverBriefcaseContainer && touchDraggedTaskId && touchDraggedSourceDate === '') {
      // Reorder within the briefcase panel
      const bContainer = document.getElementById('briefcase-tasks-container');
      reorderBriefcaseTask(touchDraggedTaskId, bContainer, lastTouchY);
    } else if (isOverBriefcaseTarget && touchDraggedTaskId) {
      moveTaskToBriefcase(touchDraggedTaskId, null, touchDraggedSourceDate);
      // Reopen briefcase drawer if it was dragged from briefcase and dropped back on briefcase
      if (touchDraggedSourceDate === "") {
        toggleBriefcaseDrawer();
      }
    } else if (isOverTrashTarget && touchDraggedTaskId) {
      deleteTask(touchDraggedTaskId, touchDraggedSourceDate);
    } else if (touchDraggedTaskId) {
      // Recalcular la columna REAL bajo el dedo en el momento de soltar.
      // Tras un cambio de dia (edge-slide) lastTargetColumn puede estar
      // desactualizado, asi que preferimos detectar la columna actual aqui.
      let dropColumn = null;
      if (touchGhost) touchGhost.style.display = 'none';
      const elAtPoint = document.elementFromPoint(lastTouchX, lastTouchY);
      if (touchGhost) touchGhost.style.display = '';

      // ¿Se soltó sobre una columna del HORARIO (cronograma)? Entonces se coloca
      // ahí con snap de 30 min y duración por defecto/propia (igual que en
      // escritorio). Esto permite arrastrar tareas del maletín al horario en móvil.
      const crCol = elAtPoint ? elAtPoint.closest('.cr-day-col') : null;
      if (crCol) {
        dropTaskOnCronograma(touchDraggedTaskId, crCol, lastTouchY, false);
        cleanupDraggingUI();
        cleanupGlobalTouchListeners();
        return;
      }

      if (elAtPoint) dropColumn = elAtPoint.closest('.day-column');
      if (!dropColumn) dropColumn = lastTargetColumn;

      if (dropColumn) {
        const targetDateStr = dropColumn.dataset.date;
        const container = dropColumn.querySelector('.tasks-container');
        // Reordenar dentro de la seccion de completadas si el dedo estaba sobre
        // ella (misma fecha, tarea completada). Si no, mover normalmente.
        const completedContainer = dropColumn.querySelector('.completed-tasks-container');
        if (isOverCompletedSection
            && completedContainer
            && touchDraggedSourceDate === targetDateStr) {
          const afterEl = getDragAfterElementCompleted(completedContainer, lastTouchY);
          reorderCompletedTask(touchDraggedTaskId, targetDateStr, afterEl ? afterEl.dataset.id : null);
        } else {
          moveTaskToDate(touchDraggedTaskId, touchDraggedSourceDate, targetDateStr, container, lastTouchY);
        }
      } else if (touchDraggedSourceDate === "") {
        toggleBriefcaseDrawer();
      }
    } else {
      // Dropped outside, reopen briefcase if it was dragged from briefcase
      if (touchDraggedSourceDate === "") {
        toggleBriefcaseDrawer();
      }
    }
  }

  cleanupDraggingUI();
  cleanupGlobalTouchListeners();
}

function handleTouchCancel(e) {
  // iOS (Safari) dispara touchcancel con facilidad durante un arrastre (al
  // confundirlo con scroll, long-press de seleccion, vista previa nativa,
  // etc.). Si ya estabamos arrastrando, NO abortamos: tratamos el cancel como
  // un "soltar" normal para que la tarea pueda colocarse donde esta el dedo.
  // Asi el usuario de iPhone puede reordenar aunque iOS cancele el gesto.
  if (isTouchDragging) {
    handleTouchEnd(e);
    return;
  }

  clearTouchTimeout();
  stopAutoScroll();
  cleanupDraggingUI();
  cleanupGlobalTouchListeners();

  // Reopen briefcase drawer if the drag was canceled and task was from briefcase
  if (touchDraggedSourceDate === "") {
    toggleBriefcaseDrawer();
  }
}

function clearTouchTimeout() {
  if (touchTimeout) {
    clearTimeout(touchTimeout);
    touchTimeout = null;
  }
}

function stopAutoScroll() {
  if (autoScrollInterval) {
    clearInterval(autoScrollInterval);
    autoScrollInterval = null;
  }
  stopVerticalAutoScroll();
  clearEdgeScrollTimer();
  hideEdgeIndicator();
  touchEdgeSlideCooldown = false;
}

// ── Edge-slide helpers (drag en borde horizontal móvil) ──────────────────────

function clearEdgeScrollTimer() {
  if (touchEdgeSlideTimeout) {
    clearTimeout(touchEdgeSlideTimeout);
    touchEdgeSlideTimeout = null;
  }
  touchEdgeSlideDir = 0;
}

function showEdgeIndicator(dir) {
  let indicator = document.getElementById('edge-slide-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'edge-slide-indicator';
    document.body.appendChild(indicator);
  }
  indicator.className = dir === -1 ? 'edge-left' : 'edge-right';
  indicator.style.display = 'flex';
}

function hideEdgeIndicator() {
  const indicator = document.getElementById('edge-slide-indicator');
  if (indicator) indicator.style.display = 'none';
}

function triggerEdgeDaySlide(dir) {
  clearEdgeScrollTimer();
  hideEdgeIndicator();

  // Cooldown para evitar slides múltiples en rápida sucesión
  touchEdgeSlideCooldown = true;
  setTimeout(() => { touchEdgeSlideCooldown = false; }, 500);

  const grid = document.querySelector('.planner-grid');
  if (!grid) return;

  // Calcular el día actualmente visible (el primer day card visible)
  const visibleDate = getMobileVisibleDate();
  if (!visibleDate) return;

  // Calcular la fecha destino
  const targetDate = addDays(visibleDate, dir);
  const targetDateStr = formatDate(targetDate);

  // ¿Ese día ya está en el DOM? Si estamos en una semana distinta, cambiar semana
  const targetEl = grid.querySelector(`.mobile-feed-day[data-date="${targetDateStr}"]`);

  if (targetEl) {
    // El día está en la misma semana — solo deslizar con smooth scroll
    grid.scrollTo({ left: targetEl.offsetLeft - 4, behavior: 'smooth' });

    // Dar feedback háptico
    if (navigator.vibrate) navigator.vibrate(30);

    // Actualizar label después del scroll
    setTimeout(() => updateWeekLabelFromScroll(), 350);

    // IMPORTANTE: tras el scroll, recalcular la columna destino bajo el dedo.
    // Si no, lastTargetColumn seguiria apuntando al dia anterior y al soltar
    // la tarea se moveria al dia equivocado (o no se aplicaria el cambio).
    setTimeout(() => updateDragTarget(lastTouchX, lastTouchY), 380);

  } else {
    // El día no está aún en el feed — expandir y scrollear
    if (navigator.vibrate) navigator.vibrate(30);

    expandMobileFeed(dir === 1 ? 'end' : 'start');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const newEl = grid.querySelector(`.mobile-feed-day[data-date="${targetDateStr}"]`);
        if (newEl) {
          grid.scrollLeft = newEl.offsetLeft - 4;
        }
        updateWeekLabelFromScroll();
        updateDragTarget(lastTouchX, lastTouchY);
      });
    });
  }
}

function cleanupDraggingUI() {
  if (touchGhost) {
    touchGhost.remove();
    touchGhost = null;
  }
  
  document.body.classList.remove('dragging-active');
  document.querySelectorAll('.day-column').forEach(col => col.classList.remove('drag-over'));
  document.querySelectorAll('.task-card').forEach(c => {
    c.classList.remove('touch-dragging', 'drag-before-indicator', 'drag-after-indicator');
  });

  const briefcaseBtn = document.getElementById('briefcase-btn');
  if (briefcaseBtn) {
    briefcaseBtn.classList.remove('drag-over');
  }
  isOverBriefcaseTarget = false;

  const trashBtn = document.getElementById('trash-btn');
  if (trashBtn) {
    trashBtn.classList.remove('drag-over');
  }
  isOverTrashTarget = false;

  isOverBriefcaseContainer = false;
  isOverCompletedSection = false;
  lastTargetColumn = null;
}

function cleanupGlobalTouchListeners() {
  window.removeEventListener('touchmove', handleTouchMove);
  window.removeEventListener('touchend', handleTouchEnd);
  window.removeEventListener('touchcancel', handleTouchCancel);
}

// --- Modals Setup & Actions ---

// Interruptor para mostrar el panel de bienvenida. Desactivado temporalmente
// (escritorio y movil) hasta decidir reincorporarlo. Para reactivarlo, poner
// WELCOME_MODAL_ENABLED = true.
const WELCOME_MODAL_ENABLED = false;

function showWelcomeModal() {
  if (!WELCOME_MODAL_ENABLED) return;
  const modal = document.getElementById('welcome-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  document.getElementById('welcome-accept-btn').onclick = () => {
    if (document.getElementById('welcome-no-show').checked) {
      localStorage.setItem('welcome_dismissed_v2', 'true');
    }
    modal.classList.add('hidden');
  };
}


// ─── Checkbox de completado en el modal de tarea ──────────────────────────
// Determina si una tarea (su ocurrencia, si es recurrente) está completada.
// Fija el estado de completado de una tarea (su ocurrencia, si es recurrente) al
// valor `completed` indicado, sin los efectos secundarios de toggleTaskCompletion.
function applyPendingCompleteState(task, occurrenceDate, completed) {
  if (!task) return;
  if (task.recurrence && task.recurrence.enabled) {
    if (!Array.isArray(task.completedOccurrences)) task.completedOccurrences = [];
    const i = task.completedOccurrences.indexOf(occurrenceDate);
    if (completed && i === -1) task.completedOccurrences.push(occurrenceDate);
    if (!completed && i !== -1) task.completedOccurrences.splice(i, 1);
  } else {
    task.completed = !!completed;
  }
}

function isTaskCompletedForModal(task, occurrenceDate) {
  if (!task) return false;
  if (task.recurrence && task.recurrence.enabled) {
    return Array.isArray(task.completedOccurrences) &&
           task.completedOccurrences.includes(occurrenceDate);
  }
  return !!task.completed;
}

// Pinta el icono del checkbox del modal según el estado (mismo SVG que las tareas).
function renderTaskModalCheckbox(completed) {
  const btn = document.getElementById('task-complete-btn');
  if (!btn) return;
  // El botón nunca debe quedar oculto: su visibilidad la controla el wrapper
  // (#task-complete-wrapper). Quitamos cualquier .hidden heredada para que no
  // herede el display:none de la versión que vivía en el encabezado del modal.
  btn.classList.remove('hidden');
  btn.classList.toggle('is-checked', !!completed);
  btn.setAttribute('aria-pressed', completed ? 'true' : 'false');
  btn.title = completed ? 'Marcar como pendiente' : 'Marcar como completada';
  btn.innerHTML = completed
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="task-check-icon checked"><rect x="3" y="3" width="18" height="18" rx="5"/><polyline points="8 12.5 11 15.5 16.5 9"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="task-check-icon"><rect x="3" y="3" width="18" height="18" rx="5"/></svg>';
}

function openTaskModal(taskId = null, occurrenceDate = null) {
  const modal = document.getElementById('task-modal');
  const form = document.getElementById('task-form');
  const deleteBtn = document.getElementById('delete-task-btn');
  const modalTitle = document.getElementById('modal-task-title');
  
  form.reset();
  activeRecurrenceDays.clear();
  document.querySelectorAll('.day-toggle-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('recurrence-panel').classList.add('hidden');
  document.getElementById('recurrence-status-text').textContent = 'No';
  document.getElementById('duration-display').classList.add('hidden');

  const briefcaseCheckbox = document.getElementById('task-in-briefcase-checkbox');
  const dateInput = document.getElementById('task-input-date');
  const repeatToggle = document.getElementById('task-repeat-toggle');

  briefcaseCheckbox.checked = false;
  briefcaseCheckbox.disabled = false; // Reset to enabled by default
  dateInput.disabled = false;
  dateInput.required = true;
  repeatToggle.disabled = false;

  const alarmCheckbox = document.getElementById('task-alarm-checkbox');
  if (alarmCheckbox) alarmCheckbox.checked = false;

  // Estado inicial de los campos de hora (fin siempre habilitado, independiente).
  syncEndTimeEnabled();
  syncAlarmCheckboxState(); // estado inicial del icono de campana

  // Hide end recurrence sub-fields
  document.getElementById('repeat-end-date').classList.add('hidden');
  document.querySelector('.count-input-wrapper').classList.add('hidden');

  selectedTaskId = taskId;
  selectedOccurrenceDate = occurrenceDate;
  pendingCompleteState = null; // se recalcula desde la tarea al abrir

  if (selectedTaskId) {
    // EDIT MODE
    modalTitle.textContent = 'Editar tarea';
    deleteBtn.classList.remove('hidden');
    // Checkbox de completado: visible solo al editar una tarea existente.
    const completeWrapper = document.getElementById('task-complete-wrapper');
    if (completeWrapper) completeWrapper.classList.remove('hidden');

    const task = tasks.find(t => t.id === selectedTaskId);
    if (!task) return;

    renderTaskModalCheckbox(isTaskCompletedForModal(task, occurrenceDate || task.date));

    document.getElementById('task-input-title').value = task.title;
    document.getElementById('task-input-description').value = task.description || '';
    // Cargar hora de inicio/fin en sus campos y aplicar la regla (fin ⟸ inicio).
    const startEl = document.getElementById('task-input-start');
    const endEl = document.getElementById('task-input-end');
    if (startEl) startEl.value = task.startTime || '';
    if (endEl) endEl.value = task.endTime || '';
    syncEndTimeEnabled();
    setSelectTagValue(task.tagId);
    if (alarmCheckbox) alarmCheckbox.checked = !!task.alarm;
    syncAlarmCheckboxState(); // reflejar el estado en el icono de campana

    if (!task.date) {
      briefcaseCheckbox.checked = true;
      dateInput.value = '';
      dateInput.disabled = true;
      dateInput.required = false;
      repeatToggle.checked = false;
      repeatToggle.disabled = true;
    } else {
      briefcaseCheckbox.checked = false;
      dateInput.value = task.date;
      dateInput.disabled = false;
      dateInput.required = true;
      repeatToggle.disabled = false;
    }


    // Setup Recurrence
    if (task.recurrence && task.recurrence.enabled && task.date) {
      document.getElementById('task-repeat-toggle').checked = true;
      document.getElementById('recurrence-panel').classList.remove('hidden');
      document.getElementById('recurrence-status-text').textContent = 'Sí';

      const unit = task.recurrence.unit || 'weekly';
      const interval = unit === 'weekly' ? (task.recurrence.weeksInterval || 1) : (task.recurrence.interval || 1);
      
      document.getElementById('repeat-unit').value = unit;
      document.getElementById('repeat-interval').value = interval;

      if (unit === 'weekly') {
        document.getElementById('days-selector-group').classList.remove('hidden');
        if (task.recurrence.days) {
          task.recurrence.days.forEach(d => {
            activeRecurrenceDays.add(d);
            const dayBtn = document.querySelector(`.day-toggle-btn[data-day-value="${d}"]`);
            if (dayBtn) dayBtn.classList.add('active');
          });
        }
      } else {
        document.getElementById('days-selector-group').classList.add('hidden');
      }

      // Setup End
      const endRadio = document.querySelector(`input[name="recurrence-end"][value="${task.recurrence.endType}"]`);
      if (endRadio) {
        endRadio.checked = true;
        
        if (task.recurrence.endType === 'date') {
          const field = document.getElementById('repeat-end-date');
          field.classList.remove('hidden');
          field.value = task.recurrence.endDate || '';
        } else if (task.recurrence.endType === 'count') {
          const field = document.querySelector('.count-input-wrapper');
          field.classList.remove('hidden');
          document.getElementById('repeat-end-count').value = task.recurrence.endCount || 10;
        }
      }
    } else {
      document.getElementById('task-repeat-toggle').checked = false;
      document.getElementById('repeat-unit').value = 'weekly';
      document.getElementById('repeat-interval').value = 1;
      document.getElementById('days-selector-group').classList.remove('hidden');
    }
  } else {
    // NEW TASK MODE
    modalTitle.textContent = 'Nueva tarea';
    deleteBtn.classList.add('hidden');
    // Tarea nueva: aún no se puede completar; ocultar el checkbox.
    const completeWrapperNew = document.getElementById('task-complete-wrapper');
    if (completeWrapperNew) completeWrapperNew.classList.add('hidden');
    
    // Set date to clicked column date, or today
    if (selectedDayDate === null) {
      briefcaseCheckbox.checked = true;
      briefcaseCheckbox.disabled = true; // Lock task to archived when created from archived panel
      dateInput.value = '';
      dateInput.disabled = true;
      dateInput.required = false;
      repeatToggle.checked = false;
      repeatToggle.disabled = true;
    } else {
      briefcaseCheckbox.checked = false;
      dateInput.value = selectedDayDate;
      dateInput.disabled = false;
      dateInput.required = true;
      repeatToggle.disabled = false;
      repeatToggle.checked = false;
    }
    // Horas predefinidas al crear desde un hueco del horario (entre 2 tareas).
    if (prefilledTimes) {
      const startEl = document.getElementById('task-input-start');
      const endEl = document.getElementById('task-input-end');
      if (startEl) startEl.value = prefilledTimes.start || '';
      if (endEl) endEl.value = prefilledTimes.end || '';
      syncEndTimeEnabled();
      updateDurationDisplay();
    }
    setSelectTagValue('default');
    document.getElementById('repeat-unit').value = 'weekly';
    document.getElementById('repeat-interval').value = 1;
    document.getElementById('days-selector-group').classList.remove('hidden');
  }

  // Show Modal
  modal.classList.remove('hidden');
  updateRecurrenceHint();
  syncAlarmCheckboxState(); // habilita/atenúa la alarma según haya hora de inicio
  if (!selectedTaskId) {
    const titleEl = document.getElementById('task-input-title');
    titleEl.focus();
    // En el modo Línea de tiempo el modal se abre desde un `pointerdown`; el `mouseup`/
    // `click` que le sigue puede robar el foco recién puesto. Reaplicamos el foco
    // tras finalizar el gesto para que se pueda escribir el título de inmediato,
    // igual que en la lista de tareas. Dos respaldos (rAF y un timeout breve) cubren los
    // distintos momentos en que puede llegar el mouseup.
    const refocusTitle = () => {
      if (!document.getElementById('task-modal').classList.contains('hidden')
          && document.activeElement !== titleEl) {
        titleEl.focus();
      }
    };
    requestAnimationFrame(refocusTitle);
    setTimeout(refocusTitle, 60);
  }
}

function closeTaskModal() {
  document.getElementById('task-modal').classList.add('hidden');
  selectedTaskId = null;
  selectedDayDate = null;
  prefilledTimes = null;
}

// ─── Edicion de tareas recurrentes: alcance del cambio ───────────────────────
let pendingEditFormData = null;
let pendingEditTaskId = null;
let pendingEditOccurrenceDate = null;

// Contexto pendiente para el aviso de tareas adyacentes (horario coincidente).
let pendingAdjacent = null; // { formData, taskId, occurrenceDate, affectations }

// Estado de completado elegido en el modal de tarea, PENDIENTE de guardar. Es
// null si el usuario no tocó el checkbox; true/false si lo marcó/desmarcó. Solo
// se aplica a la tarea cuando se hace click en Guardar (submit del formulario).
let pendingCompleteState = null;

function openEditRecurringModal() {
  const modal = document.getElementById('edit-recurring-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeEditRecurringModal() {
  const modal = document.getElementById('edit-recurring-modal');
  if (modal) modal.classList.add('hidden');
  pendingEditFormData = null;
  pendingEditTaskId = null;
  pendingEditOccurrenceDate = null;
}

// ─── Aviso de tareas adyacentes (horario coincidente) ─────────────────────
function openAdjacentTasksModal(affectations) {
  const modal = document.getElementById('adjacent-tasks-modal');
  if (!modal) return;
  const n = affectations.length;
  const label = document.getElementById('adjacent-tasks-count-label');
  if (label) label.textContent = n === 1 ? 'otra tarea' : `otras ${n} tareas`;
  const list = document.getElementById('adjacent-tasks-list');
  if (list) {
    list.innerHTML = affectations.map(aff => {
      const t = aff.task;
      const titulo = (t && t.title) ? t.title : 'Tarea sin título';
      const accion = aff.edge === 'start'
        ? `su hora de inicio pasaría a ${aff.newTime}`
        : `su hora de fin pasaría a ${aff.newTime}`;
      return `• <strong style="color:var(--text-main);font-weight:600;">${escapeHtmlAdj(titulo)}</strong> — ${accion}`;
    }).join('<br>');
  }
  modal.classList.remove('hidden');
}

function closeAdjacentTasksModal() {
  const modal = document.getElementById('adjacent-tasks-modal');
  if (modal) modal.classList.add('hidden');
  pendingAdjacent = null;
}

// Escape mínimo para insertar títulos de tarea en el aviso de forma segura.
function escapeHtmlAdj(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Aplica los cambios del formulario de tarea.
 *  scope: 'all'       -> modifica la tarea/serie completa (comportamiento normal)
 *         'only-this' -> separa la ocurrencia indicada como tarea independiente,
 *                        dejando la serie original intacta en los demas dias.
 */
function applyTaskChanges(scope, formData, taskId, occurrenceDate) {
  let { title, description, tagId, isBriefcase, date,
          startTime, endTime, duration, recurrence, alarm } = formData;

  // Si la tarea se guarda sin título, asignar uno automático. Esto cubre todos
  // los flujos de creación/edición (modo linea de tiempo y modo lista de tareas, escritorio y
  // móvil), ya que todos pasan por aquí.
  if (!title || !title.trim()) {
    title = 'Tarea sin título';
  } else {
    title = title.trim();
  }

  pushToUndoStack();

  if (taskId) {
    const idx = tasks.findIndex(t => t.id === taskId);
    if (idx !== -1) {
      const oldTask = tasks[idx];
      const dateChanged = oldTask.date !== date;

      if (scope === 'only-this' && oldTask.recurrence && oldTask.recurrence.enabled && occurrenceDate) {
        // Separar esta ocurrencia: excluirla de la serie y crear tarea independiente.
        if (!oldTask.recurrence.exceptions) oldTask.recurrence.exceptions = [];
        if (!oldTask.recurrence.exceptions.includes(occurrenceDate)) {
          oldTask.recurrence.exceptions.push(occurrenceDate);
        }
        const standaloneTask = {
          id: 'task-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          title, description, tagId,
          date: occurrenceDate,   // queda en el dia de la ocurrencia editada
          startTime, endTime, duration, alarm,
          recurrence: null
        };
        tasks.push(standaloneTask);
        adjustPositionForModifiedTime(standaloneTask);
      } else if (oldTask.recurrence && oldTask.recurrence.enabled && isBriefcase && occurrenceDate) {
        // Archivar solo esta ocurrencia (mover al maletin)
        if (!oldTask.recurrence.exceptions) oldTask.recurrence.exceptions = [];
        if (!oldTask.recurrence.exceptions.includes(occurrenceDate)) {
          oldTask.recurrence.exceptions.push(occurrenceDate);
        }
        const briefcaseTask = {
          id: 'task-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          title, description, tagId, date: '',
          startTime, endTime, duration, alarm, recurrence: null
        };
        const briefcaseTasks = tasks.filter(t => !t.date);
        const minPos = briefcaseTasks.reduce((min, t) => Math.min(min, t.position || 0), 0);
        briefcaseTask.position = minPos - 10;
        tasks.push(briefcaseTask);
      } else {
        // Edicion regular (toda la serie o tarea simple)
        tasks[idx] = {
          ...tasks[idx],
          title, description, tagId, date,
          startTime, endTime, duration, recurrence, alarm
        };
        // Aplicar el completado PENDIENTE elegido en el modal (si lo hubo).
        if (pendingCompleteState !== null) {
          applyPendingCompleteState(tasks[idx], occurrenceDate || tasks[idx].date, pendingCompleteState);
        }
        if (dateChanged || tasks[idx].position === undefined) {
          adjustPositionForModifiedTime(tasks[idx]);
        }
      }
    }
  } else {
    // CREAR NUEVA TAREA
    const newTask = {
      id: 'task-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      title, description, tagId, date,
      startTime, endTime, duration, recurrence, alarm
    };
    tasks.push(newTask);
    adjustPositionForModifiedTime(newTask);
  }

  saveTasksToStorage();
  renderWeeklyCalendar();
  if (typeof refreshAlarms === 'function') refreshAlarms();
}

function openDeleteTaskConfirmModal() {
  const m = document.getElementById('delete-task-confirm-modal');
  if (m) m.classList.remove('hidden');
}
function closeDeleteTaskConfirmModal() {
  const m = document.getElementById('delete-task-confirm-modal');
  if (m) m.classList.add('hidden');
}

function openConfirmModal(task, occurrenceDate) {
  const confirmModal = document.getElementById('confirm-modal');
  confirmModal.classList.remove('hidden');
}

function closeConfirmModal() {
  document.getElementById('confirm-modal').classList.add('hidden');
}

// La "Hora de fin" ya NO depende de la "Hora de inicio": se puede definir un fin
// sin inicio. Esta función deja el campo de fin siempre habilitado (se mantiene
// por compatibilidad con las llamadas existentes).
function syncEndTimeEnabled() {
  const endEl = document.getElementById('task-input-end');
  if (!endEl) return;
  endEl.disabled = false;
  endEl.style.opacity = '1';
  endEl.style.cursor = '';
}

// Duration Calculator
function updateDurationDisplay() {
  const start = document.getElementById('task-input-start').value;
  const end = document.getElementById('task-input-end').value;
  const display = document.getElementById('duration-display');
  const val = document.getElementById('duration-val');

  if (start && end) {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    
    let diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
    
    if (diffMinutes < 0) {
      diffMinutes += 24 * 60; // Termina al día siguiente (overnight)
    }

    val.style.color = 'var(--text-main)';
    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    
    let durStr = '';
    if (hours > 0) {
      durStr += `${hours}h`;
    }
    if (mins > 0) {
      durStr += `${mins}min`;
    }
    if (hours === 0 && mins === 0) {
      durStr = '0min';
    }

    val.textContent = durStr.trim();
    display.classList.remove('hidden');
  } else {
    display.classList.add('hidden');
  }
}

// Recurrence Hint Builder
function updateRecurrenceHint() {
  const hintEl = document.getElementById('recurrence-hint');
  if (!hintEl) return;

  const isRecurring = document.getElementById('task-repeat-toggle').checked;
  if (!isRecurring) {
    hintEl.textContent = '';
    return;
  }

  const unit = document.getElementById('repeat-unit').value;
  const interval = parseInt(document.getElementById('repeat-interval').value) || 1;
  const taskDateVal = document.getElementById('task-input-date').value;
  
  if (unit === 'weekly') {
    const days = Array.from(activeRecurrenceDays).sort((a, b) => a - b);
    if (days.length === 0) {
      hintEl.textContent = 'Selecciona al menos un día para repetir.';
      return;
    }
    const dayNames = {
      1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábado', 7: 'domingo'
    };
    const daysStr = days.map(d => dayNames[d]).join(', ');
    if (interval === 1) {
      hintEl.textContent = `Se repetirá todos los ${daysStr} de cada semana.`;
    } else {
      hintEl.textContent = `Se repetirá todos los ${daysStr} cada ${interval} semanas.`;
    }
  } else if (unit === 'monthly') {
    if (!taskDateVal) {
      hintEl.textContent = 'Selecciona una fecha para la tarea.';
      return;
    }
    const date = new Date(taskDateVal + 'T00:00:00');
    const dayOfMonth = date.getDate();
    if (interval === 1) {
      hintEl.textContent = `Se repetirá el día ${dayOfMonth} de cada mes.`;
    } else {
      hintEl.textContent = `Se repetirá el día ${dayOfMonth} cada ${interval} meses.`;
    }
  } else if (unit === 'yearly') {
    if (!taskDateVal) {
      hintEl.textContent = 'Selecciona una fecha para la tarea.';
      return;
    }
    const date = new Date(taskDateVal + 'T00:00:00');
    const dayOfMonth = date.getDate();
    const monthName = date.toLocaleDateString('es-ES', { month: 'long' });
    if (interval === 1) {
      hintEl.textContent = `Se repetirá el ${dayOfMonth} de ${capitalize(monthName)} cada año.`;
    } else {
      hintEl.textContent = `Se repetirá el ${dayOfMonth} de ${capitalize(monthName)} cada ${interval} años.`;
    }
  }
}

// --- Daily Notes Modal & Management ---

function openNotesModal(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const titleText = `Notas – ${formatSingleDate(date)}`;
  document.getElementById('notes-modal-title').textContent = titleText;
  
  const modal = document.getElementById('notes-modal');
  modal.dataset.date = dateStr;
  
  const notesTextarea = document.getElementById('notes-textarea');
  notesTextarea.value = notes[dateStr] || '';

  // El botón de plantilla vuelve a mostrarse al abrir la nota, pero solo si el
  // usuario tiene texto definido en su plantilla.
  const templateBtn = document.getElementById('notes-template-btn');
  if (templateBtn) templateBtn.style.display = (noteTemplate && noteTemplate.trim()) ? '' : 'none';

  modal.classList.remove('hidden');
  notesTextarea.focus();
}

function closeNotesModal() {
  document.getElementById('notes-modal').classList.add('hidden');
}

async function saveNotesToStorage() {
  if (!currentUser) return;
  const prefsCacheKey = 'prefs_cache_' + currentUser.id;
  
  let prefs = {};
  try {
    const cachedPrefs = localStorage.getItem(prefsCacheKey);
    if (cachedPrefs) prefs = JSON.parse(cachedPrefs);
  } catch (e) {}
  
  prefs.notes = notes;
  
  try {
    localStorage.setItem(prefsCacheKey, JSON.stringify(prefs));
  } catch (e) {}
  
  await savePreferences(prefs);
}

// ─── Plantilla de notas ──────────────────────────────────────────────────────
function openNoteTemplateModal() {
  const modal = document.getElementById('note-template-modal');
  const textarea = document.getElementById('note-template-textarea');
  if (!modal || !textarea) return;
  textarea.value = noteTemplate || '';
  modal.classList.remove('hidden');
  textarea.focus();
}

function closeNoteTemplateModal() {
  const modal = document.getElementById('note-template-modal');
  if (modal) modal.classList.add('hidden');
}

async function saveNoteTemplate() {
  const textarea = document.getElementById('note-template-textarea');
  if (textarea) noteTemplate = textarea.value;
  closeNoteTemplateModal();

  if (!currentUser) return;
  const prefsCacheKey = 'prefs_cache_' + currentUser.id;

  let prefs = {};
  try {
    const cachedPrefs = localStorage.getItem(prefsCacheKey);
    if (cachedPrefs) prefs = JSON.parse(cachedPrefs);
  } catch (e) {}

  prefs.noteTemplate = noteTemplate;

  try {
    localStorage.setItem(prefsCacheKey, JSON.stringify(prefs));
  } catch (e) {}

  await savePreferences(prefs);
}

// --- Copiar tareas del día como texto ---

let copyTextModalDate = null;

// Configuración del modal de copiado que el usuario define. Se persiste en las
// preferencias (Supabase + caché local) para recordarla entre sesiones.
let copyTextOptions = {
  includeCompleted: true,
  includePending: true,
  separate: true, // siempre se separan los grupos
  includeDate: false,
  includeDesc: false,
  includeNote: false,
};

function applyCopyOptionsToModal() {
  const map = {
    'copy-opt-completed': copyTextOptions.includeCompleted,
    'copy-opt-pending': copyTextOptions.includePending,
    'copy-opt-separate': copyTextOptions.separate,
    'copy-opt-date': copyTextOptions.includeDate,
    'copy-opt-desc': copyTextOptions.includeDesc,
    'copy-opt-note': copyTextOptions.includeNote,
  };
  Object.entries(map).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  });
}

// ─── Estadísticas Diarias ────────────────────────────────────────────────────
let currentDailyStatsDate = null;
let excludedStatsActivitiesMap = new Map();
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
          <button id="${prefix}-merge-btn" title="Combinar tareas" class="close-modal-btn" type="button">
            <img src="icons/merge.svg" alt="Combinar tareas" width="20" height="20">
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
      <div id="general-stats-habit-tag-row" class="general-stats-filters" style="display: none; padding: 8px 24px 0 24px; align-items: flex-end;">
        <div class="form-group" style="flex: 2; margin-bottom: 0; display: flex; flex-direction: column; gap: 4px;">
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
        <div class="form-group" style="flex: 1; margin-bottom: 0; display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; text-align: left;">Constancia</label>
          <div id="habit-streak-count" style="height: 38px; display: flex; align-items: center; justify-content: center; font-size: 15px; font-weight: 700; color: var(--text-main); border: 1px solid var(--border-light); border-radius: var(--radius-md); background: var(--bg-card);">0/0</div>
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
    } else if (unit === 'semanas') {
      labelText = `Sem ${idx + 1}`;
    } else if (unit === 'meses') {
      labelText = `Mes ${idx + 1}`;
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

          const segTip = `${group.displayName || group.name} · ${minutesToReadable(mins)}`;
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

// Actualiza el contador "completados / días transcurridos desde el primer
// completado" basándose en los días del rango filtrado. El denominador va desde
// el primer día completado (dentro del rango) hasta hoy, inclusivo.
function updateHabitStreakCount(dates) {
  const el = document.getElementById('habit-streak-count');
  if (!el) return;
  const todayStr = formatDate(new Date());
  let done = 0;
  let firstDone = null;
  dates.forEach(dStr => {
    if (dStr > todayStr) return; // no contar días futuros
    if (habitDoneOnDate(dStr)) {
      done++;
      if (!firstDone) firstDone = dStr; // dates viene en orden ascendente
    }
  });
  let total = 0;
  if (firstDone) {
    const a = new Date(firstDone + 'T12:00:00');
    const b = new Date(todayStr + 'T12:00:00');
    total = Math.round((b - a) / 86400000) + 1; // inclusivo
  }
  el.textContent = `${done}/${total}`;
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

      // Resolver fusión de actividades del día (recursiva): si esta actividad se
      // combinó en otra, sumamos en la actividad destino.
      let iter = 0;
      while (statsMergedActivities[`${dStr}_${tagId}`] && iter < 10) {
        tagId = statsMergedActivities[`${dStr}_${tagId}`];
        iter++;
      }

      const tag = tags.find(t => t.id === tagId) || tags.find(t => t.id === 'default');
      const name = tag ? tag.name : 'Por defecto';
      if (!grouped[tagId]) {
        grouped[tagId] = {
          name,
          displayName: name,
          minutes: 0,
          tagId: tagId,
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
      let name = originalName;
      const maxIterations = 10;
      let iter = 0;
      while (statsMergedTasks[`${dStr}_${name}`] && iter < maxIterations) {
        name = statsMergedTasks[`${dStr}_${name}`];
        iter++;
      }

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
  const excludedSet = getExcludedSetForDate(rangeKey);
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
      tooltip.style.top = `${e.clientY + window.scrollY - 28}px`;
      tooltip.style.transform = 'translateX(-50%)';
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

  // Ocultar/mostrar el botón de combinar si es un rango
  const mergeBtn = document.getElementById(prefix + '-merge-btn');
  if (mergeBtn) {
    if (dates.length > 1) {
      mergeBtn.style.display = 'none';
    } else {
      mergeBtn.style.display = '';
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
            renderDailyStatsPanel(panelEl, dateParam);
          } else {
            if (lineStatsActiveTags.length >= 3) {
              showCenterToast('Puedes seleccionar un máximo de 3 actividades.');
            } else {
              lineStatsActiveTags.push(group.name);
              renderDailyStatsPanel(panelEl, dateParam);
            }
          }
        } else {
          if (isExcluded) {
            excludedSet.delete(group.name);
          } else {
            excludedSet.add(group.name);
          }
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

function updatePeriodSelectOptions() {
  const periodSelect = document.getElementById('general-stats-period-select');
  if (!periodSelect) return;

  const currentVal = periodSelect.value;
  
  if (generalStatsChartType === 'barras-apiladas') {
    periodSelect.innerHTML = `
      <option value="semanal">Semanal</option>
      <option value="7dias">Últimos 7 días</option>
      <option value="personalizado">Personalizado</option>
    `;
    if (currentVal === '7dias' || currentVal === 'personalizado') {
      periodSelect.value = currentVal;
    } else {
      periodSelect.value = 'semanal';
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
      <option value="100dias">Últimos 100 días</option>
    `;
    periodSelect.value = '100dias';
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
      periodSelect.value = 'semanal';
      
      const curr = new Date(dateStr + 'T12:00:00');
      const day = curr.getDay();
      const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(curr.setDate(diff));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      
      generalStatsDateRange = {
        from: formatDate(monday),
        to: formatDate(sunday)
      };
    } else if (generalStatsChartType === 'lineal') {
      periodSelect.value = '10dias';
      
      const endDate = new Date(dateStr + 'T12:00:00');
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 9);
      
      generalStatsDateRange = {
        from: formatDate(startDate),
        to: formatDate(endDate)
      };
      
      // Reset active tags to let renderDailyStatsPanel select the top one dynamically
      lineStatsActiveTags = [];
      lineStatsNeedsAutoSelect = true;
    } else if (generalStatsChartType === 'habitos') {
      periodSelect.value = '100dias';

      const endDate = new Date(dateStr + 'T12:00:00');
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 99);

      generalStatsDateRange = {
        from: formatDate(startDate),
        to: formatDate(endDate)
      };

      // Etiqueta por defecto: la que más se repite (más días completados) en el rango.
      const topTag = topTagByCompletedDaysInRange(generalStatsDateRange.from, generalStatsDateRange.to);
      if (topTag) generalStatsHabitTag = topTag;
    } else if (generalStatsChartType === 'heatmap') {
      periodSelect.value = '12dias';

      const endDate = new Date(dateStr + 'T12:00:00');
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - 11);

      generalStatsDateRange = {
        from: formatDate(startDate),
        to: formatDate(endDate)
      };

      // Etiqueta por defecto: la de mayor duración acumulada en estos 12 días.
      const topTag = topTagByDurationInRange(generalStatsDateRange.from, generalStatsDateRange.to);
      if (topTag) generalStatsHabitTag = topTag;
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
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const from = new Date(today);
    from.setDate(from.getDate() - 9);
    generalStatsDateRange = {
      from: formatDate(from),
      to: formatDate(today)
    };
    renderGeneralStatsForRange();
  } else if (val === '7dias') {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    generalStatsDateRange = {
      from: formatDate(from),
      to: formatDate(today)
    };
    renderGeneralStatsForRange();
  } else if (val === '12dias' || val === '30dias' || val === '50dias' || val === '100dias') {
    const days = val === '12dias' ? 12 : (val === '50dias' ? 50 : (val === '100dias' ? 100 : 30));
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const from = new Date(today);
    from.setDate(from.getDate() - (days - 1));
    generalStatsDateRange = {
      from: formatDate(from),
      to: formatDate(today)
    };
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
  
  const allFields = ['start', 'end', 'duration'];
  const adjustedField = allFields.find(f => !customRangeQueue.includes(f));
  
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
  if (statsMergeBtn) statsMergeBtn.addEventListener('click', toggleStatsMergeMode);

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
  if (currentUser) {
    const prefsCacheKey = 'prefs_cache_' + currentUser.id;
    let prefs = {};
    try {
      const cached = localStorage.getItem(prefsCacheKey);
      if (cached) prefs = JSON.parse(cached);
    } catch(e) {}
    
    prefs.statsMergedTasks = statsMergedTasks;
    prefs.statsMergedActivities = statsMergedActivities;
    prefs.statsCustomColors = statsCustomColors;

    try {
      localStorage.setItem(prefsCacheKey, JSON.stringify(prefs));
    } catch(e) {}

    savePreferences(prefs);
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
    
    if (currentDailyStatsDate) {
      const prefix = `${currentDailyStatsDate}_`;
      Object.keys(statsMergedTasks).forEach(key => {
        if (key.startsWith(prefix)) {
          delete statsMergedTasks[key];
        }
      });
      // También deshacer las fusiones de actividades de este día.
      Object.keys(statsMergedActivities).forEach(key => {
        if (key.startsWith(prefix)) {
          delete statsMergedActivities[key];
        }
      });

      saveStatsMergePreferences();
      estadisticasDiarias(currentDailyStatsDate);
    }
  } else {
    // Activar modo combinación
    statsMergeModeActive = true;
    statsMergeFirstSelected = '';
    statsMergeFirstColor = null;
    statsMergeFirstName = '';
    mergeBtn.classList.add('active');
    
    // Quitar cualquier resaltado previo de fila
    getStatsEl('daily-stats-modal').querySelectorAll('.daily-stats-row').forEach(row => {
      row.classList.remove('merge-selected');
    });
  }
}

function handleStatsMergeClick(group, tr) {
  // En modo "Por actividad" la identidad del grupo es su tagId; en modo "Por
  // título" es el nombre/título. Así la fusión funciona en ambos modos.
  const byActivity = statsGroupBy === 'activity';
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
    if (byActivity) {
      statsMergedActivities[`${currentDailyStatsDate}_${groupKey}`] = statsMergeFirstSelected;
    } else {
      statsMergedTasks[`${currentDailyStatsDate}_${groupKey}`] = statsMergeFirstSelected;
    }

    // Fijar el color del primer grupo seleccionado como color personalizado del
    // grupo fusionado (keyed por NOMBRE, que es como lo lee el render), para que
    // no se reasigne un color aleatorio/distinto al recalcular.
    const firstColorKey = `${currentDailyStatsDate}_${statsMergeFirstName}`;
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
    if (currentDailyStatsDate) {
      estadisticasDiarias(currentDailyStatsDate);
    }
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
    if (opts.includeDate && (task.startTime || task.endTime)) {
      const timeStr = formatTaskTimeText(task);
      line = `${timeStr}. ${line}`;
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
    includeDesc: document.getElementById('copy-opt-desc').checked,
    includeNote: document.getElementById('copy-opt-note').checked,
  };

  // Recordar la configuración elegida para la próxima vez.
  copyTextOptions = { ...opts };
  saveCopyOptionsToStorage();

  const text = buildCopyText(copyTextModalDate, opts);

  const ok = await copyTextToClipboard(text);
  closeCopyTextModal();
  if (ok) {
    showHistoryNotification('Tareas copiadas al portapapeles', 'redo');
  } else {
    showHistoryNotification('No se pudo copiar al portapapeles', 'undo');
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
  renderTagsList();
  modal.classList.remove('hidden');
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

  const displayTags = getOrderedTagsForDisplay();

  displayTags.forEach(tag => {
    const item = document.createElement('div');
    item.className = 'tag-item';
    item.dataset.tagId = tag.id;

    // Handle de arrastre para reordenar (raton + tactil).
    // La etiqueta 'default' (Por defecto) queda fija arriba: sin handle, no se arrastra.
    // En modo alfabético no se permite arrastrar (la vista no es el orden real) ni se reserva espacio.
    if (!tagsSortAlphabetical) {
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


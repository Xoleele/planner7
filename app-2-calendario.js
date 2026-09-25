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
      const avatar = document.querySelector('.user-avatar');
      if (avatar) {
        avatar.querySelector('span').textContent = 'U';
        avatar.title = 'Perfil de usuario';
        avatar.classList.remove('active');
      }
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
      statsCustomColors = parsedPrefs.statsCustomColors || {};
      statsCustomNames = parsedPrefs.statsCustomNames || {};
      statsMergedTasks = parsedPrefs.statsMergedTasks || {};
      statsMergedActivities = parsedPrefs.statsMergedActivities || {};
      if (parsedPrefs.statsGroupBy) statsGroupBy = parsedPrefs.statsGroupBy;
      if (parsedPrefs.statsStatusFilter) statsStatusFilter = parsedPrefs.statsStatusFilter;
      if (parsedPrefs.statsColorMode) statsColorMode = parsedPrefs.statsColorMode;
      if (parsedPrefs.generalStatsChartType) generalStatsChartType = parsedPrefs.generalStatsChartType;
      if (parsedPrefs.copyOptions) copyTextOptions = { ...copyTextOptions, ...parsedPrefs.copyOptions };
      applyUserSettingsFromPrefs(parsedPrefs);
    }
  } catch (e) {
    console.warn('No se pudo leer el caché local de preferencias:', e);
  }

  const prefs = await loadPreferences();
  let activeTimerState = null;
  if (prefs) {
    notes = prefs.notes || {};
    noteTemplate = prefs.noteTemplate || '';
    statsCustomColors = prefs.statsCustomColors || {};
    statsCustomNames = prefs.statsCustomNames || {};
    statsMergedTasks = prefs.statsMergedTasks || {};
    statsMergedActivities = prefs.statsMergedActivities || {};
    if (prefs.statsGroupBy) statsGroupBy = prefs.statsGroupBy;
    if (prefs.statsStatusFilter) statsStatusFilter = prefs.statsStatusFilter;
    if (prefs.statsColorMode) statsColorMode = prefs.statsColorMode;
    if (prefs.generalStatsChartType) generalStatsChartType = prefs.generalStatsChartType;
    if (prefs.copyOptions) copyTextOptions = { ...copyTextOptions, ...prefs.copyOptions };
    applyUserSettingsFromPrefs(prefs);
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
    document.getElementById('week-range-label').textContent = formatSingleDate(visibleDate);
    // Si el horario está activo, mantenerlo sincronizado también en móvil. Sin
    // esto, cuando las tareas llegan de la nube DESPUÉS del primer render del
    // cronograma (carga asíncrona), el horario móvil se quedaba vacío porque
    // este return cortaba antes de re-renderizarlo.
    if (cronogramaActive) renderCronograma();
    return;
  }

  const monday = currentWeekStart;

  // Update week range label
  document.getElementById('week-range-label').textContent = formatWeekRange(monday);

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

// ─── Autocompletar tareas de hoy cuya hora de fin ya pasó ────────────────────
// Las tareas (o la ocurrencia de hoy de una recurrente) con hora de fin igual o
// menor a la hora actual se marcan como completadas solas. Cada ocurrencia se
// autocompleta UNA sola vez: se anota en task.autoCompleted[fecha] = horaFin, así
// si el usuario la desmarca a mano no se vuelve a marcar (salvo que cambie su
// hora de fin). Las tareas que cruzan medianoche (terminan mañana) se ignoran.
let autoCompleteTimer = null;

function autoCompletePastTasks() {
  if (!Array.isArray(tasks) || tasks.length === 0) return;
  // No tocar nada mientras el usuario arrastra una tarea; se reintenta luego.
  if (document.querySelector('.dragging')) return;

  const now = new Date();
  const todayStr = formatDate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let changed = false;

  tasks.forEach(task => {
    if (!task || !task.endTime || !task.date) return;
    if (!checkTaskOccurrence(task, now)) return;

    let endMin;
    if (task.startTime) {
      const range = getTaskTimeRange(task);
      if (!range || range.crossesMidnight) return;
      endMin = range.endMin;
    } else {
      endMin = hhmmToMinutes(task.endTime);
      if (endMin == null) return;
    }
    if (endMin > nowMin) return;

    // ¿Ya se autocompletó esta ocurrencia con esta misma hora de fin?
    const marks = (task.autoCompleted && typeof task.autoCompleted === 'object') ? task.autoCompleted : {};
    if (marks[todayStr] === task.endTime) return;

    const isRecurring = !!(task.recurrence && task.recurrence.enabled);
    const alreadyDone = isRecurring
      ? !!(task.completedOccurrences && task.completedOccurrences.includes(todayStr))
      : !!task.completed;

    // Anotar la marca (solo se conserva la de hoy para no acumular basura).
    task.autoCompleted = { [todayStr]: task.endTime };
    changed = true;
    if (alreadyDone) return;

    if (isRecurring) {
      if (!task.completedOccurrences) task.completedOccurrences = [];
      task.completedOccurrences.push(todayStr);
    } else {
      task.completed = true;
    }

    // Igual que al completar a mano: mandarla al final de las tareas del día.
    const others = tasks.filter(t => t.id !== task.id && checkTaskOccurrence(t, now));
    if (others.length > 0) {
      const positions = others.map(t => getEffectivePosition(t, todayStr));
      setEffectivePosition(task, todayStr, Math.max(...positions) + 10);
    }
  });

  if (!changed) return;
  saveTasksToStorage();
  renderWeeklyCalendar();
}

// Revisa ahora y luego cada 30 s (y al volver a la pestaña).
function startAutoCompleteClock() {
  autoCompletePastTasks();
  if (autoCompleteTimer) return;
  autoCompleteTimer = setInterval(autoCompletePastTasks, 30000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') autoCompletePastTasks();
  });
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
  startAutoCompleteClock();
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
  // Datepicker desplegable
  const datepicker = document.getElementById('custom-calendar-dropdown');
  if (datepicker && !datepicker.classList.contains('hidden')) return true;
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
      const label = document.getElementById('week-range-label');
      if (label) label.textContent = formatSingleDate(visibleDate);
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
  // En caso contrario, se redondea el punto del clic a la media hora hacia
  // abajo (15:58 → 15:30, 15:11 → 15:00).
  let startMin;
  if (prevEnd !== null && (clickMin - prevEnd) < 60) {
    startMin = prevEnd + GAP_MIN;
  } else {
    startMin = Math.floor(clickMin / CR_CREATE_SNAP_MIN) * CR_CREATE_SNAP_MIN;
  }

  // ── HORA DE FIN ────────────────────────────────────────────────────────────
  // Si existe una tarea siguiente y el hueco (inicio → inicio de la siguiente)
  // es menor o igual a 2 h, la nueva termina justo antes: inicio siguiente − GAP_MIN.
  // Si no, la duración por defecto elegida en Preferencias (15 min, 30 min o 1 h).
  let endMin;
  if (nextStart !== null && (nextStart - startMin) <= 120) {
    endMin = nextStart - GAP_MIN;
  } else {
    endMin = startMin + defaultTaskDurationMin;
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
// columna del horario. La hora de inicio se ajusta al múltiplo de CR_SNAP_MIN
// (10 min) más cercano. La duración es la que ya tenga la tarea (si tiene
// inicio+fin definidos) o, si no, la duración por defecto de Preferencias. `isCopy` crea un clon en lugar
// de mover. Funciona tanto para tareas del maletín (sin fecha) como del planner.
function dropTaskOnCronograma(taskId, colEl, clientY, isCopy) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;
  const dateStr = colEl.dataset.date;
  if (!dateStr) return;

  // Minuto del día ajustado al intervalo de desplazamiento más cercano.
  const rawMin = cronogramaClickToMinutes(colEl, clientY);
  let startMin = Math.round(rawMin / CR_SNAP_MIN) * CR_SNAP_MIN;
  startMin = Math.max(0, Math.min(1440 - CR_SNAP_MIN, startMin));

  // Duración: la que ya tenga la tarea (por horas inicio+fin, o por la duración
  // escrita en su descripción), o 1 h por defecto si no tiene ninguna.
  let durationMin = getTaskDurationMinutes(task);
  if (!durationMin || durationMin <= 0) durationMin = defaultTaskDurationMin;

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


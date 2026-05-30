/**
 * Minimalist Weekly Calendar Application Controller
 * Tech: Vanilla JS, Supabase (auth + database), HTML5 Drag & Drop
 */

// ─── Supabase setup (supabase-js loaded via CDN in index.html) ───────────────
const SUPABASE_URL = 'https://oewaoouxbswnoeqvctzr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ld2Fvb3V4YnN3bm9lcXZjdHpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NDE2NTQsImV4cCI6MjA5NTIxNzY1NH0.39r7oMVkcvt7zw4-TrucW8aVUvDK11uJxd-dC1Ujhxs';

function getAuthStorage() {
  try {
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return window.localStorage;
  } catch (e) {
    console.warn("localStorage is not available (e.g. running under file:// protocol). Falling back to MemoryStorage.");
    return {
      store: {},
      getItem(key) { return this.store[key] || null; },
      setItem(key, value) { this.store[key] = value; },
      removeItem(key) { delete this.store[key]; }
    };
  }
}

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: getAuthStorage(),
    persistSession: true,
    detectSessionInUrl: false
  }
});

// ─── Auth state ──────────────────────────────────────────────────────────────
let currentUser = null;
let eventListenersInitialized = false;
let intentionalLogout = false; // true solo cuando el usuario hace logout explícito

// ─── DB helpers ─────────────────────────────────────────────────────────────
async function loadTasks() {
  if (!currentUser) return [];
  const { data, error } = await sb.from('tasks').select('*').eq('user_id', currentUser.id);
  if (error) { console.error('loadTasks:', error); return []; }
  return (data || []).map(row => row.data);
}
async function saveTasks(taskList) {
  if (!currentUser) return;
  const rows = taskList.map(t => ({ id: t.id, user_id: currentUser.id, data: t }));

  // 1. Upsert current tasks
  if (rows.length > 0) {
    const { error } = await sb.from('tasks').upsert(rows, { onConflict: 'id' });
    if (error) { console.error('saveTasks (upsert):', error); return; }
  }

  // 2. Fetch all task IDs currently in the DB for this user
  const { data: dbRows, error: fetchError } = await sb.from('tasks').select('id').eq('user_id', currentUser.id);
  if (fetchError) { console.error('saveTasks (fetch ids):', fetchError); return; }

  // 3. Delete only the rows that are no longer in the local list
  const localIds = new Set(taskList.map(t => t.id));
  const toDelete = (dbRows || []).map(r => r.id).filter(id => !localIds.has(id));
  for (const id of toDelete) {
    const { error } = await sb.from('tasks').delete().eq('id', id).eq('user_id', currentUser.id);
    if (error) console.error('saveTasks (delete):', id, error);
  }
}
async function loadTags() {
  if (!currentUser) return null;
  const { data, error } = await sb.from('user_data').select('tags').eq('user_id', currentUser.id).maybeSingle();
  if (error) { console.error('loadTags:', error); return null; }
  return data?.tags ?? null;
}
async function saveTags(tagList) {
  if (!currentUser) return;
  const { error } = await sb.from('user_data').upsert({ user_id: currentUser.id, tags: tagList }, { onConflict: 'user_id' });
  if (error) console.error('saveTags:', error);
}
async function loadPreferences() {
  if (!currentUser) return {};
  const { data, error } = await sb.from('user_data').select('preferences').eq('user_id', currentUser.id).maybeSingle();
  if (error) { console.error('loadPreferences:', error); return {}; }
  return data?.preferences ?? {};
}
async function savePreferences(prefs) {
  if (!currentUser) return;
  const { error } = await sb.from('user_data').upsert({ user_id: currentUser.id, preferences: prefs }, { onConflict: 'user_id' });
  if (error) console.error('savePreferences:', error);
}

// ─── Auth Screen ─────────────────────────────────────────────────────────────
function showAuthScreen() {
  const existing = document.getElementById('auth-screen');
  if (existing) existing.remove();

  const screen = document.createElement('div');
  screen.id = 'auth-screen';
  screen.innerHTML = `
    <div class="auth-card">
      <div class="auth-logo">
        <img src="icons/logo svg.png" alt="Planner7" height="28" style="width: auto;">
      </div>
      <div class="auth-tabs">
        <button class="auth-tab active" data-tab="login">Iniciar sesión</button>
        <button class="auth-tab" data-tab="signup">Crear cuenta</button>
      </div>
      <form id="auth-login-form" class="auth-form">
        <div class="auth-field">
          <label>Correo electrónico</label>
          <input type="email" id="auth-login-email" placeholder="tu@email.com" required autocomplete="email">
        </div>
        <div class="auth-field">
          <label>Contraseña</label>
          <input type="password" id="auth-login-password" placeholder="••••••••" required autocomplete="current-password">
        </div>
        <div id="auth-login-error" class="auth-error hidden"></div>
        <button type="submit" class="auth-submit-btn" id="auth-login-btn"><span>Entrar</span></button>
      </form>
      <form id="auth-signup-form" class="auth-form hidden">
        <div class="auth-field">
          <label>Correo electrónico</label>
          <input type="email" id="auth-signup-email" placeholder="tu@email.com" required autocomplete="email">
        </div>
        <div class="auth-field">
          <label>Contraseña</label>
          <input type="password" id="auth-signup-password" placeholder="Mínimo 6 caracteres" required minlength="6">
        </div>
        <div class="auth-field">
          <label>Confirmar contraseña</label>
          <input type="password" id="auth-signup-confirm" placeholder="Repite la contraseña" required minlength="6">
        </div>
        <div id="auth-signup-error" class="auth-error hidden"></div>
        <div id="auth-signup-success" class="auth-success hidden"></div>
        <button type="submit" class="auth-submit-btn" id="auth-signup-btn"><span>Crear cuenta</span></button>
      </form>
    </div>
  `;
  document.body.appendChild(screen);

  // Tab switching
  screen.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      screen.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.getElementById('auth-login-form').classList.toggle('hidden', target !== 'login');
      document.getElementById('auth-signup-form').classList.toggle('hidden', target !== 'signup');
      document.getElementById('auth-login-error').classList.add('hidden');
      document.getElementById('auth-signup-error').classList.add('hidden');
      document.getElementById('auth-signup-success').classList.add('hidden');
    });
  });

  // Login
  document.getElementById('auth-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('auth-login-btn');
    const errorEl = document.getElementById('auth-login-error');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Entrando…';
    errorEl.classList.add('hidden');

    let errorObj = null;
    try {
      const { error } = await sb.auth.signInWithPassword({
        email: document.getElementById('auth-login-email').value.trim(),
        password: document.getElementById('auth-login-password').value
      });
      errorObj = error;
    } catch (err) {
      console.error(err);
      errorObj = { message: 'Error de conexión o seguridad. Si estás usando file://, abre la app mediante un servidor local (npm run dev).' };
    }

    if (errorObj) {
      errorEl.textContent = translateAuthError(errorObj.message);
      errorEl.classList.remove('hidden');
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Entrar';
    }
  });

  // Sign-up
  document.getElementById('auth-signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('auth-signup-btn');
    const errorEl = document.getElementById('auth-signup-error');
    const successEl = document.getElementById('auth-signup-success');
    const password = document.getElementById('auth-signup-password').value;
    const confirm = document.getElementById('auth-signup-confirm').value;
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');
    if (password !== confirm) {
      errorEl.textContent = 'Las contraseñas no coinciden.';
      errorEl.classList.remove('hidden');
      return;
    }
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Creando cuenta…';

    let errorObj = null;
    let signUpSuccess = false;
    try {
      const { error } = await sb.auth.signUp({
        email: document.getElementById('auth-signup-email').value.trim(),
        password
      });
      errorObj = error;
      signUpSuccess = !error;
    } catch (err) {
      console.error(err);
      errorObj = { message: 'Error de conexión o seguridad. Si estás usando file://, abre la app mediante un servidor local (npm run dev).' };
    }

    if (errorObj) {
      errorEl.textContent = translateAuthError(errorObj.message);
      errorEl.classList.remove('hidden');
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Crear cuenta';
    } else if (signUpSuccess) {
      successEl.textContent = '¡Cuenta creada! Revisa tu correo para confirmarla y luego inicia sesión.';
      successEl.classList.remove('hidden');
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Crear cuenta';
    }
  });
}

function hideAuthScreen() {
  const screen = document.getElementById('auth-screen');
  if (screen) {
    screen.classList.add('auth-screen-exit');
    setTimeout(() => screen.remove(), 300);
  }
}

function translateAuthError(msg) {
  const map = {
    'Invalid login credentials': 'Correo o contraseña incorrectos.',
    'Email not confirmed': 'Confirma tu correo antes de iniciar sesión.',
    'User already registered': 'Ya existe una cuenta con ese correo.',
    'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
  };
  return map[msg] || msg;
}

function setupUserMenu() {
  const avatar = document.querySelector('.user-avatar');
  if (!avatar || !currentUser) return;
  avatar.querySelector('span').textContent = (currentUser.email || 'U')[0].toUpperCase();
  avatar.title = currentUser.email;
  avatar.classList.add('active');

  avatar.addEventListener('click', (e) => {
    e.stopPropagation();
    let dropdown = document.getElementById('user-dropdown');
    if (dropdown) { dropdown.remove(); return; }
    dropdown = document.createElement('div');
    dropdown.id = 'user-dropdown';
    dropdown.innerHTML = `
      <div class="user-dropdown-email">${currentUser.email}</div>
      <hr class="user-dropdown-divider">
      <button id="change-password-btn" class="user-dropdown-item">
        <img src="icons/key.svg" alt="" width="14" height="14">
        Cambiar contraseña
      </button>
      <button id="export-data-btn" class="user-dropdown-item">
        <img src="icons/download.svg" alt="" width="14" height="14">
        Exportar datos
      </button>
      <button id="delete-account-btn" class="user-dropdown-item" style="color: #ff3b30;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
        Eliminar cuenta
      </button>
      <button id="logout-btn" class="user-dropdown-item">
        <img src="icons/log-out.svg" alt="" width="14" height="14">
        Cerrar sesión
      </button>
    `;
    avatar.appendChild(dropdown);
    
    document.getElementById('change-password-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.remove();
      openChangePasswordModal();
    });

    document.getElementById('export-data-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.remove();
      exportUserDataToCSV();
    });

    document.getElementById('delete-account-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.remove();
      openDeleteAccountModal();
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
      intentionalLogout = true;
      sb.auth.signOut();
    });
    setTimeout(() => {
      document.addEventListener('click', () => {
        const d = document.getElementById('user-dropdown');
        if (d) d.remove();
      }, { once: true });
    }, 0);
  });
}

function initializeEmptyCalendar() {
  if (!desktopGridHTML) {
    const grid = document.querySelector('.planner-grid');
    if (grid) {
      desktopGridHTML = grid.innerHTML;
    }
  }
  tags = [...INITIAL_TAGS];
  tasks = [];
  currentWeekStart = getMondayOf(new Date());
  if (!eventListenersInitialized) {
    setupEventListeners();
    buildColorPalette();
    eventListenersInitialized = true;
  }
  buildTagSelectorOptions();
  renderWeeklyCalendar();
  initMobileFeed();
}

// ─── Auth listener bootstrap ─────────────────────────────────────────────────
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    document.body.classList.remove('not-logged-in');
    hideAuthScreen();
    await startApp();
    setupUserMenu();
  } else {
    // Inicializar el calendario vacío con fechas correctas de fondo
    initializeEmptyCalendar();

    // Programar el modal de inicio de sesión tras el splash (1.5s splash + 0.7s de espera)
    setTimeout(() => {
      showAuthScreen();
    }, 2200);
  }
  sb.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      currentUser = session.user;
      document.body.classList.remove('not-logged-in');
      hideAuthScreen();
      await startApp();
      setupUserMenu();
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
  { bg: '#9e9e9e', text: '#ffffff', border: '#9e9e9e' },
  { bg: '#cccccc', text: '#ffffff', border: '#cccccc' }
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
let currentWeekStart = new Date(); // Monday of the currently viewed week
let selectedTaskId = null;
let selectedDayDate = null; // Used for pre-filling date on new task
let activeRecurrenceDays = new Set(); // Stores 1-7 representing days for recurrence
let selectedColorIndex = 0; // Index of selected color in the palette
let undoStack = []; // Pila para CTRL+Z
let redoStack = []; // Pila para CTRL+Y
let selectedOccurrenceDate = null; // Fecha específica de la ocurrencia seleccionada
let desktopGridHTML = null; // Caches the original desktop layout of .planner-grid
let completedTasksExpanded = false;
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
let touchTimeout = null;
let lastTouchX = null;
let lastTouchY = null;
let isTouchDragging = false;
let preventClick = false;
let isOverBriefcaseTarget = false; // Tracks if task is hovered over briefcase icon during touch drag
let isOverTrashTarget = false; // Tracks if task is hovered over trash icon during touch drag
let isOverBriefcaseContainer = false; // Tracks if briefcase task is being reordered within the panel




// --- Mobile State & View Toggle ---
function isMobile() {
  return document.documentElement.classList.contains('mobile-mode');
}

// Re-evaluar vista automáticamente al cambiar tamaño de ventana
window.addEventListener('resize', () => {
  const shouldBeMobile = window.innerWidth <= 768;
  const isCurrentlyMobile = document.documentElement.classList.contains('mobile-mode');
  if (shouldBeMobile !== isCurrentlyMobile) {
    document.documentElement.classList.toggle('mobile-mode', shouldBeMobile);
    if (shouldBeMobile) {
      mobileScrollInit = false;
      renderWeeklyCalendar();
      initMobileFeed();
    } else {
      mobileScrollInit = false;
      if (desktopGridHTML) {
        document.querySelector('.planner-grid').innerHTML = desktopGridHTML;
        setupDesktopColumns();
      }
      renderWeeklyCalendar();
    }
  }
});

// Shared task movement helper function
async function moveTaskToDate(taskId, sourceDateStr, targetDateStr, targetColumnContainer, clientY, isCopy = false) {
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return;

  pushToUndoStack();

  const originalTask = tasks[taskIndex];

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

    // Manejar posicionamiento del clon dentro del día
    if (clonedTask.startTime) {
      adjustPositionForModifiedTime(clonedTask);
    } else {
      const afterElement = getDragAfterElement(targetColumnContainer, clientY);
      const checkDate = new Date(targetDateStr + 'T00:00:00');
      const dayTasks = tasks.filter(t => checkTaskOccurrence(t, checkDate));
      
      dayTasks.sort((a, b) => (a.position || 0) - (b.position || 0));

      let insertIndex = dayTasks.length;
      if (afterElement) {
        const afterTaskId = afterElement.dataset.id;
        insertIndex = dayTasks.findIndex(t => t.id === afterTaskId);
        if (insertIndex === -1) insertIndex = dayTasks.length;
      }

      dayTasks.splice(insertIndex, 0, clonedTask);

      dayTasks.forEach((t, idx) => {
        t.position = idx * 10;
      });
    }

    tasks.push(clonedTask);
  } else {
    // FLUJO DE MOVIMIENTO (Comportamiento Original)
    const task = originalTask;
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

    // Handle positioning within the day
    if (task.startTime) {
      adjustPositionForModifiedTime(task);
    } else {
      const afterElement = getDragAfterElement(targetColumnContainer, clientY);
      const checkDate = new Date(targetDateStr + 'T00:00:00');
      const dayTasks = tasks.filter(t => checkTaskOccurrence(t, checkDate) && t.id !== task.id);
      
      dayTasks.sort((a, b) => (a.position || 0) - (b.position || 0));

      let insertIndex = dayTasks.length;
      if (afterElement) {
        const afterTaskId = afterElement.dataset.id;
        insertIndex = dayTasks.findIndex(t => t.id === afterTaskId);
        if (insertIndex === -1) insertIndex = dayTasks.length;
      }

      dayTasks.splice(insertIndex, 0, task);

      dayTasks.forEach((t, idx) => {
        t.position = idx * 10;
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

  setupDragAndDrop(targetWrapper);
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
    }
  } catch (e) {
    console.warn('No se pudo leer el caché local de preferencias:', e);
  }

  const prefs = await loadPreferences();
  if (prefs) {
    notes = prefs.notes || {};
    try {
      localStorage.setItem(prefsCacheKey, JSON.stringify(prefs));
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

  // Luego cargar desde Supabase y actualizar si hay datos más recientes
  if (hasPendingSync) {
    console.log('Sincronizando tareas locales pendientes con Supabase...');
    try {
      await saveTasks(tasks);
      localStorage.setItem(pendingSyncKey, 'false');
    } catch (e) {
      console.warn('No se pudo sincronizar las tareas locales al iniciar:', e);
    }
  } else {
    const storedTasks = await loadTasks();
    if (storedTasks.length > 0) {
      tasks = storedTasks;
      try {
        localStorage.setItem(cacheKey, JSON.stringify(tasks));
      } catch (e) {}
    }
  }
  // Si Supabase devuelve vacío pero el caché local tiene datos, los conservamos
  // (no pisamos tasks[] con un array vacío)

  // Ensure all tasks have position indices for sorting
  ensurePositions();
  renderWeeklyCalendar();
  initMobileFeed();
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
    } catch (e) {}
  }
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

async function saveTasksToStorage() {
  const pendingSyncKey = 'tasks_pending_sync_' + (currentUser ? currentUser.id : 'anon');
  // 1. Guardar localmente de inmediato (nunca falla, aunque no haya conexión)
  if (currentUser) {
    try {
      localStorage.setItem('tasks_cache_' + currentUser.id, JSON.stringify(tasks));
      localStorage.setItem(pendingSyncKey, 'true');
    } catch (e) {
      console.warn('No se pudo guardar en caché local:', e);
    }
  }
  // 2. Sincronizar con Supabase y esperar confirmación antes de continuar
  try {
    await saveTasks(tasks);
    if (currentUser) {
      localStorage.setItem(pendingSyncKey, 'false');
    }
  } catch (err) {
    console.warn('Sync con Supabase falló, cambios guardados localmente:', err);
  }
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

// Ensure all tasks have a defined position for sorting, grouping by date
async function ensurePositions() {
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

  const timedTasks = dayTasks.filter(t => t.startTime);

  let insertAfterTask = null;
  let insertBeforeTask = null;
  
  for (let i = 0; i < timedTasks.length; i++) {
    if (modifiedTask.startTime.localeCompare(timedTasks[i].startTime) >= 0) {
      insertAfterTask = timedTasks[i];
    } else {
      insertBeforeTask = timedTasks[i];
      break;
    }
  }

  const newList = [];
  let inserted = false;

  for (let i = 0; i < dayTasks.length; i++) {
    const current = dayTasks[i];
    
    if (insertBeforeTask && current.id === insertBeforeTask.id && !inserted) {
      newList.push(modifiedTask);
      inserted = true;
    }
    
    newList.push(current);
    
    if (insertAfterTask && current.id === insertAfterTask.id && !insertBeforeTask && !inserted) {
      newList.push(modifiedTask);
      inserted = true;
    }
  }

  if (!inserted) {
    if (insertBeforeTask) {
      newList.unshift(modifiedTask);
    } else {
      newList.push(modifiedTask);
    }
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
  const year = date.getFullYear();
  return `${capitalize(dayName)} ${day}/${month}/${year}`;
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
    const completedWrapper = document.createElement('div');
    completedWrapper.className = 'completed-tasks-wrapper' + (pendingTasks.length > 0 ? ' has-pending' : '');
    
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'completed-tasks-toggle';
    
    const isExpanded = completedTasksExpanded;
    if (isExpanded) {
      completedWrapper.classList.add('expanded');
    }
    
    toggleBtn.innerHTML = `
      <img src="icons/chevron-down.svg" alt="" width="12" height="12" class="completed-toggle-arrow ${isExpanded ? 'rotated' : ''}">
      <span class="completed-toggle-text">Completadas</span>
    `;
    
    const completedContainer = document.createElement('div');
    completedContainer.className = 'completed-tasks-container';
    if (!isExpanded) {
      completedContainer.style.display = 'none';
    }
    
    completedTasks.forEach(task => {
      const taskCard = createTaskCard(task, dateStr);
      completedContainer.appendChild(taskCard);
    });
    
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
    tasksContainer.appendChild(completedWrapper);
  }
}

function renderWeeklyCalendar(targetWrapper = document) {
  // En móvil, el feed continuo se gestiona por separado
  if (isMobile()) {
    if (mobileScrollInit) {
      updateMobileFeedTasks();
    }
    // Actualizar label de semana
    const visibleDate = getMobileVisibleDate() || new Date();
    document.getElementById('week-range-label').textContent = formatSingleDate(visibleDate);
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

    // Set dataset date attribute for drag-drop and adding tasks
    colElement.dataset.date = colDateStr;

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
    dayTasks.sort((a, b) => (a.position || 0) - (b.position || 0));

    // Render tasks
    renderTasksToContainer(dayTasks, tasksContainer, colDateStr);
  }
  renderBriefcaseTasks();
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

  // Description (if present)
  if (task.description && task.description.trim() !== '') {
    const desc = document.createElement('div');
    desc.className = 'task-card-desc';
    desc.textContent = task.description;
    card.appendChild(desc);
  }

  // Meta row (Time badges and recurrence indicator)
  const meta = document.createElement('div');
  meta.className = 'task-card-meta';

  if (task.startTime) {
    const timeBadge = document.createElement('span');
    timeBadge.className = 'task-time-badge';
    
    let timeText = task.startTime;
    if (task.endTime) {
      timeText += ` - ${task.endTime}`;
      
      // Calcular duración dinámicamente para mostrarla en la tarjeta
      const [startH, startM] = task.startTime.split(':').map(Number);
      const [endH, endM] = task.endTime.split(':').map(Number);
      let diff = (endH * 60 + endM) - (startH * 60 + startM);
      if (diff < 0) {
        diff += 24 * 60; // Termina al día siguiente (overnight)
      }
      const hours = Math.floor(diff / 60);
      const mins = diff % 60;
      let durStr = '';
      if (hours > 0) durStr += `${hours}h`;
      if (mins > 0) durStr += `${mins}min`;
      if (hours === 0 && mins === 0) durStr = '0min';
      
      timeText += ` (${durStr.trim()})`;
    }
    
    timeBadge.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="task-time-icon">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      <span>${timeText}</span>
    `;
    meta.appendChild(timeBadge);
  }



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

  checkBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // Disable interactions during transition to prevent double clicks
    card.style.pointerEvents = 'none';
    
    const isCurrentlyCompleted = card.classList.contains('completed');
    
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

          toggleTaskCompletion(task, occurrenceDate);

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
          toggleTaskCompletion(task, occurrenceDate);
        }
      } else {
        // FLIP inverso desmarcar: wrapper baja, tarea aparece desde arriba
        if (container) {
          const completedWrapper = container.querySelector('.completed-tasks-wrapper');
          const wrapperTopBefore = completedWrapper ? completedWrapper.getBoundingClientRect().top : null;

          toggleTaskCompletion(task, occurrenceDate);

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
          toggleTaskCompletion(task, occurrenceDate);
        }
      }
    }, 350);
  });

  card.appendChild(checkBtn);

  return card;
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

function setupDragAndDrop(targetWrapper = document) {
  const columns = targetWrapper.querySelectorAll('.day-column');

  columns.forEach(column => {
    const container = column.querySelector('.tasks-container');

    column.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
      column.classList.add('drag-over');

      // Visual feedback for reordering untimed tasks
      const draggedTask = tasks.find(t => t.id === draggedTaskId);
      if (draggedTask && !draggedTask.startTime) {
        // Clear previous indicators
        container.querySelectorAll('.task-card').forEach(card => {
          card.classList.remove('drag-after-indicator', 'drag-before-indicator');
        });

        const afterElement = getDragAfterElement(container, e.clientY);
        if (afterElement) {
          afterElement.classList.add('drag-before-indicator');
        } else {
          const cards = container.querySelectorAll('.task-card:not(.completed):not(.dragging)');
          if (cards.length > 0) {
            cards[cards.length - 1].classList.add('drag-after-indicator');
          }
        }
      }
    });

    column.addEventListener('dragleave', () => {
      column.classList.remove('drag-over');
      container.querySelectorAll('.task-card').forEach(card => {
        card.classList.remove('drag-after-indicator', 'drag-before-indicator');
      });
    });

    column.addEventListener('drop', (e) => {
      e.preventDefault();
      column.classList.remove('drag-over');
      
      // Clean indicators
      container.querySelectorAll('.task-card').forEach(card => {
        card.classList.remove('drag-after-indicator', 'drag-before-indicator');
      });

      const id = e.dataTransfer.getData('text/plain');
      const targetDateStr = column.dataset.date;
      
      if (!id || !targetDateStr) return;

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
  card.classList.add('touch-dragging');
  document.body.classList.add('dragging-active');
  
  // Haptic feedback if supported
  if (navigator.vibrate) {
    navigator.vibrate(50);
  }

  // Create ghost
  const rect = card.getBoundingClientRect();
  touchOffsetLeft = touch.clientX - rect.left;
  touchOffsetTop = touch.clientY - rect.top;

  touchGhost = card.cloneNode(true);
  touchGhost.id = 'drag-ghost';
  touchGhost.style.position = 'fixed';
  touchGhost.style.width = `${rect.width}px`;
  touchGhost.style.height = `${rect.height}px`;
  touchGhost.style.left = `${rect.left}px`;
  touchGhost.style.top = `${rect.top}px`;
  touchGhost.style.zIndex = '9999';
  touchGhost.style.pointerEvents = 'none';
  touchGhost.style.opacity = '0.9';
  touchGhost.style.transform = 'scale(1.05)';
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

  // Update target column and reordering indicators
  updateDragTarget(touch.clientX, touch.clientY);

  // Handle auto-scroll of .planner-grid
  const grid = document.querySelector('.planner-grid');
  if (grid) {
    const gridRect = grid.getBoundingClientRect();
    const topThreshold = gridRect.top + 60;
    const bottomThreshold = gridRect.bottom - 60;

    const inTopScrollZone = touch.clientY >= gridRect.top && touch.clientY < topThreshold;
    const inBottomScrollZone = touch.clientY > bottomThreshold && touch.clientY <= gridRect.bottom;

    if (inTopScrollZone || inBottomScrollZone) {
      if (!autoScrollInterval) {
        autoScrollInterval = setInterval(() => {
          if (lastTouchY !== null && lastTouchX !== null) {
            const gridEl = document.querySelector('.planner-grid');
            if (!gridEl) return;
            const r = gridEl.getBoundingClientRect();
            const topT = r.top + 60;
            const bottomT = r.bottom - 60;
            
            if (lastTouchY >= r.top && lastTouchY < topT) {
              const speed = Math.max(2, Math.min(15, (topT - lastTouchY) / 3));
              gridEl.scrollTop -= speed;
            } else if (lastTouchY > bottomT && lastTouchY <= r.bottom) {
              const speed = Math.max(2, Math.min(15, (lastTouchY - bottomT) / 3));
              gridEl.scrollTop += speed;
            } else {
              stopAutoScroll();
            }
            // Update target column after scroll shift
            updateDragTarget(lastTouchX, lastTouchY);
          }
        }, 30);
      }
    } else {
      stopAutoScroll();
    }
  }
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
  const overCalendarIcon = element ? element.closest('#briefcase-calendar-btn') : null;
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
  const calendarBtn = document.getElementById('briefcase-calendar-btn');
  if (calendarBtn) {
    calendarBtn.classList.remove('drag-over');
  }

  if (overBriefcase) {
    overBriefcase.classList.add('drag-over');
    isOverBriefcaseTarget = true;
    isOverTrashTarget = false;
    lastTargetColumn = null;
  } else if (overTrash) {
    overTrash.classList.add('drag-over');
    isOverTrashTarget = true;
    isOverBriefcaseTarget = false;
    lastTargetColumn = null;
  } else if (overCalendarIcon) {
    overCalendarIcon.classList.add('drag-over');
    isOverBriefcaseTarget = false;
    isOverTrashTarget = false;
    lastTargetColumn = null;
    
    // Close briefcase drawer immediately to allow dropping onto calendar
    if (navigator.vibrate) {
      navigator.vibrate(30);
    }
    const drawer = document.getElementById('briefcase-drawer');
    const mobileBackdrop = document.getElementById('briefcase-mobile-backdrop');
    const btn = document.getElementById('briefcase-btn');
    if (drawer && !drawer.classList.contains('closed')) {
      drawer.classList.add('closed');
      if (btn) btn.classList.remove('active-briefcase');
      if (mobileBackdrop) mobileBackdrop.classList.add('hidden');
    }
  } else if (overBriefcaseContainer && touchDraggedSourceDate === '') {
    // Reordering within the briefcase panel
    isOverBriefcaseTarget = false;
    isOverTrashTarget = false;
    lastTargetColumn = null;
    isOverBriefcaseContainer = true;

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

      const container = column.querySelector('.tasks-container');
      const draggedTask = tasks.find(t => t.id === touchDraggedTaskId);
      // Visual indicators only for untimed tasks reordering, similar to desktop
      if (container && draggedTask && !draggedTask.startTime) {
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
    } else if (lastTargetColumn && touchDraggedTaskId) {
      const targetDateStr = lastTargetColumn.dataset.date;
      const container = lastTargetColumn.querySelector('.tasks-container');

      // We pass the lastTouchY to determine position
      moveTaskToDate(touchDraggedTaskId, touchDraggedSourceDate, targetDateStr, container, lastTouchY);
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

  const calendarBtn = document.getElementById('briefcase-calendar-btn');
  if (calendarBtn) {
    calendarBtn.classList.remove('drag-over');
  }
  isOverBriefcaseContainer = false;
  lastTargetColumn = null;
}

function cleanupGlobalTouchListeners() {
  window.removeEventListener('touchmove', handleTouchMove);
  window.removeEventListener('touchend', handleTouchEnd);
  window.removeEventListener('touchcancel', handleTouchCancel);
}

// --- Modals Setup & Actions ---

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

  // Hide end recurrence sub-fields
  document.getElementById('repeat-end-date').classList.add('hidden');
  document.querySelector('.count-input-wrapper').classList.add('hidden');

  selectedTaskId = taskId;
  selectedOccurrenceDate = occurrenceDate;

  if (selectedTaskId) {
    // EDIT MODE
    modalTitle.textContent = 'Editar tarea';
    deleteBtn.classList.remove('hidden');

    const task = tasks.find(t => t.id === selectedTaskId);
    if (!task) return;

    document.getElementById('task-input-title').value = task.title;
    document.getElementById('task-input-description').value = task.description || '';
    setSelectTagValue(task.tagId);
    document.getElementById('task-input-start').value = task.startTime || '';
    document.getElementById('task-input-end').value = task.endTime || '';

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

    // Calculate duration display
    updateDurationDisplay();

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
    setSelectTagValue('default');
    document.getElementById('repeat-unit').value = 'weekly';
    document.getElementById('repeat-interval').value = 1;
    document.getElementById('days-selector-group').classList.remove('hidden');
  }

  // Show Modal
  modal.classList.remove('hidden');
  updateRecurrenceHint();
  if (!selectedTaskId) {
    document.getElementById('task-input-title').focus();
  }
}

function closeTaskModal() {
  document.getElementById('task-modal').classList.add('hidden');
  selectedTaskId = null;
  selectedDayDate = null;
}

function openConfirmModal(task, occurrenceDate) {
  const confirmModal = document.getElementById('confirm-modal');
  confirmModal.classList.remove('hidden');
}

function closeConfirmModal() {
  document.getElementById('confirm-modal').classList.add('hidden');
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
      'Etiqueta',
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
  resetTagForm();
  
  // Hide form and separator by default when opening
  document.getElementById('tag-form').classList.add('hidden');
  const separator = document.querySelector('.separator-line');
  if (separator) separator.classList.add('hidden');
  
  // Show "+ Nueva etiqueta" trigger button
  document.getElementById('add-tag-trigger-btn').classList.remove('hidden');

  renderTagsList();
  modal.classList.remove('hidden');
}

function closeTagsModal() {
  document.getElementById('tags-modal').classList.add('hidden');
}

function renderTagsList() {
  const container = document.getElementById('tags-list');
  container.innerHTML = '';

  tags.forEach(tag => {
    const item = document.createElement('div');
    item.className = 'tag-item';

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
    editBtn.title = 'Editar etiqueta';
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
      deleteBtn.title = 'Eliminar etiqueta';
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
}

function buildColorPalette() {
  const container = document.querySelector('.color-palette-grid');
  container.innerHTML = '';

  DEFAULT_COLORS.forEach((color, idx) => {
    const circle = document.createElement('div');
    circle.className = 'color-circle';
    circle.style.backgroundColor = color.bg;
    circle.style.borderColor = color.border;
    circle.dataset.index = idx;

    if (idx === selectedColorIndex) {
      circle.classList.add('selected');
    }

    circle.addEventListener('click', () => {
      document.querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));
      circle.classList.add('selected');
      selectedColorIndex = idx;
    });

    container.appendChild(circle);
  });
}

function startEditTag(tag) {
  document.getElementById('tag-edit-id').value = tag.id;
  document.getElementById('tag-input-name').value = tag.name;
  document.getElementById('tag-form-title').textContent = 'Editar etiqueta';
  document.getElementById('tag-submit-btn').textContent = 'Guardar';

  // Show form and separator, hide trigger button
  document.getElementById('tag-form').classList.remove('hidden');
  const separator = document.querySelector('.separator-line');
  if (separator) separator.classList.remove('hidden');
  document.getElementById('add-tag-trigger-btn').classList.add('hidden');

  // Select corresponding color index
  const colorIdx = DEFAULT_COLORS.findIndex(c => c.bg === tag.color.bg);
  if (colorIdx !== -1) {
    selectedColorIndex = colorIdx;
    buildColorPalette();
  }
}

function resetTagForm() {
  document.getElementById('tag-edit-id').value = '';
  document.getElementById('tag-input-name').value = '';
  document.getElementById('tag-form-title').textContent = 'Nueva etiqueta';
  document.getElementById('tag-submit-btn').textContent = 'Crear';
  
  // Hide form and separator, show trigger button
  document.getElementById('tag-form').classList.add('hidden');
  const separator = document.querySelector('.separator-line');
  if (separator) separator.classList.add('hidden');
  document.getElementById('add-tag-trigger-btn').classList.remove('hidden');

  selectedColorIndex = 0;
  buildColorPalette();
}

async function deleteTag(tagId) {
  if (tagId === 'default') return;

  pushToUndoStack();

  // Re-map tasks with this deleted tag to 'default' tag
  tasks = tasks.map(task => {
    if (task.tagId === tagId) {
      return { ...task, tagId: 'default' };
    }
    return task;
  });

  tags = tags.filter(t => t.id !== tagId);
  saveTagsToStorage();
  saveTasksToStorage();
  
  renderTagsList();
  buildTagSelectorOptions();
  renderWeeklyCalendar();
}

function setSelectTagValue(tagId) {
  const hiddenInput = document.getElementById('task-select-tag');
  if (hiddenInput) {
    hiddenInput.value = tagId;
  }
  
  // Update trigger UI
  const tag = tags.find(t => t.id === tagId) || tags.find(t => t.id === 'default');
  const trigger = document.getElementById('tag-select-trigger');
  if (trigger && tag) {
    const circle = trigger.querySelector('.custom-select-color-circle');
    const text = trigger.querySelector('.custom-select-trigger-text');
    if (circle) circle.style.backgroundColor = tag.color.bg;
    if (text) text.textContent = tag.name;
  }
}

function buildTagSelectorOptions() {
  const container = document.getElementById('tag-options-container');
  if (!container) return;
  container.innerHTML = '';

  tags.forEach(tag => {
    const option = document.createElement('div');
    option.className = 'custom-option';
    option.dataset.value = tag.id;
    
    const circle = document.createElement('span');
    circle.className = 'custom-select-color-circle';
    circle.style.backgroundColor = tag.color.bg;
    circle.style.borderColor = tag.color.border;

    const label = document.createElement('span');
    label.textContent = tag.name;

    option.appendChild(circle);
    option.appendChild(label);

    option.addEventListener('click', (e) => {
      e.stopPropagation();
      setSelectTagValue(tag.id);
      container.classList.add('hidden');
    });

    container.appendChild(option);
  });
}

// --- Custom Date Picker Dropdown ---
let datePickerCurrentMonth = new Date();

function toggleCustomDatePicker() {
  const dropdown = document.getElementById('custom-calendar-dropdown');
  if (!dropdown) return;
  const isHidden = dropdown.classList.contains('hidden');
  if (isHidden) {
    datePickerCurrentMonth = new Date(currentWeekStart);
    renderCustomDatePicker();
    dropdown.classList.remove('hidden');
    document.addEventListener('click', closeDatePickerOnOutsideClick);
  } else {
    dropdown.classList.add('hidden');
    document.removeEventListener('click', closeDatePickerOnOutsideClick);
  }
}

function closeDatePickerOnOutsideClick(e) {
  const dropdown = document.getElementById('custom-calendar-dropdown');
  const trigger = document.getElementById('datepicker-trigger');
  const label = document.getElementById('week-range-label');
  if (dropdown && !dropdown.contains(e.target) && trigger && !trigger.contains(e.target) && label && !label.contains(e.target)) {
    dropdown.classList.add('hidden');
    document.removeEventListener('click', closeDatePickerOnOutsideClick);
  }
}

function renderCustomDatePicker() {
  const container = document.getElementById('custom-calendar-days');
  const monthLabel = document.getElementById('custom-calendar-month-year');
  if (!container || !monthLabel) return;

  const year = datePickerCurrentMonth.getFullYear();
  const month = datePickerCurrentMonth.getMonth();

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  monthLabel.textContent = `${monthNames[month]} ${year}`;

  container.innerHTML = '';

  const firstDay = new Date(year, month, 1);
  let startDay = firstDay.getDay();
  startDay = startDay === 0 ? 6 : startDay - 1; // Mon = 0, Sun = 6

  const totalDays = new Date(year, month + 1, 0).getDate();
  const prevMonthTotalDays = new Date(year, month, 0).getDate();

  const mobileVisibleDate = isMobile() ? (getMobileVisibleDate() || new Date()) : null;

  // Prev month padding
  for (let i = startDay - 1; i >= 0; i--) {
    const dayNum = prevMonthTotalDays - i;
    const dayDiv = createDatePickerDayElement(dayNum, new Date(year, month - 1, dayNum), true, mobileVisibleDate);
    container.appendChild(dayDiv);
  }

  // Current month
  for (let i = 1; i <= totalDays; i++) {
    const dayDiv = createDatePickerDayElement(i, new Date(year, month, i), false, mobileVisibleDate);
    container.appendChild(dayDiv);
  }

  // Next month padding
  const remainingCells = 42 - container.children.length;
  for (let i = 1; i <= remainingCells; i++) {
    const dayDiv = createDatePickerDayElement(i, new Date(year, month + 1, i), true, mobileVisibleDate);
    container.appendChild(dayDiv);
  }
}

function createDatePickerDayElement(dayNum, dateObj, isOtherMonth, mobileVisibleDate = null) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'datepicker-day-btn';
  btn.textContent = dayNum;

  if (isOtherMonth) {
    btn.classList.add('other-month');
  }

  if (isMobile()) {
    const visibleDate = mobileVisibleDate || new Date();
    if (dateObj.toDateString() === visibleDate.toDateString()) {
      btn.classList.add('selected-week');
    }
  } else {
    // Check if date lies in [currentWeekStart, currentWeekStart + 6]
    const weekStart = new Date(currentWeekStart);
    weekStart.setHours(0,0,0,0);
    const weekEnd = addDays(weekStart, 6);
    weekEnd.setHours(23,59,59,999);
    
    if (dateObj >= weekStart && dateObj <= weekEnd) {
      btn.classList.add('selected-week');
    }
  }

  const today = new Date();
  if (dateObj.toDateString() === today.toDateString()) {
    btn.classList.add('is-today');
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isMobile()) {
      jumpMobileFeedToDate(dateObj);
    } else {
      currentWeekStart = getMondayOf(dateObj);
      renderWeeklyCalendar();
    }
    document.getElementById('custom-calendar-dropdown').classList.add('hidden');
    document.removeEventListener('click', closeDatePickerOnOutsideClick);
  });

  return btn;
}

// --- Wire Up Event Listeners ---
function setupEventListeners() {
  // Navigation
  document.getElementById('prev-week-btn').addEventListener('click', () => {
    if (isMobile()) {
      const visibleDate = getMobileVisibleDate() || new Date();
      jumpMobileFeedToDate(addDays(visibleDate, -7));
    } else {
      navigateToWeek(-1);
    }
  });

  document.getElementById('next-week-btn').addEventListener('click', () => {
    if (isMobile()) {
      const visibleDate = getMobileVisibleDate() || new Date();
      jumpMobileFeedToDate(addDays(visibleDate, 7));
    } else {
      navigateToWeek(1);
    }
  });

  document.getElementById('today-btn').addEventListener('click', () => {
    if (isMobile()) {
      jumpMobileFeedToDate(new Date());
    } else {
      const targetMonday = getMondayOf(new Date());
      const diffTime = targetMonday.getTime() - currentWeekStart.getTime();
      if (diffTime === 0) return; // Already on current week
      const direction = diffTime > 0 ? 1 : -1;
      currentWeekStart = addDays(targetMonday, -direction * 7);
      navigateToWeek(direction);
    }
  });

  // Navegación con flechas del teclado (solo escritorio)
  document.addEventListener('keydown', (e) => {
    if (isMobile()) return;
    // No activar si el foco está en un input, textarea o elemento editable
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
    // No activar si hay un modal abierto
    const modal = document.getElementById('task-modal');
    if (modal && !modal.classList.contains('hidden') && modal.style.display !== 'none') return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigateToWeek(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigateToWeek(1);
    }
  });

  // Datepicker Integration (Custom Calendar Dropdown)
  const datepickerTrigger = document.getElementById('datepicker-trigger');
  const weekLabel = document.getElementById('week-range-label');

  if (datepickerTrigger) {
    datepickerTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCustomDatePicker();
    });
  }

  if (weekLabel) {
    weekLabel.style.cursor = 'pointer';
    weekLabel.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCustomDatePicker();
    });
  }

  const prevMonthBtn = document.getElementById('custom-calendar-prev-month');
  if (prevMonthBtn) {
    prevMonthBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      datePickerCurrentMonth.setMonth(datePickerCurrentMonth.getMonth() - 1);
      renderCustomDatePicker();
    });
  }

  const nextMonthBtn = document.getElementById('custom-calendar-next-month');
  if (nextMonthBtn) {
    nextMonthBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      datePickerCurrentMonth.setMonth(datePickerCurrentMonth.getMonth() + 1);
      renderCustomDatePicker();
    });
  }

  // Setup desktop columns click, add task buttons, and drag-and-drop listeners
  setupDesktopColumns(document);

  // Task Form Duration calculation listeners (both input and change events for real-time update)
  document.getElementById('task-input-start').addEventListener('change', updateDurationDisplay);
  document.getElementById('task-input-start').addEventListener('input', updateDurationDisplay);
  document.getElementById('task-input-end').addEventListener('change', updateDurationDisplay);
  document.getElementById('task-input-end').addEventListener('input', updateDurationDisplay);

  // Close modals clicking X
  document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetModal = btn.dataset.modal;
      document.getElementById(targetModal).classList.add('hidden');
    });
  });

  // Close modals clicking backdrop & blur active element when clicking non-input card areas
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        backdrop.classList.add('hidden');
      } else if (!e.target.closest('input, textarea, select, button, .custom-select-trigger, .color-circle')) {
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
      }
    });
  });

  // Task Modal Form Cancel
  document.querySelector('.cancel-task-btn').addEventListener('click', closeTaskModal);

  // Recurrence Panel toggle
  const repeatToggle = document.getElementById('task-repeat-toggle');
  repeatToggle.addEventListener('change', (e) => {
    const panel = document.getElementById('recurrence-panel');
    const statusText = document.getElementById('recurrence-status-text');
    
    if (e.target.checked) {
      panel.classList.remove('hidden');
      statusText.textContent = 'Sí';
      // Pre-fill active recurrence days with current day of the week if empty and unit is weekly
      const unit = document.getElementById('repeat-unit').value;
      if (unit === 'weekly' && activeRecurrenceDays.size === 0) {
        const taskDateVal = document.getElementById('task-input-date').value;
        const targetD = taskDateVal ? new Date(taskDateVal + 'T00:00:00') : new Date();
        const appDay = getAppDayIndex(targetD);
        
        activeRecurrenceDays.add(appDay);
        const dayBtn = document.querySelector(`.day-toggle-btn[data-day-value="${appDay}"]`);
        if (dayBtn) dayBtn.classList.add('active');
      }
    } else {
      panel.classList.add('hidden');
      statusText.textContent = 'No';
    }
    updateRecurrenceHint();
  });

  // Recurrence Days Selection toggles
  document.querySelectorAll('.day-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = parseInt(btn.dataset.dayValue);
      if (activeRecurrenceDays.has(val)) {
        activeRecurrenceDays.delete(val);
        btn.classList.remove('active');
      } else {
        activeRecurrenceDays.add(val);
        btn.classList.add('active');
      }
      updateRecurrenceHint();
    });
  });

  // Repeat Unit selection change
  const repeatUnit = document.getElementById('repeat-unit');
  repeatUnit.addEventListener('change', (e) => {
    const daysSelector = document.getElementById('days-selector-group');
    if (e.target.value === 'weekly') {
      daysSelector.classList.remove('hidden');
    } else {
      daysSelector.classList.add('hidden');
    }
    updateRecurrenceHint();
  });

  // Repeat Interval input change
  document.getElementById('repeat-interval').addEventListener('input', updateRecurrenceHint);

  // Task date change
  document.getElementById('task-input-date').addEventListener('change', updateRecurrenceHint);

  // Recurrence End Options radios
  document.querySelectorAll('input[name="recurrence-end"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const val = e.target.value;
      const dateField = document.getElementById('repeat-end-date');
      const countWrapper = document.querySelector('.count-input-wrapper');

      dateField.classList.add('hidden');
      countWrapper.classList.add('hidden');

      if (val === 'date') {
        dateField.classList.remove('hidden');
        // Pre-fill end date to +1 month from task date if empty
        if (!dateField.value) {
          const taskDateVal = document.getElementById('task-input-date').value;
          const base = taskDateVal ? new Date(taskDateVal + 'T00:00:00') : new Date();
          base.setMonth(base.getMonth() + 1);
          dateField.value = formatDate(base);
        }
      } else if (val === 'count') {
        countWrapper.classList.remove('hidden');
      }
    });
  });

  // Submit Task Form
  document.getElementById('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Preserve exceptions if we are editing an existing recurring task
    let existingExceptions = [];
    if (selectedTaskId) {
      const existingTask = tasks.find(t => t.id === selectedTaskId);
      if (existingTask && existingTask.recurrence && existingTask.recurrence.exceptions) {
        existingExceptions = existingTask.recurrence.exceptions;
      }
    }

    const title = document.getElementById('task-input-title').value.trim();
    const description = document.getElementById('task-input-description').value.trim();
    const tagId = document.getElementById('task-select-tag').value;
    const isBriefcase = document.getElementById('task-in-briefcase-checkbox').checked;
    const date = isBriefcase ? "" : document.getElementById('task-input-date').value;
    const startTime = document.getElementById('task-input-start').value || null;
    const endTime = document.getElementById('task-input-end').value || null;

    // Calculate duration
    let duration = null;
    if (startTime && endTime) {
      const [startH, startM] = startTime.split(':').map(Number);
      const [endH, endM] = endTime.split(':').map(Number);
      let diff = (endH * 60 + endM) - (startH * 60 + startM);
      if (diff < 0) {
        diff += 24 * 60; // Termina al día siguiente (overnight)
      }
      const hours = Math.floor(diff / 60);
      const mins = diff % 60;
      duration = `${hours > 0 ? hours + 'h' : ''}${mins > 0 ? mins + 'min' : ''}` || '0min';
    }

    // Recurrence logic
    let recurrence = null;
    const isRecurring = !isBriefcase && document.getElementById('task-repeat-toggle').checked;
    if (isRecurring) {
      const unit = document.getElementById('repeat-unit').value;
      const interval = parseInt(document.getElementById('repeat-interval').value) || 1;
      const days = unit === 'weekly' ? Array.from(activeRecurrenceDays).sort((a,b) => a - b) : [];
      const endType = document.querySelector('input[name="recurrence-end"]:checked').value;
      
      let endDate = null;
      if (endType === 'date') {
        endDate = document.getElementById('repeat-end-date').value;
      }

      let endCount = null;
      if (endType === 'count') {
        endCount = parseInt(document.getElementById('repeat-end-count').value) || 10;
      }

      recurrence = {
        enabled: true,
        unit,
        interval,
        weeksInterval: unit === 'weekly' ? interval : 1, // backward compatibility
        days,
        endType,
        endDate,
        endCount,
        exceptions: existingExceptions
      };
    }

    pushToUndoStack(); // Guardamos el estado previo para poder hacer CTRL+Z

    if (selectedTaskId) {
      // EDIT EXISTING TASK
      const idx = tasks.findIndex(t => t.id === selectedTaskId);
      if (idx !== -1) {
        const oldTask = tasks[idx];
        const timeOrDateChanged = oldTask.startTime !== startTime || oldTask.date !== date;

        if (oldTask.recurrence && oldTask.recurrence.enabled && isBriefcase && selectedOccurrenceDate) {
          // Archivar solo esta ocurrencia de una tarea recurrente
          if (!oldTask.recurrence.exceptions) {
            oldTask.recurrence.exceptions = [];
          }
          if (!oldTask.recurrence.exceptions.includes(selectedOccurrenceDate)) {
            oldTask.recurrence.exceptions.push(selectedOccurrenceDate);
          }

          // Crear un clon simple para el maletín con los datos actuales
          const briefcaseTask = {
            id: 'task-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            title,
            description,
            tagId,
            date: '',
            startTime,
            endTime,
            duration,
            recurrence: null
          };

          const briefcaseTasks = tasks.filter(t => !t.date);
          const maxPos = briefcaseTasks.reduce((max, t) => Math.max(max, t.position || 0), 0);
          briefcaseTask.position = maxPos + 10;

          tasks.push(briefcaseTask);
        } else {
          // Edición regular
          tasks[idx] = {
            ...tasks[idx],
            title,
            description,
            tagId,
            date,
            startTime,
            endTime,
            duration,
            recurrence
          };

          if (timeOrDateChanged || tasks[idx].position === undefined) {
            adjustPositionForModifiedTime(tasks[idx]);
          }
        }
      }
    } else {
      // CREATE NEW TASK
      const newTask = {
        id: 'task-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        title,
        description,
        tagId,
        date,
        startTime,
        endTime,
        duration,
        recurrence
      };
      tasks.push(newTask);
      adjustPositionForModifiedTime(newTask);
    }

    saveTasksToStorage();
    closeTaskModal();
    renderWeeklyCalendar();
  });

  // Delete Task Button
  document.getElementById('delete-task-btn').addEventListener('click', async () => {
    if (!selectedTaskId) return;
    
    const task = tasks.find(t => t.id === selectedTaskId);
    if (!task) return;

    if (task.recurrence && task.recurrence.enabled) {
      // Abrir modal de confirmación personalizado para tarea recurrente
      openConfirmModal(task, selectedOccurrenceDate);
    } else {
      // Eliminar tarea simple directamente sin confirmación
      pushToUndoStack();
      tasks = tasks.filter(t => t.id !== selectedTaskId);
      saveTasksToStorage();
      closeTaskModal();
      renderWeeklyCalendar();
    }
  });

  // Confirm Modal - Cancel button and Close button (X)
  document.querySelectorAll('.close-confirm-modal-btn, [data-modal="confirm-modal"]').forEach(btn => {
    btn.addEventListener('click', closeConfirmModal);
  });

  // Confirm Modal - Delete ONLY this occurrence
  document.getElementById('delete-only-this-btn').addEventListener('click', async () => {
    if (!selectedTaskId || !selectedOccurrenceDate) return;
    
    const idx = tasks.findIndex(t => t.id === selectedTaskId);
    if (idx === -1) return;

    pushToUndoStack(); // Guardamos el estado previo para poder hacer CTRL+Z

    const task = tasks[idx];
    if (!task.recurrence) {
      task.recurrence = { enabled: true };
    }
    if (!task.recurrence.exceptions) {
      task.recurrence.exceptions = [];
    }
    
    // Agregar la ocurrencia a la lista de excepciones
    if (!task.recurrence.exceptions.includes(selectedOccurrenceDate)) {
      task.recurrence.exceptions.push(selectedOccurrenceDate);
    }

    saveTasksToStorage();
    closeConfirmModal();
    closeTaskModal();
    renderWeeklyCalendar();
  });

  // Confirm Modal - Delete ALL occurrences
  document.getElementById('delete-all-occurrences-btn').addEventListener('click', async () => {
    if (!selectedTaskId) return;

    pushToUndoStack(); // Guardamos el estado previo para poder hacer CTRL+Z

    tasks = tasks.filter(t => t.id !== selectedTaskId);

    saveTasksToStorage();
    closeConfirmModal();
    closeTaskModal();
    renderWeeklyCalendar();
  });

  // CTRL+Z & CTRL+Y Keyboard Listeners (Undo / Redo)
  window.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    const isInputActive = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);

    // Check for CTRL + Z (Undo)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      if (isInputActive) return;
      e.preventDefault();
      const success = undo();
      if (success) {
        showHistoryNotification('Cambio revertido con éxito', 'undo');
      }
    }

    // Check for CTRL + Y (Redo)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      if (isInputActive) return;
      e.preventDefault();
      const success = redo();
      if (success) {
        showHistoryNotification('Cambio rehecho con éxito', 'redo');
      }
    }

    // Check for Delete key when a task is open in edit mode
    if (e.key === 'Delete') {
      const taskModal = document.getElementById('task-modal');
      const isTaskModalOpen = taskModal && !taskModal.classList.contains('hidden');
      const confirmModal = document.getElementById('confirm-modal');
      const isConfirmModalOpen = confirmModal && !confirmModal.classList.contains('hidden');

      if (isTaskModalOpen && !isConfirmModalOpen && !isInputActive && selectedTaskId) {
        e.preventDefault();
        const deleteBtn = document.getElementById('delete-task-btn');
        if (deleteBtn) {
          deleteBtn.click();
        }
      }
    }

    // Check for Escape key to close open modals
    if (e.key === 'Escape') {
      const confirmModal = document.getElementById('confirm-modal');
      const isConfirmModalOpen = confirmModal && !confirmModal.classList.contains('hidden');
      if (isConfirmModalOpen) {
        e.preventDefault();
        closeConfirmModal();
        return;
      }

      const taskModal = document.getElementById('task-modal');
      const isTaskModalOpen = taskModal && !taskModal.classList.contains('hidden');
      if (isTaskModalOpen) {
        e.preventDefault();
        closeTaskModal();
        return;
      }

      const tagsModal = document.getElementById('tags-modal');
      const isTagsModalOpen = tagsModal && !tagsModal.classList.contains('hidden');
      if (isTagsModalOpen) {
        e.preventDefault();
        closeTagsModal();
        return;
      }

      const notesModal = document.getElementById('notes-modal');
      const isNotesModalOpen = notesModal && !notesModal.classList.contains('hidden');
      if (isNotesModalOpen) {
        e.preventDefault();
        closeNotesModal();
        return;
      }

      const changePasswordModal = document.getElementById('change-password-modal');
      const isChangePasswordModalOpen = changePasswordModal && !changePasswordModal.classList.contains('hidden');
      if (isChangePasswordModalOpen) {
        e.preventDefault();
        closeChangePasswordModal();
        return;
      }

      const deleteAccountModal = document.getElementById('delete-account-modal');
      const isDeleteAccountModalOpen = deleteAccountModal && !deleteAccountModal.classList.contains('hidden');
      if (isDeleteAccountModalOpen) {
        e.preventDefault();
        closeDeleteAccountModal();
        return;
      }
    }
  });

  // Open Tags Modal Button
  document.getElementById('tags-modal-btn').addEventListener('click', openTagsModal);

  // Trigger Nueva Etiqueta Button
  document.getElementById('add-tag-trigger-btn').addEventListener('click', () => {
    document.getElementById('tag-form').classList.remove('hidden');
    const separator = document.querySelector('.separator-line');
    if (separator) separator.classList.remove('hidden');
    document.getElementById('add-tag-trigger-btn').classList.add('hidden');
    document.getElementById('tag-input-name').focus();
  });

  // Tag Form Cancel Edit
  document.getElementById('tag-cancel-btn').addEventListener('click', resetTagForm);

  // Submit Tag Form
  document.getElementById('tag-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('tag-input-name').value.trim();
    const editId = document.getElementById('tag-edit-id').value;
    const color = DEFAULT_COLORS[selectedColorIndex];

    if (editId) {
      // Update Tag
      tags = tags.map(tag => {
        if (tag.id === editId) {
          return { ...tag, name, color, colorIndex: selectedColorIndex };
        }
        return tag;
      });
    } else {
      // Create Tag
      const newTag = {
        id: 'tag-' + Date.now(),
        name,
        color,
        colorIndex: selectedColorIndex
      };
      tags.push(newTag);
    }

    saveTagsToStorage();
    resetTagForm();
    renderTagsList();
    buildTagSelectorOptions();
    renderWeeklyCalendar();
  });

  // Change Password Form Cancel
  document.getElementById('change-password-cancel-btn').addEventListener('click', closeChangePasswordModal);

  // Change Password Form Submit
  document.getElementById('change-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const statusEl = document.getElementById('change-password-status');
    const submitBtn = document.getElementById('change-password-submit-btn');
    const currentPassword = document.getElementById('password-current').value;
    const newPassword = document.getElementById('password-new').value;

    if (!currentUser) return;

    if (newPassword.length < 6) {
      statusEl.textContent = 'La contraseña nueva debe tener al menos 6 caracteres.';
      statusEl.className = 'auth-error';
      return;
    }

    // Disable button and show loading state
    submitBtn.disabled = true;
    const originalBtnText = submitBtn.textContent;
    submitBtn.textContent = 'Procesando...';
    statusEl.className = 'hidden';
    statusEl.textContent = '';

    try {
      // 1. Authenticate with Supabase using current password to verify it
      const { error: signInError } = await sb.auth.signInWithPassword({
        email: currentUser.email,
        password: currentPassword
      });

      if (signInError) {
        statusEl.textContent = 'La contraseña actual es incorrecta.';
        statusEl.className = 'auth-error';
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
        return;
      }

      // 2. Update user password
      const { error: updateError } = await sb.auth.updateUser({
        password: newPassword
      });

      if (updateError) {
        statusEl.textContent = translateAuthError(updateError.message);
        statusEl.className = 'auth-error';
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
        return;
      }

      // 3. Success!
      statusEl.textContent = 'Contraseña actualizada con éxito.';
      statusEl.className = 'auth-success';
      
      // Clear fields
      document.getElementById('password-current').value = '';
      document.getElementById('password-new').value = '';

      setTimeout(() => {
        closeChangePasswordModal();
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
      }, 1500);

    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Error inesperado al cambiar la contraseña. Inténtalo de nuevo.';
      statusEl.className = 'auth-error';
      submitBtn.disabled = false;
      submitBtn.textContent = originalBtnText;
    }
  });

  // Delete Account Form Cancel
  document.getElementById('delete-account-cancel-btn').addEventListener('click', closeDeleteAccountModal);

  // Delete Account Confirm
  document.getElementById('delete-account-confirm-btn').addEventListener('click', async () => {
    const statusEl = document.getElementById('delete-account-status');
    const confirmBtn = document.getElementById('delete-account-confirm-btn');

    if (!currentUser) return;

    // Disable button and show loading state
    confirmBtn.disabled = true;
    const originalBtnText = confirmBtn.textContent;
    confirmBtn.textContent = 'Eliminando...';
    statusEl.className = 'hidden';
    statusEl.textContent = '';

    try {
      // Call the RPC function 'delete_user'
      const { error } = await sb.rpc('delete_user');

      if (error) {
        console.error('delete_user RPC error:', error);
        statusEl.textContent = 'Error al eliminar la cuenta. Por favor, asegúrate de haber ejecutado la función SQL delete_user en tu base de datos Supabase.';
        statusEl.className = 'auth-error';
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalBtnText;
        return;
      }

      // Success! Sign out the user
      statusEl.textContent = 'Cuenta eliminada con éxito. Cerrando sesión...';
      statusEl.className = 'auth-success';

      setTimeout(async () => {
        intentionalLogout = true;
        await sb.auth.signOut();
        closeDeleteAccountModal();
        confirmBtn.disabled = false;
        confirmBtn.textContent = originalBtnText;
      }, 2000);

    } catch (err) {
      console.error(err);
      statusEl.textContent = 'Error inesperado al eliminar la cuenta.';
      statusEl.className = 'auth-error';
      confirmBtn.disabled = false;
      confirmBtn.textContent = originalBtnText;
    }
  });

  // Custom Select Dropdown for Tags Toggle
  const tagSelectTrigger = document.getElementById('tag-select-trigger');
  const tagOptionsContainer = document.getElementById('tag-options-container');

  if (tagSelectTrigger && tagOptionsContainer) {
    tagSelectTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      tagOptionsContainer.classList.toggle('hidden');
    });

    // Close options list when clicking outside
    document.addEventListener('click', (e) => {
      if (!tagSelectTrigger.contains(e.target) && !tagOptionsContainer.contains(e.target)) {
        tagOptionsContainer.classList.add('hidden');
      }
    });
  }

  // Edge scrolling when dragging a task on desktop
  window.addEventListener('dragover', (e) => {
    if (isMobile() || !draggedTaskId) return;

    const edgeThreshold = 80; // pixels from the edge of the viewport
    const windowWidth = window.innerWidth;

    if (e.clientX < edgeThreshold) {
      triggerEdgeWeekChange(-1);
    } else if (e.clientX > windowWidth - edgeThreshold) {
      triggerEdgeWeekChange(1);
    } else {
      clearEdgeScrollTimeout();
    }
  });

  window.addEventListener('dragend', () => {
    clearEdgeScrollTimeout();
  });

  // Delegación de eventos para borrar tareas del día (Basurero)
  document.addEventListener('click', (e) => {
    const clearBtn = e.target.closest('.clear-day-btn');
    if (clearBtn) {
      e.stopPropagation();
      const col = clearBtn.closest('.day-column');
      if (col) {
        const dateStr = col.dataset.date;
        if (dateStr) {
          confirmAndClearTasksForDay(dateStr);
        }
      }
    }
  });

  // Delegación de eventos para abrir notas del día (Boquilla de diálogo)
  document.addEventListener('click', (e) => {
    const dialogueBtn = e.target.closest('.dialogue-day-btn');
    if (dialogueBtn) {
      e.stopPropagation();
      const col = dialogueBtn.closest('.day-column');
      if (col) {
        const dateStr = col.dataset.date;
        if (dateStr) {
          openNotesModal(dateStr);
        }
      }
    }
  });

  // Eventos del modal de Notas
  document.getElementById('notes-save-btn').addEventListener('click', async () => {
    const modal = document.getElementById('notes-modal');
    const dateStr = modal.dataset.date;
    const text = document.getElementById('notes-textarea').value.trim();
    
    if (text) {
      notes[dateStr] = text;
    } else {
      delete notes[dateStr];
    }
    
    closeNotesModal();
    saveNotesToStorage();
    renderWeeklyCalendar();
  });

  document.getElementById('notes-cancel-btn').addEventListener('click', closeNotesModal);

  // Briefcase Event Listeners
  document.getElementById('briefcase-btn').addEventListener('click', toggleBriefcaseDrawer);
  document.getElementById('close-briefcase-drawer').addEventListener('click', toggleBriefcaseDrawer);
  const mobileBackdrop = document.getElementById('briefcase-mobile-backdrop');
  if (mobileBackdrop) {
    mobileBackdrop.addEventListener('click', toggleBriefcaseDrawer);
  }
  document.getElementById('briefcase-add-task-btn').addEventListener('click', () => {
    selectedDayDate = null;
    openTaskModal();
  });

  // Abrir modal al hacer clic en el espacio vacío del cuerpo del maletín
  const briefcaseDrawerBody = document.querySelector('.briefcase-drawer .drawer-body');
  if (briefcaseDrawerBody) {
    briefcaseDrawerBody.addEventListener('click', (e) => {
      if (e.target.closest('.task-card') || e.target.closest('button') || e.target.closest('input') || e.target.closest('select') || e.target.closest('textarea')) {
        return;
      }
      // Evitar abrir modal si se hace clic en la barra de desplazamiento
      const container = document.getElementById('briefcase-tasks-container');
      if (container) {
        const rect = container.getBoundingClientRect();
        if (e.clientX > rect.left + container.clientWidth) {
          return;
        }
      }
      selectedDayDate = null;
      openTaskModal();
    });
  }

  // Briefcase Checkbox Sync in Modal
  const briefcaseCheckbox = document.getElementById('task-in-briefcase-checkbox');
  briefcaseCheckbox.addEventListener('change', (e) => {
    const dateInput = document.getElementById('task-input-date');
    const repeatToggle = document.getElementById('task-repeat-toggle');
    const panel = document.getElementById('recurrence-panel');
    const statusText = document.getElementById('recurrence-status-text');

    if (e.target.checked) {
      dateInput.value = '';
      dateInput.disabled = true;
      dateInput.required = false;
      
      repeatToggle.checked = false;
      repeatToggle.disabled = true;
      panel.classList.add('hidden');
      statusText.textContent = 'No';
    } else {
      dateInput.disabled = false;
      dateInput.required = true;
      dateInput.value = selectedDayDate || formatDate(new Date());
      repeatToggle.disabled = false;
    }
    updateRecurrenceHint();
  });

  setupBriefcaseDragAndDrop();
  setupTrashDragAndDrop();
}

async function confirmAndClearTasksForDay(dateStr) {
  const dateObj = new Date(dateStr + 'T00:00:00');
  
  // Formatear fecha legible en español
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const formattedDate = dateObj.toLocaleDateString('es-ES', options);
  
  // Filtrar tareas que ocurren este día
  const dayTasks = tasks.filter(task => {
    const isOccurring = checkTaskOccurrence(task, dateObj);
    if (!isOccurring) return false;
    const tag = tags.find(t => t.id === task.tagId) || tags.find(t => t.id === 'default');
    return tag ? tag.visible !== false : true;
  });
  
  if (dayTasks.length === 0) {
    alert(`No hay tareas visibles programadas para el ${formattedDate}.`);
    return;
  }
  
  const confirmed = confirm(`¿Estás seguro de que deseas eliminar todas las tareas (${dayTasks.length}) del ${formattedDate}?`);
  if (!confirmed) return;
  
  pushToUndoStack();
  
  // Procesar eliminación de tareas
  tasks = tasks.map(task => {
    if (checkTaskOccurrence(task, dateObj)) {
      const tag = tags.find(t => t.id === task.tagId) || tags.find(t => t.id === 'default');
      const isVisible = tag ? tag.visible !== false : true;
      
      if (isVisible) {
        if (task.recurrence && task.recurrence.enabled) {
          // Si es recurrente, añadir a excepciones para eliminar solo este día
          if (!task.recurrence.exceptions) {
            task.recurrence.exceptions = [];
          }
          if (!task.recurrence.exceptions.includes(dateStr)) {
            task.recurrence.exceptions.push(dateStr);
          }
          return task;
        } else {
          // Tarea normal, marcar como nula para filtrarla
          return null;
        }
      }
    }
    return task;
  }).filter(t => t !== null);

  saveTasksToStorage();

  if (isMobile()) {
    updateMobileFeedTasks();
  } else {
    renderWeeklyCalendar();
  }
}

async function toggleTaskCompletion(task, occurrenceDate) {
  pushToUndoStack();

  if (task.recurrence && task.recurrence.enabled) {
    if (!task.completedOccurrences) {
      task.completedOccurrences = [];
    }
    const idx = task.completedOccurrences.indexOf(occurrenceDate);
    if (idx !== -1) {
      task.completedOccurrences.splice(idx, 1);
    } else {
      task.completedOccurrences.push(occurrenceDate);
    }
  } else {
    task.completed = !task.completed;
  }

  saveTasksToStorage();
  renderWeeklyCalendar();
}

// ─── Scroll infinito continuo (solo móvil) ───────────────────────────────────
// Todos los días son un feed vertical único. Se renderizan ventanas de días
// alrededor del día actual y se extienden conforme el usuario scrollea.

const MOBILE_FEED_BUFFER = 30; // días a renderizar antes y después del día visible

let mobileFeedAnchorDate = null;   // fecha del primer día renderizado en el feed
let mobileFeedDayCount   = 0;      // total de días en el feed
let mobileScrollInit     = false;
let mobilePastScrollAllowed = false;

function makeMobileDayCard(date) {
  const dateStr = formatDate(date);
  const today   = formatDate(new Date());
  const DAY_NAMES = ['DOMINGO','LUNES','MARTES','MIÉRCOLES','JUEVES','VIERNES','SÁBADO'];

  const col = document.createElement('div');
  col.className = 'day-column mobile-feed-day';
  col.dataset.date = dateStr;
  const isToday = dateStr === today;
  if (isToday) col.classList.add('today');

  // Header
  const header = document.createElement('div');
  header.className = 'day-header';
  const hasNotes = notes[dateStr];
  const iconSrc = hasNotes ? 'icons/message-square-text.svg' : 'icons/message-square.svg';
  const notesClass = hasNotes ? 'dialogue-day-btn has-notes' : 'dialogue-day-btn';
  header.innerHTML = `
    <span class="day-name">${DAY_NAMES[date.getDay()]}</span>
    <span class="day-number">${date.getDate()}</span>
    <button class="${notesClass}" title="Notas">
      <img src="${iconSrc}" alt="Notas">
    </button>
    <button class="clear-day-btn" title="Eliminar todas las tareas de este día">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>
    </button>
  `;
  col.appendChild(header);

  // Tasks
  const tasksContainer = document.createElement('div');
  tasksContainer.className = 'tasks-container';
  const dayTasks = tasks.filter(task => {
    if (!checkTaskOccurrence(task, date)) return false;
    const tag = tags.find(t => t.id === task.tagId) || tags.find(t => t.id === 'default');
    return tag ? tag.visible !== false : true;
  });
  dayTasks.sort((a, b) => (a.position || 0) - (b.position || 0));
  renderTasksToContainer(dayTasks, tasksContainer, dateStr);
  col.appendChild(tasksContainer);

  // Add button
  const addBtn = document.createElement('button');
  addBtn.className = 'add-task-btn';
  addBtn.innerHTML = '<span class="plus-icon">+</span> Agregar tarea';
  addBtn.addEventListener('click', () => {
    selectedDayDate = dateStr;
    openTaskModal();
  });
  col.appendChild(addBtn);

  return col;
}

function buildMobileFeed(centerDate) {
  const grid = document.querySelector('.planner-grid');
  if (!grid) return;

  const start = addDays(centerDate, -MOBILE_FEED_BUFFER);
  mobileFeedAnchorDate = start;
  mobileFeedDayCount   = MOBILE_FEED_BUFFER * 2 + 1;

  grid.innerHTML = '';
  for (let i = 0; i < mobileFeedDayCount; i++) {
    grid.appendChild(makeMobileDayCard(addDays(start, i)));
  }
}

function extendMobileFeedForward() {
  const grid = document.querySelector('.planner-grid');
  if (!grid) return;
  const daysToAdd = 15;
  for (let i = 0; i < daysToAdd; i++) {
    const date = addDays(mobileFeedAnchorDate, mobileFeedDayCount + i);
    grid.appendChild(makeMobileDayCard(date));
  }
  mobileFeedDayCount += daysToAdd;
}

function extendMobileFeedBackward() {
  const grid = document.querySelector('.planner-grid');
  if (!grid) return;
  const daysToAdd = 15;
  const scrollBefore = grid.scrollTop;
  const heightBefore = grid.scrollHeight;

  const fragment = document.createDocumentFragment();
  for (let i = daysToAdd - 1; i >= 0; i--) {
    const date = addDays(mobileFeedAnchorDate, -(i + 1));
    fragment.appendChild(makeMobileDayCard(date));
  }
  grid.insertBefore(fragment, grid.firstChild);
  mobileFeedAnchorDate = addDays(mobileFeedAnchorDate, -daysToAdd);
  mobileFeedDayCount  += daysToAdd;

  // Compensar el salto de scroll para que el usuario no note el prepend
  grid.scrollTop = scrollBefore + (grid.scrollHeight - heightBefore);
}

function getMobileVisibleDate() {
  const grid = document.querySelector('.planner-grid');
  if (!grid) return null;
  const days = grid.querySelectorAll('.mobile-feed-day');
  for (const day of days) {
    const rect = day.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    if (rect.top >= gridRect.top - 10) {
      return new Date(day.dataset.date + 'T00:00:00');
    }
  }
  return null;
}

function scrollMobileFeedToDate(date) {
  const grid = document.querySelector('.planner-grid');
  if (!grid) return;
  const dateStr = formatDate(date);
  const targetEl = grid.querySelector(`.mobile-feed-day[data-date="${dateStr}"]`);
  if (targetEl) {
    const targetOffset = targetEl.offsetTop - (targetEl.offsetParent === grid ? 0 : grid.offsetTop) - 2;
    grid.scrollTop = targetOffset;
  }
}

function scrollMobileFeedToToday() {
  scrollMobileFeedToDate(new Date());
}

function jumpMobileFeedToDate(targetDate) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const target = new Date(targetDate);
  target.setHours(0,0,0,0);
  
  if (target < today) {
    mobilePastScrollAllowed = true;
  } else {
    mobilePastScrollAllowed = false;
  }

  buildMobileFeed(targetDate);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollMobileFeedToDate(targetDate);
      updateWeekLabelFromScroll();
    });
  });
}

function updateWeekLabelFromScroll() {
  // Actualiza el label de semana según el día más visible en pantalla
  const grid = document.querySelector('.planner-grid');
  if (!grid) return;
  const days = grid.querySelectorAll('.mobile-feed-day');
  let topDay = null;
  for (const day of days) {
    const rect = day.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    if (rect.top >= gridRect.top - 10) {
      topDay = day;
      break;
    }
  }
  if (topDay) {
    const date = new Date(topDay.dataset.date + 'T00:00:00');
    const monday = getMondayOf(date);
    currentWeekStart = monday;
    document.getElementById('week-range-label').textContent = formatSingleDate(date);
  }
}

function initMobileFeed() {
  if (!isMobile()) return;
  const grid = document.querySelector('.planner-grid');
  if (!grid) return;

  buildMobileFeed(new Date());

  // Scroll al día de hoy con un doble frame para asegurar que el DOM esté completamente pintado y con dimensiones correctas
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollMobileFeedToToday();
      mobileScrollInit = true;
    });
  });

  // Detectar nuevo gesto táctil en la barrera para permitir scroll al pasado
  grid.addEventListener('touchstart', () => {
    if (!isMobile()) return;
    const todayStr = formatDate(new Date());
    const todayEl = grid.querySelector(`.mobile-feed-day[data-date="${todayStr}"]`);
    if (todayEl) {
      const todayOffset = todayEl.offsetTop - (todayEl.offsetParent === grid ? 0 : grid.offsetTop) - 2;
      if (Math.abs(grid.scrollTop - todayOffset) <= 3) {
        mobilePastScrollAllowed = true;
      }
    }
  }, { passive: true });

  // Detectar rueda del mouse (para simuladores/pruebas en escritorio) en la barrera para permitir scroll al pasado
  grid.addEventListener('wheel', (e) => {
    if (!isMobile()) return;
    if (e.deltaY < 0) {
      const todayStr = formatDate(new Date());
      const todayEl = grid.querySelector(`.mobile-feed-day[data-date="${todayStr}"]`);
      if (todayEl) {
        const todayOffset = todayEl.offsetTop - (todayEl.offsetParent === grid ? 0 : grid.offsetTop) - 2;
        if (Math.abs(grid.scrollTop - todayOffset) <= 3) {
          mobilePastScrollAllowed = true;
        }
      }
    }
  }, { passive: true });

  // Extensión infinita al scrollear y barrera de scroll del día actual
  grid.addEventListener('scroll', () => {
    if (!isMobile() || !mobileScrollInit) return;

    updateWeekLabelFromScroll();

    // Límite del día actual: bloquear scroll hacia el pasado si no está permitido explícitamente
    const todayStr = formatDate(new Date());
    const todayEl = grid.querySelector(`.mobile-feed-day[data-date="${todayStr}"]`);
    if (todayEl) {
      const todayOffset = todayEl.offsetTop - (todayEl.offsetParent === grid ? 0 : grid.offsetTop) - 2;
      if (!mobilePastScrollAllowed) {
        if (grid.scrollTop < todayOffset) {
          grid.scrollTop = todayOffset;
        }
      } else {
        // Volver a activar la barrera de bloqueo si el usuario vuelve hacia el presente o futuro
        if (grid.scrollTop >= todayOffset + 10) {
          mobilePastScrollAllowed = false;
        }
      }
    }

    // Extender hacia adelante
    if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 200) {
      extendMobileFeedForward();
    }
    // Extender hacia atrás
    if (grid.scrollTop <= 200) {
      extendMobileFeedBackward();
    }
  }, { passive: true });
}

// Actualizar en sitio las tareas de los días renderizados en móvil
function updateMobileFeedTasks() {
  const grid = document.querySelector('.planner-grid');
  if (!grid) return;

  const dayColumns = grid.querySelectorAll('.mobile-feed-day');
  dayColumns.forEach(col => {
    const dateStr = col.dataset.date;
    if (!dateStr) return;
    const date = new Date(dateStr + 'T00:00:00');

    // Update notes button state
    const dialogueBtn = col.querySelector('.dialogue-day-btn');
    if (dialogueBtn) {
      const dialogueImg = dialogueBtn.querySelector('img');
      const hasNotes = notes[dateStr];
      if (hasNotes) {
        dialogueBtn.className = 'dialogue-day-btn has-notes';
        if (dialogueImg) dialogueImg.src = 'icons/message-square-text.svg';
      } else {
        dialogueBtn.className = 'dialogue-day-btn';
        if (dialogueImg) dialogueImg.src = 'icons/message-square.svg';
      }
    }

    const tasksContainer = col.querySelector('.tasks-container');
    if (tasksContainer) {
      tasksContainer.innerHTML = '';
      const dayTasks = tasks.filter(task => {
        const isOccurring = checkTaskOccurrence(task, date);
        if (!isOccurring) return false;
        const tag = tags.find(t => t.id === task.tagId) || tags.find(t => t.id === 'default');
        return tag ? tag.visible !== false : true;
      });
      dayTasks.sort((a, b) => (a.position || 0) - (b.position || 0));
      renderTasksToContainer(dayTasks, tasksContainer, dateStr);
    }
  });
  renderBriefcaseTasks();
}

// No se usa en móvil continuo pero se mantiene la firma para compatibilidad
function initMobileScrollWeekChange() {}

// ─── Funciones Auxiliares del Maletín ───────────────────────────────────────
function renderBriefcaseTasks() {
  const container = document.getElementById('briefcase-tasks-container');
  if (!container) return;
  container.innerHTML = '';

  const briefcaseTasks = tasks.filter(t => !t.date);

  if (briefcaseTasks.length === 0) {
    container.innerHTML = `
      <div class="briefcase-empty-state">
        <svg class="empty-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
        <span>Guarda tareas aquí para organizarlas después.</span>
      </div>
    `;
    return;
  }

  briefcaseTasks.sort((a, b) => (a.position || 0) - (b.position || 0));

  briefcaseTasks.forEach(task => {
    const taskCard = createTaskCard(task, '');
    container.appendChild(taskCard);
  });
}

// (Redundant toggleBriefcaseDrawer removed)

async function moveTaskToBriefcase(taskId, clientY = null, sourceDateStr = null) {
  const taskIndex = tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return;

  pushToUndoStack();

  const task = tasks[taskIndex];

  if (task.recurrence && task.recurrence.enabled && sourceDateStr) {
    // Es una tarea recurrente y se arrastró una ocurrencia específica.
    // 1. Agregar excepción a la tarea original.
    if (!task.recurrence.exceptions) {
      task.recurrence.exceptions = [];
    }
    if (!task.recurrence.exceptions.includes(sourceDateStr)) {
      task.recurrence.exceptions.push(sourceDateStr);
    }

    // 2. Crear un nuevo clon de la tarea (simple y sin fecha) para el maletín.
    const briefcaseTask = {
      id: 'task-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      title: task.title,
      description: task.description || '',
      tagId: task.tagId,
      date: '',
      startTime: task.startTime || null,
      endTime: task.endTime || null,
      duration: task.duration || null,
      recurrence: null
    };

    // Calcular posición del clon en el maletín.
    const container = document.getElementById('briefcase-tasks-container');
    if (clientY !== null && container) {
      const afterElement = getDragAfterElement(container, clientY);
      const briefcaseTasks = tasks.filter(t => !t.date);
      
      briefcaseTasks.sort((a, b) => (a.position || 0) - (b.position || 0));

      let insertIndex = briefcaseTasks.length;
      if (afterElement) {
        const afterTaskId = afterElement.dataset.id;
        insertIndex = briefcaseTasks.findIndex(t => t.id === afterTaskId);
        if (insertIndex === -1) insertIndex = briefcaseTasks.length;
      }

      briefcaseTasks.splice(insertIndex, 0, briefcaseTask);
      briefcaseTasks.forEach((t, idx) => {
        t.position = idx * 10;
      });
    } else {
      const briefcaseTasks = tasks.filter(t => !t.date);
      const maxPos = briefcaseTasks.reduce((max, t) => Math.max(max, t.position || 0), 0);
      briefcaseTask.position = maxPos + 10;
    }

    tasks.push(briefcaseTask);
  } else {
    // Tarea simple o arrastrada sin fecha de origen.
    task.date = ''; 
    task.recurrence = null;

    const container = document.getElementById('briefcase-tasks-container');
    if (clientY !== null && container) {
      const afterElement = getDragAfterElement(container, clientY);
      const briefcaseTasks = tasks.filter(t => !t.date && t.id !== task.id);
      
      briefcaseTasks.sort((a, b) => (a.position || 0) - (b.position || 0));

      let insertIndex = briefcaseTasks.length;
      if (afterElement) {
        const afterTaskId = afterElement.dataset.id;
        insertIndex = briefcaseTasks.findIndex(t => t.id === afterTaskId);
        if (insertIndex === -1) insertIndex = briefcaseTasks.length;
      }

      briefcaseTasks.splice(insertIndex, 0, task);
      briefcaseTasks.forEach((t, idx) => {
        t.position = idx * 10;
      });
    } else {
      const briefcaseTasks = tasks.filter(t => !t.date && t.id !== task.id);
      const maxPos = briefcaseTasks.reduce((max, t) => Math.max(max, t.position || 0), 0);
      task.position = maxPos + 10;
    }
  }

  saveTasksToStorage();
  renderWeeklyCalendar();
  renderBriefcaseTasks();
}

async function deleteTask(taskId, occurrenceDate) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  if (task.recurrence && task.recurrence.enabled) {
    // Para tareas recurrentes, abrimos el modal de confirmación personalizado
    selectedTaskId = taskId;
    selectedOccurrenceDate = occurrenceDate;
    openConfirmModal(task, occurrenceDate);
  } else {
    // Para tareas normales, eliminamos directamente
    pushToUndoStack();
    tasks = tasks.filter(t => t.id !== taskId);
    saveTasksToStorage();
    renderWeeklyCalendar();
  }
}

function setupTrashDragAndDrop() {
  const trashBtn = document.getElementById('trash-btn');
  if (trashBtn) {
    trashBtn.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      trashBtn.classList.add('drag-over');
    });

    trashBtn.addEventListener('dragleave', () => {
      trashBtn.classList.remove('drag-over');
    });

    trashBtn.addEventListener('drop', (e) => {
      e.preventDefault();
      trashBtn.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      if (!id) return;
      deleteTask(id, draggedTaskSourceDate);
    });
  }
}

async function reorderBriefcaseTask(taskId, container, clientY) {
  const afterElement = getDragAfterElement(container, clientY);
  const briefcaseTasks = tasks.filter(t => !t.date);
  briefcaseTasks.sort((a, b) => (a.position || 0) - (b.position || 0));

  // Remove the dragged task from its current position
  const fromIndex = briefcaseTasks.findIndex(t => t.id === taskId);
  if (fromIndex === -1) return;
  const [movedTask] = briefcaseTasks.splice(fromIndex, 1);

  // Insert at the new position
  let insertIndex = briefcaseTasks.length;
  if (afterElement) {
    const afterTaskId = afterElement.dataset.id;
    const idx = briefcaseTasks.findIndex(t => t.id === afterTaskId);
    if (idx !== -1) insertIndex = idx;
  }
  briefcaseTasks.splice(insertIndex, 0, movedTask);

  // Reassign positions into the global tasks array
  pushToUndoStack();
  briefcaseTasks.forEach((t, idx) => { t.position = idx * 10; });

  saveTasksToStorage();
  renderBriefcaseTasks();
}

function setupBriefcaseDragAndDrop() {
  const briefcaseBtn = document.getElementById('briefcase-btn');
  const briefcaseTasksContainer = document.getElementById('briefcase-tasks-container');

  if (briefcaseBtn) {
    briefcaseBtn.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      briefcaseBtn.classList.add('drag-over');
    });

    briefcaseBtn.addEventListener('dragleave', () => {
      briefcaseBtn.classList.remove('drag-over');
    });

    briefcaseBtn.addEventListener('drop', (e) => {
      e.preventDefault();
      briefcaseBtn.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      if (!id) return;
      moveTaskToBriefcase(id, null, draggedTaskSourceDate);
    });
  }

  if (briefcaseTasksContainer) {
    briefcaseTasksContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      briefcaseTasksContainer.classList.add('drag-over');

      const draggedTask = tasks.find(t => t.id === draggedTaskId);
      if (draggedTask) {
        briefcaseTasksContainer.querySelectorAll('.task-card').forEach(card => {
          card.classList.remove('drag-after-indicator', 'drag-before-indicator');
        });

        const afterElement = getDragAfterElement(briefcaseTasksContainer, e.clientY);
        if (afterElement) {
          afterElement.classList.add('drag-before-indicator');
        } else {
          const cards = briefcaseTasksContainer.querySelectorAll('.task-card:not(.dragging)');
          if (cards.length > 0) {
            cards[cards.length - 1].classList.add('drag-after-indicator');
          }
        }
      }
    });

    briefcaseTasksContainer.addEventListener('dragleave', () => {
      briefcaseTasksContainer.classList.remove('drag-over');
      briefcaseTasksContainer.querySelectorAll('.task-card').forEach(card => {
        card.classList.remove('drag-after-indicator', 'drag-before-indicator');
      });
    });

    briefcaseTasksContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      briefcaseTasksContainer.classList.remove('drag-over');

      briefcaseTasksContainer.querySelectorAll('.task-card').forEach(card => {
        card.classList.remove('drag-after-indicator', 'drag-before-indicator');
      });

      const id = e.dataTransfer.getData('text/plain');
      if (!id) return;

      moveTaskToBriefcase(id, e.clientY, draggedTaskSourceDate);
    });
  }
}

// Start application
window.addEventListener('DOMContentLoaded', initApp);

// Prevent pinch-to-zoom on mobile devices
document.addEventListener('touchmove', (e) => {
  if (isMobile() && e.scale !== undefined && e.scale !== 1) {
    e.preventDefault();
  }
}, { passive: false });

// Prevent tab closing if there is a pending Supabase synchronization
window.addEventListener('beforeunload', (e) => {
  if (currentUser) {
    const pendingSyncKey = 'tasks_pending_sync_' + currentUser.id;
    if (localStorage.getItem(pendingSyncKey) === 'true') {
      e.preventDefault();
      e.returnValue = ''; // Standard browser confirmation prompt
    }
  }
});

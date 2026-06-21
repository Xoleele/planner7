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
let welcomeShownThisSession = false; // evita repetir el panel de bienvenida al volver de otra pestaña

// ─── Configuración de funciones ──────────────────────────────────────────────
// Al marcar una tarea como COMPLETADA, se rellena automáticamente su "hora de
// fin" con la hora actual. Si la tarea ya tenía hora de fin, se pregunta al
// usuario (Cancelar / Mantener / Sobrescribir). Para DESHABILITAR esta función
// por completo, basta con poner este flag en false.
// (En el futuro esto se conectará a una opción de configuración en la interfaz.)
const AUTO_SET_END_TIME_ON_COMPLETE = true;


// ─── Duration parser ─────────────────────────────────────────────────────────
// Detecta una duración escrita al PRINCIPIO de la descripción. Reconoce:
//   • Rango horario:        "08:00-09:30", "8:00 - 9:30"
//   • Horas + minutos:      "1h", "1h20m", "1h20min", "1h 20m", "1h 20min"
//   • Solo minutos:         "20m", "20min", "20 min"
//   • Palabras completas:   "1 hora", "2 horas", "1 hora 20 minutos",
//                           "20 minutos", "62 minutos"
//   • Combinaciones mixtas: "1h 20 min", "1 hora 20m", etc.
// No exige separador después: cualquier carácter posterior (".", ")", ",",
// letras…) se ignora. Así "1h. Dormir la tarde" detecta "1h" igual que "1h".
// Devuelve { minutes, rawMatch } o null si no hay una duración válida al inicio.
function parseDurationFromDescription(description) {
  if (!description || typeof description !== 'string') return null;
  const s = description.trimStart();

  // 1) Rango horario "HH:MM-HH:MM".
  const rangeRe = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/;
  const rangeMatch = s.match(rangeRe);
  if (rangeMatch) {
    const startMin = parseInt(rangeMatch[1]) * 60 + parseInt(rangeMatch[2]);
    const endMin   = parseInt(rangeMatch[3]) * 60 + parseInt(rangeMatch[4]);
    const diff = endMin > startMin ? endMin - startMin : (24 * 60 - startMin) + endMin;
    return { minutes: diff, rawMatch: rangeMatch[0] };
  }

  // 2) Duración "N horas [y] M minutos" en cualquiera de sus formas. Las
  //    unidades aceptan: h / hr / hora / horas  y  m / min / minuto / minutos.
  //    Se permiten espacios opcionales entre número y unidad, y entre el bloque
  //    de horas y el de minutos (con o sin "y").
  const HOUR_U = '(?:horas?|hr?s?|h)';
  const MIN_U  = '(?:minutos?|mins?|m)';
  // a) Horas (con minutos opcionales): "1h", "1 hora", "1h20m", "1h 20 min", …
  const hReN = new RegExp(`^(\\d+)\\s*${HOUR_U}(?:\\s*(?:y\\s*)?(\\d+)\\s*${MIN_U})?`, 'i');
  const hM = s.match(hReN);
  if (hM) {
    const mins = parseInt(hM[1]) * 60 + (hM[2] ? parseInt(hM[2]) : 0);
    return { minutes: mins, rawMatch: hM[0] };
  }
  // b) Solo minutos: "20m", "20 min", "62 minutos".
  const mReN = new RegExp(`^(\\d+)\\s*${MIN_U}`, 'i');
  const mM = s.match(mReN);
  if (mM) return { minutes: parseInt(mM[1]), rawMatch: mM[0] };

  return null;
}
function minutesToHHMM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function minutesToReadable(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}
// Suma la duración (en minutos) de las tareas de un día.
//   completed = false → solo tareas NO completadas (por hacer)
//   completed = true  → solo tareas COMPLETADAS
function getDurationForDay(dateStr, completed) {
  const dayTasks = tasks.filter(task => {
    const isCompleted = (task.recurrence && task.recurrence.enabled)
      ? !!(task.completedOccurrences && task.completedOccurrences.includes(dateStr))
      : !!task.completed;
    if (isCompleted !== completed) return false;
    // Solo sumar tareas VISIBLES: si su etiqueta está apagada (visible === false),
    // no se cuenta (igual que no aparece en el planner/horario).
    const tag = tags.find(t => t.id === task.tagId) || tags.find(t => t.id === 'default');
    if (tag && tag.visible === false) return false;
    return checkTaskOccurrence(task, new Date(dateStr + 'T12:00:00'));
  });
  return dayTasks.reduce((sum, task) => {
    const mins = getTaskDurationMinutes(task);
    return sum + (mins || 0);
  }, 0);
}

// Total de tareas NO completadas (por hacer) de un día.
function getTotalDurationForDay(dateStr) {
  return getDurationForDay(dateStr, false);
}

// Construye el tooltip del icono de reloj con ambas líneas (no completadas /
// completadas). Devuelve el texto de "sin duración" si no hay nada que sumar.
function buildDurationTooltip(dateStr) {
  const pendingMins = getDurationForDay(dateStr, false);
  const completedMins = getDurationForDay(dateStr, true);
  if (pendingMins === 0 && completedMins === 0) {
    return 'Sin tareas con duración definida';
  }
  // Cada línea solo se muestra si su suma es mayor que 0.
  const lines = [];
  if (pendingMins > 0) lines.push(`Tareas no completadas: ${minutesToReadable(pendingMins)}`);
  if (completedMins > 0) lines.push(`Tareas completadas: ${minutesToReadable(completedMins)}`);
  return lines.join('\n');
}

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

  // 1. Upsert current tasks. Si falla, LANZAMOS el error para que el llamador
  //    reintente y NO continuamos a la fase de borrado (evita perder filas).
  if (rows.length > 0) {
    const { error } = await sb.from('tasks').upsert(rows, { onConflict: 'id' });
    if (error) { console.error('saveTasks (upsert):', error); throw error; }
  }

  // SALVAGUARDA: nunca ejecutar el borrado masivo si la lista local esta vacia.
  // Un array vacio casi siempre significa "aun no cargo", no "borra todo".
  if (taskList.length === 0) return;

  // 2. Fetch all task IDs currently in the DB for this user
  const { data: dbRows, error: fetchError } = await sb.from('tasks').select('id').eq('user_id', currentUser.id);
  if (fetchError) { console.error('saveTasks (fetch ids):', fetchError); throw fetchError; }

  // 3. Delete only the rows that are no longer in the local list
  const localIds = new Set(taskList.map(t => t.id));
  const toDelete = (dbRows || []).map(r => r.id).filter(id => !localIds.has(id));
  for (const id of toDelete) {
    const { error } = await sb.from('tasks').delete().eq('id', id).eq('user_id', currentUser.id);
    if (error) console.error('saveTasks (delete):', id, error);
  }
}
// ─── Sincronización incremental (diff por snapshot) ──────────────────────────
// En vez de reenviar TODAS las tareas en cada guardado, comparamos el estado
// actual (tasks[]) contra una "foto" del último estado ya sincronizado con la
// nube (lastSyncedById). Solo viajan las filas nuevas/modificadas (upsert) y se
// borran solo las que desaparecieron (un único delete con .in()). El coste por
// acción deja de crecer con el total de tareas del usuario.

// Mapa id -> JSON del objeto tal como se subió por última vez.
let lastSyncedById = new Map();

function snapshotKeyFor() {
  return currentUser ? 'tasks_synced_snapshot_' + currentUser.id : null;
}

// Persiste el snapshot en localStorage (sobrevive a recargas y cierres).
function persistSyncSnapshot() {
  const key = snapshotKeyFor();
  if (!key) return;
  try {
    const obj = {};
    lastSyncedById.forEach((json, id) => { obj[id] = json; });
    localStorage.setItem(key, JSON.stringify(obj));
  } catch (e) {
    console.warn('No se pudo guardar el snapshot de sincronización:', e);
  }
}

// Carga el snapshot desde localStorage al iniciar sesión.
function loadSyncSnapshot() {
  lastSyncedById = new Map();
  const key = snapshotKeyFor();
  if (!key) return;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const obj = JSON.parse(raw);
      Object.keys(obj).forEach(id => lastSyncedById.set(id, obj[id]));
    }
  } catch (e) {
    console.warn('No se pudo leer el snapshot de sincronización:', e);
  }
}

// Reemplaza el snapshot por el estado dado (lista de tareas ya sincronizadas).
// Se usa tras la carga inicial: lo que viene de la nube ya está "sincronizado".
function resetSyncSnapshot(taskList) {
  lastSyncedById = new Map();
  (taskList || []).forEach(t => {
    if (t && t.id) lastSyncedById.set(t.id, JSON.stringify(t));
  });
  persistSyncSnapshot();
}

// Calcula el diff entre tasks[] y el snapshot. Devuelve:
//   changed: tareas nuevas o cuyo contenido cambió (para upsert)
//   deletedIds: ids que estaban sincronizados pero ya no existen (para delete)
function computeTaskDiff(taskList) {
  const changed = [];
  const currentIds = new Set();
  (taskList || []).forEach(t => {
    if (!t || !t.id) return;
    currentIds.add(t.id);
    const json = JSON.stringify(t);
    if (lastSyncedById.get(t.id) !== json) {
      changed.push(t);
    }
  });
  const deletedIds = [];
  lastSyncedById.forEach((_, id) => {
    if (!currentIds.has(id)) deletedIds.push(id);
  });
  return { changed, deletedIds };
}

// Sincronización incremental: sube solo lo cambiado y borra solo lo eliminado.
// Lanza el error si falla (para que el retry lo capture) y NO actualiza el
// snapshot en ese caso, así el próximo intento reenvía lo mismo.
async function saveTasksIncremental(taskList) {
  if (!currentUser) return;

  const { changed, deletedIds } = computeTaskDiff(taskList);

  // 1. Upsert solo de las tareas nuevas/modificadas.
  if (changed.length > 0) {
    const rows = changed.map(t => ({ id: t.id, user_id: currentUser.id, data: t }));
    const { error } = await sb.from('tasks').upsert(rows, { onConflict: 'id' });
    if (error) { console.error('saveTasksIncremental (upsert):', error); throw error; }
  }

  // SALVAGUARDA: si la lista local está vacía, NO borramos nada en la nube.
  // Un array vacío casi siempre significa "aún no cargó", no "borra todo".
  const allowDeletes = (taskList && taskList.length > 0);

  // 2. Delete en una sola llamada con .in() (no un bucle).
  if (allowDeletes && deletedIds.length > 0) {
    const { error } = await sb.from('tasks').delete().in('id', deletedIds).eq('user_id', currentUser.id);
    if (error) { console.error('saveTasksIncremental (delete):', error); throw error; }
  }

  // 3. Éxito: actualizar el snapshot para reflejar lo que ahora está en la nube.
  changed.forEach(t => lastSyncedById.set(t.id, JSON.stringify(t)));
  if (allowDeletes) deletedIds.forEach(id => lastSyncedById.delete(id));
  persistSyncSnapshot();
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

  // Evitar registrar el listener de click más de una vez. onAuthStateChange
  // puede re-emitir SIGNED_IN (p. ej. al volver a la pestaña y refrescarse el
  // token), lo que llamaría a setupUserMenu de nuevo y apilaría listeners; con
  // un número par de ellos el dropdown se crea y se elimina al instante.
  if (avatar.dataset.menuBound === 'true') return;
  avatar.dataset.menuBound = 'true';

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
      <button id="note-template-btn" class="user-dropdown-item">
        <img src="icons/edit.svg" alt="" width="13.3" height="13.3">
        Plantilla de notas
      </button>
      <button id="manage-tags-btn" class="user-dropdown-item">
        <img src="icons/tag.svg" alt="" width="14" height="14">
        Gestionar etiquetas
      </button>
      <button id="view-toggle-btn" class="user-dropdown-item">
        <img src="icons/calendar.svg" alt="" width="14" height="14">
        <span id="view-toggle-menu-label">Vista Horario</span>
      </button>
      ${isMobile() ? `
      <button id="stats-menu-btn" class="user-dropdown-item">
        <img src="icons/bar-chart.svg" alt="" width="14" height="14">
        Estadísticas
      </button>` : ''}
      <button id="advanced-options-btn" class="user-dropdown-item" style="display: none;">
        <img src="icons/settings.svg" alt="" width="14" height="14">
        Opciones avanzadas
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
    updateViewToggleMenuLabel();
    
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

    document.getElementById('note-template-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.remove();
      openNoteTemplateModal();
    });

    document.getElementById('manage-tags-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.remove();
      openTagsModal();
    });

    document.getElementById('view-toggle-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.remove();
      toggleCronograma();
    });

    const statsMenuBtn = document.getElementById('stats-menu-btn');
    if (statsMenuBtn) {
      statsMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.remove();
        openStatsModal();
      });
    }

    document.getElementById('advanced-options-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.remove();
      // TODO: abrir el panel de opciones avanzadas.
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
  pushToUndoStack();
  const task = tasks[taskIndex];
  if (scope === 'only-this') {
    if (!task.recurrence.exceptions) task.recurrence.exceptions = [];
    if (!task.recurrence.exceptions.includes(sourceDateStr)) task.recurrence.exceptions.push(sourceDateStr);
    const standalone = { ...task, id: 'task-' + Date.now() + '-' + Math.floor(Math.random() * 1000), date: targetDateStr, recurrence: null };
    delete standalone.completedOccurrences;
    const afterEl = getDragAfterElement(targetColumnContainer, clientY);
    const checkDate = new Date(targetDateStr + 'T00:00:00');
    const dayTasks = tasks.filter(t => checkTaskOccurrence(t, checkDate));
    dayTasks.sort((a, b) => getEffectivePosition(a, targetDateStr) - getEffectivePosition(b, targetDateStr));
    let insertIndex = dayTasks.length;
    if (afterEl) { const idx = dayTasks.findIndex(t => t.id === afterEl.dataset.id); if (idx !== -1) insertIndex = idx; }
    dayTasks.splice(insertIndex, 0, standalone);
    dayTasks.forEach((t, i) => setEffectivePosition(t, targetDateStr, i * 10));
    tasks.push(standalone);
  } else {
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
    dayTasks.sort((a, b) => getEffectivePosition(a, targetDateStr) - getEffectivePosition(b, targetDateStr));
    let insertIndex = dayTasks.length;
    if (afterEl) { const idx = dayTasks.findIndex(t => t.id === afterEl.dataset.id); if (idx !== -1) insertIndex = idx; }
    dayTasks.splice(insertIndex, 0, task);
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

  pushToUndoStack();

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

      dayTasks.sort((a, b) => getEffectivePosition(a, targetDateStr) - getEffectivePosition(b, targetDateStr));

      let insertIndex = dayTasks.length;
      if (afterElement) {
        const afterTaskId = afterElement.dataset.id;
        insertIndex = dayTasks.findIndex(t => t.id === afterTaskId);
        if (insertIndex === -1) insertIndex = dayTasks.length;
      }

      dayTasks.splice(insertIndex, 0, clonedTask);

      dayTasks.forEach((t, idx) => {
        setEffectivePosition(t, targetDateStr, idx * 10);
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

    // Posicionar la tarea en el lugar donde se soltó. Todas las tareas se
    // reordenan manualmente (las horas ya no controlan el orden), así que
    // siempre respetamos la posición del cursor.
    {
      const afterElement = getDragAfterElement(targetColumnContainer, clientY);
      const checkDate = new Date(targetDateStr + 'T00:00:00');
      const dayTasks = tasks.filter(t => checkTaskOccurrence(t, checkDate) && t.id !== task.id);

      dayTasks.sort((a, b) => getEffectivePosition(a, targetDateStr) - getEffectivePosition(b, targetDateStr));

      let insertIndex = dayTasks.length;
      if (afterElement) {
        const afterTaskId = afterElement.dataset.id;
        insertIndex = dayTasks.findIndex(t => t.id === afterTaskId);
        if (insertIndex === -1) insertIndex = dayTasks.length;
      }

      dayTasks.splice(insertIndex, 0, task);

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
      <span class="completed-toggle-text">Completadas (${completedTasks.length})</span>
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
    dayTasks.sort((a, b) => getEffectivePosition(a, colDateStr) - getEffectivePosition(b, colDateStr));

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
  // Datepicker desplegable
  const datepicker = document.getElementById('custom-calendar-dropdown');
  if (datepicker && !datepicker.classList.contains('hidden')) return true;
  // Panel de archivados (drawer abierto = sin la clase closed)
  const drawer = document.getElementById('briefcase-drawer');
  if (drawer && !drawer.classList.contains('closed')) return true;
  return false;
}

function toggleCronograma() {
  cronogramaActive = !cronogramaActive;
  document.body.classList.toggle('cronograma-active', cronogramaActive);

  // Recordar la vista elegida para la próxima vez que se abra la app.
  try {
    window.localStorage.setItem('viewMode', cronogramaActive ? 'cronograma' : 'planner');
  } catch (e) {}

  const cronograma = document.getElementById('cronograma');
  const plannerGrid = document.querySelector('.planner-grid');

  if (cronogramaActive) {
    if (cronograma) cronograma.classList.remove('hidden');
    if (plannerGrid) plannerGrid.style.display = 'none';
    // El horario móvil siempre se abre en HOY.
    cronogramaMobileDate = null;
    renderCronograma();
    // En móvil, mostrar la fecha de hoy en la etiqueta superior.
    if (isMobile()) {
      const label = document.getElementById('week-range-label');
      if (label) label.textContent = formatSingleDate(new Date());
    }
    // Colocar el scroll para que la línea de hora quede bajo las cabeceras.
    requestAnimationFrame(scrollHorarioToNowLine);
  } else {
    if (cronograma) cronograma.classList.add('hidden');
    if (plannerGrid) plannerGrid.style.display = '';
    stopNowLineClock(); // detener el reloj de la línea de hora al salir del horario

    // En móvil el horario siempre muestra HOY; al volver al planner, colocar el
    // feed en HOY también (antes se quedaba en el inicio de la semana, p. ej. el
    // lunes 8, en vez del día que se estaba viendo). El feed estaba oculto, así
    // que esperamos a que tenga layout antes de scrollear.
    if (isMobile()) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => jumpMobileFeedToDate(new Date()));
      });
    }
  }

  updateViewToggleMenuLabel();
}

// Actualiza la etiqueta del ítem "Planner / Cronograma" del menú de usuario
// para que refleje la vista a la que cambiará al pulsarlo.
function updateViewToggleMenuLabel() {
  const label = document.getElementById('view-toggle-menu-label');
  if (label) label.textContent = cronogramaActive ? 'Vista Planner' : 'Vista Horario';
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

  // El botón de duración total del día (icono reloj) NO se muestra en el modo
  // horario: solo aparece en el planner.

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
  //   < 25 min            → el bloque NO se muestra en absoluto (return null).
  //   25–39 min           → solo el color (sin texto y sin checkbox).
  //   40–59 min           → título + checkbox, centrados verticalmente.
  //   >= 60 min           → título + descripción.
  const durationMin = bottomMin - topMin;
  if (durationMin < 25) return null;

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

  // Click en el bloque: abrir la tarea para editar (salvo click en el checkbox).
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
      block.appendChild(checkBtn);
    }
  }

  // Por debajo de 40 min: solo color (sin texto). (El <25 ya salió antes.)
  if (durationMin < 40) {
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

    if (crHasDesc) {
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
    addRange(range.startMin, range.endMin);
  });

  const prevDate = addDays(date, -1);
  tasks.forEach(task => {
    if (!checkTaskOccurrence(task, prevDate)) return;
    const tag = tags.find(t => t.id === task.tagId) || tags.find(t => t.id === 'default');
    if (tag && tag.visible === false) return;
    const range = getTaskTimeRange(task);
    if (!range || !range.crossesMidnight) return;
    addRange(0, range.rawEndMin); // cola: 00:00 → rawEndMin
  });

  // Si se hizo clic dentro de una tarea, no creamos nada (la abre su bloque).
  if (ranges.some(r => clickMin >= r.start && clickMin < r.end)) return;

  // Vecinos: tarea anterior (mayor end ≤ clickMin) y siguiente (menor start ≥ clickMin).
  let prevEnd = null, nextStart = null;
  ranges.forEach(r => {
    if (r.end <= clickMin) prevEnd = prevEnd === null ? r.end : Math.max(prevEnd, r.end);
    if (r.start >= clickMin) nextStart = nextStart === null ? r.start : Math.min(nextStart, r.start);
  });

  const gapStart = prevEnd === null ? 0 : prevEnd;
  const gapEnd = nextStart === null ? 24 * 60 : nextStart;

  selectedDayDate = dateStr;
  prefilledTimes = null;

  // Solo predefinir horas si el hueco está acotado por DOS tareas y mide < 2 h.
  if (prevEnd !== null && nextStart !== null && (gapEnd - gapStart) < 120) {
    const startMin = Math.min(gapStart + 1, gapEnd - 1);
    const endMin = Math.max(gapEnd - 1, gapStart + 1);
    prefilledTimes = { start: minutesToHHMM(startMin), end: minutesToHHMM(endMin) };
  }

  openTaskModal();
}

// Convierte minutos del día (0..1439) a "HH:MM".
function minutesToHHMM(min) {
  const m = Math.max(0, Math.min(1439, Math.round(min)));
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
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
    // ── MÓVIL: carrusel horizontal de columnas-día con snap nativo ──────────
    const centerDate = cronogramaMobileDate ? new Date(cronogramaMobileDate) : new Date(today);

    // Cabecera única (día centrado); se actualiza al deslizar.
    const dayNameUpper = CRONOGRAMA_DAY_NAMES[getAppDayIndex(centerDate) - 1];
    headersEl.appendChild(buildCronogramaHeader(centerDate, dayNameUpper, formatDate(centerDate) === todayStr));

    // Pista deslizable que contiene los días precargados.
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
    requestAnimationFrame(() => {
      scrollCronogramaTrackToDate(formatDate(centerDate), false);
      setupCronogramaTrackScroll();
    });

    // Línea de hora actual: se coloca dentro de la columna de HOY (si está).
    updateNowLineForMobile(todayStr);
  } else {
    // ── ESCRITORIO: 7 columnas-día en el grid (sin carrusel) ────────────────
    const dayDates = [];
    for (let i = 0; i < 7; i++) dayDates.push(addDays(currentWeekStart, i));

    dayDates.forEach((date, idx) => {
      headersEl.appendChild(buildCronogramaHeader(date, CRONOGRAMA_DAY_NAMES[idx], formatDate(date) === todayStr));
    });

    dayDates.forEach((date, idx) => {
      const colEl = document.createElement('div');
      colEl.className = 'cr-day-col' + (formatDate(date) === todayStr ? ' today' : '');
      colEl.dataset.col = String(idx + 1);
      colEl.dataset.date = formatDate(date);
      renderCronogramaDayBlocks(colEl, date);
      colEl.addEventListener('click', (e) => {
        // Solo en espacio vacío: si el clic llegó a un bloque, este ya lo
        // gestionó (stopPropagation). Ignorar también el final de un arrastre.
        if (e.target.closest('.cr-task-block')) return;
        if (suppressNextCronogramaClick) return;
        const rect = colEl.getBoundingClientRect();
        handleCronogramaEmptyClick(colEl, e.clientY - rect.top);
      });
      colEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        openDayContextMenu(e.clientX, e.clientY, idx + 1);
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

// Construye una columna-día para el carrusel móvil del horario.
function buildCronogramaMobileDayCol(date, todayStr) {
  const colEl = document.createElement('div');
  colEl.className = 'cr-day-col cr-mobile-day' + (formatDate(date) === todayStr ? ' today' : '');
  colEl.dataset.date = formatDate(date);
  renderCronogramaDayBlocks(colEl, date);
  colEl.addEventListener('click', (e) => {
    if (e.target.closest('.cr-task-block')) return;
    if (suppressNextCronogramaClick) return;
    const rect = colEl.getBoundingClientRect();
    handleCronogramaEmptyClick(colEl, e.clientY - rect.top);
  });
  return colEl;
}

// Coloca la línea de hora actual en el horario móvil. Se monta a nivel del GRID
// (capa fija, por encima de la columna de horas, no dentro del carrusel), de modo
// que su marca no queda tapada por las etiquetas de hora. Solo es visible cuando
// el día centrado del carrusel es HOY (se controla con sync...VisibilityMobile).
function updateNowLineForMobile(todayStr) {
  const grid = document.getElementById('cronograma-grid');
  if (!grid) { stopNowLineClock(); return; }
  // Quitar cualquier línea previa.
  const prev = document.getElementById('cr-now-line');
  if (prev) prev.remove();

  const nowLine = document.createElement('div');
  nowLine.className = 'cr-now-line cr-now-line-mobile';
  nowLine.id = 'cr-now-line';
  grid.appendChild(nowLine);
  updateNowLinePosition();
  startNowLineClock();

  // Mostrarla solo si el día centrado es hoy.
  syncNowLineVisibilityMobile(todayStr);
}

// Muestra u oculta la línea de "ahora" del horario móvil según el día centrado.
function syncNowLineVisibilityMobile(todayStr) {
  const nowLine = document.getElementById('cr-now-line');
  if (!nowLine) return;
  const ts = todayStr || formatDate(new Date());
  const centerStr = cronogramaMobileDate ? formatDate(cronogramaMobileDate) : ts;
  nowLine.style.display = (centerStr === ts) ? '' : 'none';
}

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

  track.addEventListener('scroll', () => {
    if (crTrackScrollTimer) clearTimeout(crTrackScrollTimer);
    // Mover la cabecera del día y la etiqueta en vivo mientras se desliza.
    const centered = getCenteredCronogramaCol(track);
    if (centered && centered.dataset.date) {
      const d = new Date(centered.dataset.date + 'T00:00:00');
      cronogramaMobileDate = d;
      updateCronogramaMobileHeader(d);
      updateCronogramaMobileLabel(d);
      // La línea de "ahora" solo se ve cuando el día centrado es hoy.
      syncNowLineVisibilityMobile();
    }
    // Al detenerse el scroll, expandir bordes si hace falta.
    crTrackScrollTimer = setTimeout(() => {
      currentWeekStart = getMondayOf(cronogramaMobileDate || new Date());
      expandCronogramaTrackIfNeeded(track);
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

// Actualiza la cabecera del día (única, fija) con la fecha centrada.
function updateCronogramaMobileHeader(date) {
  const headersEl = document.getElementById('cronograma-headers');
  if (!headersEl) return;
  const oldHeader = headersEl.querySelector('.day-header');
  if (!oldHeader) return;
  const todayStr = formatDate(new Date());
  const dayNameUpper = CRONOGRAMA_DAY_NAMES[getAppDayIndex(date) - 1];
  const newHeader = buildCronogramaHeader(date, dayNameUpper, formatDate(date) === todayStr);
  oldHeader.replaceWith(newHeader);
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
  const scroll = document.querySelector('.cronograma-scroll');
  const nowLine = document.getElementById('cr-now-line');
  if (!scroll || !nowLine) return;
  const now = new Date();
  const minutesIntoDay = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  // Si la hora está muy avanzada, la posición deseada puede superar el scroll
  // máximo posible: en ese caso simplemente bajamos hasta el fondo (sin dejar
  // la línea bajo las cabeceras, lo que provocaría un espacio vacío raro).
  const maxScroll = scroll.scrollHeight - scroll.clientHeight;
  scroll.scrollTop = Math.min(Math.max(0, minutesIntoDay), maxScroll);
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
const CR_SNAP_MIN = 30;      // granularidad del arrastre vertical

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

  crDrag = {
    block,
    task,
    durationMin,
    grid,
    cols,
    // Y del puntero al agarrar y top original del bloque (en minutos/px). El
    // movimiento se calcula como un DELTA puro desde aquí, evitando saltos.
    grabClientY: e.clientY,
    startColEl: block.parentElement,
    targetColEl: block.parentElement,
    originalStartMin: range.startMin,
    newStartMin: range.startMin,
    moved: false,
    pointerId: e.pointerId
  };

  block.classList.add('cr-dragging');
  block.style.pointerEvents = 'none'; // que no intercepte el hit-test de columnas
  try { block.setPointerCapture(e.pointerId); } catch (_) {}

  window.addEventListener('pointermove', onCronogramaDragMove);
  window.addEventListener('pointerup', onCronogramaDragEnd);
  window.addEventListener('keydown', onCronogramaDragKey);
  e.preventDefault();
}

// Escape mientras se arrastra: cancelar la operación (sin guardar ni mover).
function onCronogramaDragKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    cancelCronogramaDrag();
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

  drag.block.classList.remove('cr-dragging');
  drag.block.style.pointerEvents = '';
  try { drag.block.releasePointerCapture(drag.pointerId); } catch (_) {}
  clearCronogramaDragOver();

  // Evitar que un click/pointerup posterior abra el modal de edición.
  suppressNextCronogramaClick = true;
  setTimeout(() => { suppressNextCronogramaClick = false; }, 0);

  renderCronograma(); // restaura posiciones originales desde los datos
}

function onCronogramaDragMove(e) {
  if (!crDrag) return;
  applyCronogramaDragMove(e.clientX, e.clientY);
}

// Lógica compartida de movimiento (ratón y táctil): coloca el bloque bajo el
// puntero/dedo, elige columna destino por X y aplica el snap de 30 min por
// DELTA desde el punto donde se agarró. Recibe coordenadas de cliente.
function applyCronogramaDragMove(clientX, clientY) {
  if (!crDrag) return;
  crDrag.moved = true;

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
  const drag = crDrag;
  crDrag = null;

  window.removeEventListener('pointermove', onCronogramaDragMove);
  window.removeEventListener('pointerup', onCronogramaDragEnd);
  window.removeEventListener('keydown', onCronogramaDragKey);

  drag.block.classList.remove('cr-dragging');
  drag.block.style.pointerEvents = '';
  try { drag.block.releasePointerCapture(drag.pointerId); } catch (_) {}
  clearCronogramaDragOver();

  commitCronogramaDragResult(drag);
}

// Quita el resaltado .cr-drag-over de todas las columnas del horario. Se llama
// al soltar o cancelar el arrastre para no dejar columnas marcadas.
function clearCronogramaDragOver() {
  document.querySelectorAll('.cr-day-col.cr-drag-over')
    .forEach(c => c.classList.remove('cr-drag-over'));
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

  const newStartMin = drag.newStartMin;
  const newEndMin = newStartMin + drag.durationMin; // puede superar 1440 (cruza medianoche)
  const newDateStr = drag.targetColEl ? drag.targetColEl.dataset.date : null;

  const oldStart = (getTaskTimeRange(drag.task) || {}).startMin;
  const sameTime = oldStart === newStartMin;
  const sameDay = !newDateStr || newDateStr === drag.task.date;
  if (sameTime && sameDay) {
    renderCronograma(); // restaurar posición exacta por si el snap no cambió nada
    return;
  }

  pushToUndoStack();

  // Actualizar la hora en los CAMPOS (manteniendo la duración). El fin se envuelve
  // a 24h si la tarea cruza medianoche.
  const toHHMM = (min) => {
    const m = ((min % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };
  drag.task.startTime = toHHMM(newStartMin);
  drag.task.endTime = toHHMM(newEndMin);

  // Cambiar el día si se soltó en otra columna.
  if (newDateStr && newDateStr !== drag.task.date) {
    drag.task.date = newDateStr;
  }

  // Re-render INMEDIATO (síncrono) para que la vista refleje el cambio al
  // instante, sin esperar al guardado. El guardado va en segundo plano: así un
  // render diferido no puede ejecutarse en medio de un nuevo arrastre y pegar
  // saltos. (renderCronograma ya se auto-protege si crDrag está activo.)
  renderCronograma();
  saveTasksToStorage();
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

  crDrag = {
    block,
    task,
    durationMin,
    grid,
    cols,
    grabClientY: startY,
    startColEl: block.parentElement,
    targetColEl: block.parentElement,
    originalStartMin: range.startMin,
    newStartMin: range.startMin,
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

  // Feedback háptico (igual que el arrastre táctil del planner).
  if (navigator.vibrate) navigator.vibrate(50);
}

function onCronogramaTouchMove(e) {
  // Caso A: ya estamos arrastrando → mover el bloque y cortar el scroll.
  if (crDrag) {
    if (e.cancelable) e.preventDefault();
    const t = e.touches[0];
    // Guardar la última posición del dedo para el auto-scroll de borde (la usa
    // el bucle rAF para seguir moviendo el bloque mientras la vista se desplaza).
    crEdgeScroll.lastX = t.clientX;
    crEdgeScroll.lastY = t.clientY;
    applyCronogramaDragMove(t.clientX, t.clientY);
    updateCronogramaEdgeScroll(t.clientY);
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

function onCronogramaTouchEnd() {
  const wasDragging = !!crDrag;
  const drag = crDrag;

  // Quitar listeners y limpiar el estado de long-press si seguía pendiente.
  cancelCronogramaTouch();

  // Quitar la marca de documento del arrastre (restaura scroll y selección).
  document.body.classList.remove('cr-dragging-active');
  stopCronogramaEdgeScroll();
  clearCronogramaDragOver();

  if (wasDragging && drag) {
    crDrag = null;
    drag.block.classList.remove('cr-dragging');
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

// Muestra u oculta los botones de copiar/limpiar de la cabecera de un día según
// si ese día tiene al menos una tarea.
function updateDayHeaderButtonsVisibility(colElement, dateStr) {
  const hasTasks = dayHasAnyTask(dateStr);
  const copyBtn = colElement.querySelector('.copy-day-btn');
  const clearBtn = colElement.querySelector('.clear-day-btn');
  if (copyBtn) copyBtn.classList.toggle('day-btn-hidden', !hasTasks);
  if (clearBtn) clearBtn.classList.toggle('day-btn-hidden', !hasTasks);
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
    if (!isCurrentlyCompleted && AUTO_SET_END_TIME_ON_COMPLETE && task.endTime) {
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

          toggleTaskCompletion(task, occurrenceDate, endTimeChoice);

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

          toggleTaskCompletion(task, occurrenceDate, endTimeChoice);

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
  dayTasks.sort((a, b) => getEffectivePosition(a, targetDateStr) - getEffectivePosition(b, targetDateStr));

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

  if (selectedTaskId) {
    // EDIT MODE
    modalTitle.textContent = 'Editar tarea';
    deleteBtn.classList.remove('hidden');

    const task = tasks.find(t => t.id === selectedTaskId);
    if (!task) return;

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
    document.getElementById('task-input-title').focus();
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

/**
 * Aplica los cambios del formulario de tarea.
 *  scope: 'all'       -> modifica la tarea/serie completa (comportamiento normal)
 *         'only-this' -> separa la ocurrencia indicada como tarea independiente,
 *                        dejando la serie original intacta en los demas dias.
 */
function applyTaskChanges(scope, formData, taskId, occurrenceDate) {
  const { title, description, tagId, isBriefcase, date,
          startTime, endTime, duration, recurrence, alarm } = formData;

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
  dayTasks.sort((a, b) => getEffectivePosition(a, dateStr) - getEffectivePosition(b, dateStr));

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
    item.dataset.tagId = tag.id;

    // Handle de arrastre para reordenar (raton + tactil).
    // La etiqueta 'default' (Por defecto) queda fija arriba: sin handle, no se arrastra.
    if (tag.id !== 'default') {
      const grip = document.createElement('button');
      grip.className = 'tag-drag-handle';
      grip.title = 'Arrastrar para reordenar';
      grip.setAttribute('aria-label', 'Reordenar etiqueta');
      grip.innerHTML = `<img src="icons/grip.svg" alt="" width="14" height="14">`;
      grip.addEventListener('click', (e) => e.stopPropagation());
      item.appendChild(grip);
    } else {
      // Espaciador invisible para mantener alineado el contenido con las demas filas
      const spacer = document.createElement('span');
      spacer.className = 'tag-drag-handle tag-drag-handle-fixed';
      item.appendChild(spacer);
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

  setupTagDragAndDrop(container);
}

// ─── Reordenar etiquetas: arrastrar y soltar (raton + tactil) ────────────────
function setupTagDragAndDrop(container) {
  let dragItem = null;      // .tag-item que se arrastra
  let dragTagId = null;
  let ghost = null;         // clon flotante (solo tactil)
  let offsetY = 0;
  let touchTimer = null;
  let touchDragging = false;

  const items = () => [...container.querySelectorAll('.tag-item')];

  // Devuelve el item sobre el que deberia insertarse, segun la Y del cursor
  function itemAfter(y) {
    const others = items().filter(el => el !== dragItem);
    for (const el of others) {
      // Nunca insertar por ENCIMA de 'default': siempre va primera.
      if (el.dataset.tagId === 'default') continue;
      const r = el.getBoundingClientRect();
      if (y < r.top + r.height / 2) return el;
    }
    return null;
  }

  function commitOrder() {
    const orderedIds = items().map(el => el.dataset.tagId);
    tags.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
    // Garantia: 'default' (Por defecto) siempre primera.
    tags.sort((a, b) => (a.id === 'default' ? -1 : 0) - (b.id === 'default' ? -1 : 0));
    saveTagsToStorage();
    buildTagSelectorOptions();
  }

  container.querySelectorAll('.tag-drag-handle').forEach(handle => {
    const item = handle.closest('.tag-item');

    // ----- Raton (escritorio): HTML5 drag -----
    handle.setAttribute('draggable', 'true');
    handle.addEventListener('dragstart', (e) => {
      dragItem = item; dragTagId = item.dataset.tagId;
      item.classList.add('tag-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragTagId); } catch (err) {}
    });
    handle.addEventListener('dragend', () => {
      if (dragItem) dragItem.classList.remove('tag-dragging');
      commitOrder();
      dragItem = null; dragTagId = null;
    });

    // ----- Tactil (movil): long-press para arrastrar -----
    handle.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      touchTimer = setTimeout(() => {
        touchDragging = true;
        dragItem = item; dragTagId = item.dataset.tagId;
        item.classList.add('tag-dragging');
        if (navigator.vibrate) navigator.vibrate(40);
        const r = item.getBoundingClientRect();
        offsetY = touch.clientY - r.top;
        ghost = item.cloneNode(true);
        ghost.classList.add('tag-drag-ghost');
        ghost.style.position = 'fixed';
        ghost.style.left = r.left + 'px';
        ghost.style.top = r.top + 'px';
        ghost.style.width = r.width + 'px';
        ghost.style.pointerEvents = 'none';
        ghost.style.zIndex = '10000';
        document.body.appendChild(ghost);
        item.style.opacity = '0.3';
      }, 250);
    }, { passive: true });

    handle.addEventListener('touchmove', (e) => {
      if (!touchDragging) { if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; } return; }
      e.preventDefault();
      const touch = e.touches[0];
      if (ghost) ghost.style.top = (touch.clientY - offsetY) + 'px';
      const ref = itemAfter(touch.clientY);
      if (ref) container.insertBefore(dragItem, ref);
      else container.appendChild(dragItem);
    }, { passive: false });

    const endTouch = () => {
      if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
      if (touchDragging) {
        if (ghost) { ghost.remove(); ghost = null; }
        if (dragItem) { dragItem.style.opacity = ''; dragItem.classList.remove('tag-dragging'); }
        commitOrder();
        touchDragging = false; dragItem = null; dragTagId = null;
      }
    };
    handle.addEventListener('touchend', endTouch);
    handle.addEventListener('touchcancel', endTouch);
  });

  // Reordenamiento en vivo mientras se arrastra con raton
  container.addEventListener('dragover', (e) => {
    if (!dragItem) return;
    e.preventDefault();
    const ref = itemAfter(e.clientY);
    if (ref) container.insertBefore(dragItem, ref);
    else container.appendChild(dragItem);
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

    if (idx === selectedColorIndex && !customColor) {
      circle.classList.add('selected');
    }

    circle.addEventListener('click', () => {
      document.querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));
      circle.classList.add('selected');
      selectedColorIndex = idx;
      customColor = null;
      hideHslPicker();
    });

    container.appendChild(circle);
  });

  // Boton '+' (circulo negro) para definir un color personalizado HSL
  const addBtn = document.createElement('div');
  addBtn.className = 'color-circle color-circle-add';
  addBtn.title = 'Color personalizado';
  addBtn.innerHTML = '<span class="color-add-plus">+</span>';
  if (customColor) addBtn.classList.add('selected');
  addBtn.addEventListener('click', () => {
    document.querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));
    addBtn.classList.add('selected');
    selectedColorIndex = -1;
    showHslPicker();
  });
  container.appendChild(addBtn);
}

// ─── Selector de color personalizado (HSL) ───────────────────────────────────
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = x => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function updateHslPreview() {
  const h = +document.getElementById('hsl-h').value;
  const s = +document.getElementById('hsl-s').value;
  const l = +document.getElementById('hsl-l').value;
  const hex = hslToHex(h, s, l);
  customColor = { bg: hex, text: '#ffffff', border: hex };
  const prev = document.getElementById('hsl-preview');
  const val = document.getElementById('hsl-value');
  if (prev) prev.style.backgroundColor = hex;
  if (val) val.textContent = `${hex.toUpperCase()}  (H ${h}, S ${s}, L ${l})`;
}

function showHslPicker() {
  const picker = document.getElementById('hsl-picker');
  if (picker) picker.classList.remove('hidden');
  updateHslPreview();
}

function hideHslPicker() {
  const picker = document.getElementById('hsl-picker');
  if (picker) picker.classList.add('hidden');
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

  // Seleccionar el color: de la paleta, o personalizado (HSL)
  const colorIdx = DEFAULT_COLORS.findIndex(c => c.bg === tag.color.bg);
  if (colorIdx !== -1) {
    selectedColorIndex = colorIdx;
    customColor = null;
    buildColorPalette();
    hideHslPicker();
  } else {
    // Color personalizado: activarlo y precargar los sliders con su HSL
    selectedColorIndex = -1;
    customColor = { bg: tag.color.bg, text: tag.color.text || '#ffffff', border: tag.color.border || tag.color.bg };
    buildColorPalette();
    const [h, s, l] = hexToHsl(tag.color.bg);
    const hEl = document.getElementById('hsl-h'), sEl = document.getElementById('hsl-s'), lEl = document.getElementById('hsl-l');
    if (hEl) hEl.value = h;
    if (sEl) sEl.value = s;
    if (lEl) lEl.value = l;
    showHslPicker();
  }
}

// Convierte un hex (#rrggbb) a [H, S, L] enteros
function hexToHsl(hex) {
  let r = parseInt(hex.slice(1,3),16)/255;
  let g = parseInt(hex.slice(3,5),16)/255;
  let b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max+min)/2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max) {
      case r: h = (g-b)/d + (g<b?6:0); break;
      case g: h = (b-r)/d + 2; break;
      default: h = (r-g)/d + 4;
    }
    h /= 6;
  }
  return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
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
  customColor = null;
  hideHslPicker();
  buildColorPalette();
}

// Estado temporal del flujo de borrado de etiqueta (con reasignacion)
let pendingDeleteTagId = null;

async function deleteTag(tagId) {
  if (tagId === 'default') return;

  // Contar cuantas tareas tienen esta etiqueta asignada
  const affected = tasks.filter(t => t.tagId === tagId).length;

  if (affected === 0) {
    // No hay tareas: borrar directamente, sin preguntar
    performTagDeletion(tagId, null);
    return;
  }

  // Hay tareas: abrir modal para que el usuario decida que hacer con ellas
  openDeleteTagModal(tagId, affected);
}

function openDeleteTagModal(tagId, affected) {
  pendingDeleteTagId = tagId;
  const tag = tags.find(t => t.id === tagId);
  const tagName = tag ? tag.name : 'esta etiqueta';

  const msg = document.getElementById('delete-tag-message');
  if (msg) {
    const plural = affected === 1 ? 'tarea tiene' : 'tareas tienen';
    msg.innerHTML = `<strong>${affected}</strong> ${plural} la etiqueta &laquo;${tagName}&raquo;. ` +
      `Antes de eliminarla, elige qu&eacute; hacer con esas tareas:`;
  }

  // Llenar el selector: opcion de eliminar tareas + cada otra etiqueta como destino
  const select = document.getElementById('delete-tag-reassign-select');
  if (select) {
    select.innerHTML = '';
    // Opcion por defecto: reasignar a 'default'
    tags.filter(t => t.id !== tagId).forEach(t => {
      const opt = document.createElement('option');
      opt.value = 'reassign:' + t.id;
      opt.textContent = 'Reasignar a: ' + t.name;
      select.appendChild(opt);
    });
    // Opcion: eliminar las tareas
    const del = document.createElement('option');
    del.value = 'delete-tasks';
    del.textContent = 'Eliminar tambien esas tareas';
    select.appendChild(del);
  }

  const modal = document.getElementById('delete-tag-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeDeleteTagModal() {
  const modal = document.getElementById('delete-tag-modal');
  if (modal) modal.classList.add('hidden');
  pendingDeleteTagId = null;
}

function confirmDeleteTagModal() {
  if (!pendingDeleteTagId) { closeDeleteTagModal(); return; }
  const select = document.getElementById('delete-tag-reassign-select');
  const choice = select ? select.value : 'reassign:default';
  const tagId = pendingDeleteTagId;

  if (choice === 'delete-tasks') {
    performTagDeletion(tagId, { deleteTasks: true });
  } else if (choice.startsWith('reassign:')) {
    const targetId = choice.slice('reassign:'.length);
    performTagDeletion(tagId, { reassignTo: targetId });
  } else {
    performTagDeletion(tagId, { reassignTo: 'default' });
  }
  closeDeleteTagModal();
}

// Ejecuta el borrado de la etiqueta aplicando la accion elegida sobre las tareas.
//  action === null                  -> no habia tareas (nada que hacer con ellas)
//  action.reassignTo = id           -> mover las tareas a esa etiqueta
//  action.deleteTasks = true        -> eliminar las tareas
function performTagDeletion(tagId, action) {
  pushToUndoStack();

  if (action && action.deleteTasks) {
    tasks = tasks.filter(t => t.tagId !== tagId);
  } else {
    const target = (action && action.reassignTo) ? action.reassignTo : 'default';
    tasks = tasks.map(task =>
      task.tagId === tagId ? { ...task, tagId: target } : task
    );
  }

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
  buildTimerTagSelectorOptions();
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

let durationToastTimer = null;
function showDurationToast(msg) {
  let toast = document.getElementById('duration-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'duration-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(durationToastTimer);
  durationToastTimer = setTimeout(() => toast.classList.remove('visible'), 2000);
}

// --- Wire Up Event Listeners ---
// Abre el modal de estadísticas y reinicia su estado. Reutilizado por el botón
// de escritorio y por el ítem del menú de usuario (móvil).
function openStatsModal() {
  document.getElementById('stats-results').classList.add('hidden');
  document.getElementById('stats-keyword').value = '';
  document.getElementById('stats-period').value = 'today';
  document.getElementById('stats-custom-range').classList.add('hidden');
  document.getElementById('stats-modal').classList.remove('hidden');
  document.getElementById('stats-keyword').focus();
}

// --- Cronómetro de Tareas ---
let timerInterval = null;
let timerSeconds = 0;
let timerStartTime = null;
// true solo si el usuario EDITÓ manualmente la hora de inicio. Mientras sea
// false, el contador usa timerStartTime (con segundos reales) y arranca en 0,
// en lugar de la hora HH:MM redondeada del input (que perdería los segundos).
let timerStartEdited = false;

// Duración máxima del cronómetro: 12 horas (en milisegundos / segundos).
const TIMER_MAX_MS = 12 * 60 * 60 * 1000;
const TIMER_MAX_SECONDS = 12 * 60 * 60;

// ─── Persistencia del cronómetro activo ──────────────────────────────────────
// El estado del cronómetro se guarda en preferences (Supabase + caché local) de
// forma que, aunque el usuario cierre la app, el cronómetro "siga corriendo":
// al reabrir, el tiempo se recalcula desde la hora de inicio guardada.

// Guarda/actualiza el estado del cronómetro activo. Se llama al iniciar el
// cronómetro y cada vez que el usuario cambia el título o la etiqueta en vivo.
async function saveActiveTimerState() {
  if (!timerStartTime) return;
  const titleInput = document.getElementById('timer-input-title');
  const descInput = document.getElementById('timer-input-description');
  const startInput = document.getElementById('timer-input-start');
  const tagEl = document.getElementById('timer-select-tag');
  const state = {
    startTime: timerStartTime.toISOString(),       // hora REAL de arranque (contador/límite 12h)
    startTimeEdited: startInput ? startInput.value : '', // hora de inicio editada (HH:MM) para la tarea
    title: titleInput ? titleInput.value : '',
    description: descInput ? descInput.value : '',
    tagId: (tagEl && tagEl.value) ? tagEl.value : 'default'
  };
  await persistActiveTimer(state);
}

// Limpia el estado del cronómetro activo (al finalizar o cancelar).
async function clearActiveTimerState() {
  await persistActiveTimer(null);
}

// Escribe activeTimer en preferences. Reutiliza el patrón de savePreferences:
// fusiona con las preferencias en caché local y sincroniza con Supabase.
async function persistActiveTimer(activeTimer) {
  // Actualizar caché local inmediatamente (sobrevive a recargas sin red).
  if (currentUser) {
    const prefsCacheKey = 'prefs_cache_' + currentUser.id;
    let cached = {};
    try {
      const raw = localStorage.getItem(prefsCacheKey);
      if (raw) cached = JSON.parse(raw) || {};
    } catch (e) {}
    if (activeTimer) cached.activeTimer = activeTimer;
    else delete cached.activeTimer;
    try { localStorage.setItem(prefsCacheKey, JSON.stringify(cached)); } catch (e) {}
  }

  // Sincronizar con Supabase. Leemos las preferencias actuales para no pisar
  // notes/noteTemplate/copyOptions al hacer el upsert.
  if (!currentUser) return;
  try {
    const prefs = await loadPreferences();
    if (activeTimer) prefs.activeTimer = activeTimer;
    else delete prefs.activeTimer;
    await savePreferences(prefs);
  } catch (e) {
    console.warn('No se pudo sincronizar el estado del cronómetro con Supabase:', e);
  }
}

// Marca visualmente el botón del cronómetro como activo (rojo y parpadeante).
function setTimerButtonActive(active) {
  const btn = document.getElementById('timer-btn');
  if (!btn) return;
  btn.classList.toggle('timer-active', !!active);
}

function setTimerSelectTagValue(tagId) {
  const hiddenInput = document.getElementById('timer-select-tag');
  if (hiddenInput) {
    hiddenInput.value = tagId;
  }
  
  // Update trigger UI
  const tag = tags.find(t => t.id === tagId) || tags.find(t => t.id === 'default');
  const trigger = document.getElementById('timer-tag-select-trigger');
  if (trigger && tag) {
    const circle = trigger.querySelector('.custom-select-color-circle');
    const text = trigger.querySelector('.custom-select-trigger-text');
    if (circle) circle.style.backgroundColor = tag.color.bg;
    if (text) text.textContent = tag.name;
  }
}

function buildTimerTagSelectorOptions() {
  const container = document.getElementById('timer-tag-options-container');
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
      setTimerSelectTagValue(tag.id);
      container.classList.add('hidden');
      // Persistir la etiqueta en vivo si hay un cronómetro activo.
      if (timerStartTime) saveActiveTimerState();
    });

    container.appendChild(option);
  });
}

// Inicia un cronómetro NUEVO (botón de la barra). Registra la hora de inicio,
// guarda el estado en Supabase y abre el modal.
function startTimer() {
  const titleInput = document.getElementById('timer-input-title');
  if (titleInput) {
    titleInput.value = '';
  }
  const descInput = document.getElementById('timer-input-description');
  if (descInput) {
    descInput.value = '';
  }
  // Limpiar la hora editable para que openTimerModal la rellene con la real.
  const startInput = document.getElementById('timer-input-start');
  if (startInput) {
    startInput.value = '';
  }
  setTimerSelectTagValue('default');

  // Reset explícito del contador y del display, para que un cronómetro NUEVO
  // siempre arranque desde 00:00:00 sin importar cómo se cerró el anterior.
  timerSeconds = 0;
  timerStartEdited = false; // hora aún no editada por el usuario
  const timerDisplayEl = document.getElementById('timer-display');
  if (timerDisplayEl) timerDisplayEl.textContent = '00:00:00';

  // Registrar hora de inicio
  timerStartTime = new Date();

  // Abrir el modal primero para que la hora de inicio editable quede rellena,
  // y luego persistir el estado (incluida esa hora) en Supabase. Así el
  // cronómetro sigue "corriendo" aunque el usuario cierre la app.
  setTimerButtonActive(true);
  openTimerModal();
  saveActiveTimerState();

  // Enfoque inmediato al input de título
  if (titleInput) {
    titleInput.focus();
  }
}

// Abre el modal del cronómetro y arranca el intervalo de UI. El tiempo mostrado
// se calcula SIEMPRE desde timerStartTime, de modo que es correcto aunque la app
// haya estado cerrada un rato.
function openTimerModal() {
  if (!timerStartTime) return;

  const startHrs = String(timerStartTime.getHours()).padStart(2, '0');
  const startMins = String(timerStartTime.getMinutes()).padStart(2, '0');
  const startTimeStr = `${startHrs}:${startMins}`;

  // Rellenar la hora de inicio editable solo si está vacía, para no pisar una
  // hora que el usuario ya haya modificado (p. ej. tras minimizar y reabrir).
  const startTimeInput = document.getElementById('timer-input-start');
  if (startTimeInput && !startTimeInput.value) {
    startTimeInput.value = startTimeStr;
  }

  const timerDisplay = document.getElementById('timer-display');
  if (!timerDisplay) return;

  const timerModal = document.getElementById('timer-modal');
  if (timerModal) {
    timerModal.classList.remove('hidden');
  }

  if (timerInterval) {
    clearInterval(timerInterval);
  }

  renderTimerTick();
  timerInterval = setInterval(renderTimerTick, 1000);
}

// Actualiza el display del cronómetro. El tiempo corriendo se calcula desde la
// hora de inicio EFECTIVA (getEffectiveStartDate): si el usuario edita la hora de
// inicio, el contador se ajusta automáticamente, sin esperar al siguiente tick.
function renderTimerTick() {
  if (!timerStartTime) return;
  const timerDisplay = document.getElementById('timer-display');
  if (!timerDisplay) return;

  timerSeconds = Math.floor((Date.now() - getEffectiveStartDate().getTime()) / 1000);
  if (timerSeconds < 0) timerSeconds = 0;

  // Límite de 12 horas: al alcanzarlo, se finaliza automáticamente.
  if (timerSeconds >= TIMER_MAX_SECONDS) {
    finishTimerAuto();
    return;
  }

  const hrs = Math.floor(timerSeconds / 3600);
  const mins = Math.floor((timerSeconds % 3600) / 60);
  const secs = timerSeconds % 60;
  timerDisplay.textContent =
    String(hrs).padStart(2, '0') + ':' +
    String(mins).padStart(2, '0') + ':' +
    String(secs).padStart(2, '0');
}

// Cancelar: cierra el modal y descarta el cronómetro (limpia estado persistido).
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const timerModal = document.getElementById('timer-modal');
  if (timerModal) {
    timerModal.classList.add('hidden');
  }
  timerStartTime = null;
  timerSeconds = 0;
  timerStartEdited = false;

  // Limpiar también la UI: display a 00:00:00 e input de hora vacío, para que el
  // próximo cronómetro arranque de cero sin residuos del anterior.
  const timerDisplayEl = document.getElementById('timer-display');
  if (timerDisplayEl) timerDisplayEl.textContent = '00:00:00';
  const startInputEl = document.getElementById('timer-input-start');
  if (startInputEl) startInputEl.value = '';

  setTimerButtonActive(false);
  clearActiveTimerState();
}

// Minimizar: cierra la ventana pero el cronómetro SIGUE corriendo. No se toca
// timerStartTime ni el estado persistido; solo se detiene el intervalo de UI.
// El botón de la barra permanece activo (rojo parpadeante) y reabre el modal.
function minimizeTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const timerModal = document.getElementById('timer-modal');
  if (timerModal) {
    timerModal.classList.add('hidden');
  }
  setTimerButtonActive(true);
}

// Devuelve la hora de inicio EFECTIVA para guardar la tarea: si el usuario editó
// el campo "Hora de inicio" del cronómetro, usa esa hora (sobre la fecha del
// inicio real); si no, usa la hora real de arranque (timerStartTime).
function getEffectiveStartDate() {
  if (!timerStartTime) return new Date();
  // Si el usuario no editó la hora, usar timerStartTime tal cual (con segundos),
  // para que el contador arranque EXACTAMENTE en 00:00:00.
  if (!timerStartEdited) return timerStartTime;
  const input = document.getElementById('timer-input-start');
  const val = input ? input.value : '';
  const m = val && val.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return timerStartTime;
  const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  if (h > 23 || mi > 59) return timerStartTime;
  const d = new Date(timerStartTime);
  d.setHours(h, mi, 0, 0);
  return d;
}

// Construye y guarda la tarea cronometrada a partir de una hora de inicio y fin.
// title vacío → "Tarea cronometrada" (predomina siempre el nombre del usuario).
function createTimedTask(startDate, endDate, title, tagId, userDescription) {
  const startHrs = String(startDate.getHours()).padStart(2, '0');
  const startMins = String(startDate.getMinutes()).padStart(2, '0');
  const startTimeStr = `${startHrs}:${startMins}`;

  const endHrs = String(endDate.getHours()).padStart(2, '0');
  const endMins = String(endDate.getMinutes()).padStart(2, '0');
  const endTimeStr = `${endHrs}:${endMins}`;

  const durationMinutes = Math.round((endDate - startDate) / 60000);

  // Fecha del inicio en formato YYYY-MM-DD local
  const year = startDate.getFullYear();
  const month = String(startDate.getMonth() + 1).padStart(2, '0');
  const day = String(startDate.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  // La hora de inicio y fin NO se escriben en la descripción: viven en los
  // campos task.startTime / task.endTime (que es de donde la app muestra la hora
  // en su sección específica y el horario dibuja el bloque). La descripción
  // contiene únicamente lo que el usuario escribió.
  const description = (userDescription && userDescription.trim()) ? userDescription.trim() : '';

  const newTask = {
    id: 'task-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    title: (title && title.trim()) ? title.trim() : 'Tarea cronometrada',
    description: description,
    tagId: tagId || 'default',
    date: dateStr,
    startTime: startTimeStr,
    endTime: endTimeStr,
    duration: durationMinutes,
    recurrence: null,
    alarm: false,
    completed: false
  };

  pushToUndoStack();
  tasks.push(newTask);

  // Colocar la tarea ARRIBA de las tareas del día (las pendientes se renderizan
  // antes que las completadas, así que con la posición mínima queda al tope de
  // las no completadas del día en que se empezó a cronometrar).
  const sameDayTasks = tasks.filter(t => t.date === dateStr && t.id !== newTask.id);
  const minPos = sameDayTasks.reduce((min, t) => Math.min(min, t.position || 0), 0);
  newTask.position = minPos - 10;

  saveTasksToStorage();
  renderWeeklyCalendar();
  if (typeof refreshAlarms === 'function') refreshAlarms();

  return newTask;
}

// Finalizar manualmente desde el modal (botón "Finalizar").
function finishTimer() {
  // La duración mínima para guardar es 1 minuto, calculada desde la hora de
  // inicio EFECTIVA (la editada por el usuario si la cambió). Así, si el usuario
  // ajusta el inicio a varios minutos antes, puede guardar aunque no haya pasado
  // un minuto real desde que abrió el cronómetro.
  const elapsed = timerStartTime ? Math.floor((Date.now() - getEffectiveStartDate().getTime()) / 1000) : 0;
  if (elapsed < 60) {
    showDurationToast("Lo mínimo que se puede cronometrar es 1 minuto");
    return;
  }

  const titleInput = document.getElementById('timer-input-title');
  const title = titleInput ? titleInput.value.trim() : '';
  const descInput = document.getElementById('timer-input-description');
  const description = descInput ? descInput.value.trim() : '';
  const tagEl = document.getElementById('timer-select-tag');
  const tagId = tagEl ? tagEl.value : 'default';

  // Inicio = hora editada por el usuario (o la real); fin = hora real de término.
  createTimedTask(getEffectiveStartDate(), new Date(), title, tagId, description);

  // Detener intervalo, ocultar modal y limpiar estado persistido.
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const timerModal = document.getElementById('timer-modal');
  if (timerModal) {
    timerModal.classList.add('hidden');
  }
  timerStartTime = null;
  timerSeconds = 0;
  setTimerButtonActive(false);
  clearActiveTimerState();
}

// Finalización automática al alcanzar el límite de 12h con el modal abierto.
// Crea una tarea de exactamente 12 horas desde la hora de inicio.
function finishTimerAuto() {
  if (!timerStartTime) return;

  const titleInput = document.getElementById('timer-input-title');
  const title = titleInput ? titleInput.value.trim() : '';
  const descInput = document.getElementById('timer-input-description');
  const description = descInput ? descInput.value.trim() : '';
  const tagEl = document.getElementById('timer-select-tag');
  const tagId = tagEl ? tagEl.value : 'default';

  // Fin real = arranque real + 12h; inicio = hora editada por el usuario (o real).
  const endDate = new Date(timerStartTime.getTime() + TIMER_MAX_MS);
  createTimedTask(getEffectiveStartDate(), endDate, title, tagId, description);

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  const timerModal = document.getElementById('timer-modal');
  if (timerModal) {
    timerModal.classList.add('hidden');
  }
  timerStartTime = null;
  timerSeconds = 0;
  setTimerButtonActive(false);
  clearActiveTimerState();
  showDurationToast("El cronómetro alcanzó el máximo de 12 horas y se guardó como tarea");
}

// Reanuda un cronómetro guardado al reabrir la app. Si ya superó las 12h mientras
// la app estaba cerrada, crea la tarea de 12h automáticamente (silenciosa). Si no,
// marca el botón como activo (indicador rojo parpadeante) sin abrir el modal.
function resumeTimerFromState(state) {
  if (!state || !state.startTime) return;

  const start = new Date(state.startTime);
  if (isNaN(start.getTime())) return;

  const elapsedMs = Date.now() - start.getTime();

  // Aplica la hora de inicio editada (HH:MM) sobre la fecha real de arranque.
  const applyEditedStart = (baseDate, edited) => {
    const m = edited && String(edited).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return baseDate;
    const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
    if (h > 23 || mi > 59) return baseDate;
    const d = new Date(baseDate);
    d.setHours(h, mi, 0, 0);
    return d;
  };

  // Caso 1: ya se alcanzó el límite de 12h estando la app cerrada → tarea de 12h.
  if (elapsedMs >= TIMER_MAX_MS) {
    const endDate = new Date(start.getTime() + TIMER_MAX_MS);
    const effectiveStart = applyEditedStart(start, state.startTimeEdited);
    createTimedTask(effectiveStart, endDate, state.title, state.tagId, state.description);
    clearActiveTimerState();
    setTimerButtonActive(false);
    return;
  }

  // Caso 2: cronómetro aún activo (<12h) → restaurar estado y abrir la ventana.
  timerStartTime = start;
  timerSeconds = Math.floor(elapsedMs / 1000);
  setTimerButtonActive(true);

  // Restaurar título/descripción/hora/etiqueta en el modal. Si había una hora de
  // inicio editada, se conserva; si no, openTimerModal la rellenará con la real.
  const titleInput = document.getElementById('timer-input-title');
  if (titleInput) titleInput.value = state.title || '';
  const descInput = document.getElementById('timer-input-description');
  if (descInput) descInput.value = state.description || '';
  const startInput = document.getElementById('timer-input-start');
  if (startInput) startInput.value = state.startTimeEdited || '';
  // Solo tratamos la hora como "editada" si había un valor guardado distinto.
  timerStartEdited = !!state.startTimeEdited;
  setTimerSelectTagValue(state.tagId || 'default');

  // Al reabrir la app con un cronómetro corriendo, mostrar automáticamente la
  // ventana del cronómetro (tras cerrar la app, cambiar de dispositivo, etc.).
  openTimerModal();
}

function setupEventListeners() {
  // Navigation
  document.getElementById('prev-week-btn').addEventListener('click', () => {
    if (isMobile()) {
      // En el horario móvil, navegar día a día con el mismo botón.
      if (cronogramaActive) { shiftCronogramaMobileDay(-1); return; }
      const visibleDate = getMobileVisibleDate() || new Date();
      jumpMobileFeedToDate(addDays(visibleDate, -1));
    } else {
      navigateToWeek(-1);
    }
  });

  document.getElementById('next-week-btn').addEventListener('click', () => {
    if (isMobile()) {
      if (cronogramaActive) { shiftCronogramaMobileDay(1); return; }
      const visibleDate = getMobileVisibleDate() || new Date();
      jumpMobileFeedToDate(addDays(visibleDate, 1));
    } else {
      navigateToWeek(1);
    }
  });

  document.getElementById('today-btn').addEventListener('click', () => {
    if (isMobile()) {
      if (cronogramaActive) { goToCronogramaMobileDate(new Date()); return; }
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
    } else if (e.key === 'k' || e.key === 'K') {
      // Alternar entre Planner y Horario, solo si no hay ninguna ventana abierta.
      if (isAnyOverlayOpen()) return;
      e.preventDefault();
      toggleCronograma();
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

  // Campos de hora del editor: la "Hora de fin" se habilita solo si hay inicio,
  // y se muestra la duración calculada en tiempo real.
  const taskStartInput = document.getElementById('task-input-start');
  const taskEndInput = document.getElementById('task-input-end');
  if (taskStartInput) {
    taskStartInput.addEventListener('input', () => {
      syncEndTimeEnabled();
      updateDurationDisplay();
      syncAlarmCheckboxState();
    });
  }
  if (taskEndInput) {
    taskEndInput.addEventListener('input', updateDurationDisplay);
  }

  // Campos de hora: se puede ESCRIBIR con el teclado Y abrir el selector nativo.
  // - Teclear los segmentos HH/MM funciona de forma nativa cuando el campo tiene
  //   el foco (por eso NO hacemos preventDefault, que bloquearía el foco).
  // - Un clic de ratón en el campo abre además el selector desplegable nativo.
  // Las pulsaciones de teclado (Tab para enfocar, dígitos para escribir) NO
  // abren el desplegable, así que ambas vías conviven.
  [taskStartInput, taskEndInput].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('click', () => {
      if (inp.disabled) return;
      if (typeof inp.showPicker === 'function') {
        try { inp.showPicker(); } catch (_) {}
      }
    });
  });

  // Botones ✕ "Sin hora": vacían el campo y refrescan fin/alarma/duración.
  // (Solo los que tienen data-target; el ✕ de fecha se maneja por separado.)
  document.querySelectorAll('.time-clear-btn[data-target]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const target = document.getElementById(btn.dataset.target);
      if (!target || target.disabled) return;
      target.value = '';
      syncEndTimeEnabled();
      updateDurationDisplay();
      syncAlarmCheckboxState();
    });
  });

  // Icono de campana → activa/desactiva la alarma (solo si hay hora de inicio).
  const alarmBell = document.getElementById('task-alarm-bell');
  if (alarmBell) {
    alarmBell.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startEl = document.getElementById('task-input-start');
      const checkbox = document.getElementById('task-alarm-checkbox');
      if (!checkbox || !(startEl && startEl.value)) return; // sin hora → no se activa
      checkbox.checked = !checkbox.checked;
      syncAlarmCheckboxState();
    });
  }

  // Iconos de reloj y de calendario (a la izquierda del campo) → abren el
  // selector nativo del campo correspondiente.
  document.querySelectorAll('.time-clock-icon, .date-calendar-icon').forEach(icon => {
    icon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const target = document.getElementById(icon.dataset.target);
      if (!target || target.disabled) return;
      if (typeof target.showPicker === 'function') {
        try { target.showPicker(); } catch (_) { target.focus(); }
      } else {
        target.focus();
      }
    });
  });

  // ✕ junto a la FECHA → quita la fecha y archiva la tarea (reutiliza el checkbox
  // oculto de archivar, disparando su lógica existente).
  const dateClearBtn = document.getElementById('task-date-clear');
  if (dateClearBtn) {
    dateClearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const briefcaseCheckbox = document.getElementById('task-in-briefcase-checkbox');
      if (!briefcaseCheckbox) return;
      // Alternar: si tiene fecha → archivar (sin fecha); si ya está archivada →
      // desarchivar y volver a habilitar la fecha (hoy por defecto).
      briefcaseCheckbox.checked = !briefcaseCheckbox.checked;
      briefcaseCheckbox.dispatchEvent(new Event('change'));
    });
  }

  // Close modals clicking X
  document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetModal = btn.dataset.modal;
      document.getElementById(targetModal).classList.add('hidden');
    });
  });

  // Close modals clicking backdrop & blur active element when clicking non-input card areas
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    // Solo cerramos si el gesto EMPEZO y TERMINO en el fondo. Asi, si el usuario
    // empieza a seleccionar texto dentro de un campo y arrastra el mouse fuera
    // de la ventana (soltando sobre el fondo), el modal NO se cierra por error.
    let pressStartedOnBackdrop = false;
    backdrop.addEventListener('mousedown', (e) => {
      pressStartedOnBackdrop = (e.target === backdrop);
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop && pressStartedOnBackdrop) {
        // El modal del cronómetro no se "oculta a secas" al hacer clic fuera:
        // se minimiza (sigue corriendo, el botón de la barra queda activo). Así
        // no queda un cronómetro corriendo de forma inconsistente.
        if (backdrop.id === 'timer-modal' && timerStartTime) {
          minimizeTimer();
        } else {
          backdrop.classList.add('hidden');
        }
      } else if (!e.target.closest('input, textarea, select, button, .custom-select-trigger, .color-circle')) {
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
          document.activeElement.blur();
        }
      }
      pressStartedOnBackdrop = false;
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

  // La alarma solo se habilita si la descripcion empieza con una hora de inicio.
  const descInput = document.getElementById('task-input-description');
  if (descInput) descInput.addEventListener('input', syncAlarmCheckboxState);

  // Botón "Aceptar" del modal de alarma.
  const alarmAcceptBtn = document.getElementById('alarm-accept-btn');
  if (alarmAcceptBtn) alarmAcceptBtn.addEventListener('click', acceptAlarmModal);

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

    // Hora de inicio / fin desde los campos del editor. Ambas son OPCIONALES e
    // INDEPENDIENTES: se puede definir un fin sin inicio (y viceversa).
    const startInputEl = document.getElementById('task-input-start');
    const endInputEl = document.getElementById('task-input-end');
    const startTime = (startInputEl && startInputEl.value) ? startInputEl.value : null;
    const endTime = (endInputEl && endInputEl.value) ? endInputEl.value : null;

    // Duración (minutos) a partir de inicio/fin (soporta cruce de medianoche).
    let duration = null;
    if (startTime && endTime) {
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      let diff = (eh * 60 + em) - (sh * 60 + sm);
      if (diff < 0) diff += 24 * 60;
      duration = diff;
    }

    // Alarma: solo válida si hay hora de inicio (campo).
    const alarmCheckboxEl = document.getElementById('task-alarm-checkbox');
    const alarm = !!(alarmCheckboxEl && alarmCheckboxEl.checked && startTime);

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

    // Empaquetar los datos del formulario para aplicarlos (posiblemente tras
    // preguntar el alcance en tareas recurrentes).
    const formData = { title, description, tagId, isBriefcase, date,
                       startTime, endTime, duration, recurrence, alarm };

    // ¿Es la edicion de una tarea recurrente existente sobre una ocurrencia
    // concreta? Entonces preguntamos: todas / solo esta.
    const existingForScope = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) : null;
    const isRecurringEdit = existingForScope && existingForScope.recurrence &&
                            existingForScope.recurrence.enabled && !isBriefcase &&
                            selectedOccurrenceDate;

    if (isRecurringEdit) {
      // Guardar contexto y mostrar el modal de alcance.
      pendingEditFormData = formData;
      pendingEditTaskId = selectedTaskId;
      pendingEditOccurrenceDate = selectedOccurrenceDate;
      openEditRecurringModal();
      return;
    }

    // Caso normal (no recurrente, o nueva tarea): aplicar directo.
    applyTaskChanges('all', formData, selectedTaskId, selectedOccurrenceDate);
    closeTaskModal();
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

  // Edit Recurring Modal - botones de alcance
  document.querySelectorAll('.close-edit-recurring-btn, [data-modal="edit-recurring-modal"]').forEach(btn => {
    btn.addEventListener('click', () => { pendingMoveTask = null; closeEditRecurringModal(); });
  });
  const editOnlyThisBtn = document.getElementById('edit-only-this-btn');
  if (editOnlyThisBtn) editOnlyThisBtn.addEventListener('click', () => {
    if (pendingMoveTask) {
      executeMoveTask('only-this', pendingMoveTask); pendingMoveTask = null;
    } else if (pendingEditFormData) {
      applyTaskChanges('only-this', pendingEditFormData, pendingEditTaskId, pendingEditOccurrenceDate);
    }
    closeEditRecurringModal();
    closeTaskModal();
  });
  const editAllBtn = document.getElementById('edit-all-occurrences-btn');
  if (editAllBtn) editAllBtn.addEventListener('click', () => {
    if (pendingMoveTask) {
      executeMoveTask('all', pendingMoveTask); pendingMoveTask = null;
    } else if (pendingEditFormData) {
      applyTaskChanges('all', pendingEditFormData, pendingEditTaskId, pendingEditOccurrenceDate);
    }
    closeEditRecurringModal();
    closeTaskModal();
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
      const timerModal = document.getElementById('timer-modal');
      const isTimerModalOpen = timerModal && !timerModal.classList.contains('hidden');
      if (isTimerModalOpen) {
        e.preventDefault();
        // Escape minimiza (el cronómetro sigue corriendo); no lo descarta.
        minimizeTimer();
        return;
      }

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

  // El botón de etiquetas de la barra superior se eliminó: "Gestionar etiquetas"
  // ahora vive en el menú del usuario (avatar), enlazado al crear el dropdown.

  // ─── Cronómetro ─────────────────────────────────────────────────────────────
  const timerBtn = document.getElementById('timer-btn');
  if (timerBtn) {
    timerBtn.addEventListener('click', () => {
      // Si ya hay un cronómetro activo, reabrir el modal en curso en lugar de
      // iniciar uno nuevo (evita perder el cronómetro que sigue corriendo).
      if (timerStartTime) {
        openTimerModal();
        const titleInput = document.getElementById('timer-input-title');
        if (titleInput) titleInput.focus();
      } else {
        startTimer();
      }
    });
  }

  // Guardado en vivo del título mientras el cronómetro corre, para que una tarea
  // creada automáticamente (límite de 12h) use el nombre elegido.
  const timerTitleInput = document.getElementById('timer-input-title');
  if (timerTitleInput) {
    timerTitleInput.addEventListener('input', () => {
      if (timerStartTime) saveActiveTimerState();
    });
  }

  const timerDescInput = document.getElementById('timer-input-description');
  if (timerDescInput) {
    timerDescInput.addEventListener('input', () => {
      if (timerStartTime) saveActiveTimerState();
    });
  }

  const timerStartInput = document.getElementById('timer-input-start');
  if (timerStartInput) {
    timerStartInput.addEventListener('input', () => {
      if (timerStartTime) {
        // El usuario cambió la hora manualmente: a partir de aquí el contador
        // usa la hora editada. Se ajusta de inmediato.
        timerStartEdited = true;
        renderTimerTick();
        saveActiveTimerState();
      }
    });
    // Clic de ratón → abre el selector nativo. Teclear (con el campo enfocado)
    // sigue funcionando de forma nativa, así conviven ambas vías.
    timerStartInput.addEventListener('click', () => {
      if (timerStartInput.disabled) return;
      if (typeof timerStartInput.showPicker === 'function') {
        try { timerStartInput.showPicker(); } catch (_) {}
      }
    });
  }

  const timerCancelBtn = document.getElementById('timer-cancel-btn');
  if (timerCancelBtn) {
    timerCancelBtn.addEventListener('click', stopTimer);
  }

  const timerMinimizeBtn = document.getElementById('timer-minimize-btn');
  if (timerMinimizeBtn) {
    timerMinimizeBtn.addEventListener('click', minimizeTimer);
  }

  // La X de la esquina superior también minimiza (no descarta el cronómetro).
  const timerCloseBtn = document.getElementById('timer-close-btn');
  if (timerCloseBtn) {
    timerCloseBtn.addEventListener('click', minimizeTimer);
  }

  const timerStopBtn = document.getElementById('timer-stop-btn');
  if (timerStopBtn) {
    timerStopBtn.addEventListener('click', finishTimer);
  }

  // ─── Estadísticas ──────────────────────────────────────────────────────────
  const statsBtn = document.getElementById('stats-btn');
  if (statsBtn) {
    statsBtn.addEventListener('click', openStatsModal);
  }

  const statsCancelBtn = document.getElementById('stats-cancel-btn');
  if (statsCancelBtn) {
    statsCancelBtn.addEventListener('click', () => {
      document.getElementById('stats-modal').classList.add('hidden');
    });
  }

  // Mostrar/ocultar rango personalizado según el periodo
  const statsPeriodSelect = document.getElementById('stats-period');
  if (statsPeriodSelect) {
    statsPeriodSelect.addEventListener('change', () => {
      const customRange = document.getElementById('stats-custom-range');
      customRange.classList.toggle('hidden', statsPeriodSelect.value !== 'custom');
    });
  }

  const statsAcceptBtn = document.getElementById('stats-accept-btn');
  if (statsAcceptBtn) {
    statsAcceptBtn.addEventListener('click', runStatsCalculation);
  }

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

  // Sliders del selector de color personalizado (HSL): actualizar en vivo
  ['hsl-h', 'hsl-s', 'hsl-l'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateHslPreview);
  });

  // Submit Tag Form
  document.getElementById('tag-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('tag-input-name').value.trim();
    const editId = document.getElementById('tag-edit-id').value;
    // Si hay un color personalizado activo (boton '+'), usarlo; si no, el de la paleta.
    const color = customColor ? customColor : DEFAULT_COLORS[selectedColorIndex];

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

  // Delete Tag (reassign) modal buttons
  const delTagCancel = document.getElementById('delete-tag-cancel-btn');
  if (delTagCancel) delTagCancel.addEventListener('click', closeDeleteTagModal);
  const delTagConfirm = document.getElementById('delete-tag-confirm-btn');
  if (delTagConfirm) delTagConfirm.addEventListener('click', confirmDeleteTagModal);

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

  // Custom Select Dropdown for Timer Tags
  const timerTagSelectTrigger = document.getElementById('timer-tag-select-trigger');
  const timerTagOptionsContainer = document.getElementById('timer-tag-options-container');

  if (timerTagSelectTrigger && timerTagOptionsContainer) {
    timerTagSelectTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      timerTagOptionsContainer.classList.toggle('hidden');
    });

    // Close options list when clicking outside
    document.addEventListener('click', (e) => {
      if (!timerTagSelectTrigger.contains(e.target) && !timerTagOptionsContainer.contains(e.target)) {
        timerTagOptionsContainer.classList.add('hidden');
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
      const col = clearBtn.closest('.day-column, .cronograma-headers .day-header');
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
      const col = dialogueBtn.closest('.day-column, .cronograma-headers .day-header');
      if (col) {
        const dateStr = col.dataset.date;
        if (dateStr) {
          openNotesModal(dateStr);
        }
      }
    }
  });

  // Delegación de eventos para copiar las tareas del día como texto
  document.addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.copy-day-btn');
    if (copyBtn) {
      e.stopPropagation();
      const col = copyBtn.closest('.day-column, .cronograma-headers .day-header');
      if (col) {
        const dateStr = col.dataset.date;
        if (dateStr) {
          openCopyTextModal(dateStr);
        }
      }
    }
  });

  // Botón "Copiar" del modal de copiar tareas como texto
  const copyTextBtn = document.getElementById('copy-text-btn');
  if (copyTextBtn) {
    copyTextBtn.addEventListener('click', handleCopyTextConfirm);
  }

  // Mantener coherentes las casillas dependientes del modal de copiar
  ['copy-opt-completed', 'copy-opt-pending'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', updateCopyOptionsState);
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

  // Botón de plantilla dentro de la nota del día: pega la plantilla guardada
  // en la posición del cursor y se oculta hasta reabrir la nota.
  const notesTemplateBtn = document.getElementById('notes-template-btn');
  if (notesTemplateBtn) {
    notesTemplateBtn.addEventListener('click', () => {
      const ta = document.getElementById('notes-textarea');
      if (!ta) return;
      const tpl = noteTemplate || '';
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      ta.value = ta.value.slice(0, start) + tpl + ta.value.slice(end);
      // Reposicionar el cursor justo después del texto pegado.
      const pos = start + tpl.length;
      ta.focus();
      ta.setSelectionRange(pos, pos);
      // Ocultar el botón hasta que la nota se cierre y se vuelva a abrir.
      notesTemplateBtn.style.display = 'none';
    });
  }

  // Eventos del modal de Plantilla de notas
  const noteTemplateSaveBtn = document.getElementById('note-template-save-btn');
  if (noteTemplateSaveBtn) noteTemplateSaveBtn.addEventListener('click', saveNoteTemplate);
  const noteTemplateCancelBtn = document.getElementById('note-template-cancel-btn');
  if (noteTemplateCancelBtn) noteTemplateCancelBtn.addEventListener('click', closeNoteTemplateModal);

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

  // Basurero en archivados (solo móvil)
  const briefcaseTrashBtn = document.getElementById('briefcase-trash-btn');
  if (briefcaseTrashBtn) {
    // Mostrar solo en móvil
    if (isMobile()) briefcaseTrashBtn.style.display = '';

    briefcaseTrashBtn.addEventListener('click', () => {
      const briefcaseTasks = tasks.filter(t => !t.date);
      if (briefcaseTasks.length === 0) return;
      if (!confirm('¿Eliminar todas las tareas archivadas?')) return;
      pushToUndoStack();
      tasks = tasks.filter(t => t.date);
      saveTasksToStorage();
      renderBriefcaseTasks();
      renderWeeklyCalendar();
    });
  }

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

  // ── Tooltip escritorio ───────────────────────────────────────────────────
  const durationTooltip = document.getElementById('duration-tooltip');
  document.addEventListener('mouseover', e => {
    if (isMobile()) return;
    const btn = e.target.closest('.duration-day-btn');
    if (!btn || !durationTooltip) return;
    durationTooltip.textContent = btn.dataset.tooltip || '';
    const rect = btn.getBoundingClientRect();
    durationTooltip.style.top = (rect.top + rect.height / 2) + 'px';
    durationTooltip.style.left = (rect.left - 8) + 'px';
    durationTooltip.style.transform = 'translate(-100%, -50%)';
    durationTooltip.classList.add('visible');
  });
  document.addEventListener('mouseout', e => {
    if (isMobile()) return;
    const btn = e.target.closest('.duration-day-btn');
    if (!btn || !durationTooltip) return;
    durationTooltip.classList.remove('visible');
  });

  // ── Toast móvil ──────────────────────────────────────────────────────────
  document.addEventListener('click', e => {
    if (!isMobile()) return;
    const btn = e.target.closest('.duration-day-btn');
    if (!btn) return;
    e.stopPropagation();
    showDurationToast(btn.dataset.tooltip || '');
  });

  // ── Horario (escritorio): mostrar los iconos de la cabecera al pasar el cursor
  //    por CUALQUIER parte de la columna del día, no solo por la cabecera. ───────
  setupCronogramaColumnHover();

  // Restaurar la vista (planner/cronograma) guardada por el usuario.
  restoreSavedViewMode();
}

// Marca la cabecera del día correspondiente cuando el cursor está sobre el cuerpo
// de su columna en el horario (escritorio), para revelar sus iconos. Usa
// delegación sobre el grid; se configura una sola vez.
function setupCronogramaColumnHover() {
  const grid = document.getElementById('cronograma-grid');
  if (!grid) return;

  const setHeaderHover = (dateStr, on) => {
    const headersEl = document.getElementById('cronograma-headers');
    if (!headersEl || !dateStr) return;
    const header = headersEl.querySelector(`.day-header[data-date="${dateStr}"]`);
    if (header) header.classList.toggle('cr-col-hover', on);
  };

  grid.addEventListener('mouseover', (e) => {
    if (isMobile()) return;
    const col = e.target.closest('.cr-day-col');
    if (!col) return;
    setHeaderHover(col.dataset.date, true);
  });

  grid.addEventListener('mouseout', (e) => {
    if (isMobile()) return;
    const col = e.target.closest('.cr-day-col');
    if (!col) return;
    // Solo desmarcar si el cursor salió realmente de la columna (no a un hijo).
    if (col.contains(e.relatedTarget)) return;
    setHeaderHover(col.dataset.date, false);
  });
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

// ─── Estadísticas ────────────────────────────────────────────────────────────
// Normaliza texto para búsqueda: minúsculas y sin acentos/diacríticos.
function normalizeForSearch(str) {
  return (str || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

// Devuelve el rango [from, to] (YYYY-MM-DD inclusive) según el periodo.
// Para 'custom' lee los inputs de fecha. Si un extremo falta, queda como null.
function getStatsDateRange(period) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const toStr = formatDate(today);

  if (period === 'today') {
    return { from: toStr, to: toStr };
  }
  if (period === 'last10' || period === 'last30') {
    const days = period === 'last10' ? 10 : 30;
    const from = new Date(today);
    from.setDate(from.getDate() - (days - 1));
    return { from: formatDate(from), to: toStr };
  }
  if (period === 'week') {
    const from = new Date(today);
    const dow = (from.getDay() + 6) % 7;
    from.setDate(from.getDate() - dow);
    return { from: formatDate(from), to: toStr };
  }
  if (period === 'month') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1, 12);
    return { from: formatDate(from), to: toStr };
  }
  if (period === 'year') {
    const from = new Date(today.getFullYear(), 0, 1, 12);
    return { from: formatDate(from), to: toStr };
  }
  if (period === 'custom') {
    const fromInput = document.getElementById('stats-date-from').value || null;
    const toInput = document.getElementById('stats-date-to').value || null;
    return { from: fromInput, to: toInput };
  }
  return { from: null, to: null };
}

function dateInRange(dateStr, from, to) {
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

// Calcula estadísticas sobre tareas COMPLETADAS cuyo TÍTULO contiene la palabra
// clave, dentro del rango de fechas.
// Cuenta los días del rango [from, to] inclusive. Devuelve null si falta algún extremo.
function countDaysInRange(from, to) {
  if (!from || !to) return null;
  const start = new Date(from + 'T12:00:00');
  const end = new Date(to + 'T12:00:00');
  const diff = Math.round((end - start) / 86400000);
  return diff >= 0 ? diff + 1 : null;
}

function computeStats(keyword, period) {
  const kw = normalizeForSearch(keyword);
  const { from, to } = getStatsDateRange(period);
  const totalDays = countDaysInRange(from, to);

  let repetitions = 0;
  const uniqueDays = new Set();
  let totalMinutes = 0;
  let hasAnyDuration = false;

  tasks.forEach(task => {
    if (kw && !normalizeForSearch(task.title).includes(kw)) return;

    const minutes = getTaskDurationMinutes(task) || 0;

    const addOccurrence = (dateStr) => {
      if (!dateInRange(dateStr, from, to)) return;
      repetitions += 1;
      uniqueDays.add(dateStr);
      if (minutes > 0) {
        totalMinutes += minutes;
        hasAnyDuration = true;
      }
    };

    if (task.recurrence && task.recurrence.enabled) {
      (task.completedOccurrences || []).forEach(addOccurrence);
    } else if (task.completed && task.date) {
      addOccurrence(task.date);
    }
  });

  return { repetitions, days: uniqueDays.size, totalDays, totalMinutes, hasAnyDuration };
}

function runStatsCalculation() {
  const keyword = document.getElementById('stats-keyword').value.trim();
  const period = document.getElementById('stats-period').value;
  const stats = computeStats(keyword, period);
  document.getElementById('stats-repetitions').textContent = stats.repetitions;
  if (stats.totalDays) {
    const pct = Math.round((stats.days / stats.totalDays) * 100);
    document.getElementById('stats-days').textContent =
      `${stats.days}/${stats.totalDays} días (${pct}%)`;
  } else {
    document.getElementById('stats-days').textContent = stats.days;
  }
  document.getElementById('stats-total-time').textContent =
    stats.hasAnyDuration ? minutesToReadable(stats.totalMinutes) : '—';
  document.getElementById('stats-results').classList.remove('hidden');
}

// Devuelve la hora actual en formato "HH:MM".
function currentTimeHHMM() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}

// Diálogo de conflicto de hora de fin. Se muestra cuando, al completar una
// tarea que YA tiene hora de fin, hay que decidir entre conservarla o
// reemplazarla por la hora actual. Devuelve una Promise que resuelve a:
//   'cancel'    → no completar / no cambiar nada
//   'keep'      → mantener la hora de fin original
//   'overwrite' → usar la hora actual como hora de fin
function askEndTimeConflict(originalEnd, currentEnd) {
  return new Promise((resolve) => {
    // Overlay.
    const overlay = document.createElement('div');
    overlay.className = 'endtime-conflict-overlay';

    const box = document.createElement('div');
    box.className = 'endtime-conflict-box';

    const h = document.createElement('h3');
    h.className = 'endtime-conflict-title';
    h.textContent = 'Hora de fin';

    const p = document.createElement('p');
    p.className = 'endtime-conflict-desc';
    p.textContent = 'Esta tarea ya tiene una hora de fin asignada. ¿Qué deseas hacer?';

    const info = document.createElement('div');
    info.className = 'endtime-conflict-info';
    info.innerHTML =
      `<div><span>Hora original</span><strong>${originalEnd}</strong></div>` +
      `<div><span>Hora actual</span><strong>${currentEnd}</strong></div>`;

    const actions = document.createElement('div');
    actions.className = 'endtime-conflict-actions';

    const finish = (value) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') finish('cancel'); };
    document.addEventListener('keydown', onKey);

    const btnCancel = document.createElement('button');
    btnCancel.className = 'btn btn-secondary';
    btnCancel.textContent = 'Cancelar';
    btnCancel.addEventListener('click', () => finish('cancel'));

    const btnKeep = document.createElement('button');
    btnKeep.className = 'btn btn-primary';
    btnKeep.textContent = 'Conservar';
    btnKeep.addEventListener('click', () => finish('keep'));

    const btnOverwrite = document.createElement('button');
    btnOverwrite.className = 'btn btn-primary';
    btnOverwrite.textContent = 'Sobrescribir';
    btnOverwrite.addEventListener('click', () => finish('overwrite'));

    actions.append(btnCancel, btnKeep, btnOverwrite);
    box.append(h, p, info, actions);
    overlay.appendChild(box);
    // Clic fuera de la caja = cancelar.
    overlay.addEventListener('click', (e) => { if (e.target === overlay) finish('cancel'); });
    document.body.appendChild(overlay);
  });
}

// preResolvedEndTimeChoice (opcional): si el llamador ya mostró el diálogo de
// conflicto de hora de fin y obtuvo la decisión del usuario, la pasa aquí para
// no volver a abrirlo. Valores: 'keep' | 'overwrite' (o null si no aplica).
async function toggleTaskCompletion(task, occurrenceDate, preResolvedEndTimeChoice = null) {
  pushToUndoStack();

  let nowCompleted;
  if (task.recurrence && task.recurrence.enabled) {
    if (!task.completedOccurrences) {
      task.completedOccurrences = [];
    }
    const idx = task.completedOccurrences.indexOf(occurrenceDate);
    if (idx !== -1) {
      task.completedOccurrences.splice(idx, 1);
      nowCompleted = false;
    } else {
      task.completedOccurrences.push(occurrenceDate);
      nowCompleted = true;
    }
  } else {
    task.completed = !task.completed;
    nowCompleted = task.completed;
  }

  // ── Hora de fin automática al COMPLETAR ────────────────────────────────────
  // Si la función está activada y la tarea pasa a completada, se rellena su hora
  // de fin con la hora actual. Si ya tenía una hora de fin, se pregunta al
  // usuario qué hacer. Aplica con o sin hora de inicio.
  if (AUTO_SET_END_TIME_ON_COMPLETE && nowCompleted) {
    const nowStr = currentTimeHHMM();
    if (task.endTime) {
      // Ya hay hora de fin: usar la decisión que el llamador ya obtuvo del
      // diálogo, o abrirlo aquí si no vino precomputada.
      const choice = preResolvedEndTimeChoice || await askEndTimeConflict(task.endTime, nowStr);
      if (choice === 'cancel') {
        // Revertir la marca de completado y no tocar nada más.
        if (task.recurrence && task.recurrence.enabled) {
          const i = task.completedOccurrences.indexOf(occurrenceDate);
          if (i !== -1) task.completedOccurrences.splice(i, 1);
        } else {
          task.completed = false;
        }
        renderWeeklyCalendar();
        return;
      }
      if (choice === 'overwrite') {
        task.endTime = nowStr;
      }
      // 'keep' → no se modifica la hora de fin.
    } else {
      // No tenía hora de fin: se asigna directamente la hora actual.
      task.endTime = nowStr;
    }
  }

  // Reubicar la tarea segun su nuevo estado:
  //  - completada  -> al final de la lista (debajo de las demas completadas)
  //  - descompletada -> al principio (encima de las demas no completadas)
  // Para ello le damos una posicion mayor o menor que la del resto de tareas
  // de ese mismo dia. El render separa completadas/pendientes pero respeta el
  // orden por posicion dentro de cada grupo.
  const dateStr = occurrenceDate || task.date;
  if (dateStr) {
    const checkDate = new Date(dateStr + 'T00:00:00');
    const others = tasks.filter(t => t.id !== task.id && checkTaskOccurrence(t, checkDate));
    if (others.length > 0) {
      const positions = others.map(t => getEffectivePosition(t, dateStr));
      if (nowCompleted) {
        setEffectivePosition(task, dateStr, Math.max(...positions) + 10);
      } else {
        setEffectivePosition(task, dateStr, Math.min(...positions) - 10);
      }
    }
  }

  saveTasksToStorage();
  renderWeeklyCalendar();
}

// ─── Feed horizontal de semana (solo móvil) ──────────────────────────────────
// Los 7 días de la semana actual se renderizan como tarjetas deslizables
// horizontalmente con scroll-snap. Navegar semanas reemplaza el contenido.

let mobileScrollInit = false;

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

  const pendingMins = getDurationForDay(dateStr, false);
  const completedMins = getDurationForDay(dateStr, true);
  const clockTitle = buildDurationTooltip(dateStr);
  const clockActiveClass = (pendingMins > 0 || completedMins > 0) ? ' has-duration' : '';

  // Móvil: orden de iconos -> reloj, copiar, basurero, notas.
  header.innerHTML = `
    <span class="day-name">${DAY_NAMES[date.getDay()]}</span>
    <span class="day-number">${date.getDate()}</span>
    <button class="duration-day-btn${clockActiveClass}" data-tooltip="${clockTitle}">
      <img src="icons/clock.svg" alt="Duración total" width="14" height="14">
    </button>
    <button class="copy-day-btn" title="Copiar tareas como texto">
      <img src="icons/copy.svg" alt="Copiar tareas" width="16" height="16">
    </button>
    <button class="clear-day-btn" title="Eliminar todas las tareas de este día">
      <img src="icons/trash.svg" alt="Limpiar día" width="16" height="16">
    </button>
    <button class="${notesClass}" title="Notas">
      <img src="${iconSrc}" alt="Notas">
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
  dayTasks.sort((a, b) => getEffectivePosition(a, dateStr) - getEffectivePosition(b, dateStr));
  renderTasksToContainer(dayTasks, tasksContainer, dateStr);
  col.appendChild(tasksContainer);

  // Mostrar/ocultar botones de copiar y limpiar segun haya tareas en el dia
  updateDayHeaderButtonsVisibility(col, dateStr);

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

function buildMobileFeed(monday) {
  const grid = document.querySelector('.planner-grid');
  if (!grid) return;

  grid.innerHTML = '';
  // Renderizar 3 semanas: anterior + actual + siguiente
  for (let i = -7; i < 14; i++) {
    grid.appendChild(makeMobileDayCard(addDays(monday, i)));
  }
}

// Expande el feed añadiendo días al principio o al final sin perder posición de scroll
function expandMobileFeed(dir) {
  const grid = document.querySelector('.planner-grid');
  if (!grid) return;

  if (dir === 'start') {
    // Añadir 7 días antes del primer día existente
    const firstDay = grid.querySelector('.mobile-feed-day');
    if (!firstDay) return;
    const firstDate = new Date(firstDay.dataset.date + 'T00:00:00');
    const prevScrollLeft = grid.scrollLeft;
    const fragment = document.createDocumentFragment();
    for (let i = 7; i >= 1; i--) {
      fragment.appendChild(makeMobileDayCard(addDays(firstDate, -i)));
    }
    const widthBefore = grid.scrollWidth;
    grid.prepend(fragment);
    // Mantener posición visual
    grid.scrollLeft = prevScrollLeft + (grid.scrollWidth - widthBefore);
  } else {
    // Añadir 7 días después del último día existente
    const days = grid.querySelectorAll('.mobile-feed-day');
    const lastDay = days[days.length - 1];
    if (!lastDay) return;
    const lastDate = new Date(lastDay.dataset.date + 'T00:00:00');
    for (let i = 1; i <= 7; i++) {
      grid.appendChild(makeMobileDayCard(addDays(lastDate, i)));
    }
  }
}

function getMobileVisibleDate() {
  const grid = document.querySelector('.planner-grid');
  if (!grid) return null;
  const days = grid.querySelectorAll('.mobile-feed-day');
  for (const day of days) {
    const rect = day.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    if (rect.left >= gridRect.left - 10) {
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
    grid.scrollLeft = targetEl.offsetLeft - 4;
  }
}

function scrollMobileFeedToToday() {
  scrollMobileFeedToDate(new Date());
}

function jumpMobileFeedToDate(targetDate) {
  const grid = document.querySelector('.planner-grid');
  const dateStr = formatDate(new Date(targetDate));
  const existing = grid && grid.querySelector(`.mobile-feed-day[data-date="${dateStr}"]`);

  if (existing) {
    // El día ya está en el feed infinito — solo scrollear
    grid.scrollTo({ left: existing.offsetLeft - 4, behavior: 'smooth' });
    updateWeekLabelFromScroll();
  } else {
    // Reconstruir centrado en esa fecha
    const monday = getMondayOf(new Date(targetDate));
    currentWeekStart = monday;
    buildMobileFeed(monday);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollMobileFeedToDate(new Date(targetDate));
        updateWeekLabelFromScroll();
      });
    });
  }
}

function updateWeekLabelFromScroll() {
  const grid = document.querySelector('.planner-grid');
  if (!grid) return;
  const days = grid.querySelectorAll('.mobile-feed-day');
  let visibleDay = null;
  for (const day of days) {
    const rect = day.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();
    if (rect.left >= gridRect.left - 10) {
      visibleDay = day;
      break;
    }
  }
  if (visibleDay) {
    const date = new Date(visibleDay.dataset.date + 'T00:00:00');
    currentWeekStart = getMondayOf(date);
    document.getElementById('week-range-label').textContent = formatSingleDate(date);
  }
}

function initMobileFeed() {
  if (!isMobile()) return;
  const grid = document.querySelector('.planner-grid');
  if (!grid) return;

  buildMobileFeed(currentWeekStart);

  // Scroll al día de hoy con un doble frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      scrollMobileFeedToToday();
      mobileScrollInit = true;
    });
  });

  // Actualizar label al deslizar + expandir feed infinito
  grid.addEventListener('scroll', () => {
    if (!isMobile() || !mobileScrollInit) return;
    updateWeekLabelFromScroll();

    // Expandir al acercarse al borde izquierdo
    if (grid.scrollLeft < grid.clientWidth * 2) {
      expandMobileFeed('start');
    }
    // Expandir al acercarse al borde derecho
    if (grid.scrollLeft + grid.clientWidth > grid.scrollWidth - grid.clientWidth * 2) {
      expandMobileFeed('end');
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

    const durationBtn2 = col.querySelector('.duration-day-btn');
    if (durationBtn2) {
      const pendingMins2 = getDurationForDay(dateStr, false);
      const completedMins2 = getDurationForDay(dateStr, true);
      if (pendingMins2 > 0 || completedMins2 > 0) {
        durationBtn2.classList.add('has-duration');
        durationBtn2.dataset.tooltip = buildDurationTooltip(dateStr);
      } else {
        durationBtn2.classList.remove('has-duration');
        durationBtn2.dataset.tooltip = 'Sin tareas con duración definida';
      }
    }


    // Mostrar/ocultar botones de copiar y limpiar segun haya tareas en el dia
    updateDayHeaderButtonsVisibility(col, dateStr);

    const tasksContainer = col.querySelector('.tasks-container');
    if (tasksContainer) {
      tasksContainer.innerHTML = '';
      const dayTasks = tasks.filter(task => {
        const isOccurring = checkTaskOccurrence(task, date);
        if (!isOccurring) return false;
        const tag = tags.find(t => t.id === task.tagId) || tags.find(t => t.id === 'default');
        return tag ? tag.visible !== false : true;
      });
      dayTasks.sort((a, b) => getEffectivePosition(a, dateStr) - getEffectivePosition(b, dateStr));
      renderTasksToContainer(dayTasks, tasksContainer, dateStr);
    }
  });
  renderBriefcaseTasks();
}

// Compatibilidad — no necesaria en móvil horizontal
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
      // Ir ARRIBA del panel: posicion menor que la minima existente.
      const minPos = briefcaseTasks.reduce((min, t) => Math.min(min, t.position || 0), 0);
      briefcaseTask.position = minPos - 10;
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

      briefcaseTasks.forEach((t, idx) => {
        t.position = idx * 10;
      });
    } else {
      const briefcaseTasks = tasks.filter(t => !t.date && t.id !== task.id);
      // Ir ARRIBA del panel: posicion menor que la minima existente.
      const minPos = briefcaseTasks.reduce((min, t) => Math.min(min, t.position || 0), 0);
      task.position = minPos - 10;
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

function getAccessTokenSync() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
        const v = JSON.parse(localStorage.getItem(k));
        if (v && v.access_token) return v.access_token;
        if (v && v.currentSession && v.currentSession.access_token) return v.currentSession.access_token;
      }
    }
  } catch (e) {}
  return null;
}

function beaconFlushTasks() {
  if (!currentUser) return;
  const pendingSyncKey = 'tasks_pending_sync_' + currentUser.id;
  if (localStorage.getItem(pendingSyncKey) !== 'true') return;
  if (!tasks || tasks.length === 0) return;
  try {
    // Al cerrar la pestaña enviamos solo las tareas nuevas/modificadas (diff),
    // no toda la lista. Los borrados se completan en la próxima sincronización
    // normal (un upsert vía keepalive es fiable; encadenar un delete no lo es).
    const { changed } = computeTaskDiff(tasks);
    if (changed.length === 0) return;
    const rows = changed.map(t => ({ id: t.id, user_id: currentUser.id, data: t }));
    const url = SUPABASE_URL + '/rest/v1/tasks?on_conflict=id';
    const token = getAccessTokenSync() || SUPABASE_ANON_KEY;
    fetch(url, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + token,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(rows)
    }).then(() => {
      // Si el envío arranca bien, reflejamos esos cambios en el snapshot para no
      // reenviarlos al reabrir. (Best-effort: si falla, se reintenta normal.)
      changed.forEach(t => lastSyncedById.set(t.id, JSON.stringify(t)));
      persistSyncSnapshot();
    }).catch(() => {});
  } catch (e) {}
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') beaconFlushTasks();
});

window.addEventListener('beforeunload', (e) => {
  beaconFlushTasks();
  if (currentUser) {
    const pendingSyncKey = 'tasks_pending_sync_' + currentUser.id;
    if (localStorage.getItem(pendingSyncKey) === 'true') {
      e.preventDefault();
      e.returnValue = '';
    }
  }
});
// Reintentar la sincronizacion en cuanto vuelva la conexion.
window.addEventListener('online', () => {
  flushPendingSync();
});

// ─── Recuperación de horas perdidas (uso manual desde la consola) ─────────────
// Reconstruye startTime/endTime de las tareas a partir del respaldo _descBackup
// (o, en su defecto, de la descripción actual) leyendo DIRECTAMENTE de Supabase.
// Uso: en la consola del navegador (con tu sesión iniciada):
//   await recuperarHoras()            → DIAGNÓSTICO (no cambia nada)
//   await recuperarHoras(true)        → aplica los cambios y guarda en Supabase
window.recuperarHoras = async function (aplicar = false) {
  if (!currentUser) { console.warn('No hay sesión iniciada.'); return; }

  // Leer las filas reales del usuario desde Supabase.
  const { data, error } = await sb.from('tasks').select('*').eq('user_id', currentUser.id);
  if (error) { console.error('Error leyendo tareas:', error); return; }
  const rows = data || [];

  // Extrae "HH:MM - HH:MM" o "HH:MM" del inicio de un texto.
  const extractTimes = (text) => {
    if (!text || typeof text !== 'string') return null;
    const s = text.trimStart();
    let m = s.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
    if (m) {
      const sh = +m[1], sm = +m[2], eh = +m[3], em = +m[4];
      if (sh <= 23 && sm <= 59 && eh <= 23 && em <= 59) {
        return {
          startTime: `${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}`,
          endTime: `${String(eh).padStart(2,'0')}:${String(em).padStart(2,'0')}`
        };
      }
    }
    m = s.match(/^(\d{1,2}):(\d{2})/);
    if (m) {
      const sh = +m[1], sm = +m[2];
      if (sh <= 23 && sm <= 59) {
        return { startTime: `${String(sh).padStart(2,'0')}:${String(sm).padStart(2,'0')}`, endTime: null };
      }
    }
    return null;
  };

  let conBackup = 0, yaTienenHora = 0, recuperables = 0, sinFuente = 0;
  const cambios = [];

  rows.forEach(row => {
    const t = row.data || {};
    const tieneHora = !!t.startTime;
    if (tieneHora) { yaTienenHora++; return; } // no tocar las que ya tienen hora

    // Fuente: primero el respaldo, luego la descripción actual.
    const fuente = (t._descBackup !== undefined && t._descBackup !== null)
      ? t._descBackup : (t.description || '');
    if (t._descBackup !== undefined) conBackup++;

    const found = extractTimes(fuente);
    if (found) {
      recuperables++;
      cambios.push({ id: row.id, titulo: t.title, ...found, fuente });
    } else {
      sinFuente++;
    }
  });

  console.log('───── DIAGNÓSTICO DE HORAS ─────');
  console.log('Total de tareas:', rows.length);
  console.log('Ya tienen hora (no se tocan):', yaTienenHora);
  console.log('Con respaldo _descBackup:', conBackup);
  console.log('RECUPERABLES (se les puede poner hora):', recuperables);
  console.log('Sin hora detectable:', sinFuente);
  if (cambios.length) {
    console.table(cambios.map(c => ({ titulo: c.titulo, inicio: c.startTime, fin: c.endTime, origen: c.fuente })));
  }

  if (!aplicar) {
    console.log('▶ Esto fue solo un diagnóstico. Para APLICAR, ejecuta: await recuperarHoras(true)');
    return { recuperables, cambios };
  }

  if (cambios.length === 0) { console.log('No hay nada que aplicar.'); return; }

  // Aplicar: actualizar cada fila en Supabase (no destructivo: solo añade hora).
  let ok = 0, fail = 0;
  for (const c of cambios) {
    const row = rows.find(r => r.id === c.id);
    const nuevo = { ...row.data, startTime: c.startTime, endTime: c.endTime, _timeFieldsMigrated: true };
    const { error: upErr } = await sb.from('tasks').update({ data: nuevo }).eq('id', c.id).eq('user_id', currentUser.id);
    if (upErr) { console.error('Falló', c.id, upErr); fail++; }
    else ok++;
  }
  console.log(`✔ Aplicado: ${ok} tareas actualizadas, ${fail} fallos.`);
  console.log('Recarga la app para ver las horas. (Quizá necesites Ctrl+Shift+R.)');
  return { ok, fail };
};
// EOF

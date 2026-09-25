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
// fin" con la hora actual (si ya tenía una, ver ASK_END_TIME_CONFLICT).
// Se activa/desactiva en el menú del avatar > Ajustes y se guarda en las
// preferencias del usuario (preferences.autoSetEndTimeOnComplete).
// Por defecto está DESACTIVADA.
let autoSetEndTimeOnComplete = false;

// Cuando la tarea YA tiene hora de fin, normalmente se abre un aviso para que el
// usuario elija (Cancelar / Conservar / Sobrescribir). Con este flag en false,
// ese aviso NO se muestra: simplemente se conserva la hora de fin original y la
// tarea se marca como completada sin interrupción. Poner en true para reactivar.
const ASK_END_TIME_CONFLICT = false;


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
        <button type="button" class="auth-forgot-link" id="auth-forgot-link">¿Olvidaste tu contraseña?</button>
      </form>
      <form id="auth-reset-form" class="auth-form hidden">
        <p class="auth-reset-intro">Introduce tu correo y te enviaremos un enlace para restablecer tu contraseña.</p>
        <div class="auth-field">
          <label>Correo electrónico</label>
          <input type="email" id="auth-reset-email" placeholder="tu@email.com" required autocomplete="email">
        </div>
        <div id="auth-reset-error" class="auth-error hidden"></div>
        <div id="auth-reset-success" class="auth-success hidden"></div>
        <button type="submit" class="auth-submit-btn" id="auth-reset-btn"><span>Enviar enlace</span></button>
        <button type="button" class="auth-forgot-link" id="auth-reset-back">Volver a iniciar sesión</button>
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

  // Mostrar formulario de recuperación de contraseña
  const loginForm = document.getElementById('auth-login-form');
  const resetForm = document.getElementById('auth-reset-form');
  const tabsEl = screen.querySelector('.auth-tabs');
  document.getElementById('auth-forgot-link').addEventListener('click', () => {
    loginForm.classList.add('hidden');
    tabsEl.classList.add('hidden');
    resetForm.classList.remove('hidden');
    document.getElementById('auth-reset-error').classList.add('hidden');
    document.getElementById('auth-reset-success').classList.add('hidden');
    // Precargar el correo si ya se escribió en el login
    document.getElementById('auth-reset-email').value = document.getElementById('auth-login-email').value.trim();
  });
  document.getElementById('auth-reset-back').addEventListener('click', () => {
    resetForm.classList.add('hidden');
    tabsEl.classList.remove('hidden');
    loginForm.classList.remove('hidden');
  });

  // Enviar enlace de recuperación
  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('auth-reset-btn');
    const errorEl = document.getElementById('auth-reset-error');
    const successEl = document.getElementById('auth-reset-success');
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Enviando…';

    let errorObj = null;
    try {
      const { error } = await sb.auth.resetPasswordForEmail(
        document.getElementById('auth-reset-email').value.trim(),
        { redirectTo: window.location.origin + window.location.pathname }
      );
      errorObj = error;
    } catch (err) {
      console.error(err);
      errorObj = { message: 'Error de conexión o seguridad. Si estás usando file://, abre la app mediante un servidor local (npm run dev).' };
    }

    if (errorObj) {
      errorEl.textContent = translateAuthError(errorObj.message);
      errorEl.classList.remove('hidden');
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Enviar enlace';
    } else {
      successEl.textContent = 'Te enviamos un enlace para restablecer tu contraseña. Revisa tu correo (y la carpeta de spam).';
      successEl.classList.remove('hidden');
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Enviar enlace';
    }
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

// Formulario para fijar la nueva contraseña tras llegar desde el email de recuperación
function showResetPasswordForm() {
  const card = document.querySelector('#auth-screen .auth-card');
  if (!card) return;
  card.innerHTML = `
    <div class="auth-logo">
      <img src="icons/logo svg.png" alt="Planner7" height="28" style="width: auto;">
    </div>
    <form id="auth-newpass-form" class="auth-form">
      <p class="auth-reset-intro">Elige tu nueva contraseña.</p>
      <div class="auth-field">
        <label>Nueva contraseña</label>
        <input type="password" id="auth-newpass-password" placeholder="Mínimo 6 caracteres" required minlength="6" autocomplete="new-password">
      </div>
      <div class="auth-field">
        <label>Confirmar contraseña</label>
        <input type="password" id="auth-newpass-confirm" placeholder="Repite la contraseña" required minlength="6" autocomplete="new-password">
      </div>
      <div id="auth-newpass-error" class="auth-error hidden"></div>
      <div id="auth-newpass-success" class="auth-success hidden"></div>
      <button type="submit" class="auth-submit-btn" id="auth-newpass-btn"><span>Guardar contraseña</span></button>
    </form>
  `;
  document.getElementById('auth-newpass-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('auth-newpass-btn');
    const errorEl = document.getElementById('auth-newpass-error');
    const successEl = document.getElementById('auth-newpass-success');
    const password = document.getElementById('auth-newpass-password').value;
    const confirm = document.getElementById('auth-newpass-confirm').value;
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');
    if (password !== confirm) {
      errorEl.textContent = 'Las contraseñas no coinciden.';
      errorEl.classList.remove('hidden');
      return;
    }
    btn.disabled = true;
    btn.querySelector('span').textContent = 'Guardando…';

    let errorObj = null;
    try {
      const { error } = await sb.auth.updateUser({ password });
      errorObj = error;
    } catch (err) {
      console.error(err);
      errorObj = { message: 'Error de conexión o seguridad.' };
    }

    if (errorObj) {
      errorEl.textContent = translateAuthError(errorObj.message);
      errorEl.classList.remove('hidden');
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Guardar contraseña';
    } else {
      successEl.textContent = '¡Contraseña actualizada! Entrando…';
      successEl.classList.remove('hidden');
    }
  });
}

function translateAuthError(msg) {
  const map = {
    'Invalid login credentials': 'Correo o contraseña incorrectos.',
    'Email not confirmed': 'Confirma tu correo antes de iniciar sesión.',
    'User already registered': 'Ya existe una cuenta con ese correo.',
    'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
    'Unable to validate email address: invalid format': 'El formato del correo no es válido.',
    'For security purposes, you can only request this after 60 seconds.': 'Por seguridad, espera 60 segundos antes de volver a solicitarlo.',
    'New password should be different from the old password.': 'La nueva contraseña debe ser distinta de la anterior.',
  };
  return map[msg] || msg;
}

// ─── Ajustes (menú del avatar) ───────────────────────────────────────────────
// Cada opción se aplica al instante y se guarda en preferences (Supabase) y en
// el caché local de preferencias.
function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  const toggle = document.getElementById('setting-auto-end-time');
  if (!modal || !toggle) return;
  toggle.checked = autoSetEndTimeOnComplete;
  if (toggle.dataset.bound !== 'true') {
    toggle.dataset.bound = 'true';
    toggle.addEventListener('change', () => {
      autoSetEndTimeOnComplete = toggle.checked;
      saveSettingPreference('autoSetEndTimeOnComplete', autoSetEndTimeOnComplete);
    });
  }
  modal.classList.remove('hidden');
}

async function saveSettingPreference(key, value) {
  if (!currentUser) return;
  const prefsCacheKey = 'prefs_cache_' + currentUser.id;
  let prefs = {};
  try {
    const cachedPrefs = localStorage.getItem(prefsCacheKey);
    if (cachedPrefs) prefs = JSON.parse(cachedPrefs);
  } catch (e) {}
  prefs[key] = value;
  try {
    localStorage.setItem(prefsCacheKey, JSON.stringify(prefs));
  } catch (e) {}
  await savePreferences(prefs);
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
      <button id="buscador-menu-btn" class="user-dropdown-item">
        <img src="icons/search.svg" alt="" width="14" height="14">
        Buscador
      </button>
      <button id="stats-menu-btn" class="user-dropdown-item">
        <img src="icons/bar-chart.svg" alt="" width="14" height="14">
        Estadísticas
      </button>
      <button id="settings-menu-btn" class="user-dropdown-item">
        <img src="icons/settings.svg" alt="" width="14" height="14">
        Ajustes
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

    document.getElementById('note-template-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.remove();
      openNoteTemplateModal();
    });

    const buscadorMenuBtn = document.getElementById('buscador-menu-btn');
    if (buscadorMenuBtn) {
      buscadorMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.remove();
        openBuscadorModal();
      });
    }

    const statsMenuBtn = document.getElementById('stats-menu-btn');
    if (statsMenuBtn) {
      statsMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.remove();
        estadisticasGenerales(formatDate(new Date()));
      });
    }

    document.getElementById('settings-menu-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.remove();
      openSettingsModal();
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


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
const SLOT_COUNT = 6;
const iconOptions = defaultHabits.map(habit => ({ icon: habit.icon, name: habit.name }));
let habits = defaultHabits.map(habit => ({ ...habit }));
const DAY_COUNT = 31;
const viewport = document.getElementById('history-viewport');
const grid = document.getElementById('habit-grid');
const track = document.getElementById('scroll-track');
const thumb = document.getElementById('scroll-thumb');
const stats = document.getElementById('stats-dialog');
const backdrop = document.getElementById('tracker-backdrop');
const launcher = document.getElementById('launcher');
const announcement = document.getElementById('announcement');
const editor = document.getElementById('habit-editor');
const habitForm = document.getElementById('habit-form');
const nameInput = document.getElementById('habit-name');
let editingIndex = null;
const dates = [];
let records = {};
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) records = saved;
} catch { /* El prototipo también funciona si el navegador bloquea el almacenamiento. */ }
try {
  const saved = JSON.parse(localStorage.getItem(HABITS_KEY));
  if (Array.isArray(saved)) {
    const ids = new Set();
    habits = saved.filter(habit => {
      if (!habit || typeof habit.id !== 'string' || typeof habit.name !== 'string' || !habit.name.trim() || !iconOptions.some(option => option.icon === habit.icon) || ids.has(habit.id)) return false;
      ids.add(habit.id);
      return true;
    }).slice(0, SLOT_COUNT);
    while (habits.length < SLOT_COUNT) habits.push(null);
  }
} catch { /* Mantener los hábitos iniciales si el archivo guardado no es válido. */ }

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function dateLabel(date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}
function recordKey(date, habit) { return `${date}:${habit}`; }
function recordState(key) {
  if (records[key] === true || records[key] === 'completed') return 'completed';
  return records[key] === 'failed' ? 'failed' : 'pending';
}
const stateLabels = { pending: 'sin registrar', completed: 'completado', failed: 'no realizado' };
function icon(habit) {
  const img = document.createElement('img');
  img.src = `icons/${habit.icon}`;
  img.alt = '';
  return img;
}

const today = new Date();
today.setHours(12, 0, 0, 0);

function renderHabits() {
  const scrollTop = viewport.scrollTop;
  grid.replaceChildren();
  dates.length = 0;
  const headings = document.getElementById('habit-headings');
  headings.replaceChildren();
  const headingSpacer = document.createElement('span');
  headingSpacer.setAttribute('aria-hidden', 'true');
  document.getElementById('habit-headings').append(headingSpacer);
  habits.forEach((habit, index) => {
    const heading = document.createElement('button');
    heading.type = 'button';
    heading.className = 'habit-heading' + (habit ? '' : ' empty');
    heading.title = habit ? habit.name : 'Crear hábito';
    heading.setAttribute('aria-label', habit ? `Editar ${habit.name}` : 'Crear hábito');
    if (habit) heading.dataset.habit = habit.id;
    heading.append(icon(habit || { icon: 'plus.svg' }));
    heading.addEventListener('click', () => openHabitEditor(index));
    document.getElementById('habit-headings').append(heading);
  });

  for (let day = 0; day < DAY_COUNT; day++) {
    const date = new Date(today);
    date.setDate(today.getDate() - day);
    const key = dateKey(date);
    dates.push(key);
    const row = document.createElement('div');
    row.className = 'habit-row';
    const label = document.createElement('time');
    label.dateTime = key;
    label.textContent = dateLabel(date);
    label.title = date.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' });
    row.append(label);
    habits.forEach((habit, index) => {
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
      const updateState = state => {
        button.dataset.state = state;
        button.setAttribute('aria-label', `${habit.name}, ${label.title}: ${stateLabels[state]}`);
        button.setAttribute('aria-pressed', String(state !== 'pending'));
      };
      updateState(recordState(id));
      const check = document.createElement('img');
      check.src = 'icons/check.svg';
      check.alt = '';
      check.className = 'habit-check';
      button.append(check);
      const cross = document.createElement('img');
      cross.src = 'icons/cross.svg';
      cross.alt = '';
      cross.className = 'habit-cross';
      button.append(cross);
      button.addEventListener('click', () => {
        const nextState = { pending: 'completed', completed: 'failed', failed: 'pending' }[button.dataset.state];
        if (nextState === 'pending') delete records[id];
        else records[id] = nextState;
        updateState(nextState);
        let saved = true;
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }
        catch { saved = false; }
        announcement.textContent = `${habit.name}: ${stateLabels[nextState]}${saved ? '' : '. No se pudo guardar en este navegador'}.`;
      });
      button.addEventListener('keydown', event => {
        const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -habits.length, ArrowDown: habits.length };
        if (!(event.key in steps)) return;
        event.preventDefault();
        const current = day * habits.length + index;
        const cells = grid.querySelectorAll('.habit-cell, .habit-empty');
        let next = current + steps[event.key];
        while (cells[next]?.classList.contains('habit-empty')) next += steps[event.key];
        cells[next]?.focus();
      });
      row.append(button);
    });
    grid.append(row);
  }
  viewport.scrollTop = scrollTop;
  syncScrollbar();
}

function saveHabitConfiguration() {
  try {
    localStorage.setItem(HABITS_KEY, JSON.stringify(habits));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    announcement.textContent = 'No se pudo guardar en este navegador.';
    return false;
  }
}

function openHabitEditor(index) {
  editingIndex = index;
  const habit = habits[index];
  document.getElementById('habit-editor-title').textContent = habit ? 'Editar hábito' : 'Crear hábito';
  document.getElementById('save-habit').textContent = habit ? 'Guardar' : 'Crear';
  document.getElementById('delete-habit').hidden = !habit;
  nameInput.value = habit?.name || '';
  nameInput.setCustomValidity('');
  const picker = document.getElementById('icon-picker');
  picker.replaceChildren();
  iconOptions.forEach((option, index) => {
    const label = document.createElement('label');
    label.className = 'icon-option';
    label.title = option.name;
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'icon';
    radio.value = option.icon;
    radio.setAttribute('aria-label', option.name);
    radio.checked = habit ? habit.icon === option.icon : index === 0;
    const tile = document.createElement('span');
    tile.append(icon(option));
    label.append(radio, tile);
    picker.append(label);
  });
  editor.showModal();
  nameInput.focus();
}

function finishHabitEdit(focusIndex) {
  const saved = saveHabitConfiguration();
  editor.close();
  renderHabits();
  document.querySelectorAll('.habit-heading')[focusIndex]?.focus();
  if (saved) announcement.textContent = 'Hábitos actualizados.';
}
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
  const existing = habits[editingIndex];
  const habit = { id: existing?.id || crypto.randomUUID(), name, icon: selectedIcon };
  habits[editingIndex] = habit;
  habits = [...habits.filter(Boolean), ...habits.filter(habit => !habit)];
  finishHabitEdit(habits.findIndex(item => item?.id === habit.id));
});
document.getElementById('delete-habit').addEventListener('click', () => {
  const habit = habits[editingIndex];
  if (!habit) return;
  Object.keys(records).forEach(key => { if (key.endsWith(`:${habit.id}`)) delete records[key]; });
  habits.splice(editingIndex, 1);
  habits.push(null);
  finishHabitEdit(habits.findIndex(habit => !habit));
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
  const habitId = source.dataset.habit;
  const from = habits.findIndex(habit => habit?.id === habitId);
  columnDrag = { source, habitId, from, to: from, pointerId: event.pointerId,
    startX: event.clientX, startY: event.clientY, active: false };
  if (from < 0) return;
  columnDrag.timer = setTimeout(() => {
    const state = columnDrag;
    if (!state) return;
    state.active = true;
    state.columns = habits.filter(Boolean).map(habit => {
      const elements = [...trackerBody.querySelectorAll('[data-habit]')].filter(el => el.dataset.habit === habit.id);
      return { id: habit.id, elements, left: elements[0].getBoundingClientRect().left };
    });
    state.source.setPointerCapture(state.pointerId);
    document.body.classList.add('reordering-habits');
    state.columns[state.from].elements.forEach(el => el.classList.add('habit-column-dragging'));
    announcement.textContent = `Arrastrando ${habits[state.from].name}.`;
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
    const moved = habits.splice(state.from, 1)[0];
    habits.splice(state.to, 0, moved);
    const saved = saveHabitConfiguration();
    // Actualizar la cuadrícula al siguiente frame, una vez liberado el puntero.
    requestAnimationFrame(() => renderHabits());
    if (saved) announcement.textContent = `${moved.name} movido a la columna ${state.to + 1}.`;
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
window.addEventListener('blur', () => finishColumnDrag(false));

function syncScrollbar() {
  const maxScroll = viewport.scrollHeight - viewport.clientHeight;
  const height = Math.min(track.clientHeight, Math.max(32, track.clientHeight * viewport.clientHeight / viewport.scrollHeight));
  thumb.style.height = `${height}px`;
  thumb.style.top = `${maxScroll > 0 ? (track.clientHeight - height) * viewport.scrollTop / maxScroll : 0}px`;
  document.getElementById('scroll-up').disabled = viewport.scrollTop <= 0;
  document.getElementById('scroll-down').disabled = viewport.scrollTop >= maxScroll - 1;
}
viewport.addEventListener('scroll', syncScrollbar, { passive: true });
new ResizeObserver(syncScrollbar).observe(viewport);
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

function closeTracker() {
  finishColumnDrag(false);
  if (stats.open) stats.close();
  if (editor.open) editor.close();
  backdrop.hidden = true;
  launcher.hidden = false;
  document.getElementById('open-tracker').focus();
}
document.getElementById('close-tracker').addEventListener('click', closeTracker);
document.getElementById('open-tracker').addEventListener('click', () => {
  launcher.hidden = true;
  backdrop.hidden = false;
  syncScrollbar();
  document.getElementById('close-tracker').focus();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !backdrop.hidden && !stats.open && !editor.open) closeTracker();
});
document.getElementById('show-stats').addEventListener('click', () => {
  const list = document.getElementById('stats-list');
  list.replaceChildren();
  document.getElementById('stats-period').textContent = `Últimos ${DAY_COUNT} días · ${dateLabel(today)}`;
  habits.forEach(habit => {
    if (!habit) return;
    const row = document.createElement('div');
    row.className = 'stats-row';
    const name = document.createElement('span');
    name.textContent = habit.name;
    const count = document.createElement('strong');
    count.textContent = `${dates.filter(date => recordState(recordKey(date, habit.id)) === 'completed').length}/${DAY_COUNT}`;
    row.append(icon(habit), name, count);
    list.append(row);
  });
  stats.showModal();
});
document.getElementById('close-stats').addEventListener('click', () => stats.close());
renderHabits();

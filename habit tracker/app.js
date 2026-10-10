'use strict';

const habits = [
  { id: 'sun', name: 'Luz natural', icon: 'sun.svg' },
  { id: 'exercise', name: 'Ejercicio', icon: 'dumbbell.svg' },
  { id: 'time', name: 'Rutina', icon: 'clock.svg' },
  { id: 'food', name: 'Alimentación', icon: 'cooking.svg' },
  { id: 'journal', name: 'Escribir', icon: 'edit.svg' },
  { id: 'goal', name: 'Objetivo personal', icon: 'target.svg' }
];
const STORAGE_KEY = 'planner7.habit-tracker.experiment.v1';
const DAY_COUNT = 31;
const viewport = document.getElementById('history-viewport');
const grid = document.getElementById('habit-grid');
const track = document.getElementById('scroll-track');
const thumb = document.getElementById('scroll-thumb');
const stats = document.getElementById('stats-dialog');
const backdrop = document.getElementById('tracker-backdrop');
const launcher = document.getElementById('launcher');
const announcement = document.getElementById('announcement');
const dates = [];
let records = {};
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) records = saved;
} catch { /* El prototipo también funciona si el navegador bloquea el almacenamiento. */ }

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

const headingSpacer = document.createElement('span');
headingSpacer.setAttribute('aria-hidden', 'true');
document.getElementById('habit-headings').append(headingSpacer);
habits.forEach(habit => {
  const heading = document.createElement('div');
  heading.className = 'habit-heading';
  heading.title = habit.name;
  heading.setAttribute('aria-label', habit.name);
  heading.append(icon(habit));
  document.getElementById('habit-headings').append(heading);
});

const today = new Date();
today.setHours(12, 0, 0, 0);
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
      const cells = grid.querySelectorAll('.habit-cell');
      cells[current + steps[event.key]]?.focus();
    });
    row.append(button);
  });
  grid.append(row);
}

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
  if (stats.open) stats.close();
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
  if (event.key === 'Escape' && !backdrop.hidden && !stats.open) closeTracker();
});
document.getElementById('show-stats').addEventListener('click', () => {
  const list = document.getElementById('stats-list');
  list.replaceChildren();
  document.getElementById('stats-period').textContent = `Últimos ${DAY_COUNT} días · ${dateLabel(today)}`;
  habits.forEach(habit => {
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
syncScrollbar();

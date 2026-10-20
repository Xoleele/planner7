// Panel único de resultados para Buscador y todos los gráficos de estadísticas.
// Los orígenes solo suministran datos y acciones opcionales; presentación,
// orden, tarjetas, cierre y navegación al editor se mantienen aquí.
let taskResultsContext = null;
let taskResultsSortDesc = false;
let taskResultsEditorObserver = null;

function taskResultsDateLabel(dateStr) {
  if (!dateStr) return 'Archivadas';
  const text = new Date(dateStr + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function taskResultsSectionsFromItems(items) {
  const byDate = new Map();
  items.forEach(({ date, task, note }) => {
    const key = date || null;
    if (!byDate.has(key)) byDate.set(key, {
      heading: taskResultsDateLabel(key), archived: !key, occurrences: []
    });
    byDate.get(key).occurrences.push(note ? { note, dateStr: key } : { task, dateStr: key });
  });
  return [...byDate.values()];
}

// También lo usa la exportación: las archivadas siempre quedan al final.
function orderedTaskResultItems(items) {
  const dated = items.filter(item => item.date);
  return (taskResultsSortDesc ? dated.reverse() : dated)
    .concat(items.filter(item => !item.date));
}

function visibleTaskResultsModals() {
  return [...document.querySelectorAll('.modal-backdrop')].filter(modal =>
    !modal.classList.contains('hidden') && modal.style.display !== 'none');
}

function openTaskResultsPanel(options, scrollTop = 0) {
  const modal = document.getElementById('task-results-modal');
  if (!modal) return;
  if (taskResultsContext) closeTaskResultsPanel();
  const backgrounds = visibleTaskResultsModals().filter(el => el !== modal);
  taskResultsContext = { ...options, backgrounds };
  backgrounds.forEach(el => el.classList.add('hidden'));
  renderTaskResultsPanel();
  modal.classList.remove('hidden');
  document.getElementById('task-results-body').scrollTop = scrollTop;
}

function closeTaskResultsPanel() {
  if (taskResultsEditorObserver) taskResultsEditorObserver.disconnect();
  taskResultsEditorObserver = null;
  document.getElementById('task-results-modal')?.classList.add('hidden');
  const context = taskResultsContext;
  taskResultsContext = null;
  if (context) context.backgrounds.forEach(el => el.classList.remove('hidden'));
}

function renderTaskResultsPanel() {
  if (!taskResultsContext) return;
  const { title, sections, emptyText = 'No se encontraron tareas.', decorateCard } = taskResultsContext.getData();
  document.getElementById('task-results-title').textContent = title;
  const sortBtn = document.getElementById('task-results-sort-btn');
  sortBtn.classList.toggle('active', taskResultsSortDesc);
  sortBtn.setAttribute('aria-pressed', String(taskResultsSortDesc));
  sortBtn.title = taskResultsSortDesc
    ? 'Más recientes primero (clic para invertir)'
    : 'Más antiguas primero (clic para invertir)';
  document.getElementById('task-results-export-btn').classList.toggle('hidden', !taskResultsContext.onExport);

  const dated = sections.filter(section => !section.archived);
  const ordered = (taskResultsSortDesc ? dated.reverse() : dated)
    .concat(sections.filter(section => section.archived));
  const list = document.getElementById('task-results-list');
  list.innerHTML = '';
  const appendEmpty = () => {
    const empty = document.createElement('div');
    empty.className = 'task-results-empty';
    empty.textContent = emptyText;
    list.appendChild(empty);
  };
  if (!ordered.length) appendEmpty();
  ordered.forEach(section => {
    const head = document.createElement('div');
    head.className = 'buscador-list-date';
    head.textContent = section.heading;
    list.appendChild(head);
    const occurrences = taskResultsSortDesc && !section.archived
      ? section.occurrences.slice().reverse() : section.occurrences;
    if (!occurrences.length) appendEmpty();
    occurrences.forEach(({ task, dateStr, note }) => {
      if (note) {
        const noteCard = createNoteResultCard(note);
        noteCard.addEventListener('click', () => openNoteFromResults(note, dateStr));
        if (decorateCard) decorateCard(noteCard);
        list.appendChild(noteCard);
        return;
      }
      const card = createTaskCard(task, dateStr).cloneNode(true);
      card.draggable = false;
      card.classList.remove('activity-hidden', 'dragging');
      card.classList.add('buscador-card');
      card.title = 'Abrir en el editor';
      card.addEventListener('click', async event => {
        if (!event.altKey) { openTaskFromResults(task.id, dateStr); return; }
        event.preventDefault();
        event.stopPropagation();
        const context = taskResultsContext;
        const modal = document.getElementById('task-results-modal');
        const body = document.getElementById('task-results-body');
        const scrollTop = body.scrollTop;
        modal.classList.add('hidden');
        try {
          const changed = await clearTaskTiming(task, dateStr);
          if (changed) {
            if (context.refresh) context.refresh();
            else context.getData().sections.forEach(section => section.occurrences.forEach(occurrence => {
              if (occurrence.task.id !== task.id) return;
              const applies = changed.recurrence?.enabled
                ? checkTaskOccurrence(changed, new Date(occurrence.dateStr + 'T00:00:00'))
                : (occurrence.dateStr || '') === (changed.date || '');
              if (applies) occurrence.task = changed;
            }));
          }
        } finally {
          if (taskResultsContext === context) {
            renderTaskResultsPanel();
            modal.classList.remove('hidden');
            body.scrollTop = scrollTop;
          }
        }
      });
      if (decorateCard) decorateCard(card);
      list.appendChild(card);
    });
  });
}

// Tarjeta de una nota (del día o de un hábito) en los resultados del Buscador.
function createNoteResultCard(note) {
  const card = document.createElement('div');
  card.className = 'buscador-card buscador-note-card';
  card.dataset.kind = note.kind;
  card.title = note.kind === 'habit' ? 'Abrir la nota en Hábitos' : 'Abrir la nota del día';
  const head = document.createElement('div');
  head.className = 'buscador-note-head';
  head.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  const label = document.createElement('span');
  label.textContent = note.kind === 'habit' ? 'Nota de hábito · ' : 'Nota del día';
  head.appendChild(label);
  if (note.kind === 'habit') {
    const habit = document.createElement('span');
    habit.className = 'buscador-note-habit';
    habit.textContent = note.habitName;
    head.appendChild(habit);
  }
  const text = document.createElement('div');
  text.className = 'buscador-note-text';
  text.textContent = note.snippet || note.text;
  card.append(head, text);
  return card;
}

// Abre algo encima de los resultados (editor de tarea, nota del día o Hábitos)
// y vuelve a los resultados, actualizados, cuando ya no queda nada abierto.
// open(ctl): ctl.restore() vuelve de inmediato; con { waitReady: true } no se
// vuelve hasta que el que abre llame a ctl.ready() (aperturas asíncronas).
function openOverResults(open, { waitReady = false } = {}) {
  const context = taskResultsContext;
  if (!context) return;
  if (taskResultsEditorObserver) taskResultsEditorObserver.disconnect();
  const modal = document.getElementById('task-results-modal');
  const body = document.getElementById('task-results-body');
  const scrollTop = body.scrollTop;
  const backgrounds = visibleTaskResultsModals();
  backgrounds.forEach(el => el.classList.add('hidden'));
  const habits = document.getElementById('habitos-tool');
  let ready = !waitReady;
  let pending = false;
  const restore = () => {
    if (taskResultsContext !== context) return;
    observer.disconnect();
    if (taskResultsEditorObserver === observer) taskResultsEditorObserver = null;
    if (context.refresh) context.refresh();
    renderTaskResultsPanel();
    backgrounds.forEach(el => el.classList.remove('hidden'));
    modal.classList.remove('hidden');
    body.scrollTop = scrollTop;
  };
  const check = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      if (!ready || taskResultsContext !== context) return;
      // Esperar al editor y a sus confirmaciones (recurrentes, eliminar, etc.).
      if (visibleTaskResultsModals().length || (habits && !habits.hidden)) return;
      restore();
    }, 0);
  };
  const observer = new MutationObserver(check);
  observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'style', 'hidden'] });
  taskResultsEditorObserver = observer;
  open({ restore, ready: () => { ready = true; check(); } });
}

function openTaskFromResults(taskId, dateStr) {
  if (!taskResultsContext || !tasks.some(task => task.id === taskId)) return;
  openOverResults(() => openTaskModal(taskId, dateStr || null));
}

// Nota del día: su ventana de siempre. Nota de hábito: se abre Hábitos con esa
// nota encima; al cerrar Hábitos se vuelve a los resultados.
function openNoteFromResults(note, dateStr) {
  if (!taskResultsContext || !dateStr) return;
  if (note.kind !== 'habit') {
    openOverResults(() => openNotesModal(dateStr));
    return;
  }
  openOverResults(ctl => {
    const host = document.getElementById('habitos-tool');
    if (!host) { ctl.restore(); return; }
    host.dispatchEvent(new CustomEvent('planner7:open-habit-note', { detail: {
      blockId: note.blockId, habitId: note.habitId, date: dateStr,
      done: opened => { if (opened) ctl.ready(); else ctl.restore(); }
    } }));
  }, { waitReady: true });
}

document.addEventListener('click', (e) => {
  const button = e.target.closest && e.target.closest('#task-results-sort-btn, #task-results-back-btn, #task-results-export-btn');
  if (!button || !taskResultsContext) return;
  if (button.id === 'task-results-back-btn') {
    closeTaskResultsPanel();
  } else if (button.id === 'task-results-export-btn') {
    if (taskResultsContext.onExport) taskResultsContext.onExport();
  } else {
    taskResultsSortDesc = !taskResultsSortDesc;
    renderTaskResultsPanel();
    document.getElementById('task-results-body').scrollTop = 0;
  }
});

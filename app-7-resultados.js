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
  items.forEach(({ date, task }) => {
    const key = date || null;
    if (!byDate.has(key)) byDate.set(key, {
      heading: taskResultsDateLabel(key), archived: !key, occurrences: []
    });
    byDate.get(key).occurrences.push({ task, dateStr: key });
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
    occurrences.forEach(({ task, dateStr }) => {
      const card = createTaskCard(task, dateStr).cloneNode(true);
      card.draggable = false;
      card.classList.remove('activity-hidden', 'dragging');
      card.classList.add('buscador-card');
      card.title = 'Abrir en el editor';
      card.addEventListener('click', () => openTaskFromResults(task.id, dateStr));
      if (decorateCard) decorateCard(card);
      list.appendChild(card);
    });
  });
}

function openTaskFromResults(taskId, dateStr) {
  const context = taskResultsContext;
  if (!context || !tasks.some(task => task.id === taskId)) return;
  if (taskResultsEditorObserver) taskResultsEditorObserver.disconnect();
  const modal = document.getElementById('task-results-modal');
  const body = document.getElementById('task-results-body');
  const scrollTop = body.scrollTop;
  const backgrounds = visibleTaskResultsModals();
  backgrounds.forEach(el => el.classList.add('hidden'));
  openTaskModal(taskId, dateStr || null);

  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      if (taskResultsContext !== context) return;
      // Esperar al editor y a sus confirmaciones (recurrentes, eliminar, etc.).
      if (visibleTaskResultsModals().length) return;
      observer.disconnect();
      taskResultsEditorObserver = null;
      if (context.refresh) context.refresh();
      renderTaskResultsPanel();
      backgrounds.forEach(el => el.classList.remove('hidden'));
      modal.classList.remove('hidden');
      body.scrollTop = scrollTop;
    }, 0);
  });
  observer.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
  taskResultsEditorObserver = observer;
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

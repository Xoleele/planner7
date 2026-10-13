// La selección identifica apariciones: dos días de una serie son seleccionables por separado.
const selectedTaskOccurrences = new Map();
let taskMultiDragEntries = null;
let taskMultiDragPreview = [];
let taskMultiActionPending = false;
let taskSelectionClickBlockedUntil = 0;

function taskOccurrenceKey(id, date) {
  return JSON.stringify([String(id), date || '']);
}

function taskSelectionEntry(element) {
  const id = element.dataset.taskId || element.dataset.id;
  if (!id) return null;
  return { id, date: element.dataset.occurrenceDate || '' };
}

function decorateTaskSelection(element, id, date) {
  const selected = selectedTaskOccurrences.has(taskOccurrenceKey(id, date));
  element.classList.toggle('task-multi-selected', selected);
  element.setAttribute('aria-selected', String(selected));
  let border = element.querySelector(':scope > .task-selection-border');
  if (!selected) { if (border) border.remove(); return; }
  if (border) return;
  border = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  border.classList.add('task-selection-border');
  border.setAttribute('aria-hidden', 'true');
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  rect.setAttribute('width', '100%'); rect.setAttribute('height', '100%');
  rect.setAttribute('rx', getComputedStyle(element).borderRadius || '8');
  border.appendChild(rect);
  element.appendChild(border);
}

function refreshTaskSelection() {
  for (const [key, entry] of selectedTaskOccurrences) {
    const task = tasks.find(task => String(task.id) === entry.id);
    if (!task || (task.recurrence?.enabled ? !entry.date || !checkTaskOccurrence(task, new Date(entry.date + 'T00:00:00')) : (task.date || '') !== entry.date)) selectedTaskOccurrences.delete(key);
  }
  document.querySelectorAll('.task-card[data-id], .cr-task-block[data-task-id]').forEach(element => {
    const entry = taskSelectionEntry(element);
    if (entry) decorateTaskSelection(element, entry.id, entry.date);
  });
  const count = selectedTaskOccurrences.size;
  document.body.classList.toggle('has-task-selection', count > 0);
  const toolbar = document.getElementById('task-selection-toolbar');
  if (toolbar) {
    toolbar.classList.toggle('hidden', !count);
    toolbar.querySelector('[data-selection-count]').textContent = `${count} ${count === 1 ? 'tarea seleccionada' : 'tareas seleccionadas'}`;
  }
}

function toggleTaskSelection(id, date) {
  const key = taskOccurrenceKey(id, date);
  if (selectedTaskOccurrences.has(key)) selectedTaskOccurrences.delete(key);
  else selectedTaskOccurrences.set(key, { id: String(id), date: date || '' });
  refreshTaskSelection();
}

function clearTaskSelection() {
  selectedTaskOccurrences.clear();
  refreshTaskSelection();
}

function getTaskSelectionDragEntries(id, date) {
  if (!selectedTaskOccurrences.has(taskOccurrenceKey(id, date))) return [];
  return [...selectedTaskOccurrences.values()].filter(entry => tasks.some(task => String(task.id) === entry.id)).map(entry => ({ ...entry })).sort((a, b) => {
    const dateOrder = a.date.localeCompare(b.date);
    if (dateOrder) return dateOrder;
    const left = tasks.find(task => String(task.id) === a.id), right = tasks.find(task => String(task.id) === b.id);
    return typeof getEffectivePosition === 'function' ? getEffectivePosition(left, a.date) - getEffectivePosition(right, b.date) : 0;
  });
}

function taskSelectionShiftDate(date, days) {
  const parsed = new Date((date || '2000-01-01') + 'T12:00:00');
  parsed.setDate(parsed.getDate() + days);
  return formatDate(parsed);
}

function taskSelectionDayDelta(source, target) {
  const dayNumber = date => Date.parse(date + 'T00:00:00Z') / 86400000;
  return source && target ? dayNumber(target) - dayNumber(source) : 0;
}

function taskSelectionHHMM(minutes) {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

// Crear un plan independiente permite guardar y deshacer el grupo en un solo paso.
function planTaskSelectionChange(entries, anchor, targetDate, { copy = false, timeDelta = null, startMin = null, archive = false, remove = false } = {}) {
  const plannedTasks = structuredClone(tasks);
  const results = [];
  const dayDelta = taskSelectionDayDelta(anchor.date || entries.find(entry => entry.date)?.date, targetDate);
  let untimedOffset = 0;
  for (const entry of entries) {
    const original = plannedTasks.find(task => String(task.id) === entry.id);
    if (!original) continue;
    const recurring = !!original.recurrence?.enabled;
    if (remove) {
      if (recurring && entry.date) {
        original.recurrence.exceptions ||= [];
        if (!original.recurrence.exceptions.includes(entry.date)) original.recurrence.exceptions.push(entry.date);
      } else {
        const index = plannedTasks.indexOf(original);
        plannedTasks.splice(index, 1);
      }
      continue;
    }
    let changed = original;
    const changesOccurrence = recurring && (archive || dayDelta !== 0 || (timeDelta !== null && timeDelta !== 0) || (startMin !== null && !getTaskTimeRange(original)));
    if (copy || changesOccurrence) {
      changed = structuredClone(original);
      changed.id = 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      changed.recurrence = null;
      changed.completed = recurring ? !!original.completedOccurrences?.includes(entry.date) : !!original.completed;
      delete changed.completedOccurrences;
      delete changed.positionOverrides;
      if (recurring && !copy && entry.date) {
        original.recurrence.exceptions ||= [];
        if (!original.recurrence.exceptions.includes(entry.date)) original.recurrence.exceptions.push(entry.date);
      }
      plannedTasks.push(changed);
    }
    if (!recurring || copy || changesOccurrence) changed.date = archive ? '' : entry.date ? taskSelectionShiftDate(entry.date, dayDelta) : targetDate;
    if (archive) {
      const duration = typeof getTaskDurationMinutes === 'function' ? getTaskDurationMinutes(changed) : changed.duration;
      Object.assign(changed, { recurrence: null, startTime: null, endTime: null, alarm: false, duration });
    } else if (timeDelta !== null || startMin !== null) {
      const range = getTaskTimeRange(changed);
      const duration = range ? (range.crossesMidnight ? range.rawEndMin + 1440 : range.rawEndMin) - range.startMin
        : (changed.duration || 60);
      const shiftedStart = range ? range.startMin + (timeDelta || 0) : (startMin || 0) + untimedOffset;
      changed.date = taskSelectionShiftDate(changed.date, Math.floor(shiftedStart / 1440));
      changed.startTime = taskSelectionHHMM(shiftedStart);
      changed.endTime = taskSelectionHHMM(shiftedStart + duration);
      changed.duration = duration;
      if (!range) untimedOffset += duration;
    }
    results.push({ id: String(changed.id), date: recurring && !copy && !changesOccurrence ? entry.date : changed.date });
  }
  return { tasks: plannedTasks, selection: results };
}

function commitTaskSelectionPlan(plan) {
  pushToUndoStack();
  taskMultiDragEntries = null;
  stopTaskSelectionPreview();
  document.querySelectorAll('.task-selection-drag-origin').forEach(element => element.classList.remove('task-selection-drag-origin'));
  document.body.classList.remove('dragging-active');
  if (typeof draggedTaskId !== 'undefined') draggedTaskId = null;
  if (typeof draggedTaskSourceDate !== 'undefined') draggedTaskSourceDate = null;
  tasks = plan.tasks;
  selectedTaskOccurrences.clear();
  plan.selection.forEach(entry => selectedTaskOccurrences.set(taskOccurrenceKey(entry.id, entry.date), entry));
  saveTasksToStorage();
  renderWeeklyCalendar();
  if (typeof renderBriefcaseTasks === 'function') renderBriefcaseTasks();
  if (typeof refreshAlarms === 'function') refreshAlarms();
  refreshTaskSelection();
}

function getTaskSelectionAfterElement(container, clientY, entries, copy) {
  if (!container) return null;
  if (copy || !container.querySelectorAll) return getDragAfterElement(container, clientY);
  const selectedKeys = new Set(entries.map(entry => taskOccurrenceKey(entry.id, entry.date)));
  const candidates = [...container.querySelectorAll('.task-card:not(.completed):not(.dragging):not(.touch-dragging)')].filter(element => {
    const entry = taskSelectionEntry(element);
    return !entry || !selectedKeys.has(taskOccurrenceKey(entry.id, entry.date));
  });
  return candidates.reduce((closest, element) => {
    const rect = element.getBoundingClientRect();
    const offset = clientY - rect.top - rect.height / 2;
    return offset < 0 && offset > closest.offset ? { element, offset } : closest;
  }, { element: null, offset: -Infinity }).element;
}

function moveTaskSelectionToDate(entries, anchor, date, container, clientY, copy) {
  const after = getTaskSelectionAfterElement(container, clientY, entries, copy);
  const plan = planTaskSelectionChange(entries, anchor, date, { copy });
  // Mantener el orden del grupo en cada día, colocándolo junto al punto de caída.
  for (const destination of new Set(plan.selection.map(entry => entry.date))) {
    const groupIds = new Set(plan.selection.filter(entry => entry.date === destination).map(entry => entry.id));
    const dayTasks = plan.tasks.filter(task => checkTaskOccurrence(task, new Date(destination + 'T00:00:00')) && !groupIds.has(String(task.id)));
    sortDayTasks(dayTasks, destination);
    let index = destination === date && after ? dayTasks.findIndex(task => String(task.id) === after.dataset.id) : dayTasks.length;
    if (index < 0) index = dayTasks.length;
    const group = plan.selection.filter(entry => entry.date === destination).map(entry => plan.tasks.find(task => String(task.id) === entry.id));
    dayTasks.splice(index, 0, ...group);
    if (!resolveTimedReorderOnDrop(dayTasks, group[0], destination, anchor.date)) { renderWeeklyCalendar(); return; }
    dayTasks.forEach((task, position) => setEffectivePosition(task, destination, position * 10));
  }
  commitTaskSelectionPlan(plan);
}

function commitTaskSelectionCronogramaDrag(drag) {
  const entries = drag.selectionEntries;
  if (drag.overTrash) { requestDeleteTaskSelection(entries); renderCronograma(); return; }
  if (drag.overBriefcase) { archiveTaskSelection(entries, { id: String(drag.task.id), date: drag.sourceDate }, null, drag.copy); return; }
  const date = drag.targetColEl?.dataset.date || drag.sourceDate;
  const plan = planTaskSelectionChange(entries, { id: String(drag.task.id), date: drag.sourceDate }, date,
    { copy: drag.copy, timeDelta: drag.newStartMin - drag.originalStartMin });
  commitTaskSelectionPlan(plan);
}

function dropTaskSelectionOnCronograma(entries, anchor, column, clientY, copy) {
  const startMin = cronogramaDropStartMin(column, clientY);
  const task = tasks.find(task => String(task.id) === anchor.id);
  const range = task && getTaskTimeRange(task);
  const plan = planTaskSelectionChange(entries, anchor, column.dataset.date,
    { copy, timeDelta: range ? startMin - range.startMin : 0, startMin });
  hideCronogramaDropPreview();
  commitTaskSelectionPlan(plan);
}

function requestDeleteTaskSelection(entries = [...selectedTaskOccurrences.values()]) {
  if (!entries.length || taskMultiActionPending) return;
  const overlay = document.createElement('div');
  overlay.className = 'task-selection-confirm';
  overlay.innerHTML = `<div class="task-selection-confirm-box" role="dialog" aria-modal="true" aria-labelledby="task-selection-delete-title">
    <h2 id="task-selection-delete-title">Eliminar ${entries.length} ${entries.length === 1 ? 'tarea' : 'tareas'}</h2>
    <p>Se eliminarán las tareas seleccionadas. En tareas repetidas, solo se eliminarán las apariciones seleccionadas.</p>
    <div><button type="button" class="btn btn-secondary" data-cancel>Cancelar</button><button type="button" class="btn btn-primary" data-delete>Eliminar</button></div>
  </div>`;
  taskMultiActionPending = true;
  const previousFocus = document.activeElement;
  const close = () => { taskMultiActionPending = false; overlay.remove(); previousFocus?.focus(); };
  overlay.querySelector('[data-cancel]').addEventListener('click', close);
  overlay.querySelector('[data-delete]').addEventListener('click', () => {
    const plan = planTaskSelectionChange(entries, entries[0], '', { remove: true });
    close(); commitTaskSelectionPlan(plan);
  });
  overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    if (event.key === 'Tab') {
      const buttons = [...overlay.querySelectorAll('button')];
      const index = buttons.indexOf(document.activeElement);
      event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus();
    }
  });
  document.body.appendChild(overlay);
  overlay.querySelector('[data-cancel]').focus();
}

function startTaskSelectionPreview(drag, event) {
  stopTaskSelectionPreview();
  if (!drag.selectionEntries || drag.selectionEntries.length < 2) return;
  for (const entry of drag.selectionEntries) {
    if (entry.id === String(drag.task.id) && entry.date === drag.sourceDate) continue;
    const original = [...document.querySelectorAll('.task-multi-selected')].find(element => {
      const candidate = taskSelectionEntry(element);
      return candidate?.id === entry.id && candidate.date === entry.date && !element.classList.contains('cr-tail') && element.getClientRects().length > 0;
    });
    if (!original) continue;
    const rect = original.getBoundingClientRect();
    const ghost = original.cloneNode(true);
    ghost.classList.add('task-selection-drag-preview');
    Object.assign(ghost.style, { position: 'fixed', left: rect.left+'px', top: rect.top+'px', width:rect.width+'px', height:rect.height+'px', right:'auto', margin:'0' });
    document.body.appendChild(ghost);
    taskMultiDragPreview.push({ original, ghost, x:event.clientX, y:event.clientY });
  }
}

function updateTaskSelectionPreview(event, copy) {
  taskMultiDragPreview.forEach(({ original, ghost, x, y }) => {
    ghost.style.transform = `translate(${event.clientX-x}px, ${event.clientY-y}px)`;
    original.classList.toggle('task-selection-drag-origin', !copy);
  });
}

function stopTaskSelectionPreview() {
  taskMultiDragPreview.forEach(({original,ghost}) => {original.classList.remove('task-selection-drag-origin');ghost.remove();});
  taskMultiDragPreview = [];
}

function startTaskSelectionNativeDrag(card, event) {
  if (!taskMultiDragEntries || taskMultiDragEntries.length < 2) return;
  const image = document.createElement('div');
  image.className = 'task-selection-native-preview';
  const cards = taskMultiDragEntries.slice(0, 3).map(entry => [...document.querySelectorAll('.task-multi-selected')].find(element => {
    const candidate = taskSelectionEntry(element);
    return candidate?.id === entry.id && candidate.date === entry.date && element.getClientRects().length > 0;
  })).filter(Boolean);
  cards.forEach((element, index) => {
    const clone = element.cloneNode(true);
    Object.assign(clone.style, {position:'relative',left:'auto',right:'auto',top:'auto',height:'auto',width:'220px',margin:'4px',transform:`translateX(${index*6}px)`});
    image.appendChild(clone);
  });
  const count = document.createElement('span');
  count.className = 'task-selection-native-count'; count.textContent = `${taskMultiDragEntries.length} tareas`;
  image.appendChild(count); document.body.appendChild(image);
  event.dataTransfer.setDragImage(image, 24, 24);
  setTimeout(() => image.remove(), 0);
  document.querySelectorAll('.task-multi-selected').forEach(element => element.classList.toggle('task-selection-drag-origin', !(event.ctrlKey || event.metaKey)));
}

function reorderTaskSelectionInBriefcase(entries, container, clientY, copy = false) {
  const after = getTaskSelectionAfterElement(container, clientY, entries, copy);
  const plan = planTaskSelectionChange(entries, entries[0], '', { copy });
  const ids = new Set(plan.selection.map(entry => entry.id));
  const ordered = plan.tasks.filter(task => !task.date && !ids.has(String(task.id))).sort(compareArchivedTasks);
  let index = after ? ordered.findIndex(task => String(task.id) === after.dataset.id) : ordered.length;
  if (index < 0) index = ordered.length;
  ordered.splice(index, 0, ...plan.selection.map(entry => plan.tasks.find(task => String(task.id) === entry.id)));
  ordered.forEach((task, position) => {task.position=position*10;});
  commitTaskSelectionPlan(plan);
}

function archiveTaskSelection(entries, anchor, clientY = null, copy = false) {
  const container = document.getElementById('briefcase-tasks-container');
  if (entries.every(entry => !entry.date) && container && clientY !== null) {
    reorderTaskSelectionInBriefcase(entries, container, clientY, copy);
    return;
  }
  const plan = planTaskSelectionChange(entries, anchor, '', { archive: true, copy });
  const ids = new Set(plan.selection.map(entry => entry.id));
  const ordered = plan.tasks.filter(task => !task.date && !ids.has(String(task.id))).sort(compareArchivedTasks);
  const after = container && clientY !== null ? getTaskSelectionAfterElement(container, clientY, entries, copy) : null;
  let index = after ? ordered.findIndex(task => String(task.id) === after.dataset.id) : clientY === null ? 0 : ordered.length;
  if (index < 0) index = ordered.length;
  ordered.splice(index, 0, ...plan.selection.map(entry => plan.tasks.find(task => String(task.id) === entry.id)));
  ordered.forEach((task, position) => { task.position = position * 10; });
  commitTaskSelectionPlan(plan);
}

function setupTaskMultiSelection() {
  const toolbar = document.createElement('div');
  toolbar.id = 'task-selection-toolbar'; toolbar.className = 'task-selection-toolbar hidden';
  toolbar.setAttribute('role', 'region'); toolbar.setAttribute('aria-label', 'Selección de tareas');
  toolbar.innerHTML = '<span data-selection-count aria-live="polite"></span><button type="button" data-delete-selection>Eliminar</button><button type="button" data-clear-selection>Deseleccionar · Esc</button>';
  document.body.appendChild(toolbar);
  toolbar.querySelector('[data-delete-selection]').addEventListener('click', () => requestDeleteTaskSelection());
  toolbar.querySelector('[data-clear-selection]').addEventListener('click', clearTaskSelection);
  document.addEventListener('pointerdown', () => { taskSelectionClickBlockedUntil = 0; }, true);
  document.addEventListener('click', event => {
    if (!(event.ctrlKey || event.metaKey) || event.target.closest('.task-check-btn')) return;
    const element = event.target.closest('.task-card[data-id], .cr-task-block[data-task-id]');
    if (!element || element.closest('.task-selection-drag-preview')) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (Date.now() < taskSelectionClickBlockedUntil || (typeof suppressNextCronogramaClick !== 'undefined' && suppressNextCronogramaClick)) return;
    const entry = taskSelectionEntry(element);
    toggleTaskSelection(entry.id, entry.date);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'Escape' && selectedTaskOccurrences.size) {
      clearTaskSelection();
      if (typeof crDrag !== 'undefined' && crDrag) cancelCronogramaDrag();
      if (taskMultiDragEntries?.length) return; // Dejar que Escape cancele también el arrastre nativo.
      // El diálogo de eliminación también debe poder cerrarse con Escape.
      if (!taskMultiActionPending) { event.preventDefault(); event.stopImmediatePropagation(); }
      return;
    }
    if (event.key !== 'Delete' || !selectedTaskOccurrences.size || event.repeat || taskMultiActionPending) return;
    if (event.target.isContentEditable || event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (document.querySelector('.modal-backdrop:not(.hidden)')) return;
    event.preventDefault(); event.stopImmediatePropagation(); requestDeleteTaskSelection();
  }, true);
  document.getElementById('trash-btn')?.addEventListener('click', () => {
    if (selectedTaskOccurrences.size) requestDeleteTaskSelection();
  });
  document.addEventListener('drag', event => {
    if (!taskMultiDragEntries || taskMultiDragEntries.length < 2) return;
    document.querySelectorAll('.task-multi-selected').forEach(element => element.classList.toggle('task-selection-drag-origin', !(event.ctrlKey || event.metaKey)));
  });
  document.addEventListener('dragend', () => {
    taskMultiDragEntries = null;
    stopTaskSelectionPreview();
    document.querySelectorAll('.task-selection-drag-origin').forEach(element => element.classList.remove('task-selection-drag-origin'));
  });
  refreshTaskSelection();
}

window.addEventListener('DOMContentLoaded', setupTaskMultiSelection);

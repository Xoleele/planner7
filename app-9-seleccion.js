// La selección identifica apariciones: dos días de una serie son seleccionables por separado.
const selectedTaskOccurrences = new Map();
let taskMultiDragEntries = null;
let taskMultiDragPreview = null;
let taskMultiActionPending = false;
let taskSelectionDeleteScopeResolve = null;
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
  const cancelButton = document.getElementById('task-selection-cancel');
  if (cancelButton) cancelButton.textContent = count > 1 ? `Cancelar selección (${count})` : 'Cancelar selección';
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
function planTaskSelectionChange(entries, anchor, targetDate, { copy = false, timeDelta = null, startMin = null, archive = false, remove = false, deleteScopes = new Map() } = {}) {
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
        const scope = deleteScopes.get(taskOccurrenceKey(entry.id, entry.date));
        if (scope === 'all') {
          plannedTasks.splice(plannedTasks.indexOf(original), 1);
          continue;
        }
        if (scope !== 'only-this') continue;
        original.recurrence.exceptions ||= [];
        if (!original.recurrence.exceptions.includes(entry.date)) original.recurrence.exceptions.push(entry.date);
      } else {
        const index = plannedTasks.indexOf(original);
        plannedTasks.splice(index, 1);
      }
      continue;
    }
    // Una selección múltiple nunca mueve, copia ni archiva una serie.
    if (recurring) continue;
    let changed = original;
    if (copy) {
      changed = structuredClone(original);
      changed.id = 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
      changed.recurrence = null;
      delete changed.completedOccurrences;
      delete changed.positionOverrides;
      plannedTasks.push(changed);
    }
    changed.date = archive ? '' : entry.date ? taskSelectionShiftDate(entry.date, dayDelta) : targetDate;
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
    results.push({ id: String(changed.id), date: changed.date });
  }
  return { tasks: plannedTasks, selection: results, preservedSelection: remove ? [] : entries.filter(isTaskSelectionRecurring) };
}

function isTaskSelectionRecurring(entry) {
  return !!tasks.find(task => String(task.id) === entry.id)?.recurrence?.enabled;
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
  [...plan.selection, ...(plan.preservedSelection || [])].forEach(entry => selectedTaskOccurrences.set(taskOccurrenceKey(entry.id, entry.date), entry));
  saveTasksToStorage();
  renderWeeklyCalendar();
  if (typeof renderBriefcaseTasks === 'function') renderBriefcaseTasks();
  if (typeof refreshAlarms === 'function') refreshAlarms();
  refreshTaskSelection();
}

function getTaskSelectionAfterElement(container, clientY, entries, copy) {
  if (!container) return null;
  if (copy || !container.querySelectorAll) return getDragAfterElement(container, clientY);
  const selectedKeys = new Set(entries.filter(entry => !isTaskSelectionRecurring(entry)).map(entry => taskOccurrenceKey(entry.id, entry.date)));
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
    dayTasks.forEach((task, position) => {
      if (!plan.preservedSelection.some(entry => entry.id === String(task.id))) setEffectivePosition(task, destination, position * 10);
    });
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

function askTaskSelectionDeleteScope(task, date) {
  return new Promise(resolve => {
    const modal = document.getElementById('confirm-modal');
    const onChoice = event => {
      const button = event.target.closest('#delete-only-this-btn, #delete-all-occurrences-btn');
      if (!button) return;
      event.preventDefault(); event.stopImmediatePropagation();
      finish(button.id === 'delete-only-this-btn' ? 'only-this' : 'all');
    };
    const heading = modal.querySelector('h2');
    const originalHeading = heading.textContent;
    const finish = scope => {
      taskSelectionDeleteScopeResolve = null;
      modal.removeEventListener('click', onChoice, true);
      heading.textContent = originalHeading;
      closeConfirmModal();
      resolve(scope);
    };
    taskSelectionDeleteScopeResolve = finish;
    modal.addEventListener('click', onChoice, true);
    openConfirmModal(task, date);
    heading.textContent = `${task.title || '(Sin título)'} · ${date}`;
    modal.querySelector('#delete-only-this-btn').focus();
  });
}

async function deleteTaskSelectionWithScopes(entries) {
  taskMultiActionPending = true;
  const scopes = new Map(), entireSeries = new Set();
  try {
    for (const entry of entries.filter(isTaskSelectionRecurring)) {
      if (entireSeries.has(entry.id)) continue;
      const task = tasks.find(task => String(task.id) === entry.id);
      const scope = await askTaskSelectionDeleteScope(task, entry.date);
      if (scope === 'cancel') return;
      scopes.set(taskOccurrenceKey(entry.id, entry.date), scope);
      if (scope === 'all') entireSeries.add(entry.id);
    }
    const plan = planTaskSelectionChange(entries, entries[0], '', { remove: true, deleteScopes: scopes });
    commitTaskSelectionPlan(plan);
  } finally { taskMultiActionPending = false; }
}

function requestDeleteTaskSelection(entries = [...selectedTaskOccurrences.values()]) {
  if (!entries.length || taskMultiActionPending) return;
  entries = entries.map(entry => ({ ...entry }));
  if (entries.some(isTaskSelectionRecurring)) return deleteTaskSelectionWithScopes(entries);
  const overlay = document.createElement('div');
  overlay.className = 'task-selection-confirm';
  overlay.innerHTML = `<div class="task-selection-confirm-box" role="dialog" aria-modal="true" aria-labelledby="task-selection-delete-title">
    <h2 id="task-selection-delete-title">Eliminar ${entries.length} ${entries.length === 1 ? 'tarea' : 'tareas'}</h2>
    <p>Se eliminarán las tareas seleccionadas.</p>
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

// Proyectar sin tocar los datos: las apariciones conservan distancia, duración y completado.
function projectTaskSelectionSchedule(entries, anchor, targetDate, timeDelta = 0, startMin = null, stationary = false) {
  const dayDelta = taskSelectionDayDelta(anchor.date || entries.find(entry => entry.date)?.date, targetDate);
  let untimedOffset = 0;
  return entries.flatMap(entry => {
    const original = tasks.find(task => String(task.id) === entry.id);
    if (!original) return [];
    if (original.recurrence?.enabled && !stationary) return [];
    const range = getTaskTimeRange(original);
    const duration = range ? (range.crossesMidnight ? range.rawEndMin + 1440 : range.rawEndMin) - range.startMin : (original.duration || 60);
    if (!range && startMin === null) return [];
    const shiftedStart = range ? range.startMin + timeDelta : startMin + untimedOffset;
    if (!range) untimedOffset += duration;
    const date = taskSelectionShiftDate(entry.date ? taskSelectionShiftDate(entry.date, dayDelta) : targetDate, Math.floor(shiftedStart / 1440));
    const start = ((shiftedStart % 1440) + 1440) % 1440;
    const task = { ...original, date, recurrence: null,
      startTime: taskSelectionHHMM(start), endTime: taskSelectionHHMM(start + duration), duration,
      completed: original.recurrence?.enabled ? !!original.completedOccurrences?.includes(entry.date) : !!original.completed };
    return [{ entry, task, start, duration }];
  });
}

function startTaskSelectionPreview(drag, event) {
  stopTaskSelectionPreview();
  if (!drag.selectionEntries || drag.selectionEntries.length < 2) return;
  const templates = [];
  for (const entry of drag.selectionEntries) {
    if (isTaskSelectionRecurring(entry)) continue;
    const original = [...document.querySelectorAll('.cr-task-block[data-task-id]')].find(element => {
      const candidate = taskSelectionEntry(element);
      return candidate?.id === entry.id && candidate.date === entry.date && !element.classList.contains('cr-tail') && element.getClientRects().length > 0;
    });
    if (original) templates.push({ entry, clone: original.cloneNode(true), rect: original.getBoundingClientRect() });
  }
  taskMultiDragPreview = { kind: 'pointer', drag, origins: new Set(), blocks: [], columns: [], templates,
    x: event.clientX, y: event.clientY, signature: null };
}

function drawTaskSelectionSchedule(state, schedule, columns, role) {
  for (const { entry, task, start, duration } of schedule) {
    const tag = tags.find(tag => tag.id === task.tagId) || tags.find(tag => tag.id === 'default');
    // Recortar cada tramo en su día, igual que renderCronogramaDayBlocks.
    let remaining = duration, offset = 0, top = start;
    while (remaining > 0) {
      const date = taskSelectionShiftDate(task.date, offset);
      const height = Math.min(remaining, 1440 - top);
      for (const column of columns.filter(column => column.dataset.date === date)) {
        const block = buildCronogramaBlock(top, top + height, (offset ? '↪ ' : '') + (task.title || '(Sin título)'),
          task.description, task.completed, tag, task, entry.date, offset > 0);
        if (!block) continue;
        block.dataset.occurrenceDate = entry.date;
        decorateTaskSelection(block, entry.id, entry.date);
        block.classList.add('task-selection-time-preview');
        block.dataset.previewRole = role;
        block.dataset.selectionStart = String(start - offset * 1440);
        block.setAttribute('aria-hidden', 'true');
        column.appendChild(block);
        state.blocks.push(block);
      }
      remaining -= height;
      top = 0;
      offset++;
    }
  }
}

function arrangeTaskSelectionPreviewColumns(columns) {
  for (const column of columns) {
    const blocks = [...column.querySelectorAll('.cr-task-block[data-task-id]:not(.task-selection-time-origin)')];
    const start = block => {
      if (block.dataset.selectionStart !== undefined) return Number(block.dataset.selectionStart);
      const task = tasks.find(task => String(task.id) === block.dataset.taskId);
      const range = task && getTaskTimeRange(task);
      return range ? range.startMin - (block.classList.contains('cr-tail') ? 1440 : 0) : Number(block.dataset.topMin);
    };
    blocks.sort((a, b) => start(a) - start(b)).forEach(block => column.appendChild(block));
    if (typeof updateCronogramaOverlapOffsets === 'function') updateCronogramaOverlapOffsets(column);
  }
}

function renderTaskSelectionSchedulePreview(state, entries, anchor, targetDate, timeDelta, startMin, copy, columns, floating = false) {
  const keys = new Set(entries.map(entry => taskOccurrenceKey(entry.id, entry.date)));
  document.querySelectorAll('.cr-task-block[data-task-id]:not(.task-selection-time-preview):not(.task-selection-drag-preview):not(.cr-copy-ghost)').forEach(element => {
    const entry = taskSelectionEntry(element);
    if (!keys.has(taskOccurrenceKey(entry.id, entry.date))) return;
    state.origins.add(element);
    element.classList.toggle('task-selection-time-origin', !(floating && element === state.drag?.block && !isTaskSelectionRecurring(entry)));
  });
  const signature = JSON.stringify([targetDate, timeDelta, startMin, copy, floating]);
  if (state.signature === signature && state.columns.length === columns.length && state.columns.every((column, index) => column === columns[index]) && state.blocks.every(block => block.isConnected)) return;
  state.blocks.forEach(block => block.remove());
  state.blocks = [];
  state.signature = signature;
  state.columns = columns;
  const recurring = entries.filter(isTaskSelectionRecurring);
  // Dibujar las repeticiones en su lugar incluso si son el bloque agarrado.
  drawTaskSelectionSchedule(state, projectTaskSelectionSchedule(recurring, anchor, anchor.date, 0, null, true), columns, 'stationary');
  if (copy) drawTaskSelectionSchedule(state, projectTaskSelectionSchedule(entries, anchor, anchor.date, 0), columns, 'source');
  if (!floating) drawTaskSelectionSchedule(state, projectTaskSelectionSchedule(entries, anchor, targetDate, timeDelta, startMin ?? 0), columns, 'destination');
  arrangeTaskSelectionPreviewColumns(columns);
}

function updateTaskSelectionPreview(event, copy) {
  if (typeof crDrag === 'undefined' || !crDrag?.selectionEntries?.length || crDrag.selectionEntries.length < 2) return;
  if (!taskMultiDragPreview || taskMultiDragPreview.drag !== crDrag) startTaskSelectionPreview(crDrag, { clientX: crDrag.grabClientX, clientY: crDrag.grabClientY });
  const state = taskMultiDragPreview;
  const drag = crDrag;
  const floating = !!drag.floating;
  const anchor = { id: String(drag.task.id), date: drag.sourceDate };
  renderTaskSelectionSchedulePreview(state, drag.selectionEntries, anchor, drag.targetColEl?.dataset.date || drag.sourceDate,
    drag.newStartMin - drag.originalStartMin, null, copy, drag.cols, floating);
  // Fuera del horario, acompañar al bloque agarrado hasta la papelera o el archivo.
  if (floating) {
    state.templates.forEach(({ entry, clone, rect }) => {
      if (entry.id === anchor.id && entry.date === anchor.date) return;
      if (!clone.isConnected) {
        clone.classList.add('task-selection-drag-preview');
        Object.assign(clone.style, { position: 'fixed', left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px', right: 'auto', margin: '0' });
        document.body.appendChild(clone);
      }
      clone.style.transform = `translate(${event.clientX - state.x}px, ${event.clientY - state.y}px)`;
    });
  } else state.templates.forEach(({ clone }) => clone.remove());
}

function showTaskSelectionCronogramaDropPreview(taskId, column, clientY, copy) {
  const entries = taskMultiDragEntries;
  if (!entries || entries.length < 2) return false;
  if (!taskMultiDragPreview || taskMultiDragPreview.kind !== 'native') {
    stopTaskSelectionPreview();
    taskMultiDragPreview = { kind: 'native', origins: new Set(), blocks: [], columns: [], templates: [], signature: null };
  }
  const anchor = { id: String(taskId), date: draggedTaskSourceDate || '' };
  const task = tasks.find(task => String(task.id) === anchor.id);
  const range = task && getTaskTimeRange(task);
  const startMin = cronogramaDropStartMin(column, clientY);
  const columns = [...column.closest('#cronograma-grid').querySelectorAll('.cr-day-col')];
  renderTaskSelectionSchedulePreview(taskMultiDragPreview, entries, anchor, column.dataset.date,
    range ? startMin - range.startMin : 0, startMin, copy, columns);
  return true;
}

function stopTaskSelectionPreview() {
  if (!taskMultiDragPreview) return;
  const state = taskMultiDragPreview;
  taskMultiDragPreview = null;
  state.blocks.forEach(block => block.remove());
  state.templates.forEach(({ clone }) => clone.remove());
  state.origins.forEach(original => original.classList.remove('task-selection-time-origin'));
  arrangeTaskSelectionPreviewColumns(state.columns.filter(column => column.isConnected));
}

function startTaskSelectionNativeDrag(card, event) {
  if (!taskMultiDragEntries || taskMultiDragEntries.length < 2) return;
  const image = document.createElement('div');
  image.className = 'task-selection-native-preview';
  const movable = taskMultiDragEntries.filter(entry => !isTaskSelectionRecurring(entry));
  const cards = movable.map(entry => [...document.querySelectorAll('.task-multi-selected')].find(element => {
    const candidate = taskSelectionEntry(element);
    return candidate?.id === entry.id && candidate.date === entry.date && element.getClientRects().length > 0;
  })).filter(Boolean);
  cards.forEach((element, index) => {
    const clone = element.cloneNode(true);
    Object.assign(clone.style, {position:'relative',left:'auto',right:'auto',top:'auto',height:'auto',width:'220px',margin:'4px',transform:`translateX(${index*6}px)`});
    image.appendChild(clone);
  });
  const count = document.createElement('span');
  count.className = 'task-selection-native-count'; count.textContent = movable.length ? `${movable.length} tareas` : 'Solo eliminar';
  image.appendChild(count); document.body.appendChild(image);
  event.dataTransfer.setDragImage(image, 24, 24);
  setTimeout(() => image.remove(), 0);
  document.querySelectorAll('.task-multi-selected').forEach(element => element.classList.toggle('task-selection-drag-origin', !isTaskSelectionRecurring(taskSelectionEntry(element)) && !(event.ctrlKey || event.metaKey)));
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
    document.querySelectorAll('.task-multi-selected:not(.task-selection-time-preview)').forEach(element => element.classList.toggle('task-selection-drag-origin', !isTaskSelectionRecurring(taskSelectionEntry(element)) && !(event.ctrlKey || event.metaKey)));
  });
  document.addEventListener('dragend', () => {
    taskMultiDragEntries = null;
    stopTaskSelectionPreview();
    document.querySelectorAll('.task-selection-drag-origin').forEach(element => element.classList.remove('task-selection-drag-origin'));
  });
  refreshTaskSelection();
}

// ── Selección múltiple en MÓVIL ───────────────────────────────────────────
// Mantener presionada una tarea (sin mover el dedo) activa la selección; luego
// un toque simple agrega o quita tareas. Un botón inferior cancela la selección.
// Mover, archivar y eliminar el grupo reutiliza la lógica de escritorio.
const TASK_SELECTION_TOUCH_HOLD_MS = 1000; // 1 s (más largo que el long-press de arrastre)
let taskSelectionTouchHold = null;
let taskSelectionTouchClickBlocked = false;

function isTaskSelectionTouchTarget(element) {
  return !!element && !element.closest('.task-selection-drag-preview, #drag-ghost')
    && !element.classList.contains('task-selection-time-preview') && !element.classList.contains('cr-copy-ghost');
}

function cancelTaskSelectionTouchHold() {
  if (taskSelectionTouchHold) clearTimeout(taskSelectionTouchHold.timer);
  taskSelectionTouchHold = null;
}

function enterTaskSelectionFromTouch(element) {
  taskSelectionTouchHold = null;
  const entry = taskSelectionEntry(element);
  if (!entry || selectedTaskOccurrences.size) return;
  // Anular el arrastre que ya había empezado con el long-press corto.
  if (typeof crDrag !== 'undefined' && crDrag) cancelTaskSelectionHeldCronogramaDrag();
  if (typeof cancelCronogramaTouch === 'function') cancelCronogramaTouch();
  document.body.classList.remove('cr-dragging-active');
  if (typeof isTouchDragging !== 'undefined' && (isTouchDragging || touchTimeout)) {
    clearTouchTimeout();
    stopAutoScroll();
    cleanupDraggingUI();
    cleanupGlobalTouchListeners();
    isTouchDragging = false;
  }
  // El toque que se suelta tras la pulsación larga no debe abrir ni deseleccionar.
  taskSelectionTouchClickBlocked = true;
  toggleTaskSelection(entry.id, entry.date);
  if (navigator.vibrate) navigator.vibrate(30);
}

// Anula el arrastre del horario sin volver a dibujarlo. Si el bloque sigue en su
// lugar (lo normal al mantener el dedo quieto), basta con quitarle el estado de
// arrastre: re-renderizar el horario provocaba un destello y podía recentrar el
// carrusel en otro día. Si el bloque llegó a moverse, se usa la cancelación normal.
function cancelTaskSelectionHeldCronogramaDrag() {
  const drag = crDrag;
  const inPlace = !drag.floating && !drag.ghost
    && drag.block.parentElement === drag.startColEl
    && drag.newStartMin === drag.originalStartMin;
  if (!inPlace) { cancelCronogramaDrag(); return; }
  crDrag = null;
  stopTaskSelectionPreview();
  stopCronogramaEdgeScroll();
  clearCronogramaHorizontalEdge();
  clearCronogramaDragOver();
  clearCronogramaHeaderTargets();
  drag.block.classList.remove('cr-dragging', 'cr-floating');
  drag.block.style.pointerEvents = '';
  document.body.classList.remove('dragging-active');
}

function setupTaskMultiSelectionTouch() {
  const selector = '.task-card[data-id], .cr-task-block[data-task-id]';

  const cancelButton = document.createElement('button');
  cancelButton.id = 'task-selection-cancel';
  cancelButton.type = 'button';
  cancelButton.textContent = 'Cancelar selección';
  cancelButton.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    clearTaskSelection();
  });
  document.body.appendChild(cancelButton);

  document.addEventListener('touchstart', event => {
    cancelTaskSelectionTouchHold();
    taskSelectionTouchClickBlocked = false;
    if (!isMobile() || event.touches.length !== 1 || selectedTaskOccurrences.size) return;
    if (typeof taskPlacement !== 'undefined' && taskPlacement) return;
    if (event.target.closest('.task-check-btn, .task-check-icon')) return;
    const element = event.target.closest(selector);
    if (!isTaskSelectionTouchTarget(element)) return;
    const touch = event.touches[0];
    taskSelectionTouchHold = {
      x: touch.clientX,
      y: touch.clientY,
      timer: setTimeout(() => enterTaskSelectionFromTouch(element), TASK_SELECTION_TOUCH_HOLD_MS)
    };
  }, { capture: true, passive: true });

  document.addEventListener('touchmove', event => {
    if (!taskSelectionTouchHold) return;
    const touch = event.touches[0];
    if (!touch || Math.hypot(touch.clientX - taskSelectionTouchHold.x, touch.clientY - taskSelectionTouchHold.y) > 10) cancelTaskSelectionTouchHold();
  }, { capture: true, passive: true });
  document.addEventListener('touchend', cancelTaskSelectionTouchHold, { capture: true, passive: true });
  document.addEventListener('touchcancel', cancelTaskSelectionTouchHold, { capture: true, passive: true });

  // Con la selección activa, un toque simple agrega o quita la tarea en vez de abrirla.
  document.addEventListener('click', event => {
    if (!isMobile()) return;
    const element = event.target.closest(selector);
    if (!isTaskSelectionTouchTarget(element)) return;
    if (taskSelectionTouchClickBlocked) {
      taskSelectionTouchClickBlocked = false;
      event.preventDefault(); event.stopImmediatePropagation();
      return;
    }
    if (!selectedTaskOccurrences.size) return;
    event.preventDefault(); event.stopImmediatePropagation();
    // El click que sigue a un arrastre no cambia la selección.
    if ((typeof preventClick !== 'undefined' && preventClick) || (typeof suppressNextCronogramaClick !== 'undefined' && suppressNextCronogramaClick)) return;
    const entry = taskSelectionEntry(element);
    if (entry) toggleTaskSelection(entry.id, entry.date);
  }, true);

  refreshTaskSelection();
}

window.addEventListener('DOMContentLoaded', setupTaskMultiSelection);
window.addEventListener('DOMContentLoaded', setupTaskMultiSelectionTouch);

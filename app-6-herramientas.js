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
  // Línea roja de inicio del cronómetro en el horario.
  if (typeof refreshTimerStartLine === 'function') refreshTimerStartLine();
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
    const input = document.getElementById('timer-tag-select-input');
    if (circle) circle.style.backgroundColor = tag.color.bg;
    if (input) input.value = tag.name;
  }
}

function buildTimerTagSelectorOptions() {
  const container = document.getElementById('timer-tag-options-container');
  if (!container) return;
  container.innerHTML = '';

  getOrderedTagsForDisplay().forEach(tag => {
    const option = document.createElement('div');
    option.className = 'custom-option';
    option.dataset.value = tag.id;
    option.dataset.name = tag.name;

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
    completed: true
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

// Nueva marca: finaliza la tarea actual y arranca una nueva de inmediato.
function newMarkTimer() {
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

  createTimedTask(getEffectiveStartDate(), new Date(), title, tagId, description);

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timerStartTime = null;
  timerSeconds = 0;
  setTimerButtonActive(false);
  clearActiveTimerState();

  startTimer();
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
      if (cronogramaActive) crSlideWeek(-1);
      else navigateToWeek(-1);
    }
  });

  document.getElementById('next-week-btn').addEventListener('click', () => {
    if (isMobile()) {
      if (cronogramaActive) { shiftCronogramaMobileDay(1); return; }
      const visibleDate = getMobileVisibleDate() || new Date();
      jumpMobileFeedToDate(addDays(visibleDate, 1));
    } else {
      if (cronogramaActive) crSlideWeek(1);
      else navigateToWeek(1);
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
    // Si el modal de estadísticas diarias/generales está abierto, usar flechas para cambiar con animación de deslizamiento
    const activeModal = document.getElementById(activeStatsPrefix + '-modal');
    const editContent = document.getElementById(activeStatsPrefix + '-edit-content');
    const settingsContent = document.getElementById(activeStatsPrefix + '-settings-content');
    const isEditing = (editContent && !editContent.classList.contains('hidden'))
      || (settingsContent && !settingsContent.classList.contains('hidden'));
    if (activeModal && !activeModal.classList.contains('hidden') && currentDailyStatsDate && !isEditing) {
      const isGeneralRange = (activeStatsPrefix === 'general-stats' && generalStatsDateRange);
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const slider = document.getElementById(activeStatsPrefix + '-slider');
        if (slider) {
          slider.style.transition = 'transform 0.25s ease';
          slider.style.transform = 'translateX(0%)';
          setTimeout(() => {
            if (isGeneralRange) {
              shiftGeneralStatsRange(-1);
            } else {
              const currentDate = new Date(currentDailyStatsDate + 'T12:00:00');
              currentDate.setDate(currentDate.getDate() - 1);
              estadisticasDiarias(formatDate(currentDate));
            }
          }, 250);
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const slider = document.getElementById(activeStatsPrefix + '-slider');
        if (slider) {
          slider.style.transition = 'transform 0.25s ease';
          slider.style.transform = 'translateX(-66.6666%)';
          setTimeout(() => {
            if (isGeneralRange) {
              shiftGeneralStatsRange(1);
            } else {
              const currentDate = new Date(currentDailyStatsDate + 'T12:00:00');
              currentDate.setDate(currentDate.getDate() + 1);
              estadisticasDiarias(formatDate(currentDate));
            }
          }, 250);
        }
      }
      return;
    }

    if (isMobile()) return;
    // No activar si el foco está en un input, textarea o elemento editable
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
    // No activar si hay un modal abierto
    const modal = document.getElementById('task-modal');
    if (modal && !modal.classList.contains('hidden') && modal.style.display !== 'none') return;

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (cronogramaActive) crSlideWeek(-1);
      else navigateToWeek(-1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (cronogramaActive) crSlideWeek(1);
      else navigateToWeek(1);
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

  // Clic en espacios vacíos del horario → crear tarea (delegado en el grid).
  setupCronogramaClickDelegation();

  // Campos de hora del editor: la "Hora de fin" se habilita solo si hay inicio,
  // y se muestra la duración calculada en tiempo real.
  const taskStartInput = document.getElementById('task-input-start');
  const taskEndInput = document.getElementById('task-input-end');
  
  if (!isMobile()) {
    setupTimeMaskInput(taskStartInput);
    setupTimeMaskInput(taskEndInput);
    setupTimeMaskInput(document.getElementById('task-input-duration'));
  }

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

  // Campos de hora: se puede ESCRIBIR con el teclado Y abrir el selector nativo (solo móvil).
  [taskStartInput, taskEndInput].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('click', () => {
      if (inp.disabled) return;
      if (isMobile()) {
        if (typeof inp.showPicker === 'function') {
          try { inp.showPicker(); } catch (_) {}
        }
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

  // Inicio / Fin / Duración: completado automático entre los 3 campos.
  setupTaskTimeFieldsLogic();

  // Botón ✕ del campo de TÍTULO: borra todo lo escrito y deja el foco en el campo.
  const titleClearBtn = document.getElementById('task-title-clear');
  if (titleClearBtn) {
    titleClearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const titleEl = document.getElementById('task-input-title');
      if (!titleEl) return;
      titleEl.value = '';
      titleEl.dispatchEvent(new Event('input', { bubbles: true }));
      titleEl.focus();
    });
  }

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

  // Icono de reloj (hora de inicio / fin) → coloca la hora actual en el campo.
  document.querySelectorAll('.time-clock-icon').forEach(icon => {
    icon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const target = document.getElementById(icon.dataset.target);
      if (!target || target.disabled) return;
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      target.value = `${hh}:${mm}`;
      // Disparar la misma lógica que al editar el campo manualmente.
      target.dispatchEvent(new Event('input', { bubbles: true }));
      target.dispatchEvent(new Event('change', { bubbles: true }));
      syncEndTimeEnabled();
      updateDurationDisplay();
      syncAlarmCheckboxState();
    });
  });

  // Icono de calendario (a la izquierda del campo de fecha) → abre el selector
  // nativo del campo correspondiente.
  document.querySelectorAll('.date-calendar-icon').forEach(icon => {
    icon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const target = document.getElementById(icon.dataset.target);
      if (!target) return;
      // Si el campo de fecha está deshabilitado es porque la tarea está archivada
      // (sin fecha). Pulsar el calendario es la acción para volver a darle fecha:
      // desarchivamos (rehabilita el campo y pone una fecha por defecto) y luego
      // abrimos el selector. Así la ✕ (archivar) y el calendario (dar fecha) son
      // acciones opuestas y deterministas, sin desincronización.
      if (target.disabled && target.id === 'task-input-date') {
        const briefcaseCheckbox = document.getElementById('task-in-briefcase-checkbox');
        if (briefcaseCheckbox && briefcaseCheckbox.checked) {
          briefcaseCheckbox.checked = false;
          briefcaseCheckbox.dispatchEvent(new Event('change'));
        }
      }
      if (target.disabled) return;
      if (!isMobile() && target.classList.contains('time-masked-input')) {
        target.focus();
        return;
      }
      if (typeof target.showPicker === 'function') {
        try { target.showPicker(); } catch (_) { target.focus(); }
      } else {
        target.focus();
      }
    });
  });

  // Clic sobre el CAMPO de fecha (incluido el overlay "--/--/--" cuando está
  // archivado/vacío) → misma acción que el icono de calendario: si está
  // archivado, desarchiva y abre el selector; si no, abre el selector. Se pone
  // en el wrapper porque el input deshabilitado no emite eventos de clic.
  const taskDateWrapper = document.querySelector('.task-date-group .date-input-wrapper');
  if (taskDateWrapper) {
    // Captura (true): el wrapper recibe el clic ANTES que el input. Es necesario
    // porque un input deshabilitado (archivado) es inerte y no propaga el clic;
    // en fase de captura el handler corre igual al pulsar sobre el "--/--/--".
    taskDateWrapper.addEventListener('click', (e) => {
      // Dejar que sus botones (icono de calendario y ✕) usen sus propios handlers.
      if (e.target.closest('.date-calendar-icon, .time-clear-btn')) return;
      const target = document.getElementById('task-input-date');
      if (!target) return;
      if (target.disabled) {
        const briefcaseCheckbox = document.getElementById('task-in-briefcase-checkbox');
        if (briefcaseCheckbox && briefcaseCheckbox.checked) {
          briefcaseCheckbox.checked = false;
          briefcaseCheckbox.dispatchEvent(new Event('change'));
        }
      }
      if (target.disabled) return;
      if (typeof target.showPicker === 'function') {
        try { target.showPicker(); } catch (_) { target.focus(); }
      } else {
        target.focus();
      }
    }, true);
  }

  // ✕ junto a la FECHA → quita la fecha y archiva la tarea (reutiliza el checkbox
  // oculto de archivar, disparando su lógica existente).
  const dateClearBtn = document.getElementById('task-date-clear');
  if (dateClearBtn) {
    dateClearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const briefcaseCheckbox = document.getElementById('task-in-briefcase-checkbox');
      if (!briefcaseCheckbox) return;
      // La ✕ SIEMPRE significa "sin fecha definida" → archivar. No alterna: si ya
      // está archivada, no hace nada (antes invertía el estado y, al reponer una
      // fecha desde el calendario sin re-sincronizar el checkbox, el siguiente
      // clic en la ✕ desarchivaba en vez de archivar). Para volver a darle fecha
      // se usa el icono de calendario / el propio campo (ver más abajo).
      if (briefcaseCheckbox.checked) return; // ya archivada
      briefcaseCheckbox.checked = true;
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

  // Auto-categorización: al terminar de escribir/editar el título (blur o Enter)
  // se asigna la actividad cuya palabra clave coincida. Solo en ese instante.
  const taskTitleEl = document.getElementById('task-input-title');
  if (taskTitleEl) {
    taskTitleEl.addEventListener('blur', autoCategorizeFromTitle);
    taskTitleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        autoCategorizeFromTitle();
      }
    });
  }

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

  // ── Aviso de tareas adyacentes: botones Cancelar / Conservar / Modificar todo
  (function bindAdjacentTasksModal() {
    const cancelBtn = document.getElementById('adjacent-cancel-btn');
    const keepBtn = document.getElementById('adjacent-keep-btn');
    const modifyAllBtn = document.getElementById('adjacent-modify-all-btn');
    const closeX = document.querySelector('#adjacent-tasks-modal .close-modal-btn');

    // CANCELAR / cerrar.
    //  - modo 'editor': no se había aplicado nada → solo cerrar (vuelve al editor).
    //  - modo 'drag'  : el arrastre se aplicó en memoria pero NO se guardó →
    //    revertir la tarea a su horario original (sin persistir el arrastre).
    const onCancel = () => {
      if (pendingAdjacent && pendingAdjacent.mode === 'drag') {
        const { task, revert } = pendingAdjacent;
        if (task && revert) {
          task.startTime = revert.startTime;
          task.endTime = revert.endTime;
          task.date = revert.date;
          if (revert.duration !== undefined) task.duration = revert.duration;
          // El arrastre nunca se guardó; al revertir basta con re-render. No es
          // necesario guardar (el estado persistido sigue siendo el original).
          if (typeof renderCronograma === 'function') renderCronograma();
          renderWeeklyCalendar();
          if (typeof refreshAlarms === 'function') refreshAlarms();
        }
      }
      closeAdjacentTasksModal();
    };
    if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
    if (closeX) closeX.addEventListener('click', onCancel);

    // CONSERVAR: aplica mi cambio (si no estaba aplicado) y deja las vecinas intactas.
    if (keepBtn) keepBtn.addEventListener('click', () => {
      if (!pendingAdjacent) { closeAdjacentTasksModal(); return; }
      if (pendingAdjacent.mode === 'drag') {
        // El arrastre está aplicado en memoria pero NO se había guardado: ahora
        // que el usuario elige Conservar, se persiste el cambio.
        saveTasksToStorage();
        closeAdjacentTasksModal();
        return;
      }
      const { formData, taskId, occurrenceDate } = pendingAdjacent;
      applyTaskChanges('all', formData, taskId, occurrenceDate);
      closeAdjacentTasksModal();
      closeTaskModal();
    });

    // MODIFICAR TODO: aplica mi cambio Y ajusta las vecinas viables.
    if (modifyAllBtn) modifyAllBtn.addEventListener('click', () => {
      if (!pendingAdjacent) { closeAdjacentTasksModal(); return; }
      if (pendingAdjacent.mode === 'drag') {
        // El arrastre ya está aplicado; solo ajustamos las vecinas.
        applyAdjacentAffectations(pendingAdjacent.affectations);
        saveTasksToStorage();
        if (typeof renderCronograma === 'function') renderCronograma();
        renderWeeklyCalendar();
        if (typeof refreshAlarms === 'function') refreshAlarms();
        closeAdjacentTasksModal();
        return;
      }
      const { formData, taskId, occurrenceDate, affectations } = pendingAdjacent;
      applyTaskChanges('all', formData, taskId, occurrenceDate);
      // applyTaskChanges ya hizo pushToUndoStack + guardó; aplicamos las vecinas
      // sobre el estado resultante y volvemos a guardar/renderizar.
      applyAdjacentAffectations(affectations);
      saveTasksToStorage();
      renderWeeklyCalendar();
      if (typeof refreshAlarms === 'function') refreshAlarms();
      closeAdjacentTasksModal();
      closeTaskModal();
    });
  })();

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

    // Si hay 2 de los 3 parámetros (inicio / fin / duración), completar el 3º.
    completeTaskTimeFieldsBeforeSave();

    // Hora de inicio / fin desde los campos del editor. Ambas son OPCIONALES e
    // INDEPENDIENTES: se puede definir un fin sin inicio (y viceversa).
    const startInputEl = document.getElementById('task-input-start');
    const endInputEl = document.getElementById('task-input-end');
    const startTime = (startInputEl && startInputEl.value) ? startInputEl.value : null;
    const endTime = (endInputEl && endInputEl.value) ? endInputEl.value : null;

    // Duración (minutos): la del campo Duración; si está vacío pero hay inicio
    // y fin, se calcula de ellos (soporta cruce de medianoche).
    let duration = getDurationFieldMinutes();
    if (duration === null && startTime && endTime) {
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

    // ── Aviso de tareas adyacentes (horario coincidente) ──────────────────
    // Solo en edición de una tarea EXISTENTE con horario (inicio+fin) que se
    // guarda en el planner (no maletín). Detecta vecinas pegadas al borde
    // que cambió y, si hay alguna ajustable, pregunta antes de aplicar.
    if (selectedTaskId && !isBriefcase && startTime && endTime) {
      const existingTaskForAdj = tasks.find(t => t.id === selectedTaskId);
      if (existingTaskForAdj) {
        const oldRange = getTaskAbsoluteRange(existingTaskForAdj);
        // Simulación de la tarea con el nuevo horario para detectar vecinas.
        const simulated = { id: selectedTaskId, date, startTime, endTime };
        const affectations = oldRange
          ? findAdjacentAffectedTasks(simulated, oldRange)
          : [];
        if (affectations.length > 0) {
          pendingAdjacent = {
            formData,
            taskId: selectedTaskId,
            occurrenceDate: selectedOccurrenceDate,
            affectations
          };
          openAdjacentTasksModal(affectations);
          return; // esperamos la decisión del usuario
        }
      }
    }

    // Caso normal (no recurrente, o nueva tarea): aplicar directo.
    applyTaskChanges('all', formData, selectedTaskId, selectedOccurrenceDate);
    closeTaskModal();
  });

  // Delete Task Button
  // Checkbox de completado del modal: alterna el estado y avisa con un toast
  // (mismo estilo del mensaje de cambio de modo).
  const taskCompleteBtn = document.getElementById('task-complete-btn');
  if (taskCompleteBtn) {
    taskCompleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!selectedTaskId) return;
      // No se guarda nada aquí: solo se alterna el estado PENDIENTE y se repinta
      // el icono. El cambio real se aplica al guardar la tarea (submit).
      const current = (pendingCompleteState !== null)
        ? pendingCompleteState
        : isTaskCompletedForModal(tasks.find(t => t.id === selectedTaskId), selectedOccurrenceDate);
      pendingCompleteState = !current;
      renderTaskModalCheckbox(pendingCompleteState);
    });
  }

  document.getElementById('delete-task-btn').addEventListener('click', async () => {
    if (!selectedTaskId) return;
    
    const task = tasks.find(t => t.id === selectedTaskId);
    if (!task) return;

    if (task.recurrence && task.recurrence.enabled) {
      // Abrir modal de confirmación personalizado para tarea recurrente
      openConfirmModal(task, selectedOccurrenceDate);
    } else if (isMobile()) {
      // En móvil, pedir confirmación antes de eliminar una tarea simple.
      openDeleteTaskConfirmModal();
    } else {
      // Escritorio: eliminar tarea simple directamente sin confirmación.
      pushToUndoStack();
      tasks = tasks.filter(t => t.id !== selectedTaskId);
      saveTasksToStorage();
      closeTaskModal();
      renderWeeklyCalendar();
    }
  });

  // ── Modal de confirmación de borrado (móvil) ──────────────────────────────
  const delConfirmCancel = document.getElementById('delete-task-confirm-cancel-btn');
  const delConfirmOk = document.getElementById('delete-task-confirm-ok-btn');
  const delConfirmClose = document.querySelector('#delete-task-confirm-modal .close-modal-btn');
  const closeDelConfirm = () => closeDeleteTaskConfirmModal();
  if (delConfirmCancel) delConfirmCancel.addEventListener('click', closeDelConfirm);
  if (delConfirmClose) delConfirmClose.addEventListener('click', closeDelConfirm);
  if (delConfirmOk) delConfirmOk.addEventListener('click', () => {
    if (!selectedTaskId) { closeDeleteTaskConfirmModal(); return; }
    pushToUndoStack();
    tasks = tasks.filter(t => t.id !== selectedTaskId);
    saveTasksToStorage();
    closeDeleteTaskConfirmModal();
    closeTaskModal();
    renderWeeklyCalendar();
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
    // Categorización automática: al terminar de escribir/editar el título (blur o
    // Enter) se asigna la actividad cuya palabra clave coincida.
    timerTitleInput.addEventListener('blur', autoCategorizeTimerFromTitle);
    timerTitleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') autoCategorizeTimerFromTitle();
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
        refreshTimerStartLine();
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

  const timerTrashBtn = document.getElementById('timer-trash-btn');
  if (timerTrashBtn) {
    timerTrashBtn.addEventListener('click', stopTimer);
  }

  const timerNewMarkBtn = document.getElementById('timer-new-mark-btn');
  if (timerNewMarkBtn) {
    timerNewMarkBtn.addEventListener('click', newMarkTimer);
  }

  // Botón ✕ para borrar el título en el cronómetro (igual que el editor).
  const timerTitleClearBtn = document.getElementById('timer-title-clear');
  if (timerTitleClearBtn) {
    timerTitleClearBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const titleEl = document.getElementById('timer-input-title');
      if (!titleEl) return;
      titleEl.value = '';
      titleEl.dispatchEvent(new Event('input', { bubbles: true }));
      titleEl.focus();
    });
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

  // ─── Alternar vista (Planner / Horario) desde el Navegador ─────────────────
  const navViewToggleBtn = document.getElementById('nav-view-toggle-btn');
  if (navViewToggleBtn) {
    navViewToggleBtn.addEventListener('click', toggleCronograma);
    updateViewToggleMenuLabel(); // tooltip inicial según la vista actual
  }

  // ─── Etiquetas (gestor de actividades) ─────────────────────────────────────
  const tagsBtn = document.getElementById('tags-btn');
  if (tagsBtn) {
    tagsBtn.addEventListener('click', openTagsModal);
  }

  // ─── Buscador ──────────────────────────────────────────────────────────────
  const buscadorBtn = document.getElementById('buscador-btn');
  if (buscadorBtn) {
    buscadorBtn.addEventListener('click', openBuscadorModal);
  }

  const buscadorCancelBtn = document.getElementById('buscador-cancel-btn');
  if (buscadorCancelBtn) {
    buscadorCancelBtn.addEventListener('click', () => {
      document.getElementById('buscador-modal').classList.add('hidden');
    });
  }

  // Mostrar/ocultar rango personalizado según el periodo
  const buscadorPeriodSelect = document.getElementById('buscador-period');
  if (buscadorPeriodSelect) {
    buscadorPeriodSelect.addEventListener('change', () => {
      const customRange = document.getElementById('buscador-custom-range');
      customRange.classList.toggle('hidden', buscadorPeriodSelect.value !== 'custom');
    });
  }

  const buscadorAcceptBtn = document.getElementById('buscador-accept-btn');
  if (buscadorAcceptBtn) {
    buscadorAcceptBtn.addEventListener('click', runBuscadorCalculation);
  }

  // Trigger Nueva Etiqueta Button: abre la ventana aparte para crear actividad.
  document.getElementById('add-tag-trigger-btn').addEventListener('click', () => {
    resetTagForm();
    openTagEditModal();
  });

  // Tag Form Cancel Edit: vuelve al gestor de actividades.
  document.getElementById('tag-cancel-btn').addEventListener('click', () => closeTagEditModal());

  // X de la ventana de crear/editar actividad: también vuelve al gestor.
  const tagEditClose = document.querySelector('#tag-edit-modal .close-modal-btn');
  if (tagEditClose) {
    tagEditClose.addEventListener('click', () => openTagsModal());
  }

  // Botón de ORDENAR del gestor de actividades: alterna entre el orden
  // personalizado del usuario y el orden alfabético (solo cambia la vista).
  const tagsSortBtn = document.getElementById('tags-sort-btn');
  if (tagsSortBtn) {
    const refreshTagsSortBtn = () => {
      tagsSortBtn.classList.toggle('active', tagsSortAlphabetical);
      tagsSortBtn.title = tagsSortAlphabetical
        ? 'Orden alfabético (clic para volver a tu orden)'
        : 'Tu orden personalizado (clic para ordenar A–Z)';
    };
    refreshTagsSortBtn();
    tagsSortBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      tagsSortAlphabetical = !tagsSortAlphabetical;
      refreshTagsSortBtn();
      renderTagsList();
      // Reflejar el nuevo orden también en los selectores desplegables
      // (creador/editor de tarea y cronómetro).
      buildTagSelectorOptions();
    });
  }

  // Input de palabras clave (categorización automática): Enter añade un chip.
  const keywordInput = document.getElementById('tag-keyword-input');
  if (keywordInput) {
    keywordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addKeywordFromInput();
      } else if (e.key === 'Backspace' && keywordInput.value === '' && editingTagKeywords.length) {
        // Backspace con el input vacío elimina el último chip.
        editingTagKeywords.pop();
        renderKeywordChips();
        clearKeywordError();
      }
    });
    keywordInput.addEventListener('input', clearKeywordError);
  }

  // Sliders del selector de color personalizado (HSL): actualizar en vivo
  ['hsl-h', 'hsl-s', 'hsl-l'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateHslPreview);
  });

  // Sliders del selector de color del modal de confirmación de nueva etiqueta
  ['new-tag-hsl-h', 'new-tag-hsl-s', 'new-tag-hsl-l'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', updateNewTagPromptHslPreview);
  });

  // Botones del modal de confirmación de nueva etiqueta
  const newTagCancelBtn = document.getElementById('new-tag-cancel-btn');
  if (newTagCancelBtn) {
    newTagCancelBtn.addEventListener('click', () => {
      closeNewTagPromptModal(null);
    });
  }

  const newTagCloseBtn = document.getElementById('new-tag-close-btn');
  if (newTagCloseBtn) {
    newTagCloseBtn.addEventListener('click', () => {
      closeNewTagPromptModal(null);
    });
  }

  const newTagSubmitBtn = document.getElementById('new-tag-submit-btn');
  if (newTagSubmitBtn) {
    newTagSubmitBtn.addEventListener('click', () => {
      const color = newTagPromptCustomColor ? newTagPromptCustomColor : DEFAULT_COLORS[newTagPromptColorIndex];
      const newTag = {
        id: 'tag-' + Date.now(),
        name: newTagPromptName,
        color,
        colorIndex: newTagPromptColorIndex
      };
      tags.push(newTag);
      saveTagsToStorage();
      buildTagSelectorOptions();
      buildTimerTagSelectorOptions();
      renderWeeklyCalendar();
      closeNewTagPromptModal(newTag);
    });
  }

  // Los event listeners de estadísticas (diarias y generales) se registran
  // dinámicamente en initStatsEvents(prefix) para soportar múltiples paneles.

  // Submit Tag Form
  document.getElementById('tag-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('tag-input-name').value.trim();
    const editId = document.getElementById('tag-edit-id').value;
    // Si hay un color personalizado activo (boton '+'), usarlo; si no, el de la paleta.
    const color = customColor ? customColor : DEFAULT_COLORS[selectedColorIndex];

    // Si quedó texto sin confirmar en el input de palabra clave, añadirlo.
    addKeywordFromInput();

    // Validación: una misma palabra clave no puede usarse en dos actividades.
    const conflict = findKeywordConflict(editId);
    if (conflict) {
      showKeywordError(`La palabra clave "${conflict.keyword}" ya se usa en la actividad "${conflict.tagName}". Cámbiala para poder guardar.`);
      return; // No se guarda.
    }

    const keywords = [...editingTagKeywords];

    if (editId) {
      // Update Tag
      tags = tags.map(tag => {
        if (tag.id === editId) {
          // La actividad "Por defecto" conserva siempre su nombre original.
          const finalName = tag.id === 'default' ? tag.name : name;
          return { ...tag, name: finalName, color, colorIndex: selectedColorIndex, keywords };
        }
        return tag;
      });
    } else {
      // Create Tag
      const newTag = {
        id: 'tag-' + Date.now(),
        name,
        color,
        colorIndex: selectedColorIndex,
        keywords
      };
      tags.push(newTag);
    }

    saveTagsToStorage();
    buildTagSelectorOptions();
    renderWeeklyCalendar();
    // Cerrar la ventana de edición y volver al gestor de actividades.
    closeTagEditModal();
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

  // Selector de etiqueta como campo de búsqueda (editor de tareas y cronómetro).
  // El usuario escribe → se filtran las opciones; Enter selecciona la primera
  // visible; clic en una opción la selecciona; clic fuera restaura el nombre.
  function setupTagSearchSelect(triggerId, inputId, containerId, hiddenId, onSelect) {
    const trigger = document.getElementById(triggerId);
    const input = document.getElementById(inputId);
    const container = document.getElementById(containerId);
    if (!trigger || !input || !container) return;

    const openDropdown = () => {
      filterTagOptions(container, input.value);
      container.classList.remove('hidden');
    };

    // Restaura el nombre de la etiqueta actualmente seleccionada en el input.
    const restoreSelected = () => {
      const hidden = document.getElementById(hiddenId);
      const id = hidden ? hidden.value : 'default';
      const tag = tags.find(t => t.id === id) || tags.find(t => t.id === 'default');
      if (tag) input.value = tag.name;
    };

    // Al enfocar/hacer clic: abrir y borrar el campo para que el usuario pueda escribir directamente.
    input.addEventListener('focus', () => {
      input.value = '';
      openDropdown();
    });

    input.addEventListener('input', () => {
      filterTagOptions(container, input.value);
      container.classList.remove('hidden');
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = input.value.trim();
        if (!value) return;
        const first = filterTagOptions(container, value);
        if (first) {
          first.click();
          input.blur();
        } else {
          // No hay coincidencia con ninguna etiqueta existente.
          // Abrir el diálogo de creación rápida de etiqueta.
          promptCreateNewTag(value, (createdTag) => {
            if (createdTag) {
              const hidden = document.getElementById(hiddenId);
              if (hidden) {
                hidden.value = createdTag.id;
              }
              if (onSelect) onSelect(createdTag.id);
              else {
                if (triggerId === 'tag-select-trigger') {
                  setSelectTagValue(createdTag.id);
                } else if (triggerId === 'timer-tag-select-trigger') {
                  setTimerSelectTagValue(createdTag.id);
                  if (timerStartTime) saveActiveTimerState();
                }
              }
            }
          });
          input.blur();
        }
      } else if (e.key === 'Escape') {
        restoreSelected();
        container.classList.add('hidden');
        input.blur();
      }
    });

    // Al perder el foco: si no se eligió nada, restaurar el nombre seleccionado.
    input.addEventListener('blur', () => {
      setTimeout(() => {
        showAllTagOptions(container);
        restoreSelected();
      }, 150);
    });

    // Clic en la flecha o el círculo abre/cierra el desplegable.
    trigger.addEventListener('click', (e) => {
      if (e.target === input) return; // el input gestiona su propio foco
      e.stopPropagation();
      if (container.classList.contains('hidden')) {
        input.focus();
      } else {
        container.classList.add('hidden');
      }
    });

    // Cerrar al hacer clic fuera.
    document.addEventListener('click', (e) => {
      if (!trigger.contains(e.target) && !container.contains(e.target)) {
        container.classList.add('hidden');
        showAllTagOptions(container);
      }
    });
  }

  setupTagSearchSelect('tag-select-trigger', 'tag-select-input', 'tag-options-container', 'task-select-tag');
  setupTagSearchSelect('timer-tag-select-trigger', 'timer-tag-select-input', 'timer-tag-options-container', 'timer-select-tag');
  // Exponer para reutilizarlo en el modal de estadísticas (modo Hábitos), cuyo
  // HTML se genera dinámicamente después del init.
  window.setupTagSearchSelect = setupTagSearchSelect;

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
      const col = clearBtn.closest('.day-column, .day-header[data-date]');
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
      const col = dialogueBtn.closest('.day-column, .day-header[data-date]');
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
      const col = copyBtn.closest('.day-column, .day-header[data-date]');
      if (col) {
        const dateStr = col.dataset.date;
        if (dateStr) {
          openCopyTextModal(dateStr);
        }
      }
    }
  });

  // Delegación de eventos para abrir estadísticas del día
  document.addEventListener('click', (e) => {
    const statsBtn = e.target.closest('.stats-day-btn');
    if (statsBtn) {
      e.stopPropagation();
      const col = statsBtn.closest('.day-column, .day-header[data-date]');
      if (col) {
        const dateStr = col.dataset.date;
        if (dateStr) {
          activeStatsPrefix = 'daily-stats';
          estadisticasDiarias(dateStr, true);
        }
      }
    }
  });

  // Gestos de deslizamiento (swipe) en tiempo real para cambiar de día en el modal de estadísticas
  // Gestos de deslizamiento (swipe) en tiempo real para cambiar de día en el modal de estadísticas
  ['daily-stats-modal', 'general-stats-modal'].forEach(modalId => {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const prefix = modalId.replace('-modal', '');

    let touchStartX = 0;
    let touchStartY = 0;
    let isDragging = false;
    let sliderWidth = 0;
    const startTranslate = -33.3333; // Posición central en %
    
    const slider = document.getElementById(prefix + '-slider');
    const viewport = modal.querySelector('.daily-stats-viewport');
    
    modal.addEventListener('touchstart', (e) => {
      if (!currentDailyStatsDate) return;
      // Si el toque empieza sobre el mapa de calor (con scroll horizontal propio),
      // no iniciar el swipe de cambio de periodo: dejamos que el dedo haga scroll.
      if (e.target && e.target.closest && e.target.closest('.heatmap-scroll')) {
        isDragging = false;
        return;
      }
      if (prefix === 'general-stats') {
        const periodSelect = document.getElementById('general-stats-period-select');
        if (periodSelect && periodSelect.value !== 'hoy' && !generalStatsDateRange) return;
      }
      const editContent = document.getElementById(prefix + '-edit-content');
      if (editContent && !editContent.classList.contains('hidden')) return;
      const settingsContent = document.getElementById(prefix + '-settings-content');
      if (settingsContent && !settingsContent.classList.contains('hidden')) return;
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      isDragging = true;
      if (viewport) {
        sliderWidth = viewport.clientWidth;
      }
      if (slider) {
        slider.style.transition = 'none';
      }
    }, { passive: true });
    
    modal.addEventListener('touchmove', (e) => {
      if (!isDragging || !slider || sliderWidth <= 0) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      
      // Si el gesto es mayormente vertical, no arrastramos horizontalmente
      if (Math.abs(dy) > Math.abs(dx)) {
        return;
      }
      
      if (e.cancelable) {
        e.preventDefault();
      }
      
      // Convertir el desplazamiento de pixeles a porcentaje (el slider mide 300% del viewport)
      const offsetPercent = (dx / sliderWidth) * 33.3333;
      let targetTranslate = startTranslate + offsetPercent;
      
      // Mantener dentro de los límites [día siguiente, día anterior] -> [-66.6666%, 0%]
      targetTranslate = Math.max(-66.6666, Math.min(0, targetTranslate));
      slider.style.transform = `translateX(${targetTranslate}%)`;
    }, { passive: false });
    
    modal.addEventListener('touchend', (e) => {
      if (!isDragging || !slider || sliderWidth <= 0) return;
      isDragging = false;
      
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      
      slider.style.transition = 'transform 0.25s ease';
      const threshold = 60; // umbral en pixeles para activar el cambio
      
      if (Math.abs(dx) > threshold && Math.abs(dy) < Math.abs(dx)) {
        const isGeneralRange = (prefix === 'general-stats' && generalStatsDateRange);
        if (dx > 0) {
          // Deslizar a la derecha -> Revelar período/día anterior
          slider.style.transform = 'translateX(0%)';
          setTimeout(() => {
            if (isGeneralRange) {
              shiftGeneralStatsRange(-1);
            } else {
              const currentDate = new Date(currentDailyStatsDate + 'T12:00:00');
              currentDate.setDate(currentDate.getDate() - 1);
              estadisticasDiarias(formatDate(currentDate));
            }
          }, 250);
        } else {
          // Deslizar a la izquierda -> Revelar período/día siguiente
          slider.style.transform = 'translateX(-66.6666%)';
          setTimeout(() => {
            if (isGeneralRange) {
              shiftGeneralStatsRange(1);
            } else {
              const currentDate = new Date(currentDailyStatsDate + 'T12:00:00');
              currentDate.setDate(currentDate.getDate() + 1);
              estadisticasDiarias(formatDate(currentDate));
            }
          }, 250);
        }
      } else {
        // Regresar al período/día actual
        slider.style.transform = 'translateX(-33.3333%)';
      }
    }, { passive: true });
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

// ─── Buscador ────────────────────────────────────────────────────────────────
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
function getBuscadorDateRange(period) {
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
    const fromInput = document.getElementById('buscador-date-from').value || null;
    const toInput = document.getElementById('buscador-date-to').value || null;
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

function computeBuscadorStats(keyword, period) {
  const kw = normalizeForSearch(keyword);
  const { from, to } = getBuscadorDateRange(period);
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

function runBuscadorCalculation() {
  const keyword = document.getElementById('buscador-keyword').value.trim();
  const period = document.getElementById('buscador-period').value;
  const stats = computeBuscadorStats(keyword, period);
  document.getElementById('buscador-repetitions').textContent = stats.repetitions;
  if (stats.totalDays) {
    const pct = Math.round((stats.days / stats.totalDays) * 100);
    document.getElementById('buscador-days').textContent =
      `${stats.days}/${stats.totalDays} días (${pct}%)`;
  } else {
    document.getElementById('buscador-days').textContent = stats.days;
  }
  document.getElementById('buscador-total-time').textContent =
    stats.hasAnyDuration ? minutesToReadable(stats.totalMinutes) : '—';
  document.getElementById('buscador-results').classList.remove('hidden');
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
    btnOverwrite.className = 'btn btn-secondary';
    btnOverwrite.textContent = 'Sobrescribir';
    btnOverwrite.addEventListener('click', () => finish('overwrite'));

    actions.append(btnCancel, btnOverwrite, btnKeep);
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
async function toggleTaskCompletion(task, occurrenceDate, preResolvedEndTimeChoice = null, inPlaceCardCtx = null) {
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
  if (autoSetEndTimeOnComplete && nowCompleted) {
    const nowStr = currentTimeHHMM();
    if (task.endTime) {
      // Ya hay hora de fin: usar la decisión que el llamador ya obtuvo del
      // diálogo, o abrirlo aquí si no vino precomputada. Si el aviso está
      // desactivado, se conserva la hora de fin original sin preguntar.
      const choice = preResolvedEndTimeChoice
        || (ASK_END_TIME_CONFLICT ? await askEndTimeConflict(task.endTime, nowStr) : 'keep');
      if (choice === 'cancel') {
        // Revertir la marca de completado y no tocar nada más.
        if (task.recurrence && task.recurrence.enabled) {
          const i = task.completedOccurrences.indexOf(occurrenceDate);
          if (i !== -1) task.completedOccurrences.splice(i, 1);
        } else {
          task.completed = false;
        }
        // En móvil con contexto in-place, revertir solo el estado visual de la
        // tarjeta sin reconstruir el día (evita el parpadeo blanco).
        if (inPlaceCardCtx && inPlaceCardCtx.card && isMobile()) {
          const c = inPlaceCardCtx.card;
          c.classList.remove('completed');
          const cb = c.querySelector('.task-check-btn');
          if (cb) {
            cb.title = 'Marcar como completada';
            cb.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="task-check-icon">
          <rect x="2" y="2" width="20" height="20" rx="4" ry="4"/>
        </svg>`;
          }
          c.style.pointerEvents = '';
          return;
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

  // En móvil, si el llamador pasó el contexto de la tarjeta, movemos esa única
  // tarjeta entre pendientes/completadas in-place y dejamos el resto del feed
  // intacto. Así evitamos el vaciado+reconstrucción del día que provoca el
  // parpadeo blanco. Sincronizamos la firma del día para que un updateMobileFeedTasks
  // posterior (p. ej. al volver de la nube) no lo reconstruya innecesariamente.
  if (inPlaceCardCtx && inPlaceCardCtx.card && inPlaceCardCtx.container && isMobile()) {
    moveTaskCardInPlace(inPlaceCardCtx.container, inPlaceCardCtx.card, dateStr, nowCompleted);
    const dayCol = inPlaceCardCtx.container.closest('.mobile-feed-day');
    if (dayCol) refreshMobileDaySignature(dayCol, dateStr);
    // Refrescar indicadores del día (duración, botones) sin tocar las tarjetas.
    updateMobileDayMeta(dayCol, dateStr);
    renderBriefcaseTasks();
    return;
  }

  renderWeeklyCalendar();
}

// Recalcula la firma de tareas de un día del feed móvil a partir del estado
// actual de datos, para mantener sincronizado el caché que evita reconstrucciones.
function refreshMobileDaySignature(dayCol, dateStr) {
  if (!dayCol) return;
  const date = new Date(dateStr + 'T00:00:00');
  const dayTasks = tasks.filter(task => {
    if (!checkTaskOccurrence(task, date)) return false;
    const tag = tags.find(t => t.id === task.tagId) || tags.find(t => t.id === 'default');
    return tag ? tag.visible !== false : true;
  });
  sortDayTasks(dayTasks, dateStr);
  dayCol.dataset.tasksSignature = dayTasks.map(t => {
    const done = (t.recurrence && t.recurrence.enabled)
      ? !!(t.completedOccurrences && t.completedOccurrences.includes(dateStr))
      : !!t.completed;
    return [t.id, done ? '1' : '0', t.title || '', t.startTime || '',
            t.endTime || '', t.tagId || '', t.alarm ? 'a' : ''].join('~');
  }).join('|');
}

// Actualiza solo los indicadores de cabecera de un día móvil (notas, duración,
// botones copiar/limpiar) sin tocar el DOM de las tarjetas.
function updateMobileDayMeta(dayCol, dateStr) {
  if (!dayCol) return;
  const durationBtn2 = dayCol.querySelector('.duration-day-btn');
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
  updateDayHeaderButtonsVisibility(dayCol, dateStr);
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
    <button class="stats-day-btn" title="Actividad">
      <img src="icons/pie-chart.svg" alt="Actividad" width="14" height="14">
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
  sortDayTasks(dayTasks, dateStr);
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
      const dayTasks = tasks.filter(task => {
        const isOccurring = checkTaskOccurrence(task, date);
        if (!isOccurring) return false;
        const tag = tags.find(t => t.id === task.tagId) || tags.find(t => t.id === 'default');
        return tag ? tag.visible !== false : true;
      });
      sortDayTasks(dayTasks, dateStr);

      // Evitar reconstruir un día cuyo contenido no cambió: vaciar y recrear el
      // DOM de TODOS los días en cada toggle es lo que provoca el parpadeo
      // blanco en móvil. Comparamos una firma (id + completado + orden); solo se
      // reconstruye el día cuya firma cambió (p.ej. el de la tarea marcada).
      const signature = dayTasks.map(t => {
        const done = (t.recurrence && t.recurrence.enabled)
          ? !!(t.completedOccurrences && t.completedOccurrences.includes(dateStr))
          : !!t.completed;
        // Incluir los campos que afectan el render visible para que cualquier
        // edición real del día lo reconstruya, pero un toggle en OTRO día no.
        return [t.id, done ? '1' : '0', t.title || '', t.startTime || '',
                t.endTime || '', t.tagId || '', t.alarm ? 'a' : ''].join('~');
      }).join('|');

      // Reconstruir si la firma cambió, o si el contenedor está vacío pero
      // debería tener tareas (p.ej. tras un render inicial o limpieza externa).
      const needsRebuild = col.dataset.tasksSignature !== signature ||
        (dayTasks.length > 0 && tasksContainer.children.length === 0);
      if (needsRebuild) {
        col.dataset.tasksSignature = signature;
        tasksContainer.innerHTML = '';
        renderTasksToContainer(dayTasks, tasksContainer, dateStr);
      }
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

      briefcaseTasks.splice(insertIndex, 0, task);

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

// ─────────────────────────────────────────────────────────────────────────
// AUTOCOMPLETADO DE ETIQUETAS EN EL CAMPO TÍTULO
// ─────────────────────────────────────────────────────────────────────────
// Al escribir el título (en el editor de tareas y en el cronómetro), se muestra
// como texto fantasma el nombre de la etiqueta (actividad) que mejor coincide
// por PREFIJO (de izquierda a derecha, ignorando mayúsculas y acentos).
//   · Enter → completa el título con la etiqueta y termina la edición (blur).
//   · Tab   → completa el título y mantiene el foco para seguir editando.
// La sugerencia se elige por uso en las ÚLTIMAS 2 SEMANAS; ante empate o sin
// datos, por orden alfabético.

// Normaliza para comparar: minúsculas y sin diacríticos.
function normalizeForAutocomplete(str) {
  return String(str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Conteo de uso de cada tagId en las últimas 2 semanas (por fecha de la tarea).
function getRecentTagUsage() {
  const usage = {};
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 13); // ventana de 14 días incluyendo hoy
  const startStr = formatDate(start);
  const endStr = formatDate(today);
  for (const t of tasks) {
    if (!t || !t.tagId || !t.date) continue;
    if (t.date >= startStr && t.date <= endStr) {
      usage[t.tagId] = (usage[t.tagId] || 0) + 1;
    }
  }
  return usage;
}

// Devuelve el NOMBRE de la mejor etiqueta cuyo nombre empieza por `typed`, o
// null si no hay ninguna o si `typed` está vacío / ya coincide exactamente.
function getBestTagSuggestion(typed) {
  const q = normalizeForAutocomplete(typed);
  if (!q) return null;
  const candidates = (tags || []).filter(tag => {
    if (!tag || !tag.name) return false;
    const n = normalizeForAutocomplete(tag.name);
    return n.startsWith(q) && n.length > q.length; // descarta coincidencia exacta total
  });
  if (candidates.length === 0) return null;
  const usage = getRecentTagUsage();
  candidates.sort((a, b) => {
    const ua = usage[a.id] || 0, ub = usage[b.id] || 0;
    if (ub !== ua) return ub - ua;               // más usada primero
    return a.name.localeCompare(b.name, 'es');   // empate → alfabético
  });
  return candidates[0].name;
}

// Refresca el texto fantasma de un input según lo escrito.
function updateTitleGhost(input, ghost) {
  if (!input || !ghost) return;
  const typed = input.value;
  // Sin sugerencia si el campo está vacío o el cursor no está al final.
  const atEnd = input.selectionStart === typed.length && input.selectionEnd === typed.length;
  const suggestionName = (typed && atEnd) ? getBestTagSuggestion(typed) : null;
  if (!suggestionName) {
    ghost.textContent = '';
    input._acSuggestion = null;
    return;
  }
  // El sufijo conserva las mayúsculas/acentos REALES de la etiqueta.
  const suffix = suggestionName.slice(typed.length);
  ghost.innerHTML = '';
  const typedSpan = document.createElement('span');
  typedSpan.textContent = typed;             // invisible (color transparent)
  const suffixSpan = document.createElement('span');
  suffixSpan.className = 'ac-suffix';
  suffixSpan.textContent = suffix;           // gris
  ghost.appendChild(typedSpan);
  ghost.appendChild(suffixSpan);
  input._acSuggestion = suggestionName;
}

// Aplica la sugerencia al input (completa el título). Devuelve true si aplicó.
function acceptTitleSuggestion(input, ghost) {
  const name = input && input._acSuggestion;
  if (!name) return false;
  input.value = name;
  input._acSuggestion = null;
  if (ghost) ghost.textContent = '';
  // Disparar input para que otros listeners (duración, etc.) reaccionen.
  input.dispatchEvent(new Event('input', { bubbles: true }));
  // Cursor al final.
  try { input.setSelectionRange(name.length, name.length); } catch (e) {}
  return true;
}

function wireTitleAutocomplete(inputId, ghostId) {
  const input = document.getElementById(inputId);
  const ghost = document.getElementById(ghostId);
  if (!input || !ghost) return;

  const refresh = () => updateTitleGhost(input, ghost);

  input.addEventListener('input', refresh);
  input.addEventListener('click', refresh);
  input.addEventListener('keyup', (e) => {
    // Tras mover el cursor con flechas/inicio/fin, recalcular (puede dejar de estar al final).
    if (['ArrowLeft','ArrowRight','Home','End'].includes(e.key)) refresh();
  });
  input.addEventListener('blur', () => { ghost.textContent = ''; });
  input.addEventListener('focus', refresh);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      if (input._acSuggestion) {
        e.preventDefault();              // no saltar de campo: completar y seguir aquí
        acceptTitleSuggestion(input, ghost);
        refresh();                       // por si la etiqueta completada es prefijo de otra
      }
    } else if (e.key === 'Enter') {
      if (input._acSuggestion) {
        e.preventDefault();              // completar y terminar edición
        acceptTitleSuggestion(input, ghost);
        input.blur();
      }
    }
  });
}

function initTitleAutocomplete() {
  wireTitleAutocomplete('task-input-title', 'task-title-ghost');
  wireTitleAutocomplete('timer-input-title', 'timer-title-ghost');
}

// EOF

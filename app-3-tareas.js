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

  track.addEventListener('scroll', (e) => {
    // Este listener burbujea tanto el scroll HORIZONTAL del track como el
    // VERTICAL de los cuerpos de tarjeta. Solo nos interesa el horizontal (cambio
    // de día); el vertical lo gestiona setupCrMobileVScrollSync.
    if (e.target !== track) return;
    if (crTrackScrollTimer) clearTimeout(crTrackScrollTimer);
    // Mantener todas las tarjetas a la misma altura (hora) al deslizar de día.
    applyCrMobileVScroll();
    // Mover la etiqueta de la barra superior en vivo mientras se desliza.
    const centered = getCenteredCronogramaCol(track);
    if (centered && centered.dataset.date) {
      const d = new Date(centered.dataset.date + 'T00:00:00');
      cronogramaMobileDate = d;
      updateCronogramaMobileLabel(d);
      // La línea de "ahora" solo se ve cuando el día centrado es hoy.
      syncNowLineVisibilityMobile();
    }
    // Al detenerse el scroll, expandir bordes si hace falta.
    crTrackScrollTimer = setTimeout(() => {
      currentWeekStart = getMondayOf(cronogramaMobileDate || new Date());
      expandCronogramaTrackIfNeeded(track);
      // Reaplicar la posición vertical a las tarjetas recién añadidas.
      applyCrMobileVScroll();
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
  const now = new Date();
  const minutesIntoDay = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  // MÓVIL: el scroll vertical vive dentro del cuerpo de cada tarjeta-día. Fijamos
  // la posición compartida y la aplicamos a todas las tarjetas (sincronizadas).
  if (isMobile()) {
    const body = document.querySelector('.cr-mobile-day-body');
    if (body) {
      const maxScroll = body.scrollHeight - body.clientHeight;
      crMobileVScroll = Math.min(Math.max(0, minutesIntoDay), maxScroll);
      applyCrMobileVScroll();
    }
    return;
  }

  // ESCRITORIO: scroll vertical en el contenedor común.
  const scroll = document.querySelector('.cronograma-scroll');
  const nowLine = document.getElementById('cr-now-line');
  if (!scroll || !nowLine) return;
  const maxScroll = scroll.scrollHeight - scroll.clientHeight;
  scroll.scrollTop = Math.min(Math.max(0, minutesIntoDay), maxScroll);
}

// Posición vertical compartida del horario móvil (en px desde 00:00). Mantiene
// todas las tarjetas-día mostrando la misma hora al deslizar entre días.
let crMobileVScroll = 0;
let crMobileVScrollSyncing = false;

// Aplica la posición vertical compartida a todos los cuerpos de tarjeta.
function applyCrMobileVScroll() {
  const bodies = document.querySelectorAll('.cr-mobile-day-body');
  crMobileVScrollSyncing = true;
  bodies.forEach(b => { if (b.scrollTop !== crMobileVScroll) b.scrollTop = crMobileVScroll; });
  // Liberar el guard tras el frame para no perder scrolls reales del usuario.
  requestAnimationFrame(() => { crMobileVScrollSyncing = false; });
}

// Engancha la sincronización del scroll vertical entre tarjetas: cuando el
// usuario scrollea una, las demás siguen y se recuerda la posición.
function setupCrMobileVScrollSync() {
  const track = document.getElementById('cr-mobile-track');
  if (!track) return;
  track.addEventListener('scroll', (e) => {
    const body = e.target.closest ? e.target.closest('.cr-mobile-day-body') : null;
    if (!body || crMobileVScrollSyncing) return;
    crMobileVScroll = body.scrollTop;
    const bodies = track.querySelectorAll('.cr-mobile-day-body');
    crMobileVScrollSyncing = true;
    bodies.forEach(b => { if (b !== body && b.scrollTop !== crMobileVScroll) b.scrollTop = crMobileVScroll; });
    requestAnimationFrame(() => { crMobileVScrollSyncing = false; });
  }, { capture: true, passive: true });
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
const CR_SNAP_MIN = 15;      // granularidad del arrastre vertical

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

  // Desfase del puntero dentro del bloque y ancho actual: se usan para que, al
  // "flotar" el bloque (position:fixed) y poder llevarlo sobre el header hasta la
  // papelera, siga al cursor sin saltos y conserve su tamaño.
  const blockRect = block.getBoundingClientRect();
  const grabOffsetX = e.clientX - blockRect.left;
  const grabOffsetY = e.clientY - blockRect.top;

  crDrag = {
    block,
    task,
    durationMin,
    grid,
    cols,
    // Y del puntero al agarrar y top original del bloque (en minutos/px). El
    // movimiento se calcula como un DELTA puro desde aquí, evitando saltos.
    grabClientY: e.clientY,
    grabOffsetX,
    grabOffsetY,
    blockWidth: blockRect.width,
    floating: false,             // ¿el bloque está flotando sobre el header?
    startColEl: block.parentElement,
    targetColEl: block.parentElement,
    originalStartMin: range.startMin,
    newStartMin: range.startMin,
    sourceDate: task.date,        // día de origen (para copiar/mover)
    copy: !!(e.ctrlKey || e.metaKey), // Ctrl/Cmd → copiar en vez de mover
    overTrash: false,             // ¿el puntero está sobre la papelera?
    overBriefcase: false,         // ¿el puntero está sobre el archivado (maletín)?
    originColEl: block.parentElement, // columna original (para el fantasma de copia)
    originTopPx: range.startMin,  // posición vertical original (px = min)
    ghost: null,                  // clon estático que se ve al copiar (Ctrl)
    moved: false,
    pointerId: e.pointerId
  };

  block.classList.add('cr-dragging');
  block.style.pointerEvents = 'none'; // que no intercepte el hit-test de columnas
  try { block.setPointerCapture(e.pointerId); } catch (_) {}

  // Si ya se arranca con Ctrl, mostrar el fantasma del original desde el inicio.
  syncCronogramaCopyGhost();

  // Mostrar la papelera (mismo botón #trash-btn que el planner): aparece al poner
  // body.dragging-active y se oculta al soltar/cancelar.
  document.body.classList.add('dragging-active');

  window.addEventListener('pointermove', onCronogramaDragMove);
  window.addEventListener('pointerup', onCronogramaDragEnd);
  window.addEventListener('keydown', onCronogramaDragKey);
  window.addEventListener('keyup', onCronogramaDragKey);
  e.preventDefault();
}

// Muestra u oculta el "fantasma" del original mientras se copia (Ctrl/Cmd).
// Al copiar, el bloque que se arrastra es la COPIA; el original debe seguir
// viéndose fijo en su sitio. Cuando no se copia (mover), no hay fantasma.
function syncCronogramaCopyGhost() {
  if (!crDrag) return;

  // Modo copia activo y aún no hay fantasma → crearlo en la posición original.
  if (crDrag.copy && !crDrag.ghost && crDrag.originColEl) {
    const ghost = crDrag.block.cloneNode(true);
    ghost.classList.remove('cr-dragging', 'cr-floating');
    ghost.classList.add('cr-copy-ghost');
    ghost.style.pointerEvents = 'none';
    // El clon debe quedar en posicionamiento normal (absoluto en su columna),
    // aunque el bloque arrastrado esté flotando (fixed) en ese momento.
    ghost.style.position = '';
    ghost.style.left = '';
    ghost.style.right = '';
    ghost.style.width = '';
    ghost.style.zIndex = '';
    ghost.style.top = crDrag.originTopPx + 'px';
    const h = Math.min(crDrag.originTopPx + crDrag.durationMin, 1440) - crDrag.originTopPx;
    ghost.style.height = Math.max(h, 16) + 'px';
    // Restaurar el rango horario original en el texto del fantasma (el bloque
    // arrastrado puede mostrar el rango nuevo en vivo).
    const tEl = ghost.querySelector('.cr-task-time');
    if (tEl) {
      const r = getTaskTimeRange(crDrag.task);
      if (r) tEl.textContent = `${r.startStr} - ${r.endStr}`;
    }
    crDrag.originColEl.appendChild(ghost);
    crDrag.ghost = ghost;
  }

  // Modo mover y hay fantasma → quitarlo.
  if (!crDrag.copy && crDrag.ghost) {
    crDrag.ghost.remove();
    crDrag.ghost = null;
  }
}

// Quita el fantasma de copia si existe (al soltar/cancelar).
function removeCronogramaCopyGhost() {
  if (crDrag && crDrag.ghost) {
    crDrag.ghost.remove();
    crDrag.ghost = null;
  }
}

// Escape mientras se arrastra: cancelar la operación (sin guardar ni mover).
// Ctrl/Cmd (pulsar o soltar) alterna el modo copia y su fantasma sin necesidad
// de mover el ratón.
function onCronogramaDragKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    cancelCronogramaDrag();
    return;
  }
  if (crDrag && (e.key === 'Control' || e.key === 'Meta')) {
    crDrag.copy = !!(e.ctrlKey || e.metaKey);
    syncCronogramaCopyGhost();
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
  window.removeEventListener('keyup', onCronogramaDragKey);
  stopCronogramaEdgeScroll();
  clearCronogramaHorizontalEdge();

  if (drag.ghost) drag.ghost.remove();
  if (drag.floating && drag.block.parentElement === document.body) {
    drag.block.remove();
  }
  drag.block.classList.remove('cr-dragging', 'cr-floating');
  drag.block.style.pointerEvents = '';
  try { drag.block.releasePointerCapture(drag.pointerId); } catch (_) {}
  clearCronogramaDragOver();

  // Ocultar/limpiar los destinos del header (arrastre cancelado).
  document.body.classList.remove('dragging-active');
  clearCronogramaHeaderTargets();

  // Evitar que un click/pointerup posterior abra el modal de edición.
  suppressNextCronogramaClick = true;
  setTimeout(() => { suppressNextCronogramaClick = false; }, 0);

  renderCronograma(); // restaura posiciones originales desde los datos
}

function onCronogramaDragMove(e) {
  if (!crDrag) return;
  // Actualizar el modo copia en vivo según Ctrl/Cmd (el usuario puede pulsarlo o
  // soltarlo a mitad del arrastre).
  crDrag.copy = !!(e.ctrlKey || e.metaKey);
  syncCronogramaCopyGhost();
  // Recordar siempre la última posición del puntero (la usan el auto-scroll y el
  // re-vinculado tras cambiar de semana/día).
  crEdgeScroll.lastX = e.clientX;
  crEdgeScroll.lastY = e.clientY;
  applyCronogramaDragMove(e.clientX, e.clientY);
  // Auto-scroll de borde también con ratón: si el cursor se acerca al borde
  // superior/inferior del horario, desplazar la vista automáticamente (mismo
  // mecanismo que el arrastre táctil). Pero si el bloque está FLOTANDO sobre el
  // header/papelera (fuera del horario), no scrollear.
  if (crDrag.floating) {
    stopCronogramaEdgeScroll();
  } else {
    crEdgeScroll.lastX = e.clientX;
    crEdgeScroll.lastY = e.clientY;
    updateCronogramaEdgeScroll(e.clientY);
  }
}

// Hace que el bloque arrastrado "flote" (position:fixed sobre el body) para que
// pueda salir del recorte del scroll del horario y llegar hasta la papelera del
// header. Se mueve al body para que ningún ancestro con overflow lo recorte.
function enterCronogramaFloat() {
  if (!crDrag || crDrag.floating) return;
  crDrag.floating = true;
  const b = crDrag.block;
  b.classList.add('cr-floating');
  b.style.position = 'fixed';
  b.style.width = crDrag.blockWidth + 'px';
  b.style.right = 'auto';
  b.style.zIndex = '100002'; // por encima del header y la papelera
  document.body.appendChild(b);
}

// Devuelve el bloque flotante al horario: lo re-inserta en la columna destino y
// restaura el posicionamiento absoluto normal (top en minutos lo fija el flujo
// normal de applyCronogramaDragMove justo después).
function exitCronogramaFloat() {
  if (!crDrag || !crDrag.floating) return;
  crDrag.floating = false;
  const b = crDrag.block;
  b.classList.remove('cr-floating');
  b.style.position = '';
  b.style.left = '';
  b.style.right = '';
  b.style.width = '';
  b.style.zIndex = '';
  // Reinsertar en la columna destino actual (o la de origen) para que el
  // posicionamiento por `top` (relativo a la columna) vuelva a ser válido.
  const col = crDrag.targetColEl || crDrag.startColEl;
  if (col && b.parentElement !== col) col.appendChild(b);
}

// Lógica compartida de movimiento (ratón y táctil): coloca el bloque bajo el
// puntero/dedo, elige columna destino por X y aplica el snap de 30 min por
// DELTA desde el punto donde se agarró. Recibe coordenadas de cliente.
function applyCronogramaDragMove(clientX, clientY) {
  if (!crDrag) return;
  crDrag.moved = true;

  // Durante la animación de cambio de semana/día el bloque va FLOTANDO pegado al
  // puntero; no recolocamos por columna/hora hasta que termine la transición.
  if (crHorizAnimating) {
    enterCronogramaFloat();
    crDrag.block.style.left = (clientX - crDrag.grabOffsetX) + 'px';
    crDrag.block.style.top = (clientY - crDrag.grabOffsetY) + 'px';
    return;
  }

  // 0) ¿El puntero está sobre la papelera? (mismo botón #trash-btn del planner).
  // Si es así, resaltarla y no recolocar el bloque por columna/hora: al soltar
  // ahí se eliminará la tarea.
  const trashBtn = document.getElementById('trash-btn');
  let overTrash = false;
  if (trashBtn) {
    const tr = trashBtn.getBoundingClientRect();
    overTrash = clientX >= tr.left && clientX <= tr.right
      && clientY >= tr.top && clientY <= tr.bottom;
    trashBtn.classList.toggle('drag-over', overTrash);
  }
  crDrag.overTrash = overTrash;

  // 0a) ¿El puntero está sobre el archivado? Cuenta tanto el ICONO (#briefcase-btn)
  // como el PANEL de archivados abierto (#briefcase-drawer). Al soltar en
  // cualquiera de los dos, se archiva la tarea.
  const briefcaseBtn = document.getElementById('briefcase-btn');
  const briefcaseDrawer = document.getElementById('briefcase-drawer');
  const inRect = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  };
  const overBtn = inRect(briefcaseBtn);
  const drawerOpen = briefcaseDrawer && !briefcaseDrawer.classList.contains('closed');
  const overDrawer = drawerOpen && inRect(briefcaseDrawer);
  const overBriefcase = overBtn || overDrawer;
  if (briefcaseBtn) briefcaseBtn.classList.toggle('drag-over', overBtn);
  if (briefcaseDrawer) briefcaseDrawer.classList.toggle('drag-over', overDrawer);
  crDrag.overBriefcase = overBriefcase;

  // 0b) ¿El puntero está por ENCIMA del área de scroll del horario (zona del
  // header) o sobre la papelera/archivado? En ese caso el bloque "flota"
  // (position:fixed) siguiendo al cursor, para que pueda salir del recorte del
  // scroll y llegar visualmente hasta los iconos del header. Si vuelve dentro
  // del horario, se recoloca de forma normal en su columna.
  const scrollEl = document.querySelector('.cronograma-scroll');
  const scrollTop = scrollEl ? scrollEl.getBoundingClientRect().top : 0;
  const shouldFloat = overTrash || overBriefcase || clientY < scrollTop;

  if (shouldFloat) {
    enterCronogramaFloat();
    crDrag.block.style.left = (clientX - crDrag.grabOffsetX) + 'px';
    crDrag.block.style.top = (clientY - crDrag.grabOffsetY) + 'px';
    if (crDrag.targetColEl) crDrag.targetColEl.classList.remove('cr-drag-over');
    return; // flotando: no recolocar por columna/hora
  }
  // Si venía flotando y vuelve al horario, restaurar el posicionamiento normal.
  if (crDrag.floating) exitCronogramaFloat();

  // 0c) Borde lateral → cambiar de semana (escritorio) o deslizar al día vecino
  // cruzando semanas (móvil), para poder soltar en días no visibles.
  updateCronogramaHorizontalEdge(clientX, clientY);

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
  // Si se suelta en mitad de una animación de cambio de semana/día, aterrizar
  // primero el bloque en la columna/hora correctas antes de confirmar.
  if (crHorizAnimating) {
    crHorizAnimating = false;
    crRebindAfterHorizontalChange();
  }
  const drag = crDrag;
  crDrag = null;

  window.removeEventListener('pointermove', onCronogramaDragMove);
  window.removeEventListener('pointerup', onCronogramaDragEnd);
  window.removeEventListener('keydown', onCronogramaDragKey);
  window.removeEventListener('keyup', onCronogramaDragKey);
  stopCronogramaEdgeScroll();
  clearCronogramaHorizontalEdge();

  if (drag.ghost) drag.ghost.remove();
  // Si el bloque quedó flotando (sobre el body), quitarlo: renderCronograma lo
  // redibujará en su sitio desde los datos. Evita un bloque huérfano en el body.
  if (drag.floating && drag.block.parentElement === document.body) {
    drag.block.remove();
  }
  drag.block.classList.remove('cr-dragging', 'cr-floating');
  drag.block.style.pointerEvents = '';
  try { drag.block.releasePointerCapture(drag.pointerId); } catch (_) {}
  clearCronogramaDragOver();

  // Ocultar/limpiar los destinos del header (papelera y archivado).
  document.body.classList.remove('dragging-active');
  clearCronogramaHeaderTargets();

  commitCronogramaDragResult(drag);
}

// Quita el resaltado .cr-drag-over de todas las columnas del horario. Se llama
// al soltar o cancelar el arrastre para no dejar columnas marcadas.
function clearCronogramaDragOver() {
  document.querySelectorAll('.cr-day-col.cr-drag-over')
    .forEach(c => c.classList.remove('cr-drag-over'));
}

// Quita el resaltado de los destinos del header (papelera y archivado) al soltar
// o cancelar un arrastre del horario.
function clearCronogramaHeaderTargets() {
  const t = document.getElementById('trash-btn');
  if (t) t.classList.remove('drag-over');
  const b = document.getElementById('briefcase-btn');
  if (b) b.classList.remove('drag-over');
  const d = document.getElementById('briefcase-drawer');
  if (d) d.classList.remove('drag-over');
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

  const toHHMM = (min) => {
    const m = ((min % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };

  // ── SOLTAR EN LA PAPELERA → ELIMINAR ───────────────────────────────────────
  // Igual que el planner: si se soltó sobre #trash-btn, se elimina la tarea
  // (deleteTask gestiona la confirmación para recurrentes). Re-render del horario.
  if (drag.overTrash) {
    deleteTask(drag.task.id, drag.sourceDate || drag.task.date);
    renderCronograma();
    return;
  }

  // ── SOLTAR EN EL ARCHIVADO (MALETÍN) → ARCHIVAR ────────────────────────────
  // Igual que el planner: si se soltó sobre #briefcase-btn, la tarea pasa al
  // maletín (moveTaskToBriefcase gestiona recurrentes/simples). Re-render.
  if (drag.overBriefcase) {
    moveTaskToBriefcase(drag.task.id, null, drag.sourceDate || drag.task.date);
    renderCronograma();
    return;
  }

  const newStartMin = drag.newStartMin;
  const newEndMin = newStartMin + drag.durationMin; // puede superar 1440 (cruza medianoche)
  const newDateStr = drag.targetColEl ? drag.targetColEl.dataset.date : null;

  // ── CTRL/CMD → COPIAR (crear un clon independiente) ────────────────────────
  if (drag.copy) {
    pushToUndoStack();
    const clon = {
      ...drag.task,
      id: 'task-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      date: newDateStr || drag.task.date,
      startTime: toHHMM(newStartMin),
      endTime: toHHMM(newEndMin)
    };
    // Una copia de una ocurrencia recurrente se vuelve una tarea simple (mismo
    // criterio que la copia con Ctrl del planner).
    if (clon.recurrence && clon.recurrence.enabled) clon.recurrence = null;
    tasks.push(clon);
    renderCronograma();
    saveTasksToStorage();
    return;
  }

  const oldStart = (getTaskTimeRange(drag.task) || {}).startMin;
  const sameTime = oldStart === newStartMin;
  const sameDay = !newDateStr || newDateStr === drag.task.date;
  if (sameTime && sameDay) {
    renderCronograma(); // restaurar posición exacta por si el snap no cambió nada
    return;
  }

  pushToUndoStack();

  // Guardar el horario ORIGINAL (para detección de adyacencia y para revertir si
  // el usuario cancela el aviso) ANTES de mutar la tarea.
  const dragOldRange = getTaskAbsoluteRange(drag.task);
  const dragRevert = {
    startTime: drag.task.startTime,
    endTime: drag.task.endTime,
    date: drag.task.date,
    duration: drag.task.duration
  };

  // Actualizar la hora en los CAMPOS (manteniendo la duración). El fin se envuelve
  // a 24h si la tarea cruza medianoche.
  drag.task.startTime = toHHMM(newStartMin);
  drag.task.endTime = toHHMM(newEndMin);

  // Cambiar el día si se soltó en otra columna.
  if (newDateStr && newDateStr !== drag.task.date) {
    drag.task.date = newDateStr;
  }

  // ── Aviso de tareas adyacentes tras el arrastre ───────────────────────────
  // Si la tarea (con horario inicio+fin) quedó pegada a alguna vecina, NO se
  // guarda todavía: se muestra el panel y el guardado se difiere hasta que el
  // usuario decida (Conservar / Modificar). "Cancelar" revierte el arrastre.
  let adjacentPending = false;
  if (drag.task.startTime && drag.task.endTime && dragOldRange) {
    const affectations = findAdjacentAffectedTasks(drag.task, dragOldRange);
    if (affectations.length > 0) {
      adjacentPending = true;
      pendingAdjacent = {
        mode: 'drag',
        task: drag.task,
        revert: dragRevert,
        affectations
      };
    }
  }

  // Re-render INMEDIATO (síncrono) para que la vista refleje el cambio al
  // instante. Si hay un aviso pendiente NO guardamos aún (el guardado lo hace
  // el botón del panel); si no, guardamos en segundo plano como siempre.
  renderCronograma();
  if (!adjacentPending) {
    saveTasksToStorage();
  } else {
    openAdjacentTasksModal(pendingAdjacent.affectations);
  }
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

  // Desfase del dedo dentro del bloque y ancho, para poder "flotar" el bloque y
  // llevarlo sobre el header (papelera/archivado) sin saltos ni recorte.
  const blockRect = block.getBoundingClientRect();
  const startX = crTouch.startX;

  crDrag = {
    block,
    task,
    durationMin,
    grid,
    cols,
    grabClientY: startY,
    grabOffsetX: startX - blockRect.left,
    grabOffsetY: startY - blockRect.top,
    blockWidth: blockRect.width,
    floating: false,
    startColEl: block.parentElement,
    targetColEl: block.parentElement,
    originalStartMin: range.startMin,
    newStartMin: range.startMin,
    originColEl: block.parentElement,
    originTopPx: range.startMin,
    ghost: null,
    sourceDate: task.date,
    copy: false,        // copiar con Ctrl es solo de escritorio
    overTrash: false,
    overBriefcase: false,
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
  // También dragging-active para que aparezca la papelera (#trash-btn), igual que
  // en escritorio. El archivado (#briefcase-btn) ya está siempre visible.
  document.body.classList.add('dragging-active');

  // Feedback háptico (igual que el arrastre táctil del planner).
  if (navigator.vibrate) navigator.vibrate(50);
}

function onCronogramaTouchMove(e) {
  // Caso A: ya estamos arrastrando → mover el bloque y cortar el scroll.
  if (crDrag) {
    if (e.cancelable) e.preventDefault();
    const t = e.touches[0];
    crEdgeScroll.lastX = t.clientX;
    crEdgeScroll.lastY = t.clientY;
    applyCronogramaDragMove(t.clientX, t.clientY);
    // Auto-scroll de borde, salvo si el bloque flota sobre el header
    // (papelera/archivado): ahí no se scrollea.
    if (crDrag.floating) {
      stopCronogramaEdgeScroll();
    } else {
      crEdgeScroll.lastX = t.clientX;
      crEdgeScroll.lastY = t.clientY;
      updateCronogramaEdgeScroll(t.clientY);
    }
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

// ── Arrastre horizontal a días/semanas no visibles (mismo concepto que el
// planner). Al acercar el puntero/dedo al borde lateral durante el arrastre del
// horario, se cambia de semana (escritorio) o se desliza al día vecino cruzando
// semanas (móvil). Indicador visual + háptico reutilizados del planner.
const CR_HORIZ_EDGE_ZONE = 80;     // px desde el borde lateral que activa el cambio
const CR_HORIZ_DELAY = 300;        // ms en la zona antes de disparar
const CR_HORIZ_COOLDOWN = 600;     // ms entre cambios sucesivos
let crHorizEdgeTimeout = null;
let crHorizEdgeDir = 0;
let crHorizEdgeCooldown = false;
let crHorizAnimating = false;  // ¿hay una animación de cambio de semana/día en curso?

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

// ── Borde lateral durante el arrastre del horario ────────────────────────────
// Detecta si el puntero/dedo está en la franja lateral de la ventana y, tras un
// breve retardo, dispara el cambio de día/semana. Mantiene el mismo indicador
// visual y háptico del planner.
function updateCronogramaHorizontalEdge(clientX, clientY) {
  if (!crDrag) { clearCronogramaHorizontalEdge(); return; }

  const w = window.innerWidth;
  const dir = clientX < CR_HORIZ_EDGE_ZONE ? -1
            : clientX > w - CR_HORIZ_EDGE_ZONE ? 1
            : 0;

  if (dir === 0 || crHorizEdgeCooldown) {
    clearCronogramaHorizontalEdge();
    return;
  }

  // En zona de borde: mostrar indicador y armar el timer si cambió la dirección.
  showEdgeIndicator(dir);
  if (crHorizEdgeDir !== dir) {
    if (crHorizEdgeTimeout) clearTimeout(crHorizEdgeTimeout);
    crHorizEdgeDir = dir;
    crHorizEdgeTimeout = setTimeout(() => {
      triggerCronogramaHorizontalChange(dir);
    }, CR_HORIZ_DELAY);
  }
}

function clearCronogramaHorizontalEdge() {
  if (crHorizEdgeTimeout) {
    clearTimeout(crHorizEdgeTimeout);
    crHorizEdgeTimeout = null;
  }
  crHorizEdgeDir = 0;
  crHorizAnimating = false;
  hideEdgeIndicator();
}

// Dispara el cambio horizontal: en móvil avanza un día (cruzando semanas); en
// escritorio cambia de semana completa. Tras ello, re-vincula el arrastre al
// nuevo DOM para poder continuar sin soltar.
function triggerCronogramaHorizontalChange(dir) {
  if (crHorizEdgeTimeout) { clearTimeout(crHorizEdgeTimeout); crHorizEdgeTimeout = null; }
  crHorizEdgeDir = 0;
  hideEdgeIndicator();
  if (!crDrag || crHorizAnimating) return;

  crHorizEdgeCooldown = true;
  setTimeout(() => { crHorizEdgeCooldown = false; }, CR_HORIZ_COOLDOWN);

  if (navigator.vibrate) navigator.vibrate(30);

  if (isMobile()) {
    crSlideMobileDay(dir);
  } else {
    crChangeWeekDuringDrag(dir);
  }
}

// Mantiene el bloque arrastrado FLOTANDO (position:fixed sobre el body) y pegado
// a la última posición del puntero/dedo, para que NO desaparezca durante el
// deslizamiento/recarga del horario.
function crPinFloatingBlock() {
  if (!crDrag) return;
  enterCronogramaFloat();
  const b = crDrag.block;
  b.style.left = (crEdgeScroll.lastX - crDrag.grabOffsetX) + 'px';
  b.style.top = (crEdgeScroll.lastY - crDrag.grabOffsetY) + 'px';
}

// MÓVIL: el carrusel del horario precarga ±CR_MOBILE_PRELOAD días alrededor del
// centro, así que los días vecinos (incluso de otra semana) ya están en el DOM.
// Avanzamos el día central un paso y deslizamos el carrusel hasta esa columna.
// El bloque arrastrado se mantiene flotando (visible) durante todo el slide.
function crSlideMobileDay(dir) {
  if (!crDrag) return;
  const base = cronogramaMobileDate ? new Date(cronogramaMobileDate) : new Date();
  const targetDate = addDays(base, dir);
  const targetStr = formatDate(targetDate);

  cronogramaMobileDate = new Date(targetDate);
  currentWeekStart = getMondayOf(cronogramaMobileDate);
  if (typeof updateCronogramaMobileLabel === 'function') updateCronogramaMobileLabel(cronogramaMobileDate);

  // Fijar el bloque flotando para que no se mueva ni desaparezca con el scroll.
  crPinFloatingBlock();

  // Si el día destino ya está precargado en el track, basta con deslizar.
  const track = document.getElementById('cr-mobile-track');
  const existing = track ? track.querySelector(`.cr-mobile-day[data-date="${targetStr}"]`) : null;
  if (existing && track) {
    crHorizAnimating = true;
    track.scrollTo({ left: existing.offsetLeft, behavior: 'smooth' });
    syncNowLineVisibilityMobile(formatDate(new Date()));
    // Tras el desplazamiento, salir del flotado recolocando el bloque en la
    // columna que quede bajo el dedo.
    setTimeout(() => {
      crHorizAnimating = false;
      crRebindAfterHorizontalChange();
    }, 360);
    return;
  }

  // Fuera del rango precargado: reconstruir el horario centrado en el nuevo día.
  crRerenderDuringDrag(() => {
    scrollCronogramaTrackToDate(targetStr, false);
  });
}

// ESCRITORIO: deslizamiento lateral IGUAL que el planner. Mantenemos AMBAS
// semanas presentes a la vez (la nueva "oculta" al lado) dentro de un slider, y
// lo desplazamos para revelarla — sin ningún parpadeo en blanco. El bloque
// arrastrado va flotando para no desaparecer.
function crChangeWeekDuringDrag(dir) {
  if (!crDrag) return;
  crPinFloatingBlock(); // mantener el bloque visible durante la animación
  crAnimateWeekSlide(dir, {
    rerender: () => {
      currentWeekStart = addDays(currentWeekStart, dir * 7);
      crRerenderDuringDrag(null);
    },
    fallback: () => {
      currentWeekStart = addDays(currentWeekStart, dir * 7);
      crRerenderDuringDrag(null);
    },
    onSettle: () => crRebindAfterHorizontalChange()
  });
}

// Cambia de semana en el HORARIO (escritorio) con la misma animación de
// deslizamiento, SIN depender de un arrastre. Lo usan las flechas del teclado.
function crSlideWeek(dir) {
  if (crHorizAnimating) return;
  // Actualiza el navegador de tiempo (cabecera) con el nuevo rango de días, igual
  // que el modo lista de tareas. En escritorio el horario muestra la semana
  // completa, así que se usa el rango (lunes–domingo).
  const updateCrWeekLabel = () => {
    if (isMobile()) return; // en móvil el label lo gestiona el flujo táctil
    const label = document.getElementById('week-range-label');
    if (label) label.textContent = formatWeekRange(currentWeekStart);
  };
  crAnimateWeekSlide(dir, {
    rerender: () => {
      currentWeekStart = addDays(currentWeekStart, dir * 7);
      renderCronograma();
      updateCrWeekLabel();
    },
    fallback: () => {
      currentWeekStart = addDays(currentWeekStart, dir * 7);
      renderCronograma();
      updateCrWeekLabel();
    },
    onSettle: null
  });
}

// Núcleo de la animación de deslizamiento de semana del horario (reveal estilo
// planner). `opts.rerender` cambia la semana y reconstruye el grid real;
// `opts.fallback` se usa si no hay contenedores; `opts.onSettle` corre al final.
function crAnimateWeekSlide(dir, opts) {
  opts = opts || {};
  const scrollEl = document.querySelector('.cronograma-scroll');
  const headersHost = document.getElementById('cronograma-headers');
  const oldGrid = document.getElementById('cronograma-grid');

  // Sin contenedores → cambio instantáneo (fallback).
  if (!scrollEl || !oldGrid || !headersHost) {
    if (typeof opts.fallback === 'function') opts.fallback();
    if (typeof opts.onSettle === 'function') opts.onSettle();
    return;
  }

  crHorizAnimating = true;

  // 1) CLON SALIENTE = foto del estado actual (semana actual) antes del render.
  const outGrid = oldGrid.cloneNode(true);
  const outHeader = headersHost.cloneNode(true);
  outGrid.removeAttribute('id');
  outHeader.removeAttribute('id');
  outGrid.querySelectorAll('.cr-dragging, .cr-floating').forEach(el => el.remove());

  // 2) Cambiar de semana y reconstruir el grid/headers REALES (semana nueva).
  if (typeof opts.rerender === 'function') opts.rerender();
  const realGrid = document.getElementById('cronograma-grid');
  const realHeader = document.getElementById('cronograma-headers');
  if (!realGrid || !realHeader) {
    crHorizAnimating = false;
    if (typeof opts.onSettle === 'function') opts.onSettle();
    return;
  }

  // 3) CLON ENTRANTE = foto de la semana nueva ya renderizada.
  const inGrid = realGrid.cloneNode(true);
  const inHeader = realHeader.cloneNode(true);
  inGrid.removeAttribute('id');
  inHeader.removeAttribute('id');
  inGrid.querySelectorAll('.cr-dragging, .cr-floating').forEach(el => el.remove());

  // Ocultar los nodos reales durante la animación (mostramos los clones).
  realGrid.style.visibility = 'hidden';
  realHeader.style.visibility = 'hidden';

  // 4) Slider de 200% con ambas páginas (grid y headers), igual que el planner.
  const wrap = (el) => {
    const page = document.createElement('div');
    page.className = 'cr-week-page';
    page.appendChild(el);
    return page;
  };
  const gridSlider = document.createElement('div');
  gridSlider.className = 'cr-week-slider';
  const headerSlider = document.createElement('div');
  headerSlider.className = 'cr-week-slider cr-week-slider-headers';

  if (dir === 1) {
    gridSlider.appendChild(wrap(outGrid));
    gridSlider.appendChild(wrap(inGrid));
    headerSlider.appendChild(wrap(outHeader));
    headerSlider.appendChild(wrap(inHeader));
  } else {
    gridSlider.appendChild(wrap(inGrid));
    gridSlider.appendChild(wrap(outGrid));
    headerSlider.appendChild(wrap(inHeader));
    headerSlider.appendChild(wrap(outHeader));
  }

  scrollEl.appendChild(gridSlider);
  realHeader.parentElement.insertBefore(headerSlider, realHeader);

  // Posición inicial → final (revela la semana nueva que estaba "oculta").
  const startX = dir === 1 ? 0 : -50;
  const endX = dir === 1 ? -50 : 0;
  gridSlider.style.transform = `translateX(${startX}%)`;
  headerSlider.style.transform = `translateX(${startX}%)`;
  void gridSlider.offsetHeight; // reflow
  requestAnimationFrame(() => {
    gridSlider.style.transition = 'transform 0.45s cubic-bezier(0.25, 1, 0.5, 1)';
    headerSlider.style.transition = 'transform 0.45s cubic-bezier(0.25, 1, 0.5, 1)';
    gridSlider.style.transform = `translateX(${endX}%)`;
    headerSlider.style.transform = `translateX(${endX}%)`;
  });

  // 5) Al terminar: quitar los sliders (clones) y mostrar los nodos reales.
  setTimeout(() => {
    if (gridSlider.parentElement) gridSlider.parentElement.removeChild(gridSlider);
    if (headerSlider.parentElement) headerSlider.parentElement.removeChild(headerSlider);
    realGrid.style.visibility = '';
    realHeader.style.visibility = '';
    crHorizAnimating = false;
    if (typeof opts.onSettle === 'function') opts.onSettle();
  }, 470);
}

// Reconstruye el horario SIN cancelar el arrastre: el bloque ya está flotando, lo
// quitamos del DOM antes de renderizar y fuerza el render (que normalmente se
// bloquea si hay crDrag). NO recoloca el bloque: eso lo hace luego
// crRebindAfterHorizontalChange (cuando termina la animación).
function crRerenderDuringDrag(afterRenderFn) {
  if (!crDrag) return;
  const drag = crDrag;
  const block = drag.block;

  // El bloque está flotando en el body; lo sacamos para que el render no lo
  // toque (lo reinsertaremos al re-vincular).
  if (block && block.parentElement) block.parentElement.removeChild(block);

  // Forzar el render aunque haya un arrastre activo: anulamos crDrag
  // temporalmente para saltar el guard de renderCronograma y lo restauramos.
  const saved = crDrag;
  crDrag = null;
  renderCronograma();
  crDrag = saved;

  if (typeof afterRenderFn === 'function') afterRenderFn();

  // Re-vincular las columnas del nuevo DOM (el bloque sigue flotando aparte).
  const grid = document.getElementById('cronograma-grid');
  if (grid) drag.grid = grid;
  drag.cols = grid ? [...grid.querySelectorAll('.cr-day-col')] : [];

  // Reinsertar el bloque (flotando) en el body para que siga visible mientras
  // dura la animación; crRebindAfterHorizontalChange lo aterriza luego.
  if (block && !block.parentElement) document.body.appendChild(block);
}

// Cuando termina el deslizamiento: aterriza el bloque flotante en la columna que
// quede bajo el puntero/dedo y reaplica el movimiento (mismo agarre/hora).
function crRebindAfterHorizontalChange() {
  if (!crDrag) return;
  const drag = crDrag;
  const grid = document.getElementById('cronograma-grid');
  if (grid) drag.grid = grid;
  drag.cols = grid ? [...grid.querySelectorAll('.cr-day-col')] : [];

  // Columna bajo el puntero por X; si no hay, la primera.
  const cx = crEdgeScroll.lastX;
  let targetCol = null;
  for (const col of drag.cols) {
    const r = col.getBoundingClientRect();
    if (cx >= r.left && cx < r.right) { targetCol = col; break; }
  }
  if (!targetCol) targetCol = drag.cols[0] || null;

  drag.targetColEl = targetCol;
  drag.startColEl = targetCol;
  drag.originColEl = targetCol;

  // Salir del flotado reinsertando el bloque en la columna destino.
  if (drag.floating) exitCronogramaFloat();
  if (targetCol && drag.block && drag.block.parentElement !== targetCol) {
    targetCol.appendChild(drag.block);
  }
  if (targetCol) targetCol.classList.add('cr-drag-over');

  // Reaplicar el movimiento para colocar el bloque bajo el puntero respetando el
  // mismo agarre (grip) y la hora por delta.
  if (crEdgeScroll.lastX || crEdgeScroll.lastY) {
    applyCronogramaDragMove(crEdgeScroll.lastX, crEdgeScroll.lastY);
  }
}

function onCronogramaTouchEnd() {
  const wasDragging = !!crDrag;

  // Si se suelta en mitad de una animación de cambio de día/semana, aterrizar el
  // bloque en la columna/hora correctas antes de confirmar.
  if (wasDragging && crHorizAnimating) {
    crHorizAnimating = false;
    crRebindAfterHorizontalChange();
  }

  const drag = crDrag;

  // Quitar listeners y limpiar el estado de long-press si seguía pendiente.
  cancelCronogramaTouch();

  // Quitar la marca de documento del arrastre (restaura scroll y selección).
  document.body.classList.remove('cr-dragging-active');
  document.body.classList.remove('dragging-active');
  clearCronogramaHeaderTargets();
  stopCronogramaEdgeScroll();
  clearCronogramaHorizontalEdge();
  clearCronogramaDragOver();

  if (wasDragging && drag) {
    crDrag = null;
    // Si el bloque quedó flotando (sobre el body), quitarlo: renderCronograma lo
    // redibujará desde los datos.
    if (drag.floating && drag.block.parentElement === document.body) {
      drag.block.remove();
    }
    drag.block.classList.remove('cr-dragging', 'cr-floating');
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

// Muestra u oculta los botones de la cabecera de un día según su estado:
//   • copiar y basurero (limpiar): visibles solo si el día tiene alguna tarea.
//   • estadísticas: visible solo si el día tiene tareas CON duración establecida.
// Aplica igual en planner y horario, escritorio y móvil.
function updateDayHeaderButtonsVisibility(colElement, dateStr) {
  const hasTasks = dayHasAnyTask(dateStr);
  // ¿Hay al menos un minuto de duración (pendiente o completada) ese día?
  const hasDuration = (getDurationForDay(dateStr, false) + getDurationForDay(dateStr, true)) > 0;

  const copyBtn = colElement.querySelector('.copy-day-btn');
  const clearBtn = colElement.querySelector('.clear-day-btn');
  const statsBtn = colElement.querySelector('.stats-day-btn');
  if (copyBtn) copyBtn.classList.toggle('day-btn-hidden', !hasTasks);
  if (clearBtn) clearBtn.classList.toggle('day-btn-hidden', !hasTasks);
  if (statsBtn) statsBtn.classList.toggle('day-btn-hidden', !hasDuration);
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
    if (!isCurrentlyCompleted && AUTO_SET_END_TIME_ON_COMPLETE && task.endTime && ASK_END_TIME_CONFLICT) {
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

          toggleTaskCompletion(task, occurrenceDate, endTimeChoice, { card, container });

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

          toggleTaskCompletion(task, occurrenceDate, endTimeChoice, { card, container });

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

  // Mantener presionado el checkbox 1.5s inicia el cronómetro para esta tarea
  // (con confirmación). Un toque/clic normal sigue marcando completada.
  attachCheckboxLongPressTimer(checkBtn, task, occurrenceDate);

  card.appendChild(checkBtn);

  return card;
}

// Añade a un checkbox de tarea el gesto de "mantener presionado 1.5s" para
// iniciar el cronómetro de esa tarea (tras confirmación). Funciona con ratón y
// táctil. Si se dispara el long-press, se anula el click de completar que vendría
// después. Reutilizable por las tarjetas del planner y los bloques del horario.
const CHECKBOX_TIMER_LONGPRESS_MS = 1500;
function attachCheckboxLongPressTimer(checkBtn, task, occurrenceDate) {
  let pressTimer = null;
  let longPressed = false;

  const start = () => {
    longPressed = false;
    pressTimer = setTimeout(async () => {
      longPressed = true;
      pressTimer = null;
      if (navigator.vibrate) navigator.vibrate(40);
      const ok = await askStartTimerForTask(task);
      if (ok) startTimerForTask(task);
    }, CHECKBOX_TIMER_LONGPRESS_MS);
  };
  const cancel = () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
  };

  // Ratón (escritorio)
  checkBtn.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return; // el táctil se maneja abajo
    if (e.button !== 0) return;
    start();
  });
  checkBtn.addEventListener('pointerup', cancel);
  checkBtn.addEventListener('pointerleave', cancel);

  // Táctil (móvil)
  checkBtn.addEventListener('touchstart', () => start(), { passive: true });
  checkBtn.addEventListener('touchend', cancel);
  checkBtn.addEventListener('touchcancel', cancel);
  checkBtn.addEventListener('touchmove', cancel);

  // Si hubo long-press, evitar que el click posterior marque la tarea.
  checkBtn.addEventListener('click', (e) => {
    if (longPressed) {
      e.stopPropagation();
      e.preventDefault();
      longPressed = false;
    }
  }, true); // captura: corre antes que el listener de completar
}

// Diálogo de confirmación antes de cronometrar una tarea desde su tarjeta.
function askStartTimerForTask(task) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'endtime-conflict-overlay';
    const box = document.createElement('div');
    box.className = 'endtime-conflict-box';

    const h = document.createElement('h3');
    h.className = 'endtime-conflict-title';
    h.textContent = 'Cronometrar tarea';

    const p = document.createElement('p');
    p.className = 'endtime-conflict-desc';
    p.textContent = `Se iniciará el cronómetro para "${task.title || 'Tarea sin título'}" usando la hora actual como inicio. ¿Continuar?`;

    const actions = document.createElement('div');
    actions.className = 'endtime-conflict-actions';

    const finish = (value) => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape') finish(false); };
    document.addEventListener('keydown', onKey);

    const btnCancel = document.createElement('button');
    btnCancel.className = 'btn btn-secondary';
    btnCancel.textContent = 'Cancelar';
    btnCancel.addEventListener('click', () => finish(false));

    const btnOk = document.createElement('button');
    btnOk.className = 'btn btn-primary';
    btnOk.textContent = 'Iniciar';
    btnOk.addEventListener('click', () => finish(true));

    actions.append(btnCancel, btnOk);
    box.append(h, p, actions);
    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(false); });
    document.body.appendChild(overlay);
  });
}

// Inicia el cronómetro precargando el título y la etiqueta de la tarea, con la
// hora actual como inicio (independientemente de la hora que tenga la tarea).
function startTimerForTask(task) {
  const titleInput = document.getElementById('timer-input-title');
  const descInput = document.getElementById('timer-input-description');
  const startInput = document.getElementById('timer-input-start');
  if (titleInput) titleInput.value = task.title || '';
  if (descInput) descInput.value = '';
  if (startInput) startInput.value = ''; // openTimerModal la rellena con la hora real
  setTimerSelectTagValue(task.tagId || 'default');

  timerSeconds = 0;
  timerStartEdited = false;
  const timerDisplayEl = document.getElementById('timer-display');
  if (timerDisplayEl) timerDisplayEl.textContent = '00:00:00';

  timerStartTime = new Date(); // hora actual como inicio

  setTimerButtonActive(true);
  openTimerModal();
  saveActiveTimerState();
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
  sortDayTasks(dayTasks, targetDateStr);

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

  // Validar si el nuevo orden propuesto respeta el orden cronológico
  if (!validateProposedOrder([...pending, ...completed], targetDateStr)) {
    renderWeeklyCalendar();
    return;
  }

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

      // ¿Se soltó sobre una columna del HORARIO (cronograma)? Entonces se coloca
      // ahí con snap de 30 min y duración por defecto/propia (igual que en
      // escritorio). Esto permite arrastrar tareas del maletín al horario en móvil.
      const crCol = elAtPoint ? elAtPoint.closest('.cr-day-col') : null;
      if (crCol) {
        dropTaskOnCronograma(touchDraggedTaskId, crCol, lastTouchY, false);
        cleanupDraggingUI();
        cleanupGlobalTouchListeners();
        return;
      }

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


// ─── Checkbox de completado en el modal de tarea ──────────────────────────
// Determina si una tarea (su ocurrencia, si es recurrente) está completada.
// Fija el estado de completado de una tarea (su ocurrencia, si es recurrente) al
// valor `completed` indicado, sin los efectos secundarios de toggleTaskCompletion.
function applyPendingCompleteState(task, occurrenceDate, completed) {
  if (!task) return;
  if (task.recurrence && task.recurrence.enabled) {
    if (!Array.isArray(task.completedOccurrences)) task.completedOccurrences = [];
    const i = task.completedOccurrences.indexOf(occurrenceDate);
    if (completed && i === -1) task.completedOccurrences.push(occurrenceDate);
    if (!completed && i !== -1) task.completedOccurrences.splice(i, 1);
  } else {
    task.completed = !!completed;
  }
}

function isTaskCompletedForModal(task, occurrenceDate) {
  if (!task) return false;
  if (task.recurrence && task.recurrence.enabled) {
    return Array.isArray(task.completedOccurrences) &&
           task.completedOccurrences.includes(occurrenceDate);
  }
  return !!task.completed;
}

// Pinta el icono del checkbox del modal según el estado (mismo SVG que las tareas).
function renderTaskModalCheckbox(completed) {
  const btn = document.getElementById('task-complete-btn');
  if (!btn) return;
  // El botón nunca debe quedar oculto: su visibilidad la controla el wrapper
  // (#task-complete-wrapper). Quitamos cualquier .hidden heredada para que no
  // herede el display:none de la versión que vivía en el encabezado del modal.
  btn.classList.remove('hidden');
  btn.classList.toggle('is-checked', !!completed);
  btn.setAttribute('aria-pressed', completed ? 'true' : 'false');
  btn.title = completed ? 'Marcar como pendiente' : 'Marcar como completada';
  btn.innerHTML = completed
    ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="task-check-icon checked"><rect x="3" y="3" width="18" height="18" rx="5"/><polyline points="8 12.5 11 15.5 16.5 9"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="task-check-icon"><rect x="3" y="3" width="18" height="18" rx="5"/></svg>';
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
  pendingCompleteState = null; // se recalcula desde la tarea al abrir

  if (selectedTaskId) {
    // EDIT MODE
    modalTitle.textContent = 'Editar tarea';
    deleteBtn.classList.remove('hidden');
    // Checkbox de completado: visible solo al editar una tarea existente.
    const completeWrapper = document.getElementById('task-complete-wrapper');
    if (completeWrapper) completeWrapper.classList.remove('hidden');

    const task = tasks.find(t => t.id === selectedTaskId);
    if (!task) return;

    renderTaskModalCheckbox(isTaskCompletedForModal(task, occurrenceDate || task.date));

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
    // Tarea nueva: aún no se puede completar; ocultar el checkbox.
    const completeWrapperNew = document.getElementById('task-complete-wrapper');
    if (completeWrapperNew) completeWrapperNew.classList.add('hidden');
    
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
    const titleEl = document.getElementById('task-input-title');
    titleEl.focus();
    // En el modo Línea de tiempo el modal se abre desde un `pointerdown`; el `mouseup`/
    // `click` que le sigue puede robar el foco recién puesto. Reaplicamos el foco
    // tras finalizar el gesto para que se pueda escribir el título de inmediato,
    // igual que en la lista de tareas. Dos respaldos (rAF y un timeout breve) cubren los
    // distintos momentos en que puede llegar el mouseup.
    const refocusTitle = () => {
      if (!document.getElementById('task-modal').classList.contains('hidden')
          && document.activeElement !== titleEl) {
        titleEl.focus();
      }
    };
    requestAnimationFrame(refocusTitle);
    setTimeout(refocusTitle, 60);
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

// Contexto pendiente para el aviso de tareas adyacentes (horario coincidente).
let pendingAdjacent = null; // { formData, taskId, occurrenceDate, affectations }

// Estado de completado elegido en el modal de tarea, PENDIENTE de guardar. Es
// null si el usuario no tocó el checkbox; true/false si lo marcó/desmarcó. Solo
// se aplica a la tarea cuando se hace click en Guardar (submit del formulario).
let pendingCompleteState = null;

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

// ─── Aviso de tareas adyacentes (horario coincidente) ─────────────────────
function openAdjacentTasksModal(affectations) {
  const modal = document.getElementById('adjacent-tasks-modal');
  if (!modal) return;
  const n = affectations.length;
  const label = document.getElementById('adjacent-tasks-count-label');
  if (label) label.textContent = n === 1 ? 'otra tarea' : `otras ${n} tareas`;
  const list = document.getElementById('adjacent-tasks-list');
  if (list) {
    list.innerHTML = affectations.map(aff => {
      const t = aff.task;
      const titulo = (t && t.title) ? t.title : 'Tarea sin título';
      const accion = aff.edge === 'start'
        ? `su hora de inicio pasaría a ${aff.newTime}`
        : `su hora de fin pasaría a ${aff.newTime}`;
      return `• <strong style="color:var(--text-main);font-weight:600;">${escapeHtmlAdj(titulo)}</strong> — ${accion}`;
    }).join('<br>');
  }
  modal.classList.remove('hidden');
}

function closeAdjacentTasksModal() {
  const modal = document.getElementById('adjacent-tasks-modal');
  if (modal) modal.classList.add('hidden');
  pendingAdjacent = null;
}

// Escape mínimo para insertar títulos de tarea en el aviso de forma segura.
function escapeHtmlAdj(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Aplica los cambios del formulario de tarea.
 *  scope: 'all'       -> modifica la tarea/serie completa (comportamiento normal)
 *         'only-this' -> separa la ocurrencia indicada como tarea independiente,
 *                        dejando la serie original intacta en los demas dias.
 */
function applyTaskChanges(scope, formData, taskId, occurrenceDate) {
  let { title, description, tagId, isBriefcase, date,
          startTime, endTime, duration, recurrence, alarm } = formData;

  // Si la tarea se guarda sin título, asignar uno automático. Esto cubre todos
  // los flujos de creación/edición (modo linea de tiempo y modo lista de tareas, escritorio y
  // móvil), ya que todos pasan por aquí.
  if (!title || !title.trim()) {
    title = 'Tarea sin título';
  } else {
    title = title.trim();
  }

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
        // Aplicar el completado PENDIENTE elegido en el modal (si lo hubo).
        if (pendingCompleteState !== null) {
          applyPendingCompleteState(tasks[idx], occurrenceDate || tasks[idx].date, pendingCompleteState);
        }
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

function openDeleteTaskConfirmModal() {
  const m = document.getElementById('delete-task-confirm-modal');
  if (m) m.classList.remove('hidden');
}
function closeDeleteTaskConfirmModal() {
  const m = document.getElementById('delete-task-confirm-modal');
  if (m) m.classList.add('hidden');
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


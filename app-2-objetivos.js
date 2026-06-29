// ─── Sección Objetivos ───────────────────────────────────────────────────────
// Vista a pantalla completa con header propio (logo + avatar). Por ahora solo
// se muestra/oculta; sin función adicional. El logo actúa como botón de volver.
let objetivosBound = false;
let expandedGoalIds = new Set();
let editingParentGoalId = null;

function openObjetivosSection() {
  const section = document.getElementById('objetivos-section');
  if (!section) return;
  const avatarSpan = section.querySelector('.objetivos-user-avatar span');
  if (avatarSpan && currentUser) {
    avatarSpan.textContent = (currentUser.email || 'U')[0].toUpperCase();
  }
  section.classList.remove('hidden');

  if (!objetivosBound) {
    objetivosBound = true;
    const logoBtn = document.getElementById('objetivos-logo-btn');
    if (logoBtn) {
      logoBtn.addEventListener('click', closeObjetivosSection);
      logoBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeObjetivosSection(); }
      });
    }
    setupObjetivosEventListeners();
  }
  renderObjetivos();
}

function closeObjetivosSection() {
  const section = document.getElementById('objetivos-section');
  if (section) section.classList.add('hidden');
}

// Creador/editor de objetivos
async function saveObjetivosToStorage() {
  if (!currentUser) return;
  const prefsCacheKey = 'prefs_cache_' + currentUser.id;
  
  let prefs = {};
  try {
    const cachedPrefs = localStorage.getItem(prefsCacheKey);
    if (cachedPrefs) prefs = JSON.parse(cachedPrefs);
  } catch (e) {}
  
  prefs.objetivos = objetivos;
  
  try {
    localStorage.setItem(prefsCacheKey, JSON.stringify(prefs));
  } catch (e) {}
  
  await savePreferences(prefs);
}

const GRADO_LEVELS = {
  1: 'primer grado',
  2: 'segundo grado',
  3: 'tercer grado',
  4: 'cuarto grado'
};

function formatDateDMY(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '';
}

// Parsea una fecha escrita a mano en formatos tipicos (dia/mes/anio).
// Acepta separadores  / - . espacio  o digitos pegados (ddmmaa / ddmmaaaa).
// Ejemplos: "3/4/26", "03-04-2026", "03.04", "030426", "3 4 2026".
// Si falta el anio, completa con el actual. Anio de 2 digitos -> 20xx.
// Devuelve 'YYYY-MM-DD' o null si no es una fecha valida.
function parseDateInput(text) {
  if (text === null || text === undefined) return null;
  let t = String(text).trim();
  if (t === '') return null;

  let d, mo, y;
  // 1) Con separadores  / - . o espacios
  const sep = t.split(/[\/\-.\s]+/).filter(x => x !== '');
  if (sep.length >= 2 && sep.every(x => /^\d+$/.test(x))) {
    d = parseInt(sep[0], 10);
    mo = parseInt(sep[1], 10);
    y = (sep.length >= 3) ? parseInt(sep[2], 10) : null;
  } else if (/^\d+$/.test(t)) {
    // 2) Solo digitos pegados: ddmm, ddmmaa, ddmmaaaa
    if (t.length === 4) {            // ddmm
      d = +t.slice(0,2); mo = +t.slice(2,4); y = null;
    } else if (t.length === 6) {     // ddmmaa
      d = +t.slice(0,2); mo = +t.slice(2,4); y = +t.slice(4,6);
    } else if (t.length === 8) {     // ddmmaaaa
      d = +t.slice(0,2); mo = +t.slice(2,4); y = +t.slice(4,8);
    } else {
      return null;
    }
  } else {
    return null;
  }

  if (!Number.isFinite(d) || !Number.isFinite(mo)) return null;
  if (y === null || Number.isNaN(y)) y = new Date().getFullYear();
  if (y < 100) y += 2000;            // anio 2 digitos -> 20xx

  // Validacion estricta (rechaza 45/13, 31/02, etc.)
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;

  const mm = String(mo).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

function findGoalByIdRecursive(list, id) {
  for (const item of list) {
    if (item.id === id) return { node: item, parent: null };
    if (item.subgoals && item.subgoals.length > 0) {
      const found = findGoalByIdRecursive(item.subgoals, id);
      if (found) {
        return { node: found.node, parent: found.parent || item };
      }
    }
  }
  return null;
}

// Devuelve el objetivo de primer grado (raíz) al que pertenece el id dado.
function findRootGoalById(id) {
  for (const root of objetivos) {
    if (root.id === id) return root;
    if (findGoalByIdRecursive(root.subgoals || [], id)) return root;
  }
  return null;
}

function renderGoalNode(obj, level) {
  const containerEl = document.createElement('div');
  const gradoClass = GRADO_LEVELS[level].replace(' ', '-');
  containerEl.className = `objetivo-container ${gradoClass}`;
  containerEl.dataset.goalId = obj.id;

  const item = document.createElement('div');
  item.className = 'objetivo-item';

  // Triángulo desplegable (sólo niveles < 4, es decir, primer grado, segundo grado y tercer grado)
  if (level < 4) {
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'objetivo-toggle-btn';
    toggleBtn.innerHTML = `
      <svg class="objetivo-toggle-icon ${expandedGoalIds.has(obj.id) ? 'expanded' : ''}" viewBox="0 0 24 24" width="12" height="12">
        <path d="M8 5v14l11-7z" fill="currentColor"></path>
      </svg>
    `;

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const icon = toggleBtn.querySelector('.objetivo-toggle-icon');
      const subList = containerEl.querySelector('.objetivo-subgoals-list');
      if (expandedGoalIds.has(obj.id)) {
        expandedGoalIds.delete(obj.id);
        icon.classList.remove('expanded');
        subList.classList.add('hidden');
      } else {
        // Contraer hermanos del mismo nivel de jerarquía (mismo grado)
        if (level === 1) {
          objetivos.forEach(sibling => {
            if (sibling.id !== obj.id) {
              expandedGoalIds.delete(sibling.id);
            }
          });
        } else {
          const foundData = findGoalByIdRecursive(objetivos, obj.id);
          const parent = foundData ? foundData.parent : null;
          if (parent && parent.subgoals) {
            parent.subgoals.forEach(sibling => {
              if (sibling.id !== obj.id) {
                expandedGoalIds.delete(sibling.id);
              }
            });
          }
        }
        expandedGoalIds.add(obj.id);
      }
      renderObjetivos();
    });

    item.appendChild(toggleBtn);
  } else {
    // Espaciador para alinear con los niveles superiores (cuarto grado no se despliega)
    const spacer = document.createElement('div');
    spacer.className = 'objetivo-toggle-spacer';
    spacer.style.width = '20px';
    spacer.style.flexShrink = '0';
    item.appendChild(spacer);
  }

  // Columna Título
  const titleCol = document.createElement('div');
  titleCol.className = 'goal-title-col';
  titleCol.textContent = obj.title;

  // ¿Tiene sub-objetivos? Si los tiene, las fechas son automáticas (solo lectura).
  const isParent = goalHasChildren(obj);
  const effDates = getEffectiveGoalDates(obj);
  const dispStart = isParent ? effDates.startDate : (obj.startDate || null);
  const dispEnd = isParent ? effDates.endDate : (obj.endDate || null);

  // Columna Inicio
  const inicioCol = document.createElement('div');
  inicioCol.className = 'goal-date-col' + (isParent ? ' goal-date-auto' : '');
  inicioCol.style.position = 'relative';

  // Evitar que el clic en la celda abra el modal
  inicioCol.addEventListener('click', (e) => {
    e.stopPropagation();
    // Si la fecha no es editable (objetivo con subobjetivos), avisar.
    if (isParent) showModeToast('Cálculo automático');
  });

  if (isParent) {
    // Padre: fecha calculada, solo lectura.
    const inicioText = document.createElement('span');
    inicioText.textContent = dispStart ? formatDateDMY(dispStart) : '-';
    inicioCol.appendChild(inicioText);
  } else {
    // Hoja: input de TEXTO editable por teclado en formatos tipicos
    // (dd/mm, dd/mm/yy, dd/mm/yyyy, con / - . o digitos pegados).
    const inicioInput = document.createElement('input');
    inicioInput.type = 'text';
    inicioInput.className = 'goal-inline-date-text';
    inicioInput.placeholder = '-';
    inicioInput.value = obj.startDate ? formatDateDMY(obj.startDate) : '';
    inicioInput.addEventListener('click', (e) => e.stopPropagation());

    const commitInicio = async () => {
      const raw = inicioInput.value.trim();
      if (raw === '') {
        // Vacio: borrar fecha de inicio (y el fin calculado)
        if (obj.startDate !== null) {
          obj.startDate = null;
          obj.endDate = null;
          await saveObjetivosToStorage();
          renderObjetivos();
        } else {
          inicioInput.value = '';
        }
        return;
      }
      const parsed = parseDateInput(raw);
      if (!parsed) {
        // Invalido: revertir silenciosamente al valor anterior
        inicioInput.value = obj.startDate ? formatDateDMY(obj.startDate) : '';
        return;
      }
      // Validar restriccion: inicio no posterior al fin (si fin es manual antiguo)
      if (obj.endDate && obj.endDate < parsed && !getLeafDurationDays(obj)) {
        inicioInput.value = obj.startDate ? formatDateDMY(obj.startDate) : '';
        return;
      }
      obj.startDate = parsed;
      // Si la hoja tiene duracion, el fin se recalcula automaticamente.
      const durD = getLeafDurationDays(obj);
      obj.endDate = (parsed && durD) ? computeLeafEndDate(parsed, durD) : obj.endDate;
      await saveObjetivosToStorage();
      renderObjetivos();
    };

    inicioInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); inicioInput.blur(); }
      else if (e.key === 'Escape') {
        inicioInput.value = obj.startDate ? formatDateDMY(obj.startDate) : '';
        inicioInput.blur();
      }
    });
    inicioInput.addEventListener('blur', commitInicio);
    inicioCol.appendChild(inicioInput);
  }

  // Columna Fin
  const finCol = document.createElement('div');
  finCol.className = 'goal-date-col' + (isParent ? ' goal-date-auto' : '');
  finCol.style.position = 'relative';

  const finText = document.createElement('span');
  finText.textContent = dispEnd ? formatDateDMY(dispEnd) : '-';
  finCol.appendChild(finText);

  finCol.addEventListener('click', (e) => {
    e.stopPropagation();
    // El FIN siempre se calcula automaticamente (hoja: inicio+duracion; padre: rango).
    showModeToast('Cálculo automático');
  });

  // La fecha de FIN siempre es de solo lectura: se calcula automaticamente a
  // partir del inicio + la duracion (hojas) o del rango de descendientes (padres).
  finCol.classList.add('goal-date-auto');

  // === Columna DURACION ===
  const durCol = document.createElement('div');
  durCol.className = 'goal-duration-col' + (isParent ? ' goal-duration-auto' : '');
  durCol.style.position = 'relative';
  durCol.addEventListener('click', (e) => e.stopPropagation());

  if (isParent) {
    // Padre: duracion total calculada del rango efectivo (solo lectura).
    let totalDays = null;
    if (effDates.startDate && effDates.endDate) {
      const a = parseGoalDate(effDates.startDate), b = parseGoalDate(effDates.endDate);
      if (a && b) totalDays = Math.round((b - a) / 86400000) + 1;
    }
    const durText = document.createElement('span');
    durText.textContent = totalDays ? formatDuration(totalDays) : '-';
    durCol.appendChild(durText);
  } else {
    // Hoja: input de texto editable (2d, 5s, 5s2d).
    const durInput = document.createElement('input');
    durInput.type = 'text';
    durInput.className = 'goal-inline-duration-input';
    durInput.placeholder = '-';
    const curDays = getLeafDurationDays(obj);
    durInput.value = curDays ? formatDuration(curDays) : '';
    durInput.addEventListener('click', (e) => e.stopPropagation());

    const commitDuration = async () => {
      const parsed = parseDurationText(durInput.value);
      if (durInput.value.trim() === '') {
        // Vacio: se borra la duracion (y el fin calculado)
        obj.durationDays = null;
        obj.endDate = null;
        await saveObjetivosToStorage();
        renderObjetivos();
        return;
      }
      if (parsed === null) {
        alert('Formato de duracion no valido. Usa por ejemplo: 2d, 5s, 5s2d.');
        durInput.value = curDays ? formatDuration(curDays) : '';
        return;
      }
      obj.durationDays = parsed;
      // Recalcular y guardar el fin si hay inicio
      obj.endDate = obj.startDate ? computeLeafEndDate(obj.startDate, parsed) : null;
      await saveObjetivosToStorage();
      renderObjetivos();
    };

    durInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); durInput.blur(); }
    });
    durInput.addEventListener('blur', commitDuration);
    durCol.appendChild(durInput);
  }

  // Visualización compacta en móviles
  const mobileDates = document.createElement('div');
  mobileDates.className = 'goal-mobile-dates';
  const startText = dispStart ? formatDateDMY(dispStart) : 'Sin inicio';
  const endText = dispEnd ? formatDateDMY(dispEnd) : 'Sin fin';
  mobileDates.textContent = `${startText} • ${endText}`;

  item.appendChild(titleCol);
  item.appendChild(durCol);
  item.appendChild(inicioCol);
  item.appendChild(finCol);
  item.appendChild(mobileDates);
  
  // Control de click vs drag (para todos los grados)
  let wasDragging = false;
  containerEl.addEventListener('dragstart', (e) => {
    e.stopPropagation();
    wasDragging = true;
  });
  containerEl.addEventListener('dragend', (e) => {
    e.stopPropagation();
    setTimeout(() => { wasDragging = false; }, 50);
  });
  containerEl.addEventListener('touchstart', (e) => {
    if (e.target.closest('.objetivo-subgoals-list')) return;
    wasDragging = false;
  }, { passive: true });
  containerEl.addEventListener('touchmove', (e) => {
    if (e.target.closest('.objetivo-subgoals-list')) return;
    wasDragging = true;
  }, { passive: true });
  
  item.addEventListener('click', () => {
    if (wasDragging) return;
    let parentId = null;
    if (level > 1) {
      const foundData = findGoalByIdRecursive(objetivos, obj.id);
      parentId = foundData && foundData.parent ? foundData.parent.id : null;
    }
    openObjetivoModal(obj.id, level, parentId);
  });
  
  containerEl.appendChild(item);

  // Lista de Subobjetivos (sólo grados < cuarto grado)
  if (level < 4) {
    const subList = document.createElement('div');
    subList.className = 'objetivo-subgoals-list' + (expandedGoalIds.has(obj.id) ? '' : ' hidden');

    if (obj.subgoals && obj.subgoals.length > 0) {
      obj.subgoals.forEach(sub => {
        if (!goalMatchesStatusFilter(sub, objetivosStatusFilter)) return;
        const subNode = renderGoalNode(sub, level + 1);
        subList.appendChild(subNode);
      });
    }

    // Botón "+ Añadir" para subobjetivos
    const createSubBtn = document.createElement('div');
    createSubBtn.className = 'subgoal-create-btn';
    createSubBtn.textContent = '+ Añadir';
    if (level < 3) {
      createSubBtn.style.marginLeft = '16px'; // Alinear exactamente con el icono de triángulo (segundo y tercer grado)
    } else if (level === 3) {
      createSubBtn.style.marginLeft = '32px'; // Alinear con el texto de cuarto grado
    }
    createSubBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openObjetivoModal(null, level + 1, obj.id);
    });
    subList.appendChild(createSubBtn);

    containerEl.appendChild(subList);
  }

  return containerEl;
}

// Etiquetas legibles de los estados de objetivo.
const OBJ_STATUS_LABELS = {
  todos: 'Todos',
  sin_comenzar: 'Sin comenzar',
  en_proceso: 'En proceso',
  finalizado: 'Finalizado',
  cancelado: 'Cancelado',
  pausado: 'Pausado'
};
// Estado actualmente filtrado ('todos' = sin filtro).
let objetivosStatusFilter = 'todos';

// Indica si un objetivo coincide con el filtro, considerando descendientes:
// se muestra la rama si el objetivo o cualquiera de sus subobjetivos coincide.
function goalMatchesStatusFilter(obj, status) {
  if (status === 'todos') return true;
  if ((obj.status || 'sin_comenzar') === status) return true;
  if (obj.subgoals && obj.subgoals.length) {
    return obj.subgoals.some(sub => goalMatchesStatusFilter(sub, status));
  }
  return false;
}

function renderObjetivos() {
  const container = document.getElementById('objetivos-lista');
  if (!container) return;
  container.innerHTML = '';

  // Navegador (decorativo): mostrar la fecha de hoy en el label.
  const navLabel = document.getElementById('week-range-label-obj');
  if (navLabel) {
    const hoy = new Date();
    navLabel.textContent = hoy.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  if (objetivos.length === 0) {
    // Lista vacia: el boton '+ Añadir' fijo de la parte inferior se encarga de crear.
  } else {
    // Renderizar objetivos de primer grado (aplicando filtro de estado por rama)
    objetivos.forEach(obj => {
      if (!goalMatchesStatusFilter(obj, objetivosStatusFilter)) return;
      const node = renderGoalNode(obj, 1);
      container.appendChild(node);
    });

    setupObjetivosDragAndDrop(container);
  }

  // Dibujar tras el reflow para que las posiciones de las filas sean correctas
  renderGanttChart();
  requestAnimationFrame(renderGanttChart);
}

// ===== Carta Gantt de Objetivos =====
let ganttScrollX = 0; // desplazamiento horizontal (px) de la línea de tiempo
let ganttContentWidth = 0; // ancho total del lienzo del gantt
function parseGoalDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

// --- Duracion (dias / semanas) ---
// Parsea texto como "2d", "5s", "5s2d" (orden flexible) -> total de dias.
// Acepta espacios y mayusculas. Devuelve null si no hay nada valido.
function parseDurationText(text) {
  if (text === null || text === undefined) return null;
  const t = String(text).trim().toLowerCase().replace(/\s+/g, '');
  if (t === '') return null;
  // Solo se permiten numeros seguidos de 's' (semanas) o 'd' (dias)
  if (!/^(\d+[sd])+$/.test(t)) return null;
  let days = 0;
  const re = /(\d+)([sd])/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const n = parseInt(m[1], 10);
    days += (m[2] === 's') ? n * 7 : n;
  }
  return days > 0 ? days : null;
}

// Formatea un total de dias a texto normalizado. Solo se usan semanas cuando la
// duracion es multiplo EXACTO de 7 (14 -> "2s"); en cualquier otro caso se
// expresa en dias totales (16 -> "16d", 30 -> "30d").
function formatDuration(days) {
  if (!days || days <= 0) return '';
  if (days % 7 === 0) return (days / 7) + 's';
  return days + 'd';
}

// Duracion en dias de un objetivo HOJA. Prioriza durationDays; si no existe pero
// hay startDate+endDate (datos antiguos), la deriva (inclusiva). Si no, null.
function getLeafDurationDays(obj) {
  if (!obj) return null;
  if (typeof obj.durationDays === 'number' && obj.durationDays > 0) return obj.durationDays;
  const sd = parseGoalDate(obj.startDate);
  const ed = parseGoalDate(obj.endDate);
  if (sd && ed) {
    const diff = Math.round((ed - sd) / 86400000) + 1; // inclusivo
    return diff > 0 ? diff : null;
  }
  return null;
}

// Fecha de fin (YYYY-MM-DD) de una hoja a partir de inicio + duracion (inclusivo).
function computeLeafEndDate(startDate, durationDays) {
  const sd = parseGoalDate(startDate);
  if (!sd || !durationDays || durationDays <= 0) return null;
  const ed = new Date(sd.getTime());
  ed.setDate(ed.getDate() + (durationDays - 1)); // inclusivo: dia de inicio cuenta
  const y = ed.getFullYear();
  const mo = String(ed.getMonth() + 1).padStart(2, '0');
  const da = String(ed.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

// Un objetivo es "hoja" si no tiene sub-objetivos dentro
function goalHasChildren(obj) {
  return !!(obj && obj.subgoals && obj.subgoals.length > 0);
}

// Fechas efectivas de un objetivo:
//  - hoja: sus propias startDate/endDate
//  - padre: el rango (mínimo inicio, máximo fin) de TODOS sus descendientes hoja.
// Devuelve { startDate, endDate } en formato 'YYYY-MM-DD' o null si no aplica.
function getEffectiveGoalDates(obj) {
  if (!obj) return { startDate: null, endDate: null };

  if (!goalHasChildren(obj)) {
    // Hoja: el fin se calcula desde inicio + duracion (si hay). Compatibilidad:
    // si no hay duracion pero si endDate antiguo, se usa ese.
    const durDays = getLeafDurationDays(obj);
    let end = null;
    if (obj.startDate && durDays) {
      end = computeLeafEndDate(obj.startDate, durDays);
    } else {
      end = obj.endDate || null;
    }
    return {
      startDate: obj.startDate || null,
      endDate: end
    };
  }

  // Padre: agregar fechas de descendientes
  let minStart = null, maxEnd = null;
  (function walk(node) {
    if (!node || !node.subgoals) return;
    node.subgoals.forEach(child => {
      if (goalHasChildren(child)) {
        walk(child);
      } else {
        const sd = parseGoalDate(child.startDate);
        const ed = parseGoalDate(child.endDate);
        if (sd && (minStart === null || sd < minStart)) minStart = sd;
        if (ed && (maxEnd === null || ed > maxEnd)) maxEnd = ed;
      }
    });
  })(obj);

  const fmt = (d) => {
    if (!d) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return { startDate: fmt(minStart), endDate: fmt(maxEnd) };
}

function renderGanttChart() {
  const gantt = document.getElementById('objetivos-gantt');
  const header = document.getElementById('gantt-timeline-header');
  const rowsEl = document.getElementById('gantt-rows');
  const listContainer = document.getElementById('objetivos-list-container') ||
    document.querySelector('.objetivos-list-container');
  if (!gantt || !header || !rowsEl || !listContainer) return;

  ensureGanttWheelBound();

  header.innerHTML = '';
  rowsEl.innerHTML = '';

  // Recolectar las filas visibles de la lista (en el orden en que aparecen)
  const itemEls = Array.from(listContainer.querySelectorAll('.objetivo-container'))
    .filter(c => {
      // visible si ninguno de sus ancestros .objetivo-subgoals-list está oculto
      let p = c.parentElement;
      while (p && p !== listContainer) {
        if (p.classList && p.classList.contains('objetivo-subgoals-list') &&
            p.classList.contains('hidden')) return false;
        p = p.parentElement;
      }
      return true;
    })
    .map(c => ({ el: c.querySelector(':scope > .objetivo-item'), id: c.dataset.goalId }))
    .filter(r => r.el && r.id);

  if (itemEls.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'gantt-empty';
    empty.textContent = 'Sin objetivos para mostrar';
    rowsEl.appendChild(empty);
    return;
  }

  // Datos (fechas) de cada fila
  const rows = itemEls.map(r => {
    const found = findGoalByIdRecursive(objetivos, r.id);
    const obj = found ? found.node : null;
    const eff = getEffectiveGoalDates(obj);
    const root = findRootGoalById(r.id);
    return {
      el: r.el,
      start: parseGoalDate(eff.startDate),
      end: parseGoalDate(eff.endDate),
      color: getGoalColor(root).bg
    };
  });

  // Rango global de fechas
  let minT = Infinity, maxT = -Infinity;
  rows.forEach(r => {
    if (r.start && r.end) {
      minT = Math.min(minT, r.start.getTime());
      maxT = Math.max(maxT, r.end.getTime());
    }
  });

  const DAY = 86400000;

  if (!isFinite(minT) || !isFinite(maxT)) {
    // No hay ninguna barra que dibujar, pero igual mostramos filas vacías alineadas
    drawGanttBars(rows, header, rowsEl, listContainer, null);
    return;
  }

  // Añadir un pequeño margen al rango (5% a cada lado, mínimo 2 días)
  const span = Math.max(maxT - minT, DAY);
  const pad = Math.max(span * 0.05, 2 * DAY);
  let rangeStart = new Date(minT - pad);
  let rangeEnd = new Date(maxT + pad);

  // Decidir escala: semanas si el rango total es corto, meses si es largo
  const totalDays = (rangeEnd - rangeStart) / DAY;
  const scale = totalDays <= 70 ? 'week' : 'month';

  // Ancho del lienzo por densidad fija de px/día. Se garantiza que siempre sea
  // más ancho que el panel para poder navegar la línea de tiempo a los lados.
  const viewportWidth = rowsEl.getBoundingClientRect().width || 1;
  const pxPerDay = scale === 'week' ? 24 : 9; // semanas más "abiertas", meses más compactos
  const contentWidth = Math.max(totalDays * pxPerDay, viewportWidth * 1.6);

  drawGanttBars(rows, header, rowsEl, listContainer, { rangeStart, rangeEnd, scale, contentWidth, viewportWidth });
}

function drawGanttBars(rows, header, rowsEl, listContainer, range) {
  // Igualar la altura de la zona de barras a la de la lista de objetivos, para
  // que el scroll vertical comun (objetivos-body) abarque todas las filas y las
  // barras dispongan de espacio (son position:absolute).
  const listaEl = document.getElementById('objetivos-lista');
  if (listaEl) {
    // +16px de holgura para que la barra de scroll horizontal nativa no tape
    // la ultima fila de barras.
    rowsEl.style.height = (listaEl.offsetHeight + 16) + 'px';
  }

  const rowsRect = rowsEl.getBoundingClientRect();

  if (range) {
    const { rangeStart, rangeEnd, scale, contentWidth, viewportWidth } = range;
    const totalMs = rangeEnd - rangeStart || 1;
    const width = contentWidth;
    const toX = (date) => ((date - rangeStart) / totalMs) * width;

    ganttContentWidth = width;
    // Limitar el desplazamiento al rango válido
    const maxScroll = Math.max(0, width - viewportWidth);
    if (ganttScrollX > maxScroll) ganttScrollX = maxScroll;
    if (ganttScrollX < 0) ganttScrollX = 0;

    // El header se desplaza por transform (no tiene barra propia); las filas
    // usan el scroll horizontal NATIVO de .gantt-rows (barra visible).
    const headerTrack = document.createElement('div');
    headerTrack.className = 'gantt-header-track';
    headerTrack.style.width = width + 'px';
    headerTrack.style.transform = 'translateX(' + (-ganttScrollX) + 'px)';

    const rowsTrack = document.createElement('div');
    rowsTrack.className = 'gantt-rows-track';
    rowsTrack.style.width = width + 'px';

    // Marcas de la línea del tiempo
    const ticks = [];
    if (scale === 'month') {
      let d = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
      if (d < rangeStart) d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      while (d <= rangeEnd) {
        ticks.push({ date: new Date(d), label: d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' }) });
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      }
    } else {
      // semanas: comenzar el lunes siguiente
      let d = new Date(rangeStart);
      const dow = (d.getDay() + 6) % 7; // 0 = lunes
      d.setDate(d.getDate() + (dow === 0 ? 0 : 7 - dow));
      d.setHours(0, 0, 0, 0);
      while (d <= rangeEnd) {
        ticks.push({ date: new Date(d), label: d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) });
        d = new Date(d.getTime() + 7 * 86400000);
      }
    }

    ticks.forEach(t => {
      const x = toX(t.date);
      const gl = document.createElement('div');
      gl.className = 'gantt-gridline';
      gl.style.left = x + 'px';
      rowsTrack.appendChild(gl);

      const tk = document.createElement('div');
      tk.className = 'gantt-tick';
      tk.style.left = x + 'px';
      tk.textContent = t.label;
      headerTrack.appendChild(tk);
    });

    // Barras
    rows.forEach(r => {
      if (!r.start || !r.end) return; // fila vacía: sin barra
      const itemRect = r.el.getBoundingClientRect();
      const centerY = itemRect.top + itemRect.height / 2 - rowsRect.top;
      const x1 = toX(r.start);
      const x2 = toX(r.end);
      const bar = document.createElement('div');
      bar.className = 'gantt-bar';
      bar.style.left = Math.min(x1, x2) + 'px';
      bar.style.width = Math.max(Math.abs(x2 - x1), 6) + 'px';
      bar.style.top = centerY + 'px';
      if (r.color) bar.style.backgroundColor = r.color;
      rowsTrack.appendChild(bar);
    });

    header.appendChild(headerTrack);
    rowsEl.appendChild(rowsTrack);

    // Header y filas se desplazan por transform; la barra externa (fija abajo)
    // es la que el usuario arrastra.
    rowsTrack.style.transform = 'translateX(' + (-ganttScrollX) + 'px)';
    headerTrack.style.transform = 'translateX(' + (-ganttScrollX) + 'px)';

    // Ajustar la barra de scroll horizontal externa (sticky abajo).
    const hbar = document.getElementById('gantt-hscroll');
    const spacer = document.getElementById('gantt-hscroll-spacer');
    if (hbar && spacer) {
      spacer.style.width = width + 'px';
      hbar.scrollLeft = ganttScrollX;
      if (!hbar.dataset.ganttHScrollBound) {
        hbar.dataset.ganttHScrollBound = '1';
        hbar.addEventListener('scroll', () => {
          ganttScrollX = hbar.scrollLeft;
          const rt = document.querySelector('.gantt-rows-track');
          const ht = document.querySelector('.gantt-header-track');
          if (rt) rt.style.transform = 'translateX(' + (-ganttScrollX) + 'px)';
          if (ht) ht.style.transform = 'translateX(' + (-ganttScrollX) + 'px)';
        }, { passive: true });
      }
    }
  }
}

// Aplica el desplazamiento horizontal actual sin recalcular todo el gantt
function applyGanttScroll() {
  const rt = document.querySelector('.gantt-rows-track');
  const ht = document.querySelector('.gantt-header-track');
  if (rt) rt.style.transform = 'translateX(' + (-ganttScrollX) + 'px)';
  if (ht) ht.style.transform = 'translateX(' + (-ganttScrollX) + 'px)';
  const hbar = document.getElementById('gantt-hscroll');
  if (hbar) hbar.scrollLeft = ganttScrollX;
}

function updateObjetivoDateConstraints() {
  const startInput = document.getElementById('objetivo-input-start-date');
  const endInput = document.getElementById('objetivo-input-end-date');
  if (!startInput || !endInput) return;

  const startVal = startInput.value;
  const endVal = endInput.value;

  if (startVal) {
    endInput.min = startVal;
    if (endVal && endVal < startVal) {
      endInput.value = startVal;
      updateDateOverlay(endInput);
    }
  } else {
    endInput.removeAttribute('min');
  }

  if (endVal) {
    startInput.max = endVal;
    if (startVal && startVal > endVal) {
      startInput.value = endVal;
      updateDateOverlay(startInput);
    }
  } else {
    startInput.removeAttribute('max');
  }
}

function setObjetivoStatus(status) {
  const statusInput = document.getElementById('objetivo-input-status');
  if (statusInput) statusInput.value = status;
}

// --- Selector de color de objetivos (solo primer grado) ---

// Devuelve el objeto de color {bg,text,border} de un objetivo de primer grado.
// Si tiene customColor lo usa; si no, usa su colorIndex en la paleta.
function getGoalColor(goal) {
  if (!goal) return DEFAULT_COLORS[0];
  if (goal.customColor && goal.customColor.bg) return goal.customColor;
  const idx = (typeof goal.colorIndex === 'number') ? goal.colorIndex : 0;
  return DEFAULT_COLORS[idx % DEFAULT_COLORS.length] || DEFAULT_COLORS[0];
}

// Primer índice de la paleta no usado por otro objetivo de primer grado.
// Si todos están ocupados, recicla desde 0 (basado en el conteo de objetivos).
function getNextFreeGoalColorIndex() {
  const used = new Set();
  objetivos.forEach(o => {
    if (!o.customColor && typeof o.colorIndex === 'number') {
      used.add(o.colorIndex % DEFAULT_COLORS.length);
    }
  });
  for (let i = 0; i < DEFAULT_COLORS.length; i++) {
    if (!used.has(i)) return i;
  }
  return objetivos.length % DEFAULT_COLORS.length;
}

function updateObjetivoColorSwatch() {
  const swatch = document.getElementById('objetivo-color-swatch');
  if (!swatch) return;
  const color = objetivoCustomColor || DEFAULT_COLORS[objetivoColorIndex] || DEFAULT_COLORS[0];
  swatch.style.backgroundColor = color.bg;
}

function buildObjetivoColorPalette() {
  const container = document.getElementById('objetivo-color-palette-grid');
  if (!container) return;
  container.innerHTML = '';

  DEFAULT_COLORS.forEach((color, idx) => {
    const circle = document.createElement('div');
    circle.className = 'color-circle';
    circle.style.backgroundColor = color.bg;
    circle.style.borderColor = color.border;
    circle.dataset.index = idx;

    if (idx === objetivoColorIndex && !objetivoCustomColor) {
      circle.classList.add('selected');
    }

    circle.addEventListener('click', () => {
      container.querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));
      circle.classList.add('selected');
      objetivoColorIndex = idx;
      objetivoCustomColor = null;
      hideObjetivoHslPicker();
      updateObjetivoColorSwatch();
    });

    container.appendChild(circle);
  });

  // Botón '+' para color personalizado (HSL)
  const addBtn = document.createElement('div');
  addBtn.className = 'color-circle color-circle-add';
  addBtn.title = 'Color personalizado';
  addBtn.innerHTML = '<span class="color-add-plus">+</span>';
  if (objetivoCustomColor) addBtn.classList.add('selected');
  addBtn.addEventListener('click', () => {
    let startBg = null;
    if (objetivoCustomColor) {
      startBg = objetivoCustomColor.bg;
    } else if (DEFAULT_COLORS[objetivoColorIndex]) {
      startBg = DEFAULT_COLORS[objetivoColorIndex].bg;
    }
    if (startBg) {
      const [h, s, l] = hexToHsl(startBg);
      const hEl = document.getElementById('objetivo-hsl-h'), sEl = document.getElementById('objetivo-hsl-s'), lEl = document.getElementById('objetivo-hsl-l');
      if (hEl) hEl.value = h;
      if (sEl) sEl.value = s;
      if (lEl) lEl.value = l;
    }
    container.querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));
    addBtn.classList.add('selected');
    showObjetivoHslPicker();
  });
  container.appendChild(addBtn);
}

function updateObjetivoHslPreview() {
  const h = +document.getElementById('objetivo-hsl-h').value;
  const s = +document.getElementById('objetivo-hsl-s').value;
  const l = +document.getElementById('objetivo-hsl-l').value;
  const hex = hslToHex(h, s, l);
  objetivoCustomColor = { bg: hex, text: '#ffffff', border: hex };
  const prev = document.getElementById('objetivo-hsl-preview');
  const val = document.getElementById('objetivo-hsl-value');
  if (prev) prev.style.backgroundColor = hex;
  if (val) val.textContent = `${hex.toUpperCase()}  (H ${h}, S ${s}, L ${l})`;
  updateObjetivoColorSwatch();
}

function showObjetivoHslPicker() {
  const picker = document.getElementById('objetivo-hsl-picker');
  if (picker) picker.classList.remove('hidden');
  updateObjetivoHslPreview();
}

function hideObjetivoHslPicker() {
  const picker = document.getElementById('objetivo-hsl-picker');
  if (picker) picker.classList.add('hidden');
}

function toggleObjetivoColorDropdown(show) {
  const dd = document.getElementById('objetivo-color-dropdown');
  if (!dd) return;
  if (show === undefined) show = dd.classList.contains('hidden');
  if (show) {
    buildObjetivoColorPalette();
    dd.classList.remove('hidden');
  } else {
    dd.classList.add('hidden');
  }
}

function openObjetivoModal(id, targetLevel = 1, parentId = null) {
  editingObjetivoId = id;
  editingParentGoalId = parentId;
  const modal = document.getElementById('objetivo-modal');
  const modalTitle = modal.querySelector('.modal-header h2');
  const input = document.getElementById('objetivo-input-title');
  const deleteBtn = document.getElementById('delete-objetivo-btn');
  const startInput = document.getElementById('objetivo-input-start-date');
  const endInput = document.getElementById('objetivo-input-end-date');
  const descInput = document.getElementById('objetivo-input-description');
  const durInput = document.getElementById('objetivo-input-duration');

  let editObj = null;
  if (id === null) {
    modalTitle.textContent = targetLevel > 1 ? 'Nuevo sub-objetivo' : 'Nuevo objetivo';
    input.value = '';
    startInput.value = '';
    endInput.value = '';
    if (descInput) descInput.value = '';
    if (durInput) durInput.value = '';
    setObjetivoStatus('sin_comenzar');
    deleteBtn.classList.add('hidden');
  } else {
    modalTitle.textContent = targetLevel > 1 ? 'Editar sub-objetivo' : 'Editar objetivo';
    const foundData = findGoalByIdRecursive(objetivos, id);
    editObj = foundData ? foundData.node : null;
    const obj = editObj;
    input.value = obj ? obj.title : '';
    startInput.value = (obj && obj.startDate) ? obj.startDate : '';
    endInput.value = (obj && obj.endDate) ? obj.endDate : '';
    if (descInput) descInput.value = (obj && obj.description) ? obj.description : '';
    if (durInput) {
      const dDays = getLeafDurationDays(obj);
      durInput.value = dDays ? formatDuration(dDays) : '';
    }
    setObjetivoStatus((obj && obj.status) ? obj.status : 'sin_comenzar');
    deleteBtn.classList.remove('hidden');
  }

  // El FIN siempre es de solo lectura (calculado). La DURACION solo es editable
  // en hojas; los padres tienen inicio/fin/duracion automaticos.
  const isParent = goalHasChildren(editObj);
  const datesRow = document.getElementById('objetivo-dates-row');
  const autoNote = document.getElementById('objetivo-dates-auto-note');
  const startClear = document.getElementById('objetivo-start-date-clear');
  const endClear = document.getElementById('objetivo-end-date-clear');
  const durGroup = document.getElementById('objetivo-duration-group');
  // El fin nunca se edita a mano
  endInput.disabled = true;
  if (endClear) endClear.style.display = 'none';
  if (isParent) {
    const eff = getEffectiveGoalDates(editObj);
    startInput.value = eff.startDate || '';
    endInput.value = eff.endDate || '';
    startInput.disabled = true;
    if (datesRow) datesRow.classList.add('objetivo-dates-locked');
    if (autoNote) autoNote.classList.remove('hidden');
    if (startClear) startClear.style.display = 'none';
    if (durGroup) durGroup.classList.add('hidden'); // padre: sin campo de duracion
  } else {
    startInput.disabled = false;
    // El fin de la hoja se muestra calculado desde inicio+duracion
    const dDays = getLeafDurationDays(editObj);
    endInput.value = (editObj && editObj.startDate && dDays)
      ? computeLeafEndDate(editObj.startDate, dDays)
      : (endInput.value || '');
    if (datesRow) datesRow.classList.remove('objetivo-dates-locked');
    if (autoNote) autoNote.classList.add('hidden');
    if (startClear) startClear.style.display = '';
    if (durGroup) durGroup.classList.remove('hidden');
  }

  // Selector de color: solo para objetivos de primer grado (sin padre)
  const colorGroup = document.getElementById('objetivo-color-group');
  const isFirstGrade = (targetLevel === 1 && !parentId);
  if (colorGroup) {
    if (isFirstGrade) {
      colorGroup.classList.remove('hidden');
      colorGroup.style.display = '';
      // Inicializar estado del color a partir del objetivo (o por defecto)
      if (editObj && editObj.customColor && editObj.customColor.bg) {
        objetivoCustomColor = editObj.customColor;
        objetivoColorIndex = (typeof editObj.colorIndex === 'number') ? editObj.colorIndex : 0;
      } else if (editObj && typeof editObj.colorIndex === 'number') {
        objetivoColorIndex = editObj.colorIndex;
        objetivoCustomColor = null;
      } else {
        // Nuevo objetivo, o uno antiguo sin color: primer color libre
        objetivoColorIndex = getNextFreeGoalColorIndex();
        objetivoCustomColor = null;
      }
      hideObjetivoHslPicker();
      toggleObjetivoColorDropdown(false);
      updateObjetivoColorSwatch();
    } else {
      colorGroup.classList.add('hidden');
      colorGroup.style.display = 'none';
      toggleObjetivoColorDropdown(false);
    }
  }

  // Refrescar overlays de fecha
  updateDateOverlay(startInput);
  updateDateOverlay(endInput);

  // Establecer restricciones de fecha min/max iniciales
  updateObjetivoDateConstraints();

  modal.classList.remove('hidden');
  setTimeout(() => input.focus(), 50);
}

function setupObjetivosEventListeners() {
  const saveBtn = document.getElementById('save-objetivo-btn');
  const cancelBtn = document.getElementById('cancel-objetivo-btn');
  const deleteBtn = document.getElementById('delete-objetivo-btn');
  const input = document.getElementById('objetivo-input-title');
  const modal = document.getElementById('objetivo-modal');
  const startInput = document.getElementById('objetivo-input-start-date');
  const endInput = document.getElementById('objetivo-input-end-date');
  const startClearBtn = document.getElementById('objetivo-start-date-clear');
  const endClearBtn = document.getElementById('objetivo-end-date-clear');

  saveBtn.addEventListener('click', async () => {
    const title = input.value.trim();
    if (!title) return;

    const startVal = startInput.value || null;
    const descInput = document.getElementById('objetivo-input-description');
    const statusInput = document.getElementById('objetivo-input-status');
    const durInputEl = document.getElementById('objetivo-input-duration');
    const descVal = descInput ? descInput.value.trim() : '';
    const statusVal = statusInput ? statusInput.value : 'sin_comenzar';

    // Duracion escrita en el modal (solo aplica a hojas). Validar formato.
    let durDays = null;
    if (durInputEl && durInputEl.value.trim() !== '') {
      durDays = parseDurationText(durInputEl.value);
      if (durDays === null) {
        alert('Formato de duracion no valido. Usa por ejemplo: 2d, 5s, 5s2d.');
        return;
      }
    }
    // El fin de una hoja se calcula desde inicio + duracion.
    const endVal = (startVal && durDays) ? computeLeafEndDate(startVal, durDays) : null;

    if (editingParentGoalId) {
      // Guardar subobjetivo
      const parentData = findGoalByIdRecursive(objetivos, editingParentGoalId);
      const parent = parentData ? parentData.node : null;
      if (parent) {
        if (!parent.subgoals) parent.subgoals = [];
        if (editingObjetivoId === null) {
          // El padre pasa a tener hijos: sus fechas manuales se descartan
          parent.startDate = null;
          parent.endDate = null;
          parent.subgoals.push({
            id: 'goal-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            title: title,
            startDate: startVal,
            endDate: endVal,
            durationDays: durDays,
            description: descVal,
            status: statusVal,
            subgoals: []
          });
        } else {
          const sub = parent.subgoals.find(s => s.id === editingObjetivoId);
          if (sub) {
            sub.title = title;
            // Si tiene sub-objetivos, las fechas son automáticas (se descartan las manuales)
            if (goalHasChildren(sub)) {
              sub.startDate = null;
              sub.endDate = null;
              sub.durationDays = null;
            } else {
              sub.startDate = startVal;
              sub.durationDays = durDays;
              sub.endDate = endVal;
            }
            sub.description = descVal;
            sub.status = statusVal;
          }
        }
      }
    } else {
      // Guardar objetivo principal
      if (editingObjetivoId === null) {
        const newObj = {
          id: 'goal-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
          title: title,
          startDate: startVal,
          endDate: endVal,
          durationDays: durDays,
          description: descVal,
          status: statusVal,
          colorIndex: objetivoColorIndex,
          customColor: objetivoCustomColor || null,
          subgoals: []
        };
        objetivos.push(newObj);
      } else {
        const obj = objetivos.find(o => o.id === editingObjetivoId);
        if (obj) {
          obj.title = title;
          obj.colorIndex = objetivoColorIndex;
          obj.customColor = objetivoCustomColor || null;
          // Si tiene sub-objetivos, las fechas son automáticas (se descartan las manuales)
          if (goalHasChildren(obj)) {
            obj.startDate = null;
            obj.endDate = null;
            obj.durationDays = null;
          } else {
            obj.startDate = startVal;
            obj.durationDays = durDays;
            obj.endDate = endVal;
          }
          obj.description = descVal;
          obj.status = statusVal;
        }
      }
    }

    modal.classList.add('hidden');
    renderObjetivos();
    await saveObjetivosToStorage();
  });

  cancelBtn.addEventListener('click', () => {
    modal.classList.add('hidden');
  });

  deleteBtn.addEventListener('click', async () => {
    if (editingObjetivoId !== null) {
      if (editingParentGoalId) {
        const parentData = findGoalByIdRecursive(objetivos, editingParentGoalId);
        const parent = parentData ? parentData.node : null;
        if (parent && parent.subgoals) {
          parent.subgoals = parent.subgoals.filter(s => s.id !== editingObjetivoId);
        }
      } else {
        objetivos = objetivos.filter(o => o.id !== editingObjetivoId);
      }
      modal.classList.add('hidden');
      renderObjetivos();
      await saveObjetivosToStorage();
    }
  });

  // Escuchar cambios de fecha para actualizar restricciones min/max
  startInput.addEventListener('change', updateObjetivoDateConstraints);
  startInput.addEventListener('input', updateObjetivoDateConstraints);
  endInput.addEventListener('change', updateObjetivoDateConstraints);
  endInput.addEventListener('input', updateObjetivoDateConstraints);

  // Limpiar fechas manualmente
  startClearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    startInput.value = '';
    updateDateOverlay(startInput);
    updateObjetivoDateConstraints();
  });

  endClearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    endInput.value = '';
    updateDateOverlay(endInput);
    updateObjetivoDateConstraints();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveBtn.click();
    }
  });

  // Selector de color de objetivos: abrir/cerrar el desplegable
  const colorTrigger = document.getElementById('objetivo-color-trigger');
  const colorDropdown = document.getElementById('objetivo-color-dropdown');
  if (colorTrigger) {
    colorTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleObjetivoColorDropdown();
    });
  }
  if (colorDropdown) {
    colorDropdown.addEventListener('click', (e) => e.stopPropagation());
  }
  // Cerrar el desplegable al hacer click fuera
  document.addEventListener('click', () => toggleObjetivoColorDropdown(false));

  // Sliders del color personalizado HSL
  ['objetivo-hsl-h', 'objetivo-hsl-s', 'objetivo-hsl-l'].forEach(sid => {
    const el = document.getElementById(sid);
    if (el) el.addEventListener('input', updateObjetivoHslPreview);
  });

  // El scroll vertical ahora es comun (objetivos-body): lista y barras se
  // mueven juntas por CSS, sin necesidad de re-renderizar el Gantt al scrollear.
  // Solo recalculamos al redimensionar (mas abajo).
  if (!window.__ganttResizeBound) {
    window.__ganttResizeBound = true;
    let rt = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (typeof renderGanttChart === 'function') renderGanttChart();
      }, 100);
    });
  }

  // Boton '+ Añadir' fijo (crea objetivo de primer grado)
  const addFixedBtn = document.getElementById('objetivos-add-btn');
  if (addFixedBtn && !addFixedBtn.dataset.bound) {
    addFixedBtn.dataset.bound = '1';
    addFixedBtn.addEventListener('click', () => openObjetivoModal(null, 1));
  }

  // --- Filtro de ESTADO (boton desplegable) ---
  const estadoBtn = document.getElementById('objetivos-estado-btn');
  const estadoDropdown = document.getElementById('objetivos-estado-dropdown');
  const estadoCurrent = document.getElementById('objetivos-estado-current');
  if (estadoBtn && estadoDropdown && !estadoBtn.dataset.bound) {
    estadoBtn.dataset.bound = '1';
    const refreshSelected = () => {
      estadoDropdown.querySelectorAll('.objetivos-estado-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.status === objetivosStatusFilter);
      });
    };
    estadoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const willShow = estadoDropdown.classList.contains('hidden');
      if (willShow) refreshSelected();
      estadoDropdown.classList.toggle('hidden');
    });
    estadoDropdown.addEventListener('click', (e) => {
      const opt = e.target.closest('.objetivos-estado-option');
      if (!opt) return;
      e.stopPropagation();
      objetivosStatusFilter = opt.dataset.status || 'todos';
      if (estadoCurrent) estadoCurrent.textContent = OBJ_STATUS_LABELS[objetivosStatusFilter] || 'Todos';
      estadoDropdown.classList.add('hidden');
      renderObjetivos();
    });
    document.addEventListener('click', () => estadoDropdown.classList.add('hidden'));
  }

  // Ctrl + rueda sobre el Gantt: desplazar horizontalmente por la línea de tiempo
  ensureGanttWheelBound();
}

// Monta (una sola vez) el handler de Ctrl + rueda sobre el Gantt.
function ensureGanttWheelBound() {
  const ganttEl = document.getElementById('objetivos-gantt');
  if (!ganttEl || ganttEl.dataset.ganttWheelBound) return;
  ganttEl.dataset.ganttWheelBound = '1';
  ganttEl.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return; // sin Ctrl, comportamiento normal
    e.preventDefault(); // evita el zoom del navegador
    const rowsEl = document.getElementById('gantt-rows');
    const viewportWidth = rowsEl ? rowsEl.getBoundingClientRect().width : 0;
    const maxScroll = Math.max(0, ganttContentWidth - viewportWidth);
    if (maxScroll <= 0) return; // nada que desplazar
    // Usar el delta dominante (rueda vertical u horizontal)
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    ganttScrollX += delta;
    if (ganttScrollX < 0) ganttScrollX = 0;
    if (ganttScrollX > maxScroll) ganttScrollX = maxScroll;
    applyGanttScroll();
  }, { passive: false });
}

// ─── Helpers de jerarquía para el drag & drop de objetivos ──────────────────
// Profundidad relativa de un subárbol: 0 si es hoja, 1 si tiene hijos hoja,
// etc. Sirve para validar el límite de 4 grados: un nodo soltado en el grado G
// solo cabe si G + profundidad(subárbol) <= 4 (MAX_GOAL_LEVEL).
const MAX_GOAL_LEVEL = 4;

function getGoalSubtreeDepth(obj) {
  if (!obj || !obj.subgoals || obj.subgoals.length === 0) return 0;
  let max = 0;
  for (const sub of obj.subgoals) {
    const d = getGoalSubtreeDepth(sub);
    if (d + 1 > max) max = d + 1;
  }
  return max;
}

// ¿`ancestorId` es el propio nodo o un ancestro de `nodeId`? Se usa para impedir
// soltar un objetivo dentro de sí mismo o de su propio subárbol.
function isGoalSelfOrDescendant(rootList, ancestorId, nodeId) {
  if (ancestorId === nodeId) return true;
  const found = findGoalByIdRecursive(rootList, ancestorId);
  if (!found) return false;
  const node = found.node;
  if (!node.subgoals) return false;
  const walk = (list) => {
    for (const n of list) {
      if (n.id === nodeId) return true;
      if (n.subgoals && walk(n.subgoals)) return true;
    }
    return false;
  };
  return walk(node.subgoals);
}

// Quita un nodo (por id) de donde esté en el árbol y lo devuelve. Si su antiguo
// padre se queda sin hijos, vuelve a ser hoja (subgoals = []).
function detachGoalById(id) {
  // Primer grado
  const rootIdx = objetivos.findIndex(o => o.id === id);
  if (rootIdx !== -1) {
    return objetivos.splice(rootIdx, 1)[0];
  }
  // Recursivo dentro de subgoals
  const rec = (list) => {
    for (const node of list) {
      if (node.subgoals && node.subgoals.length) {
        const i = node.subgoals.findIndex(s => s.id === id);
        if (i !== -1) {
          const removed = node.subgoals.splice(i, 1)[0];
          // El padre que se queda sin hijos vuelve a ser hoja.
          if (node.subgoals.length === 0) node.subgoals = [];
          return removed;
        }
        const deeper = rec(node.subgoals);
        if (deeper) return deeper;
      }
    }
    return null;
  };
  return rec(objetivos);
}

// Inserta `node` como hijo de `parentId` (o en primer grado si parentId es null)
// en la posición `index`. Si el padre destino era hoja, descarta sus fechas
// manuales (un padre tiene fechas calculadas, no propias).
function insertGoalNode(node, parentId, index) {
  if (parentId === null) {
    const i = Math.max(0, Math.min(index, objetivos.length));
    objetivos.splice(i, 0, node);
    return;
  }
  const found = findGoalByIdRecursive(objetivos, parentId);
  if (!found) {
    // Salvaguarda: si no se encuentra el padre, va a primer grado.
    objetivos.push(node);
    return;
  }
  const parent = found.node;
  if (!parent.subgoals) parent.subgoals = [];
  // El padre pasa de hoja a contenedor: sus fechas/duración pasan a calcularse.
  if (parent.subgoals.length === 0) {
    parent.startDate = null;
    parent.endDate = null;
    parent.durationDays = null;
  }
  const i = Math.max(0, Math.min(index, parent.subgoals.length));
  parent.subgoals.splice(i, 0, node);
}

function setupObjetivosDragAndDrop(container) {
  let dragItem = null;
  let dragGoalId = null;
  let ghost = null;
  let offsetY = 0;
  let touchTimer = null;
  let touchDragging = false;

  // Destino calculado actual del drop: { parentId, index, level } o null.
  let currentDropTarget = null;

  let lastClientY = null;
  let scrollInterval = null;
  let scrollSpeed = 0;

  function stopAutoScroll() {
    if (scrollInterval) {
      clearInterval(scrollInterval);
      scrollInterval = null;
    }
  }

  function handleAutoScroll(clientY) {
    const rect = container.getBoundingClientRect();
    const EDGE = 35;
    const MAX_SPEED = 8;
    
    let speed = 0;
    if (clientY < rect.top + EDGE) {
      const intensity = Math.min(1, (rect.top + EDGE - clientY) / EDGE);
      speed = -MAX_SPEED * intensity;
    } else if (clientY > rect.bottom - EDGE) {
      const intensity = Math.min(1, (clientY - (rect.bottom - EDGE)) / EDGE);
      speed = MAX_SPEED * intensity;
    }

    if (speed === 0) {
      stopAutoScroll();
      return;
    }

    scrollSpeed = speed;

    if (!scrollInterval) {
      scrollInterval = setInterval(() => {
        container.scrollTop += scrollSpeed;
        if (lastClientY !== null) {
          updateObjetivosDragIndicator(lastClientY);
        }
      }, 16);
    }
  }

  // ── Línea guía (drop-line) reutilizable, posicionada con indentación ───────
  // En lugar de marcar before/after sobre un hermano (lo anterior), usamos un
  // único elemento absoluto cuya posición vertical Y horizontal (indentación)
  // refleja el HUECO y el GRADO destino. Así se ve a qué nivel caería, como en
  // los editores de árbol.
  let dropLine = null;
  function getDropLine() {
    if (!dropLine) {
      dropLine = document.createElement('div');
      dropLine.className = 'objetivo-drop-line';
      container.appendChild(dropLine);
    }
    return dropLine;
  }

  function clearObjetivosIndicators() {
    if (dropLine) dropLine.style.display = 'none';
    currentDropTarget = null;
  }

  // Construye, en orden vertical, la lista de filas visibles del árbol con su
  // metadato (id, nivel, rect del .objetivo-item, si es padre desplegado, y si
  // pertenece al arrastrado/su subárbol). Por defecto NO excluye nada: incluye
  // TODAS las filas visibles (el arrastrado sigue ocupando espacio en pantalla),
  // marcándolas con `isDragged`. Así un mismo recorrido sirve para posicionar la
  // línea (huecos físicamente adyacentes) y para decidir el destino (saltando
  // las filas marcadas isDragged).
  function getVisibleRows() {
    const rows = [];
    const all = container.querySelectorAll('.objetivo-container');
    all.forEach(cont => {
      const id = cont.dataset.goalId;
      const itemEl = cont.querySelector(':scope > .objetivo-item');
      if (!itemEl) return;
      // ¿Está visible? Oculto si algún ancestro es una sublista colapsada.
      const hiddenAncestor = cont.parentElement
        ? cont.parentElement.closest('.objetivo-subgoals-list.hidden')
        : null;
      if (hiddenAncestor && container.contains(hiddenAncestor)) return;
      // Nivel a partir de la clase de grado.
      let level = 1;
      if (cont.classList.contains('segundo-grado')) level = 2;
      else if (cont.classList.contains('tercer-grado')) level = 3;
      else if (cont.classList.contains('cuarto-grado')) level = 4;
      const isDragged = !!(dragGoalId && isGoalSelfOrDescendant(objetivos, dragGoalId, id));
      const isExpandedParent = cont.querySelector(':scope > .objetivo-subgoals-list:not(.hidden)') !== null
        && (() => {
          const f = findGoalByIdRecursive(objetivos, id);
          return f && goalHasChildren(f.node);
        })();
      rows.push({ id, level, el: cont, itemEl, rect: itemEl.getBoundingClientRect(), isExpandedParent, isDragged });
    });
    return rows;
  }

  // Profundidad del subárbol arrastrado (para el límite de 4 grados).
  function draggedSubtreeDepth() {
    const f = findGoalByIdRecursive(objetivos, dragGoalId);
    return f ? getGoalSubtreeDepth(f.node) : 0;
  }

  // Dado un punto Y, calcula el HUECO destino y, a partir del nivel más profundo
  // visible alrededor de ese hueco, determina padre, índice y grado destino.
  // Devuelve también la posición de la línea guía. null si no hay destino válido.
  //
  // CLAVE: el hueco se elige sobre TODAS las filas visibles (incluido el
  // arrastrado, que sigue ocupando espacio), de modo que `visualPrev`/`visualNext`
  // son filas físicamente ADYACENTES y la línea cae en el punto medio real entre
  // sus rectángulos. Para el DESTINO lógico se usan `prev`/`next`, que son las
  // filas adyacentes IGNORANDO el arrastrado y su subárbol (no se puede soltar
  // dentro de sí mismo). Separar ambos evita el desfase de ±la altura de la fila
  // arrastrada que se veía antes.
  //
  // Reglas (acordadas):
  //  · El grado lo da SOLO la posición vertical: el hueco toma el nivel más
  //    profundo visible en ese punto.
  //  · Entre un padre desplegado y su primer hijo → primer hijo de ese padre.
  //  · Al final de un sub-bloque → último hijo de ese sub-bloque.
  //  · Arriba del primer objetivo / debajo de un nodo de nivel alto → ese nivel.
  //  · Límite 4 grados: si el subárbol no cabe, se RECHAZA (devuelve null).
  function computeDropTarget(y) {
    // Filas que QUEDARÁN tras soltar (se excluye el arrastrado y su subárbol).
    // Sobre estas se calcula TANTO el hueco visual (dónde va la línea) COMO el
    // destino lógico: así ambos coinciden siempre. El arrastrado se ignora por
    // completo, como si ya no estuviera — es lo que el usuario verá al soltar.
    const rows = getVisibleRows().filter(r => !r.isDragged);
    if (rows.length === 0) {
      return { parentId: null, index: objetivos.length, level: 1, lineY: null, lineLevel: 1, lineLeft: null };
    }

    // Elegir el hueco: `prev` = última fila cuyo CENTRO queda por encima del
    // cursor; `next` = la siguiente. Esto define un único hueco entre dos filas
    // (o el extremo superior/inferior).
    let prevIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].rect;
      if (y >= r.top + r.height / 2) prevIdx = i;
      else break;
    }
    const prev = prevIdx >= 0 ? rows[prevIdx] : null;
    const next = rows[prevIdx + 1] || null;

    const depth = draggedSubtreeDepth();
    const maxLevelAllowed = MAX_GOAL_LEVEL - depth;

    let level, parentId, index;
    if (!prev) {
      level = 1; parentId = null; index = 0;
    } else if (prev.isExpandedParent && next && next.level === prev.level + 1) {
      // Entre un padre desplegado y su primer hijo → primer hijo del padre.
      level = prev.level + 1; parentId = prev.id; index = 0;
    } else {
      // El hueco hereda el nivel de la fila anterior (último hijo del bloque o
      // hermano siguiente al mismo nivel).
      level = prev.level;
      const f = findGoalByIdRecursive(objetivos, prev.id);
      parentId = f && f.parent ? f.parent.id : null;
      const siblings = parentId ? findGoalByIdRecursive(objetivos, parentId).node.subgoals : objetivos;
      index = siblings.findIndex(s => s.id === prev.id) + 1;
    }

    // Límite de 4 grados: si no cabe a este nivel, RECHAZAR el destino.
    if (level > maxLevelAllowed) return null;

    // ── Y de la línea: el hueco FÍSICO real bajo el cursor. Se calcula con TODAS
    //    las filas visibles (incluido el arrastrado, que sigue ocupando espacio).
    //    Se elige el HUECO (espacio entre dos filas consecutivas, o los extremos)
    //    cuyo punto medio esté más cerca del cursor. Esto coincide exactamente con
    //    lo que se ve en pantalla y maneja bien que el cursor caiga DENTRO de una
    //    fila o en cualquier hueco, incluido alrededor del elemento arrastrado.
    const visualRows = getVisibleRows(); // todas, en orden vertical
    const gapYs = [];
    if (visualRows.length) {
      gapYs.push(visualRows[0].rect.top - 3); // hueco superior (antes de la 1ª)
      for (let i = 0; i < visualRows.length - 1; i++) {
        gapYs.push((visualRows[i].rect.bottom + visualRows[i + 1].rect.top) / 2);
      }
      gapYs.push(visualRows[visualRows.length - 1].rect.bottom + 3); // hueco inferior
    }
    let lineY = null, bestD = Infinity;
    for (const gy of gapYs) {
      const d = Math.abs(gy - y);
      if (d < bestD) { bestD = d; lineY = gy; }
    }

    // ── X (indentación): borde izquierdo de una fila real del nivel destino.
    let lineLeft = null;
    const atLevel = rows.find(r => r.level === level);
    if (atLevel) lineLeft = atLevel.rect.left;
    else if (next) lineLeft = next.rect.left;
    else if (prev) lineLeft = prev.rect.left;

    return { parentId, index, level, lineY, lineLevel: level, lineLeft, prevId: prev ? prev.id : null };
  }

  // Indentación de respaldo (solo si no hay una fila real del nivel destino de
  // la que medir el borde izquierdo): base 12px + 32px por nivel extra.
  function levelIndentPx(level) {
    return 12 + (level - 1) * 32;
  }

  function updateObjetivosDragIndicator(y) {
    if (!dragItem) return;
    const target = computeDropTarget(y);
    currentDropTarget = target;

    const line = getDropLine();
    if (!target || target.lineY === null) {
      // Sin destino válido (p.ej. excede el límite de grados): ocultar guía.
      line.style.display = 'none';
      return;
    }

    // La línea es position:absolute, así que su top/left CSS se miden desde su
    // offsetParent (el ancestro posicionado más cercano), NO desde el viewport.
    // target.lineY/lineLeft vienen de getBoundingClientRect (coords de viewport).
    // Para convertir viewport → coordenadas del offsetParent restamos el rect del
    // offsetParent. Esto es robusto ante scroll de cualquier ancestro: ambos
    // rects están en el mismo sistema (viewport) en el mismo frame, y su resta
    // da la posición correcta dentro del offsetParent. Hacer la línea visible
    // ANTES de leer su offsetParent garantiza que offsetParent no sea null.
    line.style.display = 'block';
    const op = line.offsetParent || container;
    const opRect = op.getBoundingClientRect();
    // Restamos también el borde del offsetParent: offsetTop/left se miden desde
    // el borde interior (padding-box), y getBoundingClientRect incluye el borde.
    const opStyle = getComputedStyle(op);
    const borderTop = parseFloat(opStyle.borderTopWidth) || 0;
    const borderLeft = parseFloat(opStyle.borderLeftWidth) || 0;

    const top = target.lineY - opRect.top - borderTop;
    const left = (target.lineLeft !== null && target.lineLeft !== undefined)
      ? (target.lineLeft - opRect.left - borderLeft)
      : levelIndentPx(target.lineLevel);
    line.style.top = top + 'px';
    line.style.left = left + 'px';
    line.style.right = '6px';
  }

  // Aplica el destino calculado al MODELO de árbol (mover de padre + reordenar),
  // respetando el subárbol del arrastrado. Sustituye al antiguo commitOrder.
  function commitDrop() {
    if (!currentDropTarget) return;
    const { parentId, index } = currentDropTarget;
    // Seguridad extra: no soltar dentro de sí mismo o su subárbol.
    if (parentId && isGoalSelfOrDescendant(objetivos, dragGoalId, parentId)) return;

    // Posición original del nodo (su padre actual y su índice entre hermanos),
    // para corregir el índice de inserción si origen y destino comparten lista.
    const orig = findGoalByIdRecursive(objetivos, dragGoalId);
    const origParentId = orig && orig.parent ? orig.parent.id : null;
    const origSiblings = origParentId
      ? findGoalByIdRecursive(objetivos, origParentId).node.subgoals
      : objetivos;
    const origIndex = origSiblings.findIndex(s => s.id === dragGoalId);

    const node = detachGoalById(dragGoalId);
    if (!node) return;

    // Si el nodo se mueve dentro de la MISMA lista y estaba antes del punto de
    // inserción, al quitarlo todos los posteriores se corren una posición: hay
    // que restar 1 al índice destino para que caiga donde el usuario lo ve.
    let insertIndex = index;
    const sameList = (parentId === origParentId);
    if (sameList && origIndex !== -1 && origIndex < index) {
      insertIndex = index - 1;
    }

    insertGoalNode(node, parentId, insertIndex);
    saveObjetivosToStorage();
  }

  container.querySelectorAll('.objetivo-container').forEach(item => {
    item.setAttribute('draggable', 'true');
    item.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      const closestContainer = e.target.closest('.objetivo-container');
      if (closestContainer !== item) {
        return;
      }
      // Cancelar el arrastre si se inicia en el propio contenedor de subobjetivos (como en el botón "+ Añadir")
      if (e.target.closest('.objetivo-subgoals-list') && e.target.closest('.objetivo-subgoals-list').parentElement === item) {
        e.preventDefault();
        return;
      }
      dragItem = item;
      dragGoalId = item.dataset.goalId;
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragGoalId); } catch (err) {}
    });
    
    item.addEventListener('dragend', () => {
      if (dragItem) dragItem.classList.remove('dragging');
      clearObjetivosIndicators();
      if (dropLine) { dropLine.remove(); dropLine = null; }
      stopAutoScroll();
      dragItem = null;
      dragGoalId = null;
      lastClientY = null;
    });

    // Touch events para dispositivos móviles
    item.addEventListener('touchstart', (e) => {
      const closestContainer = e.target.closest('.objetivo-container');
      if (closestContainer !== item) {
        return;
      }
      if (e.target.closest('.objetivo-subgoals-list') && e.target.closest('.objetivo-subgoals-list').parentElement === item) {
        return;
      }
      const touch = e.touches[0];
      touchTimer = setTimeout(() => {
        touchDragging = true;
        dragItem = item;
        dragGoalId = item.dataset.goalId;
        item.classList.add('dragging');
        if (navigator.vibrate) navigator.vibrate(40);
        const r = item.getBoundingClientRect();
        offsetY = touch.clientY - r.top;
        ghost = item.cloneNode(true);
        // Eliminar subobjetivos del fantasma para un arrastre compacto
        const ghostSublist = ghost.querySelector('.objetivo-subgoals-list');
        if (ghostSublist) ghostSublist.remove();

        ghost.classList.add('objetivo-drag-ghost');
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

    item.addEventListener('touchmove', (e) => {
      if (!touchDragging) {
        if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
        return;
      }
      e.preventDefault();
      const touch = e.touches[0];
      if (ghost) ghost.style.top = (touch.clientY - offsetY) + 'px';
      lastClientY = touch.clientY;
      updateObjetivosDragIndicator(touch.clientY);
      handleAutoScroll(touch.clientY);
    }, { passive: false });

    const endTouch = () => {
      if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
      stopAutoScroll();
      lastClientY = null;
      if (touchDragging) {
        if (ghost) { ghost.remove(); ghost = null; }
        if (dragItem) {
          dragItem.style.opacity = '';
          dragItem.classList.remove('dragging');
        }
        const hadTarget = !!currentDropTarget;
        commitDrop();
        clearObjetivosIndicators();
        if (dropLine) { dropLine.remove(); dropLine = null; }
        touchDragging = false;
        dragItem = null;
        dragGoalId = null;
        if (hadTarget) renderObjetivos();
      }
    };

    item.addEventListener('touchend', endTouch);
    item.addEventListener('touchcancel', endTouch);

    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  });

  container.addEventListener('dragover', (e) => {
    if (!dragItem) return;
    e.preventDefault();
    lastClientY = e.clientY;
    updateObjetivosDragIndicator(e.clientY);
    handleAutoScroll(e.clientY);
  });

  container.addEventListener('dragleave', (e) => {
    if (container.contains(e.relatedTarget)) return;
    clearObjetivosIndicators();
    stopAutoScroll();
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    stopAutoScroll();
    if (!dragItem) return;

    const hadTarget = !!currentDropTarget;
    commitDrop();
    clearObjetivosIndicators();
    if (dropLine) { dropLine.remove(); dropLine = null; }
    if (dragItem) dragItem.classList.remove('dragging');
    dragItem = null;
    dragGoalId = null;
    lastClientY = null;
    // Re-render para reflejar la nueva jerarquía en el DOM.
    if (hadTarget) renderObjetivos();
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


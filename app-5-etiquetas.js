// ─── Reordenar etiquetas: arrastrar y soltar (raton + tactil) ────────────────
function setupTagDragAndDrop(container) {
  let dragItem = null;      // .tag-item que se arrastra
  let dragTagId = null;
  let ghost = null;         // clon flotante (solo tactil)
  let offsetY = 0;
  let touchTimer = null;
  let touchDragging = false;

  let lastIndicatorEl = null;
  let lastIndicatorClass = null;

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
    const EDGE = 35; // px cerca del borde para activar scroll
    const MAX_SPEED = 8; // px por tick (16ms)
    
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
          updateTagDragIndicator(lastClientY);
        }
      }, 16);
    }
  }

  const items = () => [...container.querySelectorAll('.tag-item')];

  function clearTagIndicators() {
    container.querySelectorAll('.tag-item').forEach(el => {
      el.classList.remove('drag-before-indicator', 'drag-after-indicator');
    });
    lastIndicatorEl = null;
    lastIndicatorClass = null;
  }

  function updateTagDragIndicator(y) {
    if (!dragItem) return;
    const others = items().filter(el => el !== dragItem);
    if (others.length === 0) return;

    let targetEl = null;
    let targetClass = '';

    // Buscar el primer elemento cuyo centro esté por debajo de la coordenada y
    for (const el of others) {
      if (el.dataset.tagId === 'default') continue; // por defecto siempre va primera
      const r = el.getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        targetEl = el;
        targetClass = 'drag-before-indicator';
        break;
      }
    }

    // Si no encontramos ninguno, significa que la Y del cursor está por debajo
    // del centro de todas las etiquetas de la lista. En ese caso, la posición de soltado
    // será después de la última etiqueta de la lista.
    if (!targetEl) {
      targetEl = others[others.length - 1];
      targetClass = 'drag-after-indicator';
    }

    if (lastIndicatorEl === targetEl && lastIndicatorClass === targetClass) {
      return;
    }

    clearTagIndicators();

    if (targetEl) {
      targetEl.classList.add(targetClass);
    }
    lastIndicatorEl = targetEl;
    lastIndicatorClass = targetClass;
  }

  function commitOrder() {
    const orderedIds = items().map(el => el.dataset.tagId);
    tags.sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
    // Garantia: 'default' (Por defecto) siempre primera.
    tags.sort((a, b) => (a.id === 'default' ? -1 : 0) - (b.id === 'default' ? -1 : 0));
    saveTagsToStorage();
    buildTagSelectorOptions();
  }

  container.querySelectorAll('.tag-item-draggable').forEach(item => {
    // ----- Raton (escritorio): HTML5 drag -----
    item.setAttribute('draggable', 'true');
    item.addEventListener('dragstart', (e) => {
      if (e.target.closest('.tag-actions')) {
        e.preventDefault();
        return;
      }
      dragItem = item; dragTagId = item.dataset.tagId;
      item.classList.add('tag-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragTagId); } catch (err) {}
    });
    item.addEventListener('dragend', () => {
      if (dragItem) dragItem.classList.remove('tag-dragging');
      clearTagIndicators();
      stopAutoScroll();
      dragItem = null; dragTagId = null;
      lastClientY = null;
    });

    // ----- Tactil (movil): long-press para arrastrar -----
    item.addEventListener('touchstart', (e) => {
      if (e.target.closest('.tag-actions')) {
        return;
      }
      const touch = e.touches[0];
      touchTimer = setTimeout(() => {
        touchDragging = true;
        dragItem = item; dragTagId = item.dataset.tagId;
        item.classList.add('tag-dragging');
        if (navigator.vibrate) navigator.vibrate(40);
        const r = item.getBoundingClientRect();
        offsetY = touch.clientY - r.top;
        ghost = item.cloneNode(true);
        ghost.classList.add('tag-drag-ghost');
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
      if (!touchDragging) { if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; } return; }
      e.preventDefault();
      const touch = e.touches[0];
      if (ghost) ghost.style.top = (touch.clientY - offsetY) + 'px';
      lastClientY = touch.clientY;
      updateTagDragIndicator(touch.clientY);
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
          dragItem.classList.remove('tag-dragging');
          // Colocar el elemento según el indicador activo
          if (lastIndicatorEl) {
            if (lastIndicatorClass === 'drag-before-indicator') {
              container.insertBefore(dragItem, lastIndicatorEl);
            } else if (lastIndicatorClass === 'drag-after-indicator') {
              container.insertBefore(dragItem, lastIndicatorEl.nextSibling);
            }
          }
        }
        clearTagIndicators();
        commitOrder();
        touchDragging = false; dragItem = null; dragTagId = null;
      }
    };
    item.addEventListener('touchend', endTouch);
    item.addEventListener('touchcancel', endTouch);

    // Evitar que mantener presionado el item abra el menú contextual del navegador
    item.addEventListener('contextmenu', (e) => {
      if (!e.target.closest('.tag-actions')) {
        e.preventDefault();
      }
    });
  });

  // Reordenamiento por línea indicadora mientras se arrastra con ratón
  container.addEventListener('dragover', (e) => {
    if (!dragItem) return;
    e.preventDefault();
    lastClientY = e.clientY;
    updateTagDragIndicator(e.clientY);
    handleAutoScroll(e.clientY);
  });

  container.addEventListener('dragleave', (e) => {
    if (container.contains(e.relatedTarget)) return;
    clearTagIndicators();
    stopAutoScroll();
  });

  container.addEventListener('drop', (e) => {
    e.preventDefault();
    stopAutoScroll();
    if (!dragItem) return;

    if (lastIndicatorEl) {
      if (lastIndicatorClass === 'drag-before-indicator') {
        container.insertBefore(dragItem, lastIndicatorEl);
      } else if (lastIndicatorClass === 'drag-after-indicator') {
        container.insertBefore(dragItem, lastIndicatorEl.nextSibling);
      }
    }
    clearTagIndicators();
    commitOrder();
  });
}

function buildColorPalette() {
  const container = document.querySelector('.color-palette-grid');
  container.innerHTML = '';

  DEFAULT_COLORS.forEach((color, idx) => {
    const circle = document.createElement('div');
    circle.className = 'color-circle';
    circle.style.backgroundColor = color.bg;
    circle.style.borderColor = color.border;
    circle.dataset.index = idx;

    if (idx === selectedColorIndex && !customColor) {
      circle.classList.add('selected');
    }

    circle.addEventListener('click', () => {
      document.querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));
      circle.classList.add('selected');
      selectedColorIndex = idx;
      customColor = null;
      hideHslPicker();
    });

    container.appendChild(circle);
  });

  // Boton '+' (circulo negro) para definir un color personalizado HSL
  const addBtn = document.createElement('div');
  addBtn.className = 'color-circle color-circle-add';
  addBtn.title = 'Color personalizado';
  addBtn.innerHTML = '<span class="color-add-plus">+</span>';
  if (customColor) addBtn.classList.add('selected');
  addBtn.addEventListener('click', () => {
    // Punto de partida del color personalizado: el último color que estaba
    // seleccionado antes de presionar este botón (paleta o personalizado previo).
    let startBg = null;
    if (customColor) {
      startBg = customColor.bg;
    } else if (selectedColorIndex >= 0 && DEFAULT_COLORS[selectedColorIndex]) {
      startBg = DEFAULT_COLORS[selectedColorIndex].bg;
    }
    if (startBg) {
      const [h, s, l] = hexToHsl(startBg);
      const hEl = document.getElementById('hsl-h'), sEl = document.getElementById('hsl-s'), lEl = document.getElementById('hsl-l');
      if (hEl) hEl.value = h;
      if (sEl) sEl.value = s;
      if (lEl) lEl.value = l;
    }
    document.querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));
    addBtn.classList.add('selected');
    selectedColorIndex = -1;
    showHslPicker();
  });
  container.appendChild(addBtn);
}

// ─── Selector de color personalizado (HSL) ───────────────────────────────────
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = x => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function updateHslPreview() {
  const h = +document.getElementById('hsl-h').value;
  const s = +document.getElementById('hsl-s').value;
  const l = +document.getElementById('hsl-l').value;
  const hex = hslToHex(h, s, l);
  customColor = { bg: hex, text: '#ffffff', border: hex };
  const prev = document.getElementById('hsl-preview');
  const val = document.getElementById('hsl-value');
  if (prev) prev.style.backgroundColor = hex;
  if (val) val.textContent = `${hex.toUpperCase()}  (H ${h}, S ${s}, L ${l})`;
}

function showHslPicker() {
  const picker = document.getElementById('hsl-picker');
  if (picker) picker.classList.remove('hidden');
  updateHslPreview();
}

function hideHslPicker() {
  const picker = document.getElementById('hsl-picker');
  if (picker) picker.classList.add('hidden');
}

// ─── Categorización automática: palabras clave por actividad ───────────────
// Normaliza un texto para comparar: minúsculas, sin acentos, espacios colapsados.
function normalizeForKeyword(text) {
  return (text || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita diacríticos (acentos)
    .replace(/\s+/g, ' ')
    .trim();
}

// Estado temporal de las palabras clave que se están editando en el modal de
// actividad. Es un array de strings (tal cual las escribió el usuario).
let editingTagKeywords = [];

// Pinta los chips de palabras clave en el modal de actividad a partir de
// editingTagKeywords.
function renderKeywordChips() {
  const container = document.getElementById('tag-keywords-chips');
  if (!container) return;
  container.innerHTML = '';
  editingTagKeywords.forEach((kw, idx) => {
    const chip = document.createElement('div');
    chip.className = 'keyword-chip';

    const label = document.createElement('span');
    label.textContent = kw;

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'keyword-chip-remove';
    remove.setAttribute('aria-label', `Eliminar palabra clave ${kw}`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      editingTagKeywords.splice(idx, 1);
      renderKeywordChips();
      clearKeywordError();
    });

    chip.append(label, remove);
    container.appendChild(chip);
  });
}

function showKeywordError(msg) {
  const el = document.getElementById('tag-keywords-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function clearKeywordError() {
  const el = document.getElementById('tag-keywords-error');
  if (!el) return;
  el.textContent = '';
  el.classList.add('hidden');
}

// Intenta añadir una palabra clave (desde el input). Devuelve true si se añadió.
function addKeywordFromInput() {
  const input = document.getElementById('tag-keyword-input');
  if (!input) return false;
  const raw = input.value.trim().slice(0, 25);
  if (!raw) return false;

  const norm = normalizeForKeyword(raw);
  // Evitar duplicada dentro de la misma actividad.
  if (editingTagKeywords.some(k => normalizeForKeyword(k) === norm)) {
    input.value = '';
    return false;
  }
  editingTagKeywords.push(raw);
  input.value = '';
  renderKeywordChips();
  clearKeywordError();
  return true;
}

// Devuelve { tagId, tagName, keyword } si alguna palabra clave de OTRA actividad
// coincide con las que se están editando ahora. null si no hay conflicto.
function findKeywordConflict(editId) {
  const editingNorms = editingTagKeywords.map(normalizeForKeyword);
  for (const tag of tags) {
    if (tag.id === editId) continue;
    const existing = Array.isArray(tag.keywords) ? tag.keywords : [];
    for (const kw of existing) {
      const n = normalizeForKeyword(kw);
      if (editingNorms.includes(n)) {
        return { tagId: tag.id, tagName: tag.name, keyword: kw };
      }
    }
  }
  return null;
}

// Auto-categorización: busca la actividad cuya palabra clave esté contenida en
// el título (normalizado, sin mayúsculas ni acentos) y la asigna en el selector
// del modal de tarea / cronómetro. Se llama SOLO cuando el usuario termina de
// editar el título (blur / Enter). Si varias coinciden, gana la palabra clave
// que aparece más a la izquierda en el título; a igual posición, gana la más
// larga. Devuelve el tagId que corresponde, o null si ninguna coincide.
function findTagByKeywordsInText(text) {
  const titleNorm = normalizeForKeyword(text);
  if (!titleNorm) return null;

  let best = null; // { tagId, index, length }
  for (const tag of tags) {
    if (tag.id === 'default') continue;
    const keywords = Array.isArray(tag.keywords) ? tag.keywords : [];
    for (const kw of keywords) {
      const kwNorm = normalizeForKeyword(kw);
      if (!kwNorm) continue;
      const idx = titleNorm.indexOf(kwNorm);
      if (idx === -1) continue;
      if (!best || idx < best.index || (idx === best.index && kwNorm.length > best.length)) {
        best = { tagId: tag.id, index: idx, length: kwNorm.length };
      }
    }
  }
  return best ? best.tagId : null;
}

// Auto-categorización en el modal de creación/edición de tarea.
function autoCategorizeFromTitle() {
  const titleEl = document.getElementById('task-input-title');
  if (!titleEl) return;
  const tagId = findTagByKeywordsInText(titleEl.value);
  if (tagId) setSelectTagValue(tagId);
}

// Auto-categorización en la herramienta cronómetro.
function autoCategorizeTimerFromTitle() {
  const titleEl = document.getElementById('timer-input-title');
  if (!titleEl) return;
  const tagId = findTagByKeywordsInText(titleEl.value);
  if (tagId) {
    setTimerSelectTagValue(tagId);
    if (timerStartTime) saveActiveTimerState();
  }
}

function startEditTag(tag) {
  document.getElementById('tag-edit-id').value = tag.id;
  editingTagKeywords = Array.isArray(tag.keywords) ? [...tag.keywords] : [];
  renderKeywordChips();
  clearKeywordError();
  const nameInput = document.getElementById('tag-input-name');
  nameInput.value = tag.name;
  // La actividad "Por defecto" no permite cambiar su nombre.
  const isDefault = tag.id === 'default';
  nameInput.disabled = isDefault;
  nameInput.title = isDefault ? 'El nombre de la actividad por defecto no se puede cambiar' : '';
  document.getElementById('tag-form-title').textContent = 'Editar actividad';
  document.getElementById('tag-submit-btn').textContent = 'Guardar';

  // Seleccionar el color: de la paleta, o personalizado (HSL)
  const colorIdx = DEFAULT_COLORS.findIndex(c => c.bg === tag.color.bg);
  if (colorIdx !== -1) {
    selectedColorIndex = colorIdx;
    customColor = null;
    buildColorPalette();
    hideHslPicker();
  } else {
    // Color personalizado: activarlo y precargar los sliders con su HSL
    selectedColorIndex = -1;
    customColor = { bg: tag.color.bg, text: tag.color.text || '#ffffff', border: tag.color.border || tag.color.bg };
    buildColorPalette();
    const [h, s, l] = hexToHsl(tag.color.bg);
    const hEl = document.getElementById('hsl-h'), sEl = document.getElementById('hsl-s'), lEl = document.getElementById('hsl-l');
    if (hEl) hEl.value = h;
    if (sEl) sEl.value = s;
    if (lEl) lEl.value = l;
    showHslPicker();
  }

  // Editar en su ventana aparte: cerrar el gestor y abrir el editor.
  openTagEditModal();
}

// Convierte un hex (#rrggbb) a [H, S, L] enteros
function hexToHsl(hex) {
  let r = parseInt(hex.slice(1,3),16)/255;
  let g = parseInt(hex.slice(3,5),16)/255;
  let b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max+min)/2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max) {
      case r: h = (g-b)/d + (g<b?6:0); break;
      case g: h = (b-r)/d + 2; break;
      default: h = (r-g)/d + 4;
    }
    h /= 6;
  }
  return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
}

function resetTagForm() {
  document.getElementById('tag-edit-id').value = '';
  editingTagKeywords = [];
  renderKeywordChips();
  clearKeywordError();
  const kwInput = document.getElementById('tag-keyword-input');
  if (kwInput) kwInput.value = '';
  const nameInput = document.getElementById('tag-input-name');
  nameInput.value = '';
  nameInput.disabled = false;
  nameInput.title = '';
  document.getElementById('tag-form-title').textContent = 'Nueva actividad';
  document.getElementById('tag-submit-btn').textContent = 'Crear';

  selectedColorIndex = 0;
  customColor = null;
  hideHslPicker();
  buildColorPalette();
}

function buildNewTagPromptColorPalette() {
  const container = document.getElementById('new-tag-color-palette-grid');
  if (!container) return;
  container.innerHTML = '';

  DEFAULT_COLORS.forEach((color, idx) => {
    const circle = document.createElement('div');
    circle.className = 'color-circle';
    circle.style.backgroundColor = color.bg;
    circle.style.borderColor = color.border;
    circle.dataset.index = idx;

    if (idx === newTagPromptColorIndex && !newTagPromptCustomColor) {
      circle.classList.add('selected');
    }

    circle.addEventListener('click', () => {
      container.querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));
      circle.classList.add('selected');
      newTagPromptColorIndex = idx;
      newTagPromptCustomColor = null;
      hideNewTagPromptHslPicker();
    });

    container.appendChild(circle);
  });

  // Boton '+' (circulo negro) para definir un color personalizado HSL
  const addBtn = document.createElement('div');
  addBtn.className = 'color-circle color-circle-add';
  addBtn.title = 'Color personalizado';
  addBtn.innerHTML = '<span class="color-add-plus">+</span>';
  if (newTagPromptCustomColor) addBtn.classList.add('selected');
  addBtn.addEventListener('click', () => {
    let startBg = null;
    if (newTagPromptCustomColor) {
      startBg = newTagPromptCustomColor.bg;
    } else if (newTagPromptColorIndex >= 0 && DEFAULT_COLORS[newTagPromptColorIndex]) {
      startBg = DEFAULT_COLORS[newTagPromptColorIndex].bg;
    }
    if (startBg) {
      const [h, s, l] = hexToHsl(startBg);
      const hEl = document.getElementById('new-tag-hsl-h'), sEl = document.getElementById('new-tag-hsl-s'), lEl = document.getElementById('new-tag-hsl-l');
      if (hEl) hEl.value = h;
      if (sEl) sEl.value = s;
      if (lEl) lEl.value = l;
    }
    container.querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));
    addBtn.classList.add('selected');
    newTagPromptColorIndex = -1;
    showNewTagPromptHslPicker();
  });
  container.appendChild(addBtn);
}

function updateNewTagPromptHslPreview() {
  const h = +document.getElementById('new-tag-hsl-h').value;
  const s = +document.getElementById('new-tag-hsl-s').value;
  const l = +document.getElementById('new-tag-hsl-l').value;
  const hex = hslToHex(h, s, l);
  newTagPromptCustomColor = { bg: hex, text: '#ffffff', border: hex };
  const prev = document.getElementById('new-tag-hsl-preview');
  const val = document.getElementById('new-tag-hsl-value');
  if (prev) prev.style.backgroundColor = hex;
  if (val) val.textContent = `${hex.toUpperCase()}  (H ${h}, S ${s}, L ${l})`;
}

function showNewTagPromptHslPicker() {
  const picker = document.getElementById('new-tag-hsl-picker');
  if (picker) picker.classList.remove('hidden');
  updateNewTagPromptHslPreview();
}

function hideNewTagPromptHslPicker() {
  const picker = document.getElementById('new-tag-hsl-picker');
  if (picker) picker.classList.add('hidden');
}

function promptCreateNewTag(name, callback) {
  newTagPromptCallback = callback;
  newTagPromptName = name;
  newTagPromptColorIndex = 0;
  newTagPromptCustomColor = null;

  const displayEl = document.getElementById('new-tag-prompt-name-display');
  if (displayEl) displayEl.textContent = `"${name}"`;

  buildNewTagPromptColorPalette();
  hideNewTagPromptHslPicker();

  const modal = document.getElementById('new-tag-prompt-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeNewTagPromptModal(acceptedTag = null) {
  const modal = document.getElementById('new-tag-prompt-modal');
  if (modal) modal.classList.add('hidden');
  if (newTagPromptCallback) {
    const cb = newTagPromptCallback;
    newTagPromptCallback = null;
    cb(acceptedTag);
  }
}

// Estado temporal del flujo de borrado de etiqueta (con reasignacion)
let pendingDeleteTagId = null;

async function deleteTag(tagId) {
  if (tagId === 'default') return;

  // Contar cuantas tareas tienen esta etiqueta asignada
  const affected = tasks.filter(t => t.tagId === tagId).length;

  if (affected === 0) {
    // No hay tareas: borrar directamente, sin preguntar
    performTagDeletion(tagId, null);
    return;
  }

  // Hay tareas: abrir modal para que el usuario decida que hacer con ellas
  openDeleteTagModal(tagId, affected);
}

function openDeleteTagModal(tagId, affected) {
  pendingDeleteTagId = tagId;
  const tag = tags.find(t => t.id === tagId);
  const tagName = tag ? tag.name : 'esta actividad';

  const msg = document.getElementById('delete-tag-message');
  if (msg) {
    const plural = affected === 1 ? 'tarea tiene' : 'tareas tienen';
    msg.innerHTML = `<strong>${affected}</strong> ${plural} la actividad &laquo;${tagName}&raquo;. ` +
      `Antes de eliminarla, elige qu&eacute; hacer con esas tareas:`;
  }

  // Llenar el selector: opcion de eliminar tareas + cada otra etiqueta como destino
  const select = document.getElementById('delete-tag-reassign-select');
  if (select) {
    select.innerHTML = '';
    // Opcion por defecto: reasignar a 'default'
    tags.filter(t => t.id !== tagId).forEach(t => {
      const opt = document.createElement('option');
      opt.value = 'reassign:' + t.id;
      opt.textContent = 'Reasignar a: ' + t.name;
      select.appendChild(opt);
    });
    // Opcion: eliminar las tareas
    const del = document.createElement('option');
    del.value = 'delete-tasks';
    del.textContent = 'Eliminar tambien esas tareas';
    select.appendChild(del);
  }

  const modal = document.getElementById('delete-tag-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeDeleteTagModal() {
  const modal = document.getElementById('delete-tag-modal');
  if (modal) modal.classList.add('hidden');
  pendingDeleteTagId = null;
}

function confirmDeleteTagModal() {
  if (!pendingDeleteTagId) { closeDeleteTagModal(); return; }
  const select = document.getElementById('delete-tag-reassign-select');
  const choice = select ? select.value : 'reassign:default';
  const tagId = pendingDeleteTagId;

  if (choice === 'delete-tasks') {
    performTagDeletion(tagId, { deleteTasks: true });
  } else if (choice.startsWith('reassign:')) {
    const targetId = choice.slice('reassign:'.length);
    performTagDeletion(tagId, { reassignTo: targetId });
  } else {
    performTagDeletion(tagId, { reassignTo: 'default' });
  }
  closeDeleteTagModal();
}

// Ejecuta el borrado de la etiqueta aplicando la accion elegida sobre las tareas.
//  action === null                  -> no habia tareas (nada que hacer con ellas)
//  action.reassignTo = id           -> mover las tareas a esa etiqueta
//  action.deleteTasks = true        -> eliminar las tareas
function performTagDeletion(tagId, action) {
  pushToUndoStack();

  if (action && action.deleteTasks) {
    tasks = tasks.filter(t => t.tagId !== tagId);
  } else {
    const target = (action && action.reassignTo) ? action.reassignTo : 'default';
    tasks = tasks.map(task =>
      task.tagId === tagId ? { ...task, tagId: target } : task
    );
  }

  tags = tags.filter(t => t.id !== tagId);
  saveTagsToStorage();
  saveTasksToStorage();

  renderTagsList();
  buildTagSelectorOptions();
  renderWeeklyCalendar();
}

function setSelectTagValue(tagId) {
  const hiddenInput = document.getElementById('task-select-tag');
  if (hiddenInput) {
    hiddenInput.value = tagId;
  }
  
  // Update trigger UI
  const tag = tags.find(t => t.id === tagId) || tags.find(t => t.id === 'default');
  const trigger = document.getElementById('tag-select-trigger');
  if (trigger && tag) {
    const circle = trigger.querySelector('.custom-select-color-circle');
    const input = document.getElementById('tag-select-input');
    if (circle) circle.style.backgroundColor = tag.color.bg;
    if (input) input.value = tag.name;
  }
}

// Filtra las opciones del desplegable según el texto escrito en el input del
// trigger. Devuelve la primera opción visible (útil para seleccionar con Enter).
function filterTagOptions(container, query) {
  const q = (query || '').trim().toLowerCase();
  let first = null;
  container.querySelectorAll('.custom-option').forEach(opt => {
    const name = (opt.dataset.name || '').toLowerCase();
    const match = (!q || name.startsWith(q));
    opt.style.display = match ? '' : 'none';
    if (match && !first) first = opt;
  });
  return first;
}

// Muestra todas las opciones (sin filtro) en el desplegable indicado.
function showAllTagOptions(container) {
  container.querySelectorAll('.custom-option').forEach(opt => { opt.style.display = ''; });
}

function buildTagSelectorOptions() {
  const container = document.getElementById('tag-options-container');
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
      setSelectTagValue(tag.id);
      container.classList.add('hidden');

      // Si el título está vacío, usar el nombre de la actividad seleccionada
      // como título de la tarea. No se aplica con la etiqueta "Por defecto".
      if (tag.id !== 'default') {
        const titleEl = document.getElementById('task-input-title');
        if (titleEl && !titleEl.value.trim()) {
          titleEl.value = tag.name;
          titleEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });

    container.appendChild(option);
  });
  buildTimerTagSelectorOptions();
}

// Opciones del selector de etiqueta del modo "Hábitos" (estadísticas generales).
function buildHabitTagSelectorOptions() {
  const container = document.getElementById('habit-tag-options-container');
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
      setHabitSelectTagValue(tag.id);
      container.classList.add('hidden');
      renderGeneralStatsForRange();
    });

    container.appendChild(option);
  });
}

// Establece la etiqueta seleccionada del modo hábitos y refleja nombre/color.
function setHabitSelectTagValue(tagId) {
  const tag = tags.find(t => t.id === tagId) || tags.find(t => t.id === 'default');
  if (!tag) return;
  generalStatsHabitTag = tag.id;
  const hidden = document.getElementById('habit-select-tag');
  if (hidden) hidden.value = tag.id;
  const input = document.getElementById('habit-tag-select-input');
  if (input) input.value = tag.name;
  const circle = document.getElementById('habit-tag-select-circle');
  if (circle) {
    circle.style.backgroundColor = tag.color.bg;
    circle.style.borderColor = tag.color.border;
  }
}

let habitTagSelectWired = false;
// Muestra u oculta la fila del selector de etiqueta según el tipo de gráfico.
// Al mostrarla, repuebla las opciones, refresca el valor y engancha los listeners
// del buscador la primera vez (las etiquetas y window.setupTagSearchSelect pueden
// no estar disponibles durante el init).
function updateHabitTagRowVisibility() {
  const row = document.getElementById('general-stats-habit-tag-row');
  if (!row) return;
  const visible = (generalStatsChartType === 'habitos' || generalStatsChartType === 'heatmap');
  row.style.display = visible ? 'flex' : 'none';
  // El selector de periodo no aplica al mapa de calor (scroll infinito propio).
  const periodGroup = document.getElementById('general-stats-period-group');
  if (periodGroup) periodGroup.style.display = (generalStatsChartType === 'heatmap') ? 'none' : '';
  if (visible) {
    buildHabitTagSelectorOptions();
    setHabitSelectTagValue(generalStatsHabitTag);
    if (!habitTagSelectWired && typeof window.setupTagSearchSelect === 'function') {
      window.setupTagSearchSelect(
        'habit-tag-select-trigger',
        'habit-tag-select-input',
        'habit-tag-options-container',
        'habit-select-tag',
        (tagId) => { setHabitSelectTagValue(tagId); renderGeneralStatsForRange(); }
      );
      // Botón ✕: borra lo escrito y deja el campo listo para escribir desde 0.
      const clearBtn = document.getElementById('habit-tag-clear');
      const input = document.getElementById('habit-tag-select-input');
      if (clearBtn && input) {
        clearBtn.addEventListener('mousedown', (e) => {
          // mousedown (antes que el blur del input) para no perder el foco.
          e.preventDefault();
          e.stopPropagation();
          input.value = '';
          input.focus();
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
      }
      habitTagSelectWired = true;
    }
  }
}

// --- Custom Date Picker Dropdown ---
let datePickerCurrentMonth = new Date();

function toggleCustomDatePicker() {
  const dropdown = document.getElementById('custom-calendar-dropdown');
  if (!dropdown) return;
  const isHidden = dropdown.classList.contains('hidden');
  if (isHidden) {
    datePickerCurrentMonth = new Date(currentWeekStart);
    renderCustomDatePicker();
    dropdown.classList.remove('hidden');
    document.addEventListener('click', closeDatePickerOnOutsideClick);
  } else {
    dropdown.classList.add('hidden');
    document.removeEventListener('click', closeDatePickerOnOutsideClick);
  }
}

function closeDatePickerOnOutsideClick(e) {
  const dropdown = document.getElementById('custom-calendar-dropdown');
  const trigger = document.getElementById('datepicker-trigger'); // puede no existir
  const label = document.getElementById('week-range-label');
  const outsideTrigger = !trigger || !trigger.contains(e.target);
  if (dropdown && !dropdown.contains(e.target) && outsideTrigger && label && !label.contains(e.target)) {
    dropdown.classList.add('hidden');
    document.removeEventListener('click', closeDatePickerOnOutsideClick);
  }
}

function renderCustomDatePicker() {
  const container = document.getElementById('custom-calendar-days');
  const monthLabel = document.getElementById('custom-calendar-month-year');
  if (!container || !monthLabel) return;

  const year = datePickerCurrentMonth.getFullYear();
  const month = datePickerCurrentMonth.getMonth();

  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  monthLabel.textContent = `${monthNames[month]} ${year}`;

  container.innerHTML = '';

  const firstDay = new Date(year, month, 1);
  let startDay = firstDay.getDay();
  startDay = startDay === 0 ? 6 : startDay - 1; // Mon = 0, Sun = 6

  const totalDays = new Date(year, month + 1, 0).getDate();
  const prevMonthTotalDays = new Date(year, month, 0).getDate();

  const mobileVisibleDate = isMobile()
    ? (cronogramaActive ? (cronogramaMobileDate || new Date()) : (getMobileVisibleDate() || new Date()))
    : null;

  // Prev month padding
  for (let i = startDay - 1; i >= 0; i--) {
    const dayNum = prevMonthTotalDays - i;
    const dayDiv = createDatePickerDayElement(dayNum, new Date(year, month - 1, dayNum), true, mobileVisibleDate);
    container.appendChild(dayDiv);
  }

  // Current month
  for (let i = 1; i <= totalDays; i++) {
    const dayDiv = createDatePickerDayElement(i, new Date(year, month, i), false, mobileVisibleDate);
    container.appendChild(dayDiv);
  }

  // Next month padding
  const remainingCells = 42 - container.children.length;
  for (let i = 1; i <= remainingCells; i++) {
    const dayDiv = createDatePickerDayElement(i, new Date(year, month + 1, i), true, mobileVisibleDate);
    container.appendChild(dayDiv);
  }
}

function createDatePickerDayElement(dayNum, dateObj, isOtherMonth, mobileVisibleDate = null) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'datepicker-day-btn';
  btn.textContent = dayNum;

  if (isOtherMonth) {
    btn.classList.add('other-month');
  }

  if (isMobile()) {
    const visibleDate = mobileVisibleDate || new Date();
    if (dateObj.toDateString() === visibleDate.toDateString()) {
      btn.classList.add('selected-week');
    }
  } else {
    // Check if date lies in [currentWeekStart, currentWeekStart + 6]
    const weekStart = new Date(currentWeekStart);
    weekStart.setHours(0,0,0,0);
    const weekEnd = addDays(weekStart, 6);
    weekEnd.setHours(23,59,59,999);
    
    if (dateObj >= weekStart && dateObj <= weekEnd) {
      btn.classList.add('selected-week');
    }
  }

  const today = new Date();
  if (dateObj.toDateString() === today.toDateString()) {
    btn.classList.add('is-today');
  }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isMobile()) {
      if (cronogramaActive) {
        goToCronogramaMobileDate(dateObj);
      } else {
        jumpMobileFeedToDate(dateObj);
      }
    } else {
      currentWeekStart = getMondayOf(dateObj);
      renderWeeklyCalendar();
    }
    document.getElementById('custom-calendar-dropdown').classList.add('hidden');
    document.removeEventListener('click', closeDatePickerOnOutsideClick);
  });

  return btn;
}

let durationToastTimer = null;
function showDurationToast(msg) {
  let toast = document.getElementById('duration-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'duration-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(durationToastTimer);
  durationToastTimer = setTimeout(() => toast.classList.remove('visible'), 2000);
}

function setupTimeMaskInput(inputEl) {
  if (!inputEl) return;
  inputEl.type = 'text';
  inputEl.classList.add('time-masked-input');
  
  const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const currentVal = originalDescriptor.get.call(inputEl);
  if (!currentVal || currentVal.trim() === '') {
    originalDescriptor.set.call(inputEl, '');
  }
  
  Object.defineProperty(inputEl, 'value', {
    get() {
      const raw = originalDescriptor.get.call(this) || '';
      if (/^\d{2}:\d{2}$/.test(raw)) {
        return raw;
      }
      return '';
    },
    set(val) {
      if (!val) {
        originalDescriptor.set.call(this, '');
      } else {
        if (/^\d{2}:\d{2}$/.test(val)) {
          originalDescriptor.set.call(this, val);
        } else {
          originalDescriptor.set.call(this, '');
        }
      }
    },
    configurable: true
  });
  
  // Limitar escritura y validar dígitos en vivo
  inputEl.addEventListener('keypress', (e) => {
    // Permitir sólo números
    if (!/[0-9]/.test(e.key)) {
      e.preventDefault();
      return;
    }
    
    const rawVal = originalDescriptor.get.call(inputEl) || '';
    const selStart = inputEl.selectionStart;
    const selEnd = inputEl.selectionEnd;
    const colonIdx = rawVal.indexOf(':');

    // Si la selección no está colapsada, dejamos que el navegador actúe de forma estándar (sobrescribiendo la selección)
    if (selStart !== selEnd) {
      return;
    }

    if (colonIdx === 2) {
      e.preventDefault();
      const digit = e.key;

      if (selStart === 0) {
        // Editar primer dígito de la hora
        const newHour = digit + rawVal[1];
        const hVal = parseInt(newHour, 10);
        if (hVal >= 0 && hVal <= 23) {
          const newVal = digit + rawVal.substring(1);
          originalDescriptor.set.call(inputEl, newVal);
          inputEl.setSelectionRange(1, 1);
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else if (selStart === 1) {
        // Editar segundo dígito de la hora
        const newHour = rawVal[0] + digit;
        const hVal = parseInt(newHour, 10);
        if (hVal >= 0 && hVal <= 23) {
          const newVal = rawVal[0] + digit + rawVal.substring(2);
          originalDescriptor.set.call(inputEl, newVal);
          inputEl.setSelectionRange(2, 2);
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else if (selStart === 2 || selStart === 3) {
        // Editar primer dígito de los minutos
        if (rawVal.length === 5) {
          const newMin = digit + rawVal[4];
          const mVal = parseInt(newMin, 10);
          if (mVal >= 0 && mVal <= 59) {
            const newVal = rawVal.substring(0, 3) + digit + rawVal[4];
            originalDescriptor.set.call(inputEl, newVal);
            inputEl.setSelectionRange(4, 4);
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } else if (rawVal.length === 4) {
          // El valor actual es "HH:M" y queremos editar el dígito M (índice 3)
          if (['6', '7', '8', '9'].includes(digit)) {
            const newVal = rawVal.substring(0, 3) + '0' + digit;
            originalDescriptor.set.call(inputEl, newVal);
            inputEl.setSelectionRange(5, 5);
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (['0', '1', '2', '3', '4', '5'].includes(digit)) {
            const newVal = rawVal.substring(0, 3) + digit;
            originalDescriptor.set.call(inputEl, newVal);
            inputEl.setSelectionRange(4, 4);
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } else if (rawVal.length === 3) {
          // El valor actual es "HH:" y queremos escribir el primer dígito del minuto
          if (['6', '7', '8', '9'].includes(digit)) {
            const newVal = rawVal + '0' + digit;
            originalDescriptor.set.call(inputEl, newVal);
            inputEl.setSelectionRange(5, 5);
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          } else if (['0', '1', '2', '3', '4', '5'].includes(digit)) {
            const newVal = rawVal + digit;
            originalDescriptor.set.call(inputEl, newVal);
            inputEl.setSelectionRange(4, 4);
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      } else if (selStart === 4) {
        // Editar segundo dígito de los minutos
        if (rawVal.length === 5) {
          const newMin = rawVal[3] + digit;
          const mVal = parseInt(newMin, 10);
          if (mVal >= 0 && mVal <= 59) {
            const newVal = rawVal.substring(0, 4) + digit;
            originalDescriptor.set.call(inputEl, newVal);
            inputEl.setSelectionRange(5, 5);
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } else if (rawVal.length === 4) {
          const newMin = rawVal[3] + digit;
          const mVal = parseInt(newMin, 10);
          if (mVal >= 0 && mVal <= 59) {
            const newVal = rawVal + digit;
            originalDescriptor.set.call(inputEl, newVal);
            inputEl.setSelectionRange(5, 5);
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      }
      return;
    }

    if (colonIdx === 1) {
      e.preventDefault();
      const digit = e.key;
      if (selStart === 0) {
        // Editar primer dígito de la hora (se convierte en d + d:)
        const newHour = digit + rawVal[0];
        const hVal = parseInt(newHour, 10);
        if (hVal >= 0 && hVal <= 23) {
          const newVal = digit + rawVal;
          originalDescriptor.set.call(inputEl, newVal);
          inputEl.setSelectionRange(2, 2);
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else if (selStart === 1) {
        // Añadir segundo dígito de la hora
        const newHour = rawVal[0] + digit;
        const hVal = parseInt(newHour, 10);
        if (hVal >= 0 && hVal <= 23) {
          const newVal = rawVal[0] + digit + ':';
          originalDescriptor.set.call(inputEl, newVal);
          inputEl.setSelectionRange(3, 3);
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else if (selStart === 2) {
        // Escribir primer dígito de los minutos (autocompletando 0 en las horas)
        if (['6', '7', '8', '9'].includes(digit)) {
          const newVal = '0' + rawVal[0] + ':0' + digit;
          originalDescriptor.set.call(inputEl, newVal);
          inputEl.setSelectionRange(5, 5);
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (['0', '1', '2', '3', '4', '5'].includes(digit)) {
          const newVal = '0' + rawVal[0] + ':' + digit;
          originalDescriptor.set.call(inputEl, newVal);
          inputEl.setSelectionRange(4, 4);
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      return;
    }

    if (colonIdx === 0) {
      e.preventDefault();
      const digit = e.key;
      if (selStart === 0) {
        // Escribir primer dígito de la hora
        if (['3', '4', '5', '6', '7', '8', '9'].includes(digit)) {
          const newVal = '0' + digit + ':';
          originalDescriptor.set.call(inputEl, newVal);
          inputEl.setSelectionRange(3, 3);
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (['0', '1', '2'].includes(digit)) {
          const newVal = digit + ':';
          originalDescriptor.set.call(inputEl, newVal);
          inputEl.setSelectionRange(1, 1);
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else if (selStart === 1) {
        // Escribir primer dígito de los minutos
        if (['6', '7', '8', '9'].includes(digit)) {
          const newVal = '00:0' + digit;
          originalDescriptor.set.call(inputEl, newVal);
          inputEl.setSelectionRange(5, 5);
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (['0', '1', '2', '3', '4', '5'].includes(digit)) {
          const newVal = '00:' + digit;
          originalDescriptor.set.call(inputEl, newVal);
          inputEl.setSelectionRange(4, 4);
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      return;
    }

    // No permitir más de 5 caracteres
    if (rawVal.length >= 5) {
      e.preventDefault();
      return;
    }
    
    // Validar formato de hora en tiempo real
    if (rawVal.length === 0) {
      // Si el usuario empieza escribiendo un número del 3 al 9, se asume que hay un 0 al principio
      if (['3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
        e.preventDefault();
        originalDescriptor.set.call(inputEl, '0' + e.key + ':');
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      } else if (!['0', '1', '2'].includes(e.key)) {
        e.preventDefault();
        return;
      }
    } else if (rawVal.length === 1) {
      // Segundo dígito
      const h1 = rawVal[0];
      if (h1 === '2' && !['0', '1', '2', '3'].includes(e.key)) {
        e.preventDefault();
        return;
      }
    } else if (rawVal.length === 2) {
      // Si el usuario escribe el tercer carácter directamente (los minutos)
      e.preventDefault();
      if (['6', '7', '8', '9'].includes(e.key)) {
        originalDescriptor.set.call(inputEl, rawVal + ':0' + e.key);
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      if (!['0', '1', '2', '3', '4', '5'].includes(e.key)) {
        return;
      }
      originalDescriptor.set.call(inputEl, rawVal + ':' + e.key);
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    } else if (rawVal.length === 3 && rawVal.endsWith(':')) {
      // Primer dígito del minuto
      if (['6', '7', '8', '9'].includes(e.key)) {
        e.preventDefault();
        originalDescriptor.set.call(inputEl, rawVal + '0' + e.key);
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      if (!['0', '1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        return;
      }
    }
  });

  inputEl.addEventListener('keydown', (e) => {
    const isDigit = /^[0-9]$/.test(e.key);
    const isBackspace = e.key === 'Backspace';
    const isDelete = e.key === 'Delete';
    const isTab = e.key === 'Tab';
    const isEnter = e.key === 'Enter';
    
    const rawVal = originalDescriptor.get.call(inputEl) || '';
    const selStart = inputEl.selectionStart;
    const selEnd = inputEl.selectionEnd;
    const colonIdx = rawVal.indexOf(':');
    
    if (isDigit) {
      // Si la hora ya está completamente escrita y el cursor está al final o todo seleccionado, se borra y escribe desde cero
      if (rawVal.length === 5 && /^\d{2}:\d{2}$/.test(rawVal) && (selStart === 5 || (selStart === 0 && selEnd === 5))) {
        originalDescriptor.set.call(inputEl, '');
        // El dígito presionado se insertará nativamente en la primera posición limpia
      }
    } else if (isBackspace || isDelete) {
      if (colonIdx >= 0) {
        if (selStart !== selEnd) {
          // Si la selección contiene al menos parte del colon, lo preservamos
          if (colonIdx >= selStart && colonIdx < selEnd) {
            e.preventDefault();
            const before = rawVal.substring(0, selStart);
            const after = rawVal.substring(selEnd);
            const newVal = before + ':' + after;
            originalDescriptor.set.call(inputEl, newVal);
            const newColonIdx = newVal.indexOf(':');
            inputEl.setSelectionRange(newColonIdx, newColonIdx);
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          }
        } else {
          // Selección vacía (cursor simple)
          if (isBackspace && selStart - 1 === colonIdx) {
            e.preventDefault();
            inputEl.setSelectionRange(colonIdx, colonIdx);
          } else if (isDelete && selStart === colonIdx) {
            e.preventDefault();
            inputEl.setSelectionRange(colonIdx + 1, colonIdx + 1);
          }
        }
      }
    } else if (isTab || isEnter) {
      // Autocompletar hora al confirmar o cambiar de campo o vaciar si es inválido
      let newVal = '';
      if (rawVal.length === 1 && /[0-9]/.test(rawVal)) {
        newVal = '0' + rawVal + ':00';
      } else if (rawVal.length === 2 && /^\d{2}$/.test(rawVal)) {
        newVal = rawVal + ':00';
      } else if (rawVal.length === 3 && /^\d{2}:$/.test(rawVal)) {
        newVal = rawVal + '00';
      } else if (rawVal.length === 4 && /^\d{2}:\d$/.test(rawVal)) {
        newVal = rawVal + '0';
      } else if (/^\d{2}:\d{2}$/.test(rawVal)) {
        newVal = rawVal;
      }
      
      if (newVal !== rawVal) {
        originalDescriptor.set.call(inputEl, newVal);
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  });

  // Agregar el colon ":" de forma automática tras escribir los 2 primeros dígitos de la hora
  inputEl.addEventListener('input', () => {
    const rawVal = originalDescriptor.get.call(inputEl) || '';
    if (rawVal.length === 2 && !rawVal.includes(':')) {
      originalDescriptor.set.call(inputEl, rawVal + ':');
    }
  });

  inputEl.addEventListener('blur', () => {
    const rawVal = originalDescriptor.get.call(inputEl) || '';
    let newVal = '';
    
    if (rawVal.length === 1 && /[0-9]/.test(rawVal)) {
      newVal = '0' + rawVal + ':00';
    } else if (rawVal.length === 2 && /^\d{2}$/.test(rawVal)) {
      newVal = rawVal + ':00';
    } else if (rawVal.length === 3 && /^\d{2}:$/.test(rawVal)) {
      newVal = rawVal + '00';
    } else if (rawVal.length === 4 && /^\d{2}:\d$/.test(rawVal)) {
      newVal = rawVal + '0';
    } else if (/^\d{2}:\d{2}$/.test(rawVal)) {
      newVal = rawVal;
    }
    
    originalDescriptor.set.call(inputEl, newVal);
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

// --- Wire Up Event Listeners ---
// Abre el modal del buscador y reinicia su estado. Reutilizado por el botón
// de escritorio y por el ítem del menú de usuario (móvil).
function openBuscadorModal() {
  document.getElementById('buscador-results').classList.add('hidden');
  document.getElementById('buscador-keyword').value = '';
  document.getElementById('buscador-period').value = 'today';
  document.getElementById('buscador-custom-range').classList.add('hidden');
  document.getElementById('buscador-modal').classList.remove('hidden');
  document.getElementById('buscador-keyword').focus();
}

// --- Cronómetro de Tareas ---
let timerInterval = null;
let timerSeconds = 0;
let timerStartTime = null;
// true solo si el usuario EDITÓ manualmente la hora de inicio. Mientras sea
// false, el contador usa timerStartTime (con segundos reales) y arranca en 0,
// en lugar de la hora HH:MM redondeada del input (que perdería los segundos).
let timerStartEdited = false;

// Duración máxima del cronómetro: 12 horas (en milisegundos / segundos).
const TIMER_MAX_MS = 12 * 60 * 60 * 1000;
const TIMER_MAX_SECONDS = 12 * 60 * 60;


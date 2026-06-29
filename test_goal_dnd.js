// Test harness para la lógica de drag jerárquico de objetivos.
// Reimplementa las funciones puras tal como están en app.js y simula filas
// visibles con rects sintéticos para validar computeDropTarget + el movimiento.

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

function findGoalByIdRecursive(list, id) {
  for (const item of list) {
    if (item.id === id) return { node: item, parent: null };
    if (item.subgoals && item.subgoals.length > 0) {
      const found = findGoalByIdRecursive(item.subgoals, id);
      if (found) return { node: found.node, parent: found.parent || item };
    }
  }
  return null;
}

function goalHasChildren(obj) {
  return !!(obj && obj.subgoals && obj.subgoals.length > 0);
}

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

function detachGoalById(objetivos, id) {
  const rootIdx = objetivos.findIndex(o => o.id === id);
  if (rootIdx !== -1) return objetivos.splice(rootIdx, 1)[0];
  const rec = (list) => {
    for (const node of list) {
      if (node.subgoals && node.subgoals.length) {
        const i = node.subgoals.findIndex(s => s.id === id);
        if (i !== -1) {
          const removed = node.subgoals.splice(i, 1)[0];
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

function insertGoalNode(objetivos, node, parentId, index) {
  if (parentId === null) {
    const i = Math.max(0, Math.min(index, objetivos.length));
    objetivos.splice(i, 0, node);
    return;
  }
  const found = findGoalByIdRecursive(objetivos, parentId);
  if (!found) { objetivos.push(node); return; }
  const parent = found.node;
  if (!parent.subgoals) parent.subgoals = [];
  if (parent.subgoals.length === 0) {
    parent.startDate = null; parent.endDate = null; parent.durationDays = null;
  }
  const i = Math.max(0, Math.min(index, parent.subgoals.length));
  parent.subgoals.splice(i, 0, node);
}

// ── Construir filas visibles a partir del árbol (orden DFS, respetando expand)
function buildVisibleRows(objetivos, expanded, dragGoalId) {
  const rows = [];
  let yCursor = 0;
  const ROW_H = 30;
  const walk = (list, level) => {
    for (const node of list) {
      // saltar arrastrado y subárbol
      const skip = dragGoalId && isGoalSelfOrDescendant(objetivos, dragGoalId, node.id);
      const isExpandedParent = goalHasChildren(node) && expanded.has(node.id);
      if (!skip) {
        rows.push({
          id: node.id, level,
          rect: { top: yCursor, bottom: yCursor + ROW_H, height: ROW_H },
          isExpandedParent
        });
        yCursor += ROW_H;
      }
      if (isExpandedParent && level < 4) {
        walk(node.subgoals, level + 1);
      }
    }
  };
  walk(objetivos, 1);
  return rows;
}

// ── computeDropTarget (copiado de la lógica de app.js, adaptado a rows dadas)
function computeDropTarget(objetivos, rows, dragGoalId, y) {
  if (rows.length === 0) {
    return { parentId: null, index: objetivos.length, level: 1 };
  }
  let prevIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i].rect;
    if (y >= r.top + r.height / 2) prevIdx = i;
    else break;
  }
  const prev = prevIdx >= 0 ? rows[prevIdx] : null;
  const next = rows[prevIdx + 1] || null;

  const f0 = findGoalByIdRecursive(objetivos, dragGoalId);
  const depth = f0 ? getGoalSubtreeDepth(f0.node) : 0;
  const maxLevelAllowed = MAX_GOAL_LEVEL - depth;

  let level, parentId, index;
  if (!prev) {
    level = 1; parentId = null; index = 0;
  } else if (prev.isExpandedParent && next && next.level === prev.level + 1) {
    level = prev.level + 1; parentId = prev.id; index = 0;
  } else {
    level = prev.level;
    const f = findGoalByIdRecursive(objetivos, prev.id);
    parentId = f && f.parent ? f.parent.id : null;
    const siblings = parentId ? findGoalByIdRecursive(objetivos, parentId).node.subgoals : objetivos;
    index = siblings.findIndex(s => s.id === prev.id) + 1;
  }
  if (level > maxLevelAllowed) return null;
  return { parentId, index, level };
}

// ── Ejecutar un drop completo sobre una copia del árbol
function performDrop(objetivos, target, dragGoalId) {
  const orig = findGoalByIdRecursive(objetivos, dragGoalId);
  const origParentId = orig && orig.parent ? orig.parent.id : null;
  const origSiblings = origParentId
    ? findGoalByIdRecursive(objetivos, origParentId).node.subgoals
    : objetivos;
  const origIndex = origSiblings.findIndex(s => s.id === dragGoalId);

  const node = detachGoalById(objetivos, dragGoalId);
  if (!node) return;
  let insertIndex = target.index;
  const sameList = (target.parentId === origParentId);
  if (sameList && origIndex !== -1 && origIndex < target.index) insertIndex = target.index - 1;
  insertGoalNode(objetivos, node, target.parentId, insertIndex);
}

// ── Render textual del árbol para comparar
function renderTree(objetivos) {
  const lines = [];
  const walk = (list, prefix) => {
    list.forEach(n => {
      lines.push(prefix + n.id);
      if (n.subgoals && n.subgoals.length) walk(n.subgoals, prefix + '  ');
    });
  };
  walk(objetivos, '');
  return lines.join('\n');
}

// ════════════════════════════════════════════════════════════════════════════
// ESCENARIOS
// ════════════════════════════════════════════════════════════════════════════
function makeTree() {
  // 1 (desplegado)
  //   1.1 (desplegado)
  //     1.1.1
  //     1.1.2
  //     1.1.3
  //   1.2
  //   1.3
  // 2
  return [
    { id: '1', subgoals: [
      { id: '1.1', subgoals: [
        { id: '1.1.1', subgoals: [] },
        { id: '1.1.2', subgoals: [] },
        { id: '1.1.3', subgoals: [] },
      ]},
      { id: '1.2', subgoals: [] },
      { id: '1.3', subgoals: [] },
    ]},
    { id: '2', subgoals: [] },
  ];
}
const EXPANDED_ALL = new Set(['1', '1.1']);

let passed = 0, failed = 0;
function check(name, got, want) {
  const ok = got === want;
  if (ok) { passed++; console.log(`✅ ${name}`); }
  else { failed++; console.log(`❌ ${name}\n--- got ---\n${got}\n--- want ---\n${want}\n`); }
}

// rows helper: dame Y en el "hueco" inmediatamente antes de la fila con id X
function gapBefore(rows, id) {
  const i = rows.findIndex(r => r.id === id);
  return rows[i].rect.top + 1; // justo dentro de la mitad superior de esa fila
}
function gapAfterLast(rows) {
  return rows[rows.length - 1].rect.bottom + 5;
}
function rowsFor(tree, drag) { return buildVisibleRows(tree, EXPANDED_ALL, drag); }

// --- Escenario A: arrastrar "2" entre 1.1.2 y 1.1.3 → hijo de 1.1 (3er grado)
{
  const t = makeTree();
  const rows = rowsFor(t, '2');
  const y = gapBefore(rows, '1.1.3'); // hueco antes de 1.1.3
  const tgt = computeDropTarget(t, rows, '2', y);
  performDrop(t, tgt, '2');
  check('A: "2" entre 1.1.2 y 1.1.3 → hijo de 1.1', renderTree(t),
`1
  1.1
    1.1.1
    1.1.2
    2
    1.1.3
  1.2
  1.3`);
}

// --- Escenario B: arrastrar 1.1.2 entre 1.2 y 1.3 → hermano de 1.2 (2º grado)
{
  const t = makeTree();
  const rows = rowsFor(t, '1.1.2');
  const y = gapBefore(rows, '1.3');
  const tgt = computeDropTarget(t, rows, '1.1.2', y);
  performDrop(t, tgt, '1.1.2');
  check('B: 1.1.2 entre 1.2 y 1.3 → hermano de 1.2', renderTree(t),
`1
  1.1
    1.1.1
    1.1.3
  1.2
  1.1.2
  1.3
2`);
}

// --- Escenario C: arrastrar "2" arriba de "1" → primer grado, antes de 1
{
  const t = makeTree();
  const rows = rowsFor(t, '2');
  const y = -100; // muy arriba
  const tgt = computeDropTarget(t, rows, '2', y);
  performDrop(t, tgt, '2');
  check('C: "2" arriba de todo → 1er grado antes de 1', renderTree(t),
`2
1
  1.1
    1.1.1
    1.1.2
    1.1.3
  1.2
  1.3`);
}

// --- Escenario D: arrastrar 1.1.1 arriba de 1 → hermano de 1 (1er grado)
{
  const t = makeTree();
  const rows = rowsFor(t, '1.1.1');
  const y = -100;
  const tgt = computeDropTarget(t, rows, '1.1.1', y);
  performDrop(t, tgt, '1.1.1');
  check('D: 1.1.1 arriba de 1 → hermano de 1', renderTree(t),
`1.1.1
1
  1.1
    1.1.2
    1.1.3
  1.2
  1.3
2`);
}

// --- Escenario E: arrastrar 1.1.1 debajo de 2 (sin desplegar) → hermano de 2
{
  const t = makeTree();
  const rows = rowsFor(t, '1.1.1');
  const y = gapAfterLast(rows); // después de la última fila visible (2)
  const tgt = computeDropTarget(t, rows, '1.1.1', y);
  performDrop(t, tgt, '1.1.1');
  check('E: 1.1.1 debajo de 2 → hermano de 2 (1er grado)', renderTree(t),
`1
  1.1
    1.1.2
    1.1.3
  1.2
  1.3
2
1.1.1`);
}

// --- Escenario F: "2" entre 1 (padre desplegado) y 1.1 → primer hijo de 1
{
  const t = makeTree();
  const rows = rowsFor(t, '2');
  const y = gapBefore(rows, '1.1'); // hueco entre 1 y su primer hijo 1.1
  const tgt = computeDropTarget(t, rows, '2', y);
  performDrop(t, tgt, '2');
  check('F: "2" entre 1 y 1.1 → primer hijo de 1', renderTree(t),
`1
  2
  1.1
    1.1.1
    1.1.2
    1.1.3
  1.2
  1.3`);
}

// --- Escenario G: LÍMITE. Arrastrar "1" (subárbol profundo 3) dentro de algo
//     que lo llevaría a nivel 2 → rechazado (null), no se mueve.
{
  const t = makeTree();
  // Profundidad de "1": 1->1.1->1.1.1 = 2 niveles bajo 1 => depth=2.
  // Hmm: 1 tiene hijos (1.1) que tiene hijos (1.1.1). depth(1)=2.
  // Para violar: soltarlo en nivel 3 => 3+2=5>4. Probamos soltar entre 1.1.1 y 1.1.2.
  const rows = rowsFor(t, '1');
  // Tras excluir "1" y su subárbol, NO quedan filas (todo es descendiente de 1).
  // Así que el único destino posible es lista vacía → primer grado. Validamos
  // que NO se rompa y quede igual (se reinserta a 1er grado).
  const y = 0;
  const tgt = computeDropTarget(t, rows, '1', y);
  // rows vacío => target primer grado index 0; mover "1" a primer grado = igual.
  if (tgt) performDrop(t, tgt, '1');
  check('G: arrastrar raíz "1" (sin destinos internos) queda a 1er grado', renderTree(t),
`1
  1.1
    1.1.1
    1.1.2
    1.1.3
  1.2
  1.3
2`);
}

// --- Escenario H: LÍMITE explícito. Árbol donde un nodo de depth=2 se intenta
//     soltar a nivel 3 (3+2=5>4) → computeDropTarget debe devolver null.
{
  // Árbol:
  // A (desplegado)
  //   A1 (desplegado)
  //     A1a
  //   A2
  // X (desplegado)        <- arrastramos X, que tiene depth 2 (X->X1->X1a)
  //   X1 (desplegado)
  //     X1a
  const t = [
    { id:'A', subgoals:[
      { id:'A1', subgoals:[ { id:'A1a', subgoals:[] } ] },
      { id:'A2', subgoals:[] },
    ]},
    { id:'X', subgoals:[
      { id:'X1', subgoals:[ { id:'X1a', subgoals:[] } ] },
    ]},
  ];
  const expanded = new Set(['A','A1','X','X1']);
  const drag = 'X'; // depth 2
  const rows = buildVisibleRows(t, expanded, drag);
  // Hueco entre A1 y A1a sería nivel 3 (primer hijo de A1 desplegado).
  const i = rows.findIndex(r => r.id === 'A1a');
  const y = rows[i].rect.top + 1;
  const tgt = computeDropTarget(t, rows, drag, y);
  check('H: soltar nodo depth=2 a nivel 3 → RECHAZADO (null)', tgt === null ? 'null' : JSON.stringify(tgt), 'null');
}

// --- Escenario I: reordenar simple entre hermanos del mismo nivel (no rompe)
{
  const t = makeTree();
  const rows = rowsFor(t, '1.2');
  // mover 1.2 antes de 1.1: hueco antes de 1.1 => pero 1.1 es padre desplegado,
  // su hueco-before es nivel 2 (hermano), index 0. Resultado: 1.2 primer hijo de 1.
  const y = gapBefore(rows, '1.1');
  const tgt = computeDropTarget(t, rows, '1.2', y);
  performDrop(t, tgt, '1.2');
  check('I: 1.2 al hueco antes de 1.1 → primer hijo de 1 (2º grado)', renderTree(t),
`1
  1.2
  1.1
    1.1.1
    1.1.2
    1.1.3
  1.3
2`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

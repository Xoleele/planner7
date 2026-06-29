// ─────────────────────────────────────────────────────────────────────────────
// DIAGNÓSTICO de la línea guía de arrastre en la sección OBJETIVOS.
//
// CÓMO USAR:
// 1. Abre la app en Chrome, entra a la sección Objetivos (con varios objetivos).
// 2. Abre la consola (F12 → pestaña "Console").
// 3. Copia y pega TODO este archivo en la consola y pulsa Enter.
// 4. Arrastra un objetivo lentamente. En cada movimiento se imprime en consola
//    la posición real de la línea negra vs. el hueco entre rectángulos donde
//    debería estar. El "DESFASE" te dice cuántos px está corrida.
// 5. Para detener el diagnóstico, ejecuta:  __pararDiag()
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  const lista = document.getElementById('objetivos-lista');
  if (!lista) {
    console.warn('No se encontró #objetivos-lista. ¿Estás en la sección Objetivos?');
    return;
  }

  // Información estática del contenedor: padding/border que podrían descuadrar
  // el origen de coordenadas del hijo absoluto (.objetivo-drop-line).
  const cs = getComputedStyle(lista);
  console.log('%c── Contenedor #objetivos-lista ──', 'font-weight:bold');
  console.table({
    position: cs.position,
    paddingTop: cs.paddingTop,
    borderTopWidth: cs.borderTopWidth,
    transform: cs.transform,
    overflow: cs.overflow
  });

  // Ancestro que realmente scrollea (esperado: .objetivos-body)
  let sc = lista.parentElement;
  while (sc && sc !== document.body) {
    const o = getComputedStyle(sc).overflowY;
    if (o === 'auto' || o === 'scroll') break;
    sc = sc.parentElement;
  }
  console.log('Ancestro con scroll vertical:', sc ? (sc.className || sc.id || sc.tagName) : '(ninguno)');

  let lastLog = 0;
  function snapshot() {
    const line = lista.querySelector('.objetivo-drop-line');
    if (!line || line.style.display === 'none') return;

    const lineRect = line.getBoundingClientRect();
    const lineMidY = lineRect.top + lineRect.height / 2;

    // Rectángulos visibles (.objetivo-item) en orden vertical
    const items = Array.from(lista.querySelectorAll('.objetivo-container'))
      .map(c => c.querySelector(':scope > .objetivo-item'))
      .filter(el => el && el.getBoundingClientRect().height > 0);

    // Hueco real: la fila justo encima y justo debajo de la línea
    let above = null, below = null;
    for (const el of items) {
      const r = el.getBoundingClientRect();
      if (r.bottom <= lineMidY + 0.5) above = el;
      else if (!below && r.top >= lineMidY - 0.5) { below = el; break; }
    }

    const aR = above ? above.getBoundingClientRect() : null;
    const bR = below ? below.getBoundingClientRect() : null;

    // Punto medio IDEAL del hueco entre el rectángulo de arriba y el de abajo
    let idealMidY = null;
    if (aR && bR) idealMidY = (aR.bottom + bR.top) / 2;
    else if (bR) idealMidY = bR.top;
    else if (aR) idealMidY = aR.bottom;

    const desfase = idealMidY !== null ? (lineMidY - idealMidY) : null;

    // Throttle: no más de ~5 logs por segundo
    const now = performance.now();
    if (now - lastLog < 180) return;
    lastLog = now;

    console.log(
      `línea Y=${lineMidY.toFixed(1)} | hueco ideal Y=${idealMidY ? idealMidY.toFixed(1) : '—'} ` +
      `| %cDESFASE=${desfase !== null ? desfase.toFixed(1) + 'px' : '—'}%c ` +
      `| arriba="${above ? above.textContent.trim().slice(0,14) : '—'}" ` +
      `abajo="${below ? below.textContent.trim().slice(0,14) : '—'}"`,
      'color:' + (Math.abs(desfase || 0) > 1.5 ? 'red' : 'green') + ';font-weight:bold',
      'color:inherit;font-weight:normal'
    );
  }

  const id = setInterval(snapshot, 60);
  window.__pararDiag = () => { clearInterval(id); console.log('Diagnóstico detenido.'); };
  console.log('%cDiagnóstico ACTIVO. Arrastra un objetivo. Para detener: __pararDiag()',
              'color:#0a7;font-weight:bold');
})();

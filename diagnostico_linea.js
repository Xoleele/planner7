// ─────────────────────────────────────────────────────────────────────────────
// DIAGNÓSTICO v4 — vuelca, en el momento exacto del dragover, las coordenadas
// del cursor y de TODAS las filas visibles, para ver por qué el punto medio
// calculado no coincide con el hueco real.
// Pégalo en consola (en Objetivos) y arrastra MUY lento sobre UN hueco.
// Detener: __pararDiag()
// ─────────────────────────────────────────────────────────────────────────────
(function () {
  const lista = document.getElementById('objetivos-lista');
  if (!lista) { console.warn('No estás en Objetivos.'); return; }

  let last = 0;
  function onMove(ev) {
    const now = performance.now();
    if (now - last < 400) return; last = now;
    const y = ev.clientY;

    const rows = Array.from(lista.querySelectorAll('.objetivo-container'))
      .map(c => {
        const it = c.querySelector(':scope > .objetivo-item');
        if (!it) return null;
        const r = it.getBoundingClientRect();
        if (r.height === 0) return null;
        return { id: c.dataset.goalId, top: +r.top.toFixed(1), bottom: +r.bottom.toFixed(1),
                 txt: it.textContent.trim().slice(0,10), dragging: c.classList.contains('dragging') };
      }).filter(Boolean);

    const line = lista.querySelector('.objetivo-drop-line');
    const lineInfo = (line && line.style.display !== 'none')
      ? { cssTop: line.style.top, viewportMidY: +(line.getBoundingClientRect().top + 1.5).toFixed(1) }
      : 'oculta';

    console.log(`%c── dragover: cursor Y=${y.toFixed(1)} ──`, 'color:#06c;font-weight:bold');
    console.log('línea:', lineInfo);
    console.table(rows);
  }

  lista.addEventListener('dragover', onMove, true);
  window.__pararDiag = () => { lista.removeEventListener('dragover', onMove, true); console.log('Detenido.'); };
  console.log('%cDiagnóstico v4 ACTIVO. Arrastra lento sobre UN hueco. Detener: __pararDiag()', 'color:#0a7;font-weight:bold');
})();

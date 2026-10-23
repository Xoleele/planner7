// Navegador aislado, sin datos reales ni conexiones externas.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const source = fs.readFileSync(path.join(__dirname, '..', 'app-3-tareas.js'), 'utf8');
const start = source.indexOf('function cronogramaEdgeScrollStep(');
const step = source.slice(start, source.indexOf('\n}', start) + 2);

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="scroll" style="height:601px;overflow:auto"><div style="height:1440px"></div></div>');
    await page.evaluate(() => {
      document.body.style.zoom = '1.5';
      window.requestAnimationFrame = () => { window.scheduled++; return 1; };
      window.applyCronogramaDragMove = () => { window.moves++; };
    });
    await page.addScriptTag({ content: step });
    const run = async (position, dir, frames) => page.evaluate(({ position, dir, frames }) => {
      const container = document.getElementById('scroll');
      container.scrollTop = position;
      const before = container.scrollTop;
      window.crDrag = { grabClientY: 500 };
      window.crEdgeScroll = { container, dir, speed: 14, lastX: 50, lastY: 590 };
      window.moves = 0;
      window.scheduled = 0;
      for (let i = 0; i < frames; i++) cronogramaEdgeScrollStep();
      return { before, after: container.scrollTop, origin: crDrag.grabClientY, moves, scheduled };
    }, { position, dir, frames });

    const bottom = await run(9999, 1, 120);
    assert(bottom.before < 840, `El navegador conserva un límite fraccionario: ${bottom.before}`);
    assert.equal(bottom.origin, 500, 'La tarea no debe avanzar con la vista detenida');
    assert.equal(bottom.moves, 0);
    assert.equal(bottom.scheduled, 0, 'El bucle debe detenerse en el borde');

    for (const [position, dir] of [[400, 1], [400, -1], [835, 1], [5, -1]]) {
      const result = await run(position, dir, 1);
      assert.equal(result.origin, 500 - (result.after - result.before), 'Compensar solo el movimiento real');
      assert.equal(result.moves, 1);
    }
    const top = await run(0, -1, 120);
    assert.equal(top.origin, 500);
    assert.equal(top.moves, 0);
    assert.equal(top.scheduled, 0);
    const inactive = await run(400, 0, 1);
    assert.equal(inactive.after, inactive.before);
    console.log('OK: límites fraccionarios, ambos bordes, desplazamiento real y bucle detenido.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

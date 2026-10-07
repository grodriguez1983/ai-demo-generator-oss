/**
 * Cursor-guía para tutoriales paso a paso.
 *
 * Se inyecta con context.addInitScript (corre en cada navegación), de modo que
 * un puntero visible + un anillo de resalte quedan disponibles en `window`.
 * La grabación es headless (sin cursor real del SO), así que dibujamos el
 * nuestro en el DOM y lo movemos ANTES de cada click/escritura para que el
 * espectador vea a dónde va la acción.
 *
 * IMPORTANTE: se exporta como STRING (no función) a propósito. tsx/esbuild
 * envuelve las funciones con un helper `__name(...)` (opción keepNames) que NO
 * existe en el contexto del navegador; si se pasara la función a addInitScript,
 * el script tiraría "__name is not defined" y no definiría nada. Un string
 * crudo se ejecuta tal cual.
 *
 * API expuesta en `window`:
 *   __demoMove(x, y)        — mueve el puntero (animado) a esa coord de viewport
 *   __demoRing(x, y, w, h)  — resalta el rect (coords de viewport) con un anillo
 *   __demoRingHide()        — oculta el anillo
 *   __demoRipple(x, y)      — animación de "click" en ese punto
 */
export const cursorGuideScript = `
(function () {
  if (window.__demoGuideInit) return;
  window.__demoGuideInit = true;

  function ensure() {
    if (!document.body) return false;
    if (document.getElementById('__demo_cursor')) return true;

    var cursor = document.createElement('div');
    cursor.id = '__demo_cursor';
    cursor.style.cssText = [
      'position:fixed', 'left:0', 'top:0', 'z-index:2147483646',
      'width:28px', 'height:28px', 'pointer-events:none',
      'transition:transform .55s cubic-bezier(.22,1,.36,1)',
      'transform:translate(50vw,82vh)', 'will-change:transform',
      'filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))'
    ].join(';');
    cursor.innerHTML =
      '<svg width="28" height="28" viewBox="0 0 24 24" fill="none">' +
      '<path d="M4 2l15 8.5-6.4 1.4L9.3 19 4 2z" fill="#111827" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/>' +
      '</svg>';
    document.body.appendChild(cursor);

    var ring = document.createElement('div');
    ring.id = '__demo_ring';
    ring.style.cssText = [
      'position:fixed', 'z-index:2147483645', 'left:0', 'top:0',
      'width:0', 'height:0', 'border:3px solid #3b82f6', 'border-radius:10px',
      'pointer-events:none', 'opacity:0',
      'transition:opacity .3s ease, left .35s ease, top .35s ease, width .35s ease, height .35s ease',
      'box-shadow:0 0 0 3px rgba(59,130,246,.25), 0 0 20px rgba(59,130,246,.55)'
    ].join(';');
    document.body.appendChild(ring);

    var style = document.createElement('style');
    style.textContent =
      '@keyframes __demo_rip{0%{transform:translate(-50%,-50%) scale(.35);opacity:.5}' +
      '100%{transform:translate(-50%,-50%) scale(1.7);opacity:0}}';
    document.head.appendChild(style);
    return true;
  }

  window.__demoMove = function (x, y) {
    if (!ensure()) return;
    var c = document.getElementById('__demo_cursor');
    if (c) c.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
  };

  window.__demoRing = function (x, y, ew, eh) {
    if (!ensure()) return;
    var r = document.getElementById('__demo_ring');
    if (!r) return;
    r.style.left = (x - 6) + 'px';
    r.style.top = (y - 6) + 'px';
    r.style.width = (ew + 12) + 'px';
    r.style.height = (eh + 12) + 'px';
    r.style.opacity = '1';
  };

  window.__demoRingHide = function () {
    var r = document.getElementById('__demo_ring');
    if (r) r.style.opacity = '0';
  };

  window.__demoRipple = function (x, y) {
    if (!ensure()) return;
    var d = document.createElement('div');
    d.style.cssText = [
      'position:fixed', 'left:' + x + 'px', 'top:' + y + 'px', 'z-index:2147483644',
      'width:46px', 'height:46px', 'border-radius:50%',
      'background:rgba(59,130,246,.45)', 'pointer-events:none',
      'animation:__demo_rip .5s ease-out forwards'
    ].join(';');
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 560);
  };

  if (document.readyState !== 'loading') ensure();
  else document.addEventListener('DOMContentLoaded', ensure);
})();
`;

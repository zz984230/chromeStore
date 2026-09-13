// public/nv-shadow-hook.js
// Main-world attachShadow hook (M2b Task 7, §5). Static file — copied
// verbatim by the build, exposed via manifest web_accessible_resources, and
// injected as <script src=... data-nv-hook> by the engine while
// processShadowStyles is on. It runs in the page's main world (the content
// script cannot reach attachShadow from the isolated world) and must NEVER
// break the page's own attachShadow: every step is guarded.
(function () {
  if (window.__nvShadowHook) return;
  window.__nvShadowHook = true;
  try {
    var original = Element.prototype.attachShadow;
    if (typeof original !== 'function') return;
    Element.prototype.attachShadow = function (init) {
      try {
        var marked = this.hasAttribute && this.hasAttribute('data-nv-shadowhost');
        if (!marked) {
          // First marking only: key, active-state mirror, and one notification
          // for the isolated-world engine to rescan shadow roots.
          this.setAttribute('data-nv-shadowhost', 'nv-shdw-' + Math.floor(Math.random() * 1e7));
          if (document.documentElement.hasAttribute('data-nv-active')) this.setAttribute('data-nv-active', '');
          else this.removeAttribute('data-nv-active');
          window.postMessage({ from: 'nv-shadow-attach' }, '*');
        }
        // Closed roots are unreachable for the engine — force open (§5).
        if (init && typeof init === 'object') init.mode = 'open';
      } catch (e) { /* marking/forcing must never break the page */ }
      return Reflect.apply(original, this, arguments);
    };
  } catch (e) { /* hook installation must never break the page */ }
})();

/* Follow wrapping, account loading and safe-area changes without fixing a height. */
(() => {
  'use strict';
  function boot() {
    const header = document.querySelector('.app > .header');
    if (!header) return;
    let previousHeight = 0;
    function measure() {
      const height = Math.ceil(header.getBoundingClientRect().height);
      if (!height || height === previousHeight) return;
      previousHeight = height;
      document.documentElement.style.setProperty('--qb-header-scroll-padding', `${height + 12}px`);
    }
    measure();
    if (window.ResizeObserver) {
      new ResizeObserver(measure).observe(header);
    } else {
      window.addEventListener('resize', measure, { passive: true });
      new MutationObserver(measure).observe(header, { childList: true, subtree: true, characterData: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

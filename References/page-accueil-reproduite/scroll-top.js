(function () {
  if (customElements.get('scroll-top-button')) return;

  class ScrollTopButton extends HTMLElement {
    connectedCallback() {
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = [
        '<style>',
        ':host{position:fixed;right:22px;bottom:22px;z-index:9999}',
        'button{width:46px;height:46px;border-radius:50%;background:#072421;border:1px solid #BA996B;',
        'color:#E4C99A;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;',
        'box-shadow:0 8px 22px rgba(4,20,18,0.28);opacity:0;visibility:hidden;transform:translateY(10px);',
        'transition:opacity .25s ease,transform .25s ease,visibility .25s}',
        'button.visible{opacity:1;visibility:visible;transform:translateY(0)}',
        'button:hover{transform:translateY(0) scale(1.08);background:#0D3A35}',
        '@media (max-width:720px){:host{right:16px;bottom:16px}button{width:44px;height:44px}}',
        '@media print{:host{display:none}}',
        '</style>',
        '<button type="button" aria-label="Retour en haut de page">',
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
        '<line x1="12" y1="19" x2="12" y2="6"></line><polyline points="6,12 12,6 18,12"></polyline>',
        '</svg></button>'
      ].join('');

      this.btn = root.querySelector('button');
      this.scroller = this.findScroller();
      this.onScroll = () => this.update();

      this.btn.addEventListener('click', () => {
        const target = this.scroller === window ? window : this.scroller;
        if (target === window) window.scrollTo({ top: 0, behavior: 'smooth' });
        else target.scrollTo({ top: 0, behavior: 'smooth' });
      });

      (this.scroller === window ? window : this.scroller).addEventListener('scroll', this.onScroll, { passive: true });
      window.addEventListener('resize', this.onScroll, { passive: true });
      this.update();
    }

    disconnectedCallback() {
      (this.scroller === window ? window : this.scroller).removeEventListener('scroll', this.onScroll);
      window.removeEventListener('resize', this.onScroll);
    }

    findScroller() {
      let el = this.parentElement;
      while (el && el !== document.body) {
        const s = getComputedStyle(el);
        if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 4) return el;
        el = el.parentElement;
      }
      const de = document.scrollingElement || document.documentElement;
      if (de && de.scrollHeight > de.clientHeight + 4) return window;
      const bodyScroll = document.body;
      if (bodyScroll && /(auto|scroll)/.test(getComputedStyle(bodyScroll).overflowY) && bodyScroll.scrollHeight > bodyScroll.clientHeight + 4) return bodyScroll;
      return window;
    }

    update() {
      if (!this.btn) return;
      if (this.scroller === window) {
        const de = document.scrollingElement || document.documentElement;
        if (de.scrollHeight <= de.clientHeight + 4) {
          const next = this.findScroller();
          if (next !== window) {
            window.removeEventListener('scroll', this.onScroll);
            this.scroller = next;
            next.addEventListener('scroll', this.onScroll, { passive: true });
          }
        }
      }
      const top = this.scroller === window
        ? (window.pageYOffset || (document.scrollingElement || document.documentElement).scrollTop)
        : this.scroller.scrollTop;
      const threshold = (this.scroller === window ? window.innerHeight : this.scroller.clientHeight) * 0.8;
      this.btn.classList.toggle('visible', top > threshold);
    }
  }

  customElements.define('scroll-top-button', ScrollTopButton);
})();

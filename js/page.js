/* Cee Curates inner pages. Shared behavior: nav, menu, reveals, sheets,
   lightbox, video, and one scroll loop that writes transform only. */
(() => {
  const html = document.documentElement;
  const reduce = html.classList.contains('reduce');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const qs = (s, c = document) => c.querySelector(s);
  const qsa = (s, c = document) => [...c.querySelectorAll(s)];

  requestAnimationFrame(() => requestAnimationFrame(() => html.classList.add('is-ready')));

  /* Reveal on enter */
  const revealTargets = qsa('[data-reveal], [data-reveal-group]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -5% 0px' });
    revealTargets.forEach((el) => io.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add('in'));
  }

  /* Nav and mobile menu */
  const nav = qs('[data-nav]');
  const menu = qs('[data-menu]');
  const toggle = qs('[data-menu-toggle]');
  const toggleLabel = qs('.nav__toggle-label');
  let menuOpen = false;
  let closeTimer = 0;
  const setMenu = (open) => {
    menuOpen = open;
    clearTimeout(closeTimer);
    toggle.setAttribute('aria-expanded', String(open));
    toggleLabel.textContent = open ? 'Close' : 'Menu';
    html.classList.toggle('menu-open', open);
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
    } else {
      menu.classList.remove('is-open');
      closeTimer = setTimeout(() => { menu.hidden = true; }, 320);
    }
  };
  if (toggle && menu) {
    toggle.addEventListener('click', () => setMenu(!menuOpen));
    qsa('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) { setMenu(false); toggle.focus(); } });
  }
  let lastY = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY;
    if (!menuOpen && nav) {
      if (y > 240 && y > lastY + 4) nav.classList.add('is-hidden');
      else if (y < lastY - 4 || y < 240) nav.classList.remove('is-hidden');
    }
    lastY = y;
  }, { passive: true });

  /* Terms and privacy sheets */
  qsa('[data-dialog-open]').forEach((btn) => {
    const dialog = document.getElementById(btn.dataset.dialogOpen);
    if (!dialog || !dialog.showModal) return;
    btn.addEventListener('click', () => dialog.showModal());
    dialog.addEventListener('click', (e) => {
      if (e.target.closest('[data-dialog-close]')) { dialog.close(); return; }
      const r = dialog.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (e.target === dialog && !inside) dialog.close();
    });
  });

  /* Lightbox for gallery pieces */
  const lightbox = qs('[data-lightbox]');
  if (lightbox && lightbox.showModal) {
    const big = qs('img', lightbox);
    qsa('[data-zoom]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const img = qs('img', btn);
        big.src = img.currentSrc || img.src;
        big.alt = img.alt;
        lightbox.showModal();
      });
    });
    lightbox.addEventListener('click', () => lightbox.close());
  }

  /* Video plays only while on screen */
  if ('IntersectionObserver' in window) {
    const vio = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting && !reduce) { const p = v.play(); if (p && p.catch) p.catch(() => {}); }
        else v.pause();
      });
    }, { threshold: 0.25 });
    qsa('[data-video]').forEach((v) => vio.observe(v));
  }

  if (reduce) return; // Everything below is movement.

  /* Scroll linked pieces. Each one is measured through its parent, which never
     moves, so the reading stays stable while the element itself transforms. */
  const fx = qsa('[data-fx]').map((el) => ({
    el,
    ref: el.parentElement,
    type: el.dataset.fx,
    a: parseFloat(el.dataset.a || '0'),
    b: parseFloat(el.dataset.b || '0'),
    on: false,
    p: 0.5,
    primed: false,
  }));
  if ('IntersectionObserver' in window) {
    const fio = new IntersectionObserver((entries) => {
      entries.forEach((e) => { fx.forEach((x) => { if (x.ref === e.target) x.on = e.isIntersecting; }); });
    }, { rootMargin: '20% 0px 20% 0px' });
    [...new Set(fx.map((f) => f.ref))].forEach((r) => fio.observe(r));
  } else {
    fx.forEach((f) => { f.on = true; });
  }

  const tapes = qsa('[data-tape]').map((el) => ({ el, track: qs('.tape__track', el), dir: Number(el.dataset.tape), x: 0, unit: 0 }));
  const measureTapes = () => tapes.forEach((t) => { t.unit = t.track.firstElementChild.offsetWidth; });

  const mouse = { px: -200, py: -200, cx: -200, cy: -200 };
  const cursor = qs('[data-cursor-el]');
  const cursorLabel = cursor ? qs('span', cursor) : null;
  const magnets = qsa('[data-magnetic]').map((el) => ({ el, x: 0, y: 0, tx: 0, ty: 0 }));
  if (fine) {
    addEventListener('pointermove', (e) => { mouse.px = e.clientX; mouse.py = e.clientY; }, { passive: true });
    if (cursor) {
      qsa('[data-cursor]').forEach((el) => {
        el.addEventListener('pointerenter', () => { cursorLabel.textContent = el.dataset.cursor; cursor.classList.add('is-on'); });
        el.addEventListener('pointerleave', () => cursor.classList.remove('is-on'));
      });
    }
    magnets.forEach((mg) => {
      mg.el.addEventListener('pointermove', (e) => {
        const r = mg.el.getBoundingClientRect();
        mg.tx = (e.clientX - (r.left + r.width / 2)) * 0.35;
        mg.ty = (e.clientY - (r.top + r.height / 2)) * 0.35;
      });
      mg.el.addEventListener('pointerleave', () => { mg.tx = 0; mg.ty = 0; });
    });
  }

  let smooth = scrollY;
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(64, now - last);
    last = now;
    const k = 1 - Math.pow(1 - 0.12, dt / 16.67);
    const y = scrollY;
    smooth = lerp(smooth, y, k);
    const vel = y - smooth;
    const vh = html.clientHeight || innerHeight;
    const vw = html.clientWidth || innerWidth;

    // Read first, then write, so the browser lays out once per frame.
    const live = fx.filter((f) => f.on);
    const rects = live.map((f) => f.ref.getBoundingClientRect());
    live.forEach((f, i) => {
      const r = rects[i];
      const target = clamp((vh - r.top) / (vh + r.height));
      f.p = f.primed ? lerp(f.p, target, k) : target;
      f.primed = true;
      const p = f.p;
      let t = '';
      if (f.type === 'rotate') t = `rotate(${lerp(f.a, f.b, p).toFixed(2)}deg)`;
      else if (f.type === 'shift') t = `translate3d(${((0.5 - p) * f.a * vw / 100).toFixed(1)}px,0,0)`;
      else if (f.type === 'rise') t = `translate3d(0,${((0.5 - p) * f.a).toFixed(1)}px,0)`;
      else if (f.type === 'tilt') t = `perspective(1400px) rotateY(${lerp(f.a, f.b, p).toFixed(2)}deg) rotate(${lerp(f.a, f.b, p) * 0.12}deg)`;
      else if (f.type === 'orbit') t = `rotate(${((now * 0.006 + smooth * 0.12) * f.a).toFixed(2)}deg)`;
      f.el.style.transform = t;
    });

    tapes.forEach((t) => {
      if (!t.unit) return;
      t.x = (t.x + dt * 0.045 + Math.abs(vel) * 0.05) % t.unit;
      const x = t.dir > 0 ? -t.x : t.x - t.unit;
      t.track.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
    });

    if (fine) {
      if (cursor) {
        mouse.cx = lerp(mouse.cx, mouse.px, k * 1.6);
        mouse.cy = lerp(mouse.cy, mouse.py, k * 1.6);
        cursor.style.transform = `translate3d(${mouse.cx.toFixed(1)}px,${mouse.cy.toFixed(1)}px,0)`;
      }
      magnets.forEach((mg) => {
        mg.x = lerp(mg.x, mg.tx, k);
        mg.y = lerp(mg.y, mg.ty, k);
        mg.el.style.transform = `translate3d(${mg.x.toFixed(1)}px,${mg.y.toFixed(1)}px,0)`;
      });
    }
    requestAnimationFrame(frame);
  };

  measureTapes();
  requestAnimationFrame(frame);
  addEventListener('resize', measureTapes);
  addEventListener('load', measureTapes);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureTapes);
})();

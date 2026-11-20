/* Cee Curates motion engine.
   One requestAnimationFrame loop. Every scroll linked effect reads a smoothed
   scroll value and writes transform or opacity only. */
(() => {
  const html = document.documentElement;
  const reduce = html.classList.contains('reduce');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (t) => t * t * (3 - 2 * t);
  const qs = (s, c = document) => c.querySelector(s);
  const qsa = (s, c = document) => [...c.querySelectorAll(s)];

  /* Loader and first paint */
  const loader = qs('[data-loader]');
  let introTarget = 0;
  const ready = () => {
    html.classList.add('is-ready');
    setTimeout(() => { introTarget = 1; }, 420);
  };
  const skipLoader = html.classList.contains('skip-loader') || !loader;
  if (skipLoader) {
    if (loader) loader.remove();
    requestAnimationFrame(() => requestAnimationFrame(ready));
  } else {
    const count = qs('[data-loader-count]');
    const started = performance.now();
    const DURATION = 1150;
    const tick = (now) => {
      const t = clamp((now - started) / DURATION);
      const eased = 1 - Math.pow(1 - t, 3);
      count.textContent = String(Math.round(eased * 100)).padStart(3, '0');
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    const minTime = new Promise((r) => setTimeout(r, DURATION + 120));
    const maxTime = new Promise((r) => setTimeout(r, 3200));
    Promise.race([Promise.all([fonts, minTime]), maxTime]).then(() => {
      loader.classList.add('is-done');
      setTimeout(ready, 260);
      setTimeout(() => loader.remove(), 1000);
      try { sessionStorage.setItem('cc-seen', '1'); } catch (e) { /* storage blocked, fine */ }
    });
  }

  /* Reveal on enter */
  const revealTargets = qsa('[data-reveal], [data-reveal-group]');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    revealTargets.forEach((el) => io.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add('in'));
  }

  /* Nav: hide on the way down, return on the way up */
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
  toggle.addEventListener('click', () => setMenu(!menuOpen));
  qsa('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) { setMenu(false); toggle.focus(); } });

  let lastY = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY;
    if (!menuOpen) {
      if (y > 240 && y > lastY + 4) nav.classList.add('is-hidden');
      else if (y < lastY - 4 || y < 240) nav.classList.remove('is-hidden');
    }
    lastY = y;
  }, { passive: true });

  /* Video: play only while on screen. Visibility comes from an observer; the
     loop calls syncVideos(), which also retries any play() a phone refused.
     On phones the wall is a stack, so only the card on top plays. */
  const videos = qsa('[data-video]');
  let stackVideo = null;
  if ('IntersectionObserver' in window) {
    const vio = new IntersectionObserver((entries) => {
      entries.forEach((e) => { e.target.vis = e.isIntersecting; });
    }, { threshold: 0.25 });
    videos.forEach((v) => vio.observe(v));
  } else videos.forEach((v) => { v.vis = true; });
  const syncVideos = (stacked) => {
    videos.forEach((v) => {
      const want = !reduce && v.vis && (!stacked || !v.closest('[data-tile]') || v === stackVideo);
      if (want && v.paused && !v.pending) {
        const p = v.play();
        if (p && p.then) { v.pending = true; p.then(() => { v.pending = false; }, () => { v.pending = false; }); }
      } else if (!want && !v.paused) v.pause();
    });
  };

  /* Terms and privacy sheets */
  qsa('[data-dialog-open]').forEach((btn) => {
    const dialog = document.getElementById(btn.dataset.dialogOpen);
    if (!dialog || !dialog.showModal) return;
    btn.addEventListener('click', () => dialog.showModal());
    dialog.addEventListener('click', (e) => {
      if (e.target.closest('[data-dialog-close]')) { dialog.close(); return; }
      // A click on the backdrop lands on the dialog element, outside its box.
      const r = dialog.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (e.target === dialog && !inside) dialog.close();
    });
  });

  /* Split the about paragraph into words */
  const wordsEl = qs('[data-words]');
  let words = [];
  if (wordsEl && !reduce) {
    const text = wordsEl.textContent.trim().split(/\s+/);
    wordsEl.setAttribute('aria-label', wordsEl.textContent.trim());
    wordsEl.innerHTML = text.map((w) => `<span class="w" aria-hidden="true">${w}</span>`).join(' ');
    words = qsa('.w', wordsEl);
  }

  if (reduce) return; // Everything below is movement.

  /* Elements */
  const hero = qs('[data-hero]');
  const fanEl = qs('[data-fan]');
  const fanCards = qsa('[data-fan] .fcard');
  let fanW = 300;
  let fanStep = 0.36;

  /* Hero fan on phones: swipe sideways to deal the next card to the front.
     fanPos counts cards; it eases to fanTarget, and the cards wrap around. */
  let fanPos = 0;
  let fanTarget = 0;
  let fanDrag = null;
  let fanSwiped = false;
  const fanSwipeable = () => !reduce;
  fanEl.addEventListener('pointerdown', (e) => {
    if (!fanSwipeable() || fanDrag) return;
    fanDrag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, p0: fanPos, axis: null, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
  });
  fanEl.addEventListener('pointermove', (e) => {
    const d = fanDrag;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x0;
    const dy = e.clientY - d.y0;
    if (!d.axis && Math.hypot(dx, dy) > 8) {
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.axis === 'x') {
        fanEl.classList.add('is-dragging');
        try { fanEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }
    }
    if (d.axis !== 'x') return;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.v = lerp(d.v, (e.clientX - d.lastX) / dt, 0.5);
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    fanPos = d.p0 - dx / (fanW * 0.7);
  });
  const fanRelease = (e) => {
    const d = fanDrag;
    if (!d || e.pointerId !== d.id) return;
    fanDrag = null;
    fanEl.classList.remove('is-dragging');
    if (d.axis !== 'x' || e.type === 'pointercancel') { if (d.axis === 'x') fanTarget = Math.round(fanPos); return; }
    fanSwiped = true;
    const dx = e.clientX - d.x0;
    // A flick or a short drag moves one card; a long drag can move more.
    let steps = Math.round(-dx / (fanW * 0.7));
    if (!steps && (Math.abs(dx) > 24 || Math.abs(d.v) > 0.35)) steps = dx < 0 ? 1 : -1;
    fanTarget = d.p0 + steps;
  };
  fanEl.addEventListener('pointerup', fanRelease);
  fanEl.addEventListener('pointercancel', fanRelease);
  // Two finger trackpad swipe: one card per gesture. Momentum events keep the
  // lock alive, so a single swipe never skips several cards.
  let wheelAcc = 0;
  let wheelLock = 0;
  fanEl.addEventListener('wheel', (e) => {
    if (!fanSwipeable() || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    if (e.timeStamp < wheelLock) { wheelLock = e.timeStamp + 180; return; }
    wheelAcc += e.deltaX;
    if (Math.abs(wheelAcc) > 30) {
      fanTarget = Math.round(fanTarget) + (wheelAcc > 0 ? 1 : -1);
      fanSwiped = true;
      wheelAcc = 0;
      wheelLock = e.timeStamp + 420;
    }
  }, { passive: false });
  // One gentle nudge after the intro so people find out the cards move.
  setTimeout(() => {
    if (!fanSwipeable() || fanSwiped || scrollY > 40) return;
    fanTarget = 0.34;
    setTimeout(() => { if (!fanSwiped) fanTarget = 0; }, 900);
  }, 2600);
  const heroLines = qsa('[data-line]', hero);
  const tapes = qsa('[data-tape]').map((el) => ({ el, track: qs('.tape__track', el), dir: Number(el.dataset.tape), x: 0, unit: 0 }));
  const collection = qs('[data-collection]');
  const wcards = qsa('[data-wcard]');
  const ctexts = qsa('[data-ctext]');
  const countStrip = qs('[data-count]');
  const rails = qsa('.rail i');
  const statement = qs('[data-statement]');
  const slides = qsa('[data-slide]').map((el) => ({ el, dir: Number(el.dataset.slide) }));
  const wall = qs('[data-wall]');
  const track = qs('[data-track]');
  const tiles = qsa('[data-tile]').map((el) => ({ el, card: qs('.tile__card', el), video: qs('video', el), center: 0, cover: -1 }));
  let stacked = false;
  const about = qs('[data-about]');
  const portrait = qs('[data-portrait]');
  const portraitBlock = qs('[data-portrait-block]');
  const contact = qs('[data-contact]');

  /* Measurements, cached and refreshed on resize */
  let vw = innerWidth;
  let vh = innerHeight;
  const m = {};
  let wallDist = 0;
  let wheel = { side: true, R: 900, cx: 0, cy: 0, step: 30 };

  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top + scrollY, height: r.height };
  };

  const stage = qs('.collection__stage');
  const measure = () => {
    // Layout viewport, not the window: these stay correct while mobile toolbars move.
    vw = html.clientWidth || innerWidth;
    vh = stage.offsetHeight || innerHeight;

    // Wall: wide screens pin it and travel sideways, and how far the track has
    // to travel sets how tall the section is. Phones get the vertical stack.
    stacked = vw <= 860;
    track.style.transform = 'none';
    tiles.forEach((t) => { t.card.style.transform = ''; t.el.style.transform = ''; t.el.style.removeProperty('--dim'); t.cover = -1; });
    wallDist = stacked ? 0 : Math.max(0, track.scrollWidth - vw);
    wall.style.height = stacked ? '' : `${vh + wallDist}px`;
    const trackLeft = track.getBoundingClientRect().left;
    tiles.forEach((t) => {
      const r = t.card.getBoundingClientRect();
      t.center = r.left - trackLeft + r.width / 2;
    });
    m.trackLeft = trackLeft;

    m.hero = box(hero);
    fanW = fanEl.offsetWidth || fanW;
    fanStep = parseFloat(getComputedStyle(fanEl).getPropertyValue('--fan-step')) || 0.36;
    m.collection = box(collection);
    m.statement = box(statement);
    m.wall = box(wall);
    m.about = box(about);
    m.contact = box(contact);
    if (wordsEl) m.words = box(wordsEl);

    // Wheel geometry. Wide screens: the wheel sits off the right edge and cards
    // climb from the bottom. Narrow screens: the wheel sits below and cards arc in.
    const side = vw > 860;
    const cardW = wcards[0].offsetWidth;
    if (side) {
      const R = clamp(vh * 1.05, 760, 1200);
      wheel = { side, R, step: 30, cx: vw * 0.685 + R, cy: vh * 0.52 };
    } else {
      const R = Math.max(vw * 1.7, 560);
      const cardH = cardW * 0.75;
      wheel = { side, R, step: 26, cx: vw / 2, cy: vh - cardH / 2 - 44 + R };
    }

    tapes.forEach((t) => { t.unit = t.track.firstElementChild.offsetWidth; });
  };

  // Progress while a pinned section is stuck: 0 when it sticks, 1 when it lets go.
  const pinned = (b, y) => clamp((y - b.top) / Math.max(1, b.height - vh));
  // Progress while a section crosses the viewport: 0 entering, 1 gone.
  const crossing = (b, y) => clamp((y + vh - b.top) / (b.height + vh));

  /* Pointer */
  const mouse = { x: 0, y: 0, sx: 0, sy: 0, px: -200, py: -200, cx: -200, cy: -200 };
  if (fine) {
    addEventListener('pointermove', (e) => {
      mouse.x = e.clientX / vw - 0.5;
      mouse.y = e.clientY / vh - 0.5;
      mouse.px = e.clientX;
      mouse.py = e.clientY;
    }, { passive: true });
  }

  /* Cursor label for work links */
  const cursor = qs('[data-cursor-el]');
  const cursorLabel = cursor ? qs('span', cursor) : null;
  if (fine && cursor) {
    qsa('[data-cursor]').forEach((el) => {
      el.addEventListener('pointerenter', () => { cursorLabel.textContent = el.dataset.cursor; cursor.classList.add('is-on'); });
      el.addEventListener('pointerleave', () => cursor.classList.remove('is-on'));
    });
  }

  /* Magnetic booking button */
  const magnets = qsa('[data-magnetic]').map((el) => ({ el, x: 0, y: 0, tx: 0, ty: 0 }));
  if (fine) {
    magnets.forEach((mg) => {
      mg.el.addEventListener('pointermove', (e) => {
        const r = mg.el.getBoundingClientRect();
        mg.tx = (e.clientX - (r.left + r.width / 2)) * 0.35;
        mg.ty = (e.clientY - (r.top + r.height / 2)) * 0.35;
      });
      mg.el.addEventListener('pointerleave', () => { mg.tx = 0; mg.ty = 0; });
    });
  }

  /* The loop */
  let smooth = scrollY;
  let intro = 0;
  let last = performance.now();
  let activeIdx = -1;
  let lastWordsP = -1;
  let lastSync = 0;

  const frame = (now) => {
    const dt = Math.min(64, now - last);
    last = now;
    const k = 1 - Math.pow(1 - 0.12, dt / 16.67); // frame rate independent smoothing
    const y = scrollY;
    smooth = lerp(smooth, y, k);
    if (Math.abs(y - smooth) < 0.05) smooth = y;
    const vel = y - smooth;

    mouse.sx = lerp(mouse.sx, mouse.x, k * 0.6);
    mouse.sy = lerp(mouse.sy, mouse.y, k * 0.6);
    intro = lerp(intro, introTarget, 1 - Math.pow(1 - 0.055, dt / 16.67));

    /* Hero: the fan opens, then spreads and turns as you leave */
    if (smooth < m.hero.top + m.hero.height + 200) {
      const hp = clamp(smooth / m.hero.height);
      const spread = intro * (1 + hp * 1.25);
      const turn = hp * -16 + mouse.sx * 5 + Math.sin(now / 1500) * 0.5;
      const n = fanCards.length;
      const mid = (n - 1) / 2;
      if (!fanDrag) {
        fanPos = lerp(fanPos, fanTarget, 1 - Math.pow(1 - 0.14, dt / 16.67));
        if (Math.abs(fanPos - fanTarget) < 0.0005) fanPos = fanTarget;
      }
      fanCards.forEach((c, i) => {
        // Position relative to the front card, wrapped so the deck loops.
        let o = i - mid - fanPos;
        o = ((((o + n / 2) % n) + n) % n) - n / 2;
        const ao = Math.abs(o);
        const z = String(100 - Math.round(ao * 10));
        if (c.style.zIndex !== z) c.style.zIndex = z;
        // Cards fade out at the very back so the wrap around is never seen.
        const op = ao > 2 ? clamp((n / 2 - ao) / (n / 2 - 2)).toFixed(3) : '';
        if (c.style.opacity !== op) c.style.opacity = op;
        // Wide cards: slide apart like a dealt hand, dip at the edges, then tilt.
        const x = o * fanW * fanStep * spread;
        const dip = o * o * fanW * 0.035 * spread;
        const a = o * 5 * spread + turn * intro * 0.6;
        const lift = -hp * vh * 0.2 * (1 + Math.abs(o) * 0.12) + mouse.sy * -10;
        c.style.transform = `translate3d(${x.toFixed(1)}px,${(lift + dip).toFixed(1)}px,0) rotate(${a.toFixed(2)}deg)`;
      });
      heroLines.forEach((l) => {
        const dir = Number(l.dataset.line);
        l.style.transform = `translate3d(${(hp * dir * vw * 0.07).toFixed(1)}px,0,0)`;
      });
    }

    /* Tapes: drift on their own, surge with scroll speed */
    tapes.forEach((t) => {
      if (!t.unit) return;
      t.x = (t.x + dt * 0.045 + Math.abs(vel) * 0.05) % t.unit;
      const x = t.dir > 0 ? -t.x : t.x - t.unit;
      t.track.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
    });

    /* Collection: the wheel */
    {
      const b = m.collection;
      if (smooth > b.top - vh && smooth < b.top + b.height) {
        const n = wcards.length;
        const raw = pinned(b, smooth) * (n - 1);
        const base = Math.min(n - 2, Math.floor(raw));
        // Dwell on each card, then move with purpose to the next.
        const active = base + smoothstep(smoothstep(clamp(raw - base)));
        const { side, R, step, cx, cy } = wheel;
        wcards.forEach((c, i) => {
          const d = i - active;
          const ad = Math.abs(d);
          if (ad > 2.2) { c.style.visibility = 'hidden'; return; }
          c.style.visibility = 'visible';
          const A = side ? -90 - d * step : d * step;
          const inner = side ? ' rotate(90deg)' : '';
          c.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0) rotate(${A.toFixed(2)}deg) translateY(${-R}px)${inner} translate(-50%,-50%)`;
          c.style.zIndex = String(10 - Math.round(ad * 2));
        });
        const idx = clamp(Math.round(raw), 0, n - 1);
        if (idx !== activeIdx) {
          activeIdx = idx;
          ctexts.forEach((t, i) => t.classList.toggle('is-active', i === idx));
          rails.forEach((r, i) => r.classList.toggle('is-active', i <= idx));
          countStrip.style.transform = `translateY(${-idx * 1.3}em)`;
        }
      }
    }

    /* Statement: lines slide against each other */
    {
      const b = m.statement;
      if (smooth > b.top - vh && smooth < b.top + b.height) {
        const p = crossing(b, smooth);
        slides.forEach((s) => {
          s.el.style.transform = `translate3d(${((0.5 - p) * s.dir * vw * 0.16).toFixed(1)}px,0,0)`;
        });
      }
    }

    /* Wall on phones: the card underneath sinks and dims as the next one
       slides over it. The top card is the one whose video plays. */
    if (stacked) {
      const b = m.wall;
      if (y > b.top - vh && y < b.top + b.height) {
        let top = 0;
        const rects = tiles.map((t) => t.el.getBoundingClientRect());
        tiles.forEach((t, i) => {
          if (rects[i].top < vh * 0.55) top = i;
          const next = rects[i + 1];
          let cover = 0;
          if (next && !reduce) {
            const h = t.el.offsetHeight;
            cover = clamp((rects[i].top + h - next.top) / h);
          }
          if (Math.abs(cover - t.cover) > 0.002) {
            t.cover = cover;
            t.el.style.transform = cover ? `scale(${(1 - cover * 0.08).toFixed(4)})` : '';
            t.el.style.setProperty('--dim', (cover * 0.55).toFixed(3));
          }
        });
        stackVideo = tiles[top].video;
      }
    }

    /* Wall: horizontal travel with coverflow rotation */
    if (!stacked) {
      const b = m.wall;
      if (smooth > b.top - vh && smooth < b.top + b.height) {
        const p = pinned(b, smooth);
        const x = -p * wallDist;
        track.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
        tiles.forEach((t) => {
          const off = (m.trackLeft + t.center + x - vw / 2) / vw;
          if (Math.abs(off) > 1.4) return;
          const o = clamp(off, -1, 1);
          t.card.style.transform = `perspective(1300px) translateZ(${(-Math.abs(o) * 150).toFixed(1)}px) rotateY(${(o * -26).toFixed(2)}deg) rotate(${(o * 2.5).toFixed(2)}deg)`;
        });
      }
    }

    /* About: portrait settles, words light up as you read */
    {
      const b = m.about;
      if (smooth > b.top - vh && smooth < b.top + b.height) {
        const p = crossing(b, smooth);
        portrait.style.transform = `rotate(${lerp(-9, 4, p).toFixed(2)}deg)`;
        portraitBlock.style.transform = `rotate(${lerp(4, -12, p).toFixed(2)}deg) translate(-16px,12px)`;
        if (words.length) {
          const wb = m.words;
          const wp = clamp((smooth + vh * 0.82 - wb.top) / (wb.height + vh * 0.32));
          if (Math.abs(wp - lastWordsP) > 0.002) {
            lastWordsP = wp;
            const head = wp * (words.length + 6);
            words.forEach((w, i) => { w.style.opacity = (0.2 + 0.8 * clamp((head - i) / 6)).toFixed(2); });
          }
        }
      }
    }


    /* Pointer followers */
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

    if (now - lastSync > 200) { lastSync = now; syncVideos(stacked); }

    requestAnimationFrame(frame);
  };

  measure();
  requestAnimationFrame(frame);

  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(measure, 120);
  });
  addEventListener('load', measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
})();

/* AI Consulting page: the scripted sample conversation, the time back
   calculator, and the flip cards. No network calls, nothing is recorded. */
(() => {
  const html = document.documentElement;
  const reduce = html.classList.contains('reduce');
  const qs = (s, c = document) => c.querySelector(s);
  const qsa = (s, c = document) => [...c.querySelectorAll(s)];

  /* ---------- Sample conversation ---------- */
  // who: them (caller or visitor), agent, sys (what happens behind the scenes), human (your staff)
  const SCRIPTS = {
    hours: {
      voice: [
        ['them', 'Hi, are you open this Saturday?'],
        ['agent', 'We are. Saturday hours are 9 to 4. Want me to text you the address?'],
        ['them', 'Yes please.'],
        ['agent', 'Sent. Is there anything else I can help with?'],
      ],
      chat: [
        ['them', 'Are you open this Saturday?'],
        ['agent', 'We are. Saturday hours are 9 to 4. Here is the address and a map link.'],
        ['them', 'Perfect, thanks.'],
        ['agent', 'Happy to help. See you Saturday.'],
      ],
      outcome: 'Answered from the knowledge base. Nobody left the floor.',
    },
    book: {
      voice: [
        ['them', 'I need an appointment this week.'],
        ['agent', 'Happy to help. I have Thursday at 2 or Friday at 10. Which works better?'],
        ['them', 'Friday at 10.'],
        ['sys', 'Added to the calendar. Staff notified.'],
        ['agent', 'You are booked for Friday at 10. A confirmation text is on its way.'],
      ],
      chat: [
        ['them', 'Can I book something this week?'],
        ['agent', 'Of course. I have Thursday at 2 or Friday at 10. Which works better?'],
        ['them', 'Friday at 10.'],
        ['sys', 'Added to the calendar. Staff notified.'],
        ['agent', 'Done. You are booked for Friday at 10. Check your email for the confirmation.'],
      ],
      outcome: 'Booked without a single interruption to your team.',
    },
    problem: {
      voice: [
        ['them', 'I was charged twice and I am pretty upset.'],
        ['agent', 'I am sorry about that. This needs a real person, so I am connecting you with the office now and passing along what you told me.'],
        ['sys', 'Stop rule met: billing problem. Forwarding to the office line with notes.'],
        ['human', 'Hi, this is the office. I can see the double charge. Let me fix that for you right now.'],
      ],
      chat: [
        ['them', 'I was charged twice and I am pretty upset.'],
        ['agent', 'I am sorry about that. This needs a real person. I am bringing in a teammate and sharing what you told me.'],
        ['sys', 'Stop rule met: billing problem. A team member joined the chat.'],
        ['human', 'Hi, I have your details here. I can see the double charge. Let me fix that for you right now.'],
      ],
      outcome: 'Handed to a human with the full story. Nobody had to repeat themselves.',
    },
  };
  const LABEL = {
    voice: { them: 'Caller', agent: 'Voice agent', human: 'Office staff', title: 'Front desk agent', state: 'On a call' },
    chat: { them: 'Visitor', agent: 'Chat agent', human: 'Team member', title: 'Website chat agent', state: 'Chatting' },
  };

  const phone = qs('[data-phone]');
  if (phone) {
    const log = qs('[data-log]', phone);
    const outcome = qs('[data-outcome]', phone);
    const title = qs('[data-phone-title]', phone);
    const state = qs('[data-phone-state]', phone);
    const modeBtns = qsa('[data-mode]');
    const scnBtns = qsa('[data-scn]');
    let mode = 'voice';
    let scn = 'hours';
    let timers = [];
    let started = false;

    const clear = () => { timers.forEach(clearTimeout); timers = []; };
    const later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };

    const bubble = (who, text) => {
      const el = document.createElement('div');
      el.className = `msg msg--${who}`;
      if (who === 'sys') { el.textContent = text; return el; }
      const tag = document.createElement('small');
      tag.textContent = LABEL[mode][who];
      el.append(tag, document.createTextNode(text));
      return el;
    };

    const play = () => {
      clear();
      log.textContent = '';
      outcome.classList.remove('is-on');
      phone.classList.remove('is-paused');
      title.textContent = LABEL[mode].title;
      state.textContent = LABEL[mode].state;
      const lines = SCRIPTS[scn][mode];
      const done = () => {
        outcome.textContent = SCRIPTS[scn].outcome;
        outcome.classList.add('is-on');
        phone.classList.add('is-paused');
        state.textContent = scn === 'problem' ? 'With a human' : 'Resolved';
      };
      if (reduce) { lines.forEach(([who, text]) => log.append(bubble(who, text))); done(); return; }

      let t = 350;
      lines.forEach(([who, text]) => {
        const thinks = who === 'agent' || who === 'human';
        if (thinks) {
          later(() => {
            const typing = document.createElement('div');
            typing.className = `msg msg--${who} msg--typing`;
            typing.dataset.typing = '1';
            typing.innerHTML = '<i></i><i></i><i></i>';
            log.append(typing);
          }, t);
          t += 850 + Math.min(900, text.length * 9);
        }
        later(() => {
          const typing = qs('[data-typing]', log);
          if (typing) typing.remove();
          log.append(bubble(who, text));
        }, t);
        t += who === 'sys' ? 900 : 1150;
      });
      later(done, t);
    };

    modeBtns.forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      modeBtns.forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      play();
    }));
    scnBtns.forEach((b) => b.addEventListener('click', () => {
      scn = b.dataset.scn;
      scnBtns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      play();
    }));
    const replay = qs('[data-replay]', phone);
    if (replay) replay.addEventListener('click', play);

    // Start the first sample when the phone scrolls into view.
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && !started) { started = true; play(); io.disconnect(); }
      }, { threshold: 0.4 });
      io.observe(phone);
    } else { play(); }
  }

  /* ---------- Time back calculator ---------- */
  const calc = qs('[data-calc]');
  if (calc) {
    const inputs = {
      volume: qs('[name="volume"]', calc),
      minutes: qs('[name="minutes"]', calc),
      rate: qs('[name="rate"]', calc),
      share: qs('[name="share"]', calc),
    };
    const outs = {
      volume: qs('[data-out="volume"]', calc),
      minutes: qs('[data-out="minutes"]', calc),
      rate: qs('[data-out="rate"]', calc),
      share: qs('[data-out="share"]', calc),
    };
    const hoursEl = qs('[data-hours]', calc);
    const moneyEl = qs('[data-money]', calc);
    const WORKDAYS = 22;
    const fmt = new Intl.NumberFormat('en-US');
    const shown = { hours: 0, money: 0 };
    const goal = { hours: 0, money: 0 };
    let raf = 0;

    const paint = () => {
      hoursEl.textContent = fmt.format(Math.round(shown.hours));
      moneyEl.textContent = '$' + fmt.format(Math.round(shown.money / 100) * 100);
    };
    const tick = () => {
      shown.hours += (goal.hours - shown.hours) * 0.18;
      shown.money += (goal.money - shown.money) * 0.18;
      if (Math.abs(goal.hours - shown.hours) < 0.4 && Math.abs(goal.money - shown.money) < 40) {
        shown.hours = goal.hours; shown.money = goal.money; paint(); raf = 0; return;
      }
      paint();
      raf = requestAnimationFrame(tick);
    };
    const update = () => {
      const v = Number(inputs.volume.value);
      const m = Number(inputs.minutes.value);
      const r = Number(inputs.rate.value);
      const s = Number(inputs.share.value) / 100;
      outs.volume.textContent = `${v} a day`;
      outs.minutes.textContent = `${m} min`;
      outs.rate.textContent = `$${r} an hour`;
      outs.share.textContent = `${Math.round(s * 100)}%`;
      goal.hours = (v * m * s / 60) * WORKDAYS;
      goal.money = goal.hours * 12 * r;
      if (reduce) { shown.hours = goal.hours; shown.money = goal.money; paint(); return; }
      if (!raf) raf = requestAnimationFrame(tick);
    };
    Object.values(inputs).forEach((i) => i.addEventListener('input', update));
    update();
  }

  /* ---------- Flip cards ---------- */
  qsa('[data-flip]').forEach((card) => {
    card.addEventListener('click', () => {
      const on = card.getAttribute('aria-pressed') !== 'true';
      card.setAttribute('aria-pressed', String(on));
    });
  });
})();

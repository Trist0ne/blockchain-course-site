/* Lessons. A lesson page (built by tools/build_lessons.py) is every slide in order as one readable page. This turns
   it into what each person needs:
     a student    reads it top to bottom, searches it, prints it;
     an instructor presses Present for full-screen slides, and S for a presenter window (notes, next slide, clock).
   Nothing is loaded from anywhere else, and a lesson hands nothing in.

   Keys while presenting: → Space PageDown next · ← PageUp back · Home End · a number then Enter to jump ·
   F full screen · S presenter window · B black screen · Esc back to the page. */
(function (root) {
  'use strict';
  var Kit = root.Kit, el = Kit.el, W = 1280, H = 720;

  Kit.runLesson = function () {
    var main = document.querySelector('main.lesson'), deck = document.getElementById('deck');
    var id = main.getAttribute('data-lesson'), code = main.getAttribute('data-code');
    var slides = [].slice.call(deck.querySelectorAll(':scope > .slide'));
    var notes = root.BC_NOTES || null, hasNotes = !!notes && Object.keys(notes).length > 0;
    var items = root.BC_ITEMS || [], me = items.filter(function (x) { return x.id === id; })[0] || null;
    var title = (slides[0].querySelector('h1') || {}).textContent || document.title;
    var presenter = /[?&]view=presenter\b/.test(root.location.search);
    var at = 0, step = 0, on = false, other = presenter ? root.opener : null, black = false, typed = '';

    Kit.chrome({ title: title, crumbs: (me && me.section) || 'Lesson', home: '../../start.html', noSetupNotice: true });
    slides.forEach(function (s, i) {
      s.setAttribute('data-n', i + 1);
      var no = el('button', { class: 'slide-no', type: 'button', title: 'Present from this slide', text: String(i + 1) });
      no.addEventListener('click', function () { start(i); });
      s.insertBefore(no, s.firstChild);
    });

    /* ----- The page: a heading with what you can do, every slide below it, and what comes next ----- */
    var showNotes = el('button', { class: 'btn', type: 'button', id: 'deck-notes', text: 'Show speaker notes' });
    var head = el('header', { class: 'lesson-head', id: 'lesson-head' },
      el('p', { class: 'eyebrow' }, el('span', { class: 'tag accent', text: 'Lesson ' + code }), el('span', { class: 'tag', text: slides.length + ' slides' }),
        me && me.minutes ? el('span', { class: 'tag', text: me.minutes + ' min' }) : null),
      el('h1', { text: title }),
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn primary', type: 'button', id: 'deck-present', text: 'Present' }),
        el('button', { class: 'btn', type: 'button', id: 'deck-presenter', text: 'Presenter window' }),
        el('button', { class: 'btn', type: 'button', id: 'deck-print', text: 'Print' }),
        hasNotes ? showNotes : null),
      el('p', { class: 'muted small', id: 'deck-how' }, 'Read it here, or press Present for slides. While presenting: ', el('kbd', { text: '→' }), ' next, ', el('kbd', { text: '←' }), ' back, ',
        el('kbd', { text: 'F' }), ' full screen, ', el('kbd', { text: 'S' }), ' presenter window, ', el('kbd', { text: 'Esc' }), ' to come back.'));
    main.insertBefore(head, deck);
    document.getElementById('deck-present').addEventListener('click', function () { start(nearest()); });
    document.getElementById('deck-presenter').addEventListener('click', function () { start(nearest()); openPresenter(); });
    document.getElementById('deck-print').addEventListener('click', function () { root.print(); });
    showNotes.addEventListener('click', function () {
      var showing = main.classList.toggle('with-notes');
      showNotes.textContent = showing ? 'Hide speaker notes' : 'Show speaker notes';
      if (showing) slides.forEach(function (s) {
        if (s.querySelector(':scope > .slide-notes') || !notes[s.id]) return;
        s.appendChild(el('aside', { class: 'slide-notes', html: notes[s.id] }));
      });
    });

    /* What comes next in this class, from the course map's own list. */
    var idx = items.indexOf(me), next = idx >= 0 ? items[idx + 1] : null, prev = idx > 0 ? items[idx - 1] : null;
    var KIND = { lesson: 'Lesson', quiz: 'Quiz', lab: 'Challenge' };
    function link(it, label) {
      return el('a', { class: 'next-item', href: '../../' + it.href }, el('span', { class: 'muted small', text: label + (it.day !== me.day ? ' · day ' + it.day : '') }), el('b', { text: it.title }), el('span', { class: 'tag', text: KIND[it.kind] || it.kind }));
    }
    main.appendChild(el('nav', { class: 'lesson-next', id: 'lesson-next' }, prev ? link(prev, 'Before this') : el('span'), next ? link(next, 'Next') : el('a', { class: 'next-item', href: '../../start.html' }, el('span', { class: 'muted small', text: 'Next' }), el('b', { text: 'Back to the course map' }))));
    Kit.mine.set('seen:' + id, 1);

    /* A locked day's lesson stays shut for a signed-in student, like the day's quizzes and challenges. */
    if (Kit.identity() && Kit.inbox() && me) Kit.gateItem(id);

    /* ----- Slides ----- */
    var bar = el('div', { class: 'deck-bar', id: 'deck-bar' },
      el('button', { type: 'button', id: 'deck-prev', title: 'Back (←)', text: '‹' }),
      el('span', { id: 'deck-count' }),
      el('button', { type: 'button', id: 'deck-next', title: 'Next (→)', text: '›' }),
      el('span', { class: 'deck-bar-gap' }),
      el('button', { type: 'button', id: 'deck-open-presenter', title: 'Presenter window (S)', text: 'Presenter' }),
      el('button', { type: 'button', id: 'deck-full', title: 'Full screen (F)', text: 'Full screen' }),
      el('button', { type: 'button', id: 'deck-exit', title: 'Back to the page (Esc)', text: 'Exit' }));
    var progress = el('div', { class: 'deck-progress', id: 'deck-progress' }, el('i'));
    var pane = presenter ? el('div', { class: 'presenter', id: 'presenter' },
      el('div', { class: 'presenter-left' },
        el('div', { class: 'presenter-view', id: 'presenter-now' }),
        el('p', { class: 'presenter-label', text: 'Next' }),
        el('div', { class: 'presenter-view small', id: 'presenter-next' })),
      el('div', { class: 'presenter-right' },
        el('div', { class: 'presenter-clock' }, el('b', { id: 'presenter-time' }), el('button', { type: 'button', id: 'presenter-timer', title: 'Time since you started. Click to restart.' }), el('span', { id: 'presenter-count' })),
        el('div', { class: 'presenter-notes', id: 'presenter-notes' }))) : null;
    document.body.appendChild(bar); document.body.appendChild(progress);
    if (pane) document.body.appendChild(pane);

    function fragments(s) {
      var f = [].slice.call(s.querySelectorAll('.fragment')), order = [];
      f.forEach(function (x, i) { var n = x.getAttribute('data-fragment-index'); x._o = n == null || n === '' ? null : Number(n); x._i = i; });
      /* Reveal's rule: numbered fragments in number order, unnumbered ones after them in page order. */
      var keys = []; f.forEach(function (x) { var k = x._o == null ? 'u' + x._i : 'n' + x._o; if (keys.indexOf(k) < 0) keys.push(k); });
      keys.sort(function (a, b) { return (a[0] === b[0]) ? Number(a.slice(1)) - Number(b.slice(1)) : (a[0] === 'n' ? -1 : 1); });
      keys.forEach(function (k) { order.push(f.filter(function (x) { return (x._o == null ? 'u' + x._i : 'n' + x._o) === k; })); });
      return order;
    }
    function paintFragments(s, k) {
      fragments(s).forEach(function (group, i) { group.forEach(function (x) { x.classList.toggle('shown', i < k); x.classList.toggle('now', i === k - 1); }); });
    }
    /* A slide is laid out at 1280 by 720 and scaled to the window. Text that still overflows is shrunk a little; a
       slide that would need more than that scrolls. */
    function fit(s) {
      var body = s.querySelector('.slide-body'); if (!body || s.classList.contains('title-slide')) return;
      var f = 1, media = 540, over = function () { return body.scrollHeight > body.clientHeight + 2; };
      s.style.setProperty('--fit', 1); s.style.setProperty('--media', media + 'px'); body.classList.remove('scrolls');
      /* Pictures and diagrams give way first, then the text. */
      while (over() && media > 300) { media -= 30; s.style.setProperty('--media', media + 'px'); }
      while (over() && f > 0.62) { f -= 0.04; s.style.setProperty('--fit', f.toFixed(2)); }
      if (over()) body.classList.add('scrolls');
    }
    function scale() {
      if (!on) return;
      var k = Math.min(root.innerWidth / W, (root.innerHeight - (presenter ? 0 : 0)) / H);
      deck.style.setProperty('--k', k.toFixed(4));
    }
    function clone(s, into, k) {
      var c = s.cloneNode(true); c.removeAttribute('id'); c.classList.add('current');
      [].forEach.call(c.querySelectorAll('[id]'), function (x) { x.removeAttribute('id'); });
      into.replaceChildren(c);
      var w = into.clientWidth; into.style.height = (w * H / W) + 'px'; c.style.setProperty('--k', (w / W).toFixed(4));
      fit(c);
      [].forEach.call(c.querySelectorAll('.fragment'), function (x) { x.classList.add('shown'); });
      if (k != null) paintFragments(c, k);
    }
    function show(n, k, quiet) {
      at = Math.max(0, Math.min(slides.length - 1, n));
      var s = slides[at], steps = fragments(s).length;
      step = k == null ? 0 : Math.max(0, Math.min(steps, k));
      slides.forEach(function (x, i) { x.classList.toggle('current', i === at); });
      paintFragments(s, step); fit(s);
      document.getElementById('deck-count').textContent = (at + 1) + ' / ' + slides.length;
      progress.firstChild.style.width = (100 * (at + 1) / slides.length) + '%';
      try { root.history.replaceState(null, '', '#/' + (at + 1)); } catch (e) { /* opened from disk in a browser that refuses: the address just doesn't follow */ }
      if (presenter) {
        clone(s, document.getElementById('presenter-now'), step);
        var nx = slides[at + 1], box = document.getElementById('presenter-next');
        if (nx) clone(nx, box); else box.replaceChildren(el('p', { class: 'muted', text: 'End of the lesson.' }));
        var note = document.getElementById('presenter-notes');
        if (notes && notes[s.id]) note.innerHTML = notes[s.id];
        else note.replaceChildren(el('p', { class: 'muted', text: hasNotes ? 'No notes for this slide.' : 'This copy of the lesson has no speaker notes. Present from your copy of the course repo to see them.' }));
        note.scrollTop = 0;
        document.getElementById('presenter-count').textContent = 'Slide ' + (at + 1) + ' of ' + slides.length + (steps ? ' · step ' + step + ' of ' + steps : '');
      }
      if (!quiet) tell();
    }
    function tell() { try { if (other && !other.closed) other.postMessage({ bcDeck: id, n: at, step: step, black: black }, '*'); } catch (e) { /* the other window has gone */ } }
    function forward() { if (step < fragments(slides[at]).length) show(at, step + 1); else if (at < slides.length - 1) show(at + 1, 0); }
    function back() { if (step > 0) show(at, step - 1); else if (at > 0) show(at - 1, fragments(slides[at - 1]).length); }
    function nearest() {   // the slide nearest the top of the window, so Present starts where the reader is
      var best = 0, d = Infinity;
      slides.forEach(function (s, i) { var y = Math.abs(s.getBoundingClientRect().top - 80); if (y < d) { d = y; best = i; } });
      return root.scrollY < 40 ? 0 : best;
    }
    function start(n) {
      if (on) return show(n, 0);
      on = true; document.documentElement.classList.add('deck-on'); if (presenter) document.documentElement.classList.add('deck-presenter');
      scale(); show(n, 0);
    }
    function stop() {
      if (!on || presenter) return;
      on = false; black = false; document.documentElement.classList.remove('deck-on', 'deck-black');
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
      slides.forEach(function (x) { x.classList.remove('current'); x.style.removeProperty('--fit'); [].forEach.call(x.querySelectorAll('.fragment'), function (f) { f.classList.remove('shown', 'now'); }); });
      try { root.history.replaceState(null, '', '#' + slides[at].id); } catch (e) { /* as above */ }
      slides[at].scrollIntoView({ block: 'start' });
    }
    function full() {
      var d = document.documentElement;
      if (document.fullscreenElement) document.exitFullscreen(); else if (d.requestFullscreen) d.requestFullscreen().catch(function () { /* refused: stays in the window */ });
    }
    function openPresenter() {
      var url = root.location.href.split('#')[0].split('?')[0] + '?view=presenter#/' + (at + 1);
      other = root.open(url, 'bc-presenter', 'width=1100,height=760');
      if (!other) Kit.toast ? Kit.toast('The browser blocked the presenter window. Allow pop-ups for this page.') : root.alert('The browser blocked the presenter window. Allow pop-ups for this page and press S again.');
    }
    function setBlack(b) { black = b; document.documentElement.classList.toggle('deck-black', b && !presenter); }

    document.getElementById('deck-prev').addEventListener('click', back);
    document.getElementById('deck-next').addEventListener('click', forward);
    document.getElementById('deck-exit').addEventListener('click', stop);
    document.getElementById('deck-full').addEventListener('click', full);
    document.getElementById('deck-open-presenter').addEventListener('click', openPresenter);
    root.addEventListener('resize', function () { scale(); if (on) show(at, step, true); });
    root.addEventListener('message', function (e) {
      var d = e.data; if (!d || d.bcDeck !== id) return;
      if (!other && e.source) other = e.source;
      if (d.hello) return tell();
      if (!on) start(d.n);
      setBlack(!!d.black); show(d.n, d.step, true);
    });
    document.addEventListener('keydown', function (e) {
      if (!on || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '')) return;
      var k = e.key;
      if (/^[0-9]$/.test(k)) { typed += k; return; }
      if (k === 'Enter' && typed) { show(Number(typed) - 1, 0); typed = ''; e.preventDefault(); return; }
      typed = '';
      if (k === 'ArrowRight' || k === 'ArrowDown' || k === ' ' || k === 'PageDown' || k === 'Enter') forward();
      else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') back();
      else if (k === 'Home') show(0, 0);
      else if (k === 'End') show(slides.length - 1, 0);
      else if (k === 'Escape') { if (black) { setBlack(false); tell(); } else stop(); }
      else if (k === 'f' || k === 'F') full();
      else if (k === 's' || k === 'S') { if (!presenter) openPresenter(); }
      else if (k === 'b' || k === 'B' || k === '.') { setBlack(!black); tell(); }
      else return;
      e.preventDefault();
    }, true);
    /* A clicker sends arrow or page keys. A touch screen swipes. */
    var touchX = null;
    deck.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    deck.addEventListener('touchend', function (e) {
      if (!on || touchX == null) return;
      var dx = e.changedTouches[0].clientX - touchX; touchX = null;
      if (dx < -50) forward(); else if (dx > 50) back();
    });
    /* A link to a source or another slide moves to that slide instead of scrolling a hidden page. */
    deck.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href^="#"]') : null; if (!a || !on) return;
      var t = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))), s = t && t.closest('.slide');
      if (s) { e.preventDefault(); show(slides.indexOf(s), 0); }
    });

    if (presenter) {
      var began = Date.now();
      document.getElementById('presenter-timer').addEventListener('click', function () { began = Date.now(); tick(); });
      var tick = function () {
        var now = new Date(), t = Math.floor((Date.now() - began) / 1000), p = function (x) { return (x < 10 ? '0' : '') + x; };
        document.getElementById('presenter-time').textContent = p(now.getHours()) + ':' + p(now.getMinutes());
        document.getElementById('presenter-timer').textContent = p(Math.floor(t / 60)) + ':' + p(t % 60);
      };
      tick(); root.setInterval(tick, 1000);
      try { if (other) other.postMessage({ bcDeck: id, hello: true }, '*'); } catch (e) { /* opened on its own: it still works as a second screen */ }
    }
    var m = /^#\/(\d+)$/.exec(root.location.hash);
    if (presenter || m || /[?&]present\b/.test(root.location.search)) start(m ? Number(m[1]) - 1 : 0);
    [].forEach.call(deck.querySelectorAll('img'), function (img) { if (!img.complete) img.addEventListener('load', function () { if (on) show(at, step, true); }); });
  };
})(window);

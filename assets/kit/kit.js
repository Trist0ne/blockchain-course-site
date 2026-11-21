/* Course kit: shared helpers for every quiz, lab and tool page.
   Classic script (no modules) with no network dependencies, so it works from GitHub Pages, a self-hosted Pages
   site or a plain file. Exposes window.Kit.

   Identity: each student has a 12-word seed phrase and the Ethereum account it derives (kit/wallet.js).
   Submissions: the page signs an EIP-4361 "Sign-In with Ethereum" message covering the submission, seals the lot to
   the class's public key (ECDH P-256 + HKDF-SHA256 + AES-256-GCM, Web Crypto), and posts it to the class inbox
   in one click. The inbox token ships locked; the class code from the board unlocks it. With no inbox or no
   network, the same sealed code can be copied or downloaded. Answer keys never ship to students. */
(function (root) {
  'use strict';
  var Kit = {};
  var enc = new TextEncoder();
  var dec = new TextDecoder();
  Kit.version = '0.19.0';
  /* Which course commit this site was cut from. tools/cut_delivery.py rewrites this line; 'dev' means an uncut working copy.
     Every record carries it, so a class can always be graded with the course repo as it was when the class was cut. */
  Kit.build = { commit: '62fe3f6d4788', date: '2026-11-21' };
  /* A file of this site, named by build, so a page never pairs with another build's copy of it. */
  Kit.asset = function (path) { return path + (Kit.build.commit === 'dev' ? '' : '?v=' + Kit.build.commit); };
  /* Where this file was loaded from, so pages at any depth can link to shared pages such as setup.html. */
  var here = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
  Kit.base = here.replace(/kit\.js(\?.*)?$/, '');

  /* ---------- Storage (government machines may block or wipe it; nothing depends on it) ---------- */
  var NS = 'bc-kit:';
  function storage(kind) {
    return {
      get: function (k, d) { try { var v = root[kind].getItem(NS + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
      set: function (k, v) { try { root[kind].setItem(NS + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
      del: function (k) { try { root[kind].removeItem(NS + k); } catch (e) { /* ignore */ } },
      /* Values of every stored key that starts with `prefix`. */
      all: function (prefix) {
        var out = [];
        try { for (var i = 0; i < root[kind].length; i++) { var k = root[kind].key(i); if (k.indexOf(NS + prefix) === 0) out.push(JSON.parse(root[kind].getItem(k))); } } catch (e) { /* ignore */ }
        return out;
      }
    };
  }
  Kit.store = storage('localStorage');
  Kit.session = storage('sessionStorage');
  /* What this computer remembers about one class: handles registered here, the class code, what was handed in, answers
     in progress. Kept apart per class (by the class key), so a new class on the same computer starts clean. */
  function scope() { return 'c:' + String((root.BC_CLASS || {}).classKey || 'none').slice(0, 16) + ':'; }
  Kit.mine = {
    get: function (k, d) { return Kit.store.get(scope() + k, d); },
    set: function (k, v) { Kit.store.set(scope() + k, v); },
    del: function (k) { Kit.store.del(scope() + k); },
    all: function (prefix) { return Kit.store.all(scope() + prefix); }
  };

  /* ---------- Bytes ---------- */
  Kit.hex = {
    clean: function (h) { return String(h).toLowerCase().replace(/[^0-9a-f]/g, ''); },
    toBytes: function (h) {
      h = Kit.hex.clean(h);
      if (h.length % 2) throw new Error('Odd number of hex digits (' + h.length + '). Every byte is two hex digits.');
      var b = new Uint8Array(h.length / 2);
      for (var i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16);
      return b;
    },
    from: function (b) { var s = ''; for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16); return s; }
  };
  Kit.b64u = {
    from: function (b) {
      b = new Uint8Array(b); var s = '';
      for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    toBytes: function (s) {
      s = String(s).replace(/-/g, '+').replace(/_/g, '/');
      while (s.length % 4) s += '=';
      var bin = atob(s), b = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
      return b;
    }
  };

  /* ---------- Hashing (Web Crypto: real SHA-256) ---------- */
  function subtle() {
    var c = root.crypto && root.crypto.subtle;
    if (!c) throw new Error('This browser is blocking Web Crypto on this page. Open the course site over https, or open the file directly from disk.');
    return c;
  }
  Kit.sha256 = function (bytes) { return subtle().digest('SHA-256', bytes).then(function (d) { return new Uint8Array(d); }); };
  Kit.sha256d = function (bytes) { return Kit.sha256(bytes).then(Kit.sha256); };

  /* ---------- Seeding: same seed, same world, on every student's machine ---------- */
  Kit.hash32 = function (str) { // FNV-1a. For choosing variants only, never for security.
    var h = 2166136261 >>> 0; str = String(str);
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  Kit.rng = function (seed) { // mulberry32
    var a = Kit.hash32(seed) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  Kit.shuffle = function (arr, rand) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  };

  /* ---------- Class ---------- */
  Kit.cls = function () { return root.BC_CLASS || {}; };
  Kit.room = function () { return Kit.cls().room || 'OPEN'; };
  Kit.inbox = function () { var i = Kit.cls().inbox; return i && i.repo && i.locked ? i : null; };
  Kit.normHandle = function (h) { return String(h || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]/g, '').slice(0, 40); };
  Kit.normCode = function (c) { return String(c || '').trim().toLowerCase().replace(/[\s_]+/g, '-'); };

  /* ---------- Identity: a seed phrase, and the account it derives ----------
     The account address is the identity. The handle is typed once, when the phrase is created, and travels to the
     instructor in a signed registration; after that the student signs in with the class code and their 12 words.
     The phrase is held for this browser session only (sessionStorage): it survives moving between course pages and
     is gone when the tab or browser closes. Students re-enter their words each time, on purpose. */
  var idCache = null, meCache = null;
  Kit.store.del('id'); // an earlier kit version could remember the phrase on the computer; make sure none is left behind
  Kit.identity = function () {
    if (idCache) return idCache;
    var id = Kit.session.get('id', null);
    if (id && id.phrase) idCache = id;
    return idCache;
  };
  function saveIdentity(id) { idCache = id; meCache = null; Kit.session.set('id', id); }
  Kit.signOut = function () { idCache = meCache = null; Kit.session.del('id'); };
  /* The signed-in student's account: { address, handle, sign }. Needs kit/wallet.js on the page.
     handle is only a label this computer remembers (it is not secret); it is '' on a computer that has not seen it. */
  Kit.me = function () {
    var id = Kit.identity();
    if (!id) return null;
    if (!meCache) { var w = Kit.wallet.fromPhrase(id.phrase); meCache = { address: w.address, pub: w.pub, handle: Kit.mine.get('name:' + w.address, ''), sign: w.sign, open: w.open }; }
    return meCache;
  };
  Kit.who = function () { var me = Kit.me(); return me ? me.address.toLowerCase() : ''; };
  Kit.handle = function () { var me = Kit.me(); return me ? me.handle : ''; };
  Kit.short = function (s, n) { s = String(s); n = n || 4; return s.length <= 2 * n + 3 ? s : s.slice(0, n + 2) + '…' + s.slice(-n); };
  /* Seed for a student's own variant of an item: same class + same account = same variant, on any computer. */
  Kit.seedFor = function (itemId) { return Kit.room() + '|' + Kit.who() + '|' + itemId; };

  /* ---------- DOM ---------- */
  Kit.el = function (tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k) || attrs[k] == null || attrs[k] === false) continue;
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k]; // only ever used with page-authored strings
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k] === true ? '' : attrs[k]);
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x != null && x !== false) n.append(x); });
      else n.append(c);
    }
    return n;
  };
  Kit.$ = function (sel, scope) { return (scope || document).querySelector(sel); };
  var el = Kit.el;

  /* ---------- Chrome: top bar, footer, theme, projector mode ---------- */
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  function applyDisplay(d) {
    if (d === 'projector') document.documentElement.setAttribute('data-display', 'projector');
    else document.documentElement.removeAttribute('data-display');
  }
  if (typeof document !== 'undefined') {
    applyTheme(Kit.store.get('theme', 'auto'));
    var wantsProjector = /[?&]display=projector\b/.test(root.location.search);
    applyDisplay(wantsProjector ? 'projector' : Kit.store.get('display', 'normal'));
  }

  /* Two linked blocks. Drawn with theme colours, so it works in light and dark; no emoji font needed. */
  var BRAND_SVG = '<svg viewBox="0 0 32 32" width="100%" height="100%"><rect width="32" height="32" rx="7" fill="var(--ink)"/>' +
    '<g fill="none" stroke="var(--bg)" stroke-width="2.6"><rect x="5" y="11" width="10" height="10" rx="2.5"/><rect x="17" y="11" width="10" height="10" rx="2.5"/></g>' +
    '<path d="M13 16h6" stroke="var(--accent)" stroke-width="2.6"/></svg>';

  Kit.chrome = function (opts) {
    opts = opts || {};
    var c = Kit.cls();
    var main = document.querySelector('main') || document.body.appendChild(el('main', { class: 'page' }));
    var chip = el('button', { class: 'chip', type: 'button', title: 'Your course identity' }), askedHandle = false;
    function paintChip() {
      var id = Kit.identity();
      if (!id) { chip.replaceChildren(el('span', { text: 'not signed in' })); return; }
      if (!Kit.wallet) { chip.replaceChildren(el('span', { text: 'signed in' })); return; }
      var me = Kit.me();
      chip.replaceChildren(el('span', { class: 'mono', text: Kit.short(me.address) }));
      if (me.handle) chip.prepend(el('b', { text: me.handle })); // replaceChildren would print a missing handle as the word "null"
      else if (Kit.inbox() && !askedHandle) { askedHandle = true; Kit.myRecords(); }   // a computer that has never seen this student: the class knows their handle
    }
    paintChip();
    chip.addEventListener('click', function () { if (Kit.identity() && Kit.wallet) Kit.identityPanel(); else if (Kit.wallet) Kit.signIn(); });
    Kit._paintChip = paintChip;

    var themeBtn = el('button', { class: 'icon-btn', type: 'button', title: 'Theme: follow system, light or dark' });
    function paintTheme() { var t = Kit.store.get('theme', 'auto'); themeBtn.textContent = t === 'auto' ? '◐ auto' : t === 'dark' ? '● dark' : '○ light'; }
    paintTheme();
    themeBtn.addEventListener('click', function () {
      var order = ['auto', 'light', 'dark'];
      var t = order[(order.indexOf(Kit.store.get('theme', 'auto')) + 1) % 3];
      Kit.store.set('theme', t); applyTheme(t); paintTheme();
    });

    var top = el('header', { class: 'topbar' },
      el('a', { class: 'brand', href: opts.home || '#' }, el('span', { class: 'brand-mark', 'aria-hidden': 'true', html: BRAND_SVG }), el('span', { text: c.course || 'Blockchain Technology' })),
      opts.crumbs ? el('span', { class: 'crumbs' }, opts.home && opts.crumbs !== 'Home' ? el('a', { href: opts.home, id: 'kit-home-link', text: 'Home' }) : null, opts.home && opts.crumbs !== 'Home' ? ' / ' : null, opts.crumbs) : null,
      el('span', { class: 'topbar-spacer' }),
      opts.noHandle ? null : chip,
      themeBtn
    );
    document.body.insertBefore(top, document.body.firstChild);
    document.body.appendChild(el('footer', { class: 'foot' },
      el('span', null, (c.course || 'Blockchain Technology') + (c.classId ? ' · class ' + c.classId : '') + ' · ', el('a', { href: Kit.base + '../dashboard.html', id: 'kit-staff-link', text: 'Instructors' })),
      el('span', null, 'Press ', el('kbd', { text: 'P' }), ' for projector view · kit v' + Kit.version + ' · build ' + Kit.build.commit)
    ));
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'p' || e.key === 'P') && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        var d = document.documentElement.getAttribute('data-display') === 'projector' ? 'normal' : 'projector';
        Kit.store.set('display', d); applyDisplay(d);
      }
    });
    if (opts.title) document.title = opts.title + ' · ' + (c.course || 'Blockchain Technology');
    /* A class repo fresh from the template has no settings file yet. Say so, and point the instructor at setup. */
    if (!c.classKey && !opts.noSetupNotice) main.insertBefore(el('div', { class: 'callout warn', id: 'kit-unconfigured', style: 'margin:0 0 1rem' },
      el('b', { text: 'This class isn\'t set up yet. ' }), 'You can look around, but nothing can be handed in. Instructors: set it up from your copy of the course repo (open ',
      el('code', { text: 'instructor/setup.html' }), ').'), main.firstChild);
    return main;
  };

  /* ---------- Sign-in. Resolves with Kit.me(). ----------
     Returning students: class code + 12 words. New students: handle + class code, then a new phrase. */
  function panelAtTop(id, children) {
    var old = document.getElementById(id); if (old) old.remove();
    var p = el('section', { class: 'panel', id: id }, children);
    var main = document.querySelector('main'); main.insertBefore(p, main.firstChild);
    p.scrollIntoView({ block: 'start' });
    return p;
  }
  function wordGrid(phrase) { return el('ol', { class: 'words' }, phrase.split(' ').map(function (w) { return el('li', { text: w }); })); }

  /* ---------- Typing a seed phrase: one box per word, the way wallets do it ----------
     Suggestions come from the course word list as you type. Tab, Enter or Space takes the suggestion and moves on;
     four letters are always enough, so the box completes itself; Backspace in an empty box goes back; pasting a whole
     phrase fills every box. Kit.phraseInput({ id, numbers }) returns the element, with getPhrase(), words(), clear()
     and focusFirst(). The first box has the given id; `numbers` labels the boxes (default 1 to 12). */
  Kit.phraseInput = function (opts) {
    opts = opts || {};
    var WORDS = root.BC_WORDS || [], numbers = opts.numbers || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    var hint = el('div', { class: 'pw-suggest', 'aria-live': 'polite' }), boxes = [], active = 0;
    function matches(v) { if (!v) return []; var out = []; for (var i = 0; i < WORDS.length && out.length < 6; i++) if (WORDS[i].indexOf(v) === 0) out.push(WORDS[i]); return out; }
    function isWord(v) { return WORDS.indexOf(v) >= 0; }
    function paint(i) {
      var v = boxes[i].value, m = matches(v), box = boxes[i].parentNode;
      box.classList.toggle('ok', isWord(v)); box.classList.toggle('bad', !!v && !m.length);
      if (i !== active) return;
      hint.replaceChildren.apply(hint, !v ? [el('span', { class: 'muted', text: 'Start typing word ' + numbers[i] + '. Tab or Enter completes it.' })]
        : !m.length ? [el('span', { class: 'pw-none', text: '"' + v + '" isn\'t a course word. Check your card.' })]
        : m.map(function (w, k) { return el('button', { type: 'button', class: 'pw-pick' + (k === 0 ? ' first' : ''), tabindex: '-1', text: w, onmousedown: function (e) { e.preventDefault(); take(i, w, true); } }); }));
    }
    function go(i) { if (i >= 0 && i < boxes.length) { boxes[i].focus(); boxes[i].select(); } }
    function take(i, w, advance) { boxes[i].value = w; paint(i); if (advance) { if (i + 1 < boxes.length) go(i + 1); else if (opts.onDone) opts.onDone(); } }
    numbers.forEach(function (n, i) {
      var input = el('input', { type: 'text', class: 'mono ' + (opts.boxClass || ''), id: i === 0 ? opts.id : (opts.id ? opts.id + '-' + (i + 1) : null), 'data-n': String(n),
        autocomplete: 'off', autocapitalize: 'none', autocorrect: 'off', spellcheck: 'false', 'aria-label': 'Word ' + n });
      boxes.push(input);
      input.addEventListener('focus', function () { active = i; paint(i); });
      input.addEventListener('input', function () {
        var raw = input.value.toLowerCase().replace(/[^a-z\s]/g, '').replace(/^\s+/, ''), parts = raw.trim().split(/\s+/).filter(Boolean);
        if (/\s/.test(raw) && parts.length) {   // a space, or a pasted phrase: spread the words over the boxes from here
          for (var k = 0; k < parts.length && i + k < boxes.length; k++) { boxes[i + k].value = parts[k]; paint(i + k); }
          var next = Math.min(i + parts.length, boxes.length - 1);
          if (parts.length === 1 && !isWord(parts[0])) next = i;   // a space after a half-typed word: stay and show why
          active = next; go(next); paint(next);
          return;
        }
        input.value = raw; active = i;
        var m = matches(raw);
        /* A whole word that cannot be the start of a longer one moves on by itself. A half-typed word never does:
           someone who keeps typing must not find the rest of it in the next box. */
        if (m.length === 1 && m[0] === raw && document.activeElement === input) return take(i, raw, true);
        paint(i);
      });
      input.addEventListener('keydown', function (e) {
        var v = input.value, m = matches(v);
        if (e.key === 'Backspace' && !v && i > 0) { e.preventDefault(); go(i - 1); return; }
        if ((e.key === 'Enter' || e.key === ' ' || (e.key === 'Tab' && !e.shiftKey)) && v) {
          if (!isWord(v) && m.length) { input.value = m[0]; paint(i); }
          if (e.key === 'Tab') return;                       // the browser moves to the next box by itself
          if (e.key === 'Enter' && i === boxes.length - 1) return;   // Enter in the last box submits the form
          e.preventDefault();
          if (isWord(input.value)) go(i + 1);
        }
      });
    });
    var grid = el('div', { class: 'pw-grid' + (numbers.length < 12 ? ' few' : '') }, boxes.map(function (b, i) { return el('label', { class: 'pw' }, el('span', { text: String(numbers[i]) }), b); }));
    var wrap = el('div', { class: 'pw-wrap' }, grid, hint);
    wrap.words = function () { return boxes.map(function (b) { return b.value.trim().toLowerCase(); }); };
    wrap.getPhrase = function () { return wrap.words().filter(Boolean).join(' '); };
    wrap.clear = function () { boxes.forEach(function (b, i) { b.value = ''; paint(i); }); };
    wrap.focusFirst = function () { go(0); };
    paint(0);
    return wrap;
  };
  var NEVER = 'Never type a real wallet\'s seed phrase into a web page: not this one, not any. A real phrase controls real money. This course uses its own words, which work the same way but can\'t open a real wallet.';
  var REAL = 'Stop: that looks like a real wallet\'s seed phrase. Never type one into a website. Nothing was stored or sent, but if those words protect real money, treat them as exposed to this computer. This course uses its own words: the 12 on your backup card.';

  /* While someone is signing in, the sign-in is the only thing on the page. */
  function gate(on) { var m = document.querySelector('main'); if (m) m.classList.toggle('kit-gated', !!on); }
  function stepper(n) {
    return el('ol', { class: 'kit-steps', 'aria-label': 'Step ' + n + ' of 3' }, ['Your handle', 'Your seed phrase', 'Check it'].map(function (t, i) {
      return el('li', { class: i + 1 === n ? 'now' : i + 1 < n ? 'done' : null, 'aria-current': i + 1 === n ? 'step' : null }, el('span', { text: String(i + 1) }), t);
    }));
  }

  Kit.signIn = function () {
    if (Kit.identity()) return Promise.resolve(Kit.me());
    return new Promise(function (resolve) {
      var inbox = Kit.inbox();
      /* The class code is a shared classroom secret, not a personal one, so this computer may remember it.
         (The seed phrase is never remembered.) */
      var codeVal = inbox ? Kit.mine.get('code', '') : '', savedCode = !!codeVal;
      var known = Kit.mine.all('name:');
      var msg = el('div', { id: 'kit-msg' });
      var panel = panelAtTop('kit-signin', []);
      gate(true);

      function fail(text) { msg.replaceChildren(el('div', { class: 'callout bad', text: text })); }
      function codeField() {
        if (!inbox) return null;
        var input = el('input', { type: 'text', class: 'mono', placeholder: 'four words, from the board', autocomplete: 'off', id: 'kit-code', value: codeVal || null });
        input.addEventListener('input', function () { codeVal = input.value; });
        return el('label', { class: 'field' }, el('span', { text: savedCode ? 'Class code (remembered on this computer)' : 'Class code (on the board)' }), input);
      }
      /* Resolves with the checked class code ('' when the class has no inbox), or null after showing why not. */
      function checkCode() {
        if (!inbox) return Promise.resolve('');
        var code = Kit.normCode(codeVal);
        if (!code) { fail('Enter the class code your instructor wrote on the board.'); return Promise.resolve(null); }
        return Kit.unlockToken(inbox.locked, code).then(function () { Kit.mine.set('code', code); return code; },
          function () { Kit.mine.del('code'); fail('That class code doesn\'t unlock this class. Check the spelling against the board.'); return null; });
      }
      function finish(code, phrase, newHandle, reason) {
        saveIdentity({ phrase: phrase, code: code });
        var me = Kit.me();
        if (newHandle) { Kit.mine.set('name:' + me.address, newHandle); meCache = null; me = Kit.me(); }
        panel.remove(); gate(false); if (Kit._paintChip) Kit._paintChip();
        if (newHandle) Kit.register(reason);
        resolve(me);
      }
      function links(list) {
        var p = el('p', { class: 'kit-links small' });
        list.forEach(function (l, i) {
          if (i) p.append(' · ');
          p.append(el('a', { href: '#', id: l[0], text: l[1], onclick: function (e) { e.preventDefault(); msg.replaceChildren(); l[2](); } }));
        });
        return p;
      }

      /* ---- Returning student: class code (usually remembered) and the 12 words ---- */
      function viewSignIn() {
        var phraseIn = Kit.phraseInput({ id: 'kit-phrase' });
        panel.replaceChildren(
          el('h2', { text: 'Sign in' }),
          el('form', { onsubmit: function (e) {
            e.preventDefault();
            checkCode().then(function (code) {
              if (code === null) return;
              var typed = phraseIn.getPhrase();
              if (Kit.wallet.looksReal(typed)) { phraseIn.clear(); return fail(REAL); }
              if (typed.split(' ').length < 12) return fail('Fill in all 12 words from your card.');
              if (!Kit.wallet.validPhrase(typed)) return fail('Those 12 words don\'t make a valid phrase. Every word is on the list, so one is in the wrong box or is a different word: check the order against your card.');
              /* The instructor words are a valid phrase, so they would quietly open a student account of their own. */
              var c = Kit.cls();
              if (c.classAddress && Kit.wallet.fromPhrase(typed, Kit.wallet.CLASS_PATH).address.toLowerCase() === String(c.classAddress).toLowerCase()) {
                phraseIn.clear();
                return fail('Those are this class\'s instructor words, not a student\'s. Instructors sign in from the "Instructors" link at the foot of the page.');
              }
              finish(code, Kit.wallet.normPhrase(typed), null);
            });
          } },
            codeField(),
            el('div', { class: 'field' }, el('span', { class: 'pw-label', text: 'Your seed phrase: the 12 words on your backup card' }), phraseIn),
            el('p', { class: 'small muted', text: 'Course words only. Never type a real wallet\'s seed phrase into a web page.' }),
            el('div', { class: 'btn-row', style: 'margin-top:0' }, el('button', { class: 'btn primary', type: 'submit', id: 'kit-go', text: 'Sign in' }))),
          msg,
          links([['kit-to-first', 'First time here?', function () { viewHandle('new'); }], ['kit-to-lost', 'Lost your seed phrase?', function () { viewHandle('lost'); }]]));
        if (inbox && !savedCode) panel.querySelector('#kit-code').focus(); else phraseIn.focusFirst();
      }

      /* ---- Step 1 of 3: who you are. The same step starts a replacement for a lost phrase. ---- */
      function viewHandle(reason) {
        var lost = reason === 'lost';
        var handleIn = el('input', { type: 'text', class: 'mono', placeholder: 'firstname.lastname', autocomplete: 'off', maxlength: '40', id: lost ? 'kit-handle-lost' : 'kit-handle' });
        panel.replaceChildren(
          stepper(1),
          el('h2', { text: lost ? 'Replace a lost seed phrase' : 'Welcome. Let\'s set you up.' }),
          lost ? el('div', { class: 'callout warn', style: 'margin:0 0 .75rem' }, 'Nobody can recover a seed phrase, so you make a new one under the same handle. Your earlier work is kept. ', el('b', { text: 'Tell your instructor afterwards: they have to approve it.' }))
            : el('p', { text: 'You sign in to this course the way people sign in to blockchain apps: with a seed phrase only you hold. No account, no password. It takes about two minutes, once.' }),
          el('form', { onsubmit: function (e) {
            e.preventDefault();
            var h = Kit.normHandle(handleIn.value);
            if (h.length < 2) return fail('Enter your handle as firstname.lastname (letters, digits, dot, dash or underscore).');
            if (!lost && known.indexOf(h) >= 0) return fail('This computer has already registered ' + h + ' in this class. If you have your 12 words, sign in with them. If you lost them, choose "Lost your seed phrase?" below.');
            checkCode().then(function (code) { if (code !== null) viewWords(code, h, reason); });
          } },
            el('label', { class: 'field' }, el('span', { text: lost ? 'Your handle, exactly as you registered it' : 'Your handle: firstname.lastname' }), handleIn),
            codeField(),
            el('div', { class: 'btn-row', style: 'margin-top:0' }, el('button', { class: 'btn primary', type: 'submit', id: lost ? 'kit-replace' : 'kit-create', text: 'Continue' }))),
          msg,
          links(lost ? [['kit-to-signin', 'I have my seed phrase after all', viewSignIn]]
            : [['kit-to-signin', 'I already have a seed phrase', viewSignIn], ['kit-to-lost', 'Lost your seed phrase?', function () { viewHandle('lost'); }]]));
        handleIn.focus();
      }

      /* ---- Step 2 of 3: the words ---- */
      function viewWords(code, handle, reason) {
        var phrase = Kit.wallet.newPhrase(), words = phrase.split(' ');
        function show() {
          msg.replaceChildren();
          panel.replaceChildren(
            stepper(2),
            el('h2', { text: 'Write these 12 words on your card' }),
            el('p', { text: 'In order, by hand. They are your sign-in for the whole course.' }),
            wordGrid(phrase),
            el('ul', { class: 'small kit-rules' },
              el('li', null, el('b', { text: 'Don\'t photograph or type them anywhere. ' }), 'Anyone who has them can hand in work as you.'),
              el('li', null, el('b', { text: 'Don\'t lose the card. ' }), 'Nobody can look the words up for you, not even your instructor.'),
              el('li', { text: 'These are course words. They work like a real wallet\'s seed phrase, but can\'t open one.' })),
            el('div', { class: 'btn-row' }, el('button', { class: 'btn primary', type: 'button', id: 'kit-written', text: 'I\'ve written them down', onclick: check })));
          panel.querySelector('#kit-written').focus();
        }
        /* ---- Step 3 of 3: check the backup, as real wallets do. The words are hidden and two are asked for. ---- */
        function check() {
          var picks = Kit.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], Math.random).slice(0, 2).sort(function (x, y) { return x - y; });
          var two = Kit.phraseInput({ numbers: picks.map(function (i) { return i + 1; }), boxClass: 'kit-confirm' });
          panel.replaceChildren(
            stepper(3),
            el('h2', { text: 'Read two words back from your card' }),
            el('p', { class: 'muted', text: 'A backup you have never checked is a backup you can\'t trust.' }),
            el('form', { onsubmit: function (e) {
              e.preventDefault();
              var got = two.words();
              if (picks.every(function (i, k) { return got[k] === words[i]; })) finish(code, phrase, handle, reason);
              else fail('Those don\'t match. Check your card, or go back and look at the words again.');
            } },
              two,
              el('div', { class: 'btn-row', style: 'margin-top:0' },
                el('button', { class: 'btn primary', type: 'submit', text: 'Finish' }),
                el('button', { class: 'btn', type: 'button', text: 'Show the words again', onclick: show }))),
            msg);
          two.focusFirst();
        }
        show();
      }

      /* A computer that has never been used for this class starts with the welcome; any other with sign-in. */
      if (!savedCode && !known.length) viewHandle('new'); else viewSignIn();
    });
  };

  /* Tell the instructor which handle this account belongs to. Sent when a phrase is created: reason is 'new' for a
     first registration and 'lost' when it replaces a lost phrase. A first registration that goes through needs
     nothing from the student, so it shrinks to one line that goes away by itself. */
  Kit.register = function (reason) {
    var me = Kit.me(), out = el('div'), p, lost = reason === 'lost';
    p = panelAtTop('kit-registered', [
      el('div', { class: 'panel-head' }, el('h2', { text: (lost ? 'New seed phrase for ' : 'Registering ') + (me.handle || 'your account') }), el('button', { class: 'icon-btn', type: 'button', text: 'Close', onclick: function () { p.remove(); } })),
      lost ? el('div', { class: 'callout warn', id: 'kit-tell', style: 'margin:0 0 .75rem' }, el('b', { text: 'Tell your instructor now. ' }), 'They need to approve this new seed phrase. Until they do, your new work is saved but not counted. Your earlier work is kept.')
        : el('p', { class: 'muted small', text: 'Linking your handle to your account for your instructor.' }),
      out]);
    return Kit.submit(out, { kind: 'register', item: 'register', data: { handle: me.handle, reason: lost ? 'lost' : 'new' } }, 'Registration').then(function (r) {
      if (r && r.sent && !lost) {
        var note = el('div', { class: 'callout ok', id: 'kit-registered', style: 'margin:0 0 1rem' }, el('b', { text: 'You\'re set up, ' + me.handle + '. ' }), 'From now on you sign in with your 12 words.');
        p.replaceWith(note);
        setTimeout(function () { note.remove(); }, 12000);
      }
      return r;
    });
  };

  Kit.identityPanel = function () {
    var id = Kit.identity(), me = Kit.me(), reveal = el('div');
    var handleCell = el('td', { class: 'mono', text: me.handle || 'looking it up in the class…' });
    if (!me.handle) Kit.myRecords().then(function (m) {
      handleCell.textContent = m.handle || (!m.ok ? 'couldn\'t reach the class to look it up' : m.n ? 'registered with your instructor' : 'this account is not registered in this class');
    });
    var p = panelAtTop('kit-identity', [
      el('div', { class: 'panel-head' }, el('h2', { text: 'Your course identity' }), el('button', { class: 'icon-btn', type: 'button', text: 'Close', onclick: function () { p.remove(); } })),
      el('table', { class: 'data' }, el('tbody', null,
        el('tr', null, el('th', { text: 'Account' }), el('td', { class: 'mono', text: me.address })),
        el('tr', null, el('th', { text: 'Handle' }), handleCell),
        el('tr', null, el('th', { text: 'Derivation path' }), el('td', { class: 'mono', text: Kit.wallet.PATH })))),
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn', type: 'button', text: 'Show my seed phrase', onclick: function () { reveal.replaceChildren(wordGrid(id.phrase), el('div', { class: 'callout bad', text: NEVER })); } }),
        me.handle ? el('button', { class: 'btn', type: 'button', text: 'Send my registration again', onclick: function () { p.remove(); Kit.register('new'); } }) : null,
        el('button', { class: 'btn', type: 'button', text: 'Sign out', onclick: function () { Kit.signOut(); root.location.reload(); } })),
      reveal
    ]);
  };

  /* ---------- Sealing to the class ----------
     The class key is an account like any other, derived from the instructors' seed phrase. Its public key is in the
     class settings, so any page can seal a record that only the instructors can open (kit/wallet.js: sealTo). */
  Kit.TOKEN_RE = /BC2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
  Kit.seal = function (obj, key) {
    key = key || Kit.cls().classKey;
    if (!key) return Promise.reject(new Error('this class is not set up'));
    return Kit.wallet.sealTo(key, obj, 'BC2');
  };

  /* ---------- Class inbox: a write token that ships locked; the class code unlocks it ---------- */
  var KDF_ITER = 300000;
  function codeKey(code, salt, iter) {
    return subtle().importKey('raw', enc.encode(Kit.normCode(code)), 'PBKDF2', false, ['deriveKey']).then(function (k) {
      return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iter }, k, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  Kit.lockToken = function (token, code) {
    var salt = root.crypto.getRandomValues(new Uint8Array(16)), iv = root.crypto.getRandomValues(new Uint8Array(12));
    return codeKey(code, salt, KDF_ITER).then(function (k) { return subtle().encrypt({ name: 'AES-GCM', iv: iv }, k, enc.encode(token)); })
      .then(function (ct) { return { kdf: 'PBKDF2-SHA256', iter: KDF_ITER, salt: Kit.b64u.from(salt), iv: Kit.b64u.from(iv), ct: Kit.b64u.from(ct) }; });
  };
  Kit.unlockToken = function (locked, code) {
    return codeKey(code, Kit.b64u.toBytes(locked.salt), locked.iter).then(function (k) {
      return subtle().decrypt({ name: 'AES-GCM', iv: Kit.b64u.toBytes(locked.iv) }, k, Kit.b64u.toBytes(locked.ct));
    }).then(function (pt) { return dec.decode(pt); });
  };
  /* File one issue in the class inbox. GitHub or GitLab, hosted or self-hosted. */
  Kit.postToInbox = function (inbox, token, title, body, labels) {
    var gl = inbox.platform === 'gitlab', host = inbox.host || (gl ? 'gitlab.com' : 'github.com');
    var url = gl ? 'https://' + host + '/api/v4/projects/' + encodeURIComponent(inbox.repo) + '/issues'
      : (host === 'github.com' ? 'https://api.github.com' : 'https://' + host + '/api/v3') + '/repos/' + inbox.repo + '/issues';
    var payload = gl ? { title: title, description: body, confidential: true } : { title: title, body: body };
    if (labels && labels.length) payload.labels = gl ? labels.join(',') : labels;
    var headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
    if (!gl) headers.Accept = 'application/vnd.github+json';
    return root.fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(payload) }).then(function (r) {
      if (!r.ok) throw new Error(host + ' answered ' + r.status);
      return r.json();
    }).then(function (j) { return { ref: '#' + (gl ? j.iid : j.number) }; });
  };

  /* Replace the text of an existing record (ref is '#12'). Used for the two records that are kept up to date in place:
     the class state and the published results. The platform keeps the edit history. */
  Kit.updateInbox = function (inbox, token, ref, body) {
    var gl = inbox.platform === 'gitlab', host = inbox.host || (gl ? 'gitlab.com' : 'github.com'), n = String(ref).replace('#', '');
    var url = gl ? 'https://' + host + '/api/v4/projects/' + encodeURIComponent(inbox.repo) + '/issues/' + n
      : (host === 'github.com' ? 'https://api.github.com' : 'https://' + host + '/api/v3') + '/repos/' + inbox.repo + '/issues/' + n;
    var headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
    if (!gl) headers.Accept = 'application/vnd.github+json';
    return root.fetch(url, { method: gl ? 'PUT' : 'PATCH', headers: headers, body: JSON.stringify(gl ? { description: body } : { body: body }) }).then(function (r) {
      if (!r.ok) throw new Error(host + ' answered ' + r.status);
      return { ref: '#' + n };
    });
  };
  /* Read records from the class inbox, newest first: [{ ref, title, body, time }]. opts: { labels, page, perPage }. */
  Kit.listInbox = function (inbox, token, opts) {
    opts = opts || {};
    var gl = inbox.platform === 'gitlab', host = inbox.host || (gl ? 'gitlab.com' : 'github.com');
    var q = 'per_page=' + (opts.perPage || 100) + '&page=' + (opts.page || 1) + (opts.labels ? '&labels=' + encodeURIComponent(opts.labels) : '');
    var url = gl ? 'https://' + host + '/api/v4/projects/' + encodeURIComponent(inbox.repo) + '/issues?scope=all&order_by=created_at&sort=desc&' + q
      : (host === 'github.com' ? 'https://api.github.com' : 'https://' + host + '/api/v3') + '/repos/' + inbox.repo + '/issues?state=all&sort=created&direction=desc&' + q;
    var headers = {}; if (token) headers.Authorization = 'Bearer ' + token; if (!gl) headers.Accept = 'application/vnd.github+json';
    return root.fetch(url, { headers: headers }).then(function (r) {
      if (!r.ok) throw new Error(host + ' answered ' + r.status);
      return r.json();
    }).then(function (list) {
      return list.filter(function (it) { return !it.pull_request; }).map(function (it) {
        return gl ? { ref: '#' + it.iid, title: it.title || '', body: it.description || '', time: it.created_at }
          : { ref: '#' + it.number, title: it.title || '', body: it.body || '', time: it.created_at };
      });
    });
  };
  /* The inbox token, unlocked with the signed-in student's class code. */
  Kit.studentToken = function () {
    var inbox = Kit.inbox(), id = Kit.identity();
    if (!inbox || !id) return Promise.reject(new Error('no inbox'));
    return Kit.unlockToken(inbox.locked, id.code);
  };

  /* ---------- Instructors ----------
     An instructor signs in to the instructor dashboard with the class's instructor seed phrase. `staff` below is that
     account: { address, pub, sign, open }. */
  Kit.staffFrom = function (phrase) {
    var c = Kit.cls(), acct = Kit.wallet.fromPhrase(phrase, Kit.wallet.CLASS_PATH);
    if (c.classAddress && acct.address.toLowerCase() !== String(c.classAddress).toLowerCase()) throw new Error('Those are not this class\'s instructor words.');
    return acct;
  };
  /* Instructor records (decisions, answer keys): signed by the class account, so a student holding the shared inbox
     token cannot forge one, and sealed like any other record. */
  Kit.staffRecord = function (record, staff) {
    var text = JSON.stringify(record);
    return Kit.seal({ v: 3, admin: text, sig: staff.sign(text) }, staff.pub);   // the instructors' own public key is the class key
  };
  Kit.openStaffRecord = function (env) {
    if (!Kit.wallet.signedBy(env.admin, env.sig, Kit.cls().classAddress)) return Promise.reject(new Error('forged instructor record (not signed with the class\'s instructor words)'));
    return Promise.resolve(JSON.parse(env.admin));
  };

  /* ---------- Published results ----------
     The instructor publishes one record: every student's results, each sealed to that student's own account, the
     whole thing signed by the class account. A student's page checks the signature against the class address in the
     settings, then opens its own entry. Nobody else can read it, and nobody can fake it. */
  var RESULTS_RE = /BCR2\.([A-Za-z0-9_-]+)\.(0x[0-9a-f]{130})/;
  Kit.signResults = function (obj, staff) {
    var text = JSON.stringify(obj);
    return Promise.resolve('BCR2.' + Kit.b64u.from(enc.encode(text)) + '.' + staff.sign(text));
  };
  Kit.readResults = function (text) {
    var m = RESULTS_RE.exec(String(text));
    if (!m) return Promise.resolve(null);
    try {
      var body = dec.decode(Kit.b64u.toBytes(m[1]));
      return Promise.resolve(Kit.wallet.signedBy(body, m[2], Kit.cls().classAddress) ? JSON.parse(body) : null);
    } catch (e) { return Promise.resolve(null); }   // mangled: ignore it
  };
  /* ---------- Class state: which days are unlocked, which quizzes are closed ----------
     One public record, signed by the class account: students' pages can read it and check it, and nobody else can
     write it. { open: { "<day>": "<time unlocked>" }, closed: { "<quiz id>": "<time closed>" }, at }.
     A static site cannot truly lock a page: a locked day is hidden on the map and its pages say so. What cannot be
     got round is grading: a quiz handed in after it was closed does not count. */
  var STATE_RE = /BCC1\.([A-Za-z0-9_-]+)\.(0x[0-9a-f]{130})/;
  Kit.signState = function (obj, staff) { var text = JSON.stringify(obj); return 'BCC1.' + Kit.b64u.from(enc.encode(text)) + '.' + staff.sign(text); };
  Kit.readState = function (text) {
    var m = STATE_RE.exec(String(text));
    if (!m) return null;
    try { var body = dec.decode(Kit.b64u.toBytes(m[1])); return Kit.wallet.signedBy(body, m[2], Kit.cls().classAddress) ? JSON.parse(body) : null; } catch (e) { return null; }
  };
  /* The class's current state as a student's page sees it. Resolves { open, closed, known }.
     A class with no inbox has no locks: everything is open. If the class cannot be asked, `known` is false. */
  Kit.classState = function () {
    var inbox = Kit.inbox(), c = Kit.cls();
    if (!inbox) return Promise.resolve({ open: null, closed: {}, known: true });
    return Kit.studentToken().then(function (token) {
      return Kit.listInbox(inbox, token, { labels: 'state', perPage: 5 }).then(function (list) {
        if (list.length) return list;
        return Kit.listInbox(inbox, token, { perPage: 100 }).then(function (all) { return all.filter(function (it) { return /^\[state\]/.test(it.title); }); });
      });
    }).then(function (list) {
      for (var i = 0; i < list.length; i++) { var st = Kit.readState(list[i].body); if (st && st.classId === (c.classId || null)) return { open: st.open || {}, closed: st.closed || {}, known: true }; }
      return { open: {}, closed: {}, known: true };
    }).catch(function () { return { open: {}, closed: {}, known: false }; });
  };
  Kit.dayOf = function (itemId) { var it = (root.BC_ITEMS || []).filter(function (x) { return x.id === itemId; })[0]; return it ? it.day : null; };
  /* For an item's own page: resolves 'open', 'locked' or 'closed', and shows a notice in `main` unless it is open. */
  Kit.gateItem = function (itemId) {
    return Kit.classState().then(function (st) {
      var day = Kit.dayOf(itemId), main = document.querySelector('main');
      var locked = st.open && day != null && !st.open[String(day)], closed = !!st.closed[itemId];
      if (!locked && !closed) return 'open';
      main.insertBefore(el('div', { class: 'callout ' + (locked ? 'warn' : 'info'), id: 'kit-gate', style: 'margin:0 0 1rem' },
        el('b', { text: locked ? 'Day ' + day + ' is locked. ' : 'This quiz is closed. ' }),
        locked ? (st.known ? 'Your instructor unlocks each day in class. ' : 'The class couldn\'t be reached to check whether it is unlocked. ') : 'Answers handed in now don\'t count. Your score is on your course home. ',
        el('a', { href: Kit.base + '../start.html', text: 'Back to your course home' })), main.firstChild);
      if (locked) main.classList.add('kit-locked');
      return locked ? 'locked' : 'closed';
    });
  };

  /* The label on the signed-in student's own records: 's-' and the first 8 hex digits of their account. */
  Kit.myLabel = function () { return 's-' + Kit.who().slice(2, 10); };
  /* Everything the signed-in student has handed in, read from the class itself, so it is right on any computer.
     Resolves { ok, n, handle, items: { '<item>:<part>': { time, ref, data } } }: `ok` is false if the class could not
     be asked, `n` counts this account's records (registration included), `data` is what was handed in (null for a
     record made before students' own copies were kept). The first hand-in of each item is the one that counts.
     Asked once per page; Kit.myRecords(true) asks again. */
  var recsMemo = null, OWN_RE = /BCS1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;
  Kit.myRecords = function (fresh) {
    var inbox = Kit.inbox(), me = Kit.me();
    if (!inbox || !me) return Promise.resolve({ ok: false, n: 0, handle: '', items: {} });
    if (recsMemo && !fresh && recsMemo.who === me.address) return recsMemo.p;
    var tag = Kit.short(me.address), out = { ok: true, n: 0, handle: '', items: {} }, jobs = [];
    function take(list) {
      list.forEach(function (it) {
        var m = /^\[submit\] (\S+)(?: (\S+))? · (\S+)$/.exec(it.title);
        if (!m || m[3] !== tag) return;
        out.n++;
        var own = OWN_RE.exec(it.body), k = m[1] + ':' + (m[2] || '');
        jobs.push((own ? me.open(own[0]).catch(function () { return null; }) : Promise.resolve(null)).then(function (o) {
          if (m[1] === 'register') { if (o && o.data && o.data.handle && !out.handle) out.handle = Kit.normHandle(o.data.handle); return; }
          if (!out.items[k] || it.time < out.items[k].time) out.items[k] = { time: it.time, ref: it.ref, data: o ? o.data : null };
        }));
      });
    }
    var p = Kit.studentToken().then(function (token) {
      return (function page(n) {
        return Kit.listInbox(inbox, token, { labels: Kit.myLabel(), page: n }).then(function (list) {
          take(list);
          return list.length === 100 && n < 10 ? page(n + 1) : null;
        });
      })(1).then(function () {
        if (out.n) return null;
        /* Nothing under our label: the platform may have dropped it. Look through the newest records by title instead. */
        return Kit.listInbox(inbox, token, { perPage: 100 }).then(take);
      });
    }).then(function () { return Promise.all(jobs); }).then(function () {
      /* A computer that has never seen this student learns their handle here. */
      if (out.handle && !me.handle) { Kit.mine.set('name:' + me.address, out.handle); meCache = null; if (Kit._paintChip) Kit._paintChip(); }
      return out;
    }).catch(function () { recsMemo = null; return { ok: false, n: 0, handle: '', items: {} }; });
    recsMemo = { who: me.address, p: p };
    return p;
  };
  /* Just the times: { '<item>:<part>': '<time>' } (part is '' for a quiz), or null if the class could not be asked. */
  Kit.myHandIns = function (fresh) {
    if (!Kit.inbox() || !Kit.me()) return Promise.resolve(null);
    return Kit.myRecords(fresh).then(function (m) { if (!m.ok) return null; var t = {}; Object.keys(m.items).forEach(function (k) { t[k] = m.items[k].time; }); return t; });
  };

  /* The signed-in student's latest published results, or null. Resolves { at, mine, cls }. */
  Kit.myResults = function () {
    var inbox = Kit.inbox(), c = Kit.cls(), me = Kit.me();
    if (!inbox || !me) return Promise.resolve(null);
    return Kit.studentToken().then(function (token) {
      return Kit.listInbox(inbox, token, { labels: 'results', perPage: 10 }).then(function (list) {
        if (list.length) return list;
        /* No labelled record: the platform may have dropped the label. Look through the newest records by title instead. */
        return Kit.listInbox(inbox, token, { perPage: 100 }).then(function (all) { return all.filter(function (it) { return /^\[results\]/.test(it.title); }); });
      });
    }).then(function (list) {
      return list.reduce(function (found, it) {   // newest first; the first one that is genuine and has an entry for us
        return found.then(function (hit) {
          if (hit) return hit;
          return Kit.readResults(it.body).then(function (r) {
            var mine = r && r.classId === (c.classId || null) && r.entries && r.entries[me.address.toLowerCase()];
            if (!mine) return null;
            return me.open(mine).then(function (o) { return { at: r.at, mine: o.mine, cls: o.cls }; }, function () { return null; });
          });
        });
      }, Promise.resolve(null));
    });
  };

  Kit.download = function (name, text) {
    var a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: name });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  };
  Kit.copy = function (text) {
    function old() {
      var t = el('textarea'); t.value = text; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } finally { t.remove(); }
    }
    if (navigator.clipboard && root.isSecureContext) return navigator.clipboard.writeText(text).catch(old); // some managed browsers refuse the modern API
    old(); return Promise.resolve();
  };

  /* ---------- Submitting ---------- */
  /* Sign and seal one submission. Returns { code, message }: the sealed code, and the EIP-4361 message that was signed. */
  Kit.buildSubmission = function (payload) {
    var c = Kit.cls(), me = Kit.me();
    var body = JSON.stringify({ v: 2, kind: payload.kind, item: payload.item, address: me.address, room: Kit.room(), classId: c.classId || null, build: Kit.build.commit, at: new Date().toISOString(), data: payload.data });
    return Kit.sha256(enc.encode(body)).then(function (digest) {
      var domain = c.domain || root.location.host || 'localhost';
      var message = Kit.wallet.siwe.build({
        domain: domain, address: me.address,
        statement: Kit.statementFor(payload.item, c.classId),
        uri: c.site || (/^https?:$/.test(root.location.protocol) ? root.location.origin + root.location.pathname : 'https://' + domain + '/'),
        chainId: 1, nonce: Kit.wallet.siwe.nonce(), issuedAt: new Date().toISOString(),
        resources: [Kit.wallet.siwe.niUri(digest)]
      });
      var env = { v: 2, body: body, siwe: { message: message, signature: me.sign(message) } };
      return Kit.seal(env).then(function (code) { return { code: code, message: message }; });
    });
  };
  Kit.statementFor = function (item, classId) { return 'Submit ' + item + ' to class ' + (classId || 'none') + '.'; };

  /* Check an opened envelope: the signature, and that the signed message covers exactly this submission.
     Resolves with { p, address, nonce }. Used by the instructor dashboard; needs no key. */
  Kit.checkSubmission = function (env) {
    if (!env || env.v !== 2 || !env.siwe) return Promise.reject(new Error('old or unknown submission format'));
    var f, address;
    try { f = Kit.wallet.siwe.parse(env.siwe.message); address = Kit.wallet.recover(env.siwe.message, env.siwe.signature); }
    catch (e) { return Promise.reject(new Error('unreadable signed message')); }
    if (address !== Kit.wallet.toChecksum(f.address)) return Promise.reject(new Error('signature does not match the account named in the message'));
    return Kit.sha256(enc.encode(env.body)).then(function (digest) {
      if (f.resources.indexOf(Kit.wallet.siwe.niUri(digest)) < 0) throw new Error('the signed message does not cover this submission');
      var p = JSON.parse(env.body);
      if (f.statement !== Kit.statementFor(p.item, p.classId)) throw new Error('the signed statement names a different item or class');
      if (String(p.address).toLowerCase() !== address.toLowerCase()) throw new Error('the submission names a different account from the one that signed it');
      return { p: p, address: address, nonce: f.nonce, issuedAt: f.issuedAt };
    });
  };

  /* Send one submission and show the result in `target`. One click for the student. */
  Kit.submit = function (target, payload, label) {
    var c = Kit.cls(), inbox = Kit.inbox(), id = Kit.identity(), me = Kit.me(), tag = Kit.short(me.address);
    if (!c.classKey) {
      target.replaceChildren(el('div', { class: 'callout warn', text: 'This class isn\'t set up yet, so nothing can be handed in. Your instructor sets it up.' }));
      return Promise.resolve(null);
    }
    target.replaceChildren(el('p', { class: 'muted small', text: 'Signing and sending…' }));
    var sub;
    function signedBox() { return el('details', { class: 'hint' }, el('summary', { text: 'What you just signed' }),
      el('p', { class: 'small muted', text: 'An EIP-4361 "Sign-In with Ethereum" message. Signing it moves no money and costs nothing: it only proves that the holder of your key made this submission.' }),
      el('div', { class: 'artifact', text: sub.message })); }
    /* The way back, once something is handed in. Empty for a registration, which happens before there is anywhere to go back from.
       (An element, never null: replaceChildren would print null as text.) */
    function homeRow() {
      var row = el('div', { class: 'btn-row' });
      if (payload.kind !== 'register') row.append(el('a', { class: 'btn', id: 'kit-home', href: Kit.base + '../start.html', text: '← Back to your course home' }));
      else row.hidden = true;
      return row;
    }
    function manual(why) {
      var status = el('span', { class: 'muted small' }), fname = payload.item + '-' + me.address.slice(2, 10) + '.txt';
      target.replaceChildren(
        el('div', { class: 'callout warn' }, el('b', { text: 'Not sent automatically. ' }), why + ' Copy or download the code and give it to your instructor.'),
        el('div', { class: 'btn-row' },
          el('button', { class: 'btn primary', type: 'button', text: 'Copy code', onclick: function () { Kit.copy(sub.code).then(function () { status.textContent = 'Copied.'; }); } }),
          el('button', { class: 'btn', type: 'button', text: 'Download .txt', onclick: function () { Kit.download(fname, label + '\n' + sub.code + '\n'); } }), status),
        el('details', { class: 'hint' }, el('summary', { text: 'Show the encrypted code' }), el('div', { class: 'hexblock', id: 'kit-code-out', text: sub.code })),
        homeRow(), signedBox());
      return { sent: false, code: sub.code };
    }
    return Kit.buildSubmission(payload).then(function (s) {
      sub = s;
      if (!inbox) return manual('This copy of the course isn\'t connected to a class inbox.');
      /* A second copy, sealed to the student's own account: it is how their pages show them what they handed in, and
         their handle, on any computer. The instructor's copy is the one that is graded. */
      var keep = { kind: payload.kind, item: payload.item, part: payload.part || '', data: payload.data, at: new Date().toISOString() };
      return Promise.all([Kit.unlockToken(inbox.locked, id.code), Kit.wallet.sealTo(me.pub, keep)]).then(function (two) {
        var token = two[0], own = two[1];
        /* The title names the item and part, and a label marks whose it is, so the student's home page can list their own
           hand-ins from any computer. Neither is trusted for grading: that uses only what is sealed inside. */
        return Kit.postToInbox(inbox, token, '[submit] ' + payload.item + (payload.part ? ' ' + payload.part : '') + ' · ' + tag,
          'Course submission: ' + label + '\nAccount: ' + me.address + '\n\n```\n' + sub.code + '\n```\n\nThe student\'s own copy (only their seed phrase opens it):\n\n```\n' + own + '\n```\n', [Kit.myLabel()]);
      }).then(function (res) {
        var when = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        Kit.mine.set('sent:' + payload.item + ':' + (payload.part || '') + ':' + Kit.who(), { ref: res.ref, at: when });
        recsMemo = null;
        target.replaceChildren(el('div', { class: 'callout ok' }, el('b', { text: 'Submitted ✓ ' }), 'Received as ' + res.ref + ' at ' + when + '.'), homeRow(), signedBox());
        return { sent: true, ref: res.ref, code: sub.code };
      }, function (e) {
        if (/ (403|429)$/.test(e.message)) return manual('The class inbox is limiting how fast the class can submit (' + e.message + '). Wait a minute and press Submit again.');
        return manual('The class inbox couldn\'t be reached (' + e.message + ').');
      });
    }).catch(function (e) {
      target.replaceChildren(el('div', { class: 'callout bad', text: 'Could not prepare the submission: ' + e.message }));
      return null;
    });
  };

  /* A Submit button that remembers it was used. payload() is called at click time. */
  /* A hand-in happens once. After it, the button is replaced by a note saying when it was received; the same note
     appears on any other computer, read from the class. If sending failed, the button stays so it can be tried again. */
  Kit.submitButton = function (target, label, payload, part) {
    var out = el('div'), row = el('div', { class: 'btn-row', style: 'margin-top:0' });
    var probe = payload(), key = probe.item + ':' + (part || '');
    function done(ref, at) { row.replaceChildren(el('span', { class: 'solved-badge', text: 'Submitted ✓ earlier (' + ref + ', ' + at + ')' })); }
    var prior = Kit.mine.get('sent:' + key + ':' + Kit.who(), null);
    if (prior) done(prior.ref, prior.at);
    else {
      var btn = el('button', { class: 'btn primary', type: 'button', text: 'Submit', onclick: function () {
        btn.disabled = true;
        var p = payload(); p.part = part;
        Kit.submit(out, p, label).then(function (r) { if (r && r.sent) row.replaceChildren(); else { btn.disabled = false; btn.textContent = 'Try sending again'; } });
      } });
      row.append(btn);
      Kit.myRecords().then(function (m) { var it = m.items[key]; if (it && row.contains(btn)) done(it.ref, hhmm(it.time)); });
    }
    target.replaceChildren(row, out);
  };
  function hhmm(t) { var d = new Date(t); return isNaN(d) ? String(t) : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

  /* ---------- Reference sheets: shared, printable fact sheets (registered by kit/ref-*.js) ---------- */
  Kit.REF = Kit.REF || {};
  Kit.refPanel = function (id, open) {
    var r = Kit.REF[id];
    if (!r) return el('div', { class: 'callout warn', text: 'Missing reference sheet: ' + id });
    return el('details', { class: 'panel ref', open: !!open },
      el('summary', null, el('span', { class: 'tag', text: 'Reference' }), ' ', el('b', { text: r.title })),
      el('div', { class: 'ref-body', html: r.html }));
  };

  root.Kit = Kit;
})(typeof window !== 'undefined' ? window : globalThis);

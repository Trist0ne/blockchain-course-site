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
  Kit.version = '0.7.0';
  /* Which course commit this site was cut from. tools/cut_delivery.py rewrites this line; 'dev' means an uncut working copy.
     Every record carries it, so a class can always be graded with the course repo as it was when the class was cut. */
  Kit.build = { commit: '0cdc9f9ed947', date: '2026-11-21' };
  /* Where this file was loaded from, so pages at any depth can link to shared pages such as setup.html. */
  var here = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || '';
  Kit.base = here.replace(/kit\.js(\?.*)?$/, '');

  /* ---------- Storage (government machines may block or wipe it; nothing depends on it) ---------- */
  var NS = 'bc-kit:';
  function storage(kind) {
    return {
      get: function (k, d) { try { var v = root[kind].getItem(NS + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
      set: function (k, v) { try { root[kind].setItem(NS + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
      del: function (k) { try { root[kind].removeItem(NS + k); } catch (e) { /* ignore */ } }
    };
  }
  Kit.store = storage('localStorage');
  Kit.session = storage('sessionStorage');

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
    if (!meCache) { var w = Kit.wallet.fromPhrase(id.phrase); meCache = { address: w.address, handle: Kit.store.get('name:' + w.address, ''), sign: w.sign }; }
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
    var chip = el('button', { class: 'chip', type: 'button', title: 'Your course identity' });
    function paintChip() {
      var id = Kit.identity();
      if (!id) { chip.replaceChildren(el('span', { text: 'not signed in' })); return; }
      if (!Kit.wallet) { chip.replaceChildren(el('span', { text: 'signed in' })); return; }
      var me = Kit.me();
      chip.replaceChildren(me.handle ? el('b', { text: me.handle }) : null, el('span', { class: 'mono', text: Kit.short(me.address) }));
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
      opts.crumbs ? el('span', { class: 'crumbs', text: opts.crumbs }) : null,
      el('span', { class: 'topbar-spacer' }),
      opts.noHandle ? null : chip,
      themeBtn
    );
    document.body.insertBefore(top, document.body.firstChild);
    document.body.appendChild(el('footer', { class: 'foot' },
      el('span', { text: (c.course || 'Blockchain Technology') + (c.classId ? ' · class ' + c.classId : '') }),
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
    if (!c.publicKey && !opts.noSetupNotice) main.insertBefore(el('div', { class: 'callout warn', id: 'kit-unconfigured', style: 'margin:0 0 1rem' },
      el('b', { text: 'This class isn\'t set up yet. ' }), 'You can look around, but nothing can be submitted. Instructors: ',
      el('a', { href: Kit.base + '../setup.html', text: 'set up this class' }), '.'), main.firstChild);
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
  var NEVER = 'Course use only. Never type a real wallet\'s seed phrase into a web page: not this one, not any. A real phrase controls real money.';

  Kit.signIn = function () {
    if (Kit.identity()) return Promise.resolve(Kit.me());
    return new Promise(function (resolve) {
      var inbox = Kit.inbox();
      var codeIn = inbox ? el('input', { type: 'text', class: 'mono', placeholder: 'four words, from the board', autocomplete: 'off', id: 'kit-code' }) : null;
      var phraseIn = el('textarea', { class: 'mono', rows: '2', placeholder: 'your 12 words, in order', id: 'kit-phrase', spellcheck: 'false', autocomplete: 'off' });
      var handleIn = el('input', { type: 'text', class: 'mono', placeholder: 'e.g. falcon-07', autocomplete: 'off', maxlength: '40', id: 'kit-handle' });
      var msg = el('div', { id: 'kit-msg' }), panel;

      function fail(text) { msg.replaceChildren(el('div', { class: 'callout bad', text: text })); }
      /* Resolves with the checked class code ('' when the class has no inbox), or null after showing why not. */
      function checkCode() {
        if (!inbox) return Promise.resolve('');
        var code = Kit.normCode(codeIn.value);
        if (!code) { fail('Enter the class code your instructor wrote on the board.'); return Promise.resolve(null); }
        return Kit.unlockToken(inbox.locked, code).then(function () { return code; },
          function () { fail('That class code doesn\'t unlock this class. Check the spelling against the board.'); return null; });
      }
      function finish(code, phrase, newHandle) {
        saveIdentity({ phrase: phrase, code: code });
        var me = Kit.me();
        if (newHandle) { Kit.store.set('name:' + me.address, newHandle); meCache = null; me = Kit.me(); }
        panel.remove(); if (Kit._paintChip) Kit._paintChip();
        if (newHandle) Kit.register();
        resolve(me);
      }
      function stepCreate(code, handle) {
        var phrase = Kit.wallet.newPhrase(), words = phrase.split(' '), addr = Kit.wallet.fromPhrase(phrase).address;
        function stepWrite() {
          panel.replaceChildren(
            el('h2', { text: 'Your seed phrase' }),
            el('p', { text: 'These 12 words are your identity for this course. Write them on your backup card, by hand, in order.' }),
            wordGrid(phrase),
            el('div', { class: 'callout warn', text: 'From now on you sign in with these words and nothing else. Anyone who has them can submit as you. If you lose them, your instructor has to reset you.' }),
            el('div', { class: 'callout bad', text: NEVER }),
            el('p', { class: 'small muted', style: 'margin-top:.75rem' }, 'Your account: ', el('code', { text: addr }),
              '. The words are a number; the number derives a private key; the key derives this address. Any wallet given the same words derives the same address. Copy the first and last characters onto your card.'),
            el('div', { class: 'btn-row' }, el('button', { class: 'btn primary', type: 'button', id: 'kit-written', text: 'I have written them down', onclick: stepConfirm })));
        }
        /* Check the backup, as real wallets do: the words are hidden and two of them are asked for. */
        function stepConfirm() {
          var picks = Kit.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], Math.random).slice(0, 2).sort(function (x, y) { return x - y; });
          var inputs = picks.map(function (i) { return el('input', { type: 'text', class: 'mono kit-confirm', 'data-n': String(i + 1), autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Word ' + (i + 1) }); });
          var m2 = el('div');
          function done() {
            var ok = picks.every(function (i, k) { return inputs[k].value.trim().toLowerCase() === words[i]; });
            if (ok) finish(code, phrase, handle);
            else m2.replaceChildren(el('div', { class: 'callout bad', text: 'Those don\'t match what you were shown. Check your card, or go back and look at the words again.' }));
          }
          panel.replaceChildren(
            el('h2', { text: 'Check your backup' }),
            el('p', { text: 'Read these two words back from your card. A backup you have never checked is a backup you can\'t trust.' }),
            el('form', { onsubmit: function (e) { e.preventDefault(); done(); } },
              el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(11rem,1fr));gap:.75rem;max-width:26rem' },
                picks.map(function (i, k) { return el('label', { class: 'field' }, el('span', { text: 'Word ' + (i + 1) }), inputs[k]); })),
              el('div', { class: 'btn-row', style: 'margin-top:0' },
                el('button', { class: 'btn primary', type: 'submit', text: 'Continue' }),
                el('button', { class: 'btn', type: 'button', text: 'Show the words again', onclick: stepWrite }))),
            m2);
          inputs[0].focus();
        }
        stepWrite();
      }
      panel = panelAtTop('kit-signin', [
        el('h2', { text: 'Sign in' }),
        el('p', { class: 'muted small', text: 'You sign in the way people sign in to blockchain apps: with a key only you hold. There is no account and no password, and nothing is remembered on this computer.' }),
        codeIn ? el('label', { class: 'field' }, el('span', { text: 'Class code' }), codeIn) : null,
        el('label', { class: 'field' }, el('span', { text: 'Your seed phrase (the 12 words on your backup card)' }), phraseIn),
        el('div', { class: 'callout bad', text: NEVER }),
        el('div', { class: 'btn-row' }, el('button', { class: 'btn primary', type: 'button', id: 'kit-go', text: 'Sign in', onclick: function () {
          checkCode().then(function (code) {
            if (code === null) return;
            if (!Kit.wallet.validPhrase(phraseIn.value)) return fail('That isn\'t a valid 12-word phrase. One wrong or misspelled word fails the built-in checksum.');
            finish(code, Kit.wallet.normPhrase(phraseIn.value), null);
          });
        } })),
        el('div', { class: 'first-time' },
          el('h3', { text: 'First time?' }),
          el('p', { class: 'muted small', text: 'Enter the handle your instructor gave you' + (inbox ? ' and the class code above' : '') + '. You only do this once: after today you sign in with your 12 words.' }),
          el('div', { class: 'inline-form' }, handleIn,
            el('button', { class: 'btn', type: 'button', id: 'kit-create', text: 'Create my seed phrase', onclick: function () {
              var h = Kit.normHandle(handleIn.value);
              if (h.length < 2) return fail('Handles are 2–40 characters: letters, digits, dot, dash or underscore.');
              checkCode().then(function (code) { if (code !== null) stepCreate(code, h); });
            } }))),
        msg
      ]);
      (codeIn || phraseIn).focus();
    });
  };

  /* Tell the instructor which handle this account belongs to. Sent once, when the phrase is created. */
  Kit.register = function () {
    var me = Kit.me(), out = el('div'), p;
    p = panelAtTop('kit-registered', [
      el('div', { class: 'panel-head' }, el('h2', { text: 'Registering ' + (me.handle || 'your account') }), el('button', { class: 'icon-btn', type: 'button', text: 'Close', onclick: function () { p.remove(); } })),
      el('p', { class: 'muted small', text: 'This links your handle to your account for your instructor. It happens once.' }), out]);
    return Kit.submit(out, { kind: 'register', item: 'register', data: { handle: me.handle } }, 'Registration');
  };

  Kit.identityPanel = function () {
    var id = Kit.identity(), me = Kit.me(), reveal = el('div');
    var p = panelAtTop('kit-identity', [
      el('div', { class: 'panel-head' }, el('h2', { text: 'Your course identity' }), el('button', { class: 'icon-btn', type: 'button', text: 'Close', onclick: function () { p.remove(); } })),
      el('table', { class: 'data' }, el('tbody', null,
        el('tr', null, el('th', { text: 'Account' }), el('td', { class: 'mono', text: me.address })),
        el('tr', null, el('th', { text: 'Handle' }), el('td', { class: 'mono', text: me.handle || 'registered with your instructor (not stored on this computer)' })),
        el('tr', null, el('th', { text: 'Derivation path' }), el('td', { class: 'mono', text: Kit.wallet.PATH })))),
      el('div', { class: 'btn-row' },
        el('button', { class: 'btn', type: 'button', text: 'Show my seed phrase', onclick: function () { reveal.replaceChildren(wordGrid(id.phrase), el('div', { class: 'callout bad', text: NEVER })); } }),
        me.handle ? el('button', { class: 'btn', type: 'button', text: 'Send my registration again', onclick: function () { p.remove(); Kit.register(); } }) : null,
        el('button', { class: 'btn', type: 'button', text: 'Sign out', onclick: function () { Kit.signOut(); root.location.reload(); } })),
      reveal
    ]);
  };

  /* ---------- Sealing to the class key ---------- */
  var INFO = enc.encode('bc-course-submission-v1');
  var CURVE = { name: 'ECDH', namedCurve: 'P-256' };
  function aesKey(priv, pub, salt) {
    return subtle().deriveBits({ name: 'ECDH', public: pub }, priv, 256).then(function (bits) {
      return subtle().importKey('raw', bits, 'HKDF', false, ['deriveKey']);
    }).then(function (hk) {
      return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: salt, info: INFO }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  Kit.TOKEN_RE = /BC1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

  Kit.seal = function (obj, publicJwk) {
    var s = subtle(), eph, epk;
    var pubJwk = { kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y };
    return Promise.all([
      s.importKey('jwk', pubJwk, CURVE, false, []),
      s.generateKey(CURVE, true, ['deriveBits'])
    ]).then(function (r) {
      eph = r[1];
      return s.exportKey('raw', eph.publicKey).then(function (raw) { epk = new Uint8Array(raw); return aesKey(eph.privateKey, r[0], epk); });
    }).then(function (key) {
      var iv = root.crypto.getRandomValues(new Uint8Array(12));
      return s.encrypt({ name: 'AES-GCM', iv: iv }, key, enc.encode(JSON.stringify(obj))).then(function (ct) {
        return ['BC1', Kit.b64u.from(epk), Kit.b64u.from(iv), Kit.b64u.from(ct)].join('.');
      });
    });
  };
  Kit.unseal = function (token, privateKey) {
    var p = String(token).trim().split('.');
    if (p.length !== 4 || p[0] !== 'BC1') return Promise.reject(new Error('Not a submission code'));
    var s = subtle(), epkBytes = Kit.b64u.toBytes(p[1]);
    return s.importKey('raw', epkBytes, CURVE, false, []).then(function (epk) {
      return aesKey(privateKey, epk, epkBytes);
    }).then(function (key) {
      return s.decrypt({ name: 'AES-GCM', iv: Kit.b64u.toBytes(p[2]) }, key, Kit.b64u.toBytes(p[3]));
    }).then(function (pt) { return JSON.parse(dec.decode(pt)); });
  };
  Kit.newClassKeys = function () {
    return subtle().generateKey(CURVE, true, ['deriveBits']).then(function (kp) {
      return Promise.all([subtle().exportKey('jwk', kp.publicKey), subtle().exportKey('jwk', kp.privateKey)]);
    }).then(function (r) {
      return { publicJwk: { kty: r[0].kty, crv: r[0].crv, x: r[0].x, y: r[0].y }, privateJwk: r[1] };
    });
  };
  Kit.importPrivate = function (jwk) { return subtle().importKey('jwk', jwk, CURVE, false, ['deriveBits']); };

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
  Kit.postToInbox = function (inbox, token, title, body) {
    var gl = inbox.platform === 'gitlab', host = inbox.host || (gl ? 'gitlab.com' : 'github.com');
    var url = gl ? 'https://' + host + '/api/v4/projects/' + encodeURIComponent(inbox.repo) + '/issues'
      : (host === 'github.com' ? 'https://api.github.com' : 'https://' + host + '/api/v3') + '/repos/' + inbox.repo + '/issues';
    var payload = gl ? { title: title, description: body, confidential: true } : { title: title, body: body };
    var headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
    if (!gl) headers.Accept = 'application/vnd.github+json';
    return root.fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(payload) }).then(function (r) {
      if (!r.ok) throw new Error(host + ' answered ' + r.status);
      return r.json();
    }).then(function (j) { return { ref: '#' + (gl ? j.iid : j.number) }; });
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
      return Kit.seal(env, c.publicKey).then(function (code) { return { code: code, message: message }; });
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
    if (!c.publicKey) {
      target.replaceChildren(el('div', { class: 'callout warn', text: 'This copy of the course has no class key, so submissions are switched off. Your instructor sets this up for each class.' }));
      return Promise.resolve(null);
    }
    target.replaceChildren(el('p', { class: 'muted small', text: 'Signing and sending…' }));
    var sub;
    function signedBox() { return el('details', { class: 'hint' }, el('summary', { text: 'What you just signed' }),
      el('p', { class: 'small muted', text: 'An EIP-4361 "Sign-In with Ethereum" message. Signing it moves no money and costs nothing: it only proves that the holder of your key made this submission.' }),
      el('div', { class: 'artifact', text: sub.message })); }
    function manual(why) {
      var status = el('span', { class: 'muted small' }), fname = payload.item + '-' + me.address.slice(2, 10) + '.txt';
      target.replaceChildren(
        el('div', { class: 'callout warn' }, el('b', { text: 'Not sent automatically. ' }), why + ' Copy or download the code and give it to your instructor.'),
        el('div', { class: 'btn-row' },
          el('button', { class: 'btn primary', type: 'button', text: 'Copy code', onclick: function () { Kit.copy(sub.code).then(function () { status.textContent = 'Copied.'; }); } }),
          el('button', { class: 'btn', type: 'button', text: 'Download .txt', onclick: function () { Kit.download(fname, label + '\n' + sub.code + '\n'); } }), status),
        el('details', { class: 'hint' }, el('summary', { text: 'Show the encrypted code' }), el('div', { class: 'hexblock', id: 'kit-code-out', text: sub.code })),
        signedBox());
      return { sent: false, code: sub.code };
    }
    return Kit.buildSubmission(payload).then(function (s) {
      sub = s;
      if (!inbox) return manual('This copy of the course isn\'t connected to a class inbox.');
      return Kit.unlockToken(inbox.locked, id.code).then(function (token) {
        return Kit.postToInbox(inbox, token, '[submit] ' + payload.item + ' · ' + tag, 'Course submission: ' + label + '\nAccount: ' + me.address + '\n\n```\n' + sub.code + '\n```\n');
      }).then(function (res) {
        var when = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        Kit.store.set('sent:' + payload.item + ':' + (payload.part || '') + ':' + Kit.who(), { ref: res.ref, at: when });
        target.replaceChildren(el('div', { class: 'callout ok' }, el('b', { text: 'Submitted ✓ ' }), 'Received as ' + res.ref + ' at ' + when + '.'), signedBox());
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
  Kit.submitButton = function (target, label, payload, part) {
    var out = el('div');
    var probe = payload(), prior = Kit.store.get('sent:' + probe.item + ':' + (part || '') + ':' + Kit.who(), null);
    var btn = el('button', { class: 'btn primary', type: 'button', text: prior ? 'Submit again' : 'Submit', onclick: function () {
      btn.disabled = true;
      var p = payload(); p.part = part;
      Kit.submit(out, p, label).then(function (r) { btn.disabled = false; if (r && r.sent) btn.textContent = 'Submit again'; });
    } });
    target.replaceChildren(el('div', { class: 'btn-row', style: 'margin-top:0' }, btn,
      prior ? el('span', { class: 'solved-badge', text: 'Submitted ✓ earlier (' + prior.ref + ', ' + prior.at + ')' }) : null), out);
  };

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

/* Challenge runner. A challenge (a CTF-style micro-lab) is one data file, lab-data.js, that calls Kit.defineLab().
   The student page (index.html) calls Kit.runLab('<id>'), and the instructor dashboard loads the same data file to
   grade, so both always agree. Needs kit.js; the page also needs wallet.js.

   Kit.defineLab({
     id, rev,                     rev: raise it whenever pick(), the data or an answer changes
     title, tags: [..], minutes, crumbs,
     lede:  html                  one or two sentences under the title
     real:  html                  the "What's real here" note: what is real, and the one shortcut taken
     ref:   'bitcoin-tx'          a reference sheet id (Kit.REF), optional;  refPage: its printable page
     bench: { ops: ['sha256', 'reverse', 'keccak256'], text: true, slice: true, number: true, append: true, shelf: true }   or omitted
     tools: [ function (variant, api) -> element ]     extra instruments for this challenge, optional
     steps: [ { id: 's1', title, flags: ['f1', 'f2'] } ]   optional: flags handed in together as one record when the step is
                                  complete. A long lab should group its flags: every hand-in in the class counts against
                                  one hourly limit on writes, so a lab of twelve flags should be three or four steps
     pick:  function (room, who) -> variant            the student's own variant; must depend on nothing else
     variantLabel: function (variant) -> text
     flags: [ {
       id: 'f1', points: 100, title, deeper: false,
       brief:     html | function (variant) -> html
       artifacts: function (variant) -> [ { label, hex | text, structure: function (bytes) -> { regions, legend }, load: true } ]
       placeholder, format: { kind: 'hex', len: 64, name: 'A txid' } | { kind: 'int', name } | { kind: 'address' } | { kind: 'text' }
       answer:    function (variant) -> text | Promise    computed, never stored
       norm:      function (text) -> text                 optional; how an entry is compared
       near:      function (entry, variant) -> message | null | Promise     names the near-miss
       wrong:     text                                    the message when nothing more specific fits
       hints: [html], debrief: html, general: text, after: function (variant, answer) -> html
     } ]
   });
   Grading (L.grade) recomputes the answer from the room and the account that signed, so no key file is needed. */
(function (root) {
  'use strict';
  var Kit = root.Kit, el = Kit.el;
  root.BC_LABS = root.BC_LABS || {};

  function normDefault(v) {
    v = String(v == null ? '' : v).trim();
    var m = /^flag\{(.*)\}$/i.exec(v); if (m) v = m[1];
    return v.toLowerCase().replace(/[\s:,_]/g, '');
  }
  function normOf(f) { return f.norm || (f.format && f.format.kind === 'text' ? function (v) { return String(v == null ? '' : v).trim().toLowerCase().replace(/\s+/g, ' '); } : normDefault); }
  function points(L) { var p = {}; L.flags.forEach(function (f) { p[f.id] = f.points; }); return p; }

  Kit.defineLab = function (L) {
    L.points = points(L);
    L.flag = function (id) { return L.flags.filter(function (f) { return f.id === id; })[0] || null; };
    /* Used by the instructor dashboard. It ignores any variant the page reported and derives it again. */
    var graded = {};
    L.grade = function (p) {
      var memo = [p.room, String(p.address).toLowerCase(), JSON.stringify(p.data || null)].join('|');
      return graded[memo] || (graded[memo] = grade1(p));
    };
    function grade1(p) {
      var d = p.data || {}, f = L.flag(d.flag);
      if (d.rev !== L.rev) return Promise.resolve({ ok: false, points: 0, flag: d.flag, stale: true });
      if (!f) return Promise.resolve({ ok: false, points: 0, note: 'unknown flag' });
      var n = normOf(f);
      return Promise.resolve(f.answer(L.pick(p.room, p.address))).then(function (ans) {
        var ok = n(d.value) === n(ans);
        return { ok: ok, points: ok ? f.points : 0, flag: f.id };
      });
    }
    root.BC_LABS[L.id] = L;
    return L;
  };

  /* Entries that cannot be right are turned away with a reason before anything is compared. */
  function formatProblem(f, raw) {
    var F = f.format; if (!F) return null;
    var v = normDefault(raw), name = F.name || 'The answer';
    if (F.kind === 'hex') {
      v = v.replace(/^0x/, '');
      if (!/^[0-9a-f]*$/.test(v)) return name + ' is written in hex: digits 0–9 and letters a–f only.';
      if (F.len && v.length !== F.len) return name + ' is ' + (F.len / 2) + ' bytes, which is ' + F.len + ' hex characters. You entered ' + v.length + '.';
    } else if (F.kind === 'int') {
      if (!/^\d+$/.test(v)) return name + ' is a whole number, digits only.';
    } else if (F.kind === 'address') {
      if (!/^0x[0-9a-f]{40}$/.test(v)) return 'An Ethereum address is 0x followed by 40 hex characters. You entered ' + v.replace(/^0x/, '').length + ' after the 0x.';
    }
    return null;
  }

  var OPS = {
    sha256: { label: 'SHA-256', run: function (b) { return Kit.sha256(b); }, say: function (b) { return 'SHA-256 of ' + b.length + ' bytes → 32 bytes'; } },
    keccak256: { label: 'Keccak-256', run: function (b) { return Promise.resolve(root.KitLib.keccak_256(b)); }, say: function (b) { return 'Keccak-256 of ' + b.length + ' bytes → 32 bytes'; } },
    reverse: { label: 'Reverse bytes', run: function (b) { return Promise.resolve(b.slice().reverse()); }, say: function (b) { return 'reversed ' + b.length + ' bytes'; } }
  };
  var OP_ID = { sha256: 'op-sha', keccak256: 'op-keccak', reverse: 'op-rev' };

  Kit.runLab = function (id) {
    var L = root.BC_LABS[id];
    if (!L) throw new Error('No challenge called ' + id + ' is loaded');
    document.title = L.title;
    var main = Kit.chrome({ title: L.title, crumbs: L.crumbs || 'Challenge', home: '../../start.html' });
    main.append(el('div', { class: 'page-head' },
      el('div', { class: 'eyebrow' }, el('span', { class: 'tag accent', text: 'Challenge' }), (L.tags || []).map(function (t) { return el('span', { class: 'tag', text: t }); }),
        L.minutes ? el('span', { class: 'tag', text: '≈ ' + L.minutes + ' min' }) : null),
      el('h1', { text: L.title }),
      L.lede ? el('p', { class: 'lede', html: L.lede }) : null));

    Kit.signIn().then(function () { return Kit.gateItem(L.id); }).then(function (gate) {
      if (gate === 'locked') return;
      var who = Kit.who(), v = L.pick(Kit.room(), who), bench = null, loads = [], solvers = {};
      var H = function (x) { return typeof x === 'function' ? x(v) : x; };

      function artifactBlock(a, n, k) {
        var bytes = a.hex != null ? Kit.hex.toBytes(a.hex) : null;
        var box = el('div', { class: bytes ? 'hexblock' : 'artifact', id: 'bytes' + n + (k ? '-' + (k + 1) : '') });
        var legend = el('div', { class: 'legend', hidden: true }), row = el('div', { class: 'btn-row' });
        function paint(structured) {
          if (!bytes) { box.replaceChildren(a.label ? el('span', { class: 'artifact-label', text: a.label }) : '', a.text); return; }
          var hex = Kit.hex.from(bytes);
          if (!structured) { box.textContent = hex; legend.hidden = true; return; }
          var S = a.structure(bytes), kinds = {};
          box.replaceChildren.apply(box, S.regions.map(function (g) { kinds[g.kind] = 1; return el('span', { class: 'seg seg-' + g.kind, title: g.label + ': bytes ' + g.start + '–' + (g.end - 1) }, hex.slice(g.start * 2, g.end * 2)); }));
          legend.replaceChildren.apply(legend, S.legend.filter(function (l) { return kinds[l[0]]; }).map(function (l) { return el('span', null, el('i', { class: 'seg seg-' + l[0] }), l[1]); }));
          legend.hidden = false;
        }
        if (bytes) {
          if (a.load !== false) { loads.push({ label: a.label || 'your bytes', bytes: bytes }); row.append(el('button', { class: 'btn', type: 'button', id: 'load' + n + (k ? '-' + (k + 1) : ''), text: 'Load into workbench', onclick: function () { if (bench) bench.set(bytes, 'loaded ' + (a.label || 'the bytes') + ' (' + bytes.length + ' bytes)', !a.quiet); } }));
            if (L.bench && L.bench.append) row.append(el('button', { class: 'btn', type: 'button', id: 'append' + n + (k ? '-' + (k + 1) : ''), text: 'Add to the end', onclick: function () { if (bench) bench.append(bytes, a.label || 'the bytes'); } })); }
          if (a.structure) { var cb = el('input', { type: 'checkbox', id: 'struct' + n }); cb.addEventListener('change', function () { paint(cb.checked); }); row.append(el('label', { class: 'small' }, cb, ' Show structure')); }
          row.append(el('span', { class: 'muted small', text: bytes.length + ' bytes' }));
        }
        paint(false);
        return [bytes && a.label ? el('p', { class: 'small muted', style: 'margin:.75rem 0 .25rem', text: a.label }) : null, box, row.children.length ? row : null, legend];
      }

      /* ---- Workbench: whatever is in the box is the input; each button replaces it with its result ---- */
      function buildBench() {
        var B = L.bench, buf = el('textarea', { class: 'mono', id: 'buf', rows: '5', spellcheck: 'false', 'aria-label': 'Workbench bytes in hex' });
        var size = el('span', { class: 'muted small', id: 'bufsize' }), log = el('ul', { class: 'log', id: 'log' }), err = el('div', { id: 'buf-err' });
        function note(line) { log.prepend(el('li', { text: line })); while (log.children.length > 8) log.lastChild.remove(); }
        function set(bytes, line, scroll) { buf.value = Kit.hex.from(bytes); size.textContent = bytes.length + ' bytes'; if (line) note(line); if (scroll) buf.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        function get() {
          err.replaceChildren();
          try { return Kit.hex.toBytes(buf.value); } catch (e) { err.replaceChildren(el('div', { class: 'callout bad', text: e.message })); return null; }
        }
        buf.addEventListener('input', function () { var c = Kit.hex.clean(buf.value); size.textContent = (c.length / 2) + ' bytes' + (c.length % 2 ? ' (odd digit count)' : ''); });
        var row = el('div', { class: 'btn-row' }, (B.ops || []).map(function (name, i) {
          var op = OPS[name];
          return el('button', { class: 'btn' + (i === 0 ? ' primary' : ''), type: 'button', id: OP_ID[name], text: op.label, onclick: function () { var b = get(); if (b) op.run(b).then(function (r) { set(r, op.say(b)); }); } });
        }));
        if (B.number) row.append(el('button', { class: 'btn', type: 'button', id: 'op-num', text: 'Read as a number', onclick: function () {
          var b = get(); if (!b) return;
          if (!b.length || b.length > 32) return err.replaceChildren(el('div', { class: 'callout bad', text: 'Put 1 to 32 bytes in the box to read them as one number.' }));
          var big = BigInt('0x' + Kit.hex.from(b)), little = BigInt('0x' + Kit.hex.from(b.slice().reverse()));
          note(b.length + ' bytes as a number: ' + big.toString() + ' (first byte most significant)' + (b.length > 1 ? ', or ' + little.toString() + ' (first byte least significant)' : ''));
        } }));
        row.append(el('button', { class: 'btn', type: 'button', id: 'op-load', text: 'Reload my bytes', onclick: function () { if (loads[0]) set(loads[0].bytes, 'loaded ' + loads[0].label + ' (' + loads[0].bytes.length + ' bytes)'); } }),
          el('button', { class: 'btn', type: 'button', id: 'op-copy', text: 'Copy', onclick: function () { Kit.copy(Kit.hex.clean(buf.value)); } }));
        var extra = [];
        if (B.slice) {
          var from = el('input', { type: 'number', min: '0', id: 'slice-from', value: '0', 'aria-label': 'First byte to keep', style: 'width:5.5rem' }), count = el('input', { type: 'number', min: '1', id: 'slice-count', value: '32', 'aria-label': 'How many bytes to keep', style: 'width:5.5rem' });
          extra.push(el('div', { class: 'btn-row bench-row' }, el('span', { class: 'small', text: 'Keep' }), count, el('span', { class: 'small', text: 'bytes starting at byte' }), from,
            el('button', { class: 'btn', type: 'button', id: 'op-slice', text: 'Keep those bytes', onclick: function () {
              var b = get(); if (!b) return; var a = +from.value, n = +count.value;
              if (!(a >= 0) || !(n >= 1) || a + n > b.length) return err.replaceChildren(el('div', { class: 'callout bad', text: 'The box holds ' + b.length + ' bytes, numbered 0 to ' + (b.length - 1) + '. That range runs past the end.' }));
              set(b.slice(a, a + n), 'kept bytes ' + a + '–' + (a + n - 1) + ' of ' + b.length);
            } })));
        }
        if (B.text) {
          var txt = el('input', { type: 'text', class: 'mono', id: 'text-in', placeholder: B.textPlaceholder || 'text to turn into bytes', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Text to turn into bytes' });
          extra.push(el('div', { class: 'flag-row bench-row' }, txt, el('button', { class: 'btn', type: 'button', id: 'op-text', text: 'Text → bytes', onclick: function () { var b = new TextEncoder().encode(txt.value); set(b, 'text "' + txt.value + '" as ' + b.length + ' bytes (UTF-8)'); } })));
        }
        function append(bytes, label) {
          var b = get(); if (!b) return;
          var all = new Uint8Array(b.length + bytes.length); all.set(b); all.set(bytes, b.length);
          set(all, 'added ' + label + ' to the end (' + b.length + ' + ' + bytes.length + ' = ' + all.length + ' bytes)');
        }
        if (B.shelf) {
          var shelf = el('ul', { class: 'shelf', id: 'shelf' }), kept = 0;
          row.append(el('button', { class: 'btn', type: 'button', id: 'op-keep', text: 'Keep a copy', onclick: function () {
            var b = get(); if (!b || !b.length) return;
            var name = 'copy ' + (++kept), hex = Kit.hex.from(b);
            shelf.append(el('li', null, el('b', { text: name }), el('span', { class: 'mono small', text: (hex.length > 24 ? hex.slice(0, 12) + '…' + hex.slice(-8) : hex) + ' (' + b.length + ' bytes)' }),
              el('button', { class: 'icon-btn', type: 'button', text: 'Load', onclick: function () { set(b, 'loaded ' + name + ' (' + b.length + ' bytes)'); } }),
              el('button', { class: 'icon-btn', type: 'button', text: 'Add to the end', onclick: function () { append(b, name); } })));
            note('kept ' + name + ' (' + b.length + ' bytes)');
          } }));
          extra.push(shelf);
        }
        var panel = el('section', { class: 'panel', id: 'bench' },
          el('div', { class: 'panel-head' }, el('h2', { text: 'Workbench' }), size),
          el('p', { class: 'muted small', text: 'Whatever is in the box is the input. Each button replaces the box with its result, and the log below keeps your steps. You can also edit the hex by hand.' }),
          buf, row, extra, err, log);
        return { panel: panel, set: set, get: get, note: note, append: append };
      }

      /* ---- One flag: brief, artifacts, entry, feedback, debrief, hand-in ---- */
      function flagSection(f, n, split) {
        var key = L.id + ':' + f.id + ':' + who, n2 = normOf(f);
        var input = el('input', { type: 'text', id: 'flag' + n, placeholder: f.placeholder || 'your answer, or flag{…}', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Flag ' + n });
        var msg = el('div', { id: 'flag' + n + '-msg' }), submit = el('div', { id: 'submit' + n }), after = el('p', { class: 'small muted', id: 'after' + n });
        var debrief = el('div', { id: 'debrief' + n, hidden: true },
          f.debrief ? el('div', { html: f.debrief }) : null,
          f.general ? [el('h3', { text: 'Say it to a general' }), el('p', { class: 'note' }, el('b', { text: 'One sentence' }), f.general)] : null,
          after, el('h3', { text: 'Handed in' }), submit);
        function judge(raw) {
          var bad = formatProblem(f, raw);
          if (bad) return Promise.resolve({ ok: false, msg: bad });
          var entry = n2(raw);
          return Promise.resolve(f.answer(v)).then(function (ans) {
            if (entry === n2(ans)) return { ok: true, value: String(ans) };
            return Promise.resolve(f.near ? f.near(entry, v) : null).then(function (m) { return { ok: false, msg: m || f.wrong || 'Not it. Go back through your steps in the workbench log.' }; });
          });
        }
        function solved(value, fresh) {
          msg.replaceChildren(el('div', { class: 'callout ok' }, el('b', { text: fresh ? 'Correct. ' : 'Solved. ' }), 'Flag ' + n + ' is right. It is handed in for you: there is nothing to press.'));
          input.value = value; debrief.hidden = false; if (det) det.open = true;
          if (f.after) after.innerHTML = f.after(v, value); else after.hidden = true;
          var step = (L.steps || []).filter(function (st) { return st.flags.indexOf(f.id) >= 0; })[0];
          if (!step || step.flags.length < 2) Kit.handInOnce(submit, L.title + ', flag ' + n, function () { return { kind: 'flag', item: L.id, data: { rev: L.rev, flag: f.id, value: value } }; }, f.id);
          else {
            /* This flag belongs to a step that is handed in as one record, when the step is complete. */
            var show = function () {
              var sent = Kit.mine.get('sent:' + L.id + ':' + f.id + ':' + who, null);
              submit.replaceChildren(el('div', { class: 'btn-row', style: 'margin-top:0' }, sent ? el('span', { class: 'solved-badge', text: 'Submitted ✓ earlier (' + sent.ref + ', ' + sent.at + ')' })
                : el('span', { class: 'muted small', id: 'held' + n, text: 'Saved. It is handed in together with the rest of this step (' + step.flags.length + ' flags), or in ten minutes, whichever comes first.' })));
              return !!sent;
            };
            if (!show()) Kit.myRecords().then(function (m) {
              var it = m.items[L.id + ':' + f.id];
              if (it) { Kit.mine.set('sent:' + L.id + ':' + f.id + ':' + who, { ref: it.ref, at: new Date(it.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }); return show(); }
              document.addEventListener('kit-sent', function on(ev) { if (ev.detail.item === L.id && ev.detail.parts.indexOf(f.id) >= 0) { document.removeEventListener('kit-sent', on); show(); } });
              return Kit.hold({ item: L.id, step: step.id, flags: step.flags, rev: L.rev, label: L.title + ', ' + (step.title || 'step ' + step.id) }, f.id, value).then(show);
            });
          }
        }
        var form = el('form', { class: 'flag-row', id: 'flag' + n + '-form' }, input, el('button', { class: 'btn primary', type: 'submit', text: 'Check' }));
        function tryValue() {
          return judge(input.value).then(function (r) {
            if (r.ok) { Kit.mine.set(key, { value: r.value, at: new Date().toISOString() }); solved(r.value, true); }
            else msg.replaceChildren(el('div', { class: 'callout bad', text: r.msg }));
            return r.ok;
          });
        }
        form.addEventListener('submit', function (e) { e.preventDefault(); tryValue(); });
        solvers[f.id] = function (value) { input.value = value; return tryValue(); };
        var arts = f.artifacts ? f.artifacts(v) : [], blocks = [];
        arts.forEach(function (a, k) { blocks = blocks.concat(artifactBlock(a, n, k)); });
        /* One flat list: Kit.el takes a list of children, but not lists inside lists. */
        var task = [f.brief ? el('div', { class: 'brief', html: H(f.brief) }) : null].concat(blocks,
          (f.hints || []).map(function (h, i) { return el('details', { class: 'hint' }, el('summary', { text: 'Hint ' + (i + 1) }), el('span', { html: h })); }));
        var entry = [el('div', { style: 'margin-top:.75rem' }, form), msg, debrief];
        var body = split ? entry : task.concat(entry);
        var det = null, node, head = el('div', { class: 'panel-head' }, el('h2', { text: 'Flag ' + n + ': ' + f.title }), el('span', { class: 'pts', text: f.points + ' pts' }));
        if (f.deeper) {
          det = el('details', { class: 'deeper', id: n === 2 ? 'deeper' : 'deeper' + n }, el('summary', null, 'Go deeper: Flag ' + n + ', ' + f.title + ' ', el('span', { class: 'pts', text: f.points + ' pts' })), el('div', { style: 'margin-top:.75rem' }, body));
          node = el('section', { class: 'panel', id: 'flag' + n + '-panel' }, det);
        } else node = el('section', { class: 'panel', id: 'flag' + n + '-panel' }, split ? el('h2', { text: 'Your answer to flag ' + n }) : head, body);
        if (split) node = [el('section', { class: 'panel', id: 'flag' + n + '-task' }, head, task), node];
        /* Already solved: on this computer, or handed in from another one. */
        var prior = Kit.mine.get(key, null);
        if (prior && prior.value) judge(prior.value).then(function (r) { if (r.ok) solved(r.value, false); });
        else Kit.myRecords().then(function (m) {
          var it = m.items[L.id + ':' + f.id];
          if (it && it.data && it.data.value != null && debrief.hidden) judge(it.data.value).then(function (r) { if (r.ok) solved(r.value, false); });
        });
        return node;
      }

      /* The first flag's task sits above the workbench and its answer box below it. Later flags are whole sections. */
      var sections = L.flags.map(function (f, i) { return flagSection(f, i + 1, i === 0 && !f.deeper && !!(L.bench || (L.tools && L.tools.length))); });
      var first = Array.isArray(sections[0]) ? sections[0] : [sections[0]];
      sections = first.slice(1).concat(sections.slice(1)); sections.unshift(first[0]);
      var intro = L.real ? el('div', { class: 'note', id: 'real' }, el('b', { text: 'What\'s real here' }), el('span', { html: L.real })) : null;
      if (intro) sections[0].insertBefore(intro, sections[0].children[1] || null);
      var top = el('div', { class: 'small muted', id: 'variant-row', style: 'text-align:right;margin:-.5rem 0 .5rem' }, el('span', { id: 'variant', text: (L.variantLabel ? L.variantLabel(v) + ' · ' : '') + 'room ' + Kit.room() }));
      main.append(top, sections[0]);
      if (L.ref && Kit.REF && Kit.REF[L.ref]) {
        var ref = Kit.refPanel(L.ref, false);
        if (L.refPage) ref.querySelector('summary').after(el('p', { class: 'small muted', html: 'Printable copy: <a href="' + L.refPage + '" target="_blank">open as a page ↗</a>' }));
        main.append(ref);
      }
      if (L.bench) { bench = buildBench(); main.append(bench.panel); if (loads[0]) bench.set(loads[0].bytes); }
      /* A tool can claim a flag itself (api.solve('f2', value)) when the work is something done, not something typed. */
      (L.tools || []).forEach(function (t) { main.append(t(v, { el: el, bench: bench, Kit: Kit, solve: function (flag, value) { return solvers[flag] ? solvers[flag](value) : Promise.resolve(false); } })); });
      sections.slice(1).forEach(function (s) { main.append(s); });
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);

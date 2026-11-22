/* Quiz runner. Every quiz page is a small HTML file that loads kit.js, this file and its quiz-data.js.
   The page carries questions only. Answers stay in the instructor's private repo, and grading happens in the
   instructor dashboard after students submit their sealed answers. Needs kit.js. */
(function (root) {
  'use strict';
  var Kit = root.Kit, el = Kit.el;

  Kit.runQuiz = function (Q) {
    var main = Kit.chrome({ title: Q.title, crumbs: (Q.section || 'Quiz') + (Q.lesson ? ' · ' + Q.lesson : ''), home: '../../start.html' });
    main.append(el('div', { class: 'page-head' },
      el('div', { class: 'eyebrow' }, el('span', { class: 'tag accent', text: 'Quiz' }), Q.section ? el('span', { class: 'tag', text: Q.section }) : null,
        Q.lesson ? el('span', { class: 'tag', text: Q.lesson }) : null, Q.minutes ? el('span', { class: 'tag', text: '≈ ' + Q.minutes + ' min' }) : null),
      el('h1', { text: Q.title }),
      Q.instructions ? el('p', { class: 'lede', text: Q.instructions }) : null
    ));

    Kit.signIn().then(function () { return Kit.gateItem(Q.id); }).then(function (gate) {
      if (gate === 'locked') return null;
      /* A quiz is handed in once. If this student already has, on this computer or any other, show what they gave. */
      return Kit.myRecords().then(function (m) { return { gate: gate, prior: m.items[Q.id + ':'] || null }; });
    }).then(function (start) {
      if (!start) return;
      var storeKey = 'quiz:' + Q.id + ':' + Kit.who(), sentKey = 'sent:' + Q.id + '::' + Kit.who();
      var local = Kit.mine.get(sentKey, null), prior = start.prior;
      var waiting = Kit.outbox().filter(function (e) { return e.item === Q.id; })[0] || null;   // handed in here, not yet received by the class
      var locked = !!(prior || local || waiting);
      var answers = prior && prior.data && prior.data.answers ? JSON.parse(JSON.stringify(prior.data.answers)) : Kit.mine.get(storeKey, {});
      var unknown = !!(prior && !(prior.data && prior.data.answers) && !Object.keys(Kit.mine.get(storeKey, {})).length);   // handed in, but no copy we can read
      function save() { if (!locked) Kit.mine.set(storeKey, answers); }
      var rand = Kit.rng(Kit.seedFor(Q.id));
      var panel = el('section', { class: 'panel' });

      Q.questions.forEach(function (q, idx) {
        var name = 'q-' + q.id;
        var body = el('div', { class: 'q', id: 'q-' + q.id });
        body.append(el('div', { class: 'q-head' }, el('span', { class: 'q-num', text: String(idx + 1).padStart(2, '0') }), el('span', { class: 'q-prompt', text: q.prompt })));
        if (q.artifact) body.append(el('div', { class: 'artifact' }, q.artifact.label ? el('span', { class: 'artifact-label', text: q.artifact.label }) : null, q.artifact.text));
        if (q.ask) body.append(el('p', { class: 'q-prompt', text: q.ask }));

        if (q.type === 'single' || q.type === 'multi') {
          body.append(el('p', { class: 'q-how', text: q.type === 'multi' ? 'Select all that apply.' : 'Select one.' }));
          Kit.shuffle(q.options, rand).forEach(function (o) {
            var input = el('input', { type: q.type === 'multi' ? 'checkbox' : 'radio', name: name, value: o.id, disabled: locked });
            var cur = answers[q.id];
            input.checked = q.type === 'multi' ? Array.isArray(cur) && cur.indexOf(o.id) >= 0 : cur === o.id;
            input.addEventListener('change', function () {
              if (q.type === 'multi') {
                answers[q.id] = Array.prototype.map.call(body.querySelectorAll('input:checked'), function (i) { return i.value; });
              } else answers[q.id] = o.id;
              save();
            });
            body.append(el('label', { class: 'opt' }, input, el('span', { text: o.text })));
          });
        } else if (q.type === 'order') {
          body.append(el('p', { class: 'q-how', text: 'Use the arrows to put the steps in order, first at the top.' }));
          var ids = Array.isArray(answers[q.id]) && answers[q.id].length === q.options.length ? answers[q.id] : Kit.shuffle(q.options, rand).map(function (o) { return o.id; });
          var text = {}; q.options.forEach(function (o) { text[o.id] = o.text; });
          var list = el('ol', { class: 'order-list' });
          var paint = function () {
            list.replaceChildren.apply(list, ids.map(function (id, i) {
              var mv = function (d) { return function () { var j = i + d; var t = ids[i]; ids[i] = ids[j]; ids[j] = t; answers[q.id] = ids.slice(); save(); paint(); list.children[j].querySelector('button[data-d="' + d + '"]') && list.children[j].querySelector('button[data-d="' + d + '"]').focus(); }; };
              return el('li', null, el('span', { text: text[id] }),
                el('button', { type: 'button', 'data-d': '-1', 'aria-label': 'Move up', disabled: locked || i === 0, onclick: mv(-1) }, '↑'),
                el('button', { type: 'button', 'data-d': '1', 'aria-label': 'Move down', disabled: locked || i === ids.length - 1, onclick: mv(1) }, '↓'));
            }));
          };
          paint();
          if (!answers[q.id] && !locked) { answers[q.id] = ids.slice(); answers['_untouched_' + q.id] = true; }
          list.addEventListener('click', function () { delete answers['_untouched_' + q.id]; save(); });
          body.append(list);
        } else if (q.type === 'short') {
          var inp = el('input', { type: 'text', class: 'mono', placeholder: q.placeholder || '', value: answers[q.id] || '', autocomplete: 'off', disabled: locked, 'aria-label': 'Answer to question ' + (idx + 1) });
          inp.addEventListener('input', function () { answers[q.id] = inp.value; save(); });
          body.append(el('div', { style: 'max-width:22rem;margin-top:.4rem' }, inp));
        }
        panel.append(body);
      });
      main.append(panel);

      function lock() {
        locked = true;
        Array.prototype.forEach.call(panel.querySelectorAll('input, button'), function (i) { i.disabled = true; });
      }
      function payload() {
        var clean = {}; Q.questions.forEach(function (q) { if (answers[q.id] != null) clean[q.id] = answers[q.id]; });
        return { kind: 'quiz', item: Q.id, data: { rev: Q.rev || null, answers: clean } };
      }
      var out = el('div'), box = el('section', { class: 'panel', id: 'quiz-submit' });
      main.append(box);

      /* Hand in. The answers are fixed from this moment, whether or not the class can be reached right now. */
      function send(btn) {
        btn.disabled = true; lock();
        return Kit.submit(out, payload(), Q.title).then(function (r) {
          if (r && r.sent) { btn.remove(); review({ ref: r.ref, time: new Date().toISOString() }, true); }
          else if (r && r.queued) { btn.remove(); pending(true); }
          else btn.disabled = false;
        });
      }
      /* Handed in on this computer and waiting in the outbox: it sends by itself, and this page says so when it has. */
      function pending(justNow) {
        box.replaceChildren(el('h2', { text: 'Your hand-in' }), el('div', { class: 'callout warn', id: 'quiz-waiting' }, el('b', { text: 'Not received by the class yet. ' }), 'Your answers are fixed and saved on this computer. They will be sent by itself as soon as the class can be reached.'),
          justNow ? out : el('div', { class: 'btn-row' }, el('button', { class: 'btn primary', type: 'button', text: 'Send it now', onclick: function () { Kit.flushOutbox(); } }), el('a', { class: 'btn', href: Kit.base + '../start.html', text: '← Back to your course home' })));
        document.addEventListener('kit-sent', function on(ev) { if (ev.detail.item === Q.id) { document.removeEventListener('kit-sent', on); review({ ref: ev.detail.ref, time: new Date().toISOString() }, false); } });
      }
      /* Review: what was handed in, and once the quiz is closed and graded, which questions were right. */
      function review(rec, justNow) {
        var when = rec && rec.time ? new Date(rec.time) : null;
        var head = el('div', { class: 'callout ok', id: 'quiz-handed-in' }, el('b', { text: 'Handed in ✓ ' }),
          (rec && rec.ref && rec.ref !== 'by hand' ? 'Received as ' + rec.ref : 'Handed in by hand') + (when && !isNaN(when) ? ', ' + when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' on ' + when.toLocaleDateString([], { day: 'numeric', month: 'short' }) : '') +
          '. A quiz is handed in once. ' + (unknown ? 'Your answers were handed in from another computer before copies were kept, so they can\'t be shown here.' : 'Above are the answers you gave.'));
        var score = el('p', { class: 'muted small', id: 'quiz-score', text: 'Your score appears here once your instructor closes the quiz.' });
        box.replaceChildren(el('h2', { text: 'Your hand-in' }), head, score, justNow ? out : el('div', { class: 'btn-row' }, el('a', { class: 'btn', href: Kit.base + '../start.html', text: '← Back to your course home' })));
        Kit.myResults().then(function (r) {
          var g = r && r.mine.quizzes[Q.id];
          if (!g) return;
          score.replaceChildren(el('b', { text: 'Score: ' + g.score + ' / ' + g.max + '. ' }), 'Each question is marked right or wrong above. The answers are gone through in class.');
          score.className = 'small';
          Q.questions.forEach(function (q) {
            var h = document.querySelector('#q-' + q.id + ' .q-head');
            if (h && g.per[q.id] != null && !h.querySelector('.q-mark')) h.append(el('span', { class: 'q-mark tag ' + (g.per[q.id] ? 'ok' : 'bad'), 'data-ok': g.per[q.id] ? 'yes' : 'no', text: g.per[q.id] ? '✓ right' : '✗ wrong' }));
          });
        }, function () {});
      }

      if (prior) return review(prior, false);
      if (local) return review({ ref: local.ref, time: null }, false);
      if (waiting) return pending(false);
      var warn = el('div'), confirmRow = el('div', { class: 'btn-row' });
      var btn = el('button', { class: 'btn primary', type: 'button', text: 'Submit quiz', onclick: function () {
        var missing = Q.questions.filter(function (q) {
          var a = answers[q.id];
          return a == null || a === '' || (Array.isArray(a) && !a.length) || answers['_untouched_' + q.id];
        }).map(function (q) { return Q.questions.indexOf(q) + 1; });
        var go = el('button', { class: 'btn primary', type: 'button', id: 'quiz-confirm', text: 'Hand in for good', onclick: function () { warn.replaceChildren(); btn.remove(); confirmRow.replaceChildren(go); go.textContent = 'Sending…'; send(go); } });
        warn.replaceChildren(el('div', { class: 'callout ' + (missing.length ? 'warn' : 'info') },
          missing.length ? el('b', { text: 'No answer for question ' + missing.join(', ') + '. ' }) : null, 'A quiz is handed in once: you can\'t change your answers afterwards.'));
        confirmRow.replaceChildren(go, el('button', { class: 'btn', type: 'button', text: 'Keep working', onclick: function () { warn.replaceChildren(); confirmRow.replaceChildren(); } }));
      } });
      box.replaceChildren(
        el('h2', { text: 'Submit' }),
        el('p', { class: 'muted small', text: 'Your answers are saved in this browser as you go. Handing in signs them with your course key and encrypts them for your instructor. You hand a quiz in once.' + (start.gate === 'closed' ? ' This quiz is closed, so handing in now won\'t count.' : '') }),
        el('div', { class: 'btn-row' }, btn), warn, confirmRow, out);
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);

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
      if (gate === 'locked') return;
      var storeKey = 'quiz:' + Q.id + ':' + Kit.who();
      var answers = Kit.mine.get(storeKey, {});
      function save() { Kit.mine.set(storeKey, answers); }
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
            var input = el('input', { type: q.type === 'multi' ? 'checkbox' : 'radio', name: name, value: o.id });
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
                el('button', { type: 'button', 'data-d': '-1', 'aria-label': 'Move up', disabled: i === 0, onclick: mv(-1) }, '↑'),
                el('button', { type: 'button', 'data-d': '1', 'aria-label': 'Move down', disabled: i === ids.length - 1, onclick: mv(1) }, '↓'));
            }));
          };
          paint();
          if (!answers[q.id]) { answers[q.id] = ids.slice(); answers['_untouched_' + q.id] = true; }
          list.addEventListener('click', function () { delete answers['_untouched_' + q.id]; save(); });
          body.append(list);
        } else if (q.type === 'short') {
          var inp = el('input', { type: 'text', class: 'mono', placeholder: q.placeholder || '', value: answers[q.id] || '', autocomplete: 'off', 'aria-label': 'Answer to question ' + (idx + 1) });
          inp.addEventListener('input', function () { answers[q.id] = inp.value; save(); });
          body.append(el('div', { style: 'max-width:22rem;margin-top:.4rem' }, inp));
        }
        panel.append(body);
      });
      main.append(panel);

      var out = el('div');
      var warn = el('div');
      var btn = el('button', { class: 'btn primary', type: 'button', text: 'Submit quiz', onclick: function () {
        var missing = Q.questions.filter(function (q) {
          var a = answers[q.id];
          return a == null || a === '' || (Array.isArray(a) && !a.length) || answers['_untouched_' + q.id];
        }).map(function (q) { return Q.questions.indexOf(q) + 1; });
        warn.replaceChildren(missing.length ? el('div', { class: 'callout warn', text: 'Submitted with no answer for question ' + missing.join(', ') + '. You can answer and submit again.' }) : '');
        var clean = {}; Q.questions.forEach(function (q) { if (answers[q.id] != null) clean[q.id] = answers[q.id]; });
        btn.disabled = true;
        Kit.submit(out, { kind: 'quiz', item: Q.id, data: { rev: Q.rev || null, answers: clean } }, Q.title).then(function () { btn.disabled = false; btn.textContent = 'Submit again'; });
      } });
      main.append(el('section', { class: 'panel' },
        el('h2', { text: 'Submit' }),
        el('p', { class: 'muted small', text: 'Your answers are saved in this browser as you go. Submitting signs them with your course key and encrypts them for your instructor. You can submit again; your latest submission counts.' }),
        el('div', { class: 'btn-row' }, btn),
        warn, out
      ));
    });
  };
})(typeof window !== 'undefined' ? window : globalThis);

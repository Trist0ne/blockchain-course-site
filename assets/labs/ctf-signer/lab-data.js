/* "Who signed it?": recover the signer of a message from its signature (secp256k1, EIP-191 personal_sign).
   The key holders and their keys are made up per class from the room code; the answers are computed, never stored.
   Needs kit.js, kit/wallet.js and kit/lab.js. */
(function (root) {
  'use strict';
  var Kit = root.Kit, enc = new TextEncoder();
  var ROLES = ['Treasury lead', 'Security officer', 'Operations manager', 'Internal auditor'];
  var VENDORS = ['Harbor Logistics', 'Northfield Systems', 'Kestrel Aviation', 'Blue Mesa Supply', 'Ironwood Freight'];
  function keyFor(room, i) { return root.KitLib.keccak_256(enc.encode('ctf-signer|' + room + '|key|' + i)); }
  /* The same signature a wallet makes for "sign this message": 65 bytes, r, s, then v (27 or 28). */
  function sign(message, priv) {
    var sig = root.KitLib.secp256k1.sign(Kit.wallet.personalHash(message), priv, { prehash: false, format: 'recovered' });
    var out = new Uint8Array(65); out.set(sig.slice(1), 0); out[64] = 27 + sig[0];
    return '0x' + Kit.hex.from(out);
  }
  function holders(room) {
    return ROLES.map(function (role, i) { var k = keyFor(room, i); return { role: role, key: k, address: Kit.wallet.recover('x', sign('x', k)) }; });
  }
  function build(room, who) {
    var h = Kit.hash32(room + '|' + String(who).toLowerCase() + '|ctf-signer'), H = holders(room);
    var s1 = h % 4, s2 = (s1 + 1 + ((h >>> 4) % 3)) % 4;                        // two different signers
    var order = 1000 + ((h >>> 8) % 9000), btc = 5 * (1 + ((h >>> 12) % 19));
    var base = 100 * (2 + ((h >>> 16) % 8)), vendor = VENDORS[(h >>> 20) % VENDORS.length], inv = 100 + ((h >>> 24) % 900);
    var m1 = 'Order ' + order + ': release ' + btc + ' BTC from cold storage to the exchange account.';
    var pay = function (n) { return 'Invoice ' + inv + ': pay ' + n + ' USDC to ' + vendor + '.'; };
    var options = [base / 10, base, base * 10, base * 100].sort(function (a, b) { return a - b; });
    return { holders: H, s1: s1, s2: s2, m1: m1, sig1: sign(m1, H[s1].key), shown: pay(base * 10), shownAmount: base * 10, original: base, sig2: sign(pay(base), H[s2].key),
      options: options, pay: pay };
  }
  function table(v) {
    return '<div class="table-wrap"><table class="data"><thead><tr><th>Key holder</th><th>Address on file</th></tr></thead><tbody>'
      + v.holders.map(function (h) { return '<tr><td>' + h.role + '</td><td class="mono">' + h.address + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  Kit.defineLab({
    id: 'ctf-signer', rev: 1,
    title: 'Who signed it?', tags: ['Cryptography', 'Signatures'], minutes: 10, crumbs: 'Cryptography · Challenge',
    lede: 'A digital signature doesn\'t carry a name. It carries just enough for anyone to work out which key made it, for one exact message. That is how every Ethereum transaction says who sent it.',
    real: 'The signatures are real: secp256k1 ECDSA over the "personal message" hash (EIP-191), exactly what a wallet produces when a site asks you to sign text. The shortcut: the four key holders and their keys are made up for this class.',
    ref: 'eth-sign', refPage: '../../ref/ethereum.html',
    build: build,
    pick: function (room, who) { return build(room, who); },
    variantLabel: function (v) { return 'variant ' + (v.s1 + 1) + '·' + (v.s2 + 1); },
    tools: [function (v, api) {
      var el = api.el, msg = el('textarea', { id: 'rec-msg', rows: '2', spellcheck: 'false', 'aria-label': 'Message' }), sig = el('input', { type: 'text', class: 'mono', id: 'rec-sig', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Signature', placeholder: '0x… (65 bytes)' });
      var out = el('div', { id: 'rec-out' });
      msg.value = v.m1; sig.value = v.sig1;
      return el('section', { class: 'panel', id: 'recover' }, el('h2', { text: 'Recover the signer' }),
        el('p', { class: 'muted small', text: 'Give it a message and a signature. It works out which address made that signature over exactly that message. Change either and try again.' }),
        el('label', { class: 'field' }, el('span', { text: 'Message (every character counts, including the full stop)' }), msg),
        el('label', { class: 'field' }, el('span', { text: 'Signature' }), sig),
        el('div', { class: 'btn-row', style: 'margin-top:0' }, el('button', { class: 'btn primary', type: 'button', id: 'rec-go', text: 'Recover address', onclick: function () {
          try { out.replaceChildren(el('div', { class: 'artifact' }, el('span', { class: 'artifact-label', text: 'Recovered address' }), Kit.wallet.recover(msg.value, sig.value.trim()))); }
          catch (e) { out.replaceChildren(el('div', { class: 'callout bad', text: 'That is not a signature this tool can read: ' + e.message + '.' })); }
        } }),
          el('button', { class: 'btn', type: 'button', id: 'rec-load2', text: 'Load the invoice from flag 2', onclick: function () { msg.value = v.shown; sig.value = v.sig2; out.replaceChildren(); } })),
        out);
    }],
    flags: [{
      id: 'f1', points: 100, title: 'the signer',
      brief: function (v) { return '<p>Moving funds out of cold storage needs a signed order from one of four key holders. This order arrived with a signature attached and no name on it.</p>' + table(v) + '<p><b>Which address signed the order?</b> Use the tool below, then enter the address.</p>'; },
      artifacts: function (v) { return [{ label: 'The order', text: v.m1 }, { label: 'Signature', text: v.sig1 }]; },
      placeholder: '0x… the address that signed', format: { kind: 'address' },
      answer: function (v) { return v.holders[v.s1].address; },
      near: function (entry, v) {
        var hit = v.holders.filter(function (h) { return h.address.toLowerCase() === entry; })[0];
        return hit ? 'That is the ' + hit.role + '\'s address, but this signature doesn\'t recover to it. Recover the address first, then find it in the list.' : 'That address isn\'t what this signature recovers to for this exact message. Check that the message in the tool matches the order character for character.';
      },
      hints: ['The tool already holds the order and its signature. Press "Recover address".', 'Match the recovered address against the four on file. The first and last few characters are enough to tell them apart.'],
      debrief: '<h2>Debrief</h2><h3>No "from" field</h3><p>You never told the tool who signed. It worked the address out from the signature and the message alone. An Ethereum transaction works the same way: it has no sender field. Every node recovers the sender from the signature, then checks that account\'s balance and nonce.</p>'
        + '<h3>What that buys you</h3><p>The key holder can\'t later deny the order, and nobody without the key could have produced it. But notice what you actually verified: that this address signed these exact characters. Whether the Treasury lead is still the person holding that key is a question the math can\'t answer.</p>',
      general: 'A signature doesn\'t say who signed. It lets anyone compute which key signed, for one exact message, without trusting whoever passed it along.'
    }, {
      id: 'f2', points: 200, title: 'the altered invoice', deeper: true,
      brief: function (v) { return '<p>This payment instruction reached the finance desk with a signature that "checks out as valid". It was signed by one of the four key holders, but <b>the amount was changed after it was signed</b>.</p><p>The original amount was one of: <b>' + v.options.join(', ') + '</b> USDC. <b>Work out the amount that was actually signed.</b></p>'; },
      artifacts: function (v) { return [{ label: 'The instruction as received', text: v.shown }, { label: 'Signature', text: v.sig2 }]; },
      placeholder: 'the original amount, a whole number', format: { kind: 'int', name: 'The amount' },
      answer: function (v) { return String(v.original); },
      near: function (entry, v) {
        if (entry === String(v.shownAmount)) return 'That is the amount as received. Recover the signer of the instruction as it stands: does that address belong to any of the four key holders?';
        if (v.options.map(String).indexOf(entry) >= 0) return 'With that amount in the message, the signature doesn\'t recover to any of the four key holders. Change only the number, nothing else, and try each candidate.';
        return 'The original amount is one of the candidates listed.';
      },
      hints: ['Press "Load the invoice from flag 2" in the tool and recover the address. Compare it with the four on file.', 'Edit only the amount in the message and recover again. The right amount is the one that makes the recovered address match a key holder.'],
      debrief: '<h3>"Valid" compared with what?</h3><p>The altered instruction still recovered an address without any error. It just wasn\'t anybody\'s. Almost any message and signature recover <i>some</i> address. A signature is only meaningful when you compare the recovered address with the one you expected, over the exact bytes that were signed.</p>'
        + '<p>So when a tool, a report or a counterpart says "the signature is valid", ask two things: valid for which address, and over exactly which message?</p>',
      general: 'Change one character of a signed message and the signature doesn\'t fail, it quietly points at a stranger. "Valid" only means something next to the address you expected.'
    }]
  });
})(typeof window !== 'undefined' ? window : globalThis);

/* "One hash for the whole block": build a Bitcoin Merkle root from real transaction IDs.
   Nothing is stored but the IDs: the roots are computed from them, which is the challenge. Needs kit.js and kit/lab.js. */
(function (root) {
  'use strict';
  var Kit = root.Kit;
  /* IDs of real mainnet transactions, in the byte order Bitcoin stores them (an explorer shows each one reversed). */
  var LEAVES = [
    "169e1e83e930853391bc6f35f605c6754cfead57cf8387639d3b4096c54f18f4",
    "c40297f730dd7b5a99567eb8d27b78758f607507c52292d02d4031895b52f2ff",
    "c46e239ab7d28e2c019b6d66ad8fae98a56ef1f21aeecb94d1b1718186f05963",
    "3ac88578449859fd2288956d60fb641b158b1c0798dca86588c22351ed138588",
    "54db71344c54436361a53d9cbcb4e0a2ba0fe35f6e23e906284a6f17f0fe3ec0",
    "9fc661192944aa19aa9a1d097b30f9505aba500634b04d0f6725c0fdbb486cfe",
    "58c965434fab08c85275d884a244a80ec16240d1253eb0e778b37849b69ebab8",
    "7880603c6d1d6aa8848c9300eb050646383c3bab2ef2bff97a7ac856a3ed70a0",
    "2a077fa1b991490c402a0ca3b730e6cd56ca1382db052445f5e4b89562516bb9"
  ];
  function cat(a, b) { var o = new Uint8Array(a.length + b.length); o.set(a); o.set(b, a.length); return o; }
  function display(h) { return Kit.hex.from(h.slice().reverse()); }
  /* Bitcoin's rule: hash neighbours in pairs with double SHA-256; a level with an odd count pairs its last hash
     with a copy of itself. `hash` and `odd` let the near-miss checks build the wrong trees too. */
  function merkle(leaves, hash, odd) {
    hash = hash || Kit.sha256d;
    if (leaves.length === 1) return Promise.resolve(leaves[0]);
    var jobs = [];
    for (var i = 0; i < leaves.length; i += 2) {
      if (i + 1 < leaves.length) jobs.push(hash(cat(leaves[i], leaves[i + 1])));
      else jobs.push(odd === 'carry' ? Promise.resolve(leaves[i]) : hash(cat(leaves[i], leaves[i])));
    }
    return Promise.all(jobs).then(function (next) { return merkle(next, hash, odd); });
  }
  function leaves(v, n) { return v.ids.slice(0, n).map(function (i) { return Kit.hex.toBytes(LEAVES[i]); }); }
  function arts(n) { return function (v) { return v.ids.slice(0, n).map(function (i, k) { return { label: 'transaction ID ' + 'ABCD'[k], hex: LEAVES[i], quiet: true }; }); }; }
  Kit.defineLab({
    id: 'ctf-merkle', rev: 1,
    title: 'One hash for the whole block', tags: ['Cryptography', 'Merkle trees'], minutes: 12, crumbs: 'Cryptography · Challenge',
    lede: 'A Bitcoin block header has room for exactly one 32-byte hash of its transactions, and a block can hold thousands. That one hash, the <b>Merkle root</b>, still pins down every one of them.',
    real: 'The transaction IDs are real, from Bitcoin\'s main network, and the tree is built exactly the way Bitcoin builds it. The shortcut: these four transactions were never the whole of one block, so no real block has the root you are about to compute.',
    ref: 'bitcoin-block', refPage: '../../ref/bitcoin.html',
    bench: { ops: ['sha256', 'reverse'], append: true, shelf: true },
    leaves: LEAVES, merkle: merkle,
    pick: function (room, who) {
      var idx = LEAVES.map(function (_, i) { return i; });
      return { ids: Kit.shuffle(idx, Kit.rng(room + '|' + String(who).toLowerCase() + '|ctf-merkle')).slice(0, 4) };
    },
    variantLabel: function (v) { return 'variant ' + v.ids.map(function (i) { return i + 1; }).join('·'); },
    flags: [{
      id: 'f1', points: 100, title: 'the Merkle root',
      brief: '<p>A block contains these four transactions, in this order: A, B, C, D. <b>Compute its Merkle root, as a block explorer shows it.</b></p><p>The rule: join two neighbouring 32-byte values, left then right, into 64 bytes and hash them. Do that for A with B and for C with D, then for the two results. In Bitcoin, "hash" here means SHA-256 twice.</p><p class="small muted">The IDs below are in the byte order Bitcoin stores and hashes them, so use them as they are. Only your final answer needs turning into explorer order.</p>',
      artifacts: arts(4),
      placeholder: '64 hex characters, or flag{…}', format: { kind: 'hex', len: 64, name: 'A Merkle root' },
      answer: function (v) { return merkle(leaves(v, 4)).then(display); },
      near: function (entry, v) {
        var l = leaves(v, 4);
        return Promise.all([merkle(l), merkle(l, Kit.sha256), merkle([l[1], l[0], l[3], l[2]]), merkle(l.slice(0, 3))]).then(function (r) {
          if (entry === Kit.hex.from(r[0])) return 'Right root, in the byte order Bitcoin stores it. A block explorer shows it reversed.';
          if (entry === Kit.hex.from(r[1]) || entry === display(r[1])) return 'You hashed once at each step. Every hash in Bitcoin\'s tree is SHA-256 twice.';
          if (entry === Kit.hex.from(r[2]) || entry === display(r[2])) return 'Right method, but the pairs are joined right-then-left. Order matters: A then B, C then D.';
          if (entry === Kit.hex.from(r[3]) || entry === display(r[3])) return 'That is the root of A, B and C only. D belongs in the tree too.';
          return null;
        });
      },
      wrong: 'Not the root of these four. Check the log: join A and B (64 bytes), SHA-256 twice, keep a copy; the same for C and D; then join the two copies and hash twice again.',
      hints: ['Load A, add B to the end: 64 bytes. SHA-256, SHA-256. Press "Keep a copy". Do the same for C and D.', 'Load your first copy, add the second to the end, SHA-256 twice. That is the root as Bitcoin stores it. One more step turns it into what an explorer shows.'],
      debrief: '<h2>Debrief</h2><h3>Why a tree and not one big hash?</h3><p>To prove that transaction A is in this block, you don\'t need the other transactions. You need B, and the hash of C with D: two hashes. Anyone can then rebuild the root and compare it with the header. For a block of 4,000 transactions the proof is 12 hashes. That is how a lightweight wallet can check that a payment is in a block without downloading the block.</p>'
        + '<h3>Why it matters</h3><p>Change what any transaction does and its ID changes, so every hash above it changes, so the root changes, so the header changes, so the block\'s proof of work is gone. One 32-byte field makes every transaction in the block tamper-evident.</p>',
      general: 'The block header holds one fingerprint that covers every transaction in the block, so you can prove a payment is in a block with a dozen hashes instead of the whole block.',
      after: function () { return 'Each ID above, with its bytes reversed, is a real transaction you can find in a block explorer.'; }
    }, {
      id: 'f2', points: 200, title: 'an odd number of transactions', deeper: true,
      brief: '<p>Pairs need an even count. Now the block holds only three transactions: A, B and C. <b>Compute its Merkle root, as a block explorer shows it.</b></p><p>You will have to decide what to do with C. The reference sheet says what Bitcoin does.</p>',
      placeholder: '64 hex characters, or flag{…}', format: { kind: 'hex', len: 64, name: 'A Merkle root' },
      answer: function (v) { return merkle(leaves(v, 3)).then(display); },
      near: function (entry, v) {
        var l = leaves(v, 3);
        return Promise.all([merkle(l), merkle(l, null, 'carry'), merkle(leaves(v, 4)), merkle(l, Kit.sha256)]).then(function (r) {
          if (entry === Kit.hex.from(r[0])) return 'Right root, in the byte order Bitcoin stores it. A block explorer shows it reversed.';
          if (entry === Kit.hex.from(r[1]) || entry === display(r[1])) return 'You carried C up a level on its own. Bitcoin doesn\'t: a leftover hash is paired with a copy of itself.';
          if (entry === Kit.hex.from(r[2]) || entry === display(r[2])) return 'That is the root with D included. This block has only A, B and C.';
          if (entry === Kit.hex.from(r[3]) || entry === display(r[3])) return 'You hashed once at each step. Every hash in Bitcoin\'s tree is SHA-256 twice.';
          return null;
        });
      },
      wrong: 'Not the root of A, B and C. What does Bitcoin pair a leftover hash with?',
      hints: ['When a level has an odd number of hashes, Bitcoin pairs the last one with a copy of itself.', 'Load C, add C to the end, SHA-256 twice. Use that where the hash of C with D went before.'],
      debrief: '<h3>A rule with a sharp edge</h3><p>Pairing a leftover hash with itself means two different lists of transactions can have the same root: one ending in C, and one ending in C, C. In 2012 this was shown to let an attacker hand a node a corrupted copy of a valid block that had the same hash, so that the node would then refuse the real one (CVE-2012-2459). Bitcoin software has detected the trick ever since.</p><p>The lesson for an analyst: "the hashes match" proves exactly what the hashing rule covers, and no more. Know the rule.</p>'
    }]
  });
})(typeof window !== 'undefined' ? window : globalThis);

/* "Check the work": real Bitcoin block headers, 80 bytes each. Nothing is stored but the headers:
   the block hash and the target are computed from them, which is the challenge. Needs kit.js and kit/lab.js. */
(function (root) {
  'use strict';
  var Kit = root.Kit;
  /* [height, header]. Each header proves itself: its double SHA-256 is below the target packed in its own bits field. */
  var HEADERS = [
    [
      0,
      "0100000000000000000000000000000000000000000000000000000000000000000000003ba3edfd7a7b12b27ac72c3e67768f617fc81bc3888a51323a9fb8aa4b1e5e4a29ab5f49ffff001d1dac2b7c"
    ],
    [
      170,
      "0100000055bd840a78798ad0da853f68974f3d183e2bd1db6a842c1feecf222a00000000ff104ccb05421ab93e63f8c3ce5c2c2e9dbb37de2764b3a3175c8166562cac7d51b96a49ffff001d283e9e70"
    ],
    [
      210000,
      "02000000e13d9a7a0ba7419fac0160842e7fee5d4b29605364649181f300000000000000d803e620d6bdd20ad8c239b43a5b4c7226948e0787096d35c7b12308a640dd3cb62cb650eae0041a64a694f2"
    ],
    [
      277316,
      "0200000069054f28012b4474caa9e821102655cc74037c415ad2bba702000000000000002ecfc74ceb512c5055bcff7e57735f7323c32f8bbb48f5e96307e5268c001cc93a09be520ca3031988261c37"
    ],
    [
      481824,
      "02000020801b81629334be8e7af5ebfb9df09c18e1f833b5f0efcb00000000000000000040d1ca077fefe7fb797711baa0c063eca9b8ed9469ae0128982b44ad0c25386491329e59e93c011822ff5422"
    ],
    [
      630000,
      "000000201e2b96b120a73bacb0667279bd231bdb95b08be16b650d0000000000000000000d301d8500481adde3184765a80b01923ce4c7995ff7c4810e04b973f9f591b13fa6b95e397a11173a863889"
    ],
    [
      709632,
      "04002020ccbcc674693ef8751c939c0e6d4728dde62e24fc12370100000000000000000077ec1447375fc68029ab7a85fd6989c5d31351b619e8f709de682008103bda6a6f9b9061ea690c1702730f54"
    ],
    [
      840000,
      "00e05f2aab948491071265ad552351d0ad625745668da54b0172010000000000000000004f89a5d73bd4d4887f25981fe81892ccafda10c27f52d6f3dd28183a7c411b03b7072366194203177d9863ea"
    ]
  ];
  var LEGEND = [['fixed', 'version · nonce'], ['inputs', 'previous block hash'], ['outputs', 'Merkle root'], ['marker', 'time'], ['witness', 'bits (the target, packed)']];
  function structure() {
    return { legend: LEGEND, regions: [
      { kind: 'fixed', label: 'version', start: 0, end: 4 }, { kind: 'inputs', label: 'previous block hash', start: 4, end: 36 },
      { kind: 'outputs', label: 'Merkle root', start: 36, end: 68 }, { kind: 'marker', label: 'time', start: 68, end: 72 },
      { kind: 'witness', label: 'bits', start: 72, end: 76 }, { kind: 'fixed', label: 'nonce', start: 76, end: 80 }] };
  }
  function header(v) { return Kit.hex.toBytes(HEADERS[v.i][1]); }
  function display(h) { return Kit.hex.from(h.slice().reverse()); }
  /* The 32-byte target from the 4 "bits" bytes: reversed, the first byte is a length E and the next three a
     coefficient; the target is the coefficient followed by E - 3 zero bytes. `asStored` reads the bytes without
     reversing them, which is the usual mistake. */
  function target(h, asStored) {
    var b = h.slice(72, 76); if (!asStored) b = b.slice().reverse();
    var e = b[0], out = new Uint8Array(32);
    if (e < 3 || e > 32) return null;
    out.set(b.slice(1, 4), 32 - e);
    return Kit.hex.from(out);
  }
  Kit.defineLab({
    id: 'ctf-pow', rev: 1,
    title: 'Check the work', tags: ['Consensus', 'Proof of work'], minutes: 10, crumbs: 'Consensus · Challenge',
    lede: 'Miners spend enormous effort finding a block. Everyone else needs almost none to check that they did. You are about to check a real block\'s proof of work the way every node on the network does.',
    real: 'This is the header of a real block from Bitcoin\'s main network, byte for byte. The hash you compute is the block\'s real ID and will find it in any block explorer. The only shortcut: we handed you the header instead of pulling it from a node.',
    ref: 'bitcoin-block', refPage: '../../ref/bitcoin.html',
    bench: { ops: ['sha256', 'reverse'], slice: true, number: true },
    headers: HEADERS,
    pick: function (room, who) { return { i: Kit.hash32(room + '|' + String(who).toLowerCase() + '|ctf-pow') % HEADERS.length }; },
    variantLabel: function (v) { return 'variant H' + (v.i + 1); },
    flags: [{
      id: 'f1', points: 100, title: 'the block hash',
      brief: '<p>These 80 bytes are a block header: everything a miner hashes. A miner changed the last four bytes, the <b>nonce</b>, over and over until the header hashed to a small enough number. (Four bytes allow only about 4 billion tries, so today\'s miners also vary other fields, such as the time and, through their own payout transaction, the Merkle root.) <b>Compute this block\'s hash, as a block explorer shows it.</b></p>',
      artifacts: function (v) { return [{ label: 'your block header', hex: HEADERS[v.i][1], structure: structure }]; },
      placeholder: '64 hex characters, or flag{…}', format: { kind: 'hex', len: 64, name: 'A block hash' },
      answer: function (v) { return Kit.sha256d(header(v)).then(display); },
      near: function (entry, v) {
        var h = header(v);
        return Promise.all([Kit.sha256d(h), Kit.sha256(h)]).then(function (x) {
          if (entry === Kit.hex.from(x[0])) return 'Right hash, wrong byte order. A block hash is a number: where would its leading zeros be?';
          if (entry === Kit.hex.from(x[1]) || entry === display(x[1])) return 'That is a single SHA-256. Bitcoin hashes a header twice.';
          return null;
        });
      },
      wrong: 'Not this block\u2019s hash. Reload your bytes: all 80 go in, nothing added or removed.',
      hints: ['The whole header goes in, all 80 bytes, exactly as given.', 'Bitcoin hashes it twice with SHA-256. Explorers then print the result as a number, most significant byte first.'],
      debrief: '<h2>Debrief</h2><h3>Look at the zeros</h3><p>Your hash starts with a long run of zeros. A hash function gives no way to aim for that: the miner had to try header after header until one happened to land there. Those zeros are the proof of work. You checked it with two hashes.</p>'
        + '<h3>Why it locks history</h3><p>The header contains the previous block\'s hash and the Merkle root of this block\'s transactions. Change any transaction, here or in any earlier block, and this header changes, its hash changes, and the zeros are gone. Rewriting history means redoing the work for that block and every block after it, faster than the rest of the network is adding new ones.</p>',
      general: 'Making a block takes the whole network about ten minutes of guessing. Checking that the work was done takes anybody two hashes, so nobody can fake the effort.',
      after: function (v, hash) { return 'This is block ' + HEADERS[v.i][0].toLocaleString('en-US') + '. With internet access: <a href="https://mempool.space/block/' + hash + '" target="_blank" rel="noopener">look it up on a public explorer ↗</a>.'; }
    }, {
      id: 'f2', points: 200, title: 'the target', deeper: true,
      brief: '<p>"Small enough" has an exact meaning. The header carries its own pass mark: the 4 bytes called <b>bits</b> (bytes 72 to 75) are a packed form of the <b>target</b>, a 32-byte number. A block is valid only if its hash, read as a number, is not above the target.</p><p><b>Unpack the target for your header and enter all 32 bytes of it.</b> The reference sheet shows how bits is packed. Then compare it with the hash you computed.</p>',
      placeholder: '64 hex characters, or flag{…}', format: { kind: 'hex', len: 64, name: 'A target' },
      answer: function (v) { return target(header(v)); },
      near: function (entry, v) {
        var h = header(v), t = target(h), wrong = target(h, true);
        if (wrong && entry === wrong) return 'You read the four bits bytes in the order they are stored. Like every number in a header, they are stored least-significant byte first: reverse them before unpacking.';
        if (entry.replace(/^0+/, '') === t.replace(/^0+/, '')) return 'Right digits, wrong position: the target is 32 bytes, so the number of zero bytes after the coefficient matters. Count them again.';
        if (entry.replace(/0+$/, '').replace(/^0+/, '') === t.replace(/0+$/, '').replace(/^0+/, '')) return 'Right coefficient. Now place it: it is followed by (first byte minus 3) zero bytes, and padded with zeros on the left to 32 bytes.';
        return null;
      },
      wrong: 'Not the target for this header. Keep bytes 72 to 75, reverse them, and unpack: one length byte, then a three-byte coefficient.',
      hints: ['Keep 4 bytes starting at byte 72, then reverse them. The first byte is now a length, E. The other three are the coefficient.', 'The target is the coefficient followed by E − 3 zero bytes. Write it out, then add zeros on the left until it is 32 bytes (64 hex characters).'],
      debrief: '<h3>Hash against target</h3><p>Proof of work is one of the checks a node makes: it also checks every transaction in the block. For this check, put your block hash above the target. The hash is the smaller number: that is the whole validity rule for proof of work. A lower target means fewer acceptable hashes and more guesses needed on average.</p>'
        + '<h3>Who sets the target?</h3><p>Nobody. Every 2,016 blocks each node recomputes it from the timestamps in the headers, aiming for one block every ten minutes: if the last 2,016 came too fast the target drops, too slow and it rises. "Difficulty" is just the first block\'s target divided by the current one.</p>',
      general: 'The difficulty isn\'t a setting someone controls. Every node works it out from the chain itself and rejects any block that doesn\'t meet it.'
    }]
  });
})(typeof window !== 'undefined' ? window : globalThis);

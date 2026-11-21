/* Bitcoin helpers for course labs: real transaction serialization (BIP 141 segwit layout included).
   Needs kit.js. Exposes Kit.btc. */
(function (root) {
  'use strict';
  var Kit = root.Kit;
  if (!Kit) throw new Error('btc.js needs kit.js loaded first');

  function varint(b, i) {
    if (i >= b.length) throw new Error('Ran out of bytes at offset ' + i);
    var x = b[i];
    if (x < 0xfd) return [x, i + 1];
    var n = x === 0xfd ? 2 : x === 0xfe ? 4 : 8, v = 0;
    if (i + n >= b.length) throw new Error('Ran out of bytes reading a length at offset ' + i);
    for (var k = n; k >= 1; k--) v = v * 256 + b[i + k];
    return [v, i + 1 + n];
  }

  /* Parse a raw transaction. Returns byte offsets of each region (start inclusive, end exclusive),
     plus inputs and outputs. Throws if the bytes are not a complete, well-formed transaction. */
  function parse(bytes) {
    var b = bytes, i = 4, r, n, m, k, l;
    if (b.length < 10) throw new Error('Too short to be a transaction');
    var segwit = b[4] === 0x00 && b[5] === 0x01;
    var out = { segwit: segwit, version: b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24), regions: [], inputs: [], outputs: [] };
    out.regions.push({ kind: 'fixed', label: 'version', start: 0, end: 4 });
    if (segwit) { out.regions.push({ kind: 'marker', label: 'marker + flag', start: 4, end: 6 }); i = 6; }
    var inStart = i;
    r = varint(b, i); n = r[0]; i = r[1];
    if (n === 0) throw new Error('Zero inputs: not a valid transaction');
    for (var a = 0; a < n; a++) {
      var prev = Kit.hex.from(b.slice(i, i + 32).reverse());
      var vout = b[i + 32] | (b[i + 33] << 8) | (b[i + 34] << 16) | (b[i + 35] << 24);
      i += 36; r = varint(b, i); l = r[0]; i = r[1] + l + 4;
      out.inputs.push({ prevTxid: prev, vout: vout >>> 0 });
    }
    out.regions.push({ kind: 'inputs', label: 'inputs (' + n + ')', start: inStart, end: i });
    var outStart = i;
    r = varint(b, i); m = r[0]; i = r[1];
    for (var o = 0; o < m; o++) {
      var sats = 0; for (var s = 7; s >= 0; s--) sats = sats * 256 + b[i + s];
      i += 8; r = varint(b, i); l = r[0]; i = r[1] + l;
      out.outputs.push({ sats: sats });
    }
    out.regions.push({ kind: 'outputs', label: 'outputs (' + m + ')', start: outStart, end: i });
    if (segwit) {
      var wStart = i;
      for (var w = 0; w < n; w++) {
        r = varint(b, i); k = r[0]; i = r[1];
        for (var e = 0; e < k; e++) { r = varint(b, i); l = r[0]; i = r[1] + l; }
      }
      out.regions.push({ kind: 'witness', label: 'witness', start: wStart, end: i });
    }
    if (i + 4 !== b.length) throw new Error('Expected 4 bytes of locktime after offset ' + i + ' but the data is ' + b.length + ' bytes long');
    out.regions.push({ kind: 'fixed', label: 'locktime', start: i, end: i + 4 });
    return out;
  }

  /* The bytes the txid commits to: the transaction without marker, flag and witness. */
  function stripWitness(bytes) {
    var p = parse(bytes);
    if (!p.segwit) return bytes;
    var keep = p.regions.filter(function (g) { return g.kind !== 'marker' && g.kind !== 'witness'; });
    var total = keep.reduce(function (t, g) { return t + g.end - g.start; }, 0);
    var res = new Uint8Array(total), at = 0;
    keep.forEach(function (g) { res.set(bytes.slice(g.start, g.end), at); at += g.end - g.start; });
    return res;
  }

  /* Display order: explorers show the hash as a little-endian number, so the bytes are reversed. */
  function display(hashBytes) { return Kit.hex.from(hashBytes.slice().reverse()); }
  function txid(bytes) { return Kit.sha256d(stripWitness(bytes)).then(display); }
  function wtxid(bytes) { return Kit.sha256d(bytes).then(display); }

  Kit.btc = { parse: parse, stripWitness: stripWitness, txid: txid, wtxid: wtxid, display: display };
})(typeof window !== 'undefined' ? window : globalThis);

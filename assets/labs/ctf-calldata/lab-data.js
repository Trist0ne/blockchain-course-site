/* "What did the wallet sign?": read an ERC-20 call out of a transaction's data field.
   Each student's call is built from the room code and their account; the answers are computed, never stored.
   Needs kit.js, kit/wallet.js and kit/lab.js. */
(function (root) {
  'use strict';
  var Kit = root.Kit, enc = new TextEncoder();
  var USDT = '0xdAC17F958D2ee523a2206206994597C13D831ec7';   // Tether USD on Ethereum mainnet; it uses 6 decimals
  var CANDIDATES = ['transfer(address,uint256)', 'approve(address,uint256)', 'transferFrom(address,address,uint256)', 'increaseAllowance(address,uint256)', 'mint(address,uint256)', 'burn(uint256)'];
  function selector(sig) { return Kit.hex.from(root.KitLib.keccak_256(enc.encode(sig)).slice(0, 4)); }
  function word(hex) { return ('0'.repeat(64) + hex).slice(-64); }
  function build(room, who) {
    var seed = room + '|' + String(who).toLowerCase() + '|ctf-calldata', h = Kit.hash32(seed);
    var fn = CANDIDATES[h % 2];                                                  // a payment, or permission to take
    var to = Kit.hex.from(root.KitLib.keccak_256(enc.encode(seed + '|to')).slice(12));
    var whole = 250 + ((h >>> 4) % 9500);
    var units = BigInt(whole) * 1000000n;
    return { fn: fn, to: Kit.wallet.toChecksum(to), whole: whole, units: units.toString(), data: selector(fn) + word(to) + word(units.toString(16)) };
  }
  var LEGEND = [['fixed', 'selector (4 bytes)'], ['inputs', 'first argument (32 bytes)'], ['outputs', 'second argument (32 bytes)']];
  function structure() { return { legend: LEGEND, regions: [{ kind: 'fixed', label: 'selector', start: 0, end: 4 }, { kind: 'inputs', label: 'first argument', start: 4, end: 36 }, { kind: 'outputs', label: 'second argument', start: 36, end: 68 }] }; }
  Kit.defineLab({
    id: 'ctf-calldata', rev: 1,
    title: 'What did the wallet sign?', tags: ['Ethereum', 'Transactions'], minutes: 12, crumbs: 'Ethereum Framework · Challenge',
    lede: 'A wallet shows a prompt: send 0 ETH to a contract, plus a line of hex. People press Confirm on prompts like this every day. Everything that matters is in the hex.',
    real: 'The contract address is the real Tether USD (USDT) token on Ethereum, which uses 6 decimals. The data is encoded exactly as Ethereum encodes a contract call, and the hashing is real Keccak-256. The shortcut: this call was made up for you and was never sent.',
    ref: 'eth-abi', refPage: '../../ref/ethereum.html',
    bench: { ops: ['keccak256'], text: true, textPlaceholder: 'e.g. burn(uint256)', slice: true, number: true },
    candidates: CANDIDATES, selector: selector, build: build,
    pick: function (room, who) { return build(room, who); },
    flags: [{
      id: 'f1', points: 100, title: 'the function',
      brief: '<p>Here is what the wallet is asking its owner to sign. The first four bytes of the data say which function of the contract is being called: they are the first four bytes of the Keccak-256 hash of the function\'s signature, written as text.</p>'
        + '<p>It is one of these:</p><ul class="mono small">' + CANDIDATES.map(function (c) { return '<li>' + c + '</li>'; }).join('') + '</ul><p><b>Which function is being called?</b> Enter its signature exactly as listed.</p>',
      artifacts: function (v) { return [{ label: 'Wallet prompt', text: 'To:     ' + USDT + '   (Tether USD, 6 decimals)\nValue:  0 ETH\nData:   0x' + v.data }, { label: 'the data field', hex: v.data, structure: structure }]; },
      placeholder: 'name(type,type)', format: { kind: 'text' },
      norm: function (s) { return String(s == null ? '' : s).trim().replace(/^flag\{(.*)\}$/i, '$1').replace(/\s+/g, '').toLowerCase(); },
      answer: function (v) { return v.fn; },
      near: function (entry, v) {
        var hit = CANDIDATES.filter(function (c) { return c.toLowerCase() === entry; })[0];
        if (hit) return 'Keccak-256 of "' + hit + '" starts with ' + selector(hit) + ', but the data starts with ' + v.data.slice(0, 8) + '.';
        if (/^[0-9a-f]{8}$/.test(entry.replace(/^0x/, ''))) return 'Those are the four selector bytes. Which function\'s signature hashes to them?';
        if (/\(/.test(entry)) return 'Enter one of the six signatures exactly as listed: the name, then the types in brackets, with no parameter names.';
        return 'Enter the function\'s signature as listed, such as burn(uint256).';
      },
      hints: ['Type a candidate into "Text → bytes" in the workbench, then press Keccak-256.', 'Compare the first four bytes of the result (8 hex characters) with the first four bytes of the data.'],
      debrief: '<h2>Debrief</h2><h3>Four bytes decide everything</h3><p>The contract never sees a function name. It sees four bytes and jumps to the code they select. Explorers and wallets show a name only when they recognise those four bytes from a list. When they don\'t, you get raw hex, and reading it is on you.</p>'
        + '<h3>Payment or permission?</h3><p><code>transfer</code> moves tokens now. <code>approve</code> moves nothing: it lets another address take up to that amount later, whenever it likes. Many wallet-draining scams end with the victim signing an <code>approve</code>. Both look the same in the prompt: 0 ETH and a line of hex.</p>',
      general: 'The prompt said "0 ETH", which was true and useless. The first four bytes of the data tell you whether it is a payment or a standing permission to take the money.'
    }, {
      id: 'f2', points: 100, title: 'the address',
      brief: '<p>After the selector, each argument takes exactly 32 bytes. The first argument here is an address: 20 bytes, padded with zeros on the left to fill the 32.</p><p><b>Which address receives the tokens, or the permission to take them?</b></p>',
      placeholder: '0x… 40 hex characters', format: { kind: 'address' },
      answer: function (v) { return v.to; },
      near: function (entry, v) { return entry === USDT.toLowerCase() ? 'That is the token contract the call is sent to. The address you want is inside the data.' : 'Not the address in the first argument. Keep 20 bytes starting at byte 16 of the data: the 4 selector bytes and 12 zero bytes come first.'; },
      hints: ['The first argument is bytes 4 to 35 of the data. Its first 12 bytes are padding.', 'In the workbench: keep 20 bytes starting at byte 16, copy them, and put 0x in front.'],
      debrief: '<h3>The "To" line names the wrong party</h3><p>The transaction is addressed to the token contract. The address that matters, who gets paid or who gets permission, never appears in the transaction\'s own to-field. A tool that only looks at sender and recipient of the transaction sees a user talking to Tether, and nothing else.</p>'
    }, {
      id: 'f3', points: 200, title: 'the amount', deeper: true,
      brief: '<p>The second argument is the amount, as one 32-byte number, most significant byte first. Token contracts only store whole numbers of the token\'s smallest unit. This token has <b>6 decimals</b>, so 1 token is stored as 1,000,000.</p><p><b>How many whole USDT does this call move or approve?</b></p>',
      placeholder: 'a whole number of tokens', format: { kind: 'int', name: 'The amount' },
      answer: function (v) { return String(v.whole); },
      near: function (entry, v) {
        if (entry === v.units) return 'That is the raw number in the data, counted in the token\'s smallest unit. This token has 6 decimals: what is that in whole tokens?';
        return 'Not the amount. Keep the last 32 bytes of the data, read them as one number, then apply the 6 decimals.';
      },
      hints: ['Keep 32 bytes starting at byte 36, then press "Read as a number". Use the first reading: Ethereum puts the most significant byte first.', 'Divide by 1,000,000.'],
      debrief: '<h3>Decimals are a display convention</h3><p>Nothing on the chain says "6 decimals" in this transaction. The contract stores integers; wallets and explorers look up the token\'s decimals and move the point for you. USDT and USDC use 6. Most tokens use 18. Read a raw amount with the wrong decimals and you are wrong by a factor of a trillion.</p>'
        + '<p>The same pattern, a selector and 32-byte arguments, is how USDT moves on Tron and on every other EVM-style chain. Learn to read it once.</p>',
      general: 'A token amount on chain is a bare integer. Without the token\'s decimals, the same number could be ten dollars or ten trillion.'
    }]
  });
})(typeof window !== 'undefined' ? window : globalThis);

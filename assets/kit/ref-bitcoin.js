/* Reference sheet: Bitcoin transactions. Shown by Bitcoin labs via Kit.refPanel('bitcoin-tx') and printable at ref/bitcoin.html.
   Facts only: everything here is checkable against Bitcoin Core and BIP 141. Needs kit.js. */
(function (root) {
  'use strict';
  root.Kit.REF['bitcoin-tx'] = {
    title: 'Bitcoin transactions',
    html: [
      '<h3>Reading hex</h3>',
      '<ul><li>Two hex digits are one byte: <code>ff</code> = 255. A 32-byte hash is 64 hex characters.</li>',
      '<li>1 BTC = 100,000,000 satoshis (sats).</li></ul>',

      '<h3>Byte order</h3>',
      '<ul><li>Bitcoin stores numbers <b>little-endian</b>, least-significant byte first: <code>01000000</code> is 1, and <code>e803000000000000</code> is 1,000 sats.</li>',
      '<li>Explorers, wallets and Bitcoin Core\'s RPC print transaction IDs and block hashes <b>byte-reversed</b> from the order the hash function outputs them.</li></ul>',

      '<h3>Hashing</h3>',
      '<ul><li><b>SHA-256</b> turns any input into 32 bytes. Change one input bit and the output changes completely.</li>',
      '<li><b>HASH256</b> is SHA-256 applied twice: <code>SHA-256(SHA-256(x))</code>. Bitcoin uses it for transaction IDs, block hashes and Merkle trees.</li></ul>',

      '<h3>Transaction IDs</h3>',
      '<ul><li><b>txid</b>: HASH256 of the transaction <i>without</i> the segwit marker, flag and witness, shown byte-reversed. This is the ID explorers, wallets and other transactions use.</li>',
      '<li><b>wtxid</b>: HASH256 of the complete transaction, shown byte-reversed. For a transaction with no witness, txid and wtxid are the same.</li></ul>',

      '<h3>Raw transaction layout</h3>',
      '<table class="data"><thead><tr><th>Field</th><th class="num">Bytes</th><th>Notes</th></tr></thead><tbody>',
      '<tr><td>version</td><td class="num">4</td><td>little-endian, usually 1 or 2</td></tr>',
      '<tr><td>marker, flag</td><td class="num">1 + 1</td><td>segwit only: always <code>00 01</code></td></tr>',
      '<tr><td>input count</td><td class="num">varint</td><td></td></tr>',
      '<tr><td class="indent">previous txid</td><td class="num">32</td><td>the coin being spent: which transaction (internal byte order, not reversed)</td></tr>',
      '<tr><td class="indent">previous output index</td><td class="num">4</td><td>which output of that transaction, little-endian</td></tr>',
      '<tr><td class="indent">scriptSig length</td><td class="num">varint</td><td><code>00</code> for native segwit inputs</td></tr>',
      '<tr><td class="indent">scriptSig</td><td class="num">length</td><td>unlocking data for legacy inputs (signature, public key)</td></tr>',
      '<tr><td class="indent">sequence</td><td class="num">4</td><td></td></tr>',
      '<tr><td>output count</td><td class="num">varint</td><td></td></tr>',
      '<tr><td class="indent">value</td><td class="num">8</td><td>amount in sats, little-endian</td></tr>',
      '<tr><td class="indent">scriptPubKey length</td><td class="num">varint</td><td></td></tr>',
      '<tr><td class="indent">scriptPubKey</td><td class="num">length</td><td>the lock: who can spend this output</td></tr>',
      '<tr><td>witness</td><td class="num">varies</td><td>segwit only. For each input: an item count (varint), then each item as length (varint) + bytes</td></tr>',
      '<tr><td>locktime</td><td class="num">4</td><td>always the last 4 bytes</td></tr>',
      '</tbody></table>',
      '<p class="small muted">Indented rows repeat once per input or output.</p>',

      '<h3>Varint (CompactSize)</h3>',
      '<ul><li>First byte below <code>fd</code>: that byte is the number.</li>',
      '<li><code>fd</code>, <code>fe</code>, <code>ff</code>: the number is in the next 2, 4 or 8 bytes, little-endian.</li></ul>'
    ].join('')
  };
  root.Kit.REF['bitcoin-block'] = {
    title: 'Bitcoin blocks: headers, targets and Merkle roots',
    html: [
      '<h3>Block header layout</h3>',
      '<p>Always exactly 80 bytes. The block hash is HASH256 (SHA-256 twice) of these 80 bytes, shown byte-reversed.</p>',
      '<table class="data"><thead><tr><th>Field</th><th class="num">Bytes</th><th class="num">Position</th><th>Notes</th></tr></thead><tbody>',
      '<tr><td>version</td><td class="num">4</td><td class="num">0–3</td><td>little-endian</td></tr>',
      '<tr><td>previous block hash</td><td class="num">32</td><td class="num">4–35</td><td>internal byte order (an explorer shows it reversed)</td></tr>',
      '<tr><td>Merkle root</td><td class="num">32</td><td class="num">36–67</td><td>internal byte order; commits to every transaction in the block</td></tr>',
      '<tr><td>time</td><td class="num">4</td><td class="num">68–71</td><td>seconds since 1 Jan 1970 UTC, little-endian; set by the miner</td></tr>',
      '<tr><td>bits</td><td class="num">4</td><td class="num">72–75</td><td>the target, packed (below), little-endian</td></tr>',
      '<tr><td>nonce</td><td class="num">4</td><td class="num">76–79</td><td>the number miners change to get a different hash</td></tr>',
      '</tbody></table>',

      '<h3>Bits and the target</h3>',
      '<ul><li>A block is valid only if its hash, read as a 256-bit number, is <b>not above the target</b>.</li>',
      '<li>Reverse the four bits bytes. The first byte is a length <b>E</b>; the next three are the <b>coefficient</b>.</li>',
      '<li>The target is the coefficient followed by <b>E − 3</b> zero bytes, padded with zeros on the left to 32 bytes.</li>',
      '<li>Example: stored <code>ffff001d</code> → reversed <code>1d00ffff</code> → E = <code>1d</code> (29), coefficient <code>00ffff</code> → <code>00ffff</code> then 26 zero bytes → <code>00000000ffff0000…0000</code> (32 bytes).</li>',
      '<li>A lower target is harder to meet. The target is recalculated every 2,016 blocks.</li></ul>',

      '<h3>Merkle root</h3>',
      '<ul><li>Start with the transaction IDs in block order, in internal byte order (not the reversed form explorers show).</li>',
      '<li>Join each pair of neighbours, left then right, into 64 bytes and take HASH256. The results form the next level up.</li>',
      '<li>If a level has an odd number of hashes, the last one is paired with a copy of itself.</li>',
      '<li>Repeat until one hash is left: the Merkle root. A block with one transaction uses that transaction\'s ID as its root.</li></ul>'
    ].join('')
  };
})(typeof window !== 'undefined' ? window : globalThis);

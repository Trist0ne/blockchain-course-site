/* Reference sheets: Ethereum. Shown by Ethereum labs via Kit.refPanel() and printable at ref/ethereum.html.
   Facts only: everything here is checkable against the Solidity ABI specification, EIP-191 and EIP-55. Needs kit.js. */
(function (root) {
  'use strict';
  root.Kit.REF['eth-abi'] = {
    title: 'Ethereum: reading a contract call',
    html: [
      '<h3>A transaction that calls a contract</h3>',
      '<ul><li><b>to</b>: the contract being called. <b>value</b>: ETH sent with the call, often 0. <b>data</b>: which function, and its arguments.</li>',
      '<li>A token is a contract. Moving a token is a call <i>to the token contract</i>; the recipient is inside the data.</li></ul>',

      '<h3>The data field</h3>',
      '<table class="data"><thead><tr><th>Part</th><th class="num">Bytes</th><th>Notes</th></tr></thead><tbody>',
      '<tr><td>selector</td><td class="num">4</td><td>first 4 bytes of Keccak-256 of the function signature as text, e.g. <code>burn(uint256)</code>: name, then types in brackets, no spaces, no parameter names</td></tr>',
      '<tr><td>each argument</td><td class="num">32</td><td>one 32-byte word per simple argument, in order</td></tr>',
      '</tbody></table>',
      '<ul><li><b>address</b> argument: 20 bytes, padded with 12 zero bytes on the left.</li>',
      '<li><b>uint256</b> argument: one number, most significant byte first (big-endian). Ethereum does not reverse bytes the way Bitcoin does.</li></ul>',

      '<h3>Token amounts</h3>',
      '<ul><li>A token contract stores whole numbers of its smallest unit. <b>decimals</b> says where the point goes when the amount is shown.</li>',
      '<li>6 decimals: 1 token = 1,000,000 units (USDT, USDC). 18 decimals: 1 token = 1,000,000,000,000,000,000 units (most tokens; ETH itself is counted in wei the same way).</li></ul>',

      '<h3>ERC-20 functions you will meet</h3>',
      '<ul><li><code>transfer(address,uint256)</code>: the caller sends tokens to the address.</li>',
      '<li><code>approve(address,uint256)</code>: the caller lets the address take up to that amount later.</li>',
      '<li><code>transferFrom(address,address,uint256)</code>: an approved address moves tokens from the first address to the second.</li></ul>'
    ].join('')
  };
  root.Kit.REF['eth-sign'] = {
    title: 'Ethereum: signatures and addresses',
    html: [
      '<h3>Keys and addresses</h3>',
      '<ul><li>A private key is a 32-byte number. Its public key is a point on the secp256k1 curve: the same curve Bitcoin uses.</li>',
      '<li>An address is the last 20 bytes of Keccak-256 of the public key, written as <code>0x</code> and 40 hex characters.</li>',
      '<li>The capital letters in an address are a checksum (EIP-55). The address is the same in any case.</li></ul>',

      '<h3>Signatures</h3>',
      '<ul><li>A signature is 65 bytes: <b>r</b> (32), <b>s</b> (32) and <b>v</b> (1).</li>',
      '<li>From a signature and the exact message, anyone can <b>recover</b> the address that signed. No key is needed to check.</li>',
      '<li>Change one character of the message and the same signature recovers a different, unrelated address. It does not report an error.</li>',
      '<li>A transaction has no "from" field. The sender is recovered from the transaction\'s signature.</li></ul>',

      '<h3>Signing a message (personal_sign, EIP-191)</h3>',
      '<ul><li>The wallet does not sign your text directly. It signs Keccak-256 of <code>"\\x19Ethereum Signed Message:\\n" + length + text</code>.</li>',
      '<li>That prefix makes it impossible for a signed message to also be a valid transaction.</li></ul>'
    ].join('')
  };
})(typeof window !== 'undefined' ? window : globalThis);

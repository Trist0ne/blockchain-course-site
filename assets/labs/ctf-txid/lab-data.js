/* "Name that transaction": real Bitcoin mainnet transactions, raw bytes only.
   The answers are not stored here: they are computed from these bytes, which is the challenge.
   Needs kit.js, kit/lab.js and kit/btc.js. */
(function (root) {
  'use strict';
  var Kit = root.Kit;
  var DATA = {
  legacy: [
    "0100000001c997a5e56e104102fa209c6a852dd90660a20b2d9c352423edce25857fcd3704000000004847304402204e45e16932b8af514961a1d3a1a25fdf3f4f7732e9d624c6c61548ab5fb8cd410220181522ec8eca07de4860a4acdd12909d831cc56cbbac4622082221a8768d1d0901ffffffff0200ca9a3b00000000434104ae1a62fe09c5f51b13905f07f06b99a2f7159b2225f374cd378d71302fa28414e7aab37397f554a7df5f142c21c1b7303b8a0626f1baded5c72a704f7e6cd84cac00286bee0000000043410411db93e1dcdb8a016b49840f8c53bc1eb68a382e97b1482ecad7b148a6909a5cb2e0eaddfb84ccf9744464f82e160bfa9b8b64f9d4c03f999b8643f656b412a3ac00000000",
    "0100000001032e38e9c0a84c6046d687d10556dcacc41d275ec55fc00779ac88fdf357a187000000008c493046022100c352d3dd993a981beba4a63ad15c209275ca9470abfcd57da93b58e4eb5dce82022100840792bc1f456062819f15d33ee7055cf7b5ee1af1ebcc6028d9cdb1c3af7748014104f46db5e9d61a9dc27b8d64ad23e7383a4e6ca164593c2527c038c0857eb67ee8e825dca65046b82c9331586c82e0fd1f633f25f87c161bc6f8a630121df2b3d3ffffffff0200e32321000000001976a914c398efa9c392ba6013c5e04ee729755ef7f58b3288ac000fe208010000001976a914948c765a6914d43f2a7ac177da2c2f6b52de3d7c88ac00000000",
    "0100000001c33ebff2a709f13d9f9a7569ab16a32786af7d7e2de09265e41c61d078294ecf010000008a4730440220032d30df5ee6f57fa46cddb5eb8d0d9fe8de6b342d27942ae90a3231e0ba333e02203deee8060fdc70230a7f5b4ad7d7bc3e628cbe219a886b84269eaeb81e26b4fe014104ae31c31bf91278d99b8377a35bbce5b27d9fff15456839e919453fc7b3f721f0ba403ff96c9deeb680e5fd341c0fc3a7b90da4631ee39560639db462e9cb850fffffffff0240420f00000000001976a914b0dcbf97eabf4404e31d952477ce822dadbe7e1088acc060d211000000001976a9146b1281eec25ab4e1e0793ff4e08ab1abb3409cd988ac00000000",
    "01000000011e5b107b2666baf1f672f978af5e9702c3884d39e241ce958144f81b94213270000000008a4730440220598fd6fff4496df0298b8ef34e23dcf874e4191b59c63c143c4136bceae5c9f902204ac900c85f519bd7d34663ade535a7dee4d18c295f9838b32620612b208a6eb6014104396bcfd5027b97b54bf4a71ad548b29360d3932939ba495456d696d3d4e424013fc6164ebe1d6cdaef2fc33957d97dca769f67e5effae5753d3ba04776fd045affffffff0100ca9a3b000000001976a914d4d1cf6b3ee3d1717085f480261b6766a5eff6ee88ac00000000",
    "01000000018ca6e6ae0d25797ac5414261dd18bdc23a9d98fe5179d21ee87650f00ca3a585010000008c493046022100ef38a2788a2c32dbd85bb4d06338f4bf057e06191e573333c0da4a822cd16f6b022100b0d30c1525bb345fb163308f0575265f4b8b7e770e732ecca66009f9fd474515014104a31e3d62fcd881683fcacc0bc4c5242cd6ae12e9143a5902464dbc3a6832b1f90dee86f0a496b4df9201a037a5b69b0fd3f499dada293255ea32abe467ff0a19ffffffff0200c90c6b000000001976a9147491dbb7c46adca2e6cf7caf0a39faf111df222488ac00093d00000000001976a914d9d8d1e0a7dc756437228203dbef3c5158ca33cc88ac00000000"
],
  segwit: [
    "01000000000101d553fbabaf1b26977b6e5d403af9f4b567b3e28484321a6fb02e2824984e3e5000000000171600142b2296c588ec413cebd19c3cbc04ea830ead6e78ffffffff01be1611020000000017a91487e4e5a7ff7bf78b8a8972a49381c8a673917f3e870247304402205f39ccbab38b644acea0776d18cb63ce3e37428cbac06dc23b59c61607aef69102206b8610827e9cb853ea0ba38983662034bd3575cc1ab118fb66d6a98066fa0bed01210304c01563d46e38264283b99bb352b46e69bf132431f102d4bd9a9d8dab075e7f00000000",
    "02000000000101ce70f3f2f3270cf82ce803b5b00b33d0bcee7ca7b13a24e58d24f034210d581d010000001716001426c19325d076161537daca01fef1789f37ab85f0ffffffff02d99727150000000017a914ce16790e4f7bf96417f50a6bb7fa6ab27a583e6787cb8b0e00000000001976a914888483e1ed5c6298a2dfb3e98f2d8963575487c888ac02483045022100ec6ab291b6aab86366070eda0063fe3175e65bf9615820b5b8201a0977c36d1b0220679ab2356853222e7de3e4fbb1556a21c4cddea460a9bd9778720a43cd64788801210282fc04ff954d0f43f23fdb5eaeab5f7f2d8bf4b936dfca9234a68bf49e4a421f00000000",
    "0200000000010265367f81ed1fd2fb5adaa9f125796caad07299ecb56043ce73548c2246a21f7c010000006a47304402203385481fbbaed04bf996f7b21c63f65fcd584bcd29d6e242fd32b66411a7922a02205232d3116a555ff78da9acb7d5e6b1a1f872c4b329e6da45c22dcadf74eeed51012103a8df1b58fd149c466d1032d54272d83e14201030febfa9093d8a2a02bb1fc000feffffffe7c6d891b784b0ac2c86eabb3acbcb253e51e1b9f9fa351e4e9e9a70163a75fd000000001716001461598955601b7af0780b9b57b5d7a0009f4b07cbfeffffff0242f51000000000001976a914fb2737b020d6c0555513092f7f004976c4c18c5388acef0b1300000000001976a91425de01dcaf6d82a584080136d47a9530972d0fb888ac000247304402207d70891d03579e08c72cabbd81c0b4f03ad013869b6f3275ec690aa81a9834be02203d075a57bef6d2a499c8e66834f385d50edf4a84fb84771ebb58f8b2c27d7cde012102d0bffb8329a9e4c2cd398b42676b466a1f2f39cf76595d666f033491a7961ecbbf270900",
    "020000000001010812c23f4d2e949d0fff3e72cbb1746998a91b610dcef86176f6cd4b975884e70100000017160014e5804b69af35c8d5c0fe02eaae6c244508b95960fdffffff0250c30000000000001976a914df25af421e46900f79ff35696c2e4c8e744b452888ac9eb2b1000000000017a914f312c9df3bfa0bca552ffab523bf6f63edaa9c43870247304402206c54d7f770be8236070ebb1cbf49f3b64e1222adc5cac5494338ef7ee931c20502206399e3920b3718d3702d8e1a13bb1623d6f736adfda462f6b966e1179fbe6d4201210275c6e9df9edb6409e75051eac0e753068b4325c03bedaea179b6c9805b6094eaaf270900"
],
  };
  var LEGEND = [['fixed', 'version / locktime'], ['marker', 'segwit marker + flag'], ['inputs', 'inputs'], ['outputs', 'outputs'], ['witness', 'witness (signatures)']];
  function structure(bytes) { return { regions: Kit.btc.parse(bytes).regions, legend: LEGEND }; }
  function explorer(v, txid) { return 'With internet access you can confirm it: <a href="https://mempool.space/tx/' + txid + '" target="_blank" rel="noopener">look it up on a public explorer ↗</a>.'; }
  /* Name the near-miss, so the student learns which step went wrong. */
  function near(hex) {
    return function (entry) {
      var full = Kit.hex.toBytes(hex), stripped = Kit.btc.stripWitness(full), segwit = stripped.length !== full.length;
      return Promise.all([Kit.sha256d(stripped), Kit.sha256d(full), Kit.sha256(stripped), Kit.sha256(full)]).then(function (h) {
        if (segwit && entry === Kit.btc.display(h[1])) return 'That is the wtxid: the hash of everything, witness included. Which bytes does the txid leave out?';
        if (entry === Kit.hex.from(h[0])) return 'Right hash, wrong byte order. How do explorers print it?';
        if (segwit && entry === Kit.hex.from(h[1])) return 'Witness still included, and the byte order is backwards. Two things to fix.';
        if (entry === Kit.btc.display(h[2]) || entry === Kit.hex.from(h[2]) || entry === Kit.btc.display(h[3]) || entry === Kit.hex.from(h[3])) return 'That is a single SHA-256. Bitcoin hashes twice.';
        return null;
      });
    };
  }
  var L = Kit.defineLab({
    id: 'ctf-txid',
    rev: 1, // raise this whenever the transaction lists, pick() or an answer change: old classes are graded with their own version
    title: 'Name that transaction', tags: ['Bitcoin', '02-BF'], minutes: 10, crumbs: 'Bitcoin Framework · Challenge',
    lede: 'Explorers, wallets and court exhibits all refer to a Bitcoin transaction by its ID, the <b>txid</b>. No registry hands txids out. Anyone holding a transaction\'s raw bytes can compute it, and so can you.',
    real: 'The bytes are a real mainnet transaction. The hashing is your browser\'s own SHA-256. The txid you compute will find this exact transaction in any public block explorer. The only shortcut: we handed you the bytes instead of pulling them from a node.',
    ref: 'bitcoin-tx', refPage: '../../ref/bitcoin.html',
    bench: { ops: ['sha256', 'reverse'] },
    legacy: DATA.legacy, segwit: DATA.segwit,
    pick: function (room, who) {
      var h = Kit.hash32(room + '|' + String(who).toLowerCase() + '|ctf-txid');
      return { legacy: h % DATA.legacy.length, segwit: (h >>> 8) % DATA.segwit.length };
    },
    variantLabel: function (v) { return 'variant L' + (v.legacy + 1) + '·S' + (v.segwit + 1); },
    flags: [{
      id: 'f1', points: 100, title: 'the txid',
      brief: '<p>These are the raw bytes of a real transaction from Bitcoin\'s main network, exactly as nodes send it to each other. <b>Compute its txid.</b> The reference sheet below has everything you need.</p>',
      artifacts: function (v) { return [{ label: 'your transaction', hex: DATA.legacy[v.legacy], structure: structure }]; },
      placeholder: '64 hex characters, or flag{…}', format: { kind: 'hex', len: 64, name: 'A txid' },
      answer: function (v) { return Kit.btc.txid(Kit.hex.toBytes(DATA.legacy[v.legacy])); },
      near: function (entry, v) { return near(DATA.legacy[v.legacy])(entry); },
      wrong: 'Not this transaction\u2019s txid. Reload your bytes and check each step in the log.',
      hints: ['Bitcoin rarely hashes anything just once.', 'Explorers print a hash as a number, and Bitcoin stores numbers least-significant byte first.'],
      debrief: '<h2>Debrief</h2><h3>Why it matters</h3><p>For this transaction, the txid is a fingerprint of its exact bytes. Change a single byte (a different amount, a different recipient) and you have a different transaction with a different ID. That\'s why a txid in a report pins down exactly one transaction, and why nobody can quietly edit one afterwards.</p>'
        + '<h3>Why backwards?</h3><p>Bitcoin\'s code treats a 32-byte hash as one large number and stores it least-significant byte first. Explorers print that number most-significant byte first. It\'s the same 32 bytes in the opposite order. If an ID you were given "doesn\'t exist", check its byte order before anything else.</p>',
      general: 'Nobody assigns a transaction ID. It\'s computed from the transaction itself, so every computer on the network agrees on it, and any change to the transaction changes the ID.',
      after: explorer
    }, {
      id: 'f2', points: 200, title: 'the segwit txid', deeper: true,
      brief: '<p><b>Segregated witness</b> (segwit) was switched on in 2017, and most transactions now use it: the signatures move into a separate <i>witness</i> section. Here is a segwit transaction. If you hash all of it, you get its <b>wtxid</b>. The txid that explorers, wallets and other transactions use leaves some bytes out. Work out which ones, remove them in the workbench, and compute the txid.</p>',
      artifacts: function (v) { return [{ label: 'the segwit transaction', hex: DATA.segwit[v.segwit], structure: structure }]; },
      placeholder: '64 hex characters, or flag{…}', format: { kind: 'hex', len: 64, name: 'A txid' },
      answer: function (v) { return Kit.btc.txid(Kit.hex.toBytes(DATA.segwit[v.segwit])); },
      near: function (entry, v) { return near(DATA.segwit[v.segwit])(entry); },
      wrong: 'Not this transaction\u2019s txid. Load it into the workbench again and check each step in the log.',
      hints: ['BIP 141: the txid is computed over the transaction in the original, pre-segwit format.', 'Remove the two bytes straight after the version (marker <code>00</code>, flag <code>01</code>) and the whole witness section that sits just before the last 4 bytes (the locktime).'],
      debrief: '<h3>Why leave the witness out?</h3><p>Before segwit, anyone relaying a transaction could re-encode its signature without invalidating it. The payment still went to the same place, but its txid changed. Software tracking the payment by txid could lose it, and transactions built on top of an unconfirmed one broke. This was called <i>transaction malleability</i>. Taking the signatures out of the txid fixed it for transactions that spend only segwit coins, and that fix is what made payment channels such as the Lightning Network practical.</p>',
      after: explorer
    }]
  });
  root.LAB_TXID = L;
})(typeof window !== 'undefined' ? window : globalThis);

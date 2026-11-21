/* Course identity: an Ethereum-style account from a seed phrase that works exactly like a real one.
   - BIP-39 mechanics: 12 words encode 128 bits of randomness plus a checksum, and derive a seed the standard way.
     The words come from the course's own list (lib/course-words.js), not the BIP-39 list. So a course phrase
     cannot open a real wallet, and a real wallet's phrase is not a valid course phrase: looksReal() spots one.
   - BIP-32/44: the seed derives a private key on the standard Ethereum path m/44'/60'/0'/0/0.
   - EIP-191 personal_sign and EIP-4361 "Sign-In with Ethereum" messages: what every submission is signed with.
   Needs kit.js, lib/wallet-lib.js (vendored noble/scure) and lib/course-words.js; see lib/SOURCE.md. Exposes Kit.wallet. */
(function (root) {
  'use strict';
  var Kit = root.Kit, L = root.KitLib, WORDS = root.BC_WORDS;
  if (!Kit || !L || !WORDS) throw new Error('wallet.js needs kit.js, lib/wallet-lib.js and lib/course-words.js loaded first');
  if (WORDS.length !== 2048) throw new Error('The course word list must have exactly 2048 words');
  var enc = new TextEncoder();
  var PATH = "m/44'/60'/0'/0/0";

  function keccak(bytes) { return L.keccak_256(bytes); }

  /* EIP-55: the capital letters in an address are a checksum. */
  function toChecksum(addr) {
    var a = String(addr).toLowerCase().replace(/^0x/, '');
    if (!/^[0-9a-f]{40}$/.test(a)) throw new Error('Not an Ethereum address');
    var h = Kit.hex.from(keccak(enc.encode(a))), out = '0x';
    for (var i = 0; i < 40; i++) out += parseInt(h[i], 16) >= 8 ? a[i].toUpperCase() : a[i];
    return out;
  }
  function addressOf(pubUncompressed) { return toChecksum(Kit.hex.from(keccak(pubUncompressed.slice(1)).slice(12))); }

  /* EIP-191 personal_sign: the prefix makes it impossible for a signed message to also be a valid transaction. */
  function personalHash(message) {
    var m = enc.encode(message), p = enc.encode('\x19Ethereum Signed Message:\n' + m.length);
    var all = new Uint8Array(p.length + m.length); all.set(p); all.set(m, p.length);
    return keccak(all);
  }

  function normPhrase(p) { return String(p || '').toLowerCase().trim().split(/\s+/).join(' '); }
  function validPhrase(p) { p = normPhrase(p); return p.split(' ').length === 12 && L.validateMnemonic(p, WORDS); }
  function newPhrase() { return L.generateMnemonic(WORDS, 128); }
  /* True when the text looks like a real wallet's seed phrase: 12 to 24 words, all from the BIP-39 English list.
     Nobody should ever type one into a website, so pages use this to say so. Nothing is stored or sent. */
  var realWords = null;
  function looksReal(p) {
    var w = normPhrase(p).split(' ');
    if (w.length < 12 || w.length > 24) return false;
    if (!realWords) { realWords = {}; L.wordlist.forEach(function (x) { realWords[x] = 1; }); }
    return w.every(function (x) { return realWords[x] === 1; });
  }

  function fromPhrase(phrase) {
    phrase = normPhrase(phrase);
    if (!validPhrase(phrase)) throw new Error('That is not a valid 12-word course seed phrase. Check the spelling and the order.');
    var key = L.HDKey.fromMasterSeed(L.mnemonicToSeedSync(phrase)).derive(PATH);
    var priv = key.privateKey;
    var address = addressOf(L.secp256k1.getPublicKey(priv, false));
    return {
      address: address,
      path: PATH,
      /* Open something sealed to this account with sealTo(). Only the holder of these words can. */
      open: function (token) { return openSealed(token, priv); },
      /* Returns the usual Ethereum signature: 0x + r (32 bytes) + s (32) + v (1 byte, 27 or 28). */
      sign: function (message) {
        var sig = L.secp256k1.sign(personalHash(message), priv, { prehash: false, format: 'recovered' }); // recovery id, r, s
        var out = new Uint8Array(65); out.set(sig.slice(1), 0); out[64] = 27 + sig[0];
        return '0x' + Kit.hex.from(out);
      }
    };
  }

  /* Recover the public key (33 bytes) that signed `message`. Verifying a signature needs no key at all. */
  function recoverPub(message, signature) {
    var s = Kit.hex.toBytes(String(signature).replace(/^0x/, ''));
    if (s.length !== 65) throw new Error('A signature is 65 bytes');
    var v = s[64] >= 27 ? s[64] - 27 : s[64];
    if (v !== 0 && v !== 1) throw new Error('Bad recovery value');
    var rec = new Uint8Array(65); rec[0] = v; rec.set(s.slice(0, 64), 1);
    return L.secp256k1.recoverPublicKey(rec, personalHash(message), { prehash: false });
  }
  function recover(message, signature) { return addressOf(L.secp256k1.Point.fromBytes(recoverPub(message, signature)).toBytes(false)); }

  /* Sealing to an account: ECIES on secp256k1 (one-time key, ECDH, HKDF-SHA256, AES-256-GCM).
     Anyone who has seen a signature from an account knows its public key, and so can seal something only it can open.
     That is how published results reach each student privately. */
  var SEAL_INFO = enc.encode('bc-course-result-v1');
  function sealKey(shared, salt) {
    var c = root.crypto.subtle;
    return c.importKey('raw', shared.slice(1), 'HKDF', false, ['deriveKey']).then(function (hk) {
      return c.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: salt, info: SEAL_INFO }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  function sealTo(pubBytes, obj) {
    var eph = L.secp256k1.keygen(), iv = root.crypto.getRandomValues(new Uint8Array(12));
    return sealKey(L.secp256k1.getSharedSecret(eph.secretKey, pubBytes), eph.publicKey).then(function (k) {
      return root.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, enc.encode(JSON.stringify(obj)));
    }).then(function (ct) { return ['BCS1', Kit.b64u.from(eph.publicKey), Kit.b64u.from(iv), Kit.b64u.from(ct)].join('.'); });
  }
  function openSealed(token, priv) {
    var p = String(token).split('.');
    if (p.length !== 4 || p[0] !== 'BCS1') return Promise.reject(new Error('Not sealed to an account'));
    var epk = Kit.b64u.toBytes(p[1]);
    return sealKey(L.secp256k1.getSharedSecret(priv, epk), epk).then(function (k) {
      return root.crypto.subtle.decrypt({ name: 'AES-GCM', iv: Kit.b64u.toBytes(p[2]) }, k, Kit.b64u.toBytes(p[3]));
    }).then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); });
  }

  /* EIP-4361 message. Field order and wording are fixed by the standard. */
  var siwe = {
    build: function (f) {
      // Grammar: address LF LF [statement LF] LF "URI: ". With no statement there are two blank lines.
      var lines = [f.domain + ' wants you to sign in with your Ethereum account:', f.address, ''];
      if (f.statement) lines.push(f.statement);
      lines.push('', 'URI: ' + f.uri, 'Version: 1', 'Chain ID: ' + (f.chainId || 1), 'Nonce: ' + f.nonce, 'Issued At: ' + f.issuedAt);
      if (f.resources && f.resources.length) { lines.push('Resources:'); f.resources.forEach(function (r) { lines.push('- ' + r); }); }
      return lines.join('\n');
    },
    parse: function (text) {
      var m = /^([^\s]+) wants you to sign in with your Ethereum account:\n(0x[0-9a-fA-F]{40})\n\n(?:([^\n]+)\n)?\nURI:([^\n]+)\nVersion: 1\nChain ID: (\d+)\nNonce: ([A-Za-z0-9]{8,})\nIssued At: ([^\n]+)(?:\nResources:((?:\n- [^\n]+)*))?$/.exec(String(text));
      if (!m) throw new Error('Not an EIP-4361 message');
      return { domain: m[1], address: m[2], statement: m[3] || '', uri: m[4], chainId: +m[5], nonce: m[6], issuedAt: m[7],
        resources: m[8] ? m[8].split('\n- ').slice(1) : [] };
    },
    nonce: function () {
      var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', r = root.crypto.getRandomValues(new Uint8Array(16)), s = '';
      for (var i = 0; i < r.length; i++) s += abc[r[i] % abc.length];
      return s;
    },
    /* RFC 6920 "named information" URI for a SHA-256 digest: how the signed message points at the submission it covers. */
    niUri: function (digestBytes) { return 'ni:///sha-256;' + Kit.b64u.from(digestBytes); }
  };

  /* A strong, sayable class code: four seed-phrase words (44 bits). */
  function newClassCode() { return L.generateMnemonic(WORDS, 128).split(' ').slice(0, 4).join('-'); }

  Kit.wallet = { PATH: PATH, newPhrase: newPhrase, validPhrase: validPhrase, looksReal: looksReal, normPhrase: normPhrase, fromPhrase: fromPhrase,
    recover: recover, recoverPub: recoverPub, sealTo: sealTo, toChecksum: toChecksum, personalHash: personalHash, siwe: siwe, newClassCode: newClassCode };
})(typeof window !== 'undefined' ? window : globalThis);

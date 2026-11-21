# Vendored library: wallet-lib.js

One file that gives the course kit secp256k1, Keccak-256, BIP-39 seed phrases and BIP-32 key derivation.
Browsers have none of these built in, and this is not code to write by hand.

- **Built from:** `@noble/curves` 2.4.0, `@noble/hashes` 2.4.0, `@scure/bip39` 2.4.0, `@scure/bip32` 2.4.0
  (plus their dependency `@scure/base` 2.4.0). All are by Paul Miller, MIT licensed, with no other dependencies.
- **Sources:** https://github.com/paulmillr/noble-curves, noble-hashes, scure-bip39, scure-bip32
- **Bundled with:** esbuild 0.28.2:
  `esbuild entry.js --bundle --minify --format=iife --target=es2020 --outfile=wallet-lib.js`
- **Entry file:**

  ```js
  import { secp256k1 } from '@noble/curves/secp256k1.js';
  import { keccak_256 } from '@noble/hashes/sha3.js';
  import { generateMnemonic, validateMnemonic, mnemonicToSeedSync } from '@scure/bip39';
  import { wordlist } from '@scure/bip39/wordlists/english.js';
  import { HDKey } from '@scure/bip32';
  globalThis.KitLib = { secp256k1, keccak_256, generateMnemonic, validateMnemonic, mnemonicToSeedSync, wordlist, HDKey };
  ```
- **SHA-256 of wallet-lib.js:** `625d35124d8062c13e2f886060079428968f0c0803e5eb5d45635366bef40d54`
- **Licence:** `LICENSE-noble-scure.txt` (MIT; all five packages carry the same text)

It is a classic script that sets `KitLib`, so it works from a plain file with no network. The method follows the
upstream lab `forge-the-payment`, which vendored noble 2.4.0 the same way. To update: rebuild from newer
releases, rerun the kit tests, and update the versions and hash here.

# Generated word list: course-words.js

The 2,048 words course seed phrases are made from. It is used exactly as BIP-39 uses its own list, but it is a
different list, so course phrases cannot open real wallets and real wallet phrases are not valid here.

- **Derived from:** the EFF long word list, https://www.eff.org/dice, by the Electronic Frontier Foundation, licensed
  CC BY 3.0 US (https://creativecommons.org/licenses/by/3.0/us/). Source file `eff_large_wordlist.txt`, SHA-256
  `addd35536511597a02fa0a9ff1e5284677b8883b83e986e43f15a3db996b903e`.
- **Changes made:** `tools/build_wordlist.py` keeps words of 4 to 8 letters that are not on the BIP-39 English list,
  do not share their first four letters with a BIP-39 English word, are not on the script's block list, and have
  first four letters unique within the result. It then takes 2,048 spread through the alphabet.
- **To rebuild:** `python3 tools/build_wordlist.py eff_large_wordlist.txt <bip39 english list>`. The script is
  deterministic; the file's header records the hash of the result.

**Do not change this list once a class has used it.** A student's account is derived from their words through
this list, so any change gives every student a different account.

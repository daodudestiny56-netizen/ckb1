import * as bindings from "@ckb-js-std/bindings";
import {
  HighLevel,
  log,
  hashCkb,
  bytesEq,
  HasherCkb,
  WitnessArgs,
  numToBytes,
} from "@ckb-js-std/core";

/**
 * Computes standard CKB sighash_all digest over the current transaction.
 * 
 * 1. Hashes the 32-byte transaction hash.
 * 2. Hashes the first input group witness, with the 65-byte secp256k1 signature zeroed out.
 * 3. Hashes all remaining witnesses in the transaction.
 */
function computeSighashAll(): Uint8Array {
  const hasher = new HasherCkb();

  // Step A: Hash 32-byte transaction hash
  const txHash = HighLevel.loadTxHash();
  hasher.update(txHash);

  // Step B: Hash input group 0 witness with the 65-byte signature zeroed out
  const rawWitness = HighLevel.loadWitness(0, bindings.SOURCE_GROUP_INPUT);
  const witnessArgs = WitnessArgs.fromBytes(rawWitness);

  if (witnessArgs.lock) {
    const lockBytes = new Uint8Array(witnessArgs.lock);
    // The first 65 bytes are the signature (r [32b], s [32b], recovery [1b]).
    // Zero them out in place for sighash calculation.
    for (let k = 0; k < Math.min(65, lockBytes.length); k++) {
      lockBytes[k] = 0;
    }
  }

  const zeroedWitnessBytes = witnessArgs.toBytes();
  hasher.update(numToBytes(zeroedWitnessBytes.byteLength, 8));
  hasher.update(zeroedWitnessBytes);

  // Step C: Hash remaining transaction witnesses
  let i = 1;
  while (true) {
    try {
      const w = HighLevel.loadWitness(i, bindings.SOURCE_INPUT);
      hasher.update(numToBytes(w.byteLength, 8));
      hasher.update(w);
      i++;
    } catch (e: any) {
      if (e.errorCode === bindings.INDEX_OUT_OF_BOUND) {
        break;
      }
      throw e;
    }
  }

  return new Uint8Array(hasher.digest());
}

function main(): number {
  log.setLevel(log.LogLevel.Debug);
  let script = bindings.loadScript();
  log.debug(`hash-lock-v2 script loaded: ${JSON.stringify(script)}`);

  // Parse Script Args Layout:
  // 0x0000 (2 bytes) + codeHash (32 bytes) + hashType (1 byte) = 35 bytes header prefix for ckb_js_vm
  // Offset 35..55: pubkey_hash (20 bytes blake160 hash of expected secp256k1 public key)
  // Offset 55..87: expect_hash (32 bytes salted hash commitment = hashCkb(preimage + nonce))
  // Offset 87..119: nonce (32 bytes cell-specific salt)
  const scriptArgs = new Uint8Array(HighLevel.loadScript().args);

  if (scriptArgs.length < 119) {
    log.error(`Invalid script args length: expected at least 119 bytes, got ${scriptArgs.length}`);
    return 10;
  }

  const expect_pubkey_hash = scriptArgs.slice(35, 55);
  const expect_hash = scriptArgs.slice(55, 87);
  const nonce = scriptArgs.slice(87, 119);

  // Parse WitnessArgs.lock:
  // witnessArgs.lock contains: signature (65 bytes) + preimage (variable length)
  const witness_args = HighLevel.loadWitnessArgs(0, bindings.SOURCE_GROUP_INPUT);
  if (!witness_args.lock) {
    log.error("Missing witness lock argument");
    return 11;
  }

  const lockBytes = new Uint8Array(witness_args.lock);
  if (lockBytes.length < 65) {
    log.error(`Witness lock too short: expected at least 65 bytes, got ${lockBytes.length}`);
    return 11;
  }

  const sigBytes = lockBytes.slice(0, 65);
  const preimage = lockBytes.slice(65);

  // =========================================================================
  // Security Improvement 1: Signature-Based Authentication
  // =========================================================================
  // Requires a valid secp256k1 signature over the transaction in the witness,
  // verified against the blake160 pubkey hash stored in script args.
  // Adapts CKB's standard secp256k1_blake160_sighash_all pattern for JS-VM.
  const signature = sigBytes.slice(0, 64).buffer;
  const recId = sigBytes[64];
  const sighash = computeSighashAll().buffer;

  try {
    const rawPubkey = bindings.secp256k1.recover(signature, recId, sighash);
    const compressedPubkey = bindings.secp256k1.serializePubkey(rawPubkey, true);
    const pubkeyHash = new Uint8Array(hashCkb(compressedPubkey)).slice(0, 20);

    if (!bytesEq(pubkeyHash.buffer, expect_pubkey_hash.buffer)) {
      log.error("Signature verification failed: pubkey hash mismatch");
      return 12;
    }
  } catch (err: any) {
    log.error(`Signature verification failed with error: ${err.message || err}`);
    return 12;
  }

  // =========================================================================
  // Security Improvement 2: Salted Per-Cell Preimage Verification
  // =========================================================================
  // Prevents preimage reuse across cells by salting the hash commitment with a cell-specific nonce:
  // expect_hash = hashCkb(preimage + nonce)
  const computedHash = hashCkb(preimage.buffer, nonce.buffer);

  if (!bytesEq(computedHash, expect_hash.buffer)) {
    log.error("Check salted hash failed: computed hash does not match expectation");
    return 13;
  }

  log.debug("hash-lock-v2 contract verification succeeded!");
  return 0;
}

bindings.exit(main());

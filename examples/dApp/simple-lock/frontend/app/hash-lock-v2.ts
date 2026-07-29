import { ccc, hexFrom, hashTypeToBytes } from "@ckb-ccc/core";
import { secp256k1 } from "@noble/curves/secp256k1";
import { cccClient, readEnvNetwork } from "./ccc-client";
import scripts from "../deployment/scripts.json";
import systemScripts from "../deployment/system-scripts.json";

const myScripts = scripts[readEnvNetwork()] as any;
const mySystemScripts = systemScripts[readEnvNetwork()] as any;

export function uint8ArrayToHexString(uint8Array: Uint8Array): string {
  return Array.prototype.map
    .call(uint8Array, (x) => ("00" + x.toString(16)).slice(-2))
    .join("");
}

export function stringToBytesHex(text: string): string {
  const encoder = new TextEncoder();
  const buf: Uint8Array = encoder.encode(text);
  return "0x" + uint8ArrayToHexString(buf);
}

/**
 * Calculates blake160 hash (first 20 bytes of CKB blake2b hash) from compressed public key or private key.
 */
export function getPubkeyHashFromPrivateKey(privateKeyHex: string): string {
  const privKeyBytes = ccc.bytesFrom(privateKeyHex);
  const compressedPubkey = secp256k1.getPublicKey(privKeyBytes, true);
  const pubkeyHash = ccc.bytesFrom(ccc.hashCkb(compressedPubkey)).slice(0, 20);
  return ccc.hexFrom(pubkeyHash);
}

/**
 * Security Improvement 2: Salted Per-Cell Preimage Commitment
 * 
 * Generates an account lock script with:
 * 1. pubkeyHash: 20-byte blake160 hash for secp256k1 signature authentication
 * 2. saltedHash: hashCkb(preimage + nonce) to prevent preimage reuse across cells
 * 3. nonce: 32-byte cell-specific salt stored in script args
 */
export function generateAccountV2({
  pubkeyHash,
  preimage,
  nonce,
}: {
  pubkeyHash: string;
  preimage: string;
  nonce?: string;
}) {
  const cleanPubkeyHash = pubkeyHash.replace(/^0x/, "");
  if (cleanPubkeyHash.length !== 40) {
    throw new Error("pubkeyHash must be 20 bytes (40 hex characters)");
  }

  // Generate a random 32-byte nonce if not provided
  const nonceBytes = nonce
    ? ccc.bytesFrom(nonce)
    : crypto.getRandomValues(new Uint8Array(32));
  const nonceHex = ccc.hexFrom(nonceBytes).replace(/^0x/, "");

  // Compute salted hash: hashCkb(preimage + nonce)
  const preimageBytes = ccc.bytesFrom(stringToBytesHex(preimage));
  const saltedHashBytes = ccc.hashCkb(preimageBytes, nonceBytes);
  const saltedHashHex = ccc.hexFrom(saltedHashBytes).replace(/^0x/, "");

  // Build lockArgs layout:
  // 0x0000 (2 bytes) + codeHash (32 bytes) + hashType (1 byte) + pubkeyHash (20 bytes) + saltedHash (32 bytes) + nonce (32 bytes)
  const lockArgs =
    "0x0000" +
    myScripts["hash-lock-v2.bc"]!.codeHash.slice(2) +
    hexFrom(hashTypeToBytes(myScripts["hash-lock-v2.bc"]!.hashType)).slice(2) +
    cleanPubkeyHash +
    saltedHashHex +
    nonceHex;

  const lockScript = {
    codeHash: mySystemScripts["ckb_js_vm"]!.script.codeHash,
    hashType: mySystemScripts["ckb_js_vm"]!.script.hashType,
    args: lockArgs,
  };

  const address = ccc.Address.fromScript(lockScript, cccClient).toString();

  return {
    address,
    lockScript: ccc.Script.from(lockScript),
    pubkeyHash: "0x" + cleanPubkeyHash,
    saltedHash: "0x" + saltedHashHex,
    nonce: "0x" + nonceHex,
  };
}

/**
 * Computes standard CKB sighash_all digest over a transaction for input 0.
 */

function computeTxSighashAll(tx: ccc.Transaction): string {
  const hasher = new ccc.HasherCkb();

  // Step 1: Hash transaction hash
  hasher.update(ccc.bytesFrom(tx.hash()));

  // Step 2: Hash input 0 witness args with 65-byte dummy signature
  const witness0 = tx.getWitnessArgsAt(0)!;
  const witness0Bytes = ccc.bytesFrom(witness0.toBytes());
  hasher.update(ccc.numLeToBytes(witness0Bytes.length, 8));
  hasher.update(witness0Bytes);

  // Step 3: Hash remaining witnesses
  for (let i = 1; i < tx.witnesses.length; i++) {
    const wBytes = ccc.bytesFrom(tx.witnesses[i]);
    hasher.update(ccc.numLeToBytes(wBytes.length, 8));
    hasher.update(wBytes);
  }

  return hasher.digest();
}

/**
 * Security Improvement 1 & 2: Unlock hash-lock-v2 Cell
 * 
 * 1. Creates a 65-byte secp256k1 signature (r, s, recovery) over the transaction sighash_all.
 * 2. Combines signature (65 bytes) + preimage into witness.lock.
 * 3. Submits the transaction for verification.
 */
export async function unlockV2({
  fromAddr,
  toAddr,
  amountInCKB,
  preimage,
  privateKey,
}: {
  fromAddr: string;
  toAddr: string;
  amountInCKB: string;
  preimage: string;
  privateKey: string;
}): Promise<string> {
  const fromScript = (await ccc.Address.fromString(fromAddr, cccClient)).script;
  const toScript = (await ccc.Address.fromString(toAddr, cccClient)).script;
  const readSigner = new ccc.SignerCkbScriptReadonly(cccClient, fromScript);

  // Build unlock transaction
  const tx = ccc.Transaction.from({
    outputs: [{ lock: toScript }],
    outputsData: [],
  });

  tx.outputs.forEach((output, i) => {
    if (output.capacity > ccc.fixedPointFrom(amountInCKB)) {
      alert(`Insufficient capacity at output ${i} to store data`);
      return;
    }
    output.capacity = ccc.fixedPointFrom(amountInCKB);
  });

  // Add cell deps
  await tx.addCellDeps(myScripts["hash-lock-v2.bc"]!.cellDeps[0].cellDep);
  await tx.addCellDeps(
    mySystemScripts["ckb_js_vm"]!.script.cellDeps[0].cellDep,
  );

  let occupiedSize = ccc.CellOutput.from({
    capacity: BigInt(1000),
    lock: fromScript,
  }).occupiedSize;

  await tx.completeInputsByCapacity(
    readSigner,
    ccc.fixedPointFrom(occupiedSize),
  );

  const balanceDiff =
    (await tx.getInputsCapacity(cccClient)) - tx.getOutputsCapacity();
  if (balanceDiff > ccc.Zero) {
    tx.addOutput({
      lock: fromScript,
      capacity: balanceDiff - BigInt(1000),
    });
  }

  // 1. Prepare witness lock with 65-byte dummy signature + preimage bytes
  const preimageHex = stringToBytesHex(preimage).slice(2);
  const dummySignatureHex = "00".repeat(65);
  const dummyWitnessLock = ("0x" + dummySignatureHex + preimageHex) as `0x${string}`;

  tx.setWitnessArgsAt(0, new ccc.WitnessArgs(dummyWitnessLock));

  // 2. Calculate sighash_all message
  const sighash = computeTxSighashAll(tx);

  // 3. Sign sighash with secp256k1 private key
  const privKeyBytes = ccc.bytesFrom(privateKey);
  const sig = secp256k1.sign(ccc.bytesFrom(sighash), privKeyBytes);

  const rBytes = ccc.numBeToBytes(sig.r, 32);
  const sBytes = ccc.numBeToBytes(sig.s, 32);
  const vBytes = ccc.numLeToBytes(sig.recovery, 1);
  const realSignatureHex = ccc.hexFrom(ccc.bytesConcat(rBytes, sBytes, vBytes)).slice(2);

  // 4. Set final witness lock with valid signature (65 bytes) + preimage
  const finalWitnessLock = ("0x" + realSignatureHex + preimageHex) as `0x${string}`;
  tx.setWitnessArgsAt(0, new ccc.WitnessArgs(finalWitnessLock));

  const txHash = await cccClient.sendTransaction(tx);
  console.log("Full transaction hash-lock-v2: ", tx.stringify());
  return txHash;
}

import {
  hexFrom,
  Transaction,
  hashTypeToBytes,
  hashCkb,
  WitnessArgs,
  bytesConcat,
  numBeToBytes,
  numLeToBytes,
  bytesFrom,
  HasherCkb,
} from "@ckb-ccc/core";
import { secp256k1 } from "@noble/curves/secp256k1";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  Resource,
  Verifier,
  DEFAULT_SCRIPT_ALWAYS_SUCCESS,
  DEFAULT_SCRIPT_CKB_JS_VM,
} from "ckb-testtool";

describe("hash-lock-v2 contract", () => {
  const privateKeyHex = "0x0000000000000000000000000000000000000000000000000000000000000001";
  const privKeyBytes = bytesFrom(privateKeyHex);
  const compressedPubkey = secp256k1.getPublicKey(privKeyBytes, true);
  const pubkeyHash = bytesFrom(hashCkb(compressedPubkey)).slice(0, 20);
  const pubkeyHashHex = hexFrom(pubkeyHash).slice(2);

  test("should execute successfully with valid signature and salted preimage", async () => {
    const resource = Resource.default();
    const tx = Transaction.default();

    const mainScript = resource.deployCell(
      hexFrom(readFileSync(DEFAULT_SCRIPT_CKB_JS_VM)),
      tx,
      false,
    );
    const alwaysSuccessScript = resource.deployCell(
      hexFrom(readFileSync(DEFAULT_SCRIPT_ALWAYS_SUCCESS)),
      tx,
      false,
    );
    const contractScript = resource.deployCell(
      hexFrom(readFileSync("dist/hash-lock-v2.bc")),
      tx,
      false,
    );

    const preimage = "Hello World";
    const preimageBytes = bytesFrom(Buffer.from(preimage, "utf8"));
    const nonce = bytesFrom("0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20");
    const saltedHash = hashCkb(preimageBytes, nonce);

    mainScript.args = hexFrom(
      "0x0000" +
        contractScript.codeHash.slice(2) +
        hexFrom(hashTypeToBytes(contractScript.hashType)).slice(2) +
        pubkeyHashHex +
        hexFrom(saltedHash).slice(2) +
        hexFrom(nonce).slice(2),
    );

    // 1 input cell
    const inputCell = resource.mockCell(mainScript, undefined, "0x");
    tx.inputs.push(Resource.createCellInput(inputCell));

    // 2 output cells
    tx.outputs.push(Resource.createCellOutput(alwaysSuccessScript));
    tx.outputsData.push(hexFrom("0xFE000000000000000000000000000000"));
    tx.outputs.push(Resource.createCellOutput(alwaysSuccessScript));
    tx.outputsData.push(hexFrom("0x01000000000000000000000000000000"));

    // Prepare witness with dummy signature (65 zero bytes) + preimage
    const dummySignature = new Uint8Array(65);
    const dummyWitnessLock = bytesConcat(dummySignature, preimageBytes);
    tx.witnesses.push(hexFrom(new WitnessArgs(hexFrom(dummyWitnessLock)).toBytes()));

    // Calculate sighash_all over tx
    const hasher = new HasherCkb();
    hasher.update(bytesFrom(tx.hash()));
    const witness0Bytes = bytesFrom(tx.witnesses[0]);
    hasher.update(numLeToBytes(witness0Bytes.length, 8));
    hasher.update(witness0Bytes);

    for (let i = 1; i < tx.witnesses.length; i++) {
      const wBytes = bytesFrom(tx.witnesses[i]);
      hasher.update(numLeToBytes(wBytes.length, 8));
      hasher.update(wBytes);
    }
    const sighash = hasher.digest();

    // Sign sighash with secp256k1
    const sig = secp256k1.sign(bytesFrom(sighash), privKeyBytes);
    const rBytes = numBeToBytes(sig.r, 32);
    const sBytes = numBeToBytes(sig.s, 32);
    const vBytes = numLeToBytes(sig.recovery, 1);
    const realSignature = bytesConcat(rBytes, sBytes, vBytes);

    // Replace witness with real signature + preimage
    const realWitnessLock = bytesConcat(realSignature, preimageBytes);
    tx.witnesses[0] = hexFrom(new WitnessArgs(hexFrom(realWitnessLock)).toBytes());

    const verifier = Verifier.from(resource, tx);
    verifier.verifySuccess(true);
  });
});

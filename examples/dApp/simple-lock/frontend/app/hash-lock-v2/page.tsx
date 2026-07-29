"use client";

import React, { useEffect, useState } from "react";
import {
  generateAccountV2,
  getPubkeyHashFromPrivateKey,
  unlockV2,
} from "../hash-lock-v2";
import { capacityOf, shannonToCKB, wait } from "../hash-lock";
import scripts from "../../deployment/scripts.json";
import { readEnvNetwork } from "../ccc-client";

const myScripts = scripts[readEnvNetwork()] as any;

export default function HashLockV2Page() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="space-y-10 w-full max-w-4xl">
        <HashLockV2 />
      </div>
    </main>
  );
}

function HashLockV2() {
  const scriptName = "hash-lock-v2.bc";

  const [privateKey, setPrivateKey] = useState(
    "0x6109170b275a09ad54877b82f7d9930f88cab5717d484fb4741ae9d1dd078cd6",
  );
  const [pubkeyHash, setPubkeyHash] = useState("");
  const [preimage, setPreimage] = useState("Hello World");
  const [nonce, setNonce] = useState("");

  const [fromAddr, setFromAddr] = useState("");
  const [saltedHash, setSaltedHash] = useState("");
  const [balance, setBalance] = useState("0");

  const [toAddr, setToAddr] = useState(
    "ckt1qzda0cr08m85hc8jlnfp3zer7xulejywt49kt2rr0vthywaa50xwsqt435c3epyrupszm7khk6weq5lrlyt52lg48ucew",
  );
  const [amountInCKB, setAmountInCKB] = useState("99");
  const [isTransferring, setIsTransferring] = useState(false);
  const [txHash, setTxHash] = useState<string>();
  const [errorMsg, setErrorMsg] = useState<string>();

  useEffect(() => {
    try {
      const hash = getPubkeyHashFromPrivateKey(privateKey);
      setPubkeyHash(hash);
    } catch (e) {
      // invalid key while typing, ignore
    }
  }, [privateKey]);

  const generateNewAccount = async () => {
    setErrorMsg(undefined);
    try {
      const result = generateAccountV2({
        pubkeyHash,
        preimage,
        nonce: nonce || undefined,
      });
      setFromAddr(result.address);
      setSaltedHash(result.saltedHash);
      setNonce(result.nonce);
      const capacity = await capacityOf(result.address);
      setBalance(shannonToCKB(capacity).toString());
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    }
  };

  const refreshBalance = async () => {
    if (!fromAddr) return;
    const capacity = await capacityOf(fromAddr);
    setBalance(shannonToCKB(capacity).toString());
  };

  const onTransfer = async () => {
    setIsTransferring(true);
    setErrorMsg(undefined);
    try {
      const hash = await unlockV2({
        fromAddr,
        toAddr,
        amountInCKB,
        preimage,
        privateKey,
      });
      setTxHash(hash);
      await wait(10);
      await refreshBalance();
    } catch (e: any) {
      setErrorMsg(e.message || String(e));
    }
    setIsTransferring(false);
  };

  const enabled =
    +amountInCKB > 61 &&
    +balance > +amountInCKB &&
    toAddr.length > 0 &&
    !isTransferring &&
    !!fromAddr;

  return (
    <div className="w-full">
      <div className="mb-10 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
        Hash Lock V2 (Auth + Salted Hash)
      </div>

      <div className="mb-8">
        <div className="text-xl font-bold">HASH_LOCK_V2 Script Info</div>
        <div className="break-all">
          code_hash:{" "}
          {myScripts[scriptName]?.codeHash
            ? myScripts[scriptName]?.codeHash
            : "Not Found, deploy script first."}
        </div>
      </div>

      <div>
        <div className="text-xl font-bold">Build A Lock</div>

        <div className="w-full flex mb-2 mt-2">
          <label htmlFor="privkey">Private Key: </label>&nbsp;
          <input
            id="privkey"
            type="text"
            value={privateKey}
            onChange={(e) => setPrivateKey(e.target.value)}
            className="w-full px-1 py-1"
          />
        </div>

        <div className="w-full flex mb-2 mt-2">
          <label htmlFor="pubkeyhash">Pubkey Hash (derived): </label>&nbsp;
          <input
            id="pubkeyhash"
            type="text"
            value={pubkeyHash}
            readOnly
            className="w-full px-1 py-1 bg-gray-100"
          />
        </div>

        <div className="w-full flex mb-2 mt-2">
          <label htmlFor="preimage">Preimage: </label>&nbsp;
          <input
            id="preimage"
            type="text"
            value={preimage}
            onChange={(e) => setPreimage(e.target.value)}
            className="w-full px-1 py-1"
          />
        </div>

        <div className="w-full flex mb-2 mt-2">
          <label htmlFor="nonce">Nonce (leave blank to auto-generate): </label>&nbsp;
          <input
            id="nonce"
            type="text"
            value={nonce}
            onChange={(e) => setNonce(e.target.value)}
            className="w-full px-1 py-1"
          />
        </div>

        <button
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded mb-4"
          onClick={generateNewAccount}
        >
          Generate Account
        </button>

        {saltedHash && (
          <div className="mb-4 text-sm break-all">
            <div>Salted Hash: {saltedHash}</div>
          </div>
        )}

        <div className="my-4">
          Hash Lock V2:
          <ul className="max-w-2xl">
            <li className="break-all">CKB Address: {fromAddr || "(generate an account first)"}</li>
            <li>Total capacity: {balance} CKB</li>
          </ul>
        </div>
      </div>

      <div className="w-full mt-8">
        <div className="text-xl font-bold">Transfer from Hash Lock V2</div>
        <div className="w-full flex mb-2 mt-2">
          <label htmlFor="to-address">Receiver: </label>&nbsp;
          <input
            id="to-address"
            type="text"
            value={toAddr}
            onChange={(e) => setToAddr(e.target.value)}
            className="w-full px-1 py-1"
          />
        </div>

        <div className="w-full flex">
          <label htmlFor="amount">Amount</label>
          &nbsp;
          <input
            id="amount"
            type="number"
            value={amountInCKB}
            onChange={(e) => setAmountInCKB(e.target.value)}
            className="w-full px-1 py-1"
          />
        </div>
        <small>Tx fee: 0.001 CKB</small>

        <div className="my-4">
          <button
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded disabled:opacity-50"
            disabled={!enabled}
            onClick={onTransfer}
          >
            {isTransferring ? "Transferring..." : "Transfer"}
          </button>
          {txHash && <div className="mt-2 break-all">tx hash: {txHash}</div>}
          {errorMsg && (
            <div className="mt-2 break-all text-red-600">Error: {errorMsg}</div>
          )}
        </div>
      </div>
    </div>
  );
}

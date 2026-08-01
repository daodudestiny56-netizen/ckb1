/**
 * wallet-utils.ts — CKB Devnet Wallet Utility Functions
 *
 * All CKB-specific logic for the wallet dApp, isolated from UI components.
 *
 * KEY CONCEPTS (for someone new to CKB):
 * - CKB uses a "cell model" (similar to Bitcoin's UTXO model, not account-based like Ethereum)
 * - Each cell has a "capacity" field (in shannons, 1 CKB = 10^8 shannons)
 * - Minimum cell capacity is ~61 CKB (to cover the cell's own storage cost)
 * - Lock scripts control who can spend a cell (like Bitcoin's scriptPubKey)
 * - The standard lock is secp256k1_blake160_sighash_all (same curve as Bitcoin)
 *
 * FEE STRATEGY:
 * Uses a hardcoded fee of 1000 shannons (0.00001 CKB) instead of dynamic fee estimation.
 * Reason: CCC's `completeFeeBy()` calls `getFeeRateStatistics` RPC, which returns null on
 * Devnet nodes without sufficient transaction history, causing a runtime crash:
 *   TypeError: Cannot destructure property 'mean' of null
 * The hardcoded fee is sufficient for Devnet and matches the proven pattern in hash-lock.ts.
 */

import { ccc } from "@ckb-ccc/core";
import { secp256k1 } from "@noble/curves/secp256k1";
import { cccClient } from "../ccc-client";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default transaction fee in shannons (0.00001 CKB). Sufficient for Devnet. */
const DEFAULT_FEE = BigInt(1000);

/** Minimum CKB transfer amount. A cell must hold enough capacity to cover its own
 *  serialized size on-chain. For a standard secp256k1 lock, this is ~61 CKB. */
const MIN_TRANSFER_CKB = 61;

/** Number of shannons per CKB */
const SHANNONS_PER_CKB = BigInt(100_000_000);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WalletInfo {
  privateKey: string;
  publicKeyHash: string;
  address: string;
  lockScript: ccc.Script;
}

export interface TransactionRecord {
  txHash: string;
  blockNumber: bigint;
  txIndex: bigint;
  /** "in" = received CKB, "out" = sent CKB, "both" = self-transfer */
  direction: "in" | "out" | "both";
  status: string;
}

export interface SendResult {
  txHash: string;
}

// ─── Wallet Derivation ───────────────────────────────────────────────────────

/**
 * Validates that a hex string is a plausible secp256k1 private key.
 * Must be 32 bytes (64 hex chars), optionally prefixed with 0x.
 */
export function validatePrivateKey(hex: string): boolean {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length !== 64) return false;
  if (!/^[0-9a-fA-F]+$/.test(clean)) return false;
  // Check it's a valid scalar on the secp256k1 curve (non-zero, less than curve order)
  try {
    const bytes = ccc.bytesFrom(hex.startsWith("0x") ? hex : "0x" + hex);
    secp256k1.getPublicKey(bytes, true);
    return true;
  } catch {
    return false;
  }
}

/**
 * Derives a full wallet from a private key hex string.
 *
 * Uses the standard CKB secp256k1_blake160_sighash_all lock script:
 * 1. Derive compressed public key from private key
 * 2. Hash public key with CKB blake2b -> take first 20 bytes (blake160)
 * 3. Construct lock script with the blake160 hash as args
 * 4. Encode as CKB address
 */
export function deriveWallet(privateKeyHex: string): WalletInfo {
  const normalizedKey = privateKeyHex.startsWith("0x")
    ? privateKeyHex
    : "0x" + privateKeyHex;

  // Step 1: Get compressed public key (33 bytes)
  const privKeyBytes = ccc.bytesFrom(normalizedKey);
  const compressedPubkey = secp256k1.getPublicKey(privKeyBytes, true);

  // Step 2: blake160 hash = first 20 bytes of blake2b-256
  const pubkeyHash = ccc.bytesFrom(ccc.hashCkb(compressedPubkey)).slice(0, 20);
  const pubkeyHashHex = ccc.hexFrom(pubkeyHash);

  // Step 3: Create a SignerCkbPrivateKey to derive the standard address
  const signer = new ccc.SignerCkbPrivateKey(cccClient, normalizedKey);

  // We need to get the lock script synchronously, so build it manually
  // using the known secp256k1_blake160_sighash_all code hash
  // The signer has this info but requires async calls, so we derive it directly
  const lockScript = ccc.Script.from({
    codeHash:
      "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
    hashType: "type",
    args: pubkeyHashHex,
  });

  const address = ccc.Address.fromScript(lockScript, cccClient).toString();

  return {
    privateKey: normalizedKey,
    publicKeyHash: pubkeyHashHex,
    address,
    lockScript,
  };
}

/**
 * Generates a cryptographically random wallet keypair.
 * Uses the browser's crypto.getRandomValues for entropy.
 */
export function generateRandomWallet(): WalletInfo {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const privateKeyHex = "0x" + ccc.hexFrom(randomBytes).slice(2);
  return deriveWallet(privateKeyHex);
}

// ─── Balance ─────────────────────────────────────────────────────────────────

/**
 * Queries the total CKB balance for a lock script.
 * Sums the capacity of all live (unspent) cells matching this lock.
 */
export async function getBalance(
  lockScript: ccc.Script
): Promise<bigint> {
  try {
    return await cccClient.getBalance([lockScript]);
  } catch (err) {
    console.error("Failed to fetch balance:", err);
    throw new Error(
      "Could not fetch balance. Is the Devnet node running at localhost:28114?"
    );
  }
}

// ─── Formatting ──────────────────────────────────────────────────────────────

/**
 * Converts shannons (bigint) to a human-readable CKB string.
 * Example: 10000000000n -> "100.00000000"
 */
export function formatCKB(shannons: bigint): string {
  const whole = shannons / SHANNONS_PER_CKB;
  const frac = shannons % SHANNONS_PER_CKB;
  const fracStr = frac.toString().padStart(8, "0");
  // Trim trailing zeros for cleaner display, but keep at least 2 decimals
  const trimmed = fracStr.replace(/0+$/, "").padEnd(2, "0");
  return `${whole}.${trimmed}`;
}

/**
 * Converts a whole-CKB string (e.g. "100") to shannons (bigint).
 */
export function ckbToShannons(ckb: string): bigint {
  const parts = ckb.split(".");
  const whole = BigInt(parts[0] || "0") * SHANNONS_PER_CKB;
  if (parts[1]) {
    const fracStr = parts[1].padEnd(8, "0").slice(0, 8);
    return whole + BigInt(fracStr);
  }
  return whole;
}

/**
 * Truncates a hex hash/address for display.
 * Example: truncateHash("ckt1qz...very_long...8ucew", 8) -> "ckt1qz...e8ucew"
 */
export function truncateHash(hash: string, chars: number = 8): string {
  if (hash.length <= chars * 2 + 3) return hash;
  return hash.slice(0, chars) + "..." + hash.slice(-chars);
}

// ─── Address Validation ──────────────────────────────────────────────────────

/**
 * Validates a CKB address string. Returns true if it can be parsed.
 */
export async function validateAddress(addr: string): Promise<boolean> {
  try {
    await ccc.Address.fromString(addr, cccClient);
    return true;
  } catch {
    return false;
  }
}

// ─── Transaction History ─────────────────────────────────────────────────────

/**
 * Fetches recent transactions involving a lock script.
 *
 * Uses the CKB indexer's `get_transactions` RPC (exposed via CCC as
 * `findTransactionsByLock`). With `groupByTransaction: true`, each
 * transaction appears once even if it involves multiple cells with our lock.
 *
 * The `cells` array on each result tells us whether our lock script appeared
 * in inputs (isInput=true, meaning we sent CKB) or outputs (isInput=false,
 * meaning we received CKB).
 */
export async function getRecentTransactions(
  lockScript: ccc.Script,
  limit: number = 10
): Promise<TransactionRecord[]> {
  const records: TransactionRecord[] = [];

  try {
    // findTransactionsByLock returns an AsyncGenerator
    // With groupByTransaction=true, we get grouped results
    for await (const tx of cccClient.findTransactionsByLock(
      lockScript,
      null, // no type script filter
      true, // groupByTransaction
      "desc", // newest first
      limit
    )) {
      // Determine direction from the cells array
      const hasInput = tx.cells.some(
        (c: { isInput: boolean }) => c.isInput
      );
      const hasOutput = tx.cells.some(
        (c: { isInput: boolean }) => !c.isInput
      );

      let direction: "in" | "out" | "both";
      if (hasInput && hasOutput) {
        direction = "both"; // self-transfer or change
      } else if (hasInput) {
        direction = "out"; // we spent cells
      } else {
        direction = "in"; // we received cells
      }

      // Fetch transaction status
      let status = "unknown";
      try {
        const txResponse = await cccClient.getTransaction(tx.txHash);
        if (txResponse) {
          status = txResponse.status;
        }
      } catch {
        // Status lookup failed, keep "unknown"
      }

      records.push({
        txHash: tx.txHash,
        blockNumber: tx.blockNumber,
        txIndex: tx.txIndex,
        direction,
        status,
      });
    }
  } catch (err) {
    console.error("Failed to fetch transaction history:", err);
    // Return empty array rather than throwing — history is non-critical
  }

  return records;
}

// ─── Send CKB ────────────────────────────────────────────────────────────────

/**
 * Builds, signs, and sends a CKB transfer transaction.
 *
 * This uses the CCC SignerCkbPrivateKey which natively handles the standard
 * secp256k1_blake160_sighash_all lock script. The signing flow is:
 * 1. Build a transaction with the desired output
 * 2. The signer's prepareTransaction() adds the secp256k1 cell deps and witness placeholders
 * 3. completeInputsByCapacity() selects input cells to cover the output + fee
 * 4. Calculate change and add change output
 * 5. signOnlyTransaction() signs witness[0] with the private key
 * 6. sendTransaction() submits to the node
 *
 * FEE: Uses hardcoded 1000 shannons. See module header for rationale.
 */
export async function sendCKB(
  privateKey: string,
  toAddress: string,
  amountCKB: string,
  customFee?: bigint
): Promise<SendResult> {
  const fee = customFee ?? DEFAULT_FEE;

  // Parse destination
  const toAddr = await ccc.Address.fromString(toAddress, cccClient);
  const toScript = toAddr.script;

  // Create signer for the sender
  const signer = new ccc.SignerCkbPrivateKey(cccClient, privateKey);

  // Build base transaction with one output to the recipient
  const tx = ccc.Transaction.from({
    outputs: [{ lock: toScript }],
    outputsData: [],
  });

  // Set the output capacity to the requested amount
  const amountShannons = ccc.fixedPointFrom(amountCKB);
  tx.outputs[0].capacity = amountShannons;

  // Get the sender's lock script for input selection and change
  const senderAddresses = await signer.getAddressObjs();
  const senderScript = senderAddresses[0].script;

  // completeInputsByCapacity selects live cells from the sender's address
  // to cover the output amount. The second parameter is the minimum extra
  // capacity needed beyond the outputs — we pass the occupied size of a
  // change cell so there's room for the change output.
  const changeOccupiedSize = ccc.CellOutput.from({
    capacity: BigInt(1000),
    lock: senderScript,
  }).occupiedSize;

  await tx.completeInputsByCapacity(
    signer,
    ccc.fixedPointFrom(changeOccupiedSize)
  );

  // Calculate the leftover capacity after subtracting outputs
  const inputCapacity = await tx.getInputsCapacity(cccClient);
  const outputCapacity = tx.getOutputsCapacity();
  const balanceDiff = inputCapacity - outputCapacity;

  if (balanceDiff > ccc.Zero) {
    // Add change output back to the sender, minus the fee
    tx.addOutput({
      lock: senderScript,
      capacity: balanceDiff - fee,
    });
  }

  // Sign and send using the CCC signer (handles witness preparation internally)
  const txHash = await signer.sendTransaction(tx);
  console.log("Wallet transfer tx hash:", txHash);

  return { txHash };
}

// ─── Transaction Status Polling ──────────────────────────────────────────────

/**
 * Polls the transaction status until it reaches "committed" or times out.
 * Calls the onStatus callback with each status update for UI feedback.
 *
 * CKB transaction lifecycle: sent -> pending -> proposed -> committed
 */
export async function waitForConfirmation(
  txHash: string,
  onStatus: (status: string) => void,
  timeoutMs: number = 60000,
  intervalMs: number = 3000
): Promise<string> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await cccClient.getTransaction(txHash);
      if (response) {
        onStatus(response.status);
        if (
          response.status === "committed" ||
          response.status === "rejected"
        ) {
          return response.status;
        }
      } else {
        onStatus("unknown");
      }
    } catch {
      onStatus("error");
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  onStatus("timeout");
  return "timeout";
}

// ─── Exports for validation constants ────────────────────────────────────────

export { MIN_TRANSFER_CKB, DEFAULT_FEE, SHANNONS_PER_CKB };

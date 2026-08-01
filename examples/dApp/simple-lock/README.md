# CKB Simple Lock Tutorial — Completion & Extension

This document records the full process of completing Nervos CKB's ["Build a Simple Lock"](https://docs.nervos.org/docs/dapp/simple-lock) tutorial on native Windows, along with an extended, hardened version of the contract (`hash-lock-v2`) built to address two security weaknesses identified in the original design.

---

## 1. Environment Setup

| Component | Version |
|---|---|
| OS | Windows (native, no WSL) |
| Node.js | v24.11.1 |
| npm | 11.12.1 |
| Git | 2.52.0 |
| OffCKB CLI | 0.4.10 |
| pnpm | 11.17.0 |

### Developer Workspace & IDE Overview

Below is the Antigravity IDE workspace showing smart contract development with active CKB devnet node synchronization:

![Antigravity IDE & Contract Code](screenshots/01-ide-and-contract-code.png)

![TypeScript Configuration & Terminal](screenshots/02-typescript-config.png)

**Steps taken:**
1. Verified Node.js, npm, and Git installations.
2. Installed the OffCKB CLI globally: `npm install -g @offckb/cli`.
3. Started a local CKB Devnet: `offckb node` — confirmed active block production and indexer sync throughout development.
4. Cloned the tutorial repository and located the actual project at `examples/dApp/simple-lock`.
5. Installed `pnpm` globally and ran `pnpm install`, resolving a build-script approval issue in `pnpm-workspace.yaml` (`allowBuilds`) so that native dependencies (`esbuild`, `secp256k1`) could compile correctly.

---

## 2. Base Contract: `hash-lock`

The original tutorial contract implements a hash-preimage lock: a cell is locked with a committed hash, and can be spent by providing the preimage that hashes to that value.

### Contract Compilation & Build Output

![Contract Bytecode Build](screenshots/03-contract-bytecode-build.png)

**Steps completed:**
- Built the contract: `pnpm run build:contract hash-lock`
- Deployed to Devnet — confirmed on-chain, tx hash: `0x8176c11ad1acab31e87e0ad581c4f4d4dba4ff76b302ea55f4c1e0f0298948db`
- Ran the Next.js frontend (`pnpm run dev`), funded the generated lock address, and completed a **real, successful unlock transaction**:
  - Transaction hash: `0x2180471af683167786a240d60e1316fc7865d28b08b9d86ad0cccc4431524415`
  - Verified via receiver balance change (confirmed with `offckb balance`, +99 CKB)

---

## 3. Security Analysis of `hash-lock`

Two weaknesses were identified through direct review of the contract logic (`contracts/hash-lock/src/index.ts`):

### Weakness 1: No Spender Authentication
The contract only verifies that a provided value hashes to a stored commitment — it performs no check on the identity of the transaction submitter. Any party in possession of the preimage can spend the funds, regardless of whether they are the intended owner.

### Weakness 2: Preimage Reuse Across Cells
Once a preimage is used in a transaction, it is permanently and publicly recorded on-chain. Because the original contract's hash commitment is not bound to any cell-specific data, the same preimage could be used to unlock any other cell sharing the same hash commitment — a meaningful risk in the event of preimage reuse or key mismanagement.

---

## 4. Extended Contract: `hash-lock-v2`

A second contract was implemented — deployed alongside, not replacing, the original — to address both weaknesses.

### Fix 1 — secp256k1 Signature Authentication
The lock script's `args` now include a 20-byte blake160 pubkey hash. Spending requires a valid secp256k1 signature over the transaction's `sighash_all` digest, verified against that pubkey hash using public key recovery. This ties spending rights to possession of a private key, matching the security model used by CKB's standard `secp256k1_blake160_sighash_all` lock.

### Fix 2 — Salted, Per-Cell Hash Commitment
The hash commitment is now computed as `hash(preimage + nonce)`, where `nonce` is a unique 32-byte value stored per cell. Even if a preimage is reused or leaked, the derived hash is unique to each cell, preventing cross-cell replay.

### Args Layout (`hash-lock-v2`)
| Offset | Field | Size |
|---|---|---|
| 0–2 | ckb_js_vm header | 2 bytes |
| 2–34 | code hash | 32 bytes |
| 34–35 | hash type | 1 byte |
| 35–55 | pubkey hash | 20 bytes |
| 55–87 | salted hash commitment | 32 bytes |
| 87–119 | nonce | 32 bytes |

### Deployment & Verification

![Deployment Execution Success](screenshots/09-deployment-success.png)

![Deployment Artifacts Saved](screenshots/11-deployment-artifacts-saved.png)

- Deployed to Devnet — confirmed on-chain, tx hash: `0x0aef0052b4e415db1c4341fb76cd071b94842e62fb42a03871a612b785d5a3ee`
- Built a dedicated frontend route (`/hash-lock-v2`) supporting private key input, automatic pubkey hash derivation, account generation with salted commitments, and signed unlock transactions.
- Completed a **real, successful unlock transaction** exercising both fixes simultaneously:
  - Transaction hash: `0x1dfa993ac5b3da2b127359de00140ec1d540bab889bf57321344a25f1ea7dbfa`
  - Verified via receiver balance change

---

## 5. Bugs Identified & Fixed

### Fixed

| # | Issue | Resolution |
|---|---|---|
| 1 | `scripts/build-contract.js` assumed a Unix environment — incorrect esbuild binary resolution and backslash path handling on Windows, no fallback for a missing standalone `ckb-debugger` binary | Patched to detect Windows, resolve `esbuild.cmd` correctly, normalize paths, and fall back to OffCKB's bundled debugger |
| 2 | `scripts/deploy.js` contained corrupted syntax in the unmodified tutorial repository (confirmed via `git diff` against the original), causing a completely silent failure with no error output | Rewrote the script cleanly, preserving intended CLI argument handling and deploy logic |
| 3 | `frontend/deployment/scripts.json` and `system-scripts.json` were stale placeholder files, disconnected from the actual deployment output at the project root — root cause of a `TransactionFailedToResolve: Unknown OutPoint` error | Diagnosed via direct RPC queries (`get_cells`) comparing live on-chain cells against frontend-referenced outpoints; resolved by syncing the correct deployment artifacts into the frontend's config directory |
| 4 | A `.forEach()` loop combined with `return` created a non-functional safety check — the intended early-exit on insufficient capacity silently failed to halt transaction construction | Replaced with a standard `for` loop using `throw`, applied to both `hash-lock.ts` and `hash-lock-v2.ts`; verified transactions still complete successfully post-fix |

### Attempted, Tested, and Reverted

| # | Issue | Outcome |
|---|---|---|
| 5 | Hardcoded transaction fee (1000 shannons) | Attempted replacement with CCC's `completeFeeBy()` for dynamic fee-rate calculation. Testing revealed this fails on Devnet (`TypeError: Cannot destructure property 'mean' of null`), as Devnet lacks the transaction history required for fee-rate estimation. Reverted via `git revert` to preserve the working hardcoded fee, with the underlying cause documented. |

### Identified, Not Fixed (Documented for Future Work)

| # | Issue | Notes |
|---|---|---|
| 6 | Preimage entered via unmasked `window.prompt()` and logged via `console.log` | Frontend hygiene issue; does not affect on-chain contract security |
| 7 | No input validation in `generateAccount()` | Malformed input could generate a technically valid but permanently unspendable address |
| 8 | No error handling around `sendTransaction()` | Failures surface as raw, unformatted errors rather than clear user-facing messages |
| 9 | Silent fallback to public testnet in `ccc-client.ts` if `NEXT_PUBLIC_NETWORK` is unset | Confirmed not actively impacting this project (`.env` correctly configured), but represents a risky default |

---

## 6. Testing & Deployment Verification Notes

Automated unit tests via `ckb-testtool` require a standalone `ckb-debugger` binary (Rust/Cargo-based), which is not installed by OffCKB on Windows by default. Rather than introduce this additional toolchain dependency, all functionality was verified through direct, live deployment and transaction testing on the local Devnet — including balance checks before and after each transaction to confirm on-chain state changes.

![Deploy Script Diagnostics](screenshots/05-deploy-script-diagnostics.png)

![Git Push Completion](screenshots/04-git-push-completion.png)

---

## 7. Complete Screenshots Gallery (31 Files)

All project walkthrough and code execution screenshots are stored in [`screenshots/`](screenshots/):

| File | Description |
| :--- | :--- |
| [`01-ide-and-contract-code.png`](screenshots/01-ide-and-contract-code.png) | Antigravity IDE editing `hash-lock-v2.ts` with CKB node logs |
| [`02-typescript-config.png`](screenshots/02-typescript-config.png) | `tsconfig.base.json` and terminal workspace |
| [`03-contract-bytecode-build.png`](screenshots/03-contract-bytecode-build.png) | Bytecode compilation output (`hash-lock-v2.bc`) |
| [`04-git-push-completion.png`](screenshots/04-git-push-completion.png) | Git push completion output to GitHub |
| [`05-deploy-script-diagnostics.png`](screenshots/05-deploy-script-diagnostics.png) | Deploy script terminal diagnostics |
| [`06-github-repo-readme.png`](screenshots/06-github-repo-readme.png) | GitHub repository home page |
| [`07-terminal-git-diff.png`](screenshots/07-terminal-git-diff.png) | Terminal git diff inspection |
| [`08-deploy-script-source-tail.png`](screenshots/08-deploy-script-source-tail.png) | `scripts/deploy.js` source inspection |
| [`09-deployment-success.png`](screenshots/09-deployment-success.png) | Deployment completion confirmation |
| [`10-deploy-script-line-inspection.png`](screenshots/10-deploy-script-line-inspection.png) | Line-by-line deploy script output |
| [`11-deployment-artifacts-saved.png`](screenshots/11-deployment-artifacts-saved.png) | Deployment artifacts saved to `deployment/` |
| [`Screenshot (125).png`](screenshots/Screenshot%20(125).png) | Tutorial walkthrough screenshot 125 |
| [`Screenshot (126).png`](screenshots/Screenshot%20(126).png) | Tutorial walkthrough screenshot 126 |
| [`Screenshot (127).png`](screenshots/Screenshot%20(127).png) | Tutorial walkthrough screenshot 127 |
| [`Screenshot (128).png`](screenshots/Screenshot%20(128).png) | Tutorial walkthrough screenshot 128 |
| [`Screenshot (129).png`](screenshots/Screenshot%20(129).png) | Tutorial walkthrough screenshot 129 |
| [`Screenshot (130).png`](screenshots/Screenshot%20(130).png) | Tutorial walkthrough screenshot 130 |
| [`Screenshot (131).png`](screenshots/Screenshot%20(131).png) | Tutorial walkthrough screenshot 131 |
| [`Screenshot (132).png`](screenshots/Screenshot%20(132).png) | Tutorial walkthrough screenshot 132 |
| [`Screenshot (133).png`](screenshots/Screenshot%20(133).png) | Tutorial walkthrough screenshot 133 |
| [`Screenshot (134).png`](screenshots/Screenshot%20(134).png) | Tutorial walkthrough screenshot 134 |
| [`Screenshot (135).png`](screenshots/Screenshot%20(135).png) | Tutorial walkthrough screenshot 135 |
| [`Screenshot (136).png`](screenshots/Screenshot%20(136).png) | Tutorial walkthrough screenshot 136 |
| [`Screenshot (137).png`](screenshots/Screenshot%20(137).png) | Tutorial walkthrough screenshot 137 |
| [`Screenshot (138).png`](screenshots/Screenshot%20(138).png) | Tutorial walkthrough screenshot 138 |
| [`Screenshot (139).png`](screenshots/Screenshot%20(139).png) | Tutorial walkthrough screenshot 139 |
| [`Screenshot (140).png`](screenshots/Screenshot%20(140).png) | Tutorial walkthrough screenshot 140 |
| [`Screenshot (141).png`](screenshots/Screenshot%20(141).png) | Tutorial walkthrough screenshot 141 |
| [`Screenshot (142).png`](screenshots/Screenshot%20(142).png) | Tutorial walkthrough screenshot 142 |
| [`Screenshot (143).png`](screenshots/Screenshot%20(143).png) | Tutorial walkthrough screenshot 143 |
| [`Screenshot (144).png`](screenshots/Screenshot%20(144).png) | Tutorial walkthrough screenshot 144 |

---

## 8. Deliverables Summary

| Deliverable | Status |
|---|---|
| Custom lock script deployed | Done -- `hash-lock` and `hash-lock-v2`, both confirmed on-chain |
| dApp frontend deployed | Done -- Both contracts have working, tested transfer/unlock UIs |
| Security weaknesses identified | Done -- No spender authentication; preimage reuse across cells |
| Security weaknesses addressed | Done -- secp256k1 signature auth; salted per-cell hash commitment |
| Fixes verified on-chain | Done -- Real transactions, confirmed via balance changes |
| Additional bugs found & fixed | Done -- 4 fixed, 1 attempted/reverted with documented cause, 4 identified and documented |
| CKB Devnet Wallet dApp | Done -- Full-featured wallet at `/wallet` route with send, receive, history, dark mode |

---

## 9. CKB Devnet Wallet dApp

A polished, card-based CKB wallet built as a new Next.js route at `frontend/app/wallet/`.

### Features

| Feature | Description |
|---|---|
| Import Wallet | Enter a private key (hex) to derive address, pubkey hash, and balance. Key stored in-memory only (never localStorage). |
| Generate Wallet | Create a random keypair client-side via `crypto.getRandomValues` |
| Dashboard | Live CKB balance with auto-refresh every 10 seconds, truncated address with copy-to-clipboard |
| Send CKB | Recipient address with async validation, amount with min 61 CKB enforcement, optional fee override, confirmation step before signing, post-send tx hash with status polling |
| Receive | Address displayed as text with copy button and QR code (via qrcode.react) |
| Transaction History | Last 10 transactions via CKB indexer `findTransactionsByLock`, showing direction (sent/received/self), block number, and status |
| Dark Mode | Toggle with localStorage persistence, scoped to wallet route |
| Toast Notifications | Custom toast system replacing `alert()` -- success, error, info types with auto-dismiss |
| Loading Skeletons | Shimmer animations while balance and history load |
| Devnet Warning | Dismissible banner warning this is a test-funds-only tool |
| Responsive | Works down to 320px mobile width |

### Architecture

Uses the standard `secp256k1_blake160_sighash_all` lock script (CKB's default lock), not a custom JS-VM lock. CCC's built-in `SignerCkbPrivateKey` handles signing natively -- no manual sighash computation needed (unlike hash-lock-v2).

**Fee strategy**: Uses the same hardcoded 1000 shannons (0.00001 CKB) fee proven working in `hash-lock.ts`. Does NOT use `completeFeeBy()` which crashes on Devnet due to null fee rate statistics.

### File Layout

| File | Purpose |
|---|---|
| `frontend/app/wallet/page.tsx` | Main page component -- import view, dashboard, send/receive/history tabs |
| `frontend/app/wallet/wallet-utils.ts` | All CKB-specific logic -- key derivation, balance, send, history, formatting |
| `frontend/app/wallet/components/Toast.tsx` | Toast notification system (context + provider) |
| `frontend/app/wallet/components/Skeleton.tsx` | Loading skeleton components |
| `frontend/app/wallet/components/CopyButton.tsx` | Click-to-copy with checkmark feedback |
| `frontend/app/wallet/components/HashDisplay.tsx` | Truncated hash/address with expand and copy |
| `frontend/app/wallet/components/DevnetWarning.tsx` | Devnet safety warning banner |

### Dependencies Added

| Package | Version | Purpose |
|---|---|---|
| `lucide-react` | ^1.28.0 | Icon set (send, receive, history, dark mode toggle, etc.) |
| `qrcode.react` | ^4.2.0 | QR code generation for the Receive tab |

### Running

```bash
cd examples/dApp/simple-lock/frontend
pnpm install
pnpm run dev
# Navigate to http://localhost:3000/wallet
```

---

## 10. License

This project is licensed under the [MIT License](LICENSE).

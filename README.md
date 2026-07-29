# CKB Smart Contract Tutorial: Simple Lock & Hash-Lock v2

Welcome to the **CKB JavaScript VM (`ckb-js-vm`) Smart Contract Tutorial**! This project is a full-stack dApp built on the [Nervos CKB (Common Knowledge Base)](https://nervos.org) blockchain, demonstrating how to write, build, test, deploy, and interact with JavaScript/TypeScript smart contracts.

---

## Overview & Architecture

This repository contains two smart contract implementations demonstrating progressive security patterns on CKB:

### 1. Basic Hash-Lock (`v1`)
- **Location**: [`examples/dApp/simple-lock/contracts/hash-lock/src/index.ts`](examples/dApp/simple-lock/contracts/hash-lock/src/index.ts)
- **Mechanism**: Unlocks a cell by providing a secret `preimage` in `WitnessArgs` whose hash matches the `expect_hash` stored in the script arguments (`expect_hash = hashCkb(preimage)`).

### 2. Enhanced Security Hash-Lock (`v2`)
- **Location**: [`examples/dApp/simple-lock/contracts/hash-lock-v2/src/index.ts`](examples/dApp/simple-lock/contracts/hash-lock-v2/src/index.ts)
- **Frontend**: [`examples/dApp/simple-lock/frontend/app/hash-lock-v2.ts`](examples/dApp/simple-lock/frontend/app/hash-lock-v2.ts)
- **Security Enhancements**:
  1. **Signature-Based Authentication**:
     - Stores a 20-byte `pubkey_hash` in script args alongside the commitment.
     - Requires a valid **secp256k1 signature** over the transaction `sighash_all` in the witness, verified against `pubkey_hash`.
  2. **Salted Per-Cell Preimage Commitment**:
     - Fixes preimage reuse across cells by requiring `expect_hash = hashCkb(preimage, nonce)`.
     - Embedded 32-byte `nonce` ensures each locked cell requires a unique, salted hash commitment.

---

## Developer Workspace & IDE Overview

Below is the Antigravity IDE workspace showing smart contract development with active CKB devnet node synchronization:

![Antigravity IDE & Contract Code](examples/dApp/simple-lock/images/media__1785330292636.png)

---

## Project Directory Structure

```text
simple-lock/
├── contracts/                  # CKB Smart Contracts (TypeScript)
│   ├── hash-lock/              # Original Hash-Lock v1
│   │   └── src/index.ts
│   └── hash-lock-v2/           # Enhanced Hash-Lock v2 (Secp256k1 + Salted Nonce)
│       └── src/index.ts
├── dist/                       # Output build directory (.js bundles & .bc bytecodes)
│   ├── hash-lock-v2.js
│   └── hash-lock-v2.bc
├── frontend/                   # Next.js web application & CCC integration
│   └── app/
│       ├── ccc-client.ts       # CKB CCC client initializer
│       ├── hash-lock.ts        # Frontend helper for v1
│       └── hash-lock-v2.ts     # Frontend helper for v2 (Salted lock & signature)
├── scripts/                    # Build, add-contract, and deploy tooling
│   ├── build-contract.js       # Bundles TS to JS & compiles to QuickJS bytecode
│   ├── build-all.js            # Compiles all contracts in /contracts
│   └── deploy.js               # Deploys built bytecode to devnet/testnet/mainnet
├── tests/                      # Jest mock tests using ckb-testtool
│   ├── hash-lock.mock.test.ts
│   └── hash-lock-v2.mock.test.ts
└── pnpm-workspace.yaml         # PNPM workspace configuration
```

---

## Step-by-Step Tutorial Guide

### Step 1: Prerequisites & Installation

Ensure you have **Node.js** (v18+) and **pnpm** installed.

```bash
# Clone the repository
git clone https://github.com/daodudestiny56-netizen/ckb1.git
cd ckb1/examples/dApp/simple-lock

# Install dependencies
pnpm install
```

---

### Step 2: TypeScript & Project Configuration

The project uses ES2022 QuickJS support in `ckb-js-vm` and `tsconfig.base.json` for type safety:

![TypeScript Configuration & Terminal](examples/dApp/simple-lock/images/media__17853302818.png)

---

### Step 3: Compiling Smart Contracts to Bytecode

Contracts are bundled with `esbuild` into JavaScript and then compiled into CKB QuickJS bytecode (`.bc`) using the CKB debugger engine:

```bash
# Build all contracts
pnpm run build

# Or build a specific contract
pnpm run build:contract hash-lock-v2
```

**Build Output Verification**:

![Contract Compilation & Bytecode Output](examples/dApp/simple-lock/images/media__1785330292924.png)

---

### Step 4: Contract Logic Walkthrough (`hash-lock-v2`)

#### Script Args Layout (119 Bytes)
| Offset (Bytes) | Size | Description |
| :--- | :--- | :--- |
| `0..2` | 2 B | `0x0000` (`ckb_js_vm` header prefix) |
| `2..34` | 32 B | `codeHash` of `hash-lock-v2.bc` |
| `34..35` | 1 B | `hashType` of `hash-lock-v2.bc` |
| `35..55` | 20 B | `pubkey_hash` (blake160 hash of owner's compressed secp256k1 public key) |
| `55..87` | 32 B | `expect_hash` (`hashCkb(preimage, nonce)`) |
| `87..119` | 32 B | `nonce` (32-byte cell-specific salt) |

#### Witness Lock Layout
- `0..65` (65 Bytes): secp256k1 signature (`r` [32b], `s` [32b], `recovery` [1b]) over transaction `sighash_all`.
- `65+` (Variable): Secret `preimage` string bytes.

---

### Step 5: Deploying Contracts to CKB Network

Deploy contracts to `devnet`, `testnet`, or `mainnet` using `scripts/deploy.js`:

```bash
# Deploy to local devnet
node scripts/deploy.js

# Deploy to testnet with custom private key
pnpm run deploy -- --network testnet --privkey 0x...
```

**Deployment Diagnostics & Logs**:

![Deploy Script & Runtime Diagnostics](examples/dApp/simple-lock/images/media__1785330293081.png)

---

### Step 6: Version Control & GitHub Synchronization

Once contract modifications are complete and verified, push your updates to your GitHub repository:

```bash
# Stage and commit changes
git add .
git commit -m "feat: add hash-lock-v2 contract with secp256k1 signature authentication and salted preimage commitments"

# Push to remote repository
git push https://github.com/daodudestiny56-netizen/ckb1.git HEAD:main --force
```

**Git Push Completion**:

![Git Push & Deployment Verification](examples/dApp/simple-lock/images/media__1785330292994.png)

---

## Available NPM / PNPM Commands

| Command | Description |
| :--- | :--- |
| `pnpm run build` | Compiles all contracts in `contracts/` to `dist/` |
| `pnpm run build:contract <name>` | Compiles a single contract by name |
| `pnpm test` | Runs Jest mock tests via `ckb-testtool` |
| `pnpm run add-contract <name>` | Scaffolds a new contract directory & test file |
| `pnpm run deploy` | Deploys built `.bc` files using `offckb` |
| `pnpm run format` | Formats code with Prettier |

---

## Key Learning Takeaways

1. **Cell Model Security**: In UTXO / Cell blockchains like CKB, exposing an unsalted preimage on-chain allows front-runners to copy the preimage and spend the cell first. Adding a cell-specific `nonce` prevents preimage reuse across cells.
2. **Double-Authentication Pattern**: Combining `pubkey_hash` signature verification with `preimage` validation creates robust multi-factor locks for CKB dApps.
3. **JavaScript VM Flexibility**: `ckb-js-vm` allows developers to leverage standard TypeScript libraries (`@ckb-js-std/core`, `@noble/curves`, `@ckb-ccc/core`) directly on the CKB Layer-1 blockchain.

---

## License

This project is licensed under the [MIT License](LICENSE).

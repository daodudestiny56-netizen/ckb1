#!/usr/bin/env node
/**
 * Deploy script for CKB contracts
 *
 * This script deploys all built contracts using the offckb deploy command.
 *
 * Fixed parameters:
 * - target: dist/ (where all built contracts are located)
 * - output: deployment/ (where deployment artifacts are saved)
 *
 * Command line arguments accepted:
 * - --network: Network to deploy to (devnet, testnet, mainnet) - defaults to devnet
 * - --privkey: Private key for deployment - defaults to offckb's deployer account
 * - --type-id: Whether to use upgradable type id - defaults to false
 */
import { spawn } from "child_process";
import fs from "fs";

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { network: "devnet", privkey: null, typeId: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--network" && i + 1 < args.length) {
      parsed.network = args[i + 1];
      i++;
    } else if (arg === "--privkey" && i + 1 < args.length) {
      parsed.privkey = args[i + 1];
      i++;
    } else if (arg === "--type-id" || arg === "-t") {
      parsed.typeId = true;
    }
  }
  return parsed;
}

function main() {
  const TARGET = "dist";
  const OUTPUT = "deployment";
  const options = parseArgs();
  const NETWORK = options.network;
  const PRIVKEY = options.privkey;
  const TYPE_ID = options.typeId;

  if (!fs.existsSync(TARGET)) {
    console.error(`Target directory "${TARGET}" does not exist. Run "pnpm run build" first.`);
    process.exit(1);
  }

  console.log(`Deploying contracts from: ${TARGET}`);
  console.log(`Network: ${NETWORK}`);
  console.log(`Output: ${OUTPUT}`);

  const args = ["deploy", "--target", TARGET, "--output", OUTPUT, "--network", NETWORK];
  if (PRIVKEY) {
    args.push("--privkey", PRIVKEY);
  }
  if (TYPE_ID) {
    args.push("--type-id");
  }

  const offckbCmd = process.platform === "win32" ? "offckb.cmd" : "offckb";

  const deployProcess = spawn(offckbCmd, args, {
    stdio: "inherit",
    shell: true,
  });

  deployProcess.on("close", (code) => {
    if (code === 0) {
      console.log("");
      console.log("Deployment completed successfully!");
      console.log(`Deployment artifacts saved to: ${OUTPUT}/`);
      console.log("");
      console.log("Next steps:");
      console.log("   - Check the deployment artifacts in the deployment/ folder");
      console.log("   - Run your tests to use the deployed contract scripts");
    } else {
      console.error("");
      console.error(`Deployment failed with exit code: ${code}`);
      process.exit(code);
    }
  });

  deployProcess.on("error", (error) => {
    console.error(`Failed to start deployment process: ${error.message}`);
    process.exit(1);
  });
}

main();

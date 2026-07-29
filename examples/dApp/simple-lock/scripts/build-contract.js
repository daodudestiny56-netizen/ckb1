#!/usr/bin/env node

import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

function getOffckbCliPath() {
  try {
    return require.resolve("@offckb/cli/build/index.js");
  } catch {
    const globalAppData = process.env.APPDATA;
    if (globalAppData) {
      const fallback = path.join(globalAppData, "npm", "node_modules", "@offckb", "cli", "build", "index.js");
      if (fs.existsSync(fallback)) return fallback;
    }
  }
  return null;
}

function buildContract(contractName) {
  if (!contractName) {
    console.error("Usage: node build-contract.js <contract-name>");
    process.exit(1);
  }

  const contractDir = path.join("contracts", contractName);
  const srcDir = path.join(contractDir, "src");
  const distDir = path.join("dist");

  // Check if contract exists
  if (!fs.existsSync(contractDir)) {
    console.error(
      `Contract '${contractName}' not found in contracts directory!`,
    );
    process.exit(1);
  }

  // Find the main source file (index.ts or index.js)
  let srcFile;
  const tsFile = path.join(srcDir, "index.ts");
  const jsFile = path.join(srcDir, "index.js");

  if (fs.existsSync(tsFile)) {
    srcFile = tsFile;
  } else if (fs.existsSync(jsFile)) {
    srcFile = jsFile;
  } else {
    console.error(`No index.ts or index.js found in ${srcDir}`);
    process.exit(1);
  }

  // Ensure global dist directory exists
  fs.mkdirSync(distDir, { recursive: true });

  const outputJsFile = path.join(distDir, `${contractName}.js`).replace(/\\/g, '/');
  const outputBcFile = path.join(distDir, `${contractName}.bc`).replace(/\\/g, '/');
  const binFile = "node_modules/ckb-testtool/src/unittest/defaultScript/ckb-js-vm";

  console.log(`Building ${contractName} from ${srcFile}...`);

  try {
    // Step 1: TypeScript type checking (if TypeScript file) - temporarily disabled due to @ckb-ccc/core version conflicts
    // if (srcFile.endsWith('.ts')) {
    //   console.log('  🔍 Type checking...');
    //   execSync(`./node_modules/.bin/tsc --noEmit --project .`, { stdio: 'pipe' });
    // }

    const esbuildBin = process.platform === "win32"
      ? path.join("node_modules", ".bin", "esbuild.cmd")
      : "./node_modules/.bin/esbuild";

    const esbuildCmd = [
      `"${esbuildBin}"`,
      "--platform=neutral",
      "--minify",
      "--bundle",
      "--external:@ckb-js-std/bindings",
      "--target=es2022",
      srcFile,
      `--outfile=${outputJsFile}`,
    ].join(" ");

    execSync(esbuildCmd, { stdio: "pipe" });

    // Step 3: Compile to bytecode with ckb-debugger or offckb debugger
    console.log("  🔧 Compiling to bytecode...");
    let debuggerCmd;
    try {
      execSync("ckb-debugger --version", { stdio: "ignore" });
      debuggerCmd = [
        "ckb-debugger",
        `--read-file ${outputJsFile}`,
        `--bin ${binFile}`,
        "--",
        "-c",
        outputBcFile,
      ].join(" ");
    } catch {
      const offckbCliPath = getOffckbCliPath();
      if (offckbCliPath) {
        debuggerCmd = [
          `node "${offckbCliPath}" debugger`,
          `--read-file ${outputJsFile}`,
          `--bin ${binFile}`,
          "--",
          "-c",
          outputBcFile,
        ].join(" ");
      } else {
        debuggerCmd = [
          "offckb debugger --",
          `--read-file ${outputJsFile}`,
          `--bin ${binFile}`,
          "--",
          "-c",
          outputBcFile,
        ].join(" ");
      }
    }

    execSync(debuggerCmd, { stdio: "pipe" });

    console.log(`  ✅ Contract '${contractName}' built successfully!`);
    console.log(`     📄 JavaScript: ${outputJsFile}`);
    console.log(`     🔗 Bytecode: ${outputBcFile}`);
  } catch (error) {
    console.error(`❌ Build failed for '${contractName}':`, error.message);
    process.exit(1);
  }
}

// Get contract name from command line arguments
const contractName = process.argv[2];
buildContract(contractName);

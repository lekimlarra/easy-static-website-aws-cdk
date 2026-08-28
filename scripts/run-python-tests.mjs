#!/usr/bin/env node
// Runs the unittest suite of the python lambdas.
//
//   npm run test:python
//
// The interpreter is called "python3" on most Linux and macOS installs and
// "python" on Windows, so both are tried before giving up.
import { spawnSync } from "node:child_process";

const args = ["-m", "unittest", "discover", "-s", "test", "-p", "test_*.py"];
const candidates = process.platform === "win32" ? ["python", "python3"] : ["python3", "python"];

for (const interpreter of candidates) {
  const result = spawnSync(interpreter, args, { stdio: "inherit", shell: process.platform === "win32" });
  // ENOENT means this interpreter is not installed; anything else is a real run.
  if (result.error?.code === "ENOENT") continue;
  if (result.error) {
    console.error(`Could not run "${interpreter}": ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

console.error(`No Python interpreter found (tried: ${candidates.join(", ")}). Python is needed to run the lambda tests and to install their requirements.`);
process.exit(1);

#!/usr/bin/env node
// One command bootstrap for a fresh clone:
//
//   npm run setup             creates .env from the template and installs deps
//   npm run setup -- --no-install   only takes care of the .env file
//
// It never overwrites an existing .env; instead it reports the keys that the
// template has and your file is missing, which is what happens after pulling a
// change that introduces a new setting.
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
// Deliberately not from env.mjs: that module imports dotenv, and on a fresh
// clone there is no node_modules for it to come from yet. The bootstrap has to
// be able to run before the thing it bootstraps.
import { repoRoot, envFile, envTemplateFile } from "./paths.mjs";

const skipInstall = process.argv.includes("--no-install");
const websiteDir = path.join(repoRoot, "resources", "react-website");

const keysOf = (contents) =>
  contents
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([\w.-]+)\s*=/))
    .filter(Boolean)
    .map((match) => match[1]);

if (!fs.existsSync(envTemplateFile)) {
  console.error(`Missing ${envTemplateFile}. It is the reference for every setting of the project.`);
  process.exit(1);
}

if (fs.existsSync(envFile)) {
  const missing = keysOf(fs.readFileSync(envTemplateFile, "utf8")).filter((key) => !keysOf(fs.readFileSync(envFile, "utf8")).includes(key));
  console.log(".env already exists, leaving it untouched.");
  if (missing.length > 0) {
    console.log("\nThese keys exist in .env.template but not in your .env:");
    for (const key of missing) console.log(`  - ${key}`);
    console.log("Add them to keep your configuration up to date.");
  }
} else {
  fs.copyFileSync(envTemplateFile, envFile);
  console.log(`Created ${envFile} from .env.template. Edit it with your own values.`);
}

if (!skipInstall) {
  for (const directory of [repoRoot, websiteDir]) {
    if (!fs.existsSync(path.join(directory, "package.json"))) continue;
    console.log(`\nInstalling dependencies in ${path.relative(repoRoot, directory) || "."} ...`);
    const options = { cwd: directory, stdio: "inherit", shell: process.platform === "win32" };
    const lockfile = fs.existsSync(path.join(directory, "package-lock.json"));
    if (!lockfile) {
      execFileSync("npm", ["install"], options);
      continue;
    }
    try {
      execFileSync("npm", ["ci"], options);
    } catch {
      // "npm ci" refuses to install when the lock file does not describe the
      // tree that this platform and this npm version resolve. The optional
      // native and wasm bindings that jest and swc carry for every
      // architecture are the usual reason, so the same lock file is accepted
      // on the machine that wrote it and rejected on the next one. That is a
      // stale lock file, not a broken checkout, and it also leaves the clone
      // with no node_modules at all, because "npm ci" empties the folder
      // before it gives up. Carrying on is far more useful than a stack trace.
      console.warn('\n"npm ci" would not accept the lock file. Falling back to "npm install".');
      console.warn("If package-lock.json changes, commit it: it was out of date.\n");
      execFileSync("npm", ["install"], options);
    }
  }
}

console.log(`
Next steps:
  1. Edit .env with your bucket name, region, budget email...
  2. npm run check:env      verify the configuration
  3. aws sso login          (or "npm run login") to get local credentials
  4. cdk bootstrap          only once per account/region
  5. npm run mydeploy       build the website and deploy the stack
`);

#!/usr/bin/env node
// Runs a command with the project's AWS configuration already applied.
//
//   node scripts/aws-exec.mjs cdk deploy --require-approval never
//   node scripts/aws-exec.mjs aws s3 sync "{{websiteDistPath}}" "s3://{{bucketName}}"
//
// Why this exists: the npm scripts used to hardcode "--profile proyectoCDK",
// which works on one laptop and nowhere else. Here the profile (and the region)
// come from .env locally and from the runner's credentials in CI, so the very
// same npm script is what GitHub Actions executes.
//
// Any "{{variableName}}" inside an argument is replaced with the corresponding
// environment variable, which keeps bucket names and paths out of package.json.
import { spawn } from "node:child_process";
import { loadEnv } from "./env.mjs";

loadEnv();

const [command, ...rawArgs] = process.argv.slice(2);
if (!command) {
  console.error("Usage: node scripts/aws-exec.mjs <command> [args...]");
  process.exit(1);
}

const missing = new Set();
const expand = (value) =>
  value.replace(/\{\{(\w+)\}\}/g, (_match, name) => {
    const replacement = process.env[name];
    if (!replacement) missing.add(name);
    return replacement ?? "";
  });

const args = rawArgs.map(expand);
if (missing.size > 0) {
  console.error(`Missing environment variable(s): ${[...missing].join(", ")}.\n` + `Set them in .env (see .env.template) or as GitHub repository variables/secrets.`);
  process.exit(1);
}

// On Windows the AWS and CDK entry points are .cmd shims, which Node refuses to
// spawn without a shell; everywhere else we avoid the shell so that arguments
// such as "*.js" reach the command untouched.
const useShell = process.platform === "win32";
const quote = (value) => (useShell && /[\s*?"]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value);

const child = spawn(useShell ? quote(command) : command, useShell ? args.map(quote) : args, {
  stdio: "inherit",
  shell: useShell,
});

child.on("error", (error) => {
  console.error(`Could not run "${command}": ${error.message}`);
  process.exit(1);
});
child.on("exit", (code, signal) => process.exit(signal ? 1 : (code ?? 1)));

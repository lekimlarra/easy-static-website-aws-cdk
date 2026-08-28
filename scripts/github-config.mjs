#!/usr/bin/env node
// Prints your local configuration split into the two blocks GitHub Actions
// expects, ready to be pasted:
//
//   npm run github:config
//
// The values are read from your own .env, so whatever already deploys from
// your laptop is what the workflows will use. The second block contains
// sensitive values: it goes into a repository *secret*, never a variable.
import * as fs from "node:fs";
import { envFile } from "./env.mjs";

// Keys that identify or notify you, or that expose the account id.
const SENSITIVE = ["awsAccountId", "httpCertificate", "notificationEmail"];
// Keys that only make sense on a developer machine.
const LOCAL_ONLY = ["awsProfile"];

if (!fs.existsSync(envFile)) {
  console.error(`No .env file found at ${envFile}. Run "npm run setup" first.`);
  process.exit(1);
}

const entries = fs
  .readFileSync(envFile, "utf8")
  .split(/\r?\n/)
  .map((line) => line.match(/^\s*([\w.-]+)\s*=(.*)$/))
  .filter(Boolean)
  .map((match) => [match[1], match[2].trim()])
  .filter(([key, value]) => value !== "" && !LOCAL_ONLY.includes(key));

const config = entries.filter(([key]) => !SENSITIVE.includes(key));
const secrets = entries.filter(([key]) => SENSITIVE.includes(key));

const block = (pairs) => pairs.map(([key, value]) => `${key}=${value}`).join("\n");

// A runner has no default region and no ambient account, so these two are not
// optional there even when a local deploy works without them.
const requiredInCi = ["awsRegion", "awsAccountId", "bucketName"];
const missing = requiredInCi.filter((key) => !entries.some(([name]) => name === key));

console.log(`
=== APP_CONFIG =============================================================
Settings > Secrets and variables > Actions > Variables > New repository variable
Name: APP_CONFIG
Value:

${block(config)}

=== APP_SECRETS ============================================================
Settings > Secrets and variables > Actions > Secrets > New repository secret
Name: APP_SECRETS
Value:

${block(secrets)}

============================================================================
Still missing, and not derived from .env:
  AWS_ROLE_ARN  the IAM role GitHub assumes through OIDC (see the README).

Left out on purpose: ${LOCAL_ONLY.join(", ")} (a runner has no AWS profile).${missing.length > 0 ? `\n\nAdd these to your .env before pasting, a runner cannot infer them:\n  ${missing.join("\n  ")}` : ""}`);

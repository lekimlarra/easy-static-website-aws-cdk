// Shared environment handling for every npm script in this project.
//
// The golden rule: values already present in process.env always win over the
// .env file. dotenv behaves like that by default, and it is what lets GitHub
// Actions inject the configuration through its own `env:` block while local
// developers keep using a .env file. Nothing in the repo has to know which of
// the two is in play.
import * as fs from "node:fs";
import dotenv from "dotenv";
import { envFile, envTemplateFile } from "./paths.mjs";

// Re-exported so that every other script goes on importing them from here,
// while the bootstrap can take them from a module that needs no dependencies.
export { repoRoot, envFile, envTemplateFile } from "./paths.mjs";

/** True when the process already carries AWS credentials (CI, SSO exports...). */
export function hasAmbientCredentials() {
  return Boolean(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_SESSION_TOKEN || process.env.AWS_WEB_IDENTITY_TOKEN_FILE || process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI);
}

/**
 * Translates the project's own variable names (awsProfile, awsRegion...) into
 * the standard AWS_* variables the AWS CLI and the CDK CLI understand.
 */
export function applyAwsEnv() {
  const { awsProfile, awsRegion, awsAccountId } = process.env;

  // A profile is a local-machine concept. If credentials are already in the
  // environment (that is what configure-aws-credentials does on a runner),
  // forcing AWS_PROFILE would point the CLI at a profile that does not exist.
  if (awsProfile && !process.env.AWS_PROFILE && !hasAmbientCredentials()) {
    process.env.AWS_PROFILE = awsProfile;
  }
  if (awsRegion) {
    process.env.AWS_REGION ??= awsRegion;
    process.env.AWS_DEFAULT_REGION ??= awsRegion;
    process.env.CDK_DEFAULT_REGION ??= awsRegion;
  }
  if (awsAccountId) {
    process.env.CDK_DEFAULT_ACCOUNT ??= awsAccountId;
  }
}

/**
 * Drops project variables that are present but empty.
 *
 * A GitHub Actions `env:` entry fed by an undefined repository variable ends up
 * as an empty string, and dotenv would then consider the key "already set" and
 * skip the value coming from .env. Removing the empty ones first keeps .env as
 * the fallback and real overrides as overrides.
 */
function dropEmptyProjectVars() {
  if (!fs.existsSync(envTemplateFile)) return;
  const knownKeys = fs
    .readFileSync(envTemplateFile, "utf8")
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([\w.-]+)\s*=/))
    .filter(Boolean)
    .map((match) => match[1]);
  for (const key of knownKeys) {
    if (process.env[key] === "") delete process.env[key];
  }
}

/** Loads .env (when present) and normalises the AWS variables. */
export function loadEnv() {
  dropEmptyProjectVars();
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, quiet: true });
  }
  applyAwsEnv();
  return process.env;
}

/** Reads a variable and fails loudly instead of deploying something wrong. */
export function requireEnv(name, hint = "") {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable "${name}".${hint ? ` ${hint}` : ""}\n` + `Set it in your .env file (see .env.template) or as a GitHub repository variable/secret.`);
  }
  return value;
}

export const stackName = () => process.env.stackName || "ReactCdkBaseProjectStack";

#!/usr/bin/env node
// Invalidates the CloudFront cache after a website upload.
//
//   npm run cacheInvalidation
//
// The distribution id is read from cloudFrontDistributionId when set and is
// otherwise resolved from the CloudFormation stack outputs, so nothing has to
// be hardcoded and the script works unchanged on a runner.
import { execFileSync } from "node:child_process";
import { loadEnv, stackName } from "./env.mjs";

loadEnv();

const runAws = (args) => execFileSync("aws", args, { encoding: "utf8", shell: process.platform === "win32" }).trim();

let distributionId = (process.env.cloudFrontDistributionId ?? "").trim();

if (!distributionId) {
  console.log(`Looking up the distribution id in the outputs of stack "${stackName()}"...`);
  try {
    distributionId = runAws(["cloudformation", "describe-stacks", "--stack-name", stackName(), "--query", "Stacks[0].Outputs[?OutputKey=='CloudFrontDistributionId'].OutputValue", "--output", "text"]);
  } catch (error) {
    console.error(`Could not read the stack outputs: ${error.message}`);
    process.exit(1);
  }
}

if (!distributionId || distributionId === "None") {
  console.error("No CloudFront distribution id available.\n" + "Deploy the stack first, or set cloudFrontDistributionId in your configuration.");
  process.exit(1);
}

console.log(`Invalidating /* on distribution ${distributionId} ...`);
const invalidationId = runAws(["cloudfront", "create-invalidation", "--distribution-id", distributionId, "--paths", "/*", "--query", "Invalidation.Id", "--output", "text"]);
console.log(`Invalidation ${invalidationId} created.`);

#!/usr/bin/env node
// Prints the CloudFormation outputs of the stack as a Markdown table.
//
//   npm run outputs
//
// In GitHub Actions the table is appended to the job summary, so the URLs of a
// deploy are visible from the run page without digging into the logs.
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import { loadEnv, stackName } from "./env.mjs";

loadEnv();

let outputs = [];
try {
  const raw = execFileSync("aws", ["cloudformation", "describe-stacks", "--stack-name", stackName(), "--query", "Stacks[0].Outputs", "--output", "json"], { encoding: "utf8", shell: process.platform === "win32" });
  outputs = JSON.parse(raw || "[]") ?? [];
} catch (error) {
  console.error(`Could not read the outputs of stack "${stackName()}": ${error.message}`);
  process.exit(1);
}

// Endpoint outputs are one per lambda and only add noise to a summary.
const interesting = ["CloudFrontUrl", "CustomDomainUrls", "BucketUrl", "BucketName", "CloudFrontDistributionId", "APIURL", "UserPoolId", "UserPoolClientId"];
const rows = outputs.filter((output) => interesting.includes(output.OutputKey)).sort((a, b) => interesting.indexOf(a.OutputKey) - interesting.indexOf(b.OutputKey));

const table = [`### Stack \`${stackName()}\``, "", "| Output | Value |", "| --- | --- |", ...rows.map((row) => `| ${row.OutputKey} | ${row.OutputValue} |`), ""].join("\n");

console.log(table);
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
}

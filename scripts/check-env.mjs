#!/usr/bin/env node
// Validates the configuration before anything is deployed.
//
//   npm run check:env
//
// Runs identically against a local .env file and against the variables GitHub
// Actions injects, so a missing repository variable fails in a few seconds with
// a clear message instead of half way through a CloudFormation update.
import { loadEnv, envFile, stackName } from "./env.mjs";
import * as fs from "node:fs";

loadEnv();

const isTrue = (name) => process.env[name] === "true";
// deployWebsiteWithCdk keeps the historical behaviour when it is not set at all.
const deployWebsiteWithCdk = (process.env.deployWebsiteWithCdk ?? "true") !== "false";
const value = (name) => (process.env[name] ?? "").trim();

const required = [
  ["awsRegion", "Region to deploy to, e.g. eu-west-3."],
  ["bucketName", "Globally unique S3 bucket name for the website."],
  ["restApiName", "Name of the API Gateway REST API."],
  ["budgetName", "Name of the AWS budget."],
  ["notificationEmail", "Email that receives the budget alerts."],
  ["tagName", "Project tag applied to every resource."],
];

if (isTrue("createCognito")) {
  required.push(["userPoolName", "Required because createCognito=true."], ["userPoolClientName", "Required because createCognito=true."], ["yourDomain", "Required because createCognito=true: it builds the Cognito callback URLs."]);
}
if (value("customDomainNames")) {
  required.push(["httpCertificate", "Required to serve customDomainNames: an ACM certificate ARN issued in us-east-1."]);
}
if (isTrue("createDnsRecord")) {
  required.push(["hostedZoneDomain", "Required because createDnsRecord=true: the Route 53 hosted zone to write into."], ["customDomainNames", "Required because createDnsRecord=true: the record has to match a CloudFront alias."], ["awsAccountId", "Required because createDnsRecord=true: hosted zone lookups need an explicit account."]);
}
if (!deployWebsiteWithCdk) {
  required.push(["websiteDistPath", 'Required because deployWebsiteWithCdk=false: the folder "npm run s3deploy" uploads.']);
}

const missing = required.filter(([name]) => !value(name));
const warnings = [];

if (value("httpCertificate") && !value("httpCertificate").startsWith("arn:aws:acm:us-east-1:")) {
  warnings.push('httpCertificate should be an ACM certificate ARN issued in "us-east-1": CloudFront accepts no other region.');
}
if (/ACCOUNT|UUID|your-bucket-name-here|your-custom-url|your-email@/.test(Object.values(process.env).join(" "))) {
  warnings.push("Some values still look like the placeholders from .env.template.");
}
if (!isTrue("appDeployedOnce")) {
  warnings.push('appDeployedOnce is not "true": the budget will be created by this deploy. Set it to "true" afterwards or the next deploy will fail.');
}
if (!fs.existsSync(envFile) && !process.env.CI) {
  warnings.push(`No .env file found at ${envFile}. Run "npm run setup" to create one from .env.template.`);
}

console.log(`Stack:   ${stackName()}`);
console.log(`Region:  ${value("awsRegion") || "(not set)"}`);
console.log(`Account: ${value("awsAccountId") || "(resolved from the current credentials)"}`);
console.log(`Bucket:  ${value("bucketName") || "(not set)"}`);
console.log(`Website upload: ${deployWebsiteWithCdk ? "CDK BucketDeployment" : 'AWS CLI ("npm run s3deploy")'}`);

for (const warning of warnings) console.warn(`WARNING  ${warning}`);

if (missing.length > 0) {
  console.error("\nMissing configuration:");
  for (const [name, hint] of missing) console.error(`  - ${name}: ${hint}`);
  console.error("\nSet them in .env (see .env.template) or as GitHub repository variables/secrets.");
  process.exit(1);
}

console.log("\nConfiguration looks good.");

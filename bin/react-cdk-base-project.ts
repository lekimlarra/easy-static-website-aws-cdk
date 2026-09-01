#!/usr/bin/env node
import "./load-env"; // must stay first: populates process.env for the constructs below
import * as cdk from "aws-cdk-lib";
import { ReactCdkBaseProjectStack } from "../lib/react-cdk-base-project-stack";
const tagName = process.env.tagName ?? "react-cdk-base-project";
// Changing stackName after the first deploy creates a brand new stack: the name
// is also the root construct id, so every logical id in the template changes.
const stackName = process.env.stackName ?? "ReactCdkBaseProjectStack";

/* Binding the stack to an account and a region is what makes environment
 * lookups possible (the Route 53 hosted zone below, for example). Both values
 * fall back to whatever the CDK CLI resolved from the active credentials, so a
 * plain "cdk deploy" keeps working without extra configuration. */
const account = process.env.awsAccountId || process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.awsRegion || process.env.CDK_DEFAULT_REGION;

const app = new cdk.App();
const stack = new ReactCdkBaseProjectStack(app, stackName, {
  env: { account, region },
});
cdk.Tags.of(stack).add("Project", tagName);

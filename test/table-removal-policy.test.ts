import { Template } from "aws-cdk-lib/assertions";

// The constructs under lib/ read their configuration from process.env when the
// module is first evaluated, so every case has to reset the module registry and
// set the variables before requiring the stack.
const BASE_ENV: Record<string, string> = {
  bucketName: "test-bucket-for-unit-tests",
  restApiName: "test-api",
  budgetName: "test-budget",
  snsTopicName: "test-topic",
  notificationEmail: "someone@example.com",
  tagName: "test-project",
  appDeployedOnce: "true",
  apiProdBasePath: "api",
  apiKeyName: "test-api-key",
  openApiExportType: "yaml",
  // Keeps the stack synthesizable without a built website in the working tree.
  deployWebsiteWithCdk: "false",
  createCognito: "false",
};

function synth(overrides: Record<string, string> = {}): Template {
  jest.resetModules();
  for (const key of [...Object.keys(BASE_ENV), "tableRemovalPolicy"]) delete process.env[key];
  Object.assign(process.env, BASE_ENV, overrides);

  const cdk = require("aws-cdk-lib");
  const { ReactCdkBaseProjectStack } = require("../lib/react-cdk-base-project-stack");
  const app = new cdk.App();
  const stack = new ReactCdkBaseProjectStack(app, "TestStack", {
    env: { account: "111122223333", region: "eu-west-3" },
  });
  return Template.fromStack(stack);
}

function deletionPolicies(template: Template): string[] {
  return Object.values(template.findResources("AWS::DynamoDB::Table")).map((resource: any) => resource.DeletionPolicy);
}

describe("tableRemovalPolicy", () => {
  test("keeps the tables when it is not set", () => {
    const policies = deletionPolicies(synth());
    expect(policies.length).toBeGreaterThan(0);
    expect(policies.every((policy) => policy === "Retain")).toBe(true);
  });

  // Retaining orphans the tables when a deploy fails after creating them, and
  // every retry then stops with "already exists". This is the way out while the
  // project is still disposable.
  test('lets the tables go with the stack on "destroy"', () => {
    const policies = deletionPolicies(synth({ tableRemovalPolicy: "destroy" }));
    expect(policies.length).toBeGreaterThan(0);
    expect(policies.every((policy) => policy === "Delete")).toBe(true);
  });

  test("is not case or whitespace sensitive", () => {
    expect(deletionPolicies(synth({ tableRemovalPolicy: " DESTROY " }))).toContain("Delete");
  });

  // Getting the value wrong must never be what deletes a table.
  test.each(["", "retain", "whatever", "true"])('keeps the tables on "%s"', (value) => {
    expect(deletionPolicies(synth({ tableRemovalPolicy: value }))).not.toContain("Delete");
  });
});

import { Template, Match } from "aws-cdk-lib/assertions";

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

const REGION = "eu-west-3";
const DOMAIN_KEYS = ["apiDomainName", "apiCertificate", "hostedZoneDomain", "apiDnsRecordName", "createApiDnsRecord"];

function synth(overrides: Record<string, string> = {}): Template {
  jest.resetModules();
  for (const key of [...Object.keys(BASE_ENV), ...DOMAIN_KEYS]) delete process.env[key];
  Object.assign(process.env, BASE_ENV, overrides);

  const cdk = require("aws-cdk-lib");
  const { ReactCdkBaseProjectStack } = require("../lib/react-cdk-base-project-stack");
  const app = new cdk.App();
  const stack = new ReactCdkBaseProjectStack(app, "TestStack", {
    env: { account: "111122223333", region: REGION },
  });
  return Template.fromStack(stack);
}

const VALID_CERTIFICATE = `arn:aws:acm:${REGION}:111122223333:certificate/11111111-2222-3333-4444-555555555555`;

describe("Without an API custom domain", () => {
  // The state of a project that has not bought its API domain yet: the deploy
  // has to work and keep answering on the *.execute-api.amazonaws.com URL.
  test("no API Gateway domain name is created", () => {
    const template = synth();
    template.resourceCountIs("AWS::ApiGateway::DomainName", 0);
  });

  test("an unusable certificate is ignored while no domain uses it", () => {
    expect(() => synth({ apiCertificate: "arn:aws:acm:eu-west-3:ACCOUNT:certificate/UUID" })).not.toThrow();
  });
});

describe("With an API custom domain", () => {
  test("the domain and the regional certificate reach the API Gateway domain name", () => {
    const template = synth({ apiDomainName: "api.example.com", apiCertificate: VALID_CERTIFICATE });
    template.hasResourceProperties("AWS::ApiGateway::DomainName", {
      DomainName: "api.example.com",
      RegionalCertificateArn: VALID_CERTIFICATE,
    });
    template.resourceCountIs("AWS::ApiGateway::BasePathMapping", 1);
  });

  test("refuses to synthesize without a certificate", () => {
    expect(() => synth({ apiDomainName: "api.example.com" })).toThrow(/apiCertificate is empty/);
  });

  // What actually happens: httpCertificate's us-east-1 ARN gets pasted here by
  // mistake, because that is the region CloudFront insists on. API Gateway's
  // REGIONAL domain needs the opposite: the stack's own region.
  test("refuses a certificate issued outside the stack's own region", () => {
    const wrongRegion = VALID_CERTIFICATE.replace(REGION, "us-east-1");
    expect(() => synth({ apiDomainName: "api.example.com", apiCertificate: wrongRegion })).toThrow(/not a certificate ARN this API Gateway domain can use/);
  });

  test("refuses createApiDnsRecord without a hosted zone", () => {
    expect(() => synth({ apiDomainName: "api.example.com", apiCertificate: VALID_CERTIFICATE, createApiDnsRecord: "true" })).toThrow(/hostedZoneDomain is empty/);
  });
});

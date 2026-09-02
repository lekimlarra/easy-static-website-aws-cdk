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

const DOMAIN_KEYS = ["customDomainNames", "httpCertificate", "hostedZoneDomain", "dnsRecordName", "createDnsRecord"];

function synth(overrides: Record<string, string> = {}): Template {
  jest.resetModules();
  for (const key of [...Object.keys(BASE_ENV), ...DOMAIN_KEYS]) delete process.env[key];
  Object.assign(process.env, BASE_ENV, overrides);

  const cdk = require("aws-cdk-lib");
  const { ReactCdkBaseProjectStack } = require("../lib/react-cdk-base-project-stack");
  const app = new cdk.App();
  const stack = new ReactCdkBaseProjectStack(app, "TestStack", {
    env: { account: "111122223333", region: "eu-west-3" },
  });
  return Template.fromStack(stack);
}

const VALID_CERTIFICATE = "arn:aws:acm:us-east-1:111122223333:certificate/11111111-2222-3333-4444-555555555555";

describe("Without a custom domain", () => {
  // The state of a project that has not bought its domain yet, and the one the
  // .env template ships: the deploy has to work and be served on cloudfront.net.
  test("the distribution carries no domain and no certificate", () => {
    const template = synth();
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        Aliases: Match.absent(),
        ViewerCertificate: Match.absent(),
      }),
    });
  });

  test("an unusable certificate is ignored while no domain uses it", () => {
    expect(() => synth({ httpCertificate: "arn:aws:acm:us-east-1:ACCOUNT:certificate/UUID" })).not.toThrow();
  });
});

describe("With a custom domain", () => {
  test("the domain and the certificate reach the distribution", () => {
    const template = synth({ customDomainNames: "example.com,www.example.com", httpCertificate: VALID_CERTIFICATE });
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        Aliases: ["example.com", "www.example.com"],
        ViewerCertificate: Match.objectLike({ AcmCertificateArn: VALID_CERTIFICATE }),
      }),
    });
  });

  test("refuses to synthesize without a certificate", () => {
    expect(() => synth({ customDomainNames: "example.com" })).toThrow(/httpCertificate is empty/);
  });

  // What actually happens: the .env still holds the placeholder the template
  // ships. CloudFormation accepts it and CloudFront rejects it mid-deploy, so
  // the value has to be refused here instead.
  test("refuses the placeholder ARN of the template", () => {
    expect(() => synth({ customDomainNames: "example.com", httpCertificate: "arn:aws:acm:us-east-1:ACCOUNT:certificate/UUID" })).toThrow(/not a certificate ARN CloudFront can use/);
  });

  test("refuses a certificate issued outside us-east-1", () => {
    const wrongRegion = VALID_CERTIFICATE.replace("us-east-1", "eu-west-3");
    expect(() => synth({ customDomainNames: "example.com", httpCertificate: wrongRegion })).toThrow(/not a certificate ARN CloudFront can use/);
  });
});

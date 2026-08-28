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
  createCognito: "true",
  userPoolName: "test-pool",
  userPoolClientName: "test-pool-client",
  yourDomain: "https://example.com",
  cognitoCallBackPath: "/auth/callback",
  logoutPath: "/",
};

const COGNITO_KEYS = ["createCognito", "createGoogleLogin", "googleClientId", "googleClientSecret", "googleClientSecretName", "googleClientSecretField", "cognitoDomainPrefix", "cognitoExtraCallbackUrls", "cognitoExtraLogoutUrls", "customDomainNames", "createDnsRecord", "hostedZoneDomain", "httpCertificate"];

function synth(overrides: Record<string, string> = {}): Template {
  jest.resetModules();
  for (const key of [...Object.keys(BASE_ENV), ...COGNITO_KEYS]) delete process.env[key];
  Object.assign(process.env, BASE_ENV, overrides);

  const cdk = require("aws-cdk-lib");
  const { ReactCdkBaseProjectStack } = require("../lib/react-cdk-base-project-stack");
  const app = new cdk.App();
  const stack = new ReactCdkBaseProjectStack(app, "TestStack", {
    env: { account: "111122223333", region: "eu-west-3" },
  });
  return Template.fromStack(stack);
}

const GOOGLE_ENV = {
  createGoogleLogin: "true",
  googleClientId: "1234567890-abcdefg.apps.googleusercontent.com",
  googleClientSecret: "test-client-secret",
  cognitoDomainPrefix: "my-login-prefix",
};

describe("Cognito without Google", () => {
  let template: Template;
  beforeAll(() => {
    template = synth();
  });

  test("creates the user pool and its client", () => {
    template.resourceCountIs("AWS::Cognito::UserPool", 1);
    template.resourceCountIs("AWS::Cognito::UserPoolClient", 1);
  });

  test("declares no identity provider and no hosted UI domain", () => {
    template.resourceCountIs("AWS::Cognito::UserPoolIdentityProvider", 0);
    template.resourceCountIs("AWS::Cognito::UserPoolDomain", 0);
  });

  test("leaves the supported providers at the Cognito default", () => {
    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      SupportedIdentityProviders: ["COGNITO"],
    });
  });

  test("keeps the OAuth scopes an existing website may already use", () => {
    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      AllowedOAuthScopes: Match.arrayWith(["profile", "email", "openid", "aws.cognito.signin.user.admin"]),
    });
  });

  test("only wires the PostConfirmation trigger", () => {
    template.hasResourceProperties("AWS::Cognito::UserPool", {
      LambdaConfig: { PostConfirmation: Match.anyValue(), PreSignUp: Match.absent() },
    });
  });
});

describe("Cognito with Google login", () => {
  let template: Template;
  beforeAll(() => {
    template = synth(GOOGLE_ENV);
  });

  test("creates the hosted UI domain Google redirects to", () => {
    template.hasResourceProperties("AWS::Cognito::UserPoolDomain", {
      Domain: "my-login-prefix",
    });
  });

  test("registers Google with the scopes and the attribute mapping the pool requires", () => {
    template.hasResourceProperties("AWS::Cognito::UserPoolIdentityProvider", {
      ProviderName: "Google",
      ProviderType: "Google",
      ProviderDetails: Match.objectLike({
        client_id: GOOGLE_ENV.googleClientId,
        authorize_scopes: "openid email profile",
      }),
      // The pool marks email, given_name and family_name as required, so a
      // federated sign in fails unless all three are mapped.
      AttributeMapping: {
        email: "email",
        given_name: "given_name",
        family_name: "family_name",
      },
    });
  });

  test("lets the client use both Cognito and Google", () => {
    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      SupportedIdentityProviders: ["COGNITO", "Google"],
      AllowedOAuthScopes: Match.arrayWith(["profile", "email", "openid"]),
      AllowedOAuthFlows: ["code"],
    });
  });

  test("creates the client only after the provider exists", () => {
    const providerId = Object.keys(template.findResources("AWS::Cognito::UserPoolIdentityProvider"))[0];
    const client = Object.values(template.findResources("AWS::Cognito::UserPoolClient"))[0] as any;
    expect(client.DependsOn).toContain(providerId);
  });

  test("adds the PreSignUp trigger, the only one federated users fire", () => {
    template.hasResourceProperties("AWS::Cognito::UserPool", {
      LambdaConfig: { PostConfirmation: Match.anyValue(), PreSignUp: Match.anyValue() },
    });
  });

  test("publishes the redirect URI that has to be pasted into Google", () => {
    template.hasOutput("GoogleAuthorisedRedirectUri", {
      Value: "https://my-login-prefix.auth.eu-west-3.amazoncognito.com/oauth2/idpresponse",
    });
  });
});

describe("Google login configuration errors", () => {
  test("refuses to synthesize without the hosted UI domain", () => {
    expect(() => synth({ ...GOOGLE_ENV, cognitoDomainPrefix: "" })).toThrow(/cognitoDomainPrefix is empty/);
  });

  test("refuses to synthesize without a client id", () => {
    expect(() => synth({ ...GOOGLE_ENV, googleClientId: "" })).toThrow(/googleClientId is empty/);
  });

  test("refuses to synthesize without any client secret", () => {
    expect(() => synth({ ...GOOGLE_ENV, googleClientSecret: "" })).toThrow(/no client secret was given/);
  });
});

describe("Google client secret sources", () => {
  test("the raw value ends up inside the template", () => {
    const template = synth(GOOGLE_ENV);
    template.hasResourceProperties("AWS::Cognito::UserPoolIdentityProvider", {
      ProviderDetails: Match.objectLike({ client_secret: "test-client-secret" }),
    });
  });

  test("Secrets Manager is resolved at deploy time instead", () => {
    const template = synth({ ...GOOGLE_ENV, googleClientSecret: "", googleClientSecretName: "google-oauth", googleClientSecretField: "clientSecret" });
    template.hasResourceProperties("AWS::Cognito::UserPoolIdentityProvider", {
      ProviderDetails: Match.objectLike({
        client_secret: "{{resolve:secretsmanager:google-oauth:SecretString:clientSecret::}}",
      }),
    });
    expect(JSON.stringify(template.toJSON())).not.toContain("test-client-secret");
  });
});

describe("Callback URLs", () => {
  test("keeps the site URL and adds the extra ones", () => {
    const template = synth({
      cognitoExtraCallbackUrls: "http://localhost:3000/auth/callback, http://localhost:3001/auth/callback",
      cognitoExtraLogoutUrls: "http://localhost:3000/",
    });
    template.hasResourceProperties("AWS::Cognito::UserPoolClient", {
      CallbackURLs: ["https://example.com/auth/callback", "http://localhost:3000/auth/callback", "http://localhost:3001/auth/callback"],
      LogoutURLs: ["https://example.com/", "http://localhost:3000/"],
    });
  });
});

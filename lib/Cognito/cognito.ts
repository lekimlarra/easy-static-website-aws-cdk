import * as cdk from "aws-cdk-lib";
import path = require("path");
import { AccountRecovery, CfnUserPool, ProviderAttribute, UserPool, UserPoolClient, UserPoolClientIdentityProvider, UserPoolDomain, UserPoolIdentityProviderGoogle } from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import { Function, Runtime, Code } from "aws-cdk-lib/aws-lambda";
import { PolicyStatement, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Table } from "aws-cdk-lib/aws-dynamodb";

const yourDomain = process.env.yourDomain ?? "";
const logoutPath = process.env.logoutPath ?? "";
const cognitoCallBackPath = process.env.cognitoCallBackPath ?? "";
const userPoolName = process.env.userPoolName ?? "";
const userPoolClientName = process.env.userPoolClientName ?? "";
// Prefix of the Cognito hosted UI domain, "<prefix>.auth.<region>.amazoncognito.com".
// It is mandatory for any federated login: Google redirects back to that domain.
const cognitoDomainPrefix = process.env.cognitoDomainPrefix ?? "";
// Extra URLs allowed as callback and logout targets, on top of yourDomain.
// Typically "http://localhost:3000/auth/callback" while developing.
const extraCallbackUrls = splitList(process.env.cognitoExtraCallbackUrls);
const extraLogoutUrls = splitList(process.env.cognitoExtraLogoutUrls);
// Google login
const createGoogleLogin = process.env.createGoogleLogin == "true";
const googleClientId = process.env.googleClientId ?? "";
const googleClientSecret = process.env.googleClientSecret ?? "";
const googleClientSecretName = process.env.googleClientSecretName ?? "";
const googleClientSecretField = process.env.googleClientSecretField ?? "";

function splitList(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export class myCognito {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;
  public readonly userPoolDomain?: UserPoolDomain;
  public readonly googleProvider?: UserPoolIdentityProviderGoogle;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    // 1. Creating user pool, where users will be stored, the base of Cognito
    this.userPool = new UserPool(scope, "MyUserPool", {
      userPoolName: userPoolName,
      selfSignUpEnabled: true,
      signInAliases: { email: true }, // Login via email
      autoVerify: { email: true }, // Automatic email verification
      standardAttributes: {
        email: { required: true, mutable: false },
        givenName: { required: true, mutable: true },
        familyName: { required: true, mutable: true },
      },
      passwordPolicy: {
        minLength: 8,
        requireUppercase: true,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: AccountRecovery.EMAIL_ONLY,
    });

    // 2. Hosted UI domain. Cognito hosts the login page there, and it is the
    //    address Google redirects to after the user picks an account.
    if (cognitoDomainPrefix) {
      this.userPoolDomain = this.userPool.addDomain("CognitoDomain", {
        cognitoDomain: { domainPrefix: cognitoDomainPrefix },
      });
    } else if (createGoogleLogin) {
      throw new Error("createGoogleLogin is true but cognitoDomainPrefix is empty. Federated login needs the Cognito hosted UI domain to receive the redirect from Google.");
    }

    // 3. Google as an identity provider. The attribute mapping is what fills
    //    the required attributes of the pool with the data Google returns; the
    //    pool demands email, given_name and family_name, so all three are mapped.
    if (createGoogleLogin) {
      if (!googleClientId) {
        throw new Error("createGoogleLogin is true but googleClientId is empty. Create an OAuth client in the Google Cloud console and copy its client id.");
      }
      if (!googleClientSecret && !googleClientSecretName) {
        throw new Error("createGoogleLogin is true but no client secret was given. Set googleClientSecretName to a Secrets Manager secret (recommended) or googleClientSecret to the raw value.");
      }

      // Reading the secret from Secrets Manager keeps it out of the synthesized
      // template: CloudFormation resolves the reference at deploy time. The raw
      // value is supported as a fallback, but it does end up in the template.
      const clientSecretValue = googleClientSecretName ? cdk.SecretValue.secretsManager(googleClientSecretName, googleClientSecretField ? { jsonField: googleClientSecretField } : undefined) : cdk.SecretValue.unsafePlainText(googleClientSecret);

      this.googleProvider = new UserPoolIdentityProviderGoogle(scope, "GoogleIdentityProvider", {
        userPool: this.userPool,
        clientId: googleClientId,
        clientSecretValue,
        scopes: ["openid", "email", "profile"],
        attributeMapping: {
          email: ProviderAttribute.GOOGLE_EMAIL,
          givenName: ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: ProviderAttribute.GOOGLE_FAMILY_NAME,
        },
      });
    }

    // 4. Creating pool client, where our website will connect to
    this.userPoolClient = new UserPoolClient(scope, "MyUserPoolClient", {
      userPool: this.userPool,
      userPoolClientName: userPoolClientName,
      authFlows: {
        userPassword: true, // For the login with email + password
        userSrp: true, // For the login with email + password
      },
      oAuth: {
        callbackUrls: [`${yourDomain}${cognitoCallBackPath}`, ...extraCallbackUrls],
        logoutUrls: [`${yourDomain}${logoutPath}`, ...extraLogoutUrls],
        flows: {
          authorizationCodeGrant: true,
        },
        // scopes is deliberately left at the CDK default, which already grants
        // openid, email and profile (what the hosted UI needs to hand back an
        // id token with the Google profile) plus the ones an existing website
        // may already be relying on.
      },
      // Left untouched when there is no federation, so the pool keeps its
      // default (Cognito only) and existing stacks see no change.
      ...(this.googleProvider ? { supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO, UserPoolClientIdentityProvider.GOOGLE] } : {}),
    });

    // The client cannot list Google as a provider before the provider exists.
    if (this.googleProvider) this.userPoolClient.node.addDependency(this.googleProvider);

    // 5. Creating lambda that will be run when a new user is registered in Cognito
    const lambdaNewUserPath = path.join(__dirname, "./");
    console.log("Lambda path:", lambdaNewUserPath);
    const lambdaNewUser = new Function(scope, `newCognitoUser`, {
      functionName: "newCognitoUser",
      runtime: Runtime.PYTHON_3_13,
      handler: `lambdaNewUser.lambda_handler`,
      environment: {},
      memorySize: 256,
      timeout: cdk.Duration.minutes(1),
      //ephemeralStorageSize: Size.mebibytes(1024),
      code: Code.fromAsset(lambdaNewUserPath),
    });

    // 6. Configuring permissions for the lambda so Cognito can invoke it
    const invokePolicyStatement = new PolicyStatement({
      actions: ["lambda:InvokeFunction"],
      resources: [lambdaNewUser.functionArn], // ARN de la Lambda
      conditions: {
        ArnLike: {
          "AWS:SourceArn": this.userPool.userPoolArn,
        },
      },
    });

    lambdaNewUser.addPermission("CognitoInvokePermission", {
      principal: new ServicePrincipal("cognito-idp.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: this.userPool.userPoolArn,
    });

    // 7. Grating write permissions to lambda in our DB
    const table = Table.fromTableName(scope, "usersTableForCognito", "users");
    table.grantReadWriteData(lambdaNewUser);

    // 8. Adding trigger to run lambda after user creation in Cognito
    const userPoolResource = this.userPool.node.defaultChild as CfnUserPool;
    userPoolResource.addPropertyOverride("LambdaConfig.PostConfirmation", lambdaNewUser.functionArn);
    // Users arriving through Google are confirmed by Cognito itself, so
    // PostConfirmation never fires for them. PreSignUp is the only trigger that
    // does, and it is where the lambda stores the federated profiles.
    if (this.googleProvider) {
      userPoolResource.addPropertyOverride("LambdaConfig.PreSignUp", lambdaNewUser.functionArn);
    }

    // 9. Outputs
    new cdk.CfnOutput(scope, "UserPoolId", {
      value: this.userPool.userPoolId,
    });
    new cdk.CfnOutput(scope, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(scope, "newCognitoUserLambdaArn", {
      value: lambdaNewUser.functionArn,
    });
    if (this.userPoolDomain) {
      const baseUrl = `https://${cognitoDomainPrefix}.auth.${cdk.Stack.of(scope).region}.amazoncognito.com`;
      const redirectUri = `${yourDomain}${cognitoCallBackPath}`;
      new cdk.CfnOutput(scope, "CognitoHostedUiDomain", {
        value: baseUrl,
      });
      // Paste this in the "Authorised redirect URI" of your Google OAuth client.
      new cdk.CfnOutput(scope, "GoogleAuthorisedRedirectUri", {
        value: `${baseUrl}/oauth2/idpresponse`,
      });
      new cdk.CfnOutput(scope, "CognitoLoginUrl", {
        value: `${baseUrl}/login?client_id=${this.userPoolClient.userPoolClientId}&response_type=code&scope=openid+email+profile&redirect_uri=${redirectUri}`,
      });
      if (this.googleProvider) {
        // Sends the user straight to Google, skipping the Cognito login page.
        new cdk.CfnOutput(scope, "GoogleLoginUrl", {
          value: `${baseUrl}/oauth2/authorize?identity_provider=Google&client_id=${this.userPoolClient.userPoolClientId}&response_type=code&scope=openid+email+profile&redirect_uri=${redirectUri}`,
        });
      }
    }
  }
}

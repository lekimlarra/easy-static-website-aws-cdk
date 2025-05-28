import * as cdk from "aws-cdk-lib";
import path = require("path");
import { AccountRecovery, CfnUserPool, UserPool, UserPoolClient } from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";
import { Function, Runtime, Code } from "aws-cdk-lib/aws-lambda";
import { PolicyStatement, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Table } from "aws-cdk-lib/aws-dynamodb";

const yourDomain = process.env.yourDomain ?? "";
const logoutPath = process.env.logoutPath ?? "";
const cognitoCallBackPath = process.env.cognitoCallBackPath ?? "";
const userPoolName = process.env.userPoolName ?? "";
const userPoolClientName = process.env.userPoolClientName ?? "";

export class myCognito {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;
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

    // 2. Creating pool client, where our website will connect to
    this.userPoolClient = new UserPoolClient(scope, "MyUserPoolClient", {
      userPool: this.userPool,
      userPoolClientName: userPoolClientName,
      authFlows: {
        userPassword: true, // For the login with email + password
        userSrp: true, // For the login with email + password
      },
      oAuth: {
        callbackUrls: [`${yourDomain}${cognitoCallBackPath}`],
        logoutUrls: [`${yourDomain}${logoutPath}`],
        flows: {
          authorizationCodeGrant: true,
        },
      },
    });

    // 3. Creating lambda that will be run when a new user is registered in Cognito
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

    // 4. Configuring permissions for the lambda so Cognito can invoke it
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

    // 5. Grating write permissions to lambda in our DB
    const table = Table.fromTableName(scope, "usersTableForCognito", "users");
    table.grantReadWriteData(lambdaNewUser);

    // 6. Adding trigger to run lambda after user creation in Cognito
    const userPoolResource = this.userPool.node.defaultChild as CfnUserPool;
    userPoolResource.addPropertyOverride("LambdaConfig.PostConfirmation", lambdaNewUser.functionArn);

    // 5. Outputs
    new cdk.CfnOutput(scope, "UserPoolId", {
      value: this.userPool.userPoolId,
    });
    new cdk.CfnOutput(scope, "UserPoolClientId", {
      value: this.userPoolClient.userPoolClientId,
    });
    new cdk.CfnOutput(scope, "newCognitoUserLambdaArn", {
      value: lambdaNewUser.functionArn,
    });
  }
}

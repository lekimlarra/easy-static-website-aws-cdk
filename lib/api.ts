import * as cdk from "aws-cdk-lib";
import path = require("path");
import { Construct } from "constructs";
import { RestApi, LambdaIntegration, Period, ApiKey, Stage, Deployment, CognitoUserPoolsAuthorizer, AuthorizationType } from "aws-cdk-lib/aws-apigateway";
import { Function, Runtime, Code } from "aws-cdk-lib/aws-lambda";
// Custom imports
import * as utils from "./utils";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { myCognito } from "./Cognito/cognito";

const quota = process.env.apiKeyQuota ?? 1000;
const rateLimit = process.env.apiKeyRateLimit ?? 5;
const burstLimit = process.env.apyKeyBurstLimit ?? 5;
const lambdasPath = path.join(__dirname, process.env.lambdasPath ?? "../resources/lambdas");
const apiKeyName = process.env.apiKeyName ?? "";
const restApiName = process.env.restApiName ?? "cdk-template-api";
const apiProdBasePath = process.env.apiProdBasePath ?? "prod";
const openApiExportType = process.env.openApiExportType ?? "yaml";

export class myApi {
  allLambdaFiles = utils.listFiles(lambdasPath);
  metodos = utils.listMethods(this.allLambdaFiles);
  allLambdas: Function[] = [];
  api: RestApi;
  constructor(scope: Construct, id: string, createdTables: Table[], thisCognito: myCognito | null, props?: cdk.StackProps) {
    // Adding OPTIONS for CORS
    this.metodos.push("OPTIONS");
    console.log("All lambdas:", this.allLambdaFiles);
    console.log("All metodos:", this.metodos);

    // ********************** API **********************
    this.api = new RestApi(scope, "cdk-template-api", {
      restApiName: restApiName,
      //deploy: false, // Deactivation of the auto deploy (creates "prod", we want a custom one)
      defaultCorsPreflightOptions: {
        allowHeaders: ["Content-Type", "X-Amz-Date", "Authorization", "X-Api-Key", "x-api-key", "Access-Control-Allow-Origin"],
        allowMethods: this.metodos,
        allowCredentials: true,
        allowOrigins: ["*"],
      },
      deployOptions: {
        stageName: apiProdBasePath,
      },
    });
    /*
    // Crear el Deployment
    const deployment = new Deployment(scope, "ApiDeployment", {
      api: this.api,
    });

    // Crear el Stage con el nombre que tú quieras
    const apiStage = new Stage(scope, "ApiStage", {
      deployment: deployment,
      stageName: apiProdBasePath,
    });*/

    // ********************** COGNITO AUTHORIZER **********************
    let authorizerCongnito: CognitoUserPoolsAuthorizer | null = null;
    if (thisCognito) {
      authorizerCongnito = new CognitoUserPoolsAuthorizer(scope, "cognitoAuthorizerApi", {
        cognitoUserPools: [thisCognito.userPool],
      });
    }

    // ********************** KEYS AND USAGE PLANS **********************
    // Creating usage plan
    let usagePlanName = "basicUsagePlan";
    const basicPlan = this.api.addUsagePlan(usagePlanName, {
      name: usagePlanName,
      description: "This usage plan is just to be sure no one can use the API too much",
      quota: {
        limit: Number(quota),
        period: Period.MONTH,
      },
      throttle: {
        rateLimit: Number(rateLimit),
        burstLimit: Number(burstLimit),
      },
    });
    basicPlan.addApiStage({
      stage: this.api.deploymentStage,
      //stage: apiStage,
    });
    // Creating key
    const basicKey = new ApiKey(scope, `${apiKeyName}`, {
      enabled: true,
      description: "This key is just to be sure no one can use the API too much",
      apiKeyName: apiKeyName,
    });
    basicPlan.addApiKey(basicKey);

    // ********************** ENDPOINTS **********************
    for (let lambda of this.allLambdaFiles) {
      // Checks if the file is python
      const fileName = lambda.split(".")[0];
      const lambdaName = fileName.split("#").join("-");
      const endpointPath = utils.createPath(fileName);
      let runtime = undefined;
      // Setting the runtime based on the file extension
      if (lambda.endsWith(".py")) {
        console.log(`Creating PYTHON lambda: ${lambda} with name: ${lambdaName}`);
        runtime = Runtime.PYTHON_3_13;
      } else if (lambda.endsWith(".js")) {
        console.log(`Creating NODE lambda: ${lambda} with name: ${lambdaName}`);
        runtime = Runtime.NODEJS_22_X;
      }

      if (runtime === undefined) {
        console.error("Only python or node JS files are supported for lambdas");
        continue;
      } else {
        const thisLambda = new Function(scope, `lambdaFunction-${lambdaName}`, {
          functionName: lambdaName,
          runtime: runtime,
          handler: `${fileName}.handler`,
          environment: {},
          memorySize: 256,
          timeout: cdk.Duration.minutes(1),
          //ephemeralStorageSize: Size.mebibytes(1024),
          code: Code.fromAsset(lambdasPath),
        });
        // Creating the endpoint if lambda exists
        if (thisLambda) {
          const lambdaMethod = fileName.split("-")[0];
          const endpointPathVariables = utils.getEndpointPathVariables(fileName);
          console.log(`lambdaMethod: ${lambdaMethod} endpointPath: ${endpointPath}`);
          console.log(`Endpoint path variables: ${endpointPathVariables}`);
          const currentLambda = new LambdaIntegration(thisLambda, {});
          let resource = this.api.root.addResource(endpointPath);
          for (let pathVariable of endpointPathVariables) {
            resource = resource.addResource(`{${pathVariable}}`);
          }

          // If we have cognito, we add the authorizer
          if (thisCognito && authorizerCongnito) {
            resource.addMethod(lambdaMethod, currentLambda, {
              authorizer: authorizerCongnito,
              authorizationType: AuthorizationType.COGNITO,
              apiKeyRequired: true,
            });
          } else {
            resource.addMethod(lambdaMethod, currentLambda, {
              apiKeyRequired: true,
            });
          }

          new cdk.CfnOutput(scope, `endpoint-${endpointPath}`, {
            value: endpointPath,
          });
        }
        this.allLambdas.push(thisLambda);
      }
    }

    // ********************** GRANTING ACCESS FROM LAMBDAS TO LAMBDAS **********************
    for (let table of createdTables) {
      for (let fn of this.allLambdas) {
        table.grantReadWriteData(fn);
      }
    }

    // ********************** GENERATING AWS COMMAND TO DOWNLOAD OPEN API SPECS **********************
    const command = `aws apigateway get-export --rest-api-id ${this.api.restApiId} --stage-name ${apiProdBasePath} --export-type swagger --accept application/${openApiExportType} ./docs/openapi.${openApiExportType}`;
    console.log("COMMAND TO DOWNLOAD OPEN API SPECS:");
    console.log(command);
    new cdk.CfnOutput(scope, `commandToDownloadOpenApi`, {
      value: command,
    });
    // ********************** CDK OUTPUTS **********************
    new cdk.CfnOutput(scope, `APIURL`, {
      value: this.api.url,
    });
    new cdk.CfnOutput(scope, "apiKeyArn", {
      value: basicKey.keyArn,
    });
  }
}

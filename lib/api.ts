import * as cdk from "aws-cdk-lib";
import path = require("path");
import { Construct } from "constructs";
import { RestApi, LambdaIntegration, Period, ApiKey, Stage, Deployment, CognitoUserPoolsAuthorizer, AuthorizationType, MethodOptions, Resource, DomainName } from "aws-cdk-lib/aws-apigateway";
import { Function, Runtime, Code } from "aws-cdk-lib/aws-lambda";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { ApiGatewayDomain } from "aws-cdk-lib/aws-route53-targets";
// Custom imports
import * as utils from "./utils";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { myCognito } from "./Cognito/cognito";

const quota = process.env.apiKeyQuota ?? 1000;
const rateLimit = process.env.apiKeyRateLimit ?? 5;
const burstLimit = process.env.apyKeyBurstLimit ?? 5;
const lambdasPath = path.join(__dirname, process.env.lambdasPath ?? "../resources/lambdas");
const modelsPath = path.join(lambdasPath, "Models");
const apiKeyName = process.env.apiKeyName ?? "";
const restApiName = process.env.restApiName ?? "cdk-template-api";
const apiProdBasePath = process.env.apiProdBasePath ?? "prod";
const openApiExportType = process.env.openApiExportType ?? "yaml";
// Custom domain for the API (optional), same idea as the website's in
// react-cdk-base-project-stack.ts: an ACM certificate plus an optional
// Route 53 record, both behind env vars so the stack still deploys with
// nothing set and keeps answering on its *.execute-api.amazonaws.com URL.
const apiDomainName = process.env.apiDomainName ?? "";
const apiCertificate = process.env.apiCertificate ?? "";
const createApiDnsRecord = process.env.createApiDnsRecord == "true";
const apiDnsRecordName = process.env.apiDnsRecordName ?? "";
const hostedZoneDomain = process.env.hostedZoneDomain ?? "";

export class myApi {
  allLambdaFiles = utils.listFiles(lambdasPath);
  allApiModelsFiles = utils.listFiles(modelsPath, ".ts");
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

    // ********************** API CUSTOM DOMAIN **********************
    // A friendlier name than the raw *.execute-api.<region>.amazonaws.com URL.
    // Unlike CloudFront (which only ever accepts a us-east-1 certificate), a
    // REGIONAL API Gateway domain -- the default, and what "mapping" below
    // creates -- needs its certificate issued in the stack's own region.
    const region = cdk.Stack.of(scope).region;
    let apiCustomDomain: DomainName | null = null;
    if (apiDomainName) {
      if (!apiCertificate) {
        throw new Error(`apiDomainName is set to "${apiDomainName}" but apiCertificate is empty. A REGIONAL API Gateway custom domain needs an ACM certificate issued in the stack's own region ("${region}").\n` + "Leave apiDomainName empty to deploy now and keep using the *.execute-api.amazonaws.com URL instead.");
      }
      // Same reasoning as httpCertificate in react-cdk-base-project-stack.ts:
      // catching a certificate CloudFormation would accept and API Gateway
      // would reject minutes into the deploy turns that into a synth error.
      const apiCertificatePattern = new RegExp(`^arn:aws:acm:${region}:\\d{12}:certificate/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`, "i");
      if (!apiCertificatePattern.test(apiCertificate)) {
        throw new Error(`apiCertificate is not a certificate ARN this API Gateway domain can use: "${apiCertificate}".\n` + `Expected "arn:aws:acm:${region}:<12 digit account>:certificate/<uuid>": a REGIONAL API Gateway domain needs the certificate issued in the stack's own region ("${region}"), not us-east-1 like CloudFront.\n` + `List the ones you have with: aws acm list-certificates --region ${region} --query "CertificateSummaryList[].[DomainName,CertificateArn]" --output table\n` + "Leave apiDomainName empty to deploy without a custom API domain.");
      }
      apiCustomDomain = new DomainName(scope, "ApiCustomDomain", {
        domainName: apiDomainName,
        certificate: Certificate.fromCertificateArn(scope, "ImportedApiCert", apiCertificate),
        // Maps the domain root straight to this API's deployment stage, so
        // "https://api.example.com/plants" replaces
        // "https://xxxx.execute-api.<region>.amazonaws.com/api/plants" --
        // the stage name disappears into the mapping instead of the URL.
        mapping: this.api,
      });

      if (createApiDnsRecord) {
        if (!hostedZoneDomain) {
          throw new Error("createApiDnsRecord is true but hostedZoneDomain is empty. Set it to the Route 53 hosted zone that owns your domain.");
        }
        const apiZone = HostedZone.fromLookup(scope, "ApiHostedZone", {
          domainName: hostedZoneDomain,
        });
        new ARecord(scope, "ApiAliasRecord", {
          zone: apiZone,
          recordName: apiDnsRecordName, // empty means the apex of the hosted zone
          target: RecordTarget.fromAlias(new ApiGatewayDomain(apiCustomDomain)),
        });
      }
    }

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

    // ********************** API MODELS **********************
    let modelObjects: any = {};
    // Importing all models from the Models folder
    for (const file of this.allApiModelsFiles) {
      const modelModule = require(path.join(modelsPath, file));

      // Asegúrate de que cada fichero exporta `modelName` y `schema`
      if (modelModule.modelName && modelModule.schema) {
        let currentModel = this.api.addModel(`${file}-${modelModule.modelName}`, {
          contentType: "application/json",
          modelName: modelModule.modelName,
          schema: modelModule.schema,
        });
        modelObjects[file.split(".")[0]] = currentModel;
      } else {
        console.warn(`Modelo inválido en archivo ${file}`);
      }
    }

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
          const resourcesList = fileName.split("-");
          const currentLambda = new LambdaIntegration(thisLambda, {});
          let finalPath = "/" + resourcesList[1];
          for (let i = 2; i < resourcesList.length; i++) {
            if (resourcesList[i].includes("#")) {
              const [path, variable] = resourcesList[i].split("#");
              finalPath += `/{${variable}}`;
            } else {
              finalPath += `/${resourcesList[i]}`;
            }
          }
          console.log(`lambdaMethod: ${lambdaMethod} endpointPath: ${finalPath}`);
          const parts = finalPath.split("/").filter((p) => p); // elimina los vacíos
          let resource = this.api.root;
          // Creating the resource path
          for (const part of parts) {
            const existing = resource.node.tryFindChild(part);
            if (existing) {
              console.warn("⚠️ Reused path existing");
              resource = existing as Resource;
            } else {
              console.warn("⚠️ NOT reused path");
              resource = resource.addResource(part);
            }
          }

          let methodOptions: MethodOptions = {
            apiKeyRequired: true,
          };

          // Adding the model if it exists
          if (modelObjects[fileName]) {
            methodOptions = {
              ...methodOptions,
              requestModels: {
                "application/json": modelObjects[fileName],
              },
              requestValidator: this.api.addRequestValidator(`${lambdaName}Validator`, {
                validateRequestBody: true,
              }),
            };
          }

          // If we have cognito, we add the authorizer
          if (thisCognito && authorizerCongnito) {
            resource.addMethod(lambdaMethod, currentLambda, {
              ...methodOptions,
              authorizer: authorizerCongnito,
              authorizationType: AuthorizationType.COGNITO,
            });
          } else {
            resource.addMethod(lambdaMethod, currentLambda, {
              ...methodOptions,
            });
          }

          new cdk.CfnOutput(scope, `endpoint-${lambdaMethod}-${finalPath}`, {
            value: finalPath,
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
    if (apiCustomDomain) {
      new cdk.CfnOutput(scope, "ApiCustomDomainUrl", {
        value: `https://${apiDomainName}`,
      });
    }
    new cdk.CfnOutput(scope, "apiKeyArn", {
      value: basicKey.keyArn,
    });
  }
}

import * as cdk from "aws-cdk-lib";
import path = require("path");
import { Construct } from "constructs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { aws_s3_deployment } from "aws-cdk-lib";
import { AllowedMethods, CachePolicy, Distribution, OriginProtocolPolicy, OriginRequestCookieBehavior, OriginRequestHeaderBehavior, OriginRequestPolicy, OriginRequestQueryStringBehavior, ViewerProtocolPolicy } from "aws-cdk-lib/aws-cloudfront";
import { HttpOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
// Custom imports
import { myApi } from "./api";
import { budget } from "./budget";
import { database } from "./database";
import { myCognito } from "./Cognito/cognito";

const bucketName = process.env.bucketName ?? "";
const websiteBuildPath = process.env.websiteBuildPath ?? "../resources/website/build";
const httpCertificate = process.env.httpCertificate ?? "";
const yourDomain = process.env.yourDomain ?? "";
const apiProdBasePath = (process.env.apiProdBasePath ?? "prod") + "/*";
const createCognito = process.env.createCognito == "true";

export class ReactCdkBaseProjectStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ********************** DATABASES **********************
    const databases = new database(this, id, props);
    console.log("DATABASES CREATEDd");
    console.log(databases);

    // ********************** COGNITO **********************
    let thisCognito: myCognito | null = null;
    console.log("createCognito", createCognito);
    if (createCognito) thisCognito = new myCognito(this, id, props);

    // ********************** API **********************
    const myAPI = new myApi(this, id, databases.allTables, thisCognito, props);

    // ********************** WEBSITE - S3 **********************
    const websiteBucket = new Bucket(this, "s3bucket", {
      publicReadAccess: true,
      blockPublicAccess: {
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      },
      bucketName: bucketName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      websiteIndexDocument: "index.html",
    });

    // ********************** CLOUDFRONT **********************
    // This is needed to allow the API key header to be pass through from the CloudFront distribution to the API Gateway
    const apiKeyPolicy = new OriginRequestPolicy(this, "ApiKeyPolicy", {
      originRequestPolicyName: "ApiKeyPolicy",
      headerBehavior: OriginRequestHeaderBehavior.allowList("x-api-key"),
      queryStringBehavior: OriginRequestQueryStringBehavior.all(),
      cookieBehavior: OriginRequestCookieBehavior.none(),
    });

    const cfDistribution = new Distribution(this, "myDist", {
      defaultBehavior: {
        origin: new HttpOrigin(`${websiteBucket.bucketWebsiteDomainName}`, {
          protocolPolicy: OriginProtocolPolicy.HTTP_ONLY, // For static website
        }),
      },
    });
    const origin = new HttpOrigin(`${myAPI.api.restApiId}.execute-api.${this.region}.amazonaws.com`, {});
    cfDistribution.addBehavior(apiProdBasePath, origin, {
      cachePolicy: CachePolicy.CACHING_DISABLED, // Suele ser mejor desactivar caché en APIs.
      allowedMethods: AllowedMethods.ALLOW_ALL,
      viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
      originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      //originRequestPolicy: apiKeyPolicy,
    });

    // ********************** WEBSITE - S3 DEPLOYMENT **********************
    // Deploying website files to S3 bucket with a cloudfront cache invalidation!
    const deployment = new aws_s3_deployment.BucketDeployment(this, "DeployWebsite", {
      sources: [aws_s3_deployment.Source.asset(path.join(__dirname, websiteBuildPath))],
      destinationBucket: websiteBucket,
      distribution: cfDistribution,
      distributionPaths: ["/*"],
    });

    // ********************** BUDGET **********************
    const myBudget = new budget(this, id, props);

    // ********************** CDK OUTPUTS **********************
    new cdk.CfnOutput(this, "BucketUrl", {
      value: websiteBucket.bucketWebsiteUrl,
    });
    new cdk.CfnOutput(this, "CloudFrontUrl", {
      value: cfDistribution.domainName,
    });
  }
}

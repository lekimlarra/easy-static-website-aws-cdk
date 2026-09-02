import * as cdk from "aws-cdk-lib";
import path = require("path");
import { Construct } from "constructs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { aws_s3_deployment } from "aws-cdk-lib";
import { AllowedMethods, CachePolicy, Distribution, DistributionProps, OriginProtocolPolicy, OriginRequestCookieBehavior, OriginRequestHeaderBehavior, OriginRequestPolicy, OriginRequestQueryStringBehavior, ViewerProtocolPolicy } from "aws-cdk-lib/aws-cloudfront";
import { HttpOrigin } from "aws-cdk-lib/aws-cloudfront-origins";
import { Certificate } from "aws-cdk-lib/aws-certificatemanager";
import { ARecord, HostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { CloudFrontTarget } from "aws-cdk-lib/aws-route53-targets";
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
// Domains served by the CloudFront distribution, on top of the *.cloudfront.net one.
const customDomainNames = (process.env.customDomainNames ?? "")
  .split(",")
  .map((domain) => domain.trim())
  .filter(Boolean);
const createDnsRecord = process.env.createDnsRecord == "true";
const hostedZoneDomain = process.env.hostedZoneDomain ?? "";
const dnsRecordName = process.env.dnsRecordName ?? "";
// When false the stack only creates the bucket and the website is uploaded with
// the AWS CLI ("npm run s3deploy"). That path is much faster for big sites and
// lets a content-only change be shipped without a CloudFormation update.
const deployWebsiteWithCdk = (process.env.deployWebsiteWithCdk ?? "true") !== "false";
// CloudFront serves a custom domain only with an ACM certificate from us-east-1.
const ACM_CERTIFICATE_ARN = /^arn:aws:acm:us-east-1:\d{12}:certificate\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      websiteErrorDocument: "index.html",
    });

    // ********************** CLOUDFRONT **********************
    // This is needed to allow the API key header to be pass through from the CloudFront distribution to the API Gateway
    const apiKeyPolicy = new OriginRequestPolicy(this, "ApiKeyPolicy", {
      originRequestPolicyName: "ApiKeyPolicy",
      headerBehavior: OriginRequestHeaderBehavior.allowList("x-api-key"),
      queryStringBehavior: OriginRequestQueryStringBehavior.all(),
      cookieBehavior: OriginRequestCookieBehavior.none(),
    });

    // Serving your own domain needs an ACM certificate issued in us-east-1.
    // Without both values CloudFront keeps answering on its *.cloudfront.net name.
    let customDomainProps: Partial<DistributionProps> = {};
    if (customDomainNames.length > 0) {
      if (!httpCertificate) {
        throw new Error(`customDomainNames is set to "${customDomainNames.join(", ")}" but httpCertificate is empty. CloudFront needs an ACM certificate issued in "us-east-1" to serve a custom domain.\n` + "Leave customDomainNames empty to deploy now and be served on the *.cloudfront.net name instead.");
      }
      // CloudFormation accepts any string here and CloudFront rejects it minutes
      // later, mid-deploy, with a message that does not say which value was
      // wrong. Checking the shape up front turns that into a synth error, and
      // catches the case that actually happens: the placeholder ARN that
      // .env.template ships is still in the .env file.
      if (!ACM_CERTIFICATE_ARN.test(httpCertificate)) {
        throw new Error(`httpCertificate is not a certificate ARN CloudFront can use: "${httpCertificate}".\n` + 'Expected "arn:aws:acm:us-east-1:<12 digit account>:certificate/<uuid>". CloudFront only accepts certificates issued in "us-east-1", whatever the region of the stack.\n' + 'List the ones you have with: aws acm list-certificates --region us-east-1 --query "CertificateSummaryList[].[DomainName,CertificateArn]" --output table\n' + "Leave customDomainNames empty to deploy without a custom domain.");
      }
      customDomainProps = {
        domainNames: customDomainNames,
        certificate: Certificate.fromCertificateArn(this, "ImportedCert", httpCertificate),
      };
    }

    const cfDistribution = new Distribution(this, "myDist", {
      defaultBehavior: {
        origin: new HttpOrigin(`${websiteBucket.bucketWebsiteDomainName}`, {
          protocolPolicy: OriginProtocolPolicy.HTTP_ONLY, // For static website
        }),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      ...customDomainProps,
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
          ttl: cdk.Duration.seconds(0),
        },
      ],
    });
    const origin = new HttpOrigin(`${myAPI.api.restApiId}.execute-api.${this.region}.amazonaws.com`, {});
    cfDistribution.addBehavior(apiProdBasePath, origin, {
      cachePolicy: CachePolicy.CACHING_DISABLED, // Suele ser mejor desactivar caché en APIs.
      allowedMethods: AllowedMethods.ALLOW_ALL,
      viewerProtocolPolicy: ViewerProtocolPolicy.HTTPS_ONLY,
      originRequestPolicy: OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      //originRequestPolicy: apiKeyPolicy,
    });

    // ********************** WEBSITE - ROUTE 53 **********************
    // Points your domain at the distribution. The hosted zone lookup needs the
    // stack to know its account and region (see bin/react-cdk-base-project.ts).
    if (createDnsRecord) {
      if (!hostedZoneDomain) {
        throw new Error("createDnsRecord is true but hostedZoneDomain is empty. Set it to the Route 53 hosted zone that owns your domain.");
      }
      const zone = HostedZone.fromLookup(this, "HostedZone", {
        domainName: hostedZoneDomain,
      });
      new ARecord(this, "AliasRecord", {
        zone,
        recordName: dnsRecordName, // empty means the apex of the hosted zone
        target: RecordTarget.fromAlias(new CloudFrontTarget(cfDistribution)),
      });
    }

    // ********************** WEBSITE - S3 DEPLOYMENT **********************
    // Deploying website files to S3 bucket with a cloudfront cache invalidation!
    if (deployWebsiteWithCdk) {
      const deployment = new aws_s3_deployment.BucketDeployment(this, "DeployWebsite", {
        sources: [aws_s3_deployment.Source.asset(path.join(__dirname, websiteBuildPath))],
        destinationBucket: websiteBucket,
        distribution: cfDistribution,
        distributionPaths: ["/*"],
        // Static assets are content hashed by the bundler, so they can be cached
        // for a long time; the distribution invalidation above covers index.html.
        cacheControl: [aws_s3_deployment.CacheControl.setPublic(), aws_s3_deployment.CacheControl.maxAge(cdk.Duration.days(30)), aws_s3_deployment.CacheControl.immutable()],
        retainOnDelete: false,
      });
    }

    // ********************** BUDGET **********************
    const myBudget = new budget(this, id, props);

    // ********************** CDK OUTPUTS **********************
    new cdk.CfnOutput(this, "BucketUrl", {
      value: websiteBucket.bucketWebsiteUrl,
    });
    new cdk.CfnOutput(this, "BucketName", {
      value: websiteBucket.bucketName,
    });
    new cdk.CfnOutput(this, "CloudFrontUrl", {
      value: cfDistribution.domainName,
    });
    // Read by "npm run cacheInvalidation" so the distribution id never has to be
    // hardcoded in a script or in a GitHub secret.
    new cdk.CfnOutput(this, "CloudFrontDistributionId", {
      value: cfDistribution.distributionId,
    });
    if (customDomainNames.length > 0) {
      new cdk.CfnOutput(this, "CustomDomainUrls", {
        value: customDomainNames.map((domain) => `https://${domain}`).join(", "),
      });
    }
  }
}

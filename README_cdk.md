# AWS Static Website CDK Starter

A plug-and-play CDK project to deploy a full static website in AWS with API, database, user auth, and budget protection, perfect for quick MVPs or side projects.

**🚀 Features at a glance**

- 🖼 Static website with CDN
- 🧠 Serverless API with auto-routes
- 🧑‍💻 Cognito user authentication, with optional Google login
- 🧾 Budget control with alert and (soon) auto cut-off
- 📦 Fully configurable via `.env`, with a template and a setup script
- 🌐 Your own domain with HTTPS and an automatic Route 53 record
- 🤖 Continuous integration and one click deploys from GitHub Actions

This CDK project will automatically create for you:

- A S3 bucket to host a public website
- An API with lambdas for each endpoint
- An API key to control the access and usage of your API
- A configurable AWS budget to make sure you don't get a surprise big bill, in USD, with 2 steps:
  - First an email once you reach `budgetFirstNotificationLimit`
  - Blocking all internet access to this project once you reach `budgetStopServiceLimit` (PENDING)
- Cloudfront layer for caching and centralizing internet access to your app
- A DynamoDB database to take advantage of the AWS free tier
- Creating cognito pool and pool client to connect your user website, with Google as an optional identity provider
- Serving your own domain over HTTPS with an ACM certificate and a Route 53 alias record
- Diagram of the infrastructure that will be deployed
- GitHub Actions workflows to test, synthesize and deploy the project without a local AWS login

Soon:

- Dashboard in CloudWatch (may incur costs!! 💶💵🤑)
- Observability (incurs costs!! 💶💵🤑)
- Alerting (incurs costs!! 💶💵🤑) - Errors 4XX or 5XX, spike in number of connections...

## Getting started

Follow these steps to get started:

1. Download and install dependencies `npm`, `aws cli` and `cdk`
1. Run `npm run setup`. It creates your own `.env` from `.env.template` and installs the dependencies of the CDK app and of the website
1. Edit `.env` with your values (every parameter is explained below) and check them with `npm run check:env`
1. Configure your local environment to login to AWS: `npm run login` runs `aws sso login` with the profile in `awsProfile`
1. You might need to run `cdk bootstrap` in your AWS account if this is the first time you use CDK
1. Write your react website (or change it by any other static website, like angular for example)
1. Create and write your API endpoints in the lambda folder
1. Deploy with `npm run mydeploy`, or push to `main` and let GitHub Actions do it for you

### Important commands

| Command | What it does |
| --- | --- |
| `npm run setup` | Creates `.env` from `.env.template` and installs every dependency. Add `-- --no-install` to only handle the `.env` |
| `npm run check:env` | Validates your configuration before anything is deployed |
| `npm run github:config` | Prints your configuration split into the two blocks GitHub Actions expects |
| `npm run login` | `aws sso login` with the profile configured in `awsProfile` |
| `npm test` | Type checks the CDK app and runs the tests under `test/` |
| `npm run test:python` | Runs the unittest suite of the python lambdas |
| `npm run build:website` | Builds the static website |
| `npm run build:lambdas` | Installs the python `requirements.txt` into the lambdas folder |
| `npm run tests_and_compile` | Checks the configuration, runs the tests and builds the website and the lambdas |
| `npm run mysynth` | Synthesizes the CloudFormation template without deploying |
| `npm run cdkDiff` | Shows what a deploy would change |
| `npm run mydeploy` | The full deploy: `tests_and_compile` + `cdk deploy` |
| `npm run mydeploy-force` | Same, skipping the tests |
| `npm run s3deploy` | Website only deploy: build, `s3 sync`, mime type fix and CloudFront invalidation |
| `npm run cacheInvalidation` | Invalidates the CloudFront cache on its own |
| `npm run outputs` | Prints the outputs of the deployed stack (urls, distribution id...) |

None of these commands hardcode an AWS profile any more: they read `awsProfile` and `awsRegion` from your configuration, and use the credentials already present in the environment when there are any. That is what lets GitHub Actions run the exact same scripts.

## Environment variables

The `.env` file is **git ignored**: it holds values that belong to your account and it must never be committed. The file under version control is [`.env.template`](.env.template), which lists every supported key with a safe default.

- `npm run setup` copies the template into `.env` the first time, and never overwrites an existing one.
- Run it again after pulling changes: it reports the keys that were added to the template and are missing from your file.
- `npm run check:env` validates the result. It fails when a required value is missing, and warns about the usual mistakes (a certificate outside `us-east-1`, values still holding the placeholders from the template, `appDeployedOnce` not set yet).

Precedence is always the same, locally and in CI: **a variable already present in the environment wins over the `.env` file**. That is what allows GitHub Actions to inject the configuration without any change in the code.

### Customization

In the file `.env` you can customize your application. These are the values:

```properties
# AWS account / CLI
awsProfile - Local AWS CLI profile used by the deploy scripts. Leave it empty when the credentials come from the environment (this is what GitHub Actions does)
awsRegion - Region to deploy to. Required
awsAccountId - Account id. Optional, defaults to the account of the current credentials. Required for the Route 53 lookup
stackName - CloudFormation stack name. Changing it after the first deploy creates a brand new stack, so only touch it before deploying for the first time

# Your variables
bucketName - The name of the S3 bucket you will create
httpCertificate - ARN of an ACM certificate, issued in us-east-1, for your custom domain
yourDomain - Your url domain starting with https://
notificationEmail - Your email to receive notifications from the budgets
budgetFirstNotificationLimit - Limit in $ for the monthly expense where, if exceeded, you will receive an email
budgetStopServiceLimit - Limit in $ for the monthly expense where, if exceeded, your website will be disconnected from the internet --> NOT READY YET
budgetName - The name of the budget
restApiName - The name of your API

# Custom domain (optional)
customDomainNames - Comma separated list of domains served by CloudFront, for example "example.com,www.example.com"
hostedZoneDomain - The Route 53 hosted zone that owns your domain, for example "example.com"
dnsRecordName - Sub domain for the alias record. Empty means the apex of the zone
createDnsRecord - Boolean, if true creates the Route 53 A record pointing at CloudFront

# Cognito
createCognito - Boolean, if true, will create a cognito pool and client
userPoolName - Pool name
userPoolClientName - Pool client name
cognitoCallBackPath - The path url for call back when using cognito to manage your users. We recommend leaving the default "/auth/callback"
cognitoDomainPrefix - Prefix of the hosted login page, "<prefix>.auth.<region>.amazoncognito.com". Required for Google login
cognitoExtraCallbackUrls - Extra URLs allowed after login, comma separated. Typically your localhost while developing
cognitoExtraLogoutUrls - Extra URLs allowed after logout, comma separated

# Google login (needs createCognito=true)
createGoogleLogin - Boolean, if true, adds Google as an identity provider
googleClientId - Client id of the OAuth client you created in the Google Cloud console
googleClientSecretName - Name or ARN of a Secrets Manager secret holding the client secret. Recommended
googleClientSecretField - JSON field inside that secret, if it is a JSON secret
googleClientSecret - The client secret as raw text. Simpler, but it ends up inside the CloudFormation template

# Website deployment
deployWebsiteWithCdk - Boolean. "true" uploads the website from the CDK stack, "false" leaves it to "npm run s3deploy"
websiteBuildPath - Path to the built website, relative to lib/ (used by the stack)
websiteDistPath - Path to the built website, relative to the repo root (used by "npm run s3deploy")
cloudFrontDistributionId - Optional. Skips a CloudFormation lookup when invalidating the cache

# API key - See api key documentation to know more about quota, burst and rate limits
apiKeyName - Name of the api key you will create
apiKeyQuota=1000
apiKeyRateLimit=5
apyKeyBurstLimit=5

# Single time creation tags
appDeployedOnce - This is important, a Boolean. The Budget can only be created once, so after your first "cdk deploy", you must set this to "true"
```

## Deploying from GitHub Actions

The repository ships with two workflows that run the same npm scripts described above, so a deploy from GitHub and a deploy from your laptop do exactly the same thing.

| Workflow | When it runs | What it does |
| --- | --- | --- |
| [`ci.yml`](.github/workflows/ci.yml) | Every pull request and every push to `main` | Type check, tests, website build, `npm run check:env` and `cdk synth`. It needs no AWS credentials |
| [`deploy.yml`](.github/workflows/deploy.yml) | Manually from the *Actions* tab, choosing the branch, and on every push to `main` | `npm run mydeploy` for the infrastructure, and `npm run s3deploy` for a website only deploy |

The manual run asks two things: the **branch** (or tag, or commit) to deploy, `main` by default, and **what** to deploy: `infrastructure`, `website` or `both`. The chosen ref is what gets checked out, so you can put a branch in production without merging it first.

> Do not confuse the `branch` input with the *Use workflow from* dropdown above it: that one only decides which version of the workflow file runs. What ends up in AWS is the `branch` input.

> Do not want a deploy on every push? Delete the `push:` trigger of `deploy.yml`, or add required reviewers to the `production` environment in **Settings → Environments** and every run will wait for your approval. That same screen has a *Deployment branches* rule: if you restrict it, remember that it also limits which branches the `branch` input accepts.

### 1. Where each value comes from

If you already deploy from your laptop, **your `.env` is the answer**: the workflows use exactly the same keys. Run

```bash
npm run github:config
```

and it prints your configuration already split into the two blocks below, ready to copy and paste. It leaves out `awsProfile` (a runner has no AWS profile) and tells you if something a runner cannot guess is missing.

If you are starting from scratch, this is where each value comes from:

| Value | How to get it |
| --- | --- |
| `awsAccountId` | `aws sts get-caller-identity --query Account --output text`, or the 12 digit number under your name in the top right of the AWS console |
| `awsRegion` | The region you deploy to, for example `eu-west-3`. `aws configure get region` shows your default one. It must match the region of the stack you already have: another region means another, separate stack |
| `bucketName` | You choose it, but it has to be unique across **every** AWS account. If the stack is already deployed, `npm run outputs` prints the current one |
| `notificationEmail` | Your email. AWS sends a subscription confirmation the first time the budget topic is created: you have to click it or you will get no alerts |
| `budgetName`, `restApiName`, `snsTopicName`, `tagName` | Names you pick. Changing one after a deploy replaces the resource, so choose them once |
| `budgetFirstNotificationLimit`, `budgetStopServiceLimit` | Monthly limits in USD for the warning email and for the (pending) cut-off |
| `appDeployedOnce` | `false` until the budget exists, `true` from then on. A budget can only be created once |
| `httpCertificate` | ARN of an ACM certificate **in `us-east-1`**. List the ones you have with `aws acm list-certificates --region us-east-1 --query "CertificateSummaryList[].[DomainName,CertificateArn]" --output table`, or request one with `aws acm request-certificate --domain-name example.com --subject-alternative-names www.example.com --validation-method DNS --region us-east-1` and validate it before deploying |
| `customDomainNames` | The domains that certificate covers, comma separated |
| `hostedZoneDomain` | Your zone in Route 53: `aws route53 list-hosted-zones --query "HostedZones[].Name" --output text` |
| `cloudFrontDistributionId` | Optional. `npm run outputs` prints it after a deploy; leaving it empty just means one extra CloudFormation call |
| `AWS_ROLE_ARN` | The IAM role you create in step 3 below |

Whatever you end up with, `npm run check:env` tells you if it is complete before you paste anything into GitHub.

### 2. Configure the variables

Instead of adding thirty separate entries, the workflows rebuild your `.env` from two settings, so what you have locally is what runs in CI.

**Settings → Secrets and variables → Actions → Variables → New repository variable**

| Name | Content |
| --- | --- |
| `APP_CONFIG` | The non sensitive part of your `.env`, pasted as is (`awsRegion`, `bucketName`, `restApiName`, `budgetName`, `customDomainNames`, `deployWebsiteWithCdk`, `appDeployedOnce`...) |

**Settings → Secrets and variables → Actions → Secrets → New repository secret**

| Name | Content |
| --- | --- |
| `APP_SECRETS` | The sensitive lines of your `.env`: `awsAccountId`, `httpCertificate` and `notificationEmail`. Every value in this block is masked in the logs |
| `AWS_ROLE_ARN` | ARN of the IAM role GitHub assumes through OIDC. **Recommended** |
| `AWS_ACCESS_KEY_ID` | Only if you do not use OIDC |
| `AWS_SECRET_ACCESS_KEY` | Only if you do not use OIDC |

Both blocks are plain `.env` content, one `key=value` per line, comments allowed:

```properties
# APP_CONFIG (repository variable)
awsRegion=eu-west-3
bucketName=my-unique-bucket-name
restApiName=my-api
budgetName=my-budget
budgetFirstNotificationLimit=50
budgetStopServiceLimit=100
tagName=my-project
snsTopicName=my-budget-topic
apiProdBasePath=api
deployWebsiteWithCdk=true
websiteBuildPath=../resources/react-website/build
websiteDistPath=resources/react-website/build
appDeployedOnce=true
```

```properties
# APP_SECRETS (repository secret)
awsAccountId=111122223333
httpCertificate=arn:aws:acm:us-east-1:111122223333:certificate/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
notificationEmail=you@example.com
```

Two things to keep in mind:

- `awsProfile` must **not** be part of `APP_CONFIG`: the runner has no AWS profile, its credentials come from the role. The scripts already ignore the profile when they find credentials in the environment.
- A variable or a secret is not versioned and not visible in a diff. When you change a value there, change it in your `.env` too, or the two will drift apart.

Prefer a variable per key? The workflows also honour anything you add to the `env:` block of a job: a value set there wins over the `.env` rebuilt from `APP_CONFIG`, and an empty one is ignored so it falls back instead of blanking the setting.

### 3. Give GitHub access to your AWS account

The recommended option is OIDC: GitHub receives a short lived token for each run and no permanent key is ever stored in the repository.

1. In **IAM → Identity providers**, add an OpenID Connect provider with the URL `https://token.actions.githubusercontent.com` and the audience `sts.amazonaws.com`. Only once per account: if it is already there, reuse it.
1. In **IAM → Roles → Create role → Web identity**, pick that provider and create a role trusted only by this repository. Replace the account id and `YOUR_USER/YOUR_REPO`:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Principal": { "Federated": "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com" },
         "Action": "sts:AssumeRoleWithWebIdentity",
         "Condition": {
           "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
           "StringLike": { "token.actions.githubusercontent.com:sub": "repo:YOUR_USER/YOUR_REPO:*" }
         }
       }
     ]
   }
   ```

   The `sub` condition is the important line: without it any repository on GitHub could assume your role. Narrow it further to `repo:YOUR_USER/YOUR_REPO:ref:refs/heads/main` if you only ever deploy from `main`.

1. Attach a permissions policy. `cdk deploy` works by assuming the roles that `cdk bootstrap` created, and the website deploy talks to S3 and CloudFront directly, so this covers both:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "AssumeTheCdkBootstrapRoles",
         "Effect": "Allow",
         "Action": "sts:AssumeRole",
         "Resource": "arn:aws:iam::111122223333:role/cdk-*"
       },
       {
         "Sid": "ReadTheStackOutputs",
         "Effect": "Allow",
         "Action": ["cloudformation:DescribeStacks", "ssm:GetParameter"],
         "Resource": "*"
       },
       {
         "Sid": "WebsiteOnlyDeploys",
         "Effect": "Allow",
         "Action": ["s3:ListBucket", "s3:GetObject", "s3:PutObject", "s3:DeleteObject", "cloudfront:CreateInvalidation"],
         "Resource": ["arn:aws:s3:::YOUR_BUCKET_NAME", "arn:aws:s3:::YOUR_BUCKET_NAME/*", "arn:aws:cloudfront::111122223333:distribution/*"]
       }
     ]
   }
   ```

   The last statement is only needed if you use `npm run s3deploy` (`deployWebsiteWithCdk=false` or the `website` target); with the CDK upload the first one is enough.

1. Copy the ARN of the role into the `AWS_ROLE_ARN` secret:

   ```bash
   aws iam get-role --role-name YOUR_ROLE_NAME --query Role.Arn --output text
   ```

Run `cdk bootstrap` once from your laptop before the first deploy from GitHub: bootstrapping creates those `cdk-*` roles and needs administrator rights that the deployment role does not need to have.

<details>
<summary>Without OIDC: access keys</summary>

Create an IAM user, attach the same permissions policy, generate an access key in **Security credentials → Create access key**, and store the two halves in the `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` secrets. The workflows use them automatically when `AWS_ROLE_ARN` is empty. It is the less safe option: the key does not expire on its own, so rotate it from time to time.

</details>

### 4. Deploy

Go to **Actions → Deploy → Run workflow**, choose the branch and what to deploy, and confirm. At the end of the run, the job summary shows the stack outputs: the CloudFront url, your custom domain, the bucket and the distribution id.

## Infrastructure

Here is a diagram of the infrastructure you can create with this project:
![Infrastructure Diagram](/docs/cdk-template-infra.jpg)

### API

The API will create a stage under the path in the `.env` parameter called `apiProdBasePath`.

#### API endpoints

To create a new endpoint, add a new file (for now only Python) in the `resources/lambdas` folder.
You should name your file following this nomenclature `METHOD-PATH1-#PATH_VARIABLE1-PATH2-#PATH_VARIABLE2.py/js`, where:

- `METHOD` will be used to create the endpoint with the method specified: `GET`, `POST`, `PUT`, etc.
- `PATH_VARIABLEX` will be used to create a path variable.
- `PATHX` will add a new path part.
- `-` separates path parts
  For example, `GET-trip-#id-summary-detail-#greeting.js` will create a GET endpoint with a url like `/api/trip/{id}/summary/detail/{greeting}` with the lambda.

If you need specific libraries for your lambdas in python, add a `requirements.txt` file to the lambda's folder and if you run `npm run mydeploy`, it will automatically install and deploy them.

#### API endpoint model validation

You can also add a validation for the model of your requests by creating a `.ts` file inside the `Models` folder, like the one you can see in this repo:

```TS
import { JsonSchemaType } from "aws-cdk-lib/aws-apigateway";

export const modelName = "UserModel";
export const schema = {
  type: JsonSchemaType.OBJECT,
  required: ["id", "name"],
  properties: {
    id: { type: JsonSchemaType.STRING },
    name: { type: JsonSchemaType.STRING },
  },
};
```

You can read all the validations you can make in [AWS documentation](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_apigateway.Model.html)

#### Shared code

If you want to share code between your different lambda functions, you can use the files inside the `Utils` folder.
Just import it in your code and it will work:

```PYTHON
from Utils.utils import sum
```

```JAVASCRIPT
const { sum } = require('Utils/utils');
```

#### API usage

When creating an API, an API key is automatically generated to limit the usage of the API if necessary.
You will need to retrieve the key value from your AWS account.
You can configure the API key values in the `.env` file.

#### API Security

You have 2 layers of security with this project:

- API KEY
- Cognito authorizer: This will only be set up if you choose to create a cognito pool

#### Open API specs

AWS provides an API to transform our API Gateway into a Swagger. It is not perfect, but it can be helpful sometimes.
One the Cloud Formation Outputs of this project is `commandToDownloadOpenApi`. If you copy and run this command, it will store a file in the `/docs` folder with the Swagger specs.
You can choose between `json` and `yaml` by changing the `.env` parameter `openApiExportType`.

### DATABASE

You can create your own databases by creating JSON files inside the folder `/resources/databases`.
The JSON files must follow this structure:

```JSON
{
    "pk": "pkId",
    "pkType": "S",
    "sk": "skId",
    "skType": "S",
    "readCapacity": 1,
    "writeCapacity": 1
}
```

Where:

- `pk` is the partition key. This field is mandatory
- `pkType` is the type of the partition key. This field is mandatory.
- `sk` is the sort key. This field is optional.
- `skType` is the type of the partition key. This field is optional, but only if there is no `sk`.
- `readCapacity` is the read capacity of the dynamo DB. This is optional and will have a value of 1 by default.
- `writeCapacity` is the write capacity of the dynamo DB. This is optional and will have a value of 1 by default.

To know more about read and write capacity, read [this](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/provisioned-capacity-mode.html#read-write-capacity-units)

The types can be:

- `B`: Binary
- `N`: Number
- `S`: String

### Cloudfront distribution

This project creates a cloudfront distribution to serve your API and your website. Cloudfront is used for many things, but for this project, the main 2 advantages are:

- Caching the website
- Centralizing access from the internet to our resources, so if we want to cut service due to a sudden increase in our bill, we can just configure this distribution

#### Access to resources

The distribution has 2 behaviours:

1. `/api/*` redirection to the API gateway. You can change this value by changing the parameter `apiProdBasePath` in the `.env` file.
1. Default to S3 static website

> Make sure to avoid collisions between the path to the API and any URL on your static website.

#### Custom domain and HTTPS

By default CloudFront answers on its own `*.cloudfront.net` name. To serve your own domain:

1. Request a certificate in ACM **in the `us-east-1` region** (CloudFront accepts no other region) for your domain, and validate it.
1. Put its ARN in `httpCertificate` and list the domains in `customDomainNames`, separated by commas.
1. If your domain is hosted in Route 53, set `hostedZoneDomain` to the zone, `createDnsRecord=true` and, when you want a sub domain, `dnsRecordName`. The stack then creates the A record pointing at the distribution.

`createDnsRecord` needs the stack to know its account and its region, so `awsAccountId` and `awsRegion` must be set. The result of the hosted zone lookup is cached in `cdk.context.json`: commit that file so a CI run can synthesize the stack without querying AWS.

#### Website deployment strategies

There are two ways of getting your files into the bucket, controlled by `deployWebsiteWithCdk`:

- `true` (default): the CDK stack uploads the website as part of the deploy and invalidates the CloudFront cache. One command, one source of truth. Files are uploaded with a `public, max-age=30 days, immutable` cache header, which is what you want for the hashed assets of a bundler.
- `false`: the stack only creates the bucket, and the website is uploaded with `npm run s3deploy`, which runs the tests, builds the site, does an `aws s3 sync --delete`, fixes the mime type of the `.js` files (some systems upload them as `text/plain`) and invalidates the CloudFront cache. This is considerably faster for a big site and lets you ship a content change without a CloudFormation update.

The distribution id used by the invalidation is read from the `CloudFrontDistributionId` output of the stack, so there is nothing to hardcode. Set `cloudFrontDistributionId` if you prefer to skip that lookup.

### Cognito

If you want to have users with login in your website, you can set the parameter `createCognito` to `true` in the `.env` file. This will create a Cognito Pool and a Cognito Pool Client that you can use to manage your user sessions.
In the file [Cognito on react.md](/docs/Cognito%20on%20react.md) you can see a detailed explanation on how to connect your react website to cognito in a very simple way.

#### Login with Google

Cognito can delegate the login to Google, so your users press one button instead of inventing yet another password. Set `createGoogleLogin=true` and fill in the values below; Cognito then hosts the login page, redirects to Google, and hands your website back the usual Cognito tokens. Nothing changes for the API: the id token that arrives is a normal Cognito one.

**Before anything, pick your login domain.** Federated login needs the Cognito hosted UI, and its address is predictable, so you can register it in Google before the first deploy:

```
https://<cognitoDomainPrefix>.auth.<awsRegion>.amazoncognito.com
```

Set `cognitoDomainPrefix` to something unique in your region. It only accepts lowercase letters, numbers and hyphens, and AWS rejects any prefix containing `aws`, `amazon` or `cognito`.

**1. Create the OAuth client in Google**

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create or pick a project.
1. In **APIs & Services → OAuth consent screen**, choose *External*, fill in the app name and the support email, and add the `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile` scopes. While the app is in *Testing*, only the accounts listed as test users can log in: add yours, and publish the app when you go live.
1. In **APIs & Services → Credentials → Create credentials → OAuth client ID**, pick *Web application* and fill in:
   - **Authorised JavaScript origins**: `https://<prefix>.auth.<region>.amazoncognito.com`
   - **Authorised redirect URIs**: `https://<prefix>.auth.<region>.amazoncognito.com/oauth2/idpresponse`

   That `/oauth2/idpresponse` path is Cognito's, not yours: Google returns there, and Cognito is the one that then redirects to your `cognitoCallBackPath`. After a deploy, `npm run outputs` prints this exact URL as `GoogleAuthorisedRedirectUri`, so you can check it matches.
1. Copy the **client ID** and the **client secret**.

**2. Configure the project**

```properties
createCognito=true
createGoogleLogin=true
cognitoDomainPrefix=my-login-prefix
googleClientId=1234567890-abcdefg.apps.googleusercontent.com
# While developing, so the login can come back to your dev server
cognitoExtraCallbackUrls=http://localhost:3000/auth/callback
cognitoExtraLogoutUrls=http://localhost:3000/
```

The client secret has two homes, pick one:

- **Secrets Manager (recommended).** Store it once and reference it by name. CloudFormation resolves it at deploy time, so the value never appears in the synthesized template:

  ```bash
  aws secretsmanager create-secret --name google-oauth --secret-string '{"clientSecret":"THE_SECRET"}'
  ```

  ```properties
  googleClientSecretName=google-oauth
  googleClientSecretField=clientSecret
  ```

  A secret costs around 0.40 USD per month, which is the only part of this feature outside the free tier.

- **Raw value.** `googleClientSecret=THE_SECRET`. Free, but the secret ends up inside the CloudFormation template, readable by anyone who can read the stack. `npm run check:env` warns you when you take this route.

Either way, run `npm run check:env`: it refuses to continue if the domain prefix, the client id or the secret are missing, and reminds you that `createGoogleLogin` does nothing while `createCognito` is false.

**3. In GitHub Actions**

`googleClientId` and `cognitoDomainPrefix` are not secret, so they belong in the `APP_CONFIG` variable. `googleClientSecret` is, so it goes in the `APP_SECRETS` secret; `npm run github:config` already sorts it into the right block. With the Secrets Manager option there is nothing to add to GitHub at all: only the name of the secret, which is not sensitive.

**What the deploy creates**

| Output | What it is for |
| --- | --- |
| `CognitoHostedUiDomain` | The base URL of the hosted login page |
| `GoogleAuthorisedRedirectUri` | Paste it in the Google OAuth client, it has to match exactly |
| `CognitoLoginUrl` | The login page with both options, Google and email plus password |
| `GoogleLoginUrl` | Goes straight to Google, skipping the Cognito page. This is the one behind a "Continue with Google" button |

[Cognito on react.md](/docs/Cognito%20on%20react.md) shows how to send the user there and how to handle the redirect back.

**Two things worth knowing**

- Cognito confirms federated users itself, so the `PostConfirmation` trigger never fires for them. The stack wires the same lambda to `PreSignUp` when Google is enabled, which is the trigger that does fire, so a Google user also lands in your `users` table.
- Cognito does not merge accounts on its own. Somebody who signed up with email and password and later presses "Continue with Google" with the same address gets an "account already exists" error. Linking the two requires an `AdminLinkProviderForUser` call, which this template does not do for you.


#### Trigger for new users

We have added a lambda function [here](/lib/Cognito/lambdaNewUser.py) that will be triggered every time a new user registers in your Cognito user pool.
You will need to configure a couple things to make it work for your needs:

1. You must change the code of your lambda. We put an example of storing the user data in a DynamoDB table, but you might need something else.
1. In the [Cognito.ts](/lib/Cognito/cognito.ts) file, we have this line `const table = Table.fromTableName(scope, "usersTableForCognito", "users");` that allows the lambda to read and write to the `users` table. If you name your table differently, you will need to change this.

### Expected costs of this infrastructure

With all these AWS products, we are taking advantage of the free tier, but with enough usage, you will surpase the thresholds for the free tier.
In [this document](/docs/Free%20tier%20short%20explanation.md) you can see the detailed list of what to expect (as of March2025 and an approximation/simplification, visit AWS pricing website for the real values).

### Testing

We recommend you write code for your lambdas.
For the moment, we only support testing Node JS lambdas. To do it, you just need to:

1. Create your `.test.ts` or `.test.js` files inside the folder `tests` (follow the template from the file `POST-person.test.js`)
1. Run it with `npm test`

The same folder also holds the tests of the infrastructure itself, written with [`aws-cdk-lib/assertions`](https://docs.aws.amazon.com/cdk/v2/guide/testing.html): they synthesize the stack with different configurations and check the resulting template, which is how the Google login is verified without deploying anything. Python lambdas are tested with `unittest` in `test/test_*.py` and run with `npm run test:python`.

These tests, together with the type check and a `cdk synth`, run on every pull request through the `CI` workflow, and again before every deploy.

### Component Ideas

- Loaders:
  - Campfire https://uiverse.io/Admin12121/stupid-mouse-29
  - World https://uiverse.io/Novaxlo/rotten-lionfish-4
- Toggles:
  - https://uiverse.io/Nawsome/silent-owl-45

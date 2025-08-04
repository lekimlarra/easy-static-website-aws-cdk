# AWS Static Website CDK Starter

A plug-and-play CDK project to deploy a full static website in AWS with API, database, user auth, and budget protection, perfect for quick MVPs or side projects.

**🚀 Features at a glance**

- 🖼 Static website with CDN
- 🧠 Serverless API with auto-routes
- 🧑‍💻 Cognito user authentication
- 🧾 Budget control with alert and (soon) auto cut-off
- 📦 Fully configurable via `.env`

This CDK project will automatically create for you:

- A S3 bucket to host a public website
- An API with lambdas for each endpoint
- An API key to control the access and usage of your API
- A configurable AWS budget to make sure you don't get a surprise big bill, in USD, with 2 steps:
  - First an email once you reach `budgetFirstNotificationLimit`
  - Blocking all internet access to this project once you reach `budgetStopServiceLimit` (PENDING)
- Cloudfront layer for caching and centralizing internet access to your app
- A DynamoDB database to take advantage of the AWS free tier
- Creating cognito pool and pool client to connect your user website
- Diagram of the infrastructure that will be deployed

Soon:

- Automatic deploy from GitHub actions and secrets
- Dashboard in CloudWatch (may incur costs!! 💶💵🤑)
- Observability (incurs costs!! 💶💵🤑)
- Alerting (incurs costs!! 💶💵🤑) - Errors 4XX or 5XX, spike in number of connections...
- Route 53 domain url
- HTTPS certificate

## Getting started

Follow these steps to get started:

1. Download and install depencencies `npm`, `aws cli` and `cdk`
1. Configure your local environment to login to AWS. This project will deploy to the region you have as default
1. Review the `.env` file and change the values to whatever you want (In a section below all the parameters are explained)
1. Run `npm i` in the main folder of this project and inside the website react folder.
1. Write your react website (or change it by any other static website, like angular for example)
1. Create and write your API endpoints in the lambda folder
1. If you want to filter your budget for only the resources on this project, you will need to create

### Important commands

- `aws sso login` to login to AWS before doing a deploy
- `npm run build` compile the react website (run it in the folder of the website configured in `websiteBuildPath`)
- `cdk deploy` to deploy the infrastructure
- You might need to run `cdk bootstrap` in your AWS account if this is the first time you use CDK.
- There is a custom command to compile the website and deploy the cdk stack together --> `npm run mydeploy`. This command will also install the python libraries that are in your `requirements.txt` in your lambda's folder.

### Customization

In the file `.env` you can customize your application. These are the values:

```properties
# Your variables
bucketName - The name of the S3 bucket you will create
# Soon httpCertificate=arn:aws:acm:us-east-1:ACCOUNT:certificate/UUID
yourDomain - Your url domain starting with https://
notificationEmail - Your email to receive notifications from the budgets
budgetFirstNotificationLimit - Limit in $ for the monthly expense where, if exceeded, you will receive an email
budgetStopServiceLimit - Limit in $ for the monthly expense where, if exceeded, your website will be disconnected from the internet --> NOT READY YET
budgetName - The name of the budget
restApiName - The name of your API

# Cognito
createCognito - Boolean, if true, will create a cognito pool and client
userPoolName - Pool name
userPoolClientName - Pool client name
cognitoCallBackPath - The path url for call back when using cognito to manage your users. We recommend leaving the default "/auth/callback"

# API key - See api key documentation to know more about quota, burst and rate limits
apiKeyName - Name of the api key you will create
apiKeyQuota=1000
apiKeyRateLimit=5
apyKeyBurstLimit=5

# Single time creation tags
appDeployedOnce - This is important, a Boolean. The Budget can only be created once, so after your first "cdk deploy", you must set this to "true"
```

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

### Cognito

If you want to have users with login in your website, you can set the parameter `createCognito` to `true` in the `.env` file. This will create a Cognito Pool and a Cognito Pool Client that you can use to manage your user sessions.
In the file [Cognito on react.md](/docs/Cognito%20on%20react.md) you can see a detailed explanation on how to connect your react website to cognito in a very simple way.

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

### Component Ideas

- Loaders:
  - Campfire https://uiverse.io/Admin12121/stupid-mouse-29
  - World https://uiverse.io/Novaxlo/rotten-lionfish-4
- Toggles:
  - https://uiverse.io/Nawsome/silent-owl-45

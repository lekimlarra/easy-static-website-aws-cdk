import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Topic } from "aws-cdk-lib/aws-sns";
import { EmailSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
import { CfnBudget } from "aws-cdk-lib/aws-budgets";
import { PolicyStatement, ServicePrincipal } from "aws-cdk-lib/aws-iam";

const notificationEmail = process.env.notificationEmail ?? "";
const snsTopicName = process.env.snsTopicName ?? "";
const budgetFirstNotificationLimit = process.env.budgetFirstNotificationLimit ?? 10;
const budgetStopServiceLimit = process.env.budgetStopServiceLimit ?? 100;
const tagName = process.env.tagName ?? "react-cdk-base-project";
const budgetName = process.env.budgetName ?? "";
const appDeployedOnce = process.env.appDeployedOnce == "true";

export class budget {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    const firstThreshold = Number(budgetFirstNotificationLimit) / Number(budgetStopServiceLimit);
    // Topic for notifications
    const budgetTopic = new Topic(scope, "BudgetNotificationsTopic", {
      displayName: snsTopicName,
    });
    budgetTopic.addSubscription(new EmailSubscription(notificationEmail));

    if (appDeployedOnce) {
      // Budget definition
      const myBudget = new CfnBudget(scope, "MonthlyBudget", {
        budget: {
          budgetName: budgetName,
          budgetLimit: {
            amount: Number(budgetFirstNotificationLimit),
            unit: "USD",
          },
          timeUnit: "MONTHLY",
          budgetType: "COST",
        },
        //costFilters: {
        //  TagKeyValue: [`Project$${tagName}`],
        //},
        notificationsWithSubscribers: [
          {
            // First notification
            notification: {
              threshold: firstThreshold,
              notificationType: "ACTUAL",
              comparisonOperator: "GREATER_THAN",
            },
            subscribers: [
              {
                subscriptionType: "SNS",
                address: budgetTopic.topicArn,
              },
            ],
          },
          {
            // Notification to stop service
            notification: {
              threshold: 100, // 100% of the budget
              notificationType: "ACTUAL",
              comparisonOperator: "GREATER_THAN",
            },
            subscribers: [
              {
                subscriptionType: "SNS",
                address: budgetTopic.topicArn,
              },
            ],
          },
        ],
      });
    }

    // Allowing the budget to publish to the topic
    budgetTopic.addToResourcePolicy(
      new PolicyStatement({
        actions: ["SNS:Publish"],
        principals: [new ServicePrincipal("budgets.amazonaws.com")],
        resources: [budgetTopic.topicArn],
      })
    );
  }
}

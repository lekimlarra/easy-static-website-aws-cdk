## Summary of potential costs

| Service             | Free Tier                                            | Cost after Free Tier                                      |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| S3 (Static Hosting) | 5 GB storage + 20,000 GET + 2,000 PUT/POST per month | $0.023/GB + $0.004 per 10,000 GET requests                |
| Lambda              | 1M invocations + 400k GB-seconds per month           | $0.20 per million invocations + $0.00001667 per GB-second |
| DynamoDB            | 25 GB storage + 25 RCU + 25 WCU per month            | $0.25/GB + $0.00065 per RCU + $0.00065 per WCU            |
| Cognito             | 50,000 Monthly Active Users (MAU)                    | $0.0055 per MAU (after free tier)                         |
| CloudFront          | 1 TB data transfer per month                         | From $0.085 per GB (varies by region)                     |
| Budgets             | 2 budgets (basic, no actions)                        | $0.10 per additional budget (with alerts/actions)         |
| SNS                 | 1M publishes per month                               | $0.50 per million publishes                               |

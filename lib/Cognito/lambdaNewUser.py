import json, boto3

'''
Event received:
{
    "version": "1",
    "region": "<REGION>",
    "userPoolId": "<USER POOL ID>",
    "userName": "<USERID>",
    "callerContext": {
        "awsSdkVersion": "aws-sdk-unknown-unknown",
        "clientId": "<CLIENT ID>"
    },
    "triggerSource": "PostConfirmation_ConfirmSignUp",
    "request": {
        "userAttributes": {
            "sub": "<USERID>",
            "email_verified": "true",
            "cognito:user_status": "CONFIRMED",
            "given_name": "<NAME>",
            "family_name": "<FAMILY NAME>",
            "email": "<EMAIL>"
        }
    },
    "response": {}
}
'''

def lambda_handler(event, context):
    print("Received event:", json.dumps(event))
    cognito_user_id = event['userName']
    triggerSource = event['triggerSource']

    user_attributes = event['request']['userAttributes']
    user_email = user_attributes.get('email')
    user_name = user_attributes.get('given_name')
    family_name = user_attributes.get('family_name')
    print(f"New registered user: {user_name} {family_name} with email: {user_email} and cognito user id: {cognito_user_id}")

    # TODO Add your logic here
    # Example storing in a dynamoDB table
    if triggerSource == "PostConfirmation_ConfirmSignUp":
        try:
            dynamodb = boto3.resource('dynamodb')
            table = dynamodb.Table('users')
            table.put_item(
                Item={
                    "pk": f"USER#{cognito_user_id}",
                    "sk": "PROFILE",
                    "email": user_email,
                    "name": user_name,
                    "surname": family_name
                }
            )
        except Exception as e:
            print("Error creating user:", e)
            return {
            'statusCode': 500,
            'headers': {
                "Access-Control-Allow-Origin" : "*",
                "Access-Control-Allow-Credentials" : True
            },
            'body': json.dumps('Error storing user')
        }
    return event

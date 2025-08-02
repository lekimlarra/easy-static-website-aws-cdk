import base64, json, os, boto3
from boto3.dynamodb.conditions import Key, Attr
from decimal import Decimal

from Utils.utils import sum

dynamodb = boto3.resource('dynamodb')

def handler(event, context):
    try:
        result = sum(3, 5)
        print("layer working if this is 8:", result)
        res = {
            'statusCode': 200,
            'headers': {
                "Access-Control-Allow-Origin" : "*",
                "Access-Control-Allow-Credentials" : True
            },
            'body': json.dumps({
                "response": "ok"
            }, default=handle_decimal_type)
        }
    except Exception as e:
        print("Error in main function:", e)
        res = {
            'statusCode': 500,
            'headers': {
                "Access-Control-Allow-Origin" : "*",
                "Access-Control-Allow-Credentials" : True
            },
            'body': json.dumps('Error')
        }
    return res


def handle_decimal_type(obj):
  if isinstance(obj, Decimal):
      if float(obj).is_integer():
         return int(obj)
      else:
         return float(obj)
  raise TypeError


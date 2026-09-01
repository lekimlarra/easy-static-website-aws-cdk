"""Tests for the Cognito trigger lambda.

boto3 only exists inside the Lambda runtime, so it is replaced by a stub here:
that keeps the test runnable with a bare Python and still lets us assert what
would have been written to DynamoDB.
"""
import importlib
import sys
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib" / "Cognito"))


class FakeTable:
    def __init__(self):
        self.items = []

    def put_item(self, Item):  # noqa: N803 - boto3 spells it this way
        self.items.append(Item)


class LambdaNewUserTest(unittest.TestCase):
    def setUp(self):
        self.table = FakeTable()
        boto3 = types.ModuleType("boto3")
        boto3.resource = lambda name: types.SimpleNamespace(Table=lambda _: self.table)
        sys.modules["boto3"] = boto3
        self.handler = importlib.reload(importlib.import_module("lambdaNewUser"))

    def event(self, trigger_source, user_name="user-id-1"):
        return {
            "userName": user_name,
            "triggerSource": trigger_source,
            "request": {
                "userAttributes": {
                    "email": "someone@example.com",
                    "given_name": "Ada",
                    "family_name": "Lovelace",
                }
            },
            "response": {},
        }

    def test_native_signup_is_stored(self):
        self.handler.lambda_handler(self.event("PostConfirmation_ConfirmSignUp"), None)
        self.assertEqual(
            self.table.items,
            [{
                "pk": "USER#user-id-1",
                "sk": "PROFILE",
                "email": "someone@example.com",
                "name": "Ada",
                "surname": "Lovelace",
            }],
        )

    def test_google_signup_is_stored_too(self):
        # Cognito confirms federated users itself, so PostConfirmation never
        # fires for them: PreSignUp is the only chance to record the profile.
        event = self.event("PreSignUp_ExternalProvider", user_name="google_1234567890")
        self.handler.lambda_handler(event, None)
        self.assertEqual(len(self.table.items), 1)
        self.assertEqual(self.table.items[0]["pk"], "USER#google_1234567890")

    def test_google_signup_is_auto_confirmed(self):
        # Without this the sign in stops on a confirmation code nobody will send.
        event = self.event("PreSignUp_ExternalProvider")
        result = self.handler.lambda_handler(event, None)
        self.assertTrue(result["response"]["autoConfirmUser"])
        self.assertTrue(result["response"]["autoVerifyEmail"])

    def test_native_signup_is_not_auto_confirmed(self):
        result = self.handler.lambda_handler(self.event("PreSignUp_SignUp"), None)
        self.assertEqual(result["response"], {})

    def test_other_triggers_store_nothing(self):
        self.handler.lambda_handler(self.event("PreAuthentication_Authentication"), None)
        self.assertEqual(self.table.items, [])

    def test_the_event_is_returned_untouched_for_cognito_to_continue(self):
        event = self.event("PostConfirmation_ConfirmSignUp")
        self.assertIs(self.handler.lambda_handler(event, None), event)


if __name__ == "__main__":
    unittest.main()

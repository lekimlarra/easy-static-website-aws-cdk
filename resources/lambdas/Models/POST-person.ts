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

import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda"
import * as AWSRay from "aws-xray-sdk"

AWSRay.captureAWS(require('aws-sdk'))

export async function handler(event: APIGatewayProxyEvent, context: Context):Promise<APIGatewayProxyResult> {
    console.log(event)

    return {
        statusCode: 200,
        body: 'Ok'
    }
}
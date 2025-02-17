import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { ApiGatewayManagementApi, DynamoDB, S3 } from "aws-sdk";
import * as AWSXRay from 'aws-xray-sdk'
import { v4 as uuid } from "uuid";

AWSXRay.captureAWS(require('aws-sdk'))

//essas variaveis de ambiente foram construidas dentro da criação da stack
const invoicesDdb = process.env.INVOICE_DDB!
const bucketName = process.env.BUCKET_NAME!
const invoicesWsApiEndpoint = process.env.INVOICES_WS_API_ENDPOINT!.substring(6)

const s3Client = new S3();
const ddbClient = new DynamoDB.DocumentClient();
const apigwManagementApi = new ApiGatewayManagementApi({
    endpoint: invoicesWsApiEndpoint
    
})


export async function handler (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {

    //TODO - to be removed
    console.log(event);

    const lambdaRequestId = context.awsRequestId;
    const connectionId = event.requestContext.connectionId!;

    const key = uuid();
    const expires = 300;


    const signedUrlPut = await s3Client.getSignedUrlPromise('putObject', {
        Bucket: bucketName,
        Key: key,
        Expires: expires
    })

    console.log(`ConnectionId: ${connectionId} - Lambda RequestID: ${lambdaRequestId}`)
    return {
        statusCode: 200,
        body: 'Ok'
    }
}
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda"
import { ApiGatewayManagementApi, DynamoDB } from "aws-sdk"
import * as AWSRay from "aws-xray-sdk"
import { InvoiceTransactionRepository, InvoiceTransactionStatus } from "/opt/nodejs/invoiceTransaction"
import { InvoiceWSService } from "/opt/nodejs/invoiceWSConnection"

AWSRay.captureAWS(require('aws-sdk'))

const invoicesDdb = process.env.INVOICE_DDB!
const invoicesWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT!.substring(6)

const ddbClient = new DynamoDB.DocumentClient();
// acessar o webSocket
const apigwManagementApi = new ApiGatewayManagementApi({
    endpoint: invoicesWsApiEndpoint
})
const invoiceTransactionRepository = new InvoiceTransactionRepository(ddbClient, invoicesDdb)
const invoiceWSService = new InvoiceWSService(apigwManagementApi)

export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {

    //pegando o parametro que vem no body da requisição do webhook
    const transactionId = JSON.parse(event.body!).transactionId as string
    const lambdaRequestId = context.awsRequestId
    const connectionId = event.requestContext.connectionId!

    console.log(`ConnectionId: ${connectionId} - Lambda ResquestId: ${lambdaRequestId}`)

    try {
        const invoiceTransaction = await invoiceTransactionRepository.getInvoiceTransaction(transactionId)

        if (invoiceTransaction.transactionStatus === InvoiceTransactionStatus.GENERATED) {
            await Promise.all([invoiceWSService.sendInvoiceStatus(transactionId, connectionId, InvoiceTransactionStatus.CANCELLED), 
                invoiceTransactionRepository.updateInvoiceTransaction(transactionId, InvoiceTransactionStatus.CANCELLED)])

        } else {
            await invoiceWSService.sendInvoiceStatus(transactionId, connectionId, invoiceTransaction.transactionStatus)

            console.error(`Can't cancel an ongoing process`)
        }
    } catch (error) {
        console.error((<Error>error).message)
        console.error(`Invoice Transaction not found - TransactId ${transactionId}`)
        await invoiceWSService.sendInvoiceStatus(transactionId, connectionId, InvoiceTransactionStatus.NOT_FOUND)
    }
    return {
        statusCode: 200,
        body: 'Ok'
    }
}
import { AttributeValue, Context, DynamoDBStreamEvent } from "aws-lambda";
import { ApiGatewayManagementApi, DynamoDB, EventBridge } from "aws-sdk";
import * as AWSXRay from "aws-xray-sdk";
import { InvoiceWSService } from "/opt/nodejs/invoiceWSConnection";


AWSXRay.captureAWSClient(require("aws-sdk"))

const eventsDdb = process.env.EVENTS_DDB!
const invoiceWsApiEndpoint = process.env.INVOICE_WSAPI_ENDPOINT!
const auditBusName = process.env.AUDIT_BUS_NAME!
const eventBridgeClient = new EventBridge();

const ddbClient = new DynamoDB.DocumentClient()
const apigwManagementApi = new ApiGatewayManagementApi({
    endpoint: invoiceWsApiEndpoint
})


const invoiceWSService = new InvoiceWSService(apigwManagementApi)
export async function handler(event: DynamoDBStreamEvent, context: Context): Promise<void> {
    const promises: Promise<void>[] = []

    event.Records.forEach((record) => {
        if (record.eventName === 'INSERT') {
            if (record.dynamodb!.NewImage!.pk.S!.startsWith('#transaction')) { //verifica de contem uma nova imagem, verifica se o pk é uma string e começa com transaction
                console.log('Invoice transaction event received')
            } else {
                console.log('invoice event received')
                promises.push(createEvent(record.dynamodb!.NewImage!, "INVOICE_CREATED"))
            }
        } else if (record.eventName === 'MODIFY') {

        } else if (record.eventName === 'REMOVE') {
            if (record.dynamodb!.OldImage!.pk.S === '#transaction') {
                console.log('Invoice transaction event received')
                promises.push(processExpiredTransaction(record.dynamodb!.OldImage!))
            }
        }
    })

    await Promise.all(promises)
}

async function processExpiredTransaction(invoiceTransactionImage: { [key: string]: AttributeValue }):
    Promise<void> {
    const transactionId = invoiceTransactionImage.sk.S!
    const connectionId = invoiceTransactionImage.connectionId.S!

    console.log(`Transaction Id: ${transactionId} - ConnectionId: ${connectionId}`)

    if (invoiceTransactionImage.transactionStatus.S === 'INVOICE_PROCESSED') {
        console.log('Invoice processed')
    } else {
        console.log(`Invoice import failed - Status : ${invoiceTransactionImage.transactionStatus.S}`)

        const puEventPromise = eventBridgeClient.putEvents({
            Entries: [{
                Source: 'app.invoice',
                EventBusName: auditBusName,
                DetailType: 'invoice',
                Time: new Date(),
                Detail: JSON.stringify({
                    errorDetails: 'TIMEOUT',
                    transactionId: transactionId,
                })
            }]
        }).promise()

        const sendStatusPromise = invoiceWSService.sendInvoiceStatus(transactionId, connectionId, 'TIMEOUT')

        await Promise.all([puEventPromise, sendStatusPromise])

        await invoiceWSService.disconnectClient(connectionId)
    }
}

async function createEvent(invoiceImage: { [key: string]: AttributeValue }, eventType: string) {
    const timestamp = Date.now()
    const ttl = ~~(timestamp / 1000 + 60 * 60)

    await ddbClient.put({
        TableName: eventsDdb,
        Item: {
            pk: `#invoice_${invoiceImage.pk.S}`,
            sk: `${eventType}#${timestamp}`,
            ttl: ttl,
            email: invoiceImage.email.S!.split('_')[1],
            createdAt: timestamp,
            event: eventType,
            info: {
                transaction: invoiceImage.transactionId.S,
                productId: invoiceImage.productId.N,
                quantity: invoiceImage.quantity.N,
            }
        }
    }).promise()

    return
}
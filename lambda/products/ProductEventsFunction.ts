import { DynamoDB } from "aws-sdk";
import { ProductEvent } from "/opt/nodejs/producteEventsLayer";
import { Context, Callback } from "aws-lambda";
import * as AWSXRay from "aws-xray-sdk";
import { timeStamp } from "console";

AWSXRay.captureAWS(require("aws-sdk")) //captura o uso do AWS SDK

const eventsDdb = process.env.EVENTS_DDB! //variável de ambiente que vai ser usada para acessar a tabela de eventos
const ddbClient = new DynamoDB.DocumentClient() //cliente do DynamoDB

export async function handler(event: ProductEvent, context: Context, callback: Callback): Promise<void> {

    //TODO - TO BE REMOVED
    console.log("Evento", event)

    console.log(`Lambda requestId: ${context.awsRequestId}`)

    await createEvent(event)

    callback(null, JSON.stringify({
        productEventCreated: true,
        message: "OK"
    }))
}

function createEvent(event: ProductEvent) {
    const timestamp = Date.now();
    const ttl = ~~(timestamp / 1000 + 5 * 60) //adiciona 5 minutos ao timestamp atual. ~~ é um operador que serve para arredondar o valor

    return ddbClient.put({
        TableName: eventsDdb,
        Item: {
            pk: `#product_${event.productCode}`,
            sk: `${event.eventType}#${timestamp}`, //PRODUCT_CREATED#1452369
            email: event.email,
            createdAt: timeStamp,
            requestId: event.requestId,
            eventType: event.eventType,
            info: {
                productId: event.productId,
                price: event.productPrice
            },
            ttl: ttl
        }
    }).promise()
}
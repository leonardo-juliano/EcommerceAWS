import { DynamoDB } from "aws-sdk"
import { ProductRepository } from "/opt/nodejs/productsLayer"
import { OrderRepository } from "/opt/nodejs/ordersLayer"
import * as AWSXRay from "aws-xray-sdk"
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda"

const ordersDdb = process.env.ORDERS_DDB!
const productsDdb = process.env.PRODUCTS_DDB!

const ddbClient = new DynamoDB.DocumentClient()

const orderRepository = new OrderRepository(ddbClient, ordersDdb)
const productsRepository = new ProductRepository(ddbClient, productsDdb)

export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    const method = event.httpMethod
    const apiRequestId = event.requestContext.requestId
    const lambdaRequestId = context.awsRequestId

    console.log(`Api Gateway requestId: ${apiRequestId} - LambdaRequestId: ${lambdaRequestId}`)

    if (method === 'GET') {
        if(event.queryStringParameters) {
            const email = event.queryStringParameters!.email
            const orderId = event.queryStringParameters!.orderId
            if(email) {
                if(orderId){
                    //Get one order from an user
                } else {
                    //Get all orders from an user
                }
            }
        } else { 
            //GET ALL ORDERS
        }
    } else if (method === 'POST') {
        console.log('POST /ORDERS')

    } else if (method === 'DELETE'){
        console.log('DELETE /ORDERS')
        const email = event.queryStringParameters!.email
        const orderId = event.queryStringParameters!.orderId
    }


    return {
        statusCode: 400,
        body: "Bad Request"
    }
}
import { DynamoDB, SNS } from "aws-sdk"
import { Product, ProductRepository } from "/opt/nodejs/productsLayer"
import { Order, OrderRepository } from "/opt/nodejs/ordersLayer"
import * as AWSXRay from "aws-xray-sdk"
import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda"
import { CarrierType, OrderProductResponse, OrderResponse, OrderResquest, PaymentType, ShippingType } from "/opt/nodejs/ordersApiLayer"
import { OrderEvent, OrderEventType, Envelope } from '/opt/nodejs/orderEventsLayer'

const ordersDdb = process.env.ORDERS_DDB!
const productsDdb = process.env.PRODUCTS_DDB!

const ddbClient = new DynamoDB.DocumentClient();
const snsClient = new SNS();
const orderEventsTopicArn = process.env.ORDER_EVENTS_TOPIC_ARN!

const orderRepository = new OrderRepository(ddbClient, ordersDdb)
const productRepository = new ProductRepository(ddbClient, productsDdb)

export async function handler(event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> {
    const method = event.httpMethod
    const apiRequestId = event.requestContext.requestId
    const lambdaRequestId = context.awsRequestId

    console.log(`Api Gateway requestId: ${apiRequestId} - LambdaRequestId: ${lambdaRequestId}`)

    if (method === 'GET') {
        if (event.queryStringParameters) {
            const email = event.queryStringParameters!.email
            const orderId = event.queryStringParameters!.orderId
            if (email) {
                if (orderId) {
                    //Get one order from an user
                    try {
                        const order = await orderRepository.getOrder(email, orderId)
                        return {
                            statusCode: 200,
                            body: JSON.stringify(convertOrderToResponse(order))
                        }
                    } catch (error) {
                        console.log((<Error>error).message)
                        return {
                            statusCode: 404,
                            body: (<Error>error).message
                        }
                    }

                } else {
                    //Get all orders from an user
                    const orders = await orderRepository.getOrdersByEmail(email)
                    return {
                        statusCode: 200,
                        body: JSON.stringify(orders.map(convertOrderToResponse))
                    }
                }
            }
        } else {
            //GET ALL ORDERS
            //desta forma nao é a mais recomendada pois faz um scan na tabela inteira, não é muito performatico
            const orders = await orderRepository.getAllOrders()
            return {
                statusCode: 200,
                body: JSON.stringify(orders.map(convertOrderToResponse))
            }
        }
    } else if (method === 'POST') {
        console.log('POST /ORDERS');
        const orderRequest = JSON.parse(event.body!) as OrderResquest
        const products = await productRepository.getProductByIds(orderRequest.productIds)
        if (products.length === orderRequest.productIds.length) {
            const order = buildOrder(orderRequest, products)
            const orderCreated = await orderRepository.createOrder(order)

            await sendOrderEvent(orderCreated, OrderEventType.CREATED, lambdaRequestId)
            console.log(`Order created event sent - OrderId: ${orderCreated.sk}
                - MessageId: ${orderCreated.sk}-${lambdaRequestId}`)

            return {
                statusCode: 201,
                body: JSON.stringify(convertOrderToResponse(orderCreated))
            }
        } else {
            return {
                statusCode: 400,
                body: "Some product was not found"
            }
        }
    } else if (method === 'DELETE') {
        console.log('DELETE /ORDERS')
        const email = event.queryStringParameters!.email!
        const orderId = event.queryStringParameters!.orderId!

        try {
            const orderDelete = await orderRepository.deleteORder(email, orderId)

            await sendOrderEvent(orderDelete, OrderEventType.DELETED, lambdaRequestId)
            console.log(`Order Deleted event sent - OrderId: ${orderDelete.sk}
                - MessageId: ${orderDelete.sk}-${lambdaRequestId}`)

            return {
                statusCode: 200,
                body: JSON.stringify(convertOrderToResponse(orderDelete))
            }
        } catch (error) {
            console.log((<Error>error).message)
            return {
                statusCode: 404,
                body: (<Error>error).message
            }
        }

    }

    return {
        statusCode: 400,
        body: "Bad Request"
    }
}

function sendOrderEvent(order: Order, eventType: OrderEventType, lambdaRequestId: string) {

    const productCodes: string[] = []
    order.products.forEach((product) => {
        productCodes.push(product.code)
    })

    const orderEvent: OrderEvent = {
        email: order.pk,
        orderId: order.sk!,
        billing: order.billing,
        shipping: order.shipping,
        requestID: lambdaRequestId,
        productCodes: productCodes,
    }

    const envelope: Envelope = {
        eventType,
        data: JSON.stringify(orderEvent)
    }
    return snsClient.publish({
        TopicArn: orderEventsTopicArn,
        Message: JSON.stringify(envelope)
    }).promise()
}

function convertOrderToResponse(order: Order): OrderResponse {
    const orderProducts: OrderProductResponse[] = [];
    order.products.forEach((product) => {
        orderProducts.push({
            code: product.code,
            price: product.price
        })
    })

    const orderResponse: OrderResponse = {
        email: order.pk,
        id: order.sk!,
        createdAt: order.createdAt!,
        products: orderProducts,
        billing: {
            payment: order.billing.payment as PaymentType,
            totalPrice: order.billing.totalPrice
        },
        shipping: {
            type: order.shipping.type as ShippingType,
            carrier: order.shipping.carrier as CarrierType
        }
    }

    return orderResponse

}

function buildOrder(orderRequest: OrderResquest, products: Product[]): Order {
    const orderProducts: OrderProductResponse[] = [];
    let totalPrice = 0;

    products.forEach((product) => {
        totalPrice += product.price
        orderProducts.push({
            code: product.code,
            price: product.price,
        })
    })

    const order: Order = {
        pk: orderRequest.email,
        billing: {
            payment: orderRequest.payment,
            totalPrice: totalPrice
        },
        shipping: {
            type: orderRequest.shipping.type,
            carrier: orderRequest.shipping.carrier,
        },
        products: orderProducts
    }

    return order
}
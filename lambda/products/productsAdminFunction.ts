import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { Product, ProductRepository } from "/opt/nodejs/productsLayer";
import { DynamoDB, Lambda } from "aws-sdk"
import * as AWSRay from "aws-xray-sdk"
import { ProductEvent, ProductEventType } from "/opt/nodejs/producteEventsLayer";

AWSRay.captureAWS(require("aws-sdk"))

const productsDdb = process.env.PRODUCTS_DDB!
const productEventsFunctionName = process.env.PRODUCT_EVENTS_FUNCTION_NAME!

const ddbClient = new DynamoDB.DocumentClient()
const lambdaClient = new Lambda()

const productRepository = new ProductRepository(ddbClient, productsDdb)

export async function handler(event: APIGatewayProxyEvent,
    context: Context): Promise<APIGatewayProxyResult> {

    const lambdaRequestId = context.awsRequestId
    const apiRequestId = event.requestContext.requestId

    console.log(`API Gateway RequestId: ${apiRequestId} - Lambda RequestId: ${lambdaRequestId}`)

    if (event.resource === "/products") {
        console.log("POST /products")
        const product = JSON.parse(event.body!) as Product
        const productCreated = await productRepository.create(product)

        const response = await sendProductEvent(productCreated,
            ProductEventType.CREATED,
            "matilde@siecola.com.br", lambdaRequestId)
        console.log(response)

        return {
            statusCode: 201,
            body: JSON.stringify(productCreated)
        }
    } else if (event.resource === "/products/{id}") {
        const productId = event.pathParameters!.id as string
        if (event.httpMethod === "PUT") {
            console.log(`PUT /products/${productId}`)
            const product = JSON.parse(event.body!) as Product
            try {
                const productUpdated = await productRepository.updateProduct(productId, product)

                const response = await sendProductEvent(productUpdated, ProductEventType.UPDATED, "leonardo@cooxupe.com.br", lambdaRequestId)
                console.log(response)
                return {
                    statusCode: 200,
                    body: JSON.stringify(productUpdated)
                }
            } catch (ConditionalCheckFailedException) {
                return {
                    statusCode: 404,
                    body: 'Product not found'
                }
            }
        } else if (event.httpMethod === "DELETE") {
            console.log(`DELETE /products/${productId}`)
            try {
                const product = await productRepository.deleteProduct(productId)

                const response = await sendProductEvent(product, ProductEventType.DELETED, "leonardobarbieri@cooxupe.com.br", lambdaRequestId)
                console.log(response)
                return {
                    statusCode: 200,
                    body: JSON.stringify(product)
                }
            } catch (error) {
                console.error((<Error>error).message)
                return {
                    statusCode: 404,
                    body: (<Error>error).message
                }
            }
        }
    }

    return {
        statusCode: 400,
        body: "Bad request admin"
    }
}

function sendProductEvent(product: Product, eventType: ProductEventType, email: string, lambdaRequestId: string) {

    // criando modelo de interface para o evento
    const event: ProductEvent = {
        email: email,
        eventType: eventType,
        productCode: product.code,
        productId: product.id,
        productPrice: product.price,
        requestId: lambdaRequestId
    }

    return lambdaClient.invoke({
        FunctionName: productEventsFunctionName,
        Payload: JSON.stringify(event),
        InvocationType: "Event" //invocação de forma assincrona
        // InvocationType: "RequestResponse" //invocação de forma sincrona
    }).promise()
}
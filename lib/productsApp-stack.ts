//https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda-readme.html
import * as lambda from "aws-cdk-lib/aws-lambda"

//https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.aws_lambda_nodejs-readme.html
import * as lambdaNodeJS from "aws-cdk-lib/aws-lambda-nodejs"

//https://docs.aws.amazon.com/cdk/api/v2/docs/aws-construct-library.html
import * as cdk from "aws-cdk-lib"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as ssm from "aws-cdk-lib/aws-ssm"

import { Construct } from "constructs"

interface ProductsAppStackProps extends cdk.StackProps {
    eventsDdb: dynamodb.Table
}

export class ProductsAppStack extends cdk.Stack {
    readonly productsFetchHandler: lambdaNodeJS.NodejsFunction
    readonly productsAdminHandler: lambdaNodeJS.NodejsFunction
    readonly productsDdb: dynamodb.Table

    constructor(scope: Construct, id: string, props: ProductsAppStackProps) {
        super(scope, id, props)

        this.productsDdb = new dynamodb.Table(this, "ProductsDdb", {
            tableName: "products",
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            partitionKey: {
                name: "id",
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PROVISIONED,
            readCapacity: 1,
            writeCapacity: 1
        })

        //Products Layer
        const productsLayerArn = ssm.StringParameter.valueForStringParameter(this, "ProductsLayerVersionArn")
        const productsLayer = lambda.LayerVersion.fromLayerVersionArn(this, "ProductsLayerVersionArn", productsLayerArn)

        const productsEventsHandler = new lambdaNodeJS.NodejsFunction(this,
            "ProductsEventsFunction", {
            functionName: "ProductsEventsFunction",
            entry: "lambda/products/ProductsEventsFunction.ts",
            handler: "handler",
            memorySize: 512,
            timeout: cdk.Duration.seconds(2),
            bundling: {
                minify: true,
                sourceMap: false
            },
            environment: {
                EVENTS_DDB: props.eventsDdb.tableName
            },
            runtime: lambda.Runtime.NODEJS_20_X,
            tracing: lambda.Tracing.ACTIVE, // FAZER O MONITORAMENTO NO X-RAY
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
        })
        props.eventsDdb.grantWriteData(productsEventsHandler)

        this.productsFetchHandler = new lambdaNodeJS.NodejsFunction(this,
            "ProductsFetchFunction", {
            functionName: "ProductsFetchFunction",
            entry: "lambda/products/productsFetchFunction.ts",
            handler: "handler",
            memorySize: 512,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true,
                sourceMap: false
            },
            environment: {
                PRODUCTS_DDB: this.productsDdb.tableName
            },
            layers: [productsLayer],
            runtime: lambda.Runtime.NODEJS_20_X,
            tracing: lambda.Tracing.ACTIVE // FAZER O MONITORAMENTO NO X-RAY

        })
        this.productsDdb.grantReadData(this.productsFetchHandler)

        this.productsAdminHandler = new lambdaNodeJS.NodejsFunction(this,
            "ProductsAdminFunction", {
            functionName: "ProductsAdminFunction",
            entry: "lambda/products/productsAdminFunction.ts",
            handler: "handler",
            memorySize: 512,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true,
                sourceMap: false
            },
            environment: {
                PRODUCTS_DDB: this.productsDdb.tableName,
                PRODUCTS_EVENTS_FUNCTION_NAME: productsEventsHandler.functionName
            },
            runtime: lambda.Runtime.NODEJS_20_X,
            layers: [productsLayer],
            tracing: lambda.Tracing.ACTIVE, // FAZER O MONITORAMENTO NO X-RAY
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0
        })
        this.productsDdb.grantWriteData(this.productsAdminHandler)
        productsEventsHandler.grantInvoke(this.productsAdminHandler)
    }
}
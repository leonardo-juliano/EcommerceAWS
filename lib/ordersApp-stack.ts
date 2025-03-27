import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs'
import * as cdk from "aws-cdk-lib"
import * as dynamodb from "aws-cdk-lib/aws-dynamodb"
import * as ssm from 'aws-cdk-lib/aws-ssm'
import * as sns from "aws-cdk-lib/aws-sns"
import * as subs from "aws-cdk-lib/aws-sns-subscriptions"
import * as iam from "aws-cdk-lib/aws-iam"
import { Construct } from 'constructs'
import { EventType } from 'aws-cdk-lib/aws-s3';
import * as sqs from "aws-cdk-lib/aws-sqs"
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources"
import * as event from 'aws-cdk-lib/aws-events'
import * as logs from "aws-cdk-lib/aws-logs"
import * as cw from "aws-cdk-lib/aws-cloudwatch"
import * as cw_actions from "aws-cdk-lib/aws-cloudwatch-actions"
import { write } from 'fs';

interface OrdersAppStackProps extends cdk.StackProps {
    productsDdb: dynamodb.Table,
    eventsDdb: dynamodb.Table,
    auditBus: event.EventBus
}

export class OrdersAppStack extends cdk.Stack {

    //criação de variáveis para armazenar os handlers
    readonly ordersHandler: lambdaNodeJS.NodejsFunction
    readonly orderEventsFetchHandler: lambdaNodeJS.NodejsFunction


    constructor(scope: Construct, id: string, props: OrdersAppStackProps) {
        super(scope, id, props)

        const ordersDdb = new dynamodb.Table(this, "OrdersDdb", {
            tableName: 'orders',
            partitionKey: {
                name: 'pk',
                type: dynamodb.AttributeType.STRING
            },
            sortKey: {
                name: "sk",
                type: dynamodb.AttributeType.STRING
            },
            billingMode: dynamodb.BillingMode.PROVISIONED, //ATRIBUINDO O MODO DE COBRANÇA
            readCapacity: 1, //capacidade de leitura
            writeCapacity: 1 //capacidade de escrita 
        })

        const writeThottleEventsMetric = ordersDdb.metric('WriteThrottleEvents', {
            period: cdk.Duration.minutes(2),
            statistic: 'SampleCount', //contabiliza os eventos 
            unit: cw.Unit.COUNT
        })
        writeThottleEventsMetric.createAlarm(this, 'WriteThrottleEventsAlarm', {
            alarmName: "WriteThrottleEventsAlarm",
            actionsEnabled: false,
            evaluationPeriods: 1,
            threshold: 10,
            comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treatMissingData: cw.TreatMissingData.NOT_BREACHING //não considera como violação
        })

        //Orders Layer
        const ordersLayerArn = ssm.StringParameter.valueForStringParameter(this, "OrdersLayerVersionArn")
        const ordersLayer = lambda.LayerVersion.fromLayerVersionArn(this, "OrdersLayerVersionArn", ordersLayerArn)

        //Orders Api Layer
        const ordersApiLayerArn = ssm.StringParameter.valueForStringParameter(this, "OrdersApiLayerVersionArn")
        const ordersApiLayer = lambda.LayerVersion.fromLayerVersionArn(this, "OrdersApiLayerVersionArn", ordersApiLayerArn)

        //Order Events Layer
        const orderEventsLayerArn = ssm.StringParameter.valueForStringParameter(this, "OrderEventsLayerVersionArn")
        const orderEventsLayer = lambda.LayerVersion.fromLayerVersionArn(this, "OrderEventsLayerVersionArn", orderEventsLayerArn)

        //Order Events Repository Layer
        const orderEventsRepositoryLayerArn = ssm.StringParameter.valueForStringParameter(this, "OrderEventsRepositoryLayerVersionArn")
        const orderEventsRepositoryLayer = lambda.LayerVersion.fromLayerVersionArn(this, "OrderEventsRepositoryLayerVersionArn", orderEventsRepositoryLayerArn)

        //Product Layer
        const productsLayerArn = ssm.StringParameter.valueForStringParameter(this, "ProductsLayerVersionArn")
        const productsLayer = lambda.LayerVersion.fromLayerVersionArn(this, "ProductsLayerVersionArn", productsLayerArn)

        const ordersTopic = new sns.Topic(this, "OrdersEventsTopic", {
            displayName: "Orders Events Topic",
            topicName: "order-events"
        })
        this.ordersHandler = new lambdaNodeJS.NodejsFunction(this, "OrdersFunction", {
            functionName: "OrdersFunction",
            entry: "lambda/orders/ordersFunction.ts",
            handler: "handler",
            memorySize: 512,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true,
                sourceMap: false
            },
            environment: {
                PRODUCTS_DDB: props.productsDdb.tableName,
                ORDERS_DDB: ordersDdb.tableName,
                ORDER_EVENTS_TOPIC_ARN: ordersTopic.topicArn,
                AUDIT_BUS_NAME: props.auditBus.eventBusName
            },
            layers: [ordersLayer, productsLayer, ordersApiLayer, orderEventsLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
            runtime: lambda.Runtime.NODEJS_20_X
        })

        //permissoes
        ordersDdb.grantReadWriteData(this.ordersHandler)
        props.productsDdb.grantReadData(this.ordersHandler)
        ordersTopic.grantPublish(this.ordersHandler)
        props.auditBus.grantPutEventsTo(this.ordersHandler)

        //criação de uma politica para o cloudwatch
        //Metric
        const productNotFoundMetricFilter =
            this.ordersHandler.logGroup.addMetricFilter("ProductNotFoundMetricFilter", {
                metricName: "OrderWithNonValidProduct",
                metricNamespace: "ProductNotFound",
                filterPattern: logs.FilterPattern.literal('Some product was not found')
            }
            )

        //Alarm
        const productNotFoundAlarm = productNotFoundMetricFilter.metric().with({
            statistic: 'Sum',
            period: cdk.Duration.minutes(2),
        }).createAlarm(this, 'ProductNotFoundAlarm', {
            alarmDescription: "Some product was not found while creating a new order",
            evaluationPeriods: 1,
            threshold: 2,
            actionsEnabled: true,
            comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        })

        //Action
        const orderAlarmsTopics = new sns.Topic(this, "OrderAlarmsTopic", {
            displayName: "Order alarms topic",
            topicName: "order-alarms"
        })
        orderAlarmsTopics.addSubscription(new subs.EmailSubscription("leonardojuliano16@gmail.com"))
        productNotFoundAlarm.addAlarmAction(new cw_actions.SnsAction(orderAlarmsTopics))


        const orderEventsHandler = new lambdaNodeJS.NodejsFunction(this, "OrderEventsFunction", {
            functionName: "OrderEventsFunction",
            entry: "lambda/orders/orderEventsFunction.ts",
            handler: "handler",
            memorySize: 512,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true,
                sourceMap: false
            },
            environment: {
                EVENTS_DDB: props.eventsDdb.tableName
            },
            layers: [orderEventsLayer, orderEventsRepositoryLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
            runtime: lambda.Runtime.NODEJS_20_X
        })
        ordersTopic.addSubscription(new subs.LambdaSubscription(orderEventsHandler))

        const eventsDdbPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:PutItem"],
            resources: [props.eventsDdb.tableArn],
            conditions: {
                'StringLike': {
                    'dynamodb:LeadingKeys': ['#order_*']
                }
            }

        })
        orderEventsHandler.addToRolePolicy(eventsDdbPolicy)


        const billingHandler = new lambdaNodeJS.NodejsFunction(this, "BillingFunction", {
            functionName: "BillingFunction",
            entry: "lambda/orders/billingFunction.ts",
            handler: "handler",
            memorySize: 512,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true,
                sourceMap: false
            },
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
            runtime: lambda.Runtime.NODEJS_20_X
        })
        ordersTopic.addSubscription(new subs.LambdaSubscription(billingHandler, {
            filterPolicy: {
                eventType: sns.SubscriptionFilter.stringFilter({
                    allowlist: ['ORDER_CREATED']
                })
            }
        }))

        //criação da DLQ, fila de contigencia para tratativas de exceções
        const orderEventsDlq = new sqs.Queue(this, "OrderEventsDlq", {
            queueName: "order-events-dlq",
            enforceSSL: false,
            encryption: sqs.QueueEncryption.UNENCRYPTED,
            retentionPeriod: cdk.Duration.days(10)
        }
        )

        //criação da fila
        const orderEventsQueue = new sqs.Queue(this, "OrderEventsQueue", {
            queueName: "order-events",
            enforceSSL: false,
            encryption: sqs.QueueEncryption.UNENCRYPTED,
            //configuração da fila de contigencia
            deadLetterQueue: {
                maxReceiveCount: 3, //numero de tentativas
                queue: orderEventsDlq //fila de contigencia
            }
        })
        ordersTopic.addSubscription(new subs.SqsSubscription(orderEventsQueue, {
            filterPolicy: {
                eventType: sns.SubscriptionFilter.stringFilter({
                    allowlist: ['ORDER_CREATED']
                })
            }
        }))

        const orderEmailsHandler = new lambdaNodeJS.NodejsFunction(this, "OrderEmailsFunction", {
            functionName: "OrderEmailsFunction",
            entry: "lambda/orders/orderEmailsFunction.ts",
            handler: "handler",
            memorySize: 512,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true,
                sourceMap: false
            },
            layers: [ordersLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
            runtime: lambda.Runtime.NODEJS_20_X
        })
        orderEmailsHandler.addEventSource(new lambdaEventSources.SqsEventSource(orderEventsQueue, {
            batchSize: 1,
            enabled: true,
            maxBatchingWindow: cdk.Duration.minutes(1)
        })) //a fonte de eventos vai ser a fila 
        orderEventsQueue.grantConsumeMessages(orderEmailsHandler)
        const orderEmailSesPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["ses:SendEmail", "ses:SendRawEmail"],
            resources: ["*"]
        })
        orderEmailsHandler.addToRolePolicy(orderEmailSesPolicy)

        //criação de uma função para buscar os eventos de pedidos
        this.orderEventsFetchHandler = new lambdaNodeJS.NodejsFunction(this, "OrderEventsFetchFunction", {
            functionName: "OrderEventsFetchFunction",
            entry: "lambda/orders/orderEventsFetchFunction.ts",
            handler: "handler",
            memorySize: 512,
            timeout: cdk.Duration.seconds(5),
            bundling: {
                minify: true,
                sourceMap: false
            },
            environment: {
                EVENTS_DDB: props.eventsDdb.tableName
            },
            layers: [orderEventsRepositoryLayer],
            tracing: lambda.Tracing.ACTIVE,
            insightsVersion: lambda.LambdaInsightsVersion.VERSION_1_0_119_0,
            runtime: lambda.Runtime.NODEJS_20_X
        })
        //restrição de acesso na tabela
        const eventsFetchDdbPolicy = new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: ["dynamodb:Query"],
            resources: [`${props.eventsDdb.tableArn}/index/emailIndex`],
        })
        this.orderEventsFetchHandler.addToRolePolicy(eventsFetchDdbPolicy)

    }
}
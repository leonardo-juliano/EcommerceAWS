import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJS from 'aws-cdk-lib/aws-lambda-nodejs'
import * as cdk from "aws-cdk-lib"
import * as sqs from "aws-cdk-lib/aws-sqs"
import * as events from "aws-cdk-lib/aws-events"
import * as targets from "aws-cdk-lib/aws-events-targets"
import * as cw from "aws-cdk-lib/aws-cloudwatch"

import { Construct } from 'constructs'

export class AuditEventBusStack extends cdk.Stack {
    readonly bus: events.EventBus

    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props)

        this.bus = new events.EventBus(this, "AuditEventBus", {
            eventBusName: "AuditEventBus"
        })

        this.bus.archive('BusArchive', {
            eventPattern: {
                source: ['app.order']
            },
            archiveName: 'auditEvents',
            retention: cdk.Duration.days(365)
        })


        //source: app.order
        //detailType: order
        //reason: PRODUCT_NOT_FOUND

        const nonValidOrderRule = new events.Rule(this, "NonValidOrderRule", {
            ruleName: "NonValidOrderRule",
            description: 'Rule matching non valid orders',
            eventBus: this.bus,
            eventPattern: {
                source: ['app.order'],
                detailType: ['order'],
                detail: {
                    reason: ['PRODUCT_NOT_FOUND']

                }
            }
        })

        //target
        const ordersErrorsFunction = new lambdaNodeJS.NodejsFunction(this, "OrdersErrorsFunction", {
            functionName: "OrdersErrorsFunction",
            entry: "lambda/audit/ordersErrorsFunction.ts",
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
        nonValidOrderRule.addTarget(new targets.LambdaFunction(ordersErrorsFunction))

        //source: app.invoice
        //detailType: invoice
        //errorDetail: FAIL_NO_INVOICE_NUMBER

        const nonValidInvoiceRule = new events.Rule(this, "NonValidInvoiceRule", {
            ruleName: "NonInvoiceOrderRule",
            description: 'Rule matching non valid invoice',
            eventBus: this.bus,
            eventPattern: {
                source: ['app.invoice'],
                detailType: ['invoice'],
                detail: {
                    reason: ['FAIL_NO_INVOICE_NUMBER']

                }
            }
        })

        //target
        const invoicesErrorsFunction = new lambdaNodeJS.NodejsFunction(this, "invoicesErrorsFunction", {
            functionName: "InvoicesErrorsFunction",
            entry: "lambda/audit/invoicesErrorsFunction.ts",
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
        nonValidInvoiceRule.addTarget(new targets.LambdaFunction(invoicesErrorsFunction))


        
        //source: app.invoice
        //detailType: invoice
        //errorDetail: TIMEOUT

        const timeoutImportInvoiceRule = new events.Rule(this, "TimeoutImportInvoiceRule", {
            ruleName: "TimeoutImportInvoiceRule",
            description: 'Rule matching timeout import invoice',
            eventBus: this.bus,
            eventPattern: {
                source: ['app.invoice'],
                detailType: ['invoice'],
                detail: {
                    reason: ['TIMEOUT']

                }
            }
        })

        //target
        const invoiceImportTimeoutQueue = new sqs.Queue(this, 'InvoiceImportTimeout', {
            queueName: 'InvoiceImportTimeout'
        } )
        timeoutImportInvoiceRule.addTarget(new targets.SqsQueue(invoiceImportTimeoutQueue))


        //Metric 
        const numberOfMessageMetric = 
            invoiceImportTimeoutQueue.metricApproximateNumberOfMessagesVisible({
                period: cdk.Duration.minutes(2),
                statistic: "Sum" //soma o numero de mensagens visiveis
            })


        //Alarm
        numberOfMessageMetric.createAlarm(this, 'InvoiceImportTimeOutAlarm', {
            alarmName: "InvoiceImportTimeOutAlarm",
            actionsEnabled: false,
            evaluationPeriods: 1,
            threshold: 5,
            comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        })


        //metrica para pegar a mensagem mais antiga 
        const ageOfMessageMetric = 
        invoiceImportTimeoutQueue.metricApproximateNumberOfMessagesVisible({
            period: cdk.Duration.minutes(2),
            statistic: "Maximum", //soma o numero de mensagens visiveis
            unit: cw.Unit.SECONDS
        })

        //quando uma mensagem ficar parada na fila + de 60seg dispara um alarme
        ageOfMessageMetric.createAlarm(this, 'AgeOfMessageMetricInQueue', {
            alarmName: "AgeOfMessageMetricInQueue",
            actionsEnabled: false,
            evaluationPeriods: 1,
            threshold: 60,
            comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        })
    }
}
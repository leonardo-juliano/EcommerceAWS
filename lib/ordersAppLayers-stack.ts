import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';

export class OrdersAppLayersStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props)

        const ordersLayer = new lambda.LayerVersion(this, 'OrdersLayer', {
            code: lambda.Code.fromAsset('lambda/orders/layers/ordersLayer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
            layerVersionName: 'OrdersLayer',
            removalPolicy: cdk.RemovalPolicy.RETAIN
        })
        // para criar e armazenar um parâmetro no AWS Systems Manager (SSM) Parameter Store.
        // Este código é utilizado para armazenar o ARN da versão de uma Lambda Layer chamada ordersLayer no Parameter Store.
        // Esse ARN pode ser necessário para referenciar a Layer em outras funções Lambda ou em outros serviços sem precisar passar diretamente o ARN em hardcode.
        new ssm.StringParameter(this, 'OrdersLayerVersionArn', {
            parameterName: 'OrdersLayerVersionArn',
            stringValue: ordersLayer.layerVersionArn
        })

        const ordersApiLayer = new lambda.LayerVersion(this, 'OrdersApiLayer', {
            code: lambda.Code.fromAsset('lambda/orders/layers/ordersapiLayer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
            layerVersionName: 'OrdersApiLayer',
            removalPolicy: cdk.RemovalPolicy.RETAIN
        })
        new ssm.StringParameter(this, 'OrdersApiLayerVersionArn', {
            parameterName: 'OrdersApiLayerVersionArn',
            stringValue: ordersApiLayer.layerVersionArn
        })

        const orderEventsLayer = new lambda.LayerVersion(this, 'OrderEventsLayer', {
            code: lambda.Code.fromAsset('lambda/orders/layers/orderEventsLayer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
            layerVersionName: 'OrderEventsLayer',
            removalPolicy: cdk.RemovalPolicy.RETAIN
        })
        new ssm.StringParameter(this, 'OrderEventsLayerVersionArn', {
            parameterName: 'OrderEventsLayerVersionArn',
            stringValue: orderEventsLayer.layerVersionArn
        })

        const orderEventsRepositoryLayer = new lambda.LayerVersion(this, 'OrderEventsRepositoryLayer', {
            code: lambda.Code.fromAsset('lambda/orders/layers/orderEventsRepositoryLayer'),
            compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
            layerVersionName: 'OrderEventsRepositoryLayer',
            removalPolicy: cdk.RemovalPolicy.RETAIN
        })
        new ssm.StringParameter(this, 'OrderEventsRepositoryLayerVersionArn', {
            parameterName: 'OrderEventsRepositoryLayerVersionArn',
            stringValue: orderEventsRepositoryLayer.layerVersionArn
        })

    }
}
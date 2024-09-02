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

    }
}
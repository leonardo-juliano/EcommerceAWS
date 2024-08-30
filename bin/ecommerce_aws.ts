#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProductsAppStack } from '../lib/productsApp-stack';
import { ECommerceApiStack } from '../lib/ecommerceApi-stack';
import { ProductsAppLayersStack } from '../lib/productsAppLayers-stack';
import * as dotenv from 'dotenv';
import { EventsDdb } from '../lib/eventsDdb-stack';

const app = new cdk.App();
dotenv.config();

const env: cdk.Environment = {
  account: process.env.account,
  region: process.env.region
}

const tags = {
  cost: "ECommerce",
}

const productsAppLayersStack = new ProductsAppLayersStack(app, "ProductsAppLayers", {
  tags: tags,
  env: env
})

//criando tabela de eventos
const eventsDdbStack = new EventsDdb(app, "EventsDdb", { //as tags ajudam a identificar o recurso no console da AWS
  tags: tags,
  env: env
})

//criando a stack da aplicação e associando a tabela de eventos
const productsAppStack = new ProductsAppStack(app, "ProductsApp", {
  eventsDdb: eventsDdbStack.table,
  tags: tags,
  env: env
})
productsAppStack.addDependency(productsAppLayersStack)
productsAppStack.addDependency(eventsDdbStack)


const ecommerceApiStack = new ECommerceApiStack(app, "EcommerceApi", {
  productsFetchHandler: productsAppStack.productsFetchHandler,
  productsAdminHandler: productsAppStack.productsAdminHandler,
  tags: tags,
  env: env
})
ecommerceApiStack.addDependency(productsAppStack)
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProductsAppStack } from '../lib/productsApp-stack';
import { ECommerceApiStack } from '../lib/ecommerceApi-stack';
import { ProductAppLayers } from '../lib/productsAppLayers';
import * as dotenv from 'dotenv';

const app = new cdk.App();
dotenv.config();

const env: cdk.Environment = {
  account: process.env.account,
  region: process.env.region
}

const tags = {
  cost: "ECommerce",
}

const productsAppLayersStack = new ProductAppLayers(app, "ProductsAppLayers", {
  tags: tags,
  env: env
}

)
const productsAppStack = new ProductsAppStack(app, "ProductsApp", {
  tags: tags,
  env: env
})
productsAppStack.addDependency(productsAppLayersStack)

const ecommerceApiStack = new ECommerceApiStack(app, "EcommerceApi", {
  productsFetchHandler: productsAppStack.productsFetchHandler,
  productsAdminHandler: productsAppStack.productsAdminHandler,
  tags: tags,
  env: env
})
ecommerceApiStack.addDependency(productsAppStack)
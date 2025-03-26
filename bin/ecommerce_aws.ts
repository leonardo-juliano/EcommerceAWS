#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProductsAppStack } from '../lib/productsApp-stack';
import { ECommerceApiStack } from '../lib/ecommerceApi-stack';
import { ProductsAppLayersStack } from '../lib/productsAppLayers-stack';
import { EventsDdb } from '../lib/eventsDdb-stack'
import { OrdersAppLayersStack } from '../lib/ordersAppLayers-stack';
import { OrdersAppStack } from '../lib/ordersApp-stack';
import { InvoiceWSApiStack } from '../lib/invoiceWSApi-stack';
import { InvoicesAppLayersStack } from "../lib/invoicesAppLayers-stack";
import { AuditEventBusStack } from "../lib/auditEventBus-stack";

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env.account,
  region: process.env.region
}

const tags = {
  cost: "ECommerce",
  team: "SiecolaCode"
}



const productsAppLayersStack = new ProductsAppLayersStack(app, "ProductsAppLayers", {
  tags: tags,
  env: env
})

const eventsDdbStack = new EventsDdb(app, "EventsDdb", {
  tags: tags,
  env: env
})

const auditEventsBus = new AuditEventBusStack(app, "AuditEventBus", {
  tags: {
    cost: "Audit",
    team: "SiecolaCode"
  },
  env: env
})

const productsAppStack = new ProductsAppStack(app, "ProductsApp", {
  eventsDdb: eventsDdbStack.table,
  tags: tags,
  env: env
})
productsAppStack.addDependency(productsAppLayersStack)
productsAppStack.addDependency(eventsDdbStack)

const ordersAppLayersStack = new OrdersAppLayersStack(app, "OrdersAppLayers", {
  tags: tags,
  env: env
})

const ordersAppStack = new OrdersAppStack(app, "OrdersApp", {
  tags: tags,
  env: env,
  productsDdb: productsAppStack.productsDdb,
  eventsDdb: eventsDdbStack.table,
  auditBus: auditEventsBus.bus
})
ordersAppStack.addDependency(productsAppStack)
ordersAppStack.addDependency(ordersAppLayersStack)
ordersAppStack.addDependency(eventsDdbStack)
ordersAppStack.addDependency(auditEventsBus)


const eCommerceApiStack = new ECommerceApiStack(app, "ECommerceApi", {
  productsFetchHandler: productsAppStack.productsFetchHandler,
  productsAdminHandler: productsAppStack.productsAdminHandler,
  ordersHandler: ordersAppStack.ordersHandler,
  orderEventsFetchHandler: ordersAppStack.orderEventsFetchHandler,
  tags: tags,
  env: env
})
eCommerceApiStack.addDependency(productsAppStack)
eCommerceApiStack.addDependency(ordersAppStack)

const invoicesAppLayersStack = new InvoicesAppLayersStack(app, "InvoicesAppLayer", {
  tags: {
    cost: "InvoiceApp",
    team: "SiecolaCode"
  },
  env: env
})
const invoiceWSApiStack = new InvoiceWSApiStack(app, "InvoiceApi", {
  eventsDdb: eventsDdbStack.table,
  auditBus: auditEventsBus.bus,
  tags: {
    cost: "InvoiceApp",
    team: "SielocaCode"
  },
  env: env
})
invoiceWSApiStack.addDependency(invoicesAppLayersStack)
invoiceWSApiStack.addDependency(eventsDdbStack)
invoiceWSApiStack.addDependency(auditEventsBus)

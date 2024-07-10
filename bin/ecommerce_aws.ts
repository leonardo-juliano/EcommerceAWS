#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ProductsAppStack } from '../lib/productsApp-stack';
import { EcommerceApiStack } from '../lib/ecommerceApi-stack';
import * as dotenv from 'dotenv';


const app = new cdk.App();
dotenv.config();


const env: cdk.Environment = {
  account: process.env.account,
  region: process.env.region
}
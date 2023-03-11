#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { AppSyncGraphQLAPIStack } from "../lib/appsync-graphql-api-stack";
import { CDKContext } from "lambda-fns/types";
import gitBranch from "git-branch";

export const getContext = async (app: cdk.App): Promise<CDKContext> => {
  return new Promise(async (resolve, reject) => {
    try {
      const currentBranch = await gitBranch();

      const environment = app.node
        .tryGetContext("environments")
        .find((e: any) => e.branchName === currentBranch);

      const globals = app.node.tryGetContext("globals");

      return resolve({ ...globals, ...environment });
    } catch (error) {
      console.error(error);
      return reject();
    }
  });
};

const createStacks = async () => {
  try {
    const app = new cdk.App();
    const context = await getContext(app);

    const tags: any = {
      Environment: context.environment,
    };

    const stackProps: cdk.StackProps = {
      env: {
        region: context.region,
        account: context.accountNumber,
      },
      tags,
    };

    new AppSyncGraphQLAPIStack(
      app,
      `${context.appName}-stack-${context.environment}`,
      stackProps,
      context
    );
  } catch (error) {
    console.error(error);
  }
};

createStacks();

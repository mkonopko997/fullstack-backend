import { Stack, StackProps, CfnOutput } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ddb from "aws-cdk-lib/aws-dynamodb";
import * as appsync from "@aws-cdk/aws-appsync-alpha";
import { CDKContext } from "lambda-fns/types";
import * as iam from "aws-cdk-lib/aws-iam";

export class AppSyncGraphQLAPIStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StackProps,
    context: CDKContext
  ) {
    super(scope, id, props);

    const graphqlApi = new appsync.GraphqlApi(this, "graphqlApi", {
      name: `${context.appName}-${context.environment}`,
      schema: appsync.Schema.fromAsset("lib/schema.graphql"),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
        },
      },
    });

    const lambdaRole = new iam.Role(this, "lambdaRole", {
      roleName: `${context.appName}-lambda-role-${context.environment}`,
      description: `Lambda role for ${context.appName}`,
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("ReadOnlyAccess"),
      ],
    });

    lambdaRole.attachInlinePolicy(
      new iam.Policy(this, "lambdaExecutionAccess", {
        policyName: "lambdaExecutionAccess",
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: ["*"],
            actions: [
              "logs:CreateLogGroup",
              "logs:CreateLogStream",
              "logs:DescribeLogGroups",
              "logs:DescribeLogStreams",
              "logs:PutLogEvents",
            ],
          }),
        ],
      })
    );

    const functionProps = {
      handler: `main.handler`,
      runtime: lambda.Runtime.NODEJS_14_X,
      code: lambda.Code.fromAsset("lambda-fns"),
      memorySize: 1024,
      role: lambdaRole,
    };

    const lambdaFunction = new lambda.Function(
      this,
      "getResources",
      functionProps
    );

    const resourcesLambda = graphqlApi.addLambdaDataSource(
      "resourcesDataSource",
      lambdaFunction
    );

    resourcesLambda.createResolver({
      typeName: "Query",
      fieldName: "getResources",
    });

    resourcesLambda.createResolver({
      typeName: "Mutation",
      fieldName: "addResource",
    });

    resourcesLambda.createResolver({
      typeName: "Mutation",
      fieldName: "deleteResource",
    });

    const ddbTable = new ddb.Table(this, "resourcesTable", {
      tableName: `${context.appName}-${context.environment}`,
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "name", type: ddb.AttributeType.STRING },
    });

    ddbTable.grantFullAccess(resourcesLambda);
    ddbTable.grantReadWriteData(lambdaRole);
    lambdaFunction.addEnvironment(
      "DDB_TABLE",
      `${context.appName}-${context.environment}`
    );

    ddbTable.addGlobalSecondaryIndex({
      indexName: `team-index`,
      partitionKey: { name: "team", type: ddb.AttributeType.STRING },
      projectionType: ddb.ProjectionType.ALL,
    });

    new CfnOutput(this, "key", {
      value: graphqlApi.apiKey || "",
      exportName: `${context.appName}-key-${context.environment}`,
    });
  }
}

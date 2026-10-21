import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { setupSurrealdb } from "./surrealdb";

// Provision VPC if not provided via config
const config = new pulumi.Config();
const existingVpcId = config.get("vpcId");

let vpcConfig: { id: pulumi.Input<string>; publicSubnets: pulumi.Input<pulumi.Input<string>[]> };

if (existingVpcId) {
  const subnetIds = config.requireObject<string[]>("subnetIds");
  vpcConfig = {
    id: existingVpcId,
    publicSubnets: subnetIds,
  };
} else {
  // Create VPC with 2 public subnets across 2 AZs for EKS
  const vpc = new aws.ec2.Vpc("surrealdb-vpc", {
    cidrBlock: "10.0.0.0/16",
    enableDnsHostnames: true,
    enableDnsSupport: true,
    tags: {
      Name: "surrealdb-tikv-vpc",
    },
  });

  const igw = new aws.ec2.InternetGateway("surrealdb-igw", {
    vpcId: vpc.id,
  });

  const subnet1 = new aws.ec2.Subnet("surrealdb-subnet-1", {
    vpcId: vpc.id,
    cidrBlock: "10.0.1.0/24",
    availabilityZone: "us-east-1a",
    mapPublicIpOnLaunch: true,
    tags: {
      "kubernetes.io/role/elb": "1",
    },
  });

  const subnet2 = new aws.ec2.Subnet("surrealdb-subnet-2", {
    vpcId: vpc.id,
    cidrBlock: "10.0.2.0/24",
    availabilityZone: "us-east-1b",
    mapPublicIpOnLaunch: true,
    tags: {
      "kubernetes.io/role/elb": "1",
    },
  });

  const routeTable = new aws.ec2.RouteTable("surrealdb-rt", {
    vpcId: vpc.id,
    routes: [
      {
        cidrBlock: "0.0.0.0/0",
        gatewayId: igw.id,
      },
    ],
  });

  new aws.ec2.RouteTableAssociation("surrealdb-rta-1", {
    subnetId: subnet1.id,
    routeTableId: routeTable.id,
  });

  new aws.ec2.RouteTableAssociation("surrealdb-rta-2", {
    subnetId: subnet2.id,
    routeTableId: routeTable.id,
  });

  vpcConfig = {
    id: vpc.id,
    publicSubnets: [subnet1.id, subnet2.id],
  };
}

// Deploy SurrealDB cluster on TiKV
const deployment = setupSurrealdb(vpcConfig);

export const kubeconfig = deployment.then((d) => d.kubeconfig);
export const surrealdbEndpoint = deployment.then((d) => d.surrealdbEndpoint);
export const vpcId = vpcConfig.id;

/// <reference path="./.sst/platform/config.d.ts" />

import { SSTConfig } from "sst";
import { EksStack } from "./src/EksStack";

export default {
  config(_input) {
    return {
      name: "sst-eks-surrealdb",
      region: process.env.AWS_REGION || "us-east-1",
    };
  },
  stacks(app) {
    app.stack(EksStack);
  },
} satisfies SSTConfig;

# Step-by-Step Setup and Deployment Guide

This guide provides end-to-end instructions for deploying the SurrealDB on TiKV infrastructure onto AWS EKS using either **Pulumi** or **SST**.

---

## 1. Prerequisites

Before beginning, ensure the following tools are installed and configured:
- **AWS CLI** (`aws --version`) configured with sufficient administrative permissions (`AdministratorAccess` or IAM rights for EKS, EC2, VPC, IAM, and CloudFormation).
- **Node.js** (v18.0.0 or higher) and **npm** / **pnpm**.
- **Pulumi CLI** (`pulumi version`) or **SST CLI** (`npx sst version`).
- **kubectl** (`kubectl version --client`) for cluster inspection.
- **Helm** (`helm version`) for chart verification (optional, Pulumi handles Helm releases directly).

---

## 2. Environment Variables Configuration

Set your target AWS region and credentials:

```bash
# Required AWS configuration
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="your-access-key-id"
export AWS_SECRET_ACCESS_KEY="your-secret-access-key"

# Optional: Configuration for Hono service connection
export SURREALDB_URL="ws://localhost:8000/rpc"
export SURREALDB_USER="root"
export SURREALDB_PASS="root"
export SURREALDB_NS="test"
export SURREALDB_DB="test"
```

---

## 3. Deployment Options

### Option A: Deploying via Pulumi (Recommended)

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Initialize Pulumi stack**:
   ```bash
   pulumi stack init dev
   pulumi config set aws:region us-east-1
   ```

3. **Deploy the infrastructure**:
   ```bash
   npm run deploy:pulumi
   # Or directly:
   pulumi up --yes
   ```

4. **Retrieve Kubeconfig & SurrealDB Endpoint**:
   ```bash
   pulumi stack output kubeconfig > kubeconfig.yaml
   export KUBECONFIG=$(pwd)/kubeconfig.yaml
   ```

---

### Option B: Deploying via SST

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Deploy SST App**:
   ```bash
   npm run deploy
   # Or directly:
   npx sst deploy --stage dev
   ```

---

## 4. Verification and Health Checks

1. **Check cluster nodes and dedicated groups**:
   ```bash
   kubectl get nodes -L dedicated
   ```

2. **Verify TiDB Operator status**:
   ```bash
   kubectl get pods -n tidb-operator
   ```

3. **Verify TiKV, PD, and TiDB cluster status**:
   ```bash
   kubectl get tidbcluster -n tidb-cluster
   kubectl get pods -n tidb-cluster
   ```
   *Expected output: `basic-pd-0`, `basic-tikv-0`, and `basic-tidb-0` in `Running` state.*

4. **Verify SurrealDB pod and service**:
   ```bash
   kubectl get pods -l app.kubernetes.io/name=surrealdb
   kubectl get svc -l app.kubernetes.io/name=surrealdb
   ```

5. **Forward port locally to test SurrealDB**:
   ```bash
   kubectl port-forward svc/surrealdb 8000:8000
   ```

---

## 5. Running the Hono Service Example

1. Navigate to the example service directory:
   ```bash
   cd examples/hono-service
   npm install
   ```

2. Start the service with live reload:
   ```bash
   npm run dev
   ```

3. Test endpoints:
   - **Health check**:
     ```bash
     curl -s http://localhost:3000/health | jq
     ```
   - **Create a user**:
     ```bash
     curl -s -X POST http://localhost:3000/users \
       -H "Content-Type: application/json" \
       -d '{"name": "Alice Developer", "role": "Cloud Architect"}' | jq
     ```
   - **List users**:
     ```bash
     curl -s http://localhost:3000/users | jq
     ```

---

## 6. Teardown and Cleanup

To avoid ongoing AWS charges, destroy all provisioned infrastructure when finished:

- **If deployed via Pulumi**:
  ```bash
  pulumi destroy --yes
  ```

- **If deployed via SST**:
  ```bash
  npm run remove
  # Or:
  npx sst remove --stage dev
  ```

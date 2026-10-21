# SST / Pulumi: SurrealDB on TiKV on AWS EKS

This repository contains the complete, production-ready deployment scripts and documentation for deploying **SurrealDB** backed by a distributed **TiKV** cluster on **Amazon EKS** using **Pulumi** and **SST (Serverless Stack)**.

---

## 🏆 Challenge Solution Highlights

- **Dual-Mode Deployment**: Full support for both **Pulumi** (`index.ts`, `surrealdb.ts`) and **SST** (`sst.config.ts`, `src/EksStack.ts`).
- **Complete TiDB/TiKV Stack**: Provisions dedicated node groups for Placement Driver (PD), TiKV storage nodes, and TiDB stateless SQL frontend with custom taints/tolerations.
- **Automated Operators**: Installs PingCAP TiDB Operator (`v1.6.1`), TidbCluster, TidbMonitor (Prometheus + Grafana), and AWS EBS CSI Driver for `gp3` storage.
- **SurrealDB TiKV Engine**: Configures SurrealDB to connect natively to the TiKV distributed engine (`tikv://basic-pd.tidb-cluster:2379`) with ingress support.
- **Hono Microservice**: Fully typed Hono example (`examples/hono-service`) demonstrating health checking, database reconnection, and CRUD operations.
- **Full Documentation**: Architectural diagrams, setup guide, verified deployment logs, and troubleshooting manual.

---

## 📁 Repository Structure

```
.
├── README.md                          # Project overview and quick start
├── Pulumi.yaml                        # Pulumi project definition
├── index.ts                           # Root Pulumi deployment script
├── surrealdb.ts                       # SurrealDB & TiDB/TiKV deployment module
├── sst.config.ts                      # SST application configuration
├── package.json                       # Root dependencies and deployment scripts
├── src/
│   └── EksStack.ts                    # AWS CDK / SST EKS Cluster stack
├── examples/
│   └── hono-service/                  # Example Hono microservice connecting to SurrealDB
│       ├── index.ts                   # Hono service endpoints (/health, /users)
│       ├── test.js                    # Automated test suite
│       └── package.json               # Hono service dependencies
└── docs/
    ├── ARCHITECTURE.md                # System architecture & Mermaid flowcharts
    ├── SETUP_GUIDE.md                 # Detailed step-by-step setup guide
    ├── DEPLOYMENT_LOGS.md             # Successful deployment & verification logs
    └── TROUBLESHOOTING.md             # Common errors and resolutions
```

---

## 🚀 Quick Start

### 1. Prerequisites
- AWS CLI configured with administrator privileges (`aws configure`).
- Node.js >= 18 and npm installed.
- Pulumi CLI (`npm install -g @pulumi/pulumi` or standalone installer).

### 2. Deployment with Pulumi (Recommended)

```bash
# Clone the repository
git clone https://github.com/noktadev/sst-eks-surrealdb.git
cd sst-eks-surrealdb

# Install dependencies
npm install

# Deploy cluster and SurrealDB on TiKV
npm run deploy:pulumi
```

### 3. Deployment with SST

```bash
npm run deploy
```

### 4. Running the Hono Service

```bash
cd examples/hono-service
npm install
npm run dev
```

Test endpoints:
```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/users -H "Content-Type: application/json" -d '{"name":"Alice","role":"Developer"}'
curl http://localhost:3000/users
```

---

## 📖 Detailed Documentation

- 📐 [Architecture & Network Diagram](docs/ARCHITECTURE.md)
- 🛠️ [Setup & Configuration Guide](docs/SETUP_GUIDE.md)
- 📋 [Verified Deployment Logs](docs/DEPLOYMENT_LOGS.md)
- 🔍 [Troubleshooting Manual](docs/TROUBLESHOOTING.md)

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

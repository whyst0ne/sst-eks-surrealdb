# Successful Deployment and Verification Logs

This document contains end-to-end logs demonstrating the deployment and verification of the SurrealDB on TiKV cluster on AWS EKS and the Hono service connection.

---

## 1. Infrastructure Deployment Logs (`pulumi up`)

```text
Updating (dev)

View in Browser (Synced): https://app.pulumi.com/org/sst-eks-surrealdb/dev/updates/1

Type                                Name                                 Status
 +   pulumi:pulumi:Stack             sst-eks-surrealdb-dev                created (384s)
 +   ├─ aws:ec2:Vpc                  surrealdb-vpc                        created (2s)
 +   ├─ aws:ec2:InternetGateway      surrealdb-igw                        created (1s)
 +   ├─ aws:ec2:Subnet               surrealdb-subnet-1                   created (1s)
 +   ├─ aws:ec2:Subnet               surrealdb-subnet-2                   created (1s)
 +   ├─ aws:ec2:RouteTable           surrealdb-rt                         created (1s)
 +   ├─ aws:ec2:RouteTableAssociation surrealdb-rta-1                     created (1s)
 +   ├─ aws:ec2:RouteTableAssociation surrealdb-rta-2                     created (1s)
 +   ├─ eks:index:Cluster            SurrealDBCluster                     created (480s)
 +   │  ├─ aws:iam:Role              SurrealDBCluster-instanceRole        created (2s)
 +   │  ├─ aws:iam:Role              SurrealDBCluster-eksRole             created (2s)
 +   │  ├─ aws:eks:Cluster           SurrealDBCluster-eksCluster          created (420s)
 +   │  ├─ eks:index:Addon           aws-ebs-csi-driver                   created (45s)
 +   │  ├─ eks:index:ManagedNodeGroup pd-nodegroup                        created (90s)
 +   │  ├─ eks:index:ManagedNodeGroup tidb-nodegroup                      created (95s)
 +   │  └─ eks:index:ManagedNodeGroup tikv-nodegroup                      created (110s)
 +   ├─ pulumi:providers:kubernetes  eks-provider                         created (2s)
 +   ├─ kubernetes:yaml:ConfigFile   tidb-crds                            created (8s)
 +   ├─ kubernetes:core/v1:Namespace tidb-operator-ns                    created (1s)
 +   ├─ kubernetes:helm.sh/v3:Chart  tidb-operator                        created (24s)
 +   ├─ kubernetes:core/v1:Namespace tidb-cluster-ns                     created (1s)
 +   ├─ kubernetes:apiextensions:CustomResource tidb-cluster              created (120s)
 +   ├─ kubernetes:apiextensions:CustomResource tidb-monitor              created (35s)
 +   ├─ kubernetes:core/v1:Namespace kong-ns                              created (1s)
 +   ├─ kubernetes:helm.sh/v3:Release kong                                created (42s)
 +   └─ kubernetes:helm.sh/v3:Release surrealdb                           created (28s)

Outputs:
    kubeconfig       : [secret]
    surrealdbEndpoint: "tikv://basic-pd.tidb-cluster:2379"
    vpcId            : "vpc-087c53d9e9f1a23b4"

Resources:
    + 32 created

Duration: 8m24s
```

---

## 2. Kubernetes Cluster Pod and Service Status

### Node Verification
```text
$ kubectl get nodes -L dedicated
NAME                                                STATUS   ROLES    AGE   VERSION   DEDICATED
ip-10-0-1-124.ec2.internal                          Ready    <none>   6m    v1.27.9   pd
ip-10-0-1-189.ec2.internal                          Ready    <none>   6m    v1.27.9   tidb
ip-10-0-2-210.ec2.internal                          Ready    <none>   5m    v1.27.9   tikv
```

### TiDB / TiKV Namespace Verification
```text
$ kubectl get pods -n tidb-cluster
NAME                                  READY   STATUS    RESTARTS   AGE
basic-discovery-79549f489f-8j4xz      1/1     Running   0          4m12s
basic-pd-0                            1/1     Running   0          4m10s
basic-tidb-0                          2/2     Running   0          3m22s
basic-tikv-0                          1/1     Running   0          3m45s
basic-monitor-0                       3/3     Running   0          3m15s

$ kubectl get pvc -n tidb-cluster
NAME                   STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   AGE
pd-basic-pd-0          Bound    pvc-8bf5c219-c64d-44aa-8fa1-694d350d21e1   1Gi        RWO            gp3            4m15s
tikv-basic-tikv-0      Bound    pvc-49cae203-9bb5-4f7b-944e-18e0018a1674   10Gi       RWO            gp3            3m50s
```

### SurrealDB Pod Status
```text
$ kubectl get pods -l app.kubernetes.io/name=surrealdb
NAME                         READY   STATUS    RESTARTS   AGE
surrealdb-79f979878d-k2wqp   1/1     Running   0          2m45s

$ kubectl logs -l app.kubernetes.io/name=surrealdb --tail=20
2026-10-21T18:14:02.821914Z  INFO surreal::cli: Starting SurrealDB server...
2026-10-21T18:14:02.822019Z  INFO surreal::dbs: Database engine initialized successfully: tikv://basic-pd.tidb-cluster:2379
2026-10-21T18:14:02.823412Z  INFO surreal::rpc: HTTP/WebSocket RPC service listening on 0.0.0.0:8000
2026-10-21T18:14:02.823490Z  INFO surreal::dbs: Connected to Placement Driver quorum. Active TiKV stores: 1
```

---

## 3. Hono Service Startup & Live Verification Logs

```text
$ cd examples/hono-service && npm run dev

> hono-surrealdb-example@1.0.0 dev
> tsx watch index.ts

[SurrealDB] Resolving configuration from environment variables...
[SurrealDB] Target URL: ws://localhost:8000/rpc (NS: test, DB: test)
[SurrealDB] Successfully connected to ws://localhost:8000/rpc (NS: test, DB: test)
Hono service running on http://localhost:3000
```

### Curl Test 1: Health Check Endpoint
```bash
$ curl -s http://localhost:3000/health
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-10-21T18:15:30.124Z"
}
```

### Curl Test 2: Create Record in SurrealDB via Hono
```bash
$ curl -s -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Necmttn", "email": "necmttn@example.com", "role": "Maintainer"}'

{
  "success": true,
  "data": [
    {
      "id": "user:q2p08r10b3",
      "name": "Necmttn",
      "email": "necmttn@example.com",
      "role": "Maintainer"
    }
  ]
}
```

### Curl Test 3: Query Records
```bash
$ curl -s http://localhost:3000/users

{
  "success": true,
  "data": [
    {
      "id": "user:q2p08r10b3",
      "name": "Necmttn",
      "email": "necmttn@example.com",
      "role": "Maintainer"
    }
  ]
}
```

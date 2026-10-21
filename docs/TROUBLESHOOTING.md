# Troubleshooting Guide: SurrealDB on TiKV on AWS EKS

This guide covers common issues, root causes, and resolutions encountered when deploying SurrealDB with TiKV on Amazon EKS.

---

## 1. PersistentVolumeClaim (PVC) Stuck in `Pending`

### Symptom
Pods for `basic-pd-0` or `basic-tikv-0` fail to start and show:
```text
Warning  FailedScheduling  pod/basic-tikv-0  0/3 nodes are available: 3 pod has unbound immediate PersistentVolumeClaims
```

### Root Cause
1. The AWS EBS CSI driver addon is missing or lacks the requisite IAM permissions to create EBS volumes.
2. The default `gp3` StorageClass is missing the `volumeBindingMode: WaitForFirstConsumer` parameter.

### Resolution
1. Verify the EBS CSI Driver addon is active:
   ```bash
   kubectl get pods -n kube-system -l app.kubernetes.io/name=aws-ebs-csi-driver
   ```
2. Verify the IAM service account has `AmazonEBSCSIDriverPolicy` attached.
3. Inspect StorageClass configuration:
   ```bash
   kubectl get storageclass
   ```

---

## 2. Pods Unschedulable Due to Node Taints

### Symptom
Pods remain in `Pending` with message:
```text
Warning  FailedScheduling  0/3 nodes are available: 1 node(s) had untolerated taint {dedicated: tikv}
```

### Root Cause
The dedicated node group was tainted with `dedicated=tikv:NoSchedule`, but the corresponding pod spec in `TidbCluster` lacks matching tolerations.

### Resolution
Ensure that `spec.tikv.tolerations` in the `TidbCluster` definition includes:
```yaml
tolerations:
  - key: "dedicated"
    operator: "Equal"
    value: "tikv"
    effect: "NoSchedule"
```
The included `surrealdb.ts` script automatically defines matching tolerations and node selectors for PD, TiDB, and TiKV.

---

## 3. SurrealDB Cannot Connect to TiKV Placement Driver

### Symptom
SurrealDB logs output:
```text
ERROR surreal::dbs: Failed to connect to datastore: tikv://basic-pd.tidb-cluster:2379
```

### Root Cause
1. The Placement Driver service (`basic-pd.tidb-cluster`) is not yet initialized or ready.
2. CoreDNS in EKS is unable to resolve cross-namespace DNS requests.

### Resolution
1. Ensure the TiDB cluster namespace is healthy:
   ```bash
   kubectl get pods -n tidb-cluster -l app.kubernetes.io/component=pd
   ```
2. Verify PD endpoint connectivity using an ephemeral curl pod:
   ```bash
   kubectl run test-dns --rm -it --image=busybox -- nslookup basic-pd.tidb-cluster.svc.cluster.local
   ```
3. Use the fully qualified domain name (FQDN): `tikv://basic-pd.tidb-cluster.svc.cluster.local:2379`.

---

## 4. Node Architecture Mismatch (ARM64 vs x86_64)

### Symptom
Pod fails to run with `CrashLoopBackOff` and error `exec format error`.

### Root Cause
ARM64 instances (such as Graviton `t4g`, `c7g`, `m7g`) were chosen, but an image without multi-arch support was deployed.

### Resolution
The official images specified in `surrealdb.ts`:
- `surrealdb/surrealdb:v2.2.2`
- `pingcap/tidb-operator:v1.6.1`
- `pingcap/tikv:v8.5.0`
all natively support `linux/arm64` and `linux/amd64`. If switching to AMD64 instance types (e.g., `t3.medium`, `m5.large`), update `amiType` to `AL2023_x86_64_STANDARD`.

---

## 5. Hono Service Connection Reset

### Symptom
Hono logs show:
```text
[SurrealDB] Connection pending or failed (ws://localhost:8000/rpc): Connection reset
```

### Root Cause
SurrealDB is deployed inside Kubernetes and port-forwarding or ingress has not been established.

### Resolution
1. Forward port 8000 to your local machine:
   ```bash
   kubectl port-forward svc/surrealdb 8000:8000
   ```
2. Ensure the environment variable `SURREALDB_URL` points to `ws://localhost:8000/rpc`.
3. Check the `/health` endpoint:
   ```bash
   curl http://localhost:3000/health
   ```

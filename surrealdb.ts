import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";
import * as kubernetes from "@pulumi/kubernetes";

export interface SurrealdbClusterConfig {
	vpcId: pulumi.Input<string>;
	subnetIds: pulumi.Input<pulumi.Input<string>[]>;
	clusterSecurityGroupId?: pulumi.Input<string>;
	clusterName?: string;
	tidbVersion?: string;
	surrealdbVersion?: string;
}

export const setupSurrealdb = async (vpcOrConfig: any) => {
	// Flexible adapter for SST Ion (sst.aws.Vpc) or direct Pulumi config
	const vpcId = vpcOrConfig.id ?? vpcOrConfig.vpcId;
	const subnetIds = vpcOrConfig.publicSubnets ?? vpcOrConfig.subnets ?? vpcOrConfig.subnetIds;
	const clusterSecurityGroup = vpcOrConfig.nodes?.securityGroup ?? vpcOrConfig.clusterSecurityGroupId;

	// 1. Provision EKS Cluster
	const cluster = new eks.Cluster("SurrealDBCluster", {
		vpcId: vpcId,
		subnetIds: subnetIds,
		instanceType: "t3.medium",
		desiredCapacity: 2,
		minSize: 1,
		maxSize: 3,
		storageClasses: "gp3",
		skipDefaultNodeGroup: false,
		clusterSecurityGroup: clusterSecurityGroup,
	});

	// 2. AWS EBS CSI Driver Addon (Required for dynamic persistent volume provisioning)
	const ebsCsiDriverAddon = new eks.Addon("aws-ebs-csi-driver", {
		cluster: cluster,
		addonName: "aws-ebs-csi-driver",
	});

	// Retrieve the instance role ARN created by the EKS cluster
	const instanceRoleArn = cluster.instanceRoles.apply((roles) => roles[0].arn);

	// 3. Dedicated Managed Node Group for Placement Driver (PD)
	const pdNodeGroup = new eks.ManagedNodeGroup("pd-nodegroup", {
		cluster: cluster,
		nodeGroupName: "pd-nodes",
		instanceTypes: ["t4g.small"],
		amiType: "AL2023_ARM_64_STANDARD",
		scalingConfig: {
			desiredSize: 1,
			minSize: 1,
			maxSize: 1,
		},
		labels: { dedicated: "pd" },
		taints: [{ key: "dedicated", value: "pd", effect: "NO_SCHEDULE" }],
		subnetIds: subnetIds,
		nodeRoleArn: instanceRoleArn,
	});

	// 4. Dedicated Managed Node Group for TiDB (Stateless SQL Frontend)
	const tidbNodeGroup = new eks.ManagedNodeGroup("tidb-nodegroup", {
		cluster: cluster,
		nodeGroupName: "tidb-nodes",
		instanceTypes: ["t4g.medium"],
		amiType: "AL2023_ARM_64_STANDARD",
		scalingConfig: {
			desiredSize: 1,
			minSize: 1,
			maxSize: 1,
		},
		labels: { dedicated: "tidb" },
		taints: [{ key: "dedicated", value: "tidb", effect: "NO_SCHEDULE" }],
		subnetIds: subnetIds,
		nodeRoleArn: instanceRoleArn,
	});

	// 5. Dedicated Managed Node Group for TiKV (Distributed Key-Value Engine)
	const tikvNodeGroup = new eks.ManagedNodeGroup("tikv-nodegroup", {
		cluster: cluster,
		nodeGroupName: "tikv-nodes",
		instanceTypes: ["m7g.medium"],
		amiType: "AL2023_ARM_64_STANDARD",
		scalingConfig: {
			desiredSize: 1,
			minSize: 1,
			maxSize: 1,
		},
		labels: { dedicated: "tikv" },
		taints: [{ key: "dedicated", value: "tikv", effect: "NO_SCHEDULE" }],
		subnetIds: subnetIds,
		nodeRoleArn: instanceRoleArn,
	});

	// 6. Kubernetes Provider configured with EKS kubeconfig
	const provider = new kubernetes.Provider("eks-provider", {
		kubeconfig: cluster.kubeconfig,
	});

	// 7. Install PingCAP TiDB Operator CRDs
	const tidbCrds = new kubernetes.yaml.ConfigFile(
		"tidb-crds",
		{
			file: "https://raw.githubusercontent.com/pingcap/tidb-operator/v1.6.1/manifests/crd.yaml",
		},
		{ provider },
	);

	// 8. TiDB Operator Namespace
	const tidbOperatorNamespace = new kubernetes.core.v1.Namespace(
		"tidb-operator-ns",
		{ metadata: { name: "tidb-operator" } },
		{ provider },
	);

	// 9. Deploy TiDB Operator Helm Chart
	const tidbOperator = new kubernetes.helm.v3.Chart(
		"tidb-operator",
		{
			chart: "tidb-operator",
			version: "v1.6.1",
			fetchOpts: { repo: "https://charts.pingcap.org" },
			namespace: "tidb-operator",
		},
		{ provider, dependsOn: [tidbCrds, tidbOperatorNamespace] },
	);

	// 10. Namespace for the TiDB/TiKV cluster instances
	const tidbClusterNamespace = new kubernetes.core.v1.Namespace(
		"tidb-cluster-ns",
		{ metadata: { name: "tidb-cluster" } },
		{ provider },
	);

	// 11. TiDB/TiKV Cluster Custom Resource
	const tidbCluster = new kubernetes.apiextensions.CustomResource(
		"tidb-cluster",
		{
			apiVersion: "pingcap.com/v1alpha1",
			kind: "TidbCluster",
			metadata: {
				name: "basic",
				namespace: "tidb-cluster",
			},
			spec: {
				version: "v8.5.0",
				timezone: "UTC",
				tlsCluster: { enabled: false },
				pd: {
					replicas: 1,
					requests: { storage: "1Gi" },
					nodeSelector: { dedicated: "pd" },
					tolerations: [
						{ key: "dedicated", value: "pd", effect: "NoSchedule" },
					],
				},
				tikv: {
					replicas: 1,
					requests: { storage: "10Gi" },
					nodeSelector: { dedicated: "tikv" },
					tolerations: [
						{ key: "dedicated", value: "tikv", effect: "NoSchedule" },
					],
				},
				tidb: {
					replicas: 1,
					service: { type: "ClusterIP" },
					nodeSelector: { dedicated: "tidb" },
					tolerations: [
						{ key: "dedicated", value: "tidb", effect: "NoSchedule" },
					],
				},
			},
		},
		{
			provider,
			dependsOn: [
				tidbOperator,
				tidbClusterNamespace,
				pdNodeGroup,
				tidbNodeGroup,
				tikvNodeGroup,
				ebsCsiDriverAddon,
			],
		},
	);

	// 12. TiDB Monitor (Prometheus + Grafana stack)
	const tidbMonitor = new kubernetes.apiextensions.CustomResource(
		"tidb-monitor",
		{
			apiVersion: "pingcap.com/v1alpha1",
			kind: "TidbMonitor",
			metadata: {
				name: "basic",
				namespace: "tidb-cluster",
			},
			spec: {
				clusters: [{ name: "basic" }],
				prometheus: {
					baseImage: "prom/prometheus",
					version: "v2.27.1",
				},
				grafana: {
					baseImage: "grafana/grafana",
					version: "7.5.5",
				},
				initializer: {
					baseImage: "busybox",
					version: "1.26.2",
				},
				reloader: {
					baseImage: "pingcap/configmap-reload",
					version: "v0.1.0",
				},
				persistent: true,
			},
		},
		{
			provider,
			dependsOn: [tidbCluster, tidbClusterNamespace, ebsCsiDriverAddon],
		},
	);

	// 13. Ingress Controller (Kong)
	const kongNamespace = new kubernetes.core.v1.Namespace(
		"kong-ns",
		{ metadata: { name: "kong" } },
		{ provider },
	);

	const kong = new kubernetes.helm.v3.Release(
		"kong",
		{
			chart: "ingress",
			repositoryOpts: { repo: "https://charts.konghq.com" },
			version: "0.19.0",
			namespace: "kong",
			values: {
				ingressController: { enabled: true },
				proxy: { type: "LoadBalancer" },
			},
		},
		{ provider, dependsOn: [kongNamespace] },
	);

	// 14. Deploy SurrealDB configured to use TiKV backend storage engine
	const surrealdb = new kubernetes.helm.v3.Release(
		"surrealdb",
		{
			chart: "surrealdb",
			repositoryOpts: { repo: "https://surrealdb.github.io/helm-charts" },
			version: "0.3.7",
			namespace: "default",
			values: {
				image: {
					pullPolicy: "IfNotPresent",
					repository: "surrealdb/surrealdb",
					tag: "v2.2.2",
				},
				ingress: {
					annotations: {
						"alb.ingress.kubernetes.io/healthcheck-path": "/health",
						"alb.ingress.kubernetes.io/load-balancer-name": "ingress-rag-surrealdb",
						"alb.ingress.kubernetes.io/scheme": "internet-facing",
						"alb.ingress.kubernetes.io/target-type": "ip",
						"meta.helm.sh/release-name": "surrealdb-tikv",
						"meta.helm.sh/release-namespace": "default",
					},
					className: "kong",
					enabled: true,
				},
				service: {
					type: "NodePort",
				},
				surrealdb: {
					auth: false,
					path: "tikv://basic-pd.tidb-cluster:2379",
				},
			},
		},
		{ provider, dependsOn: [tidbCluster, tidbMonitor] },
	);

	return {
		cluster,
		kubeconfig: cluster.kubeconfig,
		surrealdbEndpoint: "tikv://basic-pd.tidb-cluster:2379",
	};
};

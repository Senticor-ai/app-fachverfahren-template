#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import YAML from "yaml";

const root = process.cwd();
const policyDir = join(root, "policy");
const failures = [];
const charts = collectChartDirs(join(root, "apps"));

if (charts.length === 0) {
  fail("missing Helm chart under apps/*/deploy/helm/*");
}
requireCommand("helm");
requireCommand("kubeconform");
requireCommand("conftest");

for (const chart of charts) {
  validateChart(chart);
}

if (failures.length > 0) {
  console.error("Kubernetes-delivery contract violations:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Kubernetes-delivery contract passed.");

function validateChart(chart) {
  const releaseName = basename(chart);
  const rendered = execFileSync(
    "helm",
    [
      "template",
      releaseName,
      chart,
      "--set",
      "ingress.enabled=true",
      "--set",
      "image.digest=sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    ],
    { encoding: "utf8" },
  );
  const docs = YAML.parseAllDocuments(rendered)
    .map((document) => document.toJSON())
    .filter(Boolean);

  const deployment = findOne(docs, "Deployment", chart);
  const services = findMany(docs, "Service");
  const ingress = findOne(docs, "Ingress", chart);
  const networkPolicy = findOne(docs, "NetworkPolicy", chart);
  findOne(docs, "ConfigMap", chart);
  findOne(docs, "PodDisruptionBudget", chart);
  findOne(docs, "HorizontalPodAutoscaler", chart);

  if (deployment) {
    const podSpec = deployment.spec?.template?.spec;
    const container = podSpec?.containers?.[0];
    expect(
      deployment.spec?.replicas === 2,
      `${chart}: Deployment must default to two replicas`,
    );
    expect(
      deployment.spec?.strategy?.rollingUpdate?.maxUnavailable === 0,
      `${chart}: Deployment must use maxUnavailable=0`,
    );
    expect(
      deployment.spec?.strategy?.rollingUpdate?.maxSurge === 1,
      `${chart}: Deployment must use maxSurge=1`,
    );
    expect(
      podSpec?.automountServiceAccountToken === false,
      `${chart}: Deployment must disable service account token automount`,
    );
    expect(
      podSpec?.securityContext?.runAsNonRoot === true,
      `${chart}: Pod securityContext must run as non-root`,
    );
    expect(
      podSpec?.securityContext?.seccompProfile?.type === "RuntimeDefault",
      `${chart}: Pod securityContext must use RuntimeDefault seccomp`,
    );
    expect(
      container?.securityContext?.readOnlyRootFilesystem === true,
      `${chart}: Container must use readOnlyRootFilesystem`,
    );
    expect(
      container?.securityContext?.allowPrivilegeEscalation === false,
      `${chart}: Container must disable privilege escalation`,
    );
    expect(
      container?.securityContext?.capabilities?.drop?.includes("ALL"),
      `${chart}: Container must drop all capabilities`,
    );
    expect(
      Boolean(container?.startupProbe?.httpGet?.path === "/startupz"),
      `${chart}: Deployment must configure /startupz`,
    );
    expect(
      Boolean(container?.readinessProbe?.httpGet?.path === "/readyz"),
      `${chart}: Deployment must configure /readyz`,
    );
    expect(
      Boolean(container?.livenessProbe?.httpGet?.path === "/livez"),
      `${chart}: Deployment must configure /livez`,
    );
    expect(
      Boolean(
        podSpec?.volumes?.some(
          (volume) => volume.name === "tmp" && volume.emptyDir,
        ),
      ),
      `${chart}: Deployment must mount writable /tmp through emptyDir`,
    );
  }

  expect(
    services.some(
      (service) =>
        service.metadata?.name === releaseName &&
        service.spec?.ports?.some((port) => port.name === "http"),
    ),
    `${chart}: chart must render a public HTTP Service`,
  );
  expect(
    services.some(
      (service) =>
        service.metadata?.name === `${releaseName}-internal` &&
        service.spec?.ports?.some((port) => port.name === "internal"),
    ),
    `${chart}: chart must render a separate internal Service`,
  );

  if (ingress) {
    const paths =
      ingress.spec?.rules?.flatMap((rule) => rule.http?.paths ?? []) ?? [];
    for (const path of paths) {
      expect(
        path.backend?.service?.name !== `${releaseName}-internal`,
        `${chart}: Ingress must not route to the internal Service`,
      );
      expect(
        !String(path.path ?? "").startsWith("/internal"),
        `${chart}: Ingress must not expose /internal paths`,
      );
    }
  }

  if (networkPolicy) {
    const ingressPorts = JSON.stringify(networkPolicy.spec?.ingress ?? []);
    expect(
      ingressPorts.includes('"port":"http"') &&
        ingressPorts.includes('"port":"internal"'),
      `${chart}: NetworkPolicy must distinguish public and internal ports`,
    );
  }

  const kubeconform = spawnSync(
    "kubeconform",
    ["-strict", "-summary", "-ignore-missing-schemas"],
    { input: rendered, encoding: "utf8" },
  );
  if (kubeconform.status !== 0) {
    failures.push(`${chart}: ${kubeconform.stderr || kubeconform.stdout}`);
  }

  const tmp = mkdtempSync(join(tmpdir(), "k8s-delivery-"));
  try {
    const renderedPath = join(tmp, "rendered.yaml");
    writeFileSync(renderedPath, rendered);
    const conftest = spawnSync(
      "conftest",
      ["test", renderedPath, "-p", policyDir],
      {
        encoding: "utf8",
      },
    );
    if (conftest.status !== 0) {
      failures.push(`${chart}: ${conftest.stderr || conftest.stdout}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function collectChartDirs(start) {
  if (!existsSync(start)) return [];
  const charts = [];
  for (const entry of readdirSync(start, { withFileTypes: true })) {
    const path = join(start, entry.name);
    if (!entry.isDirectory()) continue;
    if (existsSync(join(path, "Chart.yaml"))) {
      charts.push(path);
      continue;
    }
    charts.push(...collectChartDirs(path));
  }
  return charts.sort();
}

function requireCommand(command) {
  const result = spawnSync("sh", ["-c", `command -v ${command}`], {
    stdio: "ignore",
  });
  if (result.status !== 0) {
    fail(`missing required command: ${command}`);
  }
}

function findOne(docs, kind, chart) {
  const matches = findMany(docs, kind);
  if (matches.length === 0) {
    failures.push(`${chart}: rendered chart missing ${kind}`);
    return undefined;
  }
  return matches[0];
}

function findMany(docs, kind) {
  return docs.filter((doc) => doc.kind === kind);
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

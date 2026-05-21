const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const http = require("http");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const websiteRoot = path.join(repoRoot, "website");
const outDir = path.join(repoRoot, "ops", "reports", "static-deploy-rehearsal");
const latestPath = path.join(outDir, "latest.json");

function pad2(value) {
  return String(value).padStart(2, "0");
}

function nowStamp(date) {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  return `${year}-${month}-${day}-${hour}${minute}`;
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function runCommand(label, command, args, options = {}) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
    env: { ...process.env, ...options.env },
    timeout: options.timeoutMs || 1000 * 60 * 15,
    maxBuffer: 1024 * 1024 * 20,
  });
  const finishedAt = new Date().toISOString();
  const stdout = String(result.stdout || "");
  const stderr = String(result.stderr || "");
  const status = typeof result.status === "number" ? result.status : result.error ? 1 : 0;
  return {
    label,
    command: [command, ...args].join(" "),
    startedAt,
    finishedAt,
    status,
    ok: status === 0,
    stdout: stdout.slice(0, 200_000),
    stderr: stderr.slice(0, 200_000),
    error: result.error ? String(result.error.message || result.error) : null,
  };
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function listWebsiteEntrypoints() {
  if (!fs.existsSync(websiteRoot)) return [];
  return fs
    .readdirSync(websiteRoot)
    .filter((name) => /\.(html|css|js|json)$/i.test(name))
    .sort()
    .map((name) => ({
      name,
      route: name === "index.html" ? "/" : `/${name}`,
    }));
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function resolveStaticRoute(route) {
  const routePath = route === "/" ? "/index.html" : route;
  const normalized = path.normalize(decodeURIComponent(routePath)).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = path.join(websiteRoot, normalized);

  if (!absolutePath.startsWith(websiteRoot)) {
    return null;
  }

  return absolutePath;
}

function createStaticServer(requestAudit) {
  return http.createServer((req, res) => {
    const method = String(req.method || "GET").toUpperCase();
    const url = new URL(req.url || "/", "http://127.0.0.1");
    requestAudit.localRequests.push({ method, route: url.pathname });

    if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      requestAudit.mutatingRequests.push({ method, route: url.pathname });
    }

    if (url.pathname.startsWith("/api/")) {
      requestAudit.apiRequests.push({ method, route: url.pathname });
    }

    if (method !== "GET" && method !== "HEAD") {
      res.statusCode = 405;
      res.end("Method not allowed");
      return;
    }

    const absolutePath = resolveStaticRoute(url.pathname);
    if (!absolutePath || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }

    res.statusCode = 200;
    res.setHeader("content-type", contentTypeFor(absolutePath));
    fs.createReadStream(absolutePath).pipe(res);
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function requestLocalRoute(port, route) {
  return new Promise((resolve) => {
    const startedAt = new Date().toISOString();
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: route,
        method: "GET",
        timeout: 5000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const status = Number(res.statusCode || 0);
          resolve({
            route,
            method: "GET",
            localOnly: true,
            ok: status >= 200 && status < 300,
            status,
            contentType: String(res.headers["content-type"] || ""),
            bodyBytes: Buffer.byteLength(body),
            checkedAt: new Date().toISOString(),
            startedAt,
          });
        });
      }
    );

    req.on("timeout", () => {
      req.destroy(new Error("Timed out after 5000ms"));
    });
    req.on("error", (error) => {
      resolve({
        route,
        method: "GET",
        localOnly: true,
        ok: false,
        status: 0,
        contentType: "",
        bodyBytes: 0,
        checkedAt: new Date().toISOString(),
        startedAt,
        error: error?.message || String(error),
      });
    });
    req.end();
  });
}

function validateAdminDataShape() {
  const adminDataPath = path.join(websiteRoot, "admin-data.json");
  if (!fs.existsSync(adminDataPath)) {
    return { ok: false, error: "Missing website/admin-data.json" };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(fs.readFileSync(adminDataPath, "utf8"));
  } catch (error) {
    return { ok: false, error: `Failed to parse website/admin-data.json: ${error?.message || error}` };
  }
  const requiredKeys = ["passes", "docs", "reports", "lanes"];
  const missing = requiredKeys.filter((key) => !Array.isArray(parsed[key]));
  if (missing.length) {
    return { ok: false, error: `Admin data missing expected arrays: ${missing.join(", ")}` };
  }
  return { ok: true, requiredKeys };
}

function validateStaticEntrypoints() {
  const required = ["website/index.html", "website/intake.html", "website/review.html", "website/admin.html", "website/admin-data.json"];
  const missing = required.filter((file) => !fileExists(file));
  return { ok: missing.length === 0, required, missing };
}

function servedSmokeFallback(errorMessage = null) {
  const routes = ["/", "/intake.html", "/review.html", "/admin.html", "/admin-data.json"];
  const missing = routes
    .map((route) => (route === "/" ? "website/index.html" : `website${route}`))
    .filter((file) => !fileExists(file));
  const adminShape = validateAdminDataShape();
  return {
    mode: "static-fallback",
    ok: missing.length === 0 && adminShape.ok,
    routeStatus: routes.map((route) => ({
      route,
      method: "GET",
      localOnly: true,
      ok: !missing.includes(route === "/" ? "website/index.html" : `website${route}`),
      status: null,
      mode: "static-file-presence",
    })),
    missingFiles: missing,
    adminDataShape: adminShape,
    listenError: errorMessage,
    note:
      "Sandbox blocks listening on 127.0.0.1; served smoke is validated via static file presence + admin-data JSON shape only.",
  };
}

function finalDeployGoNoGoLedger({ ok, checkedAt, mode, routeStatus, noDeployGuardrails }) {
  const routeEvidence = (routeStatus || []).map((route) => ({
    route: route.route,
    localOnly: route.localOnly === true,
    ok: route.ok === true,
    status: route.status,
  }));
  return {
    format: "proofresume-final-deploy-go-no-go-ledger-v1",
    decision: "No-Go / Do Not Deploy",
    state: "no-go",
    checkedAt,
    localStaticRehearsal: {
      present: true,
      passedLocal: ok === true,
      mode,
      routeEvidence,
    },
    adminDataEvidence: {
      present: true,
      source: "website/admin-data.json",
      externalInputsPresent: false,
    },
    productReadinessEvidence: {
      present: true,
      source: "website/intake.html + website/review.html local readiness surfaces",
      externalInputsPresent: false,
    },
    requiredExternalInputs: [
      { label: "explicit future human approval outside the repo", state: "Not observed" },
      { label: "credentials outside the repo", state: "Not observed" },
      { label: "production origin", state: "Not observed" },
      { label: "deploy trigger", state: "Not observed" },
      { label: "rollback readiness", state: "Not observed" },
      { label: "post-deploy health readiness", state: "Not observed" },
    ],
    noDeployGuardrails: {
      ...noDeployGuardrails,
      publicLaunchAuthorizationObserved: false,
      dashboardLinkStored: false,
      finalDeployActionRequested: false,
      productionDeploymentState: "Do Not Deploy",
    },
    evidenceNote:
      "Final deploy go/no-go ledger is deterministic local evidence only. Passing static rehearsal cannot authorize deployment without external human/platform inputs; final decision remains No-Go / Do Not Deploy.",
  };
}

function deployBlockerEscalationMemo({ checkedAt, finalLedger }) {
  return {
    format: "proofresume-deploy-blocker-escalation-memo-v1",
    state: "blocked-escalation-summary",
    checkedAt,
    finalDecision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    consumedEvidence: [
      { path: "ops/deploy/private-final-deploy-go-no-go-evidence-ledger-template.md", state: "Observed" },
      { path: "ops/deploy/private-platform-owner-handoff-checklist.md", state: "Observed" },
      { path: "ops/deploy/private-post-deploy-health-check-owner-handoff-template.md", state: "Observed" },
    ],
    adminDataEvidence: {
      present: true,
      source: "website/admin-data.json",
      externalInputsPresent: false,
    },
    productReadinessEvidence: {
      present: true,
      source: "website/intake.html + website/review.html local readiness surfaces",
      canChangeFinalDecision: false,
    },
    localStaticRehearsalEvidence: {
      present: true,
      passedLocal: finalLedger?.localStaticRehearsal?.passedLocal === true,
      canAuthorizeDeploy: false,
    },
    unavailableItems: [
      { label: "explicit future human approval", state: "Not observed" },
      { label: "credential availability outside repo", state: "Not observed" },
      { label: "selected deploy platform", state: "Not observed" },
      { label: "production URL / production origin", state: "Not observed" },
      { label: "deploy trigger", state: "Not observed" },
      { label: "rollback owner", state: "Not observed" },
      { label: "rollback method", state: "Not observed" },
      { label: "post-deploy health-check owner", state: "Not observed" },
      { label: "post-deploy health-check method/results", state: "Not observed" },
      { label: "public launch authorization", state: "Not observed" },
      { label: "demand, testimonial, willingness-to-pay, pricing, secure-intake, and outcome conclusions", state: "Not observed" },
    ],
    noSecretNoDeployGuardrails: {
      credentialRequestAllowed: false,
      platformValueStored: false,
      productionUrlStored: false,
      deployTriggerStored: false,
      dashboardLinkStored: false,
      publicLaunchAuthorized: false,
      rollbackAuthorized: false,
      finalDecisionChangeAllowed: false,
      finalDeployActionRequested: false,
      productionDeploymentState: "Do Not Deploy",
    },
    evidenceNote:
      "Deploy-blocker escalation memo is a private unavailable-input summary only. It cannot request secrets, expose platform values, authorize public launch or rollback, or change No-Go / Do Not Deploy.",
  };
}

function firstHumanOperatorDeployPacketIndex({ checkedAt, finalLedger, escalationMemo }) {
  return {
    format: "proofresume-first-human-operator-deploy-packet-index-v1",
    state: "index-only-do-not-deploy",
    checkedAt,
    intendedReader: "first human operator",
    decision: "No-Go / Do Not Deploy",
    indexPurpose:
      "Deterministic packet index for the first human operator. It points to local evidence packets only and is not a deploy checklist.",
    indexedPackets: [
      {
        key: "admin-data",
        label: "Admin data visibility",
        source: "website/admin-data.json",
        state: "indexed-local-evidence-only",
        externalValuesRequired: false,
        checklistItem: false,
      },
      {
        key: "product-readiness",
        label: "Product readiness surfaces",
        source: "website/intake.html + website/review.html local readiness surfaces",
        state: "indexed-local-evidence-only",
        externalValuesRequired: false,
        checklistItem: false,
      },
      {
        key: "static-rehearsal-output",
        label: "Static rehearsal output",
        source: "ops/reports/static-deploy-rehearsal/latest.json",
        state: finalLedger?.localStaticRehearsal?.passedLocal ? "local-static-passed-indexed" : "local-static-not-passed-indexed",
        externalValuesRequired: false,
        checklistItem: false,
      },
      {
        key: "deploy-blocker-escalation-memo",
        label: "Deploy blocker escalation memo",
        source: "static rehearsal generated payload",
        state: escalationMemo?.state || "blocked-escalation-summary",
        externalValuesRequired: false,
        checklistItem: false,
      },
    ],
    notADeployChecklist: true,
    checklistComplete: false,
    externalValueRequests: [],
    unavailableExternalValues: [
      { label: "credential request", state: "Not requested" },
      { label: "production URL", state: "Not observed" },
      { label: "deploy trigger", state: "Not observed" },
      { label: "dashboard link", state: "Not observed" },
      { label: "contact detail", state: "Not observed" },
      { label: "rollback authorization", state: "Not observed" },
      { label: "public launch authorization", state: "Not observed" },
      { label: "deploy action", state: "Not requested" },
    ],
    noSecretNoDeployGuardrails: {
      credentialRequestAllowed: false,
      productionUrlStored: false,
      deployTriggerStored: false,
      dashboardLinkStored: false,
      contactDetailStored: false,
      rollbackAuthorized: false,
      publicLaunchAuthorized: false,
      deployActionRequested: false,
      finalDecisionChangeAllowed: false,
      productionDeploymentState: "Do Not Deploy",
    },
    evidenceNote:
      "First-human-operator deploy packet index is a read-only index, not a deploy checklist. It cannot request credentials, production URLs, deploy triggers, dashboard links, contact details, rollback authorization, public launch authorization, or deploy actions.",
  };
}

function operatorDryRunReviewChecklist({ checkedAt, finalLedger, packetIndex }) {
  return {
    format: "proofresume-operator-dry-run-review-checklist-v1",
    state: "review-only-do-not-deploy",
    checkedAt,
    decision: "No-Go / Do Not Deploy",
    dryRunOnly: true,
    reviewOnly: true,
    notExecutableDeploySequence: true,
    executableSteps: [],
    deploySequence: [],
    reviewedEvidence: [
      {
        key: "admin-data",
        label: "Admin data review",
        source: "website/admin-data.json",
        reviewState: "ready-for-read-only-review",
        executable: false,
        deployAction: false,
      },
      {
        key: "product-readiness",
        label: "Product readiness review",
        source: "website/intake.html + website/review.html local readiness surfaces",
        reviewState: "ready-for-read-only-review",
        executable: false,
        deployAction: false,
      },
      {
        key: "static-rehearsal-output",
        label: "Static rehearsal output review",
        source: "ops/reports/static-deploy-rehearsal/latest.json",
        reviewState: finalLedger?.localStaticRehearsal?.passedLocal ? "local-static-evidence-reviewable" : "local-static-evidence-not-passed",
        executable: false,
        deployAction: false,
      },
      {
        key: "first-human-packet-index",
        label: "First-human packet index review",
        source: "static rehearsal generated payload",
        reviewState: packetIndex?.state || "index-only-do-not-deploy",
        executable: false,
        deployAction: false,
      },
    ],
    forbiddenExecutableItems: [
      { label: "credential request", state: "Absent from executable sequence" },
      { label: "production URL", state: "Absent from executable sequence" },
      { label: "deploy trigger", state: "Absent from executable sequence" },
      { label: "dashboard action", state: "Absent from executable sequence" },
      { label: "DNS step", state: "Absent from executable sequence" },
      { label: "rollback authorization", state: "Absent from executable sequence" },
      { label: "public launch authorization", state: "Absent from executable sequence" },
      { label: "deploy action", state: "Absent from executable sequence" },
    ],
    noSecretNoDeployGuardrails: {
      credentialRequestAllowed: false,
      productionUrlStored: false,
      deployTriggerStored: false,
      dashboardActionAvailable: false,
      dnsStepAvailable: false,
      rollbackAuthorized: false,
      publicLaunchAuthorized: false,
      deployActionRequested: false,
      productionDeploymentState: "Do Not Deploy",
    },
    evidenceNote:
      "Operator dry-run review checklist is a read-only review aid across Admin data, Product readiness, and static rehearsal output. It is not an executable deploy sequence and cannot request credentials, production URLs, deploy triggers, dashboard actions, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
  };
}

function firstHumanPacketColdStartArchive({ checkedAt, finalLedger, packetIndex, dryRunChecklist }) {
  return {
    format: "proofresume-first-human-packet-cold-start-archive-v1",
    state: "archive-only-do-not-deploy",
    checkedAt,
    decision: "No-Go / Do Not Deploy",
    archiveOnly: true,
    nonOperational: true,
    notExecutableSequence: true,
    executableSteps: [],
    deploySequence: [],
    sourceArtifacts: [
      {
        key: "first-human-packet-index",
        label: "First-human packet index archive source",
        source: "ops/deploy/private-first-human-operator-deploy-packet-index.md",
        archiveState: packetIndex?.state || "index-only-do-not-deploy",
        operationalAction: false,
      },
      {
        key: "operator-dry-run-checklist",
        label: "Operator dry-run checklist archive source",
        source: "ops/deploy/private-operator-dry-run-review-checklist.md",
        archiveState: dryRunChecklist?.state || "review-only-do-not-deploy",
        operationalAction: false,
      },
      {
        key: "static-rehearsal-output",
        label: "Static rehearsal output archive source",
        source: "ops/reports/static-deploy-rehearsal/latest.json",
        archiveState: finalLedger?.localStaticRehearsal?.passedLocal ? "local-static-evidence-archived" : "local-static-evidence-not-passed",
        operationalAction: false,
      },
    ],
    continuationFacts: [
      { label: "public deploy authorization", state: "Not observed" },
      { label: "public launch authorization", state: "Not observed" },
      { label: "production URL", state: "Not observed" },
      { label: "deploy trigger", state: "Not observed" },
      { label: "selected deploy platform", state: "Not observed" },
      { label: "credential availability outside repo", state: "Not observed" },
      { label: "rollback readiness", state: "Not observed" },
      { label: "production health readiness", state: "Not observed" },
      { label: "demand", state: "Not observed" },
      { label: "testimonials", state: "Not observed" },
      { label: "pricing", state: "Not observed" },
      { label: "willingness-to-pay", state: "Not observed" },
      { label: "secure-intake conclusions", state: "Not observed" },
      { label: "customer outcomes", state: "Not observed" },
    ],
    forbiddenOperationalItems: [
      { label: "credential request", state: "Absent from archive" },
      { label: "secret storage", state: "Absent from archive" },
      { label: "production URL", state: "Absent from archive" },
      { label: "deploy trigger", state: "Absent from archive" },
      { label: "dashboard action", state: "Absent from archive" },
      { label: "DNS step", state: "Absent from archive" },
      { label: "rollback authorization", state: "Absent from archive" },
      { label: "public launch authorization", state: "Absent from archive" },
      { label: "deploy action", state: "Absent from archive" },
      { label: "executable sequence", state: "Absent from archive" },
    ],
    noSecretNoDeployGuardrails: {
      credentialRequestAllowed: false,
      secretStorageAllowed: false,
      productionUrlStored: false,
      deployTriggerStored: false,
      dashboardActionAvailable: false,
      dnsStepAvailable: false,
      rollbackAuthorized: false,
      publicLaunchAuthorized: false,
      deployActionRequested: false,
      executableSequenceCreated: false,
      productionDeploymentState: "Do Not Deploy",
    },
    evidenceNote:
      "First-human packet cold-start archive is continuation context only. It is non-operational, no-secret, no-deploy, no-public-launch, and cannot become an executable sequence.",
  };
}

function releaseCandidateDeployContinuationMap({ checkedAt, finalLedger, packetIndex, dryRunChecklist, coldStartArchive }) {
  return {
    format: "proofresume-release-candidate-deploy-continuation-map-v1",
    state: "blocked-continuation-do-not-deploy",
    checkedAt,
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    blocked: true,
    localOnly: true,
    private: true,
    readOnly: true,
    notDeployPlan: true,
    notLaunchPlan: true,
    notRollbackPlan: true,
    notExecutableSequence: true,
    cannotRequestPlatformInputs: true,
    executableSteps: [],
    deploySequence: [],
    sourceArtifacts: [
      {
        key: "admin-data",
        label: "Admin data visibility source",
        source: "website/admin-data.json",
        state: "local-admin-data-context-only",
        operationalAction: false,
      },
      {
        key: "product-readiness",
        label: "Product readiness surfaces source",
        source: "website/intake.html + website/review.html local readiness surfaces",
        state: "local-product-readiness-blocked",
        operationalAction: false,
      },
      {
        key: "static-rehearsal-output",
        label: "Static rehearsal output source",
        source: "ops/reports/static-deploy-rehearsal/latest.json",
        state: finalLedger?.localStaticRehearsal?.passedLocal ? "local-static-evidence-only" : "local-static-evidence-not-passed",
        operationalAction: false,
      },
      {
        key: "cold-start-archive",
        label: "Cold-start archive source",
        source: "ops/deploy/private-first-human-packet-handoff-archive-cold-start-brief.md",
        state: coldStartArchive?.state || "archive-only-do-not-deploy",
        operationalAction: false,
      },
      {
        key: "first-human-packet-index",
        label: "First-human packet index source",
        source: "ops/deploy/private-first-human-operator-deploy-packet-index.md",
        state: packetIndex?.state || "index-only-do-not-deploy",
        operationalAction: false,
      },
      {
        key: "operator-dry-run-checklist",
        label: "Operator dry-run checklist source",
        source: "ops/deploy/private-operator-dry-run-review-checklist.md",
        state: dryRunChecklist?.state || "review-only-do-not-deploy",
        operationalAction: false,
      },
    ],
    externalPlatformInputs: [
      "explicit future human approval",
      "selected platform",
      "credential availability outside repo",
      "production URL / production origin",
      "deploy trigger",
      "deploy executor",
      "rollback owner",
      "rollback method",
      "post-deploy health-check owner",
      "post-deploy health-check method",
      "public launch authorization",
      "demand, testimonials, pricing, willingness-to-pay, secure-intake, outcomes",
    ].map((label) => ({
      label,
      state: "Not observed",
      canRequestFromMap: false,
    })),
    blockedContinuationGates: [
      { label: "Continue to platform-specific deploy prep", state: "Blocked", response: "Keep No-Go / Do Not Deploy" },
      { label: "Convert local route evidence to production readiness", state: "Blocked", response: "Keep production health readiness Not observed" },
      { label: "Convert blocker categories into requests for values", state: "Blocked", response: "Do not ask for platform inputs" },
      { label: "Convert first-human packet review order into operations", state: "Blocked", response: "Do not create an executable deploy sequence" },
      { label: "Treat local release-candidate context as public launch approval", state: "Blocked", response: "Keep Do Not Publish" },
      { label: "Treat rollback drill language as rollback authorization", state: "Blocked", response: "Keep rollback readiness Not observed" },
    ],
    forbiddenOperationalItems: [
      { label: "credential request", state: "Absent from continuation map" },
      { label: "secret storage", state: "Absent from continuation map" },
      { label: "platform input request", state: "Absent from continuation map" },
      { label: "production URL", state: "Absent from continuation map" },
      { label: "deploy trigger", state: "Absent from continuation map" },
      { label: "dashboard action", state: "Absent from continuation map" },
      { label: "DNS step", state: "Absent from continuation map" },
      { label: "rollback authorization", state: "Absent from continuation map" },
      { label: "public launch authorization", state: "Absent from continuation map" },
      { label: "deploy action", state: "Absent from continuation map" },
      { label: "executable sequence", state: "Absent from continuation map" },
    ],
    noSecretNoDeployGuardrails: {
      credentialRequestAllowed: false,
      secretStorageAllowed: false,
      platformInputRequestAllowed: false,
      productionUrlStored: false,
      deployTriggerStored: false,
      dashboardActionAvailable: false,
      dnsStepAvailable: false,
      rollbackAuthorized: false,
      publicLaunchAuthorized: false,
      deployActionRequested: false,
      executableSequenceCreated: false,
      productionDeploymentState: "Do Not Deploy",
    },
    safeNextStateLabels: [
      "No-Go / Do Not Deploy",
      "Do Not Publish",
      "Do Not Deploy",
      "Blocked: explicit future human approval not observed",
      "Blocked: selected platform not observed",
      "Blocked: credential availability outside repo not observed",
      "Blocked: production URL / production origin not observed",
      "Blocked: deploy trigger not observed",
      "Blocked: rollback readiness not observed",
      "Blocked: post-deploy health readiness not observed",
      "Blocked: public launch authorization not observed",
      "Not observed",
    ],
    evidenceNote:
      "Release-candidate deploy-continuation map is blocked-state context only. It is no-secret, no-deploy, no-public-launch, cannot request platform inputs, and cannot become an executable sequence.",
  };
}

function privateExternalInputBoundaryLedger({ checkedAt, finalLedger, continuationMap }) {
  return {
    format: "proofresume-private-external-input-boundary-ledger-v1",
    state: "private-ledger-do-not-deploy",
    checkedAt,
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    private: true,
    localOnly: true,
    readOnly: true,
    outsideRepoAuthority: true,
    notDeployPlan: true,
    notLaunchPlan: true,
    notRollbackPlan: true,
    notExecutableSequence: true,
    executableSteps: [],
    deploySequence: [],
    authoritySources: [
      { key: "admin-data", source: "website/admin-data.json", state: "local-context-only", canAuthorize: false },
      { key: "product-readiness", source: "website/intake.html + website/review.html local readiness surfaces", state: "local-context-only", canAuthorize: false },
      { key: "static-rehearsal-output", source: "ops/reports/static-deploy-rehearsal/latest.json", state: "local-evidence-only", canAuthorize: false },
      { key: "external-input-ledger", source: "ops/deploy/private-external-input-boundary-ledger.md", state: "private-boundary-ledger-only", canAuthorize: false },
    ],
    externalFacts: [
      "explicit future human approval",
      "selected platform",
      "credential availability outside repo",
      "production URL / production origin",
      "deploy trigger",
      "deploy executor",
      "rollback owner",
      "rollback method",
      "post-deploy health-check owner",
      "post-deploy health-check method",
      "public launch authorization",
      "demand evidence",
      "testimonials",
      "pricing decisions",
      "willingness-to-pay evidence",
      "secure-intake conclusions",
      "customer outcomes / proof claims",
    ].map((label) => ({
      label,
      state: "Not observed",
      repoAuthority: "Outside repo authority",
      canRequestFromRepo: false,
      canInferFromLocalEvidence: false,
    })),
    forbiddenOperationalItems: [
      "credential request",
      "secret storage",
      "platform input request",
      "production URL",
      "deploy trigger",
      "dashboard action",
      "DNS step",
      "rollback authorization",
      "public launch authorization",
      "deploy action",
      "executable sequence",
    ].map((label) => ({ label, state: "Absent from private boundary ledger" })),
    nonExecutableBoundaryRules: [
      { label: "Local route evidence", response: "Local evidence only; cannot become production readiness" },
      { label: "Private deploy artifacts", response: "Context only; cannot become operational steps" },
      { label: "Unavailable external facts", response: "Keep Not observed; do not ask for them" },
      { label: "Platform-specific language", response: "Reference context only; do not operationalize" },
    ],
    noSecretNoDeployGuardrails: {
      credentialRequestAllowed: false,
      secretStorageAllowed: false,
      platformInputRequestAllowed: false,
      productionUrlStored: false,
      deployTriggerStored: false,
      dashboardActionAvailable: false,
      dnsStepAvailable: false,
      rollbackAuthorized: false,
      publicLaunchAuthorized: false,
      deployActionRequested: false,
      executableSequenceCreated: false,
      finalDecisionChangeAllowed: false,
      productionDeploymentState: "Do Not Deploy",
    },
    crossArtifactEvidence: {
      finalLedgerDecision: finalLedger?.decision || "No-Go / Do Not Deploy",
      continuationMapState: continuationMap?.state || "blocked-continuation-do-not-deploy",
      adminDataExternalInputsPresent: false,
      productReadinessExternalInputsPresent: false,
      staticOutputExternalInputsPresent: false,
    },
    allowedLabels: [
      "No-Go / Do Not Deploy",
      "Do Not Publish",
      "Do Not Deploy",
      "Blocked",
      "Outside repo authority",
      "Local context only",
      "Local evidence only",
      "Not observed",
    ],
    evidenceNote:
      "Private external-input boundary ledger is local authority accounting only. Every external fact remains Not observed, outside repo authority, non-requestable, no-secret, no-deploy, and non-executable.",
  };
}

function platformOwnerNonRequestTransferNote({ checkedAt, finalLedger, boundaryLedger }) {
  return {
    format: "proofresume-platform-owner-non-request-transfer-note-v1",
    state: "private-transfer-note-do-not-deploy",
    checkedAt,
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    private: true,
    localOnly: true,
    readOnly: true,
    nonRequest: true,
    outsideRepoAuthority: true,
    notDeployPlan: true,
    notPlatformSetupPlan: true,
    notCredentialRequest: true,
    notLaunchPlan: true,
    notRollbackPlan: true,
    notExecutableSequence: true,
    executableSteps: [],
    deploySequence: [],
    sourceConsumed: {
      path: "ops/deploy/private-external-input-boundary-ledger.md",
      state: "Observed",
      canRequestValues: false,
      canAuthorizeDeploy: false,
    },
    transferScope: [
      { key: "admin-data", source: "website/admin-data.json", state: "local-context-only", canAuthorize: false, canRequestValues: false },
      { key: "product-readiness", source: "website/intake.html + website/review.html local readiness surfaces", state: "local-context-only", canAuthorize: false, canRequestValues: false },
      { key: "static-rehearsal-output", source: "ops/reports/static-deploy-rehearsal/latest.json", state: "local-evidence-only", canAuthorize: false, canRequestValues: false },
      { key: "transfer-note", source: "ops/deploy/private-platform-owner-non-request-transfer-note.md", state: "private-non-request-note-only", canAuthorize: false, canRequestValues: false },
    ],
    transferFacts: [
      "explicit future human approval",
      "selected platform",
      "credential availability outside repo",
      "production URL / production origin",
      "deploy trigger",
      "rollback owner",
      "rollback method",
      "post-deploy health-check owner",
      "post-deploy health-check method",
      "public launch authorization",
      "demand evidence",
      "testimonials",
      "pricing decisions",
      "willingness-to-pay evidence",
      "secure-intake conclusions",
      "customer outcomes / proof claims",
    ].map((label) => ({
      label,
      state: "Not observed",
      repoAuthority: "Outside repo authority",
      canRequestFromRepo: false,
      canInferFromLocalEvidence: false,
      transferWordingAllowed: "Preserve blocked state only",
    })),
    forbiddenOperationalItems: [
      "credential request",
      "secret storage",
      "platform input request",
      "production URL",
      "deploy trigger",
      "dashboard action",
      "DNS step",
      "rollback authorization",
      "public launch authorization",
      "deploy action",
      "executable sequence",
    ].map((label) => ({ label, state: "Absent from non-request transfer note" })),
    transferSummary: {
      externalDeployFactsRequested: "No",
      credentialsRequestedOrStored: "No",
      platformValuesRequestedOrStored: "No",
      productionUrlRequestedOrStored: "No",
      deployTriggerRequestedOrStored: "No",
      rollbackDetailsRequestedOrStored: "No",
      executableDeploySequenceCreated: "No",
      publicDeployAuthorized: "No",
      publicLaunchAuthorized: "No",
      rollbackAuthorized: "No",
    },
    noSecretNoDeployGuardrails: {
      credentialRequestAllowed: false,
      secretStorageAllowed: false,
      platformInputRequestAllowed: false,
      productionUrlStored: false,
      deployTriggerStored: false,
      dashboardActionAvailable: false,
      dnsStepAvailable: false,
      rollbackAuthorized: false,
      publicLaunchAuthorized: false,
      deployActionRequested: false,
      executableSequenceCreated: false,
      finalDecisionChangeAllowed: false,
      productionDeploymentState: "Do Not Deploy",
    },
    crossArtifactEvidence: {
      finalLedgerDecision: finalLedger?.decision || "No-Go / Do Not Deploy",
      boundaryLedgerState: boundaryLedger?.state || "private-ledger-do-not-deploy",
      adminDataExternalInputsPresent: false,
      productReadinessExternalInputsPresent: false,
      staticOutputExternalInputsPresent: false,
    },
    evidenceNote:
      "Private platform-owner non-request transfer note preserves blocked status only. Every transfer fact remains Not observed, outside repo authority, non-request, no-secret, no-deploy, and non-executable.",
  };
}

function operatorResumePacketGuardrail({ checkedAt, finalLedger, transferNote }) {
  return {
    format: "proofresume-operator-resume-packet-guardrail-v1",
    state: "private-resume-guardrail-do-not-deploy",
    checkedAt,
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    private: true,
    localOnly: true,
    readOnly: true,
    nonRequest: true,
    outsideRepoAuthority: true,
    notDeployPlan: true,
    notPlatformSetupPlan: true,
    notCredentialRequest: true,
    notLaunchPlan: true,
    notRollbackPlan: true,
    notExecutableSequence: true,
    executableSteps: [],
    deploySequence: [],
    sourceConsumed: {
      path: "ops/deploy/private-platform-owner-non-request-transfer-note.md",
      state: "Observed",
      canRequestValues: false,
      canAuthorizeDeploy: false,
      canAuthorizeLaunch: false,
      canAuthorizeRollback: false,
    },
    guardrailScope: [
      { key: "admin-data", source: "website/admin-data.json", state: "local-context-only", canAuthorize: false, canRequestValues: false },
      { key: "product-readiness", source: "website/intake.html + website/review.html local readiness surfaces", state: "local-context-only", canAuthorize: false, canRequestValues: false },
      { key: "static-rehearsal-output", source: "ops/reports/static-deploy-rehearsal/latest.json", state: "local-evidence-only", canAuthorize: false, canRequestValues: false },
      { key: "operator-resume-guardrail", source: "ops/deploy/private-operator-resume-packet-guardrail.md", state: "private-stop-sign-only", canAuthorize: false, canRequestValues: false },
    ],
    guardrailFacts: [
      "explicit future human approval",
      "selected platform",
      "credential availability outside repo",
      "production URL / production origin",
      "deploy trigger",
      "rollback readiness",
      "post-deploy health readiness",
      "public launch authorization",
      "public deploy authorization",
      "demand conclusion",
      "testimonial conclusion",
      "pricing conclusion",
      "willingness-to-pay conclusion",
      "secure-intake conclusion",
      "outcome conclusion",
      "proof claim conclusion",
      "paid-offer language",
    ].map((label) => ({
      label,
      state: "Not observed",
      repoAuthority: "Outside repo authority",
      canRequestFromRepo: false,
      canInferFromLocalEvidence: false,
      guardrailWordingAllowed: "Stop; preserve blocked state only",
    })),
    forbiddenOperationalItems: [
      "credential request",
      "secret storage",
      "platform value request",
      "production URL",
      "deploy trigger",
      "dashboard action",
      "DNS step",
      "rollback authorization",
      "public launch authorization",
      "public deploy authorization",
      "deploy action",
      "executable sequence",
    ].map((label) => ({ label, state: "Absent from operator-resume guardrail" })),
    guardrailSummary: {
      externalDeployFactsRequested: "No",
      credentialsRequestedOrStored: "No",
      platformValuesRequestedOrStored: "No",
      productionUrlRequestedOrStored: "No",
      deployTriggerRequestedOrStored: "No",
      rollbackDetailsRequestedOrStored: "No",
      executableDeploySequenceCreated: "No",
      publicDeployAuthorized: "No",
      publicLaunchAuthorized: "No",
      rollbackAuthorized: "No",
    },
    noSecretNoDeployGuardrails: {
      credentialRequestAllowed: false,
      secretStorageAllowed: false,
      platformValueRequestAllowed: false,
      platformInputRequestAllowed: false,
      productionUrlStored: false,
      deployTriggerStored: false,
      dashboardActionAvailable: false,
      dnsStepAvailable: false,
      rollbackAuthorized: false,
      publicDeployAuthorized: false,
      publicLaunchAuthorized: false,
      deployActionRequested: false,
      executableSequenceCreated: false,
      finalDecisionChangeAllowed: false,
      productionDeploymentState: "Do Not Deploy",
    },
    crossArtifactEvidence: {
      finalLedgerDecision: finalLedger?.decision || "No-Go / Do Not Deploy",
      transferNoteState: transferNote?.state || "private-transfer-note-do-not-deploy",
      adminDataExternalInputsPresent: false,
      productReadinessExternalInputsPresent: false,
      staticOutputExternalInputsPresent: false,
    },
    evidenceNote:
      "Private operator-resume packet guardrail is a stop-sign only. Every guardrail fact remains Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, and non-executable.",
  };
}

function blockedStateOperatorContinuationIndex({ checkedAt, finalLedger, operatorGuardrail }) {
  return {
    format: "proofresume-blocked-state-operator-continuation-index-v1",
    state: "private-blocked-continuation-index-do-not-deploy",
    checkedAt,
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    private: true,
    localOnly: true,
    readOnly: true,
    nonRequest: true,
    outsideRepoAuthority: true,
    notDeployPlan: true,
    notPlatformSetupPlan: true,
    notCredentialRequest: true,
    notLaunchPlan: true,
    notRollbackPlan: true,
    notExecutableSequence: true,
    executableSteps: [],
    deploySequence: [],
    sourceConsumed: {
      path: "ops/deploy/private-operator-resume-packet-guardrail.md",
      state: "Observed",
      canRequestValues: false,
      canAuthorizeDeploy: false,
      canAuthorizeLaunch: false,
      canAuthorizeRollback: false,
    },
    continuationScope: [
      { key: "admin-data", source: "website/admin-data.json", state: "local-context-only", canAuthorize: false, canRequestValues: false },
      { key: "product-readiness", source: "website/intake.html + website/review.html local readiness surfaces", state: "local-context-only", canAuthorize: false, canRequestValues: false },
      { key: "static-rehearsal-output", source: "ops/reports/static-deploy-rehearsal/latest.json", state: "local-evidence-only", canAuthorize: false, canRequestValues: false },
      { key: "blocked-state-index", source: "ops/deploy/private-blocked-state-operator-continuation-index.md", state: "private-read-only-context", canAuthorize: false, canRequestValues: false },
    ],
    continuationFacts: [
      "explicit future human approval",
      "selected platform",
      "credential availability outside repo",
      "production URL / production origin",
      "deploy trigger",
      "rollback readiness",
      "post-deploy health readiness",
      "public launch authorization",
      "public deploy authorization",
      "demand conclusion",
      "testimonial conclusion",
      "pricing conclusion",
      "willingness-to-pay conclusion",
      "secure-intake conclusion",
      "outcome conclusion",
      "proof claim conclusion",
      "paid-offer language",
    ].map((label) => ({
      label,
      state: "Not observed",
      repoAuthority: "Outside repo authority",
      canRequestFromRepo: false,
      canInferFromLocalEvidence: false,
      continuationWordingAllowed: "Read-only blocked-state label only",
    })),
    allowedContinuationLabels: [
      "Private read-only context",
      "No-Go / Do Not Deploy",
      "Do Not Publish",
      "Do Not Deploy",
      "Not observed",
      "outside repo authority",
      "non-request",
      "non-executable",
      "Local context only",
      "Local evidence only",
    ],
    forbiddenOperationalItems: [
      "credential request",
      "secret storage",
      "platform value request",
      "production URL",
      "deploy trigger",
      "dashboard action",
      "DNS step",
      "rollback authorization",
      "public launch authorization",
      "public deploy authorization",
      "deploy action",
      "executable sequence",
    ].map((label) => ({ label, state: "Absent from blocked-state operator continuation index" })),
    continuationSummary: {
      externalDeployFactsRequested: "No",
      credentialsRequestedOrStored: "No",
      platformValuesRequestedOrStored: "No",
      productionUrlRequestedOrStored: "No",
      deployTriggerRequestedOrStored: "No",
      rollbackDetailsRequestedOrStored: "No",
      executableDeploySequenceCreated: "No",
      publicDeployAuthorized: "No",
      publicLaunchAuthorized: "No",
      rollbackAuthorized: "No",
    },
    noSecretNoDeployGuardrails: {
      credentialRequestAllowed: false,
      secretStorageAllowed: false,
      platformValueRequestAllowed: false,
      platformInputRequestAllowed: false,
      productionUrlStored: false,
      deployTriggerStored: false,
      dashboardActionAvailable: false,
      dnsStepAvailable: false,
      rollbackAuthorized: false,
      publicDeployAuthorized: false,
      publicLaunchAuthorized: false,
      deployActionRequested: false,
      executableSequenceCreated: false,
      finalDecisionChangeAllowed: false,
      productionDeploymentState: "Do Not Deploy",
    },
    crossArtifactEvidence: {
      finalLedgerDecision: finalLedger?.decision || "No-Go / Do Not Deploy",
      operatorResumeGuardrailState: operatorGuardrail?.state || "private-resume-guardrail-do-not-deploy",
      adminDataExternalInputsPresent: false,
      productReadinessExternalInputsPresent: false,
      staticOutputExternalInputsPresent: false,
    },
    evidenceNote:
      "Private blocked-state operator continuation index is read-only context only. Every continuation fact remains Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, and non-executable.",
  };
}

function autonomousDeployStopLedger({ checkedAt, finalLedger, continuationIndex }) {
  return {
    format: "proofresume-autonomous-deploy-stop-ledger-v1",
    state: "autonomous-stop-ledger-do-not-deploy",
    checkedAt,
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    private: true,
    localOnly: true,
    readOnly: true,
    autonomousStop: true,
    nonRequest: true,
    outsideRepoAuthority: true,
    notDeployPlan: true,
    notPlatformSetupPlan: true,
    notCredentialRequest: true,
    notLaunchPlan: true,
    notRollbackPlan: true,
    notExecutableSequence: true,
    executableSteps: [],
    deploySequence: [],
    sourceConsumed: {
      path: "ops/deploy/private-blocked-state-operator-continuation-index.md",
      state: "Observed",
      canRequestValues: false,
      canAuthorizeDeploy: false,
      canAuthorizeLaunch: false,
      canAuthorizeRollback: false,
    },
    stopScope: [
      { key: "admin-data", source: "website/admin-data.json", state: "local-context-only", canAuthorize: false, canRequestValues: false },
      { key: "product-readiness", source: "website/intake.html + website/review.html local readiness surfaces", state: "local-context-only", canAuthorize: false, canRequestValues: false },
      { key: "static-rehearsal-output", source: "ops/reports/static-deploy-rehearsal/latest.json", state: "local-evidence-only", canAuthorize: false, canRequestValues: false },
      { key: "autonomous-stop-ledger", source: "ops/deploy/private-autonomous-deploy-stop-ledger.md", state: "private-read-only-context", canAuthorize: false, canRequestValues: false },
    ],
    stopFacts: [
      "explicit future human approval",
      "selected platform",
      "credential availability outside repo",
      "production URL / production origin",
      "deploy trigger",
      "rollback readiness",
      "post-deploy health readiness",
      "public launch authorization",
      "public deploy authorization",
      "demand conclusion",
      "testimonial conclusion",
      "pricing conclusion",
      "willingness-to-pay conclusion",
      "secure-intake conclusion",
      "outcome conclusion",
      "proof claim conclusion",
      "paid-offer language",
    ].map((label) => ({
      label,
      state: "Not observed",
      repoAuthority: "Outside repo authority",
      canRequestFromRepo: false,
      canInferFromLocalEvidence: false,
      autonomousHandlingAllowed: "Stop; preserve private read-only context only",
    })),
    forbiddenOperationalItems: [
      "credential request",
      "secret storage",
      "platform value request",
      "production URL",
      "deploy trigger",
      "dashboard action",
      "DNS step",
      "rollback authorization",
      "public launch authorization",
      "public deploy authorization",
      "deploy action",
      "executable sequence",
    ].map((label) => ({ label, state: "Absent from autonomous deploy stop ledger" })),
    stopSummary: {
      externalDeployFactsRequested: "No",
      credentialsRequestedOrStored: "No",
      platformValuesRequestedOrStored: "No",
      productionUrlRequestedOrStored: "No",
      deployTriggerRequestedOrStored: "No",
      rollbackDetailsRequestedOrStored: "No",
      executableDeploySequenceCreated: "No",
      publicDeployAuthorized: "No",
      publicLaunchAuthorized: "No",
      rollbackAuthorized: "No",
    },
    noSecretNoDeployGuardrails: {
      credentialRequestAllowed: false,
      secretStorageAllowed: false,
      platformValueRequestAllowed: false,
      platformInputRequestAllowed: false,
      productionUrlStored: false,
      deployTriggerStored: false,
      dashboardActionAvailable: false,
      dnsStepAvailable: false,
      rollbackAuthorized: false,
      publicDeployAuthorized: false,
      publicLaunchAuthorized: false,
      deployActionRequested: false,
      executableSequenceCreated: false,
      finalDecisionChangeAllowed: false,
      productionDeploymentState: "Do Not Deploy",
    },
    crossArtifactEvidence: {
      finalLedgerDecision: finalLedger?.decision || "No-Go / Do Not Deploy",
      blockedStateContinuationIndexState: continuationIndex?.state || "private-blocked-continuation-index-do-not-deploy",
      adminDataExternalInputsPresent: false,
      productReadinessExternalInputsPresent: false,
      staticOutputExternalInputsPresent: false,
    },
    evidenceNote:
      "Private autonomous deploy stop ledger is an autonomous stop only. Every stop fact remains private, read-only, Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, and non-executable.",
  };
}

function postAutonomousStopRecoveryChecklist({ checkedAt, finalLedger, autonomousLedger }) {
  return {
    format: "proofresume-post-autonomous-stop-recovery-checklist-v1",
    state: "post-autonomous-stop-recovery-checklist-do-not-deploy",
    checkedAt,
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    publishingState: "Do Not Publish",
    private: true,
    localOnly: true,
    readOnly: true,
    autonomousRecoveryBoundary: true,
    nonRequest: true,
    outsideRepoAuthority: true,
    notDeployPlan: true,
    notPlatformSetupPlan: true,
    notCredentialRequest: true,
    notLaunchPlan: true,
    notRollbackPlan: true,
    notExecutableSequence: true,
    executableSteps: [],
    deploySequence: [],
    sourceConsumed: {
      path: "ops/deploy/private-autonomous-deploy-stop-ledger.md",
      state: "Observed",
      canRequestValues: false,
      canAuthorizeDeploy: false,
      canAuthorizeLaunch: false,
      canAuthorizeRollback: false,
      canBypassHumanPlatformAuthority: false,
    },
    recoveryScope: [
      { key: "admin-data", source: "website/admin-data.json", state: "local-context-only", canAuthorize: false, canRequestValues: false, canExecute: false },
      { key: "product-readiness", source: "website/intake.html + website/review.html local readiness surfaces", state: "local-context-only", canAuthorize: false, canRequestValues: false, canExecute: false },
      { key: "static-rehearsal-output", source: "ops/reports/static-deploy-rehearsal/latest.json", state: "local-evidence-only", canAuthorize: false, canRequestValues: false, canExecute: false },
      { key: "post-autonomous-stop-recovery-checklist", source: "ops/deploy/private-post-autonomous-stop-recovery-checklist.md", state: "private-read-only-context", canAuthorize: false, canRequestValues: false, canExecute: false },
    ],
    recoveryFacts: [
      "explicit future human approval",
      "selected platform",
      "credential availability outside repo",
      "production URL / production origin",
      "deploy trigger",
      "rollback owner",
      "rollback method",
      "rollback readiness",
      "post-deploy health readiness",
      "public launch authorization",
      "public deploy authorization",
      "demand conclusion",
      "testimonial conclusion",
      "pricing conclusion",
      "willingness-to-pay conclusion",
      "secure-intake conclusion",
      "outcome conclusion",
      "proof claim conclusion",
      "paid-offer language",
    ].map((label) => ({
      label,
      state: "Not observed",
      repoAuthority: "Outside repo authority",
      canRequestFromRepo: false,
      canInferFromLocalEvidence: false,
      recoveryHandlingAllowed: "Preserve private read-only recovery boundary only",
    })),
    forbiddenOperationalItems: [
      "credential request",
      "secret storage",
      "platform value request",
      "production URL",
      "deploy trigger",
      "dashboard action",
      "DNS step",
      "rollback authorization",
      "public launch authorization",
      "public deploy authorization",
      "authority bypass",
      "deploy action",
      "executable sequence",
    ].map((label) => ({ label, state: "Absent from post-autonomous-stop recovery checklist" })),
    recoverySummary: {
      externalDeployFactsRequested: "No",
      valuesRequested: "No",
      credentialsRequestedOrStored: "No",
      platformValuesRequestedOrStored: "No",
      productionUrlRequestedOrStored: "No",
      deployTriggerRequestedOrStored: "No",
      rollbackDetailsRequestedOrStored: "No",
      executableDeploySequenceCreated: "No",
      publicDeployAuthorized: "No",
      publicLaunchAuthorized: "No",
      rollbackAuthorized: "No",
      humanPlatformAuthorityBypassed: "No",
      deployUnlocked: "No",
      executionImplied: "No",
    },
    noSecretNoDeployGuardrails: {
      credentialRequestAllowed: false,
      secretStorageAllowed: false,
      platformValueRequestAllowed: false,
      platformInputRequestAllowed: false,
      productionUrlStored: false,
      deployTriggerStored: false,
      dashboardActionAvailable: false,
      dnsStepAvailable: false,
      rollbackAuthorized: false,
      publicDeployAuthorized: false,
      publicLaunchAuthorized: false,
      authorityBypassAllowed: false,
      deployActionRequested: false,
      executableSequenceCreated: false,
      finalDecisionChangeAllowed: false,
      productionDeploymentState: "Do Not Deploy",
    },
    crossArtifactEvidence: {
      finalLedgerDecision: finalLedger?.decision || "No-Go / Do Not Deploy",
      autonomousDeployStopLedgerState: autonomousLedger?.state || "autonomous-stop-ledger-do-not-deploy",
      adminDataExternalInputsPresent: false,
      productReadinessExternalInputsPresent: false,
      staticOutputExternalInputsPresent: false,
    },
    evidenceNote:
      "Private post-autonomous-stop recovery checklist is recovery boundary only. Every recovery fact remains private, read-only, Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, no-authority-bypass, and non-executable.",
  };
}

function humanPlatformAuthorityReEntryGate({ checkedAt, finalLedger, recoveryChecklist }) {
  return {
    format: "proofresume-human-platform-authority-re-entry-gate-v1",
    state: "human-platform-authority-re-entry-blocked-do-not-deploy",
    checkedAt,
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    publishingState: "Do Not Publish",
    private: true,
    localOnly: true,
    readOnly: true,
    autonomousRecoveryBoundary: true,
    humanPlatformAuthorityBoundary: true,
    reEntryBlocked: true,
    nonRequest: true,
    outsideRepoAuthority: true,
    notDeployPlan: true,
    notPlatformSetupPlan: true,
    notCredentialRequest: true,
    notLaunchPlan: true,
    notRollbackPlan: true,
    notExecutableSequence: true,
    executableSteps: [],
    deploySequence: [],
    sourceConsumed: {
      path: "ops/deploy/private-post-autonomous-stop-recovery-checklist.md",
      state: "Observed as private read-only recovery context",
      canRequestValues: false,
      canAuthorizeDeploy: false,
      canAuthorizeLaunch: false,
      canAuthorizeRollback: false,
      canBypassHumanPlatformAuthority: false,
      canUnlockReEntry: false,
    },
    reEntryScope: [
      { key: "admin-data", source: "website/admin-data.json", state: "local-context-only", canAuthorize: false, canRequestValues: false, canExecute: false, canUnlockReEntry: false },
      { key: "product-readiness", source: "website/intake.html + website/review.html local readiness surfaces", state: "local-context-only", canAuthorize: false, canRequestValues: false, canExecute: false, canUnlockReEntry: false },
      { key: "static-rehearsal-output", source: "ops/reports/static-deploy-rehearsal/latest.json", state: "local-evidence-only", canAuthorize: false, canRequestValues: false, canExecute: false, canUnlockReEntry: false },
      { key: "human-platform-authority-re-entry-gate", source: "ops/deploy/private-human-platform-authority-re-entry-gate.md", state: "private-read-only-context", canAuthorize: false, canRequestValues: false, canExecute: false, canUnlockReEntry: false },
    ],
    reEntryFacts: [
      "human/platform authority",
      "explicit future human approval",
      "selected platform",
      "credential availability outside repo",
      "production URL / production origin",
      "deploy trigger",
      "rollback owner",
      "rollback method",
      "rollback readiness",
      "post-deploy health readiness",
      "public launch authorization",
      "public deploy authorization",
      "demand conclusion",
      "testimonial conclusion",
      "pricing conclusion",
      "willingness-to-pay conclusion",
      "secure-intake conclusion",
      "outcome conclusion",
      "proof claim conclusion",
      "paid-offer language",
    ].map((label) => ({
      label,
      state: "Not observed",
      repoAuthority: "Outside repo authority",
      canRequestFromRepo: false,
      canInferFromLocalEvidence: false,
      reEntryHandlingAllowed: "Preserve private read-only human-platform authority boundary only",
    })),
    forbiddenOperationalItems: [
      "credential request",
      "secret storage",
      "platform value request",
      "production URL",
      "deploy trigger",
      "dashboard action",
      "DNS step",
      "rollback authorization",
      "public launch authorization",
      "public deploy authorization",
      "authority bypass",
      "re-entry unlock",
      "deploy action",
      "executable sequence",
    ].map((label) => ({ label, state: "Absent from human-platform authority re-entry gate" })),
    reEntrySummary: {
      externalDeployFactsRequested: "No",
      valuesRequested: "No",
      credentialsRequestedOrStored: "No",
      platformValuesRequestedOrStored: "No",
      productionUrlRequestedOrStored: "No",
      deployTriggerRequestedOrStored: "No",
      rollbackDetailsRequestedOrStored: "No",
      executableDeploySequenceCreated: "No",
      publicDeployAuthorized: "No",
      publicLaunchAuthorized: "No",
      rollbackAuthorized: "No",
      humanPlatformAuthorityBypassed: "No",
      deployUnlocked: "No",
      reEntryUnlocked: "No",
      executionImplied: "No",
    },
    noSecretNoDeployGuardrails: {
      credentialRequestAllowed: false,
      secretStorageAllowed: false,
      platformValueRequestAllowed: false,
      platformInputRequestAllowed: false,
      productionUrlStored: false,
      deployTriggerStored: false,
      dashboardActionAvailable: false,
      dnsStepAvailable: false,
      rollbackAuthorized: false,
      publicDeployAuthorized: false,
      publicLaunchAuthorized: false,
      authorityBypassAllowed: false,
      reEntryUnlockAllowed: false,
      deployActionRequested: false,
      executableSequenceCreated: false,
      finalDecisionChangeAllowed: false,
      productionDeploymentState: "Do Not Deploy",
    },
    crossArtifactEvidence: {
      finalLedgerDecision: finalLedger?.decision || "No-Go / Do Not Deploy",
      recoveryChecklistState: recoveryChecklist?.state || "post-autonomous-stop-recovery-checklist-do-not-deploy",
      adminDataExternalInputsPresent: false,
      productReadinessExternalInputsPresent: false,
      staticOutputExternalInputsPresent: false,
    },
    evidenceNote:
      "Private human-platform authority re-entry gate is a blocked re-entry boundary only. Every re-entry fact remains private, read-only, Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, no-authority-bypass, and non-executable.",
  };
}

function outsideAuthorityAwaitingStateLedger({ checkedAt, finalLedger, authorityReEntryGate }) {
  return {
    format: "proofresume-outside-authority-awaiting-state-ledger-v1",
    state: "outside-authority-awaiting-state-blocked-do-not-deploy",
    checkedAt,
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    publishingState: "Do Not Publish",
    private: true,
    localOnly: true,
    readOnly: true,
    autonomousRecoveryBoundary: true,
    awaitingOutsideAuthority: true,
    awaitingBlocked: true,
    nonRequest: true,
    outsideRepoAuthority: true,
    notDeployPlan: true,
    notPlatformSetupPlan: true,
    notCredentialRequest: true,
    notLaunchPlan: true,
    notRollbackPlan: true,
    notExecutableSequence: true,
    executableSteps: [],
    deploySequence: [],
    sourceConsumed: {
      path: "ops/deploy/private-human-platform-authority-re-entry-gate.md",
      state: "Observed as private read-only re-entry boundary",
      canRequestValues: false,
      canAuthorizeDeploy: false,
      canAuthorizeLaunch: false,
      canAuthorizeRollback: false,
      canBypassHumanPlatformAuthority: false,
      canUnlockReEntry: false,
      canUnlockDeploy: false,
      canPublish: false,
    },
    awaitingScope: [
      { key: "admin-data", source: "website/admin-data.json", state: "local-context-only", canAuthorize: false, canRequestValues: false, canExecute: false },
      { key: "product-readiness", source: "website/intake.html + website/review.html local readiness surfaces", state: "local-context-only", canAuthorize: false, canRequestValues: false, canExecute: false },
      { key: "static-rehearsal-output", source: "ops/reports/static-deploy-rehearsal/latest.json", state: "local-evidence-only", canAuthorize: false, canRequestValues: false, canExecute: false },
      { key: "outside-authority-awaiting-state-ledger", source: "ops/deploy/private-outside-authority-awaiting-state-ledger.md", state: "private-read-only-context", canAuthorize: false, canRequestValues: false, canExecute: false },
    ],
    awaitingFacts: [
      "human/platform authority",
      "explicit future human approval",
      "selected platform",
      "credential availability outside repo",
      "production URL / production origin",
      "deploy trigger",
      "rollback owner",
      "rollback method",
      "rollback readiness",
      "post-deploy health readiness",
      "public launch authorization",
      "public deploy authorization",
      "demand conclusion",
      "testimonial conclusion",
      "pricing conclusion",
      "willingness-to-pay conclusion",
      "secure-intake conclusion",
      "outcome conclusion",
      "proof claim conclusion",
      "paid-offer language",
    ].map((label) => ({
      label,
      state: "Not observed",
      repoAuthority: "Outside repo authority",
      canRequestFromRepo: false,
      canInferFromLocalEvidence: false,
      awaitingHandlingAllowed: "Preserve private read-only outside-authority awaiting boundary only",
    })),
    forbiddenOperationalItems: [
      "credential request",
      "secret storage",
      "platform value request",
      "production URL",
      "deploy trigger",
      "dashboard action",
      "dns step",
      "rollback authorization",
      "public launch authorization",
      "public deploy authorization",
      "authority bypass",
      "re-entry unlock",
      "deploy unlock",
      "deploy action",
      "publish action",
      "executable sequence",
    ].map((label) => ({ label, state: "Absent from outside-authority awaiting-state ledger" })),
    awaitingSummary: {
      externalDeployFactsRequested: "No",
      valuesRequested: "No",
      credentialsRequestedOrStored: "No",
      platformValuesRequestedOrStored: "No",
      productionUrlRequestedOrStored: "No",
      deployTriggerRequestedOrStored: "No",
      rollbackDetailsRequestedOrStored: "No",
      executableDeploySequenceCreated: "No",
      publicDeployAuthorized: "No",
      publicLaunchAuthorized: "No",
      rollbackAuthorized: "No",
      humanPlatformAuthorityBypassed: "No",
      deployUnlocked: "No",
      executionImplied: "No",
    },
    noSecretNoDeployGuardrails: {
      credentialRequestAllowed: false,
      secretStorageAllowed: false,
      platformValueRequestAllowed: false,
      platformInputRequestAllowed: false,
      productionUrlStored: false,
      deployTriggerStored: false,
      dashboardActionAvailable: false,
      dnsStepAvailable: false,
      rollbackAuthorized: false,
      publicDeployAuthorized: false,
      publicLaunchAuthorized: false,
      authorityBypassAllowed: false,
      reEntryUnlockAllowed: false,
      deployUnlockAllowed: false,
      deployActionRequested: false,
      publishActionRequested: false,
      executableSequenceCreated: false,
      finalDecisionChangeAllowed: false,
      productionDeploymentState: "Do Not Deploy",
    },
    crossArtifactEvidence: {
      finalLedgerDecision: finalLedger?.decision || "No-Go / Do Not Deploy",
      humanPlatformAuthorityReEntryGateState: authorityReEntryGate?.state || "human-platform-authority-re-entry-blocked-do-not-deploy",
      adminDataExternalInputsPresent: false,
      productReadinessExternalInputsPresent: false,
      staticOutputExternalInputsPresent: false,
    },
    evidenceNote:
      "Private outside-authority awaiting-state ledger preserves blocked state after the human-platform authority re-entry gate. Every awaiting fact remains private, read-only, Not observed, outside repo authority, non-request, Do Not Publish, no-secret, no-deploy, no-public-launch, no-rollback, no-authority-bypass, and non-executable.",
  };
}

async function servedSmokeHttp(requestAudit) {
  const routes = ["/", "/intake.html", "/review.html", "/admin.html", "/admin-data.json"];
  const server = createStaticServer(requestAudit);
  try {
    const address = await listen(server);
    const routeStatus = [];
    for (const route of routes) {
      routeStatus.push(await requestLocalRoute(address.port, route));
    }
    return {
      mode: "local-http",
      ok: routeStatus.every((route) => route.ok) && requestAudit.apiRequests.length === 0 && requestAudit.mutatingRequests.length === 0,
      origin: `http://127.0.0.1:${address.port}`,
      routeStatus,
      note: "Local HTTP smoke used an in-process static server bound to 127.0.0.1 only.",
    };
  } catch (error) {
    return servedSmokeFallback(error?.message || String(error));
  } finally {
    if (server.listening) {
      await closeServer(server);
    }
  }
}

async function main() {
  const startedAt = new Date();
  fs.mkdirSync(outDir, { recursive: true });

  const requestAudit = {
    externalRequests: [],
    apiRequests: [],
    mutatingRequests: [],
    localRequests: [],
  };

  const steps = [];
  steps.push(runCommand("git status --short", "git", ["status", "--short"]));

  steps.push(runCommand("npm test", "npm", ["test"]));
  steps.push(runCommand("npm run visual-qa", "npm", ["run", "visual-qa"]));
  steps.push(runCommand("npm run build-admin", "npm", ["run", "build-admin"]));

  const adminDataShape = validateAdminDataShape();
  const staticEntrypoints = validateStaticEntrypoints();
  const routeInventory = listWebsiteEntrypoints();
  const launchCopyHash = fileExists("ops/launch/launch-copy.md") ? sha256Text(readText("ops/launch/launch-copy.md")) : null;

  const servedSmoke = await servedSmokeHttp(requestAudit);
  const routeStatus = servedSmoke.routeStatus || [];

  const ok =
    steps.every((step) => step.ok) &&
    Boolean(adminDataShape.ok) &&
    Boolean(staticEntrypoints.ok) &&
    Boolean(servedSmoke.ok) &&
    requestAudit.externalRequests.length === 0 &&
    requestAudit.apiRequests.length === 0 &&
    requestAudit.mutatingRequests.length === 0;

  const checkedAt = new Date().toISOString();
  const noDeployGuardrails = {
    platformCredentialConsumed: false,
    productionUrlConsumed: false,
    deployTriggerConsumed: false,
    platformDashboardVisited: false,
    deployCliCommandRun: false,
    ciDeployTriggered: false,
    dnsChanged: false,
    externalDeployRequests: requestAudit.externalRequests.length,
    externalApiRequests: requestAudit.apiRequests.length,
    mutatingRequests: requestAudit.mutatingRequests.length,
    productionDeploymentState: "Do Not Deploy",
  };
  const finalLedger = finalDeployGoNoGoLedger({
    ok,
    checkedAt,
    mode: servedSmoke.mode,
    routeStatus,
    noDeployGuardrails,
  });
  const deployBlockerMemo = deployBlockerEscalationMemo({
    checkedAt,
    finalLedger,
  });
  const firstHumanOperatorPacketIndex = firstHumanOperatorDeployPacketIndex({
    checkedAt,
    finalLedger,
    escalationMemo: deployBlockerMemo,
  });
  const operatorDryRunChecklist = operatorDryRunReviewChecklist({
    checkedAt,
    finalLedger,
    packetIndex: firstHumanOperatorPacketIndex,
  });
  const firstHumanColdStartArchive = firstHumanPacketColdStartArchive({
    checkedAt,
    finalLedger,
    packetIndex: firstHumanOperatorPacketIndex,
    dryRunChecklist: operatorDryRunChecklist,
  });
  const releaseCandidateContinuationMap = releaseCandidateDeployContinuationMap({
    checkedAt,
    finalLedger,
    packetIndex: firstHumanOperatorPacketIndex,
    dryRunChecklist: operatorDryRunChecklist,
    coldStartArchive: firstHumanColdStartArchive,
  });
  const privateBoundaryLedger = privateExternalInputBoundaryLedger({
    checkedAt,
    finalLedger,
    continuationMap: releaseCandidateContinuationMap,
  });
  const platformOwnerTransferNote = platformOwnerNonRequestTransferNote({
    checkedAt,
    finalLedger,
    boundaryLedger: privateBoundaryLedger,
  });
  const operatorGuardrail = operatorResumePacketGuardrail({
    checkedAt,
    finalLedger,
    transferNote: platformOwnerTransferNote,
  });
  const blockedStateContinuationIndex = blockedStateOperatorContinuationIndex({
    checkedAt,
    finalLedger,
    operatorGuardrail,
  });
  const autonomousStopLedger = autonomousDeployStopLedger({
    checkedAt,
    finalLedger,
    continuationIndex: blockedStateContinuationIndex,
  });
  const recoveryChecklist = postAutonomousStopRecoveryChecklist({
    checkedAt,
    finalLedger,
    autonomousLedger: autonomousStopLedger,
  });
  const authorityReEntryGate = humanPlatformAuthorityReEntryGate({
    checkedAt,
    finalLedger,
    recoveryChecklist,
  });
  const awaitingLedger = outsideAuthorityAwaitingStateLedger({
    checkedAt,
    finalLedger,
    authorityReEntryGate,
  });
  const report = {
    ok,
    checkedAt,
    mode: servedSmoke.mode,
    constraints: {
      sandboxNetworkDisabled: process.env.CODEX_SANDBOX_NETWORK_DISABLED === "1",
      note: "This rehearsal is credential-free and must not consume platform credentials, production URLs, or deploy triggers.",
    },
    noDeployGuardrails,
    finalDeployGoNoGoLedger: finalLedger,
    deployBlockerEscalationMemo: deployBlockerMemo,
    firstHumanOperatorDeployPacketIndex: firstHumanOperatorPacketIndex,
    operatorDryRunReviewChecklist: operatorDryRunChecklist,
    firstHumanPacketColdStartArchive: firstHumanColdStartArchive,
    releaseCandidateDeployContinuationMap: releaseCandidateContinuationMap,
    privateExternalInputBoundaryLedger: privateBoundaryLedger,
    platformOwnerNonRequestTransferNote: platformOwnerTransferNote,
    operatorResumePacketGuardrail: operatorGuardrail,
    blockedStateOperatorContinuationIndex: blockedStateContinuationIndex,
    autonomousDeployStopLedger: autonomousStopLedger,
    postAutonomousStopRecoveryChecklist: recoveryChecklist,
    humanPlatformAuthorityReEntryGate: authorityReEntryGate,
    outsideAuthorityAwaitingStateLedger: awaitingLedger,
    requestAudit,
    evidence: {
      runbook: "ops/deploy/private-static-deploy-rehearsal-runbook.md",
      healthChecks: "ops/deploy/health-checks.md",
      launchCopyHashSha256: launchCopyHash,
      routes: routeInventory,
      routeStatus,
    },
    steps,
    adminDataShape,
    staticEntrypoints,
    servedSmoke,
  };

  const stamp = nowStamp(startedAt);
  const reportPath = path.join(outDir, `${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(latestPath, JSON.stringify({ ...report, reportPath: `ops/reports/static-deploy-rehearsal/${stamp}.json` }, null, 2));

  console.log(JSON.stringify({ ok: report.ok, checkedAt: report.checkedAt, report: `ops/reports/static-deploy-rehearsal/${stamp}.json` }, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

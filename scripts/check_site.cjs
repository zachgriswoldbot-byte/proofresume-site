const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const htmlPages = fs
  .readdirSync(root)
  .filter((file) => file.endsWith(".html"))
  .sort()
  .map((file) => ({
    file,
    name: file === "index.html" ? "site" : path.basename(file, ".html"),
    html: fs.readFileSync(path.join(root, file), "utf8"),
  }));
const htmlByFile = new Map(htmlPages.map((page) => [page.file, page.html]));
const html = htmlByFile.get("index.html");
const reviewHtml = htmlByFile.get("review.html");
const intakeHtml = htmlByFile.get("intake.html");
const adminHtml = htmlByFile.get("admin.html");
const appHtml = htmlByFile.get("app.html");
const proofPacketHtml = htmlByFile.get("proof-packet.html");
const targetJobHtml = htmlByFile.get("target-job.html");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const adminCss = fs.readFileSync(path.join(root, "admin.css"), "utf8");
const js = fs.readFileSync(path.join(root, "main.js"), "utf8");
const appJs = fs.readFileSync(path.join(root, "app.js"), "utf8");
const intakeJs = fs.readFileSync(path.join(root, "intake.js"), "utf8");
const reviewJs = fs.readFileSync(path.join(root, "review.js"), "utf8");
const adminJs = fs.readFileSync(path.join(root, "admin.js"), "utf8");
const proofPacketJs = fs.readFileSync(path.join(root, "proof-packet.js"), "utf8");
const targetJobJs = fs.readFileSync(path.join(root, "target-job.js"), "utf8");
const targetJobContractsSource = fs.readFileSync(path.join(root, "scripts", "target_job_contracts.cjs"), "utf8");
const targetJobContractsCliSource = fs.readFileSync(path.join(root, "scripts", "score_target_job_contracts.cjs"), "utf8");
const targetJobContractFixture = JSON.parse(fs.readFileSync(path.join(root, "fixtures", "target-job-contract-input.json"), "utf8"));
const adminData = JSON.parse(fs.readFileSync(path.join(root, "admin-data.json"), "utf8"));
const adminDataBuilderSource = fs.readFileSync(path.join(root, "scripts", "build_admin_data.cjs"), "utf8");
const staticDeployRehearsalSource = fs.readFileSync(path.join(root, "scripts", "static_deploy_rehearsal.cjs"), "utf8");
const qaIntakeFlowSource = fs.readFileSync(path.join(root, "scripts", "qa_intake_flow.cjs"), "utf8");
const qaTargetJobPackSource = fs.readFileSync(path.join(root, "scripts", "qa_target_job_pack.cjs"), "utf8");
const projectRoot = path.resolve(root, "..");
const businessControlsPolicy = JSON.parse(fs.readFileSync(path.join(projectRoot, "ops", "BUSINESS_CONTROLS.json"), "utf8"));
const targetJobPackSpecSource = fs.readFileSync(path.join(projectRoot, "ops", "research", "proofresume-target-job-pack-spec.md"), "utf8");
const justHireMeParityReviewSource = fs.readFileSync(
  path.join(projectRoot, "ops", "research", "justhireme-proofresume-parity-review.md"),
  "utf8"
);

function readJsonIfExists(relativePath) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to parse JSON at ${relativePath}: ${error?.message || String(error)}`);
  }
}

function requireAny(source, tokens, label) {
  if (!tokens.some((token) => source.includes(token))) {
    throw new Error(`Missing required ${label}: expected one of ${tokens.join(", ")}`);
  }
}

function requireAll(source, tokens, label) {
  const missing = tokens.filter((token) => !source.includes(token));
  if (missing.length) {
    throw new Error(`Missing required ${label}: ${missing.join(", ")}`);
  }
}

function assertFollowupEvidenceVisibilityContract(visibility, label) {
  if (!visibility || typeof visibility !== "object") {
    throw new Error(`Missing follow-up evidence visibility contract for ${label}`);
  }

  if (visibility.format !== "proofresume-followup-evidence-visibility-v1") {
    throw new Error(`Unexpected follow-up evidence visibility format for ${label}: ${visibility.format}`);
  }

  if (!Array.isArray(visibility.generatedFrom) || !visibility.generatedFrom.length) {
    throw new Error(`Follow-up evidence visibility ${label} must include generatedFrom sources.`);
  }

  const expectedFixturePath = "data/intake/sample-followup-export-snapshot.json";
  const snapshotPaths = (visibility.snapshots || []).map((snapshot) => snapshot.path);
  if (!snapshotPaths.includes(expectedFixturePath)) {
    throw new Error(`Follow-up evidence visibility ${label} must include fixture snapshot path ${expectedFixturePath}.`);
  }

  if (visibility.evidenceItemCount !== 3) {
    throw new Error(`Follow-up evidence visibility ${label} evidenceItemCount must remain stable at 3 (fixture).`);
  }
  if (visibility.evidenceApprovedCount !== 2) {
    throw new Error(`Follow-up evidence visibility ${label} evidenceApprovedCount must remain stable at 2 (fixture).`);
  }
  if (visibility.candidateAcceptedCount !== 1) {
    throw new Error(`Follow-up evidence visibility ${label} candidateAcceptedCount must remain stable at 1 (fixture).`);
  }
  if (visibility.approvedAndAcceptedCount !== 1) {
    throw new Error(`Follow-up evidence visibility ${label} approvedAndAcceptedCount must remain stable at 1 (fixture).`);
  }
  if (visibility.acceptedWithoutEvidenceApprovalCount !== 0) {
    throw new Error(`Follow-up evidence visibility ${label} must keep acceptedWithoutEvidenceApprovalCount at 0 (fixture).`);
  }
}

function assertStaticDeployVisibilityContract(visibility, label, options = {}) {
  if (!visibility || typeof visibility !== "object") {
    throw new Error(`Missing static deploy rehearsal visibility contract for ${label}`);
  }

  const allowedStates = new Set(["not-run", "passed-local", "blocked-no-credentials"]);
  if (!allowedStates.has(visibility.state)) {
    throw new Error(`Unexpected static deploy rehearsal state for ${label}: ${visibility.state}`);
  }

  const counts = visibility.stateCounts || {};
  const expectedCounts = {
    notRun: visibility.state === "not-run" ? 1 : 0,
    passedLocal: visibility.state === "passed-local" ? 1 : 0,
    blockedNoCredentials: visibility.state === "blocked-no-credentials" ? 1 : 0,
  };
  if (options.exactCounts) {
    for (const [key, expected] of Object.entries(expectedCounts)) {
      if (counts[key] !== expected) {
        throw new Error(`Static deploy rehearsal ${label} has unstable ${key} count: expected ${expected}, saw ${counts[key]}`);
      }
    }
  } else {
    const countValues = ["notRun", "passedLocal", "blockedNoCredentials"].map((key) => counts[key]);
    if (!countValues.every((value) => Number.isInteger(value) && value >= 0)) {
      throw new Error(`Static deploy rehearsal ${label} must expose non-negative integer state counts.`);
    }
    const activeCountKey = visibility.state === "not-run" ? "notRun" : visibility.state === "passed-local" ? "passedLocal" : "blockedNoCredentials";
    if (counts[activeCountKey] < 1) {
      throw new Error(`Static deploy rehearsal ${label} must count at least one ${visibility.state} item.`);
    }
  }

  const guardrails = visibility.noDeployGuardrails || {};
  const capturedFields = [
    "platformCredentialConsumed",
    "productionUrlConsumed",
    "deployTriggerConsumed",
    "credentialInputsConsumed",
  ].filter((key) => guardrails[key]);
  if (capturedFields.length) {
    throw new Error(`Static deploy rehearsal ${label} captured forbidden deploy inputs: ${capturedFields.join(", ")}`);
  }

  if (guardrails.productionDeploymentState && guardrails.productionDeploymentState !== "Do Not Deploy") {
    throw new Error(`Static deploy rehearsal ${label} changed production deployment state: ${guardrails.productionDeploymentState}`);
  }

  if (visibility.state === "not-run") {
    if (visibility.ok !== false || visibility.mode !== "unobserved" || (visibility.steps || []).length) {
      throw new Error("Static deploy rehearsal not-run state must stay unobserved, not ok, and step-free.");
    }
    if (!String(visibility.evidenceNote || "").includes("No static deploy rehearsal report is present yet")) {
      throw new Error("Static deploy rehearsal not-run state must keep missing-report operator guidance.");
    }
  }

  if (visibility.state === "passed-local") {
    if (visibility.ok !== true) {
      throw new Error("Static deploy rehearsal passed-local state must be ok.");
    }
    if (!["local-http", "static-fallback"].includes(String(visibility.mode || ""))) {
      throw new Error(`Static deploy rehearsal passed-local mode must stay local-only, saw ${visibility.mode}`);
    }
    if (!String(visibility.evidenceNote || "").includes("credential-free local rehearsal evidence only")) {
      throw new Error("Static deploy rehearsal passed-local state must keep credential-free evidence boundary copy.");
    }
  }
}

function assertStaticDeployFailureFixtureContract(fixture) {
  if (fixture.state !== "blocked-no-credentials" || fixture.ok !== false) {
    throw new Error("Static deploy failure fixture must stay blocked-no-credentials and not ok.");
  }
  const history = fixture.history || {};
  if (!history.priorFailures?.length || !history.staleEvidence?.length) {
    throw new Error("Static deploy failure fixture must include prior failure and stale evidence history.");
  }
  const fixtureText = JSON.stringify(fixture).toLowerCase();
  for (const token of ["blocked route", "missing static entrypoint", "stale evidence", "unsafe guardrail"]) {
    if (!fixtureText.includes(token)) {
      throw new Error(`Static deploy failure fixture missing ${token} example.`);
    }
  }
  if (fixture.noDeployGuardrails?.platformCredentialConsumed || fixture.noDeployGuardrails?.productionUrlConsumed || fixture.noDeployGuardrails?.deployTriggerConsumed) {
    throw new Error("Static deploy failure fixture must not consume platform credentials, production URLs, or deploy triggers.");
  }
  if (fixture.noDeployGuardrails?.productionDeploymentState !== "Do Not Deploy") {
    throw new Error("Static deploy failure fixture must preserve Do Not Deploy state.");
  }
}

function assertPlatformOwnerHandoffContract(visibility, label) {
  if (!visibility || typeof visibility !== "object" || !Array.isArray(visibility.rows) || !visibility.rows.length) {
    throw new Error(`Missing platform-owner handoff visibility contract for ${label}`);
  }

  if (visibility.localStaticPassed !== true) {
    throw new Error(`Platform-owner handoff ${label} must be route-evidence gated by passed local static rehearsal.`);
  }

  const serialized = JSON.stringify(visibility).toLowerCase();
  for (const token of [
    "post-deploy status method",
    "post-deploy health-check entrypoints",
    "production origin to check after deploy",
    "deploy trigger or tokenized command",
    "do not deploy",
  ]) {
    if (!serialized.includes(token)) {
      throw new Error(`Platform-owner handoff ${label} missing required handoff token: ${token}`);
    }
  }

  for (const [index, row] of visibility.rows.entries()) {
    if (row.state !== "handoff-blocked") {
      throw new Error(`Platform-owner handoff ${label} row ${index} must remain handoff-blocked.`);
    }
    if (row.publicDeployStatus?.productionDeploymentState !== "Do Not Deploy" || row.publicDeployStatus?.blocked !== true) {
      throw new Error(`Platform-owner handoff ${label} row ${index} must preserve Do Not Deploy blocked state.`);
    }
    if (!Array.isArray(row.unavailableCredentialDeployValues) || row.unavailableCredentialDeployValues.length < 3) {
      throw new Error(`Platform-owner handoff ${label} row ${index} must list unavailable credential/deploy values.`);
    }
    const unavailableLabels = row.unavailableCredentialDeployValues.map((value) => String(value.label || "").toLowerCase()).join("\n");
    for (const token of ["credentials", "production url", "deploy trigger"]) {
      if (!unavailableLabels.includes(token)) {
        throw new Error(`Platform-owner handoff ${label} row ${index} must mark ${token} unavailable.`);
      }
    }
    const nonSecretLabels = (row.nonSecretInputsNeeded || []).map((value) => String(value.label || "").toLowerCase()).join("\n");
    if (!nonSecretLabels.includes("post-deploy health-check entrypoints") || !nonSecretLabels.includes("post-deploy status method")) {
      throw new Error(`Platform-owner handoff ${label} row ${index} must include post-deploy health handoff categories.`);
    }
    if (!String(row.evidenceNote || "").toLowerCase().includes("category-level only")) {
      throw new Error(`Platform-owner handoff ${label} row ${index} must keep category-level-only evidence copy.`);
    }
  }

  for (const forbidden of [/https?:\/\//i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /token\s*[:=]/i, /bearer\s+[a-z0-9]/i]) {
    if (forbidden.test(JSON.stringify(visibility))) {
      throw new Error(`Platform-owner handoff ${label} leaked a forbidden URL or secret value marker.`);
    }
  }
}

function assertPostDeployHealthOwnerHandoffContract(visibility, label) {
  if (!visibility || typeof visibility !== "object" || !Array.isArray(visibility.rows) || !visibility.rows.length) {
    throw new Error(`Missing post-deploy health owner handoff visibility contract for ${label}`);
  }

  const serialized = JSON.stringify(visibility).toLowerCase();
  for (const token of [
    "route-only checks",
    "production origins",
    "deploy triggers",
    "do not deploy",
    "not observed",
  ]) {
    if (!serialized.includes(token)) {
      throw new Error(`Post-deploy health handoff ${label} missing required token: ${token}`);
    }
  }

  for (const [index, row] of visibility.rows.entries()) {
    if (!Array.isArray(row.routeOnlyChecks) || row.routeOnlyChecks.length < 5) {
      throw new Error(`Post-deploy health handoff ${label} row ${index} must expose route-only checks.`);
    }
    for (const route of row.routeOnlyChecks) {
      if (!String(route.path || "").startsWith("/")) {
        throw new Error(`Post-deploy health handoff ${label} row ${index} must keep route checks origin-free.`);
      }
      if (String(route.path || "").includes("://")) {
        throw new Error(`Post-deploy health handoff ${label} row ${index} must not store production origins.`);
      }
    }
    if (row.unavailableProductionOrigin?.state !== "Not observed") {
      throw new Error(`Post-deploy health handoff ${label} row ${index} must keep production origin unavailable.`);
    }
    if (row.unavailableDeployTrigger?.state !== "Not observed") {
      throw new Error(`Post-deploy health handoff ${label} row ${index} must keep deploy trigger unavailable.`);
    }
    if (row.blockedLaunchAuthorization?.deploymentState !== "Do Not Deploy" || row.blockedLaunchAuthorization?.blocked !== true) {
      throw new Error(`Post-deploy health handoff ${label} row ${index} must preserve Do Not Deploy launch block.`);
    }
    if (!String(row.evidenceNote || "").toLowerCase().includes("stores no origins")) {
      throw new Error(`Post-deploy health handoff ${label} row ${index} must keep no-origin/no-secret evidence copy.`);
    }
  }

  for (const forbidden of [/https?:\/\//i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /token\s*[:=]/i, /bearer\s+[a-z0-9]/i]) {
    if (forbidden.test(serialized)) {
      throw new Error(`Post-deploy health handoff ${label} must not contain URL/secret/token markers.`);
    }
  }
}

function finalDeployGoNoGoLedgerFixture(overrides = {}) {
  return {
    format: "proofresume-final-deploy-go-no-go-ledger-v1",
    state: "no-go",
    decision: "No-Go / Do Not Deploy",
    localStaticRehearsal: {
      present: true,
      passedLocal: true,
      mode: "local-http",
      routeEvidence: [{ route: "/", localOnly: true, ok: true, status: 200 }],
    },
    adminDataEvidence: {
      present: true,
      externalInputsPresent: false,
    },
    productReadinessEvidence: {
      present: true,
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
      platformCredentialConsumed: false,
      productionUrlConsumed: false,
      deployTriggerConsumed: false,
      credentialInputsConsumed: false,
      platformDashboardVisited: false,
      publicLaunchAuthorizationObserved: false,
      dashboardLinkStored: false,
      finalDeployActionRequested: false,
      productionDeploymentState: "Do Not Deploy",
    },
    evidenceNote:
      "Final deploy go/no-go ledger is deterministic local evidence only. Passing static rehearsal cannot authorize deployment without external human/platform inputs; final decision remains No-Go / Do Not Deploy.",
    ...overrides,
  };
}

function derivedFinalDeployLedgerFromAdminData(queueInput) {
  const staticVisibility = queueInput?.staticDeployRehearsalVisibility || {};
  const platformVisibility = queueInput?.platformOwnerHandoffVisibility || {};
  const healthVisibility = queueInput?.postDeployHealthOwnerHandoffVisibility || {};
  return finalDeployGoNoGoLedgerFixture({
    localStaticRehearsal: {
      present: Boolean(staticVisibility.state),
      passedLocal: staticVisibility.state === "passed-local" && staticVisibility.ok === true,
      mode: staticVisibility.mode || "unobserved",
      reportPath: staticVisibility.reportPath || "ops/reports/static-deploy-rehearsal/latest.json",
      routeEvidence: staticVisibility.routeEvidence || [],
    },
    adminDataEvidence: {
      present: Boolean(platformVisibility.total || healthVisibility.total),
      platformOwnerHandoffPresent: Boolean(platformVisibility.total),
      postDeployHealthHandoffPresent: Boolean(healthVisibility.total),
      externalInputsPresent: false,
    },
    productReadinessEvidence: {
      present: reviewHtml.includes("data-pr=\"postDeployHealthCheckHandoffState\""),
      externalInputsPresent: false,
    },
  });
}

function assertFinalDeployGoNoGoLedgerContract(ledger, label) {
  if (!ledger || typeof ledger !== "object") {
    throw new Error(`Missing final deploy go/no-go ledger contract for ${label}`);
  }

  if (Array.isArray(ledger.rows)) {
    if (!ledger.rows.length || ledger.finalNoGoCount !== ledger.rows.length) {
      throw new Error(`Final deploy go/no-go ledger ${label} must keep every row in final No-Go.`);
    }
    if (ledger.humanApprovalMissingCount < 1 || ledger.credentialsUnavailableCount < 1 || ledger.evidenceMissingCount < 1) {
      throw new Error(`Final deploy go/no-go ledger ${label} must expose missing human approval, credentials, and deploy prerequisites.`);
    }
    for (const [index, row] of ledger.rows.entries()) {
      if (row.state !== "no-go-do-not-deploy") {
        throw new Error(`Final deploy go/no-go ledger ${label} row ${index} changed state: ${row.state}`);
      }
      const missingLabels = [...(row.evidenceMissing || []), ...(row.humanApprovalMissing || []), ...(row.credentialsUnavailable || [])]
        .map((input) => String(input.label || "").toLowerCase())
        .join("\n");
      for (const token of [
        "production origin",
        "deploy trigger",
        "rollback readiness",
        "post-deploy health",
        "explicit future human approval",
        "credentials",
      ]) {
        if (!missingLabels.includes(token)) {
          throw new Error(`Final deploy go/no-go ledger ${label} row ${index} missing blocker: ${token}`);
        }
      }
      if (![...(row.evidenceMissing || []), ...(row.humanApprovalMissing || []), ...(row.credentialsUnavailable || [])].every((input) => input.state === "Not observed" || /unavailable/i.test(input.state || ""))) {
        throw new Error(`Final deploy go/no-go ledger ${label} row ${index} must keep external blockers Not observed or unavailable.`);
      }
      if (!String(row.evidenceNote || "").includes("stores no credentials")) {
        throw new Error(`Final deploy go/no-go ledger ${label} row ${index} must keep no-secret/no-deploy evidence copy.`);
      }
    }
    const serializedAggregate = JSON.stringify(ledger);
    for (const forbidden of [/https?:\/\//i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /token\s*[:=]/i, /bearer\s+[a-z0-9]/i, /dashboard\s+link\s*[:=]/i]) {
      if (forbidden.test(serializedAggregate)) {
        throw new Error(`Final deploy go/no-go ledger ${label} leaked URL, secret, token, bearer, or dashboard-link marker.`);
      }
    }
    return;
  }

  if (ledger.state !== "no-go" || ledger.decision !== "No-Go / Do Not Deploy") {
    throw new Error(`Final deploy go/no-go ledger ${label} must stay No-Go / Do Not Deploy.`);
  }

  if (ledger.localStaticRehearsal?.passedLocal === true && ledger.decision !== "No-Go / Do Not Deploy") {
    throw new Error(`Final deploy go/no-go ledger ${label} allowed local rehearsal to unlock deploy.`);
  }

  if (ledger.adminDataEvidence?.externalInputsPresent !== false || ledger.productReadinessEvidence?.externalInputsPresent !== false) {
    throw new Error(`Final deploy go/no-go ledger ${label} must not mark external inputs present from repo/admin/product evidence.`);
  }

  const inputLabels = (ledger.requiredExternalInputs || []).map((input) => String(input.label || "").toLowerCase()).join("\n");
  for (const token of [
    "explicit future human approval",
    "credentials outside the repo",
    "production origin",
    "deploy trigger",
    "rollback readiness",
    "post-deploy health readiness",
  ]) {
    if (!inputLabels.includes(token)) {
      throw new Error(`Final deploy go/no-go ledger ${label} missing required blocker: ${token}`);
    }
  }

  if (!(ledger.requiredExternalInputs || []).every((input) => String(input.state || "") === "Not observed")) {
    throw new Error(`Final deploy go/no-go ledger ${label} must keep all external inputs Not observed.`);
  }

  const guardrails = ledger.noDeployGuardrails || {};
  const forbiddenTrueFields = [
    "platformCredentialConsumed",
    "productionUrlConsumed",
    "deployTriggerConsumed",
    "credentialInputsConsumed",
    "platformDashboardVisited",
    "publicLaunchAuthorizationObserved",
    "dashboardLinkStored",
    "finalDeployActionRequested",
  ].filter((key) => guardrails[key]);
  if (forbiddenTrueFields.length) {
    throw new Error(`Final deploy go/no-go ledger ${label} unlocked forbidden deploy fields: ${forbiddenTrueFields.join(", ")}`);
  }

  if (guardrails.productionDeploymentState !== "Do Not Deploy") {
    throw new Error(`Final deploy go/no-go ledger ${label} changed production deployment state.`);
  }

  const serialized = JSON.stringify(ledger);
  for (const forbidden of [/https?:\/\//i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /token\s*[:=]/i, /bearer\s+[a-z0-9]/i, /dashboard\s+link\s*[:=]/i]) {
    if (forbidden.test(serialized)) {
      throw new Error(`Final deploy go/no-go ledger ${label} leaked URL, secret, token, bearer, or dashboard-link marker.`);
    }
  }

  if (!String(ledger.evidenceNote || "").includes("Passing static rehearsal cannot authorize deployment")) {
    throw new Error(`Final deploy go/no-go ledger ${label} must explain local evidence cannot authorize deploy.`);
  }
}

function deployBlockerEscalationMemoFixture(overrides = {}) {
  return {
    format: "proofresume-deploy-blocker-escalation-memo-v1",
    state: "blocked-escalation-summary",
    finalDecision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    consumedEvidence: [
      { path: "ops/deploy/private-final-deploy-go-no-go-evidence-ledger-template.md", state: "Observed" },
      { path: "ops/deploy/private-platform-owner-handoff-checklist.md", state: "Observed" },
      { path: "ops/deploy/private-post-deploy-health-check-owner-handoff-template.md", state: "Observed" },
    ],
    adminDataEvidence: {
      present: true,
      externalInputsPresent: false,
    },
    productReadinessEvidence: {
      present: true,
      canChangeFinalDecision: false,
    },
    localStaticRehearsalEvidence: {
      present: true,
      passedLocal: true,
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
    ...overrides,
  };
}

function assertDeployBlockerEscalationMemoContract(memo, label) {
  if (!memo || typeof memo !== "object") {
    throw new Error(`Missing deploy-blocker escalation memo contract for ${label}`);
  }
  if (memo.format !== "proofresume-deploy-blocker-escalation-memo-v1") {
    throw new Error(`Deploy-blocker escalation memo ${label} has unexpected format.`);
  }
  if (memo.finalDecision !== "No-Go / Do Not Deploy" || memo.productionDeploymentState !== "Do Not Deploy") {
    throw new Error(`Deploy-blocker escalation memo ${label} changed No-Go / Do Not Deploy.`);
  }
  if (memo.adminDataEvidence?.externalInputsPresent !== false || memo.productReadinessEvidence?.canChangeFinalDecision !== false) {
    throw new Error(`Deploy-blocker escalation memo ${label} must not infer deploy inputs from Admin/Product readiness.`);
  }
  if (memo.localStaticRehearsalEvidence?.canAuthorizeDeploy !== false) {
    throw new Error(`Deploy-blocker escalation memo ${label} allowed local static rehearsal to authorize deploy.`);
  }

  const consumedPaths = (memo.consumedEvidence || []).map((item) => String(item.path || ""));
  for (const path of [
    "ops/deploy/private-final-deploy-go-no-go-evidence-ledger-template.md",
    "ops/deploy/private-platform-owner-handoff-checklist.md",
    "ops/deploy/private-post-deploy-health-check-owner-handoff-template.md",
  ]) {
    if (!consumedPaths.includes(path)) {
      throw new Error(`Deploy-blocker escalation memo ${label} missing consumed evidence path: ${path}`);
    }
  }

  const unavailableLabels = (memo.unavailableItems || []).map((item) => String(item.label || "").toLowerCase()).join("\n");
  for (const token of [
    "explicit future human approval",
    "credential availability outside repo",
    "selected deploy platform",
    "production url / production origin",
    "deploy trigger",
    "rollback owner",
    "rollback method",
    "post-deploy health-check",
    "public launch authorization",
    "demand",
    "testimonial",
    "willingness-to-pay",
    "pricing",
    "outcome",
  ]) {
    if (!unavailableLabels.includes(token)) {
      throw new Error(`Deploy-blocker escalation memo ${label} missing unavailable item: ${token}`);
    }
  }
  if (!(memo.unavailableItems || []).every((item) => String(item.state || "") === "Not observed")) {
    throw new Error(`Deploy-blocker escalation memo ${label} must keep every unavailable item Not observed.`);
  }

  const guardrails = memo.noSecretNoDeployGuardrails || {};
  const forbiddenTrueFields = [
    "credentialRequestAllowed",
    "platformValueStored",
    "productionUrlStored",
    "deployTriggerStored",
    "dashboardLinkStored",
    "publicLaunchAuthorized",
    "rollbackAuthorized",
    "finalDecisionChangeAllowed",
    "finalDeployActionRequested",
  ].filter((key) => guardrails[key]);
  if (forbiddenTrueFields.length) {
    throw new Error(`Deploy-blocker escalation memo ${label} unlocked forbidden fields: ${forbiddenTrueFields.join(", ")}`);
  }
  if (guardrails.productionDeploymentState !== "Do Not Deploy") {
    throw new Error(`Deploy-blocker escalation memo ${label} changed production deployment state.`);
  }

  const serialized = JSON.stringify(memo);
  for (const forbidden of [/https?:\/\//i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /token\s*[:=]/i, /bearer\s+[a-z0-9]/i, /dashboard\s+link\s*[:=]/i]) {
    if (forbidden.test(serialized)) {
      throw new Error(`Deploy-blocker escalation memo ${label} leaked URL, secret, token, bearer, or dashboard-link marker.`);
    }
  }
  if (!String(memo.evidenceNote || "").includes("cannot request secrets")) {
    throw new Error(`Deploy-blocker escalation memo ${label} must explain it cannot request secrets.`);
  }
}

function firstHumanOperatorDeployPacketIndexFixture(overrides = {}) {
  return {
    format: "proofresume-first-human-operator-deploy-packet-index-v1",
    state: "index-only-do-not-deploy",
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
        state: "local-static-passed-indexed",
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
    ...overrides,
  };
}

function assertFirstHumanOperatorDeployPacketIndexContract(index, label) {
  if (!index || typeof index !== "object") {
    throw new Error(`Missing first-human-operator deploy packet index contract for ${label}`);
  }
  if (index.format !== "proofresume-first-human-operator-deploy-packet-index-v1") {
    if (!Array.isArray(index.rows) || !index.rows.length) {
      throw new Error(`First-human-operator deploy packet index ${label} has unexpected format.`);
    }
    if (index.finalNoGoCount < 1 || index.deployActionAvailableCount !== 0) {
      throw new Error(`First-human-operator deploy packet index ${label} must keep final No-Go visible and deploy actions unavailable.`);
    }
    if (index.readyLocalArtifactCount < 1 || index.unavailableExternalFactCount < 1) {
      throw new Error(`First-human-operator deploy packet index ${label} must separate ready local artifacts from unavailable external facts.`);
    }
    for (const [rowIndex, row] of index.rows.entries()) {
      if (!/cannot create deploy actions/i.test(String(row.gate || ""))) {
        throw new Error(`First-human-operator deploy packet index ${label} row ${rowIndex} must stay a non-deploy gate.`);
      }
      if (!Array.isArray(row.readyLocalArtifacts) || !row.readyLocalArtifacts.length) {
        throw new Error(`First-human-operator deploy packet index ${label} row ${rowIndex} must expose ready local artifacts.`);
      }
      if (!Array.isArray(row.unavailableExternalFacts) || !row.unavailableExternalFacts.length) {
        throw new Error(`First-human-operator deploy packet index ${label} row ${rowIndex} must expose unavailable external facts.`);
      }
    }
    const adminSerialized = JSON.stringify(index);
    for (const token of [
      "credential",
      "production URL",
      "deploy trigger",
      "dashboard link",
      "contact detail",
      "rollback authorization",
      "public launch authorization",
      "deploy actions",
    ]) {
      if (!adminSerialized.toLowerCase().includes(token.toLowerCase())) {
        throw new Error(`First-human-operator deploy packet index ${label} missing guardrail text: ${token}`);
      }
    }
    for (const forbidden of [/https?:\/\//i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /token\s*[:=]/i, /bearer\s+[a-z0-9]/i, /dashboard\s+link\s*[:=]/i, /contact\s+detail\s*[:=]/i]) {
      if (forbidden.test(adminSerialized)) {
        throw new Error(`First-human-operator deploy packet index ${label} leaked URL, secret, token, bearer, dashboard-link, or contact-detail value marker.`);
      }
    }
    return;
  }
  if (index.state !== "index-only-do-not-deploy" || index.decision !== "No-Go / Do Not Deploy") {
    throw new Error(`First-human-operator deploy packet index ${label} must stay index-only Do Not Deploy.`);
  }
  if (index.notADeployChecklist !== true || index.checklistComplete !== false) {
    throw new Error(`First-human-operator deploy packet index ${label} must not become a deploy checklist.`);
  }
  if (Array.isArray(index.externalValueRequests) && index.externalValueRequests.length) {
    throw new Error(`First-human-operator deploy packet index ${label} requested external values.`);
  }

  const packetKeys = (index.indexedPackets || []).map((packet) => String(packet.key || "").toLowerCase());
  for (const key of ["admin-data", "product-readiness", "static-rehearsal-output"]) {
    if (!packetKeys.includes(key)) {
      throw new Error(`First-human-operator deploy packet index ${label} missing indexed packet: ${key}`);
    }
  }
  for (const packet of index.indexedPackets || []) {
    if (packet.externalValuesRequired !== false || packet.checklistItem !== false) {
      throw new Error(`First-human-operator deploy packet index ${label} packet ${packet.key || "unknown"} became an external-value checklist item.`);
    }
  }

  const unavailableLabels = (index.unavailableExternalValues || []).map((item) => String(item.label || "").toLowerCase()).join("\n");
  for (const token of [
    "credential request",
    "production url",
    "deploy trigger",
    "dashboard link",
    "contact detail",
    "rollback authorization",
    "public launch authorization",
    "deploy action",
  ]) {
    if (!unavailableLabels.includes(token)) {
      throw new Error(`First-human-operator deploy packet index ${label} missing guardrail item: ${token}`);
    }
  }

  const guardrails = index.noSecretNoDeployGuardrails || {};
  const forbiddenTrueFields = [
    "credentialRequestAllowed",
    "productionUrlStored",
    "deployTriggerStored",
    "dashboardLinkStored",
    "contactDetailStored",
    "rollbackAuthorized",
    "publicLaunchAuthorized",
    "deployActionRequested",
    "finalDecisionChangeAllowed",
  ].filter((key) => guardrails[key]);
  if (forbiddenTrueFields.length) {
    throw new Error(`First-human-operator deploy packet index ${label} unlocked forbidden fields: ${forbiddenTrueFields.join(", ")}`);
  }
  if (guardrails.productionDeploymentState !== "Do Not Deploy") {
    throw new Error(`First-human-operator deploy packet index ${label} changed production deployment state.`);
  }

  const serialized = JSON.stringify(index);
  for (const forbidden of [/https?:\/\//i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /token\s*[:=]/i, /bearer\s+[a-z0-9]/i, /dashboard\s+link\s*[:=]/i, /contact\s+detail\s*[:=]/i]) {
    if (forbidden.test(serialized)) {
      throw new Error(`First-human-operator deploy packet index ${label} leaked URL, secret, token, bearer, dashboard-link, or contact-detail value marker.`);
    }
  }
  if (!String(index.evidenceNote || "").includes("not a deploy checklist")) {
    throw new Error(`First-human-operator deploy packet index ${label} must explain it is not a deploy checklist.`);
  }
}

function operatorDryRunReviewChecklistFixture(overrides = {}) {
  return {
    format: "proofresume-operator-dry-run-review-checklist-v1",
    state: "review-only-do-not-deploy",
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
        reviewState: "local-static-evidence-reviewable",
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
    ...overrides,
  };
}

function assertOperatorDryRunReviewChecklistContract(checklist, label) {
  if (!checklist || typeof checklist !== "object") {
    throw new Error(`Missing operator dry-run review checklist contract for ${label}`);
  }
  if (checklist.format !== "proofresume-operator-dry-run-review-checklist-v1") {
    throw new Error(`Operator dry-run review checklist ${label} has unexpected format.`);
  }
  if (checklist.state !== "review-only-do-not-deploy" || checklist.decision !== "No-Go / Do Not Deploy") {
    throw new Error(`Operator dry-run review checklist ${label} must stay review-only Do Not Deploy.`);
  }
  if (checklist.dryRunOnly !== true || checklist.reviewOnly !== true || checklist.notExecutableDeploySequence !== true) {
    throw new Error(`Operator dry-run review checklist ${label} must stay dry-run, review-only, and non-executable.`);
  }
  if ((checklist.executableSteps || []).length || (checklist.deploySequence || []).length) {
    throw new Error(`Operator dry-run review checklist ${label} exposed executable deploy steps.`);
  }

  const evidenceKeys = (checklist.reviewedEvidence || []).map((item) => String(item.key || "").toLowerCase());
  for (const key of ["admin-data", "product-readiness", "static-rehearsal-output"]) {
    if (!evidenceKeys.includes(key)) {
      throw new Error(`Operator dry-run review checklist ${label} missing reviewed evidence: ${key}`);
    }
  }
  for (const item of checklist.reviewedEvidence || []) {
    if (item.executable !== false || item.deployAction !== false) {
      throw new Error(`Operator dry-run review checklist ${label} evidence ${item.key || "unknown"} became executable.`);
    }
  }

  const forbiddenLabels = (checklist.forbiddenExecutableItems || []).map((item) => String(item.label || "").toLowerCase()).join("\n");
  for (const token of [
    "credential request",
    "production url",
    "deploy trigger",
    "dashboard action",
    "dns step",
    "rollback authorization",
    "public launch authorization",
    "deploy action",
  ]) {
    if (!forbiddenLabels.includes(token)) {
      throw new Error(`Operator dry-run review checklist ${label} missing forbidden executable item: ${token}`);
    }
  }
  if (!(checklist.forbiddenExecutableItems || []).every((item) => /absent/i.test(String(item.state || "")))) {
    throw new Error(`Operator dry-run review checklist ${label} must keep every forbidden item absent from executable sequence.`);
  }

  const guardrails = checklist.noSecretNoDeployGuardrails || {};
  const forbiddenTrueFields = [
    "credentialRequestAllowed",
    "productionUrlStored",
    "deployTriggerStored",
    "dashboardActionAvailable",
    "dnsStepAvailable",
    "rollbackAuthorized",
    "publicLaunchAuthorized",
    "deployActionRequested",
  ].filter((key) => guardrails[key]);
  if (forbiddenTrueFields.length) {
    throw new Error(`Operator dry-run review checklist ${label} unlocked forbidden fields: ${forbiddenTrueFields.join(", ")}`);
  }
  if (guardrails.productionDeploymentState !== "Do Not Deploy") {
    throw new Error(`Operator dry-run review checklist ${label} changed production deployment state.`);
  }

  const serialized = JSON.stringify(checklist);
  for (const forbidden of [/https?:\/\//i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /token\s*[:=]/i, /bearer\s+[a-z0-9]/i, /dashboard\s+action\s*[:=]/i, /dns\s+step\s*[:=]/i]) {
    if (forbidden.test(serialized)) {
      throw new Error(`Operator dry-run review checklist ${label} leaked URL, secret, token, bearer, dashboard-action, or DNS-step value marker.`);
    }
  }
  if (!String(checklist.evidenceNote || "").includes("not an executable deploy sequence")) {
    throw new Error(`Operator dry-run review checklist ${label} must explain it is not an executable deploy sequence.`);
  }
}

function firstHumanPacketColdStartArchiveFixture(overrides = {}) {
  return {
    format: "proofresume-first-human-packet-cold-start-archive-v1",
    state: "archive-only-do-not-deploy",
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
        archiveState: "index-only-do-not-deploy",
        operationalAction: false,
      },
      {
        key: "operator-dry-run-checklist",
        label: "Operator dry-run checklist archive source",
        source: "ops/deploy/private-operator-dry-run-review-checklist.md",
        archiveState: "review-only-do-not-deploy",
        operationalAction: false,
      },
      {
        key: "static-rehearsal-output",
        label: "Static rehearsal output archive source",
        source: "ops/reports/static-deploy-rehearsal/latest.json",
        archiveState: "local-static-evidence-archived",
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
    ...overrides,
  };
}

function assertFirstHumanPacketColdStartArchiveContract(archive, label) {
  if (!archive || typeof archive !== "object") {
    throw new Error(`Missing first-human packet cold-start archive contract for ${label}`);
  }
  if (archive.format !== "proofresume-first-human-packet-cold-start-archive-v1") {
    throw new Error(`First-human packet cold-start archive ${label} has unexpected format.`);
  }
  if (archive.state !== "archive-only-do-not-deploy" || archive.decision !== "No-Go / Do Not Deploy") {
    throw new Error(`First-human packet cold-start archive ${label} must stay archive-only Do Not Deploy.`);
  }
  if (archive.archiveOnly !== true || archive.nonOperational !== true || archive.notExecutableSequence !== true) {
    throw new Error(`First-human packet cold-start archive ${label} must stay archive-only, non-operational, and non-executable.`);
  }
  if ((archive.executableSteps || []).length || (archive.deploySequence || []).length) {
    throw new Error(`First-human packet cold-start archive ${label} exposed executable steps.`);
  }

  const sourceKeys = (archive.sourceArtifacts || []).map((item) => String(item.key || "").toLowerCase());
  for (const key of ["first-human-packet-index", "operator-dry-run-checklist", "static-rehearsal-output"]) {
    if (!sourceKeys.includes(key)) {
      throw new Error(`First-human packet cold-start archive ${label} missing source artifact: ${key}`);
    }
  }
  for (const item of archive.sourceArtifacts || []) {
    if (item.operationalAction !== false) {
      throw new Error(`First-human packet cold-start archive ${label} source ${item.key || "unknown"} became operational.`);
    }
  }

  const continuationFacts = (archive.continuationFacts || []).map((item) => `${item.label || ""}: ${item.state || ""}`.toLowerCase()).join("\n");
  for (const token of [
    "public deploy authorization",
    "public launch authorization",
    "production url",
    "deploy trigger",
    "selected deploy platform",
    "credential availability outside repo",
    "rollback readiness",
    "production health readiness",
    "demand",
    "testimonials",
    "pricing",
    "willingness-to-pay",
    "secure-intake conclusions",
    "customer outcomes",
  ]) {
    if (!continuationFacts.includes(token) || !continuationFacts.includes("not observed")) {
      throw new Error(`First-human packet cold-start archive ${label} must keep ${token} Not observed.`);
    }
  }

  const forbiddenLabels = (archive.forbiddenOperationalItems || []).map((item) => `${item.label || ""}: ${item.state || ""}`.toLowerCase()).join("\n");
  for (const token of [
    "credential request",
    "secret storage",
    "production url",
    "deploy trigger",
    "dashboard action",
    "dns step",
    "rollback authorization",
    "public launch authorization",
    "deploy action",
    "executable sequence",
  ]) {
    if (!forbiddenLabels.includes(token)) {
      throw new Error(`First-human packet cold-start archive ${label} missing forbidden archive item: ${token}`);
    }
  }
  if (!(archive.forbiddenOperationalItems || []).every((item) => /absent/i.test(String(item.state || "")))) {
    throw new Error(`First-human packet cold-start archive ${label} must keep every forbidden item absent.`);
  }

  const guardrails = archive.noSecretNoDeployGuardrails || {};
  const forbiddenTrueFields = [
    "credentialRequestAllowed",
    "secretStorageAllowed",
    "productionUrlStored",
    "deployTriggerStored",
    "dashboardActionAvailable",
    "dnsStepAvailable",
    "rollbackAuthorized",
    "publicLaunchAuthorized",
    "deployActionRequested",
    "executableSequenceCreated",
  ].filter((key) => guardrails[key]);
  if (forbiddenTrueFields.length) {
    throw new Error(`First-human packet cold-start archive ${label} unlocked forbidden fields: ${forbiddenTrueFields.join(", ")}`);
  }
  if (guardrails.productionDeploymentState !== "Do Not Deploy") {
    throw new Error(`First-human packet cold-start archive ${label} changed production deployment state.`);
  }

  const serialized = JSON.stringify(archive);
  for (const forbidden of [/https?:\/\//i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /token\s*[:=]/i, /bearer\s+[a-z0-9]/i, /dashboard\s+action\s*[:=]/i, /dns\s+step\s*[:=]/i, /deploy\s+command\s*[:=]/i]) {
    if (forbidden.test(serialized)) {
      throw new Error(`First-human packet cold-start archive ${label} leaked URL, secret, token, bearer, dashboard-action, DNS-step, or deploy-command value marker.`);
    }
  }
  const note = String(archive.evidenceNote || "");
  for (const token of ["non-operational", "no-secret", "no-deploy", "no-public-launch", "cannot become an executable sequence"]) {
    if (!note.includes(token)) {
      throw new Error(`First-human packet cold-start archive ${label} missing evidence note token: ${token}`);
    }
  }
}

function releaseCandidateDeployContinuationMapFixture(overrides = {}) {
  return {
    format: "proofresume-release-candidate-deploy-continuation-map-v1",
    state: "blocked-continuation-do-not-deploy",
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
      { key: "admin-data", label: "Admin data visibility source", source: "website/admin-data.json", state: "local-admin-data-context-only", operationalAction: false },
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
        state: "local-static-evidence-only",
        operationalAction: false,
      },
      {
        key: "cold-start-archive",
        label: "Cold-start archive source",
        source: "ops/deploy/private-first-human-packet-handoff-archive-cold-start-brief.md",
        state: "archive-only-do-not-deploy",
        operationalAction: false,
      },
      {
        key: "first-human-packet-index",
        label: "First-human packet index source",
        source: "ops/deploy/private-first-human-operator-deploy-packet-index.md",
        state: "index-only-do-not-deploy",
        operationalAction: false,
      },
      {
        key: "operator-dry-run-checklist",
        label: "Operator dry-run checklist source",
        source: "ops/deploy/private-operator-dry-run-review-checklist.md",
        state: "review-only-do-not-deploy",
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
    ].map((label) => ({ label, state: "Not observed", canRequestFromMap: false })),
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
    ...overrides,
  };
}

function assertCredentialedDeployHumanApprovalToggleContract({ intakeHtml, reviewHtml, intakeJs, reviewJs }) {
  for (const [label, source] of [
    ["intake.html", intakeHtml],
    ["review.html", reviewHtml],
  ]) {
    if (!String(source || "").includes('data-pr="credentialedDeployHumanApprovalToggle"')) {
      throw new Error(`Missing credentialed deploy human approval toggle in ${label}.`);
    }
  }

  for (const [label, source] of [
    ["intake.js", intakeJs],
    ["review.js", reviewJs],
  ]) {
    const text = String(source || "");
    if (!text.includes("credentialedDeployHumanApprovalToggle")) {
      throw new Error(`Missing credentialedDeployHumanApprovalToggle wiring in ${label}.`);
    }
    if (text.includes("const explicitHumanApprovalObserved = false") || text.includes("const platformInputsEnabled = false")) {
      throw new Error(`Credentialed deploy human approval gate regressed to hardcoded false in ${label}.`);
    }
    if (!text.includes("explicitHumanApprovalObserved: approvalObserved")) {
      throw new Error(`Credentialed deploy human approval toggle is not persisted in ${label}.`);
    }
  }
}

function assertStructuredExtractionQaContract({ intakeHtml, reviewHtml, intakeJs, reviewJs, qaSource }) {
  requireAll(
    qaSource,
    [
      "runStructuredExtractionApprovalBoundaryScenario",
      "structured-extraction-approval-boundary-no-network",
      "storedStructuredExperienceItems",
      "readStructuredExtractionSurface",
      "assertStructuredItemPromotionSurface",
      "clickStructuredItemPromotionAction",
      "readBulkStructuredControlState",
      "clickBulkStructuredControl",
      "storedStructuredApprovalSummary",
      "readCandidateAcceptedActionState",
      "approveStructuredSourceLine",
      "approveGeneratedEvidenceLine",
      "Accepted but unapproved structured experience item",
      "Rejected structured experience item",
      "Unapproved structured source fact",
      "Generated structured candidate Accept button is disabled until backing evidence line approval.",
      "Backing pasted evidence line approval changes generated candidate Accept from disabled to eligible",
      "Generated structured candidate still uses Accept after evidence approval.",
      "Bulk approve/promote never auto-exports a structured item before candidate Accept.",
      "Bulk approved/promoted structured state persists after reload.",
      "Candidate Accept is still required and available after bulk approve/promote reload persistence.",
      "Follow-up evidence uses Accept for the candidate bullet decision.",
      "before explicit evidence approval",
      "does not invent unsupported claim text",
    ],
    "structured extraction QA regression wiring"
  );

  const productSource = `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.toLowerCase();
  const exposesStructuredExtraction =
    productSource.includes("structuredextraction") ||
    productSource.includes("structured-extraction") ||
    productSource.includes("structuredexperience") ||
    productSource.includes("structured-experience") ||
    productSource.includes("experienceitems") ||
    productSource.includes("parsedexperienceitems") ||
    productSource.includes("data-experience-item") ||
    productSource.includes("data-source-lines");

  if (exposesStructuredExtraction) {
    requireAny(
      productSource,
      ["source lines", "sourcelines", "source-line", "data-source-lines", "provenance", "source excerpt"],
      "structured extraction provenance/source-line contract"
    );
    requireAny(
      productSource,
      ["unapproved", "approvalstate", "approval-state", "evidencestatus", "evidence-status"],
      "structured extraction Unapproved default contract"
    );
    if (!qaSource.includes("Pre-approval export and download text do not contain invented claims.")) {
      throw new Error("Structured extraction QA must lock invented-claim exclusion from pre-approval export/download text.");
    }
    if (
      !qaSource.includes("Rejected structured experience item stays out of saved snapshot after approval.") ||
      !qaSource.includes("Structured-item promotion action handles pending product exposure") ||
      !qaSource.includes("Structured-item promotion approve handle works only after backing evidence-line approval") ||
      !qaSource.includes("Bulk-promoted but candidate-unaccepted structured item")
    ) {
      throw new Error("Structured extraction QA must lock rejected/unapproved structured facts out of export, download, and snapshot surfaces.");
    }
    requireAny(productSource, ["approve the source line first", "source line approved"], "generated candidate backing evidence approval gate copy");
    requireAny(
      productSource,
      ["approve the supporting evidence first", "followupevidence:", "followupcandidate:"],
      "follow-up evidence approval gate + candidate key contract"
    );
  }
}

function assertReleaseCandidateDeployContinuationMapContract(map, label) {
  if (!map || typeof map !== "object") {
    throw new Error(`Missing release-candidate deploy-continuation map contract for ${label}`);
  }
  if (map.format !== "proofresume-release-candidate-deploy-continuation-map-v1") {
    throw new Error(`Release-candidate deploy-continuation map ${label} has unexpected format.`);
  }
  if (map.state !== "blocked-continuation-do-not-deploy" || map.decision !== "No-Go / Do Not Deploy") {
    throw new Error(`Release-candidate deploy-continuation map ${label} must stay blocked No-Go / Do Not Deploy.`);
  }
  if (map.blocked !== true || map.localOnly !== true || map.private !== true || map.readOnly !== true) {
    throw new Error(`Release-candidate deploy-continuation map ${label} must stay private, local-only, read-only, and blocked.`);
  }
  if (map.notDeployPlan !== true || map.notLaunchPlan !== true || map.notRollbackPlan !== true || map.notExecutableSequence !== true) {
    throw new Error(`Release-candidate deploy-continuation map ${label} became operational planning material.`);
  }
  if (map.cannotRequestPlatformInputs !== true || (map.executableSteps || []).length || (map.deploySequence || []).length) {
    throw new Error(`Release-candidate deploy-continuation map ${label} can request platform inputs or exposed executable steps.`);
  }

  const sourceKeys = (map.sourceArtifacts || []).map((item) => String(item.key || "").toLowerCase());
  for (const key of ["admin-data", "product-readiness", "static-rehearsal-output", "cold-start-archive"]) {
    if (!sourceKeys.includes(key)) {
      throw new Error(`Release-candidate deploy-continuation map ${label} missing source artifact: ${key}`);
    }
  }
  if (!(map.sourceArtifacts || []).every((item) => item.operationalAction === false)) {
    throw new Error(`Release-candidate deploy-continuation map ${label} source artifacts must be context only.`);
  }

  const externalInputs = (map.externalPlatformInputs || []).map((item) => `${item.label || ""}: ${item.state || ""}: ${item.canRequestFromMap}`).join("\n").toLowerCase();
  for (const token of [
    "explicit future human approval",
    "selected platform",
    "credential availability outside repo",
    "production url / production origin",
    "deploy trigger",
    "rollback owner",
    "rollback method",
    "post-deploy health-check",
    "public launch authorization",
  ]) {
    if (!externalInputs.includes(token) || !externalInputs.includes("not observed") || externalInputs.includes(`${token}: not observed: true`)) {
      throw new Error(`Release-candidate deploy-continuation map ${label} must keep ${token} Not observed and non-requestable.`);
    }
  }

  const gates = (map.blockedContinuationGates || []).map((item) => `${item.label || ""}: ${item.state || ""}: ${item.response || ""}`.toLowerCase()).join("\n");
  for (const token of ["platform-specific deploy prep", "production readiness", "requests for values", "executable deploy sequence", "public launch approval", "rollback authorization"]) {
    if (!gates.includes(token) || !gates.includes("blocked")) {
      throw new Error(`Release-candidate deploy-continuation map ${label} missing blocked gate: ${token}`);
    }
  }

  const forbiddenLabels = (map.forbiddenOperationalItems || []).map((item) => `${item.label || ""}: ${item.state || ""}`.toLowerCase()).join("\n");
  for (const token of [
    "credential request",
    "secret storage",
    "platform input request",
    "production url",
    "deploy trigger",
    "dashboard action",
    "dns step",
    "rollback authorization",
    "public launch authorization",
    "deploy action",
    "executable sequence",
  ]) {
    if (!forbiddenLabels.includes(token)) {
      throw new Error(`Release-candidate deploy-continuation map ${label} missing forbidden item: ${token}`);
    }
  }
  if (!(map.forbiddenOperationalItems || []).every((item) => /absent/i.test(String(item.state || "")))) {
    throw new Error(`Release-candidate deploy-continuation map ${label} must keep every forbidden operational item absent.`);
  }

  const guardrails = map.noSecretNoDeployGuardrails || {};
  const forbiddenTrueFields = [
    "credentialRequestAllowed",
    "secretStorageAllowed",
    "platformInputRequestAllowed",
    "productionUrlStored",
    "deployTriggerStored",
    "dashboardActionAvailable",
    "dnsStepAvailable",
    "rollbackAuthorized",
    "publicLaunchAuthorized",
    "deployActionRequested",
    "executableSequenceCreated",
  ].filter((key) => guardrails[key]);
  if (forbiddenTrueFields.length) {
    throw new Error(`Release-candidate deploy-continuation map ${label} unlocked forbidden fields: ${forbiddenTrueFields.join(", ")}`);
  }
  if (guardrails.productionDeploymentState !== "Do Not Deploy" || map.productionDeploymentState !== "Do Not Deploy") {
    throw new Error(`Release-candidate deploy-continuation map ${label} changed production deployment state.`);
  }

  const labels = (map.safeNextStateLabels || []).join("\n").toLowerCase();
  for (const token of ["no-go / do not deploy", "do not publish", "blocked: selected platform not observed", "not observed"]) {
    if (!labels.includes(token)) {
      throw new Error(`Release-candidate deploy-continuation map ${label} missing safe label: ${token}`);
    }
  }
  for (const forbidden of [/https?:\/\//i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /token\s*[:=]/i, /bearer\s+[a-z0-9]/i, /dashboard\s+action\s*[:=]/i, /dns\s+step\s*[:=]/i, /deploy\s+command\s*[:=]/i]) {
    if (forbidden.test(JSON.stringify(map))) {
      throw new Error(`Release-candidate deploy-continuation map ${label} leaked URL, secret, token, bearer, dashboard-action, DNS-step, or deploy-command value marker.`);
    }
  }
  const note = String(map.evidenceNote || "");
  for (const token of ["no-secret", "no-deploy", "no-public-launch", "cannot request platform inputs", "cannot become an executable sequence"]) {
    if (!note.includes(token)) {
      throw new Error(`Release-candidate deploy-continuation map ${label} missing evidence note token: ${token}`);
    }
  }
}

function privateExternalInputBoundaryLedgerFixture(overrides = {}) {
  return {
    format: "proofresume-private-external-input-boundary-ledger-v1",
    state: "private-ledger-do-not-deploy",
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
      finalLedgerDecision: "No-Go / Do Not Deploy",
      continuationMapState: "blocked-continuation-do-not-deploy",
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
    ...overrides,
  };
}

function assertPrivateExternalInputBoundaryLedgerContract(ledger, label) {
  if (!ledger || typeof ledger !== "object") {
    throw new Error(`Missing private external-input boundary ledger contract for ${label}`);
  }
  if (ledger.format !== "proofresume-private-external-input-boundary-ledger-v1") {
    throw new Error(`Private external-input boundary ledger ${label} has unexpected format.`);
  }
  if (ledger.state !== "private-ledger-do-not-deploy" || ledger.decision !== "No-Go / Do Not Deploy") {
    throw new Error(`Private external-input boundary ledger ${label} must stay No-Go / Do Not Deploy.`);
  }
  if (ledger.productionDeploymentState !== "Do Not Deploy" || ledger.private !== true || ledger.localOnly !== true || ledger.readOnly !== true) {
    throw new Error(`Private external-input boundary ledger ${label} must stay private, local-only, read-only, and Do Not Deploy.`);
  }
  if (
    ledger.outsideRepoAuthority !== true ||
    ledger.notDeployPlan !== true ||
    ledger.notLaunchPlan !== true ||
    ledger.notRollbackPlan !== true ||
    ledger.notExecutableSequence !== true ||
    (ledger.executableSteps || []).length ||
    (ledger.deploySequence || []).length
  ) {
    throw new Error(`Private external-input boundary ledger ${label} became operational or executable.`);
  }

  const sourceKeys = (ledger.authoritySources || []).map((item) => String(item.key || "").toLowerCase());
  for (const key of ["admin-data", "product-readiness", "static-rehearsal-output", "external-input-ledger"]) {
    if (!sourceKeys.includes(key)) {
      throw new Error(`Private external-input boundary ledger ${label} missing authority source: ${key}`);
    }
  }
  if (!(ledger.authoritySources || []).every((item) => item.canAuthorize === false)) {
    throw new Error(`Private external-input boundary ledger ${label} allowed a local source to authorize deploy.`);
  }

  const factText = (ledger.externalFacts || [])
    .map((item) => `${item.label || ""}: ${item.state || ""}: ${item.repoAuthority || ""}: ${item.canRequestFromRepo}: ${item.canInferFromLocalEvidence}`)
    .join("\n")
    .toLowerCase();
  for (const token of [
    "explicit future human approval",
    "selected platform",
    "credential availability outside repo",
    "production url / production origin",
    "deploy trigger",
    "rollback owner",
    "rollback method",
    "post-deploy health-check",
    "public launch authorization",
    "demand evidence",
    "testimonials",
    "pricing decisions",
    "willingness-to-pay evidence",
    "secure-intake conclusions",
    "customer outcomes / proof claims",
  ]) {
    if (!factText.includes(token) || !factText.includes("not observed") || !factText.includes("outside repo authority")) {
      throw new Error(`Private external-input boundary ledger ${label} must keep ${token} Not observed and outside repo authority.`);
    }
  }
  if ((ledger.externalFacts || []).some((item) => item.state !== "Not observed" || item.repoAuthority !== "Outside repo authority" || item.canRequestFromRepo !== false || item.canInferFromLocalEvidence !== false)) {
    throw new Error(`Private external-input boundary ledger ${label} must keep every external fact non-requestable and non-inferable.`);
  }

  const forbiddenLabels = (ledger.forbiddenOperationalItems || []).map((item) => `${item.label || ""}: ${item.state || ""}`.toLowerCase()).join("\n");
  for (const token of ["credential request", "secret storage", "platform input request", "production url", "deploy trigger", "dashboard action", "dns step", "rollback authorization", "public launch authorization", "deploy action", "executable sequence"]) {
    if (!forbiddenLabels.includes(token)) {
      throw new Error(`Private external-input boundary ledger ${label} missing forbidden item: ${token}`);
    }
  }
  if (!(ledger.forbiddenOperationalItems || []).every((item) => /absent/i.test(String(item.state || "")))) {
    throw new Error(`Private external-input boundary ledger ${label} must keep every forbidden operational item absent.`);
  }

  const guardrails = ledger.noSecretNoDeployGuardrails || {};
  const forbiddenTrueFields = [
    "credentialRequestAllowed",
    "secretStorageAllowed",
    "platformInputRequestAllowed",
    "productionUrlStored",
    "deployTriggerStored",
    "dashboardActionAvailable",
    "dnsStepAvailable",
    "rollbackAuthorized",
    "publicLaunchAuthorized",
    "deployActionRequested",
    "executableSequenceCreated",
    "finalDecisionChangeAllowed",
  ].filter((key) => guardrails[key]);
  if (forbiddenTrueFields.length) {
    throw new Error(`Private external-input boundary ledger ${label} unlocked forbidden fields: ${forbiddenTrueFields.join(", ")}`);
  }
  if (guardrails.productionDeploymentState !== "Do Not Deploy") {
    throw new Error(`Private external-input boundary ledger ${label} changed production deployment state.`);
  }
  const crossArtifact = ledger.crossArtifactEvidence || {};
  if (
    crossArtifact.adminDataExternalInputsPresent !== false ||
    crossArtifact.productReadinessExternalInputsPresent !== false ||
    crossArtifact.staticOutputExternalInputsPresent !== false
  ) {
    throw new Error(`Private external-input boundary ledger ${label} marked external inputs present from local artifacts.`);
  }
  const allowed = (ledger.allowedLabels || []).join("\n").toLowerCase();
  for (const token of ["no-go / do not deploy", "do not publish", "outside repo authority", "local evidence only", "not observed"]) {
    if (!allowed.includes(token)) {
      throw new Error(`Private external-input boundary ledger ${label} missing allowed label: ${token}`);
    }
  }
  for (const forbidden of [/https?:\/\//i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /token\s*[:=]/i, /bearer\s+[a-z0-9]/i, /dashboard\s+action\s*[:=]/i, /dns\s+step\s*[:=]/i, /deploy\s+command\s*[:=]/i]) {
    if (forbidden.test(JSON.stringify(ledger))) {
      throw new Error(`Private external-input boundary ledger ${label} leaked URL, secret, token, bearer, dashboard-action, DNS-step, or deploy-command value marker.`);
    }
  }
  const note = String(ledger.evidenceNote || "");
  for (const token of ["Not observed", "outside repo authority", "non-requestable", "no-secret", "no-deploy", "non-executable"]) {
    if (!note.includes(token)) {
      throw new Error(`Private external-input boundary ledger ${label} missing evidence note token: ${token}`);
    }
  }
}

function platformOwnerNonRequestTransferNoteFixture(overrides = {}) {
  return {
    format: "proofresume-platform-owner-non-request-transfer-note-v1",
    state: "private-transfer-note-do-not-deploy",
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
      finalLedgerDecision: "No-Go / Do Not Deploy",
      boundaryLedgerState: "private-ledger-do-not-deploy",
      adminDataExternalInputsPresent: false,
      productReadinessExternalInputsPresent: false,
      staticOutputExternalInputsPresent: false,
    },
    evidenceNote:
      "Private platform-owner non-request transfer note preserves blocked status only. Every transfer fact remains Not observed, outside repo authority, non-request, no-secret, no-deploy, and non-executable.",
    ...overrides,
  };
}

function assertPlatformOwnerNonRequestTransferNoteContract(note, label) {
  if (!note || typeof note !== "object") {
    throw new Error(`Missing platform-owner non-request transfer note contract for ${label}`);
  }
  if (note.format !== "proofresume-platform-owner-non-request-transfer-note-v1") {
    throw new Error(`Platform-owner non-request transfer note ${label} has unexpected format.`);
  }
  if (note.state !== "private-transfer-note-do-not-deploy" || note.decision !== "No-Go / Do Not Deploy") {
    throw new Error(`Platform-owner non-request transfer note ${label} must stay No-Go / Do Not Deploy.`);
  }
  if (
    note.productionDeploymentState !== "Do Not Deploy" ||
    note.private !== true ||
    note.localOnly !== true ||
    note.readOnly !== true ||
    note.nonRequest !== true ||
    note.outsideRepoAuthority !== true
  ) {
    throw new Error(`Platform-owner non-request transfer note ${label} must stay private, local-only, read-only, non-request, outside repo authority, and Do Not Deploy.`);
  }
  if (
    note.notDeployPlan !== true ||
    note.notPlatformSetupPlan !== true ||
    note.notCredentialRequest !== true ||
    note.notLaunchPlan !== true ||
    note.notRollbackPlan !== true ||
    note.notExecutableSequence !== true ||
    (note.executableSteps || []).length ||
    (note.deploySequence || []).length
  ) {
    throw new Error(`Platform-owner non-request transfer note ${label} became operational or executable.`);
  }
  if (
    note.sourceConsumed?.path !== "ops/deploy/private-external-input-boundary-ledger.md" ||
    note.sourceConsumed?.canRequestValues !== false ||
    note.sourceConsumed?.canAuthorizeDeploy !== false
  ) {
    throw new Error(`Platform-owner non-request transfer note ${label} must consume only the boundary ledger without requesting values or authorizing deploy.`);
  }
  const scopeKeys = (note.transferScope || []).map((item) => String(item.key || "").toLowerCase());
  for (const key of ["admin-data", "product-readiness", "static-rehearsal-output", "transfer-note"]) {
    if (!scopeKeys.includes(key)) {
      throw new Error(`Platform-owner non-request transfer note ${label} missing transfer scope: ${key}`);
    }
  }
  if (!(note.transferScope || []).every((item) => item.canAuthorize === false && item.canRequestValues === false)) {
    throw new Error(`Platform-owner non-request transfer note ${label} allowed scope to authorize or request values.`);
  }
  const factText = (note.transferFacts || [])
    .map((item) => `${item.label || ""}: ${item.state || ""}: ${item.repoAuthority || ""}: ${item.canRequestFromRepo}: ${item.canInferFromLocalEvidence}: ${item.transferWordingAllowed || ""}`)
    .join("\n")
    .toLowerCase();
  for (const token of [
    "explicit future human approval",
    "selected platform",
    "credential availability outside repo",
    "production url / production origin",
    "deploy trigger",
    "rollback owner",
    "rollback method",
    "post-deploy health-check",
    "public launch authorization",
    "demand evidence",
    "testimonials",
    "pricing decisions",
    "willingness-to-pay evidence",
    "secure-intake conclusions",
    "customer outcomes / proof claims",
  ]) {
    if (!factText.includes(token) || !factText.includes("not observed") || !factText.includes("outside repo authority") || !factText.includes("preserve blocked state only")) {
      throw new Error(`Platform-owner non-request transfer note ${label} must keep ${token} Not observed, outside repo authority, and preservation-only.`);
    }
  }
  if ((note.transferFacts || []).some((item) => item.state !== "Not observed" || item.repoAuthority !== "Outside repo authority" || item.canRequestFromRepo !== false || item.canInferFromLocalEvidence !== false)) {
    throw new Error(`Platform-owner non-request transfer note ${label} must keep every transfer fact non-requestable and non-inferable.`);
  }
  const forbiddenLabels = (note.forbiddenOperationalItems || []).map((item) => `${item.label || ""}: ${item.state || ""}`.toLowerCase()).join("\n");
  for (const token of ["credential request", "secret storage", "platform input request", "production url", "deploy trigger", "dashboard action", "dns step", "rollback authorization", "public launch authorization", "deploy action", "executable sequence"]) {
    if (!forbiddenLabels.includes(token)) {
      throw new Error(`Platform-owner non-request transfer note ${label} missing forbidden item: ${token}`);
    }
  }
  if (!(note.forbiddenOperationalItems || []).every((item) => /absent/i.test(String(item.state || "")))) {
    throw new Error(`Platform-owner non-request transfer note ${label} must keep every forbidden operational item absent.`);
  }
  const summary = note.transferSummary || {};
  for (const key of [
    "externalDeployFactsRequested",
    "credentialsRequestedOrStored",
    "platformValuesRequestedOrStored",
    "productionUrlRequestedOrStored",
    "deployTriggerRequestedOrStored",
    "rollbackDetailsRequestedOrStored",
    "executableDeploySequenceCreated",
    "publicDeployAuthorized",
    "publicLaunchAuthorized",
    "rollbackAuthorized",
  ]) {
    if (summary[key] !== "No") {
      throw new Error(`Platform-owner non-request transfer note ${label} changed ${key} from No.`);
    }
  }
  const guardrails = note.noSecretNoDeployGuardrails || {};
  const forbiddenTrueFields = [
    "credentialRequestAllowed",
    "secretStorageAllowed",
    "platformInputRequestAllowed",
    "productionUrlStored",
    "deployTriggerStored",
    "dashboardActionAvailable",
    "dnsStepAvailable",
    "rollbackAuthorized",
    "publicLaunchAuthorized",
    "deployActionRequested",
    "executableSequenceCreated",
    "finalDecisionChangeAllowed",
  ].filter((key) => guardrails[key]);
  if (forbiddenTrueFields.length || guardrails.productionDeploymentState !== "Do Not Deploy") {
    throw new Error(`Platform-owner non-request transfer note ${label} unlocked forbidden guardrails: ${forbiddenTrueFields.join(", ")}`);
  }
  const crossArtifact = note.crossArtifactEvidence || {};
  if (
    crossArtifact.adminDataExternalInputsPresent !== false ||
    crossArtifact.productReadinessExternalInputsPresent !== false ||
    crossArtifact.staticOutputExternalInputsPresent !== false
  ) {
    throw new Error(`Platform-owner non-request transfer note ${label} marked external inputs present from local artifacts.`);
  }
  for (const forbidden of [/https?:\/\//i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /token\s*[:=]/i, /bearer\s+[a-z0-9]/i, /dashboard\s+action\s*[:=]/i, /dns\s+step\s*[:=]/i, /deploy\s+command\s*[:=]/i]) {
    if (forbidden.test(JSON.stringify(note))) {
      throw new Error(`Platform-owner non-request transfer note ${label} leaked URL, secret, token, bearer, dashboard-action, DNS-step, or deploy-command value marker.`);
    }
  }
  const evidenceNote = String(note.evidenceNote || "");
  for (const token of ["Not observed", "outside repo authority", "non-request", "no-secret", "no-deploy", "non-executable"]) {
    if (!evidenceNote.includes(token)) {
      throw new Error(`Platform-owner non-request transfer note ${label} missing evidence note token: ${token}`);
    }
  }
}

function operatorResumePacketGuardrailFixture(overrides = {}) {
  return {
    format: "proofresume-operator-resume-packet-guardrail-v1",
    state: "private-resume-guardrail-do-not-deploy",
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
      finalLedgerDecision: "No-Go / Do Not Deploy",
      transferNoteState: "private-transfer-note-do-not-deploy",
      adminDataExternalInputsPresent: false,
      productReadinessExternalInputsPresent: false,
      staticOutputExternalInputsPresent: false,
    },
    evidenceNote:
      "Private operator-resume packet guardrail is a stop-sign only. Every guardrail fact remains Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, and non-executable.",
    ...overrides,
  };
}

function assertOperatorResumePacketGuardrailContract(guardrail, label) {
  if (!guardrail || typeof guardrail !== "object") {
    throw new Error(`Missing operator-resume packet guardrail contract for ${label}`);
  }
  if (guardrail.format !== "proofresume-operator-resume-packet-guardrail-v1") {
    throw new Error(`Operator-resume packet guardrail ${label} has unexpected format.`);
  }
  if (guardrail.state !== "private-resume-guardrail-do-not-deploy" || guardrail.decision !== "No-Go / Do Not Deploy") {
    throw new Error(`Operator-resume packet guardrail ${label} must stay No-Go / Do Not Deploy.`);
  }
  if (
    guardrail.productionDeploymentState !== "Do Not Deploy" ||
    guardrail.private !== true ||
    guardrail.localOnly !== true ||
    guardrail.readOnly !== true ||
    guardrail.nonRequest !== true ||
    guardrail.outsideRepoAuthority !== true ||
    guardrail.notCredentialRequest !== true ||
    guardrail.notLaunchPlan !== true ||
    guardrail.notRollbackPlan !== true ||
    guardrail.notExecutableSequence !== true ||
    (guardrail.executableSteps || []).length ||
    (guardrail.deploySequence || []).length
  ) {
    throw new Error(`Operator-resume packet guardrail ${label} became requestable, deployable, launchable, rollback-capable, or executable.`);
  }
  if (
    guardrail.sourceConsumed?.path !== "ops/deploy/private-platform-owner-non-request-transfer-note.md" ||
    guardrail.sourceConsumed?.canRequestValues !== false ||
    guardrail.sourceConsumed?.canAuthorizeDeploy !== false ||
    guardrail.sourceConsumed?.canAuthorizeLaunch !== false ||
    guardrail.sourceConsumed?.canAuthorizeRollback !== false
  ) {
    throw new Error(`Operator-resume packet guardrail ${label} must consume only the transfer note without requesting values or authorizing deploy/launch/rollback.`);
  }
  const scopeKeys = (guardrail.guardrailScope || []).map((item) => String(item.key || "").toLowerCase());
  for (const key of ["admin-data", "product-readiness", "static-rehearsal-output", "operator-resume-guardrail"]) {
    if (!scopeKeys.includes(key)) {
      throw new Error(`Operator-resume packet guardrail ${label} missing scope: ${key}`);
    }
  }
  if (!(guardrail.guardrailScope || []).every((item) => item.canAuthorize === false && item.canRequestValues === false)) {
    throw new Error(`Operator-resume packet guardrail ${label} allowed scope to authorize or request values.`);
  }
  const factText = (guardrail.guardrailFacts || [])
    .map((item) => `${item.label || ""}: ${item.state || ""}: ${item.repoAuthority || ""}: ${item.canRequestFromRepo}: ${item.canInferFromLocalEvidence}: ${item.guardrailWordingAllowed || ""}`)
    .join("\n")
    .toLowerCase();
  for (const token of [
    "explicit future human approval",
    "selected platform",
    "credential availability outside repo",
    "production url / production origin",
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
  ]) {
    if (!factText.includes(token) || !factText.includes("not observed") || !factText.includes("outside repo authority") || !factText.includes("stop; preserve blocked state only")) {
      throw new Error(`Operator-resume packet guardrail ${label} must keep ${token} Not observed, outside repo authority, and stop-only.`);
    }
  }
  if ((guardrail.guardrailFacts || []).some((item) => item.state !== "Not observed" || item.repoAuthority !== "Outside repo authority" || item.canRequestFromRepo !== false || item.canInferFromLocalEvidence !== false)) {
    throw new Error(`Operator-resume packet guardrail ${label} must keep every guardrail fact non-requestable and non-inferable.`);
  }
  const forbiddenLabels = (guardrail.forbiddenOperationalItems || []).map((item) => `${item.label || ""}: ${item.state || ""}`.toLowerCase()).join("\n");
  for (const token of ["credential request", "secret storage", "platform value request", "production url", "deploy trigger", "dashboard action", "dns step", "rollback authorization", "public launch authorization", "public deploy authorization", "deploy action", "executable sequence"]) {
    if (!forbiddenLabels.includes(token)) {
      throw new Error(`Operator-resume packet guardrail ${label} missing forbidden item: ${token}`);
    }
  }
  if (!(guardrail.forbiddenOperationalItems || []).every((item) => /absent/i.test(String(item.state || "")))) {
    throw new Error(`Operator-resume packet guardrail ${label} must keep every forbidden operational item absent.`);
  }
  const summary = guardrail.guardrailSummary || {};
  for (const key of [
    "externalDeployFactsRequested",
    "credentialsRequestedOrStored",
    "platformValuesRequestedOrStored",
    "productionUrlRequestedOrStored",
    "deployTriggerRequestedOrStored",
    "rollbackDetailsRequestedOrStored",
    "executableDeploySequenceCreated",
    "publicDeployAuthorized",
    "publicLaunchAuthorized",
    "rollbackAuthorized",
  ]) {
    if (summary[key] !== "No") {
      throw new Error(`Operator-resume packet guardrail ${label} changed ${key} from No.`);
    }
  }
  const guardrails = guardrail.noSecretNoDeployGuardrails || {};
  const forbiddenTrueFields = [
    "credentialRequestAllowed",
    "secretStorageAllowed",
    "platformValueRequestAllowed",
    "platformInputRequestAllowed",
    "productionUrlStored",
    "deployTriggerStored",
    "dashboardActionAvailable",
    "dnsStepAvailable",
    "rollbackAuthorized",
    "publicDeployAuthorized",
    "publicLaunchAuthorized",
    "deployActionRequested",
    "executableSequenceCreated",
    "finalDecisionChangeAllowed",
  ].filter((key) => guardrails[key]);
  if (forbiddenTrueFields.length || guardrails.productionDeploymentState !== "Do Not Deploy") {
    throw new Error(`Operator-resume packet guardrail ${label} unlocked forbidden guardrails: ${forbiddenTrueFields.join(", ")}`);
  }
  const crossArtifact = guardrail.crossArtifactEvidence || {};
  if (
    crossArtifact.adminDataExternalInputsPresent !== false ||
    crossArtifact.productReadinessExternalInputsPresent !== false ||
    crossArtifact.staticOutputExternalInputsPresent !== false
  ) {
    throw new Error(`Operator-resume packet guardrail ${label} marked external inputs present from local artifacts.`);
  }
  for (const forbidden of [/https?:\/\//i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /token\s*[:=]/i, /bearer\s+[a-z0-9]/i, /dashboard\s+action\s*[:=]/i, /dns\s+step\s*[:=]/i, /deploy\s+command\s*[:=]/i]) {
    if (forbidden.test(JSON.stringify(guardrail))) {
      throw new Error(`Operator-resume packet guardrail ${label} leaked URL, secret, token, bearer, dashboard-action, DNS-step, or deploy-command value marker.`);
    }
  }
  const evidenceNote = String(guardrail.evidenceNote || "");
  for (const token of ["Not observed", "outside repo authority", "non-request", "no-secret", "no-deploy", "no-public-launch", "no-rollback", "non-executable"]) {
    if (!evidenceNote.includes(token)) {
      throw new Error(`Operator-resume packet guardrail ${label} missing evidence note token: ${token}`);
    }
  }
}

function blockedStateOperatorContinuationIndexFixture(overrides = {}) {
  return {
    format: "proofresume-blocked-state-operator-continuation-index-v1",
    state: "private-blocked-continuation-index-do-not-deploy",
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
      finalLedgerDecision: "No-Go / Do Not Deploy",
      operatorResumeGuardrailState: "private-resume-guardrail-do-not-deploy",
      adminDataExternalInputsPresent: false,
      productReadinessExternalInputsPresent: false,
      staticOutputExternalInputsPresent: false,
    },
    evidenceNote:
      "Private blocked-state operator continuation index is read-only context only. Every continuation fact remains Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, and non-executable.",
    ...overrides,
  };
}

function assertBlockedStateOperatorContinuationIndexContract(index, label) {
  if (!index || typeof index !== "object") {
    throw new Error(`Missing blocked-state operator continuation index contract for ${label}`);
  }
  if (index.format !== "proofresume-blocked-state-operator-continuation-index-v1") {
    throw new Error(`Blocked-state operator continuation index ${label} has unexpected format.`);
  }
  if (index.state !== "private-blocked-continuation-index-do-not-deploy" || index.decision !== "No-Go / Do Not Deploy") {
    throw new Error(`Blocked-state operator continuation index ${label} must stay No-Go / Do Not Deploy.`);
  }
  if (
    index.productionDeploymentState !== "Do Not Deploy" ||
    index.private !== true ||
    index.localOnly !== true ||
    index.readOnly !== true ||
    index.nonRequest !== true ||
    index.outsideRepoAuthority !== true ||
    index.notCredentialRequest !== true ||
    index.notLaunchPlan !== true ||
    index.notRollbackPlan !== true ||
    index.notExecutableSequence !== true ||
    (index.executableSteps || []).length ||
    (index.deploySequence || []).length
  ) {
    throw new Error(`Blocked-state operator continuation index ${label} became requestable, deployable, launchable, rollback-capable, or executable.`);
  }
  if (
    index.sourceConsumed?.path !== "ops/deploy/private-operator-resume-packet-guardrail.md" ||
    index.sourceConsumed?.canRequestValues !== false ||
    index.sourceConsumed?.canAuthorizeDeploy !== false ||
    index.sourceConsumed?.canAuthorizeLaunch !== false ||
    index.sourceConsumed?.canAuthorizeRollback !== false
  ) {
    throw new Error(`Blocked-state operator continuation index ${label} must consume only the operator-resume guardrail without requesting values or authorizing deploy/launch/rollback.`);
  }
  const scopeKeys = (index.continuationScope || []).map((item) => String(item.key || "").toLowerCase());
  for (const key of ["admin-data", "product-readiness", "static-rehearsal-output", "blocked-state-index"]) {
    if (!scopeKeys.includes(key)) {
      throw new Error(`Blocked-state operator continuation index ${label} missing scope: ${key}`);
    }
  }
  if (!(index.continuationScope || []).every((item) => item.canAuthorize === false && item.canRequestValues === false)) {
    throw new Error(`Blocked-state operator continuation index ${label} allowed scope to authorize or request values.`);
  }
  const factText = (index.continuationFacts || [])
    .map((item) => `${item.label || ""}: ${item.state || ""}: ${item.repoAuthority || ""}: ${item.canRequestFromRepo}: ${item.canInferFromLocalEvidence}: ${item.continuationWordingAllowed || ""}`)
    .join("\n")
    .toLowerCase();
  for (const token of [
    "explicit future human approval",
    "selected platform",
    "credential availability outside repo",
    "production url / production origin",
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
  ]) {
    if (!factText.includes(token) || !factText.includes("not observed") || !factText.includes("outside repo authority") || !factText.includes("read-only blocked-state label only")) {
      throw new Error(`Blocked-state operator continuation index ${label} must keep ${token} Not observed, outside repo authority, and read-only.`);
    }
  }
  if ((index.continuationFacts || []).some((item) => item.state !== "Not observed" || item.repoAuthority !== "Outside repo authority" || item.canRequestFromRepo !== false || item.canInferFromLocalEvidence !== false)) {
    throw new Error(`Blocked-state operator continuation index ${label} must keep every continuation fact non-requestable and non-inferable.`);
  }
  const forbiddenLabels = (index.forbiddenOperationalItems || []).map((item) => `${item.label || ""}: ${item.state || ""}`.toLowerCase()).join("\n");
  for (const token of ["credential request", "secret storage", "platform value request", "production url", "deploy trigger", "dashboard action", "dns step", "rollback authorization", "public launch authorization", "public deploy authorization", "deploy action", "executable sequence"]) {
    if (!forbiddenLabels.includes(token)) {
      throw new Error(`Blocked-state operator continuation index ${label} missing forbidden item: ${token}`);
    }
  }
  if (!(index.forbiddenOperationalItems || []).every((item) => /absent/i.test(String(item.state || "")))) {
    throw new Error(`Blocked-state operator continuation index ${label} must keep every forbidden operational item absent.`);
  }
  const summary = index.continuationSummary || {};
  for (const key of [
    "externalDeployFactsRequested",
    "credentialsRequestedOrStored",
    "platformValuesRequestedOrStored",
    "productionUrlRequestedOrStored",
    "deployTriggerRequestedOrStored",
    "rollbackDetailsRequestedOrStored",
    "executableDeploySequenceCreated",
    "publicDeployAuthorized",
    "publicLaunchAuthorized",
    "rollbackAuthorized",
  ]) {
    if (summary[key] !== "No") {
      throw new Error(`Blocked-state operator continuation index ${label} changed ${key} from No.`);
    }
  }
  const guardrails = index.noSecretNoDeployGuardrails || {};
  const forbiddenTrueFields = [
    "credentialRequestAllowed",
    "secretStorageAllowed",
    "platformValueRequestAllowed",
    "platformInputRequestAllowed",
    "productionUrlStored",
    "deployTriggerStored",
    "dashboardActionAvailable",
    "dnsStepAvailable",
    "rollbackAuthorized",
    "publicDeployAuthorized",
    "publicLaunchAuthorized",
    "deployActionRequested",
    "executableSequenceCreated",
    "finalDecisionChangeAllowed",
  ].filter((key) => guardrails[key]);
  if (forbiddenTrueFields.length || guardrails.productionDeploymentState !== "Do Not Deploy") {
    throw new Error(`Blocked-state operator continuation index ${label} unlocked forbidden guardrails: ${forbiddenTrueFields.join(", ")}`);
  }
  const crossArtifact = index.crossArtifactEvidence || {};
  if (
    crossArtifact.adminDataExternalInputsPresent !== false ||
    crossArtifact.productReadinessExternalInputsPresent !== false ||
    crossArtifact.staticOutputExternalInputsPresent !== false
  ) {
    throw new Error(`Blocked-state operator continuation index ${label} marked external inputs present from local artifacts.`);
  }
  for (const forbidden of [/https?:\/\//i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /token\s*[:=]/i, /bearer\s+[a-z0-9]/i, /dashboard\s+action\s*[:=]/i, /dns\s+step\s*[:=]/i, /deploy\s+command\s*[:=]/i]) {
    if (forbidden.test(JSON.stringify(index))) {
      throw new Error(`Blocked-state operator continuation index ${label} leaked URL, secret, token, bearer, dashboard-action, DNS-step, or deploy-command value marker.`);
    }
  }
  const evidenceNote = String(index.evidenceNote || "");
  for (const token of ["Not observed", "outside repo authority", "non-request", "no-secret", "no-deploy", "no-public-launch", "no-rollback", "non-executable"]) {
    if (!evidenceNote.includes(token)) {
      throw new Error(`Blocked-state operator continuation index ${label} missing evidence note token: ${token}`);
    }
  }
}

function autonomousDeployStopLedgerFixture(overrides = {}) {
  return {
    format: "proofresume-autonomous-deploy-stop-ledger-v1",
    state: "autonomous-stop-ledger-do-not-deploy",
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
      finalLedgerDecision: "No-Go / Do Not Deploy",
      blockedStateContinuationIndexState: "private-blocked-continuation-index-do-not-deploy",
      adminDataExternalInputsPresent: false,
      productReadinessExternalInputsPresent: false,
      staticOutputExternalInputsPresent: false,
    },
    evidenceNote:
      "Private autonomous deploy stop ledger is an autonomous stop only. Every stop fact remains private, read-only, Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, and non-executable.",
    ...overrides,
  };
}

function assertAutonomousDeployStopLedgerContract(ledger, label) {
  if (!ledger || typeof ledger !== "object") {
    throw new Error(`Missing autonomous deploy stop ledger contract for ${label}`);
  }
  if (ledger.format !== "proofresume-autonomous-deploy-stop-ledger-v1") {
    throw new Error(`Autonomous deploy stop ledger ${label} has unexpected format.`);
  }
  if (ledger.state !== "autonomous-stop-ledger-do-not-deploy" || ledger.decision !== "No-Go / Do Not Deploy") {
    throw new Error(`Autonomous deploy stop ledger ${label} must stay No-Go / Do Not Deploy.`);
  }
  if (
    ledger.productionDeploymentState !== "Do Not Deploy" ||
    ledger.private !== true ||
    ledger.localOnly !== true ||
    ledger.readOnly !== true ||
    ledger.autonomousStop !== true ||
    ledger.nonRequest !== true ||
    ledger.outsideRepoAuthority !== true ||
    ledger.notCredentialRequest !== true ||
    ledger.notLaunchPlan !== true ||
    ledger.notRollbackPlan !== true ||
    ledger.notExecutableSequence !== true ||
    (ledger.executableSteps || []).length ||
    (ledger.deploySequence || []).length
  ) {
    throw new Error(`Autonomous deploy stop ledger ${label} became requestable, deployable, launchable, rollback-capable, or executable.`);
  }
  if (
    ledger.sourceConsumed?.path !== "ops/deploy/private-blocked-state-operator-continuation-index.md" ||
    ledger.sourceConsumed?.canRequestValues !== false ||
    ledger.sourceConsumed?.canAuthorizeDeploy !== false ||
    ledger.sourceConsumed?.canAuthorizeLaunch !== false ||
    ledger.sourceConsumed?.canAuthorizeRollback !== false
  ) {
    throw new Error(`Autonomous deploy stop ledger ${label} must consume only the blocked-state continuation index without requesting values or authorizing deploy/launch/rollback.`);
  }
  const scopeKeys = (ledger.stopScope || []).map((item) => String(item.key || "").toLowerCase());
  for (const key of ["admin-data", "product-readiness", "static-rehearsal-output", "autonomous-stop-ledger"]) {
    if (!scopeKeys.includes(key)) {
      throw new Error(`Autonomous deploy stop ledger ${label} missing scope: ${key}`);
    }
  }
  if (!(ledger.stopScope || []).every((item) => item.canAuthorize === false && item.canRequestValues === false)) {
    throw new Error(`Autonomous deploy stop ledger ${label} allowed scope to authorize or request values.`);
  }
  const factText = (ledger.stopFacts || [])
    .map((item) => `${item.label || ""}: ${item.state || ""}: ${item.repoAuthority || ""}: ${item.canRequestFromRepo}: ${item.canInferFromLocalEvidence}: ${item.autonomousHandlingAllowed || ""}`)
    .join("\n")
    .toLowerCase();
  for (const token of [
    "explicit future human approval",
    "selected platform",
    "credential availability outside repo",
    "production url / production origin",
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
  ]) {
    if (!factText.includes(token) || !factText.includes("not observed") || !factText.includes("outside repo authority") || !factText.includes("stop; preserve private read-only context only")) {
      throw new Error(`Autonomous deploy stop ledger ${label} must keep ${token} Not observed, outside repo authority, and autonomous-stop only.`);
    }
  }
  if ((ledger.stopFacts || []).some((item) => item.state !== "Not observed" || item.repoAuthority !== "Outside repo authority" || item.canRequestFromRepo !== false || item.canInferFromLocalEvidence !== false)) {
    throw new Error(`Autonomous deploy stop ledger ${label} must keep every stop fact non-requestable and non-inferable.`);
  }
  const forbiddenLabels = (ledger.forbiddenOperationalItems || []).map((item) => `${item.label || ""}: ${item.state || ""}`.toLowerCase()).join("\n");
  for (const token of ["credential request", "secret storage", "platform value request", "production url", "deploy trigger", "dashboard action", "dns step", "rollback authorization", "public launch authorization", "public deploy authorization", "deploy action", "executable sequence"]) {
    if (!forbiddenLabels.includes(token)) {
      throw new Error(`Autonomous deploy stop ledger ${label} missing forbidden item: ${token}`);
    }
  }
  if (!(ledger.forbiddenOperationalItems || []).every((item) => /absent/i.test(String(item.state || "")))) {
    throw new Error(`Autonomous deploy stop ledger ${label} must keep every forbidden operational item absent.`);
  }
  if (!Object.values(ledger.stopSummary || {}).every((value) => value === "No")) {
    throw new Error(`Autonomous deploy stop ledger ${label} changed a stop summary value from No.`);
  }
  const guardrails = ledger.noSecretNoDeployGuardrails || {};
  const forbiddenTrueFields = [
    "credentialRequestAllowed",
    "secretStorageAllowed",
    "platformValueRequestAllowed",
    "platformInputRequestAllowed",
    "productionUrlStored",
    "deployTriggerStored",
    "dashboardActionAvailable",
    "dnsStepAvailable",
    "rollbackAuthorized",
    "publicDeployAuthorized",
    "publicLaunchAuthorized",
    "deployActionRequested",
    "executableSequenceCreated",
    "finalDecisionChangeAllowed",
  ].filter((key) => guardrails[key]);
  if (forbiddenTrueFields.length || guardrails.productionDeploymentState !== "Do Not Deploy") {
    throw new Error(`Autonomous deploy stop ledger ${label} unlocked forbidden guardrails: ${forbiddenTrueFields.join(", ")}`);
  }
  const crossArtifact = ledger.crossArtifactEvidence || {};
  if (
    crossArtifact.adminDataExternalInputsPresent !== false ||
    crossArtifact.productReadinessExternalInputsPresent !== false ||
    crossArtifact.staticOutputExternalInputsPresent !== false
  ) {
    throw new Error(`Autonomous deploy stop ledger ${label} marked external inputs present from local artifacts.`);
  }
  for (const forbidden of [/https?:\/\//i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /token\s*[:=]/i, /bearer\s+[a-z0-9]/i, /dashboard\s+action\s*[:=]/i, /dns\s+step\s*[:=]/i, /deploy\s+command\s*[:=]/i]) {
    if (forbidden.test(JSON.stringify(ledger))) {
      throw new Error(`Autonomous deploy stop ledger ${label} leaked URL, secret, token, bearer, dashboard-action, DNS-step, or deploy-command value marker.`);
    }
  }
  const evidenceNote = String(ledger.evidenceNote || "");
  for (const token of ["private", "read-only", "Not observed", "outside repo authority", "non-request", "no-secret", "no-deploy", "no-public-launch", "no-rollback", "non-executable"]) {
    if (!evidenceNote.includes(token)) {
      throw new Error(`Autonomous deploy stop ledger ${label} missing evidence note token: ${token}`);
    }
  }
}

function postAutonomousStopRecoveryChecklistFixture(overrides = {}) {
  return {
    format: "proofresume-post-autonomous-stop-recovery-checklist-v1",
    state: "post-autonomous-stop-recovery-checklist-do-not-deploy",
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
      finalLedgerDecision: "No-Go / Do Not Deploy",
      autonomousDeployStopLedgerState: "autonomous-stop-ledger-do-not-deploy",
      adminDataExternalInputsPresent: false,
      productReadinessExternalInputsPresent: false,
      staticOutputExternalInputsPresent: false,
    },
    evidenceNote:
      "Private post-autonomous-stop recovery checklist is recovery boundary only. Every recovery fact remains private, read-only, Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, no-authority-bypass, and non-executable.",
    ...overrides,
  };
}

function assertPostAutonomousStopRecoveryChecklistContract(checklist, label) {
  if (!checklist || typeof checklist !== "object") {
    throw new Error(`Missing post-autonomous-stop recovery checklist contract for ${label}`);
  }
  if (checklist.format !== "proofresume-post-autonomous-stop-recovery-checklist-v1") {
    throw new Error(`Post-autonomous-stop recovery checklist ${label} has unexpected format.`);
  }
  if (checklist.state !== "post-autonomous-stop-recovery-checklist-do-not-deploy" || checklist.decision !== "No-Go / Do Not Deploy") {
    throw new Error(`Post-autonomous-stop recovery checklist ${label} must stay No-Go / Do Not Deploy.`);
  }
  if (
    checklist.productionDeploymentState !== "Do Not Deploy" ||
    checklist.publishingState !== "Do Not Publish" ||
    checklist.private !== true ||
    checklist.localOnly !== true ||
    checklist.readOnly !== true ||
    checklist.autonomousRecoveryBoundary !== true ||
    checklist.nonRequest !== true ||
    checklist.outsideRepoAuthority !== true ||
    checklist.notCredentialRequest !== true ||
    checklist.notLaunchPlan !== true ||
    checklist.notRollbackPlan !== true ||
    checklist.notExecutableSequence !== true ||
    (checklist.executableSteps || []).length ||
    (checklist.deploySequence || []).length
  ) {
    throw new Error(`Post-autonomous-stop recovery checklist ${label} became public, requestable, deployable, launchable, rollback-capable, authority-bypassing, or executable.`);
  }
  if (
    checklist.sourceConsumed?.path !== "ops/deploy/private-autonomous-deploy-stop-ledger.md" ||
    checklist.sourceConsumed?.canRequestValues !== false ||
    checklist.sourceConsumed?.canAuthorizeDeploy !== false ||
    checklist.sourceConsumed?.canAuthorizeLaunch !== false ||
    checklist.sourceConsumed?.canAuthorizeRollback !== false ||
    checklist.sourceConsumed?.canBypassHumanPlatformAuthority !== false
  ) {
    throw new Error(`Post-autonomous-stop recovery checklist ${label} must consume only the autonomous stop ledger without requesting values or authorizing deploy/launch/rollback/authority bypass.`);
  }
  const scopeKeys = (checklist.recoveryScope || []).map((item) => String(item.key || "").toLowerCase());
  for (const key of ["admin-data", "product-readiness", "static-rehearsal-output", "post-autonomous-stop-recovery-checklist"]) {
    if (!scopeKeys.includes(key)) {
      throw new Error(`Post-autonomous-stop recovery checklist ${label} missing scope: ${key}`);
    }
  }
  if (!(checklist.recoveryScope || []).every((item) => item.canAuthorize === false && item.canRequestValues === false && item.canExecute === false)) {
    throw new Error(`Post-autonomous-stop recovery checklist ${label} allowed scope to authorize, request values, or execute.`);
  }
  const factText = (checklist.recoveryFacts || [])
    .map((item) => `${item.label || ""}: ${item.state || ""}: ${item.repoAuthority || ""}: ${item.canRequestFromRepo}: ${item.canInferFromLocalEvidence}: ${item.recoveryHandlingAllowed || ""}`)
    .join("\n")
    .toLowerCase();
  for (const token of [
    "explicit future human approval",
    "selected platform",
    "credential availability outside repo",
    "production url / production origin",
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
  ]) {
    if (!factText.includes(token) || !factText.includes("not observed") || !factText.includes("outside repo authority") || !factText.includes("preserve private read-only recovery boundary only")) {
      throw new Error(`Post-autonomous-stop recovery checklist ${label} must keep ${token} Not observed, outside repo authority, and recovery-boundary only.`);
    }
  }
  if ((checklist.recoveryFacts || []).some((item) => item.state !== "Not observed" || item.repoAuthority !== "Outside repo authority" || item.canRequestFromRepo !== false || item.canInferFromLocalEvidence !== false)) {
    throw new Error(`Post-autonomous-stop recovery checklist ${label} must keep every recovery fact non-requestable and non-inferable.`);
  }
  const forbiddenLabels = (checklist.forbiddenOperationalItems || []).map((item) => `${item.label || ""}: ${item.state || ""}`.toLowerCase()).join("\n");
  for (const token of ["credential request", "secret storage", "platform value request", "production url", "deploy trigger", "dashboard action", "dns step", "rollback authorization", "public launch authorization", "public deploy authorization", "authority bypass", "deploy action", "executable sequence"]) {
    if (!forbiddenLabels.includes(token)) {
      throw new Error(`Post-autonomous-stop recovery checklist ${label} missing forbidden item: ${token}`);
    }
  }
  if (!(checklist.forbiddenOperationalItems || []).every((item) => /absent/i.test(String(item.state || "")))) {
    throw new Error(`Post-autonomous-stop recovery checklist ${label} must keep every forbidden operational item absent.`);
  }
  if (!Object.values(checklist.recoverySummary || {}).every((value) => value === "No")) {
    throw new Error(`Post-autonomous-stop recovery checklist ${label} changed a recovery summary value from No.`);
  }
  const guardrails = checklist.noSecretNoDeployGuardrails || {};
  const forbiddenTrueFields = [
    "credentialRequestAllowed",
    "secretStorageAllowed",
    "platformValueRequestAllowed",
    "platformInputRequestAllowed",
    "productionUrlStored",
    "deployTriggerStored",
    "dashboardActionAvailable",
    "dnsStepAvailable",
    "rollbackAuthorized",
    "publicDeployAuthorized",
    "publicLaunchAuthorized",
    "authorityBypassAllowed",
    "deployActionRequested",
    "executableSequenceCreated",
    "finalDecisionChangeAllowed",
  ].filter((key) => guardrails[key]);
  if (forbiddenTrueFields.length || guardrails.productionDeploymentState !== "Do Not Deploy") {
    throw new Error(`Post-autonomous-stop recovery checklist ${label} unlocked forbidden guardrails: ${forbiddenTrueFields.join(", ")}`);
  }
  const crossArtifact = checklist.crossArtifactEvidence || {};
  if (
    crossArtifact.adminDataExternalInputsPresent !== false ||
    crossArtifact.productReadinessExternalInputsPresent !== false ||
    crossArtifact.staticOutputExternalInputsPresent !== false
  ) {
    throw new Error(`Post-autonomous-stop recovery checklist ${label} marked external inputs present from local artifacts.`);
  }
  for (const forbidden of [/https?:\/\//i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /token\s*[:=]/i, /bearer\s+[a-z0-9]/i, /dashboard\s+action\s*[:=]/i, /dns\s+step\s*[:=]/i, /deploy\s+command\s*[:=]/i]) {
    if (forbidden.test(JSON.stringify(checklist))) {
      throw new Error(`Post-autonomous-stop recovery checklist ${label} leaked URL, secret, token, bearer, dashboard-action, DNS-step, or deploy-command value marker.`);
    }
  }
  const evidenceNote = String(checklist.evidenceNote || "");
  for (const token of ["private", "read-only", "Not observed", "outside repo authority", "non-request", "no-secret", "no-deploy", "no-public-launch", "no-rollback", "no-authority-bypass", "non-executable"]) {
    if (!evidenceNote.includes(token)) {
      throw new Error(`Post-autonomous-stop recovery checklist ${label} missing evidence note token: ${token}`);
    }
  }
}

function humanPlatformAuthorityReEntryGateFixture(overrides = {}) {
  return {
    format: "proofresume-human-platform-authority-re-entry-gate-v1",
    state: "human-platform-authority-re-entry-blocked-do-not-deploy",
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
      finalLedgerDecision: "No-Go / Do Not Deploy",
      recoveryChecklistState: "post-autonomous-stop-recovery-checklist-do-not-deploy",
      adminDataExternalInputsPresent: false,
      productReadinessExternalInputsPresent: false,
      staticOutputExternalInputsPresent: false,
    },
    evidenceNote:
      "Private human-platform authority re-entry gate is a blocked re-entry boundary only. Every re-entry fact remains private, read-only, Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, no-authority-bypass, and non-executable.",
    ...overrides,
  };
}

function assertHumanPlatformAuthorityReEntryGateContract(gate, label) {
  if (!gate || typeof gate !== "object") {
    throw new Error(`Missing human-platform authority re-entry gate contract for ${label}`);
  }
  if (gate.format !== "proofresume-human-platform-authority-re-entry-gate-v1") {
    throw new Error(`Human-platform authority re-entry gate ${label} has unexpected format.`);
  }
  if (gate.state !== "human-platform-authority-re-entry-blocked-do-not-deploy" || gate.decision !== "No-Go / Do Not Deploy") {
    throw new Error(`Human-platform authority re-entry gate ${label} must stay No-Go / Do Not Deploy.`);
  }
  if (
    gate.productionDeploymentState !== "Do Not Deploy" ||
    gate.publishingState !== "Do Not Publish" ||
    gate.private !== true ||
    gate.localOnly !== true ||
    gate.readOnly !== true ||
    gate.humanPlatformAuthorityBoundary !== true ||
    gate.reEntryBlocked !== true ||
    gate.nonRequest !== true ||
    gate.outsideRepoAuthority !== true ||
    gate.notCredentialRequest !== true ||
    gate.notLaunchPlan !== true ||
    gate.notRollbackPlan !== true ||
    gate.notExecutableSequence !== true ||
    (gate.executableSteps || []).length ||
    (gate.deploySequence || []).length
  ) {
    throw new Error(`Human-platform authority re-entry gate ${label} became public, requestable, deployable, launchable, rollback-capable, authority-bypassing, or executable.`);
  }
  if (
    gate.sourceConsumed?.path !== "ops/deploy/private-post-autonomous-stop-recovery-checklist.md" ||
    gate.sourceConsumed?.canRequestValues !== false ||
    gate.sourceConsumed?.canAuthorizeDeploy !== false ||
    gate.sourceConsumed?.canAuthorizeLaunch !== false ||
    gate.sourceConsumed?.canAuthorizeRollback !== false ||
    gate.sourceConsumed?.canBypassHumanPlatformAuthority !== false ||
    gate.sourceConsumed?.canUnlockReEntry !== false
  ) {
    throw new Error(`Human-platform authority re-entry gate ${label} must consume only the recovery checklist without requesting values, authorizing deploy/launch/rollback, bypassing authority, or unlocking re-entry.`);
  }
  const scopeKeys = (gate.reEntryScope || []).map((item) => String(item.key || "").toLowerCase());
  for (const key of ["admin-data", "product-readiness", "static-rehearsal-output", "human-platform-authority-re-entry-gate"]) {
    if (!scopeKeys.includes(key)) {
      throw new Error(`Human-platform authority re-entry gate ${label} missing scope: ${key}`);
    }
  }
  if (!(gate.reEntryScope || []).every((item) => item.canAuthorize === false && item.canRequestValues === false && item.canExecute === false && item.canUnlockReEntry === false)) {
    throw new Error(`Human-platform authority re-entry gate ${label} allowed scope to authorize, request values, execute, or unlock re-entry.`);
  }
  const factText = (gate.reEntryFacts || [])
    .map((item) => `${item.label || ""}: ${item.state || ""}: ${item.repoAuthority || ""}: ${item.canRequestFromRepo}: ${item.canInferFromLocalEvidence}: ${item.reEntryHandlingAllowed || ""}`)
    .join("\n")
    .toLowerCase();
  for (const token of [
    "human/platform authority",
    "explicit future human approval",
    "selected platform",
    "credential availability outside repo",
    "production url / production origin",
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
  ]) {
    if (!factText.includes(token) || !factText.includes("not observed") || !factText.includes("outside repo authority") || !factText.includes("preserve private read-only human-platform authority boundary only")) {
      throw new Error(`Human-platform authority re-entry gate ${label} must keep ${token} Not observed, outside repo authority, and re-entry-boundary only.`);
    }
  }
  if ((gate.reEntryFacts || []).some((item) => item.state !== "Not observed" || item.repoAuthority !== "Outside repo authority" || item.canRequestFromRepo !== false || item.canInferFromLocalEvidence !== false)) {
    throw new Error(`Human-platform authority re-entry gate ${label} must keep every re-entry fact non-requestable and non-inferable.`);
  }
  const forbiddenLabels = (gate.forbiddenOperationalItems || []).map((item) => `${item.label || ""}: ${item.state || ""}`.toLowerCase()).join("\n");
  for (const token of ["credential request", "secret storage", "platform value request", "production url", "deploy trigger", "dashboard action", "dns step", "rollback authorization", "public launch authorization", "public deploy authorization", "authority bypass", "re-entry unlock", "deploy action", "executable sequence"]) {
    if (!forbiddenLabels.includes(token)) {
      throw new Error(`Human-platform authority re-entry gate ${label} missing forbidden item: ${token}`);
    }
  }
  if (!(gate.forbiddenOperationalItems || []).every((item) => /absent/i.test(String(item.state || "")))) {
    throw new Error(`Human-platform authority re-entry gate ${label} must keep every forbidden operational item absent.`);
  }
  if (!Object.values(gate.reEntrySummary || {}).every((value) => value === "No")) {
    throw new Error(`Human-platform authority re-entry gate ${label} changed a re-entry summary value from No.`);
  }
  const guardrails = gate.noSecretNoDeployGuardrails || {};
  const forbiddenTrueFields = [
    "credentialRequestAllowed",
    "secretStorageAllowed",
    "platformValueRequestAllowed",
    "platformInputRequestAllowed",
    "productionUrlStored",
    "deployTriggerStored",
    "dashboardActionAvailable",
    "dnsStepAvailable",
    "rollbackAuthorized",
    "publicDeployAuthorized",
    "publicLaunchAuthorized",
    "authorityBypassAllowed",
    "reEntryUnlockAllowed",
    "deployActionRequested",
    "executableSequenceCreated",
    "finalDecisionChangeAllowed",
  ].filter((key) => guardrails[key]);
  if (forbiddenTrueFields.length || guardrails.productionDeploymentState !== "Do Not Deploy") {
    throw new Error(`Human-platform authority re-entry gate ${label} unlocked forbidden guardrails: ${forbiddenTrueFields.join(", ")}`);
  }
  const crossArtifact = gate.crossArtifactEvidence || {};
  if (
    crossArtifact.adminDataExternalInputsPresent !== false ||
    crossArtifact.productReadinessExternalInputsPresent !== false ||
    crossArtifact.staticOutputExternalInputsPresent !== false
  ) {
    throw new Error(`Human-platform authority re-entry gate ${label} marked external inputs present from local artifacts.`);
  }
  for (const forbidden of [/https?:\/\//i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /token\s*[:=]/i, /bearer\s+[a-z0-9]/i, /dashboard\s+action\s*[:=]/i, /dns\s+step\s*[:=]/i, /deploy\s+command\s*[:=]/i]) {
    if (forbidden.test(JSON.stringify(gate))) {
      throw new Error(`Human-platform authority re-entry gate ${label} leaked URL, secret, token, bearer, dashboard-action, DNS-step, or deploy-command value marker.`);
    }
  }
  const evidenceNote = String(gate.evidenceNote || "");
  for (const token of ["private", "read-only", "Not observed", "outside repo authority", "non-request", "no-secret", "no-deploy", "no-public-launch", "no-rollback", "no-authority-bypass", "non-executable"]) {
    if (!evidenceNote.includes(token)) {
      throw new Error(`Human-platform authority re-entry gate ${label} missing evidence note token: ${token}`);
    }
  }
}

function extractH1(htmlSource) {
  return htmlSource
    .match(/<h1[\s>][\s\S]*?<\/h1>/i)?.[0]
    ?.replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

if (!html || !adminHtml) {
  throw new Error("Site checks require index.html and admin.html.");
}

for (const page of htmlPages) {
  if (!/<title>[^<]+<\/title>/i.test(page.html)) {
    throw new Error(`Missing document title in ${page.file}`);
  }

  if (!extractH1(page.html)) {
    throw new Error(`Missing h1 in ${page.file}`);
  }
}

function assertCoreAuthWorkspaceShellContract({ appHtml, appJs }) {
  if (!appHtml) {
    throw new Error("Missing required app entrypoint: app.html");
  }

  requireAll(
    appHtml,
    [
      "<title>ProofResume App | Local workspace</title>",
      '<link rel="stylesheet" href="styles.css" />',
      '<script type="module" src="app.js"></script>',
      "Return to the same ProofResume workspace in this browser",
      "Upload your resume. Get matched, tailored applications ready to approve.",
      "local-dev auth adapter",
      "production",
      "credentials",
      "external customer-data storage",
      "Production auth is disabled",
      "No email, OAuth, or provider request will be sent.",
      "Real `/app` authenticated-user sessions require the `auth` control",
      "customer_data",
      "admin_access",
      "external_auth_email",
      "data-auth-workspace-shell",
      "data-auth-session-status",
      "data-auth-sign-in-local",
      "data-auth-sign-out",
      "data-auth-route-policy",
      "data-auth-control-gate",
      "data-auth-workspace-link",
      "data-resume-form",
      "data-resume-file",
      "data-resume-text",
      "data-clear-resume",
      "data-export-workspace",
      "data-resume-state",
      "data-resume-imported",
      "data-resume-filename",
      "data-resume-summary",
      "data-resume-preview",
      "Save resume locally",
      "Production resume storage is disabled",
      "Export workspace JSON",
    ],
    "core auth and resume workspace HTML contract"
  );

  requireAll(
    appJs,
    [
      "agentfoundry.localDemoIdentity.v1",
      "proofresume:localWorkspace:v1",
      "createLocalDemoIdentity",
      'provider: "local-demo"',
      "productionAuth: false",
      "localOnly: true",
      "requireUser",
      "requireRole",
      '"auth"',
      '"customer_data"',
      '"admin_access"',
      '"external_auth_email"',
      "/app workspace is authenticated-user only",
      "local fallback allowed",
      "readSession",
      "signInLocal",
      "signOutLocal",
      "ensureWorkspace",
      "proofresume-local-workspace-export-v1",
      "emptyResumeState",
      "deriveResumeSummary",
      "importedResumeState",
      "renderResume",
      "resumeFile",
      "resumeText",
      "filename",
      "importedAt",
      "wordCount",
      "likelySections",
      "skillSignals",
      "No production upload occurred",
      "No production storage or third-party upload was used",
    ],
    "core auth and resume workspace JS contract"
  );

  for (const forbidden of [
    /fetch\(/i,
    /XMLHttpRequest/i,
    /navigator\.sendBeacon/i,
    /window\.location\.assign\(/i,
    /window\.location\.replace\(/i,
    /client_secret/i,
    /service_role/i,
    /refresh_token/i,
    /https?:\/\/[^"'\s]+/i,
    /\bSupabase\b/i,
    /\bClerk\b/i,
    /\bFirebase\b/i,
    /\bAuth0\b/i,
  ]) {
    if (forbidden.test(appJs)) {
      throw new Error(`Core auth workspace shell must stay local-only and provider-disabled: ${forbidden}`);
    }
  }
}

assertCoreAuthWorkspaceShellContract({ appHtml, appJs });

function assertCoreResumeUploadPersistenceContract({ appHtml, appJs }) {
  requireAll(
    appHtml,
    [
      "Import your resume into this workspace.",
      "Resume file",
      "Resume text",
      "Save resume locally",
      "Clear resume",
      "Export workspace JSON",
      "Production resume storage is disabled.",
      "This import stays in localStorage in this browser.",
      "Resume state",
      "Last import",
      "Derived summary",
      "Stored text preview",
      "data-resume-form",
      "data-resume-file",
      "data-resume-text",
      "data-save-resume",
      "data-clear-resume",
      "data-export-workspace",
      "data-resume-message",
      "data-resume-state",
      "data-resume-imported",
      "data-resume-filename",
      "data-resume-summary",
      "data-resume-preview",
    ],
    "core resume upload persistence HTML contract"
  );

  requireAll(
    appJs,
    [
      "WORKSPACE_EXPORT_FORMAT",
      "proofresume-local-workspace-export-v1",
      "emptyResumeState",
      "deriveResumeSummary",
      "importedResumeState",
      "profileSummary",
      "headline",
      "recentRoles",
      "source: \"local-derived\"",
      "filename",
      "importedAt",
      "text: trimmedText",
      "file.text()",
      "resumeFile",
      "resumeText",
      "writeWorkspace(workspace)",
      "Replace resume locally",
      "Cleared resume text from this browser-local workspace.",
      "No production upload occurred.",
      "Browser-local prototype export. No production storage or third-party upload was used.",
    ],
    "core resume upload persistence JS contract"
  );

  for (const forbidden of [
    /fetch\(/i,
    /XMLHttpRequest/i,
    /navigator\.sendBeacon/i,
    /resumeText[\s\S]{0,200}(?:api|endpoint|upload|post|send)/i,
    /https?:\/\/[^"'\s]+/i,
  ]) {
    if (forbidden.test(appJs)) {
      throw new Error(`Core resume upload persistence must stay browser-local and provider-disabled: ${forbidden}`);
    }
  }
}

assertCoreResumeUploadPersistenceContract({ appHtml, appJs });

function assertCoreJobSourcingMatchingWorkflowContract({ appHtml, appJs, targetJobJs }) {
  requireAll(
    appHtml,
    [
      "Local job pipeline",
      "Paste jobs, rank fit, then build a tailored packet.",
      "Save and rank job locally",
      "Clear jobs",
      "Load demo matched pipeline",
      "Demo matches are generated locally from saved preferences",
      "No scraping, source fetching, sending, or applying is available here.",
      "data-job-form",
      "data-job-text",
      "data-save-job",
      "data-load-demo-pipeline",
      "data-clear-jobs",
      "data-job-message",
      "data-job-list",
      "data-job-pipeline-count",
    ],
    "core job sourcing matching HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-local-job-pipeline-v1",
      "proofresume:workspaceSelectedJob:v1",
      "proofresume-workspace-selected-job-v1",
      "emptyJobPipelineState",
      "scoreJobForWorkspace",
      "DEMO_JOB_SEEDS",
      "demoJobsForWorkspace",
      "demo-preference-seed",
      "Browser-local demo pipeline",
      "scoreDrivers",
      "rankWorkspaceJobs",
      "sendJobToTargetPack",
      "targetLeadFromJob",
      "fitScore",
      "proofGapCount",
      "effortScore",
      "readiness",
      "noExternalFetch: true",
      "noScraping: true",
      "noOutboundSend: true",
      "noAutoApply: true",
    ],
    "core job sourcing matching JS contract"
  );

  requireAll(
    targetJobJs,
    [
      "WORKSPACE_SELECTED_JOB_KEY",
      "proofresume:workspaceSelectedJob:v1",
      "loadWorkspaceSelectedJobHandoff",
      "hydrateTargetJobFromWorkspaceHandoff",
      "Workspace job loaded locally",
      "noExternalFetch: true",
      "noOutboundSend: true",
      "noAutoApply: true",
    ],
    "core job sourcing matching target-job handoff contract"
  );

  for (const forbidden of [/fetch\(/i, /XMLHttpRequest/i, /navigator\.sendBeacon/i, /\bsend now\b/i, /\bstart applying\b/i]) {
    if (forbidden.test(appJs)) {
      throw new Error(`Core job sourcing matching workflow must stay local-only and no-send: ${forbidden}`);
    }
  }
}

assertCoreJobSourcingMatchingWorkflowContract({ appHtml, appJs, targetJobJs });

function assertCoreApplicationApprovalApplyTrackingContract({ appHtml, appJs, targetJobJs }) {
  requireAll(
    appHtml,
    [
      "Tailored packet approval loop",
      "Review the local packet, approve or edit it, then track outcomes.",
      "claims, resume changes, cover note, answers, apply URL, and candidate consent approval",
      "External apply/send providers remain disabled.",
      "data-application-approval-tracker",
      "data-application-tracker-count",
      "data-application-provider-boundary",
      "data-application-message",
      "data-application-list",
      "data-application-audit",
      "Prepare and export actions stay browser-local",
    ],
    "core application approval tracking HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-local-application-tracker-v1",
      "proofresume-local-application-approval-packet-v1",
      "proofresume-application-audit-event-v1",
      "proofresume-local-tailored-packet-generator-v1",
      "proofresume-workspace-tailored-packet-handoff-v1",
      "proofresume-local-application-export-v1",
      "proofresume-local-application-dry-run-plan-v1",
      "APPROVAL_CHECKLIST",
      "TRACKABLE_APPLICATION_STATUSES",
      "APPLICATION_STATUS_OPTIONS",
      "ready",
      "applied",
      "interviewing",
      "rejected",
      "accepted",
      "archived",
      "claims",
      "resumeChanges",
      "coverNote",
      "answers",
      "applyUrl",
      "consent",
      "emptyApplicationTrackerState",
      "applicationApprovalReady",
      "applicationApprovalMissingLabels",
      "applicationWithApprovalGuardrails",
      "applicationTrackingReady",
      "applicationPacketFromJob",
      "appendApplicationAudit",
      "upsertApplication",
      "createApplicationFromJob",
      "renderApplicationTracker",
      "Create application packet",
      "Approve packet",
      "Edit packet locally",
      "data-approve-application",
      "data-save-application-edits",
      "data-set-application-status",
      "Open in Target Job Pack",
      "applicationPacketContent",
      "resumeBulletSuggestions",
      "strongestResumeEvidenceLines",
      "tailoredPacketHandoff",
      "regeneratedApplicationPacket",
      "resumeBulletSuggestions",
      "doNotInventBoundaries",
      "proofGaps",
      "data-create-application",
      "data-regenerate-application",
      "data-reset-application",
      "data-open-application-pack",
      "data-save-application",
      "data-prepare-application",
      "data-export-application",
      "data-application-status",
      "data-application-outcome",
      "application_packet_edited",
      "application_marked_",
      "application_approved",
      "dry-run apply plan",
      "Prepared local apply plan without submitting, sending, uploading, or filling external forms.",
      "Regenerated the tailored packet from the current local resume, preferences, and selected job. No external action occurred.",
      "Handed the tailored packet to Target Job Pack with local context preserved.",
      "executionAllowed: false",
      "externalAction: false",
      "noUpload: true",
      "candidate consent",
      "target job not approved",
      "noExternalFetch: true",
      "noOutboundSend: true",
      "noAutoApply: true",
    ],
    "core application approval tracking JS contract"
  );

  requireAll(
    targetJobJs,
    [
      "tailoredPacketContext",
      "Workspace tailored packet loaded locally; review before rebuilding the pack",
      "noExternalFetch: true",
      "noOutboundSend: true",
      "noAutoApply: true",
    ],
    "tailored packet target-job handoff contract"
  );

  for (const forbidden of [/fetch\(/i, /XMLHttpRequest/i, /navigator\.sendBeacon/i, /\bsubmit application\b/i, /\bsend cover note\b/i, /\bupload resume to provider\b/i]) {
    if (forbidden.test(appJs.replace(/disabledUntilConsentAndControls[\s\S]*?\],/, ""))) {
      throw new Error(`Core application approval tracking must not expose real apply/send execution: ${forbidden}`);
    }
  }
}

assertCoreApplicationApprovalApplyTrackingContract({ appHtml, appJs, targetJobJs });

function assertWalkableJourneyCoherenceContract({ appHtml, appJs }) {
  requireAll(
    appHtml,
    [
      "Walkthrough",
      "One loop, visible from start to finish.",
      "data-workspace-journey",
      "data-journey-progress",
      "data-journey-steps",
      "data-journey-next",
      "data-next-step-link",
      "paid-preview handoff",
      'id="resume-import"',
      'id="target-preferences"',
      'id="job-pipeline"',
      'id="application-tracker"',
      "Load sample job text",
      "Save target preferences",
      "Primary target role",
      "Location or remote preference",
    ],
    "walkable journey coherence HTML contract"
  );

  requireAll(
    appJs,
    [
      "JOURNEY_STEPS",
      "workspaceNextAction",
      "nextJourneyAction",
      "journeyState",
      "renderJourney",
      "profileReady",
      "SAMPLE_JOB",
      "Loaded a sample local job. Save and rank it to create the first matched-job card.",
      "firstApplication",
      "Create a tailored application packet from the strongest matched job.",
      "Review the packet and complete the approval checklist.",
      "Track the application status locally or export the approved packet.",
      "Review the proof-backed result receipt and missing-proof questions.",
      "Inspect the paid packet preview route without checkout or payment links.",
      "application_rejected",
      "Reject locally",
      "scrollIntoView",
      "Save target preferences, then add or select a target job to build an application packet.",
      "Resume saved locally. Next, save target preferences and paste a job to rank. No production upload occurred.",
    ],
    "walkable journey coherence JS contract"
  );
}

assertWalkableJourneyCoherenceContract({ appHtml, appJs });

function assertPaidPacketCustomerPreviewContract({ appHtml }) {
  requireAll(
    appHtml,
    [
      "data-paid-packet-customer-preview",
      "No-checkout Target Job Proof Packet preview",
      "Target Job Proof Packet includes before any checkout exists",
      "Sample price preview: $49, authorized experiment cap: $99",
      "data-paid-packet-deliverables",
      "Proof map tied to supported resume evidence.",
      "Tailored bullet plan with missing-proof questions.",
      "Approval and tracking handoff for approve, edit-needed, and reject states.",
      "data-paid-packet-preview-choices",
      "approve-preview",
      "edit-needed",
      "not-now",
      "blocked-by-trust-support-customer-data",
      "data-paid-packet-activation-blockers",
      "Payment authority and hosted checkout remain missing.",
      "Support/refund policy and tax/MoR owner remain unresolved.",
      "business_first_paid_packet_no_send_offer_prep",
    ],
    "paid packet customer preview HTML contract"
  );
}

assertPaidPacketCustomerPreviewContract({ appHtml });

function assertFirstSessionCustomerHandoffRoomContract({ appHtml, appJs, qaTargetJobPackSource }) {
  requireAll(
    appHtml,
    [
      "data-first-session-customer-handoff-room",
      "Customer handoff room",
      "Show the first-session path, proof value, blocked gates, and one safe next route.",
      "data-customer-handoff-room-path",
      "data-customer-handoff-room-facts",
      "data-customer-handoff-room-value",
      "data-customer-handoff-room-provenance",
      "data-customer-handoff-room-gates",
      "data-customer-handoff-room-route",
      "data-export-customer-handoff-room-json",
      "data-export-customer-handoff-room-markdown",
      "business_first_paid_packet_no_send_offer_prep",
    ],
    "first-session customer handoff room HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-first-session-customer-handoff-room-v1",
      "FIRST_SESSION_CUSTOMER_HANDOFF_BLOCKED_GATES",
      "buildFirstSessionCustomerHandoffRoom",
      "renderFirstSessionCustomerHandoffRoom",
      "firstSessionCustomerHandoffMarkdown",
      "rawInputProvenance",
      "approvedFactsAndRecommendations",
      "routeOptions: [selectedRoute]",
      "noPaymentCustomerDataOrApplicationHandling: true",
      "noUnsupportedCustomerOrRevenueClaims: true",
      "queueMutationAllowed: false",
      "downstreamDoneClaimAllowed: false",
      "externalActionAllowed: false",
    ],
    "first-session customer handoff room JS contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertFirstSessionCustomerHandoffRoom",
      "check_first_session_customer_handoff_room.cjs",
      "first-session-customer-handoff-room.sample.json",
    ],
    "first-session customer handoff room QA wiring"
  );
}

assertFirstSessionCustomerHandoffRoomContract({ appHtml, appJs, qaTargetJobPackSource });

function assertFirstSessionObjectionRepairWizardContract({ appHtml, appJs, qaTargetJobPackSource }) {
  requireAll(
    appHtml,
    [
      "data-first-session-objection-repair-wizard",
      "Objection repair wizard",
      "Convert one sample objection category into one internal repair route.",
      "data-objection-wizard-cases",
      "data-objection-wizard-rationale",
      "data-objection-wizard-validation",
      "data-objection-wizard-gates",
      "data-objection-wizard-route",
      "data-export-objection-wizard-json",
      "data-export-objection-wizard-markdown",
      "product_first_session_missing_proof_repair",
    ],
    "first-session objection repair wizard HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-first-session-objection-to-repair-wizard-v1",
      "FIRST_SESSION_OBJECTION_CASES",
      "OBJECTION_REPAIR_ROUTE_FAMILIES",
      "buildFirstSessionObjectionRepairWizard",
      "renderFirstSessionObjectionRepairWizard",
      "firstSessionObjectionRepairWizardMarkdown",
      "rawObjectionTextStored: false",
      "safeCategoryLabelsOnly: true",
      "noRawCustomerMaterials: true",
      "queueMutationAllowed: false",
      "downstreamDoneClaimAllowed: false",
      "externalActionAllowed: false",
    ],
    "first-session objection repair wizard JS contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertFirstSessionObjectionRepairWizard",
      "check_first_session_objection_to_repair_wizard.cjs",
      "first-session-objection-to-repair-wizard.sample.json",
    ],
    "first-session objection repair wizard QA wiring"
  );
}

assertFirstSessionObjectionRepairWizardContract({ appHtml, appJs, qaTargetJobPackSource });

function assertFirstCustomerConciergeDemoBundleContract({ appHtml, appJs, qaTargetJobPackSource }) {
  requireAll(
    appHtml,
    [
      "data-first-customer-concierge-demo-bundle",
      "Concierge demo bundle",
      "Run one local first-customer demo packet from start to route decision.",
      "data-concierge-demo-bundle-start",
      "data-concierge-demo-bundle-run",
      "data-concierge-demo-bundle-end",
      "data-concierge-demo-bundle-path",
      "data-concierge-demo-bundle-prompts",
      "data-concierge-demo-bundle-gates",
      "data-concierge-demo-bundle-false-flags",
      "data-concierge-demo-bundle-route",
      "data-export-concierge-demo-bundle-json",
      "data-export-concierge-demo-bundle-markdown",
      "product_first_session_missing_proof_repair",
    ],
    "first-customer concierge demo bundle HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-first-customer-concierge-demo-bundle-v1",
      "FIRST_CUSTOMER_CONCIERGE_DEMO_BUNDLE_FORMAT",
      "buildFirstCustomerConciergeDemoBundle",
      "renderFirstCustomerConciergeDemoBundle",
      "firstCustomerConciergeDemoBundleMarkdown",
      "firstCustomerConciergeDemoBundleFalseFlags",
      "feedbackEvidence: false",
      "willingnessToPayEvidence: false",
      "paymentIntentEvidence: false",
      "revenueEvidence: false",
      "buildFirstSessionCustomerHandoffRoom",
      "buildFirstSessionObjectionRepairWizard",
      "queueMutationAllowed: false",
      "downstreamDoneClaimAllowed: false",
      "externalActionAllowed: false",
    ],
    "first-customer concierge demo bundle JS contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertFirstCustomerConciergeDemoBundle",
      "check_first_customer_concierge_demo_bundle.cjs",
      "first-customer-concierge-demo-bundle.sample.json",
    ],
    "first-customer concierge demo bundle QA wiring"
  );
}

assertFirstCustomerConciergeDemoBundleContract({ appHtml, appJs, qaTargetJobPackSource });

function assertFirstCustomerReactionRouteRecorderContract({ appHtml, appJs, qaTargetJobPackSource }) {
  requireAll(
    appHtml,
    [
      "data-first-customer-reaction-route-recorder",
      "Reaction route recorder",
      "Capture safe reaction labels and select one internal route.",
      "data-reaction-route-recorder-labels",
      "data-reaction-route-recorder-classes",
      "data-reaction-route-recorder-routes",
      "data-reaction-route-recorder-rationale",
      "data-reaction-route-recorder-gates",
      "data-reaction-route-recorder-false-claims",
      "data-reaction-route-recorder-route",
      "data-export-reaction-route-recorder-json",
      "data-export-reaction-route-recorder-markdown",
      "customerFeedbackClaim: false",
      "product_first_session_missing_proof_repair",
    ],
    "first-customer reaction route recorder HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-first-customer-reaction-route-recorder-v1",
      "FIRST_CUSTOMER_REACTION_ROUTE_RECORDER_FORMAT",
      "firstCustomerReactionRouteFalseClaims",
      "firstCustomerReactionRouteOptions",
      "buildFirstCustomerReactionRouteRecorder",
      "renderFirstCustomerReactionRouteRecorder",
      "firstCustomerReactionRouteRecorderMarkdown",
      "customerFeedbackClaim: false",
      "willingnessToPayClaim: false",
      "paymentIntentClaim: false",
      "revenueClaim: false",
      "buildFirstCustomerConciergeDemoBundle",
      "queueMutationAllowed: false",
      "downstreamDoneClaimAllowed: false",
      "externalActionAllowed: false",
    ],
    "first-customer reaction route recorder JS contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertFirstCustomerReactionRouteRecorder",
      "check_first_customer_reaction_route_recorder.cjs",
      "first-customer-reaction-route-recorder.sample.json",
    ],
    "first-customer reaction route recorder QA wiring"
  );
}

assertFirstCustomerReactionRouteRecorderContract({ appHtml, appJs, qaTargetJobPackSource });

function assertFirstCustomerEvidenceInboxRoomContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource }) {
  requireAll(
    appHtml,
    [
      "data-first-customer-evidence-inbox-room",
      "Evidence inbox room",
      "Normalize safe first-customer evidence before any route decision.",
      "data-evidence-inbox-room-source-custody",
      "data-evidence-inbox-room-modes",
      "data-evidence-inbox-room-labels",
      "data-evidence-inbox-room-missing",
      "data-evidence-inbox-room-gates",
      "data-evidence-inbox-room-false-claims",
      "data-evidence-inbox-room-route",
      "data-export-evidence-inbox-room-json",
      "data-export-evidence-inbox-room-markdown",
      "paymentIntentClaim: false",
      "product_first_session_missing_proof_repair",
    ],
    "first-customer evidence inbox room HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-first-customer-evidence-inbox-room-v1",
      "FIRST_CUSTOMER_EVIDENCE_INBOX_ROOM_FORMAT",
      "buildFirstCustomerEvidenceInboxRoom",
      "renderFirstCustomerEvidenceInboxRoom",
      "firstCustomerEvidenceInboxRoomMarkdown",
      "firstCustomerEvidenceInboxMissingBeforeLiveUse",
      "firstCustomerEvidenceInboxBlockedActions",
      "sourceCustody",
      "claimBoundary",
      "selectedProvisionalRoute",
      "queueMutationAllowed: false",
      "downstreamDoneClaimAllowed: false",
      "externalActionAllowed: false",
    ],
    "first-customer evidence inbox room JS contract"
  );

  requireAll(
    adminHtml,
    [
      "first-customer-evidence-inbox-room",
      "First customer evidence inbox",
      "Custody, Missing Gates, and One Route",
      "evidence-inbox-room-summary",
      "evidence-inbox-room-route",
      "evidence-inbox-room-grid",
    ],
    "first-customer evidence inbox room admin HTML contract"
  );

  requireAll(
    adminJs,
    [
      "renderFirstCustomerEvidenceInboxRoom",
      "firstCustomerEvidenceInboxRoom",
      "Exactly one provisional route",
      "Unsupported claim flags",
    ],
    "first-customer evidence inbox room admin JS contract"
  );

  requireAll(
    adminDataBuilderSource,
    [
      "buildFirstCustomerEvidenceInboxRoomVisibility",
      "first-customer-evidence-inbox-room.sample.json",
      "firstCustomerEvidenceInboxRoom",
    ],
    "first-customer evidence inbox room admin data contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertFirstCustomerEvidenceInboxRoom",
      "check_first_customer_evidence_inbox_room.cjs",
      "first-customer-evidence-inbox-room.sample.json",
    ],
    "first-customer evidence inbox room QA wiring"
  );
}

assertFirstCustomerEvidenceInboxRoomContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource });

function assertFirstCustomerEvidenceRouteScoreboardContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource }) {
  requireAll(
    appHtml,
    [
      "data-first-customer-evidence-route-scoreboard",
      "Evidence route scoreboard",
      "Score first-customer evidence into one safe next route.",
      "data-evidence-route-scoreboard-dimensions",
      "data-evidence-route-scoreboard-fixtures",
      "data-evidence-route-scoreboard-false-claims",
      "data-evidence-route-scoreboard-route",
      "data-export-evidence-route-scoreboard-json",
      "data-export-evidence-route-scoreboard-markdown",
      "liveFeedbackClaim: false",
      "product_first_customer_evidence_proof_repair",
    ],
    "first-customer evidence route scoreboard HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-first-customer-evidence-route-scoreboard-v1",
      "FIRST_CUSTOMER_EVIDENCE_ROUTE_SCOREBOARD_FORMAT",
      "buildFirstCustomerEvidenceRouteScoreboard",
      "renderFirstCustomerEvidenceRouteScoreboard",
      "firstCustomerEvidenceRouteScoreboardMarkdown",
      "firstCustomerEvidenceRouteScoreboardClaimControls",
      "firstCustomerEvidenceRouteScoreboardCases",
      "scoreDimensions",
      "scoreFixtures",
      "exactlyOneSelectedRoute: true",
      "noExternalActions: true",
      "queueMutationAllowed: false",
      "paymentOrCustomerDataHandlingAllowed: false",
    ],
    "first-customer evidence route scoreboard JS contract"
  );

  requireAll(
    adminHtml,
    [
      "first-customer-evidence-route-scoreboard",
      "Scoreboard, Gates, and One Route",
      "evidence-route-scoreboard-summary",
      "evidence-route-scoreboard-route",
      "evidence-route-scoreboard-grid",
    ],
    "first-customer evidence route scoreboard admin HTML contract"
  );

  requireAll(
    adminJs,
    [
      "renderFirstCustomerEvidenceRouteScoreboard",
      "firstCustomerEvidenceRouteScoreboard",
      "Score dimensions",
      "Fail-closed claims",
    ],
    "first-customer evidence route scoreboard admin JS contract"
  );

  requireAll(
    adminDataBuilderSource,
    [
      "buildFirstCustomerEvidenceRouteScoreboardVisibility",
      "first-customer-evidence-route-scoreboard.sample.json",
      "firstCustomerEvidenceRouteScoreboard",
    ],
    "first-customer evidence route scoreboard admin data contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertFirstCustomerEvidenceRouteScoreboard",
      "check_first_customer_evidence_route_scoreboard.cjs",
      "first-customer-evidence-route-scoreboard.sample.json",
    ],
    "first-customer evidence route scoreboard QA wiring"
  );
}

assertFirstCustomerEvidenceRouteScoreboardContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource });

function assertFirstCustomerEvidenceProofRepairPacketContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource }) {
  const appSurfaceCount = (appHtml.match(/data-first-customer-evidence-proof-repair-packet/g) || []).length;
  if (appSurfaceCount !== 1) {
    throw new Error(`Expected exactly one first-customer evidence proof-repair app surface, found ${appSurfaceCount}.`);
  }

  requireAll(
    appHtml,
    [
      "data-first-customer-evidence-proof-repair-packet",
      "Evidence proof repair",
      "Repair missing proof before any live claim.",
      "data-evidence-proof-repair-missing",
      "data-evidence-proof-repair-prompts",
      "data-evidence-proof-repair-copy",
      "data-evidence-proof-repair-custody",
      "data-evidence-proof-repair-blocked",
      "data-evidence-proof-repair-claims",
      "data-evidence-proof-repair-route",
      "data-export-evidence-proof-repair-json",
      "data-export-evidence-proof-repair-markdown",
      "customerFeedbackClaim: false",
      "willingnessToPayClaim: false",
      "falseUnsupportedClaims: true",
      "product_first_customer_evidence_proof_repair",
    ],
    "first-customer evidence proof-repair packet HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-first-customer-evidence-proof-repair-packet-v1",
      "FIRST_CUSTOMER_EVIDENCE_PROOF_REPAIR_PACKET_FORMAT",
      "buildFirstCustomerEvidenceProofRepairPacket",
      "renderFirstCustomerEvidenceProofRepairPacket",
      "firstCustomerEvidenceProofRepairPacketMarkdown",
      "firstCustomerEvidenceProofRepairMissingCategories",
      "firstCustomerEvidenceProofRepairPrompts",
      "firstCustomerEvidenceProofRepairCopy",
      "beforeAfterRepairCopy",
      "proofCompletenessRepairOutput",
      "sourceCustodyLabels",
      "rawCustomerMaterialsExcluded: true",
      "falseUnsupportedClaims: true",
      "noExternalActions: true",
      "queueMutationAllowed: false",
      "paymentOrCustomerDataHandlingAllowed: false",
      "downstreamCompletionClaimAllowed: false",
    ],
    "first-customer evidence proof-repair packet JS contract"
  );

  requireAll(
    adminHtml,
    [
      "first-customer-evidence-proof-repair-packet",
      "Missing Proof, Repair Copy, and Custody",
      "evidence-proof-repair-summary",
      "evidence-proof-repair-route",
      "evidence-proof-repair-grid",
    ],
    "first-customer evidence proof-repair packet admin HTML contract"
  );

  requireAll(
    adminJs,
    [
      "renderFirstCustomerEvidenceProofRepairPacket",
      "firstCustomerEvidenceProofRepairPacket",
      "Missing proof categories",
      "Safe follow-up prompts",
      "Before/after repair copy",
    ],
    "first-customer evidence proof-repair packet admin JS contract"
  );

  requireAll(
    adminDataBuilderSource,
    [
      "buildFirstCustomerEvidenceProofRepairPacketVisibility",
      "first-customer-evidence-proof-repair-packet.sample.json",
      "firstCustomerEvidenceProofRepairPacket",
    ],
    "first-customer evidence proof-repair packet admin data contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertFirstCustomerEvidenceProofRepairPacket",
      "check_first_customer_evidence_proof_repair_packet.cjs",
      "first-customer-evidence-proof-repair-packet.sample.json",
    ],
    "first-customer evidence proof-repair packet QA wiring"
  );
}

assertFirstCustomerEvidenceProofRepairPacketContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource });

function assertRepairedProofToPaidAskRoomContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource }) {
  const appSurfaceCount = (appHtml.match(/data-repaired-proof-to-paid-ask-room/g) || []).length;
  if (appSurfaceCount !== 1) {
    throw new Error(`Expected exactly one repaired-proof to paid ask room app surface, found ${appSurfaceCount}.`);
  }

  requireAll(
    appHtml,
    [
      "data-repaired-proof-to-paid-ask-room",
      "Paid ask rehearsal",
      "Turn repaired proof into a no-send paid-packet ask.",
      "business_private_paid_packet_discussion_no_checkout",
      "data-paid-ask-room-proof-delta",
      "data-paid-ask-room-missing-proof",
      "data-paid-ask-room-objections",
      "data-paid-ask-room-deliverables",
      "data-paid-ask-room-gates",
      "data-paid-ask-room-payment-state",
      "data-export-paid-ask-room-json",
      "data-export-paid-ask-room-markdown",
      "paymentLinkDisplay: false",
      "checkoutDisplay: false",
      "paymentCollection: false",
    ],
    "repaired-proof to paid ask room HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-repaired-proof-to-paid-ask-room-v1",
      "REPAIRED_PROOF_TO_PAID_ASK_ROOM_FORMAT",
      "buildRepairedProofToPaidAskRoom",
      "renderRepairedProofToPaidAskRoom",
      "repairedProofToPaidAskRoomMarkdown",
      "paidAskRoomObjectionRoutes",
      "proofDelta",
      "missingProofAsk",
      "business_private_paid_packet_discussion_no_checkout",
      "noPaymentLinks: true",
      "noProviderCalls: true",
      "noCustomerDataHandling: true",
      "queueMutationAllowed: false",
      "downstreamCompletionClaimAllowed: false",
    ],
    "repaired-proof to paid ask room JS contract"
  );

  requireAll(
    adminHtml,
    [
      "repaired-proof-to-paid-ask-room",
      "Proof Delta, Offer Gates, and One Route",
      "paid-ask-room-summary",
      "paid-ask-room-route",
      "paid-ask-room-grid",
    ],
    "repaired-proof to paid ask room admin HTML contract"
  );

  requireAll(
    adminJs,
    [
      "renderRepairedProofToPaidAskRoom",
      "repairedProofToPaidAskRoom",
      "Proof delta",
      "Missing-proof asks",
      "Paid packet deliverables",
      "Objection states",
    ],
    "repaired-proof to paid ask room admin JS contract"
  );

  requireAll(
    adminDataBuilderSource,
    [
      "buildRepairedProofToPaidAskRoomVisibility",
      "repaired-proof-to-paid-ask-room.sample.json",
      "repairedProofToPaidAskRoom",
    ],
    "repaired-proof to paid ask room admin data contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertRepairedProofToPaidAskRoom",
      "check_repaired_proof_to_paid_ask_room.cjs",
      "repaired-proof-to-paid-ask-room.sample.json",
    ],
    "repaired-proof to paid ask room QA wiring"
  );
}

assertRepairedProofToPaidAskRoomContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource });

function assertPaidAskOutcomeRouterContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource }) {
  requireAll(
    appHtml,
    [
      "data-paid-ask-outcome-router",
      "Paid ask outcome router",
      "Route a paid-ask rehearsal outcome into exactly one safe next action.",
      "data-paid-ask-router-sources",
      "data-paid-ask-router-packet",
      "data-paid-ask-router-routes",
      "data-paid-ask-router-states",
      "data-paid-ask-router-claims",
      "data-paid-ask-router-gates",
      "data-export-paid-ask-router-json",
      "data-export-paid-ask-router-markdown",
      "liveFeedback: false",
      "willingnessToPay: false",
      "paymentIntent: false",
      "revenue: false",
      "product_paid_ask_packet_or_proof_repair",
    ],
    "paid ask outcome router HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-paid-ask-outcome-router-v1",
      "PAID_ASK_OUTCOME_ROUTER_FORMAT",
      "buildPaidAskOutcomeRouter",
      "renderPaidAskOutcomeRouter",
      "paidAskOutcomeRouterMarkdown",
      "paidAskOutcomeRouterCases",
      "paidAskOutcomeRouterClaimFlags",
      "sampleReadiness: true",
      "ownerApprovedRedactedEvidence: false",
      "liveFeedback: false",
      "willingnessToPay: false",
      "paymentIntent: false",
      "payment: false",
      "publicProof: false",
      "referralOrTestimonial: false",
      "revenue: false",
      "exactlyOneSelectedRoute: true",
      "noDownstreamQueueMutation: true",
      "noDelegatedCompletionClaim: true",
      "queueMutationAllowed: false",
      "paymentOrCustomerDataHandlingAllowed: false",
      "providerActionAllowed: false",
    ],
    "paid ask outcome router JS contract"
  );

  requireAll(
    adminHtml,
    [
      "paid-ask-outcome-router",
      "Exactly-One Outcome, No Queue Mutation",
      "paid-ask-router-summary",
      "paid-ask-router-route",
      "paid-ask-router-grid",
    ],
    "paid ask outcome router admin HTML contract"
  );

  requireAll(
    adminJs,
    [
      "renderPaidAskOutcomeRouter",
      "paidAskOutcomeRouter",
      "Route packet",
      "Unsupported claim flags",
      "Evidence state legend",
    ],
    "paid ask outcome router admin JS contract"
  );

  requireAll(
    adminDataBuilderSource,
    [
      "buildPaidAskOutcomeRouterVisibility",
      "paid-ask-outcome-router.sample.json",
      "paidAskOutcomeRouter",
      "canClaimLiveFeedback: false",
      "canClaimWillingnessToPay: false",
      "canClaimPaymentIntent: false",
      "canClaimRevenue: false",
    ],
    "paid ask outcome router admin data contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertPaidAskOutcomeRouter",
      "check_paid_ask_outcome_router.cjs",
      "paid-ask-outcome-router.sample.json",
    ],
    "paid ask outcome router QA wiring"
  );
}

assertPaidAskOutcomeRouterContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource });

function assertPaidAskProofPacketClarityRepairContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource }) {
  const appSurfaceCount = (appHtml.match(/data-paid-ask-proof-packet-clarity-repair/g) || []).length;
  if (appSurfaceCount !== 1) {
    throw new Error(`Expected exactly one paid ask proof packet clarity repair app surface, found ${appSurfaceCount}.`);
  }

  requireAll(
    appHtml,
    [
      "data-paid-ask-proof-packet-clarity-repair",
      "Paid ask clarity repair",
      "Repair proof, packet mechanics, and approval controls before live use.",
      "data-paid-ask-clarity-repairs",
      "data-paid-ask-clarity-controls",
      "data-paid-ask-clarity-stop-copy",
      "data-paid-ask-clarity-packet",
      "data-paid-ask-clarity-claims",
      "data-export-paid-ask-clarity-json",
      "data-export-paid-ask-clarity-markdown",
      "business_private_paid_packet_discussion_no_checkout",
    ],
    "paid ask proof packet clarity repair HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-paid-ask-proof-packet-clarity-repair-v1",
      "PAID_ASK_PROOF_PACKET_CLARITY_REPAIR_FORMAT",
      "buildPaidAskProofPacketClarityRepair",
      "renderPaidAskProofPacketClarityRepair",
      "paidAskProofPacketClarityRepairMarkdown",
      "paidAskProofPacketClarityRepairs",
      "paidAskProofPacketApprovalControls",
      "business_private_paid_packet_discussion_no_checkout",
      "exactlyOneSafeNextRoute: true",
      "noPaymentLinkOrCheckoutDisplay: true",
      "queueMutationAllowed: false",
      "paymentOrCustomerDataHandlingAllowed: false",
    ],
    "paid ask proof packet clarity repair JS contract"
  );

  requireAll(
    adminHtml,
    [
      "paid-ask-proof-packet-clarity-repair",
      "Proof, Packet Mechanics, and Approval Controls",
      "paid-ask-clarity-summary",
      "paid-ask-clarity-route",
      "paid-ask-clarity-grid",
    ],
    "paid ask proof packet clarity repair admin HTML contract"
  );

  requireAll(
    adminJs,
    [
      "renderPaidAskProofPacketClarityRepair",
      "paidAskProofPacketClarityRepair",
      "Clarity repairs",
      "Approval controls",
      "Stop copy",
      "Unsupported claim flags",
    ],
    "paid ask proof packet clarity repair admin JS contract"
  );

  requireAll(
    adminDataBuilderSource,
    [
      "buildPaidAskProofPacketClarityRepairVisibility",
      "paid-ask-proof-packet-clarity-repair.sample.json",
      "paidAskProofPacketClarityRepair",
      "canDisplayPaymentLink: false",
      "canCollectPayment: false",
      "canClaimRevenue: false",
    ],
    "paid ask proof packet clarity repair admin data contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertPaidAskProofPacketClarityRepair",
      "check_paid_ask_proof_packet_clarity_repair.cjs",
      "paid-ask-proof-packet-clarity-repair.sample.json",
    ],
    "paid ask proof packet clarity repair QA wiring"
  );
}

assertPaidAskProofPacketClarityRepairContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource });

function assertPaidAskObjectionResponseSimulatorContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource }) {
  const appSurfaceCount = (appHtml.match(/data-paid-ask-objection-response-simulator/g) || []).length;
  if (appSurfaceCount !== 1) {
    throw new Error(`Expected exactly one paid ask objection response simulator app surface, found ${appSurfaceCount}.`);
  }

  requireAll(
    appHtml,
    [
      "data-paid-ask-objection-response-simulator",
      "Paid ask objection simulator",
      "Rehearse safe responses before any live paid ask is trusted.",
      "data-paid-ask-objection-simulator-objections",
      "data-paid-ask-objection-simulator-responses",
      "data-paid-ask-objection-simulator-repairs",
      "data-paid-ask-objection-simulator-routes",
      "data-paid-ask-objection-simulator-gates",
      "data-paid-ask-objection-simulator-states",
      "data-paid-ask-objection-simulator-claims",
      "data-export-paid-ask-objection-simulator-json",
      "data-export-paid-ask-objection-simulator-markdown",
      "product_missing_proof_response_repair",
    ],
    "paid ask objection response simulator HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-paid-ask-objection-response-simulator-v1",
      "PAID_ASK_OBJECTION_RESPONSE_SIMULATOR_FORMAT",
      "buildPaidAskObjectionResponseSimulator",
      "renderPaidAskObjectionResponseSimulator",
      "paidAskObjectionResponseSimulatorMarkdown",
      "paidAskObjectionResponseStates",
      "exactlyOneRoutePerObjection: true",
      "allExamplesSampleRedactedOnly: true",
      "noPaymentLinkOrCheckoutDisplay: true",
      "product_missing_proof_response_repair",
    ],
    "paid ask objection response simulator JS contract"
  );

  requireAll(
    adminHtml,
    [
      "paid-ask-objection-response-simulator",
      "Safe Response Copy, Blocking Gates, One Route",
      "paid-ask-objection-simulator-summary",
      "paid-ask-objection-simulator-route",
      "paid-ask-objection-simulator-grid",
    ],
    "paid ask objection response simulator admin HTML contract"
  );

  requireAll(
    adminJs,
    [
      "renderPaidAskObjectionResponseSimulator",
      "paidAskObjectionResponseSimulator",
      "Operator-safe response copy",
      "Exactly one route per objection",
      "Unsupported claim flags",
    ],
    "paid ask objection response simulator admin JS contract"
  );

  requireAll(
    adminDataBuilderSource,
    [
      "buildPaidAskObjectionResponseSimulatorVisibility",
      "paid-ask-objection-response-simulator.sample.json",
      "paidAskObjectionResponseSimulator",
      "canDisplayPaymentLink: false",
      "canCollectPayment: false",
      "canClaimRevenue: false",
    ],
    "paid ask objection response simulator admin data contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertPaidAskObjectionResponseSimulator",
      "check_paid_ask_objection_response_simulator.cjs",
      "paid-ask-objection-response-simulator.sample.json",
    ],
    "paid ask objection response simulator QA wiring"
  );
}

assertPaidAskObjectionResponseSimulatorContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource });

function assertFirstPaidPilotHandoffRoomContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource }) {
  const appSurfaceCount = (appHtml.match(/data-first-paid-pilot-handoff-room/g) || []).length;
  if (appSurfaceCount !== 1) {
    throw new Error(`Expected exactly one first paid pilot handoff room app surface, found ${appSurfaceCount}.`);
  }

  requireAll(
    appHtml,
    [
      "data-first-paid-pilot-handoff-room",
      "First paid pilot handoff",
      "data-first-paid-pilot-handoff-value",
      "data-first-paid-pilot-handoff-proof",
      "data-first-paid-pilot-handoff-deliverables",
      "data-first-paid-pilot-handoff-gates",
      "data-first-paid-pilot-handoff-owner-fields",
      "data-export-first-paid-pilot-handoff-json",
      "owner_first_paid_pilot_go_no_go_packet",
    ],
    "first paid pilot handoff room HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-first-paid-pilot-handoff-room-v1",
      "FIRST_PAID_PILOT_HANDOFF_ROOM_FORMAT",
      "buildFirstPaidPilotHandoffRoom",
      "renderFirstPaidPilotHandoffRoom",
      "firstPaidPilotHandoffRoomMarkdown",
      "owner_first_paid_pilot_go_no_go_packet",
      "exactlyOneOwnerGoNoGoPacket: true",
      "noPaymentLinkOrCheckoutDisplay: true",
      "queueMutationAllowed: false",
      "paymentOrCustomerDataHandlingAllowed: false",
    ],
    "first paid pilot handoff room JS contract"
  );

  requireAll(
    adminHtml,
    [
      "first-paid-pilot-handoff-room",
      "Owner Go/No-Go, Gates, and Receipt",
      "first-paid-pilot-handoff-summary",
      "first-paid-pilot-handoff-route",
      "first-paid-pilot-handoff-grid",
    ],
    "first paid pilot handoff room admin HTML contract"
  );

  requireAll(
    adminJs,
    [
      "renderFirstPaidPilotHandoffRoom",
      "firstPaidPilotHandoffRoom",
      "Exactly one owner go/no-go packet",
      "Pilot value",
      "Owner fields",
      "Unsupported claim flags",
    ],
    "first paid pilot handoff room admin JS contract"
  );

  requireAll(
    adminDataBuilderSource,
    [
      "buildFirstPaidPilotHandoffRoomVisibility",
      "first-paid-pilot-handoff-room.sample.json",
      "firstPaidPilotHandoffRoom",
      "canDisplayPaymentLink: false",
      "canCollectPayment: false",
      "canClaimRevenue: false",
    ],
    "first paid pilot handoff room admin data contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertFirstPaidPilotHandoffRoom",
      "check_first_paid_pilot_handoff_room.cjs",
      "first-paid-pilot-handoff-room.sample.json",
    ],
    "first paid pilot handoff room QA wiring"
  );
}

assertFirstPaidPilotHandoffRoomContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource });

function assertFirstPaidPilotGateSimulatorContract({ adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource }) {
  requireAll(
    adminHtml,
    [
      "first-paid-pilot-gate-simulator",
      "First Paid Pilot Gate Simulator",
      "Gate States, Owner Repair Ask, No Live Actions",
      "first-paid-pilot-gate-summary",
      "first-paid-pilot-gate-route",
      "first-paid-pilot-gate-grid",
    ],
    "first paid pilot gate simulator admin HTML contract"
  );

  requireAll(
    adminJs,
    [
      "renderFirstPaidPilotGateSimulator",
      "firstPaidPilotGateSimulator",
      "Gate states",
      "Owner repair ask",
      "Blocked external actions",
      "Unsupported claim flags",
    ],
    "first paid pilot gate simulator admin JS contract"
  );

  requireAll(
    adminDataBuilderSource,
    [
      "buildFirstPaidPilotGateSimulatorVisibility",
      "first-paid-pilot-gate-simulator.sample.json",
      "firstPaidPilotGateSimulator",
      "canDisplayPaymentLink: false",
      "canCollectPayment: false",
      "canStoreProductionCustomerData: false",
      "canClaimRevenue: false",
    ],
    "first paid pilot gate simulator admin data contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertFirstPaidPilotGateSimulator",
      "check_first_paid_pilot_gate_simulator.cjs",
      "first-paid-pilot-gate-simulator.sample.json",
    ],
    "first paid pilot gate simulator QA wiring"
  );
}

assertFirstPaidPilotGateSimulatorContract({ adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource });

function assertFirstDollarReadinessRoomContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource }) {
  requireAll(
    appHtml,
    [
      "data-first-dollar-readiness-room",
      "First dollar readiness",
      "data-first-dollar-readiness-proof",
      "data-first-dollar-readiness-deliverables",
      "data-first-dollar-readiness-questions",
      "data-first-dollar-readiness-gate",
      "data-first-dollar-readiness-route",
      "data-export-first-dollar-readiness-json",
      "approval_unblocker_first_dollar_owner_evidence_repair",
    ],
    "first dollar readiness room app HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-first-dollar-readiness-room-v1",
      "FIRST_DOLLAR_READINESS_ROOM_FORMAT",
      "buildFirstDollarReadinessRoom",
      "renderFirstDollarReadinessRoom",
      "firstDollarReadinessRoomMarkdown",
      "approval_unblocker_first_dollar_owner_evidence_repair",
      "exactlyOneSelectedRoute: true",
      "noPaymentLinkOrCheckoutDisplay: true",
      "queueMutationAllowed: false",
    ],
    "first dollar readiness room app JS contract"
  );

  requireAll(
    adminHtml,
    [
      "first-dollar-readiness-room",
      "First Dollar Readiness Room",
      "Proof, Packet, First Blocking Gate, One Route",
      "first-dollar-readiness-summary",
      "first-dollar-readiness-route",
      "first-dollar-readiness-grid",
    ],
    "first dollar readiness room admin HTML contract"
  );

  requireAll(
    adminJs,
    [
      "renderFirstDollarReadinessRoom",
      "firstDollarReadinessRoom",
      "First blocking gate",
      "Exactly one first-dollar route",
      "Readiness questions",
      "Unsupported first-dollar claims",
    ],
    "first dollar readiness room admin JS contract"
  );

  requireAll(
    adminDataBuilderSource,
    [
      "buildFirstDollarReadinessRoomVisibility",
      "first-dollar-readiness-room.sample.json",
      "firstDollarReadinessRoom",
      "canDisplayPaymentLink: false",
      "canCollectPayment: false",
      "canStoreProductionCustomerData: false",
      "canClaimRevenue: false",
    ],
    "first dollar readiness room admin data contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertFirstDollarReadinessRoom",
      "check_first_dollar_readiness_room.cjs",
      "first-dollar-readiness-room.sample.json",
    ],
    "first dollar readiness room QA wiring"
  );
}

assertFirstDollarReadinessRoomContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource });


function assertFirstDollarOwnerEvidenceRepairRoomContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource }) {
  requireAll(
    appHtml,
    [
      "data-first-dollar-owner-evidence-repair-room",
      "First dollar owner evidence",
      "data-first-dollar-owner-evidence-fields",
      "data-first-dollar-owner-evidence-gate",
      "data-first-dollar-owner-evidence-route",
      "data-export-first-dollar-owner-evidence-json",
      "data-export-first-dollar-owner-evidence-markdown",
      "approval_unblocker_owner_evidence_repair",
    ],
    "first dollar owner evidence repair room app HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-first-dollar-owner-evidence-repair-room-v1",
      "FIRST_DOLLAR_OWNER_EVIDENCE_REPAIR_ROOM_FORMAT",
      "buildFirstDollarOwnerEvidenceRepairRoom",
      "renderFirstDollarOwnerEvidenceRepairRoom",
      "firstDollarOwnerEvidenceRepairRoomMarkdown",
      "approval_unblocker_owner_evidence_repair",
      "noPaymentLinkOrCheckoutDisplay: true",
      "queueMutationAllowed: false",
    ],
    "first dollar owner evidence repair room app JS contract"
  );

  requireAll(
    adminHtml,
    [
      "first-dollar-owner-evidence-repair-room",
      "First Dollar Owner Evidence Repair Room",
      "Owner Fields, First Gate, One Route",
      "first-dollar-owner-evidence-summary",
      "first-dollar-owner-evidence-route",
      "first-dollar-owner-evidence-grid",
    ],
    "first dollar owner evidence repair room admin HTML contract"
  );

  requireAll(
    adminJs,
    [
      "renderFirstDollarOwnerEvidenceRepairRoom",
      "firstDollarOwnerEvidenceRepairRoom",
      "Owner evidence fields",
      "First blocking gate",
      "Exactly one owner-evidence route",
      "Unsupported first-dollar claims",
    ],
    "first dollar owner evidence repair room admin JS contract"
  );

  requireAll(
    adminDataBuilderSource,
    [
      "buildFirstDollarOwnerEvidenceRepairRoomVisibility",
      "first-dollar-owner-evidence-repair-room.sample.json",
      "firstDollarOwnerEvidenceRepairRoom",
      "canDisplayPaymentLink: false",
      "canCollectPayment: false",
      "canStoreProductionCustomerData: false",
      "canClaimRevenue: false",
    ],
    "first dollar owner evidence repair room admin data contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertFirstDollarOwnerEvidenceRepairRoom",
      "check_first_dollar_owner_evidence_repair_room.cjs",
      "first-dollar-owner-evidence-repair-room.sample.json",
    ],
    "first dollar owner evidence repair room QA wiring"
  );
}

assertFirstDollarOwnerEvidenceRepairRoomContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource });


function assertFirstPaidPilotFulfillmentReceiptPreviewContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource }) {
  requireAll(
    appHtml,
    [
      "data-first-paid-pilot-fulfillment-receipt-preview",
      "Fulfillment receipt preview",
      "data-fulfillment-receipt-deliverables",
      "data-fulfillment-receipt-proof-delta",
      "data-fulfillment-receipt-data-path",
      "data-fulfillment-receipt-source-custody",
      "data-fulfillment-receipt-unsupported",
      "data-fulfillment-receipt-route",
      "data-export-fulfillment-receipt-json",
      "approval_unblocker_first_paid_receipt_owner_evidence_repair",
    ],
    "first paid pilot fulfillment receipt preview app HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-first-paid-pilot-fulfillment-receipt-preview-v1",
      "FIRST_PAID_PILOT_FULFILLMENT_RECEIPT_PREVIEW_FORMAT",
      "buildFirstPaidPilotFulfillmentReceiptPreview",
      "renderFirstPaidPilotFulfillmentReceiptPreview",
      "firstPaidPilotFulfillmentReceiptPreviewMarkdown",
      "approval_unblocker_first_paid_receipt_owner_evidence_repair",
      "exactlyOneSelectedRoute: true",
      "noPaymentLinkOrCheckoutDisplay: true",
      "queueMutationAllowed: false",
    ],
    "first paid pilot fulfillment receipt preview app JS contract"
  );

  requireAll(
    adminHtml,
    [
      "first-paid-pilot-fulfillment-receipt-preview",
      "Fulfillment Receipt Preview",
      "Deliverables, Proof Delta, Data Path, One Route",
      "fulfillment-receipt-summary",
      "fulfillment-receipt-route",
      "fulfillment-receipt-grid",
    ],
    "first paid pilot fulfillment receipt preview admin HTML contract"
  );

  requireAll(
    adminJs,
    [
      "renderFirstPaidPilotFulfillmentReceiptPreview",
      "Exactly one receipt route",
      "Receipt deliverables",
      "Unsupported receipt claims",
    ],
    "first paid pilot fulfillment receipt preview admin JS contract"
  );

  requireAll(
    adminDataBuilderSource,
    [
      "buildFirstPaidPilotFulfillmentReceiptPreviewVisibility",
      "first-paid-pilot-fulfillment-receipt-preview.sample.json",
      "firstPaidPilotFulfillmentReceiptPreview",
      "canDisplayPaymentLink: false",
      "canCollectPayment: false",
      "canStoreProductionCustomerData: false",
      "canClaimRevenue: false",
    ],
    "first paid pilot fulfillment receipt preview admin data contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertFirstPaidPilotFulfillmentReceiptPreview",
      "check_first_paid_pilot_fulfillment_receipt_preview.cjs",
      "first-paid-pilot-fulfillment-receipt-preview.sample.json",
    ],
    "first paid pilot fulfillment receipt preview QA wiring"
  );
}

assertFirstPaidPilotFulfillmentReceiptPreviewContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource });

function assertLiveToPaidPilotDecisionRoomContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource }) {
  requireAll(
    appHtml,
    [
      "data-live-to-paid-pilot-decision-room",
      "Live session to paid pilot decision room",
      "data-live-to-paid-pilot-decision-gates",
      "data-live-to-paid-pilot-decision-evidence",
      "data-live-to-paid-pilot-decision-routes",
      "data-live-to-paid-pilot-decision-blocked",
      "data-export-live-to-paid-pilot-decision-json",
      "product_repair_before_paid_pilot_ask",
    ],
    "live to paid pilot decision room app HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-live-to-paid-pilot-decision-room-v1",
      "LIVE_TO_PAID_PILOT_DECISION_ROOM_FORMAT",
      "buildLiveToPaidPilotDecisionRoom",
      "renderLiveToPaidPilotDecisionRoom",
      "liveToPaidPilotDecisionRoomMarkdown",
      "product_repair_before_paid_pilot_ask",
      "gateStateSeparation: true",
      "evidenceStateSeparation: true",
      "queueMutationAllowed: false",
    ],
    "live to paid pilot decision room app JS contract"
  );

  requireAll(
    adminHtml,
    [
      "live-to-paid-pilot-decision-room",
      "Live to paid pilot decision",
      "Gates, Evidence States, One Safe Route",
      "live-to-paid-pilot-decision-summary",
      "live-to-paid-pilot-decision-route",
      "live-to-paid-pilot-decision-grid",
    ],
    "live to paid pilot decision room admin HTML contract"
  );

  requireAll(
    adminJs,
    [
      "renderLiveToPaidPilotDecisionRoom",
      "Exactly one paid-pilot decision route",
      "Gate states",
      "Evidence states",
      "Blocked actions",
    ],
    "live to paid pilot decision room admin JS contract"
  );

  requireAll(
    adminDataBuilderSource,
    [
      "buildLiveToPaidPilotDecisionRoomVisibility",
      "live-to-paid-pilot-decision-room.sample.json",
      "liveToPaidPilotDecisionRoom",
      "canDisplayPaymentLink: false",
      "canCollectPayment: false",
      "canStoreProductionCustomerData: false",
      "canClaimRevenue: false",
    ],
    "live to paid pilot decision room admin data contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertLiveToPaidPilotDecisionRoom",
      "check_live_to_paid_pilot_decision_room.cjs",
      "live-to-paid-pilot-decision-room.sample.json",
    ],
    "live to paid pilot decision room QA wiring"
  );
}

assertLiveToPaidPilotDecisionRoomContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource });

function assertLiveProofTrustGapRepairRoomContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource }) {
  requireAll(
    appHtml,
    [
      "data-live-proof-trust-gap-repair-room",
      "Live proof audit trust gap repair room",
      "data-live-proof-trust-gap-repair-objections",
      "data-live-proof-trust-gap-repair-custody",
      "data-live-proof-trust-gap-repair-missing-proof",
      "data-live-proof-trust-gap-repair-stops",
      "data-export-live-proof-trust-gap-repair-json",
      "missing_proof_cue_repair",
    ],
    "live proof trust gap repair room app HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-live-proof-trust-gap-repair-room-v1",
      "LIVE_PROOF_TRUST_GAP_REPAIR_ROOM_FORMAT",
      "buildLiveProofTrustGapRepairRoom",
      "renderLiveProofTrustGapRepairRoom",
      "liveProofTrustGapRepairRoomMarkdown",
      "product_repair_before_paid_pilot_ask",
      "missing_proof_cue_repair",
      "trustGapVisible: true",
      "proofSourceCustodyVisible: true",
      "missingProofPromptsVisible: true",
      "queueMutationAllowed: false",
    ],
    "live proof trust gap repair room app JS contract"
  );

  requireAll(
    adminHtml,
    [
      "live-proof-trust-gap-repair-room",
      "Live proof trust repair",
      "Objections, Custody, Missing Proof, One Route",
      "live-proof-trust-gap-repair-summary",
      "live-proof-trust-gap-repair-route",
      "live-proof-trust-gap-repair-grid",
    ],
    "live proof trust gap repair room admin HTML contract"
  );

  requireAll(
    adminJs,
    [
      "renderLiveProofTrustGapRepairRoom",
      "Exactly one trust repair route",
      "Trust and privacy objections",
      "Proof-source custody",
      "Missing proof prompts",
      "Stop states",
    ],
    "live proof trust gap repair room admin JS contract"
  );

  requireAll(
    adminDataBuilderSource,
    [
      "buildLiveProofTrustGapRepairRoomVisibility",
      "live-proof-trust-gap-repair-room.sample.json",
      "liveProofTrustGapRepairRoom",
      "canDisplayPaymentLink: false",
      "canCollectPayment: false",
      "canStoreProductionCustomerData: false",
      "canClaimRevenue: false",
    ],
    "live proof trust gap repair room admin data contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertLiveProofTrustGapRepairRoom",
      "check_live_proof_trust_gap_repair_room.cjs",
      "live-proof-trust-gap-repair-room.sample.json",
    ],
    "live proof trust gap repair room QA wiring"
  );
}

assertLiveProofTrustGapRepairRoomContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource });

function assertLiveProofMissingProofCueRepairContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource }) {
  requireAll(
    appHtml,
    [
      "data-live-proof-missing-proof-cue-repair",
      "Live proof audit missing-proof cue repair",
      "data-live-proof-missing-proof-cue-gaps",
      "data-live-proof-missing-proof-cue-scoring",
      "data-live-proof-missing-proof-cue-prompts",
      "data-export-live-proof-missing-proof-cue-json",
      "business_no_send_follow_up",
    ],
    "live proof missing-proof cue repair app HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-live-proof-missing-proof-cue-repair-v1",
      "LIVE_PROOF_MISSING_PROOF_CUE_REPAIR_FORMAT",
      "buildLiveProofMissingProofCueRepair",
      "renderLiveProofMissingProofCueRepair",
      "liveProofMissingProofCueRepairMarkdown",
      "prioritizedProofGaps",
      "ownerFacingFollowUpPrompts",
      "business_no_send_follow_up",
      "proofGapsPrioritized: true",
      "ownerPromptsCategoryOnly: true",
      "queueMutationAllowed: false",
    ],
    "live proof missing-proof cue repair app JS contract"
  );

  requireAll(
    adminHtml,
    [
      "live-proof-missing-proof-cue-repair",
      "Missing-proof cue repair",
      "Prioritized Gaps, Owner Prompts, One Route",
      "live-proof-missing-proof-cue-summary",
      "live-proof-missing-proof-cue-route",
      "live-proof-missing-proof-cue-grid",
    ],
    "live proof missing-proof cue repair admin HTML contract"
  );

  requireAll(
    adminJs,
    [
      "renderLiveProofMissingProofCueRepair",
      "Exactly one missing-proof cue route",
      "Prioritized proof gaps",
      "Owner follow-up prompts",
      "Priority model",
    ],
    "live proof missing-proof cue repair admin JS contract"
  );

  requireAll(
    adminDataBuilderSource,
    [
      "buildLiveProofMissingProofCueRepairVisibility",
      "live-proof-missing-proof-cue-repair.sample.json",
      "liveProofMissingProofCueRepair",
      "canDisplayPaymentLink: false",
      "canCollectPayment: false",
      "canStoreProductionCustomerData: false",
      "canClaimRevenue: false",
    ],
    "live proof missing-proof cue repair admin data contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertLiveProofMissingProofCueRepair",
      "check_live_proof_missing_proof_cue_repair.cjs",
      "live-proof-missing-proof-cue-repair.sample.json",
    ],
    "live proof missing-proof cue repair QA wiring"
  );
}

assertLiveProofMissingProofCueRepairContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource });

function assertPaidPilotTrustGapRepairLabContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource }) {
  requireAll(
    appHtml,
    [
      "data-paid-pilot-trust-gap-repair-lab",
      "Paid pilot trust objection close lab",
      "data-paid-pilot-trust-gap-lab-gaps",
      "data-paid-pilot-trust-gap-lab-prompts",
      "data-export-paid-pilot-trust-gap-lab-json",
      "business_no_send_owner_prospect_prep",
    ],
    "paid pilot trust gap repair lab app HTML contract"
  );
  requireAll(
    appJs,
    [
      "proofresume-paid-pilot-trust-gap-repair-lab-v1",
      "PAID_PILOT_TRUST_GAP_REPAIR_LAB_FORMAT",
      "buildPaidPilotTrustGapRepairLab",
      "renderPaidPilotTrustGapRepairLab",
      "paidPilotTrustGapRepairLabMarkdown",
      "proofStrengthGaps",
      "operatorSafeRepairPrompts",
      "business_no_send_owner_prospect_prep",
      "noUnsupportedFeedbackOrRevenueClaims: true",
    ],
    "paid pilot trust gap repair lab app JS contract"
  );
  requireAll(
    adminHtml,
    [
      "paid-pilot-trust-gap-repair-lab",
      "Paid pilot trust lab",
      "Proof Gaps, Safe Responses, One Route",
      "paid-pilot-trust-gap-lab-summary",
      "paid-pilot-trust-gap-lab-route",
      "paid-pilot-trust-gap-lab-grid",
    ],
    "paid pilot trust gap repair lab admin HTML contract"
  );
  requireAll(
    adminJs,
    ["renderPaidPilotTrustGapRepairLab", "Exactly one paid-pilot trust route", "Proof-strength gaps", "Safe repair prompts", "Disqualifiers"],
    "paid pilot trust gap repair lab admin JS contract"
  );
  requireAll(
    adminDataBuilderSource,
    ["buildPaidPilotTrustGapRepairLabVisibility", "paid-pilot-trust-gap-repair-lab.sample.json", "paidPilotTrustGapRepairLab", "canCollectPayment: false", "canClaimRevenue: false"],
    "paid pilot trust gap repair lab admin data contract"
  );
  requireAll(
    qaTargetJobPackSource,
    ["assertPaidPilotTrustGapRepairLab", "check_paid_pilot_trust_gap_repair_lab.cjs", "paid-pilot-trust-gap-repair-lab.sample.json"],
    "paid pilot trust gap repair lab QA wiring"
  );
}

assertPaidPilotTrustGapRepairLabContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource });

function assertProofDeltaValueSnapshotContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource }) {
  requireAll(
    appHtml,
    ["data-proof-delta-value-snapshot", "Proof delta value snapshot", "data-proof-delta-value-bullets", "data-proof-delta-value-missing", "data-export-proof-delta-value-json", "business_no_send_follow_up"],
    "proof delta value snapshot app HTML contract"
  );
  requireAll(
    appJs,
    ["proofresume-proof-delta-value-snapshot-v1", "PROOF_DELTA_VALUE_SNAPSHOT_FORMAT", "buildProofDeltaValueSnapshot", "renderProofDeltaValueSnapshot", "proofDeltaValueSnapshotMarkdown", "proofDeltas", "evidenceStatesSeparated: true"],
    "proof delta value snapshot app JS contract"
  );
  requireAll(
    adminHtml,
    ["proof-delta-value-snapshot", "Proof delta", "Before, After, Evidence, One Route", "proof-delta-value-summary", "proof-delta-value-route", "proof-delta-value-grid"],
    "proof delta value snapshot admin HTML contract"
  );
  requireAll(adminJs, ["renderProofDeltaValueSnapshot", "Exactly one proof-delta route", "Proof deltas", "Evidence states"], "proof delta value snapshot admin JS contract");
  requireAll(adminDataBuilderSource, ["buildProofDeltaValueSnapshotVisibility", "proof-delta-value-snapshot.sample.json", "proofDeltaValueSnapshot", "canClaimRevenue: false"], "proof delta value snapshot admin data contract");
  requireAll(qaTargetJobPackSource, ["assertProofDeltaValueSnapshot", "check_proof_delta_value_snapshot.cjs", "proof-delta-value-snapshot.sample.json"], "proof delta value snapshot QA wiring");
}

assertProofDeltaValueSnapshotContract({ appHtml, appJs, adminHtml, adminJs, adminDataBuilderSource, qaTargetJobPackSource });

function assertPostPreviewQaCoverageHarnessContract({ appHtml, adminHtml, qaTargetJobPackSource }) {
  const artifacts = [
    {
      fixture: "ops/product/first-audit-command-room.sample.json",
      checker: "ops/product/check_first_audit_command_room.cjs",
      format: "proofresume-first-audit-command-room-v1",
    },
    {
      fixture: "ops/product/first-audit-result-export-packet.sample.json",
      checker: "ops/product/check_first_audit_result_export_packet.cjs",
      format: "proofresume-first-audit-result-export-packet-v1",
    },
    {
      fixture: "ops/product/first-authorized-session-runner.sample.json",
      checker: "ops/product/check_first_authorized_session_runner.cjs",
      format: "proofresume-first-authorized-session-runner-v1",
      surfaceTokens: ["first-authorized-session-runner", "First authorized session runner"],
      surfaceSource: adminHtml,
    },
    {
      fixture: "ops/product/first-session-repair-room.sample.json",
      checker: "ops/product/check_first_session_repair_room.cjs",
      format: "proofresume-first-session-repair-room-v1",
    },
    {
      fixture: "ops/product/first-session-packet-replay-harness.sample.json",
      checker: "ops/product/check_first_session_packet_replay_harness.cjs",
      format: "proofresume-first-session-packet-replay-harness-v1",
    },
    {
      fixture: "ops/product/first-customer-pilot-console.sample.json",
      checker: "ops/product/check_first_customer_pilot_console.cjs",
      format: "proofresume-first-customer-pilot-console-v1",
      surfaceTokens: ["first-customer-pilot-console", "First customer pilot console"],
      surfaceSource: adminHtml,
    },
    {
      fixture: "ops/product/first-customer-pilot-revenue-simulator.sample.json",
      checker: "ops/product/check_first_customer_pilot_revenue_simulator.cjs",
      format: "proofresume-first-customer-pilot-revenue-simulator-v1",
      surfaceTokens: ["pilot-revenue-simulator", "Pilot revenue simulator"],
      surfaceSource: adminHtml,
    },
    {
      fixture: "ops/product/first-customer-pilot-workspace-walkthrough.sample.json",
      checker: "ops/product/check_first_customer_pilot_workspace_walkthrough.cjs",
      format: "proofresume-first-customer-pilot-workspace-walkthrough-v1",
      surfaceTokens: ["data-workspace-journey", "paid-preview handoff"],
      surfaceSource: appHtml,
    },
    {
      fixture: "ops/product/paid-packet-customer-preview.sample.json",
      checker: "ops/product/check_paid_packet_customer_preview.cjs",
      format: "proofresume-paid-packet-customer-preview-v1",
      surfaceTokens: ["data-paid-packet-customer-preview", "No-checkout Target Job Proof Packet preview"],
      surfaceSource: appHtml,
    },
    {
      fixture: "ops/product/first-session-objection-to-repair-wizard.sample.json",
      checker: "ops/product/check_first_session_objection_to_repair_wizard.cjs",
      format: "proofresume-first-session-objection-to-repair-wizard-v1",
      surfaceTokens: ["data-first-session-objection-repair-wizard", "Objection repair wizard"],
      surfaceSource: appHtml,
    },
    {
      fixture: "ops/product/first-customer-concierge-demo-bundle.sample.json",
      checker: "ops/product/check_first_customer_concierge_demo_bundle.cjs",
      format: "proofresume-first-customer-concierge-demo-bundle-v1",
      surfaceTokens: ["data-first-customer-concierge-demo-bundle", "Concierge demo bundle"],
      surfaceSource: appHtml,
    },
    {
      fixture: "ops/product/first-customer-reaction-route-recorder.sample.json",
      checker: "ops/product/check_first_customer_reaction_route_recorder.cjs",
      format: "proofresume-first-customer-reaction-route-recorder-v1",
      surfaceTokens: ["data-first-customer-reaction-route-recorder", "Reaction route recorder"],
      surfaceSource: appHtml,
    },
    {
      fixture: "ops/product/first-customer-evidence-inbox-room.sample.json",
      checker: "ops/product/check_first_customer_evidence_inbox_room.cjs",
      format: "proofresume-first-customer-evidence-inbox-room-v1",
      surfaceTokens: ["data-first-customer-evidence-inbox-room", "Evidence inbox room"],
      surfaceSource: appHtml,
    },
  ];
  const forbiddenEnabledActions = [
    "deploy",
    "outreachSend",
    "analyticsSend",
    "paymentLinkDisplay",
    "checkoutDisplay",
    "paymentCollection",
    "productionCustomerDataHandling",
    "publicProof",
    "autoApply",
    "applicationSubmission",
    "downstreamQueueMutation",
  ];
  const unsupportedClaims = [
    "customerFeedbackObserved",
    "willingnessToPayObserved",
    "paymentIntentObserved",
    "paymentObserved",
    "publicProofObserved",
    "revenueObserved",
    "productionReady",
  ];

  for (const artifact of artifacts) {
    const fixture = readJsonIfExists(artifact.fixture);
    if (!fixture) throw new Error(`Post-preview QA fixture missing: ${artifact.fixture}`);
    if (!fs.existsSync(path.join(projectRoot, artifact.checker))) throw new Error(`Post-preview QA checker missing: ${artifact.checker}`);
    if (fixture.format !== artifact.format) throw new Error(`Post-preview QA fixture ${artifact.fixture} has unexpected format ${fixture.format}`);
    if (!qaTargetJobPackSource.includes(path.basename(artifact.checker))) {
      throw new Error(`qa:target-job-pack must execute ${artifact.checker}`);
    }

    const safety = fixture.repoSafety || {};
    if (safety.queueMutationAllowed !== false || safety.downstreamCompletionClaimAllowed !== false) {
      throw new Error(`Post-preview QA fixture ${artifact.fixture} must keep queue/downstream completion disabled.`);
    }
    if (!Array.isArray(safety.externalActionsPerformed) || safety.externalActionsPerformed.length) {
      throw new Error(`Post-preview QA fixture ${artifact.fixture} must record zero external actions.`);
    }
    if (!Array.isArray(safety.queueMutationsPerformed) || safety.queueMutationsPerformed.length) {
      throw new Error(`Post-preview QA fixture ${artifact.fixture} must record zero queue mutations.`);
    }
    for (const action of forbiddenEnabledActions) {
      if (Object.prototype.hasOwnProperty.call(safety.blockedActions || {}, action) && safety.blockedActions[action] !== false) {
        throw new Error(`Post-preview QA fixture ${artifact.fixture} enabled forbidden action ${action}.`);
      }
    }
    for (const claim of unsupportedClaims) {
      if (Object.prototype.hasOwnProperty.call(safety.unsupportedClaims || {}, claim) && safety.unsupportedClaims[claim] !== false) {
        throw new Error(`Post-preview QA fixture ${artifact.fixture} enabled unsupported claim ${claim}.`);
      }
    }
    if (artifact.surfaceTokens) {
      requireAll(artifact.surfaceSource || "", artifact.surfaceTokens, `post-preview QA surface ${artifact.fixture}`);
    }
  }
}

assertPostPreviewQaCoverageHarnessContract({ appHtml, adminHtml, qaTargetJobPackSource });

function assertWalkableFirstSessionObservabilityContract({ appHtml, appJs }) {
  requireAll(
    appHtml,
    [
      "First-session rehearsal",
      "Package the local prototype state for a feedback session",
      "data-first-session-handoff",
      "data-handoff-readiness",
      "data-handoff-boundary",
      "data-first-session-form",
      "data-save-first-session",
      "data-export-first-session-json",
      "data-export-first-session-markdown",
      "data-first-session-message",
      "data-handoff-summary",
      "data-handoff-proof-gaps",
      "data-handoff-preview",
      "Tester role or segment",
      "Objections",
      "Confusion points",
      "Proof-loop comprehension",
      "Trust in evidence",
      "Willingness to share materials",
      "Paid-packet interest signal",
      "Requested next action",
      "Export warns and redacts sensitive resume/contact data.",
      "Rehearsal evidence is sample/local only and creates no real feedback",
    ],
    "walkable first-session observability HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-first-session-handoff-v1",
      "FIRST_SESSION_HANDOFF_FORMAT",
      "emptyFirstSessionFeedback",
      "feedbackFromForm",
      "selectedHandoffJob",
      "handoffProofGaps",
      "buildFirstSessionHandoff",
      "firstSessionSummaryItems",
      "firstSessionMarkdown",
      "renderFirstSessionHandoff",
      "downloadLocalFile",
      "testerSegment",
      "proofLoopComprehension",
      "trustInEvidence",
      "objections",
      "strongestObjection",
      "confusionPoints",
      "willingnessToShareMaterials",
      "paidPacketInterest",
      "requestedNextAction",
      "redactedResumeText",
      "[redacted from first-session handoff export]",
      "contactRedacted: true",
      "noExternalSend: true",
      "noAnalyticsSend: true",
      "noProductionStorage: true",
      "noAutoApply: true",
      "noApplicationSubmission: true",
      "Resume text and contact details are intentionally excluded from this first-session handoff.",
      "Saved first-session rehearsal notes locally. Nothing was sent, scheduled, monetized, submitted, or stored in production.",
      "Exported redacted first-session rehearsal JSON locally. Resume text, contact details, raw materials, private replies, payment data, and credentials were excluded.",
      "Exported redacted first-session rehearsal Markdown locally. No network, analytics, scheduling, payment, send, storage, or apply action occurred.",
    ],
    "walkable first-session observability JS contract"
  );

  for (const forbidden of [/fetch\(/i, /XMLHttpRequest/i, /navigator\.sendBeacon/i, /\bproductionStorage\s*:\s*true/i, /\bnoApplicationSubmission\s*:\s*false/i]) {
    if (forbidden.test(appJs)) {
      throw new Error(`Walkable first-session observability must stay local-only and redacted: ${forbidden}`);
    }
  }
}

assertWalkableFirstSessionObservabilityContract({ appHtml, appJs });

function assertNorthstarFirstFeedbackSessionRehearsalContract({ appHtml, appJs }) {
  requireAll(
    appHtml,
    [
      "First-session rehearsal",
      "data-first-session-rehearsal",
      "data-rehearsal-boundaries",
      "data-rehearsal-mode",
      "Use demo, sample, old, or redacted material only",
      "No outreach, scheduling, public send, analytics send, payment link, application submission, or production customer-data storage.",
      "prospect names, contact details, raw resumes, private replies, payment data, credentials, and screenshots",
      "Export rehearsal evidence JSON",
      "Export rehearsal Markdown",
    ],
    "north-star first feedback session rehearsal HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-first-feedback-session-rehearsal-evidence-v1",
      "FIRST_SESSION_REHEARSAL_FORMAT",
      "buildFirstSessionRehearsalEvidence",
      "local_sample_rehearsal_only",
      "sampleOrRedactedOnly: true",
      "noRealCustomerMaterialsRequired: true",
      "noOutreach: true",
      "noScheduling: true",
      "noPublicSend: true",
      "noPaymentLink: true",
      "noProductionCustomerDataStorage: true",
      "realCustomerFeedbackObserved: false",
      "revenueEvidenceObserved: false",
      "externalActionsTaken: false",
      "forbiddenRepoVisibleArtifacts",
      "prospect names",
      "contact details",
      "raw resumes",
      "private replies",
      "payment data",
      "credentials",
      "customer materials",
      "screenshots",
      "Treat this as rehearsal readiness only.",
      "do not claim real feedback, willingness-to-pay, revenue, public proof, or customer outcome evidence",
    ],
    "north-star first feedback session rehearsal JS contract"
  );

  for (const forbidden of [
    /fetch\(/i,
    /XMLHttpRequest/i,
    /navigator\.sendBeacon/i,
    /\brealCustomerFeedbackObserved\s*:\s*true/i,
    /\brevenueEvidenceObserved\s*:\s*true/i,
    /\bexternalActionsTaken\s*:\s*true/i,
    /\bnoPaymentLink\s*:\s*false/i,
    /\bnoScheduling\s*:\s*false/i,
    /\bnoPublicSend\s*:\s*false/i,
    /\bnoProductionCustomerDataStorage\s*:\s*false/i,
  ]) {
    if (forbidden.test(appJs)) {
      throw new Error(`North-star first feedback session rehearsal must stay sample/local-only with no real evidence claim: ${forbidden}`);
    }
  }
}

assertNorthstarFirstFeedbackSessionRehearsalContract({ appHtml, appJs });

function assertWalkableTargetRolesPreferencesContract({ appHtml, appJs }) {
  requireAll(
    appHtml,
    [
      "Target preferences",
      "Save roles, seniority, location, industries, and constraints before matching jobs.",
      "data-target-preferences",
      "data-target-preferences-form",
      "data-preference-summary",
      "Primary target role",
      "Desired roles",
      "Seniority",
      "Location or remote preference",
      "Work mode",
      "Industries",
      "Must-have constraints",
      "Nice-to-have keywords",
      "No live sourcing runs here.",
    ],
    "walkable target roles preferences HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-target-preferences-v1",
      "TARGET_PREFERENCES_FORMAT",
      "emptyTargetPreferences",
      "normalizeTargetPreferences",
      "targetPreferenceSummaryItems",
      "data-preference-summary",
      "desiredRoles",
      "seniority",
      "workMode",
      "industries",
      "mustHaveConstraints",
      "niceToHaveKeywords",
      "preferenceMatches",
      "preferenceGaps",
      "Preference labels:",
      "Save target roles, seniority, location, and constraints before ranking matches.",
      "Target preferences saved locally and will influence fit labels, proof gaps, and next actions.",
      "noLiveSourcing: true",
      "noExternalFetch: true",
    ],
    "walkable target roles preferences JS contract"
  );
}

assertWalkableTargetRolesPreferencesContract({ appHtml, appJs });

function assertWalkableDemoJobPipelineContract({ appHtml, appJs }) {
  requireAll(
    appHtml,
    [
      "Load demo matched pipeline",
      "Demo matches are generated locally from saved preferences",
      "data-load-demo-pipeline",
      "Local job pipeline",
      "Paste jobs, rank fit, then build a tailored packet.",
    ],
    "walkable demo job pipeline HTML contract"
  );

  requireAll(
    appJs,
    [
      "DEMO_JOB_SEEDS",
      "demoJobsForWorkspace",
      "sourceKind: \"demo-preference-seed\"",
      "demoGenerated: true",
      "noLiveSourcing: true",
      "Load the demo matched pipeline or paste local job posts",
      "Score uses imported resume text, saved preferences, local job text, and effort estimate.",
      "scoreDrivers",
      "Source context:",
      "Browser-local demo pipeline",
      "Loaded ${demoJobs.length} preference-aware demo jobs. They were generated locally; no live source was fetched.",
    ],
    "walkable demo job pipeline JS contract"
  );

  for (const forbidden of [/fetch\(/i, /XMLHttpRequest/i, /navigator\.sendBeacon/i, /\bscrape live\b/i, /\bauto apply\b/i]) {
    if (forbidden.test(appJs)) {
      throw new Error(`Walkable demo job pipeline must stay browser-local and source-disabled: ${forbidden}`);
    }
  }
}

assertWalkableDemoJobPipelineContract({ appHtml, appJs });

function assertNorthstarSeededDemoWalkthroughContract({ appHtml, appJs }) {
  requireAll(
    appHtml,
    [
      "Seeded demo walkthrough",
      "Load full demo walkthrough",
      "Reset to blank workspace",
      "data-load-demo-walkthrough",
      "data-reset-demo-workspace",
      "data-demo-walkthrough-message",
      "account, resume, preferences, matched jobs, packet,",
      "approval, edit, reject, tracking, proof-audit result, and paid-preview handoff screens",
      "Demo walkthrough data stays in this browser",
    ],
    "north-star seeded demo walkthrough HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-northstar-demo-walkthrough-v1",
      "NORTHSTAR_DEMO_WALKTHROUGH_FORMAT",
      "NORTHSTAR_DEMO_RESUME_TEXT",
      "NORTHSTAR_DEMO_TARGET_PREFERENCES",
      "signInNorthstarDemoIdentity",
      "seedNorthstarDemoWalkthrough",
      "resetNorthstarDemoWorkspace",
      "markNorthstarApplicationReady",
      "seeded-complete-local-loop",
      "blank-after-demo-reset",
      "northstar_demo_seeded",
      "application_marked_interviewing",
      "editSource: \"northstar-demo-walkthrough-seed\"",
      "noExternalFetch: true",
      "noOutboundSend: true",
      "noAnalyticsSend: true",
      "noProductionStorage: true",
      "noAutoApply: true",
      "Loaded the complete local demo walkthrough: account, resume, preferences, matches, tailored packet, approval, edit, reject controls, and tracking.",
      "Reset the demo state to a blank browser-local workspace. The local demo identity remains signed in.",
    ],
    "north-star seeded demo walkthrough JS contract"
  );

  for (const forbidden of [/fetch\(/i, /XMLHttpRequest/i, /navigator\.sendBeacon/i, /\bnoProductionStorage\s*:\s*false/i, /\bnoAutoApply\s*:\s*false/i]) {
    if (forbidden.test(appJs)) {
      throw new Error(`North-star seeded demo walkthrough must stay browser-local and no-send: ${forbidden}`);
    }
  }
}

assertNorthstarSeededDemoWalkthroughContract({ appHtml, appJs });

function assertNorthstarShareableProofAuditPacketContract({ appHtml, appJs }) {
  requireAll(
    appHtml,
    [
      "Shareable Target Job Proof Audit packet",
      "Preview a shareable Target Job Proof Audit.",
      "local export/share preview for a free Target Job Proof Audit",
      "Manual sharing is allowed only",
      "candidate consent and target-job approval",
      "no external submission, upload, analytics, payment,",
      "data-proof-audit-packet",
      "data-proof-audit-readiness",
      "data-proof-audit-boundary",
      "data-proof-audit-message",
      "data-proof-audit-fit",
      "data-proof-audit-summary",
      "data-proof-audit-claims",
      "data-proof-audit-gaps",
      "data-proof-audit-warnings",
      "data-proof-audit-cover-note",
      "data-proof-audit-preview",
      "data-export-proof-audit-json",
      "data-export-proof-audit-markdown",
      "Supported claims",
      "Proof gaps",
      "Do-not-invent warnings",
      "Cover note",
    ],
    "north-star shareable proof audit packet HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-target-job-proof-audit-packet-v1",
      "PROOF_AUDIT_PACKET_FORMAT",
      "buildProofAuditPacket",
      "proofAuditSummaryItems",
      "proofAuditMarkdown",
      "renderProofAuditPacket",
      "supportedClaims",
      "proofGaps",
      "doNotInventWarnings",
      "tailoredBullets",
      "coverNote",
      "nextRecommendedAction",
      "manualShareOnly: true",
      "requiresCandidateConsent: true",
      "noUpload: true",
      "noPaymentAction: true",
      "noExternalSend: true",
      "noAnalyticsSend: true",
      "noApplicationSubmission: true",
      "Browser-local proof audit preview.",
      "Manual share only after candidate consent and target-job approval.",
      "No network, upload, analytics, payment, send, auto-apply, or application action occurred.",
      "Exported local proof audit JSON. Manual sharing still requires candidate consent.",
      "Exported local proof audit Markdown. No network, upload, analytics, payment, send, or apply action occurred.",
    ],
    "north-star shareable proof audit packet JS contract"
  );

  for (const forbidden of [/fetch\(/i, /XMLHttpRequest/i, /navigator\.sendBeacon/i, /\bnoUpload\s*:\s*false/i, /\bnoPaymentAction\s*:\s*false/i, /\bnoApplicationSubmission\s*:\s*false/i]) {
    if (forbidden.test(appJs)) {
      throw new Error(`North-star shareable proof audit packet must stay local-only and no-send: ${forbidden}`);
    }
  }
}

assertNorthstarShareableProofAuditPacketContract({ appHtml, appJs });

function assertConsentedAuditHandoffPreviewContract({ appHtml, appJs, adminHtml, adminJs, adminCss, adminData, adminDataBuilderSource }) {
  requireAll(
    appHtml,
    [
      "Consented proof-audit handoff preview",
      "Review what a candidate would approve before a proof-audit session.",
      "data-consented-audit-handoff-preview",
      "data-consented-handoff-readiness",
      "data-consented-handoff-boundary",
      "data-consented-handoff-message",
      "data-consented-handoff-checks",
      "data-consented-handoff-custody",
      "data-consented-handoff-boundaries",
      "data-consented-handoff-next",
      "data-consented-handoff-preview-text",
      "data-export-consented-handoff-json",
      "data-export-consented-handoff-markdown",
      "Candidate consent required",
      "evidence custody",
      "candidate-visible next steps",
    ],
    "consented audit handoff app HTML contract"
  );

  requireAll(
    appJs,
    [
      "proofresume-consented-audit-handoff-preview-v1",
      "CONSENTED_AUDIT_HANDOFF_FORMAT",
      "buildConsentedAuditHandoffPreview",
      "consentedAuditHandoffChecks",
      "consentedAuditHandoffMarkdown",
      "renderConsentedAuditHandoffPreview",
      "requiresCandidateConsent: true",
      "requiresTargetJobApproval: true",
      "redactedExportOnly: true",
      "noExternalSend: true",
      "noOutreach: true",
      "noScheduling: true",
      "noPaymentLink: true",
      "noAnalyticsSend: true",
      "noPublicProof: true",
      "noTestimonialOrReferralRequest: true",
      "noProductionStorage: true",
      "noUpload: true",
      "noAutoApply: true",
      "noApplicationSubmission: true",
      "noCustomerFeedbackClaim: true",
      "noRevenueClaim: true",
      "Exported local consented handoff JSON. Candidate consent, target-job approval, and no-send boundaries still apply.",
      "Exported local consented handoff Markdown. No outreach, scheduling, payment, analytics, public proof, upload, send, or apply action occurred.",
    ],
    "consented audit handoff app JS contract"
  );

  requireAll(
    adminHtml,
    [
      "consented-audit-handoff",
      "consented-audit-handoff-state",
      "consented-audit-summary",
      "consented-audit-grid",
      "Manual-Share Preview Gates",
    ],
    "consented audit handoff admin HTML contract"
  );

  requireAll(
    adminJs,
    [
      "renderConsentedAuditHandoffPreview",
      "consentedAuditHandoffPreview",
      "Local manual-share preview only",
      "External actions",
    ],
    "consented audit handoff admin JS contract"
  );

  requireAll(
    adminCss,
    [
      "consented-audit-handoff",
      "consented-audit-summary",
      "consented-audit-grid",
      "consented-audit-card",
    ],
    "consented audit handoff admin styles"
  );

  requireAll(
    adminDataBuilderSource,
    [
      "buildConsentedAuditHandoffPreviewVisibility",
      "proofresume-consented-audit-handoff-preview-v1",
      "NORTHSTAR-CONSENTED-AUDIT-HANDOFF-PREVIEW",
      "queueMutationAllowed: false",
      "externalActionAllowed: false",
      "canDisplayPaymentLink: false",
      "canRequestTestimonialOrReferral: false",
      "canStoreProductionCustomerData: false",
    ],
    "consented audit handoff admin-data builder contract"
  );

  const preview = adminData.operations?.consentedAuditHandoffPreview;
  if (!preview || preview.format !== "proofresume-consented-audit-handoff-preview-v1") {
    throw new Error("Admin data must expose the consented audit handoff preview contract.");
  }
  if (
    preview.productQueueItemId !== "NORTHSTAR-CONSENTED-AUDIT-HANDOFF-PREVIEW" ||
    preview.localOnly !== true ||
    preview.manualShareOnly !== true ||
    preview.queueMutationAllowed !== false ||
    preview.externalActionAllowed !== false ||
    preview.providerActionAllowed !== false ||
    preview.canClaimCustomerFeedback !== false ||
    preview.canClaimWillingnessToPay !== false ||
    preview.canClaimRevenue !== false ||
    preview.canDisplayPaymentLink !== false ||
    preview.canRequestTestimonialOrReferral !== false ||
    preview.canStoreProductionCustomerData !== false
  ) {
    throw new Error("Consented audit handoff preview must remain local-only, manual-share-only, and externally disabled.");
  }
  const checks = preview.consentAndApprovalChecks || [];
  for (const id of ["candidate_consent", "target_job_approval", "redaction", "proof_audit"]) {
    if (!checks.some((check) => check.id === id)) {
      throw new Error(`Consented audit handoff missing check ${id}.`);
    }
  }
  const serialized = JSON.stringify(preview);
  for (const token of [
    "raw resumes",
    "prospect identities",
    "contact details",
    "private replies",
    "payment data",
    "credentials",
    "calendar links",
    "screenshots",
    "customer materials",
  ]) {
    if (!serialized.includes(token)) {
      throw new Error(`Consented audit handoff missing forbidden-field guardrail: ${token}`);
    }
  }
  for (const forbidden of [
    /https?:\/\//i,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /api[_-]?key\s*[:=]/i,
    /secret\s*[:=]/i,
    /token\s*[:=]/i,
    /bearer\s+[a-z0-9]/i,
    /queueMutationAllowed"?\s*:\s*true/i,
    /externalActionAllowed"?\s*:\s*true/i,
    /providerActionAllowed"?\s*:\s*true/i,
    /canDisplayPaymentLink"?\s*:\s*true/i,
    /canClaimRevenue"?\s*:\s*true/i,
    /canRequestTestimonialOrReferral"?\s*:\s*true/i,
    /canStoreProductionCustomerData"?\s*:\s*true/i,
  ]) {
    if (forbidden.test(serialized)) {
      throw new Error(`Consented audit handoff leaked a forbidden value or enabled unsafe action: ${forbidden}`);
    }
  }
}

assertConsentedAuditHandoffPreviewContract({ appHtml, appJs, adminHtml, adminJs, adminCss, adminData, adminDataBuilderSource });

const requiredText = [
  "ProofResume",
  "Job search on autopilot",
  "Upload your resume. We handle the applications.",
  "finds relevant jobs, tailors each application",
  "Join the pilot list",
  "Auto-apply without the chaos.",
  "Less busywork",
];

for (const text of requiredText) {
  if (!html.includes(text)) {
    throw new Error(`Missing required page text: ${text}`);
  }
}

const requiredReviewText = [
  "Sample report",
  "See exactly what changed and why.",
  "Original excerpt",
  "Enhanced excerpt",
  "Approve evidence before it can support claims.",
  'id="approvals"',
  "Accepted updates become a resume-ready section.",
  "Save answers as local evidence.",
  "Every meaningful claim maps back to proof",
  "Open questions",
  "Expected impact",
  "Leads are stored locally and no external service is contacted",
  "Try with your resume",
];

for (const text of requiredReviewText) {
  if (!reviewHtml) {
    throw new Error("Missing required review page: review.html");
  }

  if (!reviewHtml.includes(text)) {
    throw new Error(`Missing required review page text: ${text}`);
  }
}

const requiredProofPacketText = [
  "Proof packet",
  "Evidence-backed packet preview (local-only).",
  "Download packet JSON",
  "Import bundle .json",
  "Bundle replay mode shows",
  "No email is sent and no external service is contacted",
];

for (const text of requiredProofPacketText) {
  if (!proofPacketHtml) {
    throw new Error("Missing required proof packet page: proof-packet.html");
  }

  if (!proofPacketHtml.includes(text)) {
    throw new Error(`Missing required proof packet page text: ${text}`);
  }
}

if (
  !proofPacketJs.includes("searchParams.get(\"bundle\")") ||
  !proofPacketJs.includes("Return to review (bundle replay)") ||
  !proofPacketJs.includes("data-proofresume-bundle-replay-nav") ||
  !proofPacketJs.includes("/review.html?bundle=")
) {
  throw new Error("Proof packet page must align bundle replay navigation back to the matching review bundle replay view.");
}

const requiredIntakeText = [
  "Local intake",
  "Paste a messy resume. Get a draft review report.",
  "Paste raw resume text.",
  "Your paste is stored in this browser’s local storage",
  "never sent to any external service",
  "Session reset",
];

for (const text of requiredIntakeText) {
  if (!intakeHtml) {
    throw new Error("Missing required intake page: intake.html");
  }

  if (!intakeHtml.includes(text)) {
    throw new Error(`Missing required intake page text: ${text}`);
  }
}
requireAny(intakeHtml, ["Generate local review", "Analyze and save locally"], "intake local review action");

const requiredCss = ["@media (max-width: 860px)", "min-height: 46px", "overflow-wrap: anywhere"];
for (const token of requiredCss) {
  if (!css.includes(token)) {
    throw new Error(`Missing required responsive/accessibility CSS: ${token}`);
  }
}

if (!js.includes("localStorage") || !js.includes("/api/dev-lead") || !js.includes("No external service was contacted")) {
  throw new Error("Lead form must stay local-only until external action is explicitly approved.");
}

if (
  !intakeJs.includes("localStorage") ||
  !intakeJs.includes("proofresume:intakes") ||
  !intakeJs.includes("No external service was contacted") ||
  !intakeJs.includes("/api/synthesis-decision-memo")
) {
  throw new Error("Intake prototype must stay local-only and preserve raw input without external calls.");
}

if (
  !reviewJs.includes("proofresume:intakes") ||
  !reviewJs.includes("searchParams.get(\"intake\")") ||
  !reviewJs.includes("searchParams.get(\"bundle\")") ||
  !reviewJs.includes("Unapproved") ||
  !reviewJs.includes("approveAllEvidence") ||
  !reviewJs.includes("clearAllEvidenceApprovals") ||
  !reviewJs.includes("proofresume-local-section-v1") ||
  !reviewJs.includes("setFollowups") ||
  !reviewJs.includes("followupAnswer1") ||
  !reviewJs.includes("data-followup-jump-to-approvals") ||
  !reviewJs.includes("data-evidence-approved-badge") ||
  !reviewJs.includes("approval-followup-") ||
  !reviewJs.includes("proofPacketSnapshot") ||
  !reviewJs.includes("proofresume-local-proof-packet-snapshot-v1") ||
  !reviewJs.includes("downloadExportBundle") ||
  !reviewJs.includes("importExportBundle") ||
  !reviewJs.includes("proofresume:exportBundles") ||
  !reviewJs.includes("exportBundleFileName") ||
  !reviewJs.includes("/api/synthesis-decision-memo")
) {
  throw new Error("Review page must be able to render a local draft report from intake data.");
}

if (!reviewHtml.includes('data-pr="downloadExportBundle"') || !reviewHtml.includes("Download bundle .json")) {
  throw new Error("Missing export bundle JSON download action in review.html export toolbar.");
}

if (!reviewHtml.includes('data-pr="importExportBundle"') || !reviewHtml.includes("Import bundle .json")) {
  throw new Error("Missing export bundle JSON import action in review.html.");
}

if (
  !reviewHtml.includes('data-export-bundle-import-entrypoint="sample-report"') ||
  !reviewHtml.includes('data-pr="importExportBundleStatus"')
) {
  throw new Error("Missing sample-report entrypoint for export bundle JSON import in review.html.");
}

function outsideAuthorityAwaitingStateLedgerFixture(overrides = {}) {
  return {
    format: "proofresume-outside-authority-awaiting-state-ledger-v1",
    state: "outside-authority-awaiting-state-blocked-do-not-deploy",
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
      "DNS step",
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
      finalLedgerDecision: "No-Go / Do Not Deploy",
      humanPlatformAuthorityReEntryGateState: "human-platform-authority-re-entry-blocked-do-not-deploy",
      adminDataExternalInputsPresent: false,
      productReadinessExternalInputsPresent: false,
      staticOutputExternalInputsPresent: false,
    },
    evidenceNote:
      "Private outside-authority awaiting-state ledger preserves blocked state after the human-platform authority re-entry gate. Every awaiting fact remains private, read-only, Not observed, outside repo authority, non-request, Do Not Publish, no-secret, no-deploy, no-public-launch, no-rollback, no-authority-bypass, and non-executable.",
    ...overrides,
  };
}

function assertOutsideAuthorityAwaitingStateLedgerContract(ledger, label) {
  if (!ledger || typeof ledger !== "object") {
    throw new Error(`Missing outside-authority awaiting-state ledger contract for ${label}`);
  }
  if (ledger.format !== "proofresume-outside-authority-awaiting-state-ledger-v1") {
    throw new Error(`Outside-authority awaiting-state ledger ${label} must keep format v1.`);
  }
  if (ledger.state !== "outside-authority-awaiting-state-blocked-do-not-deploy") {
    throw new Error(`Outside-authority awaiting-state ledger ${label} must remain blocked-do-not-deploy.`);
  }
  if (ledger.decision !== "No-Go / Do Not Deploy" || ledger.productionDeploymentState !== "Do Not Deploy" || ledger.publishingState !== "Do Not Publish") {
    throw new Error(`Outside-authority awaiting-state ledger ${label} must remain No-Go / Do Not Deploy / Do Not Publish.`);
  }
  if (
    ledger.private !== true ||
    ledger.localOnly !== true ||
    ledger.readOnly !== true ||
    ledger.awaitingOutsideAuthority !== true ||
    ledger.awaitingBlocked !== true ||
    ledger.nonRequest !== true ||
    ledger.outsideRepoAuthority !== true ||
    ledger.notCredentialRequest !== true ||
    ledger.notLaunchPlan !== true ||
    ledger.notRollbackPlan !== true ||
    ledger.notExecutableSequence !== true ||
    (ledger.executableSteps || []).length ||
    (ledger.deploySequence || []).length
  ) {
    throw new Error(`Outside-authority awaiting-state ledger ${label} became requestable, deployable, launchable, rollback-capable, or executable.`);
  }
  if (
    ledger.sourceConsumed?.path !== "ops/deploy/private-human-platform-authority-re-entry-gate.md" ||
    ledger.sourceConsumed?.canRequestValues !== false ||
    ledger.sourceConsumed?.canAuthorizeDeploy !== false ||
    ledger.sourceConsumed?.canAuthorizeLaunch !== false ||
    ledger.sourceConsumed?.canAuthorizeRollback !== false ||
    ledger.sourceConsumed?.canBypassHumanPlatformAuthority !== false ||
    ledger.sourceConsumed?.canUnlockReEntry !== false ||
    ledger.sourceConsumed?.canUnlockDeploy !== false ||
    ledger.sourceConsumed?.canPublish !== false
  ) {
    throw new Error(`Outside-authority awaiting-state ledger ${label} must consume only the re-entry gate without requesting values, authorizing deploy/launch/rollback, bypassing authority, or unlocking deploy.`);
  }
  const scopeKeys = (ledger.awaitingScope || []).map((item) => String(item.key || "").toLowerCase());
  for (const key of ["admin-data", "product-readiness", "static-rehearsal-output", "outside-authority-awaiting-state-ledger"]) {
    if (!scopeKeys.includes(key)) {
      throw new Error(`Outside-authority awaiting-state ledger ${label} missing scope: ${key}`);
    }
  }
  if (!(ledger.awaitingScope || []).every((item) => item.canAuthorize === false && item.canRequestValues === false && item.canExecute === false)) {
    throw new Error(`Outside-authority awaiting-state ledger ${label} allowed scope to authorize, request values, or execute.`);
  }
  const factText = (ledger.awaitingFacts || [])
    .map((item) => `${item.label || ""}: ${item.state || ""}: ${item.repoAuthority || ""}: ${item.canRequestFromRepo}: ${item.canInferFromLocalEvidence}: ${item.awaitingHandlingAllowed || ""}`)
    .join("\n")
    .toLowerCase();
  for (const token of ["human/platform authority", "explicit future human approval", "production url / production origin", "deploy trigger"]) {
    if (!factText.includes(token) || !factText.includes("not observed") || !factText.includes("outside repo authority") || !factText.includes("preserve private read-only outside-authority awaiting boundary only")) {
      throw new Error(`Outside-authority awaiting-state ledger ${label} must keep ${token} Not observed, outside repo authority, and awaiting-boundary only.`);
    }
  }
  if ((ledger.awaitingFacts || []).some((item) => item.state !== "Not observed" || item.repoAuthority !== "Outside repo authority" || item.canRequestFromRepo !== false || item.canInferFromLocalEvidence !== false)) {
    throw new Error(`Outside-authority awaiting-state ledger ${label} must keep every awaiting fact non-requestable and non-inferable.`);
  }
  const forbiddenLabels = (ledger.forbiddenOperationalItems || []).map((item) => `${item.label || ""}: ${item.state || ""}`.toLowerCase()).join("\n");
  for (const token of ["credential request", "secret storage", "production url", "deploy trigger", "authority bypass", "deploy unlock", "publish action", "executable sequence"]) {
    if (!forbiddenLabels.includes(token)) {
      throw new Error(`Outside-authority awaiting-state ledger ${label} missing forbidden item: ${token}`);
    }
  }
  if (!(ledger.forbiddenOperationalItems || []).every((item) => /absent/i.test(String(item.state || "")))) {
    throw new Error(`Outside-authority awaiting-state ledger ${label} must keep every forbidden operational item absent.`);
  }
  if (!Object.values(ledger.awaitingSummary || {}).every((value) => value === "No")) {
    throw new Error(`Outside-authority awaiting-state ledger ${label} changed an awaiting summary value from No.`);
  }
  const guardrails = ledger.noSecretNoDeployGuardrails || {};
  const forbiddenTrueFields = [
    "credentialRequestAllowed",
    "secretStorageAllowed",
    "platformValueRequestAllowed",
    "platformInputRequestAllowed",
    "productionUrlStored",
    "deployTriggerStored",
    "dashboardActionAvailable",
    "dnsStepAvailable",
    "rollbackAuthorized",
    "publicDeployAuthorized",
    "publicLaunchAuthorized",
    "authorityBypassAllowed",
    "reEntryUnlockAllowed",
    "deployUnlockAllowed",
    "deployActionRequested",
    "publishActionRequested",
    "executableSequenceCreated",
    "finalDecisionChangeAllowed",
  ].filter((key) => guardrails[key]);
  if (forbiddenTrueFields.length || guardrails.productionDeploymentState !== "Do Not Deploy") {
    throw new Error(`Outside-authority awaiting-state ledger ${label} unlocked forbidden guardrails: ${forbiddenTrueFields.join(", ")}`);
  }
  const evidenceNote = String(ledger.evidenceNote || "");
  for (const token of ["Do Not Publish", "Not observed", "outside repo authority", "non-request", "no-secret", "no-deploy", "non-executable"]) {
    if (!evidenceNote.includes(token)) {
      throw new Error(`Outside-authority awaiting-state ledger ${label} missing evidence note token: ${token}`);
    }
  }
  for (const forbidden of [/https?:\/\//i, /api[_-]?key\s*[:=]/i, /secret\s*[:=]/i, /token\s*[:=]/i, /bearer\s+[a-z0-9]/i, /deploy\\s+command\\s*[:=]/i]) {
    if (forbidden.test(JSON.stringify(ledger))) {
      throw new Error(`Outside-authority awaiting-state ledger ${label} leaked URL, secret, token, bearer, or deploy-command value marker.`);
    }
  }
}

const requiredAdminText = [
  "Agent progress, goals, sprints, and operating documents",
  "Incremental Agent Work",
  "Bundle Library",
  "Swarm Health",
  "Parallel Work Ownership",
  "Goals, Sprints, Backlog, Reports, Requirements",
];

for (const text of requiredAdminText) {
  if (!adminHtml.includes(text)) {
    throw new Error(`Missing required admin text: ${text}`);
  }
}

if (!adminCss.includes(".pass-card") || !adminCss.includes(".doc-reader")) {
  throw new Error("Admin dashboard CSS must include pass cards and document reader styles.");
}

requireAll(
  adminHtml,
  [
    "id=\"feedback-roadmap\"",
    "Feedback-to-Roadmap Loop",
    "data-feedback-load-workspace",
    "data-feedback-export",
    "data-feedback-clear",
    "feedback-roadmap-drafts",
    "cannot mark queue items ready",
  ],
  "feedback-to-roadmap admin HTML contract"
);

requireAll(
  adminJs,
  [
    "FEEDBACK_ROADMAP_STORAGE_KEY",
    "proofresume:feedbackRoadmapDrafts",
    "proofresume-feedback-to-roadmap-loop-v1",
    "proofresume-feedback-roadmap-queue-draft-v1",
    "classifyFeedbackObservation",
    "buildFeedbackRoadmapDraft",
    "renderFeedbackRoadmap",
    "product_friction",
    "trust_objection",
    "willingness_to_pay_signal",
    "gtm_objection",
    "infrastructure_blocker",
    "draft_only_needs_controller_review",
    "mayMarkReadyAutomatically: false",
    "localOnly: true",
    "externalAction: false",
    "noOutreach: true",
    "noPayment: true",
    "noAnalytics: true",
    "noDeploy: true",
    "noProductionCustomerData: true",
    "noApplicationSubmission: true",
    "noRevenueClaim: true",
    "app.html#first-session-handoff",
  ],
  "feedback-to-roadmap admin JS local-only contract"
);

requireAll(
  appJs,
  [
    "FEEDBACK_ROADMAP_STORAGE_KEY",
    "appendFeedbackRoadmapSeed",
    "proofresume-feedback-to-roadmap-loop-v1",
    "proofresume-feedback-roadmap-queue-draft-v1",
    "draft_only_needs_controller_review",
    "mayMarkReadyAutomatically: false",
    "noCustomerFeedbackClaim: true",
    "app.html#first-session-handoff",
  ],
  "feedback-to-roadmap workspace seed contract"
);

requireAll(
  adminHtml,
  [
    "id=\"redacted-evidence-inbox\"",
    "Redacted First-Session Evidence Inbox",
    "data-evidence-load-workspace",
    "data-evidence-export",
    "data-evidence-clear",
    "redacted-evidence-summary",
    "redacted-evidence-lanes",
    "cannot store raw resumes, prospect identities, private replies, payment data, credentials, or customer materials",
  ],
  "redacted first-session evidence inbox admin HTML contract"
);

requireAll(
  adminJs,
  [
    "REDACTED_EVIDENCE_INBOX_STORAGE_KEY",
    "proofresume:redactedSessionEvidenceInbox",
    "proofresume-redacted-session-evidence-inbox-v1",
    "proofresume-redacted-session-evidence-record-v1",
    "renderRedactedSessionEvidenceInbox",
    "redactedEvidenceRecordFromWorkspace",
    "rehearsal_evidence",
    "authorized_feedback",
    "paid_interest_note",
    "privacy_objection",
    "no_action_no_offer_outcome",
    "sampleOrOwnerApprovedRedactedOnly: true",
    "noRawResume: true",
    "noProspectIdentity: true",
    "noPrivateReply: true",
    "noPaymentData: true",
    "noCredentials: true",
    "noCustomerMaterials: true",
    "noQueueMutation: true",
    "noRevenueClaim: true",
  ],
  "redacted first-session evidence inbox admin JS local-only contract"
);

requireAll(
  adminDataBuilderSource,
  [
    "buildRedactedSessionEvidenceInboxVisibility",
    "proofresume-redacted-session-evidence-inbox-v1",
    "NORTHSTAR-REDACTED-SESSION-EVIDENCE-INBOX",
    "sampleOrOwnerApprovedRedactedOnly",
    "queueMutationAllowed: false",
    "externalActionAllowed: false",
    "noCustomerFeedbackClaim: true",
    "noRevenueClaim: true",
    "rehearsal_evidence",
    "authorized_feedback",
    "paid_interest_note",
    "privacy_objection",
    "no_action_no_offer_outcome",
  ],
  "redacted first-session evidence inbox admin-data builder contract"
);

const redactedEvidenceInbox = adminData.operations?.redactedSessionEvidenceInbox;
if (!redactedEvidenceInbox || redactedEvidenceInbox.format !== "proofresume-redacted-session-evidence-inbox-v1") {
  throw new Error("Generated admin data must include the redacted session evidence inbox contract.");
}
if (redactedEvidenceInbox.productQueueItemId !== "NORTHSTAR-REDACTED-SESSION-EVIDENCE-INBOX") {
  throw new Error("Redacted session evidence inbox must point to the product queue item it completes.");
}
for (const [field, expected] of [
  ["localOnly", true],
  ["sampleOrOwnerApprovedRedactedOnly", true],
  ["queueMutationAllowed", false],
  ["externalActionAllowed", false],
  ["noCustomerFeedbackClaim", true],
  ["noRevenueClaim", true],
]) {
  if (redactedEvidenceInbox[field] !== expected) {
    throw new Error(`Redacted session evidence inbox ${field} must be ${expected}.`);
  }
}
const requiredEvidenceKinds = [
  "rehearsal_evidence",
  "authorized_feedback",
  "paid_interest_note",
  "privacy_objection",
  "no_action_no_offer_outcome",
];
const evidenceKinds = new Set((redactedEvidenceInbox.records || []).map((record) => record.evidenceKind));
for (const kind of requiredEvidenceKinds) {
  if (!evidenceKinds.has(kind)) {
    throw new Error(`Redacted session evidence inbox missing required evidence lane: ${kind}.`);
  }
}
const forbiddenRedactedEvidencePattern =
  /(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|https?:\/\/|api[_-]?key|secret|token|bearer\s+[a-z0-9]|raw_resume_text|raw_transcript|raw_customer_quote|payment_identifier|payment_card|provider_record_id|signed_url|dashboard_url|calendar_link)/i;
if (forbiddenRedactedEvidencePattern.test(JSON.stringify(redactedEvidenceInbox))) {
  throw new Error("Redacted session evidence inbox fixture leaked a forbidden repo-visible value.");
}

assertFollowupEvidenceVisibilityContract(
  adminData.operations?.queueRefreshDecisionInput?.followupEvidenceVisibility,
  "generated admin-data"
);

if (!adminJs.includes("admin-data.json") || !adminJs.includes("renderPasses")) {
  throw new Error("Admin dashboard must load generated admin data and render prompt passes.");
}

requireAll(
  adminHtml,
  [
    "id=\"bundle-library\"",
    "id=\"bundle-library-list\"",
    "Bundle Library",
    "Import bundle .json",
    "Export bundle library .json",
    "Import bundle library .json",
    "Export bundle annotations .json",
    "Import bundle annotations .json",
    "data-pr=\"importExportBundle\"",
    "data-pr=\"importExportBundleFile\"",
    "data-pr=\"importExportBundleStatus\"",
    "data-pr=\"exportBundleLibrary\"",
    "data-pr=\"importBundleLibrary\"",
    "data-pr=\"importBundleLibraryFile\"",
    "data-pr=\"bundleLibraryTransferStatus\"",
    "data-pr=\"bundleLibraryImportActions\"",
    "data-pr=\"bundleLibraryImportMerge\"",
    "data-pr=\"bundleLibraryImportReplace\"",
    "data-pr=\"bundleLibraryImportCancel\"",
    "data-pr=\"exportBundleAnnotations\"",
    "data-pr=\"importBundleAnnotations\"",
    "data-pr=\"importBundleAnnotationsFile\"",
    "data-pr=\"bundleAnnotationsTransferStatus\"",
    "data-pr=\"bundleLibrarySearch\"",
    "data-pr=\"bundleLibrarySourceFilter\"",
    "data-pr=\"bundleLibraryRecencyFilter\"",
    "data-pr=\"bundleLibraryClearFilters\"",
    "data-pr=\"bundleLibraryMatchCount\"",
  ],
  "bundle library admin surface"
);

requireAll(
  adminJs,
  [
    "EXPORT_BUNDLES_STORAGE_KEY",
    "proofresume:exportBundles",
    "BUNDLE_LIBRARY_FILTERS_STORAGE_KEY",
    "BUNDLE_LIBRARY_ANNOTATIONS_STORAGE_KEY",
    "proofresume:bundleLibraryAnnotations",
    "BUNDLE_LIBRARY_ANNOTATIONS_FORMAT",
    "proofresume-bundle-library-annotations-v1",
    "BUNDLE_LIBRARY_ARCHIVE_FORMAT",
    "proofresume-bundle-library-archive-v1",
    "exportBundleLibrary",
    "importBundleLibrary",
    "bundleLibraryTransferStatus",
    "bundleLibraryImportActions",
    "bundleLibraryImportMerge",
    "bundleLibraryImportReplace",
    "bundleLibraryImportCancel",
    "exportBundleAnnotations",
    "importBundleAnnotations",
    "bundleAnnotationsTransferStatus",
    "Operator notes (local)",
    "Tags (local)",
    "renderBundleLibrary",
    "loadExportBundleById",
    "deleteExportBundleById",
    "summarizeExportSnapshot",
    "saveExportBundleSnapshot",
    "Snapshot:",
    "copyToClipboard",
    "downloadJsonFile",
    "Open review replay",
    "Open proof packet replay",
    "Copy bundle id",
    "Download bundle .json",
  ],
  "bundle library localStorage contract"
);

if (!adminData.passes?.length || !adminData.docs?.length || !adminData.reports?.length || !adminData.lanes?.length) {
  throw new Error("Admin data must expose passes, docs, reports, and lanes.");
}

requireAll(
  adminJs,
  [
    "renderStaticDeployRehearsalVisibility",
    "Private static deploy rehearsal",
    "Not run",
    "Passed local",
    "Do Not Deploy. No platform credentials, production URL, or deploy trigger.",
    "credentialInputsConsumed",
    "Run <code>npm run static-deploy-rehearsal</code>",
  ],
  "static deploy rehearsal admin UI surface"
);

requireAll(
  adminJs,
  [
    "renderStaticDeployRehearsalHistory",
    "Prior failures",
    "Stale evidence",
    "failed steps",
    "History will appear after local-only static rehearsal reports are written",
  ],
  "static deploy rehearsal admin history failure surface"
);

requireAll(
  adminJs,
  [
    "renderPlatformOwnerHandoffVisibility",
    "Platform-owner handoff",
    "Unavailable credential/deploy values",
    "Public deploy status",
    "Do Not Deploy",
  ],
  "platform-owner handoff admin visibility surface"
);

requireAll(
  adminJs,
  [
    "renderFinalDeployGoNoGoLedgerVisibility",
    "Final deploy go/no-go ledger",
    "No-Go / Do Not Deploy",
    "Human approval missing",
    "Credentials unavailable",
  ],
  "final deploy go/no-go ledger admin visibility surface"
);

requireAll(
  adminJs,
  [
    "renderOutsideAuthorityAwaitingStateLedgerVisibility",
    "Private outside-authority awaiting-state ledger",
    "Awaiting summary",
    "Awaiting rows",
    "Outside-repo facts",
    "Do Not Deploy",
  ],
  "outside-authority awaiting-state ledger admin visibility surface"
);

requireAll(
  intakeJs,
  [
    "staticDeployRehearsalDrilldownItems",
    "Blocked route detail",
    "Missing static entrypoint",
    "Deploy guardrail",
    "Platform inputs remain disabled until this local rehearsal passes.",
    "external-human-approval",
    "const platformInputsEnabled = Boolean(rehearsalComplete && staticDeployRehearsalReady && explicitHumanApprovalObserved)",
    "field.toggleAttribute(\"disabled\", !state.platformInputsEnabled)",
  ],
  "static deploy rehearsal product drilldown failure surface"
);

requireAll(
  reviewJs,
  [
    "platformOwnerHandoffState",
    "platformOwnerHandoffCategories",
    "post-deploy health-check entrypoints",
    "post-deploy status method",
    "data-platform-owner-handoff-state",
    "data-export-eligible",
    "data-download-eligible",
    "data-no-deploy-action",
  ],
  "platform-owner handoff product readiness surface"
);

requireAll(
  reviewHtml,
  [
    "data-pr=\"platformOwnerHandoffState\"",
    "data-pr=\"postDeployHealthCheckHandoffState\"",
    "data-route-only=\"true\"",
    "data-no-production-url=\"true\"",
    "data-no-deploy-trigger=\"true\"",
    "data-export-eligible=\"false\"",
    "data-download-eligible=\"false\"",
  ],
  "platform-owner and post-deploy health product handoff markup"
);

requireAll(
  `${intakeHtml}\n${reviewHtml}`,
  [
    "data-pr=\"outsideAuthorityAwaitingStateLedgerHandoffState\"",
    "data-private-outside-authority-awaiting-state-ledger-handoff",
    "data-outside-authority-awaiting-state-ledger-state=\"read-only-outside-authority-awaiting-state-ledger\"",
    "data-source-ledger=\"../ops/deploy/private-outside-authority-awaiting-state-ledger.md\"",
    "Outside-authority awaiting-state ledger",
    "Do Not Publish",
    "data-export-eligible=\"false\"",
    "data-download-eligible=\"false\"",
  ],
  "product outside-authority awaiting-state ledger handoff markup"
);

requireAll(
  `${intakeJs}\n${reviewJs}`,
  [
    "outsideAuthorityAwaitingStateLedgerHandoffState",
    "read-only-outside-authority-awaiting-state-ledger",
    "private-outside-authority-awaiting-state-ledger.md",
    "Do Not Publish",
    "Awaiting source: private human-platform authority re-entry gate",
    "outside-authority-awaiting-state-ledger-hard-stop",
  ],
  "product outside-authority awaiting-state ledger handoff script"
);

requireAll(
  `${intakeHtml}\n${reviewHtml}`,
  [
    "data-pr=\"finalDeployGoNoGoState\"",
    "data-final-deploy-decision=\"no-go\"",
    "data-no-deploy-action=\"true\"",
    "data-export-eligible=\"false\"",
    "data-download-eligible=\"false\"",
    "Explicit future human approval must exist outside this repo",
  ],
  "product final deploy go/no-go readiness markup"
);

requireAll(
  `${intakeJs}\n${reviewJs}`,
  [
    "finalDeployGoNoGoState",
    "Final decision: ${finalDecision.decision}",
    "data-production-deployment-state",
    "data-no-production-url",
    "data-no-deploy-trigger",
    "Explicit future human approval outside repo: Not observed",
    "Credentials outside repo: Not observed",
    "Production origin outside repo: Not observed",
    "Deploy trigger outside repo: Not observed",
    "Rollback readiness: Not observed",
    "Post-deploy health evidence: Not observed",
    "data-final-deploy-missing",
  ],
  "product final deploy go/no-go readiness script"
);

requireAll(
  staticDeployRehearsalSource,
  [
    "proofresume-final-deploy-go-no-go-ledger-v1",
    "No-Go / Do Not Deploy",
    "explicit future human approval outside the repo",
    "credentials outside the repo",
    "publicLaunchAuthorizationObserved",
    "finalDeployActionRequested",
    "Passing static rehearsal cannot authorize deployment",
  ],
  "static rehearsal final deploy go/no-go ledger output"
);

requireAll(
  staticDeployRehearsalSource,
  [
    "proofresume-deploy-blocker-escalation-memo-v1",
    "blocked-escalation-summary",
    "credentialRequestAllowed",
    "platformValueStored",
    "publicLaunchAuthorized",
    "rollbackAuthorized",
    "finalDecisionChangeAllowed",
    "cannot request secrets",
  ],
  "static rehearsal deploy-blocker escalation memo output"
);

requireAll(
  staticDeployRehearsalSource,
  [
    "proofresume-first-human-operator-deploy-packet-index-v1",
    "index-only-do-not-deploy",
    "first human operator",
    "not a deploy checklist",
    "admin-data",
    "product-readiness",
    "static-rehearsal-output",
    "externalValueRequests: []",
    "contactDetailStored",
    "deployActionRequested",
  ],
  "static rehearsal first-human-operator deploy packet index output"
);

requireAll(
  staticDeployRehearsalSource,
  [
    "proofresume-operator-dry-run-review-checklist-v1",
    "review-only-do-not-deploy",
    "notExecutableDeploySequence",
    "executableSteps: []",
    "deploySequence: []",
    "admin-data",
    "product-readiness",
    "static-rehearsal-output",
    "dashboardActionAvailable",
    "dnsStepAvailable",
  ],
  "static rehearsal operator dry-run review checklist output"
);

requireAll(
  staticDeployRehearsalSource,
  [
    "proofresume-first-human-packet-cold-start-archive-v1",
    "archive-only-do-not-deploy",
    "archiveOnly",
    "nonOperational",
    "notExecutableSequence",
    "executableSteps: []",
    "deploySequence: []",
    "first-human-packet-index",
    "operator-dry-run-checklist",
    "continuationFacts",
    "forbiddenOperationalItems",
    "credential availability outside repo",
    "cannot become an executable sequence",
  ],
  "static rehearsal first-human packet cold-start archive output"
);

requireAll(
  staticDeployRehearsalSource,
  [
    "proofresume-release-candidate-deploy-continuation-map-v1",
    "blocked-continuation-do-not-deploy",
    "releaseCandidateDeployContinuationMap",
    "cannotRequestPlatformInputs",
    "notDeployPlan",
    "notLaunchPlan",
    "notRollbackPlan",
    "notExecutableSequence",
    "executableSteps: []",
    "deploySequence: []",
    "admin-data",
    "product-readiness",
    "static-rehearsal-output",
    "externalPlatformInputs",
    "blockedContinuationGates",
    "platformInputRequestAllowed",
    "cannot become an executable sequence",
  ],
  "static rehearsal release-candidate deploy-continuation map output"
);

requireAll(
  staticDeployRehearsalSource,
  [
    "proofresume-private-external-input-boundary-ledger-v1",
    "privateExternalInputBoundaryLedger",
    "private-ledger-do-not-deploy",
    "Outside repo authority",
    "canRequestFromRepo: false",
    "canInferFromLocalEvidence: false",
    "notExecutableSequence",
    "executableSteps: []",
    "deploySequence: []",
    "private-external-input-boundary-ledger.md",
    "non-requestable, no-secret, no-deploy, and non-executable",
  ],
  "static rehearsal private external-input boundary ledger output"
);

requireAll(
  staticDeployRehearsalSource,
  [
    "proofresume-platform-owner-non-request-transfer-note-v1",
    "platformOwnerNonRequestTransferNote",
    "private-transfer-note-do-not-deploy",
    "nonRequest: true",
    "notCredentialRequest",
    "notPlatformSetupPlan",
    "private-platform-owner-non-request-transfer-note.md",
    "externalDeployFactsRequested",
    "credentialsRequestedOrStored",
    "platformValuesRequestedOrStored",
    "productionUrlRequestedOrStored",
    "deployTriggerRequestedOrStored",
    "non-request, no-secret, no-deploy, and non-executable",
  ],
  "static rehearsal platform-owner non-request transfer note output"
);

requireAll(
  staticDeployRehearsalSource,
  [
    "proofresume-operator-resume-packet-guardrail-v1",
    "operatorResumePacketGuardrail",
    "private-resume-guardrail-do-not-deploy",
    "private-operator-resume-packet-guardrail.md",
    "Stop; preserve blocked state only",
    "platformValueRequestAllowed",
    "publicDeployAuthorized",
    "no-public-launch, no-rollback, and non-executable",
  ],
  "static rehearsal operator-resume packet guardrail output"
);

requireAll(
  staticDeployRehearsalSource,
  [
    "proofresume-blocked-state-operator-continuation-index-v1",
    "blockedStateOperatorContinuationIndex",
    "private-blocked-continuation-index-do-not-deploy",
    "private-blocked-state-operator-continuation-index.md",
    "Read-only blocked-state label only",
    "allowedContinuationLabels",
    "platformValueRequestAllowed",
    "publicDeployAuthorized",
    "no-public-launch, no-rollback, and non-executable",
  ],
  "static rehearsal blocked-state operator continuation index output"
);

requireAll(
  staticDeployRehearsalSource,
  [
    "proofresume-autonomous-deploy-stop-ledger-v1",
    "autonomousDeployStopLedger",
    "autonomous-stop-ledger-do-not-deploy",
    "private-autonomous-deploy-stop-ledger.md",
    "autonomousStop: true",
    "Stop; preserve private read-only context only",
    "stopFacts",
    "stopSummary",
    "platformValueRequestAllowed",
    "publicDeployAuthorized",
    "no-public-launch, no-rollback, and non-executable",
  ],
  "static rehearsal autonomous deploy stop ledger output"
);

requireAll(
  staticDeployRehearsalSource,
  [
    "proofresume-post-autonomous-stop-recovery-checklist-v1",
    "postAutonomousStopRecoveryChecklist",
    "post-autonomous-stop-recovery-checklist-do-not-deploy",
    "private-post-autonomous-stop-recovery-checklist.md",
    "autonomousRecoveryBoundary: true",
    "Preserve private read-only recovery boundary only",
    "recoveryFacts",
    "recoverySummary",
    "authorityBypassAllowed",
    "no-authority-bypass, and non-executable",
  ],
  "static rehearsal post-autonomous-stop recovery checklist output"
);

requireAll(
  staticDeployRehearsalSource,
  [
    "proofresume-human-platform-authority-re-entry-gate-v1",
    "humanPlatformAuthorityReEntryGate",
    "human-platform-authority-re-entry-blocked-do-not-deploy",
    "private-human-platform-authority-re-entry-gate.md",
    "humanPlatformAuthorityBoundary: true",
    "Preserve private read-only human-platform authority boundary only",
    "reEntryFacts",
    "reEntrySummary",
    "reEntryUnlockAllowed",
    "no-authority-bypass, and non-executable",
  ],
  "static rehearsal human-platform authority re-entry gate output"
);

requireAll(
  staticDeployRehearsalSource,
  [
    "proofresume-outside-authority-awaiting-state-ledger-v1",
    "outsideAuthorityAwaitingStateLedger",
    "outside-authority-awaiting-state-blocked-do-not-deploy",
    "private-outside-authority-awaiting-state-ledger.md",
    "awaitingOutsideAuthority: true",
    "Do Not Publish",
    "awaitingFacts",
    "awaitingSummary",
    "deployUnlockAllowed",
    "non-executable",
  ],
  "static rehearsal outside-authority awaiting-state ledger output"
);

requireAll(
  JSON.stringify(adminData),
  [
    "private-platform-owner-non-request-transfer-note.md",
    "private context only",
    "No-Go / Do Not Deploy",
    "Not observed",
    "outside repo authority",
  ],
  "generated admin-data platform-owner non-request transfer note source visibility"
);

requireAll(
  JSON.stringify(adminData),
  [
    "private-operator-resume-packet-guardrail.md",
    "No-Go / Do Not Deploy",
    "Not observed",
    "outside repo authority",
    "Do Not Deploy",
  ],
  "generated admin-data operator-resume packet guardrail source visibility"
);

requireAll(
  JSON.stringify(adminData),
  [
    "private-outside-authority-awaiting-state-ledger.md",
    "outside-authority-awaiting-state-ledger-visible-no-go",
    "Awaiting ledger visible",
    "No-Go / Do Not Deploy",
    "Not observed",
    "outside repo authority",
    "Do Not Publish",
  ],
  "generated admin-data outside-authority awaiting-state ledger visibility"
);

requireAll(
  adminJs,
  [
    "renderFirstHumanOperatorDeployPacketIndexVisibility",
    "First-human-operator deploy packet index",
    "ready local artifacts",
    "unavailable facts",
    "Deploy actions",
  ],
  "admin first-human-operator deploy packet index visibility surface"
);

requireAll(
  `${reviewHtml}\n${reviewJs}`,
  [
    "firstHumanOperatorPacketHandoffState",
    "data-pr=\"firstHumanOperatorPacketHandoffState\"",
    "data-no-dashboard-link",
    "data-no-contact-details",
    "data-no-rollback-authorization",
    "data-no-public-launch-authorization",
    "data-no-human-approval-path",
    "Ready local artifacts and unavailable external facts",
  ],
  "product first-human-operator packet handoff readiness surface"
);

requireAll(
  JSON.stringify(adminData),
  [
    "private-deploy-blocker-escalation-memo-template.md",
    "No-Go / Do Not Deploy",
    "Do Not Deploy",
    "Not observed",
    "cannot authorize public deploy",
    "cannot request secrets",
  ],
  "generated admin-data deploy-blocker escalation memo source visibility"
);

assertStaticDeployVisibilityContract(
  {
    state: "not-run",
    stateLabel: "Not run",
    stateCounts: { notRun: 1, passedLocal: 0, blockedNoCredentials: 0 },
    ok: false,
    checkedAt: null,
    mode: "unobserved",
    reportPath: "ops/reports/static-deploy-rehearsal/latest.json",
    blockers: ["QA static deploy rehearsal report not present"],
    steps: [],
    noDeployGuardrails: {
      platformCredentialConsumed: false,
      productionUrlConsumed: false,
      deployTriggerConsumed: false,
      credentialInputsConsumed: false,
      productionDeploymentState: "Do Not Deploy",
    },
    evidenceNote:
      "No static deploy rehearsal report is present yet. Run `npm run static-deploy-rehearsal` to generate a private local-only report; do not deploy.",
  },
  "deterministic not-run fixture",
  { exactCounts: true }
);

assertStaticDeployVisibilityContract(
  {
    state: "passed-local",
    stateLabel: "Passed locally",
    stateCounts: { notRun: 0, passedLocal: 1, blockedNoCredentials: 0 },
    ok: true,
    checkedAt: "2026-05-15T00:00:00.000Z",
    mode: "local-http",
    reportPath: "ops/reports/static-deploy-rehearsal/fixture.json",
    steps: [{ label: "static fixture", ok: true }],
    routeEvidence: [{ route: "/" }],
    noDeployGuardrails: {
      platformCredentialConsumed: false,
      productionUrlConsumed: false,
      deployTriggerConsumed: false,
      credentialInputsConsumed: false,
      productionDeploymentState: "Do Not Deploy",
    },
    evidenceNote:
      "Private credential-free local rehearsal evidence only. Platform credentials, production URLs, deploy triggers, launch, pricing, testimonial, demand, willingness-to-pay, secure-intake, and outcome conclusions remain unobserved.",
  },
  "deterministic passed-local fixture",
  { exactCounts: true }
);

assertStaticDeployFailureFixtureContract({
  state: "blocked-no-credentials",
  stateLabel: "Blocked: no credentials",
  stateCounts: { notRun: 1, passedLocal: 1, blockedNoCredentials: 1 },
  ok: false,
  checkedAt: "2026-05-15T10:45:00.000Z",
  mode: "local-http",
  reportPath: "ops/reports/static-deploy-rehearsal/fixture-blocked-route.json",
  blockers: [
    "Blocked route: /review.html returned 404",
    "Missing static entrypoint: website/review.html",
    "Stale evidence: older passing report superseded by this blocked fixture",
    "Unsafe guardrail example: platform dashboard visit marker must stay visible as a failure",
  ],
  history: {
    totalReports: 3,
    latestPass: {
      state: "blocked-no-credentials",
      stateLabel: "Blocked: no credentials",
      checkedAt: "2026-05-15T10:45:00.000Z",
      reportPath: "ops/reports/static-deploy-rehearsal/fixture-blocked-route.json",
      failedStepCount: 3,
      failedSteps: ["blocked route fixture", "missing entrypoint fixture", "unsafe guardrail fixture"],
    },
    priorFailures: [
      {
        state: "not-run",
        stateLabel: "Not run",
        checkedAt: "2026-05-15T10:30:00.000Z",
        reportPath: "ops/reports/static-deploy-rehearsal/fixture-not-run.json",
      },
    ],
    staleEvidence: [
      {
        state: "passed-local",
        stateLabel: "Passed locally",
        checkedAt: "2026-05-15T10:15:00.000Z",
        reportPath: "ops/reports/static-deploy-rehearsal/fixture-stale-pass.json",
      },
    ],
  },
  noDeployGuardrails: {
    platformCredentialConsumed: false,
    productionUrlConsumed: false,
    deployTriggerConsumed: false,
    credentialInputsConsumed: false,
    platformDashboardVisited: true,
    productionDeploymentState: "Do Not Deploy",
  },
});

assertStaticDeployVisibilityContract(
  adminData.operations?.queueRefreshDecisionInput?.staticDeployRehearsalVisibility,
  "generated admin-data"
);

const platformOwnerVisibility = adminData.operations?.queueRefreshDecisionInput?.platformOwnerHandoffVisibility;
if (platformOwnerVisibility?.rows?.length) {
  assertPlatformOwnerHandoffContract(platformOwnerVisibility, "generated admin-data");
}

const postDeployHealthOwnerVisibility = adminData.operations?.queueRefreshDecisionInput?.postDeployHealthOwnerHandoffVisibility;
if (postDeployHealthOwnerVisibility?.rows?.length) {
  assertPostDeployHealthOwnerHandoffContract(postDeployHealthOwnerVisibility, "generated admin-data");
} else if (!postDeployHealthOwnerVisibility?.templateExists || postDeployHealthOwnerVisibility?.routeOnlyCheckCount < 5) {
  throw new Error("Generated admin-data must retain post-deploy health handoff source visibility after the old active row closes.");
}

assertFinalDeployGoNoGoLedgerContract(finalDeployGoNoGoLedgerFixture(), "deterministic fixture");
assertFinalDeployGoNoGoLedgerContract(
  adminData.operations?.queueRefreshDecisionInput?.finalDeployGoNoGoLedgerVisibility?.rows?.length
    ? adminData.operations.queueRefreshDecisionInput.finalDeployGoNoGoLedgerVisibility
    :
    derivedFinalDeployLedgerFromAdminData(adminData.operations?.queueRefreshDecisionInput),
  "generated admin-data derived from final deploy surfaces"
);
assertDeployBlockerEscalationMemoContract(deployBlockerEscalationMemoFixture(), "deterministic fixture");
assertDeployBlockerEscalationMemoContract(
  deployBlockerEscalationMemoFixture({
    adminDataEvidence: {
      present: JSON.stringify(adminData).includes("private-deploy-blocker-escalation-memo-template.md"),
      externalInputsPresent: false,
    },
    productReadinessEvidence: {
      present: reviewHtml.includes("data-pr=\"finalDeployGoNoGoState\""),
      canChangeFinalDecision: false,
    },
    localStaticRehearsalEvidence: {
      present: Boolean(adminData.operations?.queueRefreshDecisionInput?.staticDeployRehearsalVisibility?.state),
      passedLocal: adminData.operations?.queueRefreshDecisionInput?.staticDeployRehearsalVisibility?.state === "passed-local",
      canAuthorizeDeploy: false,
    },
  }),
  "generated admin-data/product/static derived deploy-blocker escalation memo"
);
assertFirstHumanOperatorDeployPacketIndexContract(firstHumanOperatorDeployPacketIndexFixture(), "deterministic fixture");
assertFirstHumanOperatorDeployPacketIndexContract(
  firstHumanOperatorDeployPacketIndexFixture({
    indexedPackets: [
      {
        key: "admin-data",
        label: "Admin data visibility",
        source: "website/admin-data.json",
        state: JSON.stringify(adminData).includes("finalDeployGoNoGoLedgerVisibility")
          ? "indexed-local-evidence-only"
          : "indexed-local-source-only",
        externalValuesRequired: false,
        checklistItem: false,
      },
      {
        key: "product-readiness",
        label: "Product readiness surfaces",
        source: "website/intake.html + website/review.html local readiness surfaces",
        state: reviewHtml.includes("data-pr=\"finalDeployGoNoGoState\"")
          ? "indexed-local-evidence-only"
          : "indexed-local-source-only",
        externalValuesRequired: false,
        checklistItem: false,
      },
      {
        key: "static-rehearsal-output",
        label: "Static rehearsal output",
        source: "ops/reports/static-deploy-rehearsal/latest.json",
        state: staticDeployRehearsalSource.includes("firstHumanOperatorDeployPacketIndex")
          ? "local-static-packet-indexed"
          : "local-static-source-only",
        externalValuesRequired: false,
        checklistItem: false,
      },
    ],
  }),
  "generated admin-data/product/static derived first-human-operator deploy packet index"
);
if (adminData.operations?.queueRefreshDecisionInput?.firstHumanOperatorDeployPacketIndexVisibility) {
  assertFirstHumanOperatorDeployPacketIndexContract(
    adminData.operations.queueRefreshDecisionInput.firstHumanOperatorDeployPacketIndexVisibility,
    "generated admin-data first-human-operator deploy packet index visibility"
  );
}

const staticRehearsalLatest = readJsonIfExists("ops/reports/static-deploy-rehearsal/latest.json");
if (staticRehearsalLatest?.firstHumanOperatorDeployPacketIndex) {
  assertFirstHumanOperatorDeployPacketIndexContract(
    staticRehearsalLatest.firstHumanOperatorDeployPacketIndex,
    "static rehearsal latest.json first-human-operator deploy packet index"
  );
}

assertOperatorDryRunReviewChecklistContract(operatorDryRunReviewChecklistFixture(), "deterministic fixture");
assertOperatorDryRunReviewChecklistContract(
  operatorDryRunReviewChecklistFixture({
    reviewedEvidence: [
      {
        key: "admin-data",
        label: "Admin data review",
        source: "website/admin-data.json",
        reviewState: JSON.stringify(adminData).includes("firstHumanOperatorDeployPacketIndexVisibility")
          ? "ready-for-read-only-review"
          : "local-source-review-only",
        executable: false,
        deployAction: false,
      },
      {
        key: "product-readiness",
        label: "Product readiness review",
        source: "website/intake.html + website/review.html local readiness surfaces",
        reviewState: reviewHtml.includes("data-pr=\"firstHumanOperatorPacketHandoffState\"")
          ? "ready-for-read-only-review"
          : "local-source-review-only",
        executable: false,
        deployAction: false,
      },
      {
        key: "static-rehearsal-output",
        label: "Static rehearsal output review",
        source: "ops/reports/static-deploy-rehearsal/latest.json",
        reviewState: staticDeployRehearsalSource.includes("operatorDryRunReviewChecklist")
          ? "local-static-checklist-reviewable"
          : "local-static-source-only",
        executable: false,
        deployAction: false,
      },
    ],
  }),
  "generated admin-data/product/static derived operator dry-run review checklist"
);
if (staticRehearsalLatest?.operatorDryRunReviewChecklist) {
  assertOperatorDryRunReviewChecklistContract(
    staticRehearsalLatest.operatorDryRunReviewChecklist,
    "static rehearsal latest.json operator dry-run review checklist"
  );
}

assertFirstHumanPacketColdStartArchiveContract(firstHumanPacketColdStartArchiveFixture(), "deterministic fixture");
assertFirstHumanPacketColdStartArchiveContract(
  firstHumanPacketColdStartArchiveFixture({
    sourceArtifacts: [
      {
        key: "first-human-packet-index",
        label: "First-human packet index archive source",
        source: "ops/deploy/private-first-human-operator-deploy-packet-index.md",
        archiveState: JSON.stringify(adminData).includes("firstHumanOperatorDeployPacketIndexVisibility")
          ? "index-only-do-not-deploy"
          : "local-source-archived",
        operationalAction: false,
      },
      {
        key: "operator-dry-run-checklist",
        label: "Operator dry-run checklist archive source",
        source: "ops/deploy/private-operator-dry-run-review-checklist.md",
        archiveState: JSON.stringify(adminData).includes("operatorDryRunReviewChecklist")
          ? "review-only-do-not-deploy"
          : "local-source-archived",
        operationalAction: false,
      },
      {
        key: "static-rehearsal-output",
        label: "Static rehearsal output archive source",
        source: "ops/reports/static-deploy-rehearsal/latest.json",
        archiveState: staticDeployRehearsalSource.includes("firstHumanPacketColdStartArchive")
          ? "local-static-evidence-archived"
          : "local-static-source-only",
        operationalAction: false,
      },
    ],
  }),
  "generated admin-data/product/static derived first-human packet cold-start archive"
);
if (staticRehearsalLatest?.firstHumanPacketColdStartArchive) {
  assertFirstHumanPacketColdStartArchiveContract(
    staticRehearsalLatest.firstHumanPacketColdStartArchive,
    "static rehearsal latest.json first-human packet cold-start archive"
  );
}

assertReleaseCandidateDeployContinuationMapContract(releaseCandidateDeployContinuationMapFixture(), "deterministic fixture");
assertReleaseCandidateDeployContinuationMapContract(
  releaseCandidateDeployContinuationMapFixture({
    sourceArtifacts: [
      {
        key: "admin-data",
        label: "Admin data visibility source",
        source: "website/admin-data.json",
        state: JSON.stringify(adminData).includes("firstHumanPacketColdStartArchiveVisibility")
          ? "local-admin-data-context-only"
          : "local-admin-data-source-only",
        operationalAction: false,
      },
      {
        key: "product-readiness",
        label: "Product readiness surfaces source",
        source: "website/intake.html + website/review.html local readiness surfaces",
        state: reviewHtml.includes("data-pr=\"coldStartArchiveHandoffState\"")
          ? "local-product-readiness-blocked"
          : "local-product-readiness-source-only",
        operationalAction: false,
      },
      {
        key: "static-rehearsal-output",
        label: "Static rehearsal output source",
        source: "ops/reports/static-deploy-rehearsal/latest.json",
        state: staticDeployRehearsalSource.includes("releaseCandidateDeployContinuationMap")
          ? "local-static-evidence-only"
          : "local-static-source-only",
        operationalAction: false,
      },
      {
        key: "cold-start-archive",
        label: "Cold-start archive source",
        source: "ops/deploy/private-first-human-packet-handoff-archive-cold-start-brief.md",
        state: staticDeployRehearsalSource.includes("firstHumanPacketColdStartArchive")
          ? "archive-only-do-not-deploy"
          : "local-archive-source-only",
        operationalAction: false,
      },
    ],
  }),
  "generated admin-data/product/static derived release-candidate deploy-continuation map"
);
if (staticRehearsalLatest?.releaseCandidateDeployContinuationMap) {
  assertReleaseCandidateDeployContinuationMapContract(
    staticRehearsalLatest.releaseCandidateDeployContinuationMap,
    "static rehearsal latest.json release-candidate deploy-continuation map"
  );
}

assertPrivateExternalInputBoundaryLedgerContract(privateExternalInputBoundaryLedgerFixture(), "deterministic fixture");
assertPrivateExternalInputBoundaryLedgerContract(
  privateExternalInputBoundaryLedgerFixture({
    authoritySources: [
      {
        key: "admin-data",
        source: "website/admin-data.json",
        state: JSON.stringify(adminData).includes("releaseCandidateDeployContinuationMapVisibility")
          ? "local-context-only"
          : "local-source-only",
        canAuthorize: false,
      },
      {
        key: "product-readiness",
        source: "website/intake.html + website/review.html local readiness surfaces",
        state: reviewHtml.includes("data-pr=\"deployContinuationHandoffState\"")
          ? "local-context-only"
          : "local-source-only",
        canAuthorize: false,
      },
      {
        key: "static-rehearsal-output",
        source: "ops/reports/static-deploy-rehearsal/latest.json",
        state: staticDeployRehearsalSource.includes("privateExternalInputBoundaryLedger")
          ? "local-evidence-only"
          : "local-static-source-only",
        canAuthorize: false,
      },
      {
        key: "external-input-ledger",
        source: "ops/deploy/private-external-input-boundary-ledger.md",
        state: "private-boundary-ledger-only",
        canAuthorize: false,
      },
    ],
  }),
  "generated admin-data/product/static derived private external-input boundary ledger"
);
if (staticRehearsalLatest?.privateExternalInputBoundaryLedger) {
  assertPrivateExternalInputBoundaryLedgerContract(
    staticRehearsalLatest.privateExternalInputBoundaryLedger,
    "static rehearsal latest.json private external-input boundary ledger"
  );
}

assertPlatformOwnerNonRequestTransferNoteContract(platformOwnerNonRequestTransferNoteFixture(), "deterministic fixture");
assertPlatformOwnerNonRequestTransferNoteContract(
  platformOwnerNonRequestTransferNoteFixture({
    transferScope: [
      {
        key: "admin-data",
        source: "website/admin-data.json",
        state: JSON.stringify(adminData).includes("private-platform-owner-non-request-transfer-note.md")
          ? "local-context-only"
          : "local-source-only",
        canAuthorize: false,
        canRequestValues: false,
      },
      {
        key: "product-readiness",
        source: "website/intake.html + website/review.html local readiness surfaces",
        state: reviewHtml.includes("data-pr=\"deployContinuationHandoffState\"")
          ? "local-context-only"
          : "local-source-only",
        canAuthorize: false,
        canRequestValues: false,
      },
      {
        key: "static-rehearsal-output",
        source: "ops/reports/static-deploy-rehearsal/latest.json",
        state: staticDeployRehearsalSource.includes("platformOwnerNonRequestTransferNote")
          ? "local-evidence-only"
          : "local-static-source-only",
        canAuthorize: false,
        canRequestValues: false,
      },
      {
        key: "transfer-note",
        source: "ops/deploy/private-platform-owner-non-request-transfer-note.md",
        state: "private-non-request-note-only",
        canAuthorize: false,
        canRequestValues: false,
      },
    ],
  }),
  "generated admin-data/product/static derived platform-owner non-request transfer note"
);
if (staticRehearsalLatest?.platformOwnerNonRequestTransferNote) {
  assertPlatformOwnerNonRequestTransferNoteContract(
    staticRehearsalLatest.platformOwnerNonRequestTransferNote,
    "static rehearsal latest.json platform-owner non-request transfer note"
  );
}

assertOperatorResumePacketGuardrailContract(operatorResumePacketGuardrailFixture(), "deterministic fixture");
assertOperatorResumePacketGuardrailContract(
  operatorResumePacketGuardrailFixture({
    guardrailScope: [
      {
        key: "admin-data",
        source: "website/admin-data.json",
        state: JSON.stringify(adminData).includes("private-operator-resume-packet-guardrail.md")
          ? "local-context-only"
          : "local-source-only",
        canAuthorize: false,
        canRequestValues: false,
      },
      {
        key: "product-readiness",
        source: "website/intake.html + website/review.html local readiness surfaces",
        state: reviewHtml.includes("data-pr=\"deployContinuationHandoffState\"")
          ? "local-context-only"
          : "local-source-only",
        canAuthorize: false,
        canRequestValues: false,
      },
      {
        key: "static-rehearsal-output",
        source: "ops/reports/static-deploy-rehearsal/latest.json",
        state: staticDeployRehearsalSource.includes("operatorResumePacketGuardrail")
          ? "local-evidence-only"
          : "local-static-source-only",
        canAuthorize: false,
        canRequestValues: false,
      },
      {
        key: "operator-resume-guardrail",
        source: "ops/deploy/private-operator-resume-packet-guardrail.md",
        state: "private-stop-sign-only",
        canAuthorize: false,
        canRequestValues: false,
      },
    ],
  }),
  "generated admin-data/product/static derived operator-resume packet guardrail"
);
if (staticRehearsalLatest?.operatorResumePacketGuardrail) {
  assertOperatorResumePacketGuardrailContract(
    staticRehearsalLatest.operatorResumePacketGuardrail,
    "static rehearsal latest.json operator-resume packet guardrail"
  );
}

assertBlockedStateOperatorContinuationIndexContract(blockedStateOperatorContinuationIndexFixture(), "deterministic fixture");
assertBlockedStateOperatorContinuationIndexContract(
  blockedStateOperatorContinuationIndexFixture({
    continuationScope: [
      {
        key: "admin-data",
        source: "website/admin-data.json",
        state: JSON.stringify(adminData).includes("private-blocked-state-operator-continuation-index.md")
          ? "local-context-only"
          : "local-source-only",
        canAuthorize: false,
        canRequestValues: false,
      },
      {
        key: "product-readiness",
        source: "website/intake.html + website/review.html local readiness surfaces",
        state: reviewHtml.includes("data-pr=\"deployContinuationHandoffState\"")
          ? "local-context-only"
          : "local-source-only",
        canAuthorize: false,
        canRequestValues: false,
      },
      {
        key: "static-rehearsal-output",
        source: "ops/reports/static-deploy-rehearsal/latest.json",
        state: staticDeployRehearsalSource.includes("blockedStateOperatorContinuationIndex")
          ? "local-evidence-only"
          : "local-static-source-only",
        canAuthorize: false,
        canRequestValues: false,
      },
      {
        key: "blocked-state-index",
        source: "ops/deploy/private-blocked-state-operator-continuation-index.md",
        state: "private-read-only-context",
        canAuthorize: false,
        canRequestValues: false,
      },
    ],
  }),
  "generated admin-data/product/static derived blocked-state operator continuation index"
);
if (staticRehearsalLatest?.blockedStateOperatorContinuationIndex) {
  assertBlockedStateOperatorContinuationIndexContract(
    staticRehearsalLatest.blockedStateOperatorContinuationIndex,
    "static rehearsal latest.json blocked-state operator continuation index"
  );
}

assertAutonomousDeployStopLedgerContract(autonomousDeployStopLedgerFixture(), "deterministic fixture");
assertAutonomousDeployStopLedgerContract(
  autonomousDeployStopLedgerFixture({
    stopScope: [
      {
        key: "admin-data",
        source: "website/admin-data.json",
        state: JSON.stringify(adminData).includes("private-autonomous-deploy-stop-ledger.md")
          ? "local-context-only"
          : "local-source-only",
        canAuthorize: false,
        canRequestValues: false,
      },
      {
        key: "product-readiness",
        source: "website/intake.html + website/review.html local readiness surfaces",
        state: reviewHtml.includes("data-pr=\"deployContinuationHandoffState\"")
          ? "local-context-only"
          : "local-source-only",
        canAuthorize: false,
        canRequestValues: false,
      },
      {
        key: "static-rehearsal-output",
        source: "ops/reports/static-deploy-rehearsal/latest.json",
        state: staticDeployRehearsalSource.includes("autonomousDeployStopLedger")
          ? "local-evidence-only"
          : "local-static-source-only",
        canAuthorize: false,
        canRequestValues: false,
      },
      {
        key: "autonomous-stop-ledger",
        source: "ops/deploy/private-autonomous-deploy-stop-ledger.md",
        state: "private-read-only-context",
        canAuthorize: false,
        canRequestValues: false,
      },
    ],
  }),
  "generated admin-data/product/static derived autonomous deploy stop ledger"
);
if (staticRehearsalLatest?.autonomousDeployStopLedger) {
  assertAutonomousDeployStopLedgerContract(
    staticRehearsalLatest.autonomousDeployStopLedger,
    "static rehearsal latest.json autonomous deploy stop ledger"
  );
}

assertPostAutonomousStopRecoveryChecklistContract(postAutonomousStopRecoveryChecklistFixture(), "deterministic fixture");
assertPostAutonomousStopRecoveryChecklistContract(
  postAutonomousStopRecoveryChecklistFixture({
    recoveryScope: [
      {
        key: "admin-data",
        source: "website/admin-data.json",
        state: JSON.stringify(adminData).includes("private-post-autonomous-stop-recovery-checklist.md")
          ? "local-context-only"
          : "local-source-only",
        canAuthorize: false,
        canRequestValues: false,
        canExecute: false,
      },
      {
        key: "product-readiness",
        source: "website/intake.html + website/review.html local readiness surfaces",
        state: reviewHtml.includes("data-pr=\"autonomousDeployStopLedgerHandoffState\"")
          ? "local-context-only"
          : "local-source-only",
        canAuthorize: false,
        canRequestValues: false,
        canExecute: false,
      },
      {
        key: "static-rehearsal-output",
        source: "ops/reports/static-deploy-rehearsal/latest.json",
        state: staticDeployRehearsalSource.includes("postAutonomousStopRecoveryChecklist")
          ? "local-evidence-only"
          : "local-static-source-only",
        canAuthorize: false,
        canRequestValues: false,
        canExecute: false,
      },
      {
        key: "post-autonomous-stop-recovery-checklist",
        source: "ops/deploy/private-post-autonomous-stop-recovery-checklist.md",
        state: "private-read-only-context",
        canAuthorize: false,
        canRequestValues: false,
        canExecute: false,
      },
    ],
  }),
  "generated admin-data/product/static derived post-autonomous-stop recovery checklist"
);
if (staticRehearsalLatest?.postAutonomousStopRecoveryChecklist) {
  assertPostAutonomousStopRecoveryChecklistContract(
    staticRehearsalLatest.postAutonomousStopRecoveryChecklist,
    "static rehearsal latest.json post-autonomous-stop recovery checklist"
  );
}

assertHumanPlatformAuthorityReEntryGateContract(humanPlatformAuthorityReEntryGateFixture(), "deterministic fixture");
assertHumanPlatformAuthorityReEntryGateContract(
  humanPlatformAuthorityReEntryGateFixture({
    reEntryScope: [
      {
        key: "admin-data",
        source: "website/admin-data.json",
        state: JSON.stringify(adminData).includes("private-human-platform-authority-re-entry-gate.md")
          ? "local-context-only"
          : "local-source-only",
        canAuthorize: false,
        canRequestValues: false,
        canExecute: false,
        canUnlockReEntry: false,
      },
      {
        key: "product-readiness",
        source: "website/intake.html + website/review.html local readiness surfaces",
        state: reviewHtml.includes("data-pr=\"postAutonomousStopRecoveryChecklistHandoffState\"")
          ? "local-recovery-boundary-only"
          : "local-source-only",
        canAuthorize: false,
        canRequestValues: false,
        canExecute: false,
        canUnlockReEntry: false,
      },
      {
        key: "static-rehearsal-output",
        source: "ops/reports/static-deploy-rehearsal/latest.json",
        state: staticDeployRehearsalSource.includes("humanPlatformAuthorityReEntryGate")
          ? "local-evidence-only"
          : "local-static-source-only",
        canAuthorize: false,
        canRequestValues: false,
        canExecute: false,
        canUnlockReEntry: false,
      },
      {
        key: "human-platform-authority-re-entry-gate",
        source: "ops/deploy/private-human-platform-authority-re-entry-gate.md",
        state: "private-read-only-context",
        canAuthorize: false,
        canRequestValues: false,
        canExecute: false,
        canUnlockReEntry: false,
      },
    ],
  }),
  "generated admin-data/product/static derived human-platform authority re-entry gate"
);
if (staticRehearsalLatest?.humanPlatformAuthorityReEntryGate) {
  assertHumanPlatformAuthorityReEntryGateContract(
    staticRehearsalLatest.humanPlatformAuthorityReEntryGate,
    "static rehearsal latest.json human-platform authority re-entry gate"
  );
}

assertOutsideAuthorityAwaitingStateLedgerContract(outsideAuthorityAwaitingStateLedgerFixture(), "deterministic fixture");
assertOutsideAuthorityAwaitingStateLedgerContract(
  outsideAuthorityAwaitingStateLedgerFixture({
    awaitingScope: [
      {
        key: "admin-data",
        source: "website/admin-data.json",
        state: JSON.stringify(adminData).includes("private-outside-authority-awaiting-state-ledger.md")
          ? "local-context-only"
          : "local-source-only",
        canAuthorize: false,
        canRequestValues: false,
        canExecute: false,
      },
      {
        key: "product-readiness",
        source: "website/intake.html + website/review.html local readiness surfaces",
        state: reviewHtml.includes("data-pr=\"humanPlatformAuthorityReEntryGateHandoffState\"")
          ? "local-re-entry-boundary-only"
          : "local-source-only",
        canAuthorize: false,
        canRequestValues: false,
        canExecute: false,
      },
      {
        key: "static-rehearsal-output",
        source: "ops/reports/static-deploy-rehearsal/latest.json",
        state: staticDeployRehearsalSource.includes("outsideAuthorityAwaitingStateLedger")
          ? "local-evidence-only"
          : "local-static-source-only",
        canAuthorize: false,
        canRequestValues: false,
        canExecute: false,
      },
      {
        key: "outside-authority-awaiting-state-ledger",
        source: "ops/deploy/private-outside-authority-awaiting-state-ledger.md",
        state: "private-read-only-context",
        canAuthorize: false,
        canRequestValues: false,
        canExecute: false,
      },
    ],
  }),
  "generated admin-data/product/static derived outside-authority awaiting-state ledger"
);
if (staticRehearsalLatest?.outsideAuthorityAwaitingStateLedger) {
  assertOutsideAuthorityAwaitingStateLedgerContract(
    staticRehearsalLatest.outsideAuthorityAwaitingStateLedger,
    "static rehearsal latest.json outside-authority awaiting-state ledger"
  );
}

function assertBusinessControlsContract({ adminHtml, adminJs, adminData, htmlPages, mainJs, intakeJs, businessControlsPolicy }) {
  requireAll(
    adminHtml,
    [
      "business-controls",
      "business-control-summary",
      "business-control-grid",
      "metric-market-controls",
      "External Action Controls",
    ],
    "business control admin surface"
  );
  requireAll(
    adminJs,
    [
      "renderBusinessControlsVisibility",
      "renderBusinessControlCard",
      "businessControlsVisibility",
      "metric-market-controls",
      "renderPaidReviewControlActivation",
      "data-paid-review-control-activation",
    ],
    "business control renderer"
  );

  const visibility = adminData.operations?.businessControlsVisibility;
  if (!visibility || visibility.format !== "proofresume-business-controls-v1") {
    throw new Error("Admin data must expose proofresume business controls visibility.");
  }
  if (businessControlsPolicy?.format !== "proofresume-business-controls-v1") {
    throw new Error("ops/BUSINESS_CONTROLS.json must keep the proofresume-business-controls-v1 format.");
  }
  if (
    visibility.globalLimits?.dailySpendLimitUsd !== businessControlsPolicy.globalLimits?.dailySpendLimitUsd ||
    visibility.globalLimits?.dailyOutboundLimit !== businessControlsPolicy.globalLimits?.dailyOutboundLimit
  ) {
    throw new Error("Admin data business-control global limits must mirror ops/BUSINESS_CONTROLS.json.");
  }
  const controls = visibility.controls || [];
  const policyControls = businessControlsPolicy.controls || [];
  const required = ["public_deploy", "lead_capture", "outbound_outreach", "payment_collection", "analytics", "customer_data"];
  const ids = new Set(controls.map((control) => control.id));
  const missing = required.filter((id) => !ids.has(id));
  if (missing.length) {
    throw new Error(`Business controls missing required revenue controls: ${missing.join(", ")}`);
  }
  if (visibility.revenueCriticalTotal < 4) {
    throw new Error("Business controls must track the four revenue-critical controls.");
  }
  if (
    visibility.globalLimits?.monthlySpendLimitUsd !== businessControlsPolicy.globalLimits?.monthlySpendLimitUsd ||
    visibility.globalLimits?.maxPriceExperimentUsd !== businessControlsPolicy.globalLimits?.maxPriceExperimentUsd
  ) {
    throw new Error("Admin data business-control budget and pricing limits must mirror ops/BUSINESS_CONTROLS.json.");
  }

  const buyerPathReadiness = visibility.buyerPathReadiness;
  const controlActivation = buyerPathReadiness?.paidReviewInterest?.controlActivation;
  const activationSteps = controlActivation?.steps || [];
  if (!controlActivation || controlActivation.format !== "proofresume-control-activation-v1") {
    throw new Error("Admin buyer-path paid-review readiness must expose proofresume control activation readiness.");
  }
  if (!Array.isArray(activationSteps) || activationSteps.length < 4) {
    throw new Error("Control activation readiness must include one step per revenue-critical control.");
  }
  for (const requiredId of ["public_deploy", "lead_capture", "payment_collection", "analytics"]) {
    if (!activationSteps.some((step) => step?.id === requiredId)) {
      throw new Error(`Control activation readiness missing required revenue-critical step: ${requiredId}`);
    }
  }
  for (const control of controls) {
    const policyControl = policyControls.find((candidate) => candidate.id === control.id);
    if (!policyControl) {
      throw new Error(`Generated admin-data contains a business control not present in ops/BUSINESS_CONTROLS.json: ${control.id}`);
    }
    if (control.status !== policyControl.status) {
      throw new Error(`Generated admin-data control ${control.id} status must mirror ops/BUSINESS_CONTROLS.json.`);
    }
    if (!Array.isArray(control.requiredEvidenceToEnable) || !control.requiredEvidenceToEnable.length) {
      throw new Error(`Business control ${control.id} must list required evidence to enable.`);
    }
    for (const evidence of policyControl.requiredEvidenceToEnable || []) {
      if (!control.requiredEvidenceToEnable.includes(evidence)) {
        throw new Error(`Generated admin-data control ${control.id} is missing policy evidence: ${evidence}`);
      }
    }
    if (!Array.isArray(control.askUserOnlyFor) || !control.askUserOnlyFor.length) {
      throw new Error(`Business control ${control.id} must list narrow ask-only unlocks.`);
    }
    for (const ask of policyControl.askUserOnlyFor || []) {
      if (!control.askUserOnlyFor.includes(ask)) {
        throw new Error(`Generated admin-data control ${control.id} is missing policy ask-only unlock: ${ask}`);
      }
    }
    if (!Array.isArray(control.stopConditions) || !control.stopConditions.length) {
      throw new Error(`Business control ${control.id} must list stop conditions.`);
    }
    for (const stopCondition of policyControl.stopConditions || []) {
      if (!control.stopConditions.includes(stopCondition)) {
        throw new Error(`Generated admin-data control ${control.id} is missing policy stop condition: ${stopCondition}`);
      }
    }
  }
  const outbound = controls.find((control) => control.id === "outbound_outreach");
  const policyOutbound = policyControls.find((control) => control.id === "outbound_outreach");
  if (
    outbound?.status !== policyOutbound?.status ||
    outbound?.limitsWhenEnabled?.dailyMessageLimit !== policyOutbound?.limitsWhenEnabled?.dailyMessageLimit ||
    outbound?.limitsWhenEnabled?.mayAutonomouslySend !== policyOutbound?.limitsWhenEnabled?.mayAutonomouslySend
  ) {
    throw new Error("Outbound outreach admin data must mirror BUSINESS_CONTROLS status, send limit, and autonomous-send flag.");
  }
  const payments = controls.find((control) => control.id === "payment_collection");
  const policyPayments = policyControls.find((control) => control.id === "payment_collection");
  if (
    payments?.limitsWhenEnabled?.mayStoreCardData !== false ||
    payments?.limitsWhenEnabled?.maxPriceExperimentUsd !== policyPayments?.limitsWhenEnabled?.maxPriceExperimentUsd
  ) {
    throw new Error("Payment controls must mirror BUSINESS_CONTROLS pricing limit and forbid card-data storage.");
  }
  if (
    !mainJs.includes("data-business-control-action") ||
    !/element\.toggleAttribute\(["']disabled["'],\s*!(?:enabled|actionAvailable)\)/.test(mainJs)
  ) {
    throw new Error("Product payment/deploy/outreach control actions must default disabled unless the matching control is enabled.");
  }
  const customerData = controls.find((control) => control.id === "customer_data");
  const policyCustomerData = policyControls.find((control) => control.id === "customer_data");
  if (
    customerData?.status !== policyCustomerData?.status ||
    customerData?.limitsWhenEnabled?.mayStoreSensitiveResumeText !== policyCustomerData?.limitsWhenEnabled?.mayStoreSensitiveResumeText ||
    customerData?.limitsWhenEnabled?.requiresDeletionPath !== true
  ) {
    throw new Error("Customer resume data admin data must mirror BUSINESS_CONTROLS status, sensitive-data flag, and deletion-path requirement.");
  }

  requireAll(
    mainJs,
    [
      "CONTROL_SOURCE_PATH = \"ops/BUSINESS_CONTROLS.json\"",
      "loadBusinessControls",
      "controlsFromPayload",
      "proofresume-business-controls-v1",
      "failClosedControls",
      "FALLBACK_CONTROL_IDS",
      "requiredEvidenceToEnable",
    ],
    "product business-control JSON loading and fail-closed fallback"
  );
  for (const id of required) {
    if (!mainJs.includes(`"${id}"`)) {
      throw new Error(`Product business-control loader must know required control id ${id}.`);
    }
  }

  const publicPages = htmlPages
    .filter((page) => page.file !== "admin.html")
    .map((page) => `${page.file}\n${page.html}`)
    .join("\n\n")
    .toLowerCase();
  for (const token of [
    "local-only",
    "no external service",
    "no account",
    "payment credential",
    "does not process payments",
  ]) {
    if (!publicPages.includes(token)) {
      throw new Error(`Public/product copy must keep zero-spend/zero-outbound default copy: missing "${token}".`);
    }
  }
  for (const forbidden of [
    /href=["']https?:\/\/(?!127\.0\.0\.1|localhost)/i,
    /action=["']https?:\/\//i,
    /\b(?:pay now|checkout now|subscribe now|enter card|card number)\b/i,
    /\b(?:we will deploy|deploy is live|production is live|published to production)\b/i,
    /\b(?:we will email|we will text|we will dm|message prospects automatically|send outreach automatically)\b/i,
    /\b(?:upload your resume securely|submit your full resume to us|store your resume in production)\b/i,
  ]) {
    if (forbidden.test(publicPages)) {
      throw new Error(`Public/product copy implies an enabled external action: ${forbidden}`);
    }
  }

  const leadCapture = controls.find((control) => control.id === "lead_capture");
  const policyLeadCapture = policyControls.find((control) => control.id === "lead_capture");
  if (leadCapture?.status !== policyLeadCapture?.status) {
    throw new Error("Lead-capture admin data must mirror BUSINESS_CONTROLS status.");
  }
  for (const allowedField of ["name", "email", "targetRole", "source", "consentTimestamp"]) {
    if (!leadCapture?.limitsWhenEnabled?.allowedFields?.includes(allowedField)) {
      throw new Error(`Lead-capture controls must preserve allowed field: ${allowedField}`);
    }
  }
  for (const disallowedField of ["full resume text in production lead form", "government identifiers", "payment card data"]) {
    if (!leadCapture?.limitsWhenEnabled?.disallowedFields?.includes(disallowedField)) {
      throw new Error(`Lead-capture controls must preserve disallowed field: ${disallowedField}`);
    }
  }
  requireAll(
    mainJs,
    [
      "localStorage.setItem(\"proofresume:lastLead\"",
      "source: \"local-prototype\"",
      "fetch(\"/api/dev-lead\"",
      "No external service was contacted.",
      "Production lead capture remains controlled by",
      "proofresume:paidReviewInterest",
      "paymentProcessed: false",
    ],
    "local-only lead capture script"
  );
  const pricingHtml = htmlPages.find((page) => page.file === "pricing.html")?.html || "";
  requireAll(pricingHtml, ["data-paid-review-interest"], "pricing paid-review interest surface");
  requireAny(pricingHtml, ["id=\"form-status\"", "id=\"paid-review-interest-status\""], "pricing paid-review interest status surface");
  if (pricingHtml.includes("data-paid-review-interest")) {
    requireAll(
      mainJs,
      [
        "savePaidReviewInterest",
        "canCapturePaidReviewInterest",
        "proofresume:paidReviewInterest",
        "fetch(\"/api/dev-paid-review-intent\"",
        "paymentProcessed: false",
        "No checkout, card data, payment link",
        "outbound send, analytics event",
      ],
      "local paid-review interest capture contract"
    );
    const canCaptureBody = mainJs.match(/function\s+canCapturePaidReviewInterest\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
    if (/paymentControl\?\.status\s*!==\s*["']enabled["']/.test(mainJs) || /status\s*===\s*["']enabled["']/.test(canCaptureBody)) {
      throw new Error(
        "Paid-review interest capture handle is present, so local capture must not wait for payment_collection to be enabled."
      );
    }
    for (const forbidden of [
      /proofresume:paidReviewInterest[\s\S]{0,900}(?:checkout|paymentLink|paymentUrl|cardNumber|cardCvc|cardExpiry|stripe|paypal)\s*:/i,
      /proofresume:paidReviewInterest[\s\S]{0,900}(?:resumeText|rawText|normalizedText|fullResume|intakeId)\s*:/i,
      /proofresume:paidReviewInterest[\s\S]{0,900}(?:emailSent|outboundSent|analyticsSent|productionIntake|paymentProcessed)\s*:\s*true/i,
    ]) {
      if (forbidden.test(mainJs)) {
        throw new Error(`Local paid-review interest capture includes a forbidden payment/outbound/analytics/resume-intake field: ${forbidden}`);
      }
    }
  }
  if (pricingHtml.includes("data-paid-review-queue")) {
    requireAll(
      pricingHtml,
      [
        "aria-label=\"Local paid-review intent operator queue\"",
        "data-local-only=\"true\"",
        "data-revenue-evidence=\"false\"",
        "data-demand-evidence=\"false\"",
        "data-payment-evidence=\"false\"",
        "data-willingness-to-pay-evidence=\"false\"",
        "data-paid-review-queue-count",
        "data-paid-review-queue-refresh",
        "data-paid-review-queue-clear",
        "data-paid-review-queue-status",
        "data-paid-review-queue-list",
        "localStorage",
        "Local metadata only",
        "No external action",
        "No revenue evidence",
        "Revenue, demand, payment, checkout, conversion, and willingness-to-pay facts remain Not observed",
        "Cannot send messages, charge cards, create leads, enrich contacts, run analytics, request resume text, or change production controls",
      ],
      "paid-review intent triage queue local-metadata contract"
    );
    if (
      !qaIntakeFlowSource.includes("runPaidReviewIntentTriageScenario") ||
      !qaIntakeFlowSource.includes("paid-review-intent-triage-no-network") ||
      !qaIntakeFlowSource.includes("Paid-review intent triage queue remains local metadata review only")
    ) {
      throw new Error("QA intake flow must carry paid-review intent triage no-network coverage once the triage queue is exposed.");
    }
    if (
      !qaIntakeFlowSource.includes("runPaidReviewTriageExportBoundaryScenario") ||
      !qaIntakeFlowSource.includes("paid-review-triage-export-boundary-no-network") ||
      !qaIntakeFlowSource.includes("Paid-review triage export remains planning-only and cannot become follow-up drafts")
    ) {
      throw new Error("QA intake flow must carry paid-review triage export boundary coverage once the triage queue is exposed.");
    }
    const queueSource = pricingHtml.match(/<section[\s\S]*?data-paid-review-queue[\s\S]*?<\/section>/i)?.[0] || "";
    const exposesTriageExportControl =
      /data-paid-review-(?:triage|queue)-export/i.test(queueSource) || /data-paid-review-export-controls/i.test(queueSource);
    if (exposesTriageExportControl) {
      requireAll(
        queueSource,
        [
          "data-planning-only=\"true\"",
          "data-follow-up-draft-eligible=\"false\"",
          "data-outreach-eligible=\"false\"",
          "data-checkout-eligible=\"false\"",
          "data-analytics-eligible=\"false\"",
          "data-production-lead-capture-eligible=\"false\"",
          "data-production-resume-intake-eligible=\"false\"",
          "data-revenue-evidence=\"false\"",
          "data-demand-evidence=\"false\"",
          "data-payment-evidence=\"false\"",
          "data-conversion-evidence=\"false\"",
          "data-willingness-to-pay-evidence=\"false\"",
        ],
        "paid-review triage export planning-only control contract"
      );
      requireAll(
        queueSource,
        [
          "Planning only",
          "No follow-up draft",
          "No outreach",
          "No checkout",
          "No analytics",
          "No production lead capture",
          "No production resume intake",
          "Not evidence",
        ],
        "paid-review triage export blocked-outcome copy"
      );
    }
    for (const forbidden of [
      /href=["']https?:\/\//i,
      /action=["']https?:\/\//i,
      /\b(?:send now|email prospect|dm prospect|start checkout|open checkout|pay now|charge card|enter card|card number|track event|send analytics|upload resume|paste resume|create follow-up draft|draft follow-up|generate outreach|export to lead capture|export to resume intake)\b/i,
      /\b(?:mark as revenue evidence|promote to demand evidence|record payment evidence|record conversion evidence|record willingness-to-pay evidence|record willingness to pay evidence)\b/i,
    ]) {
      if (forbidden.test(queueSource)) {
        throw new Error(`Paid-review intent triage queue implies a forbidden external/business action: ${forbidden}`);
      }
    }
  }
  requireAll(
    adminJs,
    [
      "renderPaidReviewControlActivation",
      "data-paid-review-control-activation-panel",
      "Control activation readiness",
      "Read-only checklist",
    ],
    "admin control-activation readiness renderer"
  );
  requireAll(
    adminDataBuilderSource,
    [
      "proofresume-control-activation-v1",
      "controlActivationSteps",
      "missingOperatorInputs",
      "zeroExternalAction",
      "Control activation readiness is a local-only operator checklist",
    ],
    "admin-data control-activation packet builder"
  );
  if (
    !qaIntakeFlowSource.includes("runControlActivationBoundaryScenario") ||
    !qaIntakeFlowSource.includes("control-activation-boundary-no-network") ||
    !qaIntakeFlowSource.includes("Control activation packet cannot enable deploy, checkout, outbound, analytics, production capture, secret collection, production URL capture, deploy trigger capture, or card/contact/resume collection") ||
    !qaIntakeFlowSource.includes("Control activation packet export action cannot persist browser storage") ||
    !qaIntakeFlowSource.includes("Control activation packet export action does not touch lead/payment/outreach/analytics/customer-data storage paths") ||
    !qaIntakeFlowSource.includes("runActivationDecisionLedgerBoundaryScenario") ||
    !qaIntakeFlowSource.includes("activation-decision-ledger-boundary-no-network") ||
    !qaIntakeFlowSource.includes("Activation-decision ledger entries cannot mutate BUSINESS_CONTROLS or production paths") ||
    !qaIntakeFlowSource.includes("Activation-decision ledger entries cannot persist activation, lead, payment, outreach, analytics, customer-data, production, deploy, secret, contact, card, or resume paths") ||
    !qaIntakeFlowSource.includes("runActivationDecisionPacketExportBoundaryScenario") ||
    !qaIntakeFlowSource.includes("activation-decision-packet-export-boundary-no-network") ||
    !qaIntakeFlowSource.includes("Activation-decision packet export cannot mutate ops/BUSINESS_CONTROLS.json or production paths") ||
    !qaIntakeFlowSource.includes("Activation-decision packet export action cannot persist control evidence, outreach, checkout, analytics, production lead capture, production resume intake, enabled-state proof") ||
    !qaIntakeFlowSource.includes("runActivationDecisionPacketReviewStatusBoundaryScenario") ||
    !qaIntakeFlowSource.includes("activation-decision-packet-review-status-boundary-no-network") ||
    !qaIntakeFlowSource.includes("Activation-decision packet review-status markers may persist only proofresume:activationDecisionPacketReviewStatus") ||
    !qaIntakeFlowSource.includes("Activation-decision packet review-status markers cannot mutate ops/BUSINESS_CONTROLS.json or production paths")
  ) {
    throw new Error("QA intake flow must carry deterministic control activation, activation-decision ledger, activation-decision packet export, and activation-decision packet review-status boundary coverage.");
  }
  requireAll(
    mainJs,
    [
      "ACTIVATION_DECISION_PACKET_REVIEW_STATUS_KEY",
      "proofresume:activationDecisionPacketReviewStatus",
    ],
    "activation-decision packet review-status local storage key"
  );
  requireAll(
    intakeJs,
    ["proofresume:activationDecisionPacketReviewStatus", "[data-activation-decision-packet-review-status]"],
    "intake activation-decision packet review-status wiring"
  );
  requireAll(
    reviewJs,
    ["proofresume:activationDecisionPacketReviewStatus", "[data-activation-decision-packet-review-status]"],
    "review activation-decision packet review-status wiring"
  );
  requireAll(
    htmlByFile.get("intake.html") || "",
    [
      "data-activation-decision-packet-review-status",
      "data-review-status-only=\"true\"",
      "proofresume:activationDecisionPacketReviewStatus",
      "data-activation-decision-packet-review-status-input",
      "data-activation-decision-packet-review-status-save",
      "data-activation-decision-packet-review-status-target",
    ],
    "intake activation-decision packet review-status marker contract"
  );
  requireAll(
    htmlByFile.get("review.html") || "",
    [
      "data-activation-decision-packet-review-status",
      "data-review-status-only=\"true\"",
      "proofresume:activationDecisionPacketReviewStatus",
      "data-activation-decision-packet-review-status-input",
      "data-activation-decision-packet-review-status-save",
      "data-activation-decision-packet-review-status-target",
    ],
    "review activation-decision packet review-status marker contract"
  );
  requireAll(
    pricingHtml,
    [
      "data-activation-decision-packet-export",
      "proofresume-activation-decision-packet-export-v1",
      "data-local-only=\"true\"",
      "data-browser-local-ledger-only=\"true\"",
      "data-planning-only=\"true\"",
      "data-no-persistence=\"true\"",
      "data-network-enabled=\"false\"",
      "data-secret-request-enabled=\"false\"",
      "data-url-request-enabled=\"false\"",
      "data-deploy-trigger-enabled=\"false\"",
      "data-checkout-enabled=\"false\"",
      "data-outbound-enabled=\"false\"",
      "data-analytics-enabled=\"false\"",
      "data-card-data-enabled=\"false\"",
      "data-contact-data-enabled=\"false\"",
      "data-resume-data-enabled=\"false\"",
      "data-enable-control-flags=\"false\"",
      "data-includes-review-status-marker=\"true\"",
      "data-review-status-storage-key=\"proofresume:activationDecisionPacketReviewStatus\"",
      "includes the packet review status marker",
      "does not create enablement evidence",
    ],
    "activation-decision packet export boundary contract"
  );
  if (pricingHtml.includes("reads the browser-local ledger only")) {
    throw new Error(
      "Pricing activation-decision packet export copy must explicitly mention review-status marker inclusion (avoid ledger-only ambiguity)."
    );
  }
  requireAll(
    mainJs,
    [
      "buildActivationDecisionPacketExport",
      "ACTIVATION_DECISION_PACKET_REVIEW_STATUS_KEY",
      "sourceKeys: [ACTIVATION_DECISION_LEDGER_KEY, ACTIVATION_DECISION_PACKET_REVIEW_STATUS_KEY]",
      "packetReviewStatusIncluded: true",
    ],
    "activation-decision packet export includes review-status marker"
  );
  const activation =
    visibility.buyerPathReadiness?.paidReviewInterest?.controlActivation ||
    adminData.operations?.buyerPathReadiness?.paidReviewInterest?.controlActivation ||
    adminData.operations?.paidReviewInterest?.controlActivation;
  if (activation) {
    if (activation.format !== "proofresume-control-activation-v1") {
      throw new Error("Control activation packet must keep the proofresume-control-activation-v1 format.");
    }
    const activationSteps = activation.steps || [];
    const activationIds = new Set(activationSteps.map((step) => step.id));
    for (const id of ["public_deploy", "lead_capture", "payment_collection", "analytics"]) {
      if (!activationIds.has(id)) {
        throw new Error(`Control activation packet missing revenue-critical control ${id}.`);
      }
      const policyControl = policyControls.find((control) => control.id === id);
      const packetStep = activationSteps.find((step) => step.id === id);
      if (packetStep?.status !== policyControl?.status || packetStep?.enabled !== (policyControl?.status === "enabled")) {
        throw new Error(`Control activation packet ${id} must mirror BUSINESS_CONTROLS status without enabling it.`);
      }
      if (policyControl?.status !== "enabled" && !packetStep?.missingOperatorInput && !packetStep?.nextMissingUnlock) {
        throw new Error(`Control activation packet ${id} must name one missing non-secret operator/platform input.`);
      }
    }
    const external = activation.zeroExternalAction || {};
    if (
      external.dailySpendLimitUsd !== businessControlsPolicy.globalLimits?.dailySpendLimitUsd ||
      external.dailyOutboundLimit !== businessControlsPolicy.globalLimits?.dailyOutboundLimit ||
      external.maxPriceExperimentUsd !== businessControlsPolicy.globalLimits?.maxPriceExperimentUsd ||
      external.paymentCollectionEnabled !== (policyControls.find((control) => control.id === "payment_collection")?.status === "enabled") ||
      external.productionPaymentAllowed !== false ||
      external.storesCardData !== false
    ) {
      throw new Error("Control activation packet must mirror enabled control limits while preserving no production payment and no card storage.");
    }
    const serializedActivation = JSON.stringify(activation);
    for (const forbidden of [
      /deploy(?:Enabled|Allowed|Triggered|Unlocked|ActionRequested)"?\s*:\s*true/i,
      /checkout(?:Enabled|Allowed|Created)"?\s*:\s*true/i,
      /outbound(?:Enabled|Allowed|Sent|Created)"?\s*:\s*true/i,
      /analytics(?:Enabled|Allowed|Sent|Created)"?\s*:\s*true/i,
      /productionLeadCapture(?:Enabled|Allowed|Created)"?\s*:\s*true/i,
      /productionResumeIntake(?:Enabled|Allowed|Created)"?\s*:\s*true/i,
      /secret(?:Collection|Storage|Capture)(?:Enabled|Allowed)?"?\s*:\s*true/i,
      /productionUrl(?:Captured|Stored|Allowed)"?\s*:\s*true/i,
      /deployTrigger(?:Captured|Stored|Allowed)"?\s*:\s*true/i,
      /(?:card|contact|resume)(?:Collection|Capture|Storage)(?:Enabled|Allowed)?"?\s*:\s*true/i,
      /https?:\/\//i,
      /api[_-]?key\s*[:=]|secret\s*[:=]|token\s*[:=]|bearer\s+[a-z0-9]/i,
    ]) {
      if (forbidden.test(serializedActivation)) {
        throw new Error(`Control activation packet implies a forbidden external action or captured value: ${forbidden}`);
      }
    }
    for (const token of ["cannot request secrets", "deploy triggers", "production URLs", "enable external actions"]) {
      if (!String(activation.note || "").includes(token)) {
        throw new Error(`Control activation packet note must preserve boundary copy: ${token}`);
      }
    }
  }
  for (const forbidden of [/fetch\(["']https?:\/\//i, /navigator\.sendBeacon/i, /XMLHttpRequest/i]) {
    if (forbidden.test(mainJs)) {
      throw new Error(`Local lead capture must not submit to an external destination while disabled: ${forbidden}`);
    }
  }
  if (!intakeJs.includes("Local-only prototype: stored in browser localStorage only. No external service was contacted.")) {
    throw new Error("Resume intake must keep local-only/no-external submission status copy.");
  }
}

function assertConciergeFulfillmentDashboardContract({ adminHtml, adminJs, adminCss, adminData }) {
  requireAll(
    adminHtml,
    [
      "concierge-fulfillment",
      "concierge-fulfillment-state",
      "concierge-summary-grid",
      "concierge-case-list",
      "Concierge Fulfillment Dashboard",
    ],
    "concierge fulfillment admin surface"
  );
  requireAll(
    adminJs,
    [
      "renderConciergeFulfillmentDashboard",
      "conciergeFulfillmentDashboard",
      "paymentCollectionStatus",
      "Customer data:",
      "Live fulfillment disabled",
    ],
    "concierge fulfillment renderer"
  );
  requireAll(
    adminCss,
    ["concierge-summary-grid", "concierge-case-card", "concierge-checklist"],
    "concierge fulfillment styles"
  );

  const dashboard = adminData.operations?.conciergeFulfillmentDashboard;
  if (!dashboard || dashboard.format !== "proofresume-concierge-fulfillment-dashboard-v1") {
    throw new Error("Admin data must expose the ProofResume concierge fulfillment dashboard contract.");
  }
  if (
    dashboard.localOnly !== true ||
    dashboard.paymentCollectionEnabled !== false ||
    dashboard.productionCustomerDataEnabled !== false ||
    dashboard.outboundDeliveryEnabled !== false ||
    dashboard.providerActionsEnabled !== false
  ) {
    throw new Error("Concierge fulfillment dashboard must remain local-only with payment, customer-data, delivery, and provider actions disabled.");
  }
  if (dashboard.productQueueItemId !== "NORTHSTAR-CONCIERGE-FULFILLMENT-DASHBOARD") {
    throw new Error("Concierge fulfillment dashboard must cite the north-star product queue item.");
  }
  if (!String(dashboard.sourcePattern || "").includes("commons/templates/concierge-fulfillment")) {
    throw new Error("Concierge fulfillment dashboard must consume the Commons concierge fulfillment pattern.");
  }
  const checklist = dashboard.checklist || [];
  for (const id of ["consent", "materials", "target_job", "packet", "payment", "delivery"]) {
    if (!checklist.some((item) => item.id === id)) {
      throw new Error(`Concierge fulfillment checklist missing ${id}.`);
    }
  }
  const cases = dashboard.cases || [];
  if (cases.length < 2) {
    throw new Error("Concierge fulfillment dashboard must show at least sample/rehearsal and paid-interest handoff cases.");
  }
  const serialized = JSON.stringify(dashboard);
  for (const token of ["consentState", "materialsReceived", "targetJob", "packetStatus", "refundSupportStatus", "followUpOutcome"]) {
    if (!serialized.includes(token)) {
      throw new Error(`Concierge fulfillment dashboard missing tracked field ${token}.`);
    }
  }
  for (const forbidden of [
    /https?:\/\//i,
    /api[_-]?key\s*[:=]/i,
    /secret\s*[:=]/i,
    /token\s*[:=]/i,
    /bearer\s+[a-z0-9]/i,
    /payment(?:Collection|Action|Link|Refund)(?:Enabled|Allowed|Created)"?\s*:\s*true/i,
    /productionCustomerData(?:Enabled|Allowed|Stored)"?\s*:\s*true/i,
    /outbound(?:Delivery|Send|Followup)(?:Enabled|Allowed|Sent)"?\s*:\s*true/i,
  ]) {
    if (forbidden.test(serialized)) {
      throw new Error(`Concierge fulfillment dashboard implies a forbidden external action or captured value: ${forbidden}`);
    }
  }
}

function assertRedactedSessionEvidenceInboxContract({ adminHtml, adminJs, adminCss, adminData }) {
  requireAll(
    adminHtml,
    [
      "redacted-evidence-inbox",
      "redacted-evidence-state",
      "redacted-evidence-summary",
      "redacted-evidence-lanes",
      "data-evidence-load-workspace",
      "data-evidence-export",
      "data-evidence-clear",
      "Redacted First-Session Evidence Inbox",
      "cannot store raw resumes",
    ],
    "redacted evidence inbox admin surface"
  );
  requireAll(
    adminJs,
    [
      "proofresume:redactedSessionEvidenceInbox",
      "proofresume-redacted-session-evidence-inbox-v1",
      "proofresume-redacted-session-evidence-record-v1",
      "REDACTED_EVIDENCE_KINDS",
      "redactedEvidenceRecordFromWorkspace",
      "renderRedactedSessionEvidenceInbox",
      "sampleOrOwnerApprovedRedactedOnly",
      "noQueueMutation: true",
      "noRawResume: true",
      "noProspectIdentity: true",
      "noPrivateReply: true",
      "noPaymentData: true",
      "noCredentials: true",
      "noCustomerMaterials: true",
      "queueMutationAllowed: false",
      "externalAction: false",
    ],
    "redacted evidence inbox local contract"
  );
  requireAll(
    adminCss,
    [
      "redacted-evidence-summary",
      "redacted-evidence-lanes",
      "redacted-evidence-card",
      "rehearsal_evidence",
      "authorized_feedback",
      "paid_interest_note",
      "privacy_objection",
      "no_action_no_offer_outcome",
    ],
    "redacted evidence inbox styles"
  );

  const inbox = adminData.operations?.redactedSessionEvidenceInbox;
  if (!inbox || inbox.format !== "proofresume-redacted-session-evidence-inbox-v1") {
    throw new Error("Admin data must expose the redacted first-session evidence inbox contract.");
  }
  if (
    inbox.productQueueItemId !== "NORTHSTAR-REDACTED-SESSION-EVIDENCE-INBOX" ||
    inbox.localOnly !== true ||
    inbox.sampleOrOwnerApprovedRedactedOnly !== true ||
    inbox.queueMutationAllowed !== false ||
    inbox.externalActionAllowed !== false ||
    inbox.noRevenueClaim !== true ||
    inbox.noCustomerFeedbackClaim !== true
  ) {
    throw new Error("Redacted evidence inbox must stay local/sample-or-redacted only with queue mutation and external action disabled.");
  }
  if (!String(inbox.sourcePattern || "").includes("commons/templates/customer-evidence-redaction")) {
    throw new Error("Redacted evidence inbox must cite the Commons customer evidence redaction pattern.");
  }
  const records = inbox.records || [];
  const requiredKinds = ["rehearsal_evidence", "authorized_feedback", "paid_interest_note", "privacy_objection", "no_action_no_offer_outcome"];
  for (const kind of requiredKinds) {
    if (!records.some((record) => record.evidenceKind === kind)) {
      throw new Error(`Redacted evidence inbox missing ${kind} sample/slot.`);
    }
  }
  const serialized = JSON.stringify(inbox);
  for (const token of [
    "raw resumes",
    "prospect identities",
    "contact details",
    "private replies",
    "credentials",
    "payment data",
    "customer materials",
  ]) {
    if (!serialized.includes(token)) {
      throw new Error(`Redacted evidence inbox missing forbidden-field guardrail: ${token}`);
    }
  }
  for (const record of records) {
    if (record.format !== "proofresume-redacted-session-evidence-record-v1") {
      throw new Error(`Redacted evidence record has unexpected format: ${record.format}`);
    }
    if (!requiredKinds.includes(record.evidenceKind)) {
      throw new Error(`Redacted evidence record has unexpected kind: ${record.evidenceKind}`);
    }
    if (record.boundaries?.noQueueMutation !== true) {
      throw new Error(`Redacted evidence record ${record.evidenceId} must keep queue mutation disabled.`);
    }
    if (!["sample_only", "needs_review", "redacted_approved"].includes(record.redactionReviewState)) {
      throw new Error(`Redacted evidence record ${record.evidenceId} has unsafe redaction state ${record.redactionReviewState}.`);
    }
  }
  for (const forbidden of [
    /https?:\/\//i,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /api[_-]?key\s*[:=]/i,
    /secret\s*[:=]/i,
    /token\s*[:=]/i,
    /bearer\s+[a-z0-9]/i,
    /queueMutationAllowed"?\s*:\s*true/i,
    /externalActionAllowed"?\s*:\s*true/i,
    /(?:^|[^A-Za-z])rawResume(?:Stored|Included|Visible)"?\s*:\s*true/i,
    /(?:^|[^A-Za-z])customerMaterials(?:Stored|Included|Visible)"?\s*:\s*true/i,
  ]) {
    if (forbidden.test(serialized)) {
      throw new Error(`Redacted evidence inbox leaked a forbidden value or enabled unsafe action: ${forbidden}`);
    }
  }
}

function assertFirstCustomerLaunchRoomContract({ adminHtml, adminJs, adminCss, adminData, adminDataBuilderSource }) {
  requireAll(
    adminHtml,
    [
      "first-customer-launch-room",
      "launch-room-state",
      "launch-room-summary",
      "launch-room-next-action",
      "launch-room-grid",
      "Readiness, Evidence, Gates, and Next Route",
    ],
    "first-customer launch room admin surface"
  );
  requireAll(
    adminJs,
    [
      "renderFirstCustomerLaunchRoom",
      "launch-room-summary",
      "launch-room-next-action",
      "Exactly one next route",
      "externalActionAllowedFromLaunchRoom",
      "Blocked claims",
    ],
    "first-customer launch room renderer"
  );
  requireAll(
    adminCss,
    ["first-customer-launch-room", "launch-room-summary", "launch-room-card", "launch-room-next-action", "launch-room-list"],
    "first-customer launch room styles"
  );
  requireAll(
    adminDataBuilderSource,
    [
      "buildFirstCustomerLaunchRoomVisibility",
      "proofresume-first-customer-launch-room-v1",
      "NORTHSTAR-FIRST-CUSTOMER-LAUNCH-ROOM-INTEGRATION",
      "commons/templates/first-customer-launch-room",
      "queueMutationAllowed: false",
      "externalActionAllowed: false",
      "providerActionAllowed: false",
      "canClaimCustomerFeedback: false",
      "canClaimWillingnessToPay: false",
      "canClaimRevenue: false",
      "canDisplayPaymentLink: false",
      "canRequestTestimonialOrReferral: false",
      "canStoreProductionCustomerData: false",
      "exactlyOnePrimaryRoute: true",
      "mutatesQueues: false",
    ],
    "first-customer launch room admin-data builder"
  );

  const room = adminData.operations?.firstCustomerLaunchRoom;
  if (!room || room.format !== "proofresume-first-customer-launch-room-v1") {
    throw new Error("Admin data must expose the first-customer launch room contract.");
  }
  if (
    room.productQueueItemId !== "NORTHSTAR-FIRST-CUSTOMER-LAUNCH-ROOM-INTEGRATION" ||
    room.localOnly !== true ||
    room.sampleOrAuthorizedRedactedOnly !== true ||
    room.queueMutationAllowed !== false ||
    room.externalActionAllowed !== false ||
    room.providerActionAllowed !== false ||
    room.canClaimCustomerFeedback !== false ||
    room.canClaimWillingnessToPay !== false ||
    room.canClaimRevenue !== false ||
    room.canDisplayPaymentLink !== false ||
    room.canRequestTestimonialOrReferral !== false ||
    room.canStoreProductionCustomerData !== false
  ) {
    throw new Error("First-customer launch room must stay local-only, queue-read-only, and external-action disabled.");
  }
  if (!String(room.sourcePattern || "").includes("commons/templates/first-customer-launch-room")) {
    throw new Error("First-customer launch room must cite the Commons launch-room pattern.");
  }
  const readinessIds = new Set((room.readinessAreas || []).map((item) => item.id));
  for (const id of ["product_demo", "proof_audit", "concierge_fulfillment", "feedback_evidence", "owner_blockers", "qa_reviewer_status"]) {
    if (!readinessIds.has(id)) {
      throw new Error(`First-customer launch room missing readiness area ${id}.`);
    }
  }
  const gateIds = new Set((room.businessGateState || []).map((item) => item.id));
  for (const id of ["public_deploy", "outbound_outreach", "payment_collection", "analytics", "customer_data", "lead_capture"]) {
    if (!gateIds.has(id)) {
      throw new Error(`First-customer launch room missing business gate ${id}.`);
    }
  }
  const queueLabels = new Set((room.queueFloorState || []).map((item) => item.label));
  for (const label of ["Product", "Business", "Strategy", "Commons"]) {
    if (!queueLabels.has(label)) {
      throw new Error(`First-customer launch room missing queue floor ${label}.`);
    }
  }
  if (room.nextAgentRouting?.exactlyOnePrimaryRoute !== true || room.nextAgentRouting?.mutatesQueues !== false) {
    throw new Error("First-customer launch room must expose exactly one read-only next route.");
  }
  if (room.nextAgentRouting?.queueItemId !== "NORTHSTAR-CONSENTED-AUDIT-HANDOFF-PREVIEW") {
    throw new Error("First-customer launch room must route next to the consented audit handoff preview.");
  }
  const serialized = JSON.stringify(room);
  for (const token of ["customer feedback observed", "willingness to pay observed", "revenue observed", "payment collection ready"]) {
    if (!serialized.includes(token)) {
      throw new Error(`First-customer launch room missing blocked claim: ${token}`);
    }
  }
  for (const forbidden of [
    /https?:\/\//i,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /api[_-]?key\s*[:=]/i,
    /secret\s*[:=]/i,
    /token\s*[:=]/i,
    /bearer\s+[a-z0-9]/i,
    /queueMutationAllowed"?\s*:\s*true/i,
    /externalActionAllowed"?\s*:\s*true/i,
    /providerActionAllowed"?\s*:\s*true/i,
    /canClaim(?:CustomerFeedback|WillingnessToPay|Revenue)"?\s*:\s*true/i,
    /can(?:DisplayPaymentLink|RequestTestimonialOrReferral|StoreProductionCustomerData)"?\s*:\s*true/i,
  ]) {
    if (forbidden.test(serialized)) {
      throw new Error(`First-customer launch room leaked a forbidden value or enabled unsafe state: ${forbidden}`);
    }
  }
}

function assertFirstCustomerSignalSurfaceContract({ adminHtml, adminJs, adminData, adminDataBuilderSource }) {
  requireAll(
    adminHtml,
    [
      "first-customer-signal-surface",
      "signal-surface-state",
      "signal-surface-summary",
      "signal-surface-route",
      "signal-surface-grid",
      "Value Receipt, Redacted Reaction, Gates, and Route",
    ],
    "first-customer signal surface admin surface"
  );
  requireAll(
    adminJs,
    [
      "renderFirstCustomerSignalSurface",
      "firstCustomerSignalSurface",
      "signal-surface-summary",
      "Exactly one next route",
      "Raw private material accepted",
      "Forbidden outcomes",
    ],
    "first-customer signal surface renderer"
  );
  requireAll(
    adminDataBuilderSource,
    [
      "buildFirstCustomerSignalSurfaceVisibility",
      "proofresume-first-customer-signal-surface-integration-v1",
      "NORTHSTAR-FIRST-CUSTOMER-SIGNAL-SURFACE-INTEGRATION",
      "first_customer_value_receipt_packet",
      "first_customer_redacted_reaction_inbox",
      "first_customer_capture_handoff_packet",
      "first_customer_signal_qa_fixture_matrix",
      "commons_single_authorized_session_prep_pattern",
      "sampleOrOwnerApprovedRedactedOnly: true",
      "queueMutationAllowed: false",
      "externalActionAllowed: false",
      "canClaimCustomerFeedback: false",
      "canClaimWillingnessToPay: false",
      "canClaimPaymentIntent: false",
      "canClaimRevenue: false",
      "canDisplayPaymentLink: false",
      "canRequestTestimonialOrReferral: false",
      "canStoreProductionCustomerData: false",
      "exactlyOneRoute: true",
      "mustNotMarkDownstreamDone: true",
    ],
    "first-customer signal surface admin-data builder"
  );

  const surface = adminData.operations?.firstCustomerSignalSurface;
  if (!surface || surface.format !== "proofresume-first-customer-signal-surface-integration-v1") {
    throw new Error("Admin data must expose the first-customer signal surface contract.");
  }
  if (
    surface.productQueueItemId !== "NORTHSTAR-FIRST-CUSTOMER-SIGNAL-SURFACE-INTEGRATION" ||
    surface.localOnly !== true ||
    surface.sampleOrOwnerApprovedRedactedOnly !== true ||
    surface.queueMutationAllowed !== false ||
    surface.externalActionAllowed !== false ||
    surface.providerActionAllowed !== false ||
    surface.canClaimCustomerFeedback !== false ||
    surface.canClaimWillingnessToPay !== false ||
    surface.canClaimPaymentIntent !== false ||
    surface.canClaimRevenue !== false ||
    surface.canDisplayPaymentLink !== false ||
    surface.canRequestTestimonialOrReferral !== false ||
    surface.canStoreProductionCustomerData !== false
  ) {
    throw new Error("First-customer signal surface must stay local-only, read-only, and external-action disabled.");
  }
  const sourceIds = new Set((surface.sourceArtifacts || []).map((item) => item.id));
  for (const id of [
    "first_customer_value_receipt_packet",
    "first_customer_live_feedback_capture_adapter",
    "first_customer_signal_cockpit",
    "first_customer_redacted_reaction_inbox",
    "first_customer_capture_handoff_packet",
    "first_customer_signal_qa_fixture_matrix",
    "commons_single_authorized_session_prep_pattern",
  ]) {
    if (!sourceIds.has(id)) {
      throw new Error(`First-customer signal surface missing source artifact ${id}.`);
    }
  }
  if (surface.valueReceipt?.selectedSafeRoute !== "business_private_paid_packet_prep_no_checkout") {
    throw new Error("First-customer signal surface must display the paid-packet no-checkout route from the value receipt.");
  }
  if (surface.redactedReaction?.signalType !== "paid_packet_value" || surface.redactedReaction?.isPaymentIntent !== false) {
    throw new Error("First-customer signal surface paid-packet reaction must not become payment intent.");
  }
  if (
    surface.consentAndRedaction?.rawPrivateMaterialAccepted !== false ||
    surface.consentAndRedaction?.prospectIdentityAllowed !== false ||
    surface.consentAndRedaction?.contactDetailAllowed !== false ||
    surface.consentAndRedaction?.productionCustomerMaterialAllowed !== false
  ) {
    throw new Error("First-customer signal surface must fail closed for private material and identity/contact/customer material.");
  }
  const blockedGateIds = new Set((surface.blockedGates || []).map((gate) => gate.id));
  for (const id of ["payment_authority", "customer_data_authority"]) {
    if (!blockedGateIds.has(id)) {
      throw new Error(`First-customer signal surface missing blocked gate ${id}.`);
    }
  }
  if (
    surface.recommendedRoute?.routeId !== "business_private_paid_packet_prep_no_checkout" ||
    surface.recommendedRoute?.exactlyOneRoute !== true ||
    surface.recommendedRoute?.queueMutationAllowed !== false ||
    surface.recommendedRoute?.externalActionAllowed !== false ||
    surface.recommendedRoute?.mustNotMarkDownstreamDone !== true ||
    surface.recommendedRoute?.isCustomerFeedbackEvidence !== false ||
    surface.recommendedRoute?.isPaymentIntentEvidence !== false ||
    surface.recommendedRoute?.isRevenueEvidence !== false
  ) {
    throw new Error("First-customer signal surface must expose exactly one internal no-checkout route with no unsafe evidence claim.");
  }
  const serialized = JSON.stringify(surface);
  for (const forbidden of [
    /https?:\/\//i,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /api[_-]?key\s*[:=]/i,
    /secret\s*[:=]/i,
    /token\s*[:=]/i,
    /bearer\s+[a-z0-9]/i,
    /queueMutationAllowed"?\s*:\s*true/i,
    /externalActionAllowed"?\s*:\s*true/i,
    /providerActionAllowed"?\s*:\s*true/i,
    /canClaim(?:CustomerFeedback|WillingnessToPay|PaymentIntent|Revenue)"?\s*:\s*true/i,
    /can(?:DisplayPaymentLink|RequestTestimonialOrReferral|StoreProductionCustomerData)"?\s*:\s*true/i,
  ]) {
    if (forbidden.test(serialized)) {
      throw new Error(`First-customer signal surface leaked a forbidden value or enabled unsafe state: ${forbidden}`);
    }
  }
}

function assertFeedbackRoadmapLoopContract({ adminHtml, adminJs, adminCss }) {
  requireAll(
    adminHtml,
    [
      "feedback-roadmap",
      "feedback-roadmap-form",
      "feedback-roadmap-summary",
      "feedback-roadmap-drafts",
      "data-feedback-load-workspace",
      "data-feedback-export",
      "data-feedback-clear",
      "Feedback-to-Roadmap Loop",
    ],
    "feedback-to-roadmap admin surface"
  );
  requireAll(
    adminJs,
    [
      "proofresume-feedback-to-roadmap-loop-v1",
      "proofresume-feedback-roadmap-queue-draft-v1",
      "FEEDBACK_ROADMAP_CLASSES",
      "classifyFeedbackRoadmapObservation",
      "buildFeedbackRoadmapDraft",
      "renderFeedbackRoadmap",
      "bindFeedbackRoadmap",
      "readWorkspaceRehearsalObservations",
      "readyAutomatically: false",
      "canMarkReady: false",
      "noExternalAction: true",
      "noCustomerDataStored: true",
      "noRevenueClaim: true",
      "noWillingnessToPayClaim: true",
      "external-url-redacted",
      "credential-redacted",
      "Queue suggestions remain drafts until queue discipline",
    ],
    "feedback-to-roadmap local draft contract"
  );
  requireAll(
    adminJs,
    [
      "product_friction",
      "trust_objection",
      "willingness_to_pay_signal",
      "gtm_objection",
      "infrastructure_blocker",
      "blocked_until_real_evidence",
      "draft_review_required",
      "draft_later",
    ],
    "feedback-to-roadmap classification taxonomy"
  );
  requireAll(
    adminCss,
    [
      "feedback-roadmap-workbench",
      "feedback-roadmap-form",
      "feedback-roadmap-summary",
      "feedback-roadmap-card",
      "feedback-roadmap-meta",
    ],
    "feedback-to-roadmap styles"
  );

  const forbiddenReady = /readyAutomatically\s*:\s*true|canMarkReady\s*:\s*true|queueSuggestionsReadyAutomatically"?\s*:\s*true/;
  if (forbiddenReady.test(adminJs)) {
    throw new Error("Feedback-to-roadmap loop must not mark queue suggestions ready automatically.");
  }
  for (const forbidden of [
    /fetch\(["']https?:\/\//i,
    /navigator\.sendBeacon/i,
    /XMLHttpRequest/i,
    /(?:^|[^A-Za-z])externalAction(?:Taken|Enabled|Allowed)?"?\s*:\s*true/i,
    /(?:^|[^A-Za-z])customerData(?:Stored|Enabled|Allowed)?"?\s*:\s*true/i,
    /(?:^|[^A-Za-z])revenue(?:Claim|Evidence|Observed)"?\s*:\s*true/i,
    /(?:^|[^A-Za-z])willingnessToPay(?:Claim|Evidence|Observed)"?\s*:\s*true/i,
  ]) {
    if (forbidden.test(adminJs)) {
      throw new Error(`Feedback-to-roadmap loop implies a forbidden external action, claim, or captured value: ${forbidden}`);
    }
  }
}

function assertPostPreviewDeterministicQaCoverageContract({
  adminHtml,
  adminJs,
  adminData,
  appHtml,
  appJs,
  qaTargetJobPackSource,
}) {
  requireAll(
    appHtml,
    [
      "data-target-preferences",
      "data-job-list",
      "data-application-approval-tracker",
      "data-proof-audit-packet",
      "data-paid-packet-customer-preview",
      "data-paid-packet-preview-choices",
      "data-paid-packet-safe-route",
      "data-paid-packet-route-detail",
      "Approve preview for no-send offer prep",
      "Edit needed before any paid ask",
      "Not now or no-fit",
      "Blocked by trust, support, or customer-data questions",
      "No checkout",
    ],
    "post-preview customer workspace QA handles"
  );

  requireAll(
    appJs,
    [
      "proofresume-paid-packet-customer-preview-v1",
      "PAID_PACKET_PREVIEW_CHOICES",
      "normalizePaidPacketPreviewState",
      "renderPaidPacketPreview",
      "business_first_paid_packet_no_send_offer_prep",
      "product_paid_packet_preview_clarity_repair",
      "approval_unblocker_paid_preview_trust_support_customer_data_repair",
      "externalActionAllowed: false",
      "queueMutationAllowed: false",
      "downstreamDoneClaimAllowed: false",
      "productionCustomerDataAllowed: false",
    ],
    "post-preview paid-packet local route-state contract"
  );

  requireAll(
    adminHtml,
    [
      "first-authorized-session-runner",
      "first-customer-pilot-console",
      "pilot-revenue-simulator",
      "consented-audit-handoff",
      "owner-authority-repair",
      "blocked gates",
      "exactly one next route",
      "without displaying payment links",
      "collecting money",
      "claiming revenue signal",
    ],
    "post-preview admin QA handles"
  );

  requireAll(
    adminJs,
    [
      "renderFirstAuthorizedSessionRunner",
      "renderFirstCustomerPilotConsole",
      "renderFirstCustomerPilotRevenueSimulator",
      "renderConsentedAuditHandoffPreview",
      "renderOwnerAuthorityRepairLoopPreview",
      "No send, no deploy, no payment, no customer data, no queue mutation, no secrets.",
    ],
    "post-preview admin renderer contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "assertPostPreviewDeterministicCoverageHarness",
      "assertFirstAuditCommandRoom",
      "assertFirstAuditResultExportPacket",
      "assertFirstAuthorizedSessionRunner",
      "assertFirstSessionRepairRoom",
      "assertFirstSessionPacketReplayHarness",
      "assertFirstCustomerPilotConsole",
      "assertFirstCustomerPilotRevenueSimulator",
      "assertFirstCustomerPilotWorkspaceWalkthrough",
      "assertPaidPacketCustomerPreview",
      "qa-target-job-pack fell back to static checks (Playwright browsers unavailable).",
      "qa-target-job-pack static fallback passed",
    ],
    "post-preview deterministic QA harness wiring"
  );

  const fixtureSpecs = [
    {
      id: "NORTHSTAR-FIRST-AUDIT-COMMAND-ROOM",
      checker: "ops/product/check_first_audit_command_room.cjs",
      fixture: "ops/product/first-audit-command-room.sample.json",
      format: "proofresume-first-audit-command-room-v1",
    },
    {
      id: "NORTHSTAR-FIRST-AUDIT-RESULT-EXPORT-PACKET",
      checker: "ops/product/check_first_audit_result_export_packet.cjs",
      fixture: "ops/product/first-audit-result-export-packet.sample.json",
      format: "proofresume-first-audit-result-export-packet-v1",
    },
    {
      id: "NORTHSTAR-FIRST-AUTHORIZED-SESSION-RUNNER",
      checker: "ops/product/check_first_authorized_session_runner.cjs",
      fixture: "ops/product/first-authorized-session-runner.sample.json",
      format: "proofresume-first-authorized-session-runner-v1",
    },
    {
      id: "NORTHSTAR-FIRST-SESSION-REPAIR-ROOM",
      checker: "ops/product/check_first_session_repair_room.cjs",
      fixture: "ops/product/first-session-repair-room.sample.json",
      format: "proofresume-first-session-repair-room-v1",
    },
    {
      id: "NORTHSTAR-FIRST-SESSION-PACKET-REPLAY-HARNESS",
      checker: "ops/product/check_first_session_packet_replay_harness.cjs",
      fixture: "ops/product/first-session-packet-replay-harness.sample.json",
      format: "proofresume-first-session-packet-replay-harness-v1",
    },
    {
      id: "NORTHSTAR-FIRST-CUSTOMER-PILOT-CONSOLE",
      checker: "ops/product/check_first_customer_pilot_console.cjs",
      fixture: "ops/product/first-customer-pilot-console.sample.json",
      format: "proofresume-first-customer-pilot-console-v1",
      adminPath: "website/admin.html#first-customer-pilot-console",
    },
    {
      id: "NORTHSTAR-FIRST-CUSTOMER-PILOT-REVENUE-SIMULATOR",
      checker: "ops/product/check_first_customer_pilot_revenue_simulator.cjs",
      fixture: "ops/product/first-customer-pilot-revenue-simulator.sample.json",
      format: "proofresume-first-customer-pilot-revenue-simulator-v1",
      adminPath: "website/admin.html#pilot-revenue-simulator",
    },
    {
      id: "NORTHSTAR-PILOT-WORKSPACE-GUIDED-WALKTHROUGH",
      checker: "ops/product/check_first_customer_pilot_workspace_walkthrough.cjs",
      fixture: "ops/product/first-customer-pilot-workspace-walkthrough.sample.json",
      format: "proofresume-first-customer-pilot-workspace-walkthrough-v1",
    },
    {
      id: "NORTHSTAR-PAID-PACKET-CUSTOMER-PREVIEW",
      checker: "ops/product/check_paid_packet_customer_preview.cjs",
      fixture: "ops/product/paid-packet-customer-preview.sample.json",
      format: "proofresume-paid-packet-customer-preview-v1",
    },
  ];

  const forbiddenTrueFlags = new Set([
    "checkoutAllowed",
    "paymentLinkAllowed",
    "paymentCollectionAllowed",
    "productionCustomerDataAllowed",
    "productionCustomerDataAccepted",
    "customerMaterialAccepted",
    "customerMaterialsStored",
    "analyticsSend",
    "outreachSend",
    "queueMutationAllowed",
    "downstreamDoneClaimAllowed",
    "downstreamCompletionClaimAllowed",
    "externalActionAllowed",
    "providerActionAllowed",
    "canClaimCustomerFeedback",
    "canClaimWillingnessToPay",
    "canClaimPaymentIntent",
    "canClaimRevenue",
    "paymentIntentEvidence",
    "paymentEvidence",
    "revenueEvidence",
    "paymentObserved",
    "paymentIntentObserved",
    "revenueObserved",
    "publicProofObserved",
    "externalApplyAllowed",
    "deployEvidenceObserved",
    "downstreamQueueMutationAllowed",
  ]);

  function assertNoForbiddenTrueFlags(value, label, pathParts = []) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => assertNoForbiddenTrueFlags(entry, label, pathParts.concat(String(index))));
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      const currentPath = pathParts.concat(key);
      if (forbiddenTrueFlags.has(key) && child === true) {
        throw new Error(`${label} enabled forbidden post-preview flag ${currentPath.join(".")}`);
      }
      assertNoForbiddenTrueFlags(child, label, currentPath);
    }
  }

  function assertEmptyActionArrays(fixture, label) {
    const performed = fixture.repoSafety || {};
    for (const key of ["externalActionsPerformed", "queueMutationsPerformed"]) {
      if (Array.isArray(performed[key]) && performed[key].length) {
        throw new Error(`${label} recorded forbidden ${key}: ${performed[key].join(", ")}`);
      }
    }
  }

  const combinedFixtures = [];
  for (const spec of fixtureSpecs) {
    if (!fs.existsSync(path.join(projectRoot, spec.checker))) {
      throw new Error(`Post-preview QA coverage missing checker ${spec.checker}`);
    }
    const fixture = readJsonIfExists(spec.fixture);
    if (!fixture) throw new Error(`Post-preview QA coverage missing fixture ${spec.fixture}`);
    if (fixture.format !== spec.format) throw new Error(`${spec.fixture} has unexpected format ${fixture.format}`);
    if (fixture.queueItemId !== spec.id) throw new Error(`${spec.fixture} queueItemId mismatch`);
    if (spec.adminPath && fixture.adminSurfacePath !== spec.adminPath) {
      throw new Error(`${spec.fixture} adminSurfacePath mismatch`);
    }
    assertNoForbiddenTrueFlags(fixture, spec.fixture);
    assertEmptyActionArrays(fixture, spec.fixture);
    combinedFixtures.push(JSON.stringify(fixture));
  }

  const combined = combinedFixtures.join("\n");
  for (const token of [
    "payment_authority",
    "customer_data_authority",
    "support_refund_policy",
    "public_proof_authority",
    "production_deploy_health_evidence",
    "candidate_and_target_job_consent_for_any_application",
  ]) {
    if (!combined.includes(token)) {
      throw new Error(`Post-preview fixture coverage missing blocked gate token ${token}`);
    }
  }

  for (const forbidden of [
    /https?:\/\//i,
    /\b(?:cs_(?:test|live)|pi_|price_|prod_|cus_|sub_|in_)[A-Za-z0-9]{8,}\b/i,
    /\b(?:deployed to production|sent to prospect|sent to customer|collected payment|displayed payment link|displayed checkout|submitted application|contacted employer)\b/i,
    /\b(?:customer feedback|willingness to pay|payment intent|payment|public proof|testimonial permission|referral permission|revenue) observed\b/i,
  ]) {
    if (forbidden.test(combined)) {
      throw new Error(`Post-preview fixtures leaked forbidden external/action/claim marker: ${forbidden}`);
    }
  }

  const authorizedRunner = adminData.operations?.firstAuthorizedSessionRunner;
  const pilotConsole = adminData.operations?.firstCustomerPilotConsole;
  const revenueSimulator = adminData.operations?.firstCustomerPilotRevenueSimulator;
  for (const [label, surface] of [
    ["first authorized session runner", authorizedRunner],
    ["first customer pilot console", pilotConsole],
    ["first customer pilot revenue simulator", revenueSimulator],
  ]) {
    if (!surface || surface.localOnly !== true || surface.externalActionAllowed !== false) {
      throw new Error(`Admin data ${label} must remain local-only and external-action disabled.`);
    }
    if (!String(surface.surfacePath || "").startsWith("website/admin.html#")) {
      throw new Error(`Admin data ${label} must expose a local admin surface path.`);
    }
  }
}

assertCredentialedDeployHumanApprovalToggleContract({
  intakeHtml,
  reviewHtml,
  intakeJs,
  reviewJs,
});
assertStructuredExtractionQaContract({
  intakeHtml,
  reviewHtml,
  intakeJs,
  reviewJs,
  qaSource: qaIntakeFlowSource,
});
assertBusinessControlsContract({
  adminHtml,
  adminJs,
  adminData,
  htmlPages,
  mainJs: js,
  intakeJs,
  businessControlsPolicy,
});
assertConciergeFulfillmentDashboardContract({
  adminHtml,
  adminJs,
  adminCss,
  adminData,
});
assertRedactedSessionEvidenceInboxContract({
  adminHtml,
  adminJs,
  adminCss,
  adminData,
});
assertFirstCustomerLaunchRoomContract({
  adminHtml,
  adminJs,
  adminCss,
  adminData,
  adminDataBuilderSource,
});
assertFirstCustomerSignalSurfaceContract({
  adminHtml,
  adminJs,
  adminData,
  adminDataBuilderSource,
});
assertFeedbackRoadmapLoopContract({
  adminHtml,
  adminJs,
  adminCss,
});
assertPostPreviewDeterministicQaCoverageContract({
  adminHtml,
  adminJs,
  adminData,
  appHtml,
  appJs,
  qaTargetJobPackSource,
});

function assertTargetJobSourceAdapterMapperContract({ targetJobHtml, targetJobJs }) {
  requireAll(
    targetJobHtml || "",
    [
      "data-target-job-source-adapter",
      "data-target-job-import-diagnostics",
      "data-target-job-import-phase-report",
      "data-target-job-export-import-report",
      "data-target-job-import-phase-parsed",
      "data-target-job-import-phase-normalized",
      "data-target-job-import-phase-quality-accepted",
      "data-target-job-import-phase-quality-rejected",
      "data-target-job-import-phase-deduped",
      "data-target-job-import-phase-saved",
      "data-target-job-import-rejections",
      "target-job-source-policy",
      'data-source-policy="official"',
      'data-source-policy="public"',
      'data-source-policy="credentialed"',
      'data-source-policy="forbidden"',
      "data-target-job-source-diagnostic",
      "data-target-job-freshness-diagnostic",
      "data-target-job-terms-risk-diagnostic",
      'value="generic-paste"',
      'value="greenhouse"',
      'value="lever"',
      'value="ashby"',
      'value="workable"',
      'value="hn-community"',
      'value="rss-like"',
      'value="csv-json"',
      "Greenhouse",
      "Lever",
      "Ashby",
      "Workable",
    ],
    "target job source-adapter selector HTML contract"
  );
  for (const [label, tokens] of [
    ["HN community source adapter option", ["HN / community", "HN community", "Hacker News"]],
    ["RSS-like source adapter option", ["RSS-like", "RSS / Atom", "RSS"]],
    ["CSV/JSON source adapter option", ["CSV / JSON", "CSV JSON", "CSV/JSON"]],
    ["generic paste source adapter option", ["Generic paste", "Manual paste"]],
  ]) {
    requireAny(targetJobHtml || "", tokens, label);
  }

  requireAll(
    targetJobJs,
    [
      "SOURCE_ADAPTERS",
      "generic-paste",
      "greenhouse",
      "lever",
      "ashby",
      "workable",
      "hn-community",
      "rss-like",
      "csv-json",
      "sourceMetadata",
      "renderImportDiagnostics",
      "renderImportPhaseReport",
      "buildImportPhaseReport",
      "proofresume-target-job-import-phase-report-v1",
      "proofresume-import-phase-counts-v1",
      "phaseCounts",
      "qualityAccepted",
      "qualityRejected",
      "rejectedDetails",
      "accepted",
      "rejected",
      "duplicate",
      "missingUrl",
      "missingCompany",
      "stale",
      "platform",
      "postedDate",
      "localOnly",
      "noExternalFetch",
    ],
    "target job source-adapter mapper JS contract"
  );
  requireAny(
    targetJobJs,
    ["normalizeLeadImportSource", "leadEntriesFromAdapter"],
    "target job source-adapter normalization entrypoint"
  );

  for (const [label, tokens] of [
    ["Greenhouse adapter mapping", ["greenhouse", "Greenhouse"]],
    ["Lever adapter mapping", ["lever", "Lever"]],
    ["Ashby adapter mapping", ["ashby", "Ashby"]],
    ["Workable adapter mapping", ["workable", "Workable"]],
    ["HN community adapter mapping", ["hn-community", "HN / community", "Hacker News"]],
    ["RSS-like adapter mapping", ["rss-like", "RSS-like", "RSS / Atom"]],
    ["CSV/JSON adapter mapping", ["csv-json", "CSV / JSON", "CSV/JSON"]],
    ["generic paste adapter mapping", ["generic-paste", "Generic paste", "Manual paste"]],
  ]) {
    requireAny(targetJobJs, tokens, label);
  }
}

assertTargetJobSourceAdapterMapperContract({
  targetJobHtml,
  targetJobJs,
});

function assertTargetJobSourcingScrapingControlsAlignmentContract({
  targetJobHtml,
  targetJobJs,
  qaTargetJobPackSource,
  businessControlsPolicy,
}) {
  requireAll(
    targetJobHtml || "",
    [
      "Source policy",
      "Official APIs, RSS, and exports",
      "Permitted public scraping",
      "Credentialed sources",
      "Blocked sources and actions",
      "Only ingest public pages when terms and robots guidance allow it",
      "ProofResume does not collect credentials",
      "Do not import paywalled data",
      "message employers",
      "run external crawlers from this page",
      "data-target-job-source-diagnostic",
      "data-target-job-freshness-diagnostic",
      "data-target-job-terms-risk-diagnostic",
      "Review needed",
    ],
    "target job source-policy UI and diagnostics contract"
  );

  requireAll(
    targetJobJs,
    [
      "proofresume-source-adapter-diagnostics-v1",
      "sourceMetadata",
      "sourceKind",
      "postedDate",
      "missingUrl",
      "missingCompany",
      "stale",
      "localOnly",
      "noExternalFetch",
      "noAutoApply",
      "noOutboundSend",
    ],
    "target job source/freshness diagnostics data contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "proofresume-target-job-sourcing-connector-contract-v1",
      "jobSourcingScrapingControl",
      "assertJobSourcingScrapingBusinessControl",
      "buildSourcingConnectorContract",
      "assertSourcingConnectorContract",
      "controlled-local-input-fallback",
      "prototypeFetchLimit",
      "businessControlFetchLimit",
      "termsRisk",
      "sourcePolicyUi",
      "data-target-job-source-diagnostic",
      "data-target-job-freshness-diagnostic",
      "data-target-job-terms-risk-diagnostic",
      "job_sourcing_scraping",
      "dailySourceFetchLimit",
      "preferOfficialApis",
      "respectRobotsAndTerms",
      "mayBypassAuthOrCaptcha",
      "mayCollectPersonalEmailsFromJobPages",
      "contract.networkCalls.length === 0",
    ],
    "target job controlled sourcing connector QA contract"
  );

  const control = (businessControlsPolicy?.controls || []).find((candidate) => candidate?.id === "job_sourcing_scraping");
  if (!control) {
    throw new Error("ops/BUSINESS_CONTROLS.json must include job_sourcing_scraping for Target Job sourcing alignment.");
  }
  for (const evidence of ["source policy", "rate limit", "data fields", "terms-risk note"]) {
    if (!Array.isArray(control.requiredEvidenceToEnable) || !control.requiredEvidenceToEnable.includes(evidence)) {
      throw new Error(`job_sourcing_scraping control must require evidence: ${evidence}`);
    }
  }
  if (
    control.limitsWhenEnabled?.preferOfficialApis !== true ||
    control.limitsWhenEnabled?.respectRobotsAndTerms !== true ||
    control.limitsWhenEnabled?.mayBypassAuthOrCaptcha !== false ||
    control.limitsWhenEnabled?.mayCollectPersonalEmailsFromJobPages !== false ||
    !Number.isFinite(Number(control.limitsWhenEnabled?.dailySourceFetchLimit))
  ) {
    throw new Error("job_sourcing_scraping control must keep official/API preference, terms/robots respect, no bypass, no personal-email collection, and a numeric source-fetch limit.");
  }
  for (const ask of ["approval to use sources with unclear or restrictive terms", "credentialed source access"]) {
    if (!Array.isArray(control.askUserOnlyFor) || !control.askUserOnlyFor.includes(ask)) {
      throw new Error(`job_sourcing_scraping control must ask only for: ${ask}`);
    }
  }
  for (const stopCondition of ["source blocks scraping", "terms prohibit the collection method", "rate limit reached"]) {
    if (!Array.isArray(control.stopConditions) || !control.stopConditions.includes(stopCondition)) {
      throw new Error(`job_sourcing_scraping control must stop on: ${stopCondition}`);
    }
  }
}

assertTargetJobSourcingScrapingControlsAlignmentContract({
  targetJobHtml,
  targetJobJs,
  qaTargetJobPackSource,
  businessControlsPolicy,
});

function assertTargetJobTrackerBoardUxContract({ targetJobHtml, targetJobJs }) {
  const boardStatuses = ["discovered", "evaluating", "tailoring", "ready", "applied", "interviewing", "accepted", "rejected", "discarded"];

  requireAll(
    targetJobHtml || "",
    [
      "data-target-job-board",
      "data-target-job-board-summary",
      "data-target-job-board-card",
      "data-target-job-open-detail",
      "data-target-job-lead-detail",
      "data-target-job-detail-close",
      "data-target-job-detail-status",
      "data-target-job-detail-status-apply",
      "data-target-job-detail-job-intel",
      "data-target-job-detail-quality-gate",
      "data-target-job-detail-fit-breakdown",
      "data-target-job-detail-missing-proof",
      "data-target-job-detail-match-points",
      "data-target-job-detail-drafts",
      "data-target-job-detail-feedback",
      "data-target-job-detail-follow-up",
      "data-target-job-detail-pack-links",
    ],
    "target job tracker board/detail HTML contract"
  );

  for (const status of boardStatuses) {
    requireAll(
      targetJobHtml || "",
      [`data-target-job-board-column="${status}"`, `value="${status}"`, statusLabelForStaticContract(status)],
      `target job board status column ${status}`
    );
  }

  requireAll(
    targetJobJs,
    [
      `LEAD_STATUSES = ["${boardStatuses.join('", "')}"]`,
      "selectedTrackerLeadId",
      "sortTrackerLeads",
      "renderTrackerBoard",
      "renderLeadDetail",
      "openLeadDetail",
      "__proofresumeTargetJobTestHooks",
      "data-target-job-board",
      "data-target-job-board-column",
      "data-target-job-board-tab",
      "data-target-job-open-detail",
      "data-target-job-lead-detail",
      "data-target-job-detail-status",
      "data-target-job-detail-job-intel",
      "data-target-job-detail-quality-gate",
      "data-target-job-detail-fit-breakdown",
      "data-target-job-detail-missing-proof",
      "data-target-job-detail-match-points",
      "data-target-job-detail-drafts",
      "data-target-job-detail-feedback",
      "data-target-job-detail-follow-up",
      "data-target-job-detail-pack-links",
      "aria-pressed",
      "proofresume:targetJobLeads",
      "localOnly",
      "noExternalFetch",
      "noAutoApply",
      "noOutboundSend",
    ],
    "target job tracker board/detail JS contract"
  );

  for (const forbidden of [/fetch\(/i, /XMLHttpRequest/i, /navigator\.sendBeacon/i, /\bsend outreach\b/i]) {
    if (forbidden.test(targetJobJs)) {
      throw new Error(`Target job tracker board/detail must remain local-only and no-send: ${forbidden}`);
    }
  }
}

function statusLabelForStaticContract(status) {
  return status
    .split("-")
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

assertTargetJobTrackerBoardUxContract({
  targetJobHtml,
  targetJobJs,
});

function assertTargetJobFitBreakdownV2Contract({ targetJobHtml, targetJobJs }) {
  const fitComponents = [
    "role",
    "domain",
    "stack",
    "work",
    "project",
    "education",
    "seniority",
    "location",
    "pay",
    "sourceQuality",
    "redFlags",
  ];

  requireAll(
    targetJobHtml || "",
    [
      "data-target-job-fit-components",
      "target-job-fit-component-grid",
      "data-target-job-missing-proof-groups",
      "data-target-job-learning-overlay",
    ],
    "target job fit breakdown v2 HTML contract"
  );

  requireAll(
    targetJobJs,
    [
      "fit.components",
      "fit.componentScores",
      "fit.missingProofGroups",
      "renderFitComponents",
      "renderFitComponentCards",
      "renderMissingProofGroups",
      "renderMissingProofGroupList",
      "componentEvidenceGroups",
      "data-target-job-fit-component",
      "data-target-job-fit-components",
      "data-target-job-missing-proof-groups",
      "data-target-job-learning-overlay",
      "target-job-fit-component-grid--compact",
      "Component spread",
      "Base score:",
      "matchedProof",
      "missingProof",
      "personalizedScore",
      "learningDelta",
    ],
    "target job fit breakdown v2 JS contract"
  );

  for (const component of fitComponents) {
    requireAll(
      targetJobJs,
      [`id: "${component}"`, `fitComponent("${component}"`],
      `target job fit breakdown component ${component}`
    );
  }

  requireAll(
    targetJobJs,
    ['componentEvidenceGroups(components, "missingProof")', "missingProofGroup(component.id", "component.componentScore"],
    "target job grouped component proof contract"
  );
}

assertTargetJobFitBreakdownV2Contract({
  targetJobHtml,
  targetJobJs,
});

function assertTargetJobKeywordHighlightUxQaContract({ targetJobHtml, targetJobJs, qaTargetJobPackSource }) {
  requireAll(
    targetJobHtml || "",
    [
      "data-target-job-keyword-coverage",
      "data-target-job-keyword-summary",
      "data-target-job-missing-proof-groups",
      "data-target-job-match-points",
    ],
    "target job keyword highlight UX HTML contract"
  );

  requireAll(
    targetJobJs,
    [
      "matchedSkills",
      "missingSkills",
      "keywordCoverage",
      "fit.missingProofGroups",
      "componentEvidenceGroups",
      "renderMissingProofGroups",
      "noExternalFetch: true",
      "noOutboundSend: true",
      "noAnalyticsSend: true",
    ],
    "target job keyword highlight UX JS data contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "proofresume-target-job-keyword-highlight-ux-contract-v1",
      "targetJobKeywordHighlightUxFixture",
      "buildKeywordHighlightUxContract",
      "assertKeywordHighlightUxContract",
      "highlightState",
      "missingClassification",
      "proof-needed",
      "not-applicable",
      "matchedTerms",
      "missingTerms",
      "proofNeededMissingTerms",
      "notApplicableMissingTerms",
      "contract.networkCalls.length === 0",
    ],
    "target job keyword highlight UX QA coverage"
  );
}

assertTargetJobKeywordHighlightUxQaContract({
  targetJobHtml,
  targetJobJs,
  qaTargetJobPackSource,
});

function assertTargetJobAutoApplyControlsQaDocsContract({
  qaTargetJobPackSource,
  targetJobPackSpecSource,
  justHireMeParityReviewSource,
  businessControlsPolicy,
}) {
  const control = (businessControlsPolicy.controls || []).find((candidate) => candidate.id === "auto_apply");
  if (!control) {
    throw new Error("BUSINESS_CONTROLS must expose auto_apply for TJ-AUTO-APPLY-CONTROLS coverage.");
  }
  if (control.status !== "enabled_with_candidate_consent") {
    throw new Error("BUSINESS_CONTROLS auto_apply must stay enabled_with_candidate_consent.");
  }
  if (Number(control.limitsWhenEnabled?.dailyApplicationLimit) !== 10) {
    throw new Error("BUSINESS_CONTROLS auto_apply dailyApplicationLimit must stay pinned at 10.");
  }
  for (const key of [
    "requiresPerCandidateConsent",
    "requiresPerJobConsent",
  ]) {
    if (control.limitsWhenEnabled?.[key] !== true) {
      throw new Error(`BUSINESS_CONTROLS auto_apply must require ${key}.`);
    }
  }
  for (const key of ["mayAnswerSensitiveDemographicQuestions", "mayCreateAccounts", "mayBypassAntiBot"]) {
    if (control.limitsWhenEnabled?.[key] !== false) {
      throw new Error(`BUSINESS_CONTROLS auto_apply must keep ${key} false.`);
    }
  }

  requireAll(
    qaTargetJobPackSource,
    [
      "TJ_AUTO_APPLY_CONTROL_UI_TOKENS",
      "TJ_AUTO_APPLY_STOP_TRIGGERS",
      "proofresume-target-job-auto-apply-controls-contract-v1",
      "proofresume-target-job-local-dry-run-application-plan-v1",
      "proofresume-target-job-auto-apply-audit-log-v1",
      "proofresume-target-job-auto-apply-submission-log-v1",
      "assertAutoApplyBusinessControl",
      "assertAutoApplyControlsContract",
      "targetJobAutoApplyDryRunFixture",
      "evaluateAutoApplyDryRunPlanFromHooks",
      "assertAutoApplyDryRunPlanRuntimeContract",
      "proofresume-target-job-auto-apply-field-mapping-v1",
      "disabledByDefault === true",
      "dailyApplicationLimit === 10",
      "enabled_with_candidate_consent",
      "requiresPerCandidateConsent",
      "requiresPerJobConsent",
      "materialsApprovalRequired",
      "materials_not_approved",
      "mayAnswerSensitiveDemographicQuestions",
      "candidateConsentId",
      "perJobConsentId",
      "fieldMapping",
      "questionFlags",
      "stopTriggers",
      "stopMatrix",
      "sampleAuditRows",
      "eeo-demographic",
      "disability",
      "veteran-status",
      "work-authorization-attestation",
      "salary-negotiation",
      "novel-answer",
      "legal-attestation",
      "account_creation_required",
      "mfa_required",
      "anti_bot_required",
      "site-forbids-automation",
      "captchaResponse",
      "captchaSolution",
      "noSubmit",
      "noExternalFormAutomation",
      "DRY RUN ONLY - no application submitted from ProofResume.",
      "noRealSubmit",
      "noAccountCreation",
      "noAntiBotBypass",
      "networkCalls.length === 0",
    ],
    "TJ-AUTO-APPLY-CONTROLS deterministic QA contract"
  );

  requireAll(
    targetJobHtml || "",
    [
      "Auto-apply controls",
      "Disabled dry-run workspace",
      "No submission occurs here",
      "External submission remains gated by explicit candidate consent and explicit target-job",
      "Consent and approval gates",
      "Candidate identity and consent captured for this candidate",
      "Per-job approval captured for this exact target job",
      "Dry-run field mapping",
      "Stop and ask the candidate; never infer answers or personal judgment.",
      "Application asks sensitive demographic, EEO, disability, veteran, legal, or salary questions.",
      "Site forbids automation, requests account creation, shows MFA, or presents anti-bot checks.",
      "Audit and submission log copy",
      "DRY RUN ONLY - no application submitted from ProofResume.",
      "External submit unavailable here",
    ],
    "TJ-AUTO-APPLY-CONTROLS target job HTML dry-run controls"
  );

  requireAll(
    targetJobJs,
    [
      "AUTO_APPLY_CONTROLS_CONTRACT_FORMAT",
      "AUTO_APPLY_DRY_RUN_PLAN_FORMAT",
      "AUTO_APPLY_AUDIT_LOG_SCHEMA_FORMAT",
      "AUTO_APPLY_SUBMISSION_LOG_SCHEMA_FORMAT",
      "candidateConsentRequired: true",
      "candidateConsentPresent",
      "AUTO_APPLY_STOP_PATTERNS",
      "account_creation_required",
      "anti_bot_required",
      "mfa_required",
      "forbidden_automation",
      "prohibitedFields",
      "captchaSolution",
      "mfaCode",
      "rawSensitiveAnswer",
      "agent_submitted",
      "agent_uploaded",
      "agent_created_account",
      "agent_solved_captcha",
      "agent_handled_mfa",
      "executionAllowed: false",
    ],
    "TJ-AUTO-APPLY-CONTROLS target job JS dry-run boundary"
  );

  for (const token of [
    "data-target-job-auto-apply-controls",
    "data-target-job-auto-apply-dry-run-plan",
    "data-target-job-auto-apply-candidate-consent",
    "data-target-job-auto-apply-job-consent",
    "data-target-job-auto-apply-sensitive-question-stop",
    "data-target-job-auto-apply-audit-log",
    "data-target-job-auto-apply-submission-log",
    "data-target-job-auto-apply-network-boundary",
  ]) {
    if (!qaTargetJobPackSource.includes(token) || !targetJobPackSpecSource.includes(token)) {
      throw new Error(`TJ-AUTO-APPLY-CONTROLS missing documented QA UI token: ${token}`);
    }
  }

  requireAll(
    targetJobPackSpecSource,
    [
      "### TJ-AUTO-APPLY-CONTROLS",
      "proofresume-target-job-auto-apply-controls-contract-v1",
      "proofresume-target-job-local-dry-run-application-plan-v1",
      "proofresume-target-job-auto-apply-audit-log-v1",
      "proofresume-target-job-auto-apply-submission-log-v1",
      "proofresume-target-job-auto-apply-field-mapping-v1",
      "proofresume-target-job-auto-apply-question-review-v1",
      "enabled_with_candidate_consent",
      "`dailyApplicationLimit: 10`",
      "`requiresPerCandidateConsent: true`",
      "`requiresPerJobConsent: true`",
      "`mayAnswerSensitiveDemographicQuestions: false`",
      "`disabledByDefault: true`",
      "`executionAllowed: false`",
      "candidate consent",
      "per-job consent",
      "Materials approval",
      "approved application materials",
      "`materials_not_approved`",
      "`fillAllowed: false`",
      "`uploadAllowed: false`",
      "`submitAllowed: false`",
      "Unknown required questions remain blocked",
      "sensitive/legal/personal-judgment",
      "auth, MFA, CAPTCHA/anti-bot, site-forbids-automation",
      "DRY RUN ONLY - no application submitted from ProofResume.",
      "`captchaResponse`",
      "sample audit rows",
      "no network request, send, upload, analytics event, or real submit",
    ],
    "TJ-AUTO-APPLY-CONTROLS target job pack spec coverage"
  );

  requireAll(
    justHireMeParityReviewSource,
    [
      "TJ-AUTO-APPLY-CONTROLS",
      "proofresume-target-job-auto-apply-controls-contract-v1",
      "disabled-by-default local dry-run application plan",
      "local dry-run application plan",
      "proofresume-target-job-auto-apply-field-mapping-v1",
      "candidate consent",
      "per-job consent",
      "materials approval",
      "plan-only local field mapping",
      "forbidden sensitive/legal/unknown questions",
      "account/MFA/CAPTCHA/forbidden-automation stops",
      "no network/send/upload/analytics/real-submit boundary",
      "daily application limit of 10",
    ],
    "TJ-AUTO-APPLY-CONTROLS parity review coverage"
  );
}

assertTargetJobAutoApplyControlsQaDocsContract({
  qaTargetJobPackSource,
  targetJobPackSpecSource,
  justHireMeParityReviewSource,
  businessControlsPolicy,
});

function assertTargetJobAssetGeneratorV2Contract({ targetJobHtml, targetJobJs }) {
  requireAll(
    targetJobHtml || "",
    [
      "data-target-job-resume-export",
      "data-target-job-cover-letter",
      "data-target-job-download-resume-md",
      "data-target-job-download-cover-letter-md",
      "data-target-job-download-application-bundle",
      "data-target-job-download-html",
      "data-target-job-print-view",
    ],
    "target job asset generator v2 local download HTML contract"
  );

  requireAll(
    targetJobJs,
    [
      "proofresume-target-job-asset-generator-v2",
      "proofresume-target-job-asset-metadata-v1",
      "applicationAssets",
      "assetMetadata",
      "buildApplicationAssets",
      "buildTailoredResumeMarkdown",
      "buildFullCoverLetterMarkdown",
      "RESUME_ARTIFACT_FORMAT",
      "COVER_LETTER_ARTIFACT_FORMAT",
      "proofresume-target-job-tailored-resume-text-v1",
      "proofresume-target-job-cover-letter-text-v1",
      "keywordCoverage",
      "sourceLeadId",
      "approvalState",
      "generatedAt",
      "type",
      "contentType",
      "filenameHint",
      "text/markdown",
      "text/html",
      "noUpload: true",
    ],
    "target job asset generator v2 JS contract"
  );

  requireAll(
    targetJobJs,
    [
      "tailored-resume",
      "cover-letter",
      "packet-bundle",
      "printable-html",
      "unapproved",
      "Source-line caveats",
    ],
    "target job asset generator v2 metadata values"
  );

  requireAll(
    targetJobJs,
    [
      "downloadTextFile",
      "downloadJsonFile",
      "downloadPrintableHtml",
      "buildPrintableHtml",
      "new Blob",
      "URL.createObjectURL",
      "URL.revokeObjectURL",
    ],
    "target job asset generator v2 local blob download contract"
  );

  for (const forbidden of [/fetch\s*\(/i, /XMLHttpRequest/i, /navigator\.sendBeacon/i, /apply now/i, /start applying/i, /upload\s+to/i]) {
    if (forbidden.test(targetJobJs)) {
      throw new Error(`Target Job asset generator v2 must stay local-only; found forbidden surface: ${forbidden}`);
    }
  }
}

assertTargetJobAssetGeneratorV2Contract({
  targetJobHtml,
  targetJobJs,
});

function assertTargetJobLocalApiContracts({ targetJobJs, qaTargetJobPackSource, contractsSource, cliSource, fixture }) {
  requireAll(
    targetJobJs,
    [
      "proofresume-target-job-local-tool-contracts-v1",
      "proofresume-target-job-local-tool-result-v1",
      "targetJobLocalToolContracts",
      "__proofresumeTargetJobContracts",
      "extractLeadIntelContract",
      "evaluateLeadQualityContract",
      "scoreJobFitContract",
      "extract_lead_intel",
      "evaluate_lead_quality",
      "score_job_fit",
      "learningApplied: false",
      "localContractBoundary",
      "noExternalFetch: true",
      "noAutoApply: true",
      "noOutboundSend: true",
      "noUpload: true",
      "noAnalyticsSend: true",
    ],
    "target job local API/tool contract layer"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "proofresume-target-job-local-tool-contracts-v1",
      "proofresume-target-job-local-tool-result-v1",
      "targetJobLocalToolContracts",
      "extract_lead_intel",
      "evaluate_lead_quality",
      "score_job_fit",
      "learningApplied === false",
      "assertLocalContractBoundary",
      "contract.networkCalls.length === 0",
    ],
    "target job browser QA local API contract validation"
  );

  requireAll(
    contractsSource,
    [
      "proofresume-target-job-local-contract-result-v1",
      "proofresume-target-job-local-tool-contracts-v1",
      "proofresume-target-job-local-tool-result-v1",
      "targetJobLocalContracts",
      "runAllContracts",
      "extract_lead_intel",
      "evaluate_lead_quality",
      "score_job_fit",
      "learningApplied: false",
      "noExternalFetch: true",
      "noAutoApply: true",
      "noOutboundSend: true",
      "noUpload: true",
      "noAnalyticsSend: true",
    ],
    "target job local CommonJS contract module"
  );

  requireAll(
    cliSource,
    [
      "target-job-contract-input.json",
      "defaultInputPath",
      "runAllContracts",
      "proofresume-target-job-local-contract-result-v1",
      "installNetworkGuard",
      "Network access is blocked in score_target_job_contracts.cjs",
      "globalThis.fetch",
      "globalThis.XMLHttpRequest",
      "sendBeacon",
    ],
    "target job local API/tool CLI contract"
  );

  if (fixture.format !== "proofresume-target-job-local-contract-input-v1") {
    throw new Error(`Unexpected target job local contract fixture format: ${fixture.format}`);
  }
  for (const field of ["resumeText", "structuredProfile", "jobText", "candidateLevel", "preferredLocation"]) {
    if (!fixture[field]) throw new Error(`Missing target job local contract fixture field: ${field}`);
  }
}

assertTargetJobLocalApiContracts({
  targetJobJs,
  qaTargetJobPackSource,
  contractsSource: targetJobContractsSource,
  cliSource: targetJobContractsCliSource,
  fixture: targetJobContractFixture,
});

function assertTargetJobWorkspaceArchiveContract({ targetJobHtml, targetJobJs, qaTargetJobPackSource }) {
  requireAll(
    targetJobHtml || "",
    [
      "data-target-job-workspace-archive",
      "data-target-job-export-workspace",
      "data-target-job-import-workspace",
      "data-target-job-import-workspace-input",
      "data-target-job-workspace-import-mode",
      "data-target-job-apply-workspace-import",
      "data-target-job-workspace-status",
      "data-target-job-workspace-preview",
      "Merge newest updatedAt",
      "Replace valid archive sections",
    ],
    "target job durable workspace archive HTML contract"
  );

  requireAll(
    targetJobJs,
    [
      "proofresume-target-job-workspace-archive-v1",
      "proofresume-target-job-workspace-import-preview-v1",
      "buildWorkspaceArchive",
      "normalizeWorkspaceArchive",
      "previewWorkspaceArchiveImport",
      "applyWorkspaceArchiveImport",
      "renderWorkspaceArchivePreview",
      "workspaceArchiveBoundary",
      "generatedAssetsMetadata",
      "applicationAssetMetadataFromPacks",
      "mergeNewestById",
      "archiveUpdatedAt",
      "droppedInvalidRows",
      "replaceCount",
      "mergeCount",
      "keptCount",
      "noServerStorage: true",
      "noExternalFetch: true",
      "noAutoApply: true",
      "noOutboundSend: true",
      "noUpload: true",
      "noAnalyticsSend: true",
    ],
    "target job durable workspace archive JS contract"
  );

  requireAll(
    qaTargetJobPackSource,
    [
      "proofresume-target-job-workspace-archive-v1",
      "proofresume-target-job-workspace-import-preview-v1",
      "previewWorkspaceArchiveImport",
      "applyWorkspaceArchiveImport",
      "droppedInvalidRows",
      "generatedAssetsMetadata",
      "newest updatedAt",
    ],
    "target job durable workspace archive QA contract"
  );
}

assertTargetJobWorkspaceArchiveContract({
  targetJobHtml,
  targetJobJs,
  qaTargetJobPackSource,
});

requireAll(
  targetJobHtml || "",
  [
    "data-target-job-pack",
    "data-target-job-form",
    "data-target-job-structured-profile",
    "data-target-job-profile-full-name",
    "data-target-job-profile-headline",
    "data-target-job-profile-email",
    "data-target-job-profile-phone",
    "data-target-job-profile-summary",
    "data-target-job-profile-linkedin",
    "data-target-job-profile-github",
    "data-target-job-profile-portfolio",
    "data-target-job-profile-skills",
    "data-target-job-add-experience",
    "data-target-job-experience-list",
    "data-target-job-experience-template",
    "data-target-job-add-project",
    "data-target-job-project-list",
    "data-target-job-project-template",
    "data-target-job-add-education",
    "data-target-job-education-list",
    "data-target-job-education-template",
    "data-target-job-add-certification",
    "data-target-job-certification-list",
    "data-target-job-certification-template",
    "data-target-job-add-achievement",
    "data-target-job-achievement-list",
    "data-target-job-achievement-template",
    "data-target-job-remove-structured-item",
    "data-target-job-import-resume-file",
    "data-target-job-import-resume-file-input",
    "data-target-job-save-profile",
    "data-target-job-export-profile",
    "data-target-job-import-profile",
    "data-target-job-import-profile-input",
    "data-target-job-import-export-bundle",
    "data-target-job-import-export-bundle-input",
    "data-target-job-clear-profile",
    "data-target-job-profile-status",
    "data-target-job-import-job-file",
    "data-target-job-import-job-file-input",
    "data-target-job-analyze",
    "data-target-job-quality",
    "data-target-job-fit-score",
    "data-target-job-fit-components",
    "data-target-job-missing-proof",
    "data-target-job-missing-proof-groups",
    "data-target-job-tailored-bullets",
    "data-target-job-cover-note",
    "data-target-job-outreach-draft",
    "data-target-job-project-rationale",
    "data-target-job-channel-drafts",
    "data-target-job-resume-export",
    "data-target-job-cover-letter",
    "data-target-job-download-resume-md",
    "data-target-job-download-cover-letter-md",
    "data-target-job-download-application-bundle",
    "data-target-job-packet-json",
    "data-target-job-download-html",
    "data-target-job-print-view",
    "data-target-job-import-form",
    "data-target-job-source-adapter",
    "data-target-job-import-diagnostics",
    "data-target-job-lead-list",
    "data-target-job-board",
    "data-target-job-board-summary",
    "data-target-job-board-card",
    "data-target-job-open-detail",
    "data-target-job-lead-detail",
    "data-target-job-detail-status",
    "data-target-job-detail-status-apply",
    "data-target-job-detail-job-intel",
    "data-target-job-detail-quality-gate",
    "data-target-job-detail-fit-breakdown",
    "data-target-job-detail-missing-proof",
    "data-target-job-detail-match-points",
    "data-target-job-detail-drafts",
    "data-target-job-detail-feedback",
    "data-target-job-detail-follow-up",
    "data-target-job-detail-pack-links",
    "data-target-job-export-leads",
    "data-target-job-import-leads-file",
    "data-target-job-workspace-archive",
    "data-target-job-export-workspace",
    "data-target-job-import-workspace",
    "data-target-job-workspace-preview",
    "data-target-job-bulk-feedback",
    "data-target-job-apply-bulk-feedback",
    "data-target-job-learning-panel",
    "data-target-job-learning-enabled",
    "data-target-job-learning-status-sync",
    "data-target-job-reset-learning",
    "data-target-job-learning-insights",
    "data-target-job-learning-overlay",
    "data-target-job-llm-evaluator",
    "data-target-job-llm-evaluator-enabled",
    "data-target-job-llm-evaluator-mode",
    "data-target-job-ai-cost-transparency",
    "data-target-job-ai-cost-range",
    "data-target-job-ai-token-range",
    "data-target-job-ai-run-state",
    "data-target-job-llm-cost-confirmation",
    "data-target-job-ai-data-sent",
    "data-target-job-ai-data-local",
    "data-target-job-llm-evaluator-prompt-contract",
    "data-target-job-llm-evaluator-fixture-output",
    "target-job.js",
    "No autonomous applying",
    "No outbound sends",
    "No invented claims",
  ],
  "target job application pack HTML contract"
);

requireAll(
  targetJobJs,
  [
    "proofresume-target-job-application-pack-v1",
    "proofresume-target-job-application-bundle-v1",
    "proofresume-target-job-asset-generator-v2",
    "proofresume-target-job-asset-metadata-v1",
    "proofresume-target-job-learning-v1",
    "proofresume-target-job-llm-evaluator-boundary-v1",
    "proofresume-target-job-llm-evaluator-prompt-contract-v1",
    "proofresume-target-job-llm-evaluator-result-v1",
    "proofresume-target-job-ai-cost-transparency-v1",
    "buildLlmEvaluatorBoundary",
    "buildAiCostTransparencyGate",
    "optionalAiActionCanRun",
    "llmEvaluatorPromptContract",
    "offlineLlmEvaluatorFixture",
    "evaluate_optional_llm_offline_fixture",
    "confirmationRequiredBeforeRun",
    "estimatedCostUsdRange",
    "estimatedTokens",
    "dataSentIfEnabled",
    "dataStaysLocal",
    "businessControlsAllowExternalAi: false",
    "noApiKeyCollection: true",
    "noExternalLlmCall: true",
    "proofresume:targetJobPacks",
    "proofresume:targetJobLearningSettings",
    "proofresume-target-job-profile-v1",
    "proofresume-target-job-profile-v2",
    "structuredProfileFromForm",
    "normalizeStructuredProfile",
    "structuredProfileToEvidenceText",
    "profileEvidenceText",
    "structuredProfileSummary",
    "proofresume:targetJobProfile",
    "loadProfile",
    "saveProfile",
    "sourceExportBundle",
    "proofresume-local-section-v1",
    "exportBundleSnapshot",
    "resumeTextFromExportBundle",
    "looksLikeHtmlText",
    "normalizePastedResumeText",
    "normalizePastedJobText",
    "stripJobBoilerplate",
    "inputNormalization",
    "jobTextFromHtml",
    "evaluateLeadQuality",
    "scoreFit",
    "proofresume-target-job-local-tool-contracts-v1",
    "targetJobLocalToolContracts",
    "extract_lead_intel",
    "evaluate_lead_quality",
    "score_job_fit",
    "buildLearningProfile",
    "applyLearningToFit",
    "withLearning",
    "fit.components",
    "fit.componentScores",
    "fit.missingProofGroups",
    "renderFitComponents",
    "renderMissingProofGroups",
    "applicationAssets",
    "assetMetadata",
    "buildApplicationAssets",
    "buildTailoredResumeMarkdown",
    "buildFullCoverLetterMarkdown",
    "RESUME_ARTIFACT_FORMAT",
    "COVER_LETTER_ARTIFACT_FORMAT",
    "proofresume-target-job-tailored-resume-text-v1",
    "proofresume-target-job-cover-letter-text-v1",
    "keywordCoverage",
    "sourceLeadId",
    "approvalState",
    "generatedAt",
    "text/markdown",
    "text/html",
    "noUpload: true",
    "buildTailoredBullets",
    "buildCoverNote",
    "buildOutreachDraft",
    "buildSelectedEvidenceRationale",
    "buildChannelDrafts",
    "buildResumeAddendumMarkdown",
    "buildCoverLetterMarkdown",
    "buildApplicationBundle",
    "proofresume-target-job-print-v1",
    "buildPrintableHtml",
    "openPrintView",
    "downloadPrintableHtml",
    "proofresume:targetJobLeads",
    "proofresume-target-job-lead-archive-v1",
    "proofresume-target-job-workspace-archive-v1",
    "proofresume-target-job-workspace-import-preview-v1",
    "exportLeadArchive",
    "mergeLeadArchive",
    "buildWorkspaceArchive",
    "previewWorkspaceArchiveImport",
    "applyWorkspaceArchiveImport",
    "generatedAssetsMetadata",
    "renderLeadTracker",
    "renderTrackerBoard",
    "renderLeadDetail",
    "openLeadDetail",
    "SOURCE_ADAPTERS",
    "sourceMetadata",
    "renderImportDiagnostics",
    "renderLearningPanel",
    "resetLearningFeedback",
    "suggestedStatusFromFeedback",
    "noExternalFetch: true",
    "noAutoApply: true",
    "noOutboundSend: true",
    "approvalState: \"unapproved\"",
  ],
  "target job local scoring and drafting contract"
);

for (const forbidden of [/fetch\(/i, /XMLHttpRequest/i, /navigator\.sendBeacon/i, /\bsend now\b/i, /\bstart applying\b/i]) {
  if (forbidden.test(targetJobJs)) {
    throw new Error(`Target job pack must stay local-only and no-send: ${forbidden}`);
  }
}

requireAll(
  adminHtml,
  [
    "owner-authority-repair",
    "owner-authority-summary",
    "owner-authority-grid",
    "Blocked Gate Evidence Map",
    "No live action",
  ],
  "owner authority repair admin HTML contract"
);

requireAll(
  adminJs,
  [
    "renderOwnerAuthorityRepairLoopPreview",
    "ownerAuthorityRepairLoopPreview",
    "No send, no deploy, no payment, no customer data, no queue mutation, no secrets.",
    "Request non-secret owner evidence",
  ],
  "owner authority repair admin JS contract"
);

requireAll(
  adminDataBuilderSource,
  [
    "proofresume-owner-authority-repair-loop-preview-v1",
    "buildOwnerAuthorityRepairLoopPreview",
    "ops/launch/owner-authority-bundle.template.json",
    "node ops/scripts/check_owner_authority_bundle.cjs",
    "noSendNoDeployNoPaymentNoCustomerData",
  ],
  "owner authority repair admin-data contract"
);

const ownerAuthorityPreview = adminData.operations?.ownerAuthorityRepairLoopPreview;
if (!ownerAuthorityPreview || ownerAuthorityPreview.format !== "proofresume-owner-authority-repair-loop-preview-v1") {
  throw new Error("Admin data must expose the owner authority repair loop preview.");
}
if (
  ownerAuthorityPreview.externalActionAllowed !== false ||
  ownerAuthorityPreview.providerActionAllowed !== false ||
  ownerAuthorityPreview.queueMutationAllowed !== false ||
  ownerAuthorityPreview.noSendNoDeployNoPaymentNoCustomerData !== true
) {
  throw new Error("Owner authority repair preview must remain read-only and external-action disabled.");
}
const ownerAuthorityGateIds = (ownerAuthorityPreview.gates || []).map((gate) => gate.gateId);
for (const gateId of ["publicDeploy", "firstFiveFeedback", "first25Outreach", "paymentActivation", "analytics", "customerDataFulfillment"]) {
  if (!ownerAuthorityGateIds.includes(gateId)) {
    throw new Error(`Owner authority repair preview missing gate ${gateId}.`);
  }
}
for (const gate of ownerAuthorityPreview.gates || []) {
  if (gate.focusGate && !gate.repairRoute?.checkerCommand) {
    throw new Error(`Owner authority repair gate ${gate.gateId} must include a checker command.`);
  }
  if (gate.focusGate && gate.boundaries?.noQueueMutation !== true) {
    throw new Error(`Owner authority repair gate ${gate.gateId} must preserve no-queue-mutation boundary.`);
  }
}

console.log("site checks passed");

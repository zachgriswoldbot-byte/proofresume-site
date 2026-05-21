const form = document.querySelector("#lead-form");
const status = document.querySelector("#form-status");

const CONTROL_SOURCE_PATH = "ops/BUSINESS_CONTROLS.json";
const CONTROL_FETCH_CANDIDATES = [
  "ops/BUSINESS_CONTROLS.json",
  "/ops/BUSINESS_CONTROLS.json",
  "../ops/BUSINESS_CONTROLS.json",
];
const PAID_REVIEW_INTENT_LATEST_KEY = "proofresume:paidReviewInterest";
const PAID_REVIEW_INTENT_JSONL_KEY = "proofresume:paidReviewIntentQueueJsonl";
const PAID_REVIEW_TRIAGE_KEY = "proofresume:paidReviewIntentTriage";
const PAID_REVIEW_TRIAGE_EXPORT_KEY = "proofresume:paidReviewIntentTriageExport";
const ACTIVATION_DECISION_LEDGER_KEY = "proofresume:activationDecisionLedger";
const ACTIVATION_DECISION_PACKET_REVIEW_STATUS_KEY = "proofresume:activationDecisionPacketReviewStatus";

const FIRST_REVENUE_PATH_CONTROL_IDS = ["public_deploy", "lead_capture", "payment_collection", "analytics"];
const ACTIVATION_DECISION_STATUSES = [
  "not_ready",
  "ready_for_private_control_update",
  "blocked_missing_non_secret_decision",
];
const ACTIVATION_DECISION_STATUS_LABELS = {
  not_ready: "Not ready",
  ready_for_private_control_update: "Ready for private control update review",
  blocked_missing_non_secret_decision: "Blocked by missing non-secret decision",
};

const BUSINESS_ACTIVATION_FLAGS = {
  localOnly: true,
  readOnly: true,
  planningOnly: true,
  noSecretRequest: true,
  deployEnabled: false,
  checkoutEnabled: false,
  outboundEnabled: false,
  analyticsEnabled: false,
  leadCaptureEnabled: false,
  resumeIntakeEnabled: false,
};

const NON_SECRET_OPERATOR_INPUTS = {
  public_deploy: ["selected hosting platform", "rollback method"],
  lead_capture: ["approved storage destination", "allowed fields", "privacy copy", "retention rule"],
  payment_collection: ["approved offer", "refund/support policy", "maximum price experiment"],
  analytics: ["analytics provider", "allowed event list", "cookie/privacy decision"],
};

const BLOCKED_ACTIVATION_INPUT_CATEGORIES = [
  "secrets",
  "credentials",
  "production URLs",
  "deploy triggers",
  "card data",
  "contact details",
  "resume intake",
  "checkout",
  "outbound sends",
  "analytics sends",
  "enabled controls",
];
const ACTIVATION_DECISION_BLOCKED_COLLECTION = [
  ...BLOCKED_ACTIVATION_INPUT_CATEGORIES,
  "production endpoints",
  "dashboard links",
  "deploy commands",
  "payment account details",
  "tracking identifiers",
  "customer data",
];
const ACTIVATION_DECISION_RESTRICTED_INPUT_PATTERN =
  /(https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.\w+|\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b|sk[_-]|pk[_-]|token|secret|password|credential|api[_ -]?key|bearer|stripe|paypal|card number|checkout link|deploy command|deploy trigger|production url|dashboard link|tracking id|cookie value|resume text|full resume|linkedin\.com)/i;

let latestBusinessActivationPacket = null;

const FALLBACK_CONTROL_IDS = [
  "public_deploy",
  "lead_capture",
  "outbound_outreach",
  "payment_collection",
  "analytics",
  "customer_data",
];

const BUSINESS_CONTROL_STATIC_MIRROR = {
  public_deploy: {
    label: "Public deploy",
    status: "enabled",
    requiredEvidenceToEnable: ["selected hosting platform", "deploy credential or connector access", "production URL", "rollback method"],
  },
  lead_capture: {
    label: "Production lead capture",
    status: "enabled",
    requiredEvidenceToEnable: ["approved storage destination", "allowed fields", "privacy copy", "retention rule"],
  },
  outbound_outreach: {
    label: "Outbound outreach",
    status: "enabled",
    requiredEvidenceToEnable: ["authorized sending account", "recipient source policy", "daily message limit", "unsubscribe or stop-handling rule"],
  },
  payment_collection: {
    label: "Payment collection",
    status: "enabled",
    requiredEvidenceToEnable: ["payment provider or payment-link access", "approved offer", "refund/support policy", "maximum price experiment"],
  },
  analytics: {
    label: "Analytics",
    status: "enabled",
    requiredEvidenceToEnable: ["analytics provider", "allowed event list", "cookie/privacy decision"],
  },
  customer_data: {
    label: "Customer resume data",
    status: "enabled",
    requiredEvidenceToEnable: ["secure storage path", "consent copy", "retention and deletion policy", "support contact"],
  },
};

function normalizeStatus(statusValue) {
  return String(statusValue || "blocked").replaceAll("_", " ");
}

function missingUnlocks(control) {
  if (!control) return [`Serve ${CONTROL_SOURCE_PATH} to the local site`];
  if (control.status === "enabled") return [];
  return Array.isArray(control.requiredEvidenceToEnable) && control.requiredEvidenceToEnable.length
    ? control.requiredEvidenceToEnable
    : [`Enable ${control.label || control.id} in ${CONTROL_SOURCE_PATH}`];
}

function controlStatusText(control) {
  if (!control) {
    return `Control disabled. Missing unlock: serve ${CONTROL_SOURCE_PATH} to render the current buyer path.`;
  }

  const statusText = normalizeStatus(control.status);
  const unlocks = missingUnlocks(control);
  if (!unlocks.length) {
    return `${control.label}: enabled. Actions remain limited to approved fields, limits, and stop conditions in ${CONTROL_SOURCE_PATH}.`;
  }

  return `${control.label}: ${statusText}. Missing unlocks: ${unlocks.join("; ")}.`;
}

function actionDisabledText(control) {
  const unlocks = missingUnlocks(control);
  return `${control?.label || "Business control"} is disabled. Missing unlocks: ${unlocks.join("; ")}.`;
}

function firstUnlock(control) {
  return missingUnlocks(control)[0] || `Enable ${control?.label || "this control"} in ${CONTROL_SOURCE_PATH}`;
}

function canCapturePaidReviewInterest(control) {
  return control?.status === "setup_needed";
}

function paidReviewInterestText(control) {
  if (canCapturePaidReviewInterest(control)) {
    return `Local paid-review interest capture is available while ${control.label} remains setup needed. Production payment unlock required: ${firstUnlock(control)}.`;
  }

  if (control?.status === "enabled") {
    return `${control.label} is enabled in ${CONTROL_SOURCE_PATH}. Local disabled-payment interest capture is closed; use only the approved production payment path when one is present.`;
  }

  return `${control?.label || "Payment collection"} is not ready for local paid-review interest capture. Missing unlock: ${firstUnlock(control)}.`;
}

function controlsFromPayload(payload) {
  const controls = Array.isArray(payload?.controls) ? payload.controls : [];
  return Object.fromEntries(controls.map((control) => [control.id, control]));
}

function failClosedControls() {
  return Object.fromEntries(
    FALLBACK_CONTROL_IDS.map((id) => {
      const control = BUSINESS_CONTROL_STATIC_MIRROR[id] || {};
      return [
        id,
        {
          ...control,
          id,
          status: "blocked",
          requiredEvidenceToEnable: [
            `Serve ${CONTROL_SOURCE_PATH} to the local site`,
            ...(control.requiredEvidenceToEnable || []),
          ],
          limitsWhenEnabled: {},
        },
      ];
    })
  );
}

async function loadBusinessControls() {
  for (const path of CONTROL_FETCH_CANDIDATES) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) continue;
      const payload = await response.json();
      if (payload?.format === "proofresume-business-controls-v1") {
        return { controls: controlsFromPayload(payload), sourceLoaded: true };
      }
    } catch {
      // Keep trying local candidates, then fail closed.
    }
  }

  return { controls: failClosedControls(), sourceLoaded: false };
}

function renderControls(controls, sourceLoaded) {
  document.querySelectorAll("[data-business-control-status]").forEach((element) => {
    const control = controls[element.dataset.businessControlStatus];
    element.textContent = controlStatusText(control);
    element.classList.toggle("status-pill", true);
    element.classList.toggle("is-approved", control?.status === "enabled");
    element.classList.toggle("is-unapproved", control?.status === "blocked");
    element.classList.toggle("is-pending", control?.status !== "enabled" && control?.status !== "blocked");
  });

  document.querySelectorAll("[data-business-control-note]").forEach((element) => {
    const control = controls[element.dataset.businessControlNote];
    element.textContent = sourceLoaded
      ? controlStatusText(control)
      : `Local-only fallback active. Missing unlock: serve ${CONTROL_SOURCE_PATH} to this page.`;
  });

  document.querySelectorAll("[data-business-control-unlocks]").forEach((element) => {
    const control = controls[element.dataset.businessControlUnlocks];
    element.textContent = `Missing unlocks: ${missingUnlocks(control).join("; ")}.`;
  });

  document.querySelectorAll("[data-control-card]").forEach((element) => {
    const control = controls[element.dataset.controlCard];
    element.dataset.controlState = control?.status || "blocked";
  });

  document.querySelectorAll("[data-business-control-action]").forEach((element) => {
    const control = controls[element.dataset.businessControlAction];
    const isPaidReviewInterest = element.hasAttribute("data-paid-review-interest");
    const actionAvailable = isPaidReviewInterest ? canCapturePaidReviewInterest(control) : control?.status === "enabled";
    element.toggleAttribute("disabled", !actionAvailable);
    element.setAttribute("aria-disabled", String(!actionAvailable));
    element.title = isPaidReviewInterest
      ? paidReviewInterestText(control)
      : actionAvailable
        ? `${control.label} is enabled in ${CONTROL_SOURCE_PATH}.`
        : element.dataset.disabledMessage || actionDisabledText(control);

    if (isPaidReviewInterest) {
      const targetId = element.dataset.paidReviewStatusTarget;
      const statusElement = targetId ? document.getElementById(targetId) : null;
      if (statusElement) statusElement.textContent = paidReviewInterestText(control);
    }
  });
}

function buildBusinessActivationPacket(controls, sourceLoaded) {
  const controlInputs = FIRST_REVENUE_PATH_CONTROL_IDS.map((id) => {
    const control = controls[id] || BUSINESS_CONTROL_STATIC_MIRROR[id] || { id, label: id, status: "blocked" };
    const sourceUnlocks = missingUnlocks(control);
    const nonSecretMissingOperatorInputs = (NON_SECRET_OPERATOR_INPUTS[id] || []).filter((input) =>
      sourceUnlocks.includes(input)
    );

    return {
      id,
      label: control.label || id,
      status: String(control.status || "blocked"),
      nonSecretMissingOperatorInputs,
      excludedSourceUnlocks: sourceUnlocks.filter((input) => !nonSecretMissingOperatorInputs.includes(input)),
      activationEnabled: false,
    };
  });

  return {
    format: "proofresume-business-control-activation-packet-v1",
    generatedAt: new Date().toISOString(),
    controlSource: CONTROL_SOURCE_PATH,
    controlSourceLoaded: sourceLoaded === true,
    scope: "operator-planning-only",
    flags: BUSINESS_ACTIVATION_FLAGS,
    blockedInputCategories: BLOCKED_ACTIVATION_INPUT_CATEGORIES,
    controlInputs,
    externalActions: {
      deployTriggered: false,
      checkoutCreated: false,
      outboundCreated: false,
      analyticsSent: false,
      leadCapturedInProduction: false,
      resumeIntakeCreated: false,
      secretRequested: false,
    },
  };
}

function renderBusinessActivationPacket(controls, sourceLoaded) {
  const panel = document.querySelector("[data-business-control-activation-packet]");
  if (!panel) return;

  const packet = buildBusinessActivationPacket(controls, sourceLoaded);
  latestBusinessActivationPacket = packet;
  const summary = panel.querySelector("[data-business-activation-summary]");
  const statusElement = panel.querySelector("[data-business-activation-status]");
  const list = panel.querySelector("[data-business-activation-controls]");
  const output = panel.querySelector("[data-business-activation-packet-json]");
  const downloadAction = panel.querySelector("[data-business-activation-export-download]");

  panel.dataset.localOnly = String(packet.flags.localOnly);
  panel.dataset.readOnly = String(packet.flags.readOnly);
  panel.dataset.planningOnly = String(packet.flags.planningOnly);
  panel.dataset.noSecretRequest = String(packet.flags.noSecretRequest);
  panel.dataset.deployEnabled = String(packet.flags.deployEnabled);
  panel.dataset.checkoutEnabled = String(packet.flags.checkoutEnabled);
  panel.dataset.outboundEnabled = String(packet.flags.outboundEnabled);
  panel.dataset.analyticsEnabled = String(packet.flags.analyticsEnabled);
  panel.dataset.leadCaptureEnabled = String(packet.flags.leadCaptureEnabled);
  panel.dataset.resumeIntakeEnabled = String(packet.flags.resumeIntakeEnabled);

  if (summary) {
    summary.textContent = sourceLoaded
      ? "Local read-only planning packet ready"
      : "Local read-only planning packet using fail-closed controls";
  }

  if (statusElement) {
    statusElement.textContent = [
      "local-only",
      "read-only",
      "planning-only",
      "no-secret-request",
      "deploy-enabled false",
      "checkout-enabled false",
      "outbound-enabled false",
      "analytics-enabled false",
      "lead-capture-enabled false",
      "resume-intake-enabled false",
    ].join(" | ");
  }

  if (list) {
    list.replaceChildren();
    packet.controlInputs.forEach((control) => {
      const item = document.createElement("article");
      const title = document.createElement("span");
      const text = document.createElement("p");
      title.textContent = `${control.label} | ${normalizeStatus(control.status)}`;
      text.textContent = [
        `Missing non-secret operator inputs: ${control.nonSecretMissingOperatorInputs.join("; ") || "none"}.`,
        `Excluded input categories are not requested here: ${packet.blockedInputCategories.join("; ")}.`,
        "Activation enabled: false.",
      ].join(" ");
      item.dataset.activationControl = control.id;
      item.dataset.activationEnabled = "false";
      item.append(title, text);
      list.append(item);
    });
  }

  if (output) {
    output.textContent = JSON.stringify(packet, null, 2);
  }

  if (downloadAction) {
    downloadAction.dataset.packetReady = "true";
    downloadAction.dataset.activationEnabled = "false";
    downloadAction.dataset.networkEnabled = "false";
    downloadAction.dataset.noPersistence = "true";
  }
}

function downloadBusinessActivationPacket() {
  const panel = document.querySelector("[data-business-control-activation-packet]");
  const trigger = panel?.querySelector("[data-business-activation-export-download]");
  const statusElement = panel?.querySelector("[data-business-activation-status]");
  if (!panel || !trigger || !latestBusinessActivationPacket) return;

  const packetJson = JSON.stringify(latestBusinessActivationPacket, null, 2);
  const blob = new Blob([`${packetJson}\n`], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = trigger.dataset.downloadFilename || "proofresume-business-control-activation-packet.json";
  link.rel = "noopener";
  link.dataset.businessActivationDownloadLink = "local-blob-only";
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);

  trigger.dataset.lastDownloadLocalOnly = "true";
  trigger.dataset.lastDownloadNetworkEnabled = "false";
  trigger.dataset.lastDownloadPersistenceCreated = "false";
  trigger.dataset.lastDownloadActivationEnabled = "false";

  if (statusElement) {
    statusElement.textContent = [
      "Downloaded local activation packet JSON.",
      "No persistence, network, secret request, URL request, deploy trigger, checkout, outbound send, analytics send, card data, contact data, resume data, or control enablement occurred.",
    ].join(" ");
  }
}

function wireBusinessActivationPacketExport() {
  document
    .querySelector("[data-business-activation-export-download]")
    ?.addEventListener("click", downloadBusinessActivationPacket);
}

function normalizeActivationDecisionStatus(value) {
  const statusValue = String(value || "");
  return ACTIVATION_DECISION_STATUSES.includes(statusValue) ? statusValue : "not_ready";
}

function normalizeActivationDecisionNote(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 220);
}

function activationDecisionFlags() {
  return {
    localOnly: true,
    browserLocalStateOnly: true,
    mutatesBusinessControls: false,
    publicDeployEnabled: false,
    leadCaptureEnabled: false,
    paymentCollectionEnabled: false,
    analyticsEnabled: false,
    checkoutEnabled: false,
    outboundEnabled: false,
    customerDataEnabled: false,
    resumeIntakeEnabled: false,
    secretCollectionEnabled: false,
    productionUrlCollectionEnabled: false,
    deployTriggerEnabled: false,
  };
}

function activationDecisionFalseActions() {
  return {
    businessControlsMutated: false,
    deployTriggered: false,
    checkoutCreated: false,
    leadCapturedInProduction: false,
    paymentCollected: false,
    analyticsSent: false,
    outboundCreated: false,
    customerDataCollected: false,
    resumeIntakeCreated: false,
    secretCollected: false,
    productionUrlCollected: false,
  };
}

function emptyActivationDecisionRecord(id) {
  const control = BUSINESS_CONTROL_STATIC_MIRROR[id] || { label: id };
  return {
    id,
    label: control.label || id,
    status: "not_ready",
    note: "",
    updatedAt: "",
    localOnly: true,
    nonSecretReadinessDecisionOnly: true,
    mutatesBusinessControls: false,
    enablesProductionAction: false,
    externalActions: activationDecisionFalseActions(),
  };
}

function buildActivationDecisionLedger(records = {}) {
  const decisions = FIRST_REVENUE_PATH_CONTROL_IDS.map((id) => ({
    ...emptyActivationDecisionRecord(id),
    ...(records[id] || {}),
    id,
    status: normalizeActivationDecisionStatus(records[id]?.status),
    statusLabel: ACTIVATION_DECISION_STATUS_LABELS[normalizeActivationDecisionStatus(records[id]?.status)],
    note: normalizeActivationDecisionNote(records[id]?.note),
    localOnly: true,
    nonSecretReadinessDecisionOnly: true,
    mutatesBusinessControls: false,
    enablesProductionAction: false,
    externalActions: activationDecisionFalseActions(),
  }));

  return {
    format: "proofresume-activation-decision-ledger-v1",
    generatedAt: new Date().toISOString(),
    source: "browser-localStorage",
    storageKey: ACTIVATION_DECISION_LEDGER_KEY,
    controlSource: CONTROL_SOURCE_PATH,
    flags: activationDecisionFlags(),
    blockedCollection: ACTIVATION_DECISION_BLOCKED_COLLECTION,
    externalActions: activationDecisionFalseActions(),
    decisions,
  };
}

function activationDecisionPacketRejectedValues() {
  return ACTIVATION_DECISION_BLOCKED_COLLECTION.map((category) => ({
    category,
    serializedValue: "not serialized",
    storedInLedger: false,
    reason: "Rejected from activation-decision packet export boundary.",
  }));
}

function activationDecisionPacketMissingEvidence(decision) {
  return (NON_SECRET_OPERATOR_INPUTS[decision.id] || []).map((evidence) => ({
    controlId: decision.id,
    controlLabel: decision.label,
    evidence,
    state: "still_missing",
    evidenceCreatedByLedger: false,
  }));
}

function buildActivationDecisionPacketExport(ledger = loadActivationDecisionLedger()) {
  const packetReviewStatus = loadActivationDecisionPacketReviewStatus();
  const ledgerEntries = ledger.decisions.map((decision) => ({
    id: decision.id,
    label: decision.label,
    status: decision.status,
    statusLabel: decision.statusLabel,
    note: decision.note,
    updatedAt: decision.updatedAt,
    localOnly: true,
    planningOnly: true,
    nonSecretReadinessDecisionOnly: true,
    createsEnablementEvidence: false,
  }));
  const stillMissingNonSecretEvidence = ledger.decisions.flatMap(activationDecisionPacketMissingEvidence);

  return {
    format: "proofresume-activation-decision-packet-export-v1",
    generatedAt: new Date().toISOString(),
    source: "browser-localStorage",
    sourceKeys: [ACTIVATION_DECISION_LEDGER_KEY, ACTIVATION_DECISION_PACKET_REVIEW_STATUS_KEY],
    packetReviewStatusIncluded: true,
    packetReviewStatus,
    scope: "operator-planning-only",
    persistenceCreated: false,
    networkRequested: false,
    secretsSerialized: false,
    urlsSerialized: false,
    customerDataSerialized: false,
    paymentDataSerialized: false,
    resumeDataSerialized: false,
    enablementEvidenceCreated: false,
    outboundActionCreated: false,
    externalActionCreated: false,
    ledgerEntryCount: ledgerEntries.filter((entry) => entry.updatedAt).length,
    ledgerEntries,
    rejectedValues: activationDecisionPacketRejectedValues(),
    stillMissingNonSecretEvidence,
    evidenceState: "planning-only; ledger decisions do not satisfy or create enablement evidence",
    blockedRoutes: [
      "business control mutation",
      "public deploy",
      "production lead capture",
      "payment collection",
      "checkout",
      "outbound send",
      "analytics send",
      "customer data collection",
      "resume intake",
      "secret collection",
      "production URL collection",
    ],
  };
}

function loadActivationDecisionPacketReviewStatus() {
  try {
    const payload = JSON.parse(localStorage.getItem(ACTIVATION_DECISION_PACKET_REVIEW_STATUS_KEY) || "{}");
    const status = String(payload?.status || payload?.reviewStatus || payload?.state || "not-reviewed");
    const allowed = new Set(["not-reviewed", "reviewed", "rejected", "stale"]);
    const normalized = allowed.has(status) ? status : "not-reviewed";
    return {
      format: "proofresume-activation-decision-packet-review-status-v1",
      status: normalized,
      localOnly: true,
      planningOnly: true,
      mutatesBusinessControls: false,
      enablementEvidenceCreated: false,
      updatedAt: typeof payload?.updatedAt === "string" ? payload.updatedAt : "",
      source: "browser-localStorage",
    };
  } catch {
    return {
      format: "proofresume-activation-decision-packet-review-status-v1",
      status: "not-reviewed",
      localOnly: true,
      planningOnly: true,
      mutatesBusinessControls: false,
      enablementEvidenceCreated: false,
      updatedAt: "",
      source: "browser-localStorage",
    };
  }
}

function storeActivationDecisionPacketReviewStatus(panel, statusValue) {
  const allowed = new Set(["not-reviewed", "reviewed", "rejected", "stale"]);
  const normalized = allowed.has(statusValue) ? statusValue : "not-reviewed";
  const payload = {
    format: "proofresume-activation-decision-packet-review-status-v1",
    status: normalized,
    localOnly: true,
    planningOnly: true,
    mutatesBusinessControls: false,
    enablementEvidenceCreated: false,
    updatedAt: new Date().toISOString(),
    source: "browser-localStorage",
  };
  localStorage.setItem(ACTIVATION_DECISION_PACKET_REVIEW_STATUS_KEY, JSON.stringify(payload));
  if (panel) {
    panel.dataset.lastSavedStatus = normalized;
  }
  return payload;
}

function loadActivationDecisionLedger() {
  try {
    const payload = JSON.parse(localStorage.getItem(ACTIVATION_DECISION_LEDGER_KEY) || "{}");
    const decisions = Array.isArray(payload?.decisions)
      ? Object.fromEntries(payload.decisions.map((decision) => [decision.id, decision]))
      : {};
    return buildActivationDecisionLedger(decisions);
  } catch {
    return buildActivationDecisionLedger();
  }
}

function storeActivationDecision(id, statusValue, noteValue) {
  const status = normalizeActivationDecisionStatus(statusValue);
  const note = normalizeActivationDecisionNote(noteValue);
  if (ACTIVATION_DECISION_RESTRICTED_INPUT_PATTERN.test(note)) {
    return {
      ok: false,
      reason:
        "Rejected. Save only non-secret readiness notes: no URL, secret, credential, deploy trigger, card/contact/resume data, checkout, analytics send, tracking value, or customer data.",
    };
  }

  const current = loadActivationDecisionLedger();
  const records = Object.fromEntries(current.decisions.map((decision) => [decision.id, decision]));
  records[id] = {
    ...emptyActivationDecisionRecord(id),
    status,
    note,
    updatedAt: new Date().toISOString(),
  };
  const nextLedger = buildActivationDecisionLedger(records);
  localStorage.setItem(ACTIVATION_DECISION_LEDGER_KEY, JSON.stringify(nextLedger));
  return { ok: true, ledger: nextLedger };
}

function renderActivationDecisionLedger(message = "") {
  const panel = document.querySelector("[data-activation-decision-ledger]");
  if (!panel) return;

  const ledger = loadActivationDecisionLedger();
  const decisionsById = Object.fromEntries(ledger.decisions.map((decision) => [decision.id, decision]));
  const savedCount = ledger.decisions.filter((decision) => decision.updatedAt).length;
  const count = panel.querySelector("[data-activation-decision-ledger-count]");
  const statusElement = panel.querySelector("[data-activation-decision-status-message]");
  const output = panel.querySelector("[data-activation-decision-json]");
  const packetStatus = panel.querySelector("[data-activation-decision-packet-status]");
  const packetOutput = panel.querySelector("[data-activation-decision-packet-json]");
  const packetExport = panel.querySelector("[data-activation-decision-packet-export]");

  Object.entries(activationDecisionFlags()).forEach(([key, value]) => {
    panel.dataset[key] = String(value);
  });

  panel.querySelectorAll("[data-activation-decision-control]").forEach((row) => {
    const id = row.dataset.activationDecisionControl;
    const decision = decisionsById[id] || emptyActivationDecisionRecord(id);
    const select = row.querySelector("[data-activation-decision-status]");
    const note = row.querySelector("[data-activation-decision-note]");
    row.dataset.decisionStatus = decision.status;
    row.dataset.savedLocalOnly = String(Boolean(decision.updatedAt));
    row.dataset.mutatesBusinessControls = "false";
    row.dataset.enablesProductionAction = "false";
    row.dataset.deployTriggerEnabled = "false";
    row.dataset.checkoutEnabled = "false";
    row.dataset.analyticsEnabled = "false";
    row.dataset.leadCaptureEnabled = "false";
    row.dataset.resumeIntakeEnabled = "false";
    row.dataset.secretCollectionEnabled = "false";
    if (select) select.value = decision.status;
    if (note) note.value = decision.note;
  });

  if (count) count.textContent = `${savedCount} local ${savedCount === 1 ? "decision" : "decisions"}`;
  if (statusElement) {
    statusElement.textContent =
      message ||
      "Local ledger ready. No deploy, checkout, lead capture, payment collection, analytics, outbound, customer data, or resume intake action is enabled.";
  }
  if (output) output.textContent = JSON.stringify(ledger, null, 2);
  const packet = buildActivationDecisionPacketExport(ledger);
  if (packetStatus) {
    packetStatus.textContent = `${packet.ledgerEntryCount} local ledger entr${
      packet.ledgerEntryCount === 1 ? "y" : "ies"
    } summarized. ${packet.rejectedValues.length} rejected value categories are blocked, and ${packet.stillMissingNonSecretEvidence.length} non-secret evidence item(s) remain still missing. No enablement evidence was created.`;
  }
  if (packetOutput) packetOutput.textContent = JSON.stringify(packet, null, 2);
  if (packetExport) {
    packetExport.dataset.packetReady = "true";
    packetExport.dataset.ledgerEntryCount = String(packet.ledgerEntryCount);
    packetExport.dataset.rejectedValueCategoryCount = String(packet.rejectedValues.length);
    packetExport.dataset.stillMissingNonSecretEvidenceCount = String(packet.stillMissingNonSecretEvidence.length);
    packetExport.dataset.persistenceCreated = "false";
    packetExport.dataset.networkRequested = "false";
    packetExport.dataset.enablementEvidenceCreated = "false";
  }
}

function downloadActivationDecisionPacketExport() {
  const panel = document.querySelector("[data-activation-decision-ledger]");
  const trigger = panel?.querySelector("[data-activation-decision-packet-export]");
  const statusElement = panel?.querySelector("[data-activation-decision-packet-status]");
  if (!panel || !trigger) return;

  const packet = buildActivationDecisionPacketExport(loadActivationDecisionLedger());
  const packetJson = JSON.stringify(packet, null, 2);
  const blob = new Blob([`${packetJson}\n`], { type: "application/json" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = trigger.dataset.downloadFilename || "proofresume-activation-decision-packet.json";
  link.rel = "noopener";
  link.dataset.activationDecisionPacketDownloadLink = "local-blob-only";
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);

  trigger.dataset.lastDownloadLocalOnly = "true";
  trigger.dataset.lastDownloadLedgerOnly = "true";
  trigger.dataset.lastDownloadNetworkRequested = "false";
  trigger.dataset.lastDownloadPersistenceCreated = "false";
  trigger.dataset.lastDownloadEnablementEvidenceCreated = "false";

  if (statusElement) {
    statusElement.textContent = [
      "Downloaded browser-local activation-decision packet JSON.",
      "It serialized ledger summaries, rejected value categories, and still-missing non-secret evidence only.",
      "No persistence, network, secret, URL, deploy trigger, checkout, outbound, analytics, card, contact, resume data, or enablement evidence was created.",
    ].join(" ");
  }
}

function wireActivationDecisionLedger() {
  const panel = document.querySelector("[data-activation-decision-ledger]");
  if (!panel) return;

  panel.addEventListener("click", (event) => {
    const saveTrigger = event.target.closest("[data-activation-decision-save]");
    if (!saveTrigger) return;
    const row = saveTrigger.closest("[data-activation-decision-control]");
    if (!row) return;
    const result = storeActivationDecision(
      row.dataset.activationDecisionControl,
      row.querySelector("[data-activation-decision-status]")?.value,
      row.querySelector("[data-activation-decision-note]")?.value
    );
    renderActivationDecisionLedger(
      result.ok
        ? "Saved browser-local readiness decision. No business control, deploy, checkout, lead capture, payment collection, analytics, outbound, customer data, or resume intake action was enabled."
        : result.reason
    );
  });

  panel.querySelector("[data-activation-decision-refresh]")?.addEventListener("click", () => {
    renderActivationDecisionLedger("Refreshed browser-local activation decisions.");
  });
  panel.querySelector("[data-activation-decision-clear]")?.addEventListener("click", () => {
    localStorage.removeItem(ACTIVATION_DECISION_LEDGER_KEY);
    renderActivationDecisionLedger("Cleared browser-local activation decisions only.");
  });
  panel.querySelector("[data-activation-decision-packet-export]")?.addEventListener("click", downloadActivationDecisionPacketExport);

  renderActivationDecisionLedger();
}

function wireActivationDecisionPacketReviewStatus() {
  const panel = document.querySelector("[data-activation-decision-packet-review-status]");
  if (!panel) return;

  const select = panel.querySelector("[data-activation-decision-packet-review-status-input]");
  const target = panel.querySelector("[data-activation-decision-packet-review-status-target]");
  const save = panel.querySelector("[data-activation-decision-packet-review-status-save]");
  const defaultStatus = String(panel.getAttribute("data-default-status") || "not-reviewed");

  function render(messagePrefix = "Packet summary review status") {
    const record = loadActivationDecisionPacketReviewStatus();
    const status = record.status || defaultStatus || "not-reviewed";
    if (select instanceof HTMLSelectElement) {
      select.value = status;
    }
    if (target) {
      target.textContent = `${messagePrefix}: ${status.replaceAll("-", " ")}. Browser localStorage only; no control authority changes.`;
    }
  }

  render();

  save?.addEventListener("click", () => {
    const nextStatus = select instanceof HTMLSelectElement ? select.value : defaultStatus;
    storeActivationDecisionPacketReviewStatus(panel, nextStatus);
    render("Saved packet review status");
    renderActivationDecisionLedger("Saved packet review status marker locally. No business control enablement evidence was created.");
  });
}

function setLeadStatus(message) {
  if (status) status.textContent = message;
}

function setPaidReviewStatus(trigger, message) {
  const targetId = trigger?.dataset?.paidReviewStatusTarget;
  const target = targetId ? document.getElementById(targetId) : null;
  if (target) {
    target.textContent = message;
    return;
  }
  setLeadStatus(message);
}

function paidReviewQueueHash(value) {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function safePaidReviewMetadata(record) {
  const metadata = {
    capturedAt: String(record?.capturedAt || "unknown"),
    source: String(record?.source || "local-paid-review-interest"),
    offer: String(record?.offer || "proof-packet"),
    controlSource: String(record?.controlSource || CONTROL_SOURCE_PATH),
    paymentControlStatus: String(record?.paymentControlStatus || "unknown"),
    paymentUnlockRequired: String(record?.paymentUnlockRequired || "payment provider or payment-link access"),
    localOnly: record?.localOnly === true,
    paymentProcessed: record?.paymentProcessed === true,
  };

  const idBase = [
    metadata.capturedAt,
    metadata.source,
    metadata.offer,
    metadata.paymentControlStatus,
    metadata.paymentUnlockRequired,
  ].join("|");

  return {
    id: `local-intent-${paidReviewQueueHash(idBase)}`,
    ...metadata,
    revenueEvidence: false,
    demandEvidence: false,
    paymentEvidence: false,
    willingnessToPayEvidence: false,
    resumeTextRequested: false,
    externalActionAllowed: false,
  };
}

function parsePaidReviewJsonl(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return { record: JSON.parse(line), index, malformed: false };
      } catch {
        return { record: { capturedAt: "malformed", source: "malformed-local-jsonl-row" }, index, malformed: true };
      }
    });
}

function loadPaidReviewQueueRecords() {
  const rows = parsePaidReviewJsonl(localStorage.getItem(PAID_REVIEW_INTENT_JSONL_KEY));
  const latest = localStorage.getItem(PAID_REVIEW_INTENT_LATEST_KEY);

  if (latest) {
    try {
      const latestPayload = JSON.parse(latest);
      const latestId = safePaidReviewMetadata(latestPayload, rows.length).id;
      const rowHasLatest = rows.some(({ record }, index) => safePaidReviewMetadata(record, index).id === latestId);
      if (!rowHasLatest) {
        rows.push({ record: latestPayload, index: rows.length, malformed: false });
      }
    } catch {
      rows.push({ record: { capturedAt: "malformed", source: "malformed-latest-local-record" }, index: rows.length, malformed: true });
    }
  }

  return rows.map(({ record, index, malformed }) => ({
    ...safePaidReviewMetadata(record, index),
    malformed,
  }));
}

function loadPaidReviewTriage() {
  try {
    const payload = JSON.parse(localStorage.getItem(PAID_REVIEW_TRIAGE_KEY) || "{}");
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
  }
}

function savePaidReviewTriage(id, state) {
  const triage = loadPaidReviewTriage();
  triage[id] = {
    state,
    reviewedAt: new Date().toISOString(),
    localOnly: true,
    noRevenueEvidence: true,
    noDemandEvidence: true,
    noPaymentEvidence: true,
    noWillingnessToPayEvidence: true,
  };
  localStorage.setItem(PAID_REVIEW_TRIAGE_KEY, JSON.stringify(triage));
}

function paidReviewStopRoutes() {
  return [
    "No follow-up draft creation",
    "No outreach action",
    "No payment path",
    "No analytics event",
    "No contact enrichment",
    "No production lead capture",
    "No resume intake",
  ];
}

function paidReviewFalseFlags() {
  return {
    revenue: false,
    demand: false,
    payment: false,
    willingnessToPay: false,
    followUpDraft: false,
    outreach: false,
    analytics: false,
    productionLeadCapture: false,
    resumeIntake: false,
  };
}

function paidReviewNotObservedFlags() {
  return {
    revenue: "Not observed",
    demand: "Not observed",
    payment: "Not observed",
    willingnessToPay: "Not observed",
    followUpDraft: "Not observed",
    outreach: "Not observed",
    analytics: "Not observed",
    productionLeadCapture: "Not observed",
    resumeIntake: "Not observed",
  };
}

function buildPaidReviewTriageExport(records, triage) {
  const reviewedRecords = records
    .filter((record) => triage[record.id]?.state)
    .map((record) => {
      const decision = triage[record.id] || {};
      return {
        id: record.id,
        capturedAt: record.capturedAt,
        source: record.source,
        offer: record.offer,
        controlSource: record.controlSource,
        paymentControlStatus: record.paymentControlStatus,
        paymentUnlockRequired: record.paymentUnlockRequired,
        localOnly: true,
        malformed: record.malformed === true,
        triageLabel: String(decision.state || "unreviewed"),
        reviewedAt: String(decision.reviewedAt || ""),
        stopRoutes: paidReviewStopRoutes(),
        falseFlags: paidReviewFalseFlags(),
        notObservedFlags: paidReviewNotObservedFlags(),
      };
    });

  return {
    format: "proofresume-paid-review-triage-export-v1",
    generatedAt: new Date().toISOString(),
    localOnly: true,
    planningOnly: true,
    scope: "operator-planning-only",
    source: "browser-localStorage",
    sourceKeys: [PAID_REVIEW_INTENT_LATEST_KEY, PAID_REVIEW_INTENT_JSONL_KEY, PAID_REVIEW_TRIAGE_KEY],
    reviewedRecordCount: reviewedRecords.length,
    followUpDraftCreated: false,
    outreachCreated: false,
    checkoutCreated: false,
    analyticsCreated: false,
    productionLeadCaptureCreated: false,
    productionResumeIntakeCreated: false,
    revenueEvidence: false,
    demandEvidence: false,
    paymentEvidence: false,
    conversionEvidence: false,
    willingnessToPayEvidence: false,
    stopRoutes: paidReviewStopRoutes(),
    falseFlags: paidReviewFalseFlags(),
    notObservedFlags: paidReviewNotObservedFlags(),
    excludedRoutes: {
      followUpCopyCreated: false,
      outreachActionCreated: false,
      paymentPathCreated: false,
      analyticsEventCreated: false,
      contactEnrichmentCreated: false,
      productionLeadCaptureCreated: false,
      resumeIntakeCreated: false,
    },
    records: reviewedRecords,
  };
}

function renderPaidReviewTriageExport(packet, statusElement, outputElement) {
  if (statusElement) {
    statusElement.textContent = packet.reviewedRecordCount
      ? `Built local planning export for ${packet.reviewedRecordCount} reviewed record(s). All revenue, demand, payment, willingness-to-pay, follow-up, outreach, analytics, production lead capture, and resume intake flags remain false / Not observed.`
      : "No reviewed local intent records yet. Mark records reviewed or invalid metadata before building the planning export.";
  }

  if (outputElement) {
    outputElement.textContent = JSON.stringify(packet, null, 2);
  }
}

function buildAndStorePaidReviewTriageExport() {
  const panel = document.querySelector("[data-paid-review-queue]");
  if (!panel) return;

  const packet = buildPaidReviewTriageExport(loadPaidReviewQueueRecords(), loadPaidReviewTriage());
  localStorage.setItem(PAID_REVIEW_TRIAGE_EXPORT_KEY, JSON.stringify(packet));
  renderPaidReviewTriageExport(
    packet,
    panel.querySelector("[data-paid-review-export-status]"),
    panel.querySelector("[data-paid-review-export-output]")
  );
}

function appendPaidReviewQueueMirror(intent) {
  const metadata = safePaidReviewMetadata(intent);
  const row = JSON.stringify(metadata);
  const prior = localStorage.getItem(PAID_REVIEW_INTENT_JSONL_KEY) || "";
  localStorage.setItem(PAID_REVIEW_INTENT_JSONL_KEY, `${prior}${prior.endsWith("\n") || !prior ? "" : "\n"}${row}\n`);
}

function renderPaidReviewQueue() {
  const panel = document.querySelector("[data-paid-review-queue]");
  if (!panel) return;

  const records = loadPaidReviewQueueRecords();
  const triage = loadPaidReviewTriage();
  const count = panel.querySelector("[data-paid-review-queue-count]");
  const statusElement = panel.querySelector("[data-paid-review-queue-status]");
  const list = panel.querySelector("[data-paid-review-queue-list]");
  const malformedCount = records.filter((record) => record.malformed).length;

  if (count) count.textContent = `${records.length} local ${records.length === 1 ? "record" : "records"}`;
  if (statusElement) {
    statusElement.textContent = records.length
      ? `${records.length} local metadata record(s) loaded. ${malformedCount} malformed row(s). These are triage prompts only, not revenue, demand, payment, or willingness-to-pay evidence.`
      : "Queue ready. No local paid-review intent metadata found in this browser.";
  }

  if (!list) return;
  list.replaceChildren();

  if (!records.length) {
    const empty = document.createElement("article");
    const emptyTitle = document.createElement("span");
    const emptyText = document.createElement("p");
    emptyTitle.textContent = "No local records loaded";
    emptyText.textContent = "Save paid-review interest above, then refresh this local-only queue.";
    empty.append(emptyTitle, emptyText);
    list.append(empty);
    return;
  }

  records
    .slice()
    .reverse()
    .forEach((record) => {
      const decision = triage[record.id]?.state || "unreviewed";
      const item = document.createElement("article");
      const title = document.createElement("span");
      const summary = document.createElement("p");
      const actions = document.createElement("div");
      const markReviewed = document.createElement("button");
      const markInvalid = document.createElement("button");

      title.textContent = `${record.offer} | ${record.capturedAt}`;
      summary.textContent = [
        `Source: ${record.source}.`,
        `Payment control: ${record.paymentControlStatus}.`,
        `Unlock still required: ${record.paymentUnlockRequired}.`,
        `Triage: ${decision}.`,
        record.malformed ? "Malformed local row: review metadata shape only." : "Metadata shape valid.",
        "No send, charge, contact enrichment, analytics, resume-text request, revenue claim, demand claim, payment claim, or willingness-to-pay claim is allowed.",
        "Planning export includes only local metadata, triage labels, stop routes, and false / Not observed flags.",
      ].join(" ");

      actions.className = "hero-actions paid-review-queue-actions";
      markReviewed.className = "secondary-action";
      markReviewed.type = "button";
      markReviewed.textContent = "Mark reviewed";
      markReviewed.dataset.paidReviewTriageAction = "reviewed";
      markReviewed.dataset.paidReviewIntentId = record.id;
      markInvalid.className = "secondary-action";
      markInvalid.type = "button";
      markInvalid.textContent = "Mark invalid metadata";
      markInvalid.dataset.paidReviewTriageAction = "invalid-metadata";
      markInvalid.dataset.paidReviewIntentId = record.id;

      actions.append(markReviewed, markInvalid);
      item.append(title, summary, actions);
      list.append(item);
    });
}

function wirePaidReviewQueue() {
  const panel = document.querySelector("[data-paid-review-queue]");
  if (!panel) return;

  panel.querySelector("[data-paid-review-queue-refresh]")?.addEventListener("click", renderPaidReviewQueue);
  panel.querySelector("[data-paid-review-export-build]")?.addEventListener("click", buildAndStorePaidReviewTriageExport);
  panel.querySelector("[data-paid-review-queue-clear]")?.addEventListener("click", () => {
    localStorage.removeItem(PAID_REVIEW_TRIAGE_KEY);
    localStorage.removeItem(PAID_REVIEW_TRIAGE_EXPORT_KEY);
    const output = panel.querySelector("[data-paid-review-export-output]");
    if (output) output.textContent = "";
    renderPaidReviewQueue();
  });
  panel.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-paid-review-triage-action]");
    if (!trigger) return;
    savePaidReviewTriage(trigger.dataset.paidReviewIntentId, trigger.dataset.paidReviewTriageAction);
    renderPaidReviewQueue();
  });

  renderPaidReviewQueue();
}

async function savePaidReviewInterest(controls, trigger) {
  const paymentControl = controls.payment_collection;
  if (!canCapturePaidReviewInterest(paymentControl)) {
    setPaidReviewStatus(trigger, paidReviewInterestText(paymentControl));
    return;
  }

  const intent = {
    capturedAt: new Date().toISOString(),
    source: "local-paid-review-interest",
    offer: "proof-packet",
    controlSource: CONTROL_SOURCE_PATH,
    paymentControlStatus: paymentControl.status,
    paymentUnlockRequired: firstUnlock(paymentControl),
    localOnly: true,
    paymentProcessed: false,
    note: "Local paid-review interest only. No checkout, card data, payment link, outbound send, analytics event, external service, or resume text was contacted or captured.",
  };

  localStorage.setItem(PAID_REVIEW_INTENT_LATEST_KEY, JSON.stringify(intent));
  appendPaidReviewQueueMirror(intent);
  renderPaidReviewQueue();
  setPaidReviewStatus(trigger, "Saved locally. Logging locally...");

  try {
    const response = await fetch("/api/dev-paid-review-intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(intent),
    });

    if (response.ok) {
      setPaidReviewStatus(
        trigger,
        `Saved locally. Logged to data/paid-review-intents/dev-paid-review-intents.jsonl. Production payment unlock required: ${intent.paymentUnlockRequired}.`
      );
    } else {
      setPaidReviewStatus(
        trigger,
        `Saved locally. Could not write the local paid-review intent log. Production payment unlock required: ${intent.paymentUnlockRequired}.`
      );
    }
  } catch {
    setPaidReviewStatus(
      trigger,
      `Saved locally. Could not reach the local paid-review intent logger. Production payment unlock required: ${intent.paymentUnlockRequired}.`
    );
  }
}

function wirePaidReviewInterest(controls) {
  document.querySelectorAll("[data-paid-review-interest]").forEach((element) => {
    element.addEventListener("click", () => savePaidReviewInterest(controls, element));
  });
}

async function submitLead(event) {
  event.preventDefault();
  const formData = new FormData(form);
  const consentTimestamp = formData.get("consent") ? new Date().toISOString() : "";
  const lead = {
    name: String(formData.get("name") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    targetRole: String(formData.get("targetRole") || "").trim(),
    capturedAt: new Date().toISOString(),
    consentTimestamp,
    source: "local-prototype",
  };

  if (!lead.name || !lead.email) {
    setLeadStatus("Add your name and email to save a local lead.");
    return;
  }

  if (!lead.consentTimestamp) {
    setLeadStatus("Confirm local early-access interest before saving.");
    return;
  }

  localStorage.setItem("proofresume:lastLead", JSON.stringify(lead));
  setLeadStatus("Saved locally. Logging locally...");

  try {
    const response = await fetch("/api/dev-lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(lead),
    });

    if (response.ok) {
      setLeadStatus(
        `Saved locally. Logged to data/leads/dev-leads.jsonl. No external service was contacted. Production lead capture remains controlled by ${CONTROL_SOURCE_PATH}.`
      );
    } else {
      setLeadStatus(
        `Saved locally. Could not write the local lead log. No external service was contacted. Production lead capture remains controlled by ${CONTROL_SOURCE_PATH}.`
      );
    }
  } catch {
    setLeadStatus(
      `Saved locally. Could not reach the local dev lead logger. No external service was contacted. Production lead capture remains controlled by ${CONTROL_SOURCE_PATH}.`
    );
  }

  form.reset();
}

const { controls, sourceLoaded } = await loadBusinessControls();
renderControls(controls, sourceLoaded);
renderBusinessActivationPacket(controls, sourceLoaded);
wireBusinessActivationPacketExport();
wireActivationDecisionLedger();
wireActivationDecisionPacketReviewStatus();
wirePaidReviewInterest(controls);
wirePaidReviewQueue();
form?.addEventListener("submit", submitLead);

const state = {
  documents: [],
  riskHistory: [],
  riskFiltersBound: false,
  rapidTickUtilization: null,
  rapidFiltersBound: false,
  bundleLibraryBound: false,
  bundleImportBound: false,
  bundleAnnotationTransferBound: false,
  bundleLibraryTransferBound: false,
  bundleFiltersBound: false,
  bundleLibraryFilters: null,
  redactedEvidenceInboxBound: false,
  feedbackRoadmapBound: false,
};

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const EXPORT_BUNDLES_STORAGE_KEY = "proofresume:exportBundles";
const BUNDLE_LIBRARY_FILTERS_STORAGE_KEY = "proofresume:bundleLibraryFilters";
const BUNDLE_LIBRARY_ANNOTATIONS_STORAGE_KEY = "proofresume:bundleLibraryAnnotations";
const BUNDLE_LIBRARY_ANNOTATIONS_FORMAT = "proofresume-bundle-library-annotations-v1";
const BUNDLE_LIBRARY_ARCHIVE_FORMAT = "proofresume-bundle-library-archive-v1";
const BUNDLE_LIBRARY_IMPORT_PREVIEW_FORMAT = "proofresume-bundle-library-import-preview-v1";
const FEEDBACK_ROADMAP_STORAGE_KEY = "proofresume:feedbackRoadmapDrafts";
const FEEDBACK_ROADMAP_FORMAT = "proofresume-feedback-to-roadmap-loop-v1";
const FEEDBACK_ROADMAP_DRAFT_FORMAT = "proofresume-feedback-roadmap-queue-draft-v1";
const REDACTED_EVIDENCE_INBOX_STORAGE_KEY = "proofresume:redactedSessionEvidenceInbox";
const REDACTED_EVIDENCE_INBOX_FORMAT = "proofresume-redacted-session-evidence-inbox-v1";
const REDACTED_EVIDENCE_RECORD_FORMAT = "proofresume-redacted-session-evidence-record-v1";
const REDACTED_EVIDENCE_KINDS = Object.freeze([
  "rehearsal_evidence",
  "authorized_feedback",
  "paid_interest_note",
  "privacy_objection",
  "no_action_no_offer_outcome",
]);
const FEEDBACK_ROADMAP_CLASSES = Object.freeze([
  "product_friction",
  "trust_objection",
  "willingness_to_pay_signal",
  "gtm_objection",
  "infrastructure_blocker",
]);

function parseTimestamp(value) {
  const raw = String(value || "");
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function mergeAnnotationRecords(existing, incoming) {
  if (!incoming || typeof incoming !== "object") return existing || null;
  if (!existing || typeof existing !== "object") return incoming;
  const existingUpdated = parseTimestamp(existing.updatedAt);
  const incomingUpdated = parseTimestamp(incoming.updatedAt);
  if (existingUpdated && incomingUpdated) return existingUpdated >= incomingUpdated ? existing : incoming;
  if (existingUpdated) return existing;
  if (incomingUpdated) return incoming;
  return incoming;
}

function loadBundleLibraryAnnotations(storageKey = BUNDLE_LIBRARY_ANNOTATIONS_STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") {
      return { format: BUNDLE_LIBRARY_ANNOTATIONS_FORMAT, items: {} };
    }
    if (parsed.format !== BUNDLE_LIBRARY_ANNOTATIONS_FORMAT) {
      return { format: BUNDLE_LIBRARY_ANNOTATIONS_FORMAT, items: {} };
    }
    const items = parsed.items && typeof parsed.items === "object" ? parsed.items : {};
    return { format: BUNDLE_LIBRARY_ANNOTATIONS_FORMAT, items };
  } catch {
    return { format: BUNDLE_LIBRARY_ANNOTATIONS_FORMAT, items: {} };
  }
}

function saveBundleLibraryAnnotations(annotations, storageKey = BUNDLE_LIBRARY_ANNOTATIONS_STORAGE_KEY) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(annotations));
  } catch {
    // Ignore storage failures (private mode / disabled storage).
  }
}

function normalizeTags(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((tag) => String(tag || "").trim())
      .filter(Boolean)
      .slice(0, 12);
  }
  return String(value)
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function getBundleLibraryAnnotation(bundleId, storageKey = BUNDLE_LIBRARY_ANNOTATIONS_STORAGE_KEY) {
  if (!bundleId) return null;
  const annotations = loadBundleLibraryAnnotations(storageKey);
  const raw = annotations.items?.[bundleId];
  if (!raw || typeof raw !== "object") return null;
  const notes = typeof raw.notes === "string" ? raw.notes : "";
  const tags = normalizeTags(raw.tags);
  const pinned = Boolean(raw.pinned);
  const pinnedAt = typeof raw.pinnedAt === "string" ? raw.pinnedAt : "";
  const updatedAt = typeof raw.updatedAt === "string" ? raw.updatedAt : "";
  return { notes, tags, pinned, pinnedAt, updatedAt };
}

function upsertBundleLibraryAnnotation(bundleId, next, storageKey = BUNDLE_LIBRARY_ANNOTATIONS_STORAGE_KEY) {
  if (!bundleId) return null;
  const annotations = loadBundleLibraryAnnotations(storageKey);
  const current = getBundleLibraryAnnotation(bundleId, storageKey) || {
    notes: "",
    tags: [],
    pinned: false,
    pinnedAt: "",
    updatedAt: "",
  };
  const nextPinned = typeof next?.pinned === "boolean" ? next.pinned : current.pinned;
  const merged = {
    notes: typeof next?.notes === "string" ? next.notes : current.notes,
    tags: next?.tags ? normalizeTags(next.tags) : current.tags,
    pinned: nextPinned,
    pinnedAt: nextPinned ? current.pinnedAt || new Date().toISOString() : "",
    updatedAt: new Date().toISOString(),
  };

  annotations.items = { ...(annotations.items || {}) };
  annotations.items[bundleId] = merged;
  saveBundleLibraryAnnotations(annotations, storageKey);
  return merged;
}

function getPinnedTimestamp(annotation) {
  const raw = String(annotation?.pinnedAt || "");
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function loadBundleLibraryFilters(storageKey = BUNDLE_LIBRARY_FILTERS_STORAGE_KEY) {
  try {
    const raw = sessionStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return { query: "", source: "all", recency: "any" };
    const query = typeof parsed.query === "string" ? parsed.query : "";
    const source = typeof parsed.source === "string" ? parsed.source : "all";
    const recency = typeof parsed.recency === "string" ? parsed.recency : "any";
    return { query, source, recency };
  } catch {
    return { query: "", source: "all", recency: "any" };
  }
}

function saveBundleLibraryFilters(filters, storageKey = BUNDLE_LIBRARY_FILTERS_STORAGE_KEY) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(filters));
  } catch {
    // Ignore storage failures (private mode / disabled storage).
  }
}

function getBundleTimestamp(bundle) {
  const raw = String(bundle?.updatedAt || bundle?.importedAt || "");
  return parseTimestamp(raw);
}

function recencyToThreshold(recencyValue) {
  const now = Date.now();
  switch (recencyValue) {
    case "24h":
      return now - 24 * 60 * 60 * 1000;
    case "7d":
      return now - 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return now - 30 * 24 * 60 * 60 * 1000;
    case "365d":
      return now - 365 * 24 * 60 * 60 * 1000;
    default:
      return null;
  }
}

function formatDate(value) {
  if (!value) return "Not finished";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : formatter.format(date);
}

function summarizeExportSnapshot(snapshot) {
  const safe = snapshot && typeof snapshot === "object" ? snapshot : null;
  if (!safe || safe.format !== "proofresume-local-section-v1") {
    return null;
  }

  const sections = Array.isArray(safe.sections) ? safe.sections : [];
  const accepted = Array.isArray(safe.accepted) ? safe.accepted : [];
  const followups = safe.followups && typeof safe.followups === "object" ? safe.followups : {};
  const evidenceItems = Array.isArray(followups.evidenceItems) ? followups.evidenceItems : [];
  const evidenceApprovedCount = evidenceItems.filter((item) => item && item.evidenceApproved).length;

  return {
    sectionCount: sections.length,
    evidenceApprovedCount,
    candidateAcceptedCount: accepted.length,
  };
}

function safeFilename(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatFileTimestamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown-time";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function text(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sourceHref(value) {
  const path = String(value || "").trim();
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("ops/")) return `../${path}`;
  if (path.startsWith("website/")) return path.replace(/^website\//, "");
  return path;
}

function sourceLink(value, label = value) {
  if (!value) return "";
  return `<a class="source-link" href="${escapeHtml(sourceHref(value))}">${escapeHtml(label || value)}</a>`;
}

function loadAllExportBundles(storageKey = EXPORT_BUNDLES_STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAllExportBundles(bundles, storageKey = EXPORT_BUNDLES_STORAGE_KEY) {
  try {
    const next = Array.isArray(bundles) ? bundles.slice(0, 50) : [];
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // Ignore storage failures (private mode / disabled storage).
  }
}

function loadExportBundleById(bundleId, storageKey = EXPORT_BUNDLES_STORAGE_KEY) {
  if (!bundleId) return null;
  const bundles = loadAllExportBundles(storageKey);
  const found = bundles.find((item) => item && item.id === bundleId) || null;
  const snapshot = found?.snapshot && typeof found.snapshot === "object" ? found.snapshot : null;
  if (!snapshot || snapshot.format !== "proofresume-local-section-v1") return null;
  return { ...found, snapshot };
}

function deleteExportBundleById(bundleId, storageKey = EXPORT_BUNDLES_STORAGE_KEY) {
  if (!bundleId) return false;
  const bundles = loadAllExportBundles(storageKey);
  const next = bundles.filter((bundle) => bundle && bundle.id !== bundleId);
  if (next.length === bundles.length) return false;
  saveAllExportBundles(next, storageKey);
  return true;
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function saveExportBundleSnapshot(snapshot, storageKey = EXPORT_BUNDLES_STORAGE_KEY) {
  const safe = snapshot && typeof snapshot === "object" ? snapshot : null;
  if (!safe || safe.format !== "proofresume-local-section-v1") return null;
  const now = new Date().toISOString();
  const id = randomId("bundle");
  const bundles = loadAllExportBundles(storageKey);
  const next = [
    { id, importedAt: now, updatedAt: now, format: safe.format, snapshot: safe, localOnly: true, source: "imported-json" },
    ...bundles,
  ];
  saveAllExportBundles(next, storageKey);
  return id;
}

async function copyToClipboard(value) {
  const textValue = String(value ?? "");
  if (!textValue) return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(textValue);
      return true;
    }
  } catch {
    // Fallback below.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = textValue;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.append(textarea);
    textarea.select();
    const succeeded = document.execCommand("copy");
    textarea.remove();
    return Boolean(succeeded);
  } catch {
    return false;
  }
}

function downloadJsonFile(payload, filename) {
  try {
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([`${json}\n`], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.rel = "noopener";
    link.dataset.exportBundleDownloadLink = "local-blob-only";
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    return true;
  } catch {
    return false;
  }
}

function normalizeFeedbackRoadmapSource(value) {
  const source = String(value || "").trim();
  if (!source) return "manual_operator_note";
  return source
    .replace(/https?:\/\/[^\s]+/gi, "external-url-redacted")
    .replace(/(?:api[_-]?key|secret|token|bearer)\s*[:=]\s*[^\s]+/gi, "credential-redacted")
    .slice(0, 180);
}

function redactEvidenceText(value, maxLength = 700) {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[contact-redacted]")
    .replace(/\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g, "[contact-redacted]")
    .replace(/https?:\/\/[^\s]+/gi, "external-url-redacted")
    .replace(/(?:api[_-]?key|secret|token|bearer|checkout|payment[_-]?id)\s*[:=]\s*[^\s]+/gi, "restricted-value-redacted")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function evidenceKindLabel(kind) {
  return String(kind || "rehearsal_evidence")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeEvidenceRecord(record, fallbackIndex = 0) {
  const now = new Date().toISOString();
  const evidenceKind = REDACTED_EVIDENCE_KINDS.includes(record?.evidenceKind) ? record.evidenceKind : "rehearsal_evidence";
  const sourceMode = String(record?.sourceMode || (evidenceKind === "authorized_feedback" ? "owner_approved_redacted" : "sample_rehearsal"));
  const ownerApproved = sourceMode === "owner_approved_redacted" || evidenceKind === "authorized_feedback";
  return {
    format: REDACTED_EVIDENCE_RECORD_FORMAT,
    evidenceId: String(record?.evidenceId || `redacted-evidence-${fallbackIndex + 1}`),
    evidenceKind,
    sourceMode,
    recordedAt: record?.recordedAt || now,
    proofLevel: String(record?.proofLevel || (ownerApproved ? "L1_authorized_feedback" : "L0_sample_rehearsal")),
    sourceCustodyMode: String(record?.sourceCustodyMode || (ownerApproved ? "redacted_repo_summary" : "sample_only")),
    redactionReviewState: String(record?.redactionReviewState || (ownerApproved ? "redacted_approved" : "sample_only")),
    personaSegment: redactEvidenceText(record?.personaSegment || "sample segment", 90),
    workflowTested: redactEvidenceText(record?.workflowTested || "target job proof audit", 120),
    findingCategory: redactEvidenceText(record?.findingCategory || "workflow_learning", 90),
    findingSummary: redactEvidenceText(record?.findingSummary || "No redacted finding summary supplied.", 700),
    evidenceStrength: String(record?.evidenceStrength || (ownerApproved ? "weak_signal" : "sample_only")),
    objectionClass: redactEvidenceText(record?.objectionClass || "none", 90),
    willingnessToPaySignal: redactEvidenceText(record?.willingnessToPaySignal || "not_measured", 90),
    privacyRiskSummary: redactEvidenceText(record?.privacyRiskSummary || "No raw customer material is stored in this inbox.", 200),
    queueTarget: String(record?.queueTarget || "no_queue_action"),
    queueAction: String(record?.queueAction || "no_queue_action"),
    queueReason: redactEvidenceText(record?.queueReason || "Record remains evidence-only until reviewed through queue discipline.", 240),
    sourcePath: normalizeFeedbackRoadmapSource(record?.sourcePath || "admin.html#redacted-evidence-inbox"),
    boundaries: {
      localOnly: true,
      sampleOrOwnerApprovedRedactedOnly: true,
      noRawResume: true,
      noProspectIdentity: true,
      noPrivateReply: true,
      noPaymentData: true,
      noCredentials: true,
      noCustomerMaterials: true,
      noQueueMutation: true,
      noRevenueClaim: true,
      noWillingnessToPayClaim: evidenceKind !== "paid_interest_note",
      ...(record?.boundaries || {}),
    },
    forbiddenRepoVisibleFields: [
      "raw resumes",
      "prospect identities",
      "contact details",
      "private replies",
      "credentials",
      "payment data",
      "calendar links",
      "dashboard urls",
      "customer materials",
    ],
  };
}

function loadLocalRedactedEvidenceRecords(storageKey = REDACTED_EVIDENCE_INBOX_STORAGE_KEY) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (!parsed || parsed.format !== REDACTED_EVIDENCE_INBOX_FORMAT || !Array.isArray(parsed.records)) return [];
    return parsed.records.map(normalizeEvidenceRecord);
  } catch {
    return [];
  }
}

function saveLocalRedactedEvidenceRecords(records, storageKey = REDACTED_EVIDENCE_INBOX_STORAGE_KEY) {
  const safeRecords = (Array.isArray(records) ? records : []).map(normalizeEvidenceRecord).slice(0, 40);
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        format: REDACTED_EVIDENCE_INBOX_FORMAT,
        updatedAt: new Date().toISOString(),
        localOnly: true,
        externalAction: false,
        queueMutationAllowed: false,
        records: safeRecords,
      })
    );
  } catch {
    // Ignore storage failures.
  }
  return safeRecords;
}

function redactedEvidenceRecordFromWorkspace() {
  try {
    const workspace = JSON.parse(localStorage.getItem("proofresume:localWorkspace:v1") || "null");
    const feedback = workspace?.firstSessionFeedback || {};
    const notes = [
      feedback.proofLoopComprehension && `Proof-loop comprehension: ${feedback.proofLoopComprehension}`,
      feedback.trustInEvidence && `Trust in evidence: ${feedback.trustInEvidence}`,
      feedback.strongestObjection && `Strongest objection: ${feedback.strongestObjection}`,
      feedback.confusionPoints && `Confusion points: ${feedback.confusionPoints}`,
      feedback.willingnessToShareMaterials && `Material-sharing boundary: ${feedback.willingnessToShareMaterials}`,
      feedback.paidPacketInterest && `Paid-packet interest label: ${feedback.paidPacketInterest}`,
      feedback.requestedNextAction && `Requested next action: ${feedback.requestedNextAction}`,
    ].filter(Boolean);
    if (!notes.length) return null;
    const paidSignal = /pay|paid|price|purchase|checkout/i.test(notes.join(" ")) ? "question_only_or_blocked" : "not_measured";
    return normalizeEvidenceRecord({
      evidenceId: `workspace-rehearsal-${formatFileTimestamp()}`,
      evidenceKind: paidSignal === "not_measured" ? "rehearsal_evidence" : "paid_interest_note",
      sourceMode: "sample_rehearsal",
      proofLevel: "L0_sample_rehearsal",
      sourceCustodyMode: "sample_only",
      redactionReviewState: "sample_only",
      personaSegment: feedback.testerSegment || "local workspace rehearsal",
      workflowTested: "account_resume_target_jobs_packet_approval_tracking",
      findingCategory: paidSignal === "not_measured" ? "first_session_rehearsal" : "paid_interest_boundary",
      findingSummary: notes.join(" | "),
      evidenceStrength: "sample_only",
      objectionClass: feedback.strongestObjection || feedback.objections || "not_observed",
      willingnessToPaySignal: paidSignal,
      privacyRiskSummary: "Imported from browser-local workspace notes after redaction; no raw resume text or contact details are included.",
      queueTarget: paidSignal === "not_measured" ? "product" : "business",
      queueAction: "send_to_review",
      queueReason: "Workspace rehearsal evidence can inform a queue draft only after controller review; it cannot mark a queue item done or ready.",
      sourcePath: "app.html#first-session-handoff",
    });
  } catch {
    return null;
  }
}

function summarizeRedactedEvidence(records) {
  const byKind = Object.fromEntries(REDACTED_EVIDENCE_KINDS.map((kind) => [kind, 0]));
  for (const record of records) {
    if (byKind[record.evidenceKind] !== undefined) byKind[record.evidenceKind] += 1;
  }
  return {
    total: records.length,
    sample: records.filter((record) => record.proofLevel === "L0_sample_rehearsal").length,
    ownerApproved: records.filter((record) => record.sourceMode === "owner_approved_redacted").length,
    queueMutationAllowed: 0,
    byKind,
  };
}

function renderRedactedEvidenceRecord(record) {
  return `
    <article class="redacted-evidence-card ${escapeHtml(record.evidenceKind)}">
      <div class="redacted-evidence-head">
        <div>
          <span>${escapeHtml(evidenceKindLabel(record.evidenceKind))}</span>
          <strong>${escapeHtml(record.findingCategory)}</strong>
        </div>
        <code>${escapeHtml(record.redactionReviewState)}</code>
      </div>
      <p>${escapeHtml(record.findingSummary)}</p>
      <div class="redacted-evidence-meta">
        <code>${escapeHtml(record.proofLevel)}</code>
        <code>${escapeHtml(record.evidenceStrength)}</code>
        <code>${escapeHtml(record.sourceCustodyMode)}</code>
        ${sourceLink(record.sourcePath, "source")}
      </div>
      <div class="redacted-evidence-route">
        <span>Queue route</span>
        <strong>${escapeHtml(record.queueTarget)} / ${escapeHtml(record.queueAction)}</strong>
        <p>${escapeHtml(record.queueReason)}</p>
      </div>
    </article>
  `;
}

function renderRedactedSessionEvidenceInbox(inbox = {}) {
  const summaryNode = document.querySelector("#redacted-evidence-summary");
  const lanesNode = document.querySelector("#redacted-evidence-lanes");
  const message = document.querySelector("#redacted-evidence-message");
  if (!summaryNode || !lanesNode) return;

  const staticRecords = Array.isArray(inbox.records) ? inbox.records.map(normalizeEvidenceRecord) : [];
  const localRecords = loadLocalRedactedEvidenceRecords();
  const records = [...localRecords, ...staticRecords];
  const summary = summarizeRedactedEvidence(records);

  text("#redacted-evidence-state", `${summary.total} redacted packet${summary.total === 1 ? "" : "s"}`);
  text(
    "#redacted-evidence-note",
    inbox.note ||
      "Sample and owner-approved redacted evidence packets are visible as workflow state only. Queue routing suggestions cannot mutate queues automatically."
  );

  summaryNode.innerHTML = [
    ["Total packets", summary.total],
    ["Sample rehearsal", summary.sample],
    ["Owner-approved", summary.ownerApproved],
    ["Queue mutations", summary.queueMutationAllowed],
    ["Raw-data fields", 0],
  ]
    .map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`)
    .join("");

  lanesNode.innerHTML = REDACTED_EVIDENCE_KINDS.map((kind) => {
    const laneRecords = records.filter((record) => record.evidenceKind === kind);
    return `
      <section class="redacted-evidence-lane">
        <div class="redacted-evidence-lane-head">
          <span>${escapeHtml(evidenceKindLabel(kind))}</span>
          <strong>${laneRecords.length}</strong>
        </div>
        <div class="redacted-evidence-list">
          ${
            laneRecords.length
              ? laneRecords.map(renderRedactedEvidenceRecord).join("")
              : `<article class="empty-card">No ${escapeHtml(evidenceKindLabel(kind).toLowerCase())} packet yet.</article>`
          }
        </div>
      </section>
    `;
  }).join("");

  if (!state.redactedEvidenceInboxBound) {
    document.querySelector("[data-evidence-load-workspace]")?.addEventListener("click", () => {
      const record = redactedEvidenceRecordFromWorkspace();
      if (!record) {
        if (message) message.textContent = "No browser-local workspace rehearsal notes found.";
        return;
      }
      saveLocalRedactedEvidenceRecords([record, ...loadLocalRedactedEvidenceRecords()]);
      if (message) message.textContent = "Loaded one redacted workspace rehearsal packet into the local inbox.";
      renderRedactedSessionEvidenceInbox(inbox);
    });

    document.querySelector("[data-evidence-export]")?.addEventListener("click", () => {
      const exported = downloadJsonFile(
        {
          format: REDACTED_EVIDENCE_INBOX_FORMAT,
          exportedAt: new Date().toISOString(),
          localOnly: true,
          externalAction: false,
          queueMutationAllowed: false,
          forbiddenRepoVisibleFields: normalizeEvidenceRecord({}).forbiddenRepoVisibleFields,
          records,
        },
        `proofresume-redacted-session-evidence-inbox-${formatFileTimestamp()}.json`
      );
      if (message) message.textContent = exported ? "Exported redacted local evidence inbox." : "Could not export the inbox.";
    });

    document.querySelector("[data-evidence-clear]")?.addEventListener("click", () => {
      saveLocalRedactedEvidenceRecords([]);
      if (message) message.textContent = "Cleared browser-local redacted evidence packets.";
      renderRedactedSessionEvidenceInbox(inbox);
    });

    state.redactedEvidenceInboxBound = true;
  }
}

function loadFeedbackRoadmapDrafts(storageKey = FEEDBACK_ROADMAP_STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || parsed.format !== FEEDBACK_ROADMAP_FORMAT) {
      return { format: FEEDBACK_ROADMAP_FORMAT, localOnly: true, externalAction: false, drafts: [] };
    }
    const drafts = Array.isArray(parsed.drafts) ? parsed.drafts.filter((draft) => draft && typeof draft === "object") : [];
    return { ...parsed, format: FEEDBACK_ROADMAP_FORMAT, localOnly: true, externalAction: false, drafts };
  } catch {
    return { format: FEEDBACK_ROADMAP_FORMAT, localOnly: true, externalAction: false, drafts: [] };
  }
}

function saveFeedbackRoadmapDrafts(payload, storageKey = FEEDBACK_ROADMAP_STORAGE_KEY) {
  try {
    const safe = {
      format: FEEDBACK_ROADMAP_FORMAT,
      localOnly: true,
      externalAction: false,
      updatedAt: new Date().toISOString(),
      drafts: Array.isArray(payload?.drafts) ? payload.drafts.slice(0, 40) : [],
    };
    localStorage.setItem(storageKey, JSON.stringify(safe));
    return safe;
  } catch {
    return null;
  }
}

function classifyFeedbackObservation(observation) {
  const textValue = String(observation || "").toLowerCase();
  const scores = {
    product_friction: ["confusing", "hard", "stuck", "unclear", "workflow", "edit", "approve", "packet", "resume", "job", "matching"].filter((token) =>
      textValue.includes(token)
    ).length,
    trust_objection: ["trust", "proof", "evidence", "invent", "hallucinat", "privacy", "safe", "claim", "source"].filter((token) => textValue.includes(token))
      .length,
    willingness_to_pay_signal: ["pay", "price", "paid", "$", "buy", "charge", "checkout", "invoice", "refund"].filter((token) => textValue.includes(token))
      .length,
    gtm_objection: ["coach", "referral", "channel", "linkedin", "email", "share", "friend", "community", "positioning"].filter((token) =>
      textValue.includes(token)
    ).length,
    infrastructure_blocker: ["deploy", "login", "auth", "storage", "database", "upload", "analytics", "payment link", "connector", "calendar", "mfa"].filter(
      (token) => textValue.includes(token)
    ).length,
  };
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[1] ? sorted[0][0] : "product_friction";
}

function classifyFeedbackRoadmapObservation(value) {
  return classifyFeedbackObservation(value);
}

function queueLaneForFeedbackClass(classification) {
  switch (classification) {
    case "willingness_to_pay_signal":
      return "business";
    case "gtm_objection":
      return "strategy";
    case "infrastructure_blocker":
      return "commons_or_approval_unblocker";
    case "trust_objection":
      return "product_or_qa";
    default:
      return "product";
  }
}

function feedbackRoadmapTargetQueue(classification) {
  return queueLaneForFeedbackClass(classification);
}

function feedbackRoadmapRecommendedStatus(classification, mode) {
  if (classification === "willingness_to_pay_signal" || classification === "infrastructure_blocker") {
    return "blocked_until_real_evidence";
  }
  return mode === "owner_approved_redacted" ? "draft_review_required" : "draft_later";
}

function titleForFeedbackDraft(classification, observation) {
  const firstSentence = String(observation || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/[.!?]/)[0]
    .slice(0, 72);
  const prefix = classification
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return firstSentence ? `${prefix}: ${firstSentence}` : `${prefix} follow-up`;
}

function buildFeedbackRoadmapDraft({ observation, source, mode }) {
  const normalizedObservation = String(observation || "").trim();
  const classification = classifyFeedbackObservation(normalizedObservation);
  const now = new Date().toISOString();
  const sourceValue = String(source || "").trim() || "admin.html#feedback-roadmap";
  const modeValue = String(mode || "sample_rehearsal");
  return {
    format: FEEDBACK_ROADMAP_DRAFT_FORMAT,
    id: randomId("feedback-draft"),
    createdAt: now,
    updatedAt: now,
    mode: modeValue,
    classification,
    targetQueue: queueLaneForFeedbackClass(classification),
    suggestedLane: queueLaneForFeedbackClass(classification),
    title: titleForFeedbackDraft(classification, normalizedObservation),
    observation: normalizedObservation,
    recommendedStatus: feedbackRoadmapRecommendedStatus(classification, modeValue),
    readyAutomatically: false,
    canMarkReady: false,
    readyRule:
      "Queue suggestions remain drafts until queue discipline, control boundaries, and observed evidence allow a separate worker or controller to promote them.",
    noExternalAction: true,
    noCustomerDataStored: true,
    noRevenueClaim: true,
    noWillingnessToPayClaim: true,
    evidence: {
      source: sourceValue,
      anchor: `feedback-note-${formatFileTimestamp(now)}`,
      observation: normalizedObservation,
      redacted: true,
      allowedEvidenceOnly: true,
    },
    queueSuggestion: {
      format: "agentfoundry-queue-item-draft-v1",
      statusRecommendation: "draft_only_needs_controller_review",
      mayMarkReadyAutomatically: false,
      acceptanceCriteria: [
        "Confirm the evidence source is sample or owner-approved redacted feedback.",
        "Keep raw resumes, identities, contact details, private replies, payment data, credentials, and customer materials out of the queue item.",
        "Route through the owning product, business, strategy, QA, Commons, or approval-unblocker queue before implementation.",
      ],
    },
    boundaries: {
      localOnly: true,
      externalAction: false,
      noOutreach: true,
      noPayment: true,
      noAnalytics: true,
      noDeploy: true,
      noProductionCustomerData: true,
      noApplicationSubmission: true,
      noRevenueClaim: true,
      noCustomerFeedbackClaim: mode !== "owner_approved_redacted",
    },
  };
}

function readWorkspaceRehearsalObservations() {
  try {
    const workspace = JSON.parse(localStorage.getItem("proofresume:localWorkspace:v1") || "null");
    const feedback = workspace?.firstSessionFeedback || {};
    return [
      feedback.proofLoopComprehension,
      feedback.trustInEvidence,
      feedback.strongestObjection || feedback.objections,
      feedback.confusionPoints,
      feedback.willingnessToShareMaterials,
      feedback.paidPacketInterest || feedback.willingnessToPay,
      feedback.requestedNextAction,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function bindFeedbackRoadmap() {
  renderFeedbackRoadmap();
}

function feedbackDraftsByClassification(drafts) {
  const counts = Object.fromEntries(FEEDBACK_ROADMAP_CLASSES.map((name) => [name, 0]));
  for (const draft of drafts || []) {
    if (counts[draft?.classification] !== undefined) counts[draft.classification] += 1;
  }
  return counts;
}

function renderFeedbackRoadmap() {
  const form = document.querySelector("#feedback-roadmap-form");
  const message = document.querySelector("#feedback-roadmap-message");
  const stateLabel = document.querySelector("#feedback-roadmap-state");
  const summary = document.querySelector("#feedback-roadmap-summary");
  const list = document.querySelector("#feedback-roadmap-drafts");
  if (!form || !summary || !list) return;

  const payload = loadFeedbackRoadmapDrafts();
  const drafts = payload.drafts || [];
  const counts = feedbackDraftsByClassification(drafts);
  if (stateLabel) stateLabel.textContent = `${drafts.length} local draft${drafts.length === 1 ? "" : "s"}`;
  summary.innerHTML = [
    ["Product friction", counts.product_friction],
    ["Trust objection", counts.trust_objection],
    ["WTP signal", counts.willingness_to_pay_signal],
    ["GTM objection", counts.gtm_objection],
    ["Infra blocker", counts.infrastructure_blocker],
  ]
    .map(([label, count]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(count)}</strong></article>`)
    .join("");

  if (!state.feedbackRoadmapBound) {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const observation = String(formData.get("observation") || "").trim();
      if (!observation) {
        if (message) message.textContent = "Add one redacted observation before drafting a suggestion.";
        return;
      }
      const current = loadFeedbackRoadmapDrafts();
      const draft = buildFeedbackRoadmapDraft({
        observation,
        source: String(formData.get("source") || ""),
        mode: String(formData.get("mode") || "sample_rehearsal"),
      });
      saveFeedbackRoadmapDrafts({ drafts: [draft, ...(current.drafts || [])] });
      form.reset();
      if (message) message.textContent = "Drafted a local queue suggestion. It is not ready until reviewed and routed.";
      renderFeedbackRoadmap();
    });

    document.querySelector("[data-feedback-load-workspace]")?.addEventListener("click", () => {
      try {
        const workspace = JSON.parse(localStorage.getItem("proofresume:localWorkspace:v1") || "null");
        const feedback = workspace?.firstSessionFeedback || {};
        const notes = [
          feedback.proofLoopComprehension && `Proof-loop comprehension: ${feedback.proofLoopComprehension}`,
          feedback.trustInEvidence && `Trust in evidence: ${feedback.trustInEvidence}`,
          feedback.strongestObjection && `Strongest objection: ${feedback.strongestObjection}`,
          feedback.confusionPoints && `Confusion points: ${feedback.confusionPoints}`,
          feedback.willingnessToShareMaterials && `Willingness to share materials: ${feedback.willingnessToShareMaterials}`,
          feedback.paidPacketInterest && `Paid-packet interest: ${feedback.paidPacketInterest}`,
          feedback.requestedNextAction && `Requested next action: ${feedback.requestedNextAction}`,
        ].filter(Boolean);
        const observationField = form.elements.observation;
        const sourceField = form.elements.source;
        if (observationField instanceof HTMLTextAreaElement) observationField.value = notes.join("\n") || "";
        if (sourceField instanceof HTMLInputElement) sourceField.value = "app.html#first-session-handoff";
        if (message) message.textContent = notes.length ? "Loaded redacted workspace feedback fields into the draft form." : "No saved workspace feedback notes found.";
      } catch {
        if (message) message.textContent = "Could not read local workspace feedback notes.";
      }
    });

    document.querySelector("[data-feedback-export]")?.addEventListener("click", () => {
      const current = loadFeedbackRoadmapDrafts();
      const downloaded = downloadJsonFile(current, `proofresume-feedback-roadmap-drafts-${formatFileTimestamp()}.json`);
      if (message) message.textContent = downloaded ? "Exported local feedback-roadmap drafts." : "Could not export local drafts.";
    });

    document.querySelector("[data-feedback-clear]")?.addEventListener("click", () => {
      saveFeedbackRoadmapDrafts({ drafts: [] });
      if (message) message.textContent = "Cleared browser-local feedback-roadmap drafts.";
      renderFeedbackRoadmap();
    });

    list.addEventListener("click", async (event) => {
      const copyButton = event.target.closest("button[data-feedback-copy]");
      if (!copyButton) return;
      const draft = loadFeedbackRoadmapDrafts().drafts.find((item) => item.id === copyButton.dataset.feedbackCopy);
      if (!draft) return;
      const copied = await copyToClipboard(JSON.stringify(draft.queueSuggestion, null, 2));
      if (message) message.textContent = copied ? "Copied queue suggestion draft JSON." : "Could not copy draft JSON.";
    });

    state.feedbackRoadmapBound = true;
  }

  list.innerHTML = drafts.length
    ? drafts
        .map(
          (draft) => `
            <article class="feedback-roadmap-card ${escapeHtml(draft.classification || "product_friction")}">
              <div>
                <span>${escapeHtml((draft.classification || "product_friction").replace(/_/g, " "))}</span>
                <strong>${escapeHtml(draft.title || "Untitled feedback draft")}</strong>
              </div>
              <p>${escapeHtml(draft.evidence?.observation || "No observation captured.")}</p>
              <div class="feedback-roadmap-meta">
                <code>${escapeHtml(draft.suggestedLane || "product")}</code>
                <code>${escapeHtml(draft.queueSuggestion?.statusRecommendation || "draft_only_needs_controller_review")}</code>
                ${sourceLink(draft.evidence?.source || "", "evidence source")}
              </div>
              <div class="feedback-roadmap-actions">
                <button type="button" class="secondary-action" data-feedback-copy="${escapeHtml(draft.id)}">Copy queue draft</button>
                <span class="micro-note">Local only. Controller review required before queue mutation.</span>
              </div>
            </article>
          `
        )
        .join("")
    : `<article class="empty-card">No feedback-roadmap drafts yet. Add a redacted observation or load workspace notes to create the first draft.</article>`;
}

function redactedEvidenceDefaultRecords() {
  const now = new Date().toISOString();
  return [
    {
      format: REDACTED_EVIDENCE_RECORD_FORMAT,
      id: "sample-rehearsal-proof-loop-001",
      createdAt: now,
      evidenceKind: "rehearsal_evidence",
      label: "Sample proof-loop rehearsal",
      source: "ops/launch/first-feedback-session-sample-evidence-packet.md",
      sourceCustodyMode: "sample_only",
      redactionReviewState: "sample_only",
      evidenceStrength: "sample_only",
      summary: "Sample participant understands proof gaps after operator explanation; no live feedback is claimed.",
      queueRouting: {
        target: "no_queue_action",
        action: "no_queue_action",
        readiness: "sample_only_no_business_evidence",
        reason: "Rehearsal confirms the handoff shape and should not create live queue work.",
      },
    },
    {
      format: REDACTED_EVIDENCE_RECORD_FORMAT,
      id: "authorized-feedback-gate-001",
      createdAt: now,
      evidenceKind: "authorized_feedback",
      label: "Authorized feedback gate",
      source: "ops/launch/feedback-session-tracker.template.json",
      sourceCustodyMode: "not_collected",
      redactionReviewState: "needs_review",
      evidenceStrength: "not_evidence",
      summary: "No owner-approved redacted first-session packet is present yet.",
      queueRouting: {
        target: "approval_unblocker",
        action: "block_until_authority",
        readiness: "blocked_missing_owner_approved_redacted_packet",
        reason: "Real feedback display stays blocked until source, consent, and redaction evidence exist.",
      },
    },
    {
      format: REDACTED_EVIDENCE_RECORD_FORMAT,
      id: "paid-interest-question-only-001",
      createdAt: now,
      evidenceKind: "paid_interest_note",
      label: "Paid-offer question only",
      source: "ops/launch/first-feedback-session-sample-evidence-packet.md#Paid-Packet-And-No-Offer-Handling",
      sourceCustodyMode: "sample_only",
      redactionReviewState: "sample_only",
      evidenceStrength: "sample_only",
      summary: "Sample pricing question is classified as question_only, not willingness-to-pay or revenue evidence.",
      queueRouting: {
        target: "business",
        action: "block_until_authority",
        readiness: "blocked_payment_authority_missing",
        reason: "Payment owner, support/refund, customer-data fulfillment, and route-health evidence remain gated.",
      },
    },
    {
      format: REDACTED_EVIDENCE_RECORD_FORMAT,
      id: "privacy-objection-boundary-001",
      createdAt: now,
      evidenceKind: "privacy_objection",
      label: "Material-sharing boundary",
      source: "ops/launch/first-session-redacted-evidence-handoff-drill.md",
      sourceCustodyMode: "sample_only",
      redactionReviewState: "sample_only",
      evidenceStrength: "sample_only",
      summary: "Sample note says operators should restate local-only and redacted-material boundaries before any real notes.",
      queueRouting: {
        target: "business",
        action: "update_existing_item",
        readiness: "sample_context_only",
        reason: "Preserve customer-data and owner-authority blockers until a real approved lane exists.",
      },
    },
    {
      format: REDACTED_EVIDENCE_RECORD_FORMAT,
      id: "no-offer-no-action-001",
      createdAt: now,
      evidenceKind: "no_action_no_offer_outcome",
      label: "No-offer outcome",
      source: "commons/templates/customer-evidence-redaction/docs/source-custody-and-queue-rules.md",
      sourceCustodyMode: "sample_only",
      redactionReviewState: "sample_only",
      evidenceStrength: "not_evidence",
      summary: "A packet can intentionally produce no queue action when it is sample-only, duplicate, too weak, or no-offer.",
      queueRouting: {
        target: "no_queue_action",
        action: "no_queue_action",
        readiness: "noop_preserve_existing_blockers",
        reason: "Avoid queue churn when no current evidence changes the product, business, strategy, QA, or Commons state.",
      },
    },
  ];
}

function forbiddenRedactedEvidenceValue(record) {
  const serialized = JSON.stringify(record || {});
  return /(?:[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|https?:\/\/|api[_-]?key|secret|token|bearer\s+[a-z0-9]|raw_resume_text|raw_transcript|raw_customer_quote|payment_identifier|payment_card|provider_record_id|signed_url|dashboard_url|calendar_link)/i.test(serialized);
}

function normalizeRedactedEvidenceRecord(record, index = 0) {
  const source = record && typeof record === "object" ? record : {};
  const evidenceKind = REDACTED_EVIDENCE_KINDS.includes(source.evidenceKind) ? source.evidenceKind : "rehearsal_evidence";
  const queueRouting = source.queueRouting && typeof source.queueRouting === "object" ? source.queueRouting : {};
  const normalized = {
    format: REDACTED_EVIDENCE_RECORD_FORMAT,
    id: String(source.id || `local-redacted-evidence-${index + 1}`).slice(0, 96),
    createdAt: String(source.createdAt || new Date().toISOString()),
    evidenceKind,
    label: String(source.label || evidenceKind.replace(/_/g, " ")).slice(0, 120),
    source: normalizeFeedbackRoadmapSource(source.source || "admin.html#redacted-evidence-inbox"),
    sourceCustodyMode: String(source.sourceCustodyMode || "sample_only"),
    redactionReviewState: String(source.redactionReviewState || "needs_review"),
    evidenceStrength: String(source.evidenceStrength || "sample_only"),
    summary: String(source.summary || "Redacted local evidence packet.").slice(0, 900),
    queueRouting: {
      target: String(queueRouting.target || source.queueTarget || "no_queue_action"),
      action: String(queueRouting.action || source.queueAction || "no_queue_action"),
      readiness: String(queueRouting.readiness || "draft_only_needs_controller_review"),
      reason: String(queueRouting.reason || "Controller review required before queue mutation.").slice(0, 500),
    },
    queueSuggestion: {
      format: "agentfoundry-queue-item-draft-v1",
      statusRecommendation: "draft_only_needs_controller_review",
      mayMarkReadyAutomatically: false,
    },
    boundaries: {
      localOnly: true,
      externalAction: false,
      productionCustomerData: false,
      customerFeedbackClaim: false,
      willingnessToPayClaim: false,
      revenueClaim: false,
      queueMutation: false,
    },
  };
  if (forbiddenRedactedEvidenceValue(normalized)) {
    return null;
  }
  return normalized;
}

function loadRedactedEvidenceInbox(storageKey = REDACTED_EVIDENCE_INBOX_STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || parsed.format !== REDACTED_EVIDENCE_INBOX_FORMAT) {
      return {
        format: REDACTED_EVIDENCE_INBOX_FORMAT,
        localOnly: true,
        externalAction: false,
        productionCustomerData: false,
        queueSuggestionsReadyAutomatically: false,
        records: redactedEvidenceDefaultRecords(),
      };
    }
    const records = (Array.isArray(parsed.records) ? parsed.records : [])
      .map((record, index) => normalizeRedactedEvidenceRecord(record, index))
      .filter(Boolean)
      .slice(0, 50);
    return {
      format: REDACTED_EVIDENCE_INBOX_FORMAT,
      localOnly: true,
      externalAction: false,
      productionCustomerData: false,
      queueSuggestionsReadyAutomatically: false,
      updatedAt: parsed.updatedAt || "",
      records,
    };
  } catch {
    return {
      format: REDACTED_EVIDENCE_INBOX_FORMAT,
      localOnly: true,
      externalAction: false,
      productionCustomerData: false,
      queueSuggestionsReadyAutomatically: false,
      records: redactedEvidenceDefaultRecords(),
    };
  }
}

function saveRedactedEvidenceInbox(records, storageKey = REDACTED_EVIDENCE_INBOX_STORAGE_KEY) {
  const safeRecords = (Array.isArray(records) ? records : [])
    .map((record, index) => normalizeRedactedEvidenceRecord(record, index))
    .filter(Boolean)
    .slice(0, 50);
  const payload = {
    format: REDACTED_EVIDENCE_INBOX_FORMAT,
    localOnly: true,
    externalAction: false,
    productionCustomerData: false,
    queueSuggestionsReadyAutomatically: false,
    updatedAt: new Date().toISOString(),
    records: safeRecords,
  };
  try {
    localStorage.setItem(storageKey, JSON.stringify(payload));
  } catch {
    // Ignore local storage failures.
  }
  return payload;
}

function redactedEvidenceCounts(records) {
  const counts = Object.fromEntries(REDACTED_EVIDENCE_KINDS.map((kind) => [kind, 0]));
  for (const record of records || []) {
    if (counts[record?.evidenceKind] !== undefined) counts[record.evidenceKind] += 1;
  }
  return counts;
}

function renderRedactedEvidenceInbox() {
  const summary = document.querySelector("#redacted-evidence-summary");
  const lanes = document.querySelector("#redacted-evidence-lanes");
  const stateLabel = document.querySelector("#redacted-evidence-state");
  const message = document.querySelector("#redacted-evidence-message");
  if (!summary || !lanes) return;

  const inbox = loadRedactedEvidenceInbox();
  const records = inbox.records || [];
  const counts = redactedEvidenceCounts(records);
  if (stateLabel) stateLabel.textContent = `${records.length} local record${records.length === 1 ? "" : "s"}`;

  summary.innerHTML = REDACTED_EVIDENCE_KINDS.map(
    (kind) => `<article><span>${escapeHtml(kind.replace(/_/g, " "))}</span><strong>${escapeHtml(counts[kind] || 0)}</strong></article>`
  ).join("");

  if (!state.redactedEvidenceInboxBound) {
    document.querySelector("[data-evidence-load-workspace]")?.addEventListener("click", () => {
      try {
        const workspace = JSON.parse(localStorage.getItem("proofresume:localWorkspace:v1") || "null");
        const feedback = workspace?.firstSessionFeedback || {};
        const observation = [
          feedback.proofLoopComprehension && `Proof-loop comprehension: ${feedback.proofLoopComprehension}`,
          feedback.trustInEvidence && `Trust in evidence: ${feedback.trustInEvidence}`,
          feedback.strongestObjection && `Strongest objection: ${feedback.strongestObjection}`,
          feedback.confusionPoints && `Confusion points: ${feedback.confusionPoints}`,
          feedback.paidPacketInterest && `Paid-packet interest: ${feedback.paidPacketInterest}`,
        ]
          .filter(Boolean)
          .join("\n");
        if (!observation) {
          if (message) message.textContent = "No local rehearsal feedback was found in this browser workspace.";
          return;
        }
        const record = normalizeRedactedEvidenceRecord({
          id: `workspace-redacted-evidence-${Date.now().toString(16)}`,
          evidenceKind: "rehearsal_evidence",
          label: "Workspace rehearsal note",
          source: "app.html#first-session-handoff",
          sourceCustodyMode: "sample_only",
          redactionReviewState: "sample_only",
          evidenceStrength: "sample_only",
          summary: observation,
          queueRouting: {
            target: "product",
            action: "send_to_review",
            readiness: "draft_only_needs_controller_review",
            reason: "Local workspace rehearsal note can inform product review only after controller review.",
          },
        });
        if (!record) {
          if (message) message.textContent = "Workspace note was rejected because it appeared to contain forbidden raw values.";
          return;
        }
        saveRedactedEvidenceInbox([record, ...loadRedactedEvidenceInbox().records]);
        if (message) message.textContent = "Loaded workspace rehearsal note into the local redacted evidence inbox.";
        renderRedactedEvidenceInbox();
      } catch {
        if (message) message.textContent = "Could not read local workspace rehearsal evidence.";
      }
    });

    document.querySelector("[data-evidence-export]")?.addEventListener("click", () => {
      const downloaded = downloadJsonFile(loadRedactedEvidenceInbox(), `proofresume-redacted-evidence-inbox-${formatFileTimestamp()}.json`);
      if (message) message.textContent = downloaded ? "Exported local redacted evidence inbox." : "Could not export local inbox.";
    });

    document.querySelector("[data-evidence-clear]")?.addEventListener("click", () => {
      saveRedactedEvidenceInbox([]);
      if (message) message.textContent = "Cleared browser-local redacted evidence inbox records.";
      renderRedactedEvidenceInbox();
    });

    state.redactedEvidenceInboxBound = true;
  }

  lanes.innerHTML = records.length
    ? records
        .map(
          (record) => `
            <article class="redacted-evidence-card ${escapeHtml(record.evidenceKind)}">
              <div>
                <span>${escapeHtml(record.evidenceKind.replace(/_/g, " "))}</span>
                <strong>${escapeHtml(record.label)}</strong>
              </div>
              <p>${escapeHtml(record.summary)}</p>
              <div class="redacted-evidence-meta">
                <code>${escapeHtml(record.sourceCustodyMode)}</code>
                <code>${escapeHtml(record.redactionReviewState)}</code>
                <code>${escapeHtml(record.evidenceStrength)}</code>
                ${sourceLink(record.source, "source")}
              </div>
              <div class="redacted-evidence-routing">
                <code>${escapeHtml(`${record.queueRouting.target}:${record.queueRouting.action}`)}</code>
                <span>${escapeHtml(record.queueRouting.reason)}</span>
              </div>
              <small>Draft only. No queue mutation, customer-feedback claim, willingness-to-pay claim, or revenue claim.</small>
            </article>
          `
        )
        .join("")
    : `<article class="empty-card">No local evidence records. Use the sample reset by clearing browser storage or load workspace rehearsal notes.</article>`;
}

function renderBundleLibrary() {
  const list = document.querySelector("#bundle-library-list");
  const total = document.querySelector("#bundle-library-total");
  const summary = document.querySelector("#bundle-library-summary");
  const matchCount = document.querySelector("[data-pr='bundleLibraryMatchCount']");
  if (!list) return;

  if (!state.bundleLibraryTransferBound) {
    const transferStatus = document.querySelector("[data-pr='bundleLibraryTransferStatus']");
    const exportButton = document.querySelector("button[data-pr='exportBundleLibrary']");
    const importButton = document.querySelector("button[data-pr='importBundleLibrary']");
    const importFileInput = document.querySelector("input[data-pr='importBundleLibraryFile']");
    const importActions = document.querySelector("[data-pr='bundleLibraryImportActions']");
    const importMerge = document.querySelector("button[data-pr='bundleLibraryImportMerge']");
    const importReplace = document.querySelector("button[data-pr='bundleLibraryImportReplace']");
    const importDownloadPreview = document.querySelector("button[data-pr='bundleLibraryImportDownloadPreview']");
    const importCancel = document.querySelector("button[data-pr='bundleLibraryImportCancel']");
    let pendingLibraryImport = null;
    const clearPendingLibraryImport = () => {
      pendingLibraryImport = null;
      if (importActions instanceof HTMLElement) importActions.hidden = true;
    };
    const showPendingLibraryImport = () => {
      if (!(importActions instanceof HTMLElement)) return;
      importActions.hidden = false;
    };

    if (exportButton instanceof HTMLButtonElement) {
      exportButton.addEventListener("click", () => {
        if (transferStatus) transferStatus.textContent = "";
        if (importActions instanceof HTMLElement) importActions.hidden = true;
        pendingLibraryImport = null;
        const bundles = loadAllExportBundles();
        const annotations = loadBundleLibraryAnnotations();
        const bundleCount = bundles.length;
        const annotationCount = Object.keys(annotations.items || {}).length;

        if (!bundleCount && !annotationCount) {
          if (transferStatus) transferStatus.textContent = "No local bundles or bundle annotations found to export yet.";
          return;
        }

        const now = new Date();
        const payload = {
          format: BUNDLE_LIBRARY_ARCHIVE_FORMAT,
          exportedAt: now.toISOString(),
          bundles,
          annotations: {
            format: BUNDLE_LIBRARY_ANNOTATIONS_FORMAT,
            items: annotations.items || {},
          },
        };
        const filename = `proofresume-bundle-library-${formatFileTimestamp(now)}.json`;
        const downloaded = downloadJsonFile(payload, filename);
        if (transferStatus) {
          transferStatus.textContent = downloaded
            ? `Downloaded bundle library: ${bundleCount} bundle${bundleCount === 1 ? "" : "s"}, ${annotationCount} annotation record${annotationCount === 1 ? "" : "s"}.`
            : "Export failed: download did not start in this browser environment.";
        }
      });
    }

    if (importButton instanceof HTMLButtonElement && importFileInput instanceof HTMLInputElement) {
      importButton.addEventListener("click", () => {
        if (transferStatus) transferStatus.textContent = "";
        if (importActions instanceof HTMLElement) importActions.hidden = true;
        pendingLibraryImport = null;
        importFileInput.value = "";
        importFileInput.click();
      });

      const normalizeBundle = (bundle, fallbackSource = "imported-library") => {
        if (!bundle || typeof bundle !== "object") return null;
        const id = String(bundle.id || "").trim();
        if (!id) return null;
        const snapshot = bundle.snapshot && typeof bundle.snapshot === "object" ? bundle.snapshot : null;
        if (!snapshot || snapshot.format !== "proofresume-local-section-v1") return null;
        const importedAt = typeof bundle.importedAt === "string" ? bundle.importedAt : "";
        const updatedAt = typeof bundle.updatedAt === "string" ? bundle.updatedAt : importedAt || "";
        const format = typeof bundle.format === "string" ? bundle.format : snapshot.format;
        const source = typeof bundle.source === "string" && bundle.source.trim() ? bundle.source : fallbackSource;
        const localOnly = Boolean(bundle.localOnly ?? true);
        return { id, importedAt, updatedAt, format, snapshot, localOnly, source };
      };

	      const mergeBundles = (existingBundles, incomingBundles, mergedAnnotations) => {
	        const byId = new Map();
	        for (const existing of existingBundles) {
	          const normalized = normalizeBundle(existing, String(existing?.source || "existing"));
	          if (!normalized) continue;
	          byId.set(normalized.id, normalized);
	        }

        let incomingValid = 0;
        let adopted = 0;
        for (const incoming of incomingBundles) {
          const normalized = normalizeBundle(incoming, "imported-library");
          if (!normalized) continue;
          incomingValid += 1;
          const prior = byId.get(normalized.id);
          if (!prior) {
            byId.set(normalized.id, normalized);
            adopted += 1;
            continue;
          }
          if (getBundleTimestamp(normalized) > getBundleTimestamp(prior)) {
            byId.set(normalized.id, normalized);
            adopted += 1;
          }
        }

	        const all = Array.from(byId.values());
	        const pinnedIds = new Set(
	          Object.entries(mergedAnnotations?.items || {})
	            .filter(([, record]) => record && typeof record === "object" && Boolean(record.pinned))
	            .map(([bundleId]) => String(bundleId || "").trim())
	            .filter(Boolean)
	        );

        const pinnedAtFor = (bundleId) => {
          const record = mergedAnnotations?.items?.[bundleId];
          return getPinnedTimestamp(record);
        };

	        const sortedAll = all
	          .slice()
	          .sort((a, b) => {
	            const aPinned = pinnedIds.has(String(a.id || ""));
	            const bPinned = pinnedIds.has(String(b.id || ""));
	            if (aPinned !== bPinned) return aPinned ? -1 : 1;
	            if (aPinned && bPinned) {
	              const pinnedDiff = pinnedAtFor(String(b.id || "")) - pinnedAtFor(String(a.id || ""));
	              if (pinnedDiff !== 0) return pinnedDiff;
	            }
	            return getBundleTimestamp(b) - getBundleTimestamp(a);
	          });

	        const keptBundles = sortedAll.slice(0, 50);
	        const droppedBundles = sortedAll.slice(50);

	        const keptPinnedIds = keptBundles
	          .filter((bundle) => pinnedIds.has(String(bundle?.id || "")))
	          .map((bundle) => String(bundle?.id || "").trim())
	          .filter(Boolean);

	        const droppedPinnedIds = droppedBundles
	          .filter((bundle) => pinnedIds.has(String(bundle?.id || "")))
	          .map((bundle) => String(bundle?.id || "").trim())
	          .filter(Boolean);

	        return {
	          bundles: keptBundles,
	          incomingValid,
	          adopted,
	          droppedBundleIds: droppedBundles.map((bundle) => String(bundle?.id || "").trim()).filter(Boolean),
	          totalPinnedBundles: keptPinnedIds.length + droppedPinnedIds.length,
	          keptPinnedBundleIds: keptPinnedIds,
	          droppedPinnedBundleIds: droppedPinnedIds,
	        };
	      };

      const countIncomingAnnotationItems = (incomingAnnotationItems) =>
        Object.entries(incomingAnnotationItems || {}).reduce((count, [bundleId, record]) => {
          const key = String(bundleId || "").trim();
          if (!key) return count;
          if (!record || typeof record !== "object") return count;
          return count + 1;
        }, 0);

      const mergeAnnotationItems = (existingItems, incomingItems) => {
        let incomingAnnotationCount = 0;
        let adoptedAnnotations = 0;
        const mergedAnnotationItems = { ...(existingItems || {}) };
        for (const [bundleId, record] of Object.entries(incomingItems || {})) {
          const key = String(bundleId || "").trim();
          if (!key) continue;
          if (!record || typeof record !== "object") continue;
          incomingAnnotationCount += 1;
          const current = mergedAnnotationItems[key];
          const merged = mergeAnnotationRecords(current, record);
          if (merged !== current) adoptedAnnotations += 1;
          mergedAnnotationItems[key] = merged;
        }
        return { mergedAnnotationItems, incomingAnnotationCount, adoptedAnnotations };
      };

      const normalizeIncomingBundles = (incomingBundles) => {
        const normalized = [];
        let validCount = 0;
        for (const incoming of incomingBundles || []) {
          const normalizedBundle = normalizeBundle(incoming, "imported-library");
          if (!normalizedBundle) continue;
          validCount += 1;
          normalized.push(normalizedBundle);
        }
        return { normalized, validCount };
      };

	      const sortBundlesWithPinnedFirstDetailed = (bundles, annotations) => {
	        const pinnedIds = new Set(
	          Object.entries(annotations?.items || {})
	            .filter(([, record]) => record && typeof record === "object" && Boolean(record.pinned))
	            .map(([bundleId]) => String(bundleId || "").trim())
	            .filter(Boolean)
	        );

        const pinnedAtFor = (bundleId) => {
          const record = annotations?.items?.[bundleId];
          return getPinnedTimestamp(record);
        };

	        const sortedAll = (bundles || [])
	          .slice()
	          .sort((a, b) => {
	            const aPinned = pinnedIds.has(String(a.id || ""));
	            const bPinned = pinnedIds.has(String(b.id || ""));
	            if (aPinned !== bPinned) return aPinned ? -1 : 1;
	            if (aPinned && bPinned) {
	              const pinnedDiff = pinnedAtFor(String(b.id || "")) - pinnedAtFor(String(a.id || ""));
	              if (pinnedDiff !== 0) return pinnedDiff;
	            }
	            return getBundleTimestamp(b) - getBundleTimestamp(a);
	          });

	        const keptBundles = sortedAll.slice(0, 50);
	        const droppedBundles = sortedAll.slice(50);

	        const keptPinnedIds = keptBundles
	          .filter((bundle) => pinnedIds.has(String(bundle?.id || "")))
	          .map((bundle) => String(bundle?.id || "").trim())
	          .filter(Boolean);

	        const droppedPinnedIds = droppedBundles
	          .filter((bundle) => pinnedIds.has(String(bundle?.id || "")))
	          .map((bundle) => String(bundle?.id || "").trim())
	          .filter(Boolean);

	        return {
	          keptBundles,
	          droppedBundleIds: droppedBundles.map((bundle) => String(bundle?.id || "").trim()).filter(Boolean),
	          totalPinnedBundles: keptPinnedIds.length + droppedPinnedIds.length,
	          keptPinnedBundleIds: keptPinnedIds,
	          droppedPinnedBundleIds: droppedPinnedIds,
	        };
	      };

	      const sortBundlesWithPinnedFirst = (bundles, annotations) => sortBundlesWithPinnedFirstDetailed(bundles, annotations).keptBundles;

	      const filterAnnotationItemsToBundles = (annotationItems, keptBundleIds) => {
	        const kept = new Set((keptBundleIds || []).map((id) => String(id || "").trim()).filter(Boolean));
	        const filtered = {};
	        for (const [bundleId, record] of Object.entries(annotationItems || {})) {
	          const key = String(bundleId || "").trim();
	          if (!key) continue;
	          if (!kept.has(key)) continue;
	          if (!record || typeof record !== "object") continue;
	          filtered[key] = record;
	        }
	        return filtered;
	      };

	      const summarizePreviewIds = (ids, max = 8) => {
	        const list = (ids || []).map((value) => String(value || "").trim()).filter(Boolean);
	        if (list.length === 0) return "";
	        const shown = list.slice(0, max);
	        const remaining = list.length - shown.length;
	        return remaining > 0 ? `${shown.join(", ")} +${remaining} more` : shown.join(", ");
	      };

		      const formatLibraryPreview = (preview) => {
	        const incomingBundleLabel = preview.incomingBundles === 1 ? "bundle" : "bundles";
	        const incomingAnnotationLabel = preview.incomingAnnotations === 1 ? "annotation record" : "annotation records";
	        const adoptedBundleLabel = preview.mergeAdoptedBundles === 1 ? "bundle" : "bundles";
	        const adoptedAnnotationLabel = preview.mergeAdoptedAnnotations === 1 ? "annotation record" : "annotation records";
	        const mergeDropText =
	          preview.mergeDroppedBundles > 0
	            ? ` Merge drops ${preview.mergeDroppedBundles} bundle${preview.mergeDroppedBundles === 1 ? "" : "s"} (cap 50); ${preview.mergeDroppedAnnotations} annotation record${
	                preview.mergeDroppedAnnotations === 1 ? "" : "s"
	              }.`
	            : "";
	        const replaceDropText =
	          preview.replaceDroppedBundles > 0
	            ? ` Replace drops ${preview.replaceDroppedBundles} bundle${preview.replaceDroppedBundles === 1 ? "" : "s"} (cap 50); ${preview.replaceDroppedAnnotations} annotation record${
	                preview.replaceDroppedAnnotations === 1 ? "" : "s"
	              }.`
	            : "";
	        const mergePinnedText =
	          preview.mergePinnedTotal > 0
	            ? ` Merge keeps ${preview.mergePinnedKept}/${preview.mergePinnedTotal} pinned bundle${preview.mergePinnedTotal === 1 ? "" : "s"}.`
	            : "";
	        const replacePinnedText =
	          preview.replacePinnedTotal > 0
	            ? ` Replace keeps ${preview.replacePinnedKept}/${preview.replacePinnedTotal} pinned bundle${preview.replacePinnedTotal === 1 ? "" : "s"}.`
	            : "";
	        const mergeDropIds = preview.mergeDroppedBundleIds?.length ? ` Merge dropped ids: ${summarizePreviewIds(preview.mergeDroppedBundleIds)}.` : "";
	        const mergeDropPinnedIds = preview.mergeDroppedPinnedBundleIds?.length
	          ? ` Merge dropped pinned ids: ${summarizePreviewIds(preview.mergeDroppedPinnedBundleIds)}.`
	          : "";
	        const replaceDropIds = preview.replaceDroppedBundleIds?.length
	          ? ` Replace dropped ids: ${summarizePreviewIds(preview.replaceDroppedBundleIds)}.`
	          : "";
	        const replaceDropPinnedIds = preview.replaceDroppedPinnedBundleIds?.length
	          ? ` Replace dropped pinned ids: ${summarizePreviewIds(preview.replaceDroppedPinnedBundleIds)}.`
	          : "";
	        return (
		          `Preview (cap 50): ${preview.incomingBundles} incoming ${incomingBundleLabel}, ${preview.incomingAnnotations} incoming ${incomingAnnotationLabel}. ` +
	          `Merge would adopt ${preview.mergeAdoptedBundles} ${adoptedBundleLabel} + ${preview.mergeAdoptedAnnotations} ${adoptedAnnotationLabel} (store ${preview.mergeStoredBundles} bundle${preview.mergeStoredBundles === 1 ? "" : "s"} + ${preview.mergeStoredAnnotations} annotation record${
	            preview.mergeStoredAnnotations === 1 ? "" : "s"
	          }). ` +
	          `Replace would store ${preview.replaceStoredBundles} bundle${preview.replaceStoredBundles === 1 ? "" : "s"} + ${preview.replaceStoredAnnotations} annotation record${
	            preview.replaceStoredAnnotations === 1 ? "" : "s"
	          }.${mergeDropText}${replaceDropText}${mergePinnedText}${replacePinnedText}${mergeDropIds}${mergeDropPinnedIds}${replaceDropIds}${replaceDropPinnedIds}`
	        );
	      };

      importFileInput.addEventListener("change", async () => {
        const file = importFileInput.files && importFileInput.files[0] ? importFileInput.files[0] : null;
        if (!file) return;
        try {
          const textValue = await file.text();
          const parsed = JSON.parse(textValue);
          if (!parsed || typeof parsed !== "object" || parsed.format !== BUNDLE_LIBRARY_ARCHIVE_FORMAT) {
            if (transferStatus) {
              transferStatus.textContent = `Import failed: expected ${BUNDLE_LIBRARY_ARCHIVE_FORMAT} bundle-library export JSON.`;
            }
            clearPendingLibraryImport();
            return;
          }

          const incomingBundles = Array.isArray(parsed.bundles) ? parsed.bundles : [];
          const incomingAnnotationsRaw = parsed.annotations && typeof parsed.annotations === "object" ? parsed.annotations : null;
          const incomingAnnotationItems =
            incomingAnnotationsRaw &&
            incomingAnnotationsRaw.format === BUNDLE_LIBRARY_ANNOTATIONS_FORMAT &&
            incomingAnnotationsRaw.items &&
            typeof incomingAnnotationsRaw.items === "object"
              ? incomingAnnotationsRaw.items
              : {};

          const existingAnnotations = loadBundleLibraryAnnotations();
          const existingBundles = loadAllExportBundles();

	          const mergedAnnotationsResult = mergeAnnotationItems(existingAnnotations.items || {}, incomingAnnotationItems);
	          const mergedAnnotations = { format: BUNDLE_LIBRARY_ANNOTATIONS_FORMAT, items: mergedAnnotationsResult.mergedAnnotationItems };
	          const mergedBundlesResult = mergeBundles(existingBundles, incomingBundles, mergedAnnotations);

	          const incomingAnnotationCount = countIncomingAnnotationItems(incomingAnnotationItems);
	          const incomingBundlesResult = normalizeIncomingBundles(incomingBundles);
	          const replaceSortDetail = sortBundlesWithPinnedFirstDetailed(incomingBundlesResult.normalized, {
	            format: BUNDLE_LIBRARY_ANNOTATIONS_FORMAT,
	            items: incomingAnnotationItems,
	          });
	          const normalizedReplaceBundles = replaceSortDetail.keptBundles;

	          const mergedKeptBundleIds = mergedBundlesResult.bundles.map((bundle) => String(bundle?.id || "").trim()).filter(Boolean);
	          const replaceKeptBundleIds = normalizedReplaceBundles.map((bundle) => String(bundle?.id || "").trim()).filter(Boolean);

	          const mergedFilteredAnnotationItems = filterAnnotationItemsToBundles(
	            mergedAnnotationsResult.mergedAnnotationItems,
	            mergedKeptBundleIds
	          );
	          const replaceFilteredAnnotationItems = filterAnnotationItemsToBundles(incomingAnnotationItems, replaceKeptBundleIds);

	          const mergedStoredAnnotationCount = Object.keys(mergedFilteredAnnotationItems).length;
	          const replaceStoredAnnotationCount = Object.keys(replaceFilteredAnnotationItems).length;

	          const mergeDroppedAnnotationIds = Object.keys(mergedAnnotationsResult.mergedAnnotationItems || {}).filter(
	            (bundleId) => !mergedKeptBundleIds.includes(String(bundleId || "").trim())
	          );
	          const replaceDroppedAnnotationIds = Object.keys(incomingAnnotationItems || {}).filter(
	            (bundleId) => !replaceKeptBundleIds.includes(String(bundleId || "").trim())
	          );

	          pendingLibraryImport = {
	            filename: file.name || "bundle library import",
              existing: {
                bundles: loadAllExportBundles().length,
                annotations: Object.keys(loadBundleLibraryAnnotations().items || {}).length,
              },
	            incomingBundles,
	            incomingAnnotationItems,
	            mergedAnnotations: { format: BUNDLE_LIBRARY_ANNOTATIONS_FORMAT, items: mergedFilteredAnnotationItems },
	            mergedBundlesResult,
	            mergedAnnotationsResult,
	            replaceBundles: normalizedReplaceBundles,
	            replaceAnnotations: {
	              format: BUNDLE_LIBRARY_ANNOTATIONS_FORMAT,
	              items: replaceFilteredAnnotationItems || {},
	            },
	            preview: {
	              incomingBundles: incomingBundlesResult.validCount,
	              incomingAnnotations: incomingAnnotationCount,
	              mergeAdoptedBundles: mergedBundlesResult.adopted,
	              mergeStoredBundles: mergedBundlesResult.bundles.length,
	              mergeAdoptedAnnotations: mergedAnnotationsResult.adoptedAnnotations,
	              replaceStoredBundles: normalizedReplaceBundles.length,
	              replaceStoredAnnotations: replaceStoredAnnotationCount,
	              mergeStoredAnnotations: mergedStoredAnnotationCount,
	              mergeDroppedBundles: mergedBundlesResult.droppedBundleIds?.length || 0,
	              replaceDroppedBundles: replaceSortDetail.droppedBundleIds?.length || 0,
	              mergeDroppedAnnotations: mergeDroppedAnnotationIds.length,
	              replaceDroppedAnnotations: replaceDroppedAnnotationIds.length,
	              mergePinnedTotal: mergedBundlesResult.totalPinnedBundles || 0,
	              mergePinnedKept: mergedBundlesResult.keptPinnedBundleIds?.length || 0,
	              replacePinnedTotal: replaceSortDetail.totalPinnedBundles || 0,
	              replacePinnedKept: replaceSortDetail.keptPinnedBundleIds?.length || 0,
	              mergeDroppedBundleIds: mergedBundlesResult.droppedBundleIds || [],
	              replaceDroppedBundleIds: replaceSortDetail.droppedBundleIds || [],
                mergeDroppedAnnotationIds: mergeDroppedAnnotationIds || [],
                replaceDroppedAnnotationIds: replaceDroppedAnnotationIds || [],
	              mergeDroppedPinnedBundleIds: mergedBundlesResult.droppedPinnedBundleIds || [],
	              replaceDroppedPinnedBundleIds: replaceSortDetail.droppedPinnedBundleIds || [],
	            },
	          };

          if (transferStatus) transferStatus.textContent = formatLibraryPreview(pendingLibraryImport.preview);
          showPendingLibraryImport();
        } catch (error) {
          if (transferStatus) {
            transferStatus.textContent = `Import failed: ${error instanceof Error ? error.message : "Unable to parse JSON."}`;
          }
          clearPendingLibraryImport();
        }
      });
    }

    if (importDownloadPreview instanceof HTMLButtonElement) {
      importDownloadPreview.addEventListener("click", () => {
        if (!pendingLibraryImport) return;
        const now = new Date();
        const payload = {
          format: BUNDLE_LIBRARY_IMPORT_PREVIEW_FORMAT,
          exportedAt: now.toISOString(),
          localOnly: true,
          source: "admin-bundle-library-import",
          filename: pendingLibraryImport.filename || "bundle library import",
          existing: pendingLibraryImport.existing || null,
          preview: pendingLibraryImport.preview || null,
        };
        const base = safeFilename(pendingLibraryImport.filename || "bundle-library-import-preview") || "bundle-library-import-preview";
        const filename = `proofresume-bundle-library-import-preview-${base}-${formatFileTimestamp(now)}.json`;
        const downloaded = downloadJsonFile(payload, filename);
        if (transferStatus) {
          transferStatus.textContent = downloaded
            ? `Downloaded import preview (${pendingLibraryImport.preview?.incomingBundles ?? 0} incoming bundle${pendingLibraryImport.preview?.incomingBundles === 1 ? "" : "s"}).`
            : "Export failed: download did not start in this browser environment.";
        }
      });
    }

    if (
      importMerge instanceof HTMLButtonElement &&
      importReplace instanceof HTMLButtonElement &&
      importCancel instanceof HTMLButtonElement
    ) {
      importCancel.addEventListener("click", () => {
        if (transferStatus) transferStatus.textContent = "Import canceled (no changes made).";
        clearPendingLibraryImport();
      });

      importMerge.addEventListener("click", () => {
        if (!pendingLibraryImport) return;
        saveBundleLibraryAnnotations(pendingLibraryImport.mergedAnnotations);
        saveAllExportBundles(pendingLibraryImport.mergedBundlesResult.bundles);
        if (transferStatus) {
          transferStatus.textContent = `Merged ${pendingLibraryImport.preview.incomingBundles} incoming bundle${
            pendingLibraryImport.preview.incomingBundles === 1 ? "" : "s"
          }; adopted ${pendingLibraryImport.preview.mergeAdoptedBundles}. Merged ${pendingLibraryImport.preview.incomingAnnotations} annotation record${
            pendingLibraryImport.preview.incomingAnnotations === 1 ? "" : "s"
          }; adopted ${pendingLibraryImport.preview.mergeAdoptedAnnotations}. Stored ${pendingLibraryImport.preview.mergeStoredBundles} bundle${
            pendingLibraryImport.preview.mergeStoredBundles === 1 ? "" : "s"
          } total.`;
        }
        clearPendingLibraryImport();
        renderBundleLibrary();
      });

      importReplace.addEventListener("click", () => {
        if (!pendingLibraryImport) return;
        const confirmed = window.confirm(
          `Replace this browser's bundle library?\n\n` +
            `This will overwrite stored bundles and bundle annotations.\n\n` +
            `${pendingLibraryImport.preview.replaceStoredBundles} bundle${pendingLibraryImport.preview.replaceStoredBundles === 1 ? "" : "s"} ` +
            `and ${pendingLibraryImport.preview.replaceStoredAnnotations} annotation record${
              pendingLibraryImport.preview.replaceStoredAnnotations === 1 ? "" : "s"
            } will be stored (bundles capped at 50).`
        );
        if (!confirmed) return;
        saveBundleLibraryAnnotations(pendingLibraryImport.replaceAnnotations);
        saveAllExportBundles(pendingLibraryImport.replaceBundles);
        if (transferStatus) {
          transferStatus.textContent = `Imported ${pendingLibraryImport.preview.replaceStoredBundles} bundle${
            pendingLibraryImport.preview.replaceStoredBundles === 1 ? "" : "s"
          } and ${pendingLibraryImport.preview.replaceStoredAnnotations} annotation record${
            pendingLibraryImport.preview.replaceStoredAnnotations === 1 ? "" : "s"
          } (replaced existing library).`;
        }
        clearPendingLibraryImport();
        renderBundleLibrary();
      });
    }

    state.bundleLibraryTransferBound = true;
  }

  if (!state.bundleAnnotationTransferBound) {
    const transferStatus = document.querySelector("[data-pr='bundleAnnotationsTransferStatus']");
    const exportButton = document.querySelector("button[data-pr='exportBundleAnnotations']");
    const importButton = document.querySelector("button[data-pr='importBundleAnnotations']");
    const importFileInput = document.querySelector("input[data-pr='importBundleAnnotationsFile']");

    if (exportButton instanceof HTMLButtonElement) {
      exportButton.addEventListener("click", () => {
        if (transferStatus) transferStatus.textContent = "";
        const annotations = loadBundleLibraryAnnotations();
        const itemCount = Object.keys(annotations.items || {}).length;
        if (!itemCount) {
          if (transferStatus) transferStatus.textContent = "No local bundle annotations found to export yet.";
          return;
        }
        const now = new Date();
        const payload = {
          format: BUNDLE_LIBRARY_ANNOTATIONS_FORMAT,
          exportedAt: now.toISOString(),
          items: annotations.items || {},
        };
        const filename = `proofresume-bundle-library-annotations-${formatFileTimestamp(now)}.json`;
        const downloaded = downloadJsonFile(payload, filename);
        if (transferStatus) {
          transferStatus.textContent = downloaded
            ? `Downloaded ${itemCount} bundle annotation record${itemCount === 1 ? "" : "s"}.`
            : "Export failed: download did not start in this browser environment.";
        }
      });
    }

    if (importButton instanceof HTMLButtonElement && importFileInput instanceof HTMLInputElement) {
      importButton.addEventListener("click", () => {
        if (transferStatus) transferStatus.textContent = "";
        importFileInput.value = "";
        importFileInput.click();
      });

      importFileInput.addEventListener("change", async () => {
        const file = importFileInput.files && importFileInput.files[0] ? importFileInput.files[0] : null;
        if (!file) return;
        try {
          const textValue = await file.text();
          const parsed = JSON.parse(textValue);
          if (!parsed || typeof parsed !== "object" || parsed.format !== BUNDLE_LIBRARY_ANNOTATIONS_FORMAT) {
            if (transferStatus) {
              transferStatus.textContent = `Import failed: expected ${BUNDLE_LIBRARY_ANNOTATIONS_FORMAT} JSON.`;
            }
            return;
          }
          const incomingItems = parsed.items && typeof parsed.items === "object" ? parsed.items : null;
          if (!incomingItems) {
            if (transferStatus) transferStatus.textContent = "Import failed: missing items object.";
            return;
          }
          const incomingCount = Object.keys(incomingItems).length;
          const existing = loadBundleLibraryAnnotations();
          const existingCount = Object.keys(existing.items || {}).length;
          const replace = window.confirm(
            `Import ${incomingCount} bundle annotation record${incomingCount === 1 ? "" : "s"}? OK replaces this browser's existing ${existingCount} record${
              existingCount === 1 ? "" : "s"
            }. Cancel merges and keeps the newest updatedAt per bundle.`
          );

          const now = new Date().toISOString();
          if (replace) {
            saveBundleLibraryAnnotations({ format: BUNDLE_LIBRARY_ANNOTATIONS_FORMAT, importedAt: now, items: incomingItems });
            if (transferStatus) transferStatus.textContent = `Imported ${incomingCount} record${incomingCount === 1 ? "" : "s"} (replaced existing).`;
            renderBundleLibrary();
            return;
          }

          const mergedItems = { ...(existing.items || {}) };
          let adopted = 0;
          Object.entries(incomingItems).forEach(([bundleId, record]) => {
            if (!bundleId) return;
            const current = mergedItems[bundleId];
            const merged = mergeAnnotationRecords(current, record);
            if (merged !== current) adopted += 1;
            mergedItems[bundleId] = merged;
          });

          saveBundleLibraryAnnotations({ format: BUNDLE_LIBRARY_ANNOTATIONS_FORMAT, importedAt: now, items: mergedItems });
          const mergedCount = Object.keys(mergedItems).length;
          if (transferStatus) {
            transferStatus.textContent = `Merged ${incomingCount} incoming record${incomingCount === 1 ? "" : "s"}; adopted ${adopted}. Total now ${mergedCount}.`;
          }
          renderBundleLibrary();
        } catch (error) {
          if (transferStatus) {
            transferStatus.textContent = `Import failed: ${error instanceof Error ? error.message : "Unable to parse JSON."}`;
          }
        }
      });
    }

    state.bundleAnnotationTransferBound = true;
  }

  if (!state.bundleImportBound) {
    const importStatus = document.querySelector("[data-pr='importExportBundleStatus']");
    const importButton = document.querySelector("button[data-pr='importExportBundle']");
    const fileInput = document.querySelector("input[data-pr='importExportBundleFile']");

    if (importButton instanceof HTMLButtonElement && fileInput instanceof HTMLInputElement) {
      importButton.addEventListener("click", () => {
        if (importStatus) importStatus.textContent = "";
        fileInput.value = "";
        fileInput.click();
      });

      fileInput.addEventListener("change", async () => {
        const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        if (!file) return;
        try {
          const textValue = await file.text();
          const parsed = JSON.parse(textValue);
          if (!parsed || typeof parsed !== "object" || parsed.format !== "proofresume-local-section-v1") {
            if (importStatus) {
              importStatus.textContent =
                "Import failed: expected a ProofResume export snapshot bundle JSON (format proofresume-local-section-v1).";
            }
            return;
          }
          const nextId = saveExportBundleSnapshot(parsed);
          if (!nextId) {
            if (importStatus) importStatus.textContent = "Import failed: unable to store bundle snapshot locally.";
            return;
          }
          if (importStatus) importStatus.textContent = `Imported bundle ${nextId}.`;
          renderBundleLibrary();
        } catch (error) {
          if (importStatus) {
            importStatus.textContent = `Import failed: ${error instanceof Error ? error.message : "Unable to parse JSON."}`;
          }
        }
      });

      state.bundleImportBound = true;
    }
  }

  const bundles = loadAllExportBundles();
  if (total) total.textContent = `${bundles.length} imported`;
  if (summary) {
    summary.innerHTML = `Lists locally imported export bundles stored in <code>localStorage</code> under <code>${escapeHtml(
      EXPORT_BUNDLES_STORAGE_KEY
    )}</code>. Replay links open read-only pages; copy and download stay local to this browser; delete removes the browser-local entry only.`;
  }

  const searchInput = document.querySelector("input[data-pr='bundleLibrarySearch']");
  const sourceSelect = document.querySelector("select[data-pr='bundleLibrarySourceFilter']");
  const recencySelect = document.querySelector("select[data-pr='bundleLibraryRecencyFilter']");
  const clearButton = document.querySelector("button[data-pr='bundleLibraryClearFilters']");

  if (!state.bundleLibraryFilters) {
    state.bundleLibraryFilters = loadBundleLibraryFilters();
  }

  if (!state.bundleFiltersBound) {
    if (searchInput instanceof HTMLInputElement) searchInput.value = state.bundleLibraryFilters.query || "";
    if (sourceSelect instanceof HTMLSelectElement) sourceSelect.value = state.bundleLibraryFilters.source || "all";
    if (recencySelect instanceof HTMLSelectElement) recencySelect.value = state.bundleLibraryFilters.recency || "any";

    const updateFilters = (next) => {
      state.bundleLibraryFilters = next;
      saveBundleLibraryFilters(next);
      renderBundleLibrary();
    };

    if (searchInput instanceof HTMLInputElement) {
      searchInput.addEventListener("input", () =>
        updateFilters({
          ...state.bundleLibraryFilters,
          query: searchInput.value || "",
        })
      );
    }

    if (sourceSelect instanceof HTMLSelectElement) {
      sourceSelect.addEventListener("change", () =>
        updateFilters({
          ...state.bundleLibraryFilters,
          source: sourceSelect.value || "all",
        })
      );
    }

    if (recencySelect instanceof HTMLSelectElement) {
      recencySelect.addEventListener("change", () =>
        updateFilters({
          ...state.bundleLibraryFilters,
          recency: recencySelect.value || "any",
        })
      );
    }

    if (clearButton instanceof HTMLButtonElement) {
      clearButton.addEventListener("click", () => updateFilters({ query: "", source: "all", recency: "any" }));
    }

    state.bundleFiltersBound = true;
  }

  if (sourceSelect instanceof HTMLSelectElement) {
    const sources = Array.from(
      new Set(
        bundles
          .map((bundle) => String(bundle?.source || "").trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))
      )
    );

    const selected = state.bundleLibraryFilters.source || "all";
    sourceSelect.innerHTML = [`<option value="all">All sources</option>`, ...sources.map((source) => `<option value="${escapeHtml(source)}">${escapeHtml(source)}</option>`)].join(
      ""
    );
    sourceSelect.value = sources.includes(selected) ? selected : "all";
    if (selected !== sourceSelect.value) {
      state.bundleLibraryFilters = { ...state.bundleLibraryFilters, source: sourceSelect.value };
      saveBundleLibraryFilters(state.bundleLibraryFilters);
    }
  }

  if (recencySelect instanceof HTMLSelectElement) {
    recencySelect.value = state.bundleLibraryFilters.recency || "any";
  }

  if (searchInput instanceof HTMLInputElement && searchInput.value !== (state.bundleLibraryFilters.query || "")) {
    searchInput.value = state.bundleLibraryFilters.query || "";
  }

  const filters = state.bundleLibraryFilters || { query: "", source: "all", recency: "any" };
  const activeQuery = String(filters.query || "").trim().toLowerCase();
  const activeSource = String(filters.source || "all");
  const recencyThreshold = recencyToThreshold(filters.recency);
  const hasActiveFilters = Boolean(activeQuery) || activeSource !== "all" || Boolean(recencyThreshold);

  const filteredBundles = bundles.filter((bundle) => {
    if (!bundle || typeof bundle !== "object") return false;
    const id = String(bundle.id || "");
    const source = String(bundle.source || "");
    const format = String(bundle.format || bundle?.snapshot?.format || "");
    const annotation = id ? getBundleLibraryAnnotation(id) : null;
    const notes = annotation?.notes || "";
    const tags = annotation?.tags ? annotation.tags.join(" ") : "";

    if (activeSource !== "all" && source !== activeSource) return false;
    if (recencyThreshold && getBundleTimestamp(bundle) < recencyThreshold) return false;

    if (activeQuery) {
      const haystack = `${id} ${source} ${format} ${notes} ${tags}`.toLowerCase();
      if (!haystack.includes(activeQuery)) return false;
    }
    return true;
  });

  if (matchCount) {
    matchCount.textContent = hasActiveFilters ? `${filteredBundles.length} / ${bundles.length} shown` : `Showing ${bundles.length}`;
  }

  if (!bundles.length) {
    list.innerHTML = `<article class="empty-card">No imported bundles found. Use “Import bundle .json”, then return here to replay or delete.</article>`;
    return;
  }

  const sorted = filteredBundles
    .slice()
    .sort((a, b) => {
      const aId = String(a?.id || "");
      const bId = String(b?.id || "");
      const aAnnotation = aId ? getBundleLibraryAnnotation(aId) : null;
      const bAnnotation = bId ? getBundleLibraryAnnotation(bId) : null;
      const aPinned = Boolean(aAnnotation?.pinned);
      const bPinned = Boolean(bAnnotation?.pinned);
      if (aPinned !== bPinned) return aPinned ? -1 : 1;
      if (aPinned && bPinned) {
        const pinnedDiff = getPinnedTimestamp(bAnnotation) - getPinnedTimestamp(aAnnotation);
        if (pinnedDiff !== 0) return pinnedDiff;
      }
      return String(b?.updatedAt || b?.importedAt || "").localeCompare(String(a?.updatedAt || a?.importedAt || ""));
    });

  if (!sorted.length) {
    list.innerHTML = hasActiveFilters
      ? `<article class="empty-card">No bundles match these filters. Use “Clear” to show all stored bundles.</article>`
      : `<article class="empty-card">No imported bundles found. Use “Import bundle .json”, then return here to replay or delete.</article>`;
    return;
  }

  list.innerHTML = sorted
    .map((bundle) => {
      const id = String(bundle?.id || "").trim();
      const importedAt = bundle?.importedAt || null;
      const updatedAt = bundle?.updatedAt || null;
      const format = bundle?.format || bundle?.snapshot?.format || "unknown";
      const source = bundle?.source || "unknown";
      const annotation = id ? getBundleLibraryAnnotation(id) : null;
      const notes = annotation?.notes || "";
      const tagsValue = annotation?.tags?.length ? annotation.tags.join(", ") : "";
      const noteUpdatedAt = annotation?.updatedAt ? formatDate(annotation.updatedAt) : "";
      const pinned = Boolean(annotation?.pinned);
      const snapshotSummary = summarizeExportSnapshot(bundle?.snapshot);
      const snapshotMeta = snapshotSummary
        ? `Snapshot: ${snapshotSummary.sectionCount} sections, ${snapshotSummary.evidenceApprovedCount} evidence approved, ${snapshotSummary.candidateAcceptedCount} accepted candidates`
        : "Snapshot: unavailable";
      return `
        <article class="bundle-card" data-bundle-id="${escapeHtml(id)}">
          <div class="bundle-head">
            <div>
              <span class="eyebrow">Imported bundle</span>
              <strong>${escapeHtml(id || "(missing id)")}</strong>
            </div>
            <span class="status-pill ${id ? "complete" : "needs_attention"}">${id ? (pinned ? "pinned" : "stored") : "invalid"}</span>
          </div>
          <div class="bundle-meta">
            <div><strong>Imported:</strong> ${escapeHtml(formatDate(importedAt))}</div>
            <div><strong>Updated:</strong> ${escapeHtml(formatDate(updatedAt))}</div>
            <div><strong>Format:</strong> ${escapeHtml(format)}</div>
            <div><strong>Source:</strong> ${escapeHtml(source)}</div>
            <div><strong>Summary:</strong> ${escapeHtml(snapshotMeta)}</div>
          </div>
          <div class="bundle-annotations" aria-label="Bundle notes and tags">
            <label class="bundle-annotation-field">
              <span>Tags (local)</span>
              <input type="text" autocomplete="off" placeholder="Comma-separated tags (e.g., pm, swe, google)" value="${escapeHtml(
                tagsValue
              )}" data-bundle-tags="${escapeHtml(id)}" />
            </label>
            <label class="bundle-annotation-field">
              <span>Operator notes (local)</span>
              <textarea rows="2" placeholder="Notes visible only in this browser (searchable). Leave blank if none." data-bundle-notes="${escapeHtml(
                id
              )}">${escapeHtml(notes)}</textarea>
            </label>
            <span class="micro-note bundle-annotation-status" data-bundle-annotation-status="${escapeHtml(id)}">${
              noteUpdatedAt ? `Last note update: ${escapeHtml(noteUpdatedAt)}` : "Notes and tags stay local to this browser."
            }</span>
          </div>
          <div class="bundle-actions">
            <a class="secondary-action" href="/review.html?bundle=${encodeURIComponent(id)}">Open review replay</a>
            <a class="secondary-action" href="/proof-packet.html?bundle=${encodeURIComponent(id)}">Open proof packet replay</a>
            <button type="button" class="secondary-action" data-bundle-pin="${escapeHtml(id)}">${pinned ? "Unpin" : "Pin"}</button>
            <button type="button" class="secondary-action" data-bundle-copy-id="${escapeHtml(id)}">Copy bundle id</button>
            <button type="button" class="secondary-action" data-bundle-download="${escapeHtml(id)}">Download bundle .json</button>
            <button type="button" class="secondary-action is-danger" data-bundle-delete="${escapeHtml(id)}">Delete</button>
          </div>
        </article>
      `;
    })
    .join("");

  if (!state.bundleLibraryBound) {
    list.addEventListener("blur", (event) => {
      const tagsInput = event.target.closest("input[data-bundle-tags]");
      if (tagsInput && tagsInput instanceof HTMLInputElement) {
        const bundleId = String(tagsInput.dataset.bundleTags || "");
        if (!bundleId) return;
        upsertBundleLibraryAnnotation(bundleId, { tags: tagsInput.value || "" });
        renderBundleLibrary();
        return;
      }

      const notesArea = event.target.closest("textarea[data-bundle-notes]");
      if (notesArea && notesArea instanceof HTMLTextAreaElement) {
        const bundleId = String(notesArea.dataset.bundleNotes || "");
        if (!bundleId) return;
        upsertBundleLibraryAnnotation(bundleId, { notes: notesArea.value || "" });
        renderBundleLibrary();
      }
    }, true);

    list.addEventListener("input", (event) => {
      const tagsInput = event.target.closest("input[data-bundle-tags]");
      if (tagsInput && tagsInput instanceof HTMLInputElement) {
        const bundleId = String(tagsInput.dataset.bundleTags || "");
        if (!bundleId) return;
        upsertBundleLibraryAnnotation(bundleId, { tags: tagsInput.value || "" });
        const status = list.querySelector(`[data-bundle-annotation-status='${CSS.escape(bundleId)}']`);
        if (status) status.textContent = "Saved locally. (Filter/search updates on blur.)";
        return;
      }

      const notesArea = event.target.closest("textarea[data-bundle-notes]");
      if (notesArea && notesArea instanceof HTMLTextAreaElement) {
        const bundleId = String(notesArea.dataset.bundleNotes || "");
        if (!bundleId) return;
        upsertBundleLibraryAnnotation(bundleId, { notes: notesArea.value || "" });
        const status = list.querySelector(`[data-bundle-annotation-status='${CSS.escape(bundleId)}']`);
        if (status) status.textContent = "Saved locally. (Filter/search updates on blur.)";
      }
    });

    list.addEventListener("click", (event) => {
      const deleteButton = event.target.closest("button[data-bundle-delete]");
      if (deleteButton) {
        const id = String(deleteButton.dataset.bundleDelete || "");
        if (!id) return;
        const confirmed = window.confirm(`Delete bundle ${id}? This only removes the localStorage entry.`);
        if (!confirmed) return;
        const removed = deleteExportBundleById(id);
        if (!removed) {
          window.alert("Bundle not found in localStorage.");
          return;
        }
        renderBundleLibrary();
        return;
      }

      const copyButton = event.target.closest("button[data-bundle-copy-id]");
      if (copyButton) {
        const id = String(copyButton.dataset.bundleCopyId || "");
        if (!id) return;
        copyToClipboard(id).then((succeeded) => {
          if (succeeded) return;
          window.alert("Clipboard copy failed in this browser environment.");
        });
        return;
      }

      const pinButton = event.target.closest("button[data-bundle-pin]");
      if (pinButton) {
        const id = String(pinButton.dataset.bundlePin || "");
        if (!id) return;
        const current = getBundleLibraryAnnotation(id) || { pinned: false };
        const updated = upsertBundleLibraryAnnotation(id, { pinned: !current.pinned });
        const status = list.querySelector(`[data-bundle-annotation-status='${CSS.escape(id)}']`);
        if (status) {
          status.textContent = updated?.pinned ? "Pinned locally." : "Unpinned locally.";
        }
        renderBundleLibrary();
        return;
      }

      const downloadButton = event.target.closest("button[data-bundle-download]");
      if (downloadButton) {
        const id = String(downloadButton.dataset.bundleDownload || "");
        if (!id) return;
        const bundle = loadExportBundleById(id);
        if (!bundle) {
          window.alert("Bundle snapshot not found or invalid format.");
          return;
        }
        const filename = `proofresume-export-bundle-${safeFilename(bundle.id || "bundle") || "bundle"}.json`;
        const downloaded = downloadJsonFile(bundle.snapshot, filename);
        if (!downloaded) {
          window.alert("Download failed in this browser environment.");
        }
      }
    });
    state.bundleLibraryBound = true;
  }
}

function renderPasses(passes) {
  const list = document.querySelector("#pass-list");
  if (!list) return;
  list.innerHTML = passes
    .map(
      (pass) => `
        <article class="pass-card">
          <div>
            <div class="pass-meta">${pass.agent} | ${formatDate(pass.startedAt)} -> ${formatDate(pass.finishedAt)}</div>
            <h3>${pass.prompt}</h3>
            <p>${pass.summary}</p>
            <p><strong>Validation:</strong> ${(pass.validation || []).join(", ") || "Pending"}</p>
            ${pass.report ? `<p><strong>Report:</strong> ${pass.report}</p>` : ""}
          </div>
          <span class="status-pill ${pass.status}">${pass.status.replace("_", " ")}</span>
        </article>
      `
    )
    .join("");
}

function renderNextActions(actions) {
  const list = document.querySelector("#next-action-list");
  if (!list) return;
  if (!actions.length) {
    list.innerHTML = `<article class="empty-card">No explicit next actions found in sprint or backlog docs.</article>`;
    return;
  }

  list.innerHTML = actions
    .map(
      (action) => `
        <article class="action-card">
          <span>${escapeHtml(action.source)} | ${escapeHtml(action.section)}</span>
          <strong>${escapeHtml(action.text)}</strong>
          <code>${escapeHtml(action.path)}</code>
        </article>
      `
    )
    .join("");
}

function priorityClass(priority) {
  return `priority-${String(priority || "unprioritized").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function renderQueueItem(item) {
  const staleMatches = item.staleMatches || [];
  return `
    <li class="${staleMatches.length ? "is-stale" : ""}">
      <span class="priority-chip ${priorityClass(item.priority)}">${escapeHtml(item.priority)}</span>
      <strong>${escapeHtml(item.owner)}</strong>
      <p>${escapeHtml(item.task)}</p>
      ${
        staleMatches.length
          ? `<div class="stale-match">
              <span>Possible stale active item</span>
              ${staleMatches
                .map(
                  (match) => `
                    <p>${escapeHtml(match.title)}</p>
                    <code>${escapeHtml(match.report)}</code>
                    <small>${escapeHtml(match.passStatus)} | ${escapeHtml(match.reportStatus)} | markers: ${escapeHtml((match.sharedMarkers || []).join(", "))}</small>
                  `
                )
                .join("")}
            </div>`
          : ""
      }
    </li>
  `;
}

function renderQueueGroup(title, groups) {
  const cards = (groups || [])
    .map(
      (group) => `
        <article class="queue-group-card">
          <div class="queue-group-head">
            <strong>${escapeHtml(group.name)}</strong>
            <span>${escapeHtml(group.count)} item${group.count === 1 ? "" : "s"}</span>
          </div>
          <div class="queue-priorities">
            ${Object.entries(group.priorities || {})
              .map(([priority, count]) => `<span class="priority-chip ${priorityClass(priority)}">${escapeHtml(priority)} x${escapeHtml(count)}</span>`)
              .join("")}
          </div>
          <ul>${(group.items || []).map(renderQueueItem).join("")}</ul>
        </article>
      `
    )
    .join("");

  return `
    <section class="queue-column">
      <h3>${escapeHtml(title)}</h3>
      ${cards || `<article class="empty-card">No active backlog items found.</article>`}
    </section>
  `;
}

function renderBacklogQueue(queue) {
  const total = queue?.items?.length || 0;
  text("#active-queue-total", `${total} active`);
  text("#queue-source", queue?.path ? `Generated from ${queue.path}` : "No active queue source found.");

  const groups = document.querySelector("#queue-groups");
  if (!groups) return;
  groups.innerHTML = [
    renderQueueGroup("Lane owner", queue?.byOwner || []),
    renderQueueGroup("Priority", queue?.byPriority || []),
    renderQueueGroup("Validation command", queue?.byValidationCommand || []),
  ].join("");
}

function renderLaunchRoomList(items, renderItem) {
  return `<ul class="launch-room-list">${(items || []).map(renderItem).join("")}</ul>`;
}

function renderFirstCustomerLaunchRoom(room) {
  const summaryNode = document.querySelector("#launch-room-summary");
  const nextNode = document.querySelector("#launch-room-next-action");
  const gridNode = document.querySelector("#launch-room-grid");
  if (!summaryNode || !nextNode || !gridNode) return;

  text("#launch-room-state", String(room?.sourceMode || "local sample only").replaceAll("_", " "));
  text(
    "#launch-room-note",
    room?.note ||
      "Read-only launch coordination state. It cannot mutate queues, enable external actions, or claim customer/revenue evidence."
  );

  const summary = room?.evidenceSummary || {};
  const gates = room?.businessGateState || [];
  const queues = room?.queueFloorState || [];
  const blockedClaims = room?.blockedClaims || [];
  const readyAreas = room?.readinessAreas || [];
  const next = room?.nextAgentRouting || {};

  summaryNode.innerHTML = [
    ["Evidence slots", summary.totalRecords || 0],
    ["Ready areas", readyAreas.length],
    ["Blocked gates", gates.filter((gate) => gate.externalActionAllowedFromLaunchRoom === false).length],
    ["Queue floors", queues.length],
    ["Blocked claims", blockedClaims.length],
  ]
    .map(
      ([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");

  nextNode.innerHTML = `
    <span>Exactly one next route</span>
    <strong>${escapeHtml(next.primaryRoute || "product")} -> ${escapeHtml(next.queueItemId || "no_queue_action")}</strong>
    <p>${escapeHtml(next.nextAction || "No next route selected.")}</p>
    <p>${escapeHtml(next.reason || "")}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Readiness areas</span>
      ${renderLaunchRoomList(
        readyAreas,
        (item) => `
          <li>
            <strong>${escapeHtml(item.label || item.id)}</strong>
            <code>${escapeHtml(item.state || "unknown")}</code>
            <p>${escapeHtml(item.summary || "")}</p>
            ${item.source ? `<p>${sourceLink(item.source, "Source")}</p>` : ""}
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Business gates</span>
      ${renderLaunchRoomList(
        gates,
        (gate) => `
          <li>
            <strong>${escapeHtml(gate.label || gate.id)}</strong>
            <code>${escapeHtml(gate.sourceStatus || "unknown")}</code>
            <p>${escapeHtml(gate.oneMissingUserOrPlatformItem || "Operator authority evidence required.")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Queue floor</span>
      ${renderLaunchRoomList(
        queues,
        (queue) => `
          <li>
            <strong>${escapeHtml(queue.label)}</strong>
            <code>ready:${escapeHtml(queue.readyCount || 0)} claimed:${escapeHtml(queue.claimedCount || 0)} blocked:${escapeHtml(queue.blockedCount || 0)}</code>
            <p>${escapeHtml(queue.firstReadyId || queue.activeClaimId || "No active ready/claimed item.")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Blocked claims</span>
      ${renderLaunchRoomList(blockedClaims, (claim) => `<li><strong>${escapeHtml(claim)}</strong></li>`)}
    </article>
  `;
}

function renderFirstCustomerSignalSurface(surface) {
  const summaryNode = document.querySelector("#signal-surface-summary");
  const routeNode = document.querySelector("#signal-surface-route");
  const gridNode = document.querySelector("#signal-surface-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  text("#signal-surface-state", String(surface?.state || "local sample only").replaceAll("_", " "));
  text(
    "#signal-surface-note",
    surface?.note ||
      "Read-only sample/redacted signal path. It cannot mutate queues, run providers, or claim customer, payment, public-proof, or revenue evidence."
  );

  const valueReceipt = surface?.valueReceipt || {};
  const reaction = surface?.redactedReaction || {};
  const consent = surface?.consentAndRedaction || {};
  const blockedGates = surface?.blockedGates || [];
  const route = surface?.recommendedRoute || {};
  const sourceArtifacts = surface?.sourceArtifacts || [];

  summaryNode.innerHTML = [
    ["Value receipt", valueReceipt.receiptId ? 1 : 0],
    ["Reaction", reaction.signalType || "none"],
    ["Consent", consent.consentState || "unknown"],
    ["Redaction", consent.redactionState || "unknown"],
    ["Blocked gates", blockedGates.length],
    ["Source artifacts", sourceArtifacts.length],
  ]
    .map(
      ([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");

  routeNode.innerHTML = `
    <span>Exactly one next route</span>
    <strong>${escapeHtml(route.target || "no_queue_action")} -> ${escapeHtml(route.routeId || "no_queue_action")}</strong>
    <p>${escapeHtml(route.rationale || "No route rationale supplied.")}</p>
    <p>${escapeHtml(route.ownerRole || "no owner")}; external action: ${route.externalActionAllowed === false ? "blocked" : "check"}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Value receipt</span>
      <ul class="launch-room-list">
        <li>
          <strong>${escapeHtml(valueReceipt.targetRole || "Sample target role")}</strong>
          <code>${escapeHtml(valueReceipt.selectedSampleOutcome || "sample_only")}</code>
          <p>${escapeHtml(valueReceipt.receiptSummary || "")}</p>
          <p>Missing proof warnings: ${escapeHtml(valueReceipt.missingProofWarningCount || 0)}</p>
        </li>
      </ul>
    </article>
    <article class="launch-room-card">
      <span>Redacted reaction</span>
      <ul class="launch-room-list">
        <li>
          <strong>${escapeHtml(reaction.title || reaction.signalType || "Sample reaction")}</strong>
          <code>${escapeHtml(reaction.sourceMode || "sample_redacted")}</code>
          <p>${escapeHtml(reaction.summary || "")}</p>
          <p>Blocked gate: ${escapeHtml(reaction.blockedGate || "none")}</p>
        </li>
      </ul>
    </article>
    <article class="launch-room-card">
      <span>Consent and redaction</span>
      <ul class="launch-room-list">
        <li>
          <strong>${escapeHtml(consent.consentState || "unknown")}</strong>
          <code>${escapeHtml(consent.redactionState || "unknown")}</code>
          <p>${escapeHtml(consent.custodyRule || "")}</p>
          <p>Raw private material accepted: ${consent.rawPrivateMaterialAccepted === false ? "no" : "check"}</p>
        </li>
      </ul>
    </article>
    <article class="launch-room-card">
      <span>Blocked gates</span>
      ${renderLaunchRoomList(
        blockedGates,
        (gate) => `
          <li>
            <strong>${escapeHtml(gate.label || gate.id)}</strong>
            <code>${escapeHtml(gate.state || "blocked")}</code>
            <p>${escapeHtml(gate.reason || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Source artifacts</span>
      ${renderLaunchRoomList(
        sourceArtifacts,
        (artifact) => `
          <li>
            <strong>${escapeHtml(artifact.id)}</strong>
            <code>${escapeHtml(artifact.state || "observed")}</code>
            <p>${sourceLink(artifact.path, artifact.path)}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Forbidden outcomes</span>
      ${renderLaunchRoomList(surface?.forbiddenOutcomes || [], (outcome) => `<li><strong>${escapeHtml(outcome)}</strong></li>`)}
    </article>
  `;
}

function renderFirstCustomerEvidenceInboxRoom(room) {
  const summaryNode = document.querySelector("#evidence-inbox-room-summary");
  const routeNode = document.querySelector("#evidence-inbox-room-route");
  const gridNode = document.querySelector("#evidence-inbox-room-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const envelope = room?.evidenceEnvelope || {};
  const custody = room?.sourceCustody || {};
  const route = room?.selectedProvisionalRoute || {
    target: "product",
    action: "product_first_session_missing_proof_repair",
    rationale: "Default local product repair route until admin data is generated.",
    externalActionAllowed: false,
    queueMutationAllowed: false,
  };
  const falseClaims = room?.claimBoundary?.falseClaims || {};
  const sources = room?.sourceArtifacts || [];
  const blockedGates = room?.blockedGates || [];
  const missing = room?.missingBeforeLiveUse || [];

  text("#evidence-inbox-room-state", String(room?.state || room?.mode || "local sample only").replaceAll("_", " "));
  text(
    "#evidence-inbox-room-note",
    room?.note ||
      "Read-only local evidence inbox state. It accepts sample-only or owner-approved redacted labels, chooses one internal route, and cannot mutate queues or claim live customer, payment, public-proof, or revenue evidence."
  );

  summaryNode.innerHTML = [
    ["Format", room?.format || "missing"],
    ["Mode", envelope.consentStatus || "sample_only"],
    ["Redaction", envelope.redactionStatus || "sample_only"],
    ["Labels", (envelope.observationLabels || []).length],
    ["Blocked gates", blockedGates.length],
    ["Source artifacts", sources.length],
  ]
    .map(
      ([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");

  routeNode.innerHTML = `
    <span>Exactly one provisional route</span>
    <strong>${escapeHtml(route.target || "no_action")} -> ${escapeHtml(route.action || "no_action")}</strong>
    <p>${escapeHtml(route.rationale || "No route rationale supplied.")}</p>
    <p>External action: ${route.externalActionAllowed === false ? "blocked" : "check"}; queue mutation: ${route.queueMutationAllowed === false ? "blocked" : "check"}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Source custody</span>
      <ul class="launch-room-list">
        <li>
          <strong>${escapeHtml(custody.custodyMode || "repo_safe_summary_labels_only")}</strong>
          <code>${escapeHtml((custody.acceptedEvidenceModes || []).join(" / ") || "sample_only")}</code>
          <p>Raw private material accepted: ${custody.rawPrivateMaterialAccepted === false ? "no" : "check"}</p>
        </li>
      </ul>
    </article>
    <article class="launch-room-card">
      <span>Source artifacts</span>
      ${renderLaunchRoomList(
        sources,
        (source) => `
          <li>
            <strong>${escapeHtml(source.id)}</strong>
            <code>${escapeHtml(source.state || "observed")}</code>
            <p>${sourceLink(source.path, source.path)}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Missing before live use</span>
      ${renderLaunchRoomList(missing, (item) => `<li><strong>${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Blocked gates</span>
      ${renderLaunchRoomList(blockedGates, (gate) => `<li><strong>${escapeHtml(gate)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Unsupported claim flags</span>
      ${renderLaunchRoomList(Object.entries(falseClaims), ([key, value]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(value)}</strong></li>`)}
    </article>
  `;
}

function renderFirstCustomerEvidenceRouteScoreboard(scoreboard) {
  const summaryNode = document.querySelector("#evidence-route-scoreboard-summary");
  const routeNode = document.querySelector("#evidence-route-scoreboard-route");
  const gridNode = document.querySelector("#evidence-route-scoreboard-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const dimensions = scoreboard?.scoreDimensions || [];
  const selectedRoute = scoreboard?.selectedRoute || {
    target: "product",
    action: "product_first_customer_evidence_proof_repair",
    rationale: "Default local product repair route until admin data is generated.",
    externalActionAllowed: false,
    queueMutationAllowed: false,
  };
  const sources = scoreboard?.consumedArtifacts || [];
  const routeOptions = scoreboard?.routeOptions || [];
  const fixtures = scoreboard?.scoreFixtures || [];
  const blockedGates = scoreboard?.claimControls?.blockedExternalGates || [];
  const falseClaims = scoreboard?.claimControls?.falseClaims || {};

  text("#evidence-route-scoreboard-state", String(scoreboard?.state || scoreboard?.mode || "fail closed local").replaceAll("_", " "));
  text(
    "#evidence-route-scoreboard-note",
    scoreboard?.note ||
      "Read-only local route scoreboard. It scores safe labels into exactly one route and cannot claim live feedback, willingness to pay, payment intent, payment, revenue, public proof, production customer data, deploy, outreach, analytics, auto-apply, or application submission."
  );

  summaryNode.innerHTML = [
    ["Format", scoreboard?.format || "missing"],
    ["Dimensions", dimensions.length],
    ["Routes", routeOptions.length],
    ["Fixtures", fixtures.length],
    ["Blocked gates", blockedGates.length],
    ["Sources", sources.length],
  ]
    .map(
      ([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");

  routeNode.innerHTML = `
    <span>Exactly one selected route</span>
    <strong>${escapeHtml(selectedRoute.target || "product")} -> ${escapeHtml(selectedRoute.action || "product_first_customer_evidence_proof_repair")}</strong>
    <p>${escapeHtml(selectedRoute.rationale || "No route rationale supplied.")}</p>
    <p>External action: ${selectedRoute.externalActionAllowed === false ? "blocked" : "check"}; queue mutation: ${selectedRoute.queueMutationAllowed === false ? "blocked" : "check"}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Score dimensions</span>
      ${renderLaunchRoomList(
        dimensions,
        (dimension) => `
          <li>
            <strong>${escapeHtml(dimension.label || dimension.id)}</strong>
            <code>${escapeHtml(`${dimension.score}/${dimension.threshold}`)}</code>
            <p>${escapeHtml(dimension.status || "")}: ${escapeHtml(dimension.rationale || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Route map</span>
      ${renderLaunchRoomList(
        routeOptions,
        (route) => `
          <li>
            <strong>${route.selected ? "Selected: " : ""}${escapeHtml(route.routeFamily)}</strong>
            <code>${escapeHtml(route.action || "")}</code>
            <p>${escapeHtml(route.trigger || route.rationale || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Score fixtures</span>
      ${renderLaunchRoomList(fixtures, (fixture) => `<li><strong>${escapeHtml(fixture.id)}</strong><code>${escapeHtml(fixture.expectedRouteFamily)}</code></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Consumed sources</span>
      ${renderLaunchRoomList(
        sources,
        (source) => `
          <li>
            <strong>${escapeHtml(source.id)}</strong>
            <code>${escapeHtml(source.state || "observed")}</code>
            <p>${sourceLink(source.path, source.path)}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Blocked gates</span>
      ${renderLaunchRoomList(blockedGates, (gate) => `<li><strong>${escapeHtml(gate)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Fail-closed claims</span>
      ${renderLaunchRoomList(Object.entries(falseClaims), ([key, value]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(value)}</strong></li>`)}
    </article>
  `;
}

function renderFirstCustomerEvidenceProofRepairPacket(packet) {
  const summaryNode = document.querySelector("#evidence-proof-repair-summary");
  const routeNode = document.querySelector("#evidence-proof-repair-route");
  const gridNode = document.querySelector("#evidence-proof-repair-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const categories = packet?.missingProofCategories || [];
  const prompts = packet?.safeFollowUpPrompts || [];
  const repairCopy = packet?.beforeAfterRepairCopy || [];
  const sourceLabels = packet?.sourceCustodyLabels || [];
  const blockedActions = packet?.blockedExternalActions || {};
  const selectedRoute = packet?.selectedInternalRoute || {
    target: "product",
    action: "product_first_customer_evidence_proof_repair",
    rationale: "Default local proof-repair route until admin data is generated.",
    externalActionAllowed: false,
    queueMutationAllowed: false,
  };

  text("#evidence-proof-repair-state", String(packet?.state || packet?.mode || "local proof repair").replaceAll("_", " "));
  text(
    "#evidence-proof-repair-note",
    packet?.note ||
      "Read-only local proof-repair packet. It consumes the selected Product repair route, prepares safe prompts and before/after copy, and cannot claim live feedback, willingness to pay, payment intent, payment, revenue, public proof, production customer data, deploy, outreach, analytics, auto-apply, form fill, application submission, or downstream queue completion."
  );

  summaryNode.innerHTML = [
    ["Format", packet?.format || "missing"],
    ["Missing proof", categories.length],
    ["Prompts", prompts.length],
    ["Repair copy", repairCopy.length],
    ["Custody labels", sourceLabels.length],
    ["Blocked actions", Object.keys(blockedActions).length],
  ]
    .map(
      ([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");

  routeNode.innerHTML = `
    <span>Exactly one selected internal route</span>
    <strong>${escapeHtml(selectedRoute.target || "product")} -> ${escapeHtml(selectedRoute.action || "product_first_customer_evidence_proof_repair")}</strong>
    <p>${escapeHtml(selectedRoute.rationale || "No route rationale supplied.")}</p>
    <p>External action: ${selectedRoute.externalActionAllowed === false ? "blocked" : "check"}; queue mutation: ${selectedRoute.queueMutationAllowed === false ? "blocked" : "check"}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Missing proof categories</span>
      ${renderLaunchRoomList(
        categories,
        (category) => `
          <li>
            <strong>${escapeHtml(category.label || category.id)}</strong>
            <code>${escapeHtml(category.severity || "check")}</code>
            <p>${escapeHtml(category.repairGoal || category.observedGap || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Safe follow-up prompts</span>
      ${renderLaunchRoomList(
        prompts,
        (prompt) => `
          <li>
            <strong>${escapeHtml(prompt.id)}</strong>
            <p>${escapeHtml(prompt.prompt || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Before/after repair copy</span>
      ${renderLaunchRoomList(
        repairCopy,
        (copy) => `
          <li>
            <strong>${escapeHtml(copy.id)}</strong>
            <p>${escapeHtml(copy.before || "")}</p>
            <p>${escapeHtml(copy.after || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Source custody labels</span>
      ${renderLaunchRoomList(sourceLabels, (label) => `<li><strong>${escapeHtml(label)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Blocked actions</span>
      ${renderLaunchRoomList(Object.entries(blockedActions), ([key, value]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(value)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Repair output</span>
      ${renderLaunchRoomList(Object.entries(packet?.proofCompletenessRepairOutput || {}), ([key, value]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(value)}</strong></li>`)}
    </article>
  `;
}

function renderRepairedProofToPaidAskRoom(room) {
  const summaryNode = document.querySelector("#paid-ask-room-summary");
  const routeNode = document.querySelector("#paid-ask-room-route");
  const gridNode = document.querySelector("#paid-ask-room-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const proofDelta = room?.proofDelta || [];
  const missingProofAsk = room?.missingProofAsk || [];
  const deliverables = room?.paidPacket?.deliverables || [];
  const objectionStates = room?.objectionStates || [];
  const selectedRoute = room?.selectedInternalRoute || {
    target: "business",
    route: "business_private_paid_packet_discussion_no_checkout",
    rationale: "Default no-send paid ask route until admin data is generated.",
  };
  const blockedActions = room?.blockedExternalActions || {};

  text("#paid-ask-room-state", String(room?.state || room?.mode || "sample no-send").replaceAll("_", " "));
  text(
    "#paid-ask-room-note",
    room?.note ||
      "Read-only local paid-ask rehearsal. It consumes repaired proof, paid preview, decision-room, no-send offer, and fulfillment boundary artifacts without enabling checkout, customer-data handling, external action, downstream queue mutation, or revenue claims."
  );

  summaryNode.innerHTML = [
    ["Format", room?.format || "missing"],
    ["Proof delta", proofDelta.length],
    ["Missing-proof asks", missingProofAsk.length],
    ["Deliverables", deliverables.length],
    ["Objection routes", objectionStates.length],
    ["Blocked actions", Object.keys(blockedActions).length],
  ]
    .map(
      ([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");

  routeNode.innerHTML = `
    <span>Exactly one selected internal route</span>
    <strong>${escapeHtml(selectedRoute.target || "business")} -> ${escapeHtml(selectedRoute.route || "business_private_paid_packet_discussion_no_checkout")}</strong>
    <p>${escapeHtml(selectedRoute.rationale || "No route rationale supplied.")}</p>
    <p>External action: ${selectedRoute.externalActionAllowed === false ? "blocked" : "check"}; payment action: ${selectedRoute.paymentActionAllowed === false ? "blocked" : "check"}; queue mutation: ${selectedRoute.queueMutationAllowed === false ? "blocked" : "check"}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Proof delta</span>
      ${renderLaunchRoomList(
        proofDelta,
        (delta) => `
          <li>
            <strong>${escapeHtml(delta.id)}</strong>
            <p>${escapeHtml(delta.after || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Missing-proof asks</span>
      ${renderLaunchRoomList(
        missingProofAsk,
        (ask) => `
          <li>
            <strong>${escapeHtml(ask.id)}</strong>
            <p>${escapeHtml(ask.ask || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Paid packet deliverables</span>
      ${renderLaunchRoomList(deliverables, (deliverable) => `<li><strong>${escapeHtml(deliverable)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Objection states</span>
      ${renderLaunchRoomList(
        objectionStates,
        (route) => `
          <li>
            <strong>${escapeHtml(route.label || route.id)}</strong>
            <code>${escapeHtml(route.route || "")}</code>
            <p>${escapeHtml(route.rationale || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Payment and support posture</span>
      ${renderLaunchRoomList(Object.entries(room?.supportRefundPaymentPosture || {}), ([key, value]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(typeof value === "object" ? "disabled" : value)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Private operator handoff</span>
      <p>${escapeHtml(room?.privateOperatorHandoff?.copy || "No-send private discussion notes only; payment links, checkout, and production customer-data handling stay blocked.")}</p>
    </article>
    <article class="launch-room-card">
      <span>Blocked actions</span>
      ${renderLaunchRoomList(Object.entries(blockedActions), ([key, value]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(value)}</strong></li>`)}
    </article>
  `;
}

function renderPaidAskOutcomeRouter(router) {
  const summaryNode = document.querySelector("#paid-ask-router-summary");
  const routeNode = document.querySelector("#paid-ask-router-route");
  const gridNode = document.querySelector("#paid-ask-router-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const sources = router?.consumedArtifacts || [];
  const routes = router?.outcomeRoutes || [];
  const routePacket = router?.routePacket || {};
  const evidenceStateLegend = router?.evidenceStateLegend || {};
  const blockedActions = router?.blockedExternalActions || {};
  const selectedRoute = router?.selectedRoute || {
    target: "product",
    action: "product_paid_ask_packet_or_proof_repair",
    rationale: "Default Product repair route until admin data is generated.",
    externalActionAllowed: false,
    queueMutationAllowed: false,
  };

  text("#paid-ask-router-state", String(router?.state || router?.mode || "fail closed local").replaceAll("_", " "));
  text(
    "#paid-ask-router-note",
    router?.note ||
      "Read-only local paid-ask outcome router. It consumes the paid ask room when available, falls back to existing fixtures, selects exactly one internal route, and cannot mutate downstream queues, mark delegated work done, collect payment, handle production customer data, call providers, send outreach, deploy, publish proof, submit applications, or claim traction."
  );

  summaryNode.innerHTML = [
    ["Format", router?.format || "missing"],
    ["Sources", sources.length],
    ["Routes", routes.length],
    ["Selected", selectedRoute.routeFamily || "product_repair"],
    ["Blocked gates", (routePacket.blockedGates || []).length],
    ["Blocked actions", Object.keys(blockedActions).length],
  ]
    .map(
      ([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");

  routeNode.innerHTML = `
    <span>Exactly one selected internal route</span>
    <strong>${escapeHtml(selectedRoute.target || "product")} -> ${escapeHtml(selectedRoute.action || "product_paid_ask_packet_or_proof_repair")}</strong>
    <p>${escapeHtml(selectedRoute.rationale || routePacket.acceptanceCriteria || "No route rationale supplied.")}</p>
    <p>External action: ${selectedRoute.externalActionAllowed === false ? "blocked" : "check"}; queue mutation: ${selectedRoute.queueMutationAllowed === false ? "blocked" : "check"}; customer/payment handling: ${selectedRoute.paymentOrCustomerDataHandlingAllowed === false ? "blocked" : "check"}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Route packet</span>
      ${renderLaunchRoomList(
        [
          ["Evidence mode", routePacket.evidenceMode],
          ["Consent state", routePacket.consentState],
          ["Redaction state", routePacket.redactionState],
          ["Suggested owner", routePacket.suggestedOwner],
          ["Acceptance", routePacket.acceptanceCriteria],
          ["Validation", routePacket.validationExpectation],
        ],
        ([key, value]) => `<li><strong>${escapeHtml(key)}:</strong><p>${escapeHtml(value || "missing")}</p></li>`
      )}
    </article>
    <article class="launch-room-card">
      <span>Outcome routes</span>
      ${renderLaunchRoomList(
        routes,
        (route) => `
          <li>
            <strong>${escapeHtml(route.selected ? `Selected: ${route.routeFamily}` : route.routeFamily)}</strong>
            <code>${escapeHtml(route.action || "")}</code>
            <p>${escapeHtml(route.acceptanceCriteria || route.rationale || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Consumed sources</span>
      ${renderLaunchRoomList(
        sources,
        (source) => `
          <li>
            <strong>${escapeHtml(source.id)}</strong>
            <code>${escapeHtml(source.state || "observed")}</code>
            <p>${sourceLink(source.path, source.path)}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Evidence state legend</span>
      ${renderLaunchRoomList(Object.entries(evidenceStateLegend), ([key, value]) => `<li><strong>${escapeHtml(key)}:</strong><p>${escapeHtml(value)}</p></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Unsupported claim flags</span>
      ${renderLaunchRoomList(Object.entries(routePacket.unsupportedClaimFlags || {}), ([key, value]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(value)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Blocked gates</span>
      ${renderLaunchRoomList(routePacket.blockedGates || [], (gate) => `<li><strong>${escapeHtml(gate)}</strong></li>`)}
    </article>
  `;
}

function renderPaidAskProofPacketClarityRepair(repair) {
  const summaryNode = document.querySelector("#paid-ask-clarity-summary");
  const routeNode = document.querySelector("#paid-ask-clarity-route");
  const gridNode = document.querySelector("#paid-ask-clarity-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const sources = repair?.consumedArtifacts || [];
  const repairs = repair?.clarityRepairs || [];
  const controls = repair?.approvalControls || [];
  const stopCopy = repair?.stopCopy || {};
  const nextRoute = repair?.safeNextRoutePacket || {
    selectedRouteFamily: "business_no_send_follow_up",
    selectedAction: "business_private_paid_packet_discussion_no_checkout",
    suggestedOwner: "Business Operator",
    externalActionAllowed: false,
    queueMutationAllowed: false,
    paymentOrCustomerDataHandlingAllowed: false,
  };
  const blockedActions = repair?.blockedExternalActions || {};

  text("#paid-ask-clarity-state", String(repair?.state || repair?.mode || "product repair ready").replaceAll("_", " "));
  text(
    "#paid-ask-clarity-note",
    repair?.note ||
      "Read-only local paid-ask proof and packet clarity repair. It consumes the selected Product repair route, improves proof explanation and packet controls, emits one no-send next-route packet, and cannot display checkout, collect payment, handle production customer data, mutate downstream queues, mark delegated work done, or claim live traction."
  );

  summaryNode.innerHTML = [
    ["Format", repair?.format || "missing"],
    ["Sources", sources.length],
    ["Repairs", repairs.length],
    ["Approval controls", controls.length],
    ["Next route", nextRoute.selectedRouteFamily || "business_no_send_follow_up"],
    ["Blocked actions", Object.keys(blockedActions).length],
  ]
    .map(
      ([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");

  routeNode.innerHTML = `
    <span>Exactly one safe next-route packet</span>
    <strong>${escapeHtml(nextRoute.selectedRouteFamily || "business_no_send_follow_up")} -> ${escapeHtml(nextRoute.selectedAction || "business_private_paid_packet_discussion_no_checkout")}</strong>
    <p>${escapeHtml(nextRoute.acceptanceCriteria || "Private no-send operator review only.")}</p>
    <p>External action: ${nextRoute.externalActionAllowed === false ? "blocked" : "check"}; queue mutation: ${nextRoute.queueMutationAllowed === false ? "blocked" : "check"}; customer/payment handling: ${nextRoute.paymentOrCustomerDataHandlingAllowed === false ? "blocked" : "check"}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Clarity repairs</span>
      ${renderLaunchRoomList(
        repairs,
        (item) => `
          <li>
            <strong>${escapeHtml(item.label || item.id)}</strong>
            <code>${escapeHtml(item.approvalState || "review")}</code>
            <p>${escapeHtml(item.after || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Approval controls</span>
      ${renderLaunchRoomList(
        controls,
        (control) => `
          <li>
            <strong>${escapeHtml(control.id)}</strong>
            <p>${escapeHtml(control.repair || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Stop copy</span>
      ${renderLaunchRoomList(Object.entries(stopCopy), ([key, value]) => `<li><strong>${escapeHtml(key)}:</strong><p>${escapeHtml(value)}</p></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Consumed sources</span>
      ${renderLaunchRoomList(
        sources,
        (source) => `
          <li>
            <strong>${escapeHtml(source.id)}</strong>
            <code>${escapeHtml(source.state || "observed")}</code>
            <p>${sourceLink(source.path, source.path)}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Proof and packet mechanics</span>
      ${renderLaunchRoomList(
        [
          ["Proof delta", repair?.proofExplanationRepair?.explanation],
          ["Packet mechanics", repair?.paidPacketMechanicsRepair?.explanation],
          ["Checkout allowed", repair?.paidPacketMechanicsRepair?.checkoutAllowed],
          ["Payment link display", repair?.paidPacketMechanicsRepair?.paymentLinkDisplayAllowed],
          ["Payment collection", repair?.paidPacketMechanicsRepair?.paymentCollectionAllowed],
        ],
        ([key, value]) => `<li><strong>${escapeHtml(key)}:</strong><p>${escapeHtml(value)}</p></li>`
      )}
    </article>
    <article class="launch-room-card">
      <span>Unsupported claim flags</span>
      ${renderLaunchRoomList(Object.entries(repair?.claimControls?.unsupportedClaimFlags || {}), ([key, value]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(value)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Blocked actions</span>
      ${renderLaunchRoomList(Object.entries(blockedActions), ([key, value]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(value)}</strong></li>`)}
    </article>
  `;
}

function renderPaidAskObjectionResponseSimulator(simulator) {
  const summaryNode = document.querySelector("#paid-ask-objection-simulator-summary");
  const routeNode = document.querySelector("#paid-ask-objection-simulator-route");
  const gridNode = document.querySelector("#paid-ask-objection-simulator-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const sources = simulator?.consumedArtifacts || [];
  const objections = simulator?.objectionStates || [];
  const responseCopy = simulator?.responseCopy || [];
  const selectedRoute = simulator?.selectedObjectionRoute || {
    routeFamily: "product_repair",
    action: "product_missing_proof_response_repair",
    suggestedOwner: "Product Worker",
    externalActionAllowed: false,
    queueMutationAllowed: false,
    paymentOrCustomerDataHandlingAllowed: false,
  };
  const boundary = simulator?.evidenceStateBoundary || {};
  const blockedActions = simulator?.blockedExternalActions || {};

  text("#paid-ask-objection-simulator-state", String(simulator?.state || simulator?.mode || "sample objections only").replaceAll("_", " "));
  text(
    "#paid-ask-objection-simulator-note",
    simulator?.note ||
      "Read-only local paid-ask objection response simulator. It maps sample objections to safe response copy, first blocking gate, and exactly one internal route without claiming live feedback, willingness to pay, payment intent, payment, public proof, or revenue."
  );

  summaryNode.innerHTML = [
    ["Format", simulator?.format || "missing"],
    ["Sources", sources.length],
    ["Objections", objections.length],
    ["Responses", responseCopy.length],
    ["Selected", simulator?.selectedObjectionId || "missing_proof"],
    ["Blocked actions", Object.keys(blockedActions).length],
  ]
    .map(
      ([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");

  routeNode.innerHTML = `
    <span>Selected sample route</span>
    <strong>${escapeHtml(selectedRoute.routeFamily || "product_repair")} -> ${escapeHtml(selectedRoute.action || "product_missing_proof_response_repair")}</strong>
    <p>${escapeHtml(selectedRoute.acceptanceCriteria || "Local/sample response rehearsal only; no downstream work is created.")}</p>
    <p>External action: ${selectedRoute.externalActionAllowed === false ? "blocked" : "check"}; queue mutation: ${selectedRoute.queueMutationAllowed === false ? "blocked" : "check"}; customer/payment handling: ${selectedRoute.paymentOrCustomerDataHandlingAllowed === false ? "blocked" : "check"}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Objection states</span>
      ${renderLaunchRoomList(
        objections,
        (state) => `
          <li>
            <strong>${escapeHtml(state.label || state.id)}</strong>
            <code>${escapeHtml(state.firstBlockingGate || "gate_missing")}</code>
            <p>${escapeHtml(state.sampleObjection || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Operator-safe response copy</span>
      ${renderLaunchRoomList(
        responseCopy,
        (item) => `
          <li>
            <strong>${escapeHtml(item.label || item.id)}</strong>
            <p>${escapeHtml(item.operatorSafeResponseCopy || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Product repair cues</span>
      ${renderLaunchRoomList(responseCopy, (item) => `<li><strong>${escapeHtml(item.label || item.id)}:</strong><p>${escapeHtml(item.productRepairCue || "")}</p></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Exactly one route per objection</span>
      ${renderLaunchRoomList(
        objections,
        (state) => `
          <li>
            <strong>${escapeHtml(state.label || state.id)}</strong>
            <code>${escapeHtml(state.nextRoute?.routeFamily || "")} -> ${escapeHtml(state.nextRoute?.action || "")}</code>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Evidence state boundary</span>
      ${renderLaunchRoomList(Object.entries(boundary), ([key, value]) => `<li><strong>${escapeHtml(key)}:</strong><p>${escapeHtml(value)}</p></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Unsupported claim flags</span>
      ${renderLaunchRoomList(Object.entries(simulator?.claimControls?.unsupportedClaimFlags || {}), ([key, value]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(value)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Consumed sources</span>
      ${renderLaunchRoomList(
        sources,
        (source) => `
          <li>
            <strong>${escapeHtml(source.id)}</strong>
            <code>${escapeHtml(source.state || "observed")}</code>
            <p>${sourceLink(source.path, source.path)}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Blocked actions</span>
      ${renderLaunchRoomList(Object.entries(blockedActions), ([key, value]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(value)}</strong></li>`)}
    </article>
  `;
}

function renderFirstPaidPilotHandoffRoom(room) {
  const summaryNode = document.querySelector("#first-paid-pilot-handoff-summary");
  const routeNode = document.querySelector("#first-paid-pilot-handoff-route");
  const gridNode = document.querySelector("#first-paid-pilot-handoff-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const sources = room?.consumedArtifacts || [];
  const value = room?.pilotValue || [];
  const deliverables = room?.deliverables || [];
  const gates = room?.gates || {};
  const ownerPacket = room?.ownerGoNoGoPacket || {};
  const unsupportedClaims = room?.unsupportedClaims || {};

  text("#first-paid-pilot-handoff-state", String(room?.state || room?.mode || "local handoff ready").replaceAll("_", " "));
  text(
    "#first-paid-pilot-handoff-note",
    room?.note ||
      "Read-only local first paid pilot handoff. It emits one owner go/no-go packet while checkout, payment, customer data, external actions, public proof, downstream queue mutation, and revenue claims remain blocked."
  );

  summaryNode.innerHTML = [
    ["Format", room?.format || "missing"],
    ["Sources", sources.length],
    ["Value items", value.length],
    ["Deliverables", deliverables.length],
    ["Owner fields", ownerPacket.ownerFields?.length || 0],
    ["Closed gates", Object.keys(gates).length],
  ]
    .map(
      ([label, item]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(item)}</strong>
        </article>
      `
    )
    .join("");

  routeNode.innerHTML = `
    <span>Exactly one owner go/no-go packet</span>
    <strong>${escapeHtml(ownerPacket.routeId || "owner_first_paid_pilot_go_no_go_packet")}</strong>
    <p>${escapeHtml(ownerPacket.acceptanceCriteria || "Owner reviews pilot gates before live use.")}</p>
    <p>External action: ${ownerPacket.externalActionAllowed === false ? "blocked" : "check"}; checkout: ${ownerPacket.checkoutAllowed === false ? "blocked" : "check"}; customer data: ${ownerPacket.productionCustomerDataHandlingAllowed === false ? "blocked" : "check"}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Consumed sources</span>
      ${renderLaunchRoomList(
        sources,
        (source) => `
          <li>
            <strong>${escapeHtml(source.id)}</strong>
            <code>${escapeHtml(source.state || "observed")}</code>
            <p>${sourceLink(source.path, source.path)}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Pilot value</span>
      ${renderLaunchRoomList(value, (item) => `<li><strong>${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Deliverables</span>
      ${renderLaunchRoomList(deliverables, (item) => `<li><strong>${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Owner fields</span>
      ${renderLaunchRoomList(ownerPacket.ownerFields || [], (field) => `<li><strong>${escapeHtml(field)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Closed gates</span>
      ${renderLaunchRoomList(Object.entries(gates), ([key, item]) => `<li><strong>${escapeHtml(key)}:</strong><p>${escapeHtml(item)}</p></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Unsupported claim flags</span>
      ${renderLaunchRoomList(Object.entries(unsupportedClaims), ([key, item]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(item)}</strong></li>`)}
    </article>
  `;
}

function renderFirstPaidPilotGateSimulator(simulator) {
  const summaryNode = document.querySelector("#first-paid-pilot-gate-summary");
  const routeNode = document.querySelector("#first-paid-pilot-gate-route");
  const gridNode = document.querySelector("#first-paid-pilot-gate-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const sources = simulator?.sourceArtifacts || [];
  const gates = simulator?.gateStates || [];
  const selectedRoute = simulator?.selectedRoute || {};
  const blockedActions = simulator?.blockedExternalActions || {};
  const unsupportedClaims = simulator?.claimControls?.unsupportedClaimFlags || {};

  text("#first-paid-pilot-gate-state", String(simulator?.state || simulator?.mode || "fail closed local").replaceAll("_", " "));
  text(
    "#first-paid-pilot-gate-note",
    simulator?.note ||
      "Read-only local first paid pilot gate simulator. It shows gate states and one owner repair ask without enabling checkout, payment, customer data, deploy, outreach, analytics, public proof, or live claims."
  );

  summaryNode.innerHTML = [
    ["Format", simulator?.format || "missing"],
    ["Gate states", gates.length],
    ["Sources", sources.length],
    ["Selected route", selectedRoute.routeFamily || "approval_unblocker_owner_gate_repair"],
    ["Blocked actions", Object.keys(blockedActions).length],
    ["Safe labels", simulator?.safeLabelsOnly === true ? "yes" : "check"],
  ]
    .map(
      ([label, item]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(item)}</strong>
        </article>
      `
    )
    .join("");

  routeNode.innerHTML = `
    <span>Owner repair ask</span>
    <strong>${escapeHtml(selectedRoute.suggestedOwner || "Approval Unblocker")} -> ${escapeHtml(selectedRoute.action || "repair_first_paid_pilot_owner_evidence")}</strong>
    <p>${escapeHtml(selectedRoute.ask || "Repair the first blocking owner evidence gate before live use.")}</p>
    <p>External action: ${selectedRoute.externalActionAllowed === false ? "blocked" : "check"}; queue mutation: ${selectedRoute.queueMutationAllowed === false ? "blocked" : "check"}; customer/payment handling: ${selectedRoute.paymentOrCustomerDataHandlingAllowed === false ? "blocked" : "check"}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Gate states</span>
      ${renderLaunchRoomList(
        gates,
        (gate) => `
          <li>
            <strong>${escapeHtml(gate.label || gate.gateId)}</strong>
            <code>${escapeHtml(gate.state || "blocked")}</code>
            <p>${escapeHtml(gate.repoSafeEvidenceRequired || "")}</p>
            <p>${escapeHtml(gate.ownerRepairAsk || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Source artifacts</span>
      ${renderLaunchRoomList(
        sources,
        (source) => `
          <li>
            <strong>${escapeHtml(source.id)}</strong>
            <code>${escapeHtml(source.state || "reference")}</code>
            <p>${sourceLink(source.path, source.path)}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Blocked external actions</span>
      ${renderLaunchRoomList(Object.entries(blockedActions), ([key, item]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Unsupported claim flags</span>
      ${renderLaunchRoomList(Object.entries(unsupportedClaims), ([key, item]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Repo safety</span>
      ${renderLaunchRoomList(Object.entries(simulator?.repoSafety || {}), ([key, item]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(Array.isArray(item) ? item.length : item)}</strong></li>`)}
    </article>
  `;
}

function renderFirstDollarReadinessRoom(room) {
  const summaryNode = document.querySelector("#first-dollar-readiness-summary");
  const routeNode = document.querySelector("#first-dollar-readiness-route");
  const gridNode = document.querySelector("#first-dollar-readiness-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const sources = room?.consumedArtifacts || [];
  const deliverables = room?.packetDeliverables || [];
  const questions = room?.readinessQuestions || [];
  const selectedRoute = (room?.routePackets || []).find((route) => route.selected) || {};
  const firstBlockingGate = room?.firstBlockingGate || {};
  const blockedActions = room?.blockedExternalActions || {};
  const unsupportedClaims = room?.unsupportedClaims || {};

  text("#first-dollar-readiness-state", String(room?.state || room?.mode || "fail closed local").replaceAll("_", " "));
  text(
    "#first-dollar-readiness-note",
    room?.note ||
      "Read-only local first dollar readiness room. It shows proof clarity, packet deliverables, the first blocking owner gate, and one internal route while payment, customer data, public proof, external actions, downstream mutation, and first-dollar claims remain blocked."
  );

  summaryNode.innerHTML = [
    ["Format", room?.format || "missing"],
    ["Sources", sources.length],
    ["Deliverables", deliverables.length],
    ["Readiness questions", questions.length],
    ["First blocking gate", firstBlockingGate.gateId || "payment_owner_stop"],
    ["Blocked actions", Object.keys(blockedActions).length],
  ]
    .map(
      ([label, item]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(item)}</strong>
        </article>
      `
    )
    .join("");

  routeNode.innerHTML = `
    <span>Exactly one first-dollar route</span>
    <strong>${escapeHtml(selectedRoute.suggestedOwner || "Approval Unblocker")} -> ${escapeHtml(selectedRoute.action || "repair_first_dollar_owner_evidence")}</strong>
    <p>${escapeHtml(selectedRoute.reason || "First-dollar readiness routes to owner-evidence repair until payment and customer-data gates are repo-safe.")}</p>
    <p>External action: ${selectedRoute.externalActionAllowed === false ? "blocked" : "check"}; queue mutation: ${selectedRoute.queueMutationAllowed === false ? "blocked" : "check"}; customer/payment handling: ${selectedRoute.paymentOrCustomerDataHandlingAllowed === false ? "blocked" : "check"}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Proof clarity</span>
      ${renderLaunchRoomList(Object.entries(room?.proofClarity || {}), ([key, item]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Packet deliverables</span>
      ${renderLaunchRoomList(deliverables, (item) => `<li><strong>${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Readiness questions</span>
      ${renderLaunchRoomList(
        questions,
        (question) => `
          <li>
            <strong>${escapeHtml(question.label || question.id)}</strong>
            <code>${escapeHtml(question.state || "blocked")}</code>
            <p>${escapeHtml(question.question || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>First blocking gate</span>
      <p>${escapeHtml(firstBlockingGate.reason || "Payment owner stop remains the first blocking gate.")}</p>
      ${renderLaunchRoomList(firstBlockingGate.ownerEvidenceRequired || [], (field) => `<li><strong>${escapeHtml(field)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Consumed sources</span>
      ${renderLaunchRoomList(
        sources,
        (source) => `
          <li>
            <strong>${escapeHtml(source.id)}</strong>
            <code>${escapeHtml(source.state || "observed")}</code>
            <p>${sourceLink(source.path, source.path)}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Unsupported first-dollar claims</span>
      ${renderLaunchRoomList(Object.entries(unsupportedClaims), ([key, item]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(item)}</strong></li>`)}
    </article>
  `;
}

function renderFirstDollarOwnerEvidenceRepairRoom(room) {
  const summaryNode = document.querySelector("#first-dollar-owner-evidence-summary");
  const routeNode = document.querySelector("#first-dollar-owner-evidence-route");
  const gridNode = document.querySelector("#first-dollar-owner-evidence-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const sources = room?.consumedArtifacts || [];
  const fields = room?.ownerEvidenceFields || [];
  const selectedRoute = (room?.routePackets || []).find((route) => route.selected) || {};
  const firstBlockingGate = room?.firstBlockingGate || {};
  const blockedActions = room?.blockedExternalActions || {};
  const unsupportedClaims = room?.unsupportedClaims || {};
  const exportContract = room?.exportContract || {};

  text("#first-dollar-owner-evidence-state", String(room?.state || room?.mode || "repair needed").replaceAll("_", " "));
  text(
    "#first-dollar-owner-evidence-note",
    room?.note ||
      "Read-only local owner-evidence repair room. It shows owner evidence fields, the first blocking gate, private off-repo answer path, and exactly one owner-evidence route while payment, customer data, public proof, external actions, downstream mutation, and first-dollar claims remain blocked."
  );

  summaryNode.innerHTML = [
    ["Format", room?.format || "missing"],
    ["Sources", sources.length],
    ["Owner evidence fields", fields.length],
    ["First blocking gate", firstBlockingGate.gateId || "payment_owner_evidence"],
    ["Exactly one owner-evidence route", selectedRoute.routeId || "approval_unblocker_owner_evidence_repair"],
    ["Blocked actions", Object.keys(blockedActions).length],
  ]
    .map(
      ([label, item]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(item)}</strong>
        </article>
      `
    )
    .join("");

  routeNode.innerHTML = `
    <span>Exactly one owner-evidence route</span>
    <strong>${escapeHtml(selectedRoute.suggestedOwner || "Approval Unblocker")} -> ${escapeHtml(selectedRoute.action || "repair_first_dollar_owner_evidence")}</strong>
    <p>${escapeHtml(selectedRoute.reason || "Owner evidence repair stays internal until payment and customer-data gates are repo-safe.")}</p>
    <p>External action: ${selectedRoute.externalActionAllowed === false ? "blocked" : "check"}; queue mutation: ${selectedRoute.queueMutationAllowed === false ? "blocked" : "check"}; customer/payment handling: ${selectedRoute.paymentOrCustomerDataHandlingAllowed === false ? "blocked" : "check"}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>First blocking gate</span>
      <p>${escapeHtml(firstBlockingGate.reason || "Payment owner evidence remains the first blocking gate.")}</p>
      ${renderLaunchRoomList(firstBlockingGate.ownerEvidenceRequired || [], (field) => `<li><strong>${escapeHtml(field)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Owner evidence fields</span>
      ${renderLaunchRoomList(
        fields,
        (field) => `
          <li>
            <strong>${escapeHtml(field.label || field.id)}</strong>
            <code>${escapeHtml(field.state || "needed")}</code>
            <p>${escapeHtml(field.missingReason || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Private answer path</span>
      <p>${sourceLink(exportContract.privateAnswerPath || firstBlockingGate.privateAnswerPath, exportContract.privateAnswerPath || firstBlockingGate.privateAnswerPath || "owner answer intake")}</p>
      ${renderLaunchRoomList(exportContract.forbiddenRepoVisibleValues || [], (item) => `<li><strong>${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Consumed sources</span>
      ${renderLaunchRoomList(
        sources,
        (source) => `
          <li>
            <strong>${escapeHtml(source.id)}</strong>
            <code>${escapeHtml(source.state || "observed")}</code>
            <p>${sourceLink(source.path, source.path)}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Blocked external actions</span>
      ${renderLaunchRoomList(Object.entries(blockedActions), ([key, item]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Unsupported first-dollar claims</span>
      ${renderLaunchRoomList(Object.entries(unsupportedClaims), ([key, item]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(item)}</strong></li>`)}
    </article>
  `;
}


function renderFirstPaidPilotFulfillmentReceiptPreview(receipt) {
  const summaryNode = document.querySelector("#fulfillment-receipt-summary");
  const routeNode = document.querySelector("#fulfillment-receipt-route");
  const gridNode = document.querySelector("#fulfillment-receipt-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const sources = receipt?.consumedArtifacts || [];
  const deliverables = receipt?.receiptDeliverables || [];
  const selectedRoute = receipt?.selectedRoute || {};
  const blockedActions = receipt?.blockedExternalActions || {};
  const unsupportedClaims = receipt?.unsupportedClaims || {};

  text("#fulfillment-receipt-state", String(receipt?.state || receipt?.mode || "sample receipt only").replaceAll("_", " "));
  text("#fulfillment-receipt-note", receipt?.note || "Read-only local fulfillment receipt preview. It shows deliverables, proof delta, source custody, data path, and one internal route while payment, customer data, public proof, external actions, downstream mutation, and revenue claims remain blocked.");

  summaryNode.innerHTML = [
    ["Format", receipt?.format || "missing"],
    ["Sources", sources.length],
    ["Deliverables", deliverables.length],
    ["Source labels", (receipt?.sourceCustodyLabels || []).length],
    ["Blocked actions", Object.keys(blockedActions).length],
    ["Unsupported claims", Object.keys(unsupportedClaims).length],
  ].map(([label, item]) => "<article><span>" + escapeHtml(label) + "</span><strong>" + escapeHtml(item) + "</strong></article>").join("");

  routeNode.innerHTML = "<span>Exactly one receipt route</span>" +
    "<strong>" + escapeHtml(selectedRoute.suggestedOwner || "Approval Unblocker") + " -> " + escapeHtml(selectedRoute.action || "repair_first_paid_pilot_receipt_owner_evidence") + "</strong>" +
    "<p>" + escapeHtml(selectedRoute.reason || "Receipt remains sample-only until owner evidence is repaired.") + "</p>" +
    "<p>External action: " + (selectedRoute.externalActionAllowed === false ? "blocked" : "check") + "; queue mutation: " + (selectedRoute.queueMutationAllowed === false ? "blocked" : "check") + "; customer/payment handling: " + (selectedRoute.paymentOrCustomerDataHandlingAllowed === false ? "blocked" : "check") + "</p>";

  gridNode.innerHTML = "" +
    "<article class=\"launch-room-card\"><span>Receipt deliverables</span>" + renderLaunchRoomList(deliverables, (item) => "<li><strong>" + escapeHtml(item) + "</strong></li>") + "</article>" +
    "<article class=\"launch-room-card\"><span>Proof delta</span>" + renderLaunchRoomList(Object.entries(receipt?.proofDelta || {}), ([key, item]) => "<li><strong>" + escapeHtml(key) + ": " + escapeHtml(item) + "</strong></li>") + "</article>" +
    "<article class=\"launch-room-card\"><span>Customer-controlled data path</span>" + renderLaunchRoomList(Object.entries(receipt?.customerControlledDataPath || {}), ([key, item]) => "<li><strong>" + escapeHtml(key) + ": " + escapeHtml(item) + "</strong></li>") + "</article>" +
    "<article class=\"launch-room-card\"><span>Support/refund posture</span>" + renderLaunchRoomList(Object.entries(receipt?.supportRefundPosture || {}), ([key, item]) => "<li><strong>" + escapeHtml(key) + ": " + escapeHtml(item) + "</strong></li>") + "</article>" +
    "<article class=\"launch-room-card\"><span>Source custody labels</span>" + renderLaunchRoomList(receipt?.sourceCustodyLabels || [], (item) => "<li><strong>" + escapeHtml(item) + "</strong></li>") + "</article>" +
    "<article class=\"launch-room-card\"><span>Unsupported receipt claims</span>" + renderLaunchRoomList(Object.entries(unsupportedClaims), ([key, item]) => "<li><strong>" + escapeHtml(key) + ": " + escapeHtml(item) + "</strong></li>") + "</article>";
}

function renderFirstLiveProofAuditCopilot(copilot) {
  const summaryNode = document.querySelector("#live-proof-audit-copilot-summary");
  const routeNode = document.querySelector("#live-proof-audit-copilot-route");
  const gridNode = document.querySelector("#live-proof-audit-copilot-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const sources = copilot?.consumedArtifacts || [];
  const script = copilot?.sessionScript || [];
  const selectedRoute = copilot?.selectedRoute || {};
  const blockedActions = copilot?.blockedExternalActions || {};
  const unsupportedClaims = copilot?.unsupportedClaims || {};

  text("#live-proof-audit-copilot-state", String(copilot?.state || copilot?.mode || "sample redacted only").replaceAll("_", " "));
  text(
    "#live-proof-audit-copilot-note",
    copilot?.note ||
      "Read-only local proof-audit copilot. It combines session script, proof checkpoints, consent/redaction, first blocking gate, paid-pilot cues, and one internal route while external action, payment/customer-data handling, public proof, downstream mutation, delegated done claims, and revenue claims remain blocked."
  );

  summaryNode.innerHTML = [
    ["Format", copilot?.format || "missing"],
    ["Sources", sources.length],
    ["Script steps", script.length],
    ["Checkpoints", (copilot?.proofAuditCheckpoints || []).length],
    ["Route options", (copilot?.routeOptions || []).length],
    ["Blocked actions", Object.keys(blockedActions).length],
  ]
    .map(([label, item]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(item)}</strong></article>`)
    .join("");

  routeNode.innerHTML = `
    <span>Exactly one copilot route</span>
    <strong>${escapeHtml(selectedRoute.suggestedOwner || "Owner / Product")} -> ${escapeHtml(selectedRoute.action || "open_private_paid_pilot_decision_room")}</strong>
    <p>${escapeHtml(selectedRoute.reason || "Selected route remains internal while live gates are closed.")}</p>
    <p>External action: ${selectedRoute.externalActionAllowed === false ? "blocked" : "check"}; queue mutation: ${
      selectedRoute.queueMutationAllowed === false ? "blocked" : "check"
    }; customer/payment handling: ${selectedRoute.paymentOrCustomerDataHandlingAllowed === false ? "blocked" : "check"}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Session script</span>
      ${renderLaunchRoomList(script, (step) => `<li><strong>${escapeHtml(step.label || step.stepId)}</strong><p>${escapeHtml(step.operatorPrompt || "")}</p></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Proof checkpoints</span>
      ${renderLaunchRoomList(copilot?.proofAuditCheckpoints || [], (item) => `<li><strong>${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Consent and redaction</span>
      ${renderLaunchRoomList(Object.entries(copilot?.consentRedactionState || {}), ([key, item]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Candidate-fit assumptions</span>
      ${renderLaunchRoomList(copilot?.candidateFitAssumptions?.assumptions || [], (item) => `<li><strong>${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>First blocking gate</span>
      <p>${escapeHtml(copilot?.firstBlockingGate?.reason || "Payment owner, support/refund, customer-data, and public-proof gates remain closed.")}</p>
      ${renderLaunchRoomList(copilot?.firstBlockingGate?.ownerEvidenceRequired || [], (field) => `<li><strong>${escapeHtml(field)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Paid-pilot cues</span>
      ${renderLaunchRoomList(copilot?.paidPilotReadinessCues || [], (item) => `<li><strong>${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Source artifacts</span>
      ${renderLaunchRoomList(sources, (source) => `<li><strong>${escapeHtml(source.id)}</strong><code>${escapeHtml(source.state || "observed")}</code><p>${sourceLink(source.path, source.path)}</p></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Unsupported claims</span>
      ${renderLaunchRoomList(Object.entries(unsupportedClaims), ([key, item]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(item)}</strong></li>`)}
    </article>
  `;
}

function renderLiveToPaidPilotDecisionRoom(room) {
  const summaryNode = document.querySelector("#live-to-paid-pilot-decision-summary");
  const routeNode = document.querySelector("#live-to-paid-pilot-decision-route");
  const gridNode = document.querySelector("#live-to-paid-pilot-decision-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const selectedRoute = room?.selectedRoute || (room?.routePackets || []).find((route) => route.selected) || {};
  const gates = room?.gateStates || [];
  const evidenceStates = room?.evidenceStates || [];
  const blockedActions = room?.blockedExternalActions || {};

  text("#live-to-paid-pilot-decision-state", String(room?.state || room?.mode || "sample decision only").replaceAll("_", " "));
  text(
    "#live-to-paid-pilot-decision-note",
    room?.note ||
      "Read-only live-to-paid-pilot decision room. It separates gates, evidence states, selected route, and blocked actions while checkout, payment/customer-data handling, provider mutation, downstream mutation, delegated done claims, and revenue claims remain blocked."
  );

  summaryNode.innerHTML = [
    ["Format", room?.format || "missing"],
    ["Gate states", gates.length],
    ["Evidence states", evidenceStates.length],
    ["Routes", (room?.routePackets || []).length],
    ["First blocker", (gates.find((gate) => gate.firstBlockingGate) || {}).label || "none"],
    ["Blocked actions", Object.keys(blockedActions).length],
  ]
    .map(([label, item]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(item)}</strong></article>`)
    .join("");

  routeNode.innerHTML = `
    <span>Exactly one paid-pilot decision route</span>
    <strong>${escapeHtml(selectedRoute.suggestedOwner || "Product Worker")} -> ${escapeHtml(selectedRoute.action || "repair_trust_and_missing_proof_before_paid_pilot_decision")}</strong>
    <p>${escapeHtml(selectedRoute.reason || "Repair trust and missing-proof gates before any paid pilot ask.")}</p>
    <p>External action: ${selectedRoute.externalActionAllowed === false ? "blocked" : "check"}; queue mutation: ${
      selectedRoute.queueMutationAllowed === false ? "blocked" : "check"
    }; customer/payment handling: ${selectedRoute.paymentOrCustomerDataHandlingAllowed === false ? "blocked" : "check"}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Gate states</span>
      ${renderLaunchRoomList(gates, (gate) => `<li><strong>${escapeHtml(gate.label || gate.gateId)}: ${escapeHtml(gate.state)}</strong><code>${gate.firstBlockingGate ? "first blocker" : "not first"}</code><p>${escapeHtml(gate.signal || "")}</p></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Evidence states</span>
      ${renderLaunchRoomList(evidenceStates, (state) => `<li><strong>${escapeHtml(state.label || state.id)}: ${escapeHtml(state.state)}</strong><code>claim ${state.claimAllowed === true ? "allowed" : "blocked"}</code></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Decision signals</span>
      ${renderLaunchRoomList(Object.entries(room?.decisionSignals || {}), ([key, item]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Source artifacts</span>
      ${renderLaunchRoomList(room?.consumedArtifacts || [], (source) => `<li><strong>${escapeHtml(source.id)}</strong><code>${escapeHtml(source.state || "observed")}</code><p>${sourceLink(source.path, source.path)}</p></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Route packets</span>
      ${renderLaunchRoomList(room?.routePackets || [], (route) => `<li><strong>${escapeHtml(route.selected ? "Selected" : "Option")}: ${escapeHtml(route.routeFamily)}</strong><p>${escapeHtml(route.action || "")}</p></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Blocked actions</span>
      ${renderLaunchRoomList(Object.entries(blockedActions), ([key, item]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(item)}</strong></li>`)}
    </article>
  `;
}

function renderLiveProofTrustGapRepairRoom(room) {
  const summaryNode = document.querySelector("#live-proof-trust-gap-repair-summary");
  const routeNode = document.querySelector("#live-proof-trust-gap-repair-route");
  const gridNode = document.querySelector("#live-proof-trust-gap-repair-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const selectedRoute = room?.selectedRoute || (room?.routePackets || []).find((route) => route.selected) || {};
  const objections = room?.trustPrivacyObjections || [];
  const custody = room?.proofSourceCustody || [];
  const missingProof = room?.missingProofPrompts || [];
  const stopStates = room?.stopStates || {};

  text("#live-proof-trust-gap-repair-state", String(room?.state || room?.mode || "sample repair only").replaceAll("_", " "));
  text(
    "#live-proof-trust-gap-repair-note",
    room?.note ||
      "Read-only live proof trust-gap repair room. It shows trust/privacy objections, proof custody, missing-proof prompts, owner-safe wording, and one selected route while customer-data handling, payment, provider action, public proof, downstream mutation, delegated done claims, and revenue claims remain blocked."
  );

  summaryNode.innerHTML = [
    ["Format", room?.format || "missing"],
    ["Decision route", room?.consumedDecisionRoute?.observedRouteId || "missing"],
    ["Objections", objections.length],
    ["Custody labels", custody.length],
    ["Missing-proof prompts", missingProof.length],
    ["Stops", Object.keys(stopStates).length],
  ]
    .map(([label, item]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(item)}</strong></article>`)
    .join("");

  routeNode.innerHTML = `
    <span>Exactly one trust repair route</span>
    <strong>${escapeHtml(selectedRoute.suggestedOwner || "Product Worker")} -> ${escapeHtml(selectedRoute.action || "repair_missing_proof_cues_after_trust_gap")}</strong>
    <p>${escapeHtml(selectedRoute.reason || "Repair missing-proof cues before any paid pilot ask.")}</p>
    <p>External action: ${selectedRoute.externalActionAllowed === false ? "blocked" : "check"}; queue mutation: ${
      selectedRoute.queueMutationAllowed === false ? "blocked" : "check"
    }; customer/payment handling: ${selectedRoute.paymentOrCustomerDataHandlingAllowed === false ? "blocked" : "check"}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Consumed decision route</span>
      <p>${escapeHtml(room?.consumedDecisionRoute?.requiredRouteId || "product_repair_before_paid_pilot_ask")}</p>
      <code>${escapeHtml(room?.consumedDecisionRoute?.state || "consumed_product_repair_route")}</code>
    </article>
    <article class="launch-room-card">
      <span>Trust and privacy objections</span>
      ${renderLaunchRoomList(objections, (item) => `<li><strong>${escapeHtml(item.label || item.objectionId)}</strong><p>${escapeHtml(item.repairCopy || "")}</p></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Proof-source custody</span>
      ${renderLaunchRoomList(custody, (item) => `<li><strong>${escapeHtml(item.sourceId)}: ${escapeHtml(item.state)}</strong><code>raw ${item.rawMaterialIncluded === false ? "excluded" : "check"}</code><p>${escapeHtml(item.custody || "")}</p></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Missing proof prompts</span>
      ${renderLaunchRoomList(missingProof, (item) => `<li><strong>${escapeHtml(item.label || item.promptId)}</strong><p>${escapeHtml(item.ownerSafePrompt || "")}</p></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Owner-safe wording</span>
      ${renderLaunchRoomList(room?.ownerSafeWording || [], (item) => `<li><strong>${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Stop states</span>
      ${renderLaunchRoomList(Object.entries(stopStates), ([key, item]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Route packets</span>
      ${renderLaunchRoomList(room?.routePackets || [], (route) => `<li><strong>${escapeHtml(route.selected ? "Selected" : "Option")}: ${escapeHtml(route.routeFamily)}</strong><p>${escapeHtml(route.action || "")}</p></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Blocked actions</span>
      ${renderLaunchRoomList(Object.entries(room?.blockedExternalActions || {}), ([key, item]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(item)}</strong></li>`)}
    </article>
  `;
}

function renderLiveProofMissingProofCueRepair(room) {
  const summaryNode = document.querySelector("#live-proof-missing-proof-cue-summary");
  const routeNode = document.querySelector("#live-proof-missing-proof-cue-route");
  const gridNode = document.querySelector("#live-proof-missing-proof-cue-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const selectedRoute = room?.selectedRoute || (room?.routePackets || []).find((route) => route.selected) || {};
  const gaps = room?.prioritizedProofGaps || [];
  const prompts = room?.ownerFacingFollowUpPrompts || [];

  text("#live-proof-missing-proof-cue-state", String(room?.state || room?.mode || "sample cue repair only").replaceAll("_", " "));
  text(
    "#live-proof-missing-proof-cue-note",
    room?.note ||
      "Read-only missing-proof cue repair. It ranks proof gaps by value, claim risk, owner follow-up ease, and paid-pilot relevance while external sends, customer-data handling, payment, public proof, downstream mutation, delegated done claims, and revenue claims remain blocked."
  );

  summaryNode.innerHTML = [
    ["Format", room?.format || "missing"],
    ["Trust route", room?.consumedTrustRepairRoute?.observedRouteId || "missing"],
    ["Proof gaps", gaps.length],
    ["Prompts", prompts.length],
    ["Routes", (room?.routePackets || []).length],
    ["Top gap", gaps[0]?.label || "none"],
  ]
    .map(([label, item]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(item)}</strong></article>`)
    .join("");

  routeNode.innerHTML = `
    <span>Exactly one missing-proof cue route</span>
    <strong>${escapeHtml(selectedRoute.suggestedOwner || "Business Operator")} -> ${escapeHtml(selectedRoute.action || "prepare_no_send_missing_proof_follow_up")}</strong>
    <p>${escapeHtml(selectedRoute.reason || "Prepare no-send category prompts before any paid pilot ask.")}</p>
    <p>External action: ${selectedRoute.externalActionAllowed === false ? "blocked" : "check"}; queue mutation: ${
      selectedRoute.queueMutationAllowed === false ? "blocked" : "check"
    }; customer/payment handling: ${selectedRoute.paymentOrCustomerDataHandlingAllowed === false ? "blocked" : "check"}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Priority model</span>
      ${renderLaunchRoomList(Object.entries(room?.priorityModel || {}), ([key, item]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(Array.isArray(item) ? item.join(", ") : item)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Prioritized proof gaps</span>
      ${renderLaunchRoomList(gaps, (gap) => `<li><strong>${escapeHtml(gap.label || gap.gapId)}: ${escapeHtml(gap.priorityScore)}</strong><p>${escapeHtml(gap.safeFollowUpPrompt || "")}</p></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Owner follow-up prompts</span>
      ${renderLaunchRoomList(prompts, (prompt) => `<li><strong>${escapeHtml(prompt.requestType || "proof category")}</strong><p>${escapeHtml(prompt.prompt || "")}</p></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Route packets</span>
      ${renderLaunchRoomList(room?.routePackets || [], (route) => `<li><strong>${escapeHtml(route.selected ? "Selected" : "Option")}: ${escapeHtml(route.routeFamily)}</strong><p>${escapeHtml(route.action || "")}</p></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Blocked actions</span>
      ${renderLaunchRoomList(Object.entries(room?.blockedExternalActions || {}), ([key, item]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(item)}</strong></li>`)}
    </article>
  `;
}

function renderPaidPilotTrustGapRepairLab(lab) {
  const summaryNode = document.querySelector("#paid-pilot-trust-gap-lab-summary");
  const routeNode = document.querySelector("#paid-pilot-trust-gap-lab-route");
  const gridNode = document.querySelector("#paid-pilot-trust-gap-lab-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const selectedRoute = lab?.selectedRoute || (lab?.routePackets || []).find((route) => route.selected) || {};
  text("#paid-pilot-trust-gap-lab-state", String(lab?.state || lab?.mode || "sample close rehearsal only").replaceAll("_", " "));
  text(
    "#paid-pilot-trust-gap-lab-note",
    lab?.note ||
      "Read-only paid pilot trust gap repair lab. It rehearses no-send trust objection responses while checkout, payment, customer data, provider action, public proof, downstream mutation, delegated done claims, and revenue claims remain blocked."
  );

  summaryNode.innerHTML = [
    ["Format", lab?.format || "missing"],
    ["Sources", (lab?.consumedArtifacts || []).length],
    ["Proof gaps", (lab?.proofStrengthGaps || []).length],
    ["Prompts", (lab?.operatorSafeRepairPrompts || []).length],
    ["Disqualifiers", (lab?.disqualifiers || []).length],
    ["Routes", (lab?.routePackets || []).length],
  ]
    .map(([label, item]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(item)}</strong></article>`)
    .join("");

  routeNode.innerHTML = `
    <span>Exactly one paid-pilot trust route</span>
    <strong>${escapeHtml(selectedRoute.suggestedOwner || "Business Operator")} -> ${escapeHtml(selectedRoute.action || "prepare_no_send_paid_pilot_trust_objection_response")}</strong>
    <p>${escapeHtml(selectedRoute.reason || "Prepare no-send trust objection response before any paid pilot ask.")}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Proof-strength gaps</span>
      ${renderLaunchRoomList(lab?.proofStrengthGaps || [], (gap) => `<li><strong>${escapeHtml(gap.gapId)}: ${escapeHtml(gap.state)}</strong><p>${escapeHtml(gap.prompt || "")}</p></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Safe repair prompts</span>
      ${renderLaunchRoomList(lab?.operatorSafeRepairPrompts || [], (prompt) => `<li><strong>${escapeHtml(prompt)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Disqualifiers</span>
      ${renderLaunchRoomList(lab?.disqualifiers || [], (item) => `<li><strong>${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Route packets</span>
      ${renderLaunchRoomList(lab?.routePackets || [], (route) => `<li><strong>${escapeHtml(route.selected ? "Selected" : "Option")}: ${escapeHtml(route.routeFamily)}</strong><p>${escapeHtml(route.action || "")}</p></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Blocked actions</span>
      ${renderLaunchRoomList(Object.entries(lab?.blockedExternalActions || {}), ([key, item]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(item)}</strong></li>`)}
    </article>
  `;
}

function renderProofDeltaValueSnapshot(snapshot) {
  const summaryNode = document.querySelector("#proof-delta-value-summary");
  const routeNode = document.querySelector("#proof-delta-value-route");
  const gridNode = document.querySelector("#proof-delta-value-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const selectedRoute = snapshot?.selectedRoute || (snapshot?.routePackets || []).find((route) => route.selected) || {};
  text("#proof-delta-value-state", String(snapshot?.state || snapshot?.mode || "sample snapshot only").replaceAll("_", " "));
  text("#proof-delta-value-note", snapshot?.note || "Read-only sample proof delta. Live feedback, willingness-to-pay, payment intent, payment, public proof, referral/testimonial, and revenue states remain absent.");
  summaryNode.innerHTML = [
    ["Format", snapshot?.format || "missing"],
    ["Deltas", (snapshot?.proofDeltas || []).length],
    ["Evidence states", Object.keys(snapshot?.evidenceStates || {}).length],
    ["Boundaries", (snapshot?.paidPilotScopeBoundaries || []).length],
    ["Routes", (snapshot?.routePackets || []).length],
  ].map(([label, item]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(item)}</strong></article>`).join("");
  routeNode.innerHTML = `<span>Exactly one proof-delta route</span><strong>${escapeHtml(selectedRoute.suggestedOwner || "Business Operator")} -> ${escapeHtml(selectedRoute.action || "prepare_no_send_proof_delta_follow_up")}</strong><p>${escapeHtml(selectedRoute.reason || "No-send follow-up only.")}</p>`;
  gridNode.innerHTML = `
    <article class="launch-room-card"><span>Proof deltas</span>${renderLaunchRoomList(snapshot?.proofDeltas || [], (delta) => `<li><strong>${escapeHtml(delta.deltaId)}: proof ${escapeHtml(delta.proofStrength)}</strong><p>${escapeHtml(delta.before || "")} -> ${escapeHtml(delta.after || "")}</p><code>${escapeHtml(delta.sourceLabel || "")}</code></li>`)}</article>
    <article class="launch-room-card"><span>Evidence states</span>${renderLaunchRoomList(Object.entries(snapshot?.evidenceStates || {}), ([key, item]) => `<li><strong>${escapeHtml(key)}: ${escapeHtml(item)}</strong></li>`)}</article>
    <article class="launch-room-card"><span>Paid-pilot boundaries</span>${renderLaunchRoomList(snapshot?.paidPilotScopeBoundaries || [], (item) => `<li><strong>${escapeHtml(item)}</strong></li>`)}</article>
    <article class="launch-room-card"><span>Route packets</span>${renderLaunchRoomList(snapshot?.routePackets || [], (route) => `<li><strong>${escapeHtml(route.selected ? "Selected" : "Option")}: ${escapeHtml(route.routeFamily)}</strong><p>${escapeHtml(route.action || "")}</p></li>`)}</article>
  `;
}

function renderFirstAuthorizedSessionRunner(runnerState) {
  const summaryNode = document.querySelector("#authorized-session-summary");
  const routeNode = document.querySelector("#authorized-session-route");
  const gridNode = document.querySelector("#authorized-session-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const runner = runnerState?.runner || {};
  const context = runner.sessionContext || {};
  const valueReceipt = runner.valueReceipt || {};
  const paidPacket = runner.paidPacketReadiness || {};
  const objection = runner.objectionCapture || {};
  const selectedRoute = (runner.nextRoutes || []).find((route) => route.selected) || {};
  const blockedGates = runner.blockedGates || [];
  const sourceArtifacts = runnerState?.sourceArtifacts || [];

  text("#authorized-session-state", String(runner.state || "local sample only").replaceAll("_", " "));
  text(
    "#authorized-session-note",
    runnerState?.note ||
      "Local/admin sample runner only. It cannot store raw resumes, send outreach, schedule sessions, collect payment, publish proof, run analytics, or submit applications."
  );

  summaryNode.innerHTML = [
    ["Target role", context.targetRole || "sample"],
    ["Steps", (runner.runSteps || []).length],
    ["Missing proof", valueReceipt.missingProofQuestionCount || 0],
    ["Blocked gates", blockedGates.length],
    ["Routes", (runner.nextRoutes || []).length],
    ["Sources", sourceArtifacts.length],
  ]
    .map(
      ([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");

  routeNode.innerHTML = `
    <span>Exactly one next route</span>
    <strong>${escapeHtml(selectedRoute.target || "no_queue_action")} -> ${escapeHtml(selectedRoute.action || "no_queue_action")}</strong>
    <p>External action: ${selectedRoute.externalActionAllowed === false ? "blocked" : "check"}; queue mutation: ${
      selectedRoute.queueMutationAllowed === false ? "blocked" : "check"
    }</p>
    <p>${escapeHtml(runnerState?.selectedRouteReason || "Selected because sample value is inspectable while live gates remain blocked.")}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Run steps</span>
      ${renderLaunchRoomList(
        runner.runSteps,
        (step) => `
          <li>
            <strong>${escapeHtml(step.label || step.stepId)}</strong>
            <code>${step.externalActionAllowed === false ? "external blocked" : "check"}</code>
            <p>${escapeHtml(step.operatorAction || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Value receipt</span>
      <ul class="launch-room-list">
        <li>
          <strong>${escapeHtml(valueReceipt.receiptId || "sample receipt")}</strong>
          <code>${escapeHtml(context.candidateContextMode || "sample_redacted")}</code>
          <p>Proof-backed changes: ${escapeHtml(valueReceipt.proofBackedChangeCount || 0)}</p>
          <p>Approval tracking visible: ${valueReceipt.approvalTrackingVisible ? "yes" : "check"}</p>
        </li>
      </ul>
    </article>
    <article class="launch-room-card">
      <span>Paid packet readiness</span>
      <ul class="launch-room-list">
        <li>
          <strong>${escapeHtml(paidPacket.state || "private preview")}</strong>
          <code>checkout ${paidPacket.checkoutAllowed === false ? "blocked" : "check"}</code>
          <p>Sections: ${escapeHtml((paidPacket.sections || []).join(", "))}</p>
        </li>
      </ul>
    </article>
    <article class="launch-room-card">
      <span>Objection capture</span>
      <ul class="launch-room-list">
        <li>
          <strong>${escapeHtml(objection.selectedLabel || "none")}</strong>
          <code>${escapeHtml(objection.state || "safe labels only")}</code>
          <p>Raw reply accepted: ${objection.rawReplyAccepted === false ? "no" : "check"}</p>
        </li>
      </ul>
    </article>
    <article class="launch-room-card">
      <span>Blocked gates</span>
      ${renderLaunchRoomList(blockedGates, (gate) => `<li><strong>${escapeHtml(gate)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Source artifacts</span>
      ${renderLaunchRoomList(
        sourceArtifacts,
        (artifact) => `
          <li>
            <strong>${escapeHtml(artifact.id)}</strong>
            <code>${escapeHtml(artifact.state || "observed")}</code>
            <p>${sourceLink(artifact.path, artifact.path)}</p>
          </li>
        `
      )}
    </article>
  `;
}

function renderFirstCustomerPilotConsole(consoleState) {
  const summaryNode = document.querySelector("#pilot-console-summary");
  const routeNode = document.querySelector("#pilot-console-route");
  const gridNode = document.querySelector("#pilot-console-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const pilot = consoleState?.pilotConsole || {};
  const context = pilot.candidateContext || {};
  const valueReceipt = pilot.valueReceipt || {};
  const objection = pilot.objectionCapture || {};
  const selectedRoute = (pilot.routeCases || []).find((route) => route.selected) || {};
  const blockedGates = pilot.blockedGates || [];
  const sourceArtifacts = consoleState?.sourceArtifacts || [];

  text("#pilot-console-state", String(pilot.state || "local sample only").replaceAll("_", " "));
  text(
    "#pilot-console-note",
    consoleState?.note ||
      "Local/admin sample pilot console only. It cannot store raw resumes, send outreach, schedule sessions, collect payment, publish proof, run analytics, or submit applications."
  );

  summaryNode.innerHTML = [
    ["Target role", context.targetRole || "sample"],
    ["Modes", (pilot.custodyModes || []).length],
    ["Steps", (pilot.proofLoopSteps || []).length],
    ["Missing proof", valueReceipt.missingProofQuestionCount || 0],
    ["Blocked gates", blockedGates.length],
    ["Fail-closed cases", (pilot.failClosedCases || []).length],
    ["Sources", sourceArtifacts.length],
  ]
    .map(
      ([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");

  routeNode.innerHTML = `
    <span>Exactly one pilot route</span>
    <strong>${escapeHtml(selectedRoute.target || "no_queue_action")} -> ${escapeHtml(selectedRoute.action || "no_queue_action")}</strong>
    <p>External action: ${selectedRoute.externalActionAllowed === false ? "blocked" : "check"}; queue mutation: ${
      selectedRoute.queueMutationAllowed === false ? "blocked" : "check"
    }</p>
    <p>${escapeHtml(consoleState?.selectedRouteReason || "Selected because sample value is inspectable while live gates remain blocked.")}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Custody modes</span>
      ${renderLaunchRoomList(
        pilot.custodyModes,
        (mode) => `
          <li>
            <strong>${escapeHtml(mode.label || mode.modeId)}</strong>
            <code>${mode.accepted ? "accepted" : "blocked"}</code>
            <p>Raw material accepted: ${mode.rawMaterialAccepted === false ? "no" : "check"}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Proof loop</span>
      ${renderLaunchRoomList(
        pilot.proofLoopSteps,
        (step) => `
          <li>
            <strong>${escapeHtml(step.label || step.stepId)}</strong>
            <code>${step.externalActionAllowed === false ? "external blocked" : "check"}</code>
            <p>${escapeHtml(step.operatorAction || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Value receipt</span>
      <ul class="launch-room-list">
        <li>
          <strong>${escapeHtml(valueReceipt.receiptId || "sample receipt")}</strong>
          <code>${escapeHtml(valueReceipt.resultExportState || "sample export")}</code>
          <p>Proof-backed changes: ${escapeHtml(valueReceipt.proofBackedChangeCount || 0)}</p>
          <p>Repair state: ${escapeHtml(valueReceipt.repairTranslatorState || "sample repair")}</p>
          <p>Approval tracking visible: ${valueReceipt.approvalTrackingVisible ? "yes" : "check"}</p>
        </li>
      </ul>
    </article>
    <article class="launch-room-card">
      <span>Objection capture</span>
      <ul class="launch-room-list">
        <li>
          <strong>${escapeHtml(objection.selectedLabel || "none")}</strong>
          <code>${escapeHtml(objection.state || "safe labels only")}</code>
          <p>Raw reply accepted: ${objection.rawReplyAccepted === false ? "no" : "check"}</p>
        </li>
      </ul>
    </article>
    <article class="launch-room-card">
      <span>Fail-closed cases</span>
      ${renderLaunchRoomList(
        pilot.failClosedCases,
        (item) => `
          <li>
            <strong>${escapeHtml(item.caseId)}</strong>
            <code>${escapeHtml(item.routeFamily || "route")}</code>
            <p>${escapeHtml(item.reason || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Blocked gates</span>
      ${renderLaunchRoomList(blockedGates, (gate) => `<li><strong>${escapeHtml(gate)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Source artifacts</span>
      ${renderLaunchRoomList(
        sourceArtifacts,
        (artifact) => `
          <li>
            <strong>${escapeHtml(artifact.id)}</strong>
            <code>${escapeHtml(artifact.state || "observed")}</code>
            <p>${sourceLink(artifact.path, artifact.path)}</p>
          </li>
        `
      )}
    </article>
  `;
}

function renderFirstCustomerPilotRevenueSimulator(simulatorState) {
  const summaryNode = document.querySelector("#pilot-revenue-summary");
  const routeNode = document.querySelector("#pilot-revenue-route");
  const gridNode = document.querySelector("#pilot-revenue-grid");
  if (!summaryNode || !routeNode || !gridNode) return;

  const simulator = simulatorState?.simulator || {};
  const price = simulator.priceExperiment || {};
  const readiness = simulator.revenueReadiness || {};
  const selectedScenario = (simulator.sampleScenarios || []).find((scenario) => scenario.selected) || {};
  const blockedGates = simulator.blockedGates || [];
  const sourceArtifacts = simulatorState?.sourceArtifacts || [];

  text("#pilot-revenue-state", String(simulator.state || "no checkout").replaceAll("_", " "));
  text(
    "#pilot-revenue-note",
    simulatorState?.note ||
      "Local/admin sample revenue simulator only. It cannot display payment links, collect payment, accept customer materials, claim demand, publish proof, or mutate queues."
  );

  summaryNode.innerHTML = [
    ["Selected price", price.selectedSamplePriceUsd ? `$${price.selectedSamplePriceUsd}` : "blocked"],
    ["Price cap", price.authorizedCapUsd ? `$${price.authorizedCapUsd}` : "check"],
    ["Scenarios", (simulator.sampleScenarios || []).length],
    ["Route families", (simulator.routeFamilies || []).length],
    ["Blocked gates", blockedGates.length],
    ["Sources", sourceArtifacts.length],
  ]
    .map(
      ([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");

  routeNode.innerHTML = `
    <span>Exactly one revenue route</span>
    <strong>${escapeHtml(selectedScenario.route?.target || "no_action")} -> ${escapeHtml(
      selectedScenario.route?.action || "no_action"
    )}</strong>
    <p>Payment link: ${price.paymentLinkAllowed === false ? "blocked" : "check"}; checkout: ${
      price.displayAsCheckoutAllowed === false ? "blocked" : "check"
    }; collection: ${price.paymentCollectionAllowed === false ? "blocked" : "check"}</p>
    <p>${escapeHtml(simulatorState?.selectedRouteReason || selectedScenario.route?.reason || "No live paid motion is authorized.")}</p>
  `;

  gridNode.innerHTML = `
    <article class="launch-room-card">
      <span>Price experiment</span>
      <ul class="launch-room-list">
        <li>
          <strong>${escapeHtml(price.offerLabel || "Target Job Proof Packet")}</strong>
          <code>${escapeHtml(price.currency || "USD")}</code>
          <p>Candidate prices: ${escapeHtml((price.candidatePricesUsd || []).map((amount) => `$${amount}`).join(", "))}</p>
          <p>Willingness-to-pay evidence: ${price.willingnessToPayEvidence === false ? "no" : "check"}</p>
          <p>Revenue evidence: ${price.revenueEvidence === false ? "no" : "check"}</p>
        </li>
      </ul>
    </article>
    <article class="launch-room-card">
      <span>Readiness gates</span>
      <ul class="launch-room-list">
        <li>
          <strong>Paid packet value</strong>
          <code>${readiness.paidPacketValueVisible ? "visible" : "check"}</code>
          <p>Proof-backed changes: ${escapeHtml(readiness.proofBackedChangeCount || 0)}</p>
          <p>Missing proof questions: ${escapeHtml(readiness.missingProofQuestionCount || 0)}</p>
          <p>Live paid motion: ${readiness.livePaidMotionAllowed === false ? "blocked" : "check"}</p>
        </li>
      </ul>
    </article>
    <article class="launch-room-card">
      <span>Scenario routes</span>
      ${renderLaunchRoomList(
        simulator.sampleScenarios,
        (scenario) => `
          <li>
            <strong>${escapeHtml(scenario.label || scenario.scenarioId)}</strong>
            <code>${scenario.selected ? "selected" : escapeHtml(scenario.route?.family || "route")}</code>
            <p>${escapeHtml(scenario.route?.action || "")}</p>
            <p>${escapeHtml(scenario.route?.reason || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="launch-room-card">
      <span>Blocked gates</span>
      ${renderLaunchRoomList(blockedGates, (gate) => `<li><strong>${escapeHtml(gate)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Forbidden outcomes</span>
      ${renderLaunchRoomList(simulator.forbiddenOutcomes, (item) => `<li><strong>${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="launch-room-card">
      <span>Source artifacts</span>
      ${renderLaunchRoomList(
        sourceArtifacts,
        (artifact) => `
          <li>
            <strong>${escapeHtml(artifact.id)}</strong>
            <code>${escapeHtml(artifact.state || "observed")}</code>
            <p>${sourceLink(artifact.path, artifact.path)}</p>
          </li>
        `
      )}
    </article>
  `;
}

function renderConsentedAuditHandoffPreview(preview) {
  const summaryNode = document.querySelector("#consented-audit-summary");
  const gridNode = document.querySelector("#consented-audit-grid");
  if (!summaryNode || !gridNode) return;

  text("#consented-audit-handoff-state", preview?.readyForManualShare ? "Manual review ready" : "Consent review required");
  text(
    "#consented-audit-handoff-note",
    preview?.note ||
      "Local manual-share preview only. It cannot send, schedule, collect payment, publish proof, run analytics, upload data, or submit applications."
  );

  const checks = preview?.consentAndApprovalChecks || [];
  const custody = preview?.evidenceCustody || [];
  const blocked = preview?.blockedActions || [];

  summaryNode.innerHTML = [
    ["Checks", checks.length],
    ["Ready checks", checks.filter((check) => check.ready === true).length],
    ["Custody rules", custody.length],
    ["Blocked actions", blocked.length],
    ["External actions", preview?.externalActionAllowed === false ? 0 : "check"],
  ]
    .map(
      ([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");

  gridNode.innerHTML = `
    <article class="consented-audit-card">
      <span>Consent and approval checks</span>
      ${renderLaunchRoomList(
        checks,
        (check) => `
          <li>
            <strong>${escapeHtml(check.label || check.id)}</strong>
            <code>${escapeHtml(check.state || "unknown")}</code>
            <p>${escapeHtml(check.detail || "")}</p>
          </li>
        `
      )}
    </article>
    <article class="consented-audit-card">
      <span>Custody and redaction</span>
      ${renderLaunchRoomList(custody, (item) => `<li><strong>${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="consented-audit-card">
      <span>Blocked actions</span>
      ${renderLaunchRoomList(blocked, (item) => `<li><strong>${escapeHtml(item)}</strong></li>`)}
    </article>
    <article class="consented-audit-card">
      <span>Candidate-visible next step</span>
      <strong>${escapeHtml(preview?.candidateVisibleNextStep || "Complete consent and approval checks before manual sharing.")}</strong>
      <p>${escapeHtml(preview?.sourcePattern || "website/app.html#consented-audit-handoff")}</p>
    </article>
  `;
}

function renderConciergeFulfillmentDashboard(dashboard) {
  const summaryGrid = document.querySelector("#concierge-summary-grid");
  const caseList = document.querySelector("#concierge-case-list");
  if (!summaryGrid || !caseList) return;

  const summary = dashboard?.summary || {};
  text("#concierge-fulfillment-state", String(summary.state || "Local only").replaceAll("_", " "));
  text(
    "#concierge-fulfillment-summary",
    summary.note ||
      "Manual fulfillment status is local-only and cannot collect payment, store production customer data, send deliverables, or create provider actions."
  );

  const summaryItems = [
    ["Cases", summary.cases || 0],
    ["QA review", summary.qaReview || 0],
    ["Ready to deliver", summary.readyToDeliver || 0],
    ["Blocked controls", summary.blockedControls || 0],
  ];
  summaryGrid.innerHTML = summaryItems
    .map(
      ([label, value]) => `
        <article class="concierge-summary-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");

  const controls = dashboard?.controls || {};
  const checklist = dashboard?.checklist || [];
  const cases = dashboard?.cases || [];
  caseList.innerHTML = `
    <article class="concierge-case-card">
      <div class="concierge-case-head">
        <div>
          <span>Control boundary</span>
          <strong>Live fulfillment disabled</strong>
        </div>
        <code>${escapeHtml(dashboard?.sourcePattern || "commons/templates/concierge-fulfillment")}</code>
      </div>
      <div class="concierge-control-grid">
        <p><strong>Payment:</strong> ${escapeHtml(controls.paymentCollectionStatus || "unknown")}</p>
        <p><strong>Customer data:</strong> ${escapeHtml(controls.customerDataStatus || "unknown")}</p>
        <p><strong>Delivery/follow-up:</strong> ${escapeHtml(controls.outboundOutreachStatus || "unknown")}</p>
        <p><strong>Provider actions:</strong> ${dashboard?.providerActionsEnabled ? "enabled" : "disabled"}</p>
      </div>
    </article>
    <article class="concierge-case-card">
      <div class="concierge-case-head">
        <div>
          <span>Operator checklist</span>
          <strong>First paid Target Job Proof Packet</strong>
        </div>
      </div>
      <ul class="concierge-checklist">
        ${checklist
          .map(
            (item) => `
              <li>
                <span>${escapeHtml(item.status || "unknown")}</span>
                <strong>${escapeHtml(item.label || item.id)}</strong>
                <code>${escapeHtml(item.controlId || "local")}</code>
              </li>
            `
          )
          .join("")}
      </ul>
    </article>
    ${
      cases.length
        ? cases
            .map(
              (item) => `
                <article class="concierge-case-card">
                  <div class="concierge-case-head">
                    <div>
                      <span>${escapeHtml(item.caseId)}</span>
                      <strong>${escapeHtml(item.label)}</strong>
                    </div>
                    <code>${escapeHtml(item.packetStatus || "unknown")}</code>
                  </div>
                  <div class="concierge-case-fields">
                    <p><strong>Consent:</strong> ${escapeHtml(item.consentState)}</p>
                    <p><strong>Materials:</strong> ${escapeHtml(item.materialsReceived)}</p>
                    <p><strong>Target job:</strong> ${escapeHtml(item.targetJob)}</p>
                    <p><strong>Refund/support:</strong> ${escapeHtml(item.refundSupportStatus)}</p>
                    <p><strong>Follow-up:</strong> ${escapeHtml(item.followUpOutcome)}</p>
                  </div>
                  <p>${escapeHtml(item.fulfillmentNotes)}</p>
                  <p><strong>Next:</strong> ${escapeHtml(item.nextAction)}</p>
                  ${item.source ? `<p>${sourceLink(item.source, "Source packet")}</p>` : ""}
                </article>
              `
            )
            .join("")
        : `<article class="empty-card">No local concierge fulfillment cases are recorded.</article>`
    }
  `;
}

function renderStaleQueueGuardrails(guardrails) {
  const panel = document.querySelector("#stale-queue-guardrail");
  if (!panel) return;

  const items = guardrails?.items || [];
  if (!items.length) {
    panel.innerHTML = `<article class="stale-queue-card is-clear">
      <span>Stale queue guardrails</span>
      <strong>No shipped matches in active queue</strong>
      <p>Completed pass/report evidence did not match any active backlog assignment.</p>
    </article>`;
    return;
  }

  panel.innerHTML = `
    <article class="stale-queue-card">
      <div>
        <span>Stale queue guardrails</span>
        <strong>${escapeHtml(items.length)} active item${items.length === 1 ? "" : "s"} may already be shipped</strong>
      </div>
      <div class="stale-queue-list">
        ${items
          .map(
            (item) => `
              <section>
                <small>${escapeHtml(item.owner)} | ${escapeHtml(item.priority)}</small>
                <p>${escapeHtml(item.task)}</p>
                ${(item.matches || [])
                  .map((match) => `<code>${escapeHtml(match.report)}</code>`)
                  .join("")}
              </section>
            `
          )
          .join("")}
      </div>
    </article>
  `;
}

function renderQueueRefreshDecisionInput(decisionInput) {
  const panel = document.querySelector("#queue-refresh-decision");
  if (!panel) return;

  const safeToClose = decisionInput?.safeToClose || [];
  const keepActive = decisionInput?.keepActive || [];
  const sources = decisionInput?.generatedFrom || [];
  const readiness = decisionInput?.closeReadiness || {};

  panel.innerHTML = `
    ${renderQueueCloseReadinessBanner(readiness)}
    ${renderFollowupEvidenceVisibility(decisionInput?.followupEvidenceVisibility)}
    ${renderStructuredExtractionVisibility(decisionInput?.structuredExtractionVisibility)}
    ${renderReplyFactReadiness(decisionInput?.replyFactReadiness)}
    ${renderCalendarAppointmentReadiness(decisionInput?.calendarAppointmentReadiness)}
    ${renderSessionStartReadiness(decisionInput?.sessionStartReadiness)}
    ${renderRawNoteCaptureReadiness(decisionInput?.rawNoteCaptureReadiness)}
    ${renderPostSessionDebriefReadiness(decisionInput?.postSessionDebriefReadiness)}
    ${renderObjectionCodingReadiness(decisionInput?.objectionCodingReadiness)}
    ${renderFiveSessionSynthesisReadiness(decisionInput?.fiveSessionSynthesisReadiness)}
    ${renderSynthesisArtifactVisibility(decisionInput?.synthesisArtifactVisibility)}
    ${renderSynthesisDecisionMemoVisibility(decisionInput?.synthesisDecisionMemoVisibility)}
    ${renderLaunchDecisionApprovalVisibility(decisionInput?.launchDecisionApprovalVisibility)}
    ${renderPublishReadinessVisibility(decisionInput?.publishReadinessVisibility)}
    ${renderExplicitPublishPlanVisibility(decisionInput?.explicitPublishPlanVisibility)}
    ${renderStaticDeployRehearsalVisibility(decisionInput?.staticDeployRehearsalVisibility)}
    ${renderReleaseCandidateRehearsalVisibility(decisionInput?.releaseCandidateRehearsalVisibility)}
    ${renderCredentialedDeployBlockerVisibility(decisionInput?.credentialedDeployBlockerVisibility)}
    ${renderPlatformOwnerHandoffVisibility(decisionInput?.platformOwnerHandoffVisibility)}
    ${renderPostDeployHealthOwnerHandoffVisibility(decisionInput?.postDeployHealthOwnerHandoffVisibility)}
    ${renderFinalDeployGoNoGoLedgerVisibility(decisionInput?.finalDeployGoNoGoLedgerVisibility)}
    ${renderDeployBlockerEscalationMemoVisibility(decisionInput?.deployBlockerEscalationMemoVisibility)}
    ${renderFirstHumanOperatorDeployPacketIndexVisibility(decisionInput?.firstHumanOperatorDeployPacketIndexVisibility)}
    ${renderOperatorDryRunReviewChecklistVisibility(decisionInput?.operatorDryRunReviewChecklistVisibility)}
    ${renderFirstHumanPacketColdStartArchiveVisibility(decisionInput?.firstHumanPacketColdStartArchiveVisibility)}
    ${renderReleaseCandidateDeployContinuationMapVisibility(decisionInput?.releaseCandidateDeployContinuationMapVisibility)}
    ${renderExternalInputBoundaryLedgerVisibility(decisionInput?.externalInputBoundaryLedgerVisibility)}
    ${renderPlatformOwnerNonRequestTransferNoteVisibility(decisionInput?.platformOwnerNonRequestTransferNoteVisibility)}
    ${renderOperatorResumePacketGuardrailVisibility(decisionInput?.operatorResumePacketGuardrailVisibility)}
    ${renderBlockedStateOperatorContinuationIndexVisibility(decisionInput?.blockedStateOperatorContinuationIndexVisibility)}
    ${renderAutonomousDeployStopLedgerVisibility(decisionInput?.autonomousDeployStopLedgerVisibility)}
    ${renderPostAutonomousStopRecoveryChecklistVisibility(decisionInput?.postAutonomousStopRecoveryChecklistVisibility)}
    ${renderHumanPlatformAuthorityReEntryGateVisibility(decisionInput?.humanPlatformAuthorityReEntryGateVisibility)}
    ${renderOutsideAuthorityAwaitingStateLedgerVisibility(decisionInput?.outsideAuthorityAwaitingStateLedgerVisibility)}
    <article class="queue-refresh-card">
      <div class="queue-refresh-head">
        <div>
          <span>Next queue refresh</span>
          <strong>${escapeHtml(safeToClose.length)} safe to close, ${escapeHtml(keepActive.length)} keep active</strong>
        </div>
        <small>${sources.length ? `Derived from ${escapeHtml(sources.join(", "))}` : "Derived from current admin data"}</small>
      </div>
      <div class="queue-refresh-columns">
        <section>
          <h3>Safe to close</h3>
          ${
            safeToClose.length
              ? safeToClose.map(renderQueueRefreshDecision).join("")
              : `<div class="empty-card">No active rows have strong shipped evidence yet.</div>`
          }
        </section>
        <section>
          <h3>Keep active</h3>
          ${
            keepActive.length
              ? keepActive.map(renderQueueRefreshDecision).join("")
              : `<div class="empty-card">No unmatched active rows remain.</div>`
          }
        </section>
      </div>
    </article>
    ${renderCloseMatcherTrendDiagnostics(decisionInput?.closeMatcherTrendDiagnostics)}
  `;
}

function renderStaticDeployRehearsalVisibility(visibility) {
  if (!visibility) return "";
  const steps = visibility.steps || [];
  const limitations = visibility.limitations || [];
  const blockers = visibility.blockers || [];
  const routeEvidence = visibility.routeEvidence || [];
  const guardrails = visibility.noDeployGuardrails || {};
  return `
    <article class="static-deploy-rehearsal-card ${escapeHtml(visibility.state || "not-run")}">
      <div class="static-deploy-rehearsal-head">
        <div>
          <span>Private static deploy rehearsal</span>
          <strong>${escapeHtml(visibility.stateLabel || visibility.state || "Not run")}</strong>
        </div>
        <small>${escapeHtml(visibility.checkedAt ? `Checked at ${visibility.checkedAt}` : "No report recorded yet")}</small>
      </div>
      <div class="static-deploy-rehearsal-counts">
        ${renderStaticDeployRehearsalCount("Not run", visibility.stateCounts?.notRun || 0)}
        ${renderStaticDeployRehearsalCount("Passed local", visibility.stateCounts?.passedLocal || 0)}
        ${renderStaticDeployRehearsalCount("Blocked no credentials", visibility.stateCounts?.blockedNoCredentials || 0)}
      </div>
      <div class="static-deploy-rehearsal-meta">
        <section>
          <span>Mode</span>
          <p>${escapeHtml(visibility.mode || "unknown")}</p>
        </section>
        <section>
          <span>Evidence</span>
          <p>${escapeHtml(visibility.reportPath || "ops/reports/static-deploy-rehearsal/latest.json")}</p>
        </section>
        <section>
          <span>Boundary</span>
          <p>Do Not Deploy. No platform credentials, production URL, or deploy trigger.</p>
        </section>
        <section>
          <span>Credential inputs</span>
          <p>${escapeHtml(guardrails.credentialInputsConsumed ? "Unexpected credential input marker" : "Not present in repo evidence")}</p>
        </section>
      </div>
      ${
        steps.length
          ? `<div class="static-deploy-rehearsal-steps">
              ${steps
                .map(
                  (step) => `
                    <section class="${escapeHtml(step.ok ? "ok" : "blocked")}">
                      <span>${escapeHtml(step.label)}</span>
                      <strong>${escapeHtml(step.ok ? "Pass" : "Fail")}</strong>
                    </section>
                  `
                )
                .join("")}
            </div>`
          : `<div class="empty-card">Run <code>npm run static-deploy-rehearsal</code> to generate the local-only report.</div>`
      }
      ${
        routeEvidence.length
          ? `<div class="static-deploy-rehearsal-routes">
              ${routeEvidence
                .slice(0, 12)
                .map((route) => `<code>${escapeHtml(typeof route === "string" ? route : route.route || route.name || JSON.stringify(route))}</code>`)
                .join("")}
            </div>`
          : ""
      }
      ${
        limitations.length
          ? `<div class="static-deploy-rehearsal-limitations">
              ${limitations.map((item) => `<code>${escapeHtml(item)}</code>`).join("")}
            </div>`
          : ""
      }
      ${
        blockers.length
          ? `<div class="static-deploy-rehearsal-limitations">
              ${blockers.map((item) => `<code>${escapeHtml(item)}</code>`).join("")}
            </div>`
          : ""
      }
      ${renderStaticDeployRehearsalHistory(visibility.history)}
      <div class="static-deploy-rehearsal-evidence">
        <span>${escapeHtml(visibility.evidenceNote || "")}</span>
      </div>
    </article>
  `;
}

function renderStaticDeployRehearsalHistory(history) {
  if (!history || !history.totalReports) {
    return `<div class="static-deploy-rehearsal-history">
      <section>
        <span>Latest pass</span>
        <strong>No timestamped report</strong>
        <p>History will appear after local-only static rehearsal reports are written.</p>
      </section>
    </div>`;
  }

  const latest = history.latestPass;
  return `
    <div class="static-deploy-rehearsal-history">
      <section class="latest-pass">
        <span>Latest pass</span>
        ${
          latest
            ? `<strong>${escapeHtml(latest.stateLabel || latest.state)} | ${escapeHtml(formatDate(latest.checkedAt))}</strong>
               <p>${sourceLink(latest.reportPath, latest.reportPath)} | ${escapeHtml(latest.mode || "unknown")} | ${escapeHtml(latest.routeCount || 0)} route artifact${latest.routeCount === 1 ? "" : "s"}</p>`
            : `<strong>No latest report</strong><p>No timestamped report was found.</p>`
        }
      </section>
      <section>
        <span>Prior failures</span>
        <strong>${escapeHtml((history.priorFailures || []).length)}</strong>
        ${renderStaticDeployRehearsalHistoryList(history.priorFailures, "No prior blocked or failed local-only rehearsal report.")}
      </section>
      <section>
        <span>Stale evidence</span>
        <strong>${escapeHtml((history.staleEvidence || []).length)}</strong>
        ${renderStaticDeployRehearsalHistoryList(history.staleEvidence, "No older passing reports behind the latest pass.")}
      </section>
    </div>
    <div class="static-deploy-rehearsal-trend" aria-label="Static deploy rehearsal timestamped report trend">
      ${(history.trend || [])
        .map(
          (point) => `
            <span class="${escapeHtml(point.state || "not-run")}" title="${escapeHtml(`${point.stateLabel || point.state} | ${formatDate(point.checkedAt)} | ${point.reportPath}`)}">
              ${escapeHtml(formatStaticDeployTrendLabel(point.checkedAt))}
            </span>
          `
        )
        .join("")}
    </div>
    <div class="static-deploy-rehearsal-evidence">
      <span>${escapeHtml(history.boundary || "")}</span>
    </div>
  `;
}

function renderStaticDeployRehearsalHistoryList(items, emptyText) {
  const records = items || [];
  if (!records.length) return `<p>${escapeHtml(emptyText)}</p>`;
  return `
    <div class="static-deploy-rehearsal-history-list">
      ${records
        .slice(0, 5)
        .map(
          (item) => `
            <code>${sourceLink(item.reportPath, item.reportPath)} | ${escapeHtml(formatDate(item.checkedAt))} | ${escapeHtml(item.stateLabel || item.state)}${
              item.failedStepCount ? ` | failed steps: ${escapeHtml(item.failedSteps?.join(", ") || item.failedStepCount)}` : ""
            }</code>
          `
        )
        .join("")}
    </div>
  `;
}

function formatStaticDeployTrendLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value || "unknown");
  return date.toISOString().slice(11, 16);
}

function renderStaticDeployRehearsalCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderFiveSessionSynthesisReadiness(readiness) {
  if (!readiness || !readiness.rows?.length) return "";
  return `
    <article class="five-session-synthesis-card">
      <div class="five-session-synthesis-head">
        <div>
          <span>Five-session synthesis readiness</span>
          <strong>${escapeHtml(readiness.blockedCount || 0)} blocked, ${escapeHtml(readiness.partialCount || 0)} partial, ${escapeHtml(readiness.readyCount || 0)} ready</strong>
        </div>
        <small>${(readiness.generatedFrom || []).length ? `Derived from ${escapeHtml(readiness.generatedFrom.join(", "))}` : "Derived from private session packet facts"}</small>
      </div>
      <div class="five-session-synthesis-counts">
        ${renderFiveSessionSynthesisCount("Blocked", readiness.blockedCount || 0)}
        ${renderFiveSessionSynthesisCount("Partial", readiness.partialCount || 0)}
        ${renderFiveSessionSynthesisCount("Ready", readiness.readyCount || 0)}
      </div>
      <div class="five-session-synthesis-list">
        ${(readiness.rows || []).map(renderFiveSessionSynthesisRow).join("")}
      </div>
    </article>
  `;
}

function renderFiveSessionSynthesisCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderFiveSessionSynthesisRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="five-session-synthesis-row ${escapeHtml(row.state || "blocked")}">
      <div class="five-session-synthesis-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Blocked")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(`${row.completedSessionCount || 0}/${row.requiredSessionCount || 5}`)}</strong>
      </div>
      <small>${escapeHtml(row.rationale || "")}</small>
      <div class="five-session-synthesis-meta">
        <section>
          <span>Synthesis gate</span>
          <p>${escapeHtml(row.gate || "Do not open synthesis without five complete private session packets.")}</p>
        </section>
        <section>
          <span>Missing packets</span>
          <p>${escapeHtml((row.missing || []).join(", ") || "No missing required packet detected")}</p>
        </section>
        <section>
          <span>Evidence boundary</span>
          <p>Launch, pricing, testimonials, willingness-to-pay, demand, and outcomes remain unobserved.</p>
        </section>
      </div>
      <div class="five-session-synthesis-evidence">
        <span>${escapeHtml(row.evidenceNote || "No launch, pricing, demand, or outcome claim made.")}</span>
        ${
          (row.matchedArtifacts || []).length
            ? row.matchedArtifacts
                .map(
                  (artifact) => `
                    <code>${escapeHtml(
                      `${artifact.source}#${artifact.index}: ${artifact.state} / complete:${artifact.completedSessionCount || 0}/${artifact.requiredSessionCount || 5}${artifact.route ? ` / ${artifact.route}` : ""}`
                    )}</code>
                  `
                )
                .join("")
            : `<code>No repo-visible five-session packet artifact matched this row.</code>`
        }
        ${
          sourceArtifacts.length
            ? `<div class="five-session-synthesis-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.virtual
                      ? `<code>${escapeHtml(artifact.path)}</code>`
                      : artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/(research|launch)\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderSynthesisArtifactVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="synthesis-artifact-card">
      <div class="synthesis-artifact-head">
        <div>
          <span>Synthesis artifact visibility</span>
          <strong>${escapeHtml(visibility.blockedCount || 0)} blocked, ${escapeHtml(visibility.readyToGenerateCount || 0)} ready to generate, ${escapeHtml(visibility.artifactDraftedCount || 0)} drafted</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private synthesis artifact facts"}</small>
      </div>
      <div class="synthesis-artifact-counts">
        ${renderSynthesisArtifactCount("Blocked", visibility.blockedCount || 0)}
        ${renderSynthesisArtifactCount("Ready to generate", visibility.readyToGenerateCount || 0)}
        ${renderSynthesisArtifactCount("Artifact drafted", visibility.artifactDraftedCount || 0)}
      </div>
      <div class="synthesis-artifact-list">
        ${(visibility.rows || []).map(renderSynthesisArtifactRow).join("")}
      </div>
    </article>
  `;
}

function renderSynthesisArtifactCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderSynthesisArtifactRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="synthesis-artifact-row ${escapeHtml(row.state || "blocked")}">
      <div class="synthesis-artifact-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Blocked")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.stateLabel || row.state || "Blocked")}</strong>
      </div>
      <small>${escapeHtml(row.rationale || "")}</small>
      <div class="synthesis-artifact-meta">
        <section>
          <span>Artifact gate</span>
          <p>${escapeHtml(row.gate || "Do not generate a private synthesis artifact without five complete session packets.")}</p>
        </section>
        <section>
          <span>Missing</span>
          <p>${escapeHtml((row.missing || []).join(", ") || "No missing private artifact step detected")}</p>
        </section>
        <section>
          <span>Evidence boundary</span>
          <p>Launch, pricing, testimonials, willingness-to-pay, demand, and outcomes remain unobserved.</p>
        </section>
      </div>
      <div class="synthesis-artifact-evidence">
        <span>${escapeHtml(row.evidenceNote || "Private artifact status only; no public conclusion made.")}</span>
        ${
          (row.matchedArtifacts || []).length
            ? row.matchedArtifacts
                .map(
                  (artifact) => `
                    <code>${escapeHtml(
                      `${artifact.source}#${artifact.index}: ${artifact.state} / draft:${artifact.draftPresent ? "yes" : "no"} / packets:${artifact.completedSessionCount ?? "unobserved"}/${artifact.requiredSessionCount || 5}${artifact.route ? ` / ${artifact.route}` : ""}`
                    )}</code>
                  `
                )
                .join("")
            : `<code>No repo-visible private synthesis artifact draft matched this row.</code>`
        }
        ${
          sourceArtifacts.length
            ? `<div class="synthesis-artifact-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/(research|launch)\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderSynthesisDecisionMemoVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="synthesis-decision-memo-card">
      <div class="synthesis-decision-memo-head">
        <div>
          <span>Synthesis decision memo visibility</span>
          <strong>${escapeHtml(visibility.blockedCount || 0)} blocked, ${escapeHtml(visibility.artifactReadyCount || 0)} artifact ready, ${escapeHtml(visibility.memoDraftedCount || 0)} memo drafted</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private decision memo facts"}</small>
      </div>
      <div class="synthesis-decision-memo-counts">
        ${renderSynthesisDecisionMemoCount("Blocked", visibility.blockedCount || 0)}
        ${renderSynthesisDecisionMemoCount("Artifact ready", visibility.artifactReadyCount || 0)}
        ${renderSynthesisDecisionMemoCount("Memo drafted", visibility.memoDraftedCount || 0)}
      </div>
      <div class="synthesis-decision-memo-list">
        ${(visibility.rows || []).map(renderSynthesisDecisionMemoRow).join("")}
      </div>
    </article>
  `;
}

function renderSynthesisDecisionMemoCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderSynthesisDecisionMemoRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="synthesis-decision-memo-row ${escapeHtml(row.state || "blocked")}">
      <div class="synthesis-decision-memo-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Blocked")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.stateLabel || row.state || "Blocked")}</strong>
      </div>
      <small>${escapeHtml(row.rationale || "")}</small>
      <div class="synthesis-decision-memo-meta">
        <section>
          <span>Memo gate</span>
          <p>${escapeHtml(row.gate || "Do not draft a private synthesis decision memo without a generated private synthesis artifact.")}</p>
        </section>
        <section>
          <span>Missing</span>
          <p>${escapeHtml((row.missing || []).join(", ") || "No missing private memo step detected")}</p>
        </section>
        <section>
          <span>Evidence boundary</span>
          <p>Launch, pricing, testimonials, willingness-to-pay, demand, and outcomes remain unobserved.</p>
        </section>
      </div>
      <div class="synthesis-decision-memo-evidence">
        <span>${escapeHtml(row.evidenceNote || "Private memo status only; no public conclusion made.")}</span>
        ${
          (row.matchedArtifacts || []).length
            ? row.matchedArtifacts
                .map(
                  (memo) => `
                    <code>${escapeHtml(
                      `${memo.source}#${memo.index}: ${memo.state} / memo:${memo.memoDraftPresent ? "yes" : "no"} / artifact:${memo.artifactPath || "unobserved"}${memo.route ? ` / ${memo.route}` : ""}`
                    )}</code>
                  `
                )
                .join("")
            : `<code>No repo-visible private synthesis decision memo draft matched this row.</code>`
        }
        ${
          sourceArtifacts.length
            ? `<div class="synthesis-decision-memo-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/(research|launch)\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderLaunchDecisionApprovalVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="launch-decision-approval-card">
      <div class="launch-decision-approval-head">
        <div>
          <span>Launch-decision approval visibility</span>
          <strong>${escapeHtml(visibility.blockedCount || 0)} blocked, ${escapeHtml(visibility.memoReadyCount || 0)} memo ready, ${escapeHtml(visibility.approvalDraftedCount || 0)} approval drafted</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private launch-decision approval facts"}</small>
      </div>
      <div class="launch-decision-approval-counts">
        ${renderLaunchDecisionApprovalCount("Blocked", visibility.blockedCount || 0)}
        ${renderLaunchDecisionApprovalCount("Memo ready", visibility.memoReadyCount || 0)}
        ${renderLaunchDecisionApprovalCount("Approval drafted", visibility.approvalDraftedCount || 0)}
      </div>
      <div class="launch-decision-approval-list">
        ${(visibility.rows || []).map(renderLaunchDecisionApprovalRow).join("")}
      </div>
    </article>
  `;
}

function renderLaunchDecisionApprovalCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderLaunchDecisionApprovalRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="launch-decision-approval-row ${escapeHtml(row.state || "blocked")}">
      <div class="launch-decision-approval-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Blocked")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.stateLabel || row.state || "Blocked")}</strong>
      </div>
      <small>${escapeHtml(row.rationale || "")}</small>
      <div class="launch-decision-approval-meta">
        <section>
          <span>Approval gate</span>
          <p>${escapeHtml(row.gate || "Do not draft private launch-decision approval without a completed private synthesis decision memo.")}</p>
        </section>
        <section>
          <span>Missing</span>
          <p>${escapeHtml((row.missing || []).join(", ") || "No missing private approval step detected")}</p>
        </section>
        <section>
          <span>Evidence boundary</span>
          <p>Launch, pricing, testimonials, willingness-to-pay, demand, and outcomes remain unobserved.</p>
        </section>
      </div>
      <div class="launch-decision-approval-evidence">
        <span>${escapeHtml(row.evidenceNote || "Private approval status only; no public conclusion made.")}</span>
        ${
          (row.matchedArtifacts || []).length
            ? row.matchedArtifacts
                .map(
                  (artifact) => `
                    <code>${escapeHtml(
                      `${artifact.source}#${artifact.index}: ${artifact.state} / approval:${artifact.approvalDraftPresent ? "yes" : "no"} / memo:${artifact.memoPath || artifact.artifactPath || "unobserved"}${artifact.route ? ` / ${artifact.route}` : ""}`
                    )}</code>
                  `
                )
                .join("")
            : `<code>No repo-visible private launch-decision approval draft matched this row.</code>`
        }
        ${
          sourceArtifacts.length
            ? `<div class="launch-decision-approval-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/(research|launch)\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderPublishReadinessVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="publish-readiness-card">
      <div class="publish-readiness-head">
        <div>
          <span>Private publish-readiness visibility</span>
          <strong>${escapeHtml(visibility.blockedCount || 0)} blocked, ${escapeHtml(visibility.approvalReadyCount || 0)} approval ready, ${escapeHtml(visibility.publishReadyCount || 0)} publish ready</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private publish-readiness facts"}</small>
      </div>
      <div class="publish-readiness-counts">
        ${renderPublishReadinessCount("Blocked", visibility.blockedCount || 0)}
        ${renderPublishReadinessCount("Approval ready", visibility.approvalReadyCount || 0)}
        ${renderPublishReadinessCount("Publish ready", visibility.publishReadyCount || 0)}
      </div>
      <div class="publish-readiness-list">
        ${(visibility.rows || []).map(renderPublishReadinessRow).join("")}
      </div>
    </article>
  `;
}

function renderPublishReadinessCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderPublishReadinessRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="publish-readiness-row ${escapeHtml(row.state || "blocked")}">
      <div class="publish-readiness-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Blocked")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.stateLabel || row.state || "Blocked")}</strong>
      </div>
      <small>${escapeHtml(row.rationale || "")}</small>
      <div class="publish-readiness-meta">
        <section>
          <span>Publish gate</span>
          <p>${escapeHtml(row.gate || "Do not mark private publish readiness without a separate private launch-decision approval.")}</p>
        </section>
        <section>
          <span>Missing</span>
          <p>${escapeHtml((row.missing || []).join(", ") || "No missing private publish-readiness step detected")}</p>
        </section>
        <section>
          <span>Evidence boundary</span>
          <p>Launch, pricing, testimonials, willingness-to-pay, demand, and outcomes remain unobserved.</p>
        </section>
      </div>
      <div class="publish-readiness-evidence">
        <span>${escapeHtml(row.evidenceNote || "Private publish-readiness status only; no public conclusion made.")}</span>
        ${
          (row.matchedArtifacts || []).length
            ? row.matchedArtifacts
                .map(
                  (artifact) => `
                    <code>${escapeHtml(
                      `${artifact.source}#${artifact.index}: ${artifact.state} / checklist:${artifact.checklistComplete ? "yes" : "no"} / approval:${artifact.approvalPath || artifact.memoPath || "unobserved"}${artifact.route ? ` / ${artifact.route}` : ""}`
                    )}</code>
                  `
                )
                .join("")
            : `<code>No repo-visible private publish-readiness checklist matched this row.</code>`
        }
        ${
          sourceArtifacts.length
            ? `<div class="publish-readiness-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/(research|launch)\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderExplicitPublishPlanVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="explicit-publish-plan-card">
      <div class="explicit-publish-plan-head">
        <div>
          <span>Private explicit publish-plan visibility</span>
          <strong>${escapeHtml(visibility.blockedCount || 0)} blocked, ${escapeHtml(visibility.publishReadyCount || 0)} publish ready, ${escapeHtml(visibility.planDraftedCount || 0)} plan drafted</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private explicit publish-plan facts"}</small>
      </div>
      <div class="explicit-publish-plan-counts">
        ${renderExplicitPublishPlanCount("Blocked", visibility.blockedCount || 0)}
        ${renderExplicitPublishPlanCount("Publish ready", visibility.publishReadyCount || 0)}
        ${renderExplicitPublishPlanCount("Plan drafted", visibility.planDraftedCount || 0)}
      </div>
      <div class="explicit-publish-plan-list">
        ${(visibility.rows || []).map(renderExplicitPublishPlanRow).join("")}
      </div>
    </article>
  `;
}

function renderExplicitPublishPlanCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderExplicitPublishPlanRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="explicit-publish-plan-row ${escapeHtml(row.state || "blocked")}">
      <div class="explicit-publish-plan-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Blocked")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.stateLabel || row.state || "Blocked")}</strong>
      </div>
      <small>${escapeHtml(row.rationale || "")}</small>
      <div class="explicit-publish-plan-meta">
        <section>
          <span>Plan gate</span>
          <p>${escapeHtml(row.gate || "Do not draft a private explicit publish plan without completed private publish-readiness.")}</p>
        </section>
        <section>
          <span>Missing</span>
          <p>${escapeHtml((row.missing || []).join(", ") || "No missing private explicit publish-plan step detected")}</p>
        </section>
        <section>
          <span>Evidence boundary</span>
          <p>Launch, pricing, testimonials, willingness-to-pay, demand, and outcomes remain unobserved.</p>
        </section>
      </div>
      <div class="explicit-publish-plan-evidence">
        <span>${escapeHtml(row.evidenceNote || "Private explicit publish-plan status only; no public conclusion made.")}</span>
        ${
          (row.matchedArtifacts || []).length
            ? row.matchedArtifacts
                .map(
                  (artifact) => `
                    <code>${escapeHtml(
                      `${artifact.source}#${artifact.index}: ${artifact.state} / owner:${artifact.owner || "unobserved"} / rollback:${artifact.rollbackPresent ? "yes" : "no"} / claim-risk:${artifact.claimRiskPresent ? "yes" : "no"} / diff:${artifact.publicCopyDiffPresent ? "yes" : "no"} / no-publish:${artifact.noPublishAction === false ? "no" : "yes"}${artifact.route ? ` / ${artifact.route}` : ""}`
                    )}</code>
                  `
                )
                .join("")
            : `<code>No repo-visible private explicit publish-plan draft matched this row.</code>`
        }
        ${
          sourceArtifacts.length
            ? `<div class="explicit-publish-plan-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/(research|launch)\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderReleaseCandidateRehearsalVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="release-candidate-card">
      <div class="release-candidate-head">
        <div>
          <span>Private release-candidate rehearsal visibility</span>
          <strong>${escapeHtml(visibility.blockedCount || 0)} blocked, ${escapeHtml(visibility.diffReadyCount || 0)} diff ready, ${escapeHtml(visibility.rehearsalReadyCount || 0)} rehearsal ready</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private release-candidate rehearsal facts"}</small>
      </div>
      <div class="release-candidate-counts">
        ${renderReleaseCandidateCount("Blocked", visibility.blockedCount || 0)}
        ${renderReleaseCandidateCount("Diff ready", visibility.diffReadyCount || 0)}
        ${renderReleaseCandidateCount("Rehearsal ready", visibility.rehearsalReadyCount || 0)}
      </div>
      <div class="release-candidate-list">
        ${(visibility.rows || []).map(renderReleaseCandidateRehearsalRow).join("")}
      </div>
    </article>
  `;
}

function renderReleaseCandidateCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderReleaseCandidateRehearsalRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="release-candidate-row ${escapeHtml(row.state || "blocked")}">
      <div class="release-candidate-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Blocked")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.stateLabel || row.state || "Blocked")}</strong>
      </div>
      <small>${escapeHtml(row.rationale || "")}</small>
      <div class="release-candidate-meta">
        <section>
          <span>Rehearsal gate</span>
          <p>${escapeHtml(row.gate || "Do not rehearse a release candidate without a completed private public-copy diff/rollback packet.")}</p>
        </section>
        <section>
          <span>Missing</span>
          <p>${escapeHtml((row.missing || []).join(", ") || "No missing private release-candidate rehearsal step detected")}</p>
        </section>
        <section>
          <span>Evidence boundary</span>
          <p>Deploy, launch, pricing, testimonials, willingness-to-pay, demand, and outcomes remain unobserved.</p>
        </section>
      </div>
      <div class="release-candidate-evidence">
        <span>${escapeHtml(row.evidenceNote || "Private release-candidate rehearsal status only; no deploy or public conclusion made.")}</span>
        ${
          (row.matchedArtifacts || []).length
            ? row.matchedArtifacts
                .map(
                  (artifact) => `
                    <code>${escapeHtml(
                      `${artifact.source}#${artifact.index}: ${artifact.state} / packet:${artifact.packetComplete || artifact.packetPath ? "yes" : "no"} / static:${artifact.staticSmoke ? "yes" : "no"} / served:${artifact.servedSmoke ? "yes" : "no"} / rollback:${artifact.rollback || artifact.rollbackPresent ? "yes" : "no"} / consent:${artifact.consent || artifact.consentPresent ? "yes" : "no"} / claim-risk:${artifact.claimRisk || artifact.claimRiskPresent ? "yes" : "no"} / deploy:${artifact.deployActionRequested ? "requested" : "separate"}${artifact.route ? ` / ${artifact.route}` : ""}`
                    )}</code>
                  `
                )
                .join("")
            : `<code>No repo-visible completed public-copy diff/rollback packet or release-candidate rehearsal record matched this row.</code>`
        }
        ${
          sourceArtifacts.length
            ? `<div class="release-candidate-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/(deploy|launch)\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderCredentialedDeployBlockerVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="credentialed-deploy-card">
      <div class="credentialed-deploy-head">
        <div>
          <span>Private credentialed-deploy blocker visibility</span>
          <strong>${escapeHtml(visibility.rehearsalBlockedCount || 0)} rehearsal blocked, ${escapeHtml(visibility.rehearsalReadyCount || 0)} rehearsal ready, ${escapeHtml(visibility.deployInputsBlockedCount || 0)} deploy inputs blocked</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private credentialed-deploy blocker facts"}</small>
      </div>
      <div class="credentialed-deploy-counts">
        ${renderCredentialedDeployCount("Rehearsal blocked", visibility.rehearsalBlockedCount || 0)}
        ${renderCredentialedDeployCount("Rehearsal ready", visibility.rehearsalReadyCount || 0)}
        ${renderCredentialedDeployCount("Deploy inputs blocked", visibility.deployInputsBlockedCount || 0)}
      </div>
      <div class="credentialed-deploy-list">
        ${(visibility.rows || []).map(renderCredentialedDeployBlockerRow).join("")}
      </div>
    </article>
  `;
}

function renderCredentialedDeployCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderCredentialedDeployBlockerRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="credentialed-deploy-row ${escapeHtml(row.state || "rehearsal-blocked")}">
      <div class="credentialed-deploy-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Rehearsal blocked")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.stateLabel || row.state || "Rehearsal blocked")}</strong>
      </div>
      <small>${escapeHtml(row.rationale || "")}</small>
      <div class="credentialed-deploy-meta">
        <section>
          <span>Deploy gate</span>
          <p>${escapeHtml(row.gate || "Do not review credentialed deploy inputs without a completed release-candidate rehearsal.")}</p>
        </section>
        <section>
          <span>Missing</span>
          <p>${escapeHtml((row.missing || []).join(", ") || "No missing deploy-input presence facts detected")}</p>
        </section>
        <section>
          <span>Evidence boundary</span>
          <p>Deploy, launch, pricing, testimonials, demand, willingness-to-pay, secure intake, and outcomes remain unobserved.</p>
        </section>
      </div>
      <div class="credentialed-deploy-evidence">
        <span>${escapeHtml(row.evidenceNote || "Private credentialed-deploy blocker status only; no credentials or deploy action recorded.")}</span>
        ${
          (row.matchedArtifacts || []).length
            ? row.matchedArtifacts
                .map(
                  (artifact) => `
                    <code>${escapeHtml(
                      `${artifact.source}#${artifact.index}: ${artifact.state} / rehearsal:${artifact.rehearsalPath || artifact.packetPath || "unobserved"} / platform:${artifact.selectedPlatform ? "observed" : "not observed"} / url:${artifact.productionUrl ? "observed" : "not observed"} / credential:${artifact.credentialAvailability ? "outside-repo" : "not observed"} / trigger:${artifact.deployTrigger ? "observed" : "not observed"} / rollback:${artifact.rollbackOwner && artifact.rollbackMethod ? "observed" : "not observed"} / health:${artifact.healthCheckMethod || artifact.healthCheckTarget ? "observed" : "not observed"} / deploy:${artifact.deployActionRequested ? "requested" : "blocked"}`
                    )}</code>
                  `
                )
                .join("")
            : `<code>No repo-visible completed release-candidate rehearsal or credentialed-deploy blocker record matched this row.</code>`
        }
        ${
          row.unsafeEvidence
            ? `<code>Unsafe evidence marker present: credential values or deploy action request appeared in a private blocker record.</code>`
            : ""
        }
        ${
          sourceArtifacts.length
            ? `<div class="credentialed-deploy-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/deploy\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderPlatformOwnerHandoffVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="platform-owner-card">
      <div class="platform-owner-head">
        <div>
          <span>Platform-owner handoff</span>
          <strong>${escapeHtml(visibility.handoffBlockedCount || 0)} visible, ${escapeHtml(visibility.staticRehearsalBlockedCount || 0)} static-blocked</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private handoff checklist"}</small>
      </div>
      <div class="platform-owner-counts">
        ${renderPlatformOwnerCount("Rows", visibility.total || 0)}
        ${renderPlatformOwnerCount("Static passed", visibility.localStaticPassed ? "yes" : "no")}
        ${renderPlatformOwnerCount("Unavailable values", visibility.unavailableValueCount || 0)}
      </div>
      <div class="platform-owner-list">
        ${(visibility.rows || []).map(renderPlatformOwnerHandoffRow).join("")}
      </div>
    </article>
  `;
}

function renderPlatformOwnerCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderPlatformOwnerHandoffRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="platform-owner-row ${escapeHtml(row.state || "handoff-blocked")}">
      <div class="platform-owner-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Deploy blocked")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.publicDeployStatus?.productionDeploymentState || "Do Not Deploy")}</strong>
      </div>
      <small>${escapeHtml(row.gate || "")}</small>
      <div class="platform-owner-status">
        <section>
          <span>Non-secret inputs needed</span>
          <div>${(row.nonSecretInputsNeeded || []).map(renderPlatformOwnerFact).join("")}</div>
        </section>
        <section>
          <span>Unavailable credential/deploy values</span>
          <div>${(row.unavailableCredentialDeployValues || []).map(renderPlatformOwnerFact).join("")}</div>
        </section>
        <section>
          <span>Public deploy status</span>
          <p>${escapeHtml(row.publicDeployStatus?.authorization || "Not observed")} | ${escapeHtml(row.publicDeployStatus?.staticRehearsalState || "Not run")}</p>
          <p>${escapeHtml(row.publicDeployStatus?.blockedReason || "Public deploy remains blocked.")}</p>
        </section>
      </div>
      <div class="platform-owner-evidence">
        <span>${escapeHtml(row.evidenceNote || "Private handoff status only.")}</span>
        ${
          sourceArtifacts.length
            ? `<div class="platform-owner-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/(deploy|reports)\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderPlatformOwnerFact(fact) {
  return `
    <code>${escapeHtml(fact.label)}: ${escapeHtml(fact.state || "Not observed")}</code>
  `;
}

function renderPostDeployHealthOwnerHandoffVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="post-deploy-health-card">
      <div class="post-deploy-health-head">
        <div>
          <span>Post-deploy health-check owner handoff</span>
          <strong>${escapeHtml(visibility.routeOnlyCheckCount || 0)} route-only checks, ${escapeHtml(visibility.blockedLaunchAuthorizationCount || 0)} blocked auth</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private health-check owner handoff template"}</small>
      </div>
      <div class="post-deploy-health-counts">
        ${renderPostDeployHealthCount("Rows", visibility.total || 0)}
        ${renderPostDeployHealthCount("Origin unavailable", visibility.unavailableProductionOriginCount || 0)}
        ${renderPostDeployHealthCount("Trigger unavailable", visibility.unavailableDeployTriggerCount || 0)}
        ${renderPostDeployHealthCount("Launch blocked", visibility.blockedLaunchAuthorizationCount || 0)}
      </div>
      <div class="post-deploy-health-list">
        ${(visibility.rows || []).map(renderPostDeployHealthOwnerHandoffRow).join("")}
      </div>
    </article>
  `;
}

function renderPostDeployHealthCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderPostDeployHealthOwnerHandoffRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="post-deploy-health-row ${escapeHtml(row.state || "handoff-visible-blocked")}">
      <div class="post-deploy-health-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Blocked")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.blockedLaunchAuthorization?.deploymentState || "Do Not Deploy")}</strong>
      </div>
      <small>${escapeHtml(row.gate || "")}</small>
      <div class="post-deploy-health-status">
        <section>
          <span>Route-only checks</span>
          <div class="post-deploy-health-routes">
            ${(row.routeOnlyChecks || [])
              .map((route) => `<code>${escapeHtml(route.path)}: ${escapeHtml(route.executableState || "Not observed")}</code>`)
              .join("")}
          </div>
        </section>
        <section>
          <span>Unavailable production origin</span>
          <p>${escapeHtml(row.unavailableProductionOrigin?.state || "Not observed")}</p>
          <p>${escapeHtml(row.unavailableProductionOrigin?.handling || "")}</p>
        </section>
        <section>
          <span>Unavailable deploy trigger</span>
          <p>${escapeHtml(row.unavailableDeployTrigger?.state || "Not observed")}</p>
          <p>${escapeHtml(row.unavailableDeployTrigger?.handling || "")}</p>
        </section>
        <section>
          <span>Blocked launch authorization</span>
          <p>${escapeHtml(row.blockedLaunchAuthorization?.state || "Not observed")}</p>
          <p>${escapeHtml(row.blockedLaunchAuthorization?.handling || "")}</p>
        </section>
      </div>
      <div class="post-deploy-health-evidence">
        <span>${escapeHtml(row.evidenceNote || "Private health-check owner handoff status only.")}</span>
        <code>Owner: ${escapeHtml(row.ownerHandoff?.healthCheckOwner || "Not observed")} | Health readiness: ${escapeHtml(row.ownerHandoff?.healthReadiness || "Not observed")}</code>
        ${
          sourceArtifacts.length
            ? `<div class="post-deploy-health-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/deploy\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderFinalDeployGoNoGoLedgerVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="final-deploy-ledger-card">
      <div class="final-deploy-ledger-head">
        <div>
          <span>Final deploy go/no-go ledger</span>
          <strong>${escapeHtml(visibility.finalNoGoCount || 0)} No-Go / Do Not Deploy</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private final deploy ledger template"}</small>
      </div>
      <div class="final-deploy-ledger-counts">
        ${renderFinalDeployLedgerCount("Evidence present", visibility.evidencePresentCount || 0)}
        ${renderFinalDeployLedgerCount("Evidence missing", visibility.evidenceMissingCount || 0)}
        ${renderFinalDeployLedgerCount("Human approval missing", visibility.humanApprovalMissingCount || 0)}
        ${renderFinalDeployLedgerCount("Credentials unavailable", visibility.credentialsUnavailableCount || 0)}
      </div>
      <div class="final-deploy-ledger-list">
        ${(visibility.rows || []).map(renderFinalDeployGoNoGoLedgerRow).join("")}
      </div>
    </article>
  `;
}

function renderFinalDeployLedgerCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderFinalDeployGoNoGoLedgerRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="final-deploy-ledger-row ${escapeHtml(row.state || "no-go-do-not-deploy")}">
      <div class="final-deploy-ledger-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "No-Go")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.finalState?.decision || "No-Go / Do Not Deploy")}</strong>
      </div>
      <small>${escapeHtml(row.gate || "")}</small>
      <div class="final-deploy-ledger-status">
        ${renderFinalDeployLedgerBucket("Evidence present", row.evidencePresent)}
        ${renderFinalDeployLedgerBucket("Evidence missing", row.evidenceMissing)}
        ${renderFinalDeployLedgerBucket("Human approval missing", row.humanApprovalMissing)}
        ${renderFinalDeployLedgerBucket("Credentials unavailable", row.credentialsUnavailable)}
        <section class="final-state">
          <span>Final state</span>
          <p>${escapeHtml(row.finalState?.deploymentState || "Do Not Deploy")}</p>
          <p>${escapeHtml(row.finalState?.handling || "")}</p>
          <code>Deploy authorized: ${escapeHtml(row.finalState?.publicDeployAuthorized || "No")} | Launch authorized: ${escapeHtml(row.finalState?.publicLaunchAuthorized || "No")}</code>
        </section>
      </div>
      <div class="final-deploy-ledger-evidence">
        <span>${escapeHtml(row.evidenceNote || "Private final ledger status only.")}</span>
        ${
          sourceArtifacts.length
            ? `<div class="final-deploy-ledger-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/(deploy|reports)\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderFinalDeployLedgerBucket(label, items) {
  const records = items || [];
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <div class="final-deploy-ledger-facts">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.label)}: ${escapeHtml(item.state || "Not observed")}</code>`).join("")
            : `<code>No facts recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderDeployBlockerEscalationMemoVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="deploy-blocker-memo-card">
      <div class="deploy-blocker-memo-head">
        <div>
          <span>Private deploy-blocker escalation memo</span>
          <strong>${escapeHtml(visibility.finalNoGoCount || 0)} final No-Go, ${escapeHtml(visibility.deployActionAvailableCount || 0)} deploy actions</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private deploy-blocker escalation memo template"}</small>
      </div>
      <div class="deploy-blocker-memo-counts">
        ${renderDeployBlockerMemoCount("Memo visible", visibility.memoVisibleCount || 0)}
        ${renderDeployBlockerMemoCount("Final No-Go", visibility.finalNoGoCount || 0)}
        ${renderDeployBlockerMemoCount("Unavailable inputs", visibility.unavailableExternalInputCount || 0)}
        ${renderDeployBlockerMemoCount("Deploy actions", visibility.deployActionAvailableCount || 0)}
      </div>
      <div class="deploy-blocker-memo-list">
        ${(visibility.rows || []).map(renderDeployBlockerEscalationMemoRow).join("")}
      </div>
    </article>
  `;
}

function renderDeployBlockerMemoCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderDeployBlockerEscalationMemoRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="deploy-blocker-memo-row ${escapeHtml(row.state || "memo-visible-no-go")}">
      <div class="deploy-blocker-memo-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "No-Go")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.memoState?.decision || "No-Go / Do Not Deploy")}</strong>
      </div>
      <small>${escapeHtml(row.gate || "")}</small>
      <div class="deploy-blocker-memo-status">
        <section>
          <span>Memo state</span>
          <p>${escapeHtml(row.memoState?.memoExists ? "Memo template observed" : "Memo template missing")}</p>
          <p>Final ledger: ${escapeHtml(row.memoState?.finalLedgerExists ? "Observed" : "Missing")}</p>
          <code>Deploy authorized: ${escapeHtml(row.memoState?.publicDeployAuthorized || "No")} | Launch authorized: ${escapeHtml(row.memoState?.publicLaunchAuthorized || "No")} | Rollback authorized: ${escapeHtml(row.memoState?.rollbackAuthorized || "No")}</code>
        </section>
        ${renderDeployBlockerMemoBucket("Blocker categories", row.blockerCategories)}
        ${renderDeployBlockerMemoBucket("Unavailable external inputs", row.unavailableExternalInputs)}
        <section class="deploy-action-boundary">
          <span>Deploy action separation</span>
          <p>${escapeHtml(row.deployActionBoundary?.state || "No deploy action available")}</p>
          <p>${escapeHtml(row.deployActionBoundary?.handling || "")}</p>
        </section>
      </div>
      <div class="deploy-blocker-memo-evidence">
        <span>${escapeHtml(row.evidenceNote || "Private deploy-blocker memo status only.")}</span>
        ${
          sourceArtifacts.length
            ? `<div class="deploy-blocker-memo-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/deploy\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderDeployBlockerMemoBucket(label, items) {
  const records = items || [];
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <div class="deploy-blocker-memo-facts">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.label)}: ${escapeHtml(item.state || "Not observed")}</code>`).join("")
            : `<code>No facts recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderFirstHumanOperatorDeployPacketIndexVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="first-human-packet-card">
      <div class="first-human-packet-head">
        <div>
          <span>First-human-operator deploy packet index</span>
          <strong>${escapeHtml(visibility.readyLocalArtifactCount || 0)} ready local artifacts, ${escapeHtml(visibility.unavailableExternalFactCount || 0)} unavailable facts</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private first-human-operator packet index"}</small>
      </div>
      <div class="first-human-packet-counts">
        ${renderFirstHumanPacketCount("Rows", visibility.total || 0)}
        ${renderFirstHumanPacketCount("Final No-Go", visibility.finalNoGoCount || 0)}
        ${renderFirstHumanPacketCount("Ready artifacts", visibility.readyLocalArtifactCount || 0)}
        ${renderFirstHumanPacketCount("Unavailable facts", visibility.unavailableExternalFactCount || 0)}
        ${renderFirstHumanPacketCount("Deploy actions", visibility.deployActionAvailableCount || 0)}
      </div>
      <div class="first-human-packet-list">
        ${(visibility.rows || []).map(renderFirstHumanOperatorDeployPacketIndexRow).join("")}
      </div>
    </article>
  `;
}

function renderFirstHumanPacketCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderFirstHumanOperatorDeployPacketIndexRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="first-human-packet-row ${escapeHtml(row.state || "packet-index-visible-no-go")}">
      <div class="first-human-packet-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "No-Go")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.finalState?.decision || "No-Go / Do Not Deploy")}</strong>
      </div>
      <small>${escapeHtml(row.gate || "")}</small>
      <div class="first-human-packet-status">
        <section class="first-human-final-state">
          <span>Final blocker state</span>
          <p>${escapeHtml(row.finalState?.productionDeploymentState || "Do Not Deploy")}</p>
          <p>${escapeHtml(row.finalState?.reasonDeploymentBlocked || "")}</p>
          <code>Deploy authorized: ${escapeHtml(row.finalState?.deployAuthorized || "No")} | Launch authorized: ${escapeHtml(row.finalState?.launchAuthorized || "No")} | Rollback authorized: ${escapeHtml(row.finalState?.rollbackAuthorized || "No")}</code>
        </section>
        ${renderFirstHumanPacketReadyArtifacts(row.readyLocalArtifacts)}
        ${renderFirstHumanPacketUnavailableFacts(row.unavailableExternalFacts)}
      </div>
      <div class="first-human-packet-evidence">
        <span>${escapeHtml(row.boundary || "Private first-human-operator deploy packet visibility only.")}</span>
        ${
          sourceArtifacts.length
            ? `<div class="first-human-packet-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/(deploy|reports)\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderFirstHumanPacketReadyArtifacts(items) {
  const records = items || [];
  return `
    <section>
      <span>Ready local artifacts</span>
      <div class="first-human-packet-artifacts">
        ${
          records.length
            ? records
                .map(
                  (item) =>
                    `<code>${escapeHtml(item.artifact)}: ${escapeHtml(item.state || "Not observed")} | ${escapeHtml(item.reviewUse || "Private review")}</code>`
                )
                .join("")
            : `<code>No ready local artifacts recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderFirstHumanPacketUnavailableFacts(items) {
  const records = items || [];
  return `
    <section>
      <span>Unavailable external facts</span>
      <div class="first-human-packet-facts">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.fact)}: ${escapeHtml(item.state || "Not observed")}</code>`).join("")
            : `<code>No unavailable external facts recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderOperatorDryRunReviewChecklistVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="operator-dry-run-card">
      <div class="operator-dry-run-head">
        <div>
          <span>Operator dry-run review checklist</span>
          <strong>${escapeHtml(visibility.safeLocalReviewArtifactCount || 0)} safe local review artifacts, ${escapeHtml(visibility.forbiddenExternalActionCount || 0)} forbidden external actions</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private operator dry-run checklist"}</small>
      </div>
      <div class="operator-dry-run-counts">
        ${renderOperatorDryRunCount("Rows", visibility.total || 0)}
        ${renderOperatorDryRunCount("Final No-Go", visibility.finalNoGoCount || 0)}
        ${renderOperatorDryRunCount("Safe local review", visibility.safeLocalReviewArtifactCount || 0)}
        ${renderOperatorDryRunCount("Forbidden actions", visibility.forbiddenExternalActionCount || 0)}
        ${renderOperatorDryRunCount("Deploy actions", visibility.deployActionAvailableCount || 0)}
      </div>
      <div class="operator-dry-run-list">
        ${(visibility.rows || []).map(renderOperatorDryRunReviewChecklistRow).join("")}
      </div>
    </article>
  `;
}

function renderOperatorDryRunCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderOperatorDryRunReviewChecklistRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="operator-dry-run-row ${escapeHtml(row.state || "dry-run-visible-no-go")}">
      <div class="operator-dry-run-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Dry-run visible")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.finalState?.decision || "No-Go / Do Not Deploy")}</strong>
      </div>
      <small>${escapeHtml(row.gate || "")}</small>
      <div class="operator-dry-run-status">
        <section class="operator-dry-run-final-state">
          <span>Final blocker state</span>
          <p>${escapeHtml(row.finalState?.productionDeploymentState || "Do Not Deploy")}</p>
          <p>${escapeHtml(row.finalState?.reasonDeploymentBlocked || "")}</p>
          <code>Deploy authorized: ${escapeHtml(row.finalState?.deployAuthorized || "No")} | Launch authorized: ${escapeHtml(row.finalState?.launchAuthorized || "No")} | Rollback authorized: ${escapeHtml(row.finalState?.rollbackAuthorized || "No")}</code>
        </section>
        ${renderOperatorDryRunSafeArtifacts(row.safeLocalReviewArtifacts)}
        ${renderOperatorDryRunForbiddenActions(row.forbiddenExternalActions)}
      </div>
      <div class="operator-dry-run-evidence">
        <span>${escapeHtml(row.boundary || "Private operator dry-run checklist visibility only.")}</span>
        ${
          sourceArtifacts.length
            ? `<div class="operator-dry-run-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/(deploy|reports|research)\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderOperatorDryRunSafeArtifacts(items) {
  const records = items || [];
  return `
    <section>
      <span>Safe local review artifacts</span>
      <div class="operator-dry-run-artifacts">
        ${
          records.length
            ? records
                .map(
                  (item) =>
                    `<code>${escapeHtml(item.artifact)}: ${escapeHtml(item.question || "Review locally")} | ${escapeHtml(item.boundary || "Review only")}</code>`
                )
                .join("")
            : `<code>No safe local review artifacts recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderOperatorDryRunForbiddenActions(items) {
  const records = items || [];
  return `
    <section>
      <span>Forbidden external actions</span>
      <div class="operator-dry-run-forbidden">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.action)}: ${escapeHtml(item.state || "Forbidden")}</code>`).join("")
            : `<code>No forbidden external action categories recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderFirstHumanPacketColdStartArchiveVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="cold-start-archive-card">
      <div class="cold-start-archive-head">
        <div>
          <span>First-human packet cold-start archive</span>
          <strong>${escapeHtml(visibility.continuationContextCount || 0)} continuation facts, ${escapeHtml(visibility.unavailableExternalFactCount || 0)} unavailable facts</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private cold-start archive"}</small>
      </div>
      <div class="cold-start-archive-counts">
        ${renderColdStartArchiveCount("Rows", visibility.total || 0)}
        ${renderColdStartArchiveCount("Final No-Go", visibility.finalNoGoCount || 0)}
        ${renderColdStartArchiveCount("Continuation facts", visibility.continuationContextCount || 0)}
        ${renderColdStartArchiveCount("Unavailable facts", visibility.unavailableExternalFactCount || 0)}
        ${renderColdStartArchiveCount("Deploy actions", visibility.deployActionAvailableCount || 0)}
      </div>
      <div class="cold-start-archive-list">
        ${(visibility.rows || []).map(renderFirstHumanPacketColdStartArchiveRow).join("")}
      </div>
    </article>
  `;
}

function renderColdStartArchiveCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderFirstHumanPacketColdStartArchiveRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="cold-start-archive-row ${escapeHtml(row.state || "cold-start-archive-visible-no-go")}">
      <div class="cold-start-archive-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Archive visible")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.finalState?.decision || "No-Go / Do Not Deploy")}</strong>
      </div>
      <small>${escapeHtml(row.gate || "")}</small>
      <div class="cold-start-archive-status">
        <section class="cold-start-archive-final-state">
          <span>Final blocker state</span>
          <p>${escapeHtml(row.finalState?.productionDeploymentState || "Not observed")}</p>
          <p>${escapeHtml(row.finalState?.reasonDeploymentBlocked || "")}</p>
          <code>Deploy authorized: ${escapeHtml(row.finalState?.deployAuthorized || "No")} | Launch authorized: ${escapeHtml(row.finalState?.launchAuthorized || "No")} | Rollback authorized: ${escapeHtml(row.finalState?.rollbackAuthorized || "No")}</code>
        </section>
        ${renderColdStartArchiveState(row.archiveState)}
        ${renderColdStartContinuationContext(row.continuationContext)}
        ${renderColdStartUnavailableFacts(row.unavailableExternalFacts)}
      </div>
      <div class="cold-start-archive-evidence">
        <span>${escapeHtml(row.boundary || "Private first-human packet cold-start archive visibility only.")}</span>
        ${renderColdStartSourceSummaries(row.sourceSummaries)}
        ${
          sourceArtifacts.length
            ? `<div class="cold-start-archive-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/(deploy|reports|research)\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderColdStartArchiveState(archiveState) {
  const state = archiveState || {};
  return `
    <section>
      <span>Archive state</span>
      <div class="cold-start-archive-state">
        <code>Packet index archived: ${escapeHtml(state.packetIndexArchived || "No")}</code>
        <code>Dry-run checklist archived: ${escapeHtml(state.dryRunChecklistArchived || "No")}</code>
        <code>Credentials requested or stored: ${escapeHtml(state.credentialsRequestedOrStored || "No")}</code>
        <code>Executable deploy sequence created: ${escapeHtml(state.executableDeploySequenceCreated || "No")}</code>
      </div>
    </section>
  `;
}

function renderColdStartContinuationContext(items) {
  const records = items || [];
  return `
    <section>
      <span>Continuation context</span>
      <div class="cold-start-archive-context">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.fact)}: ${escapeHtml(item.state || "Not observed")}</code>`).join("")
            : `<code>No continuation context recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderColdStartUnavailableFacts(items) {
  const records = items || [];
  return `
    <section>
      <span>Unavailable external facts</span>
      <div class="cold-start-archive-facts">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.fact)}: ${escapeHtml(item.state || "Not observed")}</code>`).join("")
            : `<code>No unavailable external facts recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderColdStartSourceSummaries(items) {
  const records = items || [];
  if (!records.length) return "";
  return `
    <div class="cold-start-archive-summaries">
      ${records
        .map((item) => `<code>${escapeHtml(item.artifact)}: ${escapeHtml(item.state || "Summarized only")}</code>`)
        .join("")}
    </div>
  `;
}

function renderReleaseCandidateDeployContinuationMapVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="cold-start-archive-card deploy-continuation-map-card">
      <div class="cold-start-archive-head">
        <div>
          <span>Release-candidate deploy-continuation map</span>
          <strong>${escapeHtml(visibility.localContextCount || 0)} local context facts, ${escapeHtml(visibility.unavailableExternalFactCount || 0)} unavailable platform facts</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private deploy-continuation map"}</small>
      </div>
      <div class="cold-start-archive-counts">
        ${renderColdStartArchiveCount("Rows", visibility.total || 0)}
        ${renderColdStartArchiveCount("Final No-Go", visibility.finalNoGoCount || 0)}
        ${renderColdStartArchiveCount("Local context", visibility.localContextCount || 0)}
        ${renderColdStartArchiveCount("Blocked gates", visibility.blockedGateCount || 0)}
        ${renderColdStartArchiveCount("Deploy actions", visibility.deployActionAvailableCount || 0)}
      </div>
      <div class="cold-start-archive-list">
        ${(visibility.rows || []).map(renderReleaseCandidateDeployContinuationMapRow).join("")}
      </div>
    </article>
  `;
}

function renderReleaseCandidateDeployContinuationMapRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="cold-start-archive-row ${escapeHtml(row.state || "deploy-continuation-map-visible-no-go")}">
      <div class="cold-start-archive-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Continuation map visible")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.finalState?.decision || "No-Go / Do Not Deploy")}</strong>
      </div>
      <small>${escapeHtml(row.gate || "")}</small>
      <div class="cold-start-archive-status">
        <section class="cold-start-archive-final-state">
          <span>Final blocker state</span>
          <p>${escapeHtml(row.finalState?.productionDeploymentState || "Do Not Deploy")}</p>
          <p>${escapeHtml(row.finalState?.reasonDeploymentBlocked || "")}</p>
          <code>Deploy authorized: ${escapeHtml(row.finalState?.deployAuthorized || "No")} | Launch authorized: ${escapeHtml(row.finalState?.launchAuthorized || "No")} | Rollback authorized: ${escapeHtml(row.finalState?.rollbackAuthorized || "No")}</code>
        </section>
        ${renderDeployContinuationMapState(row.mapState)}
        ${renderDeployContinuationLocalContext(row.localContext)}
        ${renderDeployContinuationUnavailableFacts(row.unavailableExternalFacts)}
        ${renderDeployContinuationBlockedGates(row.blockedGates)}
      </div>
      <div class="cold-start-archive-evidence">
        <span>${escapeHtml(row.boundary || "Private release-candidate deploy-continuation map visibility only.")}</span>
        ${
          sourceArtifacts.length
            ? `<div class="cold-start-archive-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/(deploy|reports|research)\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderDeployContinuationMapState(mapState) {
  const state = mapState || {};
  return `
    <section>
      <span>Map state</span>
      <div class="cold-start-archive-state">
        <code>Private continuation map created: ${escapeHtml(state.privateMapCreated || "No")}</code>
        <code>External deploy facts requested: ${escapeHtml(state.externalDeployFactsRequested || "No")}</code>
        <code>Credentials requested or stored: ${escapeHtml(state.credentialsRequestedOrStored || "No")}</code>
        <code>Platform values requested or stored: ${escapeHtml(state.platformValuesRequestedOrStored || "No")}</code>
        <code>Executable deploy sequence created: ${escapeHtml(state.executableDeploySequenceCreated || "No")}</code>
      </div>
    </section>
  `;
}

function renderDeployContinuationLocalContext(items) {
  const records = items || [];
  return `
    <section>
      <span>Local continuation context</span>
      <div class="cold-start-archive-context">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.artifact)}: ${escapeHtml(item.state || "Not observed")} | ${escapeHtml(item.allowedUse || "Context only")}</code>`).join("")
            : `<code>No local continuation context recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderDeployContinuationUnavailableFacts(items) {
  const records = items || [];
  return `
    <section>
      <span>Unavailable external platform facts</span>
      <div class="cold-start-archive-facts">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.fact)}: ${escapeHtml(item.state || "Not observed")} | ${escapeHtml(item.handling || "Keep outside repo")}</code>`).join("")
            : `<code>No unavailable external platform facts recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderDeployContinuationBlockedGates(items) {
  const records = items || [];
  return `
    <section>
      <span>Blocked continuation gates</span>
      <div class="cold-start-archive-facts">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.gate)}: ${escapeHtml(item.state || "Blocked")} | ${escapeHtml(item.response || "Keep No-Go / Do Not Deploy")}</code>`).join("")
            : `<code>No blocked continuation gates recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderExternalInputBoundaryLedgerVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="cold-start-archive-card external-input-ledger-card">
      <div class="cold-start-archive-head">
        <div>
          <span>Private external-input boundary ledger</span>
          <strong>${escapeHtml(visibility.outsideRepoFactCount || 0)} outside-repo facts, ${escapeHtml(visibility.finalNoGoCount || 0)} final No-Go</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private external-input boundary ledger"}</small>
      </div>
      <div class="cold-start-archive-counts">
        ${renderColdStartArchiveCount("Rows", visibility.total || 0)}
        ${renderColdStartArchiveCount("Final No-Go", visibility.finalNoGoCount || 0)}
        ${renderColdStartArchiveCount("Outside-repo facts", visibility.outsideRepoFactCount || 0)}
        ${renderColdStartArchiveCount("Local authority", visibility.localAuthorityCount || 0)}
        ${renderColdStartArchiveCount("Deploy actions", visibility.deployActionAvailableCount || 0)}
      </div>
      <div class="cold-start-archive-list">
        ${(visibility.rows || []).map(renderExternalInputBoundaryLedgerRow).join("")}
      </div>
    </article>
  `;
}

function renderExternalInputBoundaryLedgerRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="cold-start-archive-row ${escapeHtml(row.state || "external-input-boundary-ledger-visible-no-go")}">
      <div class="cold-start-archive-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Boundary ledger visible")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.finalState?.decision || "No-Go / Do Not Deploy")}</strong>
      </div>
      <small>${escapeHtml(row.gate || "")}</small>
      <div class="cold-start-archive-status">
        <section class="cold-start-archive-final-state">
          <span>Final blocker state</span>
          <p>${escapeHtml(row.finalState?.productionDeploymentState || "Do Not Deploy")}</p>
          <p>${escapeHtml(row.finalState?.reasonDeploymentBlocked || "")}</p>
        </section>
        ${renderExternalInputLedgerState(row.ledgerState)}
        ${renderExternalInputLedgerOutsideFacts(row.outsideRepoFacts)}
        ${renderExternalInputLedgerLocalAuthority(row.localAuthority)}
        ${renderExternalInputLedgerBoundaryRules(row.boundaryRules)}
      </div>
      <div class="cold-start-archive-evidence">
        <span>${escapeHtml(row.boundary || "Private external-input boundary ledger visibility only.")}</span>
        ${
          sourceArtifacts.length
            ? `<div class="cold-start-archive-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/(deploy|reports|research)\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderExternalInputLedgerState(ledgerState) {
  const state = ledgerState || {};
  return `
    <section>
      <span>Ledger state</span>
      <div class="cold-start-archive-state">
        <code>Ledger created: ${escapeHtml(state.ledgerCreated || "No")}</code>
        <code>Continuation authority preserved: ${escapeHtml(state.continuationMapAuthorityPreserved || "No")}</code>
        <code>External facts requested: ${escapeHtml(state.externalDeployFactsRequested || "No")}</code>
        <code>Private values stored: ${escapeHtml(state.credentialsRequestedOrStored || "No")}</code>
        <code>Platform values stored: ${escapeHtml(state.platformValuesRequestedOrStored || "No")}</code>
        <code>Production destination stored: ${escapeHtml(state.productionUrlRequestedOrStored || "No")}</code>
        <code>Execution trigger stored: ${escapeHtml(state.deployTriggerRequestedOrStored || "No")}</code>
        <code>Rollback details stored: ${escapeHtml(state.rollbackDetailsRequestedOrStored || "No")}</code>
        <code>Executable sequence created: ${escapeHtml(state.executableDeploySequenceCreated || "No")}</code>
      </div>
    </section>
  `;
}

function renderExternalInputLedgerOutsideFacts(items) {
  const records = items || [];
  return `
    <section>
      <span>Outside-repo facts</span>
      <div class="cold-start-archive-facts">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.fact)}: ${escapeHtml(item.state || "Not observed")} | ${escapeHtml(item.preservedResponse || "Keep No-Go / Do Not Deploy")}</code>`).join("")
            : `<code>No outside-repo facts recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderExternalInputLedgerLocalAuthority(items) {
  const records = items || [];
  return `
    <section>
      <span>Local authority source</span>
      <div class="cold-start-archive-context">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.artifact)}: ${escapeHtml(item.authority || "Local context only")}</code>`).join("")
            : `<code>No local authority sources recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderExternalInputLedgerBoundaryRules(items) {
  const records = items || [];
  return `
    <section>
      <span>Non-executable rules</span>
      <div class="cold-start-archive-facts">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.rule)}: ${escapeHtml(item.response || "Keep No-Go / Do Not Deploy")}</code>`).join("")
            : `<code>No non-executable rules recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderPlatformOwnerNonRequestTransferNoteVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="cold-start-archive-card platform-owner-transfer-note-card">
      <div class="cold-start-archive-head">
        <div>
          <span>Private platform-owner non-request transfer note</span>
          <strong>${escapeHtml(visibility.outsideRepoFactCount || 0)} outside-repo facts, ${escapeHtml(visibility.finalNoGoCount || 0)} final No-Go</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private platform-owner transfer note"}</small>
      </div>
      <div class="cold-start-archive-counts">
        ${renderColdStartArchiveCount("Rows", visibility.total || 0)}
        ${renderColdStartArchiveCount("Final No-Go", visibility.finalNoGoCount || 0)}
        ${renderColdStartArchiveCount("Outside-repo facts", visibility.outsideRepoFactCount || 0)}
        ${renderColdStartArchiveCount("Transfer facts", visibility.transferFactCount || 0)}
        ${renderColdStartArchiveCount("Deploy actions", visibility.deployActionAvailableCount || 0)}
      </div>
      <div class="cold-start-archive-list">
        ${(visibility.rows || []).map(renderPlatformOwnerNonRequestTransferNoteRow).join("")}
      </div>
    </article>
  `;
}

function renderPlatformOwnerNonRequestTransferNoteRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="cold-start-archive-row ${escapeHtml(row.state || "platform-owner-non-request-transfer-note-visible-no-go")}">
      <div class="cold-start-archive-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Transfer note visible")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.finalState?.decision || "No-Go / Do Not Deploy")}</strong>
      </div>
      <small>${escapeHtml(row.gate || "")}</small>
      <div class="cold-start-archive-status">
        <section class="cold-start-archive-final-state">
          <span>Final blocker state</span>
          <p>${escapeHtml(row.finalState?.productionDeploymentState || "Do Not Deploy")}</p>
          <p>${escapeHtml(row.finalState?.reasonDeploymentBlocked || "")}</p>
        </section>
        ${renderPlatformOwnerTransferSummary(row.transferSummary)}
        ${renderPlatformOwnerTransferRestrictedSurfaces(row.restrictedSurfaceCounts)}
        ${renderPlatformOwnerTransferFacts(row.transferFacts)}
        ${renderPlatformOwnerTransferSources(row.sourceConsumed)}
        ${renderPlatformOwnerTransferHardStops(row.hardStops)}
      </div>
      <div class="cold-start-archive-evidence">
        <span>${escapeHtml(row.boundary || "Private platform-owner non-request transfer note visibility only.")}</span>
        ${
          sourceArtifacts.length
            ? `<div class="cold-start-archive-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/deploy\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderPlatformOwnerTransferSummary(summary) {
  const item = summary || {};
  return `
    <section>
      <span>Transfer summary</span>
      <div class="cold-start-archive-state">
        <code>Note created: ${escapeHtml(item.noteCreated || "No")}</code>
        <code>Source consumed: ${escapeHtml(item.sourceConsumed || "Not observed")}</code>
        <code>External facts requested: ${escapeHtml(item.externalDeployFactsRequested || "No")}</code>
        <code>External fact authority: ${escapeHtml(item.externalFactAuthority || "outside repo authority")}</code>
        <code>Selected platform: ${escapeHtml(item.selectedPlatform || "Not observed")}</code>
        <code>Credential availability: ${escapeHtml(item.credentialAvailability || "Not observed")}</code>
        <code>Production origin readiness: ${escapeHtml(item.productionOriginReadiness || "Not observed")}</code>
        <code>Deploy trigger readiness: ${escapeHtml(item.deployTriggerReadiness || "Not observed")}</code>
        <code>Rollback readiness: ${escapeHtml(item.rollbackReadiness || "Not observed")}</code>
        <code>Post-deploy health readiness: ${escapeHtml(item.postDeployHealthReadiness || "Not observed")}</code>
      </div>
    </section>
  `;
}

function renderPlatformOwnerTransferRestrictedSurfaces(counts) {
  const safeCounts = counts || {};
  const items = [
    ["Credentials", safeCounts.credentials],
    ["URLs", safeCounts.urls],
    ["Deploy triggers", safeCounts.deployTriggers],
    ["Dashboard links", safeCounts.dashboardLinks],
    ["Contacts", safeCounts.contacts],
    ["DNS steps", safeCounts.dnsSteps],
    ["Rollback authorization", safeCounts.rollbackAuthorization],
    ["Public launch authorization", safeCounts.publicLaunchAuthorization],
    ["Deploy actions", safeCounts.deployActions],
  ];
  return `
    <section>
      <span>Restricted surfaces stored</span>
      <div class="cold-start-archive-facts">
        ${items.map(([label, value]) => `<code>${escapeHtml(label)}: ${escapeHtml(value ?? 0)}</code>`).join("")}
      </div>
    </section>
  `;
}

function renderPlatformOwnerTransferFacts(items) {
  const records = items || [];
  return `
    <section>
      <span>Outside-repo transfer facts</span>
      <div class="cold-start-archive-facts">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.topic)}: ${escapeHtml(item.state || "Not observed")} | ${escapeHtml(item.allowedWording || "Outside repo authority")}</code>`).join("")
            : `<code>No transfer facts recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderPlatformOwnerTransferSources(items) {
  const records = items || [];
  return `
    <section>
      <span>Source consumed</span>
      <div class="cold-start-archive-context">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.source)}: ${escapeHtml(item.authority || "Private transfer context only")}</code>`).join("")
            : `<code>No consumed source recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderPlatformOwnerTransferHardStops(items) {
  const records = items || [];
  return `
    <section>
      <span>Hard stops</span>
      <div class="cold-start-archive-facts">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.condition)}: ${escapeHtml(item.response || "Stop; keep No-Go / Do Not Deploy")}</code>`).join("")
            : `<code>No hard stops recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderOperatorResumePacketGuardrailVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="cold-start-archive-card operator-resume-guardrail-card">
      <div class="cold-start-archive-head">
        <div>
          <span>Private operator-resume packet guardrail</span>
          <strong>${escapeHtml(visibility.blockedOperatorActionCount || 0)} blocked actions, ${escapeHtml(visibility.finalNoGoCount || 0)} final No-Go</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private operator-resume packet guardrail"}</small>
      </div>
      <div class="cold-start-archive-counts">
        ${renderColdStartArchiveCount("Rows", visibility.total || 0)}
        ${renderColdStartArchiveCount("Final No-Go", visibility.finalNoGoCount || 0)}
        ${renderColdStartArchiveCount("Blocked actions", visibility.blockedOperatorActionCount || 0)}
        ${renderColdStartArchiveCount("Outside-repo facts", visibility.outsideRepoFactCount || 0)}
        ${renderColdStartArchiveCount("Deploy actions", visibility.deployActionAvailableCount || 0)}
      </div>
      <div class="cold-start-archive-list">
        ${(visibility.rows || []).map(renderOperatorResumePacketGuardrailRow).join("")}
      </div>
    </article>
  `;
}

function renderOperatorResumePacketGuardrailRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="cold-start-archive-row ${escapeHtml(row.state || "operator-resume-packet-guardrail-visible-no-go")}">
      <div class="cold-start-archive-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Guardrail visible")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.finalState?.decision || "No-Go / Do Not Deploy")}</strong>
      </div>
      <small>${escapeHtml(row.gate || "")}</small>
      <div class="cold-start-archive-status">
        <section class="cold-start-archive-final-state">
          <span>Final blocker state</span>
          <p>${escapeHtml(row.finalState?.productionDeploymentState || "Do Not Deploy")}</p>
          <p>${escapeHtml(row.finalState?.reasonDeploymentBlocked || "")}</p>
        </section>
        ${renderOperatorResumeGuardrailSummary(row.guardrailSummary)}
        ${renderPlatformOwnerTransferRestrictedSurfaces(row.restrictedSurfaceCounts)}
        ${renderOperatorResumeBlockedActions(row.blockedOperatorActions)}
        ${renderOperatorResumeOutsideRepoFacts(row.outsideRepoFacts)}
        ${renderOperatorResumeSources(row.sourceConsumed)}
      </div>
      <div class="cold-start-archive-evidence">
        <span>${escapeHtml(row.boundary || "Private operator-resume packet guardrail visibility only.")}</span>
        ${
          sourceArtifacts.length
            ? `<div class="cold-start-archive-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/deploy\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderOperatorResumeGuardrailSummary(summary) {
  const item = summary || {};
  return `
    <section>
      <span>Guardrail summary</span>
      <div class="cold-start-archive-state">
        <code>Guardrail created: ${escapeHtml(item.guardrailCreated || "No")}</code>
        <code>Source consumed: ${escapeHtml(item.sourceConsumed || "Not observed")}</code>
        <code>External facts requested: ${escapeHtml(item.externalDeployFactsRequested || "No")}</code>
        <code>Credentials requested/stored: ${escapeHtml(item.credentialsRequestedOrStored || "No")}</code>
        <code>Platform values requested/stored: ${escapeHtml(item.platformValuesRequestedOrStored || "No")}</code>
        <code>Production URL requested/stored: ${escapeHtml(item.productionUrlRequestedOrStored || "No")}</code>
        <code>Deploy trigger requested/stored: ${escapeHtml(item.deployTriggerRequestedOrStored || "No")}</code>
        <code>Rollback details requested/stored: ${escapeHtml(item.rollbackDetailsRequestedOrStored || "No")}</code>
        <code>Executable sequence created: ${escapeHtml(item.executableDeploySequenceCreated || "No")}</code>
        <code>External fact authority: ${escapeHtml(item.externalFactAuthority || "outside repo authority")}</code>
      </div>
    </section>
  `;
}

function renderOperatorResumeBlockedActions(items) {
  const records = items || [];
  return `
    <section>
      <span>Blocked operator actions</span>
      <div class="cold-start-archive-facts">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.action)}: ${escapeHtml(item.response || "Stop; keep No-Go / Do Not Deploy")}</code>`).join("")
            : `<code>No blocked operator actions recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderOperatorResumeOutsideRepoFacts(items) {
  const records = items || [];
  return `
    <section>
      <span>Outside-repo facts</span>
      <div class="cold-start-archive-facts">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.topic)}: ${escapeHtml(item.state || "Not observed")} | ${escapeHtml(item.authority || "outside repo authority")}</code>`).join("")
            : `<code>No outside-repo facts recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderOperatorResumeSources(items) {
  const records = items || [];
  return `
    <section>
      <span>Guardrail source</span>
      <div class="cold-start-archive-context">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.source)}: ${escapeHtml(item.authority || "Private resume guardrail context only")}</code>`).join("")
            : `<code>No consumed source recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderBlockedStateOperatorContinuationIndexVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="cold-start-archive-card blocked-state-continuation-index-card">
      <div class="cold-start-archive-head">
        <div>
          <span>Private blocked-state operator continuation index</span>
          <strong>${escapeHtml(visibility.blockedOperatorActionCount || 0)} continuation limits, ${escapeHtml(visibility.finalNoGoCount || 0)} final No-Go</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private blocked-state continuation index"}</small>
      </div>
      <div class="cold-start-archive-counts">
        ${renderColdStartArchiveCount("Rows", visibility.total || 0)}
        ${renderColdStartArchiveCount("Final No-Go", visibility.finalNoGoCount || 0)}
        ${renderColdStartArchiveCount("Continuation limits", visibility.blockedOperatorActionCount || 0)}
        ${renderColdStartArchiveCount("Outside-repo facts", visibility.outsideRepoFactCount || 0)}
        ${renderColdStartArchiveCount("Deploy actions", visibility.deployActionAvailableCount || 0)}
      </div>
      <div class="cold-start-archive-list">
        ${(visibility.rows || []).map(renderBlockedStateOperatorContinuationIndexRow).join("")}
      </div>
    </article>
  `;
}

function renderBlockedStateOperatorContinuationIndexRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  const indexSummary = row.indexSummary || {};
  return `
    <section class="cold-start-archive-row ${escapeHtml(row.state || "blocked-state-continuation-index-visible-no-go")}">
      <div class="cold-start-archive-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Continuation index visible")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.finalState?.decision || "No-Go / Do Not Deploy")}</strong>
      </div>
      <small>${escapeHtml(row.gate || "")}</small>
      <div class="cold-start-archive-status">
        <section class="cold-start-archive-final-state">
          <span>Final blocker state</span>
          <p>${escapeHtml(row.finalState?.productionDeploymentState || "Do Not Deploy")}</p>
          <p>${escapeHtml(row.finalState?.reasonDeploymentBlocked || "")}</p>
        </section>
        ${renderBlockedStateContinuationIndexSummary(indexSummary)}
        ${renderPlatformOwnerTransferRestrictedSurfaces(row.restrictedSurfaceCounts)}
        ${renderOperatorResumeBlockedActions(row.blockedOperatorActions)}
        ${renderOperatorResumeOutsideRepoFacts(row.outsideRepoFacts)}
        ${renderBlockedStateContinuationIndexSources(row.sourceConsumed)}
      </div>
      <div class="cold-start-archive-evidence">
        <span>${escapeHtml(row.boundary || "Private blocked-state operator continuation index visibility only.")}</span>
        ${
          sourceArtifacts.length
            ? `<div class="cold-start-archive-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/deploy\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderBlockedStateContinuationIndexSummary(summary) {
  const item = summary || {};
  return `
    <section>
      <span>Continuation index summary</span>
      <div class="cold-start-archive-state">
        <code>Index created: ${escapeHtml(item.indexCreated || "No")}</code>
        <code>Source consumed: ${escapeHtml(item.sourceConsumed || "Not observed")}</code>
        <code>Continuation posture: ${escapeHtml(item.continuationPosture || "Private read-only context")}</code>
        <code>Request posture: ${escapeHtml(item.requestPosture || "non-request")}</code>
        <code>Execution posture: ${escapeHtml(item.executionPosture || "non-executable")}</code>
        <code>External facts requested: ${escapeHtml(item.externalDeployFactsRequested || "No")}</code>
        <code>Credentials requested/stored: ${escapeHtml(item.credentialsRequestedOrStored || "No")}</code>
        <code>Platform values requested/stored: ${escapeHtml(item.platformValuesRequestedOrStored || "No")}</code>
        <code>Production URL requested/stored: ${escapeHtml(item.productionUrlRequestedOrStored || "No")}</code>
        <code>Deploy trigger requested/stored: ${escapeHtml(item.deployTriggerRequestedOrStored || "No")}</code>
        <code>Rollback details requested/stored: ${escapeHtml(item.rollbackDetailsRequestedOrStored || "No")}</code>
        <code>Executable sequence created: ${escapeHtml(item.executableDeploySequenceCreated || "No")}</code>
        <code>External fact authority: ${escapeHtml(item.externalFactAuthority || "outside repo authority")}</code>
      </div>
    </section>
  `;
}

function renderBlockedStateContinuationIndexSources(items) {
  const records = items || [];
  return `
    <section>
      <span>Index source</span>
      <div class="cold-start-archive-context">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.source)}: ${escapeHtml(item.authority || "Private blocked-state context only")}</code>`).join("")
            : `<code>No consumed source recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderAutonomousDeployStopLedgerVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="cold-start-archive-card autonomous-deploy-stop-ledger-card">
      <div class="cold-start-archive-head">
        <div>
          <span>Private autonomous deploy stop ledger</span>
          <strong>${escapeHtml(visibility.stopConditionCount || 0)} stop conditions, ${escapeHtml(visibility.finalNoGoCount || 0)} final No-Go</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private autonomous deploy stop ledger"}</small>
      </div>
      <div class="cold-start-archive-counts">
        ${renderColdStartArchiveCount("Rows", visibility.total || 0)}
        ${renderColdStartArchiveCount("Final No-Go", visibility.finalNoGoCount || 0)}
        ${renderColdStartArchiveCount("Stop conditions", visibility.stopConditionCount || 0)}
        ${renderColdStartArchiveCount("Outside-repo facts", visibility.outsideRepoFactCount || 0)}
        ${renderColdStartArchiveCount("Deploy actions", visibility.deployActionAvailableCount || 0)}
      </div>
      <div class="cold-start-archive-list">
        ${(visibility.rows || []).map(renderAutonomousDeployStopLedgerRow).join("")}
      </div>
    </article>
  `;
}

function renderAutonomousDeployStopLedgerRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  const ledgerSummary = row.ledgerSummary || {};
  return `
    <section class="cold-start-archive-row ${escapeHtml(row.state || "autonomous-deploy-stop-ledger-visible-no-go")}">
      <div class="cold-start-archive-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Stop ledger visible")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.finalState?.decision || "No-Go / Do Not Deploy")}</strong>
      </div>
      <small>${escapeHtml(row.gate || "")}</small>
      <div class="cold-start-archive-status">
        <section class="cold-start-archive-final-state">
          <span>Final blocker state</span>
          <p>${escapeHtml(row.finalState?.productionDeploymentState || "Do Not Deploy")}</p>
          <p>${escapeHtml(row.finalState?.reasonDeploymentBlocked || "")}</p>
        </section>
        ${renderAutonomousDeployStopLedgerSummary(ledgerSummary)}
        ${renderPlatformOwnerTransferRestrictedSurfaces(row.restrictedSurfaceCounts)}
        ${renderAutonomousDeployStopConditions(row.stopConditions)}
        ${renderOperatorResumeOutsideRepoFacts(row.outsideRepoFacts)}
        ${renderAutonomousDeployStopLedgerSources(row.sourceConsumed)}
      </div>
      <div class="cold-start-archive-evidence">
        <span>${escapeHtml(row.boundary || "Private autonomous deploy stop ledger visibility only.")}</span>
        ${
          sourceArtifacts.length
            ? `<div class="cold-start-archive-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/deploy\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderAutonomousDeployStopLedgerSummary(summary) {
  const item = summary || {};
  return `
    <section>
      <span>Stop-ledger summary</span>
      <div class="cold-start-archive-state">
        <code>Ledger created: ${escapeHtml(item.ledgerCreated || "No")}</code>
        <code>Source consumed: ${escapeHtml(item.sourceConsumed || "Not observed")}</code>
        <code>Autonomous posture: ${escapeHtml(item.autonomousPosture || "Autonomous stop")}</code>
        <code>Continuation posture: ${escapeHtml(item.continuationPosture || "Private read-only context")}</code>
        <code>Request posture: ${escapeHtml(item.requestPosture || "non-request")}</code>
        <code>Execution posture: ${escapeHtml(item.executionPosture || "non-executable")}</code>
        <code>External facts requested: ${escapeHtml(item.externalDeployFactsRequested || "No")}</code>
        <code>Credentials requested/stored: ${escapeHtml(item.credentialsRequestedOrStored || "No")}</code>
        <code>Platform values requested/stored: ${escapeHtml(item.platformValuesRequestedOrStored || "No")}</code>
        <code>Production URL requested/stored: ${escapeHtml(item.productionUrlRequestedOrStored || "No")}</code>
        <code>Deploy trigger requested/stored: ${escapeHtml(item.deployTriggerRequestedOrStored || "No")}</code>
        <code>Rollback details requested/stored: ${escapeHtml(item.rollbackDetailsRequestedOrStored || "No")}</code>
        <code>Post-deploy health requested/stored: ${escapeHtml(item.postDeployHealthValuesRequestedOrStored || "No")}</code>
        <code>Executable sequence created: ${escapeHtml(item.executableDeploySequenceCreated || "No")}</code>
        <code>External fact authority: ${escapeHtml(item.externalFactAuthority || "outside repo authority")}</code>
      </div>
    </section>
  `;
}

function renderAutonomousDeployStopConditions(items) {
  const records = items || [];
  return `
    <section>
      <span>Autonomous stop conditions</span>
      <div class="cold-start-archive-context">
        ${
          records.length
            ? records
                .map(
                  (item) =>
                    `<code>${escapeHtml(item.surface)}: ${escapeHtml(item.state || "Autonomous stop")} | ${escapeHtml(item.stopCondition || item.allowedHandling || "Stop; keep No-Go / Do Not Deploy")}</code>`
                )
                .join("")
            : `<code>No autonomous stop conditions recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderAutonomousDeployStopLedgerSources(items) {
  const records = items || [];
  return `
    <section>
      <span>Stop-ledger source</span>
      <div class="cold-start-archive-context">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.source)}: ${escapeHtml(item.authority || "Private autonomous stop context only")}</code>`).join("")
            : `<code>No consumed source recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderPostAutonomousStopRecoveryChecklistVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="cold-start-archive-card post-autonomous-stop-recovery-card">
      <div class="cold-start-archive-head">
        <div>
          <span>Private post-autonomous-stop recovery checklist</span>
          <strong>${escapeHtml(visibility.recoveryCheckCount || 0)} recovery checks, ${escapeHtml(visibility.finalNoGoCount || 0)} final No-Go</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private post-autonomous-stop recovery checklist"}</small>
      </div>
      <div class="cold-start-archive-counts">
        ${renderColdStartArchiveCount("Rows", visibility.total || 0)}
        ${renderColdStartArchiveCount("Final No-Go", visibility.finalNoGoCount || 0)}
        ${renderColdStartArchiveCount("Recovery checks", visibility.recoveryCheckCount || 0)}
        ${renderColdStartArchiveCount("Outside-repo facts", visibility.outsideRepoFactCount || 0)}
        ${renderColdStartArchiveCount("Deploy actions", visibility.deployActionAvailableCount || 0)}
      </div>
      <div class="cold-start-archive-list">
        ${(visibility.rows || []).map(renderPostAutonomousStopRecoveryChecklistRow).join("")}
      </div>
    </article>
  `;
}

function renderPostAutonomousStopRecoveryChecklistRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  const recoverySummary = row.recoverySummary || {};
  return `
    <section class="cold-start-archive-row ${escapeHtml(row.state || "post-autonomous-stop-recovery-checklist-visible-no-go")}">
      <div class="cold-start-archive-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Recovery checklist visible")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.finalState?.decision || "No-Go / Do Not Deploy")}</strong>
      </div>
      <small>${escapeHtml(row.gate || "")}</small>
      <div class="cold-start-archive-status">
        <section class="cold-start-archive-final-state">
          <span>Final blocker state</span>
          <p>${escapeHtml(row.finalState?.productionDeploymentState || "Do Not Deploy")}</p>
          <p>${escapeHtml(row.finalState?.publishingState || "Do Not Publish")}</p>
          <p>${escapeHtml(row.finalState?.reasonDeploymentBlocked || "")}</p>
        </section>
        ${renderPostAutonomousStopRecoveryChecklistSummary(recoverySummary)}
        ${renderPlatformOwnerTransferRestrictedSurfaces(row.restrictedSurfaceCounts)}
        ${renderPostAutonomousStopRecoveryChecks(row.recoveryChecks)}
        ${renderOperatorResumeOutsideRepoFacts(row.outsideRepoFacts)}
        ${renderPostAutonomousStopRecoveryChecklistSources(row.sourceConsumed)}
      </div>
      <div class="cold-start-archive-evidence">
        <span>${escapeHtml(row.boundary || "Private post-autonomous-stop recovery checklist visibility only.")}</span>
        ${
          sourceArtifacts.length
            ? `<div class="cold-start-archive-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/deploy\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderPostAutonomousStopRecoveryChecklistSummary(summary) {
  const item = summary || {};
  return `
    <section>
      <span>Recovery summary</span>
      <div class="cold-start-archive-state">
        <code>Checklist created: ${escapeHtml(item.checklistCreated || "No")}</code>
        <code>Source consumed: ${escapeHtml(item.sourceConsumed || "Not observed")}</code>
        <code>Autonomous posture: ${escapeHtml(item.autonomousPosture || "autonomous recovery boundary")}</code>
        <code>Continuation posture: ${escapeHtml(item.continuationPosture || "Private read-only context")}</code>
        <code>Request posture: ${escapeHtml(item.requestPosture || "non-request")}</code>
        <code>Execution posture: ${escapeHtml(item.executionPosture || "non-executable")}</code>
        <code>External facts requested: ${escapeHtml(item.externalDeployFactsRequested || "No")}</code>
        <code>Values requested: ${escapeHtml(item.valuesRequested || "No")}</code>
        <code>Deploy unlocked: ${escapeHtml(item.deployUnlocked || "No")}</code>
        <code>Execution implied: ${escapeHtml(item.executionImplied || "No")}</code>
        <code>Authority bypassed: ${escapeHtml(item.authorityBypassed || "No")}</code>
        <code>Credentials requested/stored: ${escapeHtml(item.credentialsRequestedOrStored || "No")}</code>
        <code>Platform values requested/stored: ${escapeHtml(item.platformValuesRequestedOrStored || "No")}</code>
        <code>Production URL requested/stored: ${escapeHtml(item.productionUrlRequestedOrStored || "No")}</code>
        <code>Deploy trigger requested/stored: ${escapeHtml(item.deployTriggerRequestedOrStored || "No")}</code>
        <code>Rollback details requested/stored: ${escapeHtml(item.rollbackDetailsRequestedOrStored || "No")}</code>
        <code>Post-deploy health requested/stored: ${escapeHtml(item.postDeployHealthValuesRequestedOrStored || "No")}</code>
        <code>Executable sequence created: ${escapeHtml(item.executableDeploySequenceCreated || "No")}</code>
        <code>External fact authority: ${escapeHtml(item.externalFactAuthority || "outside repo authority")}</code>
      </div>
    </section>
  `;
}

function renderPostAutonomousStopRecoveryChecks(items) {
  const records = items || [];
  return `
    <section>
      <span>Stop/recovery boundaries</span>
      <div class="cold-start-archive-context">
        ${
          records.length
            ? records
                .map(
                  (item) =>
                    `<code>${escapeHtml(item.check)}: ${escapeHtml(item.requiredState || "Private blocked state")} | ${escapeHtml(item.stopCondition || item.passCondition || "Stop; keep No-Go / Do Not Deploy")}</code>`
                )
                .join("")
            : `<code>No recovery checks recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderPostAutonomousStopRecoveryChecklistSources(items) {
  const records = items || [];
  return `
    <section>
      <span>Recovery source</span>
      <div class="cold-start-archive-context">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.source)}: ${escapeHtml(item.authority || "Private recovery boundary only")}</code>`).join("")
            : `<code>No consumed source recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderHumanPlatformAuthorityReEntryGateVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="cold-start-archive-card human-platform-authority-re-entry-card">
      <div class="cold-start-archive-head">
        <div>
          <span>Private human-platform-authority re-entry gate</span>
          <strong>${escapeHtml(visibility.authorityGateBoundaryCount || 0)} authority boundaries, ${escapeHtml(visibility.finalNoGoCount || 0)} final No-Go</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from private human-platform-authority re-entry gate"}</small>
      </div>
      <div class="cold-start-archive-counts">
        ${renderColdStartArchiveCount("Rows", visibility.total || 0)}
        ${renderColdStartArchiveCount("Final No-Go", visibility.finalNoGoCount || 0)}
        ${renderColdStartArchiveCount("Authority boundaries", visibility.authorityGateBoundaryCount || 0)}
        ${renderColdStartArchiveCount("Outside-repo facts", visibility.outsideRepoFactCount || 0)}
        ${renderColdStartArchiveCount("Authority bypasses", visibility.authorityBypassCount || 0)}
        ${renderColdStartArchiveCount("Deploy actions", visibility.deployActionAvailableCount || 0)}
      </div>
      <div class="cold-start-archive-list">
        ${(visibility.rows || []).map(renderHumanPlatformAuthorityReEntryGateRow).join("")}
      </div>
    </article>
  `;
}

function renderHumanPlatformAuthorityReEntryGateRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  const reEntrySummary = row.reEntrySummary || {};
  return `
    <section class="cold-start-archive-row ${escapeHtml(row.state || "human-platform-authority-re-entry-gate-visible-no-go")}">
      <div class="cold-start-archive-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Re-entry gate visible")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.finalState?.decision || "No-Go / Do Not Deploy")}</strong>
      </div>
      <small>${escapeHtml(row.gate || "")}</small>
      <div class="cold-start-archive-status">
        <section class="cold-start-archive-final-state">
          <span>Final blocker state</span>
          <p>${escapeHtml(row.finalState?.productionDeploymentState || "Do Not Deploy")}</p>
          <p>${escapeHtml(row.finalState?.publishingState || "Do Not Publish")}</p>
          <p>${escapeHtml(row.finalState?.reasonDeploymentBlocked || "")}</p>
        </section>
        ${renderHumanPlatformAuthorityReEntrySummary(reEntrySummary)}
        ${renderPlatformOwnerTransferRestrictedSurfaces(row.restrictedSurfaceCounts)}
        ${renderHumanPlatformAuthorityGateBoundaries(row.authorityGateBoundaries)}
        ${renderOperatorResumeOutsideRepoFacts(row.outsideRepoFacts)}
        ${renderHumanPlatformAuthorityReEntrySources(row.sourceConsumed)}
      </div>
      <div class="cold-start-archive-evidence">
        <span>${escapeHtml(row.boundary || "Private human-platform-authority re-entry gate visibility only.")}</span>
        ${
          sourceArtifacts.length
            ? `<div class="cold-start-archive-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/deploy\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderHumanPlatformAuthorityReEntrySummary(summary) {
  const item = summary || {};
  return `
    <section>
      <span>Re-entry summary</span>
      <div class="cold-start-archive-state">
        <code>Gate created: ${escapeHtml(item.gateCreated || "No")}</code>
        <code>Source consumed: ${escapeHtml(item.sourceConsumed || "Not observed")}</code>
        <code>Autonomous posture: ${escapeHtml(item.autonomousPosture || "autonomous recovery boundary")}</code>
        <code>Recovery posture: ${escapeHtml(item.recoveryPosture || "Private read-only context")}</code>
        <code>Re-entry posture: ${escapeHtml(item.reEntryPosture || "Blocked by human-platform authority")}</code>
        <code>Request posture: ${escapeHtml(item.requestPosture || "non-request")}</code>
        <code>Execution posture: ${escapeHtml(item.executionPosture || "non-executable")}</code>
        <code>External facts requested: ${escapeHtml(item.externalDeployFactsRequested || "No")}</code>
        <code>Values requested: ${escapeHtml(item.valuesRequested || "No")}</code>
        <code>Deploy unlocked: ${escapeHtml(item.deployUnlocked || "No")}</code>
        <code>Execution implied: ${escapeHtml(item.executionImplied || "No")}</code>
        <code>Authority bypassed: ${escapeHtml(item.humanPlatformAuthorityBypassed || "No")}</code>
        <code>Credentials requested/stored: ${escapeHtml(item.credentialsRequestedOrStored || "No")}</code>
        <code>Platform values requested/stored: ${escapeHtml(item.platformValuesRequestedOrStored || "No")}</code>
        <code>Production URL requested/stored: ${escapeHtml(item.productionUrlRequestedOrStored || "No")}</code>
        <code>Deploy trigger requested/stored: ${escapeHtml(item.deployTriggerRequestedOrStored || "No")}</code>
        <code>Rollback details requested/stored: ${escapeHtml(item.rollbackDetailsRequestedOrStored || "No")}</code>
        <code>Post-deploy health requested/stored: ${escapeHtml(item.postDeployHealthValuesRequestedOrStored || "No")}</code>
        <code>Executable sequence created: ${escapeHtml(item.executableDeploySequenceCreated || "No")}</code>
        <code>External fact authority: ${escapeHtml(item.externalFactAuthority || "outside repo authority")}</code>
      </div>
    </section>
  `;
}

function renderHumanPlatformAuthorityGateBoundaries(items) {
  const records = items || [];
  return `
    <section>
      <span>Authority gate boundaries</span>
      <div class="cold-start-archive-context">
        ${
          records.length
            ? records
                .map(
                  (item) =>
                    `<code>${escapeHtml(item.check)}: ${escapeHtml(item.requiredState || "Private blocked state")} | ${escapeHtml(item.gateResult || "Re-entry blocked")} | ${escapeHtml(item.stopCondition || "Stop; keep No-Go / Do Not Deploy")}</code>`
                )
                .join("")
            : `<code>No authority gate boundaries recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderHumanPlatformAuthorityReEntrySources(items) {
  const records = items || [];
  return `
    <section>
      <span>Re-entry source</span>
      <div class="cold-start-archive-context">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.source)}: ${escapeHtml(item.authority || "Private re-entry boundary only")}</code>`).join("")
            : `<code>No consumed source recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderOutsideAuthorityAwaitingStateLedgerVisibility(visibility) {
  if (!visibility || !visibility.rows?.length) return "";
  return `
    <article class="cold-start-archive-card outside-authority-awaiting-state-ledger-card">
      <div class="cold-start-archive-head">
        <div>
          <span>Private outside-authority awaiting-state ledger</span>
          <strong>${escapeHtml(visibility.awaitingRowCount || 0)} awaiting rows, ${escapeHtml(visibility.finalNoGoCount || 0)} final No-Go</strong>
        </div>
        <small>${
          (visibility.generatedFrom || []).length
            ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}`
            : "Derived from private outside-authority awaiting-state ledger"
        }</small>
      </div>
      <div class="cold-start-archive-counts">
        ${renderColdStartArchiveCount("Rows", visibility.total || 0)}
        ${renderColdStartArchiveCount("Final No-Go", visibility.finalNoGoCount || 0)}
        ${renderColdStartArchiveCount("Awaiting rows", visibility.awaitingRowCount || 0)}
        ${renderColdStartArchiveCount("Outside-repo facts", visibility.outsideRepoFactCount || 0)}
        ${renderColdStartArchiveCount("Authority bypasses", visibility.authorityBypassCount || 0)}
        ${renderColdStartArchiveCount("Deploy actions", visibility.deployActionAvailableCount || 0)}
      </div>
      <div class="cold-start-archive-list">
        ${(visibility.rows || []).map(renderOutsideAuthorityAwaitingStateLedgerRow).join("")}
      </div>
    </article>
  `;
}

function renderOutsideAuthorityAwaitingStateLedgerRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  const awaitingSummary = row.awaitingSummary || {};
  return `
    <section class="cold-start-archive-row ${escapeHtml(row.state || "outside-authority-awaiting-state-ledger-visible-no-go")}">
      <div class="cold-start-archive-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Awaiting ledger visible")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.finalState?.decision || "No-Go / Do Not Deploy")}</strong>
      </div>
      <small>${escapeHtml(row.gate || "")}</small>
      <div class="cold-start-archive-status">
        <section class="cold-start-archive-final-state">
          <span>Final blocker state</span>
          <p>${escapeHtml(row.finalState?.productionDeploymentState || "Do Not Deploy")}</p>
          <p>${escapeHtml(row.finalState?.publishingState || "Do Not Publish")}</p>
          <p>${escapeHtml(row.finalState?.reasonDeploymentBlocked || "")}</p>
        </section>
        ${renderOutsideAuthorityAwaitingStateLedgerSummary(awaitingSummary)}
        ${renderPlatformOwnerTransferRestrictedSurfaces(row.restrictedSurfaceCounts)}
        ${renderOutsideAuthorityAwaitingStateLedgerRows(row.awaitingRows)}
        ${renderOperatorResumeOutsideRepoFacts(row.outsideRepoFacts)}
        ${renderOutsideAuthorityAwaitingStateLedgerSources(row.sourceConsumed)}
      </div>
      <div class="cold-start-archive-evidence">
        <span>${escapeHtml(row.boundary || "Private outside-authority awaiting-state ledger visibility only.")}</span>
        ${
          sourceArtifacts.length
            ? `<div class="cold-start-archive-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/deploy\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderOutsideAuthorityAwaitingStateLedgerSummary(summary) {
  const item = summary || {};
  return `
    <section>
      <span>Awaiting summary</span>
      <div class="cold-start-archive-state">
        <code>Ledger created: ${escapeHtml(item.ledgerCreated || "No")}</code>
        <code>Source consumed: ${escapeHtml(item.sourceConsumed || "Not observed")}</code>
        <code>Autonomous posture: ${escapeHtml(item.autonomousPosture || "autonomous recovery boundary")}</code>
        <code>Recovery posture: ${escapeHtml(item.recoveryPosture || "Private read-only context")}</code>
        <code>Awaiting posture: ${escapeHtml(item.awaitingPosture || "Blocked by human-platform authority")}</code>
        <code>Request posture: ${escapeHtml(item.requestPosture || "non-request")}</code>
        <code>Execution posture: ${escapeHtml(item.executionPosture || "non-executable")}</code>
        <code>External facts requested: ${escapeHtml(item.externalDeployFactsRequested || "No")}</code>
        <code>Values requested: ${escapeHtml(item.valuesRequested || "No")}</code>
        <code>Deploy unlocked: ${escapeHtml(item.deployUnlocked || "No")}</code>
        <code>Execution implied: ${escapeHtml(item.executionImplied || "No")}</code>
        <code>Authority bypassed: ${escapeHtml(item.humanPlatformAuthorityBypassed || "No")}</code>
        <code>Credentials requested/stored: ${escapeHtml(item.credentialsRequestedOrStored || "No")}</code>
        <code>Platform values requested/stored: ${escapeHtml(item.platformValuesRequestedOrStored || "No")}</code>
        <code>Production URL requested/stored: ${escapeHtml(item.productionUrlRequestedOrStored || "No")}</code>
        <code>Deploy trigger requested/stored: ${escapeHtml(item.deployTriggerRequestedOrStored || "No")}</code>
        <code>Rollback details requested/stored: ${escapeHtml(item.rollbackDetailsRequestedOrStored || "No")}</code>
        <code>Post-deploy health requested/stored: ${escapeHtml(item.postDeployHealthValuesRequestedOrStored || "No")}</code>
        <code>Executable sequence created: ${escapeHtml(item.executableDeploySequenceCreated || "No")}</code>
        <code>External fact authority: ${escapeHtml(item.externalFactAuthority || "outside repo authority")}</code>
      </div>
    </section>
  `;
}

function renderOutsideAuthorityAwaitingStateLedgerRows(items) {
  const records = items || [];
  return `
    <section>
      <span>Awaiting rows</span>
      <div class="cold-start-archive-context">
        ${
          records.length
            ? records
                .map(
                  (item) =>
                    `<code>${escapeHtml(item.awaitingItem)}: ${escapeHtml(item.requiredState || "Not observed")} | ${escapeHtml(item.ledgerResult || "Awaiting state preserved")} | ${escapeHtml(item.stopCondition || "Stop; Do Not Publish / Do Not Deploy")}</code>`
                )
                .join("")
            : `<code>No awaiting rows recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderOutsideAuthorityAwaitingStateLedgerSources(items) {
  const records = items || [];
  return `
    <section>
      <span>Awaiting source</span>
      <div class="cold-start-archive-context">
        ${
          records.length
            ? records.map((item) => `<code>${escapeHtml(item.source)}: ${escapeHtml(item.authority || "Private awaiting boundary only")}</code>`).join("")
            : `<code>No consumed source recorded</code>`
        }
      </div>
    </section>
  `;
}

function renderObjectionCodingReadiness(readiness) {
  if (!readiness || !readiness.rows?.length) return "";
  return `
    <article class="objection-coding-card">
      <div class="objection-coding-head">
        <div>
          <span>Objection-coding readiness</span>
          <strong>${escapeHtml(readiness.blockedCount || 0)} blocked before coding</strong>
        </div>
        <small>${(readiness.generatedFrom || []).length ? `Derived from ${escapeHtml(readiness.generatedFrom.join(", "))}` : "Derived from local objection-coding facts"}</small>
      </div>
      <div class="objection-coding-counts">
        ${renderObjectionCodingCount("Blocked", readiness.blockedCount || 0)}
        ${renderObjectionCodingCount("Debrief ready", readiness.debriefReadyCount || 0)}
        ${renderObjectionCodingCount("Codes recorded", readiness.codesRecordedCount || 0)}
        ${renderObjectionCodingCount("Synthesis ready", readiness.synthesisReadyCount || 0)}
      </div>
      <div class="objection-coding-list">
        ${(readiness.rows || []).map(renderObjectionCodingRow).join("")}
      </div>
    </article>
  `;
}

function renderObjectionCodingCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderObjectionCodingRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="objection-coding-row ${escapeHtml(row.state || "blocked")}">
      <div class="objection-coding-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Blocked")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.blocked ? "Blocked" : "Open")}</strong>
      </div>
      <small>${escapeHtml(row.rationale || "")}</small>
      <div class="objection-coding-meta">
        <section>
          <span>Coding gate</span>
          <p>${escapeHtml(row.gate || "Do not open objection coding without private post-session debrief evidence.")}</p>
        </section>
        <section>
          <span>Missing facts</span>
          <p>${escapeHtml((row.missing || []).join(", ") || "No missing required fact detected")}</p>
        </section>
        <section>
          <span>Evidence boundary</span>
          <p>Demand, testimonials, willingness-to-pay, pricing, and outcomes remain unobserved.</p>
        </section>
      </div>
      <div class="objection-coding-evidence">
        <span>${escapeHtml(row.evidenceNote || "No demand or outcome claim made.")}</span>
        ${
          (row.matchedArtifacts || []).length
            ? row.matchedArtifacts
                .map(
                  (artifact) => `
                    <code>${escapeHtml(
                      `${artifact.source}#${artifact.index}: ${artifact.state} / debrief:${artifact.debriefReady ? "yes" : "no"} / codes:${artifact.codesRecorded ? "yes" : "no"} / synthesis:${artifact.synthesisReady ? "yes" : "no"}${artifact.route ? ` / ${artifact.route}` : ""}`
                    )}</code>
                  `
                )
                .join("")
            : `<code>No repo-visible debrief-ready, codes-recorded, or synthesis-ready fact matched this row.</code>`
        }
        ${
          sourceArtifacts.length
            ? `<div class="objection-coding-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/(research|launch)\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderPostSessionDebriefReadiness(readiness) {
  if (!readiness || !readiness.rows?.length) return "";
  return `
    <article class="post-debrief-card">
      <div class="post-debrief-head">
        <div>
          <span>Post-session debrief readiness</span>
          <strong>${escapeHtml(readiness.blockedCount || 0)} blocked before debrief</strong>
        </div>
        <small>${(readiness.generatedFrom || []).length ? `Derived from ${escapeHtml(readiness.generatedFrom.join(", "))}` : "Derived from local debrief facts"}</small>
      </div>
      <div class="post-debrief-counts">
        ${renderPostDebriefCount("Blocked", readiness.blockedCount || 0)}
        ${renderPostDebriefCount("Notes ready", readiness.notesReadyCount || 0)}
        ${renderPostDebriefCount("Debrief drafted", readiness.debriefDraftedCount || 0)}
        ${renderPostDebriefCount("Synthesis ready", readiness.synthesisReadyCount || 0)}
      </div>
      <div class="post-debrief-list">
        ${(readiness.rows || []).map(renderPostSessionDebriefRow).join("")}
      </div>
    </article>
  `;
}

function renderPostDebriefCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderPostSessionDebriefRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="post-debrief-row ${escapeHtml(row.state || "blocked")}">
      <div class="post-debrief-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Blocked")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.blocked ? "Blocked" : "Open")}</strong>
      </div>
      <small>${escapeHtml(row.rationale || "")}</small>
      <div class="post-debrief-meta">
        <section>
          <span>Debrief gate</span>
          <p>${escapeHtml(row.gate || "Do not open post-session debrief without real raw notes.")}</p>
        </section>
        <section>
          <span>Missing facts</span>
          <p>${escapeHtml((row.missing || []).join(", ") || "No missing required fact detected")}</p>
        </section>
        <section>
          <span>Evidence boundary</span>
          <p>Demand, testimonials, willingness-to-pay, pricing, and outcomes remain unobserved.</p>
        </section>
      </div>
      <div class="post-debrief-evidence">
        <span>${escapeHtml(row.evidenceNote || "No demand or outcome claim made.")}</span>
        ${
          (row.matchedArtifacts || []).length
            ? row.matchedArtifacts
                .map(
                  (artifact) => `
                    <code>${escapeHtml(
                      `${artifact.source}#${artifact.index}: ${artifact.state} / notes:${artifact.notesReady ? "yes" : "no"} / debrief:${artifact.debriefDrafted ? "yes" : "no"} / synthesis:${artifact.synthesisReady ? "yes" : "no"}${artifact.route ? ` / ${artifact.route}` : ""}`
                    )}</code>
                  `
                )
                .join("")
            : `<code>No repo-visible raw-note-ready, debrief-drafted, or synthesis-ready fact matched this row.</code>`
        }
        ${
          sourceArtifacts.length
            ? `<div class="post-debrief-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/(research|launch)\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderRawNoteCaptureReadiness(readiness) {
  if (!readiness || !readiness.rows?.length) return "";
  return `
    <article class="raw-note-card">
      <div class="raw-note-head">
        <div>
          <span>Raw-note capture readiness</span>
          <strong>${escapeHtml(readiness.blockedCount || 0)} blocked before capture</strong>
        </div>
        <small>${(readiness.generatedFrom || []).length ? `Derived from ${escapeHtml(readiness.generatedFrom.join(", "))}` : "Derived from local raw-note facts"}</small>
      </div>
      <div class="raw-note-counts">
        ${renderRawNoteCount("Blocked", readiness.blockedCount || 0)}
        ${renderRawNoteCount("Ready to capture", readiness.readyToCaptureCount || 0)}
        ${renderRawNoteCount("Notes recorded", readiness.notesRecordedCount || 0)}
        ${renderRawNoteCount("Debrief ready", readiness.debriefReadyCount || 0)}
      </div>
      <div class="raw-note-list">
        ${(readiness.rows || []).map(renderRawNoteCaptureRow).join("")}
      </div>
    </article>
  `;
}

function renderRawNoteCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderRawNoteCaptureRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="raw-note-row ${escapeHtml(row.state || "blocked")}">
      <div class="raw-note-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Blocked")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.blocked ? "Blocked" : "Open")}</strong>
      </div>
      <small>${escapeHtml(row.rationale || "")}</small>
      <div class="raw-note-meta">
        <section>
          <span>Capture gate</span>
          <p>${escapeHtml(row.gate || "Do not open raw-note capture without local session-start readiness.")}</p>
        </section>
        <section>
          <span>Missing facts</span>
          <p>${escapeHtml((row.missing || []).join(", ") || "No missing required fact detected")}</p>
        </section>
        <section>
          <span>Outcome boundary</span>
          <p>Attendance, no-shows, demand, testimonials, and outcomes remain unobserved.</p>
        </section>
      </div>
      <div class="raw-note-evidence">
        <span>${escapeHtml(row.evidenceNote || "No real session outcome claimed.")}</span>
        ${
          (row.matchedArtifacts || []).length
            ? row.matchedArtifacts
                .map(
                  (artifact) => `
                    <code>${escapeHtml(
                      `${artifact.source}#${artifact.index}: ${artifact.state} / notes:${artifact.notesRecorded ? "yes" : "no"} / debrief:${artifact.debriefReady ? "yes" : "no"}${artifact.debriefRoute ? ` / ${artifact.debriefRoute}` : ""}`
                    )}</code>
                  `
                )
                .join("")
            : `<code>No repo-visible session-start-ready, raw-note, or debrief-ready fact matched this row.</code>`
        }
        ${
          sourceArtifacts.length
            ? `<div class="raw-note-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/(research|launch)\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderSessionStartReadiness(readiness) {
  if (!readiness || !readiness.rows?.length) return "";
  return `
    <article class="session-start-card">
      <div class="session-start-head">
        <div>
          <span>Session-start readiness</span>
          <strong>${escapeHtml(readiness.blockedCount || 0)} blocked before runbook</strong>
        </div>
        <small>${(readiness.generatedFrom || []).length ? `Derived from ${escapeHtml(readiness.generatedFrom.join(", "))}` : "Derived from local session-start facts"}</small>
      </div>
      <div class="session-start-counts">
        ${renderSessionStartCount("Blocked", readiness.blockedCount || 0)}
        ${renderSessionStartCount("Appointment confirmed", readiness.appointmentConfirmedCount || 0)}
        ${renderSessionStartCount("Ready for runbook", readiness.readyForRunbookCount || 0)}
      </div>
      <div class="session-start-list">
        ${(readiness.rows || []).map(renderSessionStartRow).join("")}
      </div>
    </article>
  `;
}

function renderSessionStartCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderSessionStartRow(row) {
  const sourceArtifacts = row.sourceArtifacts || [];
  return `
    <section class="session-start-row ${escapeHtml(row.state || "blocked")}">
      <div class="session-start-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Blocked")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.blocked ? "Blocked" : "Ready")}</strong>
      </div>
      <small>${escapeHtml(row.rationale || "")}</small>
      <div class="session-start-meta">
        <section>
          <span>Runbook gate</span>
          <p>${escapeHtml(row.gate || "Do not start runbook work without explicit local pre-session facts.")}</p>
        </section>
        <section>
          <span>Missing facts</span>
          <p>${escapeHtml((row.missing || []).join(", ") || "No missing required fact detected")}</p>
        </section>
        <section>
          <span>Outcome boundary</span>
          <p>Attendance, no-shows, demand, testimonials, and outcomes remain unobserved.</p>
        </section>
      </div>
      <div class="session-start-evidence">
        <span>${escapeHtml(row.evidenceNote || "No real session outcome claimed.")}</span>
        ${
          (row.matchedArtifacts || []).length
            ? row.matchedArtifacts
                .map(
                  (artifact) => `
                    <code>${escapeHtml(
                      `${artifact.source}#${artifact.index}: ${artifact.state}${artifact.appointmentTime ? ` / ${artifact.appointmentTime}` : ""} / consent:${artifact.consentReady ? "yes" : "no"} / redacted:${artifact.redactedReady ? "yes" : "no"} / raw-note:${artifact.rawNoteReady ? "yes" : "no"}`
                    )}</code>
                  `
                )
                .join("")
            : `<code>No repo-visible appointment-confirmed or runbook-ready fact matched this row.</code>`
        }
        ${
          sourceArtifacts.length
            ? `<div class="session-start-sources">
                ${sourceArtifacts
                  .map((artifact) =>
                    artifact.exists
                      ? sourceLink(artifact.path, artifact.path.replace(/^ops\/(research|launch)\//, ""))
                      : `<code>${escapeHtml(`${artifact.path} missing`)}</code>`
                  )
                  .join("")}
              </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderCalendarAppointmentReadiness(readiness) {
  if (!readiness || !readiness.rows?.length) return "";
  return `
    <article class="calendar-readiness-card">
      <div class="calendar-readiness-head">
        <div>
          <span>Calendar appointment readiness</span>
          <strong>${escapeHtml(readiness.blockedCount || 0)} blocked before calendar handoff</strong>
        </div>
        <small>${(readiness.generatedFrom || []).length ? `Derived from ${escapeHtml(readiness.generatedFrom.join(", "))}` : "Derived from local readiness facts"}</small>
      </div>
      <div class="calendar-state-counts">
        ${renderCalendarCount("No reply", readiness.noReplyCount || 0)}
        ${renderCalendarCount("Accepted local", readiness.acceptedLocalCount || 0)}
        ${renderCalendarCount("Ready for calendar", readiness.readyForCalendarCount || 0)}
      </div>
      <div class="calendar-row-list">
        ${(readiness.rows || []).map(renderCalendarAppointmentRow).join("")}
      </div>
    </article>
  `;
}

function renderCalendarCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderCalendarAppointmentRow(row) {
  return `
    <section class="calendar-row ${escapeHtml(row.state || "no-reply")}">
      <div class="calendar-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "No reply")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.blocked ? "Blocked" : "Ready")}</strong>
      </div>
      <small>${escapeHtml(row.rationale || "")}</small>
      <div class="calendar-meta">
        <section>
          <span>Calendar gate</span>
          <p>${escapeHtml(row.gate || "Do not create calendar work without explicit local readiness facts.")}</p>
        </section>
        <section>
          <span>Outcome boundary</span>
          <p>Sessions, attendance, no-shows, demand, and outcomes remain unobserved.</p>
        </section>
      </div>
      <div class="calendar-evidence">
        <span>${escapeHtml(row.evidenceNote || "No real session outcome claimed.")}</span>
        ${
          (row.matchedArtifacts || []).length
            ? row.matchedArtifacts
                .map(
                  (artifact) => `
                    <code>${escapeHtml(`${artifact.source}#${artifact.index}: ${artifact.state}${artifact.replyStatus ? ` / ${artifact.replyStatus}` : ""}${artifact.route ? ` -> ${artifact.route}` : ""}`)}</code>
                  `
                )
                .join("")
            : `<code>No repo-visible accepted reply or calendar-readiness artifact matched this row.</code>`
        }
      </div>
    </section>
  `;
}

function renderReplyFactReadiness(readiness) {
  if (!readiness || !readiness.rows?.length) return "";
  return `
    <article class="reply-fact-readiness-card">
      <div class="reply-fact-readiness-head">
        <div>
          <span>Reply-fact readiness</span>
          <strong>${escapeHtml(readiness.blockedCount || 0)} blocked by missing real reply facts</strong>
        </div>
        <small>${(readiness.generatedFrom || []).length ? `Derived from ${escapeHtml(readiness.generatedFrom.join(", "))}` : "Derived from current queue rows"}</small>
      </div>
      <div class="reply-fact-state-counts">
        ${renderReplyFactCount("Unobserved", readiness.unobservedCount || 0)}
        ${renderReplyFactCount("Captured local", readiness.capturedLocalCount || 0)}
        ${renderReplyFactCount("Session ready", readiness.sessionReadyCount || 0)}
      </div>
      <div class="reply-fact-row-list">
        ${(readiness.rows || []).map(renderReplyFactRow).join("")}
      </div>
    </article>
  `;
}

function renderStructuredExtractionVisibility(visibility) {
  if (!visibility) return "";
  const trend = visibility.trend || {};
  const latestQa = trend.latestQaRegression || {};
  return `
    <article class="reply-fact-readiness-card structured-extraction-card">
      <div class="reply-fact-readiness-head">
        <div>
          <span>Structured extraction visibility</span>
          <strong>${escapeHtml(visibility.extractedItemCount || 0)} extracted, ${escapeHtml(visibility.promotedCount || 0)} promoted, ${escapeHtml(visibility.approvedCount || 0)} approved</strong>
        </div>
        <small>${(visibility.generatedFrom || []).length ? `Derived from ${escapeHtml(visibility.generatedFrom.join(", "))}` : "Derived from local extracted-item artifacts"}</small>
      </div>
      <div class="reply-fact-state-counts">
        ${renderReplyFactCount("Extracted items", visibility.extractedItemCount || 0)}
        ${renderReplyFactCount("Provenance covered", `${visibility.provenanceCoveredCount || 0} / ${visibility.extractedItemCount || 0}`)}
        ${renderReplyFactCount("Promoted", trend.latestPromotedCount ?? visibility.promotedCount ?? 0)}
        ${renderReplyFactCount("Approved", trend.latestApprovedCount ?? visibility.approvedCount ?? 0)}
        ${renderReplyFactCount("Accept blocked", trend.acceptBlockedByMissingEvidenceApprovalCount ?? visibility.acceptBlockedByMissingEvidenceApprovalCount ?? 0)}
        ${renderReplyFactCount("Approved + accepted", trend.approvedAndAcceptedCount ?? visibility.approvedAndAcceptedCount ?? 0)}
        ${renderReplyFactCount("Export eligible", visibility.exportEligibleCount || 0)}
        ${renderReplyFactCount("Unsafe export attempts", trend.unsafeExportAttemptCount ?? visibility.unsafeUnapprovedExportCount ?? 0)}
      </div>
      ${renderStructuredExtractionBulkControlReadiness(visibility.bulkControlReadiness)}
      ${renderStructuredExtractionTrend(trend)}
      ${
        latestQa.status
          ? `<div class="reply-fact-evidence">
              <span>Latest QA regression: ${escapeHtml(latestQa.label || latestQa.status)}${latestQa.checkedAt ? ` at ${escapeHtml(formatDate(latestQa.checkedAt))}` : ""}</span>
              ${latestQa.command ? `<code>${escapeHtml(latestQa.command)}</code>` : ""}
              ${latestQa.failure ? `<code>${escapeHtml(latestQa.failure)}</code>` : ""}
              ${latestQa.resolution ? `<code>${escapeHtml(latestQa.resolution)}</code>` : ""}
              ${latestQa.source ? `<code>${sourceLink(latestQa.source)}</code>` : ""}
            </div>`
          : ""
      }
      ${
        (visibility.rows || []).length
          ? `<div class="reply-fact-row-list">
              ${(visibility.rows || []).map(renderStructuredExtractionRow).join("")}
            </div>`
          : `<div class="reply-fact-evidence"><span>No active structured extraction backlog row is currently present; readiness is shown from product, QA, and source-contract evidence.</span></div>`
      }
    </article>
  `;
}

function renderBusinessControlsVisibility(visibility) {
  const panel = document.querySelector("#business-control-grid");
  const summary = document.querySelector("#business-control-summary");
  if (!panel || !summary) return;

  const controls = visibility?.controls || [];
  text("#business-controls-total", `${visibility?.enabledCount || 0} enabled`);
  text(
    "#business-controls-source",
    visibility?.path
      ? `Generated from ${visibility.path}. Agents may act externally only when the matching control is enabled.`
      : "No business control source found."
  );

  summary.innerHTML = `
    <article class="business-control-status ${escapeHtml(visibility?.currentState || "setup-required")}">
      <div>
        <span>Revenue state</span>
        <strong>${escapeHtml(visibility?.moneyGoal?.currentRevenueState || "Not observed")}</strong>
      </div>
      <div>
        <span>Next unlock</span>
        <p>${escapeHtml(visibility?.moneyGoal?.nextRevenueUnlock || "Enable business controls before market actions.")}</p>
      </div>
      <div>
        <span>Narrow ask rule</span>
        <p>${escapeHtml(visibility?.operatingRule || "Ask only for missing control inputs.")}</p>
      </div>
      <div>
        <span>Global limits</span>
        <code>Outbound/day: ${escapeHtml(visibility?.globalLimits?.dailyOutboundLimit ?? 0)} | Spend/day: $${escapeHtml(visibility?.globalLimits?.dailySpendLimitUsd ?? 0)} | Max price test: $${escapeHtml(visibility?.globalLimits?.maxPriceExperimentUsd ?? 0)}</code>
      </div>
    </article>
    ${renderBusinessUnlockLadder(visibility)}
    ${renderBuyerPathReadinessMetrics(visibility?.buyerPathReadiness)}
  `;

  panel.innerHTML = controls.length
    ? controls.map(renderBusinessControlCard).join("")
    : `<article class="empty-card">No business controls configured. External market actions remain blocked.</article>`;
}

function renderBusinessUnlockLadder(visibility) {
  const unlocks = visibility?.nextUnlocks || [];
  const next = visibility?.nextRevenueCriticalUnlock;
  return `
    <article class="business-unlock-ladder">
      <div class="business-unlock-ladder-head">
        <div>
          <span>Priority unlock ladder</span>
          <strong>${escapeHtml(visibility?.revenueCriticalBlockedCount || 0)} revenue-critical controls blocked</strong>
        </div>
        <p>$0 spend and 0 outbound remain the default until a matching control explicitly raises them.</p>
      </div>
      ${
        next
          ? `<div class="business-next-unlock">
              <span>Next revenue-critical unlock</span>
              <strong>${escapeHtml(`#${next.priority} ${next.label || next.id}`)}</strong>
              <p>${escapeHtml(next.oneMissingUserOrPlatformItem)} unlocks ${escapeHtml(next.unlocks || "the next business control")}.</p>
            </div>`
          : `<div class="business-next-unlock is-ready">
              <span>Next revenue-critical unlock</span>
              <strong>All revenue-critical controls enabled</strong>
              <p>Continue operating inside the enabled limits and stop conditions.</p>
            </div>`
      }
      <div class="business-unlock-list">
        ${
          unlocks.length
            ? unlocks.map(renderBusinessUnlockStep).join("")
            : `<section class="business-unlock-step is-ready"><strong>All configured business controls are enabled.</strong></section>`
        }
      </div>
    </article>
  `;
}

function renderBusinessUnlockStep(unlock) {
  const status = String(unlock.status || "unknown").replaceAll("_", " ");
  return `
    <section class="business-unlock-step ${escapeHtml(unlock.status || "unknown")}">
      <div>
        <span>${escapeHtml(`#${unlock.priority || "?"} | ${unlock.revenueCritical ? "Revenue-critical" : "Supporting"}`)}</span>
        <strong>${escapeHtml(unlock.label || unlock.id)}</strong>
      </div>
      <p><b>${escapeHtml(unlock.oneMissingUserOrPlatformItem || "explicit control enablement")}</b> unlocks ${escapeHtml(unlock.unlocks || "the next business action")}.</p>
      <code>${escapeHtml(status)}</code>
    </section>
  `;
}

function renderBuyerPathReadinessMetrics(readiness) {
  if (!readiness) return "";
  const disabledControls = readiness.disabledRevenueControls || [];
  const missingUnlocks = readiness.missingUnlocks || [];
  const zero = readiness.zeroSpendOutbound || {};
  const paidReviewInterest = readiness.paidReviewInterest || {};
  return `
    <article class="buyer-path-readiness-card ${escapeHtml(readiness.state || "needs-evidence")}">
      <div class="buyer-path-readiness-head">
        <div>
          <span>${escapeHtml(readiness.title || "Buyer-path control readiness")} | ${escapeHtml(readiness.stateLabel || "Check")}</span>
          <strong>${escapeHtml(readiness.enabledRevenueControlCount || 0)} enabled, ${escapeHtml(readiness.disabledRevenueControlCount || 0)} disabled</strong>
        </div>
        <small>${sourceLink(readiness.sourcePath, readiness.sourcePath || "Control source")}</small>
      </div>
      <div class="buyer-path-counts">
        ${renderBuyerPathCount("Enabled revenue controls", readiness.enabledRevenueControlCount || 0)}
        ${renderBuyerPathCount("Disabled revenue controls", readiness.disabledRevenueControlCount || 0)}
        ${renderBuyerPathCount("Missing unlocks", missingUnlocks.length)}
        ${renderBuyerPathCount("Spend / outbound", zero.locked ? "$0 / 0" : "Check")}
      </div>
      ${renderPaidReviewInterestReadiness(paidReviewInterest)}
      <div class="buyer-path-guardrails">
        <section>
          <span>Zero spend/outbound</span>
          <p>Spend/day $${escapeHtml(zero.dailySpendLimitUsd ?? 0)} | outbound/day ${escapeHtml(zero.dailyOutboundLimit ?? 0)} | max price test $${escapeHtml(zero.maxPriceExperimentUsd ?? 0)} | autonomous sends ${escapeHtml(zero.mayAutonomouslySend ? "enabled" : "disabled")}</p>
        </section>
        <section>
          <span>Disabled controls</span>
          <p>${escapeHtml(disabledControls.map((control) => `${control.label || control.id}: ${String(control.status || "unknown").replaceAll("_", " ")}`).join("; ") || "No disabled revenue controls.")}</p>
        </section>
      </div>
      ${
        missingUnlocks.length
          ? `<div class="buyer-path-unlocks">
              ${missingUnlocks.map(renderBuyerPathMissingUnlock).join("")}
            </div>`
          : `<div class="empty-card">No missing buyer-path unlocks detected.</div>`
      }
      <div class="buyer-path-evidence">
        ${renderBuyerPathEvidence("Latest product evidence", readiness.latestEvidence?.product)}
        ${renderBuyerPathEvidence("Latest QA evidence", readiness.latestEvidence?.qa)}
      </div>
      <div class="buyer-path-note">
        <span>${escapeHtml(readiness.evidenceNote || "")}</span>
      </div>
    </article>
  `;
}

function renderPaidReviewInterestReadiness(interest) {
  if (!interest) return "";
  const counts = interest.counts || {};
  const latest = interest.latest || [];
  const files = interest.files || [];
  const malformedRows = interest.malformedRows || [];
  const staleRecords = interest.staleRecords || [];
  const boundary = interest.boundaryMetrics || {};
  const freshness = interest.freshness || {};
  const activation = interest.controlActivation || {};
  return `
    <section class="paid-review-interest-card ${escapeHtml(interest.state || "not-observed")}" data-paid-review-control-activation="1">
      <div class="paid-review-interest-head">
        <div>
          <span>${escapeHtml(interest.title || "Paid-review local interest readiness")}</span>
          <strong>${escapeHtml(interest.stateLabel || "Reader ready, no JSONL observed")}</strong>
        </div>
        <code>${escapeHtml(interest.storageState || "repo JSONL not present")}</code>
      </div>
      <div class="paid-review-interest-counts">
        ${renderBuyerPathCount("Local intent", counts.localInterestRecords || 0)}
        ${renderBuyerPathCount("Malformed rows", counts.malformedRows || counts.parseErrors || 0)}
        ${renderBuyerPathCount("Stale local intents", counts.staleLocalIntents || 0)}
        ${renderBuyerPathCount("Boundary markers", (counts.paymentMarkers || 0) + (counts.externalMarkers || 0))}
        ${renderBuyerPathCount("Payment disabled", boundary.paymentDisabled ? "Yes" : "No")}
        ${renderBuyerPathCount("Zero revenue", boundary.zeroRevenue ? "$0" : "Check")}
        ${renderBuyerPathCount("Zero outbound", boundary.zeroOutbound ? "0" : "Check")}
        ${renderBuyerPathCount("Demand / WTP", `${boundary.demandMetricState || "not-observed"} / ${boundary.willingnessToPayMetricState || "not-observed"}`)}
      </div>
      <div class="paid-review-interest-meta">
        <section>
          <span>Latest local record</span>
          <p>${escapeHtml(interest.latestAt ? formatDate(interest.latestAt) : "Not observed")}</p>
        </section>
        <section>
          <span>Browser/local source</span>
          <p>${escapeHtml(interest.expectedBrowserKey || "proofresume:paidReviewInterest")} | ${escapeHtml(interest.endpointState || "Endpoint not observed")}</p>
        </section>
        <section>
          <span>Freshness boundary</span>
          <p>${escapeHtml(freshness.label || "No local intents observed")} | stale after ${escapeHtml(freshness.staleAfterHours || 24)}h | latest age ${escapeHtml(freshness.latestAgeHours ?? "n/a")}h</p>
        </section>
        <section>
          <span>Revenue/outbound boundary</span>
          <p>Payment ${escapeHtml(boundary.paymentStatus || "unknown")} | outbound ${escapeHtml(boundary.outboundStatus || "unknown")} | ${escapeHtml(boundary.revenueState || "zero-revenue-observed")}</p>
        </section>
      </div>
      ${renderPaidReviewControlActivation(activation)}
      ${
        files.length
          ? `<div class="paid-review-interest-files">
              ${files.map((file) => `<code>${sourceLink(file.path, `${file.path} (${file.count || 0})`)}</code>`).join("")}
            </div>`
          : `<div class="paid-review-interest-files"><code>${escapeHtml((interest.candidateJsonlPaths || []).join(" | "))}</code></div>`
      }
      ${
        latest.length
          ? `<div class="paid-review-interest-latest">
              ${latest.map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
            </div>`
          : ""
      }
      ${
        malformedRows.length
          ? `<div class="paid-review-interest-diagnostics">
              <span>Malformed JSONL rows</span>
              ${malformedRows
                .slice(0, 6)
                .map((row) => `<code>${sourceLink(row.path, row.path)}:${escapeHtml(row.line)} ${escapeHtml(row.error)}</code>`)
                .join("")}
            </div>`
          : `<div class="paid-review-interest-diagnostics is-clear"><span>Malformed JSONL rows</span><p>None observed.</p></div>`
      }
      ${
        staleRecords.length
          ? `<div class="paid-review-interest-diagnostics">
              <span>Stale local intents</span>
              ${staleRecords
                .slice(0, 6)
                .map((record) => `<p>${escapeHtml(record.sourcePath || "local JSONL")} | ${escapeHtml(record.timestamp || "missing timestamp")} | ${escapeHtml(record.ageHours === null ? "age unknown" : `${record.ageHours.toFixed(1)}h old`)}</p>`)
                .join("")}
            </div>`
          : `<div class="paid-review-interest-diagnostics is-clear"><span>Stale local intents</span><p>None observed beyond the local freshness window.</p></div>`
      }
      <div class="paid-review-interest-diagnostics">
        <span>Metric separation</span>
        <p>${escapeHtml(boundary.separation || interest.guardrail || "")}</p>
      </div>
      ${renderPaidReviewTriageExportReadiness(interest.triageExportReadiness)}
      <p class="paid-review-interest-guardrail">${escapeHtml(interest.guardrail || "")}</p>
    </section>
  `;
}

function renderPaidReviewControlActivation(activation) {
  const steps = activation?.steps || [];
  const enabledControls = activation?.enabledControls || [];
  const missingInputs = activation?.missingOperatorInputs || [];
  const zero = activation?.zeroExternalAction || {};
  const packet = activation?.activationPacket || {};
  return `
    <div class="control-activation-readiness" data-paid-review-control-activation-panel="1">
      <div class="paid-review-interest-head">
        <div>
          <span>Control activation readiness</span>
          <strong>${escapeHtml(enabledControls.length)} enabled, ${escapeHtml(missingInputs.length)} missing operator inputs</strong>
        </div>
        <code>${escapeHtml(activation?.format || "proofresume-control-activation-v1")}</code>
      </div>
      ${renderPaidReviewControlActivationPacket(packet)}
      ${renderActivationDecisionLedger(activation?.decisionLedger || packet?.decisionLedger)}
      ${renderActivationDecisionPacketExportReadiness(activation?.activationDecisionPacketExportReadiness)}
      <div class="paid-review-interest-counts">
        ${renderBuyerPathCount("Spend / outbound", `$${zero.dailySpendLimitUsd ?? 0} / ${zero.dailyOutboundLimit ?? 0}`)}
        ${renderBuyerPathCount("Max price test", `$${zero.maxPriceExperimentUsd ?? 0}`)}
        ${renderBuyerPathCount("Payment control", zero.paymentCollectionEnabled ? "Enabled" : "Disabled")}
        ${renderBuyerPathCount("Card data", zero.storesCardData ? "Check" : "Not stored")}
      </div>
      <div class="control-activation-grid">
        ${
          steps.length
            ? steps.map(renderPaidReviewControlActivationStep).join("")
            : `<section class="control-activation-step missing"><span>No controls found</span><p>Business controls are not configured.</p></section>`
        }
      </div>
      <div class="paid-review-interest-diagnostics">
        <span>Missing operator inputs vs enabled controls</span>
        <p>${escapeHtml(missingInputs.map((item) => `${item.label || item.id}: ${item.nextMissingUnlock}`).join("; ") || "No missing operator inputs for the revenue-critical controls.")}</p>
        <p>${escapeHtml(enabledControls.map((item) => `${item.label || item.id}: enabled`).join("; ") || "No revenue-critical controls are enabled.")}</p>
      </div>
      <p class="paid-review-interest-guardrail">${escapeHtml(activation?.note || "Read-only checklist. It cannot authorize external actions.")}</p>
    </div>
  `;
}

function renderActivationDecisionPacketExportReadiness(readiness) {
  if (!readiness) return "";
  const sourceHandles = readiness.sourceHandles || [];
  const qaChecks = readiness.qaStrictChecks || [];
  const separation = readiness.controlStateSeparation || {};
  const sourceReadyCount = sourceHandles.filter((item) => item.present).length;
  const qaReadyCount = qaChecks.filter((item) => item.present).length;
  return `
    <div class="activation-decision-export-readiness ${escapeHtml(readiness.state || "blocked-missing-source-handles")}" data-activation-decision-packet-export-readiness="1">
      <div class="control-activation-ledger-head">
        <div>
          <span>${escapeHtml(readiness.title || "Activation-decision packet export readiness")}</span>
          <strong>${escapeHtml(readiness.stateLabel || "Blocked")}</strong>
        </div>
        <code>${escapeHtml(readiness.format || "proofresume-activation-decision-packet-export-readiness-v1")}</code>
      </div>
      <div class="paid-review-interest-counts">
        ${renderBuyerPathCount("Source handles", `${sourceReadyCount}/${sourceHandles.length}`)}
        ${renderBuyerPathCount("Export handler", readiness.exportHandler?.present ? "Observed" : "Missing")}
        ${renderBuyerPathCount("Strict QA export", readiness.strictQaExportCoverage ? "Yes" : "Missing")}
        ${renderBuyerPathCount("Enabled controls", separation.enabledRevenueCriticalControlCount || 0)}
      </div>
      <div class="activation-decision-export-columns">
        <section>
          <span>Ledger source handles</span>
          ${sourceHandles.map(renderActivationDecisionExportCheck).join("")}
          ${renderActivationDecisionExportCheck(readiness.exportHandler || {})}
        </section>
        <section>
          <span>QA export coverage</span>
          ${qaChecks.map(renderActivationDecisionExportCheck).join("")}
        </section>
      </div>
      <div class="paid-review-interest-diagnostics">
        <span>Control-state separation</span>
        <p>${escapeHtml(separation.enabledControlsSource || "ops/BUSINESS_CONTROLS.json")} remains the only enabled-control source. Export readiness: ${escapeHtml(separation.enabledControlsFromExportReadiness ? "would enable controls" : "does not enable controls")}; ledger handles: ${escapeHtml(separation.enabledControlsFromLedgerSourceHandles ? "would enable controls" : "do not enable controls")}.</p>
      </div>
      <div class="activation-decision-export-evidence">
        ${renderActivationDecisionExportEvidence("Product evidence", readiness.productEvidence)}
        ${renderActivationDecisionExportEvidence("QA evidence", readiness.qaEvidence)}
      </div>
      <p class="paid-review-interest-guardrail">${escapeHtml(readiness.boundary || "")}</p>
    </div>
  `;
}

function renderActivationDecisionExportCheck(item) {
  if (!item || !item.id) return "";
  return `
    <p class="${escapeHtml(item.present ? "is-present" : "is-missing")}">
      <strong>${escapeHtml(item.present ? "Observed" : "Missing")}</strong>
      ${escapeHtml(item.label || item.id)}
      <code>${sourceLink(item.sourcePath, item.sourcePath || "source")}${item.detail ? ` | ${escapeHtml(item.detail)}` : ""}</code>
    </p>
  `;
}

function renderActivationDecisionExportEvidence(label, evidence) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      ${
        evidence
          ? `<p>${sourceLink(evidence.source, evidence.title || evidence.source)}${evidence.finishedAt ? ` | ${escapeHtml(formatDate(evidence.finishedAt))}` : ""}</p>`
          : `<p>No matching pass/report evidence observed.</p>`
      }
    </section>
  `;
}

function renderPaidReviewControlActivationPacket(packet) {
  const sourcePath = packet?.sourcePath || "ops/launch/private-first-revenue-control-activation-brief.md";
  const present = packet?.present === true;
  const lastUpdated = packet?.lastUpdated ? formatDate(packet.lastUpdated) : "Not observed";
  const ledger = packet?.decisionLedger || {};
  const counts = ledger?.counts || {};
  return `
    <div class="control-activation-packet" data-control-activation-packet-doc="1" data-read-only="true">
      <section>
        <span>Activation packet</span>
        <strong>${sourceLink(sourcePath, packet?.title || "Private first-revenue control activation brief")}</strong>
        <p>${escapeHtml(packet?.mode || "Read-only / No-send / No-run")}</p>
      </section>
      <section>
        <span>Doc presence</span>
        <strong>${present ? "Present" : "Missing"}</strong>
        <p>${escapeHtml(sourcePath)}</p>
      </section>
      <section>
        <span>Last updated</span>
        <strong>${escapeHtml(lastUpdated)}</strong>
        <p>${escapeHtml(packet?.boundary || "Document metadata only. Admin cannot enable controls or trigger production actions.")}</p>
      </section>
      <section>
        <span>Decision ledger</span>
        <strong>${escapeHtml(counts.approved || 0)} approved, ${escapeHtml(counts.missing || 0)} missing</strong>
        <p>${escapeHtml(counts.stale || 0)} stale, ${escapeHtml(counts.blocked || 0)} blocked. ${escapeHtml(ledger?.note || "Readiness only; decisions do not enable controls.")}</p>
      </section>
    </div>
  `;
}

function renderActivationDecisionLedger(ledger) {
  if (!ledger) return "";
  const groups = [
    ["approved", "Approved source decisions"],
    ["missing", "Missing decisions"],
    ["stale", "Stale decisions"],
    ["blocked", "Blocked decisions"],
  ];
  return `
    <div class="control-activation-ledger" data-control-activation-decision-ledger="1" data-enabled-controls-from-decisions="false">
      <div class="control-activation-ledger-head">
        <div>
          <span>Activation decision ledger</span>
          <strong>${escapeHtml(ledger?.format || "proofresume-activation-decision-ledger-v1")}</strong>
        </div>
        <code>${escapeHtml(ledger?.sourcePath || "ops/BUSINESS_CONTROLS.json")}</code>
      </div>
      <div class="control-activation-ledger-groups">
        ${groups.map(([status, label]) => renderActivationDecisionLedgerGroup(status, label, ledger?.byStatus?.[status] || [])).join("")}
      </div>
      <p class="paid-review-interest-guardrail">${escapeHtml(ledger?.boundary || "Decision readiness only. Static decisions cannot enable controls or trigger external actions.")}</p>
    </div>
  `;
}

function renderActivationDecisionLedgerGroup(status, label, decisions) {
  return `
    <section class="control-activation-ledger-group ${escapeHtml(status)}">
      <div class="control-activation-ledger-group-head">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(decisions.length)}</strong>
      </div>
      ${
        decisions.length
          ? decisions
              .map(
                (decision) => `
                  <article>
                    <small>${escapeHtml(decision.controlId || "control")} | ${escapeHtml(decision.controlStatus || "unknown")}</small>
                    <p>${escapeHtml(decision.decision || "Decision")}</p>
                    <code>${escapeHtml(decision.reason || "")}</code>
                  </article>
                `
              )
              .join("")
          : `<p class="control-activation-ledger-empty">No ${escapeHtml(status)} decisions.</p>`
      }
    </section>
  `;
}

function renderPaidReviewControlActivationStep(step) {
  const statusLabel = String(step.status || "unknown").replaceAll("_", " ");
  const missing = step.nextMissingUnlock || step.oneMissingUserOrPlatformItem || "explicit enablement";
  return `
    <section class="control-activation-step ${escapeHtml(step.enabled ? "enabled" : step.status || "missing")}">
      <div>
        <span>${escapeHtml(step.id || "control")} | ${escapeHtml(statusLabel)}</span>
        <strong>${escapeHtml(step.label || step.id || "Revenue control")}</strong>
      </div>
      <p>${escapeHtml(step.enabled ? "Enabled control" : `Next missing unlock: ${missing}`)}</p>
      <small>${escapeHtml((step.askUserOnlyFor || []).join("; ") || "No operator ask listed.")}</small>
    </section>
  `;
}

function renderPaidReviewTriageExportReadiness(readiness) {
  if (!readiness) return "";
  const counts = readiness.counts || {};
  const evidence = readiness.evidence || {};
  const blockedReasons = readiness.blockedFollowUpReasons || [];
  const routes = readiness.triageRoutes || [];
  const sourcePaths = readiness.sourcePaths || [];
  return `
    <div class="paid-review-triage-export ${escapeHtml(readiness.state || "blocked-boundary-check")}">
      <div class="paid-review-interest-head">
        <div>
          <span>${escapeHtml(readiness.title || "Paid-review triage export readiness")}</span>
          <strong>${escapeHtml(readiness.stateLabel || "Blocked: boundary check required")}</strong>
        </div>
        <code>${escapeHtml(readiness.reviewedState || "no-repo-records-observed")}</code>
      </div>
      <div class="paid-review-interest-counts">
        ${renderBuyerPathCount("Reviewed", counts.reviewedRecords || 0)}
        ${renderBuyerPathCount("Unreviewed", counts.unreviewedRecords || 0)}
        ${renderBuyerPathCount("Invalid metadata", counts.invalidMetadataRecords || 0)}
        ${renderBuyerPathCount("Export surface", readiness.exportSurfaceObserved ? "Observed" : "Not observed")}
        ${renderBuyerPathCount("No-draft", readiness.noDraftObserved ? "Yes" : "Check")}
        ${renderBuyerPathCount("No-send", readiness.noSendObserved ? "Yes" : "Check")}
        ${renderBuyerPathCount("Revenue / payment", `${evidence.revenueEvidence ? "Check" : "$0"} / ${evidence.paymentEvidence ? "Check" : "$0"}`)}
        ${renderBuyerPathCount("Outbound", evidence.outboundEvidence ? "Check" : "0")}
        ${renderBuyerPathCount("Demand / WTP", `${evidence.demandEvidence ? "Check" : "Not observed"} / ${evidence.willingnessToPayEvidence ? "Check" : "Not observed"}`)}
      </div>
      <div class="paid-review-interest-diagnostics">
        <span>Blocked follow-up reasons</span>
        ${
          blockedReasons.length
            ? blockedReasons.slice(0, 12).map((reason) => `<p>${escapeHtml(reason)}</p>`).join("")
            : `<p>No additional blocked reasons observed beyond local-only no-send/no-draft defaults.</p>`
        }
      </div>
      <div class="paid-review-interest-diagnostics">
        <span>Route inventory</span>
        ${
          routes.length
            ? routes
                .slice(0, 8)
                .map((route) => `<p><strong>${escapeHtml(route.route)}</strong>: ${escapeHtml(route.followUpState)} | ${escapeHtml(route.useWhen)}</p>`)
                .join("")
            : `<p>No private triage routes parsed.</p>`
        }
      </div>
      <div class="paid-review-interest-files">
        ${sourcePaths.map((path) => `<code>${sourceLink(path, path)}</code>`).join("")}
      </div>
      <p class="paid-review-interest-guardrail">${escapeHtml(readiness.guardrail || "")}</p>
    </div>
  `;
}

function renderBuyerPathCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderBuyerPathMissingUnlock(unlock) {
  return `
    <section class="buyer-path-unlock ${escapeHtml(unlock.status || "unknown")}">
      <div>
        <span>${escapeHtml(`#${unlock.priority || "?"} | ${String(unlock.status || "unknown").replaceAll("_", " ")}`)}</span>
        <strong>${escapeHtml(unlock.label || unlock.id)}</strong>
      </div>
      <p><b>${escapeHtml(unlock.oneMissingUserOrPlatformItem || "explicit enablement")}</b> unlocks ${escapeHtml(unlock.unlocks || "the next buyer-path step")}.</p>
      <small>${escapeHtml((unlock.requiredEvidenceToEnable || []).join("; ") || "No required evidence listed.")}</small>
    </section>
  `;
}

function renderBuyerPathEvidence(label, evidence) {
  if (!evidence) {
    return `
      <section class="buyer-path-evidence-card missing">
        <span>${escapeHtml(label)}</span>
        <strong>Not found</strong>
        <p>No current Product/QA pass matched buyer-path control evidence.</p>
      </section>
    `;
  }

  return `
    <section class="buyer-path-evidence-card">
      <span>${escapeHtml(label)} | ${escapeHtml(formatDate(evidence.finishedAt))}</span>
      <strong>${escapeHtml(evidence.title || evidence.id)}</strong>
      <p>${escapeHtml(evidence.summary || "")}</p>
      <div class="buyer-path-evidence-links">
        ${evidence.sourcePath ? sourceLink(evidence.sourcePath, evidence.sourcePath) : ""}
        ${evidence.report ? sourceLink(evidence.report, evidence.report) : ""}
      </div>
      <div class="buyer-path-evidence-signals">
        ${(evidence.signals || []).length
          ? evidence.signals.map((signal) => `<code>${escapeHtml(signal)}</code>`).join("")
          : `<code>${escapeHtml(evidence.reportStatus || "evidence recorded")}</code>`}
      </div>
      ${
        (evidence.validation || []).length
          ? `<small>${escapeHtml((evidence.validation || []).join("; "))}</small>`
          : ""
      }
    </section>
  `;
}

function renderBusinessControlCard(control) {
  const statusLabel = control.enabled ? "Enabled" : control.setupNeeded ? "Setup needed" : control.blocked ? "Blocked" : control.status;
  return `
    <article class="business-control-card ${escapeHtml(control.status || "unknown")}">
      <div class="business-control-head">
        <div>
          <span>${escapeHtml(`${control.priority ? `#${control.priority} | ` : ""}${control.revenueCritical ? "Revenue-critical" : "Supporting"} | ${control.id}`)}</span>
          <strong>${escapeHtml(control.label || control.id)}</strong>
        </div>
        <code>${escapeHtml(statusLabel)}</code>
      </div>
      <p>${escapeHtml(control.businessPurpose || "")}</p>
      <div class="business-control-unlock-note">
        <span>One missing user/platform item</span>
        <p>${escapeHtml(control.oneMissingUserOrPlatformItem || "explicit control enablement")} unlocks ${escapeHtml(control.unlocks || "the next business action")}.</p>
      </div>
      <div class="business-control-columns">
        ${renderBusinessControlList("Agent can do now", control.agentCanDoNow)}
        ${renderBusinessControlList("When enabled", control.agentCanDoWhenEnabled)}
        ${renderBusinessControlList("Required to enable", control.requiredEvidenceToEnable)}
        ${renderBusinessControlList("Ask only for", control.askUserOnlyFor)}
      </div>
      <div class="business-control-limits">
        <span>Limits when enabled</span>
        <code>${escapeHtml(JSON.stringify(control.limitsWhenEnabled || {}))}</code>
      </div>
      <div class="business-control-stop">
        <span>Stop conditions</span>
        <p>${escapeHtml((control.stopConditions || []).join("; ") || "No stop conditions listed.")}</p>
      </div>
    </article>
  `;
}

function renderBusinessControlList(label, items = []) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      ${
        items.length
          ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
          : `<p>None listed.</p>`
      }
    </section>
  `;
}

function renderOwnerAuthorityRepairLoopPreview(preview) {
  const summaryNode = document.querySelector("#owner-authority-summary");
  const gridNode = document.querySelector("#owner-authority-grid");
  if (!summaryNode || !gridNode) return;

  const counts = preview?.counts || {};
  const gates = preview?.gates || [];
  const focusGates = gates.filter((gate) => gate.focusGate);
  const asks = preview?.ownerAskList || [];

  text("#owner-authority-repair-state", preview?.externalActionAllowed ? "Check authority" : "No live action");
  text(
    "#owner-authority-repair-note",
    preview?.note ||
      "Read-only owner-authority repair preview. It cannot collect secrets, mutate queues, deploy, send, collect payment, or handle production customer data."
  );

  summaryNode.innerHTML = [
    ["Focus gates", counts.focusGates || focusGates.length],
    ["Blocked focus gates", counts.blockedFocusGates || focusGates.filter((gate) => !gate.actionable).length],
    ["Actionable gates", counts.actionableFocusGates || 0],
    ["Owner asks", asks.length],
  ]
    .map(
      ([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");

  const gateCards = focusGates.length
    ? focusGates.map(renderOwnerAuthorityGateCard).join("")
    : `<article class="empty-card">No owner-authority gates were found in the bundle template.</article>`;

  gridNode.innerHTML = `
    <article class="owner-authority-card owner-authority-route-card">
      <span>Repair source</span>
      <strong>${sourceLink(preview?.bundlePath || "", preview?.bundlePath || "Owner authority bundle")}</strong>
      <p>Run <code>${escapeHtml(preview?.checkerCommand || "node ops/scripts/check_owner_authority_bundle.cjs")}</code> before any gate moves forward.</p>
      <p>${sourceLink(preview?.indexPath || "", "Owner authority bundle index")}</p>
    </article>
    <article class="owner-authority-card owner-authority-ask-card">
      <span>Next non-secret asks</span>
      ${
        asks.length
          ? renderLaunchRoomList(
              asks,
              (ask) => `
                <li>
                  <strong>${escapeHtml(ask.label || ask.gateId)}</strong>
                  <p>${escapeHtml(ask.ask || "Owner evidence required.")}</p>
                  <code>${escapeHtml(ask.repairRoute || "Request non-secret owner evidence")}</code>
                  ${ask.ownerEvidencePath ? `<p>${sourceLink(ask.ownerEvidencePath, "Evidence template")}</p>` : ""}
                </li>
              `
            )
          : `<p>No blocked owner asks are currently visible.</p>`
      }
    </article>
    ${gateCards}
  `;
}

function renderOwnerAuthorityGateCard(gate) {
  const reasons = gate.blockedReasons || [];
  const controls = gate.controls || [];
  const route = gate.repairRoute || {};
  return `
    <article class="owner-authority-card ${gate.actionable ? "is-actionable" : "is-blocked"}">
      <div class="owner-authority-head">
        <div>
          <span>${escapeHtml(gate.queueItemId || gate.gateId)}</span>
          <strong>${escapeHtml(gate.label || gate.gateId)}</strong>
        </div>
        <code>${escapeHtml(gate.authorityStatus || "unknown")}</code>
      </div>
      <p>${escapeHtml(gate.currentBlocker || "Owner authority evidence is not complete.")}</p>
      <div class="owner-authority-columns">
        <section>
          <span>Required non-secret evidence</span>
          ${
            (gate.requiredNonSecretEvidence || []).length
              ? `<ul>${gate.requiredNonSecretEvidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
              : `<p>No evidence items listed.</p>`
          }
        </section>
        <section>
          <span>Blocked because</span>
          ${reasons.length ? `<ul>${reasons.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : `<p>Checker marks this gate actionable.</p>`}
        </section>
        <section>
          <span>Controls</span>
          ${
            controls.length
              ? `<ul>${controls.map((control) => `<li>${escapeHtml(`${control.label || control.id}: ${control.status || "unknown"}`)}</li>`).join("")}</ul>`
              : `<p>No controls mapped.</p>`
          }
        </section>
        <section>
          <span>One repair route</span>
          <p>${escapeHtml(route.routeLabel || "Request non-secret owner evidence")}</p>
          <code>${escapeHtml(route.action || "request_owner_evidence")}</code>
          ${route.ownerEvidencePath ? `<p>${sourceLink(route.ownerEvidencePath, "Evidence template")}</p>` : ""}
          ${route.ownerActionRequestPath ? `<p>${sourceLink(route.ownerActionRequestPath, "Owner action request")}</p>` : ""}
          ${route.ownerAnswerIntakePath ? `<p>${sourceLink(route.ownerAnswerIntakePath, "Owner answer intake")}</p>` : ""}
        </section>
      </div>
      <div class="owner-authority-boundary">
        <span>Boundary</span>
        <p>No send, no deploy, no payment, no customer data, no queue mutation, no secrets.</p>
      </div>
    </article>
  `;
}

function renderStructuredExtractionBulkControlReadiness(readiness) {
  if (!readiness) return "";
  const product = readiness.productEvidence || {};
  const qa = readiness.qaEvidence || {};
  const exportGate = readiness.exportGate || {};
  return `
    <section class="reply-fact-row structured-extraction-row ${escapeHtml(readiness.state || "partial")}">
      <div class="reply-fact-row-head">
        <div>
          <span>Bulk-control readiness | ${escapeHtml(readiness.stateLabel || readiness.state || "Unknown")}</span>
          <p>Approve all source lines and Promote all approved remain visible as bulk controls, with QA coverage and export gating tracked separately.</p>
        </div>
        <strong>${escapeHtml(readiness.controlsExposed && readiness.qaCovered && readiness.exportGatePreserved ? "Ready" : "Check")}</strong>
      </div>
      <div class="reply-fact-state-counts">
        ${renderReplyFactCount("Bulk controls", readiness.controlsExposed ? "Exposed" : "Missing")}
        ${renderReplyFactCount("QA coverage", readiness.qaCovered ? "Covered" : "Needs QA")}
        ${renderReplyFactCount("Export gate", readiness.exportGatePreserved ? "Preserved" : "Review")}
      </div>
      <div class="reply-fact-meta">
        <section>
          <span>Control contract</span>
          <p>${escapeHtml((readiness.controls || []).map((control) => `${control.label}: ${control.htmlExposed && control.handlerPresent && control.eventBound ? "exposed" : "missing"}`).join(", ") || "No controls detected")}</p>
        </section>
        <section>
          <span>Product evidence</span>
          <p>${product.source ? sourceLink(product.source, product.source) : "No bulk-control product pass found"}</p>
        </section>
        <section>
          <span>Latest QA status</span>
          <p>${qa.source ? `${escapeHtml(qa.status || "observed")} | ${sourceLink(qa.source, qa.source)}` : "No focused QA pass found"}</p>
        </section>
        <section>
          <span>Export gate evidence</span>
          <p>${escapeHtml(exportGate.requiresEvidenceApproval ? "evidence approval" : "missing evidence approval")} / ${escapeHtml(exportGate.requiresPromotion ? "promotion" : "missing promotion")} / ${escapeHtml(exportGate.requiresCandidateAccept ? "candidate Accept" : "missing candidate Accept")} / current unsafe exports: ${escapeHtml(exportGate.unsafeExportAttemptCount || 0)}</p>
        </section>
      </div>
      <div class="reply-fact-evidence">
        ${product.summary ? `<code>${escapeHtml(product.summary)}</code>` : ""}
        ${qa.summary ? `<code>${escapeHtml(qa.summary)}</code>` : ""}
        ${
          exportGate.historicalUnsafeExportAttemptCount
            ? `<code>${escapeHtml(`${exportGate.historicalUnsafeExportAttemptCount} historical unsafe export attempt signal remains in trend history; current gate evidence is evaluated separately.`)}</code>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderFollowupEvidenceVisibility(visibility) {
  if (!visibility) return "";
  const snapshots = visibility.snapshots || [];
  const sampleItems = visibility.sampleItems || [];
  const activeRow = visibility.activeRow || null;

  const sampleList = sampleItems.length
    ? `<div class="reply-fact-evidence">
        <span>Sample follow-up evidence items</span>
        ${sampleItems
          .map(
            (item) =>
              `<code>${escapeHtml(
                `${item.snapshotPath}#${item.key}: evidenceApproved:${item.evidenceApproved ? "yes" : "no"} / candidate:${item.candidateDecision} / export:${item.exportEligible ? "eligible" : "excluded"}`
              )}</code>`
          )
          .join("")}
      </div>`
    : `<div class="reply-fact-evidence"><span>No repo-visible follow-up evidence snapshots found under data/intake.</span></div>`;

  const snapshotList = snapshots.length
    ? `<div class="reply-fact-evidence">
        <span>Recent snapshots</span>
        ${snapshots
          .map(
            (snapshot) =>
              `<code>${escapeHtml(
                `${snapshot.path}: ${snapshot.evidenceApprovedCount}/${snapshot.evidenceItemCount} approved, ${snapshot.candidateAcceptedCount} accepted (${snapshot.updatedAt || "unknown time"})`
              )}</code>`
          )
          .join("")}
      </div>`
    : "";

  return `
    <article class="reply-fact-readiness-card followup-evidence-card ${escapeHtml(visibility.state || "not-observed")}">
      <div class="reply-fact-readiness-head">
        <div>
          <span>Follow-up evidence gate</span>
          <strong>${escapeHtml(visibility.stateLabel || "Not observed")}</strong>
        </div>
        <small>${escapeHtml((visibility.generatedFrom || []).join(", ") || "Derived from repo-visible export snapshots")}</small>
      </div>
      <div class="reply-fact-state-counts">
        ${renderReplyFactCount("Snapshots", visibility.snapshotCount || 0)}
        ${renderReplyFactCount("Evidence items", visibility.evidenceItemCount || 0)}
        ${renderReplyFactCount("Evidence approved", visibility.evidenceApprovedCount || 0)}
        ${renderReplyFactCount("Candidate accepted", visibility.candidateAcceptedCount || 0)}
        ${renderReplyFactCount("Approved + accepted", visibility.approvedAndAcceptedCount || 0)}
        ${renderReplyFactCount("Accept without approval", visibility.acceptedWithoutEvidenceApprovalCount || 0)}
      </div>
      ${
        activeRow
          ? `<div class="reply-fact-evidence">
              <span>Active queue row</span>
              <code>${escapeHtml(`${activeRow.owner} | ${activeRow.priority} | ${activeRow.task}`)}</code>
            </div>`
          : ""
      }
      ${sampleList}
      ${snapshotList}
      <p class="paid-review-interest-guardrail">${escapeHtml(visibility.guardrail || "")}</p>
    </article>
  `;
}

function renderStructuredExtractionTrend(trend) {
  const points = trend?.recentPoints || [];
  if (!points.length) {
    return `<div class="reply-fact-evidence"><span>No structured extraction trend points found yet.</span></div>`;
  }

  return `
    <div class="reply-fact-row-list">
      ${points
        .map(
          (point) => `
            <section class="reply-fact-row structured-extraction-row">
              <div class="reply-fact-row-head">
                <div>
                  <span>${escapeHtml(point.lane)} | ${escapeHtml(formatDate(point.startedAt))} | ${escapeHtml(point.status)}</span>
                  <p>${escapeHtml(point.summary || point.id)}</p>
                </div>
                <strong>${escapeHtml(point.promotedCount || 0)} promoted</strong>
              </div>
              <div class="reply-fact-meta">
                <section>
                  <span>Approved</span>
                  <p>${escapeHtml(point.approvedCount || 0)}</p>
                </section>
                <section>
                  <span>Promoted</span>
                  <p>${escapeHtml(point.promotedCount || 0)}</p>
                </section>
                <section>
                  <span>Accept boundary</span>
                  <p>${escapeHtml(point.acceptBlockedByMissingEvidenceApprovalCount || 0)} blocked before approval, ${escapeHtml(point.approvedAndAcceptedCount || 0)} approved + accepted</p>
                </section>
                <section>
                  <span>Unsafe export attempts</span>
                  <p>${escapeHtml(point.unsafeExportAttemptCount || 0)}</p>
                </section>
              </div>
              ${point.report ? `<div class="reply-fact-evidence"><code>${sourceLink(point.report)}</code></div>` : ""}
            </section>
          `
        )
        .join("")}
    </div>
  `;
}

function renderStructuredExtractionRow(row) {
  const approval = row.approvalState || {};
  const exportState = row.exportState || {};
  return `
    <section class="reply-fact-row structured-extraction-row ${escapeHtml(row.state || "not-visible")}">
      <div class="reply-fact-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "No extracted items visible")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(exportState.excludedUntilExplicitApproval ? "Export guarded" : "Review export leak")}</strong>
      </div>
      <small>${escapeHtml(row.gate || "")}</small>
      <div class="reply-fact-meta">
        <section>
          <span>Approval state</span>
          <p>${escapeHtml(approval.approved || 0)} approved, ${escapeHtml(approval.promoted || 0)} promoted, ${escapeHtml(approval.unapproved || 0)} unapproved, ${escapeHtml(approval.rejected || 0)} rejected, ${escapeHtml(approval.excluded || 0)} excluded</p>
        </section>
        <section>
          <span>Accept boundary</span>
          <p>${escapeHtml(approval.acceptBlockedByMissingEvidenceApproval || 0)} blocked by missing evidence approval, ${escapeHtml(approval.approvedAndAccepted || 0)} approved + accepted</p>
        </section>
        <section>
          <span>Provenance coverage</span>
          <p>${escapeHtml(row.provenanceCoveredCount || 0)} of ${escapeHtml(row.extractedItemCount || 0)} extracted item${row.extractedItemCount === 1 ? "" : "s"} (${escapeHtml(row.provenanceCoveragePercent || 0)}%)</p>
        </section>
        <section>
          <span>Export boundary</span>
          <p>${escapeHtml(exportState.exportExcluded || 0)} excluded, ${escapeHtml(exportState.exportEligible || 0)} eligible, ${escapeHtml(exportState.unsafeUnapprovedExport || 0)} unapproved export leaks</p>
        </section>
      </div>
      <div class="reply-fact-evidence">
        <span>${escapeHtml(row.evidenceNote || "Structured extraction status only.")}</span>
        ${
          (row.matchedArtifacts || []).length
            ? row.matchedArtifacts
                .slice(0, 8)
                .map(
                  (artifact) =>
                    `<code>${escapeHtml(`${artifact.source}#${artifact.index}: ${artifact.approvalState} / candidate:${artifact.candidateDecision || "none"} / accept-blocked:${artifact.acceptBlockedByMissingEvidenceApproval ? "yes" : "no"} / approved-accepted:${artifact.approvedAndAccepted ? "yes" : "no"} / provenance:${artifact.hasProvenance ? "yes" : "no"} / export:${artifact.exportEligible ? "eligible" : "excluded"} / ${artifact.label}`)}</code>`
                )
                .join("")
            : `<code>No repo-visible structured extracted items matched this row; export count remains zero.</code>`
        }
      </div>
    </section>
  `;
}

function renderReplyFactCount(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderReplyFactRow(row) {
  return `
    <section class="reply-fact-row ${escapeHtml(row.state || "unobserved")}">
      <div class="reply-fact-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.stateLabel || row.state || "Unobserved")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.blocked ? "Blocked" : "Open")}</strong>
      </div>
      <small>${escapeHtml(row.rationale || "")}</small>
      <div class="reply-fact-meta">
        <section>
          <span>Needed facts</span>
          <p>${escapeHtml((row.requiredStatuses || []).join(", ") || "Explicit operator reply fact")}</p>
        </section>
        <section>
          <span>Next step gate</span>
          <p>${escapeHtml(row.businessStep || "Do not advance business step without observed facts.")}</p>
        </section>
      </div>
      <div class="reply-fact-evidence">
        <span>${escapeHtml(row.evidenceNote || "No real outcome claimed.")}</span>
        ${
          (row.matchedArtifacts || []).length
            ? row.matchedArtifacts
                .map(
                  (artifact) => `
                    <code>${escapeHtml(`${artifact.source}#${artifact.index}: ${artifact.status}${artifact.route ? ` -> ${artifact.route}` : ""}`)}</code>
                  `
                )
                .join("")
            : `<code>No repo-visible reply-fact artifact matched this row.</code>`
        }
      </div>
    </section>
  `;
}

function renderCloseMatcherTrendDiagnostics(trend) {
  if (!trend) return "";
  return `
    <article class="close-trend-card">
      <div class="close-trend-head">
        <div>
          <span>Close matcher trend</span>
          <strong>${escapeHtml(trend.falseCloseRiskCount || 0)} false-close watch, ${escapeHtml(trend.staleProofRejectCount || 0)} stale-proof rejects</strong>
        </div>
        <small>${escapeHtml(trend.currentRejectCount || 0)} current evidence rejects across ${escapeHtml(trend.activeTotal || 0)} active rows</small>
      </div>
      <div class="close-trend-summary">
        ${renderCloseTrendMetric("Keep", trend.keepActiveCount || 0)}
        ${renderCloseTrendMetric("Close", trend.closeCount || 0)}
        ${renderCloseTrendMetric("Reasons", (trend.topReasons || []).length)}
      </div>
      <div class="close-trend-layout">
        ${renderCloseTrendGroupList("Owner", trend.byOwner || [])}
        ${renderCloseTrendGroupList("Row status", trend.byStatus || [])}
      </div>
      <div class="close-trend-rows">
        ${(trend.rows || [])
          .filter((row) => row.falseCloseRisk || row.staleProofRejectCount)
          .slice(0, 6)
          .map(renderCloseTrendRow)
          .join("") || `<section class="close-trend-row clear"><span>Risk examples</span><p>No stale proof or false-close watch rows in current matcher diagnostics.</p></section>`}
      </div>
    </article>
  `;
}

function renderCloseTrendMetric(label, value) {
  return `
    <section>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </section>
  `;
}

function renderCloseTrendGroupList(title, groups) {
  return `
    <section class="close-trend-group">
      <h3>${escapeHtml(title)}</h3>
      <div>
        ${groups.length
          ? groups.map(renderCloseTrendGroup).join("")
          : `<article class="empty-card">No ${escapeHtml(title.toLowerCase())} trend groups found.</article>`}
      </div>
    </section>
  `;
}

function renderCloseTrendGroup(group) {
  return `
    <article class="close-trend-group-card ${group.falseCloseRiskCount ? "watch" : "clear"}">
      <div class="close-trend-group-head">
        <div>
          <span>${escapeHtml(group.name)}</span>
          <strong>${escapeHtml(group.falseCloseRiskCount || 0)} watch / ${escapeHtml(group.rows || 0)} rows</strong>
        </div>
        <small>${escapeHtml(group.latestAt ? formatDate(group.latestAt) : "No candidate time")}</small>
      </div>
      <div class="close-trend-counts">
        ${renderCloseTrendMetric("Stale", group.staleProofRejectCount || 0)}
        ${renderCloseTrendMetric("Rejects", group.currentRejectCount || 0)}
        ${renderCloseTrendMetric("Close", group.closeCount || 0)}
      </div>
      <div class="close-trend-reasons">
        ${(group.topReasons || []).length
          ? group.topReasons.map((item) => `<span>${escapeHtml(item.reason)} x${escapeHtml(item.count)}</span>`).join("")
          : `<span>No rejects</span>`}
      </div>
    </article>
  `;
}

function renderCloseTrendRow(row) {
  const candidate = row.closestCandidate || {};
  const links = [candidate.passPath ? sourceLink(candidate.passPath, "pass") : "", candidate.report ? sourceLink(candidate.report, "report") : ""]
    .filter(Boolean)
    .join("");
  return `
    <section class="close-trend-row ${row.falseCloseRisk ? "watch" : "clear"}">
      <div class="close-trend-row-head">
        <div>
          <span>${escapeHtml(row.owner)} | ${escapeHtml(row.rowStatus)} | ${escapeHtml(row.riskLabel)}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.staleProofRejectCount || 0)} stale</strong>
      </div>
      <small>${escapeHtml((row.topReasons || []).map((item) => `${item.reason} x${item.count}`).join(", ") || "No reject reasons")}</small>
      ${
        candidate.title
          ? `<div class="close-trend-evidence">
              <span>Closest evidence</span>
              <p>${escapeHtml(candidate.title)}${candidate.finishedAt ? ` | ${escapeHtml(formatDate(candidate.finishedAt))}` : ""}</p>
              <div>${links}</div>
            </div>`
          : ""
      }
    </section>
  `;
}

function renderQueueCloseReadinessBanner(readiness) {
  const shouldShow = readiness?.activeTotal > 0;
  if (!shouldShow) return "";

  const evidence = readiness.evidenceLinks || [];
  return `
    <article class="queue-close-readiness-banner ${escapeHtml(readiness.status || "needs-open-work")}">
      <div class="queue-close-readiness-copy">
        <span>Close readiness</span>
        <strong>${escapeHtml(readiness.headline || "All current active queue rows are safe to close")}</strong>
        <p>${escapeHtml(readiness.rationale || "")}</p>
      </div>
      <div class="queue-close-readiness-counts" aria-label="Close readiness counts">
        <section>
          <span>Close</span>
          <strong>${escapeHtml(readiness.safeToCloseCount || 0)}</strong>
        </section>
        <section>
          <span>Keep</span>
          <strong>${escapeHtml(readiness.keepActiveCount || 0)}</strong>
        </section>
      </div>
      <div class="queue-close-readiness-evidence">
        ${evidence.length ? evidence.slice(0, 6).map(renderQueueCloseReadinessEvidence).join("") : `<span>No close evidence links yet.</span>`}
      </div>
    </article>
  `;
}

function renderQueueCloseReadinessEvidence(item) {
  const links = [item.passPath ? sourceLink(item.passPath, "pass") : "", item.report ? sourceLink(item.report, "report") : ""]
    .filter(Boolean)
    .join("");
  return `
    <section>
      <p>${escapeHtml(item.task || item.title || "Queue row evidence")}</p>
      <div>${links}</div>
      <small>${escapeHtml(item.status || "")}${(item.sharedMarkers || []).length ? ` | markers: ${escapeHtml(item.sharedMarkers.join(", "))}` : ""}</small>
    </section>
  `;
}

function renderTokenChips(tokens, emptyLabel = "None") {
  const values = (tokens || []).filter(Boolean);
  return values.length
    ? values.map((token) => `<span>${escapeHtml(token)}</span>`).join("")
    : `<span>${escapeHtml(emptyLabel)}</span>`;
}

function renderCloseMatcherDiagnostics(diagnostic) {
  if (!diagnostic) return "";
  const candidates = diagnostic.currentEvidenceCandidates || [];
  const action = diagnostic.actionNegation || {};
  return `
    <details class="close-diagnostic">
      <summary>Matcher diagnostics</summary>
      <div class="close-diagnostic-grid">
        <section>
          <span>Action token</span>
          <strong>${escapeHtml(diagnostic.actionToken || "none")}</strong>
          <p>${escapeHtml(action.reason || "No action-token rule recorded.")}</p>
        </section>
        <section>
          <span>Signature tokens</span>
          <div class="token-list">${renderTokenChips(diagnostic.signatureTokens || [])}</div>
        </section>
        <section>
          <span>Matched tokens</span>
          <div class="token-list">${renderTokenChips(diagnostic.matchedTokens?.report || diagnostic.matchedTokens?.primary || [])}</div>
        </section>
        <section>
          <span>Missing signature</span>
          <div class="token-list">${renderTokenChips(diagnostic.missingSignatureTokens?.report || [])}</div>
        </section>
      </div>
      <div class="close-diagnostic-meta">
        <code>${escapeHtml(`negation: ${action.state || "unknown"}`)}</code>
        <code>${escapeHtml(`queue cutoff: ${diagnostic.queueAt ? formatDate(diagnostic.queueAt) : "unknown"}`)}</code>
        <code>${escapeHtml(`primary signature: ${diagnostic.thresholds?.requiredPrimarySignatureShared ?? 0}`)}</code>
        <code>${escapeHtml(`report tokens: ${diagnostic.thresholds?.minimumAllTokenShared ?? 0}`)}</code>
      </div>
      <div class="close-candidates">
        ${
          candidates.length
            ? candidates.map(renderCloseMatcherCandidate).join("")
            : `<section><span>Evidence candidates</span><p>No completed lane evidence candidates were found.</p></section>`
        }
      </div>
    </details>
  `;
}

function renderCloseMatcherCandidate(candidate) {
  const links = [candidate.passPath ? sourceLink(candidate.passPath, "pass") : "", candidate.report ? sourceLink(candidate.report, "report") : ""]
    .filter(Boolean)
    .join("");
  return `
    <section class="${candidate.matched ? "matched" : "rejected"}">
      <div>
        <span>${escapeHtml(candidate.matched ? "Matched evidence" : "Rejected evidence")}</span>
        <p>${escapeHtml(candidate.title || candidate.passId || "Evidence candidate")}</p>
      </div>
      <div class="close-candidate-links">${links}</div>
      <small>${escapeHtml(
        candidate.matched
          ? "accepted"
          : (candidate.reasons || []).join(", ") || "rejected"
      )}</small>
      <div class="token-list">${renderTokenChips(candidate.matchedTokens?.report || [])}</div>
    </section>
  `;
}

function renderQueueRefreshDecision(decision) {
  return `
    <div class="queue-refresh-item ${decision.recommendedAction === "close" ? "can-close" : ""}">
      <div>
        <span>${escapeHtml(decision.owner)} | ${escapeHtml(decision.priority)} | ${escapeHtml(decision.recommendedAction)}</span>
        <p>${escapeHtml(decision.task)}</p>
      </div>
      <small>${escapeHtml(decision.rationale)}</small>
      ${
        (decision.evidence || []).length
          ? `<div class="queue-refresh-evidence">
              ${decision.evidence
                .map(
                  (item) => `
                    <div class="queue-refresh-links">
                      ${item.passPath ? sourceLink(item.passPath, "pass") : ""}
                      ${item.report ? sourceLink(item.report, "report") : ""}
                    </div>
                    <small>${escapeHtml(item.status)} | markers: ${escapeHtml((item.sharedMarkers || []).join(", "))}</small>
                  `
                )
                .join("")}
            </div>`
          : ""
      }
      ${renderCloseMatcherDiagnostics(decision.closeMatcherDiagnostic)}
    </div>
  `;
}

function renderQueueAgeProofComparison(comparison) {
  const panel = document.querySelector("#queue-age-proof");
  if (!panel) return;

  const items = comparison?.items || [];
  if (!items.length) {
    panel.innerHTML = `<article class="queue-age-proof-card is-empty">
      <span>Queue age vs proof age</span>
      <strong>No active queue rows to compare</strong>
      <p>Active queue/proof comparison will appear once backlog rows and pass evidence exist.</p>
    </article>`;
    return;
  }

  panel.innerHTML = `
    <article class="queue-age-proof-card">
      <div class="queue-age-proof-head">
        <div>
          <span>Queue age vs proof age</span>
          <strong>${escapeHtml(comparison.proofNewerCount || 0)} proof newer, ${escapeHtml(comparison.awaitingProofCount || 0)} awaiting proof</strong>
        </div>
        <small>${(comparison.generatedFrom || []).length ? `Derived from ${escapeHtml(comparison.generatedFrom.join(", "))}` : "Derived from admin data"}</small>
      </div>
      <div class="queue-age-proof-list">
        ${items.map(renderQueueAgeProofItem).join("")}
      </div>
    </article>
  `;
}

function renderQueueAgeProofItem(item) {
  const proof = item.proofSource;
  const queueSource = item.queueSource || {};
  return `
    <section class="queue-age-proof-item ${escapeHtml(item.comparison || "")}">
      <div class="queue-age-proof-item-head">
        <div>
          <span>${escapeHtml(item.lane)} | ${escapeHtml(item.priority)} | ${escapeHtml(item.riskLabel)}</span>
          <p>${escapeHtml(item.task)}</p>
        </div>
        <strong>${escapeHtml(item.queueAgeLabel)} / ${escapeHtml(item.proofAgeLabel)}</strong>
      </div>
      <small>${escapeHtml(item.rationale || "")}</small>
      <div class="queue-age-proof-sources">
        <div>
          <span>Queue source</span>
          ${
            queueSource.type === "pass-report-match"
              ? `${queueSource.pass ? `<code>${escapeHtml(queueSource.pass)}</code>` : ""}${queueSource.report ? `<code>${escapeHtml(queueSource.report)}</code>` : ""}`
              : `<code>${escapeHtml(queueSource.path || "ops/backlog/NEXT.md")}</code>`
          }
        </div>
        <div>
          <span>Validation proof</span>
          ${
            proof
              ? `<code>${escapeHtml(proof.command || "Validation recorded")}</code>
                 ${proof.pass ? `<code>${escapeHtml(proof.pass)}</code>` : ""}
                 ${proof.report ? `<code>${escapeHtml(proof.report)}</code>` : ""}`
              : `<code>No completed validation proof found</code>`
          }
        </div>
      </div>
    </section>
  `;
}

function renderDeliverableReadiness(readiness) {
  const grid = document.querySelector("#deliverable-readiness-grid");
  if (!grid) return;

  const lanes = readiness?.lanes || [];
  text("#deliverable-readiness-total", `${readiness?.activeTotal || 0} active`);
  text(
    "#deliverable-readiness-source",
    (readiness?.generatedFrom || []).length
      ? `Generated from ${readiness.generatedFrom.join(", ")}.`
      : "No deliverable readiness sources found."
  );

  grid.innerHTML = lanes.length
    ? lanes.map(renderDeliverableReadinessLane).join("")
    : `<article class="empty-card">No deliverable readiness data has been generated yet.</article>`;
}

function renderTurnoverSummary(turnover) {
  const grid = document.querySelector("#turnover-grid");
  if (!grid) return;

  const rows = turnover?.rows || [];
  text("#turnover-total", `${turnover?.newlyReadyCount || 0} new`);
  text(
    "#turnover-source",
    (turnover?.generatedFrom || []).length
      ? `Generated from ${turnover.generatedFrom.join(", ")}. ${turnover.latestCycleAgeLabel || "No cycle age."}`
      : "No turnover sources found."
  );

  if (!rows.length) {
    grid.innerHTML = `<article class="empty-card">No active rows are available for turnover classification.</article>`;
    return;
  }

  const latestCycle = turnover.latestCycle || {};
  grid.innerHTML = `
    <article class="turnover-overview">
      <div class="turnover-overview-copy">
        <span>Latest four-lane cycle</span>
        <strong>${escapeHtml(turnover.headline || "Turnover pending")}</strong>
        <p>${escapeHtml(turnover.rationale || "")}</p>
        <div class="turnover-links">
          ${latestCycle.pass ? sourceLink(latestCycle.pass, "cycle pass") : ""}
          ${latestCycle.report ? sourceLink(latestCycle.report, "cycle report") : ""}
        </div>
      </div>
      <div class="turnover-counts">
        <section>
          <span>Newly ready</span>
          <strong>${escapeHtml(turnover.newlyReadyCount || 0)}</strong>
        </section>
        <section>
          <span>Older evidence</span>
          <strong>${escapeHtml(turnover.olderEvidenceCount || 0)}</strong>
        </section>
        <section>
          <span>Current close</span>
          <strong>${escapeHtml(turnover.currentCloseEvidenceCount || 0)}</strong>
        </section>
      </div>
    </article>
    <div class="turnover-row-list">
      ${rows.map(renderTurnoverRow).join("")}
    </div>
  `;
}

function renderTurnoverRow(row) {
  const proof = row.proofSource || {};
  const queueSource = row.queueSource || {};
  const closeEvidence = row.closeEvidence || [];
  return `
    <section class="turnover-row ${escapeHtml(row.status || "needs-proof")}">
      <div class="turnover-row-head">
        <div>
          <span>${escapeHtml(row.lane)} | ${escapeHtml(row.priority)} | ${escapeHtml(row.statusLabel || "Needs proof")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.queueAgeLabel || "No queue age")}</strong>
      </div>
      <small>${escapeHtml(row.rationale || "")}</small>
      <div class="turnover-row-sources">
        <div>
          <span>Current queue row</span>
          ${
            queueSource.type === "pass-report-match"
              ? `${queueSource.pass ? sourceLink(queueSource.pass, "queue pass") : ""}${queueSource.report ? sourceLink(queueSource.report, "queue report") : ""}`
              : `<code>${escapeHtml(queueSource.path || "ops/backlog/NEXT.md")}</code>`
          }
        </div>
        <div>
          <span>Latest lane proof</span>
          ${
            proof.pass || proof.report
              ? `${proof.command ? `<code>${escapeHtml(proof.command)}</code>` : ""}${proof.pass ? sourceLink(proof.pass, "proof pass") : ""}${proof.report ? sourceLink(proof.report, "proof report") : ""}<code>${escapeHtml(row.proofAgeLabel || "")}</code>`
              : `<code>No completed validation proof found</code>`
          }
        </div>
      </div>
      ${
        closeEvidence.length
          ? `<div class="turnover-close-evidence">
              <span>Row-specific close evidence</span>
              ${closeEvidence
                .map(
                  (item) => `
                    <section>
                      <p>${escapeHtml(item.title || item.passId || "Close evidence")}</p>
                      <div>
                        ${item.passPath ? sourceLink(item.passPath, "pass") : ""}
                        ${item.report ? sourceLink(item.report, "report") : ""}
                      </div>
                    </section>
                  `
                )
                .join("")}
            </div>`
          : ""
      }
    </section>
  `;
}

function renderDeliverableReadinessLane(lane) {
  const rows = lane.rows || [];
  const proofLinks = lane.latestProofSource || {};
  return `
    <article class="deliverable-lane-card ${escapeHtml(lane.status || "needs-proof")}">
      <div class="deliverable-lane-head">
        <div>
          <span>${escapeHtml(lane.lane)}</span>
          <strong>${escapeHtml(lane.statusLabel || "Needs proof")}</strong>
        </div>
        <time>${escapeHtml(lane.latestProofAgeLabel || "No validation proof")}</time>
      </div>
      <div class="deliverable-lane-counts">
        <section>
          <span>Active</span>
          <strong>${escapeHtml(lane.activeCount || 0)}</strong>
        </section>
        <section>
          <span>Close evidence</span>
          <strong>${escapeHtml(lane.closeEvidenceCount || 0)}</strong>
        </section>
        <section>
          <span>Needs proof</span>
          <strong>${escapeHtml(lane.needsProofCount || 0)}</strong>
        </section>
      </div>
      <div class="deliverable-proof">
        <span>Latest proof</span>
        <p>${escapeHtml(lane.latestProofTitle || "No lane proof recorded.")}</p>
        ${lane.latestProofCommand ? `<code>${escapeHtml(lane.latestProofCommand)}</code>` : ""}
        <div class="deliverable-links">
          ${proofLinks.pass ? sourceLink(proofLinks.pass, "pass") : ""}
          ${proofLinks.report ? sourceLink(proofLinks.report, "report") : ""}
        </div>
      </div>
      <div class="deliverable-row-list">
        ${
          rows.length
            ? rows.map(renderDeliverableReadinessRow).join("")
            : `<section class="deliverable-row is-empty"><p>No active current-cycle row for this lane.</p></section>`
        }
      </div>
    </article>
  `;
}

function renderDeliverableReadinessRow(row) {
  const proof = row.proofSource || {};
  const queueSource = row.queueSource || {};
  const closeEvidence = row.closeEvidence || [];
  return `
    <section class="deliverable-row ${escapeHtml(row.status || "needs-proof")}">
      <div class="deliverable-row-head">
        <div>
          <span>${escapeHtml(row.priority)} | ${escapeHtml(row.statusLabel || "Needs proof")}</span>
          <p>${escapeHtml(row.task)}</p>
        </div>
        <strong>${escapeHtml(row.proofAgeLabel || "No validation proof")}</strong>
      </div>
      <small>${escapeHtml(row.rationale || "")}</small>
      <div class="deliverable-row-sources">
        <div>
          <span>Queue evidence</span>
          ${
            queueSource.type === "pass-report-match"
              ? `${queueSource.pass ? sourceLink(queueSource.pass, "queue pass") : ""}${queueSource.report ? sourceLink(queueSource.report, "queue report") : ""}`
              : `<code>${escapeHtml(queueSource.path || "ops/backlog/NEXT.md")}</code>`
          }
        </div>
        <div>
          <span>Proof evidence</span>
          ${
            proof.pass || proof.report
              ? `${proof.command ? `<code>${escapeHtml(proof.command)}</code>` : ""}${proof.pass ? sourceLink(proof.pass, "proof pass") : ""}${proof.report ? sourceLink(proof.report, "proof report") : ""}`
              : `<code>No completed validation proof found</code>`
          }
        </div>
      </div>
      ${
        closeEvidence.length
          ? `<div class="deliverable-close-evidence">
              <span>Close evidence</span>
              ${closeEvidence
                .map(
                  (item) => `
                    <section>
                      <p>${escapeHtml(item.title || item.passId || "Close evidence")}</p>
                      <div>
                        ${item.passPath ? sourceLink(item.passPath, "pass") : ""}
                        ${item.report ? sourceLink(item.report, "report") : ""}
                      </div>
                      <small>${escapeHtml(item.status || "")}${(item.sharedMarkers || []).length ? ` | markers: ${escapeHtml(item.sharedMarkers.join(", "))}` : ""}</small>
                    </section>
                  `
                )
                .join("")}
            </div>`
          : ""
      }
    </section>
  `;
}

function renderRecentlyShipped(shipped) {
  const items = shipped?.items || [];
  text("#shipped-total", `${items.length} shipped`);
  text("#shipped-source", shipped?.path ? `Generated from ${shipped.path}` : "No shipped outcome source found.");

  const list = document.querySelector("#recently-shipped-list");
  if (!list) return;
  list.innerHTML = items.length
    ? items
        .map(
          (item) => `
            <article class="shipped-card">
              <span>${escapeHtml(item.label)}</span>
              <p>${escapeHtml(item.summary)}</p>
              <code>${escapeHtml(item.path)}</code>
            </article>
          `
        )
        .join("")
    : `<article class="empty-card">No recently shipped outcomes found.</article>`;
}

function renderDecisionLedger(ledger) {
  const groups = document.querySelector("#decision-ledger-groups");
  if (!groups) return;

  const lanes = ["product", "growth", "qa"];
  text("#decision-ledger-total", `${ledger?.total || 0} decisions`);
  text(
    "#decision-ledger-source",
    (ledger?.generatedFrom || []).length
      ? `Generated from ${ledger.generatedFrom.join(" and ")}.`
      : "No decision source files found."
  );

  groups.innerHTML = lanes
    .map((lane) => {
      const laneGroup = ledger?.byLane?.[lane] || { items: [] };
      const items = laneGroup.items || [];
      return `
        <article class="decision-lane">
          <div class="decision-lane-head">
            <div>
              <span>${escapeHtml(lane)}</span>
              <strong>${escapeHtml(items.length)} latest</strong>
            </div>
            <small>${escapeHtml(laneGroup.latestAt ? formatDate(laneGroup.latestAt) : "Pending")}</small>
          </div>
          <div class="decision-items">
            ${
              items.length
                ? items.map(renderDecisionItem).join("")
                : `<div class="empty-card">No ${escapeHtml(lane)} decisions found in pass reports yet.</div>`
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function renderDecisionItem(decision) {
  return `
    <section class="decision-card">
      <div class="decision-card-head">
        <span>${escapeHtml(decision.kind || "Decision")}</span>
        <time>${escapeHtml(formatDate(decision.decidedAt))}</time>
      </div>
      <h3>${escapeHtml(decision.title)}</h3>
      <p>${escapeHtml(decision.summary)}</p>
      ${
        (decision.signals || []).length
          ? `<ul>${decision.signals.map((signal) => `<li>${escapeHtml(signal)}</li>`).join("")}</ul>`
          : ""
      }
      ${
        (decision.validation || []).length
          ? `<div class="decision-validation">${decision.validation.map((item) => `<code>${escapeHtml(item)}</code>`).join("")}</div>`
          : ""
      }
      ${decision.source ? `<code class="decision-source">${escapeHtml(decision.source)}</code>` : ""}
    </section>
  `;
}

function renderValidationFreshness(freshness) {
  const grid = document.querySelector("#freshness-grid");
  if (!grid) return;

  const items = freshness?.items || [];
  const needsPass = freshness?.needsPassCount || 0;
  text("#validation-freshness-total", `${needsPass} need pass`);
  text(
    "#validation-freshness-source",
    (freshness?.generatedFrom || []).length
      ? `Generated from ${freshness.generatedFrom.join(", ")}.`
      : "No freshness source files found."
  );

  grid.innerHTML = items.length
    ? items
        .map(
          (item) => `
            <article class="freshness-card ${item.needsAnotherPass ? "needs-pass" : "is-fresh"}">
              <div class="freshness-head">
                <div>
                  <span>${escapeHtml(item.lane)}</span>
                  <strong>${item.needsAnotherPass ? "Needs pass" : "Fresh"}</strong>
                </div>
                <time>${escapeHtml(formatDate(item.lastChangedAt))}</time>
              </div>
              <h3>${escapeHtml(item.lastChangeTitle || "No pass recorded")}</h3>
              <p>${escapeHtml(item.rationale || item.lastChangeSummary || "")}</p>
              ${
                item.provedBy
                  ? `<div class="freshness-proof"><span>Proved by</span><code>${escapeHtml(item.provedBy)}</code></div>`
                  : `<div class="freshness-proof"><span>Proved by</span><code>No validation command recorded</code></div>`
              }
              ${
                (item.changedFiles || []).length
                  ? `<div class="freshness-files">
                      <span>Changed files</span>
                      ${(item.changedFiles || []).map((file) => `<code>${escapeHtml(file)}</code>`).join("")}
                    </div>`
                  : ""
              }
              ${
                (item.activeQueue || []).length
                  ? `<div class="freshness-queue">
                      <span>Active queue</span>
                      ${(item.activeQueue || [])
                        .map(
                          (queueItem) => `
                            <section>
                              <small>${escapeHtml(queueItem.priority)} | ${escapeHtml(queueItem.recommendedAction)}</small>
                              <p>${escapeHtml(queueItem.task)}</p>
                            </section>
                          `
                        )
                        .join("")}
                    </div>`
                  : ""
              }
              ${item.report ? `<code class="freshness-report">${escapeHtml(item.report)}</code>` : ""}
            </article>
          `
        )
        .join("")
    : `<article class="empty-card">No lane freshness data has been generated yet.</article>`;
}

function renderSwarmThroughput(throughput) {
  const grid = document.querySelector("#throughput-grid");
  if (!grid) return;

  const lanes = throughput?.lanes || [];
  text("#swarm-throughput-total", `${throughput?.recentTotal || 0} recent`);
  text(
    "#swarm-throughput-source",
    (throughput?.generatedFrom || []).length
      ? `Generated from ${throughput.generatedFrom.join(", ")}. Recent window: latest pass stream ${throughput.recentWindowHours || 2}h.`
      : "No throughput source files found."
  );

  grid.innerHTML = lanes.length
    ? lanes
        .map(
          (lane) => `
            <article class="throughput-card ${escapeHtml(lane.riskLevel || "clear")}">
              <div class="throughput-head">
                <div>
                  <span>${escapeHtml(lane.lane)}</span>
                  <strong>${escapeHtml(lane.riskLabel || "Clear")}</strong>
                </div>
                <time>${escapeHtml(lane.validationAgeLabel || "No validation")}</time>
              </div>
              <div class="throughput-counts">
                <section>
                  <span>Recent passes</span>
                  <strong>${escapeHtml(lane.recentPassCount || 0)}</strong>
                </section>
                <section>
                  <span>Recent complete</span>
                  <strong>${escapeHtml(lane.completedRecentCount || 0)}</strong>
                </section>
                <section>
                  <span>Total passes</span>
                  <strong>${escapeHtml(lane.totalPassCount || 0)}</strong>
                </section>
              </div>
              <p>${escapeHtml(lane.latestSummary || "No recent lane summary.")}</p>
              <div class="throughput-validation">
                <span>Latest validation</span>
                <code>${escapeHtml(lane.validationCommand || "No validation command recorded")}</code>
              </div>
              ${
                (lane.riskReasons || []).length
                  ? `<div class="throughput-risks">
                      ${(lane.riskReasons || []).map((reason) => `<p>${escapeHtml(reason)}</p>`).join("")}
                    </div>`
                  : ""
              }
              ${
                (lane.riskPasses || []).length
                  ? `<div class="throughput-risk-passes">
                      ${(lane.riskPasses || [])
                        .map(
                          (pass) => `
                            <section>
                              <small>${escapeHtml(formatDate(pass.at))}</small>
                              <p>${escapeHtml(pass.title)}</p>
                              <em>${escapeHtml((pass.signals || []).join(", "))}</em>
                              ${pass.report ? `<code>${escapeHtml(pass.report)}</code>` : ""}
                            </section>
                          `
                        )
                        .join("")}
                    </div>`
                  : ""
              }
            </article>
          `
        )
        .join("")
    : `<article class="empty-card">No lane throughput data has been generated yet.</article>`;

  renderRiskDrilldown(throughput);
}

function renderRapidTickUtilization(utilization) {
  state.rapidTickUtilization = utilization || {};
  populateRapidTickFilters(state.rapidTickUtilization);
  bindRapidTickFilters();
  renderRapidTickList();
}

function populateRapidTickFilters(utilization) {
  const laneSelect = document.querySelector("#rapid-filter-lane");
  const outcomeSelect = document.querySelector("#rapid-filter-outcome");
  const laneSelected = laneSelect?.value || "all";
  const outcomeSelected = outcomeSelect?.value || "all";
  const lanes = utilization?.filters?.lanes || [];
  const outcomes = utilization?.filters?.outcomes || [];

  if (laneSelect) {
    laneSelect.innerHTML = [
      `<option value="all">All lanes</option>`,
      ...lanes.map((lane) => `<option value="${escapeHtml(lane.value)}">${escapeHtml(lane.label)} (${escapeHtml(lane.count)})</option>`),
    ].join("");
    laneSelect.value = lanes.some((lane) => lane.value === laneSelected) ? laneSelected : "all";
  }

  if (outcomeSelect) {
    outcomeSelect.innerHTML = [
      `<option value="all">All outcomes</option>`,
      ...outcomes.map(
        (outcome) => `<option value="${escapeHtml(outcome.value)}">${escapeHtml(outcome.label)} (${escapeHtml(outcome.count)})</option>`
      ),
    ].join("");
    outcomeSelect.value = outcomes.some((outcome) => outcome.value === outcomeSelected) ? outcomeSelected : "all";
  }
}

function bindRapidTickFilters() {
  if (state.rapidFiltersBound) return;
  ["#rapid-filter-lane", "#rapid-filter-outcome"].forEach((selector) => {
    const select = document.querySelector(selector);
    if (select) select.addEventListener("change", renderRapidTickList);
  });
  state.rapidFiltersBound = true;
}

function renderRapidTickList() {
  const grid = document.querySelector("#rapid-tick-grid");
  if (!grid) return;

  const utilization = state.rapidTickUtilization || {};
  const ticks = utilization.ticks || [];
  const laneFilter = document.querySelector("#rapid-filter-lane")?.value || "all";
  const outcomeFilter = document.querySelector("#rapid-filter-outcome")?.value || "all";
  const filtered = ticks.filter((tick) => {
    if (laneFilter !== "all" && !(tick.lanesCovered || []).includes(laneFilter)) return false;
    if (outcomeFilter !== "all" && !(tick.validationOutcomes || [tick.validationStatus]).includes(outcomeFilter)) return false;
    return true;
  });

  text("#rapid-tick-total", `${filtered.length} / ${ticks.length} shown`);
  text(
    "#rapid-tick-source",
    (utilization?.generatedFrom || []).length
      ? `Generated from ${utilization.generatedFrom.join(", ")}. Shows latest integration ticks, returned lane passes, parent fixes, mismatches, and validation.`
      : "No rapid tick source files found."
  );

  grid.innerHTML = filtered.length
    ? filtered.map(renderRapidTickCard).join("")
    : `<article class="empty-card">No rapid tick records match the current filters.</article>`;
}

function renderRapidTickCard(tick) {
  const returned = tick.returnedPasses || [];
  const parentFixes = tick.parentFixes || [];
  const mismatches = tick.mismatchNotes || [];
  const validationCommands = tick.validationCommands || [];
  return `
    <article class="rapid-tick-card ${escapeHtml(tick.validationStatus || "unknown")}">
      <div class="rapid-tick-head">
        <div>
          <span>${escapeHtml(formatDate(tick.at))}</span>
          <h3>${escapeHtml(tick.title || "Rapid tick")}</h3>
        </div>
        <strong>${escapeHtml(tick.validationLabel || "No validation")}</strong>
      </div>
      <div class="rapid-tick-counts">
        <section>
          <span>Lanes spawned</span>
          <strong>${escapeHtml((tick.spawnedLanes || []).length)}</strong>
          <p>${escapeHtml((tick.spawnedLanes || []).join(", ") || "None inferred")}</p>
        </section>
        <section>
          <span>Passes returned</span>
          <strong>${escapeHtml(tick.returnedPassCount || 0)}</strong>
          <p>${escapeHtml((tick.lanesReturned || []).join(", ") || "None")}</p>
        </section>
        <section>
          <span>Parent fixes</span>
          <strong>${escapeHtml(parentFixes.length)}</strong>
          <p>${escapeHtml(parentFixes[0] || "No parent fix notes found.")}</p>
        </section>
        <section>
          <span>Mismatches</span>
          <strong>${escapeHtml(mismatches.length)}</strong>
          <p>${escapeHtml(mismatches[0] || "No mismatch notes found.")}</p>
        </section>
      </div>
      ${
        returned.length
          ? `<div class="rapid-returned-passes">
              ${returned
                .map(
                  (pass) => `
                    <section>
                      <div>
                        <span>${escapeHtml(pass.lane)} | ${escapeHtml(pass.status)} | ${escapeHtml(pass.validationLabel)}</span>
                        <p>${escapeHtml(pass.title)}</p>
                      </div>
                      ${pass.passPath ? sourceLink(pass.passPath) : ""}
                      ${pass.report ? sourceLink(pass.report) : ""}
                    </section>
                  `
                )
                .join("")}
            </div>`
          : ""
      }
      ${
        (tick.missingLanes || []).length
          ? `<div class="rapid-missing"><span>Missing returned lanes</span><p>${escapeHtml(tick.missingLanes.join(", "))}</p></div>`
          : ""
      }
      <div class="rapid-parent-sources">
        ${tick.parentPassPath ? sourceLink(tick.parentPassPath) : ""}
        ${tick.parentReport ? sourceLink(tick.parentReport) : ""}
      </div>
      ${
        validationCommands.length
          ? `<div class="rapid-validation">${validationCommands.slice(0, 5).map((command) => `<code>${escapeHtml(command)}</code>`).join("")}</div>`
          : ""
      }
    </article>
  `;
}

function renderRiskDrilldown(throughput) {
  state.riskHistory = throughput?.riskHistory || [];
  populateRiskLaneFilter(state.riskHistory);
  bindRiskFilters();
  renderRiskHistoryList();
}

function populateRiskLaneFilter(history) {
  const select = document.querySelector("#risk-filter-lane");
  if (!select) return;
  const selected = select.value || "all";
  const lanes = [...new Set(history.map((item) => item.lane).filter(Boolean))].sort();
  select.innerHTML = [
    `<option value="all">All lanes</option>`,
    ...lanes.map((lane) => `<option value="${escapeHtml(lane)}">${escapeHtml(lane)}</option>`),
  ].join("");
  select.value = lanes.includes(selected) ? selected : "all";
}

function bindRiskFilters() {
  if (state.riskFiltersBound) return;
  ["#risk-filter-lane", "#risk-filter-level", "#risk-filter-source"].forEach((selector) => {
    const select = document.querySelector(selector);
    if (select) select.addEventListener("change", renderRiskHistoryList);
  });
  state.riskFiltersBound = true;
}

function riskFilterValue(selector) {
  return document.querySelector(selector)?.value || "all";
}

function renderRiskHistoryList() {
  const list = document.querySelector("#risk-history-list");
  if (!list) return;

  const laneFilter = riskFilterValue("#risk-filter-lane");
  const levelFilter = riskFilterValue("#risk-filter-level");
  const sourceFilter = riskFilterValue("#risk-filter-source");
  const filtered = state.riskHistory.filter((item) => {
    if (laneFilter !== "all" && item.lane !== laneFilter) return false;
    if (levelFilter !== "all" && item.riskLevel !== levelFilter) return false;
    if (sourceFilter === "report" && !item.reportFound) return false;
    if (sourceFilter === "pass" && item.reportFound) return false;
    return true;
  });

  text("#risk-history-total", `${filtered.length} / ${state.riskHistory.length} records`);
  list.innerHTML = filtered.length
    ? filtered.slice(0, 18).map(renderRiskHistoryItem).join("")
    : `<article class="empty-card">No risk history records match the current filters.</article>`;
}

function renderRiskHistoryItem(item) {
  const signals = item.signals || [];
  return `
    <article class="risk-history-card ${escapeHtml(item.riskLevel || "clear")}">
      <div class="risk-history-head">
        <div>
          <span>${escapeHtml(item.lane)} | ${escapeHtml(item.riskLabel || "Clear")}</span>
          <h4>${escapeHtml(item.title)}</h4>
        </div>
        <time>${escapeHtml(formatDate(item.at))}</time>
      </div>
      <p>${escapeHtml(item.summary || "No summary recorded.")}</p>
      <div class="risk-evidence">
        <span>${escapeHtml(item.reportSource || "Evidence")}</span>
        <p>${escapeHtml(item.evidenceExcerpt || "No excerpt available.")}</p>
      </div>
      <div class="risk-meta">
        <code>${escapeHtml(item.report || "Pass JSON only")}</code>
        <small>${escapeHtml(item.completionStatus || item.status || "unknown")}</small>
      </div>
      ${
        signals.length
          ? `<div class="risk-signals">${signals.map((signal) => `<span>${escapeHtml(signal)}</span>`).join("")}</div>`
          : `<div class="risk-signals"><span>No risk signals</span></div>`
      }
      ${
        (item.changedFiles || []).length
          ? `<div class="risk-files">${item.changedFiles.map((file) => `<code>${escapeHtml(file)}</code>`).join("")}</div>`
          : ""
      }
    </article>
  `;
}

function renderLocalCapture(localCapture) {
  const list = document.querySelector("#local-capture-list");
  if (!list) return;
  const artifacts = localCapture.artifacts || [];
  const storage = localCapture.storage || {};
  const artifactCards = artifacts.map(
    (artifact) => `
      <article class="capture-card">
        <span>${escapeHtml(artifact.type)}</span>
        <strong>${escapeHtml(String(artifact.count))} captured</strong>
        <code>${escapeHtml(artifact.path)}</code>
        ${(artifact.latest || []).map((item) => `<p>${escapeHtml(item)}</p>`).join("")}
      </article>
    `
  );

  list.innerHTML = [
    `<article class="capture-card">
      <span>Local storage</span>
      <strong>${escapeHtml(storage.intakeBrowserKey || "proofresume:intakes")}</strong>
      <p>Browser-only intake drafts are kept client-side; external calls are ${storage.externalCalls ? "enabled" : "off"}.</p>
    </article>`,
    ...artifactCards,
    artifacts.length
      ? ""
      : `<article class="empty-card">No dev-lead JSONL or intake artifact files are present yet. Expected lead path: <code>${escapeHtml(storage.devLeadsPath || "data/leads/dev-leads.jsonl")}</code>.</article>`,
  ].join("");
}

function renderValidation(validation) {
  const list = document.querySelector("#validation-list");
  if (!list) return;
  const visual = validation.visualQa;
  const visualStatus = visual ? (visual.ok ? "passing" : "failing") : "not run";
  list.innerHTML = [
    ...(validation.commands || []).map(
      (command) => `<div class="validation-item"><span>Command</span><code>${command}</code></div>`
    ),
    `<div class="validation-item"><span>Latest visual QA</span><code>${visualStatus}</code></div>`,
  ].join("");
}

function averageScore(score) {
  const values = Object.values(score || {}).filter((value) => typeof value === "number");
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function renderSwarmHealth(passes, swarmState) {
  const scored = passes.filter((pass) => pass.score);
  const checkpoints = scored.filter((pass) => pass.id && pass.id.startsWith("checkpoint-"));
  const latest = checkpoints[0] || scored[0];
  const average = latest ? averageScore(latest.score) : null;
  text("#swarm-average", average === null ? "Pending" : `${average.toFixed(1)}/10`);

  const grid = document.querySelector("#checkpoint-grid");
  if (!grid) return;
  const completed = swarmState.completed_score_checkpoints || [];
  const expected = [10, 30, 60];
  grid.innerHTML = expected
    .map((minute) => {
      const pass = checkpoints.find((item) => item.id.includes(`-${minute}-minute`));
      const score = pass ? averageScore(pass.score) : null;
      const isComplete = completed.includes(minute);
      return `
        <article class="checkpoint-card">
          <span>${minute} minute</span>
          <strong>${score === null ? (isComplete ? "Done" : "Pending") : `${score.toFixed(1)}/10`}</strong>
          <p>${pass ? pass.summary : "Waiting for autonomous score pass."}</p>
          ${pass?.report ? `<code>${pass.report}</code>` : ""}
        </article>
      `;
    })
    .join("");
}

function renderSprintTrend(trend) {
  const summary = document.querySelector("#trend-summary");
  const chart = document.querySelector("#trend-chart");
  const lanes = document.querySelector("#trend-lanes");
  if (!summary || !chart || !lanes) return;

  text("#trend-velocity", trend.passesPerHour === null || trend.passesPerHour === undefined ? "Pending" : `${trend.passesPerHour}/hr`);

  const summaryItems = [
    ["Total", trend.totalPasses || 0],
    ["Complete", trend.completedPasses || 0],
    ["Reports", trend.reportsPublished || 0],
    ["Validation notes", trend.validationMentions || 0],
  ];
  summary.innerHTML = summaryItems
    .map(
      ([label, value]) => `
        <article>
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `
    )
    .join("");

  const recentPoints = trend.recentPoints || [];
  const maxTotal = Math.max(...recentPoints.map((point) => point.cumulativeTotal || 0), 1);
  chart.innerHTML = recentPoints.length
    ? recentPoints
        .map((point) => {
          const height = Math.max(12, Math.round(((point.cumulativeTotal || 0) / maxTotal) * 100));
          return `
            <article class="trend-point" title="${escapeHtml(point.summary)}">
              <div class="trend-bars">
                <span style="height: ${height}%"></span>
              </div>
              <strong>${escapeHtml(String(point.cumulativeTotal || 0))}</strong>
              <small>${escapeHtml(point.label)} | ${escapeHtml(point.lane)}</small>
              <em>${point.averageScore === null || point.averageScore === undefined ? "No score" : `${escapeHtml(point.averageScore)}/10`}</em>
            </article>
          `;
        })
        .join("")
    : `<article class="empty-card">No timestamped passes available for trend data yet.</article>`;

  lanes.innerHTML = (trend.lanes || [])
    .map(
      (lane) => `
        <article class="trend-lane">
          <div>
            <span>${escapeHtml(lane.lane)}</span>
            <strong>${escapeHtml(lane.complete)} / ${escapeHtml(lane.total)} complete</strong>
          </div>
          <p>${escapeHtml(lane.latestSummary || "No recent lane summary.")}</p>
        </article>
      `
    )
    .join("");
}

function renderLanes(lanes, passes) {
  const grid = document.querySelector("#lane-grid");
  if (!grid) return;
  grid.innerHTML = lanes
    .map((lane) => {
      const laneName = lane.title;
      const lanePasses = passes.filter((pass) => pass.lane === laneName);
      const latest = lanePasses[0];
      return `
        <article class="lane-card">
          <h3>${laneName}</h3>
          <p>${latest ? latest.summary : "No lane-specific pass recorded yet."}</p>
          <code>${lane.path}</code>
        </article>
      `;
    })
    .join("");
}

function renderDocs(documents) {
  state.documents = documents;
  const tabs = document.querySelector("#doc-tabs");
  if (!tabs) return;
  tabs.innerHTML = documents
    .map((doc, index) => `<button type="button" data-doc-index="${index}">${doc.title}</button>`)
    .join("");
  tabs.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-doc-index]");
    if (!button) return;
    selectDoc(Number(button.dataset.docIndex));
  });
  selectDoc(0);
}

function selectDoc(index) {
  const doc = state.documents[index];
  if (!doc) return;
  document.querySelectorAll("#doc-tabs button").forEach((button) => {
    button.classList.toggle("is-active", Number(button.dataset.docIndex) === index);
  });
  text("#doc-title", doc.title);
  text("#doc-path", doc.path);
  text("#doc-content", doc.content || "(empty)");
}

async function main() {
  const response = await fetch("admin-data.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not load admin data: ${response.status}`);
  const data = await response.json();
  const passes = data.passes || [];
  const complete = passes.filter((pass) => pass.status === "complete").length;
  const inProgress = passes.filter((pass) => pass.status === "in_progress").length;
  const docs = [...(data.docs || []), ...(data.lanes || []), ...(data.reports || []), ...(data.requirements || [])];

  text("#workspace-path", data.company?.workspace || "Unknown");
  text("#generated-at", formatDate(data.generatedAt));
  text("#metric-passes", String(passes.length));
  text("#metric-complete", String(complete));
  text("#metric-progress", String(inProgress));
  text("#metric-qa", data.validation?.visualQa?.ok ? "Pass" : "Check");
  text("#metric-active-queue", String(data.operations?.backlogQueue?.items?.length || 0));
  text("#metric-shipped", String(data.operations?.recentlyShipped?.items?.length || 0));
  text("#metric-stale-queue", String(data.operations?.staleGuardrails?.total || 0));
  text("#metric-safe-close", String(data.operations?.queueRefreshDecisionInput?.safeToCloseCount || 0));
  text("#metric-needs-pass", String(data.operations?.validationFreshness?.needsPassCount || 0));
  text("#metric-stuck-risk", String(data.operations?.swarmThroughput?.stuckRiskCount || 0));
  text("#metric-proof-newer", String(data.operations?.queueAgeProofComparison?.proofNewerCount || 0));
  text("#metric-rapid-ticks", String(data.operations?.rapidTickUtilization?.totalTicks || 0));
  text("#metric-mismatches", String(data.operations?.rapidTickUtilization?.mismatchCount || 0));
  text("#metric-ready-lanes", String(data.operations?.deliverableReadiness?.readyToCloseCount || 0));
  text("#metric-newly-ready", String(data.operations?.turnoverSummary?.newlyReadyCount || 0));
  text("#metric-older-evidence", String(data.operations?.turnoverSummary?.olderEvidenceCount || 0));
  text(
    "#metric-accept-blocked",
    String(data.operations?.structuredExtractionVisibility?.acceptBlockedByMissingEvidenceApprovalCount || 0)
  );
  text(
    "#metric-bulk-ready",
    data.operations?.structuredExtractionVisibility?.bulkControlReadiness?.stateLabel || "Check"
  );
  text(
    "#metric-market-controls",
    `${data.operations?.businessControlsVisibility?.revenueCriticalEnabledCount || 0} / ${data.operations?.businessControlsVisibility?.revenueCriticalTotal || 0}`
  );

  renderSwarmHealth(passes, data.swarmState || {});
  renderSprintTrend(data.operations?.sprintTrend || {});
  renderFirstCustomerLaunchRoom(data.operations?.firstCustomerLaunchRoom || {});
  renderFirstCustomerSignalSurface(data.operations?.firstCustomerSignalSurface || {});
  renderFirstCustomerEvidenceInboxRoom(data.operations?.firstCustomerEvidenceInboxRoom || {});
  renderFirstCustomerEvidenceRouteScoreboard(data.operations?.firstCustomerEvidenceRouteScoreboard || {});
  renderFirstCustomerEvidenceProofRepairPacket(data.operations?.firstCustomerEvidenceProofRepairPacket || {});
  renderRepairedProofToPaidAskRoom(data.operations?.repairedProofToPaidAskRoom || {});
  renderPaidAskOutcomeRouter(data.operations?.paidAskOutcomeRouter || {});
  renderPaidAskProofPacketClarityRepair(data.operations?.paidAskProofPacketClarityRepair || {});
  renderPaidAskObjectionResponseSimulator(data.operations?.paidAskObjectionResponseSimulator || {});
  renderFirstPaidPilotHandoffRoom(data.operations?.firstPaidPilotHandoffRoom || {});
  renderFirstPaidPilotGateSimulator(data.operations?.firstPaidPilotGateSimulator || {});
  renderFirstDollarReadinessRoom(data.operations?.firstDollarReadinessRoom || {});
  renderFirstDollarOwnerEvidenceRepairRoom(data.operations?.firstDollarOwnerEvidenceRepairRoom || {});
  renderFirstPaidPilotFulfillmentReceiptPreview(data.operations?.firstPaidPilotFulfillmentReceiptPreview || {});
  renderFirstLiveProofAuditCopilot(data.operations?.firstLiveProofAuditCopilot || {});
  renderLiveToPaidPilotDecisionRoom(data.operations?.liveToPaidPilotDecisionRoom || {});
  renderLiveProofTrustGapRepairRoom(data.operations?.liveProofTrustGapRepairRoom || {});
  renderLiveProofMissingProofCueRepair(data.operations?.liveProofMissingProofCueRepair || {});
  renderPaidPilotTrustGapRepairLab(data.operations?.paidPilotTrustGapRepairLab || {});
  renderProofDeltaValueSnapshot(data.operations?.proofDeltaValueSnapshot || {});
  renderFirstAuthorizedSessionRunner(data.operations?.firstAuthorizedSessionRunner || {});
  renderFirstCustomerPilotConsole(data.operations?.firstCustomerPilotConsole || {});
  renderFirstCustomerPilotRevenueSimulator(data.operations?.firstCustomerPilotRevenueSimulator || {});
  renderConsentedAuditHandoffPreview(data.operations?.consentedAuditHandoffPreview || {});
  renderBusinessControlsVisibility(data.operations?.businessControlsVisibility || {});
  renderOwnerAuthorityRepairLoopPreview(data.operations?.ownerAuthorityRepairLoopPreview || {});
  renderConciergeFulfillmentDashboard(data.operations?.conciergeFulfillmentDashboard || {});
  renderRedactedSessionEvidenceInbox(data.operations?.redactedSessionEvidenceInbox || {});
  renderFeedbackRoadmap();
  renderDecisionLedger(data.operations?.decisionLedger || {});
  renderValidationFreshness(data.operations?.validationFreshness || {});
  renderSwarmThroughput(data.operations?.swarmThroughput || {});
  renderRapidTickUtilization(data.operations?.rapidTickUtilization || {});
  renderNextActions(data.operations?.nextActions || []);
  renderBacklogQueue(data.operations?.backlogQueue || {});
  renderStaleQueueGuardrails(data.operations?.staleGuardrails || {});
  renderQueueRefreshDecisionInput(data.operations?.queueRefreshDecisionInput || {});
  renderQueueAgeProofComparison(data.operations?.queueAgeProofComparison || {});
  renderTurnoverSummary(data.operations?.turnoverSummary || {});
  renderDeliverableReadiness(data.operations?.deliverableReadiness || {});
  renderRecentlyShipped(data.operations?.recentlyShipped || {});
  renderLocalCapture(data.operations?.localCapture || {});
  renderFeedbackRoadmap();
  renderBundleLibrary();
  renderPasses(passes);
  renderValidation(data.validation || {});
  renderLanes(data.lanes || [], passes);
  renderDocs(docs);
}

main().catch((error) => {
  text("#workspace-path", "Admin data failed to load");
  text("#doc-content", error instanceof Error ? error.message : String(error));
});

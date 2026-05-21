const LOCAL_DEMO_IDENTITY_KEY = "agentfoundry.localDemoIdentity.v1";
const SESSION_KEY = LOCAL_DEMO_IDENTITY_KEY;
const WORKSPACE_KEY = "proofresume:localWorkspace:v1";
const WORKSPACE_ID_PREFIX = "prw";
const WORKSPACE_EXPORT_FORMAT = "proofresume-local-workspace-export-v1";
const TARGET_JOB_PROFILE_KEY = "proofresume:targetJobProfile";
const TARGET_JOB_LEADS_KEY = "proofresume:targetJobLeads";
const TARGET_JOB_SELECTED_KEY = "proofresume:workspaceSelectedJob:v1";
const TARGET_JOB_PROFILE_FORMAT = "proofresume-target-job-profile-v2";
const TARGET_JOB_LEAD_FORMAT = "proofresume-target-job-lead-v1";
const TARGET_PREFERENCES_FORMAT = "proofresume-target-preferences-v1";
const AUTH_CONTROL_IDS = Object.freeze(["auth", "customer_data", "admin_access", "external_auth_email"]);
const APPLICATION_TRACKER_FORMAT = "proofresume-local-application-tracker-v1";
const APPLICATION_PACKET_FORMAT = "proofresume-local-application-approval-packet-v1";
const APPLICATION_AUDIT_FORMAT = "proofresume-application-audit-event-v1";
const TAILORED_PACKET_GENERATOR_FORMAT = "proofresume-local-tailored-packet-generator-v1";
const TAILORED_PACKET_HANDOFF_FORMAT = "proofresume-workspace-tailored-packet-handoff-v1";
const FIRST_SESSION_HANDOFF_FORMAT = "proofresume-first-session-handoff-v1";
const FIRST_SESSION_CUSTOMER_HANDOFF_ROOM_FORMAT = "proofresume-first-session-customer-handoff-room-v1";
const FIRST_SESSION_OBJECTION_REPAIR_WIZARD_FORMAT = "proofresume-first-session-objection-to-repair-wizard-v1";
const FIRST_CUSTOMER_CONCIERGE_DEMO_BUNDLE_FORMAT = "proofresume-first-customer-concierge-demo-bundle-v1";
const FIRST_CUSTOMER_REACTION_ROUTE_RECORDER_FORMAT = "proofresume-first-customer-reaction-route-recorder-v1";
const FIRST_CUSTOMER_EVIDENCE_INBOX_ROOM_FORMAT = "proofresume-first-customer-evidence-inbox-room-v1";
const FIRST_CUSTOMER_EVIDENCE_ROUTE_SCOREBOARD_FORMAT = "proofresume-first-customer-evidence-route-scoreboard-v1";
const FIRST_CUSTOMER_EVIDENCE_PROOF_REPAIR_PACKET_FORMAT = "proofresume-first-customer-evidence-proof-repair-packet-v1";
const REPAIRED_PROOF_TO_PAID_ASK_ROOM_FORMAT = "proofresume-repaired-proof-to-paid-ask-room-v1";
const PAID_ASK_OUTCOME_ROUTER_FORMAT = "proofresume-paid-ask-outcome-router-v1";
const PAID_ASK_PROOF_PACKET_CLARITY_REPAIR_FORMAT = "proofresume-paid-ask-proof-packet-clarity-repair-v1";
const PAID_ASK_OBJECTION_RESPONSE_SIMULATOR_FORMAT = "proofresume-paid-ask-objection-response-simulator-v1";
const FIRST_PAID_PILOT_HANDOFF_ROOM_FORMAT = "proofresume-first-paid-pilot-handoff-room-v1";
const FIRST_DOLLAR_READINESS_ROOM_FORMAT = "proofresume-first-dollar-readiness-room-v1";
const FIRST_DOLLAR_OWNER_EVIDENCE_REPAIR_ROOM_FORMAT = "proofresume-first-dollar-owner-evidence-repair-room-v1";
const FIRST_PAID_PILOT_FULFILLMENT_RECEIPT_PREVIEW_FORMAT = "proofresume-first-paid-pilot-fulfillment-receipt-preview-v1";
const FIRST_LIVE_PROOF_AUDIT_COPILOT_FORMAT = "proofresume-first-live-proof-audit-copilot-v1";
const LIVE_TO_PAID_PILOT_DECISION_ROOM_FORMAT = "proofresume-live-to-paid-pilot-decision-room-v1";
const LIVE_PROOF_TRUST_GAP_REPAIR_ROOM_FORMAT = "proofresume-live-proof-trust-gap-repair-room-v1";
const LIVE_PROOF_MISSING_PROOF_CUE_REPAIR_FORMAT = "proofresume-live-proof-missing-proof-cue-repair-v1";
const PAID_PILOT_TRUST_GAP_REPAIR_LAB_FORMAT = "proofresume-paid-pilot-trust-gap-repair-lab-v1";
const PROOF_DELTA_VALUE_SNAPSHOT_FORMAT = "proofresume-proof-delta-value-snapshot-v1";
const NORTHSTAR_DEMO_WALKTHROUGH_FORMAT = "proofresume-northstar-demo-walkthrough-v1";
const PROOF_AUDIT_PACKET_FORMAT = "proofresume-target-job-proof-audit-packet-v1";
const CONSENTED_AUDIT_HANDOFF_FORMAT = "proofresume-consented-audit-handoff-preview-v1";
const PAID_PACKET_CUSTOMER_PREVIEW_FORMAT = "proofresume-paid-packet-customer-preview-v1";
const FIRST_SESSION_REHEARSAL_FORMAT = "proofresume-first-feedback-session-rehearsal-evidence-v1";
const FEEDBACK_ROADMAP_STORAGE_KEY = "proofresume:feedbackRoadmapDrafts";
const FEEDBACK_ROADMAP_FORMAT = "proofresume-feedback-to-roadmap-loop-v1";
const FEEDBACK_ROADMAP_DRAFT_FORMAT = "proofresume-feedback-roadmap-queue-draft-v1";
const APPROVAL_CHECKLIST = Object.freeze([
  ["claims", "Claims reviewed against resume evidence"],
  ["resumeChanges", "Resume changes approved"],
  ["coverNote", "Cover note approved"],
  ["answers", "Application answers reviewed"],
  ["applyUrl", "Apply URL verified"],
  ["consent", "Candidate consent for this target job"],
]);
const TRACKABLE_APPLICATION_STATUSES = Object.freeze(["ready", "applied", "interviewing", "rejected", "accepted", "archived"]);
const APPLICATION_STATUS_OPTIONS = Object.freeze(["draft", ...TRACKABLE_APPLICATION_STATUSES]);
const ACTIVE_APPLICATION_STATUSES = Object.freeze(["ready", "applied", "interviewing", "accepted"]);
const APPLICATION_STATUS_LABELS = Object.freeze({
  draft: "Draft",
  ready: "Ready",
  applied: "Applied",
  interviewing: "Interviewing",
  rejected: "Rejected",
  accepted: "Accepted",
  archived: "Archived",
});
const PAID_PACKET_PREVIEW_CHOICES = Object.freeze({
  "approve-preview": {
    label: "Approve preview for no-send offer prep",
    route: "business_first_paid_packet_no_send_offer_prep",
    target: "business",
    detail: "Route to Business no-send offer prep. No checkout, payment link, queue mutation, or done claim.",
  },
  "edit-needed": {
    label: "Edit needed before any paid ask",
    route: "product_paid_packet_preview_clarity_repair",
    target: "product",
    detail: "Route to Product clarity repair. No downstream queue mutation, external action, or payment action.",
  },
  "not-now": {
    label: "Not now or no-fit",
    route: "no_action_wait_for_better_fit_or_owner_evidence",
    target: "no_action",
    detail: "Record local no-action state only. Wait for better fit or owner-approved evidence.",
  },
  "blocked-by-trust-support-customer-data": {
    label: "Blocked by trust, support, or customer-data questions",
    route: "approval_unblocker_paid_preview_trust_support_customer_data_repair",
    target: "approval_unblocker",
    detail: "Route to trust, support, refund, or customer-data repair. No customer data is collected here.",
  },
});
const JOURNEY_STEPS = Object.freeze([
  ["account", "Account", "Local sign-in restored", "Use the local demo identity or sign in locally."],
  ["resume", "Resume", "Resume imported", "Paste or import resume text into browser-local storage."],
  ["target", "Target", "Target preferences saved", "Save target roles, seniority, location, and constraints."],
  ["matches", "Matches", "Jobs ranked", "Paste or load local jobs and choose the strongest match."],
  ["packet", "Packet", "Tailored packet created", "Generate the Target Job Pack without sending or applying."],
  ["approval", "Approval", "Checklist ready", "Approve, request edits, or reject claims and packet sections locally."],
  ["tracking", "Tracking", "Status tracked", "Track ready, applied, interviewing, rejected, accepted, or archived status locally."],
  ["result", "Result receipt", "Proof-audit result visible", "Review the proof-backed result receipt and missing-proof questions."],
  ["paidPreview", "Paid preview", "No-checkout paid handoff visible", "Inspect the paid packet preview route without checkout or payment links."],
]);
const FIRST_SESSION_CUSTOMER_HANDOFF_BLOCKED_GATES = Object.freeze([
  ["customer_data_consent", "Customer-data consent", "Production resume/customer-data handling requires explicit consent, storage, deletion, support, and final owner approval."],
  ["payment_authority", "Payment authority", "Checkout, payment links, payment collection, and payment-intent claims stay blocked until payment-owner evidence passes."],
  ["support_refund_policy", "Support/refund posture", "Support contact, refund posture, tax/MoR owner, and fulfillment scope remain owner-gated."],
  ["public_proof", "Public proof", "Testimonials, referrals, public quotes, screenshots, and case-study claims require separate explicit permission."],
  ["outreach_scheduling", "Outreach/scheduling", "No outreach, booking, calendar, or follow-up send happens from the local handoff room."],
  ["deploy", "Deploy", "Production deploy and production URL health evidence remain separate owner-controlled gates."],
  ["analytics", "Analytics", "No analytics event or third-party tracking is sent from this local preview."],
  ["application_submission", "Application submission", "Auto-apply, form fill, employer contact, and application submission require candidate and target-job consent."],
]);
const OBJECTION_REPAIR_ROUTE_FAMILIES = Object.freeze([
  "product_repair",
  "business_no_send_follow_up",
  "approval_unblocker_owner_repair",
  "strategy_threshold_update",
  "qa_reviewer",
  "commons_follow_up",
  "keep_learning",
  "no_action",
]);
const FIRST_SESSION_OBJECTION_CASES = Object.freeze([
  {
    caseId: "comprehension",
    label: "Comprehension",
    safeCategory: "proof_loop_understood_but_needs_more_observation",
    expectedResult: "pass",
    routeFamily: "keep_learning",
    target: "controller",
    action: "keep_learning_until_stronger_first_session_signal",
    rationale: "Understanding the proof loop is useful but not enough to open product, business, or authority work.",
    ownerAsk: "Keep observing sample/redacted runs without claiming customer feedback.",
    validationRequired: ["sample_or_redacted_mode_confirmed", "no_customer_feedback_or_revenue_claim"],
    blockedGates: ["runtime_browser_evidence"],
  },
  {
    caseId: "missing_proof",
    label: "Missing proof",
    safeCategory: "proof_gap_blocks_safe_tailoring",
    expectedResult: "fail",
    routeFamily: "product_repair",
    target: "product",
    action: "product_first_session_missing_proof_repair",
    rationale: "The customer-visible loop needs clearer proof-gap capture before the packet can safely strengthen claims.",
    ownerAsk: "Add or sharpen local proof questions and missing-evidence prompts.",
    validationRequired: ["exactly_one_route_selected", "proof_gap_visible", "no_downstream_queue_mutation"],
    blockedGates: ["customer_data_authority", "candidate_and_target_job_consent_for_any_application"],
  },
  {
    caseId: "trust_privacy",
    label: "Trust/privacy",
    safeCategory: "privacy_consent_storage_boundary_unclear",
    expectedResult: "fail",
    routeFamily: "approval_unblocker_owner_repair",
    target: "approval_unblocker",
    action: "approval_unblocker_customer_data_privacy_repair",
    rationale: "Trust and privacy objections require authority, consent, retention, and deletion clarity before product or business motion.",
    ownerAsk: "Define customer-data authority, privacy copy, and deletion/retention proof.",
    validationRequired: ["customer_data_gate_named", "raw_customer_material_absent"],
    blockedGates: ["customer_data_authority"],
  },
  {
    caseId: "price_support",
    label: "Price/support",
    safeCategory: "price_support_refund_scope_unclear",
    expectedResult: "fail",
    routeFamily: "business_no_send_follow_up",
    target: "business",
    action: "business_no_send_support_refund_scope_repair",
    rationale: "The offer needs support, refund, delivery, and revision scope copy before a paid ask can be prepared.",
    ownerAsk: "Prepare no-send support/refund scope language without checkout or payment links.",
    validationRequired: ["no_checkout_or_payment_link", "support_refund_gate_visible"],
    blockedGates: ["support_refund_policy", "payment_authority"],
  },
  {
    caseId: "customer_data_stop",
    label: "Customer-data stop",
    safeCategory: "production_customer_data_authority_missing",
    expectedResult: "fail",
    routeFamily: "approval_unblocker_owner_repair",
    target: "approval_unblocker",
    action: "approval_unblocker_customer_data_authority_repair",
    rationale: "Production customer data cannot be processed until the authority, storage, retention, and consent contract is explicit.",
    ownerAsk: "Collect non-secret owner evidence for customer-data handling before live intake.",
    validationRequired: ["customer_data_stop_condition_named", "production_customer_data_absent"],
    blockedGates: ["customer_data_authority"],
  },
  {
    caseId: "payment_stop",
    label: "Payment stop",
    safeCategory: "payment_authority_or_checkout_boundary_missing",
    expectedResult: "fail",
    routeFamily: "approval_unblocker_owner_repair",
    target: "approval_unblocker",
    action: "approval_unblocker_payment_authority_repair",
    rationale: "Payment objections cannot be handled by product copy alone while checkout, provider, refund, and support authority are absent.",
    ownerAsk: "Name payment-provider authority and support/refund posture without displaying links.",
    validationRequired: ["payment_link_absent", "checkout_absent", "payment_claims_false"],
    blockedGates: ["payment_authority", "support_refund_policy"],
  },
  {
    caseId: "public_proof_stop",
    label: "Public-proof stop",
    safeCategory: "public_proof_or_testimonial_authority_missing",
    expectedResult: "fail",
    routeFamily: "approval_unblocker_owner_repair",
    target: "approval_unblocker",
    action: "approval_unblocker_public_proof_authority_repair",
    rationale: "Public proof, testimonials, referrals, and screenshots require separate explicit permission.",
    ownerAsk: "Define public-proof permission and redaction rules before any external claim.",
    validationRequired: ["public_proof_claims_false", "testimonial_referral_absent"],
    blockedGates: ["public_proof_authority"],
  },
  {
    caseId: "product_confusion",
    label: "Product confusion",
    safeCategory: "packet_mechanics_or_approval_path_unclear",
    expectedResult: "fail",
    routeFamily: "product_repair",
    target: "product",
    action: "product_first_session_packet_clarity_repair",
    rationale: "Confusion about the packet, approval, edit, reject, or tracking path belongs in the local product surface.",
    ownerAsk: "Clarify the customer-visible step, empty state, or call to action in the loop.",
    validationRequired: ["customer_path_visible", "approval_edit_reject_visible", "tracking_visible"],
    blockedGates: ["runtime_browser_evidence"],
  },
  {
    caseId: "no_fit",
    label: "No fit",
    safeCategory: "no_fit_or_low_value",
    expectedResult: "pass",
    routeFamily: "no_action",
    target: "controller",
    action: "no_queue_action_for_no_fit",
    rationale: "A no-fit sample/redacted outcome should not create work, traction claims, or business motion.",
    ownerAsk: "Record no-action state and wait for a better-fit sample or owner-approved session.",
    validationRequired: ["no_feedback_claim", "no_revenue_claim"],
    blockedGates: ["runtime_browser_evidence"],
  },
  {
    caseId: "no_action",
    label: "No action",
    safeCategory: "sample_only_duplicate_stale_or_revoked",
    expectedResult: "pass",
    routeFamily: "no_action",
    target: "controller",
    action: "no_queue_action",
    rationale: "Duplicate, stale, revoked, or sample-only notes should not move any queue.",
    ownerAsk: "Do nothing beyond retaining the safe category label.",
    validationRequired: ["sample_or_redacted_mode_confirmed", "no_downstream_queue_mutation"],
    blockedGates: ["runtime_browser_evidence"],
  },
]);
const SAMPLE_JOB = Object.freeze({
  title: "Customer Operations Analyst",
  company: "BrightLedger",
  location: "Remote",
  sourceUrl: "Example local job board note",
  effort: "medium",
  text: `Customer Operations Analyst
Company: BrightLedger
Location: Remote
Apply: Example local job board note

BrightLedger is hiring a customer operations analyst to improve onboarding workflows, build dashboard reporting, maintain CRM data quality, and partner with support and implementation teams. Helpful skills include SQL, Excel, automation, customer operations, reporting, and workflow design.`,
});

const DEMO_JOB_SEEDS = Object.freeze([
  {
    titleSuffix: "Workflow Analyst",
    company: "BrightLedger",
    effort: "low",
    focus: ["onboarding", "workflow", "dashboard", "sql", "reporting"],
    sourceLabel: "Demo preference seed",
  },
  {
    titleSuffix: "Implementation Specialist",
    company: "Northstar Health",
    effort: "medium",
    focus: ["implementation", "customer operations", "automation", "support", "crm"],
    sourceLabel: "Demo preference seed",
  },
  {
    titleSuffix: "Operations Systems Coordinator",
    company: "CivicStack",
    effort: "high",
    focus: ["excel", "salesforce", "analytics", "workflow", "stakeholder communication"],
    sourceLabel: "Demo preference seed",
  },
]);

const NORTHSTAR_DEMO_RESUME_TEXT = Object.freeze([
  "Maya Patel",
  "Customer Operations Analyst",
  "Remote | maya@example.local",
  "",
  "Summary",
  "Customer operations analyst with experience improving onboarding workflows, support analytics, dashboard reporting, and CRM data quality for SaaS teams.",
  "",
  "Experience",
  "Customer Operations Coordinator, PilotDesk",
  "- Built onboarding dashboards in SQL and Excel that reduced repeat support intake questions by 32%.",
  "- Improved support workflow documentation for 6 pilot accounts and partnered with implementation teams on launch checklists.",
  "- Maintained CRM data quality, weekly reporting, and customer handoff notes for sales, support, and operations leaders.",
  "",
  "Operations Associate, LedgerWorks",
  "- Automated recurring account review reports and tracked onboarding blockers across customer success and support.",
  "- Coordinated stakeholder communication for workflow changes, escalation notes, and post-launch customer feedback.",
  "",
  "Skills",
  "SQL, Excel, CRM data quality, onboarding, workflow automation, dashboard reporting, support analytics, stakeholder communication",
].join("\n"));

const NORTHSTAR_DEMO_TARGET_PREFERENCES = Object.freeze({
  targetRole: "Customer Operations Analyst",
  desiredRoles: "Customer Operations Analyst, Implementation Specialist, Operations Systems Coordinator",
  seniority: "mid",
  location: "Remote",
  workMode: "remote",
  industries: "SaaS, fintech, healthcare operations",
  mustHaveConstraints: "Remote only, no relocation, US time zones",
  niceToHaveKeywords: "SQL\nonboarding\nworkflow automation\nsupport analytics\ndashboard reporting\nCRM data quality",
});

const defaultUser = Object.freeze({
  id: "local-demo-user",
  email: "demo@example.local",
  name: "Local Demo User",
  roles: ["user"],
  provider: "local-demo",
  productionAuth: false,
  localOnly: true,
});

const providerPlan = Object.freeze({
  provider: "managed_auth_provider",
  loginMethods: ["email magic link", "google oauth", "apple oauth later"],
  externalCallsEnabled: false,
  routePolicy: "public pages remain open; /app workspace is authenticated-user only; local fallback allowed",
  controlIds: AUTH_CONTROL_IDS,
  requiredBeforeActivation: [
    "auth control",
    "customer_data control",
    "admin_access control",
    "external_auth_email control",
    "callback URLs",
    "deletion path",
    "retention policy",
    "support contact",
    "secrets outside repo",
  ],
});

function storage() {
  return window.localStorage;
}

function safeJsonParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readSession() {
  const session = safeJsonParse(storage().getItem(SESSION_KEY));
  if (!session || session.provider !== "local-demo" || session.productionAuth !== false || session.localOnly !== true) {
    return null;
  }
  return session;
}

function createLocalDemoIdentity() {
  return {
    signIn: signInLocal,
    signOut: signOutLocal,
    getSession() {
      const user = readSession();
      return {
        authenticated: Boolean(user),
        localOnly: true,
        user,
      };
    },
    requireUser() {
      const session = this.getSession();
      if (!session.authenticated) {
        throw new Error("Local demo user is not signed in.");
      }
      return session.user;
    },
    requireRole(role) {
      const user = this.requireUser();
      if (!user.roles.includes(role)) {
        throw new Error(`Local demo user is missing role: ${role}`);
      }
      return user;
    },
  };
}

function workspaceIdFor(user) {
  const source = `${user.email || user.id || "local-demo"}`.toLowerCase();
  const slug = source.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 34) || "local-demo";
  return `${WORKSPACE_ID_PREFIX}-${slug}`;
}

function readWorkspace() {
  return safeJsonParse(storage().getItem(WORKSPACE_KEY)) || null;
}

function writeWorkspace(workspace) {
  storage().setItem(WORKSPACE_KEY, JSON.stringify(workspace));
}

function emptyResumeState() {
  return {
    state: "not_imported",
    filename: "",
    importedAt: "",
    text: "",
    profileSummary: {
      headline: "",
      skills: [],
      recentRoles: [],
      seniority: "",
      source: "local-derived",
    },
    summary: {
      wordCount: 0,
      lineCount: 0,
      likelySections: [],
      likelyRoles: [],
      skillSignals: [],
    },
    nextAction: "Import a resume to start matching jobs and building proof-backed application packets.",
  };
}

function emptyTargetPreferences() {
  return {
    format: TARGET_PREFERENCES_FORMAT,
    targetRole: "",
    desiredRoles: [],
    seniority: "",
    location: "",
    workMode: "",
    industries: [],
    mustHaveConstraints: [],
    niceToHaveKeywords: [],
    updatedAt: "",
    localOnly: true,
    noExternalFetch: true,
    noLiveSourcing: true,
  };
}

function emptyPaidPacketPreviewState() {
  const defaultChoice = PAID_PACKET_PREVIEW_CHOICES["approve-preview"];
  return {
    format: PAID_PACKET_CUSTOMER_PREVIEW_FORMAT,
    state: "customer_facing_no_checkout_preview_ready",
    selectedChoiceId: "approve-preview",
    selectedRoute: defaultChoice.route,
    selectedTarget: defaultChoice.target,
    routeDetail: defaultChoice.detail,
    samplePriceUsd: 49,
    authorizedCapUsd: 99,
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: true,
    checkoutAllowed: false,
    paymentLinkAllowed: false,
    paymentCollectionAllowed: false,
    externalActionAllowed: false,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
    productionCustomerDataAllowed: false,
  };
}

function normalizePaidPacketPreviewState(value = {}) {
  const selectedChoiceId = PAID_PACKET_PREVIEW_CHOICES[value.selectedChoiceId] ? value.selectedChoiceId : "approve-preview";
  const choice = PAID_PACKET_PREVIEW_CHOICES[selectedChoiceId];
  return {
    ...emptyPaidPacketPreviewState(),
    ...value,
    format: PAID_PACKET_CUSTOMER_PREVIEW_FORMAT,
    selectedChoiceId,
    selectedRoute: choice.route,
    selectedTarget: choice.target,
    routeDetail: choice.detail,
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: true,
    checkoutAllowed: false,
    paymentLinkAllowed: false,
    paymentCollectionAllowed: false,
    externalActionAllowed: false,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
    productionCustomerDataAllowed: false,
  };
}

function emptyJobPipelineState() {
  return {
    format: "proofresume-local-job-pipeline-v1",
    updatedAt: "",
    jobs: [],
    selectedJobId: "",
    boundary: {
      localOnly: true,
      noExternalFetch: true,
      noScraping: true,
      noOutboundSend: true,
      noAutoApply: true,
    },
  };
}

function emptyApplicationTrackerState() {
  return {
    format: APPLICATION_TRACKER_FORMAT,
    updatedAt: "",
    applications: [],
    auditLog: [],
    providerSeams: {
      externalApplyEnabled: false,
      provider: "manual-export-or-approved-provider-later",
      allowedNow: ["create approval packet", "prepare dry-run apply plan", "export packet", "track manual outcome"],
      disabledUntilConsentAndControls: ["external form fill", "submit application", "send cover note", "upload resume to provider"],
      stopConditions: ["candidate consent missing", "target job not approved", "novel or sensitive application question", "MFA, CAPTCHA, account creation, or anti-bot challenge"],
    },
  };
}

function emptyFirstSessionFeedback() {
  return {
    testerSegment: "",
    proofLoopComprehension: "",
    trustInEvidence: "",
    objections: "",
    strongestObjection: "",
    confusionPoints: "",
    willingnessToPay: "",
    willingnessToShareMaterials: "",
    paidPacketInterest: "",
    requestedNextAction: "",
    updatedAt: "",
    localOnly: true,
    rehearsalOnly: true,
    realCustomerFeedbackObserved: false,
    revenueEvidenceObserved: false,
    noExternalSend: true,
    noScheduling: true,
    noAnalyticsSend: true,
    noPaymentLink: true,
    noProductionStorage: true,
    noAutoApply: true,
  };
}

function normalizeWorkspace(workspace, user) {
  const now = new Date().toISOString();
  const emptyResume = emptyResumeState();
  return {
    ...workspace,
    id: workspace.id || workspaceIdFor(user),
    userId: workspace.userId || user.id,
    email: workspace.email || user.email,
    createdAt: workspace.createdAt || now,
    updatedAt: workspace.updatedAt || now,
    profile: normalizeTargetPreferences(workspace.profile || {}),
    resume: {
      ...emptyResume,
      ...(workspace.resume || {}),
      profileSummary: {
        ...emptyResume.profileSummary,
        ...(workspace.resume?.profileSummary || workspace.resume?.summary?.profileSummary || {}),
      },
      summary: {
        ...emptyResume.summary,
        ...(workspace.resume?.summary || {}),
      },
    },
    jobPipeline: {
      ...emptyJobPipelineState(),
      ...(workspace.jobPipeline || {}),
      jobs: Array.isArray(workspace.jobPipeline?.jobs) ? workspace.jobPipeline.jobs : [],
    },
    applicationTracker: {
      ...emptyApplicationTrackerState(),
      ...(workspace.applicationTracker || {}),
      applications: Array.isArray(workspace.applicationTracker?.applications) ? workspace.applicationTracker.applications : [],
      auditLog: Array.isArray(workspace.applicationTracker?.auditLog) ? workspace.applicationTracker.auditLog : [],
      providerSeams: {
        ...emptyApplicationTrackerState().providerSeams,
        ...(workspace.applicationTracker?.providerSeams || {}),
      },
    },
    firstSessionFeedback: {
      ...emptyFirstSessionFeedback(),
      ...(workspace.firstSessionFeedback || {}),
      localOnly: true,
      noExternalSend: true,
      noAnalyticsSend: true,
      noProductionStorage: true,
      noAutoApply: true,
    },
    paidPacketPreview: normalizePaidPacketPreviewState(workspace.paidPacketPreview || {}),
    auth: {
      mode: "local-demo",
      localOnly: true,
      providerPlan,
      ...(workspace.auth || {}),
    },
  };
}

function ensureWorkspace(user) {
  const existing = readWorkspace();
  const id = workspaceIdFor(user);
  if (existing?.id === id) {
    const workspace = normalizeWorkspace(existing, user);
    if (JSON.stringify(workspace) !== JSON.stringify(existing)) {
      writeWorkspace(workspace);
    }
    return workspace;
  }

  const workspace = normalizeWorkspace({
    id,
    userId: user.id,
    email: user.email,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }, user);
  writeWorkspace(workspace);
  return workspace;
}

function signInLocal(formData) {
  const email = String(formData.get("email") || defaultUser.email).trim();
  const name = String(formData.get("name") || defaultUser.name).trim();
  const user = {
    ...defaultUser,
    id: workspaceIdFor({ email }).replace(`${WORKSPACE_ID_PREFIX}-`, "user-"),
    email,
    name,
    localOnly: true,
    signedInAt: new Date().toISOString(),
  };
  storage().setItem(SESSION_KEY, JSON.stringify(user));
  ensureWorkspace(user);
  return user;
}

function signOutLocal() {
  storage().removeItem(SESSION_KEY);
}

function signInNorthstarDemoIdentity() {
  const formData = new FormData();
  formData.set("email", "maya.demo@example.local");
  formData.set("name", "Maya Patel Demo");
  return signInLocal(formData);
}

function markNorthstarApplicationReady(application, now) {
  const checklist = Object.fromEntries(APPROVAL_CHECKLIST.map(([key]) => [key, true]));
  return {
    ...application,
    applyUrl: application.applyUrl || "Demo source: manual apply URL verified in walkthrough",
    status: "interviewing",
    outcome: "interview",
    checklist,
    notes: "Seeded walkthrough packet: approved, edited locally, and moved into tracking without any external submission.",
    editState: "edited",
    updatedAt: now,
    packet: {
      ...(application.packet || {}),
      coverNote: `${application.packet?.coverNote || ""} Demo edit: keep this note concise and verify every claim before manual use.`.trim(),
      editedAt: now,
      editSource: "northstar-demo-walkthrough-seed",
    },
    dryRunPlan: {
      ...(application.dryRunPlan || {}),
      format: "proofresume-local-application-dry-run-plan-v1",
      preparedAt: now,
      approvalReady: true,
      executionAllowed: false,
      externalAction: false,
      blockedReasons: [],
      boundary: {
        localOnly: true,
        noExternalFetch: true,
        noOutboundSend: true,
        noAutoApply: true,
        noUpload: true,
      },
    },
  };
}

function seedNorthstarDemoWalkthrough() {
  const user = signInNorthstarDemoIdentity();
  const now = new Date().toISOString();
  const workspace = normalizeWorkspace({
    id: workspaceIdFor(user),
    userId: user.id,
    email: user.email,
    createdAt: now,
    updatedAt: now,
  }, user);
  workspace.resume = importedResumeState({
    text: NORTHSTAR_DEMO_RESUME_TEXT,
    filename: "proofresume-demo-maya-patel-resume.txt",
  });
  workspace.resume.importedAt = now;
  workspace.profile = normalizeTargetPreferences({
    ...NORTHSTAR_DEMO_TARGET_PREFERENCES,
    updatedAt: now,
  });
  const demoJobs = demoJobsForWorkspace(workspace).map((job) => ({
    ...job,
    scoring: scoreJobForWorkspace(job, workspace.resume, workspace.profile),
  }));
  const selectedJob = demoJobs.slice().sort((a, b) => (b.scoring.readiness || 0) - (a.scoring.readiness || 0))[0];
  workspace.jobPipeline = {
    ...emptyJobPipelineState(),
    updatedAt: now,
    selectedJobId: selectedJob?.id || "",
    jobs: demoJobs,
  };
  const application = selectedJob ? markNorthstarApplicationReady(applicationPacketFromJob(selectedJob, workspace), now) : null;
  workspace.applicationTracker = {
    ...emptyApplicationTrackerState(),
    updatedAt: now,
    applications: application ? [application] : [],
    auditLog: application
      ? [
          {
            format: APPLICATION_AUDIT_FORMAT,
            id: slugId("audit", `northstar-seed\n${application.id}\n${now}`),
            applicationId: application.id,
            action: "northstar_demo_seeded",
            details: "Seeded account, resume, target preferences, matched jobs, tailored packet, approval/edit state, and tracking locally.",
            createdAt: now,
            localOnly: true,
            externalAction: false,
          },
          {
            format: APPLICATION_AUDIT_FORMAT,
            id: slugId("audit", `northstar-approved\n${application.id}\n${now}`),
            applicationId: application.id,
            action: "application_approved",
            details: "Demo packet approval checklist completed locally. No external action occurred.",
            createdAt: now,
            localOnly: true,
            externalAction: false,
          },
          {
            format: APPLICATION_AUDIT_FORMAT,
            id: slugId("audit", `northstar-tracking\n${application.id}\n${now}`),
            applicationId: application.id,
            action: "application_marked_interviewing",
            details: "Demo packet moved into local tracking to show approve, edit, reject, and outcome controls.",
            createdAt: now,
            localOnly: true,
            externalAction: false,
          },
        ]
      : [],
  };
  workspace.firstSessionFeedback = {
    ...emptyFirstSessionFeedback(),
    testerSegment: "Demo feedback session prospect",
    proofLoopComprehension: "partial",
    trustInEvidence: "needs-more-proof",
    objections: "Use this state to ask whether the proof gaps and do-not-invent warnings feel trustworthy.",
    strongestObjection: "Sample objection: I need to see exactly which resume line supports each rewritten bullet before I would trust it.",
    confusionPoints: "Watch whether the account to tracking loop is understandable without operator narration.",
    willingnessToPay: "maybe",
    willingnessToShareMaterials: "maybe",
    paidPacketInterest: "curious",
    requestedNextAction: "Share the local proof audit packet after candidate consent.",
    updatedAt: now,
  };
  workspace.demoWalkthrough = {
    format: NORTHSTAR_DEMO_WALKTHROUGH_FORMAT,
    seededAt: now,
    state: "seeded-complete-local-loop",
    localOnly: true,
    noExternalFetch: true,
    noOutboundSend: true,
    noAnalyticsSend: true,
    noProductionStorage: true,
    noAutoApply: true,
    resetAvailable: true,
    coveredSteps: JOURNEY_STEPS.map(([, title]) => title),
  };
  workspace.updatedAt = now;
  writeWorkspace(workspace);
  return workspace;
}

function resetNorthstarDemoWorkspace() {
  const user = readSession() || signInNorthstarDemoIdentity();
  const now = new Date().toISOString();
  const workspace = normalizeWorkspace({
    id: workspaceIdFor(user),
    userId: user.id,
    email: user.email,
    createdAt: now,
    updatedAt: now,
    demoWalkthrough: {
      format: NORTHSTAR_DEMO_WALKTHROUGH_FORMAT,
      resetAt: now,
      state: "blank-after-demo-reset",
      localOnly: true,
      noExternalFetch: true,
      noOutboundSend: true,
      noAnalyticsSend: true,
      noProductionStorage: true,
      noAutoApply: true,
    },
  }, user);
  writeWorkspace(workspace);
  return workspace;
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function formatDateTime(value) {
  if (!value) return "Not imported yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not imported yet";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function listFromText(value) {
  if (Array.isArray(value)) return unique(value.map((item) => String(item || "").trim()).filter(Boolean)).slice(0, 12);
  return unique(
    String(value || "")
      .split(/[,;\n]/g)
      .map((item) => item.trim())
      .filter(Boolean)
  ).slice(0, 12);
}

function textFromList(values) {
  return Array.isArray(values) ? values.join(", ") : "";
}

function normalizeTargetPreferences(profile = {}) {
  const base = emptyTargetPreferences();
  const targetRole = String(profile.targetRole || "").trim();
  const desiredRoles = unique([targetRole, ...listFromText(profile.desiredRoles || profile.targetRoles)]).filter(Boolean).slice(0, 12);
  return {
    ...base,
    ...profile,
    format: TARGET_PREFERENCES_FORMAT,
    targetRole,
    desiredRoles,
    seniority: String(profile.seniority || "").trim(),
    location: String(profile.location || "").trim(),
    workMode: String(profile.workMode || "").trim(),
    industries: listFromText(profile.industries),
    mustHaveConstraints: listFromText(profile.mustHaveConstraints),
    niceToHaveKeywords: listFromText(profile.niceToHaveKeywords),
    localOnly: true,
    noExternalFetch: true,
    noLiveSourcing: true,
  };
}

function slugId(prefix, source) {
  const text = String(source || "").toLowerCase();
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return `${prefix}_${hash.toString(16)}_${text.length.toString(16)}`;
}

function readLocalArray(key) {
  const parsed = safeJsonParse(storage().getItem(key));
  return Array.isArray(parsed) ? parsed : [];
}

function localJobText(job) {
  return [
    job.title || "",
    job.company ? `Company: ${job.company}` : "",
    job.location ? `Location: ${job.location}` : "",
    job.sourceLabel ? `Source: ${job.sourceLabel}` : "",
    job.sourceUrl ? `Apply: ${job.sourceUrl}` : "",
    job.text || "",
  ]
    .filter(Boolean)
    .join("\n");
}

function extractFirstLineMatch(text, pattern) {
  const match = String(text || "").match(pattern);
  return match ? String(match[1] || "").trim() : "";
}

function inferJobFields(text, fallback = {}) {
  const source = String(text || "").trim();
  const lines = source.split("\n").map((line) => line.trim()).filter(Boolean);
  const firstLine = lines.find((line) => !/^(company|location|apply|url|source)\s*:/i.test(line)) || "";
  return {
    title: String(fallback.title || firstLine || "Untitled role").trim(),
    company: String(fallback.company || extractFirstLineMatch(source, /\bcompany\s*:\s*([^\n]+)/i)).trim(),
    location: String(fallback.location || extractFirstLineMatch(source, /\b(?:location|based)\s*:\s*([^\n]+)/i) || (/\bremote\b/i.test(source) ? "Remote" : "")).trim(),
    sourceUrl: String(fallback.sourceUrl || extractFirstLineMatch(source, /\b(?:apply|url|source)\s*:\s*(https?:\/\/[^\s]+)/i)).trim(),
  };
}

function extractJobSkills(text) {
  const lower = String(text || "").toLowerCase();
  return unique(
    [
      "analytics",
      "automation",
      "crm",
      "customer operations",
      "dashboard",
      "excel",
      "figma",
      "hubspot",
      "implementation",
      "javascript",
      "onboarding",
      "operations",
      "python",
      "react",
      "reporting",
      "salesforce",
      "sql",
      "support",
      "typescript",
      "workflow",
    ].filter((skill) => lower.includes(skill))
  );
}

function splitJobBatch(text) {
  return String(text || "")
    .split(/\n\s*---\s*\n/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function scoreJobForWorkspace(job, resume, profile) {
  const resumeText = String(resume?.text || "");
  const resumeLower = resumeText.toLowerCase();
  const jobText = localJobText(job);
  const jobLower = jobText.toLowerCase();
  const resumeSkills = resume?.summary?.skillSignals || [];
  const jobSkills = extractJobSkills(jobText);
  const matchedSkills = jobSkills.filter((skill) => resumeLower.includes(skill.toLowerCase()));
  const missingSkills = jobSkills.filter((skill) => !resumeLower.includes(skill.toLowerCase()));
  const preferences = normalizeTargetPreferences(profile || {});
  const desiredRoleTokens = preferences.desiredRoles.flatMap((role) => String(role).toLowerCase().split(/\s+/)).filter((token) => token.length > 3);
  const niceKeywordTokens = preferences.niceToHaveKeywords.map((keyword) => keyword.toLowerCase());
  const industryTokens = preferences.industries.map((industry) => industry.toLowerCase());
  const mustHaveTokens = preferences.mustHaveConstraints.map((constraint) => constraint.toLowerCase());
  const roleMatch = preferences.desiredRoles.some((role) => {
    const roleLower = role.toLowerCase();
    return jobLower.includes(roleLower) || roleLower.split(/\s+/).some((token) => token.length > 3 && jobLower.includes(token));
  });
  const locationLower = preferences.location.toLowerCase();
  const workModeLower = preferences.workMode.toLowerCase();
  const locationMatch = Boolean(
    (locationLower && (jobLower.includes(locationLower) || (locationLower.includes("remote") && jobLower.includes("remote")))) ||
      (workModeLower && jobLower.includes(workModeLower))
  );
  const seniorityMatch = preferences.seniority
    ? jobLower.includes(preferences.seniority.toLowerCase()) || desiredRoleTokens.includes(preferences.seniority.toLowerCase())
    : false;
  const industryMatches = industryTokens.filter((token) => jobLower.includes(token));
  const keywordMatches = niceKeywordTokens.filter((token) => jobLower.includes(token) || resumeLower.includes(token));
  const mustHaveMatches = mustHaveTokens.filter((token) => {
    if (token.includes("remote")) return jobLower.includes("remote");
    if (token.includes("no relocation")) return !/\brelocat/i.test(jobLower);
    return jobLower.includes(token) || resumeLower.includes(token);
  });
  const mustHaveGaps = mustHaveTokens.filter((token) => !mustHaveMatches.includes(token));
  const proofGapCount = missingSkills.length + (resumeText.match(/\d+%|\$[\d,]+|\b\d+x\b|\b\d+\+/gi) ? 0 : 1);
  const effortPenalty = { low: 0, medium: 8, high: 16 }[job.effort] ?? 8;
  const skillScore = jobSkills.length ? Math.round((matchedSkills.length / jobSkills.length) * 52) : resumeSkills.length ? 22 : 12;
  const preferenceScore =
    (roleMatch ? 18 : preferences.desiredRoles.length ? 4 : 8) +
    (locationMatch ? 10 : preferences.location || preferences.workMode ? 2 : 7) +
    (seniorityMatch ? 5 : preferences.seniority ? 1 : 3) +
    Math.min(10, industryMatches.length * 4 + keywordMatches.length * 2) -
    mustHaveGaps.length * 7;
  const fitScore = Math.max(0, Math.min(100, skillScore + preferenceScore + 14 - effortPenalty));
  const readiness = Math.max(0, Math.min(100, fitScore - (proofGapCount + mustHaveGaps.length) * 9 + (resume?.state === "imported" ? 12 : -18)));
  return {
    fitScore,
    proofGapCount: proofGapCount + mustHaveGaps.length,
    effortScore: Math.max(0, 100 - effortPenalty * 4),
    readiness,
    matchedSkills,
    missingSkills,
    preferenceMatches: unique([
      ...(roleMatch ? ["target role"] : []),
      ...(locationMatch ? ["location/work mode"] : []),
      ...(seniorityMatch ? ["seniority"] : []),
      ...industryMatches.map((industry) => `industry: ${industry}`),
      ...keywordMatches.map((keyword) => `keyword: ${keyword}`),
      ...mustHaveMatches.map((constraint) => `must-have: ${constraint}`),
    ]),
    preferenceGaps: mustHaveGaps.map((constraint) => `Must-have constraint needs review: ${constraint}`),
    scoreDrivers: [
      `Resume skills matched: ${matchedSkills.length}/${jobSkills.length || 0}`,
      roleMatch ? "Target role preference matched" : "Target role needs review",
      locationMatch ? "Location or work mode matched" : "Location or work mode needs review",
      keywordMatches.length ? `Nice-to-have signals: ${keywordMatches.slice(0, 3).join(", ")}` : "No nice-to-have keyword signal found",
      mustHaveGaps.length ? `Must-have gaps: ${mustHaveGaps.slice(0, 2).join(", ")}` : "Must-have constraints look compatible locally",
      job.sourceLabel ? `Source context: ${job.sourceLabel}` : "Source context: manual local paste",
    ],
    reason: resume?.state === "imported"
      ? `${matchedSkills.length}/${jobSkills.length || 0} tracked job skills matched; ${roleMatch ? "target role aligned" : "target role weak"}; ${locationMatch ? "location/work mode aligned" : "location preference needs review"}; ${proofGapCount + mustHaveGaps.length} proof or preference gap${proofGapCount + mustHaveGaps.length === 1 ? "" : "s"} before tailoring.`
      : "Import a resume first to calculate a useful match.",
  };
}

function demoJobsForWorkspace(workspace) {
  const preferences = normalizeTargetPreferences(workspace?.profile || {});
  const resume = workspace?.resume || emptyResumeState();
  const role = preferences.desiredRoles[0] || preferences.targetRole || "Target Role";
  const location = preferences.location || (preferences.workMode === "remote" ? "Remote" : "Hybrid");
  const industries = preferences.industries.length ? preferences.industries.join(", ") : "role-adjacent";
  const mustHaves = preferences.mustHaveConstraints.length ? preferences.mustHaveConstraints.join(", ") : "candidate constraints";
  const keywords = unique([
    ...preferences.niceToHaveKeywords,
    ...(resume.profileSummary?.skills || []),
    ...(resume.summary?.skillSignals || []),
  ]).slice(0, 6);
  const keywordText = keywords.length ? keywords.join(", ") : "evidence-backed work, collaboration, and measurable outcomes";
  const now = new Date().toISOString();
  return DEMO_JOB_SEEDS.map((seed, index) => {
    const title = `${role} ${seed.titleSuffix}`.replace(/\s+/g, " ").trim();
    const text = `${title}
Company: ${seed.company}
Location: ${location}
Source: Demo preference seed ${index + 1}

This browser-local demo role is generated from saved ProofResume preferences for ${role}, ${location}, ${industries}, and ${mustHaves}. The role emphasizes ${unique([...seed.focus, ...keywords]).slice(0, 8).join(", ")}. Use it to test ranking, proof gaps, packet creation, approval, and tracking without fetching live jobs.`;
    return {
      format: "proofresume-local-job-v1",
      id: slugId("job", `demo\n${title}\n${seed.company}\n${location}\n${keywordText}`),
      createdAt: now,
      updatedAt: now,
      title,
      company: seed.company,
      location,
      sourceUrl: `Demo source: ${seed.sourceLabel}`,
      sourceLabel: seed.sourceLabel,
      sourceKind: "demo-preference-seed",
      demoGenerated: true,
      effort: seed.effort,
      text,
      localOnly: true,
      noExternalFetch: true,
      noLiveSourcing: true,
      noScraping: true,
      noOutboundSend: true,
      noAutoApply: true,
    };
  });
}

function profileReady(profile) {
  const preferences = normalizeTargetPreferences(profile || {});
  return Boolean((preferences.targetRole || preferences.desiredRoles.length) && (preferences.location || preferences.workMode));
}

function firstApplication(workspace) {
  const applications = workspace?.applicationTracker?.applications || [];
  return applications.slice().sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))[0] || null;
}

function workspaceNextAction(workspace) {
  if (!workspace) return "Sign in locally to unlock the protected workspace route.";
  if (workspace.resume?.state !== "imported") return "Import or paste a resume; that is the first product step.";
  if (!profileReady(workspace.profile)) return "Save target roles, seniority, location, and constraints before ranking matches.";
  if (!(workspace.jobPipeline?.jobs || []).length) return "Paste one or more local job posts to rank matches.";
  if (!firstApplication(workspace)) return "Create a tailored application packet from the strongest matched job.";
  const application = firstApplication(workspace);
  if (!applicationApprovalReady(application)) return "Review the packet and complete the approval checklist.";
  if (!applicationTrackingReady(application)) return "Mark the approved packet ready, applied, interviewing, rejected, accepted, or archived.";
  return "Track the application status locally or export the approved packet.";
}

function nextJourneyAction(workspace, session) {
  if (!session) return { href: "#/signin", label: "Sign in locally" };
  if (workspace?.resume?.state !== "imported") return { href: "#resume-import", label: "Import resume" };
  if (!profileReady(workspace.profile)) return { href: "#target-preferences", label: "Save preferences" };
  if (!(workspace.jobPipeline?.jobs || []).length) return { href: "#job-pipeline", label: "Add or load a job" };
  if (!firstApplication(workspace)) return { href: "#job-pipeline", label: "Create application packet" };
  if (!applicationApprovalReady(firstApplication(workspace))) return { href: "#application-tracker", label: "Review approval checklist" };
  if (!applicationTrackingReady(firstApplication(workspace))) return { href: "#application-tracker", label: "Mark status" };
  return { href: "#application-tracker", label: "Track application" };
}

function journeyState(workspace, session) {
  const application = firstApplication(workspace);
  const accountReady = Boolean(session);
  const resumeReady = workspace?.resume?.state === "imported";
  const targetReady = profileReady(workspace?.profile);
  const matchReady = Boolean((workspace?.jobPipeline?.jobs || []).length);
  const packetReady = Boolean(application);
  const approvalReady = applicationApprovalReady(application);
  const trackingReady = applicationTrackingReady(application);
  const resultReady = Boolean(trackingReady && application?.packet);
  const paidPreviewReady = Boolean(resultReady && workspace?.demoWalkthrough?.localOnly === true);
  return {
    account: accountReady,
    resume: resumeReady,
    target: targetReady,
    matches: matchReady,
    packet: packetReady,
    approval: approvalReady,
    tracking: trackingReady,
    result: resultReady,
    paidPreview: paidPreviewReady,
  };
}

function rankWorkspaceJobs(workspace) {
  const jobs = Array.isArray(workspace?.jobPipeline?.jobs) ? workspace.jobPipeline.jobs : [];
  return jobs
    .map((job) => ({
      ...job,
      scoring: scoreJobForWorkspace(job, workspace?.resume, workspace?.profile),
    }))
    .sort((a, b) => (b.scoring.readiness || 0) - (a.scoring.readiness || 0));
}

function targetProfileFromWorkspace(workspace) {
  const resume = workspace?.resume || emptyResumeState();
  const profile = normalizeTargetPreferences(workspace?.profile || {});
  return {
    format: TARGET_JOB_PROFILE_FORMAT,
    savedAt: new Date().toISOString(),
    resumeText: resume.state === "imported" ? resume.text || "" : "",
    structuredProfile: {
      identity: {
        name: "",
        headline: resume.profileSummary?.headline || profile.targetRole || "",
        email: workspace?.email || "",
        phone: "",
        location: profile.location || "",
        summary: resume.profileSummary?.headline || "",
      },
      links: [],
      skills: resume.profileSummary?.skills || resume.summary?.skillSignals || [],
      experience: resume.summary?.likelyRoles || [],
      projects: [],
      education: [],
      certifications: [],
      achievements: [],
    },
    candidateLevel: profile.seniority || (resume.profileSummary?.seniority === "senior" || resume.profileSummary?.seniority === "lead" ? "senior" : "mid"),
    preferredLocation: profile.location || "",
    targetPreferences: profile,
    sourceExportBundle: null,
    inputNormalization: { resume: { source: "proofresume-local-workspace", localOnly: true } },
    localOnly: true,
    noExternalFetch: true,
    noOutboundSend: true,
    noAutoApply: true,
  };
}

function targetLeadFromJob(job) {
  const text = localJobText(job);
  const skills = extractJobSkills(text);
  const sourceUrl = /^https?:\/\//i.test(String(job.sourceUrl || "")) ? job.sourceUrl : "";
  const id = slugId("lead", `${job.sourceUrl || ""}\n${job.title}\n${job.company}\n${text.slice(0, 280)}`);
  const now = new Date().toISOString();
  return {
    format: TARGET_JOB_LEAD_FORMAT,
    id,
    createdAt: job.createdAt || now,
    updatedAt: now,
    sourceLabel: job.sourceLabel || "ProofResume local workspace",
    status: job.scoring?.readiness >= 75 ? "ready" : "evaluating",
    favorite: false,
    feedback: "none",
    feedbackNote: "Imported from the local-first workspace pipeline.",
    lastPackId: "",
    followUpDue: "",
    lastContacted: "",
    jobText: text,
    jobTextNormalized: text,
    inputNormalization: { job: { source: "proofresume-local-workspace", localOnly: true } },
    sourceMetadata: {
      format: "proofresume-source-adapter-import-v1",
      sourceLabel: job.sourceLabel || "ProofResume local workspace",
      adapter: job.sourceKind === "demo-preference-seed" ? "demo-preference-seed" : "generic-paste",
      adapterLabel: job.sourceKind === "demo-preference-seed" ? "Demo preference seed" : "Generic paste",
      platform: job.sourceKind === "demo-preference-seed" ? "Browser-local demo pipeline" : "Manual workspace import",
      allowedForLocalImport: true,
      termsRiskLevel: "low",
      termsRiskNotes: ["Browser-local job record. No fetch, scrape, credential, send, or apply action occurred."],
      localOnly: true,
      noExternalFetch: true,
    },
    jobIntel: {
      title: job.title,
      company: job.company,
      url: sourceUrl,
      location: job.location,
      salary: "",
      platform: job.sourceKind === "demo-preference-seed" ? "Browser-local demo pipeline" : "Manual workspace import",
      skills,
      stack: skills,
      requirements: [],
      responsibilities: String(job.text || "").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 6),
      description: text,
      wordCount: (text.match(/[A-Za-z0-9+#.-]+/g) || []).length,
      redFlags: [],
    },
    leadQuality: {
      score: job.sourceUrl && job.company ? 82 : 68,
      accepted: Boolean(job.company || job.title),
      reason: job.sourceKind === "demo-preference-seed"
        ? "Demo job was generated locally from saved preferences."
        : job.sourceUrl
          ? "Local manual job has source context."
          : "Local manual job is usable; verify source URL before applying.",
      tags: job.sourceKind === "demo-preference-seed" ? ["demo-preference-seed", "local-only"] : ["manual-local-import"],
    },
    latestFit: job.scoring
      ? {
          score: job.scoring.fitScore,
          reason: job.scoring.reason,
          matchPoints: job.scoring.matchedSkills,
          preferenceMatches: job.scoring.preferenceMatches || [],
          missingProofGroups: [
            ...job.scoring.missingSkills.map((skill) => ({ label: skill, items: [`Add truthful proof for ${skill}.`] })),
            ...(job.scoring.preferenceGaps || []).map((gap) => ({ label: "Preference gap", items: [gap] })),
          ],
        }
      : null,
    localOnly: true,
    noExternalFetch: true,
    noAutoApply: true,
    noOutboundSend: true,
  };
}

function deriveResumeSummary(text) {
  const normalized = String(text || "").replace(/\r\n?/g, "\n").trim();
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const words = normalized.match(/[A-Za-z0-9+#.-]+/g) || [];
  const lower = normalized.toLowerCase();
  const sectionCandidates = [
    "experience",
    "work experience",
    "projects",
    "skills",
    "education",
    "certifications",
    "summary",
    "achievements",
  ];
  const likelySections = sectionCandidates.filter((section) => lower.includes(section));
  const roleSignals = lines
    .filter((line) => /\b(engineer|manager|analyst|designer|developer|operator|lead|specialist|coordinator|consultant)\b/i.test(line))
    .slice(0, 4);
  const seniorityMatch = normalized.match(/\b(intern|junior|associate|senior|lead|principal|staff|manager|director|head)\b/i);
  const skillSignals = unique(
    ["javascript", "typescript", "react", "python", "sql", "excel", "salesforce", "figma", "aws", "analytics", "operations"]
      .filter((skill) => lower.includes(skill))
      .map((skill) => skill.replace(/\b\w/g, (letter) => letter.toUpperCase()))
  ).slice(0, 8);
  const profileSummary = {
    headline: roleSignals[0] || lines[0] || "Resume imported locally",
    skills: skillSignals,
    recentRoles: roleSignals,
    seniority: seniorityMatch ? seniorityMatch[0].toLowerCase() : "",
    source: "local-derived",
  };

  return {
    wordCount: words.length,
    lineCount: lines.length,
    likelySections: unique(likelySections).slice(0, 8),
    likelyRoles: roleSignals,
    skillSignals,
    profileSummary,
  };
}

function importedResumeState({ text, filename }) {
  const trimmedText = String(text || "").trim();
  const summary = deriveResumeSummary(trimmedText);
  return {
    state: "imported",
    filename: String(filename || "Pasted resume text").trim() || "Pasted resume text",
    importedAt: new Date().toISOString(),
    text: trimmedText,
    profileSummary: summary.profileSummary,
    summary,
    nextAction:
      summary.wordCount < 80
        ? "Add more resume detail before matching jobs; this import looks short."
        : "Save target preferences, then add or select a target job to build an application packet.",
  };
}

function resumeSummaryItems(resume) {
  const summary = resume?.summary || emptyResumeState().summary;
  if (resume?.state !== "imported") {
    return ["Import a resume to derive a local profile summary."];
  }
  const sections = summary.likelySections?.length
    ? summary.likelySections.join(", ")
    : "No standard sections detected yet";
  const roles = summary.likelyRoles?.length
    ? summary.likelyRoles.slice(0, 2).join(" | ")
    : "No role headline detected yet";
  const skills = summary.skillSignals?.length ? summary.skillSignals.join(", ") : "No tracked skill signals detected yet";
  const headline = resume.profileSummary?.headline || summary.profileSummary?.headline || "";
  return [
    `${summary.wordCount || 0} words across ${summary.lineCount || 0} non-empty lines`,
    `Profile summary: ${headline || "No local headline derived yet"}`,
    `Sections: ${sections}`,
    `Role signals: ${roles}`,
    `Skill signals: ${skills}`,
  ];
}

function targetPreferenceSummaryItems(profile) {
  const preferences = normalizeTargetPreferences(profile || {});
  if (!profileReady(preferences)) {
    return ["Save desired roles plus location or work mode before matching jobs."];
  }
  return [
    `Roles: ${preferences.desiredRoles.join(", ") || preferences.targetRole}`,
    `Seniority: ${preferences.seniority || "Any"} | Work mode: ${preferences.workMode || "Any"} | Location: ${preferences.location || "Any"}`,
    `Industries: ${preferences.industries.join(", ") || "Any"}`,
    `Must-haves: ${preferences.mustHaveConstraints.join(", ") || "None saved"}`,
    `Nice-to-haves: ${preferences.niceToHaveKeywords.join(", ") || "None saved"}`,
  ];
}

function renderList(selector, items) {
  const element = document.querySelector(selector);
  if (!element) return;
  element.innerHTML = "";
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    element.appendChild(li);
  });
}

function renderJourney(workspace, session) {
  const list = document.querySelector("[data-journey-steps]");
  if (!list) return;
  const states = journeyState(workspace, session);
  const completed = JOURNEY_STEPS.filter(([key]) => states[key]).length;
  setText("[data-journey-progress]", `${completed} of ${JOURNEY_STEPS.length} ready`);
  setText("[data-journey-next]", workspaceNextAction(workspace));
  const nextLink = document.querySelector("[data-next-step-link]");
  if (nextLink) {
    const nextAction = nextJourneyAction(workspace, session);
    nextLink.setAttribute("href", nextAction.href);
    nextLink.textContent = nextAction.label;
  }
  const firstIncomplete = JOURNEY_STEPS.find(([key]) => !states[key])?.[0] || "paidPreview";
  list.innerHTML = "";
  JOURNEY_STEPS.forEach(([key, title, description, customerNextAction]) => {
    const item = document.createElement("li");
    item.className = "journey-step";
    item.dataset.state = states[key] ? "done" : key === firstIncomplete ? "current" : "pending";
    const status = states[key] ? "Ready" : key === firstIncomplete ? "Next" : "Later";
    item.innerHTML = `
      <span>${escapeHtml(status)}</span>
      <strong>${escapeHtml(title)}</strong>
      <p class="muted">${escapeHtml(description)}</p>
      <p class="muted">Next: ${escapeHtml(customerNextAction)}</p>
    `;
    list.appendChild(item);
  });
}

function renderPaidPacketPreview(workspace) {
  const state = normalizePaidPacketPreviewState(workspace?.paidPacketPreview || {});
  const choice = PAID_PACKET_PREVIEW_CHOICES[state.selectedChoiceId] || PAID_PACKET_PREVIEW_CHOICES["approve-preview"];
  const selected = document.querySelector(`input[name="paidPacketPreviewChoice"][value="${state.selectedChoiceId}"]`);
  if (selected) selected.checked = true;
  setText("[data-paid-packet-preview-state]", "No checkout");
  setText("[data-paid-packet-safe-route]", choice.route);
  setText("[data-paid-packet-route-detail]", choice.detail);
  setText(
    "[data-paid-packet-preview-message]",
    `${choice.label} saved locally as ${choice.target}. No payment, provider mutation, customer-data upload, downstream queue mutation, or external action occurred.`
  );
}

function renderResume(workspace) {
  const resume = workspace?.resume || emptyResumeState();
  const imported = resume.state === "imported";
  setText("[data-resume-state]", imported ? "Resume imported locally" : "No resume imported");
  setText("[data-resume-imported]", formatDateTime(resume.importedAt));
  setText("[data-resume-filename]", imported ? resume.filename || "Pasted resume text" : "Paste or upload text");
  setText("[data-resume-preview]", imported ? String(resume.text || "").slice(0, 900) : "Nothing stored yet.");
  renderList("[data-resume-summary]", resumeSummaryItems(resume));
  renderList("[data-preference-summary]", targetPreferenceSummaryItems(workspace?.profile));

  const form = document.querySelector("[data-resume-form]");
  if (form && workspace) {
    form.elements.resumeText.value = imported ? resume.text || "" : "";
  }
  setText("[data-save-resume]", imported ? "Replace resume locally" : "Save resume locally");
}

function scoreLabel(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}/100` : "--";
}

function appendMetric(container, label, value) {
  const item = document.createElement("div");
  const labelNode = document.createElement("span");
  const valueNode = document.createElement("strong");
  labelNode.textContent = label;
  valueNode.textContent = value;
  item.append(labelNode, valueNode);
  container.appendChild(item);
}

function renderJobPipeline(workspace) {
  const list = document.querySelector("[data-job-list]");
  if (!list) return;
  const jobs = workspace ? rankWorkspaceJobs(workspace) : [];
  setText("[data-job-pipeline-count]", `${jobs.length} local job${jobs.length === 1 ? "" : "s"}`);
  list.innerHTML = "";

  if (!workspace) {
    const empty = document.createElement("p");
    empty.className = "job-empty muted";
    empty.textContent = "Sign in locally before importing jobs.";
    list.appendChild(empty);
    return;
  }

  if (!jobs.length) {
    const empty = document.createElement("p");
    empty.className = "job-empty muted";
    empty.textContent = workspace.resume?.state === "imported" && profileReady(workspace.profile)
      ? "Load the demo matched pipeline or paste local job posts to rank against the uploaded resume and saved preferences."
      : workspace.resume?.state === "imported"
        ? "Save target preferences, then load demo matches or paste local job posts."
        : "Import a resume first, then save preferences and rank demo or manual jobs.";
    list.appendChild(empty);
    return;
  }

  jobs.forEach((job, index) => {
    const card = document.createElement("article");
    card.className = "job-card";
    card.dataset.jobId = job.id;

    const head = document.createElement("div");
    head.className = "job-card-head";
    const titleBlock = document.createElement("div");
    const title = document.createElement("h4");
    title.textContent = `${index + 1}. ${job.title || "Untitled role"}`;
    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = [job.company, job.location, job.sourceLabel || "Manual/local import", job.sourceUrl ? "source noted" : "source URL missing"].filter(Boolean).join(" | ");
    titleBlock.append(title, meta);
    const badge = document.createElement("span");
    badge.className = "status-pill";
    badge.textContent = job.scoring?.readiness >= 75 ? "ready" : job.scoring?.fitScore >= 60 ? "evaluate" : "proof gaps";
    head.append(titleBlock, badge);

    const metrics = document.createElement("div");
    metrics.className = "job-score-grid";
    appendMetric(metrics, "Fit", scoreLabel(job.scoring?.fitScore));
    appendMetric(metrics, "Proof gaps", String(job.scoring?.proofGapCount ?? "--"));
    appendMetric(metrics, "Effort", scoreLabel(job.scoring?.effortScore));
    appendMetric(metrics, "Readiness", scoreLabel(job.scoring?.readiness));

    const reason = document.createElement("p");
    reason.className = "muted";
    reason.textContent = job.scoring?.reason || "No score yet.";

    const preferenceLabel = document.createElement("p");
    preferenceLabel.className = "muted";
    const matches = job.scoring?.preferenceMatches || [];
    preferenceLabel.textContent = matches.length
      ? `Preference labels: ${matches.slice(0, 5).join(", ")}.`
      : "Preference labels: no saved preference match yet.";

    const scoreDrivers = document.createElement("ul");
    scoreDrivers.className = "resume-summary-list";
    fallbackList(
      (job.scoring?.scoreDrivers || []).slice(0, 6),
      "Score uses imported resume text, saved preferences, local job text, and effort estimate."
    ).forEach((driver) => {
      const item = document.createElement("li");
      item.textContent = driver;
      scoreDrivers.appendChild(item);
    });

    const actions = document.createElement("div");
    actions.className = "app-actions";
    const createApplication = document.createElement("button");
    createApplication.type = "button";
    createApplication.textContent = "Create application packet";
    createApplication.dataset.createApplication = job.id;
    const select = document.createElement("button");
    select.type = "button";
    select.className = "secondary";
    select.textContent = "Open in Target Job Pack";
    select.dataset.selectJob = job.id;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "secondary";
    remove.textContent = "Remove";
    remove.dataset.removeJob = job.id;
    actions.append(createApplication, select, remove);

    card.append(head, metrics, reason, preferenceLabel, scoreDrivers, actions);
    list.appendChild(card);
  });
}

function tailoredPacketHandoff(application) {
  return {
    format: TAILORED_PACKET_HANDOFF_FORMAT,
    applicationId: application.id,
    packetGeneratedAt: application.packet?.generatedAt || application.updatedAt || "",
    resumeBulletSuggestions: application.packet?.resumeBulletSuggestions || [],
    resumeChanges: application.packet?.resumeChanges || [],
    coverNote: application.packet?.coverNote || "",
    answers: application.packet?.answers || [],
    proofGaps: application.packet?.proofGaps || [],
    doNotInventBoundaries: application.packet?.doNotInventBoundaries || [],
    targetPreferences: application.packet?.targetPreferences || {},
    localOnly: true,
    noExternalFetch: true,
    noOutboundSend: true,
    noAutoApply: true,
  };
}

function sendJobToTargetPack(workspace, jobId, application = null) {
  const jobs = rankWorkspaceJobs(workspace);
  const job = jobs.find((item) => item.id === jobId);
  if (!job) return null;
  const profile = targetProfileFromWorkspace(workspace);
  storage().setItem(TARGET_JOB_PROFILE_KEY, JSON.stringify(profile));
  const lead = targetLeadFromJob(job);
  const currentLeads = readLocalArray(TARGET_JOB_LEADS_KEY);
  const nextLeads = [lead, ...currentLeads.filter((item) => item?.id !== lead.id)].slice(0, 200);
  storage().setItem(TARGET_JOB_LEADS_KEY, JSON.stringify(nextLeads));
  storage().setItem(
    TARGET_JOB_SELECTED_KEY,
    JSON.stringify({
      format: "proofresume-workspace-selected-job-v1",
      selectedAt: new Date().toISOString(),
      jobId: job.id,
      title: job.title,
      company: job.company,
      jobText: localJobText(job),
      resumeText: profile.resumeText,
      preferredLocation: profile.preferredLocation,
      candidateLevel: profile.candidateLevel,
      profileHeadline: profile.structuredProfile?.identity?.headline || "",
      skills: profile.structuredProfile?.skills || [],
      tailoredPacketContext: application ? tailoredPacketHandoff(application) : null,
      localOnly: true,
      noExternalFetch: true,
      noOutboundSend: true,
      noAutoApply: true,
    })
  );
  workspace.jobPipeline = {
    ...emptyJobPipelineState(),
    ...(workspace.jobPipeline || {}),
    selectedJobId: job.id,
    updatedAt: new Date().toISOString(),
  };
  workspace.updatedAt = new Date().toISOString();
  writeWorkspace(workspace);
  return lead;
}

function emptyApprovalChecklist(job = {}) {
  return {
    claims: false,
    resumeChanges: false,
    coverNote: false,
    answers: false,
    applyUrl: Boolean(job.sourceUrl),
    consent: false,
  };
}

function fallbackList(items, fallback) {
  const values = (items || []).filter(Boolean);
  return values.length ? values : [fallback];
}

function strongestResumeEvidenceLines(resume, matchedSkills) {
  const lines = String(resume?.text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 18 && line.length < 180);
  const scored = lines
    .map((line) => ({
      line,
      score: matchedSkills.filter((skill) => includesTerm(line, skill)).length + (/\d|%|\$|reduced|improved|built|led|launched|managed/i.test(line) ? 1 : 0),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.line);
  return unique(scored).slice(0, 4);
}

function resumeBulletSuggestions(job, workspace, scoring) {
  const resume = workspace?.resume || emptyResumeState();
  const profile = normalizeTargetPreferences(workspace?.profile || {});
  const matchedSkills = scoring?.matchedSkills || [];
  const missingSkills = scoring?.missingSkills || [];
  const evidenceLines = strongestResumeEvidenceLines(resume, matchedSkills);
  const target = profile.targetRole || job.title || "the selected role";
  const suggestions = evidenceLines.map((line) => `Tailor an existing bullet toward ${target}: ${line}`);
  if (matchedSkills.length) suggestions.push(`Lead with verified overlap: ${matchedSkills.slice(0, 4).join(", ")}.`);
  if (missingSkills.length) suggestions.push(`Do not claim ${missingSkills.slice(0, 3).join(", ")} until the resume contains concrete proof.`);
  return fallbackList(
    unique(suggestions).slice(0, 5),
    "Use the imported resume as the source of truth; add a tailored bullet only after verifying supporting evidence."
  );
}

function applicationPacketContent(job, workspace, scoring) {
  const resume = workspace?.resume || emptyResumeState();
  const profile = normalizeTargetPreferences(workspace?.profile || {});
  const matchedSkills = scoring?.matchedSkills || [];
  const missingSkills = scoring?.missingSkills || [];
  const target = profile.targetRole || job.title || "this target role";
  const company = job.company || "the employer";
  const bulletSuggestions = resumeBulletSuggestions(job, workspace, scoring);
  return {
    format: TAILORED_PACKET_GENERATOR_FORMAT,
    generatedAt: new Date().toISOString(),
    generator: "deterministic-browser-local",
    sourceInputs: {
      resumeFilename: resume.filename || "Pasted resume text",
      targetRole: profile.targetRole || "",
      desiredRoles: profile.desiredRoles || [],
      selectedJobId: job.id || "",
      selectedJobTitle: job.title || "",
      selectedCompany: job.company || "",
      fitScore: scoring?.fitScore ?? null,
      readiness: scoring?.readiness ?? null,
    },
    resumeBulletSuggestions: bulletSuggestions,
    claims: fallbackList(
      matchedSkills.slice(0, 4).map((skill) => `Use existing resume evidence for ${skill}; do not add new claims without proof.`),
      `Use only claims already supported by ${resume.filename || "the imported resume"}.`
    ),
    resumeChanges: fallbackList(
      [
        ...bulletSuggestions.slice(0, 3),
        matchedSkills.length ? `Move ${matchedSkills.slice(0, 3).join(", ")} higher in the tailored summary.` : "",
        missingSkills.length ? `Add truthful proof for ${missingSkills.slice(0, 3).join(", ")} before claiming those requirements.` : "",
        profile.targetRole ? `Frame the summary around ${profile.targetRole}.` : "",
        profile.niceToHaveKeywords.length ? `Use existing evidence for ${profile.niceToHaveKeywords.slice(0, 3).join(", ")} only where the resume already supports it.` : "",
      ],
      "Keep the resume changes evidence-backed and tied to the selected job."
    ),
    coverNote: `I am interested in ${job.title || target}${company ? ` at ${company}` : ""} because my background aligns with ${matchedSkills.slice(0, 3).join(", ") || "the role requirements"}. I would keep the final note evidence-backed and avoid unsupported claims.`,
    answers: fallbackList(
      [
        `Why this role: connect ${target} to the strongest resume evidence.`,
        `Proof gap: prepare a truthful example for ${missingSkills[0] || "the highest-risk requirement"}.`,
        `Location: confirm ${profile.location || job.location || "the preferred work arrangement"} before applying.`,
        profile.mustHaveConstraints.length ? `Constraints: verify ${profile.mustHaveConstraints.slice(0, 2).join(" and ")} before approval.` : "",
      ],
      "Draft answers locally, then verify each one before candidate approval."
    ),
    proofGaps: fallbackList(
      [
        ...missingSkills.map((skill) => `Missing or weak proof for ${skill}.`),
        ...(scoring?.preferenceGaps || []),
      ],
      "No tracked skill gaps found, but source claims still need manual review."
    ),
    doNotInventBoundaries: [
      "Do not add skills, credentials, employers, dates, metrics, or outcomes that are not present in the imported resume or candidate-provided proof.",
      "Treat missing job keywords as proof gaps, not writing instructions.",
      "Application answers require candidate review before any external use.",
    ],
  };
}

function applicationApprovalReady(application) {
  const checklist = application?.checklist || {};
  return APPROVAL_CHECKLIST.every(([key]) => checklist[key] === true) && Boolean(String(application?.applyUrl || "").trim());
}

function applicationStatusLabel(status) {
  return APPLICATION_STATUS_LABELS[status] || APPLICATION_STATUS_LABELS.draft;
}

function applicationTrackingReady(application) {
  return TRACKABLE_APPLICATION_STATUSES.includes(application?.status);
}

function applicationApprovalMissingLabels(application) {
  const checklist = application?.checklist || {};
  return APPROVAL_CHECKLIST
    .filter(([key]) => checklist[key] !== true)
    .map(([, label]) => label);
}

function feedbackFromForm(form) {
  const formData = new FormData(form);
  const strongestObjection = String(formData.get("strongestObjection") || formData.get("objections") || "").trim();
  const paidPacketInterest = String(formData.get("paidPacketInterest") || "").trim();
  return {
    ...emptyFirstSessionFeedback(),
    testerSegment: String(formData.get("testerSegment") || "").trim(),
    proofLoopComprehension: String(formData.get("proofLoopComprehension") || "").trim(),
    trustInEvidence: String(formData.get("trustInEvidence") || "").trim(),
    objections: strongestObjection,
    strongestObjection,
    confusionPoints: String(formData.get("confusionPoints") || "").trim(),
    willingnessToPay: paidPacketInterest === "explicit-interest" ? "paid-review-interest" : paidPacketInterest || "",
    willingnessToShareMaterials: String(formData.get("willingnessToShareMaterials") || "").trim(),
    paidPacketInterest,
    requestedNextAction: String(formData.get("requestedNextAction") || "").trim(),
    updatedAt: new Date().toISOString(),
  };
}

function appendFeedbackRoadmapSeed(workspace, feedback) {
  const observation = [
    feedback.proofLoopComprehension && `Proof-loop comprehension: ${feedback.proofLoopComprehension}`,
    feedback.trustInEvidence && `Trust in evidence: ${feedback.trustInEvidence}`,
    feedback.strongestObjection && `Strongest objection: ${feedback.strongestObjection}`,
    feedback.confusionPoints && `Confusion points: ${feedback.confusionPoints}`,
    feedback.willingnessToShareMaterials && `Willingness to share materials: ${feedback.willingnessToShareMaterials}`,
    feedback.paidPacketInterest && `Paid-packet interest: ${feedback.paidPacketInterest}`,
    feedback.requestedNextAction && `Requested next action: ${feedback.requestedNextAction}`,
  ]
    .filter(Boolean)
    .join("\n");
  if (!observation) return;

  const now = new Date().toISOString();
  const draft = {
    format: FEEDBACK_ROADMAP_DRAFT_FORMAT,
    id: `workspace-feedback-${Date.now().toString(16)}`,
    createdAt: now,
    updatedAt: now,
    mode: "sample_rehearsal",
    classification: String(feedback.paidPacketInterest || "").toLowerCase().includes("pay") ? "willingness_to_pay_signal" : "trust_objection",
    suggestedLane: String(feedback.paidPacketInterest || "").toLowerCase().includes("pay") ? "business" : "product_or_qa",
    title: "Workspace first-session feedback seed",
    evidence: {
      source: "app.html#first-session-handoff",
      anchor: `workspace-${workspace?.id || "local"}-first-session-feedback`,
      observation,
      redacted: true,
      allowedEvidenceOnly: true,
    },
    queueSuggestion: {
      format: "agentfoundry-queue-item-draft-v1",
      statusRecommendation: "draft_only_needs_controller_review",
      mayMarkReadyAutomatically: false,
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
      noCustomerFeedbackClaim: true,
    },
  };

  const current = safeJsonParse(storage().getItem(FEEDBACK_ROADMAP_STORAGE_KEY));
  const drafts = current?.format === FEEDBACK_ROADMAP_FORMAT && Array.isArray(current.drafts) ? current.drafts : [];
  const next = {
    format: FEEDBACK_ROADMAP_FORMAT,
    localOnly: true,
    externalAction: false,
    updatedAt: now,
    drafts: [draft, ...drafts].slice(0, 40),
  };
  storage().setItem(FEEDBACK_ROADMAP_STORAGE_KEY, JSON.stringify(next));
}

function selectedHandoffJob(workspace) {
  const jobs = rankWorkspaceJobs(workspace || {});
  const selectedId = workspace?.jobPipeline?.selectedJobId || "";
  return jobs.find((job) => job.id === selectedId) || jobs[0] || null;
}

function handoffProofGaps(workspace) {
  const application = firstApplication(workspace);
  const job = selectedHandoffJob(workspace);
  const gaps = [
    ...(application?.packet?.proofGaps || []),
    ...(job?.scoring?.proofGaps || []),
    ...(job?.scoring?.preferenceGaps || []),
  ];
  return unique(gaps).slice(0, 10);
}

function buildProofAuditPacket(workspace, session) {
  const profile = normalizeTargetPreferences(workspace?.profile || {});
  const resume = workspace?.resume || emptyResumeState();
  const job = selectedHandoffJob(workspace);
  const application = firstApplication(workspace);
  const proofGaps = handoffProofGaps(workspace);
  const supportedClaims = unique([
    ...(application?.packet?.claims || []),
    ...strongestResumeEvidenceLines(resume, application?.scoring?.matchedSkills || job?.scoring?.matchedSkills || []),
  ]).slice(0, 8);
  const doNotInventWarnings = unique([
    ...(application?.packet?.doNotInventBoundaries || []),
    "Do not turn proof gaps into resume claims until the candidate supplies evidence.",
    "Manual sharing requires candidate consent and target-job approval.",
  ]).slice(0, 8);
  const tailoredBullets = unique([
    ...(application?.packet?.resumeBulletSuggestions || []),
    ...(application?.packet?.resumeChanges || []),
  ]).slice(0, 8);
  const nextRecommendedAction = application
    ? applicationApprovalReady(application)
      ? "Use this packet in a live screen-share, then manually share only after candidate consent."
      : `Resolve approval gates before sharing: ${applicationApprovalMissingLabels(application).join(", ") || "human review required"}.`
    : job
      ? "Create a tailored application packet from this matched job before sharing the proof audit."
      : "Load the seeded demo walkthrough or add a matched job before building the proof audit.";
  return {
    format: PROOF_AUDIT_PACKET_FORMAT,
    generatedAt: new Date().toISOString(),
    boundary: {
      localOnly: true,
      manualShareOnly: true,
      requiresCandidateConsent: true,
      noExternalSend: true,
      noUpload: true,
      noAnalyticsSend: true,
      noPaymentAction: true,
      noAutoApply: true,
      noApplicationSubmission: true,
      privacyCopy: "This is a browser-local proof audit preview. Review with the candidate before any manual export or share.",
    },
    account: {
      signedIn: Boolean(session),
      workspaceId: workspace?.id || "",
      contactRedacted: true,
    },
    target: {
      role: profile.targetRole || profile.desiredRoles[0] || "",
      location: profile.location || profile.workMode || "",
      constraints: profile.mustHaveConstraints || [],
      keywords: profile.niceToHaveKeywords || [],
    },
    matchedJob: job
      ? {
          title: job.title || "",
          company: job.company || "",
          sourceKind: job.sourceKind || "manual-local-import",
          fitScore: job.scoring?.fitScore ?? application?.scoring?.fitScore ?? null,
          readiness: job.scoring?.readiness ?? application?.scoring?.readiness ?? null,
          scoreDrivers: job.scoring?.scoreDrivers || application?.scoring?.scoreDrivers || [],
        }
      : null,
    audit: {
      supportedClaims: fallbackList(supportedClaims, "No supported claims captured yet. Import a resume and create a packet first."),
      proofGaps: fallbackList(proofGaps, "No tracked proof gaps yet. Human review is still required."),
      doNotInventWarnings,
      tailoredBullets: fallbackList(tailoredBullets, "No tailored bullets generated yet. Create a packet from a matched job first."),
      coverNote: application?.packet?.coverNote || "No cover note generated yet. Create a tailored packet before manual sharing.",
      nextRecommendedAction,
    },
    approval: application
      ? {
          approvalReady: applicationApprovalReady(application),
          missingApprovals: applicationApprovalMissingLabels(application),
          status: application.status || "draft",
          outcome: application.outcome || "not_submitted",
          editState: application.editState || "generated",
        }
      : null,
  };
}

function proofAuditSummaryItems(packet) {
  return [
    `Target: ${packet.target.role || "not selected"} | ${packet.target.location || "no location/work-mode preference"}`,
    `Fit score: ${packet.matchedJob?.fitScore ?? "--"}/100 | Readiness: ${packet.matchedJob?.readiness ?? "--"}/100`,
    `Supported claims: ${packet.audit.supportedClaims.length} | Proof gaps: ${packet.audit.proofGaps.length}`,
    `Approval: ${packet.approval ? (packet.approval.approvalReady ? "ready after candidate review" : "needs review") : "no packet yet"}`,
    `Next: ${packet.audit.nextRecommendedAction}`,
  ];
}

function proofAuditMarkdown(packet) {
  return [
    "# ProofResume Target Job Proof Audit",
    "",
    `Format: ${packet.format}`,
    `Generated: ${packet.generatedAt}`,
    "",
    "## Local Boundary",
    "- Browser-local proof audit preview.",
    "- Manual share only after candidate consent and target-job approval.",
    "- No network, upload, analytics, payment, send, auto-apply, or application action occurred.",
    "",
    "## Fit Summary",
    ...proofAuditSummaryItems(packet).map((item) => `- ${item}`),
    "",
    "## Supported Claims",
    ...packet.audit.supportedClaims.map((item) => `- ${item}`),
    "",
    "## Proof Gaps",
    ...packet.audit.proofGaps.map((item) => `- ${item}`),
    "",
    "## Do-Not-Invent Warnings",
    ...packet.audit.doNotInventWarnings.map((item) => `- ${item}`),
    "",
    "## Tailored Bullets",
    ...packet.audit.tailoredBullets.map((item) => `- ${item}`),
    "",
    "## Cover Note",
    packet.audit.coverNote,
    "",
    "## Next Recommended Action",
    packet.audit.nextRecommendedAction,
    "",
  ].join("\n");
}

function consentedAuditHandoffChecks(packet, handoff) {
  const missingApprovals = packet.approval?.missingApprovals || [];
  const hasApplication = Boolean(packet.approval);
  const candidateConsentReady = hasApplication && !missingApprovals.includes("Candidate consent for this target job");
  const targetJobApproved = hasApplication && packet.approval?.approvalReady === true;
  const proofAuditReady = Boolean(packet.matchedJob && packet.audit?.supportedClaims?.length && packet.audit?.tailoredBullets?.length);
  const redactionReady = handoff.boundary?.redactedExport === true && packet.account?.contactRedacted === true;
  return [
    {
      id: "candidate_consent",
      label: "Candidate consent",
      state: candidateConsentReady ? "ready_for_manual_review" : "required_before_share",
      detail: candidateConsentReady
        ? "The local application checklist marks candidate consent for this target job."
        : "Candidate must approve sharing this proof audit before any manual send or session handoff.",
      ready: candidateConsentReady,
    },
    {
      id: "target_job_approval",
      label: "Target-job approval",
      state: targetJobApproved ? "approved_packet_ready" : "approval_required",
      detail: targetJobApproved
        ? "Claims, resume changes, cover note, answers, apply URL, and consent are checked locally."
        : `Resolve approval gates first: ${missingApprovals.join(", ") || "create a local application packet"}.`,
      ready: targetJobApproved,
    },
    {
      id: "redaction",
      label: "Redaction",
      state: redactionReady ? "redacted_export_ready" : "redaction_review_required",
      detail: "Resume text, contact details, raw materials, private replies, payment data, credentials, and screenshots stay out of this export.",
      ready: redactionReady,
    },
    {
      id: "proof_audit",
      label: "Proof audit",
      state: proofAuditReady ? "preview_ready" : "needs_local_packet",
      detail: proofAuditReady
        ? "Supported claims, proof gaps, warnings, tailored bullets, and cover note are available for review."
        : "Load the seeded walkthrough or create a tailored application packet before using this handoff.",
      ready: proofAuditReady,
    },
  ];
}

function buildConsentedAuditHandoffPreview(workspace, session) {
  const proofAuditPacket = buildProofAuditPacket(workspace, session);
  const firstSessionHandoff = buildFirstSessionHandoff(workspace, session);
  const checks = consentedAuditHandoffChecks(proofAuditPacket, firstSessionHandoff);
  const readyForManualShare = checks.every((check) => check.ready);
  const custody = [
    "Source custody: browser-local workspace and generated proof-audit packet only.",
    `Proof-audit format: ${proofAuditPacket.format}.`,
    `First-session handoff format: ${firstSessionHandoff.format}.`,
    "Repo-visible exports must contain sample, old, or redacted material only.",
    "Raw resume text, prospect identity, contact details, private replies, payment data, credentials, calendar links, screenshots, and customer materials are excluded.",
  ];
  const blockedActions = [
    "No external send or outreach from this preview.",
    "No scheduling, calendar link, or session booking action.",
    "No payment link, checkout, pricing claim, or revenue claim.",
    "No analytics send, public proof, testimonial, referral request, or deploy action.",
    "No production customer-data storage, provider upload, auto-apply, or application submission.",
  ];
  const candidateVisibleNextStep = readyForManualShare
    ? "Candidate can review the manual-share packet in a live session; operator must still use an approved channel and preserve no-send/no-apply boundaries."
    : checks.find((check) => !check.ready)?.detail || "Complete consent, target-job approval, and redaction review before sharing.";
  return {
    format: CONSENTED_AUDIT_HANDOFF_FORMAT,
    generatedAt: new Date().toISOString(),
    localOnly: true,
    manualShareOnly: true,
    readyForManualShare,
    sourceProofAuditFormat: proofAuditPacket.format,
    sourceFirstSessionHandoffFormat: firstSessionHandoff.format,
    boundary: {
      requiresCandidateConsent: true,
      requiresTargetJobApproval: true,
      redactedExportOnly: true,
      noExternalSend: true,
      noOutreach: true,
      noScheduling: true,
      noPaymentLink: true,
      noPaymentAction: true,
      noAnalyticsSend: true,
      noPublicProof: true,
      noTestimonialOrReferralRequest: true,
      noProductionStorage: true,
      noUpload: true,
      noAutoApply: true,
      noApplicationSubmission: true,
      noCustomerFeedbackClaim: true,
      noRevenueClaim: true,
    },
    consentAndApprovalChecks: checks,
    evidenceCustody: custody,
    blockedActions,
    candidateVisibleNextStep,
    proofAuditSummary: proofAuditSummaryItems(proofAuditPacket),
    firstSessionSummary: firstSessionSummaryItems(firstSessionHandoff),
  };
}

function consentedAuditHandoffMarkdown(handoff) {
  return [
    "# ProofResume Consented Proof-Audit Handoff Preview",
    "",
    `Format: ${handoff.format}`,
    `Generated: ${handoff.generatedAt}`,
    "",
    "## Boundary",
    "- Browser-local manual-share preview.",
    "- Candidate consent and target-job approval are required before sharing.",
    "- Redacted export only; raw resume text, contact details, private replies, payment data, credentials, calendar links, screenshots, and customer materials are excluded.",
    "- No send, outreach, scheduling, payment, analytics, public proof, testimonial, referral, upload, production storage, auto-apply, or application submission action occurred.",
    "",
    "## Consent And Approval",
    ...handoff.consentAndApprovalChecks.map((check) => `- ${check.label}: ${check.state} - ${check.detail}`),
    "",
    "## Evidence Custody",
    ...handoff.evidenceCustody.map((item) => `- ${item}`),
    "",
    "## Blocked Actions",
    ...handoff.blockedActions.map((item) => `- ${item}`),
    "",
    "## Candidate-Visible Next Step",
    handoff.candidateVisibleNextStep,
    "",
    "## Proof Audit Summary",
    ...handoff.proofAuditSummary.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function buildFirstSessionRehearsalEvidence({ handoff, proofAuditPacket }) {
  const feedback = {
    ...emptyFirstSessionFeedback(),
    ...(handoff?.testerFeedback || {}),
  };
  const conversationSignals = {
    testerSegment: feedback.testerSegment || "not_captured",
    proofLoopComprehension: feedback.proofLoopComprehension || "not_captured",
    trustInEvidence: feedback.trustInEvidence || "not_captured",
    strongestObjection: feedback.strongestObjection || feedback.objections || "not_captured",
    confusionPoints: feedback.confusionPoints || "not_captured",
    willingnessToShareMaterials: feedback.willingnessToShareMaterials || "not_captured",
    paidPacketInterest: feedback.paidPacketInterest || feedback.willingnessToPay || "not_captured",
    requestedNextAction: feedback.requestedNextAction || "not_captured",
  };
  return {
    format: FIRST_SESSION_REHEARSAL_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "local_sample_rehearsal_only",
    sourceHandoffFormat: handoff?.format || FIRST_SESSION_HANDOFF_FORMAT,
    sourceProofAuditFormat: proofAuditPacket?.format || PROOF_AUDIT_PACKET_FORMAT,
    boundary: {
      localOnly: true,
      sampleOrRedactedOnly: true,
      noRealCustomerMaterialsRequired: true,
      noOutreach: true,
      noScheduling: true,
      noPublicSend: true,
      noAnalyticsSend: true,
      noPaymentLink: true,
      noApplicationSubmission: true,
      noProductionCustomerDataStorage: true,
      realCustomerFeedbackObserved: false,
      revenueEvidenceObserved: false,
      externalActionsTaken: false,
      forbiddenRepoVisibleArtifacts: [
        "prospect names",
        "contact details",
        "raw resumes",
        "private replies",
        "payment data",
        "credentials",
        "customer materials",
        "screenshots",
      ],
    },
    readinessChecks: {
      localWorkspaceStepsCaptured: handoff?.journey?.completedSteps?.length || 0,
      proofAuditPreviewReady: Boolean(proofAuditPacket?.matchedJob && proofAuditPacket.audit?.supportedClaims?.length),
      approvalReady: Boolean(handoff?.approvalTracking?.approvalReady),
      remainingProofGapCount: handoff?.remainingProofGaps?.length || 0,
      nextAction: handoff?.journey?.nextAction || "Sign in locally and load the demo walkthrough before rehearsal.",
    },
    conversationSignals,
    queueTranslationGuardrail:
      "Treat this as rehearsal readiness only. Do not claim real feedback, willingness-to-pay, revenue, public proof, or customer outcome evidence from sample/local rehearsal notes.",
  };
}

function buildFirstSessionHandoff(workspace, session) {
  const profile = normalizeTargetPreferences(workspace?.profile || {});
  const resume = workspace?.resume || emptyResumeState();
  const job = selectedHandoffJob(workspace);
  const application = firstApplication(workspace);
  const states = journeyState(workspace, session);
  const completedSteps = JOURNEY_STEPS.filter(([key]) => states[key]).map(([, title]) => title);
  const proofGaps = handoffProofGaps(workspace);
  const handoff = {
    format: FIRST_SESSION_HANDOFF_FORMAT,
    generatedAt: new Date().toISOString(),
    boundary: {
      localOnly: true,
      redactedExport: true,
      warning: "Review before sharing. Resume text and contact details are intentionally excluded from this first-session handoff.",
      noExternalSend: true,
      noAnalyticsSend: true,
      noProductionStorage: true,
      noAutoApply: true,
      noApplicationSubmission: true,
    },
    account: {
      signedIn: Boolean(session),
      authMode: session ? "local-demo" : "signed-out",
      workspaceId: workspace?.id || "",
      contactRedacted: true,
    },
    resume: {
      imported: resume.state === "imported",
      filename: resume.state === "imported" ? resume.filename || "Pasted resume text" : "",
      importedAt: resume.importedAt || "",
      wordCount: resume.summary?.wordCount || 0,
      skillSignals: resume.summary?.skillSignals || [],
      redactedResumeText: "[redacted from first-session handoff export]",
    },
    targetPreferences: {
      targetRole: profile.targetRole || "",
      desiredRoles: profile.desiredRoles || [],
      seniority: profile.seniority || "",
      location: profile.location || "",
      workMode: profile.workMode || "",
      industries: profile.industries || [],
      mustHaveConstraints: profile.mustHaveConstraints || [],
      niceToHaveKeywords: profile.niceToHaveKeywords || [],
    },
    matchedJob: job
      ? {
          id: job.id,
          title: job.title || "",
          company: job.company || "",
          sourceKind: job.sourceKind || "manual-local-import",
          fitScore: job.scoring?.fitScore ?? null,
          readiness: job.scoring?.readiness ?? null,
          scoreDrivers: job.scoring?.scoreDrivers || [],
        }
      : null,
    tailoredPacket: application
      ? {
          id: application.id,
          title: application.title || "",
          company: application.company || "",
          generatedAt: application.packet?.generatedAt || "",
          editState: application.editState || "generated",
          claimsCount: (application.packet?.claims || []).length,
          answerPromptCount: (application.packet?.answers || []).length,
        }
      : null,
    approvalTracking: application
      ? {
          approvalReady: applicationApprovalReady(application),
          missingApprovals: applicationApprovalMissingLabels(application),
          status: application.status || "draft",
          outcome: application.outcome || "not_submitted",
          trackingReady: applicationTrackingReady(application),
        }
      : null,
    remainingProofGaps: proofGaps,
    journey: {
      completedSteps,
      nextAction: workspaceNextAction(workspace),
    },
    testerFeedback: {
      ...emptyFirstSessionFeedback(),
      ...(workspace?.firstSessionFeedback || {}),
    },
  };
  handoff.rehearsalEvidence = buildFirstSessionRehearsalEvidence({
    handoff,
    proofAuditPacket: buildProofAuditPacket(workspace, session),
  });
  return handoff;
}

function firstSessionCustomerHandoffFacts({ handoff, proofAuditPacket, paidPacketPreviewState }) {
  return [
    handoff.account.signedIn
      ? `Approved local fact: account restored in workspace ${handoff.account.workspaceId}.`
      : "Future recommendation: sign in locally before running the handoff.",
    handoff.resume.imported
      ? `Approved local fact: resume imported as ${handoff.resume.filename} with ${handoff.resume.wordCount} words; raw resume text stays redacted.`
      : "Future recommendation: import or paste resume text locally.",
    handoff.targetPreferences.targetRole || handoff.targetPreferences.desiredRoles.length
      ? `Approved local fact: target role preference is ${handoff.targetPreferences.targetRole || handoff.targetPreferences.desiredRoles[0]}.`
      : "Future recommendation: save target roles, preferences, seniority, and constraints.",
    handoff.matchedJob
      ? `Approved local fact: matched job is ${handoff.matchedJob.title} at ${handoff.matchedJob.company || "unknown company"} with fit ${handoff.matchedJob.fitScore ?? "--"}/100.`
      : "Future recommendation: add or load local matched jobs.",
    handoff.tailoredPacket
      ? `Approved local fact: tailored packet exists with ${handoff.tailoredPacket.claimsCount} supported claim slots and ${handoff.tailoredPacket.answerPromptCount} answer prompts.`
      : "Future recommendation: generate a tailored Target Job Pack from a matched job.",
    handoff.approvalTracking
      ? `Approved local fact: packet status is ${handoff.approvalTracking.status}; approval ${handoff.approvalTracking.approvalReady ? "is ready" : "still needs review"}.`
      : "Future recommendation: approve, edit, or reject the generated packet locally.",
    proofAuditPacket.matchedJob
      ? `Approved local fact: proof-audit receipt is visible with ${proofAuditPacket.audit.supportedClaims.length} supported claims and ${proofAuditPacket.audit.proofGaps.length} proof gaps.`
      : "Future recommendation: create a proof-audit receipt after packet generation.",
    `Approved local fact: paid-preview route is ${paidPacketPreviewState.selectedRoute}; checkout and payment links are disabled.`,
  ];
}

function firstSessionCustomerHandoffValueReceipt(proofAuditPacket, handoff, paidPacketPreviewState) {
  return [
    `Proof map: ${proofAuditPacket.audit.supportedClaims.length} supported claim lines are visible for review.`,
    `Missing proof: ${proofAuditPacket.audit.proofGaps.length} proof gap question${proofAuditPacket.audit.proofGaps.length === 1 ? "" : "s"} remain before stronger claims can be used.`,
    `Packet state: ${handoff.tailoredPacket ? handoff.tailoredPacket.editState : "not generated"} with approval ${handoff.approvalTracking?.approvalReady ? "ready" : "not ready"}.`,
    `Tracker state: ${handoff.approvalTracking?.status || "draft"} / ${handoff.approvalTracking?.outcome || "not_submitted"}.`,
    `Paid preview: no-checkout packet preview selected route ${paidPacketPreviewState.selectedRoute}.`,
  ];
}

function buildFirstSessionCustomerHandoffRoom(workspace, session) {
  const handoff = buildFirstSessionHandoff(workspace, session);
  const proofAuditPacket = buildProofAuditPacket(workspace, session);
  const paidPacketPreviewState = normalizePaidPacketPreviewState(workspace?.paidPacketPreview || {});
  const choice = PAID_PACKET_PREVIEW_CHOICES[paidPacketPreviewState.selectedChoiceId] || PAID_PACKET_PREVIEW_CHOICES["approve-preview"];
  const states = journeyState(workspace, session);
  const journey = JOURNEY_STEPS.map(([stepId, label, description, customerVisibleNextAction]) => ({
    stepId,
    label,
    description,
    state: states[stepId] ? "ready" : "needs_local_input",
    customerVisibleNextAction,
    externalActionAllowed: false,
  }));
  const selectedRoute = {
    route: choice.route,
    label: choice.label,
    target: choice.target,
    detail: choice.detail,
    selected: true,
    externalActionAllowed: false,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
  };
  return {
    format: FIRST_SESSION_CUSTOMER_HANDOFF_ROOM_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "sample_or_owner_approved_redacted_customer_handoff_no_external_actions",
    sourceHandoffFormat: handoff.format,
    sourceProofAuditFormat: proofAuditPacket.format,
    sourcePaidPacketPreviewFormat: paidPacketPreviewState.format,
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: true,
    journey,
    approvedFactsAndRecommendations: firstSessionCustomerHandoffFacts({
      handoff,
      proofAuditPacket,
      paidPacketPreviewState,
    }),
    rawInputProvenance: [
      "Source account state: browser-local demo auth only.",
      "Source resume state: browser-local import; raw resume text is redacted from handoff exports.",
      "Source target/job state: manual or demo local records only; no live scraping or provider fetch.",
      "Source packet state: locally generated Target Job Pack and tracker state only.",
      "Source paid-preview state: browser-local route selection only; no checkout or payment link.",
    ],
    valueReceipt: firstSessionCustomerHandoffValueReceipt(proofAuditPacket, handoff, paidPacketPreviewState),
    blockedGates: FIRST_SESSION_CUSTOMER_HANDOFF_BLOCKED_GATES.map(([gateId, label, detail]) => ({
      gateId,
      label,
      detail,
      blocked: true,
    })),
    selectedNextRoute: selectedRoute,
    routeOptions: [selectedRoute],
    repoSafety: {
      externalActionsPerformed: [],
      queueMutationsPerformed: [],
      noExternalActions: true,
      noPaymentCustomerDataOrApplicationHandling: true,
      noUnsupportedCustomerOrRevenueClaims: true,
      unsupportedClaims: {
        customerFeedbackObserved: false,
        willingnessToPayObserved: false,
        paymentIntentObserved: false,
        paymentObserved: false,
        publicProofObserved: false,
        revenueObserved: false,
        productionReady: false,
        deployEvidenceObserved: false,
        applicationOutcomeObserved: false,
      },
    },
  };
}

function firstSessionCustomerHandoffMarkdown(room) {
  return [
    "# ProofResume First-Session Customer Handoff Room",
    "",
    `Format: ${room.format}`,
    `Generated: ${room.generatedAt}`,
    "",
    "## Boundary",
    "- Sample/local or owner-approved redacted material only.",
    "- Raw resume text, contact details, private replies, payment data, credentials, screenshots, and customer materials stay out of this export.",
    "- No deploy, outreach, scheduling, analytics, payment, production customer-data handling, public proof, employer contact, auto-apply, form fill, application submission, downstream queue mutation, or downstream done claim occurred.",
    "",
    "## Customer Path",
    ...room.journey.map((step) => `- ${step.label}: ${step.state} - ${step.customerVisibleNextAction}`),
    "",
    "## Approved Facts And Future Recommendations",
    ...room.approvedFactsAndRecommendations.map((item) => `- ${item}`),
    "",
    "## Value Receipt",
    ...room.valueReceipt.map((item) => `- ${item}`),
    "",
    "## Blocked Gates",
    ...room.blockedGates.map((gate) => `- ${gate.label}: ${gate.detail}`),
    "",
    "## Selected Next Route",
    `- ${room.selectedNextRoute.route}: ${room.selectedNextRoute.detail}`,
    "",
  ].join("\n");
}

function routeFromObjectionText(text) {
  const value = String(text || "").toLowerCase();
  if (/(privacy|trust|consent|storage|delete|retention)/.test(value)) return "trust_privacy";
  if (/(price|refund|support|revision|scope|cost)/.test(value)) return "price_support";
  if (/(customer data|production data|resume data|upload)/.test(value)) return "customer_data_stop";
  if (/(payment|checkout|card|pay|stripe)/.test(value)) return "payment_stop";
  if (/(proof|testimonial|referral|quote|case study|screenshot)/.test(value)) return "public_proof_stop";
  if (/(confus|unclear|how does|where do|approve|edit|reject|track)/.test(value)) return "product_confusion";
  if (/(no fit|not relevant|not for me|low value)/.test(value)) return "no_fit";
  if (/(stale|duplicate|revoked|sample only|no action)/.test(value)) return "no_action";
  if (/(understand|clear|makes sense|comprehension)/.test(value)) return "comprehension";
  return "missing_proof";
}

function objectionCaseToRoute(objectionCase) {
  return {
    routeFamily: objectionCase.routeFamily,
    target: objectionCase.target,
    action: objectionCase.action,
    rationale: objectionCase.rationale,
    ownerAsk: objectionCase.ownerAsk,
    validationRequired: objectionCase.validationRequired,
    blockedGates: objectionCase.blockedGates,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
    externalActionAllowed: false,
    mustNotMarkDelegatedWorkDone: true,
  };
}

function buildFirstSessionObjectionRepairWizard(workspace, session) {
  const handoffRoom = buildFirstSessionCustomerHandoffRoom(workspace, session);
  const feedback = workspace?.firstSessionFeedback || {};
  const selectedCaseId = routeFromObjectionText(feedback.strongestObjection || feedback.objections);
  const objectionSets = FIRST_SESSION_OBJECTION_CASES.map((objectionCase) => ({
    caseId: objectionCase.caseId,
    label: objectionCase.label,
    safeCategory: objectionCase.safeCategory,
    expectedResult: objectionCase.expectedResult,
    selected: objectionCase.caseId === selectedCaseId,
    route: objectionCaseToRoute(objectionCase),
  }));
  const selectedObjection = objectionSets.find((objection) => objection.selected) || objectionSets.find((objection) => objection.caseId === "missing_proof");
  return {
    format: FIRST_SESSION_OBJECTION_REPAIR_WIZARD_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "sample_redacted_objection_to_repair_wizard_no_downstream_queue_mutation",
    sourceHandoffRoomFormat: handoffRoom.format,
    sampleOrOwnerApprovedRedactedOnly: true,
    rawObjectionTextStored: false,
    selectedSource: {
      source: "app.html#first-session-handoff",
      storedAsCategoryOnly: true,
      selectedCaseId: selectedObjection.caseId,
      selectedSafeCategory: selectedObjection.safeCategory,
    },
    routeFamilies: OBJECTION_REPAIR_ROUTE_FAMILIES,
    blockedGates: [
      "customer_data_authority",
      "payment_authority",
      "support_refund_policy",
      "public_proof_authority",
      "runtime_browser_evidence",
      "production_deploy_health_evidence",
      "candidate_and_target_job_consent_for_any_application",
    ],
    objectionSets,
    selectedRoute: {
      caseId: selectedObjection.caseId,
      ...selectedObjection.route,
    },
    repoSafety: {
      safeCategoryLabelsOnly: true,
      externalActionsPerformed: [],
      queueMutationsPerformed: [],
      queueMutationAllowed: false,
      downstreamCompletionClaimAllowed: false,
      noRawCustomerMaterials: true,
      noPaymentCustomerDataOrApplicationHandling: true,
      noUnsupportedCustomerOrRevenueClaims: true,
      unsupportedClaims: {
        customerFeedbackObserved: false,
        willingnessToPayObserved: false,
        paymentIntentObserved: false,
        paymentObserved: false,
        publicProofObserved: false,
        testimonialPermissionObserved: false,
        referralPermissionObserved: false,
        revenueObserved: false,
        productionReady: false,
        liveCustomerSessionObserved: false,
      },
    },
  };
}

function firstSessionObjectionRepairWizardMarkdown(wizard) {
  return [
    "# ProofResume First-Session Objection-To-Repair Wizard",
    "",
    `Format: ${wizard.format}`,
    `Generated: ${wizard.generatedAt}`,
    "",
    "## Boundary",
    "- Sample/local or owner-approved redacted category labels only.",
    "- Raw customer materials, private replies, contact details, credentials, payment data, payment links, proof claims, and revenue claims stay out of this export.",
    "- No deploy, outreach, scheduling, analytics, payment, production customer-data handling, public proof, employer contact, auto-apply, form fill, application submission, downstream queue mutation, or downstream done claim occurred.",
    "",
    "## Selected Route",
    `- ${wizard.selectedRoute.action}: ${wizard.selectedRoute.rationale}`,
    `- Owner ask: ${wizard.selectedRoute.ownerAsk}`,
    "",
    "## Objection Categories",
    ...wizard.objectionSets.map((objection) => `- ${objection.selected ? "[selected] " : ""}${objection.label}: ${objection.route.routeFamily} -> ${objection.route.action}`),
    "",
    "## Validation Required",
    ...wizard.selectedRoute.validationRequired.map((item) => `- ${item}`),
    "",
    "## Blocked Gates",
    ...wizard.selectedRoute.blockedGates.map((gate) => `- ${gate}`),
    "",
  ].join("\n");
}

function firstCustomerConciergeDemoBundleFalseFlags() {
  return {
    feedbackEvidence: false,
    willingnessToPayEvidence: false,
    paymentIntentEvidence: false,
    paymentEvidence: false,
    publicProofEvidence: false,
    productionCustomerDataEvidence: false,
    deployEvidence: false,
    outreachEvidence: false,
    analyticsEvidence: false,
    autoApplyEvidence: false,
    revenueEvidence: false,
  };
}

function buildFirstCustomerConciergeDemoBundle(workspace, session) {
  const handoffRoom = buildFirstSessionCustomerHandoffRoom(workspace, session);
  const objectionWizard = buildFirstSessionObjectionRepairWizard(workspace, session);
  const proofAuditPacket = buildProofAuditPacket(workspace, session);
  const paidPacketPreviewState = normalizePaidPacketPreviewState(workspace?.paidPacketPreview || {});
  const falseFlags = firstCustomerConciergeDemoBundleFalseFlags();
  const blockedGates = unique([
    ...handoffRoom.blockedGates.map((gate) => gate.gateId),
    ...objectionWizard.blockedGates,
    "support_refund_policy",
    "tax_merchant_of_record_owner",
    "final_go_no_go",
  ]);
  const selectedRoute = {
    route: "product_first_session_missing_proof_repair",
    routeFamily: objectionWizard.selectedRoute.routeFamily,
    target: objectionWizard.selectedRoute.target,
    action: objectionWizard.selectedRoute.action,
    rationale: objectionWizard.selectedRoute.rationale,
    externalActionAllowed: false,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
  };
  return {
    format: FIRST_CUSTOMER_CONCIERGE_DEMO_BUNDLE_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "sample_or_owner_approved_redacted_concierge_demo_bundle_no_external_actions",
    sourceArtifacts: [
      "pilot_workspace_walkthrough",
      "paid_packet_customer_preview",
      "post_preview_qa_coverage_harness",
      "first_authorized_session_runner",
      "first_session_customer_handoff_room",
      "first_session_objection_to_repair_wizard",
      "business_controls",
    ],
    appSurfacePath: "website/app.html#first-customer-concierge-demo-bundle",
    sessionCustody: {
      exactlyOneSession: true,
      mode: "sample_or_owner_approved_redacted",
      rawResumeAccepted: false,
      rawTargetJobAccepted: false,
      contactDetailsAccepted: false,
      privateRepliesAccepted: false,
      credentialsAccepted: false,
      paymentDataAccepted: false,
      customerMaterialsAccepted: false,
    },
    bundle: {
      bundleId: `sample-concierge-${session?.workspaceId || workspace?.id || "local"}`,
      state: "start_run_end_demo_bundle_ready",
      start: [
        "Open the local workspace with demo or owner-approved redacted context.",
        "Confirm the account, resume, target role, matched job, tailored packet, approval tracker, and proof-audit result are visible.",
        "Confirm blocked gates before any customer-data, payment, outreach, deploy, analytics, or application action.",
      ],
      run: [
        "Walk the customer path from account and resume through paid packet preview.",
        "Show approved local facts, future recommendations, raw-input provenance, and value receipt.",
        "Capture one safe objection category and route it through the objection repair wizard.",
      ],
      end: [
        "Export the redacted concierge bundle locally for operator review.",
        "Select exactly one internal route without mutating downstream queues.",
        "Record that feedback, willingness-to-pay, payment intent, payment, public proof, production data, deploy, outreach, analytics, auto-apply, and revenue evidence all remain false.",
      ],
      coverage: [
        "account_resume",
        "target_role_preferences",
        "matched_job",
        "tailored_packet",
        "approve_edit_reject",
        "tracking",
        "proof_audit_result",
        "paid_packet_preview",
        "blocked_external_gates",
        "operator_observation_prompts",
      ],
      customerVisibleNextActions: handoffRoom.journey.map((step) => ({
        stepId: step.stepId,
        label: step.label,
        nextAction: step.customerVisibleNextAction,
        externalActionAllowed: false,
      })),
      packagedArtifacts: {
        handoffRoomFormat: handoffRoom.format,
        objectionWizardFormat: objectionWizard.format,
        paidPreviewFormat: paidPacketPreviewState.format,
        proofAuditFormat: proofAuditPacket.format,
      },
      operatorObservationPrompts: [
        "What did the prospect understand about evidence-backed tailoring?",
        "Which proof gap blocked confidence in the tailored packet?",
        "Which trust, privacy, support, or payment gate caused hesitation?",
        "Which approve, edit, reject, or tracking state was confusing?",
        "Which paid-packet deliverable created the strongest local value signal without claiming payment intent?",
        "Which single internal route should be selected next?",
      ],
      blockedGates,
      selectedRoute,
    },
    repoSafety: {
      sampleOrOwnerApprovedRedactedOnly: true,
      exactlyOneBundle: true,
      startRunEndDefined: true,
      handoffAndObjectionPackaged: true,
      exportFalseFlagsVisible: true,
      forbiddenFixtureValuesAbsent: true,
      queueMutationAllowed: false,
      downstreamCompletionClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      externalActionsPerformed: [],
      queueMutationsPerformed: [],
      falseFlags,
      blockedActions: {
        deploy: false,
        outreachSend: false,
        scheduling: false,
        leadCapture: false,
        analyticsSend: false,
        providerMutation: false,
        paymentLinkDisplay: false,
        checkoutDisplay: false,
        paymentCollection: false,
        productionCustomerDataHandling: false,
        publicProof: false,
        testimonialRequest: false,
        referralRequest: false,
        employerContact: false,
        autoApply: false,
        formFill: false,
        applicationSubmission: false,
        downstreamQueueMutation: false,
      },
    },
  };
}

function firstCustomerConciergeDemoBundleMarkdown(bundle) {
  return [
    "# ProofResume First-Customer Concierge Demo Bundle",
    "",
    `Format: ${bundle.format}`,
    `Generated: ${bundle.generatedAt}`,
    "",
    "## Boundary",
    "- Sample/local or owner-approved redacted material only.",
    "- No deploy, outreach, scheduling, lead capture, analytics, provider mutation, payment link, checkout, payment collection, production customer-data handling, public proof, testimonial/referral request, employer contact, auto-apply, form fill, application submission, downstream queue mutation, or downstream done claim occurred.",
    "",
    "## Start",
    ...bundle.bundle.start.map((item) => `- ${item}`),
    "",
    "## Run",
    ...bundle.bundle.run.map((item) => `- ${item}`),
    "",
    "## End",
    ...bundle.bundle.end.map((item) => `- ${item}`),
    "",
    "## Customer Next Actions",
    ...bundle.bundle.customerVisibleNextActions.map((step) => `- ${step.label}: ${step.nextAction}`),
    "",
    "## Operator Observation Prompts",
    ...bundle.bundle.operatorObservationPrompts.map((item) => `- ${item}`),
    "",
    "## Blocked Gates",
    ...bundle.bundle.blockedGates.map((gate) => `- ${gate}`),
    "",
    "## Selected Route",
    `- ${bundle.bundle.selectedRoute.action}: ${bundle.bundle.selectedRoute.rationale}`,
    "",
  ].join("\n");
}

function firstCustomerReactionRouteFalseClaims() {
  return {
    customerFeedbackClaim: false,
    willingnessToPayClaim: false,
    paymentIntentClaim: false,
    paymentClaim: false,
    publicProofClaim: false,
    testimonialReferralClaim: false,
    revenueClaim: false,
    productionCustomerDataClaim: false,
  };
}

function firstCustomerReactionRouteOptions(selectedRoute) {
  const options = [
    ["product_repair", "product", "product_first_session_missing_proof_repair", "Clarify proof gaps, packet mechanics, or approval/tracking flow locally."],
    ["business_no_send_follow_up", "business", "business_first_paid_packet_no_send_owner_prep", "Prepare owner/paid no-send language without outreach, checkout, or payment links."],
    ["approval_unblocker_owner_repair", "approval_unblocker", "approval_unblocker_owner_evidence_repair", "Collect missing owner authority or evidence before live motion."],
    ["strategy_threshold_update", "strategy", "strategy_first_session_threshold_update", "Update thresholds after enough safe redacted evidence exists."],
    ["qa_reviewer", "qa", "qa_reviewer_first_session_evidence_check", "Review ambiguous or risky reaction labels before any work routing."],
    ["commons_follow_up", "commons", "commons_first_customer_signal_pattern_follow_up", "Extract a reusable pattern only from safe redacted structure."],
    ["keep_learning", "controller", "keep_learning_until_stronger_signal", "Keep observing sample/redacted runs without route escalation."],
    ["no_action", "controller", "no_action_duplicate_stale_or_no_fit", "Do not create work from duplicate, stale, revoked, or no-fit reactions."],
  ];
  return options.map(([routeFamily, target, action, rationale]) => ({
    routeFamily,
    target,
    action,
    rationale,
    selected: selectedRoute.routeFamily === routeFamily,
    externalActionAllowed: false,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
    mustNotMarkDelegatedWorkDone: true,
  }));
}

function buildFirstCustomerReactionRouteRecorder(workspace, session) {
  const bundle = buildFirstCustomerConciergeDemoBundle(workspace, session);
  const handoffRoom = buildFirstSessionCustomerHandoffRoom(workspace, session);
  const objectionWizard = buildFirstSessionObjectionRepairWizard(workspace, session);
  const selectedRoute = {
    routeFamily: objectionWizard.selectedRoute.routeFamily,
    target: objectionWizard.selectedRoute.target,
    action: objectionWizard.selectedRoute.action,
    rationale: objectionWizard.selectedRoute.rationale,
    ownerAsk: objectionWizard.selectedRoute.ownerAsk,
    validationRequired: objectionWizard.selectedRoute.validationRequired,
    blockedGates: objectionWizard.selectedRoute.blockedGates,
    externalActionAllowed: false,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
    mustNotMarkDelegatedWorkDone: true,
  };
  return {
    format: FIRST_CUSTOMER_REACTION_ROUTE_RECORDER_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "sample_or_owner_approved_redacted_reaction_route_recorder_no_external_actions",
    appSurfacePath: "website/app.html#first-customer-reaction-route-recorder",
    sourceFormats: {
      conciergeDemoBundle: bundle.format,
      customerHandoffRoom: handoffRoom.format,
      objectionWizard: objectionWizard.format,
    },
    sourceArtifacts: [
      "first_customer_concierge_demo_bundle",
      "first_session_customer_handoff_room",
      "first_session_objection_to_repair_wizard",
      "session_evidence_to_repair_queue",
      "first_session_repair_room",
      "paid_packet_customer_preview",
      "business_owner_packet_if_available",
      "strategy_decision_tree_if_available",
      "business_controls",
    ],
    reactionSet: {
      mode: "sample_or_owner_approved_redacted",
      sourceCustody: "safe_summary_labels_only",
      consentAndRedactionState: "sample_or_owner_approved_redacted_no_raw_material",
      rawReactionAccepted: false,
      prospectIdentityAccepted: false,
      contactDetailsAccepted: false,
      rawResumeAccepted: false,
      privateReplyAccepted: false,
      credentialsAccepted: false,
      paymentDataAccepted: false,
      paymentLinksAccepted: false,
      customerMaterialsAccepted: false,
      observationLabels: [
        "comprehension_level",
        "proof_gap_confidence",
        "trust_privacy_boundary",
        "price_support_boundary",
        "customer_data_stop",
        "payment_stop",
        "public_proof_stop",
        "product_confusion",
        "no_fit_or_no_action",
      ],
      objectionClasses: FIRST_SESSION_OBJECTION_CASES.map((objection) => objection.caseId),
      selectedObjectionClass: objectionWizard.selectedRoute.caseId || "missing_proof",
    },
    evidenceBoundary: {
      falseClaims: firstCustomerReactionRouteFalseClaims(),
      falseEvidenceFlags: firstCustomerConciergeDemoBundleFalseFlags(),
      blockedGates: unique([...bundle.bundle.blockedGates, ...selectedRoute.blockedGates]),
    },
    routeOptions: firstCustomerReactionRouteOptions(selectedRoute),
    selectedRoute,
    repoSafety: {
      sampleOrOwnerApprovedRedactedOnly: true,
      safeLabelsOnly: true,
      exactlyOneSelectedRoute: true,
      forbiddenFixtureValuesAbsent: true,
      queueMutationAllowed: false,
      downstreamCompletionClaimAllowed: false,
      externalActionsPerformed: [],
      queueMutationsPerformed: [],
      blockedActions: {
        deploy: false,
        outreachSend: false,
        scheduling: false,
        leadCapture: false,
        analyticsSend: false,
        providerMutation: false,
        paymentLinkDisplay: false,
        checkoutDisplay: false,
        paymentCollection: false,
        productionCustomerDataHandling: false,
        publicProof: false,
        testimonialRequest: false,
        referralRequest: false,
        employerContact: false,
        autoApply: false,
        formFill: false,
        applicationSubmission: false,
        downstreamQueueMutation: false,
      },
    },
  };
}

function firstCustomerReactionRouteRecorderMarkdown(recorder) {
  return [
    "# ProofResume First-Customer Reaction Route Recorder",
    "",
    `Format: ${recorder.format}`,
    `Generated: ${recorder.generatedAt}`,
    "",
    "## Boundary",
    "- Sample/local or owner-approved redacted labels only.",
    "- No prospect identity, contact details, raw resume, private reply, credentials, payment data, payment link, customer material, feedback claim, willingness-to-pay claim, payment-intent claim, payment claim, public-proof claim, testimonial/referral claim, revenue claim, external action, downstream queue mutation, or delegated done claim is accepted.",
    "",
    "## Reaction Labels",
    ...recorder.reactionSet.observationLabels.map((label) => `- ${label}`),
    "",
    "## Selected Route",
    `- ${recorder.selectedRoute.action}: ${recorder.selectedRoute.rationale}`,
    `- Owner ask: ${recorder.selectedRoute.ownerAsk}`,
    "",
    "## Route Options",
    ...recorder.routeOptions.map((route) => `- ${route.selected ? "[selected] " : ""}${route.routeFamily}: ${route.action}`),
    "",
    "## Blocked Gates",
    ...recorder.evidenceBoundary.blockedGates.map((gate) => `- ${gate}`),
    "",
  ].join("\n");
}

function firstCustomerEvidenceInboxMissingBeforeLiveUse() {
  return [
    "owner_authority_for_live_session",
    "session_consent_for_evidence_capture",
    "customer_data_handling_path",
    "support_refund_posture",
    "payment_authority",
    "public_proof_consent",
    "deploy_gate",
    "analytics_gate",
    "outreach_gate",
    "final_go_no_go",
  ];
}

function firstCustomerEvidenceInboxBlockedActions() {
  return {
    deploy: false,
    outreachSend: false,
    scheduling: false,
    leadCapture: false,
    analyticsSend: false,
    providerMutation: false,
    paymentLinkDisplay: false,
    checkoutDisplay: false,
    paymentCollection: false,
    productionCustomerDataHandling: false,
    publicProof: false,
    testimonialRequest: false,
    referralRequest: false,
    employerContact: false,
    autoApply: false,
    formFill: false,
    applicationSubmission: false,
    downstreamQueueMutation: false,
  };
}

function buildFirstCustomerEvidenceInboxRoom(workspace, session) {
  const bundle = buildFirstCustomerConciergeDemoBundle(workspace, session);
  const reactionRecorder = buildFirstCustomerReactionRouteRecorder(workspace, session);
  const handoffRoom = buildFirstSessionCustomerHandoffRoom(workspace, session);
  const objectionWizard = buildFirstSessionObjectionRepairWizard(workspace, session);
  const selectedRoute =
    reactionRecorder.routeOptions.find((route) => route.selected) ||
    reactionRecorder.routeOptions.find((route) => route.routeFamily === "keep_learning") ||
    reactionRecorder.routeOptions[0];
  const blockedGates = unique([
    ...reactionRecorder.evidenceBoundary.blockedGates,
    ...firstCustomerEvidenceInboxMissingBeforeLiveUse(),
  ]);

  return {
    format: FIRST_CUSTOMER_EVIDENCE_INBOX_ROOM_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "sample_or_owner_approved_redacted_evidence_inbox_no_external_actions",
    appSurfacePath: "website/app.html#first-customer-evidence-inbox-room",
    adminSurfacePath: "website/admin.html#first-customer-evidence-inbox-room",
    sourceArtifacts: [
      {
        id: "first_customer_concierge_demo_bundle",
        path: "ops/product/first-customer-concierge-demo-bundle.sample.json",
        state: bundle.format ? "consumed" : "missing",
      },
      {
        id: "first_customer_reaction_route_recorder",
        path: "ops/product/first-customer-reaction-route-recorder.sample.json",
        state: reactionRecorder.format ? "consumed" : "missing",
      },
      {
        id: "first_session_customer_handoff_room",
        path: "ops/product/first-session-customer-handoff-room.sample.json",
        state: handoffRoom.format ? "consumed" : "missing",
      },
      {
        id: "first_session_objection_to_repair_wizard",
        path: "ops/product/first-session-objection-to-repair-wizard.sample.json",
        state: objectionWizard.format ? "consumed" : "missing",
      },
      {
        id: "business_pilot_day_no_send_runbook_if_available",
        path: "ops/launch/first-customer-pilot-day-no-send-runbook.md",
        state: "optional_context",
      },
      {
        id: "strategy_value_receipt_rule_if_available",
        path: "ops/strategy/first-customer-value-receipt-signal-rule.md",
        state: "optional_context",
      },
      {
        id: "strategy_authorized_session_decision_tree_if_available",
        path: "ops/strategy/first-authorized-session-decision-tree.md",
        state: "optional_context",
      },
      {
        id: "business_controls",
        path: "ops/BUSINESS_CONTROLS.json",
        state: "controls_loaded",
      },
    ],
    sourceCustody: {
      custodyMode: "repo_safe_summary_labels_only",
      acceptedEvidenceModes: ["sample_only", "owner_approved_redacted"],
      rawPrivateMaterialAccepted: false,
      sourceChain: [
        "concierge_demo_bundle",
        "reaction_route_recorder",
        "customer_handoff_room",
        "objection_to_repair_wizard",
        "business_controls",
      ],
    },
    evidenceEnvelope: {
      evidenceType: "operator_observation_labels",
      consentStatus: "sample_only_or_owner_approved_redacted",
      redactionStatus: "sample_only_or_redacted_review_passed",
      sourceCustody: "safe_summary_labels_only",
      observationLabels: reactionRecorder.reactionSet.observationLabels,
      objectionClass: reactionRecorder.reactionSet.selectedObjectionClass,
      selectedProvisionalRoute: selectedRoute.action,
      rawReactionAccepted: false,
      prospectIdentityAccepted: false,
      contactDetailsAccepted: false,
      rawResumeAccepted: false,
      privateReplyAccepted: false,
      credentialsAccepted: false,
      paymentDataAccepted: false,
      paymentLinksAccepted: false,
      customerMaterialsAccepted: false,
      publicProofAccepted: false,
      testimonialReferralAccepted: false,
    },
    claimBoundary: {
      falseClaims: firstCustomerReactionRouteFalseClaims(),
      falseEvidenceFlags: firstCustomerConciergeDemoBundleFalseFlags(),
      forbiddenClaimLabels: [
        "customer_feedback_claim",
        "willingness_to_pay_claim",
        "payment_intent_claim",
        "payment_claim",
        "revenue_claim",
        "public_proof_claim",
        "testimonial_referral_claim",
      ],
    },
    missingBeforeLiveUse: firstCustomerEvidenceInboxMissingBeforeLiveUse(),
    blockedGates,
    provisionalRoutes: reactionRecorder.routeOptions.map((route) => ({
      ...route,
      provisionalOwner: route.target,
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    })),
    selectedProvisionalRoute: {
      routeFamily: selectedRoute.routeFamily,
      target: selectedRoute.target,
      action: selectedRoute.action,
      rationale: selectedRoute.rationale,
      provisionalOwner: selectedRoute.target,
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    repoSafety: {
      sampleOrOwnerApprovedRedactedOnly: true,
      safeLabelsOnly: true,
      exactlyOneSelectedRoute: true,
      forbiddenFixtureValuesAbsent: true,
      queueMutationAllowed: false,
      downstreamCompletionClaimAllowed: false,
      externalActionsPerformed: [],
      queueMutationsPerformed: [],
      blockedActions: firstCustomerEvidenceInboxBlockedActions(),
    },
  };
}

function firstCustomerEvidenceInboxRoomMarkdown(inbox) {
  return [
    "# ProofResume First-Customer Evidence Inbox Room",
    "",
    `Format: ${inbox.format}`,
    `Generated: ${inbox.generatedAt}`,
    "",
    "## Boundary",
    "- Sample-only or owner-approved redacted evidence packets only.",
    "- No raw customer material, contact detail, payment data, public proof, feedback claim, willingness-to-pay claim, payment claim, revenue claim, external action, downstream queue mutation, or delegated done claim is accepted.",
    "",
    "## Source Custody",
    ...inbox.sourceArtifacts.map((artifact) => `- ${artifact.id}: ${artifact.path} (${artifact.state})`),
    "",
    "## Observation Labels",
    ...inbox.evidenceEnvelope.observationLabels.map((label) => `- ${label}`),
    "",
    "## Missing Before Live Use",
    ...inbox.missingBeforeLiveUse.map((gate) => `- ${gate}`),
    "",
    "## Selected Provisional Route",
    `- ${inbox.selectedProvisionalRoute.action}: ${inbox.selectedProvisionalRoute.rationale}`,
    "",
    "## Blocked Gates",
    ...inbox.blockedGates.map((gate) => `- ${gate}`),
    "",
  ].join("\n");
}

function firstCustomerEvidenceRouteScoreboardClaimControls() {
  return {
    liveFeedbackClaim: false,
    customerFeedbackClaim: false,
    willingnessToPayClaim: false,
    paymentIntentClaim: false,
    paymentClaim: false,
    revenueClaim: false,
    publicProofClaim: false,
    testimonialReferralClaim: false,
    productionCustomerDataClaim: false,
    deployClaim: false,
    outreachClaim: false,
    analyticsClaim: false,
    autoApplyClaim: false,
    applicationSubmissionClaim: false,
  };
}

function firstCustomerEvidenceRouteScoreboardEvidenceFlags() {
  return {
    liveFeedbackEvidence: false,
    customerFeedbackEvidence: false,
    willingnessToPayEvidence: false,
    paymentIntentEvidence: false,
    paymentEvidence: false,
    revenueEvidence: false,
    publicProofEvidence: false,
    productionCustomerDataEvidence: false,
    deployEvidence: false,
    outreachEvidence: false,
    analyticsEvidence: false,
    autoApplyEvidence: false,
    applicationSubmissionEvidence: false,
  };
}

function firstCustomerEvidenceRouteScoreboardBlockedActions() {
  return {
    deploy: false,
    outreachSend: false,
    scheduling: false,
    leadCapture: false,
    analyticsSend: false,
    providerMutation: false,
    paymentLinkDisplay: false,
    checkoutDisplay: false,
    paymentCollection: false,
    productionCustomerDataHandling: false,
    publicProof: false,
    testimonialRequest: false,
    referralRequest: false,
    employerContact: false,
    autoApply: false,
    formFill: false,
    applicationSubmission: false,
    downstreamQueueMutation: false,
  };
}

function firstCustomerEvidenceRouteScoreDimensions(inbox, paidPreviewState) {
  const selectedPreview = PAID_PACKET_PREVIEW_CHOICES[paidPreviewState?.selectedChoiceId || "approve-preview"] || PAID_PACKET_PREVIEW_CHOICES["approve-preview"];
  const blockedGateCount = Array.isArray(inbox.blockedGates) ? inbox.blockedGates.length : 0;
  return [
    {
      id: "comprehension",
      label: "Comprehension",
      score: 72,
      threshold: 70,
      status: "passes_sample_threshold",
      rationale: "The local packet explains the loop and the evidence labels are understandable.",
    },
    {
      id: "trust_privacy",
      label: "Trust and privacy",
      score: 58,
      threshold: 70,
      status: "blocked_by_customer_data_and_public_proof_gates",
      rationale: "Custody is safe, but live customer-data, public-proof, and consent gates are still blocked.",
    },
    {
      id: "value",
      label: "Value",
      score: 64,
      threshold: 70,
      status: "promising_but_not_paid_ready",
      rationale: "The packet shows a useful proof-backed path, but the sample does not support a paid claim.",
    },
    {
      id: "proof_completeness",
      label: "Proof completeness",
      score: 46,
      threshold: 70,
      status: "needs_missing_proof_repair",
      rationale: "The selected inbox route is missing-proof repair, so Product should improve the local explanation first.",
    },
    {
      id: "paid_preview_clarity",
      label: "Paid-preview clarity",
      score: selectedPreview.target === "business" ? 63 : 54,
      threshold: 70,
      status: "no_send_preview_visible_but_not_checkout_ready",
      rationale: selectedPreview.detail,
    },
    {
      id: "price_support_concern",
      label: "Price and support concern",
      score: 52,
      threshold: 70,
      status: "support_refund_policy_missing",
      rationale: "Support/refund posture is still listed as missing before live use.",
    },
    {
      id: "customer_data_readiness",
      label: "Customer-data readiness",
      score: 30,
      threshold: 70,
      status: "blocked",
      rationale: "Production customer-data handling is not authorized by this local scoreboard.",
    },
    {
      id: "payment_readiness",
      label: "Payment readiness",
      score: 28,
      threshold: 70,
      status: "blocked",
      rationale: "Payment authority, checkout, links, payment intent, and collection remain blocked.",
    },
    {
      id: "blocked_external_gates",
      label: "Blocked external gates",
      score: Math.max(0, 100 - blockedGateCount * 4),
      threshold: 70,
      status: "fail_closed",
      rationale: `${blockedGateCount} external or live-use gates remain blocked.`,
    },
  ];
}

function firstCustomerEvidenceRouteScoreboardRoutes() {
  return [
    {
      routeFamily: "product_repair",
      target: "product",
      action: "product_first_customer_evidence_proof_repair",
      trigger: "Proof completeness or product comprehension is below threshold.",
      rationale: "Improve the local packet or proof explanation before asking for paid or live authority.",
    },
    {
      routeFamily: "business_no_send_paid_prep_follow_up",
      target: "business",
      action: "business_first_paid_packet_no_send_follow_up",
      trigger: "Value and proof are strong while checkout and outreach remain blocked.",
      rationale: "Prepare no-send paid-packet language without payment links, sends, or queue mutation.",
    },
    {
      routeFamily: "approval_unblocker_owner_evidence_repair",
      target: "approval_unblocker",
      action: "approval_unblocker_customer_data_payment_owner_repair",
      trigger: "Customer-data, payment, support/refund, public-proof, deploy, analytics, or outreach authority is missing.",
      rationale: "Ask only for the narrow missing owner evidence required before live action.",
    },
    {
      routeFamily: "strategy_threshold_update",
      target: "strategy",
      action: "strategy_first_customer_evidence_threshold_update",
      trigger: "Scores are mixed or thresholds are ambiguous after enough redacted evidence exists.",
      rationale: "Tune conversion thresholds without claiming traction.",
    },
    {
      routeFamily: "qa_reviewer_check",
      target: "qa",
      action: "qa_reviewer_first_customer_evidence_score_review",
      trigger: "Route confidence or claim boundary needs independent review.",
      rationale: "Check that weak signals are not being overstated.",
    },
    {
      routeFamily: "commons_follow_up",
      target: "commons",
      action: "commons_first_customer_evidence_scoreboard_pattern",
      trigger: "The scoring shape is reusable across projects.",
      rationale: "Extract a reusable pattern only after the local product contract is stable.",
    },
    {
      routeFamily: "keep_learning",
      target: "controller",
      action: "keep_learning_until_stronger_first_customer_signal",
      trigger: "Evidence is safe but too weak to route to product, business, approval, strategy, QA, or Commons.",
      rationale: "Keep observing sample or redacted sessions.",
    },
    {
      routeFamily: "no_action",
      target: "controller",
      action: "no_action_duplicate_stale_or_no_fit_evidence",
      trigger: "Evidence is duplicate, stale, revoked, unsafe, or no-fit.",
      rationale: "Do not create work from unsupported evidence.",
    },
  ];
}

function firstCustomerEvidenceRouteScoreboardCases() {
  return [
    {
      id: "missing_proof_product_repair",
      expectedRouteFamily: "product_repair",
      scoreSignals: { comprehension: 72, trustPrivacy: 58, value: 64, proofCompleteness: 46, paidPreviewClarity: 63, customerDataReadiness: 30, paymentReadiness: 28 },
    },
    {
      id: "strong_value_no_send_paid_prep",
      expectedRouteFamily: "business_no_send_paid_prep_follow_up",
      scoreSignals: { comprehension: 86, trustPrivacy: 78, value: 84, proofCompleteness: 78, paidPreviewClarity: 82, customerDataReadiness: 45, paymentReadiness: 40 },
    },
    {
      id: "owner_evidence_gate_repair",
      expectedRouteFamily: "approval_unblocker_owner_evidence_repair",
      scoreSignals: { comprehension: 80, trustPrivacy: 38, value: 76, proofCompleteness: 74, paidPreviewClarity: 70, customerDataReadiness: 20, paymentReadiness: 18 },
    },
    {
      id: "ambiguous_threshold_strategy",
      expectedRouteFamily: "strategy_threshold_update",
      scoreSignals: { comprehension: 69, trustPrivacy: 67, value: 68, proofCompleteness: 66, paidPreviewClarity: 67, customerDataReadiness: 42, paymentReadiness: 41 },
    },
    {
      id: "claim_boundary_review",
      expectedRouteFamily: "qa_reviewer_check",
      scoreSignals: { comprehension: 82, trustPrivacy: 72, value: 77, proofCompleteness: 76, paidPreviewClarity: 74, customerDataReadiness: 55, paymentReadiness: 54, routeConfidence: 52 },
    },
    {
      id: "reusable_pattern_follow_up",
      expectedRouteFamily: "commons_follow_up",
      scoreSignals: { comprehension: 81, trustPrivacy: 73, value: 75, proofCompleteness: 73, paidPreviewClarity: 72, customerDataReadiness: 58, paymentReadiness: 57, reusablePattern: 92 },
    },
    {
      id: "thin_signal_keep_learning",
      expectedRouteFamily: "keep_learning",
      scoreSignals: { comprehension: 55, trustPrivacy: 55, value: 50, proofCompleteness: 52, paidPreviewClarity: 48, customerDataReadiness: 30, paymentReadiness: 28 },
    },
    {
      id: "duplicate_or_no_fit_no_action",
      expectedRouteFamily: "no_action",
      scoreSignals: { comprehension: 15, trustPrivacy: 18, value: 12, proofCompleteness: 10, paidPreviewClarity: 8, customerDataReadiness: 0, paymentReadiness: 0, noFitOrDuplicate: true },
    },
  ];
}

function buildFirstCustomerEvidenceRouteScoreboard(workspace, session) {
  const inbox = buildFirstCustomerEvidenceInboxRoom(workspace, session);
  const paidPreviewState = normalizePaidPacketPreviewState(workspace?.paidPacketPreview || {});
  const dimensions = firstCustomerEvidenceRouteScoreDimensions(inbox, paidPreviewState);
  const routes = firstCustomerEvidenceRouteScoreboardRoutes();
  const selectedRoute = routes.find((route) => route.routeFamily === "product_repair");
  const blockedGates = unique([
    ...inbox.blockedGates,
    "live_feedback_claim",
    "willingness_to_pay_claim",
    "payment_intent_claim",
    "payment_claim",
    "revenue_claim",
    "public_proof_claim",
    "deploy",
    "outreach",
    "analytics",
    "production_customer_data",
    "auto_apply",
    "application_submission",
  ]);

  return {
    format: FIRST_CUSTOMER_EVIDENCE_ROUTE_SCOREBOARD_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "local_sample_redacted_route_scoreboard_no_external_actions",
    queueItemId: "NORTHSTAR-FIRST-CUSTOMER-EVIDENCE-ROUTE-SCOREBOARD",
    appSurfacePath: "website/app.html#first-customer-evidence-route-scoreboard",
    adminSurfacePath: "website/admin.html#first-customer-evidence-route-scoreboard",
    consumedArtifacts: [
      { id: "first_customer_evidence_inbox_room", path: "ops/product/first-customer-evidence-inbox-room.sample.json", state: "consumed" },
      { id: "first_customer_reaction_route_recorder", path: "ops/product/first-customer-reaction-route-recorder.sample.json", state: "consumed" },
      { id: "first_paid_decision_room", path: "ops/product/first-paid-decision-room.sample.json", state: "consumed" },
      { id: "paid_packet_customer_preview", path: "ops/product/paid-packet-customer-preview.sample.json", state: "consumed" },
      { id: "strategy_value_receipt_signal_rule_if_available", path: "ops/strategy/first-customer-value-receipt-signal-rule.md", state: "optional_context" },
      { id: "strategy_authorized_session_decision_tree_if_available", path: "ops/strategy/first-authorized-session-decision-tree.md", state: "optional_context" },
      { id: "business_no_send_runbooks_if_available", path: "ops/launch", state: "optional_context" },
    ],
    scoreDimensions: dimensions,
    routeOptions: routes.map((route) => ({
      ...route,
      selected: route.routeFamily === selectedRoute.routeFamily,
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    })),
    selectedRoute: {
      ...selectedRoute,
      rationale: "The sample evidence is understandable but proof completeness is below threshold, so the only safe next route is Product repair.",
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    scoreFixtures: firstCustomerEvidenceRouteScoreboardCases(),
    narrowUserAsk: null,
    narrowUserAskRules: [
      "deploy authority only after deploy gate is otherwise ready",
      "customer-data consent and storage path only when customer_data_readiness is the blocker",
      "payment-link activation and support/refund policy only when payment_readiness is the blocker",
      "public-proof consent only after owner-approved redacted proof exists",
      "outreach permission only after no-send copy and recipient source policy pass",
    ],
    claimControls: {
      falseClaims: firstCustomerEvidenceRouteScoreboardClaimControls(),
      falseEvidenceFlags: firstCustomerEvidenceRouteScoreboardEvidenceFlags(),
      blockedExternalGates: blockedGates,
    },
    repoSafety: {
      sampleOrOwnerApprovedRedactedOnly: true,
      safeLabelsOnly: true,
      failClosedClaimControls: true,
      exactlyOneSelectedRoute: true,
      noExternalActions: true,
      queueMutationAllowed: false,
      downstreamCompletionClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      externalActionsPerformed: [],
      queueMutationsPerformed: [],
      blockedActions: firstCustomerEvidenceRouteScoreboardBlockedActions(),
    },
  };
}

function firstCustomerEvidenceRouteScoreboardMarkdown(scoreboard) {
  return [
    "# ProofResume First-Customer Evidence Route Scoreboard",
    "",
    `Format: ${scoreboard.format}`,
    `Generated: ${scoreboard.generatedAt}`,
    "",
    "## Boundary",
    "- Local sample or owner-approved redacted evidence only.",
    "- No live feedback, willingness-to-pay, payment intent, payment, revenue, public proof, deploy, outreach, analytics, production customer data, auto-apply, application submission, external action, downstream queue mutation, or delegated done claim is accepted.",
    "",
    "## Score Dimensions",
    ...scoreboard.scoreDimensions.map((dimension) => `- ${dimension.label}: ${dimension.score}/${dimension.threshold} (${dimension.status})`),
    "",
    "## Selected Route",
    `- ${scoreboard.selectedRoute.action}: ${scoreboard.selectedRoute.rationale}`,
    "",
    "## Score Fixtures",
    ...scoreboard.scoreFixtures.map((fixture) => `- ${fixture.id}: ${fixture.expectedRouteFamily}`),
    "",
    "## Blocked Gates",
    ...scoreboard.claimControls.blockedExternalGates.map((gate) => `- ${gate}`),
    "",
  ].join("\n");
}

function firstCustomerEvidenceProofRepairBlockedActions() {
  return {
    deploy: false,
    outreachSend: false,
    scheduling: false,
    leadCapture: false,
    analyticsSend: false,
    providerMutation: false,
    paymentLinkDisplay: false,
    checkoutDisplay: false,
    paymentCollection: false,
    productionCustomerDataHandling: false,
    publicProof: false,
    testimonialRequest: false,
    referralRequest: false,
    customerFeedbackClaim: false,
    willingnessToPayClaim: false,
    paymentIntentClaim: false,
    paymentClaim: false,
    revenueClaim: false,
    employerContact: false,
    autoApply: false,
    formFill: false,
    applicationSubmission: false,
    downstreamQueueMutation: false,
    downstreamDoneClaim: false,
  };
}

function firstCustomerEvidenceProofRepairMissingCategories(scoreboard) {
  const proofCompleteness = (scoreboard.scoreDimensions || []).find((dimension) => dimension.id === "proof_completeness") || {};
  return [
    {
      id: "impact_metric_missing",
      label: "Impact metric missing",
      severity: "high",
      sourceCustodyLabel: "sample_resume_summary_only",
      observedGap: "The sample packet says the candidate improved workflow speed, but the local evidence does not name a metric, range, or source.",
      repairGoal: "Ask for a safe, candidate-owned metric or downgrade the claim to a non-quantified process improvement.",
      scoreboardSignal: `${proofCompleteness.score || 46}/${proofCompleteness.threshold || 70} ${proofCompleteness.status || "needs_missing_proof_repair"}`,
    },
    {
      id: "role_context_missing",
      label: "Role context missing",
      severity: "medium",
      sourceCustodyLabel: "target_job_metadata_only",
      observedGap: "The target job needs product analytics and stakeholder communication, but the sample copy does not tie each repaired claim to a target responsibility.",
      repairGoal: "Bind each repaired bullet to one target responsibility and one owned project detail.",
      scoreboardSignal: "value promising but not paid-ready",
    },
    {
      id: "source_line_custody_gap",
      label: "Source-line custody gap",
      severity: "high",
      sourceCustodyLabel: "redacted_label_without_raw_material",
      observedGap: "The packet uses safe labels, but the operator still needs a source label for every repaired sentence before live use.",
      repairGoal: "Attach source labels without storing raw resume text, transcripts, contact details, payment data, or private customer material.",
      scoreboardSignal: "trust/privacy below threshold",
    },
    {
      id: "approval_language_gap",
      label: "Approval language gap",
      severity: "medium",
      sourceCustodyLabel: "local_candidate_review_only",
      observedGap: "The sample repair needs candidate-visible approval wording before any packet could be shared manually.",
      repairGoal: "Use candidate-owned wording and keep the operator state no-send until explicit approval exists.",
      scoreboardSignal: "external gates fail closed",
    },
  ];
}

function firstCustomerEvidenceProofRepairPrompts() {
  return [
    {
      id: "metric_or_downgrade",
      categoryId: "impact_metric_missing",
      prompt: "What measurable result can you safely stand behind for this project? If none, should we phrase it as a process improvement instead of a quantified outcome?",
      allowedInput: "candidate-owned metric, approximate non-sensitive range, or downgrade decision",
      forbiddenInput: "raw resume dump, employer confidential data, private customer names, payment details, contact details, or invented numbers",
    },
    {
      id: "project_context",
      categoryId: "role_context_missing",
      prompt: "Which owned project best proves the target-role responsibility, and what tool, stakeholder, or decision can be named without exposing private material?",
      allowedInput: "safe project label, role responsibility, tool family, or stakeholder type",
      forbiddenInput: "private employer material, customer identity, login-protected source, or unsupported responsibility",
    },
    {
      id: "source_label",
      categoryId: "source_line_custody_gap",
      prompt: "Which safe source label supports this sentence: resume summary, candidate note, portfolio artifact, redacted session note, or target job metadata?",
      allowedInput: "source label only",
      forbiddenInput: "raw customer material, transcript, email, phone number, access token, payment link, or live URL",
    },
    {
      id: "candidate_approval",
      categoryId: "approval_language_gap",
      prompt: "Is this repaired wording accurate enough for candidate review, or should it stay marked needs-edit?",
      allowedInput: "approve for local packet review, needs edit, or reject",
      forbiddenInput: "application submission consent, public testimonial approval, payment intent, or willingness-to-pay claim",
    },
  ];
}

function firstCustomerEvidenceProofRepairCopy() {
  return [
    {
      id: "analytics_workflow_bullet",
      categoryId: "impact_metric_missing",
      sourceCustodyLabel: "sample_resume_summary_only",
      before: "Improved analytics workflows and helped teams move faster.",
      after: "Improved a recurring analytics workflow by documenting handoffs, clarifying review steps, and reducing avoidable rework across product and operations partners.",
      supportState: "repair_ready_without_metric",
      approvalState: "candidate_review_required",
      unsupportedClaimRemoved: true,
    },
    {
      id: "stakeholder_alignment_bullet",
      categoryId: "role_context_missing",
      sourceCustodyLabel: "target_job_metadata_only",
      before: "Strong stakeholder communication for cross-functional teams.",
      after: "Translated product and operations requirements into a shared delivery checklist so stakeholders could compare scope, tradeoffs, and evidence before launch decisions.",
      supportState: "target_role_context_added",
      approvalState: "candidate_review_required",
      unsupportedClaimRemoved: true,
    },
    {
      id: "proof_note",
      categoryId: "source_line_custody_gap",
      sourceCustodyLabel: "redacted_label_without_raw_material",
      before: "Candidate is a proven top performer.",
      after: "Candidate has sample-backed evidence for workflow documentation, stakeholder coordination, and role-specific packet review; stronger performance claims require candidate-owned proof.",
      supportState: "overclaim_downgraded",
      approvalState: "needs_source_label",
      unsupportedClaimRemoved: true,
    },
  ];
}

function buildFirstCustomerEvidenceProofRepairPacket(workspace, session) {
  const scoreboard = buildFirstCustomerEvidenceRouteScoreboard(workspace, session);
  const selectedRoute = scoreboard.selectedRoute || {};
  const missingProofCategories = firstCustomerEvidenceProofRepairMissingCategories(scoreboard);
  const followUpPrompts = firstCustomerEvidenceProofRepairPrompts();
  const repairCopy = firstCustomerEvidenceProofRepairCopy();

  return {
    format: FIRST_CUSTOMER_EVIDENCE_PROOF_REPAIR_PACKET_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "local_sample_redacted_proof_repair_packet_no_external_actions",
    queueItemId: "NORTHSTAR-FIRST-CUSTOMER-EVIDENCE-PROOF-REPAIR-PACKET",
    appSurfacePath: "website/app.html#first-customer-evidence-proof-repair-packet",
    adminSurfacePath: "website/admin.html#first-customer-evidence-proof-repair-packet",
    consumedRouteScoreboard: {
      id: "first_customer_evidence_route_scoreboard",
      path: "ops/product/first-customer-evidence-route-scoreboard.sample.json",
      requiredSelectedRoute: "product_first_customer_evidence_proof_repair",
      selectedRouteAction: selectedRoute.action || "product_first_customer_evidence_proof_repair",
      selectedRouteFamily: selectedRoute.routeFamily || "product_repair",
      state: selectedRoute.action === "product_first_customer_evidence_proof_repair" ? "consumed_selected_route" : "blocked_route_mismatch",
    },
    sourceCustodyLabels: [
      "sample_resume_summary_only",
      "target_job_metadata_only",
      "redacted_label_without_raw_material",
      "local_candidate_review_only",
    ],
    missingProofCategories,
    safeFollowUpPrompts: followUpPrompts,
    beforeAfterRepairCopy: repairCopy,
    proofCompletenessRepairOutput: {
      state: "local_repair_packet_ready_for_candidate_review",
      categoriesRepaired: missingProofCategories.length,
      promptsPrepared: followUpPrompts.length,
      repairCopiesPrepared: repairCopy.length,
      unsupportedClaimsRemoved: repairCopy.every((copy) => copy.unsupportedClaimRemoved === true),
      rawCustomerMaterialsExcluded: true,
      exportExcludesRawCustomerMaterials: true,
    },
    selectedInternalRoute: {
      routeFamily: "product_repair",
      target: "product",
      action: "product_first_customer_evidence_proof_repair",
      rationale: "The local scoreboard selected Product repair because proof completeness is below threshold.",
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    blockedExternalActions: firstCustomerEvidenceProofRepairBlockedActions(),
    claimControls: {
      sampleOrOwnerApprovedRedactedOnly: true,
      falseUnsupportedClaims: true,
      noExternalActions: true,
      noPaymentOrCustomerDataHandling: true,
      noDownstreamQueueMutation: true,
      noDelegatedCompletionClaim: true,
      customerFeedbackClaim: false,
      willingnessToPayClaim: false,
      paymentIntentClaim: false,
      paymentClaim: false,
      revenueClaim: false,
      publicProofClaim: false,
      productionCustomerDataClaim: false,
    },
    repoSafety: {
      sampleOrOwnerApprovedRedactedOnly: true,
      rawCustomerMaterialsExcluded: true,
      safeLabelsOnly: true,
      exactlyOneSelectedInternalRoute: true,
      falseUnsupportedClaims: true,
      noExternalActions: true,
      queueMutationAllowed: false,
      downstreamCompletionClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      externalActionsPerformed: [],
      queueMutationsPerformed: [],
      blockedActions: firstCustomerEvidenceProofRepairBlockedActions(),
    },
  };
}

function firstCustomerEvidenceProofRepairPacketMarkdown(packet) {
  return [
    "# ProofResume First-Customer Evidence Proof-Repair Packet",
    "",
    `Format: ${packet.format}`,
    `Generated: ${packet.generatedAt}`,
    "",
    "## Boundary",
    "- Local sample or owner-approved redacted evidence labels only.",
    "- Raw customer materials, contact details, payment data, live URLs, external actions, downstream queue mutations, and delegated completion claims are excluded.",
    "",
    "## Consumed Route",
    `- ${packet.consumedRouteScoreboard.selectedRouteAction}: ${packet.consumedRouteScoreboard.state}`,
    "",
    "## Missing Proof Categories",
    ...packet.missingProofCategories.map((category) => `- ${category.label}: ${category.repairGoal}`),
    "",
    "## Safe Follow-Up Prompts",
    ...packet.safeFollowUpPrompts.map((prompt) => `- ${prompt.prompt}`),
    "",
    "## Before/After Repair Copy",
    ...packet.beforeAfterRepairCopy.map((copy) => `- ${copy.id}: ${copy.before} -> ${copy.after}`),
    "",
    "## Blocked Actions",
    ...Object.entries(packet.blockedExternalActions).map(([key, value]) => `- ${key}: ${value}`),
    "",
  ].join("\n");
}

function paidAskRoomBlockedActions() {
  return {
    deploy: false,
    outreachSend: false,
    scheduling: false,
    leadCapture: false,
    analyticsSend: false,
    providerMutation: false,
    paymentLinkDisplay: false,
    checkoutDisplay: false,
    paymentCollection: false,
    productionCustomerDataHandling: false,
    publicProof: false,
    testimonialRequest: false,
    referralRequest: false,
    customerFeedbackClaim: false,
    willingnessToPayClaim: false,
    paymentIntentClaim: false,
    paymentClaim: false,
    revenueClaim: false,
    employerContact: false,
    autoApply: false,
    formFill: false,
    applicationSubmission: false,
    downstreamQueueMutation: false,
    downstreamDoneClaim: false,
  };
}

function paidAskRoomObjectionRoutes() {
  return [
    {
      id: "value_unclear",
      label: "Value unclear",
      route: "product_paid_packet_value_clarity_repair",
      target: "product",
      rationale: "The proof delta or deliverables need clearer local explanation before a paid ask rehearsal is useful.",
    },
    {
      id: "trust_privacy_concern",
      label: "Trust/privacy concern",
      route: "approval_unblocker_customer_data_privacy_repair",
      target: "approval_unblocker",
      rationale: "Custody, consent, deletion, or customer-data boundaries need owner evidence before live use.",
    },
    {
      id: "price_support_question",
      label: "Price/support question",
      route: "strategy_price_support_threshold_review",
      target: "strategy",
      rationale: "Price, scope, support, refund, or delivery questions need threshold work without claiming willingness to pay.",
    },
    {
      id: "missing_proof",
      label: "Missing proof",
      route: "product_first_customer_evidence_proof_repair",
      target: "product",
      rationale: "The repaired proof still needs candidate-owned or owner-approved redacted proof labels.",
    },
    {
      id: "not_ready",
      label: "Not ready",
      route: "no_queue_action_wait_for_owner_evidence",
      target: "no_action",
      rationale: "Sample-only, duplicate, stale, or weak evidence should not create live motion.",
    },
    {
      id: "ready_to_discuss_paid_packet",
      label: "Ready to discuss paid packet",
      route: "business_private_paid_packet_discussion_no_checkout",
      target: "business",
      rationale: "The operator can prepare private no-send discussion notes while payment and customer-data gates remain blocked.",
    },
  ].map((route) => ({
    ...route,
    externalActionAllowed: false,
    paymentActionAllowed: false,
    customerDataHandlingAllowed: false,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
  }));
}

function buildRepairedProofToPaidAskRoom(workspace, session) {
  const proofRepairPacket = buildFirstCustomerEvidenceProofRepairPacket(workspace, session);
  const paidPreviewChoice = PAID_PACKET_PREVIEW_CHOICES["approve-preview"];
  const objectionRoutes = paidAskRoomObjectionRoutes();
  const selectedRoute = objectionRoutes.find((route) => route.id === "ready_to_discuss_paid_packet") || objectionRoutes[0];
  const blockedActions = paidAskRoomBlockedActions();

  return {
    format: REPAIRED_PROOF_TO_PAID_ASK_ROOM_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "local_sample_redacted_paid_ask_rehearsal_no_checkout_no_external_actions",
    queueItemId: "NORTHSTAR-REPAIRED-PROOF-TO-PAID-ASK-ROOM",
    appSurfacePath: "website/app.html#repaired-proof-to-paid-ask-room",
    adminSurfacePath: "website/admin.html#repaired-proof-to-paid-ask-room",
    sourceArtifacts: [
      { id: "proof_repair_packet", path: "ops/product/first-customer-evidence-proof-repair-packet.sample.json", state: "consumed_repaired_proof" },
      { id: "paid_packet_customer_preview", path: "ops/product/paid-packet-customer-preview.sample.json", state: "consumed_no_checkout_preview" },
      { id: "first_paid_decision_room", path: "ops/product/first-paid-decision-room.sample.json", state: "consumed_decision_room" },
      { id: "no_send_offer_brief", path: "ops/launch/first-paid-packet-no-send-offer-brief.md", state: "consumed_private_offer_copy" },
      { id: "fulfillment_boundary_drill", path: "ops/launch/first-paid-packet-fulfillment-boundary-drill.md", state: "consumed_boundary_drill" },
      { id: "business_controls", path: "ops/BUSINESS_CONTROLS.json", state: "controls_loaded" },
    ],
    proofDelta: proofRepairPacket.beforeAfterRepairCopy.map((copy) => ({
      id: copy.id,
      before: copy.before,
      after: copy.after,
      unsupportedClaimRemoved: copy.unsupportedClaimRemoved === true,
      sourceCustodyLabel: copy.sourceCustodyLabel,
    })),
    missingProofAsk: proofRepairPacket.safeFollowUpPrompts.map((prompt) => ({
      id: prompt.id,
      categoryId: prompt.categoryId,
      ask: prompt.prompt,
      allowedInput: prompt.allowedInput,
      forbiddenInput: prompt.forbiddenInput,
    })),
    paidPacket: {
      offerLabel: "Target Job Proof Packet",
      samplePriceUsd: 49,
      authorizedCapUsd: 99,
      checkoutAllowed: false,
      paymentLinkDisplayAllowed: false,
      paymentCollectionAllowed: false,
      deliverables: [
        "supported_claim_map",
        "missing_proof_questions",
        "risky_claim_warnings",
        "safer_bullet_direction",
        "approval_tracking_handoff",
        "operator_review_notes",
        "support_refund_owner_repair_ask",
      ],
      previewRoute: paidPreviewChoice.route,
    },
    supportRefundPaymentPosture: {
      paymentOwnerEvidenceStatus: "missing_owner_evidence",
      supportRefundStatus: "blocked_pending_owner_policy",
      taxMerchantOfRecordStatus: "blocked_pending_owner",
      customerDataFulfillmentStatus: "blocked_no_approved_path",
      finalGoNoGoStatus: "missing_final_owner",
      disabledPaymentState: {
        paymentLinkDisplay: false,
        checkoutDisplay: false,
        paymentCollection: false,
      },
    },
    privateOperatorHandoff: {
      state: "private_no_send_discussion_notes_ready",
      copy: "This packet would review the proof map, missing-proof questions, safer bullet direction, and approval handoff. Checkout, payment collection, production customer data, public proof, and outbound follow-up remain blocked until owner evidence exists.",
      noSend: true,
      noLivePaymentLink: true,
      noCustomerDataCollection: true,
    },
    objectionStates: objectionRoutes,
    selectedInternalRoute: selectedRoute,
    blockedExternalActions: blockedActions,
    claimControls: {
      sampleOrOwnerApprovedRedactedOnly: true,
      rawCustomerMaterialsExcluded: true,
      noPaymentLinks: true,
      noProviderCalls: true,
      noExternalActions: true,
      noCustomerDataHandling: true,
      noDownstreamQueueMutation: true,
      noDelegatedCompletionClaim: true,
      customerFeedbackClaim: false,
      willingnessToPayClaim: false,
      paymentIntentClaim: false,
      paymentClaim: false,
      publicProofClaim: false,
      testimonialReferralClaim: false,
      revenueClaim: false,
    },
    repoSafety: {
      sampleOrOwnerApprovedRedactedOnly: true,
      rawCustomerMaterialsExcluded: true,
      exactlyOneSelectedInternalRoute: true,
      noPaymentLinks: true,
      noProviderCalls: true,
      noExternalActions: true,
      noCustomerDataHandling: true,
      queueMutationAllowed: false,
      downstreamCompletionClaimAllowed: false,
      externalActionsPerformed: [],
      queueMutationsPerformed: [],
      blockedActions,
    },
  };
}

function repairedProofToPaidAskRoomMarkdown(room) {
  return [
    "# ProofResume Repaired Proof to Paid Ask Room",
    "",
    `Format: ${room.format}`,
    `Generated: ${room.generatedAt}`,
    "",
    "## Boundary",
    "- Local/sample-redacted rehearsal only.",
    "- No payment links, checkout, payment collection, provider calls, production customer-data handling, outreach, scheduling, public proof, auto-apply, form fill, application submission, downstream queue mutation, or revenue claim.",
    "",
    "## Selected Route",
    `- ${room.selectedInternalRoute.target} -> ${room.selectedInternalRoute.route}`,
    `- ${room.selectedInternalRoute.rationale}`,
    "",
    "## Proof Delta",
    ...room.proofDelta.map((copy) => `- ${copy.id}: ${copy.before} -> ${copy.after}`),
    "",
    "## Missing-Proof Asks",
    ...room.missingProofAsk.map((ask) => `- ${ask.id}: ${ask.ask}`),
    "",
    "## Paid Packet Deliverables",
    ...room.paidPacket.deliverables.map((deliverable) => `- ${deliverable}`),
    "",
    "## Objection Routes",
    ...room.objectionStates.map((route) => `- ${route.id}: ${route.route}`),
    "",
    "## Blocked Actions",
    ...Object.entries(room.blockedExternalActions).map(([key, value]) => `- ${key}: ${value}`),
    "",
  ].join("\n");
}

function paidAskOutcomeRouterBlockedActions() {
  return {
    deploy: false,
    outreachSend: false,
    scheduling: false,
    leadCapture: false,
    analyticsSend: false,
    providerMutation: false,
    paymentLinkDisplay: false,
    checkoutDisplay: false,
    paymentCollection: false,
    productionCustomerDataHandling: false,
    publicProof: false,
    testimonialRequest: false,
    referralRequest: false,
    customerFeedbackClaim: false,
    willingnessToPayClaim: false,
    paymentIntentClaim: false,
    paymentClaim: false,
    revenueClaim: false,
    employerContact: false,
    autoApply: false,
    formFill: false,
    applicationSubmission: false,
    downstreamQueueMutation: false,
    downstreamDoneClaim: false,
  };
}

function paidAskOutcomeRouterClaimFlags() {
  return {
    sampleReadiness: true,
    ownerApprovedRedactedEvidence: false,
    liveFeedback: false,
    willingnessToPay: false,
    paymentIntent: false,
    payment: false,
    publicProof: false,
    referralOrTestimonial: false,
    revenue: false,
  };
}

function paidAskOutcomeRouterCases() {
  return [
    {
      outcomeId: "missing_proof_or_packet_confusion",
      evidenceMode: "sample_readiness",
      routeFamily: "product_repair",
      target: "product",
      action: "product_paid_ask_packet_or_proof_repair",
      suggestedOwner: "Product Worker",
      acceptanceCriteria: "Repair proof explanation, packet mechanics, or approval controls before a paid ask is rehearsed again.",
      validationExpectation: "Router checker proves no downstream queue mutation, no live claim, and exactly one selected route.",
    },
    {
      outcomeId: "value_clear_no_send_follow_up",
      evidenceMode: "owner_approved_redacted_summary_required_for_live_use",
      routeFamily: "business_no_send_follow_up",
      target: "business",
      action: "business_post_proof_repair_paid_ask_no_send_follow_up",
      suggestedOwner: "Business Operator",
      acceptanceCriteria: "Prepare private no-send follow-up copy without checkout, payment links, outreach, scheduling, or customer-data handling.",
      validationExpectation: "Business handoff remains no-send and cannot claim willingness to pay, payment intent, payment, or revenue.",
    },
    {
      outcomeId: "price_support_threshold_unclear",
      evidenceMode: "sample_readiness",
      routeFamily: "strategy_threshold_update",
      target: "strategy",
      action: "strategy_first_paid_packet_threshold_update",
      suggestedOwner: "Strategy Worker",
      acceptanceCriteria: "Update price/support/refund or conversion thresholds before Product or Business treats the signal as actionable.",
      validationExpectation: "Strategy output separates curiosity from willingness-to-pay, payment intent, payment, public proof, and revenue.",
    },
    {
      outcomeId: "owner_gate_missing",
      evidenceMode: "sample_readiness",
      routeFamily: "approval_unblocker_owner_gate_repair",
      target: "approval_unblocker",
      action: "approval_unblocker_paid_ask_owner_gate_repair",
      suggestedOwner: "Approval Unblocker",
      acceptanceCriteria: "Ask only for the narrow missing owner evidence for customer-data, support/refund, payment, public-proof, deploy, analytics, or outreach gates.",
      validationExpectation: "Owner gate repair request contains no secrets, no payment data, no contact details, and no live action.",
    },
    {
      outcomeId: "claim_boundary_or_runtime_uncertain",
      evidenceMode: "sample_readiness",
      routeFamily: "qa_reviewer",
      target: "qa_reviewer",
      action: "qa_reviewer_paid_ask_claim_boundary_review",
      suggestedOwner: "QA / Reviewer",
      acceptanceCriteria: "Review route confidence, claim boundaries, and fixture coverage before any downstream owner treats the packet as ready.",
      validationExpectation: "QA/reviewer evidence checks unsupported traction and revenue claims remain false.",
    },
    {
      outcomeId: "reusable_router_pattern",
      evidenceMode: "sample_readiness",
      routeFamily: "commons_follow_up",
      target: "commons",
      action: "commons_paid_ask_outcome_router_pattern",
      suggestedOwner: "Commons Worker",
      acceptanceCriteria: "Extract a reusable fail-closed paid-ask outcome router pattern only after the local ProofResume contract is stable.",
      validationExpectation: "Commons pattern preserves sample/redacted-only inputs, exactly-one-route output, and no downstream mutation.",
    },
    {
      outcomeId: "thin_signal_keep_learning",
      evidenceMode: "sample_readiness",
      routeFamily: "keep_learning",
      target: "controller",
      action: "keep_learning_until_stronger_paid_ask_signal",
      suggestedOwner: "Controller",
      acceptanceCriteria: "Keep observing local or owner-approved redacted sessions until the outcome is strong enough for a specific owner route.",
      validationExpectation: "No queue is mutated and no delegated completion claim is made.",
    },
    {
      outcomeId: "duplicate_stale_revoked_or_no_fit",
      evidenceMode: "sample_readiness",
      routeFamily: "no_action",
      target: "controller",
      action: "no_action_duplicate_stale_revoked_or_no_fit_paid_ask_outcome",
      suggestedOwner: "Controller",
      acceptanceCriteria: "Record no action when evidence is duplicate, stale, revoked, unsafe, no-fit, or too thin to learn from.",
      validationExpectation: "Router packet stays repo-safe and produces no work item, external action, or done claim.",
    },
  ].map((route) => ({
    ...route,
    externalActionAllowed: false,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
    paymentOrCustomerDataHandlingAllowed: false,
    providerActionAllowed: false,
    mustNotMarkDelegatedWorkDone: true,
  }));
}

function buildPaidAskOutcomeRouter(workspace, session) {
  const scoreboard = buildFirstCustomerEvidenceRouteScoreboard(workspace, session);
  const proofRepairPacket = buildFirstCustomerEvidenceProofRepairPacket(workspace, session);
  const paidAskRoom = buildRepairedProofToPaidAskRoom(workspace, session);
  const routes = paidAskOutcomeRouterCases();
  const selectedRoute = routes.find((route) => route.routeFamily === "product_repair") || routes[0];
  const blockedActions = paidAskOutcomeRouterBlockedActions();
  const unsupportedClaimFlags = paidAskOutcomeRouterClaimFlags();

  return {
    format: PAID_ASK_OUTCOME_ROUTER_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "local_sample_redacted_paid_ask_outcome_router_no_external_actions",
    queueItemId: "NORTHSTAR-PAID-ASK-OUTCOME-ROUTER",
    appSurfacePath: "website/app.html#paid-ask-outcome-router",
    adminSurfacePath: "website/admin.html#paid-ask-outcome-router",
    consumedArtifacts: [
      { id: "paid_ask_room", path: "ops/product/repaired-proof-to-paid-ask-room.sample.json", state: paidAskRoom?.format ? "runtime_builder_available_fixture_optional" : "fallback_to_existing_fixtures" },
      { id: "evidence_route_scoreboard", path: "ops/product/first-customer-evidence-route-scoreboard.sample.json", state: "fallback_ready" },
      { id: "proof_repair_packet", path: "ops/product/first-customer-evidence-proof-repair-packet.sample.json", state: "fallback_ready" },
      { id: "first_paid_decision_room", path: "ops/product/first-paid-decision-room.sample.json", state: "fallback_ready" },
      { id: "first_paid_objection_repair_kit", path: "ops/product/first-paid-objection-repair-kit.sample.json", state: "fallback_ready" },
      { id: "commons_evidence_route_handoff_pattern", path: "commons/templates/first-customer-evidence-route-handoff/README.md", state: "pattern_reference_if_available" },
      { id: "business_controls", path: "ops/BUSINESS_CONTROLS.json", state: "controls_loaded" },
    ],
    routePacket: {
      evidenceMode: "sample_readiness",
      consentState: "sample_or_owner_approved_redacted_only",
      redactionState: "safe_labels_only_no_raw_customer_materials",
      fallbackUsed: true,
      selectedOutcomeId: selectedRoute.outcomeId,
      selectedRouteFamily: selectedRoute.routeFamily,
      selectedAction: selectedRoute.action,
      suggestedOwner: selectedRoute.suggestedOwner,
      acceptanceCriteria: selectedRoute.acceptanceCriteria,
      validationExpectation: selectedRoute.validationExpectation,
      blockedGates: unique([
        ...(scoreboard.claimControls?.blockedExternalGates || []),
        "payment_authority",
        "support_refund_policy",
        "customer_data_authority",
        "public_proof_consent",
        "deploy_gate",
        "analytics_gate",
        "outreach_gate",
        "final_go_no_go",
      ]),
      unsupportedClaimFlags,
    },
    outcomeRoutes: routes.map((route) => ({
      ...route,
      selected: route.routeFamily === selectedRoute.routeFamily,
    })),
    selectedRoute: {
      ...selectedRoute,
      selected: true,
      rationale:
        "The current sample falls back to the evidence route scoreboard and proof-repair packet; proof and packet clarity should be repaired before any Business or owner-gate action treats the paid ask as live evidence.",
    },
    evidenceStateLegend: {
      sampleReadiness: "Local fixture or browser-local rehearsal readiness only.",
      ownerApprovedRedactedEvidence: "Allowed only after owner-approved redacted session evidence exists.",
      liveFeedback: "False until a real authorized customer session is observed and redacted.",
      willingnessToPay: "False until a real prospect expresses it under an approved evidence contract.",
      paymentIntent: "False until a payment-intent event is observed through an approved provider path.",
      payment: "False until payment is collected through an approved provider path.",
      publicProof: "False until explicit public-proof consent exists.",
      referralOrTestimonial: "False until explicit testimonial/referral consent exists.",
      revenue: "False until payment evidence exists and is recorded.",
    },
    blockedExternalActions: blockedActions,
    claimControls: {
      sampleOrOwnerApprovedRedactedOnly: true,
      safeLabelsOnly: true,
      exactlyOneSelectedRoute: true,
      noDownstreamQueueMutation: true,
      noDelegatedCompletionClaim: true,
      noExternalActions: true,
      noPaymentOrCustomerDataHandling: true,
      unsupportedClaimFlags,
    },
    repoSafety: {
      sampleOrOwnerApprovedRedactedOnly: true,
      safeLabelsOnly: true,
      rawCustomerMaterialsExcluded: true,
      exactlyOneSelectedRoute: true,
      noExternalActions: true,
      queueMutationAllowed: false,
      downstreamCompletionClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      externalActionsPerformed: [],
      queueMutationsPerformed: [],
      blockedActions,
    },
  };
}

function paidAskOutcomeRouterMarkdown(router) {
  return [
    "# ProofResume Paid Ask Outcome Router",
    "",
    `Format: ${router.format}`,
    `Generated: ${router.generatedAt}`,
    "",
    "## Boundary",
    "- Local/sample-redacted paid-ask outcome routing only.",
    "- No downstream queue mutation, delegated done claim, payment/customer-data handling, provider call, outreach, deploy, analytics, public proof, referral/testimonial request, auto-apply, form fill, application submission, or revenue claim.",
    "",
    "## Route Packet",
    `- Evidence mode: ${router.routePacket.evidenceMode}`,
    `- Consent/redaction: ${router.routePacket.consentState} / ${router.routePacket.redactionState}`,
    `- Selected: ${router.routePacket.selectedRouteFamily} -> ${router.routePacket.selectedAction}`,
    `- Suggested owner: ${router.routePacket.suggestedOwner}`,
    `- Acceptance: ${router.routePacket.acceptanceCriteria}`,
    `- Validation: ${router.routePacket.validationExpectation}`,
    "",
    "## Outcome Routes",
    ...router.outcomeRoutes.map((route) => `- ${route.selected ? "Selected: " : ""}${route.routeFamily} -> ${route.action}`),
    "",
    "## Evidence States",
    ...Object.entries(router.evidenceStateLegend).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Unsupported Claim Flags",
    ...Object.entries(router.routePacket.unsupportedClaimFlags).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Blocked Gates",
    ...router.routePacket.blockedGates.map((gate) => `- ${gate}`),
    "",
  ].join("\n");
}

function paidAskProofPacketClarityRepairs() {
  return [
    {
      id: "proof_delta_explanation",
      label: "Proof delta explanation",
      sourceArtifact: "ops/product/repaired-proof-to-paid-ask-room.sample.json",
      before: "The packet lists repaired bullets but does not explain why each change is safer.",
      after: "Each repaired bullet names the unsupported claim removed, the safe source label used, and the candidate-owned proof still needed before live use.",
      approvalState: "candidate_review_required",
      blocksLiveClaim: true,
    },
    {
      id: "paid_packet_mechanics",
      label: "Paid packet mechanics",
      sourceArtifact: "ops/product/repaired-proof-to-paid-ask-room.sample.json",
      before: "The paid packet offer can sound like a checkout-ready service.",
      after: "The packet is framed as a no-send rehearsal of deliverables: proof map, missing-proof questions, safer bullet direction, approval handoff, and operator notes.",
      approvalState: "no_checkout_display_allowed",
      blocksLiveClaim: true,
    },
    {
      id: "approval_controls",
      label: "Approval controls",
      sourceArtifact: "ops/product/first-customer-evidence-proof-repair-packet.sample.json",
      before: "Approval state is visible but not grouped by paid-packet readiness.",
      after: "Approval controls are grouped into claim accuracy, source custody, packet scope, support/refund posture, payment authority, customer-data consent, public proof consent, and final go/no-go.",
      approvalState: "operator_review_only",
      blocksLiveClaim: true,
    },
    {
      id: "support_refund_payment_stop_copy",
      label: "Support, refund, and payment stop copy",
      sourceArtifact: "ops/BUSINESS_CONTROLS.json",
      before: "Support/refund/payment questions are blocked, but the stop reason is easy to miss.",
      after: "Support, refund, tax/MoR, payment link, checkout, payment collection, and payment-intent states are explicitly blocked until owner evidence exists.",
      approvalState: "owner_policy_required",
      blocksLiveClaim: true,
    },
    {
      id: "customer_data_stop_copy",
      label: "Customer-data stop copy",
      sourceArtifact: "ops/BUSINESS_CONTROLS.json",
      before: "The paid packet can be misunderstood as a production resume intake path.",
      after: "The repair repeats that sample or owner-approved redacted labels are allowed, while production resume/customer data requires consent, deletion, support, and approved storage path.",
      approvalState: "customer_data_authority_required",
      blocksLiveClaim: true,
    },
    {
      id: "operator_next_route_wording",
      label: "Operator next-route wording",
      sourceArtifact: "ops/product/paid-ask-outcome-router.sample.json",
      before: "The Product repair route does not say what safe next packet is emitted after repair.",
      after: "The repair emits exactly one no-send, no-checkout route packet for private operator review; it does not mutate Business, Strategy, Commons, QA, or Approval Unblocker queues.",
      approvalState: "route_packet_ready_no_downstream_mutation",
      blocksLiveClaim: true,
    },
  ];
}

function paidAskProofPacketApprovalControls() {
  return [
    ["claim_accuracy", "Every repaired claim needs candidate-visible accuracy review before use."],
    ["source_custody", "Every sentence needs a safe source label; raw customer material remains excluded."],
    ["packet_scope", "Deliverables are proof map, missing-proof questions, safer bullet direction, approval handoff, and operator notes."],
    ["support_refund_policy", "Support, refund, revision scope, tax, and merchant owner remain blocked until owner policy exists."],
    ["payment_authority", "Payment links, checkout, payment collection, and payment-intent claims remain disabled."],
    ["customer_data_authority", "Production resume/customer-data handling requires consent, deletion path, support contact, and approved storage."],
    ["public_proof_consent", "Public proof, testimonials, referrals, screenshots, and case-study claims require separate consent."],
    ["final_go_no_go", "No live feedback, willingness-to-pay, payment, public-proof, or revenue claim can be inferred from this sample."],
  ].map(([id, repair]) => ({
    id,
    repair,
    requiredBeforeLiveUse: true,
    approvedForSampleRehearsal: true,
    externalActionAllowed: false,
    paymentOrCustomerDataHandlingAllowed: false,
  }));
}

function buildPaidAskProofPacketClarityRepair(workspace, session) {
  const router = buildPaidAskOutcomeRouter(workspace, session);
  const paidAskRoom = buildRepairedProofToPaidAskRoom(workspace, session);
  const proofRepairPacket = buildFirstCustomerEvidenceProofRepairPacket(workspace, session);
  const blockedActions = paidAskOutcomeRouterBlockedActions();
  const unsupportedClaimFlags = paidAskOutcomeRouterClaimFlags();
  const selectedSourceRoute = router.selectedRoute || {};
  const repairs = paidAskProofPacketClarityRepairs();
  const approvalControls = paidAskProofPacketApprovalControls();
  const safeNextRoutePacket = {
    evidenceMode: "sample_readiness",
    consentState: "sample_or_owner_approved_redacted_only",
    redactionState: "safe_labels_only_no_raw_customer_materials",
    selectedRouteFamily: "business_no_send_follow_up",
    selectedAction: "business_private_paid_packet_discussion_no_checkout",
    suggestedOwner: "Business Operator",
    acceptanceCriteria: "Prepare private no-send discussion notes from this repaired packet without checkout, payment links, outreach, scheduling, production customer-data handling, live claims, or queue mutation.",
    validationExpectation: "Clarity repair checker proves exactly one safe next route, no downstream mutation, and all live/revenue states remain false.",
    selected: true,
    externalActionAllowed: false,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
    paymentOrCustomerDataHandlingAllowed: false,
    providerActionAllowed: false,
    mustNotMarkDelegatedWorkDone: true,
  };

  return {
    format: PAID_ASK_PROOF_PACKET_CLARITY_REPAIR_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "local_sample_redacted_paid_ask_proof_packet_clarity_repair_no_checkout_no_external_actions",
    queueItemId: "NORTHSTAR-PAID-ASK-PROOF-PACKET-CLARITY-REPAIR",
    appSurfacePath: "website/app.html#paid-ask-proof-packet-clarity-repair",
    adminSurfacePath: "website/admin.html#paid-ask-proof-packet-clarity-repair",
    consumedArtifacts: [
      { id: "paid_ask_outcome_router", path: "ops/product/paid-ask-outcome-router.sample.json", state: selectedSourceRoute.action === "product_paid_ask_packet_or_proof_repair" ? "consumed_selected_product_repair_route" : "blocked_route_mismatch" },
      { id: "repaired_proof_to_paid_ask_room", path: "ops/product/repaired-proof-to-paid-ask-room.sample.json", state: paidAskRoom?.format ? "consumed_repaired_paid_ask_room" : "fallback_required" },
      { id: "proof_repair_packet", path: "ops/product/first-customer-evidence-proof-repair-packet.sample.json", state: proofRepairPacket?.format ? "consumed_proof_repair_packet" : "fallback_required" },
      { id: "business_controls", path: "ops/BUSINESS_CONTROLS.json", state: "controls_loaded" },
    ],
    selectedSourceRoute: {
      outcomeId: selectedSourceRoute.outcomeId || "missing_proof_or_packet_confusion",
      routeFamily: selectedSourceRoute.routeFamily || "product_repair",
      action: selectedSourceRoute.action || "product_paid_ask_packet_or_proof_repair",
      target: selectedSourceRoute.target || "product",
      consumed: selectedSourceRoute.action === "product_paid_ask_packet_or_proof_repair",
    },
    clarityRepairs: repairs,
    proofExplanationRepair: {
      proofDeltaCount: paidAskRoom.proofDelta?.length || 0,
      missingProofAskCount: paidAskRoom.missingProofAsk?.length || 0,
      missingProofCategoryCount: proofRepairPacket.missingProofCategories?.length || 0,
      unsupportedClaimsRemoved: repairs.every((repair) => repair.blocksLiveClaim === true),
      explanation: "The repaired packet explains what changed, why unsupported claims were removed, which safe source label supports each claim, and what candidate-owned proof is still missing.",
    },
    paidPacketMechanicsRepair: {
      offerLabel: paidAskRoom.paidPacket?.offerLabel || "Target Job Proof Packet",
      checkoutAllowed: false,
      paymentLinkDisplayAllowed: false,
      paymentCollectionAllowed: false,
      deliverables: paidAskRoom.paidPacket?.deliverables || [],
      explanation: "The paid packet remains a local no-send rehearsal of scope and deliverables, not a checkout-ready or production-intake offer.",
    },
    approvalControls,
    stopCopy: {
      supportRefundPayment: "Support, refund, tax/MoR, payment link, checkout, payment collection, and payment-intent claims stay blocked until owner evidence and final go/no-go exist.",
      customerData: "Production resume/customer-data handling stays blocked until consent, deletion path, support contact, and approved storage path exist.",
      publicProof: "Testimonials, referrals, public proof, screenshots, quotes, and case-study claims require separate explicit consent.",
      outboundAndApply: "Outreach, scheduling, employer contact, form fill, auto-apply, and application submission remain disabled.",
    },
    safeNextRoutePacket,
    blockedExternalActions: blockedActions,
    claimControls: {
      sampleOrOwnerApprovedRedactedOnly: true,
      safeLabelsOnly: true,
      exactlyOneSelectedRoute: true,
      exactlyOneSafeNextRoute: true,
      noDownstreamQueueMutation: true,
      noDelegatedCompletionClaim: true,
      noExternalActions: true,
      noPaymentLinkOrCheckoutDisplay: true,
      noPaymentOrCustomerDataHandling: true,
      unsupportedClaimFlags,
    },
    repoSafety: {
      sampleOrOwnerApprovedRedactedOnly: true,
      rawCustomerMaterialsExcluded: true,
      safeLabelsOnly: true,
      exactlyOneSelectedRoute: true,
      exactlyOneSafeNextRoute: true,
      falseUnsupportedClaims: true,
      noExternalActions: true,
      noPaymentLinkOrCheckoutDisplay: true,
      queueMutationAllowed: false,
      downstreamCompletionClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      externalActionsPerformed: [],
      queueMutationsPerformed: [],
      blockedActions,
    },
  };
}

function paidAskProofPacketClarityRepairMarkdown(repair) {
  return [
    "# ProofResume Paid Ask Proof Packet Clarity Repair",
    "",
    `Format: ${repair.format}`,
    `Generated: ${repair.generatedAt}`,
    "",
    "## Boundary",
    "- Local/sample-redacted Product repair only.",
    "- No payment link, checkout, payment collection, production customer-data handling, provider call, outreach, deploy, analytics, public proof, testimonial/referral request, employer contact, auto-apply, form fill, application submission, downstream queue mutation, delegated done claim, or live traction/revenue claim.",
    "",
    "## Consumed Route",
    `- ${repair.selectedSourceRoute.routeFamily} -> ${repair.selectedSourceRoute.action}; consumed: ${repair.selectedSourceRoute.consumed}`,
    "",
    "## Repairs",
    ...repair.clarityRepairs.map((item) => `- ${item.label}: ${item.after}`),
    "",
    "## Approval Controls",
    ...repair.approvalControls.map((control) => `- ${control.id}: ${control.repair}`),
    "",
    "## Stop Copy",
    ...Object.entries(repair.stopCopy).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Safe Next Route Packet",
    `- Selected: ${repair.safeNextRoutePacket.selectedRouteFamily} -> ${repair.safeNextRoutePacket.selectedAction}`,
    `- Owner: ${repair.safeNextRoutePacket.suggestedOwner}`,
    `- Acceptance: ${repair.safeNextRoutePacket.acceptanceCriteria}`,
    `- Validation: ${repair.safeNextRoutePacket.validationExpectation}`,
    "",
    "## Unsupported Claim Flags",
    ...Object.entries(repair.claimControls.unsupportedClaimFlags).map(([key, value]) => `- ${key}: ${value}`),
    "",
  ].join("\n");
}

function paidAskObjectionResponseStates() {
  return [
    {
      id: "value_understood",
      label: "Value understood",
      sampleObjection: "I see why the proof-backed packet is useful, but I am not ready for checkout.",
      operatorSafeResponseCopy: "Keep the conversation private and no-send: recap the proof delta, ask what would make the packet worth a paid pilot, and do not show checkout or claim payment intent.",
      productRepairCue: "Show the value receipt beside the repaired proof and make the no-checkout boundary harder to miss.",
      evidenceState: "sample_readiness_not_willingness_to_pay",
      firstBlockingGate: "payment_owner_go_no_go",
      nextRoute: {
        routeFamily: "business_no_send_follow_up",
        target: "business",
        action: "business_private_value_understood_follow_up_no_checkout",
        suggestedOwner: "Business Operator",
      },
    },
    {
      id: "missing_proof",
      label: "Missing proof",
      sampleObjection: "The packet sounds plausible, but I do not see enough proof for the strongest bullet.",
      operatorSafeResponseCopy: "Acknowledge the gap, point to the unsupported claim removed, and ask only for candidate-owned proof labels before any live use.",
      productRepairCue: "Route back to proof explanation and missing-proof prompts before another paid ask rehearsal.",
      evidenceState: "sample_readiness_product_repair_required",
      firstBlockingGate: "candidate_owned_proof_missing",
      nextRoute: {
        routeFamily: "product_repair",
        target: "product",
        action: "product_missing_proof_response_repair",
        suggestedOwner: "Product Worker",
      },
    },
    {
      id: "trust_privacy",
      label: "Trust and privacy",
      sampleObjection: "I am worried about where my resume and proof would go.",
      operatorSafeResponseCopy: "Repeat that this sample is local/redacted only, production data needs consent, deletion path, support contact, and approved storage, and no live intake occurs here.",
      productRepairCue: "Strengthen customer-data stop copy and consent/deletion visibility.",
      evidenceState: "sample_readiness_customer_data_authority_required",
      firstBlockingGate: "customer_data_authority",
      nextRoute: {
        routeFamily: "approval_unblocker_owner_gate_repair",
        target: "approval_unblocker",
        action: "approval_unblocker_customer_data_privacy_gate_repair",
        suggestedOwner: "Approval Unblocker",
      },
    },
    {
      id: "price",
      label: "Price",
      sampleObjection: "The price might be too high for what I understand so far.",
      operatorSafeResponseCopy: "Do not negotiate or claim willingness to pay; capture the concern as a sample threshold input and keep checkout/payment disabled.",
      productRepairCue: "Clarify deliverable scope and value threshold before another paid-packet rehearsal.",
      evidenceState: "sample_readiness_not_price_validation",
      firstBlockingGate: "price_threshold_unclear",
      nextRoute: {
        routeFamily: "strategy_threshold_update",
        target: "strategy",
        action: "strategy_paid_packet_price_threshold_update",
        suggestedOwner: "Strategy Worker",
      },
    },
    {
      id: "support_refund",
      label: "Support and refund",
      sampleObjection: "What happens if the packet does not help or I need changes?",
      operatorSafeResponseCopy: "Stop at owner policy: support, revision, refund, tax, and merchant-owner terms are not approved in this local sample.",
      productRepairCue: "Keep support/refund stop copy visible next to paid packet mechanics.",
      evidenceState: "sample_readiness_support_policy_required",
      firstBlockingGate: "support_refund_policy",
      nextRoute: {
        routeFamily: "approval_unblocker_owner_gate_repair",
        target: "approval_unblocker",
        action: "approval_unblocker_support_refund_policy_repair",
        suggestedOwner: "Approval Unblocker",
      },
    },
    {
      id: "customer_data_stop",
      label: "Customer-data stop",
      sampleObjection: "Can I upload my real resume for the paid packet now?",
      operatorSafeResponseCopy: "No production resume intake happens in this route; use only sample or owner-approved redacted labels until consent, deletion, support, and storage are approved.",
      productRepairCue: "Make the paid packet handoff distinguish local rehearsal from production customer-data handling.",
      evidenceState: "sample_readiness_production_customer_data_blocked",
      firstBlockingGate: "production_customer_data_handling",
      nextRoute: {
        routeFamily: "approval_unblocker_owner_gate_repair",
        target: "approval_unblocker",
        action: "approval_unblocker_customer_data_path_repair",
        suggestedOwner: "Approval Unblocker",
      },
    },
    {
      id: "payment_owner_stop",
      label: "Payment-owner stop",
      sampleObjection: "Can you send the payment link so I can decide?",
      operatorSafeResponseCopy: "Do not display a payment link or checkout; payment owner, support/refund policy, tax/MoR, and final go/no-go evidence are still missing.",
      productRepairCue: "Show payment authority as the first blocking gate before any payment-intent language appears.",
      evidenceState: "sample_readiness_payment_authority_required",
      firstBlockingGate: "payment_authority",
      nextRoute: {
        routeFamily: "approval_unblocker_owner_gate_repair",
        target: "approval_unblocker",
        action: "approval_unblocker_payment_owner_gate_repair",
        suggestedOwner: "Approval Unblocker",
      },
    },
    {
      id: "no_fit",
      label: "No fit",
      sampleObjection: "This is not the kind of help I need.",
      operatorSafeResponseCopy: "Record no-fit as a sample-only learning label; do not create follow-up work, outreach, public proof, or revenue claims.",
      productRepairCue: "Preserve the no-fit reason for future positioning review without treating it as traction.",
      evidenceState: "sample_readiness_no_fit",
      firstBlockingGate: "no_fit_or_unsafe_to_route",
      nextRoute: {
        routeFamily: "no_action",
        target: "controller",
        action: "no_action_no_fit_paid_ask_response",
        suggestedOwner: "Controller",
      },
    },
    {
      id: "no_action",
      label: "No action",
      sampleObjection: "No response or too little signal to learn from.",
      operatorSafeResponseCopy: "Do not infer feedback, demand, payment intent, or next work from silence; keep learning until stronger redacted evidence exists.",
      productRepairCue: "Keep the route fail-closed when signal is absent, stale, duplicate, revoked, or unsafe.",
      evidenceState: "sample_readiness_too_thin",
      firstBlockingGate: "insufficient_signal",
      nextRoute: {
        routeFamily: "keep_learning",
        target: "controller",
        action: "keep_learning_until_stronger_paid_ask_objection_signal",
        suggestedOwner: "Controller",
      },
    },
  ].map((state) => ({
    ...state,
    nextRoute: {
      ...state.nextRoute,
      selected: true,
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
      acceptanceCriteria: "Use this response only as local/sample rehearsal guidance; do not create downstream work unless the controller opens a separate queue item.",
      validationExpectation: "Checker proves exactly one internal route for this objection and no live/payment/revenue/public-proof claim.",
    },
  }));
}

function buildPaidAskObjectionResponseSimulator(workspace, session) {
  const clarityRepair = buildPaidAskProofPacketClarityRepair(workspace, session);
  const router = buildPaidAskOutcomeRouter(workspace, session);
  const scoreboard = buildFirstCustomerEvidenceRouteScoreboard(workspace, session);
  const objectionStates = paidAskObjectionResponseStates();
  const blockedActions = paidAskOutcomeRouterBlockedActions();
  const unsupportedClaimFlags = paidAskOutcomeRouterClaimFlags();
  const selectedObjection = objectionStates.find((state) => state.id === "missing_proof") || objectionStates[0];

  return {
    format: PAID_ASK_OBJECTION_RESPONSE_SIMULATOR_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "local_sample_redacted_paid_ask_objection_response_simulator_no_external_actions",
    queueItemId: "NORTHSTAR-PAID-ASK-OBJECTION-RESPONSE-SIMULATOR",
    appSurfacePath: "website/app.html#paid-ask-objection-response-simulator",
    adminSurfacePath: "website/admin.html#paid-ask-objection-response-simulator",
    consumedArtifacts: [
      { id: "paid_ask_proof_packet_clarity_repair", path: "ops/product/paid-ask-proof-packet-clarity-repair.sample.json", state: clarityRepair?.format ? "consumed_clarity_repair" : "fallback_required" },
      { id: "paid_ask_outcome_router", path: "ops/product/paid-ask-outcome-router.sample.json", state: router?.format ? "consumed_outcome_router" : "fallback_required" },
      { id: "first_customer_evidence_route_scoreboard", path: "ops/product/first-customer-evidence-route-scoreboard.sample.json", state: scoreboard?.format ? "consumed_route_scoreboard" : "fallback_required" },
      { id: "business_controls", path: "ops/BUSINESS_CONTROLS.json", state: "controls_loaded" },
    ],
    selectedObjectionId: selectedObjection.id,
    selectedObjectionRoute: selectedObjection.nextRoute,
    objectionStates,
    responseCopy: objectionStates.map((state) => ({
      id: state.id,
      label: state.label,
      operatorSafeResponseCopy: state.operatorSafeResponseCopy,
      productRepairCue: state.productRepairCue,
      firstBlockingGate: state.firstBlockingGate,
      routeFamily: state.nextRoute.routeFamily,
      action: state.nextRoute.action,
    })),
    evidenceStateBoundary: {
      sampleReadinessOnly: true,
      liveCustomerFeedback: false,
      willingnessToPay: false,
      paymentIntent: false,
      payment: false,
      publicProof: false,
      testimonialOrReferral: false,
      revenue: false,
      note: "Sample objection rehearsal cannot be promoted into customer signal, payment intent, payment, public proof, testimonial/referral, or revenue evidence.",
    },
    blockedExternalActions: blockedActions,
    claimControls: {
      sampleOrOwnerApprovedRedactedOnly: true,
      safeLabelsOnly: true,
      allExamplesSampleRedactedOnly: true,
      exactlyOneRoutePerObjection: objectionStates.every((state) => state.nextRoute.selected === true),
      noDownstreamQueueMutation: true,
      noDelegatedCompletionClaim: true,
      noExternalActions: true,
      noPaymentLinkOrCheckoutDisplay: true,
      noPaymentOrCustomerDataHandling: true,
      unsupportedClaimFlags,
    },
    repoSafety: {
      sampleOrOwnerApprovedRedactedOnly: true,
      rawCustomerMaterialsExcluded: true,
      safeLabelsOnly: true,
      exactlyOneRoutePerObjection: true,
      noExternalActions: true,
      noPaymentLinkOrCheckoutDisplay: true,
      queueMutationAllowed: false,
      downstreamCompletionClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      externalActionsPerformed: [],
      queueMutationsPerformed: [],
      blockedActions,
    },
  };
}

function paidAskObjectionResponseSimulatorMarkdown(simulator) {
  return [
    "# ProofResume Paid Ask Objection Response Simulator",
    "",
    `Format: ${simulator.format}`,
    `Generated: ${simulator.generatedAt}`,
    "",
    "## Boundary",
    "- Local/sample-redacted objection rehearsal only.",
    "- No checkout, payment link, payment collection, production customer-data handling, provider call, outreach, deploy, analytics, public proof, testimonial/referral request, employer contact, auto-apply, form fill, application submission, downstream queue mutation, delegated done claim, live feedback claim, willingness-to-pay claim, payment-intent claim, payment claim, public-proof claim, or revenue claim.",
    "",
    "## Selected Sample",
    `- ${simulator.selectedObjectionId}: ${simulator.selectedObjectionRoute.routeFamily} -> ${simulator.selectedObjectionRoute.action}`,
    "",
    "## Objection Responses",
    ...simulator.objectionStates.map((state) => `- ${state.label}: ${state.operatorSafeResponseCopy} Route: ${state.nextRoute.routeFamily} -> ${state.nextRoute.action}. Gate: ${state.firstBlockingGate}.`),
    "",
    "## Evidence Boundary",
    ...Object.entries(simulator.evidenceStateBoundary).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Unsupported Claim Flags",
    ...Object.entries(simulator.claimControls.unsupportedClaimFlags).map(([key, value]) => `- ${key}: ${value}`),
    "",
  ].join("\n");
}

function firstPaidPilotHandoffOwnerFields() {
  return [
    "payment_owner_label",
    "support_refund_policy_status",
    "tax_merchant_of_record_owner",
    "customer_data_fulfillment_path",
    "display_scope",
    "first_customer_consent_rule",
    "public_proof_consent_status",
    "final_go_no_go_owner",
    "first_stop_condition_to_recheck",
  ];
}

function buildFirstPaidPilotHandoffRoom(workspace, session) {
  const clarityRepair = buildPaidAskProofPacketClarityRepair(workspace, session);
  const paidAskRoom = buildRepairedProofToPaidAskRoom(workspace, session);
  const decisionRoom = { format: "proofresume-first-paid-decision-room-v1" };
  const blockedActions = paidAskOutcomeRouterBlockedActions();
  const ownerFields = firstPaidPilotHandoffOwnerFields();
  const valueItems = [
    "supported claim map",
    "missing-proof questions",
    "risky-claim warnings",
    "safer bullet direction",
    "candidate approval handoff",
    "operator review notes",
    "fulfillment receipt rehearsal",
  ];
  const goNoGoPacket = {
    routeId: "owner_first_paid_pilot_go_no_go_packet",
    selected: true,
    suggestedOwner: "Owner / Approval Unblocker",
    evidenceMode: "sample_readiness_or_owner_approved_redacted_only",
    consentState: "candidate_and_owner_consent_required_before_live_use",
    redactionState: "safe_labels_only_no_raw_customer_materials",
    ownerFields,
    acceptanceCriteria:
      "Owner can approve, reject, or repair the first paid pilot only after payment, customer-data, support/refund, consent, display, public-proof, and final go/no-go fields are answered outside repo-visible secrets.",
    validationExpectation:
      "Checker proves exactly one owner go/no-go packet, all live/payment/customer-data gates closed, no downstream mutation, and no revenue or traction claim.",
    externalActionAllowed: false,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
    paymentOrCustomerDataHandlingAllowed: false,
    providerActionAllowed: false,
    checkoutAllowed: false,
    paymentLinkDisplayAllowed: false,
    paymentCollectionAllowed: false,
    productionCustomerDataHandlingAllowed: false,
    publicProofAllowed: false,
  };

  return {
    format: FIRST_PAID_PILOT_HANDOFF_ROOM_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "local_sample_redacted_first_paid_pilot_handoff_no_checkout_no_external_actions",
    queueItemId: "NORTHSTAR-FIRST-PAID-PILOT-HANDOFF-ROOM",
    appSurfacePath: "website/app.html#first-paid-pilot-handoff-room",
    adminSurfacePath: "website/admin.html#first-paid-pilot-handoff-room",
    consumedArtifacts: [
      { id: "paid_ask_proof_packet_clarity_repair", path: "ops/product/paid-ask-proof-packet-clarity-repair.sample.json", state: clarityRepair?.format ? "consumed_clarity_repair" : "fallback_required" },
      { id: "repaired_proof_to_paid_ask_room", path: "ops/product/repaired-proof-to-paid-ask-room.sample.json", state: paidAskRoom?.format ? "consumed_repaired_paid_ask_room" : "fallback_required" },
      { id: "first_paid_decision_room", path: "ops/product/first-paid-decision-room.sample.json", state: decisionRoom?.format ? "consumed_decision_room" : "fallback_required" },
      { id: "first_paid_customer_data_fulfillment_decision", path: "ops/payments/first-paid-customer-data-fulfillment-decision.md", state: "referenced_local_first_customer_controlled_path" },
      { id: "business_controls", path: "ops/BUSINESS_CONTROLS.json", state: "controls_loaded" },
      { id: "business_post_proof_no_send_packet", path: "ops/launch/post-proof-repair-paid-ask-no-send.sample.json", state: "consume_if_present_else_pending" },
    ],
    pilotValue: valueItems,
    proofDelta: {
      repairedBulletCount: paidAskRoom.proofDelta?.length || 0,
      missingProofAskCount: paidAskRoom.missingProofAsk?.length || 0,
      unsupportedClaimsRemoved: true,
      summary: "The pilot handoff shows what changed, what proof is still missing, and which safer packet deliverables can be reviewed without claiming outcomes.",
    },
    missingProof: paidAskRoom.missingProofAsk || [],
    deliverables: [
      ...(clarityRepair.paidPacketMechanicsRepair?.deliverables || []),
      "owner_go_no_go_packet",
      "first_paid_fulfillment_receipt_rehearsal",
    ],
    approvalState: {
      candidateReviewRequired: true,
      ownerGoNoGoRequired: true,
      supportRefundPolicyRequired: true,
      paymentAuthorityRequired: true,
      customerDataConsentRequired: true,
      publicProofConsentRequired: true,
      approvedForSampleRehearsal: true,
      liveActionAuthorized: false,
    },
    gates: {
      payment: "blocked_no_payment_link_or_checkout_display",
      customerData: "blocked_no_production_customer_data_handling",
      supportRefund: "blocked_pending_owner_policy",
      publicProof: "blocked_separate_consent_required",
      deploy: "blocked_no_public_deploy_action",
      outreachScheduling: "blocked_no_send_no_schedule",
      analyticsProvider: "blocked_no_analytics_or_provider_mutation",
      applications: "blocked_no_employer_contact_auto_apply_form_fill_or_submission",
    },
    ownerGoNoGoPacket: goNoGoPacket,
    blockedExternalActions: blockedActions,
    unsupportedClaims: {
      customerFeedbackObserved: false,
      willingnessToPayObserved: false,
      paymentIntentObserved: false,
      paymentObserved: false,
      paidCustomerObserved: false,
      publicProofObserved: false,
      testimonialPermissionObserved: false,
      referralPermissionObserved: false,
      revenueObserved: false,
      liveCustomerSessionObserved: false,
      productionPaidPilotAuthorized: false,
    },
    repoSafety: {
      sampleOrOwnerApprovedRedactedOnly: true,
      safeLabelsOnly: true,
      rawCustomerMaterialsExcluded: true,
      exactlyOneOwnerGoNoGoPacket: true,
      exactlyOneSelectedRoute: true,
      noExternalActions: true,
      noPaymentLinkOrCheckoutDisplay: true,
      noPaymentOrCustomerDataHandling: true,
      noProviderCalls: true,
      noUnsupportedLiveOrRevenueClaims: true,
      queueMutationAllowed: false,
      downstreamCompletionClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      externalActionsPerformed: [],
      queueMutationsPerformed: [],
    },
  };
}

function firstPaidPilotHandoffRoomMarkdown(room) {
  return [
    "# ProofResume First Paid Pilot Handoff Room",
    "",
    `Format: ${room.format}`,
    `Generated: ${room.generatedAt}`,
    "",
    "## Boundary",
    "- Local/sample-redacted owner handoff only.",
    "- No checkout, payment link, payment collection, production customer data, provider call, deploy, outreach, scheduling, analytics, public proof, employer contact, auto-apply, form fill, application submission, downstream queue mutation, delegated done claim, or revenue/traction claim.",
    "",
    "## Consumed Sources",
    ...room.consumedArtifacts.map((artifact) => `- ${artifact.id}: ${artifact.state} (${artifact.path})`),
    "",
    "## Pilot Value",
    ...room.pilotValue.map((item) => `- ${item}`),
    "",
    "## Proof Delta",
    `- Repaired bullets: ${room.proofDelta.repairedBulletCount}`,
    `- Missing proof asks: ${room.proofDelta.missingProofAskCount}`,
    `- ${room.proofDelta.summary}`,
    "",
    "## Deliverables",
    ...room.deliverables.map((item) => `- ${item}`),
    "",
    "## Owner Go/No-Go Packet",
    `- Route: ${room.ownerGoNoGoPacket.routeId}`,
    `- Owner: ${room.ownerGoNoGoPacket.suggestedOwner}`,
    ...room.ownerGoNoGoPacket.ownerFields.map((field) => `- Field: ${field}`),
    "",
    "## Closed Gates",
    ...Object.entries(room.gates).map(([key, value]) => `- ${key}: ${value}`),
    "",
  ].join("\n");
}

function firstDollarRoutePackets() {
  const routeDefaults = {
    externalActionAllowed: false,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
    paymentOrCustomerDataHandlingAllowed: false,
    providerActionAllowed: false,
    mustNotMarkDelegatedWorkDone: true,
  };

  return [
    {
      routeId: "approval_unblocker_first_dollar_owner_evidence_repair",
      routeFamily: "approval_unblocker_owner_gate_repair",
      selected: true,
      suggestedOwner: "Approval Unblocker",
      action: "repair_first_dollar_owner_evidence",
      reason:
        "First dollar readiness cannot move to live payment, customer-data, support/refund, or public-proof work until the first blocking owner gate is repaired.",
      acceptanceCriteria:
        "Collect or repair non-secret owner evidence for payment authority, support/refund posture, local-first customer-data fulfillment, display scope, and final go/no-go without exposing credentials or sensitive customer data.",
      validationExpectation:
        "Checker proves exactly one route, all live/payment/customer-data/public-proof gates fail closed, no unsupported first-dollar claim, no downstream queue mutation, and no delegated done claim.",
      ...routeDefaults,
    },
    { routeId: "business_first_dollar_no_send_prep", routeFamily: "business_no_send_prep", selected: false, suggestedOwner: "Business Operator", action: "prepare_first_dollar_no_send_packet", ...routeDefaults },
    { routeId: "strategy_first_dollar_threshold_work", routeFamily: "strategy_threshold", selected: false, suggestedOwner: "Strategy Worker", action: "define_first_dollar_threshold", ...routeDefaults },
    { routeId: "product_first_dollar_repair", routeFamily: "product_repair", selected: false, suggestedOwner: "Product Worker", action: "repair_first_dollar_readiness_surface", ...routeDefaults },
    { routeId: "qa_reviewer_first_dollar_check", routeFamily: "qa_reviewer_check", selected: false, suggestedOwner: "QA / Reviewer", action: "verify_first_dollar_boundaries", ...routeDefaults },
    { routeId: "commons_first_dollar_pattern_followup", routeFamily: "commons_pattern_followup", selected: false, suggestedOwner: "Commons Worker", action: "standardize_first_dollar_readiness_handoff", ...routeDefaults },
    { routeId: "learning_first_dollar_boundary", routeFamily: "keep_learning", selected: false, suggestedOwner: "Controller", action: "record_first_dollar_boundary_learning", ...routeDefaults },
    { routeId: "no_action_all_first_dollar_gates_ready", routeFamily: "no_action", selected: false, suggestedOwner: "Controller", action: "no_action_when_first_dollar_gates_are_ready", ...routeDefaults },
  ];
}

function firstDollarReadinessQuestions() {
  return [
    {
      id: "support_refund_policy",
      label: "Support and refund policy",
      state: "blocked",
      question: "What support contact, revision scope, refund posture, and tax or merchant-of-record owner apply before a paid pilot can be offered?",
      firstBlockingGate: false,
    },
    {
      id: "local_first_customer_data_path",
      label: "Local-first customer data path",
      state: "blocked",
      question: "Can the first paid packet be fulfilled through a customer-controlled local handoff without production resume storage?",
      firstBlockingGate: false,
    },
    {
      id: "payment_owner_stop",
      label: "Payment owner stop",
      state: "blocked",
      question: "Who owns payment provider authority, payment-link display, support/refund policy, and final go/no-go before checkout is visible?",
      firstBlockingGate: true,
    },
    {
      id: "public_proof_consent",
      label: "Public proof consent",
      state: "blocked",
      question: "Has explicit public-proof, testimonial, referral, screenshot, quote, or case-study consent been granted?",
      firstBlockingGate: false,
    },
  ];
}

function buildFirstDollarReadinessRoom(workspace, session) {
  const handoffRoom = buildFirstPaidPilotHandoffRoom(workspace, session);
  const clarityRepair = buildPaidAskProofPacketClarityRepair(workspace, session);
  const paidAskRouter = buildPaidAskOutcomeRouter(workspace, session);
  const paidAskRoom = buildRepairedProofToPaidAskRoom(workspace, session);
  const blockedActions = paidAskOutcomeRouterBlockedActions();
  const readinessQuestions = firstDollarReadinessQuestions();
  const routePackets = firstDollarRoutePackets();

  return {
    format: FIRST_DOLLAR_READINESS_ROOM_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "local_sample_first_dollar_readiness_no_payment_no_customer_data_no_external_actions",
    queueItemId: "NORTHSTAR-FIRST-DOLLAR-READINESS-ROOM",
    appSurfacePath: "website/app.html#first-dollar-readiness-room",
    adminSurfacePath: "website/admin.html#first-dollar-readiness-room",
    consumedArtifacts: [
      { id: "paid_ask_proof_packet_clarity_repair", path: "ops/product/paid-ask-proof-packet-clarity-repair.sample.json", state: clarityRepair?.format ? "consumed_proof_clarity" : "fallback_required" },
      { id: "paid_ask_outcome_router", path: "ops/product/paid-ask-outcome-router.sample.json", state: paidAskRouter?.format ? "consumed_safe_route_contract" : "fallback_required" },
      { id: "repaired_proof_to_paid_ask_room", path: "ops/product/repaired-proof-to-paid-ask-room.sample.json", state: paidAskRoom?.format ? "consumed_repaired_proof_packet" : "fallback_required" },
      { id: "first_paid_pilot_handoff_room", path: "ops/product/first-paid-pilot-handoff-room.sample.json", state: handoffRoom?.format ? "consumed_owner_handoff" : "fallback_required" },
      { id: "first_paid_pilot_gate_simulator", path: "ops/product/first-paid-pilot-gate-simulator.sample.json", state: "consumed_fail_closed_gate_state" },
      { id: "payment_owner_evidence_reference", path: "ops/scripts/check_payment_owner_evidence.cjs", state: "reference_only_not_actionable" },
      { id: "owner_authority_bundle_reference", path: "ops/launch/owner-authority-bundle.template.json", state: "reference_only_not_actionable" },
      { id: "business_controls", path: "ops/BUSINESS_CONTROLS.json", state: "controls_loaded" },
    ],
    proofClarity: {
      state: "sample_packet_clarity_visible",
      supportedClaimMapReady: true,
      missingProofQuestionsReady: true,
      riskyClaimWarningsReady: true,
      unsupportedClaimsRemoved: true,
      liveFeedbackObserved: false,
      willingnessToPayObserved: false,
      paymentIntentObserved: false,
      paymentObserved: false,
      revenueObserved: false,
    },
    packetDeliverables: [
      ...(handoffRoom.deliverables || []),
      "support_refund_questions",
      "local_first_customer_data_path",
    ],
    readinessQuestions,
    firstBlockingGate: {
      gateId: "payment_owner_stop",
      label: "Payment owner stop",
      reason: "Payment owner evidence, support/refund posture, and customer-data fulfillment path are not all repo-safe and actionable.",
      ownerEvidenceRequired: [
        "payment_owner_label",
        "support_refund_policy_status",
        "tax_or_merchant_of_record_owner",
        "customer_data_fulfillment_path",
        "payment_link_display_scope",
        "final_first_dollar_go_no_go_owner",
      ],
      externalActionAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
    },
    routePackets,
    disabledAffordances: {
      paymentLink: false,
      checkoutUi: false,
      customerDataUpload: false,
      outreachSend: false,
      schedulingLink: false,
      analyticsSend: false,
      publicProof: false,
      testimonialRequest: false,
      referralRequest: false,
      employerContact: false,
      autoApply: false,
      formFill: false,
      applicationSubmission: false,
    },
    blockedExternalActions: blockedActions,
    unsupportedClaims: {
      sampleReadiness: true,
      liveFeedback: false,
      willingnessToPay: false,
      paymentIntent: false,
      payment: false,
      paidCustomer: false,
      publicProof: false,
      testimonialPermission: false,
      referralPermission: false,
      revenue: false,
      productionCustomerDataReady: false,
      productionFirstDollarAuthorized: false,
    },
    repoSafety: {
      sampleOrOwnerApprovedRedactedOnly: true,
      safeLabelsOnly: true,
      rawCustomerMaterialsExcluded: true,
      credentialsExcluded: true,
      contactDetailsExcluded: true,
      paymentDataExcluded: true,
      dashboardUrlsExcluded: true,
      exactlyOneSelectedRoute: true,
      firstBlockingGateVisible: true,
      noExternalActions: true,
      noPaymentLinkOrCheckoutDisplay: true,
      noPaymentOrCustomerDataHandling: true,
      noProviderMutation: true,
      noDownstreamQueueMutation: true,
      noDelegatedCompletionClaim: true,
      noUnsupportedFirstDollarClaims: true,
      queueMutationAllowed: false,
      downstreamCompletionClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      externalActionsPerformed: [],
      queueMutationsPerformed: [],
    },
  };
}

function firstDollarReadinessRoomMarkdown(room) {
  const selectedRoute = (room.routePackets || []).find((route) => route.selected) || {};
  return [
    "# ProofResume First Dollar Readiness Room",
    "",
    `Format: ${room.format}`,
    `Generated: ${room.generatedAt}`,
    "",
    "## Boundary",
    "- Local/sample readiness only.",
    "- No payment link, checkout UI, customer-data upload, outreach send, scheduling link, analytics send, public proof, testimonial/referral ask, employer contact, auto-apply, form fill, application submission, provider mutation, downstream queue mutation, delegated done claim, or first-dollar claim.",
    "",
    "## Proof Clarity",
    ...Object.entries(room.proofClarity).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Packet Deliverables",
    ...room.packetDeliverables.map((item) => `- ${item}`),
    "",
    "## First Blocking Gate",
    `- Gate: ${room.firstBlockingGate.gateId}`,
    `- Reason: ${room.firstBlockingGate.reason}`,
    ...room.firstBlockingGate.ownerEvidenceRequired.map((field) => `- Required: ${field}`),
    "",
    "## Selected Route",
    `- Route: ${selectedRoute.routeId}`,
    `- Owner: ${selectedRoute.suggestedOwner}`,
    `- Action: ${selectedRoute.action}`,
    `- Validation: ${selectedRoute.validationExpectation}`,
    "",
  ].join("\n");
}

function firstDollarOwnerEvidenceFields() {
  return [
    ["payment_owner_label", "Payment owner", "Who owns payment provider authority and final payment-link decisions."],
    ["payment_link_display_scope", "Payment-link display scope", "Whether a payment link or checkout may be shown."],
    ["support_refund_owner", "Support/refund owner", "Support contact, revision scope, refund posture, and stop conditions."],
    ["tax_or_merchant_of_record_owner", "Tax/MoR owner", "The owner for tax and merchant-of-record decisions."],
    ["customer_data_path", "Local-first customer-data path", "Consent, storage, deletion, support, and customer-controlled fulfillment path."],
    ["session_or_contact_owner", "Session/contact owner", "Who may coordinate a first paid pilot contact or session."],
    ["deploy_outreach_prerequisites", "Deploy/outreach prerequisites", "Public deploy and outreach prerequisites remain separate live gates."],
    ["public_proof_stop", "Public-proof stop", "No public proof, testimonial, referral, quote, screenshot, or case study without explicit consent."],
    ["final_first_dollar_go_no_go_owner", "Final first-dollar go/no-go owner", "The owner who can approve, deny, repair, or keep blocked the first paid pilot path."],
  ].map(([id, label, missingReason]) => ({
    id,
    label,
    state: id.includes("prerequisites") || id.includes("public_proof") ? "blocked" : "needed",
    answerKind: id === "final_first_dollar_go_no_go_owner" ? "approve_deny_repair_or_keep_blocked" : "repo_safe_label",
    missingReason,
    privateAnswerPath: "ops/launch/first-paid-pilot-owner-answer-intake.md",
    mustStayOffRepo: [
      "credentials",
      "raw_resumes",
      "customer_contact_details",
      "payment_links",
      "dashboard_urls",
      "customer_materials",
      "private_replies",
      "card_data",
      "calendar_links",
      "prospect_identities",
    ],
  }));
}

function firstDollarOwnerEvidenceRoutes() {
  return [
    ["approval_unblocker_owner_evidence_repair", "approval_unblocker_owner_gate_repair", "Approval Unblocker", "repair_first_dollar_owner_evidence", true],
    ["business_no_send_answer_intake", "business_no_send_answer_intake", "Business Operator", "classify_private_owner_answer_no_send", false],
    ["product_copy_repair", "product_copy_repair", "Product Worker", "repair_owner_evidence_copy_if_confusing", false],
    ["strategy_threshold_update", "strategy_threshold_update", "Strategy Worker", "update_first_dollar_thresholds", false],
    ["qa_reviewer_boundary_check", "qa_reviewer_check", "QA / Reviewer", "verify_first_dollar_owner_evidence_boundaries", false],
    ["commons_follow_up", "commons_follow_up", "Commons Worker", "standardize_owner_evidence_repair_room_pattern", false],
    ["keep_blocked", "keep_blocked", "Controller", "keep_first_dollar_owner_gate_blocked", false],
    ["no_action_all_owner_evidence_ready", "no_action", "Controller", "no_action_when_owner_evidence_ready", false],
  ].map(([routeId, routeFamily, suggestedOwner, action, selected]) => ({
    routeId,
    selected,
    routeFamily,
    suggestedOwner,
    action,
    reason: selected
      ? "The first blocking gate is missing repo-safe owner evidence; live payment/customer-data/proof actions stay closed."
      : "Available only after controller review or separate queue promotion.",
    acceptanceCriteria: "Repair non-secret owner evidence without exposing credentials, payment data, contact details, raw resumes, customer materials, or private replies.",
    validationExpectation: "Exactly one route, first blocking gate visibility, no external action, no payment/customer-data handling, no unsupported first-dollar claim, no downstream queue mutation, and no delegated done claim.",
    externalActionAllowed: false,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
    paymentOrCustomerDataHandlingAllowed: false,
    providerActionAllowed: false,
    mustNotMarkDelegatedWorkDone: true,
  }));
}

function buildFirstDollarOwnerEvidenceRepairRoom(workspace, session) {
  const readinessRoom = buildFirstDollarReadinessRoom(workspace, session);
  const objectionSimulator = buildPaidAskObjectionResponseSimulator(workspace, session);
  const ownerEvidenceFields = firstDollarOwnerEvidenceFields();
  const blockedActions = paidAskOutcomeRouterBlockedActions();

  return {
    format: FIRST_DOLLAR_OWNER_EVIDENCE_REPAIR_ROOM_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "local_sample_first_dollar_owner_evidence_repair_no_external_actions",
    queueItemId: "NORTHSTAR-FIRST-DOLLAR-OWNER-EVIDENCE-REPAIR-ROOM",
    appSurfacePath: "website/app.html#first-dollar-owner-evidence-repair-room",
    adminSurfacePath: "website/admin.html#first-dollar-owner-evidence-repair-room",
    consumedArtifacts: [
      { id: "first_dollar_readiness_room", path: "ops/product/first-dollar-readiness-room.sample.json", state: readinessRoom?.format ? "consumed_first_blocking_gate" : "fallback_required" },
      { id: "first_paid_pilot_gate_simulator", path: "ops/product/first-paid-pilot-gate-simulator.sample.json", state: "consumed_fail_closed_owner_gates" },
      { id: "paid_ask_objection_response_simulator", path: "ops/product/paid-ask-objection-response-simulator.sample.json", state: objectionSimulator?.format ? "consumed_owner_objection_stops" : "fallback_required" },
      { id: "payment_owner_evidence_template", path: "ops/payments/payment-link-owner-evidence.template.json", state: "reference_only_no_secret_values" },
      { id: "owner_authority_bundle", path: "ops/launch/owner-authority-bundle.template.json", state: "reference_only_no_secret_values" },
      { id: "first_paid_pilot_owner_action_request", path: "ops/launch/first-paid-pilot-owner-action-request.json", state: "private_off_repo_answer_path" },
      { id: "first_paid_pilot_owner_answer_intake", path: "ops/launch/first-paid-pilot-owner-answer-intake.md", state: "private_off_repo_answer_path" },
      { id: "business_controls", path: "ops/BUSINESS_CONTROLS.json", state: "controls_loaded" },
    ],
    firstBlockingGate: {
      gateId: "payment_owner_evidence",
      label: "Payment owner evidence",
      state: "missing_repo_safe_owner_answer",
      reason: "Payment owner, display scope, support/refund posture, tax/MoR owner, customer-data path, and final go/no-go owner are not all repo-safe and actionable.",
      ownerEvidenceRequired: ownerEvidenceFields.map((field) => field.id),
      privateAnswerPath: "ops/launch/first-paid-pilot-owner-answer-intake.md",
      repoSafeAnswerOnly: true,
      externalActionAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
    },
    ownerEvidenceFields,
    exportContract: {
      jsonExportLocalOnly: true,
      markdownExportLocalOnly: true,
      redactedFieldsOnly: true,
      forbiddenRepoVisibleValues: [
        "credentials",
        "raw_resumes",
        "customer_contact_details",
        "payment_links",
        "dashboard_urls",
        "customer_materials",
        "private_replies",
        "card_data",
        "calendar_links",
        "prospect_identities",
      ],
      privateAnswerPath: "ops/launch/first-paid-pilot-owner-answer-intake.md",
    },
    routePackets: firstDollarOwnerEvidenceRoutes(),
    disabledAffordances: {
      paymentLink: false,
      checkoutUi: false,
      customerDataUpload: false,
      outreachSend: false,
      schedulingLink: false,
      analyticsSend: false,
      publicProof: false,
      testimonialRequest: false,
      referralRequest: false,
      employerContact: false,
      autoApply: false,
      formFill: false,
      applicationSubmission: false,
    },
    blockedExternalActions: blockedActions,
    unsupportedClaims: paidAskOutcomeRouterClaimFlags(),
    repoSafety: {
      sampleOrOwnerApprovedRedactedOnly: true,
      safeLabelsOnly: true,
      rawCustomerMaterialsExcluded: true,
      credentialsExcluded: true,
      contactDetailsExcluded: true,
      paymentLinksExcluded: true,
      dashboardUrlsExcluded: true,
      customerMaterialsExcluded: true,
      privateRepliesExcluded: true,
      cardDataExcluded: true,
      calendarLinksExcluded: true,
      prospectIdentitiesExcluded: true,
      firstBlockingGateVisible: true,
      exactlyOneSelectedRoute: true,
      noExternalActions: true,
      noPaymentLinkOrCheckoutDisplay: true,
      noPaymentOrCustomerDataHandling: true,
      noProviderMutation: true,
      noDownstreamQueueMutation: true,
      noDelegatedCompletionClaim: true,
      noUnsupportedFirstDollarClaims: true,
      queueMutationAllowed: false,
      downstreamCompletionClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      externalActionsPerformed: [],
      queueMutationsPerformed: [],
    },
  };
}

function firstDollarOwnerEvidenceRepairRoomMarkdown(room) {
  const selectedRoute = (room.routePackets || []).find((route) => route.selected) || {};
  return [
    "# ProofResume First Dollar Owner Evidence Repair Room",
    "",
    `Format: ${room.format}`,
    `Generated: ${room.generatedAt}`,
    "",
    "## Boundary",
    "- Local/sample-redacted owner-evidence repair only.",
    "- No credentials, raw resumes, customer contact details, payment links, dashboard URLs, customer materials, private replies, card data, calendar links, or prospect identities.",
    "- No payment links, checkout, customer-data handling, external actions, provider mutation, downstream queue mutation, delegated done claim, public proof, or first-dollar claim.",
    "",
    "## First Blocking Gate",
    `- ${room.firstBlockingGate.gateId}: ${room.firstBlockingGate.reason}`,
    ...room.firstBlockingGate.ownerEvidenceRequired.map((field) => `- Required: ${field}`),
    "",
    "## Owner Evidence Fields",
    ...room.ownerEvidenceFields.map((field) => `- ${field.id}: ${field.state}; ${field.missingReason}`),
    "",
    "## Selected Route",
    `- Route: ${selectedRoute.routeId}`,
    `- Owner: ${selectedRoute.suggestedOwner}`,
    `- Action: ${selectedRoute.action}`,
    `- Validation: ${selectedRoute.validationExpectation}`,
    "",
  ].join("\n");
}

function firstLiveProofAuditCopilotRoutes() {
  const defaults = {
    externalActionAllowed: false,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
    paymentOrCustomerDataHandlingAllowed: false,
    providerActionAllowed: false,
    mustNotMarkDelegatedWorkDone: true,
  };

  return [
    {
      routeId: "paid_pilot_decision_room",
      routeFamily: "paid_pilot_decision",
      selected: true,
      suggestedOwner: "Owner / Product",
      action: "open_private_paid_pilot_decision_room",
      reason:
        "The sample proof audit is walkable and paid-pilot-aware, but live payment, customer-data, support/refund, public-proof, and authority gates remain closed.",
      acceptanceCriteria:
        "Use the exported repo-safe packet to decide whether the owner repairs gates, keeps learning, or opens a separate paid-pilot decision queue item.",
      validationExpectation:
        "Checker proves exactly one next route, sample/redacted-only inputs, no raw materials, no external action, no downstream mutation, and no delegated done claim.",
      ...defaults,
    },
    { routeId: "product_repair", routeFamily: "product_repair", selected: false, suggestedOwner: "Product Worker", action: "repair_live_proof_audit_copilot", ...defaults },
    { routeId: "business_no_send_owner_dispatch", routeFamily: "business_no_send_owner_dispatch", selected: false, suggestedOwner: "Business Operator", action: "prepare_no_send_owner_dispatch", ...defaults },
    { routeId: "strategy_threshold_update", routeFamily: "strategy_threshold_update", selected: false, suggestedOwner: "Strategy Worker", action: "update_live_audit_to_paid_pilot_thresholds", ...defaults },
    { routeId: "approval_unblocker_gate_repair", routeFamily: "approval_unblocker_gate_repair", selected: false, suggestedOwner: "Approval Unblocker", action: "repair_first_blocking_live_gate", ...defaults },
    { routeId: "qa_reviewer_check", routeFamily: "qa_reviewer_check", selected: false, suggestedOwner: "QA / Reviewer", action: "check_live_proof_audit_boundaries", ...defaults },
    { routeId: "keep_learning", routeFamily: "keep_learning", selected: false, suggestedOwner: "Controller", action: "keep_learning_until_owner_approved_evidence", ...defaults },
    { routeId: "no_action", routeFamily: "no_action", selected: false, suggestedOwner: "Controller", action: "no_action_for_sample_only_or_revoked_signal", ...defaults },
  ];
}

function buildFirstLiveProofAuditCopilot(workspace, session) {
  const proofAuditPacket = buildProofAuditPacket(workspace, session);
  const firstSession = buildFirstSessionCustomerHandoffRoom(workspace, session);
  const authorizedRunner = {
    format: "proofresume-first-authorized-session-runner-v1",
    state: "sample_or_owner_approved_redacted_only",
  };
  const firstDollar = buildFirstDollarReadinessRoom(workspace, session);
  const objectionSimulator = buildPaidAskObjectionResponseSimulator(workspace, session);
  const paidPilotHandoff = buildFirstPaidPilotHandoffRoom(workspace, session);
  const gateSimulator = {
    format: "proofresume-first-paid-pilot-gate-simulator-v1",
    state: "fail_closed_reference",
  };
  const routeOptions = firstLiveProofAuditCopilotRoutes();
  const selectedRoute = routeOptions.find((route) => route.selected) || routeOptions[0];
  const blockedActions = paidAskOutcomeRouterBlockedActions();

  return {
    format: FIRST_LIVE_PROOF_AUDIT_COPILOT_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "local_sample_redacted_live_proof_audit_copilot_no_external_actions",
    queueItemId: "NORTHSTAR-FIRST-LIVE-PROOF-AUDIT-COPILOT",
    appSurfacePath: "website/app.html#first-live-proof-audit-copilot",
    adminSurfacePath: "website/admin.html#first-live-proof-audit-copilot",
    consumedArtifacts: [
      { id: "first_audit_command_room", path: "ops/launch/first-audit-command-room-runbook.md", state: "session_script_reference" },
      { id: "first_authorized_session_runner", path: "ops/product/first-authorized-session-runner.sample.json", state: authorizedRunner.state },
      { id: "first_dollar_readiness_room", path: "ops/product/first-dollar-readiness-room.sample.json", state: firstDollar?.format ? "consumed_first_blocking_gate" : "fallback_required" },
      { id: "paid_ask_objection_response_simulator", path: "ops/product/paid-ask-objection-response-simulator.sample.json", state: objectionSimulator?.format ? "consumed_objection_states" : "fallback_required" },
      { id: "first_paid_pilot_handoff_room", path: "ops/product/first-paid-pilot-handoff-room.sample.json", state: paidPilotHandoff?.format ? "consumed_paid_pilot_handoff" : "fallback_required" },
      { id: "first_paid_pilot_gate_simulator", path: "ops/product/first-paid-pilot-gate-simulator.sample.json", state: gateSimulator.state },
      { id: "business_controls", path: "ops/BUSINESS_CONTROLS.json", state: "controls_loaded" },
    ],
    sessionScript: [
      { stepId: "context", label: "Open context", operatorPrompt: "Confirm sample or owner-approved redacted scope before reviewing any proof.", externalActionAllowed: false },
      { stepId: "proof_audit", label: "Run proof audit", operatorPrompt: "Walk supported claims, missing proof, risky claims, and safer bullet direction.", externalActionAllowed: false },
      { stepId: "consent_redaction", label: "Check consent/redaction", operatorPrompt: "Verify safe labels only and exclude raw resumes, contact details, private replies, and customer materials.", externalActionAllowed: false },
      { stepId: "paid_pilot_cues", label: "Review paid-pilot cues", operatorPrompt: "Inspect value, objections, first blocking gate, support/refund, payment, customer-data, and public-proof stops.", externalActionAllowed: false },
      { stepId: "route", label: "Select one route", operatorPrompt: "Export the repo-safe packet and choose exactly one internal route without mutating downstream queues.", externalActionAllowed: false },
    ],
    proofAuditCheckpoints: [
      "supported_claim_map_visible",
      "missing_proof_questions_visible",
      "risky_claim_warnings_visible",
      "candidate_approval_state_visible",
      "tracking_status_visible",
      "first_blocking_gate_visible",
      "paid_pilot_handoff_visible",
      "objection_response_path_visible",
    ],
    consentRedactionState: {
      evidenceMode: "sample_or_owner_approved_redacted_only",
      safeLabelsOnly: true,
      rawResumeExcluded: true,
      privateContactDetailsExcluded: true,
      rawTranscriptExcluded: true,
      privateReplyExcluded: true,
      paymentDataExcluded: true,
      credentialsExcluded: true,
      dashboardUrlsExcluded: true,
      publicProofExcluded: true,
    },
    candidateFitAssumptions: {
      targetRole: proofAuditPacket?.target?.role || "Customer Operations Analyst",
      matchedJob: proofAuditPacket?.matchedJob?.title || "Customer Operations Analyst",
      fitScore: proofAuditPacket?.matchedJob?.fitScore ?? 84,
      assumptions: [
        "Sample candidate has operations, onboarding, reporting, and support evidence labels.",
        "Proof audit must downgrade or question any claim without candidate-owned proof.",
        "Matched-job fit is a local prioritization cue, not an application outcome claim.",
      ],
    },
    firstBlockingGate: firstDollar.firstBlockingGate || {
      gateId: "payment_owner_stop",
      label: "Payment owner stop",
      reason: "Payment owner, support/refund, and customer-data evidence remain closed.",
    },
    paidPilotReadinessCues: [
      ...fallbackList(paidPilotHandoff.pilotValue, "Supported claim map, missing-proof questions, safer bullet direction, and owner go/no-go packet."),
      `Selected handoff route: ${paidPilotHandoff.ownerGoNoGoPacket?.routeId || "owner_first_paid_pilot_go_no_go_packet"}`,
      `Selected objection route: ${objectionSimulator.selectedObjectionRoute?.action || "product_missing_proof_response_repair"}`,
    ],
    noSendOperatorPrompts: [
      "Do not send outreach, schedule a session, display a payment link, open checkout, collect payment, upload customer data, publish proof, or contact employers.",
      "Use only sample or owner-approved redacted labels in the exported packet.",
      "Treat paid-pilot cues as private readiness signals, not feedback, willingness-to-pay, payment intent, payment, public proof, or revenue.",
    ],
    routeOptions,
    selectedRoute,
    repoSafeSessionPacket: {
      format: "proofresume-first-live-proof-audit-copilot-session-packet-v1",
      excludes: [
        "raw_resumes",
        "private_contact_details",
        "raw_transcripts",
        "private_replies",
        "payment_data",
        "credentials",
        "dashboard_urls",
        "unsupported_customer_feedback_claims",
        "unsupported_revenue_claims",
      ],
      includes: [
        "session_script",
        "proof_audit_checkpoints",
        "consent_redaction_state",
        "candidate_fit_assumptions",
        "first_blocking_gate",
        "paid_pilot_readiness_cues",
        "no_send_operator_prompts",
        "exactly_one_internal_route",
      ],
    },
    blockedExternalActions: blockedActions,
    unsupportedClaims: {
      sampleReadiness: true,
      liveCustomerFeedback: false,
      willingnessToPay: false,
      paymentIntent: false,
      payment: false,
      paidCustomer: false,
      publicProof: false,
      testimonialPermission: false,
      referralPermission: false,
      revenue: false,
      productionCustomerDataReady: false,
      productionPaidPilotAuthorized: false,
    },
    repoSafety: {
      sampleOrOwnerApprovedRedactedOnly: true,
      safeLabelsOnly: true,
      rawCustomerMaterialsExcluded: true,
      contactDetailsExcluded: true,
      paymentDataExcluded: true,
      credentialsExcluded: true,
      dashboardUrlsExcluded: true,
      exactlyOneSelectedRoute: true,
      noExternalActions: true,
      noPaymentLinkOrCheckoutDisplay: true,
      noPaymentOrCustomerDataHandling: true,
      noProviderMutation: true,
      noDownstreamQueueMutation: true,
      noDelegatedCompletionClaim: true,
      noUnsupportedLiveOrRevenueClaims: true,
      queueMutationAllowed: false,
      downstreamCompletionClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      externalActionsPerformed: [],
      queueMutationsPerformed: [],
    },
  };
}

function firstLiveProofAuditCopilotMarkdown(copilot) {
  return [
    "# ProofResume First Live Proof-Audit Copilot",
    "",
    `Format: ${copilot.format}`,
    `Generated: ${copilot.generatedAt}`,
    "",
    "## Boundary",
    "- Local/sample or owner-approved redacted copilot only.",
    "- No deploy, outreach, scheduling, lead capture, analytics, provider mutation, payment link, checkout, payment collection, production customer-data handling, public proof, testimonial/referral request, employer contact, auto-apply, form fill, application submission, downstream queue mutation, delegated done claim, live feedback claim, willingness-to-pay claim, payment-intent claim, payment claim, public-proof claim, or revenue claim.",
    "",
    "## Session Script",
    ...copilot.sessionScript.map((step) => `- ${step.label}: ${step.operatorPrompt}`),
    "",
    "## Proof-Audit Checkpoints",
    ...copilot.proofAuditCheckpoints.map((checkpoint) => `- ${checkpoint}`),
    "",
    "## Consent And Redaction",
    ...Object.entries(copilot.consentRedactionState).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## First Blocking Gate",
    `- ${copilot.firstBlockingGate.label || copilot.firstBlockingGate.gateId}: ${copilot.firstBlockingGate.reason || "blocked"}`,
    "",
    "## Paid-Pilot Readiness Cues",
    ...copilot.paidPilotReadinessCues.map((cue) => `- ${cue}`),
    "",
    "## Selected Route",
    `- ${copilot.selectedRoute.routeFamily} -> ${copilot.selectedRoute.action}`,
    `- Owner: ${copilot.selectedRoute.suggestedOwner}`,
    `- Reason: ${copilot.selectedRoute.reason}`,
    "",
    "## Unsupported Claim Flags",
    ...Object.entries(copilot.unsupportedClaims).map(([key, value]) => `- ${key}: ${value}`),
    "",
  ].join("\n");
}

function liveToPaidPilotDecisionRoutes() {
  const defaults = {
    externalActionAllowed: false,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
    paymentOrCustomerDataHandlingAllowed: false,
    providerActionAllowed: false,
    mustNotMarkDelegatedWorkDone: true,
  };

  return [
    {
      routeId: "product_repair_before_paid_pilot_ask",
      routeFamily: "product_repair",
      selected: true,
      suggestedOwner: "Product Worker",
      action: "repair_trust_and_missing_proof_before_paid_pilot_decision",
      reason:
        "The sample loop shows value and comprehension, but trust and missing-proof gates are not ready, so the only safe route is product repair before any paid pilot ask.",
      ownerSafeHandoff:
        "Repair privacy/provenance copy and missing-proof prompts, then re-run with sample or owner-approved redacted evidence only.",
      ...defaults,
    },
    { routeId: "business_no_send_paid_pilot_handoff", routeFamily: "business_no_send_handoff", selected: false, suggestedOwner: "Business Operator", action: "prepare_no_send_paid_pilot_owner_packet", ...defaults },
    { routeId: "approval_unblocker_owner_gate_repair", routeFamily: "approval_unblocker_owner_gate_repair", selected: false, suggestedOwner: "Approval Unblocker", action: "repair_first_paid_pilot_owner_evidence", ...defaults },
    { routeId: "strategy_paid_pilot_threshold", routeFamily: "strategy_threshold_update", selected: false, suggestedOwner: "Strategy Worker", action: "define_live_session_to_paid_pilot_threshold", ...defaults },
    { routeId: "qa_reviewer_boundary_check", routeFamily: "qa_reviewer_check", selected: false, suggestedOwner: "QA / Reviewer", action: "verify_paid_pilot_decision_boundaries", ...defaults },
    { routeId: "keep_learning_until_live_evidence", routeFamily: "keep_learning", selected: false, suggestedOwner: "Controller", action: "keep_learning_without_live_claims", ...defaults },
    { routeId: "no_action_all_paid_pilot_gates_ready", routeFamily: "no_action", selected: false, suggestedOwner: "Controller", action: "no_action_when_paid_pilot_decision_is_already_ready", ...defaults },
  ];
}

function buildLiveToPaidPilotDecisionRoom(workspace, session) {
  const copilot = buildFirstLiveProofAuditCopilot(workspace, session);
  const firstDollar = buildFirstDollarReadinessRoom(workspace, session);
  const objectionSimulator = buildPaidAskObjectionResponseSimulator(workspace, session);
  const handoffRoom = buildFirstPaidPilotHandoffRoom(workspace, session);
  const selectedRoute = liveToPaidPilotDecisionRoutes().find((route) => route.selected);
  const blockedActions = paidAskOutcomeRouterBlockedActions();

  return {
    format: LIVE_TO_PAID_PILOT_DECISION_ROOM_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "local_sample_or_owner_approved_redacted_decision_room_no_external_actions",
    queueItemId: "NORTHSTAR-LIVE-TO-PAID-PILOT-DECISION-ROOM",
    appSurfacePath: "website/app.html#live-to-paid-pilot-decision-room",
    adminSurfacePath: "website/admin.html#live-to-paid-pilot-decision-room",
    consumedArtifacts: [
      { id: "first_live_proof_audit_copilot", path: "ops/product/first-live-proof-audit-copilot.sample.json", state: copilot?.format ? "consumed_copilot_packet" : "fallback_required" },
      { id: "first_dollar_readiness_room", path: "ops/product/first-dollar-readiness-room.sample.json", state: firstDollar?.format ? "consumed_first_blocking_gate" : "fallback_required" },
      { id: "paid_ask_objection_response_simulator", path: "ops/product/paid-ask-objection-response-simulator.sample.json", state: objectionSimulator?.format ? "consumed_objection_routes" : "fallback_required" },
      { id: "first_paid_pilot_handoff_room", path: "ops/product/first-paid-pilot-handoff-room.sample.json", state: handoffRoom?.format ? "consumed_owner_safe_handoff" : "fallback_required" },
      { id: "first_paid_pilot_gate_simulator", path: "ops/product/first-paid-pilot-gate-simulator.sample.json", state: "consumed_gate_states" },
      { id: "business_first_paid_pilot_owner_go_no_go", path: "ops/launch/first-paid-pilot-owner-go-no-go-no-send.sample.json", state: "consumed_no_send_owner_boundary_if_available" },
      { id: "business_controls", path: "ops/BUSINESS_CONTROLS.json", state: "controls_loaded" },
    ],
    sessionEvidenceBoundary: {
      allowedInputState: "sample_or_owner_approved_redacted_post_session_evidence_only",
      sampleReadiness: true,
      ownerApprovedRedactedEvidence: false,
      liveFeedback: false,
      willingnessToPay: false,
      paymentIntent: false,
      payment: false,
      publicProof: false,
      referralOrTestimonial: false,
      revenue: false,
      rawCustomerMaterialsExcluded: true,
      safeLabelsOnly: true,
    },
    gateStates: [
      ["comprehension", "Comprehension", "ready", "Sample participant can explain why proof-backed tailoring differs from generic rewrites.", false],
      ["trust", "Trust", "repair_needed", "Sample notes still need clearer privacy and evidence provenance language before a paid ask.", true],
      ["missing_proof", "Missing proof", "repair_needed", "Missing metrics and source details must be requested before stronger bullets are offered.", false],
      ["value", "Value", "ready", "Sample value is visible only as readiness, not observed customer feedback.", false],
      ["support_refund", "Support and refund", "blocked", "Support contact, revision scope, refund posture, and tax or merchant-of-record owner are not all confirmed.", false],
      ["customer_data", "Customer data", "blocked", "Production resume handling remains closed until a local-first customer-controlled fulfillment path is confirmed.", false],
      ["payment_owner", "Payment owner", "blocked", "Payment provider authority and checkout display scope are not actionable.", false],
      ["deploy_outreach", "Deploy and outreach", "blocked", "Public deploy, outbound send, scheduling, and lead capture gates remain closed.", false],
      ["public_proof", "Public proof", "blocked", "No quote, screenshot, case study, referral, or public outcome claim is allowed.", false],
    ].map(([gateId, label, state, signal, firstBlockingGate]) => ({
      gateId,
      label,
      state,
      signal,
      firstBlockingGate,
      externalActionAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
    })),
    evidenceStates: [
      ["sample_readiness", "Sample readiness", "present", true],
      ["owner_approved_redacted_evidence", "Owner-approved redacted evidence", "absent", false],
      ["live_feedback", "Live feedback", "absent", false],
      ["willingness_to_pay", "Willingness to pay", "absent", false],
      ["payment_intent", "Payment intent", "absent", false],
      ["payment", "Payment", "absent", false],
      ["public_proof", "Public proof", "absent", false],
      ["referral_or_testimonial", "Referral or testimonial", "absent", false],
      ["revenue", "Revenue", "absent", false],
    ].map(([id, label, state, claimAllowed]) => ({ id, label, state, claimAllowed })),
    decisionSignals: {
      comprehensionReady: true,
      trustReady: false,
      missingProofReady: false,
      valueReady: true,
      supportRefundReady: false,
      customerDataReady: false,
      paymentOwnerReady: false,
      deployOutreachReady: false,
      publicProofReady: false,
      recommendedDecision: selectedRoute.routeId,
    },
    routePackets: liveToPaidPilotDecisionRoutes(),
    exportPacket: {
      selectedRouteId: selectedRoute.routeId,
      handoffType: "owner_safe_single_route_handoff",
      recommendedOwner: selectedRoute.suggestedOwner,
      recommendedNextAction: "Repair trust and missing-proof prompts before any paid pilot decision.",
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      externalActionAllowed: false,
    },
    blockedExternalActions: blockedActions,
    claimControls: {
      sampleOrOwnerApprovedRedactedOnly: true,
      safeLabelsOnly: true,
      exactlyOneSelectedRoute: true,
      noExternalActions: true,
      noPaymentLinkOrCheckoutDisplay: true,
      noPaymentOrCustomerDataHandling: true,
      noProviderMutation: true,
      noDownstreamQueueMutation: true,
      noDelegatedCompletionClaim: true,
      unsupportedClaimFlags: {
        sampleReadiness: true,
        ownerApprovedRedactedEvidence: false,
        liveFeedback: false,
        willingnessToPay: false,
        paymentIntent: false,
        payment: false,
        publicProof: false,
        referralOrTestimonial: false,
        revenue: false,
      },
    },
    repoSafety: {
      sampleOrOwnerApprovedRedactedOnly: true,
      safeLabelsOnly: true,
      rawCustomerMaterialsExcluded: true,
      credentialsExcluded: true,
      contactDetailsExcluded: true,
      paymentDataExcluded: true,
      dashboardUrlsExcluded: true,
      exactlyOneSelectedRoute: true,
      gateStateSeparation: true,
      evidenceStateSeparation: true,
      noExternalActions: true,
      noPaymentLinkOrCheckoutDisplay: true,
      queueMutationAllowed: false,
      downstreamCompletionClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
    },
  };
}

function liveToPaidPilotDecisionRoomMarkdown(room) {
  const selectedRoute = (room.routePackets || []).find((route) => route.selected) || {};
  return [
    "# ProofResume Live To Paid Pilot Decision Room",
    "",
    `Format: ${room.format}`,
    `Generated: ${room.generatedAt}`,
    "",
    "## Boundary",
    "- Sample or owner-approved redacted post-session evidence only.",
    "- No checkout, payment link, payment collection, production customer-data handling, deploy, outreach, scheduling, analytics, public proof, provider mutation, downstream queue mutation, delegated done claim, or revenue claim.",
    "",
    "## Gates",
    ...room.gateStates.map((gate) => `- ${gate.label}: ${gate.state}; ${gate.signal}`),
    "",
    "## Evidence States",
    ...room.evidenceStates.map((state) => `- ${state.label}: ${state.state}; claimAllowed=${state.claimAllowed}`),
    "",
    "## Selected Route",
    `- Route: ${selectedRoute.routeId}`,
    `- Owner: ${selectedRoute.suggestedOwner}`,
    `- Action: ${selectedRoute.action}`,
    `- Reason: ${selectedRoute.reason || "Internal route only."}`,
    "",
  ].join("\n");
}

function renderLiveToPaidPilotDecisionRoom(workspace, session) {
  const room = buildLiveToPaidPilotDecisionRoom(workspace, session);
  const selectedRoute = (room.routePackets || []).find((route) => route.selected) || {};
  setText("[data-live-to-paid-pilot-decision-state]", "Product repair route selected");
  setText("[data-live-to-paid-pilot-decision-route]", selectedRoute.routeId);
  setText("[data-live-to-paid-pilot-decision-route-detail]", `${selectedRoute.suggestedOwner}: ${selectedRoute.action}; queue mutation, payment/customer-data handling, and external action remain blocked.`);
  renderList("[data-live-to-paid-pilot-decision-sources]", room.consumedArtifacts.map((artifact) => `${artifact.id}: ${artifact.state}`));
  renderList("[data-live-to-paid-pilot-decision-boundary]", Object.entries(room.sessionEvidenceBoundary).map(([key, value]) => `${key}: ${value}`));
  renderList("[data-live-to-paid-pilot-decision-gates]", room.gateStates.map((gate) => `${gate.firstBlockingGate ? "First blocker - " : ""}${gate.label}: ${gate.state}; ${gate.signal}`));
  renderList("[data-live-to-paid-pilot-decision-evidence]", room.evidenceStates.map((state) => `${state.label}: ${state.state}; claimAllowed=${state.claimAllowed}`));
  renderList("[data-live-to-paid-pilot-decision-signals]", Object.entries(room.decisionSignals).map(([key, value]) => `${key}: ${value}`));
  renderList("[data-live-to-paid-pilot-decision-routes]", room.routePackets.map((route) => `${route.selected ? "Selected" : "Option"}: ${route.routeFamily} -> ${route.action}`));
  renderList("[data-live-to-paid-pilot-decision-blocked]", Object.entries(room.blockedExternalActions).map(([key, value]) => `${key}: ${value}`));
  setText("[data-live-to-paid-pilot-decision-preview]", liveToPaidPilotDecisionRoomMarkdown(room));
}

function liveProofTrustGapRepairRoutes() {
  const defaults = {
    externalActionAllowed: false,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
    paymentOrCustomerDataHandlingAllowed: false,
    providerActionAllowed: false,
    mustNotMarkDelegatedWorkDone: true,
  };

  return [
    {
      routeId: "missing_proof_cue_repair",
      routeFamily: "missing_proof_cue_repair",
      selected: true,
      suggestedOwner: "Product Worker",
      action: "repair_missing_proof_cues_after_trust_gap",
      reason:
        "The sample decision selected product repair because trust and missing-proof cues are unclear; the next safe step is to repair proof prompts before any paid pilot ask.",
      ownerSafeHandoff:
        "Tighten privacy/provenance copy, show proof-source custody, and ask for missing proof categories without collecting raw customer materials in repo files.",
      ...defaults,
    },
    { routeId: "business_no_send_follow_up", routeFamily: "business_no_send_follow_up", selected: false, suggestedOwner: "Business Operator", action: "prepare_no_send_trust_repair_follow_up", ...defaults },
    { routeId: "strategy_repair_threshold", routeFamily: "strategy_repair_threshold", selected: false, suggestedOwner: "Strategy Worker", action: "define_trust_gap_repair_threshold", ...defaults },
    { routeId: "qa_reviewer_boundary_check", routeFamily: "qa_reviewer_check", selected: false, suggestedOwner: "QA / Reviewer", action: "verify_trust_repair_boundaries", ...defaults },
    { routeId: "owner_gate_repair", routeFamily: "owner_gate_repair", selected: false, suggestedOwner: "Approval Unblocker", action: "repair_owner_evidence_gate_language", ...defaults },
    { routeId: "keep_learning_until_redacted_evidence", routeFamily: "keep_learning", selected: false, suggestedOwner: "Controller", action: "keep_learning_without_live_claims", ...defaults },
    { routeId: "no_action_trust_gap_resolved", routeFamily: "no_action", selected: false, suggestedOwner: "Controller", action: "no_action_when_trust_gap_is_resolved", ...defaults },
  ];
}

function buildLiveProofTrustGapRepairRoom(workspace, session) {
  const decisionRoom = buildLiveToPaidPilotDecisionRoom(workspace, session);
  const selectedDecisionRoute = (decisionRoom.routePackets || []).find((route) => route.selected) || {};
  const selectedRoute = liveProofTrustGapRepairRoutes().find((route) => route.selected);
  const blockedActions = paidAskOutcomeRouterBlockedActions();

  return {
    format: LIVE_PROOF_TRUST_GAP_REPAIR_ROOM_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "local_sample_or_owner_approved_redacted_trust_gap_repair_no_external_actions",
    queueItemId: "NORTHSTAR-LIVE-PROOF-TRUST-GAP-REPAIR-ROOM",
    appSurfacePath: "website/app.html#live-proof-trust-gap-repair-room",
    adminSurfacePath: "website/admin.html#live-proof-trust-gap-repair-room",
    consumedDecisionRoute: {
      sourceId: "live_to_paid_pilot_decision_room",
      path: "ops/product/live-to-paid-pilot-decision-room.sample.json",
      requiredRouteId: "product_repair_before_paid_pilot_ask",
      observedRouteId: selectedDecisionRoute.routeId || "product_repair_before_paid_pilot_ask",
      state: "consumed_product_repair_route",
      downstreamQueueMutationAllowed: false,
      delegatedDoneClaimAllowed: false,
    },
    trustPrivacyObjections: [
      { objectionId: "privacy_storage", label: "Privacy and storage", repairCopy: "Explain that this prototype uses safe labels and local exports only; do not request uploads or store raw customer materials here.", externalActionAllowed: false },
      { objectionId: "proof_provenance", label: "Proof provenance", repairCopy: "Show which source label supports each claim and mark unsupported claims as blocked until proof categories are supplied.", externalActionAllowed: false },
      { objectionId: "paid_ask_timing", label: "Paid ask timing", repairCopy: "State that a paid pilot ask stays blocked until trust, proof, support/refund, customer-data, and payment owner gates are ready.", externalActionAllowed: false },
    ],
    proofSourceCustody: [
      { sourceId: "resume_source_label", state: "safe_label_only", custody: "No raw resume text or customer material is exported.", rawMaterialIncluded: false },
      { sourceId: "job_source_label", state: "safe_label_only", custody: "Target role and job context stay summarized for repo-safe review.", rawMaterialIncluded: false },
      { sourceId: "session_note_label", state: "redacted_summary_only", custody: "Private replies, contact details, transcripts, dashboard URLs, and credentials are excluded.", rawMaterialIncluded: false },
    ],
    missingProofPrompts: [
      { promptId: "metric_category", label: "Metric category", ownerSafePrompt: "Which measurable result category would support this claim, if the candidate chooses to provide it?", storesRawMaterial: false },
      { promptId: "source_category", label: "Source category", ownerSafePrompt: "Which source category supports the rewrite: resume line, portfolio artifact, project note, manager feedback, or not yet proven?", storesRawMaterial: false },
      { promptId: "approval_state", label: "Approval state", ownerSafePrompt: "Should this claim be approved, softened, or held until proof is available?", storesRawMaterial: false },
    ],
    stopStates: {
      customerDataHandling: false,
      paymentLinkDisplay: false,
      checkoutDisplay: false,
      supportRefundPromise: false,
      outreachSend: false,
      scheduling: false,
      analyticsSend: false,
      providerMutation: false,
      publicProof: false,
      testimonialRequest: false,
      referralRequest: false,
      employerContact: false,
      autoApply: false,
      formFill: false,
      applicationSubmission: false,
      revenueClaim: false,
    },
    ownerSafeWording: [
      "I can show how each rewrite maps to a source label before we discuss any paid pilot.",
      "If a claim is not supported yet, I will mark the proof category needed instead of inventing detail.",
      "This review can stay local and redacted until customer-data, support/refund, and payment-owner gates are approved.",
    ],
    routePackets: liveProofTrustGapRepairRoutes(),
    exportPacket: {
      selectedRouteId: selectedRoute.routeId,
      handoffType: "owner_safe_trust_gap_repair_packet",
      recommendedOwner: selectedRoute.suggestedOwner,
      recommendedNextAction: "Repair missing-proof cues after the trust gap repair packet.",
      rawCustomerMaterialsIncluded: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      externalActionAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
    },
    blockedExternalActions: blockedActions,
    claimControls: {
      sampleOrOwnerApprovedRedactedOnly: true,
      safeLabelsOnly: true,
      exactlyOneSelectedRoute: true,
      noExternalActions: true,
      noPaymentOrCustomerDataHandling: true,
      noProviderMutation: true,
      noPublicProofOrRevenueClaim: true,
      noDownstreamQueueMutation: true,
      noDelegatedCompletionClaim: true,
      unsupportedClaimFlags: {
        sampleRepairReadiness: true,
        ownerApprovedRedactedEvidence: false,
        liveFeedback: false,
        willingnessToPay: false,
        paymentIntent: false,
        payment: false,
        publicProof: false,
        referralOrTestimonial: false,
        revenue: false,
      },
    },
    repoSafety: {
      sampleOrOwnerApprovedRedactedOnly: true,
      safeLabelsOnly: true,
      rawCustomerMaterialsExcluded: true,
      credentialsExcluded: true,
      contactDetailsExcluded: true,
      paymentDataExcluded: true,
      dashboardUrlsExcluded: true,
      privateRepliesExcluded: true,
      exactlyOneSelectedRoute: true,
      trustGapVisible: true,
      proofSourceCustodyVisible: true,
      missingProofPromptsVisible: true,
      noExternalActions: true,
      noPaymentLinkOrCheckoutDisplay: true,
      queueMutationAllowed: false,
      downstreamCompletionClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
    },
  };
}

function liveProofTrustGapRepairRoomMarkdown(room) {
  const selectedRoute = (room.routePackets || []).find((route) => route.selected) || {};
  return [
    "# ProofResume Live Proof Trust Gap Repair Room",
    "",
    `Format: ${room.format}`,
    `Generated: ${room.generatedAt}`,
    "",
    "## Consumed Decision Route",
    `- Required: ${room.consumedDecisionRoute.requiredRouteId}`,
    `- Observed: ${room.consumedDecisionRoute.observedRouteId}`,
    "",
    "## Trust And Privacy Objections",
    ...room.trustPrivacyObjections.map((item) => `- ${item.label}: ${item.repairCopy}`),
    "",
    "## Proof-Source Custody",
    ...room.proofSourceCustody.map((item) => `- ${item.sourceId}: ${item.state}; rawMaterialIncluded=${item.rawMaterialIncluded}`),
    "",
    "## Missing Proof Prompts",
    ...room.missingProofPrompts.map((item) => `- ${item.label}: ${item.ownerSafePrompt}`),
    "",
    "## Selected Route",
    `- Route: ${selectedRoute.routeId}`,
    `- Owner: ${selectedRoute.suggestedOwner}`,
    `- Action: ${selectedRoute.action}`,
    `- Reason: ${selectedRoute.reason || "Internal route only."}`,
    "",
  ].join("\n");
}

function renderLiveProofTrustGapRepairRoom(workspace, session) {
  const room = buildLiveProofTrustGapRepairRoom(workspace, session);
  const selectedRoute = (room.routePackets || []).find((route) => route.selected) || {};
  setText("[data-live-proof-trust-gap-repair-state]", "Missing-proof cue repair selected");
  setText("[data-live-proof-trust-gap-repair-route]", selectedRoute.routeId);
  setText("[data-live-proof-trust-gap-repair-route-detail]", `${selectedRoute.suggestedOwner}: ${selectedRoute.action}; queue mutation, payment/customer-data handling, and external action remain blocked.`);
  renderList("[data-live-proof-trust-gap-repair-sources]", [
    `${room.consumedDecisionRoute.sourceId}: ${room.consumedDecisionRoute.observedRouteId}`,
    `Required route: ${room.consumedDecisionRoute.requiredRouteId}`,
  ]);
  renderList("[data-live-proof-trust-gap-repair-objections]", room.trustPrivacyObjections.map((item) => `${item.label}: ${item.repairCopy}`));
  renderList("[data-live-proof-trust-gap-repair-custody]", room.proofSourceCustody.map((item) => `${item.sourceId}: ${item.state}; rawMaterialIncluded=${item.rawMaterialIncluded}`));
  renderList("[data-live-proof-trust-gap-repair-missing-proof]", room.missingProofPrompts.map((item) => `${item.label}: ${item.ownerSafePrompt}`));
  renderList("[data-live-proof-trust-gap-repair-stops]", Object.entries(room.stopStates).map(([key, value]) => `${key}: ${value}`));
  renderList("[data-live-proof-trust-gap-repair-wording]", room.ownerSafeWording);
  setText("[data-live-proof-trust-gap-repair-preview]", liveProofTrustGapRepairRoomMarkdown(room));
}

function liveProofMissingProofCueRepairRoutes() {
  const defaults = {
    externalActionAllowed: false,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
    paymentOrCustomerDataHandlingAllowed: false,
    providerActionAllowed: false,
    mustNotMarkDelegatedWorkDone: true,
  };
  return [
    {
      routeId: "business_no_send_follow_up",
      routeFamily: "business_no_send_follow_up",
      selected: true,
      suggestedOwner: "Business Operator",
      action: "prepare_no_send_missing_proof_follow_up",
      reason: "Missing proof cues are ranked enough for a no-send owner follow-up draft, but no live send or paid ask is allowed.",
      ownerSafeHandoff: "Draft category-only follow-up prompts for owner review without raw customer materials or unsupported demand claims.",
      ...defaults,
    },
    { routeId: "product_repair_more_cues", routeFamily: "product_repair", selected: false, suggestedOwner: "Product Worker", action: "repair_missing_proof_cue_copy", ...defaults },
    { routeId: "strategy_repair_threshold", routeFamily: "strategy_threshold", selected: false, suggestedOwner: "Strategy Worker", action: "define_missing_proof_threshold", ...defaults },
    { routeId: "qa_reviewer_boundary_check", routeFamily: "qa_reviewer_check", selected: false, suggestedOwner: "QA / Reviewer", action: "verify_missing_proof_boundaries", ...defaults },
    { routeId: "keep_learning_until_evidence", routeFamily: "keep_learning", selected: false, suggestedOwner: "Controller", action: "keep_learning_without_live_claims", ...defaults },
    { routeId: "no_action_missing_proof_clear", routeFamily: "no_action", selected: false, suggestedOwner: "Controller", action: "no_action_when_missing_proof_cues_are_clear", ...defaults },
  ];
}

function buildLiveProofMissingProofCueRepair(workspace, session) {
  const trustRepair = buildLiveProofTrustGapRepairRoom(workspace, session);
  const selectedTrustRoute = (trustRepair.routePackets || []).find((route) => route.selected) || {};
  const selectedRoute = liveProofMissingProofCueRepairRoutes().find((route) => route.selected);
  const gaps = [
    { gapId: "impact_metric", label: "Impact metric", customerValue: 5, claimRisk: 5, ownerFollowUpEase: 4, paidPilotRelevance: 5, safeFollowUpPrompt: "Which measurable result category can support this outcome claim?", storesRawMaterial: false },
    { gapId: "source_artifact", label: "Source artifact category", customerValue: 4, claimRisk: 5, ownerFollowUpEase: 3, paidPilotRelevance: 5, safeFollowUpPrompt: "Which source category should be cited for this rewrite: resume line, project note, portfolio artifact, manager feedback, or not yet proven?", storesRawMaterial: false },
    { gapId: "approval_state", label: "Candidate approval state", customerValue: 4, claimRisk: 4, ownerFollowUpEase: 5, paidPilotRelevance: 4, safeFollowUpPrompt: "Should the claim be approved, softened, or held until proof is available?", storesRawMaterial: false },
  ].map((gap) => ({ ...gap, priorityScore: gap.customerValue + gap.claimRisk + gap.ownerFollowUpEase + gap.paidPilotRelevance }));
  gaps.sort((left, right) => right.priorityScore - left.priorityScore);

  return {
    format: LIVE_PROOF_MISSING_PROOF_CUE_REPAIR_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "local_sample_or_owner_approved_redacted_missing_proof_cue_repair_no_external_actions",
    queueItemId: "NORTHSTAR-LIVE-PROOF-MISSING-PROOF-CUE-REPAIR",
    appSurfacePath: "website/app.html#live-proof-missing-proof-cue-repair",
    adminSurfacePath: "website/admin.html#live-proof-missing-proof-cue-repair",
    consumedTrustRepairRoute: {
      sourceId: "live_proof_trust_gap_repair_room",
      path: "ops/product/live-proof-trust-gap-repair-room.sample.json",
      requiredRouteId: "missing_proof_cue_repair",
      observedRouteId: selectedTrustRoute.routeId || "missing_proof_cue_repair",
      state: "consumed_missing_proof_cue_route",
      downstreamQueueMutationAllowed: false,
      delegatedDoneClaimAllowed: false,
    },
    priorityModel: {
      factors: ["customerValue", "claimRisk", "ownerFollowUpEase", "paidPilotRelevance"],
      sort: "highest_total_priority_first",
      rawCustomerMaterialsStored: false,
    },
    prioritizedProofGaps: gaps,
    ownerFacingFollowUpPrompts: gaps.map((gap) => ({
      promptId: `${gap.gapId}_owner_prompt`,
      gapId: gap.gapId,
      prompt: gap.safeFollowUpPrompt,
      requestType: "proof_category_only",
      storesRawMaterial: false,
      externalSendAllowed: false,
    })),
    routePackets: liveProofMissingProofCueRepairRoutes(),
    exportPacket: {
      selectedRouteId: selectedRoute.routeId,
      handoffType: "owner_safe_missing_proof_cue_packet",
      recommendedOwner: selectedRoute.suggestedOwner,
      recommendedNextAction: "Prepare a no-send missing-proof follow-up draft for owner review.",
      rawCustomerMaterialsIncluded: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      externalActionAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
    },
    blockedExternalActions: paidAskOutcomeRouterBlockedActions(),
    claimControls: {
      sampleOrOwnerApprovedRedactedOnly: true,
      safeLabelsOnly: true,
      exactlyOneSelectedRoute: true,
      noExternalSends: true,
      noPaymentOrCustomerDataHandling: true,
      noUnsupportedTractionOrRevenueClaims: true,
      noDownstreamQueueMutation: true,
      noDelegatedCompletionClaim: true,
    },
    repoSafety: {
      sampleOrOwnerApprovedRedactedOnly: true,
      safeLabelsOnly: true,
      rawCustomerMaterialsExcluded: true,
      proofGapsPrioritized: true,
      ownerPromptsCategoryOnly: true,
      noExternalActions: true,
      noPaymentOrCustomerDataHandling: true,
      queueMutationAllowed: false,
      downstreamCompletionClaimAllowed: false,
      providerActionAllowed: false,
    },
  };
}

function liveProofMissingProofCueRepairMarkdown(room) {
  const selectedRoute = (room.routePackets || []).find((route) => route.selected) || {};
  return [
    "# ProofResume Live Proof Missing-Proof Cue Repair",
    "",
    `Format: ${room.format}`,
    `Generated: ${room.generatedAt}`,
    "",
    "## Prioritized Proof Gaps",
    ...room.prioritizedProofGaps.map((gap) => `- ${gap.label}: score ${gap.priorityScore}; ${gap.safeFollowUpPrompt}`),
    "",
    "## Owner Follow-Up Prompts",
    ...room.ownerFacingFollowUpPrompts.map((prompt) => `- ${prompt.prompt}`),
    "",
    "## Selected Route",
    `- Route: ${selectedRoute.routeId}`,
    `- Owner: ${selectedRoute.suggestedOwner}`,
    `- Action: ${selectedRoute.action}`,
    `- Reason: ${selectedRoute.reason || "Internal route only."}`,
    "",
  ].join("\n");
}

function renderLiveProofMissingProofCueRepair(workspace, session) {
  const room = buildLiveProofMissingProofCueRepair(workspace, session);
  const selectedRoute = (room.routePackets || []).find((route) => route.selected) || {};
  setText("[data-live-proof-missing-proof-cue-state]", "No-send follow-up route selected");
  setText("[data-live-proof-missing-proof-cue-route]", selectedRoute.routeId);
  setText("[data-live-proof-missing-proof-cue-route-detail]", `${selectedRoute.suggestedOwner}: ${selectedRoute.action}; external send, queue mutation, payment/customer-data handling, and done claims remain blocked.`);
  renderList("[data-live-proof-missing-proof-cue-gaps]", room.prioritizedProofGaps.map((gap) => `${gap.label}: score ${gap.priorityScore}; ${gap.safeFollowUpPrompt}`));
  renderList("[data-live-proof-missing-proof-cue-scoring]", Object.entries(room.priorityModel).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`));
  renderList("[data-live-proof-missing-proof-cue-prompts]", room.ownerFacingFollowUpPrompts.map((prompt) => `${prompt.requestType}: ${prompt.prompt}`));
  renderList("[data-live-proof-missing-proof-cue-blocked]", Object.entries(room.blockedExternalActions).map(([key, value]) => `${key}: ${value}`));
  setText("[data-live-proof-missing-proof-cue-preview]", liveProofMissingProofCueRepairMarkdown(room));
}

function paidPilotTrustGapRepairLabRoutes() {
  const defaults = {
    externalActionAllowed: false,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
    paymentOrCustomerDataHandlingAllowed: false,
    providerActionAllowed: false,
    mustNotMarkDelegatedWorkDone: true,
  };
  return [
    {
      routeId: "business_no_send_owner_prospect_prep",
      routeFamily: "business_no_send_owner_prospect_prep",
      selected: true,
      suggestedOwner: "Business Operator",
      action: "prepare_no_send_paid_pilot_trust_objection_response",
      reason: "Proof gaps are clear enough for a no-send response rehearsal, but live paid-pilot authority remains gated.",
      ownerSafeHandoff: "Prepare a private owner/prospect response draft that explains proof strength, gaps, disqualifiers, and stops without checkout or live claims.",
      ...defaults,
    },
    { routeId: "product_proof_repair", routeFamily: "product_proof_repair", selected: false, suggestedOwner: "Product Worker", action: "repair_proof_strength_lab_copy", ...defaults },
    { routeId: "strategy_threshold_update", routeFamily: "strategy_threshold_update", selected: false, suggestedOwner: "Strategy Worker", action: "define_paid_pilot_trust_threshold", ...defaults },
    { routeId: "approval_owner_evidence_repair", routeFamily: "approval_unblocker_owner_evidence_repair", selected: false, suggestedOwner: "Approval Unblocker", action: "repair_paid_pilot_owner_evidence", ...defaults },
    { routeId: "qa_reviewer_check", routeFamily: "qa_reviewer_check", selected: false, suggestedOwner: "QA / Reviewer", action: "verify_paid_pilot_trust_lab_boundaries", ...defaults },
    { routeId: "commons_follow_up", routeFamily: "commons_follow_up", selected: false, suggestedOwner: "Commons Worker", action: "generalize_trust_gap_close_pattern", ...defaults },
    { routeId: "keep_learning", routeFamily: "keep_learning", selected: false, suggestedOwner: "Controller", action: "keep_learning_without_live_claims", ...defaults },
    { routeId: "no_action", routeFamily: "no_action", selected: false, suggestedOwner: "Controller", action: "no_action_when_paid_pilot_trust_lab_is_clear", ...defaults },
  ];
}

function buildPaidPilotTrustGapRepairLab(workspace, session) {
  const decisionRoom = buildLiveToPaidPilotDecisionRoom(workspace, session);
  const copilot = buildFirstLiveProofAuditCopilot(workspace, session);
  const trustRepair = buildLiveProofTrustGapRepairRoom(workspace, session);
  const missingProof = buildLiveProofMissingProofCueRepair(workspace, session);
  const selectedRoute = paidPilotTrustGapRepairLabRoutes().find((route) => route.selected);
  return {
    format: PAID_PILOT_TRUST_GAP_REPAIR_LAB_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "local_sample_redacted_paid_pilot_trust_gap_repair_lab_no_external_actions",
    queueItemId: "NORTHSTAR-PAID-PILOT-TRUST-GAP-REPAIR-LAB",
    appSurfacePath: "website/app.html#paid-pilot-trust-gap-repair-lab",
    adminSurfacePath: "website/admin.html#paid-pilot-trust-gap-repair-lab",
    consumedArtifacts: [
      { id: "live_to_paid_pilot_decision_room", path: "ops/product/live-to-paid-pilot-decision-room.sample.json", state: decisionRoom?.format ? "consumed_decision_route" : "fallback_required" },
      { id: "first_live_proof_audit_copilot", path: "ops/product/first-live-proof-audit-copilot.sample.json", state: copilot?.format ? "consumed_audit_copilot" : "fallback_required" },
      { id: "live_proof_trust_gap_repair_room", path: "ops/product/live-proof-trust-gap-repair-room.sample.json", state: trustRepair?.format ? "consumed_trust_repair" : "fallback_required" },
      { id: "live_proof_missing_proof_cue_repair", path: "ops/product/live-proof-missing-proof-cue-repair.sample.json", state: missingProof?.format ? "consumed_missing_proof_cues" : "fallback_required" },
      { id: "paid_ask_objection_response_simulator", path: "ops/product/paid-ask-objection-response-simulator.sample.json", state: "consumed_objection_routes" },
      { id: "first_dollar_owner_evidence_repair_room", path: "ops/product/first-dollar-owner-evidence-repair-room.sample.json", state: "consumed_owner_evidence_stops" },
      { id: "business_controls", path: "ops/BUSINESS_CONTROLS.json", state: "controls_loaded" },
    ],
    proofStrengthGaps: [
      { gapId: "target_role_fit", state: "repair_needed", prompt: "Explain fit as evidence-backed readiness, not outcome prediction.", externalActionAllowed: false },
      { gapId: "claim_provenance", state: "repair_needed", prompt: "Name the source label behind each strong claim or mark it unsupported.", externalActionAllowed: false },
      { gapId: "missing_evidence", state: "repair_needed", prompt: "Ask for proof categories before offering stronger bullets.", externalActionAllowed: false },
      { gapId: "trust_privacy", state: "repair_needed", prompt: "Explain local/redacted handling and stop before customer-data storage.", externalActionAllowed: false },
      { gapId: "support_refund", state: "blocked", prompt: "Do not imply support or refund terms until owner evidence exists.", externalActionAllowed: false },
      { gapId: "customer_data_stop", state: "blocked", prompt: "Do not collect production resume materials here.", externalActionAllowed: false },
      { gapId: "payment_owner_stop", state: "blocked", prompt: "Do not show checkout or payment links until owner evidence exists.", externalActionAllowed: false },
      { gapId: "public_proof_stop", state: "blocked", prompt: "Do not request testimonials, referrals, or public proof.", externalActionAllowed: false },
    ],
    operatorSafeRepairPrompts: [
      "I can show the proof label behind each suggested change before we discuss a paid concierge pilot.",
      "If a claim is missing support, I will ask for a proof category or hold the claim.",
      "A paid pilot stays blocked until customer-data, support/refund, payment-owner, and public-proof gates are answered.",
    ],
    disqualifiers: [
      "candidate_consent_missing",
      "unsupported_claim_requested",
      "customer_data_stop_unresolved",
      "payment_owner_stop_unresolved",
      "public_proof_requested_too_early",
    ],
    routePackets: paidPilotTrustGapRepairLabRoutes(),
    exportPacket: {
      selectedRouteId: selectedRoute.routeId,
      handoffType: "owner_safe_paid_pilot_trust_objection_lab",
      recommendedOwner: selectedRoute.suggestedOwner,
      recommendedNextAction: "Prepare no-send owner/prospect paid-pilot trust objection response.",
      rawCustomerMaterialsIncluded: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      externalActionAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
    },
    blockedExternalActions: paidAskOutcomeRouterBlockedActions(),
    repoSafety: {
      sampleOnlyEvidence: true,
      safeLabelsOnly: true,
      rawCustomerMaterialsExcluded: true,
      exactlyOneSelectedRoute: true,
      noPaymentOrCustomerDataHandling: true,
      noProviderAction: true,
      noUnsupportedFeedbackOrRevenueClaims: true,
      noDownstreamQueueMutation: true,
      noDelegatedDoneClaim: true,
    },
  };
}

function paidPilotTrustGapRepairLabMarkdown(lab) {
  const selectedRoute = (lab.routePackets || []).find((route) => route.selected) || {};
  return [
    "# ProofResume Paid Pilot Trust Gap Repair Lab",
    "",
    `Format: ${lab.format}`,
    `Generated: ${lab.generatedAt}`,
    "",
    "## Proof-Strength Gaps",
    ...lab.proofStrengthGaps.map((gap) => `- ${gap.gapId}: ${gap.state}; ${gap.prompt}`),
    "",
    "## Operator-Safe Repair Prompts",
    ...lab.operatorSafeRepairPrompts.map((prompt) => `- ${prompt}`),
    "",
    "## Selected Route",
    `- Route: ${selectedRoute.routeId}`,
    `- Owner: ${selectedRoute.suggestedOwner}`,
    `- Action: ${selectedRoute.action}`,
    "",
  ].join("\n");
}

function renderPaidPilotTrustGapRepairLab(workspace, session) {
  const lab = buildPaidPilotTrustGapRepairLab(workspace, session);
  const selectedRoute = (lab.routePackets || []).find((route) => route.selected) || {};
  setText("[data-paid-pilot-trust-gap-lab-state]", "No-send paid-pilot response selected");
  setText("[data-paid-pilot-trust-gap-lab-route]", selectedRoute.routeId);
  setText("[data-paid-pilot-trust-gap-lab-route-detail]", `${selectedRoute.suggestedOwner}: ${selectedRoute.action}; checkout, send, customer/payment handling, queue mutation, and done claims remain blocked.`);
  renderList("[data-paid-pilot-trust-gap-lab-gaps]", lab.proofStrengthGaps.map((gap) => `${gap.gapId}: ${gap.state}; ${gap.prompt}`));
  renderList("[data-paid-pilot-trust-gap-lab-prompts]", lab.operatorSafeRepairPrompts);
  renderList("[data-paid-pilot-trust-gap-lab-disqualifiers]", lab.disqualifiers);
  setText("[data-paid-pilot-trust-gap-lab-preview]", paidPilotTrustGapRepairLabMarkdown(lab));
}

function proofDeltaValueSnapshotRoutes() {
  const defaults = {
    externalActionAllowed: false,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
    paymentOrCustomerDataHandlingAllowed: false,
    providerActionAllowed: false,
    mustNotMarkDelegatedWorkDone: true,
  };
  return [
    { routeId: "business_no_send_follow_up", routeFamily: "business_no_send_follow_up", selected: true, suggestedOwner: "Business Operator", action: "prepare_no_send_proof_delta_follow_up", reason: "The sample proof delta is clear enough for owner-reviewed follow-up, not live send or checkout.", ...defaults },
    { routeId: "product_repair", routeFamily: "product_repair", selected: false, suggestedOwner: "Product Worker", action: "repair_proof_delta_snapshot", ...defaults },
    { routeId: "strategy_threshold_update", routeFamily: "strategy_threshold_update", selected: false, suggestedOwner: "Strategy Worker", action: "define_proof_delta_threshold", ...defaults },
    { routeId: "qa_reviewer", routeFamily: "qa_reviewer", selected: false, suggestedOwner: "QA / Reviewer", action: "verify_proof_delta_boundaries", ...defaults },
    { routeId: "owner_gate", routeFamily: "owner_gate", selected: false, suggestedOwner: "Approval Unblocker", action: "repair_owner_gate_before_live_use", ...defaults },
    { routeId: "keep_learning", routeFamily: "keep_learning", selected: false, suggestedOwner: "Controller", action: "keep_learning_without_live_claims", ...defaults },
    { routeId: "no_action", routeFamily: "no_action", selected: false, suggestedOwner: "Controller", action: "no_action_when_snapshot_is_clear", ...defaults },
  ];
}

function buildProofDeltaValueSnapshot(workspace, session) {
  const selectedRoute = proofDeltaValueSnapshotRoutes().find((route) => route.selected);
  return {
    format: PROOF_DELTA_VALUE_SNAPSHOT_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "local_sample_redacted_proof_delta_value_snapshot_no_external_actions",
    queueItemId: "NORTHSTAR-PROOF-DELTA-VALUE-SNAPSHOT",
    appSurfacePath: "website/app.html#proof-delta-value-snapshot",
    adminSurfacePath: "website/admin.html#proof-delta-value-snapshot",
    consumedArtifacts: [
      { id: "live_to_paid_pilot_decision_room", path: "ops/product/live-to-paid-pilot-decision-room.sample.json", state: "consumed_decision_route" },
      { id: "first_paid_pilot_fulfillment_receipt_preview", path: "ops/product/first-paid-pilot-fulfillment-receipt-preview.sample.json", state: "consumed_receipt_scope" },
      { id: "paid_pilot_trust_gap_repair_lab", path: "ops/product/paid-pilot-trust-gap-repair-lab.sample.json", state: "consumed_trust_lab" },
      { id: "business_controls", path: "ops/BUSINESS_CONTROLS.json", state: "controls_loaded" },
    ],
    proofDeltas: [
      { deltaId: "generic_to_evidence_backed_metric", before: "Led operations improvements across teams.", after: "Reduced handoff delays by using weekly exception reviews and escalation notes.", sourceLabel: "sample_project_note", confidence: "medium", proofStrength: 3, missingProofAsk: "Add measurable before/after timing category if available.", unsupportedClaimWarning: true },
      { deltaId: "claim_scope_softening", before: "Owned all customer success strategy.", after: "Coordinated customer-success reporting and surfaced retention risks for manager review.", sourceLabel: "sample_resume_line", confidence: "high", proofStrength: 4, missingProofAsk: "Confirm scope and approval state before using stronger ownership language.", unsupportedClaimWarning: false }
    ],
    evidenceStates: {
      sampleProofDelta: true,
      liveCustomerFeedback: false,
      willingnessToPay: false,
      paymentIntent: false,
      payment: false,
      publicProof: false,
      referralOrTestimonial: false,
      revenue: false,
    },
    paidPilotScopeBoundaries: [
      "Can improve proof mapping, missing-proof prompts, and claim softening.",
      "Cannot promise interviews, response rates, payment outcomes, public proof, or employer contact.",
      "Cannot collect production resume materials until customer-data gates are approved.",
    ],
    routePackets: proofDeltaValueSnapshotRoutes(),
    exportPacket: {
      selectedRouteId: selectedRoute.routeId,
      handoffType: "owner_safe_proof_delta_value_snapshot",
      recommendedOwner: selectedRoute.suggestedOwner,
      recommendedNextAction: "Prepare no-send proof-delta follow-up for owner review.",
      rawCustomerMaterialsIncluded: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      externalActionAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
    },
    blockedExternalActions: paidAskOutcomeRouterBlockedActions(),
    repoSafety: {
      sampleOnlyEvidence: true,
      rawCustomerMaterialsExcluded: true,
      exactlyOneSelectedRoute: true,
      evidenceStatesSeparated: true,
      noExternalActions: true,
      noPaymentOrCustomerDataHandling: true,
      noUnsupportedTractionOrRevenueClaims: true,
      queueMutationAllowed: false,
      downstreamCompletionClaimAllowed: false,
      providerActionAllowed: false,
    },
  };
}

function proofDeltaValueSnapshotMarkdown(snapshot) {
  const selectedRoute = (snapshot.routePackets || []).find((route) => route.selected) || {};
  return [
    "# ProofResume Proof Delta Value Snapshot",
    "",
    `Format: ${snapshot.format}`,
    `Generated: ${snapshot.generatedAt}`,
    "",
    "## Proof Deltas",
    ...snapshot.proofDeltas.map((delta) => `- Before: ${delta.before}\n  After: ${delta.after}\n  Source: ${delta.sourceLabel}; proof ${delta.proofStrength}; missing: ${delta.missingProofAsk}`),
    "",
    "## Selected Route",
    `- Route: ${selectedRoute.routeId}`,
    `- Owner: ${selectedRoute.suggestedOwner}`,
    `- Action: ${selectedRoute.action}`,
    "",
  ].join("\n");
}

function renderProofDeltaValueSnapshot(workspace, session) {
  const snapshot = buildProofDeltaValueSnapshot(workspace, session);
  const selectedRoute = (snapshot.routePackets || []).find((route) => route.selected) || {};
  setText("[data-proof-delta-value-state]", "No-send proof delta selected");
  setText("[data-proof-delta-value-route]", selectedRoute.routeId);
  setText("[data-proof-delta-value-route-detail]", `${selectedRoute.suggestedOwner}: ${selectedRoute.action}; sends, payment/customer data, queue mutation, and done claims remain blocked.`);
  renderList("[data-proof-delta-value-bullets]", snapshot.proofDeltas.map((delta) => `${delta.before} -> ${delta.after}; source=${delta.sourceLabel}; proof=${delta.proofStrength}`));
  renderList("[data-proof-delta-value-missing]", snapshot.proofDeltas.map((delta) => delta.missingProofAsk));
  renderList("[data-proof-delta-value-boundaries]", Object.entries(snapshot.evidenceStates).map(([key, value]) => `${key}: ${value}`));
  setText("[data-proof-delta-value-preview]", proofDeltaValueSnapshotMarkdown(snapshot));
}

function firstSessionSummaryItems(handoff) {
  return [
    `Account: ${handoff.account.signedIn ? "local demo signed in" : "not signed in"} | Workspace: ${handoff.account.workspaceId || "none"}`,
    `Resume: ${handoff.resume.imported ? `${handoff.resume.filename} (${handoff.resume.wordCount} words)` : "not imported"}`,
    `Target: ${handoff.targetPreferences.targetRole || handoff.targetPreferences.desiredRoles[0] || "not saved"} | ${handoff.targetPreferences.location || handoff.targetPreferences.workMode || "no location/work-mode preference"}`,
    `Matched job: ${handoff.matchedJob ? `${handoff.matchedJob.title} at ${handoff.matchedJob.company || "unknown company"} (${handoff.matchedJob.fitScore ?? "--"}/100)` : "none selected"}`,
    `Packet/tracking: ${handoff.tailoredPacket ? `${handoff.approvalTracking.status}; approval ${handoff.approvalTracking.approvalReady ? "ready" : "needs review"}` : "no tailored packet"}`,
    `Comprehension/trust: ${handoff.testerFeedback.proofLoopComprehension || "not captured"} / ${handoff.testerFeedback.trustInEvidence || "not captured"}`,
    `Materials/paid signal: ${handoff.testerFeedback.willingnessToShareMaterials || "not captured"} / ${handoff.testerFeedback.paidPacketInterest || handoff.testerFeedback.willingnessToPay || "not captured"} | Next: ${handoff.testerFeedback.requestedNextAction || handoff.journey.nextAction}`,
  ];
}

function firstSessionMarkdown(handoff) {
  const feedback = handoff.testerFeedback || {};
  return [
    "# ProofResume First-Session Handoff",
    "",
    `Format: ${handoff.format}`,
    `Generated: ${handoff.generatedAt}`,
    "",
    "## Boundary",
    "- Local-only prototype summary.",
    "- Resume text and contact details are redacted from this export.",
    "- No network, analytics, outbound, production storage, auto-apply, or application submission action occurred.",
    "- Rehearsal evidence is sample/local only and is not real customer feedback, revenue, willingness-to-pay, or outcome proof.",
    "",
    "## State Summary",
    ...firstSessionSummaryItems(handoff).map((item) => `- ${item}`),
    "",
    "## Remaining Proof Gaps",
    ...fallbackList(handoff.remainingProofGaps, "No tracked proof gaps yet. Human review is still required.").map((item) => `- ${item}`),
    "",
    "## Tester Feedback",
    `- Segment: ${feedback.testerSegment || "Not captured"}`,
    `- Proof-loop comprehension: ${feedback.proofLoopComprehension || "Not captured"}`,
    `- Trust in evidence: ${feedback.trustInEvidence || "Not captured"}`,
    `- Strongest objection: ${feedback.strongestObjection || feedback.objections || "Not captured"}`,
    `- Confusion points: ${feedback.confusionPoints || "Not captured"}`,
    `- Willingness to share materials: ${feedback.willingnessToShareMaterials || "Not captured"}`,
    `- Paid-packet interest: ${feedback.paidPacketInterest || feedback.willingnessToPay || "Not captured"}`,
    `- Requested next action: ${feedback.requestedNextAction || "Not captured"}`,
    "",
    "## Rehearsal Evidence Guardrail",
    `- Format: ${handoff.rehearsalEvidence?.format || FIRST_SESSION_REHEARSAL_FORMAT}`,
    `- Mode: ${handoff.rehearsalEvidence?.mode || "local_sample_rehearsal_only"}`,
    "- Forbidden repo-visible artifacts: prospect names, contact details, raw resumes, private replies, payment data, credentials, customer materials, screenshots.",
    "- Queue translation guardrail: do not claim real feedback, willingness-to-pay, revenue, public proof, or customer outcome evidence from this rehearsal.",
    "",
  ].join("\n");
}

function downloadLocalFile(filename, content, type = "application/json") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function applicationWithApprovalGuardrails(application) {
  const approvalReady = applicationApprovalReady(application);
  const blockedReadyStatus = !approvalReady && ACTIVE_APPLICATION_STATUSES.includes(application.status);
  return {
    ...application,
    status: blockedReadyStatus ? "draft" : application.status,
    approvalReady,
  };
}

function textareaLines(value, fallbackValues = []) {
  const lines = String(value || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
  return lines.length ? unique(lines) : (Array.isArray(fallbackValues) ? fallbackValues : []);
}

function textFromPacketList(values) {
  return Array.isArray(values) ? values.join("\n") : "";
}

function packetEditSignature(application) {
  const packet = application?.packet || {};
  return JSON.stringify({
    resumeBulletSuggestions: packet.resumeBulletSuggestions || [],
    resumeChanges: packet.resumeChanges || [],
    coverNote: packet.coverNote || "",
    answers: packet.answers || [],
    proofGaps: packet.proofGaps || [],
    doNotInventBoundaries: packet.doNotInventBoundaries || [],
  });
}

function applicationPacketFromJob(job, workspace) {
  const rankedJob = {
    ...job,
    scoring: job.scoring || scoreJobForWorkspace(job, workspace?.resume, workspace?.profile),
  };
  const now = new Date().toISOString();
  const packet = applicationPacketContent(rankedJob, workspace, rankedJob.scoring);
  return {
    format: APPLICATION_PACKET_FORMAT,
    id: slugId("application", `${job.id}\n${job.title}\n${job.company}\n${now}`),
    jobId: job.id,
    title: job.title || "Untitled role",
    company: job.company || "",
    location: job.location || "",
    applyUrl: job.sourceUrl || "",
    status: "draft",
    outcome: "not_submitted",
    createdAt: now,
    updatedAt: now,
    checklist: emptyApprovalChecklist(job),
    scoring: rankedJob.scoring,
    packet: {
      ...packet,
      source: "local-workspace",
      targetPreferences: normalizeTargetPreferences(workspace?.profile || {}),
      localOnly: true,
      noExternalFetch: true,
      noOutboundSend: true,
      noAutoApply: true,
    },
    generationCount: 1,
    dryRunPlan: {
      preparedAt: "",
      externalAction: false,
      provider: "manual-export-or-approved-provider-later",
      steps: [
        "Open the verified apply URL manually.",
        "Review every application field against the approved packet.",
        "Stop for novel, sensitive, legal, MFA, CAPTCHA, account creation, or personal-judgment prompts.",
        "Submit only when the candidate approves this target job and all answers/materials.",
      ],
    },
    notes: "",
    localOnly: true,
    noExternalFetch: true,
    noOutboundSend: true,
    noAutoApply: true,
  };
}

function regeneratedApplicationPacket(application, workspace, options = {}) {
  const job = rankWorkspaceJobs(workspace).find((item) => item.id === application.jobId);
  if (!job) return null;
  const next = applicationPacketFromJob(job, workspace);
  return {
    ...application,
    applyUrl: options.reset ? next.applyUrl : application.applyUrl,
    status: options.reset ? "draft" : application.status || "draft",
    outcome: options.reset ? "not_submitted" : application.outcome || "not_submitted",
    checklist: options.reset ? emptyApprovalChecklist(job) : { ...emptyApprovalChecklist(job), ...(application.checklist || {}) },
    scoring: next.scoring,
    packet: next.packet,
    dryRunPlan: options.reset ? next.dryRunPlan : application.dryRunPlan,
    notes: options.reset ? "" : application.notes || "",
    editState: "generated",
    generationCount: Number(application.generationCount || 1) + 1,
  };
}

function appendApplicationAudit(workspace, applicationId, action, details) {
  const tracker = {
    ...emptyApplicationTrackerState(),
    ...(workspace.applicationTracker || {}),
    applications: Array.isArray(workspace.applicationTracker?.applications) ? workspace.applicationTracker.applications : [],
    auditLog: Array.isArray(workspace.applicationTracker?.auditLog) ? workspace.applicationTracker.auditLog : [],
  };
  tracker.auditLog = [
    {
      format: APPLICATION_AUDIT_FORMAT,
      id: slugId("audit", `${applicationId}\n${action}\n${Date.now()}`),
      applicationId,
      action,
      details,
      createdAt: new Date().toISOString(),
      localOnly: true,
      externalAction: false,
    },
    ...tracker.auditLog,
  ].slice(0, 120);
  tracker.updatedAt = new Date().toISOString();
  workspace.applicationTracker = tracker;
}

function upsertApplication(workspace, application, auditAction, details) {
  const tracker = {
    ...emptyApplicationTrackerState(),
    ...(workspace.applicationTracker || {}),
    applications: Array.isArray(workspace.applicationTracker?.applications) ? workspace.applicationTracker.applications : [],
    auditLog: Array.isArray(workspace.applicationTracker?.auditLog) ? workspace.applicationTracker.auditLog : [],
  };
  const nextApplication = applicationWithApprovalGuardrails({
    ...application,
    updatedAt: new Date().toISOString(),
    localOnly: true,
    noExternalFetch: true,
    noOutboundSend: true,
    noAutoApply: true,
  });
  tracker.applications = [
    nextApplication,
    ...tracker.applications.filter((item) => item.id !== application.id),
  ].slice(0, 80);
  tracker.updatedAt = nextApplication.updatedAt;
  workspace.applicationTracker = tracker;
  appendApplicationAudit(workspace, application.id, auditAction, details);
  workspace.updatedAt = new Date().toISOString();
  writeWorkspace(workspace);
  return nextApplication;
}

function createApplicationFromJob(workspace, jobId) {
  const job = rankWorkspaceJobs(workspace).find((item) => item.id === jobId);
  if (!job) return null;
  const existing = (workspace.applicationTracker?.applications || []).find((item) => item.jobId === jobId);
  if (existing) return existing;
  return upsertApplication(workspace, applicationPacketFromJob(job, workspace), "application_created", "Created browser-local approval packet from ranked workspace job.");
}

function applicationFromCard(card, application) {
  const checklist = { ...emptyApprovalChecklist(), ...(application.checklist || {}) };
  APPROVAL_CHECKLIST.forEach(([key]) => {
    const checkbox = card.querySelector(`[data-application-check="${key}"]`);
    if (checkbox) checklist[key] = checkbox.checked;
  });
  const packet = {
    ...(application.packet || {}),
    resumeBulletSuggestions: textareaLines(card.querySelector('[data-application-edit="resumeBulletSuggestions"]')?.value, application.packet?.resumeBulletSuggestions),
    resumeChanges: textareaLines(card.querySelector('[data-application-edit="resumeChanges"]')?.value, application.packet?.resumeChanges),
    coverNote: String(card.querySelector('[data-application-edit="coverNote"]')?.value || application.packet?.coverNote || "").trim(),
    answers: textareaLines(card.querySelector('[data-application-edit="answers"]')?.value, application.packet?.answers),
    proofGaps: textareaLines(card.querySelector('[data-application-edit="proofGaps"]')?.value, application.packet?.proofGaps),
    doNotInventBoundaries: textareaLines(card.querySelector('[data-application-edit="doNotInventBoundaries"]')?.value, application.packet?.doNotInventBoundaries),
  };
  const edited = packetEditSignature({ packet }) !== packetEditSignature(application);
  return {
    ...application,
    applyUrl: String(card.querySelector("[data-application-apply-url]")?.value || "").trim(),
    status: String(card.querySelector("[data-application-status]")?.value || application.status || "draft"),
    outcome: String(card.querySelector("[data-application-outcome]")?.value || application.outcome || "not_submitted"),
    notes: String(card.querySelector("[data-application-notes]")?.value || "").trim(),
    checklist,
    packet: {
      ...packet,
      editedAt: edited ? new Date().toISOString() : application.packet?.editedAt || "",
      editSource: edited ? "browser-local-user-edit" : application.packet?.editSource || "",
    },
    editState: edited ? "edited" : application.editState || "generated",
  };
}

function renderApplicationTracker(workspace) {
  const list = document.querySelector("[data-application-list]");
  if (!list) return;
  const applications = Array.isArray(workspace?.applicationTracker?.applications) ? workspace.applicationTracker.applications : [];
  setText("[data-application-tracker-count]", `${applications.length} application${applications.length === 1 ? "" : "s"}`);
  list.innerHTML = "";
  const audit = document.querySelector("[data-application-audit]");
  if (audit) {
    audit.innerHTML = "";
    const events = workspace?.applicationTracker?.auditLog || [];
    if (!events.length) {
      const li = document.createElement("li");
      li.textContent = "No local application actions recorded yet.";
      audit.appendChild(li);
    } else {
      events.slice(0, 6).forEach((event) => {
        const li = document.createElement("li");
        li.textContent = `${formatDateTime(event.createdAt)}: ${event.action.replace(/_/g, " ")} (${event.details})`;
        audit.appendChild(li);
      });
    }
  }

  if (!workspace) {
    const empty = document.createElement("p");
    empty.className = "job-empty muted";
    empty.textContent = "Sign in locally before creating application packets.";
    list.appendChild(empty);
    return;
  }

  if (!applications.length) {
    const empty = document.createElement("p");
    empty.className = "job-empty muted";
    empty.textContent = "Create an approval packet from a ranked job to track consent, apply readiness, and outcomes.";
    list.appendChild(empty);
    return;
  }

  applications
    .slice()
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
    .forEach((application) => {
      const card = document.createElement("article");
      card.className = "application-card";
      card.dataset.applicationId = application.id;

      const head = document.createElement("div");
      head.className = "job-card-head";
      const titleBlock = document.createElement("div");
      const title = document.createElement("h4");
      title.textContent = `${application.title || "Untitled role"}${application.company ? ` at ${application.company}` : ""}`;
      const meta = document.createElement("p");
      meta.className = "muted";
      meta.textContent = `${applicationApprovalReady(application) ? "Approval ready" : "Needs approval"} | ${applicationStatusLabel(application.status)} | ${application.outcome || "not_submitted"}${application.editState === "edited" ? " | edited locally" : ""}`;
      titleBlock.append(title, meta);
      const badge = document.createElement("span");
      badge.className = "status-pill";
      badge.textContent = applicationStatusLabel(application.status);
      head.append(titleBlock, badge);

      const statusRail = document.createElement("div");
      statusRail.className = "application-status-rail";
      TRACKABLE_APPLICATION_STATUSES.forEach((status) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = status === application.status ? "" : "secondary";
        button.dataset.setApplicationStatus = application.id;
        button.dataset.nextApplicationStatus = status;
        button.textContent = applicationStatusLabel(status);
        statusRail.appendChild(button);
      });

      const checklist = document.createElement("div");
      checklist.className = "application-checklist";
      APPROVAL_CHECKLIST.forEach(([key, label]) => {
        const item = document.createElement("label");
        const input = document.createElement("input");
        input.type = "checkbox";
        input.dataset.applicationCheck = key;
        input.checked = application.checklist?.[key] === true;
        item.append(input, document.createTextNode(label));
        checklist.appendChild(item);
      });

      const packet = document.createElement("div");
      packet.className = "application-packet";
      const packetSections = [
        ["Resume bullet suggestions", application.packet?.resumeBulletSuggestions || []],
        ["Resume changes", application.packet?.resumeChanges || []],
        ["Claims to verify", application.packet?.claims || []],
        ["Application answers", application.packet?.answers || []],
        ["Proof gaps", application.packet?.proofGaps || []],
        ["Do-not-invent boundaries", application.packet?.doNotInventBoundaries || []],
      ];
      packetSections.forEach(([sectionTitle, values]) => {
        const section = document.createElement("section");
        section.className = "application-packet-section";
        const heading = document.createElement("h5");
        heading.textContent = sectionTitle;
        const ul = document.createElement("ul");
        fallbackList(values, "No local packet notes generated yet.").forEach((value) => {
          const li = document.createElement("li");
          li.textContent = value;
          ul.appendChild(li);
        });
        section.append(heading, ul);
        packet.appendChild(section);
      });
      const cover = document.createElement("section");
      cover.className = "application-packet-section";
      cover.innerHTML = `<h5>Cover note</h5><p class="muted">${escapeHtml(application.packet?.coverNote || "No local cover note generated yet.")}</p>`;
      packet.appendChild(cover);

      const editPanel = document.createElement("details");
      editPanel.className = "application-edit-panel";
      editPanel.innerHTML = `
        <summary>Edit packet locally</summary>
        <label>
          Resume bullet suggestions
          <textarea data-application-edit="resumeBulletSuggestions">${escapeHtml(textFromPacketList(application.packet?.resumeBulletSuggestions))}</textarea>
        </label>
        <label>
          Resume changes
          <textarea data-application-edit="resumeChanges">${escapeHtml(textFromPacketList(application.packet?.resumeChanges))}</textarea>
        </label>
        <label>
          Cover note
          <textarea data-application-edit="coverNote">${escapeHtml(application.packet?.coverNote || "")}</textarea>
        </label>
        <label>
          Application answers
          <textarea data-application-edit="answers">${escapeHtml(textFromPacketList(application.packet?.answers))}</textarea>
        </label>
        <label>
          Proof gaps
          <textarea data-application-edit="proofGaps">${escapeHtml(textFromPacketList(application.packet?.proofGaps))}</textarea>
        </label>
        <label>
          Do-not-invent boundaries
          <textarea data-application-edit="doNotInventBoundaries">${escapeHtml(textFromPacketList(application.packet?.doNotInventBoundaries))}</textarea>
        </label>
      `;

      const fields = document.createElement("div");
      fields.className = "application-fields";
      fields.innerHTML = `
        <label>
          Apply URL
          <input data-application-apply-url value="${escapeHtml(application.applyUrl || "")}" placeholder="Verified application URL or local reference" />
        </label>
        <label>
          Status
          <select data-application-status>
            ${APPLICATION_STATUS_OPTIONS.map((status) => `<option value="${status}"${application.status === status ? " selected" : ""}>${applicationStatusLabel(status)}</option>`).join("")}
          </select>
        </label>
        <label>
          Outcome
          <select data-application-outcome>
            ${["not_submitted", "waiting", "screen", "interview", "offer", "rejected", "withdrawn"].map((outcome) => `<option value="${outcome}"${application.outcome === outcome ? " selected" : ""}>${outcome.replace(/_/g, " ")}</option>`).join("")}
          </select>
        </label>
        <label>
          Notes
          <textarea data-application-notes placeholder="Manual outcome, blocker, or follow-up note">${escapeHtml(application.notes || "")}</textarea>
        </label>
      `;

      const dryRun = document.createElement("p");
      dryRun.className = "muted";
      dryRun.textContent = application.dryRunPlan?.preparedAt
        ? `Dry-run apply plan prepared ${formatDateTime(application.dryRunPlan.preparedAt)}. No external action occurred.`
        : `Packet generated locally${application.packet?.generatedAt ? ` ${formatDateTime(application.packet.generatedAt)}` : ""}. Regenerate and reset stay in this browser and cannot submit, send, upload, or fill external forms.`;

      const actions = document.createElement("div");
      actions.className = "app-actions";
      actions.innerHTML = `
        <button type="button" data-approve-application="${application.id}">Approve packet</button>
        <button type="button" class="secondary" data-save-application="${application.id}">Save tracking state</button>
        <button type="button" class="secondary" data-save-application-edits="${application.id}">Save edits</button>
        <button type="button" class="secondary" data-regenerate-application="${application.id}">Regenerate locally</button>
        <button type="button" class="secondary" data-reset-application="${application.id}">Reset packet</button>
        <button type="button" class="secondary" data-open-application-pack="${application.id}">Open packet in Target Job Pack</button>
        <button type="button" class="secondary" data-prepare-application="${application.id}">Prepare dry-run packet</button>
        <button type="button" class="secondary" data-export-application="${application.id}">Export packet</button>
        <button type="button" class="secondary" data-reject-application="${application.id}">Reject locally</button>
        <button type="button" class="secondary" data-remove-application="${application.id}">Remove</button>
      `;

      card.append(head, statusRail, packet, editPanel, checklist, fields, dryRun, actions);
      list.appendChild(card);
    });

}

function renderFirstSessionHandoff(workspace, session) {
  const handoff = buildFirstSessionHandoff(workspace, session);
  const readyCount = handoff.journey.completedSteps.length;
  setText("[data-handoff-readiness]", `${readyCount} of ${JOURNEY_STEPS.length} steps captured`);
  setText("[data-rehearsal-mode]", handoff.rehearsalEvidence.mode === "local_sample_rehearsal_only" ? "Sample/local rehearsal only" : "Local handoff");
  renderList("[data-handoff-summary]", firstSessionSummaryItems(handoff));
  renderList(
    "[data-handoff-proof-gaps]",
    fallbackList(handoff.remainingProofGaps, "No tracked proof gaps yet. Human review is still required.")
  );
  setText("[data-handoff-preview]", firstSessionMarkdown(handoff));

  const form = document.querySelector("[data-first-session-form]");
  if (form && workspace) {
    const feedback = {
      ...emptyFirstSessionFeedback(),
      ...(workspace.firstSessionFeedback || {}),
    };
    form.elements.testerSegment.value = feedback.testerSegment || "";
    form.elements.proofLoopComprehension.value = feedback.proofLoopComprehension || "";
    form.elements.trustInEvidence.value = feedback.trustInEvidence || "";
    form.elements.strongestObjection.value = feedback.strongestObjection || feedback.objections || "";
    form.elements.confusionPoints.value = feedback.confusionPoints || "";
    form.elements.willingnessToShareMaterials.value = feedback.willingnessToShareMaterials || "";
    form.elements.paidPacketInterest.value = feedback.paidPacketInterest || "";
    form.elements.requestedNextAction.value = feedback.requestedNextAction || "";
  }
}

function renderFirstSessionCustomerHandoffRoom(workspace, session) {
  const room = buildFirstSessionCustomerHandoffRoom(workspace, session);
  const readyCount = room.journey.filter((step) => step.state === "ready").length;
  setText("[data-customer-handoff-room-readiness]", `${readyCount} of ${room.journey.length} steps ready`);
  setText("[data-customer-handoff-room-route]", room.selectedNextRoute.route);
  setText("[data-customer-handoff-room-route-detail]", room.selectedNextRoute.detail);
  renderList(
    "[data-customer-handoff-room-path]",
    room.journey.map((step) => `${step.label}: ${step.state} - ${step.customerVisibleNextAction}`)
  );
  renderList("[data-customer-handoff-room-facts]", room.approvedFactsAndRecommendations);
  renderList("[data-customer-handoff-room-value]", room.valueReceipt);
  renderList("[data-customer-handoff-room-provenance]", room.rawInputProvenance);
  renderList("[data-customer-handoff-room-gates]", room.blockedGates.map((gate) => `${gate.label}: ${gate.detail}`));
  setText("[data-customer-handoff-room-preview]", firstSessionCustomerHandoffMarkdown(room));
}

function renderFirstSessionObjectionRepairWizard(workspace, session) {
  const wizard = buildFirstSessionObjectionRepairWizard(workspace, session);
  setText("[data-objection-wizard-readiness]", "Sample/redacted only");
  setText("[data-objection-wizard-route]", wizard.selectedRoute.action);
  setText(
    "[data-objection-wizard-route-detail]",
    `${wizard.selectedRoute.routeFamily} -> ${wizard.selectedRoute.target}; no external action, queue mutation, or done claim.`
  );
  renderList(
    "[data-objection-wizard-cases]",
    wizard.objectionSets.map((objection) => `${objection.selected ? "Selected: " : ""}${objection.label} - ${objection.route.routeFamily} / ${objection.route.action}`)
  );
  renderList("[data-objection-wizard-rationale]", [
    wizard.selectedRoute.rationale,
    `Owner ask: ${wizard.selectedRoute.ownerAsk}`,
  ]);
  renderList("[data-objection-wizard-validation]", wizard.selectedRoute.validationRequired);
  renderList("[data-objection-wizard-gates]", wizard.selectedRoute.blockedGates);
  setText("[data-objection-wizard-preview]", firstSessionObjectionRepairWizardMarkdown(wizard));
}

function renderFirstCustomerConciergeDemoBundle(workspace, session) {
  const bundle = buildFirstCustomerConciergeDemoBundle(workspace, session);
  setText("[data-concierge-demo-bundle-readiness]", "Bundle ready");
  setText("[data-concierge-demo-bundle-route]", bundle.bundle.selectedRoute.action);
  setText(
    "[data-concierge-demo-bundle-route-detail]",
    `${bundle.bundle.selectedRoute.routeFamily} -> ${bundle.bundle.selectedRoute.target}; no external action, queue mutation, or done claim.`
  );
  renderList("[data-concierge-demo-bundle-start]", bundle.bundle.start);
  renderList("[data-concierge-demo-bundle-run]", bundle.bundle.run);
  renderList("[data-concierge-demo-bundle-end]", bundle.bundle.end);
  renderList(
    "[data-concierge-demo-bundle-path]",
    bundle.bundle.customerVisibleNextActions.map((step) => `${step.label}: ${step.nextAction}`)
  );
  renderList("[data-concierge-demo-bundle-prompts]", bundle.bundle.operatorObservationPrompts);
  renderList("[data-concierge-demo-bundle-gates]", bundle.bundle.blockedGates);
  renderList(
    "[data-concierge-demo-bundle-false-flags]",
    Object.entries(bundle.repoSafety.falseFlags).map(([key, value]) => `${key}: ${value}`)
  );
  setText("[data-concierge-demo-bundle-preview]", firstCustomerConciergeDemoBundleMarkdown(bundle));
}

function renderFirstCustomerReactionRouteRecorder(workspace, session) {
  const recorder = buildFirstCustomerReactionRouteRecorder(workspace, session);
  setText("[data-reaction-route-recorder-readiness]", "Sample/redacted only");
  setText("[data-reaction-route-recorder-route]", recorder.selectedRoute.action);
  setText(
    "[data-reaction-route-recorder-route-detail]",
    `${recorder.selectedRoute.routeFamily} -> ${recorder.selectedRoute.target}; no external action, queue mutation, or done claim.`
  );
  renderList("[data-reaction-route-recorder-labels]", recorder.reactionSet.observationLabels);
  renderList("[data-reaction-route-recorder-classes]", recorder.reactionSet.objectionClasses);
  renderList(
    "[data-reaction-route-recorder-routes]",
    recorder.routeOptions.map((route) => `${route.selected ? "Selected: " : ""}${route.routeFamily} -> ${route.action}`)
  );
  renderList("[data-reaction-route-recorder-rationale]", [
    recorder.selectedRoute.rationale,
    `Owner ask: ${recorder.selectedRoute.ownerAsk}`,
  ]);
  renderList("[data-reaction-route-recorder-gates]", recorder.evidenceBoundary.blockedGates);
  renderList(
    "[data-reaction-route-recorder-false-claims]",
    Object.entries(recorder.evidenceBoundary.falseClaims).map(([key, value]) => `${key}: ${value}`)
  );
  setText("[data-reaction-route-recorder-preview]", firstCustomerReactionRouteRecorderMarkdown(recorder));
}

function renderFirstCustomerEvidenceInboxRoom(workspace, session) {
  const inbox = buildFirstCustomerEvidenceInboxRoom(workspace, session);
  setText("[data-evidence-inbox-room-readiness]", "Sample/redacted only");
  setText("[data-evidence-inbox-room-route]", inbox.selectedProvisionalRoute.action);
  setText(
    "[data-evidence-inbox-room-route-detail]",
    `${inbox.selectedProvisionalRoute.routeFamily} -> ${inbox.selectedProvisionalRoute.target}; no external action, queue mutation, or done claim.`
  );
  renderList(
    "[data-evidence-inbox-room-source-custody]",
    inbox.sourceArtifacts.map((artifact) => `${artifact.id}: ${artifact.state}`)
  );
  renderList("[data-evidence-inbox-room-modes]", inbox.sourceCustody.acceptedEvidenceModes);
  renderList("[data-evidence-inbox-room-labels]", inbox.evidenceEnvelope.observationLabels);
  renderList("[data-evidence-inbox-room-missing]", inbox.missingBeforeLiveUse);
  renderList("[data-evidence-inbox-room-gates]", inbox.blockedGates);
  renderList(
    "[data-evidence-inbox-room-false-claims]",
    Object.entries(inbox.claimBoundary.falseClaims).map(([key, value]) => `${key}: ${value}`)
  );
  renderList(
    "[data-evidence-inbox-room-routes]",
    inbox.provisionalRoutes.map((route) => `${route.selected ? "Selected: " : ""}${route.routeFamily} -> ${route.action}`)
  );
  setText("[data-evidence-inbox-room-preview]", firstCustomerEvidenceInboxRoomMarkdown(inbox));
}

function renderFirstCustomerEvidenceRouteScoreboard(workspace, session) {
  const scoreboard = buildFirstCustomerEvidenceRouteScoreboard(workspace, session);
  setText("[data-evidence-route-scoreboard-readiness]", "Fail-closed local scoreboard");
  setText("[data-evidence-route-scoreboard-route]", scoreboard.selectedRoute.action);
  setText(
    "[data-evidence-route-scoreboard-route-detail]",
    `${scoreboard.selectedRoute.routeFamily} -> ${scoreboard.selectedRoute.target}; no external action, queue mutation, payment/customer-data handling, or done claim.`
  );
  renderList(
    "[data-evidence-route-scoreboard-sources]",
    scoreboard.consumedArtifacts.map((artifact) => `${artifact.id}: ${artifact.state}`)
  );
  renderList(
    "[data-evidence-route-scoreboard-dimensions]",
    scoreboard.scoreDimensions.map((dimension) => `${dimension.label}: ${dimension.score}/${dimension.threshold} (${dimension.status})`)
  );
  renderList(
    "[data-evidence-route-scoreboard-routes]",
    scoreboard.routeOptions.map((route) => `${route.selected ? "Selected: " : ""}${route.routeFamily} -> ${route.action}`)
  );
  renderList(
    "[data-evidence-route-scoreboard-fixtures]",
    scoreboard.scoreFixtures.map((fixture) => `${fixture.id}: ${fixture.expectedRouteFamily}`)
  );
  renderList(
    "[data-evidence-route-scoreboard-false-claims]",
    Object.entries(scoreboard.claimControls.falseClaims).map(([key, value]) => `${key}: ${value}`)
  );
  renderList("[data-evidence-route-scoreboard-gates]", scoreboard.claimControls.blockedExternalGates);
  setText(
    "[data-evidence-route-scoreboard-ask]",
    scoreboard.narrowUserAsk || "No user ask. Product repair is the only safe local route for this sample."
  );
  setText("[data-evidence-route-scoreboard-preview]", firstCustomerEvidenceRouteScoreboardMarkdown(scoreboard));
}

function renderFirstCustomerEvidenceProofRepairPacket(workspace, session) {
  const packet = buildFirstCustomerEvidenceProofRepairPacket(workspace, session);
  setText("[data-evidence-proof-repair-readiness]", "Local proof repair ready");
  setText("[data-evidence-proof-repair-route]", packet.selectedInternalRoute.action);
  setText(
    "[data-evidence-proof-repair-route-detail]",
    `${packet.selectedInternalRoute.routeFamily} -> ${packet.selectedInternalRoute.target}; no external action, queue mutation, payment/customer-data handling, or done claim.`
  );
  renderList("[data-evidence-proof-repair-custody]", packet.sourceCustodyLabels);
  renderList(
    "[data-evidence-proof-repair-missing]",
    packet.missingProofCategories.map((category) => `${category.label}: ${category.repairGoal}`)
  );
  renderList(
    "[data-evidence-proof-repair-prompts]",
    packet.safeFollowUpPrompts.map((prompt) => `${prompt.id}: ${prompt.prompt}`)
  );
  renderList(
    "[data-evidence-proof-repair-copy]",
    packet.beforeAfterRepairCopy.map((copy) => `${copy.before} -> ${copy.after}`)
  );
  renderList(
    "[data-evidence-proof-repair-blocked]",
    Object.entries(packet.blockedExternalActions).map(([key, value]) => `${key}: ${value}`)
  );
  renderList(
    "[data-evidence-proof-repair-claims]",
    Object.entries(packet.claimControls).map(([key, value]) => `${key}: ${value}`)
  );
  setText("[data-evidence-proof-repair-preview]", firstCustomerEvidenceProofRepairPacketMarkdown(packet));
}

function renderRepairedProofToPaidAskRoom(workspace, session) {
  const room = buildRepairedProofToPaidAskRoom(workspace, session);
  setText("[data-paid-ask-room-readiness]", "Sample no-send ready");
  setText("[data-paid-ask-room-route]", room.selectedInternalRoute.route);
  setText(
    "[data-paid-ask-room-route-detail]",
    `${room.selectedInternalRoute.target}; no external action, payment, customer-data handling, queue mutation, or done claim.`
  );
  renderList(
    "[data-paid-ask-room-proof-delta]",
    room.proofDelta.map((delta) => `${delta.id}: ${delta.unsupportedClaimRemoved ? "removed unsupported claim" : "check"} | ${delta.after}`)
  );
  renderList(
    "[data-paid-ask-room-missing-proof]",
    room.missingProofAsk.map((ask) => `${ask.id}: ${ask.ask}`)
  );
  renderList(
    "[data-paid-ask-room-objections]",
    room.objectionStates.map((route) => `${route.id} -> ${route.route}`)
  );
  renderList("[data-paid-ask-room-deliverables]", room.paidPacket.deliverables);
  renderList(
    "[data-paid-ask-room-gates]",
    Object.entries(room.supportRefundPaymentPosture).map(([key, value]) => `${key}: ${typeof value === "object" ? "blocked" : value}`)
  );
  renderList(
    "[data-paid-ask-room-payment-state]",
    Object.entries(room.supportRefundPaymentPosture.disabledPaymentState).map(([key, value]) => `${key}: ${value}`)
  );
  setText("[data-paid-ask-room-preview]", repairedProofToPaidAskRoomMarkdown(room));
}

function renderPaidAskOutcomeRouter(workspace, session) {
  const router = buildPaidAskOutcomeRouter(workspace, session);
  setText("[data-paid-ask-router-readiness]", "Fail-closed local router");
  setText("[data-paid-ask-router-route]", router.selectedRoute.action);
  setText(
    "[data-paid-ask-router-route-detail]",
    `${router.selectedRoute.routeFamily} -> ${router.selectedRoute.target}; no downstream queue mutation, external action, payment/customer-data handling, or done claim.`
  );
  renderList(
    "[data-paid-ask-router-sources]",
    router.consumedArtifacts.map((artifact) => `${artifact.id}: ${artifact.state}`)
  );
  renderList(
    "[data-paid-ask-router-routes]",
    router.outcomeRoutes.map((route) => `${route.selected ? "Selected: " : ""}${route.routeFamily} -> ${route.action}`)
  );
  renderList(
    "[data-paid-ask-router-packet]",
    [
      `Evidence mode: ${router.routePacket.evidenceMode}`,
      `Consent state: ${router.routePacket.consentState}`,
      `Redaction state: ${router.routePacket.redactionState}`,
      `Suggested owner: ${router.routePacket.suggestedOwner}`,
      `Acceptance: ${router.routePacket.acceptanceCriteria}`,
      `Validation: ${router.routePacket.validationExpectation}`,
    ]
  );
  renderList(
    "[data-paid-ask-router-states]",
    Object.entries(router.evidenceStateLegend).map(([key, value]) => `${key}: ${value}`)
  );
  renderList(
    "[data-paid-ask-router-claims]",
    Object.entries(router.routePacket.unsupportedClaimFlags).map(([key, value]) => `${key}: ${value}`)
  );
  renderList("[data-paid-ask-router-gates]", router.routePacket.blockedGates);
  setText("[data-paid-ask-router-preview]", paidAskOutcomeRouterMarkdown(router));
}

function renderPaidAskProofPacketClarityRepair(workspace, session) {
  const repair = buildPaidAskProofPacketClarityRepair(workspace, session);
  setText("[data-paid-ask-clarity-readiness]", "Product repair ready");
  setText("[data-paid-ask-clarity-route]", repair.safeNextRoutePacket.selectedAction);
  setText(
    "[data-paid-ask-clarity-route-detail]",
    `${repair.safeNextRoutePacket.selectedRouteFamily} -> ${repair.safeNextRoutePacket.suggestedOwner}; no queue mutation, external action, checkout, payment, customer-data handling, or done claim.`
  );
  renderList(
    "[data-paid-ask-clarity-sources]",
    repair.consumedArtifacts.map((artifact) => `${artifact.id}: ${artifact.state}`)
  );
  renderList(
    "[data-paid-ask-clarity-repairs]",
    repair.clarityRepairs.map((item) => `${item.label}: ${item.after}`)
  );
  renderList(
    "[data-paid-ask-clarity-controls]",
    repair.approvalControls.map((control) => `${control.id}: ${control.repair}`)
  );
  renderList(
    "[data-paid-ask-clarity-stop-copy]",
    Object.entries(repair.stopCopy).map(([key, value]) => `${key}: ${value}`)
  );
  renderList(
    "[data-paid-ask-clarity-packet]",
    [
      `Evidence mode: ${repair.safeNextRoutePacket.evidenceMode}`,
      `Consent state: ${repair.safeNextRoutePacket.consentState}`,
      `Selected: ${repair.safeNextRoutePacket.selectedRouteFamily} -> ${repair.safeNextRoutePacket.selectedAction}`,
      `Acceptance: ${repair.safeNextRoutePacket.acceptanceCriteria}`,
      `Validation: ${repair.safeNextRoutePacket.validationExpectation}`,
    ]
  );
  renderList(
    "[data-paid-ask-clarity-claims]",
    Object.entries(repair.claimControls.unsupportedClaimFlags).map(([key, value]) => `${key}: ${value}`)
  );
  setText("[data-paid-ask-clarity-preview]", paidAskProofPacketClarityRepairMarkdown(repair));
}

function renderPaidAskObjectionResponseSimulator(workspace, session) {
  const simulator = buildPaidAskObjectionResponseSimulator(workspace, session);
  setText("[data-paid-ask-objection-simulator-readiness]", "Sample objection simulator");
  setText("[data-paid-ask-objection-simulator-route]", simulator.selectedObjectionRoute.action);
  setText(
    "[data-paid-ask-objection-simulator-route-detail]",
    `${simulator.selectedObjectionRoute.routeFamily} -> ${simulator.selectedObjectionRoute.suggestedOwner}; no checkout, payment, customer-data handling, external action, queue mutation, or done claim.`
  );
  renderList(
    "[data-paid-ask-objection-simulator-sources]",
    simulator.consumedArtifacts.map((artifact) => `${artifact.id}: ${artifact.state}`)
  );
  renderList(
    "[data-paid-ask-objection-simulator-objections]",
    simulator.objectionStates.map((state) => `${state.label}: ${state.sampleObjection}`)
  );
  renderList(
    "[data-paid-ask-objection-simulator-responses]",
    simulator.responseCopy.map((state) => `${state.label}: ${state.operatorSafeResponseCopy}`)
  );
  renderList(
    "[data-paid-ask-objection-simulator-repairs]",
    simulator.responseCopy.map((state) => `${state.label}: ${state.productRepairCue}`)
  );
  renderList(
    "[data-paid-ask-objection-simulator-routes]",
    simulator.objectionStates.map((state) => `${state.label}: ${state.nextRoute.routeFamily} -> ${state.nextRoute.action}`)
  );
  renderList(
    "[data-paid-ask-objection-simulator-gates]",
    simulator.objectionStates.map((state) => `${state.label}: ${state.firstBlockingGate}`)
  );
  renderList(
    "[data-paid-ask-objection-simulator-states]",
    Object.entries(simulator.evidenceStateBoundary).map(([key, value]) => `${key}: ${value}`)
  );
  renderList(
    "[data-paid-ask-objection-simulator-claims]",
    Object.entries(simulator.claimControls.unsupportedClaimFlags).map(([key, value]) => `${key}: ${value}`)
  );
  setText("[data-paid-ask-objection-simulator-preview]", paidAskObjectionResponseSimulatorMarkdown(simulator));
}

function renderFirstPaidPilotHandoffRoom(workspace, session) {
  const room = buildFirstPaidPilotHandoffRoom(workspace, session);
  setText("[data-first-paid-pilot-handoff-readiness]", "Local handoff ready");
  setText("[data-first-paid-pilot-handoff-route]", room.ownerGoNoGoPacket.routeId);
  setText(
    "[data-first-paid-pilot-handoff-route-detail]",
    `${room.ownerGoNoGoPacket.suggestedOwner}; ${room.ownerGoNoGoPacket.validationExpectation}`
  );
  renderList("[data-first-paid-pilot-handoff-value]", room.pilotValue);
  renderList(
    "[data-first-paid-pilot-handoff-proof]",
    [
      `Repaired bullets: ${room.proofDelta.repairedBulletCount}`,
      `Missing proof asks: ${room.proofDelta.missingProofAskCount}`,
      room.proofDelta.summary,
    ]
  );
  renderList("[data-first-paid-pilot-handoff-deliverables]", room.deliverables);
  renderList(
    "[data-first-paid-pilot-handoff-approval]",
    Object.entries(room.approvalState).map(([key, value]) => `${key}: ${value}`)
  );
  renderList(
    "[data-first-paid-pilot-handoff-gates]",
    Object.entries(room.gates).map(([key, value]) => `${key}: ${value}`)
  );
  renderList("[data-first-paid-pilot-handoff-owner-fields]", room.ownerGoNoGoPacket.ownerFields);
  setText("[data-first-paid-pilot-handoff-preview]", firstPaidPilotHandoffRoomMarkdown(room));
}

function renderFirstDollarReadinessRoom(workspace, session) {
  const room = buildFirstDollarReadinessRoom(workspace, session);
  const selectedRoute = room.routePackets.find((route) => route.selected) || {};
  setText("[data-first-dollar-readiness-state]", "Fail-closed local");
  renderList(
    "[data-first-dollar-readiness-proof]",
    Object.entries(room.proofClarity).map(([key, value]) => `${key}: ${value}`)
  );
  renderList("[data-first-dollar-readiness-deliverables]", room.packetDeliverables);
  renderList(
    "[data-first-dollar-readiness-questions]",
    room.readinessQuestions.map((question) => `${question.label}: ${question.state}; ${question.question}`)
  );
  renderList(
    "[data-first-dollar-readiness-gate]",
    [
      `${room.firstBlockingGate.label}: ${room.firstBlockingGate.reason}`,
      ...room.firstBlockingGate.ownerEvidenceRequired.map((field) => `Required: ${field}`),
    ]
  );
  setText("[data-first-dollar-readiness-route]", selectedRoute.routeId || "approval_unblocker_first_dollar_owner_evidence_repair");
  setText(
    "[data-first-dollar-readiness-route-detail]",
    `${selectedRoute.suggestedOwner || "Approval Unblocker"}; ${selectedRoute.validationExpectation || "No live first-dollar claim."}`
  );
  renderList(
    "[data-first-dollar-readiness-disabled]",
    Object.entries(room.disabledAffordances).map(([key, value]) => `${key}: ${value}`)
  );
  setText("[data-first-dollar-readiness-preview]", firstDollarReadinessRoomMarkdown(room));
}

function renderFirstDollarOwnerEvidenceRepairRoom(workspace, session) {
  const room = buildFirstDollarOwnerEvidenceRepairRoom(workspace, session);
  const selectedRoute = (room.routePackets || []).find((route) => route.selected) || {};
  setText("[data-first-dollar-owner-evidence-state]", "Repair needed");
  renderList(
    "[data-first-dollar-owner-evidence-fields]",
    room.ownerEvidenceFields.map((field) => `${field.label}: ${field.state}; ${field.missingReason}`)
  );
  renderList(
    "[data-first-dollar-owner-evidence-answer-path]",
    [
      `Private answer path: ${room.firstBlockingGate.privateAnswerPath}`,
      "Repo-visible exports contain labels and statuses only.",
    ]
  );
  renderList(
    "[data-first-dollar-owner-evidence-export]",
    room.exportContract.forbiddenRepoVisibleValues.map((value) => `Forbidden: ${value}`)
  );
  renderList(
    "[data-first-dollar-owner-evidence-gate]",
    [
      `${room.firstBlockingGate.label}: ${room.firstBlockingGate.reason}`,
      ...room.firstBlockingGate.ownerEvidenceRequired.map((field) => `Required: ${field}`),
    ]
  );
  setText("[data-first-dollar-owner-evidence-route]", selectedRoute.routeId || "approval_unblocker_owner_evidence_repair");
  setText(
    "[data-first-dollar-owner-evidence-route-detail]",
    `${selectedRoute.suggestedOwner || "Approval Unblocker"}; ${selectedRoute.validationExpectation || "No live first-dollar claim."}`
  );
  renderList(
    "[data-first-dollar-owner-evidence-disabled]",
    Object.entries(room.disabledAffordances).map(([key, value]) => `${key}: ${value}`)
  );
  setText("[data-first-dollar-owner-evidence-preview]", firstDollarOwnerEvidenceRepairRoomMarkdown(room));
}

function renderFirstLiveProofAuditCopilot(workspace, session) {
  const copilot = buildFirstLiveProofAuditCopilot(workspace, session);
  setText("[data-live-proof-audit-copilot-state]", "Sample/redacted copilot ready");
  setText("[data-live-proof-audit-copilot-route]", copilot.selectedRoute.action);
  setText(
    "[data-live-proof-audit-copilot-route-detail]",
    `${copilot.selectedRoute.routeFamily} -> ${copilot.selectedRoute.suggestedOwner}; no external action, payment/customer-data handling, downstream queue mutation, or done claim.`
  );
  renderList(
    "[data-live-proof-audit-copilot-sources]",
    copilot.consumedArtifacts.map((artifact) => `${artifact.id}: ${artifact.state}`)
  );
  renderList(
    "[data-live-proof-audit-copilot-script]",
    copilot.sessionScript.map((step) => `${step.label}: ${step.operatorPrompt}`)
  );
  renderList("[data-live-proof-audit-copilot-checkpoints]", copilot.proofAuditCheckpoints);
  renderList(
    "[data-live-proof-audit-copilot-redaction]",
    Object.entries(copilot.consentRedactionState).map(([key, value]) => `${key}: ${value}`)
  );
  renderList(
    "[data-live-proof-audit-copilot-assumptions]",
    [
      `Target role: ${copilot.candidateFitAssumptions.targetRole}`,
      `Matched job: ${copilot.candidateFitAssumptions.matchedJob}`,
      `Fit score: ${copilot.candidateFitAssumptions.fitScore}`,
      ...copilot.candidateFitAssumptions.assumptions,
    ]
  );
  renderList(
    "[data-live-proof-audit-copilot-gate]",
    [
      `${copilot.firstBlockingGate.label || copilot.firstBlockingGate.gateId}: ${copilot.firstBlockingGate.reason || "blocked"}`,
      ...fallbackList(copilot.firstBlockingGate.ownerEvidenceRequired, "Owner evidence remains required before live use.").map((field) => `Required: ${field}`),
    ]
  );
  renderList("[data-live-proof-audit-copilot-cues]", copilot.paidPilotReadinessCues);
  renderList("[data-live-proof-audit-copilot-prompts]", copilot.noSendOperatorPrompts);
  renderList(
    "[data-live-proof-audit-copilot-routes]",
    copilot.routeOptions.map((route) => `${route.selected ? "Selected" : "Option"}: ${route.routeFamily} -> ${route.action}`)
  );
  renderList(
    "[data-live-proof-audit-copilot-claims]",
    Object.entries(copilot.unsupportedClaims).map(([key, value]) => `${key}: ${value}`)
  );
  setText("[data-live-proof-audit-copilot-preview]", firstLiveProofAuditCopilotMarkdown(copilot));
}


function buildFirstPaidPilotFulfillmentReceiptPreview(workspace, session) {
  const handoffRoom = buildFirstPaidPilotHandoffRoom(workspace, session);
  const readinessRoom = buildFirstDollarReadinessRoom(workspace, session);
  const clarityRepair = buildPaidAskProofPacketClarityRepair(workspace, session);
  const objectionSimulator = buildPaidAskObjectionResponseSimulator(workspace, session);
  const blockedActions = paidAskOutcomeRouterBlockedActions();
  const selectedRoute = {
    routeId: "approval_unblocker_first_paid_receipt_owner_evidence_repair",
    routeFamily: "approval_unblocker_owner_gate_repair",
    selected: true,
    suggestedOwner: "Approval Unblocker",
    action: "repair_first_paid_pilot_receipt_owner_evidence",
    reason: "The receipt can be previewed locally, but payment owner, support/refund, customer-data, and final go/no-go evidence are still missing.",
    acceptanceCriteria: "Repair non-secret owner evidence for fulfillment scope, support/refund posture, local-first customer-data path, payment display scope, and final paid-pilot go/no-go before any live action.",
    validationExpectation: "Checker proves exactly one route, no checkout/payment/customer-data/provider action, no live/revenue claims, no downstream mutation, and no delegated done claim.",
    externalActionAllowed: false,
    queueMutationAllowed: false,
    downstreamDoneClaimAllowed: false,
    paymentOrCustomerDataHandlingAllowed: false,
    providerActionAllowed: false,
    mustNotMarkDelegatedWorkDone: true,
  };

  return {
    format: FIRST_PAID_PILOT_FULFILLMENT_RECEIPT_PREVIEW_FORMAT,
    generatedAt: new Date().toISOString(),
    mode: "local_sample_redacted_first_paid_pilot_fulfillment_receipt_no_payment_no_customer_data_no_external_actions",
    queueItemId: "NORTHSTAR-FIRST-PAID-PILOT-FULFILLMENT-RECEIPT-PREVIEW",
    appSurfacePath: "website/app.html#first-paid-pilot-fulfillment-receipt-preview",
    adminSurfacePath: "website/admin.html#first-paid-pilot-fulfillment-receipt-preview",
    consumedArtifacts: [
      { id: "first_paid_pilot_handoff_room", path: "ops/product/first-paid-pilot-handoff-room.sample.json", state: handoffRoom?.format ? "consumed_paid_pilot_handoff" : "fallback_required" },
      { id: "first_dollar_readiness_room", path: "ops/product/first-dollar-readiness-room.sample.json", state: readinessRoom?.format ? "consumed_first_dollar_readiness" : "fallback_required" },
      { id: "paid_ask_proof_packet_clarity_repair", path: "ops/product/paid-ask-proof-packet-clarity-repair.sample.json", state: clarityRepair?.format ? "consumed_proof_packet_clarity" : "fallback_required" },
      { id: "paid_ask_objection_response_simulator", path: "ops/product/paid-ask-objection-response-simulator.sample.json", state: objectionSimulator?.format ? "consumed_objection_simulator" : "fallback_required" },
      { id: "first_paid_customer_data_fulfillment_decision", path: "ops/payments/first-paid-customer-data-fulfillment-decision.md", state: "referenced_local_first_customer_controlled_path" },
      { id: "first_paid_packet_fulfillment_boundary_drill", path: "ops/launch/first-paid-packet-fulfillment-boundary-drill.sample.json", state: "referenced_boundary_drill" },
      { id: "business_controls", path: "ops/BUSINESS_CONTROLS.json", state: "controls_loaded" },
    ],
    receiptDeliverables: ["proof_backed_resume_edits", "target_job_packet", "missing_proof_prompts", "operator_review_scope", "support_refund_posture", "local_first_customer_controlled_data_path", "disabled_payment_state", "candidate_approval_receipt"],
    proofDelta: {
      repairedBulletCount: handoffRoom?.proofDelta?.repairedBulletCount || 3,
      missingProofAskCount: handoffRoom?.proofDelta?.missingProofAskCount || 4,
      unsupportedClaimsRemoved: true,
      before: "Generic claim-heavy packet with unclear proof custody.",
      after: "Sample receipt shows supported edits, missing-proof prompts, risky-claim removals, and no live outcome claim.",
    },
    sourceCustodyLabels: ["safe_resume_summary_label", "target_job_packet_label", "proof_repair_label", "objection_rehearsal_label", "customer_controlled_local_handoff_label"],
    customerControlledDataPath: { posture: "local_first_customer_controlled_handoff", productionStorageAllowed: false, uploadAllowed: false, deletionPathRequiredBeforeLiveUse: true, consentRequiredBeforeLiveUse: true, supportContactRequiredBeforeLiveUse: true },
    supportRefundPosture: { state: "owner_policy_required_before_live_use", supportContactKnown: false, refundAuthorityKnown: false, revisionScopeKnown: false, taxMerchantOfRecordKnown: false },
    selectedRoute,
    alternateRoutes: ["product_proof_receipt_repair", "business_no_send_fulfillment_prep", "strategy_receipt_threshold_update", "qa_reviewer_receipt_boundary_check", "keep_learning_receipt_value_gap", "no_action_when_receipt_gates_ready"],
    blockedExternalActions: blockedActions,
    unsupportedClaims: { liveFeedbackObserved: false, willingnessToPayObserved: false, paymentIntentObserved: false, paymentObserved: false, paidCustomerObserved: false, publicProofObserved: false, testimonialPermissionObserved: false, referralPermissionObserved: false, revenueObserved: false, productionCustomerDataReady: false, productionPaidPilotAuthorized: false },
    repoSafety: { sampleOrOwnerApprovedRedactedOnly: true, safeLabelsOnly: true, rawCustomerMaterialsExcluded: true, credentialsExcluded: true, contactDetailsExcluded: true, paymentDataExcluded: true, dashboardUrlsExcluded: true, exactlyOneSelectedRoute: true, noExternalActions: true, noPaymentLinkOrCheckoutDisplay: true, noPaymentOrCustomerDataHandling: true, noProviderMutation: true, noDownstreamQueueMutation: true, noDelegatedCompletionClaim: true, noUnsupportedLiveOrRevenueClaims: true, queueMutationAllowed: false, downstreamCompletionClaimAllowed: false, paymentOrCustomerDataHandlingAllowed: false, providerActionAllowed: false, externalActionsPerformed: [], queueMutationsPerformed: [] },
  };
}

function firstPaidPilotFulfillmentReceiptPreviewMarkdown(receipt) {
  return [
    "# ProofResume First Paid Pilot Fulfillment Receipt Preview",
    "",
    "Format: " + receipt.format,
    "Generated: " + receipt.generatedAt,
    "",
    "## Boundary",
    "- Local/sample receipt only.",
    "- No checkout, payment link, payment collection, production customer-data upload/storage, outreach, scheduling, analytics send, provider mutation, public proof, testimonial/referral ask, employer contact, auto-apply, form fill, application submission, downstream queue mutation, delegated done claim, or revenue claim.",
    "",
    "## Deliverables",
    ...receipt.receiptDeliverables.map((item) => "- " + item),
    "",
    "## Proof Delta",
    ...Object.entries(receipt.proofDelta).map(([key, value]) => "- " + key + ": " + value),
    "",
    "## Customer-Controlled Data Path",
    ...Object.entries(receipt.customerControlledDataPath).map(([key, value]) => "- " + key + ": " + value),
    "",
    "## Selected Route",
    "- Route: " + receipt.selectedRoute.routeId,
    "- Owner: " + receipt.selectedRoute.suggestedOwner,
    "- Action: " + receipt.selectedRoute.action,
    "- Validation: " + receipt.selectedRoute.validationExpectation,
  ].join("\n");
}


function renderFirstPaidPilotFulfillmentReceiptPreview(workspace, session) {
  const receipt = buildFirstPaidPilotFulfillmentReceiptPreview(workspace, session);
  setText("[data-fulfillment-receipt-state]", "Sample receipt only");
  renderList("[data-fulfillment-receipt-deliverables]", receipt.receiptDeliverables);
  renderList("[data-fulfillment-receipt-proof-delta]", Object.entries(receipt.proofDelta).map(([key, value]) => key + ": " + value));
  renderList("[data-fulfillment-receipt-data-path]", Object.entries(receipt.customerControlledDataPath).map(([key, value]) => key + ": " + value));
  renderList("[data-fulfillment-receipt-source-custody]", receipt.sourceCustodyLabels);
  renderList("[data-fulfillment-receipt-unsupported]", Object.entries(receipt.unsupportedClaims).map(([key, value]) => key + ": " + value));
  setText("[data-fulfillment-receipt-route]", receipt.selectedRoute.routeId);
  setText("[data-fulfillment-receipt-route-detail]", receipt.selectedRoute.suggestedOwner + "; " + receipt.selectedRoute.validationExpectation);
  setText("[data-fulfillment-receipt-preview]", firstPaidPilotFulfillmentReceiptPreviewMarkdown(receipt));
}

function renderProofAuditPacket(workspace, session) {
  const packet = buildProofAuditPacket(workspace, session);
  const ready = Boolean(packet.matchedJob && packet.audit.tailoredBullets.length && packet.audit.supportedClaims.length);
  setText("[data-proof-audit-readiness]", ready ? "Preview ready" : "Needs local packet");
  setText("[data-proof-audit-fit]", `${packet.matchedJob?.fitScore ?? "--"}/100`);
  renderList("[data-proof-audit-summary]", proofAuditSummaryItems(packet));
  renderList("[data-proof-audit-claims]", packet.audit.supportedClaims);
  renderList("[data-proof-audit-gaps]", packet.audit.proofGaps);
  renderList("[data-proof-audit-warnings]", packet.audit.doNotInventWarnings);
  setText("[data-proof-audit-cover-note]", packet.audit.coverNote);
  setText("[data-proof-audit-preview]", proofAuditMarkdown(packet));
}

function renderConsentedAuditHandoffPreview(workspace, session) {
  const handoff = buildConsentedAuditHandoffPreview(workspace, session);
  setText("[data-consented-handoff-readiness]", handoff.readyForManualShare ? "Manual-share review ready" : "Needs consent review");
  setText("[data-consented-handoff-next]", handoff.candidateVisibleNextStep);
  renderList("[data-consented-handoff-custody]", handoff.evidenceCustody);
  renderList("[data-consented-handoff-boundaries]", handoff.blockedActions);
  setText("[data-consented-handoff-preview-text]", consentedAuditHandoffMarkdown(handoff));

  const checksNode = document.querySelector("[data-consented-handoff-checks]");
  if (checksNode) {
    checksNode.innerHTML = "";
    handoff.consentAndApprovalChecks.forEach((check) => {
      const card = document.createElement("article");
      card.className = "consented-handoff-check";
      card.innerHTML = `
        <strong>${escapeHtml(check.label)}</strong>
        <code>${escapeHtml(check.state)}</code>
        <small class="muted">${escapeHtml(check.detail)}</small>
      `;
      checksNode.appendChild(card);
    });
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setRoute(routeName) {
  document.querySelectorAll("[data-route]").forEach((route) => {
    route.dataset.active = String(route.dataset.route === routeName);
  });
}

function updateNav(session) {
  document.querySelectorAll("[data-auth-nav]").forEach((link) => {
    const target = link.dataset.authNav;
    if (target === "workspace") {
      link.textContent = session ? "Workspace" : "Sign in first";
    }
  });
}

function renderSession() {
  const session = readSession();
  const workspace = session ? ensureWorkspace(session) : null;
  const state = document.querySelector("[data-auth-state]");

  if (state) {
    state.dataset.state = session ? "signed-in" : "signed-out";
    state.textContent = session
      ? "Signed in with local demo identity"
      : "Signed out. Workspace route is protected.";
  }

  setText("[data-session-user]", session ? `${session.name} (${session.email})` : "Not signed in");
  setText("[data-session-workspace]", workspace ? workspace.id : "Protected until sign-in");
  setText("[data-session-mode]", session ? "Local demo auth. Production provider disabled." : "Local fallback ready");

  setText("[data-workspace-id]", workspace ? workspace.id : "Sign in to create a workspace");
  setText(
    "[data-workspace-profile]",
    profileReady(workspace?.profile)
      ? `${workspace.profile.desiredRoles?.[0] || workspace.profile.targetRole}${workspace.profile.seniority ? `, ${workspace.profile.seniority}` : ""}${workspace.profile.location ? `, ${workspace.profile.location}` : ""}${workspace.profile.workMode ? `, ${workspace.profile.workMode}` : ""}`
      : "No target preferences saved yet"
  );
  setText("[data-workspace-next]", workspaceNextAction(workspace));
  renderResume(workspace);
  renderJobPipeline(workspace);
  renderApplicationTracker(workspace);
  renderJourney(workspace, session);
  renderPaidPacketPreview(workspace);
  renderProofAuditPacket(workspace, session);
  renderConsentedAuditHandoffPreview(workspace, session);
  renderFirstSessionHandoff(workspace, session);
  renderFirstSessionCustomerHandoffRoom(workspace, session);
  renderFirstSessionObjectionRepairWizard(workspace, session);
  renderFirstCustomerConciergeDemoBundle(workspace, session);
  renderFirstCustomerReactionRouteRecorder(workspace, session);
  renderFirstCustomerEvidenceInboxRoom(workspace, session);
  renderFirstCustomerEvidenceRouteScoreboard(workspace, session);
  renderFirstCustomerEvidenceProofRepairPacket(workspace, session);
  renderRepairedProofToPaidAskRoom(workspace, session);
  renderPaidAskOutcomeRouter(workspace, session);
  renderPaidAskProofPacketClarityRepair(workspace, session);
  renderPaidAskObjectionResponseSimulator(workspace, session);
  renderFirstPaidPilotHandoffRoom(workspace, session);
  renderFirstDollarReadinessRoom(workspace, session);
  renderFirstDollarOwnerEvidenceRepairRoom(workspace, session);
  renderFirstLiveProofAuditCopilot(workspace, session);
  renderLiveToPaidPilotDecisionRoom(workspace, session);
  renderLiveProofTrustGapRepairRoom(workspace, session);
  renderLiveProofMissingProofCueRepair(workspace, session);
  renderPaidPilotTrustGapRepairLab(workspace, session);
  renderProofDeltaValueSnapshot(workspace, session);
  renderFirstPaidPilotFulfillmentReceiptPreview(workspace, session);

  const form = document.querySelector("[data-workspace-form]");
  if (form && workspace) {
    const preferences = normalizeTargetPreferences(workspace.profile || {});
    form.elements.targetRole.value = preferences.targetRole || "";
    form.elements.desiredRoles.value = textFromList(preferences.desiredRoles.filter((role) => role !== preferences.targetRole));
    form.elements.seniority.value = preferences.seniority || "";
    form.elements.location.value = preferences.location || "";
    form.elements.workMode.value = preferences.workMode || "";
    form.elements.industries.value = textFromList(preferences.industries);
    form.elements.mustHaveConstraints.value = textFromList(preferences.mustHaveConstraints);
    form.elements.niceToHaveKeywords.value = textFromList(preferences.niceToHaveKeywords);
  }

  updateNav(session);
  return { session, workspace };
}

function routeFromHash() {
  return window.location.hash.replace(/^#\/?/, "") || "workspace";
}

function renderRoute() {
  const { session } = renderSession();
  const requestedRoute = routeFromHash();
  const route = requestedRoute === "signin" ? "signin" : "workspace";

  if (route === "workspace" && !session) {
    setRoute("signin");
    setText("[data-auth-message]", "Sign in locally to unlock the protected workspace route.");
    if (window.location.hash !== "#/signin") {
      window.location.hash = "#/signin";
    }
    return;
  }

  setRoute(route);
}

function bindEvents() {
  document.querySelector("[data-sign-in-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const user = signInLocal(new FormData(event.currentTarget));
    setText("[data-auth-message]", `Signed in locally as ${user.email}.`);
    window.location.hash = "#/workspace";
    renderRoute();
  });

  document.querySelector("[data-sign-out]")?.addEventListener("click", () => {
    signOutLocal();
    window.location.hash = "#/signin";
    setText("[data-auth-message]", "Signed out locally. Workspace is protected again.");
    renderRoute();
  });

  document.querySelectorAll("[data-load-demo-walkthrough]").forEach((button) => {
    button.addEventListener("click", () => {
      const workspace = seedNorthstarDemoWalkthrough();
      window.location.hash = "#/workspace";
      setText(
        "[data-demo-walkthrough-message]",
        "Loaded the complete local demo walkthrough: account, resume, preferences, matches, tailored packet, approval, edit, reject controls, and tracking."
      );
      setText("[data-auth-message]", "Signed in locally with the seeded demo identity.");
      renderRoute();
      document.querySelector("[data-workspace-journey]")?.scrollIntoView({ block: "start", behavior: "smooth" });
      return workspace;
    });
  });

  document.querySelectorAll("[data-reset-demo-workspace]").forEach((button) => {
    button.addEventListener("click", () => {
      resetNorthstarDemoWorkspace();
      window.location.hash = "#/workspace";
      setText("[data-demo-walkthrough-message]", "Reset the demo state to a blank browser-local workspace. The local demo identity remains signed in.");
      renderRoute();
      document.querySelector("[data-workspace-journey]")?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  });

  document.querySelector("[data-workspace-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    workspace.profile = normalizeTargetPreferences({
      targetRole: event.currentTarget.elements.targetRole.value,
      desiredRoles: event.currentTarget.elements.desiredRoles.value,
      seniority: event.currentTarget.elements.seniority.value,
      location: event.currentTarget.elements.location.value,
      workMode: event.currentTarget.elements.workMode.value,
      industries: event.currentTarget.elements.industries.value,
      mustHaveConstraints: event.currentTarget.elements.mustHaveConstraints.value,
      niceToHaveKeywords: event.currentTarget.elements.niceToHaveKeywords.value,
      updatedAt: new Date().toISOString(),
    });
    workspace.updatedAt = new Date().toISOString();
    writeWorkspace(workspace);
    setText("[data-workspace-message]", "Target preferences saved locally and will influence fit labels, proof gaps, and next actions.");
    renderSession();
  });

  document.querySelector("[data-resume-file]")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const textInput = document.querySelector("[data-resume-text]");
    try {
      const text = await file.text();
      if (textInput) textInput.value = text;
      setText("[data-resume-message]", `Loaded ${file.name}. Save resume locally to persist it in this workspace.`);
    } catch {
      setText("[data-resume-message]", "Could not read that file. Use a plain text or markdown resume export.");
    }
  });

  document.querySelector("[data-resume-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const resumeText = String(event.currentTarget.elements.resumeText.value || "").trim();
    if (!resumeText) {
      setText("[data-resume-message]", "Paste resume text or choose a plain text/markdown file before saving.");
      return;
    }
    const workspace = ensureWorkspace(session);
    const file = event.currentTarget.elements.resumeFile.files?.[0];
    workspace.resume = importedResumeState({
      text: resumeText,
      filename: file?.name || workspace.resume?.filename || "Pasted resume text",
    });
    workspace.resume.nextAction = workspaceNextAction(workspace);
    workspace.updatedAt = new Date().toISOString();
    writeWorkspace(workspace);
    setText("[data-resume-message]", "Resume saved locally. Next, save target preferences and paste a job to rank. No production upload occurred.");
    renderSession();
  });

  document.querySelector("[data-clear-resume]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) return;
    const workspace = ensureWorkspace(session);
    workspace.resume = emptyResumeState();
    workspace.updatedAt = new Date().toISOString();
    writeWorkspace(workspace);
    const fileInput = document.querySelector("[data-resume-file]");
    if (fileInput) fileInput.value = "";
    setText("[data-resume-message]", "Cleared resume text from this browser-local workspace.");
    renderSession();
  });

  document.querySelector("[data-job-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const form = event.currentTarget;
    const formData = new FormData(form);
    const batchParts = splitJobBatch(formData.get("jobText"));
    if (!batchParts.length) {
      setText("[data-job-message]", "Paste at least one local job post before saving.");
      return;
    }
    const workspace = ensureWorkspace(session);
    const now = new Date().toISOString();
    const existingJobs = Array.isArray(workspace.jobPipeline?.jobs) ? workspace.jobPipeline.jobs : [];
    const newJobs = batchParts.map((part, index) => {
      const inferred = inferJobFields(part, {
        title: index === 0 ? formData.get("jobTitle") : "",
        company: index === 0 ? formData.get("company") : "",
        location: index === 0 ? formData.get("location") : "",
        sourceUrl: index === 0 ? formData.get("sourceUrl") : "",
      });
      const job = {
        format: "proofresume-local-job-v1",
        id: slugId("job", `${inferred.sourceUrl || ""}\n${inferred.title}\n${inferred.company}\n${part.slice(0, 280)}`),
        createdAt: now,
        updatedAt: now,
        title: inferred.title,
        company: inferred.company,
        location: inferred.location,
        sourceUrl: inferred.sourceUrl,
        effort: String(formData.get("effort") || "medium"),
        text: part,
        sourceLabel: "Manual/local import",
        localOnly: true,
        noExternalFetch: true,
        noScraping: true,
        noOutboundSend: true,
        noAutoApply: true,
      };
      return {
        ...job,
        scoring: scoreJobForWorkspace(job, workspace.resume, workspace.profile),
      };
    });
    const importedIds = new Set(newJobs.map((job) => job.id));
    workspace.jobPipeline = {
      ...emptyJobPipelineState(),
      ...(workspace.jobPipeline || {}),
      updatedAt: now,
      jobs: [...newJobs, ...existingJobs.filter((job) => !importedIds.has(job.id))].slice(0, 40),
    };
    workspace.updatedAt = now;
    writeWorkspace(workspace);
    form.reset();
    form.elements.effort.value = "medium";
    setText(
      "[data-job-message]",
      `Saved ${newJobs.length} local job${newJobs.length === 1 ? "" : "s"} and ranked by fit, proof gaps, effort, and readiness.`
    );
    renderSession();
  });

  document.querySelector("[data-load-sample-job]")?.addEventListener("click", () => {
    const form = document.querySelector("[data-job-form]");
    if (!form) return;
    form.elements.jobTitle.value = SAMPLE_JOB.title;
    form.elements.company.value = SAMPLE_JOB.company;
    form.elements.location.value = SAMPLE_JOB.location;
    form.elements.sourceUrl.value = SAMPLE_JOB.sourceUrl;
    form.elements.effort.value = SAMPLE_JOB.effort;
    form.elements.jobText.value = SAMPLE_JOB.text;
    setText("[data-job-message]", "Loaded a sample local job. Save and rank it to create the first matched-job card.");
  });

  document.querySelector("[data-load-demo-pipeline]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    if (workspace.resume?.state !== "imported") {
      setText("[data-job-message]", "Import a resume before loading demo matched jobs.");
      return;
    }
    if (!profileReady(workspace.profile)) {
      setText("[data-job-message]", "Save target preferences before loading demo matched jobs.");
      return;
    }
    const demoJobs = demoJobsForWorkspace(workspace).map((job) => ({
      ...job,
      scoring: scoreJobForWorkspace(job, workspace.resume, workspace.profile),
    }));
    const demoIds = new Set(demoJobs.map((job) => job.id));
    workspace.jobPipeline = {
      ...emptyJobPipelineState(),
      ...(workspace.jobPipeline || {}),
      updatedAt: new Date().toISOString(),
      jobs: [
        ...demoJobs,
        ...(workspace.jobPipeline?.jobs || []).filter((job) => !demoIds.has(job.id)),
      ].slice(0, 40),
    };
    workspace.updatedAt = workspace.jobPipeline.updatedAt;
    writeWorkspace(workspace);
    setText("[data-job-message]", `Loaded ${demoJobs.length} preference-aware demo jobs. They were generated locally; no live source was fetched.`);
    renderSession();
  });

  document.querySelector("[data-job-list]")?.addEventListener("click", (event) => {
    const selectButton = event.target.closest("[data-select-job]");
    const createApplicationButton = event.target.closest("[data-create-application]");
    const removeButton = event.target.closest("[data-remove-job]");
    if (!selectButton && !createApplicationButton && !removeButton) return;
    const session = readSession();
    if (!session) return;
    const workspace = ensureWorkspace(session);
    const jobId = selectButton?.dataset.selectJob || createApplicationButton?.dataset.createApplication || removeButton?.dataset.removeJob || "";

    if (removeButton) {
      workspace.jobPipeline = {
        ...emptyJobPipelineState(),
        ...(workspace.jobPipeline || {}),
        jobs: (workspace.jobPipeline?.jobs || []).filter((job) => job.id !== jobId),
        updatedAt: new Date().toISOString(),
      };
      workspace.updatedAt = new Date().toISOString();
      writeWorkspace(workspace);
      setText("[data-job-message]", "Removed that local job from this browser workspace.");
      renderSession();
      return;
    }

    if (createApplicationButton) {
      const application = createApplicationFromJob(workspace, jobId);
      if (!application) {
        setText("[data-job-message]", "Could not create an application packet for that job.");
        return;
      }
      setText("[data-application-message]", `Created approval packet for ${application.title}. Checklist and tracking are local-only.`);
      renderSession();
      document.querySelector("#application-tracker")?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }

    const lead = sendJobToTargetPack(workspace, jobId);
    if (!lead) {
      setText("[data-job-message]", "Could not find that local job. Refresh and try again.");
      return;
    }
    setText("[data-job-message]", `Prepared ${lead.jobIntel.title || "selected job"} for target-job.html. No scrape, send, or apply action occurred.`);
    window.location.href = "target-job.html#target-job-tracker";
  });

  document.querySelector("[data-application-list]")?.addEventListener("click", (event) => {
    const approveButton = event.target.closest("[data-approve-application]");
    const saveButton = event.target.closest("[data-save-application]");
    const saveEditsButton = event.target.closest("[data-save-application-edits]");
    const statusButton = event.target.closest("[data-set-application-status]");
    const regenerateButton = event.target.closest("[data-regenerate-application]");
    const resetButton = event.target.closest("[data-reset-application]");
    const openPackButton = event.target.closest("[data-open-application-pack]");
    const prepareButton = event.target.closest("[data-prepare-application]");
    const exportButton = event.target.closest("[data-export-application]");
    const rejectButton = event.target.closest("[data-reject-application]");
    const removeButton = event.target.closest("[data-remove-application]");
    if (!approveButton && !saveButton && !saveEditsButton && !statusButton && !regenerateButton && !resetButton && !openPackButton && !prepareButton && !exportButton && !rejectButton && !removeButton) return;
    const session = readSession();
    if (!session) return;
    const workspace = ensureWorkspace(session);
    const applicationId = approveButton?.dataset.approveApplication
      || saveButton?.dataset.saveApplication
      || saveEditsButton?.dataset.saveApplicationEdits
      || statusButton?.dataset.setApplicationStatus
      || regenerateButton?.dataset.regenerateApplication
      || resetButton?.dataset.resetApplication
      || openPackButton?.dataset.openApplicationPack
      || prepareButton?.dataset.prepareApplication
      || exportButton?.dataset.exportApplication
      || rejectButton?.dataset.rejectApplication
      || removeButton?.dataset.removeApplication
      || "";
    const application = (workspace.applicationTracker?.applications || []).find((item) => item.id === applicationId);
    if (!application) return;
    const card = event.target.closest("[data-application-id]");

    if (removeButton) {
      workspace.applicationTracker = {
        ...emptyApplicationTrackerState(),
        ...(workspace.applicationTracker || {}),
        applications: (workspace.applicationTracker?.applications || []).filter((item) => item.id !== applicationId),
        updatedAt: new Date().toISOString(),
      };
      appendApplicationAudit(workspace, applicationId, "application_removed", "Removed browser-local application packet.");
      workspace.updatedAt = new Date().toISOString();
      writeWorkspace(workspace);
      setText("[data-application-message]", "Removed that local application packet.");
      renderSession();
      return;
    }

    const nextApplication = card ? applicationFromCard(card, application) : application;

    if (approveButton) {
      APPROVAL_CHECKLIST.forEach(([key]) => {
        nextApplication.checklist[key] = true;
      });
      nextApplication.status = applicationApprovalReady(nextApplication) ? "ready" : "draft";
      const missingApprovals = applicationApprovalMissingLabels(nextApplication);
      upsertApplication(
        workspace,
        nextApplication,
        applicationApprovalReady(nextApplication) ? "application_approved" : "application_approval_blocked",
        applicationApprovalReady(nextApplication)
          ? "Approved the tailored packet and marked it ready in the local tracker. No external action occurred."
          : `Approval blocked locally: ${missingApprovals.join(", ")}. No external action occurred.`
      );
      setText("[data-application-message]", applicationApprovalReady(nextApplication)
        ? "Approved this packet and marked it ready locally. Nothing was submitted or sent."
        : "Approval is still blocked. Add a verified apply URL before marking ready.");
      renderSession();
      return;
    }

    if (saveEditsButton) {
      upsertApplication(workspace, nextApplication, "application_packet_edited", "Saved browser-local packet edits for resume bullets, cover note, answers, proof gaps, or boundaries.");
      setText("[data-application-message]", "Saved packet edits locally. Re-approve before external use.");
      renderSession();
      return;
    }

    if (statusButton) {
      const nextStatus = statusButton.dataset.nextApplicationStatus || "ready";
      nextApplication.status = nextStatus;
      if (nextStatus === "rejected") nextApplication.outcome = "rejected";
      if (nextStatus === "accepted") nextApplication.outcome = "offer";
      if (nextStatus === "interviewing") nextApplication.outcome = "interview";
      if (nextStatus === "applied" && nextApplication.outcome === "not_submitted") nextApplication.outcome = "waiting";
      const saved = upsertApplication(workspace, nextApplication, `application_marked_${nextStatus}`, `Marked application ${applicationStatusLabel(nextStatus).toLowerCase()} in the browser-local tracker. No external action occurred.`);
      setText("[data-application-message]", saved.status === nextStatus
        ? `Marked this application ${applicationStatusLabel(nextStatus).toLowerCase()} locally. No external apply/send action occurred.`
        : "Status needs the approval checklist and verified apply URL before it can move forward.");
      renderSession();
      return;
    }

    if (regenerateButton || resetButton) {
      const regenerated = regeneratedApplicationPacket(nextApplication, workspace, { reset: Boolean(resetButton) });
      if (!regenerated) {
        setText("[data-application-message]", "Could not regenerate this packet because the source job is no longer in the local pipeline.");
        return;
      }
      upsertApplication(
        workspace,
        regenerated,
        resetButton ? "tailored_packet_reset" : "tailored_packet_regenerated",
        resetButton
          ? "Reset the tailored packet from the current local resume, preferences, and selected job. No external action occurred."
          : "Regenerated the tailored packet from the current local resume, preferences, and selected job. No external action occurred."
      );
      setText("[data-application-message]", resetButton
        ? "Reset this tailored packet locally and cleared approval state. Nothing was submitted or sent."
        : "Regenerated this tailored packet locally from the latest resume, preferences, and job.");
      renderSession();
      return;
    }

    if (openPackButton) {
      const saved = upsertApplication(workspace, nextApplication, "tailored_packet_handoff", "Handed the tailored packet to Target Job Pack with local context preserved.");
      const lead = sendJobToTargetPack(workspace, saved.jobId, saved);
      if (!lead) {
        setText("[data-application-message]", "Could not find the source job for Target Job Pack handoff.");
        return;
      }
      setText("[data-application-message]", `Prepared ${saved.title} for Target Job Pack with tailored packet context. No external action occurred.`);
      window.location.href = "target-job.html#target-job-tracker";
      return;
    }

    if (rejectButton) {
      nextApplication.status = "rejected";
      nextApplication.outcome = "rejected";
      nextApplication.notes = nextApplication.notes || "Rejected locally by the candidate/operator in the prototype tracker.";
      upsertApplication(workspace, nextApplication, "application_rejected", "Marked packet rejected in browser-local tracker. No external action occurred.");
      setText("[data-application-message]", "Marked this application packet rejected locally. Nothing was submitted or sent.");
      renderSession();
      return;
    }

    if (prepareButton) {
      const missingApprovals = applicationApprovalMissingLabels(nextApplication);
      nextApplication.status = applicationApprovalReady(nextApplication) ? "ready" : "draft";
      nextApplication.dryRunPlan = {
        ...(nextApplication.dryRunPlan || {}),
        format: "proofresume-local-application-dry-run-plan-v1",
        preparedAt: new Date().toISOString(),
        approvalReady: applicationApprovalReady(nextApplication),
        executionAllowed: false,
        externalAction: false,
        blockedReasons: missingApprovals,
        boundary: {
          localOnly: true,
          noExternalFetch: true,
          noOutboundSend: true,
          noAutoApply: true,
          noUpload: true,
        },
      };
      upsertApplication(workspace, nextApplication, "dry_run_packet_prepared", "Prepared local apply plan without submitting, sending, uploading, or filling external forms.");
      setText("[data-application-message]", missingApprovals.length
        ? "Prepared a blocked dry-run packet. Complete every approval gate before external use."
        : "Prepared a local dry-run packet. No external apply/send action occurred.");
      renderSession();
      return;
    }

    if (exportButton) {
      const saved = upsertApplication(workspace, nextApplication, "application_exported", "Exported browser-local approval packet JSON.");
      const payload = {
        format: "proofresume-local-application-export-v1",
        exportedAt: new Date().toISOString(),
        boundary: "Browser-local application packet export. No provider upload, external send, or application submission occurred.",
        workspaceId: workspace.id,
        providerSeams: workspace.applicationTracker?.providerSeams || emptyApplicationTrackerState().providerSeams,
        application: saved,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `proofresume-application-${saved.id}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setText("[data-application-message]", "Exported application approval packet JSON locally.");
      renderSession();
      return;
    }

    upsertApplication(workspace, nextApplication, "approval_state_saved", "Saved checklist, status, outcome, URL, and notes in browser-local tracker.");
    setText("[data-application-message]", applicationApprovalReady(nextApplication)
      ? "Application approval checklist is complete. This still does not submit anything externally."
      : "Saved application tracking state. Complete every approval checkbox before external use.");
    renderSession();
  });

  document.querySelector("[data-clear-jobs]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) return;
    const workspace = ensureWorkspace(session);
    workspace.jobPipeline = emptyJobPipelineState();
    workspace.jobPipeline.updatedAt = new Date().toISOString();
    workspace.updatedAt = new Date().toISOString();
    writeWorkspace(workspace);
    setText("[data-job-message]", "Cleared local job pipeline records from this browser workspace.");
    renderSession();
  });

  document.querySelector("[data-paid-packet-preview-choices]")?.addEventListener("change", (event) => {
    const selectedChoiceId = event.target?.value;
    if (!PAID_PACKET_PREVIEW_CHOICES[selectedChoiceId]) return;
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    workspace.paidPacketPreview = normalizePaidPacketPreviewState({
      ...workspace.paidPacketPreview,
      selectedChoiceId,
      selectedAt: new Date().toISOString(),
    });
    workspace.updatedAt = workspace.paidPacketPreview.selectedAt;
    writeWorkspace(workspace);
    renderPaidPacketPreview(workspace);
  });

  document.querySelector("[data-first-session-form]")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    workspace.firstSessionFeedback = feedbackFromForm(event.currentTarget);
    workspace.updatedAt = workspace.firstSessionFeedback.updatedAt;
    writeWorkspace(workspace);
    appendFeedbackRoadmapSeed(workspace, workspace.firstSessionFeedback);
    setText("[data-first-session-message]", "Saved first-session rehearsal notes locally. Nothing was sent, scheduled, monetized, submitted, or stored in production.");
    renderSession();
  });

  document.querySelector("[data-export-first-session-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const handoff = buildFirstSessionHandoff(workspace, session);
    downloadLocalFile(
      `proofresume-first-session-${workspace.id}.json`,
      JSON.stringify(handoff, null, 2),
      "application/json"
    );
    setText("[data-first-session-message]", "Exported redacted first-session rehearsal JSON locally. Resume text, contact details, raw materials, private replies, payment data, and credentials were excluded.");
  });

  document.querySelector("[data-export-first-session-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const handoff = buildFirstSessionHandoff(workspace, session);
    downloadLocalFile(
      `proofresume-first-session-${workspace.id}.md`,
      firstSessionMarkdown(handoff),
      "text/markdown"
    );
    setText("[data-first-session-message]", "Exported redacted first-session rehearsal Markdown locally. No network, analytics, scheduling, payment, send, storage, or apply action occurred.");
  });

  document.querySelector("[data-export-customer-handoff-room-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const room = buildFirstSessionCustomerHandoffRoom(workspace, session);
    downloadLocalFile(
      `proofresume-first-session-customer-handoff-room-${workspace.id}.json`,
      JSON.stringify(room, null, 2),
      "application/json"
    );
    setText("[data-customer-handoff-room-message]", "Exported customer handoff room JSON locally. No send, payment, production storage, analytics, deploy, or application action occurred.");
  });

  document.querySelector("[data-export-customer-handoff-room-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const room = buildFirstSessionCustomerHandoffRoom(workspace, session);
    downloadLocalFile(
      `proofresume-first-session-customer-handoff-room-${workspace.id}.md`,
      firstSessionCustomerHandoffMarkdown(room),
      "text/markdown"
    );
    setText("[data-customer-handoff-room-message]", "Exported customer handoff room Markdown locally with raw inputs redacted and one internal next route.");
  });

  document.querySelector("[data-export-objection-wizard-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const wizard = buildFirstSessionObjectionRepairWizard(workspace, session);
    downloadLocalFile(
      `proofresume-first-session-objection-repair-wizard-${workspace.id}.json`,
      JSON.stringify(wizard, null, 2),
      "application/json"
    );
    setText("[data-objection-wizard-message]", "Exported objection repair wizard JSON locally. Raw objections, customer materials, payment data, public proof, and downstream queue mutations were excluded.");
  });

  document.querySelector("[data-export-objection-wizard-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const wizard = buildFirstSessionObjectionRepairWizard(workspace, session);
    downloadLocalFile(
      `proofresume-first-session-objection-repair-wizard-${workspace.id}.md`,
      firstSessionObjectionRepairWizardMarkdown(wizard),
      "text/markdown"
    );
    setText("[data-objection-wizard-message]", "Exported objection repair wizard Markdown locally with exactly one internal route and no external action.");
  });

  document.querySelector("[data-export-concierge-demo-bundle-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const bundle = buildFirstCustomerConciergeDemoBundle(workspace, session);
    downloadLocalFile(
      `proofresume-first-customer-concierge-demo-bundle-${workspace.id}.json`,
      JSON.stringify(bundle, null, 2),
      "application/json"
    );
    setText("[data-concierge-demo-bundle-message]", "Exported concierge demo bundle JSON locally. False evidence flags remain visible and no external action occurred.");
  });

  document.querySelector("[data-export-concierge-demo-bundle-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const bundle = buildFirstCustomerConciergeDemoBundle(workspace, session);
    downloadLocalFile(
      `proofresume-first-customer-concierge-demo-bundle-${workspace.id}.md`,
      firstCustomerConciergeDemoBundleMarkdown(bundle),
      "text/markdown"
    );
    setText("[data-concierge-demo-bundle-message]", "Exported concierge demo bundle Markdown locally with start/run/end steps and exactly one internal route.");
  });

  document.querySelector("[data-export-reaction-route-recorder-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const recorder = buildFirstCustomerReactionRouteRecorder(workspace, session);
    downloadLocalFile(
      `proofresume-first-customer-reaction-route-recorder-${workspace.id}.json`,
      JSON.stringify(recorder, null, 2),
      "application/json"
    );
    setText("[data-reaction-route-recorder-message]", "Exported reaction route recorder JSON locally. Safe labels only; no feedback, payment, public-proof, or revenue claim was created.");
  });

  document.querySelector("[data-export-reaction-route-recorder-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const recorder = buildFirstCustomerReactionRouteRecorder(workspace, session);
    downloadLocalFile(
      `proofresume-first-customer-reaction-route-recorder-${workspace.id}.md`,
      firstCustomerReactionRouteRecorderMarkdown(recorder),
      "text/markdown"
    );
    setText("[data-reaction-route-recorder-message]", "Exported reaction route recorder Markdown locally with exactly one internal route and no downstream queue mutation.");
  });

  document.querySelector("[data-export-evidence-inbox-room-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const room = buildFirstCustomerEvidenceInboxRoom(workspace, session);
    downloadLocalFile(
      `proofresume-first-customer-evidence-inbox-room-${workspace.id}.json`,
      JSON.stringify(room, null, 2),
      "application/json"
    );
    setText("[data-evidence-inbox-room-message]", "Exported evidence inbox JSON locally. No external action, customer-data handling, payment handling, or downstream queue mutation occurred.");
  });

  document.querySelector("[data-export-evidence-inbox-room-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const room = buildFirstCustomerEvidenceInboxRoom(workspace, session);
    downloadLocalFile(
      `proofresume-first-customer-evidence-inbox-room-${workspace.id}.md`,
      firstCustomerEvidenceInboxRoomMarkdown(room),
      "text/markdown"
    );
    setText("[data-evidence-inbox-room-message]", "Exported evidence inbox Markdown locally with safe labels, blocked gates, and exactly one provisional route.");
  });

  document.querySelector("[data-export-evidence-route-scoreboard-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const scoreboard = buildFirstCustomerEvidenceRouteScoreboard(workspace, session);
    downloadLocalFile(
      `proofresume-first-customer-evidence-route-scoreboard-${workspace.id}.json`,
      JSON.stringify(scoreboard, null, 2),
      "application/json"
    );
    setText("[data-evidence-route-scoreboard-message]", "Exported route scoreboard JSON locally. No live claim, payment/customer-data handling, external action, or downstream queue mutation occurred.");
  });

  document.querySelector("[data-export-evidence-route-scoreboard-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const scoreboard = buildFirstCustomerEvidenceRouteScoreboard(workspace, session);
    downloadLocalFile(
      `proofresume-first-customer-evidence-route-scoreboard-${workspace.id}.md`,
      firstCustomerEvidenceRouteScoreboardMarkdown(scoreboard),
      "text/markdown"
    );
    setText("[data-evidence-route-scoreboard-message]", "Exported route scoreboard Markdown locally with fail-closed claim controls and exactly one route.");
  });

  document.querySelector("[data-export-evidence-proof-repair-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const packet = buildFirstCustomerEvidenceProofRepairPacket(workspace, session);
    downloadLocalFile(
      `proofresume-first-customer-evidence-proof-repair-packet-${workspace.id}.json`,
      JSON.stringify(packet, null, 2),
      "application/json"
    );
    setText("[data-evidence-proof-repair-message]", "Exported proof-repair packet JSON locally. Raw customer materials, payment/customer-data handling, external actions, and downstream queue mutation remain excluded.");
  });

  document.querySelector("[data-export-evidence-proof-repair-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const packet = buildFirstCustomerEvidenceProofRepairPacket(workspace, session);
    downloadLocalFile(
      `proofresume-first-customer-evidence-proof-repair-packet-${workspace.id}.md`,
      firstCustomerEvidenceProofRepairPacketMarkdown(packet),
      "text/markdown"
    );
    setText("[data-evidence-proof-repair-message]", "Exported proof-repair Markdown locally with safe prompts, before/after copy, source labels, and exactly one internal route.");
  });

  document.querySelector("[data-export-paid-ask-room-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const room = buildRepairedProofToPaidAskRoom(workspace, session);
    downloadLocalFile(
      `proofresume-repaired-proof-to-paid-ask-room-${workspace.id}.json`,
      JSON.stringify(room, null, 2),
      "application/json"
    );
    setText("[data-paid-ask-room-message]", "Exported paid ask room JSON locally. Checkout, payment links, provider calls, customer-data handling, external actions, and downstream queue mutation remain disabled.");
  });

  document.querySelector("[data-export-paid-ask-room-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const room = buildRepairedProofToPaidAskRoom(workspace, session);
    downloadLocalFile(
      `proofresume-repaired-proof-to-paid-ask-room-${workspace.id}.md`,
      repairedProofToPaidAskRoomMarkdown(room),
      "text/markdown"
    );
    setText("[data-paid-ask-room-message]", "Exported paid ask room Markdown locally with repaired proof, no-send offer posture, objection routes, and blocked live gates.");
  });

  document.querySelector("[data-export-paid-ask-router-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const router = buildPaidAskOutcomeRouter(workspace, session);
    downloadLocalFile(
      `proofresume-paid-ask-outcome-router-${workspace.id}.json`,
      JSON.stringify(router, null, 2),
      "application/json"
    );
    setText("[data-paid-ask-router-message]", "Exported paid ask outcome router JSON locally. No queue mutation, payment/customer-data handling, provider call, external action, or revenue claim occurred.");
  });

  document.querySelector("[data-export-paid-ask-router-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const router = buildPaidAskOutcomeRouter(workspace, session);
    downloadLocalFile(
      `proofresume-paid-ask-outcome-router-${workspace.id}.md`,
      paidAskOutcomeRouterMarkdown(router),
      "text/markdown"
    );
    setText("[data-paid-ask-router-message]", "Exported paid ask outcome router Markdown locally with exactly one route and explicit false live-traction states.");
  });

  document.querySelector("[data-export-paid-ask-clarity-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const repair = buildPaidAskProofPacketClarityRepair(workspace, session);
    downloadLocalFile(
      `proofresume-paid-ask-proof-packet-clarity-repair-${workspace.id}.json`,
      JSON.stringify(repair, null, 2),
      "application/json"
    );
    setText("[data-paid-ask-clarity-message]", "Exported paid ask clarity repair JSON locally. Checkout, payment, production customer data, external actions, and downstream queue mutation remain disabled.");
  });

  document.querySelector("[data-export-paid-ask-clarity-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const repair = buildPaidAskProofPacketClarityRepair(workspace, session);
    downloadLocalFile(
      `proofresume-paid-ask-proof-packet-clarity-repair-${workspace.id}.md`,
      paidAskProofPacketClarityRepairMarkdown(repair),
      "text/markdown"
    );
    setText("[data-paid-ask-clarity-message]", "Exported paid ask clarity repair Markdown locally with one no-send next route and explicit false live-traction states.");
  });

  document.querySelector("[data-export-paid-ask-objection-simulator-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const simulator = buildPaidAskObjectionResponseSimulator(workspace, session);
    downloadLocalFile(
      `proofresume-paid-ask-objection-response-simulator-${workspace.id}.json`,
      JSON.stringify(simulator, null, 2),
      "application/json"
    );
    setText("[data-paid-ask-objection-simulator-message]", "Exported paid ask objection simulator JSON locally. No checkout, payment, customer-data handling, external action, queue mutation, live signal claim, or revenue claim occurred.");
  });

  document.querySelector("[data-export-paid-ask-objection-simulator-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const simulator = buildPaidAskObjectionResponseSimulator(workspace, session);
    downloadLocalFile(
      `proofresume-paid-ask-objection-response-simulator-${workspace.id}.md`,
      paidAskObjectionResponseSimulatorMarkdown(simulator),
      "text/markdown"
    );
    setText("[data-paid-ask-objection-simulator-message]", "Exported paid ask objection simulator Markdown locally with sample-only response copy and one internal route per objection.");
  });

  document.querySelector("[data-export-first-paid-pilot-handoff-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const room = buildFirstPaidPilotHandoffRoom(workspace, session);
    downloadLocalFile(
      `proofresume-first-paid-pilot-handoff-room-${workspace.id}.json`,
      JSON.stringify(room, null, 2),
      "application/json"
    );
    setText("[data-first-paid-pilot-handoff-message]", "Exported first paid pilot handoff JSON locally. Checkout, payment, production customer data, external actions, and downstream queue mutation remain disabled.");
  });

  document.querySelector("[data-export-first-paid-pilot-handoff-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const room = buildFirstPaidPilotHandoffRoom(workspace, session);
    downloadLocalFile(
      `proofresume-first-paid-pilot-handoff-room-${workspace.id}.md`,
      firstPaidPilotHandoffRoomMarkdown(room),
      "text/markdown"
    );
    setText("[data-first-paid-pilot-handoff-message]", "Exported first paid pilot handoff Markdown locally with one owner go/no-go packet and explicit false live-traction states.");
  });

  document.querySelector("[data-export-first-dollar-readiness-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const room = buildFirstDollarReadinessRoom(workspace, session);
    downloadLocalFile(
      `proofresume-first-dollar-readiness-room-${workspace.id}.json`,
      JSON.stringify(room, null, 2),
      "application/json"
    );
    setText("[data-first-dollar-readiness-message]", "Exported first dollar readiness JSON locally. Payment links, checkout, production customer data, external actions, and downstream queue mutation remain disabled.");
  });

  document.querySelector("[data-export-first-dollar-readiness-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const room = buildFirstDollarReadinessRoom(workspace, session);
    downloadLocalFile(
      `proofresume-first-dollar-readiness-room-${workspace.id}.md`,
      firstDollarReadinessRoomMarkdown(room),
      "text/markdown"
    );
    setText("[data-first-dollar-readiness-message]", "Exported first dollar readiness Markdown locally with one owner-evidence repair route and explicit false first-dollar claim states.");
  });

  document.querySelector("[data-export-first-dollar-owner-evidence-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const room = buildFirstDollarOwnerEvidenceRepairRoom(workspace, session);
    downloadLocalFile(
      `proofresume-first-dollar-owner-evidence-repair-room-${workspace.id}.json`,
      JSON.stringify(room, null, 2),
      "application/json"
    );
    setText("[data-first-dollar-owner-evidence-message]", "Exported owner evidence repair JSON locally. Payment links, checkout, production customer data, external actions, and downstream queue mutation remain disabled.");
  });

  document.querySelector("[data-export-first-dollar-owner-evidence-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const room = buildFirstDollarOwnerEvidenceRepairRoom(workspace, session);
    downloadLocalFile(
      `proofresume-first-dollar-owner-evidence-repair-room-${workspace.id}.md`,
      firstDollarOwnerEvidenceRepairRoomMarkdown(room),
      "text/markdown"
    );
    setText("[data-first-dollar-owner-evidence-message]", "Exported owner evidence repair Markdown locally with one approval-unblocker route and explicit false first-dollar claim states.");
  });

  document.querySelector("[data-export-live-proof-audit-copilot-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const copilot = buildFirstLiveProofAuditCopilot(workspace, session);
    downloadLocalFile(
      `proofresume-first-live-proof-audit-copilot-${workspace.id}.json`,
      JSON.stringify(copilot, null, 2),
      "application/json"
    );
    setText("[data-live-proof-audit-copilot-message]", "Exported first live proof-audit copilot JSON locally. No external action, payment, customer-data handling, queue mutation, or live claim occurred.");
  });

  document.querySelector("[data-export-live-proof-audit-copilot-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const copilot = buildFirstLiveProofAuditCopilot(workspace, session);
    downloadLocalFile(
      `proofresume-first-live-proof-audit-copilot-${workspace.id}.md`,
      firstLiveProofAuditCopilotMarkdown(copilot),
      "text/markdown"
    );
    setText("[data-live-proof-audit-copilot-message]", "Exported first live proof-audit copilot Markdown locally with one internal route and explicit false live/revenue states.");
  });

  document.querySelector("[data-export-live-to-paid-pilot-decision-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const room = buildLiveToPaidPilotDecisionRoom(workspace, session);
    downloadLocalFile(
      `proofresume-live-to-paid-pilot-decision-room-${workspace.id}.json`,
      JSON.stringify(room, null, 2),
      "application/json"
    );
    setText("[data-live-to-paid-pilot-decision-message]", "Exported live-to-paid-pilot decision JSON locally. No checkout, payment, customer-data handling, external action, queue mutation, or revenue claim occurred.");
  });

  document.querySelector("[data-export-live-to-paid-pilot-decision-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const room = buildLiveToPaidPilotDecisionRoom(workspace, session);
    downloadLocalFile(
      `proofresume-live-to-paid-pilot-decision-room-${workspace.id}.md`,
      liveToPaidPilotDecisionRoomMarkdown(room),
      "text/markdown"
    );
    setText("[data-live-to-paid-pilot-decision-message]", "Exported live-to-paid-pilot decision Markdown locally with one product repair route and explicit false live/revenue states.");
  });

  document.querySelector("[data-export-live-proof-trust-gap-repair-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const room = buildLiveProofTrustGapRepairRoom(workspace, session);
    downloadLocalFile(
      `proofresume-live-proof-trust-gap-repair-room-${workspace.id}.json`,
      JSON.stringify(room, null, 2),
      "application/json"
    );
    setText("[data-live-proof-trust-gap-repair-message]", "Exported trust-gap repair JSON locally. No customer-data handling, payment, external action, queue mutation, public-proof, or revenue claim occurred.");
  });

  document.querySelector("[data-export-live-proof-trust-gap-repair-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const room = buildLiveProofTrustGapRepairRoom(workspace, session);
    downloadLocalFile(
      `proofresume-live-proof-trust-gap-repair-room-${workspace.id}.md`,
      liveProofTrustGapRepairRoomMarkdown(room),
      "text/markdown"
    );
    setText("[data-live-proof-trust-gap-repair-message]", "Exported trust-gap repair Markdown locally with one missing-proof cue repair route and explicit false live/revenue states.");
  });

  document.querySelector("[data-export-live-proof-missing-proof-cue-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const room = buildLiveProofMissingProofCueRepair(workspace, session);
    downloadLocalFile(
      `proofresume-live-proof-missing-proof-cue-repair-${workspace.id}.json`,
      JSON.stringify(room, null, 2),
      "application/json"
    );
    setText("[data-live-proof-missing-proof-cue-message]", "Exported missing-proof cue JSON locally. No send, payment, customer-data handling, external action, queue mutation, or revenue claim occurred.");
  });

  document.querySelector("[data-export-live-proof-missing-proof-cue-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const room = buildLiveProofMissingProofCueRepair(workspace, session);
    downloadLocalFile(
      `proofresume-live-proof-missing-proof-cue-repair-${workspace.id}.md`,
      liveProofMissingProofCueRepairMarkdown(room),
      "text/markdown"
    );
    setText("[data-live-proof-missing-proof-cue-message]", "Exported missing-proof cue Markdown locally with one no-send follow-up route and explicit false live/revenue states.");
  });

  document.querySelector("[data-export-paid-pilot-trust-gap-lab-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const lab = buildPaidPilotTrustGapRepairLab(workspace, session);
    downloadLocalFile(`proofresume-paid-pilot-trust-gap-repair-lab-${workspace.id}.json`, JSON.stringify(lab, null, 2), "application/json");
    setText("[data-paid-pilot-trust-gap-lab-message]", "Exported paid-pilot trust lab JSON locally. No checkout, send, customer-data handling, payment, queue mutation, or revenue claim occurred.");
  });

  document.querySelector("[data-export-paid-pilot-trust-gap-lab-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const lab = buildPaidPilotTrustGapRepairLab(workspace, session);
    downloadLocalFile(`proofresume-paid-pilot-trust-gap-repair-lab-${workspace.id}.md`, paidPilotTrustGapRepairLabMarkdown(lab), "text/markdown");
    setText("[data-paid-pilot-trust-gap-lab-message]", "Exported paid-pilot trust lab Markdown locally with one no-send owner/prospect prep route.");
  });

  document.querySelector("[data-export-proof-delta-value-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const snapshot = buildProofDeltaValueSnapshot(workspace, session);
    downloadLocalFile(`proofresume-proof-delta-value-snapshot-${workspace.id}.json`, JSON.stringify(snapshot, null, 2), "application/json");
    setText("[data-proof-delta-value-message]", "Exported proof-delta JSON locally. No send, payment, customer-data handling, public proof, queue mutation, or revenue claim occurred.");
  });

  document.querySelector("[data-export-proof-delta-value-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const snapshot = buildProofDeltaValueSnapshot(workspace, session);
    downloadLocalFile(`proofresume-proof-delta-value-snapshot-${workspace.id}.md`, proofDeltaValueSnapshotMarkdown(snapshot), "text/markdown");
    setText("[data-proof-delta-value-message]", "Exported proof-delta Markdown locally with one no-send follow-up route.");
  });

  document.querySelector("[data-export-fulfillment-receipt-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const receipt = buildFirstPaidPilotFulfillmentReceiptPreview(workspace, session);
    downloadLocalFile("proofresume-first-paid-pilot-fulfillment-receipt-preview-" + workspace.id + ".json", JSON.stringify(receipt, null, 2), "application/json");
    setText("[data-fulfillment-receipt-message]", "Exported fulfillment receipt JSON locally. Checkout, payment, production customer data, external actions, and downstream queue mutation remain disabled.");
  });

  document.querySelector("[data-export-fulfillment-receipt-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const receipt = buildFirstPaidPilotFulfillmentReceiptPreview(workspace, session);
    downloadLocalFile("proofresume-first-paid-pilot-fulfillment-receipt-preview-" + workspace.id + ".md", firstPaidPilotFulfillmentReceiptPreviewMarkdown(receipt), "text/markdown");
    setText("[data-fulfillment-receipt-message]", "Exported fulfillment receipt Markdown locally with one owner-evidence repair route and explicit false live/revenue claim states.");
  });

  document.querySelector("[data-export-proof-audit-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const packet = buildProofAuditPacket(workspace, session);
    downloadLocalFile(
      `proofresume-proof-audit-${workspace.id}.json`,
      JSON.stringify(packet, null, 2),
      "application/json"
    );
    setText("[data-proof-audit-message]", "Exported local proof audit JSON. Manual sharing still requires candidate consent.");
  });

  document.querySelector("[data-export-proof-audit-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const packet = buildProofAuditPacket(workspace, session);
    downloadLocalFile(
      `proofresume-proof-audit-${workspace.id}.md`,
      proofAuditMarkdown(packet),
      "text/markdown"
    );
    setText("[data-proof-audit-message]", "Exported local proof audit Markdown. No network, upload, analytics, payment, send, or apply action occurred.");
  });

  document.querySelector("[data-export-consented-handoff-json]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const handoff = buildConsentedAuditHandoffPreview(workspace, session);
    downloadLocalFile(
      `proofresume-consented-audit-handoff-${workspace.id}.json`,
      JSON.stringify(handoff, null, 2),
      "application/json"
    );
    setText("[data-consented-handoff-message]", "Exported local consented handoff JSON. Candidate consent, target-job approval, and no-send boundaries still apply.");
  });

  document.querySelector("[data-export-consented-handoff-markdown]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const handoff = buildConsentedAuditHandoffPreview(workspace, session);
    downloadLocalFile(
      `proofresume-consented-audit-handoff-${workspace.id}.md`,
      consentedAuditHandoffMarkdown(handoff),
      "text/markdown"
    );
    setText("[data-consented-handoff-message]", "Exported local consented handoff Markdown. No outreach, scheduling, payment, analytics, public proof, upload, send, or apply action occurred.");
  });

  document.querySelector("[data-export-workspace]")?.addEventListener("click", () => {
    const session = readSession();
    if (!session) {
      window.location.hash = "#/signin";
      renderRoute();
      return;
    }
    const workspace = ensureWorkspace(session);
    const payload = {
      format: WORKSPACE_EXPORT_FORMAT,
      exportedAt: new Date().toISOString(),
      boundary: "Browser-local prototype export. No production storage or third-party upload was used.",
      workspace,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `proofresume-workspace-${workspace.id}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setText("[data-resume-message]", "Exported a local workspace JSON archive from this browser.");
  });

  window.addEventListener("hashchange", renderRoute);
}

bindEvents();
renderRoute();

export {
  SESSION_KEY,
  WORKSPACE_KEY,
  WORKSPACE_EXPORT_FORMAT,
  NORTHSTAR_DEMO_WALKTHROUGH_FORMAT,
  PROOF_AUDIT_PACKET_FORMAT,
  PAID_PACKET_CUSTOMER_PREVIEW_FORMAT,
  FIRST_SESSION_OBJECTION_REPAIR_WIZARD_FORMAT,
  FIRST_CUSTOMER_CONCIERGE_DEMO_BUNDLE_FORMAT,
  FIRST_CUSTOMER_REACTION_ROUTE_RECORDER_FORMAT,
  FIRST_CUSTOMER_EVIDENCE_INBOX_ROOM_FORMAT,
  FIRST_CUSTOMER_EVIDENCE_ROUTE_SCOREBOARD_FORMAT,
  FIRST_CUSTOMER_EVIDENCE_PROOF_REPAIR_PACKET_FORMAT,
  REPAIRED_PROOF_TO_PAID_ASK_ROOM_FORMAT,
  PAID_ASK_OUTCOME_ROUTER_FORMAT,
  PAID_ASK_PROOF_PACKET_CLARITY_REPAIR_FORMAT,
  PAID_ASK_OBJECTION_RESPONSE_SIMULATOR_FORMAT,
  FIRST_PAID_PILOT_HANDOFF_ROOM_FORMAT,
  FIRST_DOLLAR_READINESS_ROOM_FORMAT,
  FIRST_LIVE_PROOF_AUDIT_COPILOT_FORMAT,
  PAID_PACKET_PREVIEW_CHOICES,
  FIRST_SESSION_OBJECTION_CASES,
  providerPlan,
  buildProofAuditPacket,
  buildFirstSessionObjectionRepairWizard,
  firstSessionObjectionRepairWizardMarkdown,
  buildFirstCustomerConciergeDemoBundle,
  firstCustomerConciergeDemoBundleMarkdown,
  buildFirstCustomerReactionRouteRecorder,
  firstCustomerReactionRouteRecorderMarkdown,
  buildFirstCustomerEvidenceInboxRoom,
  firstCustomerEvidenceInboxRoomMarkdown,
  buildFirstCustomerEvidenceRouteScoreboard,
  firstCustomerEvidenceRouteScoreboardMarkdown,
  buildFirstCustomerEvidenceProofRepairPacket,
  firstCustomerEvidenceProofRepairPacketMarkdown,
  buildRepairedProofToPaidAskRoom,
  repairedProofToPaidAskRoomMarkdown,
  buildPaidAskOutcomeRouter,
  paidAskOutcomeRouterMarkdown,
  buildPaidAskProofPacketClarityRepair,
  paidAskProofPacketClarityRepairMarkdown,
  buildPaidAskObjectionResponseSimulator,
  paidAskObjectionResponseSimulatorMarkdown,
  buildFirstPaidPilotHandoffRoom,
  firstPaidPilotHandoffRoomMarkdown,
  buildFirstDollarReadinessRoom,
  firstDollarReadinessRoomMarkdown,
  buildFirstLiveProofAuditCopilot,
  firstLiveProofAuditCopilotMarkdown,
  buildLiveToPaidPilotDecisionRoom,
  liveToPaidPilotDecisionRoomMarkdown,
  buildLiveProofTrustGapRepairRoom,
  liveProofTrustGapRepairRoomMarkdown,
  buildLiveProofMissingProofCueRepair,
  liveProofMissingProofCueRepairMarkdown,
  buildPaidPilotTrustGapRepairLab,
  paidPilotTrustGapRepairLabMarkdown,
  buildProofDeltaValueSnapshot,
  proofDeltaValueSnapshotMarkdown,
  proofAuditMarkdown,
  createLocalDemoIdentity,
  deriveResumeSummary,
  emptyResumeState,
  readSession,
  ensureWorkspace,
  signInLocal,
  signOutLocal,
  seedNorthstarDemoWalkthrough,
  resetNorthstarDemoWorkspace,
  workspaceIdFor,
};

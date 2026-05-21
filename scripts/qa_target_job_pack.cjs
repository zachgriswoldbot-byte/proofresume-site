const path = require("path");
const { chromium, firefox, webkit } = require("playwright");
const vm = require("vm");
const { execFileSync } = require("child_process");

const fs = require("fs");
const os = require("os");

const root = path.resolve(__dirname, "..");
const projectRoot = path.resolve(root, "..");
const targetJobHtmlPath = path.join(root, "target-job.html");
const targetJobJsPath = path.join(root, "target-job.js");
const stylesPath = path.join(root, "styles.css");
const businessControlsPolicyPath = path.resolve(root, "..", "ops", "BUSINESS_CONTROLS.json");
const businessControlsPolicy = JSON.parse(fs.readFileSync(businessControlsPolicyPath, "utf8"));
const FIT_COMPONENT_IDS = [
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

function inlineTargetJobFixture() {
  const html = fs.readFileSync(targetJobHtmlPath, "utf8");
  const js = fs.readFileSync(targetJobJsPath, "utf8");
  const css = fs.readFileSync(stylesPath, "utf8");

  const withoutExternalCss = html.replace(/<link\s+[^>]*href="styles\.css"[^>]*>/i, `<style>${css}</style>`);
  const withoutModuleScript = withoutExternalCss.replace(
    /<script\s+type="module"\s+src="target-job\.js"\s*><\/script>/i,
    `<script>${js}</script>`
  );

  return withoutModuleScript;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertDiagnosticCount(text, label, count) {
  const pattern = new RegExp(`${label}\\s+${count}\\b`, "i");
  assert(pattern.test(String(text || "").replace(/\s+/g, " ")), `expected import diagnostics to show ${label} ${count}`);
}

function targetJobLocalApiFixture() {
  return {
    resumeText: [
      "Maya Patel",
      "Customer Operations Lead",
      "Experience",
      "- Built onboarding dashboards and improved support analytics by 32%.",
      "- Improved support workflow documentation for 6 pilot accounts.",
      "Skills",
      "HubSpot, Excel, support analytics, stakeholder communication",
    ].join("\n"),
    structuredProfile: {
      identity: { name: "Maya Patel", headline: "Customer Operations Lead" },
      skills: ["HubSpot", "Excel", "support analytics", "stakeholder communication"],
      projects: [{ name: "Onboarding dashboards", highlights: ["Reduced repeat intake questions by 32%."] }],
    },
    jobText: [
      "Customer Operations Manager",
      "Company: BrightLedger",
      "Apply: https://example.com/jobs/customer-operations-manager",
      "Location: Remote",
      "Requirements: HubSpot, Excel, analytics, stakeholder communication.",
      "Responsibilities: improve onboarding dashboards and support workflows.",
    ].join("\n"),
    candidateLevel: "senior",
    preferredLocation: "Remote",
  };
}

function assertLocalContractBoundary(subject, label) {
  for (const key of ["localOnly", "noExternalFetch", "noAutoApply", "noOutboundSend", "noUpload", "noAnalyticsSend"]) {
    assert(subject?.[key] === true, `${label} expected ${key} true`);
  }
}

function assertTargetJobLocalApiContractFixture(contract, label) {
  assert(contract.hookContractsFormat === "proofresume-target-job-local-tool-contracts-v1", `${label} expected local API contract format hook`);
  assert(contract.hookResultFormat === "proofresume-target-job-local-tool-result-v1", `${label} expected local API result format hook`);
  assert(contract.contracts?.format === "proofresume-target-job-local-tool-contracts-v1", `${label} expected local tool contracts format`);
  assert(contract.contracts?.source === "browser-local-deterministic-analysis", `${label} expected browser-local deterministic source`);
  assert(contract.contracts?.version === "v1", `${label} expected contract version v1`);
  assertLocalContractBoundary(contract.contracts, `${label} contracts`);

  const toolNames = (contract.contracts?.tools || []).map((tool) => tool.name);
  assert(
    toolNames.slice(0, 3).join("|") === "extract_lead_intel|evaluate_lead_quality|score_job_fit",
    `${label} expected local tool order prefix`
  );
  if (toolNames.includes("extract_keyword_highlights")) {
    assert(
      toolNames[3] === "extract_keyword_highlights",
      `${label} expected extract_keyword_highlights to remain the additive local tool after score_job_fit`
    );
  }

  const extract = contract.results?.extractLeadIntel || {};
  assert(extract.format === "proofresume-target-job-local-tool-result-v1", `${label} expected extract_lead_intel result format`);
  assert(extract.tool === "extract_lead_intel", `${label} expected extract_lead_intel result tool`);
  assertLocalContractBoundary(extract, `${label} extract_lead_intel result`);
  assert(extract.jobIntel?.company === "BrightLedger", `${label} expected extracted company fixture`);
  assert(/customer operations manager/i.test(String(extract.jobIntel?.title || "")), `${label} expected extracted title fixture`);
  assert(extract.inputNormalization?.job && typeof extract.inputNormalization.job === "object", `${label} expected extract input normalization`);

  const quality = contract.results?.evaluateLeadQuality || {};
  assert(quality.format === "proofresume-target-job-local-tool-result-v1", `${label} expected evaluate_lead_quality result format`);
  assert(quality.tool === "evaluate_lead_quality", `${label} expected evaluate_lead_quality result tool`);
  assertLocalContractBoundary(quality, `${label} evaluate_lead_quality result`);
  assert(Number.isFinite(quality.leadQuality?.score), `${label} expected numeric lead quality score`);
  assert(typeof quality.leadQuality?.accepted === "boolean", `${label} expected lead quality accepted boolean`);

  const score = contract.results?.scoreJobFit || {};
  assert(score.format === "proofresume-target-job-local-tool-result-v1", `${label} expected score_job_fit result format`);
  assert(score.tool === "score_job_fit", `${label} expected score_job_fit result tool`);
  assertLocalContractBoundary(score, `${label} score_job_fit result`);
  assert(score.learningApplied === false, `${label} expected score_job_fit to keep learningApplied false`);
  assert(Number.isFinite(score.fit?.score), `${label} expected numeric fit score`);
  assert(Array.isArray(score.fit?.components) && score.fit.components.length === FIT_COMPONENT_IDS.length, `${label} expected full fit component set`);
  assert(FIT_COMPONENT_IDS.every((componentId) => score.fit.componentScores && Number.isFinite(Number(score.fit.componentScores[componentId]))), `${label} expected componentScores for every fit component`);
  assert(score.resumeEvidenceSummary?.skillCount >= 4, `${label} expected fixture resume evidence skill count`);
  assert(score.structuredProfileSummary?.skillCount >= 4, `${label} expected fixture structured profile summary`);
  assert(contract.networkCalls.length === 0, `${label} expected local API fixture to avoid network/send calls`);
}

function jobSourcingScrapingControl(policy = businessControlsPolicy) {
  const control = (policy?.controls || []).find((candidate) => candidate?.id === "job_sourcing_scraping");
  assert(control, "BUSINESS_CONTROLS expected job_sourcing_scraping control");
  return control;
}

function assertJobSourcingScrapingBusinessControl(control, label) {
  assert(control?.id === "job_sourcing_scraping", `${label} expected job_sourcing_scraping control id`);
  for (const evidence of ["source policy", "rate limit", "data fields", "terms-risk note"]) {
    assert(
      Array.isArray(control.requiredEvidenceToEnable) && control.requiredEvidenceToEnable.includes(evidence),
      `${label} expected sourcing control evidence: ${evidence}`
    );
  }
  assert(control.limitsWhenEnabled?.preferOfficialApis === true, `${label} expected official API preference`);
  assert(control.limitsWhenEnabled?.respectRobotsAndTerms === true, `${label} expected terms/robots respect limit`);
  assert(control.limitsWhenEnabled?.mayBypassAuthOrCaptcha === false, `${label} expected auth/CAPTCHA bypass block`);
  assert(control.limitsWhenEnabled?.mayCollectPersonalEmailsFromJobPages === false, `${label} expected personal-email collection block`);
  assert(Number(control.limitsWhenEnabled?.dailySourceFetchLimit || 0) > 0, `${label} expected controlled source fetch limit`);
  for (const ask of ["approval to use sources with unclear or restrictive terms", "credentialed source access"]) {
    assert(Array.isArray(control.askUserOnlyFor) && control.askUserOnlyFor.includes(ask), `${label} expected sourcing ask-only gate: ${ask}`);
  }
  for (const stopCondition of ["source blocks scraping", "terms prohibit the collection method", "rate limit reached"]) {
    assert(Array.isArray(control.stopConditions) && control.stopConditions.includes(stopCondition), `${label} expected sourcing stop condition: ${stopCondition}`);
  }
}

function buildSourcingConnectorContract({ policy = businessControlsPolicy, sourcePolicyUi, lead, diagnostics, networkCalls = [] }) {
  const control = jobSourcingScrapingControl(policy);
  const metadata = lead?.sourceMetadata || {};
  return {
    format: "proofresume-target-job-sourcing-connector-contract-v1",
    source: "BUSINESS_CONTROLS.job_sourcing_scraping + target-job local source policy UI",
    businessControlId: control.id,
    businessControlStatus: control.status,
    connectorMode: "controlled-local-input-fallback",
    prototypeFetchLimit: 0,
    businessControlFetchLimit: Number(control.limitsWhenEnabled?.dailySourceFetchLimit || 0),
    preferOfficialApis: control.limitsWhenEnabled?.preferOfficialApis === true,
    respectRobotsAndTerms: control.limitsWhenEnabled?.respectRobotsAndTerms === true,
    mayBypassAuthOrCaptcha: control.limitsWhenEnabled?.mayBypassAuthOrCaptcha === true,
    mayCollectPersonalEmailsFromJobPages: control.limitsWhenEnabled?.mayCollectPersonalEmailsFromJobPages === true,
    requiredEvidenceToEnable: control.requiredEvidenceToEnable || [],
    askUserOnlyFor: control.askUserOnlyFor || [],
    stopConditions: control.stopConditions || [],
    sourcePolicyUi: sourcePolicyUi || {},
    diagnostics: diagnostics || {},
    sourceMetadata: {
      format: metadata.format,
      adapter: metadata.adapter,
      sourceKind: metadata.sourceKind,
      platform: metadata.platform,
      url: metadata.url,
      postedDate: metadata.postedDate,
      importedAt: metadata.importedAt,
      duplicate: metadata.duplicate,
      localOnly: metadata.localOnly,
      noExternalFetch: metadata.noExternalFetch,
    },
    sourceDiagnostic: metadata.url ? "Source URL captured from local input" : "Missing source URL",
    freshnessDiagnostic: metadata.postedDate ? "Posted date captured from local input" : "Freshness needs review",
    termsRisk: "review-needed",
    localOnly: true,
    noExternalFetch: true,
    noAutoApply: true,
    noOutboundSend: true,
    noUpload: true,
    noAnalyticsSend: true,
    networkCalls,
  };
}

function assertSourcingConnectorContract(contract, label) {
  assert(contract?.format === "proofresume-target-job-sourcing-connector-contract-v1", `${label} expected sourcing connector contract format`);
  assertLocalContractBoundary(contract, `${label} sourcing connector contract`);
  assert(contract.businessControlId === "job_sourcing_scraping", `${label} expected job_sourcing_scraping alignment`);
  assert(contract.connectorMode === "controlled-local-input-fallback", `${label} expected controlled local fallback connector mode`);
  assert(contract.prototypeFetchLimit === 0, `${label} expected Target Job prototype fetch limit to stay zero`);
  assert(contract.businessControlFetchLimit > 0, `${label} expected BUSINESS_CONTROLS source fetch limit to be visible`);
  assert(contract.preferOfficialApis === true, `${label} expected official/API/export preference`);
  assert(contract.respectRobotsAndTerms === true, `${label} expected terms/robots policy`);
  assert(contract.mayBypassAuthOrCaptcha === false, `${label} expected auth/CAPTCHA bypass to remain blocked`);
  assert(contract.mayCollectPersonalEmailsFromJobPages === false, `${label} expected personal-email collection to remain blocked`);
  assert(contract.networkCalls.length === 0, `${label} expected controlled connector to avoid network/send calls`);
  assertJobSourcingScrapingBusinessControl(
    {
      id: contract.businessControlId,
      requiredEvidenceToEnable: contract.requiredEvidenceToEnable,
      limitsWhenEnabled: {
        dailySourceFetchLimit: contract.businessControlFetchLimit,
        preferOfficialApis: contract.preferOfficialApis,
        respectRobotsAndTerms: contract.respectRobotsAndTerms,
        mayBypassAuthOrCaptcha: contract.mayBypassAuthOrCaptcha,
        mayCollectPersonalEmailsFromJobPages: contract.mayCollectPersonalEmailsFromJobPages,
      },
      askUserOnlyFor: contract.askUserOnlyFor,
      stopConditions: contract.stopConditions,
    },
    label
  );

  const sourcePolicyKinds = Array.isArray(contract.sourcePolicyUi?.cards) ? contract.sourcePolicyUi.cards.map((card) => card.kind) : [];
  for (const kind of ["official", "public", "credentialed", "forbidden"]) {
    assert(sourcePolicyKinds.includes(kind), `${label} expected source policy UI card: ${kind}`);
  }
  assert(/local import only/i.test(String(contract.sourcePolicyUi?.adapterCopy || "")), `${label} expected local import adapter copy`);
  assert(/not checked/i.test(String(contract.sourcePolicyUi?.diagnostics?.source || "")), `${label} expected source diagnostic placeholder`);
  assert(/not checked/i.test(String(contract.sourcePolicyUi?.diagnostics?.freshness || "")), `${label} expected freshness diagnostic placeholder`);
  assert(/review needed/i.test(String(contract.sourcePolicyUi?.diagnostics?.termsRisk || "")), `${label} expected terms-risk diagnostic placeholder`);
  assert(contract.termsRisk === "review-needed", `${label} expected terms risk review-needed classification`);
  assert(contract.sourceMetadata?.format === "proofresume-source-adapter-import-v1", `${label} expected source metadata format`);
  assert(contract.sourceMetadata?.localOnly === true, `${label} expected source metadata localOnly`);
  assert(contract.sourceMetadata?.noExternalFetch === true, `${label} expected source metadata noExternalFetch`);
  assert(contract.diagnostics?.format === "proofresume-source-adapter-diagnostics-v1", `${label} expected source diagnostics format`);
  for (const key of ["accepted", "rejected", "duplicate", "missingUrl", "missingCompany", "stale"]) {
    assert(Number.isFinite(Number(contract.diagnostics[key])), `${label} expected numeric diagnostics ${key}`);
  }
}

const TJ_AUTO_APPLY_CONTROL_UI_TOKENS = [
  "data-target-job-auto-apply-controls",
  "data-target-job-auto-apply-dry-run-plan",
  "data-target-job-auto-apply-candidate-consent",
  "data-target-job-auto-apply-job-consent",
  "data-target-job-auto-apply-sensitive-question-stop",
  "data-target-job-auto-apply-audit-log",
  "data-target-job-auto-apply-submission-log",
  "data-target-job-auto-apply-network-boundary",
];

const TJ_AUTO_APPLY_FORBIDDEN_QUESTION_CATEGORIES = [
  "eeo-demographic",
  "disability",
  "veteran-status",
  "work-authorization-attestation",
  "legal-attestation",
  "salary-negotiation",
  "personal-judgment",
  "novel-answer",
];

const TJ_AUTO_APPLY_STOP_TRIGGERS = [
  "candidate-consent-missing",
  "target-job-consent-missing",
  "approved-materials-missing",
  "sensitive-question",
  "legal-attestation",
  "auth-required",
  "account-creation",
  "mfa-required",
  "anti-bot-challenge",
  "site-forbids-automation",
];

function autoApplyBusinessControl(policy = businessControlsPolicy) {
  const control = (policy?.controls || []).find((candidate) => candidate?.id === "auto_apply");
  assert(control, "BUSINESS_CONTROLS expected auto_apply control");
  return control;
}

function assertAutoApplyBusinessControl(control, label) {
  assert(control?.id === "auto_apply", `${label} expected auto_apply control id`);
  assert(control.status === "enabled_with_candidate_consent", `${label} expected candidate-consent-gated auto_apply status`);
  for (const evidence of ["candidate identity and consent", "approved resume/materials", "target job approval", "answer policy for application questions"]) {
    assert(
      Array.isArray(control.requiredEvidenceToEnable) && control.requiredEvidenceToEnable.includes(evidence),
      `${label} expected auto_apply evidence: ${evidence}`
    );
  }
  assert(Number(control.limitsWhenEnabled?.dailyApplicationLimit) === 10, `${label} expected daily application limit 10`);
  assert(control.limitsWhenEnabled?.requiresPerCandidateConsent === true, `${label} expected per-candidate consent gate`);
  assert(control.limitsWhenEnabled?.requiresPerJobConsent === true, `${label} expected per-job consent gate`);
  assert(control.limitsWhenEnabled?.mayAnswerSensitiveDemographicQuestions === false, `${label} expected sensitive demographic question block`);
  assert(control.limitsWhenEnabled?.mayCreateAccounts === false, `${label} expected account-creation block`);
  assert(control.limitsWhenEnabled?.mayBypassAntiBot === false, `${label} expected anti-bot bypass block`);
  for (const ask of ["candidate consent", "unknown application answers", "account credentials or MFA", "policy for sensitive questions"]) {
    assert(Array.isArray(control.askUserOnlyFor) && control.askUserOnlyFor.includes(ask), `${label} expected auto_apply ask-only gate: ${ask}`);
  }
  for (const stopCondition of [
    "candidate consent missing",
    "job target not approved",
    "application asks sensitive/legal/personal-judgment question",
    "site forbids automation",
    "anti-bot or MFA appears",
  ]) {
    assert(Array.isArray(control.stopConditions) && control.stopConditions.includes(stopCondition), `${label} expected auto_apply stop condition: ${stopCondition}`);
  }
}

function buildAutoApplyControlsContract({ policy = businessControlsPolicy, networkCalls = [] } = {}) {
  const control = autoApplyBusinessControl(policy);
  return {
    format: "proofresume-target-job-auto-apply-controls-contract-v1",
    source: "BUSINESS_CONTROLS.auto_apply + Target Job local dry-run boundary",
    businessControlId: control.id,
    businessControlStatus: control.status,
    uiTokens: TJ_AUTO_APPLY_CONTROL_UI_TOKENS,
    dailyApplicationLimit: Number(control.limitsWhenEnabled?.dailyApplicationLimit || 0),
    requiredEvidenceToEnable: control.requiredEvidenceToEnable || [],
    askUserOnlyFor: control.askUserOnlyFor || [],
    stopConditions: control.stopConditions || [],
    limitsWhenEnabled: {
      requiresPerCandidateConsent: control.limitsWhenEnabled?.requiresPerCandidateConsent === true,
      requiresPerJobConsent: control.limitsWhenEnabled?.requiresPerJobConsent === true,
      mayAnswerSensitiveDemographicQuestions: control.limitsWhenEnabled?.mayAnswerSensitiveDemographicQuestions === true,
      mayCreateAccounts: control.limitsWhenEnabled?.mayCreateAccounts === true,
      mayBypassAntiBot: control.limitsWhenEnabled?.mayBypassAntiBot === true,
    },
    localDryRunApplicationPlan: {
      format: "proofresume-target-job-local-dry-run-application-plan-v1",
      mode: "local-dry-run-only",
      planState: "blocked-until-explicit-consent",
      executable: false,
      candidateConsentRequired: true,
      perJobConsentRequired: true,
      approvedMaterialsRequired: true,
      targetJobApprovalRequired: true,
      answerPolicyRequired: true,
      allowedActions: ["read local packet", "map local fields", "list unanswered fields", "prepare manual review checklist"],
      forbiddenActions: ["network request", "send", "upload", "analytics event", "real submit", "account creation", "credential collection", "MFA handling", "anti-bot bypass"],
      stopTriggers: TJ_AUTO_APPLY_STOP_TRIGGERS,
    },
    auditLogSchema: {
      format: "proofresume-target-job-auto-apply-audit-log-v1",
      requiredFields: [
        "timestamp",
        "candidateId",
        "leadId",
        "jobApprovalId",
        "candidateConsentId",
        "perJobConsentId",
        "planId",
        "action",
        "fieldLabel",
        "fieldValueSource",
        "decision",
        "stopReason",
        "localOnly",
        "networkAttempted",
      ],
      forbiddenFields: ["governmentIdentifier", "cardNumber", "password", "mfaCode", "captchaResponse", "secret", "token"],
      copy: {
        heading: "DRY RUN ONLY - no application submitted from ProofResume.",
        consent: "Required before any external submission: candidate consent id, target-job consent id, approved materials, and answer policy.",
        stop: "Stop on sensitive/legal/personal-judgment questions, auth, MFA, anti-bot, site-forbids-automation, or account creation.",
        retention: "Keep local planning evidence and stop reasons only; do not store credentials, CAPTCHA/MFA data, secrets, tokens, or submitted payloads.",
      },
    },
    submissionLogSchema: {
      format: "proofresume-target-job-auto-apply-submission-log-v1",
      state: "not-submitted",
      requiredFieldsIfSubmitted: ["submittedAt", "candidateConsentId", "perJobConsentId", "confirmationId", "submittedMaterials"],
      dryRunFields: ["plannedAt", "blockedReasons", "unknownQuestions", "sensitiveQuestions", "networkCalls"],
      realSubmissionRecorded: false,
      copy: "No live submission is recorded by the Target Job static dry-run workflow.",
    },
    consentGates: {
      candidate: { required: true, observed: false, storageKey: "candidateConsentId", scope: "candidate-level application authorization" },
      perJob: { required: true, observed: false, storageKey: "perJobConsentId", scope: "single target job authorization" },
    },
    forbiddenQuestionCategories: TJ_AUTO_APPLY_FORBIDDEN_QUESTION_CATEGORIES,
    stopMatrix: [
      { trigger: "candidate-consent-missing", decision: "blocked", stopReason: "candidate consent missing", humanReviewRequired: true },
      { trigger: "target-job-consent-missing", decision: "blocked", stopReason: "job target not approved", humanReviewRequired: true },
      { trigger: "sensitive-question", decision: "blocked", stopReason: "application asks sensitive/legal/personal-judgment question", humanReviewRequired: true },
      { trigger: "legal-attestation", decision: "blocked", stopReason: "application asks legal attestation question", humanReviewRequired: true },
      { trigger: "auth-required", decision: "blocked", stopReason: "account credentials required", humanReviewRequired: true },
      { trigger: "mfa-required", decision: "blocked", stopReason: "MFA appears", humanReviewRequired: true },
      { trigger: "anti-bot-challenge", decision: "blocked", stopReason: "anti-bot appears", humanReviewRequired: true },
      { trigger: "site-forbids-automation", decision: "blocked", stopReason: "site forbids automation", humanReviewRequired: true },
    ],
    sampleAuditRows: [
      {
        timestamp: "2026-05-16T00:00:00.000Z",
        candidateId: "candidate-local-fixture",
        leadId: "lead-local-fixture",
        jobApprovalId: "",
        candidateConsentId: "",
        perJobConsentId: "",
        planId: "dry-run-fixture",
        action: "dry-run-blocked",
        fieldLabel: "candidate consent",
        fieldValueSource: "not-observed",
        decision: "blocked",
        stopReason: "candidate consent missing",
        localOnly: true,
        networkAttempted: false,
      },
      {
        timestamp: "2026-05-16T00:00:00.000Z",
        candidateId: "candidate-local-fixture",
        leadId: "lead-local-fixture",
        jobApprovalId: "job-approval-local-fixture",
        candidateConsentId: "candidate-consent-local-fixture",
        perJobConsentId: "per-job-consent-local-fixture",
        planId: "dry-run-fixture",
        action: "dry-run-stop",
        fieldLabel: "legal attestation",
        fieldValueSource: "unknown-question",
        decision: "blocked",
        stopReason: "application asks sensitive/legal/personal-judgment question",
        localOnly: true,
        networkAttempted: false,
      },
    ],
    boundaries: {
      localOnly: true,
      noExternalFetch: true,
      noAutoApply: true,
      noOutboundSend: true,
      noUpload: true,
      noAnalyticsSend: true,
      noRealSubmit: true,
      noAccountCreation: true,
      noAntiBotBypass: true,
    },
    networkCalls,
  };
}

function assertAutoApplyControlsContract(contract, label) {
  assert(contract?.format === "proofresume-target-job-auto-apply-controls-contract-v1", `${label} expected auto-apply controls contract format`);
  assert(contract.businessControlId === "auto_apply", `${label} expected BUSINESS_CONTROLS auto_apply alignment`);
  assert(contract.businessControlStatus === "enabled_with_candidate_consent", `${label} expected consent-gated business control status`);
  assert(contract.dailyApplicationLimit === 10, `${label} expected BUSINESS_CONTROLS daily application limit`);
  assertAutoApplyBusinessControl(
    {
      id: contract.businessControlId,
      status: contract.businessControlStatus,
      requiredEvidenceToEnable: contract.requiredEvidenceToEnable,
      limitsWhenEnabled: {
        dailyApplicationLimit: contract.dailyApplicationLimit,
        requiresPerCandidateConsent: contract.limitsWhenEnabled?.requiresPerCandidateConsent,
        requiresPerJobConsent: contract.limitsWhenEnabled?.requiresPerJobConsent,
        mayAnswerSensitiveDemographicQuestions: contract.limitsWhenEnabled?.mayAnswerSensitiveDemographicQuestions,
        mayCreateAccounts: contract.limitsWhenEnabled?.mayCreateAccounts,
        mayBypassAntiBot: contract.limitsWhenEnabled?.mayBypassAntiBot,
      },
      askUserOnlyFor: contract.askUserOnlyFor,
      stopConditions: contract.stopConditions,
    },
    label
  );

  for (const token of TJ_AUTO_APPLY_CONTROL_UI_TOKENS) {
    assert(contract.uiTokens.includes(token), `${label} expected auto-apply UI token: ${token}`);
  }

  const plan = contract.localDryRunApplicationPlan || {};
  assert(plan.format === "proofresume-target-job-local-dry-run-application-plan-v1", `${label} expected local dry-run application plan format`);
  assert(plan.mode === "local-dry-run-only", `${label} expected local dry-run-only mode`);
  assert(plan.executable === false, `${label} expected dry-run plan to remain non-executable`);
  for (const key of ["candidateConsentRequired", "perJobConsentRequired", "approvedMaterialsRequired", "targetJobApprovalRequired", "answerPolicyRequired"]) {
    assert(plan[key] === true, `${label} expected dry-run plan gate ${key}`);
  }
  for (const forbidden of ["network request", "send", "upload", "analytics event", "real submit", "account creation", "anti-bot bypass"]) {
    assert(plan.forbiddenActions.includes(forbidden), `${label} expected dry-run forbidden action: ${forbidden}`);
  }
  for (const trigger of TJ_AUTO_APPLY_STOP_TRIGGERS) {
    assert(plan.stopTriggers.includes(trigger), `${label} expected dry-run stop trigger: ${trigger}`);
  }

  for (const schema of [contract.auditLogSchema, contract.submissionLogSchema]) {
    assert(schema?.format && /auto-apply/.test(schema.format), `${label} expected auto-apply log schema format`);
  }
  for (const field of ["candidateConsentId", "perJobConsentId", "fieldValueSource", "networkAttempted"]) {
    assert(contract.auditLogSchema.requiredFields.includes(field), `${label} expected audit log field: ${field}`);
  }
  for (const field of ["password", "mfaCode", "secret", "token"]) {
    assert(contract.auditLogSchema.forbiddenFields.includes(field), `${label} expected audit log forbidden field: ${field}`);
  }
  assert(contract.auditLogSchema.forbiddenFields.includes("captchaResponse"), `${label} expected audit log to forbid CAPTCHA data`);
  const auditCopy = Object.values(contract.auditLogSchema.copy || {}).join("\n");
  for (const token of ["DRY RUN ONLY", "no application submitted", "candidate consent id", "target-job consent id", "auth", "MFA", "anti-bot", "site-forbids-automation", "do not store credentials"]) {
    assert(auditCopy.includes(token), `${label} expected audit log copy token: ${token}`);
  }
  assert(contract.submissionLogSchema.state === "not-submitted", `${label} expected submission log to stay not-submitted`);
  assert(contract.submissionLogSchema.realSubmissionRecorded === false, `${label} expected no real submission record`);
  assert(/No live submission/i.test(String(contract.submissionLogSchema.copy || "")), `${label} expected submission log no-live-submission copy`);
  assert(contract.consentGates?.candidate?.required === true && contract.consentGates?.candidate?.observed === false, `${label} expected candidate consent required and unobserved`);
  assert(contract.consentGates?.perJob?.required === true && contract.consentGates?.perJob?.observed === false, `${label} expected per-job consent required and unobserved`);
  for (const category of TJ_AUTO_APPLY_FORBIDDEN_QUESTION_CATEGORIES) {
    assert(contract.forbiddenQuestionCategories.includes(category), `${label} expected forbidden question category: ${category}`);
  }
  const stopTriggers = new Set((contract.stopMatrix || []).map((row) => row.trigger));
  for (const trigger of ["sensitive-question", "legal-attestation", "auth-required", "mfa-required", "anti-bot-challenge", "site-forbids-automation"]) {
    assert(stopTriggers.has(trigger), `${label} expected stop matrix trigger: ${trigger}`);
  }
  for (const row of contract.stopMatrix || []) {
    assert(row.decision === "blocked" && row.humanReviewRequired === true, `${label} expected stop matrix row to stay blocked and human-review-required`);
  }
  assert(Array.isArray(contract.sampleAuditRows) && contract.sampleAuditRows.length >= 2, `${label} expected deterministic sample audit rows`);
  for (const row of contract.sampleAuditRows) {
    for (const field of contract.auditLogSchema.requiredFields) {
      assert(Object.prototype.hasOwnProperty.call(row, field), `${label} expected sample audit row field: ${field}`);
    }
    assert(row.decision === "blocked", `${label} expected sample audit row to stay blocked`);
    assert(row.localOnly === true && row.networkAttempted === false, `${label} expected sample audit row to stay local with no network attempted`);
  }
  for (const key of ["localOnly", "noExternalFetch", "noAutoApply", "noOutboundSend", "noUpload", "noAnalyticsSend", "noRealSubmit", "noAccountCreation", "noAntiBotBypass"]) {
    assert(contract.boundaries?.[key] === true, `${label} expected boundary ${key}`);
  }
  assert(Array.isArray(contract.networkCalls) && contract.networkCalls.length === 0, `${label} expected no network/send/upload/analytics calls`);

  const serialized = JSON.stringify(contract);
  for (const forbidden of [/fetch\s*\(/i, /XMLHttpRequest/i, /sendBeacon/i, /submit\s*\(/i, /upload\s*\(/i, /analytics(?:Sent|Enabled)?"?\s*:\s*true/i]) {
    assert(!forbidden.test(serialized), `${label} auto-apply controls contract exposed forbidden executable surface: ${forbidden}`);
  }
}

function targetJobAutoApplyDryRunFixture() {
  return {
    generatedAt: "2026-05-16T00:00:00.000Z",
    jobIntel: {
      title: "Customer Operations Manager",
      company: "BrightLedger",
      url: "https://example.com/jobs/customer-operations-manager",
      description: "Automation prohibited. Create an account, complete CAPTCHA, and enter MFA verification code before submitting.",
    },
    structuredProfile: {
      identity: {
        name: "Maya Patel",
        email: "maya@example.com",
        phone: "555-0100",
        location: "Remote",
        headline: "Customer Operations Lead",
        summary: "Built onboarding dashboards and support analytics.",
      },
      links: ["https://linkedin.com/in/maya-patel", "https://github.com/maya-patel", "https://maya.example.com"],
      skills: ["HubSpot", "Excel", "support analytics"],
    },
    applicationQuestions: [
      { id: "eeo", label: "Voluntary EEO: what is your race or ethnicity?", required: false },
      { id: "veteran", label: "Are you a protected veteran?", required: false },
      { id: "work_auth", label: "Are you legally authorized to work and will you require sponsorship?", required: true },
      { id: "salary", label: "What is your desired salary?", required: true },
      { id: "essay", label: "Tell us why you want this role.", required: true },
      { id: "unknown", label: "What is your preferred onboarding philosophy?", required: true },
    ],
    formText: "No automated submissions are permitted. Login, account creation, CAPTCHA, MFA, and password are required.",
    packet: {
      format: "proofresume-target-job-application-pack-v1",
      sourceLeadId: "lead-local-fixture",
      approvalState: "unapproved",
      applicationAssets: [
        { type: "tailored-resume", filenameHint: "maya-resume.md", approvalState: "unapproved", content: "Resume draft" },
        { type: "cover-letter", filenameHint: "maya-cover-letter.md", approvalState: "unapproved", content: "Cover letter draft" },
      ],
    },
    dailyApplicationCount: 10,
  };
}

function evaluateAutoApplyDryRunPlanFromHooks(hooks) {
  assert(typeof hooks.buildAutoApplyDryRunPlanContract === "function", "expected Target Job hook buildAutoApplyDryRunPlanContract");
  return hooks.buildAutoApplyDryRunPlanContract(targetJobAutoApplyDryRunFixture());
}

function assertAutoApplyDryRunPlanRuntimeContract(plan, label) {
  assert(plan?.format === "proofresume-target-job-local-dry-run-application-plan-v1", `${label} expected dry-run plan format`);
  assert(plan.tool === "plan_auto_apply_dry_run", `${label} expected dry-run planner tool name`);
  assert(plan.status === "blocked_before_external_action", `${label} expected dry-run plan to stay blocked`);
  assert(plan.enabled === false, `${label} expected auto-apply execution disabled`);
  assert(plan.disabledByDefault === true, `${label} expected disabled-by-default workspace`);
  assert(plan.dryRunOnly === true, `${label} expected dry-run-only workspace`);
  assert(plan.executable === false && plan.executionAllowed === false, `${label} expected non-executable plan`);
  assert(plan.control?.id === "auto_apply", `${label} expected auto_apply control alignment`);
  assert(plan.control?.dailyApplicationLimit === 10, `${label} expected daily application limit 10`);
  assert(Array.isArray(plan.control?.requiredEvidenceToEnable), `${label} expected required evidence list`);
  for (const evidence of ["candidate identity and consent", "approved resume/materials", "target job approval", "answer policy for application questions"]) {
    assert(plan.control.requiredEvidenceToEnable.includes(evidence), `${label} expected required evidence ${evidence}`);
  }

  for (const key of [
    "candidateConsentRequired",
    "perJobConsentRequired",
    "targetJobApprovalRequired",
    "materialsApprovalRequired",
    "answerPolicyRequired",
  ]) {
    assert(plan[key] === true, `${label} expected required gate ${key}`);
  }
  for (const key of ["candidateConsentPresent", "perJobConsentPresent", "targetJobApproved", "materialsApproved", "answerPolicyPresent"]) {
    assert(plan[key] === false, `${label} expected gate to remain missing in fixture: ${key}`);
  }
  assert(plan.approvalState?.candidateConsent?.present === false, `${label} expected candidate consent missing`);
  assert(plan.approvalState?.perJobConsent?.present === false, `${label} expected per-job consent missing`);
  assert(plan.approvalState?.materialsApproval?.present === false, `${label} expected materials approval missing`);
  assert(plan.approvalState?.materialsApproval?.approvedAssetCount === 0, `${label} expected no approved assets`);

  const mapping = plan.fieldMapping || {};
  assert(mapping.format === "proofresume-target-job-auto-apply-field-mapping-v1", `${label} expected field mapping format`);
  assert(mapping.mappedCount >= 7, `${label} expected local candidate/job fields to map`);
  assert(mapping.unavailableCount >= 2, `${label} expected unavailable unapproved material fields`);
  const mappedIds = new Set((mapping.mappings || []).map((field) => field.fieldId));
  for (const fieldId of ["candidate.fullName", "candidate.email", "candidate.phone", "candidate.location", "job.title", "job.company", "job.applyUrl"]) {
    assert(mappedIds.has(fieldId), `${label} expected local field mapping for ${fieldId}`);
  }
  const unavailableIds = new Set((mapping.unavailable || []).map((field) => field.fieldId));
  for (const fieldId of ["asset.resume", "asset.coverLetter"]) {
    assert(unavailableIds.has(fieldId), `${label} expected unapproved material to stay unavailable: ${fieldId}`);
  }
  for (const field of [...(mapping.mappings || []), ...(mapping.unavailable || [])]) {
    assert(field.planOnly === true, `${label} expected field mapping planOnly for ${field.fieldId}`);
    assert(field.fillAllowed === false, `${label} expected field mapping fill blocked for ${field.fieldId}`);
    assert(field.uploadAllowed === false, `${label} expected field mapping upload blocked for ${field.fieldId}`);
    assert(field.submitAllowed === false, `${label} expected field mapping submit blocked for ${field.fieldId}`);
  }

  const categories = new Set((plan.questionFlags || []).map((flag) => flag.category));
  for (const category of [
    "eeo-demographic",
    "veteran-status",
    "work-authorization-attestation",
    "salary-negotiation",
    "personal-judgment",
    "novel-answer",
  ]) {
    assert(categories.has(category), `${label} expected question flag category ${category}`);
  }
  for (const flag of plan.questionFlags || []) {
    assert(flag.autoAnswerAllowed === false, `${label} expected no auto-answer for ${flag.id}`);
    assert(flag.fillAllowed === false && flag.submitAllowed === false, `${label} expected question flag fill/submit blocked for ${flag.id}`);
  }

  const stopIds = new Set((plan.stopConditions || []).map((condition) => condition.id));
  for (const stopId of [
    "auto_apply_control_disabled",
    "account_creation_required",
    "mfa_required",
    "anti_bot_required",
    "forbidden_automation",
    "candidate_consent_missing",
    "per_job_consent_missing",
    "target_job_not_approved",
    "materials_not_approved",
    "answer_policy_missing",
    "daily_application_limit_reached",
  ]) {
    assert(stopIds.has(stopId), `${label} expected stop condition ${stopId}`);
  }
  for (const condition of plan.stopConditions || []) {
    assert(condition.severity === "block", `${label} expected stop condition to block: ${condition.id}`);
  }

  assert(plan.auditLogSchema?.format === "proofresume-target-job-auto-apply-audit-log-v1", `${label} expected audit log schema`);
  assert(plan.submissionLogSchema?.format === "proofresume-target-job-auto-apply-submission-log-v1", `${label} expected submission log schema`);
  for (const field of ["password", "sessionCookie", "authToken", "captchaSolution", "mfaCode", "rawSensitiveAnswer"]) {
    assert(plan.auditLogSchema.prohibitedFields.includes(field), `${label} expected audit prohibited field ${field}`);
  }
  for (const state of ["agent_submitted", "agent_uploaded", "agent_created_account", "agent_solved_captcha", "agent_handled_mfa"]) {
    assert(plan.submissionLogSchema.disallowedStates.includes(state), `${label} expected submission disallowed state ${state}`);
  }
  assert(plan.auditLogTemplate?.localOnly === true, `${label} expected local audit template`);
  assert(plan.submissionLogTemplate?.submittedExternally === false, `${label} expected no external submission`);
  assert(plan.submissionLogTemplate?.submittedByAgent === false, `${label} expected no agent submission`);
  assert((plan.blockedReasons || []).includes("materials_not_approved"), `${label} expected blocked reason for materials approval`);
  for (const key of [
    "localOnly",
    "noExternalFetch",
    "noAutoApply",
    "noOutboundSend",
    "noUpload",
    "noAnalyticsSend",
    "noSubmit",
    "noFileUpload",
    "noCredentialStorage",
    "noAccountCreation",
    "noMfaHandling",
    "noAntiBotBypass",
    "noExternalFormAutomation",
  ]) {
    assert(plan[key] === true, `${label} expected boundary ${key}`);
  }
}

function targetJobKeywordHighlightUxFixture() {
  return {
    resumeText: [
      "Maya Patel",
      "Customer Operations Lead",
      "Experience",
      "- Built onboarding dashboards and improved support analytics by 32%.",
      "- Improved support workflow documentation for 6 pilot accounts.",
      "Skills",
      "Excel, support analytics, stakeholder communication",
    ].join("\n"),
    structuredProfile: {
      identity: { name: "Maya Patel", headline: "Customer Operations Lead" },
      skills: ["Excel", "support analytics", "stakeholder communication"],
      projects: [{ name: "Onboarding dashboards", highlights: ["Improved onboarding dashboards for pilot accounts."] }],
    },
    jobText: [
      "Customer Operations Manager",
      "Company: BrightLedger",
      "Apply: https://example.com/jobs/customer-operations-manager",
      "Location: Remote",
      "Requirements: CRM, Excel, analytics, stakeholder communication, workflow automation, and remote collaboration.",
      "Responsibilities: improve onboarding dashboards and support workflows.",
    ].join("\n"),
    candidateLevel: "senior",
    preferredLocation: "Remote",
    watchTerms: ["excel", "analytics", "crm", "automation", "salesforce"],
  };
}

function buildKeywordHighlightUxContract({ result, networkCalls = [], watchTerms = [] }) {
  const fit = result?.fit || {};
  const existingHighlights = result?.keywordHighlights || fit.keywordHighlights || null;
  if (existingHighlights && Array.isArray(existingHighlights.keywords)) {
    const rows = existingHighlights.keywords.map((item) => ({
      term: String(item.normalized || item.keyword || "").toLowerCase(),
      highlightState: item.status === "matched" ? "matched" : "missing",
      missingClassification: item.status === "matched" ? "not-applicable" : item.gapTag === "proof-needed" ? "proof-needed" : "not-applicable",
      proofItems: [],
      hasMissingProofCopy: item.gapTag === "proof-needed",
      sourceKeyword: item.keyword,
      category: item.category,
      requiresProof: item.requiresProof === true,
    }));
    return {
      format: "proofresume-target-job-keyword-highlight-ux-contract-v1",
      source: existingHighlights.format || "local-fit-keyword-coverage",
      localOnly: true,
      noExternalFetch: true,
      noAutoApply: true,
      noOutboundSend: true,
      noUpload: true,
      noAnalyticsSend: true,
      rows,
      matchedTerms: rows.filter((row) => row.highlightState === "matched").map((row) => row.term),
      missingTerms: rows.filter((row) => row.highlightState === "missing").map((row) => row.term),
      proofNeededMissingTerms: rows.filter((row) => row.missingClassification === "proof-needed").map((row) => row.term),
      notApplicableMissingTerms: rows.filter((row) => row.missingClassification === "not-applicable" && row.highlightState === "missing").map((row) => row.term),
      coverage: existingHighlights.coverage,
      networkCalls,
    };
  }

  const matchedSkills = Array.isArray(fit.matchedSkills) ? fit.matchedSkills.map((skill) => String(skill).toLowerCase()) : [];
  const missingSkills = Array.isArray(fit.missingSkills) ? fit.missingSkills.map((skill) => String(skill).toLowerCase()) : [];
  const jobKeywords = Array.isArray(result?.jobIntel?.skills) ? result.jobIntel.skills.map((skill) => String(skill).toLowerCase()) : [];
  const missingProofGroups = Array.isArray(fit.missingProofGroups) ? fit.missingProofGroups : [];
  const missingProofText = missingProofGroups.flatMap((group) => (Array.isArray(group.items) ? group.items : [])).join("\n").toLowerCase();
  const allTerms = [...new Set([...matchedSkills, ...missingSkills, ...watchTerms.map((term) => String(term).toLowerCase())])].sort();
  const rows = allTerms.map((term) => {
    const isMatched = matchedSkills.includes(term);
    const isMissingJobKeyword = missingSkills.includes(term);
    const isDetectedJobKeyword = jobKeywords.includes(term);
    const proofItems = missingProofGroups.flatMap((group) =>
      (Array.isArray(group.items) ? group.items : [])
        .filter((item) => String(item).toLowerCase().includes(term))
        .map((item) => ({
          component: group.component,
          label: group.label,
          item,
        }))
    );
    return {
      term,
      highlightState: isMatched ? "matched" : "missing",
      missingClassification: isMatched ? "not-applicable" : isMissingJobKeyword ? "proof-needed" : isDetectedJobKeyword ? "proof-needed" : "not-applicable",
      proofItems,
      hasMissingProofCopy: isMissingJobKeyword && missingProofText.includes(term),
    };
  });
  return {
    format: "proofresume-target-job-keyword-highlight-ux-contract-v1",
    source: "local-fit-keyword-coverage",
    localOnly: true,
    noExternalFetch: true,
    noAutoApply: true,
    noOutboundSend: true,
    noUpload: true,
    noAnalyticsSend: true,
    rows,
    matchedTerms: rows.filter((row) => row.highlightState === "matched").map((row) => row.term),
    missingTerms: rows.filter((row) => row.highlightState === "missing").map((row) => row.term),
    proofNeededMissingTerms: rows.filter((row) => row.missingClassification === "proof-needed").map((row) => row.term),
    notApplicableMissingTerms: rows.filter((row) => row.missingClassification === "not-applicable" && row.highlightState === "missing").map((row) => row.term),
    networkCalls,
  };
}

function assertKeywordHighlightUxContract(contract, label) {
  assert(contract?.format === "proofresume-target-job-keyword-highlight-ux-contract-v1", `${label} expected keyword highlight UX contract format`);
  assertLocalContractBoundary(contract, `${label} keyword highlight UX contract`);
  assert(Array.isArray(contract.rows) && contract.rows.length >= 5, `${label} expected keyword highlight rows`);
  assert(contract.networkCalls.length === 0, `${label} expected keyword highlight UX to avoid network/send/analytics calls`);

  const byTerm = new Map(contract.rows.map((row) => [row.term, row]));
  for (const term of ["excel", "analytics"]) {
    const row = byTerm.get(term);
    assert(row?.highlightState === "matched", `${label} expected ${term} to render as matched`);
    assert(row.missingClassification === "not-applicable", `${label} expected matched ${term} not to request missing proof`);
    assert(row.proofItems.length === 0, `${label} expected matched ${term} to avoid missing-proof copy`);
  }

  for (const term of ["crm", "automation"]) {
    const row = byTerm.get(term);
    assert(row?.highlightState === "missing", `${label} expected ${term} to render as missing`);
    assert(row.missingClassification === "proof-needed", `${label} expected missing ${term} to classify as proof-needed`);
    assert(row.hasMissingProofCopy === true, `${label} expected proof-needed ${term} to preserve proof guidance`);
  }

  const notApplicable = byTerm.get("workflow automation") || byTerm.get("salesforce");
  assert(notApplicable?.highlightState === "missing", `${label} expected a non-proof keyword gap to stay visibly missing`);
  assert(notApplicable.missingClassification === "not-applicable", `${label} expected non-proof keyword gap to classify not-applicable`);
  assert(notApplicable.hasMissingProofCopy === false, `${label} expected not-applicable keyword gap to avoid proof guidance`);
}

function evaluateLocalApiContractFromHooks(hooks, networkCalls = []) {
  const contracts = hooks.targetJobLocalToolContracts();
  const fixture = targetJobLocalApiFixture();
  const extractLeadIntel = contracts.extract_lead_intel({ jobText: fixture.jobText });
  const evaluateLeadQuality = contracts.evaluate_lead_quality({ jobIntel: extractLeadIntel.jobIntel });
  const scoreJobFit = contracts.score_job_fit(fixture);
  return {
    hookContractsFormat: hooks.localToolContractsFormat,
    hookResultFormat: hooks.localToolResultFormat,
    contracts: {
      format: contracts.format,
      source: contracts.source,
      version: contracts.version,
      localOnly: contracts.localOnly,
      noExternalFetch: contracts.noExternalFetch,
      noAutoApply: contracts.noAutoApply,
      noOutboundSend: contracts.noOutboundSend,
      noUpload: contracts.noUpload,
      noAnalyticsSend: contracts.noAnalyticsSend,
      tools: contracts.tools,
    },
    results: { extractLeadIntel, evaluateLeadQuality, scoreJobFit },
    networkCalls,
  };
}

function evaluateKeywordHighlightUxContractFromHooks(hooks, networkCalls = []) {
  const contracts = hooks.targetJobLocalToolContracts();
  const fixture = targetJobKeywordHighlightUxFixture();
  const result = contracts.extract_keyword_highlights ? contracts.extract_keyword_highlights(fixture) : contracts.score_job_fit(fixture);
  return buildKeywordHighlightUxContract({ result, networkCalls, watchTerms: fixture.watchTerms });
}

function evaluateLlmEvaluatorOfflineFixtureFromHooks(hooks) {
  const contracts = hooks.targetJobLocalToolContracts();
  const fixture = targetJobLocalApiFixture();
  const score = contracts.score_job_fit(fixture);
  const packet = {
    format: "proofresume-target-job-application-pack-v1",
    generatedAt: "2026-05-17T00:00:00.000Z",
    jobIntel: score.jobIntel,
    leadQuality: score.leadQuality,
    fit: score.fit,
    resumeEvidenceSummary: score.resumeEvidenceSummary,
    tailoredBullets: [
      {
        draft: "Tailor existing customer operations evidence toward onboarding dashboard work.",
        sourceLine: "Built onboarding dashboards and improved support analytics by 32%.",
        approvalState: "unapproved",
      },
    ],
    coverNote: "Local fixture cover note.",
    outreachDraft: "Local fixture no-send draft.",
    nextReviewSteps: ["Verify proof gaps before use."],
  };
  return contracts.evaluate_optional_llm_offline_fixture
    ? contracts.evaluate_optional_llm_offline_fixture(packet)
    : hooks.buildLlmEvaluatorBoundary(packet);
}

function assertLlmEvaluatorOfflineFixture(contract, label) {
  assert(contract?.format === "proofresume-target-job-llm-evaluator-boundary-v1", `${label} expected LLM evaluator boundary format`);
  assert(contract.status === "disabled", `${label} expected LLM evaluator disabled status`);
  assert(contract.disabledByDefault === true, `${label} expected LLM evaluator disabled by default`);
  assert(contract.evaluatorMode === "offline-fixture-only", `${label} expected offline fixture evaluator mode`);
  assert(contract.noApiKeyCollection === true, `${label} expected no API key collection`);
  assert(contract.noExternalLlmCall === true, `${label} expected no external LLM call`);
  assertLocalContractBoundary(contract, `${label} LLM evaluator boundary`);
  assert(contract.confirmationRequiredBeforeRun === true, `${label} expected explicit confirmation before optional AI run`);
  assert(contract.optionalAiActionCanRun === false, `${label} expected optional AI action to remain non-runnable`);
  assert(contract.costTransparency?.format === "proofresume-target-job-ai-cost-transparency-v1", `${label} expected AI cost transparency format`);
  assert(contract.costTransparency?.disabledByDefault === true, `${label} expected AI cost gate disabled by default`);
  assert(contract.costTransparency?.confirmationRequired === true, `${label} expected AI cost confirmation requirement`);
  assert(contract.costTransparency?.businessControlsAllowExternalAi === false, `${label} expected business controls to block external AI by default`);
  assert(contract.costTransparency?.canRun === false, `${label} expected AI cost gate to block runs`);
  assert(Number(contract.costTransparency?.estimatedTokens?.input?.min) > 0, `${label} expected input token estimate`);
  assert(Number(contract.costTransparency?.estimatedTokens?.output?.max) > 0, `${label} expected output token estimate`);
  assert(Number(contract.costTransparency?.estimatedCostUsdRange?.max) >= Number(contract.costTransparency?.estimatedCostUsdRange?.min), `${label} expected cost range`);
  assert(Array.isArray(contract.costTransparency?.dataSentIfEnabled) && contract.costTransparency.dataSentIfEnabled.length >= 3, `${label} expected provider data disclosure`);
  assert(Array.isArray(contract.costTransparency?.dataStaysLocal) && contract.costTransparency.dataStaysLocal.length >= 3, `${label} expected local data disclosure`);
  assertLocalContractBoundary(contract.costTransparency, `${label} AI cost transparency`);
  assert(contract.promptContract?.format === "proofresume-target-job-llm-evaluator-prompt-contract-v1", `${label} expected prompt contract format`);
  assert(contract.promptContract?.noExternalLlmCall === true, `${label} expected prompt contract no external LLM call`);
  assert(contract.offlineFixture?.format === "proofresume-target-job-llm-evaluator-result-v1", `${label} expected offline result format`);
  assert(contract.offlineFixture?.enabled === false, `${label} expected offline result disabled`);
  assert(Array.isArray(contract.offlineFixture?.claimRisk), `${label} expected deterministic claim-risk rows`);
  assert(Array.isArray(contract.offlineFixture?.missingProofQuestions), `${label} expected missing proof questions`);
  assert(contract.offlineFixture?.noApiKeyCollection === true, `${label} expected fixture no API key collection`);
  assert(contract.offlineFixture?.noExternalLlmCall === true, `${label} expected fixture no external LLM call`);
}

function storageStub() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

function assertStaticTrackerBoardBehavior(js) {
  assert(
    js.includes("sortTrackerLeads(byStatus.get(status)") && js.includes("renderTrackerBoard(leads, filters)"),
    "Static fallback expected tracker board lanes to use shared tracker sorting"
  );
  assert(
    js.includes("sortTrackerLeads(\n    leads.filter") || js.includes("sortTrackerLeads(leads.filter"),
    "Static fallback expected tracker list to use shared tracker sorting"
  );

  const documentStub = {
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const context = {
    console,
    window: {},
    document: documentStub,
    localStorage: storageStub(),
    sessionStorage: storageStub(),
    confirm: () => true,
    Blob: function Blob() {},
    URL: { createObjectURL: () => "", revokeObjectURL: () => {} },
  };
  vm.runInNewContext(js, context, { filename: "target-job.js" });
  const hooks = context.window.__proofresumeTargetJobTestHooks || {};
  assert(typeof hooks.sortTrackerLeads === "function", "Static fallback expected target-job test hook sortTrackerLeads");
  assert(Array.isArray(hooks.leadStatuses) && hooks.leadStatuses.length === 9, "Static fallback expected 9 tracker statuses in test hook");
  assert(typeof hooks.targetJobLocalToolContracts === "function", "Static fallback expected target-job local tool contract hook");
  const localApiContract = evaluateLocalApiContractFromHooks(hooks);
  assertTargetJobLocalApiContractFixture(localApiContract, "Static fallback");
  const keywordHighlightUxContract = evaluateKeywordHighlightUxContractFromHooks(hooks);
  assertKeywordHighlightUxContract(keywordHighlightUxContract, "Static fallback");
  const autoApplyDryRunPlan = evaluateAutoApplyDryRunPlanFromHooks(hooks);
  assertAutoApplyDryRunPlanRuntimeContract(autoApplyDryRunPlan, "Static fallback");
  const llmEvaluatorFixture = evaluateLlmEvaluatorOfflineFixtureFromHooks(hooks);
  assertLlmEvaluatorOfflineFixture(llmEvaluatorFixture, "Static fallback");
  assert(hooks.workspaceArchiveFormat === "proofresume-target-job-workspace-archive-v1", "Static fallback expected workspace archive format hook");
  assert(typeof hooks.buildWorkspaceArchive === "function", "Static fallback expected buildWorkspaceArchive hook");
  assert(typeof hooks.previewWorkspaceArchiveImport === "function", "Static fallback expected previewWorkspaceArchiveImport hook");
  assert(typeof hooks.applyWorkspaceArchiveImport === "function", "Static fallback expected applyWorkspaceArchiveImport hook");
  const olderLead = {
    format: "proofresume-target-job-lead-v1",
    id: "lead-1",
    updatedAt: "2026-05-15T00:00:00.000Z",
    feedback: "bad-fit",
    feedbackNote: "Older local feedback",
  };
  const newerLead = {
    ...olderLead,
    updatedAt: "2026-05-16T00:00:00.000Z",
    feedback: "good-fit",
    feedbackNote: "Newer imported feedback",
  };
  const archivedPack = {
    format: "proofresume-target-job-application-pack-v1",
    generatedAt: "2026-05-16T00:00:00.000Z",
    sourceLeadId: "lead-1",
    assetMetadata: { format: "proofresume-target-job-asset-metadata-v1", generatedAt: "2026-05-16T00:00:00.000Z" },
    applicationAssets: [{ type: "tailored-resume", generatedAt: "2026-05-16T00:00:00.000Z" }],
  };
  context.localStorage.setItem("proofresume:targetJobLeads", JSON.stringify([olderLead]));
  const workspaceArchive = {
    format: "proofresume-target-job-workspace-archive-v1",
    exportedAt: "2026-05-16T01:00:00.000Z",
    localOnly: true,
    noExternalFetch: true,
    noAutoApply: true,
    noOutboundSend: true,
    noUpload: true,
    noAnalyticsSend: true,
    noServerStorage: true,
    workspace: {
      profile: null,
      leads: [newerLead, { format: "broken-row" }],
      packs: [archivedPack],
      learningSettings: { enabled: false, autoStatusFromFeedback: false },
      generatedAssetsMetadata: [{ sourceLeadId: "lead-1", assetMetadata: archivedPack.assetMetadata }],
    },
  };
  const workspacePreview = hooks.previewWorkspaceArchiveImport(workspaceArchive, "merge");
  assert(workspacePreview.format === "proofresume-target-job-workspace-import-preview-v1", "Static fallback expected workspace import preview format");
  assert(workspacePreview.mergeCount >= 1 || workspacePreview.replaceCount >= 1, "Static fallback expected workspace preview merge/replace counts");
  assert(workspacePreview.droppedInvalidRows === 1, "Static fallback expected droppedInvalidRows to count invalid archive rows");
  assert(workspacePreview.counts.generatedAssetsMetadata >= 1, "Static fallback expected generatedAssetsMetadata in archive preview");
  const beforeApplyLead = JSON.parse(context.localStorage.getItem("proofresume:targetJobLeads") || "[]")[0];
  assert(beforeApplyLead.feedback === "bad-fit", "Static fallback expected preview not to mutate storage before apply");
  const workspaceApplyResult = hooks.applyWorkspaceArchiveImport(workspaceArchive, "merge");
  assert(workspaceApplyResult.applied === true, "Static fallback expected workspace archive apply result");
  const afterApplyLead = JSON.parse(context.localStorage.getItem("proofresume:targetJobLeads") || "[]")[0];
  assert(afterApplyLead.feedback === "good-fit", "Static fallback expected newest updatedAt archive lead to win merge");
  const archivedWorkspaceExport = hooks.buildWorkspaceArchive();
  assert(archivedWorkspaceExport.format === "proofresume-target-job-workspace-archive-v1", "Static fallback expected workspace archive export format");
  assert(archivedWorkspaceExport.noServerStorage === true, "Static fallback expected workspace archive to avoid server storage");
  assert(archivedWorkspaceExport.counts.feedback >= 1, "Static fallback expected workspace archive to count feedback");
  assert(
    hooks.leadStatuses.join("|") === "discovered|evaluating|tailoring|ready|applied|interviewing|accepted|rejected|discarded",
    "Static fallback expected exact tracker status order in test hook"
  );

  const leads = [
    {
      id: "low",
      updatedAt: "2026-05-14T00:00:00Z",
      leadQuality: { score: 30 },
      jobIntel: { company: "Zulu" },
      liveFit: { score: 20, personalizedScore: 35 },
    },
    {
      id: "high",
      updatedAt: "2026-05-16T00:00:00Z",
      leadQuality: { score: 90 },
      jobIntel: { company: "Alpha" },
      liveFit: { score: 82, personalizedScore: 76 },
    },
  ];
  assert(hooks.sortTrackerLeads(leads, "fit")[0].id === "high", "Static fallback expected fit sort behavior");
  assert(hooks.sortTrackerLeads(leads, "quality")[0].id === "high", "Static fallback expected quality sort behavior");
  assert(hooks.sortTrackerLeads(leads, "recent")[0].id === "high", "Static fallback expected recent sort behavior");
  assert(hooks.sortTrackerLeads(leads, "company")[0].id === "high", "Static fallback expected company sort behavior");
  assert(hooks.sortTrackerLeads(leads, "learned")[0].id === "high", "Static fallback expected learned sort behavior");
  assert(leads[0].id === "low", "Static fallback expected tracker sorting not to mutate source leads");
}

function assertStaticWorkspaceArchiveBehavior(js) {
  const documentStub = {
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const context = {
    console,
    window: {},
    document: documentStub,
    localStorage: storageStub(),
    sessionStorage: storageStub(),
    confirm: () => true,
    Blob: function Blob() {},
    URL: { createObjectURL: () => "", revokeObjectURL: () => {} },
  };
  vm.runInNewContext(js, context, { filename: "target-job.js" });
  const hooks = context.window.__proofresumeTargetJobTestHooks || {};
  assert(hooks.workspaceArchiveFormat === "proofresume-target-job-workspace-archive-v1", "Static fallback expected workspace archive format hook");
  assert(typeof hooks.buildWorkspaceArchive === "function", "Static fallback expected buildWorkspaceArchive hook");
  assert(typeof hooks.previewWorkspaceArchiveImport === "function", "Static fallback expected previewWorkspaceArchiveImport hook");
  assert(typeof hooks.applyWorkspaceArchiveImport === "function", "Static fallback expected applyWorkspaceArchiveImport hook");

  const olderLead = {
    format: "proofresume-target-job-lead-v1",
    id: "lead-1",
    updatedAt: "2026-05-15T10:00:00.000Z",
    feedback: "bad-fit",
    feedbackNote: "Older local note",
    jobIntel: { title: "Old role", company: "ArchiveCo" },
  };
  const newerLead = {
    ...olderLead,
    updatedAt: "2026-05-16T10:00:00.000Z",
    feedback: "good-fit",
    feedbackNote: "Newer imported note",
    jobIntel: { title: "New role", company: "ArchiveCo" },
  };
  const oldPack = {
    format: "proofresume-target-job-application-pack-v1",
    generatedAt: "2026-05-15T10:00:00.000Z",
    sourceLeadId: "lead-1",
    assetMetadata: { format: "proofresume-target-job-asset-metadata-v1", type: "packet-bundle" },
    applicationAssets: [{ type: "tailored-resume", generatedAt: "2026-05-15T10:00:00.000Z", approvalState: "unapproved" }],
  };
  context.localStorage.setItem(
    "proofresume:targetJobProfile",
    JSON.stringify({
      format: "proofresume-target-job-profile-v2",
      savedAt: "2026-05-15T10:00:00.000Z",
      resumeText: "Archive QA resume",
      structuredProfile: { identity: { name: "Archive QA" }, skills: ["CRM"] },
      candidateLevel: "senior",
      preferredLocation: "Remote",
    })
  );
  context.localStorage.setItem("proofresume:targetJobLeads", JSON.stringify([olderLead]));
  context.localStorage.setItem("proofresume:targetJobPacks", JSON.stringify([oldPack]));
  context.localStorage.setItem("proofresume:targetJobLearningSettings", JSON.stringify({ enabled: true, autoStatusFromFeedback: true }));

  const archive = hooks.buildWorkspaceArchive();
  assert(archive.format === "proofresume-target-job-workspace-archive-v1", "Static fallback expected workspace archive v1 export");
  assert(archive.localOnly === true && archive.noExternalFetch === true && archive.noServerStorage === true, "Static fallback expected local-only workspace archive flags");
  assert(archive.workspace.profile.format === "proofresume-target-job-profile-v2", "Static fallback expected workspace archive profile");
  assert(archive.workspace.leads.length === 1, "Static fallback expected workspace archive leads");
  assert(archive.workspace.packs.length === 1, "Static fallback expected workspace archive packs");
  assert(archive.workspace.learningSettings.enabled === true, "Static fallback expected workspace archive learning settings");
  assert(archive.counts.feedback === 1, "Static fallback expected workspace archive feedback count");
  assert(archive.counts.generatedAssetsMetadata >= 1, "Static fallback expected workspace archive generated asset metadata");

  const importArchive = {
    ...archive,
    workspace: {
      ...archive.workspace,
      leads: [newerLead, { format: "bad-row", id: "" }],
      packs: [
        {
          ...oldPack,
          generatedAt: "2026-05-16T10:00:00.000Z",
          assetMetadata: { format: "proofresume-target-job-asset-metadata-v1", type: "packet-bundle", generatedAt: "2026-05-16T10:00:00.000Z" },
        },
      ],
    },
  };
  const preview = hooks.previewWorkspaceArchiveImport(importArchive, "merge");
  assert(preview.format === "proofresume-target-job-workspace-import-preview-v1", "Static fallback expected workspace archive preview format");
  assert(preview.valid === true, "Static fallback expected valid workspace archive preview");
  assert(/newest updatedAt/i.test(preview.message), "Static fallback expected newest updatedAt merge preview message");
  assert(preview.replaceCount >= 2, "Static fallback expected preview replace count for newer imported rows");
  assert(preview.droppedInvalidRows === 1, "Static fallback expected preview dropped invalid row count");
  assert(preview.counts.generatedAssetsMetadata >= 1, "Static fallback expected preview generated asset metadata count");

  const applied = hooks.applyWorkspaceArchiveImport(importArchive, "merge");
  assert(applied.applied === true, "Static fallback expected workspace archive import apply result");
  const mergedLead = JSON.parse(context.localStorage.getItem("proofresume:targetJobLeads") || "[]")[0] || {};
  assert(mergedLead.feedbackNote === "Newer imported note", "Static fallback expected newest updatedAt wins on archive lead merge");

  const olderImport = {
    ...archive,
    workspace: {
      ...archive.workspace,
      leads: [{ ...olderLead, updatedAt: "2026-05-14T10:00:00.000Z", feedbackNote: "Stale imported note" }],
      packs: [],
    },
  };
  const olderPreview = hooks.previewWorkspaceArchiveImport(olderImport, "merge");
  assert(olderPreview.keptCount >= 1, "Static fallback expected newer local rows to be kept during archive merge");
  hooks.applyWorkspaceArchiveImport(olderImport, "merge");
  const keptLead = JSON.parse(context.localStorage.getItem("proofresume:targetJobLeads") || "[]")[0] || {};
  assert(keptLead.feedbackNote === "Newer imported note", "Static fallback expected older archive rows not to replace newer local rows");
}

function assertStaticFitBreakdownV2Contract({ html, js, css }) {
  for (const token of [
    "data-target-job-fit-components",
    "target-job-fit-component-grid",
    "data-target-job-missing-proof-groups",
    "data-target-job-learning-overlay",
    "data-target-job-detail-fit-breakdown",
    "data-target-job-detail-missing-proof",
  ]) {
    assert(html.includes(token), `Static fallback missing fit-breakdown v2 HTML token: ${token}`);
  }

  for (const token of [
    "FIT_COMPONENTS",
    "fit.components",
    "fit.componentScores",
    "fit.missingProofGroups",
    "renderFitComponents",
    "renderFitComponentCards",
    "renderMissingProofGroups",
    "renderMissingProofGroupList",
    "componentEvidenceGroups",
    "data-target-job-fit-component",
    "target-job-fit-component-grid--compact",
    "Component spread",
    "Base score:",
    "matchedProof",
    "missingProof",
    "personalizedScore",
    "learningDelta",
  ]) {
    assert(js.includes(token), `Static fallback missing fit-breakdown v2 JS token: ${token}`);
  }

  for (const componentId of FIT_COMPONENT_IDS) {
    assert(js.includes(`id: "${componentId}"`), `Static fallback missing FIT_COMPONENTS id: ${componentId}`);
    assert(js.includes(`fitComponent("${componentId}"`), `Static fallback missing scoreFit component row: ${componentId}`);
  }

  assert(
    js.includes('componentEvidenceGroups(components, "missingProof")') && js.includes("missingProofGroup(component.id"),
    "Static fallback missing grouped component proof contract"
  );

  for (const token of [
    ".target-job-fit-component-grid",
    ".target-job-fit-component-grid--compact",
    ".target-job-fit-component",
    ".target-job-learning-panel",
    ".target-job-learning-grid",
    ".target-job-learning-card",
  ]) {
    assert(css.includes(token), `Static fallback missing fit-breakdown v2 CSS selector: ${token}`);
  }
}

function assertStaticAssetGeneratorV2Contract({ html, js }) {
  for (const token of [
    "data-target-job-resume-export",
    "data-target-job-cover-letter",
    "data-target-job-download-resume-md",
    "data-target-job-download-cover-letter-md",
    "data-target-job-download-application-bundle",
    "data-target-job-download-html",
    "data-target-job-print-view",
  ]) {
    assert(html.includes(token), `Static fallback missing asset-generator v2 HTML token: ${token}`);
  }

  for (const token of [
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
    "tailored-resume",
    "cover-letter",
    "packet-bundle",
    "printable-html",
    "Source-line caveats",
  ]) {
    assert(js.includes(token), `Static fallback missing asset-generator v2 JS token: ${token}`);
  }

  for (const token of ["downloadTextFile", "downloadJsonFile", "downloadPrintableHtml", "buildPrintableHtml", "new Blob", "URL.createObjectURL", "URL.revokeObjectURL"]) {
    assert(js.includes(token), `Static fallback missing asset-generator v2 local download token: ${token}`);
  }

  for (const forbidden of [/fetch\s*\(/i, /XMLHttpRequest/i, /navigator\.sendBeacon/i, /\bapply now\b/i, /\bstart applying\b/i, /upload\s+to/i]) {
    assert(!forbidden.test(js), `Static fallback found forbidden asset-generator network/apply/upload surface: ${forbidden}`);
  }
}

function assertFirstSessionPacketReplayHarness() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_session_packet_replay_harness.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-session-packet-replay-harness.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first session packet replay checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first session packet replay fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstAuditCommandRoom() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_audit_command_room.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-audit-command-room.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first audit command room checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first audit command room fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstAuditResultExportPacket() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_audit_result_export_packet.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-audit-result-export-packet.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first audit result export packet checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first audit result export packet fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstAuthorizedSessionRunner() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_authorized_session_runner.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-authorized-session-runner.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first authorized session runner checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first authorized session runner fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstSessionRepairRoom() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_session_repair_room.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-session-repair-room.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first session repair room checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first session repair room fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstSessionObjectionRepairWizard() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_session_objection_to_repair_wizard.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-session-objection-to-repair-wizard.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first-session objection repair wizard checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first-session objection repair wizard fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstCustomerConciergeDemoBundle() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_customer_concierge_demo_bundle.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-customer-concierge-demo-bundle.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first-customer concierge demo bundle checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first-customer concierge demo bundle fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstCustomerReactionRouteRecorder() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_customer_reaction_route_recorder.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-customer-reaction-route-recorder.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first-customer reaction route recorder checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first-customer reaction route recorder fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstCustomerEvidenceInboxRoom() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_customer_evidence_inbox_room.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-customer-evidence-inbox-room.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first-customer evidence inbox room checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first-customer evidence inbox room fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstCustomerEvidenceRouteScoreboard() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_customer_evidence_route_scoreboard.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-customer-evidence-route-scoreboard.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first-customer evidence route scoreboard checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first-customer evidence route scoreboard fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstCustomerEvidenceProofRepairPacket() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_customer_evidence_proof_repair_packet.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-customer-evidence-proof-repair-packet.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first-customer evidence proof-repair packet checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first-customer evidence proof-repair packet fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertRepairedProofToPaidAskRoom() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_repaired_proof_to_paid_ask_room.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "repaired-proof-to-paid-ask-room.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing repaired proof to paid ask room checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing repaired proof to paid ask room fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstCustomerPilotConsole() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_customer_pilot_console.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-customer-pilot-console.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first customer pilot console checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first customer pilot console fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstCustomerPilotRevenueSimulator() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_customer_pilot_revenue_simulator.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-customer-pilot-revenue-simulator.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first customer pilot revenue simulator checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first customer pilot revenue simulator fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstCustomerPilotWorkspaceWalkthrough() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_customer_pilot_workspace_walkthrough.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-customer-pilot-workspace-walkthrough.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first customer pilot workspace walkthrough checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first customer pilot workspace walkthrough fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertPaidPacketCustomerPreview() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_paid_packet_customer_preview.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "paid-packet-customer-preview.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing paid packet customer preview checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing paid packet customer preview fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertPaidAskOutcomeRouter() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_paid_ask_outcome_router.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "paid-ask-outcome-router.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing paid ask outcome router checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing paid ask outcome router fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertPaidAskProofPacketClarityRepair() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_paid_ask_proof_packet_clarity_repair.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "paid-ask-proof-packet-clarity-repair.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing paid ask proof packet clarity repair checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing paid ask proof packet clarity repair fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertPaidAskObjectionResponseSimulator() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_paid_ask_objection_response_simulator.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "paid-ask-objection-response-simulator.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing paid ask objection response simulator checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing paid ask objection response simulator fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstPaidPilotHandoffRoom() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_paid_pilot_handoff_room.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-paid-pilot-handoff-room.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first paid pilot handoff room checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first paid pilot handoff room fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstPaidPilotGateSimulator() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_paid_pilot_gate_simulator.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-paid-pilot-gate-simulator.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first paid pilot gate simulator checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first paid pilot gate simulator fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstDollarReadinessRoom() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_dollar_readiness_room.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-dollar-readiness-room.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first dollar readiness room checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first dollar readiness room fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstDollarOwnerEvidenceRepairRoom() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_dollar_owner_evidence_repair_room.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-dollar-owner-evidence-repair-room.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first dollar owner evidence repair room checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first dollar owner evidence repair room fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstPaidPilotFulfillmentReceiptPreview() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_paid_pilot_fulfillment_receipt_preview.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-paid-pilot-fulfillment-receipt-preview.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first paid pilot fulfillment receipt preview checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first paid pilot fulfillment receipt preview fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstLiveProofAuditCopilot() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_live_proof_audit_copilot.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-live-proof-audit-copilot.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first live proof-audit copilot checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first live proof-audit copilot fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertLiveToPaidPilotDecisionRoom() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_live_to_paid_pilot_decision_room.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "live-to-paid-pilot-decision-room.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing live-to-paid-pilot decision room checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing live-to-paid-pilot decision room fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertLiveProofTrustGapRepairRoom() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_live_proof_trust_gap_repair_room.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "live-proof-trust-gap-repair-room.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing live proof trust gap repair room checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing live proof trust gap repair room fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertLiveProofMissingProofCueRepair() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_live_proof_missing_proof_cue_repair.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "live-proof-missing-proof-cue-repair.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing live proof missing-proof cue repair checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing live proof missing-proof cue repair fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertPaidPilotTrustGapRepairLab() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_paid_pilot_trust_gap_repair_lab.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "paid-pilot-trust-gap-repair-lab.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing paid pilot trust gap repair lab checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing paid pilot trust gap repair lab fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertProofDeltaValueSnapshot() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_proof_delta_value_snapshot.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "proof-delta-value-snapshot.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing proof delta value snapshot checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing proof delta value snapshot fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertFirstSessionCustomerHandoffRoom() {
  const checkerPath = path.join(projectRoot, "ops", "product", "check_first_session_customer_handoff_room.cjs");
  const fixturePath = path.join(projectRoot, "ops", "product", "first-session-customer-handoff-room.sample.json");
  assert(fs.existsSync(checkerPath), "Static fallback missing first-session customer handoff room checker");
  assert(fs.existsSync(fixturePath), "Static fallback missing first-session customer handoff room fixture");
  execFileSync(process.execPath, [checkerPath, fixturePath], {
    cwd: projectRoot,
    stdio: "pipe",
  });
}

function assertPostPreviewDeterministicCoverageHarness() {
  assertFirstAuditCommandRoom();
  assertFirstAuditResultExportPacket();
  assertFirstAuthorizedSessionRunner();
  assertFirstSessionRepairRoom();
  assertFirstSessionPacketReplayHarness();
  assertFirstCustomerPilotConsole();
  assertFirstCustomerPilotRevenueSimulator();
  assertFirstCustomerPilotWorkspaceWalkthrough();
  assertPaidPacketCustomerPreview();
  assertPaidAskOutcomeRouter();
  assertPaidAskProofPacketClarityRepair();
  assertPaidAskObjectionResponseSimulator();
  assertFirstPaidPilotHandoffRoom();
  assertFirstPaidPilotGateSimulator();
  assertFirstDollarReadinessRoom();
  assertFirstDollarOwnerEvidenceRepairRoom();
  assertFirstPaidPilotFulfillmentReceiptPreview();
  assertFirstLiveProofAuditCopilot();
  assertLiveToPaidPilotDecisionRoom();
  assertLiveProofTrustGapRepairRoom();
  assertLiveProofMissingProofCueRepair();
  assertPaidPilotTrustGapRepairLab();
  assertProofDeltaValueSnapshot();
  assertFirstSessionCustomerHandoffRoom();
  assertFirstSessionObjectionRepairWizard();
  assertFirstCustomerConciergeDemoBundle();
  assertFirstCustomerReactionRouteRecorder();
  assertFirstCustomerEvidenceInboxRoom();
  assertFirstCustomerEvidenceRouteScoreboard();
  assertFirstCustomerEvidenceProofRepairPacket();
  assertRepairedProofToPaidAskRoom();
}

async function launchBrowser() {
  const launchers = [
    { name: "chrome-channel", fn: () => chromium.launch({ headless: true, channel: "chrome" }) },
    { name: "chromium-channel", fn: () => chromium.launch({ headless: true, channel: "chromium" }) },
    { name: "chromium", fn: () => chromium.launch({ headless: true }) },
    { name: "firefox", fn: () => firefox.launch({ headless: true }) },
    { name: "webkit", fn: () => webkit.launch({ headless: true }) },
  ];

  const errors = [];
  for (const launcher of launchers) {
    try {
      return { browser: await launcher.fn(), engine: launcher.name };
    } catch (error) {
      errors.push(`[${launcher.name}] ${error?.message || error}`);
    }
  }

  throw new Error(`qa-target-job-pack failed to launch any browser engine:\n${errors.join("\n")}`);
}

function runStaticFallback(error) {
  const html = fs.readFileSync(targetJobHtmlPath, "utf8");
  const js = fs.readFileSync(targetJobJsPath, "utf8");
  const css = fs.readFileSync(stylesPath, "utf8");

		  for (const token of [
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
		    "data-target-job-profile-status",
	    "data-target-job-import-resume-file",
	    "data-target-job-import-resume-file-input",
	    "data-target-job-save-profile",
	    "data-target-job-export-profile",
	    "data-target-job-import-profile",
	    "data-target-job-import-profile-input",
	    "data-target-job-import-export-bundle",
	    "data-target-job-import-export-bundle-input",
	    "data-target-job-clear-profile",
	    "data-target-job-import-job-file",
	    "data-target-job-import-job-file-input",
	    "data-target-job-import-form",
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
	    'data-target-job-board-column="discovered"',
	    'data-target-job-board-column="evaluating"',
	    'data-target-job-board-column="tailoring"',
	    'data-target-job-board-column="ready"',
	    'data-target-job-board-column="applied"',
	    'data-target-job-board-column="interviewing"',
	    'data-target-job-board-column="accepted"',
	    'data-target-job-board-column="rejected"',
	    'data-target-job-board-column="discarded"',
	    "data-target-job-sort",
	    "Learned fit",
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
	    "HN",
	    "RSS",
	    "CSV",
	    "data-target-job-analyze",
	    "data-target-job-lead-list",
	    "data-target-job-bulk-feedback",
	    "data-target-job-apply-bulk-feedback",
	    "data-target-job-learning-panel",
	    "data-target-job-learning-enabled",
		    "data-target-job-learning-status-sync",
		    "data-target-job-reset-learning",
		    "data-target-job-learning-insights",
		    "data-target-job-resume-export",
		    "data-target-job-cover-letter",
		    "data-target-job-download-resume-md",
		    "data-target-job-download-cover-letter-md",
		    "data-target-job-download-application-bundle",
		    "Import ProofResume bundle .json",
		  ]) {
		    assert(html.includes(token), `Static fallback missing required target-job.html token: ${token}`);
		  }

		  for (const token of [
		    "proofresume-target-job-learning-v1",
		    "proofresume-target-job-application-bundle-v1",
		    "proofresume-target-job-asset-generator-v2",
		    "proofresume-target-job-asset-metadata-v1",
		    "proofresume-target-job-profile-v1",
	    "proofresume-target-job-profile-v2",
	    "structuredProfileFromForm",
	    "normalizeStructuredProfile",
	    "structuredProfileToEvidenceText",
	    "structuredProfileSummary",
		    "proofresume:targetJobProfile",
		    "proofresume:targetJobLearningSettings",
	    "sourceExportBundle",
	    "proofresume-local-section-v1",
	    "exportBundleSnapshot",
	    "resumeTextFromExportBundle",
	    "buildLearningProfile",
	    "applyLearningToFit",
	    "withLearning",
			    "jobTextFromHtml",
	    "SOURCE_ADAPTERS",
	    "sourceMetadata",
	    "renderImportDiagnostics",
	    "renderImportPhaseReport",
	    "buildImportPhaseReport",
	    "renderTrackerBoard",
	    "renderLeadDetail",
	    "openLeadDetail",
	    "sortTrackerLeads",
	    "selectedTrackerLeadId",
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
	    "proofresume-source-adapter-import-v1",
	    "proofresume-source-adapter-diagnostics-v1",
	    "proofresume-target-job-import-phase-report-v1",
	    "proofresume-import-phase-counts-v1",
	    "generic-paste",
	    "greenhouse",
	    "lever",
	    "ashby",
	    "workable",
	    "hn-community",
	    "rss-like",
	    "csv-json",
	    "sourceKind",
	    "selectedPlatform",
	    "originalIndex",
	    "importedAt",
	    "postedDate",
	    "description",
	    "rawSourceLength",
	    "localOnly",
	    "noExternalFetch",
	    "noAutoApply",
	    "noOutboundSend",
	    "missingUrl",
	    "missingCompany",
	    "duplicate",
	    "stale",
	    "phaseCounts",
	    "qualityAccepted",
	    "qualityRejected",
	    "rejectedDetails",
		    "buildResumeAddendumMarkdown",
		    "buildCoverLetterMarkdown",
		    "buildTailoredResumeMarkdown",
		    "buildFullCoverLetterMarkdown",
		    "applicationAssets",
		    "assetMetadata",
		    "buildApplicationAssets",
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
	    "buildApplicationBundle",
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
	    "renderLearningPanel",
		    "resetLearningFeedback",
		    "suggestedStatusFromFeedback",
		    "target-job-learning-delta",
		    "target-job-learning-note",
		  ]) {
		    assert(js.includes(token), `Static fallback missing required target-job.js token: ${token}`);
		  }

  for (const forbidden of [/fetch\s*\(/i, /XMLHttpRequest/i, /navigator\.sendBeacon/i, /\bsend now\b/i, /\bstart applying\b/i]) {
    assert(!forbidden.test(js), `Static fallback found forbidden network/send surface in target-job.js: ${forbidden}`);
  }
  assert(
    js.includes("normalizeLeadImportSource") || js.includes("leadEntriesFromAdapter"),
    "Static fallback missing target-job.js source-adapter normalization entrypoint"
  );
  assert(
    js.includes('LEAD_STATUSES = ["discovered", "evaluating", "tailoring", "ready", "applied", "interviewing", "accepted", "rejected", "discarded"]'),
    "Static fallback missing exact tracker board status order"
  );
  assertStaticTrackerBoardBehavior(js);
  assertStaticWorkspaceArchiveBehavior(js);
  assertStaticFitBreakdownV2Contract({ html, js, css });
  assertStaticAssetGeneratorV2Contract({ html, js });
  assertPostPreviewDeterministicCoverageHarness();
  assertSourcingConnectorContract(
    buildSourcingConnectorContract({
      sourcePolicyUi: {
        adapterCopy: "Local import only",
        cards: [
          { kind: "official", text: "Official APIs, RSS, and exports" },
          { kind: "public", text: "Permitted public scraping" },
          { kind: "credentialed", text: "Credentialed sources" },
          { kind: "forbidden", text: "Blocked sources and actions" },
        ],
        diagnostics: {
          source: "Not checked",
          freshness: "Not checked",
          termsRisk: "Review needed",
        },
      },
      lead: {
        sourceMetadata: {
          format: "proofresume-source-adapter-import-v1",
          adapter: "generic-paste",
          sourceKind: "text",
          platform: "Company or custom source",
          url: "https://example.com/jobs/local-source",
          postedDate: "2026-05-01",
          importedAt: new Date().toISOString(),
          duplicate: false,
          localOnly: true,
          noExternalFetch: true,
        },
      },
      diagnostics: {
        format: "proofresume-source-adapter-diagnostics-v1",
        accepted: 1,
        rejected: 0,
        duplicate: 0,
        missingUrl: 0,
        missingCompany: 0,
        stale: 0,
      },
    }),
    "Static fallback"
  );
  assertAutoApplyControlsContract(buildAutoApplyControlsContract(), "Static fallback");

  for (const token of [
    ".target-job-learning-delta",
    ".target-job-learning-note",
    ".target-job-learning-panel",
    ".target-job-tracker-layout",
    "overflow-wrap: anywhere",
    ".muted",
  ]) {
    assert(css.includes(token), `Static fallback missing required styles.css selector: ${token}`);
  }

  console.warn("qa-target-job-pack fell back to static checks (Playwright browsers unavailable).");
  if (error) console.warn(String(error?.message || error));
  console.log("qa-target-job-pack static fallback passed");
}

async function main() {
  let launched = null;
  try {
    launched = await launchBrowser();
  } catch (error) {
    runStaticFallback(error);
    return;
  }

  const { browser, engine } = launched;
  const page = await browser.newPage();

  try {
    await page.addInitScript(() => {
      window.__proofresumeNetworkCalls = [];
      const record = (type, detail) => {
        window.__proofresumeNetworkCalls.push({ type, detail: String(detail || ""), at: Date.now() });
      };
      window.fetch = (...args) => {
        record("fetch", args[0]);
        return Promise.reject(new Error("ProofResume QA forbids network fetches in Target Job Pack"));
      };
      window.XMLHttpRequest = function XMLHttpRequestBlocked() {
        record("XMLHttpRequest", "constructed");
        throw new Error("ProofResume QA forbids XMLHttpRequest in Target Job Pack");
      };
      if (navigator && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon = (...args) => {
          record("sendBeacon", args[0]);
          return false;
        };
      }
    });

    await page.setContent(inlineTargetJobFixture(), { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.removeItem("proofresume:targetJobLeads");
      localStorage.removeItem("proofresume:targetJobPacks");
      localStorage.removeItem("proofresume:targetJobProfile");
      localStorage.removeItem("proofresume:targetJobLearningSettings");
      sessionStorage.removeItem("proofresume:targetJobTrackerFilters");
    });

    await page.setContent(inlineTargetJobFixture(), { waitUntil: "domcontentloaded" });

    const localApiContract = await page.evaluate((fixture) => {
      const hooks = window.__proofresumeTargetJobTestHooks || {};
      if (typeof hooks.targetJobLocalToolContracts !== "function") {
        return { missingHook: true, networkCalls: window.__proofresumeNetworkCalls || [] };
      }
      const contracts = hooks.targetJobLocalToolContracts();
      const extractLeadIntel = contracts.extract_lead_intel({ jobText: fixture.jobText });
      const evaluateLeadQuality = contracts.evaluate_lead_quality({ jobIntel: extractLeadIntel.jobIntel });
      const scoreJobFit = contracts.score_job_fit(fixture);
      return {
        hookContractsFormat: hooks.localToolContractsFormat,
        hookResultFormat: hooks.localToolResultFormat,
        contracts: {
          format: contracts.format,
          source: contracts.source,
          version: contracts.version,
          localOnly: contracts.localOnly,
          noExternalFetch: contracts.noExternalFetch,
          noAutoApply: contracts.noAutoApply,
          noOutboundSend: contracts.noOutboundSend,
          noUpload: contracts.noUpload,
          noAnalyticsSend: contracts.noAnalyticsSend,
          tools: contracts.tools,
        },
        results: { extractLeadIntel, evaluateLeadQuality, scoreJobFit },
        networkCalls: window.__proofresumeNetworkCalls || [],
      };
    }, targetJobLocalApiFixture());
    assert(!localApiContract.missingHook, "expected browser QA to expose target-job local tool contract hook");
    assertTargetJobLocalApiContractFixture(localApiContract, "browser QA");
    assertAutoApplyControlsContract(
      buildAutoApplyControlsContract({ networkCalls: localApiContract.networkCalls || [] }),
      "browser QA"
    );
    const autoApplyDryRunPlan = await page.evaluate((fixture) => {
      const hooks = window.__proofresumeTargetJobTestHooks || {};
      if (typeof hooks.buildAutoApplyDryRunPlanContract !== "function") {
        return { missingHook: true };
      }
      return hooks.buildAutoApplyDryRunPlanContract(fixture);
    }, targetJobAutoApplyDryRunFixture());
    assert(!autoApplyDryRunPlan.missingHook, "expected browser QA to expose auto-apply dry-run plan hook");
    assertAutoApplyDryRunPlanRuntimeContract(autoApplyDryRunPlan, "browser QA");

    const resume = [
      "Maya Patel",
      "Customer Operations Lead",
      "Experience",
      "- Built a customer onboarding dashboard that reduced repeat intake questions by 32% across 6 pilot accounts.",
      "- Improved handoff documentation and cut first-response delays from 2 days to 8 hours.",
      "Skills",
      "HubSpot, Excel, support analytics, stakeholder communication",
    ].join("\n");

    const brightLedgerA = [
      "Customer Operations Manager - Remote",
      "Company: BrightLedger",
      "Apply: https://example.com/jobs/customer-operations-manager",
      "Responsibilities: build onboarding dashboards, improve support workflows, CRM reporting.",
      "Requirements: HubSpot, Excel, analytics, stakeholder communication.",
    ].join("\n");

    const spammyCoin = [
      "Inside Sales Representative",
      "Company: SpammyCoin",
      "Apply: https://example.com/jobs/sales",
      "Responsibilities: outreach, commission-only, telegram.",
      "Requirements: sales, hustle.",
    ].join("\n");

    const brightLedgerB = [
      "Customer Operations Analyst - Remote",
      "Company: BrightLedger",
      "Apply: https://example.com/jobs/customer-ops-analyst",
      "Responsibilities: reporting, dashboards, support analytics.",
      "Requirements: Excel, analytics, CRM.",
    ].join("\n");

    const brightLedgerRawHtml = [
      "<!doctype html>",
      "<html>",
      "<head>",
      '<title>Customer Operations Analyst - Remote</title>',
      '<meta property="og:url" content="https://example.com/jobs/customer-ops-analyst" />',
      "</head>",
      "<body>",
      "<main>",
      "<h1>Customer Operations Analyst - Remote</h1>",
      `<p>${brightLedgerB}</p>`,
      "</main>",
      "</body>",
      "</html>",
    ].join("\n");

    const resumeFixturePath = path.join(os.tmpdir(), `proofresume-qa-resume-${Date.now()}.txt`);
    fs.writeFileSync(resumeFixturePath, resume);
    await page.setInputFiles("[data-target-job-import-resume-file-input]", resumeFixturePath);
    await page.selectOption("[data-target-job-candidate-level]", "senior");
    await page.fill("[data-target-job-location]", "Remote");

    await page.click("[data-target-job-structured-profile] > summary");
    await page.fill("[data-target-job-profile-full-name]", "Maya Patel");
    await page.fill("[data-target-job-profile-headline]", "Customer Operations Lead");
    await page.fill("[data-target-job-profile-skills]", "CRM\nworkflow automation\nimplementation");
    await page.click("[data-target-job-add-project]");
    await page.fill('[data-target-job-project-list] [data-target-job-structured-item="project"] [data-field="name"]', "CRM workflow automation");
    await page.fill(
      '[data-target-job-project-list] [data-target-job-structured-item="project"] [data-field="highlights"]',
      "Built a handoff project that improved implementation quality across pilot accounts."
    );
    await page.click("[data-target-job-add-achievement]");
    await page.fill(
      '[data-target-job-achievement-list] [data-target-job-structured-item="achievement"] [data-field="title"]',
      "Reduced repeat intake questions"
    );
    await page.fill(
      '[data-target-job-achievement-list] [data-target-job-structured-item="achievement"] [data-field="detail"]',
      "Improved implementation quality across 6 pilot accounts."
    );
    await page.click("[data-target-job-save-profile]");
    const profileStatus = await page.locator("[data-target-job-profile-status]").textContent();
    assert(/saved/i.test(String(profileStatus || "")), "expected profile save status pill to confirm saved profile");
    const savedProfileContract = await page.evaluate(() => {
      const profile = JSON.parse(localStorage.getItem("proofresume:targetJobProfile") || "{}");
      return {
        format: profile.format,
        name: profile.structuredProfile?.identity?.name,
        skills: profile.structuredProfile?.skills || [],
        projects: profile.structuredProfile?.projects || [],
      };
    });
    assert(savedProfileContract.format === "proofresume-target-job-profile-v2", "expected saved profile to use v2 format");
    assert(savedProfileContract.name === "Maya Patel", "expected v2 profile export to preserve identity");
    assert(savedProfileContract.skills.includes("CRM"), "expected v2 profile export to preserve structured skills");
    assert(savedProfileContract.projects.length === 1, "expected v2 profile export to preserve structured projects");

    await page.setContent(inlineTargetJobFixture(), { waitUntil: "domcontentloaded" });
    const loadedResume = await page.locator("[data-target-job-resume]").inputValue();
    assert(loadedResume.includes("Maya Patel"), "expected saved profile to rehydrate resume text after reload");
    await page.click("[data-target-job-structured-profile] > summary");
    const loadedProfileName = await page.locator("[data-target-job-profile-full-name]").inputValue();
    assert(loadedProfileName === "Maya Patel", "expected saved profile to rehydrate structured identity after reload");
    const loadedProfileSkills = await page.locator("[data-target-job-profile-skills]").inputValue();
    assert(/workflow automation/i.test(loadedProfileSkills), "expected saved profile to rehydrate structured skills after reload");
    const loadedLevel = await page.locator("[data-target-job-candidate-level]").inputValue();
    assert(loadedLevel === "senior", "expected saved profile to rehydrate candidate level after reload");
    const loadedLocation = await page.locator("[data-target-job-location]").inputValue();
    assert(String(loadedLocation || "").toLowerCase().includes("remote"), "expected saved profile to rehydrate preferred location after reload");

    const exportBundleFixturePath = path.join(os.tmpdir(), `proofresume-qa-bundle-${Date.now()}.json`);
    fs.writeFileSync(
      exportBundleFixturePath,
      JSON.stringify(
        {
          format: "proofresume-local-section-v1",
          intakeId: "qa-bundle",
          updatedAt: new Date().toISOString(),
          sectionText: ["Experience", "- Shipped local-only job-target packs with deterministic QA gates.", "- Imported proof bundles into profile snapshots."].join(
            "\n"
          ),
          proofPacketSnapshot: { format: "proofresume-local-proof-packet-snapshot-v1", localOnly: true, packet: { sections: [] } },
        },
        null,
        2
      )
    );
    await page.setInputFiles("[data-target-job-import-export-bundle-input]", exportBundleFixturePath);
    const bundleResume = await page.locator("[data-target-job-resume]").inputValue();
    assert(
      bundleResume.includes("Imported proof bundles into profile snapshots"),
      "expected export bundle import to populate resume text"
    );
    const bundleStatus = await page.locator("[data-target-job-profile-status]").textContent();
    assert(/bundle imported/i.test(String(bundleStatus || "")), "expected export bundle import to confirm saved status pill");

    await page.setContent(inlineTargetJobFixture(), { waitUntil: "domcontentloaded" });
    const bundleReloadResume = await page.locator("[data-target-job-resume]").inputValue();
    assert(
      bundleReloadResume.includes("Imported proof bundles into profile snapshots"),
      "expected export bundle import to persist via saved profile after reload"
    );

    const adapterSelect = page.locator("[data-target-job-source-adapter]");
    assert((await adapterSelect.count()) === 1, "expected local source-adapter selector to be present");
    const greenhouseAdapterValue = await adapterSelect.evaluate((select) => {
      const options = Array.from(select.options || []);
      return (options.find((option) => /greenhouse/i.test(option.textContent || "") || /greenhouse/i.test(option.value || "")) || {}).value || "";
    });
    assert(greenhouseAdapterValue, "expected Greenhouse source adapter option");
    const networkCallsBeforeAdapterGuardReset = await page.evaluate(() => window.__proofresumeNetworkCalls || []);
    assert(networkCallsBeforeAdapterGuardReset.length === 0, "expected initial profile/import flows to avoid network/send calls");

    const networkGuard = await page.evaluate(() => {
      window.__proofresumeNetworkCalls = [];
      const record = (type, detail) => {
        window.__proofresumeNetworkCalls.push({ type, detail: String(detail || ""), at: Date.now() });
      };
      window.fetch = (...args) => {
        record("fetch", args[0]);
        return Promise.reject(new Error("ProofResume QA forbids network fetches in Target Job Pack"));
      };
      window.XMLHttpRequest = function XMLHttpRequestBlocked() {
        record("XMLHttpRequest", "constructed");
        throw new Error("ProofResume QA forbids XMLHttpRequest in Target Job Pack");
      };
      if (navigator && typeof navigator.sendBeacon === "function") {
        navigator.sendBeacon = (...args) => {
          record("sendBeacon", args[0]);
          return false;
        };
      }
      return true;
    });
    assert(networkGuard === true, "expected QA network guard to install");

    const sourcePolicyUiContract = await page.evaluate(() => ({
      adapterCopy: (document.querySelector("[data-target-job-source-adapter-copy]") || {}).textContent || "",
      cards: Array.from(document.querySelectorAll("[data-source-policy]")).map((card) => ({
        kind: card.getAttribute("data-source-policy") || "",
        text: card.textContent || "",
      })),
      diagnostics: {
        source: (document.querySelector("[data-target-job-source-diagnostic]") || {}).textContent || "",
        freshness: (document.querySelector("[data-target-job-freshness-diagnostic]") || {}).textContent || "",
        termsRisk: (document.querySelector("[data-target-job-terms-risk-diagnostic]") || {}).textContent || "",
      },
    }));

    const longDescription = [
      "Responsibilities: build onboarding dashboards, improve support workflows, document handoffs, and partner with customer success.",
      "Requirements: CRM, Excel, analytics, stakeholder communication, implementation quality, workflow automation, and remote collaboration.",
      "The role owns weekly launch reviews, cleans up messy intake notes, keeps customers informed, and improves reporting for leadership."
    ].join(" ");
    const adapterFixtures = [
      {
        id: "generic-paste",
        platform: "Company or custom source",
        input: [
          "Customer Operations Specialist",
          "Company: ManualWorks",
          "Apply: https://example.com/manual-works/customer-operations-specialist",
          "Posted: 2026-05-01",
          "Location: Remote",
          longDescription,
        ].join("\n"),
      },
      {
        id: "greenhouse",
        platform: "Greenhouse",
        input: [
          "Implementation Operations Manager",
          "Company: GreenOps",
          "Apply: https://boards.greenhouse.io/greenops/jobs/123",
          "Posted: 2026-05-02",
          "Location: Remote",
          longDescription,
        ].join("\n"),
      },
      {
        id: "lever",
        platform: "Lever",
        input: [
          "Customer Launch Analyst",
          "Company: LeverWorks",
          "Apply: https://jobs.lever.co/leverworks/abc",
          "Posted: 2026-05-03",
          "Location: New York or Remote",
          longDescription,
        ].join("\n"),
      },
      {
        id: "ashby",
        platform: "Ashby",
        input: [
          "Support Analytics Lead",
          "Company: AshbyOps",
          "Apply: https://jobs.ashbyhq.com/ashbyops/role-1",
          "Posted: 2026-05-04",
          "Location: Remote US",
          longDescription,
        ].join("\n"),
      },
      {
        id: "workable",
        platform: "Workable",
        input: [
          "Customer Operations Lead",
          "Company: WorkableOps",
          "Apply: https://apply.workable.com/workableops/j/123",
          "Posted: 2026-05-05",
          "Location: Hybrid",
          longDescription,
        ].join("\n"),
      },
      {
        id: "hn-community",
        platform: "HN / community",
        input: [
          "HN Who is Hiring: CommunityOps is hiring a Customer Operations Manager",
          "Company: CommunityOps",
          "Apply: https://news.ycombinator.com/item?id=123456",
          "Posted: 2026-05-06",
          "Location: Remote",
          longDescription,
        ].join("\n"),
      },
      {
        id: "rss-like",
        platform: "RSS / feed",
        input: [
          '<?xml version="1.0"?>',
          "<rss><channel><item>",
          "<title>CRM Operations Manager</title>",
          "<company>FeedWorks</company>",
          "<link>https://example.com/feedworks/crm-operations-manager</link>",
          "<pubDate>2026-05-07</pubDate>",
          `<description>Company: FeedWorks Location: Remote ${longDescription}</description>`,
          "</item></channel></rss>",
        ].join("\n"),
      },
      {
        id: "csv-json",
        platform: "CSV / JSON import",
        input: JSON.stringify([
          {
            title: "Workflow Automation Manager",
            company: "StructuredOps",
            applyUrl: "https://example.com/structuredops/workflow-automation-manager",
            postedDate: "2026-05-08",
            location: "Remote",
            skills: ["CRM", "Excel", "analytics", "workflow automation"],
            description: longDescription,
          },
        ]),
      },
    ];

    for (const fixture of adapterFixtures) {
      await page.evaluate(() => {
        localStorage.setItem("proofresume:targetJobLeads", "[]");
      });
      await page.selectOption("[data-target-job-source-adapter]", fixture.id);
      await page.selectOption("[data-target-job-split-mode]", "separator");
      await page.fill("[data-target-job-source-label]", `QA ${fixture.id}`);
      await page.fill("[data-target-job-lead-batch]", fixture.input);
      await page.click("[data-target-job-import-leads]");

      const diagnosticsText = await page.locator("[data-target-job-import-diagnostics]").textContent();
      assertDiagnosticCount(diagnosticsText, "Accepted", 1);
      assertDiagnosticCount(diagnosticsText, "Rejected", 0);
      assertDiagnosticCount(diagnosticsText, "Duplicate", 0);
      assertDiagnosticCount(diagnosticsText, "Missing URL", 0);
      assertDiagnosticCount(diagnosticsText, "Missing company", 0);

      const leadContract = await page.evaluate(() => {
        const leads = JSON.parse(localStorage.getItem("proofresume:targetJobLeads") || "[]");
        const lead = leads[0] || {};
        return {
          count: leads.length,
          lead,
          metadata: lead.sourceMetadata || {},
          diagnostics: typeof importDiagnostics === "function" ? importDiagnostics([lead], []) : {},
          networkCalls: window.__proofresumeNetworkCalls || [],
        };
      });
      assert(leadContract.count === 1, `expected one saved lead for adapter ${fixture.id}`);
      assert(leadContract.metadata.format === "proofresume-source-adapter-import-v1", `expected metadata format for ${fixture.id}`);
      assert(leadContract.metadata.adapter === fixture.id, `expected metadata adapter id for ${fixture.id}`);
      assert(leadContract.metadata.adapterLabel, `expected metadata adapter label for ${fixture.id}`);
      assert(leadContract.metadata.sourceKind, `expected metadata source kind for ${fixture.id}`);
      assert(leadContract.metadata.selectedPlatform !== undefined, `expected metadata selected platform for ${fixture.id}`);
      assert(String(leadContract.metadata.platform || "").includes(fixture.platform), `expected platform ${fixture.platform} for ${fixture.id}`);
      assert(leadContract.metadata.originalIndex === 0, `expected original index for ${fixture.id}`);
      assert(/\d{4}-\d{2}-\d{2}T/.test(String(leadContract.metadata.importedAt || "")), `expected importedAt timestamp for ${fixture.id}`);
      assert(leadContract.metadata.company, `expected normalized company for ${fixture.id}`);
      assert(leadContract.metadata.url, `expected normalized URL for ${fixture.id}`);
      assert(leadContract.metadata.postedDate, `expected normalized posted date for ${fixture.id}`);
      assert(leadContract.metadata.location, `expected normalized location for ${fixture.id}`);
      assert(Array.isArray(leadContract.metadata.stack), `expected normalized stack array for ${fixture.id}`);
      assert(Number(leadContract.metadata.rawSourceLength || 0) > 80, `expected raw source length for ${fixture.id}`);
      assert(leadContract.metadata.localOnly === true, `expected metadata localOnly for ${fixture.id}`);
      assert(leadContract.metadata.noExternalFetch === true, `expected metadata noExternalFetch for ${fixture.id}`);
      assert(leadContract.lead.localOnly === true, `expected lead localOnly for ${fixture.id}`);
      assert(leadContract.lead.noExternalFetch === true, `expected lead noExternalFetch for ${fixture.id}`);
      assert(leadContract.lead.noAutoApply === true, `expected lead noAutoApply for ${fixture.id}`);
      assert(leadContract.lead.noOutboundSend === true, `expected lead noOutboundSend for ${fixture.id}`);
      assert(leadContract.networkCalls.length === 0, `expected no network/send calls for adapter ${fixture.id}`);
      assertSourcingConnectorContract(
        buildSourcingConnectorContract({
          sourcePolicyUi: sourcePolicyUiContract,
          lead: leadContract.lead,
          diagnostics: leadContract.diagnostics,
          networkCalls: leadContract.networkCalls,
        }),
        `Browser QA ${fixture.id}`
      );
    }

    const staleMissingLead = [
      "Operations Generalist",
      "Posted: 2025-01-01",
      "Responsibilities: CRM cleanup, analytics reporting, customer onboarding, workflow documentation, and implementation support.",
      "Requirements: Excel, CRM, stakeholder communication, support analytics, remote collaboration, and process improvement.",
      "This intentionally omits company and apply URL so diagnostics can count missing local-source fields.",
    ].join("\n");
    await page.evaluate(() => {
      localStorage.setItem("proofresume:targetJobLeads", "[]");
    });
    await page.selectOption("[data-target-job-source-adapter]", "generic-paste");
    await page.selectOption("[data-target-job-split-mode]", "separator");
    await page.fill("[data-target-job-source-label]", "QA diagnostics");
    await page.fill("[data-target-job-lead-batch]", [adapterFixtures[0].input, "---", adapterFixtures[0].input, "---", staleMissingLead].join("\n"));
    await page.click("[data-target-job-import-leads]");
    const diagnosticsText = await page.locator("[data-target-job-import-diagnostics]").textContent();
    assertDiagnosticCount(diagnosticsText, "Accepted", 2);
    assertDiagnosticCount(diagnosticsText, "Rejected", 1);
    assertDiagnosticCount(diagnosticsText, "Duplicate", 1);
    assertDiagnosticCount(diagnosticsText, "Missing URL", 1);
    assertDiagnosticCount(diagnosticsText, "Missing company", 1);
    assertDiagnosticCount(diagnosticsText, "Stale", 1);

    const networkCallsAfterDiagnostics = await page.evaluate(() => window.__proofresumeNetworkCalls || []);
    assert(networkCallsAfterDiagnostics.length === 0, "expected diagnostics import to avoid network/send calls");

    await page.evaluate(() => {
      localStorage.setItem("proofresume:targetJobLeads", "[]");
    });
    await page.selectOption("[data-target-job-source-adapter]", greenhouseAdapterValue);
    await page.selectOption("[data-target-job-split-mode]", "separator");
    await page.fill("[data-target-job-source-label]", "QA batch");
    await page.fill("[data-target-job-lead-batch]", [brightLedgerA, "---", spammyCoin, "---", brightLedgerB].join("\n"));
    await page.click("[data-target-job-import-leads]");
    const importDiagnostics = await page.locator("[data-target-job-import-diagnostics]").textContent();
    assert(/accepted/i.test(String(importDiagnostics || "")), "expected import diagnostics to show accepted count");

    await page.waitForSelector("[data-target-job-lead-list] [data-target-job-lead-id]");
    const cards = page.locator("[data-target-job-lead-list] [data-target-job-lead-id]");
    assert((await cards.count()) === 3, "expected 3 imported leads in tracker");
    const boardColumns = page.locator("[data-target-job-board] [data-target-job-board-column]");
    assert((await boardColumns.count()) === 9, "expected tracker board to render 9 status columns");
    for (const status of ["discovered", "evaluating", "tailoring", "ready", "applied", "interviewing", "accepted", "rejected", "discarded"]) {
      assert(
        (await page.locator(`[data-target-job-board] [data-target-job-board-column="${status}"]`).count()) === 1,
        `expected tracker board column for ${status}`
      );
    }
    const firstBoardCard = page.locator("[data-target-job-board] [data-target-job-open-detail]").first();
    const detailLeadId = await firstBoardCard.getAttribute("data-target-job-open-detail");
    assert(detailLeadId, "expected board detail opener to expose selected lead id");
    await firstBoardCard.click();
    await page.waitForSelector("[data-target-job-lead-detail]:not([hidden])");
    for (const selector of [
      "[data-target-job-detail-job-intel]",
      "[data-target-job-detail-quality-gate]",
      "[data-target-job-detail-fit-breakdown]",
      "[data-target-job-detail-missing-proof]",
      "[data-target-job-detail-match-points]",
      "[data-target-job-detail-drafts]",
      "[data-target-job-detail-feedback]",
      "[data-target-job-detail-follow-up]",
      "[data-target-job-detail-pack-links]",
    ]) {
      assert((await page.locator(selector).count()) === 1, `expected lead detail content area ${selector}`);
    }
    const detailComponentCount = await page.locator("[data-target-job-detail-fit-breakdown] [data-target-job-fit-component]").count();
    assert(detailComponentCount === FIT_COMPONENT_IDS.length, "expected lead drawer fit breakdown to render every fit component");
    for (const componentId of FIT_COMPONENT_IDS) {
      assert(
        (await page.locator(`[data-target-job-detail-fit-breakdown] [data-target-job-fit-component="${componentId}"]`).count()) === 1,
        `expected lead drawer component evidence for ${componentId}`
      );
    }
    const detailGroupedProof = await page.evaluate(() => {
      const list = document.querySelector("[data-target-job-detail-missing-proof] > ul");
      return Array.from(list?.children || []).map((item) => item.querySelector("strong")?.textContent || item.textContent || "");
    });
    assert(detailGroupedProof.length >= 2, "expected lead drawer missing proof to render grouped proof gaps");
    assert(detailGroupedProof.some((label) => /stack|work|source|red flag/i.test(label)), "expected lead drawer missing proof groups to preserve component labels");

    await page.selectOption("[data-target-job-detail-status]", "tailoring");
    const movedLeadStatus = await page.evaluate((id) => {
      const leads = JSON.parse(localStorage.getItem("proofresume:targetJobLeads") || "[]");
      return leads.find((lead) => lead.id === id)?.status || "";
    }, detailLeadId);
    assert(movedLeadStatus === "tailoring", "expected detail quick status movement to persist to local tracker storage");
    const networkCallsAfterDetailMove = await page.evaluate(() => window.__proofresumeNetworkCalls || []);
    assert(networkCallsAfterDetailMove.length === 0, "expected tracker board/detail movement to avoid network/send calls");

    const sourceMetadataContract = await page.evaluate(() => {
      const leads = JSON.parse(localStorage.getItem("proofresume:targetJobLeads") || "[]");
      const serialized = JSON.stringify(leads[0]?.sourceMetadata || {});
      return {
        hasMetadata: Boolean(leads[0]?.sourceMetadata && typeof leads[0].sourceMetadata === "object"),
        serialized,
      };
    });
    assert(sourceMetadataContract.hasMetadata, "expected imported lead to include normalized sourceMetadata");
    assert(/greenhouse/i.test(sourceMetadataContract.serialized), "expected sourceMetadata to preserve selected adapter/platform");
    assert(/local|noExternalFetch/i.test(sourceMetadataContract.serialized), "expected sourceMetadata to preserve local-only/no-fetch boundary");

    const brightCard = page.locator("[data-target-job-lead-list] [data-target-job-lead-id]", { hasText: "BrightLedger" }).first();
    await brightCard.locator("[data-target-job-lead-feedback]").selectOption("good-fit");

	    const spamCard = page.locator("[data-target-job-lead-list] [data-target-job-lead-id]", { hasText: "SpammyCoin" }).first();
	    await spamCard.locator("[data-target-job-lead-feedback]").selectOption("bad-fit");
	    const spamStatus = await spamCard.locator("[data-target-job-lead-status]").inputValue();
	    assert(spamStatus === "discarded", "expected status to auto-sync to discarded when feedback is bad-fit");

	    await page.locator("[data-target-job-learning-panel] > summary").click();
	    const learningSummary = await page.locator("[data-target-job-learning-summary]").textContent();
	    assert(/2\s+rated/i.test(String(learningSummary || "")), "expected learning panel summary to reflect 2 rated leads");
	    const learningEnabled = await page.locator("[data-target-job-learning-enabled]").isChecked();
	    assert(learningEnabled === true, "expected learning enabled toggle to default on");

	    await page.selectOption("[data-target-job-sort]", "learned");
	    await page.waitForTimeout(150);

    const firstTitle = await page.locator("[data-target-job-lead-list] [data-target-job-lead-id] h3").first().textContent();
    assert(String(firstTitle || "").toLowerCase().includes("customer"), "expected a BrightLedger lead to float to the top under learned sort");

    const brightDelta = await page
      .locator("[data-target-job-lead-list] [data-target-job-lead-id]", { hasText: "Customer Operations Analyst" })
      .locator(".target-job-learning-delta")
      .textContent()
      .catch(() => "");
    assert(/\+\d+\s+learned/i.test(String(brightDelta || "")), "expected learned delta label on BrightLedger lead");

    const brightLearningNote = await page
      .locator("[data-target-job-lead-list] [data-target-job-lead-id]", { hasText: "Customer Operations Analyst" })
      .locator(".target-job-learning-note")
      .textContent()
      .catch(() => "");
    assert(
      /personalized by/i.test(String(brightLearningNote || "")) && /sample size/i.test(String(brightLearningNote || "")),
      "expected learned-fit explanation note with sample size when personalization is active"
    );

    const jobHtmlFixturePath = path.join(os.tmpdir(), `proofresume-qa-job-${Date.now()}.html`);
    fs.writeFileSync(
      jobHtmlFixturePath,
      `<!doctype html><html><head><title>Customer Operations Analyst - BrightLedger</title><link rel="canonical" href="https://example.com/jobs/customer-ops-analyst" /></head><body><main><h1>Customer Operations Analyst - Remote</h1><p>${brightLedgerB}</p></main></body></html>`
    );
    await page.setInputFiles("[data-target-job-import-job-file-input]", jobHtmlFixturePath);
    const importedJobText = await page.locator("[data-target-job-post]").inputValue();
    assert(/Apply:\s+https:\/\/example\.com\/jobs\/customer-ops-analyst/i.test(String(importedJobText || "")), "expected HTML job import to include Apply header");
    await page.click("[data-target-job-analyze]");

	    await page.waitForSelector("[data-target-job-output]:not([hidden])");
		    const fitReason = await page.locator("[data-target-job-fit-reason]").textContent();
		    assert(/Personalized by/i.test(String(fitReason || "")), "expected pack fit reason to include personalization note");
    const fitBreakdownV2Contract = await page.evaluate((expectedComponentIds) => {
      const packet = typeof window.__proofresumeLatestTargetJobPacket === "function" ? window.__proofresumeLatestTargetJobPacket() : null;
      const components = Array.isArray(packet?.fit?.components) ? packet.fit.components : [];
      const componentScores = packet?.fit?.componentScores || {};
      const missingProofGroups = Array.isArray(packet?.fit?.missingProofGroups) ? packet.fit.missingProofGroups : [];
      const mainGridIds = Array.from(document.querySelectorAll("[data-target-job-fit-components] [data-target-job-fit-component]")).map((node) =>
        node.getAttribute("data-target-job-fit-component")
      );
      const overlay = document.querySelector("[data-target-job-learning-overlay]");
      const mainGrid = document.querySelector("[data-target-job-fit-components]");
      return {
        baseScore: packet?.fit?.score,
        personalizedScore: packet?.personalization?.personalizedScore,
        learningDelta: packet?.personalization?.delta,
        componentIds: components.map((component) => component.id),
        componentScores,
        missingProofGroups: missingProofGroups.map((group) => ({
          component: group.component,
          label: group.label,
          itemCount: Array.isArray(group.items) ? group.items.length : 0,
        })),
        mainGridIds,
        expectedComponentIds,
        overlaySeparateFromGrid: Boolean(overlay && mainGrid && !mainGrid.contains(overlay) && !overlay.contains(mainGrid)),
        overlayText: overlay?.textContent || "",
      };
    }, FIT_COMPONENT_IDS);
    assert(
      FIT_COMPONENT_IDS.every((componentId) => fitBreakdownV2Contract.componentIds.includes(componentId)),
      "expected packet fit.components to include every v2 component id"
    );
    assert(
      FIT_COMPONENT_IDS.every((componentId) => Number.isFinite(Number(fitBreakdownV2Contract.componentScores[componentId]))),
      "expected packet fit.componentScores to include numeric score for every v2 component"
    );
    assert(
      FIT_COMPONENT_IDS.every((componentId) => fitBreakdownV2Contract.mainGridIds.includes(componentId)),
      "expected main pack component grid to render every v2 component"
    );
    assert(fitBreakdownV2Contract.missingProofGroups.length >= 2, "expected packet fit.missingProofGroups to preserve grouped missing proof");
    assert(
      fitBreakdownV2Contract.missingProofGroups.some((group) => /stack|work|sourceQuality|redFlags/.test(String(group.component || ""))),
      "expected grouped missing proof to be keyed to fit component families"
    );
    assert(fitBreakdownV2Contract.overlaySeparateFromGrid === true, "expected learning overlay to be separate from the base fit component grid");
    assert(
      /boosting|penalizing|bounded adjustment|local feedback/i.test(String(fitBreakdownV2Contract.overlayText || "")),
      "expected learning overlay to explain local learning separately from base score"
    );
    if (Number(fitBreakdownV2Contract.learningDelta || 0) !== 0) {
      assert(
        Number(fitBreakdownV2Contract.personalizedScore) !== Number(fitBreakdownV2Contract.baseScore),
        "expected learning overlay score to remain separate from base fit score when delta is nonzero"
      );
    }
    const keywordHighlightUxFixture = targetJobKeywordHighlightUxFixture();
    const keywordHighlightUxPacket = await page.evaluate((fixture) => {
      const hooks = window.__proofresumeTargetJobTestHooks || {};
      const contracts = hooks.targetJobLocalToolContracts();
      const result = contracts.extract_keyword_highlights ? contracts.extract_keyword_highlights(fixture) : contracts.score_job_fit(fixture);
      return {
        fit: result?.fit,
        jobIntel: result?.jobIntel,
        keywordHighlights: result?.keywordHighlights,
        networkCalls: window.__proofresumeNetworkCalls || [],
      };
    }, keywordHighlightUxFixture);
    const keywordHighlightUxContract = buildKeywordHighlightUxContract({
      result: keywordHighlightUxPacket,
      networkCalls: keywordHighlightUxPacket.networkCalls,
      watchTerms: keywordHighlightUxFixture.watchTerms,
    });
    assertKeywordHighlightUxContract(keywordHighlightUxContract, "Browser QA");
	    const structuredPackContract = await page.evaluate(() => {
	      const packet = typeof window.__proofresumeLatestTargetJobPacket === "function" ? window.__proofresumeLatestTargetJobPacket() : null;
	      return {
	        matchedSkills: packet?.fit?.matchedSkills || [],
	        projectCount: packet?.structuredProfileSummary?.projectCount,
	        skillCount: packet?.structuredProfileSummary?.skillCount,
	        rationale: packet?.selectedEvidenceRationale || [],
	      };
	    });
	    assert(structuredPackContract.matchedSkills.includes("crm"), "expected structured profile skills to influence fit scoring");
	    assert(structuredPackContract.projectCount === 1, "expected packet to summarize structured projects");
	    assert(structuredPackContract.skillCount >= 3, "expected packet to summarize structured skills");
	    assert(
	      structuredPackContract.rationale.some((item) => /crm|workflow|implementation/i.test(String(item || ""))),
	      "expected evidence rationale to consume structured project/skill evidence"
	    );

		    const resumeExport = await page.locator("[data-target-job-resume-export]").inputValue();
		    assert(/## Target/i.test(String(resumeExport || "")) && /## Experience/i.test(String(resumeExport || "")), "expected full tailored resume markdown to be generated");
		    assert(/Source-line caveats/i.test(String(resumeExport || "")) && /Approval state: unapproved/i.test(String(resumeExport || "")), "expected tailored resume artifact to keep approval and source-line caveats");
		    const coverLetter = await page.locator("[data-target-job-cover-letter]").inputValue();
		    assert(/cover letter draft/i.test(String(coverLetter || "").toLowerCase()), "expected cover letter markdown to be generated");
		    assert(/Evidence to cite/i.test(String(coverLetter || "")) && /Missing proof to verify/i.test(String(coverLetter || "")), "expected full cover-letter artifact with evidence and proof-gap sections");

		    const bundleContract = await page.evaluate(() => {
		      const packet = typeof window.__proofresumeLatestTargetJobPacket === "function" ? window.__proofresumeLatestTargetJobPacket() : null;
		      if (!packet) return {};
		      const resumeText = (document.querySelector("[data-target-job-resume]") || {}).value || "";
		      const bundle = buildApplicationBundle(packet, resumeText);
		      const applicationAssets = Array.isArray(packet?.applicationAssets)
		        ? packet.applicationAssets
		        : Array.isArray(bundle?.applicationAssets)
		          ? bundle.applicationAssets
		          : [];
		      return {
		        format: String(bundle?.format || ""),
		        packetAssetFormat: String(packet?.assetMetadata?.format || ""),
		        bundleAssetFormat: String(bundle?.assetMetadata?.format || ""),
		        bundleResumeAssetFormat: String(bundle?.assetMetadata?.resume?.format || ""),
		        bundleCoverLetterAssetFormat: String(bundle?.assetMetadata?.coverLetter?.format || ""),
		        bundleResumeFormat: String(bundle?.assets?.resume?.format || ""),
		        bundleCoverLetterFormat: String(bundle?.assets?.coverLetter?.format || ""),
		        bundleFlags: {
		          localOnly: bundle?.localOnly,
		          noExternalFetch: bundle?.noExternalFetch,
		          noOutboundSend: bundle?.noOutboundSend,
		          noAutoApply: bundle?.noAutoApply,
		          noUpload: bundle?.noUpload,
		        },
		        applicationAssets,
		        resumeExport: (document.querySelector("[data-target-job-resume-export]") || {}).value || "",
		        coverLetter: (document.querySelector("[data-target-job-cover-letter]") || {}).value || "",
		      };
		    });
		    assert(bundleContract.format === "proofresume-target-job-application-bundle-v1", "expected application bundle format contract");
		    assert(
		      [bundleContract.packetAssetFormat, bundleContract.bundleAssetFormat].includes("proofresume-target-job-asset-metadata-v1"),
		      "expected packet or bundle to expose asset metadata format"
		    );
		    assert(bundleContract.bundleResumeAssetFormat === "proofresume-target-job-asset-metadata-v1", "expected bundle resume asset metadata format");
		    assert(bundleContract.bundleCoverLetterAssetFormat === "proofresume-target-job-asset-metadata-v1", "expected bundle cover-letter asset metadata format");
		    assert(bundleContract.bundleResumeFormat === "proofresume-target-job-tailored-resume-text-v1", "expected bundle tailored-resume text format");
		    assert(bundleContract.bundleCoverLetterFormat === "proofresume-target-job-cover-letter-text-v1", "expected bundle cover-letter text format");
		    assert(
		      Object.values(bundleContract.bundleFlags || {}).every((value) => value === true),
		      "expected bundle to preserve local-only/no-fetch/no-send/no-apply/no-upload flags"
		    );
		    assert(Array.isArray(bundleContract.applicationAssets) && bundleContract.applicationAssets.length >= 2, "expected applicationAssets metadata for resume and cover letter");
		    for (const expectedType of ["tailored-resume", "cover-letter"]) {
		      const asset = bundleContract.applicationAssets.find((item) => item?.type === expectedType);
		      assert(asset, `expected applicationAssets metadata for ${expectedType}`);
		      assert(/\d{4}-\d{2}-\d{2}T/.test(String(asset.generatedAt || "")), `expected ${expectedType} generatedAt timestamp`);
		      assert(Object.prototype.hasOwnProperty.call(asset, "sourceLeadId"), `expected ${expectedType} sourceLeadId field`);
		      assert(asset.approvalState === "unapproved", `expected ${expectedType} to remain unapproved`);
		      assert(asset.keywordCoverage && typeof asset.keywordCoverage === "object", `expected ${expectedType} keywordCoverage metadata`);
		    }
		    assert(/## Target/i.test(bundleContract.resumeExport) && /## Verification Notes/i.test(bundleContract.resumeExport), "expected full tailored resume artifact copy");
		    assert(/source line|source-line caveat/i.test(bundleContract.resumeExport), "expected tailored resume artifact to keep source-line caveats");
		    assert(/cover letter/i.test(bundleContract.coverLetter) && /evidence to cite/i.test(bundleContract.coverLetter), "expected full cover-letter artifact with evidence section");

		    const workspaceArchiveContract = await page.evaluate(() => {
		      const hooks = window.__proofresumeTargetJobTestHooks || {};
		      const profile = JSON.parse(localStorage.getItem("proofresume:targetJobProfile") || "{}");
		      const leads = JSON.parse(localStorage.getItem("proofresume:targetJobLeads") || "[]");
		      const packs = JSON.parse(localStorage.getItem("proofresume:targetJobPacks") || "[]");
		      const archive = hooks.buildWorkspaceArchive(profile);
		      const firstLead = leads[0] || {};
		      const newerLead = {
		        ...firstLead,
		        id: firstLead.id || "workspace-qa-lead",
		        format: "proofresume-target-job-lead-v1",
		        updatedAt: "2026-05-16T20:00:00.000Z",
		        feedback: "good-fit",
		        feedbackNote: "Newer archive row should win",
		      };
		      const olderLead = {
		        ...newerLead,
		        updatedAt: "2026-05-15T20:00:00.000Z",
		        feedbackNote: "Older archive row should be kept out",
		      };
		      const importArchive = {
		        ...archive,
		        workspace: {
		          ...archive.workspace,
		          profile: {
		            ...archive.workspace.profile,
		            savedAt: "2026-05-16T20:00:00.000Z",
		            resumeText: `${archive.workspace.profile?.resumeText || "Resume"}\nArchive restore marker`,
		          },
		          leads: [newerLead, { format: "invalid-lead-row", id: "" }],
		          packs,
		          learningSettings: { enabled: false, autoStatusFromFeedback: false },
		          generatedAssetsMetadata: archive.workspace.generatedAssetsMetadata || [],
		        },
		      };
		      const preview = hooks.previewWorkspaceArchiveImport(importArchive, "merge");
		      const invalidPreview = hooks.previewWorkspaceArchiveImport({ format: "not-a-workspace" }, "merge");
		      const applied = hooks.applyWorkspaceArchiveImport(importArchive, "merge");
		      const mergedLead = JSON.parse(localStorage.getItem("proofresume:targetJobLeads") || "[]").find((lead) => lead.id === newerLead.id) || {};
		      const olderArchive = {
		        ...archive,
		        workspace: {
		          ...archive.workspace,
		          leads: [olderLead],
		          packs: [],
		          learningSettings: { enabled: true, autoStatusFromFeedback: true },
		        },
		      };
		      const olderPreview = hooks.previewWorkspaceArchiveImport(olderArchive, "merge");
		      hooks.applyWorkspaceArchiveImport(olderArchive, "merge");
		      const keptLead = JSON.parse(localStorage.getItem("proofresume:targetJobLeads") || "[]").find((lead) => lead.id === newerLead.id) || {};
		      const restoredProfile = JSON.parse(localStorage.getItem("proofresume:targetJobProfile") || "{}");
		      const restoredSettings = JSON.parse(localStorage.getItem("proofresume:targetJobLearningSettings") || "{}");
		      return {
		        hookFormat: hooks.workspaceArchiveFormat,
		        archiveFormat: archive.format,
		        archiveFlags: {
		          localOnly: archive.localOnly,
		          noExternalFetch: archive.noExternalFetch,
		          noAutoApply: archive.noAutoApply,
		          noOutboundSend: archive.noOutboundSend,
		          noUpload: archive.noUpload,
		          noAnalyticsSend: archive.noAnalyticsSend,
		          noServerStorage: archive.noServerStorage,
		        },
		        archiveCounts: archive.counts,
		        archiveWorkspaceCounts: {
		          profile: archive.workspace.profile ? 1 : 0,
		          leads: archive.workspace.leads.length,
		          packs: archive.workspace.packs.length,
		          learningSettings: archive.workspace.learningSettings ? 1 : 0,
		          generatedAssetsMetadata: archive.workspace.generatedAssetsMetadata.length,
		        },
		        preview,
		        invalidPreview,
		        applied,
		        mergedLead,
		        olderPreview,
		        keptLead,
		        restoredProfileText: restoredProfile.resumeText || "",
		        restoredSettings,
		        networkCalls: window.__proofresumeNetworkCalls || [],
		      };
		    });
		    assert(workspaceArchiveContract.hookFormat === "proofresume-target-job-workspace-archive-v1", "expected workspace archive format hook");
		    assert(workspaceArchiveContract.archiveFormat === "proofresume-target-job-workspace-archive-v1", "expected workspace archive export format");
		    assert(
		      Object.values(workspaceArchiveContract.archiveFlags || {}).every((value) => value === true),
		      "expected workspace archive to preserve local-only/no-fetch/no-send/no-apply/no-upload/no-analytics/no-server flags"
		    );
		    assert(workspaceArchiveContract.archiveWorkspaceCounts.profile === 1, "expected workspace archive to include profile");
		    assert(workspaceArchiveContract.archiveWorkspaceCounts.leads >= 1, "expected workspace archive to include leads");
		    assert(workspaceArchiveContract.archiveWorkspaceCounts.packs >= 1, "expected workspace archive to include generated packs");
		    assert(workspaceArchiveContract.archiveWorkspaceCounts.learningSettings === 1, "expected workspace archive to include learning settings");
		    assert(workspaceArchiveContract.archiveWorkspaceCounts.generatedAssetsMetadata >= 1, "expected workspace archive to include generated asset metadata");
		    assert(workspaceArchiveContract.preview.format === "proofresume-target-job-workspace-import-preview-v1", "expected workspace archive import preview format");
		    assert(workspaceArchiveContract.preview.valid === true, "expected valid workspace archive preview before import");
		    assert(/newest updatedAt/i.test(workspaceArchiveContract.preview.message), "expected workspace preview to explain newest updatedAt merge policy");
		    assert(workspaceArchiveContract.preview.droppedInvalidRows === 1, "expected workspace preview to count dropped invalid rows");
		    assert(workspaceArchiveContract.preview.counts.generatedAssetsMetadata >= 1, "expected workspace preview to count asset metadata");
		    assert(workspaceArchiveContract.invalidPreview.valid === false, "expected invalid workspace archive preview to reject before mutation");
		    assert(workspaceArchiveContract.applied.applied === true, "expected workspace archive apply result after preview");
		    assert(workspaceArchiveContract.mergedLead.feedbackNote === "Newer archive row should win", "expected newest updatedAt archive row to replace local row");
		    assert(workspaceArchiveContract.olderPreview.keptCount >= 1, "expected workspace preview to count newer local row kept over older archive row");
		    assert(workspaceArchiveContract.keptLead.feedbackNote === "Newer archive row should win", "expected older archive row not to replace newer local row");
		    assert(/Archive restore marker/i.test(workspaceArchiveContract.restoredProfileText), "expected workspace archive import to restore profile");
		    assert(workspaceArchiveContract.restoredSettings.enabled === true, "expected workspace archive import to restore learning settings locally");
		    assert(workspaceArchiveContract.networkCalls.length === 0, "expected workspace archive export/import to avoid network/send calls");

		    await page.fill("[data-target-job-post]", brightLedgerRawHtml);
		    await page.click("[data-target-job-analyze]");
		    await page.waitForSelector("[data-target-job-output]:not([hidden])");
		    const htmlFitReason = await page.locator("[data-target-job-fit-reason]").textContent();
	    assert(/converted html/i.test(String(htmlFitReason || "").toLowerCase()), "expected HTML paste to trigger input normalization note");

	    await page.uncheck("[data-target-job-learning-enabled]");
	    await page.waitForTimeout(150);
	    const disabledFitReason = await page.locator("[data-target-job-fit-reason]").textContent();
	    assert(!/Personalized by/i.test(String(disabledFitReason || "")), "expected personalization note to be suppressed when learning is disabled");

	    const disabledDelta = await page
	      .locator("[data-target-job-lead-list] [data-target-job-lead-id]", { hasText: "Customer Operations Analyst" })
	      .locator(".target-job-learning-delta")
	      .textContent()
	      .catch(() => "");
	    assert(!/learned/i.test(String(disabledDelta || "")), "expected learned delta label to be hidden when learning is disabled");

	    page.on("dialog", (dialog) => dialog.accept());
	    await page.check("[data-target-job-learning-enabled]");
	    await page.click("[data-target-job-reset-learning]");
	    await page.waitForTimeout(150);
	    const resetSummary = await page.locator("[data-target-job-learning-summary]").textContent();
	    assert(/no rated/i.test(String(resetSummary || "")) || /0 rated/i.test(String(resetSummary || "")), "expected learning reset to clear rated feedback");

	    console.log(`qa-target-job-pack passed (${engine})`);
	  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  if (/localStorage.*Access is denied|SecurityError/i.test(String(error?.message || error))) {
    runStaticFallback(error);
    return;
  }
  console.error(error);
  process.exitCode = 1;
});

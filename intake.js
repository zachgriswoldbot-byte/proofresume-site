function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

const demoResumeText = [
  "Maya Patel",
  "Email: maya.demo@example.com",
  "Summary",
  "Operations lead focused on customer onboarding and workflow quality.",
  "Experience",
  "Responsible for onboarding process and weekly status reporting.",
  "Built support dashboard that reduced repeat intake questions by 32% across 6 pilot accounts.",
  "Worked with sales and product on customer launch issues.",
  "Skills",
  "HubSpot, Excel, customer operations, stakeholder communication",
].join("\n");

const demoTargetRole = "Customer Operations Manager";
const ACTIVATION_DECISION_PACKET_REVIEW_STATUS_KEY = "proofresume:activationDecisionPacketReviewStatus";

function safeText(value) {
  return String(value || "").replace(/\r\n/g, "\n");
}

function isDemoResumeText(text) {
  const normalized = normalizePaste(text);
  const demoNormalized = normalizePaste(demoResumeText);
  return Boolean(normalized) && normalized === demoNormalized;
}

function normalizePaste(text) {
  return safeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}

function loadIntakes() {
  try {
    const raw = localStorage.getItem("proofresume:intakes");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadActivationDecisionPacketReviewStatus(storageKey = ACTIVATION_DECISION_PACKET_REVIEW_STATUS_KEY) {
  try {
    const payload = JSON.parse(localStorage.getItem(storageKey) || "{}");
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

function storeActivationDecisionPacketReviewStatus(storageKey, statusValue) {
  const allowed = new Set(["not-reviewed", "reviewed", "rejected", "stale"]);
  const normalized = allowed.has(statusValue) ? statusValue : "not-reviewed";
  const payload = {
    format: "proofresume-activation-decision-packet-review-status-v1",
    status: normalized,
    localOnly: true,
    planningOnly: true,
    mutatesBusinessControls: false,
    enablementEvidenceCreated: false,
    updatedAt: nowIso(),
    source: "browser-localStorage",
  };
  localStorage.setItem(storageKey, JSON.stringify(payload));
  return payload;
}

function saveIntakes(intakes) {
  localStorage.setItem("proofresume:intakes", JSON.stringify(intakes.slice(0, 50)));
}

async function logPrivateSynthesisDecisionMemoToRepo(payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch("/api/synthesis-decision-memo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload || {}),
      signal: controller.signal,
    });
    return Boolean(response?.ok);
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function wordCount(text) {
  const words = safeText(text).match(/\b[\w'-]+\b/g);
  return words ? words.length : 0;
}

function likelySections(text) {
  const normalized = safeText(text).toLowerCase();
  const checks = [
    ["Contact", /\b(email|phone|linkedin|github|portfolio)\b/],
    ["Summary", /\b(summary|profile|objective)\b/],
    ["Experience", /\b(experience|employment|work history|professional history)\b/],
    ["Education", /\b(education|university|college|degree|bachelor|master)\b/],
    ["Skills", /\b(skills|tools|technologies|certifications)\b/],
    ["Projects", /\b(projects|portfolio|case study)\b/],
  ];

  return checks.filter(([, pattern]) => pattern.test(normalized)).map(([label]) => label);
}

function hasMetrics(text) {
  return /\b\d+[%$kmb]?\b|\b(percent|revenue|users|customers|hours|days|weeks|months|budget|saved|reduced|increased)\b/i.test(text);
}

function hasActionEvidence(text) {
  return /\b(led|owned|built|launched|improved|reduced|increased|created|managed|delivered|designed|automated)\b/i.test(text);
}

function evidencePrompts(text, sections, targetRole) {
  const prompts = [];
  const normalized = safeText(text);

  if (!hasMetrics(normalized)) {
    prompts.push("Add at least one metric: baseline, result, timeframe, volume, budget, revenue, or time saved.");
  }

  if (!hasActionEvidence(normalized)) {
    prompts.push("Clarify ownership with strong verbs: what you led, built, improved, launched, or delivered.");
  }

  if (!sections.includes("Experience")) {
    prompts.push("Include work experience entries with role title, company, timeframe, and 2-4 impact bullets.");
  }

  if (!sections.includes("Skills")) {
    prompts.push("Add a skills or tools section so role-relevant keywords are easy to find.");
  }

  if (targetRole) {
    prompts.push(`Name 3-5 keywords for ${targetRole} and map each to a real project or result.`);
  } else {
    prompts.push("Add a target role so the next pass can judge which evidence matters most.");
  }

  return prompts.slice(0, 5);
}

function canonicalSectionHeading(line) {
  const normalized = safeText(line)
    .trim()
    .replace(/[:.]+$/g, "")
    .toLowerCase();
  const headings = new Map([
    ["summary", "Summary"],
    ["profile", "Summary"],
    ["objective", "Summary"],
    ["experience", "Experience"],
    ["employment", "Experience"],
    ["work history", "Experience"],
    ["professional history", "Experience"],
    ["education", "Education"],
    ["skills", "Skills"],
    ["tools", "Skills"],
    ["technologies", "Skills"],
    ["certifications", "Skills"],
    ["projects", "Projects"],
    ["portfolio", "Projects"],
  ]);
  return headings.get(normalized) || "";
}

function parseExperienceHeading(line) {
  const text = safeText(line).trim().replace(/^[-*•]\s*/, "");
  const dateMatch = text.match(/\b(?:19|20)\d{2}\b(?:\s*(?:-|–|to)\s*(?:present|current|(?:19|20)\d{2}))?/i);
  const dates = dateMatch ? dateMatch[0] : "";
  const withoutDates = dates ? text.replace(dates, "").replace(/\s*[|,;-]\s*$/g, "").trim() : text;
  const atMatch = withoutDates.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
  if (atMatch) return { title: atMatch[1].trim(), company: atMatch[2].trim(), dates };
  const parts = withoutDates.split(/\s+[|–-]\s+/).map((part) => part.trim()).filter(Boolean);
  return { title: parts[0] || withoutDates || "Experience item", company: parts[1] || "", dates };
}

function isBulletLike(line) {
  return /^[-*•]\s+/.test(safeText(line).trim()) || /\b(led|owned|built|launched|improved|reduced|increased|created|managed|delivered|designed|automated|responsible|worked|helped)\b/i.test(line);
}

function buildStructuredExtraction(resumeText) {
  const lines = safeText(resumeText)
    .split("\n")
    .map((line, index) => ({ text: line.trim(), lineNumber: index + 1 }))
    .filter((line) => line.text);
  const experienceItems = [];
  let section = "";
  let current = null;

  for (const line of lines) {
    const heading = canonicalSectionHeading(line.text);
    if (heading) {
      section = heading;
      current = null;
      continue;
    }
    if (section !== "Experience") continue;

    const bulletText = line.text.replace(/^[-*•]\s*/, "").trim();
    const startsNewItem = !current || (!/^[-*•]\s+/.test(line.text) && !isBulletLike(line.text));
    if (startsNewItem) {
      const parsed = parseExperienceHeading(line.text);
      current = {
        id: `experience-${experienceItems.length + 1}`,
        title: parsed.title,
        company: parsed.company,
        dates: parsed.dates,
        approvalState: "unapproved",
        exportEligible: false,
        sourceLine: line.text,
        lineNumber: line.lineNumber,
        provenance: { source: "pasted_resume_text", lineNumbers: [line.lineNumber], sourceLines: [line.text] },
        bullets: [],
      };
      experienceItems.push(current);
      continue;
    }

    current.bullets.push({
      id: `${current.id}-bullet-${current.bullets.length + 1}`,
      text: bulletText,
      approvalState: "unapproved",
      exportEligible: false,
      sourceLine: line.text,
      lineNumber: line.lineNumber,
      provenance: { source: "pasted_resume_text", lineNumbers: [line.lineNumber], sourceLines: [line.text] },
    });
    current.provenance.lineNumbers.push(line.lineNumber);
    current.provenance.sourceLines.push(line.text);
  }

  const bulletCount = experienceItems.reduce((sum, item) => sum + item.bullets.length, 0);
  return {
    format: "proofresume-structured-extraction-v1",
    generatedAt: nowIso(),
    source: "local-rule-parser",
    approvalState: "unapproved",
    exportEligible: false,
    experienceItems,
    summary: {
      experienceItemCount: experienceItems.length,
      bulletCount,
      provenanceCoverage: experienceItems.length || bulletCount ? "100%" : "0%",
      approvedCount: 0,
      exportEligibleCount: 0,
    },
    guardrails: [
      "Parsed experience items are local metadata only.",
      "Every extracted item starts Unapproved.",
      "Structured extraction is export/download/snapshot ineligible until explicit source-line approval and promotion exists.",
      "No claims are invented beyond pasted source lines.",
    ],
  };
}

function buildAnalysis(resumeText, targetRole) {
  const sections = likelySections(resumeText);
  const prompts = evidencePrompts(resumeText, sections, targetRole);
  const structuredExtraction = buildStructuredExtraction(resumeText);
  return {
    wordCount: wordCount(resumeText),
    sections,
    prompts,
    structuredExtraction,
  };
}

function materialBoundaryFor(intake) {
  const isDemo = intake?.isDemo || intake?.sourceType === "demo_sample_material";
  return {
    kind: isDemo ? "sample/demo material" : "user-provided material",
    label: isDemo ? "Sample/demo material" : "User-provided material",
    storageLabel: isDemo ? "demo sample" : "your pasted resume",
    copy: isDemo
      ? "This draft uses built-in sample content only. It is not your resume and should be replaced before a real session."
      : "This draft uses only text you pasted into this browser. Demo sample content is not mixed into this record.",
  };
}

function setText(node, text) {
  if (!node) return;
  node.textContent = String(text || "");
}

function renderList(node, items, emptyText) {
  if (!node) return;
  const safeItems = items.length ? items : [emptyText];
  node.innerHTML = safeItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function latestIntake() {
  const intakes = loadIntakes();
  const lastId = localStorage.getItem("proofresume:lastIntakeId");
  return intakes.find((item) => item && item.id === lastId) || intakes[0] || null;
}

function redactionCountFor(intake) {
  const redactions = intake?.proofPacketRedactions && typeof intake.proofPacketRedactions === "object" ? intake.proofPacketRedactions : {};
  const sourceExcerpts = redactions.sourceExcerpts && typeof redactions.sourceExcerpts === "object" ? redactions.sourceExcerpts : {};
  const followupNotes = redactions.followupNotes && typeof redactions.followupNotes === "object" ? redactions.followupNotes : {};
  return Object.keys(sourceExcerpts).length + Object.keys(followupNotes).length;
}

function sessionPrepState(intakes, targetRole) {
  const safeIntakes = Array.isArray(intakes) ? intakes.filter(Boolean) : [];
  const demoCount = safeIntakes.filter((intake) => Boolean(intake?.isDemo)).length;
  const userCount = safeIntakes.filter((intake) => !intake?.isDemo).length;
  const totalDrafts = safeIntakes.length;
  const redactionCount = safeIntakes.reduce((sum, intake) => sum + redactionCountFor(intake), 0);
  const latest = latestIntake();
  const latestKind = latest?.isDemo ? "demo sample" : latest ? "user draft" : "no active draft";
  const hasTargetRole = Boolean(String(targetRole || latest?.targetRole || "").trim());
  const redactionReady = redactionCount === 0;
  const draftReady = totalDrafts === 0 || Boolean(latest);
  const resetReady = redactionReady;
  const ready = draftReady && resetReady && hasTargetRole && redactionReady;

  return {
    ready,
    demoCount,
    userCount,
    totalDrafts,
    redactionCount,
    latestKind,
    hasTargetRole,
    items: {
      draftState: {
        ready: draftReady,
        label: "Draft state",
        text: `${demoCount} demo draft${demoCount === 1 ? "" : "s"} and ${userCount} user draft${
          userCount === 1 ? "" : "s"
        } in localStorage; active material is ${latestKind}.`,
      },
      resetState: {
        ready: resetReady,
        label: "Reset state",
        text: resetReady
          ? "Reset state is clear: packet redactions are empty and demo/user drafts remain separated."
          : "Packet redactions remain. Use the reset controls before starting the next free audit.",
      },
      targetRole: {
        ready: hasTargetRole,
        label: "Target role",
        text: hasTargetRole ? `Target role confirmed: ${String(targetRole || latest?.targetRole || "").trim()}.` : "Add a target role before the operator starts.",
      },
      redactionReadiness: {
        ready: redactionReady,
        label: "Redaction readiness",
        text: redactionReady
          ? "No Proof Packet redactions are stored for local drafts."
          : `${redactionCount} Proof Packet redaction${redactionCount === 1 ? "" : "s"} remain in localStorage; clear or review them before sharing.`,
      },
    },
  };
}

function proofPacketHandoffState(intake) {
  const snapshot = intake?.exportSnapshot && typeof intake.exportSnapshot === "object" ? intake.exportSnapshot : null;
  const packet = snapshot?.proofPacketPreview && typeof snapshot.proofPacketPreview === "object" ? snapshot.proofPacketPreview : null;
  const shareReadiness = packet?.shareReadiness && typeof packet.shareReadiness === "object" ? packet.shareReadiness : null;
  const manifest = packet?.manifestSummary && typeof packet.manifestSummary === "object" ? packet.manifestSummary : null;
  const acceptedCount = Number(packet?.summary?.acceptedBullets || manifest?.acceptedBulletCount || shareReadiness?.acceptedOnly || 0);
  const redactionTotal = Number(manifest?.redactionCounts?.total || 0);
  const status = shareReadiness?.status || manifest?.shareReadiness?.status || (acceptedCount ? "Review before sharing" : "No packet yet");

  return {
    status,
    acceptedCount,
    redactionTotal,
    localOnly: true,
    exportTextUnchanged: true,
    restoreAvailable: Boolean(shareReadiness?.restoreAvailable || manifest?.shareReadiness?.restoreAvailable),
  };
}

function firstReplyFactRecord(intake) {
  const facts = intake?.firstReplyFacts && typeof intake.firstReplyFacts === "object" ? intake.firstReplyFacts : {};
  const legacy = intake?.firstReplyFactCapture && typeof intake.firstReplyFactCapture === "object" ? intake.firstReplyFactCapture : {};
  const capturedFacts = Array.isArray(legacy.capturedFacts) ? legacy.capturedFacts : [];
  const legacyObserved = String(legacy.observedState || "").toLowerCase() === "observed" || capturedFacts.length > 0;
  const state = ["accepted", "declined", "reschedule", "question-only", "no-response"].includes(facts.state)
    ? facts.state
    : legacyObserved
    ? "observed"
    : "unobserved";
  return {
    state,
    observedState: state === "unobserved" ? "not-observed" : "observed",
    capturedFacts,
    rawReplyText: typeof legacy.rawReplyText === "string" ? legacy.rawReplyText : "",
    updatedAt: typeof facts.updatedAt === "string" ? facts.updatedAt : typeof legacy.capturedAt === "string" ? legacy.capturedAt : "",
    explicitOperatorAction: state === "unobserved" ? "required" : "recorded",
  };
}

function firstReplyFactLabel(state) {
  const labels = {
    accepted: "Accepted",
    declined: "Declined",
    reschedule: "Reschedule",
    "question-only": "Question-only",
    "no-response": "No-response",
    observed: "Observed",
    unobserved: "Unobserved",
  };
  return labels[state] || labels.unobserved;
}

function firstReplyFactClass(state) {
  if (state === "accepted") return "is-approved";
  if (state === "declined" || state === "no-response") return "is-rejected";
  if (state === "reschedule" || state === "question-only") return "is-info";
  if (state === "observed") return "is-approved";
  return "is-pending";
}

function schedulingReadinessState(intake) {
  const facts = firstReplyFactRecord(intake);
  const accepted = Boolean(intake?.id && facts.state === "accepted" && facts.explicitOperatorAction === "recorded");
  return {
    accepted,
    readiness: accepted ? "ready" : "blocked",
    blocked: !accepted,
    acceptedReplyFact: accepted ? "accepted" : "missing",
    realReplyFacts: accepted ? "accepted" : facts.observedState,
    explicitOperatorAction: facts.explicitOperatorAction,
    updatedAt: facts.updatedAt,
  };
}

function appointmentSessionStartGateRecord(intake) {
  const scheduling = schedulingReadinessState(intake);
  const gate = intake?.appointmentSessionStartGate && typeof intake.appointmentSessionStartGate === "object" ? intake.appointmentSessionStartGate : {};
  const appointmentDateTime = typeof gate.appointmentDateTime === "string" ? gate.appointmentDateTime.trim() : "";
  const explicitAppointment = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(appointmentDateTime);
  const consentBoundaryConfirmed = Boolean(gate.consentBoundaryConfirmed);
  const redactedMaterialReminderConfirmed = Boolean(gate.redactedMaterialReminderConfirmed);
  const rawNotePrepConfirmed = Boolean(gate.rawNotePrepConfirmed);
  const ready =
    scheduling.accepted &&
    explicitAppointment &&
    consentBoundaryConfirmed &&
    redactedMaterialReminderConfirmed &&
    rawNotePrepConfirmed;
  const missing = [
    scheduling.accepted ? "" : "calendar readiness",
    explicitAppointment ? "" : "explicit appointment date/time",
    consentBoundaryConfirmed ? "" : "consent boundary",
    redactedMaterialReminderConfirmed ? "" : "redacted-material reminder",
    rawNotePrepConfirmed ? "" : "raw-note-prep facts",
  ].filter(Boolean);

  return {
    ready,
    readiness: ready ? "ready" : "blocked",
    blocked: !ready,
    calendarReady: scheduling.accepted,
    appointmentDateTime,
    explicitAppointment,
    consentBoundaryConfirmed,
    redactedMaterialReminderConfirmed,
    rawNotePrepConfirmed,
    factCount:
      (scheduling.accepted ? 1 : 0) +
      (explicitAppointment ? 1 : 0) +
      (consentBoundaryConfirmed ? 1 : 0) +
      (redactedMaterialReminderConfirmed ? 1 : 0) +
      (rawNotePrepConfirmed ? 1 : 0),
    missing,
    updatedAt: typeof gate.updatedAt === "string" ? gate.updatedAt : "",
  };
}

function firstSessionRawNoteRecord(intake) {
  const capture =
    intake?.firstSessionRawNoteCapture && typeof intake.firstSessionRawNoteCapture === "object"
      ? intake.firstSessionRawNoteCapture
      : {};
  const rawNotes = typeof capture.rawNotes === "string" ? capture.rawNotes : "";
  const hasNotes = Boolean(rawNotes.trim());
  return {
    rawNotes,
    hasNotes,
    noteCharCount: rawNotes.length,
    noteLineCount: rawNotes.trim() ? rawNotes.trim().split(/\n+/).length : 0,
    updatedAt: typeof capture.updatedAt === "string" ? capture.updatedAt : "",
    localOnly: true,
    exportTextUnchanged: true,
    debriefLinked: capture.debriefLinked !== false,
    objectionCodingLinked: capture.objectionCodingLinked !== false,
  };
}

function saveFirstSessionRawNotes(intakeId, rawNotes) {
  const intakes = loadIntakes();
  const index = intakes.findIndex((intake) => intake?.id === intakeId);
  if (index === -1) return null;
  const current = intakes[index];
  intakes[index] = {
    ...current,
    updatedAt: nowIso(),
    firstSessionRawNoteCapture: {
      rawNotes: safeText(rawNotes),
      updatedAt: nowIso(),
      capturedAt: nowIso(),
      localOnly: true,
      exportTextUnchanged: true,
      exportEligible: false,
      source: "first-session-local-operator-raw-notes",
      debriefLinked: true,
      objectionCodingLinked: true,
      linkedArtifacts: ["debrief-template", "objection-coding"],
    },
  };
  saveIntakes(intakes);
  return intakes[index];
}

function clearFirstSessionRawNotes(intakeId) {
  return saveFirstSessionRawNotes(intakeId, "");
}

function postSessionDebriefHandoffRecord(intake) {
  const capture = firstSessionRawNoteRecord(intake);
  const handoff =
    intake?.postSessionDebriefHandoff && typeof intake.postSessionDebriefHandoff === "object"
      ? intake.postSessionDebriefHandoff
      : {};
  const legacy = intake?.postSessionDebrief && typeof intake.postSessionDebrief === "object" ? intake.postSessionDebrief : {};
  const nextStep = typeof handoff.nextStep === "string" ? handoff.nextStep : "";
  const objectionCode = typeof handoff.objectionCode === "string" ? handoff.objectionCode : "";
  const synthesisCue = typeof handoff.synthesisCue === "string" ? handoff.synthesisCue : "";
  const debriefDraftText = typeof legacy.debriefDraftText === "string" ? legacy.debriefDraftText : "";
  const hasDraft = Boolean(nextStep.trim() || objectionCode.trim() || synthesisCue.trim() || debriefDraftText.trim() || legacy.draftSaved);

  return {
    ready: capture.hasNotes,
    readiness: capture.hasNotes ? (hasDraft ? "debrief-draft-saved" : "notes-ready") : "blocked",
    blocked: !capture.hasNotes,
    hasDraft,
    nextStep,
    objectionCode,
    synthesisCue,
    summaryFields: [
      nextStep.trim() ? `Next: ${nextStep.trim()}` : "",
      objectionCode.trim() ? `Objection: ${objectionCode.trim()}` : "",
      synthesisCue.trim() ? `Synthesis: ${synthesisCue.trim()}` : "",
      debriefDraftText.trim() && !nextStep.trim() && !objectionCode.trim() && !synthesisCue.trim() ? "Debrief draft saved locally." : "",
    ].filter(Boolean),
    updatedAt: typeof handoff.updatedAt === "string" ? handoff.updatedAt : "",
    localOnly: true,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
  };
}

function postSessionDebriefDraftTextFromFields(fields) {
  const nextStep = safeText(fields?.nextStep);
  const objectionCode = safeText(fields?.objectionCode);
  const synthesisCue = safeText(fields?.synthesisCue);
  const lines = [
    nextStep.trim() ? `Next step: ${nextStep.trim()}` : "",
    objectionCode.trim() ? `Objection code: ${objectionCode.trim()}` : "",
    synthesisCue.trim() ? `Synthesis cue: ${synthesisCue.trim()}` : "",
  ].filter(Boolean);
  if (!lines.length) return "";
  return `Post-session debrief draft:\n${lines.join("\n")}`;
}

function savePostSessionDebriefHandoff(intakeId, fields) {
  const intakes = loadIntakes();
  const index = intakes.findIndex((intake) => intake?.id === intakeId);
  if (index === -1) return null;
  const current = intakes[index];
  if (!firstSessionRawNoteRecord(current).hasNotes) return null;
  const draftText = postSessionDebriefDraftTextFromFields(fields);
  const hasDraft = Boolean(draftText.trim());
  intakes[index] = {
    ...current,
    updatedAt: nowIso(),
    postSessionDebrief: {
      ...(current.postSessionDebrief || {}),
      state: fields?.nextStep || fields?.objectionCode || fields?.synthesisCue ? "debrief-draft-saved" : "notes-ready",
      rawNotesAvailable: true,
      draftSaved: hasDraft,
      selectedDraftId: intakeId,
      debriefDraftText: draftText,
      debriefDraft: draftText,
      objectionCodes: safeText(fields?.objectionCode) ? [safeText(fields?.objectionCode)] : [],
      nextStepFields: {
        followUp: safeText(fields?.nextStep),
        objections: safeText(fields?.objectionCode),
        synthesis: safeText(fields?.synthesisCue),
      },
      updatedAt: nowIso(),
      localOnly: true,
      exportTextUnchanged: true,
      exportEligible: false,
      source: "post-session-local-debrief-handoff",
    },
    postSessionDebriefHandoff: {
      nextStep: safeText(fields?.nextStep),
      objectionCode: safeText(fields?.objectionCode),
      synthesisCue: safeText(fields?.synthesisCue),
      updatedAt: nowIso(),
      localOnly: true,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      exportEligible: false,
      source: "post-session-local-operator-debrief-handoff",
      linkedArtifacts: ["debrief-template", "objection-coding", "five-session-synthesis"],
    },
    debriefHandoff: {
      ...(current.debriefHandoff || {}),
      state: fields?.nextStep || fields?.objectionCode || fields?.synthesisCue ? "debrief-draft-saved" : "notes-ready",
      selectedDraftId: intakeId,
      rawNotesAvailable: true,
      draftSaved: hasDraft,
      localOnly: true,
      exportTextUnchanged: true,
      exportEligible: false,
      source: "post-session-local-debrief-handoff",
    },
  };
  saveIntakes(intakes);
  return intakes[index];
}

function clearPostSessionDebriefHandoff(intakeId) {
  return savePostSessionDebriefHandoff(intakeId, { nextStep: "", objectionCode: "", synthesisCue: "" });
}

function objectionTagsFromText(text) {
  return safeText(text)
    .split(/[,;\n]+/)
    .map((tag) => tag.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .slice(0, 12);
}

function objectionCodingHandoffRecord(intake) {
  const debrief = postSessionDebriefHandoffRecord(intake);
  const handoff =
    intake?.objectionCodingHandoff && typeof intake.objectionCodingHandoff === "object"
      ? intake.objectionCodingHandoff
      : {};
  const tags = Array.isArray(handoff.privateObjectionTags)
    ? handoff.privateObjectionTags.map((tag) => safeText(tag).trim()).filter(Boolean).slice(0, 12)
    : objectionTagsFromText(handoff.privateObjectionTagsText || handoff.tags || "");
  const synthesisNote = typeof handoff.synthesisNote === "string" ? handoff.synthesisNote : "";
  const hasCodes = Boolean(tags.length || synthesisNote.trim());

  return {
    ready: Boolean(debrief.hasDraft),
    readiness: debrief.hasDraft ? (hasCodes ? "codes-recorded" : "debrief-ready") : "blocked",
    blocked: !debrief.hasDraft,
    hasCodes,
    tags,
    tagsText: tags.join(", "),
    synthesisNote,
    updatedAt: typeof handoff.updatedAt === "string" ? handoff.updatedAt : "",
    localOnly: true,
    private: true,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
  };
}

function fiveSessionSynthesisReadinessState(intakes, selectedIntake) {
  const stored =
    selectedIntake?.fiveSessionSynthesisReadiness && typeof selectedIntake.fiveSessionSynthesisReadiness === "object"
      ? selectedIntake.fiveSessionSynthesisReadiness
      : {};
  const storedSlots = Array.isArray(stored.sessionSlots) ? stored.sessionSlots.slice(0, 5) : [];
  const realSessions = (Array.isArray(intakes) ? intakes : []).filter((intake) => intake && !intake.isDemo).slice(0, 5);
  const slots = Array.from({ length: 5 }, (_, index) => {
    const storedSlot = storedSlots[index] || null;
    const session = realSessions[index] || null;
    const raw = firstSessionRawNoteRecord(session);
    const debrief = postSessionDebriefHandoffRecord(session);
    const objection = objectionCodingHandoffRecord(session);
    const rawComplete = Boolean(storedSlot?.rawNotesComplete || (session?.id && raw.hasNotes));
    const debriefComplete = Boolean(storedSlot?.debriefComplete || (session?.id && debrief.hasDraft));
    const objectionCodeComplete = Boolean(storedSlot?.objectionCodesComplete || (session?.id && objection.tags.length > 0));
    const complete = rawComplete && debriefComplete && objectionCodeComplete;

    return {
      index: index + 1,
      intakeId: storedSlot?.recruitId || session?.id || "",
      selectedDraftKind: storedSlot ? "real session packet" : session?.isDemo ? "demo sample" : session ? "user draft" : "empty",
      rawComplete,
      debriefComplete,
      objectionCodeComplete,
      complete,
      tagCount: storedSlot?.objectionCodesComplete ? 1 : objection.tags.length,
    };
  });
  const completeSlots = slots.filter((slot) => slot.complete).length;
  const rawCompleteCount = slots.filter((slot) => slot.rawComplete).length;
  const debriefCompleteCount = slots.filter((slot) => slot.debriefComplete).length;
  const objectionCodeCompleteCount = slots.filter((slot) => slot.objectionCodeComplete).length;

  return {
    ready: completeSlots === 5,
    readiness: completeSlots === 5 ? "ready" : "blocked",
    blocked: completeSlots !== 5,
    completeSlots,
    rawCompleteCount,
    debriefCompleteCount,
    objectionCodeCompleteCount,
    requiredSlots: 5,
    slots,
    selectedDraftId: selectedIntake?.id || stored.selectedDraftId || "",
    blockerCount: Array.isArray(stored.blockers) ? stored.blockers.length : completeSlots === 5 ? 0 : 1,
    localOnly: true,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
  };
}

function synthesisArtifactText(state, intakes) {
  const packets = state.slots
    .filter((slot) => slot.complete)
    .map((slot) => {
      const session = (Array.isArray(intakes) ? intakes : []).find((intake) => intake?.id === slot.intakeId) || null;
      const raw = firstSessionRawNoteRecord(session);
      const debrief = postSessionDebriefHandoffRecord(session);
      const objection = objectionCodingHandoffRecord(session);
      return [
        `Session ${slot.index}: ${slot.intakeId || "local packet"}`,
        `Raw notes: ${safeText(raw.rawNotes).trim().slice(0, 280) || "Recorded locally"}`,
        `Debrief: ${debrief.summaryLines.join(" | ") || "Draft saved locally"}`,
        `Private objection tags: ${objection.tagsText || "Recorded locally"}`,
        `Synthesis note: ${safeText(objection.synthesisNote).trim().slice(0, 220) || "Not added"}`,
      ].join("\n");
    });

  return [
    "Private five-session synthesis draft",
    `Generated: ${nowIso()}`,
    `Evidence packets complete: ${state.completeSlots} / ${state.requiredSlots}`,
    "Boundary: local-only private operator artifact; not resume export text; not public/product copy.",
    "Conclusion guard: launch, pricing, testimonial, willingness-to-pay, demand, and outcome conclusions remain unobserved until reviewed evidence supports them.",
    "",
    packets.join("\n\n"),
  ].join("\n");
}

function privateSynthesisArtifactState(intakes, selectedIntake) {
  const readiness = fiveSessionSynthesisReadinessState(intakes, selectedIntake);
  const generator =
    selectedIntake?.privateSynthesisArtifactGenerator && typeof selectedIntake.privateSynthesisArtifactGenerator === "object"
      ? selectedIntake.privateSynthesisArtifactGenerator
      : null;
  const artifact =
    selectedIntake?.privateSynthesisArtifact && typeof selectedIntake.privateSynthesisArtifact === "object"
      ? selectedIntake.privateSynthesisArtifact
      : generator?.artifact && typeof generator.artifact === "object"
      ? generator.artifact
      : null;
  const artifactText = String(artifact?.artifactText || artifact?.summaryText || "");
  const drafted = Boolean(generator?.artifactDrafted || artifactText);
  const status = String(generator?.state || (readiness.ready ? (drafted ? "artifact-drafted" : "ready-to-generate") : "blocked"));

  return {
    readiness,
    ready: Boolean(generator?.readyToGenerate || readiness.ready),
    drafted,
    generator,
    artifact,
    artifactText: drafted ? artifactText : "",
    status,
    sourcePacketCount: Number(generator?.sourcePacketCount || readiness.completeSlots || 0),
    requiredPacketCount: Number(generator?.requiredPacketCount || readiness.requiredSlots || 5),
    localOnly: true,
    private: true,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
  };
}

function privateSynthesisDecisionMemoState(intakes, selectedIntake) {
  const artifactState = privateSynthesisArtifactState(intakes, selectedIntake);
  const stored =
    selectedIntake?.privateSynthesisDecisionMemo && typeof selectedIntake.privateSynthesisDecisionMemo === "object"
      ? selectedIntake.privateSynthesisDecisionMemo
      : {};
  const artifactExists = Boolean(artifactState.drafted && artifactState.artifactText);
  const reviewedDecision = safeText(stored.reviewedDecision || "");
  const evidenceConfidence = safeText(stored.evidenceConfidence || "");
  const publicChangeGuard = safeText(stored.publicChangeGuard || "");
  const operatorNotes = safeText(stored.operatorNotes || "");
  const drafted = Boolean(reviewedDecision || evidenceConfidence || publicChangeGuard || operatorNotes);

  return {
    artifactState,
    artifactExists,
    readiness: artifactExists ? (drafted ? "memo-drafted" : "artifact-ready") : "blocked",
    drafted,
    reviewedDecision,
    evidenceConfidence,
    publicChangeGuard,
    operatorNotes,
    updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : "",
    selectedDraftId: selectedIntake?.id || artifactState.readiness.selectedDraftId || "",
    sourceArtifactGeneratedAt: safeText(artifactState.artifact?.generatedAt || ""),
    sourcePacketCount: artifactState.sourcePacketCount,
    requiredPacketCount: artifactState.requiredPacketCount,
    localOnly: true,
    private: true,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
    exportEligible: false,
    downloadEligible: false,
  };
}

function savePrivateSynthesisDecisionMemo(intakeId, fields) {
  const intakes = loadIntakes();
  const index = intakes.findIndex((intake) => intake?.id === intakeId);
  if (index === -1) return null;
  const current = intakes[index];
  const state = privateSynthesisDecisionMemoState(intakes, current);
  if (!state.artifactExists) return null;
  const updatedAt = nowIso();
  const reviewedDecision = safeText(fields?.reviewedDecision);
  const evidenceConfidence = safeText(fields?.evidenceConfidence);
  const publicChangeGuard = safeText(fields?.publicChangeGuard);
  const operatorNotes = safeText(fields?.operatorNotes);
  intakes[index] = {
    ...current,
    updatedAt,
    privateSynthesisDecisionMemo: {
      format: "proofresume-private-synthesis-decision-memo-v1",
      state: reviewedDecision || evidenceConfidence || publicChangeGuard || operatorNotes ? "memo-drafted" : "artifact-ready",
      reviewedDecision,
      evidenceConfidence,
      publicChangeGuard,
      operatorNotes,
      selectedDraftId: current.id,
      sourceArtifactGeneratedAt: state.sourceArtifactGeneratedAt,
      sourcePacketCount: state.sourcePacketCount,
      requiredPacketCount: state.requiredPacketCount,
      source: "local-private-synthesis-decision-memo-capture",
      localOnly: true,
      private: true,
      exportEligible: false,
      downloadEligible: false,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      publicProductCopyUnchanged: true,
      conclusionGuard:
        "No public launch, pricing, testimonial, willingness-to-pay, demand, or outcome conclusion is approved by this local memo.",
      updatedAt,
    },
  };
  saveIntakes(intakes);
  return intakes[index];
}

function clearPrivateSynthesisDecisionMemo(intakeId) {
  return savePrivateSynthesisDecisionMemo(intakeId, {
    reviewedDecision: "",
    evidenceConfidence: "",
    publicChangeGuard: "",
    operatorNotes: "",
  });
}

function privateLaunchDecisionApprovalState(intakes, selectedIntake) {
  const memoState = privateSynthesisDecisionMemoState(intakes, selectedIntake);
  const stored =
    selectedIntake?.privateLaunchDecisionApproval && typeof selectedIntake.privateLaunchDecisionApproval === "object"
      ? selectedIntake.privateLaunchDecisionApproval
      : {};
  const memoComplete = Boolean(memoState.drafted && memoState.reviewedDecision);
  const launchDecision = safeText(stored.launchDecision || "");
  const reviewer = safeText(stored.reviewer || "");
  const approvalNotes = safeText(stored.approvalNotes || "");
  const drafted = Boolean(launchDecision || reviewer || approvalNotes);

  return {
    memoState,
    memoComplete,
    readiness: memoComplete ? (drafted ? "approval-drafted" : "memo-ready") : "blocked",
    drafted,
    launchDecision,
    reviewer,
    approvalNotes,
    updatedAt: typeof stored.updatedAt === "string" ? stored.updatedAt : "",
    selectedDraftId: selectedIntake?.id || memoState.selectedDraftId || "",
    localOnly: true,
    private: true,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
    publicProductCopyUnchanged: true,
    exportEligible: false,
    downloadEligible: false,
  };
}

function privatePublishReadinessChecklistRecord(selectedIntake) {
  const stored =
    selectedIntake?.privatePublishReadinessChecklist && typeof selectedIntake.privatePublishReadinessChecklist === "object"
      ? selectedIntake.privatePublishReadinessChecklist
      : selectedIntake?.privatePublishReadiness && typeof selectedIntake.privatePublishReadiness === "object"
      ? selectedIntake.privatePublishReadiness
      : {};
  const state = safeText(stored.state || stored.readiness || stored.status);
  const completed = Boolean(
    stored.completed ||
      stored.complete ||
      stored.completedAt ||
      stored.checkedAt ||
      state === "completed" ||
      state === "publish-ready" ||
      state === "ready"
  );
  return {
    completed,
    state: state || (completed ? "completed" : "blocked"),
    completedAt: safeText(stored.completedAt || stored.checkedAt || stored.updatedAt),
    checklistPath: safeText(stored.checklistPath || "ops/launch/private-free-audit-publish-readiness-checklist.md"),
    sourceLaunchApprovalUpdatedAt: safeText(stored.sourceLaunchApprovalUpdatedAt || stored.sourceApprovalUpdatedAt),
  };
}

function privateExplicitPublishPlanState(selectedIntake) {
  const readiness = privatePublishReadinessChecklistRecord(selectedIntake);
  const stored =
    selectedIntake?.privateExplicitPublishPlan && typeof selectedIntake.privateExplicitPublishPlan === "object"
      ? selectedIntake.privateExplicitPublishPlan
      : {};
  const owner = safeText(stored.owner);
  const rollback = safeText(stored.rollback);
  const claimRisk = safeText(stored.claimRisk);
  const publicCopyDiff = safeText(stored.publicCopyDiff);
  const drafted = Boolean(owner || rollback || claimRisk || publicCopyDiff);

  return {
    readiness,
    checklistComplete: readiness.completed,
    state: readiness.completed ? (drafted ? "plan-drafted" : "readiness-complete") : "blocked",
    drafted,
    owner,
    rollback,
    claimRisk,
    publicCopyDiff,
    updatedAt: safeText(stored.updatedAt),
    selectedDraftId: selectedIntake?.id || safeText(stored.selectedDraftId),
    localOnly: true,
    private: true,
    exportEligible: false,
    downloadEligible: false,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
    publicProductCopyUnchanged: true,
    noPublishAction: true,
  };
}

function privateExplicitPublishPlanComplete(state) {
  return Boolean(
    state?.checklistComplete &&
      state?.owner?.trim() &&
      state?.rollback?.trim() &&
      state?.claimRisk?.trim() &&
      state?.publicCopyDiff?.trim()
  );
}

function privatePublicCopyDiffRollbackState(selectedIntake) {
  const planState = privateExplicitPublishPlanState(selectedIntake);
  const planComplete = privateExplicitPublishPlanComplete(planState);
  const stored =
    selectedIntake?.privatePublicCopyDiffRollback && typeof selectedIntake.privatePublicCopyDiffRollback === "object"
      ? selectedIntake.privatePublicCopyDiffRollback
      : {};
  const diffSummary = safeText(stored.diffSummary);
  const consentCheck = safeText(stored.consentCheck);
  const claimRiskCheck = safeText(stored.claimRiskCheck);
  const validationCommand = safeText(stored.validationCommand);
  const rollbackPath = safeText(stored.rollbackPath);
  const drafted = Boolean(diffSummary || consentCheck || claimRiskCheck || validationCommand || rollbackPath);

  return {
    planState,
    planComplete,
    state: planComplete ? (drafted ? "diff-packet-drafted" : "publish-plan-complete") : "blocked",
    drafted,
    diffSummary,
    consentCheck,
    claimRiskCheck,
    validationCommand,
    rollbackPath,
    updatedAt: safeText(stored.updatedAt),
    selectedDraftId: selectedIntake?.id || safeText(stored.selectedDraftId),
    localOnly: true,
    private: true,
    exportEligible: false,
    downloadEligible: false,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
    publicProductCopyUnchanged: true,
    noPublishAction: true,
  };
}

function privatePublicCopyDiffRollbackComplete(state) {
  return Boolean(
    state?.planComplete &&
      state?.diffSummary?.trim() &&
      state?.consentCheck?.trim() &&
      state?.claimRiskCheck?.trim() &&
      state?.validationCommand?.trim() &&
      state?.rollbackPath?.trim()
  );
}

function privateReleaseCandidateRehearsalState(selectedIntake) {
  const diffState = privatePublicCopyDiffRollbackState(selectedIntake);
  const legacyCapture =
    selectedIntake?.privateReleaseCandidateRehearsalCapture && typeof selectedIntake.privateReleaseCandidateRehearsalCapture === "object"
      ? selectedIntake.privateReleaseCandidateRehearsalCapture
      : {};
  const legacyPacket =
    selectedIntake?.releaseCandidateRehearsal && typeof selectedIntake.releaseCandidateRehearsal === "object"
      ? selectedIntake.releaseCandidateRehearsal
      : legacyCapture.rehearsalPacket && typeof legacyCapture.rehearsalPacket === "object"
      ? legacyCapture.rehearsalPacket
      : {};
  const legacyFields = legacyPacket.fields && typeof legacyPacket.fields === "object" ? legacyPacket.fields : {};
  const legacyReady = Boolean(legacyCapture.rehearsalReady || legacyPacket.rehearsalReady || legacyPacket.state === "rehearsal-ready");
  const diffPacketComplete = privatePublicCopyDiffRollbackComplete(diffState) || legacyReady;
  const stored =
    selectedIntake?.privateReleaseCandidateRehearsal && typeof selectedIntake.privateReleaseCandidateRehearsal === "object"
      ? selectedIntake.privateReleaseCandidateRehearsal
      : {};
  const localStaticSmoke = safeText(stored.localStaticSmoke || legacyFields.localStaticSmoke);
  const servedSmoke = safeText(stored.servedSmoke || legacyFields.localServedSmoke || legacyFields.servedSmoke);
  const rollbackRehearsal = safeText(stored.rollbackRehearsal || legacyFields.rollbackRehearsal);
  const consentCheck = safeText(stored.consentCheck || legacyFields.consentCheck);
  const claimRiskCheck = safeText(stored.claimRiskCheck || legacyFields.claimRiskCheck);
  const drafted = Boolean(localStaticSmoke || servedSmoke || rollbackRehearsal || consentCheck || claimRiskCheck);

  return {
    diffState,
    diffPacketComplete,
    state: diffPacketComplete ? (drafted ? "rehearsal-ready" : "diff-packet-complete") : "blocked",
    drafted,
    localStaticSmoke,
    servedSmoke,
    rollbackRehearsal,
    consentCheck,
    claimRiskCheck,
    updatedAt: safeText(stored.updatedAt),
    selectedDraftId: selectedIntake?.id || safeText(stored.selectedDraftId),
    localOnly: true,
    private: true,
    exportEligible: false,
    downloadEligible: false,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
    publicProductCopyUnchanged: true,
    noPublishAction: true,
  };
}

const credentialedDeployReadinessFieldLabels = {
  platform: "platform",
  productionUrl: "production URL",
  credentialAvailability: "credential availability",
  deployTrigger: "deploy trigger",
  rollbackOwner: "rollback owner",
  rollbackMethod: "rollback method",
  healthCheckInputs: "health-check inputs",
};

const platformOwnerHandoffCategories = [
  ["selected static hosting platform", "platform"],
  ["production origin to check after deploy", "productionUrl"],
  ["credential availability confirmation outside repo", "credentialAvailability"],
  ["deploy trigger type", "deployTrigger"],
  ["deploy executor", "deployExecutor"],
  ["rollback owner", "rollbackOwner"],
  ["rollback method and restore target", "rollbackMethod"],
  ["post-deploy status method", "postDeployStatusMethod"],
  ["post-deploy health-check entrypoints", "healthCheckInputs"],
  ["incident communication owner", "incidentCommunicationOwner"],
];

const deployBlockerEscalationEvidence = [
  "Final deploy go/no-go evidence ledger exists",
  "Platform-owner handoff exists as a private non-secret input inventory",
  "Post-deploy health-check owner handoff exists as a route-only placeholder",
  "Local static rehearsal evidence is organized upstream but is not deploy authorization",
];

const deployBlockerEscalationUnavailable = [
  "Explicit future human approval: Not observed",
  "Credential availability outside repo: Not observed",
  "Selected deploy platform: Not observed",
  "Production URL / production origin: Not observed",
  "Deploy trigger: Not observed",
  "Rollback owner and method: Not observed",
  "Post-deploy health-check owner and method/results: Not observed",
  "Public launch authorization: Not observed",
  "Demand, testimonial, willingness-to-pay, pricing, secure-intake, and outcome conclusions: Not observed",
];

const firstHumanOperatorPacketReadyArtifacts = [
  "Final No-Go / Do Not Deploy ledger",
  "Deploy-blocker escalation memo boundary summary",
  "Credential-free static rehearsal route inventory",
  "Private platform-owner non-secret input inventory",
  "Route-only post-deploy health-check owner placeholder",
];

const firstHumanOperatorPacketUnavailableFacts = [
  "External human approval: Not observed",
  "Production URL or production origin: Not observed",
  "Deploy credentials: Not observed",
  "Deploy trigger: Not observed",
  "Deployment dashboard access detail: Not observed",
  "Rollback authorization: Not observed",
  "Public launch authorization: Not observed",
  "Post-deploy production health evidence: Not observed",
];

const operatorDryRunReviewLocalSteps = [
  "Read the first-human packet summary without editing packet artifacts",
  "Review the final No-Go / Do Not Deploy ledger",
  "Review credential-free static rehearsal route evidence",
  "Review the deploy-blocker escalation boundary summary",
  "Review the private operator dry-run checklist as local reading order only",
];

const operatorDryRunReviewHardStops = [
  "Do not unlock platform fields",
  "Do not request, paste, store, or infer credentials",
  "Do not enter a production URL or production origin",
  "Do not capture or run a deploy trigger",
  "Do not open or operate dashboard actions",
  "Do not configure DNS",
  "Do not authorize or execute rollback",
  "Do not authorize public launch or publish",
  "Do not make this export/download eligible",
  "Do not perform a deploy action",
];

const coldStartArchiveContinuationContext = [
  "First-human packet index is archived as private continuation context",
  "Operator dry-run checklist is archived as reading-only context",
  "Local static rehearsal evidence remains local route evidence only",
  "Final decision remains No-Go / Do Not Deploy",
  "Production deployment state remains Not observed",
];

const coldStartArchiveHardStops = [
  "Do not request, collect, paste, store, print, or infer credentials",
  "Do not request or store production origins, dashboard access details, deploy hooks, or deploy commands",
  "Do not turn the archive into a deploy plan, launch plan, rollback plan, or executable sequence",
  "Do not unlock platform fields or create an in-repo human approval path",
  "Do not authorize public deploy, public launch, DNS, production health, or rollback",
  "Do not make this archive export/download eligible",
];

const deployContinuationBlockedLabels = [
  "Blocked: explicit future human approval not observed",
  "Blocked: selected platform not observed",
  "Blocked: credential availability outside repo not observed",
  "Blocked: production URL / production origin not observed",
  "Blocked: deploy trigger not observed",
  "Blocked: rollback readiness not observed",
  "Blocked: post-deploy health readiness not observed",
  "Blocked: public launch authorization not observed",
  "No-Go / Do Not Deploy",
];

const deployContinuationHardStops = [
  "Do not request or store credentials, platform values, production URLs, deploy triggers, dashboard links, DNS targets, rollback details, or account identifiers",
  "Do not convert local route evidence, first-human packet context, or cold-start archive context into production readiness",
  "Do not create or imply an executable deploy sequence",
  "Do not approve public deploy, public launch, rollback, production health, demand, pricing, proof, or outcome claims",
  "Do not unlock platform fields or make this handoff export/download eligible",
];

const externalInputBoundaryArtifacts = [
  "Release-candidate deploy-continuation map",
  "Private external-input boundary ledger",
  "Final No-Go / Do Not Deploy ledger",
  "First-human packet archive context",
];

const externalInputBoundaryNotObservedFacts = [
  "External human approval",
  "Selected platform or platform account",
  "Credential availability and credential values",
  "Production origin",
  "Deploy trigger, deploy hook, or deploy execution method",
  "Control-plane locator, naming record, or account identifier",
  "Rollback owner, rollback method, or rollback authorization",
  "Post-deploy production health results",
  "Public launch or publish authorization",
  "Demand, testimonial, willingness-to-pay, pricing, proof, secure-intake, and outcome claims",
];

const externalInputBoundaryHardStops = [
  "Do not request, prompt for, paste, store, infer, or unlock external values",
  "Do not convert Not observed facts into repo-authored facts",
  "Do not enable platform fields or create an in-repo approval path",
  "Do not create deploy, rollback, DNS, dashboard, publish, or launch actions",
  "Do not make this handoff export/download eligible",
];

const platformOwnerNonRequestTransferArtifacts = [
  "Private platform-owner non-request transfer note",
  "Private external-input boundary ledger",
  "Release-candidate deploy-continuation map",
  "Final No-Go / Do Not Deploy ledger",
];

const platformOwnerNonRequestTransferNonRequests = [
  "Do not ask for selected platform, account, workspace, project, site, team, or organization values",
  "Do not ask for credentials, tokens, dashboard links, deploy hooks, DNS values, production URLs, or rollback details",
  "Do not ask for human approval, public launch authorization, publish authorization, or deploy execution",
  "Do not ask for demand, pricing, testimonial, proof, secure-intake, or outcome claim values",
];

const platformOwnerNonRequestTransferHardStops = [
  "Transfer local read-only context only",
  "Keep all external/platform facts Not observed",
  "Keep platform fields disabled and blank",
  "Do not imply execution, readiness, authorization, deploy, publish, rollback, DNS, or dashboard action",
  "Do not make this handoff export/download eligible",
];

const operatorResumePacketGuardrailReferences = [
  "Private operator-resume packet guardrail",
  "Private platform-owner non-request transfer note",
  "Private external-input boundary ledger",
  "Final No-Go / Do Not Deploy ledger",
];

const operatorResumePacketGuardrailRules = [
  "Read only as local blocked-state context",
  "Keep external deploy and market facts Not observed",
  "Keep credentials, platform values, production URLs, deploy triggers, dashboard links, DNS targets, and rollback details outside repo authority",
  "Keep demand, testimonials, pricing, willingness-to-pay, secure-intake, outcomes, proof claims, and paid-offer language Not observed",
];

const operatorResumePacketGuardrailHardStops = [
  "Do not request external or platform values",
  "Do not unlock platform fields or create an in-repo approval path",
  "Do not turn the packet, transfer note, ledger, continuation map, archive, checklist, packet index, or blocker memo into an executable sequence",
  "Do not deploy, publish, launch, advertise, email, sell, configure DNS, trigger CI, open dashboards, verify production health, execute rollback, or authorize rollback",
  "Do not make this guardrail export/download eligible",
];

const blockedStateOperatorContinuationIndexLabels = [
  "Private read-only context",
  "No-Go / Do Not Deploy",
  "Do Not Publish",
  "Not observed",
  "outside repo authority",
  "non-request",
  "non-executable",
  "Local context only",
];

const blockedStateOperatorContinuationIndexNotObservedFacts = [
  "Explicit future human approval",
  "Selected platform, platform account, production URL, and production origin",
  "Credentials, credential availability, deploy trigger, dashboard link, DNS target, or account identifier",
  "Rollback owner, rollback method, rollback readiness, and rollback authorization",
  "Post-deploy health owner, method, readiness, and production health results",
  "Public deploy authorization, public launch authorization, demand, testimonials, pricing, proof claims, paid-offer language, and outcome conclusions",
];

const blockedStateOperatorContinuationIndexHardStops = [
  "Do not request, collect, infer, paste, store, print, screenshot, summarize, or unlock external/platform values",
  "Do not convert blocked-state context into public deploy, public launch, rollback, production health, demand, pricing, proof, paid-offer, or outcome authority",
  "Do not turn the guardrail, continuation index, transfer note, ledger, continuation map, archive, checklist, packet index, or blocker memo into an executable sequence",
  "Do not open dashboards, run deploy commands, trigger CI, configure DNS, execute rollback, approve rollback, publish copy, email, advertise, sell, or imply execution",
  "Do not make this index export/download eligible",
];

const autonomousDeployStopLedgerSurfaces = [
  "Final deploy decision: No-Go / Do Not Deploy",
  "Ledger mode: private read-only context",
  "Autonomous posture: Autonomous stop",
  "Request posture: non-request",
  "Execution posture: non-executable",
];

const autonomousDeployStopLedgerNotObservedFacts = [
  "Platform, platform account, production URL, production origin, and deploy trigger",
  "Credentials, credential availability outside the repo, dashboard links, deploy hooks, CI secrets, account identifiers, and DNS targets",
  "Rollback owner, rollback method, rollback readiness, rollback authorization, and rollback targets",
  "Post-deploy health owner, method, readiness, and production health results",
  "Public deploy authorization, public launch authorization, demand, testimonials, pricing, willingness-to-pay, proof claims, paid-offer language, secure-intake conclusions, and outcomes",
];

const autonomousDeployStopLedgerHardStops = [
  "Stop any attempt to treat local context as public deploy, public launch, rollback, or production-health authority",
  "Stop any request for credentials, platform values, production URLs, deploy triggers, rollback details, dashboard links, account identifiers, DNS targets, post-deploy health methods, or missing facts",
  "Stop any inference of platform readiness, credential readiness, production URL readiness, deploy trigger readiness, rollback readiness, or post-deploy health readiness from local docs",
  "Stop any conversion of the ledger, index, guardrail, transfer note, continuation map, archive, checklist, packet index, or blocker memo into a checklist, command list, runbook, or executable sequence",
  "Stop any conversion of deploy-prep artifacts into demand, testimonials, pricing, willingness-to-pay, secure-intake, outcomes, proof claims, paid-offer language, email, advertising, sales, publish, or launch copy",
];

const postAutonomousStopRecoveryChecklistSurfaces = [
  "Recovery source: private autonomous deploy stop ledger",
  "Recovery posture: preserve private blocked state only",
  "Final deploy decision: No-Go / Do Not Deploy",
  "Request posture: non-request",
  "Execution posture: non-executable",
];

const postAutonomousStopRecoveryChecklistNotObservedFacts = [
  "Platform, platform account, production URL, production origin, and deploy trigger",
  "Credentials, credential availability outside the repo, dashboard links, deploy hooks, CI secrets, account identifiers, and DNS targets",
  "Rollback owner, rollback method, rollback readiness, rollback authorization, and rollback targets",
  "Post-deploy health owner, method, readiness, and production health results",
  "Public deploy authorization, public launch authorization, demand, testimonials, pricing, willingness-to-pay, secure-intake conclusions, outcomes, proof claims, and paid-offer language",
];

const postAutonomousStopRecoveryChecklistHardStops = [
  "Do not request, infer, collect, paste, store, print, screenshot, summarize, or unlock external/platform values",
  "Do not convert recovery context into deploy execution, public launch, rollback, production health, demand, pricing, proof, paid-offer, or outcome authority",
  "Do not turn the recovery checklist, stop ledger, continuation index, guardrail, transfer note, continuation map, archive, packet index, or blocker memo into an executable sequence",
  "Do not open dashboards, run deploy commands, trigger CI, configure DNS, execute rollback, approve rollback, publish copy, email, advertise, sell, or imply execution",
  "Do not make this recovery checklist export/download eligible or treat it as human/platform approval",
];

const humanPlatformAuthorityReEntryGateSurfaces = [
  "Gate source: private post-autonomous-stop recovery checklist",
  "Re-entry posture: blocked by human/platform authority",
  "Final deploy decision: No-Go / Do Not Deploy",
  "Request posture: non-request",
  "Execution posture: non-executable",
];

const humanPlatformAuthorityReEntryGateNotObservedFacts = [
  "Human/platform authority, explicit future human approval, public deploy authorization, and public launch authorization",
  "Platform, platform account, production URL, production origin, and deploy trigger",
  "Credentials, credential availability outside the repo, dashboard links, deploy hooks, CI secrets, account identifiers, and DNS targets",
  "Rollback owner, rollback method, rollback readiness, rollback authorization, and rollback targets",
  "Post-deploy health owner, method, readiness, production health results, demand, testimonials, pricing, willingness-to-pay, secure-intake conclusions, outcomes, proof claims, and paid-offer language",
];

const humanPlatformAuthorityReEntryGateHardStops = [
  "Do not request, infer, collect, paste, store, print, screenshot, summarize, or unlock external/platform values",
  "Do not treat this gate, the recovery checklist, or autonomous work as human/platform authority",
  "Do not convert re-entry context into deploy execution, public launch, rollback, production health, demand, pricing, proof, paid-offer, or outcome authority",
  "Do not open dashboards, run deploy commands, trigger CI, configure DNS, execute rollback, approve rollback, publish copy, email, advertise, sell, or imply execution",
  "Do not make this re-entry gate export/download eligible or use it to bypass human/platform authority",
];

const outsideAuthorityAwaitingStateLedgerSurfaces = [
  "Awaiting source: private human-platform authority re-entry gate",
  "Awaiting posture: blocked state only; preserve outside repo authority",
  "Final deploy decision: No-Go / Do Not Deploy",
  "Request posture: non-request",
  "Execution posture: non-executable",
];

const outsideAuthorityAwaitingStateLedgerNotObservedFacts = [
  "Human/platform authority, explicit future human approval, public deploy authorization, and public launch authorization",
  "Platform, platform account, production URL, production origin, and deploy trigger",
  "Credentials, credential availability outside the repo, dashboard links, deploy hooks, CI secrets, account identifiers, and DNS targets",
  "Rollback owner, rollback method, rollback readiness, rollback authorization, and rollback targets",
  "Post-deploy health owner, method, readiness, production health results, demand, testimonials, pricing, willingness-to-pay, secure-intake conclusions, outcomes, proof claims, and paid-offer language",
];

const outsideAuthorityAwaitingStateLedgerHardStops = [
  "Do not publish, ship, launch, email, advertise, sell from, or adapt this ledger into public copy",
  "Do not request, infer, collect, paste, store, print, screenshot, summarize, or unlock external/platform values",
  "Do not treat awaiting context as deploy approval, launch approval, rollback approval, or platform authority",
  "Do not open dashboards, run deploy commands, trigger CI, configure DNS, execute rollback, approve rollback, or imply execution",
  "Do not make this awaiting ledger export/download eligible or use it to bypass human/platform authority",
];

function defaultStaticDeployRehearsalEvidence() {
  return {
    state: "not-run",
    stateLabel: "Static deploy rehearsal not visible",
    ok: false,
    checkedAt: "",
    mode: "not-run",
    reportPath: "ops/reports/static-deploy-rehearsal/latest.json",
    routes: [],
    routeSummary: "No local route evidence is visible yet.",
    evidenceNote: "Run npm run static-deploy-rehearsal to generate local-only route evidence before platform inputs are requested.",
    localOnly: true,
    noSecretStorage: true,
    noDeployAction: true,
    noPublishAction: true,
    exportEligible: false,
    downloadEligible: false,
  };
}

function normalizeStaticDeployRehearsalEvidence(report) {
  if (!report || typeof report !== "object") return defaultStaticDeployRehearsalEvidence();
  const rawState = safeText(report.state);
  const ok = Boolean(report.ok || rawState === "passed-local");
  const state = rawState || (ok ? "passed-local" : "blocked-local");
  const staticEntrypoints = report.staticEntrypoints || {};
  const missingFiles = Array.isArray(staticEntrypoints.missing) ? staticEntrypoints.missing.map(safeText).filter(Boolean) : [];
  const limitations = Array.isArray(report.limitations) ? report.limitations.map(safeText).filter(Boolean) : [];
  const blockers = Array.isArray(report.blockers) ? report.blockers.map(safeText).filter(Boolean) : [];
  const routeStatus = Array.isArray(report.evidence?.routeStatus) ? report.evidence.routeStatus : [];
  const failedRoutes = routeStatus
    .filter((route) => route && route.ok === false)
    .map((route) => ({
      route: safeText(route.route || route.name || "unknown route"),
      status: safeText(route.status || route.error || route.contentType || "failed"),
    }))
    .filter((route) => route.route);
  const noDeployGuardrails = report.noDeployGuardrails || {};
  const guardrailFailures = Object.entries(noDeployGuardrails)
    .filter(([key, value]) => key !== "productionDeploymentState" && value !== false && value !== 0 && value !== "" && value != null)
    .map(([key, value]) => `${key}: ${String(value)}`);
  const unsafeGuardrailDetails = blockers
    .filter((item) => /unsafe guardrail|dashboard|credential|deploy trigger|production url/i.test(item))
    .map((item) => `Guardrail blocker: ${item}`);
  const requiredRoutes = Array.isArray(staticEntrypoints.required)
    ? staticEntrypoints.required
        .map((file) => (safeText(file) === "website/index.html" ? "/" : safeText(file).replace(/^website/, "") || safeText(file)))
        .filter(Boolean)
    : [];
  const inventoryRoutes = Array.isArray(report.evidence?.routes)
    ? report.evidence.routes.map((route) => safeText(route?.route || route?.name)).filter(Boolean)
    : [];
  const servedRoutes = Array.isArray(report.servedSmoke?.routes) ? report.servedSmoke.routes.map(safeText).filter(Boolean) : [];
  const routes = Array.from(new Set([...requiredRoutes, ...inventoryRoutes, ...servedRoutes])).map((route) => {
    const file = route === "/" ? "website/index.html" : `website${route}`;
    return {
      route,
      ok: ok && !missingFiles.includes(file),
    };
  });
  return {
    ...defaultStaticDeployRehearsalEvidence(),
    state,
    stateLabel: safeText(report.stateLabel) || (ok ? "Passed locally" : state === "not-run" ? "Static deploy rehearsal not visible" : "Blocked locally"),
    ok,
    checkedAt: safeText(report.checkedAt),
    mode: safeText(report.mode || report.servedSmoke?.mode) || "unknown",
    reportPath: safeText(report.reportPath) || "ops/reports/static-deploy-rehearsal/latest.json",
    limitations,
    blockers,
    missingFiles,
    failedRoutes,
    guardrailFailures: Array.from(new Set([...guardrailFailures, ...unsafeGuardrailDetails])),
    productionDeploymentState: safeText(noDeployGuardrails.productionDeploymentState || "Do Not Deploy"),
    routes,
    routeSummary: routes.length
      ? `${routes.filter((route) => route.ok).length}/${routes.length} local routes passed.`
      : "No local route inventory was visible in the rehearsal report.",
    evidenceNote:
      safeText(report.evidenceNote) ||
      "Credential-free local rehearsal evidence only; no platform credentials, production URL, deploy trigger, or public deploy action.",
  };
}

function staticDeployRehearsalDrilldownItems(staticDeployRehearsal) {
  const evidence = staticDeployRehearsal || defaultStaticDeployRehearsalEvidence();
  const failedRoutes = Array.isArray(evidence.failedRoutes) ? evidence.failedRoutes : [];
  const missingFiles = Array.isArray(evidence.missingFiles) ? evidence.missingFiles : [];
  const blockers = Array.isArray(evidence.blockers) ? evidence.blockers : [];
  const limitations = Array.isArray(evidence.limitations) ? evidence.limitations : [];
  const guardrailFailures = Array.isArray(evidence.guardrailFailures) ? evidence.guardrailFailures : [];
  const blockedRoutes = Array.isArray(evidence.routes) ? evidence.routes.filter((route) => !route.ok).map((route) => route.route) : [];

  return [
    {
      label: "Report state",
      details: [
        `State: ${evidence.state || "not-run"}`,
        `Report: ${evidence.reportPath || "ops/reports/static-deploy-rehearsal/latest.json"}`,
        evidence.checkedAt ? `Checked: ${evidence.checkedAt}` : "Checked: not visible",
        `Mode: ${evidence.mode || "not-run"}`,
      ],
    },
    {
      label: "Blocked route detail",
      details: failedRoutes.length
        ? failedRoutes.map((route) => `${route.route}: ${route.status || "failed"}`)
        : blockedRoutes.length
        ? blockedRoutes.map((route) => `${route}: blocked by missing or failed local evidence`)
        : evidence.ok
        ? ["No blocked local routes in the visible report."]
        : ["No route-level failure detail is visible yet."],
    },
    {
      label: "Report blockers",
      details:
        blockers.length || missingFiles.length || limitations.length
          ? [...blockers, ...missingFiles.map((file) => `Missing static entrypoint: ${file}`), ...limitations.map((item) => `Limitation: ${item}`)]
          : evidence.ok
          ? ["No report blockers listed."]
          : ["Static rehearsal report is missing, incomplete, or blocked before local evidence passed."],
    },
    {
      label: "Deploy guardrail",
      details: guardrailFailures.length
        ? [...guardrailFailures, "Platform inputs remain disabled until this local rehearsal passes."]
        : [
            `Production deployment state: ${evidence.productionDeploymentState || "Do Not Deploy"}`,
            "Platform inputs remain disabled until this local rehearsal passes.",
          ],
    },
  ];
}

function renderStaticDeployRehearsalDrilldown(container, staticDeployRehearsal) {
  if (!container) return;
  const items = staticDeployRehearsalDrilldownItems(staticDeployRehearsal);
  container.setAttribute("data-static-deploy-rehearsal-status", staticDeployRehearsal?.state || "not-run");
  container.setAttribute("data-static-deploy-rehearsal-ready", staticDeployRehearsal?.ok ? "true" : "false");
  container.setAttribute("data-export-eligible", "false");
  container.setAttribute("data-download-eligible", "false");
  container.innerHTML = items
    .map(
      (item) => `<article class="static-rehearsal-detail">
        <strong>${escapeHtml(item.label)}</strong>
        <ul>${item.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("")}</ul>
      </article>`
    )
    .join("");
}

async function loadStaticDeployRehearsalEvidence() {
  const adminData = await fetch("admin-data.json", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  const fromAdmin =
    adminData?.validation?.staticDeployRehearsal ||
    adminData?.operations?.queueRefreshDecisionInput?.staticDeployRehearsalVisibility ||
    null;
  if (fromAdmin) return normalizeStaticDeployRehearsalEvidence(fromAdmin);
  return defaultStaticDeployRehearsalEvidence();
}

function privateReleaseCandidateRehearsalComplete(state) {
  return Boolean(
    state?.diffPacketComplete &&
      state?.localStaticSmoke?.trim() &&
      state?.servedSmoke?.trim() &&
      state?.rollbackRehearsal?.trim() &&
      state?.consentCheck?.trim() &&
      state?.claimRiskCheck?.trim()
  );
}

function privateCredentialedDeployReadinessState(selectedIntake, staticDeployRehearsalEvidence = defaultStaticDeployRehearsalEvidence()) {
  const rehearsalState = privateReleaseCandidateRehearsalState(selectedIntake);
  const rehearsalComplete = privateReleaseCandidateRehearsalComplete(rehearsalState);
  const staticDeployRehearsal = normalizeStaticDeployRehearsalEvidence(staticDeployRehearsalEvidence);
  const staticDeployRehearsalReady = Boolean(staticDeployRehearsal.ok && staticDeployRehearsal.state === "passed-local");
  const stored =
    selectedIntake?.privateCredentialedDeployReadiness && typeof selectedIntake.privateCredentialedDeployReadiness === "object"
      ? selectedIntake.privateCredentialedDeployReadiness
      : {};
  const explicitHumanApprovalObserved = Boolean(
    stored?.explicitHumanApprovalObserved && safeText(stored?.explicitHumanApprovalSource) === "external-human-approval"
  );
  const platformInputsEnabled = Boolean(rehearsalComplete && staticDeployRehearsalReady && explicitHumanApprovalObserved);
  const platform = safeText(stored.platform);
  const productionUrl = safeText(stored.productionUrl);
  const credentialAvailability = safeText(stored.credentialAvailability);
  const deployTrigger = safeText(stored.deployTrigger);
  const rollbackOwner = safeText(stored.rollbackOwner);
  const rollbackMethod = safeText(stored.rollbackMethod);
  const healthCheckInputs = safeText(stored.healthCheckInputs);
  const fields = {
    platform: platformInputsEnabled ? platform : "",
    productionUrl: platformInputsEnabled ? productionUrl : "",
    credentialAvailability: platformInputsEnabled ? credentialAvailability : "",
    deployTrigger: platformInputsEnabled ? deployTrigger : "",
    rollbackOwner: platformInputsEnabled ? rollbackOwner : "",
    rollbackMethod: platformInputsEnabled ? rollbackMethod : "",
    healthCheckInputs: platformInputsEnabled ? healthCheckInputs : "",
  };
  const missingInputs = Object.entries(fields)
    .filter(([, value]) => !value.trim())
    .map(([key]) => credentialedDeployReadinessFieldLabels[key]);
  const inputsComplete = platformInputsEnabled && missingInputs.length === 0;

  return {
    rehearsalState,
    rehearsalComplete,
    staticDeployRehearsal,
    staticDeployRehearsalReady,
    state: !rehearsalComplete
      ? "rehearsal-blocked"
      : !staticDeployRehearsalReady
      ? "static-rehearsal-blocked"
      : !explicitHumanApprovalObserved
      ? "human-approval-blocked"
      : inputsComplete
      ? "deploy-inputs-ready"
      : "deploy-inputs-blocked",
    inputsComplete,
    missingInputs,
    explicitHumanApprovalObserved,
    explicitHumanApprovalSource: safeText(stored.explicitHumanApprovalSource),
    platformInputsEnabled,
    platform,
    productionUrl,
    credentialAvailability,
    deployTrigger,
    rollbackOwner,
    rollbackMethod,
    healthCheckInputs,
    updatedAt: safeText(stored.updatedAt),
    selectedDraftId: selectedIntake?.id || safeText(stored.selectedDraftId),
    localOnly: true,
    private: true,
    noSecretStorage: true,
    noDeployAction: true,
    noPublishAction: true,
    exportEligible: false,
    downloadEligible: false,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
    publicProductCopyUnchanged: true,
  };
}

function platformOwnerHandoffState(credentialedState) {
  const state = credentialedState || {};
  const missingCategories = platformOwnerHandoffCategories
    .filter(([, key]) => !safeText(state[key]).trim())
    .map(([label]) => label);
  return {
    state: state.staticDeployRehearsalReady ? "owner-inputs-needed" : "blocked-static-rehearsal",
    checklistPath: "../ops/deploy/private-platform-owner-handoff-checklist.md",
    missingCategories,
    missingCount: missingCategories.length,
    staticDeployRehearsalReady: Boolean(state.staticDeployRehearsalReady),
    localOnly: true,
    private: true,
    noSecretStorage: true,
    noDeployAction: true,
    noPublishAction: true,
    exportEligible: false,
    downloadEligible: false,
  };
}

function postDeployHealthCheckHandoffState(credentialedState) {
  const state = credentialedState || {};
  const routes = Array.isArray(state.staticDeployRehearsal?.routes)
    ? state.staticDeployRehearsal.routes
        .map((route) => ({
          route: safeText(route?.route || ""),
          ok: route?.ok !== false,
        }))
        .filter((route) => route.route)
    : [];
  const ready = Boolean(state.staticDeployRehearsalReady && routes.length);
  return {
    state: ready ? "route-handoff-ready" : "blocked-static-rehearsal",
    templatePath: "../ops/deploy/private-post-deploy-health-check-owner-handoff-template.md",
    routes,
    routeCount: routes.length,
    staticDeployRehearsalReady: Boolean(state.staticDeployRehearsalReady),
    localOnly: true,
    private: true,
    routeOnly: true,
    noSecretStorage: true,
    noProductionUrl: true,
    noCredential: true,
    noDeployTrigger: true,
    noDeployAction: true,
    noPublishAction: true,
    exportEligible: false,
    downloadEligible: false,
  };
}

function deployBlockerEscalationHandoffState(readinessState, finalDecision, handoffState, healthCheckHandoffState) {
  const finalLedgerReady = Boolean(healthCheckHandoffState?.state === "route-handoff-ready" && finalDecision?.decision === "No-Go / Do Not Deploy");
  return {
    state: finalLedgerReady ? "no-go-escalation-summary" : "blocked-final-ledger",
    finalLedgerReady,
    templatePath: "../ops/deploy/private-deploy-blocker-escalation-memo-template.md",
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: safeText(finalDecision?.productionDeploymentState || "Do Not Deploy"),
    evidence: finalLedgerReady ? deployBlockerEscalationEvidence : ["Final No-Go ledger not visible yet"],
    unavailable: finalLedgerReady ? deployBlockerEscalationUnavailable : ["Deploy-blocker escalation summary is blocked until the final No-Go ledger exists"],
    platformOwnerHandoffObserved: handoffState?.state === "owner-inputs-needed",
    healthCheckHandoffObserved: healthCheckHandoffState?.state === "route-handoff-ready",
    explicitHumanApprovalObserved: false,
    platformInputsEnabled: false,
    localOnly: true,
    private: true,
    readOnly: true,
    noSecretStorage: true,
    noProductionUrl: true,
    noCredential: true,
    noDeployTrigger: true,
    noDeployAction: true,
    noPublishAction: true,
    noHumanApprovalPath: true,
    exportEligible: false,
    downloadEligible: false,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
  };
}

function firstHumanOperatorPacketHandoffState(escalationHandoff) {
  const escalationReady = true;
  return {
    state: "read-only-packet-ready",
    escalationReady,
    templatePath: "../ops/deploy/private-deploy-blocker-escalation-memo-template.md",
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: safeText(escalationHandoff?.productionDeploymentState || "Do Not Deploy"),
    readyArtifacts: firstHumanOperatorPacketReadyArtifacts,
    unavailableFacts: firstHumanOperatorPacketUnavailableFacts,
    explicitHumanApprovalObserved: false,
    platformInputsEnabled: false,
    localOnly: true,
    private: true,
    readOnly: true,
    noSecretStorage: true,
    noProductionUrl: true,
    noCredential: true,
    noDeployTrigger: true,
    noDashboardLink: true,
    noContactDetails: true,
    noRollbackAuthorization: true,
    noPublicLaunchAuthorization: true,
    noDeployAction: true,
    noPublishAction: true,
    noHumanApprovalPath: true,
    exportEligible: false,
    downloadEligible: false,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
  };
}

function operatorDryRunReviewHandoffState(firstHumanPacket) {
  const packetReady = firstHumanPacket?.state === "read-only-packet-ready";
  return {
    state: packetReady ? "read-only-review-ready" : "blocked-first-human-packet",
    packetReady,
    checklistPath: "../ops/deploy/private-operator-dry-run-review-checklist.md",
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: safeText(firstHumanPacket?.productionDeploymentState || "Do Not Deploy"),
    localSteps: operatorDryRunReviewLocalSteps,
    hardStops: operatorDryRunReviewHardStops,
    explicitHumanApprovalObserved: false,
    platformInputsEnabled: false,
    localOnly: true,
    private: true,
    readOnly: true,
    reviewOnly: true,
    noSecretStorage: true,
    noProductionUrl: true,
    noCredential: true,
    noDeployTrigger: true,
    noDashboardAction: true,
    noDnsAction: true,
    noRollbackAuthorization: true,
    noPublicLaunchAuthorization: true,
    noDeployAction: true,
    noPublishAction: true,
    noHumanApprovalPath: true,
    exportEligible: false,
    downloadEligible: false,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
  };
}

function coldStartArchiveHandoffState(operatorDryRunReview) {
  const dryRunReady = operatorDryRunReview?.state === "read-only-review-ready";
  return {
    state: dryRunReady ? "read-only-archive-ready" : "blocked-operator-dry-run",
    dryRunReady,
    archivePath: "../ops/deploy/private-first-human-packet-handoff-archive-cold-start-brief.md",
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Not observed",
    continuationContext: coldStartArchiveContinuationContext,
    hardStops: coldStartArchiveHardStops,
    explicitHumanApprovalObserved: false,
    platformInputsEnabled: false,
    platformFieldUnlock: false,
    localOnly: true,
    private: true,
    readOnly: true,
    archiveOnly: true,
    noSecretStorage: true,
    noProductionUrl: true,
    noCredential: true,
    noDeployTrigger: true,
    noDashboardAction: true,
    noDnsAction: true,
    noRollbackAuthorization: true,
    noPublicLaunchAuthorization: true,
    noDeployAction: true,
    noPublishAction: true,
    noHumanApprovalPath: true,
    exportEligible: false,
    downloadEligible: false,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
  };
}

function deployContinuationHandoffState(coldStartArchive) {
  const archiveReady = coldStartArchive?.state === "read-only-archive-ready";
  return {
    state: archiveReady ? "read-only-continuation-blocked" : "blocked-cold-start-archive",
    archiveReady,
    mapPath: "../ops/deploy/private-release-candidate-deploy-continuation-map.md",
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    blockedLabels: deployContinuationBlockedLabels,
    hardStops: deployContinuationHardStops,
    explicitHumanApprovalObserved: false,
    platformInputsEnabled: false,
    platformFieldUnlock: false,
    localOnly: true,
    private: true,
    readOnly: true,
    noSecretStorage: true,
    noProductionUrl: true,
    noCredential: true,
    noDeployTrigger: true,
    noDashboardAction: true,
    noDnsAction: true,
    noRollbackAuthorization: true,
    noPublicLaunchAuthorization: true,
    noDeployAction: true,
    noPublishAction: true,
    noHumanApprovalPath: true,
    exportEligible: false,
    downloadEligible: false,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
  };
}

function externalInputBoundaryHandoffState(deployContinuation) {
  const continuationReady = deployContinuation?.state === "read-only-continuation-blocked";
  return {
    state: continuationReady ? "read-only-external-input-boundary" : "blocked-deploy-continuation",
    continuationReady,
    ledgerPath: "../ops/deploy/private-external-input-boundary-ledger.md",
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    artifacts: externalInputBoundaryArtifacts,
    notObservedFacts: externalInputBoundaryNotObservedFacts,
    hardStops: externalInputBoundaryHardStops,
    explicitHumanApprovalObserved: false,
    platformInputsEnabled: false,
    platformFieldUnlock: false,
    canRequestExternalValues: false,
    localOnly: true,
    private: true,
    readOnly: true,
    noSecretStorage: true,
    noProductionUrl: true,
    noCredential: true,
    noDeployTrigger: true,
    noDashboardAction: true,
    noDnsAction: true,
    noRollbackAuthorization: true,
    noPublicLaunchAuthorization: true,
    noDeployAction: true,
    noPublishAction: true,
    noHumanApprovalPath: true,
    exportEligible: false,
    downloadEligible: false,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
  };
}

function platformOwnerNonRequestTransferHandoffState(externalInputBoundary) {
  const boundaryReady = externalInputBoundary?.state === "read-only-external-input-boundary";
  return {
    state: boundaryReady ? "read-only-non-request-transfer" : "blocked-external-input-boundary",
    boundaryReady,
    transferNotePath: "../ops/deploy/private-platform-owner-non-request-transfer-note.md",
    ledgerPath: "../ops/deploy/private-external-input-boundary-ledger.md",
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    artifacts: platformOwnerNonRequestTransferArtifacts,
    nonRequests: platformOwnerNonRequestTransferNonRequests,
    hardStops: platformOwnerNonRequestTransferHardStops,
    explicitHumanApprovalObserved: false,
    platformInputsEnabled: false,
    platformFieldUnlock: false,
    canRequestExternalValues: false,
    canRequestPlatformValues: false,
    impliedExecution: false,
    localOnly: true,
    private: true,
    readOnly: true,
    noSecretStorage: true,
    noProductionUrl: true,
    noCredential: true,
    noDeployTrigger: true,
    noDashboardAction: true,
    noDnsAction: true,
    noRollbackAuthorization: true,
    noPublicLaunchAuthorization: true,
    noDeployAction: true,
    noPublishAction: true,
    noHumanApprovalPath: true,
    exportEligible: false,
    downloadEligible: false,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
  };
}

function operatorResumePacketGuardrailHandoffState(platformOwnerNonRequestTransfer) {
  const transferReady = platformOwnerNonRequestTransfer?.state === "read-only-non-request-transfer";
  return {
    state: transferReady ? "read-only-operator-resume-packet-guardrail" : "blocked-platform-owner-transfer",
    transferReady,
    guardrailPath: "../ops/deploy/private-operator-resume-packet-guardrail.md",
    sourceNotePath: "../ops/deploy/private-platform-owner-non-request-transfer-note.md",
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    references: operatorResumePacketGuardrailReferences,
    rules: operatorResumePacketGuardrailRules,
    hardStops: operatorResumePacketGuardrailHardStops,
    explicitHumanApprovalObserved: false,
    platformInputsEnabled: false,
    platformFieldUnlock: false,
    canRequestExternalValues: false,
    canRequestPlatformValues: false,
    impliedExecution: false,
    localOnly: true,
    private: true,
    readOnly: true,
    noSecretStorage: true,
    noProductionUrl: true,
    noCredential: true,
    noDeployTrigger: true,
    noDashboardAction: true,
    noDnsAction: true,
    noRollbackAuthorization: true,
    noPublicLaunchAuthorization: true,
    noDeployAction: true,
    noPublishAction: true,
    noHumanApprovalPath: true,
    exportEligible: false,
    downloadEligible: false,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
  };
}

function blockedStateOperatorContinuationIndexHandoffState(operatorResumePacketGuardrail) {
  const guardrailReady = operatorResumePacketGuardrail?.state === "read-only-operator-resume-packet-guardrail";
  return {
    state: guardrailReady ? "read-only-blocked-state-operator-continuation-index" : "blocked-operator-resume-packet-guardrail",
    guardrailReady,
    indexPath: "../ops/deploy/private-blocked-state-operator-continuation-index.md",
    guardrailPath: "../ops/deploy/private-operator-resume-packet-guardrail.md",
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    labels: blockedStateOperatorContinuationIndexLabels,
    notObservedFacts: blockedStateOperatorContinuationIndexNotObservedFacts,
    hardStops: blockedStateOperatorContinuationIndexHardStops,
    explicitHumanApprovalObserved: false,
    platformInputsEnabled: false,
    platformFieldUnlock: false,
    canRequestExternalValues: false,
    canRequestPlatformValues: false,
    impliedExecution: false,
    localOnly: true,
    private: true,
    readOnly: true,
    noSecretStorage: true,
    noProductionUrl: true,
    noCredential: true,
    noDeployTrigger: true,
    noDashboardAction: true,
    noDnsAction: true,
    noRollbackAuthorization: true,
    noPublicLaunchAuthorization: true,
    noDeployAction: true,
    noPublishAction: true,
    noHumanApprovalPath: true,
    exportEligible: false,
    downloadEligible: false,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
  };
}

function autonomousDeployStopLedgerHandoffState(blockedStateOperatorContinuationIndex) {
  const indexReady = blockedStateOperatorContinuationIndex?.state === "read-only-blocked-state-operator-continuation-index";
  return {
    state: indexReady ? "read-only-autonomous-deploy-stop-ledger" : "blocked-state-continuation-index-required",
    indexReady,
    ledgerPath: "../ops/deploy/private-autonomous-deploy-stop-ledger.md",
    indexPath: "../ops/deploy/private-blocked-state-operator-continuation-index.md",
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    surfaces: autonomousDeployStopLedgerSurfaces,
    notObservedFacts: autonomousDeployStopLedgerNotObservedFacts,
    hardStops: autonomousDeployStopLedgerHardStops,
    explicitHumanApprovalObserved: false,
    platformInputsEnabled: false,
    platformFieldUnlock: false,
    canRequestExternalValues: false,
    canRequestPlatformValues: false,
    impliedExecution: false,
    autonomousStop: true,
    nonRequest: true,
    nonExecutable: true,
    localOnly: true,
    private: true,
    readOnly: true,
    noSecretStorage: true,
    noProductionUrl: true,
    noCredential: true,
    noDeployTrigger: true,
    noDashboardAction: true,
    noDnsAction: true,
    noRollbackAuthorization: true,
    noPublicLaunchAuthorization: true,
    noDeployAction: true,
    noPublishAction: true,
    noHumanApprovalPath: true,
    exportEligible: false,
    downloadEligible: false,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
  };
}

function postAutonomousStopRecoveryChecklistHandoffState(autonomousDeployStopLedger) {
  const ledgerReady = autonomousDeployStopLedger?.state === "read-only-autonomous-deploy-stop-ledger";
  return {
    state: ledgerReady ? "read-only-post-autonomous-stop-recovery-checklist" : "autonomous-deploy-stop-ledger-required",
    ledgerReady,
    checklistPath: "../ops/deploy/private-post-autonomous-stop-recovery-checklist.md",
    ledgerPath: "../ops/deploy/private-autonomous-deploy-stop-ledger.md",
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    surfaces: postAutonomousStopRecoveryChecklistSurfaces,
    notObservedFacts: postAutonomousStopRecoveryChecklistNotObservedFacts,
    hardStops: postAutonomousStopRecoveryChecklistHardStops,
    explicitHumanApprovalObserved: false,
    platformInputsEnabled: false,
    platformFieldUnlock: false,
    canRequestExternalValues: false,
    canRequestPlatformValues: false,
    impliedExecution: false,
    autonomousRecovery: true,
    nonRequest: true,
    nonExecutable: true,
    localOnly: true,
    private: true,
    readOnly: true,
    noSecretStorage: true,
    noProductionUrl: true,
    noCredential: true,
    noDeployTrigger: true,
    noDashboardAction: true,
    noDnsAction: true,
    noRollbackAuthorization: true,
    noPublicLaunchAuthorization: true,
    noDeployAction: true,
    noPublishAction: true,
    noHumanApprovalPath: true,
    exportEligible: false,
    downloadEligible: false,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
  };
}

function humanPlatformAuthorityReEntryGateHandoffState(postAutonomousStopRecoveryChecklist) {
  const recoveryReady = postAutonomousStopRecoveryChecklist?.state === "read-only-post-autonomous-stop-recovery-checklist";
  return {
    state: recoveryReady ? "read-only-human-platform-authority-re-entry-gate" : "post-autonomous-stop-recovery-checklist-required",
    recoveryReady,
    gatePath: "../ops/deploy/private-human-platform-authority-re-entry-gate.md",
    checklistPath: "../ops/deploy/private-post-autonomous-stop-recovery-checklist.md",
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    surfaces: humanPlatformAuthorityReEntryGateSurfaces,
    notObservedFacts: humanPlatformAuthorityReEntryGateNotObservedFacts,
    hardStops: humanPlatformAuthorityReEntryGateHardStops,
    explicitHumanApprovalObserved: false,
    humanPlatformAuthorityObserved: false,
    platformInputsEnabled: false,
    platformFieldUnlock: false,
    canRequestExternalValues: false,
    canRequestPlatformValues: false,
    impliedExecution: false,
    authorityBypass: false,
    autonomousRecovery: true,
    nonRequest: true,
    nonExecutable: true,
    localOnly: true,
    private: true,
    readOnly: true,
    noSecretStorage: true,
    noProductionUrl: true,
    noCredential: true,
    noDeployTrigger: true,
    noDashboardAction: true,
    noDnsAction: true,
    noRollbackAuthorization: true,
    noPublicLaunchAuthorization: true,
    noDeployAction: true,
    noPublishAction: true,
    noHumanApprovalPath: true,
    exportEligible: false,
    downloadEligible: false,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
  };
}

function outsideAuthorityAwaitingStateLedgerHandoffState(humanPlatformAuthorityReEntryGate) {
  const gateReady = humanPlatformAuthorityReEntryGate?.state === "read-only-human-platform-authority-re-entry-gate";
  return {
    state: gateReady ? "read-only-outside-authority-awaiting-state-ledger" : "human-platform-authority-re-entry-gate-required",
    gateReady,
    ledgerPath: "../ops/deploy/private-outside-authority-awaiting-state-ledger.md",
    gatePath: "../ops/deploy/private-human-platform-authority-re-entry-gate.md",
    decision: "No-Go / Do Not Deploy",
    productionDeploymentState: "Do Not Deploy",
    surfaces: outsideAuthorityAwaitingStateLedgerSurfaces,
    notObservedFacts: outsideAuthorityAwaitingStateLedgerNotObservedFacts,
    hardStops: outsideAuthorityAwaitingStateLedgerHardStops,
    explicitHumanApprovalObserved: false,
    humanPlatformAuthorityObserved: false,
    platformInputsEnabled: false,
    platformFieldUnlock: false,
    canRequestExternalValues: false,
    canRequestPlatformValues: false,
    impliedExecution: false,
    authorityBypass: false,
    autonomousRecovery: true,
    nonRequest: true,
    nonExecutable: true,
    localOnly: true,
    private: true,
    readOnly: true,
    noSecretStorage: true,
    noProductionUrl: true,
    noCredential: true,
    noDeployTrigger: true,
    noDashboardAction: true,
    noDnsAction: true,
    noRollbackAuthorization: true,
    noPublicLaunchAuthorization: true,
    noDeployAction: true,
    noPublishAction: true,
    noHumanApprovalPath: true,
    exportEligible: false,
    downloadEligible: false,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
  };
}

function savePrivateLaunchDecisionApproval(intakeId, fields) {
  const intakes = loadIntakes();
  const index = intakes.findIndex((intake) => intake?.id === intakeId);
  if (index === -1) return null;
  const current = intakes[index];
  const state = privateLaunchDecisionApprovalState(intakes, current);
  if (!state.memoComplete) return null;
  const updatedAt = nowIso();
  const launchDecision = safeText(fields?.launchDecision);
  const reviewer = safeText(fields?.reviewer);
  const approvalNotes = safeText(fields?.approvalNotes);
  intakes[index] = {
    ...current,
    updatedAt,
    privateLaunchDecisionApproval: {
      format: "proofresume-private-launch-decision-approval-v1",
      state: launchDecision || reviewer || approvalNotes ? "approval-drafted" : "memo-ready",
      launchDecision,
      reviewer,
      approvalNotes,
      selectedDraftId: current.id,
      sourceDecisionMemoUpdatedAt: state.memoState.updatedAt,
      sourceDecisionMemoReviewedDecision: state.memoState.reviewedDecision,
      sourceDecisionMemoConfidence: state.memoState.evidenceConfidence,
      source: "local-private-launch-decision-approval-capture",
      localOnly: true,
      private: true,
      exportEligible: false,
      downloadEligible: false,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      publicProductCopyUnchanged: true,
      conclusionGuard:
        "This local approval records only a private publish/no-publish review; it does not change public/product copy or resume export/download text.",
      updatedAt,
    },
  };
  saveIntakes(intakes);
  return intakes[index];
}

function clearPrivateLaunchDecisionApproval(intakeId) {
  return savePrivateLaunchDecisionApproval(intakeId, {
    launchDecision: "",
    reviewer: "",
    approvalNotes: "",
  });
}

function savePrivateExplicitPublishPlan(intakeId, fields) {
  const intakes = loadIntakes();
  const index = intakes.findIndex((intake) => intake?.id === intakeId);
  if (index === -1) return null;
  const current = intakes[index];
  const state = privateExplicitPublishPlanState(current);
  if (!state.checklistComplete) return null;
  const updatedAt = nowIso();
  const owner = safeText(fields?.owner);
  const rollback = safeText(fields?.rollback);
  const claimRisk = safeText(fields?.claimRisk);
  const publicCopyDiff = safeText(fields?.publicCopyDiff);
  intakes[index] = {
    ...current,
    updatedAt,
    privateExplicitPublishPlan: {
      format: "proofresume-private-explicit-publish-plan-v1",
      state: owner || rollback || claimRisk || publicCopyDiff ? "plan-drafted" : "readiness-complete",
      owner,
      rollback,
      claimRisk,
      publicCopyDiff,
      selectedDraftId: current.id,
      sourcePublishReadinessChecklistState: state.readiness.state,
      sourcePublishReadinessChecklistCompletedAt: state.readiness.completedAt,
      sourcePublishReadinessChecklistPath: state.readiness.checklistPath,
      source: "local-private-explicit-publish-plan-capture",
      localOnly: true,
      private: true,
      exportEligible: false,
      downloadEligible: false,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      publicProductCopyUnchanged: true,
      noPublishAction: true,
      conclusionGuard:
        "This local publish plan captures private owner, rollback, claim-risk, and public-copy-diff notes only; it does not publish or change public/product copy.",
      updatedAt,
    },
  };
  saveIntakes(intakes);
  return intakes[index];
}

function clearPrivateExplicitPublishPlan(intakeId) {
  return savePrivateExplicitPublishPlan(intakeId, {
    owner: "",
    rollback: "",
    claimRisk: "",
    publicCopyDiff: "",
  });
}

function savePrivatePublicCopyDiffRollback(intakeId, fields) {
  const intakes = loadIntakes();
  const index = intakes.findIndex((intake) => intake?.id === intakeId);
  if (index === -1) return null;
  const current = intakes[index];
  const state = privatePublicCopyDiffRollbackState(current);
  if (!state.planComplete) return null;
  const updatedAt = nowIso();
  const diffSummary = safeText(fields?.diffSummary);
  const consentCheck = safeText(fields?.consentCheck);
  const claimRiskCheck = safeText(fields?.claimRiskCheck);
  const validationCommand = safeText(fields?.validationCommand);
  const rollbackPath = safeText(fields?.rollbackPath);
  intakes[index] = {
    ...current,
    updatedAt,
    privatePublicCopyDiffRollback: {
      format: "proofresume-private-public-copy-diff-rollback-v1",
      state: diffSummary || consentCheck || claimRiskCheck || validationCommand || rollbackPath ? "diff-packet-drafted" : "publish-plan-complete",
      diffSummary,
      consentCheck,
      claimRiskCheck,
      validationCommand,
      rollbackPath,
      selectedDraftId: current.id,
      sourceExplicitPublishPlanUpdatedAt: state.planState.updatedAt,
      sourceExplicitPublishPlanOwner: state.planState.owner,
      sourceExplicitPublishPlanState: state.planState.state,
      source: "local-private-public-copy-diff-rollback-capture",
      localOnly: true,
      private: true,
      exportEligible: false,
      downloadEligible: false,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      publicProductCopyUnchanged: true,
      noPublishAction: true,
      conclusionGuard:
        "This local packet records private diff, consent, claim-risk, validation, and rollback checks only; it does not publish or change public/product copy.",
      updatedAt,
    },
  };
  saveIntakes(intakes);
  return intakes[index];
}

function clearPrivatePublicCopyDiffRollback(intakeId) {
  return savePrivatePublicCopyDiffRollback(intakeId, {
    diffSummary: "",
    consentCheck: "",
    claimRiskCheck: "",
    validationCommand: "",
    rollbackPath: "",
  });
}

function savePrivateReleaseCandidateRehearsal(intakeId, fields) {
  const intakes = loadIntakes();
  const index = intakes.findIndex((intake) => intake?.id === intakeId);
  if (index === -1) return null;
  const current = intakes[index];
  const state = privateReleaseCandidateRehearsalState(current);
  if (!state.diffPacketComplete) return null;
  const updatedAt = nowIso();
  const localStaticSmoke = safeText(fields?.localStaticSmoke);
  const servedSmoke = safeText(fields?.servedSmoke);
  const rollbackRehearsal = safeText(fields?.rollbackRehearsal);
  const consentCheck = safeText(fields?.consentCheck);
  const claimRiskCheck = safeText(fields?.claimRiskCheck);
  intakes[index] = {
    ...current,
    updatedAt,
    privateReleaseCandidateRehearsal: {
      format: "proofresume-private-release-candidate-rehearsal-v1",
      state: localStaticSmoke || servedSmoke || rollbackRehearsal || consentCheck || claimRiskCheck ? "rehearsal-ready" : "diff-packet-complete",
      rehearsalReady: Boolean(localStaticSmoke || servedSmoke || rollbackRehearsal || consentCheck || claimRiskCheck),
      localStaticSmoke,
      servedSmoke,
      rollbackRehearsal,
      consentCheck,
      claimRiskCheck,
      fields: {
        localStaticSmoke,
        localServedSmoke: servedSmoke,
        rollbackRehearsal,
        consentCheck,
        claimRiskCheck,
      },
      publicDeployAllowed: false,
      conclusionFields: {
        launchConclusion: "not-observed",
        pricingDecision: "not-observed",
        testimonialDecision: "not-observed",
        demandConclusion: "not-observed",
        willingnessToPayConclusion: "not-observed",
        secureIntakeConclusion: "not-observed",
        outcomeConclusion: "not-observed",
      },
      requestAudit: {
        expectedExternalRequests: 0,
        expectedApiRequests: 0,
        expectedSubmitRequests: 0,
      },
      selectedDraftId: current.id,
      sourcePublicCopyDiffRollbackUpdatedAt: state.diffState.updatedAt,
      sourcePublicCopyDiffRollbackValidationCommand: state.diffState.validationCommand,
      sourcePublicCopyDiffRollbackState: state.diffState.state,
      source: "local-private-release-candidate-rehearsal-capture",
      localOnly: true,
      private: true,
      exportEligible: false,
      downloadEligible: false,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      publicProductCopyUnchanged: true,
      noPublishAction: true,
      conclusionGuard:
        "This local release-candidate rehearsal records private static smoke, served smoke, rollback rehearsal, consent, and claim-risk checks only; it does not deploy, publish, export, download, or change public/product copy.",
      updatedAt,
    },
  };
  saveIntakes(intakes);
  return intakes[index];
}

function clearPrivateReleaseCandidateRehearsal(intakeId) {
  return savePrivateReleaseCandidateRehearsal(intakeId, {
    localStaticSmoke: "",
    servedSmoke: "",
    rollbackRehearsal: "",
    consentCheck: "",
    claimRiskCheck: "",
  });
}

function savePrivateCredentialedDeployReadiness(intakeId, fields) {
  const intakes = loadIntakes();
  const index = intakes.findIndex((intake) => intake?.id === intakeId);
  if (index === -1) return null;
  const current = intakes[index];
  const state = privateCredentialedDeployReadinessState(current);
  if (!state.rehearsalComplete) return null;
  const updatedAt = nowIso();
  const explicitHumanApprovalObserved = Boolean(
    fields?.explicitHumanApprovalObserved && safeText(fields?.explicitHumanApprovalSource) === "external-human-approval"
  );
  const platform = safeText(fields?.platform);
  const productionUrl = safeText(fields?.productionUrl);
  const credentialAvailability = safeText(fields?.credentialAvailability);
  const deployTrigger = safeText(fields?.deployTrigger);
  const rollbackOwner = safeText(fields?.rollbackOwner);
  const rollbackMethod = safeText(fields?.rollbackMethod);
  const healthCheckInputs = safeText(fields?.healthCheckInputs);
  const missingInputs = Object.entries({
    platform,
    productionUrl,
    credentialAvailability,
    deployTrigger,
    rollbackOwner,
    rollbackMethod,
    healthCheckInputs,
  })
    .filter(([, value]) => !value.trim())
    .map(([key]) => credentialedDeployReadinessFieldLabels[key]);
  intakes[index] = {
    ...current,
    updatedAt,
    privateCredentialedDeployReadiness: {
      format: "proofresume-private-credentialed-deploy-readiness-v1",
      state: !explicitHumanApprovalObserved ? "human-approval-blocked" : missingInputs.length ? "deploy-inputs-blocked" : "deploy-inputs-ready",
      explicitHumanApprovalObserved,
      explicitHumanApprovalSource: explicitHumanApprovalObserved ? "external-human-approval" : "",
      platform,
      productionUrl,
      credentialAvailability,
      deployTrigger,
      rollbackOwner,
      rollbackMethod,
      healthCheckInputs,
      missingInputs,
      inputsComplete: explicitHumanApprovalObserved && missingInputs.length === 0,
      publicDeployAllowed: false,
      credentialsStored: false,
      selectedDraftId: current.id,
      sourceReleaseCandidateRehearsalUpdatedAt: state.rehearsalState.updatedAt,
      sourceReleaseCandidateRehearsalState: state.rehearsalState.state,
      source: "local-private-credentialed-deploy-readiness-review",
      localOnly: true,
      private: true,
      noSecretStorage: true,
      noDeployAction: true,
      noPublishAction: true,
      exportEligible: false,
      downloadEligible: false,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      publicProductCopyUnchanged: true,
      conclusionGuard:
        "This local deploy readiness review records private platform and operator inputs only; it stores no secrets and does not deploy, publish, export, download, or change public/product copy.",
      updatedAt,
    },
  };
  saveIntakes(intakes);
  return intakes[index];
}

function clearPrivateCredentialedDeployReadiness(intakeId) {
  return savePrivateCredentialedDeployReadiness(intakeId, {
    explicitHumanApprovalObserved: false,
    platform: "",
    productionUrl: "",
    credentialAvailability: "",
    deployTrigger: "",
    rollbackOwner: "",
    rollbackMethod: "",
    healthCheckInputs: "",
  });
}

function savePrivateSynthesisArtifact(intakeId) {
  const intakes = loadIntakes();
  const index = intakes.findIndex((intake) => intake?.id === intakeId);
  if (index === -1) return null;
  const current = intakes[index];
  const state = fiveSessionSynthesisReadinessState(intakes, current);
  if (!state.ready) return null;
  const artifactText = synthesisArtifactText(state, intakes);
  const generatedAt = nowIso();
  const artifact = {
    format: "proofresume-private-five-session-synthesis-artifact-v1",
    localOnly: true,
    exportTextUnchanged: true,
    downloadTextUnchanged: true,
    exportEligible: false,
    downloadEligible: false,
    selectedDraftId: current.id,
    sourcePacketCount: state.completeSlots,
    requiredPacketCount: state.requiredSlots,
    sourcePacketIds: state.slots.filter((slot) => slot.complete).map((slot) => slot.intakeId),
    summaryText: artifactText,
    artifactText,
    generatedAt,
    reviewRequired: true,
  };
  intakes[index] = {
    ...current,
    updatedAt: generatedAt,
    privateSynthesisArtifactGenerator: {
      localOnly: true,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      selectedDraftId: current.id,
      sourcePacketCount: state.completeSlots,
      requiredPacketCount: state.requiredSlots,
      exportEligible: false,
      source: "local-private-synthesis-artifact-generator",
      state: "artifact-drafted",
      readyToGenerate: true,
      artifactDrafted: true,
      blockers: [],
      artifact,
    },
    privateSynthesisArtifact: {
      ...artifact,
      evidencePacketCount: state.completeSlots,
      requiredEvidencePacketCount: state.requiredSlots,
      sessionPacketIds: artifact.sourcePacketIds,
      private: true,
      source: "five-session-local-private-synthesis-artifact-generator",
      conclusionGuard:
        "No launch, pricing, testimonial, willingness-to-pay, demand, or outcome conclusion is created by this private draft.",
    },
  };
  saveIntakes(intakes);
  return intakes[index];
}

function saveObjectionCodingHandoff(intakeId, fields) {
  const intakes = loadIntakes();
  const index = intakes.findIndex((intake) => intake?.id === intakeId);
  if (index === -1) return null;
  const current = intakes[index];
  if (!postSessionDebriefHandoffRecord(current).hasDraft) return null;
  const tags = objectionTagsFromText(fields?.tags);
  const synthesisNote = safeText(fields?.synthesisNote);
  intakes[index] = {
    ...current,
    updatedAt: nowIso(),
    objectionCodingHandoff: {
      privateObjectionTags: tags,
      privateObjectionTagsText: tags.join(", "),
      synthesisNote,
      state: tags.length || synthesisNote.trim() ? "codes-recorded" : "debrief-ready",
      updatedAt: nowIso(),
      localOnly: true,
      private: true,
      exportEligible: false,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      source: "post-debrief-local-objection-coding-handoff",
      linkedArtifacts: ["objection-rubric", "synthesis-template"],
    },
  };
  saveIntakes(intakes);
  return intakes[index];
}

function clearObjectionCodingHandoff(intakeId) {
  return saveObjectionCodingHandoff(intakeId, { tags: "", synthesisNote: "" });
}

function saveFirstReplyFactState(intakeId, state) {
  const normalized = ["accepted", "declined", "reschedule", "question-only", "no-response"].includes(state) ? state : "unobserved";
  const intakes = loadIntakes();
  const index = intakes.findIndex((intake) => intake?.id === intakeId);
  if (index === -1) return null;
  const current = intakes[index];
  intakes[index] = {
    ...current,
    updatedAt: nowIso(),
    firstReplyFactCapture:
      normalized === "unobserved"
        ? {
            ...(current.firstReplyFactCapture || {}),
            localOnly: true,
            exportTextUnchanged: true,
            observedState: "Not observed",
            rawReplyText: "",
            capturedFacts: [],
            source: "first-reply-local-operator-action",
          }
        : {
            ...(current.firstReplyFactCapture || {}),
            localOnly: true,
            exportTextUnchanged: true,
            observedState: "Observed",
            rawReplyText: firstReplyFactLabel(normalized),
            capturedAt: nowIso(),
            source: "first-reply-local-operator-action",
            capturedFacts: [
              {
                key: `first-reply-state:${normalized}`,
                label: "Reply state",
                text: `Captured first-reply fact: ${firstReplyFactLabel(normalized)}.`,
                value: normalized,
                exportEligible: false,
                source: "first reply",
              },
            ],
          },
    firstReplyFacts:
      normalized === "unobserved"
        ? {
            state: "unobserved",
            updatedAt: nowIso(),
            localOnly: true,
            exportTextUnchanged: true,
            explicitOperatorAction: "required",
          }
        : {
            state: normalized,
            updatedAt: nowIso(),
            localOnly: true,
            exportTextUnchanged: true,
            explicitOperatorAction: "recorded",
          },
  };
  saveIntakes(intakes);
  return intakes[index];
}

function saveAppointmentSessionStartGate(intakeId, updates) {
  const intakes = loadIntakes();
  const index = intakes.findIndex((intake) => intake?.id === intakeId);
  if (index === -1) return null;
  const current = intakes[index];
  const existing =
    current.appointmentSessionStartGate && typeof current.appointmentSessionStartGate === "object"
      ? current.appointmentSessionStartGate
      : {};
  intakes[index] = {
    ...current,
    updatedAt: nowIso(),
    appointmentSessionStartGate: {
      ...existing,
      ...updates,
      updatedAt: nowIso(),
      localOnly: true,
      exportTextUnchanged: true,
      source: "appointment-confirmed-session-start-local-gate",
    },
  };
  saveIntakes(intakes);
  return intakes[index];
}

function emptyProofPacketRedactions() {
  return {
    updatedAt: nowIso(),
    sourceExcerpts: {},
    followupNotes: {},
  };
}

function clearProofPacketSnapshotFields(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const next = {
    ...snapshot,
    proofPacketRedactionsUpdatedAt: null,
  };

  delete next.proofPacketPreview;
  delete next.proofPacketSnapshot;

  if (next.claimRiskChecklist && typeof next.claimRiskChecklist === "object" && Array.isArray(next.claimRiskChecklist.items)) {
    next.claimRiskChecklist = {
      ...next.claimRiskChecklist,
      items: next.claimRiskChecklist.items.map((item) => ({
        ...item,
        sourceExcerptRedacted: false,
      })),
    };
  }

  if (next.followups && typeof next.followups === "object" && Array.isArray(next.followups.evidenceItems)) {
    next.followups = {
      ...next.followups,
      evidenceItems: next.followups.evidenceItems.map((item) => ({
        ...item,
        redacted: false,
      })),
    };
  }

  if (Array.isArray(next.sections)) {
    next.sections = next.sections.map((section) => ({
      ...section,
      accepted: Array.isArray(section.accepted)
        ? section.accepted.map((item) => ({
            ...item,
            redacted: false,
          }))
        : section.accepted,
    }));
  }

  return next;
}

function renderAnalysis(intake, message) {
  const panel = document.querySelector("#local-analysis");
  const reviewLink = document.querySelector("[data-pr='reviewLink']");
  const status = document.querySelector("#intake-status");
  const boundary = materialBoundaryFor(intake);
  if (!panel || !intake) return;

  const analysis = intake.analysis || buildAnalysis(intake.normalizedText || intake.rawText, intake.targetRole);
  panel.hidden = false;

  const boundaryPanel = document.querySelector("[data-pr='userDataBoundary'], [data-pr='intakeBoundary']");
  const boundaryLabel = document.querySelector("[data-pr='intakeBoundaryKind']");
  const boundaryCopy = document.querySelector("[data-pr='intakeBoundaryCopy']");
  if (boundaryPanel) {
    boundaryPanel.setAttribute("data-material-boundary", boundary.kind);
    boundaryPanel.setAttribute("data-user-data-boundary", intake.isDemo ? "not-user-provided" : "pasted-resume-text");
    boundaryPanel.setAttribute("data-sample-data-boundary", intake.isDemo ? "demo-sample-loaded" : "separate-demo-sample");
  }
  if (boundaryLabel) {
    boundaryLabel.className = `status-pill ${intake.isDemo ? "is-pending" : "is-approved"}`;
    boundaryLabel.textContent = boundary.label;
  }
  setText(boundaryCopy, boundary.copy);

  setText(document.querySelector("[data-pr='wordCount']"), String(analysis.wordCount));
  setText(document.querySelector("[data-pr='sectionCount']"), String(analysis.sections.length));
  setText(document.querySelector("[data-pr='promptCount']"), String(analysis.prompts.length));
  const extraction = analysis.structuredExtraction || intake.structuredExtraction || buildStructuredExtraction(intake.normalizedText || intake.rawText);
  const structuredFacts = structuredFactRowsForExtraction(extraction);
  const structuredApprovedCount = structuredFacts.filter((row) => structuredFactApprovalRecord(intake, row.key).sourceApproved).length;
  const structuredPromotedCount = structuredFacts.filter((row) => isStructuredFactPromoted(intake, row.key)).length;
  const structuredSummaryTail =
    structuredFacts.length === 0
      ? "Structured extraction starts Unapproved and export-ineligible."
      : structuredApprovedCount || structuredPromotedCount
      ? `${structuredApprovedCount} source line${structuredApprovedCount === 1 ? "" : "s"} approved; ${structuredPromotedCount} promoted for candidate review. Unapproved or unpromoted structured facts stay export/download/snapshot ineligible until approved + promoted in the draft report.`
      : "All start Unapproved and export-ineligible until you approve and promote them in the draft report.";
  setText(
    document.querySelector("[data-pr='structuredExtractionSummary']"),
    `${extraction.summary.experienceItemCount} experience item${extraction.summary.experienceItemCount === 1 ? "" : "s"}, ${extraction.summary.bulletCount} sourced bullet${extraction.summary.bulletCount === 1 ? "" : "s"} extracted. ${structuredSummaryTail}`
  );
  renderList(document.querySelector("[data-pr='sectionsList']"), analysis.sections, "No common resume sections detected yet.");
  renderList(document.querySelector("[data-pr='promptsList']"), analysis.prompts, "No missing evidence prompts from this simple pass.");
  setText(
    document.querySelector("[data-pr='storageNote']"),
    `Saved locally as ${intake.id}. Source: ${boundary.storageLabel}. Stored in this browser's localStorage only; no external service was contacted.`
  );

  if (reviewLink) {
    reviewLink.setAttribute("href", `/review.html?intake=${encodeURIComponent(intake.id)}`);
  }

  if (status) {
    status.textContent = message || "Saved locally and analyzed in this browser. No external service was contacted.";
  }
}

function structuredFactKey(kind, id, lineNumber, sourceLine) {
  const safeKind = String(kind || "fact").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const safeId = String(id || "item").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const safeLine = String(sourceLine || "").trim().slice(0, 100);
  return `structured:${safeKind}:${safeId}:${Number(lineNumber || 0)}:${safeLine}`;
}

function structuredFactRowsForExtraction(extraction) {
  const safeExtraction = extraction && typeof extraction === "object" ? extraction : {};
  const items = Array.isArray(safeExtraction.experienceItems) ? safeExtraction.experienceItems : [];
  return items.flatMap((item) => {
    const itemSourceLine = item?.sourceLine || [item?.title, item?.company, item?.dates].filter(Boolean).join(" ");
    const itemKey = structuredFactKey("item", item?.id, item?.lineNumber, itemSourceLine);
    const rows = [
      {
        kind: "item",
        key: itemKey,
        id: item?.id || "",
        sourceLine: itemSourceLine || "",
        lineNumber: item?.lineNumber || 0,
      },
    ];
    for (const bullet of item?.bullets || []) {
      const bulletSource = bullet?.sourceLine || bullet?.text || "";
      const bulletKey = structuredFactKey("bullet", bullet?.id, bullet?.lineNumber, bulletSource);
      rows.push({
        kind: "bullet",
        key: bulletKey,
        id: bullet?.id || "",
        sourceLine: bulletSource,
        lineNumber: bullet?.lineNumber || 0,
      });
    }
    return rows.filter((row) => row.sourceLine);
  });
}

function structuredFactApprovalRecord(intake, key) {
  const facts =
    intake?.approvals?.structuredFacts && typeof intake.approvals.structuredFacts === "object"
      ? intake.approvals.structuredFacts
      : {};
  const record = key && facts[key] && typeof facts[key] === "object" ? facts[key] : {};
  return {
    sourceApproved: Boolean(record.sourceApproved),
    promoted: Boolean(record.promoted),
  };
}

function isStructuredFactPromoted(intake, key) {
  const record = structuredFactApprovalRecord(intake, key);
  return Boolean(record.sourceApproved && record.promoted);
}

function main() {
  const form = document.querySelector("#intake-form");
  const status = document.querySelector("#intake-status");
  const clearButton = document.querySelector("#clear-intake");
  const demoButton = document.querySelector("#load-demo");
  const resetDemoButton = document.querySelector("#reset-demo-drafts");
  const resetUserButton = document.querySelector("#reset-user-drafts");
  const resetRedactionsButton = document.querySelector("#reset-redactions");
  const resetAllButton = document.querySelector("#reset-all");
  const reanalyzeButton = document.querySelector("[data-pr='reanalyze']");
  const sessionPrepPanel = document.querySelector("[data-pr='sessionPrepChecklist']");
  const sessionPrepStatus = document.querySelector("[data-pr='sessionPrepStatus']");
  const sessionPrepNote = document.querySelector("[data-pr='sessionPrepNote']");
  const operatorHandoffPanel = document.querySelector("[data-pr='operatorHandoffPanel']");
  const operatorHandoffStatus = document.querySelector("[data-pr='operatorHandoffStatus']");
  const operatorHandoffSessionPrep = document.querySelector("[data-pr='operatorHandoffSessionPrepState']");
  const operatorHandoffSelectedDraft = document.querySelector("[data-pr='operatorHandoffSelectedDraft']");
  const operatorHandoffSelectedDraftLink = document.querySelector("[data-pr='operatorHandoffSelectedDraftLink']");
  const operatorHandoffPacketReadiness = document.querySelector("[data-pr='operatorHandoffPacketReadiness']");
  const operatorHandoffPacketLink = document.querySelector("[data-pr='operatorHandoffPacketLink']");
  const operatorHandoffNote = document.querySelector("[data-pr='operatorHandoffNote']");
  const dispatchBoard = document.querySelector("[data-pr='firstRecruitDispatchBoard']");
  const dispatchNoSendStatus = document.querySelector("[data-pr='dispatchNoSendStatus']");
  const dispatchReadinessState = document.querySelector("[data-pr='dispatchReadinessState']");
  const dispatchTrackerState = document.querySelector("[data-pr='dispatchTrackerState']");
  const dispatchConsentState = document.querySelector("[data-pr='dispatchConsentState']");
  const dispatchSelectedDraft = document.querySelector("[data-pr='dispatchSelectedDraft']");
  const dispatchSelectedDraftLink = document.querySelector("[data-pr='dispatchSelectedDraftLink']");
  const dispatchBoardNote = document.querySelector("[data-pr='dispatchBoardNote']");
  const triageBoard = document.querySelector("[data-pr='firstReplyTriageBoard']");
  const triageNoReplyStatus = document.querySelector("[data-pr='triageNoReplyStatus']");
  const triageTemplateState = document.querySelector("[data-pr='triageTemplateState']");
  const triageTrackerState = document.querySelector("[data-pr='triageTrackerState']");
  const triageConsentState = document.querySelector("[data-pr='triageConsentState']");
  const triageRawNotesState = document.querySelector("[data-pr='triageRawNotesState']");
  const triageSelectedDraft = document.querySelector("[data-pr='triageSelectedDraft']");
  const triageSelectedDraftLink = document.querySelector("[data-pr='triageSelectedDraftLink']");
  const triageBoardNote = document.querySelector("[data-pr='triageBoardNote']");
  const firstReplyFactPanel = document.querySelector("[data-pr='firstReplyFactCapturePanel']");
  const firstReplyFactStatus = document.querySelector("[data-pr='firstReplyFactStatus']");
  const firstReplyFactList = document.querySelector("[data-pr='firstReplyFactList']");
  const firstReplyFactNote = document.querySelector("[data-pr='firstReplyFactNote']");
  const schedulingReadinessPanel = document.querySelector("[data-pr='localSchedulingReadinessPanel']");
  const schedulingReadinessStatus = document.querySelector("[data-pr='schedulingReadinessStatus']");
  const schedulingConsentReadinessState = document.querySelector("[data-pr='schedulingConsentReadinessState']");
  const acceptedReplyConfirmationState = document.querySelector("[data-pr='acceptedReplyConfirmationState']");
  const redactedMaterialPrepState = document.querySelector("[data-pr='redactedMaterialPrepState']");
  const rawNotePrepReadinessState = document.querySelector("[data-pr='rawNotePrepReadinessState']");
  const schedulingReadinessNote = document.querySelector("[data-pr='schedulingReadinessNote']");
  const sessionStartGatePanel = document.querySelector("[data-pr='appointmentSessionStartGatePanel']");
  const sessionStartGateStatus = document.querySelector("[data-pr='appointmentSessionStartGateStatus']");
  const sessionStartAppointmentTime = document.querySelector("[data-pr='sessionStartAppointmentTime']");
  const sessionStartCalendarState = document.querySelector("[data-pr='sessionStartCalendarState']");
  const sessionStartAppointmentState = document.querySelector("[data-pr='sessionStartAppointmentState']");
  const sessionStartConsentState = document.querySelector("[data-pr='sessionStartConsentState']");
  const sessionStartRedactedState = document.querySelector("[data-pr='sessionStartRedactedState']");
  const sessionStartRawNoteState = document.querySelector("[data-pr='sessionStartRawNoteState']");
  const sessionStartGateNote = document.querySelector("[data-pr='appointmentSessionStartGateNote']");
  const rawNoteCapturePanel = document.querySelector("[data-pr='firstSessionRawNoteCapturePanel']");
  const rawNoteCaptureStatus = document.querySelector("[data-pr='rawNoteCaptureStatus']");
  const firstSessionRawNotes = document.querySelector("[data-pr='firstSessionRawNotes']");
  const saveFirstSessionRawNotesButton = document.querySelector("[data-pr='saveFirstSessionRawNotes']");
  const clearFirstSessionRawNotesButton = document.querySelector("[data-pr='clearFirstSessionRawNotes']");
  const rawNoteCaptureSummary = document.querySelector("[data-pr='rawNoteCaptureSummary']");
  const rawNoteDebriefState = document.querySelector("[data-pr='rawNoteDebriefState']");
  const rawNoteObjectionCodingState = document.querySelector("[data-pr='rawNoteObjectionCodingState']");
  const rawNoteCaptureNote = document.querySelector("[data-pr='rawNoteCaptureNote']");
  const postSessionDebriefPanel = document.querySelector("[data-pr='postSessionDebriefHandoffPanel']");
  const postSessionDebriefStatus = document.querySelector("[data-pr='postSessionDebriefStatus']");
  const postSessionNextStep = document.querySelector("[data-pr='postSessionNextStep']");
  const postSessionObjectionCode = document.querySelector("[data-pr='postSessionObjectionCode']");
  const postSessionSynthesisCue = document.querySelector("[data-pr='postSessionSynthesisCue']");
  const savePostSessionDebriefButton = document.querySelector("[data-pr='savePostSessionDebrief']");
  const clearPostSessionDebriefButton = document.querySelector("[data-pr='clearPostSessionDebrief']");
  const postSessionDebriefSummary = document.querySelector("[data-pr='postSessionDebriefSummary']");
  const postSessionDebriefTemplateState = document.querySelector("[data-pr='postSessionDebriefTemplateState']");
  const postSessionObjectionCodingState = document.querySelector("[data-pr='postSessionObjectionCodingState']");
  const postSessionSynthesisState = document.querySelector("[data-pr='postSessionSynthesisState']");
  const postSessionDebriefNote = document.querySelector("[data-pr='postSessionDebriefNote']");
  const objectionCodingPanel = document.querySelector("[data-pr='objectionCodingHandoffPanel']");
  const objectionCodingStatus = document.querySelector("[data-pr='objectionCodingStatus']");
  const objectionCodingTags = document.querySelector("[data-pr='objectionCodingTags']");
  const objectionCodingSynthesisNote = document.querySelector("[data-pr='objectionCodingSynthesisNote']");
  const saveObjectionCodingButton = document.querySelector("[data-pr='saveObjectionCoding']");
  const clearObjectionCodingButton = document.querySelector("[data-pr='clearObjectionCoding']");
  const objectionCodingSummary = document.querySelector("[data-pr='objectionCodingSummary']");
  const objectionCodingRubricState = document.querySelector("[data-pr='objectionCodingRubricState']");
  const objectionCodingSynthesisState = document.querySelector("[data-pr='objectionCodingSynthesisState']");
  const objectionCodingNote = document.querySelector("[data-pr='objectionCodingNote']");
  const synthesisReadinessPanel = document.querySelector("[data-pr='fiveSessionSynthesisReadinessPanel']");
  const synthesisReadinessStatus = document.querySelector("[data-pr='synthesisReadinessStatus']");
  const synthesisSessionSlotList = document.querySelector("[data-pr='synthesisSessionSlotList']");
  const synthesisRawNotesState = document.querySelector("[data-pr='synthesisRawNotesState'] strong");
  const synthesisDebriefState = document.querySelector("[data-pr='synthesisDebriefState'] strong");
  const synthesisObjectionCodeState = document.querySelector("[data-pr='synthesisObjectionCodeState'] strong");
  const synthesisTemplateState = document.querySelector("[data-pr='synthesisTemplateState'] strong");
  const synthesisReadinessNote = document.querySelector("[data-pr='synthesisReadinessNote']");
  const privateSynthesisArtifactPanel = document.querySelector("[data-pr='privateSynthesisArtifactPanel']");
  const privateSynthesisArtifactStatus = document.querySelector("[data-pr='privateSynthesisArtifactStatus']");
  const generatePrivateSynthesisArtifactButton = document.querySelector("[data-pr='generatePrivateSynthesisArtifact']");
  const privateSynthesisArtifactPreview = document.querySelector("[data-pr='privateSynthesisArtifactPreview']");
  const privateSynthesisArtifactNote = document.querySelector("[data-pr='privateSynthesisArtifactNote']");
  const privateSynthesisDecisionMemoPanel = document.querySelector("[data-pr='privateSynthesisDecisionMemoPanel']");
  const privateSynthesisDecisionMemoStatus = document.querySelector("[data-pr='privateSynthesisDecisionMemoStatus']");
  const decisionMemoReviewedDecision = document.querySelector("[data-pr='decisionMemoReviewedDecision']");
  const decisionMemoEvidenceConfidence = document.querySelector("[data-pr='decisionMemoEvidenceConfidence']");
  const decisionMemoPublicChangeGuard = document.querySelector("[data-pr='decisionMemoPublicChangeGuard']");
  const decisionMemoOperatorNotes = document.querySelector("[data-pr='decisionMemoOperatorNotes']");
  const savePrivateSynthesisDecisionMemoButton = document.querySelector("[data-pr='savePrivateSynthesisDecisionMemo']");
  const clearPrivateSynthesisDecisionMemoButton = document.querySelector("[data-pr='clearPrivateSynthesisDecisionMemo']");
  const privateSynthesisDecisionMemoSummary = document.querySelector("[data-pr='privateSynthesisDecisionMemoSummary']");
  const privateSynthesisDecisionMemoNote = document.querySelector("[data-pr='privateSynthesisDecisionMemoNote']");
  const privateLaunchDecisionApprovalPanel = document.querySelector("[data-pr='privateLaunchDecisionApprovalPanel']");
  const privateLaunchDecisionApprovalStatus = document.querySelector("[data-pr='privateLaunchDecisionApprovalStatus']");
  const launchDecisionApprovalDecision = document.querySelector("[data-pr='launchDecisionApprovalDecision']");
  const launchDecisionApprovalReviewer = document.querySelector("[data-pr='launchDecisionApprovalReviewer']");
  const launchDecisionApprovalNotes = document.querySelector("[data-pr='launchDecisionApprovalNotes']");
  const savePrivateLaunchDecisionApprovalButton = document.querySelector("[data-pr='savePrivateLaunchDecisionApproval']");
  const clearPrivateLaunchDecisionApprovalButton = document.querySelector("[data-pr='clearPrivateLaunchDecisionApproval']");
  const privateLaunchDecisionApprovalSummary = document.querySelector("[data-pr='privateLaunchDecisionApprovalSummary']");
  const privateLaunchDecisionApprovalNote = document.querySelector("[data-pr='privateLaunchDecisionApprovalNote']");
  const privateExplicitPublishPlanPanel = document.querySelector("[data-pr='privateExplicitPublishPlanPanel']");
  const privateExplicitPublishPlanStatus = document.querySelector("[data-pr='privateExplicitPublishPlanStatus']");
  const publishPlanOwner = document.querySelector("[data-pr='publishPlanOwner']");
  const publishPlanRollback = document.querySelector("[data-pr='publishPlanRollback']");
  const publishPlanClaimRisk = document.querySelector("[data-pr='publishPlanClaimRisk']");
  const publishPlanPublicCopyDiff = document.querySelector("[data-pr='publishPlanPublicCopyDiff']");
  const savePrivateExplicitPublishPlanButton = document.querySelector("[data-pr='savePrivateExplicitPublishPlan']");
  const clearPrivateExplicitPublishPlanButton = document.querySelector("[data-pr='clearPrivateExplicitPublishPlan']");
  const privateExplicitPublishPlanSummary = document.querySelector("[data-pr='privateExplicitPublishPlanSummary']");
  const privateExplicitPublishPlanNote = document.querySelector("[data-pr='privateExplicitPublishPlanNote']");
  const privatePublicCopyDiffRollbackPanel = document.querySelector("[data-pr='privatePublicCopyDiffRollbackPanel']");
  const privatePublicCopyDiffRollbackStatus = document.querySelector("[data-pr='privatePublicCopyDiffRollbackStatus']");
  const copyDiffRollbackDiffSummary = document.querySelector("[data-pr='copyDiffRollbackDiffSummary']");
  const copyDiffRollbackConsentCheck = document.querySelector("[data-pr='copyDiffRollbackConsentCheck']");
  const copyDiffRollbackClaimRiskCheck = document.querySelector("[data-pr='copyDiffRollbackClaimRiskCheck']");
  const copyDiffRollbackValidationCommand = document.querySelector("[data-pr='copyDiffRollbackValidationCommand']");
  const copyDiffRollbackRollbackPath = document.querySelector("[data-pr='copyDiffRollbackRollbackPath']");
  const savePrivatePublicCopyDiffRollbackButton = document.querySelector("[data-pr='savePrivatePublicCopyDiffRollback']");
  const clearPrivatePublicCopyDiffRollbackButton = document.querySelector("[data-pr='clearPrivatePublicCopyDiffRollback']");
  const privatePublicCopyDiffRollbackSummary = document.querySelector("[data-pr='privatePublicCopyDiffRollbackSummary']");
  const privatePublicCopyDiffRollbackNote = document.querySelector("[data-pr='privatePublicCopyDiffRollbackNote']");
  const privateReleaseCandidateRehearsalPanel = document.querySelector("[data-pr='privateReleaseCandidateRehearsalPanel']");
  const privateReleaseCandidateRehearsalStatus = document.querySelector("[data-pr='privateReleaseCandidateRehearsalStatus']");
  const releaseCandidateStaticSmoke = document.querySelector("[data-pr='releaseCandidateStaticSmoke']");
  const releaseCandidateServedSmoke = document.querySelector("[data-pr='releaseCandidateServedSmoke']");
  const releaseCandidateRollbackRehearsal = document.querySelector("[data-pr='releaseCandidateRollbackRehearsal']");
  const releaseCandidateConsentCheck = document.querySelector("[data-pr='releaseCandidateConsentCheck']");
  const releaseCandidateClaimRiskCheck = document.querySelector("[data-pr='releaseCandidateClaimRiskCheck']");
  const savePrivateReleaseCandidateRehearsalButton = document.querySelector("[data-pr='savePrivateReleaseCandidateRehearsal']");
  const clearPrivateReleaseCandidateRehearsalButton = document.querySelector("[data-pr='clearPrivateReleaseCandidateRehearsal']");
  const privateReleaseCandidateRehearsalSummary = document.querySelector("[data-pr='privateReleaseCandidateRehearsalSummary']");
  const privateReleaseCandidateRehearsalNote = document.querySelector("[data-pr='privateReleaseCandidateRehearsalNote']");
  const privateCredentialedDeployReadinessPanel = document.querySelector("[data-pr='privateCredentialedDeployReadinessPanel']");
  const privateCredentialedDeployReadinessStatus = document.querySelector("[data-pr='privateCredentialedDeployReadinessStatus']");
  const credentialedDeployStaticRehearsalEvidence = document.querySelector("[data-pr='credentialedDeployStaticRehearsalEvidence']");
  const credentialedDeployStaticRehearsalStatus = document.querySelector("[data-pr='credentialedDeployStaticRehearsalStatus']");
  const credentialedDeployStaticRehearsalSummary = document.querySelector("[data-pr='credentialedDeployStaticRehearsalSummary']");
  const credentialedDeployStaticRehearsalRoutes = document.querySelector("[data-pr='credentialedDeployStaticRehearsalRoutes']");
  const credentialedDeployStaticRehearsalDrilldown = document.querySelector("[data-pr='credentialedDeployStaticRehearsalDrilldown']");
  const platformOwnerHandoffPanel = document.querySelector("[data-pr='platformOwnerHandoffState']");
  const platformOwnerHandoffStatus = document.querySelector("[data-pr='platformOwnerHandoffStatus']");
  const platformOwnerHandoffSummary = document.querySelector("[data-pr='platformOwnerHandoffSummary']");
  const platformOwnerHandoffMissingCategories = document.querySelector("[data-pr='platformOwnerHandoffMissingCategories']");
  const postDeployHealthCheckHandoffPanel = document.querySelector("[data-pr='postDeployHealthCheckHandoffState']");
  const postDeployHealthCheckHandoffStatus = document.querySelector("[data-pr='postDeployHealthCheckHandoffStatus']");
  const postDeployHealthCheckHandoffSummary = document.querySelector("[data-pr='postDeployHealthCheckHandoffSummary']");
  const postDeployHealthCheckHandoffRoutes = document.querySelector("[data-pr='postDeployHealthCheckHandoffRoutes']");
  const finalDeployGoNoGoPanel = document.querySelector("[data-pr='finalDeployGoNoGoState']");
  const finalDeployGoNoGoStatus = document.querySelector("[data-pr='finalDeployGoNoGoStatus']");
  const finalDeployGoNoGoSummary = document.querySelector("[data-pr='finalDeployGoNoGoSummary']");
  const finalDeployGoNoGoMissing = document.querySelector("[data-pr='finalDeployGoNoGoMissing']");
  const credentialedDeployHumanApproval = document.querySelector("[data-pr='credentialedDeployHumanApproval']");
  const deployBlockerEscalationHandoffPanel = document.querySelector("[data-pr='deployBlockerEscalationHandoffState']");
  const deployBlockerEscalationHandoffStatus = document.querySelector("[data-pr='deployBlockerEscalationHandoffStatus']");
  const deployBlockerEscalationHandoffSummary = document.querySelector("[data-pr='deployBlockerEscalationHandoffSummary']");
  const deployBlockerEscalationEvidenceList = document.querySelector("[data-pr='deployBlockerEscalationEvidence']");
  const deployBlockerEscalationUnavailableList = document.querySelector("[data-pr='deployBlockerEscalationUnavailable']");
  const deployBlockerEscalationBoundary = document.querySelector("[data-pr='deployBlockerEscalationBoundary']");
  const firstHumanOperatorPacketHandoffPanel = document.querySelector("[data-pr='firstHumanOperatorPacketHandoffState']");
  const firstHumanOperatorPacketHandoffStatus = document.querySelector("[data-pr='firstHumanOperatorPacketHandoffStatus']");
  const firstHumanOperatorPacketHandoffSummary = document.querySelector("[data-pr='firstHumanOperatorPacketHandoffSummary']");
  const firstHumanOperatorPacketReadyArtifactsList = document.querySelector("[data-pr='firstHumanOperatorPacketReadyArtifacts']");
  const firstHumanOperatorPacketUnavailableFactsList = document.querySelector("[data-pr='firstHumanOperatorPacketUnavailableFacts']");
  const firstHumanOperatorPacketBoundary = document.querySelector("[data-pr='firstHumanOperatorPacketBoundary']");
  const operatorDryRunReviewHandoffPanel = document.querySelector("[data-pr='operatorDryRunReviewHandoffState']");
  const operatorDryRunReviewHandoffStatus = document.querySelector("[data-pr='operatorDryRunReviewHandoffStatus']");
  const operatorDryRunReviewHandoffSummary = document.querySelector("[data-pr='operatorDryRunReviewHandoffSummary']");
  const operatorDryRunReviewLocalStepsList = document.querySelector("[data-pr='operatorDryRunReviewLocalSteps']");
  const operatorDryRunReviewHardStopsList = document.querySelector("[data-pr='operatorDryRunReviewHardStops']");
  const operatorDryRunReviewBoundary = document.querySelector("[data-pr='operatorDryRunReviewBoundary']");
  const coldStartArchiveHandoffPanel = document.querySelector("[data-pr='coldStartArchiveHandoffState']");
  const coldStartArchiveHandoffStatus = document.querySelector("[data-pr='coldStartArchiveHandoffStatus']");
  const coldStartArchiveHandoffSummary = document.querySelector("[data-pr='coldStartArchiveHandoffSummary']");
  const coldStartArchiveContinuationContextList = document.querySelector("[data-pr='coldStartArchiveContinuationContext']");
  const coldStartArchiveHardStopsList = document.querySelector("[data-pr='coldStartArchiveHardStops']");
  const coldStartArchiveBoundary = document.querySelector("[data-pr='coldStartArchiveBoundary']");
  const deployContinuationHandoffPanel = document.querySelector("[data-pr='deployContinuationHandoffState']");
  const deployContinuationHandoffStatus = document.querySelector("[data-pr='deployContinuationHandoffStatus']");
  const deployContinuationHandoffSummary = document.querySelector("[data-pr='deployContinuationHandoffSummary']");
  const deployContinuationBlockedLabelsList = document.querySelector("[data-pr='deployContinuationBlockedLabels']");
  const deployContinuationHardStopsList = document.querySelector("[data-pr='deployContinuationHardStops']");
  const deployContinuationBoundary = document.querySelector("[data-pr='deployContinuationBoundary']");
  const externalInputBoundaryHandoffPanel = document.querySelector("[data-pr='externalInputBoundaryHandoffState']");
  const externalInputBoundaryHandoffStatus = document.querySelector("[data-pr='externalInputBoundaryHandoffStatus']");
  const externalInputBoundaryHandoffSummary = document.querySelector("[data-pr='externalInputBoundaryHandoffSummary']");
  const externalInputBoundaryArtifactsList = document.querySelector("[data-pr='externalInputBoundaryArtifacts']");
  const externalInputBoundaryNotObservedFactsList = document.querySelector("[data-pr='externalInputBoundaryNotObservedFacts']");
  const externalInputBoundaryHardStopsList = document.querySelector("[data-pr='externalInputBoundaryHardStops']");
  const externalInputBoundaryBoundary = document.querySelector("[data-pr='externalInputBoundaryBoundary']");
  const platformOwnerNonRequestTransferPanel = document.querySelector("[data-pr='platformOwnerNonRequestTransferHandoffState']");
  const platformOwnerNonRequestTransferStatus = document.querySelector("[data-pr='platformOwnerNonRequestTransferStatus']");
  const platformOwnerNonRequestTransferSummary = document.querySelector("[data-pr='platformOwnerNonRequestTransferSummary']");
  const platformOwnerNonRequestTransferArtifactsList = document.querySelector("[data-pr='platformOwnerNonRequestTransferArtifacts']");
  const platformOwnerNonRequestTransferNonRequestsList = document.querySelector("[data-pr='platformOwnerNonRequestTransferNonRequests']");
  const platformOwnerNonRequestTransferHardStopsList = document.querySelector("[data-pr='platformOwnerNonRequestTransferHardStops']");
  const platformOwnerNonRequestTransferBoundary = document.querySelector("[data-pr='platformOwnerNonRequestTransferBoundary']");
  const operatorResumePacketGuardrailPanel = document.querySelector("[data-pr='operatorResumePacketGuardrailHandoffState']");
  const operatorResumePacketGuardrailStatus = document.querySelector("[data-pr='operatorResumePacketGuardrailStatus']");
  const operatorResumePacketGuardrailSummary = document.querySelector("[data-pr='operatorResumePacketGuardrailSummary']");
  const operatorResumePacketGuardrailReferencesList = document.querySelector("[data-pr='operatorResumePacketGuardrailReferences']");
  const operatorResumePacketGuardrailRulesList = document.querySelector("[data-pr='operatorResumePacketGuardrailRules']");
  const operatorResumePacketGuardrailHardStopsList = document.querySelector("[data-pr='operatorResumePacketGuardrailHardStops']");
  const operatorResumePacketGuardrailBoundary = document.querySelector("[data-pr='operatorResumePacketGuardrailBoundary']");
  const blockedStateOperatorContinuationIndexPanel = document.querySelector("[data-pr='blockedStateOperatorContinuationIndexHandoffState']");
  const blockedStateOperatorContinuationIndexStatus = document.querySelector("[data-pr='blockedStateOperatorContinuationIndexStatus']");
  const blockedStateOperatorContinuationIndexSummary = document.querySelector("[data-pr='blockedStateOperatorContinuationIndexSummary']");
  const blockedStateOperatorContinuationIndexLabelsList = document.querySelector("[data-pr='blockedStateOperatorContinuationIndexLabels']");
  const blockedStateOperatorContinuationIndexNotObservedList = document.querySelector("[data-pr='blockedStateOperatorContinuationIndexNotObserved']");
  const blockedStateOperatorContinuationIndexHardStopsList = document.querySelector("[data-pr='blockedStateOperatorContinuationIndexHardStops']");
  const blockedStateOperatorContinuationIndexBoundary = document.querySelector("[data-pr='blockedStateOperatorContinuationIndexBoundary']");
  const autonomousDeployStopLedgerPanel = document.querySelector("[data-pr='autonomousDeployStopLedgerHandoffState']");
  const autonomousDeployStopLedgerStatus = document.querySelector("[data-pr='autonomousDeployStopLedgerStatus']");
  const autonomousDeployStopLedgerSummary = document.querySelector("[data-pr='autonomousDeployStopLedgerSummary']");
  const autonomousDeployStopLedgerSurfacesList = document.querySelector("[data-pr='autonomousDeployStopLedgerSurfaces']");
  const autonomousDeployStopLedgerNotObservedList = document.querySelector("[data-pr='autonomousDeployStopLedgerNotObserved']");
  const autonomousDeployStopLedgerHardStopsList = document.querySelector("[data-pr='autonomousDeployStopLedgerHardStops']");
  const autonomousDeployStopLedgerBoundary = document.querySelector("[data-pr='autonomousDeployStopLedgerBoundary']");
  const postAutonomousStopRecoveryChecklistPanel = document.querySelector("[data-pr='postAutonomousStopRecoveryChecklistHandoffState']");
  const postAutonomousStopRecoveryChecklistStatus = document.querySelector("[data-pr='postAutonomousStopRecoveryChecklistStatus']");
  const postAutonomousStopRecoveryChecklistSummary = document.querySelector("[data-pr='postAutonomousStopRecoveryChecklistSummary']");
  const postAutonomousStopRecoveryChecklistSurfacesList = document.querySelector("[data-pr='postAutonomousStopRecoveryChecklistSurfaces']");
  const postAutonomousStopRecoveryChecklistNotObservedList = document.querySelector("[data-pr='postAutonomousStopRecoveryChecklistNotObserved']");
  const postAutonomousStopRecoveryChecklistHardStopsList = document.querySelector("[data-pr='postAutonomousStopRecoveryChecklistHardStops']");
  const postAutonomousStopRecoveryChecklistBoundary = document.querySelector("[data-pr='postAutonomousStopRecoveryChecklistBoundary']");
  const humanPlatformAuthorityReEntryGatePanel = document.querySelector("[data-pr='humanPlatformAuthorityReEntryGateHandoffState']");
  const humanPlatformAuthorityReEntryGateStatus = document.querySelector("[data-pr='humanPlatformAuthorityReEntryGateStatus']");
  const humanPlatformAuthorityReEntryGateSummary = document.querySelector("[data-pr='humanPlatformAuthorityReEntryGateSummary']");
  const humanPlatformAuthorityReEntryGateSurfacesList = document.querySelector("[data-pr='humanPlatformAuthorityReEntryGateSurfaces']");
  const humanPlatformAuthorityReEntryGateNotObservedList = document.querySelector("[data-pr='humanPlatformAuthorityReEntryGateNotObserved']");
  const humanPlatformAuthorityReEntryGateHardStopsList = document.querySelector("[data-pr='humanPlatformAuthorityReEntryGateHardStops']");
  const humanPlatformAuthorityReEntryGateBoundary = document.querySelector("[data-pr='humanPlatformAuthorityReEntryGateBoundary']");
  const outsideAuthorityAwaitingStateLedgerPanel = document.querySelector("[data-pr='outsideAuthorityAwaitingStateLedgerHandoffState']");
  const outsideAuthorityAwaitingStateLedgerStatus = document.querySelector("[data-pr='outsideAuthorityAwaitingStateLedgerStatus']");
  const outsideAuthorityAwaitingStateLedgerSummary = document.querySelector("[data-pr='outsideAuthorityAwaitingStateLedgerSummary']");
  const outsideAuthorityAwaitingStateLedgerSurfacesList = document.querySelector("[data-pr='outsideAuthorityAwaitingStateLedgerSurfaces']");
  const outsideAuthorityAwaitingStateLedgerNotObservedList = document.querySelector("[data-pr='outsideAuthorityAwaitingStateLedgerNotObserved']");
  const outsideAuthorityAwaitingStateLedgerHardStopsList = document.querySelector("[data-pr='outsideAuthorityAwaitingStateLedgerHardStops']");
  const outsideAuthorityAwaitingStateLedgerBoundary = document.querySelector("[data-pr='outsideAuthorityAwaitingStateLedgerBoundary']");
  const credentialedDeployPlatform = document.querySelector("[data-pr='credentialedDeployPlatform']");
  const credentialedDeployProductionUrl = document.querySelector("[data-pr='credentialedDeployProductionUrl']");
  const credentialedDeployCredentialAvailability = document.querySelector("[data-pr='credentialedDeployCredentialAvailability']");
  const credentialedDeployTrigger = document.querySelector("[data-pr='credentialedDeployTrigger']");
  const credentialedDeployRollbackOwner = document.querySelector("[data-pr='credentialedDeployRollbackOwner']");
  const credentialedDeployRollbackMethod = document.querySelector("[data-pr='credentialedDeployRollbackMethod']");
  const credentialedDeployHealthCheckInputs = document.querySelector("[data-pr='credentialedDeployHealthCheckInputs']");
  const credentialedDeployHumanApprovalToggle = document.querySelector("[data-pr='credentialedDeployHumanApprovalToggle']");
  const savePrivateCredentialedDeployReadinessButton = document.querySelector("[data-pr='savePrivateCredentialedDeployReadiness']");
  const clearPrivateCredentialedDeployReadinessButton = document.querySelector("[data-pr='clearPrivateCredentialedDeployReadiness']");
  const privateCredentialedDeployReadinessSummary = document.querySelector("[data-pr='privateCredentialedDeployReadinessSummary']");
  const privateCredentialedDeployReadinessMissing = document.querySelector("[data-pr='privateCredentialedDeployReadinessMissing']");
  const privateCredentialedDeployReadinessNote = document.querySelector("[data-pr='privateCredentialedDeployReadinessNote']");
  let staticDeployRehearsalEvidence = defaultStaticDeployRehearsalEvidence();

  if (!form || !status || !clearButton) return;

  const submitButton = form.querySelector("button[type='submit']");
  const resumeTextInput = form.elements.namedItem("resumeText");
  const targetRoleInput = form.elements.namedItem("targetRole");
  let demoGuardActive = false;

  function renderOperatorHandoff(prepState) {
    if (!operatorHandoffPanel) return;
    const latest = latestIntake();
    const state = prepState || sessionPrepState(loadIntakes(), targetRoleInput instanceof HTMLInputElement ? targetRoleInput.value : "");
    const packet = proofPacketHandoffState(latest);
    const selectedKind = latest?.isDemo ? "demo sample" : latest ? "user draft" : "none";
    const selectedLabel = latest
      ? `${latest.isDemo ? "Demo" : "User"} draft ${String(latest.id || "").slice(0, 18)}`
      : "No local draft selected";
    const reviewHref = latest?.id ? `/review.html?intake=${encodeURIComponent(latest.id)}` : "/review.html";
    const packetHref = latest?.id ? `/proof-packet.html?intake=${encodeURIComponent(latest.id)}` : "/proof-packet.html";
    const handoffReady = Boolean(latest?.id && state.ready && packet.acceptedCount > 0);

    operatorHandoffPanel.setAttribute("data-selected-draft-id", latest?.id || "");
    operatorHandoffPanel.setAttribute("data-selected-draft-kind", selectedKind);
    operatorHandoffPanel.setAttribute("data-session-prep-ready", state.ready ? "true" : "false");
    operatorHandoffPanel.setAttribute("data-proof-packet-share-status", packet.status);
    operatorHandoffPanel.setAttribute("data-share-readiness", packet.status);
    operatorHandoffPanel.setAttribute("data-proof-packet-ready", packet.acceptedCount > 0 ? "ready" : "not-ready");
    operatorHandoffPanel.setAttribute("data-proof-packet-accepted-count", String(packet.acceptedCount));
    operatorHandoffPanel.setAttribute("data-proof-packet-redactions", String(packet.redactionTotal));
    operatorHandoffPanel.setAttribute("data-operator-handoff-ready", handoffReady ? "true" : "false");
    operatorHandoffPanel.setAttribute("data-operator-handoff-local-only", "true");
    operatorHandoffPanel.setAttribute("data-handoff-local-only", "true");
    operatorHandoffPanel.setAttribute("data-export-text-unchanged", "true");

    if (operatorHandoffStatus) {
      operatorHandoffStatus.className = `status-pill ${handoffReady ? "is-approved" : "is-pending"}`;
      operatorHandoffStatus.setAttribute("data-operator-handoff-status", handoffReady ? "ready" : "needs-review");
      operatorHandoffStatus.textContent = handoffReady ? "Ready to hand off" : "Needs review";
    }
    setText(operatorHandoffSessionPrep, state.ready ? "Ready to start" : "Needs review");
    setText(operatorHandoffSelectedDraft, selectedLabel);
    setText(
      operatorHandoffPacketReadiness,
      packet.acceptedCount
        ? `${packet.status}; ${packet.acceptedCount} accepted bullet${packet.acceptedCount === 1 ? "" : "s"}`
        : packet.status
    );
    if (operatorHandoffSelectedDraftLink) {
      operatorHandoffSelectedDraftLink.setAttribute("href", reviewHref);
      operatorHandoffSelectedDraftLink.setAttribute("data-selected-draft-id", latest?.id || "");
      operatorHandoffSelectedDraftLink.setAttribute("data-selected-draft-kind", selectedKind);
    }
    if (operatorHandoffPacketLink) {
      operatorHandoffPacketLink.setAttribute("href", packetHref);
      operatorHandoffPacketLink.setAttribute("data-proof-packet-share-status", packet.status);
      operatorHandoffPacketLink.setAttribute("data-proof-packet-accepted-count", String(packet.acceptedCount));
    }
    setText(
      operatorHandoffNote,
      `Local-only handoff for ${selectedKind}: session prep ${state.ready ? "ready" : "needs review"}, packet ${packet.status.toLowerCase()}, learning-log links available. Resume export text unchanged.`
    );
  }

  function renderFirstRecruitDispatchBoard() {
    if (!dispatchBoard) return;
    const latest = latestIntake();
    const selectedKind = latest?.isDemo ? "demo sample" : latest ? "user draft" : "none";
    const selectedLabel = latest
      ? `${latest.isDemo ? "Demo" : "User"} draft ${String(latest.id || "").slice(0, 18)}`
      : "No local draft selected";
    const reviewHref = latest?.id ? `/review.html?intake=${encodeURIComponent(latest.id)}` : "/review.html";
    const realReplyFacts = "not-observed";
    const noSend = realReplyFacts !== "observed";

    dispatchBoard.setAttribute("data-dispatch-readiness", noSend ? "no-send" : "ready");
    dispatchBoard.setAttribute("data-dispatch-no-send", noSend ? "true" : "false");
    dispatchBoard.setAttribute("data-real-reply-facts", realReplyFacts);
    dispatchBoard.setAttribute("data-selected-draft-id", latest?.id || "");
    dispatchBoard.setAttribute("data-selected-draft-kind", selectedKind);
    dispatchBoard.setAttribute("data-local-only", "true");
    dispatchBoard.setAttribute("data-export-text-unchanged", "true");
    dispatchBoard.setAttribute(
      "data-local-artifact-links",
      "dispatch-readiness,outreach-tracker,scheduling-consent,selected-draft"
    );

    if (dispatchNoSendStatus) {
      dispatchNoSendStatus.className = `status-pill ${noSend ? "is-rejected" : "is-approved"}`;
      dispatchNoSendStatus.setAttribute("data-dispatch-no-send-state", noSend ? "no-send" : "send-ready");
      dispatchNoSendStatus.textContent = noSend ? "No-send" : "Ready";
    }
    setText(dispatchReadinessState, "No-send gates open locally");
    setText(dispatchTrackerState, "Real replies: Not observed");
    setText(dispatchConsentState, "Blocked until real reply");
    setText(dispatchSelectedDraft, selectedLabel);
    if (dispatchSelectedDraftLink) {
      dispatchSelectedDraftLink.setAttribute("href", reviewHref);
      dispatchSelectedDraftLink.setAttribute("data-selected-draft-id", latest?.id || "");
      dispatchSelectedDraftLink.setAttribute("data-selected-draft-kind", selectedKind);
    }
    setText(
      dispatchBoardNote,
      `Local-only dispatch board for ${selectedKind}: selected draft linked, private artifacts linked, real reply facts not observed, no-send preserved. Resume export text unchanged.`
    );
  }

  function renderFirstReplyTriageBoard() {
    if (!triageBoard) return;
    const latest = latestIntake();
    const selectedKind = latest?.isDemo ? "demo sample" : latest ? "user draft" : "none";
    const selectedLabel = latest
      ? `${latest.isDemo ? "Demo" : "User"} draft ${String(latest.id || "").slice(0, 18)}`
      : "No local draft selected";
    const reviewHref = latest?.id ? `/review.html?intake=${encodeURIComponent(latest.id)}` : "/review.html";
    const realReplyFacts = "not-observed";
    const noReply = realReplyFacts !== "observed";

    triageBoard.setAttribute("data-triage-readiness", noReply ? "no-reply" : "reply-observed");
    triageBoard.setAttribute("data-triage-no-reply", noReply ? "true" : "false");
    triageBoard.setAttribute("data-real-reply-facts", realReplyFacts);
    triageBoard.setAttribute("data-selected-draft-id", latest?.id || "");
    triageBoard.setAttribute("data-selected-draft-kind", selectedKind);
    triageBoard.setAttribute("data-local-only", "true");
    triageBoard.setAttribute("data-export-text-unchanged", "true");
    triageBoard.setAttribute(
      "data-local-artifact-links",
      "reply-triage-template,outreach-tracker,scheduling-consent,raw-note-prep,selected-draft"
    );

    if (triageNoReplyStatus) {
      triageNoReplyStatus.className = `status-pill ${noReply ? "is-pending" : "is-approved"}`;
      triageNoReplyStatus.setAttribute("data-triage-no-reply-state", noReply ? "no-reply" : "reply-observed");
      triageNoReplyStatus.textContent = noReply ? "No reply" : "Reply observed";
    }
    setText(triageTemplateState, "Use for first replies");
    setText(triageTrackerState, "Real replies: Not observed");
    setText(triageConsentState, "Blocked until reply");
    setText(triageRawNotesState, "Prep before call");
    setText(triageSelectedDraft, selectedLabel);
    if (triageSelectedDraftLink) {
      triageSelectedDraftLink.setAttribute("href", reviewHref);
      triageSelectedDraftLink.setAttribute("data-selected-draft-id", latest?.id || "");
      triageSelectedDraftLink.setAttribute("data-selected-draft-kind", selectedKind);
    }
    setText(
      triageBoardNote,
      `Local-only triage board for ${selectedKind}: template + tracker + scheduling + raw-note prep linked, reply facts not observed, no-reply preserved. Resume export text unchanged.`
    );
  }

  function renderFirstReplyFactCapturePanel() {
    if (!firstReplyFactPanel) return;
    const latest = latestIntake();
    const selectedKind = latest?.isDemo ? "demo sample" : latest ? "user draft" : "none";
    const facts = firstReplyFactRecord(latest);
    const observed = facts.state !== "unobserved";
    const statusLabel = firstReplyFactLabel(facts.state);
    const capturedFacts = observed
      ? facts.capturedFacts.length
        ? facts.capturedFacts
        : [
            {
              key: `first-reply-state:${facts.state}`,
              label: "Reply state",
              text: `Captured first-reply fact: ${statusLabel}.`,
              value: facts.state,
              exportEligible: false,
            },
          ]
      : [];

    firstReplyFactPanel.setAttribute("data-selected-draft-id", latest?.id || "");
    firstReplyFactPanel.setAttribute("data-selected-draft-kind", selectedKind);
    firstReplyFactPanel.setAttribute("data-first-reply-state", facts.state);
    firstReplyFactPanel.setAttribute("data-real-reply-facts", facts.observedState);
    firstReplyFactPanel.setAttribute("data-observed-state", facts.observedState);
    firstReplyFactPanel.setAttribute("data-first-reply-fact-count", String(capturedFacts.length));
    firstReplyFactPanel.setAttribute("data-captured-fact-count", String(capturedFacts.length));
    firstReplyFactPanel.setAttribute("data-explicit-operator-action", facts.explicitOperatorAction);
    firstReplyFactPanel.setAttribute("data-first-reply-updated-at", facts.updatedAt);
    firstReplyFactPanel.setAttribute("data-local-only", "true");
    firstReplyFactPanel.setAttribute("data-export-text-unchanged", "true");

    if (firstReplyFactStatus) {
      firstReplyFactStatus.className = `status-pill ${firstReplyFactClass(facts.state)}`;
      firstReplyFactStatus.setAttribute("data-first-reply-fact-status", facts.state);
      firstReplyFactStatus.textContent = statusLabel;
    }

    for (const button of firstReplyFactPanel.querySelectorAll("[data-first-reply-fact-action]")) {
      const action = button.getAttribute("data-first-reply-fact-action") || "unobserved";
      button.setAttribute("aria-pressed", action === facts.state ? "true" : "false");
      button.toggleAttribute("disabled", !latest?.id);
    }

    if (firstReplyFactList) {
      firstReplyFactList.innerHTML = capturedFacts.length
        ? capturedFacts
            .map(
              (fact, index) => `<article
                class="first-reply-fact-item"
                data-first-reply-fact="${escapeHtml(fact.key || `first-reply-fact-${index + 1}`)}"
                data-first-reply-fact-state="${escapeHtml(facts.state)}"
                data-export-eligible="false"
              >
                <span class="status-pill ${firstReplyFactClass(facts.state)}">${escapeHtml(fact.label || "Reply fact")}</span>
                <p>${escapeHtml(fact.text || statusLabel)}</p>
              </article>`
            )
            .join("")
        : `<p class="report-note" data-first-reply-empty-state="true">No facts captured.</p>`;
    }

    setText(
      firstReplyFactNote,
      latest?.id
        ? `Selected ${selectedKind} ${String(latest.id).slice(0, 18)}: first-reply facts are ${observed ? statusLabel.toLowerCase() : "unobserved"}. Local metadata only; resume export text unchanged.`
        : "No selected local draft yet. Generate or load a draft before recording first-reply facts."
    );
  }

  function renderSchedulingReadinessPanel() {
    if (!schedulingReadinessPanel) return;
    const latest = latestIntake();
    const selectedKind = latest?.isDemo ? "demo sample" : latest ? "user draft" : "none";
    const selectedLabel = latest
      ? `${latest.isDemo ? "Demo" : "User"} draft ${String(latest.id || "").slice(0, 18)}`
      : "No local draft selected";
    const state = schedulingReadinessState(latest);

    schedulingReadinessPanel.setAttribute("data-selected-draft-id", latest?.id || "");
    schedulingReadinessPanel.setAttribute("data-selected-draft-kind", selectedKind);
    schedulingReadinessPanel.setAttribute("data-scheduling-readiness", state.readiness);
    schedulingReadinessPanel.setAttribute("data-scheduling-blocked", state.blocked ? "true" : "false");
    schedulingReadinessPanel.setAttribute("data-accepted-reply-fact", state.acceptedReplyFact);
    schedulingReadinessPanel.setAttribute("data-accepted-local-reply-fact", state.accepted ? "true" : "false");
    schedulingReadinessPanel.setAttribute("data-real-reply-facts", state.realReplyFacts);
    schedulingReadinessPanel.setAttribute("data-explicit-operator-action", state.explicitOperatorAction);
    schedulingReadinessPanel.setAttribute("data-scheduling-readiness-updated-at", state.updatedAt);
    schedulingReadinessPanel.setAttribute(
      "data-local-artifact-links",
      "scheduling-consent,accepted-reply-confirmation,redacted-material-prep,raw-note-prep"
    );
    schedulingReadinessPanel.setAttribute("data-local-only", "true");
    schedulingReadinessPanel.setAttribute("data-export-text-unchanged", "true");

    for (const link of schedulingReadinessPanel.querySelectorAll("[data-scheduling-artifact]")) {
      link.setAttribute("data-scheduling-link-state", state.accepted ? "ready" : "blocked");
      link.setAttribute("data-selected-draft-id", latest?.id || "");
    }

    if (schedulingReadinessStatus) {
      schedulingReadinessStatus.className = `status-pill ${state.accepted ? "is-approved" : "is-rejected"}`;
      schedulingReadinessStatus.setAttribute("data-scheduling-readiness-status", state.readiness);
      schedulingReadinessStatus.textContent = state.accepted ? "Ready" : "Blocked";
    }
    setText(schedulingConsentReadinessState, state.accepted ? "Ready after accepted fact" : "Blocked");
    setText(acceptedReplyConfirmationState, state.accepted ? "Accepted fact confirmed" : "Needs accepted fact");
    setText(redactedMaterialPrepState, state.accepted ? "Ready before scheduling" : "Blocked");
    setText(rawNotePrepReadinessState, state.accepted ? "Ready before call" : "Blocked");
    setText(
      schedulingReadinessNote,
      state.accepted
        ? `Local-only scheduling readiness for ${selectedLabel}: accepted reply fact recorded by explicit operator action; scheduling/consent, accepted-reply confirmation, redacted-material prep, and raw-note prep are linked. Resume export text unchanged.`
        : `Local-only scheduling readiness for ${selectedLabel}: blocked until the selected draft has an explicit Accepted reply fact. Resume export text unchanged.`
    );
  }

  function renderAppointmentSessionStartGatePanel() {
    if (!sessionStartGatePanel) return;
    const latest = latestIntake();
    const selectedKind = latest?.isDemo ? "demo sample" : latest ? "user draft" : "none";
    const selectedLabel = latest
      ? `${latest.isDemo ? "Demo" : "User"} draft ${String(latest.id || "").slice(0, 18)}`
      : "No local draft selected";
    const state = appointmentSessionStartGateRecord(latest);

    sessionStartGatePanel.setAttribute("data-selected-draft-id", latest?.id || "");
    sessionStartGatePanel.setAttribute("data-selected-draft-kind", selectedKind);
    sessionStartGatePanel.setAttribute("data-session-start-readiness", state.readiness);
    sessionStartGatePanel.setAttribute("data-session-start-blocked", state.blocked ? "true" : "false");
    sessionStartGatePanel.setAttribute("data-calendar-readiness", state.calendarReady ? "ready" : "blocked");
    sessionStartGatePanel.setAttribute("data-explicit-appointment-time", state.explicitAppointment ? "recorded" : "missing");
    sessionStartGatePanel.setAttribute("data-consent-boundary", state.consentBoundaryConfirmed ? "confirmed" : "missing");
    sessionStartGatePanel.setAttribute("data-redacted-material-reminder", state.redactedMaterialReminderConfirmed ? "confirmed" : "missing");
    sessionStartGatePanel.setAttribute("data-raw-note-prep-facts", state.rawNotePrepConfirmed ? "confirmed" : "missing");
    sessionStartGatePanel.setAttribute("data-session-start-fact-count", String(state.factCount));
    sessionStartGatePanel.setAttribute("data-session-start-updated-at", state.updatedAt);
    sessionStartGatePanel.setAttribute("data-local-artifact-links", "runbook,raw-note-prep,debrief-template");
    sessionStartGatePanel.setAttribute("data-local-only", "true");
    sessionStartGatePanel.setAttribute("data-export-text-unchanged", "true");

    for (const link of sessionStartGatePanel.querySelectorAll("[data-session-start-artifact]")) {
      link.setAttribute("data-session-start-link-state", state.ready ? "ready" : "blocked");
      link.setAttribute("data-selected-draft-id", latest?.id || "");
    }

    if (sessionStartGateStatus) {
      sessionStartGateStatus.className = `status-pill ${state.ready ? "is-approved" : "is-rejected"}`;
      sessionStartGateStatus.setAttribute("data-session-start-gate-status", state.readiness);
      sessionStartGateStatus.textContent = state.ready ? "Ready to start" : "Blocked";
    }
    if (sessionStartAppointmentTime instanceof HTMLInputElement) {
      sessionStartAppointmentTime.value = state.appointmentDateTime;
      sessionStartAppointmentTime.toggleAttribute("disabled", !latest?.id || !state.calendarReady);
      sessionStartAppointmentTime.setAttribute("data-selected-draft-id", latest?.id || "");
    }

    setText(sessionStartCalendarState, state.calendarReady ? "Calendar ready" : "Blocked");
    setText(sessionStartAppointmentState, state.explicitAppointment ? "Date/time recorded" : "Missing");
    setText(sessionStartConsentState, state.consentBoundaryConfirmed ? "Consent boundary confirmed" : "Missing");
    setText(sessionStartRedactedState, state.redactedMaterialReminderConfirmed ? "Reminder confirmed" : "Missing");
    setText(sessionStartRawNoteState, state.rawNotePrepConfirmed ? "Raw-note prep confirmed" : "Missing");

    for (const button of sessionStartGatePanel.querySelectorAll("[data-session-start-fact]")) {
      const fact = button.getAttribute("data-session-start-fact") || "";
      const pressed =
        (fact === "consentBoundaryConfirmed" && state.consentBoundaryConfirmed) ||
        (fact === "redactedMaterialReminderConfirmed" && state.redactedMaterialReminderConfirmed) ||
        (fact === "rawNotePrepConfirmed" && state.rawNotePrepConfirmed);
      button.setAttribute("aria-pressed", pressed ? "true" : "false");
      button.toggleAttribute("disabled", !latest?.id || !state.calendarReady);
    }

    setText(
      sessionStartGateNote,
      state.ready
        ? `Local-only session-start gate for ${selectedLabel}: appointment, consent boundary, redacted-material reminder, and raw-note prep facts are recorded. Resume export text unchanged.`
        : `Local-only session-start gate for ${selectedLabel}: blocked until ${state.missing.join(", ")} exist. Resume export text unchanged.`
    );
  }

  function renderFirstSessionRawNoteCapturePanel() {
    if (!rawNoteCapturePanel) return;
    const latest = latestIntake();
    const selectedKind = latest?.isDemo ? "demo sample" : latest ? "user draft" : "none";
    const selectedLabel = latest
      ? `${latest.isDemo ? "Demo" : "User"} draft ${String(latest.id || "").slice(0, 18)}`
      : "No local draft selected";
    const gate = appointmentSessionStartGateRecord(latest);
    const notes = firstSessionRawNoteRecord(latest);
    const ready = Boolean(latest?.id && gate.ready);

    rawNoteCapturePanel.setAttribute("data-selected-draft-id", latest?.id || "");
    rawNoteCapturePanel.setAttribute("data-selected-draft-kind", selectedKind);
    rawNoteCapturePanel.setAttribute("data-session-start-readiness", gate.readiness);
    rawNoteCapturePanel.setAttribute("data-raw-note-capture-readiness", ready ? "ready" : "blocked");
    rawNoteCapturePanel.setAttribute("data-raw-note-capture-blocked", ready ? "false" : "true");
    rawNoteCapturePanel.setAttribute("data-raw-note-recorded", notes.hasNotes ? "true" : "false");
    rawNoteCapturePanel.setAttribute("data-raw-note-char-count", String(notes.noteCharCount));
    rawNoteCapturePanel.setAttribute("data-raw-note-line-count", String(notes.noteLineCount));
    rawNoteCapturePanel.setAttribute("data-raw-note-updated-at", notes.updatedAt);
    rawNoteCapturePanel.setAttribute("data-raw-note-debrief-ready", ready && notes.hasNotes ? "true" : "false");
    rawNoteCapturePanel.setAttribute("data-raw-note-objection-coding-ready", ready && notes.hasNotes ? "true" : "false");
    rawNoteCapturePanel.setAttribute("data-local-artifact-links", "debrief-template,objection-coding");
    rawNoteCapturePanel.setAttribute("data-local-only", "true");
    rawNoteCapturePanel.setAttribute("data-export-text-unchanged", "true");

    for (const link of rawNoteCapturePanel.querySelectorAll("[data-raw-note-artifact]")) {
      link.setAttribute("data-raw-note-link-state", ready ? "ready" : "blocked");
      link.setAttribute("data-selected-draft-id", latest?.id || "");
    }

    if (rawNoteCaptureStatus) {
      rawNoteCaptureStatus.className = `status-pill ${ready ? (notes.hasNotes ? "is-approved" : "is-pending") : "is-rejected"}`;
      rawNoteCaptureStatus.setAttribute("data-raw-note-capture-status", ready ? (notes.hasNotes ? "notes-recorded" : "ready") : "blocked");
      rawNoteCaptureStatus.textContent = ready ? (notes.hasNotes ? "Notes recorded" : "Ready") : "Blocked";
    }
    if (firstSessionRawNotes instanceof HTMLTextAreaElement) {
      firstSessionRawNotes.value = notes.rawNotes;
      firstSessionRawNotes.toggleAttribute("disabled", !ready);
      firstSessionRawNotes.setAttribute("data-selected-draft-id", latest?.id || "");
      firstSessionRawNotes.setAttribute("data-export-eligible", "false");
    }
    if (saveFirstSessionRawNotesButton) saveFirstSessionRawNotesButton.toggleAttribute("disabled", !ready);
    if (clearFirstSessionRawNotesButton) clearFirstSessionRawNotesButton.toggleAttribute("disabled", !ready || !notes.hasNotes);
    if (rawNoteCaptureSummary) {
      rawNoteCaptureSummary.setAttribute("data-raw-note-state", ready ? (notes.hasNotes ? "notes-recorded" : "ready") : "blocked");
      rawNoteCaptureSummary.setAttribute("data-raw-note-capture-status", ready ? (notes.hasNotes ? "notes-recorded" : "ready") : "blocked");
      rawNoteCaptureSummary.textContent = notes.hasNotes
        ? `Raw notes saved locally for debrief and objection coding. Preview: ${notes.rawNotes.trim().slice(0, 180)}`
        : ready
        ? "Raw notes can be saved after the session. No raw notes saved yet."
        : "Blocked until session-start readiness. No raw notes saved.";
    }

    setText(rawNoteDebriefState, ready ? (notes.hasNotes ? "Ready for debrief" : "Awaiting notes") : "Blocked");
    setText(rawNoteObjectionCodingState, ready ? (notes.hasNotes ? "Ready for coding" : "Awaiting notes") : "Blocked");
    setText(
      rawNoteCaptureNote,
      ready
        ? `Local-only raw-note capture for ${selectedLabel}: ${notes.noteCharCount} character${notes.noteCharCount === 1 ? "" : "s"} saved for debrief and objection coding. Resume export text unchanged.`
        : `Local-only raw-note capture for ${selectedLabel}: blocked until session-start readiness is ready. Resume export text unchanged.`
    );
  }

  function renderPostSessionDebriefHandoffPanel() {
    if (!postSessionDebriefPanel) return;
    const latest = latestIntake();
    const selectedKind = latest?.isDemo ? "demo sample" : latest ? "user draft" : "none";
    const selectedLabel = latest
      ? `${latest.isDemo ? "Demo" : "User"} draft ${String(latest.id || "").slice(0, 18)}`
      : "No local draft selected";
    const state = postSessionDebriefHandoffRecord(latest);
    const ready = Boolean(latest?.id && state.ready);
    const statusLabel = ready ? (state.hasDraft ? "Debrief drafted" : "Notes ready") : "Blocked";
    const statusClass = ready ? (state.hasDraft ? "is-approved" : "is-pending") : "is-rejected";

    postSessionDebriefPanel.setAttribute("data-selected-draft-id", latest?.id || "");
    postSessionDebriefPanel.setAttribute("data-selected-draft-kind", selectedKind);
    postSessionDebriefPanel.setAttribute("data-debrief-readiness", state.readiness);
    postSessionDebriefPanel.setAttribute("data-post-session-debrief-readiness", state.readiness);
    postSessionDebriefPanel.setAttribute("data-debrief-blocked", ready ? "false" : "true");
    postSessionDebriefPanel.setAttribute("data-raw-notes-available", state.ready ? "true" : "false");
    postSessionDebriefPanel.setAttribute("data-raw-note-recorded", state.ready ? "true" : "false");
    postSessionDebriefPanel.setAttribute("data-debrief-drafted", state.hasDraft ? "true" : "false");
    postSessionDebriefPanel.setAttribute("data-debrief-draft-saved", state.hasDraft ? "true" : "false");
    postSessionDebriefPanel.setAttribute("data-objection-coding-ready", ready ? "true" : "false");
    postSessionDebriefPanel.setAttribute("data-synthesis-ready", "false");
    postSessionDebriefPanel.setAttribute("data-local-artifact-links", "debrief-template,objection-coding,five-session-synthesis");
    postSessionDebriefPanel.setAttribute("data-local-only", "true");
    postSessionDebriefPanel.setAttribute("data-export-text-unchanged", "true");
    postSessionDebriefPanel.setAttribute("data-download-text-unchanged", "true");

    for (const link of postSessionDebriefPanel.querySelectorAll("[data-debrief-artifact]")) {
      link.setAttribute("data-debrief-link-state", ready ? "ready" : "blocked");
      link.setAttribute("data-selected-draft-id", latest?.id || "");
    }

    if (postSessionDebriefStatus) {
      postSessionDebriefStatus.className = `status-pill ${statusClass}`;
      postSessionDebriefStatus.setAttribute("data-debrief-status", state.readiness);
      postSessionDebriefStatus.textContent = statusLabel;
    }

    for (const field of [postSessionNextStep, postSessionObjectionCode, postSessionSynthesisCue]) {
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        field.toggleAttribute("disabled", !ready);
        field.setAttribute("data-export-eligible", "false");
        field.setAttribute("data-selected-draft-id", latest?.id || "");
      }
    }
    if (postSessionNextStep instanceof HTMLInputElement) postSessionNextStep.value = state.nextStep;
    if (postSessionObjectionCode instanceof HTMLInputElement) postSessionObjectionCode.value = state.objectionCode;
    if (postSessionSynthesisCue instanceof HTMLTextAreaElement) postSessionSynthesisCue.value = state.synthesisCue;
    if (savePostSessionDebriefButton) savePostSessionDebriefButton.toggleAttribute("disabled", !ready);
    if (clearPostSessionDebriefButton) clearPostSessionDebriefButton.toggleAttribute("disabled", !ready || !state.hasDraft);

    if (postSessionDebriefSummary) {
      postSessionDebriefSummary.setAttribute("data-debrief-state", state.readiness);
      postSessionDebriefSummary.setAttribute("data-debrief-drafted", state.hasDraft ? "true" : "false");
      postSessionDebriefSummary.textContent = !ready
        ? "Blocked until raw-note capture has saved real session notes."
        : state.hasDraft
        ? `Debrief draft saved. ${state.summaryFields.join(" | ")}`
        : "Raw notes are saved. Add next step, objection code, and synthesis cue for the local handoff.";
    }

    setText(postSessionDebriefTemplateState, ready ? "Ready" : "Blocked");
    setText(postSessionObjectionCodingState, ready ? "Ready for coding" : "Blocked");
    setText(postSessionSynthesisState, ready ? "Ready for synthesis" : "Blocked");
    setText(
      postSessionDebriefNote,
      ready
        ? `Local-only post-session debrief for ${selectedLabel}: next-step fields summarize operator metadata and link objection coding plus synthesis. Resume export text unchanged.`
        : `Local-only post-session debrief for ${selectedLabel}: blocked until raw-note capture records notes. Resume export text unchanged.`
    );
  }

  function renderObjectionCodingHandoffPanel() {
    if (!objectionCodingPanel) return;
    const latest = latestIntake();
    const selectedKind = latest?.isDemo ? "demo sample" : latest ? "user draft" : "none";
    const selectedLabel = latest
      ? `${latest.isDemo ? "Demo" : "User"} draft ${String(latest.id || "").slice(0, 18)}`
      : "No local draft selected";
    const state = objectionCodingHandoffRecord(latest);
    const ready = Boolean(latest?.id && state.ready);
    const statusLabel = ready ? (state.hasCodes ? "Codes recorded" : "Debrief ready") : "Blocked";
    const statusClass = ready ? (state.hasCodes ? "is-approved" : "is-pending") : "is-rejected";

    objectionCodingPanel.setAttribute("data-selected-draft-id", latest?.id || "");
    objectionCodingPanel.setAttribute("data-selected-draft-kind", selectedKind);
    objectionCodingPanel.setAttribute("data-objection-coding-readiness", state.readiness);
    objectionCodingPanel.setAttribute("data-objection-coding-blocked", ready ? "false" : "true");
    objectionCodingPanel.setAttribute("data-debrief-draft-saved", state.ready ? "true" : "false");
    objectionCodingPanel.setAttribute("data-objection-codes-recorded", state.hasCodes ? "true" : "false");
    objectionCodingPanel.setAttribute("data-private-objection-tags", String(state.tags.length));
    objectionCodingPanel.setAttribute("data-local-artifact-links", "objection-rubric,synthesis-template");
    objectionCodingPanel.setAttribute("data-local-only", "true");
    objectionCodingPanel.setAttribute("data-private", "true");
    objectionCodingPanel.setAttribute("data-export-text-unchanged", "true");
    objectionCodingPanel.setAttribute("data-download-text-unchanged", "true");

    for (const link of objectionCodingPanel.querySelectorAll("[data-objection-coding-artifact]")) {
      link.setAttribute("data-objection-coding-link-state", ready ? "ready" : "blocked");
      link.setAttribute("data-selected-draft-id", latest?.id || "");
    }

    if (objectionCodingStatus) {
      objectionCodingStatus.className = `status-pill ${statusClass}`;
      objectionCodingStatus.setAttribute("data-objection-coding-status", state.readiness);
      objectionCodingStatus.textContent = statusLabel;
    }
    for (const field of [objectionCodingTags, objectionCodingSynthesisNote]) {
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        field.toggleAttribute("disabled", !ready);
        field.setAttribute("data-export-eligible", "false");
        field.setAttribute("data-download-eligible", "false");
        field.setAttribute("data-private-objection-metadata", "true");
        field.setAttribute("data-selected-draft-id", latest?.id || "");
      }
    }
    if (objectionCodingTags instanceof HTMLInputElement) objectionCodingTags.value = state.tagsText;
    if (objectionCodingSynthesisNote instanceof HTMLTextAreaElement) objectionCodingSynthesisNote.value = state.synthesisNote;
    if (saveObjectionCodingButton) saveObjectionCodingButton.toggleAttribute("disabled", !ready);
    if (clearObjectionCodingButton) clearObjectionCodingButton.toggleAttribute("disabled", !ready || !state.hasCodes);

    if (objectionCodingSummary) {
      objectionCodingSummary.setAttribute("data-objection-coding-state", state.readiness);
      objectionCodingSummary.setAttribute("data-objection-codes-recorded", state.hasCodes ? "true" : "false");
      objectionCodingSummary.textContent = !ready
        ? "Blocked until the post-session debrief handoff has a saved draft."
        : state.hasCodes
        ? `Private objection coding saved: ${state.tags.length ? state.tags.join(", ") : "no tags"}${
            state.synthesisNote.trim() ? " | synthesis note saved" : ""
          }.`
        : "Post-session debrief is saved. Add private objection tags before five-session synthesis.";
    }

    setText(objectionCodingRubricState, ready ? "Ready" : "Blocked");
    setText(objectionCodingSynthesisState, ready ? "Ready for synthesis" : "Blocked");
    setText(
      objectionCodingNote,
      ready
        ? `Local-only objection coding for ${selectedLabel}: private tags link to the rubric and synthesis template. Resume export and download text unchanged.`
        : `Local-only objection coding for ${selectedLabel}: blocked until post-session debrief is saved. Resume export and download text unchanged.`
    );
  }

  function renderFiveSessionSynthesisReadinessPanel() {
    if (!synthesisReadinessPanel) return;
    const latest = latestIntake();
    const state = fiveSessionSynthesisReadinessState(loadIntakes(), latest);
    synthesisReadinessPanel.setAttribute("data-synthesis-readiness", state.readiness);
    synthesisReadinessPanel.setAttribute("data-five-session-synthesis-readiness", state.readiness);
    synthesisReadinessPanel.setAttribute("data-synthesis-blocked", state.blocked ? "true" : "false");
    synthesisReadinessPanel.setAttribute("data-ready", state.ready ? "true" : "false");
    synthesisReadinessPanel.setAttribute("data-synthesis-ready", state.ready ? "true" : "false");
    synthesisReadinessPanel.setAttribute("data-real-session-slots-complete", String(state.completeSlots));
    synthesisReadinessPanel.setAttribute("data-completed-session-count", String(state.completeSlots));
    synthesisReadinessPanel.setAttribute("data-synthesis-completed-session-count", String(state.completeSlots));
    synthesisReadinessPanel.setAttribute("data-required-session-slots", String(state.requiredSlots));
    synthesisReadinessPanel.setAttribute("data-required-session-count", String(state.requiredSlots));
    synthesisReadinessPanel.setAttribute("data-synthesis-required-session-count", String(state.requiredSlots));
    synthesisReadinessPanel.setAttribute("data-selected-draft-id", state.selectedDraftId);
    synthesisReadinessPanel.setAttribute("data-synthesis-selected-draft", state.selectedDraftId);
    synthesisReadinessPanel.setAttribute("data-blocker-count", String(state.blockerCount));
    synthesisReadinessPanel.setAttribute("data-raw-note-slots-complete", String(state.rawCompleteCount));
    synthesisReadinessPanel.setAttribute("data-debrief-slots-complete", String(state.debriefCompleteCount));
    synthesisReadinessPanel.setAttribute("data-objection-code-slots-complete", String(state.objectionCodeCompleteCount));
    synthesisReadinessPanel.setAttribute("data-local-only", "true");
    synthesisReadinessPanel.setAttribute("data-export-text-unchanged", "true");
    synthesisReadinessPanel.setAttribute("data-download-text-unchanged", "true");

    for (const link of synthesisReadinessPanel.querySelectorAll("[data-synthesis-artifact]")) {
      link.setAttribute("data-synthesis-link-state", state.ready ? "ready" : "blocked");
    }

    if (synthesisReadinessStatus) {
      synthesisReadinessStatus.className = `status-pill ${state.ready ? "is-approved" : "is-rejected"}`;
      synthesisReadinessStatus.setAttribute("data-synthesis-readiness-status", state.readiness);
      synthesisReadinessStatus.textContent = state.ready ? "Ready" : "Blocked";
    }

    if (synthesisSessionSlotList) {
      synthesisSessionSlotList.innerHTML = state.slots
        .map((slot) => {
          const label = slot.intakeId ? `User draft ${slot.intakeId.slice(0, 18)}` : "Empty real session slot";
          return `<article
            class="synthesis-slot"
            data-synthesis-slot="${slot.index}"
            data-selected-draft-id="${escapeHtml(slot.intakeId)}"
            data-session-slot-complete="${slot.complete ? "true" : "false"}"
            data-raw-note-complete="${slot.rawComplete ? "true" : "false"}"
            data-debrief-complete="${slot.debriefComplete ? "true" : "false"}"
            data-objection-code-complete="${slot.objectionCodeComplete ? "true" : "false"}"
          >
            <div class="synthesis-slot-head">
              <strong>Session ${slot.index}</strong>
              <span class="status-pill ${slot.complete ? "is-approved" : "is-rejected"}">${slot.complete ? "Complete" : "Blocked"}</span>
            </div>
            <p>${escapeHtml(label)}</p>
            <div class="synthesis-slot-checks">
              <span class="status-pill ${slot.rawComplete ? "is-approved" : "is-pending"}">Raw note ${slot.rawComplete ? "complete" : "missing"}</span>
              <span class="status-pill ${slot.debriefComplete ? "is-approved" : "is-pending"}">Debrief ${slot.debriefComplete ? "complete" : "missing"}</span>
              <span class="status-pill ${slot.objectionCodeComplete ? "is-approved" : "is-pending"}">Code ${slot.objectionCodeComplete ? "complete" : "missing"}</span>
            </div>
          </article>`;
        })
        .join("");
    }

    setText(synthesisRawNotesState, `${state.rawCompleteCount} / ${state.requiredSlots} complete`);
    setText(synthesisDebriefState, `${state.debriefCompleteCount} / ${state.requiredSlots} complete`);
    setText(synthesisObjectionCodeState, `${state.objectionCodeCompleteCount} / ${state.requiredSlots} complete`);
    setText(synthesisTemplateState, state.ready ? "Ready" : "Blocked");
    setText(
      synthesisReadinessNote,
      state.ready
        ? "Local-only synthesis readiness is ready: five real user-session slots have raw notes, debrief drafts, and private objection tags. Resume export and download text unchanged."
        : `Local-only synthesis readiness is blocked: ${state.completeSlots} of ${state.requiredSlots} real user-session slots are complete. Resume export and download text unchanged.`
    );
  }

  function renderPrivateSynthesisArtifactPanel() {
    if (!privateSynthesisArtifactPanel) return;
    const latest = latestIntake();
    const state = privateSynthesisArtifactState(loadIntakes(), latest);
    const statusLabel = state.ready ? (state.drafted ? "Drafted" : "Ready") : "Blocked";
    const statusClass = state.ready ? (state.drafted ? "is-approved" : "is-pending") : "is-rejected";

    privateSynthesisArtifactPanel.setAttribute("data-synthesis-artifact-readiness", state.status);
    privateSynthesisArtifactPanel.setAttribute("data-synthesis-artifact-state", state.status);
    privateSynthesisArtifactPanel.setAttribute("data-synthesis-artifact-blocked", state.ready ? "false" : "true");
    privateSynthesisArtifactPanel.setAttribute("data-synthesis-artifact-drafted", state.drafted ? "true" : "false");
    privateSynthesisArtifactPanel.setAttribute("data-private-synthesis-artifact-drafted", state.drafted ? "true" : "false");
    privateSynthesisArtifactPanel.setAttribute("data-artifact-drafted", state.drafted ? "true" : "false");
    privateSynthesisArtifactPanel.setAttribute("data-ready-to-generate", state.ready ? "true" : "false");
    privateSynthesisArtifactPanel.setAttribute("data-source-packet-count", String(state.sourcePacketCount));
    privateSynthesisArtifactPanel.setAttribute("data-required-packet-count", String(state.requiredPacketCount));
    privateSynthesisArtifactPanel.setAttribute("data-evidence-packets-complete", String(state.sourcePacketCount));
    privateSynthesisArtifactPanel.setAttribute("data-required-evidence-packets", String(state.requiredPacketCount));
    privateSynthesisArtifactPanel.setAttribute("data-selected-draft-id", latest?.id || "");
    privateSynthesisArtifactPanel.setAttribute("data-local-only", "true");
    privateSynthesisArtifactPanel.setAttribute("data-private", "true");
    privateSynthesisArtifactPanel.setAttribute("data-export-text-unchanged", "true");
    privateSynthesisArtifactPanel.setAttribute("data-download-text-unchanged", "true");

    if (privateSynthesisArtifactStatus) {
      privateSynthesisArtifactStatus.className = `status-pill ${statusClass}`;
      privateSynthesisArtifactStatus.setAttribute("data-synthesis-artifact-status", state.status);
      privateSynthesisArtifactStatus.textContent = statusLabel;
    }
    if (generatePrivateSynthesisArtifactButton instanceof HTMLButtonElement) {
      generatePrivateSynthesisArtifactButton.toggleAttribute("disabled", !state.ready);
      generatePrivateSynthesisArtifactButton.setAttribute("data-generator-disabled", state.ready ? "false" : "true");
      generatePrivateSynthesisArtifactButton.setAttribute("data-export-text-unchanged", "true");
      generatePrivateSynthesisArtifactButton.setAttribute("data-download-text-unchanged", "true");
    }
    setText(privateSynthesisArtifactPreview, state.drafted ? state.artifactText : "No private synthesis artifact drafted.");
    setText(
      privateSynthesisArtifactNote,
      state.ready
        ? `Local-only private synthesis generator is ${state.drafted ? "drafted" : "ready"} from ${
            state.readiness.completeSlots
          } complete evidence packets. Resume export and download text unchanged.`
        : `Local-only private synthesis generator is disabled until five complete evidence packets exist; ${state.readiness.completeSlots} of ${state.readiness.requiredSlots} are complete. Resume export and download text unchanged.`
    );
  }

  function renderPrivateSynthesisDecisionMemoPanel() {
    if (!privateSynthesisDecisionMemoPanel) return;
    const latest = latestIntake();
    const state = privateSynthesisDecisionMemoState(loadIntakes(), latest);
    const statusLabel = !state.artifactExists ? "Blocked" : state.drafted ? "Memo drafted" : "Artifact ready";
    const statusClass = !state.artifactExists ? "is-rejected" : state.drafted ? "is-approved" : "is-pending";

    privateSynthesisDecisionMemoPanel.hidden = !state.artifactExists;
    privateSynthesisDecisionMemoPanel.setAttribute("data-decision-memo-readiness", state.readiness);
    privateSynthesisDecisionMemoPanel.setAttribute("data-synthesis-decision-memo-state", state.readiness);
    privateSynthesisDecisionMemoPanel.setAttribute("data-synthesis-artifact-exists", state.artifactExists ? "true" : "false");
    privateSynthesisDecisionMemoPanel.setAttribute("data-decision-memo-drafted", state.drafted ? "true" : "false");
    privateSynthesisDecisionMemoPanel.setAttribute("data-selected-draft-id", state.selectedDraftId);
    privateSynthesisDecisionMemoPanel.setAttribute("data-source-packet-count", String(state.sourcePacketCount));
    privateSynthesisDecisionMemoPanel.setAttribute("data-required-packet-count", String(state.requiredPacketCount));
    privateSynthesisDecisionMemoPanel.setAttribute("data-local-only", "true");
    privateSynthesisDecisionMemoPanel.setAttribute("data-private", "true");
    privateSynthesisDecisionMemoPanel.setAttribute("data-export-text-unchanged", "true");
    privateSynthesisDecisionMemoPanel.setAttribute("data-download-text-unchanged", "true");
    privateSynthesisDecisionMemoPanel.setAttribute("data-public-product-copy-unchanged", "true");

    if (privateSynthesisDecisionMemoStatus) {
      privateSynthesisDecisionMemoStatus.className = `status-pill ${statusClass}`;
      privateSynthesisDecisionMemoStatus.setAttribute("data-decision-memo-status", state.readiness);
      privateSynthesisDecisionMemoStatus.textContent = statusLabel;
    }

    for (const field of [
      decisionMemoReviewedDecision,
      decisionMemoEvidenceConfidence,
      decisionMemoPublicChangeGuard,
      decisionMemoOperatorNotes,
    ]) {
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
        field.toggleAttribute("disabled", !state.artifactExists);
        field.setAttribute("data-export-eligible", "false");
        field.setAttribute("data-download-eligible", "false");
        field.setAttribute("data-private-decision-memo-field", "true");
        field.setAttribute("data-selected-draft-id", state.selectedDraftId);
      }
    }
    if (decisionMemoReviewedDecision instanceof HTMLSelectElement) decisionMemoReviewedDecision.value = state.reviewedDecision;
    if (decisionMemoEvidenceConfidence instanceof HTMLSelectElement) decisionMemoEvidenceConfidence.value = state.evidenceConfidence;
    if (decisionMemoPublicChangeGuard instanceof HTMLInputElement) decisionMemoPublicChangeGuard.value = state.publicChangeGuard;
    if (decisionMemoOperatorNotes instanceof HTMLTextAreaElement) decisionMemoOperatorNotes.value = state.operatorNotes;
    if (savePrivateSynthesisDecisionMemoButton) savePrivateSynthesisDecisionMemoButton.toggleAttribute("disabled", !state.artifactExists);
    if (clearPrivateSynthesisDecisionMemoButton) {
      clearPrivateSynthesisDecisionMemoButton.toggleAttribute("disabled", !state.artifactExists || !state.drafted);
    }

    if (privateSynthesisDecisionMemoSummary) {
      privateSynthesisDecisionMemoSummary.setAttribute("data-decision-memo-state", state.readiness);
      privateSynthesisDecisionMemoSummary.textContent = !state.artifactExists
        ? "Blocked until a private synthesis artifact exists."
        : state.drafted
        ? `Private memo saved: ${state.reviewedDecision || "decision not selected"}; ${
            state.evidenceConfidence || "confidence not selected"
          }. Public/product copy remains unchanged.`
        : "Private synthesis artifact exists. Capture the reviewed decision fields locally before any separate approval step.";
    }

    setText(
      privateSynthesisDecisionMemoNote,
      state.artifactExists
        ? "Local-only decision memo capture is open because a private synthesis artifact exists. Fields stay in browser metadata and never change resume export, download text, or public/product copy."
        : "Private decision memo capture stays closed until a private synthesis artifact exists."
    );
  }

  function renderPrivateLaunchDecisionApprovalPanel() {
    if (!privateLaunchDecisionApprovalPanel) return;
    const latest = latestIntake();
    const state = privateLaunchDecisionApprovalState(loadIntakes(), latest);
    const statusLabel = !state.memoComplete ? "Blocked" : state.drafted ? "Approval drafted" : "Memo ready";
    const statusClass = !state.memoComplete ? "is-rejected" : state.drafted ? "is-approved" : "is-pending";

    privateLaunchDecisionApprovalPanel.hidden = !state.memoComplete;
    privateLaunchDecisionApprovalPanel.setAttribute("data-launch-decision-approval-readiness", state.readiness);
    privateLaunchDecisionApprovalPanel.setAttribute("data-launch-decision-approval-state", state.readiness);
    privateLaunchDecisionApprovalPanel.setAttribute("data-synthesis-decision-memo-complete", state.memoComplete ? "true" : "false");
    privateLaunchDecisionApprovalPanel.setAttribute("data-launch-decision-approval-drafted", state.drafted ? "true" : "false");
    privateLaunchDecisionApprovalPanel.setAttribute("data-selected-draft-id", state.selectedDraftId);
    privateLaunchDecisionApprovalPanel.setAttribute("data-local-only", "true");
    privateLaunchDecisionApprovalPanel.setAttribute("data-private", "true");
    privateLaunchDecisionApprovalPanel.setAttribute("data-export-text-unchanged", "true");
    privateLaunchDecisionApprovalPanel.setAttribute("data-download-text-unchanged", "true");
    privateLaunchDecisionApprovalPanel.setAttribute("data-public-product-copy-unchanged", "true");

    if (privateLaunchDecisionApprovalStatus) {
      privateLaunchDecisionApprovalStatus.className = `status-pill ${statusClass}`;
      privateLaunchDecisionApprovalStatus.setAttribute("data-launch-decision-approval-status", state.readiness);
      privateLaunchDecisionApprovalStatus.textContent = statusLabel;
    }

    for (const field of [launchDecisionApprovalDecision, launchDecisionApprovalReviewer, launchDecisionApprovalNotes]) {
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
        field.toggleAttribute("disabled", !state.memoComplete);
        field.setAttribute("data-export-eligible", "false");
        field.setAttribute("data-download-eligible", "false");
        field.setAttribute("data-private-launch-decision-approval-field", "true");
        field.setAttribute("data-selected-draft-id", state.selectedDraftId);
      }
    }
    if (launchDecisionApprovalDecision instanceof HTMLSelectElement) launchDecisionApprovalDecision.value = state.launchDecision;
    if (launchDecisionApprovalReviewer instanceof HTMLInputElement) launchDecisionApprovalReviewer.value = state.reviewer;
    if (launchDecisionApprovalNotes instanceof HTMLTextAreaElement) launchDecisionApprovalNotes.value = state.approvalNotes;
    if (savePrivateLaunchDecisionApprovalButton) savePrivateLaunchDecisionApprovalButton.toggleAttribute("disabled", !state.memoComplete);
    if (clearPrivateLaunchDecisionApprovalButton) {
      clearPrivateLaunchDecisionApprovalButton.toggleAttribute("disabled", !state.memoComplete || !state.drafted);
    }

    if (privateLaunchDecisionApprovalSummary) {
      privateLaunchDecisionApprovalSummary.setAttribute("data-launch-decision-approval-state", state.readiness);
      privateLaunchDecisionApprovalSummary.textContent = !state.memoComplete
        ? "Blocked until a completed private synthesis decision memo exists."
        : state.drafted
        ? `Private launch review saved: ${state.launchDecision || "decision not selected"}. Public/product copy remains unchanged.`
        : "Completed private decision memo exists. Record publish-reviewed or no-publish-reviewed approval locally.";
    }

    setText(
      privateLaunchDecisionApprovalNote,
      state.memoComplete
        ? "Local-only launch approval capture is open because a completed private synthesis decision memo exists. Approval fields stay in browser metadata and never change resume export, download text, or public/product copy."
        : "Private launch approval capture stays closed until a completed private synthesis decision memo exists."
    );
  }

  function renderPrivateExplicitPublishPlanPanel() {
    if (!privateExplicitPublishPlanPanel) return;
    const latest = latestIntake();
    const state = privateExplicitPublishPlanState(latest);
    const statusLabel = !state.checklistComplete ? "Blocked" : state.drafted ? "Plan drafted" : "Readiness complete";
    const statusClass = !state.checklistComplete ? "is-rejected" : state.drafted ? "is-approved" : "is-pending";

    privateExplicitPublishPlanPanel.hidden = !state.checklistComplete;
    privateExplicitPublishPlanPanel.setAttribute("data-publish-plan-readiness", state.state);
    privateExplicitPublishPlanPanel.setAttribute("data-private-explicit-publish-plan-state", state.state);
    privateExplicitPublishPlanPanel.setAttribute("data-publish-readiness-checklist-complete", state.checklistComplete ? "true" : "false");
    privateExplicitPublishPlanPanel.setAttribute("data-publish-plan-drafted", state.drafted ? "true" : "false");
    privateExplicitPublishPlanPanel.setAttribute("data-selected-draft-id", state.selectedDraftId);
    privateExplicitPublishPlanPanel.setAttribute("data-source-publish-readiness-checklist", state.readiness.checklistPath);
    privateExplicitPublishPlanPanel.setAttribute("data-local-only", "true");
    privateExplicitPublishPlanPanel.setAttribute("data-private", "true");
    privateExplicitPublishPlanPanel.setAttribute("data-export-eligible", "false");
    privateExplicitPublishPlanPanel.setAttribute("data-download-eligible", "false");
    privateExplicitPublishPlanPanel.setAttribute("data-export-text-unchanged", "true");
    privateExplicitPublishPlanPanel.setAttribute("data-download-text-unchanged", "true");
    privateExplicitPublishPlanPanel.setAttribute("data-public-product-copy-unchanged", "true");
    privateExplicitPublishPlanPanel.setAttribute("data-no-publish-action", "true");

    if (privateExplicitPublishPlanStatus) {
      privateExplicitPublishPlanStatus.className = `status-pill ${statusClass}`;
      privateExplicitPublishPlanStatus.setAttribute("data-publish-plan-status", state.state);
      privateExplicitPublishPlanStatus.textContent = statusLabel;
    }

    for (const field of [publishPlanOwner, publishPlanRollback, publishPlanClaimRisk, publishPlanPublicCopyDiff]) {
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        field.toggleAttribute("disabled", !state.checklistComplete);
        field.setAttribute("data-export-eligible", "false");
        field.setAttribute("data-download-eligible", "false");
        field.setAttribute("data-private-explicit-publish-plan-field", "true");
        field.setAttribute("data-selected-draft-id", state.selectedDraftId);
      }
    }
    if (publishPlanOwner instanceof HTMLInputElement) publishPlanOwner.value = state.owner;
    if (publishPlanRollback instanceof HTMLTextAreaElement) publishPlanRollback.value = state.rollback;
    if (publishPlanClaimRisk instanceof HTMLTextAreaElement) publishPlanClaimRisk.value = state.claimRisk;
    if (publishPlanPublicCopyDiff instanceof HTMLTextAreaElement) publishPlanPublicCopyDiff.value = state.publicCopyDiff;
    if (savePrivateExplicitPublishPlanButton) savePrivateExplicitPublishPlanButton.toggleAttribute("disabled", !state.checklistComplete);
    if (clearPrivateExplicitPublishPlanButton) {
      clearPrivateExplicitPublishPlanButton.toggleAttribute("disabled", !state.checklistComplete || !state.drafted);
    }

    if (privateExplicitPublishPlanSummary) {
      privateExplicitPublishPlanSummary.setAttribute("data-publish-plan-state", state.state);
      privateExplicitPublishPlanSummary.textContent = !state.checklistComplete
        ? "Blocked until a completed private publish-readiness checklist exists."
        : state.drafted
        ? `Private publish plan saved for ${state.owner || "owner not set"}. No publish action was taken.`
        : "Completed private publish-readiness checklist exists. Capture owner, rollback, claim-risk, and public-copy-diff fields locally.";
    }

    setText(
      privateExplicitPublishPlanNote,
      state.checklistComplete
        ? "Local-only publish-plan capture is open because a completed private publish-readiness checklist exists. Fields stay in browser metadata, are not export/download eligible, and do not publish or change public/product copy."
        : "Private publish-plan capture stays closed until a completed private publish-readiness checklist exists."
    );
  }

  function renderPrivatePublicCopyDiffRollbackPanel() {
    if (!privatePublicCopyDiffRollbackPanel) return;
    const latest = latestIntake();
    const state = privatePublicCopyDiffRollbackState(latest);
    const statusLabel = !state.planComplete ? "Blocked" : state.drafted ? "Diff packet drafted" : "Plan complete";
    const statusClass = !state.planComplete ? "is-rejected" : state.drafted ? "is-approved" : "is-pending";

    privatePublicCopyDiffRollbackPanel.hidden = !state.planComplete;
    privatePublicCopyDiffRollbackPanel.setAttribute("data-public-copy-diff-rollback-readiness", state.state);
    privatePublicCopyDiffRollbackPanel.setAttribute("data-explicit-publish-plan-complete", state.planComplete ? "true" : "false");
    privatePublicCopyDiffRollbackPanel.setAttribute("data-public-copy-diff-rollback-drafted", state.drafted ? "true" : "false");
    privatePublicCopyDiffRollbackPanel.setAttribute("data-selected-draft-id", state.selectedDraftId);
    privatePublicCopyDiffRollbackPanel.setAttribute("data-source-explicit-publish-plan-state", state.planState.state);
    privatePublicCopyDiffRollbackPanel.setAttribute("data-local-only", "true");
    privatePublicCopyDiffRollbackPanel.setAttribute("data-private", "true");
    privatePublicCopyDiffRollbackPanel.setAttribute("data-export-eligible", "false");
    privatePublicCopyDiffRollbackPanel.setAttribute("data-download-eligible", "false");
    privatePublicCopyDiffRollbackPanel.setAttribute("data-export-text-unchanged", "true");
    privatePublicCopyDiffRollbackPanel.setAttribute("data-download-text-unchanged", "true");
    privatePublicCopyDiffRollbackPanel.setAttribute("data-public-product-copy-unchanged", "true");
    privatePublicCopyDiffRollbackPanel.setAttribute("data-no-publish-action", "true");

    if (privatePublicCopyDiffRollbackStatus) {
      privatePublicCopyDiffRollbackStatus.className = `status-pill ${statusClass}`;
      privatePublicCopyDiffRollbackStatus.setAttribute("data-public-copy-diff-rollback-status", state.state);
      privatePublicCopyDiffRollbackStatus.textContent = statusLabel;
    }

    for (const field of [
      copyDiffRollbackDiffSummary,
      copyDiffRollbackConsentCheck,
      copyDiffRollbackClaimRiskCheck,
      copyDiffRollbackValidationCommand,
      copyDiffRollbackRollbackPath,
    ]) {
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
        field.toggleAttribute("disabled", !state.planComplete);
        field.setAttribute("data-export-eligible", "false");
        field.setAttribute("data-download-eligible", "false");
        field.setAttribute("data-private-public-copy-diff-rollback-field", "true");
        field.setAttribute("data-selected-draft-id", state.selectedDraftId);
      }
    }
    if (copyDiffRollbackDiffSummary instanceof HTMLTextAreaElement) copyDiffRollbackDiffSummary.value = state.diffSummary;
    if (copyDiffRollbackConsentCheck instanceof HTMLSelectElement) copyDiffRollbackConsentCheck.value = state.consentCheck;
    if (copyDiffRollbackClaimRiskCheck instanceof HTMLSelectElement) copyDiffRollbackClaimRiskCheck.value = state.claimRiskCheck;
    if (copyDiffRollbackValidationCommand instanceof HTMLInputElement) copyDiffRollbackValidationCommand.value = state.validationCommand;
    if (copyDiffRollbackRollbackPath instanceof HTMLTextAreaElement) copyDiffRollbackRollbackPath.value = state.rollbackPath;
    if (savePrivatePublicCopyDiffRollbackButton) savePrivatePublicCopyDiffRollbackButton.toggleAttribute("disabled", !state.planComplete);
    if (clearPrivatePublicCopyDiffRollbackButton) {
      clearPrivatePublicCopyDiffRollbackButton.toggleAttribute("disabled", !state.planComplete || !state.drafted);
    }

    if (privatePublicCopyDiffRollbackSummary) {
      privatePublicCopyDiffRollbackSummary.setAttribute("data-public-copy-diff-rollback-state", state.state);
      privatePublicCopyDiffRollbackSummary.textContent = !state.planComplete
        ? "Blocked until a completed explicit publish plan exists."
        : state.drafted
        ? `Private diff packet saved with ${state.validationCommand || "no validation command set"}. No publish action was taken.`
        : "Completed explicit publish plan exists. Capture diff summary, consent, claim-risk, validation, and rollback fields locally.";
    }

    setText(
      privatePublicCopyDiffRollbackNote,
      state.planComplete
        ? "Local-only public-copy diff and rollback capture is open because the explicit publish plan is complete. Fields stay in browser metadata, are not export/download eligible, and do not publish or change public/product copy."
        : "Private public-copy diff and rollback capture stays closed until the explicit publish plan is complete."
    );
  }

  function renderPrivateReleaseCandidateRehearsalPanel() {
    if (!privateReleaseCandidateRehearsalPanel) return;
    const latest = latestIntake();
    const state = privateReleaseCandidateRehearsalState(latest);
    const statusLabel = !state.diffPacketComplete ? "Blocked" : state.drafted ? "Rehearsal ready" : "Diff packet complete";
    const statusClass = !state.diffPacketComplete ? "is-rejected" : state.drafted ? "is-approved" : "is-pending";

    privateReleaseCandidateRehearsalPanel.hidden = !state.diffPacketComplete;
    privateReleaseCandidateRehearsalPanel.setAttribute("data-release-candidate-rehearsal-readiness", state.state);
    privateReleaseCandidateRehearsalPanel.setAttribute("data-release-candidate-rehearsal-state", state.state);
    privateReleaseCandidateRehearsalPanel.setAttribute("data-public-copy-diff-rollback-complete", state.diffPacketComplete ? "true" : "false");
    privateReleaseCandidateRehearsalPanel.setAttribute("data-public-copy-diff-packet-available", state.diffPacketComplete ? "true" : "false");
    privateReleaseCandidateRehearsalPanel.setAttribute("data-diff-packet-available", state.diffPacketComplete ? "true" : "false");
    privateReleaseCandidateRehearsalPanel.setAttribute("data-rehearsal-ready", state.drafted ? "true" : "false");
    privateReleaseCandidateRehearsalPanel.setAttribute("data-release-candidate-rehearsal-ready", state.drafted ? "true" : "false");
    privateReleaseCandidateRehearsalPanel.setAttribute("data-release-candidate-rehearsal-drafted", state.drafted ? "true" : "false");
    privateReleaseCandidateRehearsalPanel.setAttribute("data-selected-draft-id", state.selectedDraftId);
    privateReleaseCandidateRehearsalPanel.setAttribute("data-source-public-copy-diff-rollback-state", state.diffState.state);
    privateReleaseCandidateRehearsalPanel.setAttribute("data-local-only", "true");
    privateReleaseCandidateRehearsalPanel.setAttribute("data-private", "true");
    privateReleaseCandidateRehearsalPanel.setAttribute("data-export-eligible", "false");
    privateReleaseCandidateRehearsalPanel.setAttribute("data-download-eligible", "false");
    privateReleaseCandidateRehearsalPanel.setAttribute("data-export-text-unchanged", "true");
    privateReleaseCandidateRehearsalPanel.setAttribute("data-download-text-unchanged", "true");
    privateReleaseCandidateRehearsalPanel.setAttribute("data-public-product-copy-unchanged", "true");
    privateReleaseCandidateRehearsalPanel.setAttribute("data-no-publish-action", "true");
    privateReleaseCandidateRehearsalPanel.setAttribute("data-no-deploy-action", "true");

    if (privateReleaseCandidateRehearsalStatus) {
      privateReleaseCandidateRehearsalStatus.className = `status-pill ${statusClass}`;
      privateReleaseCandidateRehearsalStatus.setAttribute("data-release-candidate-rehearsal-status", state.state);
      privateReleaseCandidateRehearsalStatus.textContent = statusLabel;
    }

    for (const field of [
      releaseCandidateStaticSmoke,
      releaseCandidateServedSmoke,
      releaseCandidateRollbackRehearsal,
      releaseCandidateConsentCheck,
      releaseCandidateClaimRiskCheck,
    ]) {
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
        field.toggleAttribute("disabled", !state.diffPacketComplete);
        field.setAttribute("data-export-eligible", "false");
        field.setAttribute("data-download-eligible", "false");
        field.setAttribute("data-private-release-candidate-rehearsal-field", "true");
        field.setAttribute("data-selected-draft-id", state.selectedDraftId);
      }
    }
    if (releaseCandidateStaticSmoke instanceof HTMLInputElement) releaseCandidateStaticSmoke.value = state.localStaticSmoke;
    if (releaseCandidateServedSmoke instanceof HTMLInputElement) releaseCandidateServedSmoke.value = state.servedSmoke;
    if (releaseCandidateRollbackRehearsal instanceof HTMLTextAreaElement) releaseCandidateRollbackRehearsal.value = state.rollbackRehearsal;
    if (releaseCandidateConsentCheck instanceof HTMLSelectElement) releaseCandidateConsentCheck.value = state.consentCheck;
    if (releaseCandidateClaimRiskCheck instanceof HTMLSelectElement) releaseCandidateClaimRiskCheck.value = state.claimRiskCheck;
    if (savePrivateReleaseCandidateRehearsalButton) savePrivateReleaseCandidateRehearsalButton.toggleAttribute("disabled", !state.diffPacketComplete);
    if (clearPrivateReleaseCandidateRehearsalButton) {
      clearPrivateReleaseCandidateRehearsalButton.toggleAttribute("disabled", !state.diffPacketComplete || !state.drafted);
    }

    if (privateReleaseCandidateRehearsalSummary) {
      privateReleaseCandidateRehearsalSummary.setAttribute("data-release-candidate-rehearsal-state", state.state);
      privateReleaseCandidateRehearsalSummary.textContent = !state.diffPacketComplete
        ? "Blocked until a completed public-copy diff and rollback packet exists."
        : state.drafted
        ? "Private release-candidate rehearsal ready packet saved locally. No deploy or publish action was taken."
        : "Completed public-copy diff and rollback packet exists. Capture local smoke, rollback rehearsal, consent, and claim-risk checks.";
    }

    setText(
      privateReleaseCandidateRehearsalNote,
      state.diffPacketComplete
        ? "Local-only release-candidate rehearsal is open because the public-copy diff and rollback packet is complete. Fields stay in browser metadata, are not export/download eligible, and do not deploy, publish, or change public/product copy."
        : "Private release-candidate rehearsal stays closed until the public-copy diff and rollback packet is complete."
    );
  }

  function finalDeployGoNoGoState(readinessState, handoffState, healthCheckHandoffState) {
    const missing = [];
    if (!readinessState?.rehearsalComplete) missing.push("Release-candidate rehearsal: Not observed");
    if (!readinessState?.staticDeployRehearsalReady) missing.push("Static deploy rehearsal: Not observed / not passed locally");
    if (handoffState?.state !== "owner-inputs-needed") missing.push("Platform-owner handoff: Blocked");
    if (healthCheckHandoffState?.state !== "route-handoff-ready") missing.push("Post-deploy health-check owner handoff: Blocked");
    if (!readinessState?.explicitHumanApprovalObserved) missing.push("Explicit future human approval outside repo: Not observed");
    missing.push("Credentials outside repo: Not observed");
    missing.push("Production origin outside repo: Not observed");
    missing.push("Deploy trigger outside repo: Not observed");
    missing.push("Rollback readiness: Not observed");
    missing.push("Post-deploy health evidence: Not observed");

    const guardrails = readinessState?.staticDeployRehearsal?.noDeployGuardrails || {};
    const productionDeploymentState = safeText(guardrails.productionDeploymentState || "Do Not Deploy");

    return {
      decision: "No-Go / Do Not Deploy",
      productionDeploymentState,
      missing,
    };
  }

  function renderPrivateCredentialedDeployReadinessPanel() {
    if (!privateCredentialedDeployReadinessPanel) return;
    const latest = latestIntake();
    const state = privateCredentialedDeployReadinessState(latest, staticDeployRehearsalEvidence);
    const statusLabel = !state.rehearsalComplete
      ? "Rehearsal blocked"
      : !state.staticDeployRehearsalReady
      ? "Static rehearsal needed"
      : !state.explicitHumanApprovalObserved
      ? "Human approval blocked"
      : state.inputsComplete
      ? "Inputs ready"
      : "Inputs blocked";
    const statusClass =
      !state.rehearsalComplete || state.staticDeployRehearsal.state === "blocked-local" || !state.explicitHumanApprovalObserved
        ? "is-rejected"
        : state.inputsComplete
        ? "is-approved"
        : "is-pending";

    privateCredentialedDeployReadinessPanel.hidden = !state.rehearsalComplete;
    privateCredentialedDeployReadinessPanel.setAttribute("data-credentialed-deploy-readiness", state.state);
    privateCredentialedDeployReadinessPanel.setAttribute("data-release-candidate-rehearsal-complete", state.rehearsalComplete ? "true" : "false");
    privateCredentialedDeployReadinessPanel.setAttribute("data-credentialed-deploy-inputs-complete", state.inputsComplete ? "true" : "false");
    privateCredentialedDeployReadinessPanel.setAttribute("data-static-deploy-rehearsal-status", state.staticDeployRehearsal.state);
    privateCredentialedDeployReadinessPanel.setAttribute("data-static-deploy-rehearsal-ready", state.staticDeployRehearsalReady ? "true" : "false");
    privateCredentialedDeployReadinessPanel.setAttribute("data-static-deploy-rehearsal-report", state.staticDeployRehearsal.reportPath);
    privateCredentialedDeployReadinessPanel.setAttribute("data-missing-inputs", state.missingInputs.join(","));
    privateCredentialedDeployReadinessPanel.setAttribute("data-selected-draft-id", state.selectedDraftId);
    privateCredentialedDeployReadinessPanel.setAttribute("data-source-release-candidate-rehearsal-state", state.rehearsalState.state);
    privateCredentialedDeployReadinessPanel.setAttribute("data-local-only", "true");
    privateCredentialedDeployReadinessPanel.setAttribute("data-private", "true");
    privateCredentialedDeployReadinessPanel.setAttribute("data-no-secret-storage", "true");
    privateCredentialedDeployReadinessPanel.setAttribute("data-no-deploy-action", "true");
    privateCredentialedDeployReadinessPanel.setAttribute("data-no-publish-action", "true");
    privateCredentialedDeployReadinessPanel.setAttribute("data-export-eligible", "false");
    privateCredentialedDeployReadinessPanel.setAttribute("data-download-eligible", "false");
    privateCredentialedDeployReadinessPanel.setAttribute("data-export-text-unchanged", "true");
    privateCredentialedDeployReadinessPanel.setAttribute("data-download-text-unchanged", "true");
    privateCredentialedDeployReadinessPanel.setAttribute("data-public-product-copy-unchanged", "true");

    if (privateCredentialedDeployReadinessStatus) {
      privateCredentialedDeployReadinessStatus.className = `status-pill ${statusClass}`;
      privateCredentialedDeployReadinessStatus.setAttribute("data-credentialed-deploy-readiness-status", state.state);
      privateCredentialedDeployReadinessStatus.textContent = statusLabel;
    }

    if (credentialedDeployStaticRehearsalEvidence) {
      credentialedDeployStaticRehearsalEvidence.setAttribute("data-static-deploy-rehearsal-status", state.staticDeployRehearsal.state);
      credentialedDeployStaticRehearsalEvidence.setAttribute("data-static-deploy-rehearsal-ready", state.staticDeployRehearsalReady ? "true" : "false");
      credentialedDeployStaticRehearsalEvidence.setAttribute("data-static-deploy-rehearsal-report", state.staticDeployRehearsal.reportPath);
      credentialedDeployStaticRehearsalEvidence.setAttribute("data-no-secret-storage", "true");
      credentialedDeployStaticRehearsalEvidence.setAttribute("data-no-deploy-action", "true");
      credentialedDeployStaticRehearsalEvidence.setAttribute("data-export-eligible", "false");
      credentialedDeployStaticRehearsalEvidence.setAttribute("data-download-eligible", "false");
    }
    setText(credentialedDeployStaticRehearsalStatus, state.staticDeployRehearsal.stateLabel);
    setText(
      credentialedDeployStaticRehearsalSummary,
      `${state.staticDeployRehearsal.routeSummary} ${state.staticDeployRehearsal.evidenceNote}`
    );
    if (credentialedDeployStaticRehearsalRoutes) {
      credentialedDeployStaticRehearsalRoutes.innerHTML = state.staticDeployRehearsal.routes.length
        ? state.staticDeployRehearsal.routes
            .map((route) => `<li data-route-status="${route.ok ? "pass" : "fail"}">${escapeHtml(route.route)}: ${route.ok ? "pass" : "fail"}</li>`)
            .join("")
        : `<li data-route-status="not-run">No local route evidence visible yet.</li>`;
    }
    renderStaticDeployRehearsalDrilldown(credentialedDeployStaticRehearsalDrilldown, state.staticDeployRehearsal);
    const handoffState = platformOwnerHandoffState(state);
    if (platformOwnerHandoffPanel) {
      platformOwnerHandoffPanel.setAttribute("data-platform-owner-handoff-state", handoffState.state);
      platformOwnerHandoffPanel.setAttribute("data-static-deploy-rehearsal-ready", handoffState.staticDeployRehearsalReady ? "true" : "false");
      platformOwnerHandoffPanel.setAttribute("data-missing-non-secret-categories", handoffState.missingCategories.join(","));
      platformOwnerHandoffPanel.setAttribute("data-source-checklist", handoffState.checklistPath);
      platformOwnerHandoffPanel.setAttribute("data-local-only", "true");
      platformOwnerHandoffPanel.setAttribute("data-private", "true");
      platformOwnerHandoffPanel.setAttribute("data-no-secret-storage", "true");
      platformOwnerHandoffPanel.setAttribute("data-no-deploy-action", "true");
      platformOwnerHandoffPanel.setAttribute("data-no-publish-action", "true");
      platformOwnerHandoffPanel.setAttribute("data-export-eligible", "false");
      platformOwnerHandoffPanel.setAttribute("data-download-eligible", "false");
    }
    setText(
      platformOwnerHandoffStatus,
      handoffState.staticDeployRehearsalReady ? "Platform-owner handoff ready locally" : "Platform-owner handoff blocked"
    );
    setText(
      platformOwnerHandoffSummary,
      handoffState.staticDeployRehearsalReady
        ? `Passed local static rehearsal evidence is visible. ${handoffState.missingCount} non-secret platform-owner categor${
            handoffState.missingCount === 1 ? "y is" : "ies are"
          } still needed before any separate deploy action.`
        : "Waiting for passed local static rehearsal evidence before listing platform-owner input categories."
    );
    if (platformOwnerHandoffMissingCategories) {
      platformOwnerHandoffMissingCategories.innerHTML = handoffState.staticDeployRehearsalReady
        ? handoffState.missingCategories
            .map((category) => `<li data-platform-owner-category="${escapeHtml(category)}">Still needed: ${escapeHtml(category)}</li>`)
            .join("")
        : `<li data-platform-owner-category="blocked">Passed local static rehearsal evidence required first.</li>`;
    }
    const healthCheckHandoffState = postDeployHealthCheckHandoffState(state);
    if (postDeployHealthCheckHandoffPanel) {
      postDeployHealthCheckHandoffPanel.setAttribute("data-post-deploy-health-check-handoff-state", healthCheckHandoffState.state);
      postDeployHealthCheckHandoffPanel.setAttribute("data-static-deploy-rehearsal-ready", healthCheckHandoffState.staticDeployRehearsalReady ? "true" : "false");
      postDeployHealthCheckHandoffPanel.setAttribute("data-route-count", String(healthCheckHandoffState.routeCount));
      postDeployHealthCheckHandoffPanel.setAttribute("data-source-template", healthCheckHandoffState.templatePath);
      postDeployHealthCheckHandoffPanel.setAttribute("data-local-only", "true");
      postDeployHealthCheckHandoffPanel.setAttribute("data-private", "true");
      postDeployHealthCheckHandoffPanel.setAttribute("data-route-only", "true");
      postDeployHealthCheckHandoffPanel.setAttribute("data-no-secret-storage", "true");
      postDeployHealthCheckHandoffPanel.setAttribute("data-no-production-url", "true");
      postDeployHealthCheckHandoffPanel.setAttribute("data-no-credential", "true");
      postDeployHealthCheckHandoffPanel.setAttribute("data-no-deploy-trigger", "true");
      postDeployHealthCheckHandoffPanel.setAttribute("data-no-deploy-action", "true");
      postDeployHealthCheckHandoffPanel.setAttribute("data-no-publish-action", "true");
      postDeployHealthCheckHandoffPanel.setAttribute("data-export-eligible", "false");
      postDeployHealthCheckHandoffPanel.setAttribute("data-download-eligible", "false");
    }
    setText(
      postDeployHealthCheckHandoffStatus,
      healthCheckHandoffState.state === "route-handoff-ready"
        ? "Post-deploy health-check handoff ready locally"
        : "Post-deploy health-check handoff blocked"
    );
    setText(
      postDeployHealthCheckHandoffSummary,
      healthCheckHandoffState.state === "route-handoff-ready"
        ? `${healthCheckHandoffState.routeCount} local route${healthCheckHandoffState.routeCount === 1 ? "" : "s"} ready for owner handoff. Production URL, credentials, and deploy trigger remain unavailable in this local state.`
        : "Waiting for passed local route evidence before preparing the private health-check owner handoff."
    );
    if (postDeployHealthCheckHandoffRoutes) {
      postDeployHealthCheckHandoffRoutes.innerHTML = healthCheckHandoffState.routes.length
        ? healthCheckHandoffState.routes
            .map((route) => `<li data-health-check-route="${escapeHtml(route.route)}">${escapeHtml(route.route)}: local route ${route.ok ? "ready" : "blocked"}</li>`)
            .join("")
        : `<li data-health-check-route="blocked">No route-only health-check handoff entries visible yet.</li>`;
    }

    const finalDecision = finalDeployGoNoGoState(state, handoffState, healthCheckHandoffState);
    if (finalDeployGoNoGoPanel) {
      finalDeployGoNoGoPanel.hidden = healthCheckHandoffState.state !== "route-handoff-ready";
      finalDeployGoNoGoPanel.setAttribute("data-final-deploy-decision", "no-go");
      finalDeployGoNoGoPanel.setAttribute("data-production-deployment-state", finalDecision.productionDeploymentState);
      finalDeployGoNoGoPanel.setAttribute("data-human-approval-observed", state.explicitHumanApprovalObserved ? "true" : "false");
      finalDeployGoNoGoPanel.setAttribute("data-platform-inputs-enabled", state.platformInputsEnabled ? "true" : "false");
      finalDeployGoNoGoPanel.setAttribute("data-local-only", "true");
      finalDeployGoNoGoPanel.setAttribute("data-private", "true");
      finalDeployGoNoGoPanel.setAttribute("data-read-only", "true");
      finalDeployGoNoGoPanel.setAttribute("data-no-secret-storage", "true");
      finalDeployGoNoGoPanel.setAttribute("data-no-production-url", "true");
      finalDeployGoNoGoPanel.setAttribute("data-no-credential", "true");
      finalDeployGoNoGoPanel.setAttribute("data-no-deploy-trigger", "true");
      finalDeployGoNoGoPanel.setAttribute("data-no-deploy-action", "true");
      finalDeployGoNoGoPanel.setAttribute("data-no-publish-action", "true");
      finalDeployGoNoGoPanel.setAttribute("data-export-eligible", "false");
      finalDeployGoNoGoPanel.setAttribute("data-download-eligible", "false");
    }
    setText(finalDeployGoNoGoStatus, `Final decision: ${finalDecision.decision}`);
    setText(
      finalDeployGoNoGoSummary,
      `Production deployment state: ${finalDecision.productionDeploymentState}. This local-only read-only panel cannot authorize deploy.`
    );
    if (credentialedDeployHumanApproval instanceof HTMLElement) {
      credentialedDeployHumanApproval.setAttribute("data-human-approval-observed", state.explicitHumanApprovalObserved ? "true" : "false");
      credentialedDeployHumanApproval.setAttribute("data-read-only", "true");
      credentialedDeployHumanApproval.setAttribute("data-export-eligible", "false");
      credentialedDeployHumanApproval.setAttribute("data-download-eligible", "false");
      const approvalPill = credentialedDeployHumanApproval.querySelector(".status-pill");
      if (approvalPill) {
        approvalPill.className = `status-pill ${state.explicitHumanApprovalObserved ? "is-approved" : "is-rejected"}`;
        approvalPill.textContent = state.explicitHumanApprovalObserved ? "Human approval observed" : "Human approval not observed";
      }
    }
    if (finalDeployGoNoGoMissing) {
      finalDeployGoNoGoMissing.innerHTML = finalDecision.missing.map((item) => `<li data-final-deploy-missing="true">${escapeHtml(item)}</li>`).join("");
    }
    const escalationHandoff = deployBlockerEscalationHandoffState(state, finalDecision, handoffState, healthCheckHandoffState);
    if (deployBlockerEscalationHandoffPanel) {
      deployBlockerEscalationHandoffPanel.hidden = !escalationHandoff.finalLedgerReady;
      deployBlockerEscalationHandoffPanel.setAttribute("data-deploy-blocker-escalation-state", escalationHandoff.state);
      deployBlockerEscalationHandoffPanel.setAttribute("data-source-template", escalationHandoff.templatePath);
      deployBlockerEscalationHandoffPanel.setAttribute("data-final-deploy-decision", "no-go");
      deployBlockerEscalationHandoffPanel.setAttribute("data-production-deployment-state", escalationHandoff.productionDeploymentState);
      deployBlockerEscalationHandoffPanel.setAttribute("data-human-approval-observed", "false");
      deployBlockerEscalationHandoffPanel.setAttribute("data-platform-inputs-enabled", "false");
      deployBlockerEscalationHandoffPanel.setAttribute("data-local-only", "true");
      deployBlockerEscalationHandoffPanel.setAttribute("data-private", "true");
      deployBlockerEscalationHandoffPanel.setAttribute("data-read-only", "true");
      deployBlockerEscalationHandoffPanel.setAttribute("data-no-secret-storage", "true");
      deployBlockerEscalationHandoffPanel.setAttribute("data-no-production-url", "true");
      deployBlockerEscalationHandoffPanel.setAttribute("data-no-credential", "true");
      deployBlockerEscalationHandoffPanel.setAttribute("data-no-deploy-trigger", "true");
      deployBlockerEscalationHandoffPanel.setAttribute("data-no-deploy-action", "true");
      deployBlockerEscalationHandoffPanel.setAttribute("data-no-publish-action", "true");
      deployBlockerEscalationHandoffPanel.setAttribute("data-no-human-approval-path", "true");
      deployBlockerEscalationHandoffPanel.setAttribute("data-export-eligible", "false");
      deployBlockerEscalationHandoffPanel.setAttribute("data-download-eligible", "false");
    }
    setText(
      deployBlockerEscalationHandoffStatus,
      escalationHandoff.finalLedgerReady ? "Deploy-blocker escalation handoff: No-Go / Do Not Deploy" : "Deploy-blocker escalation blocked"
    );
    setText(
      deployBlockerEscalationHandoffSummary,
      escalationHandoff.finalLedgerReady
        ? "Private memo-boundary summary is ready for a future human operator. It records unavailable categories only and cannot approve deploy, launch, rollback, credentials, or platform values."
        : "Waiting for the final No-Go ledger before summarizing private deploy-blocker categories."
    );
    if (deployBlockerEscalationEvidenceList) {
      deployBlockerEscalationEvidenceList.innerHTML = escalationHandoff.evidence
        .map((item) => `<li data-deploy-blocker-escalation-evidence="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    if (deployBlockerEscalationUnavailableList) {
      deployBlockerEscalationUnavailableList.innerHTML = escalationHandoff.unavailable
        .map((item) => `<li data-deploy-blocker-escalation-unavailable="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    setText(
      deployBlockerEscalationBoundary,
      "Read-only local handoff: no secrets, no production URL, no deploy trigger, no public launch approval, no rollback authorization, no in-repo human approval path, and no export/download eligibility."
    );
    const firstHumanOperatorPacket = firstHumanOperatorPacketHandoffState(escalationHandoff);
    if (firstHumanOperatorPacketHandoffPanel) {
      firstHumanOperatorPacketHandoffPanel.hidden = !firstHumanOperatorPacket.escalationReady;
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-first-human-operator-packet-state", firstHumanOperatorPacket.state);
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-source-template", firstHumanOperatorPacket.templatePath);
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-final-deploy-decision", "no-go");
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-production-deployment-state", firstHumanOperatorPacket.productionDeploymentState);
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-human-approval-observed", "false");
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-platform-inputs-enabled", "false");
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-local-only", "true");
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-private", "true");
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-read-only", "true");
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-no-secret-storage", "true");
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-no-production-url", "true");
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-no-credential", "true");
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-no-deploy-trigger", "true");
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-no-deploy-action", "true");
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-no-dashboard-link", "true");
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-no-contact-details", "true");
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-no-rollback-authorization", "true");
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-no-public-launch-authorization", "true");
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-no-publish-action", "true");
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-no-human-approval-path", "true");
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-export-eligible", "false");
      firstHumanOperatorPacketHandoffPanel.setAttribute("data-download-eligible", "false");
    }
    setText(
      firstHumanOperatorPacketHandoffStatus,
      firstHumanOperatorPacket.escalationReady
        ? "First-human-operator packet handoff: Read-only"
        : "First-human-operator packet blocked"
    );
    setText(
      firstHumanOperatorPacketHandoffSummary,
      firstHumanOperatorPacket.escalationReady
        ? "Ready local artifacts and unavailable external facts are summarized for the first human operator. This state is read-only and cannot collect platform values, approvals, contacts, rollback authorization, launch authorization, or deploy actions."
        : "Waiting for the deploy-blocker escalation memo before preparing a read-only packet handoff."
    );
    if (firstHumanOperatorPacketReadyArtifactsList) {
      firstHumanOperatorPacketReadyArtifactsList.innerHTML = firstHumanOperatorPacket.readyArtifacts
        .map((item) => `<li data-first-human-operator-ready-artifact="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    if (firstHumanOperatorPacketUnavailableFactsList) {
      firstHumanOperatorPacketUnavailableFactsList.innerHTML = firstHumanOperatorPacket.unavailableFacts
        .map((item) => `<li data-first-human-operator-unavailable-fact="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    setText(
      firstHumanOperatorPacketBoundary,
      "Read-only packet boundary: no credentials, production URL, deploy trigger, dashboard link, contact details, rollback authorization, public launch authorization, human approval path, platform field enablement, export/download eligibility, or deploy action."
    );
    const operatorDryRunReview = operatorDryRunReviewHandoffState(firstHumanOperatorPacket);
    if (operatorDryRunReviewHandoffPanel) {
      operatorDryRunReviewHandoffPanel.hidden = !operatorDryRunReview.packetReady;
      operatorDryRunReviewHandoffPanel.setAttribute("data-operator-dry-run-review-state", operatorDryRunReview.state);
      operatorDryRunReviewHandoffPanel.setAttribute("data-source-checklist", operatorDryRunReview.checklistPath);
      operatorDryRunReviewHandoffPanel.setAttribute("data-final-deploy-decision", "no-go");
      operatorDryRunReviewHandoffPanel.setAttribute("data-production-deployment-state", operatorDryRunReview.productionDeploymentState);
      operatorDryRunReviewHandoffPanel.setAttribute("data-human-approval-observed", "false");
      operatorDryRunReviewHandoffPanel.setAttribute("data-platform-inputs-enabled", "false");
      operatorDryRunReviewHandoffPanel.setAttribute("data-platform-field-unlock", "false");
      operatorDryRunReviewHandoffPanel.setAttribute("data-local-only", "true");
      operatorDryRunReviewHandoffPanel.setAttribute("data-private", "true");
      operatorDryRunReviewHandoffPanel.setAttribute("data-read-only", "true");
      operatorDryRunReviewHandoffPanel.setAttribute("data-review-only", "true");
      operatorDryRunReviewHandoffPanel.setAttribute("data-no-secret-storage", "true");
      operatorDryRunReviewHandoffPanel.setAttribute("data-no-production-url", "true");
      operatorDryRunReviewHandoffPanel.setAttribute("data-no-credential", "true");
      operatorDryRunReviewHandoffPanel.setAttribute("data-no-deploy-trigger", "true");
      operatorDryRunReviewHandoffPanel.setAttribute("data-no-dashboard-action", "true");
      operatorDryRunReviewHandoffPanel.setAttribute("data-no-dns-action", "true");
      operatorDryRunReviewHandoffPanel.setAttribute("data-no-rollback-authorization", "true");
      operatorDryRunReviewHandoffPanel.setAttribute("data-no-public-launch-authorization", "true");
      operatorDryRunReviewHandoffPanel.setAttribute("data-no-deploy-action", "true");
      operatorDryRunReviewHandoffPanel.setAttribute("data-no-publish-action", "true");
      operatorDryRunReviewHandoffPanel.setAttribute("data-no-human-approval-path", "true");
      operatorDryRunReviewHandoffPanel.setAttribute("data-export-eligible", "false");
      operatorDryRunReviewHandoffPanel.setAttribute("data-download-eligible", "false");
    }
    setText(
      operatorDryRunReviewHandoffStatus,
      operatorDryRunReview.packetReady ? "Operator dry-run review handoff: Read-only" : "Operator dry-run review blocked"
    );
    setText(
      operatorDryRunReviewHandoffSummary,
      operatorDryRunReview.packetReady
        ? "Review-only local artifact steps and hard stops are summarized after the first-human packet. This handoff cannot unlock platform fields, credentials, production URLs, deploy triggers, dashboard actions, DNS, rollback authorization, public launch authorization, publish, export/download, or deploy action."
        : "Waiting for the first-human packet before preparing the review-only operator dry run."
    );
    if (operatorDryRunReviewLocalStepsList) {
      operatorDryRunReviewLocalStepsList.innerHTML = operatorDryRunReview.localSteps
        .map((item) => `<li data-operator-dry-run-local-step="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    if (operatorDryRunReviewHardStopsList) {
      operatorDryRunReviewHardStopsList.innerHTML = operatorDryRunReview.hardStops
        .map((item) => `<li data-operator-dry-run-hard-stop="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    setText(
      operatorDryRunReviewBoundary,
      "Read-only dry-run boundary: local artifact review only; no secrets, no deploy, no publish, no export/download eligibility, no platform field unlock, no credentials, no production URL, no deploy trigger, no dashboard action, no DNS, no rollback authorization, and no public launch authorization."
    );
    const coldStartArchive = coldStartArchiveHandoffState(operatorDryRunReview);
    if (coldStartArchiveHandoffPanel) {
      coldStartArchiveHandoffPanel.hidden = !coldStartArchive.dryRunReady;
      coldStartArchiveHandoffPanel.setAttribute("data-cold-start-archive-state", coldStartArchive.state);
      coldStartArchiveHandoffPanel.setAttribute("data-source-archive", coldStartArchive.archivePath);
      coldStartArchiveHandoffPanel.setAttribute("data-final-deploy-decision", "no-go");
      coldStartArchiveHandoffPanel.setAttribute("data-production-deployment-state", coldStartArchive.productionDeploymentState);
      coldStartArchiveHandoffPanel.setAttribute("data-human-approval-observed", "false");
      coldStartArchiveHandoffPanel.setAttribute("data-platform-inputs-enabled", "false");
      coldStartArchiveHandoffPanel.setAttribute("data-platform-field-unlock", "false");
      coldStartArchiveHandoffPanel.setAttribute("data-local-only", "true");
      coldStartArchiveHandoffPanel.setAttribute("data-private", "true");
      coldStartArchiveHandoffPanel.setAttribute("data-read-only", "true");
      coldStartArchiveHandoffPanel.setAttribute("data-archive-only", "true");
      coldStartArchiveHandoffPanel.setAttribute("data-no-secret-storage", "true");
      coldStartArchiveHandoffPanel.setAttribute("data-no-production-url", "true");
      coldStartArchiveHandoffPanel.setAttribute("data-no-credential", "true");
      coldStartArchiveHandoffPanel.setAttribute("data-no-deploy-trigger", "true");
      coldStartArchiveHandoffPanel.setAttribute("data-no-dashboard-action", "true");
      coldStartArchiveHandoffPanel.setAttribute("data-no-dns-action", "true");
      coldStartArchiveHandoffPanel.setAttribute("data-no-rollback-authorization", "true");
      coldStartArchiveHandoffPanel.setAttribute("data-no-public-launch-authorization", "true");
      coldStartArchiveHandoffPanel.setAttribute("data-no-deploy-action", "true");
      coldStartArchiveHandoffPanel.setAttribute("data-no-publish-action", "true");
      coldStartArchiveHandoffPanel.setAttribute("data-no-human-approval-path", "true");
      coldStartArchiveHandoffPanel.setAttribute("data-export-eligible", "false");
      coldStartArchiveHandoffPanel.setAttribute("data-download-eligible", "false");
    }
    setText(
      coldStartArchiveHandoffStatus,
      coldStartArchive.dryRunReady ? "Cold-start archive handoff: Read-only" : "Cold-start archive blocked"
    );
    setText(
      coldStartArchiveHandoffSummary,
      coldStartArchive.dryRunReady
        ? "Continuation context and hard stops are archived after the operator dry run. This archive is non-operational and keeps every external deploy, launch, rollback, demand, pricing, proof, and outcome fact Not observed."
        : "Waiting for the operator dry-run handoff before showing cold-start archive context."
    );
    if (coldStartArchiveContinuationContextList) {
      coldStartArchiveContinuationContextList.innerHTML = coldStartArchive.continuationContext
        .map((item) => `<li data-cold-start-archive-context="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    if (coldStartArchiveHardStopsList) {
      coldStartArchiveHardStopsList.innerHTML = coldStartArchive.hardStops
        .map((item) => `<li data-cold-start-archive-hard-stop="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    setText(
      coldStartArchiveBoundary,
      "Read-only archive boundary: local-only, no secrets, no deploy, no publish, no export/download eligibility, no platform field unlock, no credential or URL request, no executable sequence, no rollback authorization, and no public launch authorization."
    );
    const deployContinuation = deployContinuationHandoffState(coldStartArchive);
    if (deployContinuationHandoffPanel) {
      deployContinuationHandoffPanel.hidden = !deployContinuation.archiveReady;
      deployContinuationHandoffPanel.setAttribute("data-release-candidate-deploy-continuation-state", deployContinuation.state);
      deployContinuationHandoffPanel.setAttribute("data-source-map", deployContinuation.mapPath);
      deployContinuationHandoffPanel.setAttribute("data-final-deploy-decision", "no-go");
      deployContinuationHandoffPanel.setAttribute("data-production-deployment-state", deployContinuation.productionDeploymentState);
      deployContinuationHandoffPanel.setAttribute("data-human-approval-observed", "false");
      deployContinuationHandoffPanel.setAttribute("data-platform-inputs-enabled", "false");
      deployContinuationHandoffPanel.setAttribute("data-platform-field-unlock", "false");
      deployContinuationHandoffPanel.setAttribute("data-local-only", "true");
      deployContinuationHandoffPanel.setAttribute("data-private", "true");
      deployContinuationHandoffPanel.setAttribute("data-read-only", "true");
      deployContinuationHandoffPanel.setAttribute("data-no-secret-storage", "true");
      deployContinuationHandoffPanel.setAttribute("data-no-production-url", "true");
      deployContinuationHandoffPanel.setAttribute("data-no-credential", "true");
      deployContinuationHandoffPanel.setAttribute("data-no-deploy-trigger", "true");
      deployContinuationHandoffPanel.setAttribute("data-no-dashboard-action", "true");
      deployContinuationHandoffPanel.setAttribute("data-no-dns-action", "true");
      deployContinuationHandoffPanel.setAttribute("data-no-rollback-authorization", "true");
      deployContinuationHandoffPanel.setAttribute("data-no-public-launch-authorization", "true");
      deployContinuationHandoffPanel.setAttribute("data-no-deploy-action", "true");
      deployContinuationHandoffPanel.setAttribute("data-no-publish-action", "true");
      deployContinuationHandoffPanel.setAttribute("data-no-human-approval-path", "true");
      deployContinuationHandoffPanel.setAttribute("data-export-eligible", "false");
      deployContinuationHandoffPanel.setAttribute("data-download-eligible", "false");
    }
    setText(
      deployContinuationHandoffStatus,
      deployContinuation.archiveReady ? "Deploy-continuation handoff: Blocked read-only" : "Deploy-continuation handoff blocked"
    );
    setText(
      deployContinuationHandoffSummary,
      deployContinuation.archiveReady
        ? "Blocked next-state labels and hard stops are summarized after the cold-start archive. This handoff is local continuation context only and cannot request values, unlock platform fields, deploy, publish, or become an executable sequence."
        : "Waiting for the cold-start archive handoff before showing deploy-continuation context."
    );
    if (deployContinuationBlockedLabelsList) {
      deployContinuationBlockedLabelsList.innerHTML = deployContinuation.blockedLabels
        .map((item) => `<li data-deploy-continuation-blocked-label="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    if (deployContinuationHardStopsList) {
      deployContinuationHardStopsList.innerHTML = deployContinuation.hardStops
        .map((item) => `<li data-deploy-continuation-hard-stop="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    setText(
      deployContinuationBoundary,
      "Read-only deploy-continuation boundary: local-only, no secrets, no deploy, no publish, no export/download eligibility, no platform field unlock, no production URL, no deploy trigger, no dashboard/DNS action, no rollback authorization, and no public launch authorization."
    );

    const externalInputBoundary = externalInputBoundaryHandoffState(deployContinuation);
    if (externalInputBoundaryHandoffPanel) {
      externalInputBoundaryHandoffPanel.hidden = !externalInputBoundary.continuationReady;
      externalInputBoundaryHandoffPanel.setAttribute("data-external-input-boundary-state", externalInputBoundary.state);
      externalInputBoundaryHandoffPanel.setAttribute("data-source-ledger", externalInputBoundary.ledgerPath);
      externalInputBoundaryHandoffPanel.setAttribute("data-final-deploy-decision", "no-go");
      externalInputBoundaryHandoffPanel.setAttribute("data-production-deployment-state", externalInputBoundary.productionDeploymentState);
      externalInputBoundaryHandoffPanel.setAttribute("data-human-approval-observed", "false");
      externalInputBoundaryHandoffPanel.setAttribute("data-platform-inputs-enabled", "false");
      externalInputBoundaryHandoffPanel.setAttribute("data-platform-field-unlock", "false");
      externalInputBoundaryHandoffPanel.setAttribute("data-can-request-external-values", "false");
      externalInputBoundaryHandoffPanel.setAttribute("data-local-only", "true");
      externalInputBoundaryHandoffPanel.setAttribute("data-private", "true");
      externalInputBoundaryHandoffPanel.setAttribute("data-read-only", "true");
      externalInputBoundaryHandoffPanel.setAttribute("data-no-secret-storage", "true");
      externalInputBoundaryHandoffPanel.setAttribute("data-no-production-url", "true");
      externalInputBoundaryHandoffPanel.setAttribute("data-no-credential", "true");
      externalInputBoundaryHandoffPanel.setAttribute("data-no-deploy-trigger", "true");
      externalInputBoundaryHandoffPanel.setAttribute("data-no-dashboard-action", "true");
      externalInputBoundaryHandoffPanel.setAttribute("data-no-dns-action", "true");
      externalInputBoundaryHandoffPanel.setAttribute("data-no-rollback-authorization", "true");
      externalInputBoundaryHandoffPanel.setAttribute("data-no-public-launch-authorization", "true");
      externalInputBoundaryHandoffPanel.setAttribute("data-no-deploy-action", "true");
      externalInputBoundaryHandoffPanel.setAttribute("data-no-publish-action", "true");
      externalInputBoundaryHandoffPanel.setAttribute("data-no-human-approval-path", "true");
      externalInputBoundaryHandoffPanel.setAttribute("data-export-eligible", "false");
      externalInputBoundaryHandoffPanel.setAttribute("data-download-eligible", "false");
    }
    setText(
      externalInputBoundaryHandoffStatus,
      externalInputBoundary.continuationReady ? "External-input boundary handoff: Read-only" : "External-input boundary blocked"
    );
    setText(
      externalInputBoundaryHandoffSummary,
      externalInputBoundary.continuationReady
        ? "External deploy and market facts stay Not observed after the deploy-continuation handoff. This state is read-only and cannot request values, unlock platform fields, deploy, publish, or authorize claims."
        : "Waiting for the deploy-continuation handoff before showing the external-input boundary."
    );
    if (externalInputBoundaryArtifactsList) {
      externalInputBoundaryArtifactsList.innerHTML = externalInputBoundary.artifacts
        .map((item) => `<li data-external-input-boundary-artifact="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    if (externalInputBoundaryNotObservedFactsList) {
      externalInputBoundaryNotObservedFactsList.innerHTML = externalInputBoundary.notObservedFacts
        .map((item) => `<li data-external-input-boundary-not-observed="true">${escapeHtml(item)}: Not observed</li>`)
        .join("");
    }
    if (externalInputBoundaryHardStopsList) {
      externalInputBoundaryHardStopsList.innerHTML = externalInputBoundary.hardStops
        .map((item) => `<li data-external-input-boundary-hard-stop="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    setText(
      externalInputBoundaryBoundary,
      "Read-only external-input boundary: local-only, no secrets, no deploy, no publish, no export/download eligibility, no external value requests, no platform field unlock, no production origin, no deploy trigger, no control-plane action, no naming-record action, no rollback authorization, no public launch authorization, and no product-claim authorization."
    );

    const platformOwnerNonRequestTransfer = platformOwnerNonRequestTransferHandoffState(externalInputBoundary);
    if (platformOwnerNonRequestTransferPanel) {
      platformOwnerNonRequestTransferPanel.hidden = !platformOwnerNonRequestTransfer.boundaryReady;
      platformOwnerNonRequestTransferPanel.setAttribute("data-platform-owner-non-request-transfer-state", platformOwnerNonRequestTransfer.state);
      platformOwnerNonRequestTransferPanel.setAttribute("data-source-note", platformOwnerNonRequestTransfer.transferNotePath);
      platformOwnerNonRequestTransferPanel.setAttribute("data-source-ledger", platformOwnerNonRequestTransfer.ledgerPath);
      platformOwnerNonRequestTransferPanel.setAttribute("data-final-deploy-decision", "no-go");
      platformOwnerNonRequestTransferPanel.setAttribute("data-production-deployment-state", platformOwnerNonRequestTransfer.productionDeploymentState);
      platformOwnerNonRequestTransferPanel.setAttribute("data-human-approval-observed", "false");
      platformOwnerNonRequestTransferPanel.setAttribute("data-platform-inputs-enabled", "false");
      platformOwnerNonRequestTransferPanel.setAttribute("data-platform-field-unlock", "false");
      platformOwnerNonRequestTransferPanel.setAttribute("data-can-request-external-values", "false");
      platformOwnerNonRequestTransferPanel.setAttribute("data-can-request-platform-values", "false");
      platformOwnerNonRequestTransferPanel.setAttribute("data-implied-execution", "false");
      platformOwnerNonRequestTransferPanel.setAttribute("data-local-only", "true");
      platformOwnerNonRequestTransferPanel.setAttribute("data-private", "true");
      platformOwnerNonRequestTransferPanel.setAttribute("data-read-only", "true");
      platformOwnerNonRequestTransferPanel.setAttribute("data-no-secret-storage", "true");
      platformOwnerNonRequestTransferPanel.setAttribute("data-no-production-url", "true");
      platformOwnerNonRequestTransferPanel.setAttribute("data-no-credential", "true");
      platformOwnerNonRequestTransferPanel.setAttribute("data-no-deploy-trigger", "true");
      platformOwnerNonRequestTransferPanel.setAttribute("data-no-dashboard-action", "true");
      platformOwnerNonRequestTransferPanel.setAttribute("data-no-dns-action", "true");
      platformOwnerNonRequestTransferPanel.setAttribute("data-no-rollback-authorization", "true");
      platformOwnerNonRequestTransferPanel.setAttribute("data-no-public-launch-authorization", "true");
      platformOwnerNonRequestTransferPanel.setAttribute("data-no-deploy-action", "true");
      platformOwnerNonRequestTransferPanel.setAttribute("data-no-publish-action", "true");
      platformOwnerNonRequestTransferPanel.setAttribute("data-no-human-approval-path", "true");
      platformOwnerNonRequestTransferPanel.setAttribute("data-export-eligible", "false");
      platformOwnerNonRequestTransferPanel.setAttribute("data-download-eligible", "false");
    }
    setText(
      platformOwnerNonRequestTransferStatus,
      platformOwnerNonRequestTransfer.boundaryReady ? "Platform-owner non-request transfer: Read-only" : "Platform-owner non-request transfer blocked"
    );
    setText(
      platformOwnerNonRequestTransferSummary,
      platformOwnerNonRequestTransfer.boundaryReady
        ? "The platform-owner transfer summarizes local context without asking for platform values. It cannot unlock fields, imply execution, deploy, publish, rollback, or authorize production claims."
        : "Waiting for the external-input boundary before showing the non-request transfer."
    );
    if (platformOwnerNonRequestTransferArtifactsList) {
      platformOwnerNonRequestTransferArtifactsList.innerHTML = platformOwnerNonRequestTransfer.artifacts
        .map((item) => `<li data-platform-owner-non-request-transfer-artifact="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    if (platformOwnerNonRequestTransferNonRequestsList) {
      platformOwnerNonRequestTransferNonRequestsList.innerHTML = platformOwnerNonRequestTransfer.nonRequests
        .map((item) => `<li data-platform-owner-non-request-transfer-non-request="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    if (platformOwnerNonRequestTransferHardStopsList) {
      platformOwnerNonRequestTransferHardStopsList.innerHTML = platformOwnerNonRequestTransfer.hardStops
        .map((item) => `<li data-platform-owner-non-request-transfer-hard-stop="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    setText(
      platformOwnerNonRequestTransferBoundary,
      "Read-only platform-owner non-request transfer: local-only, no secrets, no deploy, no publish, no export/download eligibility, no external/platform value requests, no platform field unlock, no production origin, no deploy trigger, no dashboard/DNS action, no rollback authorization, no public launch authorization, and no implied execution."
    );

    const operatorResumePacketGuardrail = operatorResumePacketGuardrailHandoffState(platformOwnerNonRequestTransfer);
    if (operatorResumePacketGuardrailPanel) {
      operatorResumePacketGuardrailPanel.hidden = !operatorResumePacketGuardrail.transferReady;
      operatorResumePacketGuardrailPanel.setAttribute("data-operator-resume-packet-guardrail-state", operatorResumePacketGuardrail.state);
      operatorResumePacketGuardrailPanel.setAttribute("data-source-guardrail", operatorResumePacketGuardrail.guardrailPath);
      operatorResumePacketGuardrailPanel.setAttribute("data-source-note", operatorResumePacketGuardrail.sourceNotePath);
      operatorResumePacketGuardrailPanel.setAttribute("data-final-deploy-decision", "no-go");
      operatorResumePacketGuardrailPanel.setAttribute("data-production-deployment-state", operatorResumePacketGuardrail.productionDeploymentState);
      operatorResumePacketGuardrailPanel.setAttribute("data-human-approval-observed", "false");
      operatorResumePacketGuardrailPanel.setAttribute("data-platform-inputs-enabled", "false");
      operatorResumePacketGuardrailPanel.setAttribute("data-platform-field-unlock", "false");
      operatorResumePacketGuardrailPanel.setAttribute("data-can-request-external-values", "false");
      operatorResumePacketGuardrailPanel.setAttribute("data-can-request-platform-values", "false");
      operatorResumePacketGuardrailPanel.setAttribute("data-implied-execution", "false");
      operatorResumePacketGuardrailPanel.setAttribute("data-local-only", "true");
      operatorResumePacketGuardrailPanel.setAttribute("data-private", "true");
      operatorResumePacketGuardrailPanel.setAttribute("data-read-only", "true");
      operatorResumePacketGuardrailPanel.setAttribute("data-no-secret-storage", "true");
      operatorResumePacketGuardrailPanel.setAttribute("data-no-production-url", "true");
      operatorResumePacketGuardrailPanel.setAttribute("data-no-credential", "true");
      operatorResumePacketGuardrailPanel.setAttribute("data-no-deploy-trigger", "true");
      operatorResumePacketGuardrailPanel.setAttribute("data-no-dashboard-action", "true");
      operatorResumePacketGuardrailPanel.setAttribute("data-no-dns-action", "true");
      operatorResumePacketGuardrailPanel.setAttribute("data-no-rollback-authorization", "true");
      operatorResumePacketGuardrailPanel.setAttribute("data-no-public-launch-authorization", "true");
      operatorResumePacketGuardrailPanel.setAttribute("data-no-deploy-action", "true");
      operatorResumePacketGuardrailPanel.setAttribute("data-no-publish-action", "true");
      operatorResumePacketGuardrailPanel.setAttribute("data-no-human-approval-path", "true");
      operatorResumePacketGuardrailPanel.setAttribute("data-export-eligible", "false");
      operatorResumePacketGuardrailPanel.setAttribute("data-download-eligible", "false");
    }
    setText(
      operatorResumePacketGuardrailStatus,
      operatorResumePacketGuardrail.transferReady ? "Operator-resume packet guardrail: Read-only" : "Operator-resume packet guardrail blocked"
    );
    setText(
      operatorResumePacketGuardrailSummary,
      operatorResumePacketGuardrail.transferReady
        ? "The operator-resume packet guardrail follows the platform-owner transfer as a stop-sign only. It cannot request external or platform values, unlock fields, imply execution, deploy, publish, rollback, or authorize production claims."
        : "Waiting for the platform-owner non-request transfer before showing the operator-resume packet guardrail."
    );
    if (operatorResumePacketGuardrailReferencesList) {
      operatorResumePacketGuardrailReferencesList.innerHTML = operatorResumePacketGuardrail.references
        .map((item) => `<li data-operator-resume-packet-guardrail-reference="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    if (operatorResumePacketGuardrailRulesList) {
      operatorResumePacketGuardrailRulesList.innerHTML = operatorResumePacketGuardrail.rules
        .map((item) => `<li data-operator-resume-packet-guardrail-rule="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    if (operatorResumePacketGuardrailHardStopsList) {
      operatorResumePacketGuardrailHardStopsList.innerHTML = operatorResumePacketGuardrail.hardStops
        .map((item) => `<li data-operator-resume-packet-guardrail-hard-stop="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    setText(
      operatorResumePacketGuardrailBoundary,
      "Read-only operator-resume packet guardrail: local-only, no secrets, no deploy, no publish, no export/download eligibility, no external/platform value requests, no platform field unlock, no production origin, no deploy trigger, no dashboard/DNS action, no rollback authorization, no public launch authorization, no production health verification, no public claim authorization, and no implied execution."
    );

    const blockedStateOperatorContinuationIndex = blockedStateOperatorContinuationIndexHandoffState(operatorResumePacketGuardrail);
    if (blockedStateOperatorContinuationIndexPanel) {
      blockedStateOperatorContinuationIndexPanel.hidden = !blockedStateOperatorContinuationIndex.guardrailReady;
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-blocked-state-operator-continuation-index-state", blockedStateOperatorContinuationIndex.state);
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-source-index", blockedStateOperatorContinuationIndex.indexPath);
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-source-guardrail", blockedStateOperatorContinuationIndex.guardrailPath);
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-final-deploy-decision", "no-go");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-production-deployment-state", blockedStateOperatorContinuationIndex.productionDeploymentState);
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-human-approval-observed", "false");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-platform-inputs-enabled", "false");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-platform-field-unlock", "false");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-can-request-external-values", "false");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-can-request-platform-values", "false");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-implied-execution", "false");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-local-only", "true");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-private", "true");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-read-only", "true");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-no-secret-storage", "true");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-no-production-url", "true");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-no-credential", "true");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-no-deploy-trigger", "true");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-no-dashboard-action", "true");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-no-dns-action", "true");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-no-rollback-authorization", "true");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-no-public-launch-authorization", "true");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-no-deploy-action", "true");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-no-publish-action", "true");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-no-human-approval-path", "true");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-export-eligible", "false");
      blockedStateOperatorContinuationIndexPanel.setAttribute("data-download-eligible", "false");
    }
    setText(
      blockedStateOperatorContinuationIndexStatus,
      blockedStateOperatorContinuationIndex.guardrailReady ? "Blocked-state continuation index: Read-only" : "Blocked-state continuation index blocked"
    );
    setText(
      blockedStateOperatorContinuationIndexSummary,
      blockedStateOperatorContinuationIndex.guardrailReady
        ? "The blocked-state continuation index follows the operator-resume packet guardrail as read-only local context. It cannot request external or platform values, unlock fields, imply execution, deploy, publish, rollback, or authorize production claims."
        : "Waiting for the operator-resume packet guardrail before showing the blocked-state continuation index."
    );
    if (blockedStateOperatorContinuationIndexLabelsList) {
      blockedStateOperatorContinuationIndexLabelsList.innerHTML = blockedStateOperatorContinuationIndex.labels
        .map((item) => `<li data-blocked-state-operator-continuation-index-label="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    if (blockedStateOperatorContinuationIndexNotObservedList) {
      blockedStateOperatorContinuationIndexNotObservedList.innerHTML = blockedStateOperatorContinuationIndex.notObservedFacts
        .map((item) => `<li data-blocked-state-operator-continuation-index-not-observed="true">${escapeHtml(item)}: Not observed</li>`)
        .join("");
    }
    if (blockedStateOperatorContinuationIndexHardStopsList) {
      blockedStateOperatorContinuationIndexHardStopsList.innerHTML = blockedStateOperatorContinuationIndex.hardStops
        .map((item) => `<li data-blocked-state-operator-continuation-index-hard-stop="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    setText(
      blockedStateOperatorContinuationIndexBoundary,
      "Read-only blocked-state operator continuation index: local-only, private, no secrets, no deploy, no publish, no export/download eligibility, no external/platform value requests, no platform field unlock, no production origin, no deploy trigger, no dashboard/DNS action, no rollback authorization, no public launch authorization, no production health verification, no public claim authorization, non-request, non-executable, and no implied execution."
    );
    const autonomousDeployStopLedger = autonomousDeployStopLedgerHandoffState(blockedStateOperatorContinuationIndex);
    if (autonomousDeployStopLedgerPanel) {
      autonomousDeployStopLedgerPanel.hidden = !autonomousDeployStopLedger.indexReady;
      autonomousDeployStopLedgerPanel.setAttribute("data-autonomous-deploy-stop-ledger-state", autonomousDeployStopLedger.state);
      autonomousDeployStopLedgerPanel.setAttribute("data-source-ledger", autonomousDeployStopLedger.ledgerPath);
      autonomousDeployStopLedgerPanel.setAttribute("data-source-index", autonomousDeployStopLedger.indexPath);
      autonomousDeployStopLedgerPanel.setAttribute("data-final-deploy-decision", "no-go");
      autonomousDeployStopLedgerPanel.setAttribute("data-production-deployment-state", autonomousDeployStopLedger.productionDeploymentState);
      autonomousDeployStopLedgerPanel.setAttribute("data-autonomous-stop", "true");
      autonomousDeployStopLedgerPanel.setAttribute("data-non-request", "true");
      autonomousDeployStopLedgerPanel.setAttribute("data-non-executable", "true");
      autonomousDeployStopLedgerPanel.setAttribute("data-human-approval-observed", "false");
      autonomousDeployStopLedgerPanel.setAttribute("data-platform-inputs-enabled", "false");
      autonomousDeployStopLedgerPanel.setAttribute("data-platform-field-unlock", "false");
      autonomousDeployStopLedgerPanel.setAttribute("data-can-request-external-values", "false");
      autonomousDeployStopLedgerPanel.setAttribute("data-can-request-platform-values", "false");
      autonomousDeployStopLedgerPanel.setAttribute("data-implied-execution", "false");
      autonomousDeployStopLedgerPanel.setAttribute("data-local-only", "true");
      autonomousDeployStopLedgerPanel.setAttribute("data-private", "true");
      autonomousDeployStopLedgerPanel.setAttribute("data-read-only", "true");
      autonomousDeployStopLedgerPanel.setAttribute("data-no-secret-storage", "true");
      autonomousDeployStopLedgerPanel.setAttribute("data-no-production-url", "true");
      autonomousDeployStopLedgerPanel.setAttribute("data-no-credential", "true");
      autonomousDeployStopLedgerPanel.setAttribute("data-no-deploy-trigger", "true");
      autonomousDeployStopLedgerPanel.setAttribute("data-no-dashboard-action", "true");
      autonomousDeployStopLedgerPanel.setAttribute("data-no-dns-action", "true");
      autonomousDeployStopLedgerPanel.setAttribute("data-no-rollback-authorization", "true");
      autonomousDeployStopLedgerPanel.setAttribute("data-no-public-launch-authorization", "true");
      autonomousDeployStopLedgerPanel.setAttribute("data-no-deploy-action", "true");
      autonomousDeployStopLedgerPanel.setAttribute("data-no-publish-action", "true");
      autonomousDeployStopLedgerPanel.setAttribute("data-no-human-approval-path", "true");
      autonomousDeployStopLedgerPanel.setAttribute("data-export-eligible", "false");
      autonomousDeployStopLedgerPanel.setAttribute("data-download-eligible", "false");
    }
    setText(
      autonomousDeployStopLedgerStatus,
      autonomousDeployStopLedger.indexReady ? "Autonomous deploy stop ledger: Read-only" : "Autonomous deploy stop ledger blocked"
    );
    setText(
      autonomousDeployStopLedgerSummary,
      autonomousDeployStopLedger.indexReady
        ? "The autonomous deploy stop ledger follows the blocked-state continuation index as a local-only stop artifact. It cannot request external or platform values, unlock fields, imply execution, deploy, publish, rollback, or authorize production claims."
        : "Waiting for the blocked-state continuation index before showing the autonomous deploy stop ledger."
    );
    if (autonomousDeployStopLedgerSurfacesList) {
      autonomousDeployStopLedgerSurfacesList.innerHTML = autonomousDeployStopLedger.surfaces
        .map((item) => `<li data-autonomous-deploy-stop-ledger-surface="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    if (autonomousDeployStopLedgerNotObservedList) {
      autonomousDeployStopLedgerNotObservedList.innerHTML = autonomousDeployStopLedger.notObservedFacts
        .map((item) => `<li data-autonomous-deploy-stop-ledger-not-observed="true">${escapeHtml(item)}: Not observed</li>`)
        .join("");
    }
    if (autonomousDeployStopLedgerHardStopsList) {
      autonomousDeployStopLedgerHardStopsList.innerHTML = autonomousDeployStopLedger.hardStops
        .map((item) => `<li data-autonomous-deploy-stop-ledger-hard-stop="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    setText(
      autonomousDeployStopLedgerBoundary,
      "Read-only autonomous deploy stop ledger: local-only, private, no secrets, no deploy, no publish, no export/download eligibility, no external/platform value requests, no platform field unlock, no production origin, no deploy trigger, no dashboard/DNS action, no rollback authorization, no public launch authorization, no production health verification, no public claim authorization, autonomous stop, non-request, non-executable, and no implied execution."
    );
    const postAutonomousStopRecoveryChecklist = postAutonomousStopRecoveryChecklistHandoffState(autonomousDeployStopLedger);
    if (postAutonomousStopRecoveryChecklistPanel) {
      postAutonomousStopRecoveryChecklistPanel.hidden = !postAutonomousStopRecoveryChecklist.ledgerReady;
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-post-autonomous-stop-recovery-checklist-state", postAutonomousStopRecoveryChecklist.state);
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-source-checklist", postAutonomousStopRecoveryChecklist.checklistPath);
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-source-ledger", postAutonomousStopRecoveryChecklist.ledgerPath);
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-final-deploy-decision", "no-go");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-production-deployment-state", postAutonomousStopRecoveryChecklist.productionDeploymentState);
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-autonomous-recovery", "true");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-non-request", "true");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-non-executable", "true");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-human-approval-observed", "false");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-platform-inputs-enabled", "false");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-platform-field-unlock", "false");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-can-request-external-values", "false");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-can-request-platform-values", "false");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-implied-execution", "false");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-local-only", "true");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-private", "true");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-read-only", "true");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-no-secret-storage", "true");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-no-production-url", "true");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-no-credential", "true");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-no-deploy-trigger", "true");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-no-dashboard-action", "true");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-no-dns-action", "true");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-no-rollback-authorization", "true");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-no-public-launch-authorization", "true");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-no-deploy-action", "true");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-no-publish-action", "true");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-no-human-approval-path", "true");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-export-eligible", "false");
      postAutonomousStopRecoveryChecklistPanel.setAttribute("data-download-eligible", "false");
    }
    setText(
      postAutonomousStopRecoveryChecklistStatus,
      postAutonomousStopRecoveryChecklist.ledgerReady
        ? "Post-autonomous-stop recovery checklist: Read-only"
        : "Post-autonomous-stop recovery checklist blocked"
    );
    setText(
      postAutonomousStopRecoveryChecklistSummary,
      postAutonomousStopRecoveryChecklist.ledgerReady
        ? "The post-autonomous-stop recovery checklist follows the autonomous deploy stop ledger as private recovery context only. It cannot request external or platform values, unlock fields, imply execution, deploy, publish, rollback, bypass human/platform authority, or authorize production claims."
        : "Waiting for the autonomous deploy stop ledger before showing the recovery checklist."
    );
    if (postAutonomousStopRecoveryChecklistSurfacesList) {
      postAutonomousStopRecoveryChecklistSurfacesList.innerHTML = postAutonomousStopRecoveryChecklist.surfaces
        .map((item) => `<li data-post-autonomous-stop-recovery-checklist-surface="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    if (postAutonomousStopRecoveryChecklistNotObservedList) {
      postAutonomousStopRecoveryChecklistNotObservedList.innerHTML = postAutonomousStopRecoveryChecklist.notObservedFacts
        .map((item) => `<li data-post-autonomous-stop-recovery-checklist-not-observed="true">${escapeHtml(item)}: Not observed</li>`)
        .join("");
    }
    if (postAutonomousStopRecoveryChecklistHardStopsList) {
      postAutonomousStopRecoveryChecklistHardStopsList.innerHTML = postAutonomousStopRecoveryChecklist.hardStops
        .map((item) => `<li data-post-autonomous-stop-recovery-checklist-hard-stop="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    setText(
      postAutonomousStopRecoveryChecklistBoundary,
      "Read-only post-autonomous-stop recovery checklist: local-only, private, no secrets, no deploy, no publish, no export/download eligibility, no external/platform value requests, no platform field unlock, no production origin, no deploy trigger, no dashboard/DNS action, no rollback authorization, no public launch authorization, no production health verification, no public claim authorization, autonomous recovery only, non-request, non-executable, no human/platform authority bypass, and no implied execution."
    );
    const humanPlatformAuthorityReEntryGate = humanPlatformAuthorityReEntryGateHandoffState(postAutonomousStopRecoveryChecklist);
    if (humanPlatformAuthorityReEntryGatePanel) {
      humanPlatformAuthorityReEntryGatePanel.hidden = !humanPlatformAuthorityReEntryGate.recoveryReady;
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-human-platform-authority-re-entry-gate-state", humanPlatformAuthorityReEntryGate.state);
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-source-gate", humanPlatformAuthorityReEntryGate.gatePath);
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-source-checklist", humanPlatformAuthorityReEntryGate.checklistPath);
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-final-deploy-decision", "no-go");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-production-deployment-state", humanPlatformAuthorityReEntryGate.productionDeploymentState);
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-human-platform-authority-observed", "false");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-human-platform-authority-bypass", "false");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-autonomous-recovery", "true");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-non-request", "true");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-non-executable", "true");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-human-approval-observed", "false");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-platform-inputs-enabled", "false");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-platform-field-unlock", "false");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-can-request-external-values", "false");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-can-request-platform-values", "false");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-implied-execution", "false");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-local-only", "true");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-private", "true");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-read-only", "true");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-no-secret-storage", "true");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-no-production-url", "true");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-no-credential", "true");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-no-deploy-trigger", "true");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-no-dashboard-action", "true");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-no-dns-action", "true");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-no-rollback-authorization", "true");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-no-public-launch-authorization", "true");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-no-deploy-action", "true");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-no-publish-action", "true");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-no-human-approval-path", "true");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-export-eligible", "false");
      humanPlatformAuthorityReEntryGatePanel.setAttribute("data-download-eligible", "false");
    }
    setText(
      humanPlatformAuthorityReEntryGateStatus,
      humanPlatformAuthorityReEntryGate.recoveryReady
        ? "Human-platform authority re-entry gate: Read-only"
        : "Human-platform authority re-entry gate blocked"
    );
    setText(
      humanPlatformAuthorityReEntryGateSummary,
      humanPlatformAuthorityReEntryGate.recoveryReady
        ? "The human-platform authority re-entry gate follows the recovery checklist as private blocked context only. It cannot request external or platform values, unlock fields, imply execution, deploy, publish, rollback, bypass human/platform authority, or authorize production claims."
        : "Waiting for the post-autonomous-stop recovery checklist before showing the re-entry gate."
    );
    if (humanPlatformAuthorityReEntryGateSurfacesList) {
      humanPlatformAuthorityReEntryGateSurfacesList.innerHTML = humanPlatformAuthorityReEntryGate.surfaces
        .map((item) => `<li data-human-platform-authority-re-entry-gate-surface="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    if (humanPlatformAuthorityReEntryGateNotObservedList) {
      humanPlatformAuthorityReEntryGateNotObservedList.innerHTML = humanPlatformAuthorityReEntryGate.notObservedFacts
        .map((item) => `<li data-human-platform-authority-re-entry-gate-not-observed="true">${escapeHtml(item)}: Not observed</li>`)
        .join("");
    }
    if (humanPlatformAuthorityReEntryGateHardStopsList) {
      humanPlatformAuthorityReEntryGateHardStopsList.innerHTML = humanPlatformAuthorityReEntryGate.hardStops
        .map((item) => `<li data-human-platform-authority-re-entry-gate-hard-stop="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    setText(
      humanPlatformAuthorityReEntryGateBoundary,
      "Read-only human-platform authority re-entry gate: local-only, private, no secrets, no deploy, no publish, no export/download eligibility, no external/platform value requests, no platform field unlock, no production origin, no deploy trigger, no dashboard/DNS action, no rollback authorization, no public launch authorization, no production health verification, no public claim authorization, human/platform authority Not observed, non-request, non-executable, no human/platform authority bypass, and no implied execution."
    );

    const outsideAuthorityAwaitingStateLedger = outsideAuthorityAwaitingStateLedgerHandoffState(humanPlatformAuthorityReEntryGate);
    if (outsideAuthorityAwaitingStateLedgerPanel) {
      outsideAuthorityAwaitingStateLedgerPanel.hidden = !outsideAuthorityAwaitingStateLedger.gateReady;
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute(
        "data-outside-authority-awaiting-state-ledger-state",
        outsideAuthorityAwaitingStateLedger.state
      );
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-source-ledger", outsideAuthorityAwaitingStateLedger.ledgerPath);
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-source-gate", outsideAuthorityAwaitingStateLedger.gatePath);
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-final-deploy-decision", "no-go");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute(
        "data-production-deployment-state",
        outsideAuthorityAwaitingStateLedger.productionDeploymentState
      );
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-human-platform-authority-observed", "false");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-human-platform-authority-bypass", "false");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-autonomous-recovery", "true");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-non-request", "true");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-non-executable", "true");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-human-approval-observed", "false");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-platform-inputs-enabled", "false");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-platform-field-unlock", "false");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-can-request-external-values", "false");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-can-request-platform-values", "false");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-implied-execution", "false");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-local-only", "true");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-private", "true");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-read-only", "true");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-no-secret-storage", "true");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-no-production-url", "true");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-no-credential", "true");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-no-deploy-trigger", "true");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-no-dashboard-action", "true");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-no-dns-action", "true");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-no-rollback-authorization", "true");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-no-public-launch-authorization", "true");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-no-deploy-action", "true");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-no-publish-action", "true");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-no-human-approval-path", "true");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-export-eligible", "false");
      outsideAuthorityAwaitingStateLedgerPanel.setAttribute("data-download-eligible", "false");
    }
    setText(
      outsideAuthorityAwaitingStateLedgerStatus,
      outsideAuthorityAwaitingStateLedger.gateReady
        ? "Outside-authority awaiting-state ledger: Read-only"
        : "Outside-authority awaiting-state ledger blocked"
    );
    setText(
      outsideAuthorityAwaitingStateLedgerSummary,
      outsideAuthorityAwaitingStateLedger.gateReady
        ? "The outside-authority awaiting-state ledger follows the human-platform authority re-entry gate as private blocked context only. It cannot request values, unlock deploy, imply execution, bypass human/platform authority, publish, deploy, rollback, or authorize production claims."
        : "Waiting for the human-platform authority re-entry gate before showing the awaiting ledger."
    );
    if (outsideAuthorityAwaitingStateLedgerSurfacesList) {
      outsideAuthorityAwaitingStateLedgerSurfacesList.innerHTML = outsideAuthorityAwaitingStateLedger.surfaces
        .map((item) => `<li data-outside-authority-awaiting-state-ledger-surface="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    if (outsideAuthorityAwaitingStateLedgerNotObservedList) {
      outsideAuthorityAwaitingStateLedgerNotObservedList.innerHTML = outsideAuthorityAwaitingStateLedger.notObservedFacts
        .map((item) => `<li data-outside-authority-awaiting-state-ledger-not-observed="true">${escapeHtml(item)}: Not observed</li>`)
        .join("");
    }
    if (outsideAuthorityAwaitingStateLedgerHardStopsList) {
      outsideAuthorityAwaitingStateLedgerHardStopsList.innerHTML = outsideAuthorityAwaitingStateLedger.hardStops
        .map((item) => `<li data-outside-authority-awaiting-state-ledger-hard-stop="true">${escapeHtml(item)}</li>`)
        .join("");
    }
    setText(
      outsideAuthorityAwaitingStateLedgerBoundary,
      "Read-only outside-authority awaiting-state ledger: local-only, private, Do Not Publish, No-Go / Do Not Deploy, no secrets, no external/platform value requests, no platform field unlock, no production origin, no deploy trigger, no dashboard/DNS action, no rollback authorization, no public launch authorization, no production health verification, no public claim authorization, awaiting is blocked state only, non-request, non-executable, no human/platform authority bypass, and no implied execution."
    );

    for (const field of [
      credentialedDeployPlatform,
      credentialedDeployProductionUrl,
      credentialedDeployCredentialAvailability,
      credentialedDeployTrigger,
      credentialedDeployRollbackOwner,
      credentialedDeployRollbackMethod,
      credentialedDeployHealthCheckInputs,
    ]) {
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
        field.toggleAttribute("disabled", !state.platformInputsEnabled);
        field.setAttribute("data-export-eligible", "false");
        field.setAttribute("data-download-eligible", "false");
        field.setAttribute("data-private-credentialed-deploy-readiness-field", "true");
        field.setAttribute("data-no-secret-storage", "true");
        field.setAttribute("data-selected-draft-id", state.selectedDraftId);
      }
    }
    if (credentialedDeployPlatform instanceof HTMLInputElement) credentialedDeployPlatform.value = state.platform;
    if (credentialedDeployProductionUrl instanceof HTMLInputElement) credentialedDeployProductionUrl.value = state.productionUrl;
    if (credentialedDeployCredentialAvailability instanceof HTMLSelectElement) {
      credentialedDeployCredentialAvailability.value = state.credentialAvailability;
    }
    if (credentialedDeployTrigger instanceof HTMLInputElement) credentialedDeployTrigger.value = state.deployTrigger;
    if (credentialedDeployRollbackOwner instanceof HTMLInputElement) credentialedDeployRollbackOwner.value = state.rollbackOwner;
    if (credentialedDeployRollbackMethod instanceof HTMLTextAreaElement) credentialedDeployRollbackMethod.value = state.rollbackMethod;
    if (credentialedDeployHealthCheckInputs instanceof HTMLTextAreaElement) credentialedDeployHealthCheckInputs.value = state.healthCheckInputs;
    const canPersistReadiness = Boolean(state.rehearsalComplete && state.staticDeployRehearsalReady);
    if (credentialedDeployHumanApprovalToggle instanceof HTMLInputElement) {
      credentialedDeployHumanApprovalToggle.checked = state.explicitHumanApprovalObserved;
      credentialedDeployHumanApprovalToggle.toggleAttribute("disabled", !canPersistReadiness);
      credentialedDeployHumanApprovalToggle.setAttribute("data-local-only", "true");
      credentialedDeployHumanApprovalToggle.setAttribute("data-private", "true");
      credentialedDeployHumanApprovalToggle.setAttribute("data-export-eligible", "false");
      credentialedDeployHumanApprovalToggle.setAttribute("data-download-eligible", "false");
    }
    if (savePrivateCredentialedDeployReadinessButton) {
      savePrivateCredentialedDeployReadinessButton.toggleAttribute("disabled", !canPersistReadiness);
    }
    if (clearPrivateCredentialedDeployReadinessButton) {
      const allMissing = state.missingInputs.length === Object.keys(credentialedDeployReadinessFieldLabels).length;
      clearPrivateCredentialedDeployReadinessButton.toggleAttribute(
        "disabled",
        !canPersistReadiness || (allMissing && !state.explicitHumanApprovalObserved && !state.updatedAt)
      );
    }

    if (privateCredentialedDeployReadinessSummary) {
      privateCredentialedDeployReadinessSummary.setAttribute("data-credentialed-deploy-readiness-state", state.state);
      privateCredentialedDeployReadinessSummary.textContent = !state.rehearsalComplete
        ? "Blocked until a completed release-candidate rehearsal exists."
        : !state.staticDeployRehearsalReady
        ? "Blocked until credential-free static deploy rehearsal route evidence passes locally."
        : !state.explicitHumanApprovalObserved
        ? "Blocked until explicit future human approval is observed outside this repo."
        : state.inputsComplete
        ? "Private credentialed-deploy inputs are captured locally. No deploy action was taken."
        : "Completed release-candidate rehearsal exists. Capture platform, URL, credential availability, deploy trigger, rollback, and health-check inputs.";
    }
    setText(
      privateCredentialedDeployReadinessMissing,
      state.missingInputs.length ? `Missing inputs: ${state.missingInputs.join(", ")}.` : "Missing inputs: none."
    );
    setText(
      privateCredentialedDeployReadinessNote,
      state.rehearsalComplete && state.staticDeployRehearsalReady
        ? state.explicitHumanApprovalObserved
          ? "Local-only credentialed-deploy readiness fields are enabled because explicit future human approval was observed outside this repo. Fields stay in browser metadata, store no secrets, are not export/download eligible, and do not deploy or change public/product copy."
          : "Local-only credentialed-deploy readiness remains blocked: explicit future human approval is not observed. Platform fields stay disabled until a separate human approval exists outside this repo."
        : state.rehearsalComplete
        ? "Private credentialed-deploy readiness is waiting for credential-free static deploy rehearsal evidence before platform inputs are requested."
        : "Private credentialed-deploy readiness stays closed until release-candidate rehearsal is complete."
    );
  }

  function renderSessionPrepChecklist() {
    if (!sessionPrepPanel) return;
    const state = sessionPrepState(loadIntakes(), targetRoleInput instanceof HTMLInputElement ? targetRoleInput.value : "");
    const statusClass = state.ready ? "is-approved" : "is-pending";

    sessionPrepPanel.setAttribute("data-session-prep-ready", state.ready ? "true" : "false");
    sessionPrepPanel.setAttribute("data-session-prep-demo-drafts", String(state.demoCount));
    sessionPrepPanel.setAttribute("data-session-prep-user-drafts", String(state.userCount));
    sessionPrepPanel.setAttribute("data-session-prep-redactions", String(state.redactionCount));
    sessionPrepPanel.setAttribute("data-session-prep-local-only", "true");
    sessionPrepPanel.setAttribute("data-export-text-unchanged", "true");

    if (sessionPrepStatus) {
      sessionPrepStatus.className = `status-pill ${statusClass}`;
      sessionPrepStatus.setAttribute("data-session-prep-status", state.ready ? "ready" : "needs-review");
      sessionPrepStatus.textContent = state.ready ? "Ready to start" : "Needs review";
    }

    const entries = [
      ["sessionPrepDraftState", "draftState"],
      ["sessionPrepResetState", "resetState"],
      ["sessionPrepTargetRole", "targetRole"],
      ["sessionPrepRedaction", "redactionReadiness"],
    ];

    for (const [dataPr, key] of entries) {
      const item = document.querySelector(`[data-pr='${dataPr}']`);
      const itemState = state.items[key];
      if (!item || !itemState) continue;
      item.setAttribute("data-session-prep-state", itemState.ready ? "ready" : "needs-review");
      item.setAttribute("data-session-prep-status", itemState.ready ? "ready" : "needs-review");
      item.innerHTML = `<span class="status-pill ${itemState.ready ? "is-approved" : "is-pending"}">${escapeHtml(
        itemState.label
      )}</span><p>${escapeHtml(itemState.text)}</p>`;
    }

    setText(
      sessionPrepNote,
      `Local-only checklist: ${state.totalDrafts} draft${state.totalDrafts === 1 ? "" : "s"}, ${
        state.redactionCount
      } packet redaction${state.redactionCount === 1 ? "" : "s"}, export text unchanged.`
    );
    renderOperatorHandoff(state);
    renderFirstRecruitDispatchBoard();
    renderFirstReplyTriageBoard();
    renderFirstReplyFactCapturePanel();
    renderSchedulingReadinessPanel();
    renderAppointmentSessionStartGatePanel();
    renderFirstSessionRawNoteCapturePanel();
    renderPostSessionDebriefHandoffPanel();
    renderObjectionCodingHandoffPanel();
    renderFiveSessionSynthesisReadinessPanel();
    renderPrivateSynthesisArtifactPanel();
    renderPrivateSynthesisDecisionMemoPanel();
    renderPrivateLaunchDecisionApprovalPanel();
    renderPrivateExplicitPublishPlanPanel();
    renderPrivatePublicCopyDiffRollbackPanel();
    renderPrivateReleaseCandidateRehearsalPanel();
    renderPrivateCredentialedDeployReadinessPanel();
  }

  function setDemoGuardActive(active, message) {
    demoGuardActive = Boolean(active);
    if (submitButton) submitButton.toggleAttribute("disabled", demoGuardActive);
    if (message) status.textContent = message;
  }

  function refreshFormFromLatest(message) {
    const next = latestIntake();
    if (!next) {
      form.reset();
      localStorage.removeItem("proofresume:lastIntakeId");
      const panel = document.querySelector("#local-analysis");
      if (panel) panel.hidden = true;
      setDemoGuardActive(false);
      status.textContent = message || "Cleared local drafts for this browser session.";
      renderSessionPrepChecklist();
      return;
    }

    const targetRole = form.elements.namedItem("targetRole");
    const resumeText = form.elements.namedItem("resumeText");
    if (targetRole instanceof HTMLInputElement) targetRole.value = next.targetRole || "";
    if (resumeText instanceof HTMLTextAreaElement) resumeText.value = next.rawText || next.normalizedText || "";
    renderAnalysis(next, message || "Updated local drafts.");
    if (next.isDemo && resumeText instanceof HTMLTextAreaElement && isDemoResumeText(resumeText.value)) {
      setDemoGuardActive(true, "Sample demo is loaded. Clear/replace the text to paste your resume.");
    } else {
      setDemoGuardActive(false);
    }
    renderSessionPrepChecklist();
  }

  function removeIntakesWhere(predicate) {
    const intakes = loadIntakes();
    const remaining = intakes.filter((intake) => (intake ? !predicate(intake) : false));
    saveIntakes(remaining);
    if (remaining[0]?.id) {
      localStorage.setItem("proofresume:lastIntakeId", remaining[0].id);
    } else {
      localStorage.removeItem("proofresume:lastIntakeId");
    }
    return remaining.length;
  }

  function clearProofPacketRedactions() {
    const intakes = loadIntakes();
    let cleared = 0;
    const updated = intakes.map((intake) => {
      if (!intake || typeof intake !== "object") return intake;
      const existing = intake.proofPacketRedactions && typeof intake.proofPacketRedactions === "object" ? intake.proofPacketRedactions : {};
      const sourceExcerpts = existing.sourceExcerpts && typeof existing.sourceExcerpts === "object" ? existing.sourceExcerpts : {};
      const followupNotes = existing.followupNotes && typeof existing.followupNotes === "object" ? existing.followupNotes : {};
      const redactionCount = Object.keys(sourceExcerpts).length + Object.keys(followupNotes).length;
      if (redactionCount) cleared += redactionCount;
      const next = {
        ...intake,
        updatedAt: nowIso(),
        proofPacketRedactions: emptyProofPacketRedactions(),
      };
      if (next.exportSnapshot) {
        next.exportSnapshot = clearProofPacketSnapshotFields(next.exportSnapshot);
      }
      return next;
    });
    saveIntakes(updated);
    return { drafts: updated.length, redactions: cleared };
  }

  if (resumeTextInput instanceof HTMLTextAreaElement) {
    resumeTextInput.addEventListener("input", () => {
      if (!demoGuardActive) return;
      if (!isDemoResumeText(resumeTextInput.value)) {
        setDemoGuardActive(false, "Demo cleared. Paste your resume to generate a user-provided local draft (still local-only).");
      }
    });
  }

  const existing = latestIntake();
  if (existing) {
    const targetRole = form.elements.namedItem("targetRole");
    const resumeText = form.elements.namedItem("resumeText");
    if (targetRole instanceof HTMLInputElement) targetRole.value = existing.targetRole || "";
    if (resumeText instanceof HTMLTextAreaElement) resumeText.value = existing.rawText || existing.normalizedText || "";
    renderAnalysis(existing, "Loaded your last local draft from this browser.");
    if (existing.isDemo && resumeText instanceof HTMLTextAreaElement && isDemoResumeText(resumeText.value)) {
      setDemoGuardActive(true, "Sample demo loaded from your last session. Clear/replace the text to paste your resume.");
    }
  }
  renderSessionPrepChecklist();
  loadStaticDeployRehearsalEvidence().then((evidence) => {
    staticDeployRehearsalEvidence = evidence;
    renderPrivateCredentialedDeployReadinessPanel();
  });

  if (targetRoleInput instanceof HTMLInputElement) {
    targetRoleInput.addEventListener("input", renderSessionPrepChecklist);
  }

  if (firstReplyFactPanel) {
    firstReplyFactPanel.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const state = target.getAttribute("data-first-reply-fact-action");
      const latest = latestIntake();
      if (!state || !latest?.id) return;
      const next = saveFirstReplyFactState(latest.id, state);
      if (!next) return;
      renderSessionPrepChecklist();
      status.textContent =
        state === "unobserved"
          ? "Reset first-reply facts to unobserved for the selected draft. Resume export text unchanged."
          : `Recorded first-reply fact locally as ${firstReplyFactLabel(state)}. Resume export text unchanged.`;
    });
  }

  if (sessionStartAppointmentTime instanceof HTMLInputElement) {
    sessionStartAppointmentTime.addEventListener("change", () => {
      const latest = latestIntake();
      if (!latest?.id) return;
      const state = appointmentSessionStartGateRecord(latest);
      if (!state.calendarReady) {
        renderSessionPrepChecklist();
        return;
      }
      saveAppointmentSessionStartGate(latest.id, { appointmentDateTime: sessionStartAppointmentTime.value });
      renderSessionPrepChecklist();
      status.textContent = "Recorded appointment date/time locally for the session-start gate. Resume export text unchanged.";
    });
  }

  if (sessionStartGatePanel) {
    sessionStartGatePanel.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const fact = target.getAttribute("data-session-start-fact");
      const latest = latestIntake();
      if (!fact || !latest?.id) return;
      const state = appointmentSessionStartGateRecord(latest);
      if (!state.calendarReady) return;
      const current = latest.appointmentSessionStartGate && typeof latest.appointmentSessionStartGate === "object" ? latest.appointmentSessionStartGate : {};
      if (fact === "reset") {
        saveAppointmentSessionStartGate(latest.id, {
          appointmentDateTime: "",
          consentBoundaryConfirmed: false,
          redactedMaterialReminderConfirmed: false,
          rawNotePrepConfirmed: false,
        });
      } else {
        saveAppointmentSessionStartGate(latest.id, { [fact]: !Boolean(current[fact]) });
      }
      renderSessionPrepChecklist();
      status.textContent = "Updated local appointment-confirmed session-start gate facts. Resume export text unchanged.";
    });
  }

  if (rawNoteCapturePanel) {
    rawNoteCapturePanel.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const latest = latestIntake();
      if (!latest?.id || !appointmentSessionStartGateRecord(latest).ready) return;
      if (target === saveFirstSessionRawNotesButton) {
        saveFirstSessionRawNotes(latest.id, firstSessionRawNotes instanceof HTMLTextAreaElement ? firstSessionRawNotes.value : "");
        renderSessionPrepChecklist();
        status.textContent = "Saved first-session raw notes locally for debrief and objection coding. Resume export text unchanged.";
      }
      if (target === clearFirstSessionRawNotesButton) {
        clearFirstSessionRawNotes(latest.id);
        renderSessionPrepChecklist();
        status.textContent = "Cleared first-session raw notes locally. Resume export text unchanged.";
      }
    });
  }

  if (postSessionDebriefPanel) {
    postSessionDebriefPanel.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const latest = latestIntake();
      if (!latest?.id || !firstSessionRawNoteRecord(latest).hasNotes) return;
      if (target === savePostSessionDebriefButton) {
        savePostSessionDebriefHandoff(latest.id, {
          nextStep: postSessionNextStep instanceof HTMLInputElement ? postSessionNextStep.value : "",
          objectionCode: postSessionObjectionCode instanceof HTMLInputElement ? postSessionObjectionCode.value : "",
          synthesisCue: postSessionSynthesisCue instanceof HTMLTextAreaElement ? postSessionSynthesisCue.value : "",
        });
        renderSessionPrepChecklist();
        status.textContent = "Saved post-session debrief handoff locally. Resume export text unchanged.";
      }
      if (target === clearPostSessionDebriefButton) {
        clearPostSessionDebriefHandoff(latest.id);
        renderSessionPrepChecklist();
        status.textContent = "Cleared post-session debrief handoff locally. Resume export text unchanged.";
      }
    });
  }

  if (objectionCodingPanel) {
    objectionCodingPanel.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const latest = latestIntake();
      if (!latest?.id || !postSessionDebriefHandoffRecord(latest).hasDraft) return;
      if (target === saveObjectionCodingButton) {
        saveObjectionCodingHandoff(latest.id, {
          tags: objectionCodingTags instanceof HTMLInputElement ? objectionCodingTags.value : "",
          synthesisNote: objectionCodingSynthesisNote instanceof HTMLTextAreaElement ? objectionCodingSynthesisNote.value : "",
        });
        renderSessionPrepChecklist();
        status.textContent = "Saved private objection tags locally. Resume export and download text unchanged.";
      }
      if (target === clearObjectionCodingButton) {
        clearObjectionCodingHandoff(latest.id);
        renderSessionPrepChecklist();
        status.textContent = "Cleared private objection tags locally. Resume export and download text unchanged.";
      }
    });
  }

  if (generatePrivateSynthesisArtifactButton instanceof HTMLButtonElement) {
    generatePrivateSynthesisArtifactButton.addEventListener("click", () => {
      const latest = latestIntake();
      if (!latest?.id) return;
      const next = savePrivateSynthesisArtifact(latest.id);
      if (!next) {
        status.textContent = "Private synthesis artifact remains blocked until five complete evidence packets exist.";
        renderPrivateSynthesisArtifactPanel();
        return;
      }
      renderSessionPrepChecklist();
      status.textContent = "Generated private synthesis artifact locally. Resume export and download text unchanged.";
    });
  }

  if (privateSynthesisDecisionMemoPanel) {
    privateSynthesisDecisionMemoPanel.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const latest = latestIntake();
      if (!latest?.id || !privateSynthesisDecisionMemoState(loadIntakes(), latest).artifactExists) return;
      if (target === savePrivateSynthesisDecisionMemoButton) {
        const next = savePrivateSynthesisDecisionMemo(latest.id, {
          reviewedDecision: decisionMemoReviewedDecision instanceof HTMLSelectElement ? decisionMemoReviewedDecision.value : "",
          evidenceConfidence: decisionMemoEvidenceConfidence instanceof HTMLSelectElement ? decisionMemoEvidenceConfidence.value : "",
          publicChangeGuard: decisionMemoPublicChangeGuard instanceof HTMLInputElement ? decisionMemoPublicChangeGuard.value : "",
          operatorNotes: decisionMemoOperatorNotes instanceof HTMLTextAreaElement ? decisionMemoOperatorNotes.value : "",
        });
        renderSessionPrepChecklist();
        const memoState = privateSynthesisDecisionMemoState(loadIntakes(), next || latest);
        void (async () => {
          const logged = await logPrivateSynthesisDecisionMemoToRepo({
            memoState: memoState.readiness,
            reviewedDecision: memoState.reviewedDecision,
            evidenceConfidence: memoState.evidenceConfidence,
            publicChangeGuard: memoState.publicChangeGuard,
            operatorNotes: memoState.operatorNotes,
            memoText: [
              "Private synthesis decision memo (local-only)",
              `Selected draft: ${memoState.selectedDraftId || ""}`,
              `Reviewed decision: ${memoState.reviewedDecision || "not selected"}`,
              `Evidence confidence: ${memoState.evidenceConfidence || "not selected"}`,
              `Public-change guard: ${memoState.publicChangeGuard || "none"}`,
              `Operator notes: ${safeText(memoState.operatorNotes || "").trim().slice(0, 1400) || "none"}`,
              "Boundary: stored as a private operator artifact only; no public launch/pricing/testimonial/demand/outcome claim approved.",
            ].join("\n"),
            artifactPath: `localStorage:proofresume:intakes#${memoState.selectedDraftId || ""}/privateSynthesisArtifact`,
            selectedDraftId: memoState.selectedDraftId,
            sourceArtifactGeneratedAt: memoState.sourceArtifactGeneratedAt,
            sourcePacketCount: memoState.sourcePacketCount,
            requiredPacketCount: memoState.requiredPacketCount,
            capturedAt: nowIso(),
            source: "local-private-synthesis-decision-memo-capture",
          });

          status.textContent = logged
            ? "Saved private synthesis decision memo locally. Logged to data/synthesis-decision-memos/synthesis-decision-memos.jsonl. Resume export, download text, and public/product copy unchanged."
            : "Saved private synthesis decision memo locally. Could not reach the local memo logger. Resume export, download text, and public/product copy unchanged.";
        })();
      }
      if (target === clearPrivateSynthesisDecisionMemoButton) {
        clearPrivateSynthesisDecisionMemo(latest.id);
        renderSessionPrepChecklist();
        status.textContent =
          "Cleared private synthesis decision memo fields locally. Resume export, download text, and public/product copy unchanged.";
      }
    });
  }

  if (privateLaunchDecisionApprovalPanel) {
    privateLaunchDecisionApprovalPanel.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const latest = latestIntake();
      if (!latest?.id || !privateLaunchDecisionApprovalState(loadIntakes(), latest).memoComplete) return;
      if (target === savePrivateLaunchDecisionApprovalButton) {
        savePrivateLaunchDecisionApproval(latest.id, {
          launchDecision: launchDecisionApprovalDecision instanceof HTMLSelectElement ? launchDecisionApprovalDecision.value : "",
          reviewer: launchDecisionApprovalReviewer instanceof HTMLInputElement ? launchDecisionApprovalReviewer.value : "",
          approvalNotes: launchDecisionApprovalNotes instanceof HTMLTextAreaElement ? launchDecisionApprovalNotes.value : "",
        });
        renderSessionPrepChecklist();
        status.textContent =
          "Saved private launch decision approval locally. Resume export, download text, and public/product copy unchanged.";
      }
      if (target === clearPrivateLaunchDecisionApprovalButton) {
        clearPrivateLaunchDecisionApproval(latest.id);
        renderSessionPrepChecklist();
        status.textContent =
          "Cleared private launch decision approval locally. Resume export, download text, and public/product copy unchanged.";
      }
    });
  }

  if (privateExplicitPublishPlanPanel) {
    privateExplicitPublishPlanPanel.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const latest = latestIntake();
      if (!latest?.id || !privateExplicitPublishPlanState(latest).checklistComplete) return;
      if (target === savePrivateExplicitPublishPlanButton) {
        savePrivateExplicitPublishPlan(latest.id, {
          owner: publishPlanOwner instanceof HTMLInputElement ? publishPlanOwner.value : "",
          rollback: publishPlanRollback instanceof HTMLTextAreaElement ? publishPlanRollback.value : "",
          claimRisk: publishPlanClaimRisk instanceof HTMLTextAreaElement ? publishPlanClaimRisk.value : "",
          publicCopyDiff: publishPlanPublicCopyDiff instanceof HTMLTextAreaElement ? publishPlanPublicCopyDiff.value : "",
        });
        renderSessionPrepChecklist();
        status.textContent =
          "Saved private explicit publish plan locally. No publish action taken; resume export, download text, and public/product copy unchanged.";
      }
      if (target === clearPrivateExplicitPublishPlanButton) {
        clearPrivateExplicitPublishPlan(latest.id);
        renderSessionPrepChecklist();
        status.textContent =
          "Cleared private explicit publish plan locally. No publish action taken; resume export, download text, and public/product copy unchanged.";
      }
    });
  }

  if (privatePublicCopyDiffRollbackPanel) {
    privatePublicCopyDiffRollbackPanel.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const latest = latestIntake();
      if (!latest?.id || !privatePublicCopyDiffRollbackState(latest).planComplete) return;
      if (target === savePrivatePublicCopyDiffRollbackButton) {
        savePrivatePublicCopyDiffRollback(latest.id, {
          diffSummary: copyDiffRollbackDiffSummary instanceof HTMLTextAreaElement ? copyDiffRollbackDiffSummary.value : "",
          consentCheck: copyDiffRollbackConsentCheck instanceof HTMLSelectElement ? copyDiffRollbackConsentCheck.value : "",
          claimRiskCheck: copyDiffRollbackClaimRiskCheck instanceof HTMLSelectElement ? copyDiffRollbackClaimRiskCheck.value : "",
          validationCommand: copyDiffRollbackValidationCommand instanceof HTMLInputElement ? copyDiffRollbackValidationCommand.value : "",
          rollbackPath: copyDiffRollbackRollbackPath instanceof HTMLTextAreaElement ? copyDiffRollbackRollbackPath.value : "",
        });
        renderSessionPrepChecklist();
        renderPrivateReleaseCandidateRehearsalPanel();
        renderPrivateCredentialedDeployReadinessPanel();
        status.textContent =
          "Saved private public-copy diff and rollback packet locally. No publish action taken; export, download, and public/product copy unchanged.";
      }
      if (target === clearPrivatePublicCopyDiffRollbackButton) {
        clearPrivatePublicCopyDiffRollback(latest.id);
        renderSessionPrepChecklist();
        renderPrivateReleaseCandidateRehearsalPanel();
        renderPrivateCredentialedDeployReadinessPanel();
        status.textContent =
          "Cleared private public-copy diff and rollback packet locally. No publish action taken; export, download, and public/product copy unchanged.";
      }
    });
  }

  if (privateReleaseCandidateRehearsalPanel) {
    privateReleaseCandidateRehearsalPanel.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const latest = latestIntake();
      if (!latest?.id || !privateReleaseCandidateRehearsalState(latest).diffPacketComplete) return;
      if (target === savePrivateReleaseCandidateRehearsalButton) {
        savePrivateReleaseCandidateRehearsal(latest.id, {
          localStaticSmoke: releaseCandidateStaticSmoke instanceof HTMLInputElement ? releaseCandidateStaticSmoke.value : "",
          servedSmoke: releaseCandidateServedSmoke instanceof HTMLInputElement ? releaseCandidateServedSmoke.value : "",
          rollbackRehearsal: releaseCandidateRollbackRehearsal instanceof HTMLTextAreaElement ? releaseCandidateRollbackRehearsal.value : "",
          consentCheck: releaseCandidateConsentCheck instanceof HTMLSelectElement ? releaseCandidateConsentCheck.value : "",
          claimRiskCheck: releaseCandidateClaimRiskCheck instanceof HTMLSelectElement ? releaseCandidateClaimRiskCheck.value : "",
        });
        renderSessionPrepChecklist();
        renderPrivateReleaseCandidateRehearsalPanel();
        renderPrivateCredentialedDeployReadinessPanel();
        status.textContent =
          "Saved private release-candidate rehearsal locally. No deploy or publish action taken; export, download, and public/product copy unchanged.";
      }
      if (target === clearPrivateReleaseCandidateRehearsalButton) {
        clearPrivateReleaseCandidateRehearsal(latest.id);
        renderSessionPrepChecklist();
        renderPrivateReleaseCandidateRehearsalPanel();
        renderPrivateCredentialedDeployReadinessPanel();
        status.textContent =
          "Cleared private release-candidate rehearsal locally. No deploy or publish action taken; export, download, and public/product copy unchanged.";
      }
    });
  }

  if (privateCredentialedDeployReadinessPanel) {
    privateCredentialedDeployReadinessPanel.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLButtonElement)) return;
      const latest = latestIntake();
      const readiness = privateCredentialedDeployReadinessState(latest, staticDeployRehearsalEvidence);
      if (!latest?.id || !readiness.rehearsalComplete || !readiness.staticDeployRehearsalReady) return;
      if (target === savePrivateCredentialedDeployReadinessButton) {
        const approvalObserved =
          credentialedDeployHumanApprovalToggle instanceof HTMLInputElement && credentialedDeployHumanApprovalToggle.checked;
        savePrivateCredentialedDeployReadiness(latest.id, {
          explicitHumanApprovalObserved: approvalObserved,
          explicitHumanApprovalSource: approvalObserved ? "external-human-approval" : "",
          platform: approvalObserved && credentialedDeployPlatform instanceof HTMLInputElement ? credentialedDeployPlatform.value : "",
          productionUrl:
            approvalObserved && credentialedDeployProductionUrl instanceof HTMLInputElement ? credentialedDeployProductionUrl.value : "",
          credentialAvailability:
            approvalObserved && credentialedDeployCredentialAvailability instanceof HTMLSelectElement
              ? credentialedDeployCredentialAvailability.value
              : "",
          deployTrigger: approvalObserved && credentialedDeployTrigger instanceof HTMLInputElement ? credentialedDeployTrigger.value : "",
          rollbackOwner:
            approvalObserved && credentialedDeployRollbackOwner instanceof HTMLInputElement ? credentialedDeployRollbackOwner.value : "",
          rollbackMethod:
            approvalObserved && credentialedDeployRollbackMethod instanceof HTMLTextAreaElement ? credentialedDeployRollbackMethod.value : "",
          healthCheckInputs:
            approvalObserved && credentialedDeployHealthCheckInputs instanceof HTMLTextAreaElement ? credentialedDeployHealthCheckInputs.value : "",
        });
        renderSessionPrepChecklist();
        renderPrivateCredentialedDeployReadinessPanel();
        status.textContent =
          "Saved private credentialed-deploy readiness locally. No secrets stored, no deploy action taken, and export, download, and public/product copy unchanged.";
      }
      if (target === clearPrivateCredentialedDeployReadinessButton) {
        clearPrivateCredentialedDeployReadiness(latest.id);
        renderSessionPrepChecklist();
        renderPrivateCredentialedDeployReadinessPanel();
        status.textContent =
          "Cleared private credentialed-deploy readiness locally. No secrets stored, no deploy action taken, and export, download, and public/product copy unchanged.";
      }
    });
  }

  clearButton.addEventListener("click", () => {
    form.reset();
    localStorage.removeItem("proofresume:lastIntakeId");
    const panel = document.querySelector("#local-analysis");
    if (panel) panel.hidden = true;
    status.textContent = "Cleared the form view. Previously saved local drafts remain in this browser's localStorage.";
    setDemoGuardActive(false);
    renderSessionPrepChecklist();
  });

  if (resetDemoButton) {
    resetDemoButton.addEventListener("click", () => {
      const remaining = removeIntakesWhere((intake) => Boolean(intake?.isDemo));
      refreshFormFromLatest(`Cleared demo drafts. Remaining local drafts: ${remaining}.`);
    });
  }

  if (resetUserButton) {
    resetUserButton.addEventListener("click", () => {
      const remaining = removeIntakesWhere((intake) => !intake?.isDemo);
      refreshFormFromLatest(`Cleared user drafts. Remaining local drafts: ${remaining}.`);
    });
  }

  if (resetRedactionsButton) {
    resetRedactionsButton.addEventListener("click", () => {
      const result = clearProofPacketRedactions();
      refreshFormFromLatest(
        `Cleared ${result.redactions} proof-packet redaction${result.redactions === 1 ? "" : "s"} across ${
          result.drafts
        } local draft${result.drafts === 1 ? "" : "s"}. Resume export text was not changed.`
      );
    });
  }

  if (resetAllButton) {
    resetAllButton.addEventListener("click", () => {
      saveIntakes([]);
      localStorage.removeItem("proofresume:lastIntakeId");
      refreshFormFromLatest("Cleared all local drafts for this browser session.");
    });
  }

  function saveCurrentPaste() {
    status.textContent = "";

    const data = new FormData(form);
    const targetRole = String(data.get("targetRole") || "").trim();
    const resumeTextRaw = String(data.get("resumeText") || "");
    const resumeText = normalizePaste(resumeTextRaw);

    if (!resumeText) {
      status.textContent = "Paste at least one line to generate a draft report.";
      return null;
    }

    if (demoGuardActive && isDemoResumeText(resumeTextRaw)) {
      status.textContent =
        "Sample demo is loaded. Use “Open draft report” to view it, or clear/replace the text before generating a user-provided draft.";
      return null;
    }

    const intakeId = randomId("intake");
    const analysis = buildAnalysis(resumeText, targetRole);
    const intake = {
      id: intakeId,
      schemaVersion: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      targetRole,
      sourceType: "pasted_resume_text",
      isDemo: false,
      materialBoundary: {
        kind: "user-provided material",
        demoMaterialIncluded: false,
        userMaterialIncluded: true,
      },
      rawText: safeText(resumeTextRaw),
      normalizedText: resumeText,
      structuredExtraction: analysis.structuredExtraction,
      analysis,
      approvals: {
        updatedAt: nowIso(),
        evidence: {},
        candidates: {},
        structuredFacts: {},
      },
      note:
        "Local-only prototype: stored in browser localStorage only. No external service was contacted. Raw text preserved unchanged.",
    };

    const intakes = loadIntakes();
    intakes.unshift(intake);
    saveIntakes(intakes);

    localStorage.setItem("proofresume:lastIntakeId", intakeId);
    renderAnalysis(intake);
    renderSessionPrepChecklist();
    return intake;
  }

  function saveDemoDraft() {
    const targetRole = demoTargetRole;
    const resumeText = normalizePaste(demoResumeText);
    const intakeId = randomId("demo");
    const analysis = buildAnalysis(resumeText, targetRole);
    const intake = {
      id: intakeId,
      schemaVersion: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      targetRole,
      sourceType: "demo_sample_material",
      isDemo: true,
      materialBoundary: {
        kind: "sample/demo material",
        demoMaterialIncluded: true,
        userMaterialIncluded: false,
      },
      rawText: demoResumeText,
      normalizedText: resumeText,
      structuredExtraction: analysis.structuredExtraction,
      analysis,
      approvals: {
        updatedAt: nowIso(),
        evidence: {},
        candidates: {},
        structuredFacts: {},
      },
      note:
        "Local-only demo mode: built-in sample material stored in browser localStorage only. No external service was contacted. Demo text is not user-provided material.",
    };

    const intakes = loadIntakes();
    intakes.unshift(intake);
    saveIntakes(intakes);
    localStorage.setItem("proofresume:lastIntakeId", intakeId);

    const targetRoleInput = form.elements.namedItem("targetRole");
    const resumeTextInput = form.elements.namedItem("resumeText");
    if (targetRoleInput instanceof HTMLInputElement) targetRoleInput.value = targetRole;
    if (resumeTextInput instanceof HTMLTextAreaElement) resumeTextInput.value = demoResumeText;
    renderAnalysis(intake, "Loaded a local sample demo draft. It is labeled separately from user-provided resume material.");
    setDemoGuardActive(true, "Sample demo loaded. Open the draft report from the analysis panel, or clear/replace the text to paste your resume.");
    renderSessionPrepChecklist();
    return intake;
  }

  function wireActivationDecisionPacketReviewStatusMarker() {
    const panel = document.querySelector("[data-activation-decision-packet-review-status]");
    if (!panel) return;
    const storageKey = panel.getAttribute("data-storage-key") || ACTIVATION_DECISION_PACKET_REVIEW_STATUS_KEY;
    const select = panel.querySelector("[data-activation-decision-packet-review-status-input]");
    const save = panel.querySelector("[data-activation-decision-packet-review-status-save]");
    const target = panel.querySelector("[data-activation-decision-packet-review-status-target]");
    const defaultStatus = String(panel.getAttribute("data-default-status") || "not-reviewed");

    function render(prefix = "Packet summary review status") {
      const record = loadActivationDecisionPacketReviewStatus(storageKey);
      const status = record.status || defaultStatus;
      if (select instanceof HTMLSelectElement) select.value = status;
      if (target) {
        target.textContent = `${prefix}: ${status.replaceAll("-", " ")}. Browser localStorage only; no control authority changes.`;
      }
    }

    render();
    save?.addEventListener("click", () => {
      const nextStatus = select instanceof HTMLSelectElement ? select.value : defaultStatus;
      storeActivationDecisionPacketReviewStatus(storageKey, nextStatus);
      render("Saved packet review status");
    });
  }

  wireActivationDecisionPacketReviewStatusMarker();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveCurrentPaste();
  });

  if (demoButton) {
    demoButton.addEventListener("click", () => {
      saveDemoDraft();
    });
  }

  if (reanalyzeButton) {
    reanalyzeButton.addEventListener("click", () => {
      const intake = saveCurrentPaste();
      if (intake) {
        renderAnalysis(intake, "Re-analyzed and saved a fresh local draft. No external service was contacted.");
      }
    });
  }
}

main();

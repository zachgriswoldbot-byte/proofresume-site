const demoResume = `Jordan Lee
Customer Operations Lead

Experience
- Built onboarding playbooks that cut first-response time by 34%.
- Led a five-person support pod across Zendesk, HubSpot, and Slack.
- Partnered with product to turn customer issues into weekly roadmap signals.
- Improved help-center coverage and reduced repeated tickets by 22%.

Skills
Customer operations, onboarding, support QA, analytics, knowledge base, CRM workflows, process design.`;

const demoJobs = [
  {
    company: "Northstar Health",
    title: "Customer Operations Lead",
    match: 94,
    reason: "Strong overlap with onboarding, support QA, and workflow ownership.",
    draft: "Led onboarding and support operations work that reduced response time and improved knowledge coverage.",
  },
  {
    company: "Loopline",
    title: "Implementation Specialist",
    match: 88,
    reason: "Good fit for customer handoff, CRM process, and cross-functional product feedback.",
    draft: "Built repeatable customer handoff systems across support, product, and success teams.",
  },
  {
    company: "BrightDesk",
    title: "Support Ops Manager",
    match: 83,
    reason: "Matches help-center ownership, analytics, and support quality experience.",
    draft: "Improved support workflows using ticket analysis, playbooks, and QA loops.",
  },
];

const resumeInput = document.querySelector("[data-apply-resume]");
const resumeFileInput = document.querySelector("[data-apply-resume-file]");
const targetInput = document.querySelector("[data-apply-target]");
const locationInput = document.querySelector("[data-apply-location]");
const form = document.querySelector("[data-apply-form]");
const queue = document.querySelector("[data-apply-queue]");
const approveAllButton = document.querySelector("[data-apply-approve-all]");
const planTitle = document.querySelector("[data-apply-plan-title]");
const statusLabel = document.querySelector("[data-apply-status-label]");
const meterFill = document.querySelector("[data-apply-meter-fill]");
const roleCount = document.querySelector("[data-apply-role-count]");
const readyCount = document.querySelector("[data-apply-ready-count]");
const appliedCount = document.querySelector("[data-apply-applied-count]");
const pilotForm = document.querySelector("[data-apply-pilot-form]");
const pilotStatus = document.querySelector("[data-apply-pilot-status]");
const emailRequestButton = document.querySelector("[data-apply-email-request]");
const copyRequestButton = document.querySelector("[data-apply-copy-request]");
const downloadRequestButton = document.querySelector("[data-apply-download-request]");
const readinessScore = document.querySelector("[data-apply-readiness-score]");
const readinessList = document.querySelector("[data-apply-readiness-list]");
const nextStep = document.querySelector("[data-apply-next-step]");
const handoffNote = document.querySelector("[data-apply-handoff-note]");

let applications = [];
let latestPilotPacket = null;
let latestPilotRequestText = "";
let latestOperatorEmailUrl = "";

const operatorInboxEmail = "zackgriswold@gmail.com";

function linesFrom(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function compactValue(value) {
  return String(value || "").trim();
}

function formatPilotPacket(packet) {
  return [
    "ProofResume pilot request",
    `Name: ${packet.customer.name}`,
    `Email: ${packet.customer.email}`,
    `Phone: ${packet.customer.phone || "Not provided"}`,
    `Target role: ${packet.search.targetRole}`,
    `Location rules: ${packet.search.locationRules}`,
    `Weekly target: ${packet.search.weeklyTarget}`,
    `Work authorization: ${packet.search.workAuthorization}`,
    `Generated queue size: ${packet.generatedQueue.length}`,
    `Readiness: ${packet.readiness.readyCount}/${packet.readiness.totalCount} ${packet.readiness.state}`,
    `Resume words: ${packet.resume.wordCount}`,
    "",
    "Profile links:",
    packet.customer.profileLinks.length ? packet.customer.profileLinks.join("\n") : "Not provided",
    "",
    "Must-haves:",
    packet.search.mustHaves || "Not provided",
    "",
    "Dealbreakers:",
    packet.search.dealbreakers || "Not provided",
    "",
    "Job links:",
    packet.search.jobLinks.length ? packet.search.jobLinks.join("\n") : "Not provided",
    "",
    "Existing job accounts:",
    packet.search.existingAccounts.length ? packet.search.existingAccounts.join("\n") : "Not provided",
  ].join("\n");
}

function formatOperatorEmail(packet) {
  return [
    "A customer created a ProofResume pilot packet.",
    "",
    formatPilotPacket(packet),
    "",
    "Operator checklist:",
    ...packet.operatorChecklist.map((item) => `- ${item}`),
    "",
    "Note: the downloadable JSON packet in the browser includes the pasted resume text and full generated queue.",
  ].join("\n");
}

function buildOperatorEmailUrl(packet) {
  const subject = `ProofResume pilot packet: ${packet.customer.name || "new customer"} - ${packet.search.targetRole || "target role"}`;
  const body = formatOperatorEmail(packet);
  return `mailto:${operatorInboxEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function currentPilotFormData() {
  return pilotForm ? new FormData(pilotForm) : new FormData();
}

function buildReadiness({ data = currentPilotFormData(), resumeText = resumeInput.value, queue = applications } = {}) {
  const checks = [
    {
      id: "contact",
      label: "Contact",
      ok: Boolean(compactValue(data.get("name")) && compactValue(data.get("email"))),
      fix: "Add name and email.",
    },
    {
      id: "resume",
      label: "Resume",
      ok: summarizeResume(resumeText).wordCount >= 20,
      fix: "Paste or upload a readable resume.",
    },
    {
      id: "target",
      label: "Target",
      ok: Boolean(compactValue(data.get("targetRole")) && compactValue(data.get("locationRules"))),
      fix: "Add target role and location rules.",
    },
    {
      id: "jobLinks",
      label: "Job links",
      ok: linesFrom(data.get("jobLinks")).length > 0 || linesFrom(data.get("targetCompanies")).length > 0,
      fix: "Add at least one job link or target company.",
    },
    {
      id: "queue",
      label: "Queue",
      ok: queue.length > 0,
      fix: "Build the application queue.",
    },
    {
      id: "consent",
      label: "Consent",
      ok: data.get("consent") === "on" && data.get("resumeConsent") === "on" && data.get("approvalConsent") === "on",
      fix: "Confirm pilot, resume-use, and approval-before-send consent.",
    },
  ];
  return {
    format: "proofresume-pilot-readiness-v1",
    readyCount: checks.filter((check) => check.ok).length,
    totalCount: checks.length,
    state: checks.every((check) => check.ok) ? "ready_for_operator_review" : "needs_customer_input",
    checks,
  };
}

function renderReadiness(readiness = buildReadiness()) {
  if (!readinessScore || !readinessList || !nextStep || !handoffNote) return;
  readinessScore.textContent = `${readiness.readyCount}/${readiness.totalCount}`;
  readinessList.innerHTML = readiness.checks
    .map((check) => `<li data-ready="${check.ok}"><strong>${check.label}</strong><span>${check.ok ? "Ready" : check.fix}</span></li>`)
    .join("");
  nextStep.textContent = readiness.state === "ready_for_operator_review" ? "Review packet" : "Needs input";
  handoffNote.textContent =
    readiness.state === "ready_for_operator_review"
      ? "Packet has enough information for an operator to review the resume, confirm application boundaries, and prepare the first batch."
      : "Fill the missing items above so the first operator pass does not turn into a back-and-forth.";
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function summarizeResume(text) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  return {
    wordCount: words.length,
    hasOps: /operations|support|onboarding|customer/i.test(text),
    hasMetrics: /\d+%|\d+\s*(person|team|tickets|customers)/i.test(text),
  };
}

function buildApplications() {
  const resume = resumeInput.value.trim();
  const target = targetInput.value.trim() || "target roles";
  const location = locationInput.value.trim() || "flexible";
  const profile = summarizeResume(resume);

  applications = demoJobs.map((job, index) => ({
    ...job,
    id: `app-${index + 1}`,
    status: "ready",
    note: `${job.title} at ${job.company}: tailored for ${target} in ${location}.`,
    proof: profile.hasMetrics ? "Uses quantified resume proof." : "Needs one metric before send.",
  }));

  renderApplications();
  updateSummary();
  renderReadiness();
}

function renderApplications() {
  if (!applications.length) {
    queue.innerHTML = `<article class="apply-empty"><h3>Your queue will appear here.</h3><p>Click “Use demo resume” to see the full product loop.</p></article>`;
    return;
  }

  queue.innerHTML = applications
    .map(
      (app) => `
        <article class="apply-job" data-apply-job="${app.id}" data-status="${app.status}">
          <div class="apply-job-head">
            <div>
              <span>${app.company}</span>
              <h3>${app.title}</h3>
            </div>
            <strong>${app.match}/100</strong>
          </div>
          <p>${app.reason}</p>
          <div class="apply-draft">
            <span>Draft bullet</span>
            <p>${app.draft}</p>
          </div>
          <div class="apply-job-footer">
            <span class="status-pill">${statusText(app.status)}</span>
            <button class="secondary-action" type="button" data-apply-approve="${app.id}">
              ${app.status === "applied" ? "Applied" : "Approve"}
            </button>
          </div>
        </article>
      `
    )
    .join("");
}

function statusText(status) {
  if (status === "applied") return "Applied in demo";
  if (status === "approved") return "Approved";
  return "Ready";
}

function updateSummary() {
  const total = applications.length;
  const applied = applications.filter((app) => app.status === "applied").length;
  const approved = applications.filter((app) => app.status === "approved").length;
  const ready = applications.filter((app) => app.status === "ready").length;
  const done = applied || approved;
  const progress = total ? Math.round((done / total) * 100) : 0;

  roleCount.textContent = total;
  readyCount.textContent = ready + approved;
  appliedCount.textContent = applied;
  meterFill.style.width = `${progress}%`;
  planTitle.textContent = total ? "Queue built" : "Not started";
  statusLabel.textContent = applied === total && total ? "Applied" : total ? "Ready" : "Waiting";
  approveAllButton.disabled = !applications.some((app) => app.status === "ready");
}

function approve(id) {
  applications = applications.map((app) => (app.id === id && app.status === "ready" ? { ...app, status: "applied" } : app));
  renderApplications();
  updateSummary();
}

document.querySelectorAll("[data-apply-demo-load]").forEach((button) => {
  button.addEventListener("click", () => {
    resumeInput.value = demoResume;
    buildApplications();
    document.querySelector(".apply-queue-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

resumeFileInput?.addEventListener("change", async () => {
  const file = resumeFileInput.files?.[0];
  if (!file) return;
  const textLike = /text|json|csv|markdown/i.test(file.type) || /\.(txt|md|text|json|csv)$/i.test(file.name);
  if (!textLike) {
    pilotStatus.textContent = "File selected. Paste resume text too so the demo can read it.";
    return;
  }
  resumeInput.value = await file.text();
  pilotStatus.textContent = `Loaded ${file.name}. Build the queue when ready.`;
  renderReadiness();
});

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!resumeInput.value.trim()) resumeInput.value = demoResume;
  buildApplications();
});

queue?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-apply-approve]");
  if (!button) return;
  approve(button.dataset.applyApprove);
});

approveAllButton?.addEventListener("click", () => {
  applications = applications.map((app) => (app.status === "ready" ? { ...app, status: "applied" } : app));
  renderApplications();
  updateSummary();
});

pilotForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(pilotForm);
  const resumeText = resumeInput.value.trim();
  const resumeSummary = summarizeResume(resumeText);
  const readiness = buildReadiness({ data, resumeText });
  latestPilotPacket = {
    format: "proofresume-pilot-intake-packet-v1",
    createdAt: new Date().toISOString(),
    source: "browser-local-demo",
    customer: {
      name: compactValue(data.get("name")),
      email: compactValue(data.get("email")),
      phone: compactValue(data.get("phone")),
      profileLinks: linesFrom(data.get("profileLinks")),
    },
    resume: {
      pastedText: resumeText,
      wordCount: resumeSummary.wordCount,
      hasMetrics: resumeSummary.hasMetrics,
      hasOperationsKeywords: resumeSummary.hasOps,
      uploadedFileName: resumeFileInput?.files?.[0]?.name || null,
    },
    search: {
      targetRole: compactValue(data.get("targetRole")),
      targetFromWorkbench: targetInput.value.trim(),
      targetCompanies: linesFrom(data.get("targetCompanies")),
      jobLinks: linesFrom(data.get("jobLinks")),
      locationRules: compactValue(data.get("locationRules")),
      locationFromWorkbench: locationInput.value.trim(),
      salaryTarget: compactValue(data.get("salaryTarget")),
      weeklyTarget: compactValue(data.get("weeklyTarget")),
      workAuthorization: compactValue(data.get("workAuthorization")),
      startDate: compactValue(data.get("startDate")),
      mustHaves: compactValue(data.get("mustHaves")),
      dealbreakers: compactValue(data.get("dealbreakers")),
      applicationNotes: compactValue(data.get("applicationNotes")),
      existingAccounts: linesFrom(data.get("existingAccounts")),
    },
    consent: {
      managedPilotRequested: data.get("consent") === "on",
      resumeUseApproved: data.get("resumeConsent") === "on",
      liveSendsRequireExplicitApproval: data.get("approvalConsent") === "on",
    },
    generatedQueue: applications.map((app) => ({
      company: app.company,
      title: app.title,
      match: app.match,
      status: app.status,
      draft: app.draft,
      reason: app.reason,
    })),
    operatorChecklist: [
      "Confirm contact path and consent before follow-up.",
      "Review resume text for missing metrics, gaps, and unsupported claims.",
      "Confirm target roles, location rules, salary target, work authorization, and dealbreakers.",
      "Confirm account access and job-board terms outside this static demo before any live apply action.",
      "Get explicit approval for each application before live submission.",
    ],
    readiness,
  };

  latestPilotRequestText = formatPilotPacket(latestPilotPacket);
  latestOperatorEmailUrl = buildOperatorEmailUrl(latestPilotPacket);
  localStorage.setItem("proofresume:pilotRequest", latestPilotRequestText);
  localStorage.setItem("proofresume:pilotIntakePacket", JSON.stringify(latestPilotPacket));
  localStorage.setItem("proofresume:operatorEmailUrl", latestOperatorEmailUrl);
  emailRequestButton.disabled = false;
  copyRequestButton.disabled = false;
  downloadRequestButton.disabled = false;
  pilotStatus.textContent = "Pilot packet created. Email the operator or download the full JSON.";
  renderReadiness(readiness);
});

pilotForm?.addEventListener("input", () => renderReadiness());
pilotForm?.addEventListener("change", () => renderReadiness());
resumeInput?.addEventListener("input", () => renderReadiness());

emailRequestButton?.addEventListener("click", () => {
  if (!latestOperatorEmailUrl) latestOperatorEmailUrl = localStorage.getItem("proofresume:operatorEmailUrl") || "";
  if (!latestOperatorEmailUrl) return;
  window.location.href = latestOperatorEmailUrl;
  pilotStatus.textContent = `Opening email draft to ${operatorInboxEmail}. Attach the downloaded JSON for full resume detail.`;
});

copyRequestButton?.addEventListener("click", async () => {
  if (!latestPilotRequestText) latestPilotRequestText = localStorage.getItem("proofresume:pilotRequest") || "";
  if (!latestPilotRequestText) return;
  await navigator.clipboard.writeText(latestPilotRequestText);
  pilotStatus.textContent = "Pilot request copied.";
});

downloadRequestButton?.addEventListener("click", () => {
  if (!latestPilotPacket) {
    const storedPacket = localStorage.getItem("proofresume:pilotIntakePacket");
    latestPilotPacket = storedPacket ? JSON.parse(storedPacket) : null;
  }
  if (!latestPilotPacket) return;
  downloadJson("proofresume-pilot-intake-packet.json", latestPilotPacket);
  pilotStatus.textContent = "Pilot packet downloaded.";
});

updateSummary();
renderReadiness();

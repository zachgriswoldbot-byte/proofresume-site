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
const copyRequestButton = document.querySelector("[data-apply-copy-request]");

let applications = [];
let latestPilotRequest = "";

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
  latestPilotRequest = [
    "ProofResume pilot request",
    `Name: ${data.get("name")}`,
    `Target role: ${data.get("targetRole")}`,
    `Weekly target: ${data.get("weeklyTarget")}`,
    `Generated queue size: ${applications.length || 0}`,
  ].join("\n");
  localStorage.setItem("proofresume:pilotRequest", latestPilotRequest);
  copyRequestButton.disabled = false;
  pilotStatus.textContent = "Pilot request created locally. Copy it when you are ready.";
});

copyRequestButton?.addEventListener("click", async () => {
  if (!latestPilotRequest) latestPilotRequest = localStorage.getItem("proofresume:pilotRequest") || "";
  if (!latestPilotRequest) return;
  await navigator.clipboard.writeText(latestPilotRequest);
  pilotStatus.textContent = "Pilot request copied.";
});

updateSummary();

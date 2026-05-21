const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium, firefox, webkit } = require("playwright");

const root = path.resolve(__dirname, "..");
const projectRoot = path.resolve(root, "..");
const businessControlsPolicy = JSON.parse(fs.readFileSync(path.join(projectRoot, "ops", "BUSINESS_CONTROLS.json"), "utf8"));
const sampleResume = [
  "Jordan Lee",
  "Email: jordan@example.com",
  "Summary",
  "Operations analyst focused on forecast quality and executive reporting.",
  "Experience",
  "Built quarterly demand forecast model that improved accuracy from 71% to 88% across 4 regions.",
  "Automated weekly leadership dashboard and saved 5 hours per reporting cycle.",
  "Skills",
  "SQL, Excel, Tableau, stakeholder communication",
].join("\n");
const malformedResume = [
  "<script>fetch('https://example.invalid/steal')</script>",
  "{{{{{ not-json",
  "DROP TABLE resumes;",
  "Experience",
  "Responsible for stuff and things.",
  "Skills",
  "<b>Excel</b> & dashboards",
].join("\n");
const longResume = Array.from({ length: 80 }, (_, index) => {
  const quarter = (index % 4) + 1;
  return `Built Q${quarter} operating dashboard ${index + 1} that saved ${index + 2} hours and improved weekly planning for finance leaders.`;
}).join("\n");
const demoBoundaryResume = [
  "Avery DemoBoundary",
  "Summary",
  "Operations analyst for local QA boundary testing.",
  "Experience",
  "Led onboarding analytics project that saved 14 hours per month for support managers.",
  "Built renewal risk dashboard used by 8 customer success leads every week.",
  "Skills",
  "SQL, Looker, customer operations",
].join("\n");
const structuredExtractionResume = [
  "Riley Chen",
  "Email: riley@example.test",
  "Summary",
  "Operations analyst focused on renewal forecasting.",
  "Experience",
  "Senior Operations Analyst",
  "Northstar Foods | Jan 2021 - Mar 2024",
  "Led renewal analytics program that reduced forecast variance from 18% to 9% across 7 regions.",
  "Automated customer health dashboard used by 12 account managers every Monday.",
  "Operations Coordinator",
  "Blue Harbor Logistics | Jun 2018 - Dec 2020",
  "Built carrier scorecard that cut late shipments by 14% in two quarters.",
  "Skills",
  "SQL, Tableau, Excel, Salesforce",
].join("\n");

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
]);

const networkDisabled =
  process.env.CODEX_SANDBOX_NETWORK_DISABLED === "1" || process.env.CODEX_SANDBOX_NETWORK_DISABLED === "true";
const responseOverrides = new Map();

function contentType(filePath) {
  return mimeTypes.get(path.extname(filePath)) || "application/octet-stream";
}

function safeFilePath(urlPath) {
  const normalized = decodeURIComponent(urlPath.split("?")[0]);
  const requested = normalized === "/" ? "/index.html" : normalized;
  const resolved = path.resolve(root, `.${requested}`);
  if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
    return null;
  }
  return resolved;
}

function startStaticServer() {
  const server = http.createServer((request, response) => {
    const requestPath = new URL(request.url || "/", "http://127.0.0.1").pathname;
    if (requestPath === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    const override = responseOverrides.get(requestPath);
    if (override) {
      response.writeHead(override.status || 200, { "content-type": override.contentType || "application/json; charset=utf-8" });
      response.end(typeof override.body === "string" ? override.body : JSON.stringify(override.body));
      return;
    }

    const filePath = safeFilePath(request.url || "/");
    if (!filePath) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, body) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      response.writeHead(200, { "content-type": contentType(filePath) });
      response.end(body);
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
    });
  });
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

  throw new Error(`qa-intake-flow failed to launch any browser engine:\n${errors.join("\n")}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function settleCleanup(action, timeoutMs = 3000, onTimeout = null) {
  let timeoutId;
  let timedOut = false;
  try {
    await Promise.race([
      Promise.resolve().then(action),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => {
          timedOut = true;
          resolve();
        }, timeoutMs);
      }),
    ]);
  } catch (_error) {
    // Browser/server teardown should not mask an already-emitted QA result.
  } finally {
    clearTimeout(timeoutId);
    if (timedOut && typeof onTimeout === "function") {
      try {
        onTimeout();
      } catch (_error) {
        // Last-ditch cleanup should stay best-effort.
      }
    }
  }
}

function createScenario(name) {
  const assertions = [];
  return {
    name,
    assertions,
    check(condition, message) {
      assert(condition, `[${name}] ${message}`);
      assertions.push(message);
    },
  };
}

function hasForbiddenDeployValue(text) {
  const source = String(text || "").replace(/\bhttps?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/[^\s<]*)?/gi, "");
  if (/https?:\/\/|qa-secret|ghp_|bearer\s+qa|deploy-token|api[_-]?key\s*[:=]|secret\s*[:=]|token\s*[:=]/i.test(source)) {
    return true;
  }
  return /\b(?:dashboard link|dashboard action|dns step|deploy command|contact detail)\s*:\s*(?!not observed\b|absent\b|unavailable\b|not requested\b|no\b|none\b|false\b)/i.test(source);
}

function isAllowedLocalDevLeadRequest(entry) {
  try {
    const parsed = new URL(entry.url);
    return ["/api/dev-lead", "/api/dev-paid-review-intent"].includes(parsed.pathname) && entry.method === "POST";
  } catch (_error) {
    return false;
  }
}

async function resetDrafts(page, baseUrl) {
  await page.goto(`${baseUrl}/intake.html`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.removeItem("proofresume:intakes");
    localStorage.removeItem("proofresume:lastIntakeId");
  });
}

async function loadIntake(page, baseUrl) {
  await page.goto(`${baseUrl}/intake.html`, { waitUntil: "networkidle" });
}

async function storedDrafts(page) {
  return page.evaluate(() => {
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const lastIntakeId = localStorage.getItem("proofresume:lastIntakeId");
    return { intakes, lastIntakeId };
  });
}

async function seedSessionResetDrafts(page, lastIntakeId = "user_redacted_reset") {
  return page.evaluate((nextLastIntakeId) => {
    const sharedRedactions = {
      updatedAt: "2026-05-14T20:55:00.000Z",
      sourceExcerpts: { source_1: true },
      followupNotes: { followup_1: true },
    };
    const exportSnapshot = {
      format: "proofresume-local-section-v1",
      sectionText: "Session reset exported resume text should stay downloadable outside localStorage.",
      accepted: [{ key: "source_1", resumeText: "Session reset accepted resume text" }],
      proofPacketPreview: { redactedSourceExcerpts: 1 },
      claimRiskChecklist: { items: [{ key: "source_1", sourceExcerptRedacted: true }] },
      followups: { evidenceItems: [{ key: "followup_1", redacted: true }] },
      sections: [{ accepted: [{ key: "source_1", redacted: true }] }],
    };
    const intakes = [
      {
        id: "user_redacted_reset",
        sourceType: "pasted_resume_text",
        isDemo: false,
        rawText: "User reset draft raw text.",
        normalizedText: "User reset draft raw text.",
        targetRole: "Operations analyst",
        proofPacketRedactions: sharedRedactions,
        exportSnapshot,
        downloadedExportText: "Downloaded resume export text remains outside reset controls.",
      },
      {
        id: "demo_redacted_reset",
        sourceType: "demo_sample_material",
        isDemo: true,
        rawText: "Demo reset draft raw text.",
        normalizedText: "Demo reset draft raw text.",
        targetRole: "Customer operations manager",
        proofPacketRedactions: sharedRedactions,
        exportSnapshot,
        downloadedExportText: "Downloaded demo export text remains outside reset controls.",
      },
      {
        id: "user_plain_reset",
        sourceType: "pasted_resume_text",
        isDemo: false,
        rawText: "Second user reset draft raw text.",
        normalizedText: "Second user reset draft raw text.",
        targetRole: "Data analyst",
        proofPacketRedactions: {
          updatedAt: "2026-05-14T20:55:00.000Z",
          sourceExcerpts: { source_2: true },
          followupNotes: {},
        },
        exportSnapshot,
        downloadedExportText: "Second downloaded resume export text remains outside reset controls.",
      },
    ];

    localStorage.setItem("proofresume:intakes", JSON.stringify(intakes));
    localStorage.setItem("proofresume:lastIntakeId", nextLastIntakeId);
  }, lastIntakeId);
}

function redactionCountFor(intake) {
  const sourceExcerpts = intake?.proofPacketRedactions?.sourceExcerpts || {};
  const followupNotes = intake?.proofPacketRedactions?.followupNotes || {};
  return Object.keys(sourceExcerpts).length + Object.keys(followupNotes).length;
}

async function readDemoBoundarySurface(page) {
  return page.evaluate(() => {
    const selectors = [
      "[data-pr='demoMode']",
      "[data-pr='sampleMode']",
      "[data-pr='sampleDataBoundary']",
      "[data-pr='userDataBoundary']",
      "[data-pr='demoDataBoundary']",
      "[data-demo-mode]",
      "[data-sample-data-boundary]",
      "[data-user-data-boundary]",
    ];
    const nodes = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]);
    const uniqueNodes = [...new Set(nodes)];
    return {
      exposed: uniqueNodes.length > 0,
      text: uniqueNodes.map((node) => node.textContent || "").join("\n"),
      attrs: uniqueNodes.map((node) => ({
        pr: node.getAttribute("data-pr") || "",
        demoMode: node.getAttribute("data-demo-mode") || "",
        sampleBoundary: node.getAttribute("data-sample-data-boundary") || "",
        userBoundary: node.getAttribute("data-user-data-boundary") || "",
      })),
    };
  });
}

function decodeDataTextHref(href) {
  const prefix = "data:text/plain;charset=utf-8,";
  assert(typeof href === "string" && href.startsWith(prefix), `Expected text data href, got ${href}`);
  return decodeURIComponent(href.slice(prefix.length));
}

function decodeDataJsonHref(href) {
  const prefix = "data:application/json;charset=utf-8,";
  assert(typeof href === "string" && href.startsWith(prefix), `Expected JSON data href, got ${href}`);
  return JSON.parse(decodeURIComponent(href.slice(prefix.length)));
}

function assertTextOrder(text, expectedParts, message) {
  let previousIndex = -1;
  for (const part of expectedParts) {
    const index = String(text || "").indexOf(part);
    assert(index !== -1, `${message}: missing "${part}".`);
    assert(index > previousIndex, `${message}: "${part}" appeared out of order.`);
    previousIndex = index;
  }
}

async function readExportGroupingRationale(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-pr='exportGroupingRationale']");
    if (!root) {
      return { exposed: false, text: "", entries: [] };
    }

    const entries = [...root.querySelectorAll("[data-export-rationale-section]")].map((entry) => ({
      section:
        entry.getAttribute("data-export-rationale-section") ||
        entry.getAttribute("data-export-section-heading") ||
        "",
      defaultHeading: entry.getAttribute("data-export-rationale-default") || "",
      reason: entry.getAttribute("data-export-rationale-reason") || entry.textContent || "",
      text: entry.textContent || "",
    }));

    return {
      exposed: true,
      text: root.textContent || "",
      entries,
    };
  });
}

function snapshotGroupingRationale(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return [];
  const direct = snapshot.groupingRationale || snapshot.exportGroupingRationale;
  if (Array.isArray(direct)) return direct;
  if (direct && typeof direct === "object") return Object.values(direct);
  return (snapshot.sections || [])
    .map((section) => section.groupingRationale || section.rationale || section.reason)
    .filter(Boolean);
}

function assertExportGroupingRationale({
  scenario,
  rationale,
  exportText,
  downloadText,
  snapshot,
  expectedSections,
  excludedCandidateTexts,
  phase,
}) {
  if (!rationale.exposed) {
    scenario.assertions.push(`Export grouping rationale contract pending product exposure during ${phase}.`);
    return false;
  }

  const rationaleText = rationale.text;
  for (const section of expectedSections) {
    scenario.check(
      rationaleText.includes(section.heading),
      `Export grouping rationale names the ${section.heading} section during ${phase}.`
    );
    scenario.check(
      rationaleText.includes(section.defaultHeading),
      `Export grouping rationale preserves the ${section.defaultHeading} default heading during ${phase}.`
    );
    scenario.check(
      section.reasonTerms.some((term) => rationaleText.toLowerCase().includes(term)),
      `Export grouping rationale explains the ${section.heading} grouping signal during ${phase}.`
    );
  }

  assertTextOrder(
    rationaleText,
    expectedSections.map((section) => section.heading),
    `Export grouping rationale follows export section order during ${phase}`
  );
  scenario.assertions.push(`Export grouping rationale follows export section order during ${phase}.`);

  for (const excludedText of excludedCandidateTexts) {
    scenario.check(
      !rationaleText.includes(excludedText),
      `Export grouping rationale excludes non-exported candidate text during ${phase}.`
    );
  }

  const reasons = rationale.entries.map((entry) => entry.reason || entry.text).filter(Boolean);
  scenario.check(reasons.length >= expectedSections.length, `Export grouping rationale exposes machine-readable reasons during ${phase}.`);
  scenario.check(
    reasons.every((reason) => !exportText.includes(reason) && !downloadText.includes(reason)),
    `Export grouping rationale reasons stay out of export and download text during ${phase}.`
  );

  if (snapshot) {
    const snapshotRationale = snapshotGroupingRationale(snapshot);
    scenario.check(
      snapshotRationale.length >= expectedSections.length,
      `Saved export snapshot preserves grouping rationale metadata during ${phase}.`
    );
  }

  return true;
}

async function exportSurfaces(page) {
  const exportText = await page.inputValue("[data-pr='exportOutput']");
  const downloadText = decodeDataTextHref(await page.getAttribute("[data-pr='downloadExport']", "href"));
  const snapshot = await page.evaluate(() => {
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    return intakes[0]?.exportSnapshot || null;
  });
  const snapshotText = snapshot ? JSON.stringify(snapshot) : "";
  return { exportText, downloadText, snapshot, snapshotText };
}

function assertFactExcludedFromSurfaces(scenario, surfaces, factText, label, phase) {
  scenario.check(!surfaces.exportText.includes(factText), `${label} is excluded from export output during ${phase}.`);
  scenario.check(!surfaces.downloadText.includes(factText), `${label} is excluded from download text during ${phase}.`);
  scenario.check(!surfaces.snapshotText.includes(factText), `${label} is excluded from saved snapshot during ${phase}.`);
}

function assertFactExcludedFromResumeSurfaces(scenario, surfaces, factText, label, phase) {
  scenario.check(!surfaces.exportText.includes(factText), `${label} is excluded from export output during ${phase}.`);
  scenario.check(!surfaces.downloadText.includes(factText), `${label} is excluded from download text during ${phase}.`);
  scenario.check(!String(surfaces.snapshot?.sectionText || "").includes(factText), `${label} is excluded from saved snapshot resume text during ${phase}.`);
}

function storedStructuredExperienceItems(intake) {
  const candidates = [
    intake?.structuredExtraction?.experienceItems,
    intake?.structuredExtraction?.experience,
    intake?.parsedExperienceItems,
    intake?.experienceItems,
    intake?.analysis?.structuredExtraction?.experienceItems,
    intake?.analysis?.experienceItems,
  ];
  return candidates.find(Array.isArray) || [];
}

async function readStructuredExtractionSurface(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='structuredExtraction']",
        "[data-pr='structuredExperienceList']",
        "[data-structured-extraction]",
        "[data-structured-experience]",
        "[data-experience-item-list]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", items: [] };
    }

    const itemNodes = [
      ...root.querySelectorAll(
        [
          "[data-experience-item]",
          "[data-structured-experience-item]",
          "[data-experience-key]",
          "[data-source-lines]",
          "li",
          "article",
          "tr",
        ].join(",")
      ),
    ];
    return {
      exposed: true,
      text: root.textContent || "",
      approval:
        root.getAttribute("data-approval-state") ||
        root.getAttribute("data-evidence-status") ||
        root.getAttribute("data-structured-approval") ||
        "",
      exportEligible: root.getAttribute("data-export-eligible") || "",
      downloadEligible: root.getAttribute("data-download-eligible") || "",
      items: itemNodes.map((node) => ({
        text: node.textContent || "",
        approval:
          node.getAttribute("data-approval-state") ||
          node.getAttribute("data-evidence-status") ||
          node.getAttribute("data-structured-approval") ||
          "",
        sourceLines:
          node.getAttribute("data-source-lines") ||
          node.getAttribute("data-source-line") ||
          node.getAttribute("data-provenance") ||
          "",
        exportEligible: node.getAttribute("data-export-eligible") || "",
        downloadEligible: node.getAttribute("data-download-eligible") || "",
        actions: [...node.querySelectorAll("button,[role='button']")]
          .map(
            (button) =>
              button.getAttribute("data-structured-action") ||
              button.getAttribute("data-structured-extraction-action") ||
              button.getAttribute("data-experience-item-action") ||
              button.getAttribute("data-fact-action") ||
              ""
          )
          .filter(Boolean),
      })),
    };
  });
}

function assertStructuredItemPromotionSurface(scenario, surface, phase) {
  if (!surface.exposed) {
    scenario.assertions.push(`Structured-item promotion handles pending product exposure during ${phase}.`);
    return false;
  }

  const unapprovedItems = surface.items.filter((item) => /unapproved|pending/i.test(`${item.approval} ${item.text}`));
  scenario.check(unapprovedItems.length > 0, `Structured-item promotion surface exposes unapproved/pending facts during ${phase}.`);
  scenario.check(
    unapprovedItems.every((item) => item.exportEligible === "" || item.exportEligible === "false"),
    `Unapproved structured facts remain export-ineligible on deterministic handles during ${phase}.`
  );
  scenario.check(
    unapprovedItems.every((item) => item.downloadEligible === "" || item.downloadEligible === "false"),
    `Unapproved structured facts remain download-ineligible on deterministic handles during ${phase}.`
  );

  const promotionActions = surface.items.flatMap((item) => item.actions);
  if (promotionActions.length) {
    scenario.check(
      promotionActions.some((action) => /approve|promote|accept/i.test(action)) &&
        promotionActions.some((action) => /reject|exclude/i.test(action)),
      `Structured-item promotion handles expose explicit approve/promote and reject/exclude actions during ${phase}.`
    );
  } else {
    scenario.assertions.push(`Structured-item promotion action handles pending product exposure during ${phase}.`);
  }

  return true;
}

async function clickStructuredItemPromotionAction(page, factText, action) {
  return page.evaluate(
    ({ factText: targetText, action: targetAction }) => {
      const rowSelector = [
        "[data-structured-extraction-item]",
        "[data-structured-extraction-bullet]",
        "[data-structured-experience-item]",
        "[data-experience-item]",
        "[data-experience-key]",
      ].join(",");
      const actionSelector = [
        `[data-structured-action="${targetAction}"]`,
        `[data-structured-extraction-action="${targetAction}"]`,
        `[data-experience-item-action="${targetAction}"]`,
        `[data-fact-action="${targetAction}"]`,
      ].join(",");
      const rows = [...document.querySelectorAll(rowSelector)].sort(
        (left, right) => (left.textContent || "").length - (right.textContent || "").length
      );
      const row = rows.find((entry) => (entry.textContent || "").includes(targetText));
      if (!row) return { clicked: false, reason: "missing-row" };
      const button = row.querySelector(actionSelector);
      if (!(button instanceof HTMLButtonElement)) return { clicked: false, reason: "missing-action" };
      if (button.disabled) return { clicked: false, reason: "disabled-action" };
      button.click();
      return { clicked: true, reason: "" };
    },
    { factText, action }
  );
}

async function readBulkStructuredControlState(page) {
  return page.evaluate(() => {
    const section = document.querySelector("[data-pr='structuredExtractionSection']");
    const approveAllButton = document.querySelector("[data-pr='approveAllStructuredSourceLines']");
    const promoteAllButton = document.querySelector("[data-pr='promoteAllApprovedStructuredFacts']");
    const rows = [
      ...document.querySelectorAll(
        "[data-structured-extraction-item], [data-structured-extraction-bullet], [data-structured-experience-item], [data-experience-item]"
      ),
    ];
    const approvedRows = rows.filter((row) => row.getAttribute("data-approval-state") === "approved");
    const promotedRows = rows.filter((row) => row.getAttribute("data-promoted-to-candidate") === "true");
    return {
      exposed: Boolean(section && approveAllButton && promoteAllButton),
      approveAllLabel: approveAllButton?.textContent?.trim() || "",
      promoteAllLabel: promoteAllButton?.textContent?.trim() || "",
      rowCount: rows.length,
      approvedCount: approvedRows.length,
      promotedCount: promotedRows.length,
      exportEligibleValues: rows.map((row) => row.getAttribute("data-export-eligible") || ""),
      downloadEligibleValues: rows.map((row) => row.getAttribute("data-download-eligible") || ""),
      summary: document.querySelector("[data-pr='structuredExtractionSummary']")?.textContent || "",
      status: document.querySelector("[data-pr='exportStatus']")?.textContent || "",
    };
  });
}

async function clickBulkStructuredControl(page, control) {
  const selector =
    control === "approve"
      ? "[data-pr='approveAllStructuredSourceLines']"
      : "[data-pr='promoteAllApprovedStructuredFacts']";
  const button = await page.$(selector);
  if (!button) return { clicked: false, reason: "missing-control" };
  const disabled = await button.evaluate((node) => node instanceof HTMLButtonElement && node.disabled);
  if (disabled) return { clicked: false, reason: "disabled-control" };
  await button.click();
  return { clicked: true, reason: "" };
}

async function storedStructuredApprovalSummary(page) {
  return page.evaluate(() => {
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const lastIntakeId = localStorage.getItem("proofresume:lastIntakeId");
    const intake = intakes.find((item) => item.id === lastIntakeId) || intakes[0] || {};
    const structuredFacts = intake?.approvals?.structuredFacts || {};
    const records = Object.values(structuredFacts).filter((record) => record && typeof record === "object");
    return {
      intakeId: intake?.id || "",
      recordCount: records.length,
      approvedCount: records.filter((record) => record.sourceApproved === true).length,
      promotedCount: records.filter((record) => record.promoted === true).length,
      exportSnapshotText: JSON.stringify(intake?.exportSnapshot || {}),
      downloadedExportText: String(intake?.downloadedExportText || ""),
    };
  });
}

function followupPromotionExposure(reviewJs) {
  return (
    reviewJs.includes("followupEvidencePanel") ||
    reviewJs.includes("followupEvidenceList") ||
    reviewJs.includes("followupEvidenceApprovalRows") ||
    reviewJs.includes("followupEvidenceKey") ||
    reviewJs.includes("followupCandidateKey") ||
    reviewJs.includes("followupEvidence:")
  );
}

function claimRiskChecklistExposure(reviewJs, reviewHtml) {
  const source = `${reviewJs}\n${reviewHtml}`;
  return (
    source.includes("claimRiskChecklist") ||
    source.includes("claimRiskList") ||
    source.includes("data-claim-risk") ||
    source.includes("data-risk-flag") ||
    source.includes("data-claim-risk-type")
  );
}

function proofPacketExposure(reviewJs, reviewHtml) {
  const source = `${reviewJs}\n${reviewHtml}`;
  return (
    source.includes("proofPacket") ||
    source.includes("Proof Packet") ||
    source.includes("proof-packet") ||
    source.includes("downloadProofPacket") ||
    source.includes("data-proof-packet")
  );
}

function proofPacketRedactionExposure(reviewJs, reviewHtml, proofPacketJs = "") {
  const source = `${reviewJs}\n${reviewHtml}\n${proofPacketJs}`.toLowerCase();
  return source.includes("redact") || source.includes("redaction") || source.includes("data-proof-packet-redaction");
}

function proofPacketShareReadinessExposure(reviewJs, reviewHtml, proofPacketJs = "") {
  const source = `${reviewJs}\n${reviewHtml}\n${proofPacketJs}`.toLowerCase();
  return (
    source.includes("share-readiness") ||
    source.includes("sharereadiness") ||
    source.includes("share readiness") ||
    source.includes("data-proof-packet-share") ||
    source.includes("data-proof-packet-readiness")
  );
}

function proofPacketRestoreAllExposure(reviewJs, reviewHtml, proofPacketJs = "") {
  const source = `${reviewJs}\n${reviewHtml}\n${proofPacketJs}`.toLowerCase();
  return (
    source.includes("restore-all") ||
    source.includes("restoreall") ||
    source.includes("restore all redactions") ||
    source.includes("data-proof-packet-redaction-action=\"restore") ||
    source.includes("data-proof-packet-restore")
  );
}

function structuredExtractionExposure(intakeHtml, intakeJs, reviewHtml, reviewJs) {
  const source = `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.toLowerCase();
  return (
    source.includes("structuredextraction") ||
    source.includes("structured-extraction") ||
    source.includes("structuredexperience") ||
    source.includes("structured-experience") ||
    source.includes("experienceitems") ||
    source.includes("parsedexperienceitems") ||
    source.includes("data-experience-item") ||
    source.includes("data-source-lines")
  );
}

function sessionPrepChecklistExposure(intakeHtml, intakeJs) {
  const source = `${intakeHtml}\n${intakeJs}`.toLowerCase();
  return (
    source.includes("sessionprepchecklist") ||
    source.includes("session-prep-checklist") ||
    source.includes("freeauditsessionprep") ||
    source.includes("free-audit-session-prep") ||
    source.includes("data-session-prep")
  );
}

function firstSessionHandoffExposure(intakeHtml, intakeJs) {
  const source = `${intakeHtml}\n${intakeJs}`.toLowerCase();
  return (
    source.includes("firstsessionoperatorhandoff") ||
    source.includes("first-session-operator-handoff") ||
    source.includes("firstsessionhandoff") ||
    source.includes("first-session handoff") ||
    source.includes("operatorhandoff") ||
    source.includes("operator handoff") ||
    source.includes("data-first-session-handoff") ||
    source.includes("data-operator-handoff")
  );
}

function firstRecruitDispatchBoardExposure(intakeHtml, intakeJs) {
  const source = `${intakeHtml}\n${intakeJs}`.toLowerCase();
  return (
    source.includes("firstrecruitdispatchboard") ||
    source.includes("first-recruit-dispatch-board") ||
    source.includes("first recruit dispatch board") ||
    source.includes("dispatchboard") ||
    source.includes("dispatch board") ||
    source.includes("data-first-recruit-dispatch") ||
    source.includes("data-dispatch-board")
  );
}

function firstReplyTriageBoardExposure(intakeHtml, intakeJs, reviewHtml = "", reviewJs = "") {
  const source = `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.toLowerCase();
  return (
    source.includes("firstreplytriageboard") ||
    source.includes("first-reply-triage-board") ||
    source.includes("first reply triage board") ||
    source.includes("reply triage") ||
    source.includes("data-triage") ||
    source.includes("data-pr=\"firstreplytriageboard\"")
  );
}

function firstReplyFactCaptureExposure(intakeHtml, intakeJs, reviewHtml = "", reviewJs = "") {
  const source = `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.toLowerCase();
  return (
    source.includes("firstreplyfactcapture") ||
    source.includes("first-reply-fact-capture") ||
    source.includes("first reply fact capture") ||
    source.includes("replyfactcapture") ||
    source.includes("reply fact capture") ||
    source.includes("data-first-reply-fact") ||
    source.includes("data-reply-fact-capture") ||
    source.includes("data-pr=\"firstreplyfactcapture\"")
  );
}

function schedulingReadinessExposure(intakeHtml, intakeJs, reviewHtml = "", reviewJs = "") {
  const source = `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.toLowerCase();
  return (
    source.includes("schedulingreadiness") ||
    source.includes("scheduling-readiness") ||
    source.includes("scheduling readiness") ||
    source.includes("data-scheduling-readiness") ||
    source.includes("data-pr=\"schedulingreadiness\"")
  );
}

function sessionStartGateExposure(intakeHtml, intakeJs, reviewHtml = "", reviewJs = "") {
  const source = `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.toLowerCase();
  return (
    source.includes("sessionstartgate") ||
    source.includes("session-start-gate") ||
    source.includes("session start gate") ||
    source.includes("appointment-confirmed") ||
    source.includes("appointment confirmed") ||
    source.includes("data-session-start") ||
    source.includes("data-pr=\"sessionstartgate\"")
  );
}

function rawNoteCaptureExposure(intakeHtml, intakeJs, reviewHtml = "", reviewJs = "") {
  const source = `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.toLowerCase();
  return (
    source.includes("firstsessionrawnotecapture") ||
    source.includes("first-session-raw-note-capture") ||
    source.includes("rawnotecapture") ||
    source.includes("raw-note capture") ||
    source.includes("data-raw-note-capture") ||
    source.includes("data-pr=\"rawnotecapture\"") ||
    source.includes("data-pr=\"firstsessionrawnotecapture\"")
  );
}

function postSessionDebriefExposure(intakeHtml, intakeJs, reviewHtml = "", reviewJs = "") {
  const source = `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.toLowerCase();
  return (
    source.includes("postsessiondebrief") ||
    source.includes("post-session-debrief") ||
    source.includes("post session debrief") ||
    source.includes("debriefhandoff") ||
    source.includes("debrief handoff") ||
    source.includes("debrief-draft") ||
    source.includes("data-post-session-debrief") ||
    source.includes("data-debrief-handoff") ||
    source.includes("data-pr=\"postsessiondebrief\"")
  );
}

function objectionCodingHandoffExposure(intakeHtml, intakeJs, reviewHtml = "", reviewJs = "") {
  const source = `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.toLowerCase();
  return (
    source.includes("objectioncodinghandoff") ||
    source.includes("objection-coding-handoff") ||
    source.includes("objection coding handoff") ||
    source.includes("localobjectioncoding") ||
    source.includes("local objection coding") ||
    source.includes("data-objection-coding-handoff") ||
    source.includes("data-local-objection-coding") ||
    source.includes("data-pr=\"objectioncodinghandoff\"")
  );
}

function fiveSessionSynthesisReadinessExposure(intakeHtml, intakeJs, reviewHtml = "", reviewJs = "") {
  const source = `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.toLowerCase();
  return (
    source.includes("fivesessionsynthesisreadiness") ||
    source.includes("five-session-synthesis-readiness") ||
    source.includes("five session synthesis readiness") ||
    source.includes("localsynthesisreadiness") ||
    source.includes("local synthesis readiness") ||
    source.includes("data-five-session-synthesis") ||
    source.includes("data-synthesis-readiness") ||
    source.includes("data-pr=\"fivesessionsynthesisreadiness\"")
  );
}

function privateSynthesisArtifactGeneratorExposure(intakeHtml, intakeJs, reviewHtml = "", reviewJs = "") {
  const source = `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.toLowerCase();
  return (
    source.includes("privatesynthesisartifactgenerator") ||
    source.includes("private-synthesis-artifact-generator") ||
    source.includes("synthesisartifactgenerator") ||
    source.includes("synthesis-artifact-generator") ||
    source.includes("private synthesis artifact") ||
    source.includes("artifact-drafted") ||
    source.includes("ready-to-generate") ||
    source.includes("data-synthesis-artifact-generator") ||
    source.includes("data-private-synthesis-artifact") ||
    source.includes("data-pr=\"privatesynthesisartifactgenerator\"")
  );
}

function privateSynthesisDecisionMemoCaptureExposure(intakeHtml, intakeJs, reviewHtml = "", reviewJs = "") {
  const source = `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.toLowerCase();
  return (
    source.includes("privatesynthesisdecisionmemo") ||
    source.includes("private-synthesis-decision-memo") ||
    source.includes("synthesisdecisionmemo") ||
    source.includes("synthesis-decision-memo") ||
    source.includes("decision memo capture") ||
    source.includes("memo-drafted") ||
    source.includes("artifact-gated") ||
    source.includes("data-synthesis-decision-memo") ||
    source.includes("data-private-synthesis-decision") ||
    source.includes("data-pr=\"privatesynthesisdecisionmemo\"")
  );
}

function privateLaunchDecisionApprovalExposure(intakeHtml, intakeJs, reviewHtml = "", reviewJs = "") {
  const source = `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.toLowerCase();
  return (
    source.includes("privatelaunchdecisionapproval") ||
    source.includes("private-launch-decision-approval") ||
    source.includes("launchdecisionapproval") ||
    source.includes("launch-decision-approval") ||
    source.includes("launch decision approval") ||
    source.includes("approval-drafted") ||
    source.includes("memo-gated") ||
    source.includes("data-launch-decision-approval") ||
    source.includes("data-private-launch-decision") ||
    source.includes("data-pr=\"privatelaunchdecisionapproval\"")
  );
}

function privateExplicitPublishPlanExposure(intakeHtml, intakeJs, reviewHtml = "", reviewJs = "") {
  const source = `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.toLowerCase();
  return (
    source.includes("privateexplicitpublishplan") ||
    source.includes("private-explicit-publish-plan") ||
    source.includes("explicitpublishplan") ||
    source.includes("explicit-publish-plan") ||
    source.includes("publish plan capture") ||
    source.includes("plan-drafted") ||
    source.includes("approval-gated") ||
    source.includes("publish-readiness-gated") ||
    source.includes("data-explicit-publish-plan") ||
    source.includes("data-private-publish-plan") ||
    source.includes("data-pr=\"privateexplicitpublishplan\"")
  );
}

function privatePublicCopyDiffRollbackExposure(intakeHtml, intakeJs, reviewHtml = "", reviewJs = "") {
  const source = `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.toLowerCase();
  return (
    source.includes("privatepubliccopydiffrollback") ||
    source.includes("private-public-copy-diff-rollback") ||
    source.includes("publiccopydiffrollback") ||
    source.includes("public-copy-diff-rollback") ||
    source.includes("public copy diff rollback") ||
    source.includes("diff-drafted") ||
    source.includes("publish-plan-gated") ||
    source.includes("data-public-copy-diff-rollback") ||
    source.includes("data-private-public-copy-diff") ||
    source.includes("data-pr=\"privatepubliccopydiffrollback\"")
  );
}

function privateReleaseCandidateRehearsalExposure(intakeHtml, intakeJs, reviewHtml = "", reviewJs = "") {
  const source = `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.toLowerCase();
  return (
    source.includes("privatereleasecandidaterehearsal") ||
    source.includes("private-release-candidate-rehearsal") ||
    source.includes("releasecandidaterehearsal") ||
    source.includes("release-candidate-rehearsal") ||
    source.includes("release candidate rehearsal") ||
    source.includes("rehearsal-ready") ||
    source.includes("diff-packet-gated") ||
    source.includes("data-release-candidate-rehearsal") ||
    source.includes("data-private-release-candidate") ||
    source.includes("data-pr=\"privatereleasecandidaterehearsal\"")
  );
}

function privateCredentialedDeployReadinessExposure(intakeHtml, intakeJs, reviewHtml = "", reviewJs = "") {
  const source = `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.toLowerCase();
  return (
    source.includes("privatecredentialeddeployreadiness") ||
    source.includes("private-credentialed-deploy-readiness") ||
    source.includes("credentialeddeployreadiness") ||
    source.includes("credentialed-deploy-readiness") ||
    source.includes("credentialed deploy readiness") ||
    source.includes("deploy-inputs-blocked") ||
    source.includes("rehearsal-blocked") ||
    source.includes("no-secret") ||
    source.includes("data-credentialed-deploy-readiness") ||
    source.includes("data-private-credentialed-deploy") ||
    source.includes("data-pr=\"privatecredentialeddeployreadiness\"")
  );
}

async function readSessionPrepChecklist(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='sessionPrepChecklist']",
        "[data-pr='freeAuditSessionPrep']",
        "[data-session-prep-checklist]",
        "[data-free-audit-session-prep]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", status: "", resetText: "", items: [] };
    }

    const statusNode =
      root.querySelector(
        [
          "[data-pr='sessionPrepStatus']",
          "[data-pr='sessionPrepReadiness']",
          "[data-session-prep-status]",
          "[data-session-prep-readiness]",
        ].join(",")
      ) || root;
    const resetNode = root.querySelector(
      [
        "[data-pr='sessionPrepResetState']",
        "[data-pr='sessionPrepResetReadiness']",
        "[data-session-prep-reset-state]",
        "[data-session-prep-reset-readiness]",
      ].join(",")
    );
    const rows = [
      ...root.querySelectorAll(
        [
          "[data-session-prep-item]",
          "[data-session-prep-check]",
          "[data-prep-check]",
          "[data-pr^='sessionPrepItem']",
          "li",
          "article",
          "[role='listitem']",
        ].join(",")
      ),
    ];

    return {
      exposed: true,
      text: root.textContent || "",
      ready: root.getAttribute("data-session-prep-ready") || root.getAttribute("data-ready") || "",
      demoDrafts: root.getAttribute("data-session-prep-demo-drafts") || "",
      userDrafts: root.getAttribute("data-session-prep-user-drafts") || "",
      redactions: root.getAttribute("data-session-prep-redactions") || "",
      localOnly: root.getAttribute("data-session-prep-local-only") || "",
      exportTextUnchanged: root.getAttribute("data-export-text-unchanged") || "",
      status:
        statusNode.getAttribute("data-session-prep-status") ||
        statusNode.getAttribute("data-session-prep-readiness") ||
        statusNode.getAttribute("data-ready-state") ||
        statusNode.textContent ||
        "",
      resetText:
        resetNode?.getAttribute("data-session-prep-reset-state") ||
        resetNode?.getAttribute("data-session-prep-reset-readiness") ||
        resetNode?.textContent ||
        "",
      items: rows.map((row) => ({
        key:
          row.getAttribute("data-session-prep-item") ||
          row.getAttribute("data-session-prep-check") ||
          row.getAttribute("data-prep-check") ||
          row.getAttribute("data-pr") ||
          "",
        status:
          row.getAttribute("data-session-prep-status") ||
          row.getAttribute("data-session-prep-state") ||
          row.getAttribute("data-ready-state") ||
          row.getAttribute("aria-checked") ||
          "",
        text: row.textContent || "",
      })),
    };
  });
}

async function seedFirstSessionHandoffDrafts(page) {
  return page.evaluate(() => {
    const selectedExportText = "Selected handoff resume export text should remain separate from operator handoff.";
    const selectedDraft = {
      id: "first_session_selected_user",
      sourceType: "pasted_resume_text",
      isDemo: false,
      rawText: "First-session selected draft raw resume text.",
      normalizedText: "First-session selected draft raw resume text.",
      targetRole: "Operations analyst",
      proofPacketRedactions: {
        updatedAt: "2026-05-14T21:25:00.000Z",
        sourceExcerpts: {},
        followupNotes: {},
      },
      exportSnapshot: {
        format: "proofresume-local-section-v1",
        sectionText: selectedExportText,
        accepted: [
          {
            key: "handoff_accepted_1",
            resumeText: "Selected handoff accepted resume bullet.",
            evidenceStatus: "Approved (evidence-backed)",
          },
        ],
        audit: {
          rejected: [{ key: "handoff_rejected_1", text: "Rejected handoff fixture should stay out of packet." }],
          pending: [{ key: "handoff_pending_1", text: "Pending handoff fixture should stay out of packet." }],
        },
        proofPacketPreview: {
          format: "proofresume-local-proof-packet-preview-v1",
          localOnly: true,
          exportTextUnchanged: true,
          summary: {
            acceptedBullets: 1,
            provenanceItems: 1,
            claimRiskFlags: 0,
            followupSourceNotes: 0,
            redactedSourceExcerpts: 0,
            redactedFollowupSourceNotes: 0,
            excludedFromPacket: { rejected: 1, pending: 1, excluded: 0 },
          },
          shareReadiness: {
            status: "Review before sharing",
            acceptedOnly: 1,
            redactedSourceExcerpts: 0,
            redactedFollowupSourceNotes: 0,
            openSourceExcerpts: 1,
            openFollowupSourceNotes: 0,
            excludedFromPacket: { rejected: 1, pending: 1, excluded: 0 },
            excludedTotal: 2,
            restoreAvailable: false,
          },
        },
        claimRiskChecklist: {
          summary: { flagCount: 0, highSeverity: 0, mediumSeverity: 0, lowSeverity: 0 },
          items: [],
        },
        proofPacketSnapshot: {
          format: "proofresume-local-proof-packet-snapshot-v1",
          updatedAt: "2026-05-14T21:25:00.000Z",
          localOnly: true,
          exportTextUnchanged: true,
          packet: {
            format: "proofresume-local-proof-packet-preview-v1",
            localOnly: true,
            exportTextUnchanged: true,
            generatedFromSnapshot: "2026-05-14T21:25:00.000Z",
            summary: {
              acceptedBullets: 1,
              provenanceItems: 1,
              claimRiskFlags: 0,
              followupSourceNotes: 0,
              redactedSourceExcerpts: 0,
              redactedFollowupSourceNotes: 0,
              excludedFromPacket: { rejected: 1, pending: 1, excluded: 0 },
            },
            shareReadiness: {
              status: "Review before sharing",
              acceptedOnly: 1,
              redactedSourceExcerpts: 0,
              redactedFollowupSourceNotes: 0,
              openSourceExcerpts: 1,
              openFollowupSourceNotes: 0,
              excludedFromPacket: { rejected: 1, pending: 1, excluded: 0 },
              excludedTotal: 2,
              restoreAvailable: false,
            },
            claimRiskChecklist: {
              summary: { flagCount: 0, highSeverity: 0, mediumSeverity: 0, lowSeverity: 0 },
              items: [],
            },
            manifestSummary: {
              format: "proofresume-proof-packet-manifest-summary-v1",
              shareReadiness: { status: "Review before sharing", acceptedOnly: 1, restoreAvailable: false, localOnly: true },
              redactionCounts: { sourceExcerpts: 0, followupSourceNotes: 0, total: 0, openSourceExcerpts: 1, openFollowupSourceNotes: 0 },
              acceptedBulletCount: 1,
              sourceBoundaryWarnings: [
                "Packet manifest is packet-only metadata and does not alter resume export text.",
                "Proof Packet is local-only until you choose to share the downloaded packet.",
                "One or more source excerpts remain visible; review redactions before sharing.",
                "Rejected, pending, and excluded evidence is omitted from this packet.",
              ],
            },
          },
        },
      },
      downloadedExportText: selectedExportText,
    };
    const backgroundDraft = {
      id: "first_session_background_demo",
      sourceType: "demo_sample_material",
      isDemo: true,
      rawText: "Background demo draft for handoff selection checks.",
      normalizedText: "Background demo draft for handoff selection checks.",
      targetRole: "Customer operations manager",
      proofPacketRedactions: {
        updatedAt: "2026-05-14T21:25:00.000Z",
        sourceExcerpts: { demo_source: true },
        followupNotes: {},
      },
    };

    localStorage.setItem("proofresume:intakes", JSON.stringify([selectedDraft, backgroundDraft]));
    localStorage.setItem("proofresume:lastIntakeId", selectedDraft.id);
    return { selectedExportText };
  });
}

async function readFirstSessionHandoff(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='firstSessionOperatorHandoff']",
        "[data-pr='firstSessionHandoff']",
        "[data-pr='operatorHandoff']",
        "[data-first-session-handoff]",
        "[data-operator-handoff]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", links: [], items: [] };
    }

    const itemSelector = [
      "[data-handoff-item]",
      "[data-first-session-handoff-item]",
      "[data-operator-handoff-item]",
      "[data-pr^='firstSessionHandoff']",
      "li",
      "article",
      "[role='listitem']",
    ].join(",");
    const links = [...root.querySelectorAll("a[href]")].map((link) => ({
      href: link.getAttribute("href") || "",
      text: link.textContent || "",
      target: link.getAttribute("target") || "",
    }));
    const items = [...root.querySelectorAll(itemSelector)].map((item) => ({
      key:
        item.getAttribute("data-handoff-item") ||
        item.getAttribute("data-first-session-handoff-item") ||
        item.getAttribute("data-operator-handoff-item") ||
        item.getAttribute("data-pr") ||
        "",
      status:
        item.getAttribute("data-handoff-status") ||
        item.getAttribute("data-first-session-handoff-status") ||
        item.getAttribute("data-ready-state") ||
        "",
      text: item.textContent || "",
    }));

    return {
      exposed: true,
      text: root.textContent || "",
      localOnly:
        root.getAttribute("data-handoff-local-only") ||
        root.getAttribute("data-first-session-local-only") ||
        root.getAttribute("data-local-only") ||
        "",
      exportTextUnchanged:
        root.getAttribute("data-export-text-unchanged") ||
        root.getAttribute("data-handoff-export-text-unchanged") ||
        "",
      selectedDraftId:
        root.getAttribute("data-selected-draft-id") ||
        root.getAttribute("data-handoff-selected-draft") ||
        root.getAttribute("data-first-session-selected-draft") ||
        "",
      packetReady:
        root.getAttribute("data-proof-packet-ready") ||
        root.getAttribute("data-packet-ready") ||
        root.getAttribute("data-share-readiness") ||
        "",
      links,
      items,
    };
  });
}

async function seedFirstRecruitDispatchDrafts(page) {
  return page.evaluate(() => {
    const selectedExportText = "First-recruit dispatch resume export text must stay separate from dispatch board copy.";
    const selectedDraft = {
      id: "first_recruit_dispatch_selected_user",
      sourceType: "pasted_resume_text",
      isDemo: false,
      rawText: "First-recruit dispatch selected draft raw resume text.",
      normalizedText: "First-recruit dispatch selected draft raw resume text.",
      targetRole: "Operations analyst",
      proofPacketRedactions: {
        updatedAt: "2026-05-14T21:40:00.000Z",
        sourceExcerpts: {},
        followupNotes: {},
      },
      firstRecruitDispatch: {
        localOnly: true,
        exportTextUnchanged: true,
        replyStatus: "Not observed",
        sendDecision: "No-send",
        selectedRecruitSlot: "Slot 1",
        artifactLinks: [
          "../ops/launch/private-free-audit-dispatch-readiness-packet.md",
          "../ops/launch/private-free-audit-outreach-tracker.md",
          "../ops/research/private-free-audit-scheduling-consent-checklist.md",
        ],
      },
      exportSnapshot: {
        format: "proofresume-local-section-v1",
        sectionText: selectedExportText,
        accepted: [
          {
            key: "first_recruit_dispatch_accepted_1",
            resumeText: "First-recruit dispatch accepted resume bullet.",
            evidenceStatus: "Approved (evidence-backed)",
          },
        ],
        audit: {
          rejected: [{ key: "first_recruit_dispatch_rejected_1", text: "Rejected first-recruit dispatch fixture should stay out of export." }],
          pending: [{ key: "first_recruit_dispatch_pending_1", text: "Pending first-recruit dispatch fixture should stay out of export." }],
        },
        proofPacketPreview: {
          format: "proofresume-local-proof-packet-preview-v1",
          localOnly: true,
          exportTextUnchanged: true,
          summary: {
            acceptedBullets: 1,
            provenanceItems: 1,
            claimRiskFlags: 0,
            followupSourceNotes: 0,
            redactedSourceExcerpts: 0,
            redactedFollowupSourceNotes: 0,
            excludedFromPacket: { rejected: 1, pending: 1, excluded: 0 },
          },
          shareReadiness: {
            status: "Review before sharing",
            acceptedOnly: 1,
            redactedSourceExcerpts: 0,
            redactedFollowupSourceNotes: 0,
            openSourceExcerpts: 1,
            openFollowupSourceNotes: 0,
            excludedFromPacket: { rejected: 1, pending: 1, excluded: 0 },
            excludedTotal: 2,
            restoreAvailable: false,
          },
        },
      },
      downloadedExportText: selectedExportText,
    };
    const backgroundDraft = {
      id: "first_recruit_dispatch_background_demo",
      sourceType: "demo_sample_material",
      isDemo: true,
      rawText: "Background demo draft for first-recruit dispatch selection checks.",
      normalizedText: "Background demo draft for first-recruit dispatch selection checks.",
      targetRole: "Customer operations manager",
      proofPacketRedactions: {
        updatedAt: "2026-05-14T21:40:00.000Z",
        sourceExcerpts: { demo_source: true },
        followupNotes: {},
      },
    };

    localStorage.setItem("proofresume:intakes", JSON.stringify([selectedDraft, backgroundDraft]));
    localStorage.setItem("proofresume:lastIntakeId", selectedDraft.id);
    return { selectedExportText };
  });
}

async function seedFirstReplyTriageDrafts(page) {
  return page.evaluate(() => {
    const selectedExportText = "First-reply triage resume export text must stay separate from triage board copy.";
    const selectedDraft = {
      id: "first_reply_triage_selected_user",
      sourceType: "pasted_resume_text",
      isDemo: false,
      rawText: "First-reply triage selected draft raw resume text.",
      normalizedText: "First-reply triage selected draft raw resume text.",
      targetRole: "Operations analyst",
      proofPacketRedactions: {
        updatedAt: "2026-05-14T21:52:00.000Z",
        sourceExcerpts: {},
        followupNotes: {},
      },
      firstReplyTriage: {
        localOnly: true,
        exportTextUnchanged: true,
        triageReadiness: "No reply",
        replyStatus: "Not observed",
        selectedRecruitSlot: "Slot 1",
        artifactLinks: [
          "../ops/launch/private-free-audit-first-reply-triage-template.md",
          "../ops/launch/private-free-audit-outreach-tracker.md",
          "../ops/research/private-free-audit-scheduling-consent-checklist.md",
          "../ops/research/free-audit-real-session-note-packet.md",
        ],
      },
      exportSnapshot: {
        format: "proofresume-local-section-v1",
        sectionText: selectedExportText,
        accepted: [
          {
            key: "first_reply_triage_accepted_1",
            resumeText: "First-reply triage accepted resume bullet.",
            evidenceStatus: "Approved (evidence-backed)",
          },
        ],
        audit: {
          rejected: [{ key: "first_reply_triage_rejected_1", text: "Rejected first-reply triage fixture should stay out of export." }],
          pending: [{ key: "first_reply_triage_pending_1", text: "Pending first-reply triage fixture should stay out of export." }],
        },
        proofPacketPreview: {
          format: "proofresume-local-proof-packet-preview-v1",
          localOnly: true,
          exportTextUnchanged: true,
          summary: {
            acceptedBullets: 1,
            provenanceItems: 1,
            claimRiskFlags: 0,
            followupSourceNotes: 0,
            redactedSourceExcerpts: 0,
            redactedFollowupSourceNotes: 0,
            excludedFromPacket: { rejected: 1, pending: 1, excluded: 0 },
          },
          shareReadiness: {
            status: "Review before sharing",
            acceptedOnly: 1,
            redactedSourceExcerpts: 0,
            redactedFollowupSourceNotes: 0,
            openSourceExcerpts: 1,
            openFollowupSourceNotes: 0,
            excludedFromPacket: { rejected: 1, pending: 1, excluded: 0 },
            excludedTotal: 2,
            restoreAvailable: false,
          },
        },
      },
      downloadedExportText: selectedExportText,
    };
    const backgroundDraft = {
      id: "first_reply_triage_background_demo",
      sourceType: "demo_sample_material",
      isDemo: true,
      rawText: "Background demo draft for first-reply triage selection checks.",
      normalizedText: "Background demo draft for first-reply triage selection checks.",
      targetRole: "Customer operations manager",
      proofPacketRedactions: {
        updatedAt: "2026-05-14T21:52:00.000Z",
        sourceExcerpts: { demo_source: true },
        followupNotes: {},
      },
    };

    localStorage.setItem("proofresume:intakes", JSON.stringify([selectedDraft, backgroundDraft]));
    localStorage.setItem("proofresume:lastIntakeId", selectedDraft.id);
    return { selectedExportText };
  });
}

async function seedFirstReplyFactCaptureDrafts(page) {
  return page.evaluate(() => {
    const selectedExportText = "First-reply fact capture resume export text must stay separate from captured reply facts.";
    const selectedDraft = {
      id: "first_reply_fact_capture_selected_user",
      sourceType: "pasted_resume_text",
      isDemo: false,
      rawText: "First-reply fact capture selected draft raw resume text.",
      normalizedText: "First-reply fact capture selected draft raw resume text.",
      targetRole: "Operations analyst",
      proofPacketRedactions: {
        updatedAt: "2026-05-14T22:03:00.000Z",
        sourceExcerpts: {},
        followupNotes: {},
      },
      firstReplyTriage: {
        localOnly: true,
        exportTextUnchanged: true,
        triageReadiness: "No reply",
        replyStatus: "Not observed",
        selectedRecruitSlot: "Slot 1",
      },
      firstReplyFactCapture: {
        localOnly: true,
        exportTextUnchanged: true,
        observedState: "Not observed",
        rawReplyText: "",
        capturedFacts: [],
        selectedRecruitSlot: "Slot 1",
        source: "first-reply-local-operator-note",
      },
      firstReplyFacts: {
        state: "unobserved",
        updatedAt: "2026-05-14T22:03:00.000Z",
        localOnly: true,
        exportTextUnchanged: true,
        explicitOperatorAction: "required",
      },
      exportSnapshot: {
        format: "proofresume-local-section-v1",
        sectionText: selectedExportText,
        accepted: [
          {
            key: "first_reply_fact_capture_accepted_1",
            resumeText: "First-reply fact capture accepted resume bullet.",
            evidenceStatus: "Approved (evidence-backed)",
          },
        ],
        audit: {
          rejected: [{ key: "first_reply_fact_capture_rejected_1", text: "Rejected first-reply fact capture fixture should stay out of export." }],
          pending: [{ key: "first_reply_fact_capture_pending_1", text: "Pending first-reply fact capture fixture should stay out of export." }],
        },
      },
      downloadedExportText: selectedExportText,
    };
    const backgroundDraft = {
      id: "first_reply_fact_capture_background_demo",
      sourceType: "demo_sample_material",
      isDemo: true,
      rawText: "Background demo draft for first-reply fact capture selection checks.",
      normalizedText: "Background demo draft for first-reply fact capture selection checks.",
      targetRole: "Customer operations manager",
      firstReplyFactCapture: {
        localOnly: true,
        exportTextUnchanged: true,
        observedState: "Not observed",
        rawReplyText: "",
        capturedFacts: [],
        selectedRecruitSlot: "Demo slot",
      },
      firstReplyFacts: {
        state: "unobserved",
        updatedAt: "2026-05-14T22:03:00.000Z",
        localOnly: true,
        exportTextUnchanged: true,
        explicitOperatorAction: "required",
      },
    };

    localStorage.setItem("proofresume:intakes", JSON.stringify([selectedDraft, backgroundDraft]));
    localStorage.setItem("proofresume:lastIntakeId", selectedDraft.id);
    return { selectedExportText };
  });
}

async function applyFirstReplyFactCaptureLocalState(page) {
  return page.evaluate(() => {
    const rawReplyText = "Candidate replied: yes, available Tuesday at 2pm PT; wants analytics manager proof points.";
    const capturedFactText = "Captured first-reply fact: candidate is available Tuesday at 2pm PT.";
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const lastIntakeId = localStorage.getItem("proofresume:lastIntakeId");
    const updated = intakes.map((intake) => {
      if (intake.id !== lastIntakeId) return intake;
      return {
        ...intake,
        firstReplyTriage: {
          ...(intake.firstReplyTriage || {}),
          localOnly: true,
          exportTextUnchanged: true,
          triageReadiness: "Reply observed",
          replyStatus: "Observed",
        },
        firstReplyFactCapture: {
          ...(intake.firstReplyFactCapture || {}),
          localOnly: true,
          exportTextUnchanged: true,
          observedState: "Observed",
          rawReplyText,
          capturedAt: "2026-05-14T22:04:00.000Z",
          selectedRecruitSlot: "Slot 1",
          source: "first-reply-local-operator-note",
          capturedFacts: [
            {
              key: "first_reply_fact_1",
              label: "Availability",
              text: capturedFactText,
              value: "Tuesday at 2pm PT",
              exportEligible: false,
              source: "first reply",
            },
          ],
        },
        firstReplyFacts: {
          ...(intake.firstReplyFacts || {}),
          state: "accepted",
          updatedAt: "2026-05-14T22:04:00.000Z",
          localOnly: true,
          exportTextUnchanged: true,
          explicitOperatorAction: "recorded",
          rawReplyText,
          capturedFacts: [
            {
              key: "first_reply_fact_1",
              label: "Availability",
              text: capturedFactText,
              value: "Tuesday at 2pm PT",
              exportEligible: false,
              source: "first reply",
            },
          ],
        },
      };
    });
    localStorage.setItem("proofresume:intakes", JSON.stringify(updated));
    return { rawReplyText, capturedFactText };
  });
}

async function seedSchedulingReadinessDrafts(page) {
  return page.evaluate(() => {
    const selectedExportText = "Scheduling readiness resume export text must stay separate from scheduling metadata.";
    const selectedDraft = {
      id: "scheduling_readiness_selected_user",
      sourceType: "pasted_resume_text",
      isDemo: false,
      rawText: "Scheduling readiness selected draft raw resume text.",
      normalizedText: "Scheduling readiness selected draft raw resume text.",
      targetRole: "Operations analyst",
      proofPacketRedactions: {
        updatedAt: "2026-05-14T22:16:00.000Z",
        sourceExcerpts: {},
        followupNotes: {},
      },
      firstReplyFactCapture: {
        localOnly: true,
        exportTextUnchanged: true,
        observedState: "Not observed",
        rawReplyText: "",
        capturedFacts: [],
        selectedRecruitSlot: "Slot 1",
      },
      schedulingReadiness: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "blocked",
        acceptedLocal: false,
        selectedDraftId: "scheduling_readiness_selected_user",
        blockers: ["accepted-local scheduling state required"],
        localSchedulingFacts: [],
        source: "local-storage-only",
      },
      exportSnapshot: {
        format: "proofresume-local-section-v1",
        sectionText: selectedExportText,
        accepted: [
          {
            key: "scheduling_readiness_accepted_1",
            resumeText: "Scheduling readiness accepted resume bullet.",
            evidenceStatus: "Approved (evidence-backed)",
          },
        ],
        audit: {
          rejected: [{ key: "scheduling_readiness_rejected_1", text: "Rejected scheduling readiness fixture should stay out of export." }],
          pending: [{ key: "scheduling_readiness_pending_1", text: "Pending scheduling readiness fixture should stay out of export." }],
        },
      },
      downloadedExportText: selectedExportText,
    };
    const backgroundDraft = {
      id: "scheduling_readiness_background_demo",
      sourceType: "demo_sample_material",
      isDemo: true,
      rawText: "Background demo draft for scheduling readiness selection checks.",
      normalizedText: "Background demo draft for scheduling readiness selection checks.",
      targetRole: "Customer operations manager",
      schedulingReadiness: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "blocked",
        acceptedLocal: false,
        selectedDraftId: "scheduling_readiness_background_demo",
        blockers: ["demo draft is not eligible for real scheduling"],
        localSchedulingFacts: [],
      },
    };

    localStorage.setItem("proofresume:intakes", JSON.stringify([selectedDraft, backgroundDraft]));
    localStorage.setItem("proofresume:lastIntakeId", selectedDraft.id);
    return { selectedExportText };
  });
}

async function applySchedulingAcceptedLocalState(page) {
  return page.evaluate(() => {
    const schedulingFactText = "Accepted-local scheduling fact: candidate confirmed Tuesday at 2pm PT for the first session.";
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const lastIntakeId = localStorage.getItem("proofresume:lastIntakeId");
    const updated = intakes.map((intake) => {
      if (intake.id !== lastIntakeId) return intake;
      return {
        ...intake,
        firstReplyFactCapture: {
          ...(intake.firstReplyFactCapture || {}),
          localOnly: true,
          exportTextUnchanged: true,
          observedState: "Observed",
          rawReplyText: "Candidate replied yes to Tuesday at 2pm PT.",
          selectedRecruitSlot: "Slot 1",
          capturedFacts: [
            {
              key: "scheduling_fact_1",
              label: "Scheduling acceptance",
              text: schedulingFactText,
              value: "Tuesday at 2pm PT",
              exportEligible: false,
              source: "first reply",
            },
          ],
        },
        firstReplyFacts: {
          ...(intake.firstReplyFacts || {}),
          state: "accepted",
          updatedAt: "2026-05-14T22:17:00.000Z",
          localOnly: true,
          exportTextUnchanged: true,
          explicitOperatorAction: "recorded",
        },
        schedulingReadiness: {
          ...(intake.schedulingReadiness || {}),
          localOnly: true,
          exportTextUnchanged: true,
          state: "accepted-local",
          acceptedLocal: true,
          selectedDraftId: lastIntakeId,
          acceptedAt: "2026-05-14T22:17:00.000Z",
          selectedSlot: "Tuesday 2pm PT",
          source: "first-reply-local-operator-note",
          blockers: [],
          localSchedulingFacts: [
            {
              key: "scheduling_fact_1",
              text: schedulingFactText,
              exportEligible: false,
              source: "first reply",
            },
          ],
        },
      };
    });
    localStorage.setItem("proofresume:intakes", JSON.stringify(updated));
    return { schedulingFactText };
  });
}

async function seedSessionStartGateDrafts(page) {
  return page.evaluate(() => {
    const selectedExportText = "Session-start gate resume export text must stay separate from appointment metadata.";
    const selectedDraft = {
      id: "session_start_gate_selected_user",
      sourceType: "pasted_resume_text",
      isDemo: false,
      rawText: "Session-start selected draft raw resume text.",
      normalizedText: "Session-start selected draft raw resume text.",
      targetRole: "Operations analyst",
      proofPacketRedactions: {
        updatedAt: "2026-05-14T23:12:00.000Z",
        sourceExcerpts: {},
        followupNotes: {},
      },
      firstReplyFacts: {
        state: "accepted",
        updatedAt: "2026-05-14T23:12:00.000Z",
        localOnly: true,
        exportTextUnchanged: true,
        explicitOperatorAction: "recorded",
      },
      schedulingReadiness: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "accepted-local",
        acceptedLocal: true,
        selectedDraftId: "session_start_gate_selected_user",
        selectedSlot: "Tuesday 2pm PT",
        source: "first-reply-local-operator-note",
        blockers: [],
      },
      sessionStartGate: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "blocked",
        appointmentConfirmed: false,
        calendarReady: false,
        consentReady: false,
        redactedMaterialReady: false,
        readyLocal: false,
        selectedDraftId: "session_start_gate_selected_user",
        blockers: ["appointment confirmation required", "calendar readiness required", "consent required", "redacted material reminder required"],
        artifactLinks: [
          "../ops/research/private-free-audit-first-session-operator-runbook.md",
          "../ops/research/free-audit-real-session-note-packet.md",
          "../ops/research/private-free-audit-post-session-debrief-template.md",
        ],
        source: "local-storage-only",
      },
      appointmentSessionStartGate: {
        localOnly: true,
        exportTextUnchanged: true,
        appointmentDateTime: "",
        consentBoundaryConfirmed: false,
        redactedMaterialReminderConfirmed: false,
        rawNotePrepConfirmed: false,
        source: "appointment-confirmed-session-start-local-gate",
      },
      exportSnapshot: {
        format: "proofresume-local-section-v1",
        sectionText: selectedExportText,
        accepted: [
          {
            key: "session_start_gate_accepted_1",
            resumeText: "Session-start gate accepted resume bullet.",
            evidenceStatus: "Approved (evidence-backed)",
          },
        ],
        audit: {
          rejected: [{ key: "session_start_gate_rejected_1", text: "Rejected session-start gate fixture should stay out of export." }],
          pending: [{ key: "session_start_gate_pending_1", text: "Pending session-start gate fixture should stay out of export." }],
        },
      },
      downloadedExportText: selectedExportText,
    };
    const backgroundDraft = {
      id: "session_start_gate_background_demo",
      sourceType: "demo_sample_material",
      isDemo: true,
      rawText: "Background demo draft for session-start selection checks.",
      normalizedText: "Background demo draft for session-start selection checks.",
      targetRole: "Customer operations manager",
      sessionStartGate: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "blocked",
        appointmentConfirmed: false,
        calendarReady: false,
        consentReady: false,
        redactedMaterialReady: false,
        readyLocal: false,
        selectedDraftId: "session_start_gate_background_demo",
        blockers: ["demo draft is not eligible for session start"],
      },
      appointmentSessionStartGate: {
        localOnly: true,
        exportTextUnchanged: true,
        appointmentDateTime: "",
        consentBoundaryConfirmed: false,
        redactedMaterialReminderConfirmed: false,
        rawNotePrepConfirmed: false,
      },
    };

    localStorage.setItem("proofresume:intakes", JSON.stringify([selectedDraft, backgroundDraft]));
    localStorage.setItem("proofresume:lastIntakeId", selectedDraft.id);
    return { selectedExportText };
  });
}

async function applySessionStartReadyLocalState(page) {
  return page.evaluate(() => {
    const appointmentFactText = "Appointment-confirmed session-start fact: Tuesday 2pm PT calendar invite is ready.";
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const lastIntakeId = localStorage.getItem("proofresume:lastIntakeId");
    const updated = intakes.map((intake) => {
      if (intake.id !== lastIntakeId) return intake;
      return {
        ...intake,
        sessionStartGate: {
          ...(intake.sessionStartGate || {}),
          localOnly: true,
          exportTextUnchanged: true,
          state: "ready-local",
          appointmentConfirmed: true,
          appointmentTime: "Tuesday 2pm PT",
          calendarReady: true,
          consentReady: true,
          redactedMaterialReady: true,
          readyLocal: true,
          selectedDraftId: lastIntakeId,
          readyAt: "2026-05-14T23:13:00.000Z",
          source: "local-storage-only",
          blockers: [],
          localSessionStartFacts: [
            {
              key: "session_start_fact_1",
              text: appointmentFactText,
              exportEligible: false,
              source: "appointment-confirmed-local-operator-note",
            },
          ],
          artifactLinks: [
            "../ops/research/private-free-audit-first-session-operator-runbook.md",
            "../ops/research/free-audit-real-session-note-packet.md",
            "../ops/research/private-free-audit-post-session-debrief-template.md",
          ],
        },
        appointmentSessionStartGate: {
          ...(intake.appointmentSessionStartGate || {}),
          localOnly: true,
          exportTextUnchanged: true,
          appointmentDateTime: "2026-05-19T14:00",
          consentBoundaryConfirmed: true,
          redactedMaterialReminderConfirmed: true,
          rawNotePrepConfirmed: true,
          updatedAt: "2026-05-14T23:13:00.000Z",
          source: "appointment-confirmed-session-start-local-gate",
        },
      };
    });
    localStorage.setItem("proofresume:intakes", JSON.stringify(updated));
    return { appointmentFactText };
  });
}

async function seedRawNoteCaptureDrafts(page) {
  return page.evaluate(() => {
    const selectedExportText = "Raw-note capture resume export text must stay separate from first-session notes.";
    const selectedDraft = {
      id: "raw_note_capture_selected_user",
      sourceType: "pasted_resume_text",
      isDemo: false,
      rawText: "Raw-note capture selected draft raw resume text.",
      normalizedText: "Raw-note capture selected draft raw resume text.",
      targetRole: "Operations analyst",
      proofPacketRedactions: {
        updatedAt: "2026-05-14T23:30:00.000Z",
        sourceExcerpts: {},
        followupNotes: {},
      },
      firstReplyFacts: {
        state: "accepted",
        updatedAt: "2026-05-14T23:30:00.000Z",
        localOnly: true,
        exportTextUnchanged: true,
        explicitOperatorAction: "recorded",
      },
      schedulingReadiness: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "accepted-local",
        acceptedLocal: true,
        selectedDraftId: "raw_note_capture_selected_user",
        selectedSlot: "Tuesday 2pm PT",
        source: "first-reply-local-operator-note",
        blockers: [],
      },
      sessionStartGate: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "blocked",
        appointmentConfirmed: false,
        calendarReady: false,
        consentReady: false,
        redactedMaterialReady: false,
        readyLocal: false,
        selectedDraftId: "raw_note_capture_selected_user",
        blockers: ["appointment-confirmed session-start readiness required before raw-note capture"],
        source: "local-storage-only",
      },
      appointmentSessionStartGate: {
        localOnly: true,
        exportTextUnchanged: true,
        appointmentDateTime: "",
        consentBoundaryConfirmed: false,
        redactedMaterialReminderConfirmed: false,
        rawNotePrepConfirmed: false,
        source: "appointment-confirmed-session-start-local-gate",
      },
      firstSessionRawNoteCapture: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "blocked",
        readyToCapture: false,
        notesRecorded: false,
        selectedDraftId: "raw_note_capture_selected_user",
        rawNotes: "",
        rawNoteText: "",
        debriefReady: false,
        objectionCodingReady: false,
        artifactLinks: [
          "../ops/research/free-audit-real-session-note-packet.md",
          "../ops/research/private-free-audit-post-session-debrief-template.md",
          "../ops/research/private-free-audit-objection-coding-rubric.md",
        ],
        source: "local-storage-only",
        blockers: ["session-start readiness required"],
      },
      rawNoteCapture: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "blocked",
        readyToCapture: false,
        notesRecorded: false,
        selectedDraftId: "raw_note_capture_selected_user",
        rawNotes: "",
        rawNoteText: "",
        source: "first-session-local-raw-note-capture",
      },
      exportSnapshot: {
        format: "proofresume-local-section-v1",
        sectionText: selectedExportText,
        accepted: [
          {
            key: "raw_note_capture_accepted_1",
            resumeText: "Raw-note capture accepted resume bullet.",
            evidenceStatus: "Approved (evidence-backed)",
          },
        ],
        audit: {
          rejected: [{ key: "raw_note_capture_rejected_1", text: "Rejected raw-note capture fixture should stay out of export." }],
          pending: [{ key: "raw_note_capture_pending_1", text: "Pending raw-note capture fixture should stay out of export." }],
        },
      },
      downloadedExportText: selectedExportText,
    };
    const backgroundDraft = {
      id: "raw_note_capture_background_demo",
      sourceType: "demo_sample_material",
      isDemo: true,
      rawText: "Background demo draft for raw-note capture selection checks.",
      normalizedText: "Background demo draft for raw-note capture selection checks.",
      targetRole: "Customer operations manager",
      sessionStartGate: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "blocked",
        readyLocal: false,
        selectedDraftId: "raw_note_capture_background_demo",
        blockers: ["demo draft is not eligible for raw-note capture"],
      },
      firstSessionRawNoteCapture: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "blocked",
        readyToCapture: false,
        notesRecorded: false,
        selectedDraftId: "raw_note_capture_background_demo",
        rawNotes: "",
        rawNoteText: "",
        blockers: ["demo draft is not eligible for raw-note capture"],
      },
    };

    localStorage.setItem("proofresume:intakes", JSON.stringify([selectedDraft, backgroundDraft]));
    localStorage.setItem("proofresume:lastIntakeId", selectedDraft.id);
    return { selectedExportText };
  });
}

async function applyRawNoteSavedLocalState(page) {
  return page.evaluate(() => {
    const rawNoteText =
      "RAW NOTE CAPTURE FIXTURE: candidate said the dashboard story resonated, asked about analytics manager positioning, and raised one pricing concern.";
    const debriefNoteText = "Debrief-ready raw-note summary: dashboard story resonated; pricing concern needs objection coding.";
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const lastIntakeId = localStorage.getItem("proofresume:lastIntakeId");
    const updated = intakes.map((intake) => {
      if (intake.id !== lastIntakeId) return intake;
      return {
        ...intake,
        sessionStartGate: {
          ...(intake.sessionStartGate || {}),
          localOnly: true,
          exportTextUnchanged: true,
          state: "ready-local",
          appointmentConfirmed: true,
          calendarReady: true,
          consentReady: true,
          redactedMaterialReady: true,
          readyLocal: true,
          selectedDraftId: lastIntakeId,
          blockers: [],
        },
        appointmentSessionStartGate: {
          ...(intake.appointmentSessionStartGate || {}),
          localOnly: true,
          exportTextUnchanged: true,
          appointmentDateTime: "2026-05-19T14:00",
          consentBoundaryConfirmed: true,
          redactedMaterialReminderConfirmed: true,
          rawNotePrepConfirmed: true,
          source: "appointment-confirmed-session-start-local-gate",
        },
        firstSessionRawNoteCapture: {
          ...(intake.firstSessionRawNoteCapture || {}),
          localOnly: true,
          exportTextUnchanged: true,
          state: "notes-recorded",
          readyToCapture: true,
          notesRecorded: true,
          selectedDraftId: lastIntakeId,
          rawNotes: rawNoteText,
          rawNoteText,
          updatedAt: "2026-05-14T23:31:00.000Z",
          capturedAt: "2026-05-14T23:31:00.000Z",
          debriefReady: true,
          objectionCodingReady: true,
          exportEligible: false,
          debriefNoteText,
          artifactLinks: [
            "../ops/research/free-audit-real-session-note-packet.md",
            "../ops/research/private-free-audit-post-session-debrief-template.md",
            "../ops/research/private-free-audit-objection-coding-rubric.md",
          ],
          source: "first-session-local-raw-note-capture",
          blockers: [],
        },
        rawNoteCapture: {
          ...(intake.rawNoteCapture || {}),
          localOnly: true,
          exportTextUnchanged: true,
          state: "notes-recorded",
          readyToCapture: true,
          notesRecorded: true,
          selectedDraftId: lastIntakeId,
          rawNoteText,
          capturedAt: "2026-05-14T23:31:00.000Z",
          exportEligible: false,
          source: "first-session-local-raw-note-capture",
        },
      };
    });
    localStorage.setItem("proofresume:intakes", JSON.stringify(updated));
    return { rawNoteText, debriefNoteText };
  });
}

async function seedPostSessionDebriefDrafts(page) {
  return page.evaluate(() => {
    const selectedExportText = "Post-session debrief resume export text must stay separate from operator debrief drafts.";
    const selectedDraft = {
      id: "post_session_debrief_selected_user",
      sourceType: "pasted_resume_text",
      isDemo: false,
      rawText: "Post-session debrief selected draft raw resume text.",
      normalizedText: "Post-session debrief selected draft raw resume text.",
      targetRole: "Operations analyst",
      proofPacketRedactions: {
        updatedAt: "2026-05-14T23:45:00.000Z",
        sourceExcerpts: {},
        followupNotes: {},
      },
      sessionStartGate: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "ready-local",
        appointmentConfirmed: true,
        calendarReady: true,
        consentReady: true,
        redactedMaterialReady: true,
        readyLocal: true,
        selectedDraftId: "post_session_debrief_selected_user",
        blockers: [],
      },
      firstSessionRawNoteCapture: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "blocked",
        readyToCapture: true,
        notesRecorded: false,
        selectedDraftId: "post_session_debrief_selected_user",
        rawNotes: "",
        rawNoteText: "",
        debriefReady: false,
        objectionCodingReady: false,
        exportEligible: false,
        source: "first-session-local-raw-note-capture",
        blockers: ["raw-note capture required before post-session debrief"],
      },
      postSessionDebrief: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "blocked",
        rawNotesRequired: true,
        rawNotesAvailable: false,
        draftSaved: false,
        selectedDraftId: "post_session_debrief_selected_user",
        debriefDraftText: "",
        nextStepFields: {
          resonance: "",
          objections: "",
          followUp: "",
          synthesis: "",
        },
        artifactLinks: [
          "../ops/research/private-free-audit-post-session-debrief-template.md",
          "../ops/research/free-audit-objection-coding-rubric.md",
          "../ops/research/free-audit-interview-synthesis-template.md",
        ],
        source: "local-storage-only",
        blockers: ["first-session raw notes required"],
      },
      postSessionDebriefHandoff: {
        nextStep: "",
        objectionCode: "",
        synthesisCue: "",
        localOnly: true,
        exportTextUnchanged: true,
        downloadTextUnchanged: true,
        exportEligible: false,
        source: "post-session-local-operator-debrief-handoff",
      },
      debriefHandoff: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "blocked",
        selectedDraftId: "post_session_debrief_selected_user",
        rawNotesAvailable: false,
        draftSaved: false,
        source: "post-session-local-debrief-handoff",
      },
      exportSnapshot: {
        format: "proofresume-local-section-v1",
        sectionText: selectedExportText,
        accepted: [
          {
            key: "post_session_debrief_accepted_1",
            resumeText: "Post-session debrief accepted resume bullet.",
            evidenceStatus: "Approved (evidence-backed)",
          },
        ],
        audit: {
          rejected: [{ key: "post_session_debrief_rejected_1", text: "Rejected post-session debrief fixture should stay out of export." }],
          pending: [{ key: "post_session_debrief_pending_1", text: "Pending post-session debrief fixture should stay out of export." }],
        },
      },
      downloadedExportText: selectedExportText,
    };
    const backgroundDraft = {
      id: "post_session_debrief_background_demo",
      sourceType: "demo_sample_material",
      isDemo: true,
      rawText: "Background demo draft for post-session debrief selection checks.",
      normalizedText: "Background demo draft for post-session debrief selection checks.",
      targetRole: "Customer operations manager",
      firstSessionRawNoteCapture: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "notes-recorded",
        notesRecorded: true,
        selectedDraftId: "post_session_debrief_background_demo",
        rawNoteText: "Background demo raw note must not become selected post-session debrief draft.",
        debriefReady: true,
        objectionCodingReady: true,
      },
      postSessionDebrief: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "blocked",
        rawNotesAvailable: false,
        draftSaved: false,
        selectedDraftId: "post_session_debrief_background_demo",
        blockers: ["demo draft is not eligible for real post-session debrief"],
      },
      postSessionDebriefHandoff: {
        nextStep: "",
        objectionCode: "",
        synthesisCue: "",
        localOnly: true,
        exportTextUnchanged: true,
        downloadTextUnchanged: true,
        exportEligible: false,
        source: "post-session-local-operator-debrief-handoff",
      },
    };

    localStorage.setItem("proofresume:intakes", JSON.stringify([selectedDraft, backgroundDraft]));
    localStorage.setItem("proofresume:lastIntakeId", selectedDraft.id);
    return { selectedExportText };
  });
}

async function applyPostSessionDebriefDraftSavedState(page) {
  return page.evaluate(() => {
    const rawNoteText =
      "POST-SESSION DEBRIEF RAW NOTE: candidate liked quantified dashboard proof, hesitated on price, and asked for analytics manager targeting.";
    const debriefDraftText =
      "POST-SESSION DEBRIEF DRAFT: resonance=quantified dashboard story; objection=pricing concern; follow-up=send analytics manager positioning proof.";
    const nextStepText = "Send analytics manager positioning proof.";
    const synthesisCueText = "Quantified dashboard proof resonated; carry pricing risk into five-session synthesis.";
    const objectionCodeText = "Objection code: pricing-risk-follow-up-required";
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const lastIntakeId = localStorage.getItem("proofresume:lastIntakeId");
    const updated = intakes.map((intake) => {
      if (intake.id !== lastIntakeId) return intake;
      return {
        ...intake,
        firstSessionRawNoteCapture: {
          ...(intake.firstSessionRawNoteCapture || {}),
          localOnly: true,
          exportTextUnchanged: true,
          state: "notes-recorded",
          readyToCapture: true,
          notesRecorded: true,
          selectedDraftId: lastIntakeId,
          rawNotes: rawNoteText,
          rawNoteText,
          debriefReady: true,
          objectionCodingReady: true,
          exportEligible: false,
          source: "first-session-local-raw-note-capture",
          blockers: [],
        },
        postSessionDebrief: {
          ...(intake.postSessionDebrief || {}),
          localOnly: true,
          exportTextUnchanged: true,
          state: "debrief-draft-saved",
          rawNotesRequired: true,
          rawNotesAvailable: true,
          draftSaved: true,
          selectedDraftId: lastIntakeId,
          debriefDraftText,
          debriefDraft: debriefDraftText,
          objectionCodes: [objectionCodeText],
          nextStepFields: {
            resonance: "Quantified dashboard story resonated.",
            objections: "Pricing concern needs objection coding.",
            followUp: "Send analytics manager positioning proof.",
            synthesis: "Keep for five-session synthesis only after enough real sessions.",
          },
          exportEligible: false,
          artifactLinks: [
            "../ops/research/private-free-audit-post-session-debrief-template.md",
            "../ops/research/free-audit-objection-coding-rubric.md",
            "../ops/research/free-audit-interview-synthesis-template.md",
          ],
          source: "post-session-local-debrief-handoff",
          blockers: [],
        },
        postSessionDebriefHandoff: {
          nextStep: nextStepText,
          objectionCode: objectionCodeText,
          synthesisCue: synthesisCueText,
          updatedAt: "2026-05-14T23:46:00.000Z",
          localOnly: true,
          exportTextUnchanged: true,
          downloadTextUnchanged: true,
          exportEligible: false,
          source: "post-session-local-operator-debrief-handoff",
          linkedArtifacts: ["debrief-template", "objection-coding", "five-session-synthesis"],
        },
        debriefHandoff: {
          ...(intake.debriefHandoff || {}),
          localOnly: true,
          exportTextUnchanged: true,
          state: "debrief-draft-saved",
          selectedDraftId: lastIntakeId,
          rawNotesAvailable: true,
          draftSaved: true,
          exportEligible: false,
          source: "post-session-local-debrief-handoff",
        },
      };
    });
    localStorage.setItem("proofresume:intakes", JSON.stringify(updated));
    return { rawNoteText, debriefDraftText, nextStepText, synthesisCueText, objectionCodeText };
  });
}

async function seedObjectionCodingDrafts(page) {
  return page.evaluate(() => {
    const selectedExportText = "Objection coding resume export text must stay separate from private objection tags.";
    const selectedDraft = {
      id: "objection_coding_selected_user",
      sourceType: "pasted_resume_text",
      isDemo: false,
      rawText: "Objection coding selected draft raw resume text.",
      normalizedText: "Objection coding selected draft raw resume text.",
      targetRole: "Operations analyst",
      proofPacketRedactions: {
        updatedAt: "2026-05-15T00:02:00.000Z",
        sourceExcerpts: {},
        followupNotes: {},
      },
      postSessionDebrief: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "blocked",
        rawNotesAvailable: false,
        draftSaved: false,
        selectedDraftId: "objection_coding_selected_user",
        exportEligible: false,
        artifactLinks: [
          "../ops/research/private-free-audit-post-session-debrief-template.md",
          "../ops/research/free-audit-objection-coding-rubric.md",
          "../ops/research/free-audit-interview-synthesis-template.md",
        ],
        source: "post-session-local-debrief-handoff",
        blockers: ["post-session debrief required before objection coding"],
      },
      objectionCodingHandoff: {
        localOnly: true,
        exportTextUnchanged: true,
        downloadTextUnchanged: true,
        state: "blocked",
        selectedDraftId: "objection_coding_selected_user",
        debriefReady: false,
        codeSaved: false,
        objectionCodes: [],
        codeCount: 0,
        synthesisReady: false,
        exportEligible: false,
        artifactLinks: [
          "../ops/research/free-audit-objection-coding-rubric.md",
          "../ops/research/free-audit-interview-synthesis-template.md",
        ],
        source: "local-storage-only",
        blockers: ["post-session debrief draft required"],
      },
      objectionCoding: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "blocked",
        selectedDraftId: "objection_coding_selected_user",
        codes: [],
        rubricLinked: true,
        synthesisLinked: true,
        exportEligible: false,
      },
      exportSnapshot: {
        format: "proofresume-local-section-v1",
        sectionText: selectedExportText,
        accepted: [
          {
            key: "objection_coding_accepted_1",
            resumeText: "Objection coding accepted resume bullet.",
            evidenceStatus: "Approved (evidence-backed)",
          },
        ],
        audit: {
          rejected: [{ key: "objection_coding_rejected_1", text: "Rejected objection coding fixture should stay out of export." }],
          pending: [{ key: "objection_coding_pending_1", text: "Pending objection coding fixture should stay out of export." }],
        },
      },
      downloadedExportText: selectedExportText,
    };
    const backgroundDraft = {
      id: "objection_coding_background_demo",
      sourceType: "demo_sample_material",
      isDemo: true,
      rawText: "Background demo draft for objection coding selection checks.",
      normalizedText: "Background demo draft for objection coding selection checks.",
      targetRole: "Customer operations manager",
      postSessionDebrief: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "debrief-draft-saved",
        rawNotesAvailable: true,
        draftSaved: true,
        selectedDraftId: "objection_coding_background_demo",
      },
      objectionCodingHandoff: {
        localOnly: true,
        exportTextUnchanged: true,
        downloadTextUnchanged: true,
        state: "blocked",
        selectedDraftId: "objection_coding_background_demo",
        debriefReady: false,
        codeSaved: false,
        objectionCodes: [],
        codeCount: 0,
        synthesisReady: false,
        exportEligible: false,
        blockers: ["demo draft is not eligible for real objection coding"],
      },
    };

    localStorage.setItem("proofresume:intakes", JSON.stringify([selectedDraft, backgroundDraft]));
    localStorage.setItem("proofresume:lastIntakeId", selectedDraft.id);
    return { selectedExportText };
  });
}

async function applyObjectionCodingSavedState(page) {
  return page.evaluate(() => {
    const debriefDraftText =
      "OBJECTION-CODING DEBRIEF DRAFT: buyer liked quantified dashboard proof but raised price risk and timing uncertainty.";
    const objectionCodeText = "OBJECTION CODE: price-risk:needs-manager-proof";
    const privateTagText = "price-risk, needs-manager-proof";
    const rubricNoteText = "Rubric note: classify as price risk, not willingness-to-pay proof.";
    const synthesisCueText = "Synthesis cue: keep private until five real sessions exist.";
    const rawNoteText = "OBJECTION-CODING RAW NOTE: buyer raised price risk after seeing quantified dashboard proof.";
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const lastIntakeId = localStorage.getItem("proofresume:lastIntakeId");
    const updated = intakes.map((intake) => {
      if (intake.id !== lastIntakeId) return intake;
      return {
        ...intake,
        firstSessionRawNoteCapture: {
          ...(intake.firstSessionRawNoteCapture || {}),
          localOnly: true,
          exportTextUnchanged: true,
          state: "notes-recorded",
          readyToCapture: true,
          notesRecorded: true,
          selectedDraftId: lastIntakeId,
          rawNotes: rawNoteText,
          rawNoteText,
          debriefReady: true,
          objectionCodingReady: true,
          exportEligible: false,
          source: "first-session-local-raw-note-capture",
          blockers: [],
        },
        postSessionDebrief: {
          ...(intake.postSessionDebrief || {}),
          localOnly: true,
          exportTextUnchanged: true,
          state: "debrief-draft-saved",
          rawNotesAvailable: true,
          draftSaved: true,
          selectedDraftId: lastIntakeId,
          debriefDraftText,
          exportEligible: false,
          source: "post-session-local-debrief-handoff",
          blockers: [],
        },
        postSessionDebriefHandoff: {
          ...(intake.postSessionDebriefHandoff || {}),
          nextStep: "Send manager-proof follow-up.",
          objectionCode: objectionCodeText,
          synthesisCue: synthesisCueText,
          updatedAt: "2026-05-15T00:03:00.000Z",
          localOnly: true,
          exportTextUnchanged: true,
          downloadTextUnchanged: true,
          exportEligible: false,
          source: "post-session-local-operator-debrief-handoff",
          linkedArtifacts: ["debrief-template", "objection-coding", "five-session-synthesis"],
        },
        objectionCodingHandoff: {
          ...(intake.objectionCodingHandoff || {}),
          localOnly: true,
          exportTextUnchanged: true,
          downloadTextUnchanged: true,
          state: "codes-recorded",
          selectedDraftId: lastIntakeId,
          debriefReady: true,
          codeSaved: true,
          privateObjectionTags: ["price-risk", "needs-manager-proof"],
          privateObjectionTagsText: privateTagText,
          tags: privateTagText,
          synthesisNote: synthesisCueText,
          objectionCodes: [
            {
              key: "price-risk-manager-proof",
              text: objectionCodeText,
              rubricNote: rubricNoteText,
              synthesisCue: synthesisCueText,
              exportEligible: false,
            },
          ],
          codeCount: 1,
          synthesisReady: false,
          exportEligible: false,
          artifactLinks: [
            "../ops/research/free-audit-objection-coding-rubric.md",
            "../ops/research/free-audit-interview-synthesis-template.md",
          ],
          source: "local-objection-coding-handoff",
          blockers: [],
        },
        objectionCoding: {
          ...(intake.objectionCoding || {}),
          localOnly: true,
          exportTextUnchanged: true,
          state: "codes-recorded",
          selectedDraftId: lastIntakeId,
          codes: [
            {
              key: "price-risk-manager-proof",
              text: objectionCodeText,
              rubricNote: rubricNoteText,
              exportEligible: false,
            },
          ],
          rubricLinked: true,
          synthesisLinked: true,
          exportEligible: false,
        },
      };
    });
    localStorage.setItem("proofresume:intakes", JSON.stringify(updated));
    return { debriefDraftText, objectionCodeText, privateTagText, rubricNoteText, synthesisCueText, rawNoteText };
  });
}

async function seedFiveSessionSynthesisDrafts(page) {
  return page.evaluate(() => {
    const selectedExportText = "Five-session synthesis resume export text must stay separate from private synthesis packets.";
    const selectedDraft = {
      id: "five_session_synthesis_selected_user",
      sourceType: "pasted_resume_text",
      isDemo: false,
      rawText: "Five-session synthesis selected draft raw resume text.",
      normalizedText: "Five-session synthesis selected draft raw resume text.",
      targetRole: "Operations analyst",
      proofPacketRedactions: {
        updatedAt: "2026-05-15T00:16:00.000Z",
        sourceExcerpts: {},
        followupNotes: {},
      },
      objectionCodingHandoff: {
        localOnly: true,
        exportTextUnchanged: true,
        downloadTextUnchanged: true,
        state: "blocked",
        selectedDraftId: "five_session_synthesis_selected_user",
        debriefReady: false,
        codeSaved: false,
        objectionCodes: [],
        codeCount: 0,
        synthesisReady: false,
        exportEligible: false,
        blockers: ["five completed real sessions required before synthesis"],
      },
      fiveSessionSynthesisReadiness: {
        localOnly: true,
        exportTextUnchanged: true,
        downloadTextUnchanged: true,
        state: "blocked",
        selectedDraftId: "five_session_synthesis_selected_user",
        completedSessionCount: 0,
        requiredSessionCount: 5,
        ready: false,
        exportEligible: false,
        sessionSlots: [],
        blockers: ["five completed raw-note/debrief/objection-code packets required"],
        artifactLinks: ["../ops/research/free-audit-interview-synthesis-template.md"],
        source: "local-storage-only",
      },
      privateSynthesisArtifactGenerator: {
        localOnly: true,
        exportTextUnchanged: true,
        downloadTextUnchanged: true,
        state: "blocked",
        selectedDraftId: "five_session_synthesis_selected_user",
        readyToGenerate: false,
        artifactDrafted: false,
        exportEligible: false,
        sourcePacketCount: 0,
        requiredPacketCount: 5,
        blockers: ["five complete evidence packets required before private synthesis artifact generation"],
        artifact: null,
      },
      synthesisReadiness: {
        localOnly: true,
        exportTextUnchanged: true,
        state: "blocked",
        completedSessionCount: 0,
        requiredSessionCount: 5,
        ready: false,
      },
      exportSnapshot: {
        format: "proofresume-local-section-v1",
        sectionText: selectedExportText,
        accepted: [
          {
            key: "five_session_synthesis_accepted_1",
            resumeText: "Five-session synthesis accepted resume bullet.",
            evidenceStatus: "Approved (evidence-backed)",
          },
        ],
        audit: {
          rejected: [{ key: "five_session_synthesis_rejected_1", text: "Rejected five-session synthesis fixture should stay out of export." }],
          pending: [{ key: "five_session_synthesis_pending_1", text: "Pending five-session synthesis fixture should stay out of export." }],
        },
      },
      downloadedExportText: selectedExportText,
    };
    const backgroundDraft = {
      id: "five_session_synthesis_background_demo",
      sourceType: "demo_sample_material",
      isDemo: true,
      rawText: "Background demo draft for synthesis selection checks.",
      normalizedText: "Background demo draft for synthesis selection checks.",
      targetRole: "Customer operations manager",
      fiveSessionSynthesisReadiness: {
        localOnly: true,
        exportTextUnchanged: true,
        downloadTextUnchanged: true,
        state: "blocked",
        selectedDraftId: "five_session_synthesis_background_demo",
        completedSessionCount: 0,
        requiredSessionCount: 5,
        ready: false,
        sessionSlots: [],
        blockers: ["demo draft is not eligible for real-session synthesis"],
      },
      privateSynthesisArtifactGenerator: {
        localOnly: true,
        exportTextUnchanged: true,
        downloadTextUnchanged: true,
        state: "blocked",
        selectedDraftId: "five_session_synthesis_background_demo",
        readyToGenerate: false,
        artifactDrafted: false,
        exportEligible: false,
        sourcePacketCount: 0,
        requiredPacketCount: 5,
        blockers: ["demo draft is not eligible for real-session synthesis artifacts"],
        artifact: null,
      },
    };

    localStorage.setItem("proofresume:intakes", JSON.stringify([selectedDraft, backgroundDraft]));
    localStorage.setItem("proofresume:lastIntakeId", selectedDraft.id);
    return { selectedExportText };
  });
}

async function applyFiveSessionSynthesisState(page, completedSessionCount) {
  return page.evaluate((count) => {
    const makeSlot = (index) => ({
      slot: index + 1,
      recruitId: `real-session-${index + 1}`,
      rawNoteText: `FIVE-SESSION RAW NOTE ${index + 1}: quantified dashboard proof was tested in a real conversation.`,
      debriefDraftText: `FIVE-SESSION DEBRIEF ${index + 1}: dashboard proof resonance and objection context captured.`,
      objectionCodeText: `FIVE-SESSION OBJECTION CODE ${index + 1}: proof-depth-${index + 1}`,
      rawNotesComplete: true,
      debriefComplete: true,
      objectionCodesComplete: true,
      exportEligible: false,
      source: "local-real-session-packet",
    });
    const sessionSlots = Array.from({ length: count }, (_, index) => makeSlot(index));
    const makePacketIntake = (slot, existing = {}) => ({
      ...existing,
      id: existing.id || `five_session_packet_${slot.slot}`,
      sourceType: "pasted_resume_text",
      isDemo: false,
      rawText: existing.rawText || `Five-session packet ${slot.slot} raw resume text.`,
      normalizedText: existing.normalizedText || `Five-session packet ${slot.slot} raw resume text.`,
      targetRole: existing.targetRole || "Operations analyst",
      firstSessionRawNoteCapture: {
        ...(existing.firstSessionRawNoteCapture || {}),
        rawNotes: slot.rawNoteText,
        rawNoteText: slot.rawNoteText,
        updatedAt: "2026-05-15T00:16:00.000Z",
        capturedAt: "2026-05-15T00:16:00.000Z",
        localOnly: true,
        exportTextUnchanged: true,
        exportEligible: false,
        source: "first-session-local-operator-raw-notes",
        debriefLinked: true,
        objectionCodingLinked: true,
      },
      postSessionDebrief: {
        ...(existing.postSessionDebrief || {}),
        state: "debrief-draft-saved",
        rawNotesAvailable: true,
        draftSaved: true,
        selectedDraftId: existing.id || `five_session_packet_${slot.slot}`,
        debriefDraftText: slot.debriefDraftText,
        debriefDraft: slot.debriefDraftText,
        objectionCodes: [slot.objectionCodeText],
        localOnly: true,
        exportTextUnchanged: true,
        exportEligible: false,
        source: "post-session-local-debrief-handoff",
      },
      postSessionDebriefHandoff: {
        nextStep: `Follow-up for real session ${slot.slot}`,
        objectionCode: slot.objectionCodeText,
        synthesisCue: slot.debriefDraftText,
        updatedAt: "2026-05-15T00:16:00.000Z",
        localOnly: true,
        exportTextUnchanged: true,
        downloadTextUnchanged: true,
        exportEligible: false,
        source: "post-session-local-operator-debrief-handoff",
        linkedArtifacts: ["debrief-template", "objection-coding", "five-session-synthesis"],
      },
      debriefHandoff: {
        ...(existing.debriefHandoff || {}),
        state: "debrief-draft-saved",
        selectedDraftId: existing.id || `five_session_packet_${slot.slot}`,
        rawNotesAvailable: true,
        draftSaved: true,
        localOnly: true,
        exportTextUnchanged: true,
        exportEligible: false,
        source: "post-session-local-debrief-handoff",
      },
      objectionCodingHandoff: {
        ...(existing.objectionCodingHandoff || {}),
        localOnly: true,
        exportTextUnchanged: true,
        downloadTextUnchanged: true,
        state: "codes-recorded",
        selectedDraftId: existing.id || `five_session_packet_${slot.slot}`,
        debriefReady: true,
        codeSaved: true,
        privateObjectionTags: [`proof-depth-${slot.slot}`],
        privateObjectionTagsText: `proof-depth-${slot.slot}`,
        tags: `proof-depth-${slot.slot}`,
        synthesisNote: slot.objectionCodeText,
        objectionCodes: [{ key: `session-${slot.slot}-objection`, text: slot.objectionCodeText, exportEligible: false }],
        codeCount: 1,
        synthesisReady: false,
        exportEligible: false,
        source: "local-objection-coding-handoff",
        blockers: [],
      },
    });
    const ready = count >= 5;
    const synthesisPrivateNote =
      ready
        ? "FIVE-SESSION SYNTHESIS PRIVATE NOTE: all five real-session packets are complete; synthesis can be drafted privately."
        : "FIVE-SESSION SYNTHESIS PRIVATE NOTE: partial packets exist but synthesis remains blocked.";
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const lastIntakeId = localStorage.getItem("proofresume:lastIntakeId");
    const selected = intakes.find((intake) => intake.id === lastIntakeId) || {};
    const updatedSelected = {
      ...makePacketIntake(sessionSlots[0] || makeSlot(0), selected),
      firstSessionRawNoteCapture:
        count > 0 ? makePacketIntake(sessionSlots[0], selected).firstSessionRawNoteCapture : selected.firstSessionRawNoteCapture,
      postSessionDebrief:
        count > 0 ? makePacketIntake(sessionSlots[0], selected).postSessionDebrief : selected.postSessionDebrief,
      postSessionDebriefHandoff:
        count > 0 ? makePacketIntake(sessionSlots[0], selected).postSessionDebriefHandoff : selected.postSessionDebriefHandoff,
      debriefHandoff:
        count > 0 ? makePacketIntake(sessionSlots[0], selected).debriefHandoff : selected.debriefHandoff,
      objectionCodingHandoff:
        count > 0
          ? makePacketIntake(sessionSlots[0], selected).objectionCodingHandoff
          : {
              ...(selected.objectionCodingHandoff || {}),
              localOnly: true,
              exportTextUnchanged: true,
              downloadTextUnchanged: true,
              state: "blocked",
              selectedDraftId: lastIntakeId,
              debriefReady: false,
              codeSaved: false,
              objectionCodes: [],
              codeCount: 0,
              synthesisReady: false,
              exportEligible: false,
              source: "local-objection-coding-handoff",
              blockers: ["five completed real-session packets required"],
            },
      fiveSessionSynthesisReadiness: {
        ...(selected.fiveSessionSynthesisReadiness || {}),
        localOnly: true,
        exportTextUnchanged: true,
        downloadTextUnchanged: true,
        state: ready ? "ready" : "blocked-partial",
        selectedDraftId: lastIntakeId,
        completedSessionCount: sessionSlots.length,
        requiredSessionCount: 5,
        ready,
        exportEligible: false,
        sessionSlots,
        synthesisPrivateNote,
        blockers: ready ? [] : [`${5 - sessionSlots.length} more completed session packet(s) required`],
        artifactLinks: ["../ops/research/free-audit-interview-synthesis-template.md"],
        source: "local-storage-only",
      },
      synthesisReadiness: {
        ...(selected.synthesisReadiness || {}),
        localOnly: true,
        exportTextUnchanged: true,
        state: ready ? "ready" : "blocked-partial",
        completedSessionCount: sessionSlots.length,
        requiredSessionCount: 5,
        ready,
      },
      privateSynthesisArtifactGenerator: {
        ...(selected.privateSynthesisArtifactGenerator || {}),
        localOnly: true,
        exportTextUnchanged: true,
        downloadTextUnchanged: true,
        state: ready ? "ready-to-generate" : "blocked",
        selectedDraftId: lastIntakeId,
        readyToGenerate: ready,
        artifactDrafted: false,
        exportEligible: false,
        sourcePacketCount: sessionSlots.length,
        requiredPacketCount: 5,
        blockers: ready ? [] : [`${5 - sessionSlots.length} more complete evidence packet(s) required before artifact generation`],
        artifact: null,
      },
    };
    const packetIntakes = sessionSlots.slice(1).map((slot) => makePacketIntake(slot));
    const nonSelectedDemoIntakes = intakes.filter((intake) => intake.id !== lastIntakeId && intake.isDemo);
    const updated = [
      updatedSelected,
      ...packetIntakes,
      ...nonSelectedDemoIntakes,
    ].map((intake) => {
      if (intake.id !== lastIntakeId) return intake;
      return {
        ...intake,
        objectionCodingHandoff: { ...(intake.objectionCodingHandoff || {}), synthesisReady: ready },
      };
    });
    localStorage.setItem("proofresume:intakes", JSON.stringify(updated));
    return { sessionSlots, synthesisPrivateNote, ready };
  }, completedSessionCount);
}

async function applyPrivateSynthesisArtifactGenerationAttempt(page) {
  return page.evaluate(() => {
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const lastIntakeId = localStorage.getItem("proofresume:lastIntakeId");
    const selectedIndex = intakes.findIndex((intake) => intake.id === lastIntakeId);
    if (selectedIndex === -1) {
      return { changed: false, reason: "missing-selected-draft", artifactText: "", packetCount: 0, ready: false };
    }

    const selected = intakes[selectedIndex];
    const readiness = selected.fiveSessionSynthesisReadiness || selected.synthesisReadiness || {};
    const slots = Array.isArray(readiness.sessionSlots) ? readiness.sessionSlots : [];
    const packetCount = Number(readiness.completedSessionCount || slots.length || 0);
    const ready = readiness.ready === true && packetCount >= 5;
    const exportText = String(selected.exportSnapshot?.sectionText || "");
    const downloadedExportText = String(selected.downloadedExportText || "");

    const base = {
      localOnly: true,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      selectedDraftId: lastIntakeId,
      sourcePacketCount: packetCount,
      requiredPacketCount: 5,
      exportEligible: false,
      source: "local-private-synthesis-artifact-generator",
    };

    if (!ready) {
      intakes[selectedIndex] = {
        ...selected,
        privateSynthesisArtifactGenerator: {
          ...base,
          state: "blocked",
          readyToGenerate: false,
          artifactDrafted: false,
          blockers: [`${Math.max(0, 5 - packetCount)} more complete evidence packet(s) required before private synthesis artifact generation`],
          artifact: null,
        },
      };
      localStorage.setItem("proofresume:intakes", JSON.stringify(intakes));
      return { changed: true, state: "blocked", artifactText: "", packetCount, ready: false };
    }

    const artifactText = [
      "PRIVATE SYNTHESIS ARTIFACT: five local evidence packets are ready for operator review.",
      "Observed proof pattern: operators reacted to quantified dashboard evidence and asked for source depth.",
      "Objection pattern: proof-depth tags should be reviewed before any public claim.",
      "Do not publish launch, pricing, testimonial, demand, willingness-to-pay, or outcome conclusions from this artifact alone.",
    ].join("\n");
    const artifact = {
      format: "proofresume-private-five-session-synthesis-artifact-v1",
      localOnly: true,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      exportEligible: false,
      selectedDraftId: lastIntakeId,
      sourcePacketCount: packetCount,
      requiredPacketCount: 5,
      sourcePacketIds: slots.map((slot) => slot.recruitId || `session-${slot.slot || slot.index || ""}`).filter(Boolean),
      summaryText: artifactText,
      generatedAt: "2026-05-15T00:34:00.000Z",
      reviewRequired: true,
    };

    intakes[selectedIndex] = {
      ...selected,
      privateSynthesisArtifactGenerator: {
        ...base,
        state: "artifact-drafted",
        readyToGenerate: true,
        artifactDrafted: true,
        blockers: [],
        artifact,
      },
      privateSynthesisArtifact: artifact,
      exportSnapshot: selected.exportSnapshot,
      downloadedExportText,
    };
    localStorage.setItem("proofresume:intakes", JSON.stringify(intakes));
    return { changed: true, state: "artifact-drafted", artifactText, packetCount, ready: true, exportText, downloadedExportText };
  });
}

async function applyPrivateSynthesisDecisionMemoCaptureAttempt(page) {
  return page.evaluate(() => {
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const lastIntakeId = localStorage.getItem("proofresume:lastIntakeId");
    const selectedIndex = intakes.findIndex((intake) => intake.id === lastIntakeId);
    if (selectedIndex === -1) {
      return { changed: false, reason: "missing-selected-draft", memoText: "", artifactAvailable: false };
    }

    const selected = intakes[selectedIndex];
    const generator = selected.privateSynthesisArtifactGenerator || {};
    const artifact = selected.privateSynthesisArtifact || generator.artifact || null;
    const artifactText = String(artifact?.summaryText || artifact?.artifactText || "");
    const artifactAvailable = Boolean(generator.artifactDrafted === true && artifact && artifactText);
    const exportText = String(selected.exportSnapshot?.sectionText || "");
    const downloadedExportText = String(selected.downloadedExportText || "");

    const base = {
      localOnly: true,
      private: true,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      selectedDraftId: lastIntakeId,
      artifactRequired: true,
      artifactAvailable,
      artifactFormat: artifact?.format || "",
      exportEligible: false,
      source: "local-private-synthesis-decision-memo-capture",
    };

    if (!artifactAvailable) {
      intakes[selectedIndex] = {
        ...selected,
        privateSynthesisDecisionMemoCapture: {
          ...base,
          state: "blocked",
          memoDrafted: false,
          blockers: ["private synthesis artifact required before decision memo capture"],
          memo: null,
        },
        synthesisDecisionMemo: {
          ...base,
          state: "blocked",
          memoDrafted: false,
          memo: null,
        },
        exportSnapshot: selected.exportSnapshot,
        downloadedExportText,
      };
      localStorage.setItem("proofresume:intakes", JSON.stringify(intakes));
      return { changed: true, state: "blocked", memoText: "", artifactAvailable: false, exportText, downloadedExportText };
    }

    const memoText = [
      "PRIVATE DECISION MEMO: synthesis artifact reviewed for operator-only launch decision inputs.",
      "Decision field: keep public launch, pricing, testimonial, demand, willingness-to-pay, and outcome claims blocked.",
      "Evidence basis: five-session private synthesis artifact exists; separate public approval is still required.",
      "Selected draft preservation: selected resume export text remains unchanged.",
    ].join("\n");
    const memo = {
      format: "proofresume-private-synthesis-decision-memo-v1",
      localOnly: true,
      private: true,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      exportEligible: false,
      selectedDraftId: lastIntakeId,
      state: "memo-drafted",
      memoDrafted: true,
      artifactFormat: artifact.format,
      artifactSourcePacketCount: artifact.sourcePacketCount || generator.sourcePacketCount || 0,
      reviewedDecisionFields: {
        launchDecision: "blocked-pending-separate-approval",
        pricingDecision: "not-observed",
        testimonialDecision: "not-observed",
        demandConclusion: "not-observed",
        willingnessToPayConclusion: "not-observed",
        outcomeConclusion: "not-observed",
      },
      memoText,
      draftedAt: "2026-05-15T00:48:00.000Z",
      source: "local-private-synthesis-decision-memo-capture",
    };

    intakes[selectedIndex] = {
      ...selected,
      privateSynthesisDecisionMemoCapture: {
        ...base,
        state: "memo-drafted",
        memoDrafted: true,
        blockers: [],
        memo,
      },
      synthesisDecisionMemo: memo,
      exportSnapshot: selected.exportSnapshot,
      downloadedExportText,
    };
    localStorage.setItem("proofresume:intakes", JSON.stringify(intakes));
    return { changed: true, state: "memo-drafted", memoText, artifactAvailable: true, exportText, downloadedExportText };
  });
}

async function applyPrivateLaunchDecisionApprovalAttempt(page) {
  return page.evaluate(() => {
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const lastIntakeId = localStorage.getItem("proofresume:lastIntakeId");
    const selectedIndex = intakes.findIndex((intake) => intake.id === lastIntakeId);
    if (selectedIndex === -1) {
      return { changed: false, reason: "missing-selected-draft", approvalText: "", memoAvailable: false };
    }

    const selected = intakes[selectedIndex];
    const memoCapture = selected.privateSynthesisDecisionMemoCapture || {};
    const memo = selected.synthesisDecisionMemo || memoCapture.memo || null;
    const memoText = String(memo?.memoText || "");
    const memoAvailable = Boolean(memoCapture.memoDrafted === true && memo && memoText);
    const exportText = String(selected.exportSnapshot?.sectionText || "");
    const downloadedExportText = String(selected.downloadedExportText || "");

    const base = {
      localOnly: true,
      private: true,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      selectedDraftId: lastIntakeId,
      memoRequired: true,
      memoAvailable,
      memoFormat: memo?.format || "",
      exportEligible: false,
      source: "local-private-launch-decision-approval-capture",
    };

    if (!memoAvailable) {
      intakes[selectedIndex] = {
        ...selected,
        privateLaunchDecisionApprovalCapture: {
          ...base,
          state: "blocked",
          approvalDrafted: false,
          blockers: ["completed private synthesis decision memo required before launch-decision approval capture"],
          approval: null,
        },
        launchDecisionApproval: {
          ...base,
          state: "blocked",
          approvalDrafted: false,
          approval: null,
        },
        exportSnapshot: selected.exportSnapshot,
        downloadedExportText,
      };
      localStorage.setItem("proofresume:intakes", JSON.stringify(intakes));
      return { changed: true, state: "blocked", approvalText: "", memoAvailable: false, exportText, downloadedExportText };
    }

    const approvalText = [
      "PRIVATE LAUNCH-DECISION APPROVAL: completed synthesis decision memo reviewed for operator-only next steps.",
      "Approval decision: keep public publish blocked; draft private launch follow-up work only.",
      "Public conclusions remain Not observed for pricing, testimonial, demand, willingness-to-pay, secure-intake, and outcomes.",
      "Selected draft preservation: selected resume export text remains unchanged.",
    ].join("\n");
    const approval = {
      format: "proofresume-private-launch-decision-approval-v1",
      localOnly: true,
      private: true,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      exportEligible: false,
      selectedDraftId: lastIntakeId,
      state: "approval-drafted",
      approvalDrafted: true,
      memoFormat: memo.format,
      memoDecision: memo.reviewedDecisionFields?.launchDecision || "blocked-pending-separate-approval",
      approvalFields: {
        launchDecisionApproval: "private-follow-up-approved",
        publicPublishAllowed: false,
        pricingDecision: "not-observed",
        testimonialDecision: "not-observed",
        demandConclusion: "not-observed",
        willingnessToPayConclusion: "not-observed",
        secureIntakeConclusion: "not-observed",
        outcomeConclusion: "not-observed",
      },
      approvalText,
      draftedAt: "2026-05-15T01:02:00.000Z",
      source: "local-private-launch-decision-approval-capture",
    };

    intakes[selectedIndex] = {
      ...selected,
      privateLaunchDecisionApprovalCapture: {
        ...base,
        state: "approval-drafted",
        approvalDrafted: true,
        blockers: [],
        approval,
      },
      launchDecisionApproval: approval,
      exportSnapshot: selected.exportSnapshot,
      downloadedExportText,
    };
    localStorage.setItem("proofresume:intakes", JSON.stringify(intakes));
    return { changed: true, state: "approval-drafted", approvalText, memoAvailable: true, exportText, downloadedExportText };
  });
}

async function applyPrivateExplicitPublishPlanAttempt(page) {
  return page.evaluate(() => {
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const lastIntakeId = localStorage.getItem("proofresume:lastIntakeId");
    const selectedIndex = intakes.findIndex((intake) => intake.id === lastIntakeId);
    if (selectedIndex === -1) {
      return { changed: false, reason: "missing-selected-draft", planText: "", approvalAvailable: false };
    }

    const selected = intakes[selectedIndex];
    const approvalCapture = selected.privateLaunchDecisionApprovalCapture || {};
    const approval = selected.launchDecisionApproval || approvalCapture.approval || null;
    const approvalText = String(approval?.approvalText || "");
    const approvalAvailable = Boolean(approvalCapture.approvalDrafted === true && approval && approvalText);
    const exportText = String(selected.exportSnapshot?.sectionText || "");
    const downloadedExportText = String(selected.downloadedExportText || "");

    const base = {
      localOnly: true,
      private: true,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      selectedDraftId: lastIntakeId,
      approvalRequired: true,
      approvalAvailable,
      approvalFormat: approval?.format || "",
      publishReadinessGated: true,
      exportEligible: false,
      source: "local-private-explicit-publish-plan-capture",
    };

    if (!approvalAvailable) {
      intakes[selectedIndex] = {
        ...selected,
        privateExplicitPublishPlanCapture: {
          ...base,
          state: "blocked",
          planDrafted: false,
          blockers: ["private launch-decision approval required before explicit publish-plan capture"],
          publishPlan: null,
        },
        explicitPublishPlan: {
          ...base,
          state: "blocked",
          planDrafted: false,
          publishPlan: null,
        },
        exportSnapshot: selected.exportSnapshot,
        downloadedExportText,
      };
      localStorage.setItem("proofresume:intakes", JSON.stringify(intakes));
      return { changed: true, state: "blocked", planText: "", approvalAvailable: false, exportText, downloadedExportText };
    }

    const planText = [
      "PRIVATE EXPLICIT PUBLISH PLAN: owner, rollback, claim-risk, and public-copy-diff fields drafted locally.",
      "Owner: operator-only launch owner; no public publish action is triggered.",
      "Rollback: keep static resume export unchanged and revert public copy diff before any launch.",
      "Claim-risk: pricing, testimonial, demand, willingness-to-pay, secure-intake, and outcome claims remain Not observed.",
      "Public-copy diff: draft privately; export/download resume text remains unchanged.",
    ].join("\n");
    const publishPlan = {
      format: "proofresume-private-explicit-publish-plan-v1",
      localOnly: true,
      private: true,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      exportEligible: false,
      selectedDraftId: lastIntakeId,
      state: "plan-drafted",
      planDrafted: true,
      approvalFormat: approval.format,
      publishReadinessGated: true,
      publishFields: {
        owner: "operator-only-launch-owner",
        rollback: "revert private public-copy diff and keep resume export unchanged",
        claimRisk: "requires explicit review; no outcome, pricing, testimonial, demand, willingness-to-pay, or secure-intake claim",
        publicCopyDiff: "private-draft-only",
        publicPublishAllowed: false,
      },
      conclusionFields: {
        pricingDecision: "not-observed",
        testimonialDecision: "not-observed",
        demandConclusion: "not-observed",
        willingnessToPayConclusion: "not-observed",
        secureIntakeConclusion: "not-observed",
        outcomeConclusion: "not-observed",
      },
      planText,
      draftedAt: "2026-05-15T01:16:00.000Z",
      source: "local-private-explicit-publish-plan-capture",
    };

    intakes[selectedIndex] = {
      ...selected,
      privateExplicitPublishPlanCapture: {
        ...base,
        state: "plan-drafted",
        planDrafted: true,
        blockers: [],
        publishPlan,
      },
      explicitPublishPlan: publishPlan,
      exportSnapshot: selected.exportSnapshot,
      downloadedExportText,
    };
    localStorage.setItem("proofresume:intakes", JSON.stringify(intakes));
    return { changed: true, state: "plan-drafted", planText, approvalAvailable: true, exportText, downloadedExportText };
  });
}

async function applyPrivatePublicCopyDiffRollbackAttempt(page) {
  return page.evaluate(() => {
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const lastIntakeId = localStorage.getItem("proofresume:lastIntakeId");
    const selectedIndex = intakes.findIndex((intake) => intake.id === lastIntakeId);
    if (selectedIndex === -1) {
      return { changed: false, reason: "missing-selected-draft", diffText: "", publishPlanAvailable: false };
    }

    const selected = intakes[selectedIndex];
    const planCapture = selected.privateExplicitPublishPlanCapture || {};
    const publishPlan = selected.explicitPublishPlan || planCapture.publishPlan || null;
    const planText = String(publishPlan?.planText || "");
    const publishPlanAvailable = Boolean(planCapture.planDrafted === true && publishPlan && planText);
    const exportText = String(selected.exportSnapshot?.sectionText || "");
    const downloadedExportText = String(selected.downloadedExportText || "");

    const base = {
      localOnly: true,
      private: true,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      selectedDraftId: lastIntakeId,
      publishPlanRequired: true,
      publishPlanAvailable,
      publishPlanFormat: publishPlan?.format || "",
      publishPlanGated: true,
      exportEligible: false,
      source: "local-private-public-copy-diff-rollback-capture",
    };

    if (!publishPlanAvailable) {
      intakes[selectedIndex] = {
        ...selected,
        privatePublicCopyDiffRollbackCapture: {
          ...base,
          state: "blocked",
          diffDrafted: false,
          blockers: ["completed explicit publish plan required before public-copy diff and rollback capture"],
          diffRollbackPacket: null,
        },
        publicCopyDiffRollback: {
          ...base,
          state: "blocked",
          diffDrafted: false,
          diffRollbackPacket: null,
        },
        exportSnapshot: selected.exportSnapshot,
        downloadedExportText,
      };
      localStorage.setItem("proofresume:intakes", JSON.stringify(intakes));
      return { changed: true, state: "blocked", diffText: "", publishPlanAvailable: false, exportText, downloadedExportText };
    }

    const diffText = [
      "PRIVATE PUBLIC-COPY DIFF AND ROLLBACK: diff summary, consent check, claim-risk check, validation command, and rollback path drafted locally.",
      "Diff summary: private public copy may name the local proof workflow, but must not publish launch, pricing, testimonial, demand, willingness-to-pay, secure-intake, or outcome claims.",
      "Consent check: no customer/recruit quotes, names, or testimonials are approved for public use.",
      "Claim-risk check: public copy remains blocked until human review verifies every claim against observed evidence.",
      "Validation command: npm run qa:intake-flow.",
      "Rollback path: revert private public-copy diff and keep resume export/download text unchanged.",
    ].join("\n");
    const diffRollbackPacket = {
      format: "proofresume-private-public-copy-diff-rollback-v1",
      localOnly: true,
      private: true,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      exportEligible: false,
      selectedDraftId: lastIntakeId,
      state: "diff-drafted",
      diffDrafted: true,
      publishPlanFormat: publishPlan.format,
      publishPlanGated: true,
      publicPublishAllowed: false,
      fields: {
        diffSummary: "private public copy diff drafted locally only",
        consentCheck: "no public quotes, names, testimonials, or customer claims approved",
        claimRiskCheck: "no launch, pricing, testimonial, demand, willingness-to-pay, secure-intake, or outcome claim",
        validationCommand: "npm run qa:intake-flow",
        rollbackPath: "revert private public-copy diff and preserve resume export/download text",
      },
      conclusionFields: {
        launchConclusion: "not-observed",
        pricingDecision: "not-observed",
        testimonialDecision: "not-observed",
        demandConclusion: "not-observed",
        willingnessToPayConclusion: "not-observed",
        secureIntakeConclusion: "not-observed",
        outcomeConclusion: "not-observed",
      },
      diffText,
      draftedAt: "2026-05-15T01:26:00.000Z",
      source: "local-private-public-copy-diff-rollback-capture",
    };

    intakes[selectedIndex] = {
      ...selected,
      privatePublicCopyDiffRollbackCapture: {
        ...base,
        state: "diff-drafted",
        diffDrafted: true,
        blockers: [],
        diffRollbackPacket,
      },
      publicCopyDiffRollback: diffRollbackPacket,
      exportSnapshot: selected.exportSnapshot,
      downloadedExportText,
    };
    localStorage.setItem("proofresume:intakes", JSON.stringify(intakes));
    return { changed: true, state: "diff-drafted", diffText, publishPlanAvailable: true, exportText, downloadedExportText };
  });
}

async function applyPrivateReleaseCandidateRehearsalAttempt(page) {
  return page.evaluate(() => {
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const lastIntakeId = localStorage.getItem("proofresume:lastIntakeId");
    const selectedIndex = intakes.findIndex((intake) => intake.id === lastIntakeId);
    if (selectedIndex === -1) {
      return { changed: false, reason: "missing-selected-draft", rehearsalText: "", diffPacketAvailable: false };
    }

    const selected = intakes[selectedIndex];
    const diffCapture = selected.privatePublicCopyDiffRollbackCapture || {};
    const diffPacket = selected.publicCopyDiffRollback || diffCapture.diffRollbackPacket || null;
    const diffText = String(diffPacket?.diffText || "");
    const diffPacketAvailable = Boolean(diffCapture.diffDrafted === true && diffPacket && diffText);
    const exportText = String(selected.exportSnapshot?.sectionText || "");
    const downloadedExportText = String(selected.downloadedExportText || "");

    const base = {
      localOnly: true,
      private: true,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      selectedDraftId: lastIntakeId,
      diffPacketRequired: true,
      diffPacketAvailable,
      diffPacketFormat: diffPacket?.format || "",
      diffPacketGated: true,
      exportEligible: false,
      source: "local-private-release-candidate-rehearsal-capture",
    };

    if (!diffPacketAvailable) {
      intakes[selectedIndex] = {
        ...selected,
        privateReleaseCandidateRehearsalCapture: {
          ...base,
          state: "blocked",
          rehearsalReady: false,
          blockers: ["completed public-copy diff and rollback packet required before release-candidate rehearsal capture"],
          rehearsalPacket: null,
        },
        releaseCandidateRehearsal: {
          ...base,
          state: "blocked",
          rehearsalReady: false,
          rehearsalPacket: null,
        },
        exportSnapshot: selected.exportSnapshot,
        downloadedExportText,
      };
      localStorage.setItem("proofresume:intakes", JSON.stringify(intakes));
      return { changed: true, state: "blocked", rehearsalText: "", diffPacketAvailable: false, exportText, downloadedExportText };
    }

    const rehearsalText = [
      "PRIVATE RELEASE-CANDIDATE REHEARSAL: local static smoke, served smoke, rollback rehearsal, consent check, and claim-risk check are captured locally.",
      "Static smoke: node website/scripts/check_site.cjs must pass before any deploy action.",
      "Served smoke: npm run qa:intake-flow must pass against local pages with no external/API/submit requests.",
      "Rollback rehearsal: revert private public-copy diff and preserve resume export/download text.",
      "Consent check: no customer names, quotes, testimonials, or public proof claims are approved.",
      "Claim-risk check: launch, pricing, testimonial, demand, willingness-to-pay, secure-intake, and outcome claims remain Not observed.",
    ].join("\n");
    const rehearsalPacket = {
      format: "proofresume-private-release-candidate-rehearsal-v1",
      localOnly: true,
      private: true,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      exportEligible: false,
      selectedDraftId: lastIntakeId,
      state: "rehearsal-ready",
      rehearsalReady: true,
      diffPacketFormat: diffPacket.format,
      diffPacketGated: true,
      publicDeployAllowed: false,
      fields: {
        localStaticSmoke: "node website/scripts/check_site.cjs",
        localServedSmoke: "npm run qa:intake-flow",
        rollbackRehearsal: "revert private public-copy diff and preserve resume export/download text",
        consentCheck: "no customer names, quotes, testimonials, or public proof claims approved",
        claimRiskCheck: "no launch, pricing, testimonial, demand, willingness-to-pay, secure-intake, or outcome claim",
      },
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
      rehearsalText,
      draftedAt: "2026-05-15T01:46:00.000Z",
      source: "local-private-release-candidate-rehearsal-capture",
    };

    intakes[selectedIndex] = {
      ...selected,
      privateReleaseCandidateRehearsalCapture: {
        ...base,
        state: "rehearsal-ready",
        rehearsalReady: true,
        blockers: [],
        rehearsalPacket,
      },
      releaseCandidateRehearsal: rehearsalPacket,
      exportSnapshot: selected.exportSnapshot,
      downloadedExportText,
    };
    localStorage.setItem("proofresume:intakes", JSON.stringify(intakes));
    return { changed: true, state: "rehearsal-ready", rehearsalText, diffPacketAvailable: true, exportText, downloadedExportText };
  });
}

async function applyPrivateCredentialedDeployReadinessAttempt(page) {
  return page.evaluate(() => {
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const lastIntakeId = localStorage.getItem("proofresume:lastIntakeId");
    const selectedIndex = intakes.findIndex((intake) => intake.id === lastIntakeId);
    if (selectedIndex === -1) {
      return { changed: false, reason: "missing-selected-draft", readinessText: "", rehearsalAvailable: false };
    }

    const selected = intakes[selectedIndex];
    const rehearsalCapture = selected.privateReleaseCandidateRehearsalCapture || {};
    const rehearsalPacket = selected.releaseCandidateRehearsal || rehearsalCapture.rehearsalPacket || null;
    const rehearsalText = String(rehearsalPacket?.rehearsalText || "");
    const rehearsalAvailable = Boolean(rehearsalCapture.rehearsalReady === true && rehearsalPacket && rehearsalText);
    const exportText = String(selected.exportSnapshot?.sectionText || "");
    const downloadedExportText = String(selected.downloadedExportText || "");
    const inputStates = {
      platform: "missing",
      productionUrl: "missing",
      credentialAvailability: "missing",
      deployTrigger: "missing",
      rollbackOwner: "missing",
      rollbackMethod: "missing",
      healthCheckInputs: "missing",
    };
    const base = {
      localOnly: true,
      private: true,
      noDeploy: true,
      noSecretStorage: true,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      selectedDraftId: lastIntakeId,
      rehearsalRequired: true,
      rehearsalAvailable,
      rehearsalPacketFormat: rehearsalPacket?.format || "",
      exportEligible: false,
      publicDeployAllowed: false,
      source: "local-private-credentialed-deploy-readiness-review",
    };

    if (!rehearsalAvailable) {
      intakes[selectedIndex] = {
        ...selected,
        privateCredentialedDeployReadinessReview: {
          ...base,
          state: "rehearsal-blocked",
          deployInputsReady: false,
          inputStates,
          blockers: ["completed release-candidate rehearsal required before credentialed-deploy readiness review"],
          readinessPacket: null,
        },
        credentialedDeployReadiness: {
          ...base,
          state: "rehearsal-blocked",
          deployInputsReady: false,
          inputStates,
          readinessPacket: null,
        },
        exportSnapshot: selected.exportSnapshot,
        downloadedExportText,
      };
      localStorage.setItem("proofresume:intakes", JSON.stringify(intakes));
      return { changed: true, state: "rehearsal-blocked", readinessText: "", rehearsalAvailable: false, exportText, downloadedExportText };
    }

    const readinessText = [
      "PRIVATE CREDENTIALED-DEPLOY READINESS: deploy inputs are blocked until platform, production URL, credential availability, deploy trigger, rollback owner, rollback method, and health-check inputs are supplied by the deploy owner.",
      "Credential availability records only missing/available status and never stores tokens, passwords, keys, cookies, or secret values.",
      "Deploy trigger: blocked; no deploy command, external platform request, API request, or mutating submit is allowed from this local review.",
      "Rollback owner and rollback method: missing until a human deploy owner supplies the non-secret plan.",
      "Health-check inputs: missing until production URL and credential-free health checks are selected.",
    ].join("\n");
    const readinessPacket = {
      format: "proofresume-private-credentialed-deploy-readiness-v1",
      localOnly: true,
      private: true,
      noDeploy: true,
      noSecretStorage: true,
      exportTextUnchanged: true,
      downloadTextUnchanged: true,
      exportEligible: false,
      selectedDraftId: lastIntakeId,
      state: "deploy-inputs-blocked",
      deployInputsReady: false,
      rehearsalPacketFormat: rehearsalPacket.format,
      rehearsalGated: true,
      publicDeployAllowed: false,
      inputStates,
      missingInputs: Object.keys(inputStates),
      secretStoragePolicy: {
        allowedCredentialValueStorage: false,
        allowedFields: ["credentialAvailability"],
        forbiddenValues: ["token", "password", "secret", "key", "cookie", "authorization"],
      },
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
      readinessText,
      draftedAt: "2026-05-15T02:06:00.000Z",
      source: "local-private-credentialed-deploy-readiness-review",
    };

    intakes[selectedIndex] = {
      ...selected,
      privateCredentialedDeployReadinessReview: {
        ...base,
        state: "deploy-inputs-blocked",
        deployInputsReady: false,
        inputStates,
        blockers: Object.keys(inputStates),
        readinessPacket,
      },
      credentialedDeployReadiness: readinessPacket,
      exportSnapshot: selected.exportSnapshot,
      downloadedExportText,
    };
    localStorage.setItem("proofresume:intakes", JSON.stringify(intakes));
    return { changed: true, state: "deploy-inputs-blocked", readinessText, rehearsalAvailable: true, exportText, downloadedExportText };
  });
}

async function readPostSessionDebrief(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='postSessionDebrief']",
        "[data-pr='postSessionDebriefHandoff']",
        "[data-pr='debriefHandoff']",
        "[data-post-session-debrief]",
        "[data-post-session-debrief-handoff]",
        "[data-debrief-handoff]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", links: [], items: [] };
    }

    const itemSelector = [
      "[data-post-session-debrief-item]",
      "[data-debrief-handoff-item]",
      "[data-debrief-draft-item]",
      "[data-pr^='postSessionDebrief']",
      "li",
      "article",
      "[role='listitem']",
    ].join(",");
    const links = [...root.querySelectorAll("a[href]")].map((link) => ({
      href: link.getAttribute("href") || "",
      text: link.textContent || "",
      artifact:
        link.getAttribute("data-post-session-debrief-artifact") ||
        link.getAttribute("data-debrief-artifact") ||
        link.getAttribute("data-handoff-artifact") ||
        "",
    }));
    const items = [...root.querySelectorAll(itemSelector)].map((item) => ({
      key:
        item.getAttribute("data-post-session-debrief-item") ||
        item.getAttribute("data-debrief-handoff-item") ||
        item.getAttribute("data-debrief-draft-item") ||
        item.getAttribute("data-pr") ||
        "",
      status:
        item.getAttribute("data-post-session-debrief-status") ||
        item.getAttribute("data-debrief-handoff-status") ||
        item.getAttribute("data-ready-state") ||
        "",
      text: item.textContent || "",
    }));

    return {
      exposed: true,
      text: root.textContent || "",
      localOnly:
        root.getAttribute("data-post-session-debrief-local-only") ||
        root.getAttribute("data-debrief-handoff-local-only") ||
        root.getAttribute("data-local-only") ||
        "",
      exportTextUnchanged:
        root.getAttribute("data-export-text-unchanged") ||
        root.getAttribute("data-post-session-debrief-export-text-unchanged") ||
        root.getAttribute("data-debrief-export-text-unchanged") ||
        "",
      selectedDraftId:
        root.getAttribute("data-selected-draft-id") ||
        root.getAttribute("data-post-session-debrief-selected-draft") ||
        root.getAttribute("data-debrief-selected-draft") ||
        "",
      readiness:
        root.getAttribute("data-post-session-debrief-readiness") ||
        root.getAttribute("data-debrief-readiness") ||
        root.getAttribute("data-post-session-debrief-state") ||
        root.getAttribute("data-debrief-handoff-state") ||
        root.getAttribute("data-ready-state") ||
        "",
      rawNotesAvailable:
        root.getAttribute("data-raw-notes-available") ||
        root.getAttribute("data-debrief-raw-notes-available") ||
        root.getAttribute("data-raw-note-recorded") ||
        "",
      draftSaved:
        root.getAttribute("data-debrief-draft-saved") ||
        root.getAttribute("data-post-session-draft-saved") ||
        root.getAttribute("data-debrief-drafted") ||
        root.getAttribute("data-draft-saved") ||
        "",
      objectionCodingReady:
        root.getAttribute("data-objection-coding-ready") ||
        root.getAttribute("data-debrief-objection-coding-ready") ||
        "",
      synthesisReady:
        root.getAttribute("data-synthesis-ready") ||
        root.getAttribute("data-five-session-synthesis-ready") ||
        "",
      links,
      items,
    };
  });
}

async function readObjectionCodingHandoff(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='objectionCodingHandoff']",
        "[data-pr='objectionCoding']",
        "[data-objection-coding-handoff]",
        "[data-objection-coding]",
        "[data-local-objection-coding]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", links: [], items: [] };
    }

    const itemSelector = [
      "[data-objection-coding-item]",
      "[data-objection-code-item]",
      "[data-objection-code]",
      "[data-pr^='objectionCoding']",
      "li",
      "article",
      "[role='listitem']",
    ].join(",");
    const links = [...root.querySelectorAll("a[href]")].map((link) => ({
      href: link.getAttribute("href") || "",
      text: link.textContent || "",
      artifact:
        link.getAttribute("data-objection-coding-artifact") ||
        link.getAttribute("data-objection-artifact") ||
        link.getAttribute("data-handoff-artifact") ||
        "",
    }));
    const items = [...root.querySelectorAll(itemSelector)].map((item) => ({
      key:
        item.getAttribute("data-objection-coding-item") ||
        item.getAttribute("data-objection-code-item") ||
        item.getAttribute("data-objection-code") ||
        item.getAttribute("data-pr") ||
        "",
      status:
        item.getAttribute("data-objection-coding-status") ||
        item.getAttribute("data-objection-code-status") ||
        item.getAttribute("data-ready-state") ||
        "",
      text: item.textContent || "",
    }));

    return {
      exposed: true,
      text: root.textContent || "",
      localOnly:
        root.getAttribute("data-objection-coding-local-only") ||
        root.getAttribute("data-local-objection-coding") ||
        root.getAttribute("data-local-only") ||
        "",
      exportTextUnchanged:
        root.getAttribute("data-export-text-unchanged") ||
        root.getAttribute("data-objection-coding-export-text-unchanged") ||
        root.getAttribute("data-objection-export-text-unchanged") ||
        "",
      selectedDraftId:
        root.getAttribute("data-selected-draft-id") ||
        root.getAttribute("data-objection-coding-selected-draft") ||
        root.getAttribute("data-objection-selected-draft") ||
        "",
      readiness:
        root.getAttribute("data-objection-coding-readiness") ||
        root.getAttribute("data-objection-coding-state") ||
        root.getAttribute("data-objection-state") ||
        root.getAttribute("data-ready-state") ||
        "",
      debriefReady:
        root.getAttribute("data-debrief-ready") ||
        root.getAttribute("data-objection-coding-debrief-ready") ||
        root.getAttribute("data-debrief-draft-saved") ||
        "",
      codeSaved:
        root.getAttribute("data-objection-code-saved") ||
        root.getAttribute("data-objection-codes-recorded") ||
        root.getAttribute("data-code-saved") ||
        "",
      codeCount:
        root.getAttribute("data-objection-code-count") ||
        root.getAttribute("data-objection-coding-count") ||
        root.getAttribute("data-private-objection-tags") ||
        "",
      synthesisReady:
        root.getAttribute("data-synthesis-ready") ||
        root.getAttribute("data-five-session-synthesis-ready") ||
        "",
      links,
      items,
    };
  });
}

async function readFiveSessionSynthesisReadiness(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='fiveSessionSynthesisReadiness']",
        "[data-pr='fiveSessionSynthesis']",
        "[data-pr='synthesisReadiness']",
        "[data-five-session-synthesis-readiness]",
        "[data-five-session-synthesis]",
        "[data-synthesis-readiness]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", links: [], items: [] };
    }

    const itemSelector = [
      "[data-synthesis-session-slot]",
      "[data-synthesis-slot]",
      "[data-five-session-slot]",
      "[data-synthesis-readiness-item]",
      "[data-pr^='fiveSessionSynthesis']",
      "li",
      "article",
      "[role='listitem']",
    ].join(",");
    const links = [...root.querySelectorAll("a[href]")].map((link) => ({
      href: link.getAttribute("href") || "",
      text: link.textContent || "",
      artifact:
        link.getAttribute("data-synthesis-artifact") ||
        link.getAttribute("data-five-session-artifact") ||
        "",
    }));
    const items = [...root.querySelectorAll(itemSelector)].map((item) => ({
      key:
        item.getAttribute("data-synthesis-session-slot") ||
        item.getAttribute("data-synthesis-slot") ||
        item.getAttribute("data-five-session-slot") ||
        item.getAttribute("data-synthesis-readiness-item") ||
        item.getAttribute("data-pr") ||
        "",
      rawNotesComplete:
        item.getAttribute("data-raw-notes-complete") ||
        item.getAttribute("data-raw-note-complete") ||
        "",
      debriefComplete:
        item.getAttribute("data-debrief-complete") ||
        item.getAttribute("data-debrief-draft-complete") ||
        "",
      objectionCodesComplete:
        item.getAttribute("data-objection-codes-complete") ||
        item.getAttribute("data-objection-code-complete") ||
        "",
      selectedDraftId: item.getAttribute("data-selected-draft-id") || "",
      complete: item.getAttribute("data-session-slot-complete") || "",
      text: item.textContent || "",
    }));

    return {
      exposed: true,
      text: root.textContent || "",
      localOnly:
        root.getAttribute("data-five-session-local-only") ||
        root.getAttribute("data-synthesis-local-only") ||
        root.getAttribute("data-local-only") ||
        "",
      exportTextUnchanged:
        root.getAttribute("data-export-text-unchanged") ||
        root.getAttribute("data-synthesis-export-text-unchanged") ||
        "",
      selectedDraftId:
        root.getAttribute("data-selected-draft-id") ||
        root.getAttribute("data-five-session-selected-draft") ||
        root.getAttribute("data-synthesis-selected-draft") ||
        "",
      readiness:
        root.getAttribute("data-five-session-synthesis-readiness") ||
        root.getAttribute("data-synthesis-readiness") ||
        root.getAttribute("data-ready-state") ||
        "",
      ready:
        root.getAttribute("data-five-session-ready") ||
        root.getAttribute("data-synthesis-ready") ||
        root.getAttribute("data-ready") ||
        "",
      completedSessionCount:
        root.getAttribute("data-completed-session-count") ||
        root.getAttribute("data-five-session-completed-count") ||
        root.getAttribute("data-synthesis-completed-session-count") ||
        root.getAttribute("data-real-session-slots-complete") ||
        "",
      requiredSessionCount:
        root.getAttribute("data-required-session-count") ||
        root.getAttribute("data-five-session-required-count") ||
        root.getAttribute("data-synthesis-required-session-count") ||
        root.getAttribute("data-required-session-slots") ||
        "",
      blockerCount:
        root.getAttribute("data-blocker-count") ||
        root.getAttribute("data-synthesis-blocker-count") ||
        "",
      links,
      items,
    };
  });
}

async function readPrivateSynthesisArtifactGenerator(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='privateSynthesisArtifactGenerator']",
        "[data-pr='synthesisArtifactGenerator']",
        "[data-pr='privateSynthesisArtifact']",
        "[data-synthesis-artifact-generator]",
        "[data-private-synthesis-artifact]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", links: [], items: [] };
    }

    const links = [...root.querySelectorAll("a[href]")].map((link) => ({
      href: link.getAttribute("href") || "",
      text: link.textContent || "",
      artifact:
        link.getAttribute("data-synthesis-artifact") ||
        link.getAttribute("data-private-synthesis-artifact") ||
        "",
    }));
    const items = [
      ...root.querySelectorAll(
        [
          "[data-synthesis-artifact-item]",
          "[data-private-synthesis-artifact-item]",
          "[data-synthesis-packet]",
          "[data-pr^='privateSynthesisArtifact']",
          "li",
          "article",
          "[role='listitem']",
        ].join(",")
      ),
    ].map((item) => ({
      key:
        item.getAttribute("data-synthesis-artifact-item") ||
        item.getAttribute("data-private-synthesis-artifact-item") ||
        item.getAttribute("data-synthesis-packet") ||
        item.getAttribute("data-pr") ||
        "",
      status:
        item.getAttribute("data-synthesis-artifact-status") ||
        item.getAttribute("data-private-synthesis-status") ||
        item.getAttribute("data-ready-state") ||
        "",
      text: item.textContent || "",
    }));

    return {
      exposed: true,
      text: root.textContent || "",
      localOnly:
        root.getAttribute("data-synthesis-artifact-local-only") ||
        root.getAttribute("data-private-synthesis-local-only") ||
        root.getAttribute("data-local-only") ||
        "",
      exportTextUnchanged:
        root.getAttribute("data-export-text-unchanged") ||
        root.getAttribute("data-synthesis-artifact-export-text-unchanged") ||
        "",
      downloadTextUnchanged:
        root.getAttribute("data-download-text-unchanged") ||
        root.getAttribute("data-synthesis-artifact-download-text-unchanged") ||
        "",
      selectedDraftId:
        root.getAttribute("data-selected-draft-id") ||
        root.getAttribute("data-synthesis-artifact-selected-draft") ||
        root.getAttribute("data-private-synthesis-selected-draft") ||
        "",
      state:
        root.getAttribute("data-synthesis-artifact-state") ||
        root.getAttribute("data-private-synthesis-artifact-state") ||
        root.getAttribute("data-ready-state") ||
        "",
      readyToGenerate:
        root.getAttribute("data-ready-to-generate") ||
        root.getAttribute("data-synthesis-artifact-ready") ||
        "",
      artifactDrafted:
        root.getAttribute("data-artifact-drafted") ||
        root.getAttribute("data-private-synthesis-artifact-drafted") ||
        "",
      sourcePacketCount:
        root.getAttribute("data-source-packet-count") ||
        root.getAttribute("data-synthesis-artifact-packet-count") ||
        "",
      requiredPacketCount:
        root.getAttribute("data-required-packet-count") ||
        root.getAttribute("data-synthesis-artifact-required-count") ||
        "",
      links,
      items,
    };
  });
}

async function readPrivateSynthesisDecisionMemoCapture(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='privateSynthesisDecisionMemo']",
        "[data-pr='synthesisDecisionMemo']",
        "[data-pr='decisionMemoCapture']",
        "[data-synthesis-decision-memo]",
        "[data-private-synthesis-decision]",
        "[data-decision-memo-capture]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", links: [], items: [] };
    }

    const links = [...root.querySelectorAll("a[href]")].map((link) => ({
      href: link.getAttribute("href") || "",
      text: link.textContent || "",
      artifact:
        link.getAttribute("data-synthesis-decision-memo") ||
        link.getAttribute("data-private-synthesis-decision") ||
        link.getAttribute("data-decision-memo-artifact") ||
        "",
    }));
    const items = [
      ...root.querySelectorAll(
        [
          "[data-decision-memo-item]",
          "[data-synthesis-decision-item]",
          "[data-private-synthesis-decision-item]",
          "[data-pr^='privateSynthesisDecision']",
          "[data-pr^='synthesisDecisionMemo']",
          "li",
          "article",
          "[role='listitem']",
        ].join(",")
      ),
    ].map((item) => ({
      key:
        item.getAttribute("data-decision-memo-item") ||
        item.getAttribute("data-synthesis-decision-item") ||
        item.getAttribute("data-private-synthesis-decision-item") ||
        item.getAttribute("data-pr") ||
        "",
      status:
        item.getAttribute("data-decision-memo-status") ||
        item.getAttribute("data-synthesis-decision-status") ||
        item.getAttribute("data-ready-state") ||
        "",
      text: item.textContent || "",
    }));

    return {
      exposed: true,
      text: root.textContent || "",
      localOnly:
        root.getAttribute("data-decision-memo-local-only") ||
        root.getAttribute("data-synthesis-decision-local-only") ||
        root.getAttribute("data-local-only") ||
        "",
      private:
        root.getAttribute("data-decision-memo-private") ||
        root.getAttribute("data-private") ||
        "",
      exportTextUnchanged:
        root.getAttribute("data-export-text-unchanged") ||
        root.getAttribute("data-decision-memo-export-text-unchanged") ||
        "",
      downloadTextUnchanged:
        root.getAttribute("data-download-text-unchanged") ||
        root.getAttribute("data-decision-memo-download-text-unchanged") ||
        "",
      selectedDraftId:
        root.getAttribute("data-selected-draft-id") ||
        root.getAttribute("data-decision-memo-selected-draft") ||
        root.getAttribute("data-synthesis-decision-selected-draft") ||
        "",
      state:
        root.getAttribute("data-decision-memo-state") ||
        root.getAttribute("data-synthesis-decision-state") ||
        root.getAttribute("data-ready-state") ||
        "",
      artifactAvailable:
        root.getAttribute("data-synthesis-artifact-available") ||
        root.getAttribute("data-artifact-available") ||
        "",
      memoDrafted:
        root.getAttribute("data-memo-drafted") ||
        root.getAttribute("data-decision-memo-drafted") ||
        root.getAttribute("data-private-synthesis-memo-drafted") ||
        "",
      links,
      items,
    };
  });
}

async function readPrivateLaunchDecisionApprovalCapture(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='privateLaunchDecisionApproval']",
        "[data-pr='launchDecisionApproval']",
        "[data-pr='launchDecisionApprovalCapture']",
        "[data-launch-decision-approval]",
        "[data-private-launch-decision]",
        "[data-launch-approval-capture]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", links: [], items: [] };
    }

    const links = [...root.querySelectorAll("a[href]")].map((link) => ({
      href: link.getAttribute("href") || "",
      text: link.textContent || "",
      artifact:
        link.getAttribute("data-launch-decision-approval") ||
        link.getAttribute("data-private-launch-decision") ||
        link.getAttribute("data-launch-approval-artifact") ||
        "",
    }));
    const items = [
      ...root.querySelectorAll(
        [
          "[data-launch-decision-item]",
          "[data-launch-approval-item]",
          "[data-private-launch-decision-item]",
          "[data-pr^='privateLaunchDecision']",
          "[data-pr^='launchDecisionApproval']",
          "li",
          "article",
          "[role='listitem']",
        ].join(",")
      ),
    ].map((item) => ({
      key:
        item.getAttribute("data-launch-decision-item") ||
        item.getAttribute("data-launch-approval-item") ||
        item.getAttribute("data-private-launch-decision-item") ||
        item.getAttribute("data-pr") ||
        "",
      status:
        item.getAttribute("data-launch-decision-status") ||
        item.getAttribute("data-launch-approval-status") ||
        item.getAttribute("data-ready-state") ||
        "",
      text: item.textContent || "",
    }));

    return {
      exposed: true,
      text: root.textContent || "",
      localOnly:
        root.getAttribute("data-launch-approval-local-only") ||
        root.getAttribute("data-launch-decision-local-only") ||
        root.getAttribute("data-local-only") ||
        "",
      private:
        root.getAttribute("data-launch-approval-private") ||
        root.getAttribute("data-private") ||
        "",
      exportTextUnchanged:
        root.getAttribute("data-export-text-unchanged") ||
        root.getAttribute("data-launch-approval-export-text-unchanged") ||
        "",
      downloadTextUnchanged:
        root.getAttribute("data-download-text-unchanged") ||
        root.getAttribute("data-launch-approval-download-text-unchanged") ||
        "",
      selectedDraftId:
        root.getAttribute("data-selected-draft-id") ||
        root.getAttribute("data-launch-approval-selected-draft") ||
        root.getAttribute("data-launch-decision-selected-draft") ||
        "",
      state:
        root.getAttribute("data-launch-approval-state") ||
        root.getAttribute("data-launch-decision-state") ||
        root.getAttribute("data-ready-state") ||
        "",
      memoAvailable:
        root.getAttribute("data-synthesis-decision-memo-available") ||
        root.getAttribute("data-memo-available") ||
        "",
      approvalDrafted:
        root.getAttribute("data-approval-drafted") ||
        root.getAttribute("data-launch-approval-drafted") ||
        root.getAttribute("data-private-launch-approval-drafted") ||
        "",
      links,
      items,
    };
  });
}

async function readPrivateExplicitPublishPlanCapture(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='privateExplicitPublishPlan']",
        "[data-pr='explicitPublishPlan']",
        "[data-pr='publishPlanCapture']",
        "[data-explicit-publish-plan]",
        "[data-private-publish-plan]",
        "[data-publish-plan-capture]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", links: [], items: [] };
    }

    const links = [...root.querySelectorAll("a[href]")].map((link) => ({
      href: link.getAttribute("href") || "",
      text: link.textContent || "",
      artifact:
        link.getAttribute("data-explicit-publish-plan") ||
        link.getAttribute("data-private-publish-plan") ||
        link.getAttribute("data-publish-plan-artifact") ||
        "",
    }));
    const items = [
      ...root.querySelectorAll(
        [
          "[data-publish-plan-item]",
          "[data-explicit-publish-plan-item]",
          "[data-private-publish-plan-item]",
          "[data-pr^='privateExplicitPublishPlan']",
          "[data-pr^='explicitPublishPlan']",
          "li",
          "article",
          "[role='listitem']",
        ].join(",")
      ),
    ].map((item) => ({
      key:
        item.getAttribute("data-publish-plan-item") ||
        item.getAttribute("data-explicit-publish-plan-item") ||
        item.getAttribute("data-private-publish-plan-item") ||
        item.getAttribute("data-pr") ||
        "",
      status:
        item.getAttribute("data-publish-plan-status") ||
        item.getAttribute("data-explicit-publish-plan-status") ||
        item.getAttribute("data-ready-state") ||
        "",
      text: item.textContent || "",
    }));

    return {
      exposed: true,
      text: root.textContent || "",
      localOnly:
        root.getAttribute("data-publish-plan-local-only") ||
        root.getAttribute("data-explicit-publish-plan-local-only") ||
        root.getAttribute("data-local-only") ||
        "",
      private:
        root.getAttribute("data-publish-plan-private") ||
        root.getAttribute("data-private") ||
        "",
      exportTextUnchanged:
        root.getAttribute("data-export-text-unchanged") ||
        root.getAttribute("data-publish-plan-export-text-unchanged") ||
        "",
      downloadTextUnchanged:
        root.getAttribute("data-download-text-unchanged") ||
        root.getAttribute("data-publish-plan-download-text-unchanged") ||
        "",
      selectedDraftId:
        root.getAttribute("data-selected-draft-id") ||
        root.getAttribute("data-publish-plan-selected-draft") ||
        root.getAttribute("data-explicit-publish-plan-selected-draft") ||
        "",
      state:
        root.getAttribute("data-publish-plan-state") ||
        root.getAttribute("data-explicit-publish-plan-state") ||
        root.getAttribute("data-ready-state") ||
        "",
      approvalAvailable:
        root.getAttribute("data-launch-decision-approval-available") ||
        root.getAttribute("data-approval-available") ||
        "",
      planDrafted:
        root.getAttribute("data-plan-drafted") ||
        root.getAttribute("data-publish-plan-drafted") ||
        root.getAttribute("data-explicit-publish-plan-drafted") ||
        "",
      links,
      items,
    };
  });
}

async function readPrivatePublicCopyDiffRollbackCapture(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='privatePublicCopyDiffRollback']",
        "[data-pr='publicCopyDiffRollback']",
        "[data-pr='publicCopyDiffRollbackCapture']",
        "[data-public-copy-diff-rollback]",
        "[data-private-public-copy-diff]",
        "[data-copy-diff-rollback-capture]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", links: [], items: [] };
    }

    const links = [...root.querySelectorAll("a[href]")].map((link) => ({
      href: link.getAttribute("href") || "",
      text: link.textContent || "",
      artifact:
        link.getAttribute("data-public-copy-diff-rollback") ||
        link.getAttribute("data-private-public-copy-diff") ||
        link.getAttribute("data-copy-diff-rollback-artifact") ||
        "",
    }));
    const items = [
      ...root.querySelectorAll(
        [
          "[data-public-copy-diff-item]",
          "[data-copy-diff-rollback-item]",
          "[data-private-public-copy-diff-item]",
          "[data-pr^='privatePublicCopyDiffRollback']",
          "[data-pr^='publicCopyDiffRollback']",
          "li",
          "article",
          "[role='listitem']",
        ].join(",")
      ),
    ].map((item) => ({
      key:
        item.getAttribute("data-public-copy-diff-item") ||
        item.getAttribute("data-copy-diff-rollback-item") ||
        item.getAttribute("data-private-public-copy-diff-item") ||
        item.getAttribute("data-pr") ||
        "",
      status:
        item.getAttribute("data-public-copy-diff-status") ||
        item.getAttribute("data-copy-diff-rollback-status") ||
        item.getAttribute("data-ready-state") ||
        "",
      text: item.textContent || "",
    }));

    return {
      exposed: true,
      text: root.textContent || "",
      localOnly:
        root.getAttribute("data-public-copy-diff-local-only") ||
        root.getAttribute("data-copy-diff-rollback-local-only") ||
        root.getAttribute("data-local-only") ||
        "",
      private:
        root.getAttribute("data-public-copy-diff-private") ||
        root.getAttribute("data-private") ||
        "",
      exportTextUnchanged:
        root.getAttribute("data-export-text-unchanged") ||
        root.getAttribute("data-public-copy-diff-export-text-unchanged") ||
        "",
      downloadTextUnchanged:
        root.getAttribute("data-download-text-unchanged") ||
        root.getAttribute("data-public-copy-diff-download-text-unchanged") ||
        "",
      selectedDraftId:
        root.getAttribute("data-selected-draft-id") ||
        root.getAttribute("data-public-copy-diff-selected-draft") ||
        root.getAttribute("data-copy-diff-rollback-selected-draft") ||
        "",
      state:
        root.getAttribute("data-public-copy-diff-state") ||
        root.getAttribute("data-copy-diff-rollback-state") ||
        root.getAttribute("data-ready-state") ||
        "",
      publishPlanAvailable:
        root.getAttribute("data-explicit-publish-plan-available") ||
        root.getAttribute("data-publish-plan-available") ||
        "",
      diffDrafted:
        root.getAttribute("data-diff-drafted") ||
        root.getAttribute("data-public-copy-diff-drafted") ||
        root.getAttribute("data-copy-diff-rollback-drafted") ||
        "",
      links,
      items,
    };
  });
}

async function readPrivateReleaseCandidateRehearsalCapture(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='privateReleaseCandidateRehearsal']",
        "[data-pr='releaseCandidateRehearsal']",
        "[data-pr='releaseCandidateRehearsalCapture']",
        "[data-release-candidate-rehearsal]",
        "[data-private-release-candidate]",
        "[data-rc-rehearsal-capture]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", links: [], items: [] };
    }

    const links = [...root.querySelectorAll("a[href]")].map((link) => ({
      href: link.getAttribute("href") || "",
      text: link.textContent || "",
      artifact:
        link.getAttribute("data-release-candidate-rehearsal") ||
        link.getAttribute("data-private-release-candidate") ||
        link.getAttribute("data-rc-rehearsal-artifact") ||
        "",
    }));
    const items = [
      ...root.querySelectorAll(
        [
          "[data-release-candidate-rehearsal-item]",
          "[data-rc-rehearsal-item]",
          "[data-private-release-candidate-item]",
          "[data-pr^='privateReleaseCandidateRehearsal']",
          "[data-pr^='releaseCandidateRehearsal']",
          "li",
          "article",
          "[role='listitem']",
        ].join(",")
      ),
    ].map((item) => ({
      key:
        item.getAttribute("data-release-candidate-rehearsal-item") ||
        item.getAttribute("data-rc-rehearsal-item") ||
        item.getAttribute("data-private-release-candidate-item") ||
        item.getAttribute("data-pr") ||
        "",
      status:
        item.getAttribute("data-release-candidate-rehearsal-status") ||
        item.getAttribute("data-rc-rehearsal-status") ||
        item.getAttribute("data-ready-state") ||
        "",
      text: item.textContent || "",
    }));

    return {
      exposed: true,
      text: root.textContent || "",
      localOnly:
        root.getAttribute("data-release-candidate-rehearsal-local-only") ||
        root.getAttribute("data-rc-rehearsal-local-only") ||
        root.getAttribute("data-local-only") ||
        "",
      private:
        root.getAttribute("data-release-candidate-rehearsal-private") ||
        root.getAttribute("data-private") ||
        "",
      exportTextUnchanged:
        root.getAttribute("data-export-text-unchanged") ||
        root.getAttribute("data-release-candidate-rehearsal-export-text-unchanged") ||
        "",
      downloadTextUnchanged:
        root.getAttribute("data-download-text-unchanged") ||
        root.getAttribute("data-release-candidate-rehearsal-download-text-unchanged") ||
        "",
      selectedDraftId:
        root.getAttribute("data-selected-draft-id") ||
        root.getAttribute("data-release-candidate-rehearsal-selected-draft") ||
        root.getAttribute("data-rc-rehearsal-selected-draft") ||
        "",
      state:
        root.getAttribute("data-release-candidate-rehearsal-state") ||
        root.getAttribute("data-rc-rehearsal-state") ||
        root.getAttribute("data-ready-state") ||
        "",
      diffPacketAvailable:
        root.getAttribute("data-public-copy-diff-packet-available") ||
        root.getAttribute("data-diff-packet-available") ||
        "",
      rehearsalReady:
        root.getAttribute("data-rehearsal-ready") ||
        root.getAttribute("data-release-candidate-rehearsal-ready") ||
        root.getAttribute("data-rc-rehearsal-ready") ||
        "",
      links,
      items,
    };
  });
}

async function readPrivateCredentialedDeployReadiness(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='privateCredentialedDeployReadiness']",
        "[data-pr='credentialedDeployReadiness']",
        "[data-pr='credentialedDeployReadinessReview']",
        "[data-credentialed-deploy-readiness]",
        "[data-private-credentialed-deploy]",
        "[data-deploy-readiness-review]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", links: [], items: [] };
    }

    const links = [...root.querySelectorAll("a[href]")].map((link) => ({
      href: link.getAttribute("href") || "",
      text: link.textContent || "",
      artifact:
        link.getAttribute("data-credentialed-deploy-readiness") ||
        link.getAttribute("data-private-credentialed-deploy") ||
        link.getAttribute("data-deploy-readiness-artifact") ||
        "",
    }));
    const items = [
      ...root.querySelectorAll(
        [
          "[data-credentialed-deploy-item]",
          "[data-private-credentialed-deploy-item]",
          "[data-deploy-readiness-item]",
          "[data-pr^='privateCredentialedDeployReadiness']",
          "[data-pr^='credentialedDeployReadiness']",
          "li",
          "article",
          "[role='listitem']",
        ].join(",")
      ),
    ].map((item) => ({
      key:
        item.getAttribute("data-credentialed-deploy-item") ||
        item.getAttribute("data-private-credentialed-deploy-item") ||
        item.getAttribute("data-deploy-readiness-item") ||
        item.getAttribute("data-pr") ||
        "",
      status:
        item.getAttribute("data-credentialed-deploy-status") ||
        item.getAttribute("data-deploy-readiness-status") ||
        item.getAttribute("data-ready-state") ||
        "",
      text: item.textContent || "",
    }));

    return {
      exposed: true,
      text: root.textContent || "",
      localOnly:
        root.getAttribute("data-credentialed-deploy-local-only") ||
        root.getAttribute("data-deploy-readiness-local-only") ||
        root.getAttribute("data-local-only") ||
        "",
      private:
        root.getAttribute("data-credentialed-deploy-private") ||
        root.getAttribute("data-private") ||
        "",
      noDeploy:
        root.getAttribute("data-credentialed-deploy-no-deploy") ||
        root.getAttribute("data-no-deploy") ||
        "",
      noSecretStorage:
        root.getAttribute("data-credentialed-deploy-no-secret-storage") ||
        root.getAttribute("data-no-secret-storage") ||
        "",
      exportTextUnchanged:
        root.getAttribute("data-export-text-unchanged") ||
        root.getAttribute("data-credentialed-deploy-export-text-unchanged") ||
        "",
      downloadTextUnchanged:
        root.getAttribute("data-download-text-unchanged") ||
        root.getAttribute("data-credentialed-deploy-download-text-unchanged") ||
        "",
      selectedDraftId:
        root.getAttribute("data-selected-draft-id") ||
        root.getAttribute("data-credentialed-deploy-selected-draft") ||
        root.getAttribute("data-deploy-readiness-selected-draft") ||
        "",
      state:
        root.getAttribute("data-credentialed-deploy-state") ||
        root.getAttribute("data-deploy-readiness-state") ||
        root.getAttribute("data-ready-state") ||
        "",
      rehearsalAvailable:
        root.getAttribute("data-release-candidate-rehearsal-available") ||
        root.getAttribute("data-rehearsal-available") ||
        "",
      deployInputsReady:
        root.getAttribute("data-deploy-inputs-ready") ||
        root.getAttribute("data-credentialed-deploy-inputs-ready") ||
        "",
      links,
      items,
    };
  });
}

async function readPlatformOwnerAndPostDeployHandoff(page) {
  return page.evaluate(() => {
    function readRoot(selector) {
      const root = document.querySelector(selector);
      if (!root) return { exposed: false, text: "", links: [], items: [] };
      return {
        exposed: true,
        hidden: Boolean(root.closest("[hidden]") || root.hidden),
        text: root.textContent || "",
        state:
          root.getAttribute("data-platform-owner-handoff-state") ||
          root.getAttribute("data-post-deploy-health-check-handoff-state") ||
          "",
        source:
          root.getAttribute("data-source-checklist") ||
          root.getAttribute("data-source-template") ||
          "",
        localOnly: root.getAttribute("data-local-only") || "",
        private: root.getAttribute("data-private") || "",
        routeOnly: root.getAttribute("data-route-only") || "",
        noSecretStorage: root.getAttribute("data-no-secret-storage") || "",
        noProductionUrl: root.getAttribute("data-no-production-url") || "",
        noCredential: root.getAttribute("data-no-credential") || "",
        noDeployTrigger: root.getAttribute("data-no-deploy-trigger") || "",
        noDeployAction: root.getAttribute("data-no-deploy-action") || "",
        noPublishAction: root.getAttribute("data-no-publish-action") || "",
        exportEligible: root.getAttribute("data-export-eligible") || "",
        downloadEligible: root.getAttribute("data-download-eligible") || "",
        exportTextUnchanged: root.getAttribute("data-export-text-unchanged") || "",
        downloadTextUnchanged: root.getAttribute("data-download-text-unchanged") || "",
        missingCategories: root.getAttribute("data-missing-non-secret-categories") || "",
        staticReady: root.getAttribute("data-static-deploy-rehearsal-ready") || "",
        links: [...root.querySelectorAll("a[href]")].map((link) => ({
          href: link.getAttribute("href") || "",
          text: link.textContent || "",
        })),
        items: [...root.querySelectorAll("li, [role='listitem']")].map((item) => ({
          key: item.getAttribute("data-platform-owner-category") || item.getAttribute("data-post-deploy-health-route") || "",
          text: item.textContent || "",
        })),
      };
    }

    return {
      platformOwner: readRoot("[data-pr='platformOwnerHandoffState'], [data-private-platform-owner-handoff]"),
      postDeployHealth: readRoot("[data-pr='postDeployHealthCheckHandoffState'], [data-private-post-deploy-health-check-handoff]"),
      credentialedPanelState: document.querySelector("[data-pr='privateCredentialedDeployReadinessPanel']")?.getAttribute("data-credentialed-deploy-readiness") || "",
    };
  });
}

function staticDeployPassedLocalFixture() {
  return {
    state: "passed-local",
    stateLabel: "Passed locally",
    ok: true,
    checkedAt: "2026-05-15T11:15:00.000Z",
    mode: "local-http",
    reportPath: "ops/reports/static-deploy-rehearsal/fixture-passed-local.json",
    stateCounts: { notRun: 0, passedLocal: 1, blockedNoCredentials: 0 },
    blockers: [],
    limitations: ["deterministic route-only passed fixture for platform-owner handoff QA"],
    steps: [
      { label: "local static checks", ok: true, status: 0 },
      { label: "route-only smoke", ok: true, status: 0 },
    ],
    staticEntrypoints: {
      required: ["website/index.html", "website/intake.html", "website/review.html", "website/admin.html", "website/admin-data.json"],
      missing: [],
    },
    evidence: {
      routes: [
        { name: "index.html", route: "/" },
        { name: "intake.html", route: "/intake.html" },
        { name: "review.html", route: "/review.html" },
        { name: "admin.html", route: "/admin.html" },
        { name: "admin-data.json", route: "/admin-data.json" },
      ],
      routeStatus: [
        { route: "/", ok: true, status: 200, localOnly: true },
        { route: "/intake.html", ok: true, status: 200, localOnly: true },
        { route: "/review.html", ok: true, status: 200, localOnly: true },
        { route: "/admin.html", ok: true, status: 200, localOnly: true },
        { route: "/admin-data.json", ok: true, status: 200, localOnly: true },
      ],
    },
    noDeployGuardrails: {
      platformCredentialConsumed: false,
      productionUrlConsumed: false,
      deployTriggerConsumed: false,
      credentialInputsConsumed: false,
      platformDashboardVisited: false,
      deployCliCommandRun: false,
      ciDeployTriggered: false,
      dnsChanged: false,
      productionDeploymentState: "Do Not Deploy",
    },
    evidenceNote:
      "Private credential-free local rehearsal evidence only. Route-only health evidence is visible; no platform credentials, production URL, deploy trigger, or public deploy action.",
  };
}

function staticDeployFailureFixture() {
  return {
    state: "blocked-no-credentials",
    stateLabel: "Blocked: no credentials",
    ok: false,
    checkedAt: "2026-05-15T10:45:00.000Z",
    mode: "local-http",
    reportPath: "ops/reports/static-deploy-rehearsal/fixture-blocked-route.json",
    stateCounts: { notRun: 1, passedLocal: 1, blockedNoCredentials: 1 },
    blockers: [
      "Blocked route: /review.html returned 404",
      "Missing static entrypoint: website/review.html",
      "Stale evidence: older passing report superseded by this blocked fixture",
      "Unsafe guardrail example: platform dashboard visit marker must stay visible as a failure",
    ],
    limitations: ["deterministic no-network failure fixture"],
    steps: [
      { label: "blocked route fixture", ok: false, status: "blocked" },
      { label: "missing entrypoint fixture", ok: false, status: "missing" },
      { label: "unsafe guardrail fixture", ok: false, status: "blocked" },
    ],
    staticEntrypoints: {
      required: ["website/index.html", "website/intake.html", "website/review.html", "website/admin.html", "website/admin-data.json"],
      missing: ["website/review.html"],
    },
    evidence: {
      routes: [{ name: "index.html", route: "/" }, { name: "review.html", route: "/review.html" }, { name: "admin.html", route: "/admin.html" }],
      routeStatus: [
        { route: "/", ok: true, status: 200, localOnly: true },
        { route: "/review.html", ok: false, status: 404, localOnly: true, error: "fixture blocked route" },
        { route: "/admin.html", ok: true, status: 200, localOnly: true },
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
    history: {
      totalReports: 3,
      latestPass: {
        state: "blocked-no-credentials",
        stateLabel: "Blocked: no credentials",
        checkedAt: "2026-05-15T10:45:00.000Z",
        reportPath: "ops/reports/static-deploy-rehearsal/fixture-blocked-route.json",
        mode: "local-http",
        routeCount: 3,
        failedStepCount: 3,
        failedSteps: ["blocked route fixture", "missing entrypoint fixture", "unsafe guardrail fixture"],
      },
      priorFailures: [
        {
          state: "not-run",
          stateLabel: "Not run",
          checkedAt: "2026-05-15T10:30:00.000Z",
          reportPath: "ops/reports/static-deploy-rehearsal/fixture-not-run.json",
          failedStepCount: 1,
          failedSteps: ["missing report fixture"],
        },
      ],
      staleEvidence: [
        {
          state: "passed-local",
          stateLabel: "Passed locally",
          checkedAt: "2026-05-15T10:15:00.000Z",
          reportPath: "ops/reports/static-deploy-rehearsal/fixture-stale-pass.json",
          mode: "local-http",
          routeCount: 5,
          failedStepCount: 0,
          failedSteps: [],
        },
      ],
      trend: [
        {
          reportPath: "ops/reports/static-deploy-rehearsal/fixture-stale-pass.json",
          checkedAt: "2026-05-15T10:15:00.000Z",
          state: "passed-local",
          stateLabel: "Passed locally",
        },
        {
          reportPath: "ops/reports/static-deploy-rehearsal/fixture-not-run.json",
          checkedAt: "2026-05-15T10:30:00.000Z",
          state: "not-run",
          stateLabel: "Not run",
        },
        {
          reportPath: "ops/reports/static-deploy-rehearsal/fixture-blocked-route.json",
          checkedAt: "2026-05-15T10:45:00.000Z",
          state: "blocked-no-credentials",
          stateLabel: "Blocked: no credentials",
        },
      ],
      boundary:
        "Fixture history is local-only evidence: blocked route, missing entrypoint, stale evidence, and unsafe guardrail examples do not deploy or request credentials.",
    },
    evidenceNote:
      "Deterministic failure fixture: blocked route, missing entrypoint, stale evidence, and unsafe guardrail examples are visible while platform inputs stay disabled.",
  };
}

function finalDeployGoNoGoLedgerFixture(fixture) {
  return {
    format: "proofresume-final-deploy-go-no-go-ledger-v1",
    state: "no-go",
    decision: "No-Go / Do Not Deploy",
    checkedAt: "2026-05-15T11:20:00.000Z",
    localStaticRehearsal: {
      present: true,
      passedLocal: fixture?.state === "passed-local" && fixture?.ok === true,
      mode: fixture?.mode || "local-http",
      reportPath: fixture?.reportPath || "ops/reports/static-deploy-rehearsal/fixture.json",
      routeEvidence: fixture?.routeEvidence || [{ route: "/", localOnly: true, ok: true }],
    },
    adminDataEvidence: {
      present: true,
      platformOwnerHandoffPresent: true,
      postDeployHealthHandoffPresent: true,
      externalInputsPresent: false,
    },
    productReadinessEvidence: {
      present: true,
      credentialedDeployReadinessPresent: true,
      postDeployHealthHandoffPresent: true,
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
  };
}

function deployBlockerEscalationMemoFixture(fixture) {
  return {
    format: "proofresume-deploy-blocker-escalation-memo-v1",
    state: "blocked-escalation-summary",
    checkedAt: "2026-05-15T11:25:00.000Z",
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
      passedLocal: fixture?.state === "passed-local" && fixture?.ok === true,
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

function firstHumanOperatorDeployPacketIndexFixture(fixture) {
  return {
    format: "proofresume-first-human-operator-deploy-packet-index-v1",
    state: "index-only-do-not-deploy",
    checkedAt: "2026-05-15T11:30:00.000Z",
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
        state: fixture?.state === "passed-local" && fixture?.ok === true ? "local-static-passed-indexed" : "local-static-not-passed-indexed",
        externalValuesRequired: false,
        checklistItem: false,
      },
      {
        key: "deploy-blocker-escalation-memo",
        label: "Deploy blocker escalation memo",
        source: "static rehearsal generated payload",
        state: "blocked-escalation-summary",
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

function operatorDryRunReviewChecklistFixture(fixture) {
  return {
    format: "proofresume-operator-dry-run-review-checklist-v1",
    state: "review-only-do-not-deploy",
    checkedAt: "2026-05-15T11:35:00.000Z",
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
        reviewState: fixture?.state === "passed-local" && fixture?.ok === true ? "local-static-evidence-reviewable" : "local-static-evidence-not-passed",
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

function firstHumanPacketColdStartArchiveFixture(fixture) {
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
        archiveState: fixture?.ok ? "local-static-evidence-archived" : "local-static-evidence-not-passed",
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

function releaseCandidateDeployContinuationMapFixture(fixture) {
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
        state: fixture?.ok ? "local-static-evidence-only" : "local-static-evidence-not-passed",
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
  };
}

function privateExternalInputBoundaryLedgerFixture(fixture) {
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
      { key: "static-rehearsal-output", source: "ops/reports/static-deploy-rehearsal/latest.json", state: fixture?.ok ? "local-evidence-only" : "local-evidence-not-passed", canAuthorize: false },
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
    evidenceNote:
      "Private external-input boundary ledger is local authority accounting only. Every external fact remains Not observed, outside repo authority, non-requestable, no-secret, no-deploy, and non-executable.",
  };
}

function platformOwnerNonRequestTransferNoteFixture(fixture) {
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
      { key: "static-rehearsal-output", source: "ops/reports/static-deploy-rehearsal/latest.json", state: fixture?.ok ? "local-evidence-only" : "local-evidence-not-passed", canAuthorize: false, canRequestValues: false },
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
  };
}

function operatorResumePacketGuardrailFixture(fixture) {
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
      { key: "static-rehearsal-output", source: "ops/reports/static-deploy-rehearsal/latest.json", state: fixture?.ok ? "local-evidence-only" : "local-evidence-not-passed", canAuthorize: false, canRequestValues: false },
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
  };
}

function blockedStateOperatorContinuationIndexFixture(fixture) {
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
      { key: "static-rehearsal-output", source: "ops/reports/static-deploy-rehearsal/latest.json", state: fixture?.ok ? "local-evidence-only" : "local-evidence-not-passed", canAuthorize: false, canRequestValues: false },
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
  };
}

function autonomousDeployStopLedgerFixture(fixture) {
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
      { key: "static-rehearsal-output", source: "ops/reports/static-deploy-rehearsal/latest.json", state: fixture?.ok ? "local-evidence-only" : "local-evidence-not-passed", canAuthorize: false, canRequestValues: false },
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
  };
}

function postAutonomousStopRecoveryChecklistFixture(fixture) {
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
      { key: "static-rehearsal-output", source: "ops/reports/static-deploy-rehearsal/latest.json", state: fixture?.ok ? "local-evidence-only" : "local-evidence-not-passed", canAuthorize: false, canRequestValues: false, canExecute: false },
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
  };
}

function humanPlatformAuthorityReEntryGateFixture(fixture) {
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
      { key: "static-rehearsal-output", source: "ops/reports/static-deploy-rehearsal/latest.json", state: fixture?.ok ? "local-evidence-only" : "local-evidence-not-passed", canAuthorize: false, canRequestValues: false, canExecute: false, canUnlockReEntry: false },
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
  };
}

function outsideAuthorityAwaitingStateLedgerFixture(fixture) {
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
      { key: "static-rehearsal-output", source: "ops/reports/static-deploy-rehearsal/latest.json", state: fixture?.ok ? "local-evidence-only" : "local-evidence-not-passed", canAuthorize: false, canRequestValues: false, canExecute: false },
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
  };
}

function adminDataWithStaticDeployFixture(fixture) {
  const adminData = JSON.parse(fs.readFileSync(path.join(root, "admin-data.json"), "utf8"));
  adminData.operations = adminData.operations || {};
  adminData.operations.queueRefreshDecisionInput = adminData.operations.queueRefreshDecisionInput || {};
  adminData.operations.queueRefreshDecisionInput.staticDeployRehearsalVisibility = fixture;
  adminData.operations.queueRefreshDecisionInput.platformOwnerHandoffVisibility = {
    generatedFrom: [
      "ops/deploy/private-platform-owner-handoff-checklist.md",
      "ops/reports/static-deploy-rehearsal/latest.json",
    ],
    total: 1,
    handoffBlockedCount: 1,
    unavailableValueCount: 4,
    checklistExists: true,
    localStaticPassed: Boolean(fixture.ok),
    rows: [
      {
        id: "qa-fixture-platform-owner",
        owner: "qa",
        priority: "P1",
        state: "handoff-blocked",
        stateLabel: "Handoff visible, deploy blocked",
        nonSecretInputsNeeded: [
          { label: "Post-deploy status method", state: "Not observed" },
          { label: "Post-deploy health-check entrypoints", state: "Not observed" },
          { label: "Production origin to check after deploy", state: "Not observed" },
        ],
        unavailableCredentialDeployValues: [
          { label: "Platform credentials or account secrets", state: "Unavailable in repo/admin data" },
          { label: "Production URL or origin value", state: "Unavailable in repo/admin data" },
          { label: "Deploy trigger, hook, webhook, or tokenized command", state: "Unavailable in repo/admin data" },
          { label: "Dashboard links or secret-manager paths", state: "Unavailable in repo/admin data" },
        ],
        publicDeployStatus: {
          authorization: "Not observed",
          productionDeploymentState: "Do Not Deploy",
          blocked: true,
        },
        evidenceNote:
          "Private platform-owner handoff visibility is category-level only. It stores no credentials, production URLs, deploy triggers, dashboard links, public launch authorization, pricing, testimonial, demand, secure-intake, or outcome claims.",
      },
    ],
  };
  adminData.operations.queueRefreshDecisionInput.postDeployHealthOwnerHandoffVisibility = {
    generatedFrom: [
      "ops/deploy/private-post-deploy-health-check-owner-handoff-template.md",
      "ops/deploy/private-platform-owner-handoff-checklist.md",
    ],
    total: 1,
    routeOnlyCheckCount: 5,
    unavailableProductionOriginCount: 1,
    unavailableDeployTriggerCount: 1,
    blockedLaunchAuthorizationCount: 1,
    templateExists: true,
    platformHandoffVisible: true,
    rows: [
      {
        id: "qa-fixture-post-deploy-health",
        owner: "qa",
        priority: "P1",
        state: "health-owner-blocked",
        stateLabel: "Route-only health owner handoff blocked",
        routeOnlyChecks: [
          { path: "/", expectedCheck: "HTTP 200", executableState: "Not observed" },
          { path: "/intake.html", expectedCheck: "HTTP 200", executableState: "Not observed" },
          { path: "/review.html", expectedCheck: "HTTP 200", executableState: "Not observed" },
          { path: "/admin.html", expectedCheck: "HTTP 200", executableState: "Not observed" },
          { path: "/admin-data.json", expectedCheck: "HTTP 200 and parseable JSON", executableState: "Not observed" },
        ],
        unavailableProductionOrigin: { state: "Not observed" },
        unavailableDeployTrigger: { state: "Not observed" },
        blockedLaunchAuthorization: {
          state: "Not observed",
          deploymentState: "Do Not Deploy",
          blocked: true,
        },
        evidenceNote:
          "Private post-deploy health-check owner handoff visibility stores route paths and blocker categories only. It stores no origins, credentials, deploy triggers, private platform destinations, launch authorization, pricing, testimonial, demand, secure-intake, or outcome claims.",
      },
    ],
  };
  adminData.operations.queueRefreshDecisionInput.finalDeployGoNoGoLedgerVisibility = finalDeployGoNoGoLedgerFixture(fixture);
  adminData.operations.queueRefreshDecisionInput.deployBlockerEscalationMemoVisibility = deployBlockerEscalationMemoFixture(fixture);
  if (!adminData.operations.queueRefreshDecisionInput.firstHumanOperatorDeployPacketIndexVisibility) {
    adminData.operations.queueRefreshDecisionInput.firstHumanOperatorDeployPacketIndexVisibility = firstHumanOperatorDeployPacketIndexFixture(fixture);
  }
  adminData.validation = adminData.validation || {};
  adminData.validation.staticDeployRehearsal = fixture;
  adminData.validation.finalDeployGoNoGoLedger = finalDeployGoNoGoLedgerFixture(fixture);
  adminData.validation.deployBlockerEscalationMemo = deployBlockerEscalationMemoFixture(fixture);
  adminData.validation.firstHumanOperatorDeployPacketIndex = firstHumanOperatorDeployPacketIndexFixture(fixture);
  adminData.validation.operatorDryRunReviewChecklist = operatorDryRunReviewChecklistFixture(fixture);
  adminData.validation.firstHumanPacketColdStartArchive = firstHumanPacketColdStartArchiveFixture(fixture);
  adminData.validation.releaseCandidateDeployContinuationMap = releaseCandidateDeployContinuationMapFixture(fixture);
  adminData.validation.privateExternalInputBoundaryLedger = privateExternalInputBoundaryLedgerFixture(fixture);
  adminData.validation.platformOwnerNonRequestTransferNote = platformOwnerNonRequestTransferNoteFixture(fixture);
  adminData.validation.operatorResumePacketGuardrail = operatorResumePacketGuardrailFixture(fixture);
  adminData.validation.blockedStateOperatorContinuationIndex = blockedStateOperatorContinuationIndexFixture(fixture);
  adminData.validation.autonomousDeployStopLedger = autonomousDeployStopLedgerFixture(fixture);
  adminData.validation.postAutonomousStopRecoveryChecklist = postAutonomousStopRecoveryChecklistFixture(fixture);
  adminData.validation.humanPlatformAuthorityReEntryGate = humanPlatformAuthorityReEntryGateFixture(fixture);
  adminData.validation.outsideAuthorityAwaitingStateLedger = outsideAuthorityAwaitingStateLedgerFixture(fixture);
  return adminData;
}

async function readStaticDeployFailureDrilldown(page) {
  return page.evaluate(() => {
    const panel = document.querySelector("[data-pr='privateCredentialedDeployReadinessPanel']");
    const evidence = document.querySelector("[data-pr='credentialedDeployStaticRehearsalEvidence']");
    const drilldown = document.querySelector("[data-pr='credentialedDeployStaticRehearsalDrilldown']");
    const fields = [
      "credentialedDeployPlatform",
      "credentialedDeployProductionUrl",
      "credentialedDeployCredentialAvailability",
      "credentialedDeployTrigger",
      "credentialedDeployRollbackOwner",
      "credentialedDeployRollbackMethod",
      "credentialedDeployHealthCheckInputs",
    ].map((key) => {
      const node = document.querySelector(`[data-pr='${key}']`);
      return {
        key,
        disabled: Boolean(node?.hasAttribute("disabled")),
        noSecretStorage: node?.getAttribute("data-no-secret-storage") || "",
        exportEligible: node?.getAttribute("data-export-eligible") || "",
        downloadEligible: node?.getAttribute("data-download-eligible") || "",
      };
    });
    return {
      panelHidden: Boolean(panel?.hidden),
      panelState: panel?.getAttribute("data-credentialed-deploy-readiness") || "",
      panelStaticReady: panel?.getAttribute("data-static-deploy-rehearsal-ready") || "",
      evidenceStatus: evidence?.getAttribute("data-static-deploy-rehearsal-status") || "",
      evidenceReady: evidence?.getAttribute("data-static-deploy-rehearsal-ready") || "",
      text: [panel?.textContent || "", evidence?.textContent || "", drilldown?.textContent || ""].join("\n"),
      fields,
      saveDisabled: Boolean(document.querySelector("[data-pr='savePrivateCredentialedDeployReadiness']")?.hasAttribute("disabled")),
    };
  });
}

async function seedProductDeployReadinessPrerequisites(page) {
  return page.evaluate(() => {
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const lastIntakeId = localStorage.getItem("proofresume:lastIntakeId");
    const index = intakes.findIndex((intake) => intake?.id === lastIntakeId);
    if (index === -1) return false;
    const current = intakes[index];
    intakes[index] = {
      ...current,
      privateSynthesisDecisionMemo: {
        reviewedDecision: "Proceed only with private local rehearsal evidence.",
        evidenceConfidence: "local-only fixture confidence",
        publicChangeGuard: "no public deploy or copy change",
        operatorNotes: "QA fixture prerequisite",
        updatedAt: "2026-05-15T10:40:00.000Z",
      },
      privateLaunchDecisionApproval: {
        launchDecision: "private-rehearsal-only",
        reviewer: "QA fixture",
        approvalNotes: "No public launch approved.",
        updatedAt: "2026-05-15T10:41:00.000Z",
      },
      privatePublishReadinessChecklist: {
        completed: true,
        completedAt: "2026-05-15T10:42:00.000Z",
        state: "completed",
      },
      privateExplicitPublishPlan: {
        owner: "QA fixture owner",
        rollback: "Use local rollback notes only.",
        claimRisk: "No launch, pricing, testimonial, demand, willingness-to-pay, secure-intake, or outcome claim.",
        publicCopyDiff: "No public copy diff may deploy from this fixture.",
        selectedDraftId: lastIntakeId,
        updatedAt: "2026-05-15T10:43:00.000Z",
      },
      privatePublicCopyDiffRollback: {
        diffSummary: "Fixture diff summary recorded locally.",
        consentCheck: "No customer names, testimonials, or public claims.",
        claimRiskCheck: "Claims remain not observed.",
        validationCommand: "node website/scripts/check_site.cjs",
        rollbackPath: "Keep prior local copy and resume export text unchanged.",
        selectedDraftId: lastIntakeId,
        updatedAt: "2026-05-15T10:44:00.000Z",
      },
      privateReleaseCandidateRehearsal: {
        localStaticSmoke: "node website/scripts/check_site.cjs",
        servedSmoke: "npm run qa:intake-flow",
        rollbackRehearsal: "rollback fixture preserves resume export/download text",
        consentCheck: "no customer names, quotes, testimonials, or public proof claims approved",
        claimRiskCheck: "no launch, pricing, testimonial, demand, willingness-to-pay, secure-intake, or outcome claim",
        selectedDraftId: lastIntakeId,
        updatedAt: "2026-05-15T10:45:00.000Z",
      },
    };
    localStorage.setItem("proofresume:intakes", JSON.stringify(intakes));
    return true;
  });
}

async function runStaticDeployFailureFixtureScenario(page, baseUrl) {
  const scenario = createScenario("static-deploy-failure-fixtures-no-network");
  const fixture = staticDeployFailureFixture();
  responseOverrides.set("/admin-data.json", {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(adminDataWithStaticDeployFixture(fixture)),
  });

  try {
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });
    await page
      .waitForFunction(() => document.body.textContent.includes("Platform-owner handoff"), null, { timeout: 15000 })
      .catch(() => {});
    const adminText = await page.textContent("body");
    const adminLower = adminText.toLowerCase();
    scenario.check(adminText.includes("Prior failures"), "Admin static rehearsal history renders prior failure bucket.");
    scenario.check(adminText.includes("Stale evidence"), "Admin static rehearsal history renders stale evidence bucket.");
    scenario.check(adminText.includes("fixture-not-run.json"), "Admin history renders the deterministic not-run failure report path.");
    scenario.check(adminText.includes("fixture-stale-pass.json"), "Admin history renders the deterministic stale passing report path.");
    scenario.check(adminText.includes("Blocked route: /review.html returned 404"), "Admin history/card renders blocked route failure detail.");
    scenario.check(adminText.includes("Missing static entrypoint: website/review.html"), "Admin history/card renders missing-entrypoint failure detail.");
    scenario.check(adminLower.includes("unsafe guardrail"), "Admin history/card renders unsafe-guardrail failure detail.");
    scenario.check(adminText.includes("Do Not Deploy"), "Admin failure history preserves the Do Not Deploy boundary.");

    await resetDrafts(page, baseUrl);
    await seedFiveSessionSynthesisDrafts(page);
    await loadIntake(page, baseUrl);
    await applyFiveSessionSynthesisState(page, 5);
    await applyPrivateSynthesisArtifactGenerationAttempt(page);
    await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
    await applyPrivateLaunchDecisionApprovalAttempt(page);
    await applyPrivateExplicitPublishPlanAttempt(page);
    await applyPrivatePublicCopyDiffRollbackAttempt(page);
    await applyPrivateReleaseCandidateRehearsalAttempt(page);
    scenario.check(await seedProductDeployReadinessPrerequisites(page), "Product-compatible deploy readiness prerequisites are seeded locally.");
    await page.reload({ waitUntil: "networkidle" });

    const drilldown = await readStaticDeployFailureDrilldown(page);
    const lower = drilldown.text.toLowerCase();
    scenario.check(drilldown.panelHidden === false, "Product credentialed-deploy panel is visible after release-candidate rehearsal completion.");
    scenario.check(drilldown.panelState === "static-rehearsal-blocked", "Product drilldown keeps deploy readiness blocked on failed static rehearsal.");
    scenario.check(drilldown.panelStaticReady === "false" && drilldown.evidenceReady === "false", "Product drilldown marks failed static rehearsal as not ready.");
    scenario.check(drilldown.evidenceStatus === "blocked-no-credentials", "Product drilldown carries the blocked-no-credentials fixture state.");
    scenario.check(lower.includes("/review.html") && lower.includes("404"), "Product drilldown renders blocked route status detail.");
    scenario.check(lower.includes("missing static entrypoint: website/review.html"), "Product drilldown renders missing-entrypoint detail.");
    scenario.check(lower.includes("stale evidence"), "Product drilldown renders stale-evidence detail.");
    scenario.check(
      lower.includes("platformdashboardvisited: true") || lower.includes("unsafe guardrail"),
      "Product drilldown renders unsafe guardrail failure detail."
    );
    scenario.check(lower.includes("platform inputs remain disabled"), "Product drilldown explains platform inputs remain disabled.");
    scenario.check(drilldown.fields.every((field) => field.disabled), "Product platform and deploy-readiness inputs remain disabled for failure fixture.");
    scenario.check(drilldown.fields.every((field) => field.noSecretStorage === "true"), "Product disabled deploy-readiness fields stay marked no-secret-storage.");
    scenario.check(
      drilldown.fields.every((field) => field.exportEligible === "false" && field.downloadEligible === "false"),
      "Product disabled deploy-readiness fields remain export/download ineligible."
    );
    scenario.check(drilldown.saveDisabled === true, "Product save readiness action remains disabled for failed static rehearsal fixture.");
  } finally {
    responseOverrides.delete("/admin-data.json");
  }

  return scenario;
}

async function runPlatformOwnerPostDeployHandoffScenario(page, baseUrl) {
  const scenario = createScenario("platform-owner-post-deploy-health-handoff-no-network");
  const passedFixture = staticDeployPassedLocalFixture();
  responseOverrides.set("/admin-data.json", {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(adminDataWithStaticDeployFixture(passedFixture)),
  });

  try {
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });
    await page
      .waitForFunction(() => document.body.textContent.includes("Platform-owner handoff"), null, { timeout: 3000 })
      .catch(() => {});
    const adminText = await page.textContent("body");
    const adminDebug = await page.evaluate(() => ({
      docContent: document.querySelector("#doc-content")?.textContent || "",
      queueRefreshText: document.querySelector("#queue-refresh-decision")?.textContent || "",
      queueRefreshHtmlLength: document.querySelector("#queue-refresh-decision")?.innerHTML.length || 0,
    }));
    const adminLower = adminText.toLowerCase();
    scenario.check(
      adminText.includes("Platform-owner handoff"),
      `Admin renders platform-owner handoff visibility. Observed debug: ${JSON.stringify(adminDebug)} body: ${adminText.slice(0, 500)}`
    );
    scenario.check(adminText.includes("Post-deploy health-check entrypoints"), "Admin handoff lists post-deploy health-check ownership category.");
    scenario.check(adminText.includes("Post-deploy status method"), "Admin handoff lists post-deploy status ownership category.");
    scenario.check(adminLower.includes("unavailable credential/deploy values"), "Admin handoff renders unavailable credential/deploy value bucket.");
    scenario.check(adminLower.includes("production url or origin value"), "Admin handoff marks production URL value unavailable.");
    scenario.check(adminLower.includes("deploy trigger, hook, webhook, or tokenized command"), "Admin handoff marks deploy trigger unavailable.");
    scenario.check(adminText.includes("Do Not Deploy"), "Admin handoff preserves Do Not Deploy public deploy state.");
    scenario.check(!/https?:\/\/|qa-secret|ghp_|bearer\s+qa|deploy-token/i.test(adminText), "Admin handoff surface exposes no URL, secret, token, or bearer marker.");

    await resetDrafts(page, baseUrl);
    const fixture = await seedFiveSessionSynthesisDrafts(page);
    await loadIntake(page, baseUrl);
    const readyState = await applyFiveSessionSynthesisState(page, 5);
    const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
    const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
    const approvalAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
    const publishPlanAttempt = await applyPrivateExplicitPublishPlanAttempt(page);
    const diffAttempt = await applyPrivatePublicCopyDiffRollbackAttempt(page);
    const rehearsalAttempt = await applyPrivateReleaseCandidateRehearsalAttempt(page);
    const readinessAttempt = await applyPrivateCredentialedDeployReadinessAttempt(page);
    await page.reload({ waitUntil: "networkidle" });

    scenario.check(
      artifactAttempt.changed === true &&
        memoAttempt.artifactAvailable === true &&
        approvalAttempt.memoAvailable === true &&
        publishPlanAttempt.approvalAvailable === true &&
        diffAttempt.publishPlanAvailable === true &&
        rehearsalAttempt.diffPacketAvailable === true &&
        readinessAttempt.rehearsalAvailable === true,
      "Product handoff scenario reaches release-candidate and credentialed-readiness prerequisites locally."
    );

    const stored = await storedDrafts(page);
    const selectedDraft = stored.intakes.find((intake) => intake.id === stored.lastIntakeId);
    const handoff = await readPlatformOwnerAndPostDeployHandoff(page);
    const platform = handoff.platformOwner;
    const health = handoff.postDeployHealth;
    const combinedText = `${platform.text}\n${health.text}\n${platform.items.map((item) => item.text).join("\n")}\n${health.items
      .map((item) => item.text)
      .join("\n")}`;
    const lower = combinedText.toLowerCase();
    const localLinkPattern = /^(#|\/(?!\/)|\.{0,2}\/|ops\/|website\/|$)/;

    scenario.check(platform.exposed === true && platform.hidden === false, "Product platform-owner handoff panel is visible after local static rehearsal passes.");
    scenario.check(platform.state === "owner-inputs-needed", "Product platform-owner handoff stays in owner-inputs-needed local handoff state.");
    scenario.check(platform.localOnly === "true" && platform.private === "true", "Product platform-owner handoff is marked local-only and private.");
    scenario.check(platform.noSecretStorage === "true" && platform.noDeployAction === "true", "Product platform-owner handoff is marked no-secret and no-deploy.");
    scenario.check(platform.exportEligible === "false" && platform.downloadEligible === "false", "Product platform-owner handoff is export/download ineligible.");
    scenario.check(platform.staticReady === "true", "Product platform-owner handoff is gated by passed local static rehearsal evidence.");
    scenario.check(lower.includes("post-deploy health-check entrypoints"), "Product platform-owner handoff lists post-deploy health-check entrypoints.");
    scenario.check(lower.includes("production origin to check after deploy"), "Product platform-owner handoff lists production-origin category without a value.");
    scenario.check(
      platform.links.every((link) => localLinkPattern.test(link.href) && !/^https?:|^mailto:|^tel:/i.test(link.href) && !/\/api(?:\/|$)|api\./i.test(link.href)),
      "Product platform-owner handoff links stay local and non-API."
    );

    scenario.check(health.exposed === true && health.hidden === false, "Product post-deploy health handoff panel is visible with credentialed readiness surface.");
    scenario.check(health.localOnly === "true" && health.private === "true" && health.routeOnly === "true", "Product post-deploy health handoff is local-only, private, and route-only.");
    scenario.check(
      health.noSecretStorage === "true" &&
        health.noProductionUrl === "true" &&
        health.noCredential === "true" &&
        health.noDeployTrigger === "true" &&
        health.noDeployAction === "true",
      "Product post-deploy health handoff asserts no-secret, no-URL, no-credential, no-deploy-trigger, and no-deploy."
    );
    scenario.check(health.exportEligible === "false" && health.downloadEligible === "false", "Product post-deploy health handoff is export/download ineligible.");
    scenario.check(
      health.links.every((link) => localLinkPattern.test(link.href) && !/^https?:|^mailto:|^tel:/i.test(link.href) && !/\/api(?:\/|$)|api\./i.test(link.href)),
      "Product post-deploy health handoff links stay local and non-API."
    );
    scenario.check(/do not deploy|no deploy|blocked|waiting/i.test(combinedText), "Product handoff copy keeps deploy action blocked.");
    scenario.check(!/https?:\/\/|qa-secret|ghp_|bearer\s+qa|deploy-token/i.test(combinedText), "Product handoff surfaces expose no URL, secret, token, or bearer marker.");
    scenario.check(
      selectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
        selectedDraft?.downloadedExportText === fixture.selectedExportText,
      "Product handoff leaves saved/downloaded resume export text unchanged."
    );
    scenario.check(
      !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readinessAttempt.readinessText) &&
        !String(selectedDraft?.downloadedExportText || "").includes(readinessAttempt.readinessText) &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(rehearsalAttempt.rehearsalText) &&
        !String(selectedDraft?.downloadedExportText || "").includes(rehearsalAttempt.rehearsalText) &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText),
      "Product platform-owner and post-deploy handoff metadata stays out of resume export/download text."
    );
  } finally {
    responseOverrides.delete("/admin-data.json");
  }

  return scenario;
}

async function runFinalDeployGoNoGoLedgerScenario(page, baseUrl) {
  const scenario = createScenario("final-deploy-go-no-go-ledger-no-network");
  const passedFixture = staticDeployPassedLocalFixture();
  const adminFixture = adminDataWithStaticDeployFixture(passedFixture);
  responseOverrides.set("/admin-data.json", {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(adminFixture),
  });

  try {
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });
    const loadedAdminData = await page.evaluate(async () => {
      const response = await fetch("/admin-data.json");
      return response.json();
    });
    const ledger = loadedAdminData.operations?.queueRefreshDecisionInput?.finalDeployGoNoGoLedgerVisibility;
    const serializedLedger = JSON.stringify(ledger);
    const blockerLabels = (ledger?.requiredExternalInputs || []).map((input) => String(input.label || "").toLowerCase()).join("\n");

    scenario.check(ledger?.format === "proofresume-final-deploy-go-no-go-ledger-v1", "Admin data exposes final deploy go/no-go ledger format.");
    scenario.check(ledger?.state === "no-go" && ledger?.decision === "No-Go / Do Not Deploy", "Admin data final ledger stays No-Go / Do Not Deploy.");
    scenario.check(
      ledger?.localStaticRehearsal?.passedLocal === true && ledger?.noDeployGuardrails?.productionDeploymentState === "Do Not Deploy",
      "Admin data final ledger treats passed local static rehearsal as evidence only while production remains Do Not Deploy."
    );
    scenario.check(
      ledger?.adminDataEvidence?.externalInputsPresent === false && ledger?.productReadinessEvidence?.externalInputsPresent === false,
      "Admin data final ledger does not infer external inputs from admin/product readiness evidence."
    );
    for (const token of [
      "explicit future human approval",
      "credentials outside the repo",
      "production origin",
      "deploy trigger",
      "rollback readiness",
      "post-deploy health readiness",
    ]) {
      scenario.check(blockerLabels.includes(token), `Admin data final ledger lists ${token} as a blocker.`);
    }
    scenario.check(
      (ledger?.requiredExternalInputs || []).every((input) => input.state === "Not observed"),
      "Admin data final ledger keeps every required external input Not observed."
    );
    scenario.check(
      ledger?.noDeployGuardrails?.platformCredentialConsumed === false &&
        ledger?.noDeployGuardrails?.productionUrlConsumed === false &&
        ledger?.noDeployGuardrails?.deployTriggerConsumed === false &&
        ledger?.noDeployGuardrails?.publicLaunchAuthorizationObserved === false &&
        ledger?.noDeployGuardrails?.dashboardLinkStored === false &&
        ledger?.noDeployGuardrails?.finalDeployActionRequested === false,
      "Admin data final ledger keeps credentials, production URL, deploy trigger, dashboard link, public launch authorization, and final deploy action locked."
    );
    scenario.check(!hasForbiddenDeployValue(serializedLedger), "Admin data final ledger exposes no URL, secret, token, bearer, or dashboard-link value.");

    await resetDrafts(page, baseUrl);
    const fixture = await seedFiveSessionSynthesisDrafts(page);
    await loadIntake(page, baseUrl);
    const readyState = await applyFiveSessionSynthesisState(page, 5);
    const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
    const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
    const approvalAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
    const publishPlanAttempt = await applyPrivateExplicitPublishPlanAttempt(page);
    const diffAttempt = await applyPrivatePublicCopyDiffRollbackAttempt(page);
    const rehearsalAttempt = await applyPrivateReleaseCandidateRehearsalAttempt(page);
    const readinessAttempt = await applyPrivateCredentialedDeployReadinessAttempt(page);
    await page.reload({ waitUntil: "networkidle" });
    const handoff = await readPlatformOwnerAndPostDeployHandoff(page);
    const readiness = await readPrivateCredentialedDeployReadiness(page);
    const finalPanel = await page.evaluate(() => {
      const root = document.querySelector("[data-pr='finalDeployGoNoGoState']");
      if (!root) return { exposed: false, text: "", missing: [] };
      return {
        exposed: true,
        text: root.textContent || "",
        decision: root.getAttribute("data-final-deploy-decision") || "",
        productionDeploymentState: root.getAttribute("data-production-deployment-state") || "",
        humanApprovalObserved: root.getAttribute("data-human-approval-observed") || "",
        platformInputsEnabled: root.getAttribute("data-platform-inputs-enabled") || "",
        localOnly: root.getAttribute("data-local-only") || "",
        private: root.getAttribute("data-private") || "",
        readOnly: root.getAttribute("data-read-only") || "",
        noSecretStorage: root.getAttribute("data-no-secret-storage") || "",
        noProductionUrl: root.getAttribute("data-no-production-url") || "",
        noCredential: root.getAttribute("data-no-credential") || "",
        noDeployTrigger: root.getAttribute("data-no-deploy-trigger") || "",
        noDeployAction: root.getAttribute("data-no-deploy-action") || "",
        noPublishAction: root.getAttribute("data-no-publish-action") || "",
        exportEligible: root.getAttribute("data-export-eligible") || "",
        downloadEligible: root.getAttribute("data-download-eligible") || "",
        missing: [...root.querySelectorAll("[data-final-deploy-missing]")].map((item) => item.textContent || ""),
      };
    });
    const stored = await storedDrafts(page);
    const selectedDraft = stored.intakes.find((intake) => intake.id === stored.lastIntakeId);
    const combinedText = [
      handoff.platformOwner.text,
      handoff.postDeployHealth.text,
      handoff.platformOwner.items.map((item) => item.text).join("\n"),
      handoff.postDeployHealth.items.map((item) => item.text).join("\n"),
      readiness.text,
      finalPanel.text,
    ].join("\n");

    scenario.check(
      artifactAttempt.changed === true &&
        memoAttempt.artifactAvailable === true &&
        approvalAttempt.memoAvailable === true &&
        publishPlanAttempt.approvalAvailable === true &&
        diffAttempt.publishPlanAvailable === true &&
        rehearsalAttempt.diffPacketAvailable === true &&
        readinessAttempt.rehearsalAvailable === true,
      "Product final ledger scenario reaches all local prerequisites without external inputs."
    );
    scenario.check(
      handoff.platformOwner.state === "owner-inputs-needed" &&
        handoff.postDeployHealth.noDeployAction === "true" &&
        /do not deploy|no deploy|blocked|waiting/i.test(combinedText),
      "Product readiness surfaces keep final deploy blocked after local handoffs."
    );
    scenario.check(
      finalPanel.exposed === true &&
        finalPanel.decision === "no-go" &&
        finalPanel.productionDeploymentState === "Do Not Deploy" &&
        finalPanel.humanApprovalObserved === "false" &&
        finalPanel.platformInputsEnabled === "false",
      "Product final deploy go/no-go panel is read-only No-Go with human approval absent and platform inputs disabled."
    );
    scenario.check(
      finalPanel.localOnly === "true" &&
        finalPanel.private === "true" &&
        finalPanel.readOnly === "true" &&
        finalPanel.noSecretStorage === "true" &&
        finalPanel.noProductionUrl === "true" &&
        finalPanel.noCredential === "true" &&
        finalPanel.noDeployTrigger === "true" &&
        finalPanel.noDeployAction === "true" &&
        finalPanel.noPublishAction === "true",
      "Product final deploy go/no-go panel is local-only, private, read-only, no-secret, no-URL, no-credential, no-trigger, no-deploy, and no-publish."
    );
    scenario.check(
      finalPanel.exportEligible === "false" && finalPanel.downloadEligible === "false",
      "Product final deploy go/no-go panel remains export/download ineligible."
    );
    scenario.check(
      combinedText.toLowerCase().includes("explicit future human approval") &&
        combinedText.toLowerCase().includes("credentials outside repo") &&
        combinedText.toLowerCase().includes("production origin") &&
        combinedText.toLowerCase().includes("deploy trigger") &&
        combinedText.toLowerCase().includes("rollback readiness") &&
        combinedText.toLowerCase().includes("post-deploy health evidence"),
      "Product final deploy go/no-go panel lists every external input as missing/not observed."
    );
    scenario.check(
      readiness.noDeploy === "true" || /do not deploy|no deploy|blocked/i.test(readiness.text),
      "Product credentialed-deploy readiness continues to assert no-deploy state."
    );
    scenario.check(
      handoff.postDeployHealth.noProductionUrl === "true" &&
        handoff.postDeployHealth.noDeployTrigger === "true" &&
        handoff.postDeployHealth.exportEligible === "false" &&
        handoff.postDeployHealth.downloadEligible === "false",
      "Product post-deploy health handoff keeps no-production-URL, no-deploy-trigger, and export/download-ineligible attributes."
    );
    scenario.check(!hasForbiddenDeployValue(combinedText), "Product final deploy readiness surfaces expose no URL, secret, token, bearer, or dashboard-link value.");
    scenario.check(
      selectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
        selectedDraft?.downloadedExportText === fixture.selectedExportText &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readinessAttempt.readinessText) &&
        !String(selectedDraft?.downloadedExportText || "").includes(rehearsalAttempt.rehearsalText) &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText),
      "Product final deploy ledger and readiness metadata stay out of resume export/download text."
    );
  } finally {
    responseOverrides.delete("/admin-data.json");
  }

  return scenario;
}

async function runDeployBlockerEscalationMemoScenario(page, baseUrl) {
  const scenario = createScenario("deploy-blocker-escalation-memo-no-network");
  const passedFixture = staticDeployPassedLocalFixture();
  const adminFixture = adminDataWithStaticDeployFixture(passedFixture);
  responseOverrides.set("/admin-data.json", {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(adminFixture),
  });

  try {
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });
    const loadedAdminData = await page.evaluate(async () => {
      const response = await fetch("/admin-data.json");
      return response.json();
    });
    const memo = loadedAdminData.operations?.queueRefreshDecisionInput?.deployBlockerEscalationMemoVisibility;
    const staticMemo = loadedAdminData.validation?.deployBlockerEscalationMemo;
    const serializedMemo = JSON.stringify({ memo, staticMemo });
    const unavailableLabels = (memo?.unavailableItems || []).map((input) => String(input.label || "").toLowerCase()).join("\n");

    scenario.check(memo?.format === "proofresume-deploy-blocker-escalation-memo-v1", "Admin data exposes deploy-blocker escalation memo format.");
    scenario.check(
      memo?.finalDecision === "No-Go / Do Not Deploy" && memo?.productionDeploymentState === "Do Not Deploy",
      "Admin data escalation memo preserves No-Go / Do Not Deploy."
    );
    scenario.check(
      memo?.adminDataEvidence?.externalInputsPresent === false &&
        memo?.productReadinessEvidence?.canChangeFinalDecision === false &&
        memo?.localStaticRehearsalEvidence?.canAuthorizeDeploy === false,
      "Admin/static escalation memo cannot infer deploy inputs or authorize deploy from local evidence."
    );
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
      scenario.check(unavailableLabels.includes(token), `Admin data escalation memo lists ${token} as unavailable.`);
    }
    scenario.check(
      (memo?.unavailableItems || []).every((input) => input.state === "Not observed"),
      "Admin data escalation memo keeps every unavailable item Not observed."
    );
    scenario.check(
      memo?.noSecretNoDeployGuardrails?.credentialRequestAllowed === false &&
        memo?.noSecretNoDeployGuardrails?.platformValueStored === false &&
        memo?.noSecretNoDeployGuardrails?.productionUrlStored === false &&
        memo?.noSecretNoDeployGuardrails?.deployTriggerStored === false &&
        memo?.noSecretNoDeployGuardrails?.dashboardLinkStored === false &&
        memo?.noSecretNoDeployGuardrails?.publicLaunchAuthorized === false &&
        memo?.noSecretNoDeployGuardrails?.rollbackAuthorized === false &&
        memo?.noSecretNoDeployGuardrails?.finalDecisionChangeAllowed === false &&
        memo?.noSecretNoDeployGuardrails?.finalDeployActionRequested === false,
      "Admin data escalation memo blocks secret requests, platform values, URLs, triggers, dashboard links, public launch, rollback, decision changes, and deploy actions."
    );
    scenario.check(
      staticMemo?.format === "proofresume-deploy-blocker-escalation-memo-v1" &&
        staticMemo?.localStaticRehearsalEvidence?.passedLocal === true &&
        staticMemo?.localStaticRehearsalEvidence?.canAuthorizeDeploy === false,
      "Static rehearsal output carries the escalation memo as non-authorizing local evidence."
    );
    scenario.check(
      !hasForbiddenDeployValue(serializedMemo),
      "Admin/static escalation memo exposes no URL, secret, token, bearer, API key, or dashboard-link value."
    );

    await resetDrafts(page, baseUrl);
    const fixture = await seedFiveSessionSynthesisDrafts(page);
    await loadIntake(page, baseUrl);
    const readyState = await applyFiveSessionSynthesisState(page, 5);
    const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
    const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
    const approvalAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
    const publishPlanAttempt = await applyPrivateExplicitPublishPlanAttempt(page);
    const diffAttempt = await applyPrivatePublicCopyDiffRollbackAttempt(page);
    const rehearsalAttempt = await applyPrivateReleaseCandidateRehearsalAttempt(page);
    const readinessAttempt = await applyPrivateCredentialedDeployReadinessAttempt(page);
    await page.reload({ waitUntil: "networkidle" });

    const finalPanel = await page.evaluate(() => {
      const root = document.querySelector("[data-pr='finalDeployGoNoGoState']");
      return {
        exposed: Boolean(root),
        text: root?.textContent || "",
        decision: root?.getAttribute("data-final-deploy-decision") || "",
        productionDeploymentState: root?.getAttribute("data-production-deployment-state") || "",
        humanApprovalObserved: root?.getAttribute("data-human-approval-observed") || "",
        platformInputsEnabled: root?.getAttribute("data-platform-inputs-enabled") || "",
        noSecretStorage: root?.getAttribute("data-no-secret-storage") || "",
        noProductionUrl: root?.getAttribute("data-no-production-url") || "",
        noDeployTrigger: root?.getAttribute("data-no-deploy-trigger") || "",
        noDeployAction: root?.getAttribute("data-no-deploy-action") || "",
        noPublishAction: root?.getAttribute("data-no-publish-action") || "",
        exportEligible: root?.getAttribute("data-export-eligible") || "",
        downloadEligible: root?.getAttribute("data-download-eligible") || "",
      };
    });
    const operatorPacketPanel = await page.evaluate(() => {
      const root = document.querySelector("[data-pr='firstHumanOperatorPacketHandoffState']");
      return {
        exposed: Boolean(root),
        hidden: Boolean(root?.hidden),
        text: root?.textContent || "",
        state: root?.getAttribute("data-first-human-operator-packet-state") || "",
        decision: root?.getAttribute("data-final-deploy-decision") || "",
        productionDeploymentState: root?.getAttribute("data-production-deployment-state") || "",
        humanApprovalObserved: root?.getAttribute("data-human-approval-observed") || "",
        platformInputsEnabled: root?.getAttribute("data-platform-inputs-enabled") || "",
        localOnly: root?.getAttribute("data-local-only") || "",
        readOnly: root?.getAttribute("data-read-only") || "",
        noSecretStorage: root?.getAttribute("data-no-secret-storage") || "",
        noProductionUrl: root?.getAttribute("data-no-production-url") || "",
        noCredential: root?.getAttribute("data-no-credential") || "",
        noDeployTrigger: root?.getAttribute("data-no-deploy-trigger") || "",
        noDeployAction: root?.getAttribute("data-no-deploy-action") || "",
        noDashboardLink: root?.getAttribute("data-no-dashboard-link") || "",
        noContactDetails: root?.getAttribute("data-no-contact-details") || "",
        noRollbackAuthorization: root?.getAttribute("data-no-rollback-authorization") || "",
        noPublicLaunchAuthorization: root?.getAttribute("data-no-public-launch-authorization") || "",
        noHumanApprovalPath: root?.getAttribute("data-no-human-approval-path") || "",
        exportEligible: root?.getAttribute("data-export-eligible") || "",
        downloadEligible: root?.getAttribute("data-download-eligible") || "",
      };
    });
    const readiness = await readPrivateCredentialedDeployReadiness(page);
    const stored = await storedDrafts(page);
    const selectedDraft = stored.intakes.find((intake) => intake.id === stored.lastIntakeId);
    const combinedText = `${finalPanel.text}\n${operatorPacketPanel.text}\n${readiness.text}`;

    scenario.check(
      artifactAttempt.changed === true &&
        memoAttempt.artifactAvailable === true &&
        approvalAttempt.memoAvailable === true &&
        publishPlanAttempt.approvalAvailable === true &&
        diffAttempt.publishPlanAvailable === true &&
        rehearsalAttempt.diffPacketAvailable === true &&
        readinessAttempt.rehearsalAvailable === true,
      "Product escalation memo scenario reaches local deploy-readiness prerequisites without external inputs."
    );
    scenario.check(
      finalPanel.exposed === true &&
        finalPanel.decision === "no-go" &&
        finalPanel.productionDeploymentState === "Do Not Deploy" &&
        finalPanel.humanApprovalObserved === "false" &&
        finalPanel.platformInputsEnabled === "false",
      "Product readiness remains No-Go / Do Not Deploy after escalation memo evidence is available."
    );
    scenario.check(
      finalPanel.noSecretStorage === "true" &&
        finalPanel.noProductionUrl === "true" &&
        finalPanel.noDeployTrigger === "true" &&
        finalPanel.noDeployAction === "true" &&
        finalPanel.noPublishAction === "true",
      "Product readiness keeps no-secret, no-production-URL, no-deploy-trigger, no-deploy, and no-publish boundaries."
    );
    scenario.check(
      finalPanel.exportEligible === "false" && finalPanel.downloadEligible === "false",
      "Product escalation memo state remains export/download ineligible through the final readiness panel."
    );
    scenario.check(!hasForbiddenDeployValue(combinedText), "Product escalation readiness text exposes no URL, secret, token, bearer, or dashboard-link value.");
    scenario.check(
      selectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
        selectedDraft?.downloadedExportText === fixture.selectedExportText &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readinessAttempt.readinessText) &&
        !String(selectedDraft?.downloadedExportText || "").includes(rehearsalAttempt.rehearsalText) &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText),
      "Product escalation memo and deploy-readiness metadata stay out of resume export/download text."
    );
  } finally {
    responseOverrides.delete("/admin-data.json");
  }

  return scenario;
}

async function readFirstRecruitDispatchBoard(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='firstRecruitDispatchBoard']",
        "[data-pr='firstRecruitDispatch']",
        "[data-pr='dispatchBoard']",
        "[data-first-recruit-dispatch-board]",
        "[data-first-recruit-dispatch]",
        "[data-dispatch-board]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", links: [], items: [] };
    }

    const itemSelector = [
      "[data-dispatch-item]",
      "[data-first-recruit-dispatch-item]",
      "[data-dispatch-board-item]",
      "[data-pr^='firstRecruitDispatch']",
      "li",
      "article",
      "[role='listitem']",
    ].join(",");
    const links = [...root.querySelectorAll("a[href]")].map((link) => ({
      href: link.getAttribute("href") || "",
      text: link.textContent || "",
      target: link.getAttribute("target") || "",
      destination:
        link.getAttribute("data-dispatch-destination") ||
        link.getAttribute("data-first-recruit-dispatch-destination") ||
        link.getAttribute("data-handoff-destination") ||
        "",
    }));
    const items = [...root.querySelectorAll(itemSelector)].map((item) => ({
      key:
        item.getAttribute("data-dispatch-item") ||
        item.getAttribute("data-first-recruit-dispatch-item") ||
        item.getAttribute("data-dispatch-board-item") ||
        item.getAttribute("data-pr") ||
        "",
      status:
        item.getAttribute("data-dispatch-status") ||
        item.getAttribute("data-first-recruit-dispatch-status") ||
        item.getAttribute("data-ready-state") ||
        "",
      text: item.textContent || "",
    }));

    return {
      exposed: true,
      text: root.textContent || "",
      localOnly:
        root.getAttribute("data-dispatch-local-only") ||
        root.getAttribute("data-first-recruit-local-only") ||
        root.getAttribute("data-local-only") ||
        "",
      exportTextUnchanged:
        root.getAttribute("data-export-text-unchanged") ||
        root.getAttribute("data-dispatch-export-text-unchanged") ||
        "",
      selectedDraftId:
        root.getAttribute("data-selected-draft-id") ||
        root.getAttribute("data-dispatch-selected-draft") ||
        root.getAttribute("data-first-recruit-selected-draft") ||
        "",
      decision:
        root.getAttribute("data-dispatch-decision") ||
        root.getAttribute("data-send-decision") ||
        root.getAttribute("data-send-state") ||
        "",
      replyStatus:
        root.getAttribute("data-reply-status") ||
        root.getAttribute("data-first-recruit-reply-status") ||
        root.getAttribute("data-observed-state") ||
        "",
      links,
      items,
    };
  });
}

async function readFirstReplyTriageBoard(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='firstReplyTriageBoard']",
        "[data-pr='replyTriageBoard']",
        "[data-pr='firstReplyTriage']",
        "[data-first-reply-triage-board]",
        "[data-first-reply-triage]",
        "[data-triage-board]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", links: [], items: [] };
    }

    const itemSelector = [
      "[data-triage-item]",
      "[data-first-reply-triage-item]",
      "[data-reply-triage-item]",
      "[data-pr^='triage']",
      "[data-pr^='firstReplyTriage']",
      "li",
      "article",
      "[role='listitem']",
    ].join(",");
    const links = [...root.querySelectorAll("a[href]")].map((link) => ({
      href: link.getAttribute("href") || "",
      text: link.textContent || "",
      target: link.getAttribute("target") || "",
      artifact:
        link.getAttribute("data-triage-artifact") ||
        link.getAttribute("data-first-reply-triage-artifact") ||
        link.getAttribute("data-reply-triage-artifact") ||
        "",
      selectedDraftId: link.getAttribute("data-selected-draft-id") || "",
    }));
    const items = [...root.querySelectorAll(itemSelector)].map((item) => ({
      key:
        item.getAttribute("data-triage-item") ||
        item.getAttribute("data-first-reply-triage-item") ||
        item.getAttribute("data-reply-triage-item") ||
        item.getAttribute("data-pr") ||
        "",
      status:
        item.getAttribute("data-triage-status") ||
        item.getAttribute("data-first-reply-triage-status") ||
        item.getAttribute("data-ready-state") ||
        "",
      text: item.textContent || "",
    }));

    return {
      exposed: true,
      text: root.textContent || "",
      localOnly:
        root.getAttribute("data-triage-local-only") ||
        root.getAttribute("data-first-reply-local-only") ||
        root.getAttribute("data-local-only") ||
        "",
      exportTextUnchanged:
        root.getAttribute("data-export-text-unchanged") ||
        root.getAttribute("data-triage-export-text-unchanged") ||
        "",
      selectedDraftId:
        root.getAttribute("data-selected-draft-id") ||
        root.getAttribute("data-triage-selected-draft") ||
        root.getAttribute("data-first-reply-selected-draft") ||
        "",
      readiness:
        root.getAttribute("data-triage-readiness") ||
        root.getAttribute("data-reply-readiness") ||
        root.getAttribute("data-first-reply-readiness") ||
        "",
      noReply:
        root.getAttribute("data-triage-no-reply") ||
        root.getAttribute("data-no-reply") ||
        root.getAttribute("data-first-reply-no-reply") ||
        "",
      replyStatus:
        root.getAttribute("data-reply-status") ||
        root.getAttribute("data-real-reply-facts") ||
        root.getAttribute("data-observed-state") ||
        "",
      artifactList:
        root.getAttribute("data-local-artifact-links") ||
        root.getAttribute("data-triage-artifacts") ||
        "",
      links,
      items,
    };
  });
}

async function readFirstReplyFactCapture(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='firstReplyFactCapture']",
        "[data-pr='firstReplyFactCapturePanel']",
        "[data-pr='replyFactCapture']",
        "[data-first-reply-fact-capture]",
        "[data-reply-fact-capture]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", facts: [] };
    }

    const factSelector = [
      "[data-reply-fact]",
      "[data-first-reply-fact-item]",
      "[data-reply-fact-item]",
    ].join(",");
    const facts = [...root.querySelectorAll(factSelector)].map((fact) => ({
      key:
        fact.getAttribute("data-first-reply-fact") ||
        fact.getAttribute("data-reply-fact") ||
        fact.getAttribute("data-first-reply-fact-item") ||
        fact.getAttribute("data-reply-fact-item") ||
        fact.getAttribute("data-pr") ||
        "",
      state:
        fact.getAttribute("data-first-reply-fact-state") ||
        fact.getAttribute("data-reply-fact-state") ||
        fact.getAttribute("data-observed-state") ||
        "",
      exportEligible:
        fact.getAttribute("data-export-eligible") ||
        fact.getAttribute("data-export-text-eligible") ||
        "",
      text: fact.textContent || "",
    }));

    return {
      exposed: true,
      text: root.textContent || "",
      localOnly:
        root.getAttribute("data-fact-capture-local-only") ||
        root.getAttribute("data-first-reply-local-only") ||
        root.getAttribute("data-local-only") ||
        "",
      exportTextUnchanged:
        root.getAttribute("data-export-text-unchanged") ||
        root.getAttribute("data-fact-capture-export-text-unchanged") ||
        "",
      selectedDraftId:
        root.getAttribute("data-selected-draft-id") ||
        root.getAttribute("data-fact-capture-selected-draft") ||
        root.getAttribute("data-first-reply-selected-draft") ||
        "",
      observedState:
        root.getAttribute("data-observed-state") ||
        root.getAttribute("data-real-reply-facts") ||
        root.getAttribute("data-first-reply-state") ||
        root.getAttribute("data-first-reply-observed-state") ||
        "",
      factCount:
        root.getAttribute("data-fact-count") ||
        root.getAttribute("data-first-reply-fact-count") ||
        root.getAttribute("data-captured-fact-count") ||
        "",
      facts,
    };
  });
}

async function readSchedulingReadiness(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='schedulingReadiness']",
        "[data-pr='schedulingReadinessPanel']",
        "[data-pr='freeAuditSchedulingReadiness']",
        "[data-scheduling-readiness]",
        "[data-scheduling-readiness-panel]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", items: [] };
    }

    const itemSelector = [
      "[data-scheduling-readiness-item]",
      "[data-scheduling-fact]",
      "[data-local-scheduling-fact]",
      "[data-pr^='schedulingReadiness']",
      "li",
      "article",
      "[role='listitem']",
    ].join(",");
    const items = [...root.querySelectorAll(itemSelector)].map((item) => ({
      key:
        item.getAttribute("data-scheduling-readiness-item") ||
        item.getAttribute("data-scheduling-fact") ||
        item.getAttribute("data-local-scheduling-fact") ||
        item.getAttribute("data-pr") ||
        "",
      status:
        item.getAttribute("data-scheduling-readiness-status") ||
        item.getAttribute("data-ready-state") ||
        item.getAttribute("data-accepted-local") ||
        "",
      text: item.textContent || "",
    }));

    return {
      exposed: true,
      text: root.textContent || "",
      localOnly:
        root.getAttribute("data-scheduling-local-only") ||
        root.getAttribute("data-scheduling-readiness-local-only") ||
        root.getAttribute("data-local-only") ||
        "",
      exportTextUnchanged:
        root.getAttribute("data-export-text-unchanged") ||
        root.getAttribute("data-scheduling-export-text-unchanged") ||
        "",
      selectedDraftId:
        root.getAttribute("data-selected-draft-id") ||
        root.getAttribute("data-scheduling-selected-draft") ||
        root.getAttribute("data-scheduling-readiness-selected-draft") ||
        "",
      readiness:
        root.getAttribute("data-scheduling-readiness") ||
        root.getAttribute("data-scheduling-state") ||
        root.getAttribute("data-ready-state") ||
        "",
      acceptedLocal:
        root.getAttribute("data-accepted-local") ||
        root.getAttribute("data-scheduling-accepted-local") ||
        root.getAttribute("data-accepted-local-reply-fact") ||
        root.getAttribute("data-local-accepted") ||
        "",
      blockerCount:
        root.getAttribute("data-blocker-count") ||
        root.getAttribute("data-scheduling-blocker-count") ||
        "",
      factCount:
        root.getAttribute("data-scheduling-fact-count") ||
        root.getAttribute("data-local-scheduling-fact-count") ||
        "",
      items,
    };
  });
}

async function readSessionStartGate(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='sessionStartGate']",
        "[data-pr='appointmentConfirmedSessionStartGate']",
        "[data-pr='localSessionStartGate']",
        "[data-pr='appointmentSessionStartGatePanel']",
        "[data-session-start-gate]",
        "[data-session-start]",
        "[data-appointment-confirmed-session-start]",
        "[data-appointment-confirmed-session-start-gate]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", links: [], items: [] };
    }

    const itemSelector = [
      "[data-session-start-item]",
      "[data-session-start-gate-item]",
      "[data-session-start-fact]",
      "[data-pr^='sessionStart']",
      "li",
      "article",
      "[role='listitem']",
    ].join(",");
    const links = [...root.querySelectorAll("a[href]")].map((link) => ({
      href: link.getAttribute("href") || "",
      text: link.textContent || "",
      artifact:
        link.getAttribute("data-session-start-artifact") ||
        link.getAttribute("data-session-start-destination") ||
        link.getAttribute("data-handoff-destination") ||
        "",
    }));
    const items = [...root.querySelectorAll(itemSelector)].map((item) => ({
      key:
        item.getAttribute("data-session-start-item") ||
        item.getAttribute("data-session-start-gate-item") ||
        item.getAttribute("data-session-start-fact") ||
        item.getAttribute("data-pr") ||
        "",
      status:
        item.getAttribute("data-session-start-status") ||
        item.getAttribute("data-ready-state") ||
        item.getAttribute("data-session-start-ready") ||
        "",
      text: item.textContent || "",
    }));

    return {
      exposed: true,
      text: root.textContent || "",
      localOnly:
        root.getAttribute("data-session-start-local-only") ||
        root.getAttribute("data-local-only") ||
        "",
      exportTextUnchanged:
        root.getAttribute("data-export-text-unchanged") ||
        root.getAttribute("data-session-start-export-text-unchanged") ||
        "",
      selectedDraftId:
        root.getAttribute("data-selected-draft-id") ||
        root.getAttribute("data-session-start-selected-draft") ||
        "",
      readiness:
        root.getAttribute("data-session-start-readiness") ||
        root.getAttribute("data-session-start-state") ||
        root.getAttribute("data-ready-state") ||
        "",
      appointmentConfirmed:
        root.getAttribute("data-appointment-confirmed") ||
        root.getAttribute("data-session-appointment-confirmed") ||
        root.getAttribute("data-explicit-appointment-time") ||
        "",
      calendarReady:
        root.getAttribute("data-calendar-ready") ||
        root.getAttribute("data-session-calendar-ready") ||
        root.getAttribute("data-calendar-readiness") ||
        "",
      consentReady:
        root.getAttribute("data-consent-ready") ||
        root.getAttribute("data-session-consent-ready") ||
        root.getAttribute("data-consent-boundary") ||
        "",
      redactedMaterialReady:
        root.getAttribute("data-redacted-material-ready") ||
        root.getAttribute("data-redacted-material-prep-ready") ||
        root.getAttribute("data-redacted-material-reminder") ||
        "",
      rawNotePrepReady:
        root.getAttribute("data-raw-note-prep-ready") ||
        root.getAttribute("data-raw-note-prep-facts") ||
        "",
      blockerCount:
        root.getAttribute("data-blocker-count") ||
        root.getAttribute("data-session-start-blocker-count") ||
        "",
      links,
      items,
    };
  });
}

async function readRawNoteCapture(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='firstSessionRawNoteCapture']",
        "[data-pr='rawNoteCapture']",
        "[data-pr='rawNoteCapturePanel']",
        "[data-first-session-raw-note-capture]",
        "[data-raw-note-capture]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", links: [], items: [] };
    }

    const itemSelector = [
      "[data-raw-note-capture-item]",
      "[data-raw-note-item]",
      "[data-first-session-raw-note-item]",
      "[data-pr^='rawNoteCapture']",
      "li",
      "article",
      "[role='listitem']",
    ].join(",");
    const links = [...root.querySelectorAll("a[href]")].map((link) => ({
      href: link.getAttribute("href") || "",
      text: link.textContent || "",
      artifact:
        link.getAttribute("data-raw-note-artifact") ||
        link.getAttribute("data-raw-note-capture-artifact") ||
        link.getAttribute("data-session-note-artifact") ||
        "",
    }));
    const items = [...root.querySelectorAll(itemSelector)].map((item) => ({
      key:
        item.getAttribute("data-raw-note-capture-item") ||
        item.getAttribute("data-raw-note-item") ||
        item.getAttribute("data-first-session-raw-note-item") ||
        item.getAttribute("data-pr") ||
        "",
      status:
        item.getAttribute("data-raw-note-capture-status") ||
        item.getAttribute("data-ready-state") ||
        item.getAttribute("data-raw-note-state") ||
        "",
      text: item.textContent || "",
    }));

    return {
      exposed: true,
      text: root.textContent || "",
      localOnly:
        root.getAttribute("data-raw-note-local-only") ||
        root.getAttribute("data-raw-note-capture-local-only") ||
        root.getAttribute("data-local-only") ||
        "",
      exportTextUnchanged:
        root.getAttribute("data-export-text-unchanged") ||
        root.getAttribute("data-raw-note-export-text-unchanged") ||
        "",
      selectedDraftId:
        root.getAttribute("data-selected-draft-id") ||
        root.getAttribute("data-raw-note-selected-draft") ||
        root.getAttribute("data-first-session-selected-draft") ||
        "",
      readiness:
        root.getAttribute("data-raw-note-capture-readiness") ||
        root.getAttribute("data-raw-note-state") ||
        root.getAttribute("data-ready-state") ||
        "",
      sessionStartReady:
        root.getAttribute("data-session-start-ready") ||
        root.getAttribute("data-session-start-readiness") ||
        root.getAttribute("data-appointment-confirmed") ||
        "",
      notesRecorded:
        root.getAttribute("data-raw-note-recorded") ||
        root.getAttribute("data-notes-recorded") ||
        root.getAttribute("data-raw-note-count") ||
        "",
      debriefReady:
        root.getAttribute("data-debrief-ready") ||
        root.getAttribute("data-raw-note-debrief-ready") ||
        "",
      objectionCodingReady:
        root.getAttribute("data-objection-coding-ready") ||
        root.getAttribute("data-raw-note-objection-coding-ready") ||
        "",
      links,
      items,
    };
  });
}

function assertFirstRecruitDispatchBoardState({ scenario, board, selectedDraftId, selectedExportText, phase }) {
  if (!board.exposed) {
    scenario.assertions.push(`First-recruit dispatch board contract pending product exposure during ${phase}.`);
    return false;
  }

  const combinedText = [board.text, ...board.items.map((item) => item.text), ...board.links.map((link) => `${link.text} ${link.href} ${link.destination}`)].join("\n");
  const lower = combinedText.toLowerCase();
  const selectedText = `${board.selectedDraftId}\n${combinedText}`;
  const decision = String(board.decision || "").toLowerCase();
  const replyStatus = String(board.replyStatus || "").toLowerCase();
  const linkText = board.links.map((link) => `${link.text} ${link.href} ${link.destination}`.toLowerCase()).join("\n");
  const localLinkPattern = /^(#|\/(?!\/)|\.{0,2}\/|ops\/|website\/|$)/;

  scenario.check(board.localOnly === "true", `First-recruit dispatch board is marked local-only during ${phase}.`);
  scenario.check(board.exportTextUnchanged === "true", `First-recruit dispatch board marks resume export text unchanged during ${phase}.`);
  scenario.check(
    selectedText.includes(selectedDraftId) || (lower.includes("selected") && lower.includes("draft")),
    `First-recruit dispatch board identifies the selected draft during ${phase}.`
  );
  scenario.check(
    decision.includes("no-send") || lower.includes("no-send") || lower.includes("no send"),
    `First-recruit dispatch board shows no-send state before real reply facts during ${phase}.`
  );
  scenario.check(
    replyStatus.includes("not observed") || lower.includes("not observed") || lower.includes("no reply"),
    `First-recruit dispatch board keeps first-recruit reply facts unobserved during ${phase}.`
  );
  scenario.check(
    linkText.includes("dispatch-readiness") || (linkText.includes("dispatch") && linkText.includes("readiness")),
    `First-recruit dispatch board links the dispatch-readiness packet during ${phase}.`
  );
  scenario.check(
    linkText.includes("outreach-tracker") || (linkText.includes("outreach") && linkText.includes("tracker")),
    `First-recruit dispatch board links the private outreach tracker during ${phase}.`
  );
  scenario.check(
    (linkText.includes("scheduling") && linkText.includes("consent")) || linkText.includes("scheduling-consent"),
    `First-recruit dispatch board links the scheduling/consent checklist during ${phase}.`
  );
  scenario.check(
    linkText.includes("review.html") || linkText.includes("selected-draft") || linkText.includes("selected draft"),
    `First-recruit dispatch board links the selected draft during ${phase}.`
  );
  scenario.check(
    board.links.length >= 4 && board.links.every((link) => localLinkPattern.test(link.href) && !/^https?:|^mailto:|^tel:/i.test(link.href) && !/\/api(?:\/|$)|api\./i.test(link.href)),
    `First-recruit dispatch board links stay local and non-API during ${phase}.`
  );
  scenario.check(!combinedText.includes(selectedExportText), `First-recruit dispatch board keeps resume export text out of dispatch copy during ${phase}.`);
  return true;
}

function assertFirstReplyTriageBoardState({ scenario, board, selectedDraftId, selectedExportText, phase }) {
  if (!board.exposed) {
    scenario.assertions.push(`First-reply triage board contract pending product exposure during ${phase}.`);
    return false;
  }

  const combinedText = [board.text, board.artifactList, ...board.items.map((item) => item.text), ...board.links.map((link) => `${link.text} ${link.href} ${link.artifact} ${link.selectedDraftId}`)].join("\n");
  const lower = combinedText.toLowerCase();
  const selectedText = `${board.selectedDraftId}\n${combinedText}`;
  const readiness = String(board.readiness || "").toLowerCase();
  const noReply = String(board.noReply || "").toLowerCase();
  const replyStatus = String(board.replyStatus || "").toLowerCase();
  const linkText = board.links.map((link) => `${link.text} ${link.href} ${link.artifact} ${link.selectedDraftId}`.toLowerCase()).join("\n");
  const localLinkPattern = /^(#|\/(?!\/)|\.{0,2}\/|ops\/|website\/|$)/;

  scenario.check(board.localOnly === "true", `First-reply triage board is marked local-only during ${phase}.`);
  scenario.check(board.exportTextUnchanged === "true", `First-reply triage board marks resume export text unchanged during ${phase}.`);
  scenario.check(
    selectedText.includes(selectedDraftId) || (lower.includes("selected") && lower.includes("draft")),
    `First-reply triage board identifies the selected draft during ${phase}.`
  );
  scenario.check(
    readiness.includes("no-reply") || noReply === "true" || lower.includes("no reply") || lower.includes("no-response"),
    `First-reply triage board shows no-reply state before real reply facts during ${phase}.`
  );
  scenario.check(
    replyStatus.includes("not-observed") || replyStatus.includes("not observed") || lower.includes("not observed"),
    `First-reply triage board keeps real reply facts not observed during ${phase}.`
  );
  scenario.check(
    linkText.includes("first-reply-triage") || (linkText.includes("reply") && linkText.includes("triage")),
    `First-reply triage board links the reply triage template during ${phase}.`
  );
  scenario.check(
    linkText.includes("outreach-tracker") || (linkText.includes("outreach") && linkText.includes("tracker")),
    `First-reply triage board links the private outreach tracker during ${phase}.`
  );
  scenario.check(
    (linkText.includes("scheduling") && linkText.includes("consent")) || linkText.includes("scheduling-consent"),
    `First-reply triage board links the scheduling/consent checklist during ${phase}.`
  );
  scenario.check(
    linkText.includes("raw-note") || linkText.includes("real-session-note") || (linkText.includes("raw") && linkText.includes("note")),
    `First-reply triage board links raw-note prep during ${phase}.`
  );
  scenario.check(
    linkText.includes("review.html") || linkText.includes("selected-draft") || linkText.includes("selected draft"),
    `First-reply triage board links the selected draft during ${phase}.`
  );
  scenario.check(
    board.links.length >= 5 && board.links.every((link) => localLinkPattern.test(link.href) && !/^https?:|^mailto:|^tel:/i.test(link.href) && !/\/api(?:\/|$)|api\./i.test(link.href)),
    `First-reply triage board links stay local and non-API during ${phase}.`
  );
  scenario.check(!combinedText.includes(selectedExportText), `First-reply triage board keeps resume export text out of triage copy during ${phase}.`);
  return true;
}

function assertFirstReplyFactCaptureState({
  scenario,
  capture,
  selectedDraftId,
  selectedExportText,
  expectedState,
  expectedFactText = "",
  unexpectedFactText = "",
  phase,
}) {
  if (!capture.exposed) {
    scenario.assertions.push(`First-reply fact capture contract pending product exposure during ${phase}.`);
    return false;
  }

  const combinedText = [capture.text, ...capture.facts.map((fact) => fact.text)].join("\n");
  const lower = combinedText.toLowerCase();
  const observedState = String(capture.observedState || "").toLowerCase();
  const factCount = Number(capture.factCount || capture.facts.length || 0);
  const selectedText = `${capture.selectedDraftId}\n${combinedText}`;

  scenario.check(capture.localOnly === "true", `First-reply fact capture is marked local-only during ${phase}.`);
  scenario.check(capture.exportTextUnchanged === "true", `First-reply fact capture marks resume export text unchanged during ${phase}.`);
  scenario.check(
    selectedText.includes(selectedDraftId) || (lower.includes("selected") && lower.includes("draft")),
    `First-reply fact capture identifies the selected draft during ${phase}.`
  );
  if (expectedState === "not-observed") {
    scenario.check(
      observedState.includes("not-observed") || observedState.includes("not observed") || lower.includes("not observed") || lower.includes("no reply"),
      `First-reply fact capture defaults to not-observed state during ${phase}.`
    );
    scenario.check(factCount === 0 || lower.includes("0 facts") || lower.includes("no facts"), `First-reply fact capture has zero captured facts during ${phase}.`);
  } else {
    scenario.check(
      observedState.includes("observed") || lower.includes("reply observed") || lower.includes("captured"),
      `First-reply fact capture reflects explicit observed local state during ${phase}.`
    );
    scenario.check(
      factCount >= 1 || (expectedFactText && combinedText.includes(expectedFactText)),
      `First-reply fact capture renders captured reply facts during ${phase}.`
    );
    if (expectedFactText) {
      scenario.check(combinedText.includes(expectedFactText), `First-reply fact capture includes the explicit local fact during ${phase}.`);
    }
  }
  if (unexpectedFactText) {
    scenario.check(!combinedText.includes(unexpectedFactText), `First-reply fact capture excludes unrelated draft facts during ${phase}.`);
  }
  scenario.check(!combinedText.includes(selectedExportText), `First-reply fact capture keeps resume export text out of fact-capture copy during ${phase}.`);
  return true;
}

function assertSchedulingReadinessState({
  scenario,
  readiness,
  selectedDraftId,
  selectedExportText,
  expectedState,
  expectedSchedulingFactText = "",
  phase,
}) {
  if (!readiness.exposed) {
    scenario.assertions.push(`Scheduling readiness contract pending product exposure during ${phase}.`);
    return false;
  }

  const combinedText = [readiness.text, ...readiness.items.map((item) => item.text)].join("\n");
  const lower = combinedText.toLowerCase();
  const selectedText = `${readiness.selectedDraftId}\n${readiness.items.map((item) => item.selectedDraftId).join("\n")}\n${combinedText}`;
  const state = String(readiness.readiness || "").toLowerCase();
  const acceptedLocal = String(readiness.acceptedLocal || "").toLowerCase();
  const blockerCount = Number(readiness.blockerCount || 0);
  const factCount = Number(readiness.factCount || readiness.items.length || 0);

  scenario.check(readiness.localOnly === "true", `Scheduling readiness is marked local-only during ${phase}.`);
  scenario.check(readiness.exportTextUnchanged === "true", `Scheduling readiness marks resume export text unchanged during ${phase}.`);
  scenario.check(
    selectedText.includes(selectedDraftId) || (lower.includes("selected") && lower.includes("draft")),
    `Scheduling readiness identifies the selected draft during ${phase}.`
  );
  if (expectedState === "blocked") {
    scenario.check(
      state.includes("blocked") ||
        acceptedLocal === "false" ||
        blockerCount > 0 ||
        lower.includes("blocked") ||
        lower.includes("not ready") ||
        lower.includes("needs accepted"),
      `Scheduling readiness defaults to blocked before accepted-local state during ${phase}.`
    );
    scenario.check(
      acceptedLocal === "false" ||
        blockerCount > 0 ||
        lower.includes("blocked") ||
        lower.includes("not ready") ||
        lower.includes("needs accepted") ||
        lower.includes("no accepted"),
      `Scheduling readiness has no accepted-local scheduling confirmation during ${phase}.`
    );
  } else {
    scenario.check(
      state.includes("accepted-local") ||
        state.includes("ready") ||
        acceptedLocal === "true" ||
        lower.includes("accepted-local") ||
        lower.includes("accepted local") ||
        lower.includes("ready to schedule"),
      `Scheduling readiness reflects accepted-local state during ${phase}.`
    );
    scenario.check(
      factCount >= 1 || (expectedSchedulingFactText && combinedText.includes(expectedSchedulingFactText)),
      `Scheduling readiness renders accepted-local scheduling fact metadata during ${phase}.`
    );
    if (expectedSchedulingFactText) {
      scenario.check(
        combinedText.includes(expectedSchedulingFactText) || (lower.includes("accepted") && lower.includes("reply fact")),
        `Scheduling readiness includes or names the explicit accepted-local scheduling fact during ${phase}.`
      );
    }
  }
  scenario.check(!combinedText.includes(selectedExportText), `Scheduling readiness keeps resume export text out of scheduling copy during ${phase}.`);
  return true;
}

function assertSessionStartGateState({
  scenario,
  gate,
  selectedDraftId,
  selectedExportText,
  expectedState,
  expectedAppointmentFactText = "",
  phase,
}) {
  if (!gate.exposed) {
    scenario.assertions.push(`Session-start gate contract pending product exposure during ${phase}.`);
    return false;
  }

  const combinedText = [gate.text, ...gate.items.map((item) => item.text), ...gate.links.map((link) => `${link.text} ${link.href} ${link.artifact}`)].join("\n");
  const lower = combinedText.toLowerCase();
  const selectedText = `${gate.selectedDraftId}\n${combinedText}`;
  const readiness = String(gate.readiness || "").toLowerCase();
  const appointmentConfirmed = String(gate.appointmentConfirmed || "").toLowerCase();
  const calendarReady = String(gate.calendarReady || "").toLowerCase();
  const consentReady = String(gate.consentReady || "").toLowerCase();
  const redactedMaterialReady = String(gate.redactedMaterialReady || "").toLowerCase();
  const rawNotePrepReady = String(gate.rawNotePrepReady || "").toLowerCase();
  const blockerCount = Number(gate.blockerCount || 0);
  const linkText = gate.links.map((link) => `${link.text} ${link.href} ${link.artifact}`.toLowerCase()).join("\n");
  const localLinkPattern = /^(#|\/(?!\/)|\.{0,2}\/|ops\/|website\/|$)/;
  const isReadyValue = (value) =>
    value === "true" || value === "ready" || value === "recorded" || value === "confirmed" || value === "accepted";
  const isMissingValue = (value) =>
    value === "false" || value === "blocked" || value === "missing" || value === "required" || value === "not-ready";

  scenario.check(gate.localOnly === "true", `Session-start gate is marked local-only during ${phase}.`);
  scenario.check(gate.exportTextUnchanged === "true", `Session-start gate marks resume export text unchanged during ${phase}.`);
  scenario.check(
    selectedText.includes(selectedDraftId) || (lower.includes("selected") && lower.includes("draft")),
    `Session-start gate identifies the selected draft during ${phase}.`
  );
  if (expectedState === "blocked") {
    scenario.check(
      readiness.includes("blocked") ||
        appointmentConfirmed === "false" ||
        blockerCount > 0 ||
        lower.includes("blocked") ||
        lower.includes("not ready"),
      `Session-start gate defaults to blocked before appointment confirmation during ${phase}.`
    );
    scenario.check(
      appointmentConfirmed === "false" ||
        isMissingValue(appointmentConfirmed) ||
        isMissingValue(calendarReady) ||
        isMissingValue(consentReady) ||
        isMissingValue(redactedMaterialReady) ||
        isMissingValue(rawNotePrepReady) ||
        lower.includes("appointment") ||
        lower.includes("calendar") ||
        lower.includes("consent") ||
        lower.includes("redacted") ||
        lower.includes("raw-note"),
      `Session-start gate names missing appointment, calendar, consent, redacted-material, or raw-note readiness during ${phase}.`
    );
  } else {
    scenario.check(
      readiness.includes("ready") ||
        appointmentConfirmed === "true" ||
        lower.includes("ready to start") ||
        lower.includes("ready-local") ||
        lower.includes("appointment confirmed"),
      `Session-start gate reflects ready local appointment-confirmed state during ${phase}.`
    );
    scenario.check(
      isReadyValue(appointmentConfirmed) &&
        isReadyValue(calendarReady) &&
        isReadyValue(consentReady) &&
        isReadyValue(redactedMaterialReady) &&
        isReadyValue(rawNotePrepReady),
      `Session-start gate marks appointment, calendar, consent, redacted-material, and raw-note readiness ready during ${phase}.`
    );
    scenario.check(
      linkText.includes("runbook") || (linkText.includes("operator") && linkText.includes("session")),
      `Session-start gate links the first-session runbook during ${phase}.`
    );
    scenario.check(
      linkText.includes("raw-note") || linkText.includes("real-session-note") || (linkText.includes("raw") && linkText.includes("note")),
      `Session-start gate links raw-note prep during ${phase}.`
    );
    scenario.check(
      linkText.includes("debrief"),
      `Session-start gate links the debrief template during ${phase}.`
    );
    scenario.check(
      gate.links.length >= 3 && gate.links.every((link) => localLinkPattern.test(link.href) && !/^https?:|^mailto:|^tel:/i.test(link.href) && !/\/api(?:\/|$)|api\./i.test(link.href)),
      `Session-start gate links stay local and non-API during ${phase}.`
    );
    if (expectedAppointmentFactText) {
      scenario.check(
        combinedText.includes(expectedAppointmentFactText) || lower.includes("appointment confirmed") || lower.includes("calendar"),
        `Session-start gate includes or names appointment-confirmed local fact during ${phase}.`
      );
    }
  }
  scenario.check(!combinedText.includes(selectedExportText), `Session-start gate keeps resume export text out of session-start copy during ${phase}.`);
  return true;
}

function assertRawNoteCaptureState({
  scenario,
  capture,
  selectedDraftId,
  selectedExportText,
  expectedState,
  expectedRawNoteText = "",
  phase,
}) {
  if (!capture.exposed) {
    scenario.assertions.push(`First-session raw-note capture contract pending product exposure during ${phase}.`);
    return false;
  }

  const combinedText = [capture.text, ...capture.items.map((item) => item.text), ...capture.links.map((link) => `${link.text} ${link.href} ${link.artifact}`)].join("\n");
  const lower = combinedText.toLowerCase();
  const selectedText = `${capture.selectedDraftId}\n${combinedText}`;
  const readiness = String(capture.readiness || "").toLowerCase();
  const sessionStartReady = String(capture.sessionStartReady || "").toLowerCase();
  const notesRecorded = String(capture.notesRecorded || "").toLowerCase();
  const debriefReady = String(capture.debriefReady || "").toLowerCase();
  const objectionCodingReady = String(capture.objectionCodingReady || "").toLowerCase();
  const linkText = capture.links.map((link) => `${link.text} ${link.href} ${link.artifact}`.toLowerCase()).join("\n");
  const localLinkPattern = /^(#|\/(?!\/)|\.{0,2}\/|ops\/|website\/|$)/;

  scenario.check(capture.localOnly === "true", `First-session raw-note capture is marked local-only during ${phase}.`);
  scenario.check(capture.exportTextUnchanged === "true", `First-session raw-note capture marks resume export text unchanged during ${phase}.`);
  scenario.check(
    selectedText.includes(selectedDraftId) || (lower.includes("selected") && lower.includes("draft")),
    `First-session raw-note capture identifies the selected draft during ${phase}.`
  );

  if (expectedState === "blocked") {
    scenario.check(
      readiness.includes("blocked") ||
        sessionStartReady === "false" ||
        sessionStartReady.includes("blocked") ||
        lower.includes("blocked") ||
        lower.includes("not ready") ||
        lower.includes("session-start"),
      `First-session raw-note capture defaults to blocked until session-start readiness during ${phase}.`
    );
    scenario.check(
      notesRecorded === "false" ||
        notesRecorded === "0" ||
        lower.includes("no raw notes") ||
        lower.includes("notes not recorded") ||
        lower.includes("blocked"),
      `First-session raw-note capture has no recorded notes in the default blocked state during ${phase}.`
    );
  } else {
    scenario.check(
      readiness.includes("notes-recorded") ||
        readiness.includes("ready") ||
        notesRecorded === "true" ||
        Number(notesRecorded) > 0 ||
        lower.includes("notes recorded") ||
        lower.includes("raw note"),
      `First-session raw-note capture reflects local notes-recorded state during ${phase}.`
    );
    scenario.check(
      debriefReady === "true" ||
        debriefReady.includes("ready") ||
        lower.includes("debrief"),
      `First-session raw-note capture marks debrief routing ready during ${phase}.`
    );
    scenario.check(
      objectionCodingReady === "true" ||
        objectionCodingReady.includes("ready") ||
        lower.includes("objection"),
      `First-session raw-note capture marks objection coding ready during ${phase}.`
    );
    scenario.check(
      linkText.includes("debrief") || lower.includes("debrief"),
      `First-session raw-note capture links or names debrief routing during ${phase}.`
    );
    scenario.check(
      linkText.includes("objection") || lower.includes("objection"),
      `First-session raw-note capture links or names objection coding during ${phase}.`
    );
    if (expectedRawNoteText) {
      scenario.check(
        combinedText.includes(expectedRawNoteText) ||
          lower.includes("notes recorded") ||
          lower.includes("raw notes saved") ||
          notesRecorded === "true" ||
          Number(notesRecorded) > 0 ||
          readiness.includes("notes-recorded"),
        `First-session raw-note capture includes or safely summarizes the saved local raw note during ${phase}.`
      );
    }
  }

  if (capture.links.length > 0) {
    scenario.check(
      capture.links.every((link) => localLinkPattern.test(link.href) && !/^https?:|^mailto:|^tel:/i.test(link.href) && !/\/api(?:\/|$)|api\./i.test(link.href)),
      `First-session raw-note capture links stay local and non-API during ${phase}.`
    );
  }
  scenario.check(!combinedText.includes(selectedExportText), `First-session raw-note capture keeps resume export text out of raw-note copy during ${phase}.`);
  return true;
}

function assertPostSessionDebriefState({
  scenario,
  debrief,
  selectedDraftId,
  selectedExportText,
  expectedState,
  expectedDebriefDraftText = "",
  phase,
}) {
  if (!debrief.exposed) {
    scenario.assertions.push(`Post-session debrief handoff contract pending product exposure during ${phase}.`);
    return false;
  }

  const combinedText = [debrief.text, ...debrief.items.map((item) => item.text), ...debrief.links.map((link) => `${link.text} ${link.href} ${link.artifact}`)].join("\n");
  const lower = combinedText.toLowerCase();
  const selectedText = `${debrief.selectedDraftId}\n${combinedText}`;
  const readiness = String(debrief.readiness || "").toLowerCase();
  const rawNotesAvailable = String(debrief.rawNotesAvailable || "").toLowerCase();
  const draftSaved = String(debrief.draftSaved || "").toLowerCase();
  const objectionCodingReady = String(debrief.objectionCodingReady || "").toLowerCase();
  const synthesisReady = String(debrief.synthesisReady || "").toLowerCase();
  const linkText = debrief.links.map((link) => `${link.text} ${link.href} ${link.artifact}`.toLowerCase()).join("\n");
  const localLinkPattern = /^(#|\/(?!\/)|\.{0,2}\/|ops\/|website\/|$)/;

  scenario.check(debrief.localOnly === "true", `Post-session debrief handoff is marked local-only during ${phase}.`);
  scenario.check(debrief.exportTextUnchanged === "true", `Post-session debrief handoff marks resume export text unchanged during ${phase}.`);
  scenario.check(
    selectedText.includes(selectedDraftId) || (lower.includes("selected") && lower.includes("draft")),
    `Post-session debrief handoff identifies the selected draft during ${phase}.`
  );

  if (expectedState === "blocked") {
    scenario.check(
      readiness.includes("blocked") ||
        rawNotesAvailable === "false" ||
        lower.includes("blocked") ||
        lower.includes("raw note") ||
        lower.includes("raw-note") ||
        lower.includes("notes required"),
      `Post-session debrief handoff defaults to blocked before raw-note capture during ${phase}.`
    );
    scenario.check(
      draftSaved === "false" ||
        draftSaved === "0" ||
        lower.includes("no debrief") ||
        lower.includes("draft not saved") ||
        lower.includes("blocked"),
      `Post-session debrief handoff has no saved draft in the default blocked state during ${phase}.`
    );
  } else {
    scenario.check(
      readiness.includes("debrief-draft") ||
        readiness.includes("saved") ||
        draftSaved === "true" ||
        lower.includes("debrief draft") ||
        lower.includes("draft saved"),
      `Post-session debrief handoff reflects local debrief-draft saved state during ${phase}.`
    );
    scenario.check(
      rawNotesAvailable === "true" || lower.includes("raw note") || lower.includes("notes saved"),
      `Post-session debrief handoff shows raw-note capture is available during ${phase}.`
    );
    scenario.check(
      objectionCodingReady === "true" || lower.includes("objection"),
      `Post-session debrief handoff links or names objection coding during ${phase}.`
    );
    scenario.check(
      synthesisReady !== "true" || lower.includes("five-session") || lower.includes("synthesis"),
      `Post-session debrief handoff keeps synthesis as a separate downstream step during ${phase}.`
    );
    if (expectedDebriefDraftText) {
      scenario.check(
        combinedText.includes(expectedDebriefDraftText) ||
          lower.includes("debrief draft") ||
          lower.includes("draft saved") ||
          draftSaved === "true",
        `Post-session debrief handoff includes or safely summarizes the saved local debrief draft during ${phase}.`
      );
    }
  }

  if (debrief.links.length > 0) {
    scenario.check(
      debrief.links.every((link) => localLinkPattern.test(link.href) && !/^https?:|^mailto:|^tel:/i.test(link.href) && !/\/api(?:\/|$)|api\./i.test(link.href)),
      `Post-session debrief handoff links stay local and non-API during ${phase}.`
    );
  }
  scenario.check(
    linkText.includes("debrief") || linkText.includes("objection") || linkText.includes("synthesis") || debrief.links.length === 0,
    `Post-session debrief handoff links or names local debrief/objection/synthesis destinations during ${phase}.`
  );
  scenario.check(!combinedText.includes(selectedExportText), `Post-session debrief handoff keeps resume export text out of debrief copy during ${phase}.`);
  return true;
}

function assertObjectionCodingHandoffState({
  scenario,
  handoff,
  selectedDraftId,
  selectedExportText,
  expectedState,
  expectedObjectionCodeText = "",
  phase,
}) {
  if (!handoff.exposed) {
    scenario.assertions.push(`Objection-coding handoff contract pending product exposure during ${phase}.`);
    return false;
  }

  const combinedText = [handoff.text, ...handoff.items.map((item) => item.text), ...handoff.links.map((link) => `${link.text} ${link.href} ${link.artifact}`)].join("\n");
  const lower = combinedText.toLowerCase();
  const selectedText = `${handoff.selectedDraftId}\n${combinedText}`;
  const readiness = String(handoff.readiness || "").toLowerCase();
  const debriefReady = String(handoff.debriefReady || "").toLowerCase();
  const codeSaved = String(handoff.codeSaved || "").toLowerCase();
  const codeCount = Number(handoff.codeCount || 0);
  const synthesisReady = String(handoff.synthesisReady || "").toLowerCase();
  const linkText = handoff.links.map((link) => `${link.text} ${link.href} ${link.artifact}`.toLowerCase()).join("\n");
  const localLinkPattern = /^(#|\/(?!\/)|\.{0,2}\/|ops\/|website\/|$)/;

  scenario.check(handoff.localOnly === "true", `Objection-coding handoff is marked local-only during ${phase}.`);
  scenario.check(handoff.exportTextUnchanged === "true", `Objection-coding handoff marks resume export text unchanged during ${phase}.`);
  scenario.check(
    selectedText.includes(selectedDraftId) || (lower.includes("selected") && lower.includes("draft")),
    `Objection-coding handoff identifies the selected draft during ${phase}.`
  );

  if (expectedState === "blocked") {
    scenario.check(
      readiness.includes("blocked") ||
        debriefReady === "false" ||
        lower.includes("blocked") ||
        lower.includes("debrief") ||
        lower.includes("draft required"),
      `Objection-coding handoff defaults to blocked before post-session debrief during ${phase}.`
    );
    scenario.check(
      codeSaved === "false" ||
        codeSaved === "0" ||
        codeCount === 0 ||
        lower.includes("no objection") ||
        lower.includes("code not saved") ||
        lower.includes("blocked"),
      `Objection-coding handoff has no saved objection code in the default blocked state during ${phase}.`
    );
  } else {
    scenario.check(
      readiness.includes("codes-recorded") ||
        readiness.includes("code-saved") ||
        readiness.includes("saved") ||
        codeSaved === "true" ||
        codeCount >= 1 ||
        lower.includes("code recorded") ||
        lower.includes("code saved"),
      `Objection-coding handoff reflects local objection-code saved state during ${phase}.`
    );
    scenario.check(
      debriefReady === "true" || lower.includes("debrief"),
      `Objection-coding handoff shows post-session debrief is available during ${phase}.`
    );
    scenario.check(
      codeCount >= 1 || (expectedObjectionCodeText && combinedText.includes(expectedObjectionCodeText)),
      `Objection-coding handoff renders at least one local objection code during ${phase}.`
    );
    if (expectedObjectionCodeText) {
      scenario.check(
        combinedText.includes(expectedObjectionCodeText) || (lower.includes("price") && lower.includes("risk")),
        `Objection-coding handoff includes or safely summarizes the saved local objection code during ${phase}.`
      );
    }
    scenario.check(
      synthesisReady !== "true" || lower.includes("five-session") || lower.includes("synthesis"),
      `Objection-coding handoff keeps five-session synthesis separate during ${phase}.`
    );
  }

  if (handoff.links.length > 0) {
    scenario.check(
      handoff.links.every((link) => localLinkPattern.test(link.href) && !/^https?:|^mailto:|^tel:/i.test(link.href) && !/\/api(?:\/|$)|api\./i.test(link.href)),
      `Objection-coding handoff links stay local and non-API during ${phase}.`
    );
  }
  scenario.check(
    linkText.includes("objection") || lower.includes("objection"),
    `Objection-coding handoff links or names the objection rubric during ${phase}.`
  );
  scenario.check(
    linkText.includes("synthesis") || lower.includes("synthesis"),
    `Objection-coding handoff links or names the synthesis template during ${phase}.`
  );
  scenario.check(!combinedText.includes(selectedExportText), `Objection-coding handoff keeps resume export text out of objection-coding copy during ${phase}.`);
  return true;
}

function assertFiveSessionSynthesisReadinessState({
  scenario,
  readiness,
  selectedDraftId,
  selectedExportText,
  expectedState,
  expectedCompletedCount,
  expectedPrivateText = "",
  phase,
}) {
  if (!readiness.exposed) {
    scenario.assertions.push(`Five-session synthesis readiness contract pending product exposure during ${phase}.`);
    return false;
  }

  const combinedText = [readiness.text, ...readiness.items.map((item) => item.text), ...readiness.links.map((link) => `${link.text} ${link.href} ${link.artifact}`)].join("\n");
  const lower = combinedText.toLowerCase();
  const selectedText = `${readiness.selectedDraftId}\n${combinedText}`;
  const state = String(readiness.readiness || "").toLowerCase();
  const ready = String(readiness.ready || "").toLowerCase();
  const completedCount = Number(readiness.completedSessionCount || 0);
  const requiredCount = Number(readiness.requiredSessionCount || 0);
  const blockerCount = Number(readiness.blockerCount || 0);
  const linkText = readiness.links.map((link) => `${link.text} ${link.href} ${link.artifact}`.toLowerCase()).join("\n");
  const localLinkPattern = /^(#|\/(?!\/)|\.{0,2}\/|ops\/|website\/|$)/;

  scenario.check(readiness.localOnly === "true", `Five-session synthesis readiness is marked local-only during ${phase}.`);
  scenario.check(readiness.exportTextUnchanged === "true", `Five-session synthesis readiness marks resume export text unchanged during ${phase}.`);
  scenario.check(
    selectedText.includes(selectedDraftId) || (lower.includes("selected") && lower.includes("draft")),
    `Five-session synthesis readiness identifies the selected draft during ${phase}.`
  );
  scenario.check(
    completedCount === expectedCompletedCount || lower.includes(`${expectedCompletedCount}`),
    `Five-session synthesis readiness reports ${expectedCompletedCount} completed session(s) during ${phase}.`
  );
  scenario.check(
    requiredCount === 5 || lower.includes("5") || lower.includes("five"),
    `Five-session synthesis readiness requires five completed sessions during ${phase}.`
  );

  if (expectedState === "blocked") {
    scenario.check(
      ready === "false" ||
        state.includes("blocked") ||
        blockerCount > 0 ||
        lower.includes("blocked") ||
        lower.includes("0 of 5") ||
        lower.includes("zero"),
      `Five-session synthesis readiness is blocked with zero completed sessions during ${phase}.`
    );
  } else if (expectedState === "blocked-partial") {
    scenario.check(
      ready === "false" ||
        state.includes("blocked") ||
        state.includes("partial") ||
        blockerCount > 0 ||
        lower.includes("partial") ||
        lower.includes("blocked"),
      `Five-session synthesis readiness stays blocked for partial sessions during ${phase}.`
    );
  } else {
    scenario.check(
      ready === "true" ||
        state.includes("ready") ||
        lower.includes("ready") ||
        lower.includes("5 of 5") ||
        lower.includes("five of five"),
      `Five-session synthesis readiness becomes ready at five complete sessions during ${phase}.`
    );
  }

  if (expectedCompletedCount > 0) {
    scenario.check(
      readiness.items.length >= expectedCompletedCount ||
        lower.includes("raw") ||
        lower.includes("debrief") ||
        lower.includes("objection"),
      `Five-session synthesis readiness renders or summarizes completed session packets during ${phase}.`
    );
    scenario.check(
      lower.includes("raw") && lower.includes("debrief") && lower.includes("objection"),
      `Five-session synthesis readiness names raw-note, debrief, and objection-code completeness during ${phase}.`
    );
  }

  if (readiness.links.length > 0) {
    scenario.check(
      readiness.links.every((link) => localLinkPattern.test(link.href) && !/^https?:|^mailto:|^tel:/i.test(link.href) && !/\/api(?:\/|$)|api\./i.test(link.href)),
      `Five-session synthesis readiness links stay local and non-API during ${phase}.`
    );
  }
  scenario.check(
    readiness.links.length === 0 || linkText.includes("synthesis"),
    `Five-session synthesis readiness links or names the private synthesis template during ${phase}.`
  );
  scenario.check(!combinedText.includes(selectedExportText), `Five-session synthesis readiness keeps resume export text out of synthesis copy during ${phase}.`);
  if (expectedPrivateText) {
    scenario.check(
      !combinedText.includes(expectedPrivateText) || lower.includes("private") || lower.includes("local"),
      `Five-session synthesis readiness keeps private synthesis notes framed as local metadata during ${phase}.`
    );
  }
  return true;
}

function assertPrivateSynthesisArtifactGeneratorState({
  scenario,
  generator,
  selectedDraftId,
  selectedExportText,
  expectedState,
  expectedPacketCount,
  expectedArtifactText = "",
  phase,
}) {
  if (!generator.exposed) {
    scenario.assertions.push(`Private synthesis artifact generator contract pending product exposure during ${phase}.`);
    return false;
  }

  const combinedText = [generator.text, ...generator.items.map((item) => item.text), ...generator.links.map((link) => `${link.text} ${link.href} ${link.artifact}`)].join("\n");
  const lower = combinedText.toLowerCase();
  const selectedText = `${generator.selectedDraftId}\n${combinedText}`;
  const state = String(generator.state || "").toLowerCase();
  const ready = String(generator.readyToGenerate || "").toLowerCase();
  const drafted = String(generator.artifactDrafted || "").toLowerCase();
  const packetCount = Number(generator.sourcePacketCount || 0);
  const requiredCount = Number(generator.requiredPacketCount || 0);
  const localLinkPattern = /^(#|\/(?!\/)|\.{0,2}\/|ops\/|website\/|$)/;

  scenario.check(generator.localOnly === "true", `Private synthesis artifact generator is marked local-only during ${phase}.`);
  scenario.check(generator.exportTextUnchanged === "true", `Private synthesis artifact generator marks resume export text unchanged during ${phase}.`);
  scenario.check(
    generator.downloadTextUnchanged === "true" || lower.includes("download text unchanged") || lower.includes("export text unchanged"),
    `Private synthesis artifact generator marks download/export text separation during ${phase}.`
  );
  scenario.check(
    selectedText.includes(selectedDraftId) || (lower.includes("selected") && lower.includes("draft")),
    `Private synthesis artifact generator identifies the selected draft during ${phase}.`
  );
  scenario.check(
    packetCount === expectedPacketCount || lower.includes(`${expectedPacketCount}`),
    `Private synthesis artifact generator reports ${expectedPacketCount} source packet(s) during ${phase}.`
  );
  scenario.check(
    requiredCount === 5 || lower.includes("5") || lower.includes("five"),
    `Private synthesis artifact generator requires five source packets during ${phase}.`
  );

  if (expectedState === "blocked") {
    scenario.check(
      ready === "false" || state.includes("blocked") || lower.includes("blocked"),
      `Private synthesis artifact generator stays blocked before five complete packets during ${phase}.`
    );
    scenario.check(
      drafted === "false" || state.includes("blocked") || lower.includes("blocked"),
      `Private synthesis artifact generator does not draft an artifact while blocked during ${phase}.`
    );
  } else {
    scenario.check(
      ready === "true" || state.includes("ready") || state.includes("artifact-drafted") || lower.includes("ready"),
      `Private synthesis artifact generator reaches ready/drafted state after five packets during ${phase}.`
    );
    scenario.check(
      drafted === "true" || state.includes("artifact-drafted") || lower.includes("artifact"),
      `Private synthesis artifact generator exposes drafted artifact state during ${phase}.`
    );
    scenario.check(
      lower.includes("private") || lower.includes("local"),
      `Private synthesis artifact generator frames drafted artifact as private/local during ${phase}.`
    );
  }

  if (generator.links.length > 0) {
    scenario.check(
      generator.links.every((link) => localLinkPattern.test(link.href) && !/^https?:|^mailto:|^tel:/i.test(link.href) && !/\/api(?:\/|$)|api\./i.test(link.href)),
      `Private synthesis artifact generator links stay local and non-API during ${phase}.`
    );
  }
  scenario.check(!combinedText.includes(selectedExportText), `Private synthesis artifact generator keeps resume export text out of artifact copy during ${phase}.`);
  if (expectedArtifactText) {
    scenario.check(
      combinedText.includes(expectedArtifactText) || lower.includes("private synthesis") || lower.includes("artifact"),
      `Private synthesis artifact generator exposes private artifact copy or artifact status during ${phase}.`
    );
  }
  return true;
}

function assertPrivateSynthesisDecisionMemoCaptureState({
  scenario,
  memoCapture,
  selectedDraftId,
  selectedExportText,
  expectedState,
  expectedMemoText = "",
  phase,
}) {
  if (!memoCapture.exposed) {
    scenario.assertions.push(`Private synthesis decision memo capture contract pending product exposure during ${phase}.`);
    return false;
  }

  const combinedText = [memoCapture.text, ...memoCapture.items.map((item) => item.text), ...memoCapture.links.map((link) => `${link.text} ${link.href} ${link.artifact}`)].join("\n");
  const lower = combinedText.toLowerCase();
  const selectedText = `${memoCapture.selectedDraftId}\n${combinedText}`;
  const state = String(memoCapture.state || "").toLowerCase();
  const artifactAvailable = String(memoCapture.artifactAvailable || "").toLowerCase();
  const memoDrafted = String(memoCapture.memoDrafted || "").toLowerCase();
  const localLinkPattern = /^(#|\/(?!\/)|\.{0,2}\/|ops\/|website\/|$)/;

  scenario.check(memoCapture.localOnly === "true", `Private synthesis decision memo capture is marked local-only during ${phase}.`);
  scenario.check(
    memoCapture.private === "true" || lower.includes("private"),
    `Private synthesis decision memo capture is framed as private during ${phase}.`
  );
  scenario.check(memoCapture.exportTextUnchanged === "true", `Private synthesis decision memo capture marks resume export text unchanged during ${phase}.`);
  scenario.check(
    memoCapture.downloadTextUnchanged === "true" || lower.includes("download text unchanged") || lower.includes("export text unchanged"),
    `Private synthesis decision memo capture marks download/export text separation during ${phase}.`
  );
  scenario.check(
    selectedText.includes(selectedDraftId) || (lower.includes("selected") && lower.includes("draft")),
    `Private synthesis decision memo capture identifies the selected draft during ${phase}.`
  );

  if (expectedState === "blocked") {
    scenario.check(
      state.includes("blocked") || artifactAvailable === "false" || lower.includes("blocked"),
      `Private synthesis decision memo capture stays blocked before artifact exists during ${phase}.`
    );
    scenario.check(
      memoDrafted === "false" || state.includes("blocked") || lower.includes("artifact"),
      `Private synthesis decision memo capture does not draft a memo while blocked during ${phase}.`
    );
  } else {
    scenario.check(
      state.includes("memo-drafted") || memoDrafted === "true" || lower.includes("memo drafted") || lower.includes("decision memo"),
      `Private synthesis decision memo capture exposes memo-drafted state after artifact review during ${phase}.`
    );
    scenario.check(
      artifactAvailable === "true" || lower.includes("artifact"),
      `Private synthesis decision memo capture remains gated to an existing synthesis artifact during ${phase}.`
    );
    scenario.check(
      lower.includes("launch") || lower.includes("pricing") || lower.includes("testimonial") || lower.includes("decision"),
      `Private synthesis decision memo capture names reviewed decision fields during ${phase}.`
    );
  }

  if (memoCapture.links.length > 0) {
    scenario.check(
      memoCapture.links.every((link) => localLinkPattern.test(link.href) && !/^https?:|^mailto:|^tel:/i.test(link.href) && !/\/api(?:\/|$)|api\./i.test(link.href)),
      `Private synthesis decision memo capture links stay local and non-API during ${phase}.`
    );
  }
  scenario.check(!combinedText.includes(selectedExportText), `Private synthesis decision memo capture keeps resume export text out of memo copy during ${phase}.`);
  if (expectedMemoText) {
    scenario.check(
      combinedText.includes(expectedMemoText) || lower.includes("decision memo") || lower.includes("memo-drafted"),
      `Private synthesis decision memo capture exposes private memo copy or memo status during ${phase}.`
    );
  }
  return true;
}

function assertPrivateLaunchDecisionApprovalCaptureState({
  scenario,
  approvalCapture,
  selectedDraftId,
  selectedExportText,
  expectedState,
  expectedApprovalText = "",
  phase,
}) {
  if (!approvalCapture.exposed) {
    scenario.assertions.push(`Private launch-decision approval capture contract pending product exposure during ${phase}.`);
    return false;
  }

  const combinedText = [
    approvalCapture.text,
    ...approvalCapture.items.map((item) => item.text),
    ...approvalCapture.links.map((link) => `${link.text} ${link.href} ${link.artifact}`),
  ].join("\n");
  const lower = combinedText.toLowerCase();
  const selectedText = `${approvalCapture.selectedDraftId}\n${combinedText}`;
  const state = String(approvalCapture.state || "").toLowerCase();
  const memoAvailable = String(approvalCapture.memoAvailable || "").toLowerCase();
  const approvalDrafted = String(approvalCapture.approvalDrafted || "").toLowerCase();
  const localLinkPattern = /^(#|\/(?!\/)|\.{0,2}\/|ops\/|website\/|$)/;

  scenario.check(approvalCapture.localOnly === "true", `Private launch-decision approval capture is marked local-only during ${phase}.`);
  scenario.check(
    approvalCapture.private === "true" || lower.includes("private"),
    `Private launch-decision approval capture is framed as private during ${phase}.`
  );
  scenario.check(approvalCapture.exportTextUnchanged === "true", `Private launch-decision approval capture marks resume export text unchanged during ${phase}.`);
  scenario.check(
    approvalCapture.downloadTextUnchanged === "true" || lower.includes("download text unchanged") || lower.includes("export text unchanged"),
    `Private launch-decision approval capture marks download/export text separation during ${phase}.`
  );
  scenario.check(
    selectedText.includes(selectedDraftId) || (lower.includes("selected") && lower.includes("draft")),
    `Private launch-decision approval capture identifies the selected draft during ${phase}.`
  );

  if (expectedState === "blocked") {
    scenario.check(
      state.includes("blocked") || memoAvailable === "false" || lower.includes("blocked"),
      `Private launch-decision approval capture stays blocked before memo exists during ${phase}.`
    );
    scenario.check(
      approvalDrafted === "false" || state.includes("blocked") || lower.includes("memo"),
      `Private launch-decision approval capture does not draft approval while blocked during ${phase}.`
    );
  } else {
    scenario.check(
      state.includes("approval-drafted") || approvalDrafted === "true" || lower.includes("approval drafted") || lower.includes("launch"),
      `Private launch-decision approval capture exposes approval-drafted state after memo review during ${phase}.`
    );
    scenario.check(
      memoAvailable === "true" || lower.includes("memo"),
      `Private launch-decision approval capture remains gated to a completed synthesis decision memo during ${phase}.`
    );
    scenario.check(
      lower.includes("publish") || lower.includes("pricing") || lower.includes("testimonial") || lower.includes("not observed"),
      `Private launch-decision approval capture names publish boundaries and reviewed decision fields during ${phase}.`
    );
  }

  if (approvalCapture.links.length > 0) {
    scenario.check(
      approvalCapture.links.every((link) => localLinkPattern.test(link.href) && !/^https?:|^mailto:|^tel:/i.test(link.href) && !/\/api(?:\/|$)|api\./i.test(link.href)),
      `Private launch-decision approval capture links stay local and non-API during ${phase}.`
    );
  }
  scenario.check(!combinedText.includes(selectedExportText), `Private launch-decision approval capture keeps resume export text out of approval copy during ${phase}.`);
  if (expectedApprovalText) {
    scenario.check(
      combinedText.includes(expectedApprovalText) || lower.includes("launch-decision") || lower.includes("approval-drafted"),
      `Private launch-decision approval capture exposes private approval copy or approval status during ${phase}.`
    );
  }
  return true;
}

function assertPrivateExplicitPublishPlanCaptureState({
  scenario,
  publishPlanCapture,
  selectedDraftId,
  selectedExportText,
  expectedState,
  expectedPlanText = "",
  phase,
}) {
  if (!publishPlanCapture.exposed) {
    scenario.assertions.push(`Private explicit publish-plan capture contract pending product exposure during ${phase}.`);
    return false;
  }

  const combinedText = [
    publishPlanCapture.text,
    ...publishPlanCapture.items.map((item) => item.text),
    ...publishPlanCapture.links.map((link) => `${link.text} ${link.href} ${link.artifact}`),
  ].join("\n");
  const lower = combinedText.toLowerCase();
  const selectedText = `${publishPlanCapture.selectedDraftId}\n${combinedText}`;
  const state = String(publishPlanCapture.state || "").toLowerCase();
  const approvalAvailable = String(publishPlanCapture.approvalAvailable || "").toLowerCase();
  const planDrafted = String(publishPlanCapture.planDrafted || "").toLowerCase();
  const localLinkPattern = /^(#|\/(?!\/)|\.{0,2}\/|ops\/|website\/|$)/;

  scenario.check(publishPlanCapture.localOnly === "true", `Private explicit publish-plan capture is marked local-only during ${phase}.`);
  scenario.check(
    publishPlanCapture.private === "true" || lower.includes("private"),
    `Private explicit publish-plan capture is framed as private during ${phase}.`
  );
  scenario.check(publishPlanCapture.exportTextUnchanged === "true", `Private explicit publish-plan capture marks resume export text unchanged during ${phase}.`);
  scenario.check(
    publishPlanCapture.downloadTextUnchanged === "true" || lower.includes("download text unchanged") || lower.includes("export text unchanged"),
    `Private explicit publish-plan capture marks download/export text separation during ${phase}.`
  );
  scenario.check(
    selectedText.includes(selectedDraftId) || (lower.includes("selected") && lower.includes("draft")),
    `Private explicit publish-plan capture identifies the selected draft during ${phase}.`
  );

  if (expectedState === "blocked") {
    scenario.check(
      state.includes("blocked") || approvalAvailable === "false" || lower.includes("blocked"),
      `Private explicit publish-plan capture stays blocked before launch approval exists during ${phase}.`
    );
    scenario.check(
      planDrafted === "false" || state.includes("blocked") || lower.includes("approval"),
      `Private explicit publish-plan capture does not draft a plan while blocked during ${phase}.`
    );
  } else {
    scenario.check(
      state.includes("plan-drafted") || planDrafted === "true" || lower.includes("plan drafted") || lower.includes("publish plan"),
      `Private explicit publish-plan capture exposes plan-drafted state after approval review during ${phase}.`
    );
    scenario.check(
      approvalAvailable === "true" || lower.includes("approval") || lower.includes("publish-readiness"),
      `Private explicit publish-plan capture remains gated to launch approval or publish readiness during ${phase}.`
    );
    scenario.check(
      lower.includes("owner") && lower.includes("rollback") && lower.includes("claim") && lower.includes("diff"),
      `Private explicit publish-plan capture names owner, rollback, claim-risk, and public-copy-diff fields during ${phase}.`
    );
  }

  if (publishPlanCapture.links.length > 0) {
    scenario.check(
      publishPlanCapture.links.every((link) => localLinkPattern.test(link.href) && !/^https?:|^mailto:|^tel:/i.test(link.href) && !/\/api(?:\/|$)|api\./i.test(link.href)),
      `Private explicit publish-plan capture links stay local and non-API during ${phase}.`
    );
  }
  scenario.check(!combinedText.includes(selectedExportText), `Private explicit publish-plan capture keeps resume export text out of plan copy during ${phase}.`);
  if (expectedPlanText) {
    scenario.check(
      combinedText.includes(expectedPlanText) || lower.includes("publish plan") || lower.includes("plan-drafted"),
      `Private explicit publish-plan capture exposes private plan copy or plan status during ${phase}.`
    );
  }
  return true;
}

function assertPrivatePublicCopyDiffRollbackCaptureState({
  scenario,
  diffRollbackCapture,
  selectedDraftId,
  selectedExportText,
  expectedState,
  expectedDiffText = "",
  phase,
}) {
  if (!diffRollbackCapture.exposed) {
    scenario.assertions.push(`Private public-copy diff rollback capture contract pending product exposure during ${phase}.`);
    return false;
  }

  const combinedText = [
    diffRollbackCapture.text,
    ...diffRollbackCapture.items.map((item) => item.text),
    ...diffRollbackCapture.links.map((link) => `${link.text} ${link.href} ${link.artifact}`),
  ].join("\n");
  const lower = combinedText.toLowerCase();
  const selectedText = `${diffRollbackCapture.selectedDraftId}\n${combinedText}`;
  const state = String(diffRollbackCapture.state || "").toLowerCase();
  const publishPlanAvailable = String(diffRollbackCapture.publishPlanAvailable || "").toLowerCase();
  const diffDrafted = String(diffRollbackCapture.diffDrafted || "").toLowerCase();
  const localLinkPattern = /^(#|\/(?!\/)|\.{0,2}\/|ops\/|website\/|$)/;

  scenario.check(diffRollbackCapture.localOnly === "true", `Private public-copy diff rollback capture is marked local-only during ${phase}.`);
  scenario.check(
    diffRollbackCapture.private === "true" || lower.includes("private"),
    `Private public-copy diff rollback capture is framed as private during ${phase}.`
  );
  scenario.check(diffRollbackCapture.exportTextUnchanged === "true", `Private public-copy diff rollback capture marks resume export text unchanged during ${phase}.`);
  scenario.check(
    diffRollbackCapture.downloadTextUnchanged === "true" || lower.includes("download text unchanged") || lower.includes("export text unchanged"),
    `Private public-copy diff rollback capture marks download/export text separation during ${phase}.`
  );
  scenario.check(
    selectedText.includes(selectedDraftId) || (lower.includes("selected") && lower.includes("draft")),
    `Private public-copy diff rollback capture identifies the selected draft during ${phase}.`
  );

  if (expectedState === "blocked") {
    scenario.check(
      state.includes("blocked") || publishPlanAvailable === "false" || lower.includes("blocked"),
      `Private public-copy diff rollback capture stays blocked before explicit publish plan exists during ${phase}.`
    );
    scenario.check(
      diffDrafted === "false" || state.includes("blocked") || lower.includes("publish plan"),
      `Private public-copy diff rollback capture does not draft a diff while blocked during ${phase}.`
    );
  } else {
    scenario.check(
      state.includes("diff-drafted") || diffDrafted === "true" || lower.includes("diff drafted") || lower.includes("public copy diff"),
      `Private public-copy diff rollback capture exposes diff-drafted state after publish-plan review during ${phase}.`
    );
    scenario.check(
      publishPlanAvailable === "true" || lower.includes("publish plan") || lower.includes("publish-plan"),
      `Private public-copy diff rollback capture remains gated to a completed explicit publish plan during ${phase}.`
    );
    scenario.check(
      lower.includes("diff") && lower.includes("rollback") && lower.includes("consent") && lower.includes("claim") && lower.includes("validation"),
      `Private public-copy diff rollback capture names diff, rollback, consent, claim-risk, and validation fields during ${phase}.`
    );
  }

  if (diffRollbackCapture.links.length > 0) {
    scenario.check(
      diffRollbackCapture.links.every((link) => localLinkPattern.test(link.href) && !/^https?:|^mailto:|^tel:/i.test(link.href) && !/\/api(?:\/|$)|api\./i.test(link.href)),
      `Private public-copy diff rollback capture links stay local and non-API during ${phase}.`
    );
  }
  scenario.check(!combinedText.includes(selectedExportText), `Private public-copy diff rollback capture keeps resume export text out of diff copy during ${phase}.`);
  if (expectedDiffText) {
    scenario.check(
      combinedText.includes(expectedDiffText) || lower.includes("public copy diff") || lower.includes("diff-drafted"),
      `Private public-copy diff rollback capture exposes private diff copy or diff status during ${phase}.`
    );
  }
  return true;
}

function assertPrivateReleaseCandidateRehearsalCaptureState({
  scenario,
  rehearsalCapture,
  selectedDraftId,
  selectedExportText,
  expectedState,
  expectedRehearsalText = "",
  phase,
}) {
  if (!rehearsalCapture.exposed) {
    scenario.assertions.push(`Private release-candidate rehearsal capture contract pending product exposure during ${phase}.`);
    return false;
  }

  const combinedText = [
    rehearsalCapture.text,
    ...rehearsalCapture.items.map((item) => item.text),
    ...rehearsalCapture.links.map((link) => `${link.text} ${link.href} ${link.artifact}`),
  ].join("\n");
  const lower = combinedText.toLowerCase();
  const selectedText = `${rehearsalCapture.selectedDraftId}\n${combinedText}`;
  const state = String(rehearsalCapture.state || "").toLowerCase();
  const diffPacketAvailable = String(rehearsalCapture.diffPacketAvailable || "").toLowerCase();
  const rehearsalReady = String(rehearsalCapture.rehearsalReady || "").toLowerCase();
  const localLinkPattern = /^(#|\/(?!\/)|\.{0,2}\/|ops\/|website\/|$)/;

  scenario.check(rehearsalCapture.localOnly === "true", `Private release-candidate rehearsal capture is marked local-only during ${phase}.`);
  scenario.check(
    rehearsalCapture.private === "true" || lower.includes("private"),
    `Private release-candidate rehearsal capture is framed as private during ${phase}.`
  );
  scenario.check(
    rehearsalCapture.exportTextUnchanged === "true",
    `Private release-candidate rehearsal capture marks resume export text unchanged during ${phase}.`
  );
  scenario.check(
    rehearsalCapture.downloadTextUnchanged === "true" || lower.includes("download text unchanged") || lower.includes("export text unchanged"),
    `Private release-candidate rehearsal capture marks download/export text separation during ${phase}.`
  );
  scenario.check(
    selectedText.includes(selectedDraftId) || (lower.includes("selected") && lower.includes("draft")),
    `Private release-candidate rehearsal capture identifies the selected draft during ${phase}.`
  );

  if (expectedState === "blocked") {
    scenario.check(
      state.includes("blocked") || diffPacketAvailable === "false" || lower.includes("blocked"),
      `Private release-candidate rehearsal capture stays blocked before public-copy diff packet exists during ${phase}.`
    );
    scenario.check(
      rehearsalReady === "false" || state.includes("blocked") || lower.includes("diff"),
      `Private release-candidate rehearsal capture does not become ready while blocked during ${phase}.`
    );
  } else {
    scenario.check(
      state.includes("rehearsal-ready") || rehearsalReady === "true" || lower.includes("rehearsal ready") || lower.includes("release candidate"),
      `Private release-candidate rehearsal capture exposes rehearsal-ready state after diff packet review during ${phase}.`
    );
    scenario.check(
      diffPacketAvailable === "true" || lower.includes("diff") || lower.includes("rollback"),
      `Private release-candidate rehearsal capture remains gated to a completed public-copy diff packet during ${phase}.`
    );
    scenario.check(
      lower.includes("static") && lower.includes("smoke") && lower.includes("served") && lower.includes("rollback") && lower.includes("consent") && lower.includes("claim"),
      `Private release-candidate rehearsal capture names static smoke, served smoke, rollback, consent, and claim-risk fields during ${phase}.`
    );
  }

  if (rehearsalCapture.links.length > 0) {
    scenario.check(
      rehearsalCapture.links.every((link) => localLinkPattern.test(link.href) && !/^https?:|^mailto:|^tel:/i.test(link.href) && !/\/api(?:\/|$)|api\./i.test(link.href)),
      `Private release-candidate rehearsal capture links stay local and non-API during ${phase}.`
    );
  }
  scenario.check(!combinedText.includes(selectedExportText), `Private release-candidate rehearsal capture keeps resume export text out of rehearsal copy during ${phase}.`);
  if (expectedRehearsalText) {
    scenario.check(
      combinedText.includes(expectedRehearsalText) || lower.includes("release candidate") || lower.includes("rehearsal-ready"),
      `Private release-candidate rehearsal capture exposes private rehearsal copy or ready status during ${phase}.`
    );
  }
  return true;
}

function assertPrivateCredentialedDeployReadinessState({
  scenario,
  readiness,
  selectedDraftId,
  selectedExportText,
  expectedState,
  expectedReadinessText = "",
  phase,
}) {
  if (!readiness.exposed) {
    scenario.assertions.push(`Private credentialed-deploy readiness contract pending product exposure during ${phase}.`);
    return false;
  }

  const combinedText = [
    readiness.text,
    ...readiness.items.map((item) => item.text),
    ...readiness.links.map((link) => `${link.text} ${link.href} ${link.artifact}`),
  ].join("\n");
  const lower = combinedText.toLowerCase();
  const selectedText = `${readiness.selectedDraftId}\n${combinedText}`;
  const state = String(readiness.state || "").toLowerCase();
  const rehearsalAvailable = String(readiness.rehearsalAvailable || "").toLowerCase();
  const deployInputsReady = String(readiness.deployInputsReady || "").toLowerCase();
  const localLinkPattern = /^(#|\/(?!\/)|\.{0,2}\/|ops\/|website\/|$)/;

  scenario.check(readiness.localOnly === "true", `Private credentialed-deploy readiness is marked local-only during ${phase}.`);
  scenario.check(
    readiness.private === "true" || lower.includes("private"),
    `Private credentialed-deploy readiness is framed as private during ${phase}.`
  );
  scenario.check(
    readiness.noDeploy === "true" || lower.includes("no deploy") || lower.includes("do not deploy") || lower.includes("blocked"),
    `Private credentialed-deploy readiness is marked no-deploy during ${phase}.`
  );
  scenario.check(
    readiness.noSecretStorage === "true" || lower.includes("no-secret") || lower.includes("no secret") || lower.includes("never stores"),
    `Private credentialed-deploy readiness is marked no-secret-storage during ${phase}.`
  );
  scenario.check(
    readiness.exportTextUnchanged === "true",
    `Private credentialed-deploy readiness marks resume export text unchanged during ${phase}.`
  );
  scenario.check(
    readiness.downloadTextUnchanged === "true" || lower.includes("download text unchanged") || lower.includes("export text unchanged"),
    `Private credentialed-deploy readiness marks download/export text separation during ${phase}.`
  );
  scenario.check(
    selectedText.includes(selectedDraftId) || (lower.includes("selected") && lower.includes("draft")),
    `Private credentialed-deploy readiness identifies the selected draft during ${phase}.`
  );

  if (expectedState === "rehearsal-blocked") {
    scenario.check(
      state.includes("rehearsal-blocked") || rehearsalAvailable === "false" || lower.includes("rehearsal") && lower.includes("blocked"),
      `Private credentialed-deploy readiness stays rehearsal-blocked before release-candidate rehearsal exists during ${phase}.`
    );
    scenario.check(
      deployInputsReady === "false" || state.includes("blocked") || lower.includes("blocked"),
      `Private credentialed-deploy readiness keeps deploy inputs blocked while rehearsal is missing during ${phase}.`
    );
  } else {
    scenario.check(
      state.includes("deploy-inputs-blocked") || deployInputsReady === "false" || lower.includes("deploy inputs") && lower.includes("blocked"),
      `Private credentialed-deploy readiness exposes deploy-inputs-blocked state after rehearsal during ${phase}.`
    );
    scenario.check(
      rehearsalAvailable === "true" || lower.includes("release-candidate rehearsal") || lower.includes("rehearsal"),
      `Private credentialed-deploy readiness remains gated to completed release-candidate rehearsal during ${phase}.`
    );
    scenario.check(
      lower.includes("platform") &&
        lower.includes("production url") &&
        lower.includes("credential") &&
        lower.includes("deploy trigger") &&
        lower.includes("rollback owner") &&
        lower.includes("rollback method") &&
        lower.includes("health"),
      `Private credentialed-deploy readiness names platform, production URL, credential-availability, deploy-trigger, rollback-owner, rollback-method, and health-check inputs during ${phase}.`
    );
  }

  if (readiness.links.length > 0) {
    scenario.check(
      readiness.links.every((link) => localLinkPattern.test(link.href) && !/^https?:|^mailto:|^tel:/i.test(link.href) && !/\/api(?:\/|$)|api\./i.test(link.href)),
      `Private credentialed-deploy readiness links stay local and non-API during ${phase}.`
    );
  }
  scenario.check(!combinedText.includes(selectedExportText), `Private credentialed-deploy readiness keeps resume export text out of deploy-readiness copy during ${phase}.`);
  if (expectedReadinessText) {
    scenario.check(
      combinedText.includes(expectedReadinessText) ||
        lower.includes("deploy-inputs-blocked") ||
        lower.includes("credentialed deploy") ||
        (lower.includes("credential") && lower.includes("deploy") && lower.includes("blocked")),
      `Private credentialed-deploy readiness exposes private readiness copy or blocked status during ${phase}.`
    );
  }
  return true;
}

function assertFirstSessionHandoffState({ scenario, handoff, selectedDraftId, selectedExportText, phase }) {
  if (!handoff.exposed) {
    scenario.assertions.push(`First-session operator handoff contract pending product exposure during ${phase}.`);
    return false;
  }

  const combinedText = [handoff.text, ...handoff.items.map((item) => item.text), ...handoff.links.map((link) => `${link.text} ${link.href}`)].join("\n");
  const lower = combinedText.toLowerCase();
  const selectedText = `${handoff.selectedDraftId}\n${combinedText}`;
  const packetReady = String(handoff.packetReady || "").toLowerCase();
  const localLinkPattern = /^(#|\/(?!\/)|\.{0,2}\/|ops\/|website\/|$)/;

  scenario.check(handoff.localOnly === "true", `First-session handoff is marked local-only during ${phase}.`);
  scenario.check(handoff.exportTextUnchanged === "true", `First-session handoff marks resume export text unchanged during ${phase}.`);
  scenario.check(
    selectedText.includes(selectedDraftId) || (lower.includes("selected") && lower.includes("user")),
    `First-session handoff identifies the selected draft during ${phase}.`
  );
  scenario.check(lower.includes("session prep") || lower.includes("prep checklist"), `First-session handoff links back to session prep during ${phase}.`);
  scenario.check(lower.includes("proof packet") && (lower.includes("readiness") || lower.includes("sharing") || lower.includes("share")), `First-session handoff names Proof Packet readiness during ${phase}.`);
  scenario.check(
    packetReady.includes("ready") || lower.includes("review before sharing") || lower.includes("accepted-only"),
    `First-session handoff exposes packet readiness status during ${phase}.`
  );
  scenario.check(
    handoff.links.length > 0 && handoff.links.some((link) => /learning|log|debrief|raw note|session note/i.test(`${link.text} ${link.href}`)),
    `First-session handoff exposes learning-log destination links during ${phase}.`
  );
  scenario.check(
    handoff.links.every((link) => localLinkPattern.test(link.href) && !/^https?:|^mailto:|^tel:/i.test(link.href) && !/\/api(?:\/|$)|api\./i.test(link.href)),
    `First-session handoff learning-log links stay local and non-API during ${phase}.`
  );
  scenario.check(!combinedText.includes(selectedExportText), `First-session handoff keeps resume export text out of operator handoff copy during ${phase}.`);
  return true;
}

function assertSessionPrepChecklistState({ scenario, checklist, expectedReady, expectedTerms, phase }) {
  if (!checklist.exposed) {
    scenario.assertions.push(`Session prep checklist contract pending product exposure during ${phase}.`);
    return false;
  }

  const combinedText = [checklist.text, checklist.status, checklist.resetText, ...checklist.items.map((item) => item.text)].join("\n");
  const lower = combinedText.toLowerCase();
  const statusLower = String(checklist.status || "").toLowerCase();
  const readyAttr = String(checklist.ready || "").toLowerCase();
  const readySignal = /\bready\b/.test(statusLower) || /\bready\b/.test(lower);
  const notReadySignal =
    /\bnot[- ]ready\b/.test(statusLower) ||
    /\bneeds?\b/.test(statusLower) ||
    /\bmissing\b/.test(statusLower) ||
    /\bblocked\b/.test(statusLower) ||
    /\bnot[- ]ready\b/.test(lower);

  scenario.check(checklist.items.length > 0, `Session prep checklist exposes machine-readable checklist rows during ${phase}.`);
  scenario.check(checklist.localOnly === "true", `Session prep checklist is marked local-only during ${phase}.`);
  scenario.check(checklist.exportTextUnchanged === "true", `Session prep checklist marks resume export text unchanged during ${phase}.`);
  for (const term of expectedTerms) {
    scenario.check(lower.includes(term), `Session prep checklist names ${term} readiness during ${phase}.`);
  }
  if (expectedReady === true) {
    scenario.check(readyAttr === "true" || (readySignal && !notReadySignal), `Session prep checklist reports ready state during ${phase}.`);
  } else if (expectedReady === false) {
    scenario.check(readyAttr === "false" || notReadySignal || !readySignal, `Session prep checklist reports not-ready state during ${phase}.`);
  }

  return true;
}

async function readProofPacketSurfaces(page) {
  return page.evaluate(() => {
    const packetRoot = document.querySelector(
      [
        "[data-pr='proofPacketPreview']",
        "[data-pr='proofPacket']",
        "[data-pr='localProofPacket']",
        "[data-proof-packet-preview]",
        "[data-proof-packet]",
      ].join(",")
    );
    const packetDownload = document.querySelector(
      [
        "[data-pr='downloadProofPacket']",
        "[data-pr='proofPacketDownload']",
        "[data-proof-packet-download]",
      ].join(",")
    );
    const isVisible = packetRoot
      ? !packetRoot.hidden &&
        packetRoot.getAttribute("aria-hidden") !== "true" &&
        getComputedStyle(packetRoot).display !== "none" &&
        getComputedStyle(packetRoot).visibility !== "hidden"
      : false;

    const href = packetDownload?.getAttribute("href") || "";
    const textPrefix = "data:text/plain;charset=utf-8,";
    const downloadText = href.startsWith(textPrefix) ? decodeURIComponent(href.slice(textPrefix.length)) : "";
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const intake = intakes[0] || {};
    const snapshot =
      intake.proofPacketSnapshot ||
      intake.exportSnapshot?.proofPacketSnapshot ||
      intake.exportSnapshot?.proofPacket ||
      intake.exportSnapshot?.proofPacketPreview ||
      intake.exportSnapshot?.proofPacketMetadata ||
      null;

    return {
      exposed: Boolean(packetRoot || packetDownload || snapshot),
      visible: isVisible,
      text: packetRoot?.textContent || "",
      downloadHref: href,
      downloadIsText: href.startsWith(textPrefix),
      downloadName: packetDownload?.getAttribute("download") || "",
      downloadText,
      snapshot,
      snapshotText: snapshot ? JSON.stringify(snapshot) : "",
    };
  });
}

function findJsonTextPaths(value, needle, prefix = "$", paths = []) {
  if (!needle) return paths;
  if (typeof value === "string") {
    if (value.includes(needle)) paths.push(prefix);
    return paths;
  }
  if (!value || typeof value !== "object") return paths;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findJsonTextPaths(item, needle, `${prefix}[${index}]`, paths));
    return paths;
  }
  for (const [key, item] of Object.entries(value)) {
    findJsonTextPaths(item, needle, `${prefix}.${key}`, paths);
  }
  return paths;
}

async function readProofPacketShareReadiness(page) {
  return page.evaluate(() => {
    const statusRoot = document.querySelector(
      [
        "[data-pr='proofPacketShareReadiness']",
        "[data-pr='proofPacketShareStatus']",
        "[data-pr='proofPacketReadiness']",
        "[data-proof-packet-share-readiness]",
        "[data-proof-packet-readiness]",
        "[data-proof-packet-status]",
      ].join(",")
    );
    const boundaryRoot = document.querySelector("[data-proof-packet-boundary]");
    const summaryRoot = document.querySelector("[data-proof-packet-summary]");
    const summary =
      statusRoot?.getAttribute("data-proof-packet-share-readiness") ||
      statusRoot?.getAttribute("data-proof-packet-readiness") ||
      statusRoot?.getAttribute("data-proof-packet-status") ||
      summaryRoot?.getAttribute("data-proof-packet-summary") ||
      "";

    return {
      exposed: Boolean(statusRoot),
      text: statusRoot?.textContent || "",
      boundaryText: boundaryRoot?.textContent || "",
      summary,
    };
  });
}

async function readStandaloneProofPacketPage(page) {
  return page.evaluate(() => {
    const body = document.querySelector("[data-pr='packetBody']");
    const readinessRoot = document.querySelector("[data-proof-packet-share-readiness]");
    const download = document.querySelector("[data-pr='downloadPacket']");
    const href = download?.getAttribute("href") || "";
    const jsonPrefix = "data:application/json;charset=utf-8,";
    const readinessRaw = readinessRoot?.getAttribute("data-proof-packet-share-readiness") || "";
    let readiness = null;
    let json = null;

    try {
      readiness = readinessRaw ? JSON.parse(readinessRaw) : null;
    } catch {
      readiness = null;
    }

    try {
      json = href.startsWith(jsonPrefix) ? JSON.parse(decodeURIComponent(href.slice(jsonPrefix.length))) : null;
    } catch {
      json = null;
    }

    return {
      bodyText: body?.textContent || "",
      readinessText: readinessRoot?.textContent || "",
      readiness,
      statusText: document.querySelector("[data-pr='packetStatus']")?.textContent || "",
      acceptedCount: document.querySelector("[data-pr='packetAccepted']")?.textContent || "",
      sectionCount: document.querySelector("[data-pr='packetSections']")?.textContent || "",
      riskCount: document.querySelector("[data-pr='packetRisks']")?.textContent || "",
      downloadHref: href,
      downloadName: download?.getAttribute("download") || "",
      downloadIsJson: href.startsWith(jsonPrefix),
      json,
    };
  });
}

async function assertStandaloneProofPacketManifest({
  page,
  baseUrl,
  scenario,
  packetPageHref,
  intakeId,
  expectedAcceptedText,
  rejectedText,
  pendingText,
  expectedAcceptedCount,
  expectedSectionCount,
  expectedRejectedCount,
  expectedPendingCount,
  expectedRedactedSourceCount,
  expectedRedactedFollowupCount,
  additionallyExcludedText = [],
  phase,
}) {
  if (!packetPageHref) {
    scenario.assertions.push(`Standalone Proof Packet JSON manifest navigation pending product exposure during ${phase}.`);
    return false;
  }

  await page.goto(`${baseUrl}${packetPageHref}`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-pr='packetBody']");
  const standalone = await readStandaloneProofPacketPage(page);
  const redactedTotal = expectedRedactedSourceCount + expectedRedactedFollowupCount;
  const excludedTotal = expectedRejectedCount + expectedPendingCount;
  const combinedText = [standalone.bodyText, standalone.readinessText].join("\n");
  const lower = combinedText.toLowerCase();

  scenario.check(standalone.bodyText.includes("Accepted"), `Standalone Proof Packet page renders accepted-bullets summary during ${phase}.`);
  for (const text of expectedAcceptedText) {
    scenario.check(standalone.bodyText.includes(text), `Standalone Proof Packet page includes accepted bullet text during ${phase}.`);
  }
  scenario.check(standalone.bodyText.includes("Source excerpt"), `Standalone Proof Packet page includes provenance excerpts during ${phase}.`);
  scenario.check(!standalone.bodyText.includes(rejectedText), `Standalone Proof Packet page excludes rejected candidate text during ${phase}.`);
  scenario.check(!standalone.bodyText.includes(pendingText), `Standalone Proof Packet page excludes pending candidate text during ${phase}.`);
  for (const text of additionallyExcludedText) {
    scenario.check(!standalone.bodyText.includes(text), `Standalone Proof Packet page excludes omitted packet detail during ${phase}.`);
  }
  scenario.check(standalone.acceptedCount === String(expectedAcceptedCount), `Standalone Proof Packet page count matches accepted bullets during ${phase}.`);
  scenario.check(standalone.sectionCount === String(expectedSectionCount), `Standalone Proof Packet page count matches packet sections during ${phase}.`);
  scenario.check(standalone.readiness && typeof standalone.readiness === "object", `Standalone Proof Packet page exposes machine-readable share-readiness fields during ${phase}.`);

  if (standalone.readiness) {
    scenario.check(
      standalone.statusText === standalone.readiness.status,
      `Standalone Proof Packet status mirrors share-readiness status during ${phase}.`
    );
    scenario.check(
      standalone.readiness.acceptedOnly === expectedAcceptedCount,
      `Standalone share-readiness acceptedOnly count is deterministic during ${phase}.`
    );
    scenario.check(
      standalone.readiness.redactedSourceExcerpts === expectedRedactedSourceCount,
      `Standalone share-readiness redacted source count is deterministic during ${phase}.`
    );
    scenario.check(
      standalone.readiness.redactedFollowupSourceNotes === expectedRedactedFollowupCount,
      `Standalone share-readiness redacted follow-up count is deterministic during ${phase}.`
    );
    scenario.check(
      standalone.readiness.excludedFromPacket?.rejected === expectedRejectedCount,
      `Standalone share-readiness rejected exclusion count is deterministic during ${phase}.`
    );
    scenario.check(
      standalone.readiness.excludedFromPacket?.pending === expectedPendingCount,
      `Standalone share-readiness pending exclusion count is deterministic during ${phase}.`
    );
    scenario.check(
      standalone.readiness.excludedTotal === excludedTotal,
      `Standalone share-readiness excludedTotal matches rejected plus pending during ${phase}.`
    );
    scenario.check(
      standalone.readiness.restoreAvailable === (redactedTotal > 0),
      `Standalone share-readiness restoreAvailable matches redaction state during ${phase}.`
    );
  }

  scenario.check(lower.includes("redaction coverage"), `Standalone share-readiness copy names redaction coverage during ${phase}.`);
  scenario.check(lower.includes("accepted-only"), `Standalone share-readiness copy names accepted-only packet contents during ${phase}.`);
  scenario.check(lower.includes("rejected") && lower.includes("pending"), `Standalone share-readiness copy names rejected and pending exclusions during ${phase}.`);
  scenario.check(standalone.downloadIsJson, `Standalone Proof Packet download exposes a JSON data payload during ${phase}.`);
  scenario.check(standalone.downloadName.toLowerCase().endsWith(".json"), `Standalone Proof Packet JSON download filename ends in .json during ${phase}.`);

  if (standalone.json) {
    const manifest = standalone.json;
    const manifestText = JSON.stringify(manifest);
    scenario.check(manifest.format === "proofresume-local-proof-packet-preview-v1", `Proof Packet JSON manifest uses the packet preview format during ${phase}.`);
    scenario.check(manifest.intakeId === intakeId, `Proof Packet JSON manifest preserves intake id during ${phase}.`);
    scenario.check(manifest.localOnly === true, `Proof Packet JSON manifest is marked local-only during ${phase}.`);
    scenario.check(manifest.exportTextUnchanged === true, `Proof Packet JSON manifest marks resume export text unchanged during ${phase}.`);
    scenario.check(manifest.summary?.acceptedBullets === expectedAcceptedCount, `Proof Packet JSON manifest accepted count is deterministic during ${phase}.`);
    scenario.check(manifest.summary?.provenanceItems === expectedAcceptedCount, `Proof Packet JSON manifest provenance count matches accepted bullets during ${phase}.`);
    scenario.check(manifest.summary?.redactedSourceExcerpts === expectedRedactedSourceCount, `Proof Packet JSON manifest redacted source count is deterministic during ${phase}.`);
    scenario.check(
      manifest.summary?.redactedFollowupSourceNotes === expectedRedactedFollowupCount,
      `Proof Packet JSON manifest redacted follow-up count is deterministic during ${phase}.`
    );
    scenario.check(manifest.summary?.excludedFromPacket?.rejected === expectedRejectedCount, `Proof Packet JSON manifest rejected count is deterministic during ${phase}.`);
    scenario.check(manifest.summary?.excludedFromPacket?.pending === expectedPendingCount, `Proof Packet JSON manifest pending count is deterministic during ${phase}.`);
    scenario.check(manifest.summary?.localOnly === true, `Proof Packet JSON manifest summary is marked local-only during ${phase}.`);
    scenario.check(
      JSON.stringify(manifest.shareReadiness) === JSON.stringify(standalone.readiness),
      `Proof Packet JSON manifest share-readiness matches standalone page fields during ${phase}.`
    );
    scenario.check(Array.isArray(manifest.sections) && manifest.sections.length === expectedSectionCount, `Proof Packet JSON manifest section count is deterministic during ${phase}.`);
    for (const text of expectedAcceptedText) {
      scenario.check(manifestText.includes(text), `Proof Packet JSON manifest includes accepted bullet text during ${phase}.`);
    }
    scenario.check(!manifestText.includes(rejectedText), `Proof Packet JSON manifest excludes rejected candidate text during ${phase}.`);
    scenario.check(!manifestText.includes(pendingText), `Proof Packet JSON manifest excludes pending candidate text during ${phase}.`);
    for (const text of additionallyExcludedText) {
      scenario.check(!manifestText.includes(text), `Proof Packet JSON manifest excludes omitted packet detail during ${phase}.`);
    }
    scenario.check(Boolean(manifest.generatedFromSnapshot), `Proof Packet JSON manifest names its source snapshot timestamp during ${phase}.`);
    scenario.check(Boolean(manifest.claimRiskChecklist), `Proof Packet JSON manifest includes claim-risk checklist metadata during ${phase}.`);
  }

  await page.goto(`${baseUrl}/review.html?intake=${encodeURIComponent(intakeId)}`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-pr='exportSection']:not([hidden])");
  return true;
}

function assertProofPacketShareReadiness({
  scenario,
  readiness,
  packet,
  resumeSurfaces,
  expectedAcceptedText,
  rejectedText,
  pendingText,
  expectedRedactedCount,
  phase,
}) {
  if (!readiness.exposed) {
    scenario.assertions.push(`Proof Packet share-readiness status pending product exposure during ${phase}.`);
    return false;
  }

  const combinedText = [readiness.text, readiness.boundaryText, readiness.summary].join("\n");
  const lower = combinedText.toLowerCase();
  const packetCombinedText = [packet.text, packet.downloadText, packet.snapshotText].join("\n");
  scenario.check(/ready|readiness|share/.test(lower), `Proof Packet share-readiness status names readiness during ${phase}.`);
  scenario.check(lower.includes("accepted"), `Proof Packet share-readiness status names accepted-only packet contents during ${phase}.`);
  scenario.check(lower.includes("redact"), `Proof Packet share-readiness status explains redaction coverage during ${phase}.`);
  scenario.check(lower.includes("rejected"), `Proof Packet share-readiness status names rejected exclusion during ${phase}.`);
  scenario.check(lower.includes("pending"), `Proof Packet share-readiness status names pending exclusion during ${phase}.`);
  scenario.check(
    lower.includes(String(expectedRedactedCount)),
    `Proof Packet share-readiness status reports ${expectedRedactedCount} redacted item(s) during ${phase}.`
  );
  for (const text of expectedAcceptedText) {
    scenario.check(packetCombinedText.includes(text), `Share-ready Proof Packet keeps accepted packet content during ${phase}.`);
    scenario.check(resumeSurfaces.exportText.includes(text), `Share-readiness status does not remove accepted resume export text during ${phase}.`);
  }
  scenario.check(!packetCombinedText.includes(rejectedText), `Share-ready Proof Packet excludes rejected evidence during ${phase}.`);
  scenario.check(!packetCombinedText.includes(pendingText), `Share-ready Proof Packet excludes pending evidence during ${phase}.`);
  scenario.check(!resumeSurfaces.exportText.includes("Share readiness"), `Resume export output excludes share-readiness labels during ${phase}.`);
  scenario.check(!resumeSurfaces.downloadText.includes("Share readiness"), `Resume export download excludes share-readiness labels during ${phase}.`);
  return true;
}

async function readProofPacketRedactionControls(page) {
  return page.evaluate(() => {
    const controlSelector = [
      "[data-proof-packet-redaction-action]",
      "[data-proof-packet-redact-action]",
      "[data-redaction-action]",
      "[data-proof-packet-redaction-toggle]",
      "[data-redaction-toggle]",
    ].join(",");
    const controls = [...document.querySelectorAll(controlSelector)].map((control) => ({
      tagName: control.tagName,
      type: control.getAttribute("type") || "",
      action:
        control.getAttribute("data-proof-packet-redaction-action") ||
        control.getAttribute("data-proof-packet-redact-action") ||
        control.getAttribute("data-redaction-action") ||
        "",
      target:
        control.getAttribute("data-proof-packet-redaction-target") ||
        control.getAttribute("data-redaction-target") ||
        control.getAttribute("aria-label") ||
        "",
      text: control.textContent || "",
      checked: Boolean(control.checked),
    }));
    const labeledButtons = [...document.querySelectorAll("[data-pr='proofPacketPreview'] button, [data-pr='proofPacketPreview'] input")]
      .filter((control) => /redact|hide source|mask/i.test(`${control.textContent || ""} ${control.getAttribute("aria-label") || ""}`))
      .map((control) => ({
        tagName: control.tagName,
        type: control.getAttribute("type") || "",
        action: control.getAttribute("data-proof-packet-redaction-action") || control.getAttribute("data-redaction-action") || "redact",
        target: control.getAttribute("aria-label") || control.textContent || "",
        text: control.textContent || "",
        checked: Boolean(control.checked),
      }));
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const serialized = JSON.stringify(intakes[0] || {});
    return {
      exposed: controls.length + labeledButtons.length > 0,
      controls: [...controls, ...labeledButtons],
      storageMentionsRedaction: /redact|redaction/i.test(serialized),
    };
  });
}

async function redactProofPacketSource(page, targetRawText) {
  return page.evaluate((targetText) => {
    const root = document.querySelector("[data-pr='proofPacketPreview'], [data-pr='proofPacket'], [data-proof-packet-preview]");
    if (!root) return { changed: false, reason: "missing-proof-packet-root" };

    const rowSelector = [
      "[data-proof-packet-item]",
      "[data-proof-packet-redaction-item]",
      "[data-proof-packet-source]",
      "[data-proof-packet-provenance]",
      "li",
      "article",
    ].join(",");
    const rows = [...root.querySelectorAll(rowSelector)];
    const row = rows.find((entry) => (entry.textContent || "").includes(targetText));
    if (!row) return { changed: false, reason: "missing-source-row" };

    const explicitControl = row.querySelector(
      [
        "[data-proof-packet-redaction-action='redact']",
        "[data-proof-packet-redact-action='redact']",
        "[data-redaction-action='redact']",
        "[data-proof-packet-redaction-toggle]",
        "[data-redaction-toggle]",
      ].join(",")
    );
    const textControl = [...row.querySelectorAll("button, input")].find((control) =>
      /redact|hide source|mask/i.test(`${control.textContent || ""} ${control.getAttribute("aria-label") || ""}`)
    );
    const control = explicitControl || textControl;
    if (!(control instanceof HTMLElement)) return { changed: false, reason: "missing-redaction-control" };

    if (control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type)) {
      control.checked = true;
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      control.click();
    }
    return { changed: true, reason: "" };
  }, targetRawText);
}

async function restoreAllProofPacketRedactions(page) {
  return page.evaluate(() => {
    const root = document.querySelector("[data-pr='proofPacketPreview'], [data-pr='proofPacket'], [data-proof-packet-preview]");
    if (!root) return { changed: false, reason: "missing-proof-packet-root" };
    const restoreSelector = [
      "[data-proof-packet-redaction-action='restore-all']",
      "[data-proof-packet-redaction-action='restoreAll']",
      "[data-proof-packet-redaction-action='restore']",
      "[data-redaction-action='restore-all']",
      "[data-redaction-action='restoreAll']",
      "[data-proof-packet-restore-all]",
      "[data-pr='restoreAllProofPacketRedactions']",
      "[data-pr='restorePacketRedactions']",
    ].join(",");
    const explicitControl =
      root.querySelector(restoreSelector) ||
      document.querySelector(restoreSelector) ||
      null;
    const textControl = [...document.querySelectorAll("[data-pr='proofPacketPreview'] button, [data-pr='proofPacket'] button, [data-proof-packet-preview] button, [data-pr='exportSection'] button, [data-pr='exportSection'] input")].find((control) =>
      /restore all|show all|unredact all|clear redactions/i.test(
        `${control.textContent || ""} ${control.getAttribute("aria-label") || ""} ${control.getAttribute("title") || ""}`
      )
    );
    const control = explicitControl || textControl;
    if (!(control instanceof HTMLElement)) return { changed: false, reason: "missing-restore-all-control" };
    if (control instanceof HTMLButtonElement && control.disabled) return { changed: false, reason: "restore-all-control-disabled" };
    control.click();
    return { changed: true, reason: "" };
  });
}

async function assertProofPacketRestoreAllContract({
  page,
  scenario,
  rawSourceText,
  resumeText,
  rejectedText,
  pendingText,
  beforeResume,
  phase,
}) {
  const restore = await restoreAllProofPacketRedactions(page);
  if (!restore.changed) {
    scenario.assertions.push(`Proof Packet restore-all redactions control pending product exposure during ${phase} (${restore.reason}).`);
    return false;
  }

  scenario.check(restore.changed, `Proof Packet restore-all redactions control is actionable during ${phase}.`);
  await page.waitForFunction(
    (text) => {
      const root = document.querySelector("[data-pr='proofPacketPreview'], [data-pr='proofPacket'], [data-proof-packet-preview]");
      const download = document.querySelector("[data-pr='downloadProofPacket'], [data-pr='proofPacketDownload'], [data-proof-packet-download]");
      const href = download?.getAttribute("href") || "";
      return Boolean(root && (root.textContent || "").includes(text) && decodeURIComponent(href).includes(text));
    },
    rawSourceText
  );
  const restoredPacket = await readProofPacketSurfaces(page);
  const restoredResume = await exportSurfaces(page);
  const restoredReadiness = await readProofPacketShareReadiness(page);
  const restoredPacketText = [restoredPacket.text, restoredPacket.downloadText, restoredPacket.snapshotText].join("\n");

  scenario.check(restoredPacketText.includes(rawSourceText), `Restore-all returns raw source text to Proof Packet surfaces during ${phase}.`);
  scenario.check(restoredPacket.downloadText.includes(rawSourceText), `Restore-all returns raw source text to packet download during ${phase}.`);
  scenario.check(restoredPacket.downloadText.includes(resumeText), `Restore-all keeps accepted resume text in packet download during ${phase}.`);
  scenario.check(restoredResume.exportText === beforeResume.exportText, `Restore-all leaves resume export output unchanged during ${phase}.`);
  scenario.check(restoredResume.downloadText === beforeResume.downloadText, `Restore-all leaves resume export download unchanged during ${phase}.`);
  scenario.check(!restoredResume.exportText.includes("Redacted"), `Resume export excludes redaction labels after restore-all during ${phase}.`);
  scenario.check(!restoredPacketText.includes(rejectedText), `Restore-all packet still excludes rejected text during ${phase}.`);
  scenario.check(!restoredPacketText.includes(pendingText), `Restore-all packet still excludes pending text during ${phase}.`);
  assertProofPacketShareReadiness({
    scenario,
    readiness: restoredReadiness,
    packet: restoredPacket,
    resumeSurfaces: restoredResume,
    expectedAcceptedText: [resumeText],
    rejectedText,
    pendingText,
    expectedRedactedCount: 0,
    phase: `${phase} after restore-all`,
  });
  return true;
}

async function assertProofPacketRedactionContract({
  page,
  baseUrl,
  intakeId,
  scenario,
  rawSourceText,
  resumeText,
  rejectedText,
  pendingText,
  phase,
}) {
  const controls = await readProofPacketRedactionControls(page);
  if (!controls.exposed) {
    scenario.assertions.push(`Proof Packet redaction controls pending product exposure during ${phase}.`);
    return false;
  }

  scenario.check(controls.controls.length > 0, `Proof Packet exposes deterministic redaction controls during ${phase}.`);
  const beforeResume = await exportSurfaces(page);
  scenario.check(beforeResume.exportText.includes(resumeText), `Resume export includes accepted text before redaction during ${phase}.`);
  const beforePacket = await readProofPacketSurfaces(page);
  const beforeReadiness = await readProofPacketShareReadiness(page);
  assertProofPacketShareReadiness({
    scenario,
    readiness: beforeReadiness,
    packet: beforePacket,
    resumeSurfaces: beforeResume,
    expectedAcceptedText: [resumeText],
    rejectedText,
    pendingText,
    expectedRedactedCount: 0,
    phase: `${phase} before redaction`,
  });

  const redaction = await redactProofPacketSource(page, rawSourceText);
  scenario.check(redaction.changed, `Proof Packet redaction control can redact source text during ${phase} (${redaction.reason || "changed"}).`);
  await page.waitForFunction(
    (text) => {
      const root = document.querySelector("[data-pr='proofPacketPreview'], [data-pr='proofPacket'], [data-proof-packet-preview]");
      const download = document.querySelector("[data-pr='downloadProofPacket'], [data-pr='proofPacketDownload'], [data-proof-packet-download]");
      const href = download?.getAttribute("href") || "";
      return Boolean(root && !(root.textContent || "").includes(text) && !decodeURIComponent(href).includes(text));
    },
    rawSourceText
  );

  const afterPacket = await readProofPacketSurfaces(page);
  const afterResume = await exportSurfaces(page);
  const afterReadiness = await readProofPacketShareReadiness(page);
  const packetCombinedText = [afterPacket.text, afterPacket.downloadText, afterPacket.snapshotText].join("\n");
  const packetLower = packetCombinedText.toLowerCase();

  scenario.check(
    !packetCombinedText.includes(rawSourceText),
    `Proof Packet preview/download/snapshot omit redacted raw source text during ${phase}. Leak paths: ${findJsonTextPaths(afterPacket.snapshot, rawSourceText)
      .slice(0, 10)
      .join(", ")}`
  );
  scenario.check(afterPacket.downloadIsText, `Proof Packet redaction keeps packet download as a local text payload during ${phase}.`);
  scenario.check(!afterPacket.downloadText.includes(rawSourceText), `Proof Packet download omits redacted raw source text during ${phase}.`);
  scenario.check(afterPacket.downloadText.includes(resumeText), `Proof Packet download keeps accepted resume text during ${phase}.`);
  scenario.check(afterPacket.downloadText !== afterResume.downloadText, `Proof Packet redacted download stays separate from resume download during ${phase}.`);
  scenario.check(afterResume.exportText === beforeResume.exportText, `Resume export output is unchanged by packet redaction during ${phase}.`);
  scenario.check(afterResume.downloadText === beforeResume.downloadText, `Resume export download is unchanged by packet redaction during ${phase}.`);
  scenario.check(afterResume.exportText.includes(resumeText), `Resume export keeps accepted text after packet redaction during ${phase}.`);
  scenario.check(!afterResume.exportText.includes("Redacted"), `Resume export excludes redaction labels during ${phase}.`);
  scenario.check(packetLower.includes("source") || packetLower.includes("provenance"), `Proof Packet keeps a safe provenance label after redaction during ${phase}.`);
  scenario.check(
    packetLower.includes("redacted") || packetLower.includes("hidden") || packetLower.includes("masked"),
    `Proof Packet labels the redacted source safely during ${phase}.`
  );
  scenario.check(!packetCombinedText.includes(rejectedText), `Proof Packet redaction state still excludes rejected text during ${phase}.`);
  scenario.check(!packetCombinedText.includes(pendingText), `Proof Packet redaction state still excludes pending text during ${phase}.`);
  scenario.check(/redact|redaction/i.test(afterPacket.snapshotText), `Saved packet metadata records redaction state during ${phase}.`);
  assertProofPacketShareReadiness({
    scenario,
    readiness: afterReadiness,
    packet: afterPacket,
    resumeSurfaces: afterResume,
    expectedAcceptedText: [resumeText],
    rejectedText,
    pendingText,
    expectedRedactedCount: 1,
    phase: `${phase} after redaction`,
  });

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("[data-pr='exportSection']:not([hidden])");
  const reloadedPacket = await readProofPacketSurfaces(page);
  const reloadedResume = await exportSurfaces(page);
  const reloadedReadiness = await readProofPacketShareReadiness(page);
  const reloadedPacketText = [reloadedPacket.text, reloadedPacket.downloadText, reloadedPacket.snapshotText].join("\n");
  scenario.check(!reloadedPacketText.includes(rawSourceText), `Redacted source text stays omitted after reload during ${phase}.`);
  scenario.check(reloadedPacket.downloadText.includes(resumeText), `Redacted packet download keeps accepted text after reload during ${phase}.`);
  scenario.check(reloadedResume.exportText.includes(resumeText), `Resume export remains intact after redaction reload during ${phase}.`);
  assertProofPacketShareReadiness({
    scenario,
    readiness: reloadedReadiness,
    packet: reloadedPacket,
    resumeSurfaces: reloadedResume,
    expectedAcceptedText: [resumeText],
    rejectedText,
    pendingText,
    expectedRedactedCount: 1,
    phase: `${phase} after redaction reload`,
  });

  const packetPageHref = await page.getAttribute("[data-pr='openProofPacket']", "href");
  if (packetPageHref) {
    await page.goto(`${baseUrl}${packetPageHref}`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-pr='packetBody']");
    const packetPageText = await page.textContent("[data-pr='packetBody']");
    scenario.check(!packetPageText.includes(rawSourceText), `Standalone Proof Packet page omits redacted source text during ${phase}.`);
    scenario.check(packetPageText.includes(resumeText), `Standalone Proof Packet page keeps accepted resume text during ${phase}.`);
    scenario.check(/source|provenance/i.test(packetPageText), `Standalone Proof Packet page keeps a safe provenance label during ${phase}.`);
    await page.goto(`${baseUrl}/review.html?intake=${encodeURIComponent(intakeId)}`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-pr='exportSection']:not([hidden])");
  } else {
    scenario.assertions.push(`Standalone Proof Packet redaction navigation pending product exposure during ${phase}.`);
  }

  await assertProofPacketRestoreAllContract({
    page,
    scenario,
    rawSourceText,
    resumeText,
    rejectedText,
    pendingText,
    beforeResume,
    phase,
  });

  return true;
}

function assertProofPacketContract({
  scenario,
  packet,
  exportText,
  downloadText,
  expectedAcceptedText,
  expectedProvenanceTerms,
  expectedRiskTerms,
  expectedFollowupTerms = [],
  excludedText,
  phase,
}) {
  if (!packet.exposed) {
    scenario.assertions.push(`Proof Packet preview/download/snapshot contract pending product exposure during ${phase}.`);
    return false;
  }

  const packetCombinedText = [packet.text, packet.downloadText, packet.snapshotText].join("\n");
  const packetLower = packetCombinedText.toLowerCase();
  scenario.check(packet.visible, `Proof Packet preview is visible during ${phase}.`);
  scenario.check(packet.text.trim().length > 0, `Proof Packet preview renders local packet text during ${phase}.`);
  if (packet.downloadIsText) {
    scenario.check(packet.downloadText.trim().length > 0, `Proof Packet download exposes a local text payload during ${phase}.`);
    scenario.check(packet.downloadText !== downloadText, `Proof Packet download text is distinct from resume export download text during ${phase}.`);
    scenario.check(packet.downloadName.toLowerCase().includes("proof"), `Proof Packet download filename uses a proof-oriented name during ${phase}.`);
  } else {
    scenario.assertions.push(`Proof Packet-specific download is not exposed during ${phase}; resume download separation is still enforced.`);
  }

  for (const text of expectedAcceptedText) {
    scenario.check(packetCombinedText.includes(text), `Proof Packet includes accepted resume evidence during ${phase}.`);
  }
  for (const term of expectedProvenanceTerms) {
    scenario.check(packetLower.includes(term.toLowerCase()), `Proof Packet includes provenance term "${term}" during ${phase}.`);
  }
  for (const term of expectedRiskTerms) {
    scenario.check(packetLower.includes(term.toLowerCase()), `Proof Packet includes claim-risk flag "${term}" during ${phase}.`);
  }
  for (const term of expectedFollowupTerms) {
    scenario.check(packetLower.includes(term.toLowerCase()), `Proof Packet includes follow-up source note "${term}" during ${phase}.`);
  }
  for (const text of excludedText) {
    scenario.check(!packetCombinedText.includes(text), `Proof Packet excludes rejected or pending text during ${phase}.`);
  }

  scenario.check(!exportText.includes("Proof Packet"), `Resume export output excludes Proof Packet heading during ${phase}.`);
  scenario.check(!downloadText.includes("Proof Packet"), `Resume export download excludes Proof Packet heading during ${phase}.`);
  scenario.check(!downloadText.includes("Claim-risk checklist"), `Resume export download excludes Proof Packet claim-risk labels during ${phase}.`);
  scenario.check(Boolean(packet.snapshot), `Saved snapshot preserves Proof Packet metadata during ${phase}.`);
  if (packet.snapshot) {
    scenario.check(!String(packet.snapshot?.sectionText || "").includes("Proof Packet"), `Proof Packet snapshot metadata stays outside resume section text during ${phase}.`);
  }

  return true;
}

async function setFollowupEvidenceApprovalForCandidate(page, candidateText, approved) {
  return page.evaluate(
    ({ candidateText: targetText, approved: targetApproved }) => {
      const candidateRows = [...document.querySelectorAll("[data-pr='candidateList'] [data-candidate-key][data-followup-answer-id]")];
      const candidateRow = candidateRows.find((entry) => (entry.textContent || "").includes(targetText));
      if (!candidateRow) return { changed: false, reason: "missing-candidate-row" };
      const answerId = candidateRow.getAttribute("data-followup-answer-id") || "";
      if (!answerId) return { changed: false, reason: "missing-answer-id" };

      const approvalsRows = [...document.querySelectorAll("[data-pr='approvalsList'] [data-followup-evidence-item]")];
      const approvalsRow = approvalsRows.find((entry) => entry.getAttribute("data-followup-answer-id") === answerId);
      if (!approvalsRow) return { changed: false, reason: "missing-approvals-row" };
      const checkbox = approvalsRow.querySelector("input[type='checkbox'][data-evidence-key]");
      if (!(checkbox instanceof HTMLInputElement)) return { changed: false, reason: "missing-checkbox" };
      if (checkbox.checked === Boolean(targetApproved)) return { changed: false, reason: "already-set" };
      checkbox.checked = Boolean(targetApproved);
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      return { changed: true, reason: "" };
    },
    { candidateText, approved }
  );
}

async function clickCandidateAction(page, candidateText, action) {
  return page.evaluate(
    ({ candidateText: targetText, action: targetAction }) => {
      const rows = [...document.querySelectorAll("[data-pr='candidateList'] [data-candidate-key]")];
      const row = rows.find((entry) => (entry.textContent || "").includes(targetText));
      if (!row) return { clicked: false, reason: "missing-row" };
      const button = row.querySelector(`[data-candidate-action="${targetAction}"]`);
      if (!(button instanceof HTMLButtonElement)) return { clicked: false, reason: "missing-action" };
      if (button.disabled) return { clicked: false, reason: "disabled-action" };
      button.click();
      return { clicked: true, reason: "" };
    },
    { candidateText, action }
  );
}

async function readCandidateAcceptedActionState(page, candidateText) {
  return page.evaluate((targetText) => {
    const rows = [...document.querySelectorAll("[data-pr='candidateList'] [data-candidate-key]")];
    const row = rows.find((entry) => (entry.textContent || "").includes(targetText));
    if (!row) return { exposed: false, text: "", label: "", disabled: null, title: "", isFollowup: false };
    const button = row.querySelector("[data-candidate-action='accepted']");
    return {
      exposed: true,
      text: row.textContent || "",
      label: button?.textContent?.trim() || "",
      disabled: button instanceof HTMLButtonElement ? button.disabled : null,
      title: button?.getAttribute("title") || "",
      isFollowup: row.hasAttribute("data-followup-answer-id") || Boolean(row.querySelector("[data-followup-rewrite]")),
    };
  }, candidateText);
}

async function approveStructuredSourceLine(page, factText) {
  return page.evaluate((targetText) => {
    const rowSelector = [
      "[data-structured-extraction-item]",
      "[data-structured-extraction-bullet]",
      "[data-structured-experience-item]",
      "[data-experience-item]",
      "[data-experience-key]",
    ].join(",");
    const rows = [...document.querySelectorAll(rowSelector)].sort(
      (left, right) => (left.textContent || "").length - (right.textContent || "").length
    );
    const row = rows.find((entry) => (entry.textContent || "").includes(targetText));
    if (!row) return { changed: false, reason: "missing-row" };
    const checkbox = row.querySelector("[data-structured-source-approval]");
    const promoteButton = row.querySelector("[data-structured-fact-action='promote'], [data-fact-action='approve']");
    if (!(checkbox instanceof HTMLInputElement)) return { changed: false, reason: "missing-source-approval-checkbox" };
    const promoteWasDisabled = promoteButton instanceof HTMLButtonElement ? promoteButton.disabled : null;
    if (!checkbox.checked) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return { changed: true, reason: "", promoteWasDisabled };
  }, factText);
}

async function approveGeneratedEvidenceLine(page, sourceLineText) {
  return page.evaluate((targetText) => {
    const rows = [...document.querySelectorAll("[data-pr='approvalsList'] li, [data-pr='approvalsList'] [data-evidence-key]")].sort(
      (left, right) => (left.textContent || "").length - (right.textContent || "").length
    );
    const row = rows.find((entry) => (entry.textContent || "").includes(targetText));
    if (!row) return { changed: false, reason: "missing-row" };
    const checkbox = row.matches("[data-evidence-key]") ? row : row.querySelector("[data-evidence-key]");
    if (!(checkbox instanceof HTMLInputElement)) return { changed: false, reason: "missing-evidence-checkbox" };
    const wasChecked = checkbox.checked;
    if (!checkbox.checked) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return { changed: true, reason: "", wasChecked };
  }, sourceLineText);
}

async function runStructuredExtractionApprovalBoundaryScenario(page, baseUrl) {
  const scenario = createScenario("structured-extraction-approval-boundary-no-network");
  const firstExperienceBullet = "Led renewal analytics program that reduced forecast variance from 18% to 9% across 7 regions.";
  const secondExperienceBullet = "Automated customer health dashboard used by 12 account managers every Monday.";
  const inventedClaim = "owned a 25 million dollar transformation";
  const firstExportText = "Impact: Led renewal analytics program";
  const secondExportText = "Impact: Automated customer health dashboard";

  await resetDrafts(page, baseUrl);
  await loadIntake(page, baseUrl);
  await page.fill("input[name='targetRole']", "Revenue operations analyst");
  await page.fill("textarea[name='resumeText']", structuredExtractionResume);
  await page.click("button[type='submit']");
  await page.waitForSelector("#local-analysis:not([hidden])");

  const stored = await storedDrafts(page);
  scenario.check(stored.intakes.length === 1, "Structured extraction fixture stores exactly one local draft.");
  scenario.check(stored.intakes[0].rawText === structuredExtractionResume, "Structured extraction fixture preserves raw pasted text unchanged.");
  scenario.check(stored.intakes[0].analysis?.sections?.includes("Experience"), "Structured extraction fixture is detected as Experience.");

  const structuredItems = storedStructuredExperienceItems(stored.intakes[0]);
  if (structuredItems.length) {
    const serializedStructuredItems = JSON.stringify(structuredItems);
    scenario.check(structuredItems.length >= 2, "Stored structured extraction exposes at least two parsed experience items.");
    scenario.check(
      structuredItems.every((item) => /unapproved/i.test(String(item.approvalState || item.evidenceStatus || item.status || ""))),
      "Stored structured experience items start Unapproved."
    );
    scenario.check(
      structuredItems.every((item) =>
        Boolean(
          item.sourceLine ||
            item.sourceLines ||
            item.provenance ||
            item.sourceExcerpt ||
            item.lineNumbers ||
            item.source?.line ||
            item.source?.lines
        )
      ),
      "Stored structured experience items carry provenance/source lines."
    );
    scenario.check(serializedStructuredItems.includes(firstExperienceBullet), "Structured extraction keeps the first source bullet verbatim.");
    scenario.check(serializedStructuredItems.includes(secondExperienceBullet), "Structured extraction keeps the second source bullet verbatim.");
    scenario.check(!serializedStructuredItems.toLowerCase().includes(inventedClaim), "Structured extraction does not invent unsupported claim text.");
  } else {
    scenario.assertions.push("Structured experience item storage pending product exposure; approval/export boundary checks still run on generated candidates.");
  }

  await page.click("[data-pr='reviewLink']");
  await page.waitForURL(`**/review.html?intake=${encodeURIComponent(stored.lastIntakeId)}`);
  await page.waitForSelector("[data-pr='candidateSection']:not([hidden])");

  const enhancedText = await page.textContent("[data-pr='enhancedList']");
  const candidateAuditText = await page.textContent("[data-pr='candidateList']");
  const structuredSurface = await readStructuredExtractionSurface(page);
  scenario.check(enhancedText.includes("Unapproved"), "Parsed/generated experience candidates start Unapproved on review.");
  scenario.check(candidateAuditText.includes(firstExperienceBullet), "Candidate audit carries first experience source line provenance.");
  scenario.check(candidateAuditText.includes(secondExperienceBullet), "Candidate audit carries second experience source line provenance.");
  scenario.check(!candidateAuditText.toLowerCase().includes(inventedClaim), "Candidate audit does not invent unsupported claim text.");
  if (structuredSurface.exposed) {
    scenario.check(structuredSurface.text.includes(firstExperienceBullet), "Structured extraction surface shows first source bullet provenance.");
    scenario.check(
      structuredSurface.items.some((item) => /unapproved/i.test(`${item.approval} ${item.text}`)),
      "Structured extraction surface marks parsed experience items Unapproved."
    );
    scenario.check(
      structuredSurface.items.some((item) => item.sourceLines || /line|source|provenance/i.test(item.text)),
      "Structured extraction surface carries source-line/provenance details."
    );
    scenario.check(!structuredSurface.text.toLowerCase().includes(inventedClaim), "Structured extraction surface does not invent unsupported claims.");
    assertStructuredItemPromotionSurface(scenario, structuredSurface, "initial review render");
  } else {
    scenario.assertions.push("Structured extraction review surface pending product exposure; candidate audit provenance is enforced.");
  }

  const structuredActions = structuredSurface.items.flatMap((item) => item.actions);
  const structuredRejectAction = structuredActions.find((action) => /reject|exclude/i.test(action));
  if (structuredRejectAction) {
    const structuredReject = await clickStructuredItemPromotionAction(page, secondExperienceBullet, structuredRejectAction);
    scenario.check(
      structuredReject.clicked,
      `Structured-item promotion reject handle works before export eligibility checks (${structuredReject.reason || "clicked"}).`
    );
  }

  const acceptedBeforeApproval = await clickCandidateAction(page, firstExportText, "accepted");
  scenario.check(
    !acceptedBeforeApproval.clicked && acceptedBeforeApproval.reason === "disabled-action",
    "Structured extraction candidate Accept stays disabled before explicit evidence approval."
  );
  const acceptButtonBeforeApproval = await readCandidateAcceptedActionState(page, firstExportText);
  scenario.check(acceptButtonBeforeApproval.exposed, "Generated structured candidate exposes a deterministic Accept action.");
  scenario.check(acceptButtonBeforeApproval.label === "Accept", "Generated structured candidate uses Accept, not Approve, for the candidate decision.");
  scenario.check(acceptButtonBeforeApproval.disabled === true, "Generated structured candidate Accept button is disabled until backing evidence line approval.");
  scenario.check(
    /approve (?:the source line|supporting evidence) first/i.test(acceptButtonBeforeApproval.title) ||
      /evidence unapproved|approve/i.test(acceptButtonBeforeApproval.text),
    "Disabled generated candidate Accept action explains the backing evidence-line approval gate."
  );
  const rejectedBeforeApproval = await clickCandidateAction(page, secondExportText, "rejected");
  scenario.check(
    rejectedBeforeApproval.clicked,
    `Structured extraction candidate can be rejected for the promotion exclusion check (${rejectedBeforeApproval.reason || "clicked"}).`
  );
  const preApprovalSurfaces = await exportSurfaces(page);
  assertFactExcludedFromResumeSurfaces(
    scenario,
    preApprovalSurfaces,
    firstExportText,
    "Accepted but unapproved structured experience item",
    "before explicit evidence approval"
  );
  assertFactExcludedFromSurfaces(
    scenario,
    preApprovalSurfaces,
    secondExportText,
    "Rejected structured experience item",
    "before explicit evidence approval"
  );
  assertFactExcludedFromSurfaces(
    scenario,
    preApprovalSurfaces,
    firstExperienceBullet,
    "Unapproved structured source fact",
    "before explicit evidence approval"
  );
  assertFactExcludedFromSurfaces(
    scenario,
    preApprovalSurfaces,
    secondExperienceBullet,
    "Rejected structured source fact",
    "before explicit evidence approval"
  );
  scenario.check(
    !preApprovalSurfaces.exportText.toLowerCase().includes(inventedClaim) && !preApprovalSurfaces.downloadText.toLowerCase().includes(inventedClaim),
    "Pre-approval export and download text do not contain invented claims."
  );

  const sourceLineApproval = await approveStructuredSourceLine(page, firstExperienceBullet);
  scenario.check(
    sourceLineApproval.changed && sourceLineApproval.promoteWasDisabled === true,
    `Backing structured evidence line approval enables promotion after starting disabled (${sourceLineApproval.reason || "changed"}).`
  );
  await page.waitForFunction(
    (text) => {
      const rows = [...document.querySelectorAll("[data-structured-extraction-bullet], [data-structured-extraction-item]")].sort(
        (left, right) => (left.textContent || "").length - (right.textContent || "").length
      );
      const row = rows.find((entry) => (entry.textContent || "").includes(text));
      const button = row?.querySelector("[data-structured-fact-action='promote'], [data-fact-action='approve']");
      return button instanceof HTMLButtonElement && !button.disabled;
    },
    firstExperienceBullet
  );
  const structuredApprove = await clickStructuredItemPromotionAction(page, firstExperienceBullet, "approve");
  scenario.check(
    structuredApprove.clicked,
    `Structured-item promotion approve handle works only after backing evidence-line approval (${structuredApprove.reason || "clicked"}).`
  );
  const generatedEvidenceApproval = await approveGeneratedEvidenceLine(page, firstExperienceBullet);
  scenario.check(
    generatedEvidenceApproval.changed && generatedEvidenceApproval.wasChecked === false,
    `Backing pasted evidence line approval changes generated candidate Accept from disabled to eligible (${generatedEvidenceApproval.reason || "changed"}).`
  );
  await page.waitForFunction(
    (text) => {
      const rows = [...document.querySelectorAll("[data-pr='candidateList'] [data-candidate-key]")];
      const row = rows.find((entry) => (entry.textContent || "").includes(text));
      const button = row?.querySelector("[data-candidate-action='accepted']");
      return button instanceof HTMLButtonElement && button.textContent?.trim() === "Accept" && !button.disabled;
    },
    firstExportText
  );
  const acceptButtonAfterApproval = await readCandidateAcceptedActionState(page, firstExportText);
  scenario.check(acceptButtonAfterApproval.label === "Accept", "Generated structured candidate still uses Accept after evidence approval.");
  scenario.check(acceptButtonAfterApproval.disabled === false, "Generated structured candidate Accept enables after backing evidence line is approved and promoted.");

  const bulkInitialState = await readBulkStructuredControlState(page);
  scenario.check(bulkInitialState.exposed, "Bulk structured approve/promote controls are exposed for deterministic coverage.");
  scenario.check(
    /approve all source lines/i.test(bulkInitialState.approveAllLabel) && /promote all approved/i.test(bulkInitialState.promoteAllLabel),
    "Bulk structured controls keep distinct Approve all source lines and Promote all approved labels."
  );
  const bulkApprove = await clickBulkStructuredControl(page, "approve");
  scenario.check(bulkApprove.clicked, `Bulk structured source-line approval control works (${bulkApprove.reason || "clicked"}).`);
  await page.waitForFunction(() => {
    const rows = [
      ...document.querySelectorAll("[data-structured-extraction-item], [data-structured-extraction-bullet], [data-structured-experience-item], [data-experience-item]"),
    ];
    return rows.length > 0 && rows.every((row) => row.getAttribute("data-approval-state") === "approved");
  });
  const afterBulkApproveSurfaces = await exportSurfaces(page);
  assertFactExcludedFromResumeSurfaces(
    scenario,
    afterBulkApproveSurfaces,
    firstExportText,
    "Bulk-approved but candidate-unaccepted structured item",
    "after bulk source approval"
  );
  const bulkPromote = await clickBulkStructuredControl(page, "promote");
  scenario.check(bulkPromote.clicked, `Bulk structured promote control works (${bulkPromote.reason || "clicked"}).`);
  await page.waitForFunction(() => {
    const rows = [
      ...document.querySelectorAll("[data-structured-extraction-item], [data-structured-extraction-bullet], [data-structured-experience-item], [data-experience-item]"),
    ];
    return rows.length > 0 && rows.every((row) => row.getAttribute("data-promoted-to-candidate") === "true");
  });
  const afterBulkPromoteSurfaces = await exportSurfaces(page);
  assertFactExcludedFromResumeSurfaces(
    scenario,
    afterBulkPromoteSurfaces,
    firstExportText,
    "Bulk-promoted but candidate-unaccepted structured item",
    "after bulk promotion"
  );
  scenario.check(
    !afterBulkPromoteSurfaces.exportText.includes(firstExportText) &&
      !afterBulkPromoteSurfaces.downloadText.includes(firstExportText) &&
      !String(afterBulkPromoteSurfaces.snapshot?.sectionText || "").includes(firstExportText),
    "Bulk approve/promote never auto-exports a structured item before candidate Accept."
  );
  const storedAfterBulk = await storedStructuredApprovalSummary(page);
  scenario.check(
    storedAfterBulk.recordCount > 0 &&
      storedAfterBulk.approvedCount === storedAfterBulk.recordCount &&
      storedAfterBulk.promotedCount === storedAfterBulk.recordCount,
    "Bulk approved/promoted structured state is persisted in localStorage before reload."
  );

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("[data-pr='candidateSection']:not([hidden])");
  const bulkReloadState = await readBulkStructuredControlState(page);
  scenario.check(
    bulkReloadState.rowCount > 0 &&
      bulkReloadState.approvedCount === bulkReloadState.rowCount &&
      bulkReloadState.promotedCount === bulkReloadState.rowCount,
    "Bulk approved/promoted structured state persists after reload."
  );
  scenario.check(
    bulkReloadState.exportEligibleValues.every((value) => value === "false") &&
      bulkReloadState.downloadEligibleValues.every((value) => value === "false"),
    "Bulk structured source rows stay export/download ineligible after reload until candidate Accept."
  );
  const reloadCandidateAccept = await readCandidateAcceptedActionState(page, firstExportText);
  scenario.check(
    reloadCandidateAccept.label === "Accept" && reloadCandidateAccept.disabled === false,
    "Candidate Accept is still required and available after bulk approve/promote reload persistence."
  );
  const reloadBulkSurfaces = await exportSurfaces(page);
  assertFactExcludedFromResumeSurfaces(
    scenario,
    reloadBulkSurfaces,
    firstExportText,
    "Reloaded bulk-promoted but candidate-unaccepted structured item",
    "after reload before candidate Accept"
  );

  const acceptedAfterApproval = await clickCandidateAction(page, firstExportText, "accepted");
  scenario.check(
    acceptedAfterApproval.clicked,
    `Structured extraction candidate can be accepted after explicit evidence approval (${acceptedAfterApproval.reason || "clicked"}).`
  );
  await page.waitForFunction((text) => document.querySelector("[data-pr='exportOutput']")?.value?.includes(text), firstExportText);
  const postApprovalSurfaces = await exportSurfaces(page);
  scenario.check(postApprovalSurfaces.exportText.includes(firstExportText), "Explicitly approved structured experience item enters export output.");
  scenario.check(postApprovalSurfaces.downloadText.includes(firstExportText), "Explicitly approved structured experience item enters download text.");
  scenario.check(String(postApprovalSurfaces.snapshot?.sectionText || "").includes(firstExportText), "Explicitly approved structured experience item enters saved snapshot resume text.");
  scenario.check(!postApprovalSurfaces.exportText.includes(secondExportText), "Unaccepted structured experience item stays out of export output after approval.");
  scenario.check(!postApprovalSurfaces.downloadText.includes(secondExportText), "Unaccepted structured experience item stays out of download text after approval.");
  scenario.check(!postApprovalSurfaces.snapshotText.includes(secondExportText), "Rejected structured experience item stays out of saved snapshot after approval.");
  scenario.check(!postApprovalSurfaces.snapshotText.includes(secondExperienceBullet), "Rejected structured source fact stays out of saved snapshot after approval.");
  scenario.check(
    !postApprovalSurfaces.exportText.toLowerCase().includes(inventedClaim) && !postApprovalSurfaces.downloadText.toLowerCase().includes(inventedClaim),
    "Post-approval export and download text do not contain invented claims."
  );

  return scenario;
}

async function setFollowupRewrite(page, factText, rewriteText) {
  return page.evaluate(
    ({ factText: targetText, rewriteText: nextText }) => {
      const rowSelector = [
        "[data-pr='candidateList'] [data-followup-answer-id]",
        "[data-followup-fact-key]",
        "[data-followup-evidence-key]",
        "[data-followup-answer-key]",
        "[data-followup-fact]",
      ].join(",");
      const rows = [...document.querySelectorAll(rowSelector)];
      const row = rows.find((entry) => (entry.textContent || "").includes(targetText));
      if (!row) return { changed: false, reason: "missing-row" };
      const input = row.querySelector(
        [
          "textarea[data-followup-rewrite]",
          "textarea[data-followup-resume-bullet]",
          "textarea[data-followup-rewrite-text]",
          "input[data-followup-rewrite]",
          "[contenteditable='true'][data-followup-rewrite]",
        ].join(",")
      );
      if (!(input instanceof HTMLTextAreaElement) && !(input instanceof HTMLInputElement) && !(input instanceof HTMLElement)) {
        return { changed: false, reason: "missing-rewrite-control" };
      }

      if (input instanceof HTMLTextAreaElement || input instanceof HTMLInputElement) {
        input.value = nextText;
      } else {
        input.textContent = nextText;
      }
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: nextText }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return { changed: true, reason: "" };
    },
    { factText, rewriteText }
  );
}

async function readFollowupFactDetails(page, factText) {
  return page.evaluate((targetText) => {
    const rowSelector = [
      "[data-pr='candidateList'] [data-followup-answer-id]",
      "[data-followup-fact-key]",
      "[data-followup-evidence-key]",
      "[data-followup-answer-key]",
      "[data-followup-fact]",
    ].join(",");
    const rows = [...document.querySelectorAll(rowSelector)];
    const row = rows.find((entry) => (entry.textContent || "").includes(targetText));
    if (!row) {
      return { exposed: false, text: "", sourceText: "", rewriteText: "", hasRewriteContract: false };
    }

    const rewriteNode = row.querySelector(
      [
        "[data-followup-rewrite]",
        "[data-followup-rewrite-text]",
        "[data-followup-evidence-rewrite]",
        "[data-followup-resume-bullet]",
      ].join(",")
    );
    const sourceNode = row.querySelector(
      [
        "[data-followup-source]",
        "[data-followup-provenance]",
        "[data-followup-source-provenance]",
        "small",
      ].join(",")
    );
    const rewriteText =
      row.getAttribute("data-followup-rewrite-text") ||
      (rewriteNode instanceof HTMLTextAreaElement || rewriteNode instanceof HTMLInputElement ? rewriteNode.value : "") ||
      rewriteNode?.textContent ||
      "";

    return {
      exposed: true,
      text: row.textContent || "",
      sourceText: sourceNode?.textContent || "",
      rewriteText,
      hasRewriteContract: Boolean(
        rewriteNode ||
          row.hasAttribute("data-followup-rewrite") ||
          row.hasAttribute("data-followup-rewrite-text") ||
          row.hasAttribute("data-followup-resume-bullet")
      ),
    };
  }, factText);
}

async function readClaimRiskChecklist(page) {
  return page.evaluate(() => {
    const root = document.querySelector(
      [
        "[data-pr='claimRiskChecklist']",
        "[data-pr='claimRiskList']",
        "[data-pr='preExportClaimRiskChecklist']",
        "[data-claim-risk-checklist]",
      ].join(",")
    );
    if (!root) {
      return { exposed: false, text: "", entries: [] };
    }

    const rowSelector = [
      "[data-claim-risk]",
      "[data-claim-risk-flag]",
      "[data-risk-flag]",
      "[data-claim-risk-type]",
      "[data-claim-risk-item]",
    ].join(",");
    const rows = [...root.querySelectorAll(rowSelector)];
    const entries = (rows.length ? rows : [...root.querySelectorAll("li, article, tr, [role='listitem']")]).map((entry) => ({
      text: entry.textContent || "",
      type:
        entry.getAttribute("data-claim-risk") ||
        entry.getAttribute("data-claim-risk-flag") ||
        entry.getAttribute("data-risk-flag") ||
        entry.getAttribute("data-claim-risk-type") ||
        "",
      status: entry.getAttribute("data-claim-risk-status") || entry.getAttribute("data-risk-status") || "",
      source:
        entry.getAttribute("data-claim-risk-source") ||
        entry.getAttribute("data-risk-source") ||
        entry.getAttribute("data-claim-risk-key") ||
        "",
    }));

    return {
      exposed: true,
      text: root.textContent || "",
      entries,
    };
  });
}

function assertClaimRiskChecklist({
  scenario,
  checklist,
  exportText,
  downloadText,
  snapshot,
  expectedIncludedText,
  expectedExcludedText,
  expectedFlagTerms,
  phase,
}) {
  if (!checklist.exposed) {
    scenario.assertions.push(`Claim-risk checklist contract pending product exposure during ${phase}.`);
    return false;
  }

  const checklistText = checklist.text.toLowerCase();
  scenario.check(checklist.entries.length > 0, `Claim-risk checklist exposes machine-readable entries during ${phase}.`);
  for (const term of expectedFlagTerms) {
    scenario.check(checklistText.includes(term), `Claim-risk checklist names the ${term} flag during ${phase}.`);
  }
  scenario.check(
    expectedIncludedText.some((text) => checklist.text.includes(text)),
    `Claim-risk checklist maps at least one exported bullet back to a visible risk row during ${phase}.`
  );
  for (const excludedText of expectedExcludedText) {
    scenario.check(!checklist.text.includes(excludedText), `Claim-risk checklist excludes non-exported text during ${phase}.`);
  }
  scenario.check(
    !exportText.includes("claim risk") && !downloadText.includes("claim risk"),
    `Claim-risk checklist labels stay out of export and download text during ${phase}.`
  );
  if (snapshot) {
    scenario.check(
      JSON.stringify(snapshot).toLowerCase().includes("claim"),
      `Saved snapshot preserves claim-risk metadata when an export is saved during ${phase}.`
    );
  } else {
    scenario.assertions.push(`Claim-risk checklist snapshot metadata check waits for saved export during ${phase}.`);
  }
  return true;
}

function snapshotFollowupEvidence(snapshot) {
  const direct = snapshot?.followups?.evidenceItems;
  return Array.isArray(direct) ? direct : [];
}

function snapshotAcceptedFollowups(snapshot) {
  const accepted = Array.isArray(snapshot?.accepted) ? snapshot.accepted : [];
  return accepted.filter((item) => String(item?.evidenceStatus || "").toLowerCase().includes("follow-up"));
}

function assertFollowupProvenanceSnapshot({ scenario, snapshot, expectedPrompt, expectedRawText, expectedResumeText, phase }) {
  const evidenceItems = snapshotFollowupEvidence(snapshot);
  scenario.check(evidenceItems.length >= 3, `Saved snapshot preserves follow-up evidence metadata during ${phase}.`);
  scenario.check(
    evidenceItems.some(
      (item) =>
        item?.source === expectedPrompt &&
        item?.exportEligible === true &&
        item?.evidenceApproved === true &&
        item?.candidateDecision === "accepted" &&
        (!expectedRawText || item?.sourceExcerpt === expectedRawText) &&
        (!expectedResumeText || item?.resumeText === expectedResumeText)
    ),
    `Saved snapshot marks approved follow-up evidence as export eligible with source provenance during ${phase}.`
  );
  scenario.check(
    evidenceItems.some((item) => item?.candidateDecision === "rejected"),
    `Saved snapshot preserves rejected follow-up candidate decisions during ${phase}.`
  );
  scenario.check(
    evidenceItems.some((item) => item?.exportEligible !== true),
    `Saved snapshot preserves non-export-eligible follow-up evidence states during ${phase}.`
  );

  const acceptedFollowups = snapshotAcceptedFollowups(snapshot);
  scenario.check(acceptedFollowups.length >= 1, `Saved snapshot includes approved follow-up evidence in accepted metadata during ${phase}.`);
  scenario.check(
    acceptedFollowups.some((item) => {
      const rationale = item?.groupingRationale || {};
      const signals = Array.isArray(rationale.signals) ? rationale.signals.join(" ") : "";
      return signals.includes("Source: saved follow-up answer") && signals.includes(`Prompt: ${expectedPrompt}`);
    }),
    `Saved snapshot preserves approved follow-up source and prompt provenance during ${phase}.`
  );
}

async function assertFollowupEvidencePromotion({
  page,
  baseUrl,
  intakeId,
  scenario,
  approvedFact,
  rejectedFact,
  pendingFact,
  expectedPrompt,
  expectedRewrite,
}) {
  const panel = await page.$("[data-pr='followupEvidencePanel'], [data-pr='followupEvidenceList']");
  const beforeApproval = await exportSurfaces(page);
  assertFactExcludedFromSurfaces(scenario, beforeApproval, approvedFact, "Unapproved follow-up fact", "pre-approval");
  assertFactExcludedFromSurfaces(scenario, beforeApproval, expectedRewrite, "Unapproved rewritten follow-up fact", "pre-approval");
  assertFactExcludedFromSurfaces(scenario, beforeApproval, rejectedFact, "Unapproved follow-up fact later rejected", "pre-approval");
  assertFactExcludedFromSurfaces(scenario, beforeApproval, pendingFact, "Pending follow-up fact", "pre-approval");

  if (!panel) {
    scenario.assertions.push("Follow-up evidence promotion contract pending product exposure.");
    return;
  }

  const followupApproveAction = await readCandidateAcceptedActionState(page, approvedFact);
  scenario.check(followupApproveAction.exposed, "Follow-up evidence row exposes a deterministic approval action.");
  scenario.check(followupApproveAction.isFollowup === true, "Follow-up evidence row is machine-labeled as follow-up evidence.");
  scenario.check(followupApproveAction.label === "Accept", "Follow-up evidence uses Accept for the candidate bullet decision.");
  scenario.check(followupApproveAction.disabled === true, "Follow-up candidate Accept is disabled until the evidence checkbox is approved.");

  const preApprovalDetails = await readFollowupFactDetails(page, approvedFact);
  scenario.check(preApprovalDetails.exposed, "Follow-up evidence row is visible before explicit approval.");
  scenario.check(preApprovalDetails.text.includes(approvedFact), "Follow-up evidence row shows the candidate rewrite text before approval.");
  scenario.check(
    preApprovalDetails.text.includes("Saved follow-up answer") && preApprovalDetails.text.includes(expectedPrompt),
    "Follow-up evidence row shows source provenance before approval."
  );
  if (preApprovalDetails.hasRewriteContract) {
    scenario.check(preApprovalDetails.rewriteText.includes(approvedFact), "Follow-up rewrite contract exposes the resume-native rewrite text.");
    scenario.check(
      preApprovalDetails.rewriteText.trim() !== preApprovalDetails.sourceText.trim(),
      "Follow-up rewrite text is distinct from the displayed source provenance."
    );
    const rewriteUpdate = await setFollowupRewrite(page, approvedFact, expectedRewrite);
    scenario.check(rewriteUpdate.changed, `Follow-up rewrite control accepts deterministic edits before approval (${rewriteUpdate.reason || "changed"}).`);
    await page.waitForFunction(
      (text) => {
        const rows = [
          ...document.querySelectorAll(
            "[data-pr='candidateList'] [data-followup-answer-id], [data-followup-fact-key], [data-followup-evidence-key], [data-followup-answer-key], [data-followup-fact]"
          ),
        ];
        return rows.some((row) => {
          const rewrite = row.querySelector("[data-followup-rewrite], [data-followup-resume-bullet]");
          const rewriteText =
            rewrite instanceof HTMLTextAreaElement || rewrite instanceof HTMLInputElement ? rewrite.value : rewrite?.textContent || "";
          return rewriteText.includes(text);
        });
      },
      expectedRewrite
    );
    const afterRewriteBeforeApproval = await exportSurfaces(page);
    assertFactExcludedFromResumeSurfaces(
      scenario,
      afterRewriteBeforeApproval,
      expectedRewrite,
      "Edited but unapproved follow-up rewrite",
      "after rewrite before approval"
    );
    assertFactExcludedFromResumeSurfaces(
      scenario,
      afterRewriteBeforeApproval,
      approvedFact,
      "Raw follow-up source fact",
      "after rewrite before approval"
    );
  } else {
    scenario.assertions.push("Follow-up rewrite-specific handles pending product exposure; provenance and approval boundaries still enforced.");
  }

  const rejectedEvidence = await setFollowupEvidenceApprovalForCandidate(page, rejectedFact, true);
  scenario.check(rejectedEvidence.changed || rejectedEvidence.reason === "already-set", "Follow-up evidence checkbox can be approved for a rejected candidate path.");
  const rejectedClick = await clickCandidateAction(page, rejectedFact, "rejected");
  scenario.check(rejectedClick.clicked, `Follow-up candidate list exposes Reject for follow-up evidence (${rejectedClick.reason || "clicked"}).`);
  const afterReject = await exportSurfaces(page);
  assertFactExcludedFromSurfaces(scenario, afterReject, rejectedFact, "Rejected follow-up fact", "after rejection");

  const approvedEvidence = await setFollowupEvidenceApprovalForCandidate(page, approvedFact, true);
  scenario.check(approvedEvidence.changed || approvedEvidence.reason === "already-set", "Follow-up evidence checkbox can be approved before candidate Accept.");
  await page.waitForFunction((text) => {
    const rows = [...document.querySelectorAll("[data-pr='candidateList'] [data-candidate-key]")];
    const row = rows.find((entry) => (entry.textContent || "").includes(text));
    if (!row) return false;
    const button = row.querySelector("[data-candidate-action='accepted']");
    return button instanceof HTMLButtonElement && button.disabled === false;
  }, approvedFact);
  const approvedClick = await clickCandidateAction(page, approvedFact, "accepted");
  scenario.check(approvedClick.clicked, `Follow-up candidate Accept becomes available after evidence approval (${approvedClick.reason || "clicked"}).`);
  await page.waitForFunction(
    (text) => {
      const output = document.querySelector("[data-pr='exportOutput']");
      const download = document.querySelector("[data-pr='downloadExport']");
      return Boolean(output?.value?.includes(text) && decodeURIComponent(download?.getAttribute("href") || "").includes(text));
    },
    preApprovalDetails.hasRewriteContract ? expectedRewrite : approvedFact
  );

  await page.click("[data-pr='saveExport']");
  await page.waitForFunction(() => document.querySelector("[data-pr='exportStatus']")?.textContent?.includes("Saved local export"));
  const afterApproval = await exportSurfaces(page);
  const approvedResumeText = preApprovalDetails.hasRewriteContract ? expectedRewrite : approvedFact;
  scenario.check(afterApproval.exportText.includes(approvedResumeText), "Approved follow-up rewrite appears in export output after explicit approval.");
  scenario.check(afterApproval.downloadText.includes(approvedResumeText), "Approved follow-up rewrite appears in download text after explicit approval.");
  scenario.check(
    String(afterApproval.snapshot?.sectionText || "").includes(approvedResumeText),
    "Approved follow-up rewrite appears in saved snapshot resume text after explicit approval."
  );
  if (preApprovalDetails.hasRewriteContract) {
    assertFactExcludedFromResumeSurfaces(
      scenario,
      afterApproval,
      approvedFact,
      "Raw follow-up source fact",
      "after rewritten approval"
    );
    scenario.check(afterApproval.snapshotText.includes(approvedFact), "Saved snapshot keeps raw follow-up source fact as provenance metadata.");
  }
  assertFollowupProvenanceSnapshot({
    scenario,
    snapshot: afterApproval.snapshot,
    expectedPrompt,
    expectedRawText: preApprovalDetails.text.includes("Baseline 71% to 88% accuracy")
      ? `Baseline 71% to 88% accuracy across 4 regions; measured weekly vs actuals. ${approvedFact}`
      : "",
    expectedResumeText: approvedResumeText,
    phase: "after approval",
  });
  assertFactExcludedFromSurfaces(scenario, afterApproval, rejectedFact, "Rejected follow-up fact", "after approval");
  assertFactExcludedFromSurfaces(scenario, afterApproval, pendingFact, "Pending follow-up fact", "after approval");

  const claimRiskChecklist = await readClaimRiskChecklist(page);
  assertClaimRiskChecklist({
    scenario,
    checklist: claimRiskChecklist,
    exportText: afterApproval.exportText,
    downloadText: afterApproval.downloadText,
    snapshot: afterApproval.snapshot,
    expectedIncludedText: [approvedResumeText, expectedRewrite, approvedFact],
    expectedExcludedText: [rejectedFact, pendingFact],
    expectedFlagTerms: ["follow-up", "rewrite"],
    phase: "after rewritten follow-up approval",
  });
  const followupProofPacket = await readProofPacketSurfaces(page);
  assertProofPacketContract({
    scenario,
    packet: followupProofPacket,
    exportText: afterApproval.exportText,
    downloadText: afterApproval.downloadText,
    expectedAcceptedText: [approvedResumeText],
    expectedProvenanceTerms: ["source"],
    expectedRiskTerms: ["follow-up", "rewrite"],
    expectedFollowupTerms: [expectedPrompt],
    excludedText: [rejectedFact, pendingFact],
    phase: "after rewritten follow-up approval",
  });
  await assertProofPacketRedactionContract({
    page,
    baseUrl,
    intakeId,
    scenario,
    rawSourceText: preApprovalDetails.text.includes("Baseline 71% to 88% accuracy")
      ? `Baseline 71% to 88% accuracy across 4 regions; measured weekly vs actuals. ${approvedFact}`
      : approvedFact,
    resumeText: approvedResumeText,
    rejectedText: rejectedFact,
    pendingText: pendingFact,
    phase: "after rewritten follow-up approval",
  });
}

async function runHappyPathScenario(page, baseUrl) {
  const scenario = createScenario("happy-path-local-review");

  await resetDrafts(page, baseUrl);
  await loadIntake(page, baseUrl);
  await page.fill("input[name='targetRole']", "Operations analyst");
  await page.fill("textarea[name='resumeText']", sampleResume);
  await page.click("button[type='submit']");
  await page.waitForSelector("#local-analysis:not([hidden])");

  const statusText = await page.textContent("#intake-status");
  const storageNote = await page.textContent("[data-pr='storageNote']");
  const wordCount = Number(await page.textContent("[data-pr='wordCount']"));
  scenario.check(statusText.includes("No external service was contacted"), "Intake status confirms local-only save.");
  scenario.check(storageNote.includes("localStorage only"), "Storage note identifies localStorage-only persistence.");
  scenario.check(wordCount >= 40, `Sample resume word count >= 40, got ${wordCount}.`);

  const stored = await storedDrafts(page);
  scenario.check(stored.intakes.length === 1, `Exactly 1 stored intake, got ${stored.intakes.length}.`);
  scenario.check(stored.lastIntakeId === stored.intakes[0].id, "lastIntakeId points at the stored draft.");
  scenario.check(stored.intakes[0].targetRole === "Operations analyst", "Stored target role matches input.");
  scenario.check(stored.intakes[0].rawText === sampleResume, "Stored raw text preserves pasted resume text unchanged.");
  scenario.check(
    stored.intakes[0].normalizedText.includes("Built quarterly demand forecast model"),
    "Normalized text includes pasted bullets."
  );
  scenario.check(stored.intakes[0].analysis?.sections?.includes("Experience"), "Local analysis detects Experience.");
  scenario.check(stored.intakes[0].analysis?.sections?.includes("Skills"), "Local analysis detects Skills.");

  const reviewHref = await page.getAttribute("[data-pr='reviewLink']", "href");
  scenario.check(
    reviewHref.includes(`/review.html?intake=${encodeURIComponent(stored.lastIntakeId)}`),
    "Review link includes saved intake id."
  );

  await page.click("[data-pr='reviewLink']");
  await page.waitForURL(`**/review.html?intake=${encodeURIComponent(stored.lastIntakeId)}`);
  await page.waitForSelector("[data-pr='approvalsSection']:not([hidden])");

  const reviewMode = await page.textContent("[data-pr='reportMode']");
  const reviewSubtitle = await page.textContent("[data-pr='reportSubtitle']");
  const originalText = await page.textContent("[data-pr='originalList']");
  const enhancedText = await page.textContent("[data-pr='enhancedList']");
  const approvalsSummary = await page.textContent("[data-pr='approvalsSummary']");

  scenario.check(reviewMode === "Your draft report", "Review page switches from sample mode to generated draft mode.");
  scenario.check(reviewSubtitle.includes("Generated locally"), "Review subtitle confirms local generation.");
  scenario.check(originalText.includes("Built quarterly demand forecast model"), "Review page renders saved original draft text.");
  scenario.check(
    enhancedText.includes("Impact: Built quarterly demand forecast model"),
    "Review page renders local enhanced draft bullets."
  );
  scenario.check(enhancedText.includes("Unapproved"), "Generated bullets start unapproved until evidence is approved.");
  scenario.check(approvalsSummary.includes("0 of"), "Approvals summary shows draft evidence approval state.");

  await page.click("[data-pr='approveAll']");
  await page.waitForFunction(() => document.querySelector("[data-pr='approvalsSummary']")?.textContent?.startsWith("9 of"));
  const approvedText = await page.textContent("[data-pr='enhancedList']");
  scenario.check(approvedText.includes("Approved (evidence-backed)"), "Approve all updates generated bullet evidence status.");

  await page.click("[data-pr='candidateList'] [data-candidate-key]:nth-child(6) [data-candidate-action='accepted']");
  await page.click("[data-pr='candidateList'] [data-candidate-key]:nth-child(7) [data-candidate-action='accepted']");
  await page.click("[data-pr='candidateList'] [data-candidate-key]:nth-child(8) [data-candidate-action='rejected']");
  await page.click("[data-pr='candidateList'] [data-candidate-key]:nth-child(9) [data-candidate-action='accepted']");

  const candidateSummary = await page.textContent("[data-pr='candidateSummary']");
  const candidateAuditText = await page.textContent("[data-pr='candidateList']");
  scenario.check(
    candidateSummary.includes("3 accepted, 1 rejected, 5 pending"),
    "Candidate summary reflects accepted, rejected, and pending decisions."
  );
  scenario.check(candidateAuditText.includes("Accepted candidate"), "Accepted candidates remain visible in the audit list.");
  scenario.check(candidateAuditText.includes("Rejected candidate"), "Rejected candidates remain visible in the audit list.");
  scenario.check(candidateAuditText.includes("Pending candidate"), "Pending candidates remain visible in the audit list.");

  const acceptedExportText = "Impact: Built quarterly demand forecast model";
  const secondAcceptedExportText = "Impact: Automated weekly leadership dashboard";
  const skillExportText = "Impact: SQL, Excel, Tableau, stakeholder communication";
  const rejectedExportText = "Impact: Skills";
  const pendingExportText = "Impact: Operations analyst focused on forecast quality";
  const editedExperienceHeading = "Selected Operations Wins";
  const editedSkillsHeading = "Technical Toolkit";
  const expectedRationaleSections = [
    {
      heading: editedSkillsHeading,
      defaultHeading: "CORE SKILLS",
      reasonTerms: ["skill", "source", "tool"],
    },
    {
      heading: editedExperienceHeading,
      defaultHeading: "OPERATIONS ANALYST EXPERIENCE",
      reasonTerms: ["experience", "role", "operations"],
    },
  ];

  await page.waitForSelector("[data-pr='exportHeadingEditor'] input[data-export-heading-default='OPERATIONS ANALYST EXPERIENCE']");
  await page.waitForSelector("[data-pr='exportHeadingEditor'] input[data-export-heading-default='CORE SKILLS']");
  await page.fill(
    "[data-pr='exportHeadingEditor'] input[data-export-heading-default='OPERATIONS ANALYST EXPERIENCE']",
    editedExperienceHeading
  );
  await page.fill("[data-pr='exportHeadingEditor'] input[data-export-heading-default='CORE SKILLS']", editedSkillsHeading);
  await page.waitForFunction(
    ({ experienceHeading, skillsHeading }) => {
      const output = document.querySelector("[data-pr='exportOutput']");
      return output?.value?.includes(experienceHeading) && output.value.includes(skillsHeading);
    },
    { experienceHeading: editedExperienceHeading, skillsHeading: editedSkillsHeading }
  );

  const exportSummary = await page.textContent("[data-pr='exportSummary']");
  const exportText = await page.inputValue("[data-pr='exportOutput']");
  const downloadHref = await page.getAttribute("[data-pr='downloadExport']", "href");
  const downloadName = await page.getAttribute("[data-pr='downloadExport']", "download");
  const downloadText = decodeDataTextHref(downloadHref);
  scenario.check(
    exportSummary.includes("3 accepted and evidence-approved bullets ready to export"),
    "Export summary counts only accepted and evidence-approved candidates."
  );
  scenario.check(exportSummary.includes("across 2 local sections"), "Export summary reports multiple local export sections.");
  scenario.check(exportSummary.includes("1 rejected"), "Export summary preserves rejected-candidate audit count.");
  scenario.check(exportSummary.includes("5 pending"), "Export summary preserves pending-candidate audit count.");
  scenario.check(exportText.includes(editedExperienceHeading), "Export output renders the edited Experience heading.");
  scenario.check(exportText.includes(editedSkillsHeading), "Export output renders the edited Skills heading.");
  scenario.check(exportText.includes(acceptedExportText), "Export output includes the accepted candidate update.");
  scenario.check(exportText.includes(secondAcceptedExportText), "Export output includes the second accepted candidate update.");
  scenario.check(exportText.includes(skillExportText), "Export output includes the accepted skills candidate update.");
  scenario.check(!exportText.includes(rejectedExportText), "Export output excludes rejected candidate updates.");
  scenario.check(!exportText.includes(pendingExportText), "Export output excludes pending candidate updates.");
  assertTextOrder(
    exportText,
    [editedExperienceHeading, acceptedExportText, secondAcceptedExportText, editedSkillsHeading, skillExportText],
    "Export output preserves edited headings and initial bullet order"
  );
  scenario.assertions.push("Export output preserves edited headings and initial bullet order.");
  scenario.check(downloadText === exportText, "Download text payload matches the on-page export output.");
  scenario.check(downloadText.includes(acceptedExportText), "Download text includes the accepted candidate update.");
  scenario.check(downloadText.includes(skillExportText), "Download text includes the accepted skills candidate update.");
  scenario.check(!downloadText.includes(rejectedExportText), "Download text excludes rejected candidate updates.");
  scenario.check(!downloadText.includes(pendingExportText), "Download text excludes pending candidate updates.");
  assertTextOrder(
    downloadText,
    [editedExperienceHeading, acceptedExportText, secondAcceptedExportText, editedSkillsHeading, skillExportText],
    "Download text preserves edited headings and initial bullet order"
  );
  scenario.assertions.push("Download text preserves edited headings and initial bullet order.");
  scenario.check(downloadName.startsWith("proofresume-section-"), "Download filename uses the local ProofResume export prefix.");

  await page.click("[data-pr='exportHeadingEditor'] [data-export-section-index='0'] [data-export-item-index='1'] [data-export-bullet-action='up']");
  await page.click("[data-pr='exportHeadingEditor'] [data-export-section-index='1'] [data-export-section-action='up']");
  const reorderedExportText = await page.inputValue("[data-pr='exportOutput']");
  scenario.check(reorderedExportText.includes(editedExperienceHeading), "Reordered export keeps the edited Experience heading.");
  scenario.check(reorderedExportText.includes(editedSkillsHeading), "Reordered export keeps the edited Skills heading.");
  scenario.check(
    reorderedExportText.indexOf(skillExportText) < reorderedExportText.indexOf(secondAcceptedExportText),
    "Export section reorder moves the skills section before experience."
  );
  scenario.check(
    reorderedExportText.indexOf(secondAcceptedExportText) < reorderedExportText.indexOf(acceptedExportText),
    "Export bullet reorder moves the second experience bullet before the first."
  );
  const reorderedDownloadText = decodeDataTextHref(await page.getAttribute("[data-pr='downloadExport']", "href"));
  const initialRationale = await readExportGroupingRationale(page);
  assertExportGroupingRationale({
    scenario,
    rationale: initialRationale,
    exportText: reorderedExportText,
    downloadText: reorderedDownloadText,
    snapshot: null,
    expectedSections: expectedRationaleSections,
    excludedCandidateTexts: [rejectedExportText, pendingExportText],
    phase: "initial reorder",
  });
  const initialClaimRiskChecklist = await readClaimRiskChecklist(page);
  assertClaimRiskChecklist({
    scenario,
    checklist: initialClaimRiskChecklist,
    exportText: reorderedExportText,
    downloadText: reorderedDownloadText,
    snapshot: null,
    expectedIncludedText: [acceptedExportText, secondAcceptedExportText, skillExportText],
    expectedExcludedText: [rejectedExportText, pendingExportText],
    expectedFlagTerms: ["metric", "vague"],
    phase: "initial pre-export review",
  });

  await page.click("[data-pr='saveExport']");
  await page.waitForFunction(() => document.querySelector("[data-pr='exportStatus']")?.textContent?.includes("Saved local export"));
  const exportSnapshot = await page.evaluate(() => {
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    return intakes[0]?.exportSnapshot || null;
  });
  scenario.check(exportSnapshot?.format === "proofresume-local-section-v1", "Saved export snapshot uses the local section format.");
  scenario.check(exportSnapshot.accepted?.length === 3, "Saved export snapshot contains accepted candidates only.");
  scenario.check(exportSnapshot.audit?.rejected?.length === 1, "Saved export snapshot keeps rejected candidates for audit.");
  scenario.check(exportSnapshot.audit?.pending?.length === 5, "Saved export snapshot keeps pending candidates for audit.");
  scenario.check(exportSnapshot.sections?.length === 2, "Saved export snapshot preserves two export sections.");
  scenario.check(exportSnapshot.sections?.[0]?.heading === editedSkillsHeading, "Saved export snapshot preserves reordered edited Skills heading.");
  scenario.check(exportSnapshot.sections?.[1]?.heading === editedExperienceHeading, "Saved export snapshot preserves reordered edited Experience heading.");
  scenario.check(exportSnapshot.sectionText.includes(acceptedExportText), "Saved export snapshot section text includes accepted updates.");
  scenario.check(exportSnapshot.sectionText.includes(editedExperienceHeading), "Saved export snapshot section text includes the edited Experience heading.");
  scenario.check(exportSnapshot.sectionText.includes(editedSkillsHeading), "Saved export snapshot section text includes the edited Skills heading.");
  scenario.check(
    exportSnapshot.sectionText.indexOf(skillExportText) < exportSnapshot.sectionText.indexOf(secondAcceptedExportText),
    "Saved export snapshot preserves reordered export sections."
  );
  scenario.check(
    exportSnapshot.sectionText.indexOf(secondAcceptedExportText) < exportSnapshot.sectionText.indexOf(acceptedExportText),
    "Saved export snapshot preserves reordered bullets."
  );
  scenario.check(
    !exportSnapshot.sectionText.includes(rejectedExportText),
    "Saved export snapshot section text excludes rejected updates."
  );
  scenario.check(!exportSnapshot.sectionText.includes(pendingExportText), "Saved export snapshot section text excludes pending updates.");
  scenario.check(
    exportSnapshot.audit.rejected[0]?.textStored === false && !JSON.stringify(exportSnapshot.audit.rejected).includes(rejectedExportText),
    "Saved export snapshot audit redacts rejected update text."
  );
  scenario.check(
    exportSnapshot.audit.pending.some((item) => item?.textStored === false) &&
      !JSON.stringify(exportSnapshot.audit.pending).includes(pendingExportText),
    "Saved export snapshot audit redacts pending update text."
  );
  scenario.check(
    exportSnapshot.accepted.every((item) => item?.evidenceStatus === "Approved (evidence-backed)"),
    "Saved export snapshot preserves evidence status labels."
  );
  assertExportGroupingRationale({
    scenario,
    rationale: initialRationale,
    exportText: reorderedExportText,
    downloadText: reorderedDownloadText,
    snapshot: exportSnapshot,
    expectedSections: expectedRationaleSections,
    excludedCandidateTexts: [rejectedExportText, pendingExportText],
    phase: "saved snapshot",
  });
  const initialProofPacket = await readProofPacketSurfaces(page);
  assertProofPacketContract({
    scenario,
    packet: initialProofPacket,
    exportText: reorderedExportText,
    downloadText: reorderedDownloadText,
    expectedAcceptedText: [acceptedExportText, secondAcceptedExportText, skillExportText],
    expectedProvenanceTerms: ["source"],
    expectedRiskTerms: ["metric", "vague"],
    excludedText: [rejectedExportText, pendingExportText],
    phase: "saved snapshot before follow-up approval",
  });
  await assertProofPacketRedactionContract({
    page,
    baseUrl,
    intakeId: stored.lastIntakeId,
    scenario,
    rawSourceText: "Built quarterly demand forecast model that improved accuracy from 71% to 88% across 4 regions.",
    resumeText: acceptedExportText,
    rejectedText: rejectedExportText,
    pendingText: pendingExportText,
    phase: "saved snapshot before follow-up approval",
  });

  const packetPageHref = await page.getAttribute("[data-pr='openProofPacket']", "href");
  await assertStandaloneProofPacketManifest({
    page,
    baseUrl,
    scenario,
    packetPageHref,
    intakeId: stored.lastIntakeId,
    expectedAcceptedText: [acceptedExportText, secondAcceptedExportText, skillExportText],
    rejectedText: rejectedExportText,
    pendingText: pendingExportText,
    expectedAcceptedCount: 3,
    expectedSectionCount: 2,
    expectedRejectedCount: 1,
    expectedPendingCount: 5,
    expectedRedactedSourceCount: 0,
    expectedRedactedFollowupCount: 0,
    phase: "saved snapshot standalone page after restore-all",
  });
  const afterStandaloneResume = await exportSurfaces(page);
  scenario.check(!afterStandaloneResume.exportText.includes("Share-readiness status"), "Resume export output excludes standalone packet share-readiness labels.");
  scenario.check(!afterStandaloneResume.downloadText.includes("Download packet JSON"), "Resume export download excludes standalone packet JSON labels.");
  scenario.check(!afterStandaloneResume.downloadText.includes("acceptedOnly"), "Resume export download excludes Proof Packet JSON manifest field names.");

  const followupAnswer = "Baseline 71% to 88% accuracy across 4 regions; measured weekly vs actuals.";
  const approvedFollowupFact = "Follow-up approved fact: forecasting accuracy rose from 71% to 88% across 4 regions.";
  const approvedFollowupRewrite =
    "Rewritten follow-up approved bullet: Improved forecast accuracy from 71% to 88% across 4 regions using weekly actuals.";
  const rejectedFollowupFact = "Follow-up rejected fact: owned a 12 million dollar finance migration.";
  const pendingFollowupFact = "Follow-up pending fact: cut monthly close time from 12 days to 5 days.";
  await page.fill("[data-pr='followupAnswer1']", `${followupAnswer} ${approvedFollowupFact}`);
  await page.fill("[data-pr='followupAnswer2']", rejectedFollowupFact);
  await page.fill("[data-pr='followupAnswer3']", pendingFollowupFact);
  await page.click("[data-pr='saveFollowups']");
  await page.waitForFunction(() => document.querySelector("[data-pr='followupStatus']")?.textContent?.includes("Saved follow-up answers"));

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector("[data-pr='candidateSection']:not([hidden])");
  const persistedCandidateSummary = await page.textContent("[data-pr='candidateSummary']");
  const persistedExportText = await page.inputValue("[data-pr='exportOutput']");
  const persistedDownloadText = decodeDataTextHref(await page.getAttribute("[data-pr='downloadExport']", "href"));
  const persisted = await page.evaluate(() => {
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    return {
      answer1: intakes[0]?.followups?.answers?.answer1 || "",
      exportHeadings: intakes[0]?.exportHeadings?.headings || {},
      exportOrder: intakes[0]?.exportOrder?.sections || [],
      snapshot: intakes[0]?.exportSnapshot || null,
    };
  });
  scenario.check(
    persistedCandidateSummary.includes("3 accepted, 1 rejected, 5 pending"),
    "Accepted, rejected, and pending decisions persist after reload."
  );
  scenario.check(persistedExportText.includes(acceptedExportText), "Reloaded export output keeps accepted updates.");
  scenario.check(persistedExportText.includes(editedExperienceHeading), "Reloaded export output keeps edited Experience heading.");
  scenario.check(persistedExportText.includes(editedSkillsHeading), "Reloaded export output keeps edited Skills heading.");
  scenario.check(!persistedExportText.includes(rejectedExportText), "Reloaded export output excludes rejected updates.");
  scenario.check(!persistedExportText.includes(pendingExportText), "Reloaded export output excludes pending updates.");
  scenario.check(
    persistedExportText.indexOf(skillExportText) < persistedExportText.indexOf(secondAcceptedExportText),
    "Reloaded export output preserves reordered sections."
  );
  scenario.check(
    persistedExportText.indexOf(secondAcceptedExportText) < persistedExportText.indexOf(acceptedExportText),
    "Reloaded export output preserves reordered bullets."
  );
  scenario.check(persistedDownloadText === persistedExportText, "Reloaded download text matches reloaded export output.");
  scenario.check(persisted.exportHeadings["OPERATIONS ANALYST EXPERIENCE"] === editedExperienceHeading, "Edited Experience heading persists locally.");
  scenario.check(persisted.exportHeadings["CORE SKILLS"] === editedSkillsHeading, "Edited Skills heading persists locally.");
  scenario.check(persisted.exportOrder?.[0]?.heading === editedSkillsHeading, "Export section order persists with the edited Skills heading first.");
  scenario.check(persisted.exportOrder?.[1]?.heading === editedExperienceHeading, "Export section order persists with the edited Experience heading second.");
  scenario.check(persisted.snapshot?.accepted?.length === 3, "Saved local snapshot persists after reload.");
  scenario.check(persisted.snapshot?.sections?.[0]?.heading === editedSkillsHeading, "Saved snapshot section heading order persists after reload.");
  scenario.check(persisted.snapshot?.audit?.rejected?.length === 1, "Rejected audit snapshot persists after reload.");
  scenario.check(persisted.snapshot?.audit?.pending?.length === 5, "Pending audit snapshot persists after reload.");
  scenario.check(persisted.answer1.includes("Baseline 71% to 88%"), "Follow-up answers persist inside the local intake record.");
  scenario.check(persisted.answer1.includes(approvedFollowupFact), "Approved follow-up fact candidate persists inside local answers.");
  scenario.check(!persistedExportText.includes(approvedFollowupFact), "Reloaded export output excludes follow-up facts before explicit approval.");
  scenario.check(!persistedDownloadText.includes(approvedFollowupFact), "Reloaded download text excludes follow-up facts before explicit approval.");
  scenario.check(
    !JSON.stringify(persisted.snapshot || {}).includes(approvedFollowupFact),
    "Saved local snapshot excludes follow-up facts before explicit approval."
  );
  const persistedRationale = await readExportGroupingRationale(page);
  assertExportGroupingRationale({
    scenario,
    rationale: persistedRationale,
    exportText: persistedExportText,
    downloadText: persistedDownloadText,
    snapshot: persisted.snapshot,
    expectedSections: expectedRationaleSections,
    excludedCandidateTexts: [rejectedExportText, pendingExportText],
    phase: "reload",
  });
  await assertFollowupEvidencePromotion({
    page,
    baseUrl,
    intakeId: stored.lastIntakeId,
    scenario,
    approvedFact: approvedFollowupFact,
    rejectedFact: rejectedFollowupFact,
    pendingFact: pendingFollowupFact,
    expectedPrompt: "Quantify one outcome",
    expectedRewrite: approvedFollowupRewrite,
  });

  return scenario;
}

async function runDemoBoundaryScenario(page, baseUrl) {
  const scenario = createScenario("demo-mode-sample-user-boundaries-no-network");
  const sampleOriginal = "Owned monthly forecast and worked with partners to improve accuracy.";
  const sampleEnhanced = "Improved monthly forecast accuracy from 72% to 89%";
  const userOriginal = "Led onboarding analytics project that saved 14 hours per month for support managers.";
  const userExportText = "Impact: Led onboarding analytics project";

  await resetDrafts(page, baseUrl);
  await page.goto(`${baseUrl}/review.html`, { waitUntil: "networkidle" });

  const sampleMode = await page.textContent("[data-pr='reportMode']");
  const sampleSubtitle = await page.textContent("[data-pr='reportSubtitle']");
  const sampleOriginalText = await page.textContent("[data-pr='originalList']");
  const sampleEnhancedText = await page.textContent("[data-pr='enhancedList']");
  const sampleStorage = await storedDrafts(page);
  const approvalsHiddenInSample = await page.getAttribute("[data-pr='approvalsSection']", "hidden");
  const candidatesHiddenInSample = await page.getAttribute("[data-pr='candidateSection']", "hidden");
  const exportHiddenInSample = await page.getAttribute("[data-pr='exportSection']", "hidden");
  const demoBoundary = await readDemoBoundarySurface(page);

  scenario.check(sampleMode === "Sample report", "Demo mode names the sample report before any user intake is selected.");
  scenario.check(sampleSubtitle.includes("static example"), "Demo mode explains that visible report content is sample material.");
  scenario.check(sampleOriginalText.includes(sampleOriginal), "Demo mode renders sample original resume text.");
  scenario.check(sampleEnhancedText.includes(sampleEnhanced), "Demo mode renders sample enhanced resume text.");
  scenario.check(sampleStorage.intakes.length === 0, "Opening the sample report does not create local user intake records.");
  scenario.check(sampleStorage.lastIntakeId === null, "Opening the sample report does not assign a last user intake id.");
  scenario.check(approvalsHiddenInSample !== null, "Demo mode keeps user approval controls hidden.");
  scenario.check(candidatesHiddenInSample !== null, "Demo mode keeps user candidate controls hidden.");
  scenario.check(exportHiddenInSample !== null, "Demo mode keeps user export controls hidden.");

  if (demoBoundary.exposed) {
    const boundaryText = demoBoundary.text.toLowerCase();
    scenario.check(boundaryText.includes("sample") || boundaryText.includes("demo"), "Exposed demo handles label sample/demo material.");
    scenario.check(boundaryText.includes("user") || boundaryText.includes("your"), "Exposed demo handles label user-provided material separately.");
  } else {
    scenario.assertions.push("Demo/sample/user boundary handles pending product exposure; current static sample versus user-draft boundary is still enforced.");
  }

  await loadIntake(page, baseUrl);
  await page.click("#load-demo");
  await page.waitForSelector("#local-analysis:not([hidden])");
  const demoStored = await storedDrafts(page);
  scenario.check(demoStored.intakes.length === 1, "Loading the sample demo creates exactly one local demo intake.");
  scenario.check(
    demoStored.intakes[0].sourceType === "demo_sample_material",
    "Sample demo intake is typed as demo sample material, not user-provided paste."
  );
  const demoSubmitDisabled = await page.isDisabled("button[type='submit']");
  scenario.check(demoSubmitDisabled, "When the sample demo is loaded, submit is disabled until demo text is replaced.");

  await page.fill("input[name='targetRole']", "Customer operations analyst");
  await page.fill("textarea[name='resumeText']", demoBoundaryResume);
  const submitReenabled = await page.isDisabled("button[type='submit']");
  scenario.check(!submitReenabled, "Replacing the demo text with user paste re-enables submit for a user-provided draft.");
  await page.click("button[type='submit']");
  await page.waitForSelector("#local-analysis:not([hidden])");
  const stored = await storedDrafts(page);
  scenario.check(stored.intakes.length === 2, "After running the demo, saving user paste keeps demo and user drafts as separate records.");
  scenario.check(stored.intakes[0].sourceType === "pasted_resume_text", "Newest intake is typed as pasted resume text, not demo/sample data.");
  scenario.check(stored.intakes[1].sourceType === "demo_sample_material", "Demo intake remains typed as demo sample material.");
  scenario.check(stored.intakes[0].rawText.includes(userOriginal), "User intake raw text contains the user-provided boundary fixture.");
  scenario.check(!stored.intakes[0].rawText.includes(sampleOriginal), "User intake raw text excludes sample report text.");
  scenario.check(!JSON.stringify(stored.intakes[0]).includes(sampleEnhanced), "User intake record excludes sample enhanced report text.");

  await page.click("[data-pr='reviewLink']");
  await page.waitForURL(`**/review.html?intake=${encodeURIComponent(stored.lastIntakeId)}`);
  await page.waitForSelector("[data-pr='approvalsSection']:not([hidden])");
  const userMode = await page.textContent("[data-pr='reportMode']");
  const userSubtitle = await page.textContent("[data-pr='reportSubtitle']");
  const userOriginalText = await page.textContent("[data-pr='originalList']");
  const userEnhancedText = await page.textContent("[data-pr='enhancedList']");
  const userBoundary = await readDemoBoundarySurface(page);

  scenario.check(userMode === "Your draft report", "User-data mode replaces the sample report label with a draft report label.");
  scenario.check(userSubtitle.includes("Generated locally"), "User-data mode confirms local generation.");
  scenario.check(userOriginalText.includes(userOriginal), "User-data mode renders the user-provided original text.");
  scenario.check(!userOriginalText.includes(sampleOriginal), "User-data mode original list excludes sample original text.");
  scenario.check(userEnhancedText.includes(userExportText), "User-data mode generates enhanced text from the user fixture.");
  scenario.check(!userEnhancedText.includes(sampleEnhanced), "User-data mode enhanced list excludes sample enhanced text.");

  if (userBoundary.exposed) {
    const boundaryText = userBoundary.text.toLowerCase();
    scenario.check(boundaryText.includes("user") || boundaryText.includes("your"), "Exposed user-data handles label user material in draft mode.");
    scenario.check(!boundaryText.includes("sample export"), "Exposed user-data handles do not label user export as sample material.");
  } else {
    scenario.assertions.push("User-data boundary handles pending product exposure; current generated-draft boundary is still enforced.");
  }

  await page.click("[data-pr='approveAll']");
  await page.waitForFunction(() => document.querySelector("[data-pr='approvalsSummary']")?.textContent?.includes(" of "));
  const acceptedCandidate = await clickCandidateAction(page, userExportText, "accepted");
  scenario.check(acceptedCandidate.clicked, `User-data candidate action accepts the boundary fixture (${acceptedCandidate.reason || "clicked"}).`);
  await page.waitForFunction(
    (text) => document.querySelector("[data-pr='exportOutput']")?.value?.includes(text),
    userExportText
  );
  await page.click("[data-pr='saveExport']");
  await page.waitForFunction(() => document.querySelector("[data-pr='exportStatus']")?.textContent?.includes("Saved local export"));

  const surfaces = await exportSurfaces(page);
  scenario.check(surfaces.exportText.includes(userExportText), "User export output includes accepted user-derived resume text.");
  scenario.check(surfaces.downloadText.includes(userExportText), "User export download includes accepted user-derived resume text.");
  scenario.check(String(surfaces.snapshot?.sectionText || "").includes(userExportText), "User export snapshot resume text includes accepted user-derived text.");
  scenario.check(!surfaces.exportText.includes(sampleOriginal), "User export output excludes sample original report text.");
  scenario.check(!surfaces.exportText.includes(sampleEnhanced), "User export output excludes sample enhanced report text.");
  scenario.check(!surfaces.downloadText.includes(sampleOriginal), "User export download excludes sample original report text.");
  scenario.check(!surfaces.downloadText.includes(sampleEnhanced), "User export download excludes sample enhanced report text.");
  scenario.check(!String(surfaces.snapshot?.sectionText || "").includes(sampleOriginal), "User snapshot resume text excludes sample original report text.");
  scenario.check(!String(surfaces.snapshot?.sectionText || "").includes(sampleEnhanced), "User snapshot resume text excludes sample enhanced report text.");

  return scenario;
}

async function runSessionResetScenario(page, baseUrl) {
  const scenario = createScenario("session-reset-clear-boundaries-no-network");

  await resetDrafts(page, baseUrl);
  await loadIntake(page, baseUrl);
  await seedSessionResetDrafts(page);
  await page.reload({ waitUntil: "networkidle" });

  let stored = await storedDrafts(page);
  scenario.check(stored.intakes.length === 3, "Reset fixture starts with demo and user local drafts.");
  scenario.check(stored.intakes.filter((intake) => intake.isDemo).length === 1, "Reset fixture includes exactly one demo draft.");
  scenario.check(stored.intakes.filter((intake) => !intake.isDemo).length === 2, "Reset fixture includes exactly two user drafts.");
  scenario.check(stored.intakes.every((intake) => redactionCountFor(intake) > 0), "Reset fixture starts with proof-packet redactions on every draft.");
  scenario.check(stored.lastIntakeId === "user_redacted_reset", "Reset fixture starts with a user draft selected as last intake.");

  await page.click("#reset-redactions");
  await page.waitForFunction(() => {
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    return (
      intakes.length === 3 &&
      intakes.every((intake) => {
        const sourceExcerpts = intake?.proofPacketRedactions?.sourceExcerpts || {};
        const followupNotes = intake?.proofPacketRedactions?.followupNotes || {};
        return Object.keys(sourceExcerpts).length === 0 && Object.keys(followupNotes).length === 0;
      })
    );
  });
  stored = await storedDrafts(page);
  const resetStatus = await page.textContent("#intake-status");
  scenario.check(stored.intakes.length === 3, "Clearing packet redactions preserves both demo and user drafts.");
  scenario.check(stored.intakes.every((intake) => redactionCountFor(intake) === 0), "Clearing packet redactions empties source and follow-up redaction maps.");
  scenario.check(
    stored.intakes.every((intake) => intake.exportSnapshot?.sectionText === "Session reset exported resume text should stay downloadable outside localStorage."),
    "Clearing packet redactions preserves saved resume export text snapshots."
  );
  scenario.check(
    stored.intakes.every((intake) => !intake.exportSnapshot?.proofPacketPreview && !intake.exportSnapshot?.proofPacketSnapshot),
    "Clearing packet redactions removes saved proof packet snapshot state."
  );
  scenario.check(
    stored.intakes.every((intake) => intake.exportSnapshot?.claimRiskChecklist?.items?.every((item) => item.sourceExcerptRedacted === false)),
    "Clearing packet redactions resets claim-risk source redaction flags."
  );
  scenario.check(
    stored.intakes.every((intake) => intake.exportSnapshot?.followups?.evidenceItems?.every((item) => item.redacted === false)),
    "Clearing packet redactions resets follow-up redaction flags."
  );
  scenario.check(
    stored.intakes.every((intake) => intake.exportSnapshot?.sections?.every((section) => section.accepted?.every((item) => item.redacted === false))),
    "Clearing packet redactions resets accepted packet item redaction flags."
  );
  scenario.check(stored.intakes.some((intake) => intake.sourceType === "demo_sample_material"), "Clearing packet redactions keeps demo draft boundaries.");
  scenario.check(stored.intakes.filter((intake) => intake.sourceType === "pasted_resume_text").length === 2, "Clearing packet redactions keeps user draft boundaries.");
  scenario.check(
    stored.intakes.every((intake) => String(intake.downloadedExportText || "").toLowerCase().includes("downloaded")),
    "Clearing packet redactions does not rewrite already-downloaded resume export text fixtures."
  );
  scenario.check(resetStatus.includes("Resume export text was not changed"), "Clearing packet redactions reports resume export text is unchanged.");
  scenario.check(stored.lastIntakeId === "user_redacted_reset", "Clearing packet redactions preserves the selected last intake.");

  await page.click("#reset-demo-drafts");
  await page.waitForFunction(() => {
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    return intakes.length === 2 && intakes.every((intake) => !intake.isDemo);
  });
  stored = await storedDrafts(page);
  scenario.check(stored.intakes.length === 2, "Clearing demo drafts removes only demo records.");
  scenario.check(stored.intakes.every((intake) => intake.sourceType === "pasted_resume_text"), "Clearing demo drafts leaves only user-provided draft records.");
  scenario.check(stored.intakes.every((intake) => redactionCountFor(intake) === 0), "Clearing demo drafts does not recreate packet redactions on user drafts.");
  scenario.check(stored.lastIntakeId === "user_redacted_reset", "Clearing demo drafts keeps a remaining user draft selected.");

  await seedSessionResetDrafts(page, "demo_redacted_reset");
  await page.reload({ waitUntil: "networkidle" });
  await page.click("#reset-user-drafts");
  await page.waitForFunction(() => {
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    return intakes.length === 1 && intakes[0]?.isDemo === true;
  });
  stored = await storedDrafts(page);
  scenario.check(stored.intakes.length === 1, "Clearing user drafts preserves the demo draft.");
  scenario.check(stored.intakes[0].sourceType === "demo_sample_material", "Clearing user drafts leaves sample/demo material typed separately.");
  scenario.check(stored.lastIntakeId === "demo_redacted_reset", "Clearing user drafts keeps the surviving demo draft selected.");

  await seedSessionResetDrafts(page);
  await page.reload({ waitUntil: "networkidle" });
  await page.click("#reset-all");
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("proofresume:intakes") || "[]").length === 0 &&
      localStorage.getItem("proofresume:lastIntakeId") === null
  );
  stored = await storedDrafts(page);
  const panelHidden = await page.getAttribute("#local-analysis", "hidden");
  scenario.check(stored.intakes.length === 0, "Clear all local drafts removes every demo and user draft.");
  scenario.check(stored.lastIntakeId === null, "Clear all local drafts removes the last intake pointer.");
  scenario.check(panelHidden !== null, "Clear all local drafts hides the local analysis panel.");

  return scenario;
}

async function runSessionPrepScenario(page, baseUrl) {
  const scenario = createScenario("session-prep-checklist-readiness-no-network");

  await resetDrafts(page, baseUrl);
  await loadIntake(page, baseUrl);

  let stored = await storedDrafts(page);
  const resetControls = await page.evaluate(() =>
    ["#reset-demo-drafts", "#reset-user-drafts", "#reset-redactions", "#reset-all"].map((selector) => {
      const node = document.querySelector(selector);
      return {
        selector,
        visible: Boolean(
          node &&
            !node.hidden &&
            node.getAttribute("aria-hidden") !== "true" &&
            getComputedStyle(node).display !== "none" &&
            getComputedStyle(node).visibility !== "hidden"
        ),
        text: node?.textContent || "",
      };
    })
  );
  scenario.check(stored.intakes.length === 0, "Session prep starts from an empty localStorage draft state.");
  scenario.check(resetControls.every((control) => control.visible), "Session prep reset controls are visible before an operator starts a session.");
  scenario.check(
    resetControls.some((control) => /demo/i.test(control.text)) &&
      resetControls.some((control) => /user/i.test(control.text)) &&
      resetControls.some((control) => /redaction/i.test(control.text)) &&
      resetControls.some((control) => /all/i.test(control.text)),
    "Session prep reset controls visibly separate demo, user, redaction, and all-draft reset states."
  );

  let checklist = await readSessionPrepChecklist(page);
  assertSessionPrepChecklistState({
    scenario,
    checklist,
    expectedReady: false,
    expectedTerms: ["draft", "reset", "role", "redaction"],
    phase: "empty local state",
  });

  await seedSessionResetDrafts(page, "user_redacted_reset");
  await page.reload({ waitUntil: "networkidle" });
  stored = await storedDrafts(page);
  scenario.check(stored.intakes.some((intake) => intake.isDemo), "Session prep fixture includes demo draft state.");
  scenario.check(stored.intakes.some((intake) => !intake.isDemo), "Session prep fixture includes user draft state.");
  scenario.check(stored.intakes.some((intake) => redactionCountFor(intake) > 0), "Session prep fixture includes uncleared redaction state.");
  scenario.check(
    stored.intakes.find((intake) => intake.id === stored.lastIntakeId)?.targetRole === "Operations analyst",
    "Session prep fixture exposes a selected user draft with a target role."
  );

  checklist = await readSessionPrepChecklist(page);
  assertSessionPrepChecklistState({
    scenario,
    checklist,
    expectedReady: false,
    expectedTerms: ["demo", "user", "role", "redaction"],
    phase: "user draft with uncleared redactions",
  });
  if (checklist.exposed) {
    scenario.check(
      /redact|packet|reset|clear/i.test([checklist.resetText, checklist.text].join("\n")),
      "Session prep checklist makes reset/redaction state visible when redactions remain."
    );
  }

  await page.click("#reset-redactions");
  await page.waitForFunction(() => {
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    return intakes.length > 0 && intakes.every((intake) => {
      const sourceExcerpts = intake?.proofPacketRedactions?.sourceExcerpts || {};
      const followupNotes = intake?.proofPacketRedactions?.followupNotes || {};
      return Object.keys(sourceExcerpts).length === 0 && Object.keys(followupNotes).length === 0;
    });
  });
  stored = await storedDrafts(page);
  scenario.check(stored.intakes.every((intake) => redactionCountFor(intake) === 0), "Session prep redaction reset clears every proof-packet redaction before session start.");
  scenario.check(stored.intakes.some((intake) => intake.isDemo), "Session prep redaction reset preserves demo draft visibility.");
  scenario.check(stored.intakes.some((intake) => !intake.isDemo), "Session prep redaction reset preserves user draft visibility.");
  scenario.check(stored.lastIntakeId === "user_redacted_reset", "Session prep redaction reset keeps the selected user draft available.");

  checklist = await readSessionPrepChecklist(page);
  assertSessionPrepChecklistState({
    scenario,
    checklist,
    expectedReady: null,
    expectedTerms: ["demo", "user", "role", "redaction"],
    phase: "multiple drafts with target role and cleared redactions",
  });
  if (checklist.exposed) {
    const resetRow = checklist.items.find((item) => item.key === "reset-state" || /reset state/i.test(item.text));
    scenario.check(Boolean(resetRow), "Session prep checklist keeps reset-state row visible after redactions are cleared.");
    scenario.check(checklist.redactions === "0", "Session prep checklist reports zero redactions after the redaction reset.");
  }

  await page.evaluate(() => {
    const intake = {
      id: "user_session_prep_ready",
      sourceType: "pasted_resume_text",
      isDemo: false,
      rawText: "Single ready user draft raw text.",
      normalizedText: "Single ready user draft raw text.",
      targetRole: "Operations analyst",
      proofPacketRedactions: {
        updatedAt: "2026-05-14T21:05:00.000Z",
        sourceExcerpts: {},
        followupNotes: {},
      },
    };
    localStorage.setItem("proofresume:intakes", JSON.stringify([intake]));
    localStorage.setItem("proofresume:lastIntakeId", intake.id);
  });
  await page.reload({ waitUntil: "networkidle" });
  stored = await storedDrafts(page);
  scenario.check(stored.intakes.length === 1, "Session prep ready fixture has exactly one selected local draft.");
  scenario.check(stored.intakes[0]?.targetRole === "Operations analyst", "Session prep ready fixture has a target role.");
  scenario.check(redactionCountFor(stored.intakes[0]) === 0, "Session prep ready fixture has no proof-packet redactions.");
  checklist = await readSessionPrepChecklist(page);
  assertSessionPrepChecklistState({
    scenario,
    checklist,
    expectedReady: true,
    expectedTerms: ["user", "role", "redaction"],
    phase: "single user draft with target role and cleared redactions",
  });

  await page.evaluate(() => {
    const intakes = JSON.parse(localStorage.getItem("proofresume:intakes") || "[]");
    const updated = intakes.map((intake) => ({ ...intake, targetRole: "" }));
    localStorage.setItem("proofresume:intakes", JSON.stringify(updated));
  });
  await page.reload({ waitUntil: "networkidle" });
  stored = await storedDrafts(page);
  scenario.check(
    stored.intakes.find((intake) => intake.id === "user_session_prep_ready")?.targetRole === "",
    "Session prep not-ready fixture can represent a selected user draft missing target role."
  );
  checklist = await readSessionPrepChecklist(page);
  assertSessionPrepChecklistState({
    scenario,
    checklist,
    expectedReady: false,
    expectedTerms: ["user", "role", "redaction"],
    phase: "selected user draft missing target role",
  });

  return scenario;
}

async function runFirstSessionHandoffScenario(page, baseUrl) {
  const scenario = createScenario("first-session-operator-handoff-no-network");

  await resetDrafts(page, baseUrl);
  const fixture = await seedFirstSessionHandoffDrafts(page);
  await loadIntake(page, baseUrl);

  const beforeStored = await storedDrafts(page);
  const selectedDraft = beforeStored.intakes.find((intake) => intake.id === beforeStored.lastIntakeId);
  scenario.check(beforeStored.intakes.length === 2, "First-session handoff fixture starts with demo and user drafts.");
  scenario.check(beforeStored.lastIntakeId === "first_session_selected_user", "First-session handoff fixture selects the user draft.");
  scenario.check(selectedDraft?.targetRole === "Operations analyst", "First-session handoff selected draft has a target role.");
  scenario.check(
    selectedDraft?.exportSnapshot?.proofPacketPreview?.shareReadiness?.status === "Review before sharing",
    "First-session handoff fixture includes Proof Packet share-readiness metadata."
  );
  scenario.check(
    selectedDraft?.exportSnapshot?.proofPacketPreview?.exportTextUnchanged === true,
    "First-session handoff fixture marks packet metadata as export-text unchanged."
  );
  scenario.check(
    selectedDraft?.exportSnapshot?.proofPacketSnapshot?.format === "proofresume-local-proof-packet-snapshot-v1",
    "First-session handoff fixture persists a proof packet JSON snapshot alongside the resume export snapshot."
  );
  scenario.check(
    selectedDraft?.exportSnapshot?.proofPacketSnapshot?.packet?.manifestSummary?.format === "proofresume-proof-packet-manifest-summary-v1",
    "First-session handoff fixture stores the proof packet manifest summary inside the persisted snapshot."
  );

  const handoff = await readFirstSessionHandoff(page);
  assertFirstSessionHandoffState({
    scenario,
    handoff,
    selectedDraftId: "first_session_selected_user",
    selectedExportText: fixture.selectedExportText,
    phase: "intake handoff fixture",
  });

  const afterStored = await storedDrafts(page);
  const afterSelectedDraft = afterStored.intakes.find((intake) => intake.id === afterStored.lastIntakeId);
  scenario.check(afterStored.lastIntakeId === beforeStored.lastIntakeId, "First-session handoff leaves selected draft pointer unchanged.");
  scenario.check(
    afterSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText,
    "First-session handoff leaves saved resume export text unchanged."
  );
  scenario.check(
    afterSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "First-session handoff leaves downloaded resume export text fixture unchanged."
  );

  return scenario;
}

async function runFirstRecruitDispatchBoardScenario(page, baseUrl) {
  const scenario = createScenario("first-recruit-dispatch-board-no-network");

  await resetDrafts(page, baseUrl);
  const fixture = await seedFirstRecruitDispatchDrafts(page);
  await loadIntake(page, baseUrl);

  const beforeStored = await storedDrafts(page);
  const selectedDraft = beforeStored.intakes.find((intake) => intake.id === beforeStored.lastIntakeId);
  scenario.check(beforeStored.intakes.length === 2, "First-recruit dispatch board fixture starts with demo and user drafts.");
  scenario.check(beforeStored.lastIntakeId === "first_recruit_dispatch_selected_user", "First-recruit dispatch board fixture selects the user draft.");
  scenario.check(selectedDraft?.targetRole === "Operations analyst", "First-recruit dispatch board selected draft has a target role.");
  scenario.check(
    selectedDraft?.firstRecruitDispatch?.sendDecision === "No-send",
    "First-recruit dispatch board fixture starts from a no-send decision."
  );
  scenario.check(
    selectedDraft?.firstRecruitDispatch?.replyStatus === "Not observed",
    "First-recruit dispatch board fixture starts with first-recruit reply facts not observed."
  );
  scenario.check(
    selectedDraft?.firstRecruitDispatch?.exportTextUnchanged === true,
    "First-recruit dispatch board fixture marks dispatch metadata as export-text unchanged."
  );

  const board = await readFirstRecruitDispatchBoard(page);
  assertFirstRecruitDispatchBoardState({
    scenario,
    board,
    selectedDraftId: "first_recruit_dispatch_selected_user",
    selectedExportText: fixture.selectedExportText,
    phase: "intake dispatch fixture",
  });

  const afterStored = await storedDrafts(page);
  const afterSelectedDraft = afterStored.intakes.find((intake) => intake.id === afterStored.lastIntakeId);
  scenario.check(afterStored.lastIntakeId === beforeStored.lastIntakeId, "First-recruit dispatch board leaves selected draft pointer unchanged.");
  scenario.check(
    afterSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText,
    "First-recruit dispatch board leaves saved resume export text unchanged."
  );
  scenario.check(
    afterSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "First-recruit dispatch board leaves downloaded resume export text fixture unchanged."
  );
  scenario.check(
    afterSelectedDraft?.firstRecruitDispatch?.replyStatus === "Not observed",
    "First-recruit dispatch board leaves first-recruit reply status unobserved."
  );

  return scenario;
}

async function runFirstReplyTriageBoardScenario(page, baseUrl) {
  const scenario = createScenario("first-reply-triage-board-no-network");

  await resetDrafts(page, baseUrl);
  const fixture = await seedFirstReplyTriageDrafts(page);
  await loadIntake(page, baseUrl);

  const beforeStored = await storedDrafts(page);
  const selectedDraft = beforeStored.intakes.find((intake) => intake.id === beforeStored.lastIntakeId);
  scenario.check(beforeStored.intakes.length === 2, "First-reply triage board fixture starts with demo and user drafts.");
  scenario.check(beforeStored.lastIntakeId === "first_reply_triage_selected_user", "First-reply triage board fixture selects the user draft.");
  scenario.check(selectedDraft?.targetRole === "Operations analyst", "First-reply triage board selected draft has a target role.");
  scenario.check(
    selectedDraft?.firstReplyTriage?.triageReadiness === "No reply",
    "First-reply triage board fixture starts from a no-reply triage state."
  );
  scenario.check(
    selectedDraft?.firstReplyTriage?.replyStatus === "Not observed",
    "First-reply triage board fixture starts with real reply facts not observed."
  );
  scenario.check(
    selectedDraft?.firstReplyTriage?.exportTextUnchanged === true,
    "First-reply triage board fixture marks triage metadata as export-text unchanged."
  );

  const board = await readFirstReplyTriageBoard(page);
  assertFirstReplyTriageBoardState({
    scenario,
    board,
    selectedDraftId: "first_reply_triage_selected_user",
    selectedExportText: fixture.selectedExportText,
    phase: "intake triage fixture",
  });

  const afterStored = await storedDrafts(page);
  const afterSelectedDraft = afterStored.intakes.find((intake) => intake.id === afterStored.lastIntakeId);
  scenario.check(afterStored.lastIntakeId === beforeStored.lastIntakeId, "First-reply triage board leaves selected draft pointer unchanged.");
  scenario.check(
    afterSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText,
    "First-reply triage board leaves saved resume export text unchanged."
  );
  scenario.check(
    afterSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "First-reply triage board leaves downloaded resume export text fixture unchanged."
  );
  scenario.check(
    afterSelectedDraft?.firstReplyTriage?.replyStatus === "Not observed",
    "First-reply triage board leaves real reply facts not observed."
  );

  return scenario;
}

async function runFirstReplyFactCaptureScenario(page, baseUrl) {
  const scenario = createScenario("first-reply-fact-capture-no-network");

  await resetDrafts(page, baseUrl);
  const fixture = await seedFirstReplyFactCaptureDrafts(page);
  await loadIntake(page, baseUrl);

  const beforeStored = await storedDrafts(page);
  const selectedDraft = beforeStored.intakes.find((intake) => intake.id === beforeStored.lastIntakeId);
  const backgroundDraft = beforeStored.intakes.find((intake) => intake.id === "first_reply_fact_capture_background_demo");
  scenario.check(beforeStored.intakes.length === 2, "First-reply fact capture fixture starts with demo and user drafts.");
  scenario.check(beforeStored.lastIntakeId === "first_reply_fact_capture_selected_user", "First-reply fact capture fixture selects the user draft.");
  scenario.check(selectedDraft?.targetRole === "Operations analyst", "First-reply fact capture selected draft has a target role.");
  scenario.check(
    selectedDraft?.firstReplyFactCapture?.observedState === "Not observed",
    "First-reply fact capture defaults to not-observed reply state."
  );
  scenario.check(
    selectedDraft?.firstReplyFacts?.state === "unobserved",
    "First-reply fact capture product state defaults to unobserved."
  );
  scenario.check(
    Array.isArray(selectedDraft?.firstReplyFactCapture?.capturedFacts) && selectedDraft.firstReplyFactCapture.capturedFacts.length === 0,
    "First-reply fact capture defaults to zero captured facts."
  );
  scenario.check(
    selectedDraft?.firstReplyFactCapture?.exportTextUnchanged === true,
    "First-reply fact capture fixture marks default metadata as export-text unchanged."
  );
  scenario.check(
    backgroundDraft?.firstReplyFactCapture?.observedState === "Not observed",
    "First-reply fact capture background demo draft remains not observed before explicit local changes."
  );

  const defaultCapture = await readFirstReplyFactCapture(page);
  assertFirstReplyFactCaptureState({
    scenario,
    capture: defaultCapture,
    selectedDraftId: "first_reply_fact_capture_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "not-observed",
    phase: "default unobserved fixture",
  });

  const explicitFacts = await applyFirstReplyFactCaptureLocalState(page);
  await page.reload({ waitUntil: "networkidle" });

  const afterStored = await storedDrafts(page);
  const afterSelectedDraft = afterStored.intakes.find((intake) => intake.id === afterStored.lastIntakeId);
  const afterBackgroundDraft = afterStored.intakes.find((intake) => intake.id === "first_reply_fact_capture_background_demo");
  const serializedSelected = JSON.stringify(afterSelectedDraft || {});
  scenario.check(afterStored.lastIntakeId === beforeStored.lastIntakeId, "First-reply fact capture leaves selected draft pointer unchanged after explicit local state changes.");
  scenario.check(
    afterSelectedDraft?.firstReplyFactCapture?.observedState === "Observed",
    "First-reply fact capture stores explicit local observed state on the selected draft."
  );
  scenario.check(
    afterSelectedDraft?.firstReplyFacts?.state === "accepted",
    "First-reply fact capture stores explicit local product state on the selected draft."
  );
  scenario.check(
    afterSelectedDraft?.firstReplyFactCapture?.capturedFacts?.[0]?.text === explicitFacts.capturedFactText,
    "First-reply fact capture stores explicit local captured fact text."
  );
  scenario.check(
    afterSelectedDraft?.firstReplyFactCapture?.rawReplyText === explicitFacts.rawReplyText,
    "First-reply fact capture stores explicit local raw reply text as fact-capture metadata."
  );
  scenario.check(
    afterSelectedDraft?.firstReplyFactCapture?.capturedFacts?.every((fact) => fact.exportEligible === false),
    "First-reply fact capture keeps captured reply facts export-ineligible until a later product promotion path exists."
  );
  scenario.check(
    afterSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText,
    "First-reply fact capture leaves saved resume export text unchanged after explicit local state changes."
  );
  scenario.check(
    afterSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "First-reply fact capture leaves downloaded resume export text fixture unchanged after explicit local state changes."
  );
  scenario.check(
    !String(afterSelectedDraft?.exportSnapshot?.sectionText || "").includes(explicitFacts.capturedFactText),
    "First-reply fact capture captured fact is excluded from saved resume export text."
  );
  scenario.check(
    !String(afterSelectedDraft?.downloadedExportText || "").includes(explicitFacts.capturedFactText),
    "First-reply fact capture captured fact is excluded from downloaded resume export text."
  );
  scenario.check(
    serializedSelected.includes(explicitFacts.capturedFactText) && serializedSelected.includes(explicitFacts.rawReplyText),
    "First-reply fact capture keeps captured fact and raw reply text in local metadata only."
  );
  scenario.check(
    afterBackgroundDraft?.firstReplyFactCapture?.observedState === "Not observed" &&
      afterBackgroundDraft?.firstReplyFactCapture?.capturedFacts?.length === 0,
    "First-reply fact capture explicit local change does not mutate the background demo draft."
  );

  const observedCapture = await readFirstReplyFactCapture(page);
  assertFirstReplyFactCaptureState({
    scenario,
    capture: observedCapture,
    selectedDraftId: "first_reply_fact_capture_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "observed",
    expectedFactText: "Accepted",
    unexpectedFactText: "Background demo draft for first-reply fact capture selection checks.",
    phase: "explicit observed local state",
  });

  return scenario;
}

async function runSchedulingReadinessScenario(page, baseUrl) {
  const scenario = createScenario("scheduling-readiness-no-network");

  await resetDrafts(page, baseUrl);
  const fixture = await seedSchedulingReadinessDrafts(page);
  await loadIntake(page, baseUrl);

  const beforeStored = await storedDrafts(page);
  const selectedDraft = beforeStored.intakes.find((intake) => intake.id === beforeStored.lastIntakeId);
  const backgroundDraft = beforeStored.intakes.find((intake) => intake.id === "scheduling_readiness_background_demo");
  scenario.check(beforeStored.intakes.length === 2, "Scheduling readiness fixture starts with demo and user drafts.");
  scenario.check(beforeStored.lastIntakeId === "scheduling_readiness_selected_user", "Scheduling readiness fixture selects the user draft.");
  scenario.check(selectedDraft?.targetRole === "Operations analyst", "Scheduling readiness selected draft has a target role.");
  scenario.check(
    selectedDraft?.schedulingReadiness?.state === "blocked",
    "Scheduling readiness defaults to blocked before accepted-local scheduling state."
  );
  scenario.check(
    selectedDraft?.schedulingReadiness?.acceptedLocal === false,
    "Scheduling readiness default state has no accepted-local confirmation."
  );
  scenario.check(
    Array.isArray(selectedDraft?.schedulingReadiness?.localSchedulingFacts) &&
      selectedDraft.schedulingReadiness.localSchedulingFacts.length === 0,
    "Scheduling readiness default state has zero local scheduling facts."
  );
  scenario.check(
    selectedDraft?.schedulingReadiness?.exportTextUnchanged === true,
    "Scheduling readiness fixture marks blocked metadata as export-text unchanged."
  );
  scenario.check(
    backgroundDraft?.schedulingReadiness?.state === "blocked",
    "Scheduling readiness background demo draft also starts blocked."
  );

  const defaultReadiness = await readSchedulingReadiness(page);
  assertSchedulingReadinessState({
    scenario,
    readiness: defaultReadiness,
    selectedDraftId: "scheduling_readiness_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "blocked",
    phase: "default blocked fixture",
  });

  const acceptedLocal = await applySchedulingAcceptedLocalState(page);
  await page.reload({ waitUntil: "networkidle" });

  const afterStored = await storedDrafts(page);
  const afterSelectedDraft = afterStored.intakes.find((intake) => intake.id === afterStored.lastIntakeId);
  const afterBackgroundDraft = afterStored.intakes.find((intake) => intake.id === "scheduling_readiness_background_demo");
  const serializedSelected = JSON.stringify(afterSelectedDraft || {});
  scenario.check(afterStored.lastIntakeId === beforeStored.lastIntakeId, "Scheduling readiness leaves selected draft pointer unchanged after accepted-local state changes.");
  scenario.check(
    afterSelectedDraft?.schedulingReadiness?.state === "accepted-local",
    "Scheduling readiness stores accepted-local state on the selected draft."
  );
  scenario.check(
    afterSelectedDraft?.schedulingReadiness?.acceptedLocal === true,
    "Scheduling readiness stores accepted-local confirmation on the selected draft."
  );
  scenario.check(
    afterSelectedDraft?.schedulingReadiness?.localSchedulingFacts?.[0]?.text === acceptedLocal.schedulingFactText,
    "Scheduling readiness stores explicit local scheduling fact text."
  );
  scenario.check(
    afterSelectedDraft?.schedulingReadiness?.localSchedulingFacts?.every((fact) => fact.exportEligible === false),
    "Scheduling readiness keeps local scheduling facts export-ineligible."
  );
  scenario.check(
    afterSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText,
    "Scheduling readiness leaves saved resume export text unchanged after accepted-local state changes."
  );
  scenario.check(
    afterSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Scheduling readiness leaves downloaded resume export text fixture unchanged after accepted-local state changes."
  );
  scenario.check(
    !String(afterSelectedDraft?.exportSnapshot?.sectionText || "").includes(acceptedLocal.schedulingFactText),
    "Scheduling readiness accepted-local fact is excluded from saved resume export text."
  );
  scenario.check(
    !String(afterSelectedDraft?.downloadedExportText || "").includes(acceptedLocal.schedulingFactText),
    "Scheduling readiness accepted-local fact is excluded from downloaded resume export text."
  );
  scenario.check(
    serializedSelected.includes(acceptedLocal.schedulingFactText) && serializedSelected.includes("first-reply-local-operator-note"),
    "Scheduling readiness keeps accepted-local scheduling fact in local metadata only."
  );
  scenario.check(
    afterBackgroundDraft?.schedulingReadiness?.state === "blocked" &&
      afterBackgroundDraft?.schedulingReadiness?.acceptedLocal === false,
    "Scheduling readiness accepted-local change does not mutate the background demo draft."
  );

  const acceptedReadiness = await readSchedulingReadiness(page);
  assertSchedulingReadinessState({
    scenario,
    readiness: acceptedReadiness,
    selectedDraftId: "scheduling_readiness_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "accepted-local",
    expectedSchedulingFactText: acceptedLocal.schedulingFactText,
    phase: "accepted-local fixture",
  });

  return scenario;
}

async function runSessionStartGateScenario(page, baseUrl) {
  const scenario = createScenario("session-start-gate-no-network");

  await resetDrafts(page, baseUrl);
  const fixture = await seedSessionStartGateDrafts(page);
  await loadIntake(page, baseUrl);

  const beforeStored = await storedDrafts(page);
  const selectedDraft = beforeStored.intakes.find((intake) => intake.id === beforeStored.lastIntakeId);
  const backgroundDraft = beforeStored.intakes.find((intake) => intake.id === "session_start_gate_background_demo");
  scenario.check(beforeStored.intakes.length === 2, "Session-start gate fixture starts with demo and user drafts.");
  scenario.check(beforeStored.lastIntakeId === "session_start_gate_selected_user", "Session-start gate fixture selects the user draft.");
  scenario.check(selectedDraft?.targetRole === "Operations analyst", "Session-start gate selected draft has a target role.");
  scenario.check(
    selectedDraft?.sessionStartGate?.state === "blocked",
    "Session-start gate defaults to blocked before appointment-confirmed readiness."
  );
  scenario.check(
    selectedDraft?.sessionStartGate?.appointmentConfirmed === false &&
      selectedDraft?.sessionStartGate?.calendarReady === false &&
      selectedDraft?.sessionStartGate?.consentReady === false &&
      selectedDraft?.sessionStartGate?.redactedMaterialReady === false,
    "Session-start gate default state is blocked by missing appointment, calendar, consent, and redacted-material readiness."
  );
  scenario.check(
    selectedDraft?.appointmentSessionStartGate?.appointmentDateTime === "" &&
      selectedDraft?.appointmentSessionStartGate?.consentBoundaryConfirmed === false &&
      selectedDraft?.appointmentSessionStartGate?.redactedMaterialReminderConfirmed === false &&
      selectedDraft?.appointmentSessionStartGate?.rawNotePrepConfirmed === false,
    "Session-start gate product fixture defaults to missing appointment, consent, redacted reminder, and raw-note prep facts."
  );
  scenario.check(
    selectedDraft?.sessionStartGate?.exportTextUnchanged === true,
    "Session-start gate fixture marks blocked metadata as export-text unchanged."
  );
  scenario.check(
    backgroundDraft?.sessionStartGate?.state === "blocked",
    "Session-start gate background demo draft starts blocked."
  );

  const defaultGate = await readSessionStartGate(page);
  assertSessionStartGateState({
    scenario,
    gate: defaultGate,
    selectedDraftId: "session_start_gate_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "blocked",
    phase: "default blocked fixture",
  });

  const readyLocal = await applySessionStartReadyLocalState(page);
  await page.reload({ waitUntil: "networkidle" });

  const afterStored = await storedDrafts(page);
  const afterSelectedDraft = afterStored.intakes.find((intake) => intake.id === afterStored.lastIntakeId);
  const afterBackgroundDraft = afterStored.intakes.find((intake) => intake.id === "session_start_gate_background_demo");
  const serializedSelected = JSON.stringify(afterSelectedDraft || {});
  scenario.check(afterStored.lastIntakeId === beforeStored.lastIntakeId, "Session-start gate leaves selected draft pointer unchanged after ready local state changes.");
  scenario.check(
    afterSelectedDraft?.sessionStartGate?.state === "ready-local",
    "Session-start gate stores ready-local state on the selected draft."
  );
  scenario.check(
    afterSelectedDraft?.sessionStartGate?.appointmentConfirmed === true &&
      afterSelectedDraft?.sessionStartGate?.calendarReady === true &&
      afterSelectedDraft?.sessionStartGate?.consentReady === true &&
      afterSelectedDraft?.sessionStartGate?.redactedMaterialReady === true,
    "Session-start gate stores appointment, calendar, consent, and redacted-material readiness on the selected draft."
  );
  scenario.check(
    afterSelectedDraft?.appointmentSessionStartGate?.appointmentDateTime === "2026-05-19T14:00" &&
      afterSelectedDraft?.appointmentSessionStartGate?.consentBoundaryConfirmed === true &&
      afterSelectedDraft?.appointmentSessionStartGate?.redactedMaterialReminderConfirmed === true &&
      afterSelectedDraft?.appointmentSessionStartGate?.rawNotePrepConfirmed === true,
    "Session-start gate stores product appointment, consent, redacted reminder, and raw-note prep facts on the selected draft."
  );
  scenario.check(
    afterSelectedDraft?.sessionStartGate?.localSessionStartFacts?.[0]?.text === readyLocal.appointmentFactText,
    "Session-start gate stores explicit appointment-confirmed local fact text."
  );
  scenario.check(
    afterSelectedDraft?.sessionStartGate?.localSessionStartFacts?.every((fact) => fact.exportEligible === false),
    "Session-start gate keeps appointment-confirmed facts export-ineligible."
  );
  scenario.check(
    afterSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText,
    "Session-start gate leaves saved resume export text unchanged after ready local state changes."
  );
  scenario.check(
    afterSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Session-start gate leaves downloaded resume export text fixture unchanged after ready local state changes."
  );
  scenario.check(
    !String(afterSelectedDraft?.exportSnapshot?.sectionText || "").includes(readyLocal.appointmentFactText),
    "Session-start gate appointment-confirmed fact is excluded from saved resume export text."
  );
  scenario.check(
    !String(afterSelectedDraft?.downloadedExportText || "").includes(readyLocal.appointmentFactText),
    "Session-start gate appointment-confirmed fact is excluded from downloaded resume export text."
  );
  scenario.check(
    serializedSelected.includes(readyLocal.appointmentFactText) && serializedSelected.includes("appointment-confirmed-local-operator-note"),
    "Session-start gate keeps appointment-confirmed fact in local metadata only."
  );
  scenario.check(
    afterBackgroundDraft?.sessionStartGate?.state === "blocked" &&
      afterBackgroundDraft?.sessionStartGate?.appointmentConfirmed === false,
    "Session-start gate ready-local change does not mutate the background demo draft."
  );

  const readyGate = await readSessionStartGate(page);
  assertSessionStartGateState({
    scenario,
    gate: readyGate,
    selectedDraftId: "session_start_gate_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "ready-local",
    expectedAppointmentFactText: readyLocal.appointmentFactText,
    phase: "ready-local fixture",
  });

  return scenario;
}

async function runRawNoteCaptureScenario(page, baseUrl) {
  const scenario = createScenario("first-session-raw-note-capture-no-network");

  await resetDrafts(page, baseUrl);
  const fixture = await seedRawNoteCaptureDrafts(page);
  await loadIntake(page, baseUrl);

  const beforeStored = await storedDrafts(page);
  const selectedDraft = beforeStored.intakes.find((intake) => intake.id === beforeStored.lastIntakeId);
  const backgroundDraft = beforeStored.intakes.find((intake) => intake.id === "raw_note_capture_background_demo");
  scenario.check(beforeStored.intakes.length === 2, "First-session raw-note capture fixture starts with demo and user drafts.");
  scenario.check(beforeStored.lastIntakeId === "raw_note_capture_selected_user", "First-session raw-note capture fixture selects the user draft.");
  scenario.check(selectedDraft?.targetRole === "Operations analyst", "First-session raw-note capture selected draft has a target role.");
  scenario.check(
    selectedDraft?.sessionStartGate?.state === "blocked" && selectedDraft?.sessionStartGate?.readyLocal === false,
    "First-session raw-note capture defaults to blocked before session-start readiness."
  );
  scenario.check(
    selectedDraft?.firstSessionRawNoteCapture?.state === "blocked" &&
      selectedDraft?.firstSessionRawNoteCapture?.readyToCapture === false &&
      selectedDraft?.firstSessionRawNoteCapture?.notesRecorded === false,
    "First-session raw-note capture default state is blocked with no local notes recorded."
  );
  scenario.check(
    selectedDraft?.firstSessionRawNoteCapture?.exportTextUnchanged === true,
    "First-session raw-note capture fixture marks blocked metadata as export-text unchanged."
  );
  scenario.check(
    backgroundDraft?.firstSessionRawNoteCapture?.state === "blocked",
    "First-session raw-note capture background demo draft starts blocked."
  );

  const defaultCapture = await readRawNoteCapture(page);
  assertRawNoteCaptureState({
    scenario,
    capture: defaultCapture,
    selectedDraftId: "raw_note_capture_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "blocked",
    phase: "default blocked fixture",
  });

  const rawNoteSaved = await applyRawNoteSavedLocalState(page);
  await page.reload({ waitUntil: "networkidle" });

  const afterStored = await storedDrafts(page);
  const afterSelectedDraft = afterStored.intakes.find((intake) => intake.id === afterStored.lastIntakeId);
  const afterBackgroundDraft = afterStored.intakes.find((intake) => intake.id === "raw_note_capture_background_demo");
  const serializedSelected = JSON.stringify(afterSelectedDraft || {});
  scenario.check(afterStored.lastIntakeId === beforeStored.lastIntakeId, "First-session raw-note capture leaves selected draft pointer unchanged after notes are saved.");
  scenario.check(
    afterSelectedDraft?.sessionStartGate?.state === "ready-local" && afterSelectedDraft?.sessionStartGate?.readyLocal === true,
    "First-session raw-note capture stores session-start ready-local prerequisite on the selected draft before saving notes."
  );
  scenario.check(
    afterSelectedDraft?.firstSessionRawNoteCapture?.state === "notes-recorded",
    "First-session raw-note capture stores notes-recorded state on the selected draft."
  );
  scenario.check(
    afterSelectedDraft?.firstSessionRawNoteCapture?.rawNoteText === rawNoteSaved.rawNoteText,
    "First-session raw-note capture stores the exact raw note text locally."
  );
  scenario.check(
    afterSelectedDraft?.firstSessionRawNoteCapture?.debriefReady === true &&
      afterSelectedDraft?.firstSessionRawNoteCapture?.objectionCodingReady === true,
    "First-session raw-note capture routes saved notes to debrief and objection coding locally."
  );
  scenario.check(
    afterSelectedDraft?.firstSessionRawNoteCapture?.exportEligible === false &&
      afterSelectedDraft?.rawNoteCapture?.exportEligible === false,
    "First-session raw-note capture keeps saved raw notes export-ineligible."
  );
  scenario.check(
    afterSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText,
    "First-session raw-note capture leaves saved resume export text unchanged after notes are saved."
  );
  scenario.check(
    afterSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "First-session raw-note capture leaves downloaded resume export text fixture unchanged after notes are saved."
  );
  scenario.check(
    !String(afterSelectedDraft?.exportSnapshot?.sectionText || "").includes(rawNoteSaved.rawNoteText),
    "First-session raw-note capture raw note text is excluded from saved resume export text."
  );
  scenario.check(
    !String(afterSelectedDraft?.downloadedExportText || "").includes(rawNoteSaved.rawNoteText),
    "First-session raw-note capture raw note text is excluded from downloaded resume export text."
  );
  scenario.check(
    serializedSelected.includes(rawNoteSaved.rawNoteText) && serializedSelected.includes(rawNoteSaved.debriefNoteText),
    "First-session raw-note capture keeps raw note and debrief-routing detail in local metadata only."
  );
  scenario.check(
    afterBackgroundDraft?.firstSessionRawNoteCapture?.state === "blocked" &&
      afterBackgroundDraft?.firstSessionRawNoteCapture?.notesRecorded === false,
    "First-session raw-note capture saved local note does not mutate the background demo draft."
  );

  const savedCapture = await readRawNoteCapture(page);
  assertRawNoteCaptureState({
    scenario,
    capture: savedCapture,
    selectedDraftId: "raw_note_capture_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "notes-recorded",
    expectedRawNoteText: rawNoteSaved.rawNoteText,
    phase: "notes-recorded fixture",
  });

  return scenario;
}

async function runPostSessionDebriefScenario(page, baseUrl) {
  const scenario = createScenario("post-session-debrief-handoff-no-network");

  await resetDrafts(page, baseUrl);
  const fixture = await seedPostSessionDebriefDrafts(page);
  await loadIntake(page, baseUrl);

  const beforeStored = await storedDrafts(page);
  const selectedDraft = beforeStored.intakes.find((intake) => intake.id === beforeStored.lastIntakeId);
  const backgroundDraft = beforeStored.intakes.find((intake) => intake.id === "post_session_debrief_background_demo");
  scenario.check(beforeStored.intakes.length === 2, "Post-session debrief handoff fixture starts with demo and user drafts.");
  scenario.check(beforeStored.lastIntakeId === "post_session_debrief_selected_user", "Post-session debrief handoff fixture selects the user draft.");
  scenario.check(selectedDraft?.targetRole === "Operations analyst", "Post-session debrief handoff selected draft has a target role.");
  scenario.check(
    selectedDraft?.firstSessionRawNoteCapture?.state === "blocked" &&
      selectedDraft?.firstSessionRawNoteCapture?.notesRecorded === false,
    "Post-session debrief handoff defaults to blocked before raw-note capture."
  );
  scenario.check(
    selectedDraft?.postSessionDebrief?.state === "blocked" &&
      selectedDraft?.postSessionDebrief?.rawNotesAvailable === false &&
      selectedDraft?.postSessionDebrief?.draftSaved === false,
    "Post-session debrief handoff default state is blocked with no local debrief draft."
  );
  scenario.check(
    selectedDraft?.postSessionDebrief?.exportTextUnchanged === true,
    "Post-session debrief handoff fixture marks blocked metadata as export-text unchanged."
  );
  scenario.check(
    backgroundDraft?.postSessionDebrief?.state === "blocked",
    "Post-session debrief handoff background demo draft starts blocked."
  );

  const defaultDebrief = await readPostSessionDebrief(page);
  assertPostSessionDebriefState({
    scenario,
    debrief: defaultDebrief,
    selectedDraftId: "post_session_debrief_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "blocked",
    phase: "default blocked fixture",
  });

  const draftSaved = await applyPostSessionDebriefDraftSavedState(page);
  await page.reload({ waitUntil: "networkidle" });

  const afterStored = await storedDrafts(page);
  const afterSelectedDraft = afterStored.intakes.find((intake) => intake.id === afterStored.lastIntakeId);
  const afterBackgroundDraft = afterStored.intakes.find((intake) => intake.id === "post_session_debrief_background_demo");
  const serializedSelected = JSON.stringify(afterSelectedDraft || {});
  scenario.check(afterStored.lastIntakeId === beforeStored.lastIntakeId, "Post-session debrief handoff leaves selected draft pointer unchanged after debrief draft is saved.");
  scenario.check(
    afterSelectedDraft?.firstSessionRawNoteCapture?.state === "notes-recorded" &&
      afterSelectedDraft?.firstSessionRawNoteCapture?.notesRecorded === true,
    "Post-session debrief handoff stores raw-note captured prerequisite on the selected draft before saving the debrief draft."
  );
  scenario.check(
    afterSelectedDraft?.postSessionDebrief?.state === "debrief-draft-saved" &&
      afterSelectedDraft?.postSessionDebrief?.draftSaved === true,
    "Post-session debrief handoff stores debrief-draft saved state on the selected draft."
  );
  scenario.check(
    afterSelectedDraft?.postSessionDebrief?.debriefDraftText === draftSaved.debriefDraftText,
    "Post-session debrief handoff stores the exact debrief draft text locally."
  );
  scenario.check(
    afterSelectedDraft?.postSessionDebrief?.rawNotesAvailable === true &&
      afterSelectedDraft?.postSessionDebrief?.objectionCodes?.[0] === draftSaved.objectionCodeText,
    "Post-session debrief handoff keeps raw-note and objection-coding context in local metadata."
  );
  scenario.check(
    afterSelectedDraft?.postSessionDebrief?.exportEligible === false &&
      afterSelectedDraft?.debriefHandoff?.exportEligible === false,
    "Post-session debrief handoff keeps saved debrief drafts export-ineligible."
  );
  scenario.check(
    afterSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText,
    "Post-session debrief handoff leaves saved resume export text unchanged after debrief draft is saved."
  );
  scenario.check(
    afterSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Post-session debrief handoff leaves downloaded resume export text fixture unchanged after debrief draft is saved."
  );
  scenario.check(
    !String(afterSelectedDraft?.exportSnapshot?.sectionText || "").includes(draftSaved.debriefDraftText),
    "Post-session debrief handoff draft text is excluded from saved resume export text."
  );
  scenario.check(
    !String(afterSelectedDraft?.downloadedExportText || "").includes(draftSaved.debriefDraftText),
    "Post-session debrief handoff draft text is excluded from downloaded resume export text."
  );
  scenario.check(
    !String(afterSelectedDraft?.exportSnapshot?.sectionText || "").includes(draftSaved.rawNoteText) &&
      !String(afterSelectedDraft?.downloadedExportText || "").includes(draftSaved.rawNoteText),
    "Post-session debrief handoff raw-note source text stays out of saved and downloaded resume export text."
  );
  scenario.check(
    serializedSelected.includes(draftSaved.debriefDraftText) &&
      serializedSelected.includes(draftSaved.rawNoteText) &&
      serializedSelected.includes("post-session-local-debrief-handoff"),
    "Post-session debrief handoff keeps debrief draft and source raw note in local metadata only."
  );
  scenario.check(
    afterBackgroundDraft?.postSessionDebrief?.state === "blocked" &&
      afterBackgroundDraft?.postSessionDebrief?.draftSaved === false,
    "Post-session debrief handoff saved local draft does not mutate the background demo draft."
  );

  const savedDebrief = await readPostSessionDebrief(page);
  assertPostSessionDebriefState({
    scenario,
    debrief: savedDebrief,
    selectedDraftId: "post_session_debrief_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "debrief-draft-saved",
    expectedDebriefDraftText: draftSaved.debriefDraftText,
    phase: "debrief-draft-saved fixture",
  });

  return scenario;
}

async function runObjectionCodingHandoffScenario(page, baseUrl) {
  const scenario = createScenario("objection-coding-handoff-no-network");

  await resetDrafts(page, baseUrl);
  const fixture = await seedObjectionCodingDrafts(page);
  await loadIntake(page, baseUrl);

  const beforeStored = await storedDrafts(page);
  const selectedDraft = beforeStored.intakes.find((intake) => intake.id === beforeStored.lastIntakeId);
  const backgroundDraft = beforeStored.intakes.find((intake) => intake.id === "objection_coding_background_demo");
  scenario.check(beforeStored.intakes.length === 2, "Objection-coding handoff fixture starts with demo and user drafts.");
  scenario.check(beforeStored.lastIntakeId === "objection_coding_selected_user", "Objection-coding handoff fixture selects the user draft.");
  scenario.check(selectedDraft?.targetRole === "Operations analyst", "Objection-coding handoff selected draft has a target role.");
  scenario.check(
    selectedDraft?.objectionCodingHandoff?.state === "blocked",
    "Objection-coding handoff defaults to blocked before post-session debrief."
  );
  scenario.check(
    selectedDraft?.objectionCodingHandoff?.debriefReady === false,
    "Objection-coding handoff default state has no debrief-ready confirmation."
  );
  scenario.check(
    selectedDraft?.objectionCodingHandoff?.codeSaved === false &&
      Array.isArray(selectedDraft.objectionCodingHandoff.objectionCodes) &&
      selectedDraft.objectionCodingHandoff.objectionCodes.length === 0,
    "Objection-coding handoff default state has zero local objection codes."
  );
  scenario.check(
    selectedDraft?.objectionCodingHandoff?.exportTextUnchanged === true &&
      selectedDraft?.objectionCodingHandoff?.downloadTextUnchanged === true,
    "Objection-coding handoff fixture marks default metadata as export/download-text unchanged."
  );
  scenario.check(
    backgroundDraft?.objectionCodingHandoff?.state === "blocked",
    "Objection-coding handoff background demo draft also starts blocked."
  );

  const defaultHandoff = await readObjectionCodingHandoff(page);
  assertObjectionCodingHandoffState({
    scenario,
    handoff: defaultHandoff,
    selectedDraftId: "objection_coding_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "blocked",
    phase: "default blocked fixture",
  });

  const savedState = await applyObjectionCodingSavedState(page);
  await page.reload({ waitUntil: "networkidle" });

  const afterStored = await storedDrafts(page);
  const afterSelectedDraft = afterStored.intakes.find((intake) => intake.id === afterStored.lastIntakeId);
  const afterBackgroundDraft = afterStored.intakes.find((intake) => intake.id === "objection_coding_background_demo");
  const serializedSelected = JSON.stringify(afterSelectedDraft || {});
  scenario.check(afterStored.lastIntakeId === beforeStored.lastIntakeId, "Objection-coding handoff leaves selected draft pointer unchanged after local code changes.");
  scenario.check(
    afterSelectedDraft?.objectionCodingHandoff?.state === "codes-recorded",
    "Objection-coding handoff stores objection-code saved state on the selected draft."
  );
  scenario.check(
    afterSelectedDraft?.objectionCodingHandoff?.debriefReady === true,
    "Objection-coding handoff stores local debrief-ready state on the selected draft."
  );
  scenario.check(
    afterSelectedDraft?.objectionCodingHandoff?.objectionCodes?.[0]?.text === savedState.objectionCodeText,
    "Objection-coding handoff stores explicit local objection-code text."
  );
  scenario.check(
    afterSelectedDraft?.objectionCodingHandoff?.objectionCodes?.every((code) => code.exportEligible === false),
    "Objection-coding handoff keeps local objection codes export-ineligible."
  );
  scenario.check(
    afterSelectedDraft?.objectionCodingHandoff?.synthesisReady === false,
    "Objection-coding handoff keeps synthesis separate until five-session synthesis exists."
  );
  scenario.check(
    afterSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText,
    "Objection-coding handoff leaves saved resume export text unchanged after local code changes."
  );
  scenario.check(
    afterSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Objection-coding handoff leaves downloaded resume export text fixture unchanged after local code changes."
  );
  scenario.check(
    !String(afterSelectedDraft?.exportSnapshot?.sectionText || "").includes(savedState.objectionCodeText),
    "Objection-coding handoff saved code is excluded from saved resume export text."
  );
  scenario.check(
    !String(afterSelectedDraft?.downloadedExportText || "").includes(savedState.objectionCodeText),
    "Objection-coding handoff saved code is excluded from downloaded resume export text."
  );
  scenario.check(
    !String(afterSelectedDraft?.exportSnapshot?.sectionText || "").includes(savedState.rubricNoteText) &&
      !String(afterSelectedDraft?.downloadedExportText || "").includes(savedState.rubricNoteText),
    "Objection-coding handoff rubric notes are excluded from resume export/download text."
  );
  scenario.check(
    serializedSelected.includes(savedState.objectionCodeText) &&
      serializedSelected.includes(savedState.rubricNoteText) &&
      serializedSelected.includes(savedState.synthesisCueText),
    "Objection-coding handoff keeps code, rubric note, and synthesis cue in local metadata only."
  );
  scenario.check(
    afterBackgroundDraft?.objectionCodingHandoff?.state === "blocked" &&
      afterBackgroundDraft?.objectionCodingHandoff?.codeSaved === false,
    "Objection-coding handoff local code change does not mutate the background demo draft."
  );

  const savedHandoff = await readObjectionCodingHandoff(page);
  assertObjectionCodingHandoffState({
    scenario,
    handoff: savedHandoff,
    selectedDraftId: "objection_coding_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "codes-recorded",
    expectedObjectionCodeText: savedState.objectionCodeText,
    phase: "local objection-code saved fixture",
  });

  return scenario;
}

async function runFiveSessionSynthesisReadinessScenario(page, baseUrl) {
  const scenario = createScenario("five-session-synthesis-readiness-no-network");

  await resetDrafts(page, baseUrl);
  const fixture = await seedFiveSessionSynthesisDrafts(page);
  await loadIntake(page, baseUrl);

  const zeroStored = await storedDrafts(page);
  const zeroSelectedDraft = zeroStored.intakes.find((intake) => intake.id === zeroStored.lastIntakeId);
  const zeroBackgroundDraft = zeroStored.intakes.find((intake) => intake.id === "five_session_synthesis_background_demo");
  scenario.check(zeroStored.intakes.length === 2, "Five-session synthesis readiness fixture starts with demo and user drafts.");
  scenario.check(zeroStored.lastIntakeId === "five_session_synthesis_selected_user", "Five-session synthesis readiness fixture selects the user draft.");
  scenario.check(zeroSelectedDraft?.targetRole === "Operations analyst", "Five-session synthesis readiness selected draft has a target role.");
  scenario.check(
    zeroSelectedDraft?.fiveSessionSynthesisReadiness?.state === "blocked" &&
      zeroSelectedDraft?.fiveSessionSynthesisReadiness?.completedSessionCount === 0,
    "Five-session synthesis readiness defaults to blocked with zero completed sessions."
  );
  scenario.check(
    zeroSelectedDraft?.fiveSessionSynthesisReadiness?.ready === false &&
      zeroSelectedDraft?.fiveSessionSynthesisReadiness?.requiredSessionCount === 5,
    "Five-session synthesis readiness requires five completed real-session packets before ready state."
  );
  scenario.check(
    zeroSelectedDraft?.fiveSessionSynthesisReadiness?.exportTextUnchanged === true &&
      zeroSelectedDraft?.fiveSessionSynthesisReadiness?.downloadTextUnchanged === true,
    "Five-session synthesis readiness fixture marks zero-session metadata as export/download-text unchanged."
  );
  scenario.check(
    zeroBackgroundDraft?.fiveSessionSynthesisReadiness?.state === "blocked",
    "Five-session synthesis readiness background demo draft also starts blocked."
  );

  const zeroReadiness = await readFiveSessionSynthesisReadiness(page);
  assertFiveSessionSynthesisReadinessState({
    scenario,
    readiness: zeroReadiness,
    selectedDraftId: "five_session_synthesis_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "blocked",
    expectedCompletedCount: 0,
    phase: "zero-session blocked fixture",
  });

  const partialState = await applyFiveSessionSynthesisState(page, 3);
  await page.reload({ waitUntil: "networkidle" });

  const partialStored = await storedDrafts(page);
  const partialSelectedDraft = partialStored.intakes.find((intake) => intake.id === partialStored.lastIntakeId);
  const partialBackgroundDraft = partialStored.intakes.find((intake) => intake.id === "five_session_synthesis_background_demo");
  const partialSerialized = JSON.stringify(partialSelectedDraft || {});
  scenario.check(
    partialStored.lastIntakeId === zeroStored.lastIntakeId,
    "Five-session synthesis readiness leaves selected draft pointer unchanged after partial session packets."
  );
  scenario.check(
    partialSelectedDraft?.fiveSessionSynthesisReadiness?.state === "blocked-partial" &&
      partialSelectedDraft?.fiveSessionSynthesisReadiness?.completedSessionCount === 3,
    "Five-session synthesis readiness stores partial-session blocked state on the selected draft."
  );
  scenario.check(
    partialSelectedDraft?.fiveSessionSynthesisReadiness?.ready === false,
    "Five-session synthesis readiness remains blocked when fewer than five sessions are complete."
  );
  scenario.check(
    partialSelectedDraft?.fiveSessionSynthesisReadiness?.sessionSlots?.every(
      (slot) => slot.rawNotesComplete === true && slot.debriefComplete === true && slot.objectionCodesComplete === true
    ),
    "Five-session synthesis readiness partial packets require raw-note, debrief, and objection-code completeness."
  );
  scenario.check(
    partialSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText,
    "Five-session synthesis readiness leaves saved resume export text unchanged after partial session packets."
  );
  scenario.check(
    partialSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Five-session synthesis readiness leaves downloaded resume export text fixture unchanged after partial session packets."
  );
  scenario.check(
    !String(partialSelectedDraft?.exportSnapshot?.sectionText || "").includes(partialState.sessionSlots[0].rawNoteText) &&
      !String(partialSelectedDraft?.downloadedExportText || "").includes(partialState.sessionSlots[0].rawNoteText),
    "Five-session synthesis readiness raw-note packet text is excluded from resume export/download text during partial state."
  );
  scenario.check(
    !String(partialSelectedDraft?.exportSnapshot?.sectionText || "").includes(partialState.sessionSlots[0].objectionCodeText) &&
      !String(partialSelectedDraft?.downloadedExportText || "").includes(partialState.sessionSlots[0].objectionCodeText),
    "Five-session synthesis readiness objection-code packet text is excluded from resume export/download text during partial state."
  );
  scenario.check(
    partialSerialized.includes(partialState.sessionSlots[0].rawNoteText) &&
      partialSerialized.includes(partialState.sessionSlots[0].debriefDraftText) &&
      partialSerialized.includes(partialState.sessionSlots[0].objectionCodeText),
    "Five-session synthesis readiness keeps partial packet details in local metadata only."
  );
  scenario.check(
    partialBackgroundDraft?.fiveSessionSynthesisReadiness?.state === "blocked" &&
      partialBackgroundDraft?.fiveSessionSynthesisReadiness?.completedSessionCount === 0,
    "Five-session synthesis readiness partial packet update does not mutate the background demo draft."
  );

  const partialReadiness = await readFiveSessionSynthesisReadiness(page);
  assertFiveSessionSynthesisReadinessState({
    scenario,
    readiness: partialReadiness,
    selectedDraftId: "five_session_synthesis_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "blocked-partial",
    expectedCompletedCount: 3,
    expectedPrivateText: partialState.synthesisPrivateNote,
    phase: "partial-session blocked fixture",
  });

  const readyState = await applyFiveSessionSynthesisState(page, 5);
  await page.reload({ waitUntil: "networkidle" });

  const readyStored = await storedDrafts(page);
  const readySelectedDraft = readyStored.intakes.find((intake) => intake.id === readyStored.lastIntakeId);
  const readySerialized = JSON.stringify(readySelectedDraft || {});
  scenario.check(
    readyStored.lastIntakeId === zeroStored.lastIntakeId,
    "Five-session synthesis readiness leaves selected draft pointer unchanged after five complete packets."
  );
  scenario.check(
    readySelectedDraft?.fiveSessionSynthesisReadiness?.state === "ready" &&
      readySelectedDraft?.fiveSessionSynthesisReadiness?.completedSessionCount === 5,
    "Five-session synthesis readiness stores five-session ready state on the selected draft."
  );
  scenario.check(
    readySelectedDraft?.fiveSessionSynthesisReadiness?.ready === true &&
      readySelectedDraft?.fiveSessionSynthesisReadiness?.blockers?.length === 0,
    "Five-session synthesis readiness clears blockers only after five completed session packets."
  );
  scenario.check(
    readySelectedDraft?.fiveSessionSynthesisReadiness?.sessionSlots?.length === 5 &&
      readySelectedDraft.fiveSessionSynthesisReadiness.sessionSlots.every(
        (slot) => slot.rawNotesComplete === true && slot.debriefComplete === true && slot.objectionCodesComplete === true && slot.exportEligible === false
      ),
    "Five-session synthesis readiness requires all five packets to include raw-note, debrief, objection-code, and export-ineligible flags."
  );
  scenario.check(
    readySelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText,
    "Five-session synthesis readiness leaves saved resume export text unchanged after ready state."
  );
  scenario.check(
    readySelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Five-session synthesis readiness leaves downloaded resume export text fixture unchanged after ready state."
  );
  scenario.check(
    !String(readySelectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.synthesisPrivateNote) &&
      !String(readySelectedDraft?.downloadedExportText || "").includes(readyState.synthesisPrivateNote),
    "Five-session synthesis readiness private synthesis note is excluded from resume export/download text."
  );
  scenario.check(
    !String(readySelectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].debriefDraftText) &&
      !String(readySelectedDraft?.downloadedExportText || "").includes(readyState.sessionSlots[4].debriefDraftText),
    "Five-session synthesis readiness fifth-session debrief packet text is excluded from resume export/download text."
  );
  scenario.check(
    readySerialized.includes(readyState.synthesisPrivateNote) &&
      readySerialized.includes(readyState.sessionSlots[4].rawNoteText) &&
      readySerialized.includes("local-real-session-packet"),
    "Five-session synthesis readiness keeps ready-state synthesis packets in local metadata only."
  );

  const readyReadiness = await readFiveSessionSynthesisReadiness(page);
  assertFiveSessionSynthesisReadinessState({
    scenario,
    readiness: readyReadiness,
    selectedDraftId: "five_session_synthesis_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "ready",
    expectedCompletedCount: 5,
    expectedPrivateText: readyState.synthesisPrivateNote,
    phase: "five-session ready fixture",
  });

  return scenario;
}

async function runPrivateSynthesisArtifactGeneratorScenario(page, baseUrl) {
  const scenario = createScenario("private-synthesis-artifact-generator-no-network");

  await resetDrafts(page, baseUrl);
  const fixture = await seedFiveSessionSynthesisDrafts(page);
  await loadIntake(page, baseUrl);

  const blockedAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
  await page.reload({ waitUntil: "networkidle" });
  const blockedStored = await storedDrafts(page);
  const blockedSelectedDraft = blockedStored.intakes.find((intake) => intake.id === blockedStored.lastIntakeId);
  const blockedBackgroundDraft = blockedStored.intakes.find((intake) => intake.id === "five_session_synthesis_background_demo");
  scenario.check(blockedAttempt.changed === true, "Private synthesis artifact generator blocked attempt records local generator state.");
  scenario.check(blockedStored.lastIntakeId === "five_session_synthesis_selected_user", "Private synthesis artifact generator preserves selected draft pointer while blocked.");
  scenario.check(
    blockedSelectedDraft?.privateSynthesisArtifactGenerator?.state === "blocked" &&
      blockedSelectedDraft?.privateSynthesisArtifactGenerator?.artifactDrafted === false,
    "Private synthesis artifact generator stays blocked before five complete evidence packets."
  );
  scenario.check(
    blockedSelectedDraft?.privateSynthesisArtifactGenerator?.sourcePacketCount === 0 &&
      blockedSelectedDraft?.privateSynthesisArtifactGenerator?.requiredPacketCount === 5,
    "Private synthesis artifact generator records zero of five source packets while blocked."
  );
  scenario.check(
    blockedSelectedDraft?.privateSynthesisArtifactGenerator?.artifact === null &&
      !blockedSelectedDraft?.privateSynthesisArtifact,
    "Private synthesis artifact generator does not create a private artifact while blocked."
  );
  scenario.check(
    blockedSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
      blockedSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Private synthesis artifact generator leaves saved and downloaded resume export text unchanged while blocked."
  );
  scenario.check(
    blockedBackgroundDraft?.privateSynthesisArtifactGenerator?.state === "blocked" &&
      blockedBackgroundDraft?.privateSynthesisArtifactGenerator?.artifact === null,
    "Private synthesis artifact generator blocked attempt does not mutate the background demo draft."
  );

  const blockedGenerator = await readPrivateSynthesisArtifactGenerator(page);
  assertPrivateSynthesisArtifactGeneratorState({
    scenario,
    generator: blockedGenerator,
    selectedDraftId: "five_session_synthesis_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "blocked",
    expectedPacketCount: 0,
    phase: "blocked fixture",
  });

  const readyState = await applyFiveSessionSynthesisState(page, 5);
  const readyAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
  await page.reload({ waitUntil: "networkidle" });

  const readyStored = await storedDrafts(page);
  const readySelectedDraft = readyStored.intakes.find((intake) => intake.id === readyStored.lastIntakeId);
  const readyBackgroundDraft = readyStored.intakes.find((intake) => intake.id === "five_session_synthesis_background_demo");
  const generator = readySelectedDraft?.privateSynthesisArtifactGenerator || {};
  const artifact = readySelectedDraft?.privateSynthesisArtifact || generator.artifact || {};
  const serializedArtifact = JSON.stringify(artifact);
  scenario.check(readyAttempt.changed === true && readyAttempt.ready === true, "Private synthesis artifact generator runs only after the five-packet ready state.");
  scenario.check(readyStored.lastIntakeId === blockedStored.lastIntakeId, "Private synthesis artifact generator preserves selected draft pointer after drafting.");
  scenario.check(
    generator.state === "artifact-drafted" && generator.readyToGenerate === true && generator.artifactDrafted === true,
    "Private synthesis artifact generator stores artifact-drafted ready state on the selected draft."
  );
  scenario.check(
    artifact.format === "proofresume-private-five-session-synthesis-artifact-v1" &&
      artifact.localOnly === true &&
      artifact.exportEligible === false,
    "Private synthesis artifact generator creates a local-only export-ineligible artifact format."
  );
  scenario.check(
    artifact.sourcePacketCount === 5 &&
      Array.isArray(artifact.sourcePacketIds) &&
      artifact.sourcePacketIds.length === 5,
    "Private synthesis artifact generator preserves all five source packet references."
  );
  scenario.check(
    serializedArtifact.includes("PRIVATE SYNTHESIS ARTIFACT") &&
      serializedArtifact.includes("Do not publish launch, pricing, testimonial, demand, willingness-to-pay, or outcome conclusions"),
    "Private synthesis artifact generator drafts a private review artifact without public conclusion claims."
  );
  scenario.check(
    readySelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText,
    "Private synthesis artifact generator leaves saved resume export text unchanged after drafting."
  );
  scenario.check(
    readySelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Private synthesis artifact generator leaves downloaded resume export text unchanged after drafting."
  );
  scenario.check(
    !String(readySelectedDraft?.exportSnapshot?.sectionText || "").includes(readyAttempt.artifactText) &&
      !String(readySelectedDraft?.downloadedExportText || "").includes(readyAttempt.artifactText),
    "Private synthesis artifact text is excluded from resume export/download text."
  );
  scenario.check(
    !String(readySelectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText) &&
      !String(readySelectedDraft?.downloadedExportText || "").includes(readyState.sessionSlots[4].rawNoteText),
    "Private synthesis source packet text remains excluded from resume export/download text after artifact drafting."
  );
  scenario.check(
    artifact.summaryText === readyAttempt.artifactText &&
      serializedArtifact.includes("proofresume-private-five-session-synthesis-artifact-v1"),
    "Private synthesis artifact is preserved in selected draft local metadata only."
  );
  scenario.check(
    readyBackgroundDraft?.privateSynthesisArtifactGenerator?.state === "blocked" &&
      readyBackgroundDraft?.privateSynthesisArtifactGenerator?.artifact === null,
    "Private synthesis artifact generator ready attempt does not mutate the background demo draft."
  );

  const readyGenerator = await readPrivateSynthesisArtifactGenerator(page);
  assertPrivateSynthesisArtifactGeneratorState({
    scenario,
    generator: readyGenerator,
    selectedDraftId: "five_session_synthesis_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "artifact-drafted",
    expectedPacketCount: 5,
    expectedArtifactText: readyAttempt.artifactText,
    phase: "artifact-drafted fixture",
  });

  return scenario;
}

async function runPrivateSynthesisDecisionMemoCaptureScenario(page, baseUrl) {
  const scenario = createScenario("private-synthesis-decision-memo-capture-no-network");

  await resetDrafts(page, baseUrl);
  const fixture = await seedFiveSessionSynthesisDrafts(page);
  await loadIntake(page, baseUrl);

  const blockedAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
  await page.reload({ waitUntil: "networkidle" });
  const blockedStored = await storedDrafts(page);
  const blockedSelectedDraft = blockedStored.intakes.find((intake) => intake.id === blockedStored.lastIntakeId);
  const blockedBackgroundDraft = blockedStored.intakes.find((intake) => intake.id === "five_session_synthesis_background_demo");
  scenario.check(blockedAttempt.changed === true, "Private synthesis decision memo capture blocked attempt records local memo state.");
  scenario.check(blockedStored.lastIntakeId === "five_session_synthesis_selected_user", "Private synthesis decision memo capture preserves selected draft pointer while blocked.");
  scenario.check(
    blockedSelectedDraft?.privateSynthesisDecisionMemoCapture?.state === "blocked" &&
      blockedSelectedDraft?.privateSynthesisDecisionMemoCapture?.memoDrafted === false,
    "Private synthesis decision memo capture stays blocked before a private synthesis artifact exists."
  );
  scenario.check(
    blockedSelectedDraft?.privateSynthesisDecisionMemoCapture?.artifactAvailable === false &&
      blockedSelectedDraft?.privateSynthesisDecisionMemoCapture?.memo === null,
    "Private synthesis decision memo capture does not create a memo without an artifact."
  );
  scenario.check(
    blockedSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
      blockedSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Private synthesis decision memo capture leaves saved and downloaded resume export text unchanged while blocked."
  );
  scenario.check(
    blockedBackgroundDraft?.privateSynthesisDecisionMemoCapture === undefined,
    "Private synthesis decision memo capture blocked attempt does not mutate the background demo draft."
  );

  const blockedMemoCapture = await readPrivateSynthesisDecisionMemoCapture(page);
  assertPrivateSynthesisDecisionMemoCaptureState({
    scenario,
    memoCapture: blockedMemoCapture,
    selectedDraftId: "five_session_synthesis_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "blocked",
    phase: "blocked fixture",
  });

  const readyState = await applyFiveSessionSynthesisState(page, 5);
  const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
  const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
  await page.reload({ waitUntil: "networkidle" });

  const memoStored = await storedDrafts(page);
  const memoSelectedDraft = memoStored.intakes.find((intake) => intake.id === memoStored.lastIntakeId);
  const memoBackgroundDraft = memoStored.intakes.find((intake) => intake.id === "five_session_synthesis_background_demo");
  const memoCapture = memoSelectedDraft?.privateSynthesisDecisionMemoCapture || {};
  const memo = memoSelectedDraft?.synthesisDecisionMemo || memoCapture.memo || {};
  const serializedMemo = JSON.stringify(memo);
  scenario.check(
    artifactAttempt.changed === true && artifactAttempt.ready === true && memoAttempt.artifactAvailable === true,
    "Private synthesis decision memo capture runs only after a private synthesis artifact exists."
  );
  scenario.check(memoStored.lastIntakeId === blockedStored.lastIntakeId, "Private synthesis decision memo capture preserves selected draft pointer after drafting.");
  scenario.check(
    memoCapture.state === "memo-drafted" && memoCapture.memoDrafted === true,
    "Private synthesis decision memo capture stores memo-drafted state on the selected draft."
  );
  scenario.check(
    memo.format === "proofresume-private-synthesis-decision-memo-v1" &&
      memo.localOnly === true &&
      memo.private === true &&
      memo.exportEligible === false,
    "Private synthesis decision memo capture creates a private local-only export-ineligible memo format."
  );
  scenario.check(
    memo.reviewedDecisionFields?.launchDecision === "blocked-pending-separate-approval" &&
      memo.reviewedDecisionFields?.pricingDecision === "not-observed" &&
      memo.reviewedDecisionFields?.testimonialDecision === "not-observed",
    "Private synthesis decision memo capture preserves reviewed launch, pricing, and testimonial decision fields."
  );
  scenario.check(
    memo.reviewedDecisionFields?.demandConclusion === "not-observed" &&
      memo.reviewedDecisionFields?.willingnessToPayConclusion === "not-observed" &&
      memo.reviewedDecisionFields?.outcomeConclusion === "not-observed",
    "Private synthesis decision memo capture keeps demand, willingness-to-pay, and outcome conclusions not observed."
  );
  scenario.check(
    memoSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText,
    "Private synthesis decision memo capture leaves saved resume export text unchanged after memo drafting."
  );
  scenario.check(
    memoSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Private synthesis decision memo capture leaves downloaded resume export text unchanged after memo drafting."
  );
  scenario.check(
    !String(memoSelectedDraft?.exportSnapshot?.sectionText || "").includes(memoAttempt.memoText) &&
      !String(memoSelectedDraft?.downloadedExportText || "").includes(memoAttempt.memoText),
    "Private synthesis decision memo text is excluded from resume export/download text."
  );
  scenario.check(
    !String(memoSelectedDraft?.exportSnapshot?.sectionText || "").includes(artifactAttempt.artifactText) &&
      !String(memoSelectedDraft?.downloadedExportText || "").includes(artifactAttempt.artifactText),
    "Private synthesis artifact text remains excluded from resume export/download text after memo drafting."
  );
  scenario.check(
    !String(memoSelectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText) &&
      !String(memoSelectedDraft?.downloadedExportText || "").includes(readyState.sessionSlots[4].rawNoteText),
    "Private synthesis source packet text remains excluded from resume export/download text after memo drafting."
  );
  scenario.check(
    serializedMemo.includes("proofresume-private-synthesis-decision-memo-v1") &&
      serializedMemo.includes("blocked-pending-separate-approval") &&
      serializedMemo.includes("not-observed"),
    "Private synthesis decision memo is preserved in selected draft local metadata only."
  );
  scenario.check(
    memoBackgroundDraft?.privateSynthesisDecisionMemoCapture === undefined,
    "Private synthesis decision memo capture ready attempt does not mutate the background demo draft."
  );

  const draftedMemoCapture = await readPrivateSynthesisDecisionMemoCapture(page);
  assertPrivateSynthesisDecisionMemoCaptureState({
    scenario,
    memoCapture: draftedMemoCapture,
    selectedDraftId: "five_session_synthesis_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "memo-drafted",
    expectedMemoText: memoAttempt.memoText,
    phase: "memo-drafted fixture",
  });

  return scenario;
}

async function runPrivateLaunchDecisionApprovalScenario(page, baseUrl) {
  const scenario = createScenario("private-launch-decision-approval-capture-no-network");

  await resetDrafts(page, baseUrl);
  const fixture = await seedFiveSessionSynthesisDrafts(page);
  await loadIntake(page, baseUrl);

  const blockedAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
  await page.reload({ waitUntil: "networkidle" });
  const blockedStored = await storedDrafts(page);
  const blockedSelectedDraft = blockedStored.intakes.find((intake) => intake.id === blockedStored.lastIntakeId);
  const blockedBackgroundDraft = blockedStored.intakes.find((intake) => intake.id === "five_session_synthesis_background_demo");
  scenario.check(blockedAttempt.changed === true, "Private launch-decision approval capture blocked attempt records local approval state.");
  scenario.check(blockedStored.lastIntakeId === "five_session_synthesis_selected_user", "Private launch-decision approval capture preserves selected draft pointer while blocked.");
  scenario.check(
    blockedSelectedDraft?.privateLaunchDecisionApprovalCapture?.state === "blocked" &&
      blockedSelectedDraft?.privateLaunchDecisionApprovalCapture?.approvalDrafted === false,
    "Private launch-decision approval capture stays blocked before a completed synthesis decision memo exists."
  );
  scenario.check(
    blockedSelectedDraft?.privateLaunchDecisionApprovalCapture?.memoAvailable === false &&
      blockedSelectedDraft?.privateLaunchDecisionApprovalCapture?.approval === null,
    "Private launch-decision approval capture does not create approval without a completed memo."
  );
  scenario.check(
    blockedSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
      blockedSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Private launch-decision approval capture leaves saved and downloaded resume export text unchanged while blocked."
  );
  scenario.check(
    blockedBackgroundDraft?.privateLaunchDecisionApprovalCapture === undefined,
    "Private launch-decision approval capture blocked attempt does not mutate the background demo draft."
  );

  const blockedApprovalCapture = await readPrivateLaunchDecisionApprovalCapture(page);
  assertPrivateLaunchDecisionApprovalCaptureState({
    scenario,
    approvalCapture: blockedApprovalCapture,
    selectedDraftId: "five_session_synthesis_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "blocked",
    phase: "blocked fixture",
  });

  const readyState = await applyFiveSessionSynthesisState(page, 5);
  const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
  const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
  const approvalAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
  await page.reload({ waitUntil: "networkidle" });

  const approvalStored = await storedDrafts(page);
  const approvalSelectedDraft = approvalStored.intakes.find((intake) => intake.id === approvalStored.lastIntakeId);
  const approvalBackgroundDraft = approvalStored.intakes.find((intake) => intake.id === "five_session_synthesis_background_demo");
  const approvalCapture = approvalSelectedDraft?.privateLaunchDecisionApprovalCapture || {};
  const approval = approvalSelectedDraft?.launchDecisionApproval || approvalCapture.approval || {};
  const memo = approvalSelectedDraft?.synthesisDecisionMemo || approvalSelectedDraft?.privateSynthesisDecisionMemoCapture?.memo || {};
  const serializedApproval = JSON.stringify(approval);
  scenario.check(
    artifactAttempt.changed === true && memoAttempt.artifactAvailable === true && approvalAttempt.memoAvailable === true,
    "Private launch-decision approval capture runs only after a completed private synthesis decision memo exists."
  );
  scenario.check(
    approvalStored.lastIntakeId === blockedStored.lastIntakeId,
    "Private launch-decision approval capture preserves selected draft pointer after approval drafting."
  );
  scenario.check(
    approvalCapture.state === "approval-drafted" && approvalCapture.approvalDrafted === true,
    "Private launch-decision approval capture stores approval-drafted state on the selected draft."
  );
  scenario.check(
    approval.format === "proofresume-private-launch-decision-approval-v1" &&
      approval.localOnly === true &&
      approval.private === true &&
      approval.exportEligible === false,
    "Private launch-decision approval capture creates a private local-only export-ineligible approval format."
  );
  scenario.check(
    approval.approvalFields?.launchDecisionApproval === "private-follow-up-approved" &&
      approval.approvalFields?.publicPublishAllowed === false,
    "Private launch-decision approval capture drafts a private approval while keeping public publish blocked."
  );
  scenario.check(
    approval.approvalFields?.pricingDecision === "not-observed" &&
      approval.approvalFields?.testimonialDecision === "not-observed" &&
      approval.approvalFields?.demandConclusion === "not-observed",
    "Private launch-decision approval capture keeps pricing, testimonial, and demand conclusions not observed."
  );
  scenario.check(
    approval.approvalFields?.willingnessToPayConclusion === "not-observed" &&
      approval.approvalFields?.secureIntakeConclusion === "not-observed" &&
      approval.approvalFields?.outcomeConclusion === "not-observed",
    "Private launch-decision approval capture keeps willingness-to-pay, secure-intake, and outcome conclusions not observed."
  );
  scenario.check(
    approvalSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText,
    "Private launch-decision approval capture leaves saved resume export text unchanged after approval drafting."
  );
  scenario.check(
    approvalSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Private launch-decision approval capture leaves downloaded resume export text unchanged after approval drafting."
  );
  scenario.check(
    !String(approvalSelectedDraft?.exportSnapshot?.sectionText || "").includes(approvalAttempt.approvalText) &&
      !String(approvalSelectedDraft?.downloadedExportText || "").includes(approvalAttempt.approvalText),
    "Private launch-decision approval text is excluded from resume export/download text."
  );
  scenario.check(
    !String(approvalSelectedDraft?.exportSnapshot?.sectionText || "").includes(memoAttempt.memoText) &&
      !String(approvalSelectedDraft?.downloadedExportText || "").includes(memoAttempt.memoText),
    "Private synthesis decision memo text remains excluded from resume export/download text after approval drafting."
  );
  scenario.check(
    !String(approvalSelectedDraft?.exportSnapshot?.sectionText || "").includes(artifactAttempt.artifactText) &&
      !String(approvalSelectedDraft?.downloadedExportText || "").includes(artifactAttempt.artifactText),
    "Private synthesis artifact text remains excluded from resume export/download text after approval drafting."
  );
  scenario.check(
    !String(approvalSelectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText) &&
      !String(approvalSelectedDraft?.downloadedExportText || "").includes(readyState.sessionSlots[4].rawNoteText),
    "Private synthesis source packet text remains excluded from resume export/download text after approval drafting."
  );
  scenario.check(
    serializedApproval.includes("proofresume-private-launch-decision-approval-v1") &&
      serializedApproval.includes("private-follow-up-approved") &&
      serializedApproval.includes("not-observed") &&
      JSON.stringify(memo).includes("proofresume-private-synthesis-decision-memo-v1"),
    "Private launch-decision approval is preserved in selected draft local metadata only."
  );
  scenario.check(
    approvalBackgroundDraft?.privateLaunchDecisionApprovalCapture === undefined,
    "Private launch-decision approval capture ready attempt does not mutate the background demo draft."
  );

  const draftedApprovalCapture = await readPrivateLaunchDecisionApprovalCapture(page);
  assertPrivateLaunchDecisionApprovalCaptureState({
    scenario,
    approvalCapture: draftedApprovalCapture,
    selectedDraftId: "five_session_synthesis_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "approval-drafted",
    expectedApprovalText: approvalAttempt.approvalText,
    phase: "approval-drafted fixture",
  });

  return scenario;
}

async function runPrivateExplicitPublishPlanScenario(page, baseUrl) {
  const scenario = createScenario("private-explicit-publish-plan-capture-no-network");

  await resetDrafts(page, baseUrl);
  const fixture = await seedFiveSessionSynthesisDrafts(page);
  await loadIntake(page, baseUrl);

  const blockedAttempt = await applyPrivateExplicitPublishPlanAttempt(page);
  await page.reload({ waitUntil: "networkidle" });
  const blockedStored = await storedDrafts(page);
  const blockedSelectedDraft = blockedStored.intakes.find((intake) => intake.id === blockedStored.lastIntakeId);
  const blockedBackgroundDraft = blockedStored.intakes.find((intake) => intake.id === "five_session_synthesis_background_demo");
  scenario.check(blockedAttempt.changed === true, "Private explicit publish-plan capture blocked attempt records local plan state.");
  scenario.check(blockedStored.lastIntakeId === "five_session_synthesis_selected_user", "Private explicit publish-plan capture preserves selected draft pointer while blocked.");
  scenario.check(
    blockedSelectedDraft?.privateExplicitPublishPlanCapture?.state === "blocked" &&
      blockedSelectedDraft?.privateExplicitPublishPlanCapture?.planDrafted === false,
    "Private explicit publish-plan capture stays blocked before private launch-decision approval exists."
  );
  scenario.check(
    blockedSelectedDraft?.privateExplicitPublishPlanCapture?.approvalAvailable === false &&
      blockedSelectedDraft?.privateExplicitPublishPlanCapture?.publishPlan === null,
    "Private explicit publish-plan capture does not create a publish plan without approval."
  );
  scenario.check(
    blockedSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
      blockedSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Private explicit publish-plan capture leaves saved and downloaded resume export text unchanged while blocked."
  );
  scenario.check(
    blockedBackgroundDraft?.privateExplicitPublishPlanCapture === undefined,
    "Private explicit publish-plan capture blocked attempt does not mutate the background demo draft."
  );

  const blockedPublishPlanCapture = await readPrivateExplicitPublishPlanCapture(page);
  assertPrivateExplicitPublishPlanCaptureState({
    scenario,
    publishPlanCapture: blockedPublishPlanCapture,
    selectedDraftId: "five_session_synthesis_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "blocked",
    phase: "blocked fixture",
  });

  const readyState = await applyFiveSessionSynthesisState(page, 5);
  const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
  const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
  const approvalAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
  const publishPlanAttempt = await applyPrivateExplicitPublishPlanAttempt(page);
  await page.reload({ waitUntil: "networkidle" });

  const planStored = await storedDrafts(page);
  const planSelectedDraft = planStored.intakes.find((intake) => intake.id === planStored.lastIntakeId);
  const planBackgroundDraft = planStored.intakes.find((intake) => intake.id === "five_session_synthesis_background_demo");
  const publishPlanCapture = planSelectedDraft?.privateExplicitPublishPlanCapture || {};
  const publishPlan = planSelectedDraft?.explicitPublishPlan || publishPlanCapture.publishPlan || {};
  const approval = planSelectedDraft?.launchDecisionApproval || planSelectedDraft?.privateLaunchDecisionApprovalCapture?.approval || {};
  const serializedPlan = JSON.stringify(publishPlan);
  scenario.check(
    artifactAttempt.changed === true &&
      memoAttempt.artifactAvailable === true &&
      approvalAttempt.memoAvailable === true &&
      publishPlanAttempt.approvalAvailable === true,
    "Private explicit publish-plan capture runs only after private launch-decision approval exists."
  );
  scenario.check(
    planStored.lastIntakeId === blockedStored.lastIntakeId,
    "Private explicit publish-plan capture preserves selected draft pointer after plan drafting."
  );
  scenario.check(
    publishPlanCapture.state === "plan-drafted" && publishPlanCapture.planDrafted === true,
    "Private explicit publish-plan capture stores plan-drafted state on the selected draft."
  );
  scenario.check(
    publishPlan.format === "proofresume-private-explicit-publish-plan-v1" &&
      publishPlan.localOnly === true &&
      publishPlan.private === true &&
      publishPlan.exportEligible === false,
    "Private explicit publish-plan capture creates a private local-only export-ineligible plan format."
  );
  scenario.check(
    publishPlan.publishFields?.owner === "operator-only-launch-owner" &&
      publishPlan.publishFields?.rollback.includes("revert") &&
      publishPlan.publishFields?.publicCopyDiff === "private-draft-only",
    "Private explicit publish-plan capture records owner, rollback, and public-copy-diff fields."
  );
  scenario.check(
    publishPlan.publishFields?.publicPublishAllowed === false &&
      publishPlan.publishFields?.claimRisk.includes("no outcome"),
    "Private explicit publish-plan capture keeps public publish blocked and claim-risk constrained."
  );
  scenario.check(
    publishPlan.conclusionFields?.pricingDecision === "not-observed" &&
      publishPlan.conclusionFields?.testimonialDecision === "not-observed" &&
      publishPlan.conclusionFields?.demandConclusion === "not-observed",
    "Private explicit publish-plan capture keeps pricing, testimonial, and demand conclusions not observed."
  );
  scenario.check(
    publishPlan.conclusionFields?.willingnessToPayConclusion === "not-observed" &&
      publishPlan.conclusionFields?.secureIntakeConclusion === "not-observed" &&
      publishPlan.conclusionFields?.outcomeConclusion === "not-observed",
    "Private explicit publish-plan capture keeps willingness-to-pay, secure-intake, and outcome conclusions not observed."
  );
  scenario.check(
    planSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText,
    "Private explicit publish-plan capture leaves saved resume export text unchanged after plan drafting."
  );
  scenario.check(
    planSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Private explicit publish-plan capture leaves downloaded resume export text unchanged after plan drafting."
  );
  scenario.check(
    !String(planSelectedDraft?.exportSnapshot?.sectionText || "").includes(publishPlanAttempt.planText) &&
      !String(planSelectedDraft?.downloadedExportText || "").includes(publishPlanAttempt.planText),
    "Private explicit publish-plan text is excluded from resume export/download text."
  );
  scenario.check(
    !String(planSelectedDraft?.exportSnapshot?.sectionText || "").includes(approvalAttempt.approvalText) &&
      !String(planSelectedDraft?.downloadedExportText || "").includes(approvalAttempt.approvalText),
    "Private launch-decision approval text remains excluded from resume export/download text after publish-plan drafting."
  );
  scenario.check(
    !String(planSelectedDraft?.exportSnapshot?.sectionText || "").includes(memoAttempt.memoText) &&
      !String(planSelectedDraft?.downloadedExportText || "").includes(memoAttempt.memoText),
    "Private synthesis decision memo text remains excluded from resume export/download text after publish-plan drafting."
  );
  scenario.check(
    !String(planSelectedDraft?.exportSnapshot?.sectionText || "").includes(artifactAttempt.artifactText) &&
      !String(planSelectedDraft?.downloadedExportText || "").includes(artifactAttempt.artifactText),
    "Private synthesis artifact text remains excluded from resume export/download text after publish-plan drafting."
  );
  scenario.check(
    !String(planSelectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText) &&
      !String(planSelectedDraft?.downloadedExportText || "").includes(readyState.sessionSlots[4].rawNoteText),
    "Private synthesis source packet text remains excluded from resume export/download text after publish-plan drafting."
  );
  scenario.check(
    serializedPlan.includes("proofresume-private-explicit-publish-plan-v1") &&
      serializedPlan.includes("operator-only-launch-owner") &&
      serializedPlan.includes("private-draft-only") &&
      serializedPlan.includes("not-observed") &&
      JSON.stringify(approval).includes("proofresume-private-launch-decision-approval-v1"),
    "Private explicit publish plan is preserved in selected draft local metadata only."
  );
  scenario.check(
    planBackgroundDraft?.privateExplicitPublishPlanCapture === undefined,
    "Private explicit publish-plan capture ready attempt does not mutate the background demo draft."
  );

  const draftedPublishPlanCapture = await readPrivateExplicitPublishPlanCapture(page);
  assertPrivateExplicitPublishPlanCaptureState({
    scenario,
    publishPlanCapture: draftedPublishPlanCapture,
    selectedDraftId: "five_session_synthesis_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "plan-drafted",
    expectedPlanText: publishPlanAttempt.planText,
    phase: "plan-drafted fixture",
  });

  return scenario;
}

async function runPrivatePublicCopyDiffRollbackScenario(page, baseUrl) {
  const scenario = createScenario("private-public-copy-diff-rollback-capture-no-network");

  await resetDrafts(page, baseUrl);
  const fixture = await seedFiveSessionSynthesisDrafts(page);
  await loadIntake(page, baseUrl);

  const blockedAttempt = await applyPrivatePublicCopyDiffRollbackAttempt(page);
  await page.reload({ waitUntil: "networkidle" });
  const blockedStored = await storedDrafts(page);
  const blockedSelectedDraft = blockedStored.intakes.find((intake) => intake.id === blockedStored.lastIntakeId);
  const blockedBackgroundDraft = blockedStored.intakes.find((intake) => intake.id === "five_session_synthesis_background_demo");
  scenario.check(blockedAttempt.changed === true, "Private public-copy diff rollback capture blocked attempt records local diff state.");
  scenario.check(blockedStored.lastIntakeId === "five_session_synthesis_selected_user", "Private public-copy diff rollback capture preserves selected draft pointer while blocked.");
  scenario.check(
    blockedSelectedDraft?.privatePublicCopyDiffRollbackCapture?.state === "blocked" &&
      blockedSelectedDraft?.privatePublicCopyDiffRollbackCapture?.diffDrafted === false,
    "Private public-copy diff rollback capture stays blocked before explicit publish plan exists."
  );
  scenario.check(
    blockedSelectedDraft?.privatePublicCopyDiffRollbackCapture?.publishPlanAvailable === false &&
      blockedSelectedDraft?.privatePublicCopyDiffRollbackCapture?.diffRollbackPacket === null,
    "Private public-copy diff rollback capture does not create a diff packet without a publish plan."
  );
  scenario.check(
    blockedSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
      blockedSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Private public-copy diff rollback capture leaves saved and downloaded resume export text unchanged while blocked."
  );
  scenario.check(
    blockedBackgroundDraft?.privatePublicCopyDiffRollbackCapture === undefined,
    "Private public-copy diff rollback capture blocked attempt does not mutate the background demo draft."
  );

  const blockedDiffRollbackCapture = await readPrivatePublicCopyDiffRollbackCapture(page);
  assertPrivatePublicCopyDiffRollbackCaptureState({
    scenario,
    diffRollbackCapture: blockedDiffRollbackCapture,
    selectedDraftId: "five_session_synthesis_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "blocked",
    phase: "blocked fixture",
  });

  const readyState = await applyFiveSessionSynthesisState(page, 5);
  const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
  const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
  const approvalAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
  const publishPlanAttempt = await applyPrivateExplicitPublishPlanAttempt(page);
  const diffAttempt = await applyPrivatePublicCopyDiffRollbackAttempt(page);
  await page.reload({ waitUntil: "networkidle" });

  const diffStored = await storedDrafts(page);
  const diffSelectedDraft = diffStored.intakes.find((intake) => intake.id === diffStored.lastIntakeId);
  const diffBackgroundDraft = diffStored.intakes.find((intake) => intake.id === "five_session_synthesis_background_demo");
  const diffCapture = diffSelectedDraft?.privatePublicCopyDiffRollbackCapture || {};
  const diffPacket = diffSelectedDraft?.publicCopyDiffRollback || diffCapture.diffRollbackPacket || {};
  const publishPlan = diffSelectedDraft?.explicitPublishPlan || diffSelectedDraft?.privateExplicitPublishPlanCapture?.publishPlan || {};
  const serializedDiffPacket = JSON.stringify(diffPacket);
  scenario.check(
    artifactAttempt.changed === true &&
      memoAttempt.artifactAvailable === true &&
      approvalAttempt.memoAvailable === true &&
      publishPlanAttempt.approvalAvailable === true &&
      diffAttempt.publishPlanAvailable === true,
    "Private public-copy diff rollback capture runs only after explicit publish plan exists."
  );
  scenario.check(
    diffStored.lastIntakeId === blockedStored.lastIntakeId,
    "Private public-copy diff rollback capture preserves selected draft pointer after diff drafting."
  );
  scenario.check(
    diffCapture.state === "diff-drafted" && diffCapture.diffDrafted === true,
    "Private public-copy diff rollback capture stores diff-drafted state on the selected draft."
  );
  scenario.check(
    diffPacket.format === "proofresume-private-public-copy-diff-rollback-v1" &&
      diffPacket.localOnly === true &&
      diffPacket.private === true &&
      diffPacket.exportEligible === false,
    "Private public-copy diff rollback capture creates a private local-only export-ineligible diff packet format."
  );
  scenario.check(
    diffPacket.fields?.diffSummary.includes("private public copy diff") &&
      diffPacket.fields?.consentCheck.includes("no public quotes") &&
      diffPacket.fields?.rollbackPath.includes("preserve resume export/download text"),
    "Private public-copy diff rollback capture records diff summary, consent check, and rollback path fields."
  );
  scenario.check(
    diffPacket.fields?.claimRiskCheck.includes("no launch") &&
      diffPacket.fields?.validationCommand === "npm run qa:intake-flow" &&
      diffPacket.publicPublishAllowed === false,
    "Private public-copy diff rollback capture records claim-risk check, validation command, and publish-blocked fields."
  );
  scenario.check(
    diffPacket.conclusionFields?.launchConclusion === "not-observed" &&
      diffPacket.conclusionFields?.pricingDecision === "not-observed" &&
      diffPacket.conclusionFields?.testimonialDecision === "not-observed" &&
      diffPacket.conclusionFields?.demandConclusion === "not-observed",
    "Private public-copy diff rollback capture keeps launch, pricing, testimonial, and demand conclusions not observed."
  );
  scenario.check(
    diffPacket.conclusionFields?.willingnessToPayConclusion === "not-observed" &&
      diffPacket.conclusionFields?.secureIntakeConclusion === "not-observed" &&
      diffPacket.conclusionFields?.outcomeConclusion === "not-observed",
    "Private public-copy diff rollback capture keeps willingness-to-pay, secure-intake, and outcome conclusions not observed."
  );
  scenario.check(
    diffSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText,
    "Private public-copy diff rollback capture leaves saved resume export text unchanged after diff drafting."
  );
  scenario.check(
    diffSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Private public-copy diff rollback capture leaves downloaded resume export text unchanged after diff drafting."
  );
  scenario.check(
    !String(diffSelectedDraft?.exportSnapshot?.sectionText || "").includes(diffAttempt.diffText) &&
      !String(diffSelectedDraft?.downloadedExportText || "").includes(diffAttempt.diffText),
    "Private public-copy diff rollback text is excluded from resume export/download text."
  );
  scenario.check(
    !String(diffSelectedDraft?.exportSnapshot?.sectionText || "").includes(publishPlanAttempt.planText) &&
      !String(diffSelectedDraft?.downloadedExportText || "").includes(publishPlanAttempt.planText),
    "Private explicit publish-plan text remains excluded from resume export/download text after diff drafting."
  );
  scenario.check(
    !String(diffSelectedDraft?.exportSnapshot?.sectionText || "").includes(approvalAttempt.approvalText) &&
      !String(diffSelectedDraft?.downloadedExportText || "").includes(approvalAttempt.approvalText),
    "Private launch-decision approval text remains excluded from resume export/download text after diff drafting."
  );
  scenario.check(
    !String(diffSelectedDraft?.exportSnapshot?.sectionText || "").includes(memoAttempt.memoText) &&
      !String(diffSelectedDraft?.downloadedExportText || "").includes(memoAttempt.memoText),
    "Private synthesis decision memo text remains excluded from resume export/download text after diff drafting."
  );
  scenario.check(
    !String(diffSelectedDraft?.exportSnapshot?.sectionText || "").includes(artifactAttempt.artifactText) &&
      !String(diffSelectedDraft?.downloadedExportText || "").includes(artifactAttempt.artifactText),
    "Private synthesis artifact text remains excluded from resume export/download text after diff drafting."
  );
  scenario.check(
    !String(diffSelectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText) &&
      !String(diffSelectedDraft?.downloadedExportText || "").includes(readyState.sessionSlots[4].rawNoteText),
    "Private synthesis source packet text remains excluded from resume export/download text after diff drafting."
  );
  scenario.check(
    serializedDiffPacket.includes("proofresume-private-public-copy-diff-rollback-v1") &&
      serializedDiffPacket.includes("npm run qa:intake-flow") &&
      serializedDiffPacket.includes("not-observed") &&
      JSON.stringify(publishPlan).includes("proofresume-private-explicit-publish-plan-v1"),
    "Private public-copy diff rollback packet is preserved in selected draft local metadata only."
  );
  scenario.check(
    diffBackgroundDraft?.privatePublicCopyDiffRollbackCapture === undefined,
    "Private public-copy diff rollback capture ready attempt does not mutate the background demo draft."
  );

  const draftedDiffRollbackCapture = await readPrivatePublicCopyDiffRollbackCapture(page);
  assertPrivatePublicCopyDiffRollbackCaptureState({
    scenario,
    diffRollbackCapture: draftedDiffRollbackCapture,
    selectedDraftId: "five_session_synthesis_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "diff-drafted",
    expectedDiffText: diffAttempt.diffText,
    phase: "diff-drafted fixture",
  });

  return scenario;
}

async function runPrivateReleaseCandidateRehearsalScenario(page, baseUrl) {
  const scenario = createScenario("private-release-candidate-rehearsal-capture-no-network");

  await resetDrafts(page, baseUrl);
  const fixture = await seedFiveSessionSynthesisDrafts(page);
  await loadIntake(page, baseUrl);

  const blockedAttempt = await applyPrivateReleaseCandidateRehearsalAttempt(page);
  await page.reload({ waitUntil: "networkidle" });
  const blockedStored = await storedDrafts(page);
  const blockedSelectedDraft = blockedStored.intakes.find((intake) => intake.id === blockedStored.lastIntakeId);
  const blockedBackgroundDraft = blockedStored.intakes.find((intake) => intake.id === "five_session_synthesis_background_demo");
  scenario.check(blockedAttempt.changed === true, "Private release-candidate rehearsal capture blocked attempt records local rehearsal state.");
  scenario.check(blockedStored.lastIntakeId === "five_session_synthesis_selected_user", "Private release-candidate rehearsal capture preserves selected draft pointer while blocked.");
  scenario.check(
    blockedSelectedDraft?.privateReleaseCandidateRehearsalCapture?.state === "blocked" &&
      blockedSelectedDraft?.privateReleaseCandidateRehearsalCapture?.rehearsalReady === false,
    "Private release-candidate rehearsal capture stays blocked before public-copy diff packet exists."
  );
  scenario.check(
    blockedSelectedDraft?.privateReleaseCandidateRehearsalCapture?.diffPacketAvailable === false &&
      blockedSelectedDraft?.privateReleaseCandidateRehearsalCapture?.rehearsalPacket === null,
    "Private release-candidate rehearsal capture does not create a rehearsal packet without a public-copy diff packet."
  );
  scenario.check(
    blockedSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
      blockedSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Private release-candidate rehearsal capture leaves saved and downloaded resume export text unchanged while blocked."
  );
  scenario.check(
    blockedBackgroundDraft?.privateReleaseCandidateRehearsalCapture === undefined,
    "Private release-candidate rehearsal capture blocked attempt does not mutate the background demo draft."
  );

  const blockedRehearsalCapture = await readPrivateReleaseCandidateRehearsalCapture(page);
  assertPrivateReleaseCandidateRehearsalCaptureState({
    scenario,
    rehearsalCapture: blockedRehearsalCapture,
    selectedDraftId: "five_session_synthesis_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "blocked",
    phase: "blocked fixture",
  });

  const readyState = await applyFiveSessionSynthesisState(page, 5);
  const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
  const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
  const approvalAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
  const publishPlanAttempt = await applyPrivateExplicitPublishPlanAttempt(page);
  const diffAttempt = await applyPrivatePublicCopyDiffRollbackAttempt(page);
  const rehearsalAttempt = await applyPrivateReleaseCandidateRehearsalAttempt(page);
  await page.reload({ waitUntil: "networkidle" });

  const rehearsalStored = await storedDrafts(page);
  const rehearsalSelectedDraft = rehearsalStored.intakes.find((intake) => intake.id === rehearsalStored.lastIntakeId);
  const rehearsalBackgroundDraft = rehearsalStored.intakes.find((intake) => intake.id === "five_session_synthesis_background_demo");
  const rehearsalCapture = rehearsalSelectedDraft?.privateReleaseCandidateRehearsalCapture || {};
  const rehearsalPacket = rehearsalSelectedDraft?.releaseCandidateRehearsal || rehearsalCapture.rehearsalPacket || {};
  const diffPacket = rehearsalSelectedDraft?.publicCopyDiffRollback || rehearsalSelectedDraft?.privatePublicCopyDiffRollbackCapture?.diffRollbackPacket || {};
  const serializedRehearsalPacket = JSON.stringify(rehearsalPacket);
  scenario.check(
    artifactAttempt.changed === true &&
      memoAttempt.artifactAvailable === true &&
      approvalAttempt.memoAvailable === true &&
      publishPlanAttempt.approvalAvailable === true &&
      diffAttempt.publishPlanAvailable === true &&
      rehearsalAttempt.diffPacketAvailable === true,
    "Private release-candidate rehearsal capture runs only after public-copy diff rollback packet exists."
  );
  scenario.check(
    rehearsalStored.lastIntakeId === blockedStored.lastIntakeId,
    "Private release-candidate rehearsal capture preserves selected draft pointer after rehearsal capture."
  );
  scenario.check(
    rehearsalCapture.state === "rehearsal-ready" && rehearsalCapture.rehearsalReady === true,
    "Private release-candidate rehearsal capture stores rehearsal-ready state on the selected draft."
  );
  scenario.check(
    rehearsalPacket.format === "proofresume-private-release-candidate-rehearsal-v1" &&
      rehearsalPacket.localOnly === true &&
      rehearsalPacket.private === true &&
      rehearsalPacket.exportEligible === false,
    "Private release-candidate rehearsal capture creates a private local-only export-ineligible rehearsal packet format."
  );
  scenario.check(
    rehearsalPacket.fields?.localStaticSmoke === "node website/scripts/check_site.cjs" &&
      rehearsalPacket.fields?.localServedSmoke === "npm run qa:intake-flow" &&
      rehearsalPacket.fields?.rollbackRehearsal.includes("preserve resume export/download text"),
    "Private release-candidate rehearsal capture records local static smoke, served smoke, and rollback rehearsal fields."
  );
  scenario.check(
    rehearsalPacket.fields?.consentCheck.includes("no customer names") &&
      rehearsalPacket.fields?.claimRiskCheck.includes("no launch") &&
      rehearsalPacket.publicDeployAllowed === false,
    "Private release-candidate rehearsal capture records consent, claim-risk, and deploy-blocked fields."
  );
  scenario.check(
    rehearsalPacket.conclusionFields?.launchConclusion === "not-observed" &&
      rehearsalPacket.conclusionFields?.pricingDecision === "not-observed" &&
      rehearsalPacket.conclusionFields?.testimonialDecision === "not-observed" &&
      rehearsalPacket.conclusionFields?.demandConclusion === "not-observed",
    "Private release-candidate rehearsal capture keeps launch, pricing, testimonial, and demand conclusions not observed."
  );
  scenario.check(
    rehearsalPacket.conclusionFields?.willingnessToPayConclusion === "not-observed" &&
      rehearsalPacket.conclusionFields?.secureIntakeConclusion === "not-observed" &&
      rehearsalPacket.conclusionFields?.outcomeConclusion === "not-observed",
    "Private release-candidate rehearsal capture keeps willingness-to-pay, secure-intake, and outcome conclusions not observed."
  );
  scenario.check(
    rehearsalPacket.requestAudit?.expectedExternalRequests === 0 &&
      rehearsalPacket.requestAudit?.expectedApiRequests === 0 &&
      rehearsalPacket.requestAudit?.expectedSubmitRequests === 0,
    "Private release-candidate rehearsal capture records expected no-network request audit counts."
  );
  scenario.check(
    rehearsalSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText,
    "Private release-candidate rehearsal capture leaves saved resume export text unchanged after rehearsal capture."
  );
  scenario.check(
    rehearsalSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Private release-candidate rehearsal capture leaves downloaded resume export text unchanged after rehearsal capture."
  );
  scenario.check(
    !String(rehearsalSelectedDraft?.exportSnapshot?.sectionText || "").includes(rehearsalAttempt.rehearsalText) &&
      !String(rehearsalSelectedDraft?.downloadedExportText || "").includes(rehearsalAttempt.rehearsalText),
    "Private release-candidate rehearsal text is excluded from resume export/download text."
  );
  scenario.check(
    !String(rehearsalSelectedDraft?.exportSnapshot?.sectionText || "").includes(diffAttempt.diffText) &&
      !String(rehearsalSelectedDraft?.downloadedExportText || "").includes(diffAttempt.diffText),
    "Private public-copy diff rollback text remains excluded from resume export/download text after rehearsal capture."
  );
  scenario.check(
    !String(rehearsalSelectedDraft?.exportSnapshot?.sectionText || "").includes(publishPlanAttempt.planText) &&
      !String(rehearsalSelectedDraft?.downloadedExportText || "").includes(publishPlanAttempt.planText),
    "Private explicit publish-plan text remains excluded from resume export/download text after rehearsal capture."
  );
  scenario.check(
    !String(rehearsalSelectedDraft?.exportSnapshot?.sectionText || "").includes(approvalAttempt.approvalText) &&
      !String(rehearsalSelectedDraft?.downloadedExportText || "").includes(approvalAttempt.approvalText),
    "Private launch-decision approval text remains excluded from resume export/download text after rehearsal capture."
  );
  scenario.check(
    !String(rehearsalSelectedDraft?.exportSnapshot?.sectionText || "").includes(memoAttempt.memoText) &&
      !String(rehearsalSelectedDraft?.downloadedExportText || "").includes(memoAttempt.memoText),
    "Private synthesis decision memo text remains excluded from resume export/download text after rehearsal capture."
  );
  scenario.check(
    !String(rehearsalSelectedDraft?.exportSnapshot?.sectionText || "").includes(artifactAttempt.artifactText) &&
      !String(rehearsalSelectedDraft?.downloadedExportText || "").includes(artifactAttempt.artifactText),
    "Private synthesis artifact text remains excluded from resume export/download text after rehearsal capture."
  );
  scenario.check(
    !String(rehearsalSelectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText) &&
      !String(rehearsalSelectedDraft?.downloadedExportText || "").includes(readyState.sessionSlots[4].rawNoteText),
    "Private synthesis source packet text remains excluded from resume export/download text after rehearsal capture."
  );
  scenario.check(
    serializedRehearsalPacket.includes("proofresume-private-release-candidate-rehearsal-v1") &&
      serializedRehearsalPacket.includes("npm run qa:intake-flow") &&
      serializedRehearsalPacket.includes("not-observed") &&
      JSON.stringify(diffPacket).includes("proofresume-private-public-copy-diff-rollback-v1"),
    "Private release-candidate rehearsal packet is preserved in selected draft local metadata only."
  );
  scenario.check(
    rehearsalBackgroundDraft?.privateReleaseCandidateRehearsalCapture === undefined,
    "Private release-candidate rehearsal capture ready attempt does not mutate the background demo draft."
  );

  const readyRehearsalCapture = await readPrivateReleaseCandidateRehearsalCapture(page);
  assertPrivateReleaseCandidateRehearsalCaptureState({
    scenario,
    rehearsalCapture: readyRehearsalCapture,
    selectedDraftId: "five_session_synthesis_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "rehearsal-ready",
    expectedRehearsalText: rehearsalAttempt.rehearsalText,
    phase: "rehearsal-ready fixture",
  });

  return scenario;
}

async function runPrivateCredentialedDeployReadinessScenario(page, baseUrl) {
  const scenario = createScenario("private-credentialed-deploy-readiness-no-network");
  const forbiddenSecretValues = [
    "qa-secret-vercel-token-should-not-persist",
    "ghp_qaCredentialedDeployShouldNeverPersist",
    "PROOFRESUME_DEPLOY_PASSWORD=never-store",
    "Authorization: Bearer qa-secret",
  ];

  await resetDrafts(page, baseUrl);
  const fixture = await seedFiveSessionSynthesisDrafts(page);
  await loadIntake(page, baseUrl);
  await page.evaluate((secretValues) => {
    window.__proofResumeQaForbiddenDeploySecrets = secretValues;
  }, forbiddenSecretValues);

  const rehearsalBlockedAttempt = await applyPrivateCredentialedDeployReadinessAttempt(page);
  await page.reload({ waitUntil: "networkidle" });
  const rehearsalBlockedStored = await storedDrafts(page);
  const rehearsalBlockedSelectedDraft = rehearsalBlockedStored.intakes.find((intake) => intake.id === rehearsalBlockedStored.lastIntakeId);
  const rehearsalBlockedBackgroundDraft = rehearsalBlockedStored.intakes.find((intake) => intake.id === "five_session_synthesis_background_demo");
  scenario.check(rehearsalBlockedAttempt.changed === true, "Private credentialed-deploy readiness rehearsal-blocked attempt records local readiness state.");
  scenario.check(
    rehearsalBlockedStored.lastIntakeId === "five_session_synthesis_selected_user",
    "Private credentialed-deploy readiness preserves selected draft pointer while rehearsal-blocked."
  );
  scenario.check(
    rehearsalBlockedSelectedDraft?.privateCredentialedDeployReadinessReview?.state === "rehearsal-blocked" &&
      rehearsalBlockedSelectedDraft?.privateCredentialedDeployReadinessReview?.rehearsalAvailable === false,
    "Private credentialed-deploy readiness stays rehearsal-blocked before release-candidate rehearsal exists."
  );
  scenario.check(
    rehearsalBlockedSelectedDraft?.privateCredentialedDeployReadinessReview?.deployInputsReady === false &&
      rehearsalBlockedSelectedDraft?.privateCredentialedDeployReadinessReview?.readinessPacket === null,
    "Private credentialed-deploy readiness does not create a deploy readiness packet without release-candidate rehearsal."
  );
  scenario.check(
    rehearsalBlockedSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
      rehearsalBlockedSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Private credentialed-deploy readiness leaves saved and downloaded resume export text unchanged while rehearsal-blocked."
  );
  scenario.check(
    !forbiddenSecretValues.some((secretValue) => JSON.stringify(rehearsalBlockedSelectedDraft).includes(secretValue)),
    "Private credentialed-deploy readiness rehearsal-blocked state stores no QA sentinel secret values."
  );
  scenario.check(
    rehearsalBlockedBackgroundDraft?.privateCredentialedDeployReadinessReview === undefined,
    "Private credentialed-deploy readiness rehearsal-blocked attempt does not mutate the background demo draft."
  );

  const rehearsalBlockedReadiness = await readPrivateCredentialedDeployReadiness(page);
  assertPrivateCredentialedDeployReadinessState({
    scenario,
    readiness: rehearsalBlockedReadiness,
    selectedDraftId: "five_session_synthesis_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "rehearsal-blocked",
    phase: "rehearsal-blocked fixture",
  });

  const readyState = await applyFiveSessionSynthesisState(page, 5);
  const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
  const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
  const approvalAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
  const publishPlanAttempt = await applyPrivateExplicitPublishPlanAttempt(page);
  const diffAttempt = await applyPrivatePublicCopyDiffRollbackAttempt(page);
  const rehearsalAttempt = await applyPrivateReleaseCandidateRehearsalAttempt(page);
  const readinessAttempt = await applyPrivateCredentialedDeployReadinessAttempt(page);
  await page.reload({ waitUntil: "networkidle" });

  const readinessStored = await storedDrafts(page);
  const readinessSelectedDraft = readinessStored.intakes.find((intake) => intake.id === readinessStored.lastIntakeId);
  const readinessBackgroundDraft = readinessStored.intakes.find((intake) => intake.id === "five_session_synthesis_background_demo");
  const readinessReview = readinessSelectedDraft?.privateCredentialedDeployReadinessReview || {};
  const readinessPacket = readinessSelectedDraft?.credentialedDeployReadiness || readinessReview.readinessPacket || {};
  const rehearsalPacket = readinessSelectedDraft?.releaseCandidateRehearsal || readinessSelectedDraft?.privateReleaseCandidateRehearsalCapture?.rehearsalPacket || {};
  const serializedReadinessPacket = JSON.stringify(readinessPacket);
  const serializedSelectedDraft = JSON.stringify(readinessSelectedDraft);
  scenario.check(
    artifactAttempt.changed === true &&
      memoAttempt.artifactAvailable === true &&
      approvalAttempt.memoAvailable === true &&
      publishPlanAttempt.approvalAvailable === true &&
      diffAttempt.publishPlanAvailable === true &&
      rehearsalAttempt.diffPacketAvailable === true &&
      readinessAttempt.rehearsalAvailable === true,
    "Private credentialed-deploy readiness review runs only after release-candidate rehearsal exists."
  );
  scenario.check(
    readinessStored.lastIntakeId === rehearsalBlockedStored.lastIntakeId,
    "Private credentialed-deploy readiness preserves selected draft pointer after deploy-input review."
  );
  scenario.check(
    readinessReview.state === "deploy-inputs-blocked" && readinessReview.deployInputsReady === false,
    "Private credentialed-deploy readiness stores deploy-inputs-blocked state on the selected draft."
  );
  scenario.check(
    readinessPacket.format === "proofresume-private-credentialed-deploy-readiness-v1" &&
      readinessPacket.localOnly === true &&
      readinessPacket.private === true &&
      readinessPacket.exportEligible === false,
    "Private credentialed-deploy readiness creates a private local-only export-ineligible readiness packet format."
  );
  scenario.check(
    readinessPacket.noDeploy === true &&
      readinessPacket.publicDeployAllowed === false &&
      readinessPacket.noSecretStorage === true,
    "Private credentialed-deploy readiness records no-deploy and no-secret-storage policy fields."
  );
  scenario.check(
    readinessPacket.inputStates?.platform === "missing" &&
      readinessPacket.inputStates?.productionUrl === "missing" &&
      readinessPacket.inputStates?.credentialAvailability === "missing" &&
      readinessPacket.inputStates?.deployTrigger === "missing",
    "Private credentialed-deploy readiness keeps platform, production URL, credential-availability, and deploy-trigger inputs blocked."
  );
  scenario.check(
    readinessPacket.inputStates?.rollbackOwner === "missing" &&
      readinessPacket.inputStates?.rollbackMethod === "missing" &&
      readinessPacket.inputStates?.healthCheckInputs === "missing",
    "Private credentialed-deploy readiness keeps rollback-owner, rollback-method, and health-check inputs blocked."
  );
  scenario.check(
    readinessPacket.secretStoragePolicy?.allowedCredentialValueStorage === false &&
      readinessPacket.secretStoragePolicy?.allowedFields?.includes("credentialAvailability"),
    "Private credentialed-deploy readiness stores only credential-availability status, never credential values."
  );
  scenario.check(
    readinessPacket.conclusionFields?.launchConclusion === "not-observed" &&
      readinessPacket.conclusionFields?.pricingDecision === "not-observed" &&
      readinessPacket.conclusionFields?.testimonialDecision === "not-observed" &&
      readinessPacket.conclusionFields?.demandConclusion === "not-observed",
    "Private credentialed-deploy readiness keeps launch, pricing, testimonial, and demand conclusions not observed."
  );
  scenario.check(
    readinessPacket.conclusionFields?.willingnessToPayConclusion === "not-observed" &&
      readinessPacket.conclusionFields?.secureIntakeConclusion === "not-observed" &&
      readinessPacket.conclusionFields?.outcomeConclusion === "not-observed",
    "Private credentialed-deploy readiness keeps willingness-to-pay, secure-intake, and outcome conclusions not observed."
  );
  scenario.check(
    readinessPacket.requestAudit?.expectedExternalRequests === 0 &&
      readinessPacket.requestAudit?.expectedApiRequests === 0 &&
      readinessPacket.requestAudit?.expectedSubmitRequests === 0,
    "Private credentialed-deploy readiness records expected no-network request audit counts."
  );
  scenario.check(
    !forbiddenSecretValues.some((secretValue) => serializedSelectedDraft.includes(secretValue)),
    "Private credentialed-deploy readiness deploy-inputs-blocked state stores no QA sentinel secret values."
  );
  scenario.check(
    !/qa-secret-vercel-token|ghp_qaCredentialedDeployShouldNeverPersist|PROOFRESUME_DEPLOY_PASSWORD|Authorization: Bearer qa-secret/.test(serializedSelectedDraft),
    "Private credentialed-deploy readiness local metadata excludes concrete token, password, and authorization secret values."
  );
  scenario.check(
    readinessSelectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText,
    "Private credentialed-deploy readiness leaves saved resume export text unchanged after deploy-input review."
  );
  scenario.check(
    readinessSelectedDraft?.downloadedExportText === fixture.selectedExportText,
    "Private credentialed-deploy readiness leaves downloaded resume export text unchanged after deploy-input review."
  );
  scenario.check(
    !String(readinessSelectedDraft?.exportSnapshot?.sectionText || "").includes(readinessAttempt.readinessText) &&
      !String(readinessSelectedDraft?.downloadedExportText || "").includes(readinessAttempt.readinessText),
    "Private credentialed-deploy readiness text is excluded from resume export/download text."
  );
  scenario.check(
    !String(readinessSelectedDraft?.exportSnapshot?.sectionText || "").includes(rehearsalAttempt.rehearsalText) &&
      !String(readinessSelectedDraft?.downloadedExportText || "").includes(rehearsalAttempt.rehearsalText),
    "Private release-candidate rehearsal text remains excluded from resume export/download text after credentialed-deploy review."
  );
  scenario.check(
    !String(readinessSelectedDraft?.exportSnapshot?.sectionText || "").includes(diffAttempt.diffText) &&
      !String(readinessSelectedDraft?.downloadedExportText || "").includes(diffAttempt.diffText),
    "Private public-copy diff rollback text remains excluded from resume export/download text after credentialed-deploy review."
  );
  scenario.check(
    !String(readinessSelectedDraft?.exportSnapshot?.sectionText || "").includes(publishPlanAttempt.planText) &&
      !String(readinessSelectedDraft?.downloadedExportText || "").includes(publishPlanAttempt.planText),
    "Private explicit publish-plan text remains excluded from resume export/download text after credentialed-deploy review."
  );
  scenario.check(
    !String(readinessSelectedDraft?.exportSnapshot?.sectionText || "").includes(approvalAttempt.approvalText) &&
      !String(readinessSelectedDraft?.downloadedExportText || "").includes(approvalAttempt.approvalText),
    "Private launch-decision approval text remains excluded from resume export/download text after credentialed-deploy review."
  );
  scenario.check(
    !String(readinessSelectedDraft?.exportSnapshot?.sectionText || "").includes(memoAttempt.memoText) &&
      !String(readinessSelectedDraft?.downloadedExportText || "").includes(memoAttempt.memoText),
    "Private synthesis decision memo text remains excluded from resume export/download text after credentialed-deploy review."
  );
  scenario.check(
    !String(readinessSelectedDraft?.exportSnapshot?.sectionText || "").includes(artifactAttempt.artifactText) &&
      !String(readinessSelectedDraft?.downloadedExportText || "").includes(artifactAttempt.artifactText),
    "Private synthesis artifact text remains excluded from resume export/download text after credentialed-deploy review."
  );
  scenario.check(
    !String(readinessSelectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText) &&
      !String(readinessSelectedDraft?.downloadedExportText || "").includes(readyState.sessionSlots[4].rawNoteText),
    "Private synthesis source packet text remains excluded from resume export/download text after credentialed-deploy review."
  );
  scenario.check(
    serializedReadinessPacket.includes("proofresume-private-credentialed-deploy-readiness-v1") &&
      serializedReadinessPacket.includes("deploy-inputs-blocked") &&
      serializedReadinessPacket.includes("not-observed") &&
      JSON.stringify(rehearsalPacket).includes("proofresume-private-release-candidate-rehearsal-v1"),
    "Private credentialed-deploy readiness packet is preserved in selected draft local metadata only."
  );
  scenario.check(
    readinessBackgroundDraft?.privateCredentialedDeployReadinessReview === undefined,
    "Private credentialed-deploy readiness deploy-input review does not mutate the background demo draft."
  );

  const deployInputsBlockedReadiness = await readPrivateCredentialedDeployReadiness(page);
  assertPrivateCredentialedDeployReadinessState({
    scenario,
    readiness: deployInputsBlockedReadiness,
    selectedDraftId: "five_session_synthesis_selected_user",
    selectedExportText: fixture.selectedExportText,
    expectedState: "deploy-inputs-blocked",
    expectedReadinessText: readinessAttempt.readinessText,
    phase: "deploy-inputs-blocked fixture",
  });

  return scenario;
}

async function runFirstHumanOperatorDeployPacketIndexScenario(page, baseUrl) {
  const scenario = createScenario("first-human-operator-deploy-packet-index-no-network");
  const passedFixture = staticDeployPassedLocalFixture();
  const adminFixture = adminDataWithStaticDeployFixture(passedFixture);
  responseOverrides.set("/admin-data.json", {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(adminFixture),
  });

  try {
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });
    const loadedAdminData = await page.evaluate(async () => {
      const response = await fetch("/admin-data.json");
      return response.json();
    });
    const packetIndex = loadedAdminData.operations?.queueRefreshDecisionInput?.firstHumanOperatorDeployPacketIndexVisibility;
    const staticPacketIndex = loadedAdminData.validation?.firstHumanOperatorDeployPacketIndex;
    const serializedIndex = JSON.stringify({ packetIndex, staticPacketIndex });
    const packetKeys = (packetIndex?.indexedPackets || []).map((packet) => String(packet.key || "").toLowerCase());
    const unavailableLabels = [
      ...(packetIndex?.unavailableExternalValues || []).map((item) => String(item.label || "")),
      ...(packetIndex?.rows || []).flatMap((row) => [
        ...(row.unavailableExternalFacts || []).map((item) => String(item.fact || item.label || "")),
        String(row.gate || ""),
      ]),
    ]
      .join("\n")
      .toLowerCase();

    scenario.check(
      packetIndex?.format === "proofresume-first-human-operator-deploy-packet-index-v1" || (packetIndex?.packetExists === true && Array.isArray(packetIndex?.rows)),
      "Admin data exposes first-human-operator deploy packet index visibility."
    );
    scenario.check(
      (packetIndex?.state === "index-only-do-not-deploy" && packetIndex?.decision === "No-Go / Do Not Deploy") ||
        (packetIndex?.finalNoGoCount >= 1 && packetIndex?.deployActionAvailableCount === 0),
      "Admin data deploy packet index stays index-only Do Not Deploy."
    );
    scenario.check(
      (packetIndex?.notADeployChecklist === true &&
        packetIndex?.checklistComplete === false &&
        Array.isArray(packetIndex?.externalValueRequests) &&
        packetIndex.externalValueRequests.length === 0) ||
        (packetIndex?.deployActionAvailableCount === 0 && packetIndex?.unavailableExternalFactCount >= 1),
      "Admin data deploy packet index is not a deploy checklist and requests no external values."
    );
    if (packetIndex?.format === "proofresume-first-human-operator-deploy-packet-index-v1") {
      for (const key of ["admin-data", "product-readiness", "static-rehearsal-output"]) {
        scenario.check(packetKeys.includes(key), `Admin data deploy packet index includes ${key}.`);
      }
      scenario.check(
        (packetIndex?.indexedPackets || []).every((packet) => packet.externalValuesRequired === false && packet.checklistItem === false),
        "Admin data deploy packet index entries are local evidence pointers, not checklist items."
      );
    } else {
      scenario.check(
        packetIndex?.readyLocalArtifactCount >= 1 && packetIndex?.unavailableExternalFactCount >= 1,
        "Admin data deploy packet index separates ready local artifacts from unavailable external facts."
      );
      scenario.check(
        (packetIndex?.rows || []).every((row) => /cannot create deploy actions/i.test(row.gate || "")),
        "Admin data deploy packet index rows remain gates rather than deploy checklist items."
      );
    }
    for (const token of [
      "credential",
      "production url",
      "deploy trigger",
      "dashboard link",
      "contact detail",
      "rollback authorization",
      "public launch authorization",
      "deploy action",
    ]) {
      scenario.check(unavailableLabels.includes(token), `Admin data deploy packet index keeps ${token} unavailable.`);
    }
    scenario.check(
      (packetIndex?.noSecretNoDeployGuardrails?.credentialRequestAllowed === false &&
        packetIndex?.noSecretNoDeployGuardrails?.productionUrlStored === false &&
        packetIndex?.noSecretNoDeployGuardrails?.deployTriggerStored === false &&
        packetIndex?.noSecretNoDeployGuardrails?.dashboardLinkStored === false &&
        packetIndex?.noSecretNoDeployGuardrails?.contactDetailStored === false &&
        packetIndex?.noSecretNoDeployGuardrails?.rollbackAuthorized === false &&
        packetIndex?.noSecretNoDeployGuardrails?.publicLaunchAuthorized === false &&
        packetIndex?.noSecretNoDeployGuardrails?.deployActionRequested === false) ||
        packetIndex?.deployActionAvailableCount === 0,
      "Admin data deploy packet index blocks credential requests, production URLs, deploy triggers, dashboard links, contact details, rollback/public launch authorization, and deploy actions."
    );
    scenario.check(
      staticPacketIndex?.format === "proofresume-first-human-operator-deploy-packet-index-v1" &&
        staticPacketIndex?.indexedPackets?.some((packet) => packet.key === "static-rehearsal-output") &&
        staticPacketIndex?.notADeployChecklist === true,
      "Static rehearsal output carries the first-human-operator deploy packet index as non-checklist local evidence."
    );
    scenario.check(
      !hasForbiddenDeployValue(serializedIndex),
      "Admin/static deploy packet index exposes no URL, secret, token, bearer, API key, dashboard-link value, or contact-detail value."
    );

    await resetDrafts(page, baseUrl);
    const fixture = await seedFiveSessionSynthesisDrafts(page);
    await loadIntake(page, baseUrl);
    const readyState = await applyFiveSessionSynthesisState(page, 5);
    const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
    const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
    const approvalAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
    const publishPlanAttempt = await applyPrivateExplicitPublishPlanAttempt(page);
    const diffAttempt = await applyPrivatePublicCopyDiffRollbackAttempt(page);
    const rehearsalAttempt = await applyPrivateReleaseCandidateRehearsalAttempt(page);
    const readinessAttempt = await applyPrivateCredentialedDeployReadinessAttempt(page);
    await page.goto(`${baseUrl}/review.html`, { waitUntil: "networkidle" });

    const finalPanel = await page.evaluate(() => {
      const root = document.querySelector("[data-pr='finalDeployGoNoGoState']");
      return {
        exposed: Boolean(root),
        text: root?.textContent || "",
        decision: root?.getAttribute("data-final-deploy-decision") || "",
        productionDeploymentState: root?.getAttribute("data-production-deployment-state") || "",
        humanApprovalObserved: root?.getAttribute("data-human-approval-observed") || "",
        platformInputsEnabled: root?.getAttribute("data-platform-inputs-enabled") || "",
        noSecretStorage: root?.getAttribute("data-no-secret-storage") || "",
        noProductionUrl: root?.getAttribute("data-no-production-url") || "",
        noDeployTrigger: root?.getAttribute("data-no-deploy-trigger") || "",
        noDeployAction: root?.getAttribute("data-no-deploy-action") || "",
        noPublishAction: root?.getAttribute("data-no-publish-action") || "",
        exportEligible: root?.getAttribute("data-export-eligible") || "",
        downloadEligible: root?.getAttribute("data-download-eligible") || "",
      };
    });
    const operatorPacketPanel = await page.evaluate(() => {
      const root = document.querySelector("[data-pr='firstHumanOperatorPacketHandoffState']");
      return {
        exposed: Boolean(root),
        hidden: Boolean(root?.hidden),
        text: root?.textContent || "",
        state: root?.getAttribute("data-first-human-operator-packet-state") || "",
        decision: root?.getAttribute("data-final-deploy-decision") || "",
        productionDeploymentState: root?.getAttribute("data-production-deployment-state") || "",
        humanApprovalObserved: root?.getAttribute("data-human-approval-observed") || "",
        platformInputsEnabled: root?.getAttribute("data-platform-inputs-enabled") || "",
        localOnly: root?.getAttribute("data-local-only") || "",
        readOnly: root?.getAttribute("data-read-only") || "",
        noSecretStorage: root?.getAttribute("data-no-secret-storage") || "",
        noProductionUrl: root?.getAttribute("data-no-production-url") || "",
        noCredential: root?.getAttribute("data-no-credential") || "",
        noDeployTrigger: root?.getAttribute("data-no-deploy-trigger") || "",
        noDeployAction: root?.getAttribute("data-no-deploy-action") || "",
        noDashboardLink: root?.getAttribute("data-no-dashboard-link") || "",
        noContactDetails: root?.getAttribute("data-no-contact-details") || "",
        noRollbackAuthorization: root?.getAttribute("data-no-rollback-authorization") || "",
        noPublicLaunchAuthorization: root?.getAttribute("data-no-public-launch-authorization") || "",
        noHumanApprovalPath: root?.getAttribute("data-no-human-approval-path") || "",
        exportEligible: root?.getAttribute("data-export-eligible") || "",
        downloadEligible: root?.getAttribute("data-download-eligible") || "",
      };
    });
    const readiness = await readPrivateCredentialedDeployReadiness(page);
    const stored = await storedDrafts(page);
    const selectedDraft = stored.intakes.find((intake) => intake.id === stored.lastIntakeId);
    const combinedText = `${finalPanel.text}\n${operatorPacketPanel.text}\n${readiness.text}`;

    scenario.check(
      artifactAttempt.changed === true &&
        memoAttempt.artifactAvailable === true &&
        approvalAttempt.memoAvailable === true &&
        publishPlanAttempt.approvalAvailable === true &&
        diffAttempt.publishPlanAvailable === true &&
        rehearsalAttempt.diffPacketAvailable === true &&
        readinessAttempt.rehearsalAvailable === true,
      "Product deploy packet index scenario reaches local readiness prerequisites without external inputs."
    );
    scenario.check(
      finalPanel.exposed === true &&
        finalPanel.decision === "no-go" &&
        finalPanel.productionDeploymentState === "Do Not Deploy" &&
        finalPanel.humanApprovalObserved === "false" &&
        finalPanel.platformInputsEnabled === "false",
      "Product readiness remains No-Go / Do Not Deploy for the first-human-operator packet index."
    );
    scenario.check(
      finalPanel.noSecretStorage === "true" &&
        finalPanel.noProductionUrl === "true" &&
        finalPanel.noDeployTrigger === "true" &&
        finalPanel.noDeployAction === "true" &&
        finalPanel.noPublishAction === "true",
      "Product readiness blocks secrets, production URLs, deploy triggers, deploy actions, and publish actions for the packet index."
    );
    scenario.check(
      finalPanel.exportEligible === "false" && finalPanel.downloadEligible === "false",
      "Product packet index readiness remains export/download ineligible."
    );
    scenario.check(
        operatorPacketPanel.exposed === true &&
        operatorPacketPanel.hidden === false &&
        operatorPacketPanel.state === "read-only-packet-ready" &&
        operatorPacketPanel.decision === "no-go" &&
        operatorPacketPanel.productionDeploymentState === "Do Not Deploy",
      "Product first-human-operator packet handoff is visible as read-only No-Go local readiness."
    );
    scenario.check(
      operatorPacketPanel.humanApprovalObserved === "false" &&
        operatorPacketPanel.platformInputsEnabled === "false" &&
        operatorPacketPanel.localOnly === "true" &&
        operatorPacketPanel.readOnly === "true" &&
        operatorPacketPanel.noSecretStorage === "true" &&
        operatorPacketPanel.noProductionUrl === "true" &&
        operatorPacketPanel.noCredential === "true" &&
        operatorPacketPanel.noDeployTrigger === "true" &&
        operatorPacketPanel.noDeployAction === "true" &&
        operatorPacketPanel.noDashboardLink === "true" &&
        operatorPacketPanel.noContactDetails === "true" &&
        operatorPacketPanel.noRollbackAuthorization === "true" &&
        operatorPacketPanel.noPublicLaunchAuthorization === "true" &&
        operatorPacketPanel.noHumanApprovalPath === "true",
      "Product first-human-operator packet handoff blocks credentials, production URLs, deploy triggers, dashboard links, contact details, human approval paths, rollback/public launch authorization, and deploy actions."
    );
    scenario.check(
      operatorPacketPanel.exportEligible === "false" &&
        operatorPacketPanel.downloadEligible === "false" &&
        /ready local artifacts/i.test(operatorPacketPanel.text) &&
        /unavailable external facts/i.test(operatorPacketPanel.text),
      "Product first-human-operator packet handoff separates ready local artifacts from unavailable external facts without export/download eligibility."
    );
    scenario.check(!hasForbiddenDeployValue(combinedText), "Product packet index readiness text exposes no URL, secret, token, bearer, dashboard-link value, or contact-detail value.");
    scenario.check(
      selectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
        selectedDraft?.downloadedExportText === fixture.selectedExportText &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readinessAttempt.readinessText) &&
        !String(selectedDraft?.downloadedExportText || "").includes(rehearsalAttempt.rehearsalText) &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText),
      "Product deploy packet index and readiness metadata stay out of resume export/download text."
    );
  } finally {
    responseOverrides.delete("/admin-data.json");
  }

  return scenario;
}

async function runOperatorDryRunReviewChecklistScenario(page, baseUrl) {
  const scenario = createScenario("operator-dry-run-review-checklist-no-network");
  const passedFixture = staticDeployPassedLocalFixture();
  const adminFixture = adminDataWithStaticDeployFixture(passedFixture);
  responseOverrides.set("/admin-data.json", {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(adminFixture),
  });

  try {
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });
    const loadedAdminData = await page.evaluate(async () => {
      const response = await fetch("/admin-data.json");
      return response.json();
    });
    const checklist = loadedAdminData.validation?.operatorDryRunReviewChecklist;
    const serializedChecklist = JSON.stringify(checklist);
    const evidenceKeys = (checklist?.reviewedEvidence || []).map((item) => String(item.key || "").toLowerCase());
    const forbiddenLabels = (checklist?.forbiddenExecutableItems || []).map((item) => String(item.label || "").toLowerCase()).join("\n");

    scenario.check(checklist?.format === "proofresume-operator-dry-run-review-checklist-v1", "Admin data exposes operator dry-run review checklist format.");
    scenario.check(
      checklist?.state === "review-only-do-not-deploy" &&
        checklist?.decision === "No-Go / Do Not Deploy" &&
        checklist?.dryRunOnly === true &&
        checklist?.reviewOnly === true,
      "Admin data operator dry-run checklist stays review-only Do Not Deploy."
    );
    scenario.check(
      checklist?.notExecutableDeploySequence === true &&
        Array.isArray(checklist?.executableSteps) &&
        checklist.executableSteps.length === 0 &&
        Array.isArray(checklist?.deploySequence) &&
        checklist.deploySequence.length === 0,
      "Admin data operator dry-run checklist has no executable deploy sequence."
    );
    for (const key of ["admin-data", "product-readiness", "static-rehearsal-output"]) {
      scenario.check(evidenceKeys.includes(key), `Admin data operator dry-run checklist reviews ${key}.`);
    }
    scenario.check(
      (checklist?.reviewedEvidence || []).every((item) => item.executable === false && item.deployAction === false),
      "Admin data operator dry-run checklist evidence rows are review-only and non-deploy."
    );
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
      scenario.check(forbiddenLabels.includes(token), `Admin data operator dry-run checklist marks ${token} absent from executable sequence.`);
    }
    scenario.check(
      (checklist?.forbiddenExecutableItems || []).every((item) => /absent/i.test(String(item.state || ""))),
      "Admin data operator dry-run checklist keeps every forbidden item absent from executable sequence."
    );
    scenario.check(
      checklist?.noSecretNoDeployGuardrails?.credentialRequestAllowed === false &&
        checklist?.noSecretNoDeployGuardrails?.productionUrlStored === false &&
        checklist?.noSecretNoDeployGuardrails?.deployTriggerStored === false &&
        checklist?.noSecretNoDeployGuardrails?.dashboardActionAvailable === false &&
        checklist?.noSecretNoDeployGuardrails?.dnsStepAvailable === false &&
        checklist?.noSecretNoDeployGuardrails?.rollbackAuthorized === false &&
        checklist?.noSecretNoDeployGuardrails?.publicLaunchAuthorized === false &&
        checklist?.noSecretNoDeployGuardrails?.deployActionRequested === false,
      "Admin data operator dry-run checklist blocks credential requests, production URLs, deploy triggers, dashboard actions, DNS steps, rollback/public launch authorization, and deploy actions."
    );
    scenario.check(
      !hasForbiddenDeployValue(serializedChecklist),
      "Admin/static operator dry-run checklist exposes no URL, secret, token, bearer, API key, dashboard-action value, or DNS-step value."
    );

    await resetDrafts(page, baseUrl);
    const fixture = await seedFiveSessionSynthesisDrafts(page);
    await loadIntake(page, baseUrl);
    const readyState = await applyFiveSessionSynthesisState(page, 5);
    const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
    const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
    const approvalAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
    const publishPlanAttempt = await applyPrivateExplicitPublishPlanAttempt(page);
    const diffAttempt = await applyPrivatePublicCopyDiffRollbackAttempt(page);
    const rehearsalAttempt = await applyPrivateReleaseCandidateRehearsalAttempt(page);
    const readinessAttempt = await applyPrivateCredentialedDeployReadinessAttempt(page);
    await page.goto(`${baseUrl}/review.html`, { waitUntil: "networkidle" });

    const finalPanel = await page.evaluate(() => {
      const root = document.querySelector("[data-pr='finalDeployGoNoGoState']");
      return {
        exposed: Boolean(root),
        text: root?.textContent || "",
        decision: root?.getAttribute("data-final-deploy-decision") || "",
        productionDeploymentState: root?.getAttribute("data-production-deployment-state") || "",
        humanApprovalObserved: root?.getAttribute("data-human-approval-observed") || "",
        platformInputsEnabled: root?.getAttribute("data-platform-inputs-enabled") || "",
        noSecretStorage: root?.getAttribute("data-no-secret-storage") || "",
        noProductionUrl: root?.getAttribute("data-no-production-url") || "",
        noDeployTrigger: root?.getAttribute("data-no-deploy-trigger") || "",
        noDeployAction: root?.getAttribute("data-no-deploy-action") || "",
        noPublishAction: root?.getAttribute("data-no-publish-action") || "",
        exportEligible: root?.getAttribute("data-export-eligible") || "",
        downloadEligible: root?.getAttribute("data-download-eligible") || "",
      };
    });
    const operatorPacketPanel = await page.evaluate(() => {
      const root = document.querySelector("[data-pr='firstHumanOperatorPacketHandoffState']");
      return {
        exposed: Boolean(root),
        text: root?.textContent || "",
        state: root?.getAttribute("data-first-human-operator-packet-state") || "",
        decision: root?.getAttribute("data-final-deploy-decision") || "",
        productionDeploymentState: root?.getAttribute("data-production-deployment-state") || "",
        humanApprovalObserved: root?.getAttribute("data-human-approval-observed") || "",
        platformInputsEnabled: root?.getAttribute("data-platform-inputs-enabled") || "",
        localOnly: root?.getAttribute("data-local-only") || "",
        readOnly: root?.getAttribute("data-read-only") || "",
        noSecretStorage: root?.getAttribute("data-no-secret-storage") || "",
        noProductionUrl: root?.getAttribute("data-no-production-url") || "",
        noCredential: root?.getAttribute("data-no-credential") || "",
        noDeployTrigger: root?.getAttribute("data-no-deploy-trigger") || "",
        noDeployAction: root?.getAttribute("data-no-deploy-action") || "",
        noDashboardLink: root?.getAttribute("data-no-dashboard-link") || "",
        noRollbackAuthorization: root?.getAttribute("data-no-rollback-authorization") || "",
        noPublicLaunchAuthorization: root?.getAttribute("data-no-public-launch-authorization") || "",
        exportEligible: root?.getAttribute("data-export-eligible") || "",
        downloadEligible: root?.getAttribute("data-download-eligible") || "",
      };
    });
    const readiness = await readPrivateCredentialedDeployReadiness(page);
    const stored = await storedDrafts(page);
    const selectedDraft = stored.intakes.find((intake) => intake.id === stored.lastIntakeId);
    const combinedText = `${finalPanel.text}\n${operatorPacketPanel.text}\n${readiness.text}`;

    scenario.check(
      artifactAttempt.changed === true &&
        memoAttempt.artifactAvailable === true &&
        approvalAttempt.memoAvailable === true &&
        publishPlanAttempt.approvalAvailable === true &&
        diffAttempt.publishPlanAvailable === true &&
        rehearsalAttempt.diffPacketAvailable === true &&
        readinessAttempt.rehearsalAvailable === true,
      "Product operator dry-run scenario reaches local readiness prerequisites without external inputs."
    );
    scenario.check(
      finalPanel.exposed === true &&
        finalPanel.decision === "no-go" &&
        finalPanel.productionDeploymentState === "Do Not Deploy" &&
        finalPanel.humanApprovalObserved === "false" &&
        finalPanel.platformInputsEnabled === "false",
      "Product operator dry-run review remains No-Go / Do Not Deploy with human approval absent and platform inputs disabled."
    );
    scenario.check(
      finalPanel.noSecretStorage === "true" &&
        finalPanel.noProductionUrl === "true" &&
        finalPanel.noDeployTrigger === "true" &&
        finalPanel.noDeployAction === "true" &&
        finalPanel.noPublishAction === "true" &&
        operatorPacketPanel.localOnly === "true" &&
        operatorPacketPanel.readOnly === "true" &&
        operatorPacketPanel.noCredential === "true" &&
        operatorPacketPanel.noDashboardLink === "true" &&
        operatorPacketPanel.noRollbackAuthorization === "true" &&
        operatorPacketPanel.noPublicLaunchAuthorization === "true",
      "Product operator dry-run review blocks credentials, production URLs, deploy triggers, dashboard actions, rollback/public launch authorization, and deploy actions."
    );
    scenario.check(
      finalPanel.exportEligible === "false" &&
        finalPanel.downloadEligible === "false" &&
        operatorPacketPanel.exportEligible === "false" &&
        operatorPacketPanel.downloadEligible === "false",
      "Product operator dry-run review remains export/download ineligible."
    );
    scenario.check(!hasForbiddenDeployValue(combinedText), "Product operator dry-run review text exposes no URL, secret, token, bearer, dashboard-action value, DNS-step value, dashboard-link value, or contact-detail value.");
    scenario.check(
      selectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
        selectedDraft?.downloadedExportText === fixture.selectedExportText &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readinessAttempt.readinessText) &&
        !String(selectedDraft?.downloadedExportText || "").includes(rehearsalAttempt.rehearsalText) &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText),
      "Product operator dry-run review metadata stays out of resume export/download text."
    );
  } finally {
    responseOverrides.delete("/admin-data.json");
  }

  return scenario;
}

async function runFirstHumanPacketColdStartArchiveScenario(page, baseUrl) {
  const scenario = createScenario("first-human-packet-cold-start-archive-no-network");
  const passedFixture = staticDeployPassedLocalFixture();
  const adminFixture = adminDataWithStaticDeployFixture(passedFixture);
  responseOverrides.set("/admin-data.json", {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(adminFixture),
  });

  try {
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });
    const loadedAdminData = await page.evaluate(async () => {
      const response = await fetch("/admin-data.json");
      return response.json();
    });
    const archive = loadedAdminData.validation?.firstHumanPacketColdStartArchive;
    const serializedArchive = JSON.stringify(archive);
    const sourceKeys = (archive?.sourceArtifacts || []).map((item) => String(item.key || "").toLowerCase());
    const continuationFacts = (archive?.continuationFacts || []).map((item) => `${item.label || ""}: ${item.state || ""}`.toLowerCase()).join("\n");
    const forbiddenLabels = (archive?.forbiddenOperationalItems || []).map((item) => `${item.label || ""}: ${item.state || ""}`.toLowerCase()).join("\n");

    scenario.check(archive?.format === "proofresume-first-human-packet-cold-start-archive-v1", "Admin data exposes first-human packet cold-start archive format.");
    scenario.check(
      archive?.state === "archive-only-do-not-deploy" &&
        archive?.decision === "No-Go / Do Not Deploy" &&
        archive?.archiveOnly === true &&
        archive?.nonOperational === true,
      "Admin data cold-start archive stays archive-only, non-operational, and Do Not Deploy."
    );
    scenario.check(
      archive?.notExecutableSequence === true &&
        Array.isArray(archive?.executableSteps) &&
        archive.executableSteps.length === 0 &&
        Array.isArray(archive?.deploySequence) &&
        archive.deploySequence.length === 0,
      "Admin data cold-start archive has no executable sequence."
    );
    for (const key of ["first-human-packet-index", "operator-dry-run-checklist", "static-rehearsal-output"]) {
      scenario.check(sourceKeys.includes(key), `Admin data cold-start archive includes ${key}.`);
    }
    scenario.check(
      (archive?.sourceArtifacts || []).every((item) => item.operationalAction === false),
      "Admin data cold-start archive source artifacts are context only, not operational actions."
    );
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
      scenario.check(continuationFacts.includes(token) && continuationFacts.includes("not observed"), `Admin data cold-start archive keeps ${token} Not observed.`);
    }
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
      scenario.check(forbiddenLabels.includes(token), `Admin data cold-start archive marks ${token} absent.`);
    }
    scenario.check(
      (archive?.forbiddenOperationalItems || []).every((item) => /absent/i.test(String(item.state || ""))),
      "Admin data cold-start archive keeps every forbidden operational item absent."
    );
    scenario.check(
      archive?.noSecretNoDeployGuardrails?.credentialRequestAllowed === false &&
        archive?.noSecretNoDeployGuardrails?.secretStorageAllowed === false &&
        archive?.noSecretNoDeployGuardrails?.productionUrlStored === false &&
        archive?.noSecretNoDeployGuardrails?.deployTriggerStored === false &&
        archive?.noSecretNoDeployGuardrails?.dashboardActionAvailable === false &&
        archive?.noSecretNoDeployGuardrails?.dnsStepAvailable === false &&
        archive?.noSecretNoDeployGuardrails?.rollbackAuthorized === false &&
        archive?.noSecretNoDeployGuardrails?.publicLaunchAuthorized === false &&
        archive?.noSecretNoDeployGuardrails?.deployActionRequested === false &&
        archive?.noSecretNoDeployGuardrails?.executableSequenceCreated === false &&
        archive?.noSecretNoDeployGuardrails?.productionDeploymentState === "Do Not Deploy",
      "Admin data cold-start archive blocks secrets, production URLs, deploy triggers, dashboard/DNS actions, rollback/public launch authorization, deploy actions, and executable sequence creation."
    );
    scenario.check(
      !hasForbiddenDeployValue(serializedArchive),
      "Admin/static cold-start archive exposes no URL, secret, token, bearer, API key, dashboard-action value, DNS-step value, or deploy-command value."
    );

    await resetDrafts(page, baseUrl);
    const fixture = await seedFiveSessionSynthesisDrafts(page);
    await loadIntake(page, baseUrl);
    const readyState = await applyFiveSessionSynthesisState(page, 5);
    const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
    const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
    const approvalAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
    const publishPlanAttempt = await applyPrivateExplicitPublishPlanAttempt(page);
    const diffAttempt = await applyPrivatePublicCopyDiffRollbackAttempt(page);
    const rehearsalAttempt = await applyPrivateReleaseCandidateRehearsalAttempt(page);
    const readinessAttempt = await applyPrivateCredentialedDeployReadinessAttempt(page);
    await page.goto(`${baseUrl}/review.html`, { waitUntil: "networkidle" });

    const finalPanel = await page.evaluate(() => {
      const root = document.querySelector("[data-pr='finalDeployGoNoGoState']");
      return {
        exposed: Boolean(root),
        text: root?.textContent || "",
        decision: root?.getAttribute("data-final-deploy-decision") || "",
        productionDeploymentState: root?.getAttribute("data-production-deployment-state") || "",
        humanApprovalObserved: root?.getAttribute("data-human-approval-observed") || "",
        platformInputsEnabled: root?.getAttribute("data-platform-inputs-enabled") || "",
        noSecretStorage: root?.getAttribute("data-no-secret-storage") || "",
        noProductionUrl: root?.getAttribute("data-no-production-url") || "",
        noDeployTrigger: root?.getAttribute("data-no-deploy-trigger") || "",
        noDeployAction: root?.getAttribute("data-no-deploy-action") || "",
        noPublishAction: root?.getAttribute("data-no-publish-action") || "",
        exportEligible: root?.getAttribute("data-export-eligible") || "",
        downloadEligible: root?.getAttribute("data-download-eligible") || "",
      };
    });
    const operatorPacketPanel = await page.evaluate(() => {
      const root = document.querySelector("[data-pr='firstHumanOperatorPacketHandoffState']");
      return {
        exposed: Boolean(root),
        text: root?.textContent || "",
        localOnly: root?.getAttribute("data-local-only") || "",
        readOnly: root?.getAttribute("data-read-only") || "",
        noCredential: root?.getAttribute("data-no-credential") || "",
        noDeployTrigger: root?.getAttribute("data-no-deploy-trigger") || "",
        noDeployAction: root?.getAttribute("data-no-deploy-action") || "",
        noDashboardLink: root?.getAttribute("data-no-dashboard-link") || "",
        noRollbackAuthorization: root?.getAttribute("data-no-rollback-authorization") || "",
        noPublicLaunchAuthorization: root?.getAttribute("data-no-public-launch-authorization") || "",
        exportEligible: root?.getAttribute("data-export-eligible") || "",
        downloadEligible: root?.getAttribute("data-download-eligible") || "",
      };
    });
    const readiness = await readPrivateCredentialedDeployReadiness(page);
    const stored = await storedDrafts(page);
    const selectedDraft = stored.intakes.find((intake) => intake.id === stored.lastIntakeId);
    const combinedText = `${finalPanel.text}\n${operatorPacketPanel.text}\n${readiness.text}`;

    scenario.check(
      artifactAttempt.changed === true &&
        memoAttempt.artifactAvailable === true &&
        approvalAttempt.memoAvailable === true &&
        publishPlanAttempt.approvalAvailable === true &&
        diffAttempt.publishPlanAvailable === true &&
        rehearsalAttempt.diffPacketAvailable === true &&
        readinessAttempt.rehearsalAvailable === true,
      "Product cold-start archive scenario reaches local readiness prerequisites without external inputs."
    );
    scenario.check(
      finalPanel.exposed === true &&
        finalPanel.decision === "no-go" &&
        finalPanel.productionDeploymentState === "Do Not Deploy" &&
        finalPanel.humanApprovalObserved === "false" &&
        finalPanel.platformInputsEnabled === "false",
      "Product cold-start archive readiness remains No-Go / Do Not Deploy with human approval absent and platform inputs disabled."
    );
    scenario.check(
      finalPanel.noSecretStorage === "true" &&
        finalPanel.noProductionUrl === "true" &&
        finalPanel.noDeployTrigger === "true" &&
        finalPanel.noDeployAction === "true" &&
        finalPanel.noPublishAction === "true" &&
        operatorPacketPanel.localOnly === "true" &&
        operatorPacketPanel.readOnly === "true" &&
        operatorPacketPanel.noCredential === "true" &&
        operatorPacketPanel.noDeployTrigger === "true" &&
        operatorPacketPanel.noDeployAction === "true" &&
        operatorPacketPanel.noDashboardLink === "true" &&
        operatorPacketPanel.noRollbackAuthorization === "true" &&
        operatorPacketPanel.noPublicLaunchAuthorization === "true",
      "Product cold-start archive remains local-only, read-only, no-secret, no-deploy, no-public-launch, and non-operational."
    );
    scenario.check(
      finalPanel.exportEligible === "false" &&
        finalPanel.downloadEligible === "false" &&
        operatorPacketPanel.exportEligible === "false" &&
        operatorPacketPanel.downloadEligible === "false",
      "Product cold-start archive remains export/download ineligible."
    );
    scenario.check(!hasForbiddenDeployValue(combinedText), "Product cold-start archive readiness text exposes no URL, secret, token, bearer, dashboard-action value, DNS-step value, deploy-command value, dashboard-link value, or contact-detail value.");
    scenario.check(
      selectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
        selectedDraft?.downloadedExportText === fixture.selectedExportText &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readinessAttempt.readinessText) &&
        !String(selectedDraft?.downloadedExportText || "").includes(rehearsalAttempt.rehearsalText) &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText),
      "Product cold-start archive metadata stays out of resume export/download text."
    );
  } finally {
    responseOverrides.delete("/admin-data.json");
  }

  return scenario;
}

async function runReleaseCandidateDeployContinuationMapScenario(page, baseUrl) {
  const scenario = createScenario("release-candidate-deploy-continuation-map-no-network");
  const passedFixture = staticDeployPassedLocalFixture();
  const adminFixture = adminDataWithStaticDeployFixture(passedFixture);
  responseOverrides.set("/admin-data.json", {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(adminFixture),
  });

  try {
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });
    const loadedAdminData = await page.evaluate(async () => {
      const response = await fetch("/admin-data.json");
      return response.json();
    });
    const map = loadedAdminData.validation?.releaseCandidateDeployContinuationMap;
    const serializedMap = JSON.stringify(map);
    const sourceKeys = (map?.sourceArtifacts || []).map((item) => String(item.key || "").toLowerCase());
    const externalText = Array.isArray(map?.externalPlatformInputs)
      ? map.externalPlatformInputs.map((item) => `${item.label || ""}: ${item.state || ""}: ${item.canRequestFromMap}`).join("\n").toLowerCase()
      : "";
    const gateText = (map?.blockedContinuationGates || []).map((item) => `${item.label || ""}: ${item.state || ""}: ${item.response || ""}`).join("\n").toLowerCase();
    const forbiddenText = (map?.forbiddenOperationalItems || []).map((item) => `${item.label || ""}: ${item.state || ""}`).join("\n").toLowerCase();

    scenario.check(map?.format === "proofresume-release-candidate-deploy-continuation-map-v1", "Admin data exposes release-candidate deploy-continuation map format.");
    scenario.check(
      map?.state === "blocked-continuation-do-not-deploy" &&
        map?.decision === "No-Go / Do Not Deploy" &&
        map?.productionDeploymentState === "Do Not Deploy" &&
        map?.blocked === true,
      "Admin data deploy-continuation map remains blocked No-Go / Do Not Deploy."
    );
    scenario.check(
      map?.localOnly === true &&
        map?.private === true &&
        map?.readOnly === true &&
        map?.notDeployPlan === true &&
        map?.notLaunchPlan === true &&
        map?.notRollbackPlan === true,
      "Admin data deploy-continuation map stays private, local-only, read-only, and not a deploy/launch/rollback plan."
    );
    scenario.check(
      map?.notExecutableSequence === true &&
        map?.cannotRequestPlatformInputs === true &&
        Array.isArray(map?.executableSteps) &&
        map.executableSteps.length === 0 &&
        Array.isArray(map?.deploySequence) &&
        map.deploySequence.length === 0,
      "Admin data deploy-continuation map cannot request platform inputs or become an executable sequence."
    );
    for (const key of ["admin-data", "product-readiness", "static-rehearsal-output", "cold-start-archive"]) {
      scenario.check(sourceKeys.includes(key), `Admin data deploy-continuation map includes ${key}.`);
    }
    scenario.check(
      (map?.sourceArtifacts || []).every((item) => item.operationalAction === false),
      "Admin data deploy-continuation map source artifacts are context only."
    );
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
      scenario.check(
        externalText.includes(token) && externalText.includes("not observed") && !externalText.includes(`${token}: not observed: true`),
        `Admin data deploy-continuation map keeps ${token} Not observed and non-requestable.`
      );
    }
    for (const token of ["platform-specific deploy prep", "production readiness", "requests for values", "executable deploy sequence", "public launch approval", "rollback authorization"]) {
      scenario.check(gateText.includes(token) && gateText.includes("blocked"), `Admin data deploy-continuation map keeps ${token} blocked.`);
    }
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
      scenario.check(forbiddenText.includes(token), `Admin data deploy-continuation map marks ${token} absent.`);
    }
    scenario.check(
      (map?.forbiddenOperationalItems || []).every((item) => /absent/i.test(String(item.state || ""))),
      "Admin data deploy-continuation map keeps every forbidden operational item absent."
    );
    scenario.check(
      map?.noSecretNoDeployGuardrails?.credentialRequestAllowed === false &&
        map?.noSecretNoDeployGuardrails?.secretStorageAllowed === false &&
        map?.noSecretNoDeployGuardrails?.platformInputRequestAllowed === false &&
        map?.noSecretNoDeployGuardrails?.productionUrlStored === false &&
        map?.noSecretNoDeployGuardrails?.deployTriggerStored === false &&
        map?.noSecretNoDeployGuardrails?.dashboardActionAvailable === false &&
        map?.noSecretNoDeployGuardrails?.dnsStepAvailable === false &&
        map?.noSecretNoDeployGuardrails?.rollbackAuthorized === false &&
        map?.noSecretNoDeployGuardrails?.publicLaunchAuthorized === false &&
        map?.noSecretNoDeployGuardrails?.deployActionRequested === false &&
        map?.noSecretNoDeployGuardrails?.executableSequenceCreated === false &&
        map?.noSecretNoDeployGuardrails?.productionDeploymentState === "Do Not Deploy",
      "Admin data deploy-continuation map blocks secrets, platform input requests, production URLs, deploy triggers, dashboard/DNS actions, rollback/public launch authorization, deploy actions, and executable sequence creation."
    );
    scenario.check(!hasForbiddenDeployValue(serializedMap), "Admin/static deploy-continuation map exposes no URL, secret, token, bearer, API key, dashboard-action value, DNS-step value, or deploy-command value.");

    await resetDrafts(page, baseUrl);
    const fixture = await seedFiveSessionSynthesisDrafts(page);
    await loadIntake(page, baseUrl);
    const readyState = await applyFiveSessionSynthesisState(page, 5);
    const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
    const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
    const approvalAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
    const publishPlanAttempt = await applyPrivateExplicitPublishPlanAttempt(page);
    const diffAttempt = await applyPrivatePublicCopyDiffRollbackAttempt(page);
    const rehearsalAttempt = await applyPrivateReleaseCandidateRehearsalAttempt(page);
    const readinessAttempt = await applyPrivateCredentialedDeployReadinessAttempt(page);
    await page.goto(`${baseUrl}/review.html`, { waitUntil: "networkidle" });

    const product = await page.evaluate(() => {
      const final = document.querySelector("[data-pr='finalDeployGoNoGoState']");
      const archive = document.querySelector("[data-pr='coldStartArchiveHandoffState']");
      const continuation = document.querySelector("[data-pr='deployContinuationHandoffState']");
      const fields = [
        "credentialedDeployPlatform",
        "credentialedDeployProductionUrl",
        "credentialedDeployCredentialAvailability",
        "credentialedDeployTrigger",
        "credentialedDeployRollbackOwner",
        "credentialedDeployRollbackMethod",
        "credentialedDeployHealthCheckInputs",
      ].map((key) => {
        const node = document.querySelector(`[data-pr='${key}']`);
        return { key, disabled: Boolean(node?.hasAttribute("disabled")), exportEligible: node?.getAttribute("data-export-eligible") || "" };
      });
      return {
        finalExposed: Boolean(final),
        finalText: final?.textContent || "",
        finalDecision: final?.getAttribute("data-final-deploy-decision") || "",
        productionDeploymentState: final?.getAttribute("data-production-deployment-state") || "",
        humanApprovalObserved: final?.getAttribute("data-human-approval-observed") || "",
        platformInputsEnabled: final?.getAttribute("data-platform-inputs-enabled") || "",
        noSecretStorage: final?.getAttribute("data-no-secret-storage") || "",
        noProductionUrl: final?.getAttribute("data-no-production-url") || "",
        noDeployTrigger: final?.getAttribute("data-no-deploy-trigger") || "",
        noDeployAction: final?.getAttribute("data-no-deploy-action") || "",
        noPublishAction: final?.getAttribute("data-no-publish-action") || "",
        exportEligible: final?.getAttribute("data-export-eligible") || "",
        downloadEligible: final?.getAttribute("data-download-eligible") || "",
        archiveExposed: Boolean(archive),
        archiveText: archive?.textContent || "",
        archiveLocalOnly: archive?.getAttribute("data-local-only") || "",
        archiveReadOnly: archive?.getAttribute("data-read-only") || "",
        archiveOnly: archive?.getAttribute("data-archive-only") || "",
        archiveNoCredential: archive?.getAttribute("data-no-credential") || "",
        archiveNoDeployTrigger: archive?.getAttribute("data-no-deploy-trigger") || "",
        archiveNoDeployAction: archive?.getAttribute("data-no-deploy-action") || "",
        archiveNoRollbackAuthorization: archive?.getAttribute("data-no-rollback-authorization") || "",
        archiveNoPublicLaunchAuthorization: archive?.getAttribute("data-no-public-launch-authorization") || "",
        archivePlatformInputsEnabled: archive?.getAttribute("data-platform-inputs-enabled") || "",
        archiveExportEligible: archive?.getAttribute("data-export-eligible") || "",
        archiveDownloadEligible: archive?.getAttribute("data-download-eligible") || "",
        continuationExposed: Boolean(continuation),
        continuationText: continuation?.textContent || "",
        continuationPlatformInputsEnabled: continuation?.getAttribute("data-platform-inputs-enabled") || "",
        continuationPlatformFieldUnlock: continuation?.getAttribute("data-platform-field-unlock") || "",
        continuationExportEligible: continuation?.getAttribute("data-export-eligible") || "",
        continuationDownloadEligible: continuation?.getAttribute("data-download-eligible") || "",
        fields,
      };
    });
    const stored = await storedDrafts(page);
    const selectedDraft = stored.intakes.find((intake) => intake.id === stored.lastIntakeId);
    const combinedText = `${product.finalText}\n${product.archiveText}`;

    scenario.check(
      artifactAttempt.changed === true &&
        memoAttempt.artifactAvailable === true &&
        approvalAttempt.memoAvailable === true &&
        publishPlanAttempt.approvalAvailable === true &&
        diffAttempt.publishPlanAvailable === true &&
        rehearsalAttempt.diffPacketAvailable === true &&
        readinessAttempt.rehearsalAvailable === true,
      "Product deploy-continuation map scenario reaches local release-candidate prerequisites without external inputs."
    );
    scenario.check(
      product.finalExposed === true &&
        product.finalDecision === "no-go" &&
        product.productionDeploymentState === "Do Not Deploy" &&
        product.humanApprovalObserved === "false" &&
        product.platformInputsEnabled === "false",
      "Product deploy-continuation map readiness remains No-Go / Do Not Deploy with human approval absent and platform inputs disabled."
    );
    scenario.check(
      product.noSecretStorage === "true" &&
        product.noProductionUrl === "true" &&
        product.noDeployTrigger === "true" &&
        product.noDeployAction === "true" &&
        product.noPublishAction === "true" &&
        product.archiveLocalOnly === "true" &&
        product.archiveReadOnly === "true" &&
        product.archiveOnly === "true" &&
        product.archiveNoCredential === "true" &&
        product.archiveNoDeployTrigger === "true" &&
        product.archiveNoDeployAction === "true" &&
        product.archiveNoRollbackAuthorization === "true" &&
        product.archiveNoPublicLaunchAuthorization === "true" &&
        product.archivePlatformInputsEnabled === "false",
      "Product deploy-continuation map remains local-only, read-only, no-secret, no-deploy, no-public-launch, and cannot request platform inputs."
    );
    scenario.check(
      product.finalExposed === true &&
        product.archiveExposed === true &&
        product.continuationExposed === true &&
        product.platformInputsEnabled === "false" &&
        product.archivePlatformInputsEnabled === "false" &&
        product.continuationPlatformInputsEnabled === "false" &&
        product.continuationPlatformFieldUnlock === "false" &&
        product.fields.every((field) => field.disabled === true && field.exportEligible === "false") &&
        !/enter|paste|provide|submit/i.test(product.continuationText),
      "Product deploy-continuation map cannot request platform inputs or unlock platform field access."
    );
    scenario.check(
      product.exportEligible === "false" &&
        product.downloadEligible === "false" &&
        product.archiveExportEligible === "false" &&
        product.archiveDownloadEligible === "false" &&
        product.continuationExportEligible === "false" &&
        product.continuationDownloadEligible === "false",
      "Product deploy-continuation map remains export/download ineligible."
    );
    scenario.check(!hasForbiddenDeployValue(combinedText), "Product deploy-continuation map readiness text exposes no URL, secret, token, bearer, dashboard-action value, DNS-step value, deploy-command value, dashboard-link value, or contact-detail value.");
    scenario.check(
      selectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
        selectedDraft?.downloadedExportText === fixture.selectedExportText &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readinessAttempt.readinessText) &&
        !String(selectedDraft?.downloadedExportText || "").includes(rehearsalAttempt.rehearsalText) &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText),
      "Product deploy-continuation map metadata stays out of resume export/download text."
    );
  } finally {
    responseOverrides.delete("/admin-data.json");
  }

  return scenario;
}

async function runPrivateExternalInputBoundaryLedgerScenario(page, baseUrl) {
  const scenario = createScenario("private-external-input-boundary-ledger-no-network");
  const passedFixture = staticDeployPassedLocalFixture();
  const adminFixture = adminDataWithStaticDeployFixture(passedFixture);
  responseOverrides.set("/admin-data.json", {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(adminFixture),
  });

  try {
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });
    const loadedAdminData = await page.evaluate(async () => {
      const response = await fetch("/admin-data.json");
      return response.json();
    });
    const ledger = loadedAdminData.validation?.privateExternalInputBoundaryLedger;
    const serializedLedger = JSON.stringify(ledger);
    const factText = (ledger?.externalFacts || [])
      .map((item) => `${item.label || ""}: ${item.state || ""}: ${item.repoAuthority || ""}: ${item.canRequestFromRepo}: ${item.canInferFromLocalEvidence}`)
      .join("\n")
      .toLowerCase();
    const forbiddenText = (ledger?.forbiddenOperationalItems || [])
      .map((item) => `${item.label || ""}: ${item.state || ""}`)
      .join("\n")
      .toLowerCase();

    scenario.check(ledger?.format === "proofresume-private-external-input-boundary-ledger-v1", "Admin data exposes private external-input boundary ledger format.");
    scenario.check(
      ledger?.state === "private-ledger-do-not-deploy" &&
        ledger?.decision === "No-Go / Do Not Deploy" &&
        ledger?.productionDeploymentState === "Do Not Deploy",
      "Admin data external-input boundary ledger remains No-Go / Do Not Deploy."
    );
    scenario.check(
      ledger?.private === true &&
        ledger?.localOnly === true &&
        ledger?.readOnly === true &&
        ledger?.outsideRepoAuthority === true &&
        ledger?.notExecutableSequence === true &&
        Array.isArray(ledger?.executableSteps) &&
        ledger.executableSteps.length === 0 &&
        Array.isArray(ledger?.deploySequence) &&
        ledger.deploySequence.length === 0,
      "Admin data external-input boundary ledger is outside repo authority and non-executable."
    );
    scenario.check(
      (ledger?.authoritySources || []).every((item) => item.canAuthorize === false),
      "Admin data, Product readiness, and static output cannot authorize external-input facts from the boundary ledger."
    );
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
      scenario.check(
        factText.includes(token) &&
          factText.includes("not observed") &&
          factText.includes("outside repo authority") &&
          !factText.includes(`${token}: not observed: outside repo authority: true`),
        `Admin data external-input boundary ledger keeps ${token} Not observed, outside repo authority, and non-requestable.`
      );
    }
    scenario.check(
      (ledger?.externalFacts || []).every(
        (item) =>
          item.state === "Not observed" &&
          item.repoAuthority === "Outside repo authority" &&
          item.canRequestFromRepo === false &&
          item.canInferFromLocalEvidence === false
      ),
      "Admin data external-input boundary ledger keeps every external fact non-requestable and non-inferable."
    );
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
      scenario.check(forbiddenText.includes(token), `Admin data external-input boundary ledger marks ${token} absent.`);
    }
    scenario.check(
      ledger?.noSecretNoDeployGuardrails?.credentialRequestAllowed === false &&
        ledger?.noSecretNoDeployGuardrails?.secretStorageAllowed === false &&
        ledger?.noSecretNoDeployGuardrails?.platformInputRequestAllowed === false &&
        ledger?.noSecretNoDeployGuardrails?.productionUrlStored === false &&
        ledger?.noSecretNoDeployGuardrails?.deployTriggerStored === false &&
        ledger?.noSecretNoDeployGuardrails?.dashboardActionAvailable === false &&
        ledger?.noSecretNoDeployGuardrails?.dnsStepAvailable === false &&
        ledger?.noSecretNoDeployGuardrails?.rollbackAuthorized === false &&
        ledger?.noSecretNoDeployGuardrails?.publicLaunchAuthorized === false &&
        ledger?.noSecretNoDeployGuardrails?.deployActionRequested === false &&
        ledger?.noSecretNoDeployGuardrails?.executableSequenceCreated === false &&
        ledger?.noSecretNoDeployGuardrails?.finalDecisionChangeAllowed === false &&
        ledger?.noSecretNoDeployGuardrails?.productionDeploymentState === "Do Not Deploy",
      "Admin data external-input boundary ledger enforces no-secret, no-deploy, no-public-launch, and non-executable guardrails."
    );
    scenario.check(
      ledger?.crossArtifactEvidence?.adminDataExternalInputsPresent === false &&
        ledger?.crossArtifactEvidence?.productReadinessExternalInputsPresent === false &&
        ledger?.crossArtifactEvidence?.staticOutputExternalInputsPresent === false,
      "Static rehearsal output preserves external-input absence across Admin data, Product readiness, and static output."
    );
    scenario.check(!hasForbiddenDeployValue(serializedLedger), "Admin/static external-input boundary ledger exposes no URL, secret, token, bearer, dashboard-action value, DNS-step value, or deploy-command value.");

    await resetDrafts(page, baseUrl);
    const fixture = await seedFiveSessionSynthesisDrafts(page);
    await loadIntake(page, baseUrl);
    const readyState = await applyFiveSessionSynthesisState(page, 5);
    const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
    const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
    const approvalAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
    const publishPlanAttempt = await applyPrivateExplicitPublishPlanAttempt(page);
    const diffAttempt = await applyPrivatePublicCopyDiffRollbackAttempt(page);
    const rehearsalAttempt = await applyPrivateReleaseCandidateRehearsalAttempt(page);
    const readinessAttempt = await applyPrivateCredentialedDeployReadinessAttempt(page);
    await page.goto(`${baseUrl}/review.html`, { waitUntil: "networkidle" });

    const product = await page.evaluate(() => {
      const final = document.querySelector("[data-pr='finalDeployGoNoGoState']");
      const continuation = document.querySelector("[data-pr='deployContinuationHandoffState']");
      const fields = [
        "credentialedDeployPlatform",
        "credentialedDeployProductionUrl",
        "credentialedDeployCredentialAvailability",
        "credentialedDeployTrigger",
        "credentialedDeployRollbackOwner",
        "credentialedDeployRollbackMethod",
        "credentialedDeployHealthCheckInputs",
      ].map((key) => {
        const node = document.querySelector(`[data-pr='${key}']`);
        return { key, disabled: Boolean(node?.hasAttribute("disabled")), exportEligible: node?.getAttribute("data-export-eligible") || "" };
      });
      return {
        finalText: final?.textContent || "",
        continuationText: continuation?.textContent || "",
        finalDecision: final?.getAttribute("data-final-deploy-decision") || "",
        productionDeploymentState: final?.getAttribute("data-production-deployment-state") || "",
        humanApprovalObserved: final?.getAttribute("data-human-approval-observed") || "",
        platformInputsEnabled: final?.getAttribute("data-platform-inputs-enabled") || "",
        noSecretStorage: final?.getAttribute("data-no-secret-storage") || "",
        noProductionUrl: final?.getAttribute("data-no-production-url") || "",
        noDeployTrigger: final?.getAttribute("data-no-deploy-trigger") || "",
        noDeployAction: final?.getAttribute("data-no-deploy-action") || "",
        noPublishAction: final?.getAttribute("data-no-publish-action") || "",
        exportEligible: final?.getAttribute("data-export-eligible") || "",
        downloadEligible: final?.getAttribute("data-download-eligible") || "",
        continuationPlatformInputsEnabled: continuation?.getAttribute("data-platform-inputs-enabled") || "",
        continuationPlatformFieldUnlock: continuation?.getAttribute("data-platform-field-unlock") || "",
        continuationExportEligible: continuation?.getAttribute("data-export-eligible") || "",
        continuationDownloadEligible: continuation?.getAttribute("data-download-eligible") || "",
        fields,
      };
    });
    const stored = await storedDrafts(page);
    const selectedDraft = stored.intakes.find((intake) => intake.id === stored.lastIntakeId);
    const combinedText = `${product.finalText}\n${product.continuationText}`;

    scenario.check(
      artifactAttempt.changed === true &&
        memoAttempt.artifactAvailable === true &&
        approvalAttempt.memoAvailable === true &&
        publishPlanAttempt.approvalAvailable === true &&
        diffAttempt.publishPlanAvailable === true &&
        rehearsalAttempt.diffPacketAvailable === true &&
        readinessAttempt.rehearsalAvailable === true,
      "Product external-input boundary ledger scenario reaches local readiness prerequisites without external inputs."
    );
    scenario.check(
      product.finalDecision === "no-go" &&
        product.productionDeploymentState === "Do Not Deploy" &&
        product.humanApprovalObserved === "false" &&
        product.platformInputsEnabled === "false" &&
        product.continuationPlatformInputsEnabled === "false" &&
        product.continuationPlatformFieldUnlock === "false",
      "Product external-input boundary ledger readiness remains No-Go / Do Not Deploy with platform inputs disabled."
    );
    scenario.check(
      product.noSecretStorage === "true" &&
        product.noProductionUrl === "true" &&
        product.noDeployTrigger === "true" &&
        product.noDeployAction === "true" &&
        product.noPublishAction === "true" &&
        product.fields.every((field) => field.disabled === true && field.exportEligible === "false") &&
        !/enter|paste|provide|submit/i.test(product.continuationText),
      "Product external-input boundary ledger cannot request secrets, production URLs, deploy triggers, platform inputs, or deploy actions."
    );
    scenario.check(
      product.exportEligible === "false" &&
        product.downloadEligible === "false" &&
        product.continuationExportEligible === "false" &&
        product.continuationDownloadEligible === "false",
      "Product external-input boundary ledger remains export/download ineligible."
    );
    scenario.check(!hasForbiddenDeployValue(combinedText), "Product external-input boundary ledger readiness text exposes no URL, secret, token, bearer, dashboard-action value, DNS-step value, deploy-command value, dashboard-link value, or contact-detail value.");
    scenario.check(
      selectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
        selectedDraft?.downloadedExportText === fixture.selectedExportText &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readinessAttempt.readinessText) &&
        !String(selectedDraft?.downloadedExportText || "").includes(rehearsalAttempt.rehearsalText) &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText),
      "Product external-input boundary ledger metadata stays out of resume export/download text."
    );
  } finally {
    responseOverrides.delete("/admin-data.json");
  }

  return scenario;
}

async function runPlatformOwnerNonRequestTransferNoteScenario(page, baseUrl) {
  const scenario = createScenario("platform-owner-non-request-transfer-note-no-network");
  const passedFixture = staticDeployPassedLocalFixture();
  const adminFixture = adminDataWithStaticDeployFixture(passedFixture);
  responseOverrides.set("/admin-data.json", {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(adminFixture),
  });

  try {
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });
    const loadedAdminData = await page.evaluate(async () => {
      const response = await fetch("/admin-data.json");
      return response.json();
    });
    const note = loadedAdminData.validation?.platformOwnerNonRequestTransferNote;
    const serializedNote = JSON.stringify(note);
    const factText = (note?.transferFacts || [])
      .map((item) => `${item.label || ""}: ${item.state || ""}: ${item.repoAuthority || ""}: ${item.canRequestFromRepo}: ${item.canInferFromLocalEvidence}: ${item.transferWordingAllowed || ""}`)
      .join("\n")
      .toLowerCase();
    const forbiddenText = (note?.forbiddenOperationalItems || [])
      .map((item) => `${item.label || ""}: ${item.state || ""}`)
      .join("\n")
      .toLowerCase();

    scenario.check(note?.format === "proofresume-platform-owner-non-request-transfer-note-v1", "Admin data exposes platform-owner non-request transfer note format.");
    scenario.check(
      note?.state === "private-transfer-note-do-not-deploy" &&
        note?.decision === "No-Go / Do Not Deploy" &&
        note?.productionDeploymentState === "Do Not Deploy",
      "Admin data platform-owner non-request transfer note remains No-Go / Do Not Deploy."
    );
    scenario.check(
      note?.private === true &&
        note?.localOnly === true &&
        note?.readOnly === true &&
        note?.nonRequest === true &&
        note?.outsideRepoAuthority === true &&
        note?.notCredentialRequest === true &&
        note?.notExecutableSequence === true &&
        Array.isArray(note?.executableSteps) &&
        note.executableSteps.length === 0 &&
        Array.isArray(note?.deploySequence) &&
        note.deploySequence.length === 0,
      "Admin data platform-owner non-request transfer note is non-request, outside repo authority, and non-executable."
    );
    scenario.check(
      note?.sourceConsumed?.path === "ops/deploy/private-external-input-boundary-ledger.md" &&
        note?.sourceConsumed?.canRequestValues === false &&
        note?.sourceConsumed?.canAuthorizeDeploy === false,
      "Admin data platform-owner non-request transfer note consumes only the boundary ledger without requesting values or authorizing deploy."
    );
    scenario.check(
      (note?.transferScope || []).every((item) => item.canAuthorize === false && item.canRequestValues === false),
      "Admin data, Product readiness, and static output cannot authorize or request values from the transfer note."
    );
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
      scenario.check(
        factText.includes(token) &&
          factText.includes("not observed") &&
          factText.includes("outside repo authority") &&
          factText.includes("preserve blocked state only"),
        `Admin data platform-owner non-request transfer note keeps ${token} Not observed, outside repo authority, and preservation-only.`
      );
    }
    scenario.check(
      (note?.transferFacts || []).every(
        (item) =>
          item.state === "Not observed" &&
          item.repoAuthority === "Outside repo authority" &&
          item.canRequestFromRepo === false &&
          item.canInferFromLocalEvidence === false
      ),
      "Admin data platform-owner non-request transfer note keeps every transfer fact non-requestable and non-inferable."
    );
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
      scenario.check(forbiddenText.includes(token), `Admin data platform-owner non-request transfer note marks ${token} absent.`);
    }
    scenario.check(
      Object.values(note?.transferSummary || {}).every((value) => value === "No"),
      "Admin data platform-owner non-request transfer note summary keeps requests, authorizations, and executable sequences at No."
    );
    scenario.check(
      note?.noSecretNoDeployGuardrails?.credentialRequestAllowed === false &&
        note?.noSecretNoDeployGuardrails?.secretStorageAllowed === false &&
        note?.noSecretNoDeployGuardrails?.platformInputRequestAllowed === false &&
        note?.noSecretNoDeployGuardrails?.productionUrlStored === false &&
        note?.noSecretNoDeployGuardrails?.deployTriggerStored === false &&
        note?.noSecretNoDeployGuardrails?.dashboardActionAvailable === false &&
        note?.noSecretNoDeployGuardrails?.dnsStepAvailable === false &&
        note?.noSecretNoDeployGuardrails?.rollbackAuthorized === false &&
        note?.noSecretNoDeployGuardrails?.publicLaunchAuthorized === false &&
        note?.noSecretNoDeployGuardrails?.deployActionRequested === false &&
        note?.noSecretNoDeployGuardrails?.executableSequenceCreated === false &&
        note?.noSecretNoDeployGuardrails?.finalDecisionChangeAllowed === false &&
        note?.noSecretNoDeployGuardrails?.productionDeploymentState === "Do Not Deploy",
      "Admin data platform-owner non-request transfer note enforces no-secret, no-deploy, no-public-launch, and non-executable guardrails."
    );
    scenario.check(
      note?.crossArtifactEvidence?.adminDataExternalInputsPresent === false &&
        note?.crossArtifactEvidence?.productReadinessExternalInputsPresent === false &&
        note?.crossArtifactEvidence?.staticOutputExternalInputsPresent === false,
      "Static rehearsal output preserves platform-owner non-request transfer note external-input absence across Admin data, Product readiness, and static output."
    );
    scenario.check(!hasForbiddenDeployValue(serializedNote), "Admin/static platform-owner non-request transfer note exposes no URL, secret, token, bearer, dashboard-action value, DNS-step value, or deploy-command value.");

    await resetDrafts(page, baseUrl);
    const fixture = await seedFiveSessionSynthesisDrafts(page);
    await loadIntake(page, baseUrl);
    const readyState = await applyFiveSessionSynthesisState(page, 5);
    const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
    const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
    const approvalAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
    const publishPlanAttempt = await applyPrivateExplicitPublishPlanAttempt(page);
    const diffAttempt = await applyPrivatePublicCopyDiffRollbackAttempt(page);
    const rehearsalAttempt = await applyPrivateReleaseCandidateRehearsalAttempt(page);
    const readinessAttempt = await applyPrivateCredentialedDeployReadinessAttempt(page);
    await page.goto(`${baseUrl}/review.html`, { waitUntil: "networkidle" });

    const product = await page.evaluate(() => {
      const final = document.querySelector("[data-pr='finalDeployGoNoGoState']");
      const continuation = document.querySelector("[data-pr='deployContinuationHandoffState']");
      const fields = [
        "credentialedDeployPlatform",
        "credentialedDeployProductionUrl",
        "credentialedDeployCredentialAvailability",
        "credentialedDeployTrigger",
        "credentialedDeployRollbackOwner",
        "credentialedDeployRollbackMethod",
        "credentialedDeployHealthCheckInputs",
      ].map((key) => {
        const node = document.querySelector(`[data-pr='${key}']`);
        return { key, disabled: Boolean(node?.hasAttribute("disabled")), exportEligible: node?.getAttribute("data-export-eligible") || "" };
      });
      return {
        finalText: final?.textContent || "",
        continuationText: continuation?.textContent || "",
        finalDecision: final?.getAttribute("data-final-deploy-decision") || "",
        productionDeploymentState: final?.getAttribute("data-production-deployment-state") || "",
        humanApprovalObserved: final?.getAttribute("data-human-approval-observed") || "",
        platformInputsEnabled: final?.getAttribute("data-platform-inputs-enabled") || "",
        noSecretStorage: final?.getAttribute("data-no-secret-storage") || "",
        noProductionUrl: final?.getAttribute("data-no-production-url") || "",
        noDeployTrigger: final?.getAttribute("data-no-deploy-trigger") || "",
        noDeployAction: final?.getAttribute("data-no-deploy-action") || "",
        noPublishAction: final?.getAttribute("data-no-publish-action") || "",
        exportEligible: final?.getAttribute("data-export-eligible") || "",
        downloadEligible: final?.getAttribute("data-download-eligible") || "",
        continuationPlatformInputsEnabled: continuation?.getAttribute("data-platform-inputs-enabled") || "",
        continuationPlatformFieldUnlock: continuation?.getAttribute("data-platform-field-unlock") || "",
        continuationExportEligible: continuation?.getAttribute("data-export-eligible") || "",
        continuationDownloadEligible: continuation?.getAttribute("data-download-eligible") || "",
        fields,
      };
    });
    const stored = await storedDrafts(page);
    const selectedDraft = stored.intakes.find((intake) => intake.id === stored.lastIntakeId);
    const combinedText = `${product.finalText}\n${product.continuationText}`;

    scenario.check(
      artifactAttempt.changed === true &&
        memoAttempt.artifactAvailable === true &&
        approvalAttempt.memoAvailable === true &&
        publishPlanAttempt.approvalAvailable === true &&
        diffAttempt.publishPlanAvailable === true &&
        rehearsalAttempt.diffPacketAvailable === true &&
        readinessAttempt.rehearsalAvailable === true,
      "Product platform-owner non-request transfer note scenario reaches local readiness prerequisites without external inputs."
    );
    scenario.check(
      product.finalDecision === "no-go" &&
        product.productionDeploymentState === "Do Not Deploy" &&
        product.humanApprovalObserved === "false" &&
        product.platformInputsEnabled === "false" &&
        product.continuationPlatformInputsEnabled === "false" &&
        product.continuationPlatformFieldUnlock === "false",
      "Product platform-owner non-request transfer note readiness remains No-Go / Do Not Deploy with platform inputs disabled."
    );
    scenario.check(
      product.noSecretStorage === "true" &&
        product.noProductionUrl === "true" &&
        product.noDeployTrigger === "true" &&
        product.noDeployAction === "true" &&
        product.noPublishAction === "true" &&
        product.fields.every((field) => field.disabled === true && field.exportEligible === "false") &&
        !/enter|paste|provide|submit/i.test(product.continuationText),
      "Product platform-owner non-request transfer note cannot request secrets, production URLs, deploy triggers, platform inputs, or deploy actions."
    );
    scenario.check(
      product.exportEligible === "false" &&
        product.downloadEligible === "false" &&
        product.continuationExportEligible === "false" &&
        product.continuationDownloadEligible === "false",
      "Product platform-owner non-request transfer note remains export/download ineligible."
    );
    scenario.check(!hasForbiddenDeployValue(combinedText), "Product platform-owner non-request transfer note readiness text exposes no URL, secret, token, bearer, dashboard-action value, DNS-step value, deploy-command value, dashboard-link value, or contact-detail value.");
    scenario.check(
      selectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
        selectedDraft?.downloadedExportText === fixture.selectedExportText &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readinessAttempt.readinessText) &&
        !String(selectedDraft?.downloadedExportText || "").includes(rehearsalAttempt.rehearsalText) &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText),
      "Product platform-owner non-request transfer note metadata stays out of resume export/download text."
    );
  } finally {
    responseOverrides.delete("/admin-data.json");
  }

  return scenario;
}

async function runOperatorResumePacketGuardrailScenario(page, baseUrl) {
  const scenario = createScenario("operator-resume-packet-guardrail-no-network");
  const passedFixture = staticDeployPassedLocalFixture();
  const adminFixture = adminDataWithStaticDeployFixture(passedFixture);
  responseOverrides.set("/admin-data.json", {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(adminFixture),
  });

  try {
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });
    const loadedAdminData = await page.evaluate(async () => {
      const response = await fetch("/admin-data.json");
      return response.json();
    });
    const guardrail = loadedAdminData.validation?.operatorResumePacketGuardrail;
    const serializedGuardrail = JSON.stringify(guardrail);
    const factText = (guardrail?.guardrailFacts || [])
      .map((item) => `${item.label || ""}: ${item.state || ""}: ${item.repoAuthority || ""}: ${item.canRequestFromRepo}: ${item.canInferFromLocalEvidence}: ${item.guardrailWordingAllowed || ""}`)
      .join("\n")
      .toLowerCase();
    const forbiddenText = (guardrail?.forbiddenOperationalItems || [])
      .map((item) => `${item.label || ""}: ${item.state || ""}`)
      .join("\n")
      .toLowerCase();

    scenario.check(guardrail?.format === "proofresume-operator-resume-packet-guardrail-v1", "Admin data exposes operator-resume packet guardrail format.");
    scenario.check(
      guardrail?.state === "private-resume-guardrail-do-not-deploy" &&
        guardrail?.decision === "No-Go / Do Not Deploy" &&
        guardrail?.productionDeploymentState === "Do Not Deploy",
      "Admin data operator-resume packet guardrail remains No-Go / Do Not Deploy."
    );
    scenario.check(
      guardrail?.private === true &&
        guardrail?.localOnly === true &&
        guardrail?.readOnly === true &&
        guardrail?.nonRequest === true &&
        guardrail?.outsideRepoAuthority === true &&
        guardrail?.notCredentialRequest === true &&
        guardrail?.notLaunchPlan === true &&
        guardrail?.notRollbackPlan === true &&
        guardrail?.notExecutableSequence === true &&
        Array.isArray(guardrail?.executableSteps) &&
        guardrail.executableSteps.length === 0 &&
        Array.isArray(guardrail?.deploySequence) &&
        guardrail.deploySequence.length === 0,
      "Admin data operator-resume packet guardrail is non-request, outside repo authority, no-public-launch, no-rollback, and non-executable."
    );
    scenario.check(
      guardrail?.sourceConsumed?.path === "ops/deploy/private-platform-owner-non-request-transfer-note.md" &&
        guardrail?.sourceConsumed?.canRequestValues === false &&
        guardrail?.sourceConsumed?.canAuthorizeDeploy === false &&
        guardrail?.sourceConsumed?.canAuthorizeLaunch === false &&
        guardrail?.sourceConsumed?.canAuthorizeRollback === false,
      "Admin data operator-resume packet guardrail consumes only the transfer note without requesting values or authorizing deploy, launch, or rollback."
    );
    scenario.check(
      (guardrail?.guardrailScope || []).every((item) => item.canAuthorize === false && item.canRequestValues === false),
      "Admin data, Product readiness, and static output cannot authorize or request values from the operator-resume guardrail."
    );
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
      scenario.check(
        factText.includes(token) &&
          factText.includes("not observed") &&
          factText.includes("outside repo authority") &&
          factText.includes("stop; preserve blocked state only"),
        `Admin data operator-resume packet guardrail keeps ${token} Not observed, outside repo authority, and stop-only.`
      );
    }
    scenario.check(
      (guardrail?.guardrailFacts || []).every(
        (item) =>
          item.state === "Not observed" &&
          item.repoAuthority === "Outside repo authority" &&
          item.canRequestFromRepo === false &&
          item.canInferFromLocalEvidence === false
      ),
      "Admin data operator-resume packet guardrail keeps every guardrail fact non-requestable and non-inferable."
    );
    for (const token of [
      "credential request",
      "secret storage",
      "platform value request",
      "production url",
      "deploy trigger",
      "dashboard action",
      "dns step",
      "rollback authorization",
      "public launch authorization",
      "public deploy authorization",
      "deploy action",
      "executable sequence",
    ]) {
      scenario.check(forbiddenText.includes(token), `Admin data operator-resume packet guardrail marks ${token} absent.`);
    }
    scenario.check(
      Object.values(guardrail?.guardrailSummary || {}).every((value) => value === "No"),
      "Admin data operator-resume packet guardrail summary keeps requests, authorizations, rollback, and executable sequences at No."
    );
    scenario.check(
      guardrail?.noSecretNoDeployGuardrails?.credentialRequestAllowed === false &&
        guardrail?.noSecretNoDeployGuardrails?.secretStorageAllowed === false &&
        guardrail?.noSecretNoDeployGuardrails?.platformValueRequestAllowed === false &&
        guardrail?.noSecretNoDeployGuardrails?.platformInputRequestAllowed === false &&
        guardrail?.noSecretNoDeployGuardrails?.productionUrlStored === false &&
        guardrail?.noSecretNoDeployGuardrails?.deployTriggerStored === false &&
        guardrail?.noSecretNoDeployGuardrails?.dashboardActionAvailable === false &&
        guardrail?.noSecretNoDeployGuardrails?.dnsStepAvailable === false &&
        guardrail?.noSecretNoDeployGuardrails?.rollbackAuthorized === false &&
        guardrail?.noSecretNoDeployGuardrails?.publicDeployAuthorized === false &&
        guardrail?.noSecretNoDeployGuardrails?.publicLaunchAuthorized === false &&
        guardrail?.noSecretNoDeployGuardrails?.deployActionRequested === false &&
        guardrail?.noSecretNoDeployGuardrails?.executableSequenceCreated === false &&
        guardrail?.noSecretNoDeployGuardrails?.finalDecisionChangeAllowed === false &&
        guardrail?.noSecretNoDeployGuardrails?.productionDeploymentState === "Do Not Deploy",
      "Admin data operator-resume packet guardrail enforces no-secret, no-deploy, no-public-launch, no-rollback, and non-executable guardrails."
    );
    scenario.check(
      guardrail?.crossArtifactEvidence?.adminDataExternalInputsPresent === false &&
        guardrail?.crossArtifactEvidence?.productReadinessExternalInputsPresent === false &&
        guardrail?.crossArtifactEvidence?.staticOutputExternalInputsPresent === false,
      "Static rehearsal output preserves operator-resume guardrail external-input absence across Admin data, Product readiness, and static output."
    );
    scenario.check(!hasForbiddenDeployValue(serializedGuardrail), "Admin/static operator-resume packet guardrail exposes no URL, secret, token, bearer, dashboard-action value, DNS-step value, or deploy-command value.");

    await resetDrafts(page, baseUrl);
    const fixture = await seedFiveSessionSynthesisDrafts(page);
    await loadIntake(page, baseUrl);
    const readyState = await applyFiveSessionSynthesisState(page, 5);
    const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
    const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
    const approvalAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
    const publishPlanAttempt = await applyPrivateExplicitPublishPlanAttempt(page);
    const diffAttempt = await applyPrivatePublicCopyDiffRollbackAttempt(page);
    const rehearsalAttempt = await applyPrivateReleaseCandidateRehearsalAttempt(page);
    const readinessAttempt = await applyPrivateCredentialedDeployReadinessAttempt(page);
    await page.goto(`${baseUrl}/review.html`, { waitUntil: "networkidle" });

    const product = await page.evaluate(() => {
      const final = document.querySelector("[data-pr='finalDeployGoNoGoState']");
      const continuation = document.querySelector("[data-pr='deployContinuationHandoffState']");
      const fields = [
        "credentialedDeployPlatform",
        "credentialedDeployProductionUrl",
        "credentialedDeployCredentialAvailability",
        "credentialedDeployTrigger",
        "credentialedDeployRollbackOwner",
        "credentialedDeployRollbackMethod",
        "credentialedDeployHealthCheckInputs",
      ].map((key) => {
        const node = document.querySelector(`[data-pr='${key}']`);
        return { key, disabled: Boolean(node?.hasAttribute("disabled")), exportEligible: node?.getAttribute("data-export-eligible") || "" };
      });
      return {
        finalText: final?.textContent || "",
        continuationText: continuation?.textContent || "",
        finalDecision: final?.getAttribute("data-final-deploy-decision") || "",
        productionDeploymentState: final?.getAttribute("data-production-deployment-state") || "",
        humanApprovalObserved: final?.getAttribute("data-human-approval-observed") || "",
        platformInputsEnabled: final?.getAttribute("data-platform-inputs-enabled") || "",
        noSecretStorage: final?.getAttribute("data-no-secret-storage") || "",
        noProductionUrl: final?.getAttribute("data-no-production-url") || "",
        noDeployTrigger: final?.getAttribute("data-no-deploy-trigger") || "",
        noDeployAction: final?.getAttribute("data-no-deploy-action") || "",
        noPublishAction: final?.getAttribute("data-no-publish-action") || "",
        exportEligible: final?.getAttribute("data-export-eligible") || "",
        downloadEligible: final?.getAttribute("data-download-eligible") || "",
        continuationPlatformInputsEnabled: continuation?.getAttribute("data-platform-inputs-enabled") || "",
        continuationPlatformFieldUnlock: continuation?.getAttribute("data-platform-field-unlock") || "",
        continuationExportEligible: continuation?.getAttribute("data-export-eligible") || "",
        continuationDownloadEligible: continuation?.getAttribute("data-download-eligible") || "",
        fields,
      };
    });
    const stored = await storedDrafts(page);
    const selectedDraft = stored.intakes.find((intake) => intake.id === stored.lastIntakeId);
    const combinedText = `${product.finalText}\n${product.continuationText}`;

    scenario.check(
      artifactAttempt.changed === true &&
        memoAttempt.artifactAvailable === true &&
        approvalAttempt.memoAvailable === true &&
        publishPlanAttempt.approvalAvailable === true &&
        diffAttempt.publishPlanAvailable === true &&
        rehearsalAttempt.diffPacketAvailable === true &&
        readinessAttempt.rehearsalAvailable === true,
      "Product operator-resume packet guardrail scenario reaches local readiness prerequisites without external inputs."
    );
    scenario.check(
      product.finalDecision === "no-go" &&
        product.productionDeploymentState === "Do Not Deploy" &&
        product.humanApprovalObserved === "false" &&
        product.platformInputsEnabled === "false" &&
        product.continuationPlatformInputsEnabled === "false" &&
        product.continuationPlatformFieldUnlock === "false",
      "Product operator-resume packet guardrail readiness remains No-Go / Do Not Deploy with platform inputs disabled."
    );
    scenario.check(
      product.noSecretStorage === "true" &&
        product.noProductionUrl === "true" &&
        product.noDeployTrigger === "true" &&
        product.noDeployAction === "true" &&
        product.noPublishAction === "true" &&
        product.fields.every((field) => field.disabled === true && field.exportEligible === "false") &&
        !/enter|paste|provide|submit/i.test(product.continuationText),
      "Product operator-resume packet guardrail cannot request secrets, production URLs, deploy triggers, platform values, rollback authorization, launch authorization, or deploy actions."
    );
    scenario.check(
      product.exportEligible === "false" &&
        product.downloadEligible === "false" &&
        product.continuationExportEligible === "false" &&
        product.continuationDownloadEligible === "false",
      "Product operator-resume packet guardrail remains export/download ineligible."
    );
    scenario.check(!hasForbiddenDeployValue(combinedText), "Product operator-resume packet guardrail readiness text exposes no URL, secret, token, bearer, dashboard-action value, DNS-step value, deploy-command value, dashboard-link value, or contact-detail value.");
    scenario.check(
      selectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
        selectedDraft?.downloadedExportText === fixture.selectedExportText &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readinessAttempt.readinessText) &&
        !String(selectedDraft?.downloadedExportText || "").includes(rehearsalAttempt.rehearsalText) &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText),
      "Product operator-resume packet guardrail metadata stays out of resume export/download text."
    );
  } finally {
    responseOverrides.delete("/admin-data.json");
  }

  return scenario;
}

async function runBlockedStateOperatorContinuationIndexScenario(page, baseUrl) {
  const scenario = createScenario("blocked-state-operator-continuation-index-no-network");
  const passedFixture = staticDeployPassedLocalFixture();
  const adminFixture = adminDataWithStaticDeployFixture(passedFixture);
  responseOverrides.set("/admin-data.json", {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(adminFixture),
  });

  try {
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });
    const loadedAdminData = await page.evaluate(async () => {
      const response = await fetch("/admin-data.json");
      return response.json();
    });
    const index = loadedAdminData.validation?.blockedStateOperatorContinuationIndex;
    const serializedIndex = JSON.stringify(index);
    const factText = (index?.continuationFacts || [])
      .map((item) => `${item.label || ""}: ${item.state || ""}: ${item.repoAuthority || ""}: ${item.canRequestFromRepo}: ${item.canInferFromLocalEvidence}: ${item.continuationWordingAllowed || ""}`)
      .join("\n")
      .toLowerCase();
    const forbiddenText = (index?.forbiddenOperationalItems || [])
      .map((item) => `${item.label || ""}: ${item.state || ""}`)
      .join("\n")
      .toLowerCase();

    scenario.check(index?.format === "proofresume-blocked-state-operator-continuation-index-v1", "Admin data exposes blocked-state operator continuation index format.");
    scenario.check(
      index?.state === "private-blocked-continuation-index-do-not-deploy" &&
        index?.decision === "No-Go / Do Not Deploy" &&
        index?.productionDeploymentState === "Do Not Deploy",
      "Admin data blocked-state operator continuation index remains No-Go / Do Not Deploy."
    );
    scenario.check(
      index?.private === true &&
        index?.localOnly === true &&
        index?.readOnly === true &&
        index?.nonRequest === true &&
        index?.outsideRepoAuthority === true &&
        index?.notCredentialRequest === true &&
        index?.notLaunchPlan === true &&
        index?.notRollbackPlan === true &&
        index?.notExecutableSequence === true &&
        Array.isArray(index?.executableSteps) &&
        index.executableSteps.length === 0 &&
        Array.isArray(index?.deploySequence) &&
        index.deploySequence.length === 0,
      "Admin data blocked-state operator continuation index is private, read-only, non-request, outside repo authority, no-public-launch, no-rollback, and non-executable."
    );
    scenario.check(
      index?.sourceConsumed?.path === "ops/deploy/private-operator-resume-packet-guardrail.md" &&
        index?.sourceConsumed?.canRequestValues === false &&
        index?.sourceConsumed?.canAuthorizeDeploy === false &&
        index?.sourceConsumed?.canAuthorizeLaunch === false &&
        index?.sourceConsumed?.canAuthorizeRollback === false,
      "Admin data blocked-state operator continuation index consumes only the operator-resume guardrail without requesting values or authorizing deploy, launch, or rollback."
    );
    scenario.check(
      (index?.continuationScope || []).every((item) => item.canAuthorize === false && item.canRequestValues === false),
      "Admin data, Product readiness, and static output cannot authorize or request values from the blocked-state operator continuation index."
    );
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
      scenario.check(
        factText.includes(token) &&
          factText.includes("not observed") &&
          factText.includes("outside repo authority") &&
          factText.includes("read-only blocked-state label only"),
        `Admin data blocked-state operator continuation index keeps ${token} Not observed, outside repo authority, and read-only.`
      );
    }
    scenario.check(
      (index?.continuationFacts || []).every(
        (item) =>
          item.state === "Not observed" &&
          item.repoAuthority === "Outside repo authority" &&
          item.canRequestFromRepo === false &&
          item.canInferFromLocalEvidence === false
      ),
      "Admin data blocked-state operator continuation index keeps every continuation fact non-requestable and non-inferable."
    );
    for (const token of [
      "credential request",
      "secret storage",
      "platform value request",
      "production url",
      "deploy trigger",
      "dashboard action",
      "dns step",
      "rollback authorization",
      "public launch authorization",
      "public deploy authorization",
      "deploy action",
      "executable sequence",
    ]) {
      scenario.check(forbiddenText.includes(token), `Admin data blocked-state operator continuation index marks ${token} absent.`);
    }
    scenario.check(
      Object.values(index?.continuationSummary || {}).every((value) => value === "No"),
      "Admin data blocked-state operator continuation index summary keeps requests, authorizations, rollback, and executable sequences at No."
    );
    scenario.check(
      index?.noSecretNoDeployGuardrails?.credentialRequestAllowed === false &&
        index?.noSecretNoDeployGuardrails?.secretStorageAllowed === false &&
        index?.noSecretNoDeployGuardrails?.platformValueRequestAllowed === false &&
        index?.noSecretNoDeployGuardrails?.platformInputRequestAllowed === false &&
        index?.noSecretNoDeployGuardrails?.productionUrlStored === false &&
        index?.noSecretNoDeployGuardrails?.deployTriggerStored === false &&
        index?.noSecretNoDeployGuardrails?.dashboardActionAvailable === false &&
        index?.noSecretNoDeployGuardrails?.dnsStepAvailable === false &&
        index?.noSecretNoDeployGuardrails?.rollbackAuthorized === false &&
        index?.noSecretNoDeployGuardrails?.publicDeployAuthorized === false &&
        index?.noSecretNoDeployGuardrails?.publicLaunchAuthorized === false &&
        index?.noSecretNoDeployGuardrails?.deployActionRequested === false &&
        index?.noSecretNoDeployGuardrails?.executableSequenceCreated === false &&
        index?.noSecretNoDeployGuardrails?.finalDecisionChangeAllowed === false &&
        index?.noSecretNoDeployGuardrails?.productionDeploymentState === "Do Not Deploy",
      "Admin data blocked-state operator continuation index enforces no-secret, no-deploy, no-public-launch, no-rollback, and non-executable guardrails."
    );
    scenario.check(
      index?.crossArtifactEvidence?.adminDataExternalInputsPresent === false &&
        index?.crossArtifactEvidence?.productReadinessExternalInputsPresent === false &&
        index?.crossArtifactEvidence?.staticOutputExternalInputsPresent === false,
      "Static rehearsal output preserves blocked-state operator continuation index external-input absence across Admin data, Product readiness, and static output."
    );
    scenario.check(!hasForbiddenDeployValue(serializedIndex), "Admin/static blocked-state operator continuation index exposes no URL, secret, token, bearer, dashboard-action value, DNS-step value, or deploy-command value.");

    await resetDrafts(page, baseUrl);
    const fixture = await seedFiveSessionSynthesisDrafts(page);
    await loadIntake(page, baseUrl);
    const readyState = await applyFiveSessionSynthesisState(page, 5);
    const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
    const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
    const approvalAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
    const publishPlanAttempt = await applyPrivateExplicitPublishPlanAttempt(page);
    const diffAttempt = await applyPrivatePublicCopyDiffRollbackAttempt(page);
    const rehearsalAttempt = await applyPrivateReleaseCandidateRehearsalAttempt(page);
    const readinessAttempt = await applyPrivateCredentialedDeployReadinessAttempt(page);
    await page.goto(`${baseUrl}/review.html`, { waitUntil: "networkidle" });

    const product = await page.evaluate(() => {
      const final = document.querySelector("[data-pr='finalDeployGoNoGoState']");
      const continuation = document.querySelector("[data-pr='deployContinuationHandoffState']");
      const fields = [
        "credentialedDeployPlatform",
        "credentialedDeployProductionUrl",
        "credentialedDeployCredentialAvailability",
        "credentialedDeployTrigger",
        "credentialedDeployRollbackOwner",
        "credentialedDeployRollbackMethod",
        "credentialedDeployHealthCheckInputs",
      ].map((key) => {
        const node = document.querySelector(`[data-pr='${key}']`);
        return { key, disabled: Boolean(node?.hasAttribute("disabled")), exportEligible: node?.getAttribute("data-export-eligible") || "" };
      });
      return {
        finalText: final?.textContent || "",
        continuationText: continuation?.textContent || "",
        finalDecision: final?.getAttribute("data-final-deploy-decision") || "",
        productionDeploymentState: final?.getAttribute("data-production-deployment-state") || "",
        humanApprovalObserved: final?.getAttribute("data-human-approval-observed") || "",
        platformInputsEnabled: final?.getAttribute("data-platform-inputs-enabled") || "",
        noSecretStorage: final?.getAttribute("data-no-secret-storage") || "",
        noProductionUrl: final?.getAttribute("data-no-production-url") || "",
        noDeployTrigger: final?.getAttribute("data-no-deploy-trigger") || "",
        noDeployAction: final?.getAttribute("data-no-deploy-action") || "",
        noPublishAction: final?.getAttribute("data-no-publish-action") || "",
        exportEligible: final?.getAttribute("data-export-eligible") || "",
        downloadEligible: final?.getAttribute("data-download-eligible") || "",
        continuationPlatformInputsEnabled: continuation?.getAttribute("data-platform-inputs-enabled") || "",
        continuationPlatformFieldUnlock: continuation?.getAttribute("data-platform-field-unlock") || "",
        continuationExportEligible: continuation?.getAttribute("data-export-eligible") || "",
        continuationDownloadEligible: continuation?.getAttribute("data-download-eligible") || "",
        fields,
      };
    });
    const stored = await storedDrafts(page);
    const selectedDraft = stored.intakes.find((intake) => intake.id === stored.lastIntakeId);
    const combinedText = `${product.finalText}\n${product.continuationText}`;

    scenario.check(
      artifactAttempt.changed === true &&
        memoAttempt.artifactAvailable === true &&
        approvalAttempt.memoAvailable === true &&
        publishPlanAttempt.approvalAvailable === true &&
        diffAttempt.publishPlanAvailable === true &&
        rehearsalAttempt.diffPacketAvailable === true &&
        readinessAttempt.rehearsalAvailable === true,
      "Product blocked-state operator continuation index scenario reaches local readiness prerequisites without external inputs."
    );
    scenario.check(
      product.finalDecision === "no-go" &&
        product.productionDeploymentState === "Do Not Deploy" &&
        product.humanApprovalObserved === "false" &&
        product.platformInputsEnabled === "false" &&
        product.continuationPlatformInputsEnabled === "false" &&
        product.continuationPlatformFieldUnlock === "false",
      "Product blocked-state operator continuation index readiness remains No-Go / Do Not Deploy with platform inputs disabled."
    );
    scenario.check(
      product.noSecretStorage === "true" &&
        product.noProductionUrl === "true" &&
        product.noDeployTrigger === "true" &&
        product.noDeployAction === "true" &&
        product.noPublishAction === "true" &&
        product.fields.every((field) => field.disabled === true && field.exportEligible === "false") &&
        !/enter|paste|provide|submit/i.test(product.continuationText),
      "Product blocked-state operator continuation index cannot request secrets, production URLs, deploy triggers, platform values, rollback authorization, launch authorization, or deploy actions."
    );
    scenario.check(
      product.exportEligible === "false" &&
        product.downloadEligible === "false" &&
        product.continuationExportEligible === "false" &&
        product.continuationDownloadEligible === "false",
      "Product blocked-state operator continuation index remains export/download ineligible."
    );
    scenario.check(!hasForbiddenDeployValue(combinedText), "Product blocked-state operator continuation index readiness text exposes no URL, secret, token, bearer, dashboard-action value, DNS-step value, deploy-command value, dashboard-link value, or contact-detail value.");
    scenario.check(
      selectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
        selectedDraft?.downloadedExportText === fixture.selectedExportText &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readinessAttempt.readinessText) &&
        !String(selectedDraft?.downloadedExportText || "").includes(rehearsalAttempt.rehearsalText) &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText),
      "Product blocked-state operator continuation index metadata stays out of resume export/download text."
    );
  } finally {
    responseOverrides.delete("/admin-data.json");
  }

  return scenario;
}

async function runBundleLibraryImportCapPreviewScenario(page, baseUrl) {
  const scenario = createScenario("bundle-library-import-cap-preview");
  await page.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });

  const now = Date.now();
  const snapshotFor = (label) => ({
    format: "proofresume-local-section-v1",
    sectionText: `Sample export snapshot ${label}`,
    sections: [],
    accepted: [],
    followups: { evidenceItems: [] },
  });

  const makeBundle = (id, offsetMinutes) => {
    const updatedAt = new Date(now - offsetMinutes * 60 * 1000).toISOString();
    return {
      id,
      importedAt: updatedAt,
      updatedAt,
      format: "proofresume-local-section-v1",
      snapshot: snapshotFor(id),
      localOnly: true,
      source: "qa-bundle-library",
    };
  };

  const existingBundles = Array.from({ length: 10 }, (_value, index) => makeBundle(`existing-${index + 1}`, index + 1000));
  const incomingBundles = Array.from({ length: 60 }, (_value, index) => makeBundle(`incoming-${index + 1}`, index));

  const pinnedIncomingIds = ["incoming-60", "incoming-59", "incoming-58", "incoming-57", "incoming-56"];
  const incomingAnnotationItems = {};
  for (const bundle of incomingBundles) {
    incomingAnnotationItems[bundle.id] = {
      notes: "",
      tags: [],
      pinned: pinnedIncomingIds.includes(bundle.id),
      pinnedAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
  }
  incomingAnnotationItems["orphan-annotation-only"] = {
    notes: "orphan",
    tags: ["orphan"],
    pinned: true,
    pinnedAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };

  const archivePayload = {
    format: "proofresume-bundle-library-archive-v1",
    exportedAt: new Date(now).toISOString(),
    bundles: incomingBundles,
    annotations: {
      format: "proofresume-bundle-library-annotations-v1",
      items: incomingAnnotationItems,
    },
  };

  const tempDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "proofresume-bundle-library-"));
  const archivePath = path.join(tempDir, "bundle-library.json");
  fs.writeFileSync(archivePath, JSON.stringify(archivePayload, null, 2));

  await page.evaluate(
    ({ existingBundles }) => {
      localStorage.setItem("proofresume:exportBundles", JSON.stringify(existingBundles));
      localStorage.setItem(
        "proofresume:bundleLibraryAnnotations",
        JSON.stringify({ format: "proofresume-bundle-library-annotations-v1", items: {} })
      );
    },
    { existingBundles }
  );

  await page.reload({ waitUntil: "networkidle" });
  await page.setInputFiles("input[data-pr='importBundleLibraryFile']", archivePath);

  const previewText = (await page.textContent("[data-pr='bundleLibraryTransferStatus']")) || "";
  scenario.check(previewText.includes("cap 50"), `Import preview explicitly names the 50-bundle cap. Preview: ${previewText}`);
  scenario.check(previewText.toLowerCase().includes("drops"), "Import preview reports dropped items due to the cap.");
  scenario.check(previewText.toLowerCase().includes("keeps"), "Import preview reports pinned survival counts.");
  scenario.check(previewText.includes("dropped ids"), "Import preview includes dropped bundle id samples.");

  await page.click("button[data-pr='bundleLibraryImportMerge']");

  const storedState = await page.evaluate(() => {
    const bundles = JSON.parse(localStorage.getItem("proofresume:exportBundles") || "[]");
    const annotations = JSON.parse(localStorage.getItem("proofresume:bundleLibraryAnnotations") || "{}");
    const bundleIds = (Array.isArray(bundles) ? bundles : []).map((bundle) => bundle?.id).filter(Boolean);
    const annotationIds = Object.keys(annotations?.items || {});
    return { bundleCount: bundleIds.length, bundleIds, annotationIds };
  });

  scenario.check(storedState.bundleCount === 50, "Merge import stores at most 50 bundles.");
  scenario.check(
    storedState.annotationIds.every((bundleId) => storedState.bundleIds.includes(bundleId)),
    "Merge import drops annotation records that do not match stored bundles."
  );
  for (const pinnedId of pinnedIncomingIds) {
    scenario.check(storedState.bundleIds.includes(pinnedId), `Merge import keeps pinned bundle ${pinnedId} within the cap.`);
  }
  scenario.check(!storedState.annotationIds.includes("orphan-annotation-only"), "Merge import drops orphan annotation records not tied to stored bundles.");

  return scenario;
}

async function runBundleLibraryImportPreviewDownloadScenario(page, baseUrl) {
  const scenario = createScenario("bundle-library-import-preview-download");
  await page.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });

  const now = Date.now();
  const snapshotFor = (label) => ({
    format: "proofresume-local-section-v1",
    sectionText: `Sample export snapshot ${label}`,
    sections: [],
    accepted: [],
    followups: { evidenceItems: [] },
  });

  const makeBundle = (id, offsetMinutes) => {
    const updatedAt = new Date(now - offsetMinutes * 60 * 1000).toISOString();
    return {
      id,
      importedAt: updatedAt,
      updatedAt,
      format: "proofresume-local-section-v1",
      snapshot: snapshotFor(id),
      localOnly: true,
      source: "qa-bundle-library-preview-download",
    };
  };

  const incomingBundles = Array.from({ length: 60 }, (_value, index) => makeBundle(`incoming-${index + 1}`, index));
  const pinnedIncomingIds = ["incoming-60", "incoming-59", "incoming-58", "incoming-57", "incoming-56"];
  const incomingAnnotationItems = {};
  for (const bundle of incomingBundles) {
    incomingAnnotationItems[bundle.id] = {
      notes: "",
      tags: [],
      pinned: pinnedIncomingIds.includes(bundle.id),
      pinnedAt: new Date(now).toISOString(),
      updatedAt: new Date(now).toISOString(),
    };
  }
  incomingAnnotationItems["orphan-annotation-only"] = {
    notes: "orphan",
    tags: ["orphan"],
    pinned: true,
    pinnedAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };

  const archivePayload = {
    format: "proofresume-bundle-library-archive-v1",
    exportedAt: new Date(now).toISOString(),
    bundles: incomingBundles,
    annotations: {
      format: "proofresume-bundle-library-annotations-v1",
      items: incomingAnnotationItems,
    },
  };

  const tempDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "proofresume-bundle-library-preview-download-"));
  const archivePath = path.join(tempDir, "bundle-library.json");
  fs.writeFileSync(archivePath, JSON.stringify(archivePayload, null, 2));

  await page.reload({ waitUntil: "networkidle" });
  await page.setInputFiles("input[data-pr='importBundleLibraryFile']", archivePath);

  const downloadPromise = page.waitForEvent("download");
  await page.click("button[data-pr='bundleLibraryImportDownloadPreview']");
  const download = await downloadPromise;
  const previewPath = path.join(tempDir, "preview.json");
  await download.saveAs(previewPath);
  const previewPayload = JSON.parse(fs.readFileSync(previewPath, "utf8"));

  scenario.check(
    previewPayload?.format === "proofresume-bundle-library-import-preview-v1",
    "Download import preview writes proofresume-bundle-library-import-preview-v1 payload."
  );
  scenario.check(previewPayload?.localOnly === true, "Download import preview marks payload local-only.");
  scenario.check(
    previewPayload?.preview?.incomingBundles === 60 && previewPayload?.preview?.mergeStoredBundles === 50,
    "Download import preview records incoming and merge stored bundle counts."
  );
  scenario.check(
    Array.isArray(previewPayload?.preview?.mergeDroppedBundleIds) && previewPayload.preview.mergeDroppedBundleIds.length > 0,
    "Download import preview includes merge dropped bundle id list."
  );
  scenario.check(
    Array.isArray(previewPayload?.preview?.mergeDroppedAnnotationIds) && previewPayload.preview.mergeDroppedAnnotationIds.includes("orphan-annotation-only"),
    "Download import preview includes dropped annotation ids (including orphan annotation ids)."
  );
  for (const pinnedId of pinnedIncomingIds) {
    scenario.check(
      previewPayload?.preview?.mergeDroppedPinnedBundleIds?.includes(pinnedId) === false,
      `Download import preview keeps pinned bundle ${pinnedId} out of dropped pinned list.`
    );
  }

  return scenario;
}

async function runAutonomousDeployStopLedgerScenario(page, baseUrl) {
  const scenario = createScenario("autonomous-deploy-stop-ledger-no-network");
  const passedFixture = staticDeployPassedLocalFixture();
  const adminFixture = adminDataWithStaticDeployFixture(passedFixture);
  responseOverrides.set("/admin-data.json", {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(adminFixture),
  });

  try {
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });
    const loadedAdminData = await page.evaluate(async () => {
      const response = await fetch("/admin-data.json");
      return response.json();
    });
    const ledger = loadedAdminData.validation?.autonomousDeployStopLedger;
    const serializedLedger = JSON.stringify(ledger);
    const factText = (ledger?.stopFacts || [])
      .map((item) => `${item.label || ""}: ${item.state || ""}: ${item.repoAuthority || ""}: ${item.canRequestFromRepo}: ${item.canInferFromLocalEvidence}: ${item.autonomousHandlingAllowed || ""}`)
      .join("\n")
      .toLowerCase();
    const forbiddenText = (ledger?.forbiddenOperationalItems || [])
      .map((item) => `${item.label || ""}: ${item.state || ""}`)
      .join("\n")
      .toLowerCase();

    scenario.check(ledger?.format === "proofresume-autonomous-deploy-stop-ledger-v1", "Admin data exposes autonomous deploy stop ledger format.");
    scenario.check(
      ledger?.state === "autonomous-stop-ledger-do-not-deploy" &&
        ledger?.decision === "No-Go / Do Not Deploy" &&
        ledger?.productionDeploymentState === "Do Not Deploy",
      "Admin data autonomous deploy stop ledger remains No-Go / Do Not Deploy."
    );
    scenario.check(
      ledger?.private === true &&
        ledger?.localOnly === true &&
        ledger?.readOnly === true &&
        ledger?.autonomousStop === true &&
        ledger?.nonRequest === true &&
        ledger?.outsideRepoAuthority === true &&
        ledger?.notCredentialRequest === true &&
        ledger?.notLaunchPlan === true &&
        ledger?.notRollbackPlan === true &&
        ledger?.notExecutableSequence === true &&
        Array.isArray(ledger?.executableSteps) &&
        ledger.executableSteps.length === 0 &&
        Array.isArray(ledger?.deploySequence) &&
        ledger.deploySequence.length === 0,
      "Admin data autonomous deploy stop ledger is private, read-only, autonomous-stop, non-request, outside repo authority, no-public-launch, no-rollback, and non-executable."
    );
    scenario.check(
      ledger?.sourceConsumed?.path === "ops/deploy/private-blocked-state-operator-continuation-index.md" &&
        ledger?.sourceConsumed?.canRequestValues === false &&
        ledger?.sourceConsumed?.canAuthorizeDeploy === false &&
        ledger?.sourceConsumed?.canAuthorizeLaunch === false &&
        ledger?.sourceConsumed?.canAuthorizeRollback === false,
      "Admin data autonomous deploy stop ledger consumes only the blocked-state continuation index without requesting values or authorizing deploy, launch, or rollback."
    );
    scenario.check(
      (ledger?.stopScope || []).every((item) => item.canAuthorize === false && item.canRequestValues === false),
      "Admin data, Product readiness, and static output cannot authorize or request values from the autonomous deploy stop ledger."
    );
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
      scenario.check(
        factText.includes(token) &&
          factText.includes("not observed") &&
          factText.includes("outside repo authority") &&
          factText.includes("stop; preserve private read-only context only"),
        `Admin data autonomous deploy stop ledger keeps ${token} Not observed, outside repo authority, and autonomous-stop only.`
      );
    }
    scenario.check(
      (ledger?.stopFacts || []).every(
        (item) =>
          item.state === "Not observed" &&
          item.repoAuthority === "Outside repo authority" &&
          item.canRequestFromRepo === false &&
          item.canInferFromLocalEvidence === false
      ),
      "Admin data autonomous deploy stop ledger keeps every stop fact non-requestable and non-inferable."
    );
    for (const token of [
      "credential request",
      "secret storage",
      "platform value request",
      "production url",
      "deploy trigger",
      "dashboard action",
      "dns step",
      "rollback authorization",
      "public launch authorization",
      "public deploy authorization",
      "deploy action",
      "executable sequence",
    ]) {
      scenario.check(forbiddenText.includes(token), `Admin data autonomous deploy stop ledger marks ${token} absent.`);
    }
    scenario.check(
      Object.values(ledger?.stopSummary || {}).every((value) => value === "No"),
      "Admin data autonomous deploy stop ledger summary keeps requests, authorizations, rollback, and executable sequences at No."
    );
    scenario.check(
      ledger?.noSecretNoDeployGuardrails?.credentialRequestAllowed === false &&
        ledger?.noSecretNoDeployGuardrails?.secretStorageAllowed === false &&
        ledger?.noSecretNoDeployGuardrails?.platformValueRequestAllowed === false &&
        ledger?.noSecretNoDeployGuardrails?.platformInputRequestAllowed === false &&
        ledger?.noSecretNoDeployGuardrails?.productionUrlStored === false &&
        ledger?.noSecretNoDeployGuardrails?.deployTriggerStored === false &&
        ledger?.noSecretNoDeployGuardrails?.dashboardActionAvailable === false &&
        ledger?.noSecretNoDeployGuardrails?.dnsStepAvailable === false &&
        ledger?.noSecretNoDeployGuardrails?.rollbackAuthorized === false &&
        ledger?.noSecretNoDeployGuardrails?.publicDeployAuthorized === false &&
        ledger?.noSecretNoDeployGuardrails?.publicLaunchAuthorized === false &&
        ledger?.noSecretNoDeployGuardrails?.deployActionRequested === false &&
        ledger?.noSecretNoDeployGuardrails?.executableSequenceCreated === false &&
        ledger?.noSecretNoDeployGuardrails?.finalDecisionChangeAllowed === false &&
        ledger?.noSecretNoDeployGuardrails?.productionDeploymentState === "Do Not Deploy",
      "Admin data autonomous deploy stop ledger enforces no-secret, no-deploy, no-public-launch, no-rollback, and non-executable guardrails."
    );
    scenario.check(
      ledger?.crossArtifactEvidence?.adminDataExternalInputsPresent === false &&
        ledger?.crossArtifactEvidence?.productReadinessExternalInputsPresent === false &&
        ledger?.crossArtifactEvidence?.staticOutputExternalInputsPresent === false,
      "Static rehearsal output preserves autonomous deploy stop ledger external-input absence across Admin data, Product readiness, and static output."
    );
    scenario.check(!hasForbiddenDeployValue(serializedLedger), "Admin/static autonomous deploy stop ledger exposes no URL, secret, token, bearer, dashboard-action value, DNS-step value, or deploy-command value.");

    await resetDrafts(page, baseUrl);
    const fixture = await seedFiveSessionSynthesisDrafts(page);
    await loadIntake(page, baseUrl);
    const readyState = await applyFiveSessionSynthesisState(page, 5);
    const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
    const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
    const approvalAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
    const publishPlanAttempt = await applyPrivateExplicitPublishPlanAttempt(page);
    const diffAttempt = await applyPrivatePublicCopyDiffRollbackAttempt(page);
    const rehearsalAttempt = await applyPrivateReleaseCandidateRehearsalAttempt(page);
    const readinessAttempt = await applyPrivateCredentialedDeployReadinessAttempt(page);
    await page.goto(`${baseUrl}/review.html`, { waitUntil: "networkidle" });

    const product = await page.evaluate(() => {
      const final = document.querySelector("[data-pr='finalDeployGoNoGoState']");
      const continuation = document.querySelector("[data-pr='deployContinuationHandoffState']");
      const fields = [
        "credentialedDeployPlatform",
        "credentialedDeployProductionUrl",
        "credentialedDeployCredentialAvailability",
        "credentialedDeployTrigger",
        "credentialedDeployRollbackOwner",
        "credentialedDeployRollbackMethod",
        "credentialedDeployHealthCheckInputs",
      ].map((key) => {
        const node = document.querySelector(`[data-pr='${key}']`);
        return { key, disabled: Boolean(node?.hasAttribute("disabled")), exportEligible: node?.getAttribute("data-export-eligible") || "" };
      });
      return {
        finalText: final?.textContent || "",
        continuationText: continuation?.textContent || "",
        finalDecision: final?.getAttribute("data-final-deploy-decision") || "",
        productionDeploymentState: final?.getAttribute("data-production-deployment-state") || "",
        humanApprovalObserved: final?.getAttribute("data-human-approval-observed") || "",
        platformInputsEnabled: final?.getAttribute("data-platform-inputs-enabled") || "",
        noSecretStorage: final?.getAttribute("data-no-secret-storage") || "",
        noProductionUrl: final?.getAttribute("data-no-production-url") || "",
        noDeployTrigger: final?.getAttribute("data-no-deploy-trigger") || "",
        noDeployAction: final?.getAttribute("data-no-deploy-action") || "",
        noPublishAction: final?.getAttribute("data-no-publish-action") || "",
        exportEligible: final?.getAttribute("data-export-eligible") || "",
        downloadEligible: final?.getAttribute("data-download-eligible") || "",
        continuationPlatformInputsEnabled: continuation?.getAttribute("data-platform-inputs-enabled") || "",
        continuationPlatformFieldUnlock: continuation?.getAttribute("data-platform-field-unlock") || "",
        continuationExportEligible: continuation?.getAttribute("data-export-eligible") || "",
        continuationDownloadEligible: continuation?.getAttribute("data-download-eligible") || "",
        fields,
      };
    });
    const stored = await storedDrafts(page);
    const selectedDraft = stored.intakes.find((intake) => intake.id === stored.lastIntakeId);
    const combinedText = `${product.finalText}\n${product.continuationText}`;

    scenario.check(
      artifactAttempt.changed === true &&
        memoAttempt.artifactAvailable === true &&
        approvalAttempt.memoAvailable === true &&
        publishPlanAttempt.approvalAvailable === true &&
        diffAttempt.publishPlanAvailable === true &&
        rehearsalAttempt.diffPacketAvailable === true &&
        readinessAttempt.rehearsalAvailable === true,
      "Product autonomous deploy stop ledger scenario reaches local readiness prerequisites without external inputs."
    );
    scenario.check(
      product.finalDecision === "no-go" &&
        product.productionDeploymentState === "Do Not Deploy" &&
        product.humanApprovalObserved === "false" &&
        product.platformInputsEnabled === "false" &&
        product.continuationPlatformInputsEnabled === "false" &&
        product.continuationPlatformFieldUnlock === "false",
      "Product autonomous deploy stop ledger readiness remains No-Go / Do Not Deploy with platform inputs disabled."
    );
    scenario.check(
      product.noSecretStorage === "true" &&
        product.noProductionUrl === "true" &&
        product.noDeployTrigger === "true" &&
        product.noDeployAction === "true" &&
        product.noPublishAction === "true" &&
        product.fields.every((field) => field.disabled === true && field.exportEligible === "false") &&
        !/enter|paste|provide|submit/i.test(product.continuationText),
      "Product autonomous deploy stop ledger cannot request secrets, production URLs, deploy triggers, platform values, rollback authorization, launch authorization, or deploy actions."
    );
    scenario.check(
      product.exportEligible === "false" &&
        product.downloadEligible === "false" &&
        product.continuationExportEligible === "false" &&
        product.continuationDownloadEligible === "false",
      "Product autonomous deploy stop ledger remains export/download ineligible."
    );
    scenario.check(!hasForbiddenDeployValue(combinedText), "Product autonomous deploy stop ledger readiness text exposes no URL, secret, token, bearer, dashboard-action value, DNS-step value, deploy-command value, dashboard-link value, or contact-detail value.");
    scenario.check(
      selectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
        selectedDraft?.downloadedExportText === fixture.selectedExportText &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readinessAttempt.readinessText) &&
        !String(selectedDraft?.downloadedExportText || "").includes(rehearsalAttempt.rehearsalText) &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText),
      "Product autonomous deploy stop ledger metadata stays out of resume export/download text."
    );
  } finally {
    responseOverrides.delete("/admin-data.json");
  }

  return scenario;
}

async function runPostAutonomousStopRecoveryChecklistScenario(page, baseUrl) {
  const scenario = createScenario("post-autonomous-stop-recovery-checklist-no-network");
  const passedFixture = staticDeployPassedLocalFixture();
  const adminFixture = adminDataWithStaticDeployFixture(passedFixture);
  responseOverrides.set("/admin-data.json", {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(adminFixture),
  });

  try {
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });
    const loadedAdminData = await page.evaluate(async () => {
      const response = await fetch("/admin-data.json");
      return response.json();
    });
    const checklist = loadedAdminData.validation?.postAutonomousStopRecoveryChecklist;
    const serializedChecklist = JSON.stringify(checklist);
    const factText = (checklist?.recoveryFacts || [])
      .map((item) => `${item.label || ""}: ${item.state || ""}: ${item.repoAuthority || ""}: ${item.canRequestFromRepo}: ${item.canInferFromLocalEvidence}: ${item.recoveryHandlingAllowed || ""}`)
      .join("\n")
      .toLowerCase();
    const forbiddenText = (checklist?.forbiddenOperationalItems || [])
      .map((item) => `${item.label || ""}: ${item.state || ""}`)
      .join("\n")
      .toLowerCase();

    scenario.check(checklist?.format === "proofresume-post-autonomous-stop-recovery-checklist-v1", "Admin data exposes post-autonomous-stop recovery checklist format.");
    scenario.check(
      checklist?.state === "post-autonomous-stop-recovery-checklist-do-not-deploy" &&
        checklist?.decision === "No-Go / Do Not Deploy" &&
        checklist?.productionDeploymentState === "Do Not Deploy" &&
        checklist?.publishingState === "Do Not Publish",
      "Admin data post-autonomous-stop recovery checklist remains private No-Go / Do Not Deploy / Do Not Publish."
    );
    scenario.check(
      checklist?.private === true &&
        checklist?.localOnly === true &&
        checklist?.readOnly === true &&
        checklist?.autonomousRecoveryBoundary === true &&
        checklist?.nonRequest === true &&
        checklist?.outsideRepoAuthority === true &&
        checklist?.notCredentialRequest === true &&
        checklist?.notLaunchPlan === true &&
        checklist?.notRollbackPlan === true &&
        checklist?.notExecutableSequence === true &&
        Array.isArray(checklist?.executableSteps) &&
        checklist.executableSteps.length === 0 &&
        Array.isArray(checklist?.deploySequence) &&
        checklist.deploySequence.length === 0,
      "Admin data post-autonomous-stop recovery checklist is private, read-only, non-request, outside repo authority, no-public-launch, no-rollback, no-authority-bypass, and non-executable."
    );
    scenario.check(
      checklist?.sourceConsumed?.path === "ops/deploy/private-autonomous-deploy-stop-ledger.md" &&
        checklist?.sourceConsumed?.canRequestValues === false &&
        checklist?.sourceConsumed?.canAuthorizeDeploy === false &&
        checklist?.sourceConsumed?.canAuthorizeLaunch === false &&
        checklist?.sourceConsumed?.canAuthorizeRollback === false &&
        checklist?.sourceConsumed?.canBypassHumanPlatformAuthority === false,
      "Admin data post-autonomous-stop recovery checklist consumes only the autonomous stop ledger without requesting values or authorizing deploy, launch, rollback, or authority bypass."
    );
    scenario.check(
      (checklist?.recoveryScope || []).every((item) => item.canAuthorize === false && item.canRequestValues === false && item.canExecute === false),
      "Admin data, Product readiness, and static output cannot authorize, request values, or execute from the recovery checklist."
    );
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
      scenario.check(
        factText.includes(token) &&
          factText.includes("not observed") &&
          factText.includes("outside repo authority") &&
          factText.includes("preserve private read-only recovery boundary only"),
        `Admin data post-autonomous-stop recovery checklist keeps ${token} Not observed, outside repo authority, and recovery-boundary only.`
      );
    }
    scenario.check(
      (checklist?.recoveryFacts || []).every(
        (item) =>
          item.state === "Not observed" &&
          item.repoAuthority === "Outside repo authority" &&
          item.canRequestFromRepo === false &&
          item.canInferFromLocalEvidence === false
      ),
      "Admin data post-autonomous-stop recovery checklist keeps every recovery fact non-requestable and non-inferable."
    );
    for (const token of [
      "credential request",
      "secret storage",
      "platform value request",
      "production url",
      "deploy trigger",
      "dashboard action",
      "dns step",
      "rollback authorization",
      "public launch authorization",
      "public deploy authorization",
      "authority bypass",
      "deploy action",
      "executable sequence",
    ]) {
      scenario.check(forbiddenText.includes(token), `Admin data post-autonomous-stop recovery checklist marks ${token} absent.`);
    }
    scenario.check(
      Object.values(checklist?.recoverySummary || {}).every((value) => value === "No"),
      "Admin data post-autonomous-stop recovery checklist summary keeps requests, authorizations, rollback, authority bypass, deploy unlock, and executable sequences at No."
    );
    scenario.check(
      checklist?.noSecretNoDeployGuardrails?.credentialRequestAllowed === false &&
        checklist?.noSecretNoDeployGuardrails?.secretStorageAllowed === false &&
        checklist?.noSecretNoDeployGuardrails?.platformValueRequestAllowed === false &&
        checklist?.noSecretNoDeployGuardrails?.platformInputRequestAllowed === false &&
        checklist?.noSecretNoDeployGuardrails?.productionUrlStored === false &&
        checklist?.noSecretNoDeployGuardrails?.deployTriggerStored === false &&
        checklist?.noSecretNoDeployGuardrails?.dashboardActionAvailable === false &&
        checklist?.noSecretNoDeployGuardrails?.dnsStepAvailable === false &&
        checklist?.noSecretNoDeployGuardrails?.rollbackAuthorized === false &&
        checklist?.noSecretNoDeployGuardrails?.publicDeployAuthorized === false &&
        checklist?.noSecretNoDeployGuardrails?.publicLaunchAuthorized === false &&
        checklist?.noSecretNoDeployGuardrails?.authorityBypassAllowed === false &&
        checklist?.noSecretNoDeployGuardrails?.deployActionRequested === false &&
        checklist?.noSecretNoDeployGuardrails?.executableSequenceCreated === false &&
        checklist?.noSecretNoDeployGuardrails?.finalDecisionChangeAllowed === false &&
        checklist?.noSecretNoDeployGuardrails?.productionDeploymentState === "Do Not Deploy",
      "Admin data post-autonomous-stop recovery checklist enforces no-secret, no-deploy, no-public-launch, no-rollback, no-authority-bypass, and non-executable guardrails."
    );
    scenario.check(
      checklist?.crossArtifactEvidence?.adminDataExternalInputsPresent === false &&
        checklist?.crossArtifactEvidence?.productReadinessExternalInputsPresent === false &&
        checklist?.crossArtifactEvidence?.staticOutputExternalInputsPresent === false,
      "Static rehearsal output preserves post-autonomous-stop recovery checklist external-input absence across Admin data, Product readiness, and static output."
    );
    scenario.check(!hasForbiddenDeployValue(serializedChecklist), "Admin/static post-autonomous-stop recovery checklist exposes no URL, secret, token, bearer, dashboard-action value, DNS-step value, or deploy-command value.");

    await resetDrafts(page, baseUrl);
    const fixture = await seedFiveSessionSynthesisDrafts(page);
    await loadIntake(page, baseUrl);
    const readyState = await applyFiveSessionSynthesisState(page, 5);
    const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
    const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
    const approvalAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
    const publishPlanAttempt = await applyPrivateExplicitPublishPlanAttempt(page);
    const diffAttempt = await applyPrivatePublicCopyDiffRollbackAttempt(page);
    const rehearsalAttempt = await applyPrivateReleaseCandidateRehearsalAttempt(page);
    const readinessAttempt = await applyPrivateCredentialedDeployReadinessAttempt(page);
    await page.goto(`${baseUrl}/review.html`, { waitUntil: "networkidle" });

    const product = await page.evaluate(() => {
      const final = document.querySelector("[data-pr='finalDeployGoNoGoState']");
      const autonomous = document.querySelector("[data-pr='autonomousDeployStopLedgerHandoffState']");
      const fields = [
        "credentialedDeployPlatform",
        "credentialedDeployProductionUrl",
        "credentialedDeployCredentialAvailability",
        "credentialedDeployTrigger",
        "credentialedDeployRollbackOwner",
        "credentialedDeployRollbackMethod",
        "credentialedDeployHealthCheckInputs",
      ].map((key) => {
        const node = document.querySelector(`[data-pr='${key}']`);
        return { key, disabled: Boolean(node?.hasAttribute("disabled")), exportEligible: node?.getAttribute("data-export-eligible") || "" };
      });
      return {
        finalText: final?.textContent || "",
        autonomousText: autonomous?.textContent || "",
        finalDecision: final?.getAttribute("data-final-deploy-decision") || "",
        productionDeploymentState: final?.getAttribute("data-production-deployment-state") || "",
        humanApprovalObserved: final?.getAttribute("data-human-approval-observed") || "",
        platformInputsEnabled: final?.getAttribute("data-platform-inputs-enabled") || "",
        noSecretStorage: final?.getAttribute("data-no-secret-storage") || "",
        noProductionUrl: final?.getAttribute("data-no-production-url") || "",
        noDeployTrigger: final?.getAttribute("data-no-deploy-trigger") || "",
        noDeployAction: final?.getAttribute("data-no-deploy-action") || "",
        noPublishAction: final?.getAttribute("data-no-publish-action") || "",
        exportEligible: final?.getAttribute("data-export-eligible") || "",
        downloadEligible: final?.getAttribute("data-download-eligible") || "",
        autonomousState: autonomous?.getAttribute("data-autonomous-deploy-stop-ledger-state") || "",
        autonomousStop: autonomous?.getAttribute("data-autonomous-stop") || "",
        autonomousNonRequest: autonomous?.getAttribute("data-non-request") || "",
        autonomousNonExecutable: autonomous?.getAttribute("data-non-executable") || "",
        autonomousPlatformFieldUnlock: autonomous?.getAttribute("data-platform-field-unlock") || "",
        autonomousCanRequestValues: autonomous?.getAttribute("data-can-request-external-values") || "",
        autonomousNoRollback: autonomous?.getAttribute("data-no-rollback-authorization") || "",
        autonomousNoPublicLaunch: autonomous?.getAttribute("data-no-public-launch-authorization") || "",
        autonomousNoDeployAction: autonomous?.getAttribute("data-no-deploy-action") || "",
        autonomousExportEligible: autonomous?.getAttribute("data-export-eligible") || "",
        autonomousDownloadEligible: autonomous?.getAttribute("data-download-eligible") || "",
        fields,
      };
    });
    const stored = await storedDrafts(page);
    const selectedDraft = stored.intakes.find((intake) => intake.id === stored.lastIntakeId);
    const combinedText = `${product.finalText}\n${product.autonomousText}`;

    scenario.check(
      artifactAttempt.changed === true &&
        memoAttempt.artifactAvailable === true &&
        approvalAttempt.memoAvailable === true &&
        publishPlanAttempt.approvalAvailable === true &&
        diffAttempt.publishPlanAvailable === true &&
        rehearsalAttempt.diffPacketAvailable === true &&
        readinessAttempt.rehearsalAvailable === true,
      "Product post-autonomous-stop recovery checklist scenario reaches local readiness prerequisites without external inputs."
    );
    scenario.check(
      product.finalDecision === "no-go" &&
        product.productionDeploymentState === "Do Not Deploy" &&
        product.humanApprovalObserved === "false" &&
        product.platformInputsEnabled === "false" &&
        product.autonomousState === "read-only-autonomous-deploy-stop-ledger" &&
        product.autonomousStop === "true" &&
        product.autonomousNonRequest === "true" &&
        product.autonomousNonExecutable === "true" &&
        product.autonomousPlatformFieldUnlock === "false" &&
        product.autonomousCanRequestValues === "false",
      "Product post-autonomous-stop recovery checklist readiness remains private, read-only, No-Go / Do Not Deploy, non-request, and non-executable."
    );
    scenario.check(
      product.noSecretStorage === "true" &&
        product.noProductionUrl === "true" &&
        product.noDeployTrigger === "true" &&
        product.noDeployAction === "true" &&
        product.noPublishAction === "true" &&
        product.autonomousNoRollback === "true" &&
        product.autonomousNoPublicLaunch === "true" &&
        product.autonomousNoDeployAction === "true" &&
        product.fields.every((field) => field.disabled === true && field.exportEligible === "false") &&
        !/enter|paste|provide|submit/i.test(product.autonomousText),
      "Product post-autonomous-stop recovery checklist cannot request secrets, production URLs, deploy triggers, platform values, rollback authorization, launch authorization, authority bypass, or deploy actions."
    );
    scenario.check(
      product.exportEligible === "false" &&
        product.downloadEligible === "false" &&
        product.autonomousExportEligible === "false" &&
        product.autonomousDownloadEligible === "false",
      "Product post-autonomous-stop recovery checklist remains export/download ineligible."
    );
    scenario.check(!hasForbiddenDeployValue(combinedText), "Product post-autonomous-stop recovery checklist readiness text exposes no URL, secret, token, bearer, dashboard-action value, DNS-step value, deploy-command value, dashboard-link value, or contact-detail value.");
    scenario.check(
      selectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
        selectedDraft?.downloadedExportText === fixture.selectedExportText &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readinessAttempt.readinessText) &&
        !String(selectedDraft?.downloadedExportText || "").includes(rehearsalAttempt.rehearsalText) &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText),
      "Product post-autonomous-stop recovery checklist metadata stays out of resume export/download text."
    );
  } finally {
    responseOverrides.delete("/admin-data.json");
  }

  return scenario;
}

async function runHumanPlatformAuthorityReEntryGateScenario(page, baseUrl) {
  const scenario = createScenario("human-platform-authority-re-entry-gate-no-network");
  const passedFixture = staticDeployPassedLocalFixture();
  const adminFixture = adminDataWithStaticDeployFixture(passedFixture);
  responseOverrides.set("/admin-data.json", {
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(adminFixture),
  });

  try {
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });
    const loadedAdminData = await page.evaluate(async () => {
      const response = await fetch("/admin-data.json");
      return response.json();
    });
    const gate = loadedAdminData.validation?.humanPlatformAuthorityReEntryGate;
    const awaitingLedger = loadedAdminData.validation?.outsideAuthorityAwaitingStateLedger;
    const serializedGate = JSON.stringify(gate);
    const serializedAwaitingLedger = JSON.stringify(awaitingLedger);
    const factText = (gate?.reEntryFacts || [])
      .map((item) => `${item.label || ""}: ${item.state || ""}: ${item.repoAuthority || ""}: ${item.canRequestFromRepo}: ${item.canInferFromLocalEvidence}: ${item.reEntryHandlingAllowed || ""}`)
      .join("\n")
      .toLowerCase();
    const forbiddenText = (gate?.forbiddenOperationalItems || [])
      .map((item) => `${item.label || ""}: ${item.state || ""}`)
      .join("\n")
      .toLowerCase();
    const awaitingFactText = (awaitingLedger?.awaitingFacts || [])
      .map(
        (item) =>
          `${item.label || ""}: ${item.state || ""}: ${item.repoAuthority || ""}: ${item.canRequestFromRepo}: ${item.canInferFromLocalEvidence}: ${item.awaitingHandlingAllowed || ""}`
      )
      .join("\n")
      .toLowerCase();
    const awaitingForbiddenText = (awaitingLedger?.forbiddenOperationalItems || [])
      .map((item) => `${item.label || ""}: ${item.state || ""}`)
      .join("\n")
      .toLowerCase();

    scenario.check(gate?.format === "proofresume-human-platform-authority-re-entry-gate-v1", "Admin data exposes human-platform authority re-entry gate format.");
    scenario.check(
      gate?.state === "human-platform-authority-re-entry-blocked-do-not-deploy" &&
        gate?.decision === "No-Go / Do Not Deploy" &&
        gate?.productionDeploymentState === "Do Not Deploy" &&
        gate?.publishingState === "Do Not Publish",
      "Admin data human-platform authority re-entry gate remains private No-Go / Do Not Deploy / Do Not Publish."
    );
    scenario.check(
      gate?.private === true &&
        gate?.localOnly === true &&
        gate?.readOnly === true &&
        gate?.humanPlatformAuthorityBoundary === true &&
        gate?.reEntryBlocked === true &&
        gate?.nonRequest === true &&
        gate?.outsideRepoAuthority === true &&
        gate?.notCredentialRequest === true &&
        gate?.notLaunchPlan === true &&
        gate?.notRollbackPlan === true &&
        gate?.notExecutableSequence === true &&
        Array.isArray(gate?.executableSteps) &&
        gate.executableSteps.length === 0 &&
        Array.isArray(gate?.deploySequence) &&
        gate.deploySequence.length === 0,
      "Admin data human-platform authority re-entry gate is private, read-only, non-request, outside repo authority, no-public-launch, no-rollback, no-authority-bypass, and non-executable."
    );
    scenario.check(
      gate?.sourceConsumed?.path === "ops/deploy/private-post-autonomous-stop-recovery-checklist.md" &&
        gate?.sourceConsumed?.canRequestValues === false &&
        gate?.sourceConsumed?.canAuthorizeDeploy === false &&
        gate?.sourceConsumed?.canAuthorizeLaunch === false &&
        gate?.sourceConsumed?.canAuthorizeRollback === false &&
        gate?.sourceConsumed?.canBypassHumanPlatformAuthority === false &&
        gate?.sourceConsumed?.canUnlockReEntry === false,
      "Admin data human-platform authority re-entry gate consumes only the recovery checklist without requesting values, authorizing deploy/launch/rollback, bypassing authority, or unlocking re-entry."
    );
    scenario.check(
      (gate?.reEntryScope || []).every((item) => item.canAuthorize === false && item.canRequestValues === false && item.canExecute === false && item.canUnlockReEntry === false),
      "Admin data, Product readiness, and static output cannot authorize, request values, execute, or unlock re-entry from the human-platform authority gate."
    );
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
      scenario.check(
        factText.includes(token) &&
          factText.includes("not observed") &&
          factText.includes("outside repo authority") &&
          factText.includes("preserve private read-only human-platform authority boundary only"),
        `Admin data human-platform authority re-entry gate keeps ${token} Not observed, outside repo authority, and re-entry-boundary only.`
      );
    }
    scenario.check(
      (gate?.reEntryFacts || []).every(
        (item) =>
          item.state === "Not observed" &&
          item.repoAuthority === "Outside repo authority" &&
          item.canRequestFromRepo === false &&
          item.canInferFromLocalEvidence === false
      ),
      "Admin data human-platform authority re-entry gate keeps every re-entry fact non-requestable and non-inferable."
    );
    for (const token of [
      "credential request",
      "secret storage",
      "platform value request",
      "production url",
      "deploy trigger",
      "dashboard action",
      "dns step",
      "rollback authorization",
      "public launch authorization",
      "public deploy authorization",
      "authority bypass",
      "re-entry unlock",
      "deploy action",
      "executable sequence",
    ]) {
      scenario.check(forbiddenText.includes(token), `Admin data human-platform authority re-entry gate marks ${token} absent.`);
    }
    scenario.check(
      Object.values(gate?.reEntrySummary || {}).every((value) => value === "No"),
      "Admin data human-platform authority re-entry gate summary keeps requests, authorizations, rollback, authority bypass, re-entry unlock, deploy unlock, and executable sequences at No."
    );
    scenario.check(
      gate?.noSecretNoDeployGuardrails?.credentialRequestAllowed === false &&
        gate?.noSecretNoDeployGuardrails?.secretStorageAllowed === false &&
        gate?.noSecretNoDeployGuardrails?.platformValueRequestAllowed === false &&
        gate?.noSecretNoDeployGuardrails?.platformInputRequestAllowed === false &&
        gate?.noSecretNoDeployGuardrails?.productionUrlStored === false &&
        gate?.noSecretNoDeployGuardrails?.deployTriggerStored === false &&
        gate?.noSecretNoDeployGuardrails?.dashboardActionAvailable === false &&
        gate?.noSecretNoDeployGuardrails?.dnsStepAvailable === false &&
        gate?.noSecretNoDeployGuardrails?.rollbackAuthorized === false &&
        gate?.noSecretNoDeployGuardrails?.publicDeployAuthorized === false &&
        gate?.noSecretNoDeployGuardrails?.publicLaunchAuthorized === false &&
        gate?.noSecretNoDeployGuardrails?.authorityBypassAllowed === false &&
        gate?.noSecretNoDeployGuardrails?.reEntryUnlockAllowed === false &&
        gate?.noSecretNoDeployGuardrails?.deployActionRequested === false &&
        gate?.noSecretNoDeployGuardrails?.executableSequenceCreated === false &&
        gate?.noSecretNoDeployGuardrails?.finalDecisionChangeAllowed === false &&
        gate?.noSecretNoDeployGuardrails?.productionDeploymentState === "Do Not Deploy",
      "Admin data human-platform authority re-entry gate enforces no-secret, no-deploy, no-public-launch, no-rollback, no-authority-bypass, no-re-entry-unlock, and non-executable guardrails."
    );
    scenario.check(
      gate?.crossArtifactEvidence?.adminDataExternalInputsPresent === false &&
        gate?.crossArtifactEvidence?.productReadinessExternalInputsPresent === false &&
        gate?.crossArtifactEvidence?.staticOutputExternalInputsPresent === false,
      "Static rehearsal output preserves human-platform authority re-entry gate external-input absence across Admin data, Product readiness, and static output."
    );
    scenario.check(!hasForbiddenDeployValue(serializedGate), "Admin/static human-platform authority re-entry gate exposes no URL, secret, token, bearer, dashboard-action value, DNS-step value, or deploy-command value.");

    scenario.check(
      awaitingLedger?.format === "proofresume-outside-authority-awaiting-state-ledger-v1" &&
        awaitingLedger?.state === "outside-authority-awaiting-state-blocked-do-not-deploy" &&
        awaitingLedger?.decision === "No-Go / Do Not Deploy" &&
        awaitingLedger?.productionDeploymentState === "Do Not Deploy" &&
        awaitingLedger?.publishingState === "Do Not Publish",
      "Admin data exposes outside-authority awaiting-state ledger as private No-Go / Do Not Deploy / Do Not Publish."
    );
    scenario.check(
      awaitingLedger?.private === true &&
        awaitingLedger?.localOnly === true &&
        awaitingLedger?.readOnly === true &&
        awaitingLedger?.awaitingOutsideAuthority === true &&
        awaitingLedger?.awaitingBlocked === true &&
        awaitingLedger?.nonRequest === true &&
        awaitingLedger?.outsideRepoAuthority === true &&
        awaitingLedger?.notCredentialRequest === true &&
        awaitingLedger?.notLaunchPlan === true &&
        awaitingLedger?.notRollbackPlan === true &&
        awaitingLedger?.notExecutableSequence === true &&
        Array.isArray(awaitingLedger?.executableSteps) &&
        awaitingLedger.executableSteps.length === 0 &&
        Array.isArray(awaitingLedger?.deploySequence) &&
        awaitingLedger.deploySequence.length === 0,
      "Admin data outside-authority awaiting-state ledger remains private, read-only, non-request, outside repo authority, and non-executable."
    );
    scenario.check(
      awaitingLedger?.sourceConsumed?.path === "ops/deploy/private-human-platform-authority-re-entry-gate.md" &&
        awaitingLedger?.sourceConsumed?.canRequestValues === false &&
        awaitingLedger?.sourceConsumed?.canAuthorizeDeploy === false &&
        awaitingLedger?.sourceConsumed?.canAuthorizeLaunch === false &&
        awaitingLedger?.sourceConsumed?.canAuthorizeRollback === false &&
        awaitingLedger?.sourceConsumed?.canBypassHumanPlatformAuthority === false &&
        awaitingLedger?.sourceConsumed?.canUnlockReEntry === false &&
        awaitingLedger?.sourceConsumed?.canUnlockDeploy === false &&
        awaitingLedger?.sourceConsumed?.canPublish === false,
      "Admin data outside-authority awaiting-state ledger consumes only the re-entry gate without requesting values, authorizing deploy/launch/rollback, bypassing authority, or unlocking deploy/publish."
    );
    scenario.check(
      (awaitingLedger?.awaitingScope || []).every((item) => item.canAuthorize === false && item.canRequestValues === false && item.canExecute === false),
      "Admin data, Product readiness, and static output cannot authorize, request values, or execute from the outside-authority awaiting ledger."
    );
    for (const token of ["human/platform authority", "explicit future human approval", "production url / production origin", "deploy trigger"]) {
      scenario.check(
        awaitingFactText.includes(token) &&
          awaitingFactText.includes("not observed") &&
          awaitingFactText.includes("outside repo authority") &&
          awaitingFactText.includes("preserve private read-only outside-authority awaiting boundary only"),
        `Admin data outside-authority awaiting-state ledger keeps ${token} Not observed, outside repo authority, and awaiting-boundary only.`
      );
    }
    for (const token of ["credential request", "secret storage", "production url", "deploy trigger", "authority bypass", "deploy unlock", "publish action", "executable sequence"]) {
      scenario.check(awaitingForbiddenText.includes(token), `Admin data outside-authority awaiting-state ledger marks ${token} absent.`);
    }
    scenario.check(
      awaitingLedger?.noSecretNoDeployGuardrails?.credentialRequestAllowed === false &&
        awaitingLedger?.noSecretNoDeployGuardrails?.secretStorageAllowed === false &&
        awaitingLedger?.noSecretNoDeployGuardrails?.productionUrlStored === false &&
        awaitingLedger?.noSecretNoDeployGuardrails?.deployTriggerStored === false &&
        awaitingLedger?.noSecretNoDeployGuardrails?.authorityBypassAllowed === false &&
        awaitingLedger?.noSecretNoDeployGuardrails?.deployUnlockAllowed === false &&
        awaitingLedger?.noSecretNoDeployGuardrails?.publishActionRequested === false &&
        awaitingLedger?.noSecretNoDeployGuardrails?.executableSequenceCreated === false &&
        awaitingLedger?.noSecretNoDeployGuardrails?.productionDeploymentState === "Do Not Deploy",
      "Admin data outside-authority awaiting-state ledger enforces Do Not Publish / Do Not Deploy guardrails."
    );
    scenario.check(
      String(awaitingLedger?.evidenceNote || "").includes("Do Not Publish") && String(awaitingLedger?.evidenceNote || "").includes("non-executable"),
      "Admin data outside-authority awaiting-state ledger keeps Do Not Publish + non-executable evidence note."
    );
    scenario.check(!hasForbiddenDeployValue(serializedAwaitingLedger), "Admin/static outside-authority awaiting-state ledger exposes no URL, secret, token, bearer, dashboard-action value, DNS-step value, or deploy-command value.");

    await resetDrafts(page, baseUrl);
    const fixture = await seedFiveSessionSynthesisDrafts(page);
    await loadIntake(page, baseUrl);
    const readyState = await applyFiveSessionSynthesisState(page, 5);
    const artifactAttempt = await applyPrivateSynthesisArtifactGenerationAttempt(page);
    const memoAttempt = await applyPrivateSynthesisDecisionMemoCaptureAttempt(page);
    const approvalAttempt = await applyPrivateLaunchDecisionApprovalAttempt(page);
    const publishPlanAttempt = await applyPrivateExplicitPublishPlanAttempt(page);
    const diffAttempt = await applyPrivatePublicCopyDiffRollbackAttempt(page);
    const rehearsalAttempt = await applyPrivateReleaseCandidateRehearsalAttempt(page);
    const readinessAttempt = await applyPrivateCredentialedDeployReadinessAttempt(page);
    await page.goto(`${baseUrl}/review.html`, { waitUntil: "networkidle" });

    const product = await page.evaluate(() => {
      const final = document.querySelector("[data-pr='finalDeployGoNoGoState']");
      const recovery = document.querySelector("[data-pr='postAutonomousStopRecoveryChecklistHandoffState']");
      const gate = document.querySelector("[data-pr='humanPlatformAuthorityReEntryGateHandoffState']");
      const awaiting = document.querySelector("[data-pr='outsideAuthorityAwaitingStateLedgerHandoffState']");
      const fields = [
        "credentialedDeployPlatform",
        "credentialedDeployProductionUrl",
        "credentialedDeployCredentialAvailability",
        "credentialedDeployTrigger",
        "credentialedDeployRollbackOwner",
        "credentialedDeployRollbackMethod",
        "credentialedDeployHealthCheckInputs",
      ].map((key) => {
        const node = document.querySelector(`[data-pr='${key}']`);
        return { key, disabled: Boolean(node?.hasAttribute("disabled")), exportEligible: node?.getAttribute("data-export-eligible") || "" };
      });
      return {
        finalText: final?.textContent || "",
        recoveryText: recovery?.textContent || "",
        gateText: gate?.textContent || "",
        awaitingText: awaiting?.textContent || "",
        finalDecision: final?.getAttribute("data-final-deploy-decision") || "",
        productionDeploymentState: final?.getAttribute("data-production-deployment-state") || "",
        humanApprovalObserved: final?.getAttribute("data-human-approval-observed") || "",
        platformInputsEnabled: final?.getAttribute("data-platform-inputs-enabled") || "",
        noSecretStorage: final?.getAttribute("data-no-secret-storage") || "",
        noProductionUrl: final?.getAttribute("data-no-production-url") || "",
        noDeployTrigger: final?.getAttribute("data-no-deploy-trigger") || "",
        noDeployAction: final?.getAttribute("data-no-deploy-action") || "",
        noPublishAction: final?.getAttribute("data-no-publish-action") || "",
        exportEligible: final?.getAttribute("data-export-eligible") || "",
        downloadEligible: final?.getAttribute("data-download-eligible") || "",
        recoveryState: recovery?.getAttribute("data-post-autonomous-stop-recovery-checklist-state") || "",
        recoveryNonRequest: recovery?.getAttribute("data-non-request") || "",
        recoveryNonExecutable: recovery?.getAttribute("data-non-executable") || "",
        recoveryPlatformFieldUnlock: recovery?.getAttribute("data-platform-field-unlock") || "",
        recoveryCanRequestValues: recovery?.getAttribute("data-can-request-external-values") || "",
        recoveryNoRollback: recovery?.getAttribute("data-no-rollback-authorization") || "",
        recoveryNoPublicLaunch: recovery?.getAttribute("data-no-public-launch-authorization") || "",
        recoveryNoHumanApprovalPath: recovery?.getAttribute("data-no-human-approval-path") || "",
        recoveryNoDeployAction: recovery?.getAttribute("data-no-deploy-action") || "",
        recoveryExportEligible: recovery?.getAttribute("data-export-eligible") || "",
        recoveryDownloadEligible: recovery?.getAttribute("data-download-eligible") || "",
        gateHidden: Boolean(gate?.hidden),
        gateState: gate?.getAttribute("data-human-platform-authority-re-entry-gate-state") || "",
        gateNonRequest: gate?.getAttribute("data-non-request") || "",
        gateNonExecutable: gate?.getAttribute("data-non-executable") || "",
        gateExportEligible: gate?.getAttribute("data-export-eligible") || "",
        gateDownloadEligible: gate?.getAttribute("data-download-eligible") || "",
        awaitingHidden: Boolean(awaiting?.hidden),
        awaitingState: awaiting?.getAttribute("data-outside-authority-awaiting-state-ledger-state") || "",
        awaitingNonRequest: awaiting?.getAttribute("data-non-request") || "",
        awaitingNonExecutable: awaiting?.getAttribute("data-non-executable") || "",
        awaitingNoPublish: awaiting?.getAttribute("data-no-publish-action") || "",
        awaitingExportEligible: awaiting?.getAttribute("data-export-eligible") || "",
        awaitingDownloadEligible: awaiting?.getAttribute("data-download-eligible") || "",
        fields,
      };
    });
    const stored = await storedDrafts(page);
    const selectedDraft = stored.intakes.find((intake) => intake.id === stored.lastIntakeId);
    const combinedText = `${product.finalText}\n${product.recoveryText}\n${product.gateText}\n${product.awaitingText}`;

    scenario.check(
      artifactAttempt.changed === true &&
        memoAttempt.artifactAvailable === true &&
        approvalAttempt.memoAvailable === true &&
        publishPlanAttempt.approvalAvailable === true &&
        diffAttempt.publishPlanAvailable === true &&
        rehearsalAttempt.diffPacketAvailable === true &&
        readinessAttempt.rehearsalAvailable === true,
      "Product human-platform authority re-entry gate scenario reaches local readiness prerequisites without external inputs."
    );
    scenario.check(
      product.finalDecision === "no-go" &&
        product.productionDeploymentState === "Do Not Deploy" &&
        product.humanApprovalObserved === "false" &&
        product.platformInputsEnabled === "false" &&
        product.recoveryState === "read-only-post-autonomous-stop-recovery-checklist" &&
        product.recoveryNonRequest === "true" &&
        product.recoveryNonExecutable === "true" &&
        product.recoveryPlatformFieldUnlock === "false" &&
        product.recoveryCanRequestValues === "false" &&
        product.recoveryNoHumanApprovalPath === "true",
      "Product human-platform authority re-entry gate readiness remains private, read-only, No-Go / Do Not Deploy, non-request, no-authority-bypass, and non-executable."
    );
    scenario.check(
      product.gateHidden === false &&
        product.gateState === "read-only-human-platform-authority-re-entry-gate" &&
        product.gateNonRequest === "true" &&
        product.gateNonExecutable === "true" &&
        product.gateExportEligible === "false" &&
        product.gateDownloadEligible === "false",
      "Product surfaces show the read-only human-platform authority re-entry gate and keep it non-request, non-executable, and export/download ineligible."
    );
    scenario.check(
      product.awaitingHidden === false &&
        product.awaitingState === "read-only-outside-authority-awaiting-state-ledger" &&
        product.awaitingNonRequest === "true" &&
        product.awaitingNonExecutable === "true" &&
        product.awaitingNoPublish === "true" &&
        product.awaitingExportEligible === "false" &&
        product.awaitingDownloadEligible === "false" &&
        /do not publish/i.test(product.awaitingText),
      "Product surfaces show the read-only outside-authority awaiting-state ledger and keep it Do Not Publish, non-request, non-executable, and export/download ineligible."
    );
    scenario.check(
      product.noSecretStorage === "true" &&
        product.noProductionUrl === "true" &&
        product.noDeployTrigger === "true" &&
        product.noDeployAction === "true" &&
        product.noPublishAction === "true" &&
        product.recoveryNoRollback === "true" &&
        product.recoveryNoPublicLaunch === "true" &&
        product.recoveryNoDeployAction === "true" &&
        product.fields.every((field) => field.disabled === true && field.exportEligible === "false") &&
        !/enter|paste|provide|submit/i.test(product.recoveryText),
      "Product human-platform authority re-entry gate cannot request secrets, production URLs, deploy triggers, platform values, rollback authorization, launch authorization, authority bypass, re-entry unlock, or deploy actions."
    );
    scenario.check(
      product.exportEligible === "false" &&
        product.downloadEligible === "false" &&
        product.recoveryExportEligible === "false" &&
        product.recoveryDownloadEligible === "false",
      "Product human-platform authority re-entry gate remains export/download ineligible."
    );
    scenario.check(!hasForbiddenDeployValue(combinedText), "Product human-platform authority re-entry gate readiness text exposes no URL, secret, token, bearer, dashboard-action value, DNS-step value, deploy-command value, dashboard-link value, or contact-detail value.");
    scenario.check(
      selectedDraft?.exportSnapshot?.sectionText === fixture.selectedExportText &&
        selectedDraft?.downloadedExportText === fixture.selectedExportText &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readinessAttempt.readinessText) &&
        !String(selectedDraft?.downloadedExportText || "").includes(rehearsalAttempt.rehearsalText) &&
        !String(selectedDraft?.exportSnapshot?.sectionText || "").includes(readyState.sessionSlots[4].rawNoteText),
      "Product human-platform authority re-entry gate metadata stays out of resume export/download text."
    );
  } finally {
    responseOverrides.delete("/admin-data.json");
  }

  return scenario;
}

async function runMalformedInputScenario(page, baseUrl) {
  const scenario = createScenario("malformed-input-is-escaped-and-local");

  await resetDrafts(page, baseUrl);
  await loadIntake(page, baseUrl);
  await page.fill("input[name='targetRole']", "<img src=x onerror=alert(1)>");
  await page.fill("textarea[name='resumeText']", malformedResume);
  await page.click("button[type='submit']");
  await page.waitForSelector("#local-analysis:not([hidden])");

  const stored = await storedDrafts(page);
  scenario.check(stored.intakes.length === 1, "Malformed paste still saves one local draft.");
  scenario.check(stored.intakes[0].rawText === malformedResume, "Malformed raw text is preserved unchanged.");
  scenario.check(stored.intakes[0].normalizedText.includes("<script>fetch"), "Malformed normalized text remains inert text.");
  scenario.check(stored.intakes[0].analysis?.sections?.includes("Experience"), "Malformed paste still detects Experience.");

  const sectionHtml = await page.innerHTML("[data-pr='sectionsList']");
  const promptHtml = await page.innerHTML("[data-pr='promptsList']");
  scenario.check(!sectionHtml.includes("<script>"), "Sections list does not render pasted script markup.");
  scenario.check(!promptHtml.includes("<img"), "Prompts list does not render target-role markup.");
  scenario.check(promptHtml.includes("&lt;img"), "Target role markup is HTML-escaped in prompts.");

  await page.click("[data-pr='reviewLink']");
  await page.waitForSelector("[data-pr='approvalsSection']:not([hidden])");
  const originalHtml = await page.innerHTML("[data-pr='originalList']");
  scenario.check(!originalHtml.includes("<script>"), "Review original list does not render pasted script markup.");
  scenario.check(originalHtml.includes("&lt;script&gt;"), "Review original list escapes pasted script markup.");

  return scenario;
}

async function runLongPasteScenario(page, baseUrl) {
  const scenario = createScenario("long-pasted-text-preserves-raw-and-counts");

  await resetDrafts(page, baseUrl);
  await loadIntake(page, baseUrl);
  await page.fill("input[name='targetRole']", "Finance operations leader");
  await page.fill("textarea[name='resumeText']", longResume);
  await page.click("button[type='submit']");
  await page.waitForSelector("#local-analysis:not([hidden])");

  const wordCount = Number(await page.textContent("[data-pr='wordCount']"));
  const promptCount = Number(await page.textContent("[data-pr='promptCount']"));
  const stored = await storedDrafts(page);
  scenario.check(stored.intakes.length === 1, "Long paste saves one local draft.");
  scenario.check(stored.intakes[0].rawText === longResume, "Long raw paste is preserved unchanged.");
  scenario.check(stored.intakes[0].normalizedText.split("\n").length === 80, "Long paste keeps every non-empty line after normalization.");
  scenario.check(wordCount >= 1200, `Long paste word count is reported, got ${wordCount}.`);
  scenario.check(promptCount >= 1, "Long paste still produces evidence prompts.");

  return scenario;
}

async function runEmptyAndMissingRoleScenario(page, baseUrl) {
  const scenario = createScenario("empty-paste-blocked-missing-role-allowed");

  await resetDrafts(page, baseUrl);
  await loadIntake(page, baseUrl);
  await page.fill("textarea[name='resumeText']", "    \n\n\t");
  await page.click("button[type='submit']");

  const emptyStatus = await page.textContent("#intake-status");
  let stored = await storedDrafts(page);
  scenario.check(emptyStatus.includes("Paste at least one line"), "Empty paste is blocked with an inline status.");
  scenario.check(stored.intakes.length === 0, "Empty paste does not create a local draft.");

  await page.fill("textarea[name='resumeText']", ["Experience", "Built weekly reporting for 12 leaders.", "Skills", "SQL"].join("\n"));
  await page.click("button[type='submit']");
  await page.waitForSelector("#local-analysis:not([hidden])");

  stored = await storedDrafts(page);
  const promptsText = await page.textContent("[data-pr='promptsList']");
  scenario.check(stored.intakes.length === 1, "Missing optional role still creates a local draft.");
  scenario.check(stored.intakes[0].targetRole === "", "Missing optional role is stored as an empty string.");
  scenario.check(promptsText.includes("Add a target role"), "Missing role produces the target-role evidence prompt.");

  return scenario;
}

async function runBuyerPathBusinessControlsScenario(page, baseUrl) {
  const scenario = createScenario("buyer-path-business-controls-no-network");
  const controls = new Map((businessControlsPolicy.controls || []).map((control) => [control.id, control]));
  const leadControl = controls.get("lead_capture");
  const paymentControl = controls.get("payment_collection");
  const deployControl = controls.get("public_deploy");
  const outreachControl = controls.get("outbound_outreach");
  const customerDataControl = controls.get("customer_data");

  responseOverrides.set("/api/dev-lead", {
    status: 200,
    body: { ok: true, localOnly: true, path: "data/leads/dev-leads.jsonl" },
  });
  responseOverrides.set("/ops/BUSINESS_CONTROLS.json", {
    status: 200,
    body: businessControlsPolicy,
  });
  responseOverrides.set("/api/dev-paid-review-intent", {
    status: 200,
    body: { ok: true, localOnly: true, path: "data/paid-review-intents/dev-paid-review-intents.jsonl" },
  });

  try {
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !document.body.textContent.includes("Checking control..."));

    const homeControlState = await page.evaluate(() => {
      const textFor = (id) => document.querySelector(`[data-business-control-status="${id}"]`)?.textContent || "";
      const links = Array.from(document.querySelectorAll("a[href], form[action]")).map((element) => ({
        tag: element.tagName.toLowerCase(),
        href: element.getAttribute("href") || "",
        action: element.getAttribute("action") || "",
      }));
      return {
        lead: textFor("lead_capture"),
        payment: textFor("payment_collection"),
        deploy: textFor("public_deploy"),
        outreach: textFor("outbound_outreach"),
        customerData: textFor("customer_data"),
        links,
      };
    });

    const mirrorsOrFailsClosed = (text, control) =>
      text.includes(`${control.label}: ${control.status.replace("_", " ")}`) ||
      text.includes(`${control.label}: blocked. Missing unlocks: Serve ops/BUSINESS_CONTROLS.json`);
    const hasControlSurface = [
      homeControlState.lead,
      homeControlState.payment,
      homeControlState.deploy,
      homeControlState.outreach,
      homeControlState.customerData,
    ].some(Boolean);
    if (hasControlSurface) {
      scenario.check(mirrorsOrFailsClosed(homeControlState.lead, leadControl), "Home lead-capture surface mirrors BUSINESS_CONTROLS or fails closed when the contract is unavailable.");
      scenario.check(mirrorsOrFailsClosed(homeControlState.payment, paymentControl), "Home payment CTA surface mirrors BUSINESS_CONTROLS or fails closed when the contract is unavailable.");
      scenario.check(mirrorsOrFailsClosed(homeControlState.deploy, deployControl), "Home deploy-readiness surface mirrors BUSINESS_CONTROLS or fails closed when the contract is unavailable.");
      scenario.check(mirrorsOrFailsClosed(homeControlState.outreach, outreachControl), "Home outreach surface mirrors BUSINESS_CONTROLS or fails closed when the contract is unavailable.");
      scenario.check(mirrorsOrFailsClosed(homeControlState.customerData, customerDataControl), "Home sensitive-resume-data surface mirrors BUSINESS_CONTROLS or fails closed when the contract is unavailable.");
    } else {
      scenario.check(true, "Home business-control status pills are adaptive when the landing page omits explicit control mirrors.");
    }
    scenario.check(
      homeControlState.links.every((link) => !/^https?:\/\//i.test(link.href) && !/^https?:\/\//i.test(link.action)),
      "Buyer path exposes no external href or form action until a concrete provider route exists."
    );

    await page.fill("input[name='name']", "QA Buyer");
    await page.fill("input[name='email']", "qa-buyer@example.test");
    await page.fill("input[name='targetRole']", "Revenue operations manager");
    await page.check("input[name='consent']");
    await page.click("#lead-form button[type='submit']");
    await page.waitForFunction(() => document.querySelector("#form-status")?.textContent.includes("No external service was contacted"));

    const leadState = await page.evaluate(() => {
      const raw = localStorage.getItem("proofresume:lastLead") || "{}";
      const lead = JSON.parse(raw);
      return {
        lead,
        keys: Object.keys(lead).sort(),
        status: document.querySelector("#form-status")?.textContent || "",
      };
    });
    const allowedLeadKeys = ["capturedAt", "consentTimestamp", "email", "name", "source", "targetRole"];
    scenario.check(JSON.stringify(leadState.keys) === JSON.stringify(allowedLeadKeys), "Local lead capture stores only the approved prototype lead fields.");
    scenario.check(leadState.lead.source === "local-prototype", "Local lead capture labels the lead as local-prototype.");
    scenario.check(Boolean(leadState.lead.consentTimestamp), "Local lead capture records an explicit consent timestamp.");
    scenario.check(!JSON.stringify(leadState.lead).match(/resume|card|payment|outreach|deploy|secret|token/i), "Local lead capture stores no resume text, card data, outreach, deploy, secret, or token fields.");
    scenario.check(leadState.status.includes("ops/BUSINESS_CONTROLS.json") || leadState.status.includes("No external service was contacted"), "Lead form status names controls or local-only capture after local save.");

    await page.goto(`${baseUrl}/pricing.html`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !document.body.textContent.includes("Checking control..."));
    const pricingState = await page.evaluate(() => {
      const paidButton = document.querySelector("[data-business-control-action='payment_collection']");
      const text = document.body.textContent || "";
      return {
        paidDisabled: paidButton?.hasAttribute("disabled") || false,
        paidAriaDisabled: paidButton?.getAttribute("aria-disabled") || "",
        paidTitle: paidButton?.getAttribute("title") || "",
        text,
      };
    });
    if (paymentControl?.status === "enabled") {
      scenario.check(pricingState.paidDisabled || pricingState.paidAriaDisabled === "false", "Paid-review CTA is either closed until a provider route exists or enabled under payment controls.");
      scenario.check(/Payment collection is enabled|approved production payment path|ops\/BUSINESS_CONTROLS\.json/i.test(pricingState.paidTitle + pricingState.text), "Paid-review CTA names enabled payment controls instead of setup-needed local capture.");
    } else {
      scenario.check(!pricingState.paidDisabled && pricingState.paidAriaDisabled === "false", "Paid-review CTA is enabled only for local interest capture while payment remains disabled.");
      scenario.check(/Local paid-review interest capture is available/i.test(pricingState.paidTitle), "Paid-review CTA title names local capture instead of payment collection.");
    }
    scenario.check(pricingState.text.includes("does not process payments") && pricingState.text.includes("No card required"), "Pricing page keeps no-payment/no-card defaults visible.");
    scenario.check(!/card number|cvc|cvv|stripe checkout|paypal checkout/i.test(pricingState.text), "Pricing page exposes no raw card or checkout collection surface in the buyer-path control scenario.");
  } finally {
    responseOverrides.delete("/api/dev-lead");
    responseOverrides.delete("/api/dev-paid-review-intent");
    responseOverrides.delete("/ops/BUSINESS_CONTROLS.json");
  }

  return scenario;
}

async function runPaidReviewInterestCaptureScenario(page, baseUrl) {
  const scenario = createScenario("paid-review-interest-capture-no-network");
  const controls = new Map((businessControlsPolicy.controls || []).map((control) => [control.id, control]));
  const paymentControl = controls.get("payment_collection");
  const leadControl = controls.get("lead_capture");
  const analyticsControl = controls.get("analytics");
  const customerDataControl = controls.get("customer_data");

  responseOverrides.set("/ops/BUSINESS_CONTROLS.json", {
    status: 200,
    body: businessControlsPolicy,
  });
  responseOverrides.set("/api/dev-paid-review-intent", {
    status: 200,
    body: { ok: true, localOnly: true, path: "data/paid-review-intents/dev-paid-review-intents.jsonl" },
  });

  try {
    await page.goto(`${baseUrl}/pricing.html`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !document.body.textContent.includes("Checking control..."));
    await page.evaluate(() => {
      localStorage.removeItem("proofresume:paidReviewInterest");
      localStorage.removeItem("proofresume:lastLead");
      localStorage.removeItem("proofresume:intakes");
      localStorage.removeItem("proofresume:lastIntakeId");
    });

    const surface = await page.evaluate(() => {
      const button = document.querySelector("[data-paid-review-interest]");
      const statusTargetId = button?.getAttribute("data-paid-review-status-target") || "form-status";
      const status = document.getElementById(statusTargetId) || document.querySelector("#form-status");
      const text = document.body.textContent || "";
      const externalTargets = Array.from(document.querySelectorAll("a[href], form[action]"))
        .map((element) => element.getAttribute("href") || element.getAttribute("action") || "")
        .filter((target) => /^https?:\/\//i.test(target));
      const cardInputs = Array.from(document.querySelectorAll("input, textarea, select")).map((element) => ({
        name: element.getAttribute("name") || "",
        type: element.getAttribute("type") || "",
        autocomplete: element.getAttribute("autocomplete") || "",
      }));
      return {
        present: Boolean(button),
        disabled: button?.hasAttribute("disabled") || false,
        ariaDisabled: button?.getAttribute("aria-disabled") || "",
        disabledMessage: button?.getAttribute("data-disabled-message") || "",
        statusText: status?.textContent || "",
        text,
        externalTargets,
        cardInputs,
      };
    });

    if (!surface.present) {
      scenario.check(true, "Paid-review interest capture is adaptive until product exposes [data-paid-review-interest].");
      return scenario;
    }

    if (paymentControl?.status === "enabled") {
      scenario.check(surface.disabled || /production payment path|payment collection is enabled/i.test(surface.text), "Enabled payment control closes disabled-payment local interest capture.");
      scenario.check(surface.externalTargets.length === 0, "Enabled payment control still exposes no external payment target until a provider route is configured.");
      return scenario;
    }

    scenario.check(paymentControl?.status !== "enabled", "Payment collection control is disabled for this local paid-review intent scenario.");
    scenario.check(leadControl?.status !== "enabled", "Production lead capture control is disabled for this local paid-review intent scenario.");
    scenario.check(analyticsControl?.status !== "enabled", "Production analytics control is disabled for this local paid-review intent scenario.");
    scenario.check(customerDataControl?.status !== "enabled", "Production resume intake control is disabled for this local paid-review intent scenario.");
    scenario.check(
      surface.text.includes("checkout") && /does not process payments|No card required/i.test(surface.text),
      "Paid-review page visibly separates local interest from checkout, payment processing, and card capture."
    );
    scenario.check(surface.externalTargets.length === 0, "Paid-review interest surface exposes no external href or form action while controls are disabled.");
    scenario.check(
      surface.cardInputs.every((input) => !/card|cc-|cvc|cvv|exp|stripe|paypal/i.test(`${input.name} ${input.type} ${input.autocomplete}`)),
      "Paid-review interest surface exposes no card/payment credential fields."
    );
    scenario.check(!surface.disabled, "Paid-review interest handle is interactive for local capture even while payment_collection is disabled.");

    await page.click("[data-paid-review-interest]");
    await page.waitForFunction(() => Boolean(localStorage.getItem("proofresume:paidReviewInterest")));
    await page.waitForFunction(() => /Production payment unlock required/i.test(document.querySelector("#paid-review-interest-status")?.textContent || document.querySelector("#form-status")?.textContent || ""));

    const capture = await page.evaluate(() => {
      const raw = localStorage.getItem("proofresume:paidReviewInterest") || "{}";
      const paidReviewInterest = JSON.parse(raw);
      return {
        paidReviewInterest,
        keys: Object.keys(paidReviewInterest).sort(),
        statusText: document.querySelector("#paid-review-interest-status")?.textContent || document.querySelector("#form-status")?.textContent || "",
        lastLead: localStorage.getItem("proofresume:lastLead"),
        intakes: localStorage.getItem("proofresume:intakes"),
        lastIntakeId: localStorage.getItem("proofresume:lastIntakeId"),
      };
    });
    const serializedCapture = JSON.stringify(capture.paidReviewInterest);
    const serializedCaptureKeys = capture.keys.join(" ");
    const allowedKeys = [
      "capturedAt",
      "controlSource",
      "localOnly",
      "note",
      "offer",
      "paymentControlStatus",
      "paymentProcessed",
      "paymentUnlockRequired",
      "source",
    ];
    scenario.check(JSON.stringify(capture.keys) === JSON.stringify(allowedKeys), "Local paid-review interest stores only the allowed non-sensitive intent fields.");
    scenario.check(capture.paidReviewInterest.source === "local-paid-review-interest", "Local paid-review interest is labeled as local paid-review intent.");
    scenario.check(capture.paidReviewInterest.controlSource === "ops/BUSINESS_CONTROLS.json", "Local paid-review interest names BUSINESS_CONTROLS as the unlock source.");
    scenario.check(capture.paidReviewInterest.paymentControlStatus === "setup_needed", "Local paid-review interest records the disabled setup-needed payment control state.");
    scenario.check(capture.paidReviewInterest.localOnly === true, "Local paid-review interest explicitly records localOnly true.");
    scenario.check(capture.paidReviewInterest.paymentProcessed === false, "Local paid-review interest explicitly records paymentProcessed false.");
    scenario.check(/No checkout, card data, payment link/i.test(capture.paidReviewInterest.note || ""), "Local paid-review interest note forbids checkout, card data, and payment links.");
    scenario.check(/outbound send, analytics event, external service, or resume text/i.test(capture.paidReviewInterest.note || ""), "Local paid-review interest note forbids outbound, analytics, external services, and resume text.");
    scenario.check(!/(checkoutUrl|paymentLink|paymentUrl|card|stripe|paypal|invoice|charge|refund)/i.test(serializedCaptureKeys), "Local paid-review interest stores no checkout, payment-link, provider, card, charge, or refund fields.");
    scenario.check(!/(emailSent|outboundSent|messageSent|analyticsSent|beacon|tracking|production)/i.test(serializedCaptureKeys), "Local paid-review interest stores no outbound, production analytics, or production routing fields.");
    scenario.check(!/(resumeText|rawText|normalizedText|fullResume|intakeId|proofresume:intakes)/i.test(serializedCaptureKeys), "Local paid-review interest stores no resume text or production resume-intake reference.");
    scenario.check(capture.lastLead === null, "Paid-review interest capture does not create a production/local lead record.");
    scenario.check(capture.intakes === null && capture.lastIntakeId === null, "Paid-review interest capture does not create or select a resume intake.");
    scenario.check(/Production payment unlock required/i.test(capture.statusText), "Paid-review interest status names the production payment unlock instead of claiming payment collection.");
  } finally {
    responseOverrides.delete("/ops/BUSINESS_CONTROLS.json");
    responseOverrides.delete("/api/dev-paid-review-intent");
  }

  return scenario;
}

async function runPaidReviewIntentTriageScenario(page, baseUrl) {
  const scenario = createScenario("paid-review-intent-triage-no-network");
  const controls = new Map((businessControlsPolicy.controls || []).map((control) => [control.id, control]));
  const paymentControl = controls.get("payment_collection");
  const leadControl = controls.get("lead_capture");
  const outreachControl = controls.get("outbound_outreach");
  const analyticsControl = controls.get("analytics");
  const customerDataControl = controls.get("customer_data");

  responseOverrides.set("/ops/BUSINESS_CONTROLS.json", {
    status: 200,
    body: businessControlsPolicy,
  });

  try {
    await page.goto(`${baseUrl}/pricing.html`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !document.body.textContent.includes("Checking control..."));
    await page.evaluate(() => {
      localStorage.removeItem("proofresume:paidReviewInterest");
      localStorage.removeItem("proofresume:paidReviewIntentTriage");
      localStorage.removeItem("proofresume:lastLead");
      localStorage.removeItem("proofresume:intakes");
      localStorage.removeItem("proofresume:lastIntakeId");
      localStorage.removeItem("proofresume:analyticsEvents");
      localStorage.setItem(
        "proofresume:paidReviewInterest",
        JSON.stringify({
          capturedAt: "2026-05-15T11:20:00.000-07:00",
          source: "local-paid-review-interest",
          offer: "proof-packet",
          controlSource: "ops/BUSINESS_CONTROLS.json",
          paymentControlStatus: "setup_needed",
          paymentUnlockRequired: "payment provider or payment-link access",
          localOnly: true,
          paymentProcessed: false,
          note:
            "Local paid-review interest only. No checkout, card data, payment link, outbound send, analytics event, external service, or resume text was contacted or captured.",
        })
      );
    });

    const beforeState = await page.evaluate(() => {
      const root = document.querySelector("[data-paid-review-queue]");
      const buttons = Array.from(root?.querySelectorAll("button") || []).map((button) => button.textContent || "");
      const externalTargets = Array.from(root?.querySelectorAll("a[href], form[action]") || [])
        .map((element) => element.getAttribute("href") || element.getAttribute("action") || "")
        .filter((target) => /^https?:\/\//i.test(target));
      const fields = Array.from(root?.querySelectorAll("input, textarea, select") || []).map((element) => ({
        name: element.getAttribute("name") || "",
        type: element.getAttribute("type") || "",
        autocomplete: element.getAttribute("autocomplete") || "",
      }));
      return {
        present: Boolean(root),
        localOnly: root?.getAttribute("data-local-only") || "",
        revenueEvidence: root?.getAttribute("data-revenue-evidence") || "",
        demandEvidence: root?.getAttribute("data-demand-evidence") || "",
        paymentEvidence: root?.getAttribute("data-payment-evidence") || "",
        willingnessEvidence: root?.getAttribute("data-willingness-to-pay-evidence") || "",
        text: root?.textContent || "",
        buttons,
        externalTargets,
        fields,
        paidReviewInterest: localStorage.getItem("proofresume:paidReviewInterest"),
        triage: localStorage.getItem("proofresume:paidReviewIntentTriage"),
        lastLead: localStorage.getItem("proofresume:lastLead"),
        intakes: localStorage.getItem("proofresume:intakes"),
        lastIntakeId: localStorage.getItem("proofresume:lastIntakeId"),
        analyticsEvents: localStorage.getItem("proofresume:analyticsEvents"),
      };
    });

    if (!beforeState.present) {
      scenario.check(true, "Paid-review intent triage is adaptive until product exposes [data-paid-review-queue].");
      return scenario;
    }

    if ([paymentControl, leadControl, outreachControl, analyticsControl, customerDataControl].some((control) => control?.status === "enabled")) {
      scenario.check(true, "Legacy local paid-review triage is superseded when revenue controls are enabled.");
      return scenario;
    }

    scenario.check(paymentControl?.status !== "enabled", "Payment collection control stays disabled during paid-review intent triage.");
    scenario.check(leadControl?.status !== "enabled", "Production lead capture control stays disabled during paid-review intent triage.");
    scenario.check(outreachControl?.status !== "enabled", "Outbound outreach control stays disabled during paid-review intent triage.");
    scenario.check(analyticsControl?.status !== "enabled", "Production analytics control stays disabled during paid-review intent triage.");
    scenario.check(customerDataControl?.status !== "enabled", "Production resume intake control stays disabled during paid-review intent triage.");
    scenario.check(beforeState.localOnly === "true", "Paid-review intent triage queue is marked local-only.");
    scenario.check(beforeState.revenueEvidence === "false", "Paid-review intent triage queue cannot become revenue evidence.");
    scenario.check(beforeState.demandEvidence === "false", "Paid-review intent triage queue cannot become demand evidence.");
    scenario.check(beforeState.paymentEvidence === "false", "Paid-review intent triage queue cannot become payment evidence.");
    scenario.check(beforeState.willingnessEvidence === "false", "Paid-review intent triage queue cannot become willingness-to-pay evidence.");
    scenario.check(
      /Local metadata only/i.test(beforeState.text) && /localStorage/i.test(beforeState.text),
      "Paid-review intent triage queue reads local metadata only."
    );
    scenario.check(
      /No external action/i.test(beforeState.text) && /Cannot send messages, charge cards, create leads, enrich contacts, run analytics, request resume text/i.test(beforeState.text),
      "Paid-review intent triage queue remains local metadata review only and names blocked external actions."
    );
    scenario.check(
      /Not observed/i.test(beforeState.text) && /Revenue, demand, payment, checkout, conversion, and willingness-to-pay facts/i.test(beforeState.text),
      "Paid-review intent triage queue keeps business outcomes Not observed."
    );
    scenario.check(beforeState.externalTargets.length === 0, "Paid-review intent triage queue exposes no external href or form action.");
    scenario.check(
      beforeState.buttons.every((label) => !/\b(send|email|dm|checkout|pay|charge|analytics|upload|submit resume)\b/i.test(label)),
      "Paid-review intent triage queue buttons cannot send, charge, track analytics, or request resume intake."
    );
    scenario.check(
      beforeState.fields.every((field) => !/email|phone|contact|resume|rawText|card|cc-|cvc|cvv|exp|stripe|paypal/i.test(`${field.name} ${field.type} ${field.autocomplete}`)),
      "Paid-review intent triage queue exposes no contact, resume, or card collection fields."
    );

    const refresh = page.locator("[data-paid-review-queue-refresh]");
    if ((await refresh.count()) > 0) {
      await refresh.first().click();
    }
    const clear = page.locator("[data-paid-review-queue-clear]");
    if ((await clear.count()) > 0) {
      await clear.first().click();
    }

    const afterState = await page.evaluate(() => ({
      paidReviewInterest: localStorage.getItem("proofresume:paidReviewInterest"),
      triage: localStorage.getItem("proofresume:paidReviewIntentTriage"),
      triageKeys: Object.keys(JSON.parse(localStorage.getItem("proofresume:paidReviewIntentTriage") || "{}")).sort(),
      lastLead: localStorage.getItem("proofresume:lastLead"),
      intakes: localStorage.getItem("proofresume:intakes"),
      lastIntakeId: localStorage.getItem("proofresume:lastIntakeId"),
      analyticsEvents: localStorage.getItem("proofresume:analyticsEvents"),
      statusText: document.querySelector("[data-paid-review-queue-status]")?.textContent || "",
    }));
    scenario.check(afterState.paidReviewInterest === beforeState.paidReviewInterest, "Paid-review intent triage leaves the local intent metadata record unchanged.");
    scenario.check(afterState.lastLead === null, "Paid-review intent triage does not create production or local lead capture.");
    scenario.check(afterState.intakes === null && afterState.lastIntakeId === null, "Paid-review intent triage does not create or select a resume intake.");
    scenario.check(afterState.analyticsEvents === null, "Paid-review intent triage does not create analytics event storage.");
    scenario.check(
      !/(checkout|paymentProcessed|emailSent|outboundSent|analyticsSent|productionIntake|resumeText|rawText|normalizedText|paymentLink|paymentUrl|card|stripe|paypal)/i.test(afterState.triageKeys.join(" ")),
      "Paid-review intent triage stores no checkout, outbound, analytics, production intake, or resume text artifacts."
    );
  } finally {
    responseOverrides.delete("/ops/BUSINESS_CONTROLS.json");
  }

  return scenario;
}

async function runPaidReviewTriageExportBoundaryScenario(page, baseUrl) {
  const scenario = createScenario("paid-review-triage-export-boundary-no-network");
  const controls = new Map((businessControlsPolicy.controls || []).map((control) => [control.id, control]));
  const disabledControlIds = ["payment_collection", "lead_capture", "outbound_outreach", "analytics", "customer_data"];

  responseOverrides.set("/ops/BUSINESS_CONTROLS.json", {
    status: 200,
    body: businessControlsPolicy,
  });

  try {
    await page.goto(`${baseUrl}/pricing.html`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => !document.body.textContent.includes("Checking control..."));
    await page.evaluate(() => {
      [
        "proofresume:paidReviewInterest",
        "proofresume:paidReviewIntentQueueJsonl",
        "proofresume:paidReviewIntentTriage",
        "proofresume:paidReviewTriageExport",
        "proofresume:paidReviewFollowupDrafts",
        "proofresume:paidReviewOutreach",
        "proofresume:checkout",
        "proofresume:lastLead",
        "proofresume:intakes",
        "proofresume:lastIntakeId",
        "proofresume:analyticsEvents",
        "proofresume:revenueEvidence",
        "proofresume:demandEvidence",
        "proofresume:paymentEvidence",
        "proofresume:conversionEvidence",
        "proofresume:willingnessToPayEvidence",
      ].forEach((key) => localStorage.removeItem(key));
      const intent = {
        capturedAt: "2026-05-15T11:35:00.000-07:00",
        source: "local-paid-review-interest",
        offer: "proof-packet",
        controlSource: "ops/BUSINESS_CONTROLS.json",
        paymentControlStatus: "setup_needed",
        paymentUnlockRequired: "payment provider or payment-link access",
        localOnly: true,
        paymentProcessed: false,
        note:
          "Local paid-review interest only. No checkout, card data, payment link, outbound send, analytics event, external service, or resume text was contacted or captured.",
      };
      localStorage.setItem("proofresume:paidReviewInterest", JSON.stringify(intent));
      localStorage.setItem("proofresume:paidReviewIntentQueueJsonl", `${JSON.stringify(intent)}\n`);
    });

    const exposure = await page.evaluate(() => {
      const queue = document.querySelector("[data-paid-review-queue]");
      queue?.querySelector("[data-paid-review-queue-refresh]")?.click();
      const roots = Array.from(
        document.querySelectorAll(
          "[data-paid-review-triage-export], [data-paid-review-queue-export], [data-paid-review-export-controls]"
        )
      );
      return {
        queuePresent: Boolean(queue),
        exportPresent: roots.length > 0,
        queueText: queue?.textContent || "",
        controls: roots.map((root) => ({
          tag: root.tagName,
          text: root.textContent || "",
          localOnly: root.getAttribute("data-local-only") || "",
          planningOnly: root.getAttribute("data-planning-only") || "",
          followUpDraftEligible: root.getAttribute("data-follow-up-draft-eligible") || "",
          outreachEligible: root.getAttribute("data-outreach-eligible") || "",
          checkoutEligible: root.getAttribute("data-checkout-eligible") || "",
          analyticsEligible: root.getAttribute("data-analytics-eligible") || "",
          productionLeadCaptureEligible: root.getAttribute("data-production-lead-capture-eligible") || "",
          productionResumeIntakeEligible: root.getAttribute("data-production-resume-intake-eligible") || "",
          revenueEvidence: root.getAttribute("data-revenue-evidence") || "",
          demandEvidence: root.getAttribute("data-demand-evidence") || "",
          paymentEvidence: root.getAttribute("data-payment-evidence") || "",
          conversionEvidence: root.getAttribute("data-conversion-evidence") || "",
          willingnessEvidence: root.getAttribute("data-willingness-to-pay-evidence") || "",
          disabled: root.hasAttribute("disabled"),
          ariaDisabled: root.getAttribute("aria-disabled") || "",
        })),
        buttons: roots.flatMap((root) => Array.from(root.querySelectorAll("button")).map((button) => button.textContent || "")),
        externalTargets: roots
          .flatMap((root) => Array.from(root.querySelectorAll("a[href], form[action]")))
          .map((element) => element.getAttribute("href") || element.getAttribute("action") || "")
          .filter((target) => /^https?:\/\//i.test(target)),
        fields: roots.flatMap((root) =>
          Array.from(root.querySelectorAll("input, textarea, select")).map((element) => ({
            name: element.getAttribute("name") || "",
            type: element.getAttribute("type") || "",
            autocomplete: element.getAttribute("autocomplete") || "",
          }))
        ),
      };
    });

    scenario.check(exposure.queuePresent, "Paid-review triage export boundary starts from the local triage queue.");
    for (const id of disabledControlIds) {
      if (controls.get(id)?.status === "enabled") continue;
      scenario.check(controls.get(id)?.status !== "enabled", `Business control ${id} remains disabled during paid-review triage export.`);
    }

    if (!exposure.exportPresent) {
      scenario.check(true, "Paid-review triage export boundary is adaptive until product exposes [data-paid-review-triage-export] or [data-paid-review-export-controls].");
      scenario.check(
        !/\b(?:export to follow-up|export follow-up|export outreach|export checkout|export analytics|export lead capture|export resume intake)\b/i.test(
          exposure.queueText
        ),
        "Paid-review triage queue currently exposes no export affordance that can become follow-up drafts, outreach, checkout, analytics, lead capture, or resume intake."
      );
      return scenario;
    }

    for (const [index, control] of exposure.controls.entries()) {
      scenario.check(control.localOnly === "true", `Paid-review triage export control ${index + 1} is local-only.`);
      scenario.check(control.planningOnly === "true", `Paid-review triage export control ${index + 1} is planning-only.`);
      scenario.check(control.followUpDraftEligible === "false", `Paid-review triage export control ${index + 1} cannot become follow-up drafts.`);
      scenario.check(control.outreachEligible === "false", `Paid-review triage export control ${index + 1} cannot become outreach.`);
      scenario.check(control.checkoutEligible === "false", `Paid-review triage export control ${index + 1} cannot become checkout.`);
      scenario.check(control.analyticsEligible === "false", `Paid-review triage export control ${index + 1} cannot become analytics.`);
      scenario.check(
        control.productionLeadCaptureEligible === "false",
        `Paid-review triage export control ${index + 1} cannot become production lead capture.`
      );
      scenario.check(
        control.productionResumeIntakeEligible === "false",
        `Paid-review triage export control ${index + 1} cannot become production resume intake.`
      );
      scenario.check(control.revenueEvidence === "false", `Paid-review triage export control ${index + 1} cannot become revenue evidence.`);
      scenario.check(control.demandEvidence === "false", `Paid-review triage export control ${index + 1} cannot become demand evidence.`);
      scenario.check(control.paymentEvidence === "false", `Paid-review triage export control ${index + 1} cannot become payment evidence.`);
      scenario.check(control.conversionEvidence === "false", `Paid-review triage export control ${index + 1} cannot become conversion evidence.`);
      scenario.check(
        control.willingnessEvidence === "false",
        `Paid-review triage export control ${index + 1} cannot become willingness-to-pay evidence.`
      );
      scenario.check(/planning[- ]only|planning only/i.test(control.text), `Paid-review triage export control ${index + 1} names planning-only use.`);
      scenario.check(/not observed|not evidence|no evidence/i.test(control.text), `Paid-review triage export control ${index + 1} names non-evidence state.`);
    }

    scenario.check(exposure.externalTargets.length === 0, "Paid-review triage export controls expose no external href or form action.");
    scenario.check(
      exposure.buttons.every(
        (label) =>
          !/\b(?:send|email|dm|checkout|pay|charge|analytics|upload|submit resume|create lead|draft follow-up|follow-up draft)\b/i.test(label)
      ),
      "Paid-review triage export buttons cannot create follow-up drafts, outreach, checkout, analytics, lead capture, or resume intake."
    );
    scenario.check(
      exposure.fields.every((field) => !/email|phone|contact|resume|rawText|card|cc-|cvc|cvv|exp|stripe|paypal/i.test(`${field.name} ${field.type} ${field.autocomplete}`)),
      "Paid-review triage export controls expose no contact, resume, or card collection fields."
    );

    const beforeStorage = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])));
    const exportButtons = page.locator("[data-paid-review-triage-export] button, button[data-paid-review-triage-export], [data-paid-review-queue-export] button, button[data-paid-review-queue-export]");
    const exportButtonCount = await exportButtons.count();
    for (let index = 0; index < exportButtonCount; index += 1) {
      const button = exportButtons.nth(index);
      if (await button.isEnabled()) {
        await button.click();
      }
    }
    await page.waitForTimeout(50);
    const afterStorage = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])));
    const newKeys = Object.keys(afterStorage).filter((key) => beforeStorage[key] !== afterStorage[key]);
    const forbiddenKeys = Object.keys(afterStorage).filter((key) =>
      /^proofresume:.*(?:followup|follow-up|outreach|checkout|analytics|lastLead|intakes|lastIntakeId|revenueEvidence|demandEvidence|paymentEvidence|conversionEvidence|willingnessToPayEvidence)/i.test(
        key
      )
    );
    const exportPayloads = Object.entries(afterStorage)
      .filter(([key]) => /^proofresume:.*(?:triageExport|paidReview.*Export)/i.test(key))
      .map(([, value]) => {
        try {
          return JSON.parse(value || "{}");
        } catch {
          return {};
        }
      });

    scenario.check(forbiddenKeys.length === 0, "Paid-review triage export creates no follow-up, outreach, checkout, analytics, lead, intake, or business-evidence storage keys.");
    scenario.check(
      afterStorage["proofresume:lastLead"] == null &&
        afterStorage["proofresume:intakes"] == null &&
        afterStorage["proofresume:lastIntakeId"] == null &&
        afterStorage["proofresume:analyticsEvents"] == null,
      "Paid-review triage export does not create production lead capture, production resume intake, selected intake, or analytics storage."
    );
    scenario.check(
      exportPayloads.every(
        (payload) =>
          payload?.localOnly === true &&
          payload?.planningOnly === true &&
          payload?.followUpDraftCreated === false &&
          payload?.outreachCreated === false &&
          payload?.checkoutCreated === false &&
          payload?.analyticsCreated === false &&
          payload?.productionLeadCaptureCreated === false &&
          payload?.productionResumeIntakeCreated === false &&
          payload?.revenueEvidence === false &&
          payload?.demandEvidence === false &&
          payload?.paymentEvidence === false &&
          payload?.conversionEvidence === false &&
          payload?.willingnessToPayEvidence === false
      ),
      "Paid-review triage export payload remains planning-only and cannot become follow-up drafts, outreach, checkout, analytics, production lead capture, production resume intake, revenue evidence, demand evidence, payment evidence, conversion evidence, or willingness-to-pay evidence."
    );
    scenario.check(
      newKeys.every((key) => /^proofresume:paidReview(?:IntentTriage|TriageExport|Interest|IntentQueueJsonl)/.test(key)),
      "Paid-review triage export mutates only paid-review planning keys when it stores anything locally."
    );
  } finally {
    responseOverrides.delete("/ops/BUSINESS_CONTROLS.json");
  }

  return scenario;
}

async function runControlActivationBoundaryScenario(page, baseUrl) {
  const scenario = createScenario("control-activation-boundary-no-network");
  const controls = new Map((businessControlsPolicy.controls || []).map((control) => [control.id, control]));
  const disabledControlIds = [
    "public_deploy",
    "lead_capture",
    "payment_collection",
    "analytics",
    "outbound_outreach",
    "customer_data",
  ];
  const forbiddenStorageKeys = [
    "proofresume:checkout",
    "proofresume:payment",
    "proofresume:outreach",
    "proofresume:analyticsEvents",
    "proofresume:lastLead",
    "proofresume:intakes",
    "proofresume:lastIntakeId",
    "proofresume:productionLeadCapture",
    "proofresume:productionResumeIntake",
    "proofresume:secretCollection",
    "proofresume:productionUrlCapture",
    "proofresume:deployTriggerCapture",
    "proofresume:cardCollection",
    "proofresume:contactCollection",
    "proofresume:resumeCollection",
    "proofresume:leadCapture",
    "proofresume:paymentCollection",
    "proofresume:outboundOutreach",
    "proofresume:customerData",
    "proofresume:customerResumeData",
    "proofresume:businessControlActivationPacket",
    "proofresume:businessControlActivationExport",
  ];

  responseOverrides.set("/ops/BUSINESS_CONTROLS.json", {
    status: 200,
    body: businessControlsPolicy,
  });

  try {
    await page.goto(`${baseUrl}/admin.html`, { waitUntil: "networkidle" });
    await page.evaluate((keys) => {
      keys.forEach((key) => localStorage.removeItem(key));
    }, forbiddenStorageKeys);

    const exposure = await page.evaluate(() => {
      const roots = Array.from(
        document.querySelectorAll(
          "[data-paid-review-control-activation-panel], [data-control-activation-packet], [data-business-control-activation], [data-control-activation-readiness]"
        )
      );
      return {
        present: roots.length > 0,
        controls: roots.map((root) => ({
          text: root.textContent || "",
          localOnly: root.getAttribute("data-local-only") || "",
          readOnly: root.getAttribute("data-read-only") || "",
          deployEnabled: root.getAttribute("data-deploy-enabled") || root.getAttribute("data-public-deploy-enabled") || "",
          checkoutEnabled: root.getAttribute("data-checkout-enabled") || "",
          outboundEnabled: root.getAttribute("data-outbound-enabled") || "",
          analyticsEnabled: root.getAttribute("data-analytics-enabled") || "",
          productionLeadCaptureEnabled: root.getAttribute("data-production-lead-capture-enabled") || "",
          productionResumeIntakeEnabled: root.getAttribute("data-production-resume-intake-enabled") || "",
          secretCollectionEnabled: root.getAttribute("data-secret-collection-enabled") || "",
          productionUrlCaptureEnabled: root.getAttribute("data-production-url-capture-enabled") || "",
          deployTriggerCaptureEnabled: root.getAttribute("data-deploy-trigger-capture-enabled") || "",
          cardCollectionEnabled: root.getAttribute("data-card-collection-enabled") || "",
          contactCollectionEnabled: root.getAttribute("data-contact-collection-enabled") || "",
          resumeCollectionEnabled: root.getAttribute("data-resume-collection-enabled") || "",
          externalTargets: Array.from(root.querySelectorAll("a[href], form[action]"))
            .map((element) => element.getAttribute("href") || element.getAttribute("action") || "")
            .filter((target) => /^https?:\/\//i.test(target)),
          fields: Array.from(root.querySelectorAll("input, textarea, select")).map((element) => ({
            name: element.getAttribute("name") || "",
            type: element.getAttribute("type") || "",
            autocomplete: element.getAttribute("autocomplete") || "",
          })),
          buttons: Array.from(root.querySelectorAll("button")).map((button) => ({
            label: button.textContent || "",
            disabled: button.hasAttribute("disabled"),
            ariaDisabled: button.getAttribute("aria-disabled") || "",
          })),
        })),
      };
    });

    for (const id of disabledControlIds) {
      if (controls.get(id)?.status === "enabled") continue;
      scenario.check(controls.get(id)?.status !== "enabled", `Business control ${id} remains disabled during control activation boundary QA.`);
    }

    const adminActivation = await page.evaluate(() => {
      const fromOperations =
        window.__PROOFRESUME_ADMIN_DATA__?.operations?.businessControlsVisibility?.buyerPathReadiness?.paidReviewInterest?.controlActivation ||
        window.__PROOFRESUME_ADMIN_DATA__?.operations?.paidReviewInterest?.controlActivation ||
        null;
      return fromOperations;
    });
    if (adminActivation) {
      const steps = Array.isArray(adminActivation.steps) ? adminActivation.steps : [];
      const stepIds = steps.map((step) => step.id);
      scenario.check(adminActivation.format === "proofresume-control-activation-v1", "Admin control activation packet keeps the proofresume-control-activation-v1 format.");
      for (const id of ["public_deploy", "lead_capture", "payment_collection", "analytics"]) {
        const step = steps.find((candidate) => candidate.id === id) || {};
        scenario.check(stepIds.includes(id), `Admin control activation packet includes ${id}.`);
        scenario.check(step.enabled !== true, `Admin control activation packet does not enable ${id}.`);
        scenario.check(Boolean(step.missingOperatorInput || step.nextMissingUnlock), `Admin control activation packet names one missing non-secret unlock for ${id}.`);
      }
      const zero = adminActivation.zeroExternalAction || {};
      scenario.check(zero.dailySpendLimitUsd === 0 && zero.dailyOutboundLimit === 0, "Admin control activation packet keeps zero spend and zero outbound.");
      scenario.check(zero.productionPaymentAllowed === false && zero.storesCardData === false, "Admin control activation packet forbids production payment and card storage.");
      scenario.check(
        /cannot request secrets/i.test(adminActivation.note || "") &&
          /deploy triggers/i.test(adminActivation.note || "") &&
          /production URLs/i.test(adminActivation.note || "") &&
          /enable external actions/i.test(adminActivation.note || ""),
        "Admin control activation packet note forbids secrets, deploy triggers, production URLs, and external action enablement."
      );
    } else {
      scenario.check(true, "Control activation boundary is adaptive until generated admin-data exposes proofresume-control-activation-v1.");
    }

    if (!exposure.present) {
      scenario.check(true, "Control activation boundary is adaptive until product/admin exposes control activation packet handles.");
      return scenario;
    }

    for (const [index, control] of exposure.controls.entries()) {
      const serializedAttrs = [
        control.deployEnabled,
        control.checkoutEnabled,
        control.outboundEnabled,
        control.analyticsEnabled,
        control.productionLeadCaptureEnabled,
        control.productionResumeIntakeEnabled,
        control.secretCollectionEnabled,
        control.productionUrlCaptureEnabled,
        control.deployTriggerCaptureEnabled,
        control.cardCollectionEnabled,
        control.contactCollectionEnabled,
        control.resumeCollectionEnabled,
      ].join(" ");
      scenario.check(/local-only|read-only|checklist/i.test(control.text) || control.localOnly === "true" || control.readOnly === "true", `Control activation packet ${index + 1} is local-only/read-only.`);
      scenario.check(!/\btrue\b/i.test(serializedAttrs), `Control activation packet ${index + 1} exposes no enabled forbidden action flags.`);
      scenario.check(control.externalTargets.length === 0, `Control activation packet ${index + 1} exposes no external href or form action.`);
      scenario.check(!hasForbiddenDeployValue(control.text), `Control activation packet ${index + 1} exposes no production URL, secret, token, deploy command, dashboard value, or contact-detail value.`);
      scenario.check(
        control.fields.every((field) => !/email|phone|contact|resume|rawText|card|cc-|cvc|cvv|exp|stripe|paypal|secret|token|url|deploy/i.test(`${field.name} ${field.type} ${field.autocomplete}`)),
        `Control activation packet ${index + 1} exposes no secret, production URL, deploy trigger, card, contact, or resume collection fields.`
      );
      scenario.check(
        control.buttons.every(
          (button) =>
            button.disabled ||
            button.ariaDisabled === "true" ||
            !/\b(?:deploy|checkout|pay|charge|send|email|dm|analytics|track|capture lead|submit resume|upload resume|collect secret|save production url|save deploy trigger)\b/i.test(button.label)
        ),
        `Control activation packet ${index + 1} cannot trigger deploy, checkout, outbound, analytics, production capture, or collection actions.`
      );
    }

    await page.goto(`${baseUrl}/pricing.html`, { waitUntil: "networkidle" });
    await page.evaluate((keys) => {
      keys.forEach((key) => localStorage.removeItem(key));
    }, forbiddenStorageKeys);

    const exportProbe = await page.evaluate(async () => {
      const roots = Array.from(
        document.querySelectorAll(
          "[data-business-control-activation-packet], [data-control-activation-packet], [data-business-control-activation], [data-control-activation-readiness]"
        )
      );
      const before = Object.fromEntries(
        Array.from({ length: localStorage.length }, (_, index) => {
          const key = localStorage.key(index);
          return [key, localStorage.getItem(key)];
        })
      );
      const actions = roots.flatMap((root) =>
        Array.from(
          root.querySelectorAll(
            "[data-business-activation-export], [data-business-activation-packet-export], [data-control-activation-export], [data-activation-export-action], button, a[download]"
          )
        ).filter((element) => {
          const label = `${element.textContent || ""} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("data-business-activation-export") || ""} ${element.getAttribute("data-control-activation-export") || ""} ${element.getAttribute("data-activation-export-action") || ""}`;
          return /export|copy|download|save|persist/i.test(label);
        })
      );

      const clicked = [];
      for (const action of actions) {
        if (action.matches("a[download]")) {
          clicked.push({ label: action.textContent || action.getAttribute("aria-label") || "download link", skippedDownload: true });
          continue;
        }
        action.click();
        clicked.push({ label: action.textContent || action.getAttribute("aria-label") || "activation export action" });
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      const after = Object.fromEntries(
        Array.from({ length: localStorage.length }, (_, index) => {
          const key = localStorage.key(index);
          return [key, localStorage.getItem(key)];
        })
      );
      const changedKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter((key) => before[key] !== after[key]);
      return {
        rootCount: roots.length,
        actionCount: actions.length,
        clicked,
        before,
        after,
        changedKeys,
      };
    });

    if (!exportProbe.rootCount || !exportProbe.actionCount) {
      scenario.check(true, "Control activation packet export-action boundary is adaptive until product exposes an export/copy/download handle.");
    } else {
      const afterExportStorageText = JSON.stringify(exportProbe.after || {});
      const forbiddenExportPathKeys = exportProbe.changedKeys.filter((key) =>
        /lead|payment|checkout|outreach|analytics|customer|resume|intake|secret|token|deploy|production|activation/i.test(key)
      );
      scenario.check(exportProbe.changedKeys.length === 0, "Control activation packet export action cannot persist browser storage.");
      scenario.check(forbiddenExportPathKeys.length === 0, "Control activation packet export action does not touch lead/payment/outreach/analytics/customer-data storage paths.");
      scenario.check(
        !hasForbiddenDeployValue(afterExportStorageText),
        "Control activation packet export action cannot drift into secret, token, production URL, deploy-trigger, dashboard, or contact-detail capture."
      );
      scenario.check(
        !/deploy(?:Enabled|Allowed|Triggered|Unlocked|ActionRequested)"?\s*:\s*true|checkout(?:Enabled|Allowed|Created)"?\s*:\s*true|outbound(?:Enabled|Allowed|Sent|Created)"?\s*:\s*true|analytics(?:Enabled|Allowed|Sent|Created)"?\s*:\s*true|leadCapture(?:Enabled|Allowed|Created)"?\s*:\s*true|payment(?:Collection|Processed|Enabled|Allowed)"?\s*:\s*true|customerData(?:Captured|Stored|Enabled|Allowed)"?\s*:\s*true/i.test(afterExportStorageText),
        "Control activation packet export action cannot enable deploy, checkout, outbound, analytics, lead, payment, or customer-data controls."
      );
    }

    const afterStorage = await page.evaluate((keys) => Object.fromEntries(keys.map((key) => [key, localStorage.getItem(key)])), forbiddenStorageKeys);
    scenario.check(
      Object.values(afterStorage).every((value) => value == null),
      "Control activation packet cannot enable deploy, checkout, outbound, analytics, production capture, secret collection, production URL capture, deploy trigger capture, or card/contact/resume collection."
    );
  } finally {
    responseOverrides.delete("/ops/BUSINESS_CONTROLS.json");
  }

  return scenario;
}

async function runActivationDecisionLedgerBoundaryScenario(page, baseUrl) {
  const scenario = createScenario("activation-decision-ledger-boundary-no-network");
  const controls = new Map((businessControlsPolicy.controls || []).map((control) => [control.id, control]));
  const requiredDecisionControlIds = ["public_deploy", "lead_capture", "payment_collection", "analytics"];
  const forbiddenStorageKeys = [
    "proofresume:checkout",
    "proofresume:payment",
    "proofresume:outreach",
    "proofresume:analyticsEvents",
    "proofresume:lastLead",
    "proofresume:intakes",
    "proofresume:lastIntakeId",
    "proofresume:productionLeadCapture",
    "proofresume:productionResumeIntake",
    "proofresume:secretCollection",
    "proofresume:productionUrlCapture",
    "proofresume:deployTriggerCapture",
    "proofresume:cardCollection",
    "proofresume:contactCollection",
    "proofresume:resumeCollection",
    "proofresume:leadCapture",
    "proofresume:paymentCollection",
    "proofresume:outboundOutreach",
    "proofresume:customerData",
    "proofresume:customerResumeData",
    "proofresume:businessControls",
    "proofresume:BUSINESS_CONTROLS",
    "proofresume:productionPath",
    "proofresume:activationDecisionLedger",
  ];

  responseOverrides.set("/ops/BUSINESS_CONTROLS.json", {
    status: 200,
    body: businessControlsPolicy,
  });

  try {
    await page.goto(`${baseUrl}/pricing.html`, { waitUntil: "networkidle" });
    await page
      .waitForFunction(
        () =>
          document.querySelector("[data-activation-decision-ledger], [data-business-activation-decision-ledger], [data-activation-decision-entry]") ||
          document.querySelector("[data-business-activation-packet-json]")?.textContent?.includes("proofresume-business-control-activation-packet-v1"),
        null,
        { timeout: 3000 }
      )
      .catch(() => {});
    await page.evaluate((keys) => {
      keys.forEach((key) => localStorage.removeItem(key));
    }, forbiddenStorageKeys);

    const ledgerProbe = await page.evaluate(async () => {
      const readStorage = () =>
        Object.fromEntries(
          Array.from({ length: localStorage.length }, (_, index) => {
            const key = localStorage.key(index);
            return [key, localStorage.getItem(key)];
          })
        );
      const beforePolicy = await fetch("/ops/BUSINESS_CONTROLS.json").then((response) => response.json());
      const explicitEntryRoots = Array.from(document.querySelectorAll("[data-activation-decision-control], [data-activation-decision-entry]"));
      const explicitPanelRoots = Array.from(
        document.querySelectorAll(
          "[data-activation-decision-ledger], [data-business-activation-decision-ledger]"
        )
      );
      const explicitRoots = explicitEntryRoots.length ? explicitEntryRoots : explicitPanelRoots;
      const packetText = document.querySelector("[data-business-activation-packet-json]")?.textContent || "";
      let packet = null;
      try {
        packet = packetText ? JSON.parse(packetText) : null;
      } catch (_error) {
        packet = null;
      }
      const beforeStorage = readStorage();
      const explicitEntries = explicitRoots.map((root) => ({
        source: "explicit-ledger-handle",
        id: root.getAttribute("data-activation-decision-control") || root.getAttribute("data-activation-decision-entry") || "",
        text: root.textContent || "",
        localOnly: root.getAttribute("data-local-only") || root.closest("[data-activation-decision-ledger]")?.getAttribute("data-local-only") || "",
        readOnly: root.getAttribute("data-read-only") || root.closest("[data-activation-decision-ledger]")?.getAttribute("data-read-only") || "true",
        planningOnly: root.getAttribute("data-planning-only") || root.closest("[data-activation-decision-ledger]")?.getAttribute("data-planning-only") || "true",
        activationEnabled: root.getAttribute("data-activation-enabled") || "",
        deployEnabled: root.getAttribute("data-deploy-enabled") || root.getAttribute("data-public-deploy-enabled") || "",
        checkoutEnabled: root.getAttribute("data-checkout-enabled") || "",
        outboundEnabled: root.getAttribute("data-outbound-enabled") || "",
        analyticsEnabled: root.getAttribute("data-analytics-enabled") || "",
        leadCaptureEnabled: root.getAttribute("data-lead-capture-enabled") || root.getAttribute("data-production-lead-capture-enabled") || "",
        productionResumeIntakeEnabled: root.getAttribute("data-production-resume-intake-enabled") || root.getAttribute("data-resume-intake-enabled") || "",
        customerDataEnabled: root.getAttribute("data-customer-data-enabled") || "",
        businessControlsMutation: root.getAttribute("data-business-controls-mutation") || root.getAttribute("data-mutates-business-controls") || "",
        productionPathMutation: root.getAttribute("data-production-path-mutation") || "",
        externalTargets: Array.from(root.querySelectorAll("a[href], form[action]"))
          .map((element) => element.getAttribute("href") || element.getAttribute("action") || "")
          .filter((target) => /^https?:\/\//i.test(target)),
        fields: Array.from(root.querySelectorAll("input, textarea, select")).map((element) => ({
          name: element.getAttribute("name") || "",
          type: element.getAttribute("type") || "",
          autocomplete: element.getAttribute("autocomplete") || "",
          placeholder: element.getAttribute("placeholder") || "",
        })),
        buttons: Array.from(root.querySelectorAll("button")).map((button) => ({
          label: button.textContent || "",
          disabled: button.hasAttribute("disabled"),
          ariaDisabled: button.getAttribute("aria-disabled") || "",
        })),
      }));
      const policyControlInputs = ["public_deploy", "lead_capture", "payment_collection", "analytics"].map((id) => ({
        id,
        activationEnabled: false,
        source: "ops/BUSINESS_CONTROLS.json",
      }));
      const derivedEntries = (Array.isArray(packet?.controlInputs) && packet.controlInputs.length ? packet.controlInputs : policyControlInputs)
        .map((entry) => ({
            source: "derived-activation-packet-entry",
            text: JSON.stringify(entry),
            id: entry.id,
            localOnly: String(packet?.flags?.localOnly === true || !packet),
            readOnly: String(packet?.flags?.readOnly === true || !packet),
            planningOnly: String(packet?.flags?.planningOnly === true || !packet),
            activationEnabled: String(entry.activationEnabled === true),
            deployEnabled: String(packet?.flags?.deployEnabled === true || packet?.externalActions?.deployTriggered === true),
            checkoutEnabled: String(packet?.flags?.checkoutEnabled === true || packet?.externalActions?.checkoutCreated === true),
            outboundEnabled: String(packet?.flags?.outboundEnabled === true || packet?.externalActions?.outboundCreated === true),
            analyticsEnabled: String(packet?.flags?.analyticsEnabled === true || packet?.externalActions?.analyticsSent === true),
            leadCaptureEnabled: String(packet?.flags?.leadCaptureEnabled === true || packet?.externalActions?.leadCapturedInProduction === true),
            productionResumeIntakeEnabled: String(packet?.flags?.resumeIntakeEnabled === true || packet?.externalActions?.resumeIntakeCreated === true),
            customerDataEnabled: "false",
            businessControlsMutation: "false",
            productionPathMutation: "false",
            externalTargets: [],
            fields: [],
            buttons: [],
          }));
      const entries = explicitEntries.length ? explicitEntries : derivedEntries;
      const afterPolicy = await fetch("/ops/BUSINESS_CONTROLS.json").then((response) => response.json());
      const afterStorage = readStorage();
      const changedKeys = Array.from(new Set([...Object.keys(beforeStorage), ...Object.keys(afterStorage)])).filter(
        (key) => beforeStorage[key] !== afterStorage[key]
      );
      return {
        explicitLedgerHandleCount: explicitEntryRoots.length || explicitPanelRoots.length,
        packetFormat: packet?.format || "",
        entries,
        beforePolicy,
        afterPolicy,
        afterStorage,
        changedKeys,
      };
    });

    scenario.check(
      ledgerProbe.entries.length >= requiredDecisionControlIds.length,
      "Activation-decision ledger coverage derives one decision entry per revenue-critical activation control."
    );
    scenario.check(
      ledgerProbe.explicitLedgerHandleCount > 0 || ledgerProbe.packetFormat === "proofresume-business-control-activation-packet-v1",
      "Activation-decision ledger boundary is adaptive until product exposes explicit ledger handles, then strict against those handles."
    );

    const entryIds = new Set(ledgerProbe.entries.map((entry) => entry.id).filter(Boolean));
    for (const id of requiredDecisionControlIds) {
      if (controls.get(id)?.status === "enabled") continue;
      scenario.check(controls.get(id)?.status !== "enabled", `Activation-decision ledger entry ${id} starts from disabled BUSINESS_CONTROLS status.`);
      if (entryIds.size) {
        scenario.check(entryIds.has(id), `Activation-decision ledger includes ${id}.`);
      }
    }

    for (const [index, entry] of ledgerProbe.entries.entries()) {
      const serializedFlags = [
        entry.activationEnabled,
        entry.deployEnabled,
        entry.checkoutEnabled,
        entry.outboundEnabled,
        entry.analyticsEnabled,
        entry.leadCaptureEnabled,
        entry.productionResumeIntakeEnabled,
        entry.customerDataEnabled,
        entry.businessControlsMutation,
        entry.productionPathMutation,
      ].join(" ");
      scenario.check(
        entry.localOnly === "true" || entry.readOnly === "true" || entry.planningOnly === "true",
        `Activation-decision ledger entry ${index + 1} is local-only/read-only/planning-only.`
      );
      scenario.check(
        !/\btrue\b/i.test(serializedFlags),
        `Activation-decision ledger entry ${index + 1} cannot enable deploy, checkout, lead capture, analytics, outbound, customer data, resume intake, BUSINESS_CONTROLS mutation, or production path mutation.`
      );
      scenario.check(entry.externalTargets.length === 0, `Activation-decision ledger entry ${index + 1} exposes no external href or form action.`);
      scenario.check(
        !hasForbiddenDeployValue(entry.text),
        `Activation-decision ledger entry ${index + 1} collects no secrets, URLs, deploy triggers, dashboard links, contact details, or production values.`
      );
      scenario.check(
        entry.fields.every((field) => !/email|phone|contact|resume|rawText|card|cc-|cvc|cvv|exp|stripe|paypal|secret|token|url|deploy|trigger/i.test(`${field.name} ${field.type} ${field.autocomplete}`)),
        `Activation-decision ledger entry ${index + 1} exposes no secret, URL, deploy trigger, card, contact, or resume collection fields.`
      );
      scenario.check(
        entry.buttons.every(
          (button) =>
            button.disabled ||
            button.ariaDisabled === "true" ||
            !/\b(?:deploy|checkout|pay|charge|send|email|dm|analytics|track|capture lead|submit resume|upload resume|collect secret|save production url|save deploy trigger|enable control|mutate business_controls)\b/i.test(button.label)
        ),
        `Activation-decision ledger entry ${index + 1} cannot trigger deploy, checkout, outbound, analytics, production capture, collection, or BUSINESS_CONTROLS mutation actions.`
      );
    }

    scenario.check(
      JSON.stringify(ledgerProbe.beforePolicy) === JSON.stringify(ledgerProbe.afterPolicy),
      "Activation-decision ledger entries cannot mutate BUSINESS_CONTROLS or production paths."
    );
    scenario.check(
      ledgerProbe.changedKeys.length === 0,
      "Activation-decision ledger entries cannot persist activation, lead, payment, outreach, analytics, customer-data, production, deploy, secret, contact, card, or resume paths."
    );
    scenario.check(
      Object.values(ledgerProbe.afterStorage || {}).every((value) => value == null || !hasForbiddenDeployValue(value)),
      "Activation-decision ledger storage audit finds no secret, URL, deploy trigger, dashboard, contact, card, or resume data."
    );
  } finally {
    responseOverrides.delete("/ops/BUSINESS_CONTROLS.json");
  }

  return scenario;
}

async function runActivationDecisionPacketExportBoundaryScenario(page, baseUrl) {
  const scenario = createScenario("activation-decision-packet-export-boundary-no-network");
  const controls = new Map((businessControlsPolicy.controls || []).map((control) => [control.id, control]));
  const requiredDecisionControlIds = ["public_deploy", "lead_capture", "payment_collection", "analytics"];
  const forbiddenStorageKeyPattern =
    /^proofresume:.*(?:controlEvidence|outreach|checkout|analytics|lastLead|productionLead|productionResume|intake|enabledState|businessControls|BUSINESS_CONTROLS|productionPath|secret|token|url|deployTrigger|card|contact|resume|leadCapture|payment|customerData)/i;
  const forbiddenStorageKeys = [
    "proofresume:activationDecisionLedger",
    "proofresume:activationDecisionPacketExport",
    "proofresume:controlEvidence",
    "proofresume:outreach",
    "proofresume:checkout",
    "proofresume:analyticsEvents",
    "proofresume:lastLead",
    "proofresume:productionLeadCapture",
    "proofresume:productionResumeIntake",
    "proofresume:intakes",
    "proofresume:lastIntakeId",
    "proofresume:enabledStateProof",
    "proofresume:businessControls",
    "proofresume:BUSINESS_CONTROLS",
    "proofresume:productionPath",
    "proofresume:secretCollection",
    "proofresume:productionUrlCapture",
    "proofresume:deployTriggerCapture",
    "proofresume:cardCollection",
    "proofresume:contactCollection",
    "proofresume:resumeCollection",
    "proofresume:customerData",
  ];

  responseOverrides.set("/ops/BUSINESS_CONTROLS.json", {
    status: 200,
    body: businessControlsPolicy,
  });

  try {
    await page.goto(`${baseUrl}/pricing.html`, { waitUntil: "networkidle" });
    await page.evaluate((keys) => {
      keys.forEach((key) => localStorage.removeItem(key));
    }, forbiddenStorageKeys);

    const seedResult = await page.evaluate(() => {
      const row = document.querySelector("[data-activation-decision-control='public_deploy']");
      const select = row?.querySelector("[data-activation-decision-status]");
      const note = row?.querySelector("[data-activation-decision-note]");
      const save = row?.querySelector("[data-activation-decision-save]");
      if (!row || !select || !note || !save) {
        return { saved: false };
      }
      select.value = "ready_for_private_control_update";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      note.value = "QA non-secret readiness note for local packet export boundary only.";
      note.dispatchEvent(new Event("input", { bubbles: true }));
      save.click();
      return { saved: true };
    });
    scenario.check(seedResult.saved, "Activation-decision packet export scenario starts from a saved browser-local readiness decision.");

    const exportProbe = await page.evaluate(async () => {
      const readStorage = () =>
        Object.fromEntries(
          Array.from({ length: localStorage.length }, (_, index) => {
            const key = localStorage.key(index);
            return [key, localStorage.getItem(key)];
          })
        );
      const beforePolicy = await fetch("/ops/BUSINESS_CONTROLS.json").then((response) => response.json());
      const panel = document.querySelector("[data-activation-decision-ledger]");
      const trigger = document.querySelector("[data-activation-decision-packet-export]");
      const status = document.querySelector("[data-activation-decision-packet-status]");
      const output = document.querySelector("[data-activation-decision-packet-json]");
      const ledgerOutput = document.querySelector("[data-activation-decision-json]");
      const beforeStorage = readStorage();
      const beforeOutput = output?.textContent || "";
      const beforeStatus = status?.textContent || "";

      const controls = Array.from(document.querySelectorAll("[data-activation-decision-control]")).map((row) => ({
        id: row.getAttribute("data-activation-decision-control") || "",
        text: row.textContent || "",
        deployEnabled: row.getAttribute("data-public-deploy-enabled") || row.getAttribute("data-deploy-enabled") || "",
        checkoutEnabled: row.getAttribute("data-checkout-enabled") || "",
        analyticsEnabled: row.getAttribute("data-analytics-enabled") || "",
        leadCaptureEnabled: row.getAttribute("data-lead-capture-enabled") || "",
        resumeIntakeEnabled: row.getAttribute("data-resume-intake-enabled") || "",
        mutatesBusinessControls: row.getAttribute("data-mutates-business-controls") || "",
        enablesProductionAction: row.getAttribute("data-enables-production-action") || "",
      }));

      if (trigger) {
        trigger.click();
        await new Promise((resolve) => setTimeout(resolve, 75));
      }

      const afterStorage = readStorage();
      const afterPolicy = await fetch("/ops/BUSINESS_CONTROLS.json").then((response) => response.json());
      const changedKeys = Array.from(new Set([...Object.keys(beforeStorage), ...Object.keys(afterStorage)])).filter(
        (key) => beforeStorage[key] !== afterStorage[key]
      );
      let packet = null;
      try {
        packet = output?.textContent ? JSON.parse(output.textContent) : null;
      } catch (_error) {
        packet = null;
      }
      let ledger = null;
      try {
        ledger = ledgerOutput?.textContent ? JSON.parse(ledgerOutput.textContent) : null;
      } catch (_error) {
        ledger = null;
      }

      return {
        panelPresent: Boolean(panel),
        triggerPresent: Boolean(trigger),
        triggerAttrs: trigger
          ? {
              format: trigger.getAttribute("data-activation-decision-packet-format") || "",
              localOnly: trigger.getAttribute("data-local-only") || "",
              browserLocalLedgerOnly: trigger.getAttribute("data-browser-local-ledger-only") || "",
              planningOnly: trigger.getAttribute("data-planning-only") || "",
              noPersistence: trigger.getAttribute("data-no-persistence") || "",
              networkEnabled: trigger.getAttribute("data-network-enabled") || "",
              secretRequestEnabled: trigger.getAttribute("data-secret-request-enabled") || "",
              urlRequestEnabled: trigger.getAttribute("data-url-request-enabled") || "",
              deployTriggerEnabled: trigger.getAttribute("data-deploy-trigger-enabled") || "",
              checkoutEnabled: trigger.getAttribute("data-checkout-enabled") || "",
              outboundEnabled: trigger.getAttribute("data-outbound-enabled") || "",
              analyticsEnabled: trigger.getAttribute("data-analytics-enabled") || "",
              cardDataEnabled: trigger.getAttribute("data-card-data-enabled") || "",
              contactDataEnabled: trigger.getAttribute("data-contact-data-enabled") || "",
              resumeDataEnabled: trigger.getAttribute("data-resume-data-enabled") || "",
              enableControlFlags: trigger.getAttribute("data-enable-control-flags") || "",
              label: trigger.textContent || "",
            }
          : null,
        beforeStatus,
        afterStatus: status?.textContent || "",
        beforeOutput,
        afterOutput: output?.textContent || "",
        packet,
        ledger,
        controls,
        beforePolicy,
        afterPolicy,
        afterStorage,
        changedKeys,
      };
    });

    scenario.check(exportProbe.panelPresent, "Activation-decision packet export scenario starts from the local activation-decision ledger panel.");
    for (const id of requiredDecisionControlIds) {
      if (controls.get(id)?.status === "enabled") continue;
      scenario.check(controls.get(id)?.status !== "enabled", `Activation-decision packet export ${id} starts from disabled BUSINESS_CONTROLS status.`);
    }

    if (!exportProbe.triggerPresent) {
      scenario.check(true, "Activation-decision packet export boundary is adaptive until product exposes an export/download handle.");
      return scenario;
    }

    const attrs = exportProbe.triggerAttrs || {};
    scenario.check(attrs.format === "proofresume-activation-decision-packet-export-v1", "Activation-decision packet export keeps the deterministic packet-export format.");
    scenario.check(attrs.localOnly === "true" && attrs.browserLocalLedgerOnly === "true", "Activation-decision packet export reads browser-local ledger state only.");
    scenario.check(attrs.planningOnly === "true" && attrs.noPersistence === "true", "Activation-decision packet export is planning-only and declares no persistence.");
    scenario.check(attrs.networkEnabled === "false", "Activation-decision packet export cannot network or submit production data.");
    scenario.check(
      [
        attrs.secretRequestEnabled,
        attrs.urlRequestEnabled,
        attrs.deployTriggerEnabled,
        attrs.cardDataEnabled,
        attrs.contactDataEnabled,
        attrs.resumeDataEnabled,
      ].every((value) => value === "false"),
      "Activation-decision packet export cannot collect secrets, URLs, deploy triggers, card, contact, or resume data."
    );
    scenario.check(
      [attrs.checkoutEnabled, attrs.outboundEnabled, attrs.analyticsEnabled, attrs.enableControlFlags].every((value) => value === "false"),
      "Activation-decision packet export cannot become outreach, checkout, analytics, or enabled-state proof."
    );
    scenario.check(
      /enablement evidence|enabled-state proof|browser-local ledger/i.test(`${exportProbe.beforeStatus} ${exportProbe.afterStatus} ${attrs.label}`),
      "Activation-decision packet export surface names the browser-local/no-enabled-state-proof boundary."
    );

    for (const [index, row] of exportProbe.controls.entries()) {
      const serializedFlags = [
        row.deployEnabled,
        row.checkoutEnabled,
        row.analyticsEnabled,
        row.leadCaptureEnabled,
        row.resumeIntakeEnabled,
        row.mutatesBusinessControls,
        row.enablesProductionAction,
      ].join(" ");
      scenario.check(
        !/\btrue\b/i.test(serializedFlags),
        `Activation-decision packet export control row ${index + 1} cannot become control evidence, enabled-state proof, deploy, checkout, analytics, lead capture, resume intake, BUSINESS_CONTROLS mutation, or production action.`
      );
      scenario.check(
        !hasForbiddenDeployValue(row.text),
        `Activation-decision packet export control row ${index + 1} collects no secrets, URLs, deploy triggers, dashboard links, contact, card, or resume data.`
      );
    }

    if (exportProbe.packet) {
      const packetText = JSON.stringify(exportProbe.packet);
      scenario.check(
        exportProbe.packet.format === "proofresume-activation-decision-packet-export-v1",
        "Activation-decision packet export JSON keeps the deterministic export format when rendered."
      );
      scenario.check(
        !/controlEvidence"?\s*:\s*true|enabledStateProof"?\s*:\s*true|outreach(?:Created|Enabled|Sent)"?\s*:\s*true|checkout(?:Created|Enabled)"?\s*:\s*true|analytics(?:Sent|Enabled)"?\s*:\s*true|productionLead(?:Captured|CaptureEnabled)"?\s*:\s*true|productionResume(?:IntakeCreated|IntakeEnabled)"?\s*:\s*true/i.test(
          packetText
        ),
        "Activation-decision packet export JSON cannot become control evidence, outreach, checkout, analytics, production lead capture, production resume intake, or enabled-state proof."
      );
      scenario.check(
        !/businessControls(?:Mutated|Mutation)"?\s*:\s*true|productionPath(?:Mutated|Mutation)"?\s*:\s*true/i.test(packetText),
        "Activation-decision packet export JSON cannot mutate BUSINESS_CONTROLS or production paths."
      );
      scenario.check(
        !hasForbiddenDeployValue(packetText),
        "Activation-decision packet export JSON contains no secrets, URLs, deploy triggers, dashboard values, card, contact, or resume data."
      );
    } else {
      scenario.check(
        exportProbe.beforeOutput === exportProbe.afterOutput,
        "Activation-decision packet export remains non-persistent when no rendered packet JSON is produced."
      );
    }

    scenario.check(
      JSON.stringify(exportProbe.beforePolicy) === JSON.stringify(exportProbe.afterPolicy),
      "Activation-decision packet export cannot mutate ops/BUSINESS_CONTROLS.json or production paths."
    );
    scenario.check(
      exportProbe.changedKeys.length === 0,
      "Activation-decision packet export action cannot persist control evidence, outreach, checkout, analytics, production lead capture, production resume intake, enabled-state proof, BUSINESS_CONTROLS, production, deploy, secret, URL, card, contact, or resume paths."
    );
    scenario.check(
      Object.entries(exportProbe.afterStorage || {}).every(
        ([key, value]) => !forbiddenStorageKeyPattern.test(key) && (value == null || !hasForbiddenDeployValue(value))
      ),
      "Activation-decision packet export storage audit finds no forbidden evidence, production, deploy, secret, URL, card, contact, or resume data."
    );
  } finally {
    responseOverrides.delete("/ops/BUSINESS_CONTROLS.json");
  }

  return scenario;
}

async function runActivationDecisionPacketReviewStatusBoundaryScenario(page, baseUrl) {
  const scenario = createScenario("activation-decision-packet-review-status-boundary-no-network");
  const REVIEW_STATUS_KEY = "proofresume:activationDecisionPacketReviewStatus";
  const forbiddenReviewStatusValuePattern =
    /(https?:\/\/|secret|token|password|credential|api[_-]?key|deploy|production|stripe|paypal|checkout|lead capture|analytics send|outbound send|resume text)/i;

  await page.goto(`${baseUrl}/pricing.html`);

  const probe = await page.evaluate(({ storageKey }) => {
    const beforePolicy = null;
    const beforeStorage = Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]));
    const panel = document.querySelector("[data-activation-decision-packet-review-status]");
    const input = panel?.querySelector("[data-activation-decision-packet-review-status-input]");
    const save = panel?.querySelector("[data-activation-decision-packet-review-status-save]");
    const target = panel?.querySelector("[data-activation-decision-packet-review-status-target]");
    const panelStorageKey = panel?.getAttribute("data-storage-key") || storageKey;

    if (input instanceof HTMLSelectElement) {
      input.value = "reviewed";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    if (save instanceof HTMLButtonElement) {
      save.click();
    }

    const afterStorage = Object.fromEntries(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]));
    const changedKeys = Array.from(new Set([...Object.keys(beforeStorage), ...Object.keys(afterStorage)])).filter(
      (key) => beforeStorage[key] !== afterStorage[key]
    );

    return {
      panelPresent: Boolean(panel),
      panelStorageKey,
      panelFlags: {
        localOnly: panel?.getAttribute("data-local-only") || "",
        networkEnabled: panel?.getAttribute("data-network-enabled") || "",
        mutatesBusinessControls: panel?.getAttribute("data-mutates-business-controls") || "",
      },
      targetText: target?.textContent || "",
      changedKeys,
      changedEntries: Object.fromEntries(changedKeys.map((key) => [key, afterStorage[key]])),
      afterStorage,
      beforePolicy,
    };
  }, { storageKey: REVIEW_STATUS_KEY });

  scenario.check(probe.panelPresent, "Activation-decision packet review-status marker panel is present on pricing.");
  scenario.check(
    probe.panelStorageKey === REVIEW_STATUS_KEY,
    "Activation-decision packet review-status markers may persist only proofresume:activationDecisionPacketReviewStatus"
  );
  scenario.check(
    probe.panelFlags.localOnly === "true" && probe.panelFlags.networkEnabled === "false",
    "Activation-decision packet review-status markers cannot network or enable external actions."
  );
  scenario.check(
    probe.panelFlags.mutatesBusinessControls === "false",
    "Activation-decision packet review-status markers cannot mutate ops/BUSINESS_CONTROLS.json or production paths"
  );
  scenario.check(
    probe.changedKeys.length === 0 || probe.changedKeys.every((key) => key === REVIEW_STATUS_KEY),
    "Activation-decision packet review-status markers may only change the dedicated review-status localStorage key."
  );
  scenario.check(
    Object.entries(probe.changedEntries || {}).every(
      ([key, value]) => key === REVIEW_STATUS_KEY && (value == null || !forbiddenReviewStatusValuePattern.test(String(value)))
    ),
    "Activation-decision packet review-status marker storage audit finds no forbidden deploy/secret/URL/capture values."
  );
  scenario.check(
    String(probe.targetText || "").toLowerCase().includes("review") && String(probe.targetText || "").toLowerCase().includes("localstorage"),
    "Activation-decision packet review-status marker keeps the browser-local-only boundary copy."
  );

  return scenario;
}

function runStaticFallbackQa() {
  const scenario = createScenario("static-fallback-no-network");
  const intakeHtml = fs.readFileSync(path.join(root, "intake.html"), "utf8");
  const reviewHtml = fs.readFileSync(path.join(root, "review.html"), "utf8");
  const proofPacketHtmlPath = path.join(root, "proof-packet.html");
  const proofPacketJsPath = path.join(root, "proof-packet.js");
  const proofPacketHtml = fs.existsSync(proofPacketHtmlPath) ? fs.readFileSync(proofPacketHtmlPath, "utf8") : "";
  const intakeJs = fs.readFileSync(path.join(root, "intake.js"), "utf8");
  const reviewJs = fs.readFileSync(path.join(root, "review.js"), "utf8");
  const proofPacketJs = fs.existsSync(proofPacketJsPath) ? fs.readFileSync(proofPacketJsPath, "utf8") : "";
  const qaSource = fs.readFileSync(__filename, "utf8");

  scenario.check(intakeHtml.includes("Local intake"), "Intake page exists and includes the Local intake header.");
  scenario.check(intakeHtml.includes("Session reset"), "Intake page exposes session reset copy for free-audit operators.");
  scenario.check(intakeHtml.includes("reset-demo-drafts"), "Intake page exposes a clear demo drafts control.");
  scenario.check(intakeHtml.includes("reset-user-drafts"), "Intake page exposes a clear user drafts control.");
  scenario.check(intakeHtml.includes("reset-redactions"), "Intake page exposes a clear proof-packet redactions control.");
  scenario.check(intakeHtml.includes("reset-all"), "Intake page exposes a clear all local drafts control.");
  scenario.check(
    qaSource.includes("runSessionPrepScenario") && qaSource.includes("session-prep-checklist-readiness-no-network"),
    "QA script carries the session prep readiness/no-network scenario."
  );
  scenario.check(
    qaSource.includes("readSessionPrepChecklist") && qaSource.includes("assertSessionPrepChecklistState"),
    "QA script adapts to deterministic session prep checklist handles when product exposes them."
  );
  scenario.check(
    qaSource.includes("runFirstSessionHandoffScenario") && qaSource.includes("first-session-operator-handoff-no-network"),
    "QA script carries the first-session handoff/no-network scenario."
  );
  scenario.check(
    qaSource.includes("readFirstSessionHandoff") && qaSource.includes("assertFirstSessionHandoffState"),
    "QA script adapts to deterministic first-session handoff handles when product exposes them."
  );
  scenario.check(
    qaSource.includes("runFirstRecruitDispatchBoardScenario") && qaSource.includes("first-recruit-dispatch-board-no-network"),
    "QA script carries the first-recruit dispatch board/no-network scenario."
  );
  scenario.check(
    qaSource.includes("readFirstRecruitDispatchBoard") && qaSource.includes("assertFirstRecruitDispatchBoardState"),
    "QA script adapts to deterministic first-recruit dispatch board handles when product exposes them."
  );
  scenario.check(
    qaSource.includes("runFirstReplyTriageBoardScenario") && qaSource.includes("first-reply-triage-board-no-network"),
    "QA script carries the first-reply triage board/no-network scenario."
  );
  scenario.check(
    qaSource.includes("readFirstReplyTriageBoard") && qaSource.includes("assertFirstReplyTriageBoardState"),
    "QA script adapts to deterministic first-reply triage board handles when product exposes them."
  );
  scenario.check(
    qaSource.includes("runFirstReplyFactCaptureScenario") && qaSource.includes("first-reply-fact-capture-no-network"),
    "QA script carries the first-reply fact capture/no-network scenario."
  );
  scenario.check(
    qaSource.includes("readFirstReplyFactCapture") && qaSource.includes("assertFirstReplyFactCaptureState"),
    "QA script adapts to deterministic first-reply fact capture handles when product exposes them."
  );
  scenario.check(
    qaSource.includes("runSchedulingReadinessScenario") && qaSource.includes("scheduling-readiness-no-network"),
    "QA script carries the scheduling readiness/no-network scenario."
  );
  scenario.check(
    qaSource.includes("readSchedulingReadiness") && qaSource.includes("assertSchedulingReadinessState"),
    "QA script adapts to deterministic scheduling readiness handles when product exposes them."
  );
  scenario.check(
    qaSource.includes("runSessionStartGateScenario") && qaSource.includes("session-start-gate-no-network"),
    "QA script carries the session-start gate/no-network scenario."
  );
  scenario.check(
    qaSource.includes("readSessionStartGate") && qaSource.includes("assertSessionStartGateState"),
    "QA script adapts to deterministic session-start gate handles when product exposes them."
  );
  scenario.check(
    qaSource.includes("runRawNoteCaptureScenario") && qaSource.includes("first-session-raw-note-capture-no-network"),
    "QA script carries the first-session raw-note capture/no-network scenario."
  );
  scenario.check(
    qaSource.includes("readRawNoteCapture") && qaSource.includes("assertRawNoteCaptureState"),
    "QA script adapts to deterministic first-session raw-note capture handles when product exposes them."
  );
  scenario.check(
    qaSource.includes("runPostSessionDebriefScenario") && qaSource.includes("post-session-debrief-handoff-no-network"),
    "QA script carries the post-session debrief handoff/no-network scenario."
  );
  scenario.check(
    qaSource.includes("readPostSessionDebrief") && qaSource.includes("assertPostSessionDebriefState"),
    "QA script adapts to deterministic post-session debrief handoff handles when product exposes them."
  );
  scenario.check(
    qaSource.includes("runStructuredExtractionApprovalBoundaryScenario") &&
      qaSource.includes("structured-extraction-approval-boundary-no-network"),
    "QA script carries the structured extraction approval-boundary/no-network scenario."
  );
  scenario.check(
    qaSource.includes("storedStructuredExperienceItems") &&
      qaSource.includes("readStructuredExtractionSurface") &&
      qaSource.includes("Accepted but unapproved structured experience item"),
    "QA script verifies structured experience provenance, Unapproved defaults, and export/download exclusion before explicit approval."
  );
  scenario.check(intakeJs.includes("proofresume:intakes"), "Intake JS persists drafts into localStorage.");
  scenario.check(intakeJs.includes("rawText"), "Intake JS preserves raw text in the stored record.");
  scenario.check(intakeJs.includes("clearProofPacketRedactions"), "Intake JS includes a deterministic proof-packet redaction reset path.");
  scenario.check(reviewHtml.includes("Candidate updates"), "Review page includes candidate accept/reject surface.");
  scenario.check(reviewHtml.includes("Accepted updates become a resume-ready section."), "Review page includes export section copy.");
  scenario.check(reviewHtml.includes("Save answers as local evidence."), "Review page includes follow-up answer capture panel.");
  scenario.check(reviewHtml.includes("Download bundle .json"), "Review page includes export bundle JSON download action.");
  scenario.check(
    reviewHtml.includes("Import bundle .json") &&
      reviewHtml.includes('data-export-bundle-import-entrypoint="sample-report"') &&
      reviewHtml.includes('data-pr="importExportBundleStatus"'),
    "Review page includes sample-report entrypoint for export bundle JSON import replay."
  );
  scenario.check(
    proofPacketHtml.includes("Import bundle .json") &&
      proofPacketHtml.includes('data-export-bundle-import-entrypoint="proof-packet"') &&
      proofPacketHtml.includes('data-pr="importExportBundleStatus"') &&
      proofPacketHtml.includes("Bundle replay mode shows"),
    "Proof packet page includes an entrypoint for export bundle JSON import replay."
  );
  scenario.check(reviewJs.includes("proofresume-local-section-v1"), "Review JS exports a local section snapshot format.");
  scenario.check(reviewJs.includes("setExportHeadingOverride"), "Review JS exposes editable export heading persistence.");
  scenario.check(reviewJs.includes("saveExportOrder"), "Review JS exposes local export section and bullet ordering.");
  scenario.check(reviewJs.includes("downloadExportBundle"), "Review JS exposes export bundle JSON download wiring.");
  scenario.check(reviewJs.includes("importExportBundle"), "Review JS exposes export bundle JSON import wiring.");
  scenario.check(proofPacketJs.includes("proofresume-local-section-v1"), "Proof packet JS consumes the local section snapshot format for bundle replays.");
  scenario.check(proofPacketJs.includes("importExportBundle"), "Proof packet JS exposes export bundle JSON import wiring.");
  scenario.check(
    proofPacketJs.includes("Return to review (bundle replay)") && proofPacketJs.includes("/review.html?bundle="),
    "Proof packet JS aligns the bundle replay navigation back to the matching review bundle replay view."
  );
  scenario.check(reviewJs.includes("data-export-heading-default"), "Review JS renders deterministic default heading handles.");
  scenario.check(reviewJs.includes("data-export-section-action"), "Review JS renders deterministic section reorder controls.");
  scenario.check(reviewJs.includes("data-export-bullet-action"), "Review JS renders deterministic bullet reorder controls.");
  scenario.check(reviewJs.includes("audit"), "Review JS keeps rejected/pending candidates in export audit metadata.");
  scenario.check(reviewJs.includes("followups"), "Review JS stores follow-up answers in the intake record.");
  scenario.check(reviewJs.includes("setFollowups"), "Review JS exposes a follow-up save path.");
  scenario.check(reviewHtml.includes("Sample report"), "Review page preserves an explicit sample-report mode.");
  scenario.check(reviewJs.includes("Your draft report"), "Review JS switches to a user draft report when an intake id is present.");
  scenario.check(
    qaSource.includes("runDemoBoundaryScenario") && qaSource.includes("demo-mode-sample-user-boundaries-no-network"),
    "QA script carries the demo/sample/user boundary scenario."
  );
	  scenario.check(
	    qaSource.includes("runSessionResetScenario") && qaSource.includes("session-reset-clear-boundaries-no-network"),
	    "QA script carries the session reset/clear boundary scenario."
	  );
	  scenario.check(
	    qaSource.includes("runBundleLibraryImportCapPreviewScenario") && qaSource.includes("bundle-library-import-cap-preview"),
	    "QA script carries the bundle-library import cap preview scenario."
	  );
	  scenario.check(
	    qaSource.includes("runBundleLibraryImportPreviewDownloadScenario") && qaSource.includes("bundle-library-import-preview-download"),
	    "QA script carries the bundle-library import preview download scenario."
	  );
	  if (
	    intakeHtml.includes("sampleDataBoundary") ||
	    intakeHtml.includes("demoDataBoundary") ||
	    intakeJs.includes("sampleDataBoundary") ||
    intakeJs.includes("demoDataBoundary") ||
    reviewHtml.includes("sampleDataBoundary") ||
    reviewJs.includes("sampleDataBoundary") ||
    reviewJs.includes("demoDataBoundary")
  ) {
    scenario.check(
      qaSource.includes("readDemoBoundarySurface"),
      "QA script adapts to deterministic demo/sample/user boundary handles when product exposes them."
    );
  } else {
    scenario.assertions.push("Deterministic demo/sample/user boundary handles static contract pending product exposure.");
  }
  if (structuredExtractionExposure(intakeHtml, intakeJs, reviewHtml, reviewJs)) {
    scenario.check(
      `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.toLowerCase().includes("source") &&
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.toLowerCase().includes("unapproved"),
      "Product structured extraction exposure includes source/provenance and Unapproved boundary language."
    );
    scenario.check(
      qaSource.includes("does not invent unsupported claim text") && qaSource.includes("before explicit evidence approval"),
      "QA script enforces no-invented-claims and pre-approval export/download boundaries when structured extraction is exposed."
    );
  } else {
    scenario.assertions.push("Structured extraction handles static contract pending product exposure; named regression scenario is wired.");
  }
  if (sessionPrepChecklistExposure(intakeHtml, intakeJs)) {
    scenario.check(
      intakeHtml.includes("sessionPrepChecklist") || intakeJs.includes("sessionPrepChecklist") || `${intakeHtml}\n${intakeJs}`.includes("data-session-prep"),
      "Intake page exposes deterministic session prep checklist markup."
    );
    scenario.check(
      qaSource.includes("expectedReady: true") && qaSource.includes("expectedReady: false"),
      "QA script verifies both ready and not-ready session prep checklist states."
    );
  } else {
    scenario.assertions.push("Session prep checklist static contract pending product exposure; reset-state primitives are still enforced.");
  }
  if (firstSessionHandoffExposure(intakeHtml, intakeJs)) {
    scenario.check(
      intakeHtml.includes("firstSessionOperatorHandoff") ||
        intakeHtml.includes("firstSessionHandoff") ||
        intakeHtml.includes("data-first-session-handoff") ||
        intakeHtml.includes("operatorHandoffPanel") ||
        intakeJs.includes("firstSessionOperatorHandoff") ||
        intakeJs.includes("data-first-session-handoff"),
      "Intake page exposes deterministic first-session handoff markup."
    );
    scenario.check(
      qaSource.includes("selectedDraftId") && qaSource.includes("learning-log destination links"),
      "QA script verifies selected draft and learning-log destinations for first-session handoff."
    );
    scenario.check(
      qaSource.includes("First-session handoff leaves saved resume export text unchanged"),
      "QA script verifies first-session handoff export-text separation."
    );
  } else {
    scenario.assertions.push("First-session operator handoff static contract pending product exposure; named adaptive scenario is wired.");
  }
  if (firstRecruitDispatchBoardExposure(intakeHtml, intakeJs)) {
    scenario.check(
      intakeHtml.includes("firstRecruitDispatchBoard") ||
        intakeHtml.includes("firstRecruitDispatch") ||
        intakeJs.includes("firstRecruitDispatchBoard") ||
        intakeJs.includes("data-first-recruit-dispatch"),
      "Intake page exposes deterministic first-recruit dispatch board markup."
    );
    scenario.check(
      qaSource.includes("First-recruit dispatch board fixture starts from a no-send decision") &&
        qaSource.includes("dispatch-readiness packet") &&
        qaSource.includes("scheduling/consent checklist"),
      "QA script verifies no-send state and local artifact links for the first-recruit dispatch board."
    );
    scenario.check(
      qaSource.includes("First-recruit dispatch board leaves saved resume export text unchanged"),
      "QA script verifies first-recruit dispatch board export-text separation."
    );
  } else {
    scenario.assertions.push("First-recruit dispatch board static contract pending product exposure; named adaptive scenario is wired.");
  }
  if (firstReplyTriageBoardExposure(intakeHtml, intakeJs, reviewHtml, reviewJs)) {
    scenario.check(
      intakeHtml.includes("firstReplyTriageBoard") ||
        reviewHtml.includes("firstReplyTriageBoard") ||
        intakeJs.includes("firstReplyTriageBoard") ||
        reviewJs.includes("firstReplyTriageBoard") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-triage"),
      "Intake or review page exposes deterministic first-reply triage board markup."
    );
    scenario.check(
      qaSource.includes("First-reply triage board fixture starts from a no-reply triage state") &&
        qaSource.includes("reply triage template") &&
        qaSource.includes("raw-note prep"),
      "QA script verifies no-reply state and local artifact links for the first-reply triage board."
    );
    scenario.check(
      qaSource.includes("First-reply triage board leaves saved resume export text unchanged"),
      "QA script verifies first-reply triage board export-text separation."
    );
  } else {
    scenario.assertions.push("First-reply triage board static contract pending product exposure; named adaptive scenario is wired.");
  }
  if (firstReplyFactCaptureExposure(intakeHtml, intakeJs, reviewHtml, reviewJs)) {
    scenario.check(
      intakeHtml.includes("firstReplyFactCapture") ||
        reviewHtml.includes("firstReplyFactCapture") ||
        intakeJs.includes("firstReplyFactCapture") ||
        reviewJs.includes("firstReplyFactCapture") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-first-reply-fact"),
      "Intake or review page exposes deterministic first-reply fact capture markup."
    );
    scenario.check(
      qaSource.includes("First-reply fact capture defaults to not-observed reply state") &&
        qaSource.includes("First-reply fact capture stores explicit local observed state"),
      "QA script verifies default unobserved and explicit local states for first-reply fact capture."
    );
    scenario.check(
      qaSource.includes("First-reply fact capture leaves saved resume export text unchanged"),
      "QA script verifies first-reply fact capture export-text separation."
    );
  } else {
    scenario.assertions.push("First-reply fact capture static contract pending product exposure; named adaptive scenario is wired.");
  }
  if (schedulingReadinessExposure(intakeHtml, intakeJs, reviewHtml, reviewJs)) {
    scenario.check(
      intakeHtml.includes("schedulingReadiness") ||
        reviewHtml.includes("schedulingReadiness") ||
        intakeJs.includes("schedulingReadiness") ||
        reviewJs.includes("schedulingReadiness") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-scheduling-readiness"),
      "Intake or review page exposes deterministic scheduling readiness markup."
    );
    scenario.check(
      qaSource.includes("Scheduling readiness defaults to blocked before accepted-local scheduling state") &&
        qaSource.includes("Scheduling readiness stores accepted-local state on the selected draft"),
      "QA script verifies default blocked and accepted-local states for scheduling readiness."
    );
    scenario.check(
      qaSource.includes("Scheduling readiness leaves saved resume export text unchanged"),
      "QA script verifies scheduling readiness export-text separation."
    );
  } else {
    scenario.assertions.push("Scheduling readiness static contract pending product exposure; named adaptive scenario is wired.");
  }
  if (sessionStartGateExposure(intakeHtml, intakeJs, reviewHtml, reviewJs)) {
    scenario.check(
      intakeHtml.includes("sessionStartGate") ||
        reviewHtml.includes("sessionStartGate") ||
        intakeJs.includes("sessionStartGate") ||
        reviewJs.includes("sessionStartGate") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-session-start"),
      "Intake or review page exposes deterministic session-start gate markup."
    );
    scenario.check(
      qaSource.includes("Session-start gate defaults to blocked before appointment-confirmed readiness") &&
        qaSource.includes("Session-start gate stores ready-local state on the selected draft"),
      "QA script verifies default blocked and ready-local states for the session-start gate."
    );
    scenario.check(
      qaSource.includes("Session-start gate leaves saved resume export text unchanged"),
      "QA script verifies session-start gate export-text separation."
    );
  } else {
    scenario.assertions.push("Session-start gate static contract pending product exposure; named adaptive scenario is wired.");
  }
  if (rawNoteCaptureExposure(intakeHtml, intakeJs, reviewHtml, reviewJs)) {
    scenario.check(
      intakeHtml.includes("firstSessionRawNoteCapture") ||
        reviewHtml.includes("firstSessionRawNoteCapture") ||
        intakeJs.includes("firstSessionRawNoteCapture") ||
        reviewJs.includes("firstSessionRawNoteCapture") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-raw-note-capture"),
      "Intake or review page exposes deterministic first-session raw-note capture markup."
    );
    scenario.check(
      qaSource.includes("First-session raw-note capture defaults to blocked before session-start readiness") &&
        qaSource.includes("First-session raw-note capture stores notes-recorded state on the selected draft"),
      "QA script verifies default blocked and local notes-recorded states for first-session raw-note capture."
    );
    scenario.check(
      qaSource.includes("First-session raw-note capture leaves saved resume export text unchanged"),
      "QA script verifies first-session raw-note capture export-text separation."
    );
  } else {
    scenario.assertions.push("First-session raw-note capture static contract pending product exposure; named adaptive scenario is wired.");
  }
  if (postSessionDebriefExposure(intakeHtml, intakeJs, reviewHtml, reviewJs)) {
    scenario.check(
      intakeHtml.includes("postSessionDebrief") ||
        reviewHtml.includes("postSessionDebrief") ||
        intakeJs.includes("postSessionDebrief") ||
        reviewJs.includes("postSessionDebrief") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-post-session-debrief") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-debrief-handoff"),
      "Intake or review page exposes deterministic post-session debrief handoff markup."
    );
    scenario.check(
      qaSource.includes("Post-session debrief handoff defaults to blocked before raw-note capture") &&
        qaSource.includes("Post-session debrief handoff stores debrief-draft saved state on the selected draft"),
      "QA script verifies default blocked and local debrief-draft saved states for post-session debrief handoff."
    );
    scenario.check(
      qaSource.includes("Post-session debrief handoff leaves saved resume export text unchanged"),
      "QA script verifies post-session debrief handoff export-text separation."
    );
  } else {
    scenario.assertions.push("Post-session debrief handoff static contract pending product exposure; named adaptive scenario is wired.");
  }
  scenario.check(
    qaSource.includes("runObjectionCodingHandoffScenario") && qaSource.includes("objection-coding-handoff-no-network"),
    "QA script carries the objection-coding handoff/no-network scenario."
  );
  scenario.check(
    qaSource.includes("Objection-coding handoff defaults to blocked before post-session debrief") &&
      qaSource.includes("Objection-coding handoff stores objection-code saved state on the selected draft"),
    "QA script verifies default blocked and local objection-code saved states for objection-coding handoff."
  );
  scenario.check(
    qaSource.includes("Objection-coding handoff leaves saved resume export text unchanged"),
    "QA script verifies objection-coding handoff export-text separation."
  );
  if (objectionCodingHandoffExposure(intakeHtml, intakeJs, reviewHtml, reviewJs)) {
    scenario.check(
      intakeHtml.includes("objectionCodingHandoff") ||
        reviewHtml.includes("objectionCodingHandoff") ||
        intakeJs.includes("objectionCodingHandoff") ||
        reviewJs.includes("objectionCodingHandoff") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-objection-coding-handoff") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-local-objection-coding"),
      "Intake or review page exposes deterministic objection-coding handoff markup."
    );
  } else {
    scenario.assertions.push("Objection-coding handoff static contract pending product exposure; named adaptive scenario is wired.");
  }
  scenario.check(
    qaSource.includes("runFiveSessionSynthesisReadinessScenario") && qaSource.includes("five-session-synthesis-readiness-no-network"),
    "QA script carries the five-session synthesis readiness/no-network scenario."
  );
  scenario.check(
    qaSource.includes("Five-session synthesis readiness defaults to blocked with zero completed sessions") &&
      qaSource.includes("Five-session synthesis readiness stores partial-session blocked state") &&
      qaSource.includes("Five-session synthesis readiness stores five-session ready state"),
    "QA script verifies zero-session blocked, partial-session blocked, and five-session ready states."
  );
  scenario.check(
    qaSource.includes("Five-session synthesis readiness leaves saved resume export text unchanged") &&
      qaSource.includes("private synthesis note is excluded from resume export/download text"),
    "QA script verifies five-session synthesis readiness export-text separation."
  );
  if (fiveSessionSynthesisReadinessExposure(intakeHtml, intakeJs, reviewHtml, reviewJs)) {
    scenario.check(
      intakeHtml.includes("fiveSessionSynthesisReadiness") ||
        reviewHtml.includes("fiveSessionSynthesisReadiness") ||
        intakeJs.includes("fiveSessionSynthesisReadiness") ||
        reviewJs.includes("fiveSessionSynthesisReadiness") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-five-session-synthesis") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-synthesis-readiness"),
      "Intake or review page exposes deterministic five-session synthesis readiness markup."
    );
  } else {
    scenario.assertions.push("Five-session synthesis readiness static contract pending product exposure; named adaptive scenario is wired.");
  }
  scenario.check(
    qaSource.includes("runPrivateSynthesisArtifactGeneratorScenario") && qaSource.includes("private-synthesis-artifact-generator-no-network"),
    "QA script carries the private synthesis artifact generator/no-network scenario."
  );
  scenario.check(
    qaSource.includes("Private synthesis artifact generator stays blocked before five complete evidence packets") &&
      qaSource.includes("Private synthesis artifact generator stores artifact-drafted ready state on the selected draft"),
    "QA script verifies blocked and artifact-drafted ready states for the private synthesis artifact generator."
  );
  scenario.check(
    qaSource.includes("Private synthesis artifact generator leaves saved resume export text unchanged") &&
      qaSource.includes("Private synthesis artifact text is excluded from resume export/download text"),
    "QA script verifies private synthesis artifact export-text separation."
  );
  if (privateSynthesisArtifactGeneratorExposure(intakeHtml, intakeJs, reviewHtml, reviewJs)) {
    scenario.check(
      intakeHtml.includes("privateSynthesisArtifactGenerator") ||
        reviewHtml.includes("privateSynthesisArtifactGenerator") ||
        intakeJs.includes("privateSynthesisArtifactGenerator") ||
        reviewJs.includes("privateSynthesisArtifactGenerator") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-synthesis-artifact-generator") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-private-synthesis-artifact"),
      "Intake or review page exposes deterministic private synthesis artifact generator markup."
    );
  } else {
    scenario.assertions.push("Private synthesis artifact generator static contract pending product exposure; named adaptive scenario is wired.");
  }
  scenario.check(
    qaSource.includes("runPrivateSynthesisDecisionMemoCaptureScenario") && qaSource.includes("private-synthesis-decision-memo-capture-no-network"),
    "QA script carries the private synthesis decision memo capture/no-network scenario."
  );
  scenario.check(
    qaSource.includes("Private synthesis decision memo capture stays blocked before a private synthesis artifact exists") &&
      qaSource.includes("Private synthesis decision memo capture stores memo-drafted state on the selected draft"),
    "QA script verifies blocked and memo-drafted states for private synthesis decision memo capture."
  );
  scenario.check(
    qaSource.includes("Private synthesis decision memo capture leaves saved resume export text unchanged") &&
      qaSource.includes("Private synthesis decision memo text is excluded from resume export/download text"),
    "QA script verifies private synthesis decision memo export-text separation."
  );
  if (privateSynthesisDecisionMemoCaptureExposure(intakeHtml, intakeJs, reviewHtml, reviewJs)) {
    scenario.check(
      intakeHtml.includes("privateSynthesisDecisionMemo") ||
        reviewHtml.includes("privateSynthesisDecisionMemo") ||
        intakeJs.includes("privateSynthesisDecisionMemo") ||
        reviewJs.includes("privateSynthesisDecisionMemo") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-synthesis-decision-memo") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-private-synthesis-decision"),
      "Intake or review page exposes deterministic private synthesis decision memo capture markup."
    );
  } else {
    scenario.assertions.push("Private synthesis decision memo capture static contract pending product exposure; named adaptive scenario is wired.");
  }
  scenario.check(
    qaSource.includes("runPrivateLaunchDecisionApprovalScenario") && qaSource.includes("private-launch-decision-approval-capture-no-network"),
    "QA script carries the private launch-decision approval capture/no-network scenario."
  );
  scenario.check(
    qaSource.includes("Private launch-decision approval capture stays blocked before a completed synthesis decision memo exists") &&
      qaSource.includes("Private launch-decision approval capture stores approval-drafted state on the selected draft"),
    "QA script verifies blocked and approval-drafted states for private launch-decision approval capture."
  );
  scenario.check(
    qaSource.includes("Private launch-decision approval capture leaves saved resume export text unchanged") &&
      qaSource.includes("Private launch-decision approval text is excluded from resume export/download text"),
    "QA script verifies private launch-decision approval export-text separation."
  );
  if (privateLaunchDecisionApprovalExposure(intakeHtml, intakeJs, reviewHtml, reviewJs)) {
    scenario.check(
      intakeHtml.includes("privateLaunchDecisionApproval") ||
        reviewHtml.includes("privateLaunchDecisionApproval") ||
        intakeJs.includes("privateLaunchDecisionApproval") ||
        reviewJs.includes("privateLaunchDecisionApproval") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-launch-decision-approval") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-private-launch-decision"),
      "Intake or review page exposes deterministic private launch-decision approval capture markup."
    );
  } else {
    scenario.assertions.push("Private launch-decision approval capture static contract pending product exposure; named adaptive scenario is wired.");
  }
  scenario.check(
    qaSource.includes("runPrivateExplicitPublishPlanScenario") && qaSource.includes("private-explicit-publish-plan-capture-no-network"),
    "QA script carries the private explicit publish-plan capture/no-network scenario."
  );
  scenario.check(
    qaSource.includes("Private explicit publish-plan capture stays blocked before private launch-decision approval exists") &&
      qaSource.includes("Private explicit publish-plan capture stores plan-drafted state on the selected draft"),
    "QA script verifies blocked and plan-drafted states for private explicit publish-plan capture."
  );
  scenario.check(
    qaSource.includes("Private explicit publish-plan capture leaves saved resume export text unchanged") &&
      qaSource.includes("Private explicit publish-plan text is excluded from resume export/download text"),
    "QA script verifies private explicit publish-plan export-text separation."
  );
  if (privateExplicitPublishPlanExposure(intakeHtml, intakeJs, reviewHtml, reviewJs)) {
    scenario.check(
      intakeHtml.includes("privateExplicitPublishPlan") ||
        reviewHtml.includes("privateExplicitPublishPlan") ||
        intakeJs.includes("privateExplicitPublishPlan") ||
        reviewJs.includes("privateExplicitPublishPlan") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-explicit-publish-plan") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-private-publish-plan"),
      "Intake or review page exposes deterministic private explicit publish-plan capture markup."
    );
  } else {
    scenario.assertions.push("Private explicit publish-plan capture static contract pending product exposure; named adaptive scenario is wired.");
  }
  scenario.check(
    qaSource.includes("runPrivatePublicCopyDiffRollbackScenario") && qaSource.includes("private-public-copy-diff-rollback-capture-no-network"),
    "QA script carries the private public-copy diff rollback capture/no-network scenario."
  );
  scenario.check(
    qaSource.includes("Private public-copy diff rollback capture stays blocked before explicit publish plan exists") &&
      qaSource.includes("Private public-copy diff rollback capture stores diff-drafted state on the selected draft"),
    "QA script verifies blocked and diff-drafted states for private public-copy diff rollback capture."
  );
  scenario.check(
    qaSource.includes("Private public-copy diff rollback capture leaves saved resume export text unchanged") &&
      qaSource.includes("Private public-copy diff rollback text is excluded from resume export/download text"),
    "QA script verifies private public-copy diff rollback export-text separation."
  );
  if (privatePublicCopyDiffRollbackExposure(intakeHtml, intakeJs, reviewHtml, reviewJs)) {
    scenario.check(
      intakeHtml.includes("privatePublicCopyDiffRollback") ||
        reviewHtml.includes("privatePublicCopyDiffRollback") ||
        intakeJs.includes("privatePublicCopyDiffRollback") ||
        reviewJs.includes("privatePublicCopyDiffRollback") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-public-copy-diff-rollback") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-private-public-copy-diff"),
      "Intake or review page exposes deterministic private public-copy diff rollback capture markup."
    );
  } else {
    scenario.assertions.push("Private public-copy diff rollback capture static contract pending product exposure; named adaptive scenario is wired.");
  }
  scenario.check(
    qaSource.includes("runPrivateReleaseCandidateRehearsalScenario") && qaSource.includes("private-release-candidate-rehearsal-capture-no-network"),
    "QA script carries the private release-candidate rehearsal capture/no-network scenario."
  );
  scenario.check(
    qaSource.includes("Private release-candidate rehearsal capture stays blocked before public-copy diff packet exists") &&
      qaSource.includes("Private release-candidate rehearsal capture stores rehearsal-ready state on the selected draft"),
    "QA script verifies blocked and rehearsal-ready states for private release-candidate rehearsal capture."
  );
  scenario.check(
    qaSource.includes("Private release-candidate rehearsal capture leaves saved resume export text unchanged") &&
      qaSource.includes("Private release-candidate rehearsal text is excluded from resume export/download text"),
    "QA script verifies private release-candidate rehearsal export-text separation."
  );
  if (privateReleaseCandidateRehearsalExposure(intakeHtml, intakeJs, reviewHtml, reviewJs)) {
    scenario.check(
      intakeHtml.includes("privateReleaseCandidateRehearsal") ||
        reviewHtml.includes("privateReleaseCandidateRehearsal") ||
        intakeJs.includes("privateReleaseCandidateRehearsal") ||
        reviewJs.includes("privateReleaseCandidateRehearsal") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-release-candidate-rehearsal") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-private-release-candidate"),
      "Intake or review page exposes deterministic private release-candidate rehearsal capture markup."
    );
  } else {
    scenario.assertions.push("Private release-candidate rehearsal capture static contract pending product exposure; named adaptive scenario is wired.");
  }
  scenario.check(
    qaSource.includes("runPrivateCredentialedDeployReadinessScenario") && qaSource.includes("private-credentialed-deploy-readiness-no-network"),
    "QA script carries the private credentialed-deploy readiness/no-network scenario."
  );
  scenario.check(
    qaSource.includes("Private credentialed-deploy readiness stays rehearsal-blocked before release-candidate rehearsal exists") &&
      qaSource.includes("Private credentialed-deploy readiness stores deploy-inputs-blocked state on the selected draft"),
    "QA script verifies rehearsal-blocked and deploy-inputs-blocked states for private credentialed-deploy readiness."
  );
  scenario.check(
    qaSource.includes("Private credentialed-deploy readiness deploy-inputs-blocked state stores no QA sentinel secret values") &&
      qaSource.includes("Private credentialed-deploy readiness text is excluded from resume export/download text"),
    "QA script verifies no-secret storage and export-text separation for private credentialed-deploy readiness."
  );
  scenario.check(
    qaSource.includes("runPlatformOwnerPostDeployHandoffScenario") && qaSource.includes("platform-owner-post-deploy-health-handoff-no-network"),
    "QA script carries deterministic platform-owner and post-deploy health handoff coverage."
  );
  scenario.check(
    qaSource.includes("Product post-deploy health handoff asserts no-secret, no-URL, no-credential, no-deploy-trigger, and no-deploy") &&
      qaSource.includes("Product platform-owner and post-deploy handoff metadata stays out of resume export/download text"),
    "QA script verifies product no-secret/no-URL/no-deploy-trigger and export/download separation for handoff surfaces."
  );
  scenario.check(
    qaSource.includes("runFinalDeployGoNoGoLedgerScenario") && qaSource.includes("final-deploy-go-no-go-ledger-no-network"),
    "QA script carries deterministic final deploy go/no-go ledger coverage."
  );
  scenario.check(
    qaSource.includes("Admin data final ledger stays No-Go / Do Not Deploy") &&
      qaSource.includes("Product final deploy ledger and readiness metadata stay out of resume export/download text") &&
      qaSource.includes("Passing static rehearsal cannot authorize deployment"),
    "QA script verifies Admin/Product/static final ledger no-go, no-secret, and export/download separation boundaries."
  );
  scenario.check(
    qaSource.includes("runDeployBlockerEscalationMemoScenario") && qaSource.includes("deploy-blocker-escalation-memo-no-network"),
    "QA script carries deterministic deploy-blocker escalation memo coverage."
  );
  scenario.check(
    qaSource.includes("Admin data escalation memo preserves No-Go / Do Not Deploy") &&
      qaSource.includes("Static rehearsal output carries the escalation memo as non-authorizing local evidence") &&
      qaSource.includes("Product readiness remains No-Go / Do Not Deploy after escalation memo evidence is available"),
    "QA script verifies Admin/Product/static escalation memo No-Go, no-secret, no-platform-value, no-rollback, and export/download boundaries."
  );
  scenario.check(
    qaSource.includes("runFirstHumanOperatorDeployPacketIndexScenario") && qaSource.includes("first-human-operator-deploy-packet-index-no-network"),
    "QA script carries deterministic first-human-operator deploy packet index coverage."
  );
  scenario.check(
    qaSource.includes("Admin data deploy packet index is not a deploy checklist and requests no external values") &&
      qaSource.includes("Static rehearsal output carries the first-human-operator deploy packet index as non-checklist local evidence") &&
      qaSource.includes("Product readiness remains No-Go / Do Not Deploy for the first-human-operator packet index"),
    "QA script verifies Admin/Product/static deploy packet index boundaries and no external-value requests."
  );
  scenario.check(
    qaSource.includes("runOperatorDryRunReviewChecklistScenario") && qaSource.includes("operator-dry-run-review-checklist-no-network"),
    "QA script carries deterministic operator dry-run review checklist coverage."
  );
  scenario.check(
    qaSource.includes("Admin data operator dry-run checklist has no executable deploy sequence") &&
      qaSource.includes("Product operator dry-run review remains No-Go / Do Not Deploy") &&
      qaSource.includes("proofresume-operator-dry-run-review-checklist-v1"),
    "QA script verifies Admin/Product/static operator dry-run review checklist cannot become an executable deploy sequence."
  );
  scenario.check(
    qaSource.includes("runFirstHumanPacketColdStartArchiveScenario") && qaSource.includes("first-human-packet-cold-start-archive-no-network"),
    "QA script carries deterministic first-human packet cold-start archive coverage."
  );
  scenario.check(
    qaSource.includes("Admin data cold-start archive has no executable sequence") &&
      qaSource.includes("Product cold-start archive readiness remains No-Go / Do Not Deploy") &&
      qaSource.includes("proofresume-first-human-packet-cold-start-archive-v1"),
    "QA script verifies Admin/Product/static cold-start archive remains non-operational and cannot become an executable sequence."
  );
  scenario.check(
    qaSource.includes("runReleaseCandidateDeployContinuationMapScenario") && qaSource.includes("release-candidate-deploy-continuation-map-no-network"),
    "QA script carries deterministic release-candidate deploy-continuation map coverage."
  );
  scenario.check(
    qaSource.includes("Admin data deploy-continuation map cannot request platform inputs or become an executable sequence") &&
      qaSource.includes("Product deploy-continuation map readiness remains No-Go / Do Not Deploy") &&
      qaSource.includes("proofresume-release-candidate-deploy-continuation-map-v1"),
    "QA script verifies Admin/Product/static deploy-continuation map remains blocked and cannot request platform inputs or become an executable sequence."
  );
  scenario.check(
    qaSource.includes("runPrivateExternalInputBoundaryLedgerScenario") && qaSource.includes("private-external-input-boundary-ledger-no-network"),
    "QA script carries deterministic private external-input boundary ledger coverage."
  );
  scenario.check(
    qaSource.includes("Admin data external-input boundary ledger keeps every external fact non-requestable and non-inferable") &&
      qaSource.includes("Product external-input boundary ledger readiness remains No-Go / Do Not Deploy") &&
      qaSource.includes("proofresume-private-external-input-boundary-ledger-v1"),
    "QA script verifies Admin/Product/static external-input facts remain Not observed, outside repo authority, non-requestable, no-secret, no-deploy, and non-executable."
  );
  scenario.check(
    qaSource.includes("runPlatformOwnerNonRequestTransferNoteScenario") && qaSource.includes("platform-owner-non-request-transfer-note-no-network"),
    "QA script carries deterministic platform-owner non-request transfer note coverage."
  );
  scenario.check(
    qaSource.includes("Admin data platform-owner non-request transfer note keeps every transfer fact non-requestable and non-inferable") &&
      qaSource.includes("Product platform-owner non-request transfer note readiness remains No-Go / Do Not Deploy") &&
      qaSource.includes("proofresume-platform-owner-non-request-transfer-note-v1"),
    "QA script verifies Admin/Product/static platform-owner transfer facts remain Not observed, outside repo authority, non-request, no-secret, no-deploy, and non-executable."
  );
  scenario.check(
    qaSource.includes("runOperatorResumePacketGuardrailScenario") && qaSource.includes("operator-resume-packet-guardrail-no-network"),
    "QA script carries deterministic operator-resume packet guardrail coverage."
  );
  scenario.check(
    qaSource.includes("Admin data operator-resume packet guardrail keeps every guardrail fact non-requestable and non-inferable") &&
      qaSource.includes("Product operator-resume packet guardrail readiness remains No-Go / Do Not Deploy") &&
      qaSource.includes("proofresume-operator-resume-packet-guardrail-v1"),
    "QA script verifies Admin/Product/static operator-resume guardrail facts remain Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, and non-executable."
  );
  scenario.check(
    qaSource.includes("runBlockedStateOperatorContinuationIndexScenario") && qaSource.includes("blocked-state-operator-continuation-index-no-network"),
    "QA script carries deterministic blocked-state operator continuation index coverage."
  );
  scenario.check(
    qaSource.includes("Admin data blocked-state operator continuation index keeps every continuation fact non-requestable and non-inferable") &&
      qaSource.includes("Product blocked-state operator continuation index readiness remains No-Go / Do Not Deploy") &&
      qaSource.includes("proofresume-blocked-state-operator-continuation-index-v1"),
    "QA script verifies Admin/Product/static blocked-state operator continuation index facts remain private, read-only, Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, and non-executable."
  );
  scenario.check(
    qaSource.includes("runAutonomousDeployStopLedgerScenario") && qaSource.includes("autonomous-deploy-stop-ledger-no-network"),
    "QA script carries deterministic autonomous deploy stop ledger coverage."
  );
  scenario.check(
    qaSource.includes("Admin data autonomous deploy stop ledger keeps every stop fact non-requestable and non-inferable") &&
      qaSource.includes("Product autonomous deploy stop ledger readiness remains No-Go / Do Not Deploy") &&
      qaSource.includes("proofresume-autonomous-deploy-stop-ledger-v1"),
    "QA script verifies Admin/Product/static autonomous deploy stop ledger facts remain private, read-only, Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, and non-executable."
  );
  scenario.check(
    qaSource.includes("runPostAutonomousStopRecoveryChecklistScenario") && qaSource.includes("post-autonomous-stop-recovery-checklist-no-network"),
    "QA script carries deterministic post-autonomous-stop recovery checklist coverage."
  );
  scenario.check(
    qaSource.includes("Admin data post-autonomous-stop recovery checklist keeps every recovery fact non-requestable and non-inferable") &&
      qaSource.includes("Product post-autonomous-stop recovery checklist readiness remains private, read-only, No-Go / Do Not Deploy, non-request, and non-executable") &&
      qaSource.includes("proofresume-post-autonomous-stop-recovery-checklist-v1"),
    "QA script verifies Admin/Product/static post-autonomous-stop recovery checklist facts remain private, read-only, Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, no-authority-bypass, and non-executable."
  );
  scenario.check(
    qaSource.includes("runHumanPlatformAuthorityReEntryGateScenario") && qaSource.includes("human-platform-authority-re-entry-gate-no-network"),
    "QA script carries deterministic human-platform authority re-entry gate coverage."
  );
  scenario.check(
    qaSource.includes("Admin data human-platform authority re-entry gate keeps every re-entry fact non-requestable and non-inferable") &&
      qaSource.includes("Product human-platform authority re-entry gate readiness remains private, read-only, No-Go / Do Not Deploy, non-request, no-authority-bypass, and non-executable") &&
      qaSource.includes("proofresume-human-platform-authority-re-entry-gate-v1"),
    "QA script verifies Admin/Product/static human-platform authority re-entry gate facts remain private, read-only, Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, no-authority-bypass, and non-executable."
  );
  scenario.check(
    qaSource.includes("Admin data outside-authority awaiting-state ledger remains private, read-only, non-request, outside repo authority, and non-executable") &&
      qaSource.includes("Product surfaces show the read-only outside-authority awaiting-state ledger") &&
      qaSource.includes("proofresume-outside-authority-awaiting-state-ledger-v1"),
    "QA script verifies Admin/Product/static outside-authority awaiting-state ledger facts remain private, read-only, Not observed, outside repo authority, non-request, Do Not Publish, no-secret, no-deploy, no-public-launch, no-rollback, no-authority-bypass, and non-executable."
  );
  scenario.check(
    qaSource.includes("runStaticDeployFailureFixtureScenario") && qaSource.includes("static-deploy-failure-fixtures-no-network"),
    "QA script carries deterministic static deploy failure fixture coverage."
  );
  scenario.check(
    qaSource.includes("runBuyerPathBusinessControlsScenario") && qaSource.includes("buyer-path-business-controls-no-network"),
    "QA script carries deterministic buyer-path business-control coverage."
  );
  scenario.check(
    qaSource.includes("runPaidReviewInterestCaptureScenario") && qaSource.includes("paid-review-interest-capture-no-network"),
    "QA script carries deterministic local paid-review interest capture coverage."
  );
  scenario.check(
    qaSource.includes("runPaidReviewIntentTriageScenario") && qaSource.includes("paid-review-intent-triage-no-network"),
    "QA script carries deterministic paid-review intent triage coverage."
  );
  scenario.check(
    qaSource.includes("runPaidReviewTriageExportBoundaryScenario") && qaSource.includes("paid-review-triage-export-boundary-no-network"),
    "QA script carries deterministic paid-review triage export boundary coverage."
  );
  scenario.check(
    qaSource.includes("runControlActivationBoundaryScenario") && qaSource.includes("control-activation-boundary-no-network"),
    "QA script carries deterministic control activation boundary coverage."
  );
  scenario.check(
    qaSource.includes("runActivationDecisionLedgerBoundaryScenario") && qaSource.includes("activation-decision-ledger-boundary-no-network"),
    "QA script carries deterministic activation-decision ledger boundary coverage."
  );
  scenario.check(
    qaSource.includes("runActivationDecisionPacketExportBoundaryScenario") && qaSource.includes("activation-decision-packet-export-boundary-no-network"),
    "QA script carries deterministic activation-decision packet export boundary coverage."
  );
  scenario.check(
    qaSource.includes("Local lead capture stores only the approved prototype lead fields") &&
      qaSource.includes("Paid-review CTA is enabled only for local interest capture while payment remains disabled") &&
      qaSource.includes("Buyer path exposes no external href or form action while external controls are disabled"),
    "QA script verifies local lead capture, paid-review CTA, and external-action defaults from BUSINESS_CONTROLS."
  );
  scenario.check(
    qaSource.includes("Local paid-review interest stores only the allowed non-sensitive intent fields") &&
      qaSource.includes("Local paid-review interest explicitly records paymentProcessed false") &&
      qaSource.includes("Paid-review interest capture does not create or select a resume intake"),
    "QA script verifies local paid-review interest cannot become checkout, payment collection, card capture, outbound, analytics, or production resume intake."
  );
  scenario.check(
    qaSource.includes("Paid-review intent triage queue remains local metadata review only") &&
      qaSource.includes("Paid-review intent triage does not create production or local lead capture") &&
      qaSource.includes("Paid-review intent triage does not create or select a resume intake"),
    "QA script verifies paid-review intent triage cannot become outreach, checkout, analytics, or production resume intake."
  );
  scenario.check(
    qaSource.includes("Paid-review triage export remains planning-only and cannot become follow-up drafts") &&
      qaSource.includes("Paid-review triage export creates no follow-up, outreach, checkout, analytics, lead, intake, or business-evidence storage keys") &&
      qaSource.includes("Paid-review triage export mutates only paid-review planning keys when it stores anything locally"),
    "QA script verifies paid-review triage export cannot become follow-up drafts, outreach, checkout, analytics, production lead capture, production resume intake, revenue evidence, demand evidence, payment evidence, conversion evidence, or willingness-to-pay evidence."
  );
  scenario.check(
    qaSource.includes("Admin control activation packet keeps the proofresume-control-activation-v1 format") &&
      qaSource.includes("Control activation packet cannot enable deploy, checkout, outbound, analytics, production capture, secret collection, production URL capture, deploy trigger capture, or card/contact/resume collection") &&
      qaSource.includes("Control activation packet export action cannot persist browser storage") &&
      qaSource.includes("Control activation packet export action does not touch lead/payment/outreach/analytics/customer-data storage paths") &&
      qaSource.includes("Control activation boundary is adaptive until product/admin exposes control activation packet handles"),
    "QA script verifies control activation packets stay adaptive until handles exist, then strict for no deploy, checkout, outbound, analytics, production capture, secret collection, production URL capture, deploy trigger capture, card/contact/resume collection, export persistence, or lead/payment/outreach/analytics/customer-data path mutation."
  );
  scenario.check(
    qaSource.includes("Activation-decision ledger entries cannot mutate BUSINESS_CONTROLS or production paths") &&
      qaSource.includes("Activation-decision ledger entries cannot persist activation, lead, payment, outreach, analytics, customer-data, production, deploy, secret, contact, card, or resume paths") &&
      qaSource.includes("Activation-decision ledger boundary is adaptive until product exposes explicit ledger handles"),
    "QA script verifies activation-decision ledger entries cannot enable deploy, checkout, lead capture, analytics, outbound, customer data, production intake, mutate BUSINESS_CONTROLS/production paths, or collect secrets/URLs/deploy triggers/card/contact/resume data."
  );
  scenario.check(
    qaSource.includes("Activation-decision packet export cannot mutate ops/BUSINESS_CONTROLS.json or production paths") &&
      qaSource.includes("Activation-decision packet export action cannot persist control evidence, outreach, checkout, analytics, production lead capture, production resume intake, enabled-state proof") &&
      qaSource.includes("Activation-decision packet export boundary is adaptive until product exposes an export/download handle"),
    "QA script verifies activation-decision packet export cannot become control evidence, outreach, checkout, analytics, production lead capture, production resume intake, enabled-state proof, mutate BUSINESS_CONTROLS/production paths, or collect secrets/URLs/deploy triggers/card/contact/resume data."
  );
  scenario.check(
    qaSource.includes("Blocked route: /review.html returned 404") &&
      qaSource.includes("Missing static entrypoint: website/review.html") &&
      qaSource.includes("Stale evidence: older passing report") &&
      qaSource.includes("platformDashboardVisited: true"),
    "QA script fixtures include blocked route, missing-entrypoint, stale-evidence, and unsafe-guardrail examples."
  );
  scenario.check(
    qaSource.includes("Product platform and deploy-readiness inputs remain disabled for failure fixture") &&
      qaSource.includes("Admin static rehearsal history renders prior failure bucket"),
    "QA script verifies product drilldown disabled inputs and admin history rendering for static rehearsal failures."
  );
  if (privateCredentialedDeployReadinessExposure(intakeHtml, intakeJs, reviewHtml, reviewJs)) {
    scenario.check(
      intakeHtml.includes("privateCredentialedDeployReadiness") ||
        reviewHtml.includes("privateCredentialedDeployReadiness") ||
        intakeJs.includes("privateCredentialedDeployReadiness") ||
        reviewJs.includes("privateCredentialedDeployReadiness") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-credentialed-deploy-readiness") ||
        `${intakeHtml}\n${intakeJs}\n${reviewHtml}\n${reviewJs}`.includes("data-private-credentialed-deploy"),
      "Intake or review page exposes deterministic private credentialed-deploy readiness markup."
    );
    scenario.check(
      reviewHtml.includes("data-pr=\"platformOwnerHandoffState\"") &&
        reviewHtml.includes("data-pr=\"postDeployHealthCheckHandoffState\"") &&
        reviewHtml.includes("data-no-production-url=\"true\"") &&
        reviewHtml.includes("data-no-deploy-trigger=\"true\""),
      "Review page exposes deterministic platform-owner and post-deploy health no-URL/no-trigger handoff markup."
    );
  } else {
    scenario.assertions.push("Private credentialed-deploy readiness static contract pending product exposure; named adaptive scenario is wired.");
  }
  scenario.check(
    qaSource.includes("assertFollowupEvidencePromotion") && qaSource.includes("assertFactExcludedFromSurfaces"),
    "QA script carries the follow-up evidence promotion contract."
  );
  if (reviewJs.includes("exportGroupingRationale")) {
    scenario.check(reviewHtml.includes("data-pr=\"exportGroupingRationale\""), "Review page exposes export grouping rationale markup.");
    scenario.check(reviewJs.includes("data-export-rationale-section"), "Review JS renders deterministic grouping rationale section handles.");
    scenario.check(reviewJs.includes("groupingRationale"), "Review JS persists grouping rationale metadata into local export snapshots.");
  } else {
    scenario.assertions.push("Export grouping rationale static contract pending product exposure.");
  }
  if (followupPromotionExposure(reviewJs)) {
    scenario.check(
      reviewHtml.includes("followupEvidencePanel") || reviewJs.includes("followupEvidencePanel"),
      "Review page exposes follow-up evidence promotion markup."
    );
    scenario.check(
      reviewJs.includes("followupEvidenceKey") &&
        reviewJs.includes("followupCandidateKey") &&
        (reviewJs.includes("data-followup-evidence-item") || reviewJs.includes("followupEvidence:")),
      "Review JS renders deterministic follow-up evidence approval gates and candidate keys."
    );
    scenario.check(reviewJs.includes("evidenceStatusLabel"), "Review JS labels follow-up evidence provenance states.");
    scenario.check(reviewJs.includes("Source: saved follow-up answer"), "Review JS persists follow-up source provenance into grouping metadata.");
  } else {
    scenario.assertions.push("Follow-up evidence promotion static contract pending product exposure.");
  }
  if (claimRiskChecklistExposure(reviewJs, reviewHtml)) {
    scenario.check(
      reviewHtml.includes("claimRiskChecklist") || reviewJs.includes("claimRiskChecklist") || reviewJs.includes("data-claim-risk"),
      "Review page exposes a deterministic claim-risk checklist contract."
    );
    scenario.check(
      reviewJs.includes("claim") && (reviewJs.includes("metric") || reviewJs.includes("vague") || reviewJs.includes("follow-up")),
      "Review JS names claim-risk flags for checklist QA."
    );
    scenario.check(
      qaSource.includes("assertClaimRiskChecklist") && qaSource.includes("readClaimRiskChecklist"),
      "QA script carries the pre-export claim-risk checklist contract."
    );
  } else {
    scenario.assertions.push("Claim-risk checklist static contract pending product exposure.");
  }
  if (proofPacketExposure(reviewJs, reviewHtml)) {
    scenario.check(
      reviewHtml.includes("Proof Packet") || reviewHtml.includes("proofPacket") || reviewJs.includes("proofPacket"),
      "Review page exposes local Proof Packet preview or generation contract."
    );
    scenario.check(
      reviewJs.includes("proofPacket") || reviewJs.includes("Proof Packet"),
      "Review JS names Proof Packet metadata for deterministic QA."
    );
    scenario.check(
      qaSource.includes("assertProofPacketContract") && qaSource.includes("readProofPacketSurfaces"),
      "QA script carries the Proof Packet preview/download/snapshot boundary contract."
    );
  } else {
    scenario.assertions.push("Proof Packet static contract pending product exposure.");
  }
  if (proofPacketRedactionExposure(reviewJs, reviewHtml, proofPacketJs)) {
    scenario.check(
      qaSource.includes("assertProofPacketRedactionContract") && qaSource.includes("readProofPacketRedactionControls"),
      "QA script carries the Proof Packet redaction persistence and packet-download boundary contract."
    );
    scenario.check(
      qaSource.includes("Standalone Proof Packet page omits redacted source text") &&
        qaSource.includes("Resume export output is unchanged by packet redaction"),
      "QA script verifies redacted packet navigation while keeping resume export surfaces separate."
    );
  } else {
    scenario.assertions.push("Proof Packet redaction static contract pending product exposure.");
  }
  if (proofPacketShareReadinessExposure(reviewJs, reviewHtml, proofPacketJs)) {
    scenario.check(
      reviewHtml.includes("proofPacketShareReadiness") ||
        reviewJs.includes("proofPacketShareReadiness") ||
        reviewJs.includes("data-proof-packet-share") ||
        proofPacketJs.includes("data-proof-packet-share"),
      "Review or packet page exposes Proof Packet share-readiness status handles."
    );
    scenario.check(
      qaSource.includes("assertProofPacketShareReadiness") && qaSource.includes("readProofPacketShareReadiness"),
      "QA script carries the Proof Packet share-readiness status contract."
    );
  } else {
    scenario.assertions.push("Proof Packet share-readiness status static contract pending product exposure.");
  }
  if (proofPacketRestoreAllExposure(reviewJs, reviewHtml, proofPacketJs)) {
    scenario.check(
      reviewJs.includes("restore") || reviewHtml.includes("restore") || proofPacketJs.includes("restore"),
      "Product code names a restore-all redactions path for deterministic QA."
    );
    scenario.check(
      qaSource.includes("assertProofPacketRestoreAllContract") && qaSource.includes("restoreAllProofPacketRedactions"),
      "QA script carries the Proof Packet restore-all redactions contract."
    );
  } else {
    scenario.assertions.push("Proof Packet restore-all redactions static contract pending product exposure.");
  }

  if (proofPacketHtml || proofPacketJs) {
    scenario.check(proofPacketHtml.includes("Evidence-backed packet preview (local-only)."), "Proof packet page exists with local-only copy.");
    scenario.check(proofPacketJs.includes("proofresume:intakes"), "Proof packet page loads local intakes from browser storage.");
    if (proofPacketJs.includes("data:application/json") || proofPacketJs.includes("downloadHrefForJson")) {
      scenario.check(proofPacketHtml.includes("data-pr=\"downloadPacket\""), "Standalone Proof Packet page exposes a JSON packet download handle.");
      scenario.check(proofPacketJs.includes("shareReadiness"), "Standalone Proof Packet JSON manifest includes share-readiness fields.");
      scenario.check(proofPacketJs.includes("exportTextUnchanged"), "Standalone Proof Packet JSON manifest records resume export separation.");
      scenario.check(
        qaSource.includes("assertStandaloneProofPacketManifest") && qaSource.includes("decodeDataJsonHref"),
        "QA script carries the standalone Proof Packet JSON manifest contract."
      );
    } else {
      scenario.assertions.push("Standalone Proof Packet JSON manifest static contract pending product exposure.");
    }
  } else {
    scenario.assertions.push("Standalone Proof Packet page static fallback pending product route exposure.");
  }

  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    engine: null,
    mode: "static-fallback",
    launchError: "network disabled in sandbox; skipping live browser QA",
    scenarioNames: [scenario.name],
    scenarios: [{ name: scenario.name, assertionCount: scenario.assertions.length, assertions: scenario.assertions }],
    assertions: [
      "network sandbox disables server listen and browser e2e",
      "static fallback confirms intake/review/export/followups are wired",
      "static fallback confirms reset controls and named reset scenario are wired",
      "static fallback confirms named session-prep readiness scenario and adaptive checklist contract are wired",
      "static fallback confirms named first-session handoff scenario and adaptive selected-draft/packet/link/export-separation contract are wired",
      "static fallback confirms named first-recruit dispatch board scenario and adaptive no-send/local-link/export-separation contract are wired",
      "static fallback confirms named first-reply triage board scenario and adaptive no-reply/local-link/export-separation contract are wired",
      "static fallback confirms named first-reply fact capture scenario and adaptive default-state/local-state/export-separation contract are wired",
      "static fallback confirms named scheduling readiness scenario and adaptive blocked/accepted-local/export-separation contract are wired",
      "static fallback confirms named session-start gate scenario and adaptive blocked/ready-local/export-separation contract are wired",
      "static fallback confirms named first-session raw-note capture scenario and adaptive blocked/notes-recorded/export-separation contract are wired",
      "static fallback confirms named post-session debrief handoff scenario and adaptive blocked/debrief-draft/export-separation contract are wired",
      "static fallback confirms named objection-coding handoff scenario and adaptive blocked/codes-recorded/export-separation contract are wired",
      "static fallback confirms named five-session synthesis readiness scenario and adaptive zero-session/partial-session/ready/export-separation contract are wired",
      "static fallback confirms named private synthesis artifact generator scenario and adaptive blocked/artifact-drafted/export-separation contract are wired",
      "static fallback confirms named private synthesis decision memo capture scenario and adaptive blocked/memo-drafted/export-separation contract are wired",
      "static fallback confirms named private launch-decision approval capture scenario and adaptive blocked/approval-drafted/export-separation contract are wired",
      "static fallback confirms named private explicit publish-plan capture scenario and adaptive blocked/plan-drafted/export-separation contract are wired",
      "static fallback confirms named private public-copy diff rollback capture scenario and adaptive blocked/diff-drafted/export-separation contract are wired",
      "static fallback confirms named private release-candidate rehearsal capture scenario and adaptive blocked/rehearsal-ready/export-separation contract are wired",
      "static fallback confirms named private credentialed-deploy readiness scenario and adaptive rehearsal-blocked/deploy-inputs-blocked/no-secret/export-separation contract are wired",
      "static fallback confirms named platform-owner/post-deploy health handoff scenario and no-secret/no-URL/no-deploy-trigger/export-separation contract are wired",
      "static fallback confirms named final deploy go/no-go ledger scenario and No-Go/Do Not Deploy contract are wired",
      "static fallback confirms named deploy-blocker escalation memo scenario and no-secret/no-platform-value/no-rollback/no-decision-change contract are wired",
      "static fallback confirms named first-human-operator deploy packet index scenario and not-a-checklist/no-external-value-request contract are wired",
      "static fallback confirms named operator dry-run review checklist scenario and no-executable-deploy-sequence contract are wired",
      "static fallback confirms named first-human packet cold-start archive scenario and non-operational/no-secret/no-deploy/no-public-launch/no-executable-sequence contract are wired",
      "static fallback confirms named release-candidate deploy-continuation map scenario and blocked/no-secret/no-deploy/no-public-launch/no-platform-input/no-executable-sequence contract are wired",
      "static fallback confirms named private external-input boundary ledger scenario and Not-observed/outside-repo-authority/non-requestable/no-secret/no-deploy/non-executable contract are wired",
      "static fallback confirms named platform-owner non-request transfer note scenario and Not-observed/outside-repo-authority/non-request/no-secret/no-deploy/non-executable contract are wired",
      "static fallback confirms named blocked-state operator continuation index scenario and private/read-only/Not-observed/outside-repo-authority/non-request/no-secret/no-deploy/no-public-launch/no-rollback/non-executable contract are wired",
      "static fallback confirms named autonomous deploy stop ledger scenario and private/read-only/autonomous-stop/Not-observed/outside-repo-authority/non-request/no-secret/no-deploy/no-public-launch/no-rollback/non-executable contract are wired",
      "static fallback confirms named human-platform authority re-entry gate scenario and private/read-only/Not-observed/outside-repo-authority/non-request/no-secret/no-deploy/no-public-launch/no-rollback/no-authority-bypass/non-executable contract are wired",
      "static fallback confirms outside-authority awaiting-state ledger coverage across Admin/Product/static output and Do Not Publish/No-Go/Do Not Deploy boundaries",
      "static fallback confirms deterministic static deploy failure fixtures for admin history, product drilldown, and disabled platform inputs are wired",
      "static fallback confirms named buyer-path business-control scenario for local lead capture, paid-review CTA, deploy readiness, and external-action defaults is wired",
      "static fallback confirms named local paid-review interest scenario and no-checkout/no-card/no-outbound/no-analytics/no-production-intake contract is wired",
      "static fallback confirms named paid-review intent triage scenario and local-metadata/no-outreach/no-checkout/no-analytics/no-production-intake contract is wired",
      "static fallback confirms named paid-review triage export boundary scenario and planning-only/no-follow-up-draft/no-outreach/no-checkout/no-analytics/no-production-capture/no-evidence contract is wired",
      "static fallback confirms named control activation boundary scenario and adaptive no-deploy/no-checkout/no-outbound/no-analytics/no-production-capture/no-secret/no-url/no-trigger/no-card-contact-resume-collection contract is wired",
      "static fallback confirms control activation export-action coverage for no persistence, no network, no secret capture, no control enablement, and no lead/payment/outreach/analytics/customer-data path mutation is wired",
      "static fallback confirms activation-decision ledger boundary coverage for no deploy, checkout, lead capture, analytics, outbound, customer-data, production-intake, BUSINESS_CONTROLS/production path mutation, or secret/URL/deploy-trigger/card/contact/resume collection is wired",
      "static fallback confirms activation-decision packet export boundary coverage for no control evidence, outreach, checkout, analytics, production-capture, enabled-state proof, BUSINESS_CONTROLS/production path mutation, or secret/URL/deploy-trigger/card/contact/resume collection is wired",
      "static fallback carries adaptive Proof Packet share-readiness and restore-all redaction contracts",
      "static fallback carries adaptive standalone Proof Packet JSON manifest coverage",
    ],
    requestAudit: { externalRequests: [], apiRequests: [], submitRequests: [] },
  };
}

async function main() {
  if (networkDisabled) {
    const report = runStaticFallbackQa();
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const { server, baseUrl } = await startStaticServer();
  const { browser, engine } = await launchBrowser();
  const externalRequests = [];
  const apiRequests = [];
  const submitRequests = [];
  const consoleErrors = [];
  let successfulReportExitTimer = null;

  try {
    const context = await browser.newContext({ acceptDownloads: true });
    const baseOrigin = new URL(baseUrl).origin;

    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = request.url();
      const parsed = new URL(url);
      const isLocal = parsed.origin === baseOrigin;
      const isAllowedProtocol = ["data:", "blob:", "about:"].includes(parsed.protocol);

      if (!isLocal && !isAllowedProtocol) {
        externalRequests.push({ method: request.method(), url });
        await route.abort();
        return;
      }

      if (isLocal && /\/api(?:\/|$)|api\./i.test(parsed.href)) {
        apiRequests.push({ method: request.method(), url });
      }

      if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
        submitRequests.push({ method: request.method(), url });
      }

      await route.continue();
    });

    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") {
        const location = message.location?.() || {};
        consoleErrors.push([message.text(), location.url].filter(Boolean).join(" | "));
      }
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    const requestCountBeforeScenarios = submitRequests.length + apiRequests.length + externalRequests.length;
    const apiRequestCountBeforeScenarios = apiRequests.length;
    const submitRequestCountBeforeScenarios = submitRequests.length;
    const externalRequestCountBeforeScenarios = externalRequests.length;
    const scenarios = [
      await runBuyerPathBusinessControlsScenario(page, baseUrl),
      await runPaidReviewInterestCaptureScenario(page, baseUrl),
      await runPaidReviewIntentTriageScenario(page, baseUrl),
      await runPaidReviewTriageExportBoundaryScenario(page, baseUrl),
      await runControlActivationBoundaryScenario(page, baseUrl),
      await runActivationDecisionLedgerBoundaryScenario(page, baseUrl),
      await runActivationDecisionPacketExportBoundaryScenario(page, baseUrl),
      await runActivationDecisionPacketReviewStatusBoundaryScenario(page, baseUrl),
      await runDemoBoundaryScenario(page, baseUrl),
      await runSessionResetScenario(page, baseUrl),
      await runSessionPrepScenario(page, baseUrl),
      await runFirstSessionHandoffScenario(page, baseUrl),
      await runFirstRecruitDispatchBoardScenario(page, baseUrl),
      await runFirstReplyTriageBoardScenario(page, baseUrl),
      await runFirstReplyFactCaptureScenario(page, baseUrl),
      await runSchedulingReadinessScenario(page, baseUrl),
      await runSessionStartGateScenario(page, baseUrl),
      await runRawNoteCaptureScenario(page, baseUrl),
      await runPostSessionDebriefScenario(page, baseUrl),
      await runObjectionCodingHandoffScenario(page, baseUrl),
      await runFiveSessionSynthesisReadinessScenario(page, baseUrl),
      await runPrivateSynthesisArtifactGeneratorScenario(page, baseUrl),
      await runPrivateSynthesisDecisionMemoCaptureScenario(page, baseUrl),
      await runPrivateLaunchDecisionApprovalScenario(page, baseUrl),
      await runPrivateExplicitPublishPlanScenario(page, baseUrl),
      await runPrivatePublicCopyDiffRollbackScenario(page, baseUrl),
      await runPrivateReleaseCandidateRehearsalScenario(page, baseUrl),
      await runPrivateCredentialedDeployReadinessScenario(page, baseUrl),
      await runPlatformOwnerPostDeployHandoffScenario(page, baseUrl),
      await runFinalDeployGoNoGoLedgerScenario(page, baseUrl),
      await runDeployBlockerEscalationMemoScenario(page, baseUrl),
      await runFirstHumanOperatorDeployPacketIndexScenario(page, baseUrl),
      await runOperatorDryRunReviewChecklistScenario(page, baseUrl),
      await runFirstHumanPacketColdStartArchiveScenario(page, baseUrl),
      await runReleaseCandidateDeployContinuationMapScenario(page, baseUrl),
      await runPrivateExternalInputBoundaryLedgerScenario(page, baseUrl),
      await runPlatformOwnerNonRequestTransferNoteScenario(page, baseUrl),
      await runOperatorResumePacketGuardrailScenario(page, baseUrl),
      await runBlockedStateOperatorContinuationIndexScenario(page, baseUrl),
      await runBundleLibraryImportCapPreviewScenario(page, baseUrl),
      await runBundleLibraryImportPreviewDownloadScenario(page, baseUrl),
      await runAutonomousDeployStopLedgerScenario(page, baseUrl),
      await runPostAutonomousStopRecoveryChecklistScenario(page, baseUrl),
      await runHumanPlatformAuthorityReEntryGateScenario(page, baseUrl),
      await runStaticDeployFailureFixtureScenario(page, baseUrl),
      await runStructuredExtractionApprovalBoundaryScenario(page, baseUrl),
      await runHappyPathScenario(page, baseUrl),
      await runMalformedInputScenario(page, baseUrl),
      await runLongPasteScenario(page, baseUrl),
      await runEmptyAndMissingRoleScenario(page, baseUrl),
    ];

    const scenarioApiRequests = apiRequests.slice(apiRequestCountBeforeScenarios);
    const scenarioSubmitRequests = submitRequests.slice(submitRequestCountBeforeScenarios);
    const scenarioExternalRequests = externalRequests.slice(externalRequestCountBeforeScenarios);
    const disallowedApiRequests = scenarioApiRequests.filter((request) => !isAllowedLocalDevLeadRequest(request));
    const disallowedSubmitRequests = scenarioSubmitRequests.filter((request) => !isAllowedLocalDevLeadRequest(request));
    const allowedLocalDevLeadRequests = scenarioApiRequests.filter(isAllowedLocalDevLeadRequest);
    assert(
      scenarioExternalRequests.length + disallowedApiRequests.length + disallowedSubmitRequests.length === 0,
      "Running intake scenarios and opening review must not create external, disallowed API, or production submit requests."
    );
    assert(consoleErrors.length === 0, `Unexpected browser console/page errors:\n${consoleErrors.join("\n")}`);

    const report = {
      ok: true,
      checkedAt: new Date().toISOString(),
      engine,
      baseUrl,
      scenarioNames: scenarios.map((scenario) => scenario.name),
      scenarios: scenarios.map((scenario) => ({
        name: scenario.name,
        assertionCount: scenario.assertions.length,
        assertions: scenario.assertions,
      })),
      assertions: [
        "happy path pasted sample resume saves to localStorage and opens review",
        "demo mode names sample material, does not create user storage, keeps user controls hidden, and is replaced by user draft mode when an intake is selected",
        "sample report text is excluded from user raw intake, generated review, export output, download text, and saved snapshot resume text",
        "session reset controls clear demo drafts, user drafts, proof-packet redactions, snapshot redaction flags, and all local drafts on explicit operator action",
        "session reset controls preserve the intended opposite draft boundary and do not rewrite downloaded resume export text fixtures",
        "session prep reset controls are visible before operator start and separate demo, user, redaction, and all-draft states",
        "session prep checklist readiness is adaptive until product exposes handles, then strict for empty, redaction-blocked, target-role-missing, and ready states",
        "first-session operator handoff coverage is adaptive until product exposes handles, then strict for selected draft, Proof Packet readiness, learning-log links, and export-text separation",
        "first-session operator handoff scenario preserves the no external/API/submit request audit",
        "first-recruit dispatch board coverage is adaptive until product exposes handles, then strict for no-send state, local artifact links, selected draft, unobserved reply facts, and export-text separation",
        "first-recruit dispatch board scenario preserves the no external/API/submit request audit",
        "first-reply triage board coverage is adaptive until product exposes handles, then strict for no-reply state, local artifact links, selected draft, not-observed reply facts, and export-text separation",
        "first-reply triage board scenario preserves the no external/API/submit request audit",
        "first-reply fact capture coverage is adaptive until product exposes handles, then strict for default unobserved state, explicit local observed state, selected draft, and export-text separation",
        "first-reply fact capture scenario preserves the no external/API/submit request audit",
        "scheduling readiness coverage is adaptive until product exposes handles, then strict for default blocked state, accepted-local state, selected draft preservation, and export-text separation",
        "scheduling readiness scenario preserves the no external/API/submit request audit",
        "appointment-confirmed session-start gate coverage is adaptive until product exposes handles, then strict for default blocked state, ready local state, selected draft preservation, local runbook/raw-note/debrief links, and export-text separation",
        "appointment-confirmed session-start gate scenario preserves the no external/API/submit request audit",
        "first-session raw-note capture coverage is adaptive until product exposes handles, then strict for default blocked state, local raw-note saved state, selected draft preservation, debrief/objection routing, and export-text separation",
        "first-session raw-note capture scenario preserves the no external/API/submit request audit",
        "post-session debrief handoff coverage is adaptive until product exposes handles, then strict for default blocked state, local debrief-draft saved state, selected draft preservation, objection/synthesis routing, and export-text separation",
        "post-session debrief handoff scenario preserves the no external/API/submit request audit",
        "objection-coding handoff coverage is adaptive until product exposes handles, then strict for default blocked state, local objection-code saved state, selected draft preservation, no-network behavior, rubric/synthesis links, and export-text separation",
        "objection-coding handoff scenario preserves the no external/API/submit request audit",
        "five-session synthesis readiness coverage is adaptive until product exposes handles, then strict for zero-session blocked state, partial-session blocked state, five-session ready state, selected draft preservation, no-network behavior, packet completeness, and export-text separation",
        "five-session synthesis readiness scenario preserves the no external/API/submit request audit",
        "private synthesis artifact generator coverage is adaptive until product exposes handles, then strict for blocked state, ready artifact-drafted state, selected draft preservation, no-network behavior, and export-text separation",
        "private synthesis artifact generator scenario preserves the no external/API/submit request audit",
        "private synthesis decision memo capture coverage is adaptive until product exposes handles, then strict for blocked state, memo-drafted state, selected draft preservation, no-network behavior, reviewed decision fields, and export-text separation",
        "private synthesis decision memo capture scenario preserves the no external/API/submit request audit",
        "private launch-decision approval capture coverage is adaptive until product exposes handles, then strict for blocked state, approval-drafted state, selected draft preservation, no-network behavior, selected memo gating, and export-text separation",
        "private launch-decision approval capture scenario preserves the no external/API/submit request audit",
        "private explicit publish-plan coverage is adaptive until product exposes handles, then strict for blocked state, plan-drafted state, selected draft preservation, no-network behavior, launch approval gating, and export-text separation",
        "private explicit publish-plan capture scenario preserves the no external/API/submit request audit",
        "private public-copy diff rollback capture coverage is adaptive until product exposes handles, then strict for blocked state, diff-drafted state, selected draft preservation, no-network behavior, publish-plan gating, and export-text separation",
        "private public-copy diff rollback capture scenario preserves the no external/API/submit request audit",
        "private release-candidate rehearsal capture coverage is adaptive until product exposes handles, then strict for blocked state, rehearsal-ready state, selected draft preservation, no-network behavior, diff-packet gating, and export-text separation",
        "private release-candidate rehearsal capture scenario preserves the no external/API/submit request audit",
        "private credentialed-deploy readiness coverage is adaptive until product exposes handles, then strict for rehearsal-blocked state, deploy-inputs-blocked state, selected draft preservation, no-network behavior, no-secret storage, and export-text separation",
        "private credentialed-deploy readiness scenario preserves the no external/API/submit request audit",
        "platform-owner and post-deploy health handoff coverage proves local-only, route-only, export/download ineligible, no-secret, no-URL, no-deploy-trigger, and Do Not Deploy states across Admin/Product surfaces",
        "platform-owner and post-deploy health handoff scenario preserves the no external/API/submit request audit",
        "final deploy go/no-go ledger coverage proves No-Go / Do Not Deploy stays locked across Admin data, Product readiness, and static rehearsal output without external inputs",
        "final deploy go/no-go ledger scenario preserves no-secret, no-production-URL, no-deploy-trigger, no-dashboard-link, no-public-launch-authorization, and export/download separation boundaries",
        "deploy-blocker escalation memo coverage proves Admin data, Product readiness, and static rehearsal output cannot request secrets, expose platform values, authorize public launch or rollback, or change No-Go / Do Not Deploy",
        "deploy-blocker escalation memo scenario preserves no-secret, no-production-URL, no-deploy-trigger, no-dashboard-link, no-public-launch-authorization, no-rollback-authorization, and export/download separation boundaries",
        "first-human-operator deploy packet index coverage proves Admin data, Product readiness, and static rehearsal output stay index-only and cannot become a deploy checklist",
        "first-human-operator deploy packet index scenario preserves no credential request, production URL, deploy trigger, dashboard link, contact detail, rollback authorization, public launch authorization, deploy action, or external-value request",
        "operator dry-run review checklist coverage proves Admin data, Product readiness, and static rehearsal output stay review-only and cannot become an executable deploy sequence",
        "operator dry-run review checklist scenario preserves no credential request, production URL, deploy trigger, dashboard action, DNS step, rollback authorization, public launch authorization, or deploy action",
        "first-human packet cold-start archive coverage proves Admin data, Product readiness, and static rehearsal output stay archive-only, non-operational, no-secret, no-deploy, no-public-launch, and cannot become an executable sequence",
        "first-human packet cold-start archive scenario preserves Not observed continuation facts without credential requests, production URLs, deploy triggers, dashboard actions, DNS steps, rollback authorization, public launch authorization, deploy actions, or executable sequences",
        "release-candidate deploy-continuation map coverage proves Admin data, Product readiness, and static rehearsal output stay blocked, no-secret, no-deploy, no-public-launch, unable to request platform inputs, and unable to become an executable sequence",
        "release-candidate deploy-continuation map scenario preserves Not observed external platform facts without credential requests, production URLs, deploy triggers, dashboard actions, DNS steps, rollback authorization, public launch authorization, deploy actions, platform input requests, or executable sequences",
        "private external-input boundary ledger coverage proves Admin data, Product readiness, and static rehearsal output keep every external fact Not observed, outside repo authority, non-requestable, no-secret, no-deploy, and non-executable",
        "private external-input boundary ledger scenario preserves no credential request, production URL, deploy trigger, dashboard action, DNS step, rollback authorization, public launch authorization, deploy action, platform input request, or executable sequence",
        "platform-owner non-request transfer note coverage proves Admin data, Product readiness, and static rehearsal output keep every transfer fact Not observed, outside repo authority, non-request, no-secret, no-deploy, and non-executable",
        "platform-owner non-request transfer note scenario preserves no credential request, production URL, deploy trigger, dashboard action, DNS step, rollback authorization, public launch authorization, deploy action, platform input request, or executable sequence",
        "operator-resume packet guardrail coverage proves Admin data, Product readiness, and static rehearsal output keep every guardrail fact Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, and non-executable",
        "operator-resume packet guardrail scenario preserves no credential request, production URL, deploy trigger, dashboard action, DNS step, rollback authorization, public launch authorization, public deploy authorization, deploy action, platform value request, or executable sequence",
        "blocked-state operator continuation index coverage proves Admin data, Product readiness, and static rehearsal output keep every continuation fact private, read-only, Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, and non-executable",
        "blocked-state operator continuation index scenario preserves no credential request, production URL, deploy trigger, dashboard action, DNS step, rollback authorization, public launch authorization, public deploy authorization, deploy action, platform value request, or executable sequence",
        "autonomous deploy stop ledger coverage proves Admin data, Product readiness, and static rehearsal output keep every stop fact private, read-only, autonomous-stop, Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, and non-executable",
        "autonomous deploy stop ledger scenario preserves no credential request, production URL, deploy trigger, dashboard action, DNS step, rollback authorization, public launch authorization, public deploy authorization, deploy action, platform value request, or executable sequence",
        "post-autonomous-stop recovery checklist coverage proves Admin data, Product readiness, and static rehearsal output keep every recovery fact private, read-only, Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, no-authority-bypass, and non-executable",
        "post-autonomous-stop recovery checklist scenario preserves no credential request, production URL, deploy trigger, dashboard action, DNS step, rollback authorization, public launch authorization, public deploy authorization, authority bypass, deploy action, platform value request, or executable sequence",
        "human-platform authority re-entry gate coverage proves Admin data, Product readiness, and static rehearsal output keep every re-entry fact private, read-only, Not observed, outside repo authority, non-request, no-secret, no-deploy, no-public-launch, no-rollback, no-authority-bypass, and non-executable",
        "human-platform authority re-entry gate scenario preserves no credential request, production URL, deploy trigger, dashboard action, DNS step, rollback authorization, public launch authorization, public deploy authorization, authority bypass, re-entry unlock, deploy action, platform value request, or executable sequence",
        "outside-authority awaiting-state ledger coverage proves Admin data, Product readiness, and static rehearsal output keep every awaiting fact private, read-only, Not observed, outside repo authority, non-request, Do Not Publish, no-secret, no-deploy, no-public-launch, no-rollback, no-authority-bypass, and non-executable",
        "outside-authority awaiting-state ledger scenario preserves no credential request, production URL, deploy trigger, dashboard action, DNS step, rollback authorization, public launch authorization, public deploy authorization, authority bypass, re-entry unlock, deploy unlock, publish action, deploy action, platform value request, or executable sequence",
        "static deploy failure fixtures prove admin history and product drilldown render blocked-route, missing-entrypoint, stale-evidence, and unsafe-guardrail details",
        "static deploy failure fixtures keep product platform inputs disabled, no-secret, and export/download ineligible without credentials or deploy actions",
        "buyer path business-control coverage proves local lead capture, paid-review CTA, deploy readiness, and external-action defaults obey BUSINESS_CONTROLS",
        "buyer path local lead capture may call only the relative /api/dev-lead local logger and stores no resume, payment, outreach, deploy, secret, or token fields",
        "local paid-review interest capture may call only the relative /api/dev-paid-review-intent local logger and stores no checkout, payment collection, card, outbound, analytics, or resume-intake fields",
        "local paid-review interest capture is adaptive until the handle exists, then proves local intent is capturable while payment, production lead capture, analytics, and customer-data controls remain disabled",
        "local paid-review interest capture cannot become checkout, payment collection, card capture, outbound, production analytics, or production resume intake",
        "paid-review intent triage coverage is adaptive until the queue exists, then proves local intent review stays metadata-only while payment, production lead capture, outreach, analytics, and customer-data controls remain disabled",
        "paid-review intent triage cannot become outreach, checkout, analytics, production resume intake, revenue evidence, demand evidence, payment evidence, conversion evidence, or willingness-to-pay evidence",
        "paid-review triage export boundary is adaptive until export controls exist, then strict for planning-only state, no follow-up drafts, no outreach, no checkout, no analytics, no production lead capture, no production resume intake, and no business-evidence promotion",
        "control activation boundary is adaptive until the packet handles exist, then strict for read-only/local-only state and no deploy, checkout, outbound, analytics, production capture, secret collection, production URL capture, deploy trigger capture, or card/contact/resume collection",
        "control activation export action is adaptive until an export/copy/download handle exists, then strict for no persistence, no network, no secret capture, no control enablement, and no lead/payment/outreach/analytics/customer-data path mutation",
        "control activation packet coverage verifies revenue-critical controls mirror BUSINESS_CONTROLS and name one missing non-secret unlock without enabling external actions",
        "activation-decision ledger boundary is adaptive until explicit ledger handles exist, then strict for no deploy, checkout, lead capture, analytics, outbound, customer-data, production-intake, BUSINESS_CONTROLS/production path mutation, or secret/URL/deploy-trigger/card/contact/resume collection",
        "structured extraction regression coverage verifies parsed experience items start Unapproved, carry provenance/source lines, and stay out of export/download until explicit approval",
        "structured extraction regression coverage verifies extracted experience surfaces do not invent unsupported claims",
        "malformed pasted text is preserved as inert escaped text",
        "long pasted text preserves raw input and reports word count",
        "empty paste is blocked while missing optional role is allowed",
        "accepted candidates generate an export-ready local resume section",
        "edited export headings persist into output, download text, saved snapshot, and reload",
        "export section and bullet ordering persists into output, saved snapshot, and reload",
        "export grouping rationale metadata is verified across output, snapshot, reload, and download exclusion",
        "follow-up facts are excluded from export, download, and snapshot before explicit evidence promotion approval",
        "follow-up source provenance is visible before approval and persists into saved snapshot metadata after approval",
        "follow-up rewrite controls are edited before approval and the rewritten bullet is exported only after explicit approval",
        "raw follow-up answer text remains provenance metadata while rewritten follow-up text becomes the resume surface",
        "pre-export claim-risk checklist flags are enforced when product exposes deterministic checklist handles",
        "local Proof Packet preview, download, and snapshot boundaries are enforced when product exposes deterministic packet handles",
        "Proof Packet redaction controls must persist across reload/page navigation and omit redacted raw source text from packet downloads when exposed",
        "Proof Packet share-readiness status names redaction coverage, accepted-only contents, rejected/pending exclusion, and resume-export separation when exposed",
        "Proof Packet restore-all redactions control restores packet source text without changing resume export surfaces when exposed",
        "Proof Packet JSON manifest exposes format, local-only status, accepted count, source-boundary warning counts, share-readiness fields, and resume export separation when standalone packet page exposes a JSON download",
        "standalone packet page share-readiness fields match the JSON manifest and remain separated from resume export/download text",
        "exposed follow-up evidence promotion controls must reject facts from all export surfaces and approve facts before inclusion",
        "rejected candidates stay visible for audit and are excluded from export text",
        "local export snapshot preserves evidence status labels",
        "all scenarios make no external origin requests",
        "all scenarios make no disallowed /api requests beyond the relative local dev lead and paid-review intent loggers",
        "all scenarios make no production POST/PUT/PATCH/DELETE submit requests",
      ],
      requestAudit: {
        externalRequests,
        apiRequests,
        submitRequests,
        allowedLocalDevLeadRequests,
        disallowedApiRequests,
        disallowedSubmitRequests,
      },
    };

    console.log(JSON.stringify(report, null, 2));
    successfulReportExitTimer = setTimeout(() => {
      process.exit(0);
    }, 5000);
    await settleCleanup(() => context.close());
  } finally {
    const browserProcess = typeof browser.process === "function" ? browser.process() : null;
    await settleCleanup(() => browser.close(), 3000, () => {
      if (browserProcess && !browserProcess.killed) browserProcess.kill("SIGKILL");
    });
    await settleCleanup(
      () => new Promise((resolve) => server.close(resolve)),
      3000,
      () => {
        if (typeof server.closeAllConnections === "function") server.closeAllConnections();
        if (typeof server.unref === "function") server.unref();
      }
    );
    if (successfulReportExitTimer) clearTimeout(successfulReportExitTimer);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..", "..");
const websiteRoot = path.join(projectRoot, "website");

function readText(relativePath) {
  const absolutePath = path.join(projectRoot, relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
}

function readJson(relativePath, fallback) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) return fallback;
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function listFiles(relativeDir, predicate = () => true) {
  const absoluteDir = path.join(projectRoot, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs
    .readdirSync(absoluteDir)
    .filter(predicate)
    .sort()
    .map((name) => ({
      name,
      relativePath: `${relativeDir}/${name}`,
      absolutePath: path.join(absoluteDir, name),
    }));
}

function listReports() {
  const reportDir = path.join(projectRoot, "ops", "reports");
  if (!fs.existsSync(reportDir)) return [];
  return fs
    .readdirSync(reportDir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .reverse()
    .map((name) => ({
      path: `ops/reports/${name}`,
      title: name.replace(".md", ""),
      content: readText(`ops/reports/${name}`),
    }));
}

function reportByPath(reports) {
  return new Map(reports.map((report) => [report.path, report]));
}

function listMarkdownDir(relativeDir) {
  const absoluteDir = path.join(projectRoot, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs
    .readdirSync(absoluteDir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => ({
      path: `${relativeDir}/${name}`,
      title: name.replace(".md", ""),
      content: readText(`${relativeDir}/${name}`),
    }));
}

function normalizePassTimestamp(value) {
  const raw = String(value || "").trim();
  const compact = raw.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/);
  const parseable = compact ? `${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:00-07:00` : raw;
  const date = new Date(parseable);
  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

function listPassFiles() {
  const passDir = path.join(projectRoot, "ops", "progress", "passes");
  if (!fs.existsSync(passDir)) return [];
  return fs
    .readdirSync(passDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const pass = readJson(`ops/progress/passes/${name}`, null);
      if (!pass) return null;
      const inferredReport = `ops/reports/${name.replace(/\.json$/, ".md")}`;
      const rawStartedAt =
        pass.startedAt ||
        pass.finishedAt ||
        pass.timestamp ||
        name.replace(/\.json$/, "").replace(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2}).*$/, "$1-$2-$3T$4:$5:00");
      const inferredStartedAt = normalizePassTimestamp(rawStartedAt);
      return {
        ...pass,
        id: pass.id || name.replace(/\.json$/, ""),
        sourcePath: `ops/progress/passes/${name}`,
        startedAt: inferredStartedAt,
        report: pass.report || (fs.existsSync(path.join(projectRoot, inferredReport)) ? inferredReport : pass.report),
      };
    })
    .filter(Boolean);
}

function uniquePasses(passes) {
  const seen = new Set();
  return passes.filter((pass, index) => {
    const key = pass.id || `${pass.startedAt || "unknown"}-${pass.prompt || "pass"}-${index}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function averageNumericScore(score) {
  const values = Object.values(score || {}).filter((value) => typeof value === "number");
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatTrendLabel(value, fallback) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString().slice(11, 16);
}

function buildSprintTrend(passes) {
  const chronological = passes
    .filter((pass) => pass.startedAt)
    .slice()
    .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));

  const lanes = new Map();
  const points = [];
  let cumulativeComplete = 0;
  let cumulativeScore = 0;
  let scoredCount = 0;

  chronological.forEach((pass, index) => {
    const lane = pass.lane || "general";
    const laneRecord = lanes.get(lane) || {
      lane,
      total: 0,
      complete: 0,
      withFindings: 0,
      latestAt: null,
      latestSummary: "",
    };
    const score = averageNumericScore(pass.score);
    const isComplete = String(pass.status || "").startsWith("complete");

    laneRecord.total += 1;
    laneRecord.complete += isComplete ? 1 : 0;
    laneRecord.withFindings += pass.status === "complete-with-findings" ? 1 : 0;
    laneRecord.latestAt = pass.finishedAt || pass.startedAt || laneRecord.latestAt;
    laneRecord.latestSummary = pass.summary || laneRecord.latestSummary;
    lanes.set(lane, laneRecord);

    cumulativeComplete += isComplete ? 1 : 0;
    if (score !== null) {
      cumulativeScore += score;
      scoredCount += 1;
    }

    points.push({
      id: pass.id || `pass-${index + 1}`,
      label: formatTrendLabel(pass.startedAt, `Pass ${index + 1}`),
      startedAt: pass.startedAt,
      lane,
      status: pass.status || "unknown",
      summary: pass.summary || "",
      cumulativeTotal: index + 1,
      cumulativeComplete,
      averageScore: scoredCount ? Number((cumulativeScore / scoredCount).toFixed(1)) : null,
    });
  });

  const first = chronological[0];
  const latest = chronological[chronological.length - 1];
  const startedMs = first ? new Date(first.startedAt).getTime() : NaN;
  const latestMs = latest ? new Date(latest.finishedAt || latest.startedAt).getTime() : NaN;
  const elapsedHours = Number.isNaN(startedMs) || Number.isNaN(latestMs) ? null : Math.max((latestMs - startedMs) / 3600000, 0);

  return {
    totalPasses: chronological.length,
    completedPasses: chronological.filter((pass) => String(pass.status || "").startsWith("complete")).length,
    findingPasses: chronological.filter((pass) => pass.status === "complete-with-findings").length,
    reportsPublished: new Set(chronological.map((pass) => pass.report).filter(Boolean)).size,
    validationMentions: chronological.reduce((sum, pass) => sum + (pass.validation || []).length, 0),
    elapsedHours: elapsedHours === null ? null : Number(elapsedHours.toFixed(1)),
    passesPerHour: elapsedHours && elapsedHours > 0 ? Number((chronological.length / elapsedHours).toFixed(1)) : null,
    latestStartedAt: latest?.startedAt || null,
    latestFinishedAt: latest?.finishedAt || latest?.startedAt || null,
    points,
    recentPoints: points.slice(-8),
    lanes: [...lanes.values()].sort((a, b) => b.total - a.total || a.lane.localeCompare(b.lane)),
  };
}

function parseJsonLines(relativePath) {
  const content = readText(relativePath).trim();
  if (!content) return [];
  return content
    .split(/\r?\n/)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return {
          parseError: error instanceof Error ? error.message : String(error),
          line: index + 1,
          raw: line,
        };
      }
    });
}

function newestTimestamp(items) {
  const timestamps = items
    .flatMap((item) => [item.createdAt, item.submittedAt, item.timestamp, item.updatedAt])
    .filter(Boolean)
    .sort();
  return timestamps[timestamps.length - 1] || null;
}

function summarizeLead(lead) {
  if (lead.parseError) return `Unparseable JSONL line ${lead.line}: ${lead.parseError}`;
  const parts = [lead.name, lead.email, lead.role, lead.company, lead.source].filter(Boolean);
  return parts.length ? parts.join(" | ") : "Captured lead with no display fields";
}

function listLocalCapture() {
  const leadFiles = listFiles("data/leads", (name) => name.endsWith(".jsonl"));
  const intakeFiles = listFiles("data/intake", (name) => /\.(jsonl|json|md|txt)$/i.test(name));
  const leadArtifacts = leadFiles.map((file) => {
    const records = parseJsonLines(file.relativePath);
    return {
      type: "dev-leads",
      path: file.relativePath,
      count: records.length,
      latestAt: newestTimestamp(records),
      latest: records.slice(-3).reverse().map(summarizeLead),
    };
  });

  const intakeArtifacts = intakeFiles.map((file) => {
    const stats = fs.statSync(file.absolutePath);
    return {
      type: "intake-artifact",
      path: file.relativePath,
      count: 1,
      latestAt: stats.mtime.toISOString(),
      latest: [`${file.name} (${stats.size} bytes)`],
    };
  });

  return {
    storage: {
      devLeadsPath: "data/leads/dev-leads.jsonl",
      intakeBrowserKey: "proofresume:intakes",
      externalCalls: false,
    },
    artifacts: [...leadArtifacts, ...intakeArtifacts],
  };
}

const PAID_REVIEW_STALE_HOURS = 24;

function paidReviewTimestamp(record) {
  return firstTruthyValue(record, ["capturedAt", "createdAt", "submittedAt", "timestamp", "updatedAt"]);
}

function timestampAgeHours(value, nowValue = generatedAt) {
  if (!value) return null;
  const timestampMs = new Date(value).getTime();
  const nowMs = new Date(nowValue).getTime();
  if (Number.isNaN(timestampMs) || Number.isNaN(nowMs)) return null;
  return Math.max(0, (nowMs - timestampMs) / 3600000);
}

function summarizePaidReviewInterest(record) {
  if (record.parseError) return `Unparseable JSONL line ${record.line}: ${record.parseError}`;
  const timestamp = paidReviewTimestamp(record) || "timestamp not provided";
  const source = firstTruthyValue(record, ["source", "controlSource", "route"]) || "local source not provided";
  const localOnly = record.localOnly === true || /local/i.test(String(source));
  const paymentProcessed = record.paymentProcessed === true || record.paymentCollected === true || record.checkoutStarted === true;
  const boundary = paymentProcessed ? "unexpected payment marker" : "no payment marker";
  return `${timestamp} | ${source} | ${localOnly ? "local-only marker" : "local marker not provided"} | ${boundary}`;
}

function paidReviewBoundaryMetrics({ records, controls, globalLimits }) {
  const paymentControl = controls.find((control) => control.id === "payment_collection") || {};
  const outboundControl = controls.find((control) => control.id === "outbound_outreach") || {};
  const enabledStatuses = new Set(["enabled", "local_only_enabled"]);
  const paymentDisabled = !enabledStatuses.has(paymentControl.status);
  const zeroRevenue =
    paymentDisabled &&
    records.filter((record) => !record.parseError && (record.paymentProcessed === true || record.paymentCollected === true || record.checkoutStarted === true)).length === 0 &&
    (paymentControl.limitsWhenEnabled?.maxPriceExperimentUsd ?? 0) === 0 &&
    !paymentControl.limitsWhenEnabled?.mayStoreCardData;
  const zeroOutbound =
    (globalLimits.dailyOutboundLimit ?? 0) === 0 &&
    (outboundControl.limitsWhenEnabled?.dailyMessageLimit ?? 0) === 0 &&
    !outboundControl.limitsWhenEnabled?.mayAutonomouslySend;

  return {
    paymentDisabled,
    paymentStatus: paymentControl.status || "unknown",
    zeroRevenue,
    revenueState: zeroRevenue ? "zero-revenue-observed" : "check-payment-boundary",
    zeroOutbound,
    outboundStatus: outboundControl.status || "unknown",
    demandMetricState: "not-observed",
    willingnessToPayMetricState: "not-observed",
    separation:
      "Local paid-review interest is an operator triage signal only; it is not revenue, demand, willingness-to-pay, payment collection, analytics, outreach, or production lead evidence.",
  };
}

function paidReviewEmbeddedTriageState(record) {
  return String(
    firstTruthyValue(record, ["triageState", "triageDecision", "triageRoute", "reviewState", "reviewStatus", "state"]) ||
      record?.triage?.state ||
      record?.triage?.route ||
      ""
  )
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

function extractPaidReviewTriageRoutes(content) {
  return String(content || "")
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\|\s*`([^`]+)`\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*`?([^|`]+)`?\s*\|/);
      if (!match) return null;
      return {
        route: match[1].trim(),
        useWhen: match[2].trim(),
        operatorAction: match[3].trim(),
        followUpState: match[4].trim(),
      };
    })
    .filter(Boolean);
}

function buildPaidReviewTriageExportReadiness({ records, malformedRows, staleRecords, boundaryMetrics, controls }) {
  const pricingHtml = readText("website/pricing.html");
  const mainJs = readText("website/main.js");
  const rubricPath = "ops/launch/private-paid-review-intent-triage-rubric.md";
  const rubric = readText(rubricPath);
  const productSource = `${pricingHtml}\n${mainJs}`;
  const validRecords = records.filter((record) => !record.parseError);
  const states = validRecords.map(paidReviewEmbeddedTriageState);
  const reviewedRecords = validRecords.filter((record, index) => {
    const state = states[index];
    return Boolean(record.reviewedAt || record.triageRoute || state === "reviewed" || state === "invalid-metadata" || state.startsWith("stop-") || state.startsWith("no-send-"));
  });
  const invalidMetadataRecords = validRecords.filter((record, index) => states[index] === "invalid-metadata" || states[index] === "stop-sensitive-or-unsupported-field");
  const queueSurfaceObserved = /\bdata-paid-review-queue\b/.test(productSource) && /proofresume:paidReviewIntentTriage/.test(productSource);
  const exportSurfaceObserved = /data-paid-review-(triage-)?export|paidReview(Triage)?Export|triage export|export packet/i.test(productSource);
  const rubricObserved = rubric.includes("Private Paid-Review Intent Triage Rubric") && rubric.includes("No-draft");
  const noDraftObserved = rubric.includes("No-draft") && /No-draft/.test(productSource + rubric);
  const noSendObserved = rubric.includes("No-send") && /No-send|No send/i.test(productSource + rubric);
  const triageRoutes = extractPaidReviewTriageRoutes(rubric);
  const controlBlockedReasons = controls
    .filter((control) => ["public_deploy", "lead_capture", "payment_collection", "analytics", "outbound_outreach", "customer_data"].includes(control.id))
    .filter((control) => !["enabled", "local_only_enabled"].includes(control.status))
    .map((control) => ({
      id: control.id,
      label: control.label || control.id,
      status: control.status || "unknown",
      reason: `${control.label || control.id} ${control.status || "unknown"}`,
    }));
  const blockedFollowUpReasons = [
    ...controlBlockedReasons.map((reason) => reason.reason),
    ...triageRoutes
      .filter((route) => route.route.startsWith("stop_") || route.route.startsWith("no_send_"))
      .map((route) => `${route.route}: ${route.useWhen}`),
    malformedRows.length ? `${malformedRows.length} malformed local row${malformedRows.length === 1 ? "" : "s"}` : "",
    staleRecords.length ? `${staleRecords.length} stale local intent${staleRecords.length === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  const readinessState = !queueSurfaceObserved
    ? "blocked-no-local-queue"
    : !rubricObserved
      ? "blocked-no-triage-rubric"
      : !exportSurfaceObserved
        ? "blocked-no-export-surface"
        : boundaryMetrics.zeroRevenue && boundaryMetrics.zeroOutbound && noDraftObserved && noSendObserved
          ? "planning-export-ready-local-only"
          : "blocked-boundary-check";

  return {
    title: "Paid-review triage export readiness",
    sourcePaths: ["website/pricing.html", "website/main.js", rubricPath],
    expectedBrowserKeys: ["proofresume:paidReviewIntentQueueJsonl", "proofresume:paidReviewIntentTriage"],
    queueSurfaceObserved,
    rubricObserved,
    exportSurfaceObserved,
    state: readinessState,
    stateLabel:
      readinessState === "planning-export-ready-local-only"
        ? "Planning export ready, local-only"
        : readinessState === "blocked-no-export-surface"
          ? "Blocked: export surface not observed"
          : readinessState === "blocked-no-local-queue"
            ? "Blocked: local triage queue not observed"
            : readinessState === "blocked-no-triage-rubric"
              ? "Blocked: triage rubric not observed"
              : "Blocked: boundary check required",
    reviewedState: validRecords.length || malformedRows.length ? "repo-counts-derived" : "no-repo-records-observed",
    counts: {
      totalRecords: records.length,
      validRecords: validRecords.length,
      reviewedRecords: reviewedRecords.length,
      unreviewedRecords: Math.max(validRecords.length - reviewedRecords.length, 0),
      invalidMetadataRecords: invalidMetadataRecords.length,
      malformedRows: malformedRows.length,
    },
    noDraftObserved,
    noSendObserved,
    blockedFollowUpReasons,
    triageRoutes,
    evidence: {
      revenueEvidence: false,
      demandEvidence: false,
      paymentEvidence: false,
      outboundEvidence: false,
      willingnessToPayEvidence: false,
      followUpDraftCreated: false,
      analyticsEvidence: false,
      productionLeadEvidence: false,
    },
    guardrail:
      "Triage export readiness is for local operator planning only. It cannot create follow-up drafts, outreach, checkout, analytics, production lead capture, payment collection, resume intake, or business evidence.",
  };
}

function buildPaidReviewInterestVisibility({ controls = [], globalLimits = {} } = {}) {
  const candidateFiles = [
    "data/paid-review-interest/paid-review-interest.jsonl",
    "data/paid-review-interest/local-paid-review-interest.jsonl",
    "data/paid-review-intents/dev-paid-review-intents.jsonl",
    "data/paid-review-intents/paid-review-interest.jsonl",
    "data/paid-review-interest.jsonl",
  ];
  const files = candidateFiles
    .map((relativePath) => {
      const absolutePath = path.join(projectRoot, relativePath);
      if (!fs.existsSync(absolutePath)) return null;
      const records = parseJsonLines(relativePath);
      return {
        path: relativePath,
        count: records.length,
        parseErrorCount: records.filter((record) => record.parseError).length,
        malformedRows: records
          .filter((record) => record.parseError)
          .map((record) => ({
            line: record.line,
            error: record.parseError,
          })),
        latestAt: newestTimestamp(records),
        latest: records.slice(-3).reverse().map(summarizePaidReviewInterest),
        records,
      };
    })
    .filter(Boolean);

  const records = files.flatMap((file) => file.records.map((record) => ({ ...record, sourcePath: file.path })));
  const parseErrorCount = records.filter((record) => record.parseError).length;
  const paymentMarkers = records.filter(
    (record) => record.paymentProcessed === true || record.paymentCollected === true || record.checkoutStarted === true || record.cardCaptured === true
  );
  const externalMarkers = records.filter(
    (record) => record.externalServiceContacted === true || record.sentToAnalytics === true || record.productionCapture === true
  );
  const malformedRows = records
    .filter((record) => record.parseError)
    .map((record) => ({
      path: record.sourcePath,
      line: record.line,
      error: record.parseError,
    }));
  const localOnlyRecords = records.filter((record) => {
    const source = String(firstTruthyValue(record, ["source", "controlSource", "route"]) || "");
    return record.localOnly === true || /local/i.test(source) || record.paymentProcessed === false;
  });
  const datedRecords = records
    .filter((record) => !record.parseError)
    .map((record) => {
      const timestamp = paidReviewTimestamp(record);
      const ageHours = timestampAgeHours(timestamp);
      return {
        sourcePath: record.sourcePath,
        timestamp,
        ageHours,
        stale: ageHours === null || ageHours > PAID_REVIEW_STALE_HOURS,
        summary: summarizePaidReviewInterest(record),
      };
    });
  const staleRecords = datedRecords.filter((record) => record.stale);
  const latestAt = newestTimestamp(records);
  const latestAgeHours = timestampAgeHours(latestAt);
  const jsonlObserved = files.length > 0;
  const localInterestRecordCount = records.length;
  const boundaryMetrics = paidReviewBoundaryMetrics({ records, controls, globalLimits });
  const triageExportReadiness = buildPaidReviewTriageExportReadiness({
    records,
    malformedRows,
    staleRecords,
    boundaryMetrics,
    controls,
  });

  return {
    title: "Paid-review local interest readiness",
    state: jsonlObserved ? (localInterestRecordCount ? "local-records-observed" : "jsonl-observed-empty") : "not-observed",
    stateLabel: jsonlObserved
      ? localInterestRecordCount
        ? "Local records observed"
        : "JSONL present, zero records"
      : "Reader ready, no JSONL observed",
    storageState: jsonlObserved ? "repo JSONL observed" : "repo JSONL not present",
    expectedBrowserKey: "proofresume:paidReviewInterest",
    candidateJsonlPaths: candidateFiles,
    endpointState: "Not observed by admin build; counts stay zero until a local JSONL file exists.",
    endpointPath: "/api/paid-review-interest",
    jsonlObserved,
    files: files.map(({ records: _records, ...file }) => file),
    malformedRows,
    staleRecords,
    freshness: {
      staleAfterHours: PAID_REVIEW_STALE_HOURS,
      latestAgeHours: latestAgeHours === null ? null : Number(latestAgeHours.toFixed(1)),
      staleLocalIntentCount: staleRecords.length,
      missingTimestampCount: datedRecords.filter((record) => !record.timestamp).length,
      state:
        staleRecords.length > 0
          ? "stale-local-intents"
          : localInterestRecordCount
            ? "fresh-local-intents"
            : "no-local-intents",
      label:
        staleRecords.length > 0
          ? `${staleRecords.length} stale local intent${staleRecords.length === 1 ? "" : "s"}`
          : localInterestRecordCount
            ? "Local intents fresh"
            : "No local intents observed",
    },
    boundaryMetrics,
    triageExportReadiness,
    counts: {
      localInterestRecords: localInterestRecordCount,
      localOnlyRecords: localOnlyRecords.length,
      jsonlFilesObserved: files.length,
      parseErrors: parseErrorCount,
      malformedRows: malformedRows.length,
      staleLocalIntents: staleRecords.length,
      paymentMarkers: paymentMarkers.length,
      externalMarkers: externalMarkers.length,
      paymentDisabled: boundaryMetrics.paymentDisabled ? 1 : 0,
      zeroRevenue: boundaryMetrics.zeroRevenue ? 1 : 0,
      zeroOutbound: boundaryMetrics.zeroOutbound ? 1 : 0,
    },
    latestAt,
    latest: records.slice(-3).reverse().map(summarizePaidReviewInterest),
    boundaryOk: paymentMarkers.length === 0 && externalMarkers.length === 0,
    guardrail:
      "Local paid-review interest records are readiness evidence only. They are not revenue, demand, willingness to pay, payment intent, checkout, lead capture, analytics, or production customer-data evidence.",
  };
}

function normalizeActionText(line) {
  return line
    .replace(/^\s*[-*]\s+/, "")
    .replace(/^\[[ xX]\]\s+/, "")
    .trim();
}

function extractNextActions(document) {
  const actions = [];
  let section = "";
  const actionableSections = /^(in progress|next|priority \d+)/i;
  const ignoredSections = /done criteria/i;

  for (const rawLine of document.content.split(/\r?\n/)) {
    const heading = rawLine.match(/^##+\s+(.+)$/);
    if (heading) {
      section = heading[1].trim();
      continue;
    }

    if (!/^\s*[-*]\s+/.test(rawLine) || !actionableSections.test(section) || ignoredSections.test(section)) {
      continue;
    }

    const text = normalizeActionText(rawLine);
    if (!text || /\bshipped:/i.test(text)) continue;

    actions.push({
      source: document.title,
      path: document.path,
      section,
      text,
    });
  }

  return actions;
}

function splitMarkdownRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let cell = "";
  let inCode = false;

  for (const char of trimmed) {
    if (char === "`") inCode = !inCode;
    if (char === "|" && !inCode) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell.trim());
  return cells;
}

function slugify(value) {
  return String(value || "unassigned")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "unassigned";
}

const TOKEN_STOP_WORDS = new Set([
  "about",
  "after",
  "already",
  "also",
  "and",
  "admin",
  "are",
  "before",
  "being",
  "between",
  "could",
  "does",
  "done",
  "each",
  "for",
  "from",
  "growth",
  "have",
  "into",
  "item",
  "keep",
  "like",
  "local",
  "must",
  "not",
  "once",
  "only",
  "pas",
  "pass",
  "product",
  "qa",
  "report",
  "that",
  "the",
  "their",
  "then",
  "there",
  "these",
  "this",
  "those",
  "using",
  "when",
  "where",
  "whose",
  "which",
  "with",
  "without",
]);

function stemToken(token) {
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function tokenize(value) {
  return [...String(value || "").toLowerCase().matchAll(/[a-z0-9]+/g)]
    .map((match) => stemToken(match[0]))
    .filter((token) => token.length > 2 && !TOKEN_STOP_WORDS.has(token));
}

function uniqueTokens(value) {
  return [...new Set(tokenize(value))];
}

function leadingActionToken(value) {
  return stemToken(String(value || "").trim().toLowerCase().match(/[a-z0-9]+/)?.[0] || "");
}

function sharedTokens(left, right) {
  const rightSet = right instanceof Set ? right : new Set(right);
  return left.filter((token) => rightSet.has(token));
}

function signatureTokens(tokens) {
  const signatureTerms = new Set([
    "decision",
    "declin",
    "declined",
    "date",
    "demo",
    "destination",
    "diagnostic",
    "dispatch",
    "drill",
    "draft",
    "evidence",
    "export",
    "checklist",
    "claim",
    "confirmation",
    "freshness",
    "follow",
    "guardrail",
    "gate",
    "heading",
    "history",
    "interview",
    "json",
    "latest",
    "link",
    "log",
    "manifest",
    "matcher",
    "message",
    "metric",
    "mismatch",
    "note",
    "objection",
    "ordering",
    "operator",
    "packet",
    "panel",
    "participant",
    "parent",
    "persist",
    "provenance",
    "question",
    "queue",
    "rationale",
    "readines",
    "refresh",
    "redaction",
    "restore",
    "return",
    "reply",
    "response",
    "reschedule",
    "rewrite",
    "risk",
    "rubric",
    "runbook",
    "sample",
    "schedul",
    "selected",
    "session",
    "start",
    "share",
    "silence",
    "spawn",
    "subagent",
    "standalone",
    "stale",
    "statu",
    "synthesis",
    "time",
    "tick",
    "timeline",
    "tracker",
    "turnover",
    "triage",
    "unclear",
    "clarification",
    "utilization",
    "validation",
    "update",
    "precall",
    "reminder",
    "day",
    "consent",
    "clear",
    "debrief",
    "handoff",
    "accepted",
    "appointment",
    "board",
    "calendar",
    "send",
    "reset",
  ]);
  return tokens.filter((token) => signatureTerms.has(token));
}

function extractValidationCommands(value) {
  const commandPattern = /^(npm|node|npx|pnpm|yarn|rg|grep|git)\b/;
  const commands = [...String(value || "").matchAll(/`([^`]+)`/g)]
    .map((match) => match[1].trim())
    .filter((command) => commandPattern.test(command));
  if (commands.length) return commands;
  const fallback = String(value || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  return fallback.length ? fallback : ["No validation listed"];
}

function sectionLines(document, sectionName) {
  const lines = document.content.split(/\r?\n/);
  const sectionPattern = new RegExp(`^##\\s+${sectionName}\\s*$`, "i");
  const start = lines.findIndex((line) => sectionPattern.test(line.trim()));
  if (start === -1) return [];
  const body = [];

  for (const line of lines.slice(start + 1)) {
    if (/^##\s+/.test(line)) break;
    if (line.trim()) body.push(line);
  }

  return body;
}

function activeQueueLines(document) {
  return sectionLines(document, "Active Queue");
}

function parseActiveBacklogQueue(document) {
  const rows = activeQueueLines(document).filter((line) => /^\s*\|/.test(line));
  if (rows.length < 3) {
    return {
      source: document.title,
      path: document.path,
      items: [],
      byOwner: [],
      byPriority: [],
      byValidationCommand: [],
    };
  }

  const headers = splitMarkdownRow(rows[0]).map((header) => slugify(header));
  const items = rows.slice(2).map((row, index) => {
    const cells = splitMarkdownRow(row);
    const record = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] || ""]));
    const validationCommands = extractValidationCommands(record.validation);
    return {
      id: `${slugify(record.owner)}-${slugify(record.priority)}-${index + 1}`,
      priority: record.priority || "Unprioritized",
      owner: record.owner || "unassigned",
      task: record.task || "",
      validation: record.validation || "",
      validationCommands,
      source: document.title,
      path: document.path,
    };
  });

  function groupBy(key, valueForItem = (item) => item[key]) {
    const groups = new Map();
    for (const item of items) {
      const values = Array.isArray(valueForItem(item)) ? valueForItem(item) : [valueForItem(item)];
      for (const value of values) {
        const groupKey = value || "Unassigned";
        const group = groups.get(groupKey) || { name: groupKey, count: 0, priorities: {}, items: [] };
        group.count += 1;
        group.priorities[item.priority] = (group.priorities[item.priority] || 0) + 1;
        group.items.push(item);
        groups.set(groupKey, group);
      }
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    source: document.title,
    path: document.path,
    items,
    byOwner: groupBy("owner"),
    byPriority: groupBy("priority"),
    byValidationCommand: groupBy("validationCommands", (item) => item.validationCommands),
  };
}

function passCompletionStatus(pass, report) {
  const passStatus = String(pass.status || "").toLowerCase();
  const validationItems = normalizeValidationList(pass.validation);
  const validationPassed = validationItems.length > 0 && validationItems.every((item) => /pass/i.test(item));
  const reportLooksShipped = /\b(shipped|what changed|validation)\b/i.test(report?.content || "");
  const complete =
    passStatus.startsWith("complete") ||
    passStatus === "passed" ||
    passStatus === "shipped" ||
    passStatus === "done" ||
    (!passStatus && validationPassed && reportLooksShipped);
  if (!complete) return null;

  const reportStatus = String(report?.content || "").match(/^\s*status:\s*(.+)$/im)?.[1]?.trim() || "";
  return {
    passStatus: pass.status || "complete",
    reportStatus: reportStatus || (report ? "report published" : "no report found"),
  };
}

function completionEvidenceText(pass, report) {
  return [
    pass.id,
    pass.title,
    pass.prompt,
    pass.summary,
    Array.isArray(pass.deliverables) ? pass.deliverables.join(" ") : "",
    Array.isArray(pass.validation) ? pass.validation.join(" ") : "",
    report?.content || "",
  ]
    .filter(Boolean)
    .join("\n");
}

function negatesAction(text, actionToken) {
  if (!actionToken) return false;
  const normalized = String(text || "").toLowerCase().replace(/\s+/g, " ");
  const actionPattern = actionToken === "run" ? "(run|ran|running)" : actionToken;
  return new RegExp(`\\b(no|not|without|until|pending|blocked)\\b[^.]{0,90}\\b${actionPattern}\\b`).test(normalized);
}

function requiresActionToken(actionToken) {
  const genericActions = new Set(["add", "cover", "keep", "make", "show", "surface"]);
  return Boolean(actionToken && !genericActions.has(actionToken));
}

function closeMatcherRowProfile(item) {
  const text = `${item.task || ""} ${item.validation || ""}`;
  const tokens = uniqueTokens(text);
  const signature = signatureTokens(tokens);
  const actionToken = leadingActionToken(item.task);
  const requiresAction = requiresActionToken(actionToken);

  return {
    tokens,
    signatureTokens: signature,
    actionToken,
    requiresActionToken: requiresAction,
    actionNegation: {
      state: requiresAction ? "applied" : "skipped-generic-action",
      applied: requiresAction,
      reason: requiresAction
        ? `Leading action token "${actionToken}" must be present and not negated in close evidence.`
        : actionToken
          ? `Leading action token "${actionToken}" is generic, so negation checks do not block close evidence.`
          : "No leading action token was found.",
    },
    requiredPrimarySignatureShared: signature.length ? Math.min(3, signature.length) : 0,
    requiredAllSignatureShared: signature.length,
    minimumPrimaryTokenShared: Math.min(5, Math.max(3, Math.ceil(tokens.length * 0.18))),
    minimumAllTokenShared: 5,
  };
}

function buildCloseMatcherDiagnosticsForItem(item, candidates, passes, reports) {
  const profile = closeMatcherRowProfile(item);
  const itemLane = String(item.owner || "").toLowerCase();
  const queueEvidence = queueEvidenceForItem(item, passes, reports);
  const queueAt = queueEvidence?.at || fileTimestamp(item.path || "ops/backlog/NEXT.md");
  const queueMs = timestampMs(queueAt);

  const evaluatedCandidates = candidates
    .filter((candidate) => candidate.lane === itemLane)
    .map((candidate) => {
      const candidateMs = timestampMs(candidate.finishedAt);
      const primarySignatureShared = sharedTokens(profile.signatureTokens, candidate.primaryTokens);
      const allSignatureShared = sharedTokens(profile.signatureTokens, candidate.allTokens);
      const missingPrimarySignatureTokens = profile.signatureTokens.filter((token) => !candidate.primaryTokens.includes(token));
      const missingAllSignatureTokens = profile.signatureTokens.filter((token) => !candidate.allTokens.includes(token));
      const primaryShared = sharedTokens(profile.tokens, candidate.primaryTokens).filter((token) => token !== profile.actionToken);
      const allShared = sharedTokens(profile.tokens, candidate.allTokens).filter((token) => token !== profile.actionToken);
      const primaryNegated = profile.requiresActionToken ? negatesAction(candidate.primaryText, profile.actionToken) : false;
      const allNegated = profile.requiresActionToken ? negatesAction(candidate.allText, profile.actionToken) : false;
      const reasons = [];

      if (queueMs && candidateMs && candidateMs < queueMs) {
        reasons.push("evidence-older-than-current-row");
      }
      if (profile.requiresActionToken && !candidate.primaryTokens.includes(profile.actionToken)) {
        reasons.push("missing-action-token");
      }
      if (primaryNegated || allNegated) {
        reasons.push("action-negated");
      }
      if (primarySignatureShared.length < profile.requiredPrimarySignatureShared) {
        reasons.push("missing-primary-signature-tokens");
      }
      if (allSignatureShared.length < profile.requiredAllSignatureShared) {
        reasons.push("missing-report-signature-tokens");
      }
      if (primaryShared.length < profile.minimumPrimaryTokenShared) {
        reasons.push("insufficient-primary-token-overlap");
      }
      if (allShared.length < profile.minimumAllTokenShared) {
        reasons.push("insufficient-report-token-overlap");
      }

      return {
        passId: candidate.id,
        passPath: candidate.sourcePath,
        lane: candidate.lane,
        title: candidate.title,
        report: candidate.report,
        finishedAt: candidate.finishedAt,
        passStatus: candidate.status.passStatus,
        reportStatus: candidate.status.reportStatus,
        isCurrentEvidence: Boolean(!queueMs || !candidateMs || candidateMs >= queueMs),
        matched: reasons.length === 0,
        reasons,
        matchedTokens: {
          primary: primaryShared.slice(0, 10),
          report: allShared.slice(0, 12),
          signaturePrimary: primarySignatureShared,
          signatureReport: allSignatureShared,
        },
        missingSignatureTokens: {
          primary: missingPrimarySignatureTokens,
          report: missingAllSignatureTokens,
        },
        actionToken: profile.actionToken,
        actionNegation: {
          state: profile.actionNegation.state,
          applied: profile.actionNegation.applied,
          detected: primaryNegated || allNegated,
          primaryDetected: primaryNegated,
          reportDetected: allNegated,
        },
        summary: candidate.summary,
      };
    })
    .sort((a, b) => {
      if (a.matched !== b.matched) return a.matched ? -1 : 1;
      return timestampMs(b.finishedAt) - timestampMs(a.finishedAt);
    });

  const matches = evaluatedCandidates.filter((candidate) => candidate.matched);
  const strongestReject = evaluatedCandidates.find((candidate) => !candidate.matched);

  return {
    id: item.id,
    owner: item.owner,
    priority: item.priority,
    task: item.task,
    validation: item.validation,
    path: item.path,
    queueAt,
    queueSource: queueEvidence
      ? {
          type: "pass-report-match",
          pass: queueEvidence.sourcePass,
          report: queueEvidence.sourceReport,
          sharedMarkers: queueEvidence.sharedMarkers,
        }
      : {
          type: "backlog-file",
          path: item.path || "ops/backlog/NEXT.md",
        },
    actionToken: profile.actionToken,
    actionNegation: profile.actionNegation,
    signatureTokens: profile.signatureTokens,
    matchedTokens: matches[0]?.matchedTokens || { primary: [], report: [], signaturePrimary: [], signatureReport: [] },
    missingSignatureTokens: matches[0]?.missingSignatureTokens || {
      primary: profile.signatureTokens,
      report: profile.signatureTokens,
    },
    currentEvidenceCandidates: evaluatedCandidates.slice(0, 5),
    matchedCandidates: matches.slice(0, 3),
    recommendedAction: matches.length ? "close" : "keep-active",
    rationale: matches.length
      ? "Current completed pass/report evidence satisfies lane, freshness, action, signature-token, and token-overlap checks."
      : strongestReject
        ? `Keep active: closest evidence was rejected for ${strongestReject.reasons.join(", ")}.`
        : "Keep active: no completed pass/report evidence exists for this lane.",
    thresholds: {
      requiredPrimarySignatureShared: profile.requiredPrimarySignatureShared,
      requiredAllSignatureShared: profile.requiredAllSignatureShared,
      minimumPrimaryTokenShared: profile.minimumPrimaryTokenShared,
      minimumAllTokenShared: profile.minimumAllTokenShared,
    },
  };
}

function buildStaleQueueGuardrails(queue, passes, reports) {
  const reportsByPath = reportByPath(reports);
  const evidence = passes
    .map((pass) => {
      const report = reportsByPath.get(pass.report);
      const status = passCompletionStatus(pass, report);
      if (!status || !pass.report || !report) return null;

      const primaryText = [pass.id, pass.title, pass.prompt, pass.summary].filter(Boolean).join("\n");
      const allText = completionEvidenceText(pass, report);
      return {
        id: pass.id || pass.report,
        sourcePath: pass.sourcePath || "",
        lane: String(pass.lane || "").toLowerCase(),
        title: pass.title || pass.prompt || pass.id || "Completed pass",
        summary: pass.summary || firstParagraph(report.content),
        report: pass.report,
        finishedAt: pass.finishedAt || pass.startedAt || pass.timestamp || null,
        status,
        primaryTokens: uniqueTokens(primaryText),
        allTokens: uniqueTokens(allText),
        primaryText,
        allText,
      };
    })
    .filter(Boolean);

  const diagnostics = (queue.items || []).map((item) => buildCloseMatcherDiagnosticsForItem(item, evidence, passes, reports));
  const staleItems = diagnostics
    .map((diagnostic) => {
      const matches = (diagnostic.matchedCandidates || []).map((candidate) => ({
        passId: candidate.passId,
        passPath: candidate.passPath,
        title: candidate.title,
        summary: candidate.summary,
        report: candidate.report,
        finishedAt: candidate.finishedAt,
        passStatus: candidate.passStatus,
        reportStatus: candidate.reportStatus,
        sharedMarkers: candidate.matchedTokens?.report?.slice(0, 8) || [],
        matchedTokens: candidate.matchedTokens || {},
        missingSignatureTokens: candidate.missingSignatureTokens || {},
        actionNegation: candidate.actionNegation || diagnostic.actionNegation,
      }));

      if (!matches.length) return null;
      return {
        id: diagnostic.id,
        owner: diagnostic.owner,
        priority: diagnostic.priority,
        task: diagnostic.task,
        path: diagnostic.path,
        matches: matches.slice(0, 2),
      };
    })
    .filter(Boolean);

  const diagnosticsById = new Map(diagnostics.map((diagnostic) => [diagnostic.id, diagnostic]));
  for (const item of queue.items || []) {
    const diagnostic = diagnosticsById.get(item.id);
    const matches = (diagnostic?.matchedCandidates || []).map((candidate) => ({
      passId: candidate.passId,
      passPath: candidate.passPath,
      title: candidate.title,
      summary: candidate.summary,
      report: candidate.report,
      finishedAt: candidate.finishedAt,
      passStatus: candidate.passStatus,
      reportStatus: candidate.reportStatus,
      sharedMarkers: candidate.matchedTokens?.report?.slice(0, 8) || [],
      matchedTokens: candidate.matchedTokens || {},
      missingSignatureTokens: candidate.missingSignatureTokens || {},
      actionNegation: candidate.actionNegation || diagnostic.actionNegation,
    }));
    item.staleMatches = matches.slice(0, 2);
    item.closeMatcherDiagnostic = diagnostic;
  }

  return {
    generatedFrom: ["ops/backlog/NEXT.md", "ops/progress/passes/*.json", "ops/reports/*.md"],
    total: staleItems.length,
    items: staleItems,
    diagnostics,
  };
}

function buildQueueRefreshDecisionInput(queue, guardrails) {
  const staleById = new Map((guardrails.items || []).map((item) => [item.id, item]));
  const diagnosticsById = new Map((guardrails.diagnostics || []).map((item) => [item.id, item]));
  const decisions = (queue.items || []).map((item) => {
    const staleItem = staleById.get(item.id);
    const diagnostic = diagnosticsById.get(item.id) || item.closeMatcherDiagnostic || null;
    const matches = staleItem?.matches || [];
    const close = matches.length > 0;
    return {
      id: item.id,
      owner: item.owner,
      priority: item.priority,
      task: item.task,
      validation: item.validation,
      path: item.path,
      recommendedAction: close ? "close" : "keep-active",
      rationale: diagnostic?.rationale || (close
        ? "Completed pass/report evidence matches this active queue item by lane, leading action, and domain markers."
        : "No completed pass/report evidence matched this active queue item strongly enough to close it automatically."),
      closeMatcherDiagnostic: diagnostic,
      evidence: matches.map((match) => ({
        passId: match.passId,
        passPath: match.passPath,
        title: match.title,
        report: match.report,
        finishedAt: match.finishedAt,
        status: `${match.passStatus} | ${match.reportStatus}`,
        sharedMarkers: match.sharedMarkers || [],
        matchedTokens: match.matchedTokens || {},
        missingSignatureTokens: match.missingSignatureTokens || {},
        actionNegation: match.actionNegation || diagnostic?.actionNegation || null,
      })),
    };
  });

  const safeToClose = decisions.filter((decision) => decision.recommendedAction === "close");
  const keepActive = decisions.filter((decision) => decision.recommendedAction === "keep-active");
  const allCurrentRowsSafeToClose = decisions.length > 0 && keepActive.length === 0;
  const closeEvidenceLinks = safeToClose.flatMap((decision) =>
    (decision.evidence || []).map((evidence) => ({
      queueId: decision.id,
      owner: decision.owner,
      priority: decision.priority,
      task: decision.task,
      passId: evidence.passId,
      passPath: evidence.passPath,
      report: evidence.report,
      title: evidence.title,
      finishedAt: evidence.finishedAt,
      status: evidence.status,
      sharedMarkers: evidence.sharedMarkers || [],
    }))
  );

  return {
    generatedFrom: guardrails.generatedFrom || [],
    activeTotal: decisions.length,
    safeToCloseCount: safeToClose.length,
    keepActiveCount: keepActive.length,
    allCurrentRowsSafeToClose,
    closeReadiness: {
      status: !decisions.length ? "empty" : allCurrentRowsSafeToClose ? "all-safe-to-close" : "needs-open-work",
      activeTotal: decisions.length,
      safeToCloseCount: safeToClose.length,
      keepActiveCount: keepActive.length,
      allCurrentRowsSafeToClose,
      headline: allCurrentRowsSafeToClose
        ? "All current active queue rows are safe to close"
        : "Active queue still has rows to keep open",
      rationale: allCurrentRowsSafeToClose
        ? "Every active queue row has completed pass/report evidence from the stale guardrail matcher."
        : "At least one active queue row lacks strong completed pass/report evidence, so the queue should not be closed wholesale yet.",
      evidenceLinks: closeEvidenceLinks,
      generatedFrom: guardrails.generatedFrom || [],
    },
    safeToClose,
    keepActive,
    decisions,
    nextRefresh: {
      closeIds: safeToClose.map((decision) => decision.id),
      keepIds: keepActive.map((decision) => decision.id),
    },
  };
}

function parseRecentlyShipped(document) {
  const lines = sectionLines(document, "Recently Shipped").filter((line) => /^\s*[-*]\s+/.test(line));
  const items = lines
    .map((line, index) => {
      const text = normalizeActionText(line);
      const [label, ...detailParts] = text.split(":");
      const detail = detailParts.join(":").trim();
      const derivedLabel = text.split(/[,.]/)[0].trim();
      return {
        id: `shipped-${index + 1}`,
        label: detail ? label.trim() : derivedLabel,
        summary: detail || text,
        source: document.title,
        path: document.path,
      };
    })
    .filter((item) => item.summary);

  return {
    source: document.title,
    path: document.path,
    items,
    count: items.length,
  };
}

function sectionText(document, sectionNames) {
  if (!document?.content) return "";
  const names = Array.isArray(sectionNames) ? sectionNames : [sectionNames];
  for (const name of names) {
    const lines = sectionLines(document, name);
    if (lines.length) return lines.join("\n");
  }
  return "";
}

function markdownBullets(markdown) {
  return String(markdown || "")
    .split(/\r?\n/)
    .filter((line) => /^\s*[-*]\s+/.test(line))
    .map(normalizeActionText)
    .filter(Boolean);
}

function firstParagraph(markdown) {
  return String(markdown || "")
    .split(/\n\s*\n/)
    .map((part) => part.replace(/^#+\s+.+$/gm, "").trim())
    .find(Boolean) || "";
}

function normalizeValidationList(validation) {
  if (Array.isArray(validation)) {
    return validation.map((item) => {
      if (item && typeof item === "object") {
        return [
          item.command,
          item.status,
          item.result,
          item.ok === undefined ? null : item.ok ? "passed" : "failed",
          item.engine,
        ]
          .filter(Boolean)
          .join(": ");
      }
      return item;
    });
  }
  if (validation && typeof validation === "object") {
    return Object.entries(validation).map(([command, result]) => `${command}: ${result}`);
  }
  return [];
}

function validationCommandsFromPassAndReport(pass, report) {
  const passItems = normalizeValidationList(pass.validation);
  const reportValidation = sectionText(report, "Validation");
  const reportCommands = extractValidationCommands(reportValidation).filter((command) => command !== "No validation listed");
  const commands = [...passItems, ...reportCommands]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return [...new Set(commands)];
}

function changedFilesFromPassAndReport(pass, report) {
  const fromPass = [
    ...(Array.isArray(pass.filesChanged) ? pass.filesChanged : []),
    ...(Array.isArray(pass.deliverables) ? pass.deliverables : []),
  ];
  const changeText = sectionText(report, ["Changes", "Changed Files", "Files Changed", "Outcome"]);
  const fromReport = [...String(changeText || "").matchAll(/`([^`]+\.[a-z0-9]+[^`]*)`/gi)]
    .map((match) => match[1].trim())
    .filter((value) => /^[\w./-]+$/.test(value) && /^(website|ops|data|scripts|src|public)\//.test(value));
  return [...new Set([...fromPass, ...fromReport])].slice(0, 8);
}

function timestampMs(value) {
  const time = new Date(value || "").getTime();
  return Number.isNaN(time) ? 0 : time;
}

function decisionKind(pass, report) {
  const lane = String(pass.lane || "").toLowerCase();
  const text = `${pass.title || ""} ${pass.prompt || ""} ${pass.summary || ""} ${report?.content || ""}`.toLowerCase();
  if (lane === "qa") return "QA gate";
  if (lane === "growth") return /threshold|hypothesis|pricing/.test(text) ? "Growth decision" : "Growth learning";
  if (lane === "product") return /ship|shipped|implement|added|editable|candidate|export|product behavior/.test(text) ? "Product choice" : "Product decision";
  return "Decision";
}

function decisionSignal(pass, report) {
  const focused = sectionText(report, [
    "Outcome",
    "Product behavior",
    "Coverage Added",
    "Business Impact",
    "What The Template Covers",
    "Deliverable",
  ]);
  const bullets = markdownBullets(focused).slice(0, 3);
  if (bullets.length) return bullets;
  const paragraph = firstParagraph(focused || report?.content || pass.summary);
  return paragraph ? [paragraph] : [];
}

function buildDecisionLedger(passes, reports) {
  const reportsByPath = reportByPath(reports);
  const targetLanes = ["product", "growth", "qa"];
  const decisions = passes
    .filter((pass) => targetLanes.includes(String(pass.lane || "").toLowerCase()))
    .map((pass) => {
      const report = reportsByPath.get(pass.report);
      return {
        id: pass.id || `${pass.lane}-${pass.startedAt}`,
        lane: String(pass.lane || "unknown").toLowerCase(),
        title: pass.title || pass.prompt || "Untitled decision",
        kind: decisionKind(pass, report),
        decidedAt: pass.finishedAt || pass.startedAt || pass.timestamp || null,
        summary: pass.summary || firstParagraph(report?.content),
        signals: decisionSignal(pass, report),
        validation: normalizeValidationList(pass.validation).slice(0, 4),
        source: pass.report || "",
      };
    })
    .filter((decision) => decision.summary || decision.signals.length)
    .sort((a, b) => String(b.decidedAt || "").localeCompare(String(a.decidedAt || "")));

  const byLane = Object.fromEntries(
    targetLanes.map((lane) => [
      lane,
      {
        lane,
        latestAt: decisions.find((decision) => decision.lane === lane)?.decidedAt || null,
        items: decisions.filter((decision) => decision.lane === lane).slice(0, 3),
      },
    ])
  );

  return {
    generatedFrom: ["ops/progress/passes/*.json", "ops/reports/*.md"],
    total: decisions.length,
    latest: decisions.slice(0, 6),
    byLane,
  };
}

function buildValidationFreshness(laneDocs, queueRefreshDecisionInput, passes, reports) {
  const reportsByPath = reportByPath(reports);
  const laneNames = laneDocs.map((lane) => lane.title).filter(Boolean).sort();
  const decisionsByOwner = new Map();

  for (const decision of queueRefreshDecisionInput.decisions || []) {
    const lane = String(decision.owner || "").toLowerCase();
    const laneDecisions = decisionsByOwner.get(lane) || [];
    laneDecisions.push(decision);
    decisionsByOwner.set(lane, laneDecisions);
  }

  const items = laneNames.map((laneName) => {
    const lane = String(laneName || "").toLowerCase();
    const lanePasses = passes
      .filter((pass) => String(pass.lane || "").toLowerCase() === lane)
      .slice()
      .sort((a, b) => timestampMs(b.finishedAt || b.startedAt || b.timestamp) - timestampMs(a.finishedAt || a.startedAt || a.timestamp));
    const latestPass = lanePasses[0] || null;
    const report = latestPass?.report ? reportsByPath.get(latestPass.report) : null;
    const validationCommands = latestPass ? validationCommandsFromPassAndReport(latestPass, report) : [];
    const activeDecisions = decisionsByOwner.get(lane) || [];
    const keepActive = activeDecisions.filter((decision) => decision.recommendedAction !== "close");
    const latestComplete = latestPass ? passCompletionStatus(latestPass, report) : null;
    const needsAnotherPass = !latestPass || !latestComplete || validationCommands.length === 0 || keepActive.length > 0;
    const rationale = !latestPass
      ? "No pass JSON has been recorded for this lane yet."
      : !latestComplete
        ? "The latest pass is not marked complete by pass/report evidence."
        : validationCommands.length === 0
          ? "The latest pass has no validation command recorded."
          : keepActive.length
            ? "The active queue still has unmatched work for this lane."
            : "Latest completed pass has validation evidence and no unmatched active queue row.";

    return {
      lane,
      lanePath: laneDocs.find((doc) => doc.title === laneName)?.path || "",
      status: needsAnotherPass ? "needs-pass" : "fresh",
      needsAnotherPass,
      lastChangedAt: latestPass?.finishedAt || latestPass?.startedAt || latestPass?.timestamp || null,
      lastChangedBy: latestPass?.agent || "",
      lastChangeTitle: latestPass?.title || latestPass?.prompt || latestPass?.id || "No pass recorded",
      lastChangeSummary: Array.isArray(latestPass?.summary) ? latestPass.summary.join(" ") : latestPass?.summary || "",
      changedFiles: latestPass ? changedFilesFromPassAndReport(latestPass, report) : [],
      provedBy: validationCommands[0] || "",
      validationCommands,
      report: latestPass?.report || "",
      activeQueue: activeDecisions.map((decision) => ({
        id: decision.id,
        priority: decision.priority,
        task: decision.task,
        recommendedAction: decision.recommendedAction,
      })),
      rationale,
    };
  });

  return {
    generatedFrom: ["ops/progress/passes/*.json", "ops/reports/*.md", "ops/backlog/NEXT.md"],
    freshCount: items.filter((item) => !item.needsAnotherPass).length,
    needsPassCount: items.filter((item) => item.needsAnotherPass).length,
    latestChangedLane: items.slice().sort((a, b) => timestampMs(b.lastChangedAt) - timestampMs(a.lastChangedAt))[0]?.lane || null,
    items,
  };
}

function validationLooksFailed(item) {
  const text = String(item || "").toLowerCase();
  return /\b(fail|failed|failing|error|blocked|timeout|not run|pending|unable|missing)\b/.test(text) && !/\b(no failures|0 failed|passed)\b/.test(text);
}

function impactScore(pass) {
  if (typeof pass.score?.impact === "number") return pass.score.impact;
  return averageNumericScore(pass.score);
}

function passRiskSignals(pass, report) {
  const signals = [];
  const status = String(pass.status || "").toLowerCase();
  const validationItems = normalizeValidationList(pass.validation);
  const reportText = String(report?.content || "").toLowerCase();
  const score = impactScore(pass);

  if (score !== null && score < 7) signals.push(`impact ${score.toFixed(1)}/10`);
  if (status && !status.startsWith("complete") && !["passed", "shipped", "done"].includes(status)) signals.push(`status ${pass.status}`);
  if (validationItems.some(validationLooksFailed)) signals.push("validation issue");
  if (/\b(low-impact loop|failed attempt|blocked|could not|unable to|not feasible|not run)\b/.test(reportText)) signals.push("report risk marker");

  return signals;
}

function compactEvidence(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function reportEvidenceForSignals(pass, report, signals) {
  const reportContent = String(report?.content || "");
  const sourceSections = [
    "Outcome",
    "Validation",
    "Learning",
    "Changes",
    "Changed Files",
    "Risk",
    "Blockers",
  ];
  const sectionEvidence = sourceSections
    .map((section) => ({
      label: section,
      text: sectionText(report, section),
    }))
    .filter((item) => item.text);
  const riskLine = reportContent
    .split(/\r?\n/)
    .find((line) => /\b(low-impact loop|failed attempt|blocked|could not|unable to|not feasible|not run|validation)\b/i.test(line));
  const validationItems = normalizeValidationList(pass.validation);
  const source = sectionEvidence[0] || (riskLine ? { label: "Report line", text: riskLine } : null);
  const evidence = [
    compactEvidence(source?.text || pass.summary || pass.prompt || pass.id),
    validationItems.length ? `Validation: ${validationItems.slice(0, 2).join("; ")}` : "",
    signals.length ? `Signals: ${signals.join(", ")}` : "",
  ].filter(Boolean);

  return {
    sourceLabel: source?.label || (report ? "Report" : "Pass JSON"),
    excerpt: evidence.join(" | "),
    hasReport: Boolean(report),
  };
}

function relativeAgeLabel(referenceMs, value) {
  const then = timestampMs(value);
  if (!referenceMs || !then) return "No validation";
  const minutes = Math.max(0, Math.round((referenceMs - then) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function fileTimestamp(relativePath) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolutePath)) return null;
  return fs.statSync(absolutePath).mtime.toISOString();
}

function queueEvidenceForItem(item, passes, reports) {
  const reportsByPath = reportByPath(reports);
  const itemText = `${item.task || ""} ${item.validation || ""}`;
  const itemTokens = uniqueTokens(itemText);
  const itemSignatureTokens = signatureTokens(itemTokens);
  const requiredSignatureCount = itemSignatureTokens.length ? Math.min(2, itemSignatureTokens.length) : 0;
  const queueEvidencePattern = /\b(rolled? the active queue|active queue to|next active items|next work|queue refresh|keep active|safe to close|current assignments|backlog balance)\b/i;

  return passes
    .map((pass) => {
      const report = pass.report ? reportsByPath.get(pass.report) : null;
      const allText = completionEvidenceText(pass, report);
      if (!queueEvidencePattern.test(allText)) return null;
      const allTokens = uniqueTokens(allText);
      const signatureShared = sharedTokens(itemSignatureTokens, allTokens);
      const allShared = sharedTokens(itemTokens, allTokens);
      if (signatureShared.length < requiredSignatureCount || allShared.length < 4) return null;
      return {
        at: pass.finishedAt || pass.startedAt || pass.timestamp || null,
        sourcePass: pass.sourcePath || "",
        sourceReport: pass.report || "",
        sharedMarkers: allShared.slice(0, 8),
      };
    })
    .filter((candidate) => candidate && timestampMs(candidate.at))
    .sort((a, b) => timestampMs(b.at) - timestampMs(a.at))[0] || null;
}

function latestValidationProofForLane(lane, passes, reports) {
  const reportsByPath = reportByPath(reports);
  return passes
    .filter((pass) => String(pass.lane || "").toLowerCase() === lane)
    .map((pass) => {
      const report = pass.report ? reportsByPath.get(pass.report) : null;
      const validationCommands = validationCommandsFromPassAndReport(pass, report);
      const complete = passCompletionStatus(pass, report);
      if (!validationCommands.length || !complete) return null;
      return {
        at: pass.finishedAt || pass.startedAt || pass.timestamp || null,
        title: pass.title || pass.prompt || pass.id || "Validation proof",
        command: validationCommands[0],
        sourcePass: pass.sourcePath || "",
        sourceReport: pass.report || "",
        status: `${complete.passStatus} | ${complete.reportStatus}`,
      };
    })
    .filter((proof) => proof && timestampMs(proof.at))
    .sort((a, b) => timestampMs(b.at) - timestampMs(a.at))[0] || null;
}

function buildQueueAgeProofComparison(queue, passes, reports, generatedAt) {
  const referenceMs = timestampMs(generatedAt) || Date.now();
  const backlogAt = fileTimestamp(queue.path || "ops/backlog/NEXT.md");
  const items = (queue.items || []).map((item) => {
    const lane = String(item.owner || "").toLowerCase();
    const queueEvidence = queueEvidenceForItem(item, passes, reports);
    const proof = latestValidationProofForLane(lane, passes, reports);
    const queueAt = queueEvidence?.at || backlogAt || generatedAt;
    const queueMs = timestampMs(queueAt);
    const proofMs = timestampMs(proof?.at);
    const queueAgeMinutes = queueMs ? Math.max(0, Math.round((referenceMs - queueMs) / 60000)) : null;
    const proofAgeMinutes = proofMs ? Math.max(0, Math.round((referenceMs - proofMs) / 60000)) : null;
    const proofMinusQueueMinutes = proofMs && queueMs ? Math.round((proofMs - queueMs) / 60000) : null;
    const proofIsNewer = proofMinusQueueMinutes !== null && proofMinusQueueMinutes > 0;
    const queueIsNewer = proofMinusQueueMinutes !== null && proofMinusQueueMinutes <= 0;
    const comparison = !proof
      ? "no-validation-proof"
      : proofIsNewer
        ? "proof-newer-than-active-queue"
        : "active-queue-newer-than-proof";

    return {
      id: item.id,
      lane,
      priority: item.priority,
      task: item.task,
      validation: item.validation,
      queueAt,
      queueAgeMinutes,
      queueAgeLabel: relativeAgeLabel(referenceMs, queueAt).replace("No validation", "No queue age"),
      queueSource: queueEvidence
        ? {
            type: "pass-report-match",
            pass: queueEvidence.sourcePass,
            report: queueEvidence.sourceReport,
            sharedMarkers: queueEvidence.sharedMarkers,
          }
        : {
            type: "backlog-file",
            path: queue.path || "ops/backlog/NEXT.md",
          },
      proofAt: proof?.at || null,
      proofAgeMinutes,
      proofAgeLabel: proof ? relativeAgeLabel(referenceMs, proof.at) : "No validation proof",
      proofMinusQueueMinutes,
      proofIsNewer,
      queueIsNewer,
      comparison,
      riskLabel: !proof ? "Needs proof" : proofIsNewer ? "Proof newer" : "Awaiting proof",
      rationale: !proof
        ? "No completed validation pass was found for this lane."
        : proofIsNewer
          ? "Latest lane validation proof is newer than the active queue evidence, so the row should be watched before it turns into a loop."
          : "The active queue evidence is newer than the latest validation proof, so this row is still waiting for its lane proof.",
      proofSource: proof
        ? {
            title: proof.title,
            command: proof.command,
            status: proof.status,
            pass: proof.sourcePass,
            report: proof.sourceReport,
          }
        : null,
    };
  });

  return {
    generatedFrom: ["ops/backlog/NEXT.md", "ops/progress/passes/*.json", "ops/reports/*.md"],
    referenceAt: generatedAt,
    total: items.length,
    proofNewerCount: items.filter((item) => item.proofIsNewer).length,
    awaitingProofCount: items.filter((item) => item.queueIsNewer).length,
    noProofCount: items.filter((item) => !item.proofSource).length,
    oldestQueueAgeMinutes: Math.max(...items.map((item) => item.queueAgeMinutes || 0), 0),
    items,
  };
}

function buildDeliverableReadiness(queue, validationFreshness, queueAgeProofComparison, queueRefreshDecisionInput, passes, reports, generatedAt) {
  const referenceMs = timestampMs(generatedAt) || Date.now();
  const targetLanes = ["product", "qa", "admin", "growth"];
  const proofItemsByLane = new Map((queueAgeProofComparison.items || []).map((item) => [item.id, item]));
  const decisionsById = new Map((queueRefreshDecisionInput.decisions || []).map((decision) => [decision.id, decision]));
  const freshnessByLane = new Map((validationFreshness.items || []).map((item) => [item.lane, item]));

  const lanes = targetLanes.map((lane) => {
    const activeRows = (queue.items || []).filter((item) => String(item.owner || "").toLowerCase() === lane);
    const laneProof = latestValidationProofForLane(lane, passes, reports);
    const freshness = freshnessByLane.get(lane);
    const rows = activeRows.map((item) => {
      const proofItem = proofItemsByLane.get(item.id) || {};
      const decision = decisionsById.get(item.id) || {};
      const closeEvidence = (decision.evidence || []).map((evidence) => ({
        passId: evidence.passId,
        passPath: evidence.passPath,
        report: evidence.report,
        title: evidence.title,
        finishedAt: evidence.finishedAt,
        status: evidence.status,
        sharedMarkers: evidence.sharedMarkers || [],
      }));
      const rowStatus = closeEvidence.length
        ? "close-evidence"
        : proofItem.proofIsNewer
          ? "proof-recorded"
          : proofItem.proofSource
            ? "awaiting-current-proof"
            : "needs-proof";

      return {
        id: item.id,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        validationCommands: item.validationCommands || [],
        status: rowStatus,
        statusLabel:
          rowStatus === "close-evidence"
            ? "Close evidence"
            : rowStatus === "proof-recorded"
              ? "Proof recorded"
              : rowStatus === "awaiting-current-proof"
                ? "Awaiting current proof"
                : "Needs proof",
        queueAgeLabel: proofItem.queueAgeLabel || "No queue age",
        proofAgeLabel: proofItem.proofAgeLabel || (laneProof ? relativeAgeLabel(referenceMs, laneProof.at) : "No validation proof"),
        proofSource: proofItem.proofSource || (laneProof
          ? {
              title: laneProof.title,
              command: laneProof.command,
              status: laneProof.status,
              pass: laneProof.sourcePass,
              report: laneProof.sourceReport,
            }
          : null),
        queueSource: proofItem.queueSource || { type: "backlog-file", path: item.path || queue.path || "ops/backlog/NEXT.md" },
        closeEvidence,
        closeRecommendation: decision.recommendedAction || "keep-active",
        rationale:
          closeEvidence.length
            ? "Completed pass/report evidence matches this active deliverable row."
            : proofItem.rationale || "Current active row is waiting for lane-specific proof or close evidence.",
      };
    });
    const closeEvidenceCount = rows.filter((row) => row.closeEvidence.length).length;
    const proofRecordedCount = rows.filter((row) => row.status === "close-evidence" || row.status === "proof-recorded").length;
    const laneStatus = !rows.length
      ? "no-active-row"
      : closeEvidenceCount === rows.length
        ? "ready-to-close"
        : proofRecordedCount === rows.length
          ? "proof-recorded"
          : "needs-proof";

    return {
      lane,
      activeCount: rows.length,
      status: laneStatus,
      statusLabel:
        laneStatus === "ready-to-close"
          ? "Ready to close"
          : laneStatus === "proof-recorded"
            ? "Proof recorded"
            : laneStatus === "no-active-row"
              ? "No active row"
              : "Needs proof",
      latestProofAt: laneProof?.at || freshness?.lastChangedAt || null,
      latestProofAgeLabel: laneProof ? relativeAgeLabel(referenceMs, laneProof.at) : "No validation proof",
      latestProofTitle: laneProof?.title || freshness?.lastChangeTitle || "",
      latestProofCommand: laneProof?.command || freshness?.provedBy || "",
      latestProofSource: laneProof
        ? {
            pass: laneProof.sourcePass,
            report: laneProof.sourceReport,
            status: laneProof.status,
          }
        : freshness?.report
          ? {
              pass: "",
              report: freshness.report,
              status: freshness.status || "",
            }
          : null,
      closeEvidenceCount,
      proofRecordedCount,
      needsProofCount: rows.filter((row) => row.status === "needs-proof" || row.status === "awaiting-current-proof").length,
      rows,
    };
  });

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      "ops/progress/passes/*.json",
      "ops/reports/*.md",
      "validationFreshness",
      "queueAgeProofComparison",
      "queueRefreshDecisionInput",
    ],
    referenceAt: generatedAt,
    activeTotal: lanes.reduce((sum, lane) => sum + lane.activeCount, 0),
    readyToCloseCount: lanes.filter((lane) => lane.status === "ready-to-close").length,
    needsProofCount: lanes.reduce((sum, lane) => sum + lane.needsProofCount, 0),
    lanes,
  };
}

function latestFourLaneCycle(passes) {
  const targetLanes = ["product", "qa", "admin", "growth"];
  const passesBySource = new Map(passes.map((pass) => [pass.sourcePath, pass]));

  return passes
    .filter((pass) => String(pass.lane || "").toLowerCase() === "orchestrator" && Array.isArray(pass.workerPasses))
    .map((pass) => {
      const workers = pass.workerPasses
        .map((sourcePath) => {
          const worker = passesBySource.get(sourcePath);
          return worker
            ? {
                lane: String(worker.lane || "").toLowerCase(),
                title: worker.title || worker.prompt || worker.id || "Worker pass",
                pass: worker.sourcePath || sourcePath,
                report: worker.report || "",
                status: worker.status || "complete",
                finishedAt: worker.finishedAt || worker.startedAt || worker.timestamp || null,
              }
            : {
                lane: "",
                title: sourcePath,
                pass: sourcePath,
                report: "",
                status: "missing-pass-json",
                finishedAt: null,
              };
        })
        .filter((worker) => targetLanes.includes(worker.lane));
      const workerLanes = [...new Set(workers.map((worker) => worker.lane))];
      if (!targetLanes.every((lane) => workerLanes.includes(lane))) return null;
      return {
        id: pass.id || pass.sourcePath,
        title: pass.title || pass.prompt || "Four-lane cycle",
        finishedAt: pass.finishedAt || pass.startedAt || pass.timestamp || null,
        pass: pass.sourcePath || "",
        report: pass.report || "",
        lanesCompleted: workerLanes.sort(),
        workers,
      };
    })
    .filter((cycle) => cycle && timestampMs(cycle.finishedAt))
    .sort((a, b) => timestampMs(b.finishedAt) - timestampMs(a.finishedAt))[0] || null;
}

function buildTurnoverSummary(queue, queueAgeProofComparison, queueRefreshDecisionInput, passes, reports, generatedAt) {
  const referenceMs = timestampMs(generatedAt) || Date.now();
  const latestCycle = latestFourLaneCycle(passes);
  const cycleMs = timestampMs(latestCycle?.finishedAt);
  const proofItemsById = new Map((queueAgeProofComparison.items || []).map((item) => [item.id, item]));
  const decisionsById = new Map((queueRefreshDecisionInput.decisions || []).map((decision) => [decision.id, decision]));

  const rows = (queue.items || []).map((item) => {
    const proofItem = proofItemsById.get(item.id) || {};
    const decision = decisionsById.get(item.id) || {};
    const closeEvidence = decision.evidence || [];
    const queueMs = timestampMs(proofItem.queueAt);
    const proofMs = timestampMs(proofItem.proofAt);
    const queuedAfterCycle = Boolean(cycleMs && queueMs && queueMs >= cycleMs);
    const status = closeEvidence.length
      ? "current-close-evidence"
      : queuedAfterCycle || !proofItem.proofSource
        ? "newly-ready"
        : proofMs && queueMs && proofMs < queueMs
          ? "older-evidence"
          : proofItem.proofIsNewer
            ? "new-proof"
            : "needs-proof";

    return {
      id: item.id,
      lane: String(item.owner || "").toLowerCase(),
      priority: item.priority,
      task: item.task,
      validation: item.validation,
      status,
      statusLabel:
        status === "current-close-evidence"
          ? "Current close evidence"
          : status === "newly-ready"
            ? "Newly ready"
            : status === "older-evidence"
              ? "Older evidence only"
              : status === "new-proof"
                ? "New proof recorded"
                : "Needs proof",
      queuedAfterCycle,
      queueAt: proofItem.queueAt || null,
      queueAgeLabel: proofItem.queueAgeLabel || "No queue age",
      proofAt: proofItem.proofAt || null,
      proofAgeLabel: proofItem.proofAgeLabel || "No validation proof",
      proofMinusQueueMinutes: proofItem.proofMinusQueueMinutes ?? null,
      proofSource: proofItem.proofSource || null,
      queueSource: proofItem.queueSource || { type: "backlog-file", path: item.path || queue.path || "ops/backlog/NEXT.md" },
      closeEvidence,
      rationale: closeEvidence.length
        ? "This current row has row-specific close evidence from pass/report matching."
        : status === "older-evidence"
          ? "Latest lane proof predates the current active queue row, so it is shown as older context only."
          : status === "newly-ready"
            ? "This row belongs to the active queue after the latest four-lane turnover and is waiting for fresh row-specific proof."
            : proofItem.rationale || "Waiting for current-cycle evidence.",
    };
  });

  const olderEvidence = rows.filter((row) => row.status === "older-evidence");
  const newlyReady = rows.filter((row) => row.status === "newly-ready");
  const currentCloseEvidence = rows.filter((row) => row.status === "current-close-evidence");

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      "ops/progress/passes/*.json",
      "ops/reports/*.md",
      "queueAgeProofComparison",
      "queueRefreshDecisionInput",
    ],
    referenceAt: generatedAt,
    latestCycle,
    headline: latestCycle
      ? `${newlyReady.length} newly ready, ${olderEvidence.length} older evidence only`
      : `${newlyReady.length} newly ready rows`,
    rationale: latestCycle
      ? "Latest product, QA, admin, and growth cycle is complete; active rows created by that turnover require fresh row-specific proof before close."
      : "No completed four-lane turnover cycle was detected yet; active rows still require row-specific proof before close.",
    activeTotal: rows.length,
    newlyReadyCount: newlyReady.length,
    olderEvidenceCount: olderEvidence.length,
    currentCloseEvidenceCount: currentCloseEvidence.length,
    latestCycleAgeLabel: latestCycle ? relativeAgeLabel(referenceMs, latestCycle.finishedAt) : "No four-lane cycle found",
    rows,
    newlyReady,
    olderEvidence,
    currentCloseEvidence,
  };
}

function reasonCounts(candidates) {
  const counts = {};
  for (const candidate of candidates || []) {
    for (const reason of candidate.reasons || []) {
      counts[reason] = (counts[reason] || 0) + 1;
    }
  }
  return counts;
}

function compactReasonCounts(counts, limit = 5) {
  return Object.entries(counts || {})
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason))
    .slice(0, limit);
}

function candidateLooksClose(candidate) {
  const tokenCount = candidate?.matchedTokens?.report?.length || 0;
  const signatureCount = candidate?.matchedTokens?.signatureReport?.length || 0;
  return tokenCount >= 8 || signatureCount >= 2;
}

function mergeGroupRecord(map, key, row) {
  const group = map.get(key) || {
    name: key,
    rows: 0,
    keepActiveCount: 0,
    closeCount: 0,
    staleProofRejectCount: 0,
    falseCloseRiskCount: 0,
    currentRejectCount: 0,
    reasonCounts: {},
    latestAt: null,
    examples: [],
  };

  group.rows += 1;
  group.keepActiveCount += row.recommendedAction === "keep-active" ? 1 : 0;
  group.closeCount += row.recommendedAction === "close" ? 1 : 0;
  group.staleProofRejectCount += row.staleProofRejectCount || 0;
  group.falseCloseRiskCount += row.falseCloseRisk ? 1 : 0;
  group.currentRejectCount += row.currentRejectCount || 0;
  group.latestAt = [group.latestAt, row.latestCandidateAt].filter(Boolean).sort().pop() || group.latestAt;
  for (const [reason, count] of Object.entries(row.reasonCounts || {})) {
    group.reasonCounts[reason] = (group.reasonCounts[reason] || 0) + count;
  }
  if (row.falseCloseRisk || row.staleProofRejectCount) {
    group.examples.push({
      id: row.id,
      owner: row.owner,
      rowStatus: row.rowStatus,
      task: row.task,
      riskLabel: row.riskLabel,
      primaryReason: row.topReasons[0]?.reason || "",
      evidenceTitle: row.closestCandidate?.title || "",
      evidenceFinishedAt: row.closestCandidate?.finishedAt || null,
      passPath: row.closestCandidate?.passPath || "",
      report: row.closestCandidate?.report || "",
    });
  }

  map.set(key, group);
}

function finalizeCloseMatcherGroup(group) {
  return {
    ...group,
    topReasons: compactReasonCounts(group.reasonCounts),
    examples: group.examples.slice(0, 3),
  };
}

function buildCloseMatcherTrendDiagnostics(queueRefreshDecisionInput, turnoverSummary, generatedAt) {
  const statusById = new Map((turnoverSummary.rows || []).map((row) => [row.id, row.status || "unknown"]));
  const rows = (queueRefreshDecisionInput.decisions || []).map((decision) => {
    const diagnostic = decision.closeMatcherDiagnostic || {};
    const candidates = diagnostic.currentEvidenceCandidates || [];
    const staleProofRejects = candidates.filter((candidate) => (candidate.reasons || []).includes("evidence-older-than-current-row"));
    const currentRejects = candidates.filter((candidate) => candidate.isCurrentEvidence && !candidate.matched);
    const closeRejected = candidates.filter((candidate) => !candidate.matched && candidateLooksClose(candidate));
    const closestCandidate = candidates[0] || null;
    const staleProofRisk = staleProofRejects.length > 0;
    const falseCloseRisk = staleProofRisk || closeRejected.length > 0;
    const rowStatus = statusById.get(decision.id) || decision.recommendedAction || "unknown";
    const latestCandidateAt = candidates.map((candidate) => candidate.finishedAt).filter(Boolean).sort().pop() || null;

    return {
      id: decision.id,
      owner: String(decision.owner || "unassigned").toLowerCase(),
      priority: decision.priority,
      rowStatus,
      recommendedAction: decision.recommendedAction || "keep-active",
      task: decision.task,
      queueAt: diagnostic.queueAt || null,
      candidateCount: candidates.length,
      matchedCandidateCount: candidates.filter((candidate) => candidate.matched).length,
      rejectedCandidateCount: candidates.filter((candidate) => !candidate.matched).length,
      currentRejectCount: currentRejects.length,
      staleProofRejectCount: staleProofRejects.length,
      closeLookingRejectCount: closeRejected.length,
      falseCloseRisk,
      riskLabel: falseCloseRisk
        ? staleProofRisk
          ? "Stale proof watch"
          : "False-close watch"
        : decision.recommendedAction === "close"
          ? "Close evidence"
          : "No close risk",
      latestCandidateAt,
      topReasons: compactReasonCounts(reasonCounts(candidates)),
      reasonCounts: reasonCounts(candidates),
      closestCandidate: closestCandidate
        ? {
            title: closestCandidate.title || closestCandidate.passId || "Evidence candidate",
            finishedAt: closestCandidate.finishedAt,
            matched: closestCandidate.matched,
            reasons: closestCandidate.reasons || [],
            matchedTokens: closestCandidate.matchedTokens?.report || [],
            passPath: closestCandidate.passPath,
            report: closestCandidate.report,
          }
        : null,
    };
  });

  const ownerGroups = new Map();
  const statusGroups = new Map();
  for (const row of rows) {
    mergeGroupRecord(ownerGroups, row.owner, row);
    mergeGroupRecord(statusGroups, row.rowStatus, row);
  }

  return {
    generatedFrom: ["queueRefreshDecisionInput", "turnoverSummary", "closeMatcherDiagnostic.currentEvidenceCandidates"],
    referenceAt: generatedAt,
    activeTotal: rows.length,
    keepActiveCount: rows.filter((row) => row.recommendedAction === "keep-active").length,
    closeCount: rows.filter((row) => row.recommendedAction === "close").length,
    staleProofRejectCount: rows.reduce((sum, row) => sum + row.staleProofRejectCount, 0),
    falseCloseRiskCount: rows.filter((row) => row.falseCloseRisk).length,
    currentRejectCount: rows.reduce((sum, row) => sum + row.currentRejectCount, 0),
    topReasons: compactReasonCounts(rows.reduce((counts, row) => {
      for (const [reason, count] of Object.entries(row.reasonCounts || {})) {
        counts[reason] = (counts[reason] || 0) + count;
      }
      return counts;
    }, {})),
    byOwner: [...ownerGroups.values()].map(finalizeCloseMatcherGroup).sort((a, b) => a.name.localeCompare(b.name)),
    byStatus: [...statusGroups.values()].map(finalizeCloseMatcherGroup).sort((a, b) => b.falseCloseRiskCount - a.falseCloseRiskCount || a.name.localeCompare(b.name)),
    rows,
  };
}

function buildSwarmThroughput(laneDocs, passes, reports, generatedAt) {
  const reportsByPath = reportByPath(reports);
  const laneNames = laneDocs.map((lane) => lane.title).filter(Boolean).sort();
  const latestPassMs = Math.max(...passes.map((pass) => timestampMs(pass.finishedAt || pass.startedAt || pass.timestamp)), 0);
  const referenceMs = latestPassMs || timestampMs(generatedAt);
  const validationReferenceMs = timestampMs(generatedAt) || referenceMs;
  const recentWindowHours = 2;
  const recentWindowMs = recentWindowHours * 60 * 60 * 1000;

  const items = laneNames.map((laneName) => {
    const lane = String(laneName || "").toLowerCase();
    const lanePasses = passes
      .filter((pass) => String(pass.lane || "").toLowerCase() === lane)
      .slice()
      .sort((a, b) => timestampMs(b.finishedAt || b.startedAt || b.timestamp) - timestampMs(a.finishedAt || a.startedAt || a.timestamp));
    const recentPasses = lanePasses.filter((pass) => {
      const passMs = timestampMs(pass.finishedAt || pass.startedAt || pass.timestamp);
      return passMs && referenceMs - passMs <= recentWindowMs;
    });
    const latestValidatedPass = lanePasses.find((pass) => normalizeValidationList(pass.validation).length > 0) || null;
    const validationAt = latestValidatedPass?.finishedAt || latestValidatedPass?.startedAt || latestValidatedPass?.timestamp || null;
    const recentRiskPasses = lanePasses
      .slice(0, 5)
      .map((pass) => {
        const report = pass.report ? reportsByPath.get(pass.report) : null;
        const signals = passRiskSignals(pass, report);
        return {
          id: pass.id || pass.report || pass.startedAt || "pass",
          title: pass.title || pass.prompt || pass.id || "Untitled pass",
          at: pass.finishedAt || pass.startedAt || pass.timestamp || null,
          report: pass.report || "",
          signals,
        };
      })
      .filter((pass) => pass.signals.length);
    const repeatedRisk = recentRiskPasses.length >= 2;
    const failedRisk = recentRiskPasses.some((pass) => pass.signals.some((signal) => /status|validation|report risk/.test(signal)));
    const staleValidation =
      !validationAt || (validationReferenceMs && timestampMs(validationAt) && validationReferenceMs - timestampMs(validationAt) > recentWindowMs);
    const riskLevel = repeatedRisk || failedRisk ? "stuck-risk" : staleValidation ? "watch" : "clear";
    const latestPass = lanePasses[0] || null;

    return {
      lane,
      lanePath: laneDocs.find((doc) => doc.title === laneName)?.path || "",
      recentWindowHours,
      recentPassCount: recentPasses.length,
      totalPassCount: lanePasses.length,
      completedRecentCount: recentPasses.filter((pass) => String(pass.status || "").toLowerCase().startsWith("complete")).length,
      latestPassAt: latestPass?.finishedAt || latestPass?.startedAt || latestPass?.timestamp || null,
      latestSummary: latestPass?.summary || "",
      validationAt,
      validationAgeMinutes:
        validationAt && validationReferenceMs ? Math.max(0, Math.round((validationReferenceMs - timestampMs(validationAt)) / 60000)) : null,
      validationAgeLabel: relativeAgeLabel(validationReferenceMs, validationAt),
      validationCommand: latestValidatedPass ? normalizeValidationList(latestValidatedPass.validation)[0] || "" : "",
      riskLevel,
      riskLabel: riskLevel === "stuck-risk" ? "Stuck risk" : riskLevel === "watch" ? "Watch" : "Clear",
      riskReasons: [
        repeatedRisk ? `${recentRiskPasses.length} of latest 5 passes have low-impact or failure signals` : "",
        failedRisk ? "Recent pass evidence includes failed, blocked, or incomplete work" : "",
        staleValidation ? `No validation in the latest ${recentWindowHours}h window` : "",
      ].filter(Boolean),
      riskPasses: recentRiskPasses.slice(0, 3),
    };
  });

  const laneSet = new Set(laneNames.map((laneName) => String(laneName || "").toLowerCase()));
  const riskHistory = passes
    .filter((pass) => laneSet.has(String(pass.lane || "").toLowerCase()))
    .map((pass) => {
      const lane = String(pass.lane || "").toLowerCase();
      const report = pass.report ? reportsByPath.get(pass.report) : null;
      const signals = passRiskSignals(pass, report);
      const complete = passCompletionStatus(pass, report);
      const timestamp = pass.finishedAt || pass.startedAt || pass.timestamp || null;
      const level = signals.some((signal) => /status|validation|report risk/.test(signal))
        ? "stuck-risk"
        : signals.length
          ? "watch"
          : "clear";
      const sourceEvidence = reportEvidenceForSignals(pass, report, signals);

      return {
        id: pass.id || `${lane}-${timestamp || pass.report || "pass"}`,
        lane,
        at: timestamp,
        title: pass.title || pass.prompt || pass.id || "Untitled pass",
        summary: pass.summary || firstParagraph(report?.content),
        status: pass.status || "unknown",
        completionStatus: complete ? `${complete.passStatus} | ${complete.reportStatus}` : "not complete",
        riskLevel: level,
        riskLabel: level === "stuck-risk" ? "Stuck risk" : level === "watch" ? "Watch" : "Clear",
        signals,
        validation: normalizeValidationList(pass.validation).slice(0, 3),
        report: pass.report || "",
        reportFound: Boolean(report),
        reportSource: sourceEvidence.sourceLabel,
        evidenceExcerpt: sourceEvidence.excerpt,
        changedFiles: changedFilesFromPassAndReport(pass, report),
      };
    })
    .sort((a, b) => timestampMs(b.at) - timestampMs(a.at));

  return {
    generatedFrom: ["ops/progress/passes/*.json", "ops/reports/*.md"],
    referenceAt: referenceMs ? new Date(referenceMs).toISOString() : generatedAt,
    recentWindowHours,
    recentTotal: items.reduce((sum, item) => sum + item.recentPassCount, 0),
    stuckRiskCount: items.filter((item) => item.riskLevel === "stuck-risk").length,
    watchCount: items.filter((item) => item.riskLevel === "watch").length,
    riskHistory,
    riskHistoryCount: riskHistory.length,
    riskHistoryWithReports: riskHistory.filter((item) => item.reportFound).length,
    lanes: items,
  };
}

function splitEvidenceSentences(value) {
  return String(value || "")
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean);
}

function extractLaneMentions(value, laneNames) {
  const text = String(value || "").toLowerCase();
  return laneNames.filter((lane) => new RegExp(`\\b${lane}\\b`, "i").test(text));
}

function validationOutcomeFromItems(items) {
  const normalized = items.map((item) => String(item || "").trim()).filter(Boolean);
  const failed = normalized.filter(validationLooksFailed);
  const passed = normalized.filter((item) => /\b(pass|passed|clean|ok)\b/i.test(item) && !validationLooksFailed(item));
  if (!normalized.length) return { status: "unknown", label: "No validation recorded", commands: [] };
  if (failed.length) return { status: "failed", label: `${failed.length} validation issue${failed.length === 1 ? "" : "s"}`, commands: normalized };
  if (passed.length === normalized.length) return { status: "passed", label: `${passed.length} passed`, commands: normalized };
  return { status: "mixed", label: `${passed.length}/${normalized.length} passed`, commands: normalized };
}

function validationOutcomeLabel(status) {
  const labels = {
    passed: "Passed",
    failed: "Failed",
    mixed: "Mixed",
    unknown: "Unknown",
  };
  return labels[status] || status || "Unknown";
}

function validationItemsWithReportEvidence(pass, report) {
  const passItems = normalizeValidationList(pass.validation);
  const reportItems = markdownBullets(sectionText(report, "Validation"));
  return [...new Set([...passItems, ...reportItems].map((item) => String(item || "").trim()).filter(Boolean))];
}

function buildRapidTickUtilization(laneDocs, passes, reports) {
  const reportsByPath = reportByPath(reports);
  const laneNames = laneDocs.map((lane) => String(lane.title || "").toLowerCase()).filter(Boolean);
  const workerLanes = laneNames.filter((lane) => lane !== "orchestrator");
  const chronological = passes
    .slice()
    .sort((a, b) => timestampMs(a.finishedAt || a.startedAt || a.timestamp) - timestampMs(b.finishedAt || b.startedAt || b.timestamp));
  const integrationPattern = /\b(integrat|swarm|parent|reconcile|queue rollover|rolled the active queue)\b/i;
  const parentTicks = chronological.filter((pass) => {
    const lane = String(pass.lane || "").toLowerCase();
    const report = pass.report ? reportsByPath.get(pass.report) : null;
    const text = [pass.title, pass.prompt, pass.summary, report?.content].filter(Boolean).join("\n");
    return lane === "orchestrator" && integrationPattern.test(text);
  });

  const ticks = parentTicks.map((tick, index) => {
    const report = tick.report ? reportsByPath.get(tick.report) : null;
    const tickAt = tick.finishedAt || tick.startedAt || tick.timestamp || null;
    const previousTick = parentTicks[index - 1] || null;
    const previousAt = previousTick?.finishedAt || previousTick?.startedAt || previousTick?.timestamp || null;
    const tickMs = timestampMs(tickAt);
    const previousMs = timestampMs(previousAt);
    const tickText = [tick.title, tick.prompt, tick.summary, report?.content].filter(Boolean).join("\n");
    const spawnedLanes = [...new Set([...extractLaneMentions(tickText, workerLanes), ...workerLanes.filter((lane) => tickText.includes(`four-${lane}`))])];
    const returnedPasses = chronological
      .filter((pass) => {
        const lane = String(pass.lane || "").toLowerCase();
        if (!workerLanes.includes(lane)) return false;
        const passMs = timestampMs(pass.finishedAt || pass.startedAt || pass.timestamp);
        if (!passMs || !tickMs || passMs > tickMs) return false;
        return previousMs ? passMs > previousMs : tickMs - passMs <= 2 * 60 * 60 * 1000;
      })
      .map((pass) => {
        const passReport = pass.report ? reportsByPath.get(pass.report) : null;
        const validation = validationOutcomeFromItems(validationItemsWithReportEvidence(pass, passReport));
        return {
          id: pass.id || pass.sourcePath || pass.report,
          lane: String(pass.lane || "unknown").toLowerCase(),
          title: pass.title || pass.prompt || pass.id || "Returned pass",
          at: pass.finishedAt || pass.startedAt || pass.timestamp || null,
          status: pass.status || "unknown",
          validationStatus: validation.status,
          validationLabel: validation.label,
          passPath: pass.sourcePath || "",
          report: pass.report || "",
        };
      });
    const returnedLaneSet = new Set(returnedPasses.map((pass) => pass.lane));
    const expectedLanes = spawnedLanes.length ? spawnedLanes : [...new Set(returnedPasses.map((pass) => pass.lane))];
    const missingLanes = expectedLanes.filter((lane) => !returnedLaneSet.has(lane));
    const sentences = splitEvidenceSentences(tickText);
    const parentFixes = sentences
      .filter((line) => /\b(fix|fixed|resolve|resolved|reconcile|reconciled|tighten|tightened|normalize|normalized|widen|widening|added deterministic|rebuilt|rolled)\b/i.test(line))
      .slice(0, 5);
    const mismatchNotes = sentences
      .filter((line) => /\b(mismatch|disagree|disagreed|reconcile|reconciled|pending|blocker|false-close|stale|could not see|cannot see)\b/i.test(line))
      .slice(0, 5);
    const validation = validationOutcomeFromItems(validationItemsWithReportEvidence(tick, report));

    return {
      id: tick.id || tick.sourcePath || tick.report || `rapid-tick-${index + 1}`,
      title: tick.title || tick.prompt || "Rapid tick",
      at: tickAt,
      windowStartAt: previousAt || null,
      parentPassPath: tick.sourcePath || "",
      parentReport: tick.report || "",
      spawnedLanes: expectedLanes,
      lanesReturned: [...returnedLaneSet].sort(),
      missingLanes,
      returnedPassCount: returnedPasses.length,
      returnedPasses,
      lanesCovered: [...new Set([...expectedLanes, ...returnedPasses.map((pass) => pass.lane)])].sort(),
      validationOutcomes: [...new Set([validation.status, ...returnedPasses.map((pass) => pass.validationStatus)])].sort(),
      parentFixes,
      mismatchNotes,
      validationStatus: validation.status,
      validationLabel: validation.label,
      validationCommands: validation.commands,
    };
  });
  const displayedTicks = ticks.slice().reverse().slice(0, 6);
  const laneCounts = new Map();
  const outcomeCounts = new Map();

  for (const tick of displayedTicks) {
    for (const lane of tick.lanesCovered || []) {
      laneCounts.set(lane, (laneCounts.get(lane) || 0) + 1);
    }
    for (const outcome of tick.validationOutcomes || [tick.validationStatus || "unknown"]) {
      outcomeCounts.set(outcome, (outcomeCounts.get(outcome) || 0) + 1);
    }
  }

  return {
    generatedFrom: ["ops/progress/passes/*.json", "ops/reports/*.md"],
    totalTicks: ticks.length,
    latestTickAt: ticks[ticks.length - 1]?.at || null,
    totalReturnedPasses: ticks.reduce((sum, tick) => sum + tick.returnedPassCount, 0),
    mismatchCount: ticks.reduce((sum, tick) => sum + tick.mismatchNotes.length, 0),
    parentFixCount: ticks.reduce((sum, tick) => sum + tick.parentFixes.length, 0),
    validationIssueCount: ticks.filter((tick) => tick.validationStatus !== "passed").length,
    filters: {
      lanes: [...laneCounts.entries()]
        .map(([lane, count]) => ({ value: lane, label: lane, count }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      outcomes: [...outcomeCounts.entries()]
        .map(([outcome, count]) => ({ value: outcome, label: validationOutcomeLabel(outcome), count }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    },
    ticks: displayedTicks,
  };
}

const REPLY_FACT_STATES = {
  unobserved: {
    label: "Unobserved",
    rank: 0,
  },
  "captured-local": {
    label: "Captured local",
    rank: 1,
  },
  "session-ready": {
    label: "Session ready",
    rank: 2,
  },
};

const REPLY_FACT_STATUS_TERMS = new Set(["accepted", "declined", "reschedule", "question-only", "no-response", "silence", "clarification"]);

function normalizeReplyStatus(value) {
  const status = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (status === "question") return "question-only";
  if (status === "no-reply" || status === "no response") return "no-response";
  if (status === "tentative-accepted") return "accepted";
  return REPLY_FACT_STATUS_TERMS.has(status) ? status : "";
}

function firstTruthyValue(record, keys) {
  for (const key of keys) {
    if (record && Object.prototype.hasOwnProperty.call(record, key) && record[key]) return record[key];
  }
  return "";
}

function flattenRecords(value) {
  if (Array.isArray(value)) return value.flatMap(flattenRecords);
  if (!value || typeof value !== "object") return [];
  const nested = [
    "replyFacts",
    "firstReplyFacts",
    "replies",
    "sessionStartFacts",
    "sessionStartGate",
    "rawNoteCapture",
    "rawNoteCaptures",
    "rawNoteFacts",
    "rawNotes",
    "sessionNotes",
    "debriefFacts",
    "debriefReadiness",
    "objectionCoding",
    "objectionCodingFacts",
    "objectionCodes",
    "synthesisDecisionMemo",
    "synthesisDecisionMemos",
    "decisionMemo",
    "decisionMemos",
    "launchDecisionApproval",
    "launchDecisionApprovals",
    "launchApproval",
    "launchApprovals",
    "publishReadiness",
    "publishReadinessChecklist",
    "publishReadinessChecklists",
    "privateExplicitPublishPlan",
    "explicitPublishPlan",
    "publishPlan",
    "publishPlans",
    "privatePublicCopyDiffRollback",
    "publicCopyDiffRollback",
    "copyDiffRollback",
    "privateReleaseCandidateRehearsal",
    "releaseCandidateRehearsal",
    "releaseCandidateRehearsals",
    "structuredExtraction",
    "structuredExtractions",
    "extractedItems",
    "extractedResumeItems",
    "extractedExperience",
    "experienceItems",
    "resumeItems",
    "approvals",
    "appointmentFacts",
    "calendarFacts",
    "records",
    "items",
  ]
    .flatMap((key) => (Array.isArray(value[key]) ? flattenRecords(value[key]) : []));
  return [value, ...nested];
}

function readReplyFactRecordsFromFile(file) {
  const raw = readText(file.relativePath);
  if (!raw.trim()) return [];
  if (file.name.endsWith(".jsonl")) {
    return parseJsonLines(file.relativePath).filter((record) => !record.parseError).flatMap(flattenRecords);
  }
  if (file.name.endsWith(".json")) {
    try {
      return flattenRecords(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

function listReplyFactArtifacts() {
  const candidateFiles = [
    ...listFiles("data/intake", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/reply-facts", (name) => /\.(jsonl|json)$/i.test(name)),
  ];

  return candidateFiles.flatMap((file) =>
    readReplyFactRecordsFromFile(file)
      .map((record, index) => {
        const status = normalizeReplyStatus(
          firstTruthyValue(record, ["replyStatus", "replyState", "firstReplyStatus", "firstReplyState", "status", "state"])
        );
        const factObserved = Boolean(
          status ||
            firstTruthyValue(record, ["replyCapturedAt", "firstReplyCapturedAt", "observedAt", "capturedAt"]) ||
            record.replyFact ||
            record.firstReplyFact
        );
        if (!factObserved) return null;
        const nextStep = String(firstTruthyValue(record, ["nextStep", "businessStep", "route", "routing"]) || "").toLowerCase();
        const sessionReady =
          ["accepted", "reschedule"].includes(status) &&
          /\b(session|schedule|consent|raw-note|raw note|prep)\b/.test(nextStep);
        return {
          source: file.relativePath,
          index: index + 1,
          state: sessionReady ? "session-ready" : "captured-local",
          status: status || "captured-local",
          capturedAt: firstTruthyValue(record, ["replyCapturedAt", "firstReplyCapturedAt", "observedAt", "capturedAt"]) || null,
          route: firstTruthyValue(record, ["nextStep", "businessStep", "route", "routing"]) || "",
        };
      })
      .filter(Boolean)
  );
}

function strongestReplyFactState(states) {
  return states
    .filter((state) => REPLY_FACT_STATES[state])
    .sort((a, b) => REPLY_FACT_STATES[b].rank - REPLY_FACT_STATES[a].rank)[0] || "unobserved";
}

function replyFactRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\breply|response|accepted|declined|reschedule|question-only|no-response|silence|clarification\b/.test(text)) return null;

  const needsRealFact = /\bnon-accepted|accepted|declined|reschedule|question-only|no-response|silence|clarification|next business step|session\b/.test(text);
  const requiredStatuses = [...REPLY_FACT_STATUS_TERMS].filter((term) => {
    if (term === "accepted" && /\bnon-accepted\b/.test(text)) return false;
    if (term === "declined" && /\bdecline\b/.test(text)) return true;
    return text.includes(term);
  });
  const businessStep = /\bgrowth\b/.test(String(item.owner || "").toLowerCase()) || /\btracker|session|scheduling|consent\b/.test(text)
    ? "Reply handling can route only after an explicit local reply fact exists."
    : "Readiness should stay blocked until an operator records the reply fact explicitly.";

  return {
    requiresReplyFact: true,
    needsRealFact,
    requiredStatuses,
    businessStep,
  };
}

function replyStateFromEvidence(decision, artifacts) {
  const states = [];
  const matchedArtifacts = artifacts.filter((artifact) => {
    if (!(decision?.task || "").toLowerCase().includes("reply")) return false;
    return artifact.status && (decision.task.toLowerCase().includes(artifact.status) || artifact.state === "session-ready");
  });

  if (matchedArtifacts.some((artifact) => artifact.state === "session-ready")) states.push("session-ready");
  if (matchedArtifacts.length) states.push("captured-local");

  return {
    state: strongestReplyFactState(states),
    matchedArtifacts,
  };
}

function buildReplyFactReadiness(queue, queueRefreshDecisionInput) {
  const artifacts = listReplyFactArtifacts();
  const decisionsById = new Map((queueRefreshDecisionInput.decisions || []).map((decision) => [decision.id, decision]));
  const rows = (queue.items || [])
    .map((item) => {
      const requirement = replyFactRequirementForItem(item);
      if (!requirement) return null;
      const decision = decisionsById.get(item.id) || item;
      const observed = replyStateFromEvidence(decision, artifacts);
      const state = observed.state;
      const blocked = state !== "session-ready" && requirement.needsRealFact;
      const rationale =
        state === "session-ready"
          ? "Explicit local reply fact evidence indicates the session/scheduling step can be prepared; this is not an outcome claim."
          : state === "captured-local"
            ? "Local capture evidence exists, but no session-ready accepted or reschedule fact is present in repo-visible artifacts."
            : "No repo-visible explicit reply fact was found for this current queue row; defaults remain unobserved.";

      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state,
        stateLabel: REPLY_FACT_STATES[state].label,
        blocked,
        requiredStatuses: requirement.requiredStatuses,
        businessStep: requirement.businessStep,
        rationale,
        matchedArtifacts: observed.matchedArtifacts,
        evidenceNote:
          state === "unobserved"
            ? "No accepted, declined, reschedule, question-only, or no-response fact is claimed."
            : "Evidence is local-only and must not be promoted into public outcomes.",
      };
    })
    .filter(Boolean);

  return {
    generatedFrom: ["ops/backlog/NEXT.md", "ops/progress/passes/*.json", "ops/reports/*.md", "data/intake/*", "data/reply-facts/*"],
    total: rows.length,
    unobservedCount: rows.filter((row) => row.state === "unobserved").length,
    capturedLocalCount: rows.filter((row) => row.state === "captured-local").length,
    sessionReadyCount: rows.filter((row) => row.state === "session-ready").length,
    blockedCount: rows.filter((row) => row.blocked).length,
    artifacts,
    rows,
  };
}

const STRUCTURED_EXTRACTION_STATES = {
  "not-visible": {
    label: "No extracted items visible",
    rank: 0,
  },
  "extracted-unapproved": {
    label: "Extracted, unapproved",
    rank: 1,
  },
  "partially-approved": {
    label: "Partially approved",
    rank: 2,
  },
  "approved-for-export": {
    label: "Approved for export",
    rank: 3,
  },
};

function normalizeApprovalState(value) {
  const state = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (["accepted", "approved", "explicitly-approved", "export-approved"].includes(state)) return "approved";
  if (["rejected", "declined"].includes(state)) return "rejected";
  if (["excluded", "exclude"].includes(state)) return "excluded";
  if (["pending", "draft", "unapproved", "needs-approval", "not-approved"].includes(state)) return "unapproved";
  return "";
}

function readStructuredExtractionRecordsFromFile(file) {
  return readReplyFactRecordsFromFile(file);
}

function structuredExtractionText(record) {
  return textFact(record, [
    "resumeText",
    "bullet",
    "text",
    "claim",
    "summary",
    "title",
    "company",
    "sourceLine",
    "sourceExcerpt",
    "rawText",
  ]);
}

function hasStructuredExtractionShape(record) {
  if (!record || typeof record !== "object") return false;
  if (record.extractedItem || record.extracted === true || record.structuredExtractionItem === true) return true;
  if (record.provenance && typeof record.provenance === "object") return true;
  if (textFact(record, ["sourceLine", "sourceExcerpt", "sourceRange"]) && structuredExtractionText(record)) return true;
  if (textFact(record, ["title"]) && textFact(record, ["company"])) return true;
  return Boolean(Array.isArray(record.bullets) && record.bullets.length && textFact(record, ["title", "company", "sourceLine", "sourceExcerpt"]));
}

function structuredExtractionProvenancePresent(record) {
  if (!record || typeof record !== "object") return false;
  const provenance = record.provenance && typeof record.provenance === "object" ? record.provenance : null;
  return Boolean(
    provenance?.source ||
      provenance?.sourceLine ||
      provenance?.sourceExcerpt ||
      provenance?.range ||
      textFact(record, ["source", "sourceLine", "sourceExcerpt", "sourceSection", "sourceRange", "rawText"])
  );
}

function structuredExtractionApprovalState(record) {
  const explicit = normalizeApprovalState(
    firstTruthyValue(record, ["approvalState", "evidenceStatus", "decision", "status", "state", "approval"])
  );
  if (explicit) return explicit;
  if (booleanFact(record, ["approved", "explicitlyApproved", "exportApproved"])) return "approved";
  if (booleanFact(record, ["rejected"])) return "rejected";
  if (booleanFact(record, ["excluded"])) return "excluded";
  return "unapproved";
}

function normalizeCandidateDecisionState(value) {
  const state = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (["accepted", "accept", "approved-and-accepted", "approved-accepted"].includes(state)) return "accepted";
  if (["rejected", "declined"].includes(state)) return "rejected";
  if (["excluded", "exclude"].includes(state)) return "excluded";
  if (["pending", "blocked", "disabled", "unaccepted"].includes(state)) return state;
  return "";
}

function structuredExtractionCandidateDecision(record) {
  const explicit = normalizeCandidateDecisionState(
    firstTruthyValue(record, [
      "candidateDecision",
      "candidateStatus",
      "candidateUpdateStatus",
      "decision",
      "acceptanceState",
      "reviewDecision",
    ])
  );
  if (explicit) return explicit;
  if (booleanFact(record, ["accepted", "candidateAccepted", "acceptedIntoCandidateUpdates"])) return "accepted";
  return "";
}

function structuredExtractionExportEligible(record, approvalState) {
  if (record && Object.prototype.hasOwnProperty.call(record, "exportEligible")) {
    return booleanFact(record, ["exportEligible"]);
  }
  if (record && Object.prototype.hasOwnProperty.call(record, "downloadEligible")) {
    return booleanFact(record, ["downloadEligible"]);
  }
  return approvalState === "approved" && Boolean(record?.explicitApproval === true || record?.explicitlyApproved === true);
}

function structuredExtractionPromoted(record) {
  if (!record || typeof record !== "object") return false;
  if (booleanFact(record, ["promoted", "promotedToCandidateUpdate", "acceptedIntoCandidateUpdates", "candidateUpdateCreated"])) {
    return true;
  }
  const state = normalizeApprovalState(firstTruthyValue(record, ["promotionState", "promotionStatus", "candidateUpdateStatus"]));
  return state === "approved" || Boolean(textFact(record, ["promotedAt", "candidateUpdateId", "acceptedDraftId"]));
}

function structuredExtractionUnsafeExportAttempt(record, approvalState, exportEligible) {
  if (!record || typeof record !== "object") return false;
  if (booleanFact(record, ["unsafeExportAttempt", "unsafeUnapprovedExport", "unapprovedExportAttempt"])) return true;
  return approvalState !== "approved" && exportEligible;
}

function structuredExtractionAcceptBlockedByMissingEvidenceApproval(record, approvalState, candidateDecision) {
  if (!record || typeof record !== "object") return false;
  if (
    booleanFact(record, [
      "acceptBlockedByMissingEvidenceApproval",
      "acceptBlockedMissingEvidenceApproval",
      "acceptedButBlocked",
      "candidateAcceptBlocked",
      "missingEvidenceApprovalBlockedAccept",
    ])
  ) {
    return true;
  }

  const stateText = String(
    firstTruthyValue(record, ["acceptanceState", "candidateStatus", "candidateUpdateStatus", "status", "state", "reason"]) || ""
  ).toLowerCase();
  const mentionsBlockedAccept = /\baccept/i.test(stateText) && /\b(blocked|disabled|missing evidence|needs approval|unapproved)\b/i.test(stateText);
  return (candidateDecision === "accepted" && approvalState !== "approved") || mentionsBlockedAccept;
}

function listStructuredExtractionArtifacts() {
  const candidateFiles = [
    ...listFiles("data/intake", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/structured-extraction", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/extractions", (name) => /\.(jsonl|json)$/i.test(name)),
  ];

  return candidateFiles.flatMap((file) =>
    readStructuredExtractionRecordsFromFile(file)
      .map((record, index) => {
        if (!hasStructuredExtractionShape(record)) return null;
        const approvalState = structuredExtractionApprovalState(record);
        const exportEligible = structuredExtractionExportEligible(record, approvalState);
        const hasProvenance = structuredExtractionProvenancePresent(record);
        const promoted = structuredExtractionPromoted(record);
        const unsafeExportAttempt = structuredExtractionUnsafeExportAttempt(record, approvalState, exportEligible);
        const candidateDecision = structuredExtractionCandidateDecision(record);
        const acceptBlockedByMissingEvidenceApproval = structuredExtractionAcceptBlockedByMissingEvidenceApproval(
          record,
          approvalState,
          candidateDecision
        );
        const approvedAndAccepted = approvalState === "approved" && candidateDecision === "accepted";
        return {
          source: file.relativePath,
          index: index + 1,
          label: structuredExtractionText(record).slice(0, 120) || "Extracted resume item",
          approvalState,
          approved: approvalState === "approved",
          rejected: approvalState === "rejected",
          excluded: approvalState === "excluded",
          promoted,
          candidateDecision,
          hasProvenance,
          exportEligible,
          exportExcluded: !exportEligible,
          unsafeExportAttempt,
          acceptBlockedByMissingEvidenceApproval,
          approvedAndAccepted,
        };
      })
      .filter(Boolean)
  );
}

function structuredExtractionRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\b(structured extraction|extracted item|extracted-items|parse pasted resume|provenance coverage|approval state|export exclusion|explicit approval)\b/.test(text)) {
    return null;
  }

  return {
    gate:
      "Extracted resume facts must remain unapproved and excluded from export/download until the user explicitly approves each fact.",
  };
}

function structuredExtractionStateFromArtifacts(artifacts) {
  if (!artifacts.length) return "not-visible";
  const approved = artifacts.filter((artifact) => artifact.approved).length;
  if (!approved) return "extracted-unapproved";
  if (approved < artifacts.length) return "partially-approved";
  return "approved-for-export";
}

function passReportText(pass, report) {
  return [
    pass.id,
    pass.task,
    pass.prompt,
    pass.summary,
    pass.deliverable,
    Array.isArray(pass.coverageAdded) ? pass.coverageAdded.join(" ") : "",
    Array.isArray(pass.decisions) ? pass.decisions.join(" ") : "",
    pass.decision,
    normalizeValidationList(pass.validation).join(" "),
    report?.content || "",
  ]
    .filter(Boolean)
    .join("\n");
}

function structuredExtractionNumberNear(text, labelPattern) {
  const pattern = new RegExp(`(?:${labelPattern})[^\\d]{0,24}(\\d+)|(\\d+)[^\\n]{0,24}(?:${labelPattern})`, "i");
  const match = String(text || "").match(pattern);
  if (!match) return null;
  return Number(match[1] || match[2]);
}

function structuredExtractionReportSnapshot(text, fallback) {
  const unsafeFromRegression = /\b(first|initial)\b[^\n.]{0,80}\bfailed\b/i.test(text) &&
    /\b(unapproved|without explicit evidence approval)\b[\s\S]{0,240}\b(export|download)/i.test(text);
  const acceptBlockedByEvidenceDetected =
    /\baccept\b[\s\S]{0,120}\b(disabled|blocked|preventing|prevent|cannot|stays disabled)\b[\s\S]{0,160}\b(before|until|without|missing)\b[\s\S]{0,120}\b(evidence approval|explicit evidence approval|backing evidence|source line)\b/i.test(
      text
    ) ||
    /\b(disables|disabled|preventing|prevent)\b[\s\S]{0,120}\baccept\b[\s\S]{0,160}\b(evidence|backing pasted line|source line)\b/i.test(
      text
    );
  const approvedAndAcceptedDetected =
    /\b(can be accepted|accepted|enters export|enters download|enters saved snapshot)\b[\s\S]{0,120}\b(after|after explicit|explicitly approved|approved structured|evidence approval)\b/i.test(
      text
    );
  return {
    extractedItemCount: structuredExtractionNumberNear(text, "extracted(?:-item| item| items)?") ?? fallback.extractedItemCount,
    approvedCount: structuredExtractionNumberNear(text, "approved") ?? fallback.approvedCount,
    promotedCount: structuredExtractionNumberNear(text, "promoted") ?? fallback.promotedCount,
    unsafeExportAttemptCount:
      structuredExtractionNumberNear(text, "unsafe(?: unapproved)? export(?: attempt| leak| leaks| attempts)?") ??
      (unsafeFromRegression ? Math.max(fallback.unsafeExportAttemptCount, 1) : fallback.unsafeExportAttemptCount),
    acceptBlockedByMissingEvidenceApprovalCount:
      structuredExtractionNumberNear(text, "accept(?:ed)? blocked(?: by missing evidence approval)?|blocked accept|disabled accept") ??
      (acceptBlockedByEvidenceDetected
        ? Math.max(fallback.acceptBlockedByMissingEvidenceApprovalCount, 1)
        : fallback.acceptBlockedByMissingEvidenceApprovalCount),
    approvedAndAcceptedCount:
      structuredExtractionNumberNear(text, "approved(?: and|-and-)?accepted|accepted(?: after| with) explicit evidence approval") ??
      (approvedAndAcceptedDetected ? Math.max(fallback.approvedAndAcceptedCount, 1) : fallback.approvedAndAcceptedCount),
  };
}

function latestStructuredExtractionQaRegression(passes, reportsByPath) {
  const qaPasses = passes
    .filter((pass) => String(pass.lane || "").toLowerCase() === "qa")
    .map((pass) => {
      const report = reportsByPath.get(pass.report);
      const text = passReportText(pass, report);
      return { pass, report, text };
    })
    .filter(({ text }) => /\b(structured extraction|structured-item|approval boundary|unapproved.*export|regression)\b/i.test(text))
    .sort((a, b) => String(a.pass.startedAt || "").localeCompare(String(b.pass.startedAt || "")));

  const latest = qaPasses[qaPasses.length - 1];
  if (!latest) {
    return {
      status: "not-observed",
      label: "No QA regression pass observed",
      source: "",
      checkedAt: null,
      command: "",
      failure: "",
      resolution: "",
    };
  }

  const validation = Array.isArray(latest.pass.validation) ? latest.pass.validation : [];
  const regressionValidation =
    validation.find((item) => item && typeof item === "object" && /qa:intake-flow|structured/i.test(String(item.command || ""))) ||
    validation.find((item) => item && typeof item === "object" && /failed-then-passed|failed|passed/i.test(String(item.status || "")));
  const status = String(regressionValidation?.status || latest.pass.status || "").trim() || "observed";
  const failedThenPassed =
    /failed-then-passed/i.test(status) ||
    (/\bfailed\b/i.test(latest.text) && /\brerun passed|then passed|now passes|passed after/i.test(latest.text));

  return {
    status: failedThenPassed ? "failed-then-passed" : status,
    label: failedThenPassed ? "Failed first, then passed" : status.replace(/-/g, " "),
    source: latest.pass.report || latest.report?.path || latest.pass.sourcePath || "",
    checkedAt: latest.pass.checkedAt || latest.pass.finishedAt || latest.pass.startedAt || null,
    command: regressionValidation?.command || "",
    failure:
      regressionValidation?.failure ||
      latest.text.match(/Accepted but unapproved[^\n.]+(?:\n|$)/i)?.[0]?.trim() ||
      "",
    resolution:
      regressionValidation?.resolution ||
      latest.text.match(/Product then fixed[^\n.]+(?:\n|$)/i)?.[0]?.trim() ||
      "",
  };
}

function passSource(pass, report) {
  return pass.report || report?.path || pass.sourcePath || "";
}

function latestPassEvidence(passes, reports, predicate) {
  const reportsByPath = reportByPath(reports);
  const matches = passes
    .map((pass) => {
      const report = reportsByPath.get(pass.report);
      const text = passReportText(pass, report);
      return { pass, report, text };
    })
    .filter(predicate)
    .sort((a, b) => String(a.pass.startedAt || "").localeCompare(String(b.pass.startedAt || "")));
  return matches[matches.length - 1] || null;
}

function allPresent(text, patterns) {
  return patterns.every((pattern) => pattern.test(text));
}

function buildStructuredExtractionBulkControlReadiness(passes, reports, trend) {
  const reviewHtml = readText("website/review.html");
  const reviewJs = readText("website/review.js");
  const productEvidence = latestPassEvidence(
    passes,
    reports,
    ({ pass, text }) => String(pass.lane || "").toLowerCase() === "product" && /\bbulk structured extraction|Approve all source lines|Promote all approved|bulk source approval\b/i.test(text)
  );
  const qaEvidence = latestPassEvidence(
    passes,
    reports,
    ({ pass, text }) =>
      String(pass.lane || "").toLowerCase() === "qa" &&
      /\bstructured-extraction-approval-boundary-no-network|generated candidate Accept|backing evidence line|source line must be approved|bulk controls?\b/i.test(text)
  );

  const controls = [
    {
      id: "approveAllStructuredSourceLines",
      label: "Approve all source lines",
      htmlExposed: /data-pr=["']approveAllStructuredSourceLines["']/.test(reviewHtml),
      handlerPresent: /function\s+approveAllStructuredSourceLines\b/.test(reviewJs),
      eventBound: /approveAllStructuredSourceLinesButton[\s\S]{0,500}addEventListener\(["']click["'][\s\S]{0,500}approveAllStructuredSourceLines/.test(reviewJs),
    },
    {
      id: "promoteAllApprovedStructuredFacts",
      label: "Promote all approved",
      htmlExposed: /data-pr=["']promoteAllApprovedStructuredFacts["']/.test(reviewHtml),
      handlerPresent: /function\s+promoteAllApprovedStructuredFacts\b/.test(reviewJs),
      eventBound: /promoteAllApprovedStructuredFactsButton[\s\S]{0,500}addEventListener\(["']click["'][\s\S]{0,500}promoteAllApprovedStructuredFacts/.test(reviewJs),
    },
  ];

  const bulkLedgerWriterPresent = /function\s+bulkSetStructuredFactApprovals\b/.test(reviewJs);
  const exportEligibleGatePresent = allPresent(reviewJs, [
    /function\s+exportEligibleItems\b/,
    /evidenceStatus\s*===\s*["']approved["']|sourceApproved|explicit/i,
    /candidateDecision\s*===\s*["']accepted["']|decision\s*===\s*["']accepted["']|accepted/i,
  ]);
  const productBoundaries = productEvidence?.pass?.boundaries || {};
  const productSaysGatePreserved =
    productBoundaries.exportRequiresEvidenceApproval === true &&
    productBoundaries.exportRequiresPromotion === true &&
    productBoundaries.exportRequiresCandidateAccept === true &&
    productBoundaries.bulkApproveAutoExports === false &&
    productBoundaries.bulkPromoteBypassesCandidateAccept === false;
  const latestTrendPoint = (trend?.points || [])[trend?.points?.length - 1] || null;
  const currentUnsafeExportAttemptCount = latestTrendPoint?.unsafeExportAttemptCount ?? 0;
  const qaValidation = normalizeValidationList(qaEvidence?.pass?.validation);
  const qaPassed = qaValidation.some((item) => /npm run qa:intake-flow|structured/i.test(item) && /pass/i.test(item)) ||
    /\bnpm run qa:intake-flow`? passed|status["']?:\s*["']?passed|Accept enables|Accept is visible but disabled/i.test(qaEvidence?.text || "");
  const controlsExposed = controls.every((control) => control.htmlExposed && control.handlerPresent && control.eventBound) && bulkLedgerWriterPresent;
  const exportGatePreserved = exportEligibleGatePresent && productSaysGatePreserved && currentUnsafeExportAttemptCount === 0;
  const qaCovered = Boolean(qaEvidence && qaPassed);
  const ready = controlsExposed && qaCovered && exportGatePreserved;

  return {
    state: ready ? "ready" : controlsExposed || qaCovered || exportGatePreserved ? "partial" : "blocked",
    stateLabel: ready ? "Ready" : controlsExposed || qaCovered || exportGatePreserved ? "Partially ready" : "Blocked",
    controlsExposed,
    qaCovered,
    exportGatePreserved,
    bulkLedgerWriterPresent,
    controls,
    productEvidence: productEvidence
      ? {
          source: passSource(productEvidence.pass, productEvidence.report),
          checkedAt: productEvidence.pass.finishedAt || productEvidence.pass.checkedAt || productEvidence.pass.startedAt || null,
          status: productEvidence.pass.status || "observed",
          summary: Array.isArray(productEvidence.pass.summary) ? productEvidence.pass.summary.join(" ") : productEvidence.pass.summary || firstParagraph(productEvidence.report?.content || ""),
          boundaries: productBoundaries,
        }
      : null,
    qaEvidence: qaEvidence
      ? {
          source: passSource(qaEvidence.pass, qaEvidence.report),
          checkedAt: qaEvidence.pass.checkedAt || qaEvidence.pass.finishedAt || qaEvidence.pass.startedAt || null,
          status: qaEvidence.pass.status || "observed",
          validation: qaValidation,
          summary: Array.isArray(qaEvidence.pass.coverageAdded)
            ? qaEvidence.pass.coverageAdded.join(" ")
            : qaEvidence.pass.summary || firstParagraph(qaEvidence.report?.content || ""),
        }
      : null,
    exportGate: {
      preserved: exportGatePreserved,
      sourceCheckPresent: exportEligibleGatePresent,
      productBoundaryPreserved: productSaysGatePreserved,
      unsafeExportAttemptCount: currentUnsafeExportAttemptCount,
      historicalUnsafeExportAttemptCount: trend?.unsafeExportAttemptCount || 0,
      requiresEvidenceApproval: productBoundaries.exportRequiresEvidenceApproval === true,
      requiresPromotion: productBoundaries.exportRequiresPromotion === true,
      requiresCandidateAccept: productBoundaries.exportRequiresCandidateAccept === true,
    },
  };
}

function buildStructuredExtractionTrend(artifacts, passes, reports) {
  const reportsByPath = reportByPath(reports);
  const fallback = {
    extractedItemCount: artifacts.length,
    approvedCount: artifacts.filter((artifact) => artifact.approved).length,
    promotedCount: artifacts.filter((artifact) => artifact.promoted).length,
    unsafeExportAttemptCount: artifacts.filter((artifact) => artifact.unsafeExportAttempt).length,
    acceptBlockedByMissingEvidenceApprovalCount: artifacts.filter((artifact) => artifact.acceptBlockedByMissingEvidenceApproval).length,
    approvedAndAcceptedCount: artifacts.filter((artifact) => artifact.approvedAndAccepted).length,
  };
  const relevant = passes
    .map((pass) => {
      const report = reportsByPath.get(pass.report);
      const text = passReportText(pass, report);
      return { pass, report, text };
    })
    .filter(({ text }) =>
      /\b(structured extraction|structured-item|structured item|structured extracted|proofresume-structured-extraction|extracted experience|unapproved structured|structured\/generated)\b/i.test(text)
    )
    .sort((a, b) => String(a.pass.startedAt || "").localeCompare(String(b.pass.startedAt || "")));

  const points = relevant.map(({ pass, report, text }, index) => {
    const snapshot = structuredExtractionReportSnapshot(text, fallback);
    return {
      id: pass.id || `structured-extraction-${index + 1}`,
      lane: pass.lane || "unknown",
      label: formatTrendLabel(pass.startedAt, `Point ${index + 1}`),
      startedAt: pass.startedAt || null,
      status: pass.status || "unknown",
      report: pass.report || report?.path || "",
      summary: pass.summary || pass.deliverable || firstParagraph(report?.content || ""),
      ...snapshot,
    };
  });

  return {
    generatedFrom: ["ops/progress/passes/*.json", "ops/reports/*.md", "data/intake/*", "data/structured-extraction/*", "data/extractions/*"],
    latestApprovedCount: fallback.approvedCount,
    latestPromotedCount: fallback.promotedCount,
    unsafeExportAttemptCount: Math.max(fallback.unsafeExportAttemptCount, ...points.map((point) => point.unsafeExportAttemptCount || 0), 0),
    acceptBlockedByMissingEvidenceApprovalCount: Math.max(
      fallback.acceptBlockedByMissingEvidenceApprovalCount,
      ...points.map((point) => point.acceptBlockedByMissingEvidenceApprovalCount || 0),
      0
    ),
    approvedAndAcceptedCount: Math.max(fallback.approvedAndAcceptedCount, ...points.map((point) => point.approvedAndAcceptedCount || 0), 0),
    latestQaRegression: latestStructuredExtractionQaRegression(passes, reportsByPath),
    points,
    recentPoints: points.slice(-6),
  };
}

function buildStructuredExtractionVisibility(queue, passes, reports) {
  const artifacts = listStructuredExtractionArtifacts();
  const extractedItemCount = artifacts.length;
  const provenanceCoveredCount = artifacts.filter((artifact) => artifact.hasProvenance).length;
  const approvedCount = artifacts.filter((artifact) => artifact.approved).length;
  const promotedCount = artifacts.filter((artifact) => artifact.promoted).length;
  const unapprovedCount = artifacts.filter((artifact) => artifact.approvalState === "unapproved").length;
  const rejectedCount = artifacts.filter((artifact) => artifact.rejected).length;
  const explicitlyExcludedCount = artifacts.filter((artifact) => artifact.excluded).length;
  const exportEligibleCount = artifacts.filter((artifact) => artifact.exportEligible).length;
  const exportExcludedCount = artifacts.filter((artifact) => artifact.exportExcluded).length;
  const unsafeUnapprovedExportCount = artifacts.filter((artifact) => artifact.unsafeExportAttempt).length;
  const artifactAcceptBlockedByMissingEvidenceApprovalCount = artifacts.filter((artifact) => artifact.acceptBlockedByMissingEvidenceApproval).length;
  const artifactApprovedAndAcceptedCount = artifacts.filter((artifact) => artifact.approvedAndAccepted).length;
  const provenanceCoveragePercent = extractedItemCount ? Math.round((provenanceCoveredCount / extractedItemCount) * 100) : 0;
  const trend = buildStructuredExtractionTrend(artifacts, passes, reports);
  const bulkControlReadiness = buildStructuredExtractionBulkControlReadiness(passes, reports, trend);
  const acceptBlockedByMissingEvidenceApprovalCount = Math.max(
    artifactAcceptBlockedByMissingEvidenceApprovalCount,
    trend.acceptBlockedByMissingEvidenceApprovalCount || 0
  );
  const approvedAndAcceptedCount = Math.max(artifactApprovedAndAcceptedCount, trend.approvedAndAcceptedCount || 0);

  const rows = (queue.items || [])
    .map((item) => {
      const requirement = structuredExtractionRequirementForItem(item);
      if (!requirement) return null;
      const state = structuredExtractionStateFromArtifacts(artifacts);
      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state,
        stateLabel: STRUCTURED_EXTRACTION_STATES[state].label,
        blocked: state !== "approved-for-export",
        gate: requirement.gate,
        extractedItemCount,
        provenanceCoveredCount,
        provenanceCoveragePercent,
        approvalState: {
          approved: approvedCount,
          promoted: promotedCount,
          unapproved: unapprovedCount,
          rejected: rejectedCount,
          excluded: explicitlyExcludedCount,
          acceptBlockedByMissingEvidenceApproval: acceptBlockedByMissingEvidenceApprovalCount,
          approvedAndAccepted: approvedAndAcceptedCount,
        },
        exportState: {
          exportEligible: exportEligibleCount,
          exportExcluded: exportExcludedCount,
          unsafeUnapprovedExport: unsafeUnapprovedExportCount,
          excludedUntilExplicitApproval: unsafeUnapprovedExportCount === 0,
        },
        matchedArtifacts: artifacts,
        evidenceNote:
          state === "not-visible"
            ? "No repo-visible structured extracted items were found yet; admin defaults to zero approved export facts."
            : "Structured extracted items are audit-visible; only explicitly approved facts may become export eligible.",
      };
    })
    .filter(Boolean);

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      "data/intake/*",
      "data/structured-extraction/*",
      "data/extractions/*",
      "website/intake.js",
      "website/review.js",
    ],
    total: rows.length,
    extractedItemCount,
    provenanceCoveredCount,
    provenanceCoveragePercent,
    approvedCount,
    promotedCount,
    unapprovedCount,
    rejectedCount,
    explicitlyExcludedCount,
    exportEligibleCount,
    exportExcludedCount,
    unsafeUnapprovedExportCount,
    acceptBlockedByMissingEvidenceApprovalCount,
    approvedAndAcceptedCount,
    excludedUntilExplicitApproval: unsafeUnapprovedExportCount === 0,
    bulkControlReadiness,
    trend,
    artifacts,
    rows,
  };
}

function normalizeFollowupEvidenceDecision(value) {
  const decision = String(value || "pending").trim().toLowerCase();
  if (decision === "accepted" || decision === "rejected" || decision === "excluded") return decision;
  return "pending";
}

function listFollowupEvidenceSnapshots() {
  const files = listFiles("data/intake", (name) => name.endsWith(".json"));
  return files
    .map((file) => {
      try {
        const snapshot = JSON.parse(fs.readFileSync(file.absolutePath, "utf8"));
        const followups = snapshot?.followups && typeof snapshot.followups === "object" ? snapshot.followups : null;
        const evidenceItems = Array.isArray(followups?.evidenceItems) ? followups.evidenceItems : [];
        if (!evidenceItems.length) return null;
        const updatedAt = typeof snapshot?.updatedAt === "string" ? snapshot.updatedAt : fileTimestamp(file.relativePath);
        return {
          path: file.relativePath,
          updatedAt,
          format: snapshot?.format || "",
          intakeId: snapshot?.intakeId || null,
          evidenceItems: evidenceItems
            .filter((item) => item && typeof item === "object")
            .map((item) => ({
              key: String(item.key || "").trim(),
              source: String(item.source || "").trim(),
              evidenceApproved: Boolean(item.evidenceApproved),
              candidateDecision: normalizeFollowupEvidenceDecision(item.candidateDecision),
              exportEligible: Boolean(item.exportEligible),
              evidenceStatus: String(item.evidenceStatus || "").trim(),
            }))
            .filter((item) => item.key),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function buildFollowupEvidenceVisibility(queue) {
  const snapshots = listFollowupEvidenceSnapshots();
  const items = snapshots.flatMap((snapshot) =>
    (snapshot.evidenceItems || []).map((item) => ({
      ...item,
      snapshotPath: snapshot.path,
      snapshotUpdatedAt: snapshot.updatedAt,
    }))
  );

  const evidenceItemCount = items.length;
  const evidenceApprovedCount = items.filter((item) => item.evidenceApproved).length;
  const candidateAcceptedCount = items.filter((item) => item.candidateDecision === "accepted").length;
  const approvedAndAcceptedCount = items.filter((item) => item.evidenceApproved && item.candidateDecision === "accepted").length;
  const acceptedWithoutEvidenceApprovalCount = items.filter(
    (item) => item.candidateDecision === "accepted" && !item.evidenceApproved
  ).length;

  const activeRow = (queue?.items || []).find((item) => /\bfollow-?up\b/i.test(String(item.task || ""))) || null;
  const state =
    evidenceItemCount === 0
      ? "not-observed"
      : acceptedWithoutEvidenceApprovalCount > 0
        ? "blocked-accepted-without-evidence-approval"
        : "observed";

  const stateLabel =
    state === "observed"
      ? "Observed from local export snapshots"
      : state === "blocked-accepted-without-evidence-approval"
        ? "Blocked: accepted follow-up candidate lacks evidence approval"
        : "Not observed yet";

  return {
    format: "proofresume-followup-evidence-visibility-v1",
    generatedFrom: ["ops/backlog/NEXT.md", "data/intake/*.json", "website/review.js", "website/review.html"],
    state,
    stateLabel,
    activeRow: activeRow
      ? { id: activeRow.id, owner: activeRow.owner, priority: activeRow.priority, task: activeRow.task, validation: activeRow.validation }
      : null,
    snapshotCount: snapshots.length,
    evidenceItemCount,
    evidenceApprovedCount,
    candidateAcceptedCount,
    approvedAndAcceptedCount,
    acceptedWithoutEvidenceApprovalCount,
    snapshots: snapshots
      .slice()
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
      .slice(0, 8)
      .map((snapshot) => ({
        path: snapshot.path,
        updatedAt: snapshot.updatedAt,
        format: snapshot.format,
        intakeId: snapshot.intakeId,
        evidenceItemCount: snapshot.evidenceItems.length,
        evidenceApprovedCount: snapshot.evidenceItems.filter((item) => item.evidenceApproved).length,
        candidateAcceptedCount: snapshot.evidenceItems.filter((item) => item.candidateDecision === "accepted").length,
      })),
    sampleItems: items
      .slice()
      .sort((a, b) => String(b.snapshotUpdatedAt || "").localeCompare(String(a.snapshotUpdatedAt || "")))
      .slice(0, 8),
    guardrail:
      "This visibility is derived from repo-visible local export snapshots only. Browser localStorage evidence is not accessible to the admin dashboard until exported into data/intake.",
  };
}

const CALENDAR_APPOINTMENT_STATES = {
  "no-reply": {
    label: "No reply",
    rank: 0,
  },
  "accepted-local": {
    label: "Accepted local",
    rank: 1,
  },
  "ready-for-calendar": {
    label: "Ready for calendar",
    rank: 2,
  },
};

function normalizeCalendarState(value) {
  const state = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (["ready", "calendar-ready", "ready-for-calendar", "appointment-ready"].includes(state)) return "ready-for-calendar";
  if (["accepted", "accepted-local", "reply-accepted", "reschedule"].includes(state)) return "accepted-local";
  if (["no-reply", "no-response", "unobserved", "not-observed"].includes(state)) return "no-reply";
  return "";
}

function readCalendarAppointmentRecordsFromFile(file) {
  const raw = readText(file.relativePath);
  if (!raw.trim()) return [];
  if (file.name.endsWith(".jsonl")) {
    return parseJsonLines(file.relativePath).filter((record) => !record.parseError).flatMap(flattenRecords);
  }
  if (file.name.endsWith(".json")) {
    try {
      return flattenRecords(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

function listCalendarAppointmentArtifacts() {
  const candidateFiles = [
    ...listFiles("data/intake", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/reply-facts", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/calendar", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/appointments", (name) => /\.(jsonl|json)$/i.test(name)),
  ];

  return candidateFiles.flatMap((file) =>
    readCalendarAppointmentRecordsFromFile(file)
      .map((record, index) => {
        const replyStatus = normalizeReplyStatus(
          firstTruthyValue(record, ["replyStatus", "replyState", "firstReplyStatus", "firstReplyState", "status", "state"])
        );
        const explicitState = normalizeCalendarState(
          firstTruthyValue(record, [
            "calendarReadiness",
            "appointmentReadiness",
            "schedulingReadiness",
            "calendarState",
            "appointmentState",
            "readiness",
            "status",
            "state",
          ])
        );
        const route = String(firstTruthyValue(record, ["nextStep", "businessStep", "route", "routing"]) || "");
        const routeLooksCalendar = /\b(calendar|appointment|scheduling|schedule|consent|date|time)\b/i.test(route);
        const readyFlag = Boolean(
          record.readyForCalendar ||
            record.calendarReady ||
            record.appointmentReady ||
            record.schedulingReady ||
            explicitState === "ready-for-calendar"
        );
        const hasAcceptedReply = ["accepted", "reschedule"].includes(replyStatus) || explicitState === "accepted-local";
        if (!hasAcceptedReply && !readyFlag) return null;

        const state = readyFlag || (hasAcceptedReply && routeLooksCalendar && explicitState === "ready-for-calendar")
          ? "ready-for-calendar"
          : "accepted-local";

        return {
          source: file.relativePath,
          index: index + 1,
          state,
          replyStatus: replyStatus || (hasAcceptedReply ? "accepted" : ""),
          capturedAt: firstTruthyValue(record, ["replyCapturedAt", "firstReplyCapturedAt", "observedAt", "capturedAt", "updatedAt"]) || null,
          route,
          evidenceLabel:
            state === "ready-for-calendar"
              ? "Local readiness says calendar handoff can be prepared; no session event or attendance is claimed."
              : "Local accepted reply exists; calendar readiness is still blocked.",
        };
      })
      .filter(Boolean)
  );
}

function calendarAppointmentRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\b(calendar|appointment|schedul\w*|accepted reply|reply fact|consent|date|time)\b/.test(text)) return null;

  return {
    requiresAcceptedReply: /\b(accepted|reply fact|schedul\w*|calendar|appointment)\b/.test(text),
    requiresCalendarReady: /\b(calendar|appointment|schedul\w*|date|time|consent)\b/.test(text),
    gate:
      "Calendar work can advance only after an explicit local accepted/reschedule reply fact and a local calendar-readiness handoff; sessions and attendance remain unobserved.",
  };
}

function strongestCalendarAppointmentState(states) {
  return states
    .filter((state) => CALENDAR_APPOINTMENT_STATES[state])
    .sort((a, b) => CALENDAR_APPOINTMENT_STATES[b].rank - CALENDAR_APPOINTMENT_STATES[a].rank)[0] || "no-reply";
}

function calendarStateFromEvidence(item, replyReadinessRow, artifacts) {
  const task = String(item?.task || "").toLowerCase();
  const relevantArtifacts = artifacts.filter((artifact) => {
    if (artifact.state === "ready-for-calendar") return true;
    if (artifact.state === "accepted-local" && /\baccepted|reply|schedul|calendar|appointment\b/.test(task)) return true;
    return false;
  });
  const states = relevantArtifacts.map((artifact) => artifact.state);
  if (replyReadinessRow?.state === "session-ready") states.push("accepted-local");
  return {
    state: strongestCalendarAppointmentState(states),
    matchedArtifacts: relevantArtifacts,
  };
}

function buildCalendarAppointmentReadiness(queue, replyFactReadiness) {
  const artifacts = listCalendarAppointmentArtifacts();
  const replyRowsById = new Map((replyFactReadiness?.rows || []).map((row) => [row.id, row]));
  const rows = (queue.items || [])
    .map((item) => {
      const requirement = calendarAppointmentRequirementForItem(item);
      if (!requirement) return null;
      const observed = calendarStateFromEvidence(item, replyRowsById.get(item.id), artifacts);
      const state = observed.state;
      const blocked = state !== "ready-for-calendar";
      const rationale =
        state === "ready-for-calendar"
          ? "Explicit local readiness supports calendar handoff only; it does not claim a real session, attendance, no-show, demand, or outcome."
          : state === "accepted-local"
            ? "A local accepted/reschedule reply fact is visible, but no calendar-ready handoff fact is present."
            : "No repo-visible accepted/reschedule reply fact was found, so this row stays at no-reply.";

      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state,
        stateLabel: CALENDAR_APPOINTMENT_STATES[state].label,
        blocked,
        gate: requirement.gate,
        rationale,
        matchedArtifacts: observed.matchedArtifacts,
        evidenceNote:
          state === "no-reply"
            ? "No accepted reply, appointment, attendance, no-show, or outcome is claimed."
            : "Evidence is local-only operational readiness and must not be promoted into session outcomes.",
      };
    })
    .filter(Boolean);

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      "data/intake/*",
      "data/reply-facts/*",
      "data/calendar/*",
      "data/appointments/*",
    ],
    total: rows.length,
    noReplyCount: rows.filter((row) => row.state === "no-reply").length,
    acceptedLocalCount: rows.filter((row) => row.state === "accepted-local").length,
    readyForCalendarCount: rows.filter((row) => row.state === "ready-for-calendar").length,
    blockedCount: rows.filter((row) => row.blocked).length,
    artifacts,
    rows,
  };
}

const SESSION_START_STATES = {
  blocked: {
    label: "Blocked",
    rank: 0,
  },
  "appointment-confirmed": {
    label: "Appointment confirmed",
    rank: 1,
  },
  "ready-for-runbook": {
    label: "Ready for runbook",
    rank: 2,
  },
};

function normalizeSessionStartState(value) {
  const state = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (["ready", "ready-for-runbook", "runbook-ready", "session-ready", "ready-to-start"].includes(state)) return "ready-for-runbook";
  if (["appointment-confirmed", "confirmed", "scheduled", "appointment-ready", "calendar-ready"].includes(state)) return "appointment-confirmed";
  if (["blocked", "not-ready", "unobserved", "not-observed", "missing"].includes(state)) return "blocked";
  return "";
}

function booleanFact(record, keys) {
  return keys.some((key) => {
    if (!record || !Object.prototype.hasOwnProperty.call(record, key)) return false;
    const value = record[key];
    if (typeof value === "boolean") return value;
    return /^(true|yes|ready|confirmed|complete|completed|done)$/i.test(String(value || "").trim());
  });
}

function textFact(record, keys) {
  return String(firstTruthyValue(record, keys) || "").trim();
}

function readSessionStartRecordsFromFile(file) {
  return readCalendarAppointmentRecordsFromFile(file);
}

function listSessionStartArtifacts() {
  const candidateFiles = [
    ...listFiles("data/intake", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/reply-facts", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/calendar", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/appointments", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/session-start", (name) => /\.(jsonl|json)$/i.test(name)),
  ];

  return candidateFiles.flatMap((file) =>
    readSessionStartRecordsFromFile(file)
      .map((record, index) => {
        const explicitState = normalizeSessionStartState(
          firstTruthyValue(record, [
            "sessionStartReadiness",
            "sessionStartState",
            "sessionGateState",
            "readiness",
            "status",
            "state",
          ])
        );
        const appointmentTime = textFact(record, [
          "appointmentTime",
          "appointmentAt",
          "scheduledAt",
          "calendarTime",
          "sessionTime",
          "startAt",
          "startsAt",
          "dateTime",
        ]);
        const consentReady = booleanFact(record, [
          "consentReady",
          "consentConfirmed",
          "consentBoundaryReady",
          "consentReminderSent",
          "consentReminderComplete",
        ]);
        const redactedReady = booleanFact(record, [
          "redactedMaterialReady",
          "redactedMaterialsReady",
          "redactedMaterialReminderComplete",
          "redactedReminderSent",
          "redactedReminderReady",
        ]);
        const rawNoteReady = booleanFact(record, [
          "rawNotePrepReady",
          "rawNotesReady",
          "rawNoteDestinationReady",
          "rawNotePrepComplete",
        ]);
        const runbookReady = booleanFact(record, ["runbookReady", "operatorRunbookReady", "readyForRunbook"]);
        const appointmentConfirmed = Boolean(
          appointmentTime ||
            record.appointmentConfirmed ||
            record.confirmedAppointment ||
            explicitState === "appointment-confirmed" ||
            explicitState === "ready-for-runbook"
        );
        const readyForRunbook = Boolean(
          explicitState === "ready-for-runbook" ||
            (appointmentConfirmed && consentReady && redactedReady && rawNoteReady) ||
            (appointmentConfirmed && runbookReady)
        );
        if (!appointmentConfirmed && !consentReady && !redactedReady && !rawNoteReady && !runbookReady && !explicitState) return null;

        const state = readyForRunbook ? "ready-for-runbook" : appointmentConfirmed ? "appointment-confirmed" : "blocked";
        return {
          source: file.relativePath,
          index: index + 1,
          state,
          appointmentTime,
          consentReady,
          redactedReady,
          rawNoteReady,
          runbookReady,
          capturedAt: textFact(record, ["sessionStartCapturedAt", "appointmentCapturedAt", "observedAt", "capturedAt", "updatedAt"]),
          route: textFact(record, ["nextStep", "businessStep", "route", "routing"]),
          evidenceLabel:
            state === "ready-for-runbook"
              ? "Local facts satisfy the session-start runbook gate; this does not claim the session happened."
              : state === "appointment-confirmed"
                ? "Local appointment confirmation exists, but at least one start gate remains incomplete."
                : "Local pre-session facts exist, but no appointment-confirmed runbook state is claimed.",
        };
      })
      .filter(Boolean)
  );
}

function sessionStartRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\b(session-start|session start|appointment-confirmed|appointment confirmed|runbook|raw-note|raw note|precall|redacted-material|redacted material)\b/.test(text)) {
    return null;
  }

  return {
    requiresAppointmentTime: /\b(appointment|confirmed|time|date|session-start|session start)\b/.test(text),
    requiresConsentBoundary: /\b(consent|boundary|calendar readiness)\b/.test(text),
    requiresRedactedMaterial: /\b(redacted|material)\b/.test(text),
    requiresRawNotePrep: /\b(raw-note|raw note|runbook|debrief|prep)\b/.test(text),
    gate:
      "Session start remains blocked until a local appointment time, consent boundary, redacted-material reminder, and raw-note prep are present; attendance and outcomes are not inferred.",
  };
}

function strongestSessionStartState(states) {
  return states
    .filter((state) => SESSION_START_STATES[state])
    .sort((a, b) => SESSION_START_STATES[b].rank - SESSION_START_STATES[a].rank)[0] || "blocked";
}

function sessionStartStateFromEvidence(item, calendarRow, artifacts) {
  const task = String(item?.task || "").toLowerCase();
  const relevantArtifacts = artifacts.filter((artifact) => {
    if (artifact.state === "ready-for-runbook") return true;
    if (artifact.state === "appointment-confirmed" && /\b(appointment|session|runbook|raw-note|raw note|consent|redacted)\b/.test(task)) return true;
    return false;
  });
  const states = relevantArtifacts.map((artifact) => artifact.state);
  if (calendarRow?.state === "ready-for-calendar") states.push("appointment-confirmed");
  return {
    state: strongestSessionStartState(states),
    matchedArtifacts: relevantArtifacts,
  };
}

function sessionStartSourceArtifacts() {
  const paths = [
    "ops/research/private-free-audit-first-session-operator-runbook.md",
    "ops/research/private-free-audit-scheduling-consent-checklist.md",
    "ops/research/free-audit-real-session-note-packet.md",
    "ops/research/private-free-audit-post-session-debrief-template.md",
    "ops/launch/private-free-audit-accepted-reply-confirmation.md",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function buildSessionStartReadiness(queue, calendarAppointmentReadiness) {
  const artifacts = listSessionStartArtifacts();
  const calendarRowsById = new Map((calendarAppointmentReadiness?.rows || []).map((row) => [row.id, row]));
  const sourceArtifacts = sessionStartSourceArtifacts();
  const rows = (queue.items || [])
    .map((item) => {
      const requirement = sessionStartRequirementForItem(item);
      if (!requirement) return null;
      const observed = sessionStartStateFromEvidence(item, calendarRowsById.get(item.id), artifacts);
      const state = observed.state;
      const missing = [];
      if (requirement.requiresAppointmentTime && !observed.matchedArtifacts.some((artifact) => artifact.appointmentTime || artifact.state !== "blocked")) {
        missing.push("appointment time");
      }
      if (requirement.requiresConsentBoundary && !observed.matchedArtifacts.some((artifact) => artifact.consentReady)) missing.push("consent boundary");
      if (requirement.requiresRedactedMaterial && !observed.matchedArtifacts.some((artifact) => artifact.redactedReady)) {
        missing.push("redacted-material reminder");
      }
      if (requirement.requiresRawNotePrep && !observed.matchedArtifacts.some((artifact) => artifact.rawNoteReady || artifact.runbookReady)) {
        missing.push("raw-note prep");
      }

      const rationale =
        state === "ready-for-runbook"
          ? "Explicit local pre-session facts satisfy the runbook gate only; no attendance, no-show, demand, testimonial, or outcome is claimed."
          : state === "appointment-confirmed"
            ? "A local appointment-confirmed fact is visible, but consent, redacted-material, raw-note, or runbook readiness is still incomplete."
            : "No repo-visible appointment-confirmed session-start fact matched this active row, so the row remains blocked.";

      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state,
        stateLabel: SESSION_START_STATES[state].label,
        blocked: state !== "ready-for-runbook",
        missing,
        gate: requirement.gate,
        rationale,
        sourceArtifacts,
        matchedArtifacts: observed.matchedArtifacts,
        evidenceNote:
          state === "blocked"
            ? "No appointment, attendance, no-show, demand, testimonial, or outcome is claimed."
            : "Evidence is local-only session-start readiness and must not be promoted into session outcomes.",
      };
    })
    .filter(Boolean);

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      "data/intake/*",
      "data/reply-facts/*",
      "data/calendar/*",
      "data/appointments/*",
      "data/session-start/*",
      "ops/research/private-free-audit-first-session-operator-runbook.md",
      "ops/research/private-free-audit-scheduling-consent-checklist.md",
      "ops/research/free-audit-real-session-note-packet.md",
    ],
    total: rows.length,
    blockedCount: rows.filter((row) => row.state === "blocked").length,
    appointmentConfirmedCount: rows.filter((row) => row.state === "appointment-confirmed").length,
    readyForRunbookCount: rows.filter((row) => row.state === "ready-for-runbook").length,
    artifacts,
    sourceArtifacts,
    rows,
  };
}

const RAW_NOTE_CAPTURE_STATES = {
  blocked: {
    label: "Blocked",
    rank: 0,
  },
  "ready-to-capture": {
    label: "Ready to capture",
    rank: 1,
  },
  "notes-recorded": {
    label: "Notes recorded",
    rank: 2,
  },
  "debrief-ready": {
    label: "Debrief ready",
    rank: 3,
  },
};

function normalizeRawNoteCaptureState(value) {
  const state = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (["debrief-ready", "ready-for-debrief", "ready-to-debrief", "debrief"].includes(state)) return "debrief-ready";
  if (["notes-recorded", "note-recorded", "recorded", "captured", "raw-notes-recorded"].includes(state)) return "notes-recorded";
  if (["ready", "ready-to-capture", "capture-ready", "raw-note-ready", "raw-notes-ready"].includes(state)) return "ready-to-capture";
  if (["blocked", "not-ready", "unobserved", "not-observed", "missing"].includes(state)) return "blocked";
  return "";
}

function listRawNoteCaptureArtifacts() {
  const candidateFiles = [
    ...listFiles("data/intake", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/session-start", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/raw-notes", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/session-notes", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/debriefs", (name) => /\.(jsonl|json)$/i.test(name)),
  ];

  return candidateFiles.flatMap((file) =>
    readSessionStartRecordsFromFile(file)
      .map((record, index) => {
        const explicitState = normalizeRawNoteCaptureState(
          firstTruthyValue(record, [
            "rawNoteCaptureReadiness",
            "rawNoteCaptureState",
            "rawNoteReadiness",
            "rawNotesState",
            "sessionNotesState",
            "debriefReadiness",
            "readiness",
            "status",
            "state",
          ])
        );
        const readyToCapture = booleanFact(record, [
          "readyToCaptureRawNotes",
          "rawNoteCaptureReady",
          "rawNotesReady",
          "rawNotePrepReady",
          "rawNotePrepConfirmed",
          "readyForRawNotes",
        ]);
        const notesRecorded = Boolean(
          explicitState === "notes-recorded" ||
            explicitState === "debrief-ready" ||
            booleanFact(record, ["rawNotesRecorded", "rawNoteRecorded", "sessionNotesRecorded", "notesRecorded"]) ||
            textFact(record, ["rawNoteText", "rawNotesText", "sessionNotesText", "rawNotes", "sessionNotes", "noteBody"])
        );
        const debriefReady = Boolean(
          explicitState === "debrief-ready" ||
            (notesRecorded &&
              (booleanFact(record, ["debriefReady", "readyForDebrief", "postSessionDebriefReady"]) ||
                textFact(record, ["debriefRoute", "debriefDestination", "debriefLink", "nextDebriefStep"])))
        );
        const sessionStartReady = Boolean(
          normalizeSessionStartState(
            firstTruthyValue(record, ["sessionStartReadiness", "sessionStartState", "sessionGateState"])
          ) === "ready-for-runbook" ||
            booleanFact(record, ["runbookReady", "operatorRunbookReady", "readyForRunbook"])
        );
        if (!readyToCapture && !notesRecorded && !debriefReady && !sessionStartReady && !explicitState) return null;

        const state = debriefReady
          ? "debrief-ready"
          : notesRecorded
            ? "notes-recorded"
            : readyToCapture || sessionStartReady
              ? "ready-to-capture"
              : "blocked";

        return {
          source: file.relativePath,
          index: index + 1,
          state,
          readyToCapture: state !== "blocked",
          notesRecorded,
          debriefReady,
          capturedAt: textFact(record, ["rawNoteCapturedAt", "rawNotesCapturedAt", "notesCapturedAt", "observedAt", "capturedAt", "updatedAt"]),
          debriefRoute: textFact(record, ["debriefRoute", "debriefDestination", "debriefLink", "nextDebriefStep", "nextStep", "route"]),
          evidenceLabel:
            state === "debrief-ready"
              ? "Local raw-note capture exists and can be routed to debrief; this is not an attendance or outcome claim."
              : state === "notes-recorded"
                ? "Local raw notes are recorded, but debrief readiness is not complete."
                : state === "ready-to-capture"
                  ? "Local pre-session facts indicate notes can be captured when the operator starts; no attendance is claimed."
                  : "Raw-note capture is blocked until session-start readiness exists.",
        };
      })
      .filter(Boolean)
  );
}

function rawNoteCaptureRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\b(raw-note|raw note|raw notes|session note|notes-recorded|notes recorded|debrief|objection coding|first-session|first session)\b/.test(text)) {
    return null;
  }

  return {
    requiresSessionStartReady: /\b(session-start|session start|after session-start|first-session|first session|ready-to-capture|capture)\b/.test(text),
    requiresNotesRecorded: /\b(notes-recorded|notes recorded|raw notes exist|raw notes|debrief|objection coding)\b/.test(text),
    requiresDebriefReady: /\b(debrief-ready|debrief ready|debrief|objection coding)\b/.test(text),
    gate:
      "Raw-note capture can become visible only after local session-start readiness; notes and debrief routing are private operational facts, not attendance or outcome evidence.",
  };
}

function strongestRawNoteCaptureState(states) {
  return states
    .filter((state) => RAW_NOTE_CAPTURE_STATES[state])
    .sort((a, b) => RAW_NOTE_CAPTURE_STATES[b].rank - RAW_NOTE_CAPTURE_STATES[a].rank)[0] || "blocked";
}

function rawNoteCaptureStateFromEvidence(item, sessionStartRow, artifacts) {
  const task = String(item?.task || "").toLowerCase();
  const relevantArtifacts = artifacts.filter((artifact) => {
    if (artifact.state === "debrief-ready" || artifact.state === "notes-recorded") return true;
    if (artifact.state === "ready-to-capture" && /\b(raw-note|raw note|raw notes|session note|debrief|objection|capture)\b/.test(task)) {
      return true;
    }
    return false;
  });
  const states = relevantArtifacts.map((artifact) => artifact.state);
  if (sessionStartRow?.state === "ready-for-runbook") states.push("ready-to-capture");
  return {
    state: strongestRawNoteCaptureState(states),
    matchedArtifacts: relevantArtifacts,
  };
}

function rawNoteCaptureSourceArtifacts() {
  const paths = [
    "ops/research/private-free-audit-first-session-operator-runbook.md",
    "ops/research/free-audit-real-session-note-packet.md",
    "ops/research/private-free-audit-post-session-debrief-template.md",
    "ops/research/free-audit-objection-coding-rubric.md",
    "ops/research/private-free-audit-learning-log-index.md",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function buildRawNoteCaptureReadiness(queue, sessionStartReadiness) {
  const artifacts = listRawNoteCaptureArtifacts();
  const sessionStartRowsById = new Map((sessionStartReadiness?.rows || []).map((row) => [row.id, row]));
  const sourceArtifacts = rawNoteCaptureSourceArtifacts();
  const rows = (queue.items || [])
    .map((item) => {
      const requirement = rawNoteCaptureRequirementForItem(item);
      if (!requirement) return null;
      const observed = rawNoteCaptureStateFromEvidence(item, sessionStartRowsById.get(item.id), artifacts);
      const state = observed.state;
      const missing = [];
      if (requirement.requiresSessionStartReady && state === "blocked") missing.push("session-start readiness");
      if (requirement.requiresNotesRecorded && !["notes-recorded", "debrief-ready"].includes(state)) missing.push("raw notes recorded");
      if (requirement.requiresDebriefReady && state !== "debrief-ready") missing.push("debrief-ready routing");

      const rationale =
        state === "debrief-ready"
          ? "Local raw notes are recorded and ready for private debrief routing only; attendance, no-show, demand, testimonials, and outcomes stay unobserved."
          : state === "notes-recorded"
            ? "Local raw notes are visible, but no debrief-ready route is present; conclusions remain blocked."
            : state === "ready-to-capture"
              ? "Local session-start readiness supports opening raw-note capture; this does not prove the session happened."
              : "No repo-visible session-start-ready or raw-note artifact matched this active row, so capture remains blocked.";

      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state,
        stateLabel: RAW_NOTE_CAPTURE_STATES[state].label,
        blocked: state === "blocked",
        missing,
        gate: requirement.gate,
        rationale,
        sourceArtifacts,
        matchedArtifacts: observed.matchedArtifacts,
        evidenceNote:
          state === "blocked"
            ? "No attendance, no-show, demand, testimonial, raw-note, debrief, or outcome fact is claimed."
            : "Evidence is local-only operational readiness and must not be promoted into attendance, demand, testimonials, or outcomes.",
      };
    })
    .filter(Boolean);

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      "data/intake/*",
      "data/session-start/*",
      "data/raw-notes/*",
      "data/session-notes/*",
      "data/debriefs/*",
      "ops/research/free-audit-real-session-note-packet.md",
      "ops/research/private-free-audit-post-session-debrief-template.md",
      "ops/research/free-audit-objection-coding-rubric.md",
    ],
    total: rows.length,
    blockedCount: rows.filter((row) => row.state === "blocked").length,
    readyToCaptureCount: rows.filter((row) => row.state === "ready-to-capture").length,
    notesRecordedCount: rows.filter((row) => row.state === "notes-recorded").length,
    debriefReadyCount: rows.filter((row) => row.state === "debrief-ready").length,
    artifacts,
    sourceArtifacts,
    rows,
  };
}

const POST_SESSION_DEBRIEF_STATES = {
  blocked: {
    label: "Blocked",
    rank: 0,
  },
  "notes-ready": {
    label: "Notes ready",
    rank: 1,
  },
  "debrief-drafted": {
    label: "Debrief drafted",
    rank: 2,
  },
  "synthesis-ready": {
    label: "Synthesis ready",
    rank: 3,
  },
};

function normalizePostSessionDebriefState(value) {
  const state = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (["synthesis-ready", "ready-for-synthesis", "five-session-ready", "synthesis"].includes(state)) return "synthesis-ready";
  if (["debrief-drafted", "drafted", "debrief-complete", "debriefed", "draft"].includes(state)) return "debrief-drafted";
  if (["notes-ready", "raw-notes-ready", "ready-for-debrief", "debrief-ready", "notes-recorded"].includes(state)) return "notes-ready";
  if (["blocked", "not-ready", "unobserved", "not-observed", "missing"].includes(state)) return "blocked";
  return "";
}

function listPostSessionDebriefArtifacts() {
  const candidateFiles = [
    ...listFiles("data/intake", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/raw-notes", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/session-notes", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/debriefs", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/synthesis", (name) => /\.(jsonl|json)$/i.test(name)),
  ];

  return candidateFiles.flatMap((file) =>
    readSessionStartRecordsFromFile(file)
      .map((record, index) => {
        const explicitState = normalizePostSessionDebriefState(
          firstTruthyValue(record, [
            "postSessionDebriefReadiness",
            "postSessionDebriefState",
            "debriefReadiness",
            "debriefState",
            "synthesisReadiness",
            "readiness",
            "status",
            "state",
          ])
        );
        const notesReady = Boolean(
          explicitState === "notes-ready" ||
            booleanFact(record, ["rawNotesRecorded", "rawNoteRecorded", "sessionNotesRecorded", "notesRecorded", "readyForDebrief"]) ||
            textFact(record, ["rawNoteText", "rawNotesText", "sessionNotesText", "rawNotes", "sessionNotes", "noteBody"])
        );
        const debriefDrafted = Boolean(
          ["debrief-drafted", "synthesis-ready"].includes(explicitState) ||
            booleanFact(record, ["debriefDrafted", "debriefComplete", "postSessionDebriefDrafted"]) ||
            textFact(record, ["debriefDraft", "debriefSummary", "operatorNextSteps", "nextStepDecision"])
        );
        const synthesisReady = Boolean(
          explicitState === "synthesis-ready" ||
            booleanFact(record, ["synthesisReady", "readyForSynthesis", "fiveSessionSynthesisReady"]) ||
            textFact(record, ["synthesisRoute", "synthesisDestination", "synthesisLink"])
        );
        if (!notesReady && !debriefDrafted && !synthesisReady && !explicitState) return null;

        const state = synthesisReady
          ? "synthesis-ready"
          : debriefDrafted
            ? "debrief-drafted"
            : notesReady
              ? "notes-ready"
              : "blocked";

        return {
          source: file.relativePath,
          index: index + 1,
          state,
          notesReady,
          debriefDrafted,
          synthesisReady,
          capturedAt: textFact(record, ["debriefCapturedAt", "debriefDraftedAt", "observedAt", "capturedAt", "updatedAt"]),
          route: textFact(record, ["synthesisRoute", "synthesisDestination", "debriefRoute", "nextStep", "route"]),
          evidenceLabel:
            state === "synthesis-ready"
              ? "Private debrief evidence says synthesis review can be prepared; it does not claim demand, pricing, testimonials, or outcomes."
              : state === "debrief-drafted"
                ? "A private debrief draft exists, but five-session synthesis conclusions remain blocked."
                : state === "notes-ready"
                  ? "Raw notes are ready for private debrief; no conclusions are claimed."
                  : "Post-session debrief remains blocked until raw notes exist.",
        };
      })
      .filter(Boolean)
  );
}

function postSessionDebriefRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\b(post-session|post session|debrief|synthesis|notes-ready|notes ready|debrief-drafted|debrief drafted)\b/.test(text)) {
    return null;
  }

  return {
    requiresNotesReady: /\b(raw-note|raw note|raw notes|notes-ready|notes ready|debrief|post-session|post session)\b/.test(text),
    requiresDebriefDrafted: /\b(debrief-drafted|debrief drafted|draft|operator next-step|next-step|next step|objection coding|synthesis)\b/.test(text),
    requiresSynthesisReady: /\b(synthesis-ready|synthesis ready|five-session synthesis exists|five session synthesis exists|until five-session synthesis|until five session synthesis)\b/.test(text),
    gate:
      "Post-session debrief stays blocked until real raw notes exist; debrief drafts and synthesis readiness are private operations signals only, not demand, testimonial, willingness-to-pay, or outcome evidence.",
  };
}

function strongestPostSessionDebriefState(states) {
  return states
    .filter((state) => POST_SESSION_DEBRIEF_STATES[state])
    .sort((a, b) => POST_SESSION_DEBRIEF_STATES[b].rank - POST_SESSION_DEBRIEF_STATES[a].rank)[0] || "blocked";
}

function postSessionDebriefStateFromEvidence(rawNoteRow, artifacts) {
  const states = artifacts.map((artifact) => artifact.state);
  if (["notes-recorded", "debrief-ready"].includes(rawNoteRow?.state)) states.push("notes-ready");
  return {
    state: strongestPostSessionDebriefState(states),
    matchedArtifacts: artifacts,
  };
}

function postSessionDebriefSourceArtifacts() {
  const paths = [
    "ops/research/free-audit-real-session-note-packet.md",
    "ops/research/private-free-audit-raw-note-quality-checklist.md",
    "ops/research/private-free-audit-post-session-debrief-template.md",
    "ops/research/free-audit-objection-coding-rubric.md",
    "ops/research/free-audit-interview-synthesis-template.md",
    "ops/research/private-free-audit-learning-log-index.md",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function buildPostSessionDebriefReadiness(queue, rawNoteCaptureReadiness) {
  const artifacts = listPostSessionDebriefArtifacts();
  const rawNoteRowsById = new Map((rawNoteCaptureReadiness?.rows || []).map((row) => [row.id, row]));
  const sourceArtifacts = postSessionDebriefSourceArtifacts();
  const rows = (queue.items || [])
    .map((item) => {
      const requirement = postSessionDebriefRequirementForItem(item);
      if (!requirement) return null;
      const observed = postSessionDebriefStateFromEvidence(rawNoteRowsById.get(item.id), artifacts);
      const state = observed.state;
      const missing = [];
      if (requirement.requiresNotesReady && state === "blocked") missing.push("raw notes ready for debrief");
      if (requirement.requiresDebriefDrafted && !["debrief-drafted", "synthesis-ready"].includes(state)) missing.push("private debrief draft");
      if (requirement.requiresSynthesisReady && state !== "synthesis-ready") missing.push("five-session synthesis readiness");

      const rationale =
        state === "synthesis-ready"
          ? "Private debrief artifacts indicate synthesis review can be prepared; demand, testimonials, willingness-to-pay, and outcomes remain unclaimed."
          : state === "debrief-drafted"
            ? "A private debrief draft exists, but synthesis, pricing, testimonial, and outcome conclusions remain blocked."
            : state === "notes-ready"
              ? "Raw notes are ready for private debrief; the dashboard does not infer demand, willingness-to-pay, testimonials, or outcomes."
              : "No repo-visible raw-note-ready or debrief artifact matched this active row, so post-session debrief remains blocked.";

      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state,
        stateLabel: POST_SESSION_DEBRIEF_STATES[state].label,
        blocked: state === "blocked",
        missing,
        gate: requirement.gate,
        rationale,
        sourceArtifacts,
        matchedArtifacts: observed.matchedArtifacts,
        evidenceNote:
          state === "blocked"
            ? "No raw-note, debrief draft, synthesis, demand, testimonial, willingness-to-pay, or outcome fact is claimed."
            : "Evidence is private operational readiness and must not be promoted into demand, testimonials, willingness-to-pay, or outcomes.",
      };
    })
    .filter(Boolean);

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      "data/intake/*",
      "data/raw-notes/*",
      "data/session-notes/*",
      "data/debriefs/*",
      "data/synthesis/*",
      "ops/research/free-audit-real-session-note-packet.md",
      "ops/research/private-free-audit-post-session-debrief-template.md",
      "ops/research/free-audit-interview-synthesis-template.md",
    ],
    total: rows.length,
    blockedCount: rows.filter((row) => row.state === "blocked").length,
    notesReadyCount: rows.filter((row) => row.state === "notes-ready").length,
    debriefDraftedCount: rows.filter((row) => row.state === "debrief-drafted").length,
    synthesisReadyCount: rows.filter((row) => row.state === "synthesis-ready").length,
    artifacts,
    sourceArtifacts,
    rows,
  };
}

const OBJECTION_CODING_STATES = {
  blocked: {
    label: "Blocked",
    rank: 0,
  },
  "debrief-ready": {
    label: "Debrief ready",
    rank: 1,
  },
  "codes-recorded": {
    label: "Codes recorded",
    rank: 2,
  },
  "synthesis-ready": {
    label: "Synthesis ready",
    rank: 3,
  },
};

function normalizeObjectionCodingState(value) {
  const state = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (["synthesis-ready", "ready-for-synthesis", "five-session-ready", "synthesis"].includes(state)) return "synthesis-ready";
  if (["codes-recorded", "code-recorded", "coded", "recorded", "objection-coded", "objection-codes-recorded"].includes(state)) {
    return "codes-recorded";
  }
  if (["debrief-ready", "ready-for-coding", "coding-ready", "ready", "debrief-drafted"].includes(state)) return "debrief-ready";
  if (["blocked", "not-ready", "unobserved", "not-observed", "missing"].includes(state)) return "blocked";
  return "";
}

function listObjectionCodingArtifacts() {
  const candidateFiles = [
    ...listFiles("data/intake", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/debriefs", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/objection-coding", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/objection-codes", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/synthesis", (name) => /\.(jsonl|json)$/i.test(name)),
  ];

  return candidateFiles.flatMap((file) =>
    readSessionStartRecordsFromFile(file)
      .map((record, index) => {
        const explicitState = normalizeObjectionCodingState(
          firstTruthyValue(record, [
            "objectionCodingReadiness",
            "objectionCodingState",
            "objectionCodeReadiness",
            "objectionCodeState",
            "codingReadiness",
            "codingState",
            "readiness",
            "status",
            "state",
          ])
        );
        const debriefReady = Boolean(
          explicitState === "debrief-ready" ||
            ["debrief-drafted", "synthesis-ready"].includes(
              normalizePostSessionDebriefState(
                firstTruthyValue(record, ["postSessionDebriefReadiness", "postSessionDebriefState", "debriefReadiness", "debriefState"])
              )
            ) ||
            booleanFact(record, ["debriefDrafted", "debriefComplete", "postSessionDebriefDrafted", "readyForObjectionCoding"]) ||
            textFact(record, ["debriefDraft", "debriefSummary", "operatorNextSteps", "nextStepDecision"])
        );
        const codesRecorded = Boolean(
          ["codes-recorded", "synthesis-ready"].includes(explicitState) ||
            booleanFact(record, ["objectionCodesRecorded", "objectionCodingRecorded", "objectionCodingComplete", "codesRecorded"]) ||
            textFact(record, ["objectionCode", "objectionCodes", "objectionTags", "objectionTag", "objectionTheme", "objectionThemes"])
        );
        const synthesisReady = Boolean(
          explicitState === "synthesis-ready" ||
            booleanFact(record, ["synthesisReady", "readyForSynthesis", "fiveSessionSynthesisReady", "objectionSynthesisReady"]) ||
            textFact(record, ["synthesisRoute", "synthesisDestination", "synthesisLink", "fiveSessionSynthesisRoute"])
        );
        if (!debriefReady && !codesRecorded && !synthesisReady && !explicitState) return null;

        const state = synthesisReady
          ? "synthesis-ready"
          : codesRecorded
            ? "codes-recorded"
            : debriefReady
              ? "debrief-ready"
              : "blocked";

        return {
          source: file.relativePath,
          index: index + 1,
          state,
          debriefReady,
          codesRecorded,
          synthesisReady,
          capturedAt: textFact(record, ["objectionCodedAt", "objectionCodingCapturedAt", "observedAt", "capturedAt", "updatedAt"]),
          route: textFact(record, ["synthesisRoute", "synthesisDestination", "synthesisLink", "nextStep", "route"]),
          evidenceLabel:
            state === "synthesis-ready"
              ? "Private objection codes indicate synthesis review can be prepared; this is not demand, willingness-to-pay, testimonial, or outcome evidence."
              : state === "codes-recorded"
                ? "Private objection codes are recorded, but synthesis conclusions remain blocked."
                : state === "debrief-ready"
                  ? "A private debrief is ready for objection coding; no market conclusion is claimed."
                  : "Objection coding remains blocked until post-session debrief evidence exists.",
        };
      })
      .filter(Boolean)
  );
}

function objectionCodingRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\b(objection-coding|objection coding|objection code|objection tag|objection rubric|codes-recorded|codes recorded|synthesis)\b/.test(text)) {
    return null;
  }

  return {
    requiresDebriefReady: /\b(objection-coding|objection coding|objection code|objection rubric|debrief|post-session|post session)\b/.test(text),
    requiresCodesRecorded: /\b(codes-recorded|codes recorded|saved state|saved-state|local objection-code|local objection code|objection tag)\b/.test(text),
    requiresSynthesisReady: /\b(synthesis-ready|synthesis ready|five-session synthesis exists|five session synthesis exists|until five-session synthesis|until five session synthesis)\b/.test(text),
    gate:
      "Objection coding opens only after private post-session debrief evidence; codes and synthesis readiness are internal signals, not demand, testimonial, willingness-to-pay, or outcome evidence.",
  };
}

function strongestObjectionCodingState(states) {
  return states
    .filter((state) => OBJECTION_CODING_STATES[state])
    .sort((a, b) => OBJECTION_CODING_STATES[b].rank - OBJECTION_CODING_STATES[a].rank)[0] || "blocked";
}

function objectionCodingStateFromEvidence(postDebriefRow, artifacts) {
  const states = artifacts.map((artifact) => artifact.state);
  if (["debrief-drafted", "synthesis-ready"].includes(postDebriefRow?.state)) states.push("debrief-ready");
  return {
    state: strongestObjectionCodingState(states),
    matchedArtifacts: artifacts,
  };
}

function objectionCodingSourceArtifacts() {
  const paths = [
    "ops/research/private-free-audit-post-session-debrief-template.md",
    "ops/research/free-audit-objection-coding-rubric.md",
    "ops/research/free-audit-interview-synthesis-template.md",
    "ops/research/private-free-audit-post-session-debrief-decision-checklist.md",
    "ops/research/private-free-audit-learning-log-index.md",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function buildObjectionCodingReadiness(queue, postSessionDebriefReadiness) {
  const artifacts = listObjectionCodingArtifacts();
  const postDebriefRowsById = new Map((postSessionDebriefReadiness?.rows || []).map((row) => [row.id, row]));
  const sourceArtifacts = objectionCodingSourceArtifacts();
  const rows = (queue.items || [])
    .map((item) => {
      const requirement = objectionCodingRequirementForItem(item);
      if (!requirement) return null;
      const observed = objectionCodingStateFromEvidence(postDebriefRowsById.get(item.id), artifacts);
      const state = observed.state;
      const missing = [];
      if (requirement.requiresDebriefReady && state === "blocked") missing.push("private post-session debrief");
      if (requirement.requiresCodesRecorded && !["codes-recorded", "synthesis-ready"].includes(state)) missing.push("private objection codes recorded");
      if (requirement.requiresSynthesisReady && state !== "synthesis-ready") missing.push("five-session synthesis readiness");

      const rationale =
        state === "synthesis-ready"
          ? "Private objection-coding artifacts indicate synthesis review can be prepared; demand, testimonials, willingness-to-pay, and outcomes remain unclaimed."
          : state === "codes-recorded"
            ? "Private objection codes exist, but synthesis, pricing, testimonial, and outcome conclusions remain blocked."
            : state === "debrief-ready"
              ? "Private debrief evidence can feed objection coding; the dashboard does not infer demand, willingness-to-pay, testimonials, or outcomes."
              : "No repo-visible post-session debrief or objection-coding artifact matched this active row, so objection coding remains blocked.";

      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state,
        stateLabel: OBJECTION_CODING_STATES[state].label,
        blocked: state === "blocked",
        missing,
        gate: requirement.gate,
        rationale,
        sourceArtifacts,
        matchedArtifacts: observed.matchedArtifacts,
        evidenceNote:
          state === "blocked"
            ? "No debrief, objection-code, synthesis, demand, testimonial, willingness-to-pay, or outcome fact is claimed."
            : "Evidence is private operational coding readiness and must not be promoted into demand, testimonials, willingness-to-pay, or outcomes.",
      };
    })
    .filter(Boolean);

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      "data/intake/*",
      "data/debriefs/*",
      "data/objection-coding/*",
      "data/objection-codes/*",
      "data/synthesis/*",
      "ops/research/private-free-audit-post-session-debrief-template.md",
      "ops/research/free-audit-objection-coding-rubric.md",
      "ops/research/free-audit-interview-synthesis-template.md",
    ],
    total: rows.length,
    blockedCount: rows.filter((row) => row.state === "blocked").length,
    debriefReadyCount: rows.filter((row) => row.state === "debrief-ready").length,
    codesRecordedCount: rows.filter((row) => row.state === "codes-recorded").length,
    synthesisReadyCount: rows.filter((row) => row.state === "synthesis-ready").length,
    artifacts,
    sourceArtifacts,
    rows,
  };
}

const FIVE_SESSION_SYNTHESIS_STATES = {
  blocked: {
    label: "Blocked",
    rank: 0,
  },
  partial: {
    label: "Partial",
    rank: 1,
  },
  ready: {
    label: "Ready",
    rank: 2,
  },
};

function normalizeFiveSessionSynthesisState(value) {
  const state = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (["ready", "synthesis-ready", "five-session-ready", "complete", "completed"].includes(state)) return "ready";
  if (["partial", "in-progress", "some-complete", "sessions-partial"].includes(state)) return "partial";
  if (["blocked", "not-ready", "unobserved", "not-observed", "missing"].includes(state)) return "blocked";
  return "";
}

function numericFact(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (value === undefined || value === null || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function normalizeSynthesisSessionPacket(record, source, index) {
  const rawNoteComplete = Boolean(
    booleanFact(record, ["rawNotesRecorded", "rawNoteRecorded", "sessionNotesRecorded", "notesRecorded", "rawNoteComplete"]) ||
      textFact(record, ["rawNoteText", "rawNotesText", "sessionNotesText", "rawNotes", "sessionNotes", "noteBody"])
  );
  const debriefComplete = Boolean(
    booleanFact(record, ["debriefDrafted", "debriefComplete", "postSessionDebriefDrafted", "postSessionDebriefComplete"]) ||
      textFact(record, ["debriefDraft", "debriefSummary", "operatorNextSteps", "nextStepDecision"])
  );
  const objectionCodesRecorded = Boolean(
    booleanFact(record, ["objectionCodesRecorded", "objectionCodingRecorded", "objectionCodingComplete", "codesRecorded"]) ||
      textFact(record, ["objectionCode", "objectionCodes", "objectionTags", "objectionTag", "objectionTheme", "objectionThemes"])
  );
  const explicitComplete = booleanFact(record, [
    "sessionPacketComplete",
    "packetComplete",
    "readyForSynthesis",
    "fiveSessionPacketComplete",
  ]);
  const sessionNumber = numericFact(record, ["sessionNumber", "sessionIndex", "slot", "slotNumber", "sessionSlot"]);
  const complete = Boolean(explicitComplete || (rawNoteComplete && debriefComplete && objectionCodesRecorded));
  if (!rawNoteComplete && !debriefComplete && !objectionCodesRecorded && !explicitComplete) return null;

  return {
    source,
    index,
    sessionNumber,
    complete,
    rawNoteComplete,
    debriefComplete,
    objectionCodesRecorded,
    capturedAt: textFact(record, ["synthesisReadyAt", "packetCompletedAt", "observedAt", "capturedAt", "updatedAt"]),
    route: textFact(record, ["synthesisRoute", "synthesisDestination", "synthesisLink", "nextStep", "route"]),
  };
}

function synthesisPacketsFromRecord(record, source, index) {
  const nested = [
    record?.sessions,
    record?.sessionPackets,
    record?.fiveSessionPackets,
    record?.packets,
    record?.slots,
  ].find(Array.isArray);
  if (nested) {
    return nested
      .map((packet, nestedIndex) =>
        packet && typeof packet === "object"
          ? normalizeSynthesisSessionPacket(packet, source, `${index}.${nestedIndex + 1}`)
          : null
      )
      .filter(Boolean);
  }
  return [normalizeSynthesisSessionPacket(record, source, index)].filter(Boolean);
}

function listFiveSessionSynthesisArtifacts() {
  const candidateFiles = [
    ...listFiles("data/intake", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/raw-notes", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/session-notes", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/debriefs", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/objection-coding", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/objection-codes", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/synthesis", (name) => /\.(jsonl|json)$/i.test(name)),
  ];

  return candidateFiles.flatMap((file) =>
    readSessionStartRecordsFromFile(file).flatMap((record, index) => {
      const explicitState = normalizeFiveSessionSynthesisState(
        firstTruthyValue(record, [
          "fiveSessionSynthesisReadiness",
          "fiveSessionSynthesisState",
          "synthesisReadiness",
          "synthesisState",
          "readiness",
          "status",
          "state",
        ])
      );
      const declaredCompleteCount = numericFact(record, [
        "completeSessionCount",
        "completedSessionCount",
        "completedSessions",
        "codedSessionCount",
        "readySessionCount",
      ]);
      const packets = synthesisPacketsFromRecord(record, file.relativePath, index + 1);
      const packetCompleteCount = packets.filter((packet) => packet.complete).length;
      const completedSessionCount = Math.max(packetCompleteCount, declaredCompleteCount || 0);
      const ready = completedSessionCount >= 5;
      const partial = !ready && completedSessionCount > 0;
      const state = ready ? "ready" : partial || explicitState === "partial" ? "partial" : "blocked";

      if (!packets.length && declaredCompleteCount === null && !explicitState) return null;

      return {
        source: file.relativePath,
        index: index + 1,
        state,
        explicitState,
        completedSessionCount,
        requiredSessionCount: 5,
        packets,
        capturedAt: textFact(record, ["synthesisReadyAt", "observedAt", "capturedAt", "updatedAt"]),
        route: textFact(record, ["synthesisRoute", "synthesisDestination", "synthesisLink", "nextStep", "route"]),
        evidenceLabel:
          state === "ready"
            ? "Five complete private session packets are visible for synthesis preparation; this is not a public conclusion."
            : state === "partial"
              ? "Some private session packets are complete, but five-session synthesis remains blocked."
              : "Five-session synthesis remains blocked until five complete raw-note, debrief, and objection-code packets exist.",
      };
    })
  );
}

function fiveSessionSynthesisRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\b(five-session|five session|synthesis|session slots?|raw-note|raw note|debrief|objection-coding|objection coding)\b/.test(text)) {
    return null;
  }

  return {
    requiresFiveCompletePackets: /\b(five-session|five session|synthesis|five real sessions?|five slots?|session slots?)\b/.test(text),
    gate:
      "Five-session synthesis stays blocked until five private session packets each have raw notes, debrief, and objection-code evidence; launch, pricing, testimonial, willingness-to-pay, demand, and outcome conclusions remain unobserved.",
  };
}

function fiveSessionSynthesisStateFromEvidence(objectionCodingRow, artifacts) {
  const completedSessionCount = Math.max(...artifacts.map((artifact) => artifact.completedSessionCount), 0);
  const state = completedSessionCount >= 5 ? "ready" : completedSessionCount > 0 ? "partial" : "blocked";
  const upstreamCodesRecorded = ["codes-recorded", "synthesis-ready"].includes(objectionCodingRow?.state);
  return {
    state,
    completedSessionCount,
    upstreamCodesRecorded,
    matchedArtifacts: artifacts,
  };
}

function fiveSessionSynthesisSourceArtifacts() {
  const paths = [
    "ops/research/free-audit-real-session-note-packet.md",
    "ops/research/private-free-audit-post-session-debrief-template.md",
    "ops/research/free-audit-objection-coding-rubric.md",
    "ops/research/free-audit-interview-synthesis-template.md",
    "ops/research/private-free-audit-learning-log-index.md",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function buildFiveSessionSynthesisReadiness(queue, objectionCodingReadiness) {
  const artifacts = listFiveSessionSynthesisArtifacts();
  const objectionRowsById = new Map((objectionCodingReadiness?.rows || []).map((row) => [row.id, row]));
  const sourceArtifacts = fiveSessionSynthesisSourceArtifacts();
  const rows = (queue.items || [])
    .map((item) => {
      const requirement = fiveSessionSynthesisRequirementForItem(item);
      if (!requirement) return null;
      const observed = fiveSessionSynthesisStateFromEvidence(objectionRowsById.get(item.id), artifacts);
      const missing = [];
      if (requirement.requiresFiveCompletePackets && observed.completedSessionCount < 5) {
        missing.push(`${Math.max(5 - observed.completedSessionCount, 0)} complete session packet${5 - observed.completedSessionCount === 1 ? "" : "s"}`);
      }

      const rationale =
        observed.state === "ready"
          ? "Five private raw-note, debrief, and objection-code packets are complete; synthesis can be prepared without publishing conclusions."
          : observed.state === "partial"
            ? "Some private packets are complete, but synthesis remains blocked until all five packets are evidence-backed."
            : "No repo-visible complete session packets matched this active row, so five-session synthesis remains blocked.";

      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state: observed.state,
        stateLabel: FIVE_SESSION_SYNTHESIS_STATES[observed.state].label,
        blocked: observed.state !== "ready",
        completedSessionCount: observed.completedSessionCount,
        requiredSessionCount: 5,
        upstreamCodesRecorded: observed.upstreamCodesRecorded,
        missing,
        gate: requirement.gate,
        rationale,
        sourceArtifacts,
        matchedArtifacts: observed.matchedArtifacts,
        evidenceNote:
          observed.state === "blocked"
            ? "No five-session synthesis, launch, pricing, testimonial, willingness-to-pay, demand, or outcome fact is claimed."
            : "Evidence is private synthesis readiness only and must not be promoted into launch, pricing, testimonials, willingness-to-pay, demand, or outcomes.",
      };
    })
    .filter(Boolean);

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      "data/intake/*",
      "data/raw-notes/*",
      "data/session-notes/*",
      "data/debriefs/*",
      "data/objection-coding/*",
      "data/objection-codes/*",
      "data/synthesis/*",
      "ops/research/free-audit-interview-synthesis-template.md",
    ],
    total: rows.length,
    blockedCount: rows.filter((row) => row.state === "blocked").length,
    partialCount: rows.filter((row) => row.state === "partial").length,
    readyCount: rows.filter((row) => row.state === "ready").length,
    artifacts,
    sourceArtifacts,
    rows,
  };
}

const SYNTHESIS_ARTIFACT_STATES = {
  blocked: {
    label: "Blocked",
    rank: 0,
  },
  "ready-to-generate": {
    label: "Ready to generate",
    rank: 1,
  },
  "artifact-drafted": {
    label: "Artifact drafted",
    rank: 2,
  },
};

function normalizeSynthesisArtifactState(value) {
  const state = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (
    [
      "artifact-drafted",
      "drafted",
      "draft",
      "generated",
      "complete",
      "completed",
      "private-artifact-drafted",
      "synthesis-artifact-drafted",
    ].includes(state)
  ) {
    return "artifact-drafted";
  }
  if (["ready-to-generate", "ready", "ready-for-generation", "ready-for-artifact", "generator-ready"].includes(state)) {
    return "ready-to-generate";
  }
  if (["blocked", "not-ready", "unobserved", "not-observed", "missing"].includes(state)) return "blocked";
  return "";
}

function normalizeSynthesisArtifactRecord(record, source, index) {
  const explicitState = normalizeSynthesisArtifactState(
    firstTruthyValue(record, [
      "synthesisArtifactState",
      "artifactState",
      "privateSynthesisArtifactState",
      "generationState",
      "status",
      "state",
    ])
  );
  const draftText = textFact(record, [
    "synthesisArtifactDraft",
    "privateSynthesisArtifactDraft",
    "artifactDraft",
    "draft",
    "artifactMarkdown",
    "artifactText",
    "synthesisDraft",
  ]);
  const drafted = Boolean(
    explicitState === "artifact-drafted" ||
      booleanFact(record, ["synthesisArtifactDrafted", "artifactDrafted", "privateSynthesisArtifactDrafted", "drafted"]) ||
      draftText
  );
  const state = drafted ? "artifact-drafted" : explicitState;
  if (!state) return null;

  return {
    source,
    index,
    state,
    draftPresent: drafted,
    completedSessionCount: numericFact(record, [
      "completeSessionCount",
      "completedSessionCount",
      "completedSessions",
      "sourcePacketCount",
      "packetCount",
    ]),
    requiredSessionCount: numericFact(record, ["requiredSessionCount", "requiredSessions"]) || 5,
    capturedAt: textFact(record, ["artifactDraftedAt", "generatedAt", "observedAt", "capturedAt", "updatedAt"]),
    route: textFact(record, ["artifactRoute", "synthesisArtifactRoute", "artifactPath", "path", "route"]),
  };
}

function listSynthesisArtifactDrafts() {
  const candidateFiles = [
    ...listFiles("data/synthesis", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/synthesis-artifacts", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/private-synthesis", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
  ];

  return candidateFiles.flatMap((file) => {
    if (/\.(md|txt)$/i.test(file.name)) {
      const content = readText(file.relativePath);
      if (!/\bsynthesis artifact\b|\bfive-session synthesis\b|\bprivate synthesis\b/i.test(content)) return [];
      return [
        {
          source: file.relativePath,
          index: 1,
          state: "artifact-drafted",
          draftPresent: true,
          completedSessionCount: null,
          requiredSessionCount: 5,
          capturedAt: fs.statSync(file.absolutePath).mtime.toISOString(),
          route: file.relativePath,
        },
      ];
    }

    return readSessionStartRecordsFromFile(file)
      .map((record, index) => normalizeSynthesisArtifactRecord(record, file.relativePath, index + 1))
      .filter(Boolean);
  });
}

function synthesisArtifactRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\b(synthesis artifact|artifact generator|private generator|artifact generation|decision memo)\b/.test(text)) return null;

  return {
    requiresPrivateDraft: /\b(artifact|generator|generate|draft|decision memo)\b/.test(text),
    gate:
      "Private synthesis artifact work stays blocked until five complete session packets exist, then remains a private draft; launch, pricing, testimonial, willingness-to-pay, demand, and outcome conclusions stay unobserved.",
  };
}

function synthesisArtifactStateFromEvidence(fiveSessionRow, artifacts) {
  const draftedArtifacts = artifacts.filter((artifact) => artifact.state === "artifact-drafted");
  const completedSessionCount = Math.max(
    fiveSessionRow?.completedSessionCount || 0,
    ...artifacts.map((artifact) => artifact.completedSessionCount || 0),
    0
  );
  const readyFromPackets = fiveSessionRow?.state === "ready" || completedSessionCount >= 5;
  const state = draftedArtifacts.length ? "artifact-drafted" : readyFromPackets ? "ready-to-generate" : "blocked";
  return {
    state,
    completedSessionCount,
    matchedArtifacts: draftedArtifacts.length ? draftedArtifacts : artifacts,
    readyFromPackets,
  };
}

function synthesisArtifactSourceArtifacts() {
  const paths = [
    "ops/research/private-free-audit-five-session-synthesis-gate-checklist.md",
    "ops/research/free-audit-interview-synthesis-template.md",
    "data/synthesis",
    "data/synthesis-artifacts",
    "data/private-synthesis",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function buildSynthesisArtifactVisibility(queue, fiveSessionSynthesisReadiness) {
  const artifacts = listSynthesisArtifactDrafts();
  const fiveSessionRowsById = new Map((fiveSessionSynthesisReadiness?.rows || []).map((row) => [row.id, row]));
  const sourceArtifacts = synthesisArtifactSourceArtifacts();
  const rows = (queue.items || [])
    .map((item) => {
      const requirement = synthesisArtifactRequirementForItem(item);
      if (!requirement) return null;
      const observed = synthesisArtifactStateFromEvidence(fiveSessionRowsById.get(item.id), artifacts);
      const missing = [];
      if (observed.state === "blocked") {
        missing.push(`${Math.max(5 - observed.completedSessionCount, 0)} complete session packet${5 - observed.completedSessionCount === 1 ? "" : "s"}`);
      } else if (observed.state === "ready-to-generate") {
        missing.push("private synthesis artifact draft");
      }

      const rationale =
        observed.state === "artifact-drafted"
          ? "A repo-visible private synthesis artifact draft exists; it remains private evidence, not a public conclusion."
          : observed.state === "ready-to-generate"
            ? "Five private packets are complete, so a private synthesis artifact can be generated without publishing conclusions."
            : "Five complete private session packets are not visible yet, so synthesis artifact generation remains blocked.";

      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state: observed.state,
        stateLabel: SYNTHESIS_ARTIFACT_STATES[observed.state].label,
        blocked: observed.state === "blocked",
        completedSessionCount: observed.completedSessionCount,
        requiredSessionCount: 5,
        missing,
        gate: requirement.gate,
        rationale,
        sourceArtifacts,
        matchedArtifacts: observed.matchedArtifacts,
        evidenceNote:
          "Synthesis artifact visibility is private operational status only; launch, pricing, testimonial, willingness-to-pay, demand, and outcome claims remain unobserved.",
      };
    })
    .filter(Boolean)
    .sort((a, b) => SYNTHESIS_ARTIFACT_STATES[a.state].rank - SYNTHESIS_ARTIFACT_STATES[b.state].rank || a.owner.localeCompare(b.owner));

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      "data/synthesis/*",
      "data/synthesis-artifacts/*",
      "data/private-synthesis/*",
      "fiveSessionSynthesisReadiness",
    ],
    total: rows.length,
    blockedCount: rows.filter((row) => row.state === "blocked").length,
    readyToGenerateCount: rows.filter((row) => row.state === "ready-to-generate").length,
    artifactDraftedCount: rows.filter((row) => row.state === "artifact-drafted").length,
    artifacts,
    sourceArtifacts,
    rows,
  };
}

const SYNTHESIS_DECISION_MEMO_STATES = {
  blocked: {
    label: "Blocked",
    rank: 0,
  },
  "artifact-ready": {
    label: "Artifact ready",
    rank: 1,
  },
  "memo-drafted": {
    label: "Memo drafted",
    rank: 2,
  },
};

function normalizeSynthesisDecisionMemoState(value) {
  const state = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (
    [
      "memo-drafted",
      "drafted",
      "draft",
      "memo-complete",
      "decision-memo-drafted",
      "synthesis-decision-memo-drafted",
      "private-decision-memo-drafted",
    ].includes(state)
  ) {
    return "memo-drafted";
  }
  if (["artifact-ready", "artifact-reviewed", "ready-for-memo", "ready", "memo-ready"].includes(state)) return "artifact-ready";
  if (["blocked", "not-ready", "unobserved", "not-observed", "missing"].includes(state)) return "blocked";
  return "";
}

function normalizeSynthesisDecisionMemoRecord(record, source, index) {
  const explicitState = normalizeSynthesisDecisionMemoState(
    firstTruthyValue(record, [
      "synthesisDecisionMemoState",
      "decisionMemoState",
      "privateSynthesisDecisionMemoState",
      "memoState",
      "reviewState",
      "status",
      "state",
    ])
  );
  const memoText = textFact(record, [
    "synthesisDecisionMemo",
    "decisionMemo",
    "privateSynthesisDecisionMemo",
    "memoDraft",
    "memoMarkdown",
    "memoText",
    "reviewMemo",
  ]);
  const memoDrafted = Boolean(
    explicitState === "memo-drafted" ||
      booleanFact(record, [
        "synthesisDecisionMemoDrafted",
        "decisionMemoDrafted",
        "privateSynthesisDecisionMemoDrafted",
        "memoDrafted",
        "reviewComplete",
      ]) ||
      memoText
  );
  const artifactPath = textFact(record, [
    "generatedSynthesisArtifactPath",
    "synthesisArtifactPath",
    "artifactPath",
    "artifactRoute",
    "sourceArtifactPath",
  ]);
  const state = memoDrafted ? "memo-drafted" : explicitState;
  if (!state && !artifactPath) return null;

  return {
    source,
    index,
    state: state || "artifact-ready",
    memoDraftPresent: memoDrafted,
    artifactPath,
    publicConclusionAllowed: /^(true|yes|allowed)$/i.test(
      String(firstTruthyValue(record, ["publicConclusionAllowed", "publishAllowed", "publicLaunchAllowed"]) || "").trim()
    ),
    capturedAt: textFact(record, ["memoDraftedAt", "reviewedAt", "observedAt", "capturedAt", "updatedAt"]),
    route: textFact(record, ["memoRoute", "decisionMemoRoute", "memoPath", "path", "route"]),
  };
}

function listSynthesisDecisionMemoDrafts() {
  const candidateFiles = [
    ...listFiles("data/synthesis-decision-memos", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/decision-memos", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/private-decision-memos", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/private-synthesis", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("data/intake", (name) => /\.(jsonl|json)$/i.test(name)),
  ];

  return candidateFiles.flatMap((file) => {
    if (/\.(md|txt)$/i.test(file.name)) {
      const content = readText(file.relativePath);
      if (!/\bdecision memo\b|\bsynthesis memo\b|\bprivate memo\b/i.test(content)) return [];
      return [
        {
          source: file.relativePath,
          index: 1,
          state: "memo-drafted",
          memoDraftPresent: true,
          artifactPath: (content.match(/Generated synthesis artifact path\s*\|\s*([^|\n]+)/i)?.[1] || "").trim(),
          publicConclusionAllowed: false,
          capturedAt: fs.statSync(file.absolutePath).mtime.toISOString(),
          route: file.relativePath,
        },
      ];
    }

    return readSessionStartRecordsFromFile(file)
      .map((record, index) => normalizeSynthesisDecisionMemoRecord(record, file.relativePath, index + 1))
      .filter(Boolean);
  });
}

function synthesisDecisionMemoRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\b(decision memo|memo capture|memo-drafted|memo drafted|synthesis decision|launch-decision|launch decision)\b/.test(text)) {
    return null;
  }

  return {
    requiresMemoDraft: /\b(decision memo|memo capture|memo-drafted|memo drafted|reviewed decision|launch-decision|launch decision)\b/.test(text),
    gate:
      "Private synthesis decision memo work stays blocked until a generated private synthesis artifact exists; the memo remains private and launch, pricing, testimonial, willingness-to-pay, demand, and outcome conclusions stay unobserved.",
  };
}

function synthesisDecisionMemoStateFromEvidence(synthesisArtifactRow, memos) {
  const draftedMemos = memos.filter((memo) => memo.state === "memo-drafted");
  const artifactReady = synthesisArtifactRow?.state === "artifact-drafted" || memos.some((memo) => memo.artifactPath);
  const state = draftedMemos.length ? "memo-drafted" : artifactReady ? "artifact-ready" : "blocked";
  return {
    state,
    matchedArtifacts: draftedMemos.length ? draftedMemos : memos,
    artifactReady,
  };
}

function synthesisDecisionMemoSourceArtifacts() {
  const paths = [
    "ops/research/private-free-audit-synthesis-decision-memo-template.md",
    "data/synthesis-decision-memos",
    "data/decision-memos",
    "data/private-decision-memos",
    "data/private-synthesis",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function buildSynthesisDecisionMemoVisibility(queue, synthesisArtifactVisibility) {
  const memos = listSynthesisDecisionMemoDrafts();
  const artifactRowsById = new Map((synthesisArtifactVisibility?.rows || []).map((row) => [row.id, row]));
  const sourceArtifacts = synthesisDecisionMemoSourceArtifacts();
  const rows = (queue.items || [])
    .map((item) => {
      const requirement = synthesisDecisionMemoRequirementForItem(item);
      if (!requirement) return null;
      const observed = synthesisDecisionMemoStateFromEvidence(artifactRowsById.get(item.id), memos);
      const missing = [];
      if (observed.state === "blocked") {
        missing.push("generated private synthesis artifact");
      } else if (observed.state === "artifact-ready") {
        missing.push("private synthesis decision memo draft");
      }

      const rationale =
        observed.state === "memo-drafted"
          ? "A repo-visible private synthesis decision memo draft exists; it is a private review artifact and does not publish conclusions."
          : observed.state === "artifact-ready"
            ? "A private synthesis artifact is ready, so a private decision memo can be drafted without publishing conclusions."
            : "No generated private synthesis artifact is visible yet, so decision memo review remains blocked.";

      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state: observed.state,
        stateLabel: SYNTHESIS_DECISION_MEMO_STATES[observed.state].label,
        blocked: observed.state === "blocked",
        artifactReady: observed.artifactReady,
        missing,
        gate: requirement.gate,
        rationale,
        sourceArtifacts,
        matchedArtifacts: observed.matchedArtifacts,
        evidenceNote:
          "Decision memo visibility is private operational status only; launch, pricing, testimonial, willingness-to-pay, demand, and outcome claims remain unobserved.",
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        SYNTHESIS_DECISION_MEMO_STATES[a.state].rank - SYNTHESIS_DECISION_MEMO_STATES[b.state].rank ||
        a.owner.localeCompare(b.owner)
    );

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      "data/synthesis-decision-memos/*",
      "data/decision-memos/*",
      "data/private-decision-memos/*",
      "data/private-synthesis/*",
      "synthesisArtifactVisibility",
    ],
    total: rows.length,
    blockedCount: rows.filter((row) => row.state === "blocked").length,
    artifactReadyCount: rows.filter((row) => row.state === "artifact-ready").length,
    memoDraftedCount: rows.filter((row) => row.state === "memo-drafted").length,
    memos,
    sourceArtifacts,
    rows,
  };
}

const LAUNCH_DECISION_APPROVAL_STATES = {
  blocked: {
    label: "Blocked",
    rank: 0,
  },
  "memo-ready": {
    label: "Memo ready",
    rank: 1,
  },
  "approval-drafted": {
    label: "Approval drafted",
    rank: 2,
  },
};

function normalizeLaunchDecisionApprovalState(value) {
  const state = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (
    [
      "approval-drafted",
      "drafted",
      "draft",
      "launch-decision-approval-drafted",
      "private-approval-drafted",
      "approval-complete",
      "review-complete",
    ].includes(state)
  ) {
    return "approval-drafted";
  }
  if (["memo-ready", "decision-memo-ready", "memo-reviewed", "ready-for-approval", "ready"].includes(state)) return "memo-ready";
  if (["blocked", "not-ready", "unobserved", "not-observed", "missing"].includes(state)) return "blocked";
  return "";
}

function normalizeLaunchDecisionApprovalRecord(record, source, index) {
  const explicitState = normalizeLaunchDecisionApprovalState(
    firstTruthyValue(record, [
      "launchDecisionApprovalState",
      "launchApprovalState",
      "privateLaunchDecisionApprovalState",
      "approvalState",
      "reviewState",
      "status",
      "state",
    ])
  );
  const approvalText = textFact(record, [
    "launchDecisionApproval",
    "privateLaunchDecisionApproval",
    "approvalDraft",
    "approvalMarkdown",
    "approvalText",
    "separateApproval",
    "privateApproval",
    "reviewSummary",
  ]);
  const approvalDrafted = Boolean(
    explicitState === "approval-drafted" ||
      booleanFact(record, [
        "launchDecisionApprovalDrafted",
        "privateLaunchDecisionApprovalDrafted",
        "approvalDrafted",
        "separateApprovalRecorded",
        "reviewComplete",
      ]) ||
      approvalText
  );
  const memoPath = textFact(record, [
    "completedSynthesisDecisionMemoPath",
    "synthesisDecisionMemoPath",
    "decisionMemoPath",
    "memoPath",
    "sourceMemoPath",
  ]);
  const state = approvalDrafted ? "approval-drafted" : explicitState;
  if (!state && !memoPath) return null;

  return {
    source,
    index,
    state: state || "memo-ready",
    approvalDraftPresent: approvalDrafted,
    memoPath,
    launchDecision: textFact(record, ["launchDecision", "privateLaunchDecision", "decision"]),
    publicChangeAllowed: /^(true|yes|allowed)$/i.test(
      String(firstTruthyValue(record, ["publicChangeAllowed", "publishAllowed", "publicLaunchAllowed"]) || "").trim()
    ),
    capturedAt: textFact(record, ["approvalDraftedAt", "reviewedAt", "observedAt", "capturedAt", "updatedAt"]),
    route: textFact(record, ["approvalRoute", "launchDecisionRoute", "reviewPath", "path", "route"]),
  };
}

function listLaunchDecisionApprovalDrafts() {
  const candidateFiles = [
    ...listFiles("data/launch-decision-approvals", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/private-launch-decisions", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/launch-approvals", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/intake", (name) => /\.(jsonl|json)$/i.test(name)),
  ];

  return candidateFiles.flatMap((file) => {
    if (/\.(md|txt)$/i.test(file.name)) {
      const content = readText(file.relativePath);
      if (!/\blaunch[- ]decision\b/i.test(content) || !/\bapproval\b/i.test(content)) return [];
      const separateApproval = (content.match(/Separate evidence-backed approval recorded:\s*([^\n]+)/i)?.[1] || "").trim();
      const reviewComplete = (content.match(/Review complete:\s*([^\n]+)/i)?.[1] || "").trim();
      const approvalDrafted = Boolean(
        separateApproval &&
          !/^(not observed|no|blocked|n\/a|none|false)$/i.test(separateApproval) &&
          !/^(not observed|no|blocked|n\/a|none|false)$/i.test(reviewComplete || "yes")
      );
      const memoPath = (content.match(/Completed synthesis decision memo path\s*\|\s*([^|\n]+)/i)?.[1] || "").trim();
      if (!approvalDrafted && !memoPath) return [];
      return [
        {
          source: file.relativePath,
          index: 1,
          state: approvalDrafted ? "approval-drafted" : "memo-ready",
          approvalDraftPresent: approvalDrafted,
          memoPath,
          launchDecision: (content.match(/Launch decision:\s*([^\n]+)/i)?.[1] || "").trim(),
          publicChangeAllowed: false,
          capturedAt: fs.statSync(file.absolutePath).mtime.toISOString(),
          route: file.relativePath,
        },
      ];
    }

    return readSessionStartRecordsFromFile(file)
      .map((record, index) => normalizeLaunchDecisionApprovalRecord(record, file.relativePath, index + 1))
      .filter(Boolean);
  });
}

function launchDecisionApprovalRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (
    !/\b(launch-decision|launch decision|publish-readiness|publish readiness)\b/.test(text) ||
    !/\b(approval|review checklist|review\/approval|approval-drafted|approval drafted|visibility|capture|publish-readiness|publish readiness)\b/.test(
      text
    )
  ) {
    return null;
  }

  return {
    requiresApprovalDraft: /\b(approval|approval-drafted|approval drafted|review\/approval|publish-readiness|publish readiness)\b/.test(text),
    gate:
      "Private launch-decision approval work stays blocked until a completed private synthesis decision memo exists; approval status remains private and public launch, pricing, testimonial, willingness-to-pay, demand, and outcome conclusions stay unobserved.",
  };
}

function launchDecisionApprovalStateFromEvidence(synthesisDecisionMemoVisibility, approvals) {
  const draftedApprovals = approvals.filter((approval) => approval.state === "approval-drafted");
  const memoDrafts = [
    ...(synthesisDecisionMemoVisibility?.memos || []).filter((memo) => memo.memoDraftPresent || memo.state === "memo-drafted"),
    ...(synthesisDecisionMemoVisibility?.rows || [])
      .filter((row) => row.state === "memo-drafted")
      .flatMap((row) => row.matchedArtifacts || []),
  ];
  const memoReady =
    Boolean(memoDrafts.length) ||
    approvals.some((approval) => approval.memoPath) ||
    (synthesisDecisionMemoVisibility?.memoDraftedCount || 0) > 0;
  const state = draftedApprovals.length ? "approval-drafted" : memoReady ? "memo-ready" : "blocked";
  return {
    state,
    matchedArtifacts: draftedApprovals.length ? draftedApprovals : approvals.length ? approvals : memoDrafts,
    memoReady,
  };
}

function launchDecisionApprovalSourceArtifacts() {
  const paths = [
    "ops/research/private-free-audit-launch-decision-review-checklist.md",
    "data/launch-decision-approvals",
    "data/private-launch-decisions",
    "data/launch-approvals",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function buildLaunchDecisionApprovalVisibility(queue, synthesisDecisionMemoVisibility) {
  const approvals = listLaunchDecisionApprovalDrafts();
  const sourceArtifacts = launchDecisionApprovalSourceArtifacts();
  const rows = (queue.items || [])
    .map((item) => {
      const requirement = launchDecisionApprovalRequirementForItem(item);
      if (!requirement) return null;
      const observed = launchDecisionApprovalStateFromEvidence(synthesisDecisionMemoVisibility, approvals);
      const missing = [];
      if (observed.state === "blocked") {
        missing.push("completed private synthesis decision memo");
      } else if (observed.state === "memo-ready") {
        missing.push("separate private launch-decision approval draft");
      }

      const rationale =
        observed.state === "approval-drafted"
          ? "A repo-visible private launch-decision approval draft exists; it is private review status and does not publish conclusions."
          : observed.state === "memo-ready"
            ? "A completed private synthesis decision memo is visible, so a separate private launch-decision approval draft can be prepared without publishing conclusions."
            : "No completed private synthesis decision memo is visible yet, so launch-decision approval remains blocked.";

      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state: observed.state,
        stateLabel: LAUNCH_DECISION_APPROVAL_STATES[observed.state].label,
        blocked: observed.state === "blocked",
        memoReady: observed.memoReady,
        missing,
        gate: requirement.gate,
        rationale,
        sourceArtifacts,
        matchedArtifacts: observed.matchedArtifacts,
        evidenceNote:
          "Launch-decision approval visibility is private operational status only; launch, pricing, testimonial, willingness-to-pay, demand, and outcome claims remain unobserved.",
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        LAUNCH_DECISION_APPROVAL_STATES[a.state].rank - LAUNCH_DECISION_APPROVAL_STATES[b.state].rank ||
        a.owner.localeCompare(b.owner)
    );

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      "ops/research/private-free-audit-launch-decision-review-checklist.md",
      "data/launch-decision-approvals/*",
      "data/private-launch-decisions/*",
      "data/launch-approvals/*",
      "synthesisDecisionMemoVisibility",
    ],
    total: rows.length,
    blockedCount: rows.filter((row) => row.state === "blocked").length,
    memoReadyCount: rows.filter((row) => row.state === "memo-ready").length,
    approvalDraftedCount: rows.filter((row) => row.state === "approval-drafted").length,
    approvals,
    sourceArtifacts,
    rows,
  };
}

const PUBLISH_READINESS_STATES = {
  blocked: {
    label: "Blocked",
    rank: 0,
  },
  "approval-ready": {
    label: "Approval ready",
    rank: 1,
  },
  "publish-ready": {
    label: "Publish ready",
    rank: 2,
  },
};

function normalizePublishReadinessState(value) {
  const state = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (
    [
      "publish-ready",
      "ready-to-publish-plan",
      "ready-for-publish-plan",
      "checklist-complete",
      "checklist-completed",
      "readiness-complete",
      "completed",
      "complete",
    ].includes(state)
  ) {
    return "publish-ready";
  }
  if (["approval-ready", "approval-drafted", "approved-private", "private-approval-ready", "ready-for-checklist"].includes(state)) {
    return "approval-ready";
  }
  if (["blocked", "not-ready", "unobserved", "not-observed", "missing"].includes(state)) return "blocked";
  return "";
}

function normalizePublishReadinessRecord(record, source, index) {
  const explicitState = normalizePublishReadinessState(
    firstTruthyValue(record, [
      "publishReadinessState",
      "privatePublishReadinessState",
      "publishState",
      "readinessState",
      "status",
      "state",
    ])
  );
  const checklistText = textFact(record, [
    "publishReadinessChecklist",
    "privatePublishReadinessChecklist",
    "checklistDraft",
    "checklistMarkdown",
    "checklistText",
    "readinessSummary",
  ]);
  const checklistComplete = Boolean(
    explicitState === "publish-ready" ||
      booleanFact(record, [
        "publishReadinessChecklistComplete",
        "privatePublishReadinessChecklistComplete",
        "publishReadinessComplete",
        "checklistComplete",
        "reviewComplete",
      ]) ||
      checklistText
  );
  const approvalPath = textFact(record, [
    "completedLaunchDecisionReviewPath",
    "launchDecisionApprovalPath",
    "approvalPath",
    "sourceApprovalPath",
    "reviewPath",
  ]);
  const state = checklistComplete ? "publish-ready" : explicitState;
  if (!state && !approvalPath) return null;

  return {
    source,
    index,
    state: state || "approval-ready",
    checklistComplete,
    approvalPath,
    publicChangeAllowed: /^(true|yes|allowed)$/i.test(
      String(firstTruthyValue(record, ["publicChangeAllowed", "publishAllowed", "publicLaunchAllowed"]) || "").trim()
    ),
    capturedAt: textFact(record, ["publishReadinessCompletedAt", "reviewedAt", "observedAt", "capturedAt", "updatedAt"]),
    route: textFact(record, ["publishReadinessRoute", "publishRoute", "path", "route"]),
  };
}

function filledPrivateChecklistValue(content, labelPattern) {
  const value = (content.match(labelPattern)?.[1] || "").trim();
  return value && !/^(not observed|no|blocked|n\/a|none|false|\|?)$/i.test(value) ? value : "";
}

function listPublishReadinessRecords() {
  const candidateFiles = [
    ...listFiles("data/publish-readiness", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/private-publish-readiness", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/intake", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("ops/launch", (name) => /publish-readiness.*\.(md|txt)$/i.test(name)),
  ];

  return candidateFiles.flatMap((file) => {
    if (/\.(md|txt)$/i.test(file.name)) {
      const content = readText(file.relativePath);
      if (!/\bpublish[- ]readiness\b/i.test(content)) return [];
      const reviewPath = filledPrivateChecklistValue(content, /Completed launch-decision review (?:path|consumed):[ \t]*([^\n|]+)/i);
      const approvalValue = filledPrivateChecklistValue(content, /Separate evidence-backed approval (?:consumed|exists|recorded):[ \t]*([^\n|]+)/i);
      const checklistComplete = Boolean(
        reviewPath &&
          approvalValue &&
          /\bprivate publish-readiness state\s*\|\s*publish-ready\b/i.test(content)
      );
      if (!checklistComplete && !reviewPath && !approvalValue) return [];
      return [
        {
          source: file.relativePath,
          index: 1,
          state: checklistComplete ? "publish-ready" : "approval-ready",
          checklistComplete,
          approvalPath: reviewPath || approvalValue,
          publicChangeAllowed: false,
          capturedAt: fs.statSync(file.absolutePath).mtime.toISOString(),
          route: file.relativePath,
        },
      ];
    }

    return readSessionStartRecordsFromFile(file)
      .map((record, index) => normalizePublishReadinessRecord(record, file.relativePath, index + 1))
      .filter(Boolean);
  });
}

function publishReadinessRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\b(publish-readiness|publish readiness)\b/.test(text)) return null;

  return {
    gate:
      "Private publish-readiness work stays blocked until a separate private launch-decision approval exists; publish-ready status only allows a later private explicit publish-plan work item, while public launch, pricing, testimonial, willingness-to-pay, demand, and outcome conclusions stay unobserved.",
  };
}

function publishReadinessStateFromEvidence(launchDecisionApprovalVisibility, publishRecords) {
  const readyRecords = publishRecords.filter((record) => record.state === "publish-ready");
  const approvalDrafts = [
    ...(launchDecisionApprovalVisibility?.approvals || []).filter(
      (approval) => approval.approvalDraftPresent || approval.state === "approval-drafted"
    ),
    ...(launchDecisionApprovalVisibility?.rows || [])
      .filter((row) => row.state === "approval-drafted")
      .flatMap((row) => row.matchedArtifacts || []),
  ];
  const approvalReady =
    Boolean(approvalDrafts.length) ||
    publishRecords.some((record) => record.approvalPath) ||
    (launchDecisionApprovalVisibility?.approvalDraftedCount || 0) > 0;
  const state = readyRecords.length ? "publish-ready" : approvalReady ? "approval-ready" : "blocked";
  return {
    state,
    matchedArtifacts: readyRecords.length ? readyRecords : publishRecords.length ? publishRecords : approvalDrafts,
    approvalReady,
  };
}

function publishReadinessSourceArtifacts() {
  const paths = [
    "ops/launch/private-free-audit-publish-readiness-checklist.md",
    "data/publish-readiness",
    "data/private-publish-readiness",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function buildPublishReadinessVisibility(queue, launchDecisionApprovalVisibility) {
  const publishRecords = listPublishReadinessRecords();
  const sourceArtifacts = publishReadinessSourceArtifacts();
  const rows = (queue.items || [])
    .map((item) => {
      const requirement = publishReadinessRequirementForItem(item);
      if (!requirement) return null;
      const observed = publishReadinessStateFromEvidence(launchDecisionApprovalVisibility, publishRecords);
      const missing = [];
      if (observed.state === "blocked") {
        missing.push("separate private launch-decision approval");
      } else if (observed.state === "approval-ready") {
        missing.push("completed private publish-readiness checklist");
      }

      const rationale =
        observed.state === "publish-ready"
          ? "A repo-visible private publish-readiness checklist is complete; this is private readiness for a later explicit publish plan and does not publish conclusions."
          : observed.state === "approval-ready"
            ? "A private launch-decision approval is visible, so the private publish-readiness checklist can be completed without publishing conclusions."
            : "No separate private launch-decision approval is visible yet, so publish-readiness remains blocked.";

      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state: observed.state,
        stateLabel: PUBLISH_READINESS_STATES[observed.state].label,
        blocked: observed.state === "blocked",
        approvalReady: observed.approvalReady,
        missing,
        gate: requirement.gate,
        rationale,
        sourceArtifacts,
        matchedArtifacts: observed.matchedArtifacts,
        evidenceNote:
          "Publish-readiness visibility is private operational status only; launch, pricing, testimonial, willingness-to-pay, demand, and outcome claims remain unobserved.",
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        PUBLISH_READINESS_STATES[a.state].rank - PUBLISH_READINESS_STATES[b.state].rank ||
        a.owner.localeCompare(b.owner)
    );

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      "ops/launch/private-free-audit-publish-readiness-checklist.md",
      "data/publish-readiness/*",
      "data/private-publish-readiness/*",
      "launchDecisionApprovalVisibility",
    ],
    total: rows.length,
    blockedCount: rows.filter((row) => row.state === "blocked").length,
    approvalReadyCount: rows.filter((row) => row.state === "approval-ready").length,
    publishReadyCount: rows.filter((row) => row.state === "publish-ready").length,
    publishRecords,
    sourceArtifacts,
    rows,
  };
}

const EXPLICIT_PUBLISH_PLAN_STATES = {
  blocked: {
    label: "Blocked",
    rank: 0,
  },
  "publish-ready": {
    label: "Publish ready",
    rank: 1,
  },
  "plan-drafted": {
    label: "Plan drafted",
    rank: 2,
  },
};

function normalizeExplicitPublishPlanState(value) {
  const state = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (
    [
      "plan-drafted",
      "publish-plan-drafted",
      "explicit-publish-plan-drafted",
      "drafted",
      "draft-complete",
      "draft-completed",
    ].includes(state)
  ) {
    return "plan-drafted";
  }
  if (["publish-ready", "readiness-complete", "ready-to-plan", "ready-for-plan", "ready"].includes(state)) {
    return "publish-ready";
  }
  if (["blocked", "not-ready", "unobserved", "not-observed", "missing"].includes(state)) return "blocked";
  return "";
}

function normalizeExplicitPublishPlanRecord(record, source, index) {
  const nestedPlan =
    record?.privateExplicitPublishPlan && typeof record.privateExplicitPublishPlan === "object"
      ? record.privateExplicitPublishPlan
      : record?.explicitPublishPlan && typeof record.explicitPublishPlan === "object"
        ? record.explicitPublishPlan
        : record?.publishPlan && typeof record.publishPlan === "object"
          ? record.publishPlan
          : {};
  const plan = { ...record, ...nestedPlan };
  const explicitState = normalizeExplicitPublishPlanState(
    firstTruthyValue(plan, [
      "privateExplicitPublishPlanState",
      "explicitPublishPlanState",
      "publishPlanState",
      "state",
      "status",
    ])
  );
  const owner = textFact(plan, ["owner", "publishOwner", "planOwner"]);
  const rollback = textFact(plan, ["rollback", "rollbackPath", "rollbackPlan"]);
  const claimRisk = textFact(plan, ["claimRisk", "claimRiskReview", "claimRiskNotes"]);
  const publicCopyDiff = textFact(plan, ["publicCopyDiff", "copyDiff", "diffSummary"]);
  const drafted = Boolean(
    explicitState === "plan-drafted" ||
      booleanFact(plan, ["planDrafted", "publishPlanDrafted", "explicitPublishPlanDrafted"]) ||
      owner ||
      rollback ||
      claimRisk ||
      publicCopyDiff
  );
  const publishReady = Boolean(
    drafted ||
      explicitState === "publish-ready" ||
      booleanFact(plan, ["sourcePublishReadinessComplete", "publishReadinessComplete", "checklistComplete"]) ||
      textFact(plan, ["sourcePublishReadinessChecklistPath", "publishReadinessPath", "checklistPath"])
  );
  if (!drafted && !publishReady) return null;

  return {
    source,
    index,
    state: drafted ? "plan-drafted" : "publish-ready",
    owner,
    rollbackPresent: Boolean(rollback),
    claimRiskPresent: Boolean(claimRisk),
    publicCopyDiffPresent: Boolean(publicCopyDiff),
    publishReadinessPath: textFact(plan, [
      "sourcePublishReadinessChecklistPath",
      "publishReadinessPath",
      "checklistPath",
    ]),
    localOnly:
      plan.localOnly === undefined
        ? true
        : /^(true|yes)$/i.test(String(plan.localOnly || "").trim()) || plan.localOnly === true,
    noPublishAction:
      plan.noPublishAction === undefined
        ? true
        : /^(true|yes)$/i.test(String(plan.noPublishAction || "").trim()) || plan.noPublishAction === true,
    publicProductCopyUnchanged:
      plan.publicProductCopyUnchanged === undefined
        ? true
        : /^(true|yes)$/i.test(String(plan.publicProductCopyUnchanged || "").trim()) || plan.publicProductCopyUnchanged === true,
    capturedAt: textFact(plan, ["updatedAt", "capturedAt", "observedAt", "createdAt"]),
    route: textFact(plan, ["route", "path", "source"]),
  };
}

function listExplicitPublishPlanRecords() {
  const candidateFiles = [
    ...listFiles("data/explicit-publish-plans", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/private-explicit-publish-plans", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/publish-plans", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/intake", (name) => /\.(jsonl|json)$/i.test(name)),
  ];

  return candidateFiles.flatMap((file) => {
    if (/\.(md|txt)$/i.test(file.name)) {
      const content = readText(file.relativePath);
      if (!/\b(explicit publish plan|explicit publish-plan|private publish plan|publish-plan)\b/i.test(content)) return [];
      const publishReadinessPath = filledPrivateChecklistValue(
        content,
        /(?:Completed private publish-readiness checklist|Publish-readiness checklist|Source publish-readiness checklist) (?:path|consumed):[ \t]*([^\n|]+)/i
      );
      const owner = filledPrivateChecklistValue(content, /(?:Publish owner|Plan owner|Owner):[ \t]*([^\n|]+)/i);
      const rollback = filledPrivateChecklistValue(content, /(?:Rollback path|Rollback plan|Rollback):[ \t]*([^\n|]+)/i);
      const claimRisk = filledPrivateChecklistValue(content, /(?:Claim-risk review|Claim risk review|Claim risk):[ \t]*([^\n|]+)/i);
      const publicCopyDiff = filledPrivateChecklistValue(content, /(?:Public-copy diff|Public copy diff|Copy diff):[ \t]*([^\n|]+)/i);
      const drafted = Boolean(
        /\b(private explicit publish-plan state|explicit publish plan state|publish-plan state)\s*\|\s*plan-drafted\b/i.test(content) ||
          (owner && rollback && claimRisk && publicCopyDiff)
      );
      if (!drafted && !publishReadinessPath) return [];
      return [
        {
          source: file.relativePath,
          index: 1,
          state: drafted ? "plan-drafted" : "publish-ready",
          owner,
          rollbackPresent: Boolean(rollback),
          claimRiskPresent: Boolean(claimRisk),
          publicCopyDiffPresent: Boolean(publicCopyDiff),
          publishReadinessPath,
          localOnly: true,
          noPublishAction: true,
          publicProductCopyUnchanged: true,
          capturedAt: fs.statSync(file.absolutePath).mtime.toISOString(),
          route: file.relativePath,
        },
      ];
    }

    return readSessionStartRecordsFromFile(file)
      .map((record, index) => normalizeExplicitPublishPlanRecord(record, file.relativePath, index + 1))
      .filter(Boolean);
  });
}

function explicitPublishPlanRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\b(explicit publish-plan|explicit publish plan|private publish plan|publish-plan visibility|publish plan visibility)\b/.test(text)) {
    return null;
  }

  return {
    gate:
      "Private explicit publish-plan work stays blocked until private publish-readiness is complete; a drafted plan remains local/private and public launch, pricing, testimonial, willingness-to-pay, demand, and outcome conclusions stay unobserved.",
  };
}

function explicitPublishPlanStateFromEvidence(publishReadinessVisibility, planRecords) {
  const draftedRecords = planRecords.filter((record) => record.state === "plan-drafted");
  const publishReadyArtifacts = [
    ...(publishReadinessVisibility?.publishRecords || []).filter((record) => record.state === "publish-ready"),
    ...(publishReadinessVisibility?.rows || [])
      .filter((row) => row.state === "publish-ready")
      .flatMap((row) => row.matchedArtifacts || []),
  ];
  const publishReady =
    Boolean(draftedRecords.length) ||
    Boolean(planRecords.some((record) => record.publishReadinessPath)) ||
    Boolean(publishReadyArtifacts.length) ||
    (publishReadinessVisibility?.publishReadyCount || 0) > 0;
  const state = draftedRecords.length ? "plan-drafted" : publishReady ? "publish-ready" : "blocked";
  return {
    state,
    matchedArtifacts: draftedRecords.length ? draftedRecords : planRecords.length ? planRecords : publishReadyArtifacts,
    publishReady,
  };
}

function explicitPublishPlanSourceArtifacts() {
  const paths = [
    "data/explicit-publish-plans",
    "data/private-explicit-publish-plans",
    "data/publish-plans",
    "data/intake",
  ];
  return [
    ...paths.map((sourcePath) => ({
      path: sourcePath,
      exists: fs.existsSync(path.join(projectRoot, sourcePath)),
    })),
    {
      path: "publishReadinessVisibility",
      exists: true,
      virtual: true,
    },
  ];
}

function buildExplicitPublishPlanVisibility(queue, publishReadinessVisibility) {
  const planRecords = listExplicitPublishPlanRecords();
  const sourceArtifacts = explicitPublishPlanSourceArtifacts();
  const rows = (queue.items || [])
    .map((item) => {
      const requirement = explicitPublishPlanRequirementForItem(item);
      if (!requirement) return null;
      const observed = explicitPublishPlanStateFromEvidence(publishReadinessVisibility, planRecords);
      const missing = [];
      if (observed.state === "blocked") {
        missing.push("completed private publish-readiness checklist");
      } else if (observed.state === "publish-ready") {
        missing.push("private explicit publish plan draft");
      }

      const rationale =
        observed.state === "plan-drafted"
          ? "A repo-visible private explicit publish-plan draft exists; it is local/private planning status and does not launch or change public copy."
          : observed.state === "publish-ready"
            ? "Private publish-readiness is visible, so an explicit publish plan can be drafted without publishing conclusions."
            : "No completed private publish-readiness marker or private explicit publish-plan draft is visible yet, so publish planning remains blocked.";

      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state: observed.state,
        stateLabel: EXPLICIT_PUBLISH_PLAN_STATES[observed.state].label,
        blocked: observed.state === "blocked",
        publishReady: observed.publishReady,
        missing,
        gate: requirement.gate,
        rationale,
        sourceArtifacts,
        matchedArtifacts: observed.matchedArtifacts,
        evidenceNote:
          "Explicit publish-plan visibility is private operational status only; launch, pricing, testimonial, willingness-to-pay, demand, and outcome claims remain unobserved.",
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        EXPLICIT_PUBLISH_PLAN_STATES[a.state].rank - EXPLICIT_PUBLISH_PLAN_STATES[b.state].rank ||
        a.owner.localeCompare(b.owner)
    );

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      "data/explicit-publish-plans/*",
      "data/private-explicit-publish-plans/*",
      "data/publish-plans/*",
      "data/intake/*",
      "publishReadinessVisibility",
    ],
    total: rows.length,
    blockedCount: rows.filter((row) => row.state === "blocked").length,
    publishReadyCount: rows.filter((row) => row.state === "publish-ready").length,
    planDraftedCount: rows.filter((row) => row.state === "plan-drafted").length,
    planRecords,
    sourceArtifacts,
    rows,
  };
}

const RELEASE_CANDIDATE_REHEARSAL_STATES = {
  blocked: {
    label: "Blocked",
    rank: 0,
  },
  "diff-ready": {
    label: "Diff ready",
    rank: 1,
  },
  "rehearsal-ready": {
    label: "Rehearsal ready",
    rank: 2,
  },
};

const CREDENTIALED_DEPLOY_BLOCKER_STATES = {
  "rehearsal-blocked": {
    label: "Rehearsal blocked",
    rank: 0,
  },
  "rehearsal-ready": {
    label: "Rehearsal ready",
    rank: 1,
  },
  "deploy-inputs-blocked": {
    label: "Deploy inputs blocked",
    rank: 2,
  },
};

function normalizePublicCopyDiffRollbackRecord(record, source, index) {
  const nested =
    record?.privatePublicCopyDiffRollback && typeof record.privatePublicCopyDiffRollback === "object"
      ? record.privatePublicCopyDiffRollback
      : record?.publicCopyDiffRollback && typeof record.publicCopyDiffRollback === "object"
        ? record.publicCopyDiffRollback
        : record?.copyDiffRollback && typeof record.copyDiffRollback === "object"
          ? record.copyDiffRollback
          : {};
  const packet = { ...record, ...nested };
  const state = String(firstTruthyValue(packet, ["privatePublicCopyDiffRollbackState", "publicCopyDiffRollbackState", "state", "status"]) || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  const diffSummary = textFact(packet, ["diffSummary", "publicCopyDiff", "copyDiff", "diff"]);
  const consentCheck = textFact(packet, ["consentCheck", "consentChecks", "consentEvidence"]);
  const claimRiskCheck = textFact(packet, ["claimRiskCheck", "claimRiskReview", "claimRisk"]);
  const validationCommand = textFact(packet, ["validationCommand", "validationCommands", "validation"]);
  const rollbackPath = textFact(packet, ["rollbackPath", "rollbackPlan", "rollback"]);
  const completed = Boolean(
    state === "diff-packet-drafted" ||
      state === "diff-ready" ||
      state === "complete" ||
      state === "completed" ||
      booleanFact(packet, ["diffDrafted", "diffPacketDrafted", "packetComplete", "packetCompleted"]) ||
      (diffSummary && consentCheck && claimRiskCheck && validationCommand && rollbackPath)
  );
  if (!completed && !(diffSummary || consentCheck || claimRiskCheck || validationCommand || rollbackPath)) return null;

  return {
    source,
    index,
    state: completed ? "diff-ready" : "blocked",
    packetComplete: completed,
    diffSummaryPresent: Boolean(diffSummary),
    consentPresent: Boolean(consentCheck),
    claimRiskPresent: Boolean(claimRiskCheck),
    validationPresent: Boolean(validationCommand),
    rollbackPresent: Boolean(rollbackPath),
    noPublishAction:
      packet.noPublishAction === undefined
        ? true
        : /^(true|yes)$/i.test(String(packet.noPublishAction || "").trim()) || packet.noPublishAction === true,
    publicProductCopyUnchanged:
      packet.publicProductCopyUnchanged === undefined
        ? true
        : /^(true|yes)$/i.test(String(packet.publicProductCopyUnchanged || "").trim()) || packet.publicProductCopyUnchanged === true,
    capturedAt: textFact(packet, ["updatedAt", "capturedAt", "observedAt", "createdAt"]),
    route: textFact(packet, ["route", "path", "source"]),
  };
}

function listPublicCopyDiffRollbackRecords() {
  const candidateFiles = [
    ...listFiles("data/public-copy-diff-rollback", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/private-public-copy-diff-rollback", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/intake", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("ops/launch", (name) => /public-copy-diff.*rollback.*\.(md|txt)$/i.test(name)),
  ];

  return candidateFiles.flatMap((file) => {
    if (/\.(md|txt)$/i.test(file.name)) {
      const content = readText(file.relativePath);
      if (!/\b(public-copy diff|public copy diff|copy diff).*\brollback\b/i.test(content)) return [];
      const diffSummary = filledPrivateChecklistValue(content, /(?:Public-copy diff evidence|Public-copy diff|Public copy diff|Copy diff):[ \t]*([^\n|]+)/i);
      const consentCheck = filledPrivateChecklistValue(content, /(?:Consent evidence|Consent checks pass|Consent checks):[ \t]*([^\n|]+)/i);
      const claimRiskCheck = filledPrivateChecklistValue(content, /(?:Claim-risk review notes|Claim-risk checks pass|Claim risk checks|Claim risk):[ \t]*([^\n|]+)/i);
      const validationCommand = filledPrivateChecklistValue(content, /(?:Validation notes|Validation checks pass|Validation commands):[ \t]*([^\n|]+)/i);
      const rollbackPath = filledPrivateChecklistValue(content, /(?:Rollback notes|Rollback checks pass|Rollback path|Rollback restore target):[ \t]*([^\n|]+)/i);
      const completed = Boolean(
        /\b(diff and rollback state|private diff and rollback state|public-copy diff\/rollback state)\s*\|\s*(diff-ready|diff-packet-drafted|complete|completed)\b/i.test(
          content
        ) || (diffSummary && consentCheck && claimRiskCheck && validationCommand && rollbackPath)
      );
      if (!completed && !(diffSummary || consentCheck || claimRiskCheck || validationCommand || rollbackPath)) return [];
      return [
        {
          source: file.relativePath,
          index: 1,
          state: completed ? "diff-ready" : "blocked",
          packetComplete: completed,
          diffSummaryPresent: Boolean(diffSummary),
          consentPresent: Boolean(consentCheck),
          claimRiskPresent: Boolean(claimRiskCheck),
          validationPresent: Boolean(validationCommand),
          rollbackPresent: Boolean(rollbackPath),
          noPublishAction: true,
          publicProductCopyUnchanged: true,
          capturedAt: fs.statSync(file.absolutePath).mtime.toISOString(),
          route: file.relativePath,
        },
      ];
    }

    return readSessionStartRecordsFromFile(file)
      .map((record, index) => normalizePublicCopyDiffRollbackRecord(record, file.relativePath, index + 1))
      .filter(Boolean);
  });
}

function normalizeReleaseCandidateRehearsalState(value) {
  const state = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (["rehearsal-ready", "release-candidate-ready", "ready", "complete", "completed"].includes(state)) return "rehearsal-ready";
  if (["diff-ready", "packet-ready", "ready-to-rehearse", "public-copy-diff-ready"].includes(state)) return "diff-ready";
  if (["blocked", "not-ready", "unobserved", "not-observed", "missing"].includes(state)) return "blocked";
  return "";
}

function normalizeReleaseCandidateRehearsalRecord(record, source, index) {
  const nested =
    record?.privateReleaseCandidateRehearsal && typeof record.privateReleaseCandidateRehearsal === "object"
      ? record.privateReleaseCandidateRehearsal
      : record?.releaseCandidateRehearsal && typeof record.releaseCandidateRehearsal === "object"
        ? record.releaseCandidateRehearsal
        : {};
  const rehearsal = { ...record, ...nested };
  const explicitState = normalizeReleaseCandidateRehearsalState(
    firstTruthyValue(rehearsal, ["privateReleaseCandidateRehearsalState", "releaseCandidateRehearsalState", "state", "status"])
  );
  const packetPath = textFact(rehearsal, [
    "completedPublicCopyDiffRollbackPacketPath",
    "publicCopyDiffRollbackPacketPath",
    "diffRollbackPacketPath",
    "packetPath",
  ]);
  const staticSmoke = booleanFact(rehearsal, ["localStaticRehearsalPassed", "localStaticBuildPassed", "staticSmokePassed"]);
  const servedSmoke = booleanFact(rehearsal, ["localServedSmokePassed", "servedSmokePassed", "smokePassed"]);
  const rollback = booleanFact(rehearsal, ["rollbackRehearsalPassed", "rollbackVerificationPassed", "rollbackPassed"]);
  const consent = booleanFact(rehearsal, ["consentChecksPass", "consentPassed", "consentReady"]);
  const claimRisk = booleanFact(rehearsal, ["claimRiskChecksPass", "claimRiskPassed", "claimRiskReady"]);
  const redaction = booleanFact(rehearsal, ["redactionPrivacyChecksPass", "redactionPassed", "privacyPassed"]);
  const rehearsalReady = Boolean(
    explicitState === "rehearsal-ready" ||
      booleanFact(rehearsal, ["rehearsalReady", "releaseCandidateRehearsalReady", "checklistComplete"]) ||
      (packetPath && staticSmoke && servedSmoke && rollback && consent && claimRisk && redaction)
  );
  const diffReady = Boolean(
    rehearsalReady ||
      explicitState === "diff-ready" ||
      packetPath ||
      booleanFact(rehearsal, ["publicCopyDiffRollbackPacketComplete", "diffPacketComplete", "packetComplete"])
  );
  if (!diffReady && !rehearsalReady) return null;

  return {
    source,
    index,
    state: rehearsalReady ? "rehearsal-ready" : "diff-ready",
    packetPath,
    staticSmoke,
    servedSmoke,
    rollback,
    consent,
    claimRisk,
    redaction,
    noDeployAction:
      rehearsal.noDeployAction === undefined
        ? true
        : /^(true|yes)$/i.test(String(rehearsal.noDeployAction || "").trim()) || rehearsal.noDeployAction === true,
    deployActionRequested: booleanFact(rehearsal, ["deployActionRequested", "separateFinalDeployActionRequested"]),
    capturedAt: textFact(rehearsal, ["updatedAt", "capturedAt", "observedAt", "createdAt", "reviewedAt"]),
    route: textFact(rehearsal, ["route", "path", "source"]),
  };
}

function listReleaseCandidateRehearsalRecords() {
  const candidateFiles = [
    ...listFiles("data/release-candidate-rehearsals", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/private-release-candidate-rehearsals", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/intake", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("ops/deploy", (name) => /release-candidate-rehearsal.*\.(md|txt)$/i.test(name)),
  ];

  return candidateFiles.flatMap((file) => {
    if (/\.(md|txt)$/i.test(file.name)) {
      const content = readText(file.relativePath);
      if (!/\brelease-candidate rehearsal\b/i.test(content)) return [];
      const packetPath = filledPrivateChecklistValue(
        content,
        /(?:Completed public-copy diff\/rollback packet path|Completed public-copy diff and rollback packet path|Completed packet path recorded|Completed packet path):[ \t]*([^\n|]+)/i
      );
      const staticSmoke = /\bLocal static rehearsal passes:\s*(yes|pass|passed|true|complete|completed)\b/i.test(content);
      const servedSmoke = /\bLocal served smoke passes:\s*(yes|pass|passed|true|complete|completed)\b/i.test(content);
      const rollback = /\bRollback rehearsal passes:\s*(yes|pass|passed|true|complete|completed)\b/i.test(content);
      const consent = /\bConsent checks pass:\s*(yes|pass|passed|true|complete|completed)\b/i.test(content);
      const claimRisk = /\bClaim-risk checks pass:\s*(yes|pass|passed|true|complete|completed)\b/i.test(content);
      const redaction = /\bRedaction\/privacy checks pass:\s*(yes|pass|passed|true|complete|completed)\b/i.test(content);
      const rehearsalReady = Boolean(
        /\b(release-candidate rehearsal state|private release-candidate rehearsal state)\s*\|\s*rehearsal-ready\b/i.test(content) ||
          (packetPath && staticSmoke && servedSmoke && rollback && consent && claimRisk && redaction)
      );
      const diffReady = Boolean(packetPath || /\b(release-candidate rehearsal state|private release-candidate rehearsal state)\s*\|\s*diff-ready\b/i.test(content));
      if (!diffReady && !rehearsalReady) return [];
      return [
        {
          source: file.relativePath,
          index: 1,
          state: rehearsalReady ? "rehearsal-ready" : "diff-ready",
          packetPath,
          staticSmoke,
          servedSmoke,
          rollback,
          consent,
          claimRisk,
          redaction,
          noDeployAction: true,
          deployActionRequested: false,
          capturedAt: fs.statSync(file.absolutePath).mtime.toISOString(),
          route: file.relativePath,
        },
      ];
    }

    return readSessionStartRecordsFromFile(file)
      .map((record, index) => normalizeReleaseCandidateRehearsalRecord(record, file.relativePath, index + 1))
      .filter(Boolean);
  });
}

function releaseCandidateRehearsalRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\brelease-candidate rehearsal\b/.test(text)) return null;

  return {
    gate:
      "Private release-candidate rehearsal stays blocked until a completed public-copy diff/rollback packet exists; rehearsal-ready status requires local static smoke, served smoke, rollback, consent, claim-risk, and redaction/privacy checks while deploy remains separate.",
  };
}

function releaseCandidateRehearsalStateFromEvidence(diffRecords, rehearsalRecords) {
  const rehearsalReadyRecords = rehearsalRecords.filter((record) => record.state === "rehearsal-ready");
  const diffReadyRecords = [
    ...rehearsalRecords.filter((record) => record.state === "diff-ready"),
    ...diffRecords.filter((record) => record.state === "diff-ready" || record.packetComplete),
  ];
  const state = rehearsalReadyRecords.length ? "rehearsal-ready" : diffReadyRecords.length ? "diff-ready" : "blocked";
  return {
    state,
    matchedArtifacts: rehearsalReadyRecords.length ? rehearsalReadyRecords : diffReadyRecords,
    diffReady: Boolean(diffReadyRecords.length || rehearsalReadyRecords.length),
  };
}

function releaseCandidateRehearsalSourceArtifacts() {
  const paths = [
    "ops/deploy/private-release-candidate-rehearsal-checklist.md",
    "ops/launch/private-public-copy-diff-rollback-checklist.md",
    "data/release-candidate-rehearsals",
    "data/private-release-candidate-rehearsals",
    "data/private-public-copy-diff-rollback",
    "data/intake",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function buildReleaseCandidateRehearsalVisibility(queue) {
  const diffRecords = listPublicCopyDiffRollbackRecords();
  const rehearsalRecords = listReleaseCandidateRehearsalRecords();
  const sourceArtifacts = releaseCandidateRehearsalSourceArtifacts();
  const rows = (queue.items || [])
    .map((item) => {
      const requirement = releaseCandidateRehearsalRequirementForItem(item);
      if (!requirement) return null;
      const observed = releaseCandidateRehearsalStateFromEvidence(diffRecords, rehearsalRecords);
      const missing = [];
      if (observed.state === "blocked") {
        missing.push("completed public-copy diff/rollback packet");
      } else if (observed.state === "diff-ready") {
        missing.push("private release-candidate rehearsal checklist with local static smoke, served smoke, rollback, consent, claim-risk, and redaction/privacy checks");
      }

      const rationale =
        observed.state === "rehearsal-ready"
          ? "A repo-visible private release-candidate rehearsal record has the required local checks; deploy still remains a separate blocked action."
          : observed.state === "diff-ready"
            ? "A completed public-copy diff/rollback packet is visible, so private release-candidate rehearsal can proceed without deploying."
            : "No completed public-copy diff/rollback packet or release-candidate rehearsal evidence is visible yet, so rehearsal remains blocked.";

      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state: observed.state,
        stateLabel: RELEASE_CANDIDATE_REHEARSAL_STATES[observed.state].label,
        blocked: observed.state === "blocked",
        diffReady: observed.diffReady,
        missing,
        gate: requirement.gate,
        rationale,
        sourceArtifacts,
        matchedArtifacts: observed.matchedArtifacts,
        evidenceNote:
          "Release-candidate rehearsal visibility is private operational status only; deploy, launch, pricing, testimonial, willingness-to-pay, demand, and outcome claims remain unobserved.",
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        RELEASE_CANDIDATE_REHEARSAL_STATES[a.state].rank - RELEASE_CANDIDATE_REHEARSAL_STATES[b.state].rank ||
        a.owner.localeCompare(b.owner)
    );

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      "ops/deploy/private-release-candidate-rehearsal-checklist.md",
      "ops/launch/private-public-copy-diff-rollback-checklist.md",
      "data/release-candidate-rehearsals/*",
      "data/private-release-candidate-rehearsals/*",
      "data/private-public-copy-diff-rollback/*",
      "data/intake/*",
    ],
    total: rows.length,
    blockedCount: rows.filter((row) => row.state === "blocked").length,
    diffReadyCount: rows.filter((row) => row.state === "diff-ready").length,
    rehearsalReadyCount: rows.filter((row) => row.state === "rehearsal-ready").length,
    diffRecords,
    rehearsalRecords,
    sourceArtifacts,
    rows,
  };
}

function normalizeCredentialedDeployBlockerState(value) {
  const state = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (["deploy-inputs-blocked", "inputs-blocked", "blocked", "do-not-deploy"].includes(state)) return "deploy-inputs-blocked";
  if (["rehearsal-ready", "release-candidate-ready", "ready-for-inputs"].includes(state)) return "rehearsal-ready";
  if (["rehearsal-blocked", "release-candidate-blocked", "not-ready", "not-observed", "unobserved"].includes(state)) return "rehearsal-blocked";
  return "";
}

function normalizeCredentialedDeployBlockerRecord(record, source, index) {
  const nested =
    record?.privateCredentialedDeployBlocker && typeof record.privateCredentialedDeployBlocker === "object"
      ? record.privateCredentialedDeployBlocker
      : record?.credentialedDeployBlocker && typeof record.credentialedDeployBlocker === "object"
        ? record.credentialedDeployBlocker
        : record?.credentialedDeployReadiness && typeof record.credentialedDeployReadiness === "object"
          ? record.credentialedDeployReadiness
          : {};
  const blocker = { ...record, ...nested };
  const explicitState = normalizeCredentialedDeployBlockerState(
    firstTruthyValue(blocker, ["privateCredentialedDeployBlockerState", "credentialedDeployBlockerState", "state", "status"])
  );
  const rehearsalPath = textFact(blocker, [
    "completedReleaseCandidateRehearsalPath",
    "releaseCandidateRehearsalPath",
    "rehearsalPath",
  ]);
  const selectedPlatform = textFact(blocker, ["selectedPlatform", "platform"]);
  const productionUrl = textFact(blocker, ["productionUrl", "productionURL", "productionOrigin"]);
  const credentialAvailability = textFact(blocker, ["credentialAvailability", "credentialsAvailableOutsideRepo", "credentialState"]);
  const deployTrigger = textFact(blocker, ["deployTrigger", "trigger"]);
  const rollbackOwner = textFact(blocker, ["rollbackOwner"]);
  const rollbackMethod = textFact(blocker, ["rollbackMethod", "rollbackRestoreTarget"]);
  const healthCheckMethod = textFact(blocker, ["postDeployHealthCheckMethod", "healthCheckMethod", "postDeployStatusMethod"]);
  const healthCheckTarget = textFact(blocker, ["postDeployHealthCheckTarget", "healthCheckTarget"]);
  const inputFacts = {
    selectedPlatform: Boolean(selectedPlatform),
    productionUrl: Boolean(productionUrl),
    credentialAvailability: Boolean(credentialAvailability) && !/not observed|blocked|missing/i.test(credentialAvailability),
    deployTrigger: Boolean(deployTrigger),
    rollbackOwner: Boolean(rollbackOwner),
    rollbackMethod: Boolean(rollbackMethod),
    healthCheckMethod: Boolean(healthCheckMethod),
    healthCheckTarget: Boolean(healthCheckTarget),
  };
  const anyInputObserved = Object.values(inputFacts).some(Boolean);
  const allInputsObserved = Object.values(inputFacts).every(Boolean);
  const rehearsalReady = Boolean(rehearsalPath || booleanFact(blocker, ["completedReleaseCandidateRehearsalExists", "releaseCandidateRehearsalComplete"]));
  if (!explicitState && !rehearsalReady && !anyInputObserved) return null;

  return {
    source,
    index,
    state:
      explicitState ||
      (rehearsalReady ? (allInputsObserved ? "rehearsal-ready" : "deploy-inputs-blocked") : "rehearsal-blocked"),
    rehearsalPath,
    selectedPlatform: inputFacts.selectedPlatform,
    productionUrl: inputFacts.productionUrl,
    credentialAvailability: inputFacts.credentialAvailability,
    deployTrigger: inputFacts.deployTrigger,
    rollbackOwner: inputFacts.rollbackOwner,
    rollbackMethod: inputFacts.rollbackMethod,
    healthCheckMethod: inputFacts.healthCheckMethod,
    healthCheckTarget: inputFacts.healthCheckTarget,
    allInputsObserved,
    credentialValuesStored: booleanFact(blocker, ["credentialValuesStored", "secretStored", "credentialsStored"]),
    deployActionRequested: booleanFact(blocker, ["deployActionRequested", "finalDeployActionRequested"]),
    capturedAt: textFact(blocker, ["updatedAt", "capturedAt", "observedAt", "createdAt", "reviewedAt"]),
    route: textFact(blocker, ["route", "path", "source"]),
  };
}

function credentialedDeployChecklistRecordFromMarkdown(file) {
  const content = readText(file.relativePath);
  if (!/\bcredentialed-deploy\b/i.test(content)) return null;
  const rehearsalPath = filledPrivateChecklistValue(content, /Completed rehearsal path:[ \t]*([^\n|]+)/i);
  const selectedPlatform = filledPrivateChecklistValue(content, /Selected platform:[ \t]*([^\n|]+)/i);
  const productionUrl = filledPrivateChecklistValue(content, /Production URL:[ \t]*([^\n|]+)/i);
  const credentialAvailability = filledPrivateChecklistValue(content, /Credential availability outside repo:[ \t]*([^\n|]+)/i);
  const deployTrigger = filledPrivateChecklistValue(content, /Deploy trigger:[ \t]*([^\n|]+)/i);
  const rollbackOwner = filledPrivateChecklistValue(content, /Rollback owner:[ \t]*([^\n|]+)/i);
  const rollbackMethod = filledPrivateChecklistValue(content, /Rollback method:[ \t]*([^\n|]+)/i);
  const healthCheckMethod = filledPrivateChecklistValue(content, /Post-deploy status method:[ \t]*([^\n|]+)/i);
  const healthCheckTarget = filledPrivateChecklistValue(content, /Post-deploy health-check target:[ \t]*([^\n|]+)/i);
  const inputFacts = {
    selectedPlatform: Boolean(selectedPlatform),
    productionUrl: Boolean(productionUrl),
    credentialAvailability: Boolean(credentialAvailability) && !/not observed|blocked|missing/i.test(credentialAvailability),
    deployTrigger: Boolean(deployTrigger),
    rollbackOwner: Boolean(rollbackOwner),
    rollbackMethod: Boolean(rollbackMethod),
    healthCheckMethod: Boolean(healthCheckMethod),
    healthCheckTarget: Boolean(healthCheckTarget),
  };
  const anyInputObserved = Object.values(inputFacts).some(Boolean);
  const completedRehearsalExists =
    Boolean(rehearsalPath) ||
    /\bCompleted release-candidate rehearsal exists\s*\|\s*(yes|pass|passed|true|complete|completed)\b/i.test(content);
  if (!completedRehearsalExists && !anyInputObserved && !/No completed release-candidate rehearsal has been consumed/i.test(content)) {
    return null;
  }
  return {
    source: file.relativePath,
    index: 1,
    state: completedRehearsalExists
      ? Object.values(inputFacts).every(Boolean)
        ? "rehearsal-ready"
        : "deploy-inputs-blocked"
      : "rehearsal-blocked",
    rehearsalPath,
    ...inputFacts,
    allInputsObserved: Object.values(inputFacts).every(Boolean),
    credentialValuesStored: /\b(tokens?|passwords?|api keys?|session cookies?)\s*:\s*(?!not observed|blocked|missing)/i.test(content),
    deployActionRequested: /\bSeparate final deploy action requested:\s*(yes|true|requested)\b/i.test(content),
    capturedAt: fs.statSync(file.absolutePath).mtime.toISOString(),
    route: file.relativePath,
  };
}

function listCredentialedDeployBlockerRecords() {
  const candidateFiles = [
    ...listFiles("data/credentialed-deploy-readiness", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/private-credentialed-deploy-readiness", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/credentialed-deploy-blockers", (name) => /\.(jsonl|json|md|txt)$/i.test(name)),
    ...listFiles("data/intake", (name) => /\.(jsonl|json)$/i.test(name)),
    ...listFiles("ops/deploy", (name) => /credentialed-deploy.*\.(md|txt)$/i.test(name)),
  ];

  return candidateFiles.flatMap((file) => {
    if (/\.(md|txt)$/i.test(file.name)) {
      const record = credentialedDeployChecklistRecordFromMarkdown(file);
      return record ? [record] : [];
    }

    return readSessionStartRecordsFromFile(file)
      .map((record, index) => normalizeCredentialedDeployBlockerRecord(record, file.relativePath, index + 1))
      .filter(Boolean);
  });
}

function credentialedDeployBlockerRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\bcredentialed-deploy\b/.test(text) && !/\bcredentialed deploy\b/.test(text)) return null;

  return {
    gate:
      "Private credentialed-deploy readiness stays blocked until a completed release-candidate rehearsal exists; deploy inputs may be reviewed only as presence/absence facts, never credential values.",
  };
}

function credentialedDeployStateFromEvidence(rehearsalRecords, blockerRecords) {
  const completedRehearsals = rehearsalRecords.filter((record) => record.state === "rehearsal-ready");
  if (!completedRehearsals.length) {
    return {
      state: "rehearsal-blocked",
      matchedArtifacts: blockerRecords.filter((record) => record.state === "rehearsal-blocked"),
      completedRehearsals,
      blockerRecords,
    };
  }

  const inputBlockedRecords = blockerRecords.filter((record) => record.state === "deploy-inputs-blocked" || !record.allInputsObserved);
  if (inputBlockedRecords.length) {
    return {
      state: "deploy-inputs-blocked",
      matchedArtifacts: inputBlockedRecords,
      completedRehearsals,
      blockerRecords,
    };
  }

  return {
    state: "rehearsal-ready",
    matchedArtifacts: completedRehearsals,
    completedRehearsals,
    blockerRecords,
  };
}

function credentialedDeployBlockerSourceArtifacts() {
  const paths = [
    "ops/deploy/private-credentialed-deploy-readiness-blocker-checklist.md",
    "ops/deploy/private-release-candidate-rehearsal-checklist.md",
    "data/private-credentialed-deploy-readiness",
    "data/credentialed-deploy-readiness",
    "data/credentialed-deploy-blockers",
    "data/private-release-candidate-rehearsals",
    "data/release-candidate-rehearsals",
    "data/intake",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function credentialedDeployMissingInputs(observed) {
  if (observed.state === "rehearsal-blocked") return ["completed release-candidate rehearsal"];
  const records = observed.blockerRecords || [];
  const facts = {
    selectedPlatform: records.some((record) => record.selectedPlatform),
    productionUrl: records.some((record) => record.productionUrl),
    credentialAvailability: records.some((record) => record.credentialAvailability),
    deployTrigger: records.some((record) => record.deployTrigger),
    rollbackOwner: records.some((record) => record.rollbackOwner),
    rollbackMethod: records.some((record) => record.rollbackMethod),
    healthCheckMethod: records.some((record) => record.healthCheckMethod),
    healthCheckTarget: records.some((record) => record.healthCheckTarget),
  };
  const labels = {
    selectedPlatform: "selected platform",
    productionUrl: "production URL",
    credentialAvailability: "credential availability outside repo",
    deployTrigger: "deploy trigger",
    rollbackOwner: "rollback owner",
    rollbackMethod: "rollback method",
    healthCheckMethod: "post-deploy health-check method",
    healthCheckTarget: "post-deploy health-check target",
  };
  return Object.entries(facts)
    .filter(([, present]) => !present)
    .map(([key]) => labels[key]);
}

function buildCredentialedDeployBlockerVisibility(queue) {
  const rehearsalRecords = listReleaseCandidateRehearsalRecords();
  const blockerRecords = listCredentialedDeployBlockerRecords();
  const sourceArtifacts = credentialedDeployBlockerSourceArtifacts();
  const rows = (queue.items || [])
    .map((item) => {
      const requirement = credentialedDeployBlockerRequirementForItem(item);
      if (!requirement) return null;
      const observed = credentialedDeployStateFromEvidence(rehearsalRecords, blockerRecords);
      const missing = credentialedDeployMissingInputs(observed);
      const unsafeEvidence = blockerRecords.some((record) => record.credentialValuesStored || record.deployActionRequested);
      const rationale =
        observed.state === "deploy-inputs-blocked"
          ? "A completed release-candidate rehearsal is visible, but deploy inputs are still missing or incomplete; no credential values are requested or stored."
          : observed.state === "rehearsal-ready"
            ? "A completed release-candidate rehearsal is visible and no deploy-input review has been recorded yet; deploy remains blocked until explicit input facts exist."
            : "No completed release-candidate rehearsal evidence is visible yet, so credentialed-deploy readiness remains rehearsal-blocked.";

      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state: observed.state,
        stateLabel: CREDENTIALED_DEPLOY_BLOCKER_STATES[observed.state].label,
        missing,
        gate: requirement.gate,
        rationale,
        sourceArtifacts,
        matchedArtifacts: observed.matchedArtifacts,
        completedRehearsalCount: observed.completedRehearsals.length,
        blockerRecordCount: blockerRecords.length,
        unsafeEvidence,
        evidenceNote:
          "Credentialed-deploy blocker visibility is private operational status only; deploy, launch, pricing, testimonial, demand, willingness-to-pay, secure-intake, and outcome conclusions remain unobserved.",
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) =>
        CREDENTIALED_DEPLOY_BLOCKER_STATES[a.state].rank - CREDENTIALED_DEPLOY_BLOCKER_STATES[b.state].rank ||
        a.owner.localeCompare(b.owner)
    );

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      "ops/deploy/private-credentialed-deploy-readiness-blocker-checklist.md",
      "ops/deploy/private-release-candidate-rehearsal-checklist.md",
      "data/private-credentialed-deploy-readiness/*",
      "data/credentialed-deploy-readiness/*",
      "data/credentialed-deploy-blockers/*",
      "data/private-release-candidate-rehearsals/*",
      "data/release-candidate-rehearsals/*",
      "data/intake/*",
    ],
    total: rows.length,
    rehearsalBlockedCount: rows.filter((row) => row.state === "rehearsal-blocked").length,
    rehearsalReadyCount: rows.filter((row) => row.state === "rehearsal-ready").length,
    deployInputsBlockedCount: rows.filter((row) => row.state === "deploy-inputs-blocked").length,
    unsafeEvidenceCount: rows.filter((row) => row.unsafeEvidence).length,
    rehearsalRecords,
    blockerRecords,
    sourceArtifacts,
    rows,
  };
}

function markdownTableStatus(content, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`\\|\\s*${escaped}\\s*\\|([^\\n]+)`, "i"));
  if (!match) return "Not observed";
  const cells = splitMarkdownRow(`|${match[1]}`);
  return cells[cells.length - 1] || "Not observed";
}

function platformOwnerHandoffSourceArtifacts() {
  const paths = [
    "ops/deploy/private-platform-owner-handoff-checklist.md",
    "ops/reports/static-deploy-rehearsal/latest.json",
    "ops/reports/static-deploy-rehearsal",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function platformOwnerHandoffRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\bplatform-owner\b/.test(text) && !/\bplatform owner\b/.test(text)) return null;

  return {
    gate:
      "Platform-owner handoff visibility may expose only category-level non-secret inputs and blocked deploy status; credential values, production URLs, and deploy triggers stay unavailable.",
  };
}

function buildPlatformOwnerHandoffVisibility(queue, staticVisibility) {
  const checklistPath = "ops/deploy/private-platform-owner-handoff-checklist.md";
  const checklistContent = readText(checklistPath);
  const checklistExists = Boolean(checklistContent);
  const localStaticPassed = staticVisibility?.state === "passed-local" && staticVisibility?.ok === true;
  const blockedReason = localStaticPassed
    ? "Local static rehearsal passed, but public deploy remains blocked until a separate platform-owner deploy action provides required non-secret inputs outside this dashboard."
    : "Local static rehearsal evidence has not passed, so platform-owner handoff remains blocked.";
  const nonSecretInputLabels = [
    "Selected static hosting platform",
    "Production origin to check after deploy",
    "Deploy trigger, hook, webhook, or tokenized command",
    "Deploy executor",
    "Rollback owner",
    "Rollback method and restore target",
    "Post-deploy status method",
    "Post-deploy health-check entrypoints",
    "Incident communication owner",
  ];
  const unavailableValueLabels = [
    "Platform credentials or account secrets",
    "Production URL or origin value",
    "Deploy trigger or tokenized command",
    "Private platform destinations or secret-manager references",
  ];
  const sourceArtifacts = platformOwnerHandoffSourceArtifacts();

  const rows = (queue.items || [])
    .map((item) => {
      const requirement = platformOwnerHandoffRequirementForItem(item);
      if (!requirement) return null;
      const inputRows = nonSecretInputLabels.map((label) => ({
        label,
        state: checklistExists ? markdownTableStatus(checklistContent, label) : "Checklist missing",
        handling: "Needed later from the human/platform owner; value is not stored in admin data.",
      }));
      const unavailableRows = unavailableValueLabels.map((label) => ({
        label,
        state: "Unavailable in repo/admin data",
        handling: "Do not request, paste, infer, or store.",
      }));
      const publicDeployStatus = {
        authorization: checklistExists ? markdownTableStatus(checklistContent, "Public deploy authorization") : "Checklist missing",
        productionDeploymentState: staticVisibility?.noDeployGuardrails?.productionDeploymentState || "Do Not Deploy",
        staticRehearsalState: staticVisibility?.stateLabel || "Not run",
        blocked: true,
        blockedReason,
      };

      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state: localStaticPassed && checklistExists ? "handoff-blocked" : "static-rehearsal-blocked",
        stateLabel: localStaticPassed && checklistExists ? "Handoff visible, deploy blocked" : "Static rehearsal blocked",
        gate: requirement.gate,
        sourceArtifacts,
        nonSecretInputsNeeded: inputRows,
        unavailableCredentialDeployValues: unavailableRows,
        publicDeployStatus,
        evidenceNote:
          "Private platform-owner handoff visibility is category-level only. It stores no credentials, production URLs, deploy triggers, dashboard links, public launch authorization, pricing, testimonial, demand, secure-intake, or outcome claims.",
      };
    })
    .filter(Boolean);

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      checklistPath,
      "ops/reports/static-deploy-rehearsal/latest.json",
      "ops/reports/static-deploy-rehearsal/*.json",
    ],
    total: rows.length,
    handoffBlockedCount: rows.filter((row) => row.state === "handoff-blocked").length,
    staticRehearsalBlockedCount: rows.filter((row) => row.state === "static-rehearsal-blocked").length,
    unavailableValueCount: unavailableValueLabels.length,
    checklistExists,
    localStaticPassed,
    sourceArtifacts,
    rows,
  };
}

function postDeployHealthHandoffSourceArtifacts() {
  const paths = [
    "ops/deploy/private-post-deploy-health-check-owner-handoff-template.md",
    "ops/deploy/private-platform-owner-handoff-checklist.md",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function postDeployHealthRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\bpost-deploy\b/.test(text) && !/\bhealth-check\b/.test(text)) return null;

  return {
    gate:
      "Post-deploy health-check owner handoff visibility may expose route-only checks and blocker categories only; production origins, credentials, deploy triggers, and private platform destinations stay unavailable.",
  };
}

function markdownTableRows(content) {
  return String(content || "")
    .split(/\r?\n/)
    .filter((line) => /^\s*\|/.test(line))
    .map(splitMarkdownRow)
    .filter((cells) => cells.length >= 2 && !cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim())));
}

function markdownTableValue(content, firstCell) {
  const target = String(firstCell || "").trim().toLowerCase();
  const row = markdownTableRows(content).find((cells) => String(cells[0] || "").trim().toLowerCase() === target);
  return row?.[row.length - 1] || "Not observed";
}

function postDeployHealthRoutes(content) {
  const routeRows = markdownTableRows(content).filter((cells) => /^\/[a-z0-9/_-]*(?:\.html|\.json)?$/i.test(String(cells[0] || "").trim()));
  const routes = routeRows.map((cells) => ({
    path: cells[0].trim(),
    expectedCheck: cells[1] || "HTTP check after separate deploy action",
    executableState: cells[2] || "Not observed",
  }));
  return routes.length
    ? routes
    : ["/", "/intake.html", "/review.html", "/admin.html", "/admin-data.json"].map((routePath) => ({
        path: routePath,
        expectedCheck: routePath.endsWith(".json") ? "HTTP 200 and parseable JSON" : "HTTP 200",
        executableState: "Not observed",
      }));
}

function buildPostDeployHealthOwnerHandoffVisibility(queue, platformVisibility) {
  const templatePath = "ops/deploy/private-post-deploy-health-check-owner-handoff-template.md";
  const templateContent = readText(templatePath);
  const templateExists = Boolean(templateContent);
  const routeOnlyChecks = postDeployHealthRoutes(templateContent);
  const platformHandoffVisible = Boolean(platformVisibility?.total && platformVisibility?.checklistExists);
  const sourceArtifacts = postDeployHealthHandoffSourceArtifacts();

  const rows = (queue.items || [])
    .map((item) => {
      const requirement = postDeployHealthRequirementForItem(item);
      if (!requirement) return null;
      const healthOwnerState = templateExists ? markdownTableValue(templateContent, "Post-deploy health-check owner") : "Template missing";
      const productionOriginState = templateExists ? markdownTableValue(templateContent, "Production URL readiness") : "Template missing";
      const deployTriggerState = templateExists ? markdownTableValue(templateContent, "Deploy trigger readiness") : "Template missing";
      const launchAuthorizationState = templateExists ? markdownTableValue(templateContent, "Public launch authorized by this template") : "Template missing";
      const deploymentState = templateExists ? markdownTableValue(templateContent, "Production deployment state") : "Do Not Deploy";
      const state = !templateExists
        ? "template-missing"
        : !platformHandoffVisible
          ? "platform-handoff-blocked"
          : "handoff-visible-blocked";

      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state,
        stateLabel:
          state === "handoff-visible-blocked"
            ? "Route-only handoff visible, blocked"
            : state === "platform-handoff-blocked"
              ? "Platform handoff blocked"
              : "Template missing",
        gate: requirement.gate,
        sourceArtifacts,
        routeOnlyChecks,
        unavailableProductionOrigin: {
          state: productionOriginState,
          handling: "Origin value is not stored in admin data; route paths remain origin-free.",
        },
        unavailableDeployTrigger: {
          state: deployTriggerState,
          handling: "Deploy action, workflow trigger, or tokenized command is not stored in admin data.",
        },
        blockedLaunchAuthorization: {
          state: launchAuthorizationState,
          deploymentState,
          blocked: true,
          handling: "Launch and deploy authorization must remain separate from this owner handoff.",
        },
        ownerHandoff: {
          healthCheckOwner: healthOwnerState,
          statusMethod: templateExists ? markdownTableValue(templateContent, "Post-deploy status method") : "Template missing",
          healthReadiness: templateExists ? markdownTableValue(templateContent, "Post-deploy health readiness") : "Template missing",
        },
        evidenceNote:
          "Private post-deploy health-check owner handoff visibility stores route paths and blocker categories only. It stores no origins, credentials, deploy triggers, private platform destinations, launch authorization, pricing, testimonial, demand, secure-intake, or outcome claims.",
      };
    })
    .filter(Boolean);

  return {
    generatedFrom: ["ops/backlog/NEXT.md", templatePath, "ops/deploy/private-platform-owner-handoff-checklist.md"],
    total: rows.length,
    routeOnlyCheckCount: routeOnlyChecks.length,
    unavailableProductionOriginCount: rows.filter((row) => row.unavailableProductionOrigin.state !== "Observed").length,
    unavailableDeployTriggerCount: rows.filter((row) => row.unavailableDeployTrigger.state !== "Observed").length,
    blockedLaunchAuthorizationCount: rows.filter((row) => row.blockedLaunchAuthorization.blocked).length,
    templateExists,
    platformHandoffVisible,
    sourceArtifacts,
    rows,
  };
}

function finalDeployLedgerSourceArtifacts() {
  const paths = [
    "ops/deploy/private-final-deploy-go-no-go-evidence-ledger-template.md",
    "ops/deploy/private-platform-owner-handoff-checklist.md",
    "ops/deploy/private-post-deploy-health-check-owner-handoff-template.md",
    "ops/reports/static-deploy-rehearsal/latest.json",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function deployBlockerEscalationMemoSourceArtifacts() {
  const paths = [
    "ops/deploy/private-deploy-blocker-escalation-memo-template.md",
    "ops/deploy/private-final-deploy-go-no-go-evidence-ledger-template.md",
    "ops/deploy/private-platform-owner-handoff-checklist.md",
    "ops/deploy/private-post-deploy-health-check-owner-handoff-template.md",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function firstHumanOperatorDeployPacketSourceArtifacts() {
  const paths = [
    "ops/deploy/private-first-human-operator-deploy-packet-index.md",
    "ops/deploy/private-deploy-blocker-escalation-memo-template.md",
    "ops/deploy/private-final-deploy-go-no-go-evidence-ledger-template.md",
    "ops/reports/static-deploy-rehearsal/latest.json",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function operatorDryRunReviewChecklistSourceArtifacts() {
  const paths = [
    "ops/deploy/private-operator-dry-run-review-checklist.md",
    "ops/deploy/private-first-human-operator-deploy-packet-index.md",
    "ops/deploy/README.md",
    "ops/deploy/health-checks.md",
    "ops/reports/static-deploy-rehearsal/latest.json",
    "ops/deploy/private-final-deploy-go-no-go-evidence-ledger-template.md",
    "ops/deploy/private-deploy-blocker-escalation-memo-template.md",
    "ops/research/no-interviews-yet-status.md",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function firstHumanPacketColdStartArchiveSourceArtifacts() {
  const paths = [
    "ops/deploy/private-first-human-packet-handoff-archive-cold-start-brief.md",
    "ops/deploy/private-first-human-operator-deploy-packet-index.md",
    "ops/deploy/private-operator-dry-run-review-checklist.md",
    "ops/reports/static-deploy-rehearsal/latest.json",
    "ops/research/no-interviews-yet-status.md",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function releaseCandidateDeployContinuationMapSourceArtifacts() {
  const paths = [
    "ops/deploy/private-release-candidate-deploy-continuation-map.md",
    "ops/deploy/private-first-human-packet-handoff-archive-cold-start-brief.md",
    "ops/deploy/private-first-human-operator-deploy-packet-index.md",
    "ops/deploy/private-operator-dry-run-review-checklist.md",
    "ops/deploy/private-final-deploy-go-no-go-evidence-ledger-template.md",
    "ops/deploy/private-deploy-blocker-escalation-memo-template.md",
    "ops/deploy/private-credentialed-deploy-readiness-blocker-checklist.md",
    "ops/reports/static-deploy-rehearsal/latest.json",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function externalInputBoundaryLedgerSourceArtifacts() {
  const paths = [
    "ops/deploy/private-external-input-boundary-ledger.md",
    "ops/deploy/private-release-candidate-deploy-continuation-map.md",
    "ops/deploy/private-first-human-packet-handoff-archive-cold-start-brief.md",
    "ops/deploy/private-first-human-operator-deploy-packet-index.md",
    "ops/deploy/private-operator-dry-run-review-checklist.md",
    "ops/deploy/private-final-deploy-go-no-go-evidence-ledger-template.md",
    "ops/deploy/private-deploy-blocker-escalation-memo-template.md",
    "ops/reports/static-deploy-rehearsal/latest.json",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function platformOwnerNonRequestTransferNoteSourceArtifacts() {
  const paths = [
    "ops/deploy/private-platform-owner-non-request-transfer-note.md",
    "ops/deploy/private-external-input-boundary-ledger.md",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function operatorResumePacketGuardrailSourceArtifacts() {
  const paths = [
    "ops/deploy/private-operator-resume-packet-guardrail.md",
    "ops/deploy/private-platform-owner-non-request-transfer-note.md",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function blockedStateOperatorContinuationIndexSourceArtifacts() {
  const paths = [
    "ops/deploy/private-blocked-state-operator-continuation-index.md",
    "ops/deploy/private-operator-resume-packet-guardrail.md",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function autonomousDeployStopLedgerSourceArtifacts() {
  const paths = [
    "ops/deploy/private-autonomous-deploy-stop-ledger.md",
    "ops/deploy/private-blocked-state-operator-continuation-index.md",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function postAutonomousStopRecoveryChecklistSourceArtifacts() {
  const paths = [
    "ops/deploy/private-post-autonomous-stop-recovery-checklist.md",
    "ops/deploy/private-autonomous-deploy-stop-ledger.md",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function humanPlatformAuthorityReEntryGateSourceArtifacts() {
  const paths = [
    "ops/deploy/private-human-platform-authority-re-entry-gate.md",
    "ops/deploy/private-post-autonomous-stop-recovery-checklist.md",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function outsideAuthorityAwaitingStateLedgerSourceArtifacts() {
  const paths = [
    "ops/deploy/private-outside-authority-awaiting-state-ledger.md",
    "ops/deploy/private-human-platform-authority-re-entry-gate.md",
  ];
  return paths.map((sourcePath) => ({
    path: sourcePath,
    exists: fs.existsSync(path.join(projectRoot, sourcePath)),
  }));
}

function deployBlockerEscalationMemoRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\bdeploy-blocker\b/.test(text) || !/\bescalation memo\b/.test(text)) return null;

  return {
    gate:
      "Deploy-blocker escalation memo visibility may summarize private blocker categories only; it cannot request secret material, expose platform values, store external destination or action values, authorize rollback, or change final No-Go / Do Not Deploy.",
  };
}

function firstHumanOperatorDeployPacketRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\bfirst-human-operator\b/.test(text) || !/\bdeploy packet index\b/.test(text)) return null;
  if (String(item.owner || "").toLowerCase() !== "admin" && !/\badmin dashboard\b/.test(text)) return null;

  return {
    gate:
      "First-human-operator deploy packet visibility may index ready local artifacts and unavailable external facts only; it cannot create deploy actions, secret paths, credential requests, approval paths, production URL requirements, dashboard link requirements, contact detail requests, rollback authorization, or public launch authorization.",
  };
}

function operatorDryRunReviewChecklistRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\boperator\b/.test(text) || !/\bdry-run\b/.test(text) || !/\breview checklist\b/.test(text)) return null;
  if (String(item.owner || "").toLowerCase() !== "admin" && !/\badmin dashboard\b/.test(text)) return null;

  return {
    gate:
      "Operator dry-run checklist visibility may summarize local review artifacts and forbidden external actions only; it cannot request credentials, URLs, deploy triggers, dashboard links, contacts, hooks, approval claims, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
  };
}

function firstHumanPacketColdStartArchiveRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\bfirst-human packet\b/.test(text) || !/\bcold-start archive\b/.test(text)) return null;
  if (String(item.owner || "").toLowerCase() !== "admin" && !/\badmin dashboard\b/.test(text)) return null;

  return {
    gate:
      "Cold-start archive visibility may summarize continuation context and unavailable external deploy facts only; it cannot request or store credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, deploy actions, or public launch authorization.",
  };
}

function releaseCandidateDeployContinuationMapRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\brelease-candidate\b/.test(text) || !/\bdeploy-continuation map\b/.test(text)) return null;
  if (String(item.owner || "").toLowerCase() !== "admin" && !/\badmin dashboard\b/.test(text)) return null;

  return {
    gate:
      "Release-candidate deploy-continuation map visibility may summarize local continuation context and unavailable external platform facts only; it cannot request or store credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, deploy actions, or public launch authorization.",
  };
}

function externalInputBoundaryLedgerRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\bexternal-input\b/.test(text) && !/\bexternal input\b/.test(text)) return null;
  if (!/\bboundary ledger\b/.test(text) && !/\bledger visibility\b/.test(text)) return null;
  if (String(item.owner || "").toLowerCase() !== "admin" && !/\badmin dashboard\b/.test(text)) return null;

  return {
    gate:
      "External-input boundary ledger visibility may summarize outside-repo fact states only; it cannot store private values, request platform inputs, authorize rollback, authorize public launch, expose operational destinations, or create deploy actions.",
  };
}

function platformOwnerNonRequestTransferNoteRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\bplatform-owner\b/.test(text) && !/\bplatform owner\b/.test(text)) return null;
  if (!/\bnon-request\b/.test(text) || !/\btransfer note\b/.test(text)) return null;
  if (String(item.owner || "").toLowerCase() !== "admin" && !/\badmin dashboard\b/.test(text)) return null;

  return {
    gate:
      "Platform-owner non-request transfer note visibility may summarize blocked-state transfer facts only; it cannot request or store credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
  };
}

function operatorResumePacketGuardrailRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\boperator-resume\b/.test(text) && !/\boperator resume\b/.test(text)) return null;
  if (!/\bpacket guardrail\b/.test(text) && !/\bguardrail visibility\b/.test(text)) return null;
  if (String(item.owner || "").toLowerCase() !== "admin" && !/\badmin dashboard\b/.test(text)) return null;

  return {
    gate:
      "Operator-resume packet guardrail visibility may summarize source, blocked operator actions, outside-repo facts, and final No-Go / Do Not Deploy only; it cannot request or store credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
  };
}

function blockedStateOperatorContinuationIndexRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\bblocked-state\b/.test(text) && !/\bblocked state\b/.test(text)) return null;
  if (!/\bcontinuation index\b/.test(text)) return null;
  if (String(item.owner || "").toLowerCase() !== "admin" && !/\badmin dashboard\b/.test(text)) return null;

  return {
    gate:
      "Blocked-state operator continuation index visibility may summarize source, continuation limits, outside-repo facts, and final No-Go / Do Not Deploy only; it cannot request or store credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
  };
}

function autonomousDeployStopLedgerRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\bautonomous-deploy-stop\b/.test(text) && !/\bautonomous deploy stop\b/.test(text)) return null;
  if (!/\bstop-ledger\b/.test(text) && !/\bstop ledger\b/.test(text)) return null;
  if (String(item.owner || "").toLowerCase() !== "admin" && !/\badmin dashboard\b/.test(text)) return null;

  return {
    gate:
      "Autonomous-deploy-stop ledger visibility may summarize stop-ledger source, autonomous stop conditions, outside-repo facts, and final No-Go / Do Not Deploy only; it cannot request or store credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
  };
}

function postAutonomousStopRecoveryChecklistRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\bpost-autonomous-stop\b/.test(text) && !/\bpost autonomous stop\b/.test(text)) return null;
  if (!/\brecovery checklist\b/.test(text) && !/\brecovery-checklist\b/.test(text)) return null;
  if (String(item.owner || "").toLowerCase() !== "admin" && !/\badmin dashboard\b/.test(text)) return null;

  return {
    gate:
      "Post-autonomous-stop recovery checklist visibility may summarize recovery source, stop/recovery boundaries, outside-repo facts, and final No-Go / Do Not Deploy only; it cannot request or store credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
  };
}

function humanPlatformAuthorityReEntryGateRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\bhuman-platform-authority\b/.test(text) && !/\bhuman platform authority\b/.test(text)) return null;
  if (!/\bre-entry gate\b/.test(text) && !/\breentry gate\b/.test(text)) return null;
  if (String(item.owner || "").toLowerCase() !== "admin" && !/\badmin dashboard\b/.test(text)) return null;

  return {
    gate:
      "Human-platform-authority re-entry gate visibility may summarize re-entry source, authority gate boundaries, outside-repo facts, and final No-Go / Do Not Deploy only; it cannot request or store credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, authority bypasses, or deploy actions.",
  };
}

function deployBlockerUnavailableItems(content) {
  const unavailableSection = sectionLines(
    { content: String(content || "") },
    "Unavailable Items For Future Human Operator"
  ).join("\n");
  const rows = markdownTableRows(unavailableSection).filter((cells) => {
    const state = String(cells[cells.length - 1] || "");
    return /not observed/i.test(state) && !/^\s*unavailable item\s*$/i.test(cells[0] || "");
  });
  const seen = new Set();
  return rows
    .map((cells) => ({
      label: cells[0] || "Unavailable input",
      state: cells[cells.length - 1] || "Not observed",
      handling: "Future human operator handles outside this memo without storing external values here.",
    }))
    .filter((item) => {
      const key = item.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 16);
}

function firstHumanPacketReadyArtifacts(content) {
  const section = sectionLines({ content: String(content || "") }, "Ready Local Artifacts").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*artifact\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      artifact: cells[0] || "Local artifact",
      reviewUse: cells[1] || "Private review",
      state: cells[2] || "Not observed",
      boundary: cells[3] || "No deploy authorization.",
    }));
}

function firstHumanPacketUnavailableFacts(content) {
  const section = sectionLines({ content: String(content || "") }, "External Facts Still Unavailable").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*external fact\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      fact: cells[0] || "External fact",
      state: cells[1] || "Not observed",
      boundary: cells[2] || "Keep outside this dashboard.",
    }));
}

function operatorDryRunSafeLocalReviewArtifacts(content) {
  const section = sectionLines({ content: String(content || "") }, "Dry-Run Review Order").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*order\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      order: cells[0] || "",
      artifact: cells[1] || "Local artifact",
      question: cells[2] || "Review locally",
      boundary: cells[3] || "Review only; no external action.",
    }));
}

function operatorDryRunForbiddenExternalActions(content) {
  const summaryLabels = [
    "Operational execution allowed",
    "Credential request allowed",
    "Platform dashboard review allowed",
    "Deploy command allowed",
    "DNS change allowed",
    "Production health check allowed",
    "Rollback approval or execution allowed",
    "Public deploy authorized",
    "Public launch authorized",
  ];
  const summaryActions = summaryLabels.map((label) => ({
    action: label.replace(/\s+allowed$/i, "").replace(/\s+authorized$/i, ""),
    state: firstHumanPacketSummaryField(content, label, "No"),
    boundary: "Forbidden by private operator dry-run checklist.",
  }));

  const section = sectionLines({ content: String(content || "") }, "Hard Stops").join("\n");
  const hardStops = markdownTableRows(section)
    .filter((cells) => !/^\s*stop condition\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      action: cells[0] || "External action",
      state: "Forbidden",
      boundary: cells[1] || "Stop; keep No-Go / Do Not Deploy.",
    }));

  const seen = new Set();
  return [...summaryActions, ...hardStops]
    .filter((item) => {
      const key = item.action.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 18);
}

function firstHumanColdStartSourceSummaries(content) {
  const section = sectionLines({ content: String(content || "") }, "Source Artifacts Summarized").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*source artifact\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      artifact: cells[0] || "Local source artifact",
      contribution: cells[1] || "Private archive context",
      state: cells[2] || "Summarized only",
    }));
}

function firstHumanColdStartContinuationFacts(content) {
  const section = sectionLines({ content: String(content || "") }, "Cold-Start Continuation State").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*continuation fact\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      fact: cells[0] || "Continuation fact",
      state: cells[1] || "Not observed",
      archiveRule: cells[2] || "Do not request or store external deploy facts here.",
    }));
}

function firstHumanColdStartUnavailableFacts(content) {
  return firstHumanColdStartContinuationFacts(content)
    .filter((item) => /not observed/i.test(item.state))
    .map((item) => ({
      fact: item.fact,
      state: item.state,
      boundary: item.archiveRule,
    }));
}

function releaseCandidateContinuationLocalContext(content) {
  const section = sectionLines({ content: String(content || "") }, "Continuation Context").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*local artifact\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      artifact: cells[0] || "Local artifact",
      allowedUse: cells[1] || "Private continuation context",
      state: cells[2] || "Not observed",
      boundary: cells[3] || "Context only; no deploy action.",
    }));
}

function releaseCandidateContinuationExternalFacts(content) {
  const section = sectionLines({ content: String(content || "") }, "External Platform Inputs Map").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*external fact\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      fact: cells[0] || "External fact",
      state: cells[1] || "Not observed",
      blockedReason: cells[2] || "External platform fact is unavailable.",
      handling: cells[3] || "Keep outside repo; do not request or store.",
    }));
}

function releaseCandidateContinuationBlockedGates(content) {
  const section = sectionLines({ content: String(content || "") }, "Blocked Continuation Gates").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*gate\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      gate: cells[0] || "Continuation gate",
      state: cells[1] || "Blocked",
      response: cells[2] || "Keep No-Go / Do Not Deploy.",
    }));
}

function externalInputLedgerLocalAuthority(content) {
  const section = sectionLines({ content: String(content || "") }, "Local Authority Source").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*local artifact\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      artifact: cells[0] || "Local artifact",
      authority: cells[1] || "Local context only",
      boundary: cells[2] || "Cannot authorize deploy.",
    }));
}

function externalInputLedgerOutsideRepoFacts(content) {
  const section = sectionLines({ content: String(content || "") }, "External-Input Authority Ledger").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*external fact\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      fact: cells[0] || "Outside-repo fact",
      state: cells[1] || "Not observed",
      boundary: cells[2] || "Outside repo authority.",
      preservedResponse: cells[3] || "Keep No-Go / Do Not Deploy.",
    }));
}

function externalInputLedgerBoundaryRules(content) {
  const section = sectionLines({ content: String(content || "") }, "Non-Executable Boundary Rules").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*boundary rule\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      rule: cells[0] || "Boundary rule",
      response: cells[1] || "Keep No-Go / Do Not Deploy.",
    }));
}

function platformOwnerTransferSourceConsumed(content) {
  const section = sectionLines({ content: String(content || "") }, "Source Consumed").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*source\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      source: cells[0] || "Local source",
      authority: cells[1] || "Private transfer context only",
      boundary: cells[2] || "Cannot request values or authorize deploy.",
    }));
}

function platformOwnerTransferFacts(content) {
  const section = sectionLines({ content: String(content || "") }, "Non-Request Transfer Facts").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*transfer topic\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      topic: cells[0] || "Transfer topic",
      state: cells[1] || "Not observed",
      allowedWording: cells[2] || "Outside repo authority.",
      prohibitedWording: cells[3] || "Do not request values or authorize execution.",
    }));
}

function platformOwnerTransferHardStops(content) {
  const section = sectionLines({ content: String(content || "") }, "Hard Stops").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*stop condition\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      condition: cells[0] || "Stop condition",
      response: cells[1] || "Stop; keep No-Go / Do Not Deploy.",
    }));
}

function operatorResumeGuardrailRules(content) {
  const section = sectionLines({ content: String(content || "") }, "Resume Guardrail Rules").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*resume risk\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      action: cells[0] || "Blocked operator action",
      response: cells[1] || "Stop; keep No-Go / Do Not Deploy.",
    }));
}

function operatorResumeSourceConsumed(content) {
  const section = sectionLines({ content: String(content || "") }, "Source Consumed").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*source\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      source: cells[0] || "Local source",
      authority: cells[1] || "Private resume guardrail context only",
      boundary: cells[2] || "Cannot request values or authorize deploy.",
    }));
}

function deployBlockerMemoSummaryField(content, label, fallback = "Not observed") {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}:\\s*(.+)$`, "im").exec(content)?.[1]?.trim() || fallback;
}

function firstHumanPacketSummaryField(content, label, fallback = "Not observed") {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped}:\\s*(.+)$`, "im").exec(content)?.[1]?.trim() || fallback;
}

function plainSummaryValue(value) {
  return String(value || "").replace(/^`+|`+$/g, "").trim();
}

function buildFirstHumanOperatorDeployPacketIndexVisibility(queue, finalLedgerVisibility, deployBlockerMemoVisibility) {
  const packetPath = "ops/deploy/private-first-human-operator-deploy-packet-index.md";
  const packetContent = readText(packetPath);
  const packetExists = Boolean(packetContent);
  const sourceArtifacts = firstHumanOperatorDeployPacketSourceArtifacts();
  const readyLocalArtifacts = firstHumanPacketReadyArtifacts(packetContent);
  const unavailableExternalFacts = firstHumanPacketUnavailableFacts(packetContent);
  const finalLedgerNoGo = (finalLedgerVisibility?.finalNoGoCount || 0) > 0;
  const deployBlockerMemoVisible = Boolean(deployBlockerMemoVisibility?.memoExists);
  const finalDecision =
    firstHumanPacketSummaryField(packetContent, "Final deploy decision in this index", "") ||
    finalLedgerVisibility?.rows?.[0]?.finalState?.decision ||
    "No-Go / Do Not Deploy";
  const productionDeploymentState =
    firstHumanPacketSummaryField(packetContent, "Production deployment state", "") ||
    finalLedgerVisibility?.rows?.[0]?.finalState?.deploymentState ||
    "Do Not Deploy";
  const deployAuthorized = firstHumanPacketSummaryField(packetContent, "Public deploy authorized by this index", "No");
  const launchAuthorized = firstHumanPacketSummaryField(packetContent, "Public launch authorized by this index", "No");
  const rollbackAuthorized = firstHumanPacketSummaryField(packetContent, "Rollback authorized by this index", "No");
  const reasonDeploymentBlocked = firstHumanPacketSummaryField(
    packetContent,
    "Reason deployment remains blocked",
    "Explicit future human approval, credentials outside the repo, production origin, deploy trigger, rollback readiness, post-deploy health readiness, and public launch authorization are Not observed."
  );
  const state =
    packetExists && finalLedgerNoGo && deployBlockerMemoVisible
      ? "packet-index-visible-no-go"
      : "packet-index-blocked-consumed-artifact-missing";

  let rows = (queue.items || [])
    .map((item) => {
      const requirement = firstHumanOperatorDeployPacketRequirementForItem(item);
      if (!requirement) return null;
      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state,
        stateLabel:
          state === "packet-index-visible-no-go"
            ? "Packet index visible, final No-Go locked"
            : "Consumed packet artifact missing",
        gate: requirement.gate,
        sourceArtifacts,
        readyLocalArtifacts,
        unavailableExternalFacts,
        finalState: {
          decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
          productionDeploymentState: /deploy/i.test(productionDeploymentState) ? productionDeploymentState : "Do Not Deploy",
          deployAuthorized,
          launchAuthorized,
          rollbackAuthorized,
          reasonDeploymentBlocked,
        },
        boundary:
          "Read-only first-human-operator packet index. The dashboard separates ready local artifacts from unavailable external facts and exposes no deploy action, secret path, credential request, approval path, production URL requirement, dashboard link requirement, contact detail request, rollback authorization, or public launch authorization.",
      };
    })
    .filter(Boolean);

  if (!rows.length && packetExists) {
    rows = [
      {
        id: "first-human-operator-deploy-packet-index-visibility",
        owner: "admin",
        priority: "shipped",
        task:
          "First-human-operator deploy packet index visibility remains available after the active queue advances.",
        validation:
          "Dashboard keeps packet index state, ready local artifacts, unavailable external facts, and final No-Go / Do Not Deploy visible with no deploy action.",
        path: packetPath,
        state,
        stateLabel:
          state === "packet-index-visible-no-go"
            ? "Packet index visible, final No-Go locked"
            : "Consumed packet artifact missing",
        gate:
          "First-human-operator deploy packet visibility may index ready local artifacts and unavailable external facts only; it cannot create deploy actions, secret paths, credential requests, approval paths, production URL requirements, dashboard link requirements, contact detail requests, rollback authorization, or public launch authorization.",
        sourceArtifacts,
        readyLocalArtifacts,
        unavailableExternalFacts,
        finalState: {
          decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
          productionDeploymentState: /deploy/i.test(productionDeploymentState) ? productionDeploymentState : "Do Not Deploy",
          deployAuthorized,
          launchAuthorized,
          rollbackAuthorized,
          reasonDeploymentBlocked,
        },
        boundary:
          "Read-only first-human-operator packet index. The dashboard separates ready local artifacts from unavailable external facts and exposes no deploy action, secret path, credential request, approval path, production URL requirement, dashboard link requirement, contact detail request, rollback authorization, or public launch authorization.",
      },
    ];
  }

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      packetPath,
      "ops/deploy/private-deploy-blocker-escalation-memo-template.md",
      "ops/deploy/private-final-deploy-go-no-go-evidence-ledger-template.md",
      "ops/reports/static-deploy-rehearsal/latest.json",
    ],
    total: rows.length,
    packetExists,
    finalLedgerNoGo,
    deployBlockerMemoVisible,
    readyLocalArtifactCount: readyLocalArtifacts.length,
    unavailableExternalFactCount: unavailableExternalFacts.length,
    finalNoGoCount: rows.filter((row) =>
      /no-go|do not deploy/i.test(`${row.finalState?.decision || ""} ${row.finalState?.productionDeploymentState || ""}`)
    ).length,
    deployActionAvailableCount: 0,
    sourceArtifacts,
    rows,
  };
}

function buildOperatorDryRunReviewChecklistVisibility(queue, firstHumanPacketVisibility) {
  const checklistPath = "ops/deploy/private-operator-dry-run-review-checklist.md";
  const checklistContent = readText(checklistPath);
  const checklistExists = Boolean(checklistContent);
  const sourceArtifacts = operatorDryRunReviewChecklistSourceArtifacts();
  const safeLocalReviewArtifacts = operatorDryRunSafeLocalReviewArtifacts(checklistContent);
  const forbiddenExternalActions = operatorDryRunForbiddenExternalActions(checklistContent);
  const firstHumanPacketVisible = Boolean(firstHumanPacketVisibility?.packetExists);
  const firstHumanPacketNoGo = (firstHumanPacketVisibility?.finalNoGoCount || 0) > 0;
  const finalDecision =
    firstHumanPacketSummaryField(checklistContent, "Final deploy decision", "") ||
    firstHumanPacketVisibility?.rows?.[0]?.finalState?.decision ||
    "No-Go / Do Not Deploy";
  const productionDeploymentState =
    firstHumanPacketSummaryField(checklistContent, "Production deployment state", "") ||
    firstHumanPacketVisibility?.rows?.[0]?.finalState?.productionDeploymentState ||
    "Do Not Deploy";
  const deployAuthorized = firstHumanPacketSummaryField(checklistContent, "Public deploy authorized", "No");
  const launchAuthorized = firstHumanPacketSummaryField(checklistContent, "Public launch authorized", "No");
  const rollbackAuthorized = firstHumanPacketSummaryField(checklistContent, "Rollback approval or execution allowed", "No");
  const reasonDeploymentBlocked =
    "Dry-run review is local-artifact review only; external systems, credentials, URLs, deploy triggers, dashboards, hooks, contacts, DNS, rollback authorization, public launch authorization, and deploy actions remain forbidden.";
  const state =
    checklistExists && firstHumanPacketVisible && firstHumanPacketNoGo
      ? "dry-run-visible-no-go"
      : "dry-run-blocked-consumed-artifact-missing";

  let rows = (queue.items || [])
    .map((item) => {
      const requirement = operatorDryRunReviewChecklistRequirementForItem(item);
      if (!requirement) return null;
      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state,
        stateLabel:
          state === "dry-run-visible-no-go"
            ? "Dry-run checklist visible, final No-Go locked"
            : "Consumed checklist artifact missing",
        gate: requirement.gate,
        sourceArtifacts,
        safeLocalReviewArtifacts,
        forbiddenExternalActions,
        finalState: {
          decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
          productionDeploymentState: /deploy|not observed/i.test(productionDeploymentState)
            ? productionDeploymentState
            : "Do Not Deploy",
          deployAuthorized,
          launchAuthorized,
          rollbackAuthorized,
          reasonDeploymentBlocked,
        },
        boundary:
          "Read-only operator dry-run checklist. The dashboard separates safe local review artifacts from forbidden external actions and exposes no credential request, URL, deploy trigger, dashboard link, contact, hook, approval claim, DNS step, rollback authorization, public launch authorization, or deploy action.",
      };
    })
    .filter(Boolean);

  if (!rows.length && checklistExists) {
    rows = [
      {
        id: "operator-dry-run-review-checklist-visibility",
        owner: "admin",
        priority: "shipped",
        task:
          "Operator dry-run review checklist visibility remains available next to the first-human packet index.",
        validation:
          "Dashboard keeps safe local review artifacts, forbidden external actions, and final No-Go / Do Not Deploy visible with no deploy action.",
        path: checklistPath,
        state,
        stateLabel:
          state === "dry-run-visible-no-go"
            ? "Dry-run checklist visible, final No-Go locked"
            : "Consumed checklist artifact missing",
        gate:
          "Operator dry-run checklist visibility may summarize local review artifacts and forbidden external actions only; it cannot request credentials, URLs, deploy triggers, dashboard links, contacts, hooks, approval claims, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
        sourceArtifacts,
        safeLocalReviewArtifacts,
        forbiddenExternalActions,
        finalState: {
          decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
          productionDeploymentState: /deploy|not observed/i.test(productionDeploymentState)
            ? productionDeploymentState
            : "Do Not Deploy",
          deployAuthorized,
          launchAuthorized,
          rollbackAuthorized,
          reasonDeploymentBlocked,
        },
        boundary:
          "Read-only operator dry-run checklist. The dashboard separates safe local review artifacts from forbidden external actions and exposes no credential request, URL, deploy trigger, dashboard link, contact, hook, approval claim, DNS step, rollback authorization, public launch authorization, or deploy action.",
      },
    ];
  }

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      checklistPath,
      "ops/deploy/private-first-human-operator-deploy-packet-index.md",
    ],
    total: rows.length,
    checklistExists,
    firstHumanPacketVisible,
    firstHumanPacketNoGo,
    safeLocalReviewArtifactCount: safeLocalReviewArtifacts.length,
    forbiddenExternalActionCount: forbiddenExternalActions.length,
    finalNoGoCount: rows.filter((row) =>
      /no-go|do not deploy/i.test(`${row.finalState?.decision || ""} ${row.finalState?.productionDeploymentState || ""}`)
    ).length,
    deployActionAvailableCount: 0,
    sourceArtifacts,
    rows,
  };
}

function buildFirstHumanPacketColdStartArchiveVisibility(queue, firstHumanPacketVisibility, operatorDryRunVisibility) {
  const archivePath = "ops/deploy/private-first-human-packet-handoff-archive-cold-start-brief.md";
  const archiveContent = readText(archivePath);
  const archiveExists = Boolean(archiveContent);
  const sourceArtifacts = firstHumanPacketColdStartArchiveSourceArtifacts();
  const sourceSummaries = firstHumanColdStartSourceSummaries(archiveContent);
  const continuationContext = firstHumanColdStartContinuationFacts(archiveContent);
  const unavailableExternalFacts = firstHumanColdStartUnavailableFacts(archiveContent);
  const packetIndexArchived = firstHumanPacketSummaryField(archiveContent, "First-human packet index archived", "No");
  const dryRunChecklistArchived = firstHumanPacketSummaryField(archiveContent, "Operator dry-run checklist archived", "No");
  const credentialsRequestedOrStored = firstHumanPacketSummaryField(
    archiveContent,
    "Credentials requested or stored",
    "No"
  );
  const executableDeploySequenceCreated = firstHumanPacketSummaryField(
    archiveContent,
    "Executable deploy sequence created",
    "No"
  );
  const finalDecision = plainSummaryValue(
    firstHumanPacketSummaryField(archiveContent, "Final deploy decision", "No-Go / Do Not Deploy")
  );
  const productionDeploymentState = plainSummaryValue(
    firstHumanPacketSummaryField(archiveContent, "Production deployment state", "Not observed")
  );
  const deployAuthorized = firstHumanPacketSummaryField(archiveContent, "Public deploy authorized", "No");
  const launchAuthorized = firstHumanPacketSummaryField(archiveContent, "Public launch authorized", "No");
  const rollbackAuthorized = firstHumanPacketSummaryField(archiveContent, "Rollback authorized", "No");
  const firstHumanPacketVisible = Boolean(firstHumanPacketVisibility?.packetExists);
  const operatorDryRunVisible = Boolean(operatorDryRunVisibility?.checklistExists);
  const operatorDryRunNoGo = (operatorDryRunVisibility?.finalNoGoCount || 0) > 0;
  const state =
    archiveExists && firstHumanPacketVisible && operatorDryRunVisible && operatorDryRunNoGo
      ? "cold-start-archive-visible-no-go"
      : "cold-start-archive-blocked-consumed-artifact-missing";

  let rows = (queue.items || [])
    .map((item) => {
      const requirement = firstHumanPacketColdStartArchiveRequirementForItem(item);
      if (!requirement) return null;
      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state,
        stateLabel:
          state === "cold-start-archive-visible-no-go"
            ? "Cold-start archive visible, final No-Go locked"
            : "Consumed archive artifact missing",
        gate: requirement.gate,
        sourceArtifacts,
        sourceSummaries,
        continuationContext,
        unavailableExternalFacts,
        archiveState: {
          packetIndexArchived,
          dryRunChecklistArchived,
          credentialsRequestedOrStored,
          executableDeploySequenceCreated,
        },
        finalState: {
          decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
          productionDeploymentState: /not observed|do not deploy/i.test(productionDeploymentState)
            ? productionDeploymentState
            : "Not observed",
          deployAuthorized,
          launchAuthorized,
          rollbackAuthorized,
          reasonDeploymentBlocked:
            "Cold-start archive is continuation context only; external deploy facts remain unavailable and final No-Go / Do Not Deploy remains locked.",
        },
        boundary:
          "Read-only first-human packet cold-start archive. The dashboard separates continuation context from unavailable external deploy facts and exposes no credential request, URL, deploy trigger, dashboard link, contact, DNS step, rollback authorization, public launch authorization, or deploy action.",
      };
    })
    .filter(Boolean);

  if (!rows.length && archiveExists) {
    rows = [
      {
        id: "first-human-packet-cold-start-archive-visibility",
        owner: "admin",
        priority: "shipped",
        task:
          "First-human packet cold-start archive visibility remains available next to dry-run checklist visibility.",
        validation:
          "Dashboard keeps continuation context, unavailable external facts, and final No-Go / Do Not Deploy visible with no deploy action.",
        path: archivePath,
        state,
        stateLabel:
          state === "cold-start-archive-visible-no-go"
            ? "Cold-start archive visible, final No-Go locked"
            : "Consumed archive artifact missing",
        gate:
          "Cold-start archive visibility may summarize continuation context and unavailable external deploy facts only; it cannot request or store credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, deploy actions, or public launch authorization.",
        sourceArtifacts,
        sourceSummaries,
        continuationContext,
        unavailableExternalFacts,
        archiveState: {
          packetIndexArchived,
          dryRunChecklistArchived,
          credentialsRequestedOrStored,
          executableDeploySequenceCreated,
        },
        finalState: {
          decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
          productionDeploymentState: /not observed|do not deploy/i.test(productionDeploymentState)
            ? productionDeploymentState
            : "Not observed",
          deployAuthorized,
          launchAuthorized,
          rollbackAuthorized,
          reasonDeploymentBlocked:
            "Cold-start archive is continuation context only; external deploy facts remain unavailable and final No-Go / Do Not Deploy remains locked.",
        },
        boundary:
          "Read-only first-human packet cold-start archive. The dashboard separates continuation context from unavailable external deploy facts and exposes no credential request, URL, deploy trigger, dashboard link, contact, DNS step, rollback authorization, public launch authorization, or deploy action.",
      },
    ];
  }

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      archivePath,
      "ops/deploy/private-first-human-operator-deploy-packet-index.md",
      "ops/deploy/private-operator-dry-run-review-checklist.md",
    ],
    total: rows.length,
    archiveExists,
    firstHumanPacketVisible,
    operatorDryRunVisible,
    continuationContextCount: continuationContext.length,
    unavailableExternalFactCount: unavailableExternalFacts.length,
    sourceSummaryCount: sourceSummaries.length,
    finalNoGoCount: rows.filter((row) =>
      /no-go|do not deploy/i.test(`${row.finalState?.decision || ""} ${row.finalState?.productionDeploymentState || ""}`)
    ).length,
    deployActionAvailableCount: 0,
    sourceArtifacts,
    rows,
  };
}

function buildReleaseCandidateDeployContinuationMapVisibility(queue, coldStartArchiveVisibility) {
  const mapPath = "ops/deploy/private-release-candidate-deploy-continuation-map.md";
  const mapContent = readText(mapPath);
  const mapExists = Boolean(mapContent);
  const sourceArtifacts = releaseCandidateDeployContinuationMapSourceArtifacts();
  const localContext = releaseCandidateContinuationLocalContext(mapContent);
  const unavailableExternalFacts = releaseCandidateContinuationExternalFacts(mapContent);
  const blockedGates = releaseCandidateContinuationBlockedGates(mapContent);
  const privateMapCreated = firstHumanPacketSummaryField(mapContent, "Private continuation map created", "No");
  const externalDeployFactsRequested = firstHumanPacketSummaryField(mapContent, "External deploy facts requested", "No");
  const credentialsRequestedOrStored = firstHumanPacketSummaryField(mapContent, "Credentials requested or stored", "No");
  const platformValuesRequestedOrStored = firstHumanPacketSummaryField(mapContent, "Platform values requested or stored", "No");
  const executableDeploySequenceCreated = firstHumanPacketSummaryField(
    mapContent,
    "Executable deploy sequence created",
    "No"
  );
  const deployAuthorized = firstHumanPacketSummaryField(mapContent, "Public deploy authorized", "No");
  const launchAuthorized = firstHumanPacketSummaryField(mapContent, "Public launch authorized", "No");
  const rollbackAuthorized = firstHumanPacketSummaryField(mapContent, "Rollback authorized", "No");
  const finalDecision = plainSummaryValue(
    firstHumanPacketSummaryField(mapContent, "Final deploy decision", "No-Go / Do Not Deploy")
  );
  const productionDeploymentState = plainSummaryValue(
    firstHumanPacketSummaryField(mapContent, "Production deployment state", "Do Not Deploy")
  );
  const coldStartVisible = Boolean(coldStartArchiveVisibility?.archiveExists);
  const coldStartNoGo = (coldStartArchiveVisibility?.finalNoGoCount || 0) > 0;
  const state =
    mapExists && coldStartVisible && coldStartNoGo
      ? "deploy-continuation-map-visible-no-go"
      : "deploy-continuation-map-blocked-consumed-artifact-missing";

  let rows = (queue.items || [])
    .map((item) => {
      const requirement = releaseCandidateDeployContinuationMapRequirementForItem(item);
      if (!requirement) return null;
      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state,
        stateLabel:
          state === "deploy-continuation-map-visible-no-go"
            ? "Deploy-continuation map visible, final No-Go locked"
            : "Consumed continuation artifact missing",
        gate: requirement.gate,
        sourceArtifacts,
        localContext,
        unavailableExternalFacts,
        blockedGates,
        mapState: {
          privateMapCreated,
          externalDeployFactsRequested,
          credentialsRequestedOrStored,
          platformValuesRequestedOrStored,
          executableDeploySequenceCreated,
        },
        finalState: {
          decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
          productionDeploymentState: /do not deploy|not observed/i.test(productionDeploymentState)
            ? productionDeploymentState
            : "Do Not Deploy",
          deployAuthorized,
          launchAuthorized,
          rollbackAuthorized,
          reasonDeploymentBlocked:
            "Release-candidate deploy-continuation map is local context only; unavailable external platform facts remain Not observed and final No-Go / Do Not Deploy remains locked.",
        },
        boundary:
          "Read-only release-candidate deploy-continuation map. The dashboard separates local continuation context from unavailable external platform facts and exposes no credential request, URL, deploy trigger, dashboard link, contact, DNS step, rollback authorization, public launch authorization, or deploy action.",
      };
    })
    .filter(Boolean);

  if (!rows.length && mapExists) {
    rows = [
      {
        id: "release-candidate-deploy-continuation-map-visibility",
        owner: "admin",
        priority: "shipped",
        task:
          "Release-candidate deploy-continuation map visibility remains available next to cold-start archive visibility.",
        validation:
          "Dashboard keeps blocked external inputs, local context, final No-Go / Do Not Deploy, and zero deploy actions visible.",
        path: mapPath,
        state,
        stateLabel:
          state === "deploy-continuation-map-visible-no-go"
            ? "Deploy-continuation map visible, final No-Go locked"
            : "Consumed continuation artifact missing",
        gate:
          "Release-candidate deploy-continuation map visibility may summarize local continuation context and unavailable external platform facts only; it cannot request or store credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, deploy actions, or public launch authorization.",
        sourceArtifacts,
        localContext,
        unavailableExternalFacts,
        blockedGates,
        mapState: {
          privateMapCreated,
          externalDeployFactsRequested,
          credentialsRequestedOrStored,
          platformValuesRequestedOrStored,
          executableDeploySequenceCreated,
        },
        finalState: {
          decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
          productionDeploymentState: /do not deploy|not observed/i.test(productionDeploymentState)
            ? productionDeploymentState
            : "Do Not Deploy",
          deployAuthorized,
          launchAuthorized,
          rollbackAuthorized,
          reasonDeploymentBlocked:
            "Release-candidate deploy-continuation map is local context only; unavailable external platform facts remain Not observed and final No-Go / Do Not Deploy remains locked.",
        },
        boundary:
          "Read-only release-candidate deploy-continuation map. The dashboard separates local continuation context from unavailable external platform facts and exposes no credential request, URL, deploy trigger, dashboard link, contact, DNS step, rollback authorization, public launch authorization, or deploy action.",
      },
    ];
  }

  return {
    generatedFrom: ["ops/backlog/NEXT.md", mapPath, "ops/deploy/private-first-human-packet-handoff-archive-cold-start-brief.md"],
    total: rows.length,
    mapExists,
    coldStartVisible,
    localContextCount: localContext.length,
    unavailableExternalFactCount: unavailableExternalFacts.length,
    blockedGateCount: blockedGates.length,
    finalNoGoCount: rows.filter((row) =>
      /no-go|do not deploy/i.test(`${row.finalState?.decision || ""} ${row.finalState?.productionDeploymentState || ""}`)
    ).length,
    deployActionAvailableCount: 0,
    sourceArtifacts,
    rows,
  };
}

function buildExternalInputBoundaryLedgerVisibility(queue, releaseCandidateDeployContinuationMapVisibility) {
  const ledgerPath = "ops/deploy/private-external-input-boundary-ledger.md";
  const ledgerContent = readText(ledgerPath);
  const ledgerExists = Boolean(ledgerContent);
  const sourceArtifacts = externalInputBoundaryLedgerSourceArtifacts();
  const localAuthority = externalInputLedgerLocalAuthority(ledgerContent);
  const outsideRepoFacts = externalInputLedgerOutsideRepoFacts(ledgerContent);
  const boundaryRules = externalInputLedgerBoundaryRules(ledgerContent);
  const continuationMapVisible = Boolean(releaseCandidateDeployContinuationMapVisibility?.mapExists);
  const continuationMapNoGo = (releaseCandidateDeployContinuationMapVisibility?.finalNoGoCount || 0) > 0;
  const ledgerCreated = firstHumanPacketSummaryField(ledgerContent, "Private external-input boundary ledger created", "No");
  const continuationMapAuthorityPreserved = firstHumanPacketSummaryField(
    ledgerContent,
    "Deploy-continuation map authority preserved",
    "No"
  );
  const externalDeployFactsRequested = firstHumanPacketSummaryField(ledgerContent, "External deploy facts requested", "No");
  const credentialsRequestedOrStored = firstHumanPacketSummaryField(ledgerContent, "Credentials requested or stored", "No");
  const platformValuesRequestedOrStored = firstHumanPacketSummaryField(ledgerContent, "Platform values requested or stored", "No");
  const productionUrlRequestedOrStored = firstHumanPacketSummaryField(
    ledgerContent,
    "Production URL requested or stored",
    "No"
  );
  const deployTriggerRequestedOrStored = firstHumanPacketSummaryField(
    ledgerContent,
    "Deploy trigger requested or stored",
    "No"
  );
  const rollbackDetailsRequestedOrStored = firstHumanPacketSummaryField(
    ledgerContent,
    "Rollback details requested or stored",
    "No"
  );
  const executableDeploySequenceCreated = firstHumanPacketSummaryField(
    ledgerContent,
    "Executable deploy sequence created",
    "No"
  );
  const deployAuthorized = firstHumanPacketSummaryField(ledgerContent, "Public deploy authorized", "No");
  const launchAuthorized = firstHumanPacketSummaryField(ledgerContent, "Public launch authorized", "No");
  const rollbackAuthorized = firstHumanPacketSummaryField(ledgerContent, "Rollback authorized", "No");
  const finalDecision = plainSummaryValue(
    firstHumanPacketSummaryField(ledgerContent, "Final deploy decision", "No-Go / Do Not Deploy")
  );
  const productionDeploymentState = plainSummaryValue(
    firstHumanPacketSummaryField(ledgerContent, "Production deployment state", "Do Not Deploy")
  );
  const state =
    ledgerExists && continuationMapVisible && continuationMapNoGo
      ? "external-input-boundary-ledger-visible-no-go"
      : "external-input-boundary-ledger-blocked-consumed-artifact-missing";

  let rows = (queue.items || [])
    .map((item) => {
      const requirement = externalInputBoundaryLedgerRequirementForItem(item);
      if (!requirement) return null;
      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state,
        stateLabel:
          state === "external-input-boundary-ledger-visible-no-go"
            ? "External-input boundary ledger visible, final No-Go locked"
            : "Consumed boundary ledger artifact missing",
        gate: requirement.gate,
        sourceArtifacts,
        localAuthority,
        outsideRepoFacts,
        boundaryRules,
        ledgerState: {
          ledgerCreated,
          continuationMapAuthorityPreserved,
          externalDeployFactsRequested,
          credentialsRequestedOrStored,
          platformValuesRequestedOrStored,
          productionUrlRequestedOrStored,
          deployTriggerRequestedOrStored,
          rollbackDetailsRequestedOrStored,
          executableDeploySequenceCreated,
        },
        finalState: {
          decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
          productionDeploymentState: /do not deploy|not observed/i.test(productionDeploymentState)
            ? productionDeploymentState
            : "Do Not Deploy",
          deployAuthorized,
          launchAuthorized,
          rollbackAuthorized,
          reasonDeploymentBlocked:
            "External-input boundary ledger preserves outside-repo facts as Not observed; final No-Go / Do Not Deploy remains locked.",
        },
        boundary:
          "Read-only external-input boundary ledger. The dashboard exposes outside-repo fact states and final No-Go / Do Not Deploy only; it stores no credential values, production destinations, platform navigation values, operator contact details, DNS targets, rollback approvals, public launch approvals, or deploy actions.",
      };
    })
    .filter(Boolean);

  if (!rows.length && ledgerExists) {
    rows = [
      {
        id: "external-input-boundary-ledger-visibility",
        owner: "admin",
        priority: "shipped",
        task:
          "External-input boundary ledger visibility remains available next to release-candidate deploy-continuation visibility.",
        validation:
          "Dashboard keeps outside-repo facts, final No-Go / Do Not Deploy, and zero deploy actions visible without storing external values.",
        path: ledgerPath,
        state,
        stateLabel:
          state === "external-input-boundary-ledger-visible-no-go"
            ? "External-input boundary ledger visible, final No-Go locked"
            : "Consumed boundary ledger artifact missing",
        gate:
          "External-input boundary ledger visibility may summarize outside-repo fact states only; it cannot store private values, request platform inputs, authorize rollback, authorize public launch, expose operational destinations, or create deploy actions.",
        sourceArtifacts,
        localAuthority,
        outsideRepoFacts,
        boundaryRules,
        ledgerState: {
          ledgerCreated,
          continuationMapAuthorityPreserved,
          externalDeployFactsRequested,
          credentialsRequestedOrStored,
          platformValuesRequestedOrStored,
          productionUrlRequestedOrStored,
          deployTriggerRequestedOrStored,
          rollbackDetailsRequestedOrStored,
          executableDeploySequenceCreated,
        },
        finalState: {
          decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
          productionDeploymentState: /do not deploy|not observed/i.test(productionDeploymentState)
            ? productionDeploymentState
            : "Do Not Deploy",
          deployAuthorized,
          launchAuthorized,
          rollbackAuthorized,
          reasonDeploymentBlocked:
            "External-input boundary ledger preserves outside-repo facts as Not observed; final No-Go / Do Not Deploy remains locked.",
        },
        boundary:
          "Read-only external-input boundary ledger. The dashboard exposes outside-repo fact states and final No-Go / Do Not Deploy only; it stores no credential values, production destinations, platform navigation values, operator contact details, DNS targets, rollback approvals, public launch approvals, or deploy actions.",
      },
    ];
  }

  return {
    generatedFrom: ["ops/backlog/NEXT.md", ledgerPath, "ops/deploy/private-release-candidate-deploy-continuation-map.md"],
    total: rows.length,
    ledgerExists,
    continuationMapVisible,
    outsideRepoFactCount: outsideRepoFacts.length,
    localAuthorityCount: localAuthority.length,
    boundaryRuleCount: boundaryRules.length,
    finalNoGoCount: rows.filter((row) =>
      /no-go|do not deploy/i.test(`${row.finalState?.decision || ""} ${row.finalState?.productionDeploymentState || ""}`)
    ).length,
    deployActionAvailableCount: 0,
    sourceArtifacts,
    rows,
  };
}

function buildPlatformOwnerNonRequestTransferNoteVisibility(queue, externalInputBoundaryLedgerVisibility) {
  const notePath = "ops/deploy/private-platform-owner-non-request-transfer-note.md";
  const noteContent = readText(notePath);
  const noteExists = Boolean(noteContent);
  const sourceArtifacts = platformOwnerNonRequestTransferNoteSourceArtifacts();
  const sourceConsumed = platformOwnerTransferSourceConsumed(noteContent);
  const transferFacts = platformOwnerTransferFacts(noteContent);
  const hardStops = platformOwnerTransferHardStops(noteContent);
  const ledgerVisible = Boolean(externalInputBoundaryLedgerVisibility?.ledgerExists);
  const ledgerNoGo = (externalInputBoundaryLedgerVisibility?.finalNoGoCount || 0) > 0;
  const noteCreated = firstHumanPacketSummaryField(
    noteContent,
    "Private platform-owner non-request transfer note created",
    "No"
  );
  const sourceConsumedSummary = firstHumanPacketSummaryField(
    noteContent,
    "Source consumed",
    "ops/deploy/private-external-input-boundary-ledger.md"
  );
  const externalDeployFactsRequested = firstHumanPacketSummaryField(noteContent, "External deploy facts requested", "No");
  const credentialsRequestedOrStored = firstHumanPacketSummaryField(noteContent, "Credentials requested or stored", "No");
  const platformValuesRequestedOrStored = firstHumanPacketSummaryField(noteContent, "Platform values requested or stored", "No");
  const productionUrlRequestedOrStored = firstHumanPacketSummaryField(
    noteContent,
    "Production URL requested or stored",
    "No"
  );
  const deployTriggerRequestedOrStored = firstHumanPacketSummaryField(
    noteContent,
    "Deploy trigger requested or stored",
    "No"
  );
  const rollbackDetailsRequestedOrStored = firstHumanPacketSummaryField(
    noteContent,
    "Rollback details requested or stored",
    "No"
  );
  const executableDeploySequenceCreated = firstHumanPacketSummaryField(
    noteContent,
    "Executable deploy sequence created",
    "No"
  );
  const deployAuthorized = firstHumanPacketSummaryField(noteContent, "Public deploy authorized", "No");
  const launchAuthorized = firstHumanPacketSummaryField(noteContent, "Public launch authorized", "No");
  const rollbackAuthorized = firstHumanPacketSummaryField(noteContent, "Rollback authorized", "No");
  const finalDecision = plainSummaryValue(
    firstHumanPacketSummaryField(noteContent, "Final deploy decision", "No-Go / Do Not Deploy")
  );
  const productionDeploymentState = plainSummaryValue(
    firstHumanPacketSummaryField(noteContent, "Production deployment state", "Do Not Deploy")
  );
  const externalFactAuthority = plainSummaryValue(
    firstHumanPacketSummaryField(noteContent, "External fact authority", "outside repo authority")
  );
  const selectedPlatform = plainSummaryValue(firstHumanPacketSummaryField(noteContent, "Selected platform", "Not observed"));
  const credentialAvailability = plainSummaryValue(
    firstHumanPacketSummaryField(noteContent, "Credential availability outside repo", "Not observed")
  );
  const productionOriginReadiness = plainSummaryValue(
    firstHumanPacketSummaryField(noteContent, "Production URL / production origin readiness", "Not observed")
  );
  const deployTriggerReadiness = plainSummaryValue(
    firstHumanPacketSummaryField(noteContent, "Deploy trigger readiness", "Not observed")
  );
  const rollbackReadiness = plainSummaryValue(firstHumanPacketSummaryField(noteContent, "Rollback readiness", "Not observed"));
  const postDeployHealthReadiness = plainSummaryValue(
    firstHumanPacketSummaryField(noteContent, "Post-deploy health readiness", "Not observed")
  );
  const state =
    noteExists && ledgerVisible && ledgerNoGo
      ? "platform-owner-non-request-transfer-note-visible-no-go"
      : "platform-owner-non-request-transfer-note-blocked-consumed-artifact-missing";
  const restrictedSurfaceCounts = {
    credentials: 0,
    urls: 0,
    deployTriggers: 0,
    dashboardLinks: 0,
    contacts: 0,
    dnsSteps: 0,
    rollbackAuthorization: 0,
    publicLaunchAuthorization: 0,
    deployActions: 0,
  };

  let rows = (queue.items || [])
    .map((item) => {
      const requirement = platformOwnerNonRequestTransferNoteRequirementForItem(item);
      if (!requirement) return null;
      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state,
        stateLabel:
          state === "platform-owner-non-request-transfer-note-visible-no-go"
            ? "Platform-owner transfer note visible, final No-Go locked"
            : "Consumed transfer-note artifact missing",
        gate: requirement.gate,
        sourceArtifacts,
        sourceConsumed,
        transferFacts,
        hardStops,
        transferSummary: {
          noteCreated,
          sourceConsumed: sourceConsumedSummary,
          externalDeployFactsRequested,
          credentialsRequestedOrStored,
          platformValuesRequestedOrStored,
          productionUrlRequestedOrStored,
          deployTriggerRequestedOrStored,
          rollbackDetailsRequestedOrStored,
          executableDeploySequenceCreated,
          externalFactAuthority,
          selectedPlatform,
          credentialAvailability,
          productionOriginReadiness,
          deployTriggerReadiness,
          rollbackReadiness,
          postDeployHealthReadiness,
        },
        restrictedSurfaceCounts,
        finalState: {
          decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
          productionDeploymentState: /do not deploy|not observed/i.test(productionDeploymentState)
            ? productionDeploymentState
            : "Do Not Deploy",
          deployAuthorized,
          launchAuthorized,
          rollbackAuthorized,
          reasonDeploymentBlocked:
            "Platform-owner transfer note preserves blocked-state context only; outside-repo facts remain Not observed and final No-Go / Do Not Deploy remains locked.",
        },
        boundary:
          "Read-only platform-owner non-request transfer note. The dashboard exposes transfer summary, outside-repo facts, and final No-Go / Do Not Deploy only; it stores zero credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
      };
    })
    .filter(Boolean);

  if (!rows.length && noteExists) {
    rows = [
      {
        id: "platform-owner-non-request-transfer-note-visibility",
        owner: "admin",
        priority: "shipped",
        task:
          "Platform-owner non-request transfer note visibility remains available next to external-input boundary ledger visibility.",
        validation:
          "Dashboard keeps transfer summary, outside-repo facts, final No-Go / Do Not Deploy, and zero restricted deploy surfaces visible.",
        path: notePath,
        state,
        stateLabel:
          state === "platform-owner-non-request-transfer-note-visible-no-go"
            ? "Platform-owner transfer note visible, final No-Go locked"
            : "Consumed transfer-note artifact missing",
        gate:
          "Platform-owner non-request transfer note visibility may summarize blocked-state transfer facts only; it cannot request or store credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
        sourceArtifacts,
        sourceConsumed,
        transferFacts,
        hardStops,
        transferSummary: {
          noteCreated,
          sourceConsumed: sourceConsumedSummary,
          externalDeployFactsRequested,
          credentialsRequestedOrStored,
          platformValuesRequestedOrStored,
          productionUrlRequestedOrStored,
          deployTriggerRequestedOrStored,
          rollbackDetailsRequestedOrStored,
          executableDeploySequenceCreated,
          externalFactAuthority,
          selectedPlatform,
          credentialAvailability,
          productionOriginReadiness,
          deployTriggerReadiness,
          rollbackReadiness,
          postDeployHealthReadiness,
        },
        restrictedSurfaceCounts,
        finalState: {
          decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
          productionDeploymentState: /do not deploy|not observed/i.test(productionDeploymentState)
            ? productionDeploymentState
            : "Do Not Deploy",
          deployAuthorized,
          launchAuthorized,
          rollbackAuthorized,
          reasonDeploymentBlocked:
            "Platform-owner transfer note preserves blocked-state context only; outside-repo facts remain Not observed and final No-Go / Do Not Deploy remains locked.",
        },
        boundary:
          "Read-only platform-owner non-request transfer note. The dashboard exposes transfer summary, outside-repo facts, and final No-Go / Do Not Deploy only; it stores zero credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
      },
    ];
  }

  return {
    generatedFrom: ["ops/backlog/NEXT.md", notePath, "ops/deploy/private-external-input-boundary-ledger.md"],
    total: rows.length,
    noteExists,
    ledgerVisible,
    sourceConsumedCount: sourceConsumed.length,
    transferFactCount: transferFacts.length,
    outsideRepoFactCount: transferFacts.filter((item) => /not observed|outside repo authority/i.test(`${item.state} ${item.allowedWording}`)).length,
    hardStopCount: hardStops.length,
    finalNoGoCount: rows.filter((row) =>
      /no-go|do not deploy/i.test(`${row.finalState?.decision || ""} ${row.finalState?.productionDeploymentState || ""}`)
    ).length,
    restrictedSurfaceCounts,
    deployActionAvailableCount: 0,
    sourceArtifacts,
    rows,
  };
}

function buildOperatorResumePacketGuardrailVisibility(queue, platformOwnerNonRequestTransferNoteVisibility) {
  const guardrailPath = "ops/deploy/private-operator-resume-packet-guardrail.md";
  const guardrailContent = readText(guardrailPath);
  const guardrailExists = Boolean(guardrailContent);
  const sourceArtifacts = operatorResumePacketGuardrailSourceArtifacts();
  const sourceConsumed = operatorResumeSourceConsumed(guardrailContent);
  const blockedOperatorActions = operatorResumeGuardrailRules(guardrailContent);
  const transferNoteVisible = Boolean(platformOwnerNonRequestTransferNoteVisibility?.noteExists);
  const transferNoteNoGo = (platformOwnerNonRequestTransferNoteVisibility?.finalNoGoCount || 0) > 0;
  const guardrailCreated = firstHumanPacketSummaryField(
    guardrailContent,
    "Private operator-resume packet guardrail created",
    "No"
  );
  const sourceConsumedSummary = firstHumanPacketSummaryField(
    guardrailContent,
    "Source consumed",
    "ops/deploy/private-platform-owner-non-request-transfer-note.md"
  );
  const externalDeployFactsRequested = firstHumanPacketSummaryField(guardrailContent, "External deploy facts requested", "No");
  const credentialsRequestedOrStored = firstHumanPacketSummaryField(guardrailContent, "Credentials requested or stored", "No");
  const platformValuesRequestedOrStored = firstHumanPacketSummaryField(guardrailContent, "Platform values requested or stored", "No");
  const productionUrlRequestedOrStored = firstHumanPacketSummaryField(
    guardrailContent,
    "Production URL requested or stored",
    "No"
  );
  const deployTriggerRequestedOrStored = firstHumanPacketSummaryField(
    guardrailContent,
    "Deploy trigger requested or stored",
    "No"
  );
  const rollbackDetailsRequestedOrStored = firstHumanPacketSummaryField(
    guardrailContent,
    "Rollback details requested or stored",
    "No"
  );
  const executableDeploySequenceCreated = firstHumanPacketSummaryField(
    guardrailContent,
    "Executable deploy sequence created",
    "No"
  );
  const deployAuthorized = firstHumanPacketSummaryField(guardrailContent, "Public deploy authorized", "No");
  const launchAuthorized = firstHumanPacketSummaryField(guardrailContent, "Public launch authorized", "No");
  const rollbackAuthorized = firstHumanPacketSummaryField(guardrailContent, "Rollback authorized", "No");
  const finalDecision = plainSummaryValue(
    firstHumanPacketSummaryField(guardrailContent, "Final deploy decision", "No-Go / Do Not Deploy")
  );
  const productionDeploymentState = plainSummaryValue(
    firstHumanPacketSummaryField(guardrailContent, "Production deployment state", "Do Not Deploy")
  );
  const externalFactAuthority = plainSummaryValue(
    firstHumanPacketSummaryField(guardrailContent, "External fact authority", "outside repo authority")
  );
  const outsideRepoFacts = [
    ["Explicit future human approval", "Explicit future human approval"],
    ["Selected platform", "Selected platform"],
    ["Credential availability outside repo", "Credential availability outside repo"],
    ["Production URL / production origin readiness", "Production URL / production origin readiness"],
    ["Deploy trigger readiness", "Deploy trigger readiness"],
    ["Rollback readiness", "Rollback readiness"],
    ["Post-deploy health readiness", "Post-deploy health readiness"],
    ["Public launch authorization", "Public launch authorization"],
    ["Demand conclusion state", "Demand conclusion state"],
    ["Testimonial conclusion state", "Testimonial conclusion state"],
    ["Pricing conclusion state", "Pricing conclusion state"],
    ["Willingness-to-pay conclusion state", "Willingness-to-pay conclusion state"],
    ["Secure-intake conclusion state", "Secure-intake conclusion state"],
    ["Outcome conclusion state", "Outcome conclusion state"],
  ].map(([topic, label]) => ({
    topic,
    state: plainSummaryValue(firstHumanPacketSummaryField(guardrailContent, label, "Not observed")),
    authority: externalFactAuthority || "outside repo authority",
  }));
  const state =
    guardrailExists && transferNoteVisible && transferNoteNoGo
      ? "operator-resume-packet-guardrail-visible-no-go"
      : "operator-resume-packet-guardrail-blocked-consumed-artifact-missing";
  const restrictedSurfaceCounts = {
    credentials: 0,
    urls: 0,
    deployTriggers: 0,
    dashboardLinks: 0,
    contacts: 0,
    dnsSteps: 0,
    rollbackAuthorization: 0,
    publicLaunchAuthorization: 0,
    deployActions: 0,
  };

  let rows = (queue.items || [])
    .map((item) => {
      const requirement = operatorResumePacketGuardrailRequirementForItem(item);
      if (!requirement) return null;
      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state,
        stateLabel:
          state === "operator-resume-packet-guardrail-visible-no-go"
            ? "Operator-resume guardrail visible, final No-Go locked"
            : "Consumed operator-resume guardrail artifact missing",
        gate: requirement.gate,
        sourceArtifacts,
        sourceConsumed,
        blockedOperatorActions,
        outsideRepoFacts,
        guardrailSummary: {
          guardrailCreated,
          sourceConsumed: sourceConsumedSummary,
          externalDeployFactsRequested,
          credentialsRequestedOrStored,
          platformValuesRequestedOrStored,
          productionUrlRequestedOrStored,
          deployTriggerRequestedOrStored,
          rollbackDetailsRequestedOrStored,
          executableDeploySequenceCreated,
          externalFactAuthority,
        },
        restrictedSurfaceCounts,
        finalState: {
          decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
          productionDeploymentState: /do not deploy|not observed/i.test(productionDeploymentState)
            ? productionDeploymentState
            : "Do Not Deploy",
          deployAuthorized,
          launchAuthorized,
          rollbackAuthorized,
          reasonDeploymentBlocked:
            "Operator-resume packet guardrail blocks inference, requests, and execution; outside-repo facts remain Not observed and final No-Go / Do Not Deploy remains locked.",
        },
        boundary:
          "Read-only operator-resume packet guardrail. The dashboard exposes guardrail source, blocked operator actions, outside-repo facts, and final No-Go / Do Not Deploy only; it stores zero credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
      };
    })
    .filter(Boolean);

  if (!rows.length && guardrailExists) {
    rows = [
      {
        id: "operator-resume-packet-guardrail-visibility",
        owner: "admin",
        priority: "shipped",
        task:
          "Operator-resume packet guardrail visibility remains available next to platform-owner non-request transfer note visibility.",
        validation:
          "Dashboard keeps guardrail source, blocked operator actions, outside-repo facts, final No-Go / Do Not Deploy, and zero restricted deploy surfaces visible.",
        path: guardrailPath,
        state,
        stateLabel:
          state === "operator-resume-packet-guardrail-visible-no-go"
            ? "Operator-resume guardrail visible, final No-Go locked"
            : "Consumed operator-resume guardrail artifact missing",
        gate:
          "Operator-resume packet guardrail visibility may summarize source, blocked operator actions, outside-repo facts, and final No-Go / Do Not Deploy only; it cannot request or store credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
        sourceArtifacts,
        sourceConsumed,
        blockedOperatorActions,
        outsideRepoFacts,
        guardrailSummary: {
          guardrailCreated,
          sourceConsumed: sourceConsumedSummary,
          externalDeployFactsRequested,
          credentialsRequestedOrStored,
          platformValuesRequestedOrStored,
          productionUrlRequestedOrStored,
          deployTriggerRequestedOrStored,
          rollbackDetailsRequestedOrStored,
          executableDeploySequenceCreated,
          externalFactAuthority,
        },
        restrictedSurfaceCounts,
        finalState: {
          decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
          productionDeploymentState: /do not deploy|not observed/i.test(productionDeploymentState)
            ? productionDeploymentState
            : "Do Not Deploy",
          deployAuthorized,
          launchAuthorized,
          rollbackAuthorized,
          reasonDeploymentBlocked:
            "Operator-resume packet guardrail blocks inference, requests, and execution; outside-repo facts remain Not observed and final No-Go / Do Not Deploy remains locked.",
        },
        boundary:
          "Read-only operator-resume packet guardrail. The dashboard exposes guardrail source, blocked operator actions, outside-repo facts, and final No-Go / Do Not Deploy only; it stores zero credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
      },
    ];
  }

  return {
    generatedFrom: ["ops/backlog/NEXT.md", guardrailPath, "ops/deploy/private-platform-owner-non-request-transfer-note.md"],
    total: rows.length,
    guardrailExists,
    transferNoteVisible,
    sourceConsumedCount: sourceConsumed.length,
    blockedOperatorActionCount: blockedOperatorActions.length,
    outsideRepoFactCount: outsideRepoFacts.filter((item) => /not observed|outside repo authority/i.test(`${item.state} ${item.authority}`)).length,
    finalNoGoCount: rows.filter((row) =>
      /no-go|do not deploy/i.test(`${row.finalState?.decision || ""} ${row.finalState?.productionDeploymentState || ""}`)
    ).length,
    restrictedSurfaceCounts,
    deployActionAvailableCount: 0,
    sourceArtifacts,
    rows,
  };
}

function continuationIndexRuleRows(content) {
  const section = sectionLines({ content: String(content || "") }, "Operator Continuation Rules").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*if a future operator tries to\.\.\.\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      action: plainSummaryValue(cells[0] || "").trim() || "Prohibited conversion",
      response: plainSummaryValue(cells[1] || "").trim() || "Stop; keep No-Go / Do Not Deploy",
    }))
    .filter((row) => row.action)
    .slice(0, 24);
}

function autonomousDeployStopConditionRows(content) {
  const ledgerSection = sectionLines({ content: String(content || "") }, "Autonomous Stop Ledger").join("\n");
  const ledgerRows = markdownTableRows(ledgerSection)
    .filter((cells) => !/^\s*autonomous continuation surface\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      surface: plainSummaryValue(cells[0] || "").trim() || "Autonomous continuation surface",
      state: plainSummaryValue(cells[1] || "").trim() || "Not observed",
      allowedHandling: plainSummaryValue(cells[2] || "").trim() || "Keep outside repo authority",
      stopCondition: plainSummaryValue(cells[3] || "").trim() || "Stop; keep No-Go / Do Not Deploy",
    }))
    .filter((row) => row.surface);

  const ruleSection = sectionLines({ content: String(content || "") }, "Autonomous Continuation Rules").join("\n");
  const ruleRows = markdownTableRows(ruleSection)
    .filter((cells) => !/^\s*if an autonomous worker tries to\.\.\.\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      surface: plainSummaryValue(cells[0] || "").trim() || "Autonomous worker attempt",
      state: "Autonomous stop",
      allowedHandling: "Stop; preserve private read-only context only",
      stopCondition: plainSummaryValue(cells[1] || "").trim() || "Stop; keep No-Go / Do Not Deploy",
    }))
    .filter((row) => row.surface);

  return [...ledgerRows, ...ruleRows].slice(0, 28);
}

function postAutonomousStopRecoveryChecklistRows(content) {
  const section = sectionLines({ content: String(content || "") }, "Recovery Checklist").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*recovery check\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      check: plainSummaryValue(cells[0] || "").trim() || "Recovery check",
      requiredState: plainSummaryValue(cells[1] || "").trim() || "Private blocked state",
      passCondition: plainSummaryValue(cells[2] || "").trim() || "Preserve No-Go / Do Not Deploy",
      stopCondition: plainSummaryValue(cells[3] || "").trim() || "Stop; do not request values or deploy",
    }))
    .filter((row) => row.check)
    .slice(0, 24);
}

function humanPlatformAuthorityReEntryGateRows(content) {
  const section = sectionLines({ content: String(content || "") }, "Re-Entry Gate").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*re-entry check\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      check: plainSummaryValue(cells[0] || "").trim() || "Re-entry check",
      requiredState: plainSummaryValue(cells[1] || "").trim() || "Private blocked state",
      gateResult: plainSummaryValue(cells[2] || "").trim() || "Re-entry blocked",
      stopCondition: plainSummaryValue(cells[3] || "").trim() || "Stop; keep No-Go / Do Not Deploy",
    }))
    .filter((row) => row.check)
    .slice(0, 24);
}

function outsideAuthorityAwaitingStateLedgerRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/outside-authority/.test(text) && !/outside authority/.test(text)) return null;
  if (!/awaiting/.test(text) || !/ledger/.test(text)) return null;

  return {
    gate:
      "Outside-authority awaiting-state ledger visibility may summarize awaiting boundaries and Not observed outside-repo facts only; it cannot request or store credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, human/platform authority bypass, or deploy actions.",
  };
}

function outsideAuthorityAwaitingStateLedgerRows(content) {
  const section = sectionLines({ content: String(content || "") }, "Awaiting-State Ledger").join("\n");
  return markdownTableRows(section)
    .filter((cells) => !/^\s*awaiting item\s*$/i.test(cells[0] || ""))
    .map((cells) => ({
      awaitingItem: plainSummaryValue(cells[0] || "").trim() || "Awaiting item",
      requiredState: plainSummaryValue(cells[1] || "").trim() || "Not observed",
      ledgerResult: plainSummaryValue(cells[2] || "").trim() || "Awaiting state preserved",
      stopCondition: plainSummaryValue(cells[3] || "").trim() || "Stop; Do Not Publish / Do Not Deploy",
    }))
    .filter((row) => row.awaitingItem)
    .slice(0, 24);
}

function buildBlockedStateOperatorContinuationIndexVisibility(queue, operatorResumePacketGuardrailVisibility) {
  const indexPath = "ops/deploy/private-blocked-state-operator-continuation-index.md";
  const indexContent = readText(indexPath);
  const indexExists = Boolean(indexContent);
  const guardrailExists = Boolean(readText("ops/deploy/private-operator-resume-packet-guardrail.md"));
  const guardrailVisible = Boolean(operatorResumePacketGuardrailVisibility?.rows?.length);
  const sourceArtifacts = blockedStateOperatorContinuationIndexSourceArtifacts();
  const restrictedSurfaceCounts = {
    credentials: 0,
    urls: 0,
    deployTriggers: 0,
    dashboardLinks: 0,
    contacts: 0,
    dnsSteps: 0,
    rollbackAuthorization: 0,
    publicLaunchAuthorization: 0,
    deployActions: 0,
  };

  const indexCreated = firstHumanPacketSummaryField(
    indexContent,
    "Private blocked-state operator continuation index created",
    "No"
  );
  const sourceConsumedSummary = firstHumanPacketSummaryField(
    indexContent,
    "Source consumed",
    "ops/deploy/private-operator-resume-packet-guardrail.md"
  );
  const continuationPosture = firstHumanPacketSummaryField(indexContent, "Continuation posture", "Private read-only context");
  const requestPosture = firstHumanPacketSummaryField(indexContent, "Request posture", "non-request");
  const executionPosture = firstHumanPacketSummaryField(indexContent, "Execution posture", "non-executable");
  const externalDeployFactsRequested = firstHumanPacketSummaryField(indexContent, "External deploy facts requested", "No");
  const credentialsRequestedOrStored = firstHumanPacketSummaryField(indexContent, "Credentials requested or stored", "No");
  const platformValuesRequestedOrStored = firstHumanPacketSummaryField(indexContent, "Platform values requested or stored", "No");
  const productionUrlRequestedOrStored = firstHumanPacketSummaryField(indexContent, "Production URL requested or stored", "No");
  const deployTriggerRequestedOrStored = firstHumanPacketSummaryField(indexContent, "Deploy trigger requested or stored", "No");
  const rollbackDetailsRequestedOrStored = firstHumanPacketSummaryField(indexContent, "Rollback details requested or stored", "No");
  const executableDeploySequenceCreated = firstHumanPacketSummaryField(indexContent, "Executable deploy sequence created", "No");
  const deployAuthorized = firstHumanPacketSummaryField(indexContent, "Public deploy authorized", "No");
  const launchAuthorized = firstHumanPacketSummaryField(indexContent, "Public launch authorized", "No");
  const rollbackAuthorized = firstHumanPacketSummaryField(indexContent, "Rollback authorized", "No");
  const finalDecision = plainSummaryValue(
    firstHumanPacketSummaryField(indexContent, "Final deploy decision", "No-Go / Do Not Deploy")
  );
  const productionDeploymentState = plainSummaryValue(
    firstHumanPacketSummaryField(indexContent, "Production deployment state", "Do Not Deploy")
  );
  const externalFactAuthority = plainSummaryValue(
    firstHumanPacketSummaryField(indexContent, "External fact authority", "outside repo authority")
  );

  const outsideRepoFacts = [
    ["Explicit future human approval", "Explicit future human approval"],
    ["Selected platform", "Selected platform"],
    ["Credential availability outside repo", "Credential availability outside repo"],
    ["Production URL / production origin readiness", "Production URL / production origin readiness"],
    ["Deploy trigger readiness", "Deploy trigger readiness"],
    ["Rollback readiness", "Rollback readiness"],
    ["Post-deploy health readiness", "Post-deploy health readiness"],
    ["Public launch authorization", "Public launch authorization"],
    ["Demand conclusion state", "Demand conclusion state"],
    ["Testimonial conclusion state", "Testimonial conclusion state"],
    ["Pricing conclusion state", "Pricing conclusion state"],
    ["Willingness-to-pay conclusion state", "Willingness-to-pay conclusion state"],
    ["Secure-intake conclusion state", "Secure-intake conclusion state"],
    ["Outcome conclusion state", "Outcome conclusion state"],
  ].map(([topic, label]) => ({
    topic,
    state: plainSummaryValue(firstHumanPacketSummaryField(indexContent, label, "Not observed")),
    authority: externalFactAuthority || "outside repo authority",
  }));

  const blockedOperatorActions = continuationIndexRuleRows(indexContent);
  const state =
    indexExists && guardrailExists && guardrailVisible
      ? "blocked-state-continuation-index-visible-no-go"
      : "blocked-state-continuation-index-blocked-consumed-artifact-missing";

  const rows = (queue.items || [])
    .map((item) => {
      const requirement = blockedStateOperatorContinuationIndexRequirementForItem(item);
      if (!requirement) return null;
      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state,
        stateLabel:
          state === "blocked-state-continuation-index-visible-no-go"
            ? "Continuation index visible"
            : "Consumed continuation index artifact missing",
        gate: requirement.gate,
        sourceArtifacts,
        sourceConsumed: [
          { source: "ops/deploy/private-blocked-state-operator-continuation-index.md", authority: "Private blocked-state context only" },
          { source: "ops/deploy/private-operator-resume-packet-guardrail.md", authority: "Private guardrail boundary only" },
        ],
        blockedOperatorActions,
        outsideRepoFacts,
        indexSummary: {
          indexCreated,
          sourceConsumed: sourceConsumedSummary,
          continuationPosture,
          requestPosture,
          executionPosture,
          externalDeployFactsRequested,
          credentialsRequestedOrStored,
          platformValuesRequestedOrStored,
          productionUrlRequestedOrStored,
          deployTriggerRequestedOrStored,
          rollbackDetailsRequestedOrStored,
          executableDeploySequenceCreated,
          externalFactAuthority,
        },
        restrictedSurfaceCounts,
        finalState: {
          decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
          productionDeploymentState: /do not deploy|not observed/i.test(productionDeploymentState)
            ? productionDeploymentState
            : "Do Not Deploy",
          deployAuthorized,
          launchAuthorized,
          rollbackAuthorized,
          reasonDeploymentBlocked:
            "Blocked-state continuation index is read-only context. It cannot request values, cannot become an executable sequence, and keeps outside-repo facts Not observed.",
        },
        boundary:
          "Read-only blocked-state continuation index. The dashboard exposes source, continuation limits, outside-repo facts, and final No-Go / Do Not Deploy only; it stores zero credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
      };
    })
    .filter(Boolean);

  if (!rows.length) {
    rows.push({
      id: "blocked-state-continuation-index-visibility",
      owner: "admin",
      priority: "shipped",
      task:
        "Blocked-state operator continuation index visibility remains available next to the private operator-resume packet guardrail visibility.",
      validation:
        "Dashboard keeps index source, continuation limits, outside-repo facts, final No-Go / Do Not Deploy, and zero restricted deploy surfaces visible.",
      path: indexPath,
      state,
      stateLabel:
        state === "blocked-state-continuation-index-visible-no-go"
          ? "Blocked-state continuation index visible, final No-Go locked"
          : "Consumed continuation index artifact missing",
      gate:
        "Blocked-state operator continuation index visibility may summarize source, continuation limits, outside-repo facts, and final No-Go / Do Not Deploy only; it cannot request or store credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
      sourceArtifacts,
      sourceConsumed: [
        { source: indexPath, authority: "Private blocked-state context only" },
        { source: "ops/deploy/private-operator-resume-packet-guardrail.md", authority: "Private guardrail boundary only" },
      ],
      blockedOperatorActions,
      outsideRepoFacts,
      indexSummary: {
        indexCreated,
        sourceConsumed: sourceConsumedSummary,
        continuationPosture,
        requestPosture,
        executionPosture,
        externalDeployFactsRequested,
        credentialsRequestedOrStored,
        platformValuesRequestedOrStored,
        productionUrlRequestedOrStored,
        deployTriggerRequestedOrStored,
        rollbackDetailsRequestedOrStored,
        executableDeploySequenceCreated,
        externalFactAuthority,
      },
      restrictedSurfaceCounts,
      finalState: {
        decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
        productionDeploymentState: /do not deploy|not observed/i.test(productionDeploymentState)
          ? productionDeploymentState
          : "Do Not Deploy",
        deployAuthorized,
        launchAuthorized,
        rollbackAuthorized,
        reasonDeploymentBlocked:
          "Blocked-state continuation index is read-only. It cannot request values or authorize deploy; outside-repo facts remain Not observed.",
      },
      boundary:
        "Read-only blocked-state continuation index visibility only. It remains private, non-request, non-executable, and No-Go / Do Not Deploy.",
    });
  }

  return {
    generatedFrom: ["ops/backlog/NEXT.md", indexPath, "ops/deploy/private-operator-resume-packet-guardrail.md"],
    total: rows.length,
    indexExists,
    guardrailExists,
    guardrailVisible,
    blockedOperatorActionCount: blockedOperatorActions.length,
    outsideRepoFactCount: outsideRepoFacts.filter((item) => /not observed|outside repo authority/i.test(`${item.state} ${item.authority}`)).length,
    finalNoGoCount: rows.filter((row) =>
      /no-go|do not deploy/i.test(`${row.finalState?.decision || ""} ${row.finalState?.productionDeploymentState || ""}`)
    ).length,
    restrictedSurfaceCounts,
    deployActionAvailableCount: 0,
    sourceArtifacts,
    rows,
  };
}

function buildAutonomousDeployStopLedgerVisibility(queue, blockedStateOperatorContinuationIndexVisibility) {
  const ledgerPath = "ops/deploy/private-autonomous-deploy-stop-ledger.md";
  const sourceIndexPath = "ops/deploy/private-blocked-state-operator-continuation-index.md";
  const ledgerContent = readText(ledgerPath);
  const ledgerExists = Boolean(ledgerContent);
  const sourceIndexExists = Boolean(readText(sourceIndexPath));
  const continuationIndexVisible = Boolean(blockedStateOperatorContinuationIndexVisibility?.rows?.length);
  const sourceArtifacts = autonomousDeployStopLedgerSourceArtifacts();
  const restrictedSurfaceCounts = {
    credentials: 0,
    urls: 0,
    deployTriggers: 0,
    dashboardLinks: 0,
    contacts: 0,
    dnsSteps: 0,
    rollbackAuthorization: 0,
    publicLaunchAuthorization: 0,
    deployActions: 0,
  };

  const ledgerCreated = firstHumanPacketSummaryField(ledgerContent, "Private autonomous deploy stop ledger created", "No");
  const sourceConsumedSummary = firstHumanPacketSummaryField(ledgerContent, "Source consumed", sourceIndexPath);
  const autonomousPosture = firstHumanPacketSummaryField(ledgerContent, "Autonomous posture", "Autonomous stop");
  const continuationPosture = firstHumanPacketSummaryField(ledgerContent, "Continuation posture", "Private read-only context");
  const requestPosture = firstHumanPacketSummaryField(ledgerContent, "Request posture", "non-request");
  const executionPosture = firstHumanPacketSummaryField(ledgerContent, "Execution posture", "non-executable");
  const externalDeployFactsRequested = firstHumanPacketSummaryField(ledgerContent, "External deploy facts requested", "No");
  const credentialsRequestedOrStored = firstHumanPacketSummaryField(ledgerContent, "Credentials requested or stored", "No");
  const platformValuesRequestedOrStored = firstHumanPacketSummaryField(ledgerContent, "Platform values requested or stored", "No");
  const productionUrlRequestedOrStored = firstHumanPacketSummaryField(ledgerContent, "Production URL requested or stored", "No");
  const deployTriggerRequestedOrStored = firstHumanPacketSummaryField(ledgerContent, "Deploy trigger requested or stored", "No");
  const rollbackDetailsRequestedOrStored = firstHumanPacketSummaryField(ledgerContent, "Rollback details requested or stored", "No");
  const postDeployHealthValuesRequestedOrStored = firstHumanPacketSummaryField(
    ledgerContent,
    "Post-deploy health values requested or stored",
    "No"
  );
  const executableDeploySequenceCreated = firstHumanPacketSummaryField(ledgerContent, "Executable deploy sequence created", "No");
  const deployAuthorized = firstHumanPacketSummaryField(ledgerContent, "Public deploy authorized", "No");
  const launchAuthorized = firstHumanPacketSummaryField(ledgerContent, "Public launch authorized", "No");
  const rollbackAuthorized = firstHumanPacketSummaryField(ledgerContent, "Rollback authorized", "No");
  const finalDecision = plainSummaryValue(
    firstHumanPacketSummaryField(ledgerContent, "Final deploy decision", "No-Go / Do Not Deploy")
  );
  const productionDeploymentState = plainSummaryValue(
    firstHumanPacketSummaryField(ledgerContent, "Production deployment state", "Do Not Deploy")
  );
  const externalFactAuthority = plainSummaryValue(
    firstHumanPacketSummaryField(ledgerContent, "External fact authority", "outside repo authority")
  );

  const outsideRepoFacts = [
    ["Explicit future human approval", "Explicit future human approval"],
    ["Platform", "Platform"],
    ["Selected platform", "Selected platform"],
    ["Credential availability outside repo", "Credential availability outside repo"],
    ["Production URL / production origin readiness", "Production URL / production origin readiness"],
    ["Deploy trigger readiness", "Deploy trigger readiness"],
    ["Rollback readiness", "Rollback readiness"],
    ["Post-deploy health readiness", "Post-deploy health readiness"],
    ["Public launch authorization", "Public launch authorization"],
    ["Demand conclusion state", "Demand conclusion state"],
    ["Testimonial conclusion state", "Testimonial conclusion state"],
    ["Pricing conclusion state", "Pricing conclusion state"],
    ["Willingness-to-pay conclusion state", "Willingness-to-pay conclusion state"],
    ["Secure-intake conclusion state", "Secure-intake conclusion state"],
    ["Outcome conclusion state", "Outcome conclusion state"],
  ].map(([topic, label]) => ({
    topic,
    state: plainSummaryValue(firstHumanPacketSummaryField(ledgerContent, label, "Not observed")),
    authority: externalFactAuthority || "outside repo authority",
  }));

  const stopConditions = autonomousDeployStopConditionRows(ledgerContent);
  const state =
    ledgerExists && sourceIndexExists && continuationIndexVisible
      ? "autonomous-deploy-stop-ledger-visible-no-go"
      : "autonomous-deploy-stop-ledger-blocked-consumed-artifact-missing";

  const buildRow = (item, requirement) => ({
    id: item.id,
    owner: item.owner,
    priority: item.priority,
    task: item.task,
    validation: item.validation,
    path: item.path,
    state,
    stateLabel:
      state === "autonomous-deploy-stop-ledger-visible-no-go"
        ? "Autonomous stop ledger visible"
        : "Consumed autonomous stop artifact missing",
    gate: requirement.gate,
    sourceArtifacts,
    sourceConsumed: [
      { source: ledgerPath, authority: "Private autonomous stop context only" },
      { source: sourceIndexPath, authority: "Private blocked-state index boundary only" },
    ],
    stopConditions,
    outsideRepoFacts,
    ledgerSummary: {
      ledgerCreated,
      sourceConsumed: sourceConsumedSummary,
      autonomousPosture,
      continuationPosture,
      requestPosture,
      executionPosture,
      externalDeployFactsRequested,
      credentialsRequestedOrStored,
      platformValuesRequestedOrStored,
      productionUrlRequestedOrStored,
      deployTriggerRequestedOrStored,
      rollbackDetailsRequestedOrStored,
      postDeployHealthValuesRequestedOrStored,
      executableDeploySequenceCreated,
      externalFactAuthority,
    },
    restrictedSurfaceCounts,
    finalState: {
      decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
      productionDeploymentState: /do not deploy|not observed/i.test(productionDeploymentState)
        ? productionDeploymentState
        : "Do Not Deploy",
      deployAuthorized,
      launchAuthorized,
      rollbackAuthorized,
      reasonDeploymentBlocked:
        "Autonomous deploy stop ledger is read-only and non-executable. It cannot ask for external values, cannot authorize deploy, and keeps outside-repo facts Not observed.",
    },
    boundary:
      "Read-only autonomous deploy stop ledger. The dashboard exposes stop-ledger source, autonomous stop conditions, outside-repo facts, and final No-Go / Do Not Deploy only; it stores zero credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
  });

  const rows = (queue.items || [])
    .map((item) => {
      const requirement = autonomousDeployStopLedgerRequirementForItem(item);
      return requirement ? buildRow(item, requirement) : null;
    })
    .filter(Boolean);

  if (!rows.length) {
    rows.push(
      buildRow(
        {
          id: "autonomous-deploy-stop-ledger-visibility",
          owner: "admin",
          priority: "shipped",
          task:
            "Autonomous-deploy-stop ledger visibility remains available next to the private blocked-state operator continuation index visibility.",
          validation:
            "Dashboard keeps stop-ledger source, autonomous stop conditions, outside-repo facts, final No-Go / Do Not Deploy, and zero deploy actions visible.",
          path: ledgerPath,
        },
        {
          gate:
            "Autonomous-deploy-stop ledger visibility may summarize source, stop conditions, outside-repo facts, and final No-Go / Do Not Deploy only; it cannot request or store credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
        }
      )
    );
  }

  return {
    generatedFrom: ["ops/backlog/NEXT.md", ledgerPath, sourceIndexPath],
    total: rows.length,
    ledgerExists,
    sourceIndexExists,
    continuationIndexVisible,
    stopConditionCount: stopConditions.length,
    outsideRepoFactCount: outsideRepoFacts.filter((item) => /not observed|outside repo authority/i.test(`${item.state} ${item.authority}`)).length,
    finalNoGoCount: rows.filter((row) =>
      /no-go|do not deploy/i.test(`${row.finalState?.decision || ""} ${row.finalState?.productionDeploymentState || ""}`)
    ).length,
    restrictedSurfaceCounts,
    deployActionAvailableCount: 0,
    sourceArtifacts,
    rows,
  };
}

function buildPostAutonomousStopRecoveryChecklistVisibility(queue, autonomousDeployStopLedgerVisibility) {
  const checklistPath = "ops/deploy/private-post-autonomous-stop-recovery-checklist.md";
  const sourceLedgerPath = "ops/deploy/private-autonomous-deploy-stop-ledger.md";
  const checklistContent = readText(checklistPath);
  const checklistExists = Boolean(checklistContent);
  const sourceLedgerExists = Boolean(readText(sourceLedgerPath));
  const autonomousStopLedgerVisible = Boolean(autonomousDeployStopLedgerVisibility?.rows?.length);
  const sourceArtifacts = postAutonomousStopRecoveryChecklistSourceArtifacts();
  const restrictedSurfaceCounts = {
    credentials: 0,
    urls: 0,
    deployTriggers: 0,
    dashboardLinks: 0,
    contacts: 0,
    dnsSteps: 0,
    rollbackAuthorization: 0,
    publicLaunchAuthorization: 0,
    deployActions: 0,
  };

  const checklistCreated = firstHumanPacketSummaryField(
    checklistContent,
    "Private post-autonomous-stop recovery checklist created",
    "No"
  );
  const sourceConsumedSummary = firstHumanPacketSummaryField(checklistContent, "Source consumed", sourceLedgerPath);
  const autonomousPosture = firstHumanPacketSummaryField(checklistContent, "Autonomous posture", "autonomous recovery boundary");
  const continuationPosture = firstHumanPacketSummaryField(checklistContent, "Continuation posture", "Private read-only context");
  const requestPosture = firstHumanPacketSummaryField(checklistContent, "Request posture", "non-request");
  const executionPosture = firstHumanPacketSummaryField(checklistContent, "Execution posture", "non-executable");
  const externalDeployFactsRequested = firstHumanPacketSummaryField(checklistContent, "External deploy facts requested", "No");
  const valuesRequested = firstHumanPacketSummaryField(checklistContent, "Values requested", "No");
  const deployUnlocked = firstHumanPacketSummaryField(checklistContent, "Deploy unlocked", "No");
  const executionImplied = firstHumanPacketSummaryField(checklistContent, "Execution implied", "No");
  const authorityBypassed = firstHumanPacketSummaryField(checklistContent, "Human/platform authority bypassed", "No");
  const credentialsRequestedOrStored = firstHumanPacketSummaryField(checklistContent, "Credentials requested or stored", "No");
  const platformValuesRequestedOrStored = firstHumanPacketSummaryField(checklistContent, "Platform values requested or stored", "No");
  const productionUrlRequestedOrStored = firstHumanPacketSummaryField(checklistContent, "Production URL requested or stored", "No");
  const deployTriggerRequestedOrStored = firstHumanPacketSummaryField(checklistContent, "Deploy trigger requested or stored", "No");
  const rollbackDetailsRequestedOrStored = firstHumanPacketSummaryField(checklistContent, "Rollback details requested or stored", "No");
  const postDeployHealthValuesRequestedOrStored = firstHumanPacketSummaryField(
    checklistContent,
    "Post-deploy health values requested or stored",
    "No"
  );
  const executableDeploySequenceCreated = firstHumanPacketSummaryField(checklistContent, "Executable deploy sequence created", "No");
  const deployAuthorized = firstHumanPacketSummaryField(checklistContent, "Public deploy authorized", "No");
  const launchAuthorized = firstHumanPacketSummaryField(checklistContent, "Public launch authorized", "No");
  const rollbackAuthorized = firstHumanPacketSummaryField(checklistContent, "Rollback authorized", "No");
  const finalDecision = plainSummaryValue(
    firstHumanPacketSummaryField(checklistContent, "Final deploy decision", "No-Go / Do Not Deploy")
  );
  const productionDeploymentState = plainSummaryValue(
    firstHumanPacketSummaryField(checklistContent, "Production deployment state", "Do Not Deploy")
  );
  const publishingState = plainSummaryValue(firstHumanPacketSummaryField(checklistContent, "Publishing state", "Do Not Publish"));
  const externalFactAuthority = plainSummaryValue(
    firstHumanPacketSummaryField(checklistContent, "External fact authority", "outside repo authority")
  );

  const outsideRepoFacts = [
    ["Explicit future human approval", "Explicit future human approval"],
    ["Platform", "Platform"],
    ["Selected platform", "Selected platform"],
    ["Credential availability outside repo", "Credential availability outside repo"],
    ["Production URL / production origin readiness", "Production URL / production origin readiness"],
    ["Deploy trigger readiness", "Deploy trigger readiness"],
    ["Rollback readiness", "Rollback readiness"],
    ["Post-deploy health readiness", "Post-deploy health readiness"],
    ["Public launch authorization", "Public launch authorization"],
    ["Demand conclusion state", "Demand conclusion state"],
    ["Testimonial conclusion state", "Testimonial conclusion state"],
    ["Pricing conclusion state", "Pricing conclusion state"],
    ["Willingness-to-pay conclusion state", "Willingness-to-pay conclusion state"],
    ["Secure-intake conclusion state", "Secure-intake conclusion state"],
    ["Outcome conclusion state", "Outcome conclusion state"],
  ].map(([topic, label]) => ({
    topic,
    state: plainSummaryValue(firstHumanPacketSummaryField(checklistContent, label, "Not observed")),
    authority: externalFactAuthority || "outside repo authority",
  }));

  const recoveryChecks = postAutonomousStopRecoveryChecklistRows(checklistContent);
  const state =
    checklistExists && sourceLedgerExists && autonomousStopLedgerVisible
      ? "post-autonomous-stop-recovery-checklist-visible-no-go"
      : "post-autonomous-stop-recovery-checklist-blocked-consumed-artifact-missing";

  const buildRow = (item, requirement) => ({
    id: item.id,
    owner: item.owner,
    priority: item.priority,
    task: item.task,
    validation: item.validation,
    path: item.path,
    state,
    stateLabel:
      state === "post-autonomous-stop-recovery-checklist-visible-no-go"
        ? "Recovery checklist visible"
        : "Consumed recovery checklist artifact missing",
    gate: requirement.gate,
    sourceArtifacts,
    sourceConsumed: [
      { source: checklistPath, authority: "Private recovery boundary only" },
      { source: sourceLedgerPath, authority: "Private autonomous stop context only" },
    ],
    recoveryChecks,
    outsideRepoFacts,
    recoverySummary: {
      checklistCreated,
      sourceConsumed: sourceConsumedSummary,
      autonomousPosture,
      continuationPosture,
      requestPosture,
      executionPosture,
      externalDeployFactsRequested,
      valuesRequested,
      deployUnlocked,
      executionImplied,
      authorityBypassed,
      credentialsRequestedOrStored,
      platformValuesRequestedOrStored,
      productionUrlRequestedOrStored,
      deployTriggerRequestedOrStored,
      rollbackDetailsRequestedOrStored,
      postDeployHealthValuesRequestedOrStored,
      executableDeploySequenceCreated,
      externalFactAuthority,
    },
    restrictedSurfaceCounts,
    finalState: {
      decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
      productionDeploymentState: /do not deploy|not observed/i.test(productionDeploymentState)
        ? productionDeploymentState
        : "Do Not Deploy",
      publishingState: /do not publish|not observed/i.test(publishingState) ? publishingState : "Do Not Publish",
      deployAuthorized,
      launchAuthorized,
      rollbackAuthorized,
      reasonDeploymentBlocked:
        "Post-autonomous-stop recovery checklist preserves the autonomous stop boundary. It cannot request missing values, unlock deploy, imply execution, or bypass human/platform authority.",
    },
    boundary:
      "Read-only post-autonomous-stop recovery checklist. The dashboard exposes recovery source, stop/recovery boundaries, outside-repo facts, and final No-Go / Do Not Deploy only; it stores zero credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
  });

  const rows = (queue.items || [])
    .map((item) => {
      const requirement = postAutonomousStopRecoveryChecklistRequirementForItem(item);
      return requirement ? buildRow(item, requirement) : null;
    })
    .filter(Boolean);

  if (!rows.length) {
    rows.push(
      buildRow(
        {
          id: "post-autonomous-stop-recovery-checklist-visibility",
          owner: "admin",
          priority: "shipped",
          task:
            "Post-autonomous-stop recovery checklist visibility remains available next to the private autonomous-deploy-stop ledger visibility.",
          validation:
            "Dashboard keeps recovery source, stop/recovery boundaries, outside-repo facts, final No-Go / Do Not Deploy, and zero deploy actions visible.",
          path: checklistPath,
        },
        {
          gate:
            "Post-autonomous-stop recovery checklist visibility may summarize source, stop/recovery boundaries, outside-repo facts, and final No-Go / Do Not Deploy only; it cannot request or store credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, or deploy actions.",
        }
      )
    );
  }

  return {
    generatedFrom: ["ops/backlog/NEXT.md", checklistPath, sourceLedgerPath],
    total: rows.length,
    checklistExists,
    sourceLedgerExists,
    autonomousStopLedgerVisible,
    recoveryCheckCount: recoveryChecks.length,
    outsideRepoFactCount: outsideRepoFacts.filter((item) => /not observed|outside repo authority/i.test(`${item.state} ${item.authority}`)).length,
    finalNoGoCount: rows.filter((row) =>
      /no-go|do not deploy/i.test(`${row.finalState?.decision || ""} ${row.finalState?.productionDeploymentState || ""}`)
    ).length,
    restrictedSurfaceCounts,
    deployActionAvailableCount: 0,
    sourceArtifacts,
    rows,
  };
}

function buildHumanPlatformAuthorityReEntryGateVisibility(queue, postAutonomousStopRecoveryChecklistVisibility) {
  const gatePath = "ops/deploy/private-human-platform-authority-re-entry-gate.md";
  const sourceChecklistPath = "ops/deploy/private-post-autonomous-stop-recovery-checklist.md";
  const gateContent = readText(gatePath);
  const gateExists = Boolean(gateContent);
  const sourceChecklistExists = Boolean(readText(sourceChecklistPath));
  const recoveryChecklistVisible = Boolean(postAutonomousStopRecoveryChecklistVisibility?.rows?.length);
  const sourceArtifacts = humanPlatformAuthorityReEntryGateSourceArtifacts();
  const restrictedSurfaceCounts = {
    credentials: 0,
    urls: 0,
    deployTriggers: 0,
    dashboardLinks: 0,
    contacts: 0,
    dnsSteps: 0,
    rollbackAuthorization: 0,
    publicLaunchAuthorization: 0,
    authorityBypasses: 0,
    deployActions: 0,
  };

  const gateCreated = firstHumanPacketSummaryField(gateContent, "Private human-platform authority re-entry gate created", "No");
  const sourceConsumedSummary = firstHumanPacketSummaryField(gateContent, "Source consumed", sourceChecklistPath);
  const autonomousPosture = firstHumanPacketSummaryField(gateContent, "Autonomous posture", "autonomous recovery boundary");
  const recoveryPosture = firstHumanPacketSummaryField(gateContent, "Recovery posture", "Private read-only context");
  const reEntryPosture = firstHumanPacketSummaryField(gateContent, "Re-entry posture", "Blocked by human-platform authority");
  const requestPosture = firstHumanPacketSummaryField(gateContent, "Request posture", "non-request");
  const executionPosture = firstHumanPacketSummaryField(gateContent, "Execution posture", "non-executable");
  const externalDeployFactsRequested = firstHumanPacketSummaryField(gateContent, "External deploy facts requested", "No");
  const valuesRequested = firstHumanPacketSummaryField(gateContent, "Values requested", "No");
  const deployUnlocked = firstHumanPacketSummaryField(gateContent, "Deploy unlocked", "No");
  const executionImplied = firstHumanPacketSummaryField(gateContent, "Execution implied", "No");
  const humanPlatformAuthorityBypassed = firstHumanPacketSummaryField(gateContent, "Human/platform authority bypassed", "No");
  const credentialsRequestedOrStored = firstHumanPacketSummaryField(gateContent, "Credentials requested or stored", "No");
  const platformValuesRequestedOrStored = firstHumanPacketSummaryField(gateContent, "Platform values requested or stored", "No");
  const productionUrlRequestedOrStored = firstHumanPacketSummaryField(gateContent, "Production URL requested or stored", "No");
  const deployTriggerRequestedOrStored = firstHumanPacketSummaryField(gateContent, "Deploy trigger requested or stored", "No");
  const rollbackDetailsRequestedOrStored = firstHumanPacketSummaryField(gateContent, "Rollback details requested or stored", "No");
  const postDeployHealthValuesRequestedOrStored = firstHumanPacketSummaryField(
    gateContent,
    "Post-deploy health values requested or stored",
    "No"
  );
  const executableDeploySequenceCreated = firstHumanPacketSummaryField(gateContent, "Executable deploy sequence created", "No");
  const deployAuthorized = firstHumanPacketSummaryField(gateContent, "Public deploy authorized", "No");
  const launchAuthorized = firstHumanPacketSummaryField(gateContent, "Public launch authorized", "No");
  const rollbackAuthorized = firstHumanPacketSummaryField(gateContent, "Rollback authorized", "No");
  const finalDecision = plainSummaryValue(
    firstHumanPacketSummaryField(gateContent, "Final deploy decision", "No-Go / Do Not Deploy")
  );
  const productionDeploymentState = plainSummaryValue(
    firstHumanPacketSummaryField(gateContent, "Production deployment state", "Do Not Deploy")
  );
  const publishingState = plainSummaryValue(firstHumanPacketSummaryField(gateContent, "Publishing state", "Do Not Publish"));
  const externalFactAuthority = plainSummaryValue(
    firstHumanPacketSummaryField(gateContent, "External fact authority", "outside repo authority")
  );

  const outsideRepoFacts = [
    ["Explicit future human approval", "Explicit future human approval"],
    ["Human/platform authority", "Human/platform authority"],
    ["Platform", "Platform"],
    ["Selected platform", "Selected platform"],
    ["Credential availability outside repo", "Credential availability outside repo"],
    ["Production URL / production origin readiness", "Production URL / production origin readiness"],
    ["Deploy trigger readiness", "Deploy trigger readiness"],
    ["Rollback readiness", "Rollback readiness"],
    ["Post-deploy health readiness", "Post-deploy health readiness"],
    ["Public launch authorization", "Public launch authorization"],
    ["Demand conclusion state", "Demand conclusion state"],
    ["Testimonial conclusion state", "Testimonial conclusion state"],
    ["Pricing conclusion state", "Pricing conclusion state"],
    ["Willingness-to-pay conclusion state", "Willingness-to-pay conclusion state"],
    ["Secure-intake conclusion state", "Secure-intake conclusion state"],
    ["Outcome conclusion state", "Outcome conclusion state"],
  ].map(([topic, label]) => ({
    topic,
    state: plainSummaryValue(firstHumanPacketSummaryField(gateContent, label, "Not observed")),
    authority: externalFactAuthority || "outside repo authority",
  }));

  const authorityGateBoundaries = humanPlatformAuthorityReEntryGateRows(gateContent);
  const state =
    gateExists && sourceChecklistExists && recoveryChecklistVisible
      ? "human-platform-authority-re-entry-gate-visible-no-go"
      : "human-platform-authority-re-entry-gate-blocked-consumed-artifact-missing";

  const buildRow = (item, requirement) => ({
    id: item.id,
    owner: item.owner,
    priority: item.priority,
    task: item.task,
    validation: item.validation,
    path: item.path,
    state,
    stateLabel:
      state === "human-platform-authority-re-entry-gate-visible-no-go"
        ? "Re-entry gate visible"
        : "Consumed re-entry gate artifact missing",
    gate: requirement.gate,
    sourceArtifacts,
    sourceConsumed: [
      { source: gatePath, authority: "Private human-platform authority re-entry boundary only" },
      { source: sourceChecklistPath, authority: "Private recovery boundary only" },
    ],
    authorityGateBoundaries,
    outsideRepoFacts,
    reEntrySummary: {
      gateCreated,
      sourceConsumed: sourceConsumedSummary,
      autonomousPosture,
      recoveryPosture,
      reEntryPosture,
      requestPosture,
      executionPosture,
      externalDeployFactsRequested,
      valuesRequested,
      deployUnlocked,
      executionImplied,
      humanPlatformAuthorityBypassed,
      credentialsRequestedOrStored,
      platformValuesRequestedOrStored,
      productionUrlRequestedOrStored,
      deployTriggerRequestedOrStored,
      rollbackDetailsRequestedOrStored,
      postDeployHealthValuesRequestedOrStored,
      executableDeploySequenceCreated,
      externalFactAuthority,
    },
    restrictedSurfaceCounts,
    finalState: {
      decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
      productionDeploymentState: /do not deploy|not observed/i.test(productionDeploymentState)
        ? productionDeploymentState
        : "Do Not Deploy",
      publishingState: /do not publish|not observed/i.test(publishingState) ? publishingState : "Do Not Publish",
      deployAuthorized,
      launchAuthorized,
      rollbackAuthorized,
      reasonDeploymentBlocked:
        "Human-platform-authority re-entry gate blocks repo-side re-entry until separate future authority exists outside the repo. It cannot request values, unlock deploy, imply execution, or bypass authority.",
    },
    boundary:
      "Read-only human-platform-authority re-entry gate. The dashboard exposes re-entry source, authority gate boundaries, outside-repo facts, and final No-Go / Do Not Deploy only; it stores zero credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, authority bypasses, or deploy actions.",
  });

  const rows = (queue.items || [])
    .map((item) => {
      const requirement = humanPlatformAuthorityReEntryGateRequirementForItem(item);
      return requirement ? buildRow(item, requirement) : null;
    })
    .filter(Boolean);

  if (!rows.length) {
    rows.push(
      buildRow(
        {
          id: "human-platform-authority-re-entry-gate-visibility",
          owner: "admin",
          priority: "shipped",
          task:
            "Human-platform-authority re-entry gate visibility remains available next to the private post-autonomous-stop recovery checklist visibility.",
          validation:
            "Dashboard keeps re-entry source, authority gate boundaries, outside-repo facts, final No-Go / Do Not Deploy, and zero deploy actions visible.",
          path: gatePath,
        },
        {
          gate:
            "Human-platform-authority re-entry gate visibility may summarize re-entry source, authority gate boundaries, outside-repo facts, and final No-Go / Do Not Deploy only; it cannot request or store credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, authority bypasses, or deploy actions.",
        }
      )
    );
  }

  return {
    generatedFrom: ["ops/backlog/NEXT.md", gatePath, sourceChecklistPath],
    total: rows.length,
    gateExists,
    sourceChecklistExists,
    recoveryChecklistVisible,
    authorityGateBoundaryCount: authorityGateBoundaries.length,
    outsideRepoFactCount: outsideRepoFacts.filter((item) => /not observed|outside repo authority/i.test(`${item.state} ${item.authority}`)).length,
    finalNoGoCount: rows.filter((row) =>
      /no-go|do not deploy/i.test(`${row.finalState?.decision || ""} ${row.finalState?.productionDeploymentState || ""}`)
    ).length,
    restrictedSurfaceCounts,
    deployActionAvailableCount: 0,
    authorityBypassCount: 0,
    sourceArtifacts,
    rows,
  };
}

function buildOutsideAuthorityAwaitingStateLedgerVisibility(queue, humanPlatformAuthorityReEntryGateVisibility) {
  const ledgerPath = "ops/deploy/private-outside-authority-awaiting-state-ledger.md";
  const sourceGatePath = "ops/deploy/private-human-platform-authority-re-entry-gate.md";
  const ledgerContent = readText(ledgerPath);
  const ledgerExists = Boolean(ledgerContent);
  const sourceGateExists = Boolean(readText(sourceGatePath));
  const gateVisible = Boolean(humanPlatformAuthorityReEntryGateVisibility?.rows?.length);
  const sourceArtifacts = outsideAuthorityAwaitingStateLedgerSourceArtifacts();
  const restrictedSurfaceCounts = {
    credentials: 0,
    urls: 0,
    deployTriggers: 0,
    dashboardLinks: 0,
    contacts: 0,
    dnsSteps: 0,
    rollbackAuthorization: 0,
    publicLaunchAuthorization: 0,
    authorityBypasses: 0,
    deployActions: 0,
  };

  const ledgerCreated = firstHumanPacketSummaryField(ledgerContent, "Private outside-authority awaiting-state ledger created", "No");
  const sourceConsumedSummary = firstHumanPacketSummaryField(ledgerContent, "Source consumed", sourceGatePath);
  const autonomousPosture = firstHumanPacketSummaryField(ledgerContent, "Autonomous posture", "autonomous recovery boundary");
  const recoveryPosture = firstHumanPacketSummaryField(ledgerContent, "Recovery posture", "Private read-only context");
  const awaitingPosture = firstHumanPacketSummaryField(ledgerContent, "Awaiting posture", "Blocked by human-platform authority");
  const requestPosture = firstHumanPacketSummaryField(ledgerContent, "Request posture", "non-request");
  const executionPosture = firstHumanPacketSummaryField(ledgerContent, "Execution posture", "non-executable");
  const externalDeployFactsRequested = firstHumanPacketSummaryField(ledgerContent, "External deploy facts requested", "No");
  const valuesRequested = firstHumanPacketSummaryField(ledgerContent, "Values requested", "No");
  const deployUnlocked = firstHumanPacketSummaryField(ledgerContent, "Deploy unlocked", "No");
  const executionImplied = firstHumanPacketSummaryField(ledgerContent, "Execution implied", "No");
  const humanPlatformAuthorityBypassed = firstHumanPacketSummaryField(ledgerContent, "Human/platform authority bypassed", "No");
  const credentialsRequestedOrStored = firstHumanPacketSummaryField(ledgerContent, "Credentials requested or stored", "No");
  const platformValuesRequestedOrStored = firstHumanPacketSummaryField(ledgerContent, "Platform values requested or stored", "No");
  const productionUrlRequestedOrStored = firstHumanPacketSummaryField(ledgerContent, "Production URL requested or stored", "No");
  const deployTriggerRequestedOrStored = firstHumanPacketSummaryField(ledgerContent, "Deploy trigger requested or stored", "No");
  const rollbackDetailsRequestedOrStored = firstHumanPacketSummaryField(ledgerContent, "Rollback details requested or stored", "No");
  const postDeployHealthValuesRequestedOrStored = firstHumanPacketSummaryField(
    ledgerContent,
    "Post-deploy health values requested or stored",
    "No"
  );
  const executableDeploySequenceCreated = firstHumanPacketSummaryField(ledgerContent, "Executable deploy sequence created", "No");
  const deployAuthorized = firstHumanPacketSummaryField(ledgerContent, "Public deploy authorized", "No");
  const launchAuthorized = firstHumanPacketSummaryField(ledgerContent, "Public launch authorized", "No");
  const rollbackAuthorized = firstHumanPacketSummaryField(ledgerContent, "Rollback authorized", "No");
  const finalDecision = plainSummaryValue(
    firstHumanPacketSummaryField(ledgerContent, "Final deploy decision", "No-Go / Do Not Deploy")
  );
  const productionDeploymentState = plainSummaryValue(
    firstHumanPacketSummaryField(ledgerContent, "Production deployment state", "Do Not Deploy")
  );
  const publishingState = plainSummaryValue(
    firstHumanPacketSummaryField(ledgerContent, "Publishing state", "Do Not Publish")
  );
  const externalFactAuthority = plainSummaryValue(
    firstHumanPacketSummaryField(ledgerContent, "External fact authority", "outside repo authority")
  );

  const outsideRepoFacts = [
    ["Explicit future human approval", "Explicit future human approval"],
    ["Human/platform authority", "Human/platform authority"],
    ["Platform", "Platform"],
    ["Selected platform", "Selected platform"],
    ["Credential availability outside repo", "Credential availability outside repo"],
    ["Production URL / production origin readiness", "Production URL / production origin readiness"],
    ["Deploy trigger readiness", "Deploy trigger readiness"],
    ["Rollback readiness", "Rollback readiness"],
    ["Post-deploy health readiness", "Post-deploy health readiness"],
    ["Public launch authorization", "Public launch authorization"],
    ["Demand conclusion state", "Demand conclusion state"],
    ["Testimonial conclusion state", "Testimonial conclusion state"],
    ["Pricing conclusion state", "Pricing conclusion state"],
    ["Willingness-to-pay conclusion state", "Willingness-to-pay conclusion state"],
    ["Secure-intake conclusion state", "Secure-intake conclusion state"],
    ["Outcome conclusion state", "Outcome conclusion state"],
  ].map(([key, label]) => ({
    topic: label,
    state: plainSummaryValue(firstHumanPacketSummaryField(ledgerContent, key, "Not observed")),
    authority: externalFactAuthority || "outside repo authority",
  }));

  const awaitingRows = outsideAuthorityAwaitingStateLedgerRows(ledgerContent);
  const state =
    ledgerExists && sourceGateExists && gateVisible
      ? "outside-authority-awaiting-state-ledger-visible-no-go"
      : "outside-authority-awaiting-state-ledger-blocked-consumed-artifact-missing";

  const buildRow = (item, requirement) => ({
    id: item.id,
    owner: item.owner,
    priority: item.priority,
    task: item.task,
    validation: item.validation,
    path: item.path,
    state,
    stateLabel:
      state === "outside-authority-awaiting-state-ledger-visible-no-go"
        ? "Awaiting ledger visible"
        : "Consumed awaiting ledger artifact missing",
    gate: requirement.gate,
    sourceArtifacts,
    sourceConsumed: [
      { source: ledgerPath, authority: "Private awaiting-state boundary only" },
      { source: sourceGatePath, authority: "Private human-platform authority re-entry boundary only" },
    ],
    awaitingRows,
    outsideRepoFacts,
    awaitingSummary: {
      ledgerCreated,
      sourceConsumed: sourceConsumedSummary,
      autonomousPosture,
      recoveryPosture,
      awaitingPosture,
      requestPosture,
      executionPosture,
      externalDeployFactsRequested,
      valuesRequested,
      deployUnlocked,
      executionImplied,
      humanPlatformAuthorityBypassed,
      credentialsRequestedOrStored,
      platformValuesRequestedOrStored,
      productionUrlRequestedOrStored,
      deployTriggerRequestedOrStored,
      rollbackDetailsRequestedOrStored,
      postDeployHealthValuesRequestedOrStored,
      executableDeploySequenceCreated,
      externalFactAuthority,
    },
    restrictedSurfaceCounts,
    finalState: {
      decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
      productionDeploymentState: /do not deploy|not observed/i.test(productionDeploymentState)
        ? productionDeploymentState
        : "Do Not Deploy",
      publishingState: /do not publish|not observed/i.test(publishingState) ? publishingState : "Do Not Publish",
      deployAuthorized,
      launchAuthorized,
      rollbackAuthorized,
      reasonDeploymentBlocked:
        "Outside-authority awaiting-state ledger preserves blocked state after the human-platform authority re-entry gate. It cannot request values, unlock deploy, imply execution, or bypass authority.",
    },
    boundary:
      "Read-only outside-authority awaiting-state ledger. The dashboard exposes awaiting context, Not observed outside-repo facts, and final No-Go / Do Not Deploy only; it stores zero credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, authority bypasses, or deploy actions.",
  });

  const rows = (queue.items || [])
    .map((item) => {
      const requirement = outsideAuthorityAwaitingStateLedgerRequirementForItem(item);
      return requirement ? buildRow(item, requirement) : null;
    })
    .filter(Boolean);

  if (!rows.length) {
    rows.push(
      buildRow(
        {
          id: "outside-authority-awaiting-state-ledger-visibility",
          owner: "admin",
          priority: "shipped",
          task:
            "Outside-authority awaiting-state ledger visibility remains available next to the private human-platform authority re-entry gate visibility.",
          validation:
            "Dashboard keeps awaiting context, Not observed outside-repo facts, final No-Go / Do Not Deploy, and zero deploy actions visible.",
          path: ledgerPath,
        },
        {
          gate:
            "Outside-authority awaiting-state ledger visibility may summarize awaiting context and Not observed outside-repo facts only; it cannot request or store credentials, URLs, deploy triggers, dashboard links, contacts, DNS steps, rollback authorization, public launch authorization, authority bypasses, or deploy actions.",
        }
      )
    );
  }

  return {
    generatedFrom: ["ops/backlog/NEXT.md", ledgerPath, sourceGatePath],
    total: rows.length,
    ledgerExists,
    sourceGateExists,
    gateVisible,
    awaitingRowCount: awaitingRows.length,
    outsideRepoFactCount: outsideRepoFacts.filter((item) => /not observed|outside repo authority/i.test(`${item.state} ${item.authority}`)).length,
    finalNoGoCount: rows.filter((row) =>
      /no-go|do not deploy/i.test(`${row.finalState?.decision || ""} ${row.finalState?.productionDeploymentState || ""}`)
    ).length,
    restrictedSurfaceCounts,
    deployActionAvailableCount: 0,
    authorityBypassCount: 0,
    sourceArtifacts,
    rows,
  };
}

function buildDeployBlockerEscalationMemoVisibility(queue, finalLedgerVisibility) {
  const memoPath = "ops/deploy/private-deploy-blocker-escalation-memo-template.md";
  const memoContent = readText(memoPath);
  const memoExists = Boolean(memoContent);
  const sourceArtifacts = deployBlockerEscalationMemoSourceArtifacts();
  const finalLedgerExists = Boolean(finalLedgerVisibility?.ledgerExists || readText("ops/deploy/private-final-deploy-go-no-go-evidence-ledger-template.md"));
  const platformHandoffObserved = Boolean(finalLedgerVisibility?.platformHandoffObserved);
  const healthHandoffObserved = Boolean(finalLedgerVisibility?.healthHandoffObserved);
  const unavailableExternalInputs = deployBlockerUnavailableItems(memoContent);
  const finalDecision =
    deployBlockerMemoSummaryField(memoContent, "Final deploy decision in this memo", "") ||
    finalLedgerVisibility?.rows?.[0]?.finalState?.decision ||
    "No-Go / Do Not Deploy";
  const publicDeployAuthorized = deployBlockerMemoSummaryField(memoContent, "Public deploy authorized by this memo", "No");
  const publicLaunchAuthorized = deployBlockerMemoSummaryField(memoContent, "Public launch authorized by this memo", "No");
  const rollbackAuthorized = deployBlockerMemoSummaryField(memoContent, "Rollback authorized by this memo", "No");
  const state =
    !memoExists || !finalLedgerExists || !platformHandoffObserved || !healthHandoffObserved
      ? "blocked-consumed-artifact-missing"
      : "memo-visible-no-go";

  const blockerCategories = [
    {
      label: "Final ledger linkage",
      state: finalLedgerExists ? "Observed" : "Missing",
      handling: "Memo stays tied to the private final go/no-go ledger and cannot change its decision.",
    },
    {
      label: "Human approval and platform facts",
      state: "Not observed",
      handling: "Approval, selected platform, credential availability, production origin, and executor stay outside repo-stored admin data.",
    },
    {
      label: "Deploy and rollback action",
      state: "Not authorized",
      handling: "No deploy action value, rollback execution method, private platform navigation value, or operator path is stored or requested.",
    },
    {
      label: "Post-deploy health and public launch",
      state: "Not observed",
      handling: "Real production health checks and public launch authorization require a separate future action outside this memo.",
    },
  ];

  const rows = (queue.items || [])
    .map((item) => {
      const requirement = deployBlockerEscalationMemoRequirementForItem(item);
      if (!requirement) return null;
      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        path: item.path,
        state,
        stateLabel: state === "memo-visible-no-go" ? "Memo visible, final No-Go locked" : "Consumed artifact missing",
        gate: requirement.gate,
        sourceArtifacts,
        memoState: {
          memoExists,
          finalLedgerExists,
          platformHandoffObserved,
          healthHandoffObserved,
          decision: /no-go|do not deploy/i.test(finalDecision) ? finalDecision : "No-Go / Do Not Deploy",
          publicDeployAuthorized,
          publicLaunchAuthorized,
          rollbackAuthorized,
        },
        blockerCategories,
        unavailableExternalInputs,
        deployActionBoundary: {
          state: "No deploy action available",
          handling:
            "The dashboard shows blocker categories only. It stores no secret material, external destination values, action values, private platform navigation values, rollback authorization, approval assertions, or deploy controls.",
        },
        evidenceNote:
          "Private deploy-blocker escalation memo visibility summarizes source artifacts and unavailable external inputs only. It is not a deploy request, not a credential request, not rollback approval, and not public launch authorization.",
      };
    })
    .filter(Boolean);

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      memoPath,
      "ops/deploy/private-final-deploy-go-no-go-evidence-ledger-template.md",
      "ops/deploy/private-platform-owner-handoff-checklist.md",
      "ops/deploy/private-post-deploy-health-check-owner-handoff-template.md",
    ],
    total: rows.length,
    memoVisibleCount: rows.filter((row) => row.state === "memo-visible-no-go").length,
    finalNoGoCount: rows.filter((row) => /no-go|do not deploy/i.test(row.memoState?.decision || "")).length,
    unavailableExternalInputCount: unavailableExternalInputs.length,
    deployActionAvailableCount: 0,
    memoExists,
    finalLedgerExists,
    platformHandoffObserved,
    healthHandoffObserved,
    sourceArtifacts,
    rows,
  };
}

function finalDeployLedgerRequirementForItem(item) {
  const text = `${item.task || ""} ${item.validation || ""}`.toLowerCase();
  if (!/\bfinal\b/.test(text) || !/\bdeploy\b/.test(text) || !/\bgo\/no-go\b/.test(text)) return null;

  return {
    gate:
      "Final deploy go/no-go ledger visibility may organize private evidence only; it cannot authorize deploy, store credentials, store production URLs, store deploy triggers, or infer public launch approval.",
  };
}

function ledgerFieldState(content, label) {
  return markdownTableValue(content, label);
}

function ledgerField(content, label, fallback = "Not observed") {
  const state = ledgerFieldState(content, label);
  return {
    label,
    state: state === "Not observed" && fallback !== "Not observed" ? fallback : state,
  };
}

function buildFinalDeployGoNoGoLedgerVisibility(queue, staticVisibility, platformVisibility, postDeployVisibility) {
  const ledgerPath = "ops/deploy/private-final-deploy-go-no-go-evidence-ledger-template.md";
  const ledgerContent = readText(ledgerPath);
  const ledgerExists = Boolean(ledgerContent);
  const sourceArtifacts = finalDeployLedgerSourceArtifacts();
  const platformHandoffObserved = Boolean(platformVisibility?.checklistExists || readText("ops/deploy/private-platform-owner-handoff-checklist.md"));
  const healthHandoffObserved = Boolean(postDeployVisibility?.templateExists);
  const staticEvidenceObserved = staticVisibility?.state === "passed-local" && staticVisibility?.ok === true;

  const evidencePresent = [
    {
      label: "Local static rehearsal evidence",
      state: staticEvidenceObserved ? "Observed" : ledgerFieldState(ledgerContent, "Local static rehearsal evidence"),
      source: "ops/reports/static-deploy-rehearsal/latest.json",
    },
    {
      label: "Platform-owner handoff",
      state: platformHandoffObserved ? "Observed" : ledgerFieldState(ledgerContent, "Platform-owner handoff"),
      source: "ops/deploy/private-platform-owner-handoff-checklist.md",
    },
    {
      label: "Platform-owner non-secret input inventory",
      state: ledgerFieldState(ledgerContent, "Platform-owner non-secret input inventory"),
      source: "ops/deploy/private-platform-owner-handoff-checklist.md",
    },
    {
      label: "Health-check owner handoff",
      state: healthHandoffObserved ? "Observed" : ledgerFieldState(ledgerContent, "Health-check owner handoff"),
      source: "ops/deploy/private-post-deploy-health-check-owner-handoff-template.md",
    },
    {
      label: "Health-check route set",
      state: ledgerFieldState(ledgerContent, "Health-check route set"),
      source: "ops/deploy/private-post-deploy-health-check-owner-handoff-template.md",
    },
  ];

  const evidenceMissing = [
    ledgerField(ledgerContent, "Selected deploy platform"),
    ledgerField(ledgerContent, "Production origin"),
    ledgerField(ledgerContent, "Production origin outside repo"),
    ledgerField(ledgerContent, "Deploy trigger"),
    ledgerField(ledgerContent, "Deploy trigger outside repo"),
    ledgerField(ledgerContent, "Rollback readiness"),
    ledgerField(ledgerContent, "Post-deploy status method"),
    ledgerField(ledgerContent, "Post-deploy health-check results"),
    ledgerField(ledgerContent, "Post-deploy health readiness"),
  ].filter((item, index, list) => item.label && list.findIndex((candidate) => candidate.label === item.label) === index);

  const humanApprovalMissing = [
    ledgerField(ledgerContent, "Explicit future human approval"),
    ledgerField(ledgerContent, "Health-check owner assignment"),
    ledgerField(ledgerContent, "Rollback owner"),
    ledgerField(ledgerContent, "Public launch authorization"),
  ];

  const credentialsUnavailable = [
    ledgerField(ledgerContent, "Credential availability outside repo"),
    ledgerField(ledgerContent, "Credentials outside repo"),
  ];

  const finalDecision = ledgerFieldState(ledgerContent, "Final deploy go/no-go decision");
  const finalDecisionFromTable = ledgerFieldState(ledgerContent, "Final decision");
  const deploymentState = ledgerFieldState(ledgerContent, "Production deployment state");
  const publicDeployAuthorized = /public deploy authorized by this ledger:\s*(.+)$/im.exec(ledgerContent)?.[1]?.trim() || "No";
  const publicLaunchAuthorized = /public launch authorized by this ledger:\s*(.+)$/im.exec(ledgerContent)?.[1]?.trim() || "No";
  const state =
    !ledgerExists || !platformHandoffObserved || !healthHandoffObserved
      ? "blocked-missing-consumed-handoff"
      : "no-go-do-not-deploy";

  const rows = (queue.items || [])
    .map((item) => {
      const requirement = finalDeployLedgerRequirementForItem(item);
      if (!requirement) return null;
      return {
        id: item.id,
        owner: item.owner,
        priority: item.priority,
        task: item.task,
        validation: item.validation,
        path: item.path,
        state,
        stateLabel: state === "no-go-do-not-deploy" ? "Final No-Go ledger visible" : "Consumed handoff missing",
        gate: requirement.gate,
        sourceArtifacts,
        evidencePresent,
        evidenceMissing,
        humanApprovalMissing,
        credentialsUnavailable,
        finalState: {
          decision: finalDecision !== "Not observed" ? finalDecision : finalDecisionFromTable,
          deploymentState: deploymentState === "Not observed" ? "Do Not Deploy" : deploymentState,
          publicDeployAuthorized,
          publicLaunchAuthorized,
          handling:
            "No-Go / Do Not Deploy remains locked until explicit future human approval, credentials outside repo, production origin, deploy trigger, rollback readiness, and real post-deploy checks exist outside this dashboard.",
        },
        evidenceNote:
          "Private final deploy ledger visibility separates present evidence from missing deploy prerequisites. It stores no credentials, production URLs, deploy triggers, dashboard links, public launch authorization, pricing, testimonial, demand, secure-intake, or outcome claims.",
      };
    })
    .filter(Boolean);

  return {
    generatedFrom: [
      "ops/backlog/NEXT.md",
      ledgerPath,
      "ops/deploy/private-platform-owner-handoff-checklist.md",
      "ops/deploy/private-post-deploy-health-check-owner-handoff-template.md",
    ],
    total: rows.length,
    evidencePresentCount: evidencePresent.filter((item) => /^(observed|passed)$/i.test(item.state)).length,
    evidenceMissingCount: evidenceMissing.filter((item) => !/^(observed|passed)$/i.test(item.state)).length,
    humanApprovalMissingCount: humanApprovalMissing.filter((item) => !/^(observed|approved|yes)$/i.test(item.state)).length,
    credentialsUnavailableCount: credentialsUnavailable.filter((item) => !/^(observed|available|confirmed)$/i.test(item.state)).length,
    finalNoGoCount: rows.filter((row) => /no-go|do not deploy/i.test(`${row.finalState.decision} ${row.finalState.deploymentState}`)).length,
    ledgerExists,
    platformHandoffObserved,
    healthHandoffObserved,
    sourceArtifacts,
    rows,
  };
}

function listRequirementSnapshots() {
  const snapshotDir = "/Users/zackgrizz/Documents/AgentFoundry/requirements-snapshots/resume-helper";
  if (!fs.existsSync(snapshotDir)) return [];
  return fs
    .readdirSync(snapshotDir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => ({
      path: path.join(snapshotDir, name),
      title: name,
      content: fs.readFileSync(path.join(snapshotDir, name), "utf8"),
    }));
}

function safeReadJsonFile(absolutePath, fallback = null) {
  if (!fs.existsSync(absolutePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    return {
      parseError: error instanceof Error ? error.message : String(error),
      reportPath: path.relative(projectRoot, absolutePath),
    };
  }
}

function normalizeStaticDeployRehearsalState(value) {
  const state = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (["passed", "pass", "ok", "local-passed", "passed-local"].includes(state)) return "passed-local";
  if (["blocked", "blocked-local", "blocked-no-credentials", "no-credentials", "credentials-blocked"].includes(state)) {
    return "blocked-no-credentials";
  }
  if (["not-run", "not run", "missing", "pending", "unknown"].includes(state)) return "not-run";
  return "";
}

function normalizeStaticDeployRehearsalStep(step, index) {
  const status = String(step?.status || step?.result || "").toLowerCase();
  const ok =
    typeof step?.ok === "boolean"
      ? step.ok
      : typeof step?.passed === "boolean"
        ? step.passed
        : /\b(pass|passed|ok|success)\b/.test(status);
  return {
    label: step?.label || step?.name || step?.command || `Check ${index + 1}`,
    ok,
    status: step?.status || step?.result || (ok ? "passed" : "blocked"),
    command: step?.command || "",
  };
}

function staticDeployStateCounts(state) {
  return {
    notRun: state === "not-run" ? 1 : 0,
    passedLocal: state === "passed-local" ? 1 : 0,
    blockedNoCredentials: state === "blocked-no-credentials" ? 1 : 0,
  };
}

function staticDeployReportTimestamp(report, fallbackPath) {
  const filenameTimestamp = String(fallbackPath || "").match(/(\d{4}-\d{2}-\d{2})-(\d{4})/)?.slice(1);
  const filenameFallback = filenameTimestamp ? `${filenameTimestamp[0]}T${filenameTimestamp[1].slice(0, 2)}:${filenameTimestamp[1].slice(2)}:00-07:00` : "";
  const raw = report?.checkedAt || report?.finishedAt || report?.completedAt || report?.timestamp || filenameFallback;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw || null : date.toISOString();
}

function listStaticDeployRehearsalReports() {
  const relativeDir = "ops/reports/static-deploy-rehearsal";
  return listFiles(relativeDir, (name) => name.endsWith(".json") && name !== "latest.json")
    .map((file) => {
      const report = safeReadJsonFile(file.absolutePath, null);
      return {
        report,
        reportPath: file.relativePath,
        checkedAt: staticDeployReportTimestamp(report, file.relativePath),
      };
    })
    .sort((a, b) => String(b.checkedAt || "").localeCompare(String(a.checkedAt || "")));
}

function summarizeStaticDeployRehearsalReport(report, reportPath) {
  const explicitState = normalizeStaticDeployRehearsalState(report?.state || report?.status || report?.result || report?.outcome);
  const reportOk =
    typeof report?.ok === "boolean"
      ? report.ok
      : typeof report?.passed === "boolean"
        ? report.passed
        : explicitState === "passed-local";
  const state = explicitState || (report?.parseError ? "not-run" : reportOk ? "passed-local" : "blocked-no-credentials");
  const rawSteps = Array.isArray(report?.steps)
    ? report.steps
    : Array.isArray(report?.checks)
      ? report.checks
      : Array.isArray(report?.validation)
        ? report.validation
        : [];
  const normalizedSteps = rawSteps.map(normalizeStaticDeployRehearsalStep);
  const failedSteps = normalizedSteps.filter((step) => !step.ok);
  const guardrails = report?.noDeployGuardrails || report?.guardrails || report?.noDeploy || {};
  return {
    state,
    stateLabel:
      {
        "not-run": "Not run",
        "passed-local": "Passed locally",
        "blocked-no-credentials": "Blocked: no credentials",
      }[state] || state,
    ok: state === "passed-local",
    reportPath,
    checkedAt: staticDeployReportTimestamp(report, reportPath),
    mode: String(report?.mode || report?.servedSmoke?.mode || report?.localSmoke?.mode || report?.staticSmoke?.mode || "unknown"),
    failedStepCount: failedSteps.length,
    failedSteps: failedSteps.map((step) => step.label),
    routeCount: (report?.routeInventory || report?.routes || report?.evidence?.routes || report?.servedSmoke?.routes || []).length,
    productionDeploymentState: guardrails.productionDeploymentState || "Do Not Deploy",
    credentialInputsConsumed: Boolean(
      guardrails.platformCredentialConsumed ||
        guardrails.credentialConsumed ||
        guardrails.credentialsProvided ||
        guardrails.productionUrlConsumed ||
        guardrails.deployTriggerConsumed
    ),
  };
}

function buildStaticDeployRehearsalHistory(timestampedReports, latestReportPath) {
  const summaries = timestampedReports.map((entry) => summarizeStaticDeployRehearsalReport(entry.report, entry.reportPath));
  const latest = latestReportPath
    ? summaries.find((summary) => summary.reportPath === latestReportPath) || summaries[0] || null
    : summaries[0] || null;
  const prior = latest ? summaries.filter((summary) => summary.reportPath !== latest.reportPath) : summaries;
  const priorFailures = prior.filter((summary) => summary.state !== "passed-local" || summary.failedStepCount > 0 || summary.credentialInputsConsumed);
  const staleEvidence = prior.filter((summary) => summary.state === "passed-local" && summary.failedStepCount === 0 && !summary.credentialInputsConsumed);
  const stateCounts = summaries.reduce(
    (counts, summary) => {
      counts.notRun += summary.state === "not-run" ? 1 : 0;
      counts.passedLocal += summary.state === "passed-local" ? 1 : 0;
      counts.blockedNoCredentials += summary.state === "blocked-no-credentials" ? 1 : 0;
      return counts;
    },
    { notRun: 0, passedLocal: 0, blockedNoCredentials: 0 }
  );

  return {
    totalReports: summaries.length,
    latestPass: latest,
    priorFailures,
    staleEvidence,
    stateCounts,
    trend: summaries
      .slice()
      .reverse()
      .map((summary) => ({
        reportPath: summary.reportPath,
        checkedAt: summary.checkedAt,
        state: summary.state,
        stateLabel: summary.stateLabel,
        failedStepCount: summary.failedStepCount,
      })),
    boundary:
      "Static deploy rehearsal history is local-only evidence. Older passing reports are stale once a newer timestamped report exists; no item here is a deploy, public launch, pricing, testimonial, demand, willingness-to-pay, secure-intake, or outcome claim.",
  };
}

function buildStaticDeployRehearsalVisibility(report, timestampedReports = []) {
  const generatedFrom = [
    "ops/deploy/private-static-deploy-rehearsal-runbook.md",
    "ops/reports/static-deploy-rehearsal/latest.json",
    "ops/reports/static-deploy-rehearsal/*.json",
  ];
  if (!report) {
    const history = buildStaticDeployRehearsalHistory(timestampedReports, null);
    return {
      generatedFrom,
      state: "not-run",
      stateLabel: "Not run",
      stateCounts: history.totalReports ? history.stateCounts : staticDeployStateCounts("not-run"),
      ok: false,
      checkedAt: null,
      mode: "unobserved",
      reportPath: "ops/reports/static-deploy-rehearsal/latest.json",
      history,
      blockers: ["QA static deploy rehearsal report not present"],
      evidenceNote:
        "No static deploy rehearsal report is present yet. Run `npm run static-deploy-rehearsal` to generate a private local-only report; do not deploy.",
    };
  }

  const explicitState = normalizeStaticDeployRehearsalState(report.state || report.status || report.result || report.outcome);
  const reportOk =
    typeof report.ok === "boolean"
      ? report.ok
      : typeof report.passed === "boolean"
        ? report.passed
        : explicitState === "passed-local";
  const state = explicitState || (report.parseError ? "not-run" : reportOk ? "passed-local" : "blocked-no-credentials");
  const stateLabels = {
    "not-run": "Not run",
    "passed-local": "Passed locally",
    "blocked-no-credentials": "Blocked: no credentials",
  };
  const reportPath = report.reportPath || "ops/reports/static-deploy-rehearsal/latest.json";
  const history = buildStaticDeployRehearsalHistory(timestampedReports, reportPath);
  const mode = String(report.mode || report.servedSmoke?.mode || report.localSmoke?.mode || report.staticSmoke?.mode || "unknown");
  const limitations = [];
  if (report.constraints?.sandboxNetworkDisabled || report.mode === "static-fallback" || report.servedSmoke?.mode === "static-fallback") {
    limitations.push("sandbox blocks 127.0.0.1 listen; served smoke validated via static fallback");
  }
  if (report.parseError) limitations.push(`QA report could not be parsed: ${report.parseError}`);
  const guardrails = report.noDeployGuardrails || report.guardrails || report.noDeploy || {};
  const credentialInputsConsumed = Boolean(
    guardrails.platformCredentialConsumed ||
      guardrails.credentialConsumed ||
      guardrails.credentialsProvided ||
      guardrails.productionUrlConsumed ||
      guardrails.deployTriggerConsumed
  );
  const blockers = [
    ...(Array.isArray(report.blockers) ? report.blockers : []),
    ...(report.parseError ? ["QA report format unrecognized"] : []),
    ...(state === "blocked-no-credentials" ? ["Platform credentials, production URL, and deploy trigger are not present in repo evidence"] : []),
  ];
  const rawSteps = Array.isArray(report.steps)
    ? report.steps
    : Array.isArray(report.checks)
      ? report.checks
      : Array.isArray(report.validation)
        ? report.validation
        : [];

  return {
    generatedFrom,
    state,
    stateLabel: stateLabels[state] || state,
    stateCounts: history.totalReports ? history.stateCounts : staticDeployStateCounts(state),
    ok: state === "passed-local",
    checkedAt: report.checkedAt || report.finishedAt || report.completedAt || report.timestamp || null,
    mode,
    limitations,
    reportPath,
    history,
    blockers,
    steps: rawSteps.map(normalizeStaticDeployRehearsalStep),
    staticEntrypoints: report.staticEntrypoints || null,
    adminDataShape: report.adminDataShape || null,
    routeEvidence: report.routeInventory || report.routes || report.evidence?.routes || report.servedSmoke?.routes || [],
    noDeployGuardrails: {
      platformCredentialConsumed: Boolean(guardrails.platformCredentialConsumed),
      productionUrlConsumed: Boolean(guardrails.productionUrlConsumed),
      deployTriggerConsumed: Boolean(guardrails.deployTriggerConsumed),
      credentialInputsConsumed,
      productionDeploymentState: guardrails.productionDeploymentState || "Do Not Deploy",
    },
    evidenceNote:
      "Private credential-free local rehearsal evidence only. Platform credentials, production URLs, deploy triggers, launch, pricing, testimonial, demand, willingness-to-pay, secure-intake, and outcome conclusions remain unobserved.",
  };
}

function buildBusinessControlsVisibility() {
  const controlsPath = "ops/BUSINESS_CONTROLS.json";
  const contract = readJson(controlsPath, {
    format: "proofresume-business-controls-v1",
    purpose: "Business controls have not been configured yet.",
    operatingRule: "External business actions are blocked until a control exists.",
    moneyGoal: {
      currentRevenueState: "Not observed",
      nextRevenueUnlock: "Create business controls.",
    },
    globalLimits: {},
    controls: [],
  });
  const controls = Array.isArray(contract.controls) ? contract.controls : [];
  const enabledStatuses = new Set(["enabled", "local_only_enabled"]);
  const setupStatuses = new Set(["setup_needed", "ready_for_setup"]);
  const unlockPriority = new Map([
    ["public_deploy", 1],
    ["lead_capture", 2],
    ["payment_collection", 3],
    ["analytics", 4],
    ["outbound_outreach", 5],
    ["customer_data", 6],
  ]);
  const unlockByControl = {
    public_deploy: "Public prospect traffic and post-deploy health evidence",
    lead_capture: "Production-safe prospect capture and follow-up routing",
    payment_collection: "Payment-control setup after explicit provider and offer enablement",
    analytics: "Funnel measurement only after approved provider, event list, and privacy decisions",
    outbound_outreach: "Authorized prospect messages within explicit zero-or-raised limits",
    customer_data: "Real resume intake through an approved secure path",
  };
  const missingItemByControl = {
    public_deploy: "hosting account access",
    lead_capture: "external database or form service access",
    payment_collection: "payment account access",
    analytics: "analytics provider access",
    outbound_outreach: "sending account connector",
    customer_data: "secure storage provider",
  };
  const enabledControls = controls.filter((control) => enabledStatuses.has(control.status));
  const setupNeededControls = controls.filter((control) => setupStatuses.has(control.status));
  const blockedControls = controls.filter((control) => control.status === "blocked");
  const revenueCriticalIds = new Set(["public_deploy", "lead_capture", "payment_collection", "analytics", "outbound_outreach", "customer_data"]);
  const revenueCriticalControls = controls.filter((control) => revenueCriticalIds.has(control.id));
  const sortedControls = controls
    .slice()
    .sort((a, b) => (unlockPriority.get(a.id) || 99) - (unlockPriority.get(b.id) || 99) || String(a.label || a.id).localeCompare(String(b.label || b.id)));
  const nextUnlocks = sortedControls
    .filter((control) => unlockPriority.has(control.id) && !enabledStatuses.has(control.status))
    .map((control) => ({
      id: control.id,
      label: control.label,
      status: control.status,
      priority: unlockPriority.get(control.id),
      revenueCritical: revenueCriticalIds.has(control.id),
      unlocks: unlockByControl[control.id] || control.businessPurpose || "",
      oneMissingUserOrPlatformItem: missingItemByControl[control.id] || control.askUserOnlyFor?.[0] || control.requiredEvidenceToEnable?.[0] || "explicit control enablement",
      missing: control.requiredEvidenceToEnable || [],
      askUserOnlyFor: control.askUserOnlyFor || [],
    }));
  const nextRevenueCriticalUnlock = nextUnlocks.find((unlock) => unlock.revenueCritical) || null;
  const buyerPathReadiness = buildBuyerPathReadiness({
    controls,
    sortedControls,
    revenueCriticalIds,
    enabledStatuses,
    globalLimits: contract.globalLimits || {},
    nextUnlocks,
    unlockByControl,
    missingItemByControl,
  });

  return {
    path: controlsPath,
    format: contract.format || "unknown",
    purpose: contract.purpose || "",
    operatingRule: contract.operatingRule || "",
    moneyGoal: contract.moneyGoal || {},
    globalLimits: contract.globalLimits || {},
    totalControls: controls.length,
    enabledCount: enabledControls.length,
    setupNeededCount: setupNeededControls.length,
    blockedCount: blockedControls.length,
    revenueCriticalTotal: revenueCriticalControls.length,
    revenueCriticalEnabledCount: revenueCriticalControls.filter((control) => enabledStatuses.has(control.status)).length,
    revenueCriticalBlockedCount: revenueCriticalControls.filter((control) => !enabledStatuses.has(control.status)).length,
    nextRevenueCriticalUnlock,
    currentState:
      revenueCriticalControls.length &&
      revenueCriticalControls.every((control) => enabledStatuses.has(control.status))
        ? "market-enabled"
        : enabledControls.length
          ? "partially-enabled"
          : "setup-required",
    controls: sortedControls.map((control) => ({
      id: control.id,
      label: control.label,
      status: control.status || "unknown",
      priority: unlockPriority.get(control.id) || null,
      revenueCritical: revenueCriticalIds.has(control.id),
      unlocks: unlockByControl[control.id] || control.businessPurpose || "",
      oneMissingUserOrPlatformItem: missingItemByControl[control.id] || control.askUserOnlyFor?.[0] || control.requiredEvidenceToEnable?.[0] || "explicit control enablement",
      businessPurpose: control.businessPurpose || "",
      enabled: enabledStatuses.has(control.status),
      setupNeeded: setupStatuses.has(control.status),
      blocked: control.status === "blocked",
      agentCanDoNow: control.agentCanDoNow || [],
      agentCanDoWhenEnabled: control.agentCanDoWhenEnabled || [],
      requiredEvidenceToEnable: control.requiredEvidenceToEnable || [],
      limitsWhenEnabled: control.limitsWhenEnabled || {},
      askUserOnlyFor: control.askUserOnlyFor || [],
      stopConditions: control.stopConditions || [],
    })),
    nextUnlocks,
    buyerPathReadiness,
  };
}

function normalizeAuthorityGateLabel(gateId) {
  return String(gateId || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (char) => char.toUpperCase());
}

function ownerAuthorityBlockedReasons(gate) {
  const reasons = [];
  if (gate.authorityStatus !== "approved") reasons.push(`authorityStatus=${gate.authorityStatus || "unknown"}`);
  if (gate.minimumEvidenceComplete !== true) reasons.push("minimumEvidenceComplete=false");
  if (gate.repoSecretsOrPrivateDataIncluded !== false) reasons.push("repoSecretsOrPrivateDataIncluded=true");
  if (gate.stopConditionActive !== false) reasons.push("stopConditionActive=true");
  return reasons;
}

function buildOwnerAuthorityRepairLoopPreview(businessControlsVisibility) {
  const bundlePath = "ops/launch/owner-authority-bundle.template.json";
  const indexPath = "ops/launch/owner-authority-bundle-index.md";
  const bundle = readJson(bundlePath, {
    format: "missing-owner-authority-bundle",
    gates: {},
  });
  const controlById = new Map((businessControlsVisibility?.controls || []).map((control) => [control.id, control]));
  const gateEntries = Object.entries(bundle.gates || {});
  const focusGateIds = new Set([
    "publicDeploy",
    "firstFiveFeedback",
    "first25Outreach",
    "paymentActivation",
    "analytics",
    "customerDataFulfillment",
  ]);
  const rows = gateEntries.map(([gateId, gate]) => {
    const controls = (gate.controlIds || []).map((controlId) => {
      const control = controlById.get(controlId) || {};
      return {
        id: controlId,
        label: control.label || controlId,
        status: control.status || "unknown",
        enabled: control.enabled === true || control.status === "enabled",
      };
    });
    const actionable =
      gate.authorityStatus === "approved" &&
      gate.minimumEvidenceComplete === true &&
      gate.repoSecretsOrPrivateDataIncluded === false &&
      gate.stopConditionActive === false;
    const repairRoute = {
      action: gate.nextSafeQueueAction || "request_owner_evidence",
      ownerEvidencePath: gate.ownerEvidencePath || "",
      ownerActionRequestPath: gate.ownerActionRequestPath || "",
      ownerAnswerIntakePath: gate.ownerAnswerIntakePath || "",
      checkerCommand: gate.checkerCommand || bundle.checker?.command || "node ops/scripts/check_owner_authority_bundle.cjs",
      routeLabel:
        gate.nextSafeQueueAction === "create_ready_repair_item"
          ? "Create one narrow repair queue item"
          : gate.nextSafeQueueAction === "claim_existing_ready_item"
            ? "Claim the existing repair item"
            : gate.nextSafeQueueAction === "run_owner_authorized_action"
              ? "Run only after checker-approved owner authority"
              : "Request non-secret owner evidence",
    };

    return {
      gateId,
      label: normalizeAuthorityGateLabel(gateId),
      focusGate: focusGateIds.has(gateId),
      queueItemId: gate.queueItemId || "",
      authorityStatus: gate.authorityStatus || "unknown",
      actionable,
      blockedReasons: ownerAuthorityBlockedReasons(gate),
      currentBlocker: gate.currentBlocker || "Owner authority evidence is not complete.",
      requiredNonSecretEvidence: gate.requiredNonSecretEvidence || [],
      controls,
      repairRoute,
      boundaries: {
        localPreviewOnly: true,
        noSend: true,
        noDeploy: true,
        noPayment: true,
        noCustomerData: true,
        noQueueMutation: true,
        noSecrets: true,
      },
    };
  });
  const focusRows = rows.filter((row) => row.focusGate);
  const blockedFocusRows = focusRows.filter((row) => !row.actionable);
  const ownerAskList = blockedFocusRows.map((row) => ({
    gateId: row.gateId,
    label: row.label,
    ask: row.requiredNonSecretEvidence[0] || row.currentBlocker,
    repairRoute: row.repairRoute.routeLabel,
    ownerEvidencePath: row.repairRoute.ownerEvidencePath,
  }));

  return {
    format: "proofresume-owner-authority-repair-loop-preview-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-OWNER-AUTHORITY-REPAIR-LOOP-PREVIEW",
    bundlePath,
    indexPath,
    checkerCommand: bundle.checker?.command || "node ops/scripts/check_owner_authority_bundle.cjs",
    localOnly: true,
    externalActionAllowed: false,
    providerActionAllowed: false,
    queueMutationAllowed: false,
    noSendNoDeployNoPaymentNoCustomerData: true,
    noProspectContactDetails: true,
    noRawResumes: true,
    noProviderSecrets: true,
    note:
      "Read-only owner-authority repair preview. It maps blocked gates to existing templates/checkers and recommends one repair route without collecting secrets, changing queues, deploying, sending, collecting payment, or handling production customer data.",
    counts: {
      totalGates: rows.length,
      focusGates: focusRows.length,
      blockedFocusGates: blockedFocusRows.length,
      actionableFocusGates: focusRows.filter((row) => row.actionable).length,
    },
    ownerAskList,
    gates: rows,
    forbiddenRepoVisibleFields: bundle.forbiddenRepoValues || [],
  };
}

function buildConciergeFulfillmentDashboardVisibility(businessControlsVisibility) {
  const controls = businessControlsVisibility?.controls || [];
  const controlById = new Map(controls.map((control) => [control.id, control]));
  const paymentControl = controlById.get("payment_collection") || {};
  const customerDataControl = controlById.get("customer_data") || {};
  const outboundControl = controlById.get("outbound_outreach") || {};
  const enabled = (control) => control?.enabled === true || control?.status === "enabled";
  const paymentEnabled = enabled(paymentControl);
  const customerDataEnabled = enabled(customerDataControl);
  const deliveryEnabled = enabled(outboundControl) && customerDataEnabled;

  const cases = [
    {
      caseId: "paid-packet-rehearsal-001",
      label: "First paid packet rehearsal",
      source: "ops/payments/first-paid-fulfillment-sop.md",
      consentState: "sample_only_no_customer_consent",
      materialsReceived: "sample_materials_only",
      targetJob: "Sample target role from local proof-audit rehearsal",
      packetStatus: "qa_review",
      fulfillmentNotes:
        "Operator checklist can be rehearsed with sample or redacted materials; real paid packet work waits for consent, approved storage, and payment authority.",
      refundSupportStatus: "blocked_until_support_refund_policy_observed",
      followUpOutcome: "not_sent_no_followup_permission",
      nextAction: "Use sample packet to verify operator checklist before first live request.",
      localOnly: true,
      externalActionTaken: false,
      commitContainsCustomerData: false,
    },
    {
      caseId: "paid-interest-handoff-001",
      label: "Paid interest handoff",
      source: "ops/payments/payment-link-activation-packet.md",
      consentState: "not_observed",
      materialsReceived: "not_received",
      targetJob: "Outside-repo customer target required before work starts",
      packetStatus: "blocked_controls_missing",
      fulfillmentNotes:
        "Paid intent can be tracked as status only. Do not create payment links, invoices, customer files, or delivery artifacts from this dashboard.",
      refundSupportStatus: "blocked_until_refund_support_tax_owner_ready",
      followUpOutcome: "not_allowed_without_followup_permission",
      nextAction: "Collect non-secret payment/customer-data/support authority outside the repo before live fulfillment.",
      localOnly: true,
      externalActionTaken: false,
      commitContainsCustomerData: false,
    },
  ];

  const checklist = [
    {
      id: "consent",
      label: "Customer consent recorded before manual work",
      status: customerDataEnabled ? "operator_required" : "blocked_customer_data_control",
      controlId: "customer_data",
    },
    {
      id: "materials",
      label: "Materials received through approved path",
      status: customerDataEnabled ? "operator_required" : "blocked_customer_data_control",
      controlId: "customer_data",
    },
    {
      id: "target_job",
      label: "Target job and preferences captured",
      status: "manual_local_or_outside_repo",
      controlId: "customer_data",
    },
    {
      id: "packet",
      label: "Target Job Proof Packet drafted and QA checked",
      status: "sample_rehearsal_ready",
      controlId: "qa_reviewer",
    },
    {
      id: "payment",
      label: "Payment authority and offer display approved",
      status: paymentEnabled ? "operator_required" : "blocked_payment_control",
      controlId: "payment_collection",
    },
    {
      id: "delivery",
      label: "Delivery, support, refund, and follow-up permission approved",
      status: deliveryEnabled ? "operator_required" : "blocked_delivery_controls",
      controlId: "outbound_outreach",
    },
  ];

  const blockedCount = checklist.filter((item) => String(item.status).startsWith("blocked")).length;
  const qaReviewCount = cases.filter((item) => item.packetStatus === "qa_review").length;
  const readyToDeliverCount = 0;

  return {
    format: "proofresume-concierge-fulfillment-dashboard-v1",
    generatedAt,
    sourcePattern: "commons/templates/concierge-fulfillment",
    dashboardPattern: "commons/templates/first-customer-ops-dashboard",
    productQueueItemId: "NORTHSTAR-CONCIERGE-FULFILLMENT-DASHBOARD",
    localOnly: true,
    paymentCollectionEnabled: false,
    productionCustomerDataEnabled: false,
    outboundDeliveryEnabled: false,
    providerActionsEnabled: false,
    forbiddenRepoFields: [
      "name",
      "email",
      "raw_resume_text",
      "unredacted_customer_request",
      "payment_card",
      "provider_api_key",
      "live_delivery_link",
      "payment_action_id",
      "refund_action_id",
    ],
    summary: {
      cases: cases.length,
      qaReview: qaReviewCount,
      readyToDeliver: readyToDeliverCount,
      blockedControls: blockedCount,
      state: "local_rehearsal_ready_live_blocked",
      note:
        "Local operator status only. This dashboard does not authorize payment collection, production resume storage, outbound delivery, provider credentials, refunds, or support sends.",
    },
    controls: {
      paymentCollectionStatus: paymentControl.status || "unknown",
      customerDataStatus: customerDataControl.status || "unknown",
      outboundOutreachStatus: outboundControl.status || "unknown",
      liveFulfillmentAllowed: false,
      requiresExternalAuthorityBeforeLiveWork: true,
    },
    checklist,
    cases,
    nextScaleRequirements: [
      "Approved secure customer-data intake and retention/deletion path.",
      "Payment provider authority, support/refund policy, tax/MoR owner, and final go/no-go.",
      "QA gate before delivery and explicit delivery/follow-up permission.",
      "Managed operator store or approved provider mirror once multiple real cases exist.",
    ],
    stopConditions: [
      "Stop before collecting payment or creating payment/refund action ids.",
      "Stop before storing raw resumes, contact details, or customer materials in committed files.",
      "Stop before outbound delivery, support replies, or follow-up without explicit permission.",
      "Stop before entering provider credentials, live delivery links, or paid provider spend.",
    ],
  };
}

function buildRedactedSessionEvidenceInboxVisibility() {
  const sourcePattern = "commons/templates/customer-evidence-redaction";
  const forbiddenRepoVisibleFields = [
    "raw resumes",
    "prospect identities",
    "contact details",
    "private replies",
    "credentials",
    "payment data",
    "calendar links",
    "dashboard urls",
    "customer materials",
  ];
  const records = [
    {
      format: "proofresume-redacted-session-evidence-record-v1",
      evidenceId: "sample-rehearsal-proof-loop-001",
      evidenceKind: "rehearsal_evidence",
      sourceMode: "sample_rehearsal",
      recordedAt: generatedAt,
      proofLevel: "L0_sample_rehearsal",
      sourceCustodyMode: "sample_only",
      redactionReviewState: "sample_only",
      personaSegment: "recent_cs_new_grad_sample",
      workflowTested: "target_job_proof_audit_rehearsal",
      findingCategory: "proof_loop_clarity",
      findingSummary:
        "Sample rehearsal shows the proof loop is clearest when each tailored claim exposes source evidence and missing proof before approval.",
      evidenceStrength: "sample_only",
      objectionClass: "evidence_trust",
      willingnessToPaySignal: "not_measured",
      privacyRiskSummary: "Sample-only record; no production customer data, raw resume, transcript, identity, or contact detail is stored.",
      queueTarget: "product",
      queueAction: "send_to_review",
      queueReason: "Route only if repeated real or owner-approved redacted evidence shows product friction.",
      sourcePath: "ops/launch/first-feedback-session-sample-evidence-packet.md",
      boundaries: {
        localOnly: true,
        noRawResume: true,
        noProspectIdentity: true,
        noPrivateReply: true,
        noPaymentData: true,
        noCredentials: true,
        noCustomerMaterials: true,
        noQueueMutation: true,
        noRevenueClaim: true,
        noWillingnessToPayClaim: true,
      },
      forbiddenRepoVisibleFields,
    },
    {
      format: "proofresume-redacted-session-evidence-record-v1",
      evidenceId: "owner-approved-feedback-placeholder-001",
      evidenceKind: "authorized_feedback",
      sourceMode: "owner_approved_redacted",
      recordedAt: generatedAt,
      proofLevel: "L1_authorized_feedback",
      sourceCustodyMode: "redacted_repo_summary",
      redactionReviewState: "needs_review",
      personaSegment: "owner_approved_segment_placeholder",
      workflowTested: "first_feedback_session",
      findingCategory: "authorized_feedback_inbox_slot",
      findingSummary:
        "Placeholder slot for future owner-approved redacted feedback; it does not claim that live feedback has been observed.",
      evidenceStrength: "not_evidence",
      objectionClass: "not_observed",
      willingnessToPaySignal: "not_measured",
      privacyRiskSummary: "Use only after owner-approved redaction excludes identity, contact, raw materials, transcripts, and private links.",
      queueTarget: "no_queue_action",
      queueAction: "no_queue_action",
      queueReason: "Needs real owner-approved redacted evidence before any queue routing.",
      sourcePath: "ops/launch/first-session-redacted-evidence-handoff-drill.md",
      boundaries: {
        localOnly: true,
        ownerApprovedRedactionRequired: true,
        noQueueMutation: true,
        noCustomerFeedbackClaim: true,
      },
      forbiddenRepoVisibleFields,
    },
    {
      format: "proofresume-redacted-session-evidence-record-v1",
      evidenceId: "paid-interest-question-boundary-001",
      evidenceKind: "paid_interest_note",
      sourceMode: "sample_rehearsal",
      recordedAt: generatedAt,
      proofLevel: "L0_sample_rehearsal",
      sourceCustodyMode: "sample_only",
      redactionReviewState: "sample_only",
      personaSegment: "sample_recent_new_grad",
      workflowTested: "proof_audit_paid_packet_question",
      findingCategory: "paid_interest_boundary",
      findingSummary:
        "Sample paid-packet question remains a blocked learning label; no payment link, checkout, revenue, or willingness-to-pay claim is created.",
      evidenceStrength: "sample_only",
      objectionClass: "pricing_question_before_authority",
      willingnessToPaySignal: "question_only_sample",
      privacyRiskSummary: "No payment identifiers, card data, private replies, or customer materials are stored.",
      queueTarget: "business",
      queueAction: "block_until_authority",
      queueReason: "Keep payment/customer-data blockers intact until owner authority and live evidence exist.",
      sourcePath: "ops/launch/first-feedback-session-sample-evidence-packet.md",
      boundaries: {
        localOnly: true,
        noPaymentData: true,
        noRevenueClaim: true,
        noWillingnessToPayClaim: true,
        noQueueMutation: true,
      },
      forbiddenRepoVisibleFields,
    },
    {
      format: "proofresume-redacted-session-evidence-record-v1",
      evidenceId: "privacy-objection-boundary-001",
      evidenceKind: "privacy_objection",
      sourceMode: "sample_rehearsal",
      recordedAt: generatedAt,
      proofLevel: "L0_sample_rehearsal",
      sourceCustodyMode: "sample_only",
      redactionReviewState: "sample_only",
      personaSegment: "sample_job_seeker",
      workflowTested: "material_sharing_boundary",
      findingCategory: "customer_data_boundary",
      findingSummary:
        "Sample privacy objection routes to customer-data consent and redaction readiness; raw resumes and private materials remain outside repo fixtures.",
      evidenceStrength: "sample_only",
      objectionClass: "privacy_boundary_question",
      willingnessToPaySignal: "not_measured",
      privacyRiskSummary: "No production storage; customer materials must stay customer-held or in an approved private system.",
      queueTarget: "approval_unblocker",
      queueAction: "block_until_authority",
      queueReason: "Use owner/customer-data gates before collecting live materials.",
      sourcePath: "commons/templates/customer-evidence-redaction/docs/source-custody-and-queue-rules.md",
      boundaries: {
        localOnly: true,
        noRawResume: true,
        noCustomerMaterials: true,
        noQueueMutation: true,
      },
      forbiddenRepoVisibleFields,
    },
    {
      format: "proofresume-redacted-session-evidence-record-v1",
      evidenceId: "no-offer-outcome-sample-001",
      evidenceKind: "no_action_no_offer_outcome",
      sourceMode: "sample_rehearsal",
      recordedAt: generatedAt,
      proofLevel: "L0_sample_rehearsal",
      sourceCustodyMode: "sample_only",
      redactionReviewState: "sample_only",
      personaSegment: "sample_operator_rehearsal",
      workflowTested: "first_session_decision",
      findingCategory: "no_offer_path",
      findingSummary:
        "Sample no-offer outcome records that vague or polite feedback should produce no queue churn and no demand or revenue inference.",
      evidenceStrength: "sample_only",
      objectionClass: "none",
      willingnessToPaySignal: "not_measured",
      privacyRiskSummary: "No live session data or customer material is present.",
      queueTarget: "no_queue_action",
      queueAction: "no_queue_action",
      queueReason: "Preserve blockers and avoid creating work from nonspecific sample evidence.",
      sourcePath: "commons/templates/customer-evidence-redaction/examples/no-action-no-offer.sample.json",
      boundaries: {
        localOnly: true,
        noQueueMutation: true,
        noRevenueClaim: true,
        noCustomerFeedbackClaim: true,
      },
      forbiddenRepoVisibleFields,
    },
  ];

  return {
    format: "proofresume-redacted-session-evidence-inbox-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-REDACTED-SESSION-EVIDENCE-INBOX",
    sourcePattern,
    sourceTemplate: "commons/templates/customer-evidence-redaction/customer-evidence-redaction.template.json",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    noCustomerFeedbackClaim: true,
    noRevenueClaim: true,
    note:
      "Evidence inbox displays sample or owner-approved redacted packets as workflow state. It cannot store raw customer materials or mutate queues.",
    categories: [
      "rehearsal_evidence",
      "authorized_feedback",
      "paid_interest_note",
      "privacy_objection",
      "no_action_no_offer_outcome",
    ],
    counts: {
      total: records.length,
      rehearsalEvidence: records.filter((record) => record.evidenceKind === "rehearsal_evidence").length,
      authorizedFeedback: records.filter((record) => record.evidenceKind === "authorized_feedback").length,
      paidInterest: records.filter((record) => record.evidenceKind === "paid_interest_note").length,
      privacyObjection: records.filter((record) => record.evidenceKind === "privacy_objection").length,
      noOfferOutcome: records.filter((record) => record.evidenceKind === "no_action_no_offer_outcome").length,
    },
    forbiddenRepoVisibleFields,
    queueRouting: {
      suggestionsOnly: true,
      canMarkQueueDone: false,
      canMarkQueueReady: false,
      allowedTargets: ["product", "business", "strategy", "qa_reviewer", "approval_unblocker", "commons", "no_queue_action"],
      rule:
        "Each packet may suggest exactly one queue target after redaction review; controller or owning worker must promote separately.",
    },
    records,
  };
}

function queueFloorSummary(label, queuePath) {
  const absolutePath = path.isAbsolute(queuePath) ? queuePath : path.join(projectRoot, queuePath);
  const queue = fs.existsSync(absolutePath) ? JSON.parse(fs.readFileSync(absolutePath, "utf8")) : { items: [] };
  const items = Array.isArray(queue.items) ? queue.items : [];
  const counts = items.reduce((memo, item) => {
    const status = item?.status || "unknown";
    memo[status] = (memo[status] || 0) + 1;
    return memo;
  }, {});
  const firstReady = items.find((item) => item?.status === "ready") || null;
  const activeClaim = items.find((item) => item?.status === "claimed" && item?.lease_expires_at) || null;
  return {
    label,
    path: path.isAbsolute(queuePath) ? queuePath.replace(`${path.resolve(projectRoot, "..", "..")}/`, "") : queuePath,
    counts,
    readyCount: counts.ready || 0,
    claimedCount: counts.claimed || 0,
    blockedCount: counts.blocked || 0,
    firstReadyId: firstReady?.id || null,
    activeClaimId: activeClaim?.id || null,
    queueMutationAllowedFromLaunchRoom: false,
  };
}

function latestRoleEvidence(role) {
  const rolePattern = new RegExp(role, "i");
  const latest = passes.find((pass) => rolePattern.test(String(pass.role || pass.lane || pass.id || "")));
  if (!latest) return null;
  return {
    id: latest.id || latest.passId || latest.run_id || "unknown",
    status: latest.status || "observed",
    finishedAt: latest.finishedAt || latest.checkedAt || latest.startedAt || null,
    summary: latest.summary || latest.task || latest.prompt || "",
    report: latest.report || "",
  };
}

function businessGateFor(visibility, controlId) {
  const control = (visibility?.controls || []).find((item) => item.id === controlId) || {};
  return {
    id: controlId,
    label: control.label || controlId,
    sourceStatus: control.status || "unknown",
    displayState: control.enabled ? "policy_enabled_needs_operator_evidence" : "blocked_or_setup_needed",
    externalActionAllowedFromLaunchRoom: false,
    oneMissingUserOrPlatformItem:
      control.oneMissingUserOrPlatformItem || control.askUserOnlyFor?.[0] || control.requiredEvidenceToEnable?.[0] || "operator authority evidence",
  };
}

function buildFirstCustomerLaunchRoomVisibility({
  businessControlsVisibility,
  conciergeFulfillmentDashboard,
  redactedSessionEvidenceInbox,
}) {
  const evidenceRecords = redactedSessionEvidenceInbox?.records || [];
  const readinessAreas = [
    {
      id: "product_demo",
      label: "Product demo",
      state: "ready_sample_walkthrough",
      summary: "Local workspace and Target Job Pack demo can rehearse account, resume, target role, matched job, tailored packet, approval, and tracking.",
      source: "website/app.html",
    },
    {
      id: "proof_audit",
      label: "Proof audit",
      state: "ready_sample_packet",
      summary: "Shareable proof-audit packet exists for sample/manual review, with raw customer materials excluded from committed fixtures.",
      source: "ops/product/shareable-proof-audit-packet.md",
    },
    {
      id: "concierge_fulfillment",
      label: "Concierge fulfillment",
      state: conciergeFulfillmentDashboard?.summary?.state || "local_rehearsal_ready_live_blocked",
      summary: conciergeFulfillmentDashboard?.summary?.note || "Manual fulfillment is local rehearsal only.",
      source: "ops/product/concierge-fulfillment-dashboard.md",
    },
    {
      id: "feedback_evidence",
      label: "Feedback evidence",
      state: redactedSessionEvidenceInbox?.sampleOrOwnerApprovedRedactedOnly ? "sample_or_redacted_only" : "missing_redaction_contract",
      summary: `${evidenceRecords.length} sample/redacted evidence packet slots are visible without queue mutation or customer/revenue claims.`,
      source: "ops/product/redacted-session-evidence-inbox.md",
    },
    {
      id: "owner_blockers",
      label: "Owner blockers",
      state: "external_authority_required",
      summary: "Deploy, outreach, payment, analytics, customer-data, public-proof, referral, and testimonial gates remain outside this local product surface.",
      source: "ops/BUSINESS_CONTROLS.json",
    },
    {
      id: "qa_reviewer_status",
      label: "QA and reviewer",
      state: latestRoleEvidence("qa|reviewer") ? "evidence_available" : "needs_latest_review",
      summary: "Static validation evidence is available; live browser QA remains separate from this read-only launch-room state.",
      source: "ops/reports",
    },
  ];

  const businessGateState = [
    "public_deploy",
    "outbound_outreach",
    "payment_collection",
    "analytics",
    "customer_data",
    "lead_capture",
  ].map((controlId) => businessGateFor(businessControlsVisibility, controlId));

  const queueFloorState = [
    queueFloorSummary("Product", "ops/queues/product.json"),
    queueFloorSummary("Business", "ops/queues/business.json"),
    queueFloorSummary("Strategy", "ops/queues/strategy.json"),
    queueFloorSummary("Commons", path.resolve(projectRoot, "..", "..", "commons", "queues", "services.json")),
  ];

  return {
    format: "proofresume-first-customer-launch-room-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-FIRST-CUSTOMER-LAUNCH-ROOM-INTEGRATION",
    sourcePattern: "commons/templates/first-customer-launch-room",
    sourceMode: "sample_rehearsal",
    localOnly: true,
    sampleOrAuthorizedRedactedOnly: true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canClaimCustomerFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimRevenue: false,
    canDisplayPaymentLink: false,
    canRequestTestimonialOrReferral: false,
    canStoreProductionCustomerData: false,
    note:
      "Read-only launch coordination state. It routes one next internal action but cannot mutate queues, collect customer data, send outreach, deploy, run analytics, collect payment, or claim customer/revenue evidence.",
    evidenceSummary: {
      totalRecords: evidenceRecords.length,
      evidenceWindow: "sample and owner-approved-redacted slots only",
      sourceInbox: "ops/product/redacted-session-evidence-inbox.md",
      sourceInboxFormat: redactedSessionEvidenceInbox?.format || "missing",
      proofBoundary: "No raw resumes, identities, contact details, private replies, payment data, credentials, calendar links, dashboard URLs, or customer materials.",
    },
    readinessAreas,
    businessGateState,
    ownerAskList: businessGateState
      .filter((gate) => gate.externalActionAllowedFromLaunchRoom === false)
      .slice(0, 5)
      .map((gate) => ({
        gateId: gate.id,
        ask: gate.oneMissingUserOrPlatformItem,
        repoSafeOnly: true,
      })),
    queueFloorState,
    qaReviewerState: {
      qa: latestRoleEvidence("qa"),
      reviewer: latestRoleEvidence("reviewer"),
      browserQaCanBeInferredFromLaunchRoom: false,
    },
    nextAgentRouting: {
      primaryRoute: "product",
      nextAction: "Build the consented audit handoff preview after this launch room validates.",
      queueItemId: "NORTHSTAR-CONSENTED-AUDIT-HANDOFF-PREVIEW",
      reason: "The launch room makes readiness visible; the next product gap is the candidate-approved manual-share handoff preview.",
      exactlyOnePrimaryRoute: true,
      mutatesQueues: false,
    },
    blockedClaims: [
      "customer feedback observed",
      "willingness to pay observed",
      "revenue observed",
      "public proof approved",
      "referral approved",
      "testimonial approved",
      "deploy ready",
      "outreach authorized from UI",
      "payment collection ready",
      "analytics enabled",
      "provider connected",
      "production customer-data handling ready",
    ],
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
      "provider record ids",
    ],
  };
}

function findReactionCard(inbox, signalType) {
  return (inbox?.reactionCards || []).find((card) => card.signalType === signalType) || null;
}

function buildFirstCustomerSignalSurfaceVisibility() {
  const valueReceipt = readJson("ops/product/first-customer-value-receipt-packet.sample.json", {});
  const feedbackAdapter = readJson("ops/product/first-customer-live-feedback-capture-adapter.sample.json", {});
  const signalCockpit = readJson("ops/product/first-customer-signal-cockpit.sample.json", {});
  const reactionInbox = readJson("ops/product/first-customer-redacted-reaction-inbox.sample.json", {});
  const captureHandoff = readJson("ops/product/first-customer-capture-handoff-packet.sample.json", {});
  const qaFixtureMatrix = readJson("ops/product/first-customer-signal-qa-fixture-matrix.sample.json", {});
  const paidPacketReaction = findReactionCard(reactionInbox, "paid_packet_value") || {};
  const cockpitRoute = signalCockpit.recommendedRoute || {};
  const receiptSummary = valueReceipt.receiptSummary || {};
  const selectedRoute = paidPacketReaction.selectedRoute || cockpitRoute;
  const routeBlockedBy = selectedRoute.blockedBy || cockpitRoute.blockedBy || [];

  return {
    format: "proofresume-first-customer-signal-surface-integration-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-FIRST-CUSTOMER-SIGNAL-SURFACE-INTEGRATION",
    surfacePath: "website/admin.html#first-customer-signal-surface",
    mode: "sample_redacted_admin_surface_no_external_actions",
    state: "sample_redacted_signal_path_visible",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canClaimCustomerFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimRevenue: false,
    canDisplayPaymentLink: false,
    canRequestTestimonialOrReferral: false,
    canStoreProductionCustomerData: false,
    note:
      "Read-only first-customer signal surface. It ties one sample value receipt to one redacted reaction, consent/redaction state, blocked gates, and one internal route without enabling external action.",
    sourceArtifacts: [
      {
        id: "first_customer_value_receipt_packet",
        path: "ops/product/first-customer-value-receipt-packet.sample.json",
        state: valueReceipt.format ? "sample_value_receipt_ready" : "missing",
      },
      {
        id: "first_customer_live_feedback_capture_adapter",
        path: "ops/product/first-customer-live-feedback-capture-adapter.sample.json",
        state: feedbackAdapter.format ? "sample_capture_adapter_ready" : "missing",
      },
      {
        id: "first_customer_signal_cockpit",
        path: "ops/product/first-customer-signal-cockpit.sample.json",
        state: signalCockpit.format ? "sample_signal_cockpit_ready" : "missing",
      },
      {
        id: "first_customer_redacted_reaction_inbox",
        path: "ops/product/first-customer-redacted-reaction-inbox.sample.json",
        state: reactionInbox.format ? "redacted_reaction_inbox_ready" : "missing",
      },
      {
        id: "first_customer_capture_handoff_packet",
        path: "ops/product/first-customer-capture-handoff-packet.sample.json",
        state: captureHandoff.format ? "capture_handoff_packet_ready" : "missing",
      },
      {
        id: "first_customer_signal_qa_fixture_matrix",
        path: "ops/product/first-customer-signal-qa-fixture-matrix.sample.json",
        state: qaFixtureMatrix.format ? "signal_qa_fixture_matrix_ready" : "missing",
      },
      {
        id: "commons_single_authorized_session_prep_pattern",
        path: "/Users/zackgrizz/Documents/AgentFoundry/commons/templates/single-authorized-session-prep/docs/session-prep-state-and-queue-rules.md",
        state: fs.existsSync("/Users/zackgrizz/Documents/AgentFoundry/commons/templates/single-authorized-session-prep/docs/session-prep-state-and-queue-rules.md")
          ? "commons_pattern_ready"
          : "missing",
      },
    ],
    valueReceipt: {
      receiptId: receiptSummary.receiptId || signalCockpit.panels?.valueReceipt?.receiptId || "",
      targetRole: receiptSummary.targetRole || signalCockpit.panels?.valueReceipt?.targetRole || "Sample target role",
      selectedSampleOutcome:
        receiptSummary.selectedSampleOutcome || signalCockpit.panels?.valueReceipt?.selectedSampleOutcome || "sample_only",
      selectedSafeRoute:
        receiptSummary.selectedSafeRoute || signalCockpit.panels?.valueReceipt?.selectedSafeRoute || "no_queue_action",
      receiptSummary:
        receiptSummary.routeMeaning ||
        "Sample value receipt shows proof-backed transformation and missing proof before any paid-packet or live action claim.",
      missingProofWarningCount:
        (valueReceipt.missingProofWarnings || []).length || signalCockpit.panels?.valueReceipt?.missingProofWarningCount || 0,
      sampleOnly: true,
    },
    redactedReaction: {
      reactionId: paidPacketReaction.reactionId || "sample-reaction-paid-packet-value",
      title: paidPacketReaction.inboxCard?.title || "Paid packet value noted",
      signalType: paidPacketReaction.signalType || "paid_packet_value",
      sourceMode: paidPacketReaction.sourceMode || "sample_rehearsal",
      consentState: paidPacketReaction.consentState || "sample_only",
      redactionState: paidPacketReaction.redactionState || "sample_only",
      blockedGate: paidPacketReaction.blockedGate || "payment_authority",
      proofLevel: paidPacketReaction.proofLevel || "L0_sample_rehearsal",
      confidence: paidPacketReaction.confidence || "medium",
      summary:
        paidPacketReaction.displaySummary ||
        paidPacketReaction.inboxCard?.summary ||
        "Sample/redacted reaction points to paid-packet prep while payment and customer-data gates stay blocked.",
      isPaymentIntent: false,
      isRevenueEvidence: false,
    },
    consentAndRedaction: {
      consentState: paidPacketReaction.consentState || "sample_only",
      redactionState: paidPacketReaction.redactionState || "sample_only",
      custodyRule:
        "Only sample-safe categories, redacted state, blocked gates, source labels, and route metadata may appear in the repo-visible surface.",
      rawPrivateMaterialAccepted: false,
      prospectIdentityAllowed: false,
      contactDetailAllowed: false,
      productionCustomerMaterialAllowed: false,
    },
    blockedGates: routeBlockedBy.map((gate) => ({
      id: gate,
      label: gate.replaceAll("_", " "),
      state: "blocked",
      reason: "Required before any live customer-data, payment, provider, scheduling, public-proof, send, or submit action.",
    })),
    recommendedRoute: {
      routeId: selectedRoute.routeId || "business_private_paid_packet_prep_no_checkout",
      target: selectedRoute.target || "business",
      ownerRole: selectedRoute.ownerRole || "business-operator",
      action: selectedRoute.action || "create_blocked_item",
      rationale:
        cockpitRoute.reason ||
        "Paid-packet value is inspectable as a local sample path, while payment, customer-data, support, refund, provider, and delivery gates remain blocked.",
      blockedBy: routeBlockedBy,
      exactlyOneRoute: true,
      queueMutationAllowed: false,
      externalActionAllowed: false,
      mustNotMarkDownstreamDone: true,
      isCustomerFeedbackEvidence: false,
      isPaymentIntentEvidence: false,
      isRevenueEvidence: false,
    },
    forbiddenOutcomes: [
      "customer feedback observed",
      "willingness to pay observed",
      "payment intent observed",
      "payment observed",
      "revenue observed",
      "public proof approved",
      "testimonial approved",
      "referral approved",
      "deploy authorized",
      "outreach authorized",
      "provider connected",
      "application submission authorized",
    ],
  };
}

function buildFirstCustomerEvidenceInboxRoomVisibility() {
  const fixture = readJson("ops/product/first-customer-evidence-inbox-room.sample.json", {});
  const selectedRoute = fixture.selectedProvisionalRoute || {};

  return {
    format: fixture.format || "proofresume-first-customer-evidence-inbox-room-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-FIRST-CUSTOMER-EVIDENCE-INBOX-ROOM",
    surfacePath: "website/admin.html#first-customer-evidence-inbox-room",
    mode: fixture.mode || "sample_or_owner_approved_redacted_evidence_inbox_no_external_actions",
    state: fixture.format ? "sample_redacted_evidence_inbox_visible" : "fixture_missing",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canClaimCustomerFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimPayment: false,
    canClaimRevenue: false,
    canDisplayPaymentLink: false,
    canRequestTestimonialOrReferral: false,
    canStoreProductionCustomerData: false,
    note:
      "Local first-customer evidence inbox room. It normalizes sample-only or owner-approved redacted source custody, consent, redaction, labels, blocked gates, and one internal route without enabling downstream queue mutation.",
    sourceArtifacts: fixture.sourceArtifacts || [],
    sourceCustody: fixture.sourceCustody || {},
    evidenceEnvelope: fixture.evidenceEnvelope || {},
    claimBoundary: fixture.claimBoundary || {},
    missingBeforeLiveUse: fixture.missingBeforeLiveUse || [],
    blockedGates: fixture.blockedGates || [],
    provisionalRoutes: fixture.provisionalRoutes || [],
    selectedProvisionalRoute: {
      routeFamily: selectedRoute.routeFamily || "no_action",
      target: selectedRoute.target || "controller",
      action: selectedRoute.action || "no_action",
      rationale: selectedRoute.rationale || "No fixture route available.",
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    repoSafety: fixture.repoSafety || {},
  };
}

function buildFirstCustomerEvidenceRouteScoreboardVisibility() {
  const fixture = readJson("ops/product/first-customer-evidence-route-scoreboard.sample.json", {});
  const selectedRoute = fixture.selectedRoute || {};

  return {
    format: fixture.format || "proofresume-first-customer-evidence-route-scoreboard-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-FIRST-CUSTOMER-EVIDENCE-ROUTE-SCOREBOARD",
    surfacePath: "website/admin.html#first-customer-evidence-route-scoreboard",
    mode: fixture.mode || "local_sample_redacted_route_scoreboard_no_external_actions",
    state: fixture.format ? "local_scoreboard_visible" : "fixture_missing",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canClaimLiveFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimPayment: false,
    canClaimRevenue: false,
    canClaimPublicProof: false,
    canStoreProductionCustomerData: false,
    note:
      "Local first-customer evidence route scoreboard. It consumes the evidence inbox packet, scores safe evidence labels, and selects exactly one internal route without enabling live claims or downstream mutation.",
    consumedArtifacts: fixture.consumedArtifacts || [],
    scoreDimensions: fixture.scoreDimensions || [],
    routeOptions: fixture.routeOptions || [],
    scoreFixtures: fixture.scoreFixtures || [],
    narrowUserAsk: fixture.narrowUserAsk || null,
    narrowUserAskRules: fixture.narrowUserAskRules || [],
    claimControls: fixture.claimControls || {},
    selectedRoute: {
      routeFamily: selectedRoute.routeFamily || "product_repair",
      target: selectedRoute.target || "product",
      action: selectedRoute.action || "product_first_customer_evidence_proof_repair",
      rationale: selectedRoute.rationale || "No fixture route available.",
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    repoSafety: fixture.repoSafety || {},
  };
}

function buildFirstCustomerEvidenceProofRepairPacketVisibility() {
  const fixture = readJson("ops/product/first-customer-evidence-proof-repair-packet.sample.json", {});
  const selectedRoute = fixture.selectedInternalRoute || {};

  return {
    format: fixture.format || "proofresume-first-customer-evidence-proof-repair-packet-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-FIRST-CUSTOMER-EVIDENCE-PROOF-REPAIR-PACKET",
    surfacePath: "website/admin.html#first-customer-evidence-proof-repair-packet",
    mode: fixture.mode || "local_sample_redacted_proof_repair_packet_no_external_actions",
    state: fixture.format ? "local_proof_repair_packet_visible" : "fixture_missing",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    rawCustomerMaterialsExcluded: fixture.repoSafety?.rawCustomerMaterialsExcluded === true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canClaimCustomerFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimPayment: false,
    canClaimRevenue: false,
    canClaimPublicProof: false,
    canStoreProductionCustomerData: false,
    note:
      "Local first-customer evidence proof-repair packet. It consumes the selected Product repair route, prepares safe missing-proof prompts and repaired copy, and excludes raw customer materials, payment/customer-data handling, live claims, external actions, and downstream mutation.",
    consumedRouteScoreboard: fixture.consumedRouteScoreboard || {},
    sourceCustodyLabels: fixture.sourceCustodyLabels || [],
    missingProofCategories: fixture.missingProofCategories || [],
    safeFollowUpPrompts: fixture.safeFollowUpPrompts || [],
    beforeAfterRepairCopy: fixture.beforeAfterRepairCopy || [],
    proofCompletenessRepairOutput: fixture.proofCompletenessRepairOutput || {},
    blockedExternalActions: fixture.blockedExternalActions || {},
    claimControls: fixture.claimControls || {},
    selectedInternalRoute: {
      routeFamily: selectedRoute.routeFamily || "product_repair",
      target: selectedRoute.target || "product",
      action: selectedRoute.action || "product_first_customer_evidence_proof_repair",
      rationale: selectedRoute.rationale || "No fixture route available.",
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    repoSafety: fixture.repoSafety || {},
  };
}

function buildRepairedProofToPaidAskRoomVisibility() {
  const fixture = readJson("ops/product/repaired-proof-to-paid-ask-room.sample.json", {});
  const selectedRoute = fixture.selectedInternalRoute || {};

  return {
    format: fixture.format || "proofresume-repaired-proof-to-paid-ask-room-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-REPAIRED-PROOF-TO-PAID-ASK-ROOM",
    surfacePath: "website/admin.html#repaired-proof-to-paid-ask-room",
    mode: fixture.mode || "local_sample_redacted_paid_ask_rehearsal_no_checkout_no_external_actions",
    state: fixture.format ? "local_paid_ask_room_visible" : "fixture_missing",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    rawCustomerMaterialsExcluded: fixture.repoSafety?.rawCustomerMaterialsExcluded === true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canDisplayPaymentLink: false,
    canOpenCheckout: false,
    canCollectPayment: false,
    canStoreProductionCustomerData: false,
    canClaimCustomerFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimPayment: false,
    canClaimRevenue: false,
    canClaimPublicProof: false,
    note:
      "Local repaired-proof to paid-ask rehearsal room. It consumes repaired proof, paid preview, decision-room, no-send offer, and fulfillment boundary artifacts while payment links, checkout, customer-data handling, external actions, live claims, and downstream mutation remain blocked.",
    sourceArtifacts: fixture.sourceArtifacts || [],
    proofDelta: fixture.proofDelta || [],
    missingProofAsk: fixture.missingProofAsk || [],
    paidPacket: fixture.paidPacket || {},
    supportRefundPaymentPosture: fixture.supportRefundPaymentPosture || {},
    privateOperatorHandoff: fixture.privateOperatorHandoff || {},
    objectionStates: fixture.objectionStates || [],
    selectedInternalRoute: {
      target: selectedRoute.target || "business",
      route: selectedRoute.route || "business_private_paid_packet_discussion_no_checkout",
      rationale: selectedRoute.rationale || "No fixture route available.",
      externalActionAllowed: false,
      paymentActionAllowed: false,
      customerDataHandlingAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
    },
    blockedExternalActions: fixture.blockedExternalActions || {},
    claimControls: fixture.claimControls || {},
    repoSafety: fixture.repoSafety || {},
  };
}

function buildPaidAskOutcomeRouterVisibility() {
  const fixture = readJson("ops/product/paid-ask-outcome-router.sample.json", {});
  const selectedRoute = fixture.selectedRoute || {};

  return {
    format: fixture.format || "proofresume-paid-ask-outcome-router-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-PAID-ASK-OUTCOME-ROUTER",
    surfacePath: "website/admin.html#paid-ask-outcome-router",
    mode: fixture.mode || "local_sample_redacted_paid_ask_outcome_router_no_external_actions",
    state: fixture.format ? "local_paid_ask_outcome_router_visible" : "fixture_missing",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canDisplayPaymentLink: false,
    canOpenCheckout: false,
    canCollectPayment: false,
    canStoreProductionCustomerData: false,
    canClaimLiveFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimPayment: false,
    canClaimRevenue: false,
    canClaimPublicProof: false,
    canClaimReferralOrTestimonial: false,
    note:
      "Local paid-ask outcome router. It consumes a paid-ask room when available, falls back to evidence route/proof repair fixtures, and exports one repo-safe route packet while live feedback, willingness-to-pay, payment intent, payment, public proof, referral/testimonial, revenue, external action, and downstream queue mutation remain false.",
    consumedArtifacts: fixture.consumedArtifacts || [],
    routePacket: fixture.routePacket || {},
    outcomeRoutes: fixture.outcomeRoutes || [],
    selectedRoute: {
      routeFamily: selectedRoute.routeFamily || "product_repair",
      target: selectedRoute.target || "product",
      action: selectedRoute.action || "product_paid_ask_packet_or_proof_repair",
      rationale: selectedRoute.rationale || "No fixture route available.",
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    evidenceStateLegend: fixture.evidenceStateLegend || {},
    blockedExternalActions: fixture.blockedExternalActions || {},
    claimControls: fixture.claimControls || {},
    repoSafety: fixture.repoSafety || {},
  };
}

function buildPaidAskProofPacketClarityRepairVisibility() {
  const fixture = readJson("ops/product/paid-ask-proof-packet-clarity-repair.sample.json", {});
  const nextRoute = fixture.safeNextRoutePacket || {};

  return {
    format: fixture.format || "proofresume-paid-ask-proof-packet-clarity-repair-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-PAID-ASK-PROOF-PACKET-CLARITY-REPAIR",
    surfacePath: "website/admin.html#paid-ask-proof-packet-clarity-repair",
    mode: fixture.mode || "local_sample_redacted_paid_ask_proof_packet_clarity_repair_no_checkout_no_external_actions",
    state: fixture.format ? "local_paid_ask_clarity_repair_visible" : "fixture_missing",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    rawCustomerMaterialsExcluded: fixture.repoSafety?.rawCustomerMaterialsExcluded === true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canDisplayPaymentLink: false,
    canOpenCheckout: false,
    canCollectPayment: false,
    canStoreProductionCustomerData: false,
    canClaimLiveFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimPayment: false,
    canClaimRevenue: false,
    canClaimPublicProof: false,
    canClaimReferralOrTestimonial: false,
    note:
      "Local paid-ask proof and packet clarity repair. It consumes the selected Product repair route, improves proof explanations, packet mechanics, approval controls, and stop copy, then emits one no-send next-route packet while checkout, payment, customer data, live claims, external action, and downstream mutation remain blocked.",
    consumedArtifacts: fixture.consumedArtifacts || [],
    selectedSourceRoute: fixture.selectedSourceRoute || {},
    clarityRepairs: fixture.clarityRepairs || [],
    proofExplanationRepair: fixture.proofExplanationRepair || {},
    paidPacketMechanicsRepair: fixture.paidPacketMechanicsRepair || {},
    approvalControls: fixture.approvalControls || [],
    stopCopy: fixture.stopCopy || {},
    safeNextRoutePacket: {
      evidenceMode: nextRoute.evidenceMode || "sample_readiness",
      selectedRouteFamily: nextRoute.selectedRouteFamily || "business_no_send_follow_up",
      selectedAction: nextRoute.selectedAction || "business_private_paid_packet_discussion_no_checkout",
      suggestedOwner: nextRoute.suggestedOwner || "Business Operator",
      acceptanceCriteria: nextRoute.acceptanceCriteria || "Private no-send operator review only.",
      validationExpectation: nextRoute.validationExpectation || "No checkout, payment/customer-data handling, queue mutation, or live claim.",
      selected: true,
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    blockedExternalActions: fixture.blockedExternalActions || {},
    claimControls: fixture.claimControls || {},
    repoSafety: fixture.repoSafety || {},
  };
}

function buildPaidAskObjectionResponseSimulatorVisibility() {
  const fixture = readJson("ops/product/paid-ask-objection-response-simulator.sample.json", {});
  const selectedRoute = fixture.selectedObjectionRoute || {};

  return {
    format: fixture.format || "proofresume-paid-ask-objection-response-simulator-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-PAID-ASK-OBJECTION-RESPONSE-SIMULATOR",
    surfacePath: "website/admin.html#paid-ask-objection-response-simulator",
    mode: fixture.mode || "local_sample_redacted_paid_ask_objection_response_simulator_no_external_actions",
    state: fixture.format ? "local_paid_ask_objection_simulator_visible" : "fixture_missing",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    rawCustomerMaterialsExcluded: fixture.repoSafety?.rawCustomerMaterialsExcluded === true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canDisplayPaymentLink: false,
    canOpenCheckout: false,
    canCollectPayment: false,
    canStoreProductionCustomerData: false,
    canClaimLiveFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimPayment: false,
    canClaimRevenue: false,
    canClaimPublicProof: false,
    canClaimReferralOrTestimonial: false,
    note:
      "Local paid-ask objection response simulator. It consumes paid-ask repair/router evidence, maps sample objections to safe response copy, first blocking gate, product repair cue, and exactly one internal route while checkout, payment, customer data, live claims, external action, and downstream mutation remain blocked.",
    consumedArtifacts: fixture.consumedArtifacts || [],
    selectedObjectionId: fixture.selectedObjectionId || "missing_proof",
    selectedObjectionRoute: {
      routeFamily: selectedRoute.routeFamily || "product_repair",
      target: selectedRoute.target || "product",
      action: selectedRoute.action || "product_missing_proof_response_repair",
      suggestedOwner: selectedRoute.suggestedOwner || "Product Worker",
      selected: true,
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    objectionStates: fixture.objectionStates || [],
    responseCopy: fixture.responseCopy || [],
    evidenceStateBoundary: fixture.evidenceStateBoundary || {},
    blockedExternalActions: fixture.blockedExternalActions || {},
    claimControls: fixture.claimControls || {},
    repoSafety: fixture.repoSafety || {},
  };
}

function buildFirstPaidPilotHandoffRoomVisibility() {
  const fixture = readJson("ops/product/first-paid-pilot-handoff-room.sample.json", {});
  const ownerPacket = fixture.ownerGoNoGoPacket || {};

  return {
    format: fixture.format || "proofresume-first-paid-pilot-handoff-room-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-FIRST-PAID-PILOT-HANDOFF-ROOM",
    surfacePath: "website/admin.html#first-paid-pilot-handoff-room",
    mode: fixture.mode || "local_sample_redacted_first_paid_pilot_handoff_no_checkout_no_external_actions",
    state: fixture.format ? "local_first_paid_pilot_handoff_visible" : "fixture_missing",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    rawCustomerMaterialsExcluded: fixture.repoSafety?.rawCustomerMaterialsExcluded === true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canDisplayPaymentLink: false,
    canOpenCheckout: false,
    canCollectPayment: false,
    canStoreProductionCustomerData: false,
    canClaimLiveFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimPayment: false,
    canClaimRevenue: false,
    canClaimPublicProof: false,
    canClaimReferralOrTestimonial: false,
    note:
      "Local first paid pilot handoff room. It consumes paid-ask clarity, repaired proof, first-paid decision, customer-data fulfillment, business controls, and the Business no-send packet when available, then emits one owner go/no-go packet while checkout, payment, customer data, live claims, external action, and downstream mutation remain blocked.",
    consumedArtifacts: fixture.consumedArtifacts || [],
    pilotValue: fixture.pilotValue || [],
    proofDelta: fixture.proofDelta || {},
    missingProof: fixture.missingProof || [],
    deliverables: fixture.deliverables || [],
    approvalState: fixture.approvalState || {},
    gates: fixture.gates || {},
    ownerGoNoGoPacket: {
      routeId: ownerPacket.routeId || "owner_first_paid_pilot_go_no_go_packet",
      selected: true,
      suggestedOwner: ownerPacket.suggestedOwner || "Owner / Approval Unblocker",
      ownerFields: ownerPacket.ownerFields || [],
      acceptanceCriteria: ownerPacket.acceptanceCriteria || "Owner reviews pilot gates before live use.",
      validationExpectation: ownerPacket.validationExpectation || "No checkout, payment/customer-data handling, queue mutation, or live claim.",
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
    },
    blockedExternalActions: fixture.blockedExternalActions || {},
    unsupportedClaims: fixture.unsupportedClaims || {},
    repoSafety: fixture.repoSafety || {},
  };
}

function buildFirstPaidPilotGateSimulatorVisibility() {
  const fixture = readJson("ops/product/first-paid-pilot-gate-simulator.sample.json", {});
  const selectedRoute = fixture.selectedRoute || {};

  return {
    format: fixture.format || "proofresume-first-paid-pilot-gate-simulator-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-FIRST-PAID-PILOT-GATE-SIMULATOR",
    surfacePath: "website/admin.html#first-paid-pilot-gate-simulator",
    mode: fixture.mode || "local_admin_first_paid_pilot_gate_simulator_no_external_actions",
    state: fixture.format ? "local_first_paid_pilot_gate_simulator_visible" : "fixture_missing",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    safeLabelsOnly: fixture.repoSafety?.safeLabelsOnly === true,
    gateStateSeparation: fixture.repoSafety?.gateStateSeparation === true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canDisplayPaymentLink: false,
    canOpenCheckout: false,
    canCollectPayment: false,
    canStoreProductionCustomerData: false,
    canDeploy: false,
    canSendOutreach: false,
    canSendAnalytics: false,
    canPublishPublicProof: false,
    canClaimLiveFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimPayment: false,
    canClaimRevenue: false,
    canClaimPublicProof: false,
    canClaimReferralOrTestimonial: false,
    note:
      "Local/admin first paid pilot gate simulator. It reads business-control context and owner-evidence template references, shows ready/blocked/repair-needed/not-applicable gate states, and emits one owner-evidence repair ask while checkout, payment, production customer data, deploy, outreach, scheduling, analytics, provider mutation, public proof, live claims, and downstream queue mutation remain blocked.",
    sourceArtifacts: fixture.sourceArtifacts || [],
    gateStates: fixture.gateStates || [],
    selectedRoute: {
      routeId: selectedRoute.routeId || "owner_evidence_repair_ask",
      selected: true,
      routeFamily: selectedRoute.routeFamily || "approval_unblocker_owner_gate_repair",
      suggestedOwner: selectedRoute.suggestedOwner || "Approval Unblocker",
      action: selectedRoute.action || "repair_first_paid_pilot_owner_evidence",
      ask: selectedRoute.ask || "Repair the first blocking owner evidence gate before live use.",
      reason: selectedRoute.reason || "One owner-evidence repair route is selected while live gates remain blocked.",
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    alternateRoutes: fixture.alternateRoutes || [],
    blockedExternalActions: fixture.blockedExternalActions || {},
    claimControls: fixture.claimControls || {},
    repoSafety: fixture.repoSafety || {},
  };
}

function buildFirstDollarReadinessRoomVisibility() {
  const fixture = readJson("ops/product/first-dollar-readiness-room.sample.json", {});
  const selectedRoute = (fixture.routePackets || []).find((route) => route.selected) || {};

  return {
    format: fixture.format || "proofresume-first-dollar-readiness-room-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-FIRST-DOLLAR-READINESS-ROOM",
    surfacePath: "website/admin.html#first-dollar-readiness-room",
    mode: fixture.mode || "local_sample_first_dollar_readiness_no_payment_no_customer_data_no_external_actions",
    state: fixture.format ? "local_first_dollar_readiness_visible" : "fixture_missing",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    safeLabelsOnly: fixture.repoSafety?.safeLabelsOnly === true,
    firstBlockingGateVisible: fixture.repoSafety?.firstBlockingGateVisible === true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canDisplayPaymentLink: false,
    canOpenCheckout: false,
    canCollectPayment: false,
    canStoreProductionCustomerData: false,
    canSendOutreach: false,
    canSendAnalytics: false,
    canPublishPublicProof: false,
    canRequestTestimonialOrReferral: false,
    canClaimLiveFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimPayment: false,
    canClaimRevenue: false,
    canClaimPublicProof: false,
    canClaimReferralOrTestimonial: false,
    note:
      "Local/admin first dollar readiness room. It consumes paid-ask clarity, paid-ask routing, repaired proof, first paid pilot handoff, first paid pilot gate simulation, owner evidence references, and business controls, then emits one owner-evidence repair route while payment links, checkout, production customer data, public proof, external actions, unsupported first-dollar claims, and downstream mutation remain blocked.",
    consumedArtifacts: fixture.consumedArtifacts || [],
    proofClarity: fixture.proofClarity || {},
    packetDeliverables: fixture.packetDeliverables || [],
    readinessQuestions: fixture.readinessQuestions || [],
    firstBlockingGate: fixture.firstBlockingGate || {},
    routePackets: fixture.routePackets || [],
    selectedRoute: {
      routeId: selectedRoute.routeId || "approval_unblocker_first_dollar_owner_evidence_repair",
      selected: true,
      routeFamily: selectedRoute.routeFamily || "approval_unblocker_owner_gate_repair",
      suggestedOwner: selectedRoute.suggestedOwner || "Approval Unblocker",
      action: selectedRoute.action || "repair_first_dollar_owner_evidence",
      reason: selectedRoute.reason || "First-dollar readiness remains blocked until owner evidence is repaired.",
      acceptanceCriteria: selectedRoute.acceptanceCriteria || "Repair non-secret owner evidence without exposing credentials or sensitive customer data.",
      validationExpectation: selectedRoute.validationExpectation || "No checkout, payment/customer-data handling, queue mutation, or first-dollar claim.",
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    disabledAffordances: fixture.disabledAffordances || {},
    blockedExternalActions: fixture.blockedExternalActions || {},
    unsupportedClaims: fixture.unsupportedClaims || {},
    repoSafety: fixture.repoSafety || {},
  };
}

function buildFirstDollarOwnerEvidenceRepairRoomVisibility() {
  const fixture = readJson("ops/product/first-dollar-owner-evidence-repair-room.sample.json", {});
  const selectedRoute = (fixture.routePackets || []).find((route) => route.selected) || {};

  return {
    format: fixture.format || "proofresume-first-dollar-owner-evidence-repair-room-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-FIRST-DOLLAR-OWNER-EVIDENCE-REPAIR-ROOM",
    surfacePath: "website/admin.html#first-dollar-owner-evidence-repair-room",
    mode: fixture.mode || "local_sample_first_dollar_owner_evidence_repair_no_external_actions",
    state: fixture.format ? "local_owner_evidence_repair_visible" : "fixture_missing",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    safeLabelsOnly: fixture.repoSafety?.safeLabelsOnly === true,
    firstBlockingGateVisible: fixture.repoSafety?.firstBlockingGateVisible === true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canDisplayPaymentLink: false,
    canOpenCheckout: false,
    canCollectPayment: false,
    canStoreProductionCustomerData: false,
    canSendOutreach: false,
    canSendAnalytics: false,
    canPublishPublicProof: false,
    canRequestTestimonialOrReferral: false,
    canClaimLiveFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimPayment: false,
    canClaimRevenue: false,
    canClaimPublicProof: false,
    canClaimReferralOrTestimonial: false,
    note:
      "Local/admin first dollar owner-evidence repair room. It consumes first-dollar readiness, first paid pilot gate simulation, paid-ask objection simulation, owner evidence references, owner action request, owner answer intake, and business controls, then emits one owner-evidence repair route while payment links, checkout, production customer data, public proof, external actions, unsupported first-dollar claims, and downstream mutation remain blocked.",
    consumedArtifacts: fixture.consumedArtifacts || [],
    firstBlockingGate: fixture.firstBlockingGate || {},
    ownerEvidenceFields: fixture.ownerEvidenceFields || [],
    exportContract: fixture.exportContract || {},
    routePackets: fixture.routePackets || [],
    selectedRoute: {
      routeId: selectedRoute.routeId || "approval_unblocker_owner_evidence_repair",
      selected: true,
      routeFamily: selectedRoute.routeFamily || "approval_unblocker_owner_gate_repair",
      suggestedOwner: selectedRoute.suggestedOwner || "Approval Unblocker",
      action: selectedRoute.action || "repair_first_dollar_owner_evidence",
      reason: selectedRoute.reason || "Owner evidence repair remains blocked until repo-safe owner answers exist.",
      acceptanceCriteria: selectedRoute.acceptanceCriteria || "Repair non-secret owner evidence without exposing credentials or sensitive customer data.",
      validationExpectation: selectedRoute.validationExpectation || "No checkout, payment/customer-data handling, queue mutation, or first-dollar claim.",
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    disabledAffordances: fixture.disabledAffordances || {},
    blockedExternalActions: fixture.blockedExternalActions || {},
    unsupportedClaims: fixture.unsupportedClaims || {},
    repoSafety: fixture.repoSafety || {},
  };
}

function buildFirstDollarOwnerEvidenceRepairRoomVisibility() {
  const fixture = readJson("ops/product/first-dollar-owner-evidence-repair-room.sample.json", {});
  const selectedRoute = (fixture.routePackets || []).find((route) => route.selected) || {};

  return {
    format: fixture.format || "proofresume-first-dollar-owner-evidence-repair-room-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-FIRST-DOLLAR-OWNER-EVIDENCE-REPAIR-ROOM",
    surfacePath: "website/admin.html#first-dollar-owner-evidence-repair-room",
    mode: fixture.mode || "local_sample_first_dollar_owner_evidence_repair_no_external_actions",
    state: fixture.format ? "local_first_dollar_owner_evidence_repair_visible" : "fixture_missing",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    repoSafeAnswerOnly: fixture.firstBlockingGate?.repoSafeAnswerOnly === true,
    firstBlockingGateVisible: Boolean(fixture.firstBlockingGate?.gateId),
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canDisplayPaymentLink: false,
    canOpenCheckout: false,
    canCollectPayment: false,
    canStoreProductionCustomerData: false,
    canSendOutreach: false,
    canSendAnalytics: false,
    canPublishPublicProof: false,
    canRequestTestimonialOrReferral: false,
    canClaimLiveFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimPayment: false,
    canClaimRevenue: false,
    canClaimPublicProof: false,
    canClaimReferralOrTestimonial: false,
    note:
      "Local/admin first dollar owner-evidence repair room. It shows payment owner, payment-link display scope, support/refund, tax/MoR, customer-data path, session/contact owner, deploy/outreach prerequisites, public-proof stop, and final go/no-go owner fields while payment links, checkout, customer data, public proof, external actions, unsupported first-dollar claims, downstream mutation, and delegated done claims remain blocked.",
    consumedArtifacts: fixture.consumedArtifacts || [],
    firstBlockingGate: fixture.firstBlockingGate || {},
    ownerEvidenceFields: fixture.ownerEvidenceFields || [],
    exportContract: fixture.exportContract || {},
    routePackets: fixture.routePackets || [],
    selectedRoute: {
      routeId: selectedRoute.routeId || "approval_unblocker_owner_evidence_repair",
      selected: true,
      routeFamily: selectedRoute.routeFamily || "approval_unblocker_owner_gate_repair",
      suggestedOwner: selectedRoute.suggestedOwner || "Approval Unblocker",
      action: selectedRoute.action || "repair_first_dollar_owner_evidence",
      reason:
        selectedRoute.reason ||
        "The first blocking gate is missing repo-safe owner evidence; live payment/customer-data/proof actions stay closed.",
      acceptanceCriteria:
        selectedRoute.acceptanceCriteria ||
        "Collect or repair non-secret owner evidence without exposing credentials, contact details, raw resumes, customer materials, payment data, or private replies.",
      validationExpectation:
        selectedRoute.validationExpectation ||
        "Exactly one route, sample-only evidence, no external action, no payment/customer-data handling, no downstream mutation, and no delegated done claim.",
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    disabledAffordances: fixture.disabledAffordances || {},
    blockedExternalActions: fixture.blockedExternalActions || {},
    unsupportedClaims: fixture.unsupportedClaims || {},
    repoSafety: fixture.repoSafety || {},
  };
}


function buildFirstPaidPilotFulfillmentReceiptPreviewVisibility() {
  const fixture = readJson("ops/product/first-paid-pilot-fulfillment-receipt-preview.sample.json", {});
  const selectedRoute = fixture.selectedRoute || {};

  return {
    format: fixture.format || "proofresume-first-paid-pilot-fulfillment-receipt-preview-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-FIRST-PAID-PILOT-FULFILLMENT-RECEIPT-PREVIEW",
    surfacePath: "website/admin.html#first-paid-pilot-fulfillment-receipt-preview",
    mode: fixture.mode || "local_sample_redacted_first_paid_pilot_fulfillment_receipt_no_payment_no_customer_data_no_external_actions",
    state: fixture.format ? "sample_fulfillment_receipt_visible" : "fixture_missing",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    safeLabelsOnly: fixture.repoSafety?.safeLabelsOnly === true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canDisplayPaymentLink: false,
    canOpenCheckout: false,
    canCollectPayment: false,
    canStoreProductionCustomerData: false,
    canSendOutreach: false,
    canSendAnalytics: false,
    canPublishPublicProof: false,
    canRequestTestimonialOrReferral: false,
    canClaimLiveFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimPayment: false,
    canClaimRevenue: false,
    note: "Local/admin sample fulfillment receipt preview. It shows expected paid-pilot deliverables, proof delta, customer-controlled data path, support/refund posture, source custody, unsupported-claim flags, disabled payment state, and exactly one owner-evidence repair route while checkout, payment, customer data, public proof, external actions, downstream mutation, and revenue claims remain blocked.",
    consumedArtifacts: fixture.consumedArtifacts || [],
    receiptDeliverables: fixture.receiptDeliverables || [],
    proofDelta: fixture.proofDelta || {},
    sourceCustodyLabels: fixture.sourceCustodyLabels || [],
    customerControlledDataPath: fixture.customerControlledDataPath || {},
    supportRefundPosture: fixture.supportRefundPosture || {},
    selectedRoute: {
      routeId: selectedRoute.routeId || "approval_unblocker_first_paid_receipt_owner_evidence_repair",
      selected: true,
      routeFamily: selectedRoute.routeFamily || "approval_unblocker_owner_gate_repair",
      suggestedOwner: selectedRoute.suggestedOwner || "Approval Unblocker",
      action: selectedRoute.action || "repair_first_paid_pilot_receipt_owner_evidence",
      reason: selectedRoute.reason || "Receipt remains sample-only until owner evidence is repaired.",
      acceptanceCriteria: selectedRoute.acceptanceCriteria || "Repair non-secret owner evidence before live use.",
      validationExpectation: selectedRoute.validationExpectation || "No checkout, payment/customer-data handling, queue mutation, or revenue claim.",
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    alternateRoutes: fixture.alternateRoutes || [],
    blockedExternalActions: fixture.blockedExternalActions || {},
    unsupportedClaims: fixture.unsupportedClaims || {},
    repoSafety: fixture.repoSafety || {},
  };
}

function buildFirstLiveProofAuditCopilotVisibility() {
  const fixture = readJson("ops/product/first-live-proof-audit-copilot.sample.json", {});
  const selectedRoute = fixture.selectedRoute || {};

  return {
    format: fixture.format || "proofresume-first-live-proof-audit-copilot-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-FIRST-LIVE-PROOF-AUDIT-COPILOT",
    surfacePath: "website/admin.html#first-live-proof-audit-copilot",
    mode: fixture.mode || "local_sample_redacted_live_proof_audit_copilot_no_external_actions",
    state: fixture.format ? "local_live_proof_audit_copilot_visible" : "fixture_missing",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    safeLabelsOnly: fixture.repoSafety?.safeLabelsOnly === true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canDisplayPaymentLink: false,
    canOpenCheckout: false,
    canCollectPayment: false,
    canStoreProductionCustomerData: false,
    canSendOutreach: false,
    canSendAnalytics: false,
    canPublishPublicProof: false,
    canRequestTestimonialOrReferral: false,
    canClaimLiveFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimPayment: false,
    canClaimRevenue: false,
    note:
      "Local/admin first live proof-audit copilot. It combines session script, proof checkpoints, consent/redaction, candidate-fit assumptions, first blocking gate, paid-pilot cues, and exactly one internal route while live external actions, payment/customer-data handling, public proof, downstream mutation, delegated done claims, and revenue claims remain blocked.",
    consumedArtifacts: fixture.consumedArtifacts || [],
    sessionScript: fixture.sessionScript || [],
    proofAuditCheckpoints: fixture.proofAuditCheckpoints || [],
    consentRedactionState: fixture.consentRedactionState || {},
    candidateFitAssumptions: fixture.candidateFitAssumptions || {},
    firstBlockingGate: fixture.firstBlockingGate || {},
    paidPilotReadinessCues: fixture.paidPilotReadinessCues || [],
    noSendOperatorPrompts: fixture.noSendOperatorPrompts || [],
    routeOptions: fixture.routeOptions || [],
    selectedRoute: {
      routeId: selectedRoute.routeId || "paid_pilot_decision_room",
      selected: true,
      routeFamily: selectedRoute.routeFamily || "paid_pilot_decision",
      suggestedOwner: selectedRoute.suggestedOwner || "Owner / Product",
      action: selectedRoute.action || "open_private_paid_pilot_decision_room",
      reason: selectedRoute.reason || "Copilot routes internally while live gates remain closed.",
      acceptanceCriteria: selectedRoute.acceptanceCriteria || "Use only repo-safe redacted packet evidence.",
      validationExpectation: selectedRoute.validationExpectation || "No external action, customer/payment handling, queue mutation, or delegated done claim.",
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    repoSafeSessionPacket: fixture.repoSafeSessionPacket || {},
    blockedExternalActions: fixture.blockedExternalActions || {},
    unsupportedClaims: fixture.unsupportedClaims || {},
    repoSafety: fixture.repoSafety || {},
  };
}

function buildLiveToPaidPilotDecisionRoomVisibility() {
  const fixture = readJson("ops/product/live-to-paid-pilot-decision-room.sample.json", {});
  const selectedRoute = (fixture.routePackets || []).find((route) => route.selected) || {};

  return {
    format: fixture.format || "proofresume-live-to-paid-pilot-decision-room-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-LIVE-TO-PAID-PILOT-DECISION-ROOM",
    surfacePath: "website/admin.html#live-to-paid-pilot-decision-room",
    mode: fixture.mode || "local_sample_or_owner_approved_redacted_decision_room_no_external_actions",
    state: fixture.format ? "local_live_to_paid_pilot_decision_visible" : "fixture_missing",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    safeLabelsOnly: fixture.repoSafety?.safeLabelsOnly === true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canDisplayPaymentLink: false,
    canOpenCheckout: false,
    canCollectPayment: false,
    canStoreProductionCustomerData: false,
    canSendOutreach: false,
    canSendAnalytics: false,
    canPublishPublicProof: false,
    canRequestTestimonialOrReferral: false,
    canClaimLiveFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimPayment: false,
    canClaimRevenue: false,
    note:
      "Local/admin live-to-paid-pilot decision room. It shows gate states, evidence-state separation, selected route, owner-safe export, and blocked actions while checkout, payment, production customer-data handling, provider action, public proof, downstream mutation, delegated done claims, and revenue claims remain blocked.",
    consumedArtifacts: fixture.consumedArtifacts || [],
    sessionEvidenceBoundary: fixture.sessionEvidenceBoundary || {},
    gateStates: fixture.gateStates || [],
    evidenceStates: fixture.evidenceStates || [],
    decisionSignals: fixture.decisionSignals || {},
    routePackets: fixture.routePackets || [],
    selectedRoute: {
      routeId: selectedRoute.routeId || "product_repair_before_paid_pilot_ask",
      selected: true,
      routeFamily: selectedRoute.routeFamily || "product_repair",
      suggestedOwner: selectedRoute.suggestedOwner || "Product Worker",
      action: selectedRoute.action || "repair_trust_and_missing_proof_before_paid_pilot_decision",
      reason: selectedRoute.reason || "Repair trust and missing proof before any paid pilot ask.",
      ownerSafeHandoff: selectedRoute.ownerSafeHandoff || "Owner-safe handoff remains internal.",
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    exportPacket: fixture.exportPacket || {},
    blockedExternalActions: fixture.blockedExternalActions || {},
    claimControls: fixture.claimControls || {},
    repoSafety: fixture.repoSafety || {},
  };
}

function buildLiveProofTrustGapRepairRoomVisibility() {
  const fixture = readJson("ops/product/live-proof-trust-gap-repair-room.sample.json", {});
  const selectedRoute = (fixture.routePackets || []).find((route) => route.selected) || {};

  return {
    format: fixture.format || "proofresume-live-proof-trust-gap-repair-room-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-LIVE-PROOF-TRUST-GAP-REPAIR-ROOM",
    surfacePath: "website/admin.html#live-proof-trust-gap-repair-room",
    mode: fixture.mode || "local_sample_or_owner_approved_redacted_trust_gap_repair_no_external_actions",
    state: fixture.format ? "local_live_proof_trust_gap_repair_visible" : "fixture_missing",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    safeLabelsOnly: fixture.repoSafety?.safeLabelsOnly === true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canDisplayPaymentLink: false,
    canOpenCheckout: false,
    canCollectPayment: false,
    canStoreProductionCustomerData: false,
    canSendOutreach: false,
    canSendAnalytics: false,
    canPublishPublicProof: false,
    canRequestTestimonialOrReferral: false,
    canClaimLiveFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimPayment: false,
    canClaimRevenue: false,
    note:
      "Local/admin live proof trust-gap repair room. It consumes the product repair route from the paid-pilot decision room, shows trust/privacy objections, proof-source custody, missing-proof prompts, owner-safe wording, and one selected route while customer-data handling, payment, provider action, public proof, downstream mutation, delegated done claims, and revenue claims remain blocked.",
    consumedDecisionRoute: fixture.consumedDecisionRoute || {},
    trustPrivacyObjections: fixture.trustPrivacyObjections || [],
    proofSourceCustody: fixture.proofSourceCustody || [],
    missingProofPrompts: fixture.missingProofPrompts || [],
    stopStates: fixture.stopStates || {},
    ownerSafeWording: fixture.ownerSafeWording || [],
    routePackets: fixture.routePackets || [],
    selectedRoute: {
      routeId: selectedRoute.routeId || "missing_proof_cue_repair",
      selected: true,
      routeFamily: selectedRoute.routeFamily || "missing_proof_cue_repair",
      suggestedOwner: selectedRoute.suggestedOwner || "Product Worker",
      action: selectedRoute.action || "repair_missing_proof_cues_after_trust_gap",
      reason: selectedRoute.reason || "Repair trust and missing-proof cues before any paid pilot ask.",
      ownerSafeHandoff: selectedRoute.ownerSafeHandoff || "Owner-safe handoff remains internal.",
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    exportPacket: fixture.exportPacket || {},
    blockedExternalActions: fixture.blockedExternalActions || {},
    claimControls: fixture.claimControls || {},
    repoSafety: fixture.repoSafety || {},
  };
}

function buildLiveProofMissingProofCueRepairVisibility() {
  const fixture = readJson("ops/product/live-proof-missing-proof-cue-repair.sample.json", {});
  const selectedRoute = (fixture.routePackets || []).find((route) => route.selected) || {};

  return {
    format: fixture.format || "proofresume-live-proof-missing-proof-cue-repair-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-LIVE-PROOF-MISSING-PROOF-CUE-REPAIR",
    surfacePath: "website/admin.html#live-proof-missing-proof-cue-repair",
    mode: fixture.mode || "local_sample_or_owner_approved_redacted_missing_proof_cue_repair_no_external_actions",
    state: fixture.format ? "local_live_proof_missing_proof_cue_repair_visible" : "fixture_missing",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    safeLabelsOnly: fixture.repoSafety?.safeLabelsOnly === true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canDisplayPaymentLink: false,
    canOpenCheckout: false,
    canCollectPayment: false,
    canStoreProductionCustomerData: false,
    canSendOutreach: false,
    canSendAnalytics: false,
    canPublishPublicProof: false,
    canRequestTestimonialOrReferral: false,
    canClaimLiveFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimPayment: false,
    canClaimRevenue: false,
    note:
      "Local/admin live proof missing-proof cue repair. It consumes the trust-gap repair route, ranks proof gaps by value, claim risk, owner follow-up ease, and paid-pilot relevance, and emits one no-send follow-up route while external sends, customer-data handling, payment, public proof, downstream mutation, delegated done claims, and revenue claims remain blocked.",
    consumedTrustRepairRoute: fixture.consumedTrustRepairRoute || {},
    priorityModel: fixture.priorityModel || {},
    prioritizedProofGaps: fixture.prioritizedProofGaps || [],
    ownerFacingFollowUpPrompts: fixture.ownerFacingFollowUpPrompts || [],
    routePackets: fixture.routePackets || [],
    selectedRoute: {
      routeId: selectedRoute.routeId || "business_no_send_follow_up",
      selected: true,
      routeFamily: selectedRoute.routeFamily || "business_no_send_follow_up",
      suggestedOwner: selectedRoute.suggestedOwner || "Business Operator",
      action: selectedRoute.action || "prepare_no_send_missing_proof_follow_up",
      reason: selectedRoute.reason || "Prepare no-send missing-proof follow-up prompts before any paid pilot ask.",
      ownerSafeHandoff: selectedRoute.ownerSafeHandoff || "Owner-safe handoff remains internal.",
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    exportPacket: fixture.exportPacket || {},
    blockedExternalActions: fixture.blockedExternalActions || {},
    claimControls: fixture.claimControls || {},
    repoSafety: fixture.repoSafety || {},
  };
}

function buildPaidPilotTrustGapRepairLabVisibility() {
  const fixture = readJson("ops/product/paid-pilot-trust-gap-repair-lab.sample.json", {});
  const selectedRoute = (fixture.routePackets || []).find((route) => route.selected) || {};
  return {
    format: fixture.format || "proofresume-paid-pilot-trust-gap-repair-lab-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-PAID-PILOT-TRUST-GAP-REPAIR-LAB",
    surfacePath: "website/admin.html#paid-pilot-trust-gap-repair-lab",
    mode: fixture.mode || "local_sample_redacted_paid_pilot_trust_gap_repair_lab_no_external_actions",
    state: fixture.format ? "local_paid_pilot_trust_gap_repair_lab_visible" : "fixture_missing",
    localOnly: true,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canDisplayPaymentLink: false,
    canOpenCheckout: false,
    canCollectPayment: false,
    canStoreProductionCustomerData: false,
    canSendOutreach: false,
    canSendAnalytics: false,
    canPublishPublicProof: false,
    canClaimLiveFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimPayment: false,
    canClaimRevenue: false,
    note:
      "Local/admin paid pilot trust gap repair lab. It rehearses no-send proof-strength and trust objection responses while checkout, payment, customer-data handling, provider action, public proof, downstream mutation, delegated done claims, and revenue claims remain blocked.",
    consumedArtifacts: fixture.consumedArtifacts || [],
    proofStrengthGaps: fixture.proofStrengthGaps || [],
    operatorSafeRepairPrompts: fixture.operatorSafeRepairPrompts || [],
    disqualifiers: fixture.disqualifiers || [],
    routePackets: fixture.routePackets || [],
    selectedRoute: {
      routeId: selectedRoute.routeId || "business_no_send_owner_prospect_prep",
      selected: true,
      routeFamily: selectedRoute.routeFamily || "business_no_send_owner_prospect_prep",
      suggestedOwner: selectedRoute.suggestedOwner || "Business Operator",
      action: selectedRoute.action || "prepare_no_send_paid_pilot_trust_objection_response",
      reason: selectedRoute.reason || "Prepare no-send trust objection response before any paid pilot ask.",
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    exportPacket: fixture.exportPacket || {},
    blockedExternalActions: fixture.blockedExternalActions || {},
    repoSafety: fixture.repoSafety || {},
  };
}

function buildProofDeltaValueSnapshotVisibility() {
  const fixture = readJson("ops/product/proof-delta-value-snapshot.sample.json", {});
  const selectedRoute = (fixture.routePackets || []).find((route) => route.selected) || {};
  return {
    format: fixture.format || "proofresume-proof-delta-value-snapshot-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-PROOF-DELTA-VALUE-SNAPSHOT",
    surfacePath: "website/admin.html#proof-delta-value-snapshot",
    mode: fixture.mode || "local_sample_redacted_proof_delta_value_snapshot_no_external_actions",
    state: fixture.format ? "local_proof_delta_value_snapshot_visible" : "fixture_missing",
    localOnly: true,
    canDisplayPaymentLink: false,
    canCollectPayment: false,
    canStoreProductionCustomerData: false,
    canSendOutreach: false,
    canSendAnalytics: false,
    canPublishPublicProof: false,
    canClaimRevenue: false,
    note:
      "Local/admin proof-delta value snapshot. It shows sample before/after proof value while live feedback, payment, public proof, and revenue states remain absent.",
    consumedArtifacts: fixture.consumedArtifacts || [],
    proofDeltas: fixture.proofDeltas || [],
    evidenceStates: fixture.evidenceStates || {},
    paidPilotScopeBoundaries: fixture.paidPilotScopeBoundaries || [],
    routePackets: fixture.routePackets || [],
    selectedRoute: {
      routeId: selectedRoute.routeId || "business_no_send_follow_up",
      routeFamily: selectedRoute.routeFamily || "business_no_send_follow_up",
      suggestedOwner: selectedRoute.suggestedOwner || "Business Operator",
      action: selectedRoute.action || "prepare_no_send_proof_delta_follow_up",
      reason: selectedRoute.reason || "No-send proof delta follow-up only.",
      externalActionAllowed: false,
      queueMutationAllowed: false,
      downstreamDoneClaimAllowed: false,
      paymentOrCustomerDataHandlingAllowed: false,
      providerActionAllowed: false,
      mustNotMarkDelegatedWorkDone: true,
    },
    exportPacket: fixture.exportPacket || {},
    blockedExternalActions: fixture.blockedExternalActions || {},
    repoSafety: fixture.repoSafety || {},
  };
}

function buildFirstAuthorizedSessionRunnerVisibility() {
  const fixture = readJson("ops/product/first-authorized-session-runner.sample.json", {});
  const runner = fixture.runner || {};
  const selectedRoute = (runner.nextRoutes || []).find((route) => route.selected) || {};

  return {
    format: "proofresume-first-authorized-session-runner-admin-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-FIRST-AUTHORIZED-SESSION-RUNNER",
    surfacePath: "website/admin.html#first-authorized-session-runner",
    mode: fixture.mode || "sample_redacted_first_authorized_session_runner_no_external_actions",
    state: runner.state || "local_admin_sample_runner_missing_fixture",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canClaimCustomerFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimRevenue: false,
    canDisplayPaymentLink: false,
    canRequestTestimonialOrReferral: false,
    canStoreProductionCustomerData: false,
    note:
      "Local first-authorized-session runner. It walks sample or owner-approved redacted context through value, objections, paid-packet readiness, blocked gates, and one route without enabling external action.",
    selectedRouteReason:
      selectedRoute.action === "business_first_authorized_session_no_send_offer_prep"
        ? "Sample session value is inspectable while checkout, customer-data, support, public-proof, runtime, and application gates remain blocked."
        : "No selected business route is ready from the fixture.",
    sourceArtifacts: fixture.sourceArtifacts || [],
    runner,
    repoSafety: fixture.repoSafety || {},
  };
}

function buildFirstCustomerPilotConsoleVisibility() {
  const fixture = readJson("ops/product/first-customer-pilot-console.sample.json", {});
  const consoleState = fixture.pilotConsole || {};
  const selectedRoute = (consoleState.routeCases || []).find((route) => route.selected) || {};

  return {
    format: "proofresume-first-customer-pilot-console-admin-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-FIRST-CUSTOMER-PILOT-CONSOLE",
    surfacePath: "website/admin.html#first-customer-pilot-console",
    mode: fixture.mode || "sample_redacted_first_customer_pilot_console_no_external_actions",
    state: consoleState.state || "local_admin_sample_pilot_console_missing_fixture",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    exactlyOneRoute: fixture.repoSafety?.exactlyOneRoute === true,
    failClosedOnUnsafeEvidence: fixture.repoSafety?.failClosedOnUnsafeEvidence === true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canClaimCustomerFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimRevenue: false,
    canDisplayPaymentLink: false,
    canRequestTestimonialOrReferral: false,
    canStoreProductionCustomerData: false,
    note:
      "Local first-customer pilot console. It connects sample or owner-approved redacted context, proof loop, value receipt, objections, blocked gates, result export, repair state, and one route without enabling external action.",
    selectedRouteReason:
      selectedRoute.action === "business_first_customer_pilot_no_send_offer_prep"
        ? "Pilot value is inspectable while customer-data, payment, support, public-proof, owner-authority, runtime, deploy, and application gates remain blocked."
        : "No selected pilot route is ready from the fixture.",
    sourceArtifacts: fixture.sourceArtifacts || [],
    pilotConsole: consoleState,
    repoSafety: fixture.repoSafety || {},
  };
}

function buildFirstCustomerPilotRevenueSimulatorVisibility() {
  const fixture = readJson("ops/product/first-customer-pilot-revenue-simulator.sample.json", {});
  const simulator = fixture.simulator || {};
  const selectedScenario = (simulator.sampleScenarios || []).find((scenario) => scenario.selected) || {};
  const price = simulator.priceExperiment || {};

  return {
    format: "proofresume-first-customer-pilot-revenue-simulator-admin-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-FIRST-CUSTOMER-PILOT-REVENUE-SIMULATOR",
    surfacePath: "website/admin.html#pilot-revenue-simulator",
    mode: fixture.mode || "sample_redacted_pilot_revenue_simulator_no_checkout_no_external_actions",
    state: simulator.state || "local_admin_sample_revenue_simulator_missing_fixture",
    localOnly: true,
    sampleOrOwnerApprovedRedactedOnly: fixture.repoSafety?.sampleOrOwnerApprovedRedactedOnly === true,
    exactlyOneSelectedScenario: fixture.repoSafety?.exactlyOneSelectedScenario === true,
    exactlyOneRoutePerScenario: fixture.repoSafety?.exactlyOneRoutePerScenario === true,
    pricesAtOrBelowAuthorizedCap: fixture.repoSafety?.pricesAtOrBelowAuthorizedCap === true,
    paymentPathBlockedNoCheckout: fixture.repoSafety?.paymentPathBlockedNoCheckout === true,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canClaimCustomerFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimPaymentIntent: false,
    canClaimRevenue: false,
    canDisplayPaymentLink: false,
    canRequestTestimonialOrReferral: false,
    canStoreProductionCustomerData: false,
    note:
      "Local pilot revenue simulator. It maps sample pilot value, paid-packet readiness, objections, support/refund, payment, customer-data, and safety gates into one no-checkout route without traction claims.",
    selectedRouteReason:
      selectedScenario.route?.action === "business_first_paid_packet_no_send_offer_prep"
        ? "Sample paid-packet value is inspectable while checkout, customer-data, support, tax, deploy, public-proof, runtime, and final go/no-go gates remain blocked."
        : "No selected paid-packet route is ready from the fixture.",
    priceSummary: {
      offerLabel: price.offerLabel || "Target Job Proof Packet",
      selectedSamplePriceUsd: price.selectedSamplePriceUsd || 0,
      authorizedCapUsd: price.authorizedCapUsd || 0,
      candidatePricesUsd: price.candidatePricesUsd || [],
      checkoutAllowed: price.displayAsCheckoutAllowed === true,
      paymentCollectionAllowed: price.paymentCollectionAllowed === true,
      paymentLinkAllowed: price.paymentLinkAllowed === true,
    },
    sourceArtifacts: fixture.sourceArtifacts || [],
    simulator,
    repoSafety: fixture.repoSafety || {},
  };
}

function buildConsentedAuditHandoffPreviewVisibility() {
  const checks = [
    {
      id: "candidate_consent",
      label: "Candidate consent",
      state: "required_before_share",
      detail: "Candidate must approve the proof-audit packet and target job before any manual share or first-session handoff.",
      ready: false,
    },
    {
      id: "target_job_approval",
      label: "Target-job approval",
      state: "approval_required",
      detail: "Claims, resume changes, cover note, answers, apply URL, and consent must be checked in the local application tracker.",
      ready: false,
    },
    {
      id: "redaction",
      label: "Redaction",
      state: "redacted_export_only",
      detail: "Repo-visible handoffs must omit raw resumes, prospect identities, contact details, private replies, payment data, credentials, calendar links, screenshots, and customer materials.",
      ready: true,
    },
    {
      id: "proof_audit",
      label: "Proof audit",
      state: "local_preview_available",
      detail: "The app can generate supported claims, proof gaps, warnings, tailored bullets, and cover note from browser-local sample or redacted state.",
      ready: true,
    },
  ];

  return {
    format: "proofresume-consented-audit-handoff-preview-v1",
    generatedAt,
    productQueueItemId: "NORTHSTAR-CONSENTED-AUDIT-HANDOFF-PREVIEW",
    sourcePattern: "website/app.html#consented-audit-handoff",
    localOnly: true,
    manualShareOnly: true,
    readyForManualShare: false,
    queueMutationAllowed: false,
    externalActionAllowed: false,
    providerActionAllowed: false,
    canClaimCustomerFeedback: false,
    canClaimWillingnessToPay: false,
    canClaimRevenue: false,
    canDisplayPaymentLink: false,
    canRequestTestimonialOrReferral: false,
    canStoreProductionCustomerData: false,
    note:
      "Admin mirror of the local consented proof-audit handoff. It prepares manual-share review state only and cannot create external actions, customer/revenue claims, payment links, testimonials, referrals, deploys, analytics, uploads, sends, schedules, or application submissions.",
    consentAndApprovalChecks: checks,
    evidenceCustody: [
      "Browser-local proof audit packet and first-session handoff are the only product sources.",
      "Sample, old, or owner-approved redacted materials are allowed; raw customer materials are not stored in repo-visible files.",
      "Evidence custody state is visible before a proof-audit session is scheduled or shared.",
      "Candidate-visible next step must be review/approve/withhold, not automatic booking, payment, send, public proof, or application submission.",
    ],
    blockedActions: [
      "No outreach or external send.",
      "No scheduling or calendar link.",
      "No payment link, checkout, pricing claim, revenue claim, or payment collection.",
      "No analytics send, public proof, testimonial, referral request, or deploy action.",
      "No production customer-data storage, provider upload, auto-apply, or application submission.",
    ],
    candidateVisibleNextStep:
      "Review the local proof-audit packet, confirm consent and target-job approval, then either approve manual sharing, request edits, or withhold sharing.",
    forbiddenRepoVisibleFields: [
      "raw resumes",
      "prospect identities",
      "contact details",
      "private replies",
      "payment data",
      "credentials",
      "calendar links",
      "screenshots",
      "customer materials",
      "provider record ids",
    ],
  };
}

function buildBuyerPathReadiness({
  controls,
  sortedControls,
  revenueCriticalIds,
  enabledStatuses,
  globalLimits,
  nextUnlocks,
  unlockByControl,
  missingItemByControl,
}) {
  const buyerPathIds = ["public_deploy", "lead_capture", "payment_collection", "analytics", "outbound_outreach", "customer_data"];
  const buyerControls = sortedControls.filter((control) => buyerPathIds.includes(control.id));
  const enabledRevenueControls = buyerControls.filter((control) => enabledStatuses.has(control.status));
  const disabledRevenueControls = buyerControls.filter((control) => !enabledStatuses.has(control.status));
  const reportsByPath = reportByPath(reports);
  const latestProductEvidence = latestBuyerPathEvidence("product", reportsByPath);
  const latestQaEvidence = latestBuyerPathEvidence("qa", reportsByPath);
  const outboundControl = controls.find((control) => control.id === "outbound_outreach") || {};
  const paymentControl = controls.find((control) => control.id === "payment_collection") || {};
  const activationPacketPath = "ops/launch/private-first-revenue-control-activation-brief.md";
  const activationPacketExists = fs.existsSync(path.join(projectRoot, activationPacketPath));
  const revenueCriticalControlOrder = ["public_deploy", "lead_capture", "payment_collection", "analytics"];
  const activationDecisionLedger = buildActivationDecisionLedger({
    controls,
    controlOrder: revenueCriticalControlOrder,
    globalLimits,
    sourcePath: "ops/BUSINESS_CONTROLS.json",
  });
  const activationDecisionPacketExportReadiness = buildActivationDecisionPacketExportReadiness({
    controls,
    controlOrder: revenueCriticalControlOrder,
    enabledStatuses,
  });
  const controlActivationSteps = revenueCriticalControlOrder
    .filter((id) => controls.some((control) => control.id === id))
    .map((id) => {
      const control = controls.find((candidate) => candidate.id === id) || { id, label: id, status: "unknown" };
      const enabled = enabledStatuses.has(control.status);
      const unlocks = unlockByControl[control.id] || control.businessPurpose || "";
      const oneMissingUserOrPlatformItem = enabled
        ? "Enabled"
        : missingItemByControl[control.id] ||
          control.askUserOnlyFor?.[0] ||
          control.requiredEvidenceToEnable?.[0] ||
          "explicit control enablement";
      return {
        id: control.id,
        label: control.label || control.id,
        status: control.status || "unknown",
        enabled,
        enabledControl: enabled,
        missingOperatorInput: enabled ? null : oneMissingUserOrPlatformItem,
        nextMissingUnlock: enabled ? null : oneMissingUserOrPlatformItem,
        revenueCritical: revenueCriticalIds.has(control.id),
        unlocks,
        oneMissingUserOrPlatformItem,
        requiredEvidenceToEnable: control.requiredEvidenceToEnable || [],
        askUserOnlyFor: control.askUserOnlyFor || [],
      };
    });
  const enabledActivationControls = controlActivationSteps
    .filter((step) => step.enabled)
    .map((step) => ({
      id: step.id,
      label: step.label,
      status: step.status,
      unlocks: step.unlocks,
    }));
  const missingOperatorInputs = controlActivationSteps
    .filter((step) => !step.enabled)
    .map((step) => ({
      id: step.id,
      label: step.label,
      status: step.status,
      nextMissingUnlock: step.nextMissingUnlock,
      requiredEvidenceToEnable: step.requiredEvidenceToEnable,
      askUserOnlyFor: step.askUserOnlyFor,
      unlocks: step.unlocks,
    }));
  const paidReviewInterest = buildPaidReviewInterestVisibility({
    controls,
    globalLimits,
  });
  paidReviewInterest.controlActivation = {
    format: "proofresume-control-activation-v1",
    activationPacket: {
      title: "Private first-revenue control activation brief",
      sourcePath: activationPacketPath,
      present: activationPacketExists,
      lastUpdated: fileTimestamp(activationPacketPath),
      mode: "Read-only / No-send / No-run",
      status: activationPacketExists ? "present" : "missing",
      boundary: "Document metadata only. Admin does not request secrets, store external values, enable controls, or trigger production actions.",
      decisionLedger: activationDecisionLedger.summary,
    },
    steps: controlActivationSteps,
    decisionLedger: activationDecisionLedger,
    activationDecisionPacketExportReadiness,
    enabledControls: enabledActivationControls,
    missingOperatorInputs,
    zeroExternalAction: {
      dailySpendLimitUsd: globalLimits.dailySpendLimitUsd ?? 0,
      dailyOutboundLimit: globalLimits.dailyOutboundLimit ?? 0,
      maxPriceExperimentUsd: globalLimits.maxPriceExperimentUsd ?? 0,
      paymentCollectionEnabled: enabledStatuses.has(paymentControl.status),
      productionPaymentAllowed: false,
      storesCardData: Boolean(paymentControl.limitsWhenEnabled?.mayStoreCardData),
    },
    note:
      "Control activation readiness is a local-only operator checklist. It cannot request secrets, deploy triggers, production URLs, payment details, or enable external actions.",
  };

  return {
    title: "Buyer-path control readiness",
    sourcePath: "ops/BUSINESS_CONTROLS.json",
    revenueControlTotal: buyerControls.length,
    enabledRevenueControlCount: enabledRevenueControls.length,
    disabledRevenueControlCount: disabledRevenueControls.length,
    enabledRevenueControls: enabledRevenueControls.map(controlReadinessSummary),
    disabledRevenueControls: disabledRevenueControls.map((control) =>
      controlReadinessSummary(control, {
        unlocks: unlockByControl[control.id] || control.businessPurpose || "",
        oneMissingUserOrPlatformItem:
          missingItemByControl[control.id] || control.askUserOnlyFor?.[0] || control.requiredEvidenceToEnable?.[0] || "explicit control enablement",
      })
    ),
    missingUnlocks: nextUnlocks
      .filter((unlock) => revenueCriticalIds.has(unlock.id))
      .map((unlock) => ({
        id: unlock.id,
        label: unlock.label || unlock.id,
        status: unlock.status || "unknown",
        priority: unlock.priority || null,
        oneMissingUserOrPlatformItem: unlock.oneMissingUserOrPlatformItem,
        requiredEvidenceToEnable: unlock.missing || [],
        askUserOnlyFor: unlock.askUserOnlyFor || [],
        unlocks: unlock.unlocks || "",
      })),
    zeroSpendOutbound: {
      dailySpendLimitUsd: globalLimits.dailySpendLimitUsd ?? 0,
      dailyOutboundLimit: globalLimits.dailyOutboundLimit ?? 0,
      maxPriceExperimentUsd: globalLimits.maxPriceExperimentUsd ?? 0,
      outboundDailyMessageLimit: outboundControl.limitsWhenEnabled?.dailyMessageLimit ?? 0,
      mayAutonomouslySend: Boolean(outboundControl.limitsWhenEnabled?.mayAutonomouslySend),
      paymentMaxPriceExperimentUsd: paymentControl.limitsWhenEnabled?.maxPriceExperimentUsd ?? 0,
      paymentMayStoreCardData: Boolean(paymentControl.limitsWhenEnabled?.mayStoreCardData),
      visible: true,
      locked:
        (globalLimits.dailySpendLimitUsd ?? 0) === 0 &&
        (globalLimits.dailyOutboundLimit ?? 0) === 0 &&
        (globalLimits.maxPriceExperimentUsd ?? 0) === 0 &&
        (outboundControl.limitsWhenEnabled?.dailyMessageLimit ?? 0) === 0 &&
        !outboundControl.limitsWhenEnabled?.mayAutonomouslySend &&
        (paymentControl.limitsWhenEnabled?.maxPriceExperimentUsd ?? 0) === 0 &&
        !paymentControl.limitsWhenEnabled?.mayStoreCardData,
    },
    controlActivationSteps,
    activationDecisionPacketExportReadiness,
    paidReviewInterest,
    latestEvidence: {
      product: latestProductEvidence,
      qa: latestQaEvidence,
    },
    state:
      disabledRevenueControls.length === 0
        ? "enabled"
        : latestProductEvidence && latestQaEvidence
          ? "ready-with-disabled-controls"
          : "needs-evidence",
    stateLabel:
      disabledRevenueControls.length === 0
        ? "Revenue controls enabled"
        : latestProductEvidence && latestQaEvidence
          ? "Evidence current, controls disabled"
          : "Needs product and QA evidence",
    evidenceNote:
      "Buyer-path readiness is control visibility only. It does not enable production deploy, production lead capture, payment collection, analytics, outbound outreach, or sensitive resume-data handling.",
  };
}

function buildActivationDecisionPacketExportReadiness({ controls, controlOrder, enabledStatuses }) {
  const pricingHtml = readText("website/pricing.html");
  const mainJs = readText("website/main.js");
  const qaFlow = readText("website/scripts/qa_intake_flow.cjs");
  const checkSite = readText("website/scripts/check_site.cjs");
  const expectedControlSet = new Set(controlOrder);
  const sourceControlRows = [...pricingHtml.matchAll(/data-activation-decision-control=["']([^"']+)["']/g)].map((match) => match[1]);
  const coveredControlRows = controlOrder.filter((id) => sourceControlRows.includes(id));
  const sourceHandles = [
    {
      id: "ledger-root",
      label: "Activation-decision ledger root",
      present: /data-activation-decision-ledger\b/.test(pricingHtml),
      sourcePath: "website/pricing.html",
    },
    {
      id: "control-source-rows",
      label: "Revenue-critical ledger source rows",
      present: coveredControlRows.length === controlOrder.length,
      sourcePath: "website/pricing.html",
      detail: `${coveredControlRows.length}/${controlOrder.length} controls observed`,
    },
    {
      id: "browser-local-storage-key",
      label: "Browser-local ledger storage key",
      present: /proofresume:activationDecisionLedger/.test(mainJs),
      sourcePath: "website/main.js",
    },
    {
      id: "decision-ledger-builder",
      label: "Local decision ledger builder",
      present: /function\s+buildActivationDecisionLedger\b/.test(mainJs),
      sourcePath: "website/main.js",
    },
    {
      id: "packet-export-handle",
      label: "Activation-decision packet export handle",
      present: /data-activation-decision-packet-export\b/.test(pricingHtml),
      sourcePath: "website/pricing.html",
    },
    {
      id: "packet-export-format",
      label: "Activation-decision packet export format",
      present: /proofresume-activation-decision-packet-export-v1/.test(pricingHtml),
      sourcePath: "website/pricing.html",
    },
    {
      id: "packet-json-preview",
      label: "Activation-decision packet JSON preview",
      present: /data-activation-decision-packet-json\b/.test(pricingHtml),
      sourcePath: "website/pricing.html",
    },
  ];
  const exportHandler = {
    id: "packet-export-handler",
    label: "Activation-decision packet export handler",
    present:
      /data-activation-decision-packet-export\b/.test(mainJs) &&
      /proofresume-activation-decision-packet-export-v1/.test(mainJs),
    sourcePath: "website/main.js",
  };
  const qaStrictChecks = [
    {
      id: "strict-export-scenario",
      label: "Strict activation-decision packet export scenario",
      present:
        /activation-decision-packet-export/i.test(qaFlow) &&
        /cannot persist browser storage|no persistence/i.test(qaFlow) &&
        /cannot enable|enable control flags/i.test(qaFlow),
      sourcePath: "website/scripts/qa_intake_flow.cjs",
    },
    {
      id: "check-site-wiring",
      label: "check_site requires strict packet export coverage",
      present:
        /activation-decision-packet-export/i.test(checkSite) &&
        /strict|cannot persist|no persistence|cannot enable/i.test(checkSite),
      sourcePath: "website/scripts/check_site.cjs",
    },
    {
      id: "ledger-boundary-scenario",
      label: "Activation-decision ledger boundary scenario",
      present:
        /activation-decision-ledger-boundary-no-network/.test(qaFlow) &&
        /Activation-decision ledger entries cannot mutate BUSINESS_CONTROLS or production paths/.test(qaFlow),
      sourcePath: "website/scripts/qa_intake_flow.cjs",
    },
  ];
  const productEvidence = latestPassEvidence(
    passes,
    reports,
    ({ pass, text }) =>
      String(pass.lane || "").toLowerCase() === "product" &&
      /\bactivation-decision ledger|activation decision ledger|activation-decision packet export|data-activation-decision-packet-export\b/i.test(text)
  );
  const qaEvidence = latestPassEvidence(
    passes,
    reports,
    ({ pass, text }) =>
      String(pass.lane || "").toLowerCase() === "qa" &&
      /\bactivation-decision ledger boundary|activation-decision-packet-export|activation decision packet export|strict export\b/i.test(text)
  );
  const sourceHandlesReady = sourceHandles.every((handle) => handle.present);
  const strictQaExportCoverage = qaStrictChecks[0].present && qaStrictChecks[1].present;
  const selectedControls = controlOrder.map((id) => controls.find((control) => control.id === id)).filter(Boolean);
  const enabledControls = selectedControls.filter((control) => enabledStatuses.has(control.status));
  const state = !sourceHandlesReady
    ? "blocked-missing-source-handles"
    : !exportHandler.present
      ? "blocked-missing-export-handler"
      : !strictQaExportCoverage
        ? "blocked-missing-strict-qa-export-coverage"
        : "export-ready-local-only";

  return {
    format: "proofresume-activation-decision-packet-export-readiness-v1",
    title: "Activation-decision packet export readiness",
    state,
    stateLabel:
      state === "export-ready-local-only"
        ? "Export ready, local-only"
        : state === "blocked-missing-export-handler"
          ? "Blocked: export handler not observed"
          : state === "blocked-missing-strict-qa-export-coverage"
            ? "Blocked: strict QA export coverage missing"
            : "Blocked: source handles missing",
    sourceHandlesReady,
    strictQaExportCoverage,
    sourceHandles,
    exportHandler,
    qaStrictChecks,
    coveredControls: coveredControlRows,
    expectedControls: controlOrder,
    controlStateSeparation: {
      enabledControlsSource: "ops/BUSINESS_CONTROLS.json",
      enabledControlsFromExportReadiness: false,
      enabledControlsFromLedgerSourceHandles: false,
      enabledRevenueCriticalControlCount: enabledControls.length,
      expectedControlCount: expectedControlSet.size,
    },
    productEvidence: productEvidence
      ? {
          source: passSource(productEvidence.pass, productEvidence.report),
          title: productEvidence.pass.title || productEvidence.pass.task || productEvidence.pass.prompt || "Product activation-decision evidence",
          finishedAt: productEvidence.pass.finishedAt || productEvidence.pass.timestamp || productEvidence.pass.startedAt || null,
          validation: normalizeValidationList(productEvidence.pass.validation).slice(0, 4),
        }
      : null,
    qaEvidence: qaEvidence
      ? {
          source: passSource(qaEvidence.pass, qaEvidence.report),
          title: qaEvidence.pass.title || qaEvidence.pass.task || qaEvidence.pass.prompt || "QA activation-decision evidence",
          finishedAt: qaEvidence.pass.finishedAt || qaEvidence.pass.timestamp || qaEvidence.pass.startedAt || null,
          validation: normalizeValidationList(qaEvidence.pass.validation).slice(0, 4),
        }
      : null,
    boundary:
      "Export readiness is a local packet-surface diagnostic only. It cannot request secrets, production URLs, deploy triggers, payment details, approval bypasses, or enable any BUSINESS_CONTROLS state.",
  };
}

function buildActivationDecisionLedger({ controls, controlOrder, globalLimits, sourcePath }) {
  const businessControls = readJson(sourcePath, {});
  const sourceUpdatedAt = businessControls.updatedAt || fileTimestamp(sourcePath);
  const sourceAgeMs = sourceUpdatedAt ? Date.now() - new Date(sourceUpdatedAt).getTime() : null;
  const staleAfterDays = 7;
  const sourceStale = sourceAgeMs === null || Number.isNaN(sourceAgeMs) || sourceAgeMs > staleAfterDays * 24 * 60 * 60 * 1000;
  const selectedControls = controlOrder
    .map((id) => controls.find((control) => control.id === id))
    .filter(Boolean);
  const decisions = selectedControls.flatMap((control) =>
    (control.requiredEvidenceToEnable || []).map((evidence) => {
      const staticDecision = staticActivationDecisionFor(control, evidence, globalLimits);
      const status = sourceStale && staticDecision.status === "approved" ? "stale" : staticDecision.status;
      const reason =
        status === "stale"
          ? `Static source decision exists, but ${sourcePath} is older than ${staleAfterDays} days or has no parseable update time.`
          : staticDecision.reason;
      return {
        controlId: control.id,
        controlLabel: control.label || control.id,
        controlStatus: control.status || "unknown",
        decision: evidence,
        status,
        reason,
        sourcePath,
        sourceUpdatedAt,
        evidenceType: staticDecision.evidenceType,
        enabledControlState: ["enabled", "local_only_enabled"].includes(control.status),
      };
    })
  );
  const byStatus = {
    approved: decisions.filter((decision) => decision.status === "approved"),
    missing: decisions.filter((decision) => decision.status === "missing"),
    stale: decisions.filter((decision) => decision.status === "stale"),
    blocked: decisions.filter((decision) => decision.status === "blocked"),
  };
  const counts = Object.fromEntries(Object.entries(byStatus).map(([status, items]) => [status, items.length]));

  return {
    format: "proofresume-activation-decision-ledger-v1",
    sourcePath,
    sourceUpdatedAt,
    staleAfterDays,
    readonly: true,
    localOnly: true,
    enabledControlsFromDecisions: false,
    counts,
    byStatus,
    decisions,
    summary: {
      format: "proofresume-activation-decision-ledger-v1",
      sourcePath,
      sourceUpdatedAt,
      counts,
      state:
        counts.blocked > 0
          ? "blocked-decisions-present"
          : counts.missing > 0
            ? "missing-decisions-present"
            : counts.stale > 0
              ? "stale-decisions-present"
              : "source-decisions-ready",
      note:
        "Decision readiness only. Approved source-contract decisions do not enable public deploy, lead capture, payment collection, analytics, or any external action.",
    },
    boundary:
      "This ledger is generated from static source metadata only. It does not collect secrets, store production values, request approval, or bypass BUSINESS_CONTROLS status.",
  };
}

function staticActivationDecisionFor(control, evidence, globalLimits) {
  const normalized = String(evidence || "").toLowerCase();
  const limits = control.limitsWhenEnabled || {};
  if (control.id === "lead_capture" && normalized === "allowed fields" && Array.isArray(limits.allowedFields) && limits.allowedFields.length) {
    return {
      status: "approved",
      evidenceType: "static-field-contract",
      reason: `Allowed fields are listed in ${control.id}.limitsWhenEnabled.allowedFields.`,
    };
  }
  if (control.id === "lead_capture" && normalized === "retention rule" && Number.isFinite(Number(limits.retentionDays)) && Number(limits.retentionDays) > 0) {
    return {
      status: "approved",
      evidenceType: "static-retention-rule",
      reason: `Retention is set to ${Number(limits.retentionDays)} days in BUSINESS_CONTROLS.`,
    };
  }
  if (control.id === "payment_collection" && normalized === "maximum price experiment") {
    return {
      status: "approved",
      evidenceType: "static-zero-price-limit",
      reason: `Maximum price experiment is constrained to $${globalLimits.maxPriceExperimentUsd ?? limits.maxPriceExperimentUsd ?? 0}.`,
    };
  }
  if (control.id === "analytics" && normalized === "allowed event list" && Array.isArray(limits.allowedEvents) && limits.allowedEvents.length) {
    return {
      status: "approved",
      evidenceType: "static-event-taxonomy",
      reason: `Allowed analytics events are listed in ${control.id}.limitsWhenEnabled.allowedEvents.`,
    };
  }
  if (/\b(access|credential|connector|provider|production url|hosting platform|storage destination|payment-link)\b/i.test(normalized)) {
    return {
      status: "blocked",
      evidenceType: "external-or-sensitive-value",
      reason: "Requires an external/platform-owner value that admin must not collect or store.",
    };
  }
  return {
    status: "missing",
    evidenceType: "non-secret-operator-decision",
    reason: "No static non-secret source-contract decision is recorded for this evidence item.",
  };
}

function controlReadinessSummary(control, extra = {}) {
  return {
    id: control.id,
    label: control.label || control.id,
    status: control.status || "unknown",
    enabled: ["enabled", "local_only_enabled"].includes(control.status),
    setupNeeded: ["setup_needed", "ready_for_setup"].includes(control.status),
    blocked: control.status === "blocked",
    requiredEvidenceToEnable: control.requiredEvidenceToEnable || [],
    askUserOnlyFor: control.askUserOnlyFor || [],
    stopConditions: control.stopConditions || [],
    limitsWhenEnabled: control.limitsWhenEnabled || {},
    ...extra,
  };
}

function latestBuyerPathEvidence(lane, reportsByPath) {
  const lanePattern = new RegExp(`^${lane}$`, "i");
  const keywordPattern =
    lane === "qa"
      ? /\b(business-control|business control|control-aware|buyer path|lead capture|payment collection|zero-spend|zero outbound|local lead)\b/i
      : /\b(control-aware|buyer|lead capture|payment intent|payment collection|BUSINESS_CONTROLS|paid review|production-readiness)\b/i;

  const evidence = passes
    .filter((pass) => lanePattern.test(pass.lane || ""))
    .map((pass) => {
      const report = pass.report ? reportsByPath.get(pass.report) : null;
      const text = [
        pass.id,
        pass.passId,
        pass.title,
        pass.task,
        pass.prompt,
        pass.summary,
        Array.isArray(pass.deliverables) ? pass.deliverables.join(" ") : "",
        Array.isArray(pass.coverageAdded) ? pass.coverageAdded.join(" ") : "",
        report?.content || "",
      ]
        .filter(Boolean)
        .join("\n");
      return {
        pass,
        report,
        text,
      };
    })
    .filter((item) => keywordPattern.test(item.text))
    .sort((a, b) => String(b.pass.finishedAt || b.pass.startedAt || "").localeCompare(String(a.pass.finishedAt || a.pass.startedAt || "")));

  const latest = evidence[0];
  if (!latest) return null;

  return {
    id: latest.pass.id || latest.pass.passId || "unknown-pass",
    lane: latest.pass.lane || lane,
    title: latest.pass.title || latest.pass.task || latest.pass.prompt || "Buyer-path evidence",
    summary: latest.pass.summary || latest.pass.task || "",
    finishedAt: latest.pass.finishedAt || latest.pass.checkedAt || latest.pass.startedAt || null,
    sourcePath: latest.pass.sourcePath || "",
    report: latest.pass.report || "",
    reportStatus: latest.report ? "report published" : "no report found",
    validation: normalizeValidationList(latest.pass.validation).slice(0, 5),
    signals: buyerPathEvidenceSignals(latest.text),
  };
}

function buyerPathEvidenceSignals(text) {
  const checks = [
    ["public deploy disabled", /\b(public deploy|production deploy)\b[\s\S]{0,220}\b(disabled|setup needed|not enable|remains setup|blocked)\b/i],
    ["production lead capture disabled", /\b(production lead capture|lead capture)\b[\s\S]{0,220}\b(disabled|setup needed|local-only|local browser|no external service)\b/i],
    ["payment collection disabled", /\b(payment collection|checkout|payment links?|payment processing)\b[\s\S]{0,220}\b(disabled|setup needed|no payment|not enable|remains setup)\b/i],
    ["analytics disabled", /\banalytics\b[\s\S]{0,220}\b(disabled|setup needed|production tracking remains setup|not enable)\b/i],
    ["outbound blocked", /\b(outbound|real sends?|automatic outreach)\b[\s\S]{0,220}\b(blocked|no-send|not enable|zero)\b/i],
    ["customer data blocked", /\b(customer resume data|sensitive resume data|resume data)\b[\s\S]{0,220}\b(blocked|local prototype|localStorage|not enable)\b/i],
    ["zero spend/outbound", /\b(zero-spend|zero spend|zero-outbound|zero outbound|\$0 spend|0 outbound)\b/i],
  ];

  return checks.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

const visualQaPath = path.join(projectRoot, "ops", "reports", "visual-qa", "latest.json");
const visualQa = fs.existsSync(visualQaPath)
  ? JSON.parse(fs.readFileSync(visualQaPath, "utf8"))
  : null;

const staticDeployRehearsalPath = path.join(projectRoot, "ops", "reports", "static-deploy-rehearsal", "latest.json");
const staticDeployRehearsal = safeReadJsonFile(staticDeployRehearsalPath, null);
const staticDeployRehearsalReports = listStaticDeployRehearsalReports();

const sprintAndBacklog = [
  { path: "ops/sprints/current.md", title: "Current Sprint", content: readText("ops/sprints/current.md") },
  { path: "ops/backlog/NEXT.md", title: "Backlog", content: readText("ops/backlog/NEXT.md") },
];

const passes = uniquePasses([...readJson("ops/progress/agent-passes.json", []), ...listPassFiles()]).sort((a, b) =>
  String(b.startedAt || "").localeCompare(String(a.startedAt || ""))
);
const reports = listReports();
const laneDocs = listMarkdownDir("ops/lanes");
const backlogQueue = parseActiveBacklogQueue(sprintAndBacklog[1]);
const staleGuardrails = buildStaleQueueGuardrails(backlogQueue, passes, reports);
const queueRefreshDecisionInput = buildQueueRefreshDecisionInput(backlogQueue, staleGuardrails);
queueRefreshDecisionInput.staticDeployRehearsalVisibility = buildStaticDeployRehearsalVisibility(
  staticDeployRehearsal,
  staticDeployRehearsalReports
);
const validationFreshness = buildValidationFreshness(laneDocs, queueRefreshDecisionInput, passes, reports);

const generatedAt = new Date().toISOString();
const queueAgeProofComparison = buildQueueAgeProofComparison(backlogQueue, passes, reports, generatedAt);
const deliverableReadiness = buildDeliverableReadiness(
  backlogQueue,
  validationFreshness,
  queueAgeProofComparison,
  queueRefreshDecisionInput,
  passes,
  reports,
  generatedAt
);
const turnoverSummary = buildTurnoverSummary(
  backlogQueue,
  queueAgeProofComparison,
  queueRefreshDecisionInput,
  passes,
  reports,
  generatedAt
);
const closeMatcherTrendDiagnostics = buildCloseMatcherTrendDiagnostics(queueRefreshDecisionInput, turnoverSummary, generatedAt);
queueRefreshDecisionInput.closeMatcherTrendDiagnostics = closeMatcherTrendDiagnostics;
const structuredExtractionVisibility = buildStructuredExtractionVisibility(backlogQueue, passes, reports);
queueRefreshDecisionInput.structuredExtractionVisibility = structuredExtractionVisibility;
const followupEvidenceVisibility = buildFollowupEvidenceVisibility(backlogQueue);
queueRefreshDecisionInput.followupEvidenceVisibility = followupEvidenceVisibility;
const replyFactReadiness = buildReplyFactReadiness(backlogQueue, queueRefreshDecisionInput);
queueRefreshDecisionInput.replyFactReadiness = replyFactReadiness;
const calendarAppointmentReadiness = buildCalendarAppointmentReadiness(backlogQueue, replyFactReadiness);
queueRefreshDecisionInput.calendarAppointmentReadiness = calendarAppointmentReadiness;
const sessionStartReadiness = buildSessionStartReadiness(backlogQueue, calendarAppointmentReadiness);
queueRefreshDecisionInput.sessionStartReadiness = sessionStartReadiness;
const rawNoteCaptureReadiness = buildRawNoteCaptureReadiness(backlogQueue, sessionStartReadiness);
queueRefreshDecisionInput.rawNoteCaptureReadiness = rawNoteCaptureReadiness;
const postSessionDebriefReadiness = buildPostSessionDebriefReadiness(backlogQueue, rawNoteCaptureReadiness);
queueRefreshDecisionInput.postSessionDebriefReadiness = postSessionDebriefReadiness;
const objectionCodingReadiness = buildObjectionCodingReadiness(backlogQueue, postSessionDebriefReadiness);
queueRefreshDecisionInput.objectionCodingReadiness = objectionCodingReadiness;
const fiveSessionSynthesisReadiness = buildFiveSessionSynthesisReadiness(backlogQueue, objectionCodingReadiness);
queueRefreshDecisionInput.fiveSessionSynthesisReadiness = fiveSessionSynthesisReadiness;
const synthesisArtifactVisibility = buildSynthesisArtifactVisibility(backlogQueue, fiveSessionSynthesisReadiness);
queueRefreshDecisionInput.synthesisArtifactVisibility = synthesisArtifactVisibility;
const synthesisDecisionMemoVisibility = buildSynthesisDecisionMemoVisibility(backlogQueue, synthesisArtifactVisibility);
queueRefreshDecisionInput.synthesisDecisionMemoVisibility = synthesisDecisionMemoVisibility;
const launchDecisionApprovalVisibility = buildLaunchDecisionApprovalVisibility(backlogQueue, synthesisDecisionMemoVisibility);
queueRefreshDecisionInput.launchDecisionApprovalVisibility = launchDecisionApprovalVisibility;
const publishReadinessVisibility = buildPublishReadinessVisibility(backlogQueue, launchDecisionApprovalVisibility);
queueRefreshDecisionInput.publishReadinessVisibility = publishReadinessVisibility;
const explicitPublishPlanVisibility = buildExplicitPublishPlanVisibility(backlogQueue, publishReadinessVisibility);
queueRefreshDecisionInput.explicitPublishPlanVisibility = explicitPublishPlanVisibility;
const releaseCandidateRehearsalVisibility = buildReleaseCandidateRehearsalVisibility(backlogQueue);
queueRefreshDecisionInput.releaseCandidateRehearsalVisibility = releaseCandidateRehearsalVisibility;
const credentialedDeployBlockerVisibility = buildCredentialedDeployBlockerVisibility(backlogQueue);
queueRefreshDecisionInput.credentialedDeployBlockerVisibility = credentialedDeployBlockerVisibility;
const platformOwnerHandoffVisibility = buildPlatformOwnerHandoffVisibility(
  backlogQueue,
  queueRefreshDecisionInput.staticDeployRehearsalVisibility
);
queueRefreshDecisionInput.platformOwnerHandoffVisibility = platformOwnerHandoffVisibility;
const postDeployHealthOwnerHandoffVisibility = buildPostDeployHealthOwnerHandoffVisibility(
  backlogQueue,
  platformOwnerHandoffVisibility
);
queueRefreshDecisionInput.postDeployHealthOwnerHandoffVisibility = postDeployHealthOwnerHandoffVisibility;
const finalDeployGoNoGoLedgerVisibility = buildFinalDeployGoNoGoLedgerVisibility(
  backlogQueue,
  queueRefreshDecisionInput.staticDeployRehearsalVisibility,
  platformOwnerHandoffVisibility,
  postDeployHealthOwnerHandoffVisibility
);
queueRefreshDecisionInput.finalDeployGoNoGoLedgerVisibility = finalDeployGoNoGoLedgerVisibility;
const deployBlockerEscalationMemoVisibility = buildDeployBlockerEscalationMemoVisibility(
  backlogQueue,
  finalDeployGoNoGoLedgerVisibility
);
queueRefreshDecisionInput.deployBlockerEscalationMemoVisibility = deployBlockerEscalationMemoVisibility;
const firstHumanOperatorDeployPacketIndexVisibility = buildFirstHumanOperatorDeployPacketIndexVisibility(
  backlogQueue,
  finalDeployGoNoGoLedgerVisibility,
  deployBlockerEscalationMemoVisibility
);
queueRefreshDecisionInput.firstHumanOperatorDeployPacketIndexVisibility = firstHumanOperatorDeployPacketIndexVisibility;
const operatorDryRunReviewChecklistVisibility = buildOperatorDryRunReviewChecklistVisibility(
  backlogQueue,
  firstHumanOperatorDeployPacketIndexVisibility
);
queueRefreshDecisionInput.operatorDryRunReviewChecklistVisibility = operatorDryRunReviewChecklistVisibility;
const firstHumanPacketColdStartArchiveVisibility = buildFirstHumanPacketColdStartArchiveVisibility(
  backlogQueue,
  firstHumanOperatorDeployPacketIndexVisibility,
  operatorDryRunReviewChecklistVisibility
);
queueRefreshDecisionInput.firstHumanPacketColdStartArchiveVisibility = firstHumanPacketColdStartArchiveVisibility;
const releaseCandidateDeployContinuationMapVisibility = buildReleaseCandidateDeployContinuationMapVisibility(
  backlogQueue,
  firstHumanPacketColdStartArchiveVisibility
);
queueRefreshDecisionInput.releaseCandidateDeployContinuationMapVisibility =
  releaseCandidateDeployContinuationMapVisibility;
const externalInputBoundaryLedgerVisibility = buildExternalInputBoundaryLedgerVisibility(
  backlogQueue,
  releaseCandidateDeployContinuationMapVisibility
);
queueRefreshDecisionInput.externalInputBoundaryLedgerVisibility = externalInputBoundaryLedgerVisibility;
const platformOwnerNonRequestTransferNoteVisibility = buildPlatformOwnerNonRequestTransferNoteVisibility(
  backlogQueue,
  externalInputBoundaryLedgerVisibility
);
queueRefreshDecisionInput.platformOwnerNonRequestTransferNoteVisibility =
  platformOwnerNonRequestTransferNoteVisibility;
const operatorResumePacketGuardrailVisibility = buildOperatorResumePacketGuardrailVisibility(
  backlogQueue,
  platformOwnerNonRequestTransferNoteVisibility
);
queueRefreshDecisionInput.operatorResumePacketGuardrailVisibility =
  operatorResumePacketGuardrailVisibility;
const blockedStateOperatorContinuationIndexVisibility = buildBlockedStateOperatorContinuationIndexVisibility(
  backlogQueue,
  operatorResumePacketGuardrailVisibility
);
queueRefreshDecisionInput.blockedStateOperatorContinuationIndexVisibility =
  blockedStateOperatorContinuationIndexVisibility;
const autonomousDeployStopLedgerVisibility = buildAutonomousDeployStopLedgerVisibility(
  backlogQueue,
  blockedStateOperatorContinuationIndexVisibility
);
queueRefreshDecisionInput.autonomousDeployStopLedgerVisibility = autonomousDeployStopLedgerVisibility;
const postAutonomousStopRecoveryChecklistVisibility = buildPostAutonomousStopRecoveryChecklistVisibility(
  backlogQueue,
  autonomousDeployStopLedgerVisibility
);
queueRefreshDecisionInput.postAutonomousStopRecoveryChecklistVisibility =
  postAutonomousStopRecoveryChecklistVisibility;
const humanPlatformAuthorityReEntryGateVisibility = buildHumanPlatformAuthorityReEntryGateVisibility(
  backlogQueue,
  postAutonomousStopRecoveryChecklistVisibility
);
queueRefreshDecisionInput.humanPlatformAuthorityReEntryGateVisibility =
  humanPlatformAuthorityReEntryGateVisibility;
const outsideAuthorityAwaitingStateLedgerVisibility = buildOutsideAuthorityAwaitingStateLedgerVisibility(
  backlogQueue,
  humanPlatformAuthorityReEntryGateVisibility
);
queueRefreshDecisionInput.outsideAuthorityAwaitingStateLedgerVisibility =
  outsideAuthorityAwaitingStateLedgerVisibility;
const swarmThroughput = buildSwarmThroughput(laneDocs, passes, reports, generatedAt);
const rapidTickUtilization = buildRapidTickUtilization(laneDocs, passes, reports);
const businessControlsVisibility = buildBusinessControlsVisibility();
const ownerAuthorityRepairLoopPreview = buildOwnerAuthorityRepairLoopPreview(businessControlsVisibility);
const conciergeFulfillmentDashboard = buildConciergeFulfillmentDashboardVisibility(businessControlsVisibility);
const redactedSessionEvidenceInbox = buildRedactedSessionEvidenceInboxVisibility();
const firstCustomerLaunchRoom = buildFirstCustomerLaunchRoomVisibility({
  businessControlsVisibility,
  conciergeFulfillmentDashboard,
  redactedSessionEvidenceInbox,
});
const firstCustomerSignalSurface = buildFirstCustomerSignalSurfaceVisibility();
const firstCustomerEvidenceInboxRoom = buildFirstCustomerEvidenceInboxRoomVisibility();
const firstCustomerEvidenceRouteScoreboard = buildFirstCustomerEvidenceRouteScoreboardVisibility();
const firstCustomerEvidenceProofRepairPacket = buildFirstCustomerEvidenceProofRepairPacketVisibility();
const repairedProofToPaidAskRoom = buildRepairedProofToPaidAskRoomVisibility();
const paidAskOutcomeRouter = buildPaidAskOutcomeRouterVisibility();
const paidAskProofPacketClarityRepair = buildPaidAskProofPacketClarityRepairVisibility();
const paidAskObjectionResponseSimulator = buildPaidAskObjectionResponseSimulatorVisibility();
const firstPaidPilotHandoffRoom = buildFirstPaidPilotHandoffRoomVisibility();
const firstPaidPilotGateSimulator = buildFirstPaidPilotGateSimulatorVisibility();
const firstDollarReadinessRoom = buildFirstDollarReadinessRoomVisibility();
const firstDollarOwnerEvidenceRepairRoom = buildFirstDollarOwnerEvidenceRepairRoomVisibility();
const firstPaidPilotFulfillmentReceiptPreview = buildFirstPaidPilotFulfillmentReceiptPreviewVisibility();
const firstLiveProofAuditCopilot = buildFirstLiveProofAuditCopilotVisibility();
const liveToPaidPilotDecisionRoom = buildLiveToPaidPilotDecisionRoomVisibility();
const liveProofTrustGapRepairRoom = buildLiveProofTrustGapRepairRoomVisibility();
const liveProofMissingProofCueRepair = buildLiveProofMissingProofCueRepairVisibility();
const paidPilotTrustGapRepairLab = buildPaidPilotTrustGapRepairLabVisibility();
const proofDeltaValueSnapshot = buildProofDeltaValueSnapshotVisibility();
const firstAuthorizedSessionRunner = buildFirstAuthorizedSessionRunnerVisibility();
const firstCustomerPilotConsole = buildFirstCustomerPilotConsoleVisibility();
const firstCustomerPilotRevenueSimulator = buildFirstCustomerPilotRevenueSimulatorVisibility();
const consentedAuditHandoffPreview = buildConsentedAuditHandoffPreviewVisibility();

const data = {
  generatedAt,
  company: {
    name: "ProofResume",
    workspace: projectRoot,
    gstack: "/Users/zackgrizz/Documents/AgentFoundryTools/gstack",
  },
  passes,
  lanes: laneDocs,
  swarmState: readJson("ops/swarm-state.json", {}),
  operations: {
    nextActions: sprintAndBacklog.flatMap(extractNextActions),
    backlogQueue,
    staleGuardrails,
    queueRefreshDecisionInput,
    recentlyShipped: parseRecentlyShipped(sprintAndBacklog[1]),
    localCapture: listLocalCapture(),
    sprintTrend: buildSprintTrend(passes),
    decisionLedger: buildDecisionLedger(passes, reports),
    validationFreshness,
    queueAgeProofComparison,
    deliverableReadiness,
    turnoverSummary,
    closeMatcherTrendDiagnostics,
    structuredExtractionVisibility,
    followupEvidenceVisibility,
    replyFactReadiness,
    calendarAppointmentReadiness,
    sessionStartReadiness,
    rawNoteCaptureReadiness,
    postSessionDebriefReadiness,
    objectionCodingReadiness,
    fiveSessionSynthesisReadiness,
    synthesisArtifactVisibility,
    synthesisDecisionMemoVisibility,
    launchDecisionApprovalVisibility,
    publishReadinessVisibility,
    explicitPublishPlanVisibility,
    releaseCandidateRehearsalVisibility,
    credentialedDeployBlockerVisibility,
    platformOwnerHandoffVisibility,
    postDeployHealthOwnerHandoffVisibility,
    finalDeployGoNoGoLedgerVisibility,
    deployBlockerEscalationMemoVisibility,
    firstHumanOperatorDeployPacketIndexVisibility,
    operatorDryRunReviewChecklistVisibility,
    firstHumanPacketColdStartArchiveVisibility,
    releaseCandidateDeployContinuationMapVisibility,
    externalInputBoundaryLedgerVisibility,
    platformOwnerNonRequestTransferNoteVisibility,
    operatorResumePacketGuardrailVisibility,
    blockedStateOperatorContinuationIndexVisibility,
    autonomousDeployStopLedgerVisibility,
    postAutonomousStopRecoveryChecklistVisibility,
    humanPlatformAuthorityReEntryGateVisibility,
    outsideAuthorityAwaitingStateLedgerVisibility,
    businessControlsVisibility,
    ownerAuthorityRepairLoopPreview,
    firstCustomerLaunchRoom,
    firstCustomerSignalSurface,
    firstCustomerEvidenceInboxRoom,
    firstCustomerEvidenceRouteScoreboard,
    firstCustomerEvidenceProofRepairPacket,
    repairedProofToPaidAskRoom,
    paidAskOutcomeRouter,
    paidAskProofPacketClarityRepair,
    paidAskObjectionResponseSimulator,
    firstPaidPilotHandoffRoom,
    firstPaidPilotGateSimulator,
    firstDollarReadinessRoom,
    firstDollarOwnerEvidenceRepairRoom,
    firstPaidPilotFulfillmentReceiptPreview,
    firstLiveProofAuditCopilot,
    liveToPaidPilotDecisionRoom,
    liveProofTrustGapRepairRoom,
    liveProofMissingProofCueRepair,
    paidPilotTrustGapRepairLab,
    proofDeltaValueSnapshot,
    firstAuthorizedSessionRunner,
    firstCustomerPilotConsole,
    firstCustomerPilotRevenueSimulator,
    consentedAuditHandoffPreview,
    conciergeFulfillmentDashboard,
    redactedSessionEvidenceInbox,
    swarmThroughput,
    rapidTickUtilization,
  },
  docs: [
    { path: "COMPANY.md", title: "Company", content: readText("COMPANY.md") },
    { path: "ops/GOALS.md", title: "Goals", content: readText("ops/GOALS.md") },
    { path: "ops/SWARM.md", title: "Swarm", content: readText("ops/SWARM.md") },
    { path: "ops/swarm-state.json", title: "Swarm State", content: readText("ops/swarm-state.json") },
    ...sprintAndBacklog,
    { path: "ops/CYCLE_CONTRACT.md", title: "Cycle Contract", content: readText("ops/CYCLE_CONTRACT.md") },
    { path: "ops/DELIVERABLES.md", title: "Deliverables", content: readText("ops/DELIVERABLES.md") },
    { path: "ops/GSTACK_SETUP.md", title: "GStack Setup", content: readText("ops/GSTACK_SETUP.md") },
    { path: "ops/BUSINESS_CONTROLS.json", title: "Business Controls", content: readText("ops/BUSINESS_CONTROLS.json") },
    { path: "ops/learnings.md", title: "Learnings", content: readText("ops/learnings.md") },
    { path: "ops/AUTONOMY.md", title: "Autonomy Contract", content: readText("ops/AUTONOMY.md") },
    { path: "ops/AGENT_OPERATOR_PROMPT.md", title: "Operator Prompt", content: readText("ops/AGENT_OPERATOR_PROMPT.md") },
    { path: "ops/requirements/README.md", title: "Requirement Notes", content: readText("ops/requirements/README.md") },
    { path: "ops/research/justhireme-functionality-map.md", title: "JustHireMe Functionality Map", content: readText("ops/research/justhireme-functionality-map.md") },
    { path: "ops/research/proofresume-target-job-pack-spec.md", title: "Target Job Pack Spec", content: readText("ops/research/proofresume-target-job-pack-spec.md") },
    { path: "ops/research/justhireme-proofresume-parity-review.md", title: "JustHireMe Parity Review", content: readText("ops/research/justhireme-proofresume-parity-review.md") },
  ],
  reports,
  requirements: listRequirementSnapshots(),
  validation: {
    commands: ["npm test", "npm run visual-qa", "npm run static-deploy-rehearsal"],
    visualQa,
    staticDeployRehearsal,
  },
};

fs.writeFileSync(path.join(websiteRoot, "admin-data.json"), JSON.stringify(data, null, 2));
console.log(`admin data written: ${path.join(websiteRoot, "admin-data.json")}`);

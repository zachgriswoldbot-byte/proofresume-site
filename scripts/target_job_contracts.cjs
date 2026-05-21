const LOCAL_TOOL_CONTRACTS_FORMAT = "proofresume-target-job-local-tool-contracts-v1";
const LOCAL_TOOL_RESULT_FORMAT = "proofresume-target-job-local-tool-result-v1";
const LOCAL_CONTRACT_RESULT_FORMAT = "proofresume-target-job-local-contract-result-v1";
const DEFAULT_AS_OF = "2026-05-16T00:00:00.000Z";

const skillLexicon = [
  "analytics",
  "automation",
  "crm",
  "customer operations",
  "dashboard",
  "excel",
  "forecasting",
  "hubspot",
  "implementation",
  "launch",
  "metrics",
  "onboarding",
  "operations",
  "product",
  "project management",
  "reporting",
  "sales",
  "salesforce",
  "sql",
  "stakeholder communication",
  "support",
  "workflow",
];

const roleTerms = [
  "analyst",
  "associate",
  "consultant",
  "coordinator",
  "director",
  "engineer",
  "lead",
  "manager",
  "operations",
  "product",
  "program",
  "sales",
  "specialist",
];

const seniorTerms = ["senior", "lead", "staff", "principal", "head of", "director", "vp", "chief"];
const earlyTerms = ["intern", "junior", "entry", "associate", "coordinator"];
const FIT_COMPONENTS = [
  { id: "role", label: "Role", weight: 12 },
  { id: "domain", label: "Domain", weight: 8 },
  { id: "stack", label: "Stack", weight: 16 },
  { id: "work", label: "Work evidence", weight: 13 },
  { id: "project", label: "Project evidence", weight: 10 },
  { id: "education", label: "Education / certification", weight: 5 },
  { id: "seniority", label: "Seniority", weight: 10 },
  { id: "location", label: "Location", weight: 7 },
  { id: "pay", label: "Pay", weight: 5 },
  { id: "sourceQuality", label: "Source quality", weight: 8 },
  { id: "redFlags", label: "Red flags", weight: 6 },
];

const redFlagPatterns = [
  ["commission-only", /\bcommission[-\s]?only\b/i],
  ["equity-only", /\bequity[-\s]?only\b/i],
  ["unpaid", /\bunpaid\b|\bfor exposure\b/i],
  ["take-home-heavy", /\b(weekend project|unpaid assignment|large take[-\s]?home|homework)\b/i],
  ["vague-company", /\bstealth\b|\bconfidential company\b/i],
  ["spammy", /\bwire transfer\b|\bcrypto payout\b|\btelegram\b|\bwhatsapp only\b/i],
];

function safeText(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function asOfIso(value) {
  const parsed = Date.parse(value || DEFAULT_AS_OF);
  return Number.isNaN(parsed) ? DEFAULT_AS_OF : new Date(parsed).toISOString();
}

function words(text) {
  return safeText(text).toLowerCase().match(/\b[a-z0-9+#.'-]+\b/g) || [];
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function percent(value) {
  return `${Math.round(value)}%`;
}

function sentenceCase(value) {
  const text = safeText(value);
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "";
}

function normalizeToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
}

function includesTerm(text, term) {
  return normalizeToken(text).includes(normalizeToken(term));
}

function extractFirstMatch(text, pattern) {
  const match = safeText(text).match(pattern);
  return match ? safeText(match[1] || match[0]) : "";
}

function looksLikeHtmlText(text) {
  const source = safeText(text);
  if (!source) return false;
  if (/^\s*<!doctype\s+html/i.test(source) || /^\s*<html[\s>]/i.test(source) || /<body[\s>]/i.test(source)) return true;
  if (/<(script|style|meta|title|div|span|section|article|main|p|h1|h2|ul|li|a)\b/i.test(source)) return true;
  return /<\/[a-z][\s>]/i.test(source);
}

function htmlToText(contents) {
  const source = safeText(contents);
  if (!source) return "";
  return source
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|main|h1|h2|h3|li|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripJobBoilerplate(text) {
  const source = safeText(text);
  if (!source) return { text: "", removed: false, cutoffLabel: "" };

  const lower = source.toLowerCase();
  const cutoffCandidates = [
    { label: "equal-opportunity", pattern: /\b(equal opportunity employer|equal employment opportunity|eeo statement|affirmative action)\b/i },
    { label: "accommodations", pattern: /\b(reasonable accommodation|accommodations?|disability|accessibility)\b/i },
    { label: "legal-boilerplate", pattern: /\b(e-verify|right to work|background check|drug test|work authorization)\b/i },
    { label: "privacy", pattern: /\b(california consumer privacy act|ccpa|gdpr|privacy policy)\b/i },
    { label: "powered-by", pattern: /\b(powered by (?:greenhouse|lever|ashby|workable))\b/i },
  ];

  const minIndex = 520;
  let best = null;
  for (const candidate of cutoffCandidates) {
    const match = lower.slice(minIndex).match(candidate.pattern);
    if (!match || match.index == null) continue;
    const idx = minIndex + match.index;
    if (!best || idx < best.index) best = { index: idx, label: candidate.label };
  }

  if (!best) return { text: source, removed: false, cutoffLabel: "" };
  const trimmed = safeText(source.slice(0, best.index));
  if (trimmed.length < 240) return { text: source, removed: false, cutoffLabel: "" };
  return { text: trimmed, removed: true, cutoffLabel: best.label };
}

function normalizePastedResumeText(value) {
  const raw = safeText(value);
  if (!raw) return { text: "", meta: { htmlConverted: false, bulletNormalized: false } };
  const htmlConverted = looksLikeHtmlText(raw);
  const converted = htmlConverted ? htmlToText(raw) : raw;
  const normalized = converted
    .replace(/\u2022|\u25cf|\u25aa|\u25a0/g, "-")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: normalized, meta: { htmlConverted, bulletNormalized: normalized !== converted } };
}

function normalizePastedJobText(value) {
  const raw = safeText(value);
  if (!raw) return { text: "", meta: { htmlConverted: false, boilerplateRemoved: false, boilerplateKind: "" } };
  const htmlConverted = looksLikeHtmlText(raw);
  const converted = htmlConverted ? htmlToText(raw) : raw;
  const boilerplate = stripJobBoilerplate(converted);
  const normalized = boilerplate.text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return {
    text: normalized,
    meta: { htmlConverted, boilerplateRemoved: boilerplate.removed, boilerplateKind: boilerplate.cutoffLabel },
  };
}

function detectPlatform(url, text) {
  const source = `${url || ""}\n${text || ""}`.toLowerCase();
  if (source.includes("greenhouse.io")) return "Greenhouse";
  if (source.includes("lever.co")) return "Lever";
  if (source.includes("ashbyhq.com")) return "Ashby";
  if (source.includes("workable.com")) return "Workable";
  if (source.includes("linkedin.com")) return "LinkedIn";
  if (source.includes("wellfound.com")) return "Wellfound";
  if (source.includes("ycombinator.com") || source.includes("who is hiring")) return "HN / community";
  return url ? "Company or custom source" : "Manual paste";
}

function extractPostedDate(text, asOfDate) {
  const raw =
    extractFirstMatch(text, /\b(?:posted|date)\s*:\s*([^\n]+)/i) ||
    extractFirstMatch(text, /\b(?:published|pubdate)\s*:\s*([^\n]+)/i) ||
    extractFirstMatch(text, /\bposted\s+(\d+\s+(?:day|week|month)s?\s+ago)\b/i);
  if (!raw) return "";
  const relative = raw.match(/(\d+)\s+(day|week|month)s?\s+ago/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const days = unit === "month" ? amount * 30 : unit === "week" ? amount * 7 : amount;
    const date = new Date(Date.parse(asOfIso(asOfDate)) - days * 24 * 60 * 60 * 1000);
    return date.toISOString().slice(0, 10);
  }
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? raw : new Date(parsed).toISOString().slice(0, 10);
}

function extractUrgency(text) {
  if (/\b(urgent|immediate|start asap|as soon as possible)\b/i.test(text)) return "urgent";
  if (/\b(hiring now|actively hiring|priority role)\b/i.test(text)) return "active";
  if (/\b(evergreen|talent pool|future opening)\b/i.test(text)) return "evergreen";
  return "normal";
}

function normalizeStack(value) {
  if (Array.isArray(value)) return value.map(safeText).filter(Boolean);
  return listFromValue(value, { comma: true });
}

function extractJobIntel(jobText, options = {}) {
  const text = safeText(jobText);
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const firstLine = lines[0] || "Target role";
  const company =
    extractFirstMatch(text, /\bcompany\s*:\s*([^\n]+)/i) ||
    extractFirstMatch(text, /\bat\s+([A-Z][A-Za-z0-9&.,' -]{2,60})/) ||
    "";
  const url = extractFirstMatch(text, /(https?:\/\/[^\s)]+)/i);
  const platform = extractFirstMatch(text, /\bplatform\s*:\s*([^\n]+)/i) || detectPlatform(url, text);
  const location =
    extractFirstMatch(text, /\b(?:location|based)\s*:\s*([^\n]+)/i) ||
    (/\bremote\b/i.test(text) ? "Remote" : "");
  const salary = extractFirstMatch(text, /(\$[\d,]+(?:\s*-\s*\$?[\d,]+)?(?:\s*(?:usd|per year|\/year|annually))?)/i);
  const postedDate = extractPostedDate(text, options.asOfDate);
  const urgency = extractUrgency(text);
  const stack = unique([
    ...normalizeStack(extractFirstMatch(text, /\b(?:stack|skills?|tags?|keywords?)\s*:\s*([^\n]+)/i)),
    ...skillLexicon.filter((term) => includesTerm(text, term)),
  ]);
  const skills = skillLexicon.filter((term) => stack.some((item) => includesTerm(item, term)) || includesTerm(text, term));
  const seniority = seniorTerms.find((term) => includesTerm(firstLine, term) || includesTerm(text.slice(0, 280), term)) || "";
  const earlyCareer = earlyTerms.some((term) => includesTerm(firstLine, term) || includesTerm(text.slice(0, 280), term));
  const redFlags = redFlagPatterns.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
  const requirements = lines.filter((line) => /\b(require|must|need|experience|years|\d\+)\b/i.test(line)).slice(0, 6);
  const responsibilities = lines.filter((line) => /\b(responsib|build|own|lead|improve|partner|create|manage|deliver)\b/i.test(line)).slice(0, 6);
  const description = lines
    .filter((line) => !/^(company|apply|url|posted|published|pubdate|date|location|based|platform|stack|skills?|tags?|keywords?)\s*:/i.test(line))
    .slice(1)
    .join("\n");

  return {
    title: firstLine.replace(/\s+\|\s+.*$/, ""),
    company,
    url,
    platform,
    location,
    salary,
    postedDate,
    description,
    stack,
    urgency,
    skills,
    seniority,
    earlyCareer,
    redFlags,
    requirements,
    responsibilities,
    wordCount: words(text).length,
  };
}

function evaluateLeadQuality(jobIntel, options = {}) {
  const issues = [];
  const tags = [];
  let score = 100;
  const intel = jobIntel || {};

  if (!intel.url) {
    score -= 18;
    issues.push("No apply/source URL was pasted, so the lead is harder to verify.");
    tags.push("missing-url");
  }
  if (!intel.company) {
    score -= 15;
    issues.push("Company context is missing or unclear.");
    tags.push("missing-company");
  }
  if ((intel.wordCount || 0) < 85) {
    score -= 20;
    issues.push("The posting is thin; paste responsibilities and requirements before relying on fit scoring.");
    tags.push("thin-posting");
  }
  if (intel.postedDate) {
    const postedMs = Date.parse(intel.postedDate);
    const asOfMs = Date.parse(asOfIso(options.asOfDate));
    if (!Number.isNaN(postedMs) && asOfMs - postedMs > 45 * 24 * 60 * 60 * 1000) {
      score -= 15;
      issues.push("Posting appears stale based on the pasted posted date.");
      tags.push("stale-posting");
    }
  }
  if (!Array.isArray(intel.skills) || !intel.skills.length) {
    score -= 10;
    issues.push("No clear skills or tools were detected in the posting.");
    tags.push("low-skill-context");
  }
  const flags = Array.isArray(intel.redFlags) ? intel.redFlags : [];
  if (flags.length) {
    score -= flags.length * 18;
    issues.push(`Red flags detected: ${flags.join(", ")}.`);
    tags.push(...flags);
  }

  const finalScore = clamp(score, 0, 100);
  return {
    accepted: finalScore >= 60 && !flags.includes("spammy"),
    score: finalScore,
    reason: issues.length ? issues.join(" ") : "Posting has enough source, company, requirements, and role context for a useful pack.",
    tags: unique(tags.length ? tags : ["usable-lead"]),
  };
}

function listFromValue(value, options = {}) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (!item || typeof item !== "object") return safeText(item);
        return safeText(Object.values(item).flatMap((entry) => listFromValue(entry)).join(" | "));
      })
      .filter(Boolean);
  }
  const source = safeText(value);
  if (!source) return [];
  const delimiter = options.comma ? /[\n,;]+/ : /\n+/;
  return source.split(delimiter).map((item) => safeText(item.replace(/^[-*]\s+/, ""))).filter(Boolean);
}

function normalizeStructuredProfile(value) {
  const source = value && typeof value === "object" ? value : {};
  const identity = source.identity && typeof source.identity === "object" ? source.identity : {};
  return {
    identity: {
      name: safeText(identity.name || source.name),
      headline: safeText(identity.headline || source.headline),
      email: safeText(identity.email || source.email),
      phone: safeText(identity.phone || source.phone),
      location: safeText(identity.location || source.location),
      summary: safeText(identity.summary || source.summary),
    },
    links: listFromValue(source.links),
    skills: listFromValue(source.skills, { comma: true }),
    experience: listFromValue(source.experience),
    projects: listFromValue(source.projects),
    education: listFromValue(source.education),
    certifications: listFromValue(source.certifications),
    achievements: listFromValue(source.achievements),
  };
}

function structuredProfileHasContent(profile) {
  const normalized = normalizeStructuredProfile(profile);
  return Boolean(
    Object.values(normalized.identity).some(Boolean) ||
      normalized.links.length ||
      normalized.skills.length ||
      normalized.experience.length ||
      normalized.projects.length ||
      normalized.education.length ||
      normalized.certifications.length ||
      normalized.achievements.length
  );
}

function structuredSectionLines(title, entries) {
  const lines = listFromValue(entries);
  if (!lines.length) return [];
  return [title, ...lines.map((line) => (/^[-*]\s+/.test(line) ? line : `- ${line}`)), ""];
}

function structuredProfileToEvidenceText(profile) {
  const normalized = normalizeStructuredProfile(profile);
  if (!structuredProfileHasContent(normalized)) return "";
  const lines = [];
  const identity = normalized.identity;
  if (identity.name) lines.push(identity.name);
  if (identity.headline) lines.push(identity.headline);
  if (identity.location) lines.push(`Location: ${identity.location}`);
  if (identity.summary) lines.push("", "Summary", `- ${identity.summary}`, "");
  if (normalized.links.length) lines.push("Links", ...normalized.links.map((link) => `- ${link}`), "");
  if (normalized.skills.length) lines.push("Skills", normalized.skills.join(", "), "");
  lines.push(...structuredSectionLines("Experience", normalized.experience));
  lines.push(...structuredSectionLines("Projects", normalized.projects));
  lines.push(...structuredSectionLines("Education", normalized.education));
  lines.push(...structuredSectionLines("Certifications", normalized.certifications));
  lines.push(...structuredSectionLines("Achievements", normalized.achievements));
  return safeText(lines.join("\n"));
}

function profileEvidenceText(resumeText, structuredProfile) {
  const normalizedResume = normalizePastedResumeText(resumeText);
  const structuredText = structuredProfileToEvidenceText(structuredProfile);
  return [normalizedResume.text, structuredText ? `Structured profile evidence\n${structuredText}` : ""].filter(Boolean).join("\n\n");
}

function structuredProfileSummary(profile) {
  const normalized = normalizeStructuredProfile(profile);
  return {
    format: "proofresume-target-job-structured-profile-summary-v1",
    hasIdentity: Object.values(normalized.identity).some(Boolean),
    skillCount: normalized.skills.length,
    experienceCount: normalized.experience.length,
    projectCount: normalized.projects.length,
    educationCount: normalized.education.length,
    certificationCount: normalized.certifications.length,
    achievementCount: normalized.achievements.length,
    linkCount: normalized.links.length,
  };
}

function sectionEvidenceLines(lines, targetHeadings) {
  const headings = new Set(["summary", "skills", "links", "experience", "projects", "education", "certifications", "achievements"]);
  const targets = new Set((Array.isArray(targetHeadings) ? targetHeadings : []).map(normalizeToken));
  let active = false;
  const evidence = [];
  for (const line of Array.isArray(lines) ? lines : []) {
    const normalized = normalizeToken(line && line.text);
    if (headings.has(normalized)) {
      active = targets.has(normalized);
      continue;
    }
    if (active && safeText(line && line.text)) evidence.push(line);
  }
  return evidence;
}

function extractResumeEvidence(resumeText) {
  const text = safeText(resumeText);
  const lines = text.split("\n").map((line, index) => ({ text: line.trim(), lineNumber: index + 1 })).filter((line) => line.text);
  const bulletLines = lines.filter((line) => /^[-*]\s+/.test(line.text) || /\b(led|built|owned|improved|reduced|increased|created|managed|delivered|designed|automated|partnered|cut)\b/i.test(line.text));
  const skills = skillLexicon.filter((term) => includesTerm(text, term));
  const roleMatches = roleTerms.filter((term) => includesTerm(text, term));
  const metrics = (text.match(/\b\d+[%$kmb]?\b|\b\d+\s*(?:hours|days|weeks|months|accounts|customers|users)\b/gi) || []).slice(0, 12);
  const years = text.match(/\b(?:19|20)\d{2}\b/g) || [];
  const likelyYears = years.length >= 2 ? Math.max(1, Number(years[years.length - 1]) - Number(years[0])) : null;
  const sectionLines = {
    work: sectionEvidenceLines(lines, ["experience"]),
    project: sectionEvidenceLines(lines, ["projects"]),
    education: sectionEvidenceLines(lines, ["education", "certifications"]),
    achievements: sectionEvidenceLines(lines, ["achievements"]),
  };

  return {
    lines,
    bulletLines,
    skills,
    roleMatches,
    metrics: unique(metrics),
    likelyYears,
    wordCount: words(text).length,
    sectionLines,
    sectionCounts: {
      work: sectionLines.work.length,
      project: sectionLines.project.length,
      education: sectionLines.education.length,
      achievements: sectionLines.achievements.length,
    },
  };
}

function fitComponent(id, coverage, reason, evidence = {}) {
  const config = FIT_COMPONENTS.find((component) => component.id === id) || { id, label: sentenceCase(id), weight: 1 };
  const score = Math.round(clamp(coverage * 100, 0, 100));
  const matchedProof = (Array.isArray(evidence.matchedProof) ? evidence.matchedProof : []).map(safeText).filter(Boolean);
  const missingProof = (Array.isArray(evidence.missingProof) ? evidence.missingProof : []).map(safeText).filter(Boolean);
  const risk = evidence.riskOverride || (score >= 75 ? "strong" : score >= 50 ? "review" : "gap");
  return {
    id: config.id,
    label: config.label,
    score,
    componentScore: score,
    weight: config.weight,
    risk,
    status: componentStatus(score, matchedProof, missingProof, risk),
    reason: safeText(reason),
    matchedProof,
    missingProof,
  };
}

function componentStatus(score, matchedProof, missingProof, risk) {
  if (risk === "gap" && missingProof.length) return "blocked";
  if (missingProof.length && matchedProof.length) return "partial";
  if (missingProof.length) return score >= 50 ? "needs-proof" : "missing";
  if (matchedProof.length) return "matched";
  return score >= 75 ? "matched" : "needs-review";
}

function missingProofGroup(id, label, items, component = {}) {
  return {
    component: id,
    label,
    componentScore: Number(component.componentScore !== undefined ? component.componentScore : component.score || 0),
    risk: safeText(component.risk),
    status: safeText(component.status),
    items: (Array.isArray(items) ? items : []).map(safeText).filter(Boolean),
  };
}

function componentEvidenceGroups(components, proofKey) {
  return (Array.isArray(components) ? components : [])
    .map((component) => missingProofGroup(component.id, component.label, component && component[proofKey], component))
    .filter((group) => group.items.length);
}

function scoreFit(jobIntel, resumeEvidence, candidateLevel, preferredLocation) {
  const intel = jobIntel || {};
  const evidence = resumeEvidence || extractResumeEvidence("");
  const matchedSkills = (Array.isArray(intel.skills) ? intel.skills : []).filter((skill) => evidence.skills.includes(skill));
  const missingSkills = (Array.isArray(intel.skills) ? intel.skills : []).filter((skill) => !evidence.skills.includes(skill));
  const skillCoverage = intel.skills && intel.skills.length ? matchedSkills.length / intel.skills.length : 0.35;
  const roleCoverage = roleTerms.some((term) => includesTerm(intel.title, term) && evidence.roleMatches.includes(term)) ? 1 : 0.45;
  const domainTerms = unique([
    ...(Array.isArray(intel.skills) ? intel.skills : []),
    ...(Array.isArray(intel.responsibilities) ? intel.responsibilities : []).flatMap((line) => skillLexicon.filter((term) => includesTerm(line, term))),
  ]);
  const domainMatches = domainTerms.filter((term) => evidence.skills.includes(term));
  const domainCoverage = domainTerms.length ? domainMatches.length / domainTerms.length : skillCoverage;
  const evidenceCoverage = clamp(evidence.bulletLines.length / 6, 0, 1);
  const sectionLines = {
    work: Array.isArray(evidence.sectionLines && evidence.sectionLines.work) ? evidence.sectionLines.work : [],
    project: Array.isArray(evidence.sectionLines && evidence.sectionLines.project) ? evidence.sectionLines.project : [],
    education: Array.isArray(evidence.sectionLines && evidence.sectionLines.education) ? evidence.sectionLines.education : [],
    achievements: Array.isArray(evidence.sectionLines && evidence.sectionLines.achievements) ? evidence.sectionLines.achievements : [],
  };
  const sectionCounts = {
    work: Number((evidence.sectionCounts && evidence.sectionCounts.work) || sectionLines.work.length || 0),
    project: Number((evidence.sectionCounts && evidence.sectionCounts.project) || sectionLines.project.length || 0),
    education: Number((evidence.sectionCounts && evidence.sectionCounts.education) || sectionLines.education.length || 0),
    achievements: Number((evidence.sectionCounts && evidence.sectionCounts.achievements) || sectionLines.achievements.length || 0),
  };
  const workCoverage = clamp((sectionCounts.work || evidence.bulletLines.length) / 5, 0, 1);
  const projectCoverage = clamp((sectionCounts.project + sectionCounts.achievements) / 3, 0, 1);
  const educationCoverage = clamp(sectionCounts.education / 2, 0, 1);
  const metricCoverage = evidence.metrics.length ? 1 : 0.35;
  const locationCoverage =
    !preferredLocation || !intel.location
      ? 0.75
      : includesTerm(intel.location, preferredLocation) || includesTerm(preferredLocation, intel.location) || /remote/i.test(intel.location)
        ? 1
        : 0.45;
  const payCoverage = intel.salary ? 1 : 0.65;
  const sourceQualityCoverage = clamp(
    (intel.url ? 0.34 : 0) + (intel.company ? 0.26 : 0) + (intel.requirements && intel.requirements.length ? 0.2 : 0) + ((intel.wordCount || 0) >= 85 ? 0.2 : 0),
    0,
    1
  );
  const redFlags = Array.isArray(intel.redFlags) ? intel.redFlags : [];
  const redFlagCoverage = clamp(1 - redFlags.length * 0.28, 0, 1);
  let seniorityCoverage = 0.8;
  if (intel.seniority && candidateLevel === "early") seniorityCoverage = 0.35;
  if (intel.seniority && candidateLevel === "mid") seniorityCoverage = 0.62;
  if (intel.seniority && ["senior", "executive"].includes(candidateLevel)) seniorityCoverage = 0.9;
  if (intel.earlyCareer && ["senior", "executive"].includes(candidateLevel)) seniorityCoverage = 0.68;

  const domainMissing = domainTerms.filter((term) => !evidence.skills.includes(term));
  const workLines = sectionLines.work.length ? sectionLines.work : evidence.bulletLines;
  const projectLines = [...sectionLines.project, ...sectionLines.achievements];
  const seniorityLabel = intel.seniority || (intel.earlyCareer ? "early-career" : "");
  const sourceQualityMatched = [
    intel.url ? "Source URL is present for local operator verification." : "",
    intel.company ? `Company context is present: ${intel.company}.` : "",
    intel.requirements && intel.requirements.length ? `${intel.requirements.length} requirement line${intel.requirements.length === 1 ? "" : "s"} extracted from the posting.` : "",
    (intel.wordCount || 0) >= 85 ? "Posting has enough pasted text for deterministic local scoring." : "",
  ].filter(Boolean);
  const sourceQualityMissing = [
    intel.requirements && intel.requirements.length ? "" : "Paste more requirements so the score can distinguish true gaps from missing posting context.",
    intel.url ? "" : "Add the apply/source URL so the operator can verify the lead before using the pack.",
    intel.company ? "" : "Add company context before trusting the lead.",
    (intel.wordCount || 0) >= 85 ? "" : "Paste more of the posting before relying on this lead.",
  ].filter(Boolean);

  const components = [
    fitComponent("role", roleCoverage, roleCoverage >= 0.8 ? `Role terms align with ${intel.title || "the target role"}.` : "Resume role wording is thinner than the target title.", {
      matchedProof: roleCoverage >= 0.8 ? [`Resume role terms overlap the target title: ${intel.title || "target role"}.`] : [],
      missingProof: roleCoverage >= 0.8 ? [] : ["Mirror the target role wording with truthful title, summary, or experience proof."],
    }),
    fitComponent("domain", domainCoverage, domainMatches.length ? `Domain overlap: ${domainMatches.slice(0, 4).join(", ")}.` : "Add domain-specific proof tied to the posting.", {
      matchedProof: domainMatches.slice(0, 6).map((term) => `Resume includes domain signal: ${term}.`),
      missingProof: domainMissing.slice(0, 6).map((term) => `Add domain proof tied to ${term}.`),
    }),
    fitComponent("stack", skillCoverage, matchedSkills.length ? `Stack overlap: ${matchedSkills.slice(0, 5).join(", ")}.` : "No detected stack/tool overlap yet.", {
      matchedProof: matchedSkills.slice(0, 8).map((skill) => `Resume includes required skill/tool: ${skill}.`),
      missingProof: missingSkills.slice(0, 6).map((skill) => `Add proof for ${skill}: project, result, tool use, or measurable outcome.`),
    }),
    fitComponent("work", workCoverage * 0.7 + metricCoverage * 0.3, `${evidence.bulletLines.length} work evidence lines and ${evidence.metrics.length} metric clues are available.`, {
      matchedProof: [
        ...workLines.slice(0, 3).map((line) => `Work proof line ${line.lineNumber}: ${line.text}`),
        ...(evidence.metrics.length ? [`Metric clues: ${evidence.metrics.slice(0, 4).join(", ")}.`] : []),
      ],
      missingProof: [
        evidence.metrics.length ? "" : "Add at least one metric: volume, time saved, revenue, customers, cycle time, quality, or budget.",
        evidence.bulletLines.length >= 3 ? "" : "Add more role-relevant work bullets before relying on tailored drafts.",
      ],
    }),
    fitComponent("project", projectCoverage || (evidenceCoverage >= 0.7 ? 0.55 : 0.25), projectCoverage ? "Structured project or achievement proof is available." : "Add project or achievement evidence mapped to the role.", {
      matchedProof: projectLines.slice(0, 3).map((line) => `Project or achievement proof line ${line.lineNumber}: ${line.text}`),
      missingProof: projectCoverage ? [] : ["Add project or achievement evidence that demonstrates the role's domain or tools."],
    }),
    fitComponent("education", educationCoverage || 0.55, educationCoverage ? "Education or certification evidence is available." : "Add education, training, or certification proof if relevant.", {
      matchedProof: sectionLines.education.slice(0, 3).map((line) => `Education or certification proof line ${line.lineNumber}: ${line.text}`),
      missingProof: educationCoverage ? [] : ["Add education, training, or certification evidence when the posting values credentials."],
    }),
    fitComponent("seniority", seniorityCoverage, seniorityCoverage >= 0.7 ? "Seniority appears compatible." : "Seniority may be a mismatch without more scope proof.", {
      matchedProof: [
        seniorityCoverage >= 0.7 ? `Candidate level ${candidateLevel || "unspecified"} is compatible with ${seniorityLabel || "the target role"}.` : "",
        evidence.likelyYears ? `Resume date span suggests roughly ${evidence.likelyYears} year${evidence.likelyYears === 1 ? "" : "s"} of timeline evidence.` : "",
      ],
      missingProof: [
        intel.seniority && seniorityCoverage < 0.7
          ? `Seniority risk: ${intel.title} appears ${intel.seniority}; add years, scope, team size, ownership level, or choose a closer-fit posting.`
          : "",
      ],
    }),
    fitComponent("location", locationCoverage, locationCoverage === 1 ? `Location preference appears compatible with ${intel.location || "the role"}.` : "Location preference is missing or partially mismatched.", {
      matchedProof: locationCoverage === 1 ? [`Location preference appears compatible with ${intel.location || "the role"}.`] : [],
      missingProof: locationCoverage === 1 ? [] : ["Confirm candidate location, remote policy, relocation, or timezone fit before applying."],
    }),
    fitComponent("pay", payCoverage, intel.salary ? `Pay range detected: ${intel.salary}.` : "No pay range was pasted; verify compensation separately.", {
      matchedProof: intel.salary ? [`Pay range detected in posting: ${intel.salary}.`] : [],
      missingProof: intel.salary ? [] : ["Confirm the pay range manually before investing in the application."],
    }),
    fitComponent("sourceQuality", sourceQualityCoverage, sourceQualityCoverage >= 0.75 ? "Source, company, requirements, and posting depth look usable." : "Source quality is limited; verify URL, company, and requirements.", {
      matchedProof: sourceQualityMatched,
      missingProof: sourceQualityMissing,
    }),
    fitComponent("redFlags", redFlagCoverage, redFlags.length ? `Red flags detected: ${redFlags.join(", ")}.` : "No red flags detected in the pasted posting.", {
      matchedProof: redFlags.length ? [] : ["No configured red flags detected in the pasted posting."],
      missingProof: redFlags.map((flag) => `Review red flag before applying: ${flag}.`),
      riskOverride: redFlags.includes("spammy") ? "gap" : "",
    }),
  ];

  const totalWeight = FIT_COMPONENTS.reduce((sum, component) => sum + component.weight, 0);
  const base = components.reduce((sum, component) => sum + component.score * component.weight, 0) / totalWeight;
  const hardCap = intel.seniority && candidateLevel === "early" ? 68 : 100;
  const score = Math.round(clamp(base, 0, hardCap));
  const matchPoints = [
    matchedSkills.length ? `Skill overlap: ${matchedSkills.join(", ")}.` : "",
    evidence.metrics.length ? `Metric proof present: ${evidence.metrics.slice(0, 4).join(", ")}.` : "",
    evidence.bulletLines.length ? `${evidence.bulletLines.length} resume evidence lines are available for tailoring.` : "",
    locationCoverage === 1 ? `Location preference appears compatible with ${intel.location || "the pasted role"}.` : "",
  ].filter(Boolean);
  const missingProofGroups = componentEvidenceGroups(components, "missingProof");
  const missingProof = missingProofGroups.flatMap((group) => group.items);

  return {
    score,
    reason: `${percent(skillCoverage * 100)} of detected job skills appear in the resume; component checks now include role, domain, stack, evidence, source quality, and red flags.`,
    components,
    componentScores: Object.fromEntries(components.map((component) => [component.id, component.score])),
    componentRisks: Object.fromEntries(components.map((component) => [component.id, component.risk])),
    componentStatuses: Object.fromEntries(components.map((component) => [component.id, component.status])),
    matchedSkills,
    missingSkills,
    matchPoints: matchPoints.length ? matchPoints : ["No strong match points yet; paste more resume evidence or a fuller posting."],
    missingProof: missingProof.length ? missingProof : ["No major proof gaps detected. Human review still required before exporting final claims."],
    missingProofGroups: missingProofGroups.length
      ? missingProofGroups
      : [missingProofGroup("overall", "Overall", ["No major proof gaps detected. Human review still required before exporting final claims."])],
    coverage: {
      skillCoverage: Math.round(skillCoverage * 100),
      domainCoverage: Math.round(domainCoverage * 100),
      roleCoverage: Math.round(roleCoverage * 100),
      evidenceCoverage: Math.round(evidenceCoverage * 100),
      workCoverage: Math.round(workCoverage * 100),
      projectCoverage: Math.round(projectCoverage * 100),
      educationCoverage: Math.round(educationCoverage * 100),
      metricCoverage: Math.round(metricCoverage * 100),
      seniorityCoverage: Math.round(seniorityCoverage * 100),
      locationCoverage: Math.round(locationCoverage * 100),
      payCoverage: Math.round(payCoverage * 100),
      sourceQualityCoverage: Math.round(sourceQualityCoverage * 100),
      redFlagCoverage: Math.round(redFlagCoverage * 100),
    },
  };
}

function localContractBoundary() {
  return {
    localOnly: true,
    noExternalFetch: true,
    noAutoApply: true,
    noOutboundSend: true,
    noUpload: true,
    noAnalyticsSend: true,
  };
}

function extract_lead_intel(input = {}) {
  const options = { asOfDate: input.asOfDate };
  const normalizedJob = normalizePastedJobText(input.jobText || input.text || "");
  const jobIntel = extractJobIntel(normalizedJob.text, options);
  return {
    format: LOCAL_TOOL_RESULT_FORMAT,
    tool: "extract_lead_intel",
    generatedAt: asOfIso(input.asOfDate),
    ...localContractBoundary(),
    inputNormalization: { job: normalizedJob.meta },
    jobIntel,
  };
}

function evaluate_lead_quality(input = {}) {
  const intelResult = input.jobIntel ? null : extract_lead_intel(input);
  const jobIntel = input.jobIntel || intelResult.jobIntel;
  return {
    format: LOCAL_TOOL_RESULT_FORMAT,
    tool: "evaluate_lead_quality",
    generatedAt: asOfIso(input.asOfDate),
    ...localContractBoundary(),
    inputNormalization: intelResult ? intelResult.inputNormalization : null,
    jobIntel,
    leadQuality: evaluateLeadQuality(jobIntel, { asOfDate: input.asOfDate }),
  };
}

function score_job_fit(input = {}) {
  const options = { asOfDate: input.asOfDate };
  const normalizedJob = normalizePastedJobText(input.jobText || input.text || "");
  const normalizedResume = normalizePastedResumeText(input.resumeText || "");
  const structuredProfile = normalizeStructuredProfile(input.structuredProfile || input.profile || {});
  const effectiveResumeText = profileEvidenceText(normalizedResume.text, structuredProfile);
  const jobIntel = input.jobIntel || extractJobIntel(normalizedJob.text, options);
  const resumeEvidence = extractResumeEvidence(effectiveResumeText);
  const fit = scoreFit(jobIntel, resumeEvidence, input.candidateLevel || "mid", safeText(input.preferredLocation));
  return {
    format: LOCAL_TOOL_RESULT_FORMAT,
    tool: "score_job_fit",
    generatedAt: asOfIso(input.asOfDate),
    ...localContractBoundary(),
    learningApplied: false,
    inputNormalization: {
      resume: normalizedResume.meta,
      job: normalizedJob.meta,
    },
    jobIntel,
    leadQuality: evaluateLeadQuality(jobIntel, options),
    fit,
    resumeEvidenceSummary: {
      wordCount: resumeEvidence.wordCount,
      skillCount: resumeEvidence.skills.length,
      metricCount: resumeEvidence.metrics.length,
      evidenceLineCount: resumeEvidence.bulletLines.length,
      likelyYears: resumeEvidence.likelyYears,
    },
    structuredProfileSummary: structuredProfileSummary(structuredProfile),
  };
}

function targetJobLocalContracts() {
  return {
    format: LOCAL_TOOL_CONTRACTS_FORMAT,
    source: "node-commonjs-local-deterministic-analysis",
    version: "v1",
    ...localContractBoundary(),
    tools: [
      {
        name: "extract_lead_intel",
        input: ["jobText"],
        output: ["jobIntel", "inputNormalization"],
      },
      {
        name: "evaluate_lead_quality",
        input: ["jobText or jobIntel"],
        output: ["leadQuality", "jobIntel"],
      },
      {
        name: "score_job_fit",
        input: ["resumeText", "structuredProfile", "jobText", "candidateLevel", "preferredLocation"],
        output: ["fit", "leadQuality", "jobIntel", "resumeEvidenceSummary", "structuredProfileSummary"],
      },
    ],
  };
}

function runAllContracts(input = {}) {
  const normalizedInput = { ...input, asOfDate: asOfIso(input.asOfDate) };
  const intel = extract_lead_intel(normalizedInput);
  const quality = evaluate_lead_quality({ ...normalizedInput, jobIntel: intel.jobIntel });
  const fit = score_job_fit({ ...normalizedInput, jobIntel: intel.jobIntel });
  return {
    format: LOCAL_CONTRACT_RESULT_FORMAT,
    generatedAt: normalizedInput.asOfDate,
    source: "node-commonjs-local-deterministic-analysis",
    ...localContractBoundary(),
    contracts: targetJobLocalContracts(),
    results: {
      extract_lead_intel: intel,
      evaluate_lead_quality: quality,
      score_job_fit: fit,
    },
    ok: true,
  };
}

module.exports = {
  LOCAL_CONTRACT_RESULT_FORMAT,
  LOCAL_TOOL_CONTRACTS_FORMAT,
  LOCAL_TOOL_RESULT_FORMAT,
  DEFAULT_AS_OF,
  targetJobLocalContracts,
  runAllContracts,
  extract_lead_intel,
  evaluate_lead_quality,
  score_job_fit,
  extractLeadIntelContract: extract_lead_intel,
  evaluateLeadQualityContract: evaluate_lead_quality,
  scoreJobFitContract: score_job_fit,
  extractJobIntel,
  evaluateLeadQuality,
  extractResumeEvidence,
  scoreFit,
  normalizeStructuredProfile,
};

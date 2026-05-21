const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");
const websiteRoot = path.join(repoRoot, "website");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const visualReportPath = path.join(repoRoot, "ops", "reports", "visual-qa", "latest.json");
const visualReport = JSON.parse(fs.readFileSync(visualReportPath, "utf8"));

const htmlPages = fs
  .readdirSync(websiteRoot)
  .filter((file) => file.endsWith(".html"))
  .sort();

function hasScript(name, token) {
  const script = packageJson.scripts?.[name] || "";
  return token ? script.includes(token) : Boolean(script);
}

function readScript(file) {
  return fs.readFileSync(path.join(websiteRoot, "scripts", file), "utf8");
}

const checkSiteSource = readScript("check_site.cjs");
const visualSource = readScript("visual_qa.cjs");
const intakeSource = readScript("qa_intake_flow.cjs");
const visualPages = new Set((visualReport.results || []).map((result) => result.page));
const expectedVisualPages = htmlPages.map((file) => (file === "index.html" ? "site" : path.basename(file, ".html")));
const missingVisualPages = expectedVisualPages.filter((page) => !visualPages.has(page));

const checks = [
  {
    name: "npm test wires build-admin",
    ok: hasScript("test", "npm run build-admin"),
  },
  {
    name: "npm test wires static site checks",
    ok: hasScript("test", "website/scripts/check_site.cjs"),
  },
  {
    name: "npm test wires local intake flow",
    ok: hasScript("test", "npm run qa:intake-flow"),
  },
  {
    name: "visual-qa script exists",
    ok: hasScript("visual-qa", "website/scripts/visual_qa.cjs"),
  },
  {
    name: "standalone page discovery is dynamic",
    ok:
      checkSiteSource.includes(".filter((file) => file.endsWith(\".html\"))") &&
      visualSource.includes(".filter((file) => file.endsWith(\".html\"))"),
  },
  {
    name: "visual QA latest report passed",
    ok: visualReport.ok === true,
  },
  {
    name: "visual QA covered every standalone page",
    ok: missingVisualPages.length === 0,
    detail: missingVisualPages,
  },
  {
    name: "local-only flow blocks external/API/submit requests",
    ok:
      intakeSource.includes("externalRequests") &&
      intakeSource.includes("apiRequests") &&
      intakeSource.includes("submitRequests") &&
      intakeSource.includes("route.abort()"),
  },
];

const report = {
  ok: checks.every((check) => check.ok),
  checkedAt: new Date().toISOString(),
  packageScripts: {
    test: packageJson.scripts?.test,
    visualQa: packageJson.scripts?.["visual-qa"],
    intakeFlow: packageJson.scripts?.["qa:intake-flow"],
  },
  standalonePages: htmlPages,
  visualQa: {
    ok: visualReport.ok,
    checkedAt: visualReport.checkedAt,
    engine: visualReport.engine,
    mode: visualReport.mode,
    resultCount: visualReport.results?.length || 0,
    expectedPages: expectedVisualPages,
    missingPages: missingVisualPages,
  },
  checks,
};

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);

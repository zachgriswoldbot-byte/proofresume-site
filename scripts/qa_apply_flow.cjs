#!/usr/bin/env node

const http = require("http");
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");

function contentType(file) {
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const requested = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = path.normalize(path.join(root, requested));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(requested === "/favicon.ico" ? 204 : 404);
      res.end("");
      return;
    }
    res.writeHead(200, { "content-type": contentType(file) });
    fs.createReadStream(file).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function main() {
  const { server, baseUrl } = await startServer();
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  try {
    await page.goto(baseUrl);
    await page.click("text=Try auto-apply demo");
    await page.waitForURL(/apply\.html$/);
    await page.click("[data-apply-demo-load]");

    await page.locator("[data-apply-job]").first().waitFor({ state: "visible" });
    let result = await page.evaluate(() => ({
      jobs: document.querySelectorAll("[data-apply-job]").length,
      readyCount: document.querySelector("[data-apply-ready-count]")?.textContent?.trim(),
      appliedCount: document.querySelector("[data-apply-applied-count]")?.textContent?.trim(),
      status: document.querySelector("[data-apply-status-label]")?.textContent?.trim(),
    }));

    if (result.jobs !== 3) throw new Error(`Expected 3 generated applications, saw ${result.jobs}.`);
    if (result.readyCount !== "3") throw new Error(`Expected 3 ready applications, saw ${result.readyCount}.`);
    if (result.appliedCount !== "0") throw new Error(`Expected 0 applied before approval, saw ${result.appliedCount}.`);
    if (result.status !== "Ready") throw new Error(`Expected queue status Ready, saw ${result.status}.`);

    await page.click("[data-apply-approve-all]");
    result = await page.evaluate(() => ({
      appliedCards: [...document.querySelectorAll("[data-apply-job]")].filter((node) => node.dataset.status === "applied").length,
      appliedCount: document.querySelector("[data-apply-applied-count]")?.textContent?.trim(),
      status: document.querySelector("[data-apply-status-label]")?.textContent?.trim(),
    }));

    if (result.appliedCards !== 3) throw new Error(`Expected all cards applied, saw ${result.appliedCards}.`);
    if (result.appliedCount !== "3") throw new Error(`Expected applied count 3, saw ${result.appliedCount}.`);
    if (result.status !== "Applied") throw new Error(`Expected queue status Applied, saw ${result.status}.`);

    await page.fill('[data-apply-pilot-form] input[name="name"]', "Demo Tester");
    await page.fill('[data-apply-pilot-form] input[name="email"]', "demo@example.com");
    await page.fill('[data-apply-pilot-form] input[name="targetRole"]', "Customer Operations Lead");
    await page.fill('[data-apply-pilot-form] textarea[name="targetCompanies"]', "Northstar Health\nBrightDesk");
    await page.fill('[data-apply-pilot-form] textarea[name="jobLinks"]', "https://example.test/jobs/customer-ops-lead");
    await page.fill('[data-apply-pilot-form] input[name="locationRules"]', "Remote only");
    await page.fill('[data-apply-pilot-form] input[name="salaryTarget"]', "$95k+");
    await page.fill('[data-apply-pilot-form] textarea[name="mustHaves"]', "Customer operations ownership");
    await page.fill('[data-apply-pilot-form] textarea[name="dealbreakers"]', "Onsite five days");
    await page.fill('[data-apply-pilot-form] textarea[name="applicationNotes"]', "Keep tone direct and practical.");
    await page.check('[data-apply-pilot-form] input[name="consent"]');
    await page.check('[data-apply-pilot-form] input[name="resumeConsent"]');
    await page.check('[data-apply-pilot-form] input[name="approvalConsent"]');
    await page.click("text=Create pilot request");
    const pilot = await page.evaluate(() => ({
      stored: localStorage.getItem("proofresume:pilotRequest"),
      packet: JSON.parse(localStorage.getItem("proofresume:pilotIntakePacket") || "null"),
      copyDisabled: document.querySelector("[data-apply-copy-request]")?.disabled,
      downloadDisabled: document.querySelector("[data-apply-download-request]")?.disabled,
      status: document.querySelector("[data-apply-pilot-status]")?.textContent?.trim(),
    }));

    if (!pilot.stored?.includes("Customer Operations Lead")) throw new Error("Pilot request was not saved locally.");
    if (pilot.packet?.format !== "proofresume-pilot-intake-packet-v1") throw new Error("Pilot packet format was not saved.");
    if (pilot.packet?.customer?.email !== "demo@example.com") throw new Error("Pilot packet did not save customer email.");
    if (pilot.packet?.resume?.wordCount < 20) throw new Error("Pilot packet did not include resume summary.");
    if (pilot.packet?.search?.jobLinks?.length !== 1) throw new Error("Pilot packet did not save job links.");
    if (pilot.packet?.consent?.liveSendsRequireExplicitApproval !== true) throw new Error("Pilot packet did not save approval consent.");
    if (pilot.packet?.generatedQueue?.length !== 3) throw new Error("Pilot packet did not include generated queue.");
    if (pilot.copyDisabled) throw new Error("Copy request button stayed disabled.");
    if (pilot.downloadDisabled) throw new Error("Download packet button stayed disabled.");
    if (!pilot.status?.includes("Pilot packet created")) throw new Error(`Unexpected pilot status: ${pilot.status}`);

    if (consoleErrors.length || pageErrors.length) {
      throw new Error(`Browser errors during apply flow: ${consoleErrors.concat(pageErrors).join(" | ")}`);
    }

    console.log(JSON.stringify({ ok: true, baseUrl, result, pilotStatus: pilot.status }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

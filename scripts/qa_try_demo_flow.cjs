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
    await page.click("text=Try with sample data");
    await page.waitForURL(/target-job\.html\?demo=sample#target-job-workbench$/);

    const structuredOpen = await page.locator("[data-target-job-structured-profile]").evaluate((node) => node.open);
    if (structuredOpen) throw new Error("Try demo should keep advanced structured profile collapsed by default.");

    await page.locator("[data-target-job-output]").waitFor({ state: "visible" });

    const result = await page.evaluate(() => ({
      fitScore: document.querySelector("[data-target-job-fit-score]")?.textContent?.trim(),
      qualityScore: document.querySelector("[data-target-job-quality-score]")?.textContent?.trim(),
      summary: document.querySelector("[data-target-job-summary-line]")?.textContent?.trim(),
      outputVisible: !document.querySelector("[data-target-job-output]")?.hasAttribute("hidden"),
      downloadButtons: [
        "[data-target-job-download]",
        "[data-target-job-download-resume-md]",
        "[data-target-job-download-cover-letter-md]",
        "[data-target-job-download-application-bundle]",
      ].filter((selector) => document.querySelector(selector) && !document.querySelector(selector).disabled).length,
    }));

    if (!result.outputVisible) throw new Error("Application packet output did not become visible.");
    if (!/\/100$/.test(result.fitScore || "")) throw new Error(`Unexpected fit score: ${result.fitScore}`);
    if (!/\/100$/.test(result.qualityScore || "")) throw new Error(`Unexpected quality score: ${result.qualityScore}`);
    if (!result.summary || !result.summary.includes("Local pack generated")) throw new Error("Missing generated packet summary.");
    if (result.downloadButtons < 3) throw new Error(`Expected download actions to be enabled, got ${result.downloadButtons}.`);
    if (consoleErrors.length || pageErrors.length) {
      throw new Error(`Browser errors during try demo: ${consoleErrors.concat(pageErrors).join(" | ")}`);
    }

    console.log(JSON.stringify({ ok: true, baseUrl, result }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

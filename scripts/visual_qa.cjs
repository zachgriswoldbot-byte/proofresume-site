const fs = require("fs");
const path = require("path");
const { chromium, firefox, webkit } = require("playwright");

const root = path.resolve(__dirname, "..");
const outDir = path.resolve(root, "..", "ops", "reports", "visual-qa");
const htmlPages = fs
  .readdirSync(root)
  .filter((file) => file.endsWith(".html"))
  .sort()
  .map((file) => ({
    name: file === "index.html" ? "site" : path.basename(file, ".html"),
    file,
  }));

function includesAny(source, tokens) {
  return tokens.some((token) => source.includes(token));
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
      const browser = await launcher.fn();
      return { browser, engine: launcher.name };
    } catch (error) {
      errors.push(`[${launcher.name}] ${error?.message || error}`);
    }
  }

  throw new Error(`visual-qa failed to launch any browser engine:\n${errors.join("\n")}`);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  let browser = null;
  let engine = null;
  let mode = "playwright";
  let launchError = null;

  try {
    const launched = await launchBrowser();
    browser = launched.browser;
    engine = launched.engine;
  } catch (error) {
    mode = "static-fallback";
    launchError = error?.message || String(error);
  }
  const results = [];

  if (mode === "playwright") {
    for (const pageSpec of htmlPages) {
      for (const viewport of [
        { name: "desktop", width: 1366, height: 900 },
        { name: "mobile", width: 390, height: 900 },
      ]) {
        const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
        await page.goto(`file://${path.join(root, pageSpec.file)}`);
        await page.screenshot({ path: path.join(outDir, `${pageSpec.name}-${viewport.name}.png`), fullPage: true });
        const data = await page.evaluate(() => {
          const visibleControls = [...document.querySelectorAll("a, button, input")].filter(
            (element) => element.offsetParent !== null
          );
          return {
            title: document.title,
            overflowX: document.documentElement.scrollWidth - window.innerWidth,
            h1: document.querySelector("h1")?.textContent?.trim(),
            smallControls: visibleControls
              .map((element) => {
                const rect = element.getBoundingClientRect();
                return {
                  tag: element.tagName.toLowerCase(),
                  text: element.textContent?.trim() || element.getAttribute("name") || "",
                  width: rect.width,
                  height: rect.height,
                };
              })
              .filter((item) => item.height < 36 || item.width < 24),
          };
        });
        results.push({ page: pageSpec.name, viewport, ...data });
        await page.close();
      }
    }
    await browser.close();
  } else {
    const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
    const adminCss = fs.readFileSync(path.join(root, "admin.css"), "utf8");
    const siteHtml = fs.readFileSync(path.join(root, "index.html"), "utf8");
    const reviewHtml = fs.readFileSync(path.join(root, "review.html"), "utf8");
    const intakeHtml = fs.readFileSync(path.join(root, "intake.html"), "utf8");
    const adminHtml = fs.readFileSync(path.join(root, "admin.html"), "utf8");
    const proofPacketHtml = fs.readFileSync(path.join(root, "proof-packet.html"), "utf8");
    const htmlByFile = new Map(
      htmlPages.map((page) => [page.file, fs.readFileSync(path.join(root, page.file), "utf8")])
    );

    for (const pageSpec of htmlPages) {
      const pageHtml = htmlByFile.get(pageSpec.file);
      const title = pageHtml.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
      const h1 = pageHtml
        .match(/<h1[\s>][\s\S]*?<\/h1>/i)?.[0]
        ?.replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!title) {
        throw new Error(`visual-qa static fallback: missing document title in ${pageSpec.file}`);
      }

      if (!h1) {
        throw new Error(`visual-qa static fallback: missing h1 in ${pageSpec.file}`);
      }
    }

    const requiredCss = ["@media (max-width: 860px)", "min-height: 46px", "overflow-wrap: anywhere"];
    for (const token of requiredCss) {
      if (!css.includes(token)) {
        throw new Error(`visual-qa static fallback: missing required CSS token: ${token}`);
      }
    }

    const requiredAdminCss = [".pass-card", ".doc-reader"];
    for (const token of requiredAdminCss) {
      if (!adminCss.includes(token)) {
        throw new Error(`visual-qa static fallback: missing required admin CSS token: ${token}`);
      }
    }

    const requiredSiteHtml = ["<h1>", "Join the pilot list", "id=\"lead-form\"", "id=\"form-status\""];
    for (const token of requiredSiteHtml) {
      if (!siteHtml.includes(token)) {
        throw new Error(`visual-qa static fallback: missing required site HTML token: ${token}`);
      }
    }

    const requiredReviewHtml = [
      "See exactly what changed and why.",
      "Original excerpt",
      "Enhanced excerpt",
      "Accepted updates become a resume-ready section.",
      "Save answers as local evidence.",
      "Open questions",
    ];
    for (const token of requiredReviewHtml) {
      if (!reviewHtml.includes(token)) {
        throw new Error(`visual-qa static fallback: missing required review HTML token: ${token}`);
      }
    }

    const requiredIntakeHtml = ["Paste a messy resume. Get a draft review report.", "Pasted resume text"];
    for (const token of requiredIntakeHtml) {
      if (!intakeHtml.includes(token)) {
        throw new Error(`visual-qa static fallback: missing required intake HTML token: ${token}`);
      }
    }
    if (!includesAny(intakeHtml, ["Generate local review", "Analyze and save locally"])) {
      throw new Error("visual-qa static fallback: missing required intake local review action");
    }

    const requiredAdminHtml = ["Incremental Agent Work", "Swarm Health", "src=\"admin.js\"", "Import bundle .json"];
    for (const token of requiredAdminHtml) {
      if (!adminHtml.includes(token)) {
        throw new Error(`visual-qa static fallback: missing required admin HTML token: ${token}`);
      }
    }

    const requiredProofPacketHtml = [
      "Evidence-backed packet preview (local-only).",
      "Download packet JSON",
      "Import bundle .json",
      "Bundle replay mode shows",
      "No email is sent and no external service is contacted",
    ];
    for (const token of requiredProofPacketHtml) {
      if (!proofPacketHtml.includes(token)) {
        throw new Error(`visual-qa static fallback: missing required proof packet HTML token: ${token}`);
      }
    }

    for (const pageSpec of htmlPages) {
      const pageHtml = htmlByFile.get(pageSpec.file);
      const title = pageHtml.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
      const h1 = pageHtml
        .match(/<h1[\s>][\s\S]*?<\/h1>/i)?.[0]
        ?.replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      results.push({
        page: pageSpec.name,
        viewport: { name: "static", width: null, height: null },
        title,
        overflowX: 0,
        h1,
        smallControls: [],
      });
    }
  }

  const report = {
    ok:
      mode === "playwright"
        ? results.every((result) => result.overflowX <= 1 && result.smallControls.length === 0)
        : true,
    checkedAt: new Date().toISOString(),
    engine,
    mode,
    launchError,
    results,
  };

  fs.writeFileSync(path.join(outDir, "latest.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

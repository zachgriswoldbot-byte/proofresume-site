import { defineConfig } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function devLeadCapture() {
  const filename = fileURLToPath(import.meta.url);
  const websiteDir = path.dirname(filename);
  const repoRoot = path.resolve(websiteDir, "..");
  const leadsFile = path.join(repoRoot, "data", "leads", "dev-leads.jsonl");
  const paidReviewIntentsFile = path.join(repoRoot, "data", "paid-review-intents", "dev-paid-review-intents.jsonl");
  const businessControlsFile = path.join(repoRoot, "ops", "BUSINESS_CONTROLS.json");
  const synthesisDecisionMemosFile = path.join(
    repoRoot,
    "data",
    "synthesis-decision-memos",
    "synthesis-decision-memos.jsonl"
  );

  return {
    name: "proofresume-dev-lead-capture",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method === "GET" && String(req.url || "").split("?")[0] === "/ops/BUSINESS_CONTROLS.json") {
          try {
            const payload = await fs.promises.readFile(businessControlsFile, "utf8");
            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(payload);
          } catch (error) {
            res.statusCode = 404;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ok: false, error: "Missing ops/BUSINESS_CONTROLS.json" }));
            server.config.logger.error(`[business-controls] ${error?.stack || error}`);
          }
          return;
        }

        const postUrl = String(req.url || "").split("?")[0];
        const localPostRoutes = new Set(["/api/dev-lead", "/api/dev-paid-review-intent", "/api/synthesis-decision-memo"]);
        if (req.method !== "POST" || !localPostRoutes.has(postUrl)) {
          next();
          return;
        }

        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const rawBody = Buffer.concat(chunks).toString("utf8");
          const payload = JSON.parse(rawBody || "{}");

          if (postUrl === "/api/dev-lead") {
            const lead = {
              name: String(payload?.name || "").trim(),
              email: String(payload?.email || "").trim(),
              targetRole: String(payload?.targetRole || "").trim(),
              capturedAt: String(payload?.capturedAt || new Date().toISOString()),
              source: String(payload?.source || "local-prototype"),
            };

            if (!lead.name || !lead.email) {
              res.statusCode = 400;
              res.setHeader("content-type", "application/json");
              res.end(JSON.stringify({ ok: false, error: "Missing name or email." }));
              return;
            }

            await fs.promises.mkdir(path.dirname(leadsFile), { recursive: true });
            await fs.promises.appendFile(leadsFile, `${JSON.stringify(lead)}\n`, "utf8");

            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ok: true }));
            return;
          }

          if (postUrl === "/api/dev-paid-review-intent") {
            const controlsPayload = JSON.parse(await fs.promises.readFile(businessControlsFile, "utf8"));
            const paymentControl = (controlsPayload.controls || []).find((control) => control.id === "payment_collection");
            const paymentUnlockRequired = String(paymentControl?.requiredEvidenceToEnable?.[0] || "payment provider or payment-link access");

            if (paymentControl?.status !== "setup_needed") {
              res.statusCode = 409;
              res.setHeader("content-type", "application/json");
              res.end(
                JSON.stringify({
                  ok: false,
                  error: "Local paid-review interest capture is available only while payment_collection is setup_needed.",
                })
              );
              return;
            }

            const intent = {
              capturedAt: String(payload?.capturedAt || new Date().toISOString()),
              source: "local-paid-review-interest",
              offer: "proof-packet",
              controlSource: "ops/BUSINESS_CONTROLS.json",
              paymentControlStatus: paymentControl.status,
              paymentUnlockRequired,
              localOnly: true,
              paymentProcessed: false,
              note: "Local paid-review interest only. No checkout, card data, payment link, outbound send, analytics event, external service, or resume text was contacted or captured.",
            };

            await fs.promises.mkdir(path.dirname(paidReviewIntentsFile), { recursive: true });
            await fs.promises.appendFile(paidReviewIntentsFile, `${JSON.stringify(intent)}\n`, "utf8");

            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ok: true, localOnly: true }));
            return;
          }

          const memo = {
            memoState: String(payload?.memoState || payload?.state || "").trim(),
            reviewedDecision: String(payload?.reviewedDecision || "").trim(),
            evidenceConfidence: String(payload?.evidenceConfidence || "").trim(),
            publicChangeGuard: String(payload?.publicChangeGuard || "").trim(),
            operatorNotes: String(payload?.operatorNotes || "").trim(),
            memoText: String(payload?.memoText || "").trim(),
            artifactPath: String(payload?.artifactPath || "").trim(),
            selectedDraftId: String(payload?.selectedDraftId || "").trim(),
            sourceArtifactGeneratedAt: String(payload?.sourceArtifactGeneratedAt || "").trim(),
            sourcePacketCount: Number(payload?.sourcePacketCount || 0),
            requiredPacketCount: Number(payload?.requiredPacketCount || 0),
            capturedAt: String(payload?.capturedAt || payload?.updatedAt || new Date().toISOString()),
            source: String(payload?.source || "local-private-synthesis-decision-memo-capture"),
            localOnly: true,
            private: true,
            exportEligible: false,
            downloadEligible: false,
            exportTextUnchanged: true,
            downloadTextUnchanged: true,
            publicProductCopyUnchanged: true,
            conclusionGuard: String(
              payload?.conclusionGuard ||
                "No public launch, pricing, testimonial, willingness-to-pay, demand, or outcome conclusion is approved by this local memo."
            ),
          };

          if (!memo.selectedDraftId) {
            res.statusCode = 400;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ok: false, error: "Missing selectedDraftId." }));
            return;
          }

          await fs.promises.mkdir(path.dirname(synthesisDecisionMemosFile), { recursive: true });
          await fs.promises.appendFile(synthesisDecisionMemosFile, `${JSON.stringify(memo)}\n`, "utf8");

          res.statusCode = 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ ok: true }));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              ok: false,
              error:
                postUrl === "/api/synthesis-decision-memo"
                  ? "Failed to save synthesis decision memo."
                  : postUrl === "/api/dev-paid-review-intent"
                    ? "Failed to save dev paid-review intent."
                    : "Failed to save dev lead.",
            })
          );
          server.config.logger.error(`[local-capture] ${error?.stack || error}`);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [devLeadCapture()],
});

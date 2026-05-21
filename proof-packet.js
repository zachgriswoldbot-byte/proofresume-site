function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseQuery() {
  try {
    const url = new URL(window.location.href);
    return { intakeId: url.searchParams.get("intake"), bundleId: url.searchParams.get("bundle") };
  } catch {
    return { intakeId: null, bundleId: null };
  }
}

const EXPORT_BUNDLES_STORAGE_KEY = "proofresume:exportBundles";

function setText(node, value) {
  if (!node) return;
  node.textContent = String(value ?? "");
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function loadIntakeById(intakeId) {
  if (!intakeId) return null;
  try {
    const raw = localStorage.getItem("proofresume:intakes");
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return null;
    return parsed.find((item) => item && item.id === intakeId) || null;
  } catch {
    return null;
  }
}

function loadAllExportBundles(storageKey = EXPORT_BUNDLES_STORAGE_KEY) {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAllExportBundles(bundles, storageKey = EXPORT_BUNDLES_STORAGE_KEY) {
  const next = Array.isArray(bundles) ? bundles.slice(0, 20) : [];
  localStorage.setItem(storageKey, JSON.stringify(next));
}

function loadExportBundleById(bundleId, storageKey = EXPORT_BUNDLES_STORAGE_KEY) {
  if (!bundleId) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return null;
    const found = parsed.find((item) => item && item.id === bundleId) || null;
    const snapshot = found?.snapshot && typeof found.snapshot === "object" ? found.snapshot : null;
    if (!snapshot || snapshot.format !== "proofresume-local-section-v1") return null;
    return snapshot;
  } catch {
    return null;
  }
}

function saveExportBundleSnapshot(snapshot, storageKey = EXPORT_BUNDLES_STORAGE_KEY) {
  const safe = snapshot && typeof snapshot === "object" ? snapshot : null;
  if (!safe || safe.format !== "proofresume-local-section-v1") return null;
  const now = new Date().toISOString();
  const id = randomId("bundle");
  const bundles = loadAllExportBundles(storageKey);
  const next = [
    { id, importedAt: now, updatedAt: now, format: safe.format, snapshot: safe, localOnly: true, source: "imported-json" },
    ...bundles,
  ];
  saveAllExportBundles(next, storageKey);
  return id;
}

function downloadHrefForJson(value) {
  const json = JSON.stringify(value, null, 2);
  return `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
}

function packetSourceBoundaryWarnings(summary, shareReadiness) {
  const safeSummary = summary && typeof summary === "object" ? summary : {};
  const safeReadiness = shareReadiness && typeof shareReadiness === "object" ? shareReadiness : {};
  const excluded = safeSummary.excludedFromPacket || {};
  const warnings = [
    "Packet manifest is packet-only metadata and does not alter resume export text.",
    "Proof Packet is local-only until you choose to share the downloaded packet.",
  ];

  if (Number(safeReadiness.openSourceExcerpts || 0) > 0) {
    warnings.push("One or more source excerpts remain visible; review redactions before sharing.");
  }

  if (Number(safeReadiness.openFollowupSourceNotes || 0) > 0) {
    warnings.push("One or more raw follow-up notes remain visible; review redactions before sharing.");
  }

  if (Number(excluded.rejected || 0) + Number(excluded.pending || 0) + Number(excluded.excluded || 0) > 0) {
    warnings.push("Rejected, pending, and excluded evidence is omitted from this packet.");
  }

  if (Number(safeSummary.redactedSourceExcerpts || 0) + Number(safeSummary.redactedFollowupSourceNotes || 0) > 0) {
    warnings.push("Redacted source text is intentionally hidden from packet preview, download, and saved packet metadata.");
  }

  return warnings;
}

function packetManifestSummary(packet) {
  const summary = packet?.summary && typeof packet.summary === "object" ? packet.summary : {};
  const readiness = packet?.shareReadiness && typeof packet.shareReadiness === "object" ? packet.shareReadiness : {};
  const redactedSourceExcerpts = Number(summary.redactedSourceExcerpts || 0);
  const redactedFollowupSourceNotes = Number(summary.redactedFollowupSourceNotes || 0);
  const acceptedBulletCount = Number(summary.acceptedBullets || readiness.acceptedOnly || 0);
  const existing = packet?.manifestSummary && typeof packet.manifestSummary === "object" ? packet.manifestSummary : null;

  return existing || {
    format: "proofresume-proof-packet-manifest-summary-v1",
    shareReadiness: {
      status: readiness.status || (acceptedBulletCount ? "Review before sharing" : "No packet yet"),
      acceptedOnly: acceptedBulletCount,
      restoreAvailable: Boolean(readiness.restoreAvailable),
      localOnly: true,
    },
    redactionCounts: {
      sourceExcerpts: redactedSourceExcerpts,
      followupSourceNotes: redactedFollowupSourceNotes,
      total: redactedSourceExcerpts + redactedFollowupSourceNotes,
      openSourceExcerpts: Number(readiness.openSourceExcerpts || 0),
      openFollowupSourceNotes: Number(readiness.openFollowupSourceNotes || 0),
    },
    acceptedBulletCount,
    sourceBoundaryWarnings: packetSourceBoundaryWarnings(summary, readiness),
  };
}

function packetDownloadValue(snapshot) {
  const stored = snapshot?.proofPacketSnapshot && typeof snapshot.proofPacketSnapshot === "object" ? snapshot.proofPacketSnapshot : null;
  const storedPacket = stored?.packet && typeof stored.packet === "object" ? stored.packet : null;
  const packet =
    storedPacket ||
    (snapshot?.proofPacketPreview && typeof snapshot.proofPacketPreview === "object" ? snapshot.proofPacketPreview : {});
  return {
    ...packet,
    format: packet.format || "proofresume-local-proof-packet-preview-v1",
    generatedFromSnapshot: packet.generatedFromSnapshot || snapshot?.updatedAt || null,
    exportTextUnchanged: packet?.exportTextUnchanged !== false,
    claimRiskChecklist: snapshot?.claimRiskChecklist || null,
    manifestSummary: packetManifestSummary(packet),
  };
}

function findClaimRiskEntry(snapshot, sectionHeading, acceptedItem) {
  const list = snapshot?.claimRiskChecklist?.items;
  if (!Array.isArray(list)) return null;
  const text = String(acceptedItem?.text || "").trim();
  const sourceExcerpt = String(acceptedItem?.sourceExcerpt || "").trim();
  const section = String(sectionHeading || "").trim();
  return (
    list.find(
      (entry) =>
        String(entry?.section || "").trim() === section &&
        String(entry?.text || "").trim() === text &&
        String(entry?.sourceExcerpt || "").trim() === sourceExcerpt
    ) || null
  );
}

function renderPacket(snapshot, intakeId, bundleId) {
  const body = document.querySelector("[data-pr='packetBody']");
  const modeNode = document.querySelector("[data-pr='packetMode']");
  const modeNoteNode = document.querySelector("[data-pr='packetModeNote']");
  const subtitle = document.querySelector("[data-pr='packetSubtitle']");
  const acceptedCountNode = document.querySelector("[data-pr='packetAccepted']");
  const sectionCountNode = document.querySelector("[data-pr='packetSections']");
  const riskCountNode = document.querySelector("[data-pr='packetRisks']");
  const statusNode = document.querySelector("[data-pr='packetStatus']");
  const downloadLink = document.querySelector("[data-pr='downloadPacket']");
  const backToReview = document.querySelector("[data-pr='backToReview']");

  if (backToReview) {
    if (bundleId) {
      backToReview.setAttribute("href", `/review.html?bundle=${encodeURIComponent(bundleId)}`);
      backToReview.textContent = "Return to review (bundle replay)";
      backToReview.setAttribute("data-proofresume-bundle-replay-nav", "true");
    } else if (intakeId) {
      backToReview.setAttribute("href", `/review.html?intake=${encodeURIComponent(intakeId)}`);
      backToReview.textContent = "Return to review";
      backToReview.removeAttribute("data-proofresume-bundle-replay-nav");
    }
  }

  if (!body) return;

  if (!snapshot || typeof snapshot !== "object" || snapshot.format !== "proofresume-local-section-v1") {
    if (statusNode) statusNode.textContent = "Missing snapshot";
    body.innerHTML = `
      <p class="report-note">
        This intake does not have a saved local export snapshot yet.
        Open the review page, accept at least one candidate update, then click <strong>Save local export</strong>.
      </p>
      <div class="hero-actions">
        <a class="primary-action" href="/intake.html">Open intake</a>
        ${intakeId ? `<a class="secondary-action" href="/review.html?intake=${encodeURIComponent(intakeId)}">Open review</a>` : ""}
      </div>
    `;
    if (downloadLink) downloadLink.setAttribute("aria-disabled", "true");
    return;
  }

  const accepted = Array.isArray(snapshot.accepted) ? snapshot.accepted : [];
  const sections = Array.isArray(snapshot.sections) ? snapshot.sections : [];
  const riskSummary = snapshot?.claimRiskChecklist?.summary || {};
  const riskCount = Number(riskSummary.flagCount || 0);
  const packetSummary = snapshot?.proofPacketPreview?.summary || {};
  const shareReadiness = snapshot?.proofPacketPreview?.shareReadiness || {};
  const manifestSummary = packetManifestSummary(snapshot?.proofPacketPreview || {});
  const redactedSourceCount = Number(packetSummary.redactedSourceExcerpts || 0);
  const redactedFollowupCount = Number(packetSummary.redactedFollowupSourceNotes || 0);

  if (modeNode) {
    if (bundleId) modeNode.textContent = "Proof packet (bundle replay)";
    else if (intakeId) modeNode.textContent = "Proof packet (local draft)";
    else modeNode.textContent = "Proof packet";
  }

  if (modeNoteNode) {
    if (bundleId) {
      modeNoteNode.textContent = "Bundle replay: this view is generated from a locally imported snapshot (no external calls).";
    } else if (intakeId) {
      modeNoteNode.textContent = "Local draft: this view is generated from the current intake snapshot saved in this browser.";
    } else {
      modeNoteNode.textContent =
        "Load an intake (or import a bundle) to preview a ProofResume proof packet. This mode is always local-only.";
    }
  }

  if (subtitle) {
    const updatedAt = snapshot.updatedAt ? new Date(snapshot.updatedAt).toLocaleString() : "an unknown time";
    subtitle.textContent = `Generated locally from your accepted updates. Snapshot updated ${updatedAt}.`;
  }

  if (statusNode) statusNode.textContent = shareReadiness.status || "Local-only";
  if (acceptedCountNode) acceptedCountNode.textContent = String(accepted.length);
  if (sectionCountNode) sectionCountNode.textContent = String(sections.length);
  if (riskCountNode) riskCountNode.textContent = String(riskCount);

  if (downloadLink) {
    downloadLink.setAttribute("href", downloadHrefForJson(packetDownloadValue(snapshot)));
    downloadLink.setAttribute("download", `proofresume-proof-packet-${bundleId || intakeId || "local"}.json`);
    downloadLink.setAttribute("aria-disabled", "false");
  }

  const followupEvidence = snapshot?.followups?.evidenceItems;
  const followups = Array.isArray(followupEvidence) ? followupEvidence : [];

  body.innerHTML = `
    <div class="approval-meta">
      <span class="status-pill is-approved">Accepted</span>
      <span>${escapeHtml(accepted.length)} bullet${accepted.length === 1 ? "" : "s"}</span>
      <span>${escapeHtml(riskCount)} claim risk${riskCount === 1 ? "" : "s"}</span>
      <span>${escapeHtml(redactedSourceCount)} source excerpt${redactedSourceCount === 1 ? "" : "s"} redacted</span>
      <span>${escapeHtml(redactedFollowupCount)} follow-up note${redactedFollowupCount === 1 ? "" : "s"} redacted</span>
      <span>Format: ${escapeHtml(snapshot.format)}</span>
    </div>
    <div class="proof-packet-readiness" data-proof-packet-share-readiness="${escapeHtml(JSON.stringify(shareReadiness))}">
      <div>
        <span class="status-pill is-pending">${escapeHtml(shareReadiness.status || "Review before sharing")}</span>
        <strong>Share-readiness status</strong>
      </div>
      <p>
        Redaction coverage: ${escapeHtml(redactedSourceCount)} of ${escapeHtml(packetSummary.provenanceItems || 0)} source excerpt${
          Number(packetSummary.provenanceItems || 0) === 1 ? "" : "s"
        } and ${escapeHtml(redactedFollowupCount)} of ${escapeHtml(packetSummary.followupSourceNotes || 0)} raw follow-up note${
          Number(packetSummary.followupSourceNotes || 0) === 1 ? "" : "s"
        } hidden.
      </p>
      <p>
        Packet download is accepted-only: ${escapeHtml(packetSummary.acceptedBullets || accepted.length)} accepted bullet${
          Number(packetSummary.acceptedBullets || accepted.length) === 1 ? "" : "s"
        } included. Rejected (${escapeHtml(packetSummary.excludedFromPacket?.rejected || 0)}), pending (${escapeHtml(
          packetSummary.excludedFromPacket?.pending || 0
        )}), and excluded (${escapeHtml(packetSummary.excludedFromPacket?.excluded || 0)}) items stay out.
      </p>
      <p>Use the review page restore-all-redactions control before downloading if you want source excerpts and raw follow-up notes visible again.</p>
    </div>
    <div class="proof-packet-manifest" data-proof-packet-manifest-summary="${escapeHtml(JSON.stringify(manifestSummary))}">
      <div class="proof-packet-manifest-head">
        <span class="status-pill is-pending">JSON manifest</span>
        <strong>Packet summary</strong>
      </div>
      <dl class="proof-packet-manifest-grid">
        <div>
          <dt>Share-readiness</dt>
          <dd>${escapeHtml(manifestSummary.shareReadiness.status)}</dd>
        </div>
        <div>
          <dt>Accepted bullets</dt>
          <dd>${escapeHtml(manifestSummary.acceptedBulletCount)}</dd>
        </div>
        <div>
          <dt>Source redactions</dt>
          <dd>${escapeHtml(manifestSummary.redactionCounts.sourceExcerpts)}</dd>
        </div>
        <div>
          <dt>Follow-up redactions</dt>
          <dd>${escapeHtml(manifestSummary.redactionCounts.followupSourceNotes)}</dd>
        </div>
      </dl>
      <strong>Source-boundary warnings</strong>
      <ul class="proof-packet-manifest-warnings">
        ${manifestSummary.sourceBoundaryWarnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}
      </ul>
    </div>
    <div class="export-grouping-rationale">
      ${sections
        .map((section) => {
          const heading = section?.heading || "EXPERIENCE";
          const items = Array.isArray(section?.accepted) ? section.accepted : [];
          const reasons = section?.groupingRationale?.reasons;
          const reasonText = Array.isArray(reasons) && reasons.length ? reasons.join(" ") : "Grouped from local source-section and target-role signals.";
          return `
            <article class="export-rationale-card" data-proof-packet-section="${escapeHtml(heading)}">
              <div class="approval-meta">
                <span class="status-pill is-pending">Section</span>
                <span>${escapeHtml(heading)}</span>
                <span>Default: ${escapeHtml(section?.defaultHeading || heading)}</span>
              </div>
              <p>${escapeHtml(reasonText)}</p>
              <ol class="export-bullet-list">
                ${items
                  .map((item) => {
                    const entry = findClaimRiskEntry(snapshot, heading, item);
                    const flags = Array.isArray(entry?.flags) && entry.flags.length ? entry.flags : [];
                    const flagPills = flags.length
                      ? flags
                          .map((flag) => `<span class="status-pill is-${escapeHtml(flag.severity)}">${escapeHtml(flag.label)}</span>`)
                          .join(" ")
                      : `<span class="status-pill is-low">No obvious risk</span>`;
                    return `
                      <li class="export-bullet-item">
                        <p>${escapeHtml(item?.text || "")}</p>
                        <div class="approval-meta">
                          <span class="status-pill ${String(item?.evidenceStatus || "").includes("Approved") ? "is-approved" : "is-unapproved"}">${escapeHtml(
                            item?.evidenceStatus || "Unapproved"
                          )}</span>
                          <span>${escapeHtml(item?.source || "Pasted intake text")}</span>
                        </div>
                        <div class="export-bullet-rationale">
                          <strong>Source excerpt:</strong>
                          <span>${escapeHtml(item?.sourceExcerpt || "No excerpt stored.")}</span>
                          ${
                            item?.sourceExcerptRedacted
                              ? `<span class="status-pill is-excluded">Redacted locally</span>`
                              : ""
                          }
                        </div>
                        <div class="export-bullet-rationale">
                          <strong>Claim risk:</strong>
                          <span>${flagPills}</span>
                        </div>
                      </li>
                    `;
                  })
                  .join("")}
              </ol>
            </article>
          `;
        })
        .join("")}
    </div>
    <div class="claim-risk-checklist">
      <div class="section-head" style="padding: 0; border: 0; margin-top: 30px;">
        <p class="eyebrow">Follow-up evidence</p>
        <h3>Saved answers and provenance.</h3>
        <p class="report-note">Follow-ups stay out of export until explicitly approved.</p>
      </div>
      ${
        followups.length
          ? `<ol class="claim-risk-list" data-proof-packet-followups>
              ${followups
                .map((item) => {
                  const eligible = Boolean(item?.exportEligible);
                  const pillClass = eligible ? "is-approved" : "is-unapproved";
                  return `<li class="claim-risk-item is-${eligible ? "low" : "medium"}">
                    <div class="claim-risk-copy">
                      <div class="approval-meta">
                        <span class="status-pill ${pillClass}">${escapeHtml(item?.evidenceStatus || "")}</span>
                        <span>${escapeHtml(item?.source || "Saved follow-up answer")}</span>
                      </div>
                      <p>${escapeHtml(item?.resumeText || "(Not approved for export yet.)")}</p>
                      <small>Source excerpt: ${escapeHtml(item?.sourceExcerpt || "")}</small>
                      ${item?.redacted ? `<span class="status-pill is-excluded">Redacted locally</span>` : ""}
                    </div>
                  </li>`;
                })
                .join("")}
            </ol>`
          : `<p class="report-note">No follow-up answers saved for this intake yet.</p>`
      }
    </div>
  `;
}

function main() {
  const { intakeId, bundleId } = parseQuery();

  const importStatus = document.querySelector("[data-pr='importExportBundleStatus']");
  const importButtons = Array.from(document.querySelectorAll("button[data-pr='importExportBundle']"));

  importButtons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) return;
    const fileInput = button.nextElementSibling instanceof HTMLInputElement ? button.nextElementSibling : null;
    if (!fileInput) return;

    button.addEventListener("click", () => {
      fileInput.value = "";
      fileInput.click();
    });

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
      if (!file) return;
      if (!file.type || file.type === "application/json" || file.name.toLowerCase().endsWith(".json")) {
        // ok
      }
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || parsed.format !== "proofresume-local-section-v1") {
          setText(importStatus, "Import failed: expected a ProofResume export snapshot bundle JSON (format proofresume-local-section-v1).");
          return;
        }
        const nextBundleId = saveExportBundleSnapshot(parsed);
        if (!nextBundleId) {
          setText(importStatus, "Import failed: unable to store bundle snapshot locally.");
          return;
        }
        window.location.assign(`/proof-packet.html?bundle=${encodeURIComponent(nextBundleId)}`);
      } catch (error) {
        setText(importStatus, `Import failed: ${error instanceof Error ? error.message : "Unable to parse JSON."}`);
      }
    });
  });

  const intake = loadIntakeById(intakeId);
  const bundleSnapshot = loadExportBundleById(bundleId);
  const snapshot = bundleSnapshot || intake?.exportSnapshot || null;
  renderPacket(snapshot, intakeId, bundleId);
}

main();

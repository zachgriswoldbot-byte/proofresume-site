#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { runAllContracts } = require("./target_job_contracts.cjs");

const defaultInputPath = path.resolve(__dirname, "..", "fixtures", "target-job-contract-input.json");

function usage() {
  return [
    "Usage: node website/scripts/score_target_job_contracts.cjs [input.json]",
    "",
    "Entrypoint: score_target_job_contracts.cjs",
    "target_job_contracts.cjs is the import-only local contract library.",
    "Reads a local target-job contract input JSON file and prints proofresume-target-job-local-contract-result-v1 JSON.",
  ].join("\n");
}

function readInput(inputPath) {
  const source = fs.readFileSync(inputPath, "utf8");
  const parsed = JSON.parse(source);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Input JSON must be an object.");
  }
  return parsed;
}

function installNetworkGuard() {
  const networkCalls = [];
  const blocked = (api) =>
    function blockedNetwork(target) {
      networkCalls.push({ api, target: typeof target === "string" ? target : "" });
      throw new Error("Network access is blocked in score_target_job_contracts.cjs");
    };

  globalThis.fetch = blocked("fetch");
  globalThis.XMLHttpRequest = blocked("XMLHttpRequest");
  const guardedNavigator = { sendBeacon: blocked("navigator.sendBeacon") };
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: guardedNavigator,
    });
  } catch (error) {
    globalThis.navigator = guardedNavigator;
  }

  return networkCalls;
}

function main() {
  const arg = process.argv[2];
  if (arg === "-h" || arg === "--help") {
    console.log(usage());
    return;
  }

  const networkCalls = installNetworkGuard();
  const inputPath = path.resolve(process.cwd(), arg || defaultInputPath);
  const input = readInput(inputPath);
  const result = {
    ...runAllContracts(input),
    inputPath,
    networkCalls,
  };
  console.log(JSON.stringify(result, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error && error.message ? error.message : String(error) }, null, 2));
  process.exit(1);
}

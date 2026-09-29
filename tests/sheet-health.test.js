"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const https = require("node:https");
const fs = require("node:fs");
const vm = require("node:vm");

test("Sheet reads retry transient errors, preserve last success, flag stale data and redact diagnostics", async () => {
  const saved = { ...process.env };
  const originalRequest = https.request;
  const originalError = console.error;
  const messages = [];
  const responses = [];
  let calls = 0;
  const methods = [];
  const modulePath = require.resolve("../src/sheet");
  try {
    process.env.SHEET_WEBAPP_URL = "https://example.invalid/exec";
    process.env.SHEET_TOKEN = "secret-never-log";
    process.env.SHEET_REQUEST_TIMEOUT_MS = "25";
    console.error = m => messages.push(m);
    https.request = (_, options, callback) => {
      calls++;
      methods.push(options.method || "GET");
      const req = new EventEmitter();
      req.write = () => {};
      req.destroy = error => req.emit("error", error);
      req.end = () => setImmediate(() => {
        const next = responses.shift();
        assert.ok(next, "unexpected extra request");
        const res = new EventEmitter();
        res.setEncoding = () => {};
        res.statusCode = next.status || 200;
        res.headers = { "content-type": next.type || "application/json", ...next.headers };
        callback(res);
        if (next.aborted) { res.emit("aborted"); return; }
        res.emit("data", next.body);
        res.emit("end");
      });
      return req;
    };
    delete require.cache[modulePath];
    const sheet = require("../src/sheet");
    const success = { body: JSON.stringify({ ok: true, jobs: [{ biz_ref: "D1" }] }) };
    assert.equal(sheet.sheetHealth().status, "checking");
    responses.push({ status: 503, type: "text/html", body: "<html>secret-never-log private job</html>" }, success);
    assert.equal((await sheet.fetchSheetJobs({ all: "1" })).length, 1);
    assert.equal(calls, 2);
    const redirect = { status: 302, headers: { location: "https://example.invalid/content" }, body: "" };
    responses.push(redirect, redirect, redirect, success);
    assert.equal((await sheet.fetchSheetJobs({ all: "1" })).length, 1, "three redirects must reach JSON");
    const writeStart = methods.length;
    responses.push(redirect, redirect, redirect, { body: '{"ok":true}' });
    assert.equal(await sheet.pushStationUpdateConfirmed(
      { source_tab: "SEPTEMBER-2026", biz_ref: "D1" }, [{ field: "s4", to: "DONE" }]
    ), true);
    assert.deepEqual(methods.slice(writeStart), ["POST", "GET", "GET", "GET"], "redirects must not replay writes");
    responses.push({ body: JSON.stringify({ ok: true, capabilities: ["station_update"] }) });
    await sheet.fetchSheetCapabilities();
    assert.equal(sheet.sheetHealth().status, "ready");
    assert.equal(sheet.sheetHealth(Date.now() + 16 * 60e3).status, "stale");
    const lastSuccess = sheet.sheetHealth().fullRead.lastSuccessAt;
    responses.push({ body: "" }, { body: "<!DOCTYPE html>private job" });
    assert.deepEqual(await sheet.fetchSheetJobs({ all: "1" }), []);
    assert.equal(sheet.sheetHealth().status, "degraded");
    assert.equal(sheet.sheetHealth().fullRead.lastSuccessAt, lastSuccess);
    assert.match(sheet.sheetHealth().fullRead.lastError, /HTML\/XML/);
    responses.push({ aborted: true }, success);
    await sheet.fetchSheetJobs({ all: "1" });
    assert.equal(sheet.sheetHealth().status, "ready");
    const before = calls;
    responses.push({ status: 403, body: "Forbidden secret-never-log" });
    assert.equal(await sheet.fetchSheetCapabilities(), null);
    assert.equal(calls - before, 1, "do not retry permanent HTTP rejection");
    responses.push({ body: JSON.stringify({ ok: false, error: "bad token secret-never-log" }) });
    assert.equal(await sheet.fetchSheetCapabilities(), null);
    assert.match(sheet.sheetHealth().capabilities.lastError, /redacted/);
    assert.doesNotMatch(messages.join("\n"), /secret-never-log|private job/);
    assert.match(messages.join("\n"), /HTTP 503; type=text\/html; bytes=/);
    responses.push({ body: JSON.stringify({ ok: true, jobs: {} }) });
    assert.deepEqual(await sheet.fetchSheetJobs({ ref: "D1" }), []);
    // An HTTP error must never be accepted as a confirmed save, even if its
    // body resembles a successful response. No real Sheet writes occur here.
    for (let i = 0; i < 3; i++) responses.push({ status: 503, body: '{"ok":true}' });
    assert.equal(await sheet.pushStationUpdateConfirmed(
      { source_tab: "SEPTEMBER-2026", biz_ref: "D1" }, [{ field: "s4", to: "DONE" }]
    ), false);
    assert.equal(responses.length, 0);
  } finally {
    https.request = originalRequest;
    console.error = originalError;
    for (const key of ["SHEET_WEBAPP_URL", "SHEET_TOKEN", "SHEET_REQUEST_TIMEOUT_MS"]) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
    delete require.cache[modulePath];
  }
});

test("tablet messages distinguish ready, stale, disabled and unreachable", () => {
  const context = vm.createContext({
    localStorage: { getItem: () => null },
    document: { documentElement: { dataset: {} } },
  });
  vm.runInContext(fs.readFileSync(require.resolve("../public/common.js"), "utf8"), context);
  assert.match(context.sheetStatusText(null), /Server unreachable/);
  assert.match(context.sheetStatusText({ sheet: false }), /cannot be saved/);
  assert.match(context.sheetStatusText({ sheet: true, health: { status: "ready" } }), /checks passed/);
  assert.match(context.sheetStatusText({ sheet: true, health: { status: "degraded" } }), /outdated/);
  assert.doesNotMatch(context.sheetStatusText({ sheet: true }), /checks passed|connected/);
});

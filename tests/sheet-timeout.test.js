"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("node:events");
const https = require("node:https");

test("Sheet capability checks time out when the remote endpoint never replies", async () => {
  const originalRequest = https.request;
  const originalUrl = process.env.SHEET_WEBAPP_URL;
  const originalToken = process.env.SHEET_TOKEN;
  const originalTimeout = process.env.SHEET_REQUEST_TIMEOUT_MS;
  const sheetPath = require.resolve("../src/sheet");

  class StalledRequest extends EventEmitter {
    write() {}
    end() {}
    destroy(error) { this.emit("error", error); }
  }

  try {
    https.request = () => new StalledRequest();
    process.env.SHEET_WEBAPP_URL = "https://example.invalid/exec";
    process.env.SHEET_TOKEN = "test-only";
    process.env.SHEET_REQUEST_TIMEOUT_MS = "25";
    delete require.cache[sheetPath];
    const { fetchSheetCapabilities } = require("../src/sheet");

    const started = Date.now();
    const result = await fetchSheetCapabilities();

    assert.strictEqual(result, null);
    assert.ok(Date.now() - started < 1000, "timeout should settle promptly");
  } finally {
    https.request = originalRequest;
    if (originalUrl === undefined) delete process.env.SHEET_WEBAPP_URL;
    else process.env.SHEET_WEBAPP_URL = originalUrl;
    if (originalToken === undefined) delete process.env.SHEET_TOKEN;
    else process.env.SHEET_TOKEN = originalToken;
    if (originalTimeout === undefined) delete process.env.SHEET_REQUEST_TIMEOUT_MS;
    else process.env.SHEET_REQUEST_TIMEOUT_MS = originalTimeout;
    delete require.cache[sheetPath];
  }
});

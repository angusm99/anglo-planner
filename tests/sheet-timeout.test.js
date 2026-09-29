"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("node:events");
const https = require("node:https");

test("the full-sheet read gets 4x the normal timeout; single-ref lookups keep the short one", async () => {
  const originalRequest = https.request;
  const saved = {
    url: process.env.SHEET_WEBAPP_URL, token: process.env.SHEET_TOKEN,
    timeout: process.env.SHEET_REQUEST_TIMEOUT_MS,
  };
  const sheetPath = require.resolve("../src/sheet");
  const originalError = console.error;
  const messages = [];

  class StalledRequest extends EventEmitter {
    write() {}
    end() {}
    destroy(error) { this.emit("error", error); }
  }

  try {
    https.request = () => new StalledRequest();
    console.error = (m) => messages.push(String(m));
    process.env.SHEET_WEBAPP_URL = "https://example.invalid/exec";
    process.env.SHEET_TOKEN = "test-only";
    process.env.SHEET_REQUEST_TIMEOUT_MS = "25";
    delete require.cache[sheetPath];
    const { fetchSheetJobs } = require("../src/sheet");

    assert.deepStrictEqual(await fetchSheetJobs({ ref: "D1" }), []);
    assert.deepStrictEqual(await fetchSheetJobs({ all: "1" }), []);

    assert.match(messages[0], /timed out after 25 ms/);
    assert.match(messages[1], /timed out after 100 ms/);
  } finally {
    https.request = originalRequest;
    console.error = originalError;
    for (const [key, env] of [["url", "SHEET_WEBAPP_URL"], ["token", "SHEET_TOKEN"], ["timeout", "SHEET_REQUEST_TIMEOUT_MS"]]) {
      if (saved[key] === undefined) delete process.env[env];
      else process.env[env] = saved[key];
    }
    delete require.cache[sheetPath];
  }
});

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

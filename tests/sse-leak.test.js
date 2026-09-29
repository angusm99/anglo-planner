"use strict";

const test = require("node:test");
const assert = require("node:assert");

// Avoid colliding with a live server already on 3300 (e.g. the floor terminal
// running on this same machine during dev).
process.env.PORT = "0";
delete process.env.SHEET_WEBAPP_URL;

const { sseWrite, sseClients, server } = require("../src/server.js");
server.unref(); // let the test process exit; nothing in these tests needs the listener up

test("a dead SSE client is dropped and destroyed instead of leaking the socket", () => {
  let destroyed = false;
  const deadRes = {
    writableEnded: false,
    destroyed: false,
    write() { throw new Error("write EPIPE"); },
    destroy() { destroyed = true; },
  };
  sseClients.add(deadRes);

  assert.doesNotThrow(() => sseWrite(deadRes, ": ping\n\n"));
  assert.strictEqual(sseClients.has(deadRes), false, "dead client must be removed from sseClients");
  assert.strictEqual(destroyed, true, "dead client's socket must be explicitly destroyed, not just forgotten");
});

test("an already-ended client is dropped without attempting a write", () => {
  let wrote = false;
  const endedRes = {
    writableEnded: true,
    destroyed: false,
    write() { wrote = true; },
  };
  sseClients.add(endedRes);

  sseWrite(endedRes, ": ping\n\n");
  assert.strictEqual(wrote, false);
  assert.strictEqual(sseClients.has(endedRes), false);
});

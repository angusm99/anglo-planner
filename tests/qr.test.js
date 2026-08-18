"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { parseQrPayload, routeFor } = require("../public/qr");

const expected = { station: 8, ref: "C9687" };

test("QR parser accepts station and ref query text", () => {
  assert.deepStrictEqual(parseQrPayload("station=8&ref=C9687"), expected);
});

test("QR parser accepts a station URL", () => {
  assert.deepStrictEqual(parseQrPayload("https://example.com/station/4?ref=D1738"), { station: 4, ref: "D1738" });
});

test("QR parser accepts JSON", () => {
  assert.deepStrictEqual(parseQrPayload('{"station":3,"ref":"C9687"}'), { station: 3, ref: "C9687" });
});

test("QR parser accepts station then ref pipe form", () => {
  assert.deepStrictEqual(parseQrPayload("8|C9687"), expected);
});

test("QR parser accepts ref then station pipe form", () => {
  assert.deepStrictEqual(parseQrPayload("C9687|8"), expected);
});

test("QR route never contains a status write", () => {
  assert.strictEqual(routeFor(expected), "/station/8?ref=C9687&scan=1");
  assert.throws(() => parseQrPayload("station=9&ref=C9687"), /station from 1 to 8/);
});

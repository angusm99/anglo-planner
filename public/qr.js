"use strict";

(function expose(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.AngloQR = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function makeQrApi() {
  function valid(station, ref) {
    const n = Number(station);
    const r = String(ref || "").trim().toUpperCase();
    if (!Number.isInteger(n) || n < 1 || n > 8) throw new Error("QR code needs a station from 1 to 8");
    if (!r) throw new Error("QR code needs a Biz Ref");
    return { station: n, ref: r };
  }

  function parseQrPayload(raw) {
    const text = String(raw || "").trim();
    if (!text) throw new Error("Paste or scan a QR code first");

    if (text[0] === "{") {
      try {
        const obj = JSON.parse(text);
        return valid(obj.station, obj.ref);
      } catch (err) {
        if (err.message.startsWith("QR code")) throw err;
        throw new Error("QR JSON is not valid");
      }
    }

    const pipe = text.split("|").map((part) => part.trim());
    if (pipe.length === 2) {
      if (/^\d+$/.test(pipe[0])) return valid(pipe[0], pipe[1]);
      if (/^\d+$/.test(pipe[1])) return valid(pipe[1], pipe[0]);
    }

    if (/^https?:\/\//i.test(text)) {
      try {
        const url = new URL(text);
        const pathStation = (url.pathname.match(/\/station\/(\d+)/i) || [])[1];
        return valid(pathStation || url.searchParams.get("station"), url.searchParams.get("ref"));
      } catch (err) {
        if (err.message.startsWith("QR code")) throw err;
        throw new Error("QR web address is not valid");
      }
    }

    const params = new URLSearchParams(text.replace(/^\?/, ""));
    if (params.has("station") || params.has("ref")) {
      return valid(params.get("station"), params.get("ref"));
    }
    throw new Error("QR format not recognised");
  }

  function routeFor(parsed) {
    const value = valid(parsed.station, parsed.ref);
    return `/station/${value.station}?ref=${encodeURIComponent(value.ref)}&scan=1`;
  }

  function cameraSupported() {
    return typeof BarcodeDetector !== "undefined" &&
      typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }

  async function startScanner(video, onResult, onError) {
    if (!cameraSupported()) throw new Error("Camera QR scanning is not supported");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } }, audio: false,
    });
    const detector = new BarcodeDetector({ formats: ["qr_code"] });
    let running = true;
    let busy = false;
    video.srcObject = stream;
    await video.play();

    const stop = () => {
      running = false;
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    };
    async function tick() {
      if (!running) return;
      if (!busy && video.readyState >= 2) {
        busy = true;
        try {
          const codes = await detector.detect(video);
          if (codes[0]?.rawValue) {
            const raw = codes[0].rawValue;
            stop();
            onResult(raw);
            return;
          }
        } catch (err) {
          if (onError) onError(err.message || "Could not read QR code");
        } finally { busy = false; }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    return stop;
  }

  return { parseQrPayload, routeFor, cameraSupported, startScanner };
});

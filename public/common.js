"use strict";

(function initTheme() {
  const saved = localStorage.getItem("anglo-theme") || "dark";
  document.documentElement.dataset.theme = saved;
})();

function toggleTheme(btn) {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("anglo-theme", next);
  if (btn) btn.textContent = next === "dark" ? "Light" : "Dark";
}

function themeButtonLabel() {
  return document.documentElement.dataset.theme === "dark" ? "Light" : "Dark";
}

const DONE_VALUES =["DONE", "DONE-NO PW", "RC-X", "RECEIVED CL", "ALL DONE",
  "WINDOWS DONE", "S-FRONT DONE", "SLIDERS DONE", "SLATTED UNITS", "DELIVERED",
  "FRAMES ONLY", "ALL READY", "GLASS READY", "BEADS DONE", "FRAMES+BEADS",
  "BEADS+FRAMES", "FRAMES+GLASS", "BEADS+GLASS"];

function classify(v) {
  v = String(v || "").toUpperCase().trim();
  if (!v || v === "0" || v === "QUEUED" || v === "QUEUE OUT") return "queue";
  if (v.includes("SHORT") || v === "CHANGES") return "bad";
  if (DONE_VALUES.includes(v)) return "done";
  return "prog";
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  const opts = { day: "numeric", month: "short" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-ZA", opts);
}

function todayISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function qtyChips(job) {
  const parts = [];
  const add = (n, label) => { if (n) parts.push(`${Math.round(n)} ${label}`); };
  add(job.qty_windows, "windows");
  add(job.qty_hinged, "hinged");
  add(job.qty_folding, "folding");
  add(job.qty_palace, "palace");
  add(job.qty_specials, "specials");
  add(job.qty_elite, "elite/knysna");
  return parts;
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function startClock(el) {
  const tick = () => {
    el.textContent = new Date().toLocaleString("en-ZA", {
      weekday: "short", day: "numeric", month: "short",
      hour: "2-digit", minute: "2-digit",
    });
  };
  tick();
  setInterval(tick, 30000);
}

let terminalWakeLock = null;

async function keepTerminalAwake() {
  if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  try {
    terminalWakeLock = await navigator.wakeLock.request("screen");
    terminalWakeLock.addEventListener("release", () => { terminalWakeLock = null; });
  } catch (_) {
    terminalWakeLock = null;
  }
}

function isTerminalFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

function syncTerminalModeButton(btn) {
  if (!btn) return;
  const active = isTerminalFullscreen();
  btn.textContent = active ? "EXIT FULLSCREEN" : "LOCK FULLSCREEN";
  btn.setAttribute("aria-pressed", active ? "true" : "false");
}

async function toggleTerminalMode(btn) {
  try {
    if (isTerminalFullscreen()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) await exit.call(document);
    } else {
      const root = document.documentElement;
      const enter = root.requestFullscreen || root.webkitRequestFullscreen;
      if (!enter) throw new Error("Fullscreen is not supported by this browser.");
      await enter.call(root, { navigationUI: "hide" });
      await keepTerminalAwake();
    }
  } catch (err) {
    const message = document.getElementById("terminalModeMessage");
    if (message) message.textContent = err && err.message ? err.message : "Could not enter fullscreen.";
  }
  syncTerminalModeButton(btn);
}

function bindTerminalModeButton(btn) {
  if (!btn) return;
  syncTerminalModeButton(btn);
  btn.addEventListener("click", () => toggleTerminalMode(btn));
  document.addEventListener("fullscreenchange", () => syncTerminalModeButton(btn));
  document.addEventListener("webkitfullscreenchange", () => syncTerminalModeButton(btn));
  document.addEventListener("visibilitychange", () => {
    if (isTerminalFullscreen()) keepTerminalAwake();
  });
}

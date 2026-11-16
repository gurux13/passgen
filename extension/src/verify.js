// Compares what a genpw.cc (or mirror) page actually loaded against the
// hardcoded hashes in pinned.js.

// Must match normalize() in tools/sync_ethalon.py.
export function normalizeCode(code) {
  return String(code).replace(/\s+/g, " ").trim();
}

const FAIL = new Set(["mismatch", "unknown-code", "external-code", "inline-script", "inline-handler"]);
const WARN = new Set(["unreadable", "unknown", "external"]);

export const STATUS_TEXT = {
  ok: "verified",
  mismatch: "hash differs from the pinned hash",
  "unknown-code": "script/style not in the pinned set",
  unknown: "resource not in the pinned set",
  unreadable: "could not be re-read for hashing",
  "external-code": "script/style loaded from another site",
  external: "resource loaded from another site",
  "inline-script": "inline script not present in the templates",
  "inline-handler": "inline handler not present in the templates",
};

// report:     { resources: [{url, kind: 'script'|'style'|'other', sha256}],
//               inlineScripts: [string], inlineHandlers: [string] }
// pageOrigin: origin of the page that produced the report (one of pinned.origins)
// pinned:     PINNED from pinned.js
export function checkPage(report, pageOrigin, pinned) {
  const items = [];

  for (const res of report.resources ?? []) {
    let u;
    try {
      u = new URL(res.url);
    } catch {
      continue;
    }
    if (u.protocol === "chrome-extension:") continue; // injected by browser extensions
    const code = res.kind === "script" || res.kind === "style";
    if (u.origin !== pageOrigin) {
      items.push({ url: res.url, status: code ? "external-code" : "external" });
      continue;
    }
    let path;
    try {
      path = decodeURIComponent(u.pathname.replace(/^\//, ""));
    } catch {
      path = u.pathname;
    }
    let status;
    if (!Object.hasOwn(pinned.files, path)) status = code ? "unknown-code" : "unknown";
    else if (!res.sha256) status = "unreadable";
    else status = res.sha256 === pinned.files[path] ? "ok" : "mismatch";
    items.push({ url: res.url, status });
  }

  const knownScripts = new Set(pinned.inlineScripts.map(normalizeCode));
  for (const s of report.inlineScripts ?? []) {
    const n = normalizeCode(s);
    if (n && !knownScripts.has(n)) items.push({ url: "inline: " + n.slice(0, 80), status: "inline-script" });
  }
  const knownHandlers = new Set(pinned.inlineHandlers.map(normalizeCode));
  for (const h of report.inlineHandlers ?? []) {
    const n = normalizeCode(h);
    if (n && !knownHandlers.has(n)) items.push({ url: "handler: " + n.slice(0, 80), status: "inline-handler" });
  }

  let status = "ok";
  if (items.some((i) => FAIL.has(i.status))) status = "fail";
  else if (items.some((i) => WARN.has(i.status))) status = "warn";
  return { status, items, checkedAt: Date.now() };
}

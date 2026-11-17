// Compares what a genpw.cc (or mirror) page actually loaded against the
// hardcoded hashes in pinned.js.

// Must match normalize() in tools/sync_ethalon.py.
export function normalizeCode(code) {
  return String(code).replace(/\s+/g, " ").trim();
}

const FAIL = new Set([
  "mismatch",
  "unknown-code",
  "external-code",
  "inline-script",
  "inline-handler",
  "blocked",
  "service-worker",
  "no-report",
  "rejected",
]);
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
  blocked: "unexpected request (blocked)",
  "service-worker": "page is controlled by a service worker",
  "no-report": "page check did not complete",
  rejected: "request rejected: values the user didn't enter",
};

// webRequest resource type -> report kind
export function kindOfRequestType(type) {
  if (type === "script") return "script";
  if (type === "stylesheet") return "style";
  if (type === "sub_frame") return "frame";
  if (type === "xmlhttprequest") return "xhr";
  return "other";
}

// report:     { resources: [{url, kind: 'script'|'style'|'frame'|'xhr'|'other', sha256}],
//               inlineScripts: [string], inlineHandlers: [string], serviceWorker: bool }
// network:    [{url, type, blocked}] — what the browser saw this tab request (background)
// pageOrigin: origin of the page that produced the report (one of pinned.origins)
// pinned:     PINNED from pinned.js
export function checkPage(report, pageOrigin, pinned, network = []) {
  const items = [];
  const endpoints = new Set([...(pinned.endpoints?.get ?? []), ...(pinned.endpoints?.post ?? [])]);
  const seen = new Set();

  // Requests the browser cancelled are failures no matter what the page reports.
  const blocked = new Set(network.filter((r) => r.blocked).map((r) => stripHash(r.url)));
  const listed = new Set();
  for (const r of network) {
    if (!r.blocked) continue;
    const url = stripHash(r.url);
    const item = r.rejected ? { url: `${url} — ${r.rejected}`, status: "rejected" } : { url, status: "blocked" };
    if (listed.has(item.url)) continue;
    listed.add(item.url);
    items.push(item);
  }

  const resources = [...(report.resources ?? [])];
  for (const req of network) {
    if (!req.blocked) resources.push({ url: req.url, kind: kindOfRequestType(req.type), sha256: req.sha256 ?? null });
  }

  for (const res of resources) {
    let u;
    try {
      u = new URL(res.url);
    } catch {
      continue;
    }
    u.hash = "";
    if (u.protocol === "chrome-extension:") continue; // injected by browser extensions
    if (blocked.has(u.href)) continue;
    // Prefer the entry that carries a hash when both sources list the same URL.
    const key = u.href;
    if (seen.has(key) && !res.sha256) continue;

    const code = res.kind === "script" || res.kind === "style" || res.kind === "frame";
    let status;
    if (u.origin !== pageOrigin) {
      status = code || res.kind === "xhr" ? "external-code" : "external";
    } else {
      let path;
      try {
        path = decodeURIComponent(u.pathname.replace(/^\//, ""));
      } catch {
        path = u.pathname;
      }
      // The site's own API, or a fetch of a pinned file (e.g. the extension's own
      // hash check) — neither loads code.
      if (res.kind === "xhr" && (endpoints.has(path) || Object.hasOwn(pinned.files, path))) continue;
      if (!Object.hasOwn(pinned.files, path)) status = code || res.kind === "xhr" ? "unknown-code" : "unknown";
      else if (!res.sha256) status = "unreadable";
      else status = acceptedHashes(pinned, path).includes(res.sha256) ? "ok" : "mismatch";
    }
    const existing = items.findIndex((i) => i.key === key);
    if (existing >= 0) items.splice(existing, 1);
    // A mismatch keeps the page's hash so a newer release's pins can be checked against it.
    const detail = ["mismatch", "unknown", "unknown-code"].includes(status) && u.origin === pageOrigin;
    items.push(detail ? { key, url: res.url, status, path: decodePath(u), sha256: res.sha256 ?? null } : { key, url: res.url, status });
    seen.add(key);
  }

  const knownScripts = new Set(pinned.inlineScripts.map(normalizeCode));
  for (const s of new Set(report.inlineScripts ?? [])) {
    const n = normalizeCode(s);
    if (n && !knownScripts.has(n)) items.push({ url: "inline: " + n.slice(0, 80), status: "inline-script", code: n });
  }
  const knownHandlers = new Set(pinned.inlineHandlers.map(normalizeCode));
  for (const h of new Set(report.inlineHandlers ?? [])) {
    const n = normalizeCode(h);
    if (n && !knownHandlers.has(n)) items.push({ url: "handler: " + n.slice(0, 80), status: "inline-handler", code: n });
  }
  if (report.serviceWorker) items.push({ url: pageOrigin, status: "service-worker" });

  for (const i of items) delete i.key;
  return { status: statusOf(items), items, checkedAt: Date.now() };
}

export function statusOf(items) {
  if (items.some((i) => FAIL.has(i.status))) return "fail";
  if (items.some((i) => WARN.has(i.status))) return "warn";
  return "ok";
}

// Every hash accepted for a pinned file (several releases can be valid at once).
export function acceptedHashes(pinned, path) {
  const v = pinned.files?.[path];
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

function decodePath(u) {
  try {
    return decodeURIComponent(u.pathname.replace(/^\//, ""));
  } catch {
    return u.pathname.replace(/^\//, "");
  }
}

function stripHash(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  } catch {
    return url;
  }
}

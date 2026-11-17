// Runs on genpw.cc and its mirror: reports every asset the page loaded (with the
// hash of the bytes the browser has for it) plus inline code, so the background
// can check them against the hardcoded hashes. Shows a banner if anything fails.
(() => {
  if (window.__genpwVerify) return;
  window.__genpwVerify = true;

  const SKIP_INITIATORS = new Set(["xmlhttprequest", "fetch", "beacon"]);

  // Runs from document_start: everything ever inserted is recorded here, so code
  // the page removes from the DOM after it ran is still reported.
  const everScripts = new Map(); // src url -> kind
  const everInline = new Set();
  const everHandlers = new Set();

  function record(el) {
    if (el.nodeType !== 1) return;
    if (el.tagName === "SCRIPT") {
      if (el.src) everScripts.set(el.src, "script");
      else if (el.textContent) everInline.add(el.textContent);
    } else if (el.tagName === "LINK" && el.href && /stylesheet/i.test(el.rel)) {
      everScripts.set(el.href, "style");
    }
    for (const attr of el.attributes ?? []) recordAttr(attr.name, attr.value);
  }

  function recordAttr(name, value) {
    name = name.toLowerCase();
    if (value == null) return;
    if (name.startsWith("on")) everHandlers.add(value);
    else if (["href", "src", "action", "formaction"].includes(name) && /^\s*javascript:/i.test(value)) everHandlers.add(value);
  }

  new MutationObserver((records) => {
    let relevant = false;
    for (const r of records) {
      if (r.target === banner) continue;
      if (r.type === "attributes") {
        const name = r.attributeName.toLowerCase();
        if (name.startsWith("on") || ["href", "src", "action", "formaction", "rel"].includes(name)) {
          recordAttr(name, r.target.getAttribute(r.attributeName));
          relevant = true;
        }
      } else if (r.type === "characterData" || (r.type === "childList" && r.target.tagName === "SCRIPT")) {
        const s = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        if (s?.tagName === "SCRIPT") {
          if (!s.src && s.textContent) everInline.add(s.textContent);
          relevant = true;
        }
      }
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1 || n === banner) continue;
        record(n);
        n.querySelectorAll?.("*").forEach(record);
        if (n.matches("script,link") || n.querySelector("script,link,[onclick],[onload],[onerror]")) relevant = true;
      }
    }
    if (relevant && started) schedule(500);
  }).observe(document, { childList: true, subtree: true, attributes: true, characterData: true });

  async function sha256Hex(buf) {
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function collect() {
    const kinds = new Map();
    const add = (url, kind) => {
      if (!url) return;
      let u;
      try {
        u = new URL(url, location.href);
      } catch {
        return;
      }
      if (!["http:", "https:", "chrome-extension:"].includes(u.protocol)) return;
      u.hash = "";
      const prev = kinds.get(u.href);
      if (!prev || prev === "other") kinds.set(u.href, kind);
    };
    document.querySelectorAll("script[src]").forEach((s) => add(s.src, "script"));
    document.querySelectorAll("link[href]").forEach((l) => {
      const rel = (l.rel || "").toLowerCase();
      let kind = "other";
      if (rel.includes("stylesheet")) kind = "style";
      else if (rel.includes("modulepreload") || (rel.includes("preload") && l.as === "script")) kind = "script";
      else if (rel.includes("preload") && l.as === "style") kind = "style";
      add(l.href, kind);
    });
    for (const e of performance.getEntriesByType("resource")) {
      if (SKIP_INITIATORS.has(e.initiatorType)) continue;
      add(e.name, e.initiatorType === "script" ? "script" : "other");
    }
    for (const [url, kind] of everScripts) add(url, kind);

    document.querySelectorAll("*").forEach(record);
    return { kinds, inlineScripts: [...everInline], inlineHandlers: [...everHandlers] };
  }

  async function buildReport() {
    const { kinds, inlineScripts, inlineHandlers } = collect();
    const resources = await Promise.all(
      [...kinds].map(async ([url, kind]) => {
        if (new URL(url).origin !== location.origin) return { url, kind, sha256: null };
        try {
          // force-cache: hash the copy the browser already holds for this page.
          const r = await fetch(url, { cache: "force-cache", credentials: "same-origin" });
          if (!r.ok) throw new Error("HTTP " + r.status);
          return { url, kind, sha256: await sha256Hex(await r.arrayBuffer()) };
        } catch (e) {
          return { url, kind, sha256: null, error: String(e?.message ?? e) };
        }
      })
    );
    // A service worker could answer the hash fetches above with different bytes.
    const serviceWorker = !!navigator.serviceWorker?.controller;
    return { resources, inlineScripts, inlineHandlers, serviceWorker };
  }

  let banner = null;
  let bannerExpanded = false; // kept across re-checks so the table doesn't collapse under the user
  function showBanner(verdict) {
    banner?.remove();
    banner = null;
    if (verdict.status === "ok") return;
    const host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;left:0;right:0;bottom:0;z-index:2147483647;";
    const root = host.attachShadow({ mode: "closed" });
    const bad = verdict.items.filter((i) => i.status !== "ok");
    const style = document.createElement("style");
    style.textContent = `
      .box { font: 14px/1.4 system-ui, sans-serif; color: #fff; background: #c62828; }
      .head { display: flex; gap: 12px; align-items: center; padding: 10px 14px; cursor: pointer; user-select: none; }
      .head:hover { filter: brightness(1.08); }
      .title { flex: 1; font-weight: 600; }
      .toggle { font-size: 12px; opacity: .85; white-space: nowrap; }
      .close { all: unset; cursor: pointer; font-size: 16px; padding: 0 4px; }
      .details { max-height: 40vh; overflow: auto; padding: 0 14px 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; background: rgba(0,0,0,.18); }
      th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid rgba(255,255,255,.2); vertical-align: top; }
      th { position: sticky; top: 0; background: rgba(0,0,0,.35); font-weight: 600; }
      td.res { word-break: break-all; font-family: ui-monospace, Consolas, monospace; }
      td.why { white-space: nowrap; }
    `;

    const box = document.createElement("div");
    box.className = "box";
    const head = document.createElement("div");
    head.className = "head";
    head.title = "Show details";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent =
      verdict.status === "fail"
        ? "✗ genpw.cc assets don't match"
        : "✗ genpw.cc assets couldn't all be verified";
    if (verdict.updateText) title.textContent += " — " + verdict.updateText;
    const toggle = document.createElement("span");
    toggle.className = "toggle";
    const close = document.createElement("button");
    close.className = "close";
    close.textContent = "✕";
    close.title = "Dismiss";
    close.onclick = (e) => {
      e.stopPropagation();
      host.remove();
    };
    head.append(title, toggle, close);

    const details = document.createElement("div");
    details.className = "details";
    const table = document.createElement("table");
    const thead = table.createTHead().insertRow();
    for (const h of ["Resource", "Problem"]) {
      const th = document.createElement("th");
      th.textContent = h;
      thead.append(th);
    }
    const tbody = table.createTBody();
    for (const item of bad) {
      const row = tbody.insertRow();
      const res = row.insertCell();
      res.className = "res";
      res.textContent = item.url;
      const why = row.insertCell();
      why.className = "why";
      why.textContent = item.reason ?? item.status;
    }
    details.append(table);

    const render = () => {
      details.hidden = !bannerExpanded;
      toggle.textContent = `${bad.length} issue${bad.length === 1 ? "" : "s"} ${bannerExpanded ? "▲" : "▼"}`;
    };
    head.onclick = () => {
      bannerExpanded = !bannerExpanded;
      render();
    };
    render();

    box.append(head, details);
    root.append(style, box);
    document.documentElement.append(host);
    banner = host;
  }

  let running = false;
  let again = false;
  async function run() {
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      const report = await buildReport();
      const verdict = await chrome.runtime.sendMessage({ type: "genpw:verifyPage", report });
      if (verdict?.status) showBanner(verdict);
    } catch {
      /* extension reloaded */
    } finally {
      running = false;
      if (again) {
        again = false;
        run();
      }
    }
  }

  // ---- what the user typed (trusted keyboard/paste input only) and the master password.
  // Listeners go on window in the capture phase from document_start, so they run
  // before any page listener. For each edit we keep the value just before it
  // (beforeinput) and check that the result is that value plus what the user
  // inserted; the background then only accepts it if the starting value was
  // empty, server data or something already accepted (not set by a script).
  const before = new WeakMap();
  let master = null;
  const isField = (el) =>
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "hidden", "file"].includes(el.type));

  window.addEventListener(
    "beforeinput",
    (e) => {
      if (e.isTrusted && isField(e.target)) before.set(e.target, e.target.value);
    },
    true
  );
  window.addEventListener(
    "input",
    (e) => {
      const el = e.target;
      if (!e.isTrusted || !isField(el)) return;
      if (el.id === "master-input") {
        master = el.value;
        return;
      }
      if (el.type === "password") return; // account passwords are never sent as-is
      const base = before.get(el);
      before.delete(el);
      if (base === undefined || !isSingleEdit(base, el.value, e)) return;
      chrome.runtime.sendMessage({ type: "genpw:typed", base, value: el.value }).catch(() => {});
    },
    true
  );

  // value must be base with one contiguous segment replaced by the inserted text.
  function isSingleEdit(base, value, e) {
    let p = 0;
    while (p < base.length && p < value.length && base[p] === value[p]) p++;
    let s = 0;
    while (s < base.length - p && s < value.length - p && base[base.length - 1 - s] === value[value.length - 1 - s]) s++;
    const inserted = value.slice(p, value.length - s);
    if (e.inputType?.startsWith("delete")) return inserted === "";
    return e.data == null || inserted === e.data || inserted === e.data.replace(/\r?\n/g, "");
  }

  // ---- API writes handed over by the page-world shim (content/xhr-shim.js)
  window.addEventListener("message", async (event) => {
    if (event.source !== window || event.data?.genpwProxy !== "req") return;
    const { id, url, body, contentType } = event.data;
    let res;
    try {
      res = await chrome.runtime.sendMessage({
        type: "genpw:proxy",
        url: String(url),
        body: String(body),
        contentType: contentType == null ? null : String(contentType),
        master,
      });
    } catch {
      res = null;
    }
    res ??= { status: 0, statusText: "", headers: "", body: "" };
    window.postMessage({ genpwProxy: "res", id, status: res.status, statusText: res.statusText, headers: res.headers, body: res.body }, location.origin);
  });

  let timer = null;
  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  }

  // The background re-evaluates when it sees new requests; keep the banner in sync.
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (sender.id === chrome.runtime.id && msg?.type === "genpw:verdict" && msg.verdict?.status) showBanner(msg.verdict);
  });

  let started = false;
  function start() {
    started = true;
    run();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  window.addEventListener("load", () => schedule(1500));
  // Restored from the back/forward cache: report again (the background starts a new check).
  window.addEventListener("pageshow", (e) => e.persisted && schedule(0));
})();

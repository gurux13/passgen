// Runs on genpw.cc and its mirror: reports every asset the page loaded (with the
// hash of the bytes the browser has for it) plus inline code, so the background
// can check them against the hardcoded hashes. Shows a banner if anything fails.
(() => {
  if (window.__genpwVerify) return;
  window.__genpwVerify = true;

  const SKIP_INITIATORS = new Set(["xmlhttprequest", "fetch", "beacon"]);

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

    const inlineScripts = [...document.querySelectorAll("script:not([src])")].map((s) => s.textContent);
    const inlineHandlers = [];
    for (const el of document.querySelectorAll("*")) {
      for (const attr of el.attributes) {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on")) inlineHandlers.push(attr.value);
        else if (["href", "src", "action", "formaction"].includes(name) && /^\s*javascript:/i.test(attr.value)) {
          inlineHandlers.push(attr.value);
        }
      }
    }
    return { kinds, inlineScripts, inlineHandlers };
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
    return { resources, inlineScripts, inlineHandlers };
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

  let timer = null;
  const schedule = (ms) => {
    clearTimeout(timer);
    timer = setTimeout(run, ms);
  };
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "attributes") return schedule(500);
      for (const n of r.addedNodes) {
        if (n.nodeType === 1 && (n.matches("script,link") || n.querySelector?.("script,link,[onclick]"))) return schedule(500);
      }
    }
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["onclick", "onload", "onerror", "onmouseover", "onfocus", "onblur", "onchange", "oninput", "onsubmit", "onkeydown", "onkeyup", "onkeypress", "href", "src"],
  });

  run();
  window.addEventListener("load", () => schedule(1500));
})();

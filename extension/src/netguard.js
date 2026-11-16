// Request allowlist for genpw.cc pages, enforced by the browser
// (declarativeNetRequest), so a page cannot get around it.
//
// Every request a genpw.cc page starts is cancelled unless it is:
//   - one of the pinned static files,
//   - a GET to the site's read-only endpoints (/batchresources, /commonaccounts?count=N),
//   - a navigation to one of the site's own pages (or a login/register form post),
//   - a navigation to the exact URL of one of the user's resources (links on the site).
// Writes (POST /generated etc.) are never allowed from the page itself: they go
// through the extension, which validates every value (see payload.js).
// That covers exfiltration to other sites, injected scripts, frames, websockets,
// beacons, service workers, and data smuggled out in navigation URLs.

import { PINNED } from "./pinned.js";

const BLOCK_BY_INITIATOR = 1; // dynamic: subresources started by genpw.cc documents
const BLOCK_BY_TAB = 2; // session: everything in genpw.cc tabs (covers sandboxed/opaque frames)
const BLOCK_NAVIGATION = 3; // dynamic: navigations started by genpw.cc documents
const ALLOW_BASE = 100;
const RESOURCE_URL_BASE = 10000; // session: navigations to the user's resource URLs

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const GUARDED_HOSTS = PINNED.origins.map((o) => new URL(o).hostname);

// Pure: the dynamic rules (persist across restarts, so they're in force before
// the service worker even starts).
export function buildDynamicRules(pinned = PINNED) {
  const hosts = pinned.origins.map((o) => new URL(o).hostname);
  const rules = [
    {
      id: BLOCK_BY_INITIATOR,
      priority: 1,
      action: { type: "block" },
      condition: { initiatorDomains: hosts, excludedResourceTypes: ["main_frame"] },
    },
    {
      id: BLOCK_NAVIGATION,
      priority: 1,
      action: { type: "block" },
      condition: { initiatorDomains: hosts, resourceTypes: ["main_frame"] },
    },
  ];
  let id = ALLOW_BASE;
  const allow = (condition) =>
    rules.push({ id: id++, priority: 2, action: { type: "allow" }, condition: { isUrlFilterCaseSensitive: true, ...condition } });

  for (const origin of pinned.origins) {
    const o = escapeRe(origin);
    for (const path of Object.keys(pinned.files)) {
      allow({ regexFilter: `^${o}/${escapeRe(path)}(\\?[^#]*)?$`, excludedResourceTypes: ["main_frame", "sub_frame"] });
    }
    // Read-only API, GET only, no smuggled query parameters.
    allow({
      regexFilter: `^${o}/(batchresources|commonaccounts\\?count=\\d{1,4})$`,
      resourceTypes: ["xmlhttprequest"],
      requestMethods: ["get"],
    });
    // The site's own pages, no query string.
    allow({
      regexFilter: `^${o}/(${pinned.pages.get.map(escapeRe).join("|")})$`,
      resourceTypes: ["main_frame"],
      requestMethods: ["get"],
    });
    allow({
      regexFilter: `^${o}/(${pinned.pages.post.map(escapeRe).join("|")})$`,
      resourceTypes: ["main_frame"],
      requestMethods: ["post"],
    });
  }
  return rules;
}

// Normalized navigation URLs for the user's resources, as the site links them.
export function resourceLinkUrls(resources) {
  const urls = new Set();
  for (const r of resources ?? []) {
    const raw = typeof r.url === "string" ? r.url.trim() : "";
    if (!raw) continue;
    try {
      const u = new URL(raw.includes("://") ? raw : "https://" + raw);
      if (u.protocol === "https:" || u.protocol === "http:") urls.add(u.href);
    } catch {
      /* not a link */
    }
  }
  return [...urls];
}

// Pure: session rules allowing navigations to exactly those URLs.
export function buildResourceUrlRules(urls, pinned = PINNED) {
  const hosts = pinned.origins.map((o) => new URL(o).hostname);
  return urls
    .filter((u) => !/[*^|]/.test(u))
    .slice(0, 2000)
    .map((url, i) => ({
      id: RESOURCE_URL_BASE + i,
      priority: 2,
      action: { type: "allow" },
      condition: { urlFilter: `|${url}|`, initiatorDomains: hosts, resourceTypes: ["main_frame"], requestMethods: ["get"] },
    }));
}

export function isGuardedUrl(url) {
  try {
    return PINNED.origins.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

export async function installDynamicRules() {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: buildDynamicRules(),
  });
}

// Keeps the per-tab block rule in sync with the set of tabs showing genpw.cc.
export async function setGuardedTabs(tabIds) {
  const addRules = tabIds.length
    ? [
        {
          id: BLOCK_BY_TAB,
          priority: 1,
          action: { type: "block" },
          condition: { tabIds, excludedResourceTypes: ["main_frame"] },
        },
      ]
    : [];
  await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [BLOCK_BY_TAB], addRules });
}

let lastResourceUrls = "";
export async function setResourceUrls(resources) {
  const urls = resourceLinkUrls(resources);
  const key = urls.join("\n");
  if (key === lastResourceUrls) return;
  lastResourceUrls = key;
  const existing = await chrome.declarativeNetRequest.getSessionRules();
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: existing.filter((r) => r.id >= RESOURCE_URL_BASE).map((r) => r.id),
    addRules: buildResourceUrlRules(urls),
  });
}

import { sha256Hex } from "./hash.js";
import { hostHierarchy, matchesResourceName, suggestedDomain } from "./hosts.js";
import { checkPage, STATUS_TEXT } from "./verify.js";
import { PINNED } from "./pinned.js";
import { GUARDED_HOSTS, installDynamicRules, isGuardedUrl, setGuardedTabs, setResourceUrls } from "./netguard.js";
import { collectKnown, masterHashPrefix, validateAuthForm, validatePayload } from "./payload.js";
import { checkForUpdate, describeUpdate } from "./updates.js";

// ---------------------------------------------------------------- updates

// An update we asked for (because a genpw.cc page failed) has been downloaded:
// apply it now. Chrome closes extension pages on reload, so tabs showing the
// warning page go back to their genpw.cc page first; after the update they're
// reloaded so the new version checks them. Other updates are left to Chrome,
// which installs them when the extension is idle.
chrome.runtime.onUpdateAvailable.addListener(async () => {
  const { updateRequested } = await chrome.storage.session.get("updateRequested");
  if (!updateRequested) return;
  const all = await chrome.storage.session.get(null);
  const recheck = [];
  for (const [key, value] of Object.entries(all)) {
    if (key.startsWith("warning:")) {
      const tabId = Number(key.slice(8));
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab?.url?.startsWith(WARNING_URL)) continue; // moved on since
      await chrome.tabs.update(tabId, { url: value.url }).catch(() => {});
      recheck.push(tabId);
    } else if (key.startsWith("guard:")) {
      recheck.push(Number(key.slice(6)));
    }
  }
  await chrome.storage.local.set({ recheckTabs: [...new Set(recheck)] });
  chrome.runtime.reload();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== "update") return;
  const { recheckTabs = [] } = await chrome.storage.local.get("recheckTabs");
  await chrome.storage.local.remove("recheckTabs");
  for (const tabId of recheckTabs) chrome.tabs.reload(tabId).catch(() => {});
});

const ORIGIN = "https://genpw.cc";
// Same salt as hash_password() in py/static/js/base.js.
const LOGIN_SALT = "0fba614860ead3da8537e7a3b8ed4f2c";
const DATA_TTL_MS = 60 * 1000;
const PENDING_TTL_MS = 10 * 60 * 1000;

const PROMPT_URL = chrome.runtime.getURL("prompt/prompt.html");
const POPUP_URL = chrome.runtime.getURL("popup/popup.html");

// ---------------------------------------------------------------- account

class NotLoggedIn extends Error {}

async function postLogin(username, passhash) {
  const r = await fetch(`${ORIGIN}/auth/login`, {
    method: "POST",
    body: new URLSearchParams({ username, passhash }),
    credentials: "include",
    cache: "no-store",
  });
  // Success redirects to the index page; failure re-renders the login form.
  const u = new URL(r.url);
  return r.ok && u.origin === ORIGIN && u.pathname === "/";
}

async function login(username, password, remember) {
  username = String(username ?? "").trim();
  if (!username || !password) return { ok: false, error: "Username and password are required." };
  const passhash = await sha256Hex(password + LOGIN_SALT);
  let ok;
  try {
    ok = await postLogin(username, passhash);
  } catch (e) {
    return { ok: false, error: "Could not reach genpw.cc: " + (e?.message ?? e) };
  }
  if (!ok) return { ok: false, error: "Wrong username or password." };
  await chrome.storage.local.set({ account: remember ? { username, passhash } : { username } });
  await chrome.storage.session.remove("dataCache");
  return { ok: true };
}

async function logout() {
  await chrome.storage.local.remove("account");
  await chrome.storage.session.remove("dataCache");
  try {
    await fetch(`${ORIGIN}/auth/logout`, { credentials: "include", cache: "no-store" });
  } catch {
    /* already gone */
  }
  return { ok: true };
}

async function fetchJson(path) {
  const r = await fetch(ORIGIN + path, { credentials: "include", cache: "no-store" });
  const type = r.headers.get("content-type") ?? "";
  // Not logged in -> redirected to the HTML login page.
  if (!r.ok || !type.includes("application/json") || new URL(r.url).pathname !== path) return null;
  return r.json();
}

// The user's resources from /batchresources, re-logging in with the remembered
// hash if the session cookie expired.
async function getData({ fresh = false } = {}) {
  if (!fresh) {
    const { dataCache } = await chrome.storage.session.get("dataCache");
    if (dataCache && Date.now() - dataCache.at < DATA_TTL_MS) return dataCache.data;
  }
  let data = await fetchJson("/batchresources");
  if (!data) {
    const { account } = await chrome.storage.local.get("account");
    if (account?.passhash && (await postLogin(account.username, account.passhash))) {
      data = await fetchJson("/batchresources");
    }
  }
  if (!data?.resources) throw new NotLoggedIn();
  await chrome.storage.session.set({ dataCache: { at: Date.now(), data } });
  return data;
}

// ---------------------------------------------------------------- page verification

// Everything the user sees about integrity (badge, warning page) lives outside
// the page, and the verdict combines the page's report with what the browser
// itself saw the tab request, so a hostile page can neither hide the warning
// nor hide what it loaded. It fails closed: no complete report => ✗.

const BADGE = {
  pending: { text: "…", color: "#757575" },
  ok: { text: "✓", color: "#2e7d32" },
  warn: { text: "✗", color: "#c62828" },
  fail: { text: "✗", color: "#c62828" },
};
const REPORT_TIMEOUT_MS = 10000;
const WARNING_URL = chrome.runtime.getURL("warning/warning.html");

// tabId -> { url, origin, nav, network: [{url, type, blocked, sha256}], report, verdict }
const guards = new Map();
let navCounter = 0;

async function getGuard(tabId) {
  if (!guards.has(tabId)) {
    const key = "guard:" + tabId;
    const { [key]: saved } = await chrome.storage.session.get(key);
    if (saved) guards.set(tabId, saved);
  }
  return guards.get(tabId) ?? null;
}

function saveGuard(tabId) {
  const g = guards.get(tabId);
  return chrome.storage.session.set({ ["guard:" + tabId]: g });
}

async function syncGuardedTabs() {
  const { guardedTabs = [] } = await chrome.storage.session.get("guardedTabs");
  const ids = new Set(guardedTabs);
  for (const id of guards.keys()) ids.add(id);
  for (const id of [...ids]) if (!(await getGuard(id))) ids.delete(id);
  await chrome.storage.session.set({ guardedTabs: [...ids] });
  await setGuardedTabs([...ids]);
}

async function setBadge(tabId, status) {
  const badge = BADGE[status];
  await chrome.action.setBadgeText({ tabId, text: badge.text }).catch(() => {});
  await chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color }).catch(() => {});
}

async function startGuard(tabId, url) {
  guards.set(tabId, { url, origin: new URL(url).origin, nav: ++navCounter, network: [], report: null, verdict: null });
  await Promise.all([saveGuard(tabId), chrome.storage.session.remove("verdict:" + tabId), setBadge(tabId, "pending")]);
  await syncGuardedTabs();
  // Lets the site's links to the user's resources work (exact URLs only).
  fetchKnown(new URL(url).origin).catch(() => {});
}

async function stopGuard(tabId) {
  if (!(await getGuard(tabId))) return;
  guards.delete(tabId);
  await chrome.storage.session.remove(["guard:" + tabId, "verdict:" + tabId]);
  await chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
  await syncGuardedTabs();
}

// Hash same-origin pinned resources the browser loaded but the page's report
// doesn't mention (e.g. a <script> removed after it ran).
async function hashMissing(g) {
  const reported = new Set((g.report?.resources ?? []).filter((r) => r.sha256).map((r) => r.url.split("#")[0]));
  await Promise.all(
    g.network.map(async (req) => {
      if (req.blocked || req.sha256 || req.type === "xmlhttprequest") return;
      const u = new URL(req.url);
      if (u.origin !== g.origin || reported.has(u.href.split("#")[0])) return;
      if (!Object.hasOwn(PINNED.files, decodeURIComponent(u.pathname.slice(1)))) return;
      try {
        const r = await fetch(req.url, { credentials: "omit", cache: "force-cache" });
        if (r.ok) req.sha256 = await sha256Hex(await r.arrayBuffer());
      } catch {
        /* stays unreadable */
      }
    })
  );
}

async function applyVerdict(tabId, g, verdict) {
  for (const item of verdict.items) item.reason = STATUS_TEXT[item.status] ?? item.status;
  // Hashes don't match: maybe the extension is just older than the site. Ask the
  // Web Store; if an update is coming, it's applied and the page re-checked.
  if (verdict.status !== "ok") {
    verdict.update = await Promise.race([
      checkForUpdate().catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
    verdict.updateText = describeUpdate(verdict.update);
    if (verdict.update?.status === "update_available") {
      await chrome.storage.session.set({ updateRequested: true });
    }
  }
  g.verdict = verdict;
  await Promise.all([saveGuard(tabId), chrome.storage.session.set({ ["verdict:" + tabId]: verdict })]);
  await setBadge(tabId, verdict.status);
  chrome.tabs.sendMessage(tabId, { type: "genpw:verdict", verdict }, { frameId: 0 }).catch(() => {});
  if (verdict.status !== "ok") await showWarning(tabId, g, verdict);
}

async function evaluate(tabId) {
  const g = await getGuard(tabId);
  if (!g?.report) return null; // the fail-closed timer handles "never reported"
  await hashMissing(g);
  const verdict = checkPage(g.report, g.origin, PINNED, g.network);
  await applyVerdict(tabId, g, verdict);
  return verdict;
}

// Full-page warning: the tab is taken to an extension page the site can't
// touch, unless the user already chose "Proceed anyway" for this exact URL.
async function showWarning(tabId, g, verdict) {
  const key = "proceed:" + tabId;
  const { [key]: proceed } = await chrome.storage.session.get(key);
  if (proceed === g.url) return;
  await chrome.storage.session.set({ ["warning:" + tabId]: { url: g.url, items: verdict.items, updateText: verdict.updateText ?? null } });
  await chrome.tabs.update(tabId, { url: WARNING_URL + "#" + tabId }).catch(() => {});
}

async function verifyPage(report, sender) {
  const tabId = sender.tab.id;
  let g = await getGuard(tabId);
  if (!g || sender.frameId !== 0) {
    // Not a navigation we saw start (e.g. back/forward cache): start fresh.
    if (sender.frameId !== 0) return { status: "fail", items: [] };
    await startGuard(tabId, sender.url);
    g = await getGuard(tabId);
  }
  g.report = report;
  return evaluate(tabId);
}

function scheduleReportTimeout(tabId, nav) {
  setTimeout(async () => {
    const g = await getGuard(tabId);
    if (!g || g.nav !== nav || g.verdict) return;
    await applyVerdict(tabId, g, {
      status: "fail",
      items: [{ url: g.url, status: "no-report" }],
      checkedAt: Date.now(),
    });
  }, REPORT_TIMEOUT_MS);
}

// Requests to genpw.cc / the mirror: navigations start a guard, everything else
// in a guarded tab is logged. Only genpw.cc traffic wakes the extension.
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;
    (async () => {
      if (details.type === "main_frame") {
        await startGuard(details.tabId, details.url);
        if (details.method === "POST") await checkAuthForm(details);
        return;
      }
      const g = await getGuard(details.tabId);
      if (!g) return;
      g.network.push({ url: details.url, type: details.type, blocked: false });
      await saveGuard(details.tabId);
      if (g.report) await evaluate(details.tabId);
    })();
  },
  { urls: GUARDED_HOSTS.map((h) => `https://${h}/*`) },
  ["requestBody"]
);

// Requests the allowlist cancelled (to any site) show up as client-blocked errors.
chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    if (details.tabId < 0 || details.type === "main_frame" || details.error !== "net::ERR_BLOCKED_BY_CLIENT") return;
    (async () => {
      const g = await getGuard(details.tabId);
      if (!g) return;
      const entry = g.network.find((r) => r.url === details.url && !r.blocked);
      if (entry) entry.blocked = true;
      else g.network.push({ url: details.url, type: details.type, blocked: true });
      await saveGuard(details.tabId);
      if (g.report) await evaluate(details.tabId);
      else {
        // No page report yet: a cancelled request alone is enough for ✗.
        const urls = new Set(g.network.filter((r) => r.blocked).map((r) => r.url));
        const items = [...urls].map((url) => ({ url, status: "blocked" }));
        await applyVerdict(details.tabId, g, { status: "fail", items, checkedAt: Date.now() });
      }
    })();
  },
  { urls: ["<all_urls>"] }
);

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.url && !isGuardedUrl(changeInfo.url)) await stopGuard(tabId);
  if (changeInfo.status === "complete") {
    const g = await getGuard(tabId);
    if (g) scheduleReportTimeout(tabId, g.nav);
  }
});
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await stopGuard(tabId);
  await chrome.storage.session.remove(["proceed:" + tabId, "warning:" + tabId, "typed:" + tabId]);
});

// ---- API writes: validated, then sent by the extension (see payload.js / xhr-shim.js)

const KNOWN_TTL_MS = 5000;
const knownCache = new Map(); // origin -> { at, known, resources }

// What the server already holds for this user on that site (cookies are the user's).
async function fetchKnown(origin) {
  const cached = knownCache.get(origin);
  if (cached && Date.now() - cached.at < KNOWN_TTL_MS) return cached;
  const get = async (path) => {
    const r = await fetch(origin + path, { credentials: "include", cache: "no-store" });
    const type = r.headers.get("content-type") ?? "";
    return r.ok && type.includes("application/json") ? r.json() : null;
  };
  const [data, common] = await Promise.all([get("/batchresources"), get("/commonaccounts?count=1000")]);
  const entry = { at: Date.now(), known: collectKnown(data ?? {}, common ?? []), resources: data?.resources ?? [] };
  knownCache.set(origin, entry);
  setResourceUrls(entry.resources).catch(() => {});
  return entry;
}

async function getTyped(tabId) {
  const key = "typed:" + tabId;
  const { [key]: values = [] } = await chrome.storage.session.get(key);
  return values;
}

// A value the user typed is accepted only if the field held, just before the
// keystroke, something legitimate: empty, server data, or an accepted value.
async function addTyped(sender, base, value) {
  if (typeof base !== "string" || typeof value !== "string" || value.length > 4096) return { ok: false };
  const tabId = sender.tab.id;
  const values = await getTyped(tabId);
  const set = new Set(values);
  let ok = base === "" || set.has(base);
  if (!ok) ok = (await fetchKnown(sender.origin)).known.values.has(base);
  if (!ok) return { ok: false };
  set.delete(value);
  set.add(value);
  await chrome.storage.session.set({ ["typed:" + tabId]: [...set].slice(-500) });
  return { ok: true };
}

async function rejectRequest(tabId, url, reason) {
  const g = await getGuard(tabId);
  if (!g) return;
  g.network.push({ url, type: "xmlhttprequest", blocked: true, rejected: reason });
  await saveGuard(tabId);
  if (g.report) await evaluate(tabId);
  else await applyVerdict(tabId, g, { status: "fail", items: [{ url: `${url} — ${reason}`, status: "rejected" }], checkedAt: Date.now() });
}

async function proxyRequest(msg, sender) {
  const fail = { status: 0, statusText: "", headers: "", body: "" };
  let u;
  try {
    u = new URL(msg.url);
  } catch {
    return fail;
  }
  const endpoint = u.pathname.slice(1);
  if (u.origin !== sender.origin || u.search || u.hash || !PINNED.endpoints.post.includes(endpoint)) {
    await rejectRequest(sender.tab.id, msg.url, "not an API write endpoint");
    return fail;
  }
  let body;
  try {
    body = JSON.parse(msg.body);
  } catch {
    await rejectRequest(sender.tab.id, msg.url, "body is not JSON");
    return fail;
  }
  const master = typeof msg.master === "string" && msg.master ? msg.master : null;
  const [{ known }, typed, masterHash] = await Promise.all([
    fetchKnown(sender.origin),
    getTyped(sender.tab.id),
    master ? masterHashPrefix(master) : null,
  ]);
  const reason = validatePayload(endpoint, body, { known, typed, master, masterHash });
  if (reason) {
    await rejectRequest(sender.tab.id, msg.url, reason);
    return fail;
  }
  const r = await fetch(u.href, {
    method: "POST",
    body: msg.body,
    headers: msg.contentType ? { "Content-Type": msg.contentType } : {},
    credentials: "include",
    cache: "no-store",
  });
  knownCache.delete(sender.origin); // the write changed server data
  const headers = [...r.headers].map(([k, v]) => `${k}: ${v}`).join("\r\n");
  return { status: r.status, statusText: r.statusText, headers, body: await r.text() };
}

// Login/register form posts are navigations: they can't be held back, but their
// fields are checked and anything unexpected is flagged.
async function checkAuthForm(details) {
  const reason = validateAuthForm(details.requestBody?.formData, await getTyped(details.tabId));
  if (!reason) return;
  const g = await getGuard(details.tabId);
  if (!g) return;
  g.network.push({ url: details.url, type: "main_frame", blocked: true, rejected: reason });
  await saveGuard(details.tabId);
}

// ---- warning page

async function getWarning(sender) {
  const key = "warning:" + sender.tab.id;
  const { [key]: w } = await chrome.storage.session.get(key);
  return w ?? null;
}

async function proceed(sender) {
  const tabId = sender.tab.id;
  const w = await getWarning(sender);
  if (!w) return { ok: false };
  await chrome.storage.session.set({ ["proceed:" + tabId]: w.url });
  await chrome.tabs.update(tabId, { url: w.url });
  return { ok: true };
}

// ---------------------------------------------------------------- autofill

function randomToken() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

async function getPending(token) {
  if (typeof token !== "string" || !/^[0-9a-f]{32}$/.test(token)) return null;
  const key = "pending:" + token;
  const { [key]: p } = await chrome.storage.session.get(key);
  if (!p) return null;
  if (Date.now() - p.createdAt > PENDING_TTL_MS) {
    await chrome.storage.session.remove(key);
    return null;
  }
  return p;
}

function sendToFrame(p, message) {
  const opts = p.documentId ? { documentId: p.documentId } : { frameId: p.frameId };
  return chrome.tabs.sendMessage(p.tabId, message, opts);
}

const POPULAR_TTL_MS = 10 * 60 * 1000;

// The user's most used account names (for suggestions), as the site shows them.
async function getPopular() {
  const { popularCache } = await chrome.storage.session.get("popularCache");
  if (popularCache && Date.now() - popularCache.at < POPULAR_TTL_MS) return popularCache.names;
  const list = (await fetchJson("/commonaccounts")) ?? null; // count defaults to 10 server-side
  const names = Array.isArray(list) ? list.map((x) => x?.name).filter((n) => typeof n === "string" && n) : [];
  await chrome.storage.session.set({ popularCache: { at: Date.now(), names } });
  return names;
}

// A frame with a password field asks whether genpw.cc knows its site. The
// origin comes from Chrome (sender.origin), never from the page. Resources are
// matched by name (the name is part of the password; the stored URL is only a
// bookmark). force: the user asked from the popup, so open even without a match.
async function match(sender, msg) {
  const origin = sender.origin;
  if (!origin || origin === "null" || !sender.tab) return { status: "none" };
  let page;
  try {
    page = new URL(sender.url);
  } catch {
    return { status: "none" };
  }
  if (page.protocol !== "https:") return { status: "none" }; // never fill over plain http
  let data;
  try {
    data = await getData();
  } catch {
    return { status: "not-logged-in" };
  }
  const resources = data.resources.filter((r) => matchesResourceName(origin, r.name));
  if (!resources.length && !msg?.force) return { status: "none" };

  const guess = typeof msg?.usernameGuess === "string" ? msg.usernameGuess.trim().slice(0, 256) : "";
  const token = randomToken();
  await chrome.storage.session.set({
    ["pending:" + token]: {
      createdAt: Date.now(),
      tabId: sender.tab.id,
      frameId: sender.frameId,
      documentId: sender.documentId ?? null,
      origin,
      loginUrl: page.origin + page.pathname,
      hosts: hostHierarchy(page.hostname),
      resources,
      popular: await getPopular().catch(() => []),
      usernameGuess: guess,
      lastHash: data.userinfo?.last_hash ?? null,
    },
  });
  return { status: "match", token };
}

async function getPrompt(token) {
  const p = await getPending(token);
  if (!p) return { ok: false, error: "This request has expired. Reload the page to try again." };
  return {
    ok: true,
    origin: p.origin,
    loginUrl: p.loginUrl,
    hosts: p.hosts,
    suggested: suggestedDomain(new URL(p.origin).hostname),
    resources: p.resources,
    popular: p.popular,
    usernameGuess: p.usernameGuess,
    lastHash: p.lastHash,
  };
}

// The /generated request the site itself sends when you press Generate: creates
// the resource/account if new, stores changed params, marks the account as last
// used, and (if asked) remembers the login URL. Built here from the user's
// choices, restricted to what the prompt offered.
function buildSave(p, choice) {
  const name = String(choice?.name ?? "");
  const existing = p.resources.find((r) => r.name === name) ?? null;
  if (!existing && !p.hosts.includes(name)) return null;
  const length = Number(choice.length);
  if (!Number.isInteger(length) || length < 1 || length > 256) return null;
  const human = choice.account == null || String(choice.account).trim() === "" ? null : String(choice.account).trim().slice(0, 256);
  const acct = existing?.accounts.find((a) => (a.human_readable ?? null) === human) ?? null;
  const revision = String(choice.revision ?? "0").trim().slice(0, 256) || "0";
  return {
    resource: {
      id: existing?.id ?? null,
      last_account_id: existing?.last_account_id ?? null,
      name,
      url: choice.rememberUrl ? p.loginUrl : (existing?.url ?? "https://" + name),
      comment: existing?.comment ?? "",
      length,
      letters: !!choice.letters,
      digits: !!choice.digits,
      symbols: !!choice.symbols,
      underscore: !!choice.underscore,
    },
    account: {
      id: acct?.id ?? null,
      pass_part: acct?.pass_part ?? null,
      human_readable: human,
      revision,
      last_hash: acct?.last_hash ?? null,
      last_used_on: acct?.last_used_on ?? null,
    },
  };
}

async function saveGenerated(payload) {
  try {
    const r = await fetch(`${ORIGIN}/generated`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      credentials: "include",
      cache: "no-store",
    });
    await chrome.storage.session.remove("dataCache");
    return r.ok && (r.headers.get("content-type") ?? "").includes("application/json");
  } catch {
    return false;
  }
}

async function fill(token, username, password, choice) {
  const p = await getPending(token);
  if (!p) return { ok: false, error: "This request has expired." };
  if (typeof password !== "string" || !password) return { ok: false, error: "Nothing to fill." };
  const payload = choice ? buildSave(p, choice) : null;
  if (choice && !payload) return { ok: false, error: "Invalid resource or parameters." };
  await chrome.storage.session.remove("pending:" + token);
  let res;
  try {
    // The content script fills only if it is still on the origin we matched.
    res = await sendToFrame(p, { type: "genpw:fill", origin: p.origin, username: username ?? null, password });
  } catch (e) {
    return { ok: false, error: "The page is gone: " + (e?.message ?? e) };
  }
  if (!res?.ok) return res ?? { ok: false, error: "The page did not respond." };
  return { ...res, saved: payload ? await saveGenerated(payload) : null };
}

async function cancel(token) {
  const p = await getPending(token);
  if (!p) return { ok: true };
  await chrome.storage.session.remove("pending:" + token);
  await sendToFrame(p, { type: "genpw:close" }).catch(() => {});
  return { ok: true };
}

async function clearExpiredPending() {
  const all = await chrome.storage.session.get(null);
  const stale = Object.keys(all).filter(
    (k) => k.startsWith("pending:") && Date.now() - all[k].createdAt > PENDING_TTL_MS
  );
  if (stale.length) await chrome.storage.session.remove(stale);
}

// ---------------------------------------------------------------- popup

async function status(tabId) {
  const { account } = await chrome.storage.local.get("account");
  let loggedIn = false;
  try {
    await getData();
    loggedIn = true;
  } catch {
    /* not logged in or offline */
  }
  const verdictKey = "verdict:" + tabId;
  const { [verdictKey]: verdict } = await chrome.storage.session.get(verdictKey);
  return {
    username: account?.username ?? null,
    remembered: !!account?.passhash,
    loggedIn,
    verdict: verdict ?? null,
  };
}

async function fillPage(tabId) {
  await chrome.tabs.sendMessage(tabId, { type: "genpw:scan", force: true }).catch(() => {});
  return { ok: true };
}

// ---------------------------------------------------------------- wiring

const fromContent = (s) => !!s.tab && !s.url?.startsWith("chrome-extension:");
const fromPrompt = (s) => !!s.url?.startsWith(PROMPT_URL);
const fromPopup = (s) => !!s.url?.startsWith(POPUP_URL);
const fromWarning = (s) => !!s.tab && !!s.url?.startsWith(WARNING_URL);
const fromGuardedPage = (s) => fromContent(s) && s.frameId === 0 && PINNED.origins.includes(s.origin);

const handlers = {
  "genpw:match": (m, s) => fromContent(s) && match(s, m),
  "genpw:verifyPage": (m, s) => fromContent(s) && PINNED.origins.includes(s.origin) && verifyPage(m.report, s),
  "genpw:getPrompt": (m, s) => fromPrompt(s) && getPrompt(m.token),
  "genpw:fill": (m, s) => fromPrompt(s) && fill(m.token, m.username, m.password, m.choice),
  "genpw:cancel": (m, s) => fromPrompt(s) && cancel(m.token),
  "genpw:status": (m, s) => fromPopup(s) && status(m.tabId),
  "genpw:login": (m, s) => fromPopup(s) && login(m.username, m.password, !!m.remember),
  "genpw:logout": (m, s) => fromPopup(s) && logout(),
  "genpw:fillPage": (m, s) => fromPopup(s) && fillPage(m.tabId),
  "genpw:typed": (m, s) => fromGuardedPage(s) && addTyped(s, m.base, m.value),
  "genpw:proxy": (m, s) => fromGuardedPage(s) && proxyRequest(m, s),
  "genpw:getWarning": (m, s) => fromWarning(s) && getWarning(s),
  "genpw:proceed": (m, s) => fromWarning(s) && proceed(s),
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;
  const handler = handlers[message?.type];
  if (!handler) return false;
  Promise.resolve()
    .then(() => handler(message, sender))
    .then(
      (result) => sendResponse(result === false ? { ok: false, error: "Not allowed." } : result),
      (e) => sendResponse({ ok: false, error: String(e?.message ?? e) })
    );
  return true;
});

chrome.runtime.onInstalled.addListener(() => installDynamicRules());
chrome.runtime.onStartup.addListener(() => {
  installDynamicRules();
  clearExpiredPending();
});

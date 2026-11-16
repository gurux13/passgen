import { sha256Hex } from "./hash.js";
import { originMatches } from "./hosts.js";
import { checkPage, STATUS_TEXT } from "./verify.js";
import { PINNED } from "./pinned.js";

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

const BADGE = {
  ok: { text: "✓", color: "#2e7d32" },
  warn: { text: "✗", color: "#c62828" },
  fail: { text: "✗", color: "#c62828" },
};

async function verifyPage(report, sender) {
  const verdict = checkPage(report, sender.origin, PINNED);
  for (const item of verdict.items) item.reason = STATUS_TEXT[item.status] ?? item.status;
  const tabId = sender.tab.id;
  const badge = BADGE[verdict.status];
  await chrome.action.setBadgeText({ tabId, text: badge.text });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color });
  await chrome.storage.session.set({ ["verdict:" + tabId]: verdict });
  return verdict;
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") {
    chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    chrome.storage.session.remove("verdict:" + tabId);
  }
});
chrome.tabs.onRemoved.addListener((tabId) => chrome.storage.session.remove("verdict:" + tabId));

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

// A frame with a password field asks whether genpw.cc knows its site. The
// origin comes from Chrome (sender.origin), never from the page.
async function match(sender) {
  const origin = sender.origin;
  if (!origin || origin === "null" || !sender.tab) return { status: "none" };
  let data;
  try {
    data = await getData();
  } catch {
    return { status: "not-logged-in" };
  }
  const resources = data.resources.filter((r) => originMatches(origin, r.url));
  if (!resources.length) return { status: "none" };

  const token = randomToken();
  await chrome.storage.session.set({
    ["pending:" + token]: {
      createdAt: Date.now(),
      tabId: sender.tab.id,
      frameId: sender.frameId,
      documentId: sender.documentId ?? null,
      origin,
      resources,
      lastHash: data.userinfo?.last_hash ?? null,
    },
  });
  return { status: "match", token };
}

async function getPrompt(token) {
  const p = await getPending(token);
  if (!p) return { ok: false, error: "This request has expired. Reload the page to try again." };
  return { ok: true, origin: p.origin, resources: p.resources, lastHash: p.lastHash };
}

async function fill(token, username, password) {
  const p = await getPending(token);
  if (!p) return { ok: false, error: "This request has expired." };
  if (typeof password !== "string" || !password) return { ok: false, error: "Nothing to fill." };
  await chrome.storage.session.remove("pending:" + token);
  try {
    // The content script fills only if it is still on the origin we matched.
    const res = await sendToFrame(p, { type: "genpw:fill", origin: p.origin, username: username ?? null, password });
    return res ?? { ok: false, error: "The page did not respond." };
  } catch (e) {
    return { ok: false, error: "The page is gone: " + (e?.message ?? e) };
  }
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

const handlers = {
  "genpw:match": (m, s) => fromContent(s) && match(s),
  "genpw:verifyPage": (m, s) => fromContent(s) && PINNED.origins.includes(s.origin) && verifyPage(m.report, s),
  "genpw:getPrompt": (m, s) => fromPrompt(s) && getPrompt(m.token),
  "genpw:fill": (m, s) => fromPrompt(s) && fill(m.token, m.username, m.password),
  "genpw:cancel": (m, s) => fromPrompt(s) && cancel(m.token),
  "genpw:status": (m, s) => fromPopup(s) && status(m.tabId),
  "genpw:login": (m, s) => fromPopup(s) && login(m.username, m.password, !!m.remember),
  "genpw:logout": (m, s) => fromPopup(s) && logout(),
  "genpw:fillPage": (m, s) => fromPopup(s) && fillPage(m.tabId),
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

chrome.runtime.onStartup.addListener(clearExpiredPending);

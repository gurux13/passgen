import { hostHierarchy, matchesResourceName, originMatches, parseResourceUrl, suggestedDomain } from "../src/hosts.js";
import { checkPage, normalizeCode } from "../src/verify.js";
import { sha256Hex } from "../src/hash.js";
import { PINNED } from "../src/pinned.js";
import { buildDynamicRules, buildResourceUrlRules, resourceLinkUrls } from "../src/netguard.js";
import { describeUpdate } from "../src/updates.js";
import { collectKnown, masterHashPrefix, validateAuthForm, validatePayload } from "../src/payload.js";

const out = document.getElementById("out");
let passed = 0;
let failed = 0;

function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? passed++ : failed++;
  const pre = document.createElement("pre");
  pre.className = ok ? "pass" : "fail";
  pre.textContent = `${ok ? "PASS" : "FAIL"} ${name}` + (ok ? "" : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  out.append(pre);
}

// ---------------------------------------------------------------- host matching
const hostCases = [
  // [page origin, resource url, expected]
  ["https://example.com", "https://example.com", true],
  ["https://example.com", "https://example.com/login?x=1", true],
  ["https://login.example.com", "https://example.com", true],
  ["https://a.b.example.com", "https://example.com", true],
  ["https://EXAMPLE.com.", "example.com", true],
  ["https://example.com", "https://www.example.com", true],
  ["https://accounts.example.com", "https://www.example.com/", true],
  ["https://example.com", "https://login.example.com", false], // parent of a subdomain resource
  ["https://evilexample.com", "https://example.com", false],
  ["https://example.com.evil.net", "https://example.com", false],
  ["https://example.co", "https://example.com", false],
  ["https://example.com", "https://example.co", false],
  ["https://notexample.com", "example.com", false],
  ["https://example.com", "https://evil.net@example.com", true], // userinfo ignored by URL()
  ["https://evil.net", "https://evil.net@example.com", false],
  ["http://example.com", "https://example.com", false], // no downgrade to http
  ["http://example.com", "http://example.com", true],
  ["https://example.com", "http://example.com", true],
  ["https://example.com:8443", "https://example.com", true],
  ["https://192.168.1.1", "https://192.168.1.1", true],
  ["https://10.192.168.1.1", "https://192.168.1.1", false],
  ["https://x.192.168.1.1", "https://192.168.1.1", false],
  ["https://router.local", "router", false],
  ["https://router", "router", true],
  ["https://xn--e1afmkfd.xn--p1ai", "https://пример.рф", true],
  ["https://login.xn--e1afmkfd.xn--p1ai", "пример.рф", true],
  ["https://example.com", "", false],
  ["https://example.com", "https://", false],
  ["https://example.com", null, false],
  ["https://example.com", "javascript:alert(1)//example.com", false],
  ["https://example.com", "ftp://example.com", false],
  ["null", "https://example.com", false],
  ["https://www.com", "https://www.com", true],
];
for (const [page, res, want] of hostCases) check(`originMatches(${page}, ${res})`, originMatches(page, res), want);
check("parseResourceUrl strips www", parseResourceUrl("https://www.Example.com/x")?.host, "example.com");

// matching by resource name (the name is part of the password)
const nameCases = [
  ["https://github.com", "github.com", true],
  ["https://gist.github.com", "github.com", true],
  ["https://evilgithub.com", "github.com", false],
  ["https://github.com.evil.net", "github.com", false],
  ["https://github.com", "GitHub.com", true],
  ["https://example.com", "www.example.com", true],
  ["https://technogym.com", "technogym", false], // not a domain: never matches
  ["https://fs.example", "fs", false],
  ["https://example.com", "", false],
  ["https://example.com", null, false],
  ["http://example.com", "example.com", false], // https only
  ["https://login.xn--e1afmkfd.xn--p1ai", "пример.рф", true],
  ["https://example.com", "example.com/login", true],
];
for (const [page, name, want] of nameCases) check(`matchesResourceName(${page}, ${name})`, matchesResourceName(page, name), want);

check("hostHierarchy simple", hostHierarchy("login.accounts.example.com"), ["login.accounts.example.com", "accounts.example.com", "example.com"]);
check("hostHierarchy co.uk", hostHierarchy("www.argos.co.uk"), ["www.argos.co.uk", "argos.co.uk"]);
check("hostHierarchy two labels", hostHierarchy("github.com"), ["github.com"]);
check("hostHierarchy trailing dot/case", hostHierarchy("Mail.Example.COM."), ["mail.example.com", "example.com"]);
check("hostHierarchy IP", hostHierarchy("192.168.1.1"), ["192.168.1.1"]);
check("hostHierarchy single label", hostHierarchy("router"), ["router"]);
check("suggestedDomain", suggestedDomain("auth.gosuslugi.ru"), "gosuslugi.ru");
check("suggestedDomain com.au", suggestedDomain("my.bank.com.au"), "bank.com.au");

// ---------------------------------------------------------------- page verdicts
const pinned = {
  origins: ["https://genpw.cc", "https://passgen.ddns.net"],
  files: { "static/js/gen.js": ["aa", "a0"], "static/css/w3.css": ["bb"], "static/img/x.png": ["cc"] },
  inlineScripts: ["var a = 1;\n  var b = 2;"],
  inlineHandlers: ["w3_open()"],
};
const base = { inlineScripts: ["var a = 1; var b = 2;"], inlineHandlers: ["w3_open()"] };
const res = (url, kind, sha256) => ({ url, kind, sha256 });
const G = "https://genpw.cc";
const M = "https://passgen.ddns.net";
const verdict = (report, origin = G) => checkPage({ ...base, ...report }, origin, pinned).status;

check("verdict ok", verdict({ resources: [res(G + "/static/js/gen.js", "script", "aa"), res(G + "/static/css/w3.css?v=1", "style", "bb")] }), "ok");
check("verdict ok on mirror", verdict({ resources: [res(M + "/static/js/gen.js", "script", "aa")] }, M), "ok");
check("verdict mirror page loading genpw.cc script", verdict({ resources: [res(G + "/static/js/gen.js", "script", "aa")] }, M), "fail");
check("verdict mismatch", verdict({ resources: [res(G + "/static/js/gen.js", "script", "XX")] }), "fail");
check("verdict older release still accepted", verdict({ resources: [res(G + "/static/js/gen.js", "script", "a0")] }), "ok");
check("mismatch item keeps path + hash",
  checkPage({ ...base, resources: [res(G + "/static/js/gen.js", "script", "XX")] }, G, pinned).items.map((i) => [i.path, i.sha256]), [["static/js/gen.js", "XX"]]);
// update hint (Web Store installs)
check("describeUpdate update_available", describeUpdate({ status: "update_available", version: "1.7.0", current: "1.6.0" }), "Updating the extension to 1.7.0 (you have 1.6.0)…");
check("describeUpdate quiet otherwise", ["no_update", "throttled", "unpacked", "error"].map((status) => describeUpdate({ status, current: "1.6.0" })), [null, null, null, null]);
check("pins are lists", Object.values(PINNED.files).every((v) => Array.isArray(v) && v.length >= 1 && v.length <= 4), true);
check("verdict unknown script", verdict({ resources: [res(G + "/static/js/evil.js", "script", "aa")] }), "fail");
check("verdict unknown image warns", verdict({ resources: [res(G + "/static/img/y.png", "other", "aa")] }), "warn");
check("verdict pinned image ok", verdict({ resources: [res(G + "/static/img/x.png", "other", "cc")] }), "ok");
check("verdict external script fails", verdict({ resources: [res("https://ajax.googleapis.com/a.js", "script", null)] }), "fail");
check("verdict external font warns", verdict({ resources: [res("https://fonts.gstatic.com/a.woff2", "other", null)] }), "warn");
check("verdict extension ignored", verdict({ resources: [res("chrome-extension://abc/x.js", "script", null)] }), "ok");
check("verdict unknown inline script", verdict({ inlineScripts: ["steal()"], resources: [] }), "fail");
check("verdict unknown handler", verdict({ inlineHandlers: ["fetch('//x')"], resources: [] }), "fail");
check("verdict unreadable warns", verdict({ resources: [res(G + "/static/js/gen.js", "script", null)] }), "warn");
check("verdict __proto__ path", verdict({ resources: [res(G + "/__proto__", "script", "aa")] }), "fail");
check("normalizeCode", normalizeCode("  a\r\n\t b  "), "a b");

// network log merged in by the background
const pinnedNet = { ...pinned, endpoints: { get: ["batchresources"], post: [] } };
const net = (url, type, extra = {}) => ({ url, type, blocked: false, ...extra });
const vNet = (network, report = {}) => checkPage({ ...base, resources: [], ...report }, G, pinnedNet, network).status;
check("network: blocked request fails", vNet([net("https://evil.example/x", "xmlhttprequest", { blocked: true })]), "fail");
check("network: own API xhr ok", vNet([net(G + "/batchresources", "xmlhttprequest")]), "ok");
check("network: xhr of pinned file ok", vNet([net(G + "/static/js/gen.js", "xmlhttprequest")]), "ok");
check("network: pinned script hashed by background ok", vNet([net(G + "/static/js/gen.js", "script", { sha256: "aa" })]), "ok");
check("network: pinned script with wrong bytes fails", vNet([net(G + "/static/js/gen.js", "script", { sha256: "XX" })]), "fail");
check("network: script removed from DOM still checked", vNet([net(G + "/static/js/evil.js", "script")]), "fail");
check("network: report hash wins over unhashed network entry",
  vNet([net(G + "/static/js/gen.js", "script")], { resources: [res(G + "/static/js/gen.js", "script", "aa")] }), "ok");
check("network: blocked listed once",
  checkPage({ ...base }, G, pinnedNet, [net("https://e.x/1", "image", { blocked: true }), net("https://e.x/1", "image", { blocked: true })]).items.length, 1);
check("service worker fails", checkPage({ ...base, serviceWorker: true }, G, pinnedNet).status, "fail");

// ---------------------------------------------------------------- API payload validation
const serverData = {
  resources: [
    {
      id: 7, last_account_id: 9, name: "github.com", url: "https://github.com", comment: "work", length: 16,
      letters: true, digits: true, symbols: false, underscore: true,
      accounts: [{ id: 9, pass_part: null, human_readable: "gurux13", revision: "0", last_hash: "3896", last_used_on: 1794786000.5 }],
    },
  ],
  userinfo: { id: 1, last_resource_id: 7, last_hash: "3896" },
};
const known = collectKnown(serverData, [{ name: "me@example.com", count: 3 }]);
const MASTER = "correct horse battery";
const shaRef = await referenceFrame();
const masterHash = await masterHashPrefix(MASTER);
const ctx = (typed = [], extra = {}) => ({ known, typed, master: MASTER, masterHash, ...extra });
const existing = () => ({ ...serverData.resources[0], accounts: undefined });
const acct = () => ({ ...serverData.resources[0].accounts[0] });
const clean = (o) => JSON.parse(JSON.stringify(o));

check("payload: master hash matches sha.js", masterHash, shaRef.sha1hex(MASTER).substr(0, 4).toUpperCase());
check("payload: master hash matches sha.js (non-ASCII)", await masterHashPrefix("пароль ✓"), shaRef.sha1hex("пароль ✓").substr(0, 4).toUpperCase());
check("payload: generated with existing data ok", validatePayload("generated", clean({ resource: existing(), account: acct() }), ctx()), null);
check("payload: new resource from typed name ok",
  validatePayload("generated", clean({ resource: { id: null, last_account_id: null, name: "new.site", url: "https://new.site", comment: "", length: 12, letters: true, digits: true, symbols: true, underscore: true }, account: { id: null, pass_part: null, human_readable: null, revision: "0", last_hash: null, last_used_on: null } }), ctx(["new.site"])), null);
check("payload: typed length ok", validatePayload("generated", clean({ resource: { ...existing(), length: 20 }, account: acct() }), ctx(["20"])), null);
check("payload: popular account name ok", validatePayload("generated", clean({ resource: existing(), account: { ...acct(), id: null, human_readable: "me@example.com" } }), ctx()), null);
check("payload: master in comment rejected", /master password/.test(validatePayload("generated", clean({ resource: { ...existing(), comment: MASTER }, account: acct() }), ctx()) ?? ""), true);
check("payload: master fragment rejected", /master password/.test(validatePayload("generated", clean({ resource: { ...existing(), comment: "x horse batt y" }, account: acct() }), ctx()) ?? ""), true);
check("payload: untyped string rejected", /not a value/.test(validatePayload("generated", clean({ resource: { ...existing(), comment: "c2VjcmV0" }, account: acct() }), ctx()) ?? ""), true);
check("payload: untyped number rejected", /not a value/.test(validatePayload("generated", clean({ resource: { ...existing(), length: 1337 }, account: acct() }), ctx()) ?? ""), true);
check("payload: extra field rejected", /unexpected field/.test(validatePayload("generated", clean({ resource: existing(), account: acct(), x: "y" }), ctx()) ?? ""), true);
check("payload: newsha with real hash ok", validatePayload("newsha", { resource_id: 7, account_id: 9, sha: masterHash, global: true }, ctx()), null);
check("payload: newsha with other hash rejected", /doesn't match/.test(validatePayload("newsha", { resource_id: 7, account_id: 9, sha: "ABCD", global: true }, ctx()) ?? ""), true);
check("payload: newsha without master rejected", validatePayload("newsha", { resource_id: 7, account_id: 9, sha: masterHash, global: true }, ctx([], { master: null, masterHash: null })) !== null, true);
check("payload: newurl typed ok", validatePayload("newurl", { resource_id: 7, url: "https://gh.example" }, ctx(["gh.example"])), null);
check("payload: newurl untyped rejected", validatePayload("newurl", { resource_id: 7, url: "https://evil.example/?m=1" }, ctx()) !== null, true);
check("payload: deleteresource known id ok", validatePayload("deleteresource", 7, ctx()), null);
check("payload: deleteresource unknown id rejected", validatePayload("deleteresource", 31337, ctx()) !== null, true);
check("payload: updateresource with link_url ok", validatePayload("updateresource", clean({ ...serverData.resources[0], link_url: "https://github.com", comment: "new comment" }), ctx(["new comment"])), null);
check("auth form: login ok", validateAuthForm({ username: ["gurux18"], passhash: ["a".repeat(64)] }, ["gurux18"]), null);
check("auth form: untyped username rejected", validateAuthForm({ username: [MASTER], passhash: ["a".repeat(64)] }, ["gurux18"]) !== null, true);
check("auth form: extra field rejected", validateAuthForm({ username: ["gurux18"], passhash: ["a".repeat(64)], m: ["x"] }, ["gurux18"]) !== null, true);
check("auth form: non-hash passhash rejected", validateAuthForm({ username: ["gurux18"], passhash: ["secret"] }, ["gurux18"]) !== null, true);

// allowlist rules (declarativeNetRequest)
const rules = buildDynamicRules(PINNED);
const blockRule = rules.find((r) => r.action.type === "block");
check("dnr: block rule covers both sites", blockRule.condition.initiatorDomains, ["genpw.cc", "passgen.ddns.net"]);
check("dnr: allow rules = pinned files + API + 2 page rules, per site", rules.filter((r) => r.action.type === "allow").length, PINNED.origins.length * (Object.keys(PINNED.files).length + 3));
check("dnr: unique ids", new Set(rules.map((r) => r.id)).size, rules.length);
const allowRes = rules.filter((r) => r.action.type === "allow").map((r) => ({ re: new RegExp(r.condition.regexFilter), types: r.condition.resourceTypes }));
const allowRes2 = rules.filter((r) => r.action.type === "allow").map((r) => ({ re: new RegExp(r.condition.regexFilter), types: r.condition.resourceTypes, excluded: r.condition.excludedResourceTypes ?? [], methods: r.condition.requestMethods }));
const allowed = (url, type = "script", method = "get") => allowRes2.some((a) => a.re.test(url) && (!a.types || a.types.includes(type)) && !a.excluded.includes(type) && (!a.methods || a.methods.includes(method)));
check("dnr: pinned script allowed", allowed("https://genpw.cc/static/js/gen.js"), true);
check("dnr: pinned font with ?v allowed", allowed("https://genpw.cc/static/fonts/fontawesome-webfont.woff2?v=4.7.0", "font"), true);
check("dnr: mirror allowed", allowed("https://passgen.ddns.net/static/js/sha.js"), true);
check("dnr: API xhr allowed", allowed("https://genpw.cc/batchresources", "xmlhttprequest"), true);
check("dnr: API as script not allowed", allowed("https://genpw.cc/batchresources", "script"), false);
check("dnr: unpinned path blocked", allowed("https://genpw.cc/static/js/evil.js"), false);
check("dnr: suffix trick blocked", allowed("https://genpw.cc/static/js/gen.js.evil"), false);
check("dnr: path suffix blocked", allowed("https://genpw.cc/static/js/gen.js/x"), false);
check("dnr: other host blocked", allowed("https://genpw.cc.evil.com/static/js/gen.js"), false);
check("dnr: commonaccounts with count allowed", allowed("https://genpw.cc/commonaccounts?count=5", "xmlhttprequest"), true);
check("dnr: commonaccounts with extra params blocked", allowed("https://genpw.cc/commonaccounts?count=5&m=secret", "xmlhttprequest"), false);
check("dnr: POST /generated from page blocked", allowed("https://genpw.cc/generated", "xmlhttprequest", "post"), false);
check("dnr: GET batchresources with query blocked", allowed("https://genpw.cc/batchresources?m=1", "xmlhttprequest"), false);
check("dnr: navigate to site page allowed", allowed("https://genpw.cc/resources", "main_frame"), true);
check("dnr: navigate to index allowed", allowed("https://genpw.cc/", "main_frame"), true);
check("dnr: navigate with query blocked", allowed("https://genpw.cc/?m=secret", "main_frame"), false);
check("dnr: login form post allowed", allowed("https://genpw.cc/auth/login", "main_frame", "post"), true);
check("dnr: post to index blocked", allowed("https://genpw.cc/", "main_frame", "post"), false);
check("dnr: navigate elsewhere blocked", allowed("https://evil.example/?m=secret", "main_frame"), false);
const linkUrls = resourceLinkUrls([{ url: "github.com" }, { url: "https://example.com/login" }, { url: "" }, { url: "javascript:alert(1)" }]);
check("dnr: resource link urls normalized", linkUrls, ["https://github.com/", "https://example.com/login"]);
const linkRules = buildResourceUrlRules(linkUrls);
check("dnr: resource link rules are exact", linkRules.map((r) => r.condition.urlFilter), ["|https://github.com/|", "|https://example.com/login|"]);
check("dnr: cloudflare blocked", allowed("https://genpw.cc/cdn-cgi/challenge-platform/scripts/jsd/main.js?ray=1"), false);

// ---------------------------------------------------------------- hardcoded hashes vs repo files
check("pinned origins", PINNED.origins, ["https://genpw.cc", "https://passgen.ddns.net"]);
check("pinned is frozen", Object.isFrozen(PINNED), true);
for (const path of Object.keys(PINNED.files)) {
  const buf = await (await fetch("../../py/" + path, { cache: "no-store" })).arrayBuffer();
  check(`pinned hash ${path} (current file is newest)`, PINNED.files[path][0], await sha256Hex(buf));
}

// ---------------------------------------------------------------- packaged generator
const PACKAGED = new URL("../generator/", location.href).href;
for (const path of PINNED.generator) {
  const name = path.split("/").pop();
  const [packaged, repo] = await Promise.all(
    [PACKAGED + name, "../../py/" + path].map(async (u) => new Uint8Array(await (await fetch(u, { cache: "no-store" })).arrayBuffer()))
  );
  check(`packaged ${name} is byte-identical to py/${path}`, packaged.length === repo.length && packaged.every((b, i) => b === repo[i]), true);
}

// ---------------------------------------------------------------- generator parity
// Reference: sha.js + crypto.js loaded with plain <script> tags, as on genpw.cc.
function referenceFrame() {
  return new Promise((resolve) => {
    const f = document.createElement("iframe");
    f.hidden = true;
    f.srcdoc = `<script src="${new URL("../../py/static/js/sha.js", location.href)}"><\/script>` +
      `<script src="${new URL("../../py/static/js/crypto.js", location.href)}"><\/script>`;
    f.onload = () => resolve(f.contentWindow);
    document.body.append(f);
  });
}
// Extension path: sandbox/generator.js fed with the downloaded sources.
function sandboxFrame() {
  return new Promise((resolve) => {
    const f = document.createElement("iframe");
    f.hidden = true;
    f.src = "../sandbox/generator.html";
    f.onload = () => resolve(f.contentWindow);
    document.body.append(f);
  });
}

const ref = await referenceFrame();
const sandbox = await sandboxFrame();
let id = 0;
function viaSandbox(args) {
  const myId = ++id;
  return new Promise((resolve) => {
    const h = (e) => {
      if (e.source !== sandbox || e.data?.id !== myId) return;
      window.removeEventListener("message", h);
      resolve(e.data);
    };
    window.addEventListener("message", h);
    sandbox.postMessage({ id: myId, args }, "*");
  });
}

const genCases = [
  { resourceName: "example.com", account: null, length: 12, revision: "0", master: "hunter2", letters: true, digits: true, symbols: true, underscore: true },
  { resourceName: "Почта", account: "me@example.com", length: 16, revision: "3", master: "пароль мастер", letters: true, digits: true, symbols: false, underscore: true },
  { resourceName: "bank", account: "user", length: 6, revision: "0", master: "x", letters: false, digits: true, symbols: false, underscore: false },
  { resourceName: "site", account: "a", length: 30, revision: "1", master: "p@ss w0rd!", letters: true, digits: false, symbols: true, underscore: false },
];
for (const a of genCases) {
  const want = ref.generate(a.resourceName, a.account, a.length, a.revision, a.master, a.letters, a.digits, a.symbols, a.underscore);
  const wantHash = ref.sha1hex(a.master).substr(0, 4).toUpperCase();
  const got = await viaSandbox(a);
  check(`generator parity ${a.resourceName}/${a.account}/${a.length}`, [got.ok, got.password, got.masterHash], [true, want, wantHash]);
}

document.getElementById("summary").innerHTML =
  `<h2 class="${failed ? "fail" : "pass"}">${passed} passed, ${failed} failed</h2>`;
window.__testResult = { passed, failed };

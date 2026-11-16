import { originMatches, parseResourceUrl } from "../src/hosts.js";
import { checkPage, normalizeCode } from "../src/verify.js";
import { sha256Hex } from "../src/hash.js";
import { PINNED } from "../src/pinned.js";
import { fetchGenerator, fetchVerifiedGenerator } from "../src/generator-source.js";

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

// ---------------------------------------------------------------- page verdicts
const pinned = {
  origins: ["https://genpw.cc", "https://passgen.ddns.net"],
  files: { "static/js/gen.js": "aa", "static/css/w3.css": "bb", "static/img/x.png": "cc" },
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

// ---------------------------------------------------------------- hardcoded hashes vs repo files
check("pinned origins", PINNED.origins, ["https://genpw.cc", "https://passgen.ddns.net"]);
check("pinned is frozen", Object.isFrozen(PINNED), true);
for (const path of Object.keys(PINNED.files)) {
  const buf = await (await fetch("../../py/" + path, { cache: "no-store" })).arrayBuffer();
  check(`pinned hash ${path}`, await sha256Hex(buf), PINNED.files[path]);
}

// ---------------------------------------------------------------- download + verify generator
const LOCAL = new URL("../../py", location.href).href;
const tampered = "https://tampered.invalid";
const down = "https://down.invalid";
const fakeFetch = (url, opts) => {
  check(`fetch uses no-store (${url.split("/").pop()})`, opts.cache, "no-store");
  if (url.startsWith(tampered)) return Promise.resolve(new Response("function generate(){return 'pwned'}"));
  if (url.startsWith(down)) return Promise.reject(new TypeError("Failed to fetch"));
  return fetch(url, opts);
};
const sources = await fetchVerifiedGenerator({ origins: [down, tampered, LOCAL], fetchImpl: fakeFetch });
check("generator falls back past down + tampered origins", sources.length, 2);
let error = null;
try {
  await fetchVerifiedGenerator({ origins: [tampered, down], fetchImpl: fakeFetch });
} catch (e) {
  error = e.message;
}
check("generator rejects tampered code", /hash does not match/.test(error ?? ""), true);
const lenient = await fetchGenerator({ origins: [tampered], fetchImpl: fakeFetch });
check("fetchGenerator returns unverified code for explicit opt-in", [lenient.verified, lenient.sources.length, lenient.mismatched.length], [false, 2, 2]);
const good = await fetchGenerator({ origins: [tampered, LOCAL], fetchImpl: fakeFetch });
check("fetchGenerator prefers a verified copy", [good.verified, good.mismatched.length], [true, 0]);
let offlineError = null;
try {
  await fetchGenerator({ origins: [down], fetchImpl: fakeFetch });
} catch (e) {
  offlineError = e.message;
}
check("fetchGenerator throws when nothing downloads", /Could not download/.test(offlineError ?? ""), true);

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
    sandbox.postMessage({ id: myId, sources, args }, "*");
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

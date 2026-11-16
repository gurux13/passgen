// Sandboxed page (opaque origin, no extension APIs, no network: see
// content_security_policy.sandbox in manifest.json). It evaluates the verified
// genpw.cc generator scripts (sha.js + crypto.js) exactly as downloaded, then
// calls their generate() the same way py/static/js/gen.js does.

let loadedKey = null;

// The prompt verifies the sources against the hardcoded hashes before every
// call. They are always the same pinned bytes, so evaluating once is enough.
function load(sources) {
  const key = sources.join("\u0000");
  if (key === loadedKey) return;
  if (loadedKey !== null) throw new Error("Generator already initialised with different code; reload.");
  // Indirect eval = global scope, like a classic <script> on genpw.cc.
  for (const src of sources) (0, eval)(src);
  if (typeof generate !== "function" || typeof sha1hex !== "function") {
    throw new Error("genpw.cc generator did not define generate()/sha1hex().");
  }
  loadedKey = key;
}

window.addEventListener("message", (event) => {
  // Only our parent (the extension prompt page) talks to us.
  if (event.source !== window.parent) return;
  const { id, ping, sources, args } = event.data ?? {};
  const reply = (payload) => window.parent.postMessage({ id, ...payload }, "*");
  // Handshake: lets the prompt confirm this page actually loaded and runs.
  if (ping) return reply({ ok: true, pong: true });
  try {
    load(sources);
    const { resourceName, account, length, revision, master, letters, digits, symbols, underscore } = args;
    // Same call as generate_click() in gen.js.
    const password = generate(resourceName, account, length, revision, master, letters, digits, symbols, underscore);
    const masterHash = sha1hex(master).substr(0, 4).toUpperCase();
    reply({ ok: true, password, masterHash });
  } catch (e) {
    reply({ ok: false, error: String(e?.message ?? e) });
  }
});

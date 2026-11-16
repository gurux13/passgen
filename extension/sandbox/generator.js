// Sandboxed page (opaque origin, no extension APIs, no network: see
// content_security_policy.sandbox in manifest.json). sha.js and crypto.js are
// genpw.cc's own generator scripts, packaged unmodified with the extension and
// loaded by generator.html; the prompt checks them against the pinned hashes
// before using this page. generate() is called the same way gen.js does.

window.addEventListener("message", (event) => {
  // Only our parent (the extension prompt page) talks to us.
  if (event.source !== window.parent) return;
  const { id, ping, args } = event.data ?? {};
  const reply = (payload) => window.parent.postMessage({ id, ...payload }, "*");
  try {
    if (typeof generate !== "function" || typeof sha1hex !== "function") {
      throw new Error("Generator scripts are missing: run extension/tools/sync_ethalon.py.");
    }
    // Handshake: lets the prompt confirm this page actually loaded and runs.
    if (ping) return reply({ ok: true, pong: true });
    const { resourceName, account, length, revision, master, letters, digits, symbols, underscore } = args;
    // Same call as generate_click() in gen.js.
    const password = generate(resourceName, account, length, revision, master, letters, digits, symbols, underscore);
    const masterHash = sha1hex(master).substr(0, 4).toUpperCase();
    reply({ ok: true, password, masterHash });
  } catch (e) {
    reply({ ok: false, error: String(e?.message ?? e) });
  }
});

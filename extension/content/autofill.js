// Runs in every http(s) frame. When the frame shows a password field and
// genpw.cc has a resource for this site, opens the extension's prompt (an
// extension-origin iframe, so the page cannot read the master password) and
// fills the result.
(() => {
  if (window.__genpwAutofill) return;
  window.__genpwAutofill = true;

  let asked = false;
  let promptHost = null;
  let promptFrame = null;

  function visible(el) {
    if (el.disabled || el.readOnly) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none" && st.opacity !== "0";
  }

  function passwordFields() {
    return [...document.querySelectorAll('input[type="password"]')].filter(visible);
  }

  async function scan(force) {
    if (promptHost) return;
    if (asked && !force) return;
    const fields = passwordFields();
    if (!fields.length) return;
    asked = true;
    // Whatever is already in the username field, as a guess for the account.
    const usernameGuess = findUsernameField(fields[0])?.value ?? "";
    let res;
    try {
      res = await chrome.runtime.sendMessage({ type: "genpw:match", force: !!force, usernameGuess });
    } catch {
      return; // extension reloaded
    }
    if (res?.status === "match") showPrompt(res.token);
  }

  function showPrompt(token) {
    removePrompt();
    const host = document.createElement("div");
    host.style.cssText = "all:initial;position:fixed;top:12px;right:12px;z-index:2147483647;";
    const root = host.attachShadow({ mode: "closed" });
    const frame = document.createElement("iframe");
    frame.src = chrome.runtime.getURL("prompt/prompt.html") + "#" + token;
    frame.style.cssText =
      "display:block;width:340px;height:60px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);" +
      "border:0;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.35);background:#1f1f1f;color-scheme:dark;";
    root.append(frame);
    document.documentElement.append(host);
    promptHost = host;
    promptFrame = frame;
  }

  function removePrompt() {
    promptHost?.remove();
    promptHost = null;
    promptFrame = null;
  }

  // The prompt reports its content height; size the frame to fit it. Only
  // messages from our own frame are accepted (the page can't forge event.source).
  const extensionOrigin = new URL(chrome.runtime.getURL("")).origin;
  window.addEventListener("message", (event) => {
    if (!promptFrame || event.source !== promptFrame.contentWindow || event.origin !== extensionOrigin) return;
    const height = Number(event.data?.genpwPromptHeight);
    if (Number.isFinite(height) && height > 0 && height < 2000) promptFrame.style.height = `${height}px`;
  });

  function setValue(el, value) {
    el.focus();
    // Native setter so frameworks (React etc.) notice the change.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findUsernameField(pw) {
    const scope = pw.form ?? document;
    const candidates = [...scope.querySelectorAll("input")].filter(
      (i) => ["text", "email", "tel"].includes(i.type) && visible(i)
    );
    const tagged = candidates.find((i) => /\b(username|email)\b/i.test(i.autocomplete));
    if (tagged) return tagged;
    const before = candidates.filter((i) => i.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING);
    return before.at(-1) ?? null;
  }

  function fill(username, password) {
    const fields = passwordFields();
    if (!fields.length) return { ok: false, error: "No password field on the page." };
    const pw = fields.includes(document.activeElement) ? document.activeElement : fields[0];
    let usernameFilled = false;
    if (username) {
      const u = findUsernameField(pw);
      if (u) {
        if (u.value !== username) setValue(u, username);
        usernameFilled = true;
      }
    }
    setValue(pw, password);
    return { ok: true, usernameFilled };
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    switch (msg?.type) {
      case "genpw:fill":
        // Refuse if this frame navigated away from the origin that was matched.
        if (msg.origin !== location.origin) {
          sendResponse({ ok: false, error: "The page changed origin." });
          return false;
        }
        removePrompt();
        sendResponse(fill(msg.username, msg.password));
        return false;
      case "genpw:close":
        removePrompt();
        return false;
      case "genpw:scan":
        scan(!!msg.force);
        return false;
    }
    return false;
  });

  // Login forms often appear after load (SPAs, modals).
  let timer = null;
  new MutationObserver(() => {
    if (asked) return;
    clearTimeout(timer);
    timer = setTimeout(() => scan(false), 400);
  }).observe(document.documentElement, { childList: true, subtree: true });

  scan(false);
})();

const TIMEOUT_MS = 10000;
const DEFAULTS = { length: 12, revision: "0", letters: true, digits: true, symbols: true, underscore: true };
const token = location.hash.slice(1);

const $ = (id) => document.getElementById(id);
const form = $("form");
const resourceSelect = $("resource");
const accountInput = $("account");
const masterInput = $("master");
const fillButton = $("fill");
const param = {
  length: $("length"),
  revision: $("revision"),
  letters: $("letters"),
  digits: $("digits"),
  symbols: $("symbols"),
  underscore: $("underscore"),
};

let info = null;
let confirmMismatchFor = null; // master hash the user agreed to fill despite mismatch

function showMessage(text, cls = "") {
  const el = $("message");
  el.textContent = text;
  el.className = "small " + cls;
  el.hidden = !text;
}

function showError(text) {
  form.hidden = true;
  $("error").textContent = text;
  $("error").hidden = false;
}

function close() {
  masterInput.value = "";
  chrome.runtime.sendMessage({ type: "genpw:cancel", token });
}

function withTimeout(promise, ms, what) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} did not respond.`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// ---- generator: genpw.cc's sha.js + crypto.js (packaged) running in the sandbox frame

let generatorFrame = null;
let generatorReady = null;
let requestId = 0;

function callSandbox(payload) {
  const id = ++requestId;
  const reply = new Promise((resolve, reject) => {
    const onMessage = (event) => {
      if (event.source !== generatorFrame.contentWindow || event.data?.id !== id) return;
      window.removeEventListener("message", onMessage);
      if (event.data.ok) resolve(event.data);
      else reject(new Error(event.data.error));
    };
    window.addEventListener("message", onMessage);
  });
  // The sandbox has an opaque origin, so "*" is the only possible target.
  generatorFrame.contentWindow.postMessage({ id, ...payload }, "*");
  return withTimeout(reply, TIMEOUT_MS, "The generator");
}

// Creates the sandbox frame (listener attached before src, so the load event
// can't be missed) and checks it really runs: a blocked frame also fires load.
function ensureGenerator() {
  generatorReady ??= (async () => {
    generatorFrame = document.createElement("iframe");
    generatorFrame.hidden = true;
    const loaded = new Promise((resolve) => generatorFrame.addEventListener("load", resolve, { once: true }));
    generatorFrame.src = chrome.runtime.getURL("sandbox/generator.html");
    document.body.append(generatorFrame);
    await withTimeout(loaded, TIMEOUT_MS, "The generator");
    await callSandbox({ ping: true });
  })().catch((e) => {
    generatorFrame?.remove();
    generatorReady = null;
    throw e;
  });
  return generatorReady;
}

// ---- state

const currentResource = () => info.resources.find((r) => r.name === resourceSelect.value) ?? null;
const accountName = () => accountInput.value.trim() || null; // empty = the default account
const currentAccount = () => currentResource()?.accounts.find((a) => (a.human_readable ?? null) === accountName()) ?? null;

function readParams() {
  return {
    length: parseInt(param.length.value, 10),
    revision: param.revision.value.trim() || "0",
    letters: param.letters.checked,
    digits: param.digits.checked,
    symbols: param.symbols.checked,
    underscore: param.underscore.checked,
  };
}

// Same notation as the site: |length| #revision A0@_
function updateSummary() {
  const p = readParams();
  const chars = (p.letters ? "A" : "") + (p.digits ? "0" : "") + (p.symbols ? "@" : "") + (p.underscore ? "_" : "") || "????";
  $("params-summary").textContent = `|${Number.isFinite(p.length) ? p.length : "?"}| #${p.revision} ${chars}`;
}

function updateTags() {
  $("resource-new").hidden = !!currentResource();
  $("account-new").hidden = !!currentAccount();
}

function onAccountChanged() {
  const acct = currentAccount();
  if (acct) param.revision.value = acct.revision ?? "0";
  updateTags();
  updateSummary();
  resetConfirmation();
}

function onResourceChanged() {
  const r = currentResource();
  const src = r ?? DEFAULTS;
  param.length.value = src.length;
  for (const k of ["letters", "digits", "symbols", "underscore"]) param[k].checked = !!src[k];
  param.revision.value = DEFAULTS.revision;

  // Account suggestions: this resource's accounts, then the most used ones.
  const names = [...new Set([...(r?.accounts ?? []).map((a) => a.human_readable).filter(Boolean), ...info.popular])];
  $("accounts").replaceChildren(
    ...names.map((n) => {
      const o = document.createElement("option");
      o.value = n;
      return o;
    })
  );
  // Best guess: the resource's last used account, else what's in the page's username field.
  if (r) {
    const last = r.accounts.find((a) => a.id === r.last_account_id) ?? r.accounts[0];
    accountInput.value = last?.human_readable ?? "";
  } else {
    accountInput.value = info.usernameGuess ?? "";
  }
  onAccountChanged();
}

function render() {
  $("site").textContent = new URL(info.origin).host;
  $("site").title = info.origin;
  // Existing resources for this site first, then the page's domain hierarchy.
  const names = [...new Set([...info.resources.map((r) => r.name), ...info.hosts])];
  resourceSelect.replaceChildren(
    ...names.map((n) => {
      const o = document.createElement("option");
      o.value = n;
      o.textContent = n;
      return o;
    })
  );
  resourceSelect.value = info.resources[0]?.name ?? info.suggested ?? names[0];
  onResourceChanged();
}

// ---- fill

async function onFill(event) {
  event.preventDefault();
  const master = masterInput.value;
  if (!master) return masterInput.focus();
  const p = readParams();
  if (!Number.isInteger(p.length) || p.length < 1 || p.length > 256) return showMessage("Length must be 1–256.", "bad");
  if (!p.letters && !p.digits && !p.symbols && !p.underscore) return showMessage("Pick at least one character set.", "bad");

  const name = resourceSelect.value;
  const acct = currentAccount();
  const human = accountName();
  fillButton.disabled = true;
  try {
    await ensureGenerator();
    const { password, masterHash } = await callSandbox({
      // Same arguments as generate_click() in gen.js.
      args: {
        resourceName: name,
        account: acct ? (acct.pass_part ?? acct.human_readable) : human,
        length: p.length,
        revision: p.revision,
        master,
        letters: p.letters,
        digits: p.digits,
        symbols: p.symbols,
        underscore: p.underscore,
      },
    });

    const expected = acct?.last_hash ?? info.lastHash ?? null;
    if (expected && masterHash !== expected && confirmMismatchFor !== masterHash) {
      confirmMismatchFor = masterHash;
      showMessage(`Master hash ${masterHash}, expected ${expected}`, "warn");
      fillButton.textContent = "Fill anyway";
      return;
    }

    const res = await withTimeout(
      chrome.runtime.sendMessage({
        type: "genpw:fill",
        token,
        username: human,
        password,
        choice: { name, account: human, ...p, rememberUrl: $("remember").checked },
      }),
      TIMEOUT_MS,
      "The page"
    );
    masterInput.value = "";
    if (!res?.ok) showError(res?.error ?? "Could not fill the page.");
  } catch (e) {
    showMessage(String(e?.message ?? e), "bad");
  } finally {
    fillButton.disabled = false;
  }
}

function resetConfirmation() {
  confirmMismatchFor = null;
  fillButton.textContent = "Fill";
  showMessage("");
}

// Tell the embedding content script how tall the content is, so the frame fits
// it exactly. Only a number is sent; the page could see it, which is harmless.
new ResizeObserver(() => {
  const height = Math.ceil(document.documentElement.getBoundingClientRect().height);
  window.parent.postMessage({ genpwPromptHeight: height }, "*");
}).observe(document.documentElement);

form.addEventListener("submit", onFill);
resourceSelect.addEventListener("change", onResourceChanged);
accountInput.addEventListener("input", onAccountChanged);
masterInput.addEventListener("input", resetConfirmation);
for (const el of Object.values(param)) {
  el.addEventListener("input", () => {
    updateSummary();
    resetConfirmation();
  });
}
$("params-toggle").addEventListener("click", () => ($("params").hidden = !$("params").hidden));
$("close").addEventListener("click", close);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") close();
});

(async () => {
  const [res, generator] = await Promise.all([
    chrome.runtime.sendMessage({ type: "genpw:getPrompt", token }),
    ensureGenerator().catch((e) => ({ error: e })),
  ]);
  if (!res?.ok) return showError(res?.error ?? "Request not found.");
  if (generator?.error) return showError(String(generator.error.message ?? generator.error));
  info = res;
  if (!info.resources.length && !info.hosts.length) return showError("No domain to save this site under.");
  render();
  form.hidden = false;
  masterInput.focus();
})();

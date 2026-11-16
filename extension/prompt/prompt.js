import { fetchGenerator } from "../src/generator-source.js";

const DEFAULT_ACCOUNT_NAME = "Default";
const TIMEOUT_MS = 10000;
const token = location.hash.slice(1);

const $ = (id) => document.getElementById(id);
const form = $("form");
const accountSelect = $("account");
const masterInput = $("master");
const fillButton = $("fill");

let options = []; // [{resource, account}]
let lastHash = null;
let sources = null; // generator code downloaded when the prompt opened
let confirmMismatchFor = null; // master hash the user agreed to fill despite mismatch

function setStatus(ok) {
  const el = $("status");
  el.textContent = ok ? "✓" : "✗";
  el.className = "status " + (ok ? "ok" : "bad");
  el.title = ok ? "genpw.cc code verified" : "genpw.cc code does not match the pinned hashes";
}

function showMessage(text, cls = "") {
  const el = $("message");
  el.textContent = text;
  el.className = "small " + cls;
  el.hidden = !text;
}

function showError(text) {
  form.hidden = true;
  $("untrusted").hidden = true;
  $("error").textContent = text;
  $("error").hidden = false;
}

function showForm() {
  $("untrusted").hidden = true;
  form.hidden = false;
  masterInput.focus();
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

// ---- generator: genpw.cc code running in the sandbox frame

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

// ---- UI

function render(info) {
  $("site").textContent = new URL(info.origin).host;
  $("site").title = info.origin;
  lastHash = info.lastHash;
  const multiple = info.resources.length > 1;
  options = [];
  let selected = 0;
  for (const resource of info.resources) {
    for (const account of resource.accounts) {
      if (resource === info.resources[0] && account.id === resource.last_account_id) selected = options.length;
      options.push({ resource, account });
      const name = account.human_readable ?? DEFAULT_ACCOUNT_NAME;
      const opt = document.createElement("option");
      opt.value = String(options.length - 1);
      opt.textContent = multiple ? `${resource.name} — ${name}` : name;
      accountSelect.append(opt);
    }
  }
  accountSelect.value = String(selected);
  accountSelect.disabled = options.length === 1;
  return options.length > 0;
}

async function onFill(event) {
  event.preventDefault();
  const master = masterInput.value;
  if (!master) return masterInput.focus();
  const { resource, account } = options[Number(accountSelect.value)];

  fillButton.disabled = true;
  try {
    await ensureGenerator();
    const { password, masterHash } = await callSandbox({
      sources,
      args: {
        resourceName: resource.name,
        account: account.pass_part ?? account.human_readable,
        length: resource.length,
        revision: account.revision,
        master,
        letters: resource.letters,
        digits: resource.digits,
        symbols: resource.symbols,
        underscore: resource.underscore,
      },
    });

    const expected = account.last_hash ?? lastHash ?? null;
    if (expected && masterHash !== expected && confirmMismatchFor !== masterHash) {
      confirmMismatchFor = masterHash;
      showMessage(`Master hash ${masterHash}, expected ${expected}`, "warn");
      fillButton.textContent = "Fill anyway";
      return;
    }

    const res = await withTimeout(
      chrome.runtime.sendMessage({ type: "genpw:fill", token, username: account.human_readable ?? null, password }),
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
masterInput.addEventListener("input", resetConfirmation);
accountSelect.addEventListener("change", resetConfirmation);
$("close").addEventListener("click", close);
$("use-anyway").addEventListener("click", showForm);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") close();
});

(async () => {
  const [info, generator] = await Promise.all([
    chrome.runtime.sendMessage({ type: "genpw:getPrompt", token }),
    // Downloaded and checked against the hardcoded hashes every time the prompt opens.
    withTimeout(fetchGenerator(), 20000, "genpw.cc").catch((e) => ({ error: e })),
  ]);
  if (!info?.ok) {
    setStatus(false);
    return showError(info?.error ?? "Request not found.");
  }
  if (!render(info)) {
    setStatus(false);
    return showError("No accounts for this site yet.");
  }
  if (generator.error) {
    setStatus(false);
    showError("genpw.cc unreachable");
    $("error").title = String(generator.error.message ?? generator.error);
    return;
  }
  sources = generator.sources;
  setStatus(generator.verified);
  if (generator.verified) showForm();
  else $("untrusted").hidden = false; // master password stays hidden until explicitly accepted
})();

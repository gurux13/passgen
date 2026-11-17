import { STATUS_TEXT } from "../src/verify.js";

const $ = (id) => document.getElementById(id);
const send = (message) => chrome.runtime.sendMessage(message);

let tabId = null;

function renderAccount(st) {
  $("signed-in").hidden = !st.loggedIn;
  $("login-form").hidden = st.loggedIn;
  if (st.loggedIn) $("username").textContent = st.username ?? "";
  else if (st.username) $("login-username").value = st.username;
}

// Only shown on genpw.cc / mirror pages: ✓, or ✗ that expands to the issue list.
function renderVerdict(verdict) {
  const status = $("status");
  const table = $("problems");
  status.hidden = !verdict;
  table.hidden = true;
  $("update").hidden = !verdict?.updateText;
  $("update").textContent = verdict?.updateText ?? "";
  if (!verdict) return;
  const ok = verdict.status === "ok";
  status.textContent = ok ? "✓" : "✗";
  status.className = "status " + (ok ? "ok" : "bad");
  status.title = ok ? "All assets match" : "Assets don't match — click for details";
  table.replaceChildren();
  for (const item of verdict.items) {
    if (item.status === "ok") continue;
    const row = table.insertRow();
    row.insertCell().textContent = item.url;
    row.insertCell().textContent = STATUS_TEXT[item.status] ?? item.status;
  }
  status.onclick = ok ? null : () => (table.hidden = !table.hidden);
}

async function refresh() {
  const st = await send({ type: "genpw:status", tabId });
  renderAccount(st);
  renderVerdict(st.verdict);
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("login-submit").disabled = true;
  $("login-error").hidden = true;
  const passwordInput = $("login-password");
  const res = await send({
    type: "genpw:login",
    username: $("login-username").value,
    password: passwordInput.value,
    remember: $("login-remember").checked,
  });
  passwordInput.value = "";
  $("login-submit").disabled = false;
  if (!res?.ok) {
    $("login-error").textContent = res?.error ?? "Sign in failed.";
    $("login-error").hidden = false;
    return;
  }
  refresh();
});

$("logout").addEventListener("click", async () => {
  await send({ type: "genpw:logout" });
  refresh();
});

$("fill-page").addEventListener("click", async () => {
  if (tabId == null) return;
  await send({ type: "genpw:fillPage", tabId });
  window.close();
});

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id ?? null;
  refresh();
})();

import { STATUS_TEXT } from "../src/verify.js";

const $ = (id) => document.getElementById(id);

$("close").addEventListener("click", async () => {
  const tab = await chrome.tabs.getCurrent();
  if (tab) chrome.tabs.remove(tab.id);
});

$("proceed").addEventListener("click", () => chrome.runtime.sendMessage({ type: "genpw:proceed" }));

(async () => {
  const w = await chrome.runtime.sendMessage({ type: "genpw:getWarning" });
  if (!w) {
    $("proceed").hidden = true;
    return;
  }
  $("host").textContent = new URL(w.url).host;
  for (const item of w.items) {
    if (item.status === "ok") continue;
    const row = $("issues").insertRow();
    row.insertCell().textContent = item.url;
    row.insertCell().textContent = STATUS_TEXT[item.status] ?? item.status;
  }
})();

// Runs in the page's own JS world on genpw.cc / mirror, before the site's scripts.
// POSTs to the site's write endpoints are not sent by the page: they're handed to
// the extension, which checks every value and sends the request itself. The reply
// is replayed on the XHR object, so jQuery/Angular work unchanged.
//
// This shim doesn't need to be tamper-proof: the browser blocks direct POSTs from
// the page (declarativeNetRequest), so bypassing it just gets the request cancelled
// and flagged, and anything sent through it is validated by the extension.
(() => {
  const POST_ENDPOINTS = new Set(["generated", "newsha", "newurl", "updateresource", "deleteresource"]);
  const RealXHR = window.XMLHttpRequest;
  const pending = new Map();
  let nextId = 1;

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.genpwProxy !== "res") return;
    const done = pending.get(event.data.id);
    if (done) {
      pending.delete(event.data.id);
      done(event.data);
    }
  });

  const define = (xhr, props) => {
    for (const [k, v] of Object.entries(props)) Object.defineProperty(xhr, k, { configurable: true, get: () => v });
  };

  class GuardedXHR extends RealXHR {
    open(method, url, ...rest) {
      this.__genpw = null;
      try {
        const u = new URL(url, location.href);
        if (String(method).toUpperCase() === "POST" && u.origin === location.origin && POST_ENDPOINTS.has(u.pathname.slice(1))) {
          this.__genpw = { url: u.href, headers: {} };
        }
      } catch {
        /* real XHR will report the bad URL */
      }
      return super.open(method, url, ...rest);
    }

    setRequestHeader(name, value) {
      if (this.__genpw) this.__genpw.headers[String(name).toLowerCase()] = String(value);
      return super.setRequestHeader(name, value);
    }

    send(body) {
      if (!this.__genpw) return super.send(body);
      const id = nextId++;
      const req = this.__genpw;
      define(this, { readyState: 1 });
      pending.set(id, (res) => {
        const headers = res.headers ?? "";
        define(this, {
          readyState: 4,
          status: res.status ?? 0,
          statusText: res.statusText ?? "",
          responseText: res.body ?? "",
          response: res.body ?? "",
          responseURL: req.url,
        });
        this.getAllResponseHeaders = () => headers;
        this.getResponseHeader = (name) => {
          const m = headers.match(new RegExp(`^${String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*(.*)$`, "im"));
          return m ? m[1] : null;
        };
        this.dispatchEvent(new Event("readystatechange"));
        this.dispatchEvent(new ProgressEvent(res.status ? "load" : "error"));
        this.dispatchEvent(new ProgressEvent("loadend"));
      });
      window.postMessage(
        { genpwProxy: "req", id, url: req.url, body: typeof body === "string" ? body : String(body ?? ""), contentType: req.headers["content-type"] ?? null },
        location.origin
      );
    }
  }

  window.XMLHttpRequest = GuardedXHR;
})();

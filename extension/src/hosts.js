// Matching a page origin against a genpw.cc resource URL.
//
// A page matches a resource only if its hostname is EXACTLY the resource host,
// or a subdomain of it (label boundary: "a.example.com" matches "example.com",
// "evilexample.com" and "example.com.evil.net" do not).

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

function normalizeHost(hostname) {
  return hostname.toLowerCase().replace(/\.$/, "");
}

// Parses the URL stored on a resource. Accepts bare hosts ("example.com") the
// same way the web UI does (it prepends https://). Returns null if unusable.
export function parseResourceUrl(raw) {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "https://" + s;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  let host = normalizeHost(u.hostname); // URL() already punycodes IDNs
  if (!host) return null;
  const isIp = IPV4.test(host) || host.startsWith("[");
  // "www.example.com" is treated as "example.com" so login.example.com matches too.
  if (!isIp && host.startsWith("www.") && host.split(".").length > 2) host = host.slice(4);
  return { host, isIp, protocol: u.protocol };
}

// pageOrigin: the origin (or URL) of the frame asking, as reported by Chrome.
export function originMatches(pageOrigin, resourceUrl) {
  const spec = parseResourceUrl(resourceUrl);
  if (!spec) return false;
  let page;
  try {
    page = new URL(pageOrigin);
  } catch {
    return false;
  }
  // Never fill over plain http unless the resource itself is an http URL.
  if (page.protocol !== "https:" && !(page.protocol === "http:" && spec.protocol === "http:")) return false;
  const host = normalizeHost(page.hostname);
  if (!host) return false;
  if (host === spec.host) return true;
  // Subdomain matching only for real domain names, never for IPs or single labels.
  if (spec.isIp || !spec.host.includes(".")) return false;
  return host.endsWith("." + spec.host);
}

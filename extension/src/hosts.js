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

// Second-level labels that usually belong to a public suffix ("co" in co.uk,
// "com" in com.au). Not a full public-suffix list: just enough to keep the
// domain choice from offering "co.uk".
const SUFFIX_SECOND_LEVEL = new Set(["co", "com", "net", "org", "gov", "edu", "ac", "or", "ne", "go", "gob", "mil", "nic", "ltd", "plc", "sch", "nhs"]);

// The domains a page could be saved under, most specific first:
// "login.accounts.example.co.uk" -> [login.accounts.example.co.uk, accounts.example.co.uk, example.co.uk]
export function hostHierarchy(hostname) {
  const host = normalizeHost(hostname);
  if (!host || IPV4.test(host) || host.startsWith("[") || !host.includes(".")) return host ? [host] : [];
  const labels = host.split(".");
  let minLabels = 2;
  if (labels.length >= 3 && labels.at(-1).length === 2 && SUFFIX_SECOND_LEVEL.has(labels.at(-2))) minLabels = 3;
  const out = [];
  for (let i = 0; labels.length - i >= minLabels; i++) out.push(labels.slice(i).join("."));
  return out.length ? out : [host];
}

// The domain to suggest for a new resource: the registrable part of the host.
export function suggestedDomain(hostname) {
  return hostHierarchy(hostname).at(-1) ?? "";
}

// Does this page belong to the resource? Resources are matched by their name (the
// name is part of the password); a name that isn't a domain never matches.
export function matchesResourceName(pageOrigin, name) {
  if (typeof name !== "string" || !/^[^\s/]+\.[^\s/]+/.test(name.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, ""))) return false;
  return originMatches(pageOrigin, name);
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

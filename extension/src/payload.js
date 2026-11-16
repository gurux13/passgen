// Validates what a genpw.cc page sends to the site's API.
//
// Every value in a request must be something the page legitimately has:
//   - data the server already holds for this user (from /batchresources and /commonaccounts),
//   - text the user actually typed into the page (trusted input events, recorded by the
//     extension's content script, never the master password field),
//   - or one of the site's own defaults.
// Nothing may contain the master password, and the master-hash prefix sent to /newsha
// must be the real one. Anything else is rejected and the request is not sent.

const DEFAULT_STRINGS = new Set(["", "0"]);
const DEFAULT_NUMBERS = new Set([0, 12]); // revision 0, default length 12 (gen.js makeNewResource)
// Keys the site's scripts send besides the fields of server objects.
const EXTRA_KEYS = new Set(["resource", "account", "resource_id", "account_id", "sha", "global", "link_url", "accounts"]);

// Everything the server already knows: leaf values and object keys.
export function collectKnown(...sources) {
  const values = new Set();
  const keys = new Set();
  const walk = (v) => {
    if (v === null || typeof v !== "object") return values.add(v);
    if (Array.isArray(v)) return v.forEach(walk);
    for (const [k, x] of Object.entries(v)) {
      keys.add(k);
      walk(x);
    }
  };
  sources.forEach(walk);
  return { values, keys };
}

// Values the user typed, plus what the site's own scripts derive from them.
export function expandTyped(typed) {
  const strings = new Set();
  const numbers = new Set();
  for (const t of typed) {
    if (typeof t !== "string") continue;
    strings.add(t);
    strings.add(t.trim());
    // gen.js: new resource url = "https://" + name; url edit adds https:// when missing.
    if (!t.includes("://")) strings.add("https://" + t);
    if (/^\s*-?\d+\s*$/.test(t)) numbers.add(parseInt(t, 10));
  }
  return { strings, numbers };
}

// sha1hex(master).substr(0, 4).toUpperCase() exactly as genpw.cc's jsSHA does it
// ("BYTES" input: char codes OR-ed into big-endian words without masking).
export async function masterHashPrefix(master) {
  const words = [];
  for (let i = 0; i < master.length; i++) {
    const w = i >>> 2;
    words[w] = (words[w] ?? 0) | (master.charCodeAt(i) << (8 * (3 - (i % 4))));
  }
  const bytes = new Uint8Array(master.length);
  for (let i = 0; i < master.length; i++) bytes[i] = (words[i >>> 2] >>> (8 * (3 - (i % 4)))) & 0xff;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
  return Array.from(digest.slice(0, 2), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function containsMaster(s, master) {
  if (!master || typeof s !== "string") return false;
  if (s.toLowerCase().includes(master.toLowerCase())) return true;
  // Long fragments of the master count too (split across fields or requests).
  const min = Math.max(6, Math.ceil(master.length / 2));
  if (master.length < min) return false;
  for (let i = 0; i + min <= master.length; i++) {
    if (s.includes(master.slice(i, i + min))) return true;
  }
  return false;
}

// endpoint: "generated" | "newsha" | ...; body: parsed JSON
// ctx: { known: collectKnown(...), typed: [string], master: string|null, masterHash: string|null }
// Returns null if OK, otherwise a short reason.
export function validatePayload(endpoint, body, ctx) {
  const typed = expandTyped(ctx.typed ?? []);
  const known = ctx.known;

  if (endpoint === "deleteresource") {
    return typeof body === "number" && known.values.has(body) ? null : "unknown resource id";
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) return "unexpected body";

  if (endpoint === "newsha") {
    if (!ctx.masterHash) return "master hash without a typed master password";
    if (body.sha !== ctx.masterHash) return "master hash doesn't match the typed master password";
  }

  let problem = null;
  const walk = (v, path) => {
    if (problem) return;
    if (v === null || typeof v === "boolean") return;
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
    if (typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (!known.keys.has(k) && !EXTRA_KEYS.has(k)) return (problem = `unexpected field ${path}.${k}`);
        walk(x, `${path}.${k}`);
      }
      return;
    }
    if (typeof v === "string") {
      if (containsMaster(v, ctx.master)) return (problem = `${path} contains the master password`);
      if (endpoint === "newsha" && path === "$.sha") return; // checked above
      if (known.values.has(v) || typed.strings.has(v) || DEFAULT_STRINGS.has(v)) return;
      return (problem = `${path} is not a value the user entered`);
    }
    if (typeof v === "number") {
      if (known.values.has(v) || typed.numbers.has(v) || DEFAULT_NUMBERS.has(v)) return;
      return (problem = `${path} is not a value the user entered`);
    }
    problem = `${path} has an unexpected type`;
  };
  walk(body, "$");
  return problem;
}

// Form posts to /auth/login and /auth/register (navigations).
export function validateAuthForm(formData, typed) {
  const allowed = { username: "typed", password: "empty", password2: "empty", passhash: "hash" };
  const t = expandTyped(typed ?? []).strings;
  for (const [k, values] of Object.entries(formData ?? {})) {
    const rule = allowed[k];
    if (!rule) return `unexpected form field ${k}`;
    for (const v of values) {
      if (rule === "empty" && v !== "") return `${k} is not empty`;
      if (rule === "hash" && !/^[0-9a-f]{64}$/.test(v)) return `${k} is not a password hash`;
      if (rule === "typed" && !t.has(v)) return `${k} is not a value the user entered`;
    }
  }
  return null;
}

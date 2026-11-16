import { sha256Hex } from "./hash.js";
import { PINNED } from "./pinned.js";

// Downloads genpw.cc's generator scripts (sha.js + crypto.js). Nothing is cached.
// Origins are tried in order; for each file the first copy whose hash matches the
// hardcoded one wins. If no origin serves a matching copy, the first copy that
// could be downloaded is returned with verified: false, so the caller can refuse
// it or let the user explicitly accept it.
// Throws only when a file could not be downloaded from any origin.
export async function fetchGenerator({ origins = PINNED.origins, fetchImpl = fetch } = {}) {
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const sources = [];
  const mismatched = [];
  for (const path of PINNED.generator) {
    const expected = PINNED.files[path];
    const errors = [];
    let match = null;
    let fallback = null;
    for (const origin of origins) {
      try {
        const r = await fetchImpl(`${origin}/${path}`, { cache: "no-store", credentials: "omit", redirect: "error" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const buf = await r.arrayBuffer();
        const text = decoder.decode(buf);
        if ((await sha256Hex(buf)) === expected) {
          match = text;
          break;
        }
        fallback ??= text;
        errors.push(`${origin}: hash does not match`);
      } catch (e) {
        errors.push(`${origin}: ${e?.message ?? e}`);
      }
    }
    if (match === null && fallback === null) throw new Error(`Could not download ${path} (${errors.join("; ")}).`);
    if (match === null) mismatched.push(path);
    sources.push(match ?? fallback);
  }
  return { sources, verified: mismatched.length === 0, mismatched };
}

// Strict variant: only ever returns code that matches the hardcoded hashes.
export async function fetchVerifiedGenerator(options) {
  const { sources, verified, mismatched } = await fetchGenerator(options);
  if (!verified) throw new Error(`hash does not match the pinned hash: ${mismatched.join(", ")}`);
  return sources;
}

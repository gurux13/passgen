#!/usr/bin/env python3
"""Hardcode the hashes of the genpw.cc assets into the extension, and package the
generator scripts (sha.js, crypto.js) from py/static/js into extension/generator/.

Hashes every file in py/static (SHA-256 of the exact bytes) and extracts the
inline <script> blocks, inline event handlers and javascript: links from
py/templates, writing them to extension/src/pinned.js.

These hashes are the only source of truth: the extension never learns hashes at
runtime, so changing them requires releasing a new extension version. Run this
after changing anything under py/static or py/templates, bump the version in
extension/manifest.json, release, and deploy the same files to the sites:

    python extension/tools/sync_ethalon.py

Each file pins a list of accepted hashes: the previous release's stay accepted
next to the new ones, because the sites and the extension can't be updated at
the same moment. Once every site serves the new files:

    python extension/tools/sync_ethalon.py --drop-old
"""
import hashlib
import html
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATIC = ROOT / "py" / "static"
TEMPLATES = ROOT / "py" / "templates"
OUT = ROOT / "extension" / "src" / "pinned.js"
# The generator scripts are packaged with the extension. The repository keeps a single
# copy in py/static/js; this folder is a build output (gitignored).
GENERATOR_OUT = ROOT / "extension" / "generator"

# Sites that serve these exact assets. The generator code is downloaded from the
# first one that answers, in this order.
ORIGINS = ["https://genpw.cc", "https://passgen.ddns.net"]
# Files the extension evaluates (unmodified) to generate passwords, in load order.
GENERATOR = ["static/js/sha.js", "static/js/crypto.js"]
# Same-origin XHR endpoints the site's own scripts call (gen.js, angular/resources.js).
# Every other non-navigation request from a genpw.cc page is blocked by the extension.
ENDPOINTS = {
    # Read-only; pages may call these directly (commonaccounts only with ?count=<digits>).
    "get": ["batchresources", "commonaccounts"],
    # Writes; only possible through the extension, which validates every value sent.
    "post": ["generated", "newsha", "newurl", "updateresource", "deleteresource"],
}
# Navigations a genpw.cc page may start on its own origin (GET), and form posts.
PAGES = {"get": ["", "resources", "auth/login", "auth/register", "auth/logout"], "post": ["auth/login", "auth/register"]}
SKIP_NAMES = {".DS_Store", "Thumbs.db", "desktop.ini"}
MAX_VERSIONS = 4  # accepted hashes per file


def normalize(code: str) -> str:
    """Whitespace-insensitive form; must match normalizeCode() in src/verify.js."""
    return re.sub(r"\s+", " ", code).strip()


def read_previous() -> dict:
    """The currently pinned data, so its hashes stay accepted for one more release."""
    if not OUT.exists():
        return {}
    text = OUT.read_text(encoding="utf-8")
    start = text.index("Object.freeze(") + len("Object.freeze(")
    return json.loads(text[start : text.rindex(");")])


def strip_comments(text: str) -> str:
    text = re.sub(r"\{#.*?#\}", "", text, flags=re.S)  # Jinja comments
    return re.sub(r"<!--.*?-->", "", text, flags=re.S)  # HTML comments


def main() -> int:
    if not STATIC.is_dir():
        print(f"Static dir not found: {STATIC}", file=sys.stderr)
        return 1

    files = {}
    for src in sorted(STATIC.rglob("*")):
        if src.is_file() and src.name not in SKIP_NAMES:
            files["static/" + src.relative_to(STATIC).as_posix()] = hashlib.sha256(src.read_bytes()).hexdigest()

    missing = [p for p in GENERATOR if p not in files]
    if missing:
        print(f"Generator files missing from py/static: {missing}", file=sys.stderr)
        return 1

    inline_scripts, handlers, warnings = set(), set(), []
    for tpl in sorted(TEMPLATES.rglob("*.html")):
        text = strip_comments(tpl.read_text(encoding="utf-8"))
        for m in re.finditer(r"<script\b[^>]*\bsrc\s*=\s*[\"']([^\"']*)[\"']", text, flags=re.I):
            if "url_for" not in m.group(1):
                warnings.append(f"{tpl.name}: script not served from /static: {m.group(1)}")
        for m in re.finditer(r"<script\b(?![^>]*\bsrc\s*=)[^>]*>(.*?)</script>", text, flags=re.S | re.I):
            code = normalize(m.group(1))
            if code:
                inline_scripts.add(code)
                if "{{" in code or "{%" in code:
                    warnings.append(f"{tpl.name}: inline script contains Jinja markup; it will not verify")
        for m in re.finditer(r"""\s(on[a-z]+)\s*=\s*(?:"([^"]*)"|'([^']*)')""", text, flags=re.I):
            code = normalize(html.unescape(m.group(2) if m.group(2) is not None else m.group(3)))
            handlers.add(code)
            if "{{" in code or "{%" in code:
                warnings.append(f"{tpl.name}: handler {m.group(1)} contains Jinja markup; it will not verify")
        for m in re.finditer(r"""\s(?:href|src|action|formaction)\s*=\s*(?:"(\s*javascript:[^"]*)"|'(\s*javascript:[^']*)')""", text, flags=re.I):
            handlers.add(normalize(html.unescape(m.group(1) or m.group(2))))

    # Sites and extension can't be released at the same instant, so by default the
    # previous release's hashes stay accepted next to the current ones (newest
    # first, at most MAX_VERSIONS per file). --drop-old pins only the current files.
    previous = {} if "--drop-old" in sys.argv else read_previous()
    prev_files = previous.get("files", {})
    merged = {}
    for path in sorted(set(files) | set(prev_files)):
        old = prev_files.get(path, [])
        old = [old] if isinstance(old, str) else list(old)
        merged[path] = list(dict.fromkeys(([files[path]] if path in files else []) + old))[:MAX_VERSIONS]
    inline_scripts |= set(previous.get("inlineScripts", []))
    handlers |= set(previous.get("inlineHandlers", []))

    pinned = {
        "origins": ORIGINS,
        "generator": GENERATOR,
        "endpoints": ENDPOINTS,
        "pages": PAGES,
        # path -> accepted SHA-256 hashes, newest first
        "files": merged,
        "inlineScripts": sorted(inline_scripts),
        "inlineHandlers": sorted(handlers),
    }
    body = json.dumps(pinned, indent=2, ensure_ascii=False)
    OUT.write_text(
        "// GENERATED by extension/tools/sync_ethalon.py from py/static and py/templates. Do not edit.\n"
        "// Changing these hashes requires releasing a new extension version.\n"
        f"export const PINNED = Object.freeze({body});\n",
        encoding="utf-8",
        newline="\n",
    )

    GENERATOR_OUT.mkdir(parents=True, exist_ok=True)
    for path in GENERATOR:
        data = (STATIC / path.removeprefix("static/")).read_bytes()
        (GENERATOR_OUT / Path(path).name).write_bytes(data)
    print(f"Copied {', '.join(Path(p).name for p in GENERATOR)} -> {GENERATOR_OUT}")

    multi = sum(1 for v in merged.values() if len(v) > 1)
    print(f"Pinned {len(merged)} files ({multi} with older versions still accepted), {len(inline_scripts)} inline scripts, {len(handlers)} inline handlers -> {OUT}")
    for w in warnings:
        print("WARNING:", w)
    return 0


if __name__ == "__main__":
    sys.exit(main())

# genpw.cc Chrome extension

Manifest V3 extension. All trust comes from **hardcoded SHA-256 hashes** in `src/pinned.js`. They are
generated from `py/static` and `py/templates` and ship inside the extension. The extension never learns
or caches hashes at runtime: the only way to change them is to release a new extension version.

1. **Verifies genpw.cc and its mirror (passgen.ddns.net).** On those sites a content script re-hashes
   every script, stylesheet and other same-origin resource the page loaded. It also checks the inline
   `<script>` blocks and `on*=` / `javascript:` handlers. Everything is compared with the hardcoded
   hashes. Any script or stylesheet that is unknown, altered, or loaded from another site fails. The result
   is shown as a badge on the toolbar icon (✓ / ✗) and, if anything is off, as a red banner on the page
   (click it for the list of issues).
2. **Signs in to genpw.cc** from the popup with your genpw.cc username and password (hashed exactly
   like the site's login form does). "Stay signed in" stores the login hash (not the password) so the
   extension can renew the session after a browser restart.
3. **Generates and fills passwords on other sites.** When a frame shows a password field and one of
   your genpw.cc resources has a URL for that site, a small prompt opens in the corner. Each time it
   opens, the prompt downloads genpw.cc's `sha.js` + `crypto.js` (falling back to the mirror) and checks
   them against the hardcoded hashes; nothing is cached. On ✓ you pick the account, type the master
   password and press Enter; the code runs unmodified to generate the password. On ✗ the master password
   field is not shown at all unless you explicitly press "Use anyway".

All site assets are self-hosted under `py/static`, nothing from CDNs: AngularJS 1.4.9 is vendored as
`static/ext/angular-1.4.9.min.js`, and the Roboto fonts as `static/fonts/roboto/`.

## Security notes

- **Domain matching** (`src/hosts.js`): the page hostname must equal the resource host or be a subdomain
  of it, on a label boundary (`login.example.com` matches `example.com`; `evilexample.com` and
  `example.com.evil.net` do not). A leading `www.` on the resource URL is ignored. IP addresses and
  single-label hosts only match exactly. Plain-http pages only match resources whose URL is http.
- The page origin comes from Chrome (`sender.origin`), not from the page. The fill message goes back to
  the exact document that asked (`documentId`), and the content script refuses it if its origin changed.
- The master password is typed into an extension-origin iframe; the website cannot read it.
- MV3 only allows evaluating downloaded code in a sandboxed page, so the verified generator code runs in
  `sandbox/generator.html`. Its CSP (`default-src 'none'`) gives it no network access.
- The master-password hash (first 4 hex of SHA-1, as on the site) is compared with the saved one. On a
  mismatch you must press Fill a second time.

## Install (unpacked)

1. `chrome://extensions` → enable *Developer mode* → *Load unpacked* → select this `extension/` folder.
2. Click the toolbar icon, sign in with your genpw.cc account.

## Releasing after a site change

1. Change files in `py/static` / `py/templates`.
2. `python extension/tools/sync_ethalon.py` (regenerates `src/pinned.js`).
3. Bump `version` in `manifest.json` and release the extension.
4. Deploy the same files to genpw.cc and passgen.ddns.net.

Until the sites and the extension agree, changed files fail verification. If `sha.js` or `crypto.js`
changed, the prompt shows ✗ and hides the master password field until you press "Use anyway".

## Tests

```bash
python -m http.server 8765 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8765/extension/tests/test.html>. The tests cover:
- domain matching
- page verdicts
- hardcoded hashes vs. the repo files
- download-and-verify, including mirror fallback and rejecting tampered code
- generator parity: the sandbox path vs. plain `<script>` tags, as on genpw.cc

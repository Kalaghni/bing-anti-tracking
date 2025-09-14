# Bing Direct Links (Edge)

A tiny Microsoft Edge (Chromium) extension that rewrites Bing result links (e.g. `/ck/a?...`) to the real destination URL, removing Bing/MSN redirectors and common tracking parameters.

## Features
- Replaces redirect wrappers with the direct `https://…` link on search, news, images, and videos
- Strips common tracking params (`utm_*`, `gclid`, `msclkid`, `fbclid`, etc.)
- Works with Bing’s base64-encoded URLs (including the `a1aHR0…` variant)
- Resilient to SPA navigation and dynamic page updates
- No background/service worker; content script only

## Install (Unpacked)
1. Save these files into a folder (e.g., `bing-direct-links/`):
   - `manifest.json`
   - `content.js`
2. Open `edge://extensions` → toggle **Developer mode**.
3. Click **Load unpacked** → select the `bing-direct-links/` folder.
4. In the extension’s **Details**, enable **Allow access to search page results**.
5. Visit Bing, run a search, and hover a result — you should see the real destination domain in the status bar.

> **Note:** The manifest targets Edge/Chromium MV3. If your Edge is older and doesn’t support `"world": "MAIN"` for content scripts, remove that field from `manifest.json` and reload.

## How it works
- Detects Bing redirect hosts/paths (e.g., `bing.com/ck/a`, `r.msn.com`, `news/apiclick`, `images/click`).
- Extracts the real URL from parameters like `u`, `ru`, `url`, `murl`, `vidurl`, etc.
- Decodes nested percent-encodings and url-safe base64 (including the `a1` prefix before base64 payloads). Example:
  ```text
  https://www.bing.com/ck/a?...&u=a1aHR0cHM6Ly9leGFtcGxlLmNvbS8...
  → https://example.com/
  ```
- Removes tracking params from the final URL, then writes it back to the anchor and disables ping beacons.

## Debugging
1. Open DevTools Console on a Bing results page.
2. Enable logs:
   ```js
   localStorage.setItem('bingDirect.debug', '1'); location.reload();
   ```
3. Look for messages like:
   ```
   [BingDirect] batch rewrote 12 link(s)
   [BingDirect] rewrote → https://example.com/ from /ck/a?...&u=a1aHR0...
   ```
4. Right‑click a result → **Copy link** should yield the direct URL (not `bing.com/...`).

## Permissions
- `host_permissions`: `*://*.bing.com/*` (read/modify pages on Bing only)
- No external requests, storage is only used for the optional debug flag.

## Privacy
- No analytics, no network calls, no data leaves your browser.

## Troubleshooting
- **No effect on links**: In Edge extension **Details**, ensure **Allow access to search page results** is ON.
- **Still seeing redirects**: Refresh the page after loading results; SPA updates are handled, but a manual refresh ensures the content script ran early.
- **A new redirect shape appears**: Copy the raw `href` from “Copy link” and add its param name/path to `CANDIDATE_PARAMS` / `REDIRECT_PATH_RE` in `content.js`.

## Development notes
- Core logic lives in `content.js`:
  - `REDIRECT_PATH_RE`: regex for Bing redirect paths.
  - `CANDIDATE_PARAMS`: list of params that may contain the real URL.
  - `decodeWeirdBingBase64()`: handles `a1`+base64 and finds `aHR0` chunks.
  - MutationObserver keeps links fixed as Bing re-renders.
- MV3; no background service worker needed.

## Version history
- **1.2** — Robust decoding for `a1aHR0…` and nested encodes; better coverage for news/images/video; minor hardening.
- **1.1** — Inject in main world; broader redirect detection; debug logs.
- **1.0** — Initial release.

## License
MIT


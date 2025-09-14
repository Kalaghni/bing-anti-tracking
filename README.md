# Bing Direct Links (Edge)

Rewrite Bing result links to their real destinations. No redirects, fewer trackers. Microsoft Edge / Chromium MV3.

## Setup
1. Clone or download this repo.
2. Ensure the folder contains:
   - `manifest.json`
   - `content.js`
3. Open `edge://extensions` → toggle **Developer mode**.
4. Click **Load unpacked** → select the project folder.
5. In **Details**, enable **Allow access to search page results**.

> If your Edge build complains about `"world": "MAIN"` in the manifest, remove that field and reload.

## Usage
- Go to Bing and run any search.
- Hover a result: the status bar should show the **final site** (not `bing.com/ck/a…`).
- Right‑click → **Copy link** should copy the direct URL.

### Optional debug
Open DevTools Console on a results page and run:
```js
localStorage.setItem('bingDirect.debug','1'); location.reload();
```
You’ll see logs like:
```
[BingDirect] batch rewrote 12 link(s)
[BingDirect] rewrote → https://example.com/ from /ck/a?...&u=a1aHR0...
```
Disable with:
```js
localStorage.removeItem('bingDirect.debug')
```

## What it does
- Detects Bing/MSN redirect patterns (e.g., `/ck/a`, `news/apiclick`, `images/click`).
- Extracts the real URL from params like `u`, `ru`, `url`, `murl`, `vidurl`, etc.
- Decodes nested percent‑encodes and Base64‑URL (incl. the `a1aHR0…` variant).
- Removes common tracking params (`utm_*`, `gclid`, `msclkid`, `fbclid`, …).
- Disables `ping` beacons and click handlers that try to re‑wrap links.

## Permissions
- `*://*.bing.com/*` (content script only)
- No background/service worker, no external network calls.

## Privacy
No analytics or data collection. All rewriting happens locally in your browser.

## Contributing
New redirect shape? Paste a sample `href` in an issue/PR and, if needed, extend:
- `REDIRECT_PATH_RE` (add path patterns)
- `CANDIDATE_PARAMS` (add param names)

## Version history
- **1.2** — Robust `a1aHR0…` decoding & nested encodes; broader coverage.
- **1.1** — Main‑world injection; debug logs; more detectors.
- **1.0** — Initial release.

## License
MIT
(() => {
    'use strict';

    const DEBUG = () => !!localStorage.getItem('bingDirect.debug');
    const log = (...args) => DEBUG() && console.debug('[BingDirect]', ...args);

    const REDIRECT_HOSTS = new Set(['bing.com','www.bing.com','cn.bing.com','r.msn.com','go.msn.com']);
    const REDIRECT_PATH_RE = /^\/(ck\/a|aclick|r|f|fd\/ls|news\/apiclick|images\/click|videos\/redir)/i;

    const CANDIDATE_PARAMS = [
        'u','ru','r','url','target','to',
        'murl','mediaurl','imgurl','imgurl2','purl','vidurl','vurl','lurl'
    ];

    const STRIP_PARAMS = [
        'msclkid','msads_clickid','utm_source','utm_medium','utm_campaign','utm_term','utm_content',
        'gclid','gclsrc','fbclid','dclid','mc_eid','oly_enc_id','oly_anon_id'
    ];

    const processed = new WeakSet();

    function multiDecodeURIComponent(s, times = 3) {
        for (let i = 0; i < times; i++) {
            try {
                const d = decodeURIComponent(s);
                if (d === s) return s;
                s = d;
            } catch { return s; }
        }
        return s;
    }

    function base64UrlToUtf8(s) {
        try {
            s = s.replace(/-/g,'+').replace(/_/g,'/');
            while (s.length % 4) s += '=';
            const bin = atob(s);
            try {
                return decodeURIComponent([...bin].map(c => '%' + c.charCodeAt(0).toString(16).padStart(2,'0')).join(''));
            } catch {
                return bin;
            }
        } catch {
            return null;
        }
    }

    // NEW: normalize Bing’s weird “a1<base64>” pattern or grab from the first aHR0… chunk.
    function decodeWeirdBingBase64(s) {
        if (!s) return null;
        // Strip aX prefix sometimes added before the base64 payload (e.g., "a1aHR0...")
        const m = s.match(/^a\d([A-Za-z0-9\-_]+=*)$/i);
        if (m) {
            const out = base64UrlToUtf8(m[1]);
            if (out && /^https?:\/\//i.test(out)) return out;
        }
        // Find the first aHR0… (which is base64 for “http”) and decode from there
        const i = s.indexOf('aHR0');
        if (i >= 0) {
            const tail = s.slice(i).replace(/[^A-Za-z0-9\-_]/g, ''); // keep base64url chars only
            const out = base64UrlToUtf8(tail);
            if (out && /^https?:\/\//i.test(out)) return out;
        }
        return null;
    }

    function maybeUrl(s) {
        if (!s) return null;

        // Raw URL?
        if (/^https?:\/\//i.test(s)) return s;

        // Percent-decode up to 3 times (handles nested encodes)
        const d1 = multiDecodeURIComponent(s, 3);
        if (/^https?:\/\//i.test(d1)) return d1;

        // Base64 (including Bing’s a1+base64 flavor)
        const b = decodeWeirdBingBase64(s) || base64UrlToUtf8(s);
        if (b && /^https?:\/\//i.test(b)) return b;

        // Sometimes a param is itself a query string containing url=...
        try {
            const inner = new URLSearchParams(d1);
            for (const k of CANDIDATE_PARAMS) {
                if (inner.has(k)) {
                    const nested = maybeUrl(inner.get(k));
                    if (nested) return nested;
                }
            }
        } catch { /* not a query string */ }

        return null;
    }

    function extractFromParams(u) {
        for (const k of CANDIDATE_PARAMS) {
            if (!u.searchParams.has(k)) continue;
            const raw = u.searchParams.get(k);
            const candidate = maybeUrl(raw);
            if (candidate) return candidate;
        }
        return null;
    }

    function extractFromDataAttrs(a) {
        const attrs = ['data-rawhref','data-rawurl','data-url','data-dest','data-link','data-href','h'];
        for (const name of attrs) {
            if (!a.hasAttribute(name)) continue;
            const candidate = maybeUrl(a.getAttribute(name));
            if (candidate) return candidate;
        }
        return null;
    }

    function stripTracking(uStr) {
        try {
            const u = new URL(uStr);
            for (const p of STRIP_PARAMS) u.searchParams.delete(p);
            return u.toString();
        } catch {
            return uStr;
        }
    }

    function isBingRedirect(href) {
        if (!href) return false;
        try {
            const u = new URL(href, location.href);
            if (!REDIRECT_HOSTS.has(u.hostname)) return false;
            if (REDIRECT_PATH_RE.test(u.pathname)) return true;
            for (const k of CANDIDATE_PARAMS) if (u.searchParams.has(k)) return true;
            return false;
        } catch {
            return false;
        }
    }

    function rewriteAnchor(a) {
        if (!a || processed.has(a)) return false;
        const orig = a.getAttribute('href') || '';
        let newHref = null;

        if (isBingRedirect(orig)) {
            try { newHref = extractFromParams(new URL(orig, location.href)); } catch {}
        }
        if (!newHref) newHref = extractFromDataAttrs(a);

        if (newHref) {
            newHref = stripTracking(newHref);
            a.setAttribute('href', newHref);
            a.removeAttribute('ping');
            a.removeAttribute('onmousedown');
            a.removeAttribute('data-ct');
            const rel = new Set((a.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
            rel.add('noreferrer'); rel.add('noopener');
            a.setAttribute('rel', Array.from(rel).join(' '));
            a.dataset.bingDirect = '1';
            processed.add(a);
            log('rewrote →', newHref, 'from', orig.slice(0, 160));
            return true;
        }
        return false;
    }

    function rewriteAll(root = document) {
        let n = 0;
        const sel = 'a[href], a[data-rawhref], a[data-rawurl], a[data-url], a[data-dest], a[data-link], a[h]';
        for (const a of root.querySelectorAll(sel)) n += rewriteAnchor(a) ? 1 : 0;
        if (n) log('batch rewrote', n, 'link(s)');
    }

    function stopBingRewriters(e) {
        const a = e.target?.closest?.('a');
        if (!a || !a.href) return;
        try {
            const u = new URL(a.href);
            if (!REDIRECT_HOSTS.has(u.hostname)) e.stopPropagation();
        } catch {}
    }

    rewriteAll();
    document.addEventListener('DOMContentLoaded', () => rewriteAll(), { once: true });

    const mo = new MutationObserver(muts => {
        for (const m of muts) {
            if (m.type === 'childList') {
                for (const node of m.addedNodes) if (node?.nodeType === 1) rewriteAll(node);
            } else if (m.type === 'attributes' && m.attributeName === 'href' && m.target?.tagName === 'A') {
                rewriteAnchor(m.target);
            }
        }
    });
    mo.observe(document.documentElement || document.body, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['href']
    });

    for (const evt of ['mousedown','pointerdown','touchstart','auxclick','click']) {
        document.addEventListener(evt, stopBingRewriters, true);
    }

    const _ps = history.pushState;
    history.pushState = function(...args) { const r = _ps.apply(this, args); queueMicrotask(rewriteAll); return r; };
    const _rs = history.replaceState;
    history.replaceState = function(...args) { const r = _rs.apply(this, args); queueMicrotask(rewriteAll); return r; };
    window.addEventListener('popstate', () => queueMicrotask(rewriteAll));
})();


console.log("TEST")
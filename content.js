(() => {
    'use strict';

    // Known redirect hosts seen on Bing properties.
    const REDIRECT_HOSTS = new Set([
        'www.bing.com',
        'cn.bing.com',
        'bing.com',
        // Bing occasionally uses MSN redirectors for some result types
        'r.msn.com',
        'go.msn.com'
    ]);

    // Parameters that often contain the real destination (plain or base64-encoded)
    const CANDIDATE_PARAMS = ['u', 'r', 'ru', 'url', 'target', 'lurl', 'redir', 'to', 'q'];

    // Common tracking params to strip from the final URL
    const STRIP_PARAMS = [
        'msclkid', 'msads_clickid', 'utm_source', 'utm_medium', 'utm_campaign',
        'utm_term', 'utm_content', 'gclid', 'gclsrc', 'fbclid', 'dclid',
        'mc_eid', 'oly_enc_id', 'oly_anon_id'
    ];

    function base64UrlToUtf8(b64) {
        try {
            // Convert URL-safe base64 -> standard
            let s = b64.replace(/-/g, '+').replace(/_/g, '/');
            // Pad
            while (s.length % 4 !== 0) s += '=';
            const bin = atob(s);
            // Convert binary to UTF-8
            try {
                return decodeURIComponent(bin.split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
            } catch {
                return bin;
            }
        } catch {
            return null;
        }
    }

    function extractDestFromParams(urlObj) {
        const sp = urlObj.searchParams;
        for (const key of CANDIDATE_PARAMS) {
            if (!sp.has(key)) continue;
            const raw = sp.get(key);
            if (!raw) continue;

            // 1) Try percent-decoding first
            let val = raw;
            try { val = decodeURIComponent(val); } catch {}

            // If it already looks like a URL, use it
            if (/^https?:\/\//i.test(val)) return val;

            // 2) Try base64/url-safe base64
            const maybe = base64UrlToUtf8(val);
            if (maybe && /^https?:\/\//i.test(maybe)) return maybe;
        }
        return null;
    }

    function fromDataAttrs(a) {
        const attrs = ['data-rawhref', 'data-rawurl', 'data-href', 'data-url', 'data-dest', 'data-link'];
        for (const name of attrs) {
            if (a.hasAttribute(name)) {
                const v = a.getAttribute(name);
                if (v && /^https?:\/\//i.test(v)) return v;
            }
        }
        return null;
    }

    function stripTracking(uStr) {
        try {
            const u = new URL(uStr);
            for (const k of STRIP_PARAMS) u.searchParams.delete(k);
            return u.toString();
        } catch {
            return uStr;
        }
    }

    function looksLikeRedirect(href) {
        if (!href) return false;
        try {
            const u = new URL(href, location.origin);
            if (!REDIRECT_HOSTS.has(u.hostname)) return false;
            // If any of our candidate params exist, it’s almost certainly a redirect wrapper
            for (const k of CANDIDATE_PARAMS) if (u.searchParams.has(k)) return true;
            // Additionally, common Bing redirect paths
            return /^\/(ck\/a|aclick|r|f|fd\/ls|news\/apiclick)/i.test(u.pathname);
        } catch {
            return false;
        }
    }

    const processed = new WeakSet();

    function rewriteAnchor(a) {
        if (!a || processed.has(a)) return;

        let newHref = null;
        const href = a.getAttribute('href');

        if (href && looksLikeRedirect(href)) {
            try {
                const u = new URL(href, location.origin);
                newHref = extractDestFromParams(u);
            } catch {
                /* no-op */
            }
        }

        if (!newHref) {
            // Some result types stash the real URL in data- attrs
            newHref = fromDataAttrs(a);
        }

        if (newHref) {
            newHref = stripTracking(newHref);
            a.setAttribute('href', newHref);
            // Kill common tracking hooks
            a.removeAttribute('ping');
            a.removeAttribute('onmousedown');
            a.removeAttribute('data-ct');

            // Safer default rel
            const rel = new Set((a.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
            rel.add('noreferrer');
            rel.add('noopener');
            a.setAttribute('rel', Array.from(rel).join(' '));

            processed.add(a);
        }
    }

    function rewriteAll(root = document) {
        const anchors = root.querySelectorAll('a[href], a[data-rawhref], a[data-rawurl], a[data-url], a[data-dest]');
        for (const a of anchors) rewriteAnchor(a);
    }

    // Prevent Bing's capture handlers from re-wrapping the link after we fix it.
    function stopBingRewriters(e) {
        const a = e.target && (e.target.closest ? e.target.closest('a') : null);
        if (!a) return;
        // If we've already rewritten to a direct (non-Bing/MSN) URL, block Bing’s listeners in the capture phase.
        try {
            const h = new URL(a.href);
            if (!REDIRECT_HOSTS.has(h.hostname)) e.stopPropagation();
        } catch {
            /* ignore */
        }
    }

    // Run early & often
    rewriteAll();

    document.addEventListener('DOMContentLoaded', () => rewriteAll(), { once: true });

    const observer = new MutationObserver(muts => {
        for (const m of muts) {
            if (m.type === 'childList') {
                for (const node of m.addedNodes) {
                    if (node && node.nodeType === 1) rewriteAll(node);
                }
            } else if (
                m.type === 'attributes' &&
                m.target &&
                m.target.nodeType === 1 &&
                m.attributeName === 'href' &&
                m.target.tagName === 'A'
            ) {
                rewriteAnchor(m.target);
            }
        }
    });

    observer.observe(document.documentElement || document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['href']
    });

    // Beat site handlers in the capture phase
    for (const evt of ['mousedown', 'pointerdown', 'touchstart', 'auxclick', 'click']) {
        document.addEventListener(evt, stopBingRewriters, true);
    }

    // Handle SPA navigations
    const _ps = history.pushState;
    history.pushState = function (...args) {
        const r = _ps.apply(this, args);
        queueMicrotask(rewriteAll);
        return r;
    };
    const _rs = history.replaceState;
    history.replaceState = function (...args) {
        const r = _rs.apply(this, args);
        queueMicrotask(rewriteAll);
        return r;
    };
    window.addEventListener('popstate', () => queueMicrotask(rewriteAll));
})();

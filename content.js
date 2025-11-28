// content.js
// Advanced event capture for Task Mining
// NOTE: By default we DO NOT capture input text values (privacy).
// Set CAPTURE_INPUT_VALUE = true to capture hashed values (SHA-256) instead of raw text.

const CAPTURE_INPUT_VALUE = false; // set true only with user consent
const CAPTURE_INPUT_HASH = true; // if true and CAPTURE_INPUT_VALUE true, store SHA-256 hex

// safe send wrapper
function safeSend(msg) {
    try {
        chrome.runtime.sendMessage(msg, () => {
            if (chrome.runtime.lastError) {
                // service worker sleeping — ignore
                // console.warn("Message dropped:", chrome.runtime.lastError.message);
            }
        });
    } catch (e) {
        // extension context invalidated
    }
}

// helper: build a reasonably-unique CSS selector
function getCssSelector(el) {
    if (!el) return null;
    if (el.id) return `#${el.id}`;
    const parts = [];
    while (el && el.nodeType === 1 && el.tagName.toLowerCase() !== 'html') {
        let part = el.tagName.toLowerCase();
        if (el.className) {
            const cls = String(el.className).trim().split(/\s+/)[0];
            if (cls) part += `.${cls}`;
        }
        const parent = el.parentNode;
        if (parent) {
            const siblings = Array.from(parent.children).filter(e => e.tagName === el.tagName);
            if (siblings.length > 1) {
                const idx = Array.from(parent.children).indexOf(el) + 1;
                part += `:nth-child(${idx})`;
            }
        }
        parts.unshift(part);
        el = el.parentNode;
    }
    return parts.length ? parts.join(" > ") : null;
}

// helper: get XPath
function getXPath(el) {
    if (!el) return null;
    let xpath = '';
    for (; el && el.nodeType === 1; el = el.parentNode) {
        let idx = 1;
        for (let sib = el.previousSibling; sib; sib = sib.previousSibling) {
            if (sib.nodeType === 1 && sib.nodeName === el.nodeName) idx++;
        }
        xpath = '/' + el.nodeName.toLowerCase() + '[' + idx + ']' + xpath;
    }
    return xpath || null;
}

// helper: shorten text safely
function shortText(s, n = 120) {
    if (!s) return '';
    let t = String(s).trim();
    if (t.length > n) return t.slice(0, n) + '…';
    return t;
}

// optional hashing using SubtleCrypto
async function sha256Hex(str) {
    const enc = new TextEncoder();
    const data = enc.encode(str);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const arr = Array.from(new Uint8Array(hash));
    return arr.map(b => b.toString(16).padStart(2, '0')).join('');
}

// build event object
async function buildEventObject(type, extra = {}) {
    const event = {
        event: type,
        timestamp: Date.now(),
        url: location.href,
        title: document.title,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        scrollY: window.scrollY || window.pageYOffset || 0,
        page_fingerprint: window.location.hostname + '|' + document.title, // simple fingerprint
        ...extra
    };
    return event;
}

// common metadata from element
async function metaFromElement(el) {
    if (!el) return {};
    const selector = getCssSelector(el);
    const xpath = getXPath(el);
    const text = shortText(el.innerText || el.textContent || '');
    return {
        tag: el.tagName,
        id: el.id || '',
        classes: el.className || '',
        selector,
        xpath,
        text
    };
}

// CLICK
document.addEventListener('click', async (e) => {
    try {
        const el = e.target;
        const meta = await metaFromElement(el);
        const obj = await buildEventObject('click', {
            data: {
                ...meta,
                x: e.clientX,
                y: e.clientY,
                button: e.button
            }
        });
        safeSend(obj);
    } catch (err) {}
}, true);

// FORM INPUT (metadata only) — capture focus, blur, and input length (no raw value by default)
function fieldNameForInput(el) {
    if (!el) return '';
    return el.name || el.getAttribute('id') || el.getAttribute('aria-label') || el.placeholder || '';
}

async function handleInputEvent(e) {
    try {
        const el = e.target;
        if (!el) return;
        const meta = await metaFromElement(el);
        const fieldName = fieldNameForInput(el);
        let inputInfo = { length: (el.value || '').length };
        if (CAPTURE_INPUT_VALUE && CAPTURE_INPUT_HASH) {
            const hash = await sha256Hex(el.value || '');
            inputInfo = { length: (el.value || '').length, hash };
        }
        const obj = await buildEventObject('input', {
            data: {
                ...meta,
                field_type: el.type || el.tagName,
                field_name: fieldName,
                input: inputInfo
            }
        });
        safeSend(obj);
    } catch (err) {}
}

document.addEventListener('input', debounce(handleInputEvent, 300), true);
document.addEventListener('change', handleInputEvent, true);
document.addEventListener('focusin', async (e) => {
    const el = e.target;
    const meta = await metaFromElement(el);
    const obj = await buildEventObject('focus', { data: meta });
    safeSend(obj);
}, true);
document.addEventListener('focusout', async (e) => {
    const el = e.target;
    const meta = await metaFromElement(el);
    const obj = await buildEventObject('blur', { data: meta });
    safeSend(obj);
}, true);

// SCROLL (debounced)
function onScroll() {
    buildEventObject('scroll', {
        data: {
            scrollY: window.scrollY || window.pageYOffset || 0,
            viewport: { w: window.innerWidth, h: window.innerHeight }
        }
    }).then(safeSend);
}
window.addEventListener('scroll', debounce(onScroll, 300), { passive: true });

// VISIT (page load)
buildEventObject('page_visit', {
    data: {
        url: location.href,
        title: document.title,
        referrer: document.referrer || ''
    }
}).then(safeSend);

// helper: debounce
function debounce(fn, ms = 200) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

// also capture navigation events (single page apps)
window.addEventListener('popstate', () => {
    buildEventObject('navigation', {
        data: { url: location.href, title: document.title }
    }).then(safeSend);
});

// capture unload (end of session)
window.addEventListener('beforeunload', () => {
    // synchronous send isn't guaranteed, but we still try
    try {
        navigator.sendBeacon && navigator.sendBeacon('/__noop', JSON.stringify({ event: 'unload', timestamp: Date.now() }));
    } catch (e) {}
});

// small heartbeat to indicate page still alive (optional)
setInterval(() => {
    buildEventObject('heartbeat', { data: { url: location.href } }).then(safeSend);
}, 60 * 1000);

// log script loaded
console.log('CONTENT SCRIPT LOADED');

//this file runs on every page to record activity
function logEvent(type, data = {}) {
    try {
        chrome.runtime.sendMessage(
            {
                event: type,
                data: data,
                timestamp: Date.now()
            },
            () => {
                if (chrome.runtime.lastError) {
                    console.warn("Message dropped:", chrome.runtime.lastError.message);
                }
            }
        );
    } catch (e) {
        console.warn("Extension context invalid, message skipped.");
    }
}


// Capture clicks
document.addEventListener("click", (e) => {
    logEvent("click", {
        tag: e.target.tagName,
        id: e.target.id,
        classes: e.target.className
    });
});

// Capture key presses (only metadata, not text for privacy)
document.addEventListener("keydown", (e) => {
    logEvent("key_press", {
        key: e.key
    });
});

// Capture URL + page title when loaded
logEvent("page_visit", {
    title: document.title,
    url: window.location.href
});
console.log("CONTENT SCRIPT LOADED");
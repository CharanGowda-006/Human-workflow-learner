//this file is to store recorded activity into log

// Listen for refresh notifications from background
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "refresh_dashboard") {
        console.log("Dashboard refreshing due to new event...");
        start(); // reload workflows
    }
});
let db;

function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open("TaskMiningDB", 2);   // ← BUMP VERSION TO 2

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            // If "events" does NOT exist, create it
            if (!database.objectStoreNames.contains("events")) {
                database.createObjectStore("events", {
                    keyPath: "id",
                    autoIncrement: true
                });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        request.onerror = () => reject("DB open failed");
    });
}

chrome.runtime.onMessage.addListener(async (msg) => {
    console.log("Background received:", msg);
    const database = await getDB();
    const tx = database.transaction("events", "readwrite");
    tx.objectStore("events").add(msg);
});
chrome.runtime.onMessage.addListener(async (msg, sender) => {
    console.log("Background received:", msg);
    const database = await getDB();
    const tx = database.transaction("events", "readwrite");
    tx.objectStore("events").add(msg);

    // 🔥 Notify any open dashboard to refresh
    chrome.runtime.sendMessage({ action: "refresh_dashboard" });
});



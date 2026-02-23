// Price notification worker — notifications are now sent directly via eSputnik events
// from price-tracking.service.ts when a product price changes.
// Keep the process alive so Docker doesn't restart it in a loop.

console.log("Price Notification Worker started (eSputnik event mode — no polling).");

// Prevent the process from exiting; notifications are triggered externally.
setInterval(() => {}, 1 << 30);

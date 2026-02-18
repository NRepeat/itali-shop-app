// Price notification worker — notifications are now sent directly via eSputnik events
// from price-tracking.service.ts when a product price changes.
// This worker is kept as a no-op to avoid breaking the process startup.

console.log("Price Notification Worker started (eSputnik event mode — no polling).");

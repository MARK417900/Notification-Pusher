// Run once: node scripts/gen-vapid.js
// Prints a VAPID key pair to paste into your .env file.
const webpush = require("web-push");
const keys = webpush.generateVAPIDKeys();
console.log("\nAdd these to your .env file:\n");
console.log("VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
console.log("\nKeep the private key secret — never expose it to the browser.\n");

require("dotenv").config();
const express = require("express");
const webpush = require("web-push");
const cron = require("node-cron");
const fs = require("fs");
const path = require("path");

const DATA_FILE = path.join(__dirname, "data.json");
const PORT = process.env.PORT || 3000;
const ACCESS_CODE = process.env.ACCESS_CODE || ""; // optional shared password

// ---------- VAPID setup ----------
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:you@example.com";

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error(
    "\nMissing VAPID keys. Run `npm run gen-vapid` and put the output into your .env file, then restart.\n"
  );
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ---------- tiny JSON-file storage ----------
function loadData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return { subscriptions: [], items: [], history: [] };
  }
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
let db = loadData();

// ---------- app ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Optional simple shared-password gate for the API, so a random visitor
// with your URL can't read or change your schedule.
function requireAccessCode(req, res, next) {
  if (!ACCESS_CODE) return next(); // no code configured -> open (fine for local/testing only)
  const supplied = req.header("x-access-code");
  if (supplied === ACCESS_CODE) return next();
  return res.status(401).json({ error: "unauthorized" });
}

app.get("/api/vapid-public-key", (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.get("/api/access-check", requireAccessCode, (req, res) => {
  res.json({ ok: true });
});

app.post("/api/subscribe", requireAccessCode, (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: "invalid subscription" });
  const exists = db.subscriptions.some((s) => s.endpoint === sub.endpoint);
  if (!exists) {
    db.subscriptions.push(sub);
    saveData(db);
  }
  res.json({ ok: true });
});

app.post("/api/unsubscribe", requireAccessCode, (req, res) => {
  const { endpoint } = req.body || {};
  db.subscriptions = db.subscriptions.filter((s) => s.endpoint !== endpoint);
  saveData(db);
  res.json({ ok: true });
});

app.get("/api/items", requireAccessCode, (req, res) => {
  res.json({ items: db.items });
});

app.post("/api/items", requireAccessCode, (req, res) => {
  const item = req.body;
  if (!item || !item.title || !item.time) return res.status(400).json({ error: "title and time required" });
  item.id = item.id || String(Date.now()) + Math.random().toString(36).slice(2, 7);
  item.enabled = item.enabled !== false;
  item.days = item.days || [];
  item.lastFiredKey = item.lastFiredKey || null;
  item.firedOnce = item.firedOnce || false;
  const idx = db.items.findIndex((i) => i.id === item.id);
  if (idx !== -1) db.items[idx] = item;
  else db.items.push(item);
  saveData(db);
  res.json({ ok: true, item });
});

app.delete("/api/items/:id", requireAccessCode, (req, res) => {
  db.items = db.items.filter((i) => i.id !== req.params.id);
  saveData(db);
  res.json({ ok: true });
});

app.get("/api/history", requireAccessCode, (req, res) => {
  res.json({ history: db.history.slice(0, 30) });
});

app.post("/api/test-push", requireAccessCode, async (req, res) => {
  const result = await sendToAll("Dispatch test", "This is what a push looks like — even with the tab closed.");
  res.json(result);
});

// ---------- scheduling ----------
function pad(n) { return String(n).padStart(2, "0"); }
function todayKey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

function itemAppliesToday(item, dayIdx) {
  if (item.repeat === "once" || item.repeat === "daily") return true;
  if (item.repeat === "weekdays") return dayIdx >= 1 && dayIdx <= 5;
  if (item.repeat === "weekends") return dayIdx === 0 || dayIdx === 6;
  if (item.repeat === "custom") return (item.days || []).includes(dayIdx);
  return false;
}

async function sendToAll(title, body) {
  const payload = JSON.stringify({ title, body: body || "" });
  const results = { sent: 0, removed: 0 };
  const stillGood = [];
  for (const sub of db.subscriptions) {
    try {
      await webpush.sendNotification(sub, payload);
      results.sent++;
      stillGood.push(sub);
    } catch (err) {
      // 404/410 = the browser unsubscribed or the subscription expired — drop it
      if (err.statusCode === 404 || err.statusCode === 410) {
        results.removed++;
      } else {
        console.error("Push error:", err.statusCode, err.body);
        stillGood.push(sub);
      }
    }
  }
  db.subscriptions = stillGood;
  db.history.unshift({ title, body, at: Date.now() });
  db.history = db.history.slice(0, 30);
  saveData(db);
  return results;
}

// Runs every minute, server-side — works even if every browser is closed.
cron.schedule("* * * * *", async () => {
  const now = new Date();
  const hhmm = pad(now.getHours()) + ":" + pad(now.getMinutes());
  const dayIdx = now.getDay();
  const tKey = todayKey(now);
  let changed = false;

  for (const item of db.items) {
    if (item.enabled === false) continue;
    if (item.repeat === "once" && item.firedOnce) continue;
    if (item.time !== hhmm) continue;
    if (!itemAppliesToday(item, dayIdx)) continue;
    if (item.lastFiredKey === tKey) continue;

    await sendToAll(item.title, item.body);
    item.lastFiredKey = tKey;
    if (item.repeat === "once") item.firedOnce = true;
    changed = true;
  }
  if (changed) saveData(db);
});

app.listen(PORT, () => {
  console.log(`Dispatch push server running on port ${PORT}`);
  if (!ACCESS_CODE) {
    console.warn("No ACCESS_CODE set — anyone with your URL can read/edit your schedule. Set ACCESS_CODE in .env to lock it down.");
  }
});

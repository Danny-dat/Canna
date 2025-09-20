// services/chat.service.js
import { db, FieldValue } from "./firebase-config.js";

const TS = () => FieldValue?.serverTimestamp?.() ?? new Date();
export const chatIdFor = (a, b) => [a, b].sort().join("_");

// ---- Notification-Throttle (optional) ----
const NOTIFY_COOLDOWN_MS = 8000; // 8000 = 8s; auf 0 setzen, um Throttle auszuschalten
const _lastNotify = new Map();   // key = `${fromUid}->${toUid}`

function _shouldNotify(fromUid, toUid) {
  if (!NOTIFY_COOLDOWN_MS) return true;
  const k = `${fromUid}->${toUid}`;
  const now = Date.now();
  const last = _lastNotify.get(k) ?? 0;
  if (now - last < NOTIFY_COOLDOWN_MS) return false;
  _lastNotify.set(k, now);
  return true;
}

// intern
async function ensureChat(chatId, participants) {
  await db.collection("chats").doc(chatId).set(
    { participants, createdAt: TS(), updatedAt: TS() },
    { merge: true }
  );
}

// optionaler Export, falls du ihn direkt im UI nutzen willst
export async function ensureChatExists(a, b) {
  const id = chatIdFor(a, b);
  await ensureChat(id, [a, b]);
  return id;
}

export function listenChatMessages(chatId, cb, limit = 200) {
  return db.collection("chats").doc(chatId).collection("messages")
    .orderBy("createdAt", "asc").limit(limit)
    .onSnapshot((snap) => {
      cb(snap.docs.map(d => {
        const data = d.data();
        return { id: d.id, ...data, createdAt: data.createdAt?.toDate?.() ?? data.createdAt };
      }));
    });
}

export async function sendChatMessage({ fromUid, toUid, text }) {
  const body = (text || "").trim();
  if (!fromUid || !toUid || !body) return;

  const chatId = chatIdFor(fromUid, toUid);
  await ensureChat(chatId, [fromUid, toUid]);

  const chatRef = db.collection("chats").doc(chatId);

  await chatRef.collection("messages").add({
    text: body,
    senderId: fromUid,
    recipientId: toUid,
    createdAt: TS(),
    readBy: [fromUid],
  });

  await chatRef.set(
    { lastMessage: body, lastSenderId: fromUid, updatedAt: TS() },
    { merge: true }
  );

  // ✨ Immer benachrichtigen (Throttle schützt vor Spam bei schnellem Tippen)
  try {
    if (_shouldNotify(fromUid, toUid)) {
      await db.collection("notifications").add({
        type: "chat_message",
        recipientId: toUid,
        senderId: fromUid,
        message: body.length > 80 ? body.slice(0, 80) + "…" : body,
        read: false,
        timestamp: TS(),
      });
    }
  } catch {}
}

export async function markChatRead(chatId, myUid) {
  // idempotent per merge:true – setzt/aktualisiert nur deinen eigenen reads-Timestamp
  await db.collection("chats").doc(chatId)
    .set({ [`reads.${myUid}`]: TS(), updatedAt: TS() }, { merge: true });
}

// services/chat.service.js
import { db, FieldValue } from "./firebase-config.js";

const TS = () => (FieldValue?.serverTimestamp?.() ?? new Date());

// stabile Chat-ID: "a_b" mit alphabetischer Sortierung
export const chatIdFor = (a, b) => [a, b].sort().join("_");

// Chat sicherstellen (nur einmal richtig anlegen)
export async function ensureChatExists(uidA, uidB) {
  const cid = chatIdFor(uidA, uidB);
  const chatRef = db.collection("chats").doc(cid);
  const snap = await chatRef.get();

  const participants = [uidA, uidB].sort();

  if (!snap.exists) {
    // create: participants MUSS gesetzt sein (für deine Rules)
    await chatRef.set({
      participants,
      createdAt: TS(),
      updatedAt: TS(),
      lastMessage: null,
      read: { [uidA]: null, [uidB]: null },
    });
  } else {
    // existiert: participants nie entfernen/überschreiben (nur sicherstellen)
    const cur = snap.data() || {};
    if (!Array.isArray(cur.participants)) {
      await chatRef.set({ participants }, { merge: true });
    }
  }

  return cid;
}

// Live: Nachrichten eines Chats hören
export function listenChatMessages(chatId, cb, limit = 200) {
  return db
    .collection("chats").doc(chatId)
    .collection("messages")
    .orderBy("createdAt", "asc")
    .limit(limit)
    .onSnapshot((snap) => {
      const msgs = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() ?? data.createdAt ?? null,
        };
      });
      cb(msgs);
    });
}

// Nachricht senden (+ Chat-Metadaten + optionale Notification)
export async function sendChatMessage({ fromUid, toUid, text }) {
  const body = (text || "").trim();
  if (!fromUid || !toUid || !body) return;

  const chatId = await ensureChatExists(fromUid, toUid);
  const chatRef = db.collection("chats").doc(chatId);

  await chatRef.collection("messages").add({
    text: body,
    senderId: fromUid,
    recipientId: toUid,
    createdAt: TS(),
    readBy: [fromUid],
  });

  await chatRef.set({
    lastMessage: { text: body, senderId: fromUid, createdAt: TS() },
    lastSenderId: fromUid,
    updatedAt: TS(),
  }, { merge: true });

  // Optional: Notification an Empfänger (deine Rules verlangen senderId == auth.uid)
  try {
    await db.collection("notifications").add({
      type: "chat_message",
      recipientId: toUid,
      senderId: fromUid,
      message: body.length > 80 ? body.slice(0, 80) + "…" : body,
      read: false,
      timestamp: TS(),
    });
  } catch {}
}

// Optional: als gelesen markieren
export async function markChatRead(chatId, myUid) {
  return db.collection("chats").doc(chatId)
    .set({ [`read.${myUid}`]: TS() }, { merge: true });
}

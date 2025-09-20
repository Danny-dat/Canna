// services/chat.service.js
import { db, FieldValue } from "./firebase-config.js";
import { isRecipientActiveInChat } from "./presence.service.js";

const TS = () => FieldValue?.serverTimestamp?.() ?? new Date();
export const chatIdFor = (a, b) => [a, b].sort().join("_");

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

  // ✨ Nur benachrichtigen, wenn Empfänger NICHT aktiv im selben Chat ist
  try {
    const active = await isRecipientActiveInChat(toUid, chatId);
    if (!active) {
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
  await db.collection("chats").doc(chatId)
    .set({ [`reads.${myUid}`]: TS() }, { merge: true });
}

// services/chat-global.service.js
import { db, FieldValue } from "./firebase-config.js";

const TS = () => (FieldValue?.serverTimestamp?.() || new Date());

export function listenGlobalMessages(cb, limit = 200) {
  return db.collection("global_chat")
    .orderBy("createdAt", "asc")
    .limit(limit)
    .onSnapshot((snap) => {
      const msgs = snap.docs.map(d => {
        const x = d.data() || {};
        return {
          id: d.id,
          ...x,
          // createdAt als Date für die Anzeige:
          createdAt: x.createdAt?.toDate?.() ?? x.createdAt ?? null,
        };
      });
      cb(msgs);
    });
}

export async function sendGlobalMessage({ fromUid, text }) {
  if (!fromUid || !text?.trim()) return;
  await db.collection("global_chat").add({
    senderId: fromUid,
    text: text.trim(),
    createdAt: TS(), // <- Rules prüfen timestamp
  });
}

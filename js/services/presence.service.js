// services/presence.service.js
import { db, FieldValue } from "./firebase-config.js";

const TS = () => FieldValue?.serverTimestamp?.() ?? new Date();

let _heartbeatTimer = null;

export async function setActiveChat(uid, chatIdOrNull) {
  if (!uid) return;
  await db.collection("presence").doc(uid).set(
    {
      activeChatId: chatIdOrNull || null,
      heartbeatAt: TS(),
      lastSeenAt: TS(),
    },
    { merge: true }
  );
}

export function startPresenceHeartbeat(uid, everyMs = 10000) {
  stopPresenceHeartbeat();
  if (!uid) return;
  const ref = db.collection("presence").doc(uid);
  _heartbeatTimer = window.setInterval(() => {
    ref.set({ heartbeatAt: TS() }, { merge: true }).catch(() => {});
  }, everyMs);
}

export function stopPresenceHeartbeat() {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
}

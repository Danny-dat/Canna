// services/presence.service.js
import { db, FieldValue } from "./firebase-config.js";

// serverTimestamp() (kompatibel) oder Fallback auf Date
const TS = () => (FieldValue?.serverTimestamp?.() ?? new Date());

// Interner Zustand
let _heartbeatTimer = null;
let _uid = null;

/**
 * Optionales Rich-Presence-Feld: Wer ist gerade in welchem Chat aktiv?
 */
export async function setActiveChat(uid, chatIdOrNull) {
  if (!uid) return;
  const ref = db.collection("presence").doc(uid);
  try {
    await ref.set(
      {
        activeChatId: chatIdOrNull || null,
        heartbeatAt: TS(),
        lastSeenAt: TS(),
      },
      { merge: true }
    );
  } catch (e) {
    console.warn("[presence] setActiveChat failed:", e);
  }
}

/**
 * Startet den Heartbeat. Schreibt SOFORT einen initialen Beat
 * und danach alle everyMs Millisekunden.
 */
export function startPresenceHeartbeat(uid, everyMs = 10000) {
  stopPresenceHeartbeat(); // Safety: nie doppelt laufen lassen
  if (!uid) return;

  _uid = uid;
  const ref = db.collection("presence").doc(uid);

  // 1) Sofort online setzen (sichtbar ohne Wartezeit)
  ref.set(
    {
      heartbeatAt: TS(),
      lastSeenAt: TS(),
    },
    { merge: true }
  ).catch(e => console.warn("[presence] initial set failed:", e));

  // 2) Regelmäßiger Heartbeat
  _heartbeatTimer = window.setInterval(() => {
    ref.set({ heartbeatAt: TS() }, { merge: true })
       .catch(e => console.warn("[presence] beat failed:", e));
  }, everyMs);
}

/**
 * Stoppt den Heartbeat und macht den User sofort offline.
 * Versucht das Dokument zu löschen; bei Fehlern fällt es auf „veraltet“ zurück.
 */
export async function stopPresenceHeartbeat() {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
  if (!_uid) return;

  const ref = db.collection("presence").doc(_uid);
  try {
    await ref.delete(); // sofort offline
  } catch (e) {
    console.warn("[presence] delete failed, fallback to stale:", e);
    try {
      // Fallback: harter alter Timestamp, damit er aus jedem Threshold fällt
      await ref.set({ heartbeatAt: new Date(0), lastSeenAt: TS() }, { merge: true });
    } catch (e2) {
      console.warn("[presence] stale fallback failed:", e2);
    }
  } finally {
    _uid = null;
  }
}

// features/global-chat.js
import { listenGlobalMessages, sendGlobalMessage } from "../services/chat-global.service.js";
import { db } from "../services/firebase-config.js";

export function createGlobalChatFeature(state, vue = state) {
  let unsub = null;
  let lastSent = 0;

  const nextTick = (cb) =>
    (vue && typeof vue.$nextTick === "function")
      ? vue.$nextTick(cb)
      : Promise.resolve().then(cb);

  // simple Cache für Anzeigenamen
  const nameCache = Object.create(null);
  const shortUid = (uid) => (uid ? uid.slice(0, 6) + "…" : "");

  async function getDisplayName(uid) {
    if (!uid) return "";
    if (nameCache[uid]) return nameCache[uid];
    try {
      const snap = await db.collection("profiles_public").doc(uid).get();
      const d = snap.exists ? (snap.data() || {}) : {};
      const name = d.username || d.displayName || shortUid(uid);
      nameCache[uid] = name;
      return name;
    } catch {
      nameCache[uid] = shortUid(uid);
      return nameCache[uid];
    }
  }

  function mount() {
    if (unsub) return;
    unsub = listenGlobalMessages(async (raw) => {
      // alle Absender einmalig auflösen
      const ids = [...new Set(raw.map(m => m.senderId).filter(Boolean))];
      await Promise.all(ids.map(getDisplayName));

      // Nachrichten mit senderName anreichern
      const msgs = raw.map(m => ({
        ...m,
        senderName: nameCache[m.senderId] || shortUid(m.senderId),
      }));

      state.globalChat.messages = msgs;

      nextTick(() => {
        const box = vue.$refs?.globalChatMessages || document.querySelector("#globalChatMessages");
        if (box) box.scrollTop = box.scrollHeight;
      });
    });
  }

  async function send() {
    const txt = (state.globalChatInput || "").trim();
    if (!txt) return;
    const now = Date.now();
    if (now - lastSent < 1200) return; // einfacher Client-Rate-Limiter
    lastSent = now;

    await sendGlobalMessage({ fromUid: state.user.uid, text: txt });
    state.globalChatInput = "";
  }

  function teardown() {
    unsub?.();
    unsub = null;
  }

  return { mount, send, teardown, unsubscribe: teardown };
}

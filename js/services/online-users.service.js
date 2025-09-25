// services/online-users.service.js
import { db } from './firebase-config.js';

/**
 * Hört auf die Presence-Collection und liefert Profile,
 * deren heartbeatAt jünger als thresholdSeconds ist.
 */
export function listenForOnlineUsers(cb, thresholdSeconds = 1) {
  const presenceRef = db.collection("presence")
    .where("activeGlobalChat", "==", true);

  return presenceRef.onSnapshot(async (snapshot) => {
    try {
      const now = Date.now();
      const onlineUserIds = snapshot.docs
        .map(d => {
          const data = d.data() || {};
          const hb = data.heartbeatAt?.toDate?.() || data.heartbeatAt || null;
          // nur frische Heartbeats
          return (hb && (now - new Date(hb).getTime()) / 1000 <= thresholdSeconds) ? d.id : null;
        })
        .filter(Boolean);

      if (onlineUserIds.length === 0) return cb([]);

      // chunking (max 10 IDs pro in-Query)
      const chunks = [];
      for (let i = 0; i < onlineUserIds.length; i += 10) {
        chunks.push(onlineUserIds.slice(i, i + 10));
      }

      const profilesRef = db.collection("profiles_public");
      const allDocs = [];
      for (const chunk of chunks) {
        const snap = await profilesRef.where('__name__', 'in', chunk).get();
        allDocs.push(...snap.docs);
      }

      const users = allDocs.map(doc => ({
        id: doc.id,
        displayName: doc.data()?.displayName || `User-${doc.id.slice(0,4)}`
      }));

      cb(users);
    } catch (e) {
      console.error("listenForOnlineUsers failed:", e);
      cb([]);
    }
  });
}

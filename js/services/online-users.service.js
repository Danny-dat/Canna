import { db } from './firebase-config.js';

/**
 * Hört auf die Presence-Collection und liefert eine Liste von Benutzern,
 * deren 'heartbeatAt' jünger als `thresholdSeconds` ist.
 */
export function listenForOnlineUsers(cb, thresholdSeconds = 20) {
  const now = new Date();
  const threshold = new Date(now.getTime() - thresholdSeconds * 1000);

  const presenceRef = db.collection("presence");
  const q = presenceRef.where("heartbeatAt", ">=", threshold);

  return q.onSnapshot(async (snapshot) => {
    const onlineUserIds = snapshot.docs.map(doc => doc.id).filter(id => id);

    if (onlineUserIds.length === 0) {
      return cb([]);
    }

    try {
      // Wir holen die Profile für die online IDs.
      // Firestore hat ein Limit von 10 in einer 'in'-Abfrage.
      const profilesRef = db.collection("profiles_public");
      const idsForQuery = onlineUserIds.length > 10 ? onlineUserIds.slice(0, 10) : onlineUserIds;
      
      // Wichtig: '__name__' ist der interne Name für die Dokumenten-ID
      const profilesQuery = profilesRef.where('__name__', 'in', idsForQuery);
      const profilesSnap = await profilesQuery.get();

      const onlineUsers = profilesSnap.docs.map(doc => ({
        id: doc.id,
        displayName: doc.data().displayName || `User-${doc.id.slice(0, 4)}`,
      }));
      cb(onlineUsers);
    } catch (e) {
      console.error("Fehler beim Laden der Online-Benutzerprofile:", e);
      cb([]); // Im Fehlerfall eine leere Liste zurückgeben.
    }
  });
}
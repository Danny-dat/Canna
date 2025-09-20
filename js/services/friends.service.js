// services/friends.service.js
import { db, FieldValue } from "./firebase-config.js";

/* Helpers */
const TS = () =>
  (FieldValue && FieldValue.serverTimestamp && FieldValue.serverTimestamp()) ||
  new Date();

const samePair = (a, b) =>
  (a.fromUid === b.fromUid && a.toUid === b.toUid) ||
  (a.fromUid === b.toUid && a.toUid === b.fromUid);

/* Anfrage senden + Noti */
export async function sendFriendRequest({ fromUid, fromEmail, fromDisplayName, toUid }) {
  if (!fromUid || !toUid) throw new Error("UID fehlt.");
  if (fromUid === toUid) throw new Error("Du kannst dich nicht selbst hinzufügen.");

  const [q1, q2] = await Promise.all([
    db.collection("friend_requests")
      .where("fromUid","==",fromUid).where("toUid","==",toUid)
      .where("status","==","pending").limit(1).get(),
    db.collection("friend_requests")
      .where("fromUid","==",toUid).where("toUid","==",fromUid)
      .where("status","==","pending").limit(1).get(),
  ]);
  if (!q1.empty || !q2.empty) return;

  const reqRef = await db.collection("friend_requests").add({
    fromUid,
    fromEmail: fromEmail ?? null,
    fromDisplayName: fromDisplayName ?? null,
    toUid,
    status: "pending",
    createdAt: TS(),
    participants: [fromUid, toUid],
  });

  await db.collection("notifications").add({
    type: "friend_request",
    requestId: reqRef.id,
    recipientId: toUid,
    senderId: fromUid,
    message: `${fromDisplayName || fromEmail || "Jemand"} hat dir eine Freundschaftsanfrage gesendet.`,
    read: false,
    timestamp: TS(),
  });
}

/* Eingehende (pending) live hören */
export function listenForIncomingRequests(myUid, cb) {
  return db.collection("friend_requests")
    .where("participants","array-contains", myUid)
    .onSnapshot(snap => {
      const incoming = snap.docs.map(d=>({id:d.id,...d.data()}))
        .filter(r => r.toUid === myUid && r.status === "pending");
      cb(incoming);
    });
}

/* Optional: manuell laden */
export async function fetchFriendRequests(myUid) {
  const snap = await db.collection("friend_requests")
    .where("participants","array-contains", myUid).get();
  return snap.docs.map(d=>({id:d.id,...d.data()}))
    .filter(r => r.toUid === myUid && r.status === "pending");
}

/* Freunde live hören: nur status === accepted */
export function listenForFriends(myUid, cb) {
  return db.collection("friend_requests")
    .where("participants","array-contains", myUid)
    .onSnapshot(async (snap) => {
      const accepted = snap.docs.map(d=>({id:d.id,...d.data()}))
        .filter(r => r.status === "accepted");

      const friendIds = Array.from(new Set(
        accepted.map(r => (r.fromUid === myUid ? r.toUid : r.fromUid))
      ));
      if (!friendIds.length) return cb([]);

      const profiles = await Promise.all(
        friendIds.map(id => db.collection("profiles_public").doc(id).get().catch(()=>null))
      );

      const friends = friendIds.map((id, i) => {
        const ps = profiles[i];
        const pub = ps && ps.exists ? (ps.data() || {}) : {};
        const label = pub.username || pub.displayName || `${id.slice(0,6)}…`;
        return {
          id,
          label,
          displayName: pub.displayName ?? null,
          username: pub.username ?? null,
          photoURL: pub.photoURL ?? null,
          lastLocation: pub.lastLocation ?? null,
          // für dein UI:
          private: { email: pub.email ?? null } // (nur wenn du’s dort ablegst)
        };
      });

      cb(friends);
    });
}

/* Anfrage annehmen */
export async function acceptRequest(myUid, request) {
  if (!request?.id) throw new Error("Request-ID fehlt.");
  if (request.toUid !== myUid) throw new Error("Nur der Empfänger darf annehmen.");

  const reqRef = db.collection("friend_requests").doc(request.id);
  await reqRef.update({ status:"accepted", respondedAt: TS() });

  await db.collection("notifications").add({
    type: "friend_request_accepted",
    requestId: request.id,
    recipientId: request.fromUid,
    senderId: myUid,
    message: `Deine Freundschaftsanfrage wurde akzeptiert.`,
    read: false,
    timestamp: TS(),
  });
}

/* Anfrage ablehnen */
export async function declineRequest(myUid, requestOrId) {
  const id = typeof requestOrId === "string" ? requestOrId : requestOrId?.id;
  if (!id) throw new Error("Request-ID fehlt.");
  const ref = db.collection("friend_requests").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Anfrage existiert nicht mehr.");
  const data = snap.data();
  if (data.toUid !== myUid) throw new Error("Nur der Empfänger darf ablehnen.");

  await ref.update({ status:"declined", respondedAt: TS() });

  // optional: Info an Absender
  try {
    await db.collection("notifications").add({
      type: "friend_request_declined",
      requestId: id,
      recipientId: data.fromUid,
      senderId: myUid,
      message: `Deine Freundschaftsanfrage wurde abgelehnt.`,
      read: false,
      timestamp: TS(),
    });
  } catch {}
}

/* >>> Freund entfernen (Modell B): Status -> 'removed' */
export async function removeFriend(myUid, friendUid) {
  if (!myUid || !friendUid) throw new Error("UID fehlt.");

  // 1 Query (array-contains) + Filter → kein Composite-Index nötig
  const snap = await db.collection("friend_requests")
    .where("participants","array-contains", myUid).get();

  const doc = snap.docs.find(d => {
    const x = d.data();
    return x.status === "accepted" && (
      (x.fromUid === myUid && x.toUid === friendUid) ||
      (x.fromUid === friendUid && x.toUid === myUid)
    );
  });

  if (!doc) throw new Error("Keine bestehende Freundschaft gefunden.");

  await doc.ref.update({
    status: "removed",
    removedBy: myUid,
    respondedAt: TS(),
  });

  // optional: Info an den anderen
  try {
    await db.collection("notifications").add({
      type: "friend_removed",
      requestId: doc.id,
      recipientId: friendUid,
      senderId: myUid,
      message: "Die Freundschaft wurde beendet.",
      read: false,
      timestamp: TS(),
    });
  } catch {}
}

/* Optional: blocken / entblocken (nur Status wechseln) */
export async function blockFriend(myUid, friendUid) {
  const snap = await db.collection("friend_requests")
    .where("participants","array-contains", myUid).get();

  const doc = snap.docs.find(d => {
    const x = d.data();
    return (x.fromUid === myUid && x.toUid === friendUid) ||
           (x.fromUid === friendUid && x.toUid === myUid);
  });
  if (!doc) throw new Error("Kein Beziehungs-Dokument gefunden.");

  await doc.ref.update({ status:"blocked", blockedBy: myUid, respondedAt: TS() });
}

export async function unblockFriend(myUid, friendUid) {
  const snap = await db.collection("friend_requests")
    .where("participants","array-contains", myUid).get();

  const doc = snap.docs.find(d => {
    const x = d.data();
    return x.status === "blocked" && (
      (x.fromUid === myUid && x.toUid === friendUid) ||
      (x.fromUid === friendUid && x.toUid === myUid)
    );
  });
  if (!doc) throw new Error("Kein blockiertes Dokument gefunden.");

  // nach unblock ist es KEINE Freundschaft → wieder 'pending' wäre Einladung nötig
  await doc.ref.update({ status:"removed", respondedAt: TS() });
}

/* Für Modell B: No-Op (nur falls du es irgendwo aufrufst) */
export async function syncFriendshipsOnLogin() {
  return;
}

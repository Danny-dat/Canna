// services/friends.service.js
import { db, FieldValue } from "./firebase-config.js";

/* ============================================================
 * Konstante & kleine Helfer
 * ============================================================ */
const COL = "friend_requests";
const TS = () =>
  (FieldValue && FieldValue.serverTimestamp && FieldValue.serverTimestamp()) ||
  new Date();
const uniq = (arr) => Array.from(new Set(arr));

/* ============================================================
 * Freundschaftsanfrage senden (+ Notification an Empfänger)
 * Rules:
 *  - friend_requests.create: fromUid == auth.uid, toUid != fromUid
 *  - notifications.create:   senderId == auth.uid
 * ============================================================ */
export async function sendFriendRequest({
  fromUid,
  fromEmail,
  fromDisplayName,
  toUid,
}) {
  if (!fromUid || !toUid) throw new Error("UID fehlt.");
  if (fromUid === toUid) throw new Error("Du kannst dich nicht selbst hinzufügen.");

  // Bereits PENDING in eine Richtung?
  const [q1, q2] = await Promise.all([
    db.collection(COL)
      .where("fromUid", "==", fromUid)
      .where("toUid", "==", toUid)
      .where("status", "==", "pending")
      .limit(1)
      .get(),
    db.collection(COL)
      .where("fromUid", "==", toUid)
      .where("toUid", "==", fromUid)
      .where("status", "==", "pending")
      .limit(1)
      .get(),
  ]);
  if (!q1.empty || !q2.empty) return; // schon vorhanden

  // Optional: bereits ACCEPTED (bereits Freunde)?
  const [qa, qb] = await Promise.all([
    db.collection(COL)
      .where("fromUid", "==", fromUid)
      .where("toUid", "==", toUid)
      .where("status", "==", "accepted")
      .limit(1)
      .get(),
    db.collection(COL)
      .where("fromUid", "==", toUid)
      .where("toUid", "==", fromUid)
      .where("status", "==", "accepted")
      .limit(1)
      .get(),
  ]);
  if (!qa.empty || !qb.empty) return; // schon Freunde

  // Anfrage anlegen
  const reqRef = await db.collection(COL).add({
    fromUid,
    fromEmail: fromEmail ?? null,
    fromDisplayName: fromDisplayName ?? null,
    toUid,
    status: "pending",
    createdAt: TS(),
    participants: [fromUid, toUid], // für array-contains Queries
  });

  // Notification an Empfänger
  const msg = `${fromDisplayName || fromEmail || "Jemand"} hat dir eine Freundschaftsanfrage gesendet.`;
  await db.collection("notifications").add({
    type: "friend_request",
    requestId: reqRef.id,
    recipientId: toUid,   // sieht die Noti
    senderId: fromUid,    // MUSS == auth.uid (Regel)
    message: msg,
    read: false,
    timestamp: TS(),
  });
}

/* ============================================================
 * Live: eingehende (pending) Anfragen für mich hören
 * (array-contains auf participants, dann clientseitig filtern)
 * ============================================================ */
export function listenForIncomingRequests(myUid, cb) {
  return db
    .collection(COL)
    .where("participants", "array-contains", myUid)
    .onSnapshot((snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const incomingPending = all.filter(
        (r) => r.toUid === myUid && r.status === "pending"
      );
      cb(incomingPending);
    });
}

/* ============================================================
 * Optional: manuell offene Anfragen laden (Button "Aktualisieren")
 * ============================================================ */
export async function fetchFriendRequests(myUid) {
  const snap = await db
    .collection(COL)
    .where("participants", "array-contains", myUid)
    .get();

  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => r.toUid === myUid && r.status === "pending");
}

/* ============================================================
 * Live: Freunde aus akzeptierten Requests ableiten
 * - Wir lesen danach die öffentlichen Profile aus profiles_public
 * - Kein Lesen fremder "users/{uid}" nötig (deine Rules erlauben das nicht)
 * ============================================================ */
export function listenForFriends(myUid, cb) {
  return db
    .collection(COL)
    .where("participants", "array-contains", myUid)
    .onSnapshot(async (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const accepted = all.filter((r) => r.status === "accepted");

      const friendIds = uniq(
        accepted.map((r) => (r.fromUid === myUid ? r.toUid : r.fromUid))
      );
      if (!friendIds.length) return cb([]);

      // öffentliche Profile der Freunde (ist laut Rules lesbar)
      const profiles = await Promise.all(
        friendIds.map((id) => db.collection("profiles_public").doc(id).get())
      );

      const friends = profiles
        .filter((p) => p.exists)
        .map((p) => ({ id: p.id, ...(p.data() || {}) }));

      cb(friends);
    });
}

/* ============================================================
 * Anfrage annehmen (nur Empfänger) + Notification an Absender
 * - Kein Cross-Write auf fremde users/{uid}
 * - Die Freundesliste entsteht aus "accepted"-Requests
 * ============================================================ */
export async function acceptRequest(myUid, request) {
  if (!request?.id) throw new Error("Request-ID fehlt.");
  if (request.toUid !== myUid) throw new Error("Nur der Empfänger darf annehmen.");

  const reqRef = db.collection(COL).doc(request.id);

  await reqRef.update({
    status: "accepted",
    respondedAt: TS(),
  });

  // Absender informieren
  await db.collection("notifications").add({
    type: "friend_request_accepted",
    requestId: request.id,
    recipientId: request.fromUid, // ursprünglicher Absender
    senderId: myUid,              // du handelst -> MUSS == auth.uid
    message: `Deine Freundschaftsanfrage wurde akzeptiert.`,
    read: false,
    timestamp: TS(),
  });
}

/* ============================================================
 * Anfrage ablehnen (nur Empfänger) + optionale Notification
 * - requestOrId kann Objekt oder plain ID sein
 * ============================================================ */
export async function declineRequest(myUid, requestOrId) {
  let id = null;
  if (typeof requestOrId === "string") id = requestOrId;
  else if (requestOrId && typeof requestOrId === "object") id = requestOrId.id || null;
  if (!id) throw new Error("Request-ID fehlt.");

  const ref = db.collection(COL).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Anfrage existiert nicht mehr.");

  const data = snap.data();
  if (data.toUid !== myUid) throw new Error("Nur der Empfänger darf ablehnen.");

  await ref.update({
    status: "declined",
    respondedAt: TS(),
  });

  // optional: Absender informieren (Fehler hier nicht kritisch)
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
  } catch (e) {
    console.warn("Decline-Notification fehlgeschlagen:", e);
  }
}

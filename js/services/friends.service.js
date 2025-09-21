// services/friends.service.js
import { db, FieldValue } from "./firebase-config.js";

/* Timestamp helper */
const TS = () =>
  (FieldValue && FieldValue.serverTimestamp && FieldValue.serverTimestamp()) ||
  new Date();

/* -----------------------------------------------------------
 * interne Helper
 * ---------------------------------------------------------*/

/**
 * Lädt das friend_request-Dokument und schreibt
 * ein vollständiges Objekt zurück (Rules verlangen:
 * fromUid, toUid, participants bleiben unverändert)
 * und keys().hasOnly([...]) für:
 * ['fromUid','toUid','participants','status','createdAt','respondedAt']
 */
async function safeUpdateRequestFull(docId, patch) {
  const ref = db.collection("friend_requests").doc(docId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Request existiert nicht mehr.");

  const cur = snap.data();

  // ! Regeln-konform NUR die erlaubten Keys schreiben:
  const full = {
    fromUid: cur.fromUid,
    toUid: cur.toUid,
    participants: cur.participants,
    createdAt: cur.createdAt ?? TS(),
    status: cur.status,
    respondedAt: cur.respondedAt ?? null,
    // Patch (nur status/respondedAt überschreiben)
    ...pickAllowed(patch, ["status", "respondedAt"]),
  };

  await ref.set(full, { merge: false });
  return { ref, cur, full };
}

/** minimales Utility: nur erlaubte Keys aus patch übernehmen */
function pickAllowed(obj, allowed) {
  const out = {};
  if (!obj) return out;
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  }
  return out;
}

/* -----------------------------------------------------------
 * Öffentliche API
 * ---------------------------------------------------------*/

/* Anfrage senden + Noti */
export async function sendFriendRequest({
  fromUid,
  fromEmail,
  fromDisplayName,
  toUid,
}) {
  if (!fromUid || !toUid) throw new Error("UID fehlt.");
  if (fromUid === toUid)
    throw new Error("Du kannst dich nicht selbst hinzufügen.");

  // Duplikate (pending) vermeiden
  const [q1, q2] = await Promise.all([
    db
      .collection("friend_requests")
      .where("fromUid", "==", fromUid)
      .where("toUid", "==", toUid)
      .where("status", "==", "pending")
      .limit(1)
      .get(),
    db
      .collection("friend_requests")
      .where("fromUid", "==", toUid)
      .where("toUid", "==", fromUid)
      .where("status", "==", "pending")
      .limit(1)
      .get(),
  ]);
  if (!q1.empty || !q2.empty) return;

  const reqRef = await db.collection("friend_requests").add({
    fromUid,
    fromEmail: fromEmail ?? null, // create erlaubt weitere Felder
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
    message: `${
      fromDisplayName || fromEmail || "Jemand"
    } hat dir eine Freundschaftsanfrage gesendet.`,
    read: false,
    timestamp: TS(),
  });
}

/* Eingehende (pending) live hören */
export function listenForIncomingRequests(myUid, cb) {
  return db
    .collection("friend_requests")
    .where("participants", "array-contains", myUid)
    .onSnapshot((snap) => {
      const incoming = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => r.toUid === myUid && r.status === "pending");
      cb(incoming);
    });
}

/* Optional: manuell laden */
export async function fetchFriendRequests(myUid) {
  const snap = await db
    .collection("friend_requests")
    .where("participants", "array-contains", myUid)
    .get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => r.toUid === myUid && r.status === "pending");
}

/* Freunde live hören: nur status === accepted */
export function listenForFriends(myUid, cb) {
  return db
    .collection("friend_requests")
    .where("participants", "array-contains", myUid)
    .onSnapshot(async (snap) => {
      const accepted = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => r.status === "accepted");

      const friendIds = Array.from(
        new Set(
          accepted.map((r) => (r.fromUid === myUid ? r.toUid : r.fromUid))
        )
      );
      if (!friendIds.length) return cb([]);

      const profiles = await Promise.all(
        friendIds.map((id) =>
          db
            .collection("profiles_public")
            .doc(id)
            .get()
            .catch(() => null)
        )
      );

      const friends = friendIds.map((id, i) => {
        const ps = profiles[i];
        const pub = ps && ps.exists ? ps.data() || {} : {};
        const label =
          pub.username ||
          pub.displayName ||
          (id ? (id ? `${id.slice(0, 6)}…` : "") : ""); // Check if id exists
        return {
          id,
          label,
          displayName: pub.displayName ?? null,
          username: pub.username ?? null,
          photoURL: pub.photoURL ?? null,
          lastLocation: pub.lastLocation ?? null,
        };
      });

      cb(friends);
    });
}

/* Anfrage annehmen */
export async function acceptRequest(myUid, request) {
  if (!request?.id) throw new Error("Request-ID fehlt.");
  if (request.toUid !== myUid)
    throw new Error("Nur der Empfänger darf annehmen.");

  await safeUpdateRequestFull(request.id, {
    status: "accepted",
    respondedAt: TS(),
  });

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

  const { cur } = await safeUpdateRequestFull(id, {
    status: "declined",
    respondedAt: TS(),
  });

  // optional: Info an Absender
  try {
    await db.collection("notifications").add({
      type: "friend_request_declined",
      requestId: id,
      recipientId: cur.fromUid,
      senderId: myUid,
      message: `Deine Freundschaftsanfrage wurde abgelehnt.`,
      read: false,
      timestamp: TS(),
    });
  } catch {}
}

/* Freund entfernen (Modell: status -> 'removed') */
export async function removeFriend(myUid, friendUid) {
  if (!myUid || !friendUid) throw new Error("UID fehlt.");

  const snap = await db
    .collection("friend_requests")
    .where("participants", "array-contains", myUid)
    .get();

  const doc = snap.docs.find((d) => {
    const x = d.data();
    return (
      x.status === "accepted" &&
      ((x.fromUid === myUid && x.toUid === friendUid) ||
        (x.fromUid === friendUid && x.toUid === myUid))
    );
  });

  if (!doc) throw new Error("Keine bestehende Freundschaft gefunden.");

  await safeUpdateRequestFull(doc.id, {
    status: "removed",
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

/* blocken (status -> 'blocked') */
export async function blockFriend(myUid, friendUid) {
  if (!myUid || !friendUid) throw new Error("UID fehlt.");

  const snap = await db
    .collection("friend_requests")
    .where("participants", "array-contains", myUid)
    .get();

  const doc = snap.docs.find((d) => {
    const x = d.data();
    return (
      (x.fromUid === myUid && x.toUid === friendUid) ||
      (x.fromUid === friendUid && x.toUid === myUid)
    );
  });
  if (!doc) throw new Error("Kein Beziehungs-Dokument gefunden.");

  await safeUpdateRequestFull(doc.id, {
    status: "blocked",
    respondedAt: TS(),
  });
}

/* entblocken → auf 'removed' setzen (keine Freundschaft) */
export async function unblockFriend(myUid, friendUid) {
  if (!myUid || !friendUid) throw new Error("UID fehlt.");

  const snap = await db
    .collection("friend_requests")
    .where("participants", "array-contains", myUid)
    .get();

  const doc = snap.docs.find((d) => {
    const x = d.data();
    return (
      x.status === "blocked" &&
      ((x.fromUid === myUid && x.toUid === friendUid) ||
        (x.fromUid === friendUid && x.toUid === myUid))
    );
  });
  if (!doc) throw new Error("Kein blockiertes Dokument gefunden.");

  await safeUpdateRequestFull(doc.id, {
    status: "removed",
    respondedAt: TS(),
  });
}

export async function shareMyFriendCode(uid) {
  const code = (uid || "").trim();
  if (!code) throw new Error("Kein Nutzer angemeldet.");

  const text = `Mein CannaTrack Freundschaftscode: ${code}`;

  // 1) Native Share (mobil/unterstützte Browser)
  try {
    if (navigator.share) {
      await navigator.share({ title: "CannaTrack", text });
      return { method: "share", ok: true };
    }
    throw new Error("Web Share nicht verfügbar");
  } catch (_) {
    // weiter zu Clipboard
  }

  // 2) Clipboard API (HTTPS nötig)
  try {
    await navigator.clipboard.writeText(code);
    return { method: "clipboard", ok: true };
  } catch (_) {
    // Fallback (ohne HTTPS/Clipboard-Rechte)
  }

  // 3) Letzter Fallback
  try {
    const tmp = document.createElement("textarea");
    tmp.value = code;
    tmp.style.position = "fixed";
    tmp.style.left = "-9999px";
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand("copy");
    document.body.removeChild(tmp);
    return { method: "execCommand", ok: true };
  } catch {
    // ganz einfacher Fallback
    prompt("Code zum Kopieren:", code);
    return { method: "prompt", ok: true };
  }
}

/* Text in die Zwischenablage kopieren (Clipboard API mit Fallbacks) */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      prompt("Zum Kopieren:", text);
      return true;
    }
  }
}

/* Für dein Modell B: aktuell nichts zu tun */
export async function syncFriendshipsOnLogin() {
  return;
}

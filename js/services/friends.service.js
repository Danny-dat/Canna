import { db, FieldValue } from './firebase-config.js';

export async function sendFriendRequest({ fromUid, fromEmail, fromDisplayName, toUid }) {
  const req = {
    from: fromUid,
    fromEmail,
    fromDisplayName,
    to: toUid,
    status: 'pending',
    createdAt: new Date(),
    participants: [fromUid, toUid]
  };
  await db.collection('friend_requests').add(req);
}

export async function fetchFriendRequests(uid) {
  const snap = await db.collection('friend_requests')
    .where('participants', 'array-contains', uid).get();

  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(r => r.to === uid && r.status === 'pending');
}

export function listenForFriends(uid, cb) {
  return db.collection('users').doc(uid).onSnapshot(async (doc) => {
    if (!doc.exists || !doc.data().friends?.length) return cb([]);
    const friendDocs = await Promise.all(
      doc.data().friends.map(id => db.collection('users').doc(id).get())
    );
    const friends = friendDocs.filter(f => f.exists).map(f => ({ id: f.id, ...f.data() }));
    cb(friends);
  });
}

export async function acceptRequest(uid, request) {
  const batch = db.batch();
  const reqRef = db.collection('friend_requests').doc(request.id);
  const meRef  = db.collection('users').doc(uid);
  batch.update(reqRef, { status: 'accepted' });
  batch.update(meRef, { friends: FieldValue.arrayUnion(request.from) });
  await batch.commit();
}

export function declineRequest(id) {
  return db.collection('friend_requests').doc(id).update({ status: 'declined' });
}

// js/services/friends.service.js
import { db, FieldValue } from './firebase-config.js';

/** Subscribe to incoming friend requests */
export function listenRequests(uid, cb) {
  return db.collection('friend_requests').where('to', '==', uid)
    .onSnapshot(snap => {
      const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      cb(reqs);
    });
}

export async function sendRequest(currentUser, currentUserData, friendId) {
  if (!friendId) throw new Error('No friend ID');
  const payload = {
    from: currentUser.uid,
    to: friendId,
    fromName: currentUserData?.username || currentUser.email,
    status: 'pending',
    createdAt: new Date()
  };
  await db.collection('friend_requests').add(payload);
}

export async function accept(request) {
  const batch = db.batch();
  batch.update(db.collection('friend_requests').doc(request.id), { status: 'accepted' });
  batch.update(db.collection('users').doc(request.to), { friends: FieldValue.arrayUnion(request.from) });
  await batch.commit();
}

export async function decline(requestId) {
  await db.collection('friend_requests').doc(requestId).update({ status: 'declined' });
}

/** Subscribe to current friend list (example schema: users/<uid>.friends = [uids]) */
export function listenFriends(uid, cb) {
  return db.collection('users').doc(uid).onSnapshot(doc => {
    const data = doc.data() || {};
    const friends = data.friends || [];
    cb(friends);
  });
}

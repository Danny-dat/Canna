import { db, FieldValue } from './firebase-config.js';

export function listenForEvents(cb) {
  return db.collection('events').orderBy('name').onSnapshot(snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export function voteEvent(eventId, uid, type) {
  const ref = db.collection('events').doc(eventId);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error('Event not found');
    if (type === 'up') {
      tx.update(ref, { 
        upvotes: FieldValue.arrayUnion(uid),
        downvotes: FieldValue.arrayRemove(uid)
      });
    } else {
      tx.update(ref, { 
        downvotes: FieldValue.arrayUnion(uid),
        upvotes: FieldValue.arrayRemove(uid)
      });
    }
  });
}

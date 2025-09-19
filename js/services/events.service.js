// js/services/events.service.js
import { db, FieldValue } from './firebase-config.js';

/** Listen to events collection and return unsubscribe */
export function listen(callback) {
  return db.collection('events')
    .orderBy('name')
    .onSnapshot((snap) => {
      const events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      callback(events);
    });
}

/** Toggle up/down vote for a user */
export function vote(eventId, uid, type) {
  const ref = db.collection('events').doc(eventId);
  return db.runTransaction(async (t) => {
    const doc = await t.get(ref);
    if (!doc.exists) throw new Error('Event not found');
    const data = doc.data();
    const up = data.upvotes || [];
    const down = data.downvotes || [];
    const hasUp = up.includes(uid);
    const hasDown = down.includes(uid);

    if (type === 'up') {
      t.update(ref, hasUp
        ? { upvotes: FieldValue.arrayRemove(uid) }
        : { upvotes: FieldValue.arrayUnion(uid), downvotes: FieldValue.arrayRemove(uid) });
    } else {
      t.update(ref, hasDown
        ? { downvotes: FieldValue.arrayRemove(uid) }
        : { downvotes: FieldValue.arrayUnion(uid), upvotes: FieldValue.arrayRemove(uid) });
    }
  });
}

// CannaTrack/events.js
import { db } from './firebase-config.js';

export default {
    listenForEvents(callback) {
        return db.collection('events').orderBy('name')
            .onSnapshot(snapshot => {
                const events = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                callback(events);
            });
    },

    voteEvent(eventId, uid, voteType) {
        const eventRef = db.collection('events').doc(eventId);
        return db.runTransaction(async (transaction) => {
            const doc = await transaction.get(eventRef);
            if (!doc.exists) throw "Event does not exist!";

            const upvotes = doc.data().upvotes || [];
            const downvotes = doc.data().downvotes || [];
            const hasUpvoted = upvotes.includes(uid);
            const hasDownvoted = downvotes.includes(uid);

            if (voteType === 'up') {
                if (hasUpvoted) {
                    transaction.update(eventRef, { upvotes: firebase.firestore.FieldValue.arrayRemove(uid) });
                } else {
                    transaction.update(eventRef, {
                        upvotes: firebase.firestore.FieldValue.arrayUnion(uid),
                        downvotes: firebase.firestore.FieldValue.arrayRemove(uid)
                    });
                }
            } else if (voteType === 'down') {
                if (hasDownvoted) {
                    transaction.update(eventRef, { downvotes: firebase.firestore.FieldValue.arrayRemove(uid) });
                } else {
                    transaction.update(eventRef, {
                        downvotes: firebase.firestore.FieldValue.arrayUnion(uid),
                        upvotes: firebase.firestore.FieldValue.arrayRemove(uid)
                    });
                }
            }
        });
    }
};
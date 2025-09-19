import { db } from './firebase-config.js';

export default {
    async sendFriendRequest(user, userData, friendIdInput) {
        if (!friendIdInput.trim() || friendIdInput.trim() === user.uid) {
            return alert("Ungültige User-ID.");
        }
        const recipientId = friendIdInput.trim();
        const request = {
            from: user.uid,
            fromEmail: user.email,
            fromDisplayName: userData.displayName || user.email,
            to: recipientId,
            status: 'pending',
            createdAt: new Date(),
            participants: [user.uid, recipientId]
        };
        await db.collection('friend_requests').add(request);
        alert('Freundschaftsanfrage gesendet!');
    },

    listenForFriendRequests(uid, callback) {
        return db.collection('friend_requests')
            .where('participants', 'array-contains', uid)
            .onSnapshot(snapshot => {
                const requests = snapshot.docs
                    .map(doc => ({ id: doc.id, ...doc.data() }))
                    .filter(req => req.to === uid && req.status === 'pending');
                callback(requests);
            }, error => {
                console.error("Fehler beim Abrufen der Freundschaftsanfragen:", error);
            });
    },
    
    async acceptRequest(request) {
        const batch = db.batch();
        batch.update(db.collection('friend_requests').doc(request.id), { status: 'accepted' });
        batch.update(db.collection('users').doc(request.to), { friends: firebase.firestore.FieldValue.arrayUnion(request.from) });
        await batch.commit();
    },

    declineRequest(requestId) {
        return db.collection('friend_requests').doc(requestId).update({ status: 'declined' });
    },

    listenForFriends(uid, callback) {
        return db.collection('users').doc(uid).onSnapshot(async (doc) => {
            if (doc.exists && doc.data().friends?.length > 0) {
                const friendDocs = await Promise.all(doc.data().friends.map(id => db.collection('users').doc(id).get()));
                const friends = friendDocs.filter(fDoc => fDoc.exists).map(fDoc => ({ id: fDoc.id, ...fDoc.data() }));
                callback(friends);
            } else {
                callback([]);
            }
        });
    }
};
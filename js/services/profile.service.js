import { db } from './firebase-config.js';

export async function ensurePublicProfileOnLogin(user){
const ref = db.collection('profiles_public').doc(user.uid);
const snap = await ref.get();

const name = user.displayName
|| (user.email ? user.email.split('@')[0] : null)
|| `User-${user.uid.slice(0,6)}`;

if (!snap.exists) {
await ref.set({ displayName: name, photoURL: user.photoURL || null, createdAt: new Date() }, { merge: true });
} else if (!snap.data().displayName && name) {
await ref.set({ displayName: name }, { merge: true });
}
}

export async function updatePublicProfile(uid, patch){
return db.collection('profiles_public').doc(uid).set({ ...patch, updatedAt: new Date() }, { merge:true });
}
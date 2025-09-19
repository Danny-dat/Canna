import { auth, db } from './firebase-config.js';

export function onAuth(cb) {
  return auth.onAuthStateChanged(cb);
}

export async function register({ email, password, displayName, phoneNumber }) {
  const cred = await auth.createUserWithEmailAndPassword(email, password);
  await db.collection('users').doc(cred.user.uid).set({
    email,
    displayName,
    phoneNumber,
    friends: [],
    settings: { consumptionThreshold: 3 },
    personalization: { theme: 'light' }
  });
  return cred.user;
}

export function login(email, password) {
  return auth.signInWithEmailAndPassword(email, password);
}

export function logout() {
  return auth.signOut();
}

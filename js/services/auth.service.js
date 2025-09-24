// services/auth.service.js
import { auth, db, FieldValue } from './firebase-config.js';

export function onAuth(cb) {
  return auth.onAuthStateChanged(cb);
}

export async function register({ email, password, displayName, phoneNumber }) {
  // User in Firebase Auth anlegen
  const cred = await auth.createUserWithEmailAndPassword(email, password);

  // Optional: DisplayName im Auth-Profil speichern (für UI)
  if (displayName?.trim()) {
    await cred.user.updateProfile({ displayName: displayName.trim() }).catch(() => {});
  }

  // PRIVATES Benutzerprofil in users/{uid}
  await db.collection('users').doc(cred.user.uid).set({
    email,
    displayName: displayName?.trim() || null,
    phoneNumber: phoneNumber || null,
    friends: [],
    settings: { consumptionThreshold: 3 },
    personalization: { theme: 'light' },
    createdAt: FieldValue.serverTimestamp(), // Serverseitiger Zeitstempel
    lastActiveAt: FieldValue.serverTimestamp(),
  });

  // ÖFFENTLICHES Profil in profiles_public/{uid} (wird für Freunde/Chat benötigt!)
  await db.collection('profiles_public').doc(cred.user.uid).set({
    displayName: displayName?.trim() || null,
    username: null,
    photoURL: null,
    lastLocation: null,
    lastActiveAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  });

  // Optional: E-Mail Verifikation aktivieren
  // await cred.user.sendEmailVerification().catch(() => {});

  return cred.user;
}

export function login(email, password) {
  return auth.signInWithEmailAndPassword(email, password);
}

export function logout() {
  return auth.signOut();
}

// ✨ Passwort zurücksetzen (Mail mit Reset-Link)
export function resetPassword(email) {
  const e = (email || '').trim();
  if (!e) return Promise.reject(new Error('Bitte E-Mail eingeben.'));
  return auth.sendPasswordResetEmail(e);
}

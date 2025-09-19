import { db } from './firebase-config.js';

export async function loadUserData(uid) {
  const doc = await db.collection('users').doc(uid).get();
  if (!doc.exists) return { displayName: '', phoneNumber: '', theme: 'light' };
  const data = doc.data();
  return {
    displayName: data.displayName || '',
    phoneNumber: data.phoneNumber || '',
    theme: data.personalization?.theme || 'light'
  };
}

export async function saveUserData(uid, { displayName, phoneNumber, theme }) {
  await db.collection('users').doc(uid).set({
    displayName, phoneNumber, personalization: { theme }
  }, { merge: true });
}

export async function loadUserSettings(uid) {
  const doc = await db.collection('users').doc(uid).get();
  return { consumptionThreshold: doc.data()?.settings?.consumptionThreshold ?? 3 };
}

export async function saveUserSettings(uid, settings) {
  await db.collection('users').doc(uid).set({ settings }, { merge: true });
}

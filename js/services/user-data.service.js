// js/services/user-data.service.js
import { db } from './firebase-config.js';

export function loadUserData(uid) {
  return db.collection('users').doc(uid).get()
    .then(doc => ({ uid, ...(doc.data() || {}) }));
}

export function saveUserData(uid, data) {
  return db.collection('users').doc(uid).set(data, { merge: true });
}

export function loadUserSettings(uid) {
  return db.collection('settings').doc(uid).get()
    .then(d => d.data() || {});
}

export function saveUserSettings(uid, settings) {
  return db.collection('settings').doc(uid).set(settings, { merge: true });
}

// CannaTrack/user-data.js
import { db } from './firebase-config.js';

export default {
    async loadUserData(uid) {
        const doc = await db.collection('users').doc(uid).get();
        if (doc.exists) {
            const data = doc.data();
            return {
                displayName: data.displayName || '',
                phoneNumber: data.phoneNumber || '',
                theme: data.personalization?.theme || 'light'
            };
        }
        return { displayName: '', phoneNumber: '', theme: 'light' };
    },

    saveUserData(uid, userData) {
        return db.collection('users').doc(uid).set({
            displayName: userData.displayName,
            phoneNumber: userData.phoneNumber,
            personalization: { theme: userData.theme }
        }, { merge: true });
    },

    async loadUserSettings(uid) {
        const doc = await db.collection('users').doc(uid).get();
        if (doc.exists && doc.data().settings) {
            return doc.data().settings;
        }
        return { consumptionThreshold: 3 }; // Default
    },

    saveUserSettings(uid, settings) {
        return db.collection('users').doc(uid).set({ settings: settings }, { merge: true });
    }
};
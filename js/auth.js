// CannaTrack/auth.js
import { db, auth } from './firebase-config.js';

export default {
    async register(form) {
        const phoneRegex = /^(015|016|017)\d{8,9}$/;
        const cleanedPhoneNumber = form.phoneNumber.replace(/[\s\/-]/g, '');

        if (!form.displayName.trim()) return alert('Bitte gib einen Anzeigenamen ein.');
        if (!phoneRegex.test(cleanedPhoneNumber)) return alert('Bitte gib eine gültige deutsche Handynummer ein.');

        try {
            const cred = await auth.createUserWithEmailAndPassword(form.email, form.password);
            await db.collection('users').doc(cred.user.uid).set({
                email: cred.user.email,
                displayName: form.displayName,
                phoneNumber: cleanedPhoneNumber,
                friends: [],
                settings: { consumptionThreshold: 3 },
                personalization: { theme: 'light' }
            });
        } catch (error) {
            alert(error.message);
            throw error; // Wichtig, um den Fehler weiterzugeben
        }
    },
    login(form) {
        return auth.signInWithEmailAndPassword(form.email, form.password)
            .catch(error => {
                alert(error.message);
                throw error;
            });
    },
    logout() {
        return auth.signOut();
    }
};
import { db } from '../services/firebase-config.js';

export async function playSoundAndVibrate() {
  try {
    // Warten, falls AudioContext noch nicht gestartet
    if (window.__audioReady) await window.__audioReady();

    // Beispiel: kurzer Beep über Tone.js
    if (window.Tone) {
      const synth = new Tone.Synth().toDestination();
      await Tone.loaded();             // Samples/Nodes geladen
      synth.triggerAttackRelease("C5", "8n");
    }

    // Vibrations-Feedback (falls unterstützt)
    if (navigator.vibrate) navigator.vibrate(80);
  } catch (e) {
    console.warn("Audio/Vibrate failed:", e);
  }
}

export async function notifyFriendsIfReachedLimit(uid, displayNameOrEmail, threshold) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const q = await db.collection('consumptions').where('userId','==',uid).where('timestamp','>=',start).get();
  if (q.docs.length < threshold) return;

  const userDoc = await db.collection('users').doc(uid).get();
  const friends = userDoc.data()?.friends || [];
  const msg = `${displayNameOrEmail} hat heute die Konsumgrenze erreicht.`;
  await Promise.all(friends.map(fid => db.collection('notifications').add({
    recipientId: fid, senderId: uid, message: msg, timestamp: new Date(), read: false
  })));
}

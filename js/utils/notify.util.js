import { db } from '../services/firebase-config.js';

export async function playSoundAndVibrate() {
  // 1) Auf Lazy-Init warten (kommt aus index.html)
  const ok = await (window.__audioReady || Promise.resolve(false));
  if (!ok) return; // keine Töne ohne Gestik

  try {
    // 2) Falls der Context noch "suspended" ist: starten
    if (window.Tone?.getContext()?.rawContext?.state === 'suspended') {
      await window.Tone.start();
    }

    // 3) Kleines "ding" abspielen
    const synth = new window.Tone.Synth().toDestination();
    await window.Tone.now();              // Zeitbasis holen
    synth.triggerAttackRelease('C6', '8n');

  } catch (e) {
    console.warn('[notify] Audio blocked:', e);
  }

  // 4) Vibration (falls erlaubt/verfügbar)
  try { navigator.vibrate && navigator.vibrate(120); } catch {}
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

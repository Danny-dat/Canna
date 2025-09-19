import { db } from '../services/firebase-config.js';

export function playSoundAndVibrate() {
  try {
    if (Tone.context.state !== 'running') Tone.start();
    const synth = new Tone.Synth().toDestination();
    synth.triggerAttackRelease("C4", "8n");
  } catch (e) { /* noop */ }
  if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
}

export async function notifyFriendsIfReachedLimit(uid, displayNameOrEmail, threshold) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const q = await db.collection('consumptions').where('userId','==',uid).where('timestamp','>=',start).get();
  if (q.docs.length !== threshold) return;

  const userDoc = await db.collection('users').doc(uid).get();
  const friends = userDoc.data()?.friends || [];
  const msg = `${displayNameOrEmail} hat heute die Konsumgrenze erreicht.`;
  await Promise.all(friends.map(fid => db.collection('notifications').add({
    recipientId: fid, senderId: uid, message: msg, timestamp: new Date(), read: false
  })));
}

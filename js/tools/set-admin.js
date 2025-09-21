// tools/set-admin.js
const admin = require('firebase-admin');

// Variante A: per Umgebungsvariable (empfohlen)
//   export GOOGLE_APPLICATION_CREDENTIALS="/pfad/zu/serviceAccountKey.json"
// dann reicht:
admin.initializeApp();

async function setAdmin(uid, enabled = true) {
  // Achtung: setCustomUserClaims überschreibt ALLE Custom Claims
  // Falls du andere Claims behalten willst, lies sie vorher und mergen:
  const user = await admin.auth().getUser(uid);
  const prev = user.customClaims || {};
  const next = { ...prev, admin: enabled ? true : undefined }; // remove, wenn false
  // undefined-Felder werden entfernt:
  Object.keys(next).forEach(k => next[k] === undefined && delete next[k]);

  await admin.auth().setCustomUserClaims(uid, next);
  console.log(`OK: admin=${!!next.admin} für ${uid}`);
}

// Optional: UID per E-Mail finden
// async function uidByEmail(email) {
//   const user = await admin.auth().getUserByEmail(email);
//   return user.uid;
// }

(async () => {
  try {
    const uid = 'ZAz0Bnde5zYIS8qCDT86aOvEDX52'; // <- hier deine UID
    // oder: const uid = await uidByEmail('admin@deine-domain.tld');

    await setAdmin(uid, true); // true setzen, false entfernt das Flag
    console.log('Hinweis: Client muss Token refreshen (neu einloggen oder getIdToken(true)).');
    process.exit(0);
  } catch (e) {
    console.error('Fehler:', e.message);
    process.exit(1);
  }
})();

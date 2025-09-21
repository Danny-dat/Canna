const admin = require('firebase-admin');
admin.initializeApp({ /* serviceAccount etc. */ });

async function setAdmin(uid, enabled = true) {
  await admin.auth().setCustomUserClaims(uid, { admin: enabled });
}
setAdmin('ZAz0Bnde5zYIS8qCDT86aOvEDX52');
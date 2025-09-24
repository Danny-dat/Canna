// services/firebase-config.js
const firebaseConfig = {
  apiKey: "AIzaSyCWLDRA3lOLWzf8unvKKOmhDZ1THyrGyTQ",
  authDomain: "cannatrack-2486f.firebaseapp.com",
  projectId: "cannatrack-2486f",
  storageBucket: "cannatrack-2486f.appspot.com",
  messagingSenderId: "873798957273",
  appId: "1:873798957273:web:fe161382aa2d1b24d226c8"
};

// App einmalig initialisieren
const app = (firebase.apps && firebase.apps.length)
  ? firebase.app()
  : firebase.initializeApp(firebaseConfig);

// Firestore holen
const db = firebase.firestore();

// Settings NUR setzen, solange noch nicht "frozen"
const isFrozen = !!(db._settingsFrozen || db._delegate?._settingsFrozen);
if (!isFrozen && !window.__CT_FS_SETTINGS_DONE__) {
  try {
    db.settings({
      experimentalAutoDetectLongPolling: true,
      useFetchStreams: false,
      // experimentalForceLongPolling: true, // nur falls nötig
    });
  } catch (e) {
    // still & chill: wenn zu spät, einfach überspringen
    console.warn("[firestore] settings() skipped:", e?.message);
  }
  window.__CT_FS_SETTINGS_DONE__ = true;
}

const auth = firebase.auth();
const FieldValue = firebase.firestore.FieldValue;

export { auth, db, FieldValue };

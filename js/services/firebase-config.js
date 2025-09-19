const firebaseConfig = {
  apiKey: "AIzaSyCWLDRA3lOLWzf8unvKKOmhDZ1THyrGyTQ",
  authDomain: "cannatrack-2486f.firebaseapp.com",
  projectId: "cannatrack-2486f",
  storageBucket: "cannatrack-2486f.appspot.com",
  messagingSenderId: "873798957273",
  appId: "1:873798957273:web:fe161382aa2d1b24d226c8"
};

// Robust, ohne optional chaining
if (!window.firebase.apps || !window.firebase.apps.length) {
  window.firebase.initializeApp(firebaseConfig);
}

const auth = window.firebase.auth();
const db = window.firebase.firestore();
const FieldValue = window.firebase.firestore.FieldValue;


export { auth, db, FieldValue };
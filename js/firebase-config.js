const firebaseConfig = {
    apiKey: "AIzaSyCWLDRA3lOLWzf8unvKKOmhDZ1THyrGyTQ",
    authDomain: "cannatrack-2486f.firebaseapp.com",
    projectId: "cannatrack-2486f",
    storageBucket: "cannatrack-2486f.appspot.com",
    messagingSenderId: "873798957273",
    appId: "1:873798957273:web:fe161382aa2d1b24d226c8"
};

// Initialisiere Firebase
firebase.initializeApp(firebaseConfig);

// Exportiere die wichtigen Firebase-Dienste, damit andere Dateien sie nutzen können
export const db = firebase.firestore();
export const auth = firebase.auth();
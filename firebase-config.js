// Your web app's Firebase configuration
const firebaseConfig = {
    // You'll get these values from Firebase Console
    apiKey: "your-actual-api-key",
    authDomain: "just-start-cea82.firebaseapp.com",
    databaseURL: "https://just-start-cea82-default-rtdb.firebaseio.com",
    projectId: "just-start-cea82",
    storageBucket: "just-start-cea82.appspot.com",
    messagingSenderId: "your-messaging-sender-id",
    appId: "your-app-id"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database(); 
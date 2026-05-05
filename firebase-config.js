import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBXDdocjCL9cBvF1b30Xe3KIF2Prd3_qCs",
  authDomain: "torneio-cs.firebaseapp.com",
  projectId: "torneio-cs",
  storageBucket: "torneio-cs.firebasestorage.app",
  messagingSenderId: "722843986325",
  appId: "1:722843986325:web:383d2d5e67883840412e9c",
  measurementId: "G-S61B5RD99P"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

window.firebaseApp = app;
window.db = db;
window.auth = auth;

console.log('Firebase inicializado com sucesso');
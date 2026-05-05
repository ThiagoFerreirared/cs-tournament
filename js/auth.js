// js/auth.js
// Inicializa Firebase apenas se ainda não foi inicializado
const _fbConfig = {
  apiKey: "AIzaSyBXDdocjCL9cBvF1b30Xe3KIF2Prd3_qCs",
  authDomain: "torneio-cs.firebaseapp.com",
  projectId: "torneio-cs",
  storageBucket: "torneio-cs.firebasestorage.app",
  messagingSenderId: "722843986325",
  appId: "1:722843986325:web:383d2d5e67883840412e9c"
};

if (!firebase.apps.length) {
  firebase.initializeApp(_fbConfig);
}

const auth = firebase.auth();
const db   = firebase.firestore();
window._db  = db;

function login() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const err   = document.getElementById('login-error');
  if(err) err.style.display = 'none';
  auth.signInWithEmailAndPassword(email, pass)
    .then(() => { location.href = 'index.html'; })
    .catch(() => { if(err) err.style.display = 'block'; });
}

window.doLogin = login;

function logout() {
  auth.signOut().then(() => location.href = 'login.html');
}

function guardAdmin() {
  auth.onAuthStateChanged(user => {
    if (!user) location.href = 'login.html';
  });
}

// js/auth.js
// Configuração Firebase – mesma usada no restante da aplicação
firebase.initializeApp({
  apiKey: "AIzaSyBXDdocjCL9cBvF1b30Xe3KIF2Prd3_qCs",
  authDomain: "torneio-cs.firebaseapp.com",
  projectId: "torneio-cs",
  storageBucket: "torneio-cs.firebasestorage.app",
  messagingSenderId: "722843986325",
  appId: "1:722843986325:web:383d2d5e67883840412e9c"
});
const auth = firebase.auth();
const db = firebase.firestore();
window._db = db; // mantém compatibilidade com o código existente

function login() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  auth.signInWithEmailAndPassword(email, pass)
    .then(() => {
      // redireciona para a dashboard de admin protegida
      location.href = 'admin.html';
    })
    .catch(err => alert('Credenciais inválidas: ' + err.message));
}

function logout() {
  auth.signOut().then(() => location.href = 'login.html');
}

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

const userMap = {
  'thiago': 'thiago@torneio.com'
};

function doLogin() {
  const user = document.getElementById('login-user').value.trim().toLowerCase();
  const pass = document.getElementById('login-pass').value;
  const err  = document.getElementById('login-error');
  if(err) err.style.display = 'none';

  const email = userMap[user];
  if(!email) { if(err) err.style.display = 'block'; return; }

  auth.signInWithEmailAndPassword(email, pass)
    .then(() => { location.href = 'dashboard.html'; })
    .catch(() => { if(err) err.style.display = 'block'; });
}

window.doLogin = doLogin;

function logout() {
  auth.signOut().then(() => location.href = 'index.html');
}

function guardAdmin() {
  auth.onAuthStateChanged(user => {
    if (!user) location.href = 'index.html';
  });
}

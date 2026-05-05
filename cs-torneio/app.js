import {
  collection, doc, setDoc, addDoc, getDocs, getDoc, updateDoc, deleteDoc,
  onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Aguarda Firebase estar disponível
let db = window.db;
let settingsRef, teamsCol, bracketRef;

if (!db) {
  console.warn('Firebase não está inicializado ainda. Aguardando...');
  await new Promise(resolve => {
    const check = setInterval(() => {
      if (window.db) {
        db = window.db;
        clearInterval(check);
        resolve();
      }
    }, 100);
  });
}

settingsRef = doc(db, 'tournament', 'main');
teamsCol = collection(db, 'teams');
bracketRef = doc(db, 'tournament', 'bracket');

// Inicializa documentos no Firebase se não existirem
async function ensureDocs() {
  try {
    const settingsSnap = await getDoc(settingsRef);
    if (!settingsSnap.exists()) {
      await setDoc(settingsRef, {
        registrationOpen: true,
        phase: 'Inscrição',
        champion: null,
        updatedAt: serverTimestamp()
      });
    }
    const bracketSnap = await getDoc(bracketRef);
    if (!bracketSnap.exists()) {
      await setDoc(bracketRef, { rounds: [], updatedAt: serverTimestamp() });
    }
  } catch (err) {
    console.error('Erro ao inicializar documentos:', err);
  }
}

// Funções auxiliares
function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildRounds(teams) {
  const shuffled = shuffle(teams);
  let size = 2;
  while (size < shuffled.length) size *= 2;
  const padded = [...shuffled];
  while (padded.length < size) padded.push(null);

  const rounds = [];
  const firstMatches = [];
  for (let i = 0; i < padded.length; i += 2) {
    const team1 = padded[i];
    const team2 = padded[i + 1];
    const winnerId = team1 && !team2 ? team1.id : (!team1 && team2 ? team2.id : null);
    firstMatches.push({ team1, team2, score1: null, score2: null, winnerId });
  }
  rounds.push({ name: 'Primeira fase', matches: firstMatches });

  let count = firstMatches.length;
  let roundIndex = 2;
  while (count > 1) {
    count = Math.ceil(count / 2);
    rounds.push({
      name: count === 1 ? 'Final' : `Rodada ${roundIndex}`,
      matches: Array.from({ length: count }, () => ({ team1: null, team2: null, score1: null, score2: null, winnerId: null }))
    });
    roundIndex++;
  }
  return rounds;
}

function propagate(rounds, teams) {
  for (let i = 0; i < rounds.length - 1; i++) {
    const current = rounds[i].matches;
    const next = rounds[i + 1].matches;
    for (let j = 0; j < current.length; j += 2) {
      const nextMatch = next[Math.floor(j / 2)];
      const m1 = current[j];
      const m2 = current[j + 1];
      nextMatch.team1 = teams.find(t => t.id === m1?.winnerId) || null;
      nextMatch.team2 = teams.find(t => t.id === m2?.winnerId) || null;
      if (nextMatch.team1 && !nextMatch.team2) nextMatch.winnerId = nextMatch.team1.id;
      if (!nextMatch.team1 && nextMatch.team2) nextMatch.winnerId = nextMatch.team2.id;
    }
  }
  return rounds;
}

// Funções públicas para o HTML chamar
window.firebaseActions = {
  async registerTeam(name, tag, contact, email, players, paymentNote, paymentStatus) {
    if (!name || players.length < 5) throw new Error('Dados inválidos');
    
    await addDoc(teamsCol, {
      name: name.trim(),
      tag: tag.trim().toUpperCase() || getInitials(name),
      contact: contact.trim(),
      email: email.trim(),
      paymentNote: paymentNote.trim(),
      paymentStatus: paymentStatus || 'pendente',
      paymentMethod: 'PIX',
      paymentAmount: 250,
      paymentPixKey: 't.redbala@gmail.com',
      players: players.filter(p => p.trim()),
      createdAt: serverTimestamp()
    });
  },

  async markTeamPaid(teamId) {
    await updateDoc(doc(db, 'teams', teamId), { 
      paymentStatus: 'confirmado', 
      updatedAt: serverTimestamp() 
    });
  },

  async removeTeam(teamId) {
    await deleteDoc(doc(db, 'teams', teamId));
  },

  async drawBracket(teams) {
    if (teams.length < 2) throw new Error('Mínimo 2 times necessário');
    const rounds = propagate(buildRounds(teams), teams);
    await setDoc(bracketRef, { rounds, updatedAt: serverTimestamp() });
    await updateDoc(settingsRef, { 
      registrationOpen: false, 
      phase: 'Chave gerada', 
      updatedAt: serverTimestamp() 
    });
  },

  async reportResult(roundIndex, matchIndex, teams, bracket, winnerTeamId) {
    const rounds = structuredClone(bracket);
    const match = rounds[roundIndex].matches[matchIndex];
    
    match.winnerId = winnerTeamId;
    match.score1 = match.team1?.id === winnerTeamId ? 1 : 0;
    match.score2 = match.team2?.id === winnerTeamId ? 1 : 0;

    const updated = propagate(rounds, teams);
    await setDoc(bracketRef, { rounds: updated, updatedAt: serverTimestamp() });

    const lastRound = updated[updated.length - 1];
    if (lastRound?.matches?.[0]?.winnerId) {
      const champ = teams.find(t => t.id === lastRound.matches[0].winnerId);
      if (champ) {
        await updateDoc(settingsRef, { 
          champion: { id: champ.id, name: champ.name }, 
          phase: 'Finalizado', 
          updatedAt: serverTimestamp() 
        });
      }
    } else {
      await updateDoc(settingsRef, { 
        phase: 'Em andamento', 
        updatedAt: serverTimestamp() 
      });
    }
  },

  async closeRegistration() {
    await updateDoc(settingsRef, { 
      registrationOpen: false, 
      phase: 'Inscrições encerradas', 
      updatedAt: serverTimestamp() 
    });
  },

  async reopenRegistration() {
    await updateDoc(settingsRef, { 
      registrationOpen: true, 
      phase: 'Inscrição', 
      champion: null, 
      updatedAt: serverTimestamp() 
    });
    await setDoc(bracketRef, { rounds: [], updatedAt: serverTimestamp() });
  },

  async resetAll() {
    const snap = await getDocs(teamsCol);
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    await setDoc(bracketRef, { rounds: [], updatedAt: serverTimestamp() });
    await setDoc(settingsRef, { 
      registrationOpen: true, 
      phase: 'Inscrição', 
      champion: null, 
      updatedAt: serverTimestamp() 
    });
  }
};

// Sincroniza dados do Firebase com o estado global
function subscribeToFirebase() {
  onSnapshot(settingsRef, snap => {
    const settings = snap.data() || { registrationOpen: true, phase: 'Inscrição', champion: null };
    // Atualiza status banner
    const banner = document.getElementById('dashboard-status-banner');
    const statusText = document.getElementById('dashboard-status-text');
    if (banner && statusText) {
      if (settings.champion) {
        banner.className = 'status-banner live';
        statusText.textContent = `🏆 Campeão: ${settings.champion.name}`;
      } else if (settings.phase === 'Em andamento') {
        banner.className = 'status-banner started';
        statusText.textContent = '⚔️ Torneio em andamento — registre os resultados';
      } else if (!settings.registrationOpen) {
        banner.className = 'status-banner closed';
        statusText.textContent = '🔒 Inscrições encerradas — realize o sorteio';
      } else {
        banner.className = 'status-banner open';
        statusText.textContent = '✅ Inscrições abertas';
      }
    }
    // Atualiza botões de admin
    const closeBtn = document.getElementById('btn-close-reg');
    const reopenBtn = document.getElementById('btn-reopen');
    const drawBtn = document.getElementById('btn-draw');
    if (closeBtn) closeBtn.style.display = settings.registrationOpen ? '' : 'none';
    if (reopenBtn) reopenBtn.style.display = settings.registrationOpen ? 'none' : '';
    if (drawBtn) drawBtn.disabled = !settings.registrationOpen && !settings.phase.includes('Chave');
  });

  onSnapshot(teamsCol, snap => {
    window.firebaseTeams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Dispara evento para atualizar UI
    window.dispatchEvent(new CustomEvent('teamsUpdated'));
  });

  onSnapshot(bracketRef, snap => {
    const data = snap.data() || { rounds: [] };
    window.firebaseBracket = data.rounds || [];
    // Dispara evento para atualizar UI
    window.dispatchEvent(new CustomEvent('bracketUpdated'));
  });
}

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().substr(0, 2);
}

// Inicializa
await ensureDocs();
subscribeToFirebase();
console.log('Firebase integrado com sucesso!');
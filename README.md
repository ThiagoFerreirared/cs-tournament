# 🏆 Lumix Fibra CS2 — Plataforma de Torneio

Site oficial do **1º Campeonato Lumix Fibra de Counter-Strike 2**: inscrição de
times, sorteio de chave eliminatória, registro de resultados e acompanhamento
ao vivo — tudo sincronizado em tempo real via Firebase.

![status](https://img.shields.io/badge/status-ativo-success) ![stack](https://img.shields.io/badge/stack-vanilla%20JS%20%2B%20Firebase-orange)

---

## ✨ Funcionalidades

- **Home pública ao vivo** — times inscritos, chave do torneio, fase atual e
  campeão, atualizados em tempo real sem recarregar a página.
- **Inscrição de times** — formulário público com chave PIX, QR Code, validação
  (nome único, mínimo de jogadores) e bloqueio quando as inscrições encerram.
- **Painel administrativo protegido** (login por e-mail/senha):
  - Encerrar / reabrir inscrições
  - Sorteio automático da chave (eliminatória simples, com _byes_)
  - Registro de placares com propagação automática dos vencedores
  - Confirmação de pagamento e remoção de times
  - Notificações no navegador a cada nova inscrição
- **Tema claro/escuro** persistente e layout responsivo (desktop e mobile).

## 🧱 Stack

| Camada | Tecnologia |
|---|---|
| Frontend | HTML + CSS + JavaScript (ES Modules) — **sem build, sem framework** |
| Backend | Firebase **Firestore** (dados em tempo real) + **Auth** (admin) |
| Hospedagem | **Vercel** (deploy automático a cada push na `main`) |

Sem etapa de build: o navegador carrega os módulos ES diretamente. A única
exigência é **servir os arquivos via HTTP** (não abrir com `file://`).

## 📁 Estrutura

```
cs-tournament/
├── public/                     # raiz do site (deploy)
│   ├── index.html              # home pública (ao vivo)
│   ├── inscricao.html          # inscrição de times
│   ├── login.html              # login do admin
│   ├── admin.html              # painel administrativo (protegido)
│   ├── 404.html
│   └── assets/
│       ├── css/styles.css      # design system (tokens + componentes)
│       ├── img/favicon.svg
│       └── js/
│           ├── config.js       # ⚙️ configuração do torneio + Firebase
│           ├── firebase.js     # inicialização do Firebase
│           ├── auth.js         # login / logout / proteção de rota
│           ├── store.js        # camada de dados (Firestore)
│           ├── bracket.js      # lógica pura da chave eliminatória
│           ├── render.js       # HTML compartilhado (chave, times)
│           ├── ui.js           # tema, toasts, formatação, escape XSS
│           └── page-*.js       # script de cada página
├── vercel.json                 # hospedagem (serve a pasta public/)
├── firebase.json               # config do Firestore (regras/índices)
├── firestore.rules             # regras de segurança
├── firestore.indexes.json
├── .firebaserc                 # projeto Firebase (torneio-cs)
└── package.json                # scripts utilitários
```

## 🚀 Rodando localmente

Pré-requisito: Node.js instalado.

```bash
npm run dev
```

Isso sobe um servidor estático em <http://localhost:5173>. Abra essa URL no
navegador. (Qualquer servidor estático serve — ex.: `python -m http.server`
dentro de `public/`.)

> ⚠️ Não abra os `.html` com duplo-clique (`file://`): os módulos ES e o
> Firebase exigem `http://`.

## ☁️ Deploy

### Site → Vercel

A Vercel publica automaticamente a cada `git push` na branch `main`. O
[`vercel.json`](vercel.json) define `public/` como diretório servido — não há
etapa de build. Nada manual a fazer: só commitar e enviar.

> Se o projeto na Vercel tiver um **Root Directory** configurado, deixe-o vazio
> (raiz do repositório); o `outputDirectory: public` cuida do resto.

### Banco de dados / regras → Firebase

O Firebase é usado apenas como backend (Firestore + Auth). Para publicar as
regras de segurança:

```bash
npm install -g firebase-tools   # uma vez
firebase login                  # uma vez
npm run deploy:rules            # publica firestore.rules
```

O projeto já aponta para `torneio-cs` em [`.firebaserc`](.firebaserc).

## 🔐 Configuração do Firebase

### Criar o administrador

O painel usa **Authentication → Sign-in method → E-mail/senha**. No
[console do Firebase](https://console.firebase.google.com/project/torneio-cs/authentication/users),
ative o provedor e crie o usuário admin (ex.: `thiago@lumixfibra.com.br`).

Para digitar só `thiago` no login em vez do e-mail completo, mantenha o atalho
em [`public/assets/js/config.js`](public/assets/js/config.js):

```js
export const adminAliases = { thiago: "thiago@lumixfibra.com.br" };
```

### Regras de segurança

Estão em [`firestore.rules`](firestore.rules) e seguem o princípio:

- **Leitura pública** (a página ao vivo precisa exibir os dados);
- **Inscrição pública** permitida com validação e só com inscrições abertas;
- **Escritas administrativas** (sorteio, placares, remoção) exigem login.

Publique com `npm run deploy:rules`.

> A `apiKey` do Firebase no `config.js` é **pública por design** — ela apenas
> identifica o projeto. A segurança real vem das regras acima e da autenticação.

## 🗃️ Modelo de dados (Firestore)

```
teams/{id}
  name, tag, contact, email, players[],
  paymentStatus: "pendente" | "confirmado",
  paymentAmount, paymentNote, createdAt

tournament/main
  registrationOpen: bool
  phase: "Inscrição" | "Inscrições encerradas" | "Em andamento" | "Finalizado"
  champion: { id, name } | null

tournament/bracket
  rounds: [ { name, matches: [ { id, team1, team2, score1, score2, winnerId, played } ] } ]
```

## ⚙️ Personalização

Quase tudo (nome, datas, premiação, valor da inscrição, chave PIX, limites)
vive num só lugar: [`public/assets/js/config.js`](public/assets/js/config.js).
Edite lá e todas as páginas se atualizam — os textos são injetados via
atributos `data-fill`.

## 📄 Licença

MIT © Thiago Ferreira

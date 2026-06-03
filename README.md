# 🏆 Lumix Fibra CS2 — Plataforma de Torneio

Site oficial do **1º Campeonato Lumix Fibra de Counter-Strike 2**: inscrição de
times, liga de pontos corridos (todos contra todos) com final, classificação e
estatísticas dos jogadores — tudo ao vivo, sincronizado via Firebase.

![status](https://img.shields.io/badge/status-ativo-success) ![stack](https://img.shields.io/badge/stack-vanilla%20JS%20%2B%20Firebase-orange)

---

## ✨ Funcionalidades

- **Tela inicial de login** (`index.html`) que serve de portão: entrar no
  painel, inscrever um time ou acompanhar como visitante.
- **Visão pública ao vivo** (`torneio.html`) — classificação, ranking de
  jogadores, jogos, final e campeão em tempo real, sem recarregar a página.
- **Formato:** todos contra todos em **MD3** (fase de pontos) e os **2 melhores**
  disputam a **final em MD5**. O **vencedor leva toda a premiação**.
- **Duas tabelas de ranking:** classificação dos times (J/V/D, saldo de mapas,
  pontos) e ranking de jogadores (**kills, mortes, assistências, K/D**).
- **Premiação em bolão** — o prêmio é a soma das inscrições (nº de times × a
  taxa) e atualiza ao vivo. Ex.: 4 times = R$ 1000 para o campeão.
- **Inscrição de times** — formulário público com chave PIX, QR Code, validação
  (nome único, mínimo de jogadores) e bloqueio quando as inscrições encerram.
- **Painel administrativo protegido** (login por e-mail/senha):
  - Encerrar / reabrir inscrições e **gerar a tabela** de jogos
  - Registrar e **editar** placares (MD3/MD5) — a classificação e a final se
    recalculam sozinhas
  - **Editar as estatísticas** (K/M/A) de cada jogador
  - **Resumo financeiro** (arrecadado × pendente) e **export CSV** dos times
  - Confirmar pagamento, editar e remover times
  - Notificações no navegador a cada nova inscrição
- **Ícones e metadados de instalação** (web manifest com ícones e tema).
- **Compartilhamento rico** (imagem Open Graph) e **Google Analytics** opcional.
- **Contagem regressiva** opcional para a data de início.
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
│   ├── index.html              # tela inicial: LOGIN + portão de entrada
│   ├── torneio.html            # visão pública ao vivo
│   ├── inscricao.html          # inscrição de times
│   ├── admin.html              # painel administrativo (protegido)
│   ├── 404.html
│   ├── manifest.webmanifest    # PWA (ícones/metadados)
│   ├── sw.js                   # service worker auto-limpante (desativado)
│   └── assets/
│       ├── css/styles.css      # design system (tokens + componentes)
│       ├── img/                # favicon, ícones PWA, imagem Open Graph
│       └── js/
│           ├── config.js       # ⚙️ configuração do torneio + Firebase
│           ├── firebase.js     # inicialização do Firebase
│           ├── auth.js         # login / logout / proteção de rota
│           ├── store.js        # camada de dados (Firestore)
│           ├── bracket.js      # lógica pura da chave (eliminatória simples)
│           ├── render.js       # HTML compartilhado (chave, conectores)
│           ├── ui.js           # tema, toasts, formatação, CSV, escape XSS
│           ├── analytics.js    # Google Analytics (gtag)
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

## ⚙️ Personalização

Quase tudo (nome, datas, premiação, valor da inscrição, chave PIX, limites)
vive num só lugar: [`public/assets/js/config.js`](public/assets/js/config.js).
Edite lá e todas as páginas se atualizam — os textos são injetados via
atributos `data-fill`.

Outros ajustes:

- **Premiação (bolão):** o prêmio é `nº de times × registrationFee`. O
  `prizeSplit` define a divisão: `[1]` = vencedor leva tudo (atual);
  `[0.7, 0.3]` = 1º 70%, 2º 30%.
- **Formato dos jogos:** `bestOf` no config — `{ round: 3, final: 5 }` (fase de
  pontos em MD3, final em MD5). `pointsPerWin` controla os pontos por vitória.
- **Contagem regressiva:** defina `startDate` (ISO) no config para exibir o
  contador na home; deixe `null` para ocultá-lo.
- **Google Analytics:** já usa o `measurementId` do config (não roda em
  localhost). Deixe vazio para desativar.
- **Imagem de compartilhamento:** [`assets/img/og.png`](public/assets/img/og.png).
  Para prévias perfeitas no WhatsApp/Discord, troque as metatags `og:image`
  pelo URL absoluto do seu domínio quando ele estiver definido.

## 📄 Licença

MIT © Thiago Ferreira

# Solane — déploiement avec analyse IA (Claude)

Ce dossier contient le site complet (`index.html`) + une fonction serverless
(`api/analyze.js`) qui appelle l'API Claude (Anthropic) pour analyser la photo
prise dans le quiz. **La clé API ne va jamais dans le code ni dans le
navigateur** — elle vit uniquement côté serveur, dans une variable
d'environnement.

## Pourquoi ce dossier existe (et pas juste le lien de prévisualisation)

Le lien de prévisualisation (Artifact) ne peut pas appeler d'API externe —
c'est bloqué par sécurité. Il continue donc à fonctionner en mode démo
(analyse simulée à partir du quiz). Pour une vraie analyse par IA de la
photo, il faut déployer ce dossier sur un hébergeur qui supporte les
fonctions serverless (Vercel, gratuit pour ce genre de projet).

## 1. Récupérer une clé API Anthropic

1. Va sur https://console.anthropic.com et crée un compte.
2. Section **API Keys** → **Create Key**.
3. Copie la clé (elle commence par `sk-ant-...`), tu ne pourras plus la
   revoir ensuite — garde-la de côté temporairement.
4. Vérifie que le compte a du crédit (des dollars de crédits gratuits sont
   généralement offerts à la création, sinon il faut ajouter une carte).

## 2. Déployer sur Vercel

**Option dashboard (le plus simple, sans terminal) :**

1. Va sur https://vercel.com, crée un compte (tu peux te connecter avec
   GitHub).
2. Mets ce dossier `solane-app` dans un dépôt GitHub (crée un nouveau repo,
   glisse les fichiers dedans, commit).
3. Sur Vercel : **Add New → Project**, importe ce repo GitHub.
4. Ne change rien aux réglages de build (le projet est un site statique +
   une fonction API, Vercel détecte ça tout seul).
5. **Avant de cliquer sur Deploy**, ouvre **Environment Variables** et
   ajoute :
   - `ANTHROPIC_API_KEY` = ta clé `sk-ant-...`
   - `ANTHROPIC_MODEL` = `claude-sonnet-5` (optionnel, c'est déjà la valeur
     par défaut)
6. Clique sur **Deploy**.

**Option CLI (si tu es à l'aise avec un terminal) :**

```bash
npm install -g vercel
cd solane-app
vercel login
vercel                      # premier déploiement (suit les questions)
vercel env add ANTHROPIC_API_KEY production
# colle ta clé quand demandé
vercel --prod               # redéploie en production avec la variable prise en compte
```

## 3. Tester

Ouvre l'URL `https://ton-projet.vercel.app` que Vercel te donne (pas le lien
Artifact claude.ai). Fais le quiz jusqu'à l'étape photo, prends une vraie
photo (ou choisis-en une), termine le quiz : la page appelle `/api/analyze`,
qui appelle Claude, et affiche le résultat avec le badge **"Analyse par IA
(Claude)"** en haut des résultats. Si quelque chose échoue côté serveur (clé
manquante, quota dépassé, erreur réseau...), le site retombe silencieusement
sur l'analyse locale (badge "Aperçu basé sur tes réponses") — jamais d'écran
cassé.

## Si ça ne marche pas

- Badge toujours "Aperçu basé sur tes réponses" même avec une photo → ouvre
  les DevTools du navigateur (F12) → onglet **Network**, refais le test, et
  regarde la réponse de `/api/analyze` : le message d'erreur JSON te dira
  quoi (clé manquante, quota, format de la photo...).
- Onglet **Functions** du dashboard Vercel → logs de `api/analyze` : les
  erreurs serveur (clé invalide, erreur Anthropic...) sont loguées là avec
  `console.error`.
- Vérifie que la variable d'environnement est bien sur **Production** (pas
  seulement Preview) si tu testes l'URL de prod.

## Sécurité

- Ne mets jamais `ANTHROPIC_API_KEY` dans `index.html`, dans un commit Git,
  ou dans un message. Elle doit rester uniquement dans les "Environment
  Variables" de Vercel (ou ton `.env` local, jamais commité — voir
  `.gitignore`).
- Chaque appel à `/api/analyze` consomme du crédit Anthropic (facturé par
  token, l'image compte dans le calcul). Si le site est public, pense à
  surveiller ta consommation dans la console Anthropic.

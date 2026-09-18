# Verify AI - Analyseur d'Information Intelligent

## Table des Matières
1. [Présentation du Projet](#1-présentation-du-projet)
2. [Architecture Technique](#2-architecture-technique)
3. [Installation et Configuration](#3-installation-et-configuration)
4. [Guide d'Utilisation](#4-guide-dutilisation)
5. [Fonctionnalités Principales](#5-fonctionnalités-principales)
6. [Flux de Travail](#6-flux-de-travail)
7. [Responsive Design](#7-responsive-design)
8. [Dépannage](#8-dépannage)

---

## 1. Présentation du Projet

Verify AI est une application web complète qui analyse l'authenticité et la fiabilité des informations en utilisant l'intelligence artificielle et de véritables recherches web. L'application :
- Recherche en temps réel des sources fiables
- Analyse le contexte et l'intention
- Fournit des jugements nuancés (pas de vrai/faux binaire)
- Permet à l'utilisateur de vérifier les sources lui-même

### Pourquoi Verify AI ?
- **Pas de données simulées** : Toutes les recherches sont effectuées via SerpAPI
- **Transparence totale** : Toutes les sources consultées sont affichées avec des liens cliquables
- **Prudence nuancée** : Aucun jugement définitif, toujours des probabilités basées sur les preuves
- **Respect des sources** : Jamais de modification des URL, titres ou domaines

---

## 2. Architecture Technique

### Stack Technique
```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Landing    │  │   Analyze    │  │   Results    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
                            ↕ HTTP
┌─────────────────────────────────────────────────────────┐
│              Backend (Express.js + Node)                 │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Fusion d'analyse (AI)                 │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │          Recherche Web (SerpAPI)                   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────┐
│                    APIs Externes                        │
│  ┌──────────────────┐  ┌─────────────────────────────┐ │
│  │    Groq AI       │  │        SerpAPI              │ │
│  │  (Llama models)  │  │    (Web Search)             │ │
│  └──────────────────┘  └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Structure des Dossiers
```
verifyAI/
├── src/                           # Frontend React
│   ├── components/
│   │   ├── analysis/             # Composants d'analyse
│   │   └── layout/               # Navbar, Footer
│   ├── pages/                    # Pages principales
│   └── styles/                   # CSS global
└── server/                       # Backend Express
    ├── services/
    │   ├── webSearch.js          # Recherche web
    │   └── fusion.js             # Analyse IA + fusion
    ├── .env                      # Variables d'environnement
    └── index.js                  # Point d'entrée
```

### Modèles IA Utilisés (Priority Order)
1. `llama-3.3-70b-versatile`
2. `llama-3.1-70b-versatile`
3. `llama-3.1-8b-instant`
4. `llama3-70b-8192`
5. `llama3-8b-8192`
6. `mixtral-8x7b-32768`

---

## 3. Installation et Configuration

### Étape 1 : Cloner le Projet
```bash
cd verifyAI
```

### Étape 2 : Configuration Backend
1. Aller dans le dossier serveur
```bash
cd server
```
2. Installer les dépendances
```bash
npm install
```
3. Créer votre fichier `.env` dans `server/` (modèle : `server/.env.example`) :
```env
# Groq API (obligatoire)
GROQ_API_KEY=VOTRE_CLE_GROQ
GROQ_MODEL=openai/gpt-oss-120b

# SerpAPI (obligatoire pour vraies recherches)
SERPAPI_KEY=VOTRE_CLE_SERPAPI

# Supabase — la clé service_role ne doit JAMAIS apparaître côté frontend.
# Sans elle, la console super admin fonctionne mais ne peut pas créer,
# supprimer ni réinitialiser un compte dans auth.users.
SUPABASE_URL=https://VOTRE_PROJET.supabase.co
SUPABASE_ANON_KEY=VOTRE_CLE_ANON
SUPABASE_SERVICE_ROLE_KEY=VOTRE_CLE_SERVICE_ROLE

# Configuration serveur
PORT=3001
CLIENT_URL=http://localhost:5173
```

4. Démarrer le serveur
```bash
node index.js
```

### Étape 3 : Configuration Frontend
1. Revenir à la racine et installer les dépendances
```bash
cd ..
npm install
```
2. Créer `.env` à la racine (modèle : `.env.example`)
```env
VITE_SUPABASE_URL=https://VOTRE_PROJET.supabase.co
VITE_SUPABASE_ANON_KEY=VOTRE_CLE_ANON
VITE_API_URL=http://localhost:3001/api
```
3. Démarrer le serveur frontend
```bash
npm run dev
```

### Étape 4 : Base de données Supabase

Ouvrir le **SQL Editor** du projet Supabase et exécuter les migrations
**dans cet ordre** :

| Fichier | Rôle |
|---|---|
| `supabase/migrations/0001_core_schema.sql` | Tables, colonnes, triggers et politiques RLS |
| `supabase/migrations/0002_admin_rpc.sql` | Fonctions d'administration, quotas, partage public |
| `supabase/migrations/0003_audit_hardening.sql` | Scelle la piste d'audit |
| `supabase/migrations/0004_visitor_visibility.sql` | Enregistre l'activité des visiteurs sans compte |

Les scripts sont idempotents : les rejouer ne détruit aucune donnée et
n'écrase pas un réglage déjà personnalisé.

Puis vérifier l'installation. Le premier script contrôle les clés, le second la
base. Aucun des deux n'affiche de secret en clair :

```bash
# Forme des clés, sans aucun appel réseau
npm run verify:keys -- --offline

# Interroge Groq, SerpAPI et Supabase : clé valide ? modèle accessible ?
# quota restant ? la clé service_role est-elle bien privilégiée ?
npm run verify:keys

# Crée un compte jetable, s'y connecte, écrit une analyse, tente une escalade
# de privilèges — qui doit échouer — puis nettoie derrière lui
npm run verify:supabase
```

Le mode `--offline` attrape déjà les deux erreurs les plus courantes : une clé
tronquée au copier-coller, et la clé `anon` collée à la place de la
`service_role` — confusion qui ne se manifeste sinon qu'à la première action
d'administration.

Enfin, créer le premier super administrateur. L'interface ne peut pas s'en
charger — il faut déjà être super admin pour y accéder — d'où ce script, à
lancer une seule fois. Le mot de passe est saisi de façon masquée et n'est
jamais écrit sur le disque :

```bash
npm run create:super-admin -- --email vous@exemple.com
```

Ce compte devient intouchable depuis l'interface : il ne peut être ni
rétrogradé, ni suspendu, ni supprimé par un autre administrateur, pas même par
un second super admin. Relancer le script sur une adresse existante répare
simplement le rôle et la désignation, sans rien recréer.

### Où obtenir les clés API ?
- **Groq** : https://console.groq.com/ (gratuite avec limites)
- **SerpAPI** : https://serpapi.com/ (offre gratuite disponible)
- **Supabase** : Project Settings → API (`anon` pour le frontend, `service_role`
  pour le serveur uniquement)

> Les fichiers SQL et notes de la première version sont conservés dans
> `supabase/legacy/` à titre d'historique. Ils sont remplacés par les
> migrations ci-dessus et ne doivent plus être exécutés — en particulier
> `NO_RLS_FIX.sql`, qui désactivait la sécurité au niveau des lignes.

---

## 4. Guide d'Utilisation

### Mode d'Emploi Rapide
1. Ouvrez l'application (par défaut : http://localhost:5173/)
2. Choisissez entre :
   - **Texte** : Coller directement l'affirmation à vérifier
   - **URL** : Entrer l'URL d'un article ou d'un site
3. Cliquez sur **Analyser**
4. Attendez que l'analyse termine (5 étapes)
5. Vérifiez les sources consultées (toutes cliquables !)
6. Lisez l'analyse nuancée

---

## 5. Fonctionnalités Principales

### 5.1 Recherche Web en Temps Réel
- Utilise SerpAPI pour trouver des sources pertinentes
- Priorise les sources fiables par défaut
- Récupère tous les résultats disponibles
- Affiche TOUTES les sources à l'utilisateur

### 5.2 Classement des Sources Fiables
| Tier | Description | Exemples |
|------|-------------|----------|
| **Haute Fiabilité** | Média internationaux reconnus | Reuters, AP, BBC, Le Monde |
| **Institutionnel** | Gouvernements, organisations | WHO, UN, UNESCO |
| **Scientifique** | Revues et bases de données | Nature, arXiv, Google Scholar |
| **Fact-Checking** | Organismes de vérification | Snopes, PolitiFact |
| **Prudent** | Sources à vérifier soigneusement | Reddit, Wikipédia |

### 5.3 Analyse Nuancée (Pas Binaire)
| Score | Jugement |
|-------|----------|
| 0-20 | Très peu probable |
| 21-40 | Peu probable |
| 41-60 | Incertain |
| 61-80 | Probable |
| 81-100 | Très probable |

### 5.4 Fonctionnalités Clés
- ✅ **Liens cliquables** pour toutes les sources
- ✅ **Transparence totale** : Aucune source cachée
- ✅ **Fallback automatique** des modèles IA si limites atteintes
- ✅ **Responsive 100%** : Mobile, Tablette, Desktop
- ✅ **Thème clair/sombre**
- ✅ **Historique d'analyse**

---

## 6. Flux de Travail

### Diagramme Complet du Flux
```
┌─────────────────────────────┐
│   Utilisateur soumet       │
│   texte ou URL             │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   Étape 1 : Extraction      │
│   d'informations clés      │
│   - Sujet principal        │
│   - Pays                   │
│   - Affirmation           │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   Étape 2 : Recherche Web   │
│   - Recherche via SerpAPI  │
│   - Classement des sources │
│   - Récupération des liens │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   Étape 3 : Analyse des    │
│   sources                  │
│   - Stance (confirme/...) │
│   - Justification         │
│   - Fiabilité             │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   Étape 4 : Analyse finale  │
│   - Score de probabilité   │
│   - Jugement nuancé        │
│   - Points vérifiés        │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│   Étape 5 : Rapport         │
│   - TOUTES les sources     │
│   - Liens cliquables       │
│   - Recommandations        │
└─────────────────────────────┘
```

### Explication Détaillée des Étapes
1. **Extraction** : Le modèle IA isole l'affirmation principale et le contexte
2. **Recherche** : Des requêtes multiples sont effectuées pour trouver des sources variées
3. **Analyse** : Chaque source est évaluée pour sa stance et sa fiabilité
4. **Fusion** : Toutes les informations sont combinées pour un jugement cohérent
5. **Rapport** : Le résultat final est présenté avec toutes les sources pour vérification

---

## 7. Responsive Design

Verify AI est entièrement responsive et s'adapte à tous les écrans :

### Breakpoints Responsive
| Taille d'écran | Appareil | Adaptations |
|----------------|----------|-------------|
| >1024px | Desktop | Layout complet, grande jauge |
| 769px - 1024px | Tablette | Tailles ajustées, layout compact |
| 481px - 768px | Mobile standard | Menu mobile, jauge réduite |
| <480px | Petit mobile | Optimisation maximale |

### Fonctionnalités Responsive Clés
- **Pas de dépassement** : Tous les textes ont `word-break: break-word`
- **Padding adaptatif** : Espacement réduit sur petits écrans
- **Flex-wrap** : Tous les éléments s'adaptent automatiquement
- **Jauge adaptée** : Taille de la jauge ajustée par breakpoint
- **Menu mobile** : Navigation hamburger sur petit écran

---

## 8. Dépannage

### Problèmes Courants et Solutions

#### 1. Erreur "Rate Limit" sur Groq
**Cause** : Limite de tokens atteinte sur le modèle
**Solution** : L'appli bascule automatiquement sur le modèle suivant !
- Les modèles sont essayés dans l'ordre de priorité
- Si tous échouent, les sources sont quand même affichées

#### 2. Erreur SerpAPI
**Cause** : Clé invalide ou quota dépassé
**Solution** : Vérifiez votre `SERPAPI_KEY` dans `.env`

#### 3. Backend ne démarre pas
**Cause** : Port 3001 occupé
**Solution** : Modifiez la variable `PORT` dans `.env`

#### 4. Sources ne s'affichent pas
**Cause** : Recherche SerpAPI en échec
**Solution** : Vérifiez les logs du backend (terminal server)

### Logs du Backend
Le serveur affiche l'avancement en temps réel :
```
[Étape 1/5] Extraction des informations clés...
[Étape 1/5] ✓ Extrait: [sujet]
[Étape 2/5] Recherche web approfondie...
[WebSearch] Performing real search...
[Étape 2/5] ✓ XX sources trouvées (X fiables)
...
```

---

## Licence
Projet Verify AI - Tous droits réservés.

---

## Contact
Pour toute question ou problème, vérifiez d'abord les logs du serveur !

# Déploiement sur Vercel

Guide complet pour déployer VerifyNet sur Vercel.

## Prérequis

- Compte GitHub
- Compte Vercel (gratuit suffit)
- Projet Supabase configuré
- Clés API: Groq et SerpAPI

## Étape 1: Préparer le repository

Le code est déjà configuré pour Vercel:

- `api/` - Serverless Functions
- `vercel.json` - Configuration Vercel
- `package.json` - Dépendances complètes (front + back)

## Étape 2: Connecter Vercel à GitHub

1. Allez sur [vercel.com](https://vercel.com)
2. Connectez-vous avec GitHub
3. Cliquez sur **"Add New Project"**
4. Sélectionnez votre repository `verifyNet-AI`
5. Cliquez sur **"Import"**

## Étape 3: Configurer les variables d'environnement

Dans la section **Environment Variables**, ajoutez:

| Nom | Valeur |
|-----|--------|
| `VITE_SUPABASE_URL` | Votre URL Supabase |
| `VITE_SUPABASE_ANON_KEY` | Votre clé anon Supabase |
| `GROQ_API_KEY` | Votre clé API Groq |
| `SERPAPI_KEY` | Votre clé API SerpAPI |

## Étape 4: Vérifier la configuration

Vérifiez que les paramètres suivants sont corrects:

- **Framework Preset**: `Vite` (détecté automatiquement)
- **Root Directory**: `./`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

## Étape 5: Déployer

Cliquez sur **"Deploy"** et attendez 1-2 minutes.

## Étape 6: Configurer Supabase (important!)

Après le déploiement, ajoutez votre URL Vercel dans Supabase:

1. Allez dans votre projet Supabase
2. **Authentication** → **URL Configuration**
3. Ajoutez votre URL Vercel dans:
   - **Site URL**: `https://votre-app.vercel.app`
   - **Redirect URLs**: `https://votre-app.vercel.app/**`

## Fonctionnalités

✅ Frontend React + Vite
✅ Serverless Functions API
✅ Supabase Auth & Database
✅ Analyse IA avec Groq
✅ Recherche web avec SerpAPI

## Développement local

Pour tester localement avant déploiement:

```bash
npm install
npm run dev
```

Les Serverless Functions ne fonctionneront pas localement, mais vous pouvez utiliser le backend Express original dans le dossier `server/`.

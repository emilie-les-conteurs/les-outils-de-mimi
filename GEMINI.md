# Contexte & Règles du Projet — Les outils de MIMI

Bienvenue dans l'espace de développement de l'application **Les outils de MIMI** (propriété d'Émilie Bazerque / Les Conteurs).
Ce document fournit le contexte permanent et les règles absolues pour travailler sur cette base de code sans avoir à redemander les accès ou les informations.

---

## 1. Identifiants & Infrastructure
- **Dépôt GitHub** : `https://github.com/emilie-les-conteurs/les-outils-de-mimi` (branche `main`)
- **Déploiement en production** : Vercel (déploiement automatique déclenché par chaque `git push origin main`)
- **Backend Supabase** :
  - URL : `https://ztypuoyyvwjnsunsoeow.supabase.co`
  - Anon Public Key : `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0eXB1b3l5dndqbnN1bnNvZW93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5OTg4OTcsImV4cCI6MjA4OTU3NDg5N30.MxOJOuiIAqCq7dvbTzRS6yhfpT3gDhyl104AvdEcHM8`
- **Utilisatrice Administrateur** : `0695aade-966f-4166-a86e-4d0bf42092b7` (Émilie Bazerque)

---

## 2. Architecture Technique
- **Vanilla pure** : HTML5, CSS3, ES6 JavaScript. Aucun bundler (pas de webpack, vite, npm build).
- **Fichiers principaux** :
  - `index.html` : Contient toutes les vues (`#view-login`, `#view-dashboard`, `#view-planner-hub`, `#view-planner`, `#view-surligneur`, `#view-admin`) et les modales.
  - `app.js` : Logique applicative, Supabase auth/data, Leaflet, export PDF, brief IA SEO.
  - `style.css` : Styles globaux et composants.
- **Skill dédié** : `.agents/skills/les-outils-de-mimi/SKILL.md` (contient le runbook complet et les références détaillées).

---

## 3. Règles Impératives
1. **Navigation Hub** :
   - Le Hub (`#view-dashboard`) est la page d'accueil par défaut de tout utilisateur connecté (y compris admin).
   - `goToDashboard()` doit toujours afficher `#view-dashboard`. Ne jamais forcer un administrateur sur `view-admin`.
   - Ne jamais casser la gestion de l'historique de navigation (`hashchange`).
2. **Surligneur SEO & Brief IA** :
   - Ne JAMAIS proposer de réécriture mécanique ou algorithmique par script dans l'application.
   - Toute optimisation SEO passe par l'export d'un fichier brief texte structuré (`.txt`) ou par la copie du prompt (`seoDownloadAIBrief()` / `seoCopyAIPrompt()`) calibré pour être glissé dans ChatGPT ou Claude.
3. **Documentation et code propre** :
   - Ne jamais insérer de bloc `<script>` dupliqué en bas de `index.html`.
   - Valider la syntaxe JavaScript avec le moteur JSC avant tout commit.
   - Toujours pousser sur `origin main` pour déployer sur Vercel.

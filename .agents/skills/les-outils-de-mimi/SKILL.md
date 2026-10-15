---
name: les-outils-de-mimi
description: Guide, architecture, identifiants et runbook complet pour développer, débugger et déployer l'application web 'Les outils de MIMI' (Tournage Planner, Surligneur SEO et Hub). Utiliser ce skill pour toute tâche sur ce projet afin d'avoir immédiatement accès aux identifiants Supabase, à la structure des fichiers et aux règles métier.
---

# Skill : Les outils de MIMI

Ce skill fournit tout le contexte technique, les accès et les règles de développement pour travailler sur l'application **Les outils de MIMI** (anciennement Tournage Planner) sans avoir à redemander les informations ou les accès à l'utilisatrice.

---

## 1. Vue d'ensemble & Accès rapides

| Élément | Valeur / Emplacement |
| :--- | :--- |
| **Dépôt GitHub** | `https://github.com/emilie-les-conteurs/les-outils-de-mimi` (branche `main`) |
| **Hébergement** | Vercel (déploiement continu à chaque `git push origin main`) |
| **Backend** | Supabase (`https://ztypuoyyvwjnsunsoeow.supabase.co`) |
| **Admin User ID** | `0695aade-966f-4166-a86e-4d0bf42092b7` (Émilie Bazerque) |
| **Détails & clés** | [Consulter le fichier credentials.md](./references/credentials.md) |

---

## 2. Architecture & Organisation du Code

L'application est une **Single Page Application (SPA) en pur Vanilla JavaScript**, sans bundler ni étape de compilation :
- `index.html` : Conteneur des vues (`#view-login`, `#view-dashboard`, `#view-planner-hub`, `#view-planner`, `#view-surligneur`, `#view-admin`) et des modales.
- `app.js` : Toute la logique applicative (authentification, persistance, carte Leaflet, export PDF, brief IA).
- `style.css` : Feuilles de styles communes, thèmes et composants.

Pour le détail complet de l'architecture et du cycle de vie des vues :
👉 [Consulter le guide d'architecture](./references/architecture.md)

---

## 3. Les Modules de l'Application

### A. Le Hub Central (`#view-dashboard`)
- Page d'accueil principale après connexion.
- Présente les cartes d'accès aux outils :
  1. **Tournage Planner** (`goToPlannerHub()`)
  2. **Surligneur SEO** (`showView('surligneur')`)
  3. **À venir** (placeholders)
- Les administrateurs disposent en plus d'un bouton `⚙ Admin` dans le header.

### B. Tournage Planner (`#view-planner-hub` & `#view-planner`)
- Gestion de projets de tournages multi-jours.
- Planning, étapes chronologiques avec lieux et adresses.
- Carte Leaflet interactive avec géocodage et itinéraires.
- Export de la feuille de route au format PDF (html2canvas + jsPDF).

### C. Surligneur SEO & Brief IA (`#view-surligneur`)
- Analyse en temps réel des occurrences de mots-clés dans un texte avec gestion des accents français.
- Diagnostic SEO chiffré (mots absents, faibles, optimaux).
- **Export de Brief IA** (`seoDownloadAIBrief()` / `seoCopyAIPrompt()`) :
  - Génère un fichier `.txt` formaté prêt à être glissé dans ChatGPT ou Claude.
  - Spécifications complètes et consignes strictes : [Consulter seo-brief-spec.md](./references/seo-brief-spec.md).

---

## 4. Règles d'or & Pièges à éviter

1. **Pas de script inline dupliqué** :
   - Ne jamais rajouter de balise `<script>` inline contenant du code métier à la fin de `index.html`. `app.js` est chargé dans le `<head>` avec `defer`.
2. **Pas de réécriture mécanique pour le SEO** :
   - L'utilisatrice a formellement rejeté les phrases générées par script local. Ne jamais réintroduire de suggestions algorithmiques. Tout passe par l'export du fichier brief pour une IA externe.
3. **Préserver la navigation Hub** :
   - `goToDashboard()` doit TOUJOURS renvoyer vers `#view-dashboard` (le Hub des outils), y compris pour les administrateurs.
   - Ne jamais forcer un utilisateur admin sur `view-admin` à la connexion ou au retour arrière.
   - Conserver l'écouteur `hashchange` pour supporter les boutons Précédent / Suivant du navigateur.
4. **Fermeture des modales** :
   - Toute modale doit se fermer au clic sur le fond noir (`.modal-overlay`) et via la touche `Échap`.

---

## 5. Procédure de Vérification & Déploiement

### Étape 1 : Valider la syntaxe JavaScript
Avant tout commit, exécuter la validation via le moteur JSC intégré à macOS :
```bash
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc -e "var window={addEventListener:function(){},location:{hash:''}}; var document={getElementById:function(){return {addEventListener:function(){},classList:{add:function(){},remove:function(){}}}},querySelectorAll:function(){return []},addEventListener:function(){}}; var localStorage={getItem:function(){},setItem:function(){},removeItem:function(){}}; var navigator={}; var setInterval=function(){}; var supabase={createClient:function(){return {auth:{onAuthStateChange:function(){},getSession:function(){return Promise.resolve({data:{}})}}}}}; load('app.js'); print('OK');"
```

### Étape 2 : Committer et déployer sur Vercel
```bash
git add app.js index.html style.css
git commit -m "feat/fix: description des modifications"
git push origin main
```
Le déploiement Vercel s'exécute automatiquement en quelques secondes.

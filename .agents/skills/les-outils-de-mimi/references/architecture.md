# Architecture Technique — Les outils de MIMI

## 1. Principes Fondamentaux
- **Stack** : Pure Vanilla HTML5, CSS3, ES6 JavaScript.
- **Zéro bundler, zéro build step** : Pas de Webpack, Vite ou npm build. Le code écrit dans `index.html`, `style.css` et `app.js` est exécuté directement par le navigateur.
- **Librairies tierces via CDN** :
  - Supabase JS v2 : `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`
  - Leaflet 1.9.4 : `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js`
  - html2canvas 1.4.1 : `https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js`
  - jsPDF 2.5.1 : `https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js`

---

## 2. Organisation des Fichiers
- **`index.html`** :
  - Contient toutes les vues (sections `<div class="view" id="view-...">`).
  - Contient les fenêtres modales (`<div class="modal-overlay" id="...">`).
  - Charge `app.js` via `<script defer src="app.js"></script>` dans le `<head>`.
  - **Avertissement critique** : Ne JAMAIS réinsérer de bloc `<script>` inline en bas de `index.html`, cela écraserait les variables et fonctions de `app.js`.
- **`app.js`** :
  - Authentification, routage SPA, persistance, synchro Supabase.
  - Module Tournage Planner (gestion des étapes, timeline, Leaflet, export PDF).
  - Module Surligneur SEO (comptage regex avec accents, diagnostic, export du brief IA).
- **`style.css`** :
  - Variables CSS (`--bg`, `--surface`, `--accent`, `--text`, `--border`, etc.).
  - Layouts, composants, styles du Planner, modales, animations.

---

## 3. Système de Navigation & Routage SPA
- **Vues principales** :
  - `#view-login` : Formulaire de connexion et inscription (avec classe `.view-login`).
  - `#view-dashboard` : Hub des outils (cartes Tournage Planner, Surligneur SEO, À venir).
  - `#view-planner-hub` : Liste des projets de tournage de l'utilisateur.
  - `#view-planner` : Éditeur de projet de tournage.
  - `#view-surligneur` : Surligneur SEO et export de brief IA.
  - `#view-admin` : Espace d'administration.
- **Règles de navigation** :
  - `showView(id)` : ferme toutes les modales, retire `.active` de toutes les vues, active `#view-[id]`, met à jour `localStorage.setItem('tp_active_view', id)` et `window.location.hash`.
  - `goToDashboard()` : retourne toujours au Hub (`#view-dashboard`).
  - Écouteur `hashchange` : permet d'utiliser les boutons Précédent / Suivant du navigateur sans se retrouver bloqué.
  - Modales : fermables par clic sur le fond noir (`.modal-overlay`) et par la touche `Échap`.

---

## 4. Persistance des Données
- **Isolation par utilisateur** : `localKey()` utilise `tp_db_${currentUser.id}` si connecté, ou `tp_db_anon` sinon.
- **Synchronisation Supabase** :
  - À chaque modification ou sauvegarde, les projets sont enregistrés dans la table `tournages`.
  - Au chargement, `loadUserProjects()` récupère les données de Supabase qui font autorité, avec le cache local en secours.

# Accès & Identifiants — Les outils de MIMI

## 1. Dépôt GitHub & Déploiement Vercel
- **Dépôt GitHub** : https://github.com/emilie-les-conteurs/les-outils-de-mimi
- **Branche principale** : `main`
- **Déploiement** : Vercel (connecté au dépôt GitHub).
  - Tout `git push origin main` déclenche un déploiement automatique en production sous quelques secondes.
- **Commande de déploiement** :
  ```bash
  git add app.js index.html (ou autres fichiers modifiés)
  git commit -m "feat/fix: description claire"
  git push origin main
  ```

---

## 2. Supabase (Backend & Base de données)
- **URL Supabase** : `https://ztypuoyyvwjnsunsoeow.supabase.co`
- **Clé Publique (Anon Key)** :
  ```text
  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp0eXB1b3l5dndqbnN1bnNvZW93Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5OTg4OTcsImV4cCI6MjA4OTU3NDg5N30.MxOJOuiIAqCq7dvbTzRS6yhfpT3gDhyl104AvdEcHM8
  ```
- **Tables principales** :
  - `tournages` : `id` (text), `user_id` (uuid), `nom` (text), `data` (jsonb), `updated_at` (timestamptz).
- **Politiques de sécurité (RLS)** :
  - Les utilisateurs ne lisent et n'écrivent que leurs propres tournages (`user_id = auth.uid()`).
- **Heartbeat Supabase** :
  - Ping automatique toutes les 4 minutes dans `app.js` pour éviter la mise en veille du projet Supabase.

---

## 3. Administrateur
- **ID Utilisateur Admin** : `0695aade-966f-4166-a86e-4d0bf42092b7` (Émilie Bazerque)
- **Rôle Admin** :
  - `isAdmin()` dans `app.js` compare `currentUser.id === ADMIN_USER_ID`.
  - Donne accès à la vue `#view-admin` (statistiques et liste des tournages / utilisateurs).
  - **Règle absolue** : L'administrateur arrive par défaut sur le Hub des outils (`#view-dashboard`) comme tout le monde, et dispose d'un bouton `⚙ Admin` dans le header. Ne JAMAIS le bloquer dans `view-admin`.

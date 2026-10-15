# Spécification du Brief IA SEO — Les outils de MIMI

## 1. Philosophie & Règle d'or
- **Aucune réécriture mécanique locale** : Ne jamais réintroduire de générateur automatique de phrases en JavaScript. L'utilisatrice a rejeté ce procédé comme étant non naturel et sans valeur.
- **Workflow de l'utilisatrice** :
  1. L'utilisatrice colle son texte et saisit ses mots-clés dans le Surligneur SEO.
  2. Le Surligneur calcule le volume (mots), les occurrences de chaque mot-clé et classe les mots (absents, faibles, optimaux).
  3. L'utilisatrice clique sur `📥 Télécharger le brief IA (.txt)` ou `📋 Copier le prompt IA`.
  4. Elle glisse simplement le fichier `.txt` ou colle le prompt dans ChatGPT ou Claude.
  5. L'IA lui renvoie les propositions retravaillées passage par passage ET le texte complet final.

---

## 2. Contenu obligatoire du Brief généré
Le fichier texte généré par `seoBuildAIPrompt()` dans `app.js` contient :

1. **Rôle & Persona de l'IA** :
   - Rédacteur en chef d'élite, expert en rédaction web éditoriale, style littéraire français et SEO sémantique.
2. **4 Consignes strictes et non négociables** :
   - **Respect absolu de la tonalité & du style** : Analyse fine de la voix de l'auteur (journalistique, chaleureux, immersif, poétique). Les ajouts doivent être indétectables.
   - **Respect strict du volume** : Aucun gonflement artificiel, longueur finale quasi-identique au texte de départ (+/- 5%).
   - **Respect total de la véracité et des faits** : Ne rien inventer (aucun chiffre, fait, lieu ou citation inexistant dans le texte original).
   - **Intégration sémantique naturelle** : Zéro bourrage de mots-clés (keyword stuffing), syntaxe irréprochable, déclinaisons permises si naturelles.
3. **Diagnostic SEO & Données chiffrées** :
   - Nom du projet
   - Nombre de mots du texte
   - Nombre de mots-clés cibles analysés
   - Score d'optimisation initial (%)
   - Mots-clés prioritaires absents (0 occurrence)
   - Mots-clés sous-représentés
   - Mots-clés déjà bien positionnés (ne pas surcharger)
4. **Texte source complet** délimité par des balises claires (`<<< DÉBUT DU TEXTE SOURCE >>>` et `<<< FIN DU TEXTE SOURCE >>>`).
5. **Format du livrable attendu** :
   - **Partie 1** : Recommandations passage par passage (Passage original -> Passage optimisé avec mot-clé en **gras** -> Justification éditoriale).
   - **Partie 2** : Texte complet final révisé prêt à être publié directement.

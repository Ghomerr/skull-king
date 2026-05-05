# Projet Skull King - Documentation & Architecture

Ce fichier sert de point d'entrée pour comprendre l'implémentation actuelle du jeu Skull King et préparer le développement de bots "intelligents".

## Structure du Projet

- `server.js` : Point d'entrée du serveur Express/Socket.io. Gère les connexions et les salons (rooms).
- `server/` :
    - `game.js` : **Logique cœur du jeu**. Gère les tours, la hiérarchie des cartes, le calcul des scores et le déroulement des plis.
    - `cards.json` : Base de données des cartes avec leurs valeurs, types et bonus.
    - `game-robots.js` : Contient actuellement la logique simplifiée des robots (autoplay).
    - `lobby-robots.js` : Gère l'ajout/suppression de robots dans le lobby.
- `static/` :
    - `main.html` : Interface utilisateur principale.
    - `scripts/` : Logique client (Socket.io, affichage, interactions).

## Implémentation de la Logique de Jeu (`game.js`)

La logique de résolution d'un pli se trouve dans la fonction `handlePlayCard`. 
Le calcul des scores est effectué par `computePlayerScore` à la fin de chaque manche.

## Vers un Bot Intelligent

Pour passer d'un `autoplay` simple à un bot "intelligent", plusieurs pistes peuvent être explorées :

### 1. État du jeu (State Representation)
Le bot doit avoir accès à :
- Ses propres cartes.
- Le nombre de plis qu'il a déjà faits vs son pari.
- Les cartes déjà jouées dans le pli actuel.
- L'historique des cartes tombées (pour compter les cartes).
- Les paris des autres joueurs.

### 2. Phase de Pari (Bidding)
Calculer la probabilité de gain pour chaque carte :
- Cartes spéciales (SK, Pirates) : Gains quasi-certains.
- Sirènes : Puissantes mais vulnérables aux Pirates.
- 14 et 13 : Fortes probabilités.
- Basse valeur (1-3) : Utiles pour parier 0 ou perdre volontairement.

### 3. Stratégie de Jeu
- **Pari 0** : Jouer ses plus grosses cartes le plus tôt possible si on ne peut pas les éviter, ou garder ses fuites pour la fin.
- **Défense de Pari** : Si le bot a déjà atteint son pari, il doit tout faire pour perdre les plis restants (jouer des petites cartes ou des fuites).
- **Attaque** : Si le bot est en retard, il doit utiliser ses atouts (Noir) ou cartes spéciales pour voler des plis.

### Prochaines étapes suggérées :
- **Modifier `server/game-robots.js`** :
    - `getRobotBet(robot, turn)` : Améliorer l'algorithme de pari qui se contente actuellement de compter les cartes > 30.
    - `getRobotCardToPlay(room, robot)` : Remplacer le choix par défaut (première carte valide) par une analyse du pli (qui gagne actuellement ? est-ce que je veux gagner ?).
- Implémenter une fonction de calcul de probabilités basée sur les cartes restantes dans le deck.
- Gérer intelligemment la `Tigresse` (elle choisit actuellement toujours la Fuite).

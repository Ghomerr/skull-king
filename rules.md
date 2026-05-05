# Règles de base du Skull King

Ce document résume les règles de base de Skull King pour faciliter le développement d'une IA (bot). Les règles avancées (Kraken, Baleine Blanche, Butin, pouvoirs spéciaux des Pirates) sont exclues.

## 1. Objectif du jeu
Le but est d'accumuler le plus de points sur 10 manches. À chaque manche, les joueurs doivent parier sur le nombre de plis qu'ils pensent remporter.

## 2. Structure des manches
- Il y a **10 manches**.
- À la manche 1, chaque joueur reçoit 1 carte. À la manche 2, 2 cartes... jusqu'à 10 cartes à la manche 10.
- Chaque manche commence par une phase de **pari simultané** (Yo-Ho-Ho !).

## 3. Déroulement d'un pli
- Le premier joueur joue une carte.
- Les autres doivent **suivre la couleur** (Jaune, Violet, Vert) si la première carte jouée est une couleur numérique.
- Si un joueur n'a pas la couleur demandée, il peut jouer n'importe quoi (autre couleur, Atout noir, ou carte spéciale).
- On peut jouer une **carte spéciale** (Pirate, Skull King, Sirène, Fuite) à tout moment, même si on peut suivre la couleur.

## 4. Hiérarchie des cartes
Du plus faible au plus fort :

1.  **Fuite (Drapeau blanc)** : Valeur 0. Perd toujours le pli (sauf si tout le monde joue une Fuite, le premier gagne).
2.  **Couleurs (Jaune, Violet, Vert)** : Numérotées de 1 à 14.
3.  **Atout (Noir / Pavillon)** : Bat toutes les autres couleurs. Numéroté de 1 à 14.
4.  **Sirène** : Bat toutes les cartes numériques (y compris le Noir).
5.  **Pirate** : Bat toutes les cartes numériques et la Sirène.
6.  **Skull King** : Bat toutes les cartes numériques et les Pirates.

### Exceptions cruciales :
- **Sirène vs Skull King** : Si une Sirène et le Skull King sont dans le même pli, la **Sirène l'emporte** (elle charme le roi).
- **Tigresse** : Peut être jouée soit comme une **Fuite**, soit comme un **Pirate** (choix fait au moment de jouer).

## 5. Score et Bonus

### Points de base :
- **Pari réussi (Pari > 0)** : 20 points par pli remporté.
- **Pari réussi (Pari = 0)** : Le numéro de la manche x 10 points (ex: 50 points à la manche 5).
- **Pari échoué (Pari > 0)** : -10 points par pli de différence (trop ou pas assez).
- **Pari échoué (Pari = 0)** : Le numéro de la manche x -10 points.

### Bonus de capture (uniquement si le pari est réussi) :
- **Capturer une Sirène avec un Pirate** : +20 points par Sirène.
- **Capturer un Pirate avec le Skull King** : +30 points par Pirate.
- **Capturer le Skull King avec une Sirène** : +40 points.
- **Capturer un 14** :
    - 14 de couleur : +10 points.
    - 14 noir : +20 points.

## 6. Règles de priorité (Leading)
- Si la première carte jouée est une **Fuite**, la carte suivante définit la couleur à suivre.
- Si la première carte jouée est une **carte spéciale** (Pirate, SK, Sirène), il n'y a **pas de couleur à suivre** pour ce pli.

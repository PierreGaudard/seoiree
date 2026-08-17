# SEOirée

Petit outil statique pour trouver le week-end où le maximum de monde est dispo.

Chacun clique sur **Je souhaite participer**, renseigne prénom + nom (obligatoire) et quelques infos pratiques, puis coche les samedis/dimanches où il **n'est pas** dispo (on peut ne rien cocher). L'outil classe automatiquement les week-ends du plus au moins dispo.

- Période : 1er septembre → 31 octobre 2026 (modifiable dans `config.js`)
- Jours de semaine grisés et non cliquables, seuls les samedis et dimanches sont sélectionnables
- Une seule inscription par prénom + nom : un nom déjà présent est refusé à l'inscription et renvoyé vers **J'ai déjà répondu**, qui recharge la réponse existante pour la modifier
- Mobile first, aucune dépendance, aucun build, aucun tracking
- 4 fichiers : `index.html`, `styles.css`, `app.js`, `config.js`

## Les questions posées à l'inscription

| Question | Format | Ce qu'on en fait |
|---|---|---|
| Budget max par personne | liste (moins de 50 € → plus de 250 €) | le récap affiche le **plancher du groupe**, c'est lui qui contraint le choix du lieu |
| Comment tu viens | liste (voiture avec places, voiture complète, cherche une place, transports en commun, peu importe) | compte les voitures disponibles et les personnes à caser |
| Régime alimentaire | cases multiples (végétarien, végan, sans gluten, sans lactose, sans porc, sans alcool) | liste des régimes à prévoir, avec le nombre de personnes |
| Accessibilité | liste (aucun besoin, accès PMR, trajet court, autre) | signale nominativement les contraintes |
| Allergies ou précisions | texte libre, optionnel | remonte tel quel dans le récap |

Tout est modifiable après coup via **Modifier mes infos pratiques**. Ces réponses alimentent le bloc « Le récap du groupe » sous le classement.

## 1. Créer la base Firebase (3 minutes)

Sans base configurée, l'appli tourne en mode local : chacun ne voit que ses propres réponses. Pour partager :

1. Va sur https://console.firebase.google.com et clique **Créer un projet** (nom : `seoiree`). Tu peux décocher Google Analytics.
2. Dans le menu de gauche : **Créer** → **Realtime Database** → **Créer une base de données**.
   - Emplacement : `europe-west1` (Belgique).
   - Règles de sécurité : choisis **Démarrer en mode test**.
3. Copie l'URL affichée en haut de la base, du type :
   `https://seoiree-1a2b3-default-rtdb.europe-west1.firebasedatabase.app`
4. Colle-la dans `config.js`, champ `dbUrl` (sans slash final).
5. Onglet **Règles** de la Realtime Database, remplace tout par ceci puis **Publier** :

```json
{
  "rules": {
    "editions": {
      "$edition": {
        "participants": {
          ".read": true,
          ".write": true,
          "$person": {
            ".validate": "newData.hasChildren(['firstName', 'lastName'])"
          }
        }
      }
    }
  }
}
```

Ces règles n'autorisent lecture et écriture que sur la branche des participants, rien d'autre dans la base. Le "mode test" par défaut expire au bout de 30 jours, ces règles-là n'expirent pas.

À savoir : n'importe qui ayant l'URL de l'appli peut lire et écrire les réponses. C'est voulu (zéro friction, pas de compte à créer) et sans enjeu pour une liste de dispos. N'y mets rien de sensible.

## 2. Publier sur GitHub Pages

```bash
cd Outils/SEOiree
git init -b main
git add .
git commit -m "SEOirée : premier jet"
gh repo create pierregaudard/seoiree --public --source=. --push
```

Puis sur GitHub : **Settings** → **Pages** → Source : `Deploy from a branch`, branche `main`, dossier `/ (root)` → **Save**.

L'URL sera `https://pierregaudard.github.io/seoiree/` (compte une à deux minutes pour le premier déploiement). C'est ce lien que tu partages.

Sans `gh` installé : crée le repo `seoiree` à la main sur github.com, puis

```bash
git remote add origin https://github.com/pierregaudard/seoiree.git
git push -u origin main
```

## 3. Tester en local

```bash
cd Outils/SEOiree
python3 -m http.server 8080
# puis http://localhost:8080
```

## Options dans `config.js`

| Clé | Rôle |
|---|---|
| `dbUrl` | URL de la Realtime Database. Vide = mode local. |
| `eventName` | Nom de l'événement (réservé, le titre est dans `index.html`). |
| `rangeStart` / `rangeEnd` | Bornes du calendrier, format `AAAA-MM-JJ`. |
| `edition` | Cloisonne les données. Change la valeur pour repartir de zéro sans perdre l'historique. |

## Comment le classement est calculé

Pour chaque week-end, une personne compte comme disponible seulement si elle n'a bloqué **aucun** des deux jours. Le détail par jour (samedi / dimanche) est affiché sous chaque ligne, utile quand un week-end ne marche qu'à moitié.

Le dernier week-end de la période est le samedi 31 octobre seul, le dimanche 1er novembre tombant hors de la fenêtre septembre-octobre. Pour l'inclure, passe `rangeEnd` à `2026-11-01`.

## Modifier une réponse

Le prénom + nom sert de clé (accents, majuscules et espaces sont normalisés, donc `JULIAN GAUTIER` et `julian gautier` sont la même personne). Quelqu'un qui revient avec la même orthographe retrouve sa réponse et l'écrase. Une orthographe franchement différente crée un doublon, à supprimer depuis la console Firebase le cas échéant.

Sur l'appareil déjà utilisé, l'identité est mémorisée et l'étape 1 est passée automatiquement. Le bouton « Ce n'est pas moi » oublie cette mémorisation en local sans rien supprimer en base.

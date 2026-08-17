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

## 1. La base Firebase (déjà en place)

Le stockage partagé est opérationnel, rien à faire :

- Projet Firebase : **seoiree** (`seoiree-ad079`), plan gratuit Spark, compte pierre@datashake.fr
- Realtime Database : `https://seoiree-ad079-default-rtdb.europe-west1.firebasedatabase.app` (Belgique, europe-west1)
- Console : https://console.firebase.google.com/project/seoiree-ad079/database
- Google Analytics et Gemini volontairement désactivés à la création
- L'URL est déjà renseignée dans `config.js` → `dbUrl`

Les règles publiées n'ouvrent que la branche des participants, et exigent un prénom et un nom :

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

Vérifié en conditions réelles : écriture d'un participant valide acceptée, écriture sans prénom/nom refusée (401), écriture ailleurs dans la base refusée (401), lecture de la racine refusée (401). Contrairement au « mode test » proposé par défaut, ces règles n'expirent pas au bout de 30 jours.

À savoir : n'importe qui ayant l'URL de l'appli peut lire et écrire les réponses des participants. C'est voulu (zéro friction, aucun compte à créer) et sans enjeu pour une liste de dispos. N'y mets rien de sensible.

Pour repartir de zéro (nouvelle édition), change `edition` dans `config.js` : les anciennes données restent en base sous leur propre clé.

## 2. En ligne (déjà publié)

- Site : **https://pierregaudard.github.io/seoiree/** ← le lien à partager
- Repo : https://github.com/PierreGaudard/seoiree (public, branche `main`)
- GitHub Pages : activé sur `main` / racine, HTTPS forcé

Pour mettre à jour le site, il suffit de pousser :

```bash
cd ~/Desktop/SEO-Claude/Outils/SEOiree
git add -A && git commit -m "…"
git push
```

Le déploiement prend une à deux minutes après le push.

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

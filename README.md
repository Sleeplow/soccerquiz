# Quiz des clubs — Coupe du monde

On affiche les blasons des clubs des onze titulaires d'une sélection, tels
qu'ils étaient **au moment de la Coupe du monde**. Le chrono tourne. À toi de
retrouver le pays.

Site statique, sans dépendance ni étape de build.

## Lancer

```bash
python3 -m http.server 8000
# puis http://localhost:8000
```

Ouvrir `index.html` directement depuis le disque ne marche pas : `fetch()`
refuse le protocole `file://`. La page le signale si ça arrive.

## Publier sur GitHub Pages

Le site est servi tel quel depuis la racine du dépôt, sans build. Deux réglages,
à faire une seule fois dans l'interface GitHub :

1. **Settings → General → Default branch** : basculer sur `main`.
2. **Settings → Pages → Build and deployment** : source `Deploy from a branch`,
   branche `main`, dossier `/ (root)`.

Le site sort sur `https://sleeplow.github.io/soccerquiz/`. Tous les chemins du
projet sont relatifs, il fonctionne donc sous ce sous-dossier sans réglage
supplémentaire.

Choisir `Deploy from a branch` plutôt que `GitHub Actions` : il n'y a rien à
compiler, et ça évite de consommer des minutes de CI. Le fichier `.nojekyll`
court-circuite le passage par Jekyll, inutile ici.

## Modes

| Mode | Question | Barème |
|---|---|---|
| **Normal** | L'année est affichée, tu cherches le pays | 100 pts + jusqu'à 100 de prime de rapidité |
| **Expert** | Pays **et** année | + 60 pour l'année exacte, + 30 pour l'édition voisine |

L'aide « afficher les noms des clubs » coûte 30 points. Le mode expert
n'a de sens qu'avec au moins deux éditions sélectionnées — l'interface le
signale sinon, puisque le filtre donnerait la réponse.

## Données

Trois fichiers dans `data/` :

- **`clubs.json`** — le référentiel des clubs : nom, couleurs, monogramme de
  repli, et de quoi résoudre le blason (voir plus bas).
- **`editions.json`** — une entrée par équipe, rattachée à une édition. Le
  `lineup` est ordonné : gardien d'abord, puis chaque ligne de la formation de
  gauche à droite. Le terrain est calculé à partir du champ `formation`, il n'y
  a aucune coordonnée à saisir.
- **`countries.json`** — les sélections proposées à l'autocomplétion, plus la
  liste des années de Coupe du monde. Cette liste doit rester **bien plus large
  que le jeu de questions**, sinon elle révèle les réponses.

### Ajouter une équipe

```jsonc
{
  "country": "Italie",
  "formation": "4-3-3",
  "note": "Onze aligné en finale",     // optionnel, affiché à la révélation
  "source": "Wikipédia, 2006 FIFA World Cup squads",
  "confidence": "high",                 // high | medium | low
  "lineup": [
    { "name": "Buffon", "first": "Gianluigi", "club": "juventus" }
    // … 11 au total, gardien en premier
  ]
}
```

Puis :

```bash
python3 tools/validate.py
```

Le validateur refuse un club inconnu, une composition qui n'a pas onze joueurs,
une formation incompatible avec le nombre de joueurs, un pays absent de
l'autocomplétion, et deux clubs qui partagent un monogramme. Il avertit sur les
sources manquantes et les entrées marquées `needsCheck`.

### Blasons

Le blason d'un club est cherché dans cet ordre :

1. **`file`** — une copie dans `assets/crests/`, servie avec le site. Aucun
   réseau, aucune latence, et le fichier est vérifiable : `validate.py` refuse
   un `file` qui ne pointe sur rien.
2. **`crest`** — un nom de fichier Wikimedia épinglé à la main. Utile quand
   l'article a une image principale qui n'est pas l'écusson.
3. **`wiki`** — le titre de l'article Wikipédia anglophone. Le jeu interroge
   l'API `prop=pageimages`, qui renvoie l'image principale de l'article, en un
   seul appel pour tous les clubs concernés, avec mise en cache navigateur.

> **`pageimages` ne suffit pas.** L'extension n'indexe pas de façon fiable les
> écussons en usage loyal, même avec `pilicense=any` : l'article ressort sans
> image, sans erreur, indistinguable d'un titre erroné. C'est le cas de la
> plupart des clubs anglais, espagnols et portugais. `fetch-crests.py` retombe
> donc sur le champ image de l'infobox, lu dans le wikitexte, qui nomme
> l'écusson explicitement.

> **Special:FilePath, côté en.wikipedia et pas Commons.** L'un résout les
> fichiers locaux *et* ceux de Commons ; l'autre renvoie 404 pour les écussons
> en usage loyal, qui ne sont hébergés que localement.

#### Diagnostiquer un blason manquant

```bash
python3 tools/diagnose-crests.py              # échantillon représentatif
python3 tools/diagnose-crests.py arsenal psg  # des clubs précis
python3 tools/diagnose-crests.py --all
```

Pour chaque club, le script compare quatre voies de résolution — `pageimages`
en licence libre puis en licence quelconque, les `pageprops` stockées, et
l'infobox — et teste les deux hébergements de fichiers. Il dit donc *pourquoi*
un écusson manque, au lieu de laisser le supposer.

Quand tous les clubs ont un `file`, le jeu ne fait **aucune requête externe**.

#### Rapatrier les blasons

```bash
python3 tools/fetch-crests.py            # ignore les clubs déjà pourvus
python3 tools/fetch-crests.py --force    # refait tout
python3 tools/fetch-crests.py --dry-run  # résout sans écrire
```

Le script résout les titres d'article, télécharge les images dans
`assets/crests/`, et renseigne `file` dans `data/clubs.json`. Bibliothèque
standard uniquement. Les clubs qu'il n'a pas su résoudre sont listés en fin
d'exécution.

Héberger les écussons dans le dépôt plutôt que d'y pointer est un choix qui
t'appartient : ce sont des marques déposées, appartenant à leurs clubs.

Une première version devinait des noms de fichiers Wikimedia : **44 sur 55
étaient faux**. Le titre d'article est bien plus prévisible, et la copie locale
supprime la question.

Si rien ne charge — mauvais titre, article sans image, ou simplement pas de
réseau — le jeu affiche une pastille aux couleurs du club avec son monogramme.
La composition n'a jamais de trou.

`tools/crest-check.html` affiche l'état de chaque club : bordure gauche verte si
le blason charge, rouge sinon, et liseré jaune pour les clubs marqués
`needsCheck`. Les deux états sont indépendants — un club à vérifier peut aussi
échouer au chargement. La page fournit en bas un bloc copiable listant
exactement ce qui n'a pas résolu.

## État des données

**12 équipes sur 5 éditions** : 2026, 2022, 2018, 2014, 2010.

Le Mexique 2026 vient de la composition diffusée fournie en référence. Les
autres équipes viennent de la connaissance du modèle et portent chacune un
niveau de fiabilité dans `editions.json`, affiché à la révélation.

**Ce qui manque, et pourquoi.** L'objectif est de couvrir la Coupe du monde 2026
en entier (48 sélections). Elle n'est pas encore saisie : l'environnement de
développement n'a pas d'accès réseau vers Wikipédia, et les résumés de recherche
web se sont révélés périmés — ils plaçaient par exemple Raúl Jiménez à
Wolverhampton alors qu'il était à Fulham. Une donnée fausse rend le quiz
inutilisable, donc rien n'a été inventé.

Trois chemins pour combler ça :

1. Récupérer le wikitexte de `2026 FIFA World Cup squads` depuis une machine qui
   a accès au réseau, et le convertir : les modèles `{{nat fs player}}`
   contiennent déjà le club de chaque joueur.
2. Saisir à la main les équipes qui comptent, en renseignant `source` et
   `confidence`.
3. Ajouter les éditions plus anciennes. Attention : avant les années 1990, les
   sélections sont presque entièrement composées de joueurs du championnat
   national, ce qui rend la question triviale.

## Structure

```
index.html
assets/css/style.css
assets/js/data.js     chargement, normalisation, résolution des clubs
assets/js/pitch.js    placement des onze à partir de la formation
assets/js/app.js      déroulé, chrono, score, autocomplétion
assets/crests/        blasons rapatriés (optionnel, voir fetch-crests.py)
data/                 clubs, éditions, sélections
tools/validate.py     intégrité des données
tools/fetch-crests.py rapatrie les blasons dans le dépôt
tools/diagnose-crests.py pourquoi un blason ne résout pas
tools/crest-check.html état de chargement des blasons
```

Les blasons appartiennent à leurs clubs respectifs. Projet non commercial.

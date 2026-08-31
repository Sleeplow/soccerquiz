# Quiz des clubs — Coupe du monde

On affiche les blasons des clubs des onze titulaires d'une sélection, tels
qu'ils étaient **au moment de la Coupe du monde**. Le chrono tourne. À toi de
retrouver le pays.

Le terrain est cadré sur les **trois quarts** de la longueur — but de l'équipe
en bas, ligne médiane vers le haut. Un terrain entier tasse les onze dans le
bas de l'image et fait passer un défenseur pour un milieu.

Cinq éditions, 84 sélections, 477 clubs. Site statique, sans dépendance ni
étape de build.

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

Sans chrono, la prime de rapidité est hors d'atteinte et n'entre pas dans le
maximum affiché.

## Meilleurs scores

Un classement de dix places par mode. En fin de partie, un score qui y entre
demande un nom ; l'entrée retenue est mise en avant. À score égal, la partie la
plus courte passe devant.

Ces scores vivent dans le **`localStorage` du navigateur**, et nulle part
ailleurs. Le site est statique : sans serveur, il n'y a pas d'endroit où
déposer un classement commun à plusieurs joueurs. Chacun voit donc le sien,
et rien ne circule.

Le rendre partagé demanderait un service tiers — une base hébergée et une clé
d'API — plus une protection contre les scores fabriqués, puisque tout le code
tourne côté client. C'est un projet à part entière, pas une option à cocher.

Le module lit le stockage comme une source non fiable : une entrée mal formée
est écartée, un nom est tronqué et rendu en texte, jamais interprété.

## Données

Trois fichiers dans `data/` :

- **`clubs.json`** — le référentiel des clubs : nom, couleurs, monogramme de
  repli, et de quoi résoudre le blason (voir plus bas).
- **`editions.json`** — une entrée par équipe, rattachée à une édition. Le
  `lineup` est ordonné : gardien d'abord, puis chaque ligne de la formation de
  gauche à droite. Le terrain est calculé à partir du champ `formation`, il n'y
  a aucune coordonnée à saisir.
- **`countries.json`** — le référentiel des sélections et la liste des années de
  Coupe du monde. Sert de repli quand une édition n'a pas de `participants`.

### La liste de réponses

Le joueur choisit dans une liste déroulante, alimentée par le champ
**`participants`** de l'édition : les sélections réellement engagées cette
année-là, pas celles dont on a une question.

C'est la distinction qui fait tenir le jeu. Aujourd'hui l'édition 2026 ne
contient qu'une équipe : une liste bâtie sur les questions disponibles
n'offrirait qu'un seul choix. `validate.py` refuse d'ailleurs une équipe absente
des participants de son édition — sa bonne réponse serait introuvable.

En mode expert, tant qu'aucune année n'est choisie la liste couvre l'union des
éditions retenues ; choisir une année la réduit à ses participants, et efface
une réponse devenue impossible. Une édition sans `participants` fait retomber
sur le référentiel complet.

### Importer une édition entière depuis Wikipédia

C'est la voie normale pour ajouter des équipes en nombre.

1. Ouvrir **`tools/import-squads.html`** dans un navigateur, indiquer l'article
   (`2026 FIFA World Cup squads`), l'année et le pays hôte. La page lit le
   wikitexte, en extrait chaque joueur avec son poste et le lien vers l'article
   de son club, et produit un bloc JSON.
2. Copier le bloc, puis l'appliquer :

```bash
python3 tools/apply-import.py bloc.json
python3 tools/validate.py
```

Le script traduit les noms de pays, complète l'autocomplétion, ajoute les clubs
inconnus au référentiel et fusionne l'édition. Il **ne remplace jamais une
composition saisie à la main** par un effectif brut — `--replace-curated` force
ce cas.

Les nouveaux clubs arrivent avec leur titre d'article, donc leur blason se
résout tout seul. Ils n'ont ni couleurs ni monogramme : la pastille de repli
dérive alors une couleur stable de leur nom.

L'import tourne dans *le navigateur*, pas dans un script : c'est ce qui permet
de l'utiliser depuis un environnement qui n'a pas d'accès réseau vers Wikipédia.

La même page offre un **inspecteur de wikitexte** : article plus motif à
chercher, il affiche l'extrait brut autour de la première occurrence. Sert à
découvrir la structure d'une page inconnue avant d'écrire de quoi l'analyser,
plutôt que de la supposer.

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

Une équipe porte soit `lineup` — onze joueurs figés — soit `squad`, un effectif
complet. Dans ce second cas le jeu tire un onze cohérent à chaque partie, ce qui
suppose au moins 1 gardien, 4 défenseurs, 3 milieux et 3 attaquants.

### Placement sur le terrain

Chaque joueur d'un `lineup` porte un **poste précis** : `GK`, `RB`, `CB`, `LB`,
`RWB`, `LWB`, `DM`, `RM`, `CM`, `LM`, `AM`, `RW`, `LW`, `SS`, `ST`. Le terrain
place alors chacun à son vrai emplacement, et le dispositif se lit directement
sur l'image — un 4-2-3-1 ne ressemble pas à un 4-4-2.

Les lignes réellement utilisées sont réparties uniformément sur la hauteur : un
dispositif à six lignes n'écrase pas ses libellés contre ceux de la ligne
voisine, et la taille des pastilles suit ce nombre de lignes.

Si un seul poste manque ou n'est pas reconnu, l'équipe bascule sur une
répartition par lignes déduite de `formation` — mieux vaut un terrain cohérent
qu'un terrain à moitié juste. C'est ce qui arrive aux équipes importées en
`squad`, dont les codes (`DF`, `MF`, `FW`) désignent des rôles, pas des postes.

### Taille des pastilles

Deux étages, et il faut les garder distincts :

- **`pitch.js`** dit ce que la composition autorise, en proportion du terrain :
  l'écart entre deux voisins d'une même ligne, la hauteur entre deux lignes
  moins la place que les libellés y occupent. Cette place est **mesurée** sur la
  page, pas estimée — les libellés se dessinent en pixels, donc sur un terrain
  rendu court ils en mangent bien plus qu'une proportion fixe ne le prévoirait.
  Pendant la question il n'y a aucun libellé, donc rien à réserver : c'est là
  que les blasons sont les plus gros.
- **`style.css`** dit ce que l'appareil supporte, en pixels, via `--slot-cap` :
  plus large sur écran tactile, où le terrain est petit et tenu à bout de bras,
  que sous une souris, où un blason démesuré avalerait les marquages. C'est le
  seul endroit du rendu qui dépende de l'appareil.

La plus petite des deux valeurs gagne. Un `ResizeObserver` reprend la mesure à
l'affichage de l'écran et à chaque rotation : le terrain est dessiné pendant que
son écran est encore masqué, où il n'a aucune dimension à mesurer.

Puis :

```bash
python3 tools/validate.py
```

Le validateur refuse un club inconnu, une composition qui n'a pas onze joueurs,
une formation incompatible avec le nombre de joueurs, un pays absent de
l'autocomplétion, deux clubs qui partagent un monogramme, et un même club
présent sous deux identifiants — « Toluca FC » d'un côté, « Deportivo Toluca
F.C. » de l'autre, ce que produit un import en masse et qui coûte un blason.
Il avertit sur les sources manquantes et les entrées marquées `needsCheck`.

### Composition saisie ou reconstituée

Une édition peut fournir soit une `lineup` — le onze aligné dans un match
précis, saisi à la main, avec les postes réels — soit un `squad`, l'effectif
complet du tournoi. Dans le second cas le jeu retient les premiers de chaque
poste, dans l'ordre des numéros, et le place par lignes.

C'est une **reconstitution, pas une composition** : la révélation le dit en
toutes lettres plutôt que d'annoncer une fiabilité qu'elle n'a pas. Les postes
d'un effectif sont grossiers (`GK`, `DF`, `MF`, `FW`), donc le placement passe
par les lignes ; une `lineup` avec de vrais postes (`RB`, `DM`, `LW`…) est
placée au poste près.

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
> plupart des clubs anglais, espagnols et portugais — 33 sur les 55 premiers.

Pour ces articles, le jeu passe à une **seconde résolution groupée** : `prop=images`
liste les fichiers de chaque page (20 pages par requête), un score retient le
meilleur candidat, puis `prop=imageinfo` convertit les fichiers retenus en
vignettes. Deux requêtes de plus au total, pas une par club.

Le score écarte d'abord le bruit — maillots, drapeaux, logos de compétition,
photos de stade, icônes d'interface — puis récompense les fichiers dont le nom
contient un mot distinctif du club et un terme d'écusson. **Les maillots sont le
piège principal** : leur nom contient celui du club (`Kit body arsenal2425.png`)
et ils passeraient sans exclusion explicite.

`fetch-crests.py` utilise une voie plus directe pour la même impasse : le champ
image de l'infobox, lu dans le wikitexte, qui nomme l'écusson sans heuristique.
Une requête par article, acceptable pour un script, pas au chargement du jeu.

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

**84 équipes sur 5 éditions** :

| Édition | Équipes | Provenance |
| --- | --- | --- |
| 2026 | 48 / 48 | effectifs importés de Wikipédia, plus le Mexique en composition |
| 2022 | 32 / 32 | compositions saisies, onze de départ |
| 2018 | 2 / 32 | compositions saisies |
| 2014 | 1 / 32 | composition saisie |
| 2010 | 1 / 32 | composition saisie |

Le Mexique 2026 vient de la composition diffusée fournie en référence, et les
effectifs 2026 de `2026 FIFA World Cup squads`. Les compositions saisies
viennent de la connaissance du modèle et portent chacune un niveau de fiabilité
dans `editions.json`, affiché à la révélation — `medium` pour l'essentiel de
2022, où le onze exact d'un match donné se retient moins bien que la liste des
clubs.

**Ce qui manque.** Les trois éditions d'avant 2022 n'ont qu'une poignée
d'équipes. Deux chemins pour combler ça :

1. Récupérer le wikitexte de `2018 FIFA World Cup squads` (ou de l'édition
   voulue) depuis une machine qui a accès au réseau, et le convertir avec
   `tools/import-squads.html` : les modèles `{{nat fs player}}` contiennent déjà
   le club de chaque joueur.
2. Saisir à la main les équipes qui comptent, en renseignant `source` et
   `confidence`.

Attention en remontant plus loin : avant les années 1990, les sélections sont
presque entièrement composées de joueurs du championnat national, ce qui rend la
question triviale.

## Tests

La suite couvre le jeu de bout en bout dans un vrai navigateur : réglages,
déroulé d'une partie, liste des sélections, placement sur le terrain, tailles
à l'écran, classement, blasons, accessibilité et chemins de clic.

```
npm install
npx playwright install chromium   # une seule fois
npm test                          # 84 tests, bureau + mobile
npm run test:ui                   # mode interactif
```

`responsive.spec.js` rejoue le terrain à huit largeurs, de l'iPhone SE au
moniteur 1920, téléphone couché compris. Il tient trois promesses que le reste
de la suite ne voit pas : un blason jamais sous 34 px ni au-dessus de 80, aucun
chevauchement quelle que soit la largeur, et aucune page qui défile de travers.
Vérifié en le rejouant contre le code d'avant le correctif — les trois échouent,
et le premier rapporte exactement les 26 px signalés.

Playwright lance lui-même `python3 -m http.server` : rien à démarrer à côté.
Les tests coupent l'accès à Wikipédia et attendent le repli en pastilles — le
réseau ne décide jamais du résultat d'un test. Sur une machine où Chromium est
déjà installé ailleurs, `PLAYWRIGHT_CHROMIUM_PATH` évite un second
téléchargement. Les nouvelles tentatives sont désactivées : un test instable
est un bug, pas un aléa à masquer.

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
tools/import-squads.html importe une édition depuis Wikipédia
tools/apply-import.py  intègre le bloc importé dans data/
tools/fetch-crests.py rapatrie les blasons dans le dépôt
tools/diagnose-crests.py pourquoi un blason ne résout pas
tools/crest-check.html état de chargement des blasons
tests/pages/          modèles Page Object
tests/e2e/            spécifications de bout en bout
playwright.config.js  serveur local, projets bureau et mobile
```

Les blasons appartiennent à leurs clubs respectifs. Projet non commercial.

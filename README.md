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
  repli, et le nom du fichier de blason sur Wikimedia Commons.
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

Les blasons sont chargés depuis Wikimedia Commons via `Special:FilePath`. Si un
fichier a été renommé ou n'existe pas, le jeu bascule automatiquement sur une
pastille aux couleurs du club avec son monogramme — la composition n'a jamais
de trou.

`tools/crest-check.html` liste tous les clubs et surligne en rouge ceux dont le
blason ne charge pas, en jaune ceux marqués `needsCheck`. C'est le moyen le plus
rapide de corriger les noms de fichiers.

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
data/                 clubs, éditions, sélections
tools/validate.py     intégrité des données
tools/crest-check.html état de chargement des blasons
```

Les blasons appartiennent à leurs clubs respectifs. Projet non commercial.

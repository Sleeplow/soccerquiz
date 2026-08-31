# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Quiz des clubs de Coupe du monde. On montre les blasons des onze titulaires
d'une sélection, le joueur retrouve le pays. **Site statique, zéro dépendance à
l'exécution, aucune étape de build** — on ouvre `index.html` et ça tourne.

**Ce fichier dit quoi faire. `README.md` dit pourquoi, et ce que ça a coûté.**
Avant de contourner une règle ci-dessous, lire la section du README qu'elle cite.

**Stack** : HTML + CSS + JavaScript nus, servis tels quels par GitHub Pages ·
données en JSON dans `data/` · blasons résolus au navigateur depuis l'API
Wikipédia · classement en `localStorage` · Playwright pour les tests, seule
dépendance du dépôt.

---

## Méthode

Neuf règles tirées d'échecs réels de ce dépôt. Aucune ne parle de football.

- **Une proportion n'est pas une taille.** Le terrain garde ses proportions,
  donc un élément dimensionné en pourcentage suit la fenêtre et non l'œil : une
  pastille de 61 px sur un moniteur en faisait 26 sur un iPhone. Ce qui doit
  rester lisible se borne en pixels.
- **Réserver de la place pour ce qui n'existe pas est une contrainte quand
  même.** Le calcul retenait 7 % de hauteur pour des libellés absents pendant la
  question : c'était la contrainte dominante, pour rien.
- **Ce qui se dessine en pixels se mesure, ne s'estime pas.** Une part fixe de
  la hauteur ment dès que le terrain est rendu court — téléphone couché, fenêtre
  basse.
- **`overflow: hidden` ne borne aucune largeur.** Il coupe le débordement visible
  d'une boîte dont la largeur est déjà décidée ailleurs. Sans `max-width`, un
  élément centré dans une colonne flex s'étale à la largeur de son texte.
- **Un test qui ne peut pas échouer ne garantit rien.** Un nouveau garde-fou se
  rejoue contre le code d'avant le correctif ; s'il passe, il ne garde rien.
- **Un relevé doit distinguer zéro de « je n'ai pas regardé ».** Un balayage qui
  n'a rien parcouru rend la même liste vide qu'un balayage sans défaut : rendre
  le compte de ce qui a été examiné avec le résultat.
- **Un silence n'est pas un succès.** L'API `pageimages` rend une page sans
  image, sans erreur, indistinguable d'un titre erroné (README § Blasons). Un
  chemin qui n'a rien trouvé se journalise autrement qu'un chemin qui a trouvé
  vide.
- **Deviner ne passe pas l'échelle.** Deviner les noms de fichiers Wikimedia
  donnait 44 erreurs sur 55. La résolution par titre d'article a remplacé
  l'heuristique.
- **Une donnée fausse rend le quiz inutilisable.** On ne complète jamais une
  composition de mémoire approximative sans le dire : `source` et `confidence`
  existent pour ça, et sont affichés au joueur à la révélation.

---

## Architecture

Quatre scripts chargés dans l'ordre par `index.html`, chacun exposant un objet
global — pas de module, pas de bundler :

- **`data.js` → `Data`** : charge les trois JSON, aplatit les éditions en
  questions, résout les blasons (voir plus bas), normalise les chaînes pour la
  recherche. Seul endroit qui touche au réseau.
- **`scores.js` → `Scores`** : classement par mode dans `localStorage`.
  `sanitize()` refiltre tout ce qui est relu — le stockage est modifiable par
  l'utilisateur.
- **`pitch.js` → `Pitch`** : rendu du terrain. Géométrie pure, ne connaît ni le
  score ni le déroulé.
- **`app.js`** : moteur de jeu (IIFE anonyme). Réglages, questions, chrono,
  score, navigation entre écrans.

L'interface est **une seule page** : cinq `<section class="screen">` dont une
seule porte `is-active`. `show(id)` bascule la classe ; il n'y a pas de routeur.

⚠️ **Un écran masqué n'a aucune dimension.** `Pitch.render` est appelé pendant
que son écran est encore `display: none` : tout ce qui demande une mesure doit
attendre le `ResizeObserver`, qui la reprend à l'affichage et à chaque rotation.

---

## Données

Trois fichiers dans `data/`, un seul point d'entrée pour les vérifier :

```bash
python3 tools/validate.py     # ou npm run validate
```

Il refuse un onze qui ne fait pas onze, une formation incompatible avec son
compte, un club inconnu, un pays absent de `countries.json` ou de la liste des
participants de son édition, un `file` qui ne pointe sur rien, un monogramme
partagé, et **un même club sous deux identifiants** — ce que produisent les
imports en masse (« Toluca FC » d'un côté, « Deportivo Toluca F.C. » de l'autre)
et qui coûte un blason.

### Une équipe porte `lineup` **ou** `squad`

- `lineup` : onze joueurs figés, chacun avec un **poste précis** (`GK`, `RB`,
  `CB`, `LB`, `RWB`, `LWB`, `DM`, `RM`, `CM`, `LM`, `AM`, `RW`, `LW`, `SS`,
  `ST`). Le terrain place alors chacun à son vrai emplacement.
- `squad` : effectif complet, dont le jeu tire un onze à chaque partie. Ses
  codes (`DF`, `MF`, `FW`) sont des rôles, pas des postes : ces équipes
  basculent sur la répartition par lignes.

**Si un seul poste manque ou n'est pas reconnu, toute l'équipe bascule** sur la
répartition par lignes déduite de `formation` : mieux vaut un terrain cohérent
qu'un terrain à moitié juste.

### Ajouter une édition

La voie normale est l'import, jamais la saisie à la main de 32 équipes :
`tools/import-squads.html` lit une page « squads » de Wikipédia **depuis le
navigateur** (l'environnement de développement n'a pas d'accès réseau vers
Wikipédia), puis `tools/apply-import.py` fusionne le bloc produit. Il n'écrase
jamais une composition saisie sans `--replace-curated`.

Une équipe ajoutée à la main renseigne toujours `source` et `confidence`
(`high`/`medium`/`low`), et met à jour le décompte dans README § État des
données.

### Blasons

Ordre de résolution : **`file`** (copie locale, vérifiable) → **`crest`** (nom
de fichier Wikimedia épinglé) → **`wiki`** (titre d'article, résolu par l'API).
Un club sans aucun des trois est refusé par `validate.py`. Sans blason résolu,
le jeu affiche une pastille aux couleurs du club avec son monogramme — la
composition n'a jamais de trou.

Les blasons ne sont pas vérifiables depuis une session sans réseau :
`tools/crest-check.html` se passe dans un navigateur, et c'est la seule preuve
qu'un nouveau club affiche bien son écusson. Le dire quand ça n'a pas été fait.

---

## Taille des blasons sur le terrain

Deux étages, à garder distincts :

- **`pitch.js`** dit ce que la composition autorise, **en proportion** : écart
  entre deux voisins d'une même ligne, hauteur entre deux lignes moins la place
  que les libellés occupent — mesurée sur la page, pas estimée. Pendant la
  question il n'y a aucun libellé, donc rien à réserver.
- **`style.css`** dit ce que l'appareil supporte, **en pixels** (`--slot-cap`),
  plus large sur écran tactile que sous une souris. C'est le seul endroit du
  rendu qui dépende de l'appareil.

La plus petite des deux valeurs gagne. Toucher à l'un sans l'autre casse
l'invariant que `responsive.spec.js` garde.

---

## Conventions

Domaine, interface et **commentaires en français**. Les commentaires disent
*pourquoi*, pas *quoi* : un commentaire qui paraphrase la ligne suivante est du
bruit. Classes CSS en kebab-case, jetons de style en variables sous `:root`.

L'accessibilité est testée, donc elle se maintient : le terrain porte un
`role="img"` et un `aria-label` qui **nomme les clubs** — ils sont l'énoncé,
les taire vide la question pour un lecteur d'écran. Contraste AA, cibles
tactiles, annonces `role="status"` : voir `accessibility.spec.js` avant de
changer une couleur ou une taille.

---

## Vérifier et livrer

```bash
npm install
npx playwright install chromium        # une seule fois
npm run validate                       # données
npm test                               # 84 tests, bureau + mobile
npx playwright test responsive         # un seul fichier
npx playwright test -g "chevauche"     # un seul test
npx playwright test --project=desktop  # un seul profil
npm run serve                          # http://localhost:8000
```

- **Les deux passent avant de pousser.** `validate.py` ne voit pas ce que voient
  les tests, et l'inverse. Il n'y a **aucun CI** dans ce dépôt : la vérification
  locale est la seule.
- Playwright lance son propre `python3 -m http.server` : rien à démarrer à côté.
  Les tests coupent l'accès à Wikipédia et attendent le repli en pastilles — le
  réseau ne décide jamais d'un résultat de test.
- Les nouvelles tentatives sont désactivées : **un test instable est un bug**,
  pas un aléa à masquer.
- Sur une machine où Chromium est déjà installé ailleurs,
  `PLAYWRIGHT_CHROMIUM_PATH` évite un second téléchargement.
- Toute la connaissance des sélecteurs vit dans `tests/pages/QuizPage.js`. Un
  test décrit une intention ; quand l'interface bouge, un seul fichier change.
- Un changement visible se vérifie à plusieurs largeurs, pas seulement à celle
  de la fenêtre courante : `responsive.spec.js` en tient huit.

**Git** : branche dédiée pour tout travail non trivial, jamais de push direct
sur `main`. Messages `type: résumé fr` (`feat`, `fix`, `refactor`, `docs`,
`test`, `chore`, `perf`), atomiques. Les premiers commits du dépôt sont des
phrases sans préfixe : convention adoptée après coup, on ne réécrit pas
l'historique pour l'y appliquer.

---

## Règles ECC

Ce dépôt suit les règles de programmation d'[`affaan-m/ECC`](https://github.com/affaan-m/ECC)
(MIT), comme `Sleeplow/BudgetAppIOS`. Elles ne sont pas copiées ici — les lire à
la source quand une question sort de ce fichier :

| Fichier ECC | Ce qu'on en retient ici |
| --- | --- |
| `rules/common/coding-style.md` | fonctions < 50 lignes, fichiers < 800, pas de nombre magique sans nom |
| `rules/common/code-review.md` | relire son propre diff avant de pousser, pas de `console.log` oublié |
| `rules/web/testing.md` | responsive à 320 / 375 / 768 / 1024 / 1440 / 1920, aucun débordement |
| `rules/web/coding-style.md` | jetons de style en variables CSS, animer `transform`/`opacity`, pas la mise en page |
| `rules/common/git-workflow.md` | format des messages de commit |
| `agents/silent-failure-hunter.md` | traquer les replis qui masquent un échec réel |

Le tout n'est pas installé en plugin : 286 skills et 68 agents chargés dans
chaque session coûteraient plus de contexte qu'ils n'en rendent. On lit le
fichier de règles qui concerne la tâche.

Deux règles ECC se contredisent parfois ici : « follow established repository
patterns before inventing new ones » l'emporte sur une convention ECC quand ce
dépôt en a déjà une, visible dans son historique.

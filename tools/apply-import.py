#!/usr/bin/env python3
"""Intègre le bloc produit par tools/import-squads.html dans data/.

Usage :
    python3 tools/apply-import.py bloc.json
    python3 tools/apply-import.py bloc.json --replace-curated
    pbpaste | python3 tools/apply-import.py -

Le bloc contient une édition et les clubs qu'elle introduit. Les clubs déjà
connus ne sont pas touchés ; une édition déjà présente voit ses équipes
fusionnées par pays, la nouvelle version l'emportant.

Le fichier n'est réécrit que si `validate.py` passe ensuite — c'est à
l'appelant de le lancer, la commande est rappelée en fin d'exécution.
"""

import json
import sys
import unicodedata
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLUBS = ROOT / "data" / "clubs.json"
EDITIONS = ROOT / "data" / "editions.json"
COUNTRIES = ROOT / "data" / "countries.json"

# Les données Wikipédia sont en anglais ; le jeu et l'autocomplétion, en français.
FRENCH = {
    "Algeria": "Algérie", "Argentina": "Argentine", "Australia": "Australie",
    "Austria": "Autriche", "Belgium": "Belgique",
    "Bosnia and Herzegovina": "Bosnie-Herzégovine", "Brazil": "Brésil",
    "Cameroon": "Cameroun", "Canada": "Canada", "Cape Verde": "Cap-Vert",
    "Chile": "Chili", "Colombia": "Colombie", "Costa Rica": "Costa Rica",
    "Croatia": "Croatie", "Curaçao": "Curaçao", "Czech Republic": "Tchéquie",
    "Denmark": "Danemark",
    "DR Congo": "RD Congo",
    "Ecuador": "Équateur", "Egypt": "Égypte", "England": "Angleterre",
    "France": "France", "Germany": "Allemagne", "Ghana": "Ghana",
    "Greece": "Grèce", "Haiti": "Haïti", "Honduras": "Honduras",
    "Hungary": "Hongrie", "Iran": "Iran", "Iraq": "Irak", "Ireland": "Irlande",
    "Italy": "Italie", "Ivory Coast": "Côte d'Ivoire", "Jamaica": "Jamaïque",
    "Japan": "Japon", "Jordan": "Jordanie", "Mexico": "Mexique",
    "Morocco": "Maroc", "Netherlands": "Pays-Bas", "New Zealand": "Nouvelle-Zélande",
    "Nigeria": "Nigeria", "Northern Ireland": "Irlande du Nord", "Norway": "Norvège",
    "Panama": "Panama", "Paraguay": "Paraguay", "Peru": "Pérou", "Poland": "Pologne",
    "Portugal": "Portugal", "Qatar": "Qatar", "Russia": "Russie",
    "Saudi Arabia": "Arabie saoudite", "Scotland": "Écosse", "Senegal": "Sénégal",
    "Serbia": "Serbie", "Slovakia": "Slovaquie", "Slovenia": "Slovénie",
    "South Africa": "Afrique du Sud", "South Korea": "Corée du Sud",
    "Spain": "Espagne", "Sweden": "Suède", "Switzerland": "Suisse",
    "Tunisia": "Tunisie", "Turkey": "Turquie", "Ukraine": "Ukraine",
    "United States": "États-Unis", "Uruguay": "Uruguay", "Uzbekistan": "Ouzbékistan",
    "Wales": "Pays de Galles",
}


def read(path):
    return json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=OrderedDict)


def write(path, document):
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")


def fold(text):
    return "".join(c for c in unicodedata.normalize("NFD", text)
                   if unicodedata.category(c) != "Mn").lower()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        print(__doc__)
        return 2

    raw = sys.stdin.read() if args[0] == "-" else Path(args[0]).read_text(encoding="utf-8")
    block = json.loads(raw)
    incoming = block["edition"]
    new_clubs = block.get("newClubs", {})

    clubs_doc = read(CLUBS)
    editions_doc = read(EDITIONS)
    countries_doc = read(COUNTRIES)

    # 1. Clubs — on n'écrase jamais une entrée existante, elle peut porter des
    #    couleurs, un monogramme ou un fichier local que l'import ignore.
    added = 0
    for cid, club in new_clubs.items():
        if cid not in clubs_doc["clubs"]:
            clubs_doc["clubs"][cid] = OrderedDict(club)
            added += 1
    clubs_doc["clubs"] = OrderedDict(sorted(clubs_doc["clubs"].items()))

    # 2. Pays — traduits, et ajoutés à l'autocomplétion s'ils manquent.
    known_countries = set(countries_doc["countries"])
    untranslated, added_countries = [], 0
    for team in incoming["teams"]:
        french = FRENCH.get(team["country"])
        if french:
            team["country"] = french
        elif team["country"] not in known_countries:
            untranslated.append(team["country"])
        if team["country"] not in known_countries:
            countries_doc["countries"].append(team["country"])
            known_countries.add(team["country"])
            added_countries += 1
    countries_doc["countries"] = sorted(set(countries_doc["countries"]), key=fold)

    # 3. Édition — fusion par pays, la version importée l'emportant.
    target = next((e for e in editions_doc["editions"] if e["year"] == incoming["year"]), None)
    if target is None:
        target = OrderedDict(year=incoming["year"], host=incoming["host"], teams=[])
        editions_doc["editions"].append(target)
        editions_doc["editions"].sort(key=lambda e: -e["year"])
    if incoming.get("host"):
        target["host"] = incoming["host"]

    by_country = {t["country"]: i for i, t in enumerate(target["teams"])}
    replaced, kept = 0, []
    for team in incoming["teams"]:
        entry = OrderedDict(team)
        index = by_country.get(team["country"])
        if index is None:
            target["teams"].append(entry)
            continue

        # Une composition saisie à la main vaut mieux qu'un effectif brut dont
        # on tire un onze au hasard : on ne l'écrase pas sans y être invité.
        existing = target["teams"][index]
        if existing.get("lineup") and "squad" in entry and "--replace-curated" not in sys.argv:
            kept.append(team["country"])
            continue

        target["teams"][index] = entry
        replaced += 1
    target["teams"].sort(key=lambda t: fold(t["country"]))

    write(CLUBS, clubs_doc)
    write(EDITIONS, editions_doc)
    write(COUNTRIES, countries_doc)

    added_teams = len(incoming["teams"]) - replaced - len(kept)
    print(f"Édition {incoming['year']} : {len(incoming['teams'])} équipes reçues "
          f"({added_teams} ajoutées, {replaced} remplacées, {len(kept)} conservées)")
    if kept:
        print(f"  composition manuelle conservée : {', '.join(sorted(kept))}")
        print("  utiliser --replace-curated pour l'écraser volontairement")
    print(f"Clubs ajoutés     : {added} (référentiel : {len(clubs_doc['clubs'])})")
    print(f"Pays ajoutés      : {added_countries}")
    if untranslated:
        print(f"\nPays sans traduction française, laissés en anglais : "
              f"{', '.join(sorted(set(untranslated)))}")
        print("Compléter FRENCH dans ce script, puis relancer.")
    print("\nÀ lancer maintenant : python3 tools/validate.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())

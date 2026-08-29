#!/usr/bin/env python3
"""Contrôle d'intégrité des données du quiz.

Usage : python3 tools/validate.py

Vérifie que chaque composition référence des clubs existants, compte onze
joueurs, et que sa formation correspond bien à ce compte. Sort en code 1 si
une erreur bloquante est trouvée ; les avertissements ne font pas échouer.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(name):
    with open(ROOT / "data" / name, encoding="utf-8") as fh:
        return json.load(fh)


def main():
    clubs = load("clubs.json")["clubs"]
    editions = load("editions.json")["editions"]
    countries = set(load("countries.json")["countries"])

    errors, warnings = [], []
    used_clubs = set()
    teams = 0

    for edition in editions:
        year = edition["year"]
        for team in edition["teams"]:
            teams += 1
            where = f'{team["country"]} {year}'
            lineup = team["lineup"]

            if len(lineup) != 11:
                errors.append(f"{where} : {len(lineup)} joueurs au lieu de 11")

            outfield = sum(int(n) for n in str(team["formation"]).split("-"))
            if outfield != len(lineup) - 1:
                errors.append(
                    f'{where} : formation {team["formation"]} '
                    f"({outfield} joueurs de champ) incompatible avec {len(lineup)} joueurs"
                )

            if team["country"] not in countries:
                errors.append(
                    f'{where} : "{team["country"]}" absent de countries.json, '
                    "l'autocomplétion ne proposera jamais la bonne réponse"
                )

            for player in lineup:
                if player["club"] not in clubs:
                    errors.append(f'{where} : club inconnu "{player["club"]}" pour {player["name"]}')
                else:
                    used_clubs.add(player["club"])

            if not team.get("source"):
                warnings.append(f"{where} : champ `source` vide")
            if team.get("confidence") not in {"high", "medium", "low"}:
                warnings.append(f'{where} : `confidence` manquante ou inconnue')

    for cid, club in clubs.items():
        # Sans titre d'article et sans fichier épinglé, un club ne peut afficher
        # qu'une pastille : c'est bloquant, pas un simple avertissement.
        if not club.get("wiki") and not club.get("crest") and not club.get("file"):
            errors.append(f'{cid} : ni `file`, ni `crest`, ni `wiki` — aucun blason possible')

        # Tout l'intérêt de la copie locale est d'être vérifiable : un `file`
        # qui ne pointe sur rien vaut moins que pas de `file` du tout, puisqu'il
        # court-circuite la résolution réseau.
        if club.get("file") and not (ROOT / "assets" / "crests" / club["file"]).is_file():
            errors.append(f'{cid} : `file` introuvable — assets/crests/{club["file"]}')
        if club.get("needsCheck"):
            warnings.append(f'{cid} : marqué needsCheck ({club["name"]})')

    # Deux clubs partageant un monogramme deviennent indiscernables dès qu'un
    # blason ne charge pas et bascule sur la pastille de repli.
    monos = {}
    for cid, club in clubs.items():
        monos.setdefault(club.get("mono", ""), []).append(club["name"])
    for mono, names in sorted(monos.items()):
        if len(names) > 1:
            errors.append(f'monogramme "{mono}" partagé par {" / ".join(sorted(names))}')

    orphans = sorted(set(clubs) - used_clubs)

    print(f"{teams} équipes · {len(clubs)} clubs ({len(used_clubs)} utilisés)")
    if orphans:
        print(f"  clubs non utilisés : {', '.join(orphans)}")
    for w in warnings:
        print(f"  avertissement : {w}")
    for e in errors:
        print(f"  ERREUR : {e}")

    if errors:
        print(f"\n{len(errors)} erreur(s) bloquante(s).")
        return 1
    print("\nDonnées cohérentes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Contrôle d'intégrité des données du quiz.

Usage : python3 tools/validate.py

Vérifie que chaque composition référence des clubs existants, compte onze
joueurs, et que sa formation correspond bien à ce compte. Sort en code 1 si
une erreur bloquante est trouvée ; les avertissements ne font pas échouer.
"""

import collections
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(name):
    with open(ROOT / "data" / name, encoding="utf-8") as fh:
        return json.load(fh)


# Mots que les sources ajoutent ou omettent librement autour d'un nom de club.
CLUB_NOISE = {
    "fc", "sc", "cf", "ac", "afc", "bc", "cfc", "sfc", "uc", "se", "sk", "fk",
    "nk", "hnk", "kv", "krc", "kaa", "rc", "rcd", "ca", "cd", "club", "sad",
    "deportivo", "real", "jk", "ksv", "football", "de", "du", "ud", "cp", "gd",
    "scu", "pfc", "ff", "if", "aif", "fbpa", "cr", "ss", "ssc", "us", "asd",
    "sv", "vfl", "vfb",
}


def club_key(text):
    """Nom de club réduit à ce qui l'identifie vraiment."""
    flat = "".join(c for c in unicodedata.normalize("NFD", text.lower())
                   if unicodedata.category(c) != "Mn")
    # Les sigles ponctués (« F.C. ») se découpent en lettres isolées : on les
    # écarte comme le reste du bruit.
    words = [w for w in re.split(r"[^a-z0-9]+", flat)
             if len(w) > 1 and w not in CLUB_NOISE]
    return "".join(words)


def duplicate_clubs(clubs):
    groups = collections.defaultdict(list)
    for cid, club in clubs.items():
        groups[club_key(club.get("wiki") or club["name"])].append(cid)
    return {key: ids for key, ids in groups.items() if len(ids) > 1}


def main():
    clubs = load("clubs.json")["clubs"]
    editions = load("editions.json")["editions"]
    countries = set(load("countries.json")["countries"])

    errors, warnings = [], []
    used_clubs = set()
    teams = 0

    for edition in editions:
        year = edition["year"]
        participants = edition.get("participants") or []

        # La liste de réponses proposée au joueur est celle des participants :
        # un nom inconnu ne serait jamais sélectionnable.
        unknown = [c for c in participants if c not in countries]
        if unknown:
            errors.append(f"{year} : participants absents de countries.json — {', '.join(unknown)}")
        if len(participants) != len(set(participants)):
            errors.append(f"{year} : doublons dans la liste des participants")
        if not participants:
            warnings.append(f"{year} : pas de liste de participants, la réponse "
                            "sera cherchée dans le référentiel complet")

        for team in edition["teams"]:
            teams += 1
            where = f'{team["country"]} {year}'

            # Une équipe porte soit une composition figée de onze, soit un
            # effectif dont le jeu tire un onze à chaque partie.
            lineup = team.get("lineup")
            squad = team.get("squad")
            if (lineup is None) == (squad is None):
                errors.append(f"{where} : il faut exactement l'un de `lineup` ou `squad`")
                continue

            if lineup is not None:
                if len(lineup) != 11:
                    errors.append(f"{where} : {len(lineup)} joueurs au lieu de 11")

                outfield = sum(int(n) for n in str(team["formation"]).split("-"))
                if outfield != len(lineup) - 1:
                    errors.append(
                        f'{where} : formation {team["formation"]} '
                        f"({outfield} joueurs de champ) incompatible avec {len(lineup)} joueurs"
                    )
            else:
                lineup = squad
                # Le tirage vise 1 gardien, 4 défenseurs, 3 milieux, 3 attaquants :
                # sans ces effectifs minimaux, le onze serait bancal.
                counts = collections.Counter(
                    str(p.get("pos", "")).upper() for p in squad)
                for pos, needed in (("GK", 1), ("DF", 4), ("MF", 3), ("FW", 3)):
                    if counts[pos] < needed:
                        errors.append(
                            f"{where} : {counts[pos]} {pos} dans l'effectif, {needed} nécessaires")

            if team["country"] not in countries:
                errors.append(
                    f'{where} : "{team["country"]}" absent de countries.json, '
                    "la liste ne proposera jamais la bonne réponse"
                )
            # Une équipe hors de la liste des participants de son édition rend
            # la question insoluble : la bonne réponse ne serait pas proposée.
            if participants and team["country"] not in participants:
                errors.append(
                    f'{where} : absent des participants de {year}, '
                    "la bonne réponse serait introuvable dans la liste"
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
    # Les clubs importés en masse n'ont pas de monogramme : le repli dérive
    # alors les initiales du nom, et il n'y a rien à contrôler.
    monos = {}
    for cid, club in clubs.items():
        if club.get("mono"):
            monos.setdefault(club["mono"], []).append(club["name"])
    for mono, names in sorted(monos.items()):
        if len(names) > 1:
            errors.append(f'monogramme "{mono}" partagé par {" / ".join(sorted(names))}')

    # Un même club sous deux identifiants, c'est deux blasons à résoudre, un
    # monogramme perdu et deux écussons différents pour la même équipe sur le
    # terrain. Les imports en masse en produisent : « Toluca FC » d'un côté,
    # « Deportivo Toluca F.C. » de l'autre.
    for ids in duplicate_clubs(clubs).values():
        titles = " / ".join(clubs[i].get("wiki") or clubs[i]["name"] for i in ids)
        errors.append(f'même club sous plusieurs identifiants : {" + ".join(ids)} ({titles})')

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

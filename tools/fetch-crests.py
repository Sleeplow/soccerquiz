#!/usr/bin/env python3
"""Télécharge les blasons dans le dépôt, pour ne plus dépendre du réseau.

Usage :
    python3 tools/fetch-crests.py             # ne retélécharge pas l'existant
    python3 tools/fetch-crests.py --force     # refait tout
    python3 tools/fetch-crests.py --dry-run   # résout sans écrire

Les titres d'article de `data/clubs.json` sont résolus par l'API pageimages de
Wikipédia, qui renvoie l'image principale de l'article — l'écusson pour un club.
Chaque image est écrite dans `assets/crests/`, et le champ `file` du club est
renseigné. Le jeu préfère ce fichier local à toute résolution réseau.

Bibliothèque standard uniquement, aucune installation nécessaire.
"""

import argparse
import json
import sys
import urllib.parse
import urllib.request
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CRESTS = ROOT / "assets" / "crests"
CLUBS = ROOT / "data" / "clubs.json"

DEFAULT_API = "https://en.wikipedia.org/w/api.php"
BATCH = 50          # plafond de titres par requête pour un appel anonyme
THUMB = 256         # largeur demandée, en pixels
TIMEOUT = 30

# Wikimedia refuse les requêtes sans agent descriptif : sans ça, on prend un 403.
UA = "soccerquiz-crest-fetcher/1.0 (https://github.com/Sleeplow/soccerquiz)"

EXTENSIONS = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
}


def get(url):
    request = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return response.read(), response.headers.get("Content-Type", "")


def resolve(titles, api):
    """Titre d'article -> URL de vignette, par lots."""
    found = {}
    for start in range(0, len(titles), BATCH):
        chunk = titles[start:start + BATCH]
        query = urllib.parse.urlencode({
            "action": "query", "format": "json", "formatversion": "2",
            "prop": "pageimages", "piprop": "thumbnail", "pithumbsize": str(THUMB),
            "redirects": "1", "titles": "|".join(chunk),
        })
        try:
            raw, _ = get(f"{api}?{query}")
            data = json.loads(raw)
        except Exception as exc:
            print(f"  lot {start // BATCH + 1} : échec de la requête ({exc})")
            continue

        # `redirects=1` renvoie le titre d'arrivée : on recolle l'alias pour
        # retrouver le titre tel qu'il est écrit dans clubs.json.
        alias = {r["to"]: r["from"] for r in data.get("query", {}).get("redirects", [])}
        for page in data.get("query", {}).get("pages", []):
            source = (page.get("thumbnail") or {}).get("source")
            if not source:
                continue
            found[page["title"]] = source
            if page["title"] in alias:
                found[alias[page["title"]]] = source
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true",
                        help="retélécharge même les clubs qui ont déjà un fichier")
    parser.add_argument("--dry-run", action="store_true",
                        help="résout les URL sans rien écrire")
    parser.add_argument("--api", default=DEFAULT_API, help=argparse.SUPPRESS)
    args = parser.parse_args()

    document = json.loads(CLUBS.read_text(encoding="utf-8"),
                          object_pairs_hook=OrderedDict)
    clubs = document["clubs"]

    todo = [cid for cid, club in clubs.items()
            if club.get("wiki") and (args.force or not club.get("file"))]
    if not todo:
        print("Tous les clubs ont déjà un blason local. Utiliser --force pour refaire.")
        return 0

    print(f"{len(todo)} club(s) à traiter sur {len(clubs)}.")
    titles = sorted({clubs[cid]["wiki"] for cid in todo})
    resolved = resolve(titles, args.api)

    if not args.dry_run:
        CRESTS.mkdir(parents=True, exist_ok=True)

    saved, failed = 0, []
    for cid in todo:
        club = clubs[cid]
        source = resolved.get(club["wiki"])
        if not source:
            failed.append(f"{cid} — {club['name']} — article sans image : {club['wiki']}")
            continue

        if args.dry_run:
            print(f"  {cid} -> {source}")
            saved += 1
            continue

        try:
            blob, content_type = get(source)
        except Exception as exc:
            failed.append(f"{cid} — {club['name']} — téléchargement échoué ({exc})")
            continue

        extension = EXTENSIONS.get(content_type.split(";")[0].strip())
        if not extension:
            extension = Path(urllib.parse.urlparse(source).path).suffix or ".png"

        name = cid + extension
        (CRESTS / name).write_bytes(blob)
        club["file"] = name
        saved += 1
        print(f"  {cid} -> assets/crests/{name} ({len(blob) // 1024} Ko)")

    if not args.dry_run and saved:
        CLUBS.write_text(
            json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"\n{saved} blason(s) {'résolu(s)' if args.dry_run else 'enregistré(s)'}"
          f" · {len(failed)} en échec")
    for line in failed:
        print(f"  {line}")
    if failed:
        print("\nPour ces clubs, corriger `wiki` dans data/clubs.json, ou épingler un"
              " fichier Wikimedia dans `crest`. À défaut, le jeu affiche une pastille"
              " aux couleurs du club.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

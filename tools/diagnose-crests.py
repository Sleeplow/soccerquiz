#!/usr/bin/env python3
"""Interroge Wikipédia de plusieurs façons pour un club, et compare les réponses.

Usage :
    python3 tools/diagnose-crests.py              # échantillon représentatif
    python3 tools/diagnose-crests.py arsenal psg  # des clubs précis
    python3 tools/diagnose-crests.py --all        # les 55

À lancer depuis une machine ayant accès à Wikipédia. Le but est de savoir
pourquoi un article ne rend pas d'écusson, plutôt que de le supposer : le
script essaie quatre voies de résolution et teste les deux hébergements de
fichiers, puis affiche ce que chacune a donné.

Colonnes :
  free      pageimages avec pilicense=free (la valeur par défaut)
  any       pageimages avec pilicense=any
  pageprops page_image / page_image_free tels que stockés par l'extension
  infobox   le champ image de l'infobox, lu dans le wikitexte
  en / com  le fichier de l'infobox est-il servi par en.wikipedia / commons

Bibliothèque standard uniquement.
"""

import argparse
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLUBS = ROOT / "data" / "clubs.json"

API = "https://en.wikipedia.org/w/api.php"
EN_FILEPATH = "https://en.wikipedia.org/wiki/Special:FilePath/"
COMMONS_FILEPATH = "https://commons.wikimedia.org/wiki/Special:FilePath/"
UA = "soccerquiz-crest-diagnostic/1.0 (https://github.com/Sleeplow/soccerquiz)"
TIMEOUT = 30

# Un panachage de clubs qui échouaient et de clubs qui passaient : c'est la
# comparaison entre les deux qui est informative.
SAMPLE = ["arsenal", "chelsea", "atletico-madrid", "porto", "zenit", "club-america",
          "barcelona", "psg", "dortmund"]


def call(params):
    query = urllib.parse.urlencode({**params, "format": "json", "formatversion": "2"})
    request = urllib.request.Request(f"{API}?{query}", headers={"User-Agent": UA})
    with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
        return json.loads(response.read())


def first_page(data):
    pages = data.get("query", {}).get("pages", [])
    return pages[0] if pages else {}


def pageimage(title, license_):
    try:
        page = first_page(call({
            "action": "query", "prop": "pageimages", "piprop": "thumbnail",
            "pithumbsize": "256", "pilicense": license_, "redirects": "1", "titles": title,
        }))
        source = (page.get("thumbnail") or {}).get("source")
        return Path(urllib.parse.urlparse(source).path).name if source else None
    except Exception as exc:
        return f"!{type(exc).__name__}"


def pageprops(title):
    try:
        page = first_page(call({
            "action": "query", "prop": "pageprops",
            "ppprop": "page_image|page_image_free", "redirects": "1", "titles": title,
        }))
        props = page.get("pageprops", {})
        return props.get("page_image") or props.get("page_image_free") or None
    except Exception as exc:
        return f"!{type(exc).__name__}"


def infobox_image(title):
    """Lit le champ image de l'infobox dans le wikitexte de la section 0."""
    try:
        page = first_page(call({
            "action": "query", "prop": "revisions", "rvprop": "content",
            "rvslots": "main", "rvsection": "0", "redirects": "1", "titles": title,
        }))
        revisions = page.get("revisions") or []
        if not revisions:
            return None
        text = revisions[0]["slots"]["main"]["content"]
        match = re.search(
            r"^\s*\|\s*(?:image|logo|crest|badge)\s*=\s*(?:\[\[)?(?:File:|Image:)?([^\n|\]}]+)",
            text, re.IGNORECASE | re.MULTILINE)
        return match.group(1).strip() if match else None
    except Exception as exc:
        return f"!{type(exc).__name__}"


def serves(base, filename):
    """Le fichier est-il réellement servi par cet hébergement ?"""
    if not filename or filename.startswith("!"):
        return "-"
    url = base + urllib.parse.quote(filename.replace(" ", "_")) + "?width=64"
    request = urllib.request.Request(url, headers={"User-Agent": UA}, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            kind = response.headers.get("Content-Type", "")
            return "oui" if kind.startswith("image/") else f"non({kind[:18]})"
    except urllib.error.HTTPError as exc:
        return f"non({exc.code})"
    except Exception as exc:
        return f"non({type(exc).__name__})"


def shorten(value, width=34):
    if value is None:
        return "—"
    value = str(value)
    return value if len(value) <= width else value[:width - 1] + "…"


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("clubs", nargs="*", help="identifiants de clubs ; par défaut, un échantillon")
    parser.add_argument("--all", action="store_true", help="tous les clubs du référentiel")
    args = parser.parse_args()

    clubs = json.loads(CLUBS.read_text(encoding="utf-8"))["clubs"]
    if args.all:
        wanted = list(clubs)
    elif args.clubs:
        wanted = args.clubs
    else:
        wanted = [c for c in SAMPLE if c in clubs]

    unknown = [c for c in wanted if c not in clubs]
    if unknown:
        print(f"Identifiants inconnus : {', '.join(unknown)}", file=sys.stderr)
        return 1

    print(f"API : {API}\n")
    for cid in wanted:
        club = clubs[cid]
        title = club.get("wiki")
        print(f"── {cid} · {club['name']} · article « {title} »")
        if not title:
            print("   pas de champ `wiki`\n")
            continue

        free = pageimage(title, "free")
        any_ = pageimage(title, "any")
        props = pageprops(title)
        infobox = infobox_image(title)

        print(f"   free      : {shorten(free)}")
        print(f"   any       : {shorten(any_)}")
        print(f"   pageprops : {shorten(props)}")
        print(f"   infobox   : {shorten(infobox)}")
        if infobox:
            print(f"   servi par : en.wikipedia={serves(EN_FILEPATH, infobox)}"
                  f" · commons={serves(COMMONS_FILEPATH, infobox)}")
        print()

    print("Copier cette sortie telle quelle : elle dit quelle voie de résolution "
          "fonctionne réellement, et sur quel hébergement.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

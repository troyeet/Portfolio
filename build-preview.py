#!/usr/bin/env python3
"""Build preview-offline.html: the whole home page in one file, models included.

Browsers block fetch() on file:// URLs, so the hosted site cannot show its
viewports when you just double-click index.html. This inlines the stylesheet,
the script, every .glb the page asks for (as base64), the portrait and the
résumé into a single document that opens with no server at all.

Nothing here is a list you have to maintain. The models are discovered by
reading index.html: MODEL_URL in script.js for the hero, and the data-model
attribute of each piece on the shelf. Add a model to the page and it turns up
here on the next run.

It is a convenience for looking at the site locally. Deploy the real folder.

    python build-preview.py
"""

import base64
import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
OUT = HERE / "preview-offline.html"


def read(name):
    p = HERE / name
    if not p.exists():
        sys.exit(f"missing {name} — run this from the portfolio folder")
    return p.read_text(encoding="utf-8")


def data_url(relpath, mime):
    """Turn a file on disk into a data: URL so it survives with no server."""
    p = HERE / relpath
    if not p.exists():
        sys.exit(f"missing {relpath} — update this script if it moved")
    return f"data:{mime};base64," + base64.b64encode(p.read_bytes()).decode("ascii")


def swap(html, needle, replacement, what):
    if needle not in html:
        sys.exit(f"index.html no longer contains {what} — update this script")
    return html.replace(needle, replacement)


def model_urls(html, js):
    """Every .glb the page will ask for, in the order it will ask for them."""
    found = []
    hero = re.search(r"MODEL_URL\s*=\s*['\"]([^'\"]+\.glb)['\"]", js)
    if not hero:
        sys.exit("could not find MODEL_URL in script.js — update this script")
    found.append(hero.group(1))
    found += re.findall(r'data-model="([^"]+\.glb)"', html)

    seen, urls = set(), []
    for u in found:
        if u in seen:
            continue
        seen.add(u)
        if not (HERE / u).exists():
            sys.exit(f"the page asks for {u}, which is not on disk")
        urls.append(u)
    return urls


def main():
    html = read("index.html")
    css = read("styles.css")
    js = read("script.js")

    urls = model_urls(html, js)

    link = '<link rel="stylesheet" href="styles.css">'
    tag = '<script src="script.js"></script>'
    for needle in (link, tag):
        if needle not in html:
            sys.exit(f"index.html no longer contains {needle!r} — update this script")

    html = html.replace(link, "<style>\n" + css + "\n</style>")

    # The portrait and the résumé are ordinary file:// references, which do work
    # on a double-click — but only while this file sits next to img/ and resume/.
    # Inlining them keeps the single file genuinely single.
    html = swap(html,
                'src="img/jeth-delos-santos.jpg"',
                'src="' + data_url("img/jeth-delos-santos.jpg", "image/jpeg") + '"',
                "the portrait src")
    html = swap(html,
                'href="resume/Jeth-Roy-Delos-Santos-Resume.pdf"',
                'href="' + data_url("resume/Jeth-Roy-Delos-Santos-Resume.pdf",
                                    "application/pdf") + '"',
                "the résumé href")

    # The models must be in the DOM before the script runs, so they go in first.
    # Each is keyed by the path it stands in for, which is how loadModel picks
    # the right one when the page has more than one. The type is not a known
    # script type, so the browser stores the element and does not run it.
    blocks = []
    for u in urls:
        b64 = base64.b64encode((HERE / u).read_bytes()).decode("ascii")
        blocks.append(
            f'<script data-glb="{u}" type="application/octet-stream">{b64}</script>'
        )
    inline = "\n".join(blocks) + "\n<script>\n" + js + "\n</script>"
    html = html.replace(tag, inline)

    note = (
        "<!-- Built by build-preview.py. Single file, models inlined, opens without\n"
        "     a server. Do not deploy this: it cannot be cached in pieces, and every\n"
        "     visitor would pay for all of it. Upload the folder instead. -->\n"
    )
    html = html.replace("<!doctype html>", "<!doctype html>\n" + note, 1)

    OUT.write_text(html, encoding="utf-8")
    inlined = ", ".join(urls)
    print(f"wrote {OUT.name}  ({OUT.stat().st_size / 1_000_000:.1f} MB)")
    print(f"  inlined: {inlined}")


if __name__ == "__main__":
    main()

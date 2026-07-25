#!/usr/bin/env python3
"""
Build the single-file MGS Stage Editor (PSX) from this modular source tree.

  python build.py [output.html]

It concatenates, in the order recorded in build_manifest.json:
  template/head.html
  for each block:  <script> + <block file contents> + </script> + separator
  template/tail.html

Editing rules:
  * App logic lives in src/*.js (one file per <script> block, named by its
    original `// FILE:` marker). Edit these freely.
  * vendor/*.js are third-party libraries (Three.js, JSZip, pako, ...). Leave
    them alone unless upgrading a library.
  * Keep each src/*.js file as the body of one <script> block — do not add
    literal `</script>` inside any file (the browser would close the tag early).
"""
import json, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else "MGS_Stage_Editor_PSX_built.html"

man = json.load(open(os.path.join(ROOT, "build_manifest.json")))

def read(p):
    return open(os.path.join(ROOT, p), "r", encoding="utf-8").read()

parts = [read(man["head"])]
for b in man["blocks"]:
    parts.append("<script>")
    parts.append(read(b["file"]))
    parts.append("</script>")
    parts.append(b.get("sep_after", ""))
parts.append(read(man["tail"]))

html = "".join(parts)
open(OUT, "w", encoding="utf-8").write(html)
print("wrote %s (%d bytes, %d blocks)" % (OUT, len(html.encode("utf-8")), len(man["blocks"])))

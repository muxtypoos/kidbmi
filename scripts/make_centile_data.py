#!/usr/bin/env python3
"""
Builds src/data/rcpch-bmi-centiles.json from the RCPCH growth chart reference data.

Source: rcpch/digital-growth-charts-server, chart-data/cole-nine-centiles-uk-who-{male,female}-bmi.json
        (commit 29bb4e9e9d93a850a63d5233b927472f808fb9a8, AGPL-3.0 repository; reference: UK-WHO 2-4 years, UK90 4-20 years).
Usage:  python3 scripts/make_centile_data.py /path/to/digital-growth-charts-server
Output: {"M"|"F": {"c04"|"c2"|"c9"|"c25"|"c50"|"c75"|"c91"|"c98"|"c996": [[ [age, BMI], ... ] under 4 y, [ [age, BMI], ... ] from 4 y ]}}
"""
import json, os, sys
src = sys.argv[1]
NAMES = {0.4: "c04", 2.0: "c2", 9.0: "c9", 25.0: "c25", 50.0: "c50", 75.0: "c75", 91.0: "c91", 98.0: "c98", 99.6: "c996"}
out = {}
for S, sex in (("M", "male"), ("F", "female")):
    d = json.load(open(os.path.join(src, "chart-data", "cole-nine-centiles-uk-who-%s-bmi.json" % sex)))
    refs = {}
    for blk in d:
        refs.update(blk)
    out[S] = {}
    for line_i in range(9):
        segs = []
        for ref in ("uk_who_child", "uk90_child"):
            line = refs[ref][sex]["bmi"][line_i]
            name = NAMES[line["centile"]]
            segs.append([[round(p["x"], 4), round(p["y"], 4)] for p in line["data"]])
        out[S][name] = segs
json.dump(out, open(os.path.join(os.path.dirname(__file__), "..", "src", "data", "rcpch-bmi-centiles.json"), "w"), separators=(",", ":"))
print("written", {S: {k: [len(s) for s in v] for k, v in out[S].items()} for S in out}["M"])

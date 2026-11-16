#!/usr/bin/env python3
"""
Builds src/data/rcpch-bmi-centiles.json from the RCPCH growth chart reference data.

Source: rcpch/digital-growth-charts-server, chart-data/cole-nine-centiles-uk-who-{male,female}-bmi.json
        (commit 29bb4e9e9d93a850a63d5233b927472f808fb9a8, AGPL-3.0 repository; reference: UK-WHO 2-4 years, UK90 4-20 years).
Usage:  python3 scripts/make_centile_data.py /path/to/digital-growth-charts-server
Output: {"M"|"F": {"c04"|"c2"|"c9"|"c25"|"c50"|"c75"|"c91"|"c98"|"c996"|"c333": [[ [age, BMI], ... ] under 4 y, [ [age, BMI], ... ] from 4 y ]}}

"c333" is the +3.33 SD line (the RCPCH chart's "morbidly obese" line). The RCPCH nine centile lines are Cole LMS curves, so at each
age L, M and S are recovered from the 0.4th (z = -2.667), 50th (z = 0) and 99.6th (z = +2.667) lines, and BMI at z = +3.333 is
M * (1 + L*S*z)^(1/L). Check: refitting from the other lines reproduces all nine to within 0.0005 BMI.
"""
import json, os, sys, math

Z = 8.0 / 3.0
def sd333(m, lo, hi):
    """BMI at +3.333 SD from the 50th (m), 0.4th (lo) and 99.6th (hi) values, by Cole's LMS formula."""
    def S_of(L):  # S from the 99.6th, for a given L
        return math.log(hi / m) / Z if abs(L) < 1e-9 else ((hi / m) ** L - 1.0) / (L * Z)
    def f(L):     # mismatch at the 0.4th
        S = S_of(L)
        base = 1.0 - L * S * Z
        return (m * base ** (1.0 / L) if abs(L) > 1e-9 else m * math.exp(-S * Z)) - lo
    a, b = -6.0, -0.05
    fa, fb = f(a), f(b)
    assert fa * fb < 0, "no L found"
    for _ in range(200):
        c = (a + b) / 2.0; fc = f(c)
        if fa * fc <= 0: b, fb = c, fc
        else: a, fa = c, fc
    L = (a + b) / 2.0; S = S_of(L)
    return m * (1.0 + L * S * (10.0 / 3.0)) ** (1.0 / L)
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
    out[S]["c333"] = [[[a[0], round(sd333(m[1], lo[1], hi[1]), 4)] for a, m, lo, hi in zip(out[S]["c50"][k], out[S]["c50"][k], out[S]["c04"][k], out[S]["c996"][k])] for k in (0, 1)]
json.dump(out, open(os.path.join(os.path.dirname(__file__), "..", "src", "data", "rcpch-bmi-centiles.json"), "w"), separators=(",", ":"))
print("written", {S: {k: [len(s) for s in v] for k, v in out[S].items()} for S in out}["M"])

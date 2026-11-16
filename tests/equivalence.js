/*
 * Equivalence test: KidBMI's engine must give the same answers as the Admix engine it was taken from.
 * Compares lean body weight (all five formulas and the cap; where KidBMI now says "implausible" Admix substitutes Janmahasatian, so those cases are only checked to be genuinely under 25%), the Peters
 * formula and the RCPCH centile lookup over a wide grid of patients.
 *
 * Needs a copy of the Admix engine: set ADMIX_ENGINE=/path/to/admix/src/engine.js (or keep a clone at
 * ../muxtypoos/admix). Skipped, not failed, when no copy is found.
 * Run: node tests/equivalence.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const cand = [process.env.ADMIX_ENGINE, path.join(__dirname, "../../muxtypoos/admix/src/engine.js"), path.join(__dirname, "../../admix/src/engine.js")].filter(Boolean);
const found = cand.find((p) => fs.existsSync(p));
if (!found) { console.log("Admix engine not found: equivalence test skipped"); process.exit(0); }

const Ad = require(found), An = require("../src/engine.js"), CEN = require("../src/data/rcpch-bmi-centiles.json");
/* The Admix centile table was digitised from the chart images; KidBMI now uses the exact RCPCH values, so the 91st, 98th and 99.6th lines may differ by a few hundredths of a BMI unit (checked: under 0.06). */
const ADCEN = JSON.parse(fs.readFileSync(path.join(path.dirname(found), "data/rcpch-bmi-centiles.json"), "utf8"));
let n = 0, bad = 0;
const same = (what, a, b, ctx) => { n++; if (!(Math.abs(a - b) < 1e-9)) { bad++; if (bad < 15) console.log("DIFF", what, ctx, a, b); } };

for (const f of ["jan", "boer", "james", "hume", "peters"])
  for (const male of [true, false])
    for (let w = 3; w <= 250; w += 3.7)
      for (let H = 50; H <= 220; H += 7.3) {
        const hm = H / 100, bmi = w / (hm * hm);
        const r = An.lbw(f, w, H, male), raw = Ad.lbwRaw(f, w, H, male, bmi);
        if (r.implausible) { n++; if (!(raw < 0.25 * w || isNaN(raw))) { bad++; console.log("DIFF implausible", f, male, w, H); } }
        else same("lbw()", Ad.lbwF(f, w, hm, male, bmi), r.value, [f, male, w, H].join());
        same("lbwRaw", Ad.lbwRaw(f, w, H, male, bmi), An.lbwRaw(f, w, H, male, bmi), [f, male, w, H].join());
      }
for (const s of ["M", "F"]) for (const k of ["c91", "c98", "c996"]) for (let a = 0.5; a <= 25; a += 0.07)
  { n++; const x = Ad.cen(ADCEN, s, k, a), y = An.cen(CEN, s, k, a); if (!(Math.abs(x - y) < 0.06)) { bad++; if (bad < 15) console.log("DIFF cen", s, k, a, x, y); } }
for (const u of ["d", "w", "m", "y"]) for (let v = 0; v < 50; v += 1.3) same("age", Ad.ageYears(v, u, true), An.ageYears(v, u), u + v);

/* Admix paediatric classification on a grid vs KidBMI */
for (const male of [true, false]) for (let a = 2; a <= 20; a += 0.9) for (let b = 12; b <= 40; b += 1.7) {
  const hm = 1.2 + a * 0.03, w = b * hm * hm;
  const P = Ad.patient({ w, h: hm, age: a, male, PM: true, WM: "auto", S: { lbw: "jan", lbwP: "peters", pc: "c98", bmi: 30, blend: true, hold: false }, CEN: ADCEN });
  const r = An.paediatric(CEN, { w, hcm: hm * 100, age: a, male });
  /* wording differs slightly (KidBMI adds "centile"), so compare the category */
  const cat = (t) => /^severely obese/.test(t) ? 3 : /^obese/.test(t) ? 2 : /^overweight/.test(t) ? 1 : 0;
  const nearEdge = ["c91", "c98", "c996"].some((k) => Math.abs(r.bmi - r.cc[k]) < 0.06);
  n++; if (!nearEdge && cat(P.band) !== cat(r.band)) { bad++; if (bad < 15) console.log("DIFF band", male, a, b, P.band, r.band); }
}
console.log(n + " comparisons against " + found + ": " + (bad ? bad + " DIFFERENT" : "all agree (centile lines within 0.06 BMI)"));
process.exit(bad ? 1 : 0);

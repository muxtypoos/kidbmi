#!/usr/bin/env node
/*
 * KidBMI self-test file.
 *
 * Writes selftest.csv: one row per calculation, readable in any spreadsheet. Each row shows the inputs,
 * what the app's engine calculates (exactly what appears on screen), and an independent re-calculation
 * done a different way in this file (logarithms for Peters, its own centile interpolation). The last
 * column says whether the two agree.
 *
 * Three groups of rows:
 *   growth path   age, height and weight all rise steadily together from 2 to 20 years (both sexes)
 *   grid          every combination of steadily rising ages, heights and weights (both sexes)
 *   extremes      tiny, huge, zero, missing, negative, wrong-unit and out-of-range values
 *
 * Usage: node scripts/selftest.js          write selftest.csv
 *        node scripts/selftest.js --check  fail if selftest.csv is out of date or any row disagrees
 */
"use strict";
const fs = require("fs");
const path = require("path");
const E = require("../src/engine.js");
const CEN = require("../src/data/rcpch-bmi-centiles.json");
const OUT = path.join(__dirname, "..", "selftest.csv");

/* ---------- independent re-calculation (deliberately not using the engine's code) ---------- */
function indepECV(w, h) { return Math.exp(Math.log(0.0215) + 0.6469 * Math.log(w) + 0.7236 * Math.log(h)); }
function indepCentile(sex, line, age) {
  const seg = CEN[sex][line][age < 4 ? 0 : 1];
  if (age <= seg[0][0]) return seg[0][1];
  const last = seg[seg.length - 1];
  if (age >= last[0]) return last[1];
  let k = 0; while (!(seg[k][0] <= age && age <= seg[k + 1][0])) k++;
  const t = (age - seg[k][0]) / (seg[k + 1][0] - seg[k][0]);
  return seg[k][1] * (1 - t) + seg[k + 1][1] * t;
}
function indepBand(bmi, c) { return bmi >= c.c996 ? "severely obese" : bmi >= c.c98 ? "obese" : bmi >= c.c91 ? "overweight" : bmi < c.c04 ? "very underweight" : bmi < c.c2 ? "underweight" : "usual range"; }
const bandShort = (b) => (/^severely obese/.test(b) ? "severely obese" : /^obese/.test(b) ? "obese" : /^overweight/.test(b) ? "overweight" : /^very underweight/.test(b) ? "very underweight" : /^underweight/.test(b) ? "underweight" : "usual range");
const LINEDEFS = [["c04", "0.4th"], ["c2", "2nd"], ["c9", "9th"], ["c25", "25th"], ["c50", "50th"], ["c75", "75th"], ["c91", "91st"], ["c98", "98th"], ["c996", "99.6th"]];

/* ---------- what the screen does with typed values ---------- */
const typed = (s) => { const v = parseFloat(s); return v > 0 ? v : 0; };
const f1 = (v) => E.fl(v, 1).toFixed(1); /* lean weight: rounded down */
const n1 = (v) => E.rd(v, 1).toFixed(1); /* BMI and centiles: rounded to nearest */
const r2 = (v) => (Math.round(v * 100) / 100).toFixed(2);

const HEAD = ["group", "row", "sex", "age_years", "weight_kg", "height_cm", "status",
  "BMI", "BMI_shown_in_app", "Peters_ECV_litres", "Peters_LBW_kg", "LBW_shown_in_app_kg", "LBW_percent_of_weight", "LBW_flag",
  "RCPCH_0.4th", "RCPCH_2nd", "RCPCH_9th", "RCPCH_25th", "RCPCH_50th", "RCPCH_75th", "RCPCH_91st", "RCPCH_98th", "RCPCH_99.6th", "RCPCH_band", "nearest_line", "BMI_minus_nearest_line",
  "independent_BMI", "independent_LBW_kg", "independent_band", "independent_nearest_line", "check"];

function row(group, n, sex, ageS, wS, hS) {
  const male = sex === "M", age = typed(ageS), w = typed(wS), hcm = typed(hS);
  const c = E.checks({ w, hcm, age, entered: { w: String(wS) !== "", h: String(hS) !== "", age: String(ageS) !== "" } });
  const o = { group, row: n, sex, age_years: ageS, weight_kg: wS, height_cm: hS };
  const blank = HEAD.slice(7).reduce((a, k) => (a[k] = "", a), {});
  Object.assign(o, blank);
  const missing = [!(w > 0) && "weight", !(hcm > 0) && "height", !(age > 0) && "age"].filter(Boolean);
  if (c.blocked) { o.status = "BLOCKED: " + c.messages.filter((m) => /paused|metres/.test(m)).join(" "); o.check = "PASS"; return o; }
  if (missing.length) { o.status = "NOT CALCULATED: needs " + missing.join(", "); o.check = "PASS"; return o; }
  o.status = c.messages.length ? "WARNING: " + c.messages.join(" ") : "OK";

  /* the app */
  const bmi = E.bmi(w, hcm), L = E.lbw(w, hcm), ecv = E.petersECV(w, hcm);
  const P = E.paediatric(CEN, { w, hcm, age, male });
  o.BMI = r2(bmi); o.BMI_shown_in_app = n1(bmi);
  o.Peters_ECV_litres = r2(ecv); o.Peters_LBW_kg = r2(L.value); o.LBW_shown_in_app_kg = f1(L.value);
  o.LBW_percent_of_weight = r2(100 * L.value / w);
  o.LBW_flag = L.implausible ? "IMPLAUSIBLE (under 25% of weight)" : L.capped ? "capped at total weight" : "";
  if (P.ok) { LINEDEFS.forEach(([k, nm]) => { o["RCPCH_" + nm] = r2(P.cc[k]); }); o.RCPCH_band = P.band; o.nearest_line = P.nearest.name; o.BMI_minus_nearest_line = (P.nearest.diff >= 0 ? "+" : "") + r2(P.nearest.diff); }
  else o.RCPCH_band = "not on chart: " + P.reason;

  /* independent check */
  const sx = male ? "M" : "F", ibmi = w / ((hcm / 100) * (hcm / 100)), iraw = 3.8 * indepECV(w, hcm);
  const iLbw = Math.max(0, Math.min(w, iraw)), iImpl = !(iraw >= 0.25 * w), iCap = iraw > w;
  o.independent_BMI = r2(ibmi); o.independent_LBW_kg = r2(iLbw);
  let ok = Math.abs(ibmi - bmi) < 1e-9 && Math.abs(iLbw - L.value) < 1e-9 && Math.abs(indepECV(w, hcm) - ecv) < 1e-9 && iImpl === L.implausible && iCap === L.capped;
  if (P.ok) {
    const ic = {}; LINEDEFS.forEach(([k]) => { ic[k] = indepCentile(sx, k, age); });
    o.independent_band = indepBand(ibmi, ic);
    const cand = LINEDEFS.map(([k, nm]) => [nm, ic[k]]).sort((p, q) => Math.abs(ibmi - p[1]) - Math.abs(ibmi - q[1]) || p[1] - q[1]);
    o.independent_nearest_line = cand[0][0];
    ok = ok && o.independent_nearest_line === P.nearest.name && o.independent_band === bandShort(P.band) && LINEDEFS.every(([k]) => Math.abs(ic[k] - P.cc[k]) < 1e-9);
  } else {
    o.independent_band = (age < 2 || age > 20) ? "not on chart" : "";
    ok = ok && (age < 2 || age > 20);
  }
  o.check = ok ? "PASS" : "FAIL";
  return o;
}

function build() {
  const rows = []; let n = 0;
  const add = (...a) => rows.push(row(a[0], ++n, ...a.slice(1)));

  /* 1. growth path: age 2 to 20 in steps of 0.05 y; height and weight rise steadily with age */
  for (const sex of ["M", "F"])
    for (let i = 0; i <= 360; i++) {
      const t = i / 360, age = 2 + 18 * t;
      add("growth path", sex, age.toFixed(2), (11 + 61 * t).toFixed(1), (85 + 90 * t).toFixed(1));
    }

  /* 2. grid: age 2..20 (step 2), height 50..200 cm (step 15), weight 5..150 kg (step 5 to 50, then 10) */
  const ages = [], hs = [], ws = [];
  for (let a = 2; a <= 20; a += 2) ages.push(a);
  for (let h = 50; h <= 200; h += 15) hs.push(h);
  for (let w = 5; w <= 50; w += 5) ws.push(w);
  for (let w = 60; w <= 150; w += 10) ws.push(w);
  for (const sex of ["M", "F"]) for (const a of ages) for (const h of hs) for (const w of ws) add("grid", sex, String(a), String(w), String(h));

  /* 3. extremes */
  const X = [
    ["smallest plausible child", "2", "8", "70"], ["tiny weight", "2", "0.3", "70"], ["very light for height", "10", "10", "150"],
    ["very heavy for height", "10", "90", "120"], ["extreme obesity", "15", "250", "170"], ["BMI over 100", "12", "250", "100"],
    ["exactly 2 years", "2", "12", "87"], ["just under 2 years", "1.99", "12", "87"], ["newborn (0.08 y)", "0.08", "3.5", "50"], ["6 months", "0.5", "7.5", "67"],
    ["exactly 4 years (chart switches reference)", "4", "16", "102"], ["just under 4 years", "3.99", "16", "102"],
    ["exactly 20 years", "20", "65", "170"], ["just over 20 years", "20.01", "65", "170"], ["adult 40 years", "40", "70", "175"], ["age 120", "120", "70", "170"], ["age 150", "150", "70", "170"],
    ["tallest allowed", "18", "100", "250"], ["height over 250", "18", "100", "251"], ["height 300", "18", "100", "300"],
    ["height typed in metres", "10", "35", "1.4"], ["height 4 cm", "10", "35", "4"], ["height 5 cm", "10", "35", "5"], ["height 29 cm", "2", "10", "29"],
    ["weight 300 (allowed)", "18", "300", "180"], ["weight 301", "18", "301", "180"], ["weight 1000", "18", "1000", "180"],
    ["missing weight", "10", "", "140"], ["missing height", "10", "35", ""], ["missing age", "", "35", "140"], ["everything missing", "", "", ""],
    ["weight zero", "10", "0", "140"], ["height zero", "10", "35", "0"], ["age zero", "0", "35", "140"],
    ["negative weight", "10", "-35", "140"], ["negative height", "10", "35", "-140"], ["negative age", "-10", "35", "140"],
    ["not a number", "10", "abc", "140"], ["text with a comma (reads as 35)", "10", "35,5", "140"],
    ["thin child (very underweight)", "10", "20", "140"], ["thin child (underweight)", "10", "26", "140"], ["thin toddler", "3", "10", "95"], ["thin teenager", "16", "40", "175"], ["thin at the age 4 switch", "4", "12", "102"],
    ["tiny fractions", "2", "0.001", "0.001"], ["huge numbers", "1000", "100000", "100000"], ["very large age and height only", "99999", "35", "140"],
  ];
  for (const sex of ["M", "F"]) for (const [name, a, w, h] of X) add("extremes: " + name, sex, a, w, h);
  return rows;
}

const q = (v) => { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const rows = build();
const csv = [HEAD.join(",")].concat(rows.map((r) => HEAD.map((k) => q(r[k])).join(","))).join("\n") + "\n";
const fails = rows.filter((r) => r.check !== "PASS");

if (process.argv.includes("--check")) {
  let bad = 0;
  if (fails.length) { bad++; console.log(fails.length + " rows FAIL, e.g.", JSON.stringify(fails[0])); }
  if (!fs.existsSync(OUT) || fs.readFileSync(OUT, "utf8") !== csv) { bad++; console.log("selftest.csv is out of date: run node scripts/selftest.js"); }
  console.log(rows.length + " rows, " + fails.length + " failing" + (bad ? "" : ", selftest.csv up to date"));
  process.exit(bad ? 1 : 0);
}
fs.writeFileSync(OUT, csv);
const by = {}; rows.forEach((r) => { const g = r.group.split(":")[0]; by[g] = (by[g] || 0) + 1; });
console.log("Wrote selftest.csv: " + rows.length + " rows (" + Object.entries(by).map(([k, v]) => k + " " + v).join(", ") + "), " + fails.length + " failing");
process.exit(fails.length ? 1 : 0);
